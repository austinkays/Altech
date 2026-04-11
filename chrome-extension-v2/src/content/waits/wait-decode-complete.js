/**
 * Altech EZLynx V2 — wait for VIN decode to populate Year field
 *
 * Only used by the vehicles registry (Phase 2). Shipped up front because
 * it's a pure polling helper — no registry dependency. The VIN atom's
 * postFill action clicks #vin-lookup-btn-{N}, then waits on this predicate
 * until the #selected-year-{N} trigger has text — at which point the
 * dependent atoms with `skipIfAlreadyFilled: true` can run.
 */
(function (global) {
    'use strict';

    const getPoll = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./poll-predicate').pollPredicate;
        return global.AltechV2.waits.pollPredicate;
    };

    /**
     * @param {number|string} index   Vehicle index in vehicle-fields[N]
     * @param {object}        [opts]
     */
    async function waitDecodeComplete(index, opts) {
        const pollPredicate = getPoll();
        const yearSel = `#selected-year-${index}`;
        const res = await pollPredicate(
            () => {
                const el = document.querySelector(yearSel);
                if (!el) return false;
                const text = (el.textContent || el.value || '').trim();
                return text.length > 0 ? text : false;
            },
            { timeoutMs: (opts && opts.timeoutMs) || 10000 }
        );
        return res.ok ? res.value : null;
    }

    const api = { waitDecodeComplete };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.waits.waitDecodeComplete = waitDecodeComplete;
    }
})(typeof window !== 'undefined' ? window : globalThis);
