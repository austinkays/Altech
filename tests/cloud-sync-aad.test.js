// Tests for the Phase B AAD wiring in js/cloud-sync.js — every Firestore
// push wraps the payload as a v=2 AAD envelope bound to (table, rowId, uid)
// when the v2 vault is unlocked; pulls unwrap the envelope back to plaintext;
// and the legacy plaintext path is preserved when v2 isn't enrolled.

const nodeCrypto = require('node:crypto');

// ── Browser-style globals — order matters: STORAGE_KEYS first, then load
//    CryptoAAD + CryptoHelper before cloud-sync.
const _store = new Map();
globalThis.localStorage = {
    getItem: (k) => _store.has(k) ? _store.get(k) : null,
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
};
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, addEventListener: () => {} };
globalThis.STORAGE_KEYS = Object.freeze({
    E2E_CRYPTO_V2:    'altech_e2e_crypto_v2',
    ENCRYPTION_SALT:  'altech_encryption_salt',
    SYNC_BACKEND:     'altech_sync_backend',
    DEVICE_ID:        'altech_device_id',
    SYNC_META:        'altech_sync_meta',
    CLOUD_SYNC_DISABLED: 'altech_cloud_sync_disabled',
    FORM:             'altech_v6',
    QUOTES:           'altech_v6_quotes',
    CGL_STATE:        'altech_cgl_state',
    CLIENT_HISTORY:   'altech_client_history',
    QUICKREF_CARDS:   'altech_quickref_cards',
    QUICKREF_NUMBERS: 'altech_quickref_numbers',
    QUICKREF_EMOJIS:  'altech_quickref_emojis',
    REMINDERS:        'altech_reminders',
    AGENCY_GLOSSARY:  'altech_agency_glossary',
    ACCT_VAULT:       'altech_acct_vault_v2',
    ACCT_VAULT_META:  'altech_acct_vault_meta',
    COMMERCIAL_DRAFT: 'altech_commercial_v1',
    COMMERCIAL_QUOTES:'altech_commercial_quotes',
    CARRIER_OVERRIDES:'altech_carrier_overrides',
    DARK_MODE:        'altech_dark_mode',
    THEME:            'altech_theme',
});

// Utils — cloud-sync only uses Utils.tryParseLS, so a minimal shim is enough.
globalThis.window.Utils = {
    tryParseLS: (key, fallback) => {
        try {
            const raw = _store.get(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch { return fallback; }
    },
};

// Argon2id mock (same deterministic stand-in used by other Phase B tests).
globalThis.hashwasm = {
    argon2id: async ({ password, salt, parallelism, iterations, memorySize, hashLength }) => {
        const h = nodeCrypto.createHash('sha256');
        h.update(Buffer.from(password));
        h.update(Buffer.from(salt));
        h.update(Buffer.from(`p=${parallelism}|t=${iterations}|m=${memorySize}|hl=${hashLength}`));
        return new Uint8Array(h.digest()).slice(0, hashLength);
    },
};

require('../js/crypto-aad.js');
const { CryptoHelper } = require('../js/crypto-helper.js');

// ── Firestore mock — captures every set() so tests can assert what was sent.
let capturedWrites = []; // { path: string[], data: any, options: any }
let capturedBatchWrites = [];
let getResponse = { exists: false, data: () => ({}) };
let orderedGetResponse = { docs: [], forEach: function(cb) { this.docs.forEach(cb); } };

function makeFirestoreMock() {
    const docRef = (pathArr) => ({
        get: jest.fn(async () => getResponse),
        set: jest.fn(async (data, options) => {
            capturedWrites.push({ path: pathArr.slice(), data, options });
        }),
        update: jest.fn(async (data) => {
            capturedWrites.push({ path: pathArr.slice(), data, options: { update: true } });
        }),
        delete: jest.fn(async () => {}),
    });
    const collRef = (pathArr) => ({
        doc: (id) => {
            const sub = docRef([...pathArr, id]);
            sub.collection = (name) => collRef([...pathArr, id, name]);
            return sub;
        },
        orderBy: () => ({ get: jest.fn(async () => orderedGetResponse) }),
        get: jest.fn(async () => orderedGetResponse),
    });
    return {
        collection: (name) => collRef([name]),
        batch: () => ({
            set: jest.fn((ref, data, options) => {
                capturedBatchWrites.push({ ref, data, options });
            }),
            delete: jest.fn(),
            commit: jest.fn(async () => {}),
        }),
        enablePersistence: jest.fn(async () => {}),
    };
}

const firestoreMock = makeFirestoreMock();
globalThis.window.firebase = {
    initializeApp: () => ({ name: 'test' }),
    auth: () => ({
        onAuthStateChanged: () => {},
        signOut: async () => {},
    }),
    firestore: () => firestoreMock,
};
globalThis.window.firebase.firestore.FieldValue = {
    serverTimestamp: () => ({ __serverTimestamp: true }),
};

globalThis.window.FirebaseConfig = {
    isReady: true,
    db: firestoreMock,
    init: async () => true,
};

// Auth — cloud-sync reads Auth.uid, Auth.isAdmin, Auth.isSignedIn.
globalThis.window.Auth = {
    uid: 'test-uid-1',
    isAdmin: true,
    isSignedIn: true,
    onSignedIn: () => {},
    onSignedOut: () => {},
};

delete require.cache[require.resolve('../js/cloud-sync.js')];
require('../js/cloud-sync.js');
const CloudSync = globalThis.window.CloudSync;

// ── Helpers ───────────────────────────────────────────────────────────
function lastWrite() { return capturedWrites[capturedWrites.length - 1]; }
function resetMocks() {
    capturedWrites = [];
    capturedBatchWrites = [];
    getResponse = { exists: false, data: () => ({}) };
    orderedGetResponse = { docs: [], forEach: function(cb) { this.docs.forEach(cb); } };
}

beforeEach(async () => {
    _store.clear();
    resetMocks();
    CryptoHelper._internals.reset();
    await CryptoHelper.createVault('cloud-sync-aad-test');
    CryptoHelper.enableV2();
    // Reset Auth uid to known value per test.
    globalThis.window.Auth.uid = 'test-uid-1';
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('CloudSync — Phase B AAD wrapping (push)', () => {
    test('pushToCloud wraps reminders as a v=2 envelope bound to (sync table, rowId, uid)', async () => {
        // Plaintext reminders in localStorage (same as production — REMINDERS isn't encrypted at rest).
        localStorage.setItem('altech_reminders', JSON.stringify([{ id: 1, text: 'call client' }]));

        await CloudSync.pushToCloud();

        const remindersWrite = capturedWrites.find(w => w.path[w.path.length - 1] === 'reminders');
        expect(remindersWrite).toBeDefined();
        // The data field is now the envelope object — NOT the plaintext array.
        const env = remindersWrite.data.data;
        expect(env).toEqual(expect.objectContaining({ v: 2, iv: expect.any(String), ct: expect.any(String) }));

        // Round-trip: same identity reads the plaintext back.
        const envStr = JSON.stringify(env);
        const out = await CryptoHelper.decryptForRow(envStr, {
            table: 'firestore_users_sync',
            rowId: 'reminders',
            userId: 'test-uid-1',
        });
        expect(out).toEqual([{ id: 1, text: 'call client' }]);
    });

    test('AAD binds to row id — envelope from one row refuses to open under another', async () => {
        localStorage.setItem('altech_cgl_state', JSON.stringify({ policies: ['p1', 'p2'] }));

        await CloudSync.pushToCloud();
        const cglWrite = capturedWrites.find(w => w.path[w.path.length - 1] === 'cglState');
        const envStr = JSON.stringify(cglWrite.data.data);

        // Correct identity opens it.
        const ok = await CryptoHelper.decryptForRow(envStr, {
            table: 'firestore_users_sync', rowId: 'cglState', userId: 'test-uid-1',
        });
        expect(ok).toEqual({ policies: ['p1', 'p2'] });

        // Tamper: relabel as a different row → auth tag fails, returns null.
        const tampered = await CryptoHelper.decryptForRow(envStr, {
            table: 'firestore_users_sync', rowId: 'reminders', userId: 'test-uid-1',
        });
        expect(tampered).toBeNull();

        // Tamper: relabel as a different user → auth tag fails.
        const wrongUser = await CryptoHelper.decryptForRow(envStr, {
            table: 'firestore_users_sync', rowId: 'cglState', userId: 'attacker-uid',
        });
        expect(wrongUser).toBeNull();
    });

    test('encrypted-in-localStorage fields (currentForm) round-trip via wrap', async () => {
        const plaintext = { firstName: 'Sam', lastName: 'Smith', addrZip: '99202' };
        const ct = await CryptoHelper.encryptWithV2(plaintext);
        localStorage.setItem('altech_v6', ct);

        await CloudSync.pushToCloud();
        const formWrite = capturedWrites.find(w => w.path[w.path.length - 1] === 'currentForm');
        expect(formWrite).toBeDefined();
        const env = formWrite.data.data;
        expect(env).toEqual(expect.objectContaining({ v: 2 }));

        const opened = await CryptoHelper.decryptForRow(JSON.stringify(env), {
            table: 'firestore_users_sync', rowId: 'currentForm', userId: 'test-uid-1',
        });
        expect(opened).toEqual(plaintext);
    });

    test('push refuses to send plaintext when v2 vault is enrolled but locked', async () => {
        localStorage.setItem('altech_reminders', JSON.stringify([{ id: 1, text: 'oops' }]));
        // Lock the vault BEFORE the push — simulates a sync firing after sign-in
        // but before the user has unlocked.
        CryptoHelper.lock();

        await CloudSync.pushToCloud();
        // The reminders doc should NOT have been written (push failed loudly).
        const remindersWrite = capturedWrites.find(w => w.path[w.path.length - 1] === 'reminders');
        expect(remindersWrite).toBeUndefined();
    });

    test('not-enrolled path: plaintext push is preserved (legacy backward compat)', async () => {
        localStorage.removeItem('altech_e2e_crypto_v2'); // disable v2 enrollment
        localStorage.setItem('altech_reminders', JSON.stringify([{ id: 1, text: 'plain' }]));

        await CloudSync.pushToCloud();
        const remindersWrite = capturedWrites.find(w => w.path[w.path.length - 1] === 'reminders');
        expect(remindersWrite).toBeDefined();
        // Legacy: data field is the plaintext array directly, not an envelope.
        expect(remindersWrite.data.data).toEqual([{ id: 1, text: 'plain' }]);
    });
});

describe('CloudSync — Phase B AAD unwrapping (pull)', () => {
    test('pullFromCloud unwraps a v=2 envelope returned by Firestore', async () => {
        // Pre-bake an envelope tied to (sync table, reminders, test-uid-1).
        const plaintext = [{ id: 7, text: 'follow up' }];
        const envStr = await CryptoHelper.encryptForRow(plaintext, {
            table: 'firestore_users_sync', rowId: 'reminders', userId: 'test-uid-1',
        });
        const env = JSON.parse(envStr);

        // Firestore "returns" the envelope object as the `data` field.
        getResponse = {
            exists: true,
            data: () => ({
                data: env,
                updatedAt: { toMillis: () => Date.now() },
                deviceId: 'remote-device',
            }),
        };

        await CloudSync.pullFromCloud();
        // After the pull, the reminders localStorage slot should hold the
        // plaintext array (cloud-sync writes plaintext for plaintext-stored
        // docs — REMINDERS is one of those).
        const stored = JSON.parse(localStorage.getItem('altech_reminders'));
        expect(stored).toEqual(plaintext);
    });

    test('pull pass-through: legacy plaintext docs still load correctly', async () => {
        // Firestore returns a plain array (pre-Phase-B doc).
        getResponse = {
            exists: true,
            data: () => ({
                data: [{ id: 9, text: 'legacy' }],
                updatedAt: { toMillis: () => Date.now() },
                deviceId: 'remote-device',
            }),
        };
        await CloudSync.pullFromCloud();
        const stored = JSON.parse(localStorage.getItem('altech_reminders'));
        expect(stored).toEqual([{ id: 9, text: 'legacy' }]);
    });

    test('pull drops v=2 envelope when v2 vault is locked', async () => {
        const plaintext = [{ id: 1, text: 'secret' }];
        const envStr = await CryptoHelper.encryptForRow(plaintext, {
            table: 'firestore_users_sync', rowId: 'reminders', userId: 'test-uid-1',
        });
        const env = JSON.parse(envStr);

        getResponse = {
            exists: true,
            data: () => ({
                data: env,
                updatedAt: { toMillis: () => Date.now() },
                deviceId: 'remote-device',
            }),
        };
        CryptoHelper.lock();

        await CloudSync.pullFromCloud();
        // Nothing should have been written for reminders (unwrap returned null
        // so _pullDoc skipped the writeback).
        const stored = localStorage.getItem('altech_reminders');
        // Either no write or null — both indicate the locked path didn't
        // corrupt local state with cleartext from a partial decrypt.
        expect(stored == null || stored === 'null').toBe(true);
    });
});

describe('CloudSync — Phase B AAD wrapping (quotes)', () => {
    test('push wraps each quote under (quotes table, quoteId, uid)', async () => {
        // Two quotes in localStorage as encrypted ciphertext.
        const quoteArr = [
            { id: 'q-001', name: 'Smith Auto', data: { premium: 1200 } },
            { id: 'q-002', name: 'Jones Home', data: { premium: 980 } },
        ];
        localStorage.setItem('altech_v6_quotes', await CryptoHelper.encryptWithV2(quoteArr));

        await CloudSync.pushToCloud();
        // Quotes go through the batch path.
        expect(capturedBatchWrites.length).toBe(2);
        for (const w of capturedBatchWrites) {
            expect(w.data.payload).toEqual(expect.objectContaining({ v: 2 }));
            // No plaintext name field at top level — full encryption.
            expect(w.data.name).toBeUndefined();
        }
    });

    test('quotes round-trip via push → pull', async () => {
        // Push first
        const quoteArr = [{ id: 'q-rt-1', name: 'Round Trip', data: { x: 1 } }];
        localStorage.setItem('altech_v6_quotes', await CryptoHelper.encryptWithV2(quoteArr));
        await CloudSync.pushToCloud();

        // Now simulate Firestore returning that same envelope shape.
        const pushed = capturedBatchWrites[0].data;
        orderedGetResponse = {
            docs: [{
                id: 'q-rt-1',
                data: () => ({
                    payload: pushed.payload,
                    updatedAt: { toMillis: () => Date.now() + 1000 }, // newer
                    deviceId: 'another-device',
                }),
            }],
            forEach(cb) { this.docs.forEach(cb); },
        };
        // Bump local lastSync_quotes so the merge path sees the remote as newer.
        // (Default is 0, so anything > 0 wins.)

        await CloudSync.pullFromCloud();
        const stored = await CryptoHelper.decrypt(localStorage.getItem('altech_v6_quotes'));
        expect(Array.isArray(stored)).toBe(true);
        const match = stored.find(q => q.id === 'q-rt-1');
        expect(match).toBeDefined();
        expect(match.name).toBe('Round Trip');
        expect(match.data).toEqual({ x: 1 });
    });
});
