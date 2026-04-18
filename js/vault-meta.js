// js/vault-meta.js — persistence abstraction for v2 vault metadata.
//
// Stores the opaque crypto metadata (passphrase salt + wrapped MK + optional
// recovery wrapping). CryptoHelper produces this data; the app reads it back
// on sign-in to unlock the vault.
//
// Phase 1c (current): localStorage stub. Single-device only. Good enough for
//                     building and verifying the UI flows end-to-end.
// Phase 2 (next):     swap the impl for a Supabase-backed one that reads/writes
//                     to the `user_crypto_meta` row. The public API below is
//                     already shaped for that — every method is async and
//                     returns the same shape — so the swap won't touch callers.
//
// Shape of a persisted record (all fields base64 strings unless noted):
//   {
//     passphraseSaltB64:      string,
//     passphraseWrappedMKB64: string,
//     passphraseIterations:   number,
//     recoverySaltB64:        string | null,
//     recoveryWrappedMKB64:   string | null,
//     recoveryIterations:     number | null,
//     updatedAt:              ISO-8601 string
//   }

'use strict';

window.VaultMeta = (() => {
    const LS_KEY = (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.VAULT_LOCAL_META) || 'altech_vault_meta_local';

    function _read() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error('[VaultMeta] Parse failed:', e);
            return null;
        }
    }

    function _write(obj) {
        localStorage.setItem(LS_KEY, JSON.stringify(obj));
    }

    return {
        /**
         * Load the current vault metadata, or null if none exists.
         * @returns {Promise<object | null>}
         */
        async load() {
            return _read();
        },

        /**
         * Persist / update the vault metadata. Accepts a partial object — any
         * fields you pass are merged on top of what's stored. Use `null` for
         * a field to clear it.
         * @returns {Promise<object>} The full merged record as stored.
         */
        async save(partial) {
            if (!partial || typeof partial !== 'object') {
                throw new Error('VaultMeta.save requires an object');
            }
            const current = _read() || {};
            const merged = {
                ...current,
                ...partial,
                updatedAt: new Date().toISOString(),
            };
            _write(merged);
            return merged;
        },

        /**
         * Does any vault metadata exist for the current user/device?
         * @returns {Promise<boolean>}
         */
        async exists() {
            return _read() !== null;
        },

        /**
         * Wipe the local metadata. Used when a user explicitly disables v2
         * encryption or resets their account. Does NOT automatically disable
         * the v2 feature flag — caller decides.
         */
        async clear() {
            localStorage.removeItem(LS_KEY);
        },
    };
})();
