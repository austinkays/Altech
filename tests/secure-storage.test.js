// SecureStorage tests — verify that sensitive localStorage keys are encrypted
// at rest, the in-memory cache returns plaintext, and the transparent proxy
// keeps existing localStorage.getItem / setItem call sites working unchanged.

const nodeCrypto = require('node:crypto');

const _store = new Map();
globalThis.localStorage = {
    getItem: (k) => _store.has(k) ? _store.get(k) : null,
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
    clear: () => _store.clear(),
    get length() { return _store.size; },
    key: (i) => Array.from(_store.keys())[i] || null,
};
globalThis.window = globalThis;
globalThis.STORAGE_KEYS = Object.freeze({
    E2E_CRYPTO_V2:    'altech_e2e_crypto_v2',
    ENCRYPTION_SALT:  'altech_encryption_salt',
    DEVICE_ID:        'altech_device_id',
    CGL_STATE:        'altech_cgl_state',
    CLIENT_HISTORY:   'altech_client_history',
    REMINDERS:        'altech_reminders',
    AGENCY_GLOSSARY:  'altech_agency_glossary',
    CARRIER_OVERRIDES:'altech_carrier_overrides',
    DARK_MODE:        'altech_dark_mode',
    // Non-sensitive (must pass through):
    THEME:            'altech_theme',
});

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

// SecureStorage attaches to window. Reload between tests because the proxy
// installation is one-shot per module instance — use jest.isolateModules so
// each call gets a fresh evaluation of the IIFE (require.cache deletion alone
// doesn't trigger a re-run on script-style modules without module.exports).
function loadSecureStorage() {
    let SS;
    jest.isolateModules(() => {
        require('../js/secure-storage.js');
        SS = globalThis.window.SecureStorage;
    });
    return SS;
}

beforeEach(async () => {
    _store.clear();
    // Replace localStorage WHOLESALE so the previous test's proxy overrides
    // are gone. Using a brand-new object avoids the case where overwriting
    // individual methods leaves a stale property descriptor in place.
    globalThis.localStorage = {
        getItem: (k) => _store.has(k) ? _store.get(k) : null,
        setItem: (k, v) => _store.set(k, String(v)),
        removeItem: (k) => _store.delete(k),
        clear: () => _store.clear(),
        get length() { return _store.size; },
        key: (i) => Array.from(_store.keys())[i] || null,
    };
    CryptoHelper._internals.reset();
    await CryptoHelper.createVault('secure-storage-test');
    CryptoHelper.enableV2();
});

describe('SecureStorage — at-rest encryption', () => {
    test('after init, sensitive keys hold ciphertext on disk and plaintext in cache', async () => {
        // Pre-stage plaintext (legacy migration scenario).
        _store.set('altech_reminders', JSON.stringify([{ id: 1, text: 'call client' }]));

        const SS = loadSecureStorage();
        await SS.init();

        // Cache holds plaintext.
        expect(SS.getParsed('altech_reminders')).toEqual([{ id: 1, text: 'call client' }]);
        // Disk holds the v=1 envelope — explicit magic prefix, NOT raw JSON.
        const raw = _store.get('altech_reminders');
        expect(raw).toMatch(/^altech-sec:v1:/);
        expect(raw.length).toBeGreaterThan('altech-sec:v1:'.length + 40);
        // Round-trip: strip prefix and decrypt with CryptoHelper.
        const ct = raw.slice('altech-sec:v1:'.length);
        const decoded = await CryptoHelper.decrypt(ct);
        expect(decoded).toEqual([{ id: 1, text: 'call client' }]);
    });

    test('non-sensitive keys are untouched by init / proxy', async () => {
        _store.set('altech_theme', 'aurora');

        const SS = loadSecureStorage();
        await SS.init();

        // Theme stays plaintext on disk.
        expect(_store.get('altech_theme')).toBe('aurora');
        // Reads via the proxy return the plain string.
        expect(localStorage.getItem('altech_theme')).toBe('aurora');
    });

    test('transparent proxy: localStorage.getItem returns plaintext for sensitive keys', async () => {
        _store.set('altech_cgl_state', JSON.stringify({ policies: [{ id: 'p1' }] }));

        const SS = loadSecureStorage();
        await SS.init();

        // Plugin-style read works AS IF localStorage were plaintext.
        const raw = localStorage.getItem('altech_cgl_state');
        expect(JSON.parse(raw)).toEqual({ policies: [{ id: 'p1' }] });
        // But on-disk is ciphertext.
        expect(_store.get('altech_cgl_state')[0]).not.toBe('{');
    });

    test('transparent proxy: localStorage.setItem encrypts on disk for sensitive keys', async () => {
        const SS = loadSecureStorage();
        await SS.init();

        // Plugin-style write.
        localStorage.setItem('altech_reminders', JSON.stringify([{ id: 9, text: 'follow up' }]));

        // Cache + plugin read returns plaintext.
        expect(JSON.parse(localStorage.getItem('altech_reminders'))).toEqual([{ id: 9, text: 'follow up' }]);
        // Wait one tick for the async encrypt to land on disk.
        await new Promise(r => setTimeout(r, 5));
        const raw = _store.get('altech_reminders');
        expect(raw).toMatch(/^altech-sec:v1:/);
        expect(raw.length).toBeGreaterThan(40);
    });

    test('removeItem clears cache + disk for sensitive keys', async () => {
        _store.set('altech_cgl_state', JSON.stringify({ a: 1 }));
        const SS = loadSecureStorage();
        await SS.init();
        expect(SS.getParsed('altech_cgl_state')).toEqual({ a: 1 });

        localStorage.removeItem('altech_cgl_state');
        expect(localStorage.getItem('altech_cgl_state')).toBeNull();
        expect(_store.has('altech_cgl_state')).toBe(false);
    });

    test('AGENCY_GLOSSARY (plain text, not JSON) round-trips correctly', async () => {
        const text = 'HO-3 = Homeowners 3\nWA L&I = WA Labor and Industries';
        _store.set('altech_agency_glossary', text);

        const SS = loadSecureStorage();
        await SS.init();

        // The proxy returns the original text (cache stores it as a raw string,
        // not a JSON-parsed value, because JSON.parse refuses non-JSON input).
        expect(localStorage.getItem('altech_agency_glossary')).toBe(text);
        // On-disk is the v=1 envelope.
        expect(_store.get('altech_agency_glossary')).toMatch(/^altech-sec:v1:/);
    });

    test('SENSITIVE_KEYS exposes the right list and isSensitive() works', () => {
        const SS = loadSecureStorage();
        expect(SS.isSensitive('altech_cgl_state')).toBe(true);
        expect(SS.isSensitive('altech_reminders')).toBe(true);
        expect(SS.isSensitive('altech_client_history')).toBe(true);
        expect(SS.isSensitive('altech_agency_glossary')).toBe(true);
        expect(SS.isSensitive('altech_carrier_overrides')).toBe(true);
        // Not sensitive:
        expect(SS.isSensitive('altech_theme')).toBe(false);
        expect(SS.isSensitive('altech_dark_mode')).toBe(false);
    });
});

describe('SecureStorage — explicit API', () => {
    test('setItem (async) writes encrypted', async () => {
        const SS = loadSecureStorage();
        await SS.init();

        await SS.setItem('altech_client_history', [{ id: 'c1', name: 'Smith' }]);
        const raw = _store.get('altech_client_history');
        expect(raw).toMatch(/^altech-sec:v1:/);
        expect(SS.getParsed('altech_client_history')).toEqual([{ id: 'c1', name: 'Smith' }]);
    });

    test('init is idempotent — calling twice is a no-op', async () => {
        _store.set('altech_reminders', JSON.stringify([{ id: 1 }]));
        const SS = loadSecureStorage();
        await SS.init();
        const cipherAfterFirst = _store.get('altech_reminders');
        await SS.init();
        const cipherAfterSecond = _store.get('altech_reminders');
        // Same ciphertext (init didn't re-encrypt with a fresh IV).
        expect(cipherAfterSecond).toBe(cipherAfterFirst);
    });
});

describe('SecureStorage — false-positive protection (magic prefix)', () => {
    test('long alphanumeric plaintext is NOT mis-classified as ciphertext', async () => {
        // The pre-bugfix heuristic was `length >= 40 && all-base64-chars`,
        // which false-positived long UUIDs / hex hashes / API tokens. The
        // magic prefix `altech-sec:v1:` is unambiguous — no plaintext
        // happens to start with it.
        const looksLikeBase64 = 'abc' + 'A'.repeat(50) + '1234567890';
        _store.set('altech_agency_glossary', looksLikeBase64);

        const SS = loadSecureStorage();
        await SS.init();

        // Treated as plaintext — cache holds the original string.
        expect(SS.getParsed('altech_agency_glossary')).toBe(looksLikeBase64);
        // And re-encrypted to a v1 envelope on disk.
        expect(_store.get('altech_agency_glossary')).toMatch(/^altech-sec:v1:/);
    });
});

describe('SecureStorage — pending-migration retry after vault unlock', () => {
    test('init defers encryption when v2 is locked; setItem retries once unlocked', async () => {
        // P0 bugfix: previously, a CRYPTO_LOCKED encryption failure at init
        // left plaintext on disk forever. The fix queues the key for retry
        // on every subsequent setItem.

        // Pre-stage plaintext.
        _store.set('altech_reminders', JSON.stringify([{ id: 1, text: 'pending' }]));

        // Lock the vault BEFORE init runs.
        CryptoHelper.lock();

        const SS = loadSecureStorage();
        await SS.init();

        // Plaintext stays on disk (encryption was unavailable).
        expect(_store.get('altech_reminders')).not.toMatch(/^altech-sec:v1:/);
        expect(SS.pendingMigrationCount()).toBe(1);

        // Cache still has plaintext — plugins can read.
        expect(SS.getParsed('altech_reminders')).toEqual([{ id: 1, text: 'pending' }]);

        // Now simulate the user unlocking the vault.
        await CryptoHelper.createVault('after-unlock-passphrase');
        CryptoHelper.enableV2();

        // Explicit migrate() call — exposes the retry sweep for vault-ui hooks.
        const result = await SS.migrate();
        expect(result.migrated).toBe(1);
        expect(result.pending).toBe(0);
        expect(_store.get('altech_reminders')).toMatch(/^altech-sec:v1:/);
        expect(SS.pendingMigrationCount()).toBe(0);
    });

    test('setItemSync also drains the pending queue (fire-and-forget retry)', async () => {
        // Stage one key with vault locked.
        _store.set('altech_cgl_state', JSON.stringify({ deferred: true }));
        CryptoHelper.lock();
        const SS = loadSecureStorage();
        await SS.init();
        expect(SS.pendingMigrationCount()).toBe(1);

        // Unlock the vault.
        await CryptoHelper.createVault('test-passphrase');
        CryptoHelper.enableV2();

        // Writing a DIFFERENT key triggers the retry sweep for cgl_state too.
        SS.setItemSync('altech_reminders', [{ id: 2 }]);
        // Wait for the async retry to finish.
        await new Promise(r => setTimeout(r, 20));

        expect(SS.pendingMigrationCount()).toBe(0);
        expect(_store.get('altech_cgl_state')).toMatch(/^altech-sec:v1:/);
        expect(_store.get('altech_reminders')).toMatch(/^altech-sec:v1:/);
    });
});
