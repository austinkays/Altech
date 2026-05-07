// js/migration-backup.js — Phase D-3: pre-migration safety latch.
//
// Captures a snapshot of every altech_* localStorage value the migration
// could modify, BEFORE the Firebase→Supabase pipeline begins to mutate
// state. If migration goes wrong (Supabase decryption fails on first
// pull, the user picks the wrong passphrase, etc.), restore() puts the
// device back exactly the way it was.
//
// Storage shape (under STORAGE_KEYS.PRE_MIGRATION_BACKUP):
//   {
//     takenAt: 1746662400000,                     // Date.now() at snapshot
//     ttlDays: 30,                                // auto-clean after this
//     keys:    { 'altech_v6': '...', ...,  }     // verbatim ciphertext / json strings
//   }
//
// Snapshot is taken AS-IS — values are already encrypted where the app
// cared about them (FORM/QUOTES under v1 device key, etc.). We don't
// re-encrypt; we just transport the ciphertext map. Plaintext-stored
// docs (CGL_STATE/REMINDERS) are stashed verbatim — same exposure as
// the live localStorage they came from.
//
// Excluded from the snapshot (preserved across restore):
//   - The migration flags themselves (would defeat resume-on-crash)
//   - SYNC_BACKEND (we want the post-migration value to win)
//   - DEVICE_ID (per-device identifier; never wants to be replaced)
//   - The backup blob itself (avoid recursion)
//
// Session 2 of migration-ui.js will call snapshot() at the very top of
// its pipeline. Today this module ships standalone with tests; nothing
// in production calls it yet (the Session 1 stub doesn't touch data),
// so this is pure preparation.

'use strict';

window.MigrationBackup = (() => {
    const KEY = (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.PRE_MIGRATION_BACKUP) || 'altech_pre_migration_backup';
    const PREFIX = 'altech_';
    const DEFAULT_TTL_DAYS = 30;

    // Keys that must NOT be captured. Anything in this set is left at its
    // current value across snapshot+restore — the migration's whole point
    // is to change SYNC_BACKEND, and we'd hate to restore stale flags.
    const EXCLUDED = new Set([
        KEY, // recursion guard
        // Migration control surface — these track the migration itself,
        // not user data. Snapshotting them would clobber resume-on-crash
        // state if a user restored mid-pipeline.
        ...(typeof STORAGE_KEYS !== 'undefined' ? [
            STORAGE_KEYS.MIGRATION_ENABLED,
            STORAGE_KEYS.MIGRATION_STATE,
            STORAGE_KEYS.MIGRATION_DRY_RUN,
            STORAGE_KEYS.SYNC_BACKEND,
            STORAGE_KEYS.DEVICE_ID,
            // Per-device identity. The migration replaces SYNC_BACKEND on
            // success; replacing this would orphan the new device record.
            STORAGE_KEYS.SYNC_META_SUPABASE,
        ].filter(Boolean) : []),
    ]);

    function _allKeys() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(PREFIX) && !EXCLUDED.has(k)) out.push(k);
        }
        return out;
    }

    /**
     * Capture every altech_* localStorage key (minus the excluded set) and
     * store it under PRE_MIGRATION_BACKUP. Idempotent — calling twice
     * before a restore overwrites the earlier snapshot. Returns the
     * snapshot record so callers can inspect what was captured.
     *
     * @param {object} [opts]
     * @param {number} [opts.ttlDays=30]
     * @returns {{ takenAt: number, ttlDays: number, keys: Record<string,string> }}
     */
    function snapshot(opts) {
        const ttlDays = (opts && Number.isFinite(opts.ttlDays)) ? opts.ttlDays : DEFAULT_TTL_DAYS;
        const keys = {};
        for (const k of _allKeys()) {
            const v = localStorage.getItem(k);
            if (v != null) keys[k] = v;
        }
        const record = { takenAt: Date.now(), ttlDays, keys };
        localStorage.setItem(KEY, JSON.stringify(record));
        return record;
    }

    function _read() {
        try {
            const raw = localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('[MigrationBackup] parse failed:', e && e.message);
            return null;
        }
    }

    /**
     * Is the snapshot stale (past TTL)? Used by load() to auto-purge.
     */
    function _isExpired(record) {
        if (!record || typeof record.takenAt !== 'number') return false;
        const ttl = Number.isFinite(record.ttlDays) ? record.ttlDays : DEFAULT_TTL_DAYS;
        const ms = ttl * 24 * 60 * 60 * 1000;
        return (Date.now() - record.takenAt) > ms;
    }

    /**
     * Read the snapshot record without restoring. Returns null if absent or
     * stale (and clears the stale record as a side effect).
     */
    function load() {
        const record = _read();
        if (!record) return null;
        if (_isExpired(record)) {
            // Auto-clean: a snapshot past TTL is more confusing than useful.
            try { localStorage.removeItem(KEY); } catch { /* ignore */ }
            return null;
        }
        return record;
    }

    /**
     * Whether a non-stale snapshot exists.
     */
    function exists() {
        return load() !== null;
    }

    /**
     * Age of the snapshot in milliseconds, or null if none.
     */
    function ageMs() {
        const record = load();
        if (!record) return null;
        return Date.now() - record.takenAt;
    }

    /**
     * Restore every key in the snapshot back to localStorage, then delete
     * the snapshot. Excluded keys (SYNC_BACKEND, MIGRATION_*, DEVICE_ID)
     * are left untouched — we only restore the user-data slice.
     *
     * @returns {{ restored: number, skipped: number } | null} stats, or null if nothing to restore.
     */
    function restore() {
        const record = load();
        if (!record || !record.keys) return null;
        let restored = 0, skipped = 0;
        for (const [k, v] of Object.entries(record.keys)) {
            if (EXCLUDED.has(k)) { skipped++; continue; }
            try { localStorage.setItem(k, v); restored++; }
            catch (e) {
                console.error('[MigrationBackup] restore write failed for', k, e && e.message);
            }
        }
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
        return { restored, skipped };
    }

    /**
     * Discard the snapshot without restoring. Called after a successful
     * migration to free localStorage space (typically called by the
     * Session 2 pipeline only after the user confirms the new backend
     * works on day N).
     */
    function clear() {
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    }

    return {
        snapshot,
        load,
        restore,
        exists,
        ageMs,
        clear,
        // Internals exposed for tests + Session 2 wiring.
        _internals: { EXCLUDED, _allKeys, _isExpired, KEY, DEFAULT_TTL_DAYS },
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MigrationBackup: window.MigrationBackup };
}
