/**
 * Altech EZLynx V2 — CDK overlay dismissal
 *
 * Clears any stuck Angular Material CDK overlay (mat-select panels,
 * autocomplete, etc.) before opening a new one.
 *
 * Mirrors v1's dismissOverlay() strategy:
 *   1. Click the CDK backdrop if present
 *   2. Dispatch Escape keydown (CDK's keyboard handler)
 *   3. Brief wait for Angular to tear down the overlay
 *
 * Called by the mat-select primitive before every fill and after any
 * fill failure, preventing cascade failures where a stuck overlay
 * blocks all subsequent dropdown fills.
 */
(function (global) {
    'use strict';

    /**
     * Dismiss any open CDK overlay panel.
     *
     * Safe to call when no overlay is open — no-ops gracefully.
     * @param {number} [waitMs=150]  ms to wait after each step
     * @returns {Promise<boolean>}   true if an overlay was found and dismissed
     */
    async function dismissOverlay(waitMs) {
        const delay = typeof waitMs === 'number' ? waitMs : 150;
        let found = false;

        // 1. Click the backdrop if present (Angular CDK creates a sibling
        //    backdrop element alongside each overlay pane)
        const backdrop = document.querySelector('.cdk-overlay-backdrop');
        if (backdrop) {
            backdrop.click();
            found = true;
            await new Promise((r) => setTimeout(r, delay));
        }

        // 2. Dispatch Escape on the document — CDK's global keyboard
        //    handler catches this and closes the topmost overlay
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27,
            bubbles: true, cancelable: true,
        }));
        await new Promise((r) => setTimeout(r, delay));

        // 3. Check if any overlay content remains and clean up
        const remaining = document.querySelector(
            '.cdk-overlay-container .mat-mdc-option, ' +
            '.cdk-overlay-container .mat-option'
        );
        if (remaining) {
            // Force-click Escape once more — some EZLynx panels need it
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape', code: 'Escape', keyCode: 27,
                bubbles: true, cancelable: true,
            }));
            await new Promise((r) => setTimeout(r, delay));
            found = true;
        }

        return found;
    }

    const api = { dismissOverlay };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.specialCases = global.AltechV2.specialCases || {};
        global.AltechV2.specialCases.dismissOverlay = dismissOverlay;
    }
})(typeof window !== 'undefined' ? window : globalThis);
