// Tests for Phase B — AAD-bound row encryption in CryptoHelper.
//
// encryptForRow / decryptForRow bind ciphertext to a (table, rowId, userId)
// identity via AES-GCM additionalData. Tampering with any identity field
// must fail decryption — that's the whole point of AAD.
//
// Mirrors the test scaffolding from crypto-helper-v2.test.js so both can
// run side-by-side. CryptoAAD must load before crypto-helper at runtime.

const nodeCrypto = require('node:crypto');

// Browser-style globals so the modules load cleanly in Node.
const _store = new Map();
globalThis.localStorage = {
    getItem: (k) => _store.has(k) ? _store.get(k) : null,
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
};
globalThis.window = globalThis;
globalThis.STORAGE_KEYS = Object.freeze({
    E2E_CRYPTO_V2:   'altech_e2e_crypto_v2',
    ENCRYPTION_SALT: 'altech_encryption_salt',
});

// Argon2id mock — same deterministic stand-in as the Phase A test.
globalThis.hashwasm = {
    argon2id: async ({ password, salt, parallelism, iterations, memorySize, hashLength }) => {
        const h = nodeCrypto.createHash('sha256');
        h.update(Buffer.from(password));
        h.update(Buffer.from(salt));
        h.update(Buffer.from(`p=${parallelism}|t=${iterations}|m=${memorySize}|hl=${hashLength}`));
        return new Uint8Array(h.digest()).slice(0, hashLength);
    },
};

// Order matters: load CryptoAAD first so it's on globalThis by the time
// encryptForRow / decryptForRow look for it at call time.
const { CryptoAAD } = require('../js/crypto-aad.js');
const { CryptoHelper } = require('../js/crypto-helper.js');

const IDENTITY = { table: 'user_quotes', rowId: 'q-1', userId: 'user-aaa' };

beforeEach(async () => {
    _store.clear();
    CryptoHelper._internals.reset();
    await CryptoHelper.createVault('phase-b-test-passphrase');
    CryptoHelper.enableV2();
});

describe('CryptoHelper Phase B — AAD-bound row encryption', () => {
    test('encryptForRow → decryptForRow round-trip', async () => {
        const data = { policyNumber: 'P-12345', name: 'Jane Q. Public', amount: 100000 };
        const env = await CryptoHelper.encryptForRow(data, IDENTITY);
        const out = await CryptoHelper.decryptForRow(env, IDENTITY);
        expect(out).toEqual(data);
    });

    test('envelope is JSON with v=2, iv, ct fields', async () => {
        const env = await CryptoHelper.encryptForRow({ x: 1 }, IDENTITY);
        const parsed = JSON.parse(env);
        expect(parsed.v).toBe(2);
        expect(typeof parsed.iv).toBe('string');
        expect(typeof parsed.ct).toBe('string');
        expect(parsed.iv.length).toBeGreaterThan(0);
        expect(parsed.ct.length).toBeGreaterThan(0);
    });

    test('different IVs across calls (no nonce reuse)', async () => {
        const a = JSON.parse(await CryptoHelper.encryptForRow({ x: 1 }, IDENTITY));
        const b = JSON.parse(await CryptoHelper.encryptForRow({ x: 1 }, IDENTITY));
        expect(a.iv).not.toBe(b.iv);
        expect(a.ct).not.toBe(b.ct); // same plaintext, different IV → different CT
    });

    test('decrypt fails when table changes', async () => {
        const env = await CryptoHelper.encryptForRow({ secret: 'top' }, IDENTITY);
        const tampered = await CryptoHelper.decryptForRow(env, { ...IDENTITY, table: 'user_blobs' });
        expect(tampered).toBeNull();
    });

    test('decrypt fails when rowId changes', async () => {
        const env = await CryptoHelper.encryptForRow({ secret: 'top' }, IDENTITY);
        const tampered = await CryptoHelper.decryptForRow(env, { ...IDENTITY, rowId: 'q-2' });
        expect(tampered).toBeNull();
    });

    test('decrypt fails when userId changes — server cannot relabel', async () => {
        const env = await CryptoHelper.encryptForRow({ secret: 'top' }, IDENTITY);
        const tampered = await CryptoHelper.decryptForRow(env, { ...IDENTITY, userId: 'user-bbb' });
        expect(tampered).toBeNull();
    });

    test('decrypt accepts both raw JSON string and parsed object', async () => {
        const env = await CryptoHelper.encryptForRow({ ok: true }, IDENTITY);
        const fromString = await CryptoHelper.decryptForRow(env, IDENTITY);
        const fromObject = await CryptoHelper.decryptForRow(JSON.parse(env), IDENTITY);
        expect(fromString).toEqual({ ok: true });
        expect(fromObject).toEqual({ ok: true });
    });

    test('decryptForRow falls back to legacy base64 ciphertext when no envelope shape', async () => {
        // A legacy v2 ciphertext (pre-Phase-B) is just the base64 string from encrypt().
        const legacyCt = await CryptoHelper.encryptWithV2({ legacy: 'data' });
        const out = await CryptoHelper.decryptForRow(legacyCt, IDENTITY);
        expect(out).toEqual({ legacy: 'data' });
    });

    test('decryptForRow returns null when locked', async () => {
        const env = await CryptoHelper.encryptForRow({ x: 1 }, IDENTITY);
        CryptoHelper.lock();
        const out = await CryptoHelper.decryptForRow(env, IDENTITY);
        expect(out).toBeNull();
    });

    test('decryptForRow returns null on unknown envelope version', async () => {
        const fakeEnvelope = JSON.stringify({ v: 99, iv: 'AAAA', ct: 'AAAA' });
        const out = await CryptoHelper.decryptForRow(fakeEnvelope, IDENTITY);
        expect(out).toBeNull();
    });

    test('encryptForRow throws CRYPTO_LOCKED when locked', async () => {
        CryptoHelper.lock();
        await expect(CryptoHelper.encryptForRow({ x: 1 }, IDENTITY)).rejects.toThrow(/CRYPTO_LOCKED/);
    });

    test('decryptForRow returns null when identity missing on a v=2 envelope', async () => {
        const env = await CryptoHelper.encryptForRow({ x: 1 }, IDENTITY);
        const noIdentity = await CryptoHelper.decryptForRow(env, undefined);
        expect(noIdentity).toBeNull();
    });

    test('different identities produce different ciphertext for same plaintext', async () => {
        const aEnv = await CryptoHelper.encryptForRow({ x: 1 }, { ...IDENTITY, rowId: 'a' });
        const bEnv = await CryptoHelper.encryptForRow({ x: 1 }, { ...IDENTITY, rowId: 'b' });
        expect(aEnv).not.toBe(bEnv);
        // Round-trip both — each only opens with its own identity.
        expect(await CryptoHelper.decryptForRow(aEnv, { ...IDENTITY, rowId: 'a' })).toEqual({ x: 1 });
        expect(await CryptoHelper.decryptForRow(bEnv, { ...IDENTITY, rowId: 'b' })).toEqual({ x: 1 });
        // Cross-decrypt fails.
        expect(await CryptoHelper.decryptForRow(aEnv, { ...IDENTITY, rowId: 'b' })).toBeNull();
        expect(await CryptoHelper.decryptForRow(bEnv, { ...IDENTITY, rowId: 'a' })).toBeNull();
    });

    test('CryptoAAD.ENVELOPE.V2_AAD === 2 stays in lockstep with helper', async () => {
        expect(CryptoAAD.ENVELOPE.V2_AAD).toBe(2);
        const env = JSON.parse(await CryptoHelper.encryptForRow({ x: 1 }, IDENTITY));
        expect(env.v).toBe(CryptoAAD.ENVELOPE.V2_AAD);
    });
});
