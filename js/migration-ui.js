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
            passphrase: null,          // cleared as soon as vault is created
            recoveryKey: null,         // shown once, cleared after step 4
            cryptoMaterial: null,      // { passphraseSaltB64, passphraseWrappedMKB64, passphraseIterations, recoveryWrappedMKB64, recoveryKeyPlaintext }
            firebaseSnapshot: null,    // Session 2: { currentForm, quotes[], cglState, ... }
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
        _goStep('welcome');
    }

    function close() {
        const modal = _q('#migrationModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
        // Wipe any sensitive state on close — passphrase/recovery key shouldn't
        // survive modal dismissal.
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
    // SESSION 1 STUB — no real data is touched. This exists so end-to-end
    // navigation + UI can be validated today. Session 2 replaces the body.

    async function runMigration() {
        _setMigrationState('in-progress');
        _updateProgress(0, 'Starting…');
        await _sleep(300);

        // SESSION 2 PIPELINE (not yet implemented):
        //   _updateProgress(10, 'Pulling Firebase data…');
        //   const snapshot = await _pullFirebaseSnapshot();
        //   _updateProgress(30, 'Decrypting with legacy key…');
        //   const plaintext = await _decryptLegacyPayloads(snapshot);
        //   _updateProgress(50, 'Re-encrypting under your passphrase…');
        //   const ciphertextMap = await _reencryptWithPassphrase(plaintext, _state.cryptoMaterial);
        //   _updateProgress(70, 'Creating Supabase account…');
        //   await _createSupabaseAccount(_state.passphrase);
        //   _updateProgress(85, 'Uploading encrypted blobs…');
        //   await _pushToSupabase(ciphertextMap);
        //   _updateProgress(95, 'Flipping backend flag…');
        //   _flipBackendFlag();
        //   _updateProgress(100, 'Done');
        //   _setMigrationState('complete');
        //   _goStep('done');

        _state.error = 'Session 1 scaffold only: the migration pipeline ships in Session 2. Nothing has been changed — your Firebase data is intact and cloud sync continues to work as before.';
        _setError(_state.error);
        _setMigrationState('not-started'); // Session 1 stub: no state advanced
        _goStep('error');
    }

    function _updateProgress(pct, label) {
        const bar = _q('#migrationProgressBar');
        const text = _q('#migrationProgressLabel');
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        if (text) text.textContent = label || '';
    }

    function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
        // Exposed for Session 3 tests:
        _internal: {
            getState: () => ({ ..._state, passphrase: _state.passphrase ? '***' : null }),
            goStep: _goStep,
        },
    };
})();
