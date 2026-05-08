// js/vault-meta.js — persistence abstraction for v2 vault metadata.
//
// Stores the opaque crypto metadata (passphrase salt + wrapped MK + optional
// recovery wrapping). CryptoHelper produces this data; the app reads it back
// on sign-in to unlock the vault.
//
// Two backends, picked at runtime:
//   - Local (default): localStorage at STORAGE_KEYS.VAULT_LOCAL_META.
//                      Single-device. Used when SYNC_BACKEND != 'supabase'
//                      or when Supabase isn't reachable / user not signed in.
//                      Also doubles as the offline read-through cache for
//                      the Supabase path.
//   - Supabase:        public.user_crypto_meta row keyed by auth.uid().
//                      Cross-device unlock. Server holds wrapped MK + KDF
//                      params; never sees the passphrase, recovery key, or
//                      MK itself (RLS + zero-knowledge wrapping).
//
// Save semantics: writes hit local FIRST so the call never blocks on the
// network — local is the source-of-truth for the current device. Supabase
// is then mirrored best-effort; transient failures log but don't throw.
// Vault meta changes are rare (passphrase change, recovery key attach), so
// retry-on-next-save is sufficient — no separate queue.
//
// Load semantics: when the Supabase backend is active, fetch from the
// server first and refresh the local cache before returning. If Supabase
// is unreachable, fall back to the local cache (offline unlock works).
//
// JS field shape (callers in vault-ui.js + crypto-helper.js stick to this):
//   {
//     passphraseSaltB64:      string,
//     passphraseWrappedMKB64: string,
//     passphraseIterations:   number | null,        // legacy PBKDF2; null on Argon2id records
//     passphraseKdf:          string | null,        // 'argon2id-v1' | 'pbkdf2-v2' | null (legacy)
//     passphraseKdfParams:    object | null,
//     recoverySaltB64:        string | null,
//     recoveryWrappedMKB64:   string | null,
//     recoveryIterations:     number | null,
//     recoveryKdf:            string | null,
//     recoveryKdfParams:      object | null,
//     kdfTree:                string | null,        // 'hkdf-v1' or null (legacy)
//     updatedAt:              ISO-8601 string
//   }

'use strict';

window.VaultMeta = (() => {
    const LS_KEY = (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.VAULT_LOCAL_META) || 'altech_vault_meta_local';
    const SYNC_BACKEND_KEY = (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.SYNC_BACKEND) || 'altech_sync_backend';
    const TABLE = 'user_crypto_meta';

    // ── Field mapping: JS camelCase ↔ DB snake_case ──
    // Update this map when adding new vault-meta fields. Anything not listed
    // here is silently dropped on the Supabase side — that's intentional, so
    // local-only debug fields don't accidentally leak to the server.
    const JS_TO_DB = Object.freeze({
        passphraseSaltB64:      'passphrase_salt',
        passphraseWrappedMKB64: 'passphrase_wrapped_mk',
        passphraseIterations:   'pbkdf2_iterations',
        passphraseKdf:          'passphrase_kdf',
        passphraseKdfParams:    'passphrase_kdf_params',
        recoverySaltB64:        'recovery_salt',
        recoveryWrappedMKB64:   'recovery_wrapped_mk',
        recoveryIterations:     'recovery_iterations',
        recoveryKdf:            'recovery_kdf',
        recoveryKdfParams:      'recovery_kdf_params',
        kdfTree:                'kdf_tree',
    });
    const DB_TO_JS = Object.freeze(
        Object.fromEntries(Object.entries(JS_TO_DB).map(([k, v]) => [v, k]))
    );

    function _toDbRow(jsObj) {
        const out = {};
        for (const [jsKey, val] of Object.entries(jsObj)) {
            const dbKey = JS_TO_DB[jsKey];
            if (dbKey != null) out[dbKey] = val;
        }
        return out;
    }

    function _fromDbRow(row) {
        if (!row) return null;
        const out = {};
        for (const [dbKey, val] of Object.entries(row)) {
            const jsKey = DB_TO_JS[dbKey];
            if (jsKey != null) out[jsKey] = val;
        }
        // Coalesce server timestamps into JS-side updatedAt.
        if (row.rotated_at || row.created_at) {
            out.updatedAt = row.rotated_at || row.created_at;
        }
        return out;
    }

    // ── Local impl (always available, also used as cache) ──
    function _localRead() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error('[VaultMeta] Local parse failed:', e);
            return null;
        }
    }

    function _localWrite(obj) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); }
        catch (e) { console.error('[VaultMeta] Local write failed:', e); }
    }

    function _localClear() {
        try { localStorage.removeItem(LS_KEY); } catch (_) { /* no-op */ }
    }

    // ── Supabase reachability ──
    function _supabaseActive() {
        try { if (localStorage.getItem(SYNC_BACKEND_KEY) !== 'supabase') return false; }
        catch { return false; }
        const sb = (typeof window !== 'undefined') ? window.Supabase : null;
        return !!(sb && sb.isReady && sb.client);
    }

    async function _currentUserId() {
        const sb = (typeof window !== 'undefined') ? window.Supabase : null;
        if (!sb || !sb.client || !sb.client.auth) return null;
        try {
            if (typeof sb.client.auth.getSession === 'function') {
                const { data } = await sb.client.auth.getSession();
                if (data && data.session && data.session.user) return data.session.user.id;
            }
            if (typeof sb.client.auth.getUser === 'function') {
                const { data } = await sb.client.auth.getUser();
                if (data && data.user) return data.user.id;
            }
        } catch (e) {
            console.warn('[VaultMeta] Could not resolve user:', e && e.message);
        }
        return null;
    }

    async function _supabaseCtx() {
        if (!_supabaseActive()) return null;
        const uid = await _currentUserId();
        if (!uid) return null;
        return { client: window.Supabase.client, uid };
    }

    // ── Supabase impl ──
    async function _supabaseLoad() {
        const ctx = await _supabaseCtx();
        if (!ctx) return null;
        const { data, error } = await ctx.client
            .from(TABLE)
            .select('*')
            .eq('user_id', ctx.uid)
            .maybeSingle();
        if (error) {
            console.warn('[VaultMeta] Supabase load failed:', error.message || error);
            return null;
        }
        return _fromDbRow(data);
    }

    async function _supabaseSave(merged) {
        const ctx = await _supabaseCtx();
        if (!ctx) return { ok: false, skipped: true };
        // The DB enforces NOT NULL on passphrase_salt — never send a row that
        // would fail the constraint, just keep local in sync until a complete
        // record is available.
        if (!merged.passphraseSaltB64) return { ok: false, skipped: true };

        const row = {
            user_id: ctx.uid,
            ...(_toDbRow(merged)),
            rotated_at: new Date().toISOString(),
        };

        const { error } = await ctx.client
            .from(TABLE)
            .upsert(row, { onConflict: 'user_id' });
        if (error) {
            console.warn('[VaultMeta] Supabase save failed:', error.message || error);
            return { ok: false, error };
        }
        return { ok: true };
    }

    async function _supabaseClear() {
        const ctx = await _supabaseCtx();
        if (!ctx) return { ok: false, skipped: true };
        const { error } = await ctx.client
            .from(TABLE)
            .delete()
            .eq('user_id', ctx.uid);
        if (error) {
            console.warn('[VaultMeta] Supabase clear failed:', error.message || error);
            return { ok: false, error };
        }
        return { ok: true };
    }

    // ── Public API ──
    return {
        /**
         * Load the vault metadata. On the Supabase backend, fetches from the
         * server and refreshes the local cache; falls back to local cache if
         * unreachable. Returns null if neither has anything.
         * @returns {Promise<object | null>}
         */
        async load() {
            if (_supabaseActive()) {
                const remote = await _supabaseLoad();
                if (remote) {
                    _localWrite(remote); // refresh cache for offline next time
                    return remote;
                }
                // Server has nothing. If local has a complete record, this is
                // almost certainly a user whose vault meta was saved BEFORE the
                // backend flip during migration (the original Session 2 bug:
                // _persistVaultMeta ran while SYNC_BACKEND was still 'firebase',
                // so the Supabase mirror got skipped). Auto-heal by uploading
                // local now — best-effort, never throws. Cross-device unlock
                // starts working as soon as this lands.
                const local = _localRead();
                if (local && local.passphraseSaltB64 && local.passphraseWrappedMKB64) {
                    try { await _supabaseSave(local); }
                    catch (e) { console.warn('[VaultMeta] Auto-heal mirror failed:', e && e.message); }
                }
                return local;
            }
            return _localRead();
        },

        /**
         * Persist vault metadata. Merges `partial` onto whatever's already
         * stored locally, writes the merged record to localStorage immediately,
         * then mirrors to Supabase best-effort. Returns the merged record so
         * callers see the canonical post-save shape.
         */
        async save(partial) {
            if (!partial || typeof partial !== 'object') {
                throw new Error('VaultMeta.save requires an object');
            }
            const current = _localRead() || {};
            const merged = {
                ...current,
                ...partial,
                updatedAt: new Date().toISOString(),
            };
            _localWrite(merged);

            if (_supabaseActive()) {
                // Best-effort — never block local persistence on a Supabase round-trip.
                try { await _supabaseSave(merged); }
                catch (e) { console.warn('[VaultMeta] Supabase mirror failed:', e && e.message); }
            }

            return merged;
        },

        /**
         * Whether vault metadata exists for the current identity. On Supabase
         * the authoritative answer is the server's; we still check local
         * first because it's free and a positive there means we definitely
         * have a vault somewhere.
         * @returns {Promise<boolean>}
         */
        async exists() {
            if (_localRead() != null) return true;
            if (_supabaseActive()) {
                const remote = await _supabaseLoad();
                if (remote) {
                    _localWrite(remote); // seed cache while we have the data
                    return true;
                }
            }
            return false;
        },

        /**
         * Wipe the vault metadata. Local is always cleared; Supabase is also
         * cleared if reachable. Used when a user disables v2 encryption or
         * resets their account. Does NOT toggle the v2 feature flag — caller
         * decides.
         */
        async clear() {
            _localClear();
            if (_supabaseActive()) {
                try { await _supabaseClear(); }
                catch (e) { console.warn('[VaultMeta] Supabase clear mirror failed:', e && e.message); }
            }
        },

        // ── Internals exposed for tests only ──
        _internals: {
            JS_TO_DB,
            DB_TO_JS,
            toDbRow: _toDbRow,
            fromDbRow: _fromDbRow,
            isSupabaseActive: _supabaseActive,
            localRead: _localRead,
            localWrite: _localWrite,
            localClear: _localClear,
        },
    };
})();

// CommonJS export so Node-based tests can require this file directly.
// Browser path is unaffected — `module` is undefined in script tags.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VaultMeta: window.VaultMeta };
}
