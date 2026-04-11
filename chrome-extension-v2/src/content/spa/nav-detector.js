/**
 * Altech EZLynx V2 — SPA nav detector
 *
 * EZLynx is a single-page Angular app; the URL changes without full
 * document reloads. We need to re-run route detection and refresh the
 * toolbar whenever the SPA navigates. Strategy:
 *
 *   1. Monkey-patch history.pushState / replaceState to emit a custom
 *      `altech-v2:routechange` event.
 *   2. Listen to `popstate` for back/forward.
 *   3. Fallback URL polling every 500ms in case a framework bypasses
 *      pushState (rare, but seen on some Angular modules).
 */
(function (global) {
    'use strict';

    function install(onChange) {
        if (!global.history || typeof onChange !== 'function') return;
        const origPush = global.history.pushState;
        const origReplace = global.history.replaceState;
        let lastUrl = global.location.href;

        function fire() {
            const url = global.location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                try { onChange(url); } catch (_) { /* swallow */ }
            }
        }

        global.history.pushState = function () {
            const r = origPush.apply(this, arguments);
            fire();
            return r;
        };
        global.history.replaceState = function () {
            const r = origReplace.apply(this, arguments);
            fire();
            return r;
        };
        global.addEventListener('popstate', fire);

        // Polling fallback.
        setInterval(fire, 500);
    }

    const api = { install };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.spa = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
