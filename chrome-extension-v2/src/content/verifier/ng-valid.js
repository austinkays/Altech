/**
 * Altech EZLynx V2 — ng-valid / ng-invalid class-based verification
 *
 * Angular's ControlValueAccessor directives add `ng-valid` to an input
 * once its FormControl validates. The V2 fill strategy (execCommand
 * insertText) is designed so this class transitions naturally — if it
 * doesn't, the fill didn't actually reach the FormControl and must be
 * retried.
 */
(function (global) {
    'use strict';

    const getErrorText = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./error-text').getErrorText;
        return global.AltechV2.verifier.errorText.getErrorText;
    };

    /**
     * @param {Element} el
     * @returns {{ok: boolean, reason?: string, errorText?: string|null}}
     */
    function verifyNgValid(el) {
        if (!el) return { ok: false, reason: 'missing-element' };
        const cls = el.classList;
        if (!cls) return { ok: false, reason: 'no-classList' };

        // Mandatory overlay — server-side error takes precedence over class state.
        const err = getErrorText()(el);
        if (err) return { ok: false, reason: 'mat-error', errorText: err };

        if (cls.contains('ng-invalid')) return { ok: false, reason: 'ng-invalid' };
        if (!cls.contains('ng-valid')) return { ok: false, reason: 'not-ng-valid' };
        return { ok: true, errorText: null };
    }

    const api = { verifyNgValid };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.verifier.ngValid = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
