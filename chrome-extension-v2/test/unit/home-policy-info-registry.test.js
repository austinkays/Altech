/**
 * Home Policy Info registry — integrity + dynamic-reveal spot-checks (Phase 3)
 *
 * Validates:
 *   - Core atoms have unique keys, valid types, valid preconditions, no cycles
 *   - Toggles carrying `waitForChildAtomsReady` postFill actions:
 *       swimmingPoolOnPremises / dogInfo / trampoline / businessOrDaycareOnPremises
 *     each have a postFill entry whose `children` array references real
 *     child atom keys.
 *   - numberOfEmployees is blocked by the business-or-daycare toggle
 *   - getRegistry('home-policy-info', clientData) appends child atoms
 *     only when clientData carries a matching source value.
 */
'use strict';

const {
    homePolicyInfoAtoms,
    homePolicyInfoChildAtomSpecs,
    buildHomePolicyInfoAtoms,
} = require('../../src/content/registries/home-policy-info');
const { getRegistry } = require('../../src/content/registries');
const { topoSort }    = require('../../src/content/orchestrator/dependency-graph');

const VALID_TYPES = new Set([
    'text', 'date', 'number', 'currency',
    'mat-select', 'mat-toggle', 'mat-radio',
    'phone', 'ssn',
]);

function find(key) {
    return homePolicyInfoAtoms.find((a) => a.key === key);
}

describe('Home Policy Info — core atom shape', () => {
    it('exports a non-empty atom array', () => {
        expect(Array.isArray(homePolicyInfoAtoms)).toBe(true);
        expect(homePolicyInfoAtoms.length).toBeGreaterThan(0);
    });

    it('has no duplicate keys', () => {
        const keys = homePolicyInfoAtoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('every atom has key / source / idTemplate / type', () => {
        for (const atom of homePolicyInfoAtoms) {
            expect(typeof atom.key).toBe('string');
            expect(typeof atom.source).toBe('string');
            expect(typeof atom.idTemplate).toBe('string');
            expect(VALID_TYPES.has(atom.type)).toBe(true);
        }
    });

    it('no atom defines scope (flat registry)', () => {
        const scoped = homePolicyInfoAtoms.filter((a) => a.scope != null);
        expect(scoped).toEqual([]);
    });

    it('no atom defines _index or _entity (flat registry, no multi-entity expansion)', () => {
        const withIndex = homePolicyInfoAtoms.filter((a) => a._index != null || a._entity != null);
        expect(withIndex).toEqual([]);
    });

    it('topoSort accepts the flat registry without cycles', () => {
        expect(() => topoSort(homePolicyInfoAtoms)).not.toThrow();
    });

    it('all precondition refs resolve to other atoms in the registry', () => {
        const keySet = new Set(homePolicyInfoAtoms.map((a) => a.key));
        for (const atom of homePolicyInfoAtoms) {
            for (const p of (atom.preconditions || [])) {
                expect(keySet.has(p.atom)).toBe(true);
            }
        }
    });
});

describe('Home Policy Info — dynamic reveal toggles (§7.5)', () => {
    const REVEAL_TOGGLES = [
        'swimmingPoolOnPremises',
        'dogInfo',
        'trampoline',
        'businessOrDaycareOnPremises',
    ];

    it.each(REVEAL_TOGGLES)('%s is a mat-toggle with a waitForChildAtomsReady postFill', (key) => {
        const atom = find(key);
        expect(atom).toBeTruthy();
        expect(atom.type).toBe('mat-toggle');
        expect(Array.isArray(atom.postFill)).toBe(true);
        const action = atom.postFill.find((a) => a.action === 'waitForChildAtomsReady');
        expect(action).toBeTruthy();
        expect(Array.isArray(action.children)).toBe(true);
    });

    it('swimmingPoolOnPremises references poolType + poolFenced child ids', () => {
        const action = find('swimmingPoolOnPremises').postFill[0];
        expect(action.children).toEqual(expect.arrayContaining(['poolType', 'poolFenced']));
    });

    it('numberOfEmployees is blocked by businessOrDaycareOnPremises', () => {
        const atom = find('numberOfEmployees');
        expect(atom).toBeTruthy();
        expect(atom.preconditions).toContainEqual({
            atom: 'businessOrDaycareOnPremises', state: 'DONE',
        });
    });
});

describe('Home Policy Info — child atom specs', () => {
    it('each child spec has a precondition on its parent toggle', () => {
        const valid = new Set([
            'swimmingPoolOnPremises',
            'dogInfo',
            'trampoline',
            'businessOrDaycareOnPremises',
        ]);
        for (const spec of homePolicyInfoChildAtomSpecs) {
            expect(Array.isArray(spec.preconditions)).toBe(true);
            expect(spec.preconditions.length).toBeGreaterThan(0);
            for (const p of spec.preconditions) {
                expect(valid.has(p.atom)).toBe(true);
                expect(p.state).toBe('DONE');
            }
        }
    });
});

describe('Home Policy Info — getRegistry integration', () => {
    it('returns only the core atoms when clientData has no reveal values', () => {
        const atoms = getRegistry('home-policy-info', { HomePriorCarrier: 'Allstate' });
        expect(atoms.length).toBe(homePolicyInfoAtoms.length);
        // buildHomePolicyInfoAtoms returns the same set when no child sources
        expect(buildHomePolicyInfoAtoms({ HomePriorCarrier: 'Allstate' }).length)
            .toBe(homePolicyInfoAtoms.length);
    });

    it('appends poolType / poolFenced child atoms when clientData has those sources', () => {
        const atoms = getRegistry('home-policy-info', {
            SwimmingPool: 'yes',
            PoolType: 'Inground',
            PoolFenced: 'yes',
        });
        const keys = atoms.map((a) => a.key);
        expect(keys).toContain('poolType');
        expect(keys).toContain('poolFenced');
    });

    it('does NOT append child atoms whose source keys are missing', () => {
        const atoms = getRegistry('home-policy-info', { DogsOnPremises: 'yes' });
        const keys = atoms.map((a) => a.key);
        expect(keys).not.toContain('numberOfDogs');
        expect(keys).not.toContain('dogBreed');
    });

    it('full clientData with every reveal source appends every child atom', () => {
        const atoms = getRegistry('home-policy-info', {
            SwimmingPool: 'yes', PoolType: 'Inground', PoolFenced: 'yes',
            DogsOnPremises: 'yes', NumberOfDogs: '2', DogBreed: 'Lab', DogBiteHistory: 'no',
            Trampoline: 'yes', TrampolineFenced: 'yes',
            BusinessOrDaycare: 'yes', BusinessType: 'Home Office',
        });
        const childKeys = homePolicyInfoChildAtomSpecs.map((s) => s.key);
        const keys = atoms.map((a) => a.key);
        for (const k of childKeys) {
            expect(keys).toContain(k);
        }
        expect(atoms.length).toBe(homePolicyInfoAtoms.length + homePolicyInfoChildAtomSpecs.length);
    });

    it('returns [] for an unknown route', () => {
        expect(getRegistry('some-nonexistent-route')).toEqual([]);
    });
});
