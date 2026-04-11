/**
 * Altech EZLynx V2 — mat-toggle fill primitive
 *
 * Click-if-state-differs. Reads the current `.mat-mdc-slide-toggle-checked`
 * class and only clicks when the target state doesn't match. This is
 * idempotent (re-running a fill on a partially-filled page won't flip
 * toggles back off).
 */
(function (global) {
    'use strict';

    function coerce(val) {
        if (typeof val === 'boolean') return val;
        if (val == null) return false;
        const s = String(val).trim().toLowerCase();
        return s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'on';
    }

    /**
     * @param {Element} el          The mat-slide-toggle root, OR any element
     *                              inside it (we walk up to find the toggle).
     * @param {boolean|string|number} value  Target state (truthy → checked)
     * @returns {{ok: boolean, reason?: string, changed?: boolean}}
     */
    function fillMatToggle(el, value) {
        if (!el) return { ok: false, reason: 'missing-element' };
        let host = el;
        for (let i = 0; i < 5 && host; i++) {
            if (host.classList && host.classList.contains('mat-mdc-slide-toggle')) break;
            host = host.parentElement;
        }
        const toggle = host || el;
        const currentlyChecked = toggle.classList && toggle.classList.contains('mat-mdc-slide-toggle-checked');
        const target = coerce(value);
        if (currentlyChecked === target) {
            return { ok: true, changed: false };
        }
        // The clickable inner button is usually a <button role="switch">.
        const clickTarget = toggle.querySelector('button[role="switch"]') || toggle;
        clickTarget.click();
        return { ok: true, changed: true };
    }

    const api = { fillMatToggle, coerce };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.primitives.matToggle = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
