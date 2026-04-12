/**
 * Altech EZLynx V2 — Carrier-specific atom extensions (Phase 5)
 *
 * Optional per-carrier atom arrays that load conditionally based on
 * both the selected carrier on the EZLynx page AND the presence of
 * matching source keys in clientData. Each atom carries a `carriers`
 * array listing which carrier tags must be active for it to load.
 * The special tag 'common' means the atom loads for ANY carrier.
 *
 * Atom ids match the EZLynx DOM element ids observed during recon:
 *   - `_common` suffix → appears for multiple carriers
 *   - `xml{STATE}` suffix → state-specific carrier config
 *   - `asi`, `allstate`, `allied`, `ml` → carrier abbreviations
 *
 * The registry loader (`registries/index.js`) calls
 * `getCarrierAtoms(routeKey, clientData, activeCarriers)` which
 * returns only the atoms whose:
 *   1. `carriers` set intersects `activeCarriers`
 *   2. `source` key has a non-empty value in `clientData`
 *
 * All carrier atoms carry `_carrierExtension: true` so the Registry
 * Audit can distinguish them from core atoms and report them as
 * "⏭ Conditionally skipped" when the owning carrier isn't selected.
 *
 * Field id reference (from plan §13 Phase 5):
 *   coverage_paperless_common, packagexmlKY, hail_allstatexmlKS,
 *   prior_liabilityasiMI, paidinfullasixmlny,
 *   coverage_accreditedbuilder_common, booktransfer,
 *   animalpremises_ml, allied_coolingyear,
 *   dwelling_hailresistantroof_common, residencewalls
 */
(function (global) {
    'use strict';

    // ── Home Policy Info carrier atoms ──────────────────────────────────
    const HOME_POLICY_INFO_CARRIER_ATOMS = [
        {
            key: 'booktransfer',
            idTemplate: 'booktransfer',
            label: 'Book Transfer',
            source: 'BookTransfer',
            type: 'mat-toggle',
            carriers: ['common'],
            _carrierExtension: true,
        },
        {
            key: 'prior_liabilityasiMI',
            idTemplate: 'prior_liabilityasiMI',
            label: 'Prior Liability Limit (ASI MI)',
            source: 'PriorLiabilityLimit',
            type: 'mat-select',
            carriers: ['asi'],
            _carrierExtension: true,
        },
        {
            key: 'paidinfullasixmlny',
            idTemplate: 'paidinfullasixmlny',
            label: 'Paid in Full Discount (ASI NY)',
            source: 'PaidInFull',
            type: 'mat-toggle',
            carriers: ['asi'],
            _carrierExtension: true,
        },
        {
            key: 'animalpremises_ml',
            idTemplate: 'animalpremises_ml',
            label: 'Animal on Premises (ML)',
            source: 'AnimalOnPremises',
            type: 'mat-toggle',
            carriers: ['ml'],
            _carrierExtension: true,
        },
    ];

    // ── Home Dwelling Info carrier atoms ────────────────────────────────
    const HOME_DWELLING_INFO_CARRIER_ATOMS = [
        {
            key: 'dwelling_hailresistantroof_common',
            idTemplate: 'dwelling_hailresistantroof_common',
            label: 'Hail Resistant Roof',
            source: 'HailResistantRoof',
            type: 'mat-toggle',
            carriers: ['common'],
            _carrierExtension: true,
        },
        {
            key: 'residencewalls',
            idTemplate: 'residencewalls',
            label: 'Residence Walls',
            source: 'ResidenceWalls',
            type: 'mat-select',
            carriers: ['common'],
            _carrierExtension: true,
        },
        {
            key: 'hail_allstatexmlKS',
            idTemplate: 'hail_allstatexmlKS',
            label: 'Hail Deductible (Allstate KS)',
            source: 'HailDeductible',
            type: 'mat-select',
            carriers: ['allstate'],
            _carrierExtension: true,
        },
        {
            key: 'allied_coolingyear',
            idTemplate: 'allied_coolingyear',
            label: 'Year Cooling Updated (Allied)',
            source: 'YearCoolingUpdated',
            type: 'number',
            carriers: ['allied'],
            _carrierExtension: true,
        },
    ];

    // ── Home Coverage carrier atoms ────────────────────────────────────
    const HOME_COVERAGE_CARRIER_ATOMS = [
        {
            key: 'coverage_paperless_common',
            idTemplate: 'coverage_paperless_common',
            label: 'Paperless Delivery',
            source: 'Paperless',
            type: 'mat-toggle',
            carriers: ['common'],
            _carrierExtension: true,
        },
        {
            key: 'coverage_accreditedbuilder_common',
            idTemplate: 'coverage_accreditedbuilder_common',
            label: 'Accredited Builder',
            source: 'AccreditedBuilder',
            type: 'mat-toggle',
            carriers: ['common'],
            _carrierExtension: true,
        },
        {
            key: 'packagexmlKY',
            idTemplate: 'packagexmlKY',
            label: 'Package (KY carriers)',
            source: 'PackageKY',
            type: 'mat-toggle',
            carriers: ['common'],
            _carrierExtension: true,
        },
    ];

    /**
     * All carrier extension atoms indexed by route key.
     * @type {Object<string, Array>}
     */
    const CARRIER_ATOMS_BY_ROUTE = {
        'home-policy-info':   HOME_POLICY_INFO_CARRIER_ATOMS,
        'home-dwelling-info': HOME_DWELLING_INFO_CARRIER_ATOMS,
        'home-coverage':      HOME_COVERAGE_CARRIER_ATOMS,
    };

    /**
     * Return the flat list of all carrier extension atoms for a route
     * that match the active carriers AND have a non-empty source value
     * in clientData. Atoms that don't match are excluded entirely from
     * the atom list the orchestrator sees.
     *
     * @param {string}      routeKey        Route key from router.
     * @param {object}      [clientData]    Client data object.
     * @param {Set<string>} [activeCarriers] Set from detectActiveCarriers().
     * @returns {Array}     Matching carrier atoms (shallow copies).
     */
    function getCarrierAtoms(routeKey, clientData, activeCarriers) {
        const pool = CARRIER_ATOMS_BY_ROUTE[routeKey];
        if (!pool || pool.length === 0) return [];

        const carriers = activeCarriers || new Set(['common']);
        const out = [];

        for (const atom of pool) {
            // Check carrier match: at least one of the atom's carriers
            // must be in the active set.
            const carrierMatch = Array.isArray(atom.carriers)
                && atom.carriers.some((c) => carriers.has(c));
            if (!carrierMatch) continue;

            // Check source presence: clientData must have a non-empty
            // value for the atom's source key.
            if (!clientData) continue;
            const val = clientData[atom.source];
            if (val == null || val === '') continue;

            out.push(Object.assign({}, atom));
        }

        return out;
    }

    /**
     * Return ALL carrier extension atoms for a route, regardless of
     * carrier match or clientData presence. Used by the Registry Audit
     * to classify atoms as CARRIER_SKIPPED.
     *
     * @param {string} routeKey
     * @returns {Array}
     */
    function getAllCarrierAtoms(routeKey) {
        return (CARRIER_ATOMS_BY_ROUTE[routeKey] || []).slice();
    }

    /**
     * Return the set of route keys that have carrier extensions.
     * @returns {Array<string>}
     */
    function getCarrierRoutes() {
        return Object.keys(CARRIER_ATOMS_BY_ROUTE);
    }

    const api = {
        getCarrierAtoms,
        getAllCarrierAtoms,
        getCarrierRoutes,
        CARRIER_ATOMS_BY_ROUTE,
        // Per-route exports for direct test access
        HOME_POLICY_INFO_CARRIER_ATOMS,
        HOME_DWELLING_INFO_CARRIER_ATOMS,
        HOME_COVERAGE_CARRIER_ATOMS,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        Object.assign(global.AltechV2.registries, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
