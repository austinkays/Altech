// js/migration-ui.js — Phase 4a: Firebase → Supabase E2E migration modal
//
// SESSION 1 SCOPE (shipped):
//   - Module skeleton + step navigation (welcome → reauth → passphrase →
//     recovery → running → done | error)
//   - Feature-flagged via STORAGE_KEYS.MIGRATION_ENABLED — zero impact on
//     users who don't set the flag.
//   - Re-auth step actually verifies the Firebase password (proves the
//     Firebase integration layer works).
//   - Passphrase + recovery-key steps wire CryptoHelper.createVault for the
//     new E2E key material — not yet persisted.
//   - Running step is stubbed; clicking "Start migration" transitions to the
//     error step with a clear "Pipeline not implemented yet (Session 2)"
//     message. Nothing in Firebase, Supabase, or localStorage is touched.
//
// SESSION 2 SCOPE (next):
//   - Real data pipeline: pull Firebase → decrypt → re-encrypt under
//     passphrase-derived MK → push ciphertext to Supabase → flip backend flag.
//   - Resume-on-crash via MIGRATION_STATE.
//   - Rollback semantics.
//
// SESSION 3 SCOPE:
//   - Admin "Migrate Team" panel.
//   - Automated tests against mock Firebase + mock Supabase.
//   - Lift the admin-only sync policy once SYNC_BACKEND='supabase'.
//
// Dependencies at runtime:
//   CryptoHelper, Auth, STORAGE_KEYS, App.toast
// Not yet wired (Session 2):
//   CloudSync (for Firebase pull), SupabaseAuth, SupabaseSync (for push),
//   SyncFacade.

window.MigrationUI = (() => {
    'use strict';

    // Ordered list of steps. A step is shown by toggling [data-step="N"]
    // visibility inside #migrationModal — same pattern as VaultUI.
    const STEPS = {
        welcome: 1,
        reauth: 2,
        passphrase: 3,
        recovery: 4,
        running: 5,
        done: 6,
        error: 7,
    };

    // In-memory transient state. Nothing sensitive is persisted to
    // localStorage beyond the progress flag — passphrase never touches disk.
    let _state = _freshState();

    function _freshState() {
        return {
            currentStep: 'welcome',
            reauthVerified: false,
            firebasePassword: null,    // captured at reauth, reused for Supabase signup, cleared after pipeline
            passphrase: null,          // cleared as soon as vault is created
            recoveryKey: null,         // shown once, cleared after step 4
            cryptoMaterial: null,      // { passphraseSaltB64, passphraseWrappedMKB64, passphraseIterations, recoveryWrappedMKB64, recoveryKeyPlaintext }
            firebaseSnapshot: null,    // populated by _pullFreshFromFirebase + _loadLocalDocs
            error: null,
        };
    }

    // ── Flag + visibility ────────────────────────────────────────────────

    function isEnabled() {
        try { return localStorage.getItem(STORAGE_KEYS.MIGRATION_ENABLED) === '1'; }
        catch { return false; }
    }

    function migrationState() {
        try { return localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE) || 'not-started'; }
        catch { return 'not-started'; }
    }

    function _setMigrationState(state) {
        try { localStorage.setItem(STORAGE_KEYS.MIGRATION_STATE, state); } catch { /* ignore */ }
    }

    // ── Dry-run mode (Phase D-2 prep) ────────────────────────────────────
    // When this flag is set, the Session 2 pipeline will perform every
    // step (decrypt → re-encrypt → push to Supabase) EXCEPT the final
    // SYNC_BACKEND flip. Lets an admin verify decryption works on the
    // copied data before committing the per-user backend switch.
    //
    // Session 2 contract (when it lands):
    //   1. Call MigrationBackup.snapshot() at the very start.
    //   2. Honor isDryRun() — skip the flag flip if true.
    //   3. On hard failure, call MigrationBackup.restore() and surface
    //      the error.
    function isDryRun() {
        try { return localStorage.getItem(STORAGE_KEYS.MIGRATION_DRY_RUN) === '1'; }
        catch { return false; }
    }

    // ── Modal plumbing (matches VaultUI pattern) ─────────────────────────

    function _q(sel) { return document.querySelector(sel); }

    function _goStep(name) {
        const modal = _q('#migrationModal');
        if (!modal) return;
        const n = STEPS[name];
        if (!n) return;
        _state.currentStep = name;
        modal.querySelectorAll('[data-step]').forEach(el => {
            el.style.display = (String(el.dataset.step) === String(n)) ? 'block' : 'none';
        });
        // Focus first input in the new step for keyboard usability.
        setTimeout(() => {
            const first = modal.querySelector(`[data-step="${n}"] input:not([type="hidden"]):not([disabled])`);
            if (first) first.focus();
        }, 50);
    }

    function _setError(msg) {
        const el = _q('#migrationModal .migration-error');
        if (el) {
            el.textContent = msg || '';
            el.style.display = msg ? 'block' : 'none';
        }
    }

    function _setBusy(busy) {
        const modal = _q('#migrationModal');
        if (!modal) return;
        modal.querySelectorAll('button, input').forEach(el => {
            el.disabled = !!busy;
        });
    }

    function open() {
        if (!isEnabled()) {
            console.warn('[MigrationUI] open() called but MIGRATION_ENABLED is off');
            return;
        }
        _state = _freshState();
        const modal = _q('#migrationModal');
        if (!modal) {
            console.error('[MigrationUI] #migrationModal not found in DOM');
            return;
        }
        modal.classList.add('active');
        modal.style.display = 'flex';

        // Resume-on-crash detection: if MIGRATION_STATE is 'in-progress' on
        // open, the previous run died mid-pipeline (browser closed, tab
        // crashed, etc.). The in-memory MK is gone, so we can't pick up
        // where we left off — instead, restore from the snapshot (if any)
        // and surface a clear message. The user re-runs the wizard from
        // the welcome step.
        if (migrationState() === 'in-progress') {
            let restoreNote = '';
            if (typeof MigrationBackup !== 'undefined' && MigrationBackup.exists && MigrationBackup.exists()) {
                try {
                    const stats = MigrationBackup.restore();
                    if (stats) restoreNote = ` Local data restored from snapshot (${stats.restored} keys).`;
                } catch (e) {
                    restoreNote = ' WARNING: snapshot restore failed: ' + ((e && e.message) || e);
                }
            }
            _setMigrationState('not-started');
            _state.error = 'A previous migration was interrupted before completing.' + restoreNote
                + ' Re-run the wizard from the beginning.';
            _setError(_state.error);
            _goStep('error');
            return;
        }

        _goStep('welcome');
    }

    function close() {
        const modal = _q('#migrationModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
        // Wipe any sensitive state on close — passphrase, recovery key, and
        // the Firebase password shouldn't survive modal dismissal.
        _state = _freshState();
        _setError('');
        // Reset form inputs.
        modal.querySelectorAll('input[type="password"], input[type="text"]').forEach(el => { el.value = ''; });
        modal.querySelectorAll('input[type="checkbox"]').forEach(el => { el.checked = false; });
    }

    // ── Step 1: Welcome ──────────────────────────────────────────────────

    function handleWelcomeContinue() {
        if (typeof Auth === 'undefined' || !Auth.isSignedIn) {
            _setError('You must be signed in before running the migration.');
            _goStep('error');
            return;
        }
        _goStep('reauth');
    }

    // ── Step 2: Re-auth (verifies current Firebase password) ─────────────
    // This is the one pipeline piece that ships in Session 1 — a working
    // Firebase call lets us exercise the auth integration immediately.

    async function handleReauthSubmit(event) {
        event.preventDefault();
        const passEl = _q('#migrationReauthPass');
        const password = passEl?.value || '';
        if (!password) {
            _setError('Enter your current password to continue.');
            return;
        }
        _setBusy(true);
        _setError('');
        try {
            const user = (typeof Auth !== 'undefined') ? Auth.user : null;
            if (!user || !user.email || typeof firebase === 'undefined') {
                throw new Error('Firebase user is unavailable.');
            }
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
            await user.reauthenticateWithCredential(credential);
            _state.reauthVerified = true;
            // Hold the firebase password in state so Session 2 can reuse it
            // for the Supabase signUp/signIn step. Cleared at end of pipeline
            // (success OR failure path) — never touches disk.
            _state.firebasePassword = password;
            if (passEl) passEl.value = '';
            _goStep('passphrase');
        } catch (e) {
            const msg = (e && e.code === 'auth/wrong-password')
                ? 'That password was incorrect. Try again.'
                : (e && e.message ? e.message : 'Password verification failed.');
            _setError(msg);
        } finally {
            _setBusy(false);
        }
    }

    // ── Step 3: Create encryption passphrase ─────────────────────────────

    async function handlePassphraseSubmit(event) {
        event.preventDefault();
        const p1 = _q('#migrationPass1')?.value || '';
        const p2 = _q('#migrationPass2')?.value || '';
        if (p1.length < 8) {
            _setError('Passphrase must be at least 8 characters.');
            return;
        }
        if (p1 !== p2) {
            _setError('Passphrases do not match.');
            return;
        }
        if (typeof CryptoHelper === 'undefined' || !CryptoHelper.createVault || !CryptoHelper.generateRecoveryKey || !CryptoHelper.wrapWithRecoveryKey) {
            _setError('CryptoHelper is not available. Reload and try again.');
            return;
        }
        _setBusy(true);
        _setError('');
        try {
            // 1. createVault() generates a fresh 256-bit MK, wraps it under a
            //    passphrase-derived KEK, caches the unwrapped MK in memory.
            const vault = await CryptoHelper.createVault(p1);
            // 2. generateRecoveryKey() produces a 24-word-style display string.
            const recovery = CryptoHelper.generateRecoveryKey();
            // 3. wrapWithRecoveryKey() wraps the (still-in-memory) MK under
            //    a recovery-key-derived KEK so the user can unlock later.
            const recoveryWrap = await CryptoHelper.wrapWithRecoveryKey(recovery.bytes);

            _state.passphrase = p1;
            _state.cryptoMaterial = {
                passphraseSaltB64: vault.passphraseSaltB64,
                passphraseWrappedMKB64: vault.passphraseWrappedMKB64,
                passphraseIterations: vault.passphraseIterations,
                recoverySaltB64: recoveryWrap.recoverySaltB64,
                recoveryWrappedMKB64: recoveryWrap.recoveryWrappedMKB64,
                recoveryIterations: recoveryWrap.recoveryIterations,
            };
            _state.recoveryKey = recovery.display;

            const recoveryBox = _q('#migrationRecoveryKey');
            if (recoveryBox) recoveryBox.textContent = _state.recoveryKey;

            // Clear passphrase inputs immediately.
            const e1 = _q('#migrationPass1'); if (e1) e1.value = '';
            const e2 = _q('#migrationPass2'); if (e2) e2.value = '';
            _goStep('recovery');
        } catch (e) {
            _setError(e && e.message ? e.message : 'Failed to create vault.');
        } finally {
            _setBusy(false);
        }
    }

    // ── Step 4: Recovery key shown + saved-confirmation ──────────────────

    function downloadRecoveryKey() {
        const key = _state.recoveryKey;
        if (!key) return;
        const email = (typeof Auth !== 'undefined' && Auth.email) ? Auth.email : 'unknown';
        const body = [
            'ALTECH TOOLKIT — E2E ENCRYPTION RECOVERY KEY',
            '─────────────────────────────────────────────',
            `Account: ${email}`,
            `Generated: ${new Date().toISOString()}`,
            '',
            'RECOVERY KEY:',
            key,
            '',
            'Save this in a password manager or somewhere safe. This is the',
            'ONLY way to unlock your client data if you forget your passphrase.',
            'Without it, your data cannot be recovered — not even by us.',
        ].join('\n');
        const blob = new Blob([body], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'altech-recovery-key.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    function copyRecoveryKey() {
        const key = _state.recoveryKey;
        if (!key) return;
        try {
            navigator.clipboard.writeText(key);
            if (typeof App !== 'undefined' && App.toast) App.toast('Recovery key copied', 1500);
        } catch { /* ignore */ }
    }

    function handleRecoveryContinue(event) {
        event.preventDefault();
        const check = _q('#migrationRecoverySaved');
        if (!check || !check.checked) {
            _setError('Please confirm you saved the recovery key.');
            return;
        }
        _setError('');
        _goStep('running');
        // Kick off the pipeline. Session 1 = stub; Session 2 = real work.
        runMigration();
    }

    // ── Step 5: Running the migration pipeline ───────────────────────────
    //
    // Session 2 pipeline. The contract:
    //   1. MigrationBackup.snapshot() — full localStorage rollback latch.
    //   2. CloudSync.pullFromCloud() — make sure local has the latest before
    //      we decrypt + re-push. Tolerated to fail (we still have local).
    //   3. _loadLocalDocs() — read every migrated docKey out of localStorage,
    //      decrypt legacy v1 ciphertext where applicable, return plaintext map.
    //   4. _ensureSupabaseAccount() — signUp (or signIn if already exists) with
    //      the user's Firebase email + reauth password. Single source of
    //      identity post-migration.
    //   5. VaultMeta.save(_state.cryptoMaterial) — writes wrapped MK + KDF
    //      metadata to public.user_crypto_meta so future devices can unlock.
    //   6. Temporarily flip SYNC_BACKEND='supabase' so SupabaseSync.pushBlob
    //      stops being a no-op.
    //   7. _pushAllToSupabase(plaintextMap) — encryptForRow (v=2 AAD-bound
    //      envelope) + pushBlob/pushQuote per doc.
    //   8. _verifyRoundTrip — pull one blob back, decrypt, assert match.
    //   9. _finalize — if dry-run, revert SYNC_BACKEND. Otherwise set
    //      E2E_CRYPTO_V2='1' and mark the Firebase profile migrated=true.
    //
    // Resume-on-crash: MIGRATION_STATE = 'in-progress' is set at step 1 and
    // only cleared on completion or error. open() detects a stale
    // 'in-progress' on next launch and offers MigrationBackup.restore().
    //
    // Failure path: any thrown error → MigrationBackup.restore() puts
    // localStorage back exactly as it was, SYNC_BACKEND is reverted if we
    // flipped it, and the error step shows what went wrong.

    async function runMigration() {
        _state.error = null;
        _setMigrationState('in-progress');
        _updateProgress(0, 'Starting…');

        let snapshotTaken = false;
        let backendFlipped = false;
        const prevBackend = _safeGetLS(STORAGE_KEYS.SYNC_BACKEND);

        try {
            // 1. Snapshot every altech_* localStorage value so any failure
            //    after this point is fully recoverable.
            _updateProgress(5, 'Backing up local data…');
            if (typeof MigrationBackup !== 'undefined' && MigrationBackup.snapshot) {
                MigrationBackup.snapshot();
                snapshotTaken = true;
            }

            // 2. Pull fresh from Firebase so localStorage reflects whatever's
            //    on the server (handles "data only on cloud" edge case).
            //    Tolerated to fail — local is still our source of truth.
            _updateProgress(15, 'Pulling latest from Firebase…');
            await _pullFreshFromFirebase();

            // 3. Read every doc we plan to migrate out of localStorage,
            //    decrypting legacy v1 ciphertext where applicable.
            _updateProgress(30, 'Decrypting with current key…');
            const { docs, quotes } = await _loadLocalDocs();
            _state.firebaseSnapshot = { docCount: Object.keys(docs).length, quoteCount: quotes.length };

            // 4. Sign up (or sign in) to Supabase with the Firebase email +
            //    reauth password. After this, SupabaseAuth.user is populated
            //    and SupabaseSync.pushBlob can resolve a uid.
            _updateProgress(45, 'Setting up Supabase account…');
            await _ensureSupabaseAccount();

            // 5. Persist the new vault meta (passphrase + recovery wraps,
            //    KDF identifiers) to public.user_crypto_meta. Cross-device
            //    unlock starts working as soon as this row lands.
            _updateProgress(55, 'Saving vault metadata…');
            await _persistVaultMeta();

            // 6. Flip SYNC_BACKEND='supabase' so SupabaseSync exits no-op
            //    mode. We revert this in the dry-run path or on failure.
            _safeSetLS(STORAGE_KEYS.SYNC_BACKEND, 'supabase');
            backendFlipped = true;

            // 7. Re-encrypt every doc as a v=2 AAD-bound envelope and push.
            _updateProgress(70, 'Re-encrypting and uploading…');
            await _pushAllToSupabase(docs, quotes);

            // 8. Round-trip verify: pull one blob back, decrypt, confirm
            //    identity-bound AAD survives. Catches "wrong MK" silently.
            _updateProgress(85, 'Verifying decryption…');
            await _verifyRoundTrip(docs);

            // 9. Final flip — or revert in dry-run.
            const dryRun = isDryRun();
            if (dryRun) {
                _restoreBackend(prevBackend);
                backendFlipped = false;
                _updateProgress(100, 'Dry run complete — backend NOT flipped.');
                _setMigrationState('complete');
                _goStep('done');
                _annotateDoneStep('Dry run: data was copied + verified on Supabase, but your active backend is still Firebase.');
            } else {
                _safeSetLS(STORAGE_KEYS.E2E_CRYPTO_V2, '1');
                await _markFirebaseUserMigrated();
                _updateProgress(100, 'Migration complete!');
                _setMigrationState('complete');
                _goStep('done');
                _annotateDoneStep('Your data is now end-to-end encrypted on Supabase. The Firebase backend has been retired for this account.');
            }

            // Backup blob keeps a 30-day TTL — even on success we leave it,
            // so the user can roll back to pre-migration localStorage state
            // if Supabase decryption misbehaves on the next session.

            // Wipe sensitive transient state.
            _state.firebasePassword = null;
            _state.passphrase = null;
            _state.recoveryKey = null;
        } catch (e) {
            console.error('[MigrationUI] Pipeline failed:', e);
            const baseMsg = (e && e.message) ? e.message : 'Migration failed.';
            let restoreNote = '';

            // Revert any partial state so we're not stuck mid-flight.
            if (backendFlipped) _restoreBackend(prevBackend);
            if (snapshotTaken && typeof MigrationBackup !== 'undefined' && MigrationBackup.restore) {
                try {
                    const stats = MigrationBackup.restore();
                    if (stats) restoreNote = ` Local data restored from snapshot (${stats.restored} keys).`;
                } catch (re) {
                    restoreNote = ' WARNING: snapshot restore also failed: ' + ((re && re.message) || re);
                }
            }

            _state.error = baseMsg + restoreNote;
            _state.firebasePassword = null;
            _state.passphrase = null;
            _setError(_state.error);
            _setMigrationState('error');
            _goStep('error');
        }
    }

    function _updateProgress(pct, label) {
        const bar = _q('#migrationProgressBar');
        const text = _q('#migrationProgressLabel');
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        if (text) text.textContent = label || '';
    }

    function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function _safeGetLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
    function _safeSetLS(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
    function _safeRmLS(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

    function _restoreBackend(prev) {
        if (prev) _safeSetLS(STORAGE_KEYS.SYNC_BACKEND, prev);
        else _safeRmLS(STORAGE_KEYS.SYNC_BACKEND);
    }

    function _annotateDoneStep(msg) {
        const el = _q('#migrationDoneNote');
        if (el) el.textContent = msg || '';
    }

    // ── Pipeline helpers ─────────────────────────────────────────────────

    async function _pullFreshFromFirebase() {
        // Best-effort: if CloudSync.pullFromCloud throws (network blip,
        // Auth not ready, etc.), fall through and use whatever's already
        // local. The whole pipeline is recoverable via MigrationBackup, so
        // we don't escalate this.
        try {
            if (typeof CloudSync !== 'undefined' && typeof CloudSync.pullFromCloud === 'function') {
                await CloudSync.pullFromCloud();
            }
        } catch (e) {
            console.warn('[MigrationUI] pullFromCloud failed (continuing with local):', e && e.message);
        }
    }

    /**
     * Walk every docKey we plan to migrate out of localStorage. Try
     * decrypting first (legacy v1 ciphertext or v=2 envelope), fall back
     * to JSON.parse, fall back to the raw string. Returns a plaintext map.
     */
    async function _loadLocalDocs() {
        const docKeys = (typeof SupabaseSync !== 'undefined' && SupabaseSync.DOC_LOCAL_KEYS)
            ? SupabaseSync.DOC_LOCAL_KEYS
            : {};
        const out = {};

        for (const [docKey, lsKey] of Object.entries(docKeys)) {
            if (!lsKey) continue;
            const raw = _safeGetLS(lsKey);
            if (raw == null || raw === '') continue;
            out[docKey] = await _normalizeToPlaintext(raw);
        }

        // Quotes live as a single localStorage array (STORAGE_KEYS.QUOTES).
        // Each entry has either .data (encrypted ciphertext) or fields directly.
        const quotesRaw = _safeGetLS(STORAGE_KEYS.QUOTES);
        const quotes = [];
        if (quotesRaw) {
            let arr = null;
            try { arr = JSON.parse(quotesRaw); } catch { arr = null; }
            if (Array.isArray(arr)) {
                for (const q of arr) {
                    if (!q || typeof q !== 'object') continue;
                    // If the quote stores its body as ciphertext under .data,
                    // try decrypting it; else use the whole record as plaintext.
                    let body = q;
                    if (typeof q.data === 'string') {
                        const dec = await _tryDecrypt(q.data);
                        if (dec != null) body = { ...q, data: dec };
                    }
                    quotes.push({ id: q.id || null, body });
                }
            }
        }

        return { docs: out, quotes };
    }

    async function _normalizeToPlaintext(raw) {
        const dec = await _tryDecrypt(raw);
        if (dec != null && typeof dec === 'object') return dec;
        // Not encrypted — try JSON parse, else return the raw string.
        try { return JSON.parse(raw); } catch { return raw; }
    }

    async function _tryDecrypt(maybeCiphertext) {
        try {
            if (typeof CryptoHelper === 'undefined' || !CryptoHelper.decrypt) return null;
            const r = await CryptoHelper.decrypt(maybeCiphertext);
            return (r === undefined) ? null : r;
        } catch { return null; }
    }

    /**
     * Sign up to Supabase with the user's Firebase email + reauth password.
     * If the account already exists (return migration), fall back to signIn.
     * Throws on hard failure so the pipeline rolls back.
     */
    async function _ensureSupabaseAccount() {
        const email = (typeof Auth !== 'undefined' && Auth.email) ? Auth.email : null;
        const password = _state.firebasePassword;
        if (!email || !password) {
            throw new Error('Supabase signup requires email + reauth password — re-run the wizard from step 2.');
        }
        if (typeof SupabaseAuth === 'undefined') {
            throw new Error('SupabaseAuth not loaded.');
        }

        // Make sure the Supabase client is alive before we try to call it.
        if (typeof window !== 'undefined' && window.Supabase && typeof window.Supabase.init === 'function') {
            try { await window.Supabase.init(); } catch { /* SupabaseAuth.init also tries */ }
        }

        try {
            await SupabaseAuth.signUp(email, password);
        } catch (e) {
            const msg = String((e && e.message) || e || '');
            // Treat "user already exists" as a return migration — sign in instead.
            // Supabase v2 returns 422 with "User already registered" for the existing-user case.
            if (/already.*registered|already.*exists|user_already_exists/i.test(msg)) {
                await SupabaseAuth.signIn(email, password);
            } else {
                throw e;
            }
        }
    }

    async function _persistVaultMeta() {
        if (typeof VaultMeta === 'undefined' || !VaultMeta.save) {
            throw new Error('VaultMeta module not loaded.');
        }
        const m = _state.cryptoMaterial;
        if (!m || !m.passphraseSaltB64 || !m.passphraseWrappedMKB64) {
            throw new Error('Vault metadata is incomplete — was step 3 (passphrase) skipped?');
        }
        // Phase A defaults: argon2id-v1 + hkdf-v1. CryptoHelper.createVault
        // populates passphraseKdf/passphraseKdfParams/kdfTree on the return,
        // but the Session 1 caller stored only the legacy fields. Mirror the
        // current Phase A defaults so the saved row is identifiable.
        const partial = {
            passphraseSaltB64:      m.passphraseSaltB64,
            passphraseWrappedMKB64: m.passphraseWrappedMKB64,
            passphraseIterations:   m.passphraseIterations || null,
            passphraseKdf:          m.passphraseKdf || 'argon2id-v1',
            passphraseKdfParams:    m.passphraseKdfParams || null,
            recoverySaltB64:        m.recoverySaltB64 || null,
            recoveryWrappedMKB64:   m.recoveryWrappedMKB64 || null,
            recoveryIterations:     m.recoveryIterations || null,
            recoveryKdf:            m.recoveryKdf || (m.recoveryWrappedMKB64 ? 'argon2id-v1' : null),
            recoveryKdfParams:      m.recoveryKdfParams || null,
            kdfTree:                m.kdfTree || 'hkdf-v1',
        };
        await VaultMeta.save(partial);
    }

    async function _pushAllToSupabase(docs, quotes) {
        if (typeof SupabaseSync === 'undefined' || typeof SupabaseSync.pushBlob !== 'function') {
            throw new Error('SupabaseSync module not loaded.');
        }
        if (typeof CryptoHelper === 'undefined' || typeof CryptoHelper.encryptForRow !== 'function') {
            throw new Error('CryptoHelper.encryptForRow unavailable — did Phase A ship?');
        }
        const uid = await _supabaseUid();
        if (!uid) throw new Error('Could not resolve Supabase user id post-signup.');

        // Push each migrated doc as an AAD-bound v=2 envelope.
        for (const [docKey, plaintext] of Object.entries(docs)) {
            const identity = { table: 'user_blobs', rowId: docKey, userId: uid };
            const envelope = await CryptoHelper.encryptForRow(plaintext, identity);
            const r = await SupabaseSync.pushBlob(docKey, envelope, undefined, identity);
            if (!r || !r.ok) {
                throw new Error(`Push failed for ${docKey}: ${(r && r.error && r.error.message) || 'unknown'}`);
            }
        }

        // Push each quote. Quotes can have a server-assigned id when missing;
        // for migrated quotes we always have an id (they came from Firebase).
        for (const q of quotes) {
            if (!q.id) continue; // skip malformed
            const identity = { table: 'user_quotes', rowId: q.id, userId: uid };
            const envelope = await CryptoHelper.encryptForRow(q.body, identity);
            const r = await SupabaseSync.pushQuote(q.id, envelope, identity);
            if (!r || !r.ok) {
                throw new Error(`Push failed for quote ${q.id}: ${(r && r.error && r.error.message) || 'unknown'}`);
            }
        }
    }

    async function _verifyRoundTrip(docs) {
        const docKeys = Object.keys(docs);
        if (!docKeys.length) return; // nothing to verify
        const sampleKey = docKeys.includes('currentForm') ? 'currentForm' : docKeys[0];

        const uid = await _supabaseUid();
        if (!uid) throw new Error('Could not resolve Supabase user id for verification.');

        const fetched = await SupabaseSync.pullBlob(sampleKey);
        if (!fetched || !fetched.ciphertext) {
            throw new Error(`Verification pull returned nothing for ${sampleKey}.`);
        }

        const identity = { table: 'user_blobs', rowId: sampleKey, userId: uid };
        const decrypted = await CryptoHelper.decryptForRow(fetched.ciphertext, identity);
        if (decrypted == null) {
            throw new Error(`Verification decrypt failed for ${sampleKey} — AAD mismatch or wrong key.`);
        }

        // Cheap structural compare: serialize both sides and require equal
        // shape. We don't deep-walk because plaintext objects can have
        // non-deterministic key order; JSON.stringify with sorted keys is
        // overkill for a smoke test. The auth tag passing is the real check.
        const expected = JSON.stringify(docs[sampleKey]);
        const actual = JSON.stringify(decrypted);
        if (expected !== actual) {
            throw new Error(`Verification mismatch on ${sampleKey} — round-trip changed the payload.`);
        }
    }

    async function _supabaseUid() {
        if (typeof window === 'undefined' || !window.Supabase || !window.Supabase.client) return null;
        try {
            const { data } = await window.Supabase.client.auth.getSession();
            return (data && data.session && data.session.user && data.session.user.id) || null;
        } catch { return null; }
    }

    async function _markFirebaseUserMigrated() {
        // Best-effort: write { migrated: true, migratedAt: ... } to the
        // Firebase user profile so a future device can tell at signin time
        // that this account moved to Supabase. Failure here is non-fatal
        // (the SYNC_BACKEND flag on the device is the authoritative signal).
        try {
            if (typeof Auth === 'undefined' || !Auth.uid) return;
            if (typeof FirebaseConfig === 'undefined' || !FirebaseConfig.db) return;
            await FirebaseConfig.db
                .collection('users').doc(Auth.uid)
                .collection('profile').doc('main')
                .set({
                    migratedToSupabase: true,
                    migratedAt: new Date().toISOString(),
                }, { merge: true });
        } catch (e) {
            console.warn('[MigrationUI] mark migrated flag failed (non-fatal):', e && e.message);
        }
    }

    // ── Step 6: Done ─────────────────────────────────────────────────────

    function handleDoneClose() {
        close();
        // Session 2 will soft-reload here to re-read SYNC_BACKEND from flags.
    }

    // ── Step 7: Error ────────────────────────────────────────────────────

    function handleErrorRetry() {
        _setError('');
        _goStep('welcome');
    }

    // ── Public API ───────────────────────────────────────────────────────

    return {
        isEnabled,
        isDryRun,
        migrationState,
        open,
        close,
        // Step handlers (called from HTML onclick/onsubmit):
        handleWelcomeContinue,
        handleReauthSubmit,
        handlePassphraseSubmit,
        handleRecoveryContinue,
        handleDoneClose,
        handleErrorRetry,
        downloadRecoveryKey,
        copyRecoveryKey,
        // Exposed for tests (and Session 3 admin panel):
        _internal: {
            getState: () => ({
                ..._state,
                passphrase: _state.passphrase ? '***' : null,
                firebasePassword: _state.firebasePassword ? '***' : null,
            }),
            // Inject state for tests that need to bypass earlier steps.
            setState: (partial) => { Object.assign(_state, partial || {}); },
            goStep: _goStep,
            runMigration,
            // Pipeline helpers — directly callable by tests.
            _pullFreshFromFirebase,
            _loadLocalDocs,
            _ensureSupabaseAccount,
            _persistVaultMeta,
            _pushAllToSupabase,
            _verifyRoundTrip,
            _markFirebaseUserMigrated,
        },
    };
})();
