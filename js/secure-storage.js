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

    // The set of localStorage keys whose value carries client NPI, agency
    // operational data, or stored credentials and must be encrypted at rest.
    //
    // Inclusion criteria — add a key here if its plaintext value would be
    // problematic in any of these scenarios:
    //   • laptop stolen with browser logged-out → attacker dumps localStorage
    //   • malicious browser extension reads localStorage during a session
    //   • the user's browser profile gets cloud-synced (Chrome Sync, etc.)
    //
    // Exclusion criteria — keys NOT in this list:
    //   • already-encrypted-by-their-module: FORM (App.save), QUOTES, ACCT_VAULT,
    //     COMMERCIAL_DRAFT / COMMERCIAL_QUOTES, EMAIL_DRAFTS, DECRYPTION_RECOVERY.
    //     Adding these would double-encrypt.
    //   • bootstrap-required (must be readable BEFORE the vault is unlocked):
    //     ENCRYPTION_SALT, PASSPHRASE_SALT, AI_SALT, E2E_CRYPTO_V2, VAULT_LOCAL_META,
    //     DEVICE_ID, SYNC_BACKEND, MIGRATION_*.
    //   • UI prefs with no PII: DARK_MODE, THEME, SIDEBAR_COLLAPSED, IDLE_TIMEOUT_MS,
    //     EXPORT_PICKER_LAST, ONBOARDED.
    //   • non-PII operational state: SYNC_META, SYNC_META_SUPABASE,
    //     CLOUD_SYNC_DISABLED, ACTIVITY_LOG (local-only ring buffer),
    //     WEATHER_CACHE / WEATHER_LOCATION (geography only), BSB_CACHE.
    //   • agency-business info without client PII: USER_NAME (the agent's own
    //     name), QUICKREF_CARDS / NUMBERS / EMOJIS / SECTIONS (carrier contact
    //     reference data).
    const SENSITIVE = Object.freeze([
        // Original 5 (May 11 2026):
        STORAGE_KEYS.CGL_STATE,
        STORAGE_KEYS.REMINDERS,
        STORAGE_KEYS.CLIENT_HISTORY,
        STORAGE_KEYS.AGENCY_GLOSSARY,
        STORAGE_KEYS.CARRIER_OVERRIDES,
        // Expanded coverage (May 11 2026, "alllll encrypted" pass):
        STORAGE_KEYS.CGL_CACHE,            // HawkSoft policy cache — client PII
        STORAGE_KEYS.CALL_LOGGER,          // call notes — client name/matter
        STORAGE_KEYS.RETURNED_MAIL,        // returned mail entries — name/address
        STORAGE_KEYS.SAVED_PROSPECTS,      // prospect names/addresses/phones
        STORAGE_KEYS.VIN_HISTORY,          // VINs from the decoder tool
        STORAGE_KEYS.INTAKE_ASSIST,        // intake scratch / chat history
        STORAGE_KEYS.HAWKSOFT_HISTORY,     // policy interaction log
        STORAGE_KEYS.HAWKSOFT_SETTINGS,    // contains the HawkSoft API token
        STORAGE_KEYS.EZLYNX_FORMDATA,      // eZlynx intake — full client form data
        STORAGE_KEYS.EZLYNX_INCIDENTS,     // accidents / tickets
        STORAGE_KEYS.DRIVERS,              // legacy driver array
        STORAGE_KEYS.VEHICLES,             // legacy vehicle array
        STORAGE_KEYS.DOC_INTEL,            // document-intelligence results — PII
        STORAGE_KEYS.QUOTE_COMPARISONS,    // saved quote comparisons — client info
        STORAGE_KEYS.EMAIL_CUSTOM_PROMPT,  // user's custom AI prompt — could contain names
        STORAGE_KEYS.EXPORT_HISTORY,       // export log — references to clients
        STORAGE_KEYS.AGENCY_PROFILE,       // agency contact info
        STORAGE_KEYS.AI_SETTINGS,          // contains API keys + agent prefs
        STORAGE_KEYS.GEMINI_KEY,           // raw Gemini API key (BYO)
        STORAGE_KEYS.BSB_API_KEY,          // BSB API key
    ].filter(Boolean)); // drop undefined entries when STORAGE_KEYS is partial (tests)
    const SENSITIVE_SET = new Set(SENSITIVE);

    // Plaintext cache: key → JS value. Populated by init(); kept in sync by
    // every setItem / setItemSync. Reads come from here so plugins stay sync.
    const _cache = new Map();
    let _ready = false;
    let _initPromise = null;
    // Keys that couldn't be encrypted at init time (e.g., v2 vault locked).
    // setItemSync attempts to migrate these on every write so we eventually
    // converge once v2 unlocks. P0 fix May 11 2026 — previously plaintext
    // could persist on disk forever if the user booted with a locked vault.
    const _pendingMigration = new Set();

    // Magic prefix that marks a SecureStorage-managed ciphertext on disk.
    // Using an explicit prefix instead of a base64-shape heuristic eliminates
    // the false-positive class where long alphanumeric plaintext (UUIDs,
    // API tokens, hex hashes) would have been mis-classified as ciphertext.
    // The prefix is short, ASCII-only, and unambiguous — no real client NPI
    // string starts with `altech-sec:v1:`. P1 fix May 11 2026.
    const ENVELOPE_PREFIX = 'altech-sec:v1:';

    function _looksEncrypted(raw) {
        return typeof raw === 'string' && raw.startsWith(ENVELOPE_PREFIX);
    }

    // Try to decrypt a possibly-encrypted value. Returns:
    //   • the plaintext if `raw` is a v1 envelope and decrypt succeeds
    //   • the original `raw` if it doesn't look like an envelope
    //   • null if it IS an envelope but decrypt fails (vault locked, key
    //     mismatch, tampered ciphertext)
    async function _tryDecryptEnvelope(raw) {
        if (!_looksEncrypted(raw)) return raw;
        if (typeof CryptoHelper === 'undefined' || !CryptoHelper.decrypt) return null;
        const ct = raw.slice(ENVELOPE_PREFIX.length);
        try { return await CryptoHelper.decrypt(ct); }
        catch { return null; }
    }

    // Encrypt a value into a v1 envelope. Returns null on encryption failure
    // (caller should fall back to writing plaintext + queuing for retry).
    async function _encryptToEnvelope(value) {
        if (typeof CryptoHelper === 'undefined' || !CryptoHelper.encrypt) return null;
        try {
            const ct = await CryptoHelper.encrypt(value);
            // Reject the JSON.stringify fallback that CryptoHelper.encrypt
            // returns when its WebCrypto path fails. We don't want plaintext
            // JSON on disk wearing an `altech-sec:v1:` mask.
            if (typeof ct !== 'string' || ct.length < 20) return null;
            if (ct.trim().startsWith('{') || ct.trim().startsWith('[')) return null;
            return ENVELOPE_PREFIX + ct;
        } catch { return null; }
    }

    // Migration path for raw values written BEFORE this module shipped or
    // before the magic-prefix scheme. Tries decrypt-without-prefix first
    // (legacy base64 ciphertext from earlier SecureStorage versions); if
    // that fails, returns null so the caller falls through to JSON.parse +
    // re-encrypt with the new envelope.
    async function _tryLegacyDecrypt(raw) {
        if (typeof raw !== 'string' || raw.length < 40) return null;
        if (typeof CryptoHelper === 'undefined' || !CryptoHelper.decrypt) return null;
        // CryptoHelper.decrypt returns null on most failure modes; only
        // unexpected throws bubble up. Treat any non-null parse-able result
        // as "the bytes decrypted to something legitimate".
        try { return await CryptoHelper.decrypt(raw); }
        catch { return null; }
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
                    // v1 envelope — decrypt with current key.
                    const plain = await _tryDecryptEnvelope(raw);
                    _cache.set(key, plain);
                    if (plain == null) {
                        // Decrypt failed (vault locked OR data was encrypted by a
                        // different key). Don't queue for re-encrypt — we don't
                        // have the plaintext to write back. The user must unlock
                        // and reload for the cache to populate.
                        console.warn('[SecureStorage] decrypt failed at init for', key, '— vault locked or key mismatch');
                    }
                } else {
                    // Either legacy ciphertext (no envelope prefix, pre-v1 format)
                    // OR plaintext JSON. Try legacy decrypt first; if that succeeds
                    // the value WAS legacy ciphertext and we have the plaintext.
                    // Otherwise treat as plaintext on disk and migrate to v1.
                    let plaintext = await _tryLegacyDecrypt(raw);
                    if (plaintext == null) {
                        plaintext = raw;
                        try { plaintext = JSON.parse(raw); } catch { /* leave as raw string */ }
                    }
                    _cache.set(key, plaintext);

                    // Migrate to v1 envelope. If encryption fails (CRYPTO_LOCKED),
                    // queue the key for retry — setItemSync will attempt the
                    // migration again on every subsequent write once the vault
                    // unlocks. Plaintext stays on disk in the meantime; the cache
                    // is still correct so plugin reads keep working.
                    const env = await _encryptToEnvelope(plaintext);
                    if (env) {
                        try {
                            localStorage.setItem(key, env);
                        } catch (e) {
                            // QuotaExceededError on a single oversized key (a fat
                            // cgl_cache full of HawkSoft policy bytes is the usual
                            // culprit). Pre-fix, the throw escaped the IIFE and
                            // _ready never flipped — the localStorage proxy never
                            // installed, and every later `Reminders._load()` got
                            // the raw envelope string back instead of plaintext,
                            // failing `JSON.parse("altech-sec:v1:…")`.
                            //
                            // Recovery: leave the disk value as-is (still readable
                            // via the cache we already populated above) and keep
                            // going. The cache is the source of truth at runtime;
                            // the on-disk encryption upgrade for THIS key can wait
                            // until the next write attempt (which will either
                            // shrink the payload or hit quota again — either way,
                            // the cache + proxy are alive for every other key).
                            _pendingMigration.add(key);
                            console.warn('[SecureStorage] migration write deferred for', key, '— storage quota exceeded; runtime reads use the cache');
                        }
                    } else {
                        _pendingMigration.add(key);
                        console.warn('[SecureStorage] migration encrypt deferred for', key, '— will retry on next write');
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
        const env = await _encryptToEnvelope(parsed);
        if (env) {
            _ls().setItem(key, env);
            _pendingMigration.delete(key);
            // Best-effort retry for any other still-plaintext keys.
            _retryPendingMigration();
            return;
        }
        // Fallback: encryption unavailable (e.g., CRYPTO_LOCKED) — write
        // plaintext so we don't lose the user's data, and queue the key for
        // retry on the next setItem after the vault unlocks.
        console.warn('[SecureStorage] encrypt unavailable for', key, '— writing plaintext, queuing for retry');
        _ls().setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        _pendingMigration.add(key);
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
        // Write plaintext immediately for durability — the async encrypt
        // below replaces it within a few ms. P0 acceptable per threat model.
        _ls().setItem(key, serialized);

        // Mark this key as pending and kick off encryption. The retry sweep
        // also tries any OTHER keys that failed at init.
        _pendingMigration.add(key);
        _retryPendingMigration();
    }

    // Fire-and-forget retry sweep — tries to encrypt every still-pending
    // key with the CURRENT cache value. Race-safe: only flushes a
    // ciphertext when the cache hasn't moved on. Called from setItem(Sync)
    // so the system converges as soon as the vault is unlocked.
    function _retryPendingMigration() {
        if (_pendingMigration.size === 0) return;
        if (typeof CryptoHelper === 'undefined' || !CryptoHelper.encrypt) return;
        for (const key of Array.from(_pendingMigration)) {
            const snapshot = _cache.get(key);
            if (snapshot == null) { _pendingMigration.delete(key); continue; }
            _encryptToEnvelope(snapshot)
                .then(env => {
                    if (!env) return; // still failing — leave queued
                    if (_cache.get(key) !== snapshot) return; // newer write — let its own flush win
                    _ls().setItem(key, env);
                    _pendingMigration.delete(key);
                })
                .catch(e => console.warn('[SecureStorage] retry encrypt failed for', key, '—', (e && e.message) || e));
        }
    }

    // Public API for hooks (vault-ui unlock flow, manual sweeps). Resolves
    // when every pending migration has been attempted at least once.
    async function migrate() {
        if (_pendingMigration.size === 0) return { migrated: 0, pending: 0 };
        const before = _pendingMigration.size;
        const tasks = Array.from(_pendingMigration).map(async (key) => {
            const snapshot = _cache.get(key);
            if (snapshot == null) { _pendingMigration.delete(key); return; }
            const env = await _encryptToEnvelope(snapshot);
            if (env && _cache.get(key) === snapshot) {
                _ls().setItem(key, env);
                _pendingMigration.delete(key);
            }
        });
        await Promise.allSettled(tasks);
        return { migrated: before - _pendingMigration.size, pending: _pendingMigration.size };
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
        init, getItem, getParsed, setItem, setItemSync, removeItem, migrate,
        isReady: () => _ready,
        isSensitive: (key) => SENSITIVE_SET.has(key),
        // Inspection — tests verify pending state after a CRYPTO_LOCKED scenario.
        pendingMigrationCount: () => _pendingMigration.size,
        SENSITIVE_KEYS: SENSITIVE.slice(),
    });
})();
