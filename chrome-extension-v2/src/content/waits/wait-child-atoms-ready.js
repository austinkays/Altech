/**
 * Altech EZLynx V2 — wait for dynamically revealed child elements
 *
 * When a toggle (Pool / Dog / Trampoline / Mortgagee) goes ON, sub-fields
 * are newly added to the DOM (not hidden-then-shown). Parent atoms
 * `postFill` a `waitForChildAtomsReady` action that polls here until the
 * given child element ids exist, at which point the child atoms can leave
 * their BLOCKED state.
 *
 * Only exercised by Phase 3 home registries but shipped now as a pure
 * polling helper with no registry dependency.
 */
(function (global) {
    'use strict';

    const getPoll = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./poll-predicate').pollPredicate;
        return global.AltechV2.waits.pollPredicate;
    };

    /**
     * @param {string[]} ids   Element ids that must all exist
     * @param {object}   [opts]
     */
    async function waitChildAtomsReady(ids, opts) {
        if (!Array.isArray(ids) || ids.length === 0) return true;
        const pollPredicate = getPoll();
        const res = await pollPredicate(
            () => ids.every((id) => document.getElementById(id) != null),
            { timeoutMs: (opts && opts.timeoutMs) || 3000 }
        );
        return res.ok;
    }

    const api = { waitChildAtomsReady };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.waits.waitChildAtomsReady = waitChildAtomsReady;
    }
})(typeof window !== 'undefined' ? window : globalThis);
