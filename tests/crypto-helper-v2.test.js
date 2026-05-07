// Tests for js/crypto-helper.js Phase A additions:
//   - Argon2id KDF (with PBKDF2 fallback path)
//   - HKDF subkey derivation (kdfTree='hkdf-v1')
//   - Backward compat: legacy v2 records (no kdf fields) still unlock
//
// We mock `globalThis.hashwasm` with a deterministic SHA-256-based stand-in
// for Argon2id. This verifies the wiring (different params → different KEKs,
// same params → same KEK, round-trip works) without actually running the
// memory-hard primitive — that's hash-wasm's job, audited upstream. Real
// browsers load hash-wasm from CDN; tests use this mock.

const nodeCrypto = require('node:crypto');

// ── Browser-style globals so crypto-helper.js loads cleanly in Node ──────
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

// Deterministic Argon2id mock — different params produce different output,
// same params produce identical output. Sufficient for wiring tests.
globalThis.hashwasm = {
    argon2id: async ({ password, salt, parallelism, iterations, memorySize, hashLength }) => {
        const h = nodeCrypto.createHash('sha256');
        h.update(Buffer.from(password));
        h.update(Buffer.from(salt));
        h.update(Buffer.from(`p=${parallelism}|t=${iterations}|m=${memorySize}|hl=${hashLength}`));
        const out = new Uint8Array(h.digest());
        return out.slice(0, hashLength);
    },
};

const { CryptoHelper } = require('../js/crypto-helper.js');

beforeEach(() => {
    _store.clear();
    CryptoHelper._internals.reset();
});

describe('CryptoHelper Phase A — KDF + HKDF', () => {
    test('createVault() defaults to Argon2id + HKDF tree', async () => {
        const meta = await CryptoHelper.createVault('correct horse battery staple');

        expect(meta.passphraseKdf).toBe('argon2id-v1');
        expect(meta.kdfTree).toBe('hkdf-v1');
        expect(meta.passphraseKdfParams).toMatchObject({ memMiB: expect.any(Number), time: expect.any(Number) });
        expect(meta.passphraseIterations).toBeNull(); // legacy field stays null on Argon2id records
        expect(typeof meta.passphraseSaltB64).toBe('string');
        expect(typeof meta.passphraseWrappedMKB64).toBe('string');
    });

    test('createVault(passphrase, iterations) — legacy positional arg keeps PBKDF2 + no HKDF tree', async () => {
        const meta = await CryptoHelper.createVault('passphrase-twelve-chars', 600000);

        expect(meta.passphraseKdf).toBe('pbkdf2-v2');
        expect(meta.kdfTree).toBeNull();
        expect(meta.passphraseIterations).toBe(600000);
    });

    test('Argon2id round-trip — unlock decrypts what was encrypted at create', async () => {
        const meta = await CryptoHelper.createVault('round-trip-passphrase');
        CryptoHelper.enableV2();
        const ct = await CryptoHelper.encryptWithV2({ secret: 'top-secret-value', n: 42 });

        CryptoHelper.lock();
        const ok = await CryptoHelper.unlockVault(meta, 'round-trip-passphrase');
        expect(ok).toBe(true);

        const pt = await CryptoHelper.decrypt(ct);
        expect(pt).toEqual({ secret: 'top-secret-value', n: 42 });
    });

    test('Argon2id rejects the wrong passphrase', async () => {
        const meta = await CryptoHelper.createVault('the-real-passphrase');
        CryptoHelper.lock();

        const ok = await CryptoHelper.unlockVault(meta, 'wrong-passphrase-xx');
        expect(ok).toBe(false);
        expect(CryptoHelper._internals.v2Key).toBeNull();
    });

    test('legacy v2 record (no kdf fields) still unlocks via PBKDF2 fallback', async () => {
        // Create with the legacy positional arg — produces a PBKDF2 record.
        const meta = await CryptoHelper.createVault('legacy-pass-x', 600000);
        CryptoHelper.lock();

        // Strip the new fields to simulate a record from before Phase A.
        const oldStyleMeta = {
            passphraseSaltB64:      meta.passphraseSaltB64,
            passphraseWrappedMKB64: meta.passphraseWrappedMKB64,
            passphraseIterations:   meta.passphraseIterations,
        };

        const ok = await CryptoHelper.unlockVault(oldStyleMeta, 'legacy-pass-x');
        expect(ok).toBe(true);
    });

    test('HKDF tree → data key is NOT the same bytes as MK', async () => {
        await CryptoHelper.createVault('hkdf-test-pass-x'); // hkdf-v1 by default

        const dataKey = CryptoHelper._internals.v2Key;
        const mkBytes = CryptoHelper._internals.v2MKBytes;
        expect(mkBytes).toBeInstanceOf(Uint8Array);
        expect(mkBytes.length).toBe(32);

        // Export the AES key bytes and compare to MK — they must differ.
        const dataKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', dataKey));
        expect(Buffer.from(dataKeyBytes).equals(Buffer.from(mkBytes))).toBe(false);
    });

    test('legacy tree (no HKDF) → data key IS MK directly', async () => {
        // Force legacy mode: pass kdfTree:null explicitly.
        const meta = await CryptoHelper.createVault('legacy-tree-pass', { kdfTree: null });
        expect(meta.kdfTree).toBeNull();

        const dataKey = CryptoHelper._internals.v2Key;
        const mkBytes = CryptoHelper._internals.v2MKBytes;
        const dataKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', dataKey));
        expect(Buffer.from(dataKeyBytes).equals(Buffer.from(mkBytes))).toBe(true);
    });

    test('changePassphrase upgrades PBKDF2 → Argon2id by default', async () => {
        const initialMeta = await CryptoHelper.createVault('original-passphrase', 600000);
        expect(initialMeta.passphraseKdf).toBe('pbkdf2-v2');

        const newMeta = await CryptoHelper.changePassphrase(
            initialMeta, 'original-passphrase', 'new-passphrase-xy'
        );
        expect(newMeta).not.toBeNull();
        expect(newMeta.passphraseKdf).toBe('argon2id-v1');
        expect(newMeta.kdfTree).toBeNull(); // tree mode preserved across rewrap

        // The new meta should unlock with the new passphrase.
        CryptoHelper.lock();
        const ok = await CryptoHelper.unlockVault(newMeta, 'new-passphrase-xy');
        expect(ok).toBe(true);
    });

    test('changePassphrase preserves HKDF tree across upgrade', async () => {
        const initial = await CryptoHelper.createVault('initial-pass-here'); // argon2id + hkdf-v1
        expect(initial.kdfTree).toBe('hkdf-v1');

        const updated = await CryptoHelper.changePassphrase(
            initial, 'initial-pass-here', 'next-pass-here-yy'
        );
        expect(updated.kdfTree).toBe('hkdf-v1');
    });

    test('changePassphrase returns null on wrong current passphrase', async () => {
        const meta = await CryptoHelper.createVault('correct-pass-here');
        const result = await CryptoHelper.changePassphrase(meta, 'WRONG-pass-xx', 'new-pass-here-zz');
        expect(result).toBeNull();
    });

    test('recovery key round-trip with Argon2id', async () => {
        await CryptoHelper.createVault('passphrase-with-rec');
        const { display, bytes } = CryptoHelper.generateRecoveryKey();
        const recoveryMeta = await CryptoHelper.wrapWithRecoveryKey(bytes);

        expect(recoveryMeta.recoveryKdf).toBe('argon2id-v1');
        expect(recoveryMeta.recoveryIterations).toBeNull();

        CryptoHelper.lock();

        // Reconstruct the unlock-side meta (passphrase fields aren't needed
        // for recovery unlock; we only persist what's relevant).
        const ok = await CryptoHelper.unlockVaultWithRecoveryKey(
            { ...recoveryMeta, kdfTree: 'hkdf-v1' },
            display
        );
        expect(ok).toBe(true);
    });

    test('lock() zeroes the cached MK bytes', async () => {
        await CryptoHelper.createVault('lock-test-pass');
        expect(CryptoHelper._internals.v2MKBytes).not.toBeNull();
        CryptoHelper.lock();
        expect(CryptoHelper._internals.v2MKBytes).toBeNull();
        expect(CryptoHelper._internals.v2Key).toBeNull();
        expect(CryptoHelper._internals.v2KdfTree).toBeNull();
    });

    test('HKDF info-string separation: data key differs from a hypothetical blind key', async () => {
        await CryptoHelper.createVault('separation-test-x');
        const mkBytes = CryptoHelper._internals.v2MKBytes;

        const dataKeyBytes  = await CryptoHelper._internals.hkdfDeriveBytes(
            mkBytes, CryptoHelper._internals.HKDF_INFO.DATA, 32
        );
        const blindKeyBytes = await CryptoHelper._internals.hkdfDeriveBytes(
            mkBytes, CryptoHelper._internals.HKDF_INFO.BLIND, 32
        );
        expect(Buffer.from(dataKeyBytes).equals(Buffer.from(blindKeyBytes))).toBe(false);
    });
});
