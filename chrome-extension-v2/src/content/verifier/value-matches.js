/**
 * Altech EZLynx V2 — value-matches verification
 *
 * For masked inputs (phone, SSN) ng-valid is ambiguous because the mask
 * adds characters that may make the element look valid independent of
 * what was inserted. This verifier reads back the DOM `.value` after
 * stripping the mask and compares to the expected transformed value.
 */
(function (global) {
    'use strict';

    const getErrorText = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./error-text').getErrorText;
        return global.AltechV2.verifier.errorText.getErrorText;
    };

    /**
     * @param {Element} el
     * @param {string}  expected   Post-transform expected value
     * @param {(raw: string) => string} [normalize]  optional reader normalization
     * @returns {{ok: boolean, reason?: string, errorText?: string|null, actual?: string}}
     */
    function verifyValueMatches(el, expected, normalize) {
        if (!el) return { ok: false, reason: 'missing-element' };
        const err = getErrorText()(el);
        if (err) return { ok: false, reason: 'mat-error', errorText: err };
        const raw = el.value != null ? String(el.value) : '';
        const actual = typeof normalize === 'function' ? normalize(raw) : raw;
        const exp = expected == null ? '' : String(expected);
        if (actual === exp) return { ok: true, actual };
        return { ok: false, reason: 'value-mismatch', actual };
    }

    const api = { verifyValueMatches };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.verifier.valueMatches = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
