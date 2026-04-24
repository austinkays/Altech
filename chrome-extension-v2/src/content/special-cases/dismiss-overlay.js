/**
 * Altech EZLynx V2 — CDK overlay dismissal
 *
 * Clears any stuck Angular Material CDK overlay (mat-select panels,
 * autocomplete, etc.) before opening a new one.
 *
 * Strategy:
 *   0. Early-exit if no overlay/backdrop is present (saves the per-atom
 *      idle wait that used to fire ~20× on the contact page).
 *   1. Click every CDK backdrop (not just the first — overlays can stack).
 *   2. Dispatch Escape keydown so CDK's global handler closes the topmost.
 *   3. If options are still rendered, force-detach the overlay panes — last
 *      resort for pages where backdrop-click + Escape don't actually close
 *      the panel (observed on the EZLynx contact page where stale dropdowns
 *      pile up visually as the orchestrator advances).
 */
(function (global) {
    'use strict';

    const OVERLAY_OPTION_SEL =
        '.cdk-overlay-container .mat-mdc-option, ' +
        '.cdk-overlay-container .mat-option';

    function hasOpenOverlay() {
        return !!(
            document.querySelector('.cdk-overlay-backdrop') ||
            document.querySelector(OVERLAY_OPTION_SEL)
        );
    }

    /**
     * Dismiss any open CDK overlay panel.
     *
     * Safe to call when no overlay is open — returns immediately without
     * sleeping. When overlays exist, escalates from polite (backdrop +
     * Escape) to aggressive (force-detach the .cdk-overlay-pane nodes).
     *
     * @param {number} [waitMs=80]  ms between escalation steps
     * @returns {Promise<boolean>}  true if an overlay was found and dismissed
     */
    async function dismissOverlay(waitMs) {
        // Fast path — no overlay anywhere, no work to do.
        if (!hasOpenOverlay()) return false;

        const delay = typeof waitMs === 'number' ? waitMs : 80;

        // 1. Click EVERY backdrop. Stacked overlays each have their own.
        const backdrops = document.querySelectorAll('.cdk-overlay-backdrop');
        backdrops.forEach((b) => { try { b.click(); } catch (_) { /* ignore */ } });
        if (backdrops.length > 0) {
            await new Promise((r) => setTimeout(r, delay));
        }

        // 2. Dispatch Escape — CDK's global keyboard handler closes the topmost.
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27,
            bubbles: true, cancelable: true,
        }));
        await new Promise((r) => setTimeout(r, delay));

        // 3. If anything is still open, force-detach the overlay panes.
        //    This is the escape hatch for pages that intercept Escape /
        //    suppress backdrop clicks (the symptom that produced the
        //    "all dropdowns open at once" screenshot). Removing the pane
        //    nodes leaves Angular's internal state slightly off, but the
        //    next mat-select fill will re-create its own overlay cleanly.
        if (document.querySelector(OVERLAY_OPTION_SEL)) {
            const panes = document.querySelectorAll('.cdk-overlay-pane');
            panes.forEach((p) => { try { p.remove(); } catch (_) { /* ignore */ } });
            const stragglers = document.querySelectorAll('.cdk-overlay-backdrop');
            stragglers.forEach((b) => { try { b.remove(); } catch (_) { /* ignore */ } });
        }

        return true;
    }

    const api = { dismissOverlay, hasOpenOverlay };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.specialCases = global.AltechV2.specialCases || {};
        global.AltechV2.specialCases.dismissOverlay = dismissOverlay;
        global.AltechV2.specialCases.hasOpenOverlay = hasOpenOverlay;
    }
})(typeof window !== 'undefined' ? window : globalThis);
