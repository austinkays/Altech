// js/_dev/migration-helper.js — Dev helper for the Firebase → Supabase migration.
//
// Purpose: collapse the dry-run → real-migration loop into one paste. Hooks the
// migration modal, fires verification automatically when it lands on the done
// or error step, and prints a single ✅/❌ report querying Supabase directly
// (does not trust SupabaseSync's cache).
//
// Load once per session in the browser console:
//
//   var s=document.createElement('script');
//   s.src='/js/_dev/migration-helper.js';
//   document.head.appendChild(s);
//
// Then:
//   MigHelper.go()         — reset stale state + open modal + observe + auto-verify
//   MigHelper.verify()     — manual verification (auto-detects dry vs real)
//   MigHelper.flipReal()   — remove dry-run flag and reload (between dry and real)
//   MigHelper.reset()      — idempotently clear stale altech_migration_state +
//                            altech_pre_migration_backup (used by go())

(() => {
    'use strict';

    if (typeof STORAGE_KEYS === 'undefined') {
        console.error('[MigHelper] STORAGE_KEYS not on window — load this on the Altech app page.');
        return;
    }

    // The seven docs the user manually hydrated into localStorage in the prior
    // session. After dry-run or real migration, every one of these MUST be
    // present in public.user_blobs for this user.
    const EXPECTED_BLOBS = [
        'reminders', 'quickRefCards', 'quickRefNumbers', 'quickRefEmojis',
        'cglState', 'glossary', 'clientHistory',
    ];

    // Stale-state keys that go() clears before opening the modal.
    const STALE_KEYS = [
        STORAGE_KEYS.MIGRATION_STATE,
        STORAGE_KEYS.PRE_MIGRATION_BACKUP,
    ];

    function styled(label, color) {
        return [`%c${label}`, `background:${color};color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold`];
    }

    function reset() {
        const removed = [];
        for (const k of STALE_KEYS) {
            if (localStorage.getItem(k) != null) {
                localStorage.removeItem(k);
                removed.push(k);
            }
        }
        console.log(...styled('MigHelper', '#5856D6'),
            `reset: ${removed.length ? 'cleared ' + removed.join(', ') : 'nothing to clear'}`);
        return removed;
    }

    function _isDry() {
        return localStorage.getItem(STORAGE_KEYS.MIGRATION_DRY_RUN) === '1';
    }

    function _check(name, ok, detail) {
        return { name, ok: !!ok, detail };
    }

    async function _supabaseSession() {
        const sb = window.Supabase;
        if (!sb || !sb.client) return null;
        try {
            const { data } = await sb.client.auth.getSession();
            return data && data.session ? data.session : null;
        } catch { return null; }
    }

    async function _supabaseBlobKeys(uid) {
        const sb = window.Supabase;
        if (!sb || !sb.client || !uid) return null;
        const { data, error } = await sb.client
            .from('user_blobs')
            .select('doc_key')
            .eq('user_id', uid);
        if (error) return { error };
        return (data || []).map(r => r.doc_key);
    }

    async function _supabaseCryptoMeta(uid) {
        const sb = window.Supabase;
        if (!sb || !sb.client || !uid) return null;
        const { data, error } = await sb.client
            .from('user_crypto_meta')
            .select('passphrase_kdf, kdf_tree, recovery_kdf, rotated_at')
            .eq('user_id', uid)
            .maybeSingle();
        if (error) return { error };
        return data;
    }

    async function verify() {
        const dry = _isDry();
        const mode = dry ? 'DRY RUN' : 'REAL';
        console.log(...styled(`MigHelper · ${mode}`, '#FF9500'), 'verifying…');

        const checks = [];

        // 1. migrationState
        const ms = (typeof MigrationUI !== 'undefined') ? MigrationUI.migrationState() : '(MigrationUI missing)';
        checks.push(_check('migrationState === "complete"', ms === 'complete', `got "${ms}"`));

        // 2. SYNC_BACKEND — dry must NOT flip; real must flip
        const backend = localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND);
        if (dry) {
            const isFirebaseDefault = (backend === null || backend === 'firebase');
            checks.push(_check('backend reverted to firebase (dry run must NOT flip)',
                isFirebaseDefault, `got ${JSON.stringify(backend)}`));
        } else {
            checks.push(_check('backend === "supabase"', backend === 'supabase', `got ${JSON.stringify(backend)}`));
        }

        // 3. E2E v2 flag — dry must NOT enable; real must enable
        const v2 = localStorage.getItem(STORAGE_KEYS.E2E_CRYPTO_V2);
        if (dry) {
            checks.push(_check('e2eV2Flag === null (dry run must NOT enable v2)',
                v2 === null, `got ${JSON.stringify(v2)}`));
        } else {
            checks.push(_check('e2eV2Flag === "1"', v2 === '1', `got ${JSON.stringify(v2)}`));
        }

        // 4. Snapshot exists & recent
        let snapAge = null, snapTakenISO = null;
        if (typeof MigrationBackup !== 'undefined') {
            const rec = MigrationBackup.load();
            if (rec) {
                snapTakenISO = new Date(rec.takenAt).toISOString();
                snapAge = Date.now() - rec.takenAt;
            }
        }
        checks.push(_check('rollback snapshot exists',
            snapTakenISO !== null,
            snapTakenISO ? `taken ${snapTakenISO} (${Math.round(snapAge / 1000)}s ago)` : 'missing'));
        if (dry) {
            checks.push(_check('snapshot age within last 10 min',
                snapAge != null && snapAge < 10 * 60_000,
                snapAge != null ? `${Math.round(snapAge / 1000)}s` : 'n/a'));
        }

        // 5. Supabase signed in
        const session = await _supabaseSession();
        const uid = session?.user?.id || null;
        const email = session?.user?.email || null;
        checks.push(_check('Supabase signed in',
            !!uid,
            uid ? `email=${email || '?'} uid=${uid.slice(0, 8)}…` : 'no session'));

        // 6. Supabase blobs — LIVE query, not SupabaseSync's cache
        if (uid) {
            const blobsResult = await _supabaseBlobKeys(uid);
            if (blobsResult && blobsResult.error) {
                checks.push(_check('user_blobs query', false, `error: ${blobsResult.error.message}`));
            } else {
                const got = new Set(blobsResult || []);
                const missing = EXPECTED_BLOBS.filter(k => !got.has(k));
                const extra = [...got].filter(k => !EXPECTED_BLOBS.includes(k));
                const pass = missing.length === 0;
                const detail = pass
                    ? `all ${EXPECTED_BLOBS.length} present` +
                      (extra.length ? ` (+${extra.length} extra: ${extra.join(', ')})` : '')
                    : `missing: ${missing.join(', ')} | got: ${[...got].join(', ') || '(none)'}`;
                checks.push(_check(`user_blobs has ${EXPECTED_BLOBS.join(', ')}`, pass, detail));
            }

            // 7. user_crypto_meta KDF identifiers
            const meta = await _supabaseCryptoMeta(uid);
            if (!meta) {
                checks.push(_check('user_crypto_meta row exists', false, 'missing'));
            } else if (meta.error) {
                checks.push(_check('user_crypto_meta query', false, `error: ${meta.error.message}`));
            } else {
                const kdfOK = typeof meta.passphrase_kdf === 'string' && meta.passphrase_kdf.startsWith('argon2id');
                checks.push(_check('cryptoMeta.passphrase_kdf starts with "argon2id"',
                    kdfOK, `got ${JSON.stringify(meta.passphrase_kdf)}`));
                const treeOK = meta.kdf_tree === 'hkdf-v1';
                checks.push(_check('cryptoMeta.kdf_tree === "hkdf-v1"',
                    treeOK, `got ${JSON.stringify(meta.kdf_tree)}`));
            }
        } else {
            checks.push(_check('user_blobs / user_crypto_meta queries', false, 'skipped — no Supabase session'));
        }

        // ── Render ──
        const passed = checks.filter(c => c.ok).length;
        const failed = checks.length - passed;
        const allPass = failed === 0;
        const summaryLabel = allPass
            ? `MigHelper · ${mode} · ALL ${passed}/${checks.length} PASS`
            : `MigHelper · ${mode} · ${failed} FAILED of ${checks.length}`;
        console.log(...styled(summaryLabel, allPass ? '#34C759' : '#FF3B30'), '');
        for (const c of checks) {
            console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
        }

        // ── Next-step hint ──
        if (allPass && dry) {
            console.log(...styled('NEXT', '#007AFF'),
                'Dry run looks good. Run real migration: MigHelper.flipReal()  (removes dry-run flag + reloads; then call MigHelper.go() again).');
        } else if (allPass && !dry) {
            console.log(...styled('DONE', '#34C759'),
                'Real migration verified. Snapshot kept as 30-day rollback latch — DO NOT delete altech_pre_migration_backup before then.');
        } else {
            console.log(...styled('ACTION', '#FF3B30'),
                'Verification failed. If a snapshot still exists you can manually roll back via MigrationBackup.restore(). Investigate the ❌ rows before retrying.');
        }

        return { mode, allPass, passed, failed, checks };
    }

    function flipReal() {
        if (_isDry()) {
            localStorage.removeItem(STORAGE_KEYS.MIGRATION_DRY_RUN);
            console.log(...styled('MigHelper', '#5856D6'), 'dry-run flag removed; reloading…');
            setTimeout(() => location.reload(), 200);
        } else {
            console.warn('[MigHelper] flipReal() called but dry-run flag is already off.');
        }
    }

    // ── Modal step cheat sheet + auto-verify hook ──
    const STEP_NOTES = {
        1: 'Welcome → click Continue.',
        2: 'Re-auth → enter your CURRENT Firebase password (the one you sign in with).',
        3: 'Passphrase → enter a NEW E2E passphrase (≥8 chars), twice. This becomes your encryption key going forward.',
        4: 'Recovery → save the recovery key (Download or Copy), tick the "I saved it" checkbox, click Continue.',
        5: 'Running → wait. Modal will advance to Done or Error automatically.',
        6: 'Done → MigHelper auto-fires verification below. Don\'t close the modal until you see the report.',
        7: 'Error → MigHelper auto-checks rollback. Read the report below.',
    };

    let _observer = null;
    let _lastStep = null;

    function _onModalChange() {
        const modal = document.querySelector('#migrationModal');
        if (!modal) return;
        const visible = [...modal.querySelectorAll('[data-step]')]
            .find(el => el.style.display !== 'none' && getComputedStyle(el).display !== 'none');
        if (!visible) return;
        const step = Number(visible.dataset.step);
        if (step === _lastStep) return;
        _lastStep = step;
        const note = STEP_NOTES[step];
        if (note) console.log(...styled(`Step ${step}`, '#8E8E93'), note);

        if (step === 6) {
            // Wait one tick for migrationState to flip to 'complete'.
            setTimeout(() => verify().catch(e => console.error('[MigHelper] verify threw:', e)), 250);
        } else if (step === 7) {
            const snapped = (typeof MigrationBackup !== 'undefined' && MigrationBackup.exists)
                ? MigrationBackup.exists() : false;
            console.log(...styled('MigHelper · ERROR', '#FF3B30'),
                snapped
                    ? 'Pipeline failed. Snapshot still present — call MigrationBackup.restore() to roll local back, then investigate the error above.'
                    : 'Pipeline failed. NO snapshot present — restore() may have already fired (look for "Local data restored from snapshot" above), or snapshot was never taken (quota). Firebase originals are untouched either way.');
        }
    }

    function go() {
        if (typeof MigrationUI === 'undefined') {
            console.error('[MigHelper] MigrationUI not loaded — is altech_migration_enabled set to "1"?');
            return;
        }
        reset();
        if (_observer) _observer.disconnect();
        _lastStep = null;
        _observer = new MutationObserver(_onModalChange);
        const modal = document.querySelector('#migrationModal');
        if (modal) _observer.observe(modal, { attributes: true, subtree: true, attributeFilter: ['style'] });
        console.log(...styled('MigHelper', '#5856D6'), 'observer installed; opening modal…');
        console.log(...styled('Cheat sheet', '#8E8E93'),
            '1 Welcome → 2 Reauth (Firebase pwd) → 3 Passphrase (NEW, ≥8 chars) → 4 Recovery (save+tick) → 5 Running → 6 Done (auto-verify) | 7 Error (auto-rollback)');
        MigrationUI.open();
        // Re-attach observer if the modal was rebuilt by open().
        setTimeout(() => {
            const m2 = document.querySelector('#migrationModal');
            if (m2 && m2 !== modal) _observer.observe(m2, { attributes: true, subtree: true, attributeFilter: ['style'] });
            _onModalChange();
        }, 100);
    }

    window.MigHelper = {
        reset, go, verify, flipReal,
        _internals: { EXPECTED_BLOBS, STEP_NOTES, STALE_KEYS },
    };
    console.log(...styled('MigHelper loaded', '#5856D6'),
        'API: reset() · go() · verify() · flipReal()   ─   start with: MigHelper.go()');
})();
