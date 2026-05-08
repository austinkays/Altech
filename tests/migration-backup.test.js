// Tests for js/migration-backup.js — Phase D-3 pre-migration safety latch.
//
// Verifies snapshot/restore round-trip, exclusion list (SYNC_BACKEND etc.
// don't get clobbered on restore), TTL auto-expiry, and idempotence.

const _store = new Map();
globalThis.localStorage = {
    get length() { return _store.size; },
    key: (i) => Array.from(_store.keys())[i] ?? null,
    getItem: (k) => _store.has(k) ? _store.get(k) : null,
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
};
globalThis.window = globalThis;
globalThis.STORAGE_KEYS = Object.freeze({
    PRE_MIGRATION_BACKUP: 'altech_pre_migration_backup',
    MIGRATION_ENABLED:    'altech_migration_enabled',
    MIGRATION_STATE:      'altech_migration_state',
    MIGRATION_DRY_RUN:    'altech_migration_dry_run',
    SYNC_BACKEND:         'altech_sync_backend',
    DEVICE_ID:            'altech_device_id',
    SYNC_META_SUPABASE:   'altech_sync_meta_supabase',
});

require('../js/migration-backup.js');
const MigrationBackup = globalThis.window.MigrationBackup;

beforeEach(() => {
    _store.clear();
});

describe('MigrationBackup.snapshot', () => {
    test('captures every altech_* key except the excluded set', () => {
        localStorage.setItem('altech_v6', 'encrypted-form-blob');
        localStorage.setItem('altech_v6_quotes', 'encrypted-quotes-blob');
        localStorage.setItem('altech_cgl_state', '{"hi":1}');
        localStorage.setItem('altech_sync_backend', 'supabase'); // EXCLUDED
        localStorage.setItem('altech_migration_state', 'in-progress'); // EXCLUDED
        localStorage.setItem('altech_device_id', 'dev_xyz'); // EXCLUDED
        localStorage.setItem('not_altech_thing', 'ignored'); // wrong prefix

        const rec = MigrationBackup.snapshot();
        expect(Object.keys(rec.keys).sort()).toEqual([
            'altech_cgl_state',
            'altech_v6',
            'altech_v6_quotes',
        ]);
        expect(rec.keys['altech_v6']).toBe('encrypted-form-blob');
        expect(typeof rec.takenAt).toBe('number');
    });

    test('snapshot persists to localStorage under PRE_MIGRATION_BACKUP', () => {
        localStorage.setItem('altech_v6', 'data');
        MigrationBackup.snapshot();
        const raw = localStorage.getItem('altech_pre_migration_backup');
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw);
        expect(parsed.keys['altech_v6']).toBe('data');
    });

    test('snapshot is idempotent — second call replaces first', () => {
        localStorage.setItem('altech_v6', 'first');
        const a = MigrationBackup.snapshot();

        localStorage.setItem('altech_v6', 'second');
        const b = MigrationBackup.snapshot();

        expect(a.keys['altech_v6']).toBe('first');
        expect(b.keys['altech_v6']).toBe('second');
        // Disk state matches the latest snapshot.
        const raw = JSON.parse(localStorage.getItem('altech_pre_migration_backup'));
        expect(raw.keys['altech_v6']).toBe('second');
    });

    test('snapshot returns null on QuotaExceededError instead of throwing', () => {
        localStorage.setItem('altech_v6', 'big-blob');

        // Simulate a full localStorage by making setItem throw a quota error
        // ONLY when writing to PRE_MIGRATION_BACKUP. Other writes (like the
        // pre-existing altech_v6) still succeed.
        const realSet = localStorage.setItem;
        localStorage.setItem = (k, v) => {
            if (k === 'altech_pre_migration_backup') {
                const err = new Error("Failed to execute 'setItem' on 'Storage': quota exceeded.");
                err.name = 'QuotaExceededError';
                throw err;
            }
            return realSet.call(localStorage, k, v);
        };

        // Silence the expected console.warn so the test output stays clean.
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const result = MigrationBackup.snapshot();
            expect(result).toBeNull();
            expect(warnSpy).toHaveBeenCalled();
        } finally {
            localStorage.setItem = realSet;
            warnSpy.mockRestore();
        }
    });
});

describe('MigrationBackup.restore', () => {
    test('round-trip: snapshot → mutate → restore', () => {
        localStorage.setItem('altech_v6', 'pre-migration');
        localStorage.setItem('altech_reminders', '[{"r":1}]');
        MigrationBackup.snapshot();

        // Pretend the migration ran and clobbered things.
        localStorage.setItem('altech_v6', 'POST-MIGRATION-CIPHERTEXT');
        localStorage.setItem('altech_reminders', 'POST');

        const stats = MigrationBackup.restore();
        expect(stats.restored).toBe(2);
        expect(localStorage.getItem('altech_v6')).toBe('pre-migration');
        expect(localStorage.getItem('altech_reminders')).toBe('[{"r":1}]');
        // Snapshot is consumed after restore.
        expect(localStorage.getItem('altech_pre_migration_backup')).toBeNull();
    });

    test('restore preserves SYNC_BACKEND and other excluded keys', () => {
        // Pre-snapshot: backend was firebase. (Not in snapshot anyway.)
        localStorage.setItem('altech_v6', 'data');
        MigrationBackup.snapshot();

        // Migration flipped to supabase.
        localStorage.setItem('altech_sync_backend', 'supabase');
        localStorage.setItem('altech_v6', 'corrupted');

        MigrationBackup.restore();

        // User data restored, but backend flag stays at the post-migration value.
        expect(localStorage.getItem('altech_v6')).toBe('data');
        expect(localStorage.getItem('altech_sync_backend')).toBe('supabase');
    });

    test('restore returns null when no snapshot exists', () => {
        expect(MigrationBackup.restore()).toBeNull();
    });
});

describe('MigrationBackup.exists / load / ageMs', () => {
    test('exists() reflects a fresh snapshot', () => {
        expect(MigrationBackup.exists()).toBe(false);
        localStorage.setItem('altech_v6', 'x');
        MigrationBackup.snapshot();
        expect(MigrationBackup.exists()).toBe(true);
    });

    test('load() returns the parsed record', () => {
        localStorage.setItem('altech_v6', 'snap');
        MigrationBackup.snapshot();
        const rec = MigrationBackup.load();
        expect(rec.keys['altech_v6']).toBe('snap');
    });

    test('ageMs() returns elapsed time, null if absent', () => {
        expect(MigrationBackup.ageMs()).toBeNull();
        localStorage.setItem('altech_v6', 'x');
        MigrationBackup.snapshot();
        const age = MigrationBackup.ageMs();
        expect(age).toBeGreaterThanOrEqual(0);
        expect(age).toBeLessThan(1000); // taken just now
    });

    test('expired snapshot auto-cleans on load()', () => {
        localStorage.setItem('altech_v6', 'old');
        // Hand-write a record that's 31 days old, ttlDays=30.
        const stale = {
            takenAt: Date.now() - (31 * 24 * 60 * 60 * 1000),
            ttlDays: 30,
            keys: { altech_v6: 'old' },
        };
        localStorage.setItem('altech_pre_migration_backup', JSON.stringify(stale));

        expect(MigrationBackup.load()).toBeNull();
        // Side effect: the stale record was removed.
        expect(localStorage.getItem('altech_pre_migration_backup')).toBeNull();
    });
});

describe('MigrationBackup.clear', () => {
    test('discards the snapshot without restoring', () => {
        localStorage.setItem('altech_v6', 'before');
        MigrationBackup.snapshot();
        localStorage.setItem('altech_v6', 'after');

        MigrationBackup.clear();
        expect(MigrationBackup.exists()).toBe(false);
        expect(localStorage.getItem('altech_v6')).toBe('after'); // not restored
    });
});
