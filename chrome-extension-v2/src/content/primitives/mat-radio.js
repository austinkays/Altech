/**
 * Altech EZLynx V2 — mat-radio fill primitive
 *
 * Finds the mat-radio-button inside the given mat-radio-group whose label
 * text matches the target value, then clicks it.
 */
(function (global) {
    'use strict';

    const getExpand = () => {
        if (typeof module !== 'undefined' && module.exports) return require('../transforms/abbreviations').expand;
        return global.AltechV2.transforms.abbreviations.expand;
    };

    /**
     * @param {Element} groupEl   mat-radio-group element
     * @param {string}  value
     * @returns {{ok: boolean, reason?: string, picked?: string}}
     */
    function fillMatRadio(groupEl, value) {
        if (!groupEl) return { ok: false, reason: 'missing-element' };
        const target = getExpand()(value);
        if (!target) return { ok: false, reason: 'empty-value' };
        const buttons = groupEl.querySelectorAll('mat-radio-button, .mat-mdc-radio-button');
        if (!buttons || buttons.length === 0) return { ok: false, reason: 'no-radio-buttons' };

        const t = String(target).trim().toLowerCase();
        // Exact/case-insensitive by label text.
        for (const btn of buttons) {
            const label = (btn.textContent || '').trim();
            if (label.toLowerCase() === t) {
                btn.click();
                return { ok: true, picked: label };
            }
        }
        // Contains match as fallback.
        for (const btn of buttons) {
            const label = (btn.textContent || '').trim();
            if (label.toLowerCase().includes(t)) {
                btn.click();
                return { ok: true, picked: label };
            }
        }
        return { ok: false, reason: 'no-match', attempted: target };
    }

    const api = { fillMatRadio };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.primitives.matRadio = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
