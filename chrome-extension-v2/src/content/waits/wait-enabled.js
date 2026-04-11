/**
 * Altech EZLynx V2 — wait for element to become enabled
 *
 * EZLynx/Angular commonly gates one field on another (e.g. Occupation stays
 * disabled until Industry selected). This predicate waits for `el.disabled`
 * to flip to false.
 */
(function (global) {
    'use strict';

    const getPoll = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./poll-predicate').pollPredicate;
        return global.AltechV2.waits.pollPredicate;
    };

    async function waitEnabled(el, opts) {
        if (!el) return false;
        const pollPredicate = getPoll();
        const res = await pollPredicate(
            () => el.disabled === false,
            { timeoutMs: (opts && opts.timeoutMs) || 5000 }
        );
        return res.ok;
    }

    const api = { waitEnabled };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.waits.waitEnabled = waitEnabled;
    }
})(typeof window !== 'undefined' ? window : globalThis);
