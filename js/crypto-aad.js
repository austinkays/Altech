// CryptoAAD — centralized Additional Authenticated Data builder.
//
// AES-GCM lets us bind extra "associated data" into the auth tag without
// encrypting it. We use this to bind each ciphertext to its row identity:
// (table, row id, user id, envelope version). A compromised or curious
// server then cannot move a ciphertext from row A to row B, or relabel one
// user's blob as another user's, without the decrypt-side auth tag failing.
//
// AAD construction MUST be identical between encrypt and decrypt or the
// ciphertext won't open. To avoid drift, this module is the SINGLE source
// of truth: every call site that needs AAD imports buildAAD() from here.
// A CI lint (scripts/lint-aad.mjs) fails the build if any other file
// passes a literal `additionalData:` to crypto.subtle.encrypt/.decrypt —
// new call sites must go through CryptoHelper.encryptWithAAD / .decryptWithAAD.
//
// Encoding: length-prefixed UTF-8 segments, with a fixed "altech" magic
// string and a 4-byte big-endian envelope version up front. Each part is
// preceded by its byte length as a 4-byte big-endian uint32 so two parts
// like ("ab","c") and ("a","bc") produce different AAD bytes.
//
//   altech | envelopeVersion | table | rowId | userId
//
// Envelope versions:
//   1 = legacy (no AAD on ciphertext — what every existing v2 record uses).
//       Phase B ciphertexts will carry envelope byte 0x01 and skip AAD.
//   2 = AAD-bound. Phase B writes carry envelope byte 0x02 and bind AAD per
//       this function's output.

'use strict';

(function () {
    const ENVELOPE = Object.freeze({
        V1_LEGACY: 1, // existing on-disk records — no AAD
        V2_AAD:    2, // Phase B+ — AAD bound to (table, rowId, userId)
    });

    const MAGIC = 'altech';

    function _utf8(s) { return new TextEncoder().encode(String(s)); }

    function _lenPrefixed(bytes) {
        const out = new Uint8Array(4 + bytes.length);
        new DataView(out.buffer).setUint32(0, bytes.length, false); // big-endian
        out.set(bytes, 4);
        return out;
    }

    /**
     * Build the AAD bytes for a given row.
     *
     * @param {object} input
     * @param {string} input.table             — logical table name (e.g., 'user_quotes')
     * @param {string|number} input.rowId      — primary identifier within the table
     * @param {string} input.userId            — owning auth.uid (Supabase) or Firebase uid
     * @param {number} [input.envelopeVersion] — defaults to V2_AAD; pass V1_LEGACY only for round-trip tests
     * @returns {Uint8Array}
     */
    function buildAAD(input) {
        if (!input || typeof input !== 'object') {
            throw new Error('CryptoAAD.buildAAD: input object required');
        }
        const { table, rowId, userId } = input;
        const envelopeVersion = (typeof input.envelopeVersion === 'number')
            ? input.envelopeVersion
            : ENVELOPE.V2_AAD;

        if (!table || typeof table !== 'string') {
            throw new Error('CryptoAAD.buildAAD: table (string) required');
        }
        if (rowId === null || rowId === undefined || rowId === '') {
            throw new Error('CryptoAAD.buildAAD: rowId required');
        }
        if (!userId || typeof userId !== 'string') {
            throw new Error('CryptoAAD.buildAAD: userId (string) required');
        }
        if (envelopeVersion < 1 || envelopeVersion > 0xff) {
            throw new Error('CryptoAAD.buildAAD: envelopeVersion out of range (1..255)');
        }

        const versionBytes = new Uint8Array(4);
        new DataView(versionBytes.buffer).setUint32(0, envelopeVersion, false);

        const parts = [
            _lenPrefixed(_utf8(MAGIC)),
            _lenPrefixed(versionBytes),
            _lenPrefixed(_utf8(table)),
            _lenPrefixed(_utf8(String(rowId))),
            _lenPrefixed(_utf8(userId)),
        ];

        const total = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { out.set(p, off); off += p.length; }
        return out;
    }

    const api = Object.freeze({ ENVELOPE, buildAAD });

    if (typeof window !== 'undefined') window.CryptoAAD = api;
    if (typeof globalThis !== 'undefined') globalThis.CryptoAAD = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = { CryptoAAD: api };
})();
