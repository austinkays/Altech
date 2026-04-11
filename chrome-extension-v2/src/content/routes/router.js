/**
 * Altech EZLynx V2 — Router
 *
 * URL → route key lookup. Used by the content-script entrypoint to pick
 * which registry the orchestrator runs. Returns `unknown` if no pattern
 * matches — the toolbar reports "route not mapped" in that case.
 */
(function (global) {
    'use strict';

    const getDefs = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./route-definitions').ROUTE_DEFINITIONS;
        return global.AltechV2.routes.definitions;
    };

    function detectRoute(url) {
        if (!url) return 'unknown';
        const defs = getDefs();
        for (const def of defs) {
            if (def.pattern.test(url)) return def.key;
        }
        return 'unknown';
    }

    function getRouteDefinition(routeKey) {
        const defs = getDefs();
        return defs.find((d) => d.key === routeKey) || null;
    }

    const api = { detectRoute, getRouteDefinition };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.routes.detectRoute = detectRoute;
        global.AltechV2.routes.getRouteDefinition = getRouteDefinition;
    }
})(typeof window !== 'undefined' ? window : globalThis);
