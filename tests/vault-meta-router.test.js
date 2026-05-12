// Tests for js/vault-meta.js — Phase C router.
//
// Verifies the router picks the right backend (Supabase when SYNC_BACKEND
// flag is on AND Supabase ready AND user signed in; else local), that
// save() always writes local FIRST (the unblocking guarantee) and mirrors
// to Supabase best-effort, and that the field mapping round-trips JS
// camelCase ↔ DB snake_case losslessly.

const _store = new Map();
globalThis.localStorage = {
    getItem: (k) => _store.has(k) ? _store.get(k) : null,
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
};
globalThis.window = globalThis;
globalThis.STORAGE_KEYS = Object.freeze({
    VAULT_LOCAL_META: 'altech_vault_meta_local',
    SYNC_BACKEND:     'altech_sync_backend',
});

// Programmable Supabase stub. Tests can replace `_remoteRow` and assert
// upsert/delete payloads via `_lastUpsert` / `_lastDelete`.
let _remoteRow = null;
let _lastUpsert = null;
let _lastDelete = null;
let _supabaseShouldFail = false;
function makeSupabaseStub({ ready = true, uid = 'user-test-uid' } = {}) {
    return {
        isReady: ready,
        client: ready ? {
            auth: {
                getSession: async () => uid
                    ? ({ data: { session: { user: { id: uid } } } })
                    : ({ data: { session: null } }),
            },
            from(table) {
                expect(table).toBe('user_crypto_meta');
                return {
                    select() { return this; },
                    eq() { return this; },
                    maybeSingle: async () => _supabaseShouldFail
                        ? { data: null, error: new Error('simulated network failure') }
                        : { data: _remoteRow, error: null },
                    upsert(row) {
                        _lastUpsert = row;
                        if (_supabaseShouldFail) {
                            return { error: new Error('simulated upsert failure') };
                        }
                        _remoteRow = { ...row };
                        return { error: null };
                    },
                    delete() {
                        return {
                            eq: async () => {
                                _lastDelete = { ..._remoteRow };
                                _remoteRow = null;
                                return { error: null };
                            },
                        };
                    },
                };
            },
        } : null,
    };
}

require('../js/vault-meta.js');
const VaultMeta = globalThis.window.VaultMeta;

beforeEach(() => {
    _store.clear();
    _remoteRow = null;
    _lastUpsert = null;
    _lastDelete = null;
    _supabaseShouldFail = false;
    delete globalThis.window.Supabase;
});

const fullMeta = () => ({
    passphraseSaltB64:      'salt-b64-aaaaaaaaaaaaaaaaaaaaaa',
    passphraseWrappedMKB64: 'wrapped-mk-b64-yyyyyyyyyyyyyyyy',
    passphraseIterations:   null,
    passphraseKdf:          'argon2id-v1',
    passphraseKdfParams:    { memMiB: 64, time: 3, parallelism: 1 },
    recoverySaltB64:        null,
    recoveryWrappedMKB64:   null,
    recoveryIterations:     null,
    recoveryKdf:            null,
    recoveryKdfParams:      null,
    kdfTree:                'hkdf-v1',
});

describe('VaultMeta — local-only mode (Supabase off)', () => {
    test('save → load round-trip', async () => {
        const saved = await VaultMeta.save(fullMeta());
        const loaded = await VaultMeta.load();
        expect(loaded).toMatchObject({
            passphraseSaltB64: 'salt-b64-aaaaaaaaaaaaaaaaaaaaaa',
            kdfTree: 'hkdf-v1',
        });
        expect(loaded.updatedAt).toBe(saved.updatedAt);
    });

    test('partial save merges onto current', async () => {
        await VaultMeta.save(fullMeta());
        await VaultMeta.save({ recoveryKdf: 'argon2id-v1', recoverySaltB64: 'rec-salt-b64' });
        const loaded = await VaultMeta.load();
        expect(loaded.passphraseSaltB64).toBe('salt-b64-aaaaaaaaaaaaaaaaaaaaaa');
        expect(loaded.recoveryKdf).toBe('argon2id-v1');
        expect(loaded.recoverySaltB64).toBe('rec-salt-b64');
    });

    test('exists() reflects local presence', async () => {
        expect(await VaultMeta.exists()).toBe(false);
        await VaultMeta.save(fullMeta());
        expect(await VaultMeta.exists()).toBe(true);
    });

    test('clear() wipes local meta', async () => {
        await VaultMeta.save(fullMeta());
        await VaultMeta.clear();
        expect(await VaultMeta.load()).toBeNull();
        expect(await VaultMeta.exists()).toBe(false);
    });
});

describe('VaultMeta — Supabase backend active', () => {
    beforeEach(() => {
        localStorage.setItem('altech_sync_backend', 'supabase');
        globalThis.window.Supabase = makeSupabaseStub();
    });

    test('save mirrors to Supabase with snake_case columns', async () => {
        await VaultMeta.save(fullMeta());
        expect(_lastUpsert).not.toBeNull();
        expect(_lastUpsert.user_id).toBe('user-test-uid');
        expect(_lastUpsert.passphrase_salt).toBe('salt-b64-aaaaaaaaaaaaaaaaaaaaaa');
        expect(_lastUpsert.passphrase_wrapped_mk).toBe('wrapped-mk-b64-yyyyyyyyyyyyyyyy');
        expect(_lastUpsert.passphrase_kdf).toBe('argon2id-v1');
        expect(_lastUpsert.passphrase_kdf_params).toEqual({ memMiB: 64, time: 3, parallelism: 1 });
        expect(_lastUpsert.kdf_tree).toBe('hkdf-v1');
        expect(typeof _lastUpsert.rotated_at).toBe('string');
    });

    test('load prefers Supabase, refreshes local cache', async () => {
        // Pre-seed Supabase with a record device-A would have written.
        _remoteRow = {
            user_id:                'user-test-uid',
            passphrase_salt:        'remote-salt-b64',
            passphrase_wrapped_mk:  'remote-wrap-b64',
            passphrase_kdf:         'argon2id-v1',
            passphrase_kdf_params:  { memMiB: 64, time: 3, parallelism: 1 },
            kdf_tree:               'hkdf-v1',
            rotated_at:             '2026-05-07T01:23:45.000Z',
        };
        // Local cache has stale data pre-flip.
        await localStorage.setItem('altech_vault_meta_local', JSON.stringify({
            passphraseSaltB64: 'STALE',
            updatedAt: '2025-01-01T00:00:00.000Z',
        }));

        const loaded = await VaultMeta.load();
        expect(loaded.passphraseSaltB64).toBe('remote-salt-b64');
        expect(loaded.passphraseWrappedMKB64).toBe('remote-wrap-b64');
        expect(loaded.kdfTree).toBe('hkdf-v1');
        // Local cache was refreshed.
        const cached = JSON.parse(localStorage.getItem('altech_vault_meta_local'));
        expect(cached.passphraseSaltB64).toBe('remote-salt-b64');
    });

    test('load falls back to local cache when Supabase unreachable', async () => {
        _supabaseShouldFail = true;
        await localStorage.setItem('altech_vault_meta_local', JSON.stringify({
            passphraseSaltB64: 'local-cache-salt',
        }));
        const loaded = await VaultMeta.load();
        expect(loaded.passphraseSaltB64).toBe('local-cache-salt');
    });

    test('save still succeeds locally when Supabase mirror fails', async () => {
        _supabaseShouldFail = true;
        const saved = await VaultMeta.save(fullMeta());
        // Local got it.
        const loaded = JSON.parse(localStorage.getItem('altech_vault_meta_local'));
        expect(loaded.passphraseSaltB64).toBe('salt-b64-aaaaaaaaaaaaaaaaaaaaaa');
        // Promise resolved with merged record (no throw).
        expect(saved.passphraseSaltB64).toBe('salt-b64-aaaaaaaaaaaaaaaaaaaaaa');
    });

    test('save skips Supabase when passphrase_salt is missing (NOT NULL constraint)', async () => {
        // Initial save without passphrase fields — server would reject this.
        await VaultMeta.save({ kdfTree: 'hkdf-v1' });
        expect(_lastUpsert).toBeNull(); // no Supabase write attempted
        // Later, complete record arrives — now Supabase mirror runs.
        await VaultMeta.save(fullMeta());
        expect(_lastUpsert).not.toBeNull();
        expect(_lastUpsert.passphrase_salt).toBe('salt-b64-aaaaaaaaaaaaaaaaaaaaaa');
        // The earlier kdfTree:'hkdf-v1' merged in too.
        expect(_lastUpsert.kdf_tree).toBe('hkdf-v1');
    });

    test('clear() wipes both local and Supabase', async () => {
        _remoteRow = { user_id: 'user-test-uid', passphrase_salt: 'x' };
        await localStorage.setItem('altech_vault_meta_local', '{}');
        await VaultMeta.clear();
        expect(localStorage.getItem('altech_vault_meta_local')).toBeNull();
        expect(_remoteRow).toBeNull();
    });

    test('falls back to local-only when SYNC_BACKEND is firebase', async () => {
        localStorage.setItem('altech_sync_backend', 'firebase');
        await VaultMeta.save(fullMeta());
        // No Supabase write should happen even though the stub is in place.
        expect(_lastUpsert).toBeNull();
    });

    test('falls back to local-only when Supabase has no session', async () => {
        globalThis.window.Supabase = makeSupabaseStub({ uid: null });
        await VaultMeta.save(fullMeta());
        expect(_lastUpsert).toBeNull();
    });
});

describe('VaultMeta — Phase D default (missing SYNC_BACKEND flag)', () => {
    // Regression: fresh installs (no SYNC_BACKEND flag set) used to fall
    // through to local-only vault meta, which left passphrase unlock reading
    // absent/stale local metadata and failing silently. Phase D treats a
    // missing flag as Supabase. This block verifies VaultMeta matches the
    // sync-facade / supabase-auth / supabase-sync / cloud-sync pattern.
    beforeEach(() => {
        // Crucial: leave SYNC_BACKEND unset and stand up the Supabase stub.
        globalThis.window.Supabase = makeSupabaseStub();
    });

    test('save mirrors to Supabase even without SYNC_BACKEND flag', async () => {
        expect(localStorage.getItem('altech_sync_backend')).toBeNull();
        await VaultMeta.save(fullMeta());
        expect(_lastUpsert).not.toBeNull();
        expect(_lastUpsert.passphrase_salt).toBe('salt-b64-aaaaaaaaaaaaaaaaaaaaaa');
    });

    test('load prefers Supabase even without SYNC_BACKEND flag', async () => {
        expect(localStorage.getItem('altech_sync_backend')).toBeNull();
        _remoteRow = {
            user_id:               'user-test-uid',
            passphrase_salt:       'remote-salt-default-supabase',
            passphrase_wrapped_mk: 'remote-wrap-b64',
            kdf_tree:              'hkdf-v1',
            rotated_at:            '2026-05-12T01:23:45.000Z',
        };
        const loaded = await VaultMeta.load();
        expect(loaded.passphraseSaltB64).toBe('remote-salt-default-supabase');
    });

    test('still respects an explicit SYNC_BACKEND=firebase opt-out', async () => {
        localStorage.setItem('altech_sync_backend', 'firebase');
        await VaultMeta.save(fullMeta());
        expect(_lastUpsert).toBeNull();
    });
});

describe('VaultMeta — field mapping', () => {
    test('toDbRow keeps known fields, drops unknown', () => {
        const row = VaultMeta._internals.toDbRow({
            passphraseSaltB64: 'a',
            passphraseKdf:     'argon2id-v1',
            randomLocalField:  'should be dropped',
            updatedAt:         'should be dropped — uses rotated_at',
        });
        expect(row).toEqual({
            passphrase_salt: 'a',
            passphrase_kdf:  'argon2id-v1',
        });
    });

    test('fromDbRow renames + coalesces timestamps', () => {
        const out = VaultMeta._internals.fromDbRow({
            user_id:               'user-x',
            passphrase_salt:       'a',
            passphrase_wrapped_mk: 'b',
            pbkdf2_iterations:     600000,
            kdf_tree:              'hkdf-v1',
            rotated_at:            '2026-05-07T00:00:00Z',
            created_at:            '2026-04-01T00:00:00Z',
        });
        expect(out.passphraseSaltB64).toBe('a');
        expect(out.passphraseWrappedMKB64).toBe('b');
        expect(out.passphraseIterations).toBe(600000);
        expect(out.kdfTree).toBe('hkdf-v1');
        expect(out.updatedAt).toBe('2026-05-07T00:00:00Z'); // rotated_at preferred
        expect(out.user_id).toBeUndefined(); // not in DB_TO_JS map
    });

    test('round-trip: JS → DB → JS preserves all non-null known fields', () => {
        // toDbRow intentionally drops null values now (May 11, 2026 fix) so
        // Argon2id vaults don't send `pbkdf2_iterations: null` and trip the
        // NOT NULL constraint on user_crypto_meta. Round-trip is asymmetric
        // for null fields: they go in as null, get dropped, and come back as
        // undefined (key absent from server row). That's intentional.
        const original = fullMeta();
        const db = VaultMeta._internals.toDbRow(original);
        const serverShape = { ...db, rotated_at: '2026-05-07T12:00:00Z' };
        const back = VaultMeta._internals.fromDbRow(serverShape);
        for (const k of Object.keys(VaultMeta._internals.JS_TO_DB)) {
            if (original[k] == null) {
                // Null input → dropped from DB row → undefined on read back.
                expect(back[k]).toBeUndefined();
            } else {
                expect(back[k]).toEqual(original[k]);
            }
        }
    });
});
