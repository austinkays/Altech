/**
 * Registry integrity tests
 *
 * Validates every atom in every registry against the spec:
 *   - No duplicate keys within a registry
 *   - All `type` values in the valid enum
 *   - All preconditions[].atom references point to real keys
 *   - No dependency cycles
 *   - Co-applicant atoms have {entityId} in idTemplate
 */
'use strict';

const { applicantAtoms }     = require('../../src/content/registries/applicant');
const { coApplicantAtoms }   = require('../../src/content/registries/co-applicant');

const VALID_TYPES = new Set([
    'text', 'date', 'number', 'currency',
    'mat-select', 'mat-toggle', 'mat-radio',
    'phone', 'ssn',
]);

function checkRegistry(name, atoms) {
    describe(`Registry integrity — ${name}`, () => {
        it('exports a non-empty array', () => {
            expect(Array.isArray(atoms)).toBe(true);
            expect(atoms.length).toBeGreaterThan(0);
        });

        it('has no duplicate keys', () => {
            const seen = new Map();
            const dupes = [];
            for (const atom of atoms) {
                if (seen.has(atom.key)) dupes.push(atom.key);
                else seen.set(atom.key, true);
            }
            expect(dupes).toEqual([]);
        });

        it('every atom has a non-empty key, source, idTemplate, and type', () => {
            for (const atom of atoms) {
                expect(typeof atom.key).toBe('string');
                expect(atom.key.length).toBeGreaterThan(0);
                expect(typeof atom.source).toBe('string');
                expect(atom.source.length).toBeGreaterThan(0);
                expect(typeof atom.idTemplate).toBe('string');
                expect(atom.idTemplate.length).toBeGreaterThan(0);
                expect(typeof atom.type).toBe('string');
            }
        });

        it('all type values are in the valid enum', () => {
            const badTypes = atoms.filter((a) => !VALID_TYPES.has(a.type)).map((a) => `${a.key}:${a.type}`);
            expect(badTypes).toEqual([]);
        });

        it('all precondition atom references point to real keys', () => {
            const keySet = new Set(atoms.map((a) => a.key));
            const badRefs = [];
            for (const atom of atoms) {
                for (const p of (atom.preconditions || [])) {
                    if (!keySet.has(p.atom)) {
                        badRefs.push(`${atom.key} → ${p.atom} (missing)`);
                    }
                }
            }
            expect(badRefs).toEqual([]);
        });

        it('has no dependency cycles', () => {
            const deps = new Map();
            for (const atom of atoms) {
                deps.set(atom.key, (atom.preconditions || []).map((p) => p.atom));
            }
            const visiting = new Set();
            const visited  = new Set();

            function dfs(key) {
                if (visited.has(key)) return false;
                if (visiting.has(key)) return true; // cycle
                visiting.add(key);
                for (const dep of (deps.get(key) || [])) {
                    if (dfs(dep)) return true;
                }
                visiting.delete(key);
                visited.add(key);
                return false;
            }

            const cycles = atoms.filter((a) => dfs(a.key)).map((a) => a.key);
            expect(cycles).toEqual([]);
        });
    });
}

checkRegistry('applicant', applicantAtoms);
checkRegistry('co-applicant', coApplicantAtoms);

describe('Registry integrity — co-applicant specific', () => {
    it('all co-applicant atoms have {entityId} in idTemplate', () => {
        const missing = coApplicantAtoms
            .filter((a) => !a.idTemplate.includes('{entityId}'))
            .map((a) => a.key);
        expect(missing).toEqual([]);
    });

    it('all co-applicant atoms have scope: coApplicant', () => {
        const wrongScope = coApplicantAtoms
            .filter((a) => a.scope !== 'coApplicant')
            .map((a) => a.key);
        expect(wrongScope).toEqual([]);
    });

    it('all co-applicant source paths start with CoApplicant.', () => {
        const badSource = coApplicantAtoms
            .filter((a) => !a.source.startsWith('CoApplicant.'))
            .map((a) => `${a.key}: ${a.source}`);
        expect(badSource).toEqual([]);
    });
});

describe('Registry integrity — applicant atom count', () => {
    it('has exactly 45 atoms', () => {
        expect(applicantAtoms.length).toBe(45);
    });
});

describe('Registry integrity — co-applicant atom count', () => {
    it('has exactly 16 atoms', () => {
        expect(coApplicantAtoms.length).toBe(16);
    });
});
