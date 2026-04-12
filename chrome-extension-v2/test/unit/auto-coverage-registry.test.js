/**
 * Auto Coverage registry — flat, _needsRecon atoms for the auto coverage
 * page. IDs are best-guess from EZLynx naming conventions and need live
 * validation via Registry Audit.
 *
 * Validates:
 *   - Flat registry shape: no scope, no duplicate keys, valid types.
 *   - All atoms tagged _needsRecon: true.
 *   - Deductible atoms (comprehensive, collision) carry a valueTransform.
 *   - All atoms are mat-select type (v1 confirms no text fields).
 *   - getRegistry('auto-coverage') returns the atom list.
 */
'use strict';

const { autoCoverageAtoms } = require('../../src/content/registries/auto-coverage');
const { getRegistry }       = require('../../src/content/registries');
const { topoSort }          = require('../../src/content/orchestrator/dependency-graph');

const VALID_TYPES = new Set([
    'text', 'date', 'number', 'currency',
    'mat-select', 'mat-toggle', 'mat-radio',
    'phone', 'ssn',
]);

function find(key) {
    return autoCoverageAtoms.find((a) => a.key === key);
}

describe('Auto Coverage — shape', () => {
    it('exports a non-empty atom array', () => {
        expect(Array.isArray(autoCoverageAtoms)).toBe(true);
        expect(autoCoverageAtoms.length).toBeGreaterThan(0);
    });

    it('has exactly 10 atoms', () => {
        expect(autoCoverageAtoms.length).toBe(10);
    });

    it('has no duplicate keys', () => {
        const keys = autoCoverageAtoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('every atom has key / source / idTemplate / type', () => {
        for (const atom of autoCoverageAtoms) {
            expect(typeof atom.key).toBe('string');
            expect(typeof atom.source).toBe('string');
            expect(typeof atom.idTemplate).toBe('string');
            expect(VALID_TYPES.has(atom.type)).toBe(true);
        }
    });

    it('no atom defines scope (flat registry)', () => {
        const scoped = autoCoverageAtoms.filter((a) => a.scope != null);
        expect(scoped).toEqual([]);
    });

    it('every atom is type mat-select (v1 confirms no text fields on auto coverage)', () => {
        const nonSelect = autoCoverageAtoms
            .filter((a) => a.type !== 'mat-select')
            .map((a) => a.key);
        expect(nonSelect).toEqual([]);
    });

    it('topoSort accepts the registry without cycles', () => {
        expect(() => topoSort(autoCoverageAtoms)).not.toThrow();
    });

    it('no atom has preconditions (all independent)', () => {
        const withPrec = autoCoverageAtoms
            .filter((a) => a.preconditions && a.preconditions.length > 0)
            .map((a) => a.key);
        expect(withPrec).toEqual([]);
    });
});

describe('Auto Coverage — _needsRecon', () => {
    it('every atom is tagged _needsRecon: true', () => {
        const untagged = autoCoverageAtoms
            .filter((a) => a._needsRecon !== true)
            .map((a) => a.key);
        expect(untagged).toEqual([]);
    });
});

describe('Auto Coverage — deductible transform (§7.7)', () => {
    it('comprehensive atom has a valueTransform', () => {
        const atom = find('comprehensive');
        expect(atom).toBeTruthy();
        expect(typeof atom.valueTransform).toBe('function');
    });

    it('collision atom has a valueTransform', () => {
        const atom = find('collision');
        expect(atom).toBeTruthy();
        expect(typeof atom.valueTransform).toBe('function');
    });

    it('comprehensive transform strips "$500" to "500"', () => {
        const atom = find('comprehensive');
        expect(atom.valueTransform('$500')).toBe('500');
    });

    it('collision transform strips "$1,000" to "1000"', () => {
        const atom = find('collision');
        expect(atom.valueTransform('$1,000')).toBe('1000');
    });

    it('non-deductible atoms have no valueTransform', () => {
        const nonDeductible = autoCoverageAtoms
            .filter((a) => a.key !== 'comprehensive' && a.key !== 'collision')
            .filter((a) => typeof a.valueTransform === 'function')
            .map((a) => a.key);
        expect(nonDeductible).toEqual([]);
    });
});

describe('Auto Coverage — source keys match Altech clientData', () => {
    const EXPECTED_SOURCES = [
        'liabilityLimits', 'pdLimit', 'medPayments',
        'umLimits', 'umpdLimit', 'uimLimits',
        'compDeductible', 'autoDeductible',
        'towingDeductible', 'rentalDeductible',
    ];

    it('every expected source key is present', () => {
        const actualSources = autoCoverageAtoms.map((a) => a.source);
        for (const src of EXPECTED_SOURCES) {
            expect(actualSources).toContain(src);
        }
    });
});

describe('Auto Coverage — registry integration', () => {
    it('getRegistry returns the atoms', () => {
        const atoms = getRegistry('auto-coverage');
        expect(atoms.length).toBe(autoCoverageAtoms.length);
    });

    it('getRegistry returns a shallow copy (not the original array)', () => {
        const atoms = getRegistry('auto-coverage');
        expect(atoms).not.toBe(autoCoverageAtoms);
        expect(atoms).toEqual(autoCoverageAtoms);
    });
});
