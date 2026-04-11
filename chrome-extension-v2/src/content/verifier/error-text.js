/**
 * Altech EZLynx V2 — mat-error text extractor
 *
 * Every atom's verifier also reads any mat-error text near the field.
 * Server-side validation errors surface here after fill even when the
 * class-based check (ng-valid) passes, so error-text is overlayed on
 * every verification mode.
 */
(function (global) {
    'use strict';

    /**
     * Walk up from the input to its mat-form-field ancestor (if any) and
     * collect any mat-error descendants' text.
     *
     * @param {Element} el
     * @returns {string|null}  null when no error, otherwise the error text
     */
    function getErrorText(el) {
        if (!el) return null;
        let host = el;
        // Search up to 5 levels for a mat-form-field container.
        for (let i = 0; i < 5 && host; i++) {
            if (host.tagName && host.tagName.toLowerCase() === 'mat-form-field') break;
            host = host.parentElement;
        }
        const root = host || el.parentElement || document;
        const errs = root.querySelectorAll('mat-error');
        if (!errs || errs.length === 0) return null;
        const texts = [];
        errs.forEach((e) => {
            const t = (e.textContent || '').trim();
            if (t) texts.push(t);
        });
        return texts.length > 0 ? texts.join('; ') : null;
    }

    const api = { getErrorText };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.verifier = global.AltechV2.verifier || {};
        global.AltechV2.verifier.errorText = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
