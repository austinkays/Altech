/**
 * Vehicles registry — base atom integrity + VIN decoder short-circuit
 * + multi-entity expansion (Phase 2)
 *
 * Key invariants:
 *   - VIN atom carries postFill [clickVinLookup, waitForDecodeComplete]
 *   - All VIN-decoded dependent atoms carry BOTH
 *       skipIfAlreadyFilled: true
 *       preconditions: [{atom:'vin', state:'DONE'}]
 *   - costNew uses legacy `textV1CostNew` id (no {N} substitution)
 *   - Expansion for 2 vehicles produces 2 × N keys, unique, topo-sortable
 */
'use strict';

const { vehicleAtoms } = require('../../src/content/registries/vehicles');
const { getRegistry } = require('../../src/content/registries');
const { topoSort } = require('../../src/content/orchestrator/dependency-graph');

const VALID_TYPES = new Set([
    'text', 'date', 'number', 'currency',
    'mat-select', 'mat-toggle', 'mat-radio',
    'phone', 'ssn',
]);

function find(key) {
    return vehicleAtoms.find((a) => a.key === key);
}

const VIN_DECODED_KEYS = [
    'year', 'make', 'model', 'subModel', 'purchaseDate',
    'passiveRestraints', 'antiLockBrakes', 'costNew',
];

describe('Vehicles registry — base shape', () => {
    it('exports a non-empty array', () => {
        expect(vehicleAtoms.length).toBeGreaterThan(0);
    });

    it('no duplicate keys', () => {
        const keys = vehicleAtoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('every atom has required fields + valid type', () => {
        for (const atom of vehicleAtoms) {
            expect(typeof atom.key).toBe('string');
            expect(typeof atom.source).toBe('string');
            expect(typeof atom.idTemplate).toBe('string');
            expect(VALID_TYPES.has(atom.type)).toBe(true);
        }
    });

    it('all precondition refs point to real keys', () => {
        const keys = new Set(vehicleAtoms.map((a) => a.key));
        for (const atom of vehicleAtoms) {
            for (const p of (atom.preconditions || [])) {
                expect(keys.has(p.atom)).toBe(true);
            }
        }
    });
});

describe('Vehicles registry — VIN gate atom', () => {
    it('vin atom exists, is text type, sources from VIN', () => {
        const vin = find('vin');
        expect(vin).toBeTruthy();
        expect(vin.type).toBe('text');
        expect(vin.source).toBe('VIN');
        expect(vin.idTemplate).toBe('VIN-{N}');
    });

    it('vin atom carries postFill [clickVinLookup, waitForDecodeComplete]', () => {
        const vin = find('vin');
        expect(Array.isArray(vin.postFill)).toBe(true);
        expect(vin.postFill).toEqual([
            { action: 'clickVinLookup' },
            { action: 'waitForDecodeComplete' },
        ]);
    });
});

describe('Vehicles registry — VIN-decoded dependent atoms', () => {
    for (const key of VIN_DECODED_KEYS) {
        it(`${key} carries skipIfAlreadyFilled: true`, () => {
            expect(find(key).skipIfAlreadyFilled).toBe(true);
        });
        it(`${key} carries precondition vin DONE`, () => {
            expect(find(key).preconditions)
                .toContainEqual({ atom: 'vin', state: 'DONE' });
        });
    }

    it('costNew uses legacy textV1CostNew id (no {N} substitution)', () => {
        expect(find('costNew').idTemplate).toBe('textV1CostNew');
    });

    it('year / make / model / subModel use selected-*-{N} ids', () => {
        expect(find('year').idTemplate).toBe('selected-year-{N}');
        expect(find('make').idTemplate).toBe('selected-make-{N}');
        expect(find('model').idTemplate).toBe('selected-model-{N}');
        expect(find('subModel').idTemplate).toBe('selected-submodel-{N}');
    });
});

describe('Vehicles registry — multi-entity expansion', () => {
    const clientData = {
        Vehicles: [
            { VIN: '1HGCM82633A004352', Year: '2020' },
            { VIN: '5YJ3E1EA7JF000001', Year: '2018' },
        ],
    };

    it('empty Vehicles array returns []', () => {
        expect(getRegistry('vehicles-compact', { Vehicles: [] })).toEqual([]);
    });

    it('expands to 2 × N atoms for 2 vehicles', () => {
        const atoms = getRegistry('vehicles-compact', clientData);
        expect(atoms.length).toBe(vehicleAtoms.length * 2);
    });

    it('produces globally-unique keys', () => {
        const atoms = getRegistry('vehicles-compact', clientData);
        const keys = atoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('v0_* and v1_* atoms exist with correct _index', () => {
        const atoms = getRegistry('vehicles-compact', clientData);
        const v0vin = atoms.find((a) => a.key === 'v0_vin');
        const v1vin = atoms.find((a) => a.key === 'v1_vin');
        expect(v0vin).toBeTruthy();
        expect(v1vin).toBeTruthy();
        expect(v0vin._index).toBe(0);
        expect(v1vin._index).toBe(1);
        expect(v0vin.scope).toBe('vehicle');
    });

    it('pre-bakes {N} in idTemplate', () => {
        const atoms = getRegistry('vehicles-compact', clientData);
        expect(atoms.find((a) => a.key === 'v0_vin').idTemplate).toBe('VIN-0');
        expect(atoms.find((a) => a.key === 'v1_vin').idTemplate).toBe('VIN-1');
        expect(atoms.find((a) => a.key === 'v0_year').idTemplate).toBe('selected-year-0');
        expect(atoms.find((a) => a.key === 'v1_year').idTemplate).toBe('selected-year-1');
    });

    it('legacy textV1CostNew is hardcoded for both vehicles (vehicle 0 only behaviour)', () => {
        const atoms = getRegistry('vehicles-compact', clientData);
        expect(atoms.find((a) => a.key === 'v0_costNew').idTemplate).toBe('textV1CostNew');
        // Per plan: vehicle 1's costNew still has the legacy id — it will
        // lose the race to vehicle 0's element on live EZLynx, but it's
        // gated by skipIfAlreadyFilled after VIN decode, so no harm.
        expect(atoms.find((a) => a.key === 'v1_costNew').idTemplate).toBe('textV1CostNew');
    });

    it('rewrites precondition refs so dependent atoms gate on their own vin atom', () => {
        const atoms = getRegistry('vehicles-compact', clientData);
        const v0year = atoms.find((a) => a.key === 'v0_year');
        const v1year = atoms.find((a) => a.key === 'v1_year');
        expect(v0year.preconditions).toContainEqual({ atom: 'v0_vin', state: 'DONE' });
        expect(v1year.preconditions).toContainEqual({ atom: 'v1_vin', state: 'DONE' });
    });

    it('expanded flat list topo-sorts cleanly', () => {
        const atoms = getRegistry('vehicles-compact', clientData);
        expect(() => topoSort(atoms)).not.toThrow();
    });

    it('does not mutate the base vehicleAtoms array', () => {
        const before = JSON.stringify(vehicleAtoms);
        getRegistry('vehicles-compact', clientData);
        expect(JSON.stringify(vehicleAtoms)).toBe(before);
    });
});
