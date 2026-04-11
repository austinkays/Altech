/**
 * Altech EZLynx V2 — Number fill primitive
 *
 * Coerces raw input to a numeric string then delegates to the text primitive.
 * Preserves negatives but strips anything else that isn't a digit or decimal.
 */
(function (global) {
    'use strict';

    const getText = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./text').fillText;
        return global.AltechV2.primitives.text.fillText;
    };

    function fillNumber(el, value) {
        const raw = value == null ? '' : String(value).trim();
        if (!raw) return getText()(el, '');
        // Allow a single leading minus.
        const sign = raw.charAt(0) === '-' ? '-' : '';
        const cleaned = raw.replace(/[^\d.]/g, '');
        // Keep only the first decimal point.
        const firstDot = cleaned.indexOf('.');
        const normalized = firstDot === -1
            ? cleaned
            : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
        return getText()(el, sign + normalized);
    }

    const api = { fillNumber };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.primitives.number = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
