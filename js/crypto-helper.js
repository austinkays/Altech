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
//                            passphrase_wrapped_mk = KDF(passphrase, passphrase_salt) → KEK; AES-GCM(MK) under KEK
//                            recovery_wrapped_mk   = KDF(recovery_key, recovery_salt) → KEK; AES-GCM(MK) under KEK
//                          Changing a passphrase only re-wraps MK — data blobs stay put.
//                          Server never sees MK, passphrase, or recovery key.
//
// KDF for v2 vaults:
//   - New vaults (Phase A+): Argon2id (memory-hard, GPU-resistant). Default
//     params: m=64 MiB, t=3, p=1. ~700ms on a modern laptop.
//   - Legacy v2 vaults: PBKDF2-SHA256, 600k iterations. Still unlocks; on
//     explicit upgrade, the KEK is rewrapped under Argon2id without changing MK.
//   - Vault metadata advertises which KDF was used via `passphraseKdf` /
//     `recoveryKdf` fields. Absence of these fields = legacy PBKDF2.
//
// HKDF subkey derivation (Phase A2):
//   New vaults set `kdfTree: 'hkdf-v1'`. When set, MK is treated as a master
//   *seed* and the AES data key is derived via HKDF-SHA256 with domain-
//   separation info string 'altech.data.v1'. Future subkeys (blind index,
//   agency wrap) use distinct info strings so a leak of one cannot be
//   replayed against another role. Legacy vaults (no kdfTree) use MK directly
//   as the data key — both paths produce a working AES-GCM key, the API is
//   identical for callers.
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
    // In-memory cached AES-GCM data key (v2). With kdfTree='hkdf-v1' this is
    // HKDF-derived from MK; without kdfTree it IS MK imported as AES-GCM.
    // Either way, encrypt() and decrypt() use this directly.
    let _v2Key = null;

    // Raw MK bytes — kept separately so re-wrap flows (changePassphrase,
    // wrapWithRecoveryKey) can rewrap MK independently of the data key, and
    // so future subkey roles (blind index, agency wrap) can derive from it.
    // Cleared on lock(). Best-effort zeroing — JS provides no guarantee.
    let _v2MKBytes = null;

    // Active vault's HKDF tree mode — 'hkdf-v1' or null. Captured at unlock
    // time so re-wrap flows preserve the original tree mode.
    let _v2KdfTree = null;

    // Caches for legacy path — avoid re-deriving on every encrypt/decrypt call.
    let _v1Key = null;
    let _v1Fingerprint = null;

    // Cache MK bytes + derive data key for the active vault. Zeroes any
    // previously cached MK before storing the new one.
    async function _setV2MK(mkBytes, kdfTree) {
        if (_v2MKBytes) _v2MKBytes.fill(0);
        _v2MKBytes = new Uint8Array(mkBytes); // copy — caller may zero theirs
        _v2KdfTree = kdfTree || null;
        _v2Key = await _dataKeyForVault(_v2MKBytes, _v2KdfTree);
    }

    function _clearV2MK() {
        if (_v2MKBytes) _v2MKBytes.fill(0);
        _v2MKBytes = null;
        _v2KdfTree = null;
        _v2Key = null;
    }

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

    // ─── KDF dispatcher (PBKDF2 + Argon2id) ───────────────────────────────────

    // Default Argon2id parameters — calibrated for ~700ms on a modern laptop.
    // Tier-fallback ladder is used when the primary tier fails (typically iOS
    // Safari memory caps): 64 → 32 → 16 MiB.
    const ARGON2ID_TIERS = [
        { memMiB: 64, time: 3, parallelism: 1 },
        { memMiB: 32, time: 4, parallelism: 1 },
        { memMiB: 16, time: 6, parallelism: 1 },
    ];
    const ARGON2ID_DEFAULT = ARGON2ID_TIERS[0];

    // Lazy-load hash-wasm (provides Argon2id). ~80 KB gzipped, fetched once
    // per session. Idempotent — concurrent calls share one Promise. Tests can
    // pre-seed `window.hashwasm` with a mock to skip the network.
    let _argon2idLoadPromise = null;
    function _loadArgon2id() {
        if (typeof window !== 'undefined' && window.hashwasm && window.hashwasm.argon2id) {
            return Promise.resolve(window.hashwasm);
        }
        if (typeof globalThis !== 'undefined' && globalThis.hashwasm && globalThis.hashwasm.argon2id) {
            return Promise.resolve(globalThis.hashwasm);
        }
        if (_argon2idLoadPromise) return _argon2idLoadPromise;

        if (typeof document === 'undefined') {
            return Promise.reject(new Error('Argon2id unavailable: no DOM and no globalThis.hashwasm mock'));
        }

        _argon2idLoadPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/hash-wasm@4.11.0/dist/index.umd.min.js';
            s.async = true;
            s.onload = () => {
                if (window.hashwasm && window.hashwasm.argon2id) resolve(window.hashwasm);
                else { _argon2idLoadPromise = null; reject(new Error('hash-wasm loaded but argon2id not exposed')); }
            };
            s.onerror = () => {
                _argon2idLoadPromise = null;
                reject(new Error('Failed to load hash-wasm. Check your internet connection.'));
            };
            document.head.appendChild(s);
        });
        return _argon2idLoadPromise;
    }

    // Derive a 32-byte KEK from a secret using Argon2id, then import as
    // AES-GCM CryptoKey. Caller passes algorithm params; defaults to the
    // Phase A primary tier.
    async function _deriveKEKArgon2id(secret, saltB64, params) {
        if (!secret || typeof secret !== 'string') throw new Error('Secret required');
        if (!saltB64) throw new Error('Salt required');
        const saltBytes = _base64ToBytes(saltB64);
        if (saltBytes.length < 16) throw new Error('Salt must be at least 16 bytes');

        const p = params || ARGON2ID_DEFAULT;
        const memMiB = Number(p.memMiB) || ARGON2ID_DEFAULT.memMiB;
        const time = Number(p.time) || ARGON2ID_DEFAULT.time;
        const parallelism = Number(p.parallelism) || ARGON2ID_DEFAULT.parallelism;

        const lib = await _loadArgon2id();
        const kekBytes = await lib.argon2id({
            password: new TextEncoder().encode(secret.normalize('NFKC')),
            salt: saltBytes,
            parallelism,
            iterations: time,
            memorySize: memMiB * 1024, // hash-wasm wants KiB
            hashLength: 32,
            outputType: 'binary',
        });

        return await crypto.subtle.importKey(
            'raw',
            kekBytes,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    // Derive a key-encryption-key (KEK) from a secret using PBKDF2-SHA256.
    // Returns a CryptoKey usable for wrap/unwrap (encrypt/decrypt). This is
    // the legacy v2 path; new vaults use Argon2id but unlocks remain
    // backward-compatible indefinitely.
    async function _deriveKEKPbkdf2(secret, saltB64, iterations) {
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

    // Dispatcher: pick PBKDF2 or Argon2id based on the spec attached to the
    // vault meta. `spec` shape:
    //   { kdf: 'argon2id-v1', kdfParams: { memMiB, time, parallelism } }
    //   { kdf: 'pbkdf2-v2',   kdfParams: { iterations } }
    //   null/undefined  →  legacy PBKDF2 with `legacyIterations` (back-compat)
    async function _deriveKEKAuto(secret, saltB64, spec, legacyIterations) {
        const kdf = (spec && spec.kdf) || 'pbkdf2-v2';
        if (kdf === 'argon2id-v1') {
            return _deriveKEKArgon2id(secret, saltB64, (spec && spec.kdfParams) || null);
        }
        // PBKDF2: prefer kdfParams.iterations, fall back to legacy field.
        const iter = (spec && spec.kdfParams && Number(spec.kdfParams.iterations))
            || legacyIterations
            || 600000;
        return _deriveKEKPbkdf2(secret, saltB64, iter);
    }

    // Back-compat alias: existing call sites that hand-roll a PBKDF2 path can
    // still use `_deriveKEK(secret, saltB64, iterations)`. New code should use
    // `_deriveKEKAuto` with an explicit spec.
    async function _deriveKEK(secret, saltB64, iterations) {
        return _deriveKEKPbkdf2(secret, saltB64, iterations);
    }

    // ─── HKDF subkey derivation ───────────────────────────────────────────────
    //
    // When a vault has `kdfTree: 'hkdf-v1'`, MK is treated as a master seed
    // rather than directly as the AES data key. The AES data key is
    // HKDF-SHA256(MK, info='altech.data.v1'). Future subkeys (blind index,
    // agency wrap) use distinct info strings so a leak of one role does not
    // compromise the others.
    //
    // Legacy vaults (no kdfTree) use MK directly — `_dataKeyForVault` picks
    // the right path. The returned CryptoKey is what encrypt()/decrypt() use.

    const HKDF_INFO = Object.freeze({
        DATA:   'altech.data.v1',
        BLIND:  'altech.blind.v1',
        AGENCY: 'altech.agency.v1',
    });

    // 32-byte zero salt — HKDF-Extract is happy with this since MK already
    // has full entropy; the info string carries the domain separation.
    const _HKDF_ZERO_SALT = new Uint8Array(32);

    async function _hkdfDeriveBytes(mkBytes, info, lengthBytes) {
        const seed = await crypto.subtle.importKey(
            'raw',
            mkBytes,
            { name: 'HKDF' },
            false,
            ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: _HKDF_ZERO_SALT,
                info: new TextEncoder().encode(info),
            },
            seed,
            lengthBytes * 8
        );
        return new Uint8Array(bits);
    }

    // Derive the AES-GCM data key for a vault. Honors the kdfTree flag.
    async function _dataKeyForVault(mkBytes, kdfTree) {
        if (kdfTree === 'hkdf-v1') {
            const dkBytes = await _hkdfDeriveBytes(mkBytes, HKDF_INFO.DATA, 32);
            const k = await _importMK(dkBytes);
            dkBytes.fill(0);
            return k;
        }
        // Legacy: MK is the data key directly.
        return _importMK(mkBytes);
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
            _clearV2MK();
        },
        lock() { _clearV2MK(); },

        /**
         * Onboarding: generate a fresh MK, wrap it under the passphrase,
         * cache the MK in memory, and return the pieces the server needs.
         *
         * Phase A defaults: Argon2id KDF + HKDF subkey tree. Pass
         * `{ kdf: 'pbkdf2-v2', kdfParams: { iterations: 600000 } }` to fall
         * back to the legacy PBKDF2 path (e.g., on a device that can't load
         * hash-wasm). Pass `{ kdfTree: null }` to disable HKDF subkey
         * derivation (legacy behavior — MK is the data key directly).
         *
         * @param {string} passphrase
         * @param {object|number} [opts] — `{ kdf, kdfParams, kdfTree }` object,
         *   or a legacy positional `iterations` number for PBKDF2 backward compat.
         * @returns {Promise<{ passphraseSaltB64, passphraseWrappedMKB64, passphraseIterations, passphraseKdf, passphraseKdfParams, kdfTree }>}
         */
        async createVault(passphrase, opts = undefined) {
            if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 8) {
                throw new Error('Passphrase must be at least 8 characters');
            }
            // Resolve options. New defaults: Argon2id + HKDF tree.
            let kdf, kdfParams, kdfTree;
            if (typeof opts === 'number') {
                // Legacy positional iterations argument — keep the PBKDF2 path
                // and don't enable HKDF tree, so behavior matches pre-Phase-A.
                kdf = 'pbkdf2-v2';
                kdfParams = { iterations: opts };
                kdfTree = null;
            } else if (opts && typeof opts === 'object') {
                kdf = opts.kdf || 'argon2id-v1';
                kdfParams = opts.kdfParams || (kdf === 'argon2id-v1' ? { ...ARGON2ID_DEFAULT } : { iterations: 600000 });
                kdfTree = opts.kdfTree === undefined ? 'hkdf-v1' : opts.kdfTree;
            } else {
                kdf = 'argon2id-v1';
                kdfParams = { ...ARGON2ID_DEFAULT };
                kdfTree = 'hkdf-v1';
            }

            const mkBytes = new Uint8Array(32);
            crypto.getRandomValues(mkBytes);

            const passphraseSaltB64 = _newSaltB64();
            const kek = await _deriveKEKAuto(passphrase, passphraseSaltB64, { kdf, kdfParams });
            const passphraseWrappedMKB64 = await _wrapMK(mkBytes, kek);

            await _setV2MK(mkBytes, kdfTree);
            // Zero out our local copy (the cache is a fresh copy).
            mkBytes.fill(0);

            // For PBKDF2 records, mirror the iteration count into the legacy
            // `passphraseIterations` field so older readers (pre-Phase-A) can
            // still unlock. Argon2id records leave it null.
            const passphraseIterations = kdf === 'pbkdf2-v2'
                ? Number(kdfParams.iterations) || 600000
                : null;

            return {
                passphraseSaltB64,
                passphraseWrappedMKB64,
                passphraseIterations,
                passphraseKdf: kdf,
                passphraseKdfParams: kdfParams,
                kdfTree,
            };
        },

        /**
         * Sign-in: unwrap MK using passphrase and cache it in memory.
         *
         * Honors `passphraseKdf` (Argon2id vs PBKDF2) and `kdfTree` (HKDF
         * subkey derivation) when present. Records written before Phase A
         * lack these fields; we default them to legacy PBKDF2 + no HKDF
         * tree so old vaults keep unlocking with no migration step.
         *
         * @param {object} serverMeta — at minimum { passphraseSaltB64, passphraseWrappedMKB64 }.
         *   May also carry { passphraseKdf, passphraseKdfParams, kdfTree, passphraseIterations }.
         * @param {string} passphrase
         * @returns {Promise<boolean>} true on successful unlock
         */
        async unlockVault(serverMeta, passphrase) {
            if (!serverMeta || !serverMeta.passphraseSaltB64 || !serverMeta.passphraseWrappedMKB64) {
                return false;
            }
            try {
                const spec = {
                    kdf: serverMeta.passphraseKdf || 'pbkdf2-v2',
                    kdfParams: serverMeta.passphraseKdfParams || null,
                };
                const kek = await _deriveKEKAuto(
                    passphrase,
                    serverMeta.passphraseSaltB64,
                    spec,
                    serverMeta.passphraseIterations
                );
                const mkBytes = await _unwrapMK(serverMeta.passphraseWrappedMKB64, kek);
                await _setV2MK(mkBytes, serverMeta.kdfTree || null);
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
         * Phase A: defaults to upgrading the KDF to Argon2id when the current
         * vault is on legacy PBKDF2. The MK itself is unchanged, so no data
         * needs to be re-encrypted. Pass `{ kdf: 'pbkdf2-v2', kdfParams: ... }`
         * in opts to keep PBKDF2 (e.g., on a device that can't load hash-wasm).
         *
         * @param {object} currentServerMeta
         * @param {string} currentPassphrase
         * @param {string} newPassphrase
         * @param {object|number} [opts] — `{ kdf, kdfParams }` or legacy iterations number.
         * @returns {Promise<object | null>} Updated server meta, or null on wrong passphrase.
         */
        async changePassphrase(currentServerMeta, currentPassphrase, newPassphrase, opts = undefined) {
            if (!newPassphrase || newPassphrase.length < 8) {
                throw new Error('New passphrase must be at least 8 characters');
            }
            const currentSpec = {
                kdf: currentServerMeta.passphraseKdf || 'pbkdf2-v2',
                kdfParams: currentServerMeta.passphraseKdfParams || null,
            };
            const currentKek = await _deriveKEKAuto(
                currentPassphrase,
                currentServerMeta.passphraseSaltB64,
                currentSpec,
                currentServerMeta.passphraseIterations
            );
            try {
                await _unwrapMK(currentServerMeta.passphraseWrappedMKB64, currentKek);
            } catch (e) {
                return null; // Current passphrase was wrong.
            }
            // Caller was legit. Re-wrap whatever MK is currently in memory.
            return await this.rewrapWithPassphrase(newPassphrase, opts);
        },

        /**
         * Wrap the currently-unlocked MK under a new passphrase KEK. Used by
         * both the "change passphrase" flow (after verifying the old one) and
         * the "reset after recovery" flow (where MK was unlocked via the
         * recovery key, not a passphrase).
         *
         * @param {string} newPassphrase
         * @param {object|number} [opts] — `{ kdf, kdfParams }`, or legacy iterations number.
         * @returns {Promise<object>} Server meta to persist.
         */
        async rewrapWithPassphrase(newPassphrase, opts = undefined) {
            if (!_v2MKBytes) throw new Error('CRYPTO_LOCKED: No v2 key in memory');
            if (!newPassphrase || newPassphrase.length < 8) {
                throw new Error('New passphrase must be at least 8 characters');
            }
            let kdf, kdfParams;
            if (typeof opts === 'number') {
                kdf = 'pbkdf2-v2';
                kdfParams = { iterations: opts };
            } else if (opts && typeof opts === 'object') {
                kdf = opts.kdf || 'argon2id-v1';
                kdfParams = opts.kdfParams || (kdf === 'argon2id-v1' ? { ...ARGON2ID_DEFAULT } : { iterations: 600000 });
            } else {
                kdf = 'argon2id-v1';
                kdfParams = { ...ARGON2ID_DEFAULT };
            }

            const passphraseSaltB64 = _newSaltB64();
            const newKek = await _deriveKEKAuto(newPassphrase, passphraseSaltB64, { kdf, kdfParams });
            const passphraseWrappedMKB64 = await _wrapMK(_v2MKBytes, newKek);

            const passphraseIterations = kdf === 'pbkdf2-v2'
                ? Number(kdfParams.iterations) || 600000
                : null;

            return {
                passphraseSaltB64,
                passphraseWrappedMKB64,
                passphraseIterations,
                passphraseKdf: kdf,
                passphraseKdfParams: kdfParams,
                // kdfTree mirrors the active vault — rewrapping the KEK never
                // changes the data-key derivation tree (that would require
                // re-encrypting all data).
                kdfTree: _v2KdfTree,
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
         *
         * Phase A: defaults to Argon2id for the recovery KEK. Pass
         * `{ kdf: 'pbkdf2-v2', kdfParams: { iterations: 600000 } }` for the
         * legacy path.
         *
         * @param {Uint8Array} recoveryBytes — 32 random bytes.
         * @param {object|number} [opts] — `{ kdf, kdfParams }` or legacy iterations.
         */
        async wrapWithRecoveryKey(recoveryBytes, opts = undefined) {
            if (!_v2MKBytes) throw new Error('CRYPTO_LOCKED: No v2 key in memory');
            if (!(recoveryBytes instanceof Uint8Array) || recoveryBytes.length !== 32) {
                throw new Error('Recovery key must be 32 bytes');
            }
            let kdf, kdfParams;
            if (typeof opts === 'number') {
                kdf = 'pbkdf2-v2';
                kdfParams = { iterations: opts };
            } else if (opts && typeof opts === 'object') {
                kdf = opts.kdf || 'argon2id-v1';
                kdfParams = opts.kdfParams || (kdf === 'argon2id-v1' ? { ...ARGON2ID_DEFAULT } : { iterations: 600000 });
            } else {
                kdf = 'argon2id-v1';
                kdfParams = { ...ARGON2ID_DEFAULT };
            }
            const recoverySaltB64 = _newSaltB64();
            const recoverySecret = _bytesToHex(recoveryBytes);
            const recoveryKek = await _deriveKEKAuto(recoverySecret, recoverySaltB64, { kdf, kdfParams });
            const recoveryWrappedMKB64 = await _wrapMK(_v2MKBytes, recoveryKek);

            const recoveryIterations = kdf === 'pbkdf2-v2'
                ? Number(kdfParams.iterations) || 600000
                : null;

            return {
                recoverySaltB64,
                recoveryWrappedMKB64,
                recoveryIterations,
                recoveryKdf: kdf,
                recoveryKdfParams: kdfParams,
            };
        },

        /**
         * Unlock the vault using a recovery key (not a passphrase). Takes the
         * recovery-side server blobs and the user-pasted display string.
         *
         * Honors `recoveryKdf` / `recoveryKdfParams` when present; legacy
         * records (no kdf field) are unwrapped with PBKDF2.
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
                const spec = {
                    kdf: serverMeta.recoveryKdf || 'pbkdf2-v2',
                    kdfParams: serverMeta.recoveryKdfParams || null,
                };
                const recoverySecret = _bytesToHex(recoveryBytes);
                const kek = await _deriveKEKAuto(
                    recoverySecret,
                    serverMeta.recoverySaltB64,
                    spec,
                    serverMeta.recoveryIterations
                );
                const mkBytes = await _unwrapMK(serverMeta.recoveryWrappedMKB64, kek);
                await _setV2MK(mkBytes, serverMeta.kdfTree || null);
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
            get v2MKBytes() { return _v2MKBytes ? new Uint8Array(_v2MKBytes) : null; },
            get v2KdfTree() { return _v2KdfTree; },
            get v1Fingerprint() { return _v1Fingerprint; },
            reset() {
                _clearV2MK();
                _v1Key = null;
                _v1Fingerprint = null;
            },
            // Encoding helpers — exposed so tests can exercise them without
            // re-implementing.
            formatRecoveryKey: _formatRecoveryKey,
            parseRecoveryKey: _parseRecoveryKey,
            // KDF + HKDF primitives — exposed for direct unit testing.
            deriveKEKArgon2id: _deriveKEKArgon2id,
            deriveKEKPbkdf2: _deriveKEKPbkdf2,
            deriveKEKAuto: _deriveKEKAuto,
            hkdfDeriveBytes: _hkdfDeriveBytes,
            HKDF_INFO,
            ARGON2ID_DEFAULT,
            ARGON2ID_TIERS,
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

// CommonJS export for Node-based tests. Browser path is unaffected — `module`
// is undefined in script tags, so the if-guard skips this entirely.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CryptoHelper, safeSave };
}
