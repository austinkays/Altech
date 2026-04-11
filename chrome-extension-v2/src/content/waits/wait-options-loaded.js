/**
 * Altech EZLynx V2 — wait for mat-mdc-option elements
 *
 * After clicking a mat-select trigger, Angular lazily renders the option
 * list into the CDK overlay. This predicate waits for the overlay panel
 * to have at least one `.mat-mdc-option` child.
 */
(function (global) {
    'use strict';

    const getPoll = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./poll-predicate').pollPredicate;
        return global.AltechV2.waits.pollPredicate;
    };

    /**
     * @returns {Promise<NodeListOf<Element>|null>} list of mat-mdc-option
     */
    async function waitOptionsLoaded(opts) {
        const pollPredicate = getPoll();
        const res = await pollPredicate(
            () => {
                const nodes = document.querySelectorAll('.cdk-overlay-container .mat-mdc-option');
                return nodes && nodes.length > 0 ? nodes : null;
            },
            { timeoutMs: (opts && opts.timeoutMs) || 5000 }
        );
        return res.ok ? res.value : null;
    }

    const api = { waitOptionsLoaded };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.waits.waitOptionsLoaded = waitOptionsLoaded;
    }
})(typeof window !== 'undefined' ? window : globalThis);
