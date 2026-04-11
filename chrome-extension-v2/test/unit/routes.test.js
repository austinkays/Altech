/**
 * Altech EZLynx V2 — Router + registry stub integrity
 */
const { detectRoute, getRouteDefinition } = require('../../src/content/routes/router');
const { ROUTE_DEFINITIONS } = require('../../src/content/routes/route-definitions');
const { getRegistry, REGISTRIES } = require('../../src/content/registries');

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
    test('every route definition has a registry entry (even if empty)', () => {
        for (const def of ROUTE_DEFINITIONS) {
            expect(Object.prototype.hasOwnProperty.call(REGISTRIES, def.key)).toBe(true);
        }
    });

    test('getRegistry returns an empty array for all foundation routes', () => {
        for (const def of ROUTE_DEFINITIONS) {
            const atoms = getRegistry(def.key);
            expect(Array.isArray(atoms)).toBe(true);
            expect(atoms.length).toBe(0); // foundation milestone — no atoms yet
        }
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
