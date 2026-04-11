/**
 * Altech EZLynx V2 — Scope resolvers
 *
 * Multi-entity pages (drivers, vehicles, co-applicant, incidents) scope
 * atom lookups to a specific wrapper component so driver-1 atoms can never
 * touch driver-0 DOM by construction (§3.3 principle 4).
 *
 * Each resolver takes an index (or entityId) and returns a root Element
 * under which `find-scoped.js` will run `querySelector('#<id>')`.
 *
 * Exercised by Phase 1–3 registries. The resolver table itself has no
 * registry dependency and is safe to ship in the foundation milestone.
 */
(function (global) {
    'use strict';

    /**
     * @type {Object<string, (index: number|string) => Element|null>}
     */
    const resolvers = {
        // Drivers-compact — wrapper per driver in the order Angular renders them.
        driver(index) {
            const nodes = document.querySelectorAll('additional-driver-fields');
            return nodes[index] || null;
        },
        // Vehicles-compact — wrapper per vehicle.
        vehicle(index) {
            const nodes = document.querySelectorAll('vehicle-fields');
            return nodes[index] || null;
        },
        // Co-applicant — inline mat-expansion-panel on /details. The caller
        // must have discovered the entity id via special-cases/entity-id-discovery
        // and put it in the AltechV2.session.entityMap. The resolver just checks
        // an element with the matching suffix exists as a sanity probe.
        coApplicant(entityId) {
            const id = entityId && String(entityId);
            if (!id) return null;
            const probe = document.querySelector(`#contact-first-name-${id}`);
            return probe ? probe.closest('mat-expansion-panel') || document : null;
        },
        // Incidents — no wrapper component, unscoped (returns document).
        // Registries use route-scoped atom loading to prevent collisions
        // across incident types (accident/violation/comp-loss).
        accident() { return document; },
        violation() { return document; },
        compLoss() { return document; },
    };

    /**
     * @param {string} scopeKey      null | 'driver' | 'vehicle' | 'coApplicant' | ...
     * @param {*}      indexOrId     number for indexed scopes, string for entityId
     * @returns {Element|Document|null}
     */
    function resolveScope(scopeKey, indexOrId) {
        if (!scopeKey) return document;
        const fn = resolvers[scopeKey];
        if (!fn) return null;
        return fn(indexOrId);
    }

    const api = { resolvers, resolveScope };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.locator.scopeResolvers = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
