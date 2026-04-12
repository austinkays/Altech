/**
 * Auto Policy Info registry — flat, _needsRecon atoms for the auto
 * policy-info page. IDs are best-guess from EZLynx naming conventions
 * and need live validation via Registry Audit.
 *
 * Validates:
 *   - Flat registry shape: no scope, no duplicate keys, valid types.
 *   - All atoms tagged _needsRecon: true.
 *   - PriorCarrier has a precondition on residenceIs (cascade dependency).
 *   - getRegistry('auto-policy-info') returns the atom list.
 */
'use strict';

const { autoPolicyInfoAtoms } = require('../../src/content/registries/auto-policy-info');
const { getRegistry }         = require('../../src/content/registries');
const { topoSort }            = require('../../src/content/orchestrator/dependency-graph');

const VALID_TYPES = new Set([
    'text', 'date', 'number', 'currency',
    'mat-select', 'mat-toggle', 'mat-radio',
    'phone', 'ssn',
]);

function find(key) {
    return autoPolicyInfoAtoms.find((a) => a.key === key);
}

describe('Auto Policy Info — shape', () => {
    it('exports a non-empty atom array', () => {
        expect(Array.isArray(autoPolicyInfoAtoms)).toBe(true);
        expect(autoPolicyInfoAtoms.length).toBeGreaterThan(0);
    });

    it('has exactly 12 atoms', () => {
        expect(autoPolicyInfoAtoms.length).toBe(12);
    });

    it('has no duplicate keys', () => {
        const keys = autoPolicyInfoAtoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('every atom has key / source / idTemplate / type', () => {
        for (const atom of autoPolicyInfoAtoms) {
            expect(typeof atom.key).toBe('string');
            expect(typeof atom.source).toBe('string');
            expect(typeof atom.idTemplate).toBe('string');
            expect(VALID_TYPES.has(atom.type)).toBe(true);
        }
    });

    it('no atom defines scope (flat registry)', () => {
        const scoped = autoPolicyInfoAtoms.filter((a) => a.scope != null);
        expect(scoped).toEqual([]);
    });

    it('topoSort accepts the registry without cycles', () => {
        expect(() => topoSort(autoPolicyInfoAtoms)).not.toThrow();
    });
});

describe('Auto Policy Info — _needsRecon', () => {
    it('every atom is tagged _needsRecon: true', () => {
        const untagged = autoPolicyInfoAtoms
            .filter((a) => a._needsRecon !== true)
            .map((a) => a.key);
        expect(untagged).toEqual([]);
    });
});

describe('Auto Policy Info — preconditions', () => {
    it('priorCarrier depends on residenceIs DONE (cascade)', () => {
        const atom = find('priorCarrier');
        expect(atom).toBeTruthy();
        expect(atom.preconditions).toEqual(
            expect.arrayContaining([{ atom: 'residenceIs', state: 'DONE' }])
        );
    });

    it('no other atom has preconditions', () => {
        const withPrec = autoPolicyInfoAtoms
            .filter((a) => a.key !== 'priorCarrier' && a.preconditions && a.preconditions.length > 0)
            .map((a) => a.key);
        expect(withPrec).toEqual([]);
    });
});

describe('Auto Policy Info — atom types', () => {
    it('effectiveDateNewPolicy and priorPolicyExpirationDate are type date', () => {
        expect(find('effectiveDateNewPolicy').type).toBe('date');
        expect(find('priorPolicyExpirationDate').type).toBe('date');
    });

    it('creditCheckAuthorized is type mat-toggle', () => {
        expect(find('creditCheckAuthorized').type).toBe('mat-toggle');
    });

    it('most atoms are mat-select', () => {
        const matSelects = autoPolicyInfoAtoms.filter((a) => a.type === 'mat-select');
        expect(matSelects.length).toBe(9);
    });
});

describe('Auto Policy Info — registry integration', () => {
    it('getRegistry returns the atoms', () => {
        const atoms = getRegistry('auto-policy-info');
        expect(atoms.length).toBe(autoPolicyInfoAtoms.length);
    });

    it('getRegistry returns a shallow copy (not the original array)', () => {
        const atoms = getRegistry('auto-policy-info');
        expect(atoms).not.toBe(autoPolicyInfoAtoms);
        expect(atoms).toEqual(autoPolicyInfoAtoms);
    });
});
