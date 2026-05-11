// SecureStorage — at-rest encryption for sensitive non-form localStorage keys.
//
// Threat model
//   Protect client NPI (Nonpublic Personal Information — GLBA scope) when the
//   device is at rest. Persistent localStorage state for the listed keys is
//   AES-GCM ciphertext on disk; the in-memory cache holds plaintext during an
//   active session so plugins keep their synchronous read contract.
//
// Why this exists
//   `App.save()` already encrypts FORM / QUOTES / ACCT_VAULT / COMMERCIAL_* via
//   CryptoHelper.encrypt at the natural save boundary. The other persisted
//   plugins (compliance state, reminders, client history, agency glossary,
//   carrier rule overrides) historically wrote plain JSON — which was readable
//   by anyone with file-system access to the user's browser profile, by a
//   malicious browser extension reading localStorage, or by a cloud-synced
//   browser profile copying localStorage off-device. After SecureStorage runs,
//   none of those threats see plaintext NPI at rest.
//
// Contract
//   • SENSITIVE keys hold base64 ciphertext in localStorage.
//   • SecureStorage.init() runs once at boot (after CryptoHelper is ready):
//     - Decrypts each sensitive key into the in-memory cache.
//     - Migrates any plaintext value still on disk to ciphertext in the same
//       pass — one-time cost on first run after this ships.
//   • getItem / getParsed return plaintext synchronously from the cache, so
//     existing plugin reads can keep using sync localStorage.getItem-style
//     access patterns.
//   • setItem is async (await it for durability). setItemSync is the fire-
//     and-forget variant for legacy callers that can't await — it updates
//     the cache + writes plaintext to disk immediately (to survive a crash),
//     then re-encrypts in the background.
//   • removeItem clears both the cache and localStorage.
//
// Non-goals
//   • Protecting against an attacker WITH the user's password / vault key.
//     CryptoHelper.encrypt uses the active key (v2 vault MK if unlocked, else
//     the legacy per-device key). If the attacker has the key, ciphertext
//     opens. This is by design — encryption is not a substitute for password
//     hygiene + MFA.
//   • Encrypting non-PII state (theme, dark mode toggle, sync metadata, the
//     local activity log). Those keys are deliberately excluded.

window.SecureStorage = (() => {
    'use strict';

    // The set of localStorage keys whose value carries client NPI and must be
    // encrypted at rest. Add new keys here ONLY if their value contains PII —
    // every entry adds an encrypt/decrypt cost on every read/write.
    const SENSITIVE = Object.freeze([
        STORAGE_KEYS.CGL_STATE,
        STORAGE_KEYS.REMINDERS,
        STORAGE_KEYS.CLIENT_HISTORY,
        STORAGE_KEYS.AGENCY_GLOSSARY,
        STORAGE_KEYS.CARRIER_OVERRIDES,
    ]);
    const SENSITIVE_SET = new Set(SENSITIVE);

    // Plaintext cache: key → JS value. Populated by init(); kept in sync by
    // every setItem / setItemSync. Reads come from here so plugins stay sync.
    const _cache = new Map();
    let _ready = false;
    let _initPromise = null;

    // A value looks encrypted if it's a long string made of the base64
    // alphabet (A-Z, a-z, 0-9, +, /, =). CryptoHelper.encrypt produces
    // base64 of (12-byte IV || AES-GCM ciphertext + tag), so any real
    // ciphertext fits this character set and is >40 chars. The stricter
    // regex avoids treating long plaintext (e.g. agency glossary with
    // spaces, newlines, special characters) as ciphertext.
    function _looksEncrypted(raw) {
        if (typeof raw !== 'string' || raw.length < 40) return false;
        return /^[A-Za-z0-9+/=]+$/.test(raw);
    }

    async function init() {
        if (_initPromise) return _initPromise;
        _initPromise = (async () => {
            if (typeof CryptoHelper === 'undefined' || !CryptoHelper.encrypt) {
                // No crypto module → degrade to a passthrough. Plugins keep working
                // (reads fall through to localStorage; writes hit localStorage plain).
                _ready = true;
                return;
            }
            // We call localStorage.* directly here because the proxy is not
            // installed yet (it goes in at the END of init(), once the cache
            // is populated). Using bare `localStorage.*` avoids needing _ls().
            for (const key of SENSITIVE) {
                const raw = localStorage.getItem(key);
                if (raw == null) { _cache.set(key, null); continue; }

                if (_looksEncrypted(raw)) {
                    try {
                        const plain = await CryptoHelper.decrypt(raw);
                        _cache.set(key, plain);
                    } catch (e) {
                        console.warn('[SecureStorage] decrypt failed at init for', key, '—', (e && e.message) || e);
                        _cache.set(key, null);
                    }
                } else {
                    // Plaintext on disk (legacy / never-encrypted). Cache the parsed
                    // JS value, then migrate by encrypting in place. After this one
                    // boot, the disk version is ciphertext for the rest of the
                    // device's life.
                    let parsed = raw;
                    try { parsed = JSON.parse(raw); } catch { /* leave as raw string */ }
                    _cache.set(key, parsed);
                    try {
                        const enc = await CryptoHelper.encrypt(parsed);
                        if (enc && _looksEncrypted(enc)) {
                            localStorage.setItem(key, enc);
                        }
                    } catch (e) {
                        // Most likely CRYPTO_LOCKED — leave plaintext on disk for now;
                        // the next setItem after unlock will re-encrypt.
                        console.warn('[SecureStorage] migration encrypt failed for', key, '—', (e && e.message) || e);
                    }
                }
            }
            // Install the transparent localStorage proxy AFTER the cache is
            // populated. Any plugin code that does `localStorage.getItem(K)` for
            // a sensitive key now goes through the cache (returning plaintext);
            // any `localStorage.setItem(K, v)` routes through setItemSync
            // (encrypting on disk + caching). This is one chokepoint instead of
            // 15+ touch-point migrations across plugins.
            _installLocalStorageProxy();
            _ready = true;
            if (window.ActivityLog) {
                window.ActivityLog.add({
                    type: 'sync', area: 'secure-storage', ok: true,
                    message: 'At-rest store ready',
                });
            }
        })();
        return _initPromise;
    }

    let _proxyInstalled = false;
    function _installLocalStorageProxy() {
        if (_proxyInstalled) return;
        _proxyInstalled = true;
        const realGet = localStorage.getItem.bind(localStorage);
        const realSet = localStorage.setItem.bind(localStorage);
        const realRemove = localStorage.removeItem.bind(localStorage);
        // Stash the originals so we can call out to them from our own
        // setItemSync / migrate-on-init paths without recursion.
        _realLocalStorage = { getItem: realGet, setItem: realSet, removeItem: realRemove };

        localStorage.getItem = function(key) {
            if (SENSITIVE_SET.has(key)) return getItem(key);
            return realGet(key);
        };
        localStorage.setItem = function(key, value) {
            if (SENSITIVE_SET.has(key)) {
                setItemSync(key, value);
                return;
            }
            return realSet(key, value);
        };
        localStorage.removeItem = function(key) {
            if (SENSITIVE_SET.has(key)) _cache.delete(key);
            return realRemove(key);
        };
    }
    // Direct access to native localStorage when SecureStorage needs to write
    // ciphertext without re-triggering its own proxy. Populated by
    // _installLocalStorageProxy; before init(), this is null and we use
    // `localStorage.*` directly (which is the unpatched native at that point).
    let _realLocalStorage = null;
    function _ls() { return _realLocalStorage || localStorage; }

    // Sync getter — returns the cached plaintext as a string (mimicking
    // localStorage.getItem). Non-sensitive keys fall through to native
    // localStorage. Uses _ls() to skip our own proxy (avoids recursion).
    function getItem(key) {
        if (!SENSITIVE_SET.has(key)) return _ls().getItem(key);
        if (!_cache.has(key)) return null;
        const v = _cache.get(key);
        if (v == null) return null;
        return typeof v === 'string' ? v : JSON.stringify(v);
    }

    // Sync getter returning the parsed JS value with a fallback. Plugins
    // tend to want the parsed form anyway — saves the JSON.parse roundtrip.
    function getParsed(key, fallback = null) {
        if (!SENSITIVE_SET.has(key)) {
            const raw = _ls().getItem(key);
            if (raw == null) return fallback;
            try { return JSON.parse(raw); } catch { return raw; }
        }
        if (!_cache.has(key)) return fallback;
        const v = _cache.get(key);
        return v == null ? fallback : v;
    }

    // Async setter — writes ciphertext to localStorage and updates the cache.
    // Returns when the disk write is committed; callers that need durability
    // should await this.
    async function setItem(key, value) {
        if (!SENSITIVE_SET.has(key)) {
            _ls().setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            return;
        }
        const parsed = _toParsed(value);
        _cache.set(key, parsed);
        try {
            if (typeof CryptoHelper !== 'undefined' && CryptoHelper.encrypt) {
                const enc = await CryptoHelper.encrypt(parsed);
                if (enc && _looksEncrypted(enc)) {
                    _ls().setItem(key, enc);
                    return;
                }
            }
        } catch (e) {
            console.warn('[SecureStorage] encrypt failed for', key, '— writing plaintext:', (e && e.message) || e);
        }
        // Fallback: encryption unavailable (e.g., CRYPTO_LOCKED at init) — write
        // plaintext so we don't lose the user's data. The next successful init()
        // call after unlock will migrate it.
        _ls().setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }

    // Sync setter — for callers that can't await (legacy `_save` / event
    // handlers in plugin IIFEs). Updates the cache immediately + writes
    // plaintext to disk so a crash here doesn't lose data; an async encrypt
    // then replaces the plaintext with ciphertext within a few ms. There's a
    // brief plaintext-on-disk window per write; the threat model (device at
    // rest) treats that as acceptable since the user is actively writing.
    function setItemSync(key, value) {
        if (!SENSITIVE_SET.has(key)) {
            _ls().setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            return;
        }
        const parsed = _toParsed(value);
        _cache.set(key, parsed);
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        _ls().setItem(key, serialized);

        if (typeof CryptoHelper !== 'undefined' && CryptoHelper.encrypt) {
            CryptoHelper.encrypt(parsed)
                .then(enc => {
                    // Race-safe: only flush this ciphertext if the cache still
                    // holds the value WE just wrote. A newer setItem replaces.
                    if (enc && _looksEncrypted(enc) && _cache.get(key) === parsed) {
                        _ls().setItem(key, enc);
                    }
                })
                .catch(e => console.warn('[SecureStorage] async encrypt failed for', key, '—', (e && e.message) || e));
        }
    }

    function removeItem(key) {
        if (SENSITIVE_SET.has(key)) _cache.delete(key);
        _ls().removeItem(key);
    }

    function _toParsed(value) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch { return value; }
    }

    return Object.freeze({
        init, getItem, getParsed, setItem, setItemSync, removeItem,
        isReady: () => _ready,
        isSensitive: (key) => SENSITIVE_SET.has(key),
        SENSITIVE_KEYS: SENSITIVE.slice(),
    });
})();
