/**
 * Altech EZLynx V2 — wait for element
 *
 * Resolves when a CSS selector matches something in the DOM.
 * Used by the atom executor's LOCATE state (3s timeout by default).
 */
(function (global) {
    'use strict';

    const getPoll = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./poll-predicate').pollPredicate;
        return global.AltechV2.waits.pollPredicate;
    };

    /**
     * @param {string} selector  CSS selector
     * @param {object} [opts]    { root?, timeoutMs?, intervalMs? }
     */
    async function waitElement(selector, opts) {
        const root = (opts && opts.root) || document;
        const pollPredicate = getPoll();
        const res = await pollPredicate(
            () => root.querySelector(selector),
            { timeoutMs: (opts && opts.timeoutMs) || 3000, intervalMs: (opts && opts.intervalMs) || 50 }
        );
        return res.ok ? res.value : null;
    }

    const api = { waitElement };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.waits.waitElement = waitElement;
    }
})(typeof window !== 'undefined' ? window : globalThis);
