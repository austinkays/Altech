/**
 * Altech EZLynx V2 — Registry loader
 *
 * Maps route keys → atom arrays. The orchestrator calls getRegistry(routeKey,
 * clientData) to fetch atoms for the current page before running.
 *
 * Phase 1 ships:
 *   applicant-details → applicant atoms (45) + co-applicant atoms (16, conditional)
 *
 * All other routes return [] until their phase is built. The orchestrator
 * reports "no registry for this route" to the toolbar, which is the correct
 * UX — the user sees the stub message instead of a silent failure.
 */
(function (global) {
    'use strict';

    const getApplicantAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./applicant').applicantAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.applicantAtoms) || [];
    };

    const getCoApplicantAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./co-applicant').coApplicantAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.coApplicantAtoms) || [];
    };

    /**
     * Return the atom array for a given route.
     *
     * @param {string} routeKey    From router.detectRoute()
     * @param {object} [clientData] Optional — used to conditionally include
     *                              co-applicant atoms when CoApplicant is present.
     * @returns {Array}
     */
    function getRegistry(routeKey, clientData) {
        if (!routeKey) return [];

        switch (routeKey) {
            case 'applicant-details': {
                const atoms = getApplicantAtoms().slice(); // shallow copy
                if (clientData && clientData.CoApplicant) {
                    atoms.push(...getCoApplicantAtoms());
                }
                return atoms;
            }

            // Phase 2 — pending
            case 'drivers-compact':
            case 'vehicles-compact':
            case 'incidents':
            case 'auto-coverage':
                return [];

            // Phase 3 — pending
            case 'home-policy-info':
            case 'home-dwelling-info':
            case 'home-coverage':
                return [];

            default:
                return [];
        }
    }

    /**
     * For multi-entity routes, returns how many entities to iterate over.
     * Used by Phase 2+ registries — returns 0 for all Phase 1 routes.
     *
     * @param {string} routeKey
     * @param {object} [clientData]
     * @returns {number}
     */
    function getEntityCount(routeKey, clientData) {
        if (!clientData) return 0;
        if (routeKey === 'drivers-compact')  return Array.isArray(clientData.Drivers)   ? clientData.Drivers.length   : 0;
        if (routeKey === 'vehicles-compact') return Array.isArray(clientData.Vehicles)  ? clientData.Vehicles.length  : 0;
        if (routeKey === 'incidents')        return Array.isArray(clientData.Incidents) ? clientData.Incidents.length : 0;
        return 0;
    }

    const api = { getRegistry, getEntityCount };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        Object.assign(global.AltechV2.registries, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
