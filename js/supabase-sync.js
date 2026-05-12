// js/supabase-sync.js — Path B Phase 2 Supabase sync client.
//
// Ciphertext-only mirror of the slice of cloud-sync.js that the
// SYNC_BACKEND=supabase flag activates. This module never decrypts anything
// and never inspects payload structure: every blob is pushed and pulled as
// an opaque string. Encryption / decryption happens in js/crypto-helper.js
// on the client, not here.
//
// Row shape (see db/migrations/0001_initial_schema.sql):
//   user_blobs   : (user_id, doc_key, ciphertext, updated_at, device_id)
//   user_quotes  : (id, user_id, ciphertext, updated_at, created_at)
//
// RLS is deny-by-default on select; a cross-user pull returns zero rows
// (and this module surfaces that as `null`, never as an error).
//
// Gated behind localStorage[STORAGE_KEYS.SYNC_BACKEND]. Default is
// 'firebase', and every exported method is a no-op in that mode.

'use strict';

window.SupabaseSync = (() => {
    const SYNC_DEBOUNCE_MS = 3000;
    const BLOBS_TABLE = 'user_blobs';
    const QUOTES_TABLE = 'user_quotes';

    // Map of sync doc_key → localStorage key. Must stay consistent with
    // CloudSync's _getLocalData(). 'quotes' is intentionally excluded —
    // quotes live in user_quotes (row-per-quote) rather than user_blobs.
    // 'settings' is also excluded: it's a composite view built from
    // individual localStorage keys and has no single ciphertext blob yet.
    // The Phase 4 migration will add a stored ciphertext for settings.
    const DOC_LOCAL_KEYS = Object.freeze({
        currentForm:      STORAGE_KEYS.FORM,
        cglState:         STORAGE_KEYS.CGL_STATE,
        clientHistory:    STORAGE_KEYS.CLIENT_HISTORY,
        quickRefCards:    STORAGE_KEYS.QUICKREF_CARDS,
        quickRefNumbers:  STORAGE_KEYS.QUICKREF_NUMBERS,
        quickRefEmojis:   STORAGE_KEYS.QUICKREF_EMOJIS,
        reminders:        STORAGE_KEYS.REMINDERS,
        glossary:         STORAGE_KEYS.AGENCY_GLOSSARY,
        vaultData:        STORAGE_KEYS.ACCT_VAULT,
        vaultMeta:        STORAGE_KEYS.ACCT_VAULT_META,
        commercialDraft:  STORAGE_KEYS.COMMERCIAL_DRAFT,
        commercialQuotes: STORAGE_KEYS.COMMERCIAL_QUOTES,
        intakeV2Draft:    STORAGE_KEYS.INTAKE_V2,
        intakeV2Quotes:   STORAGE_KEYS.INTAKE_V2_QUOTES,
        agencyDefaults:   STORAGE_KEYS.AGENCY_DEFAULTS,
    });

    // Per-browser device id, shared with CloudSync's DEVICE_ID so the server
    // can still attribute writes for audit purposes.
    function _getOrCreateDeviceId() {
        let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
        if (!id) {
            id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
        }
        return id;
    }

    const DEVICE_ID = _getOrCreateDeviceId();

    let _debouncedPush = null;
    let _pushing = false;

    function _enabled() {
        // Phase D (May 2026): default flipped to Supabase. Only an explicit
        // 'firebase' opts out (one-release fallback for the Phase D rollout).
        return localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND) !== 'firebase';
    }

    function _client() {
        const sb = window.Supabase;
        return (sb && sb.isReady && sb.client) ? sb.client : null;
    }

    async function _currentUserId() {
        const client = _client();
        if (!client || !client.auth) return null;
        try {
            // Prefer getSession() — synchronous cache after first call, and
            // avoids a network round-trip every pushBlob.
            if (typeof client.auth.getSession === 'function') {
                const { data } = await client.auth.getSession();
                if (data && data.session && data.session.user) return data.session.user.id;
            }
            if (typeof client.auth.getUser === 'function') {
                const { data } = await client.auth.getUser();
                if (data && data.user) return data.user.id;
            }
        } catch (e) {
            console.warn('[SupabaseSync] Could not resolve current user:', e && e.message);
        }
        return null;
    }

    async function _ready() {
        if (!_enabled()) return null;
        const client = _client();
        if (!client) return null;
        const uid = await _currentUserId();
        if (!uid) return null;
        return { client, uid };
    }

    // ── user_blobs ops ────────────────────────────────────────────────────

    // Phase B: when identity is provided AND the v2 vault is unlocked, the
    // payload is transparently re-wrapped as an AAD-bound envelope tied to
    // (table=user_blobs, rowId=docKey, userId=uid) before push. A
    // compromised or curious server then cannot move a ciphertext between
    // rows or relabel it for another user — AES-GCM's auth tag fails on the
    // next pull. When v2 is locked or AAD wrapping isn't available, the
    // legacy ciphertext is pushed as-is so we never block a sync on crypto
    // capability detection. The decrypt-then-rewrap costs one round-trip
    // per doc per debounced push (3 s default) — negligible.
    async function _maybeWrapForRow(payload, identity) {
        if (!identity) return payload;
        // CryptoHelper is a top-level const in js/crypto-helper.js — accessible
        // by name in browser script-tag globals AND on globalThis (set by the
        // helper's bottom-of-file publish line). Match the existing pattern
        // used everywhere else in the codebase.
        const ch = (typeof CryptoHelper !== 'undefined') ? CryptoHelper : null;
        if (!ch || !ch.encryptForRow || !ch.isV2Unlocked || !ch.isV2Unlocked()) {
            return payload;
        }
        try {
            const plaintext = await ch.decrypt(payload);
            if (plaintext == null) return payload;
            return await ch.encryptForRow(plaintext, identity);
        } catch (e) {
            console.warn('[SupabaseSync] AAD wrap skipped for', identity.rowId, '—', (e && e.message) || e);
            return payload;
        }
    }

    async function pushBlob(docKey, ciphertext, _updatedAt, identity) {
        // _updatedAt is accepted for API symmetry with CloudSync, but the
        // server ignores it: a BEFORE UPDATE trigger sets updated_at = now()
        // on every write. Keep the arg in the signature for future use.
        const ctx = await _ready();
        if (!ctx) return { ok: false, skipped: true };
        if (docKey == null || ciphertext == null) return { ok: false, skipped: true };

        const id = identity || { table: BLOBS_TABLE, rowId: docKey, userId: ctx.uid };
        const wrapped = await _maybeWrapForRow(String(ciphertext), id);

        const row = {
            user_id: ctx.uid,
            doc_key: docKey,
            ciphertext: wrapped,
            device_id: DEVICE_ID,
        };

        const { error } = await ctx.client
            .from(BLOBS_TABLE)
            .upsert(row, { onConflict: 'user_id,doc_key' });

        if (error) {
            console.error('[SupabaseSync] pushBlob failed:', docKey, error.message || error);
            return { ok: false, error };
        }
        return { ok: true };
    }

    async function pullBlob(docKey) {
        const ctx = await _ready();
        if (!ctx || docKey == null) return null;

        const { data, error } = await ctx.client
            .from(BLOBS_TABLE)
            .select('ciphertext, updated_at, device_id')
            .eq('doc_key', docKey)
            .maybeSingle();

        if (error) {
            console.error('[SupabaseSync] pullBlob failed:', docKey, error.message || error);
            return null;
        }
        if (!data) return null;
        return {
            ciphertext: data.ciphertext,
            updated_at: data.updated_at,
            device_id: data.device_id,
        };
    }

    async function deleteBlob(docKey) {
        const ctx = await _ready();
        if (!ctx || docKey == null) return { ok: false, skipped: true };

        const { error } = await ctx.client
            .from(BLOBS_TABLE)
            .delete()
            .eq('doc_key', docKey);

        if (error) {
            console.error('[SupabaseSync] deleteBlob failed:', docKey, error.message || error);
            return { ok: false, error };
        }
        return { ok: true };
    }

    // ── user_quotes ops ───────────────────────────────────────────────────

    async function pushQuote(quoteId, ciphertext, identity) {
        const ctx = await _ready();
        if (!ctx) return { ok: false, skipped: true };
        if (ciphertext == null) return { ok: false, skipped: true };

        // For new quotes (no quoteId yet), AAD can't bind the row id since
        // the server assigns it. Skip the wrap on those — the next push
        // after the row exists will upgrade it lazily. For updates, build
        // identity from (table, quoteId, uid).
        const id = identity || (quoteId
            ? { table: QUOTES_TABLE, rowId: quoteId, userId: ctx.uid }
            : null);
        const wrapped = await _maybeWrapForRow(String(ciphertext), id);

        const row = {
            user_id: ctx.uid,
            ciphertext: wrapped,
        };
        if (quoteId) row.id = quoteId;

        const { data, error } = await ctx.client
            .from(QUOTES_TABLE)
            .upsert(row, { onConflict: 'id' })
            .select('id, updated_at')
            .maybeSingle();

        if (error) {
            console.error('[SupabaseSync] pushQuote failed:', quoteId, error.message || error);
            return { ok: false, error };
        }
        return { ok: true, id: data && data.id, updated_at: data && data.updated_at };
    }

    async function pullQuote(id) {
        const ctx = await _ready();
        if (!ctx || id == null) return null;

        const { data, error } = await ctx.client
            .from(QUOTES_TABLE)
            .select('id, ciphertext, updated_at, created_at')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('[SupabaseSync] pullQuote failed:', id, error.message || error);
            return null;
        }
        return data || null;
    }

    async function listQuotes() {
        const ctx = await _ready();
        if (!ctx) return [];

        const { data, error } = await ctx.client
            .from(QUOTES_TABLE)
            .select('id, ciphertext, updated_at, created_at')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('[SupabaseSync] listQuotes failed:', error.message || error);
            return [];
        }
        return Array.isArray(data) ? data : [];
    }

    async function deleteQuote(id) {
        const ctx = await _ready();
        if (!ctx || id == null) return { ok: false, skipped: true };

        const { error } = await ctx.client
            .from(QUOTES_TABLE)
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[SupabaseSync] deleteQuote failed:', id, error.message || error);
            return { ok: false, error };
        }
        return { ok: true };
    }

    // ── Sweep + debounce ──────────────────────────────────────────────────

    async function _pushAllBlobs() {
        if (!_enabled()) return;
        if (_pushing) return;
        _pushing = true;
        try {
            // Resolve uid once for the whole sweep so each pushBlob doesn't
            // re-hit auth.getSession() for its identity.
            const ctx = await _ready();
            if (!ctx) return;
            const jobs = Object.entries(DOC_LOCAL_KEYS).map(async ([docKey, lsKey]) => {
                if (!lsKey) return null;
                const raw = localStorage.getItem(lsKey);
                if (raw == null || raw === '') return null;
                const identity = { table: BLOBS_TABLE, rowId: docKey, userId: ctx.uid };
                return pushBlob(docKey, raw, undefined, identity);
            });
            const results = await Promise.allSettled(jobs);
            // Surface to the activity log so the header pill reflects sync health.
            // Same pattern as cloud-sync.js — full success / partial / total fail.
            if (window.ActivityLog) {
                const attempted = results.filter(r => r.status === 'fulfilled' && r.value !== null);
                const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value && r.value.ok === false));
                const succeeded = attempted.filter(r => r.value && r.value.ok);
                if (attempted.length === 0) {
                    // No-op: nothing in localStorage to push, don't log noise.
                } else if (succeeded.length === 0) {
                    window.ActivityLog.add({
                        type: 'sync', area: 'supabase', ok: false,
                        message: 'Supabase sync failed — changes saved locally',
                        detail: failures.slice(0, 3).map(f => (f.reason && f.reason.message) || (f.value && f.value.error && f.value.error.message) || '').filter(Boolean).join('; '),
                    });
                } else if (failures.length === 0) {
                    window.ActivityLog.add({
                        type: 'sync', area: 'supabase', ok: true,
                        message: `Synced ${succeeded.length} doc${succeeded.length === 1 ? '' : 's'} to Supabase`,
                    });
                } else {
                    window.ActivityLog.add({
                        type: 'sync', area: 'supabase', ok: false,
                        message: `Partial Supabase sync — ${failures.length}/${attempted.length} docs failed`,
                        detail: failures.slice(0, 3).map(f => (f.reason && f.reason.message) || '').filter(Boolean).join('; '),
                    });
                }
            }
        } finally {
            _pushing = false;
        }
    }

    function schedulePush() {
        if (!_enabled()) return;
        if (!_debouncedPush) {
            const debounce = (window.Utils && window.Utils.debounce) || _localDebounce;
            _debouncedPush = debounce(_pushAllBlobs, SYNC_DEBOUNCE_MS);
        }
        _debouncedPush();
    }

    function _localDebounce(fn, ms) {
        let t = null;
        const wrapped = function (...args) {
            if (t) clearTimeout(t);
            t = setTimeout(() => { t = null; fn.apply(this, args); }, ms);
        };
        wrapped.cancel = () => { if (t) { clearTimeout(t); t = null; } };
        return wrapped;
    }

    async function init() {
        if (!_enabled()) return false;
        if (!window.Supabase || typeof window.Supabase.init !== 'function') {
            console.warn('[SupabaseSync] window.Supabase unavailable — staying dormant');
            return false;
        }
        return window.Supabase.init();
    }

    /**
     * Pull every plain-JSON doc from user_blobs, decrypt the v=2 AAD-bound
     * envelope, and write the plaintext back to localStorage. Used for:
     *   - Recovery after a stale Firebase pull overwrote local state
     *   - Initial hydration when signing in on a new device
     *
     * **Skips `currentForm`** because that key is stored as v1-encrypted
     * ciphertext locally; writing decrypted plaintext into it would break
     * App.load()'s decrypt path. Form recovery has to go through a
     * dedicated re-encrypt-on-write helper (TODO).
     *
     * **Skips `vaultMeta`** because VaultMeta.load() is the canonical reader
     * for that record — never write it via the generic path.
     *
     * **Skips quotes** for now — quotes are a list-shaped doc with per-row
     * AAD identities, needing a separate listQuotes + decryptForRow loop.
     *
     * Returns `{ restored: string[], skipped: string[], failed: string[] }`
     * for diagnostics. Best-effort: a failure on one doc does not abort
     * the others.
     */
    async function restoreFromCloud() {
        if (!_enabled()) return { restored: [], skipped: ['supabase-disabled'], failed: [] };
        const ctx = await _ready();
        if (!ctx) return { restored: [], skipped: ['no-session'], failed: [] };
        const ch = (typeof CryptoHelper !== 'undefined') ? CryptoHelper : null;
        if (!ch || typeof ch.decryptForRow !== 'function') {
            return { restored: [], skipped: [], failed: ['crypto-unavailable'] };
        }

        const SKIP = new Set(['currentForm', 'vaultMeta']);
        const restored = [];
        const skipped = [];
        const failed = [];

        for (const [docKey, lsKey] of Object.entries(DOC_LOCAL_KEYS)) {
            if (!lsKey) continue;
            if (SKIP.has(docKey)) { skipped.push(docKey); continue; }

            const fetched = await pullBlob(docKey);
            if (!fetched || !fetched.ciphertext) { skipped.push(docKey); continue; }

            const identity = { table: BLOBS_TABLE, rowId: docKey, userId: ctx.uid };
            let plaintext = null;
            try { plaintext = await ch.decryptForRow(fetched.ciphertext, identity); }
            catch (e) {
                console.warn('[SupabaseSync] decryptForRow threw on', docKey, e && e.message);
                failed.push(docKey);
                continue;
            }
            if (plaintext == null) { failed.push(docKey); continue; }

            try {
                const serialized = (typeof plaintext === 'string') ? plaintext : JSON.stringify(plaintext);
                localStorage.setItem(lsKey, serialized);
                restored.push(docKey);
            } catch (e) {
                console.warn('[SupabaseSync] localStorage write failed for', docKey, e && e.message);
                failed.push(docKey);
            }
        }

        return { restored, skipped, failed };
    }

    return {
        // Public API surface mirrors the slice of CloudSync that the Phase 2
        // feature-flag routing cares about. Every method is a no-op when the
        // SYNC_BACKEND flag is not 'supabase'.
        get enabled() { return _enabled(); },
        get deviceId() { return DEVICE_ID; },
        get DOC_LOCAL_KEYS() { return DOC_LOCAL_KEYS; },

        init,
        pushBlob,
        pullBlob,
        deleteBlob,
        pushQuote,
        pullQuote,
        listQuotes,
        deleteQuote,
        schedulePush,

        // Explicit full sweep for the Phase 4 migration / manual "Sync Now".
        pushAllBlobs: _pushAllBlobs,

        // Recovery: pull every plain-JSON blob from Supabase + decrypt + write
        // to localStorage. Skips currentForm/vaultMeta/quotes (special paths).
        restoreFromCloud,
    };
})();
