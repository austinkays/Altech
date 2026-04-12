/**
 * Altech EZLynx V2 — Route definitions
 *
 * URL pattern → route key table. Registries are keyed by route key, so
 * adding a new route means adding one entry here and one file in
 * `src/content/registries/`. Foundation milestone ships every route key
 * the plan mentions so the router is ready, but all registries are empty.
 */
(function (global) {
    'use strict';

    /** @type {Array<{key: string, pattern: RegExp, cascadeTestable?: boolean}>} */
    const ROUTE_DEFINITIONS = [
        { key: 'applicant-details',   pattern: /\/account\/create\/personal(?:[?#/]|$)|\/details(?:[?#/]|$)/ },
        { key: 'drivers-compact',     pattern: /\/rating\/auto\/[^/]+\/drivers-compact/ },
        { key: 'vehicles-compact',    pattern: /\/rating\/auto\/[^/]+\/vehicles-compact/ },
        { key: 'incidents',           pattern: /\/rating\/auto\/[^/]+\/incidents/ },
        { key: 'auto-policy-info',    pattern: /\/rating\/auto\/[^/]+\/policy-info/ },
        { key: 'auto-coverage',       pattern: /\/rating\/auto\/[^/]+\/coverage/ },
        { key: 'home-policy-info',    pattern: /\/rating\/home\/[^/]+\/policy-info/,  cascadeTestable: true },
        { key: 'home-dwelling-info',  pattern: /\/rating\/home\/[^/]+\/dwelling-info/, cascadeTestable: true },
        { key: 'home-coverage',       pattern: /\/rating\/home\/[^/]+\/coverage/ },
    ];

    const api = { ROUTE_DEFINITIONS };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.routes = global.AltechV2.routes || {};
        global.AltechV2.routes.definitions = ROUTE_DEFINITIONS;
    }
})(typeof window !== 'undefined' ? window : globalThis);
