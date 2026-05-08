// Tests for the Session 2 migration pipeline in js/migration-ui.js.
//
// Covers the four contracts the runtime must hold:
//   1. Happy path — snapshot taken, every doc/quote pushed as a v=2
//      AAD-bound envelope, vault meta written, backend flipped, E2E flag set.
//   2. Dry run — same plumbing, but SYNC_BACKEND is reverted at the end and
//      E2E_CRYPTO_V2 stays unset.
//   3. Hard failure mid-pipeline — pushBlob throws → snapshot restored,
//      SYNC_BACKEND reverted, MIGRATION_STATE=error, error step shown.
//   4. Resume detection — a stale MIGRATION_STATE='in-progress' on open()
//      means the previous run died; the snapshot is restored and the user
//      is sent to the error step with a clear message.
//
// Every external dep is mocked: CryptoHelper, CloudSync, SupabaseSync,
// SupabaseAuth, VaultMeta, window.Supabase, Auth, FirebaseConfig. This is
// a pipeline test, not an integration test — those modules have their
// own dedicated test files.

// ── Globals (must precede module loads) ──────────────────────────────────
globalThis.window = globalThis;

// ── localStorage shim ─────────────────────────────────────────────────────
const _store = new Map();
globalThis.localStorage = {
    get length() { return _store.size; },
    key: (i) => Array.from(_store.keys())[i] ?? null,
    getItem: (k) => _store.has(k) ? _store.get(k) : null,
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
};

// ── STORAGE_KEYS (must precede module load) ──────────────────────────────
globalThis.STORAGE_KEYS = Object.freeze({
    FORM:                    'altech_v6',
    QUOTES:                  'altech_v6_quotes',
    CGL_STATE:               'altech_cgl_state',
    CLIENT_HISTORY:          'altech_client_history',
    QUICKREF_CARDS:          'altech_quickref_cards',
    QUICKREF_NUMBERS:        'altech_quickref_numbers',
    QUICKREF_EMOJIS:         'altech_quickref_emojis',
    REMINDERS:               'altech_reminders',
    AGENCY_GLOSSARY:         'altech_agency_glossary',
    ACCT_VAULT:              'altech_acct_vault',
    ACCT_VAULT_META:         'altech_acct_vault_meta',
    COMMERCIAL_DRAFT:        'altech_commercial_draft',
    COMMERCIAL_QUOTES:       'altech_commercial_quotes',
    PRE_MIGRATION_BACKUP:    'altech_pre_migration_backup',
    MIGRATION_ENABLED:       'altech_migration_enabled',
    MIGRATION_STATE:         'altech_migration_state',
    MIGRATION_DRY_RUN:       'altech_migration_dry_run',
    SYNC_BACKEND:            'altech_sync_backend',
    DEVICE_ID:               'altech_device_id',
    SYNC_META_SUPABASE:      'altech_sync_meta_supabase',
    E2E_CRYPTO_V2:           'altech_e2e_crypto_v2',
    VAULT_LOCAL_META:        'altech_vault_meta_local',
});

// ── Minimal DOM shim ──────────────────────────────────────────────────────
const _domEls = new Map();
function _makeEl() {
    return {
        textContent: '',
        style: { width: '', display: '' },
        classList: { add() {}, remove() {} },
        querySelectorAll: () => [],
        querySelector: () => null,
        dataset: {},
    };
}
for (const sel of ['#migrationModal', '#migrationProgressBar', '#migrationProgressLabel',
    '#migrationDoneNote']) {
    _domEls.set(sel, _makeEl());
}
// modal has querySelectorAll([data-step]) — return [] is fine for tests.
globalThis.document = {
    querySelector: (sel) => _domEls.get(sel) || null,
    createElement: () => ({ click() {}, href: '', download: '' }),
    body: { appendChild() {}, removeChild() {} },
};

// ── External-module mocks ─────────────────────────────────────────────────
function _resetMocks() {
    globalThis.window = globalThis;

    // Auth — current Firebase user.
    globalThis.Auth = {
        uid: 'fb-uid-1',
        email: 'agent@example.com',
        isSignedIn: true,
    };

    // FirebaseConfig — used only by _markFirebaseUserMigrated.
    const _profileWrites = [];
    globalThis.FirebaseConfig = {
        db: {
            collection: (top) => ({
                doc: (uid) => ({
                    collection: (sub) => ({
                        doc: (docId) => ({
                            set: jest.fn(async (data) => {
                                _profileWrites.push({ top, uid, sub, docId, data });
                                return true;
                            }),
                        }),
                    }),
                }),
            }),
        },
        _profileWrites,
    };

    // CloudSync — the migration only calls pullFromCloud (best-effort).
    globalThis.CloudSync = {
        pullFromCloud: jest.fn(async () => ({ ok: true })),
    };

    // CryptoHelper — decrypt() echoes JSON-parseable strings as objects;
    // encryptForRow returns a deterministic envelope; decryptForRow inverts it.
    globalThis.CryptoHelper = {
        decrypt: jest.fn(async (raw) => {
            // Simulate "current key can decrypt" only for our marked
            // ciphertext convention: 'CT::<json>'.
            if (typeof raw !== 'string') return null;
            if (raw.startsWith('CT::')) {
                try { return JSON.parse(raw.slice(4)); } catch { return null; }
            }
            return null;
        }),
        encryptForRow: jest.fn(async (data, identity) => {
            // Encode the AAD identity inline so verifyRoundTrip's auth-tag
            // analogue can detect tampering.
            return JSON.stringify({
                v: 2,
                iv: 'iv-fixed',
                ct: Buffer.from(JSON.stringify({ data, identity })).toString('base64'),
            });
        }),
        decryptForRow: jest.fn(async (envelope, identity) => {
            if (envelope == null) return null;
            let env;
            try { env = (typeof envelope === 'string') ? JSON.parse(envelope) : envelope; }
            catch { return null; }
            if (!env || env.v !== 2) return null;
            const decoded = JSON.parse(Buffer.from(env.ct, 'base64').toString('utf8'));
            // Simulate AAD auth-tag check by comparing identity equality.
            if (JSON.stringify(decoded.identity) !== JSON.stringify(identity)) return null;
            return decoded.data;
        }),
    };

    // SupabaseAuth — signUp / signIn.
    globalThis.SupabaseAuth = {
        signUp: jest.fn(async (email, pw) => ({ user: { email } })),
        signIn: jest.fn(async (email, pw) => ({ user: { email } })),
    };

    // window.Supabase client — getSession returns a fixed uid.
    globalThis.window.Supabase = {
        isReady: true,
        client: {
            auth: {
                getSession: jest.fn(async () => ({
                    data: { session: { user: { id: 'sb-uid-2' } } },
                })),
                getUser: jest.fn(async () => ({ data: { user: { id: 'sb-uid-2' } } })),
            },
        },
        init: jest.fn(async () => true),
    };

    // SupabaseSync — push/pull/list with in-memory state.
    const _blobs = new Map(); // docKey → ciphertext
    const _quotes = new Map(); // id → ciphertext
    globalThis.SupabaseSync = {
        DOC_LOCAL_KEYS: Object.freeze({
            currentForm:      STORAGE_KEYS.FORM,
            cglState:         STORAGE_KEYS.CGL_STATE,
            reminders:        STORAGE_KEYS.REMINDERS,
            commercialDraft:  STORAGE_KEYS.COMMERCIAL_DRAFT,
        }),
        pushBlob: jest.fn(async (docKey, ciphertext, _u, identity) => {
            _blobs.set(docKey, ciphertext);
            return { ok: true };
        }),
        pullBlob: jest.fn(async (docKey) => {
            const ct = _blobs.get(docKey);
            if (ct == null) return null;
            return { ciphertext: ct };
        }),
        pushQuote: jest.fn(async (id, ciphertext) => {
            _quotes.set(id, ciphertext);
            return { ok: true, id };
        }),
        _blobs, _quotes,
    };

    // VaultMeta — record what was saved.
    const _vaultSaves = [];
    globalThis.VaultMeta = {
        save: jest.fn(async (partial) => {
            _vaultSaves.push(partial);
            return { ...partial, updatedAt: new Date().toISOString() };
        }),
        _vaultSaves,
    };
}

// ── Load deps + SUT ───────────────────────────────────────────────────────
require('../js/migration-backup.js'); // real module
const MigrationBackup = globalThis.window.MigrationBackup;
require('../js/migration-ui.js');     // SUT
const MigrationUI = globalThis.window.MigrationUI;

// ── Helpers ───────────────────────────────────────────────────────────────
function _seedLocalDocs() {
    // currentForm is "encrypted" with our convention so decrypt returns an object.
    localStorage.setItem(STORAGE_KEYS.FORM, 'CT::' + JSON.stringify({ firstName: 'Pat', lastName: 'Q' }));
    // others stored as plain JSON.
    localStorage.setItem(STORAGE_KEYS.CGL_STATE,        JSON.stringify({ snoozed: ['p1', 'p2'] }));
    localStorage.setItem(STORAGE_KEYS.REMINDERS,        JSON.stringify([{ id: 'r1', text: 'call back' }]));
    localStorage.setItem(STORAGE_KEYS.COMMERCIAL_DRAFT, JSON.stringify({ bizName: 'Acme' }));
    // a quote with encrypted body
    localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify([
        { id: 'q-001', data: 'CT::' + JSON.stringify({ premium: 1234 }) },
    ]));
}

function _seedCryptoMaterial() {
    MigrationUI._internal.setState({
        firebasePassword: 'fb-pass-123',
        passphrase: 'new-pass-XYZ',
        cryptoMaterial: {
            passphraseSaltB64:      'salt-A',
            passphraseWrappedMKB64: 'wrap-A',
            passphraseIterations:   null,
            passphraseKdf:          'argon2id-v1',
            passphraseKdfParams:    { mem: 65536, time: 3, parallelism: 1 },
            recoverySaltB64:        'salt-R',
            recoveryWrappedMKB64:   'wrap-R',
            recoveryIterations:     null,
            recoveryKdf:            'argon2id-v1',
            recoveryKdfParams:      { mem: 65536, time: 3, parallelism: 1 },
            kdfTree:                'hkdf-v1',
        },
    });
}

beforeEach(() => {
    _store.clear();
    _resetMocks();
    localStorage.setItem(STORAGE_KEYS.MIGRATION_ENABLED, '1');
    localStorage.setItem(STORAGE_KEYS.SYNC_BACKEND, 'firebase'); // pre-migration state
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('runMigration — happy path', () => {
    test('moves every doc to Supabase as v=2 envelope and flips the backend', async () => {
        _seedLocalDocs();
        _seedCryptoMaterial();

        await MigrationUI._internal.runMigration();

        // Snapshot was taken before any mutation.
        const backupRaw = localStorage.getItem(STORAGE_KEYS.PRE_MIGRATION_BACKUP);
        expect(backupRaw).not.toBeNull();

        // Pulled fresh from Firebase first.
        expect(CloudSync.pullFromCloud).toHaveBeenCalledTimes(1);

        // Signed up to Supabase with Firebase email + reauth password.
        expect(SupabaseAuth.signUp).toHaveBeenCalledWith('agent@example.com', 'fb-pass-123');

        // Vault meta saved with Phase A defaults.
        expect(VaultMeta.save).toHaveBeenCalledTimes(1);
        const saved = VaultMeta._vaultSaves[0];
        expect(saved.passphraseKdf).toBe('argon2id-v1');
        expect(saved.kdfTree).toBe('hkdf-v1');
        expect(saved.passphraseSaltB64).toBe('salt-A');
        expect(saved.recoveryWrappedMKB64).toBe('wrap-R');

        // Every doc was pushed with the right identity.
        const pushedKeys = SupabaseSync.pushBlob.mock.calls.map(c => c[0]).sort();
        expect(pushedKeys).toEqual(['cglState', 'commercialDraft', 'currentForm', 'reminders']);
        for (const call of SupabaseSync.pushBlob.mock.calls) {
            const [docKey, , , identity] = call;
            expect(identity).toEqual({ table: 'user_blobs', rowId: docKey, userId: 'sb-uid-2' });
        }

        // Quote was pushed with table=user_quotes identity.
        expect(SupabaseSync.pushQuote).toHaveBeenCalledTimes(1);
        const [quoteId, , quoteIdentity] = SupabaseSync.pushQuote.mock.calls[0];
        expect(quoteId).toBe('q-001');
        expect(quoteIdentity).toEqual({ table: 'user_quotes', rowId: 'q-001', userId: 'sb-uid-2' });

        // Verification round-trip executed.
        expect(SupabaseSync.pullBlob).toHaveBeenCalledTimes(1);
        expect(CryptoHelper.decryptForRow).toHaveBeenCalled();

        // Final state: backend flipped, E2E flag set, MIGRATION_STATE=complete.
        expect(localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND)).toBe('supabase');
        expect(localStorage.getItem(STORAGE_KEYS.E2E_CRYPTO_V2)).toBe('1');
        expect(localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE)).toBe('complete');

        // Firebase profile marked migrated.
        expect(FirebaseConfig._profileWrites.length).toBe(1);
        expect(FirebaseConfig._profileWrites[0].data.migratedToSupabase).toBe(true);

        // Sensitive transient state wiped.
        const finalState = MigrationUI._internal.getState();
        expect(finalState.firebasePassword).toBeNull();
        expect(finalState.passphrase).toBeNull();
    });

    test('happy path falls back to signIn when account already exists', async () => {
        _seedLocalDocs();
        _seedCryptoMaterial();
        SupabaseAuth.signUp.mockRejectedValueOnce(new Error('User already registered'));

        await MigrationUI._internal.runMigration();

        expect(SupabaseAuth.signUp).toHaveBeenCalledTimes(1);
        expect(SupabaseAuth.signIn).toHaveBeenCalledWith('agent@example.com', 'fb-pass-123');
        expect(localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE)).toBe('complete');
    });

    test('happy path forces signIn when signUp returns no session (email-confirm OFF)', async () => {
        _seedLocalDocs();
        _seedCryptoMaterial();
        // Simulate signUp succeeding but returning no session — this is the
        // shape Supabase returns whether confirm is on or off; the code
        // forces a signIn next, which only succeeds when confirm is OFF.
        SupabaseAuth.signUp.mockResolvedValueOnce({ user: { email: 'agent@example.com' }, session: null });

        await MigrationUI._internal.runMigration();

        expect(SupabaseAuth.signUp).toHaveBeenCalledTimes(1);
        expect(SupabaseAuth.signIn).toHaveBeenCalledWith('agent@example.com', 'fb-pass-123');
        expect(localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE)).toBe('complete');
    });

    test('hard failure when email confirmation is required', async () => {
        _seedLocalDocs();
        _seedCryptoMaterial();
        SupabaseAuth.signUp.mockResolvedValueOnce({ user: { email: 'agent@example.com' }, session: null });
        SupabaseAuth.signIn.mockRejectedValueOnce(new Error('Email not confirmed'));

        await MigrationUI._internal.runMigration();

        const finalState = MigrationUI._internal.getState();
        expect(localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE)).toBe('error');
        expect(finalState.error).toMatch(/Confirm email/i);
        // Backend never flipped — confirmed by SYNC_BACKEND staying at firebase.
        expect(localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND)).toBe('firebase');
    });
});

describe('runMigration — dry run', () => {
    test('copies + verifies but does NOT flip backend or set E2E flag', async () => {
        _seedLocalDocs();
        _seedCryptoMaterial();
        localStorage.setItem(STORAGE_KEYS.MIGRATION_DRY_RUN, '1');

        await MigrationUI._internal.runMigration();

        // Pushes happened (verified the path works).
        expect(SupabaseSync.pushBlob).toHaveBeenCalled();
        expect(VaultMeta.save).toHaveBeenCalled();

        // But the destination flags are reverted.
        expect(localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND)).toBe('firebase');
        expect(localStorage.getItem(STORAGE_KEYS.E2E_CRYPTO_V2)).toBeNull();

        // No Firebase profile flip.
        expect(FirebaseConfig._profileWrites.length).toBe(0);

        // Marked complete (dry run still counts as a clean run).
        expect(localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE)).toBe('complete');
    });
});

describe('runMigration — hard failure', () => {
    test('pushBlob throws → snapshot restored, backend reverted, error step', async () => {
        _seedLocalDocs();
        _seedCryptoMaterial();

        // First push succeeds, second one throws.
        let pushCallCount = 0;
        SupabaseSync.pushBlob.mockImplementation(async (docKey) => {
            pushCallCount++;
            if (pushCallCount === 2) return { ok: false, error: { message: 'boom-network-died' } };
            return { ok: true };
        });

        // Mutate localStorage post-snapshot to verify restore worked.
        const preFormValue = localStorage.getItem(STORAGE_KEYS.FORM);

        await MigrationUI._internal.runMigration();

        // SYNC_BACKEND was reverted to firebase.
        expect(localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND)).toBe('firebase');
        // E2E flag never set.
        expect(localStorage.getItem(STORAGE_KEYS.E2E_CRYPTO_V2)).toBeNull();
        // Marked error.
        expect(localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE)).toBe('error');

        // Original FORM ciphertext is still in localStorage (restore put it back).
        expect(localStorage.getItem(STORAGE_KEYS.FORM)).toBe(preFormValue);

        // Error message surfaced.
        const finalState = MigrationUI._internal.getState();
        expect(finalState.error).toMatch(/boom-network-died|Push failed|Migration failed/i);
    });

    test('verification mismatch → snapshot restored, error step', async () => {
        _seedLocalDocs();
        _seedCryptoMaterial();

        // Tamper: pullBlob returns a different envelope than what was pushed.
        SupabaseSync.pullBlob.mockImplementation(async () => ({
            ciphertext: JSON.stringify({
                v: 2, iv: 'iv-fixed',
                ct: Buffer.from(JSON.stringify({
                    data: { firstName: 'WRONG' },
                    identity: { table: 'user_blobs', rowId: 'currentForm', userId: 'sb-uid-2' },
                })).toString('base64'),
            }),
        }));

        await MigrationUI._internal.runMigration();

        expect(localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE)).toBe('error');
        expect(localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND)).toBe('firebase');
        const finalState = MigrationUI._internal.getState();
        expect(finalState.error).toMatch(/[Vv]erification|round-trip/);
    });
});

describe('open() — resume detection', () => {
    test('stale MIGRATION_STATE=in-progress on open triggers snapshot restore + error step', () => {
        // Simulate an interrupted previous run.
        localStorage.setItem(STORAGE_KEYS.MIGRATION_STATE, 'in-progress');
        // Pre-existing snapshot from that run.
        localStorage.setItem(STORAGE_KEYS.FORM, 'CT::' + JSON.stringify({ firstName: 'OLD' }));
        MigrationBackup.snapshot();
        // Mid-pipeline mutation that the interrupted run left behind.
        localStorage.setItem(STORAGE_KEYS.FORM, '{"v":2,"iv":"x","ct":"midflight"}');

        MigrationUI.open();

        // MIGRATION_STATE reset.
        expect(localStorage.getItem(STORAGE_KEYS.MIGRATION_STATE)).toBe('not-started');

        // FORM ciphertext is back to the pre-interruption value.
        expect(localStorage.getItem(STORAGE_KEYS.FORM)).toBe('CT::' + JSON.stringify({ firstName: 'OLD' }));

        // User is on the error step with a "previous run interrupted" message.
        const finalState = MigrationUI._internal.getState();
        expect(finalState.currentStep).toBe('error');
        expect(finalState.error).toMatch(/interrupted/i);
    });
});
