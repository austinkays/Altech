/**
 * Altech EZLynx V2 — Phone normalization
 *
 * EZLynx phone inputs carry their own mask; we feed raw digits and let the
 * mask handle formatting. This transform just reduces any input shape
 * ("(702) 555-1234", "702.555.1234", "+1 702 555 1234") to its 10-digit form
 * and drops any leading country code 1.
 */
(function (global) {
    'use strict';

    /**
     * Normalize a phone string to 10 raw digits.
     * If the result is not exactly 10 digits, returns whatever digits were
     * extracted — the atom verifier will surface the mismatch.
     */
    function normalize(raw) {
        if (raw == null) return '';
        const digits = String(raw).replace(/\D+/g, '');
        if (!digits) return '';
        // Drop leading 1 country code if present and we have 11 digits
        if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
        return digits;
    }

    const api = { normalize };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.transforms = global.AltechV2.transforms || {};
        global.AltechV2.transforms.phoneFormat = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
