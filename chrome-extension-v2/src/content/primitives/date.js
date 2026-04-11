/**
 * Altech EZLynx V2 — Date fill primitive
 *
 * EZLynx uses mat-datepicker inputs that accept MM/DD/YYYY text. We delegate
 * to the text primitive after normalizing the input to MM/DD/YYYY.
 *
 * §15 open question 1: on a *non-LexisNexis-locked* DOB the execCommand
 * strategy should produce ng-valid. If Phase 1 validation discovers it
 * doesn't, this is the single file to swap for a character-by-character
 * keyboard-event strategy.
 */
(function (global) {
    'use strict';

    const getText = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./text').fillText;
        return global.AltechV2.primitives.text.fillText;
    };

    /**
     * Accepts:
     *   Date                          → MM/DD/YYYY
     *   "YYYY-MM-DD"                  → MM/DD/YYYY
     *   "MM/DD/YYYY" or "M/D/YYYY"    → zero-padded MM/DD/YYYY
     *   anything else                 → returned as-is and let EZLynx fail
     *                                   verification (surfaces a real bug)
     */
    function normalize(raw) {
        if (raw == null || raw === '') return '';
        if (raw instanceof Date && !isNaN(raw.getTime())) {
            return String(raw.getMonth() + 1).padStart(2, '0') + '/' +
                   String(raw.getDate()).padStart(2, '0') + '/' +
                   raw.getFullYear();
        }
        const s = String(raw).trim();
        const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
        if (iso) {
            return String(iso[2]).padStart(2, '0') + '/' +
                   String(iso[3]).padStart(2, '0') + '/' +
                   iso[1];
        }
        const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
        if (us) {
            const yr = us[3].length === 2 ? '20' + us[3] : us[3];
            return String(us[1]).padStart(2, '0') + '/' +
                   String(us[2]).padStart(2, '0') + '/' +
                   yr;
        }
        return s;
    }

    function fillDate(el, value) {
        return getText()(el, normalize(value));
    }

    const api = { fillDate, normalize };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.primitives.date = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
