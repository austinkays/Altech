// CryptoHelper — AES-256-GCM via Web Crypto API
//
// Two key-derivation paths live here in parallel during the Path B migration:
//
//   v1 (legacy, default):  PBKDF2(deviceFingerprint, ENCRYPTION_SALT, 100k iter)
//                          Key is device-bound. No user secret required.
//                          Stays active until a user has completed the v2 migration.
//
//   v2 (E2E, opt-in):      PBKDF2(userPassphrase, PASSPHRASE_SALT, 600k iter)
//                          Key lives ONLY in memory; cleared on sign-out / lock.
//                          Server never sees the passphrase, only the salt.
//                          Enabled when STORAGE_KEYS.E2E_CRYPTO_V2 === '1' AND a
//                          passphrase has been unlocked this session.
//
// encrypt() and decrypt() pick the right path automatically. Callers never need
// to know which one is active — they just call CryptoHelper.encrypt(obj).
//
// Payload shape stays identical across both versions:
//   base64( iv(12 bytes) || AES-256-GCM(plaintext) )
// This means v1-encrypted data can still be read after v2 is enabled (during the
// migration window) by calling decryptWithV1() explicitly.

'use strict';

const CryptoHelper = (() => {
    // In-memory key cache. Cleared on clearV2Key() or sign-out.
    let _v2Key = null;

    // Caches for legacy path — avoid re-deriving on every encrypt/decrypt call.
    let _v1Key = null;
    let _v1Fingerprint = null;

    // Safe-access helper: STORAGE_KEYS is a global, but during a fresh page load
    // the order-of-script-tags check could race. Treat it defensively.
    function _key(name) {
        return (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS[name]) || null;
    }

    // ─── v1: device-bound key (legacy, default) ───────────────────────────────
    async function _getDeviceFingerprint() {
        const SALT_KEY = _key('ENCRYPTION_SALT');
        let salt = SALT_KEY ? localStorage.getItem(SALT_KEY) : null;
        if (!salt) {
            const arr = new Uint8Array(32);
            crypto.getRandomValues(arr);
            salt = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            if (SALT_KEY) localStorage.setItem(SALT_KEY, salt);
        }
        const msg = new TextEncoder().encode([salt, 'ALTECH_FIELD_PRO_v2'].join('||'));
        const hash = await crypto.subtle.digest('SHA-256', msg);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function _getV1Key() {
        const fingerprint = await _getDeviceFingerprint();
        if (_v1Key && _v1Fingerprint === fingerprint) return _v1Key;

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(fingerprint),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        const salt = new TextEncoder().encode('altech_v6_salt_2026');
        _v1Key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        _v1Fingerprint = fingerprint;
        return _v1Key;
    }

    // ─── v2: passphrase-derived key ───────────────────────────────────────────
    //
    // Salt is stored on the server (Supabase user_crypto_meta.passphrase_salt)
    // and mirrored locally so the app can unlock even while offline. On first
    // unlock after Phase 4 migration, the salt is pulled from Supabase and
    // cached here.
    async function _deriveV2Key(passphrase, saltBytes, iterations) {
        if (!passphrase || typeof passphrase !== 'string') {
            throw new Error('Passphrase required');
        }
        if (!(saltBytes instanceof Uint8Array) || saltBytes.length < 16) {
            throw new Error('Salt must be at least 16 bytes');
        }
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(passphrase.normalize('NFKC')),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: iterations || 600000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    function _saltToBase64(saltBytes) {
        return btoa(String.fromCharCode(...saltBytes));
    }

    function _saltFromBase64(saltB64) {
        return Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    }

    // ─── Path selector ────────────────────────────────────────────────────────
    function _isV2Enabled() {
        return localStorage.getItem(_key('E2E_CRYPTO_V2')) === '1';
    }

    async function _getActiveKey(mode /* 'encrypt' | 'decrypt' */) {
        if (_isV2Enabled()) {
            if (_v2Key) return _v2Key;
            // v2 enabled but locked. Encrypting with the legacy key would write
            // data the user can't read back after unlocking. Refuse.
            if (mode === 'encrypt') {
                throw new Error('CRYPTO_LOCKED: Passphrase required — unlock before writing');
            }
            // For decrypt, we still fall through to v1 (legacy data predating
            // the migration may remain readable) so loads of old data don't
            // hard-fail. Caller can handle null returns.
            return await _getV1Key();
        }
        return await _getV1Key();
    }

    // ─── Public API ───────────────────────────────────────────────────────────
    return {
        // Unchanged — still returns a base64 string, still IV-prefixed GCM.
        async encrypt(data) {
            try {
                const key = await _getActiveKey('encrypt');
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const encoded = new TextEncoder().encode(JSON.stringify(data));
                const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
                const combined = new Uint8Array(iv.length + ct.byteLength);
                combined.set(iv, 0);
                combined.set(new Uint8Array(ct), iv.length);
                return btoa(String.fromCharCode(...combined));
            } catch (e) {
                if (e && typeof e.message === 'string' && e.message.startsWith('CRYPTO_LOCKED')) {
                    throw e;
                }
                console.error('Encryption failed:', e);
                return JSON.stringify(data);
            }
        },

        async decrypt(encryptedData) {
            try {
                const key = await _getActiveKey('decrypt');
                const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
                const iv = combined.slice(0, 12);
                const ct = combined.slice(12);
                const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
                return JSON.parse(new TextDecoder().decode(pt));
            } catch (firstErr) {
                // If v2 is enabled + unlocked and we failed, try v1 — this is
                // the hot path during migration where old records are still
                // encrypted under the device key.
                if (_isV2Enabled() && _v2Key) {
                    try {
                        const legacyKey = await _getV1Key();
                        const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
                        const iv = combined.slice(0, 12);
                        const ct = combined.slice(12);
                        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, legacyKey, ct);
                        return JSON.parse(new TextDecoder().decode(pt));
                    } catch (e) { /* fall through */ }
                }
                // Last-resort: legacy unencrypted JSON string — pre-AES days.
                try { return JSON.parse(encryptedData); } catch (e) {
                    console.error('Decryption failed:', firstErr);
                    return null;
                }
            }
        },

        generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                const arr = new Uint8Array(16);
                crypto.getRandomValues(arr);
                arr[6] = (arr[6] & 0x0f) | 0x40;
                arr[8] = (arr[8] & 0x3f) | 0x80;
                const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
                return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
            }
            return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
        },

        // ─── v2 API (Phase 1+) ────────────────────────────────────────────────

        /**
         * Is the passphrase-derived key available in memory this session?
         */
        isV2Unlocked() { return _isV2Enabled() && _v2Key !== null; },

        /**
         * Is v2 turned on for this user (independent of whether it's unlocked)?
         */
        isV2Enabled() { return _isV2Enabled(); },

        /**
         * Turn the v2 flag on. Does NOT derive a key — call setPassphrase() for that.
         */
        enableV2() { localStorage.setItem(_key('E2E_CRYPTO_V2'), '1'); },

        /**
         * Turn the v2 flag off. Also clears any cached key.
         */
        disableV2() {
            localStorage.removeItem(_key('E2E_CRYPTO_V2'));
            _v2Key = null;
        },

        /**
         * Derive a fresh v2 salt (32 random bytes), store it locally, return base64.
         * The server copy lives at user_crypto_meta.passphrase_salt — caller is
         * responsible for persisting it.
         */
        createPassphraseSalt() {
            const arr = new Uint8Array(32);
            crypto.getRandomValues(arr);
            const b64 = _saltToBase64(arr);
            localStorage.setItem(_key('PASSPHRASE_SALT'), b64);
            return b64;
        },

        /**
         * Cache a server-provided salt locally (used after Phase 4 migration
         * when a user signs in on a new device).
         */
        setLocalSalt(saltB64) {
            localStorage.setItem(_key('PASSPHRASE_SALT'), saltB64);
        },

        getLocalSalt() {
            return localStorage.getItem(_key('PASSPHRASE_SALT'));
        },

        /**
         * Derive + cache the v2 key from a passphrase + the local salt.
         * Returns true on success, false if no salt is available.
         * Throws on derivation failure.
         */
        async setPassphrase(passphrase, iterations = 600000) {
            const saltB64 = this.getLocalSalt();
            if (!saltB64) return false;
            _v2Key = await _deriveV2Key(passphrase, _saltFromBase64(saltB64), iterations);
            return true;
        },

        /**
         * Verify that a passphrase unlocks the existing vault by trying to
         * decrypt a known ciphertext (the "proof blob" stored at
         * user_crypto_meta). Caller supplies the probe.
         * Returns true on success, false on AEAD failure.
         */
        async verifyPassphrase(passphrase, proofCiphertext, iterations = 600000) {
            const saltB64 = this.getLocalSalt();
            if (!saltB64) return false;
            try {
                const testKey = await _deriveV2Key(passphrase, _saltFromBase64(saltB64), iterations);
                const combined = Uint8Array.from(atob(proofCiphertext), c => c.charCodeAt(0));
                const iv = combined.slice(0, 12);
                const ct = combined.slice(12);
                await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, testKey, ct);
                _v2Key = testKey; // Unlock on successful verification.
                return true;
            } catch (e) {
                return false;
            }
        },

        /**
         * Lock the vault — clears the cached v2 key so subsequent encrypt()
         * calls will throw CRYPTO_LOCKED until setPassphrase() / verifyPassphrase()
         * is called again. Safe to call anytime.
         */
        lock() { _v2Key = null; },

        // ─── Migration helpers (Phase 4) ──────────────────────────────────────

        /**
         * Decrypt with the legacy v1 key regardless of v2 state. Used by the
         * migration flow to re-encrypt old blobs under the new passphrase key.
         */
        async decryptWithV1(encryptedData) {
            try {
                const key = await _getV1Key();
                const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
                const iv = combined.slice(0, 12);
                const ct = combined.slice(12);
                const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
                return JSON.parse(new TextDecoder().decode(pt));
            } catch (e) {
                try { return JSON.parse(encryptedData); } catch (_) { return null; }
            }
        },

        /**
         * Encrypt with the v2 key specifically, regardless of flag state.
         * Used during the re-encryption loop so a half-migrated account can't
         * produce a mix of v1 and v2 blobs.
         */
        async encryptWithV2(data) {
            if (!_v2Key) throw new Error('CRYPTO_LOCKED: No v2 key in memory');
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(JSON.stringify(data));
            const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _v2Key, encoded);
            const combined = new Uint8Array(iv.length + ct.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(ct), iv.length);
            return btoa(String.fromCharCode(...combined));
        },

        // ─── Internals exposed for tests only ─────────────────────────────────
        _internals: {
            get v2Key() { return _v2Key; },
            get v1Fingerprint() { return _v1Fingerprint; },
            reset() { _v2Key = null; _v1Key = null; _v1Fingerprint = null; },
        },
    };
})();

// ── Safe localStorage wrapper (handles QuotaExceededError) ──────────
function safeSave(key, value) {
    try {
        localStorage.setItem(key, value);
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
        return true;
    } catch (e) {
        console.error(`[safeSave] Failed to write "${key}":`, e.name, e.message);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('⚠️ Storage full! Export your data to free space.', 4000);
            }
        }
        return false;
    }
}
