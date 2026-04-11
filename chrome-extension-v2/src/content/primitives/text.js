/**
 * Altech EZLynx V2 — Text fill primitive (THE CROWN JEWEL)
 *
 * This is the single most important function in the V2 extension. The entire
 * architecture rests on `document.execCommand('insertText')` reaching
 * Angular's ControlValueAccessor natively so the FormControl updates and
 * `ng-valid` transitions. Session 4A-micro of the recon proved this works;
 * every other text-family primitive (date, number, currency, phone, ssn)
 * delegates to this after running its per-type valueTransform.
 *
 * DO NOT replace with `el.value = value; el.dispatchEvent('input')` — that
 * is the exact v0.7.2 failure mode this extension exists to fix.
 */
(function (global) {
    'use strict';

    /**
     * Fill a text-family <input> or <textarea> by simulating a paste via
     * execCommand. Produces the same FormControl transitions as real typing.
     *
     * @param {HTMLInputElement|HTMLTextAreaElement} el
     * @param {string} value   Already-transformed string (caller's valueTransform already applied)
     * @returns {{ok: boolean, reason?: string}}
     */
    function fillText(el, value) {
        if (!el) return { ok: false, reason: 'missing-element' };
        if (el.disabled) return { ok: false, reason: 'disabled' };
        if (el.readOnly) return { ok: false, reason: 'readonly' };

        const str = value == null ? '' : String(value);

        try {
            // Focus first — the element must be the active element for
            // execCommand to target it.
            el.focus();
            // Select existing value so 'delete' wipes it.
            if (typeof el.select === 'function') {
                el.select();
            } else if (typeof el.setSelectionRange === 'function') {
                el.setSelectionRange(0, (el.value || '').length);
            }
            // Delete whatever is selected — reaches FormControl as an edit.
            try { document.execCommand('delete', false); } catch (_) { /* ok to fail */ }
            // Re-focus in case `select` blurred it in some browsers.
            el.focus();
            // The money line.
            const ok = document.execCommand('insertText', false, str);
            if (!ok) {
                // Fallback: some contexts (e.g. jsdom) don't implement execCommand.
                // The test setup polyfills it; in a real browser this branch is
                // defensive-only and should never fire.
                if (typeof el.value !== 'undefined') {
                    el.value = str;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
            // Blur to commit any onBlur handlers (EZLynx uses these for
            // currency reformat).
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: 'exception', error: e && e.message };
        }
    }

    const api = { fillText };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.primitives = global.AltechV2.primitives || {};
        global.AltechV2.primitives.text = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
