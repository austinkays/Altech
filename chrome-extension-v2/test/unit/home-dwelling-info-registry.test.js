/**
 * Home Dwelling Info registry — integrity + 49-atom count + zero-cascade
 * assertion (Phase 3)
 *
 * Validates:
 *   - Exactly 49 core atoms (plan §6.7)
 *   - Zero cascade preconditions — the old extension's assumptions that
 *     Dwelling Type → Stories and Roof Type → Roof Design were wrong.
 *   - Explicit `yearUpdated{Heating,Electrical,Plumbing,Roofing}` ids
 *   - `noOfUnitsInFireDivision` has `skipIfDisabled: true`
 *   - No duplicate keys, valid types, no scope
 *   - getRegistry('home-dwelling-info') returns the atom list directly
 */
'use strict';

const { homeDwellingInfoAtoms } = require('../../src/content/registries/home-dwelling-info');
const { getRegistry }            = require('../../src/content/registries');
const { topoSort }               = require('../../src/content/orchestrator/dependency-graph');

const VALID_TYPES = new Set([
    'text', 'date', 'number', 'currency',
    'mat-select', 'mat-toggle', 'mat-radio',
    'phone', 'ssn',
]);

function find(key) {
    return homeDwellingInfoAtoms.find((a) => a.key === key);
}

describe('Home Dwelling Info — atom count (§6.7 Phase 3)', () => {
    it('has exactly 49 core atoms', () => {
        expect(homeDwellingInfoAtoms.length).toBe(49);
    });
});

describe('Home Dwelling Info — zero cascade preconditions', () => {
    it('no atom declares any precondition', () => {
        const withPreconds = homeDwellingInfoAtoms
            .filter((a) => Array.isArray(a.preconditions) && a.preconditions.length > 0)
            .map((a) => a.key);
        expect(withPreconds).toEqual([]);
    });

    it('Dwelling Type is NOT gated on numberOfStories (verified false by recon)', () => {
        expect(find('dwellingType').preconditions).toBeFalsy();
        expect(find('numberOfStories').preconditions).toBeFalsy();
    });

    it('Roof Type is NOT gated on Roof Design (verified false by recon)', () => {
        expect(find('roofType').preconditions).toBeFalsy();
        expect(find('roofDesign').preconditions).toBeFalsy();
    });

    it('topoSort accepts the registry without cycles', () => {
        expect(() => topoSort(homeDwellingInfoAtoms)).not.toThrow();
    });
});

describe('Home Dwelling Info — shape', () => {
    it('has no duplicate keys', () => {
        const keys = homeDwellingInfoAtoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('every atom has key / source / idTemplate / type', () => {
        for (const atom of homeDwellingInfoAtoms) {
            expect(typeof atom.key).toBe('string');
            expect(atom.key.length).toBeGreaterThan(0);
            expect(typeof atom.source).toBe('string');
            expect(atom.source.length).toBeGreaterThan(0);
            expect(typeof atom.idTemplate).toBe('string');
            expect(atom.idTemplate.length).toBeGreaterThan(0);
            expect(VALID_TYPES.has(atom.type)).toBe(true);
        }
    });

    it('no atom defines scope (flat registry)', () => {
        const scoped = homeDwellingInfoAtoms.filter((a) => a.scope != null);
        expect(scoped).toEqual([]);
    });
});

describe('Home Dwelling Info — explicit yearUpdated ids (plan §6.7)', () => {
    const EXPECTED_YEAR_UPDATED_IDS = [
        'yearUpdatedHeating',
        'yearUpdatedElectrical',
        'yearUpdatedPlumbing',
        'yearUpdatedRoofing',
    ];

    it.each(EXPECTED_YEAR_UPDATED_IDS)('%s atom exists with matching idTemplate', (key) => {
        const atom = find(key);
        expect(atom).toBeTruthy();
        expect(atom.idTemplate).toBe(key);
    });

    it('the four yearUpdated* ids are unique (no positional disambiguation needed)', () => {
        const found = EXPECTED_YEAR_UPDATED_IDS
            .map((k) => find(k)?.idTemplate);
        expect(new Set(found).size).toBe(EXPECTED_YEAR_UPDATED_IDS.length);
    });
});

describe('Home Dwelling Info — skipIfDisabled on noOfUnitsInFireDivision', () => {
    it('is flagged skipIfDisabled: true', () => {
        const atom = find('noOfUnitsInFireDivision');
        expect(atom).toBeTruthy();
        expect(atom.skipIfDisabled).toBe(true);
    });
});

describe('Home Dwelling Info — getRegistry integration', () => {
    it('returns the full atom list (flat route — no multi-entity expansion)', () => {
        const atoms = getRegistry('home-dwelling-info', { YearBuilt: 2001 });
        expect(atoms.length).toBe(49);
    });

    it('returns a shallow copy (mutating result does not affect the source)', () => {
        const atoms = getRegistry('home-dwelling-info', {});
        atoms.pop();
        expect(homeDwellingInfoAtoms.length).toBe(49);
    });

    it('returns the atom list even when clientData is empty', () => {
        // Flat registry — we still enumerate every atom. Each will SKIP
        // at PRECHECK with empty-source when clientData omits the source.
        const atoms = getRegistry('home-dwelling-info');
        expect(atoms.length).toBe(49);
    });
});
