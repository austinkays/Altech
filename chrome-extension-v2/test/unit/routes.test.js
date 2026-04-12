/**
 * Altech EZLynx V2 — Router + registry stub integrity
 */
const { detectRoute, getRouteDefinition } = require('../../src/content/routes/router');
const { ROUTE_DEFINITIONS } = require('../../src/content/routes/route-definitions');
const { getRegistry } = require('../../src/content/registries');

describe('detectRoute', () => {
    test('matches applicant /details', () => {
        expect(detectRoute('https://app.ezlynx.com/ngpersonalapplicant/12345/details'))
            .toBe('applicant-details');
    });

    test('matches drivers-compact', () => {
        expect(detectRoute('https://app.ezlynx.com/ngpersonalapplicant/12345/rating/auto/98765/drivers-compact'))
            .toBe('drivers-compact');
    });

    test('matches vehicles-compact', () => {
        expect(detectRoute('https://app.ezlynx.com/rating/auto/1/vehicles-compact'))
            .toBe('vehicles-compact');
    });

    test('matches home sub-routes', () => {
        expect(detectRoute('https://app.ezlynx.com/rating/home/1/policy-info')).toBe('home-policy-info');
        expect(detectRoute('https://app.ezlynx.com/rating/home/1/dwelling-info')).toBe('home-dwelling-info');
        expect(detectRoute('https://app.ezlynx.com/rating/home/1/coverage')).toBe('home-coverage');
    });

    test('returns "unknown" for unmapped URLs', () => {
        expect(detectRoute('https://app.ezlynx.com/dashboard')).toBe('unknown');
        expect(detectRoute('')).toBe('unknown');
    });
});

describe('route/registry integrity', () => {
    test('every route definition key returns an array from getRegistry', () => {
        for (const def of ROUTE_DEFINITIONS) {
            const atoms = getRegistry(def.key);
            expect(Array.isArray(atoms)).toBe(true);
        }
    });

    test('auto-policy-info route matches', () => {
        expect(detectRoute('https://app.ezlynx.com/rating/auto/1/policy-info'))
            .toBe('auto-policy-info');
    });

    test('auto-policy-info returns populated atom array (flat, _needsRecon)', () => {
        expect(getRegistry('auto-policy-info').length).toBeGreaterThan(0);
    });

    test('auto-coverage returns populated atom array (flat, _needsRecon)', () => {
        expect(getRegistry('auto-coverage').length).toBeGreaterThan(0);
    });

    test('Phase-2 multi-entity routes return [] when clientData has no entities', () => {
        // Without a Drivers / Vehicles / Incidents array, multi-entity
        // routes have nothing to expand.
        expect(getRegistry('drivers-compact')).toEqual([]);
        expect(getRegistry('vehicles-compact')).toEqual([]);
        expect(getRegistry('incidents')).toEqual([]);
    });

    test('Phase-3 home routes return populated atom arrays (flat registries)', () => {
        expect(getRegistry('home-policy-info').length).toBeGreaterThan(0);
        expect(getRegistry('home-dwelling-info').length).toBeGreaterThan(0);
        expect(getRegistry('home-coverage').length).toBeGreaterThan(0);
    });

    test('applicant-details returns atoms (Phase 1 live)', () => {
        const atoms = getRegistry('applicant-details');
        expect(atoms.length).toBeGreaterThan(0);
    });

    test('getRegistry returns [] for unknown route keys', () => {
        expect(getRegistry('made-up-key')).toEqual([]);
        expect(getRegistry(null)).toEqual([]);
    });

    test('getRouteDefinition resolves known keys', () => {
        expect(getRouteDefinition('applicant-details')).not.toBeNull();
        expect(getRouteDefinition('nonsense')).toBeNull();
    });

    test('route definitions are unique by key', () => {
        const keys = ROUTE_DEFINITIONS.map((d) => d.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
