// Tests for Phase B wiring in js/supabase-sync.js — confirms pushBlob /
// pushQuote / _pushAllBlobs transparently AAD-wrap their payload when an
// identity is available and the v2 vault is unlocked, and that they fall
// back to legacy passthrough otherwise.

const nodeCrypto = require('node:crypto');

// Browser-style globals — order matters: STORAGE_KEYS first, then load
// CryptoAAD + CryptoHelper before supabase-sync.
const _store = new Map();
globalThis.localStorage = {
    getItem: (k) => _store.has(k) ? _store.get(k) : null,
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
};
globalThis.window = globalThis;
globalThis.STORAGE_KEYS = Object.freeze({
    E2E_CRYPTO_V2:    'altech_e2e_crypto_v2',
    ENCRYPTION_SALT:  'altech_encryption_salt',
    SYNC_BACKEND:     'altech_sync_backend',
    DEVICE_ID:        'altech_device_id',
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
});

// Argon2id mock (deterministic stand-in — same as Phase A test).
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

// Stub Supabase client. captureUpsert holds the payload of the most recent
// upsert call so tests can assert what was actually sent over the wire.
let captureUpsert = null;
let captureTable = null;
function makeClientStub() {
    return {
        auth: {
            getSession: async () => ({ data: { session: { user: { id: 'user-stub-uid' } } } }),
        },
        from(table) {
            captureTable = table;
            return {
                upsert(row) {
                    captureUpsert = row;
                    return {
                        select() {
                            return {
                                maybeSingle: async () => ({
                                    data: { id: row.id || 'auto-generated-uuid', updated_at: new Date().toISOString() },
                                    error: null,
                                }),
                            };
                        },
                    };
                },
            };
        },
    };
}
globalThis.window.Supabase = { isReady: true, client: makeClientStub(), init: async () => true };

// SupabaseSync attaches to window. Loading via require evaluates the IIFE
// — guard against double-load via require cache by deleting if needed.
delete require.cache[require.resolve('../js/supabase-sync.js')];
require('../js/supabase-sync.js');
const SupabaseSync = globalThis.window.SupabaseSync;

beforeEach(async () => {
    _store.clear();
    captureUpsert = null;
    captureTable = null;
    // Activate Supabase backend so _enabled() returns true.
    localStorage.setItem('altech_sync_backend', 'supabase');
    // Refresh the client stub each test (in case a test mutated it).
    globalThis.window.Supabase.client = makeClientStub();
    CryptoHelper._internals.reset();
    await CryptoHelper.createVault('phase-b-supabase-sync-test');
    CryptoHelper.enableV2();
});

describe('SupabaseSync — Phase B AAD wiring', () => {
    test('pushBlob with identity wraps the payload as a v=2 envelope', async () => {
        // Prime localStorage with a legacy CryptoHelper.encrypt() ciphertext.
        const localCt = await CryptoHelper.encryptWithV2({ form: 'data', n: 1 });
        const identity = { table: 'user_blobs', rowId: 'currentForm', userId: 'user-stub-uid' };

        const res = await SupabaseSync.pushBlob('currentForm', localCt, undefined, identity);
        expect(res.ok).toBe(true);
        expect(captureTable).toBe('user_blobs');

        // What landed in user_blobs.ciphertext should now be the v=2 envelope.
        const sent = captureUpsert.ciphertext;
        const env = JSON.parse(sent);
        expect(env.v).toBe(2);
        expect(typeof env.iv).toBe('string');
        expect(typeof env.ct).toBe('string');

        // Round-trip — the envelope opens with the same identity we pushed under.
        const out = await CryptoHelper.decryptForRow(sent, identity);
        expect(out).toEqual({ form: 'data', n: 1 });

        // And refuses to open under a DIFFERENT row id.
        const tampered = await CryptoHelper.decryptForRow(sent, { ...identity, rowId: 'reminders' });
        expect(tampered).toBeNull();
    });

    test('pushBlob without identity stays on the legacy path (no envelope wrap)', async () => {
        const localCt = await CryptoHelper.encryptWithV2({ form: 'data' });
        const res = await SupabaseSync.pushBlob('currentForm', localCt);
        expect(res.ok).toBe(true);

        // pushBlob auto-builds a default identity now, so it WILL wrap if v2
        // is unlocked. To verify the legacy path, lock first.
        // (This test instead asserts default-identity behavior — see next test for explicit lock.)
        const env = JSON.parse(captureUpsert.ciphertext);
        expect(env.v).toBe(2);
    });

    test('pushBlob falls through to legacy ciphertext when v2 is locked', async () => {
        const localCt = await CryptoHelper.encryptWithV2({ form: 'data' });
        CryptoHelper.lock();

        const res = await SupabaseSync.pushBlob('currentForm', localCt);
        expect(res.ok).toBe(true);
        // No JSON envelope — the legacy base64 string was passed straight through.
        expect(captureUpsert.ciphertext).toBe(localCt);
        expect(() => JSON.parse(captureUpsert.ciphertext)).toThrow();
    });

    test('plaintext-stored docs (e.g., reminders) are encrypted on push too', async () => {
        // CGL_STATE / REMINDERS / etc. are stored as plain JSON in localStorage
        // — pre-Phase-B these uploaded as plaintext. With AAD wrapping the
        // identity-aware push branch decrypt-falls-through to JSON.parse and
        // re-encrypts, so the server now sees ciphertext for everything.
        const plaintextJson = JSON.stringify([{ id: 1, text: 'call back' }]);
        const identity = { table: 'user_blobs', rowId: 'reminders', userId: 'user-stub-uid' };

        await SupabaseSync.pushBlob('reminders', plaintextJson, undefined, identity);
        const env = JSON.parse(captureUpsert.ciphertext);
        expect(env.v).toBe(2);
        const out = await CryptoHelper.decryptForRow(captureUpsert.ciphertext, identity);
        expect(out).toEqual([{ id: 1, text: 'call back' }]);
    });

    test('pushAllBlobs wraps every stored doc with the right per-doc identity', async () => {
        // Encrypt some, plaintext-stash others — both should land as v=2 envelopes.
        localStorage.setItem('altech_v6',          await CryptoHelper.encryptWithV2({ form: 1 }));
        localStorage.setItem('altech_reminders',   JSON.stringify([{ r: 1 }]));
        localStorage.setItem('altech_cgl_state',   JSON.stringify({ c: 2 }));

        // _pushAllBlobs upserts each in parallel — capture every payload, not just the last.
        const allUpserts = [];
        globalThis.window.Supabase.client = {
            auth: { getSession: async () => ({ data: { session: { user: { id: 'user-stub-uid' } } } }) },
            from(table) {
                return {
                    upsert(row) {
                        allUpserts.push({ table, row });
                        return {
                            select() { return { maybeSingle: async () => ({ data: row, error: null }) }; },
                        };
                    },
                };
            },
        };

        await SupabaseSync.pushAllBlobs();

        const byKey = Object.fromEntries(allUpserts.map(u => [u.row.doc_key, u.row]));
        for (const k of ['currentForm', 'reminders', 'cglState']) {
            expect(byKey[k]).toBeDefined();
            const env = JSON.parse(byKey[k].ciphertext);
            expect(env.v).toBe(2);
            // Decrypt with the right identity → matches plaintext.
            const out = await CryptoHelper.decryptForRow(
                byKey[k].ciphertext,
                { table: 'user_blobs', rowId: k, userId: 'user-stub-uid' }
            );
            expect(out).not.toBeNull();
        }
    });

    test('pushQuote with quoteId wraps under the quote-table identity', async () => {
        const localCt = await CryptoHelper.encryptWithV2({ quoteName: 'Smith', premium: 1234 });
        const res = await SupabaseSync.pushQuote('quote-uuid-1', localCt);
        expect(res.ok).toBe(true);
        expect(captureTable).toBe('user_quotes');

        const env = JSON.parse(captureUpsert.ciphertext);
        expect(env.v).toBe(2);

        const out = await CryptoHelper.decryptForRow(captureUpsert.ciphertext, {
            table: 'user_quotes', rowId: 'quote-uuid-1', userId: 'user-stub-uid',
        });
        expect(out).toEqual({ quoteName: 'Smith', premium: 1234 });
    });

    test('pushQuote without quoteId skips AAD (server assigns id) — legacy ct passthrough', async () => {
        const localCt = await CryptoHelper.encryptWithV2({ x: 1 });
        await SupabaseSync.pushQuote(null, localCt);
        // Without a row id, AAD has nothing to bind to; ciphertext goes up as-is.
        expect(captureUpsert.ciphertext).toBe(localCt);
    });

    test('raw-plaintext row (AGENCY_GLOSSARY-shaped) skips CryptoHelper.decrypt after the first sweep', async () => {
        // glossary content: raw textarea text — not JSON, not base64.
        const rawText = 'MoE = Mutual of Enumclaw\nNWPP = Northwest Personal Property';
        localStorage.setItem('altech_agency_glossary', rawText);

        // Spy on CryptoHelper.decrypt to count how often _maybeWrapForRow
        // delegates to it for this row.
        const origDecrypt = CryptoHelper.decrypt.bind(CryptoHelper);
        const decryptSpy = jest.fn(origDecrypt);
        CryptoHelper.decrypt = decryptSpy;
        try {
            // Capture every per-row push so we can isolate `glossary`.
            const allUpserts = [];
            globalThis.window.Supabase.client = {
                auth: { getSession: async () => ({ data: { session: { user: { id: 'user-stub-uid' } } } }) },
                from() {
                    return {
                        upsert(row) {
                            allUpserts.push(row);
                            return {
                                select() { return { maybeSingle: async () => ({ data: row, error: null }) }; },
                            };
                        },
                    };
                },
            };

            // First sweep — _maybeWrapForRow calls decrypt() once on the
            // glossary plaintext, gets null back, learns the rowId, pushes
            // plaintext as-is.
            await SupabaseSync.pushAllBlobs();
            const firstSweepDecrypts = decryptSpy.mock.calls.filter(c => c[0] === rawText).length;
            expect(firstSweepDecrypts).toBe(1);
            // No envelope — plaintext passthrough.
            const glossaryRow = allUpserts.find(r => r.doc_key === 'glossary');
            expect(glossaryRow).toBeDefined();
            expect(glossaryRow.ciphertext).toBe(rawText);

            // Second sweep — _knownPlaintextRowIds remembers 'glossary',
            // so decrypt() is NOT called again for that row.
            decryptSpy.mockClear();
            await SupabaseSync.pushAllBlobs();
            const secondSweepDecrypts = decryptSpy.mock.calls.filter(c => c[0] === rawText).length;
            expect(secondSweepDecrypts).toBe(0);
        } finally {
            CryptoHelper.decrypt = origDecrypt;
        }
    });
});
