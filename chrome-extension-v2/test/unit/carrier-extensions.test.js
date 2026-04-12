/**
 * Altech EZLynx V2 — Carrier-extensions registry tests (Phase 5)
 */
'use strict';

const {
    getCarrierAtoms,
    getAllCarrierAtoms,
    getCarrierRoutes,
    CARRIER_ATOMS_BY_ROUTE,
    HOME_POLICY_INFO_CARRIER_ATOMS,
    HOME_DWELLING_INFO_CARRIER_ATOMS,
    HOME_COVERAGE_CARRIER_ATOMS,
} = require('../../src/content/registries/carrier-extensions');

describe('carrier extension atom structure', () => {
    test('all atoms have required fields', () => {
        for (const [route, atoms] of Object.entries(CARRIER_ATOMS_BY_ROUTE)) {
            for (const atom of atoms) {
                expect(atom).toHaveProperty('key');
                expect(atom).toHaveProperty('idTemplate');
                expect(atom).toHaveProperty('label');
                expect(atom).toHaveProperty('source');
                expect(atom).toHaveProperty('type');
                expect(atom).toHaveProperty('carriers');
                expect(atom._carrierExtension).toBe(true);
                expect(Array.isArray(atom.carriers)).toBe(true);
                expect(atom.carriers.length).toBeGreaterThan(0);
            }
        }
    });

    test('all atom keys are unique across all routes', () => {
        const allKeys = [];
        for (const atoms of Object.values(CARRIER_ATOMS_BY_ROUTE)) {
            allKeys.push(...atoms.map((a) => a.key));
        }
        expect(new Set(allKeys).size).toBe(allKeys.length);
    });

    test('home-policy-info has 4 carrier atoms', () => {
        expect(HOME_POLICY_INFO_CARRIER_ATOMS).toHaveLength(4);
    });

    test('home-dwelling-info has 4 carrier atoms', () => {
        expect(HOME_DWELLING_INFO_CARRIER_ATOMS).toHaveLength(4);
    });

    test('home-coverage has 3 carrier atoms', () => {
        expect(HOME_COVERAGE_CARRIER_ATOMS).toHaveLength(3);
    });

    test('total carrier atoms across all routes is 11', () => {
        const total = Object.values(CARRIER_ATOMS_BY_ROUTE)
            .reduce((sum, arr) => sum + arr.length, 0);
        expect(total).toBe(11);
    });
});

describe('carrier atom id coverage (plan §13 Phase 5)', () => {
    const allIds = Object.values(CARRIER_ATOMS_BY_ROUTE)
        .flat()
        .map((a) => a.idTemplate);

    const EXPECTED_IDS = [
        'coverage_paperless_common',
        'packagexmlKY',
        'hail_allstatexmlKS',
        'prior_liabilityasiMI',
        'paidinfullasixmlny',
        'coverage_accreditedbuilder_common',
        'booktransfer',
        'animalpremises_ml',
        'allied_coolingyear',
        'dwelling_hailresistantroof_common',
        'residencewalls',
    ];

    for (const id of EXPECTED_IDS) {
        test(`includes ${id}`, () => {
            expect(allIds).toContain(id);
        });
    }
});

describe('getCarrierAtoms — carrier filtering', () => {
    test('returns common atoms when common is in active set and clientData matches', () => {
        const active = new Set(['common']);
        const clientData = { BookTransfer: 'Yes' };
        const atoms = getCarrierAtoms('home-policy-info', clientData, active);
        expect(atoms.some((a) => a.key === 'booktransfer')).toBe(true);
    });

    test('excludes carrier-specific atoms when carrier not active', () => {
        const active = new Set(['common']);
        const clientData = { PriorLiabilityLimit: '100000', PaidInFull: 'Yes' };
        const atoms = getCarrierAtoms('home-policy-info', clientData, active);
        expect(atoms.some((a) => a.key === 'prior_liabilityasiMI')).toBe(false);
        expect(atoms.some((a) => a.key === 'paidinfullasixmlny')).toBe(false);
    });

    test('includes carrier-specific atoms when carrier is active', () => {
        const active = new Set(['common', 'asi']);
        const clientData = { PriorLiabilityLimit: '100000', PaidInFull: 'Yes' };
        const atoms = getCarrierAtoms('home-policy-info', clientData, active);
        expect(atoms.some((a) => a.key === 'prior_liabilityasiMI')).toBe(true);
        expect(atoms.some((a) => a.key === 'paidinfullasixmlny')).toBe(true);
    });

    test('includes Allstate dwelling atoms when allstate is active', () => {
        const active = new Set(['common', 'allstate']);
        const clientData = { HailDeductible: '1000' };
        const atoms = getCarrierAtoms('home-dwelling-info', clientData, active);
        expect(atoms.some((a) => a.key === 'hail_allstatexmlKS')).toBe(true);
    });

    test('includes Allied dwelling atoms when allied is active', () => {
        const active = new Set(['common', 'allied']);
        const clientData = { YearCoolingUpdated: '2020' };
        const atoms = getCarrierAtoms('home-dwelling-info', clientData, active);
        expect(atoms.some((a) => a.key === 'allied_coolingyear')).toBe(true);
    });

    test('includes ML policy atoms when ml is active', () => {
        const active = new Set(['common', 'ml']);
        const clientData = { AnimalOnPremises: 'Yes' };
        const atoms = getCarrierAtoms('home-policy-info', clientData, active);
        expect(atoms.some((a) => a.key === 'animalpremises_ml')).toBe(true);
    });
});

describe('getCarrierAtoms — clientData filtering', () => {
    test('excludes atoms when clientData has no matching source key', () => {
        const active = new Set(['common', 'asi', 'allstate', 'allied', 'ml']);
        const clientData = {}; // no source keys
        const atoms = getCarrierAtoms('home-policy-info', clientData, active);
        expect(atoms).toHaveLength(0);
    });

    test('excludes atoms when source value is null', () => {
        const active = new Set(['common']);
        const clientData = { BookTransfer: null };
        const atoms = getCarrierAtoms('home-policy-info', clientData, active);
        expect(atoms).toHaveLength(0);
    });

    test('excludes atoms when source value is empty string', () => {
        const active = new Set(['common']);
        const clientData = { BookTransfer: '' };
        const atoms = getCarrierAtoms('home-policy-info', clientData, active);
        expect(atoms).toHaveLength(0);
    });

    test('excludes atoms when clientData is null', () => {
        const active = new Set(['common']);
        const atoms = getCarrierAtoms('home-policy-info', null, active);
        expect(atoms).toHaveLength(0);
    });

    test('includes atoms when source value is truthy', () => {
        const active = new Set(['common']);
        const clientData = { Paperless: 'Yes', AccreditedBuilder: 'true' };
        const atoms = getCarrierAtoms('home-coverage', clientData, active);
        expect(atoms.some((a) => a.key === 'coverage_paperless_common')).toBe(true);
        expect(atoms.some((a) => a.key === 'coverage_accreditedbuilder_common')).toBe(true);
    });
});

describe('getCarrierAtoms — returns shallow copies', () => {
    test('returned atoms are copies, not references to originals', () => {
        const active = new Set(['common']);
        const clientData = { BookTransfer: 'Yes' };
        const atoms = getCarrierAtoms('home-policy-info', clientData, active);
        const original = HOME_POLICY_INFO_CARRIER_ATOMS.find((a) => a.key === 'booktransfer');
        const returned = atoms.find((a) => a.key === 'booktransfer');
        expect(returned).not.toBe(original);
        expect(returned).toEqual(original);
    });
});

describe('getCarrierAtoms — unknown routes', () => {
    test('returns empty array for routes without carrier atoms', () => {
        expect(getCarrierAtoms('applicant-details', {}, new Set(['common']))).toEqual([]);
        expect(getCarrierAtoms('drivers-compact', {}, new Set(['common']))).toEqual([]);
        expect(getCarrierAtoms('nonexistent-route', {}, new Set(['common']))).toEqual([]);
    });
});

describe('getCarrierAtoms — default activeCarriers', () => {
    test('defaults to common when no activeCarriers provided', () => {
        const clientData = { BookTransfer: 'Yes' };
        const atoms = getCarrierAtoms('home-policy-info', clientData);
        expect(atoms.some((a) => a.key === 'booktransfer')).toBe(true);
    });
});

describe('getAllCarrierAtoms', () => {
    test('returns all atoms for a route regardless of carrier or data', () => {
        const all = getAllCarrierAtoms('home-policy-info');
        expect(all).toHaveLength(4);
    });

    test('returns empty array for routes without carrier atoms', () => {
        expect(getAllCarrierAtoms('applicant-details')).toEqual([]);
        expect(getAllCarrierAtoms('nonexistent')).toEqual([]);
    });

    test('returns a copy, not the original array', () => {
        const a = getAllCarrierAtoms('home-coverage');
        const b = getAllCarrierAtoms('home-coverage');
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});

describe('getCarrierRoutes', () => {
    test('returns all route keys that have carrier extensions', () => {
        const routes = getCarrierRoutes();
        expect(routes).toContain('home-policy-info');
        expect(routes).toContain('home-dwelling-info');
        expect(routes).toContain('home-coverage');
        expect(routes).toHaveLength(3);
    });
});
