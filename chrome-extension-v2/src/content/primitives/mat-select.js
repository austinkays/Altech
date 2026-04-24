/**
 * Altech EZLynx V2 — mat-select fill primitive
 *
 * Angular Material mat-select doesn't use a native <select>. Filling it
 * means clicking the trigger, waiting for the CDK overlay to populate
 * `.mat-mdc-option` elements, picking the best-matching option, and
 * clicking it. The orchestrator guarantees only one overlay is open at
 * a time, so no nukeOverlays / CDK collision cleanup is needed.
 *
 * Matching priority (per plan §4.3):
 *   1. Exact match (after abbreviation + valueTransform)
 *   2. Case-insensitive exact
 *   3. Dice similarity ≥ 0.7 (stricter than v1's 0.4)
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                waitOptionsLoaded: require('../waits/wait-options-loaded').waitOptionsLoaded,
                pollPredicate: require('../waits/poll-predicate').pollPredicate,
                bestMatch: require('../locator/dice-similarity').bestMatch,
                expand: require('../transforms/abbreviations').expand,
                dismissOverlay: require('../special-cases/dismiss-overlay').dismissOverlay,
            };
        }
        return {
            waitOptionsLoaded: global.AltechV2.waits.waitOptionsLoaded,
            pollPredicate: global.AltechV2.waits.pollPredicate,
            bestMatch: global.AltechV2.locator.dice.bestMatch,
            expand: global.AltechV2.transforms.abbreviations.expand,
            dismissOverlay: global.AltechV2.specialCases && global.AltechV2.specialCases.dismissOverlay,
        };
    };

    /**
     * Pure matching function — exposed for testing.
     * Returns the index of the best option, or -1.
     */
    function pickOption(target, optionTexts, opts) {
        const { expand, bestMatch } = getDeps();
        const expandedTarget = (opts && opts.skipAbbrev) ? target : expand(target);
        const needle = String(expandedTarget || '').trim();
        if (!needle || !Array.isArray(optionTexts) || optionTexts.length === 0) return -1;

        // 1. exact
        for (let i = 0; i < optionTexts.length; i++) {
            if (String(optionTexts[i]).trim() === needle) return i;
        }
        // 2. case-insensitive exact
        const lneedle = needle.toLowerCase();
        for (let i = 0; i < optionTexts.length; i++) {
            if (String(optionTexts[i]).trim().toLowerCase() === lneedle) return i;
        }
        // 3. Dice ≥ 0.7
        const match = bestMatch(needle, optionTexts.map((t) => String(t).trim()), 0.7);
        return match ? match.index : -1;
    }

    /**
     * Fill a mat-select by clicking the trigger and picking an option.
     *
     * @param {Element} triggerEl   The <mat-select> element OR a child containing
     *                              a `.mat-mdc-select-trigger`.
     * @param {string}  value       The target option label (before abbreviation).
     * @param {object}  [opts]
     * @returns {Promise<{ok: boolean, reason?: string, pickedText?: string}>}
     */
    async function fillMatSelect(triggerEl, value, opts) {
        if (!triggerEl) return { ok: false, reason: 'missing-element' };
        const { waitOptionsLoaded, pollPredicate, dismissOverlay } = getDeps();

        // Defensive: dismiss any stuck overlay from a previous fill before
        // opening this dropdown. Mirrors v1's dismissOverlay() call that
        // prevented cascade failures across sequential dropdown fills.
        if (typeof dismissOverlay === 'function') {
            await dismissOverlay();
        }

        // Find the clickable trigger. If the host is the <mat-select>, click
        // it; otherwise look for a descendant trigger.
        const trigger = triggerEl.querySelector('.mat-mdc-select-trigger') || triggerEl;
        // Use a full MouseEvent so Angular CDK's overlay handler recognizes it
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

        const opts_ = opts || {};
        const options = await waitOptionsLoaded({ timeoutMs: opts_.timeoutMs });
        if (!options || options.length === 0) {
            // Close the overlay so the next atom doesn't run with it stuck open
            if (typeof dismissOverlay === 'function') await dismissOverlay();
            return { ok: false, reason: 'no-options' };
        }

        const optionTexts = Array.from(options).map((o) => (o.textContent || '').trim());
        const idx = pickOption(value, optionTexts, opts_);
        if (idx < 0) {
            // Close the overlay so the next atom doesn't cascade-fail
            if (typeof dismissOverlay === 'function') await dismissOverlay();
            return { ok: false, reason: 'no-match', attempted: value, available: optionTexts };
        }

        options[idx].click();

        // Brief wait for Angular to commit the value selection. We DON'T
        // poll for the overlay to close here — on EZLynx pages CDK can
        // leave the panel mounted for several hundred ms even after a
        // successful click, and the next atom's dismissOverlay() will
        // clear any straggler. The previous 2-second poll was the largest
        // single contributor to per-dropdown latency.
        await pollPredicate(
            () => {
                // Look for selected-option marker on the picked node.
                const opt = options[idx];
                return opt && (
                    opt.classList.contains('mdc-list-item--selected') ||
                    opt.classList.contains('mat-mdc-option-active') ||
                    opt.getAttribute('aria-selected') === 'true'
                );
            },
            { timeoutMs: 200, intervalMs: 25 }
        );
        return { ok: true, pickedText: optionTexts[idx] };
    }

    const api = { fillMatSelect, pickOption };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.primitives.matSelect = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
