/**
 * Altech EZLynx V2 — Registry index (FOUNDATION STUB)
 *
 * In foundation milestone, every route resolves to an empty atom list.
 * The orchestrator still runs end-to-end and the toolbar reports
 * "no registry for this route — pending Phase 1" so we can verify the
 * entire plumbing without shipping any registries.
 *
 * Phase 1 will replace this with imports of the per-route registries
 * (applicant, co-applicant, drivers, vehicles, incidents, home-*).
 */
(function (global) {
    'use strict';

    /** @type {Object<string, Array>} */
    const REGISTRIES = {
        'applicant-details':  [],
        'drivers-compact':    [],
        'vehicles-compact':   [],
        'incidents':          [],
        'auto-coverage':      [],
        'home-policy-info':   [],
        'home-dwelling-info': [],
        'home-coverage':      [],
    };

    function getRegistry(routeKey) {
        if (!routeKey) return [];
        return REGISTRIES[routeKey] || [];
    }

    /**
     * For Phase 2 registries that iterate entities (drivers, vehicles,
     * incidents), the orchestrator calls this to expand a per-entity
     * template into concrete atoms. Foundation milestone always returns [].
     */
    function getEntityCount(routeKey, clientData) {
        if (!clientData) return 0;
        if (routeKey === 'drivers-compact') return Array.isArray(clientData.Drivers) ? clientData.Drivers.length : 0;
        if (routeKey === 'vehicles-compact') return Array.isArray(clientData.Vehicles) ? clientData.Vehicles.length : 0;
        if (routeKey === 'incidents') return Array.isArray(clientData.Incidents) ? clientData.Incidents.length : 0;
        return 0;
    }

    const api = { REGISTRIES, getRegistry, getEntityCount };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
