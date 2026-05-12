// biometric-unlock.js — WebAuthn PRF-based vault unlock.
//
// Lets the user replace passphrase entry with Touch ID / Face ID / Windows
// Hello / a hardware key (YubiKey 5+, etc) for routine vault unlocks. The
// passphrase is still required for the very first setup and as a permanent
// fallback (recovery key works too).
//
// How it works (PRF — Pseudo-Random Function — extension):
//
//   1. The vault has been unlocked the normal way (passphrase or recovery
//      key). The 32-byte master key (MK) is in memory inside CryptoHelper.
//
//   2. We call navigator.credentials.create() with extensions.prf.eval.first
//      = a per-credential salt we generated. The browser asks the OS for a
//      platform authenticator (or external key), the user does their
//      biometric / PIN, and we get back a credential id PLUS a 32-byte PRF
//      output that's deterministic for that (credential, salt) pair forever.
//
//   3. We HKDF the PRF output into an AES-GCM key (the "biometric KEK"),
//      use it to wrap MK, and stash {credentialId, prfSalt, wrappedMK,
//      kdfTree, label, createdAt} in localStorage. The wrapped MK alone is
//      useless without the matching authenticator — even a full localStorage
//      dump can't decrypt it.
//
//   4. On unlock, we call navigator.credentials.get() with the same prf.eval
//      salt and an allowList of stored credential ids. The user does the
//      biometric, the browser returns the same PRF output, we re-derive the
//      KEK, unwrap MK, and call CryptoHelper.installMK(mkBytes).
//
// Storage is local-only (per-device) by design: WebAuthn credentials live on
// the authenticator, so a credential registered on a Mac can't unlock from a
// Windows PC. Users add a passkey on each device they want to unlock from.

'use strict';

(function () {
    if (window.BiometricUnlock) return;

    const STORAGE_KEY = window.STORAGE_KEYS && window.STORAGE_KEYS.BIOMETRIC_CREDENTIALS;
    const PRF_INFO    = 'altech.biometric.kek.v1';   // HKDF info string
    const RP_NAME     = 'Altech';
    // RP id is the eTLD+1 of the page. Browsers default to location.hostname
    // for the RP id when omitted; the credential is then bound to that
    // origin. Letting the browser default keeps localhost / vercel preview
    // domains working without per-environment config.

    function isAvailable() {
        if (typeof window === 'undefined') return false;
        if (!window.PublicKeyCredential) return false;
        if (!window.crypto || !window.crypto.subtle) return false;
        return true;
    }

    // ─── Storage ──────────────────────────────────────────────────────────
    function _list() {
        if (!STORAGE_KEY) return [];
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    }
    function _save(list) {
        if (!STORAGE_KEY) return;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (_) {}
    }

    function listCredentials() {
        // Public copy without wrapped MK — for UI display.
        return _list().map(c => ({
            credentialId: c.credentialId,
            label: c.label,
            createdAt: c.createdAt,
        }));
    }

    function hasAny() {
        return _list().length > 0;
    }

    function removeCredential(credentialId) {
        const list = _list().filter(c => c.credentialId !== credentialId);
        _save(list);
    }

    // ─── Encoding helpers ─────────────────────────────────────────────────
    function _b64ToBytes(b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function _bytesToB64(bytes) {
        let s = '';
        const b = new Uint8Array(bytes);
        for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return btoa(s);
    }

    // ─── Crypto: HKDF, wrap, unwrap ───────────────────────────────────────
    async function _kekFromPRF(prfBytes) {
        // PRF output is 32 bytes of high-entropy material. HKDF-SHA256 it
        // into an AES-GCM key. The info string isolates this purpose so the
        // same PRF output can't be misused as another role's key.
        const ikm = await crypto.subtle.importKey(
            'raw', prfBytes, { name: 'HKDF' }, false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(PRF_INFO) },
            ikm,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function _wrapMK(mkBytes, kek) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, mkBytes);
        const combined = new Uint8Array(iv.length + ct.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ct), iv.length);
        return _bytesToB64(combined);
    }

    async function _unwrapMK(wrappedB64, kek) {
        const combined = _b64ToBytes(wrappedB64);
        const iv = combined.slice(0, 12);
        const ct = combined.slice(12);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ct);
        return new Uint8Array(pt);
    }

    // ─── Register a passkey ───────────────────────────────────────────────
    //
    // Vault must already be unlocked (passphrase or recovery key) — we wrap
    // the *currently-unlocked* MK under the new PRF KEK.
    //
    // Returns { ok: true, credentialId } or { ok: false, reason }.
    async function register(label) {
        if (!isAvailable()) return { ok: false, reason: 'WebAuthn not supported in this browser' };
        if (!window.CryptoHelper || !window.CryptoHelper.isV2Unlocked()) {
            return { ok: false, reason: 'Unlock the vault first (enter your passphrase) — biometric needs the master key in memory to wrap.' };
        }
        const mk = window.CryptoHelper.getUnlockedMK();
        if (!mk) return { ok: false, reason: 'Vault is locked.' };

        // User identifier — the passkey is bound to a (rp, user) pair. Use
        // the Auth uid when available, falling back to a stable per-device id.
        const userId = _userId();
        const userName = _userName();
        const prfSalt = crypto.getRandomValues(new Uint8Array(32));
        const challenge = crypto.getRandomValues(new Uint8Array(32));

        let credential;
        try {
            credential = await navigator.credentials.create({
                publicKey: {
                    rp: { name: RP_NAME },
                    user: {
                        id: userId,
                        name: userName,
                        displayName: userName,
                    },
                    challenge,
                    pubKeyCredParams: [
                        { type: 'public-key', alg: -7   }, // ES256 (most platform authenticators)
                        { type: 'public-key', alg: -257 }, // RS256
                    ],
                    authenticatorSelection: {
                        // Prefer platform (Touch ID / Face ID / Windows Hello)
                        // but fall back to roaming (USB key) if user picks one.
                        // Discoverable means the credential is resident on the
                        // authenticator so we can list it without storing the
                        // raw id elsewhere.
                        residentKey: 'preferred',
                        userVerification: 'required',
                    },
                    timeout: 60000,
                    extensions: { prf: { eval: { first: prfSalt } } },
                },
            });
        } catch (err) {
            mk.fill(0);
            return { ok: false, reason: _explainError(err) };
        }
        if (!credential) { mk.fill(0); return { ok: false, reason: 'No credential returned by browser.' }; }

        const ext = credential.getClientExtensionResults && credential.getClientExtensionResults();
        const prfResults = ext && ext.prf && ext.prf.results;
        if (!prfResults || !prfResults.first) {
            // Credential created but no PRF output — authenticator/browser
            // doesn't support PRF. We can't wrap MK without it, so abandon
            // and tell the user to use a different authenticator.
            mk.fill(0);
            return { ok: false, reason: 'This authenticator does not support the PRF extension. Try a different one (Touch ID, Face ID, Windows Hello, or a YubiKey 5+).' };
        }

        try {
            const kek = await _kekFromPRF(new Uint8Array(prfResults.first));
            const wrappedMK = await _wrapMK(mk, kek);
            const entry = {
                credentialId: _bytesToB64(new Uint8Array(credential.rawId)),
                prfSaltB64:   _bytesToB64(prfSalt),
                wrappedMKB64: wrappedMK,
                kdfTree:      window.CryptoHelper.getKdfTree() || null,
                label:        (label || _defaultLabel()).slice(0, 80),
                createdAt:    new Date().toISOString(),
            };
            const list = _list();
            // Replace any existing entry with the same credentialId
            const filtered = list.filter(c => c.credentialId !== entry.credentialId);
            filtered.push(entry);
            _save(filtered);
            mk.fill(0);
            return { ok: true, credentialId: entry.credentialId, label: entry.label };
        } catch (err) {
            mk.fill(0);
            return { ok: false, reason: 'Failed to store wrapped key: ' + (err && err.message || err) };
        }
    }

    // ─── Unlock with a passkey ────────────────────────────────────────────
    //
    // Tries each registered credential's prf salt. The browser's allowList
    // limits which authenticators can respond. If multiple credentials are
    // registered for the same device, the user picks one in the OS prompt.
    //
    // Returns { ok: true } on success, { ok: false, reason } on failure.
    async function unlock() {
        if (!isAvailable()) return { ok: false, reason: 'WebAuthn not supported in this browser' };
        const list = _list();
        if (!list.length) return { ok: false, reason: 'No biometric credentials registered on this device.' };

        const allowCredentials = list.map(c => ({
            type: 'public-key',
            id: _b64ToBytes(c.credentialId),
        }));
        // We can only eval ONE prf salt per assertion, so we send the most
        // recently registered credential's salt. The OS picker will show all
        // matching credentials; whichever the user picks, the browser uses
        // ITS salt (per-credential PRF eval matches by credential id).
        // If the user picks a different credential than the one whose salt we
        // sent, the unwrap will fail — we then retry once with the right salt.
        let lastError = null;
        for (let attempt = 0; attempt < list.length; attempt++) {
            const candidate = list[attempt];
            try {
                const challenge = crypto.getRandomValues(new Uint8Array(32));
                const assertion = await navigator.credentials.get({
                    publicKey: {
                        challenge,
                        allowCredentials,
                        userVerification: 'required',
                        timeout: 60000,
                        extensions: { prf: { eval: { first: _b64ToBytes(candidate.prfSaltB64) } } },
                    },
                });
                if (!assertion) { lastError = 'No assertion returned.'; continue; }
                const ext = assertion.getClientExtensionResults && assertion.getClientExtensionResults();
                const prfResults = ext && ext.prf && ext.prf.results;
                if (!prfResults || !prfResults.first) {
                    lastError = 'Authenticator did not return PRF output.';
                    continue;
                }
                // Match the credential the user selected back to a stored entry
                const usedId = _bytesToB64(new Uint8Array(assertion.rawId));
                const entry = list.find(c => c.credentialId === usedId);
                if (!entry) { lastError = 'Selected credential is not registered.'; continue; }
                // The salt we evaluated against may not match the picked entry.
                // If we sent the WRONG salt, the PRF output won't unwrap that
                // entry's MK. Retry the assertion with the correct salt.
                if (entry.credentialId !== candidate.credentialId) {
                    // Re-prompt with the right salt (no-op user-experience: just
                    // a brief re-prompt; happens only when multi-credential and
                    // user picks a non-default).
                    const challenge2 = crypto.getRandomValues(new Uint8Array(32));
                    const reAssert = await navigator.credentials.get({
                        publicKey: {
                            challenge: challenge2,
                            allowCredentials: [{ type: 'public-key', id: assertion.rawId }],
                            userVerification: 'required',
                            timeout: 60000,
                            extensions: { prf: { eval: { first: _b64ToBytes(entry.prfSaltB64) } } },
                        },
                    });
                    const ext2 = reAssert && reAssert.getClientExtensionResults && reAssert.getClientExtensionResults();
                    const prf2 = ext2 && ext2.prf && ext2.prf.results;
                    if (!prf2 || !prf2.first) { lastError = 'Re-prompt PRF missing.'; continue; }
                    const kek = await _kekFromPRF(new Uint8Array(prf2.first));
                    const mk = await _unwrapMK(entry.wrappedMKB64, kek);
                    await window.CryptoHelper.installMK(mk, entry.kdfTree);
                    mk.fill(0);
                    return { ok: true, credentialId: entry.credentialId };
                }
                const kek = await _kekFromPRF(new Uint8Array(prfResults.first));
                const mk = await _unwrapMK(entry.wrappedMKB64, kek);
                await window.CryptoHelper.installMK(mk, entry.kdfTree);
                mk.fill(0);
                return { ok: true, credentialId: entry.credentialId };
            } catch (err) {
                lastError = _explainError(err);
                // User-cancelled or NotAllowedError — stop trying, surface clearly.
                if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) break;
            }
        }
        return { ok: false, reason: lastError || 'Biometric unlock failed.' };
    }

    // ─── Helpers ──────────────────────────────────────────────────────────
    function _userId() {
        // 16 random bytes derived from the Auth uid (or a stable per-device id).
        // The user id only needs to be stable per-vault — not globally unique.
        let seed = '';
        if (window.Auth && window.Auth.user && window.Auth.user.uid) seed = window.Auth.user.uid;
        else if (window.STORAGE_KEYS && window.STORAGE_KEYS.DEVICE_ID) {
            try { seed = localStorage.getItem(window.STORAGE_KEYS.DEVICE_ID) || ''; } catch (_) {}
        }
        if (!seed) seed = 'altech-anon';
        // Hash seed → 16 bytes. Use a synchronous simple hash (FNV-1a 128-bit
        // approximation via two passes) so we don't make this an async function.
        // Spec-wise the user id is opaque to the authenticator anyway.
        return _seedToBytes(seed, 16);
    }
    function _userName() {
        if (window.Auth && window.Auth.user && window.Auth.user.email) return window.Auth.user.email;
        return 'Altech vault';
    }
    function _seedToBytes(seed, n) {
        // Simple deterministic byte generator from a string. NOT a crypto hash
        // — only used for the WebAuthn user id which is opaque. (The actual
        // crypto strength is in the PRF output.)
        const out = new Uint8Array(n);
        let h1 = 0x811c9dc5 >>> 0, h2 = 0x84222325 >>> 0;
        for (let i = 0; i < seed.length; i++) {
            h1 ^= seed.charCodeAt(i);
            h1 = (h1 * 0x01000193) >>> 0;
            h2 ^= (seed.charCodeAt(i) + i) & 0xff;
            h2 = (h2 * 0x05bd1e95) >>> 0;
        }
        for (let i = 0; i < n; i++) {
            out[i] = ((i & 1 ? h2 : h1) >>> ((i & 3) * 8)) & 0xff;
            h1 = ((h1 * 0x01000193) ^ i) >>> 0;
            h2 = ((h2 * 0x05bd1e95) ^ (i + 1)) >>> 0;
        }
        return out;
    }
    function _defaultLabel() {
        const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
        if (/iPhone|iPad/i.test(ua))   return 'Face ID / Touch ID (iOS)';
        if (/Macintosh/i.test(ua))     return 'Touch ID (Mac)';
        if (/Windows/i.test(ua))       return 'Windows Hello';
        if (/Android/i.test(ua))       return 'Android biometric';
        if (/Linux/i.test(ua))         return 'Security key (Linux)';
        return 'Passkey';
    }
    function _explainError(err) {
        if (!err) return 'Unknown error.';
        const name = err.name || '';
        const msg  = err.message || String(err);
        if (name === 'NotAllowedError') return 'Cancelled or timed out.';
        if (name === 'InvalidStateError') return 'This authenticator is already registered.';
        if (name === 'NotSupportedError') return 'This authenticator type is not supported.';
        if (name === 'SecurityError')   return 'Security error — must be served over HTTPS (or localhost).';
        if (name === 'AbortError')      return 'Request aborted.';
        return msg;
    }

    window.BiometricUnlock = {
        isAvailable,
        hasAny,
        listCredentials,
        register,
        unlock,
        removeCredential,
        // Test hooks
        _internals: { _wrapMK, _unwrapMK, _kekFromPRF, _bytesToB64, _b64ToBytes },
    };
})();
