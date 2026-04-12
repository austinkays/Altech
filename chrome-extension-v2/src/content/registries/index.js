/**
 * Altech EZLynx V2 — Registry loader
 *
 * Maps route keys → atom arrays. The orchestrator calls getRegistry(routeKey,
 * clientData) to fetch atoms for the current page before running.
 *
 * Phase 1 ships:
 *   applicant-details → applicant atoms (45) + co-applicant atoms (16, conditional)
 *
 * Phase 2 adds the three auto-rating multi-entity routes. Drivers and
 * vehicles expand a single base registry once per `clientData.Drivers[i]`
 * / `clientData.Vehicles[i]`; incidents route each `clientData.Incidents[i]`
 * entry to one of three sub-registries (accident / violation / compLoss)
 * by its `Type` field, with a per-type local index counter so legacy
 * ids like `Amount-{N}` don't collide across sub-types.
 *
 * Phase 5 adds carrier-specific atom extensions for home routes. After
 * building the base atom list, the loader appends matching carrier atoms
 * from `carrier-extensions.js` based on active carriers and clientData.
 *
 * Auto policy-info and auto coverage are flat registries tagged
 * `_needsRecon: true` — IDs are best-guess from EZLynx naming
 * conventions and need validation via Registry Audit on a live page.
 *
 * All expansion happens before topo-sort so the orchestrator sees a flat
 * atom list with globally-unique keys. See `./_expand.js` for the
 * key-rewriting helper.
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

    const getDriverAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./drivers').driverAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.driverAtoms) || [];
    };

    const getVehicleAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./vehicles').vehicleAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.vehicleAtoms) || [];
    };

    const getIncidentRegistries = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./incidents');
        }
        return {
            accidentAtoms:  (global.AltechV2.registries && global.AltechV2.registries.accidentAtoms)  || [],
            violationAtoms: (global.AltechV2.registries && global.AltechV2.registries.violationAtoms) || [],
            compLossAtoms:  (global.AltechV2.registries && global.AltechV2.registries.compLossAtoms)  || [],
        };
    };

    const getExpandEntityAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./_expand').expandEntityAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.expandEntityAtoms);
    };

    // ── Phase 5 — carrier-specific extensions
    const getCarrierExtensions = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./carrier-extensions');
        }
        return (global.AltechV2.registries) || {};
    };
    const getCarrierDetection = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('../special-cases/carrier-detection');
        }
        return (global.AltechV2.specialCases && global.AltechV2.specialCases.carrierDetection) || {};
    };

    // ── Auto policy-info + auto coverage (flat, single-entity, _needsRecon)
    const getAutoPolicyInfoAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./auto-policy-info').autoPolicyInfoAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.autoPolicyInfoAtoms) || [];
    };
    const getAutoCoverageAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./auto-coverage').autoCoverageAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.autoCoverageAtoms) || [];
    };

    // ── Phase 3 — home rating (flat registries, no multi-entity expansion)
    const getHomePolicyInfoBuilder = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./home-policy-info').buildHomePolicyInfoAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.buildHomePolicyInfoAtoms);
    };
    const getHomeDwellingInfoAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./home-dwelling-info').homeDwellingInfoAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.homeDwellingInfoAtoms) || [];
    };
    const getHomeCoverageAtoms = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./home-coverage').homeCoverageAtoms;
        }
        return (global.AltechV2.registries && global.AltechV2.registries.homeCoverageAtoms) || [];
    };

    // Normalize the incident Type field to one of the three sub-type keys.
    // Duplicated from special-cases/add-entity.js.normalizeIncidentType to
    // avoid a cross-directory require dependency (special-cases also loads
    // special-cases/add-entity at a different point in the manifest).
    function normalizeIncidentType(raw) {
        if (!raw) return null;
        const s = String(raw).toLowerCase().replace(/[\s_-]/g, '');
        if (s.startsWith('acc')) return 'accident';
        if (s.startsWith('vio')) return 'violation';
        if (s.startsWith('comp')) return 'compLoss';
        return null;
    }

    /**
     * Return the atom array for a given route.
     *
     * @param {string} routeKey    From router.detectRoute()
     * @param {object} [clientData] Optional — used to conditionally include
     *                              co-applicant atoms and drive multi-entity
     *                              expansion for auto rating routes.
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

            // ── Phase 2 — auto rating ──────────────────────────────────────
            case 'drivers-compact': {
                const expand = getExpandEntityAtoms();
                const base = getDriverAtoms();
                const drivers = (clientData && Array.isArray(clientData.Drivers)) ? clientData.Drivers : [];
                if (!expand || base.length === 0 || drivers.length === 0) return [];
                const out = [];
                for (let i = 0; i < drivers.length; i++) {
                    out.push(...expand(base, 'driver', 'd', i, drivers[i]));
                }
                return out;
            }

            case 'vehicles-compact': {
                const expand = getExpandEntityAtoms();
                const base = getVehicleAtoms();
                const vehicles = (clientData && Array.isArray(clientData.Vehicles)) ? clientData.Vehicles : [];
                if (!expand || base.length === 0 || vehicles.length === 0) return [];
                const out = [];
                for (let i = 0; i < vehicles.length; i++) {
                    out.push(...expand(base, 'vehicle', 'v', i, vehicles[i]));
                }
                return out;
            }

            case 'incidents': {
                const expand = getExpandEntityAtoms();
                const { accidentAtoms, violationAtoms, compLossAtoms } = getIncidentRegistries();
                const incidents = (clientData && Array.isArray(clientData.Incidents)) ? clientData.Incidents : [];
                if (!expand || incidents.length === 0) return [];

                const subMap = {
                    accident:  { atoms: accidentAtoms,  scope: 'accident',  prefix: 'acc' },
                    violation: { atoms: violationAtoms, scope: 'violation', prefix: 'vio' },
                    compLoss:  { atoms: compLossAtoms,  scope: 'compLoss',  prefix: 'cl'  },
                };
                const counters = { accident: 0, violation: 0, compLoss: 0 };

                const out = [];
                for (const entry of incidents) {
                    const sub = normalizeIncidentType(entry && entry.Type);
                    if (!sub || !subMap[sub]) continue;
                    const sr = subMap[sub];
                    const localIndex = counters[sub]++;
                    out.push(...expand(sr.atoms, sr.scope, sr.prefix, localIndex, entry));
                }
                return out;
            }

            case 'auto-policy-info':
                return getAutoPolicyInfoAtoms().slice();

            case 'auto-coverage':
                return getAutoCoverageAtoms().slice();

            // ── Phase 3 — home rating (flat registries) ────────────────────
            // Phase 5: carrier-specific atoms appended after base atoms.
            case 'home-policy-info': {
                const build = getHomePolicyInfoBuilder();
                if (typeof build !== 'function') return [];
                const atoms = build(clientData);
                atoms.push(..._appendCarrierAtoms('home-policy-info', clientData));
                return atoms;
            }

            case 'home-dwelling-info': {
                const atoms = getHomeDwellingInfoAtoms().slice();
                atoms.push(..._appendCarrierAtoms('home-dwelling-info', clientData));
                return atoms;
            }

            case 'home-coverage': {
                const atoms = getHomeCoverageAtoms().slice();
                atoms.push(..._appendCarrierAtoms('home-coverage', clientData));
                return atoms;
            }

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

    /**
     * Detect active carriers and return matching carrier-specific atoms
     * for the given route. Internal helper used by the home route cases.
     *
     * @param {string} routeKey
     * @param {object} [clientData]
     * @returns {Array}
     */
    function _appendCarrierAtoms(routeKey, clientData) {
        const ext = getCarrierExtensions();
        if (typeof ext.getCarrierAtoms !== 'function') return [];
        const det = getCarrierDetection();
        const activeCarriers = (typeof det.detectActiveCarriers === 'function')
            ? det.detectActiveCarriers()
            : new Set(['common']);
        return ext.getCarrierAtoms(routeKey, clientData, activeCarriers);
    }

    const api = { getRegistry, getEntityCount, normalizeIncidentType };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        Object.assign(global.AltechV2.registries, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
