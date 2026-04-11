/**
 * Altech EZLynx V2 — Currency strip
 *
 * Strips $, commas, and whitespace from a currency value so the raw digits
 * can be inserted via execCommand. EZLynx auto-reformats to $X,XXX on blur.
 *
 * Also used by the deductible mat-select transform: clientData may carry
 * "$1,000" but the mat-option text is literally "1000", so normalize both
 * sides to compare.
 */
(function (global) {
    'use strict';

    /**
     * Strip currency formatting to a raw number-like string.
     *   "$1,234.56" → "1234.56"
     *   1234        → "1234"
     *   null/""     → ""
     * Preserves the decimal point and any minus sign.
     */
    function strip(raw) {
        if (raw == null) return '';
        const s = String(raw).trim();
        if (!s) return '';
        // Keep leading -, digits, and decimal point only
        const cleaned = s.replace(/[^\d.\-]/g, '');
        // Guard against "1.2.3" — keep first decimal
        const firstDot = cleaned.indexOf('.');
        if (firstDot === -1) return cleaned;
        return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }

    /**
     * Integer variant — no decimal preserved. For deductible matching where
     * the mat-option text is an integer like "1000".
     */
    function stripInt(raw) {
        const s = strip(raw);
        if (!s) return '';
        const n = Math.trunc(Number(s));
        if (!Number.isFinite(n)) return '';
        return String(n);
    }

    const api = { strip, stripInt };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.transforms = global.AltechV2.transforms || {};
        global.AltechV2.transforms.currencyStrip = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
