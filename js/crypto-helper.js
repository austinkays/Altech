// CryptoHelper — AES-256-GCM via Web Crypto API
//
// Two key-derivation paths live here in parallel during the Path B migration:
//
//   v1 (legacy, default):  PBKDF2(deviceFingerprint, ENCRYPTION_SALT, 100k iter)
//                          Key is device-bound. No user secret required.
//                          Stays active until a user has completed the v2 migration.
//
//   v2 (E2E, opt-in):      Master-key + wrapping model.
//                          MK = random 256-bit AES key, generated once per user.
//                          MK encrypts all data blobs.
//                          MK is wrapped twice on the server:
//                            passphrase_wrapped_mk = AES-GCM(MK) under PBKDF2(passphrase, passphrase_salt, passphrase_iterations)
//                            recovery_wrapped_mk   = AES-GCM(MK) under PBKDF2(recovery_key, recovery_salt, recovery_iterations)
//                          Changing a passphrase only re-wraps MK — data blobs stay put.
//                          Server never sees MK, passphrase, or recovery key.
//
// encrypt() and decrypt() pick the right path automatically. Callers never need
// to know which one is active — they just call CryptoHelper.encrypt(obj).
//
// Payload shape (both v1 and v2 encrypted data, and also wrapped MK blobs):
//   base64( iv(12 bytes) || AES-256-GCM(payload) )
//
// Recovery key format: 32 random bytes hex-encoded as 64 chars, displayed in
// 4 groups of 16 separated by hyphens. ~67 chars total.
//   Example: `A3F5E72D9C018B44-1E76FCA0D835219B-7502CC6E3F8A91BD-4DE28B1F95C063AA`

'use strict';

const CryptoHelper = (() => {
    // In-memory cached master key (v2). CryptoKey, not raw bytes.
    let _v2Key = null;

    // Caches for legacy path — avoid re-deriving on every encrypt/decrypt call.
    let _v1Key = null;
    let _v1Fingerprint = null;

    function _key(name) {
        return (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS[name]) || null;
    }

    // ─── Byte helpers ─────────────────────────────────────────────────────────
    function _bytesToBase64(bytes) {
        return btoa(String.fromCharCode(...bytes));
    }
    function _base64ToBytes(b64) {
        return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    }
    function _bytesToHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    function _hexToBytes(hex) {
        const clean = hex.replace(/[^0-9a-fA-F]/g, '');
        if (clean.length % 2 !== 0) throw new Error('Invalid hex length');
        const out = new Uint8Array(clean.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
        return out;
    }

    // ─── v1: device-bound key (legacy, default) ───────────────────────────────
    async function _getDeviceFingerprint() {
        const SALT_KEY = _key('ENCRYPTION_SALT');
        let salt = SALT_KEY ? localStorage.getItem(SALT_KEY) : null;
        if (!salt) {
            const arr = new Uint8Array(32);
            crypto.getRandomValues(arr);
            salt = _bytesToHex(arr);
            if (SALT_KEY) localStorage.setItem(SALT_KEY, salt);
        }
        const msg = new TextEncoder().encode([salt, 'ALTECH_FIELD_PRO_v2'].join('||'));
        const hash = await crypto.subtle.digest('SHA-256', msg);
        return _bytesToHex(new Uint8Array(hash));
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

    // ─── v2 primitives ────────────────────────────────────────────────────────

    // Import MK raw bytes as an AES-GCM CryptoKey for encrypt/decrypt usage.
    // Imported with extractable=true so we can re-wrap under new KEKs during
    // passphrase changes / recovery-key attachments without forcing the user
    // to re-enter their passphrase.
    async function _importMK(mkBytes) {
        return await crypto.subtle.importKey(
            'raw',
            mkBytes,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    async function _exportMK(cryptoKey) {
        return new Uint8Array(await crypto.subtle.exportKey('raw', cryptoKey));
    }

    // Derive a key-encryption-key (KEK) from a secret (passphrase or recovery
    // key). Returns a CryptoKey usable for wrap/unwrap (encrypt/decrypt).
    async function _deriveKEK(secret, saltB64, iterations) {
        if (!secret || typeof secret !== 'string') {
            throw new Error('Secret required');
        }
        if (!saltB64) throw new Error('Salt required');
        const saltBytes = _base64ToBytes(saltB64);
        if (saltBytes.length < 16) throw new Error('Salt must be at least 16 bytes');

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret.normalize('NFKC')),
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
            true, // extractable — so we can use it for encrypt/decrypt of MK bytes
            ['encrypt', 'decrypt']
        );
    }

    // Encrypt MK bytes under a KEK, return base64( iv || ciphertext ).
    async function _wrapMK(mkBytes, kek) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, mkBytes);
        const combined = new Uint8Array(iv.length + ct.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ct), iv.length);
        return _bytesToBase64(combined);
    }

    // Decrypt a wrapped MK back to raw bytes using a KEK. Throws on AEAD failure.
    async function _unwrapMK(wrappedB64, kek) {
        const combined = _base64ToBytes(wrappedB64);
        if (combined.length < 28) throw new Error('Wrapped MK too short');
        const iv = combined.slice(0, 12);
        const ct = combined.slice(12);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ct);
        return new Uint8Array(pt);
    }

    // Generate a fresh 32-byte salt, return base64.
    function _newSaltB64() {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr);
        return _bytesToBase64(arr);
    }

    // Recovery key: 32 random bytes, hex-encoded, grouped 16 chars per block.
    function _formatRecoveryKey(bytes) {
        const hex = _bytesToHex(bytes).toUpperCase();
        return [hex.slice(0, 16), hex.slice(16, 32), hex.slice(32, 48), hex.slice(48, 64)].join('-');
    }

    function _parseRecoveryKey(display) {
        const clean = (display || '').replace(/[^0-9a-fA-F]/g, '');
        if (clean.length !== 64) {
            throw new Error('Recovery key must decode to 32 bytes (64 hex chars)');
        }
        return _hexToBytes(clean);
    }

    // ─── Path selector ────────────────────────────────────────────────────────
    function _isV2Enabled() {
        return localStorage.getItem(_key('E2E_CRYPTO_V2')) === '1';
    }

    async function _getActiveKey(mode /* 'encrypt' | 'decrypt' */) {
        if (_isV2Enabled()) {
            if (_v2Key) return _v2Key;
            if (mode === 'encrypt') {
                throw new Error('CRYPTO_LOCKED: Passphrase required — unlock before writing');
            }
            return await _getV1Key();
        }
        return await _getV1Key();
    }

    // ─── Public API ───────────────────────────────────────────────────────────
    return {
        async encrypt(data) {
            try {
                const key = await _getActiveKey('encrypt');
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const encoded = new TextEncoder().encode(JSON.stringify(data));
                const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
                const combined = new Uint8Array(iv.length + ct.byteLength);
                combined.set(iv, 0);
                combined.set(new Uint8Array(ct), iv.length);
                return _bytesToBase64(combined);
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
                const combined = _base64ToBytes(encryptedData);
                const iv = combined.slice(0, 12);
                const ct = combined.slice(12);
                const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
                return JSON.parse(new TextDecoder().decode(pt));
            } catch (firstErr) {
                // If v2 is unlocked, also try v1 as fallback — this is the hot
                // path during migration where some records may still be
                // encrypted under the device key.
                if (_isV2Enabled() && _v2Key) {
                    try {
                        const legacyKey = await _getV1Key();
                        const combined = _base64ToBytes(encryptedData);
                        const iv = combined.slice(0, 12);
                        const ct = combined.slice(12);
                        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, legacyKey, ct);
                        return JSON.parse(new TextDecoder().decode(pt));
                    } catch (e) { /* fall through */ }
                }
                try { return JSON.parse(encryptedData); } catch (e) {
                    console.error('Decryption failed:', firstErr);
                    return null;
                }
            }
        },

        generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
            if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                const arr = new Uint8Array(16);
                crypto.getRandomValues(arr);
                arr[6] = (arr[6] & 0x0f) | 0x40;
                arr[8] = (arr[8] & 0x3f) | 0x80;
                const hex = _bytesToHex(arr);
                return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
            }
            return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
        },

        // ─── v2 API (Phase 1+) ────────────────────────────────────────────────

        isV2Enabled() { return _isV2Enabled(); },
        isV2Unlocked() { return _isV2Enabled() && _v2Key !== null; },
        enableV2() { localStorage.setItem(_key('E2E_CRYPTO_V2'), '1'); },
        disableV2() {
            localStorage.removeItem(_key('E2E_CRYPTO_V2'));
            _v2Key = null;
        },
        lock() { _v2Key = null; },

        /**
         * Onboarding: generate a fresh MK, wrap it under the passphrase,
         * cache the MK in memory, and return the pieces the server needs.
         *
         * @param {string} passphrase
         * @param {number} [iterations=600000]
         * @returns {Promise<{ passphraseSaltB64, passphraseWrappedMKB64, passphraseIterations }>}
         */
        async createVault(passphrase, iterations = 600000) {
            if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 8) {
                throw new Error('Passphrase must be at least 8 characters');
            }
            const mkBytes = new Uint8Array(32);
            crypto.getRandomValues(mkBytes);

            const passphraseSaltB64 = _newSaltB64();
            const kek = await _deriveKEK(passphrase, passphraseSaltB64, iterations);
            const passphraseWrappedMKB64 = await _wrapMK(mkBytes, kek);

            _v2Key = await _importMK(mkBytes);
            // Zero out the plaintext MK we just used (best-effort — JS has no guarantee).
            mkBytes.fill(0);

            return {
                passphraseSaltB64,
                passphraseWrappedMKB64,
                passphraseIterations: iterations,
            };
        },

        /**
         * Sign-in: unwrap MK using passphrase and cache it in memory.
         *
         * @param {{ passphraseSaltB64: string, passphraseWrappedMKB64: string, passphraseIterations?: number }} serverMeta
         * @param {string} passphrase
         * @returns {Promise<boolean>} true on successful unlock
         */
        async unlockVault(serverMeta, passphrase) {
            if (!serverMeta || !serverMeta.passphraseSaltB64 || !serverMeta.passphraseWrappedMKB64) {
                return false;
            }
            try {
                const iter = serverMeta.passphraseIterations || 600000;
                const kek = await _deriveKEK(passphrase, serverMeta.passphraseSaltB64, iter);
                const mkBytes = await _unwrapMK(serverMeta.passphraseWrappedMKB64, kek);
                _v2Key = await _importMK(mkBytes);
                mkBytes.fill(0);
                return true;
            } catch (e) {
                return false;
            }
        },

        /**
         * Change the passphrase: re-wrap the current MK under a new KEK and
         * return the updated server blobs. Requires the vault to be unlocked.
         * Verifies the current passphrase before rotating so we can't silently
         * overwrite a vault the caller doesn't actually own.
         *
         * @param {{ passphraseSaltB64, passphraseWrappedMKB64, passphraseIterations? }} currentServerMeta
         * @param {string} currentPassphrase
         * @param {string} newPassphrase
         * @param {number} [iterations=600000]
         * @returns {Promise<{ passphraseSaltB64, passphraseWrappedMKB64, passphraseIterations } | null>}
         */
        async changePassphrase(currentServerMeta, currentPassphrase, newPassphrase, iterations = 600000) {
            if (!newPassphrase || newPassphrase.length < 8) {
                throw new Error('New passphrase must be at least 8 characters');
            }
            const iter = currentServerMeta.passphraseIterations || 600000;
            const currentKek = await _deriveKEK(currentPassphrase, currentServerMeta.passphraseSaltB64, iter);
            try {
                await _unwrapMK(currentServerMeta.passphraseWrappedMKB64, currentKek);
            } catch (e) {
                return null; // Current passphrase was wrong.
            }
            // Caller was legit. Re-wrap whatever MK is currently in memory.
            return await this.rewrapWithPassphrase(newPassphrase, iterations);
        },

        /**
         * Wrap the currently-unlocked MK under a new passphrase KEK. Used by
         * both the "change passphrase" flow (after verifying the old one) and
         * the "reset after recovery" flow (where MK was unlocked via the
         * recovery key, not a passphrase).
         *
         * @param {string} newPassphrase
         * @param {number} [iterations=600000]
         * @returns {Promise<{ passphraseSaltB64, passphraseWrappedMKB64, passphraseIterations }>}
         */
        async rewrapWithPassphrase(newPassphrase, iterations = 600000) {
            if (!_v2Key) throw new Error('CRYPTO_LOCKED: No v2 key in memory');
            if (!newPassphrase || newPassphrase.length < 8) {
                throw new Error('New passphrase must be at least 8 characters');
            }
            const mkBytes = await _exportMK(_v2Key);
            const passphraseSaltB64 = _newSaltB64();
            const newKek = await _deriveKEK(newPassphrase, passphraseSaltB64, iterations);
            const passphraseWrappedMKB64 = await _wrapMK(mkBytes, newKek);
            mkBytes.fill(0);
            return {
                passphraseSaltB64,
                passphraseWrappedMKB64,
                passphraseIterations: iterations,
            };
        },

        /**
         * Generate a fresh recovery key. Returns the display string (for the
         * user to save) and the byte array (for wrapping the MK).
         *
         * @returns {{ display: string, bytes: Uint8Array }}
         */
        generateRecoveryKey() {
            const bytes = new Uint8Array(32);
            crypto.getRandomValues(bytes);
            return { display: _formatRecoveryKey(bytes), bytes };
        },

        /**
         * Accept a user-pasted recovery key and return the raw bytes.
         * Throws if the string doesn't decode to 32 bytes.
         */
        parseRecoveryKey(display) { return _parseRecoveryKey(display); },

        /**
         * Format 32 raw bytes into the grouped display form.
         */
        formatRecoveryKey(bytes) { return _formatRecoveryKey(bytes); },

        /**
         * Attach a recovery key to an already-unlocked vault. Derives a
         * recovery KEK from the recovery key bytes, wraps the in-memory MK,
         * and returns the pieces for server upload. Throws if the vault is
         * not unlocked.
         *
         * Typically called right after `createVault()` during onboarding, so
         * the MK from that call is still in memory.
         */
        async wrapWithRecoveryKey(recoveryBytes, iterations = 600000) {
            if (!_v2Key) throw new Error('CRYPTO_LOCKED: No v2 key in memory');
            if (!(recoveryBytes instanceof Uint8Array) || recoveryBytes.length !== 32) {
                throw new Error('Recovery key must be 32 bytes');
            }
            const mkBytes = await _exportMK(_v2Key);
            const recoverySaltB64 = _newSaltB64();
            // Recovery key is already 256-bit random, so PBKDF2 iterations here
            // only defend against exotic offline attacks. Kept at 600k for
            // consistency with the passphrase path.
            const recoverySecret = _bytesToHex(recoveryBytes);
            const recoveryKek = await _deriveKEK(recoverySecret, recoverySaltB64, iterations);
            const recoveryWrappedMKB64 = await _wrapMK(mkBytes, recoveryKek);
            mkBytes.fill(0);

            return {
                recoverySaltB64,
                recoveryWrappedMKB64,
                recoveryIterations: iterations,
            };
        },

        /**
         * Unlock the vault using a recovery key (not a passphrase). Takes the
         * recovery-side server blobs and the user-pasted display string.
         *
         * @returns {Promise<boolean>} true on successful unlock
         */
        async unlockVaultWithRecoveryKey(serverMeta, recoveryKeyDisplay) {
            if (!serverMeta || !serverMeta.recoverySaltB64 || !serverMeta.recoveryWrappedMKB64) {
                return false;
            }
            let recoveryBytes;
            try {
                recoveryBytes = _parseRecoveryKey(recoveryKeyDisplay);
            } catch (e) {
                return false;
            }
            try {
                const iter = serverMeta.recoveryIterations || 600000;
                const recoverySecret = _bytesToHex(recoveryBytes);
                const kek = await _deriveKEK(recoverySecret, serverMeta.recoverySaltB64, iter);
                const mkBytes = await _unwrapMK(serverMeta.recoveryWrappedMKB64, kek);
                _v2Key = await _importMK(mkBytes);
                mkBytes.fill(0);
                return true;
            } catch (e) {
                return false;
            }
        },

        // ─── Migration helpers (Phase 4) ──────────────────────────────────────

        async decryptWithV1(encryptedData) {
            try {
                const key = await _getV1Key();
                const combined = _base64ToBytes(encryptedData);
                const iv = combined.slice(0, 12);
                const ct = combined.slice(12);
                const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
                return JSON.parse(new TextDecoder().decode(pt));
            } catch (e) {
                try { return JSON.parse(encryptedData); } catch (_) { return null; }
            }
        },

        async encryptWithV2(data) {
            if (!_v2Key) throw new Error('CRYPTO_LOCKED: No v2 key in memory');
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(JSON.stringify(data));
            const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _v2Key, encoded);
            const combined = new Uint8Array(iv.length + ct.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(ct), iv.length);
            return _bytesToBase64(combined);
        },

        // ─── Internals for tests only ─────────────────────────────────────────
        _internals: {
            get v2Key() { return _v2Key; },
            get v1Fingerprint() { return _v1Fingerprint; },
            reset() { _v2Key = null; _v1Key = null; _v1Fingerprint = null; },
            // Encoding helpers — exposed so tests can exercise them without
            // re-implementing.
            formatRecoveryKey: _formatRecoveryKey,
            parseRecoveryKey: _parseRecoveryKey,
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
