/**
 * Biometric unlock unit tests.
 *
 * JSDOM doesn't ship WebAuthn (no PublicKeyCredential, no platform
 * authenticator), so register() and unlock() can't be exercised end-to-end
 * here — those need a real browser. What we CAN test is the storage layer,
 * encoding helpers, and the wrap/unwrap round-trip using crypto.subtle
 * (which IS available via Node's webcrypto polyfill in JSDOM).
 *
 * The full register/unlock flow is verified manually via the "Test plan"
 * in the PR description on a real device with Touch ID / Windows Hello.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function bootDom() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost:8000',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });
    const w = dom.window;
    // localStorage stub
    const store = {};
    w.localStorage = {
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
        clear() { Object.keys(store).forEach(x => delete store[x]); },
    };
    // crypto.subtle from Node — JSDOM ships a stub `crypto` without subtle.
    // We replace defineProperty-style so it sticks even when JSDOM made it
    // non-writable.
    const { webcrypto } = require('crypto');
    Object.defineProperty(w, 'crypto', { value: webcrypto, writable: true, configurable: true });
    // TextEncoder / TextDecoder also missing from old JSDOM versions.
    if (typeof w.TextEncoder === 'undefined') w.TextEncoder = require('util').TextEncoder;
    if (typeof w.TextDecoder === 'undefined') w.TextDecoder = require('util').TextDecoder;
    // STORAGE_KEYS
    w.STORAGE_KEYS = { BIOMETRIC_CREDENTIALS: 'altech_biometric_credentials' };
    // CryptoHelper stub — tests don't need the real thing
    w.CryptoHelper = {
        isV2Unlocked: () => false,
        getUnlockedMK: () => null,
        installMK: async () => true,
        getKdfTree: () => null,
    };
    // Inline biometric-unlock.js so it executes in the JSDOM window
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'biometric-unlock.js'), 'utf8');
    w.eval(src);
    return w;
}

describe('BiometricUnlock — module shape', () => {
    let w;
    beforeEach(() => { w = bootDom(); });

    test('exposes the documented public API', () => {
        const bio = w.BiometricUnlock;
        expect(bio).toBeDefined();
        expect(typeof bio.isAvailable).toBe('function');
        expect(typeof bio.hasAny).toBe('function');
        expect(typeof bio.listCredentials).toBe('function');
        expect(typeof bio.register).toBe('function');
        expect(typeof bio.unlock).toBe('function');
        expect(typeof bio.removeCredential).toBe('function');
    });

    test('isAvailable returns false when WebAuthn (PublicKeyCredential) is missing', () => {
        // JSDOM does not provide PublicKeyCredential
        expect(w.PublicKeyCredential).toBeUndefined();
        expect(w.BiometricUnlock.isAvailable()).toBe(false);
    });

    test('hasAny returns false on a fresh install', () => {
        expect(w.BiometricUnlock.hasAny()).toBe(false);
        expect(w.BiometricUnlock.listCredentials()).toEqual([]);
    });
});

describe('BiometricUnlock — storage', () => {
    let w;
    beforeEach(() => { w = bootDom(); });

    test('listCredentials hides wrapped MK from the UI shape', () => {
        // Inject a fake credential directly into storage
        const sample = [{
            credentialId: 'cred-1',
            prfSaltB64:   'AAAA',
            wrappedMKB64: 'SECRET-DO-NOT-LEAK',
            kdfTree:      null,
            label:        'Test passkey',
            createdAt:    '2026-05-12T00:00:00Z',
        }];
        w.localStorage.setItem(w.STORAGE_KEYS.BIOMETRIC_CREDENTIALS, JSON.stringify(sample));
        const list = w.BiometricUnlock.listCredentials();
        expect(list).toHaveLength(1);
        expect(list[0].credentialId).toBe('cred-1');
        expect(list[0].label).toBe('Test passkey');
        expect(list[0]).not.toHaveProperty('wrappedMKB64');
        expect(list[0]).not.toHaveProperty('prfSaltB64');
    });

    test('hasAny detects stored credentials', () => {
        w.localStorage.setItem(w.STORAGE_KEYS.BIOMETRIC_CREDENTIALS, JSON.stringify([{ credentialId: 'x', wrappedMKB64: 'y' }]));
        expect(w.BiometricUnlock.hasAny()).toBe(true);
    });

    test('removeCredential drops the matching entry only', () => {
        w.localStorage.setItem(w.STORAGE_KEYS.BIOMETRIC_CREDENTIALS, JSON.stringify([
            { credentialId: 'a', label: 'Mac' },
            { credentialId: 'b', label: 'iPhone' },
        ]));
        w.BiometricUnlock.removeCredential('a');
        const list = w.BiometricUnlock.listCredentials();
        expect(list).toHaveLength(1);
        expect(list[0].credentialId).toBe('b');
    });

    test('listCredentials gracefully handles corrupted storage', () => {
        w.localStorage.setItem(w.STORAGE_KEYS.BIOMETRIC_CREDENTIALS, '{not json');
        expect(w.BiometricUnlock.listCredentials()).toEqual([]);
        expect(w.BiometricUnlock.hasAny()).toBe(false);
    });
});

describe('BiometricUnlock — wrap / unwrap round-trip', () => {
    let w;
    beforeEach(() => { w = bootDom(); });

    test('PRF-derived KEK round-trips MK bytes correctly', async () => {
        const internals = w.BiometricUnlock._internals;
        // Simulate a PRF output (32 random bytes) and a master key (32 bytes).
        const prf = w.crypto.getRandomValues(new Uint8Array(32));
        const mk  = w.crypto.getRandomValues(new Uint8Array(32));
        const kek = await internals._kekFromPRF(prf);
        const wrapped = await internals._wrapMK(mk, kek);
        // Re-derive same KEK from same PRF — should unwrap to the original MK.
        const kek2 = await internals._kekFromPRF(prf);
        const unwrapped = await internals._unwrapMK(wrapped, kek2);
        // Compare as plain arrays — Uint8Array constructed in the JSDOM
        // realm vs the test's Node realm aren't strictly equal under toEqual
        // (different prototypes) even when the bytes match.
        expect(Array.from(unwrapped)).toEqual(Array.from(mk));
    });

    test('different PRF outputs produce different KEKs (no unwrap with wrong KEK)', async () => {
        const internals = w.BiometricUnlock._internals;
        const prfA = w.crypto.getRandomValues(new Uint8Array(32));
        const prfB = w.crypto.getRandomValues(new Uint8Array(32));
        const mk   = w.crypto.getRandomValues(new Uint8Array(32));
        const kekA = await internals._kekFromPRF(prfA);
        const kekB = await internals._kekFromPRF(prfB);
        const wrapped = await internals._wrapMK(mk, kekA);
        // Unwrapping with the wrong KEK MUST throw (AES-GCM auth tag fails).
        await expect(internals._unwrapMK(wrapped, kekB)).rejects.toThrow();
    });
});

describe('BiometricUnlock — register guard', () => {
    let w;
    beforeEach(() => { w = bootDom(); });

    test('register fails fast when WebAuthn is unavailable', async () => {
        const res = await w.BiometricUnlock.register('Test');
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/not supported/i);
    });

    test('register fails when the vault is locked even if WebAuthn would be available', async () => {
        // Pretend WebAuthn is there so we get past isAvailable
        w.PublicKeyCredential = function () {};
        const res = await w.BiometricUnlock.register('Test');
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/unlock the vault/i);
    });
});

describe('BiometricUnlock — unlock guard', () => {
    let w;
    beforeEach(() => { w = bootDom(); });

    test('unlock fails fast with no registered credentials', async () => {
        w.PublicKeyCredential = function () {};
        const res = await w.BiometricUnlock.unlock();
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/no biometric credentials/i);
    });

    test('unlock fails fast when WebAuthn is missing', async () => {
        // Pre-load a credential so the empty-list guard doesn't fire first
        w.localStorage.setItem(w.STORAGE_KEYS.BIOMETRIC_CREDENTIALS, JSON.stringify([
            { credentialId: 'x', prfSaltB64: 'AAAA', wrappedMKB64: 'BBBB' },
        ]));
        const res = await w.BiometricUnlock.unlock();
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/not supported/i);
    });
});
