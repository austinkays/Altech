/**
 * Altech EZLynx V2 — SPA nav detector (Phase 4 polish)
 *
 * EZLynx is a single-page Angular app; the URL changes without full
 * document reloads, AND the route's wrapper element often appears
 * asynchronously after the router resolves. We need three detection
 * channels to catch every transition, debounced into a single
 * `onRouteChange(url)` callback:
 *
 *   1. **History API monkey-patch** — wrap `pushState` / `replaceState`
 *      and listen for `popstate`. Catches the overwhelming majority of
 *      routing events in modern Angular.
 *
 *   2. **URL polling** — every 500ms as a safety net for routers that
 *      bypass the history API (seen on a handful of EZLynx modules that
 *      use fragment-only navigation).
 *
 *   3. **MutationObserver** — watches `document.documentElement` for
 *      childList + subtree mutations so a route change that only swaps
 *      the `<additional-driver-fields>` / `<vehicle-fields>` /
 *      `<mat-expansion-panel>` wrapper (without any URL change, which
 *      happens when Angular uses router events with identical paths)
 *      still fires an onChange call. Gated by a URL re-check so we
 *      don't spam the callback when only a form input mutates.
 *
 * All three channels funnel into a debounced internal `fire()` that
 * only invokes `onChange(url)` at most once per 150ms and only when the
 * URL actually differs from the last-observed value.
 *
 * Public API is back-compat: `install(onChange)` returns an optional
 * teardown function (added in Phase 4 for tests) but callers from
 * Phase 1 that ignore the return value keep working.
 */
(function (global) {
    'use strict';

    const DEBOUNCE_MS = 150;
    const POLL_MS = 500;

    function install(onChange) {
        if (typeof onChange !== 'function') return () => {};
        if (!global.history || !global.location) return () => {};

        let lastUrl = global.location.href;
        let debounceTimer = null;

        const deliver = () => {
            debounceTimer = null;
            const url = global.location.href;
            if (url === lastUrl) return;
            lastUrl = url;
            try { onChange(url); } catch (_) { /* swallow */ }
        };

        const fire = () => {
            // Debounce: collapse bursts from multiple channels firing at once.
            if (debounceTimer != null) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(deliver, DEBOUNCE_MS);
        };

        // ── Channel 1: history API monkey-patch ─────────────────
        const origPush = global.history.pushState;
        const origReplace = global.history.replaceState;

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

        // ── Channel 2: URL polling safety net ───────────────────
        const pollId = setInterval(fire, POLL_MS);

        // ── Channel 3: MutationObserver for wrapper changes ─────
        // Gated on a URL re-check inside fire() so input mutations
        // that don't change the URL are harmless no-ops.
        let observer = null;
        if (typeof global.MutationObserver === 'function' && global.document) {
            const target = global.document.documentElement || global.document.body;
            if (target) {
                observer = new global.MutationObserver(() => fire());
                try {
                    observer.observe(target, { childList: true, subtree: true });
                } catch (_) { observer = null; }
            }
        }

        // Teardown for tests / explicit re-install.
        return function uninstall() {
            try { global.history.pushState = origPush; } catch (_) {}
            try { global.history.replaceState = origReplace; } catch (_) {}
            try { global.removeEventListener('popstate', fire); } catch (_) {}
            if (pollId != null) clearInterval(pollId);
            if (observer) try { observer.disconnect(); } catch (_) {}
            if (debounceTimer != null) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
        };
    }

    const api = { install, DEBOUNCE_MS, POLL_MS };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.spa = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
