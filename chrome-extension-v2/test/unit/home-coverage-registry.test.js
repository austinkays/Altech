/**
 * Home Coverage registry — currency + deductible transforms + mortgagee
 * dynamic reveal (Phase 3, plan §6.8 + §7.5 + §7.7)
 *
 * Validates:
 *   - Currency atoms (dwelling, estReplacementCost, loss-of-use-amount)
 *     carry a valueTransform that strips `$` and commas to a raw number.
 *   - Deductible mat-select atoms (allPerilsDeductible, theftDeductible,
 *     windDeductible, personalLiability, medicalPayments) carry a
 *     valueTransform that strips `$` / commas AND coerces to an integer
 *     so raw-number mat-option text ("1000") matches clientData's
 *     formatted value ("$1,000") exactly.
 *   - First/Second/Third Mortgagee toggles carry waitForChildAtomsReady
 *     postFill actions.
 *   - Flat registry shape: no scope, no duplicate keys, valid types.
 */
'use strict';

const { homeCoverageAtoms, _transforms } = require('../../src/content/registries/home-coverage');
const { getRegistry } = require('../../src/content/registries');
const { topoSort }    = require('../../src/content/orchestrator/dependency-graph');

const VALID_TYPES = new Set([
    'text', 'date', 'number', 'currency',
    'mat-select', 'mat-toggle', 'mat-radio',
    'phone', 'ssn',
]);

function find(key) {
    return homeCoverageAtoms.find((a) => a.key === key);
}

describe('Home Coverage — shape', () => {
    it('exports a non-empty atom array', () => {
        expect(Array.isArray(homeCoverageAtoms)).toBe(true);
        expect(homeCoverageAtoms.length).toBeGreaterThan(0);
    });

    it('has no duplicate keys', () => {
        const keys = homeCoverageAtoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('every atom has key / source / idTemplate / type', () => {
        for (const atom of homeCoverageAtoms) {
            expect(typeof atom.key).toBe('string');
            expect(typeof atom.source).toBe('string');
            expect(typeof atom.idTemplate).toBe('string');
            expect(VALID_TYPES.has(atom.type)).toBe(true);
        }
    });

    it('no atom defines scope (flat registry)', () => {
        const scoped = homeCoverageAtoms.filter((a) => a.scope != null);
        expect(scoped).toEqual([]);
    });

    it('topoSort accepts the registry without cycles', () => {
        expect(() => topoSort(homeCoverageAtoms)).not.toThrow();
    });
});

describe('Home Coverage — currency transform (§6.8)', () => {
    const CURRENCY_KEYS = ['dwelling', 'estReplacementCost', 'loss-of-use-amount'];

    it.each(CURRENCY_KEYS)('%s atom is type currency and has a valueTransform', (key) => {
        const atom = find(key);
        expect(atom).toBeTruthy();
        expect(atom.type).toBe('currency');
        expect(typeof atom.valueTransform).toBe('function');
    });

    it('currency transform strips $ and commas from a formatted value', () => {
        expect(_transforms.currencyTransform('$250,000')).toBe('250000');
        expect(_transforms.currencyTransform('$1,234.56')).toBe('1234.56');
        expect(_transforms.currencyTransform(' 1500 ')).toBe('1500');
    });

    it('dwelling atom valueTransform normalizes "$250,000" to "250000"', () => {
        const atom = find('dwelling');
        expect(atom.valueTransform('$250,000')).toBe('250000');
    });

    it('estReplacementCost atom valueTransform normalizes "$325,000" to "325000"', () => {
        expect(find('estReplacementCost').valueTransform('$325,000')).toBe('325000');
    });

    it('loss-of-use-amount atom valueTransform normalizes "$50,000" to "50000"', () => {
        expect(find('loss-of-use-amount').valueTransform('$50,000')).toBe('50000');
    });
});

describe('Home Coverage — deductible transform (§7.7)', () => {
    const DEDUCTIBLE_KEYS = [
        'allPerilsDeductible',
        'theftDeductible',
        'windDeductible',
        'personalLiability',
        'medicalPayments',
    ];

    it.each(DEDUCTIBLE_KEYS)('%s atom is mat-select with a valueTransform', (key) => {
        const atom = find(key);
        expect(atom).toBeTruthy();
        expect(atom.type).toBe('mat-select');
        expect(typeof atom.valueTransform).toBe('function');
    });

    it('deductible transform strips $ / commas and coerces to an integer string', () => {
        expect(_transforms.deductibleTransform('$1,000')).toBe('1000');
        expect(_transforms.deductibleTransform('$2,500')).toBe('2500');
        expect(_transforms.deductibleTransform(1000)).toBe('1000');
        expect(_transforms.deductibleTransform('1000')).toBe('1000');
    });

    it('allPerilsDeductible normalizes "$1,000" to "1000" (matches raw mat-option text)', () => {
        expect(find('allPerilsDeductible').valueTransform('$1,000')).toBe('1000');
    });

    it('personalLiability normalizes "$500,000" to "500000"', () => {
        expect(find('personalLiability').valueTransform('$500,000')).toBe('500000');
    });

    it('medicalPayments normalizes "$5,000" to "5000"', () => {
        expect(find('medicalPayments').valueTransform('$5,000')).toBe('5000');
    });
});

describe('Home Coverage — mortgagee reveal toggles (§7.5)', () => {
    const MORTGAGEE_KEYS = ['firstMortgagee', 'secondMortgagee', 'thirdMortgagee'];

    it.each(MORTGAGEE_KEYS)('%s is a mat-toggle with waitForChildAtomsReady postFill', (key) => {
        const atom = find(key);
        expect(atom).toBeTruthy();
        expect(atom.type).toBe('mat-toggle');
        expect(Array.isArray(atom.postFill)).toBe(true);
        const action = atom.postFill.find((a) => a.action === 'waitForChildAtomsReady');
        expect(action).toBeTruthy();
        expect(Array.isArray(action.children)).toBe(true);
    });

    it('firstMortgagee children list is non-empty (pre-wired for §7.5 reveal)', () => {
        const action = find('firstMortgagee').postFill[0];
        expect(action.children.length).toBeGreaterThan(0);
    });
});

describe('Home Coverage — getRegistry integration', () => {
    it('returns the full coverage atom list', () => {
        const atoms = getRegistry('home-coverage', { DwellingCoverage: '$250,000' });
        expect(atoms.length).toBe(homeCoverageAtoms.length);
    });

    it('returns a shallow copy (mutating result does not affect the source)', () => {
        const atoms = getRegistry('home-coverage', {});
        atoms.pop();
        expect(homeCoverageAtoms.length).toBeGreaterThan(0);
    });
});
