/**
 * Drivers registry — base atom integrity + multi-entity expansion (Phase 2)
 *
 * Verifies:
 *   - 23 base atoms, valid types, no duplicate keys, no cycles
 *   - Legacy `textD{N+1}DLNumber` / `drpD{N+1}DLState` id templates
 *   - `occupationTitle` precondition on `occupationIndustry`
 *   - `dob` has skipIfDisabled: true (pulled from applicant)
 *   - getRegistry('drivers-compact', {Drivers: [..., ...]}) returns the
 *     correct expanded flat array with globally-unique keys, correct
 *     _index, rewritten preconditions, and pre-baked idTemplate
 *     substitutions for both `{N}` and `{N+1}` placeholders.
 */
'use strict';

const { driverAtoms } = require('../../src/content/registries/drivers');
const { getRegistry } = require('../../src/content/registries');
const { topoSort } = require('../../src/content/orchestrator/dependency-graph');

const VALID_TYPES = new Set([
    'text', 'date', 'number', 'currency',
    'mat-select', 'mat-toggle', 'mat-radio',
    'phone', 'ssn',
]);

function find(key) {
    return driverAtoms.find((a) => a.key === key);
}

describe('Drivers registry — base shape', () => {
    it('exports a non-empty atom array', () => {
        expect(Array.isArray(driverAtoms)).toBe(true);
        expect(driverAtoms.length).toBeGreaterThan(0);
    });

    it('has no duplicate keys', () => {
        const keys = driverAtoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('every atom has the required fields', () => {
        for (const atom of driverAtoms) {
            expect(typeof atom.key).toBe('string');
            expect(typeof atom.source).toBe('string');
            expect(typeof atom.idTemplate).toBe('string');
            expect(VALID_TYPES.has(atom.type)).toBe(true);
        }
    });

    it('all precondition refs point to real keys within the registry', () => {
        const keys = new Set(driverAtoms.map((a) => a.key));
        for (const atom of driverAtoms) {
            for (const p of (atom.preconditions || [])) {
                expect(keys.has(p.atom)).toBe(true);
            }
        }
    });
});

describe('Drivers registry — required atoms', () => {
    it('includes firstName/lastName/dob/gender', () => {
        expect(find('firstName')).toBeTruthy();
        expect(find('lastName')).toBeTruthy();
        expect(find('dob')).toBeTruthy();
        expect(find('gender')).toBeTruthy();
    });

    it('dob has skipIfDisabled: true (pulled from applicant)', () => {
        expect(find('dob').skipIfDisabled).toBe(true);
    });

    it('dlNumber uses legacy textD{N+1}DLNumber template', () => {
        expect(find('dlNumber').idTemplate).toBe('textD{N+1}DLNumber');
    });

    it('dlState uses legacy drpD{N+1}DLState template', () => {
        expect(find('dlState').idTemplate).toBe('drpD{N+1}DLState');
    });

    it('occupationTitle has precondition occupationIndustry DONE', () => {
        const atom = find('occupationTitle');
        expect(atom).toBeTruthy();
        expect(atom.preconditions).toContainEqual({ atom: 'occupationIndustry', state: 'DONE' });
    });

    it('occupationIndustry exists and is a mat-select', () => {
        const atom = find('occupationIndustry');
        expect(atom).toBeTruthy();
        expect(atom.type).toBe('mat-select');
    });
});

describe('Drivers registry — multi-entity expansion', () => {
    const clientData = {
        Drivers: [
            { FirstName: 'Alice', LastName: 'Ahern' },
            { FirstName: 'Bob',   LastName: 'Belmont' },
        ],
    };

    it('empty Drivers array returns []', () => {
        expect(getRegistry('drivers-compact', { Drivers: [] })).toEqual([]);
    });

    it('missing clientData returns []', () => {
        expect(getRegistry('drivers-compact', null)).toEqual([]);
        expect(getRegistry('drivers-compact', {})).toEqual([]);
    });

    it('expands to N × base atoms for N drivers', () => {
        const atoms = getRegistry('drivers-compact', clientData);
        expect(atoms.length).toBe(driverAtoms.length * 2);
    });

    it('produces globally-unique keys after expansion', () => {
        const atoms = getRegistry('drivers-compact', clientData);
        const keys = atoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('expanded atoms carry _index matching their driver slot', () => {
        const atoms = getRegistry('drivers-compact', clientData);
        const d0 = atoms.find((a) => a.key === 'd0_firstName');
        const d1 = atoms.find((a) => a.key === 'd1_firstName');
        expect(d0).toBeTruthy();
        expect(d1).toBeTruthy();
        expect(d0._index).toBe(0);
        expect(d1._index).toBe(1);
    });

    it('expanded atoms carry scope: driver and _entity slice', () => {
        const atoms = getRegistry('drivers-compact', clientData);
        const d0 = atoms.find((a) => a.key === 'd0_firstName');
        const d1 = atoms.find((a) => a.key === 'd1_firstName');
        expect(d0.scope).toBe('driver');
        expect(d1.scope).toBe('driver');
        expect(d0._entity).toEqual({ FirstName: 'Alice', LastName: 'Ahern' });
        expect(d1._entity).toEqual({ FirstName: 'Bob',   LastName: 'Belmont' });
    });

    it('pre-bakes idTemplate {N} placeholders', () => {
        const atoms = getRegistry('drivers-compact', clientData);
        const d0fn = atoms.find((a) => a.key === 'd0_firstName');
        const d1fn = atoms.find((a) => a.key === 'd1_firstName');
        expect(d0fn.idTemplate).toBe('driver-0-first-name');
        expect(d1fn.idTemplate).toBe('driver-1-first-name');
    });

    it('pre-bakes legacy {N+1} placeholders correctly (D1/D2)', () => {
        const atoms = getRegistry('drivers-compact', clientData);
        const d0dl = atoms.find((a) => a.key === 'd0_dlNumber');
        const d1dl = atoms.find((a) => a.key === 'd1_dlNumber');
        expect(d0dl.idTemplate).toBe('textD1DLNumber'); // driver 0 → D1
        expect(d1dl.idTemplate).toBe('textD2DLNumber'); // driver 1 → D2

        const d0st = atoms.find((a) => a.key === 'd0_dlState');
        const d1st = atoms.find((a) => a.key === 'd1_dlState');
        expect(d0st.idTemplate).toBe('drpD1DLState');
        expect(d1st.idTemplate).toBe('drpD2DLState');
    });

    it('rewrites precondition refs to the same driver (not the other)', () => {
        const atoms = getRegistry('drivers-compact', clientData);
        const d0title = atoms.find((a) => a.key === 'd0_occupationTitle');
        const d1title = atoms.find((a) => a.key === 'd1_occupationTitle');
        expect(d0title.preconditions).toEqual([{ atom: 'd0_occupationIndustry', state: 'DONE' }]);
        expect(d1title.preconditions).toEqual([{ atom: 'd1_occupationIndustry', state: 'DONE' }]);
    });

    it('expanded flat list passes topological sort (no cycles, all refs valid)', () => {
        const atoms = getRegistry('drivers-compact', clientData);
        expect(() => topoSort(atoms)).not.toThrow();
    });

    it('does not mutate the base driverAtoms array', () => {
        const before = JSON.stringify(driverAtoms);
        getRegistry('drivers-compact', clientData);
        getRegistry('drivers-compact', clientData);
        expect(JSON.stringify(driverAtoms)).toBe(before);
    });
});
