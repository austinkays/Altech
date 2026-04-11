/**
 * Applicant registry — spot-check tests
 *
 * Verifies the specific atoms that have non-default behaviour:
 *   - address1 → postFill: dismissPacContainer
 *   - occupation → precondition: industry DONE
 *   - county → precondition: addressState DONE
 *   - occupationYears → precondition: occupation DONE
 *   - dlNumber, ssn → skipIfLexisNexisLocked: true (explicit)
 *   - firstName, lastName, dateOfBirth → type: text / date, skipIfLexisNexisLocked: true
 */
'use strict';

const { applicantAtoms } = require('../../src/content/registries/applicant');
const { getRegistry }    = require('../../src/content/registries');

function find(key) {
    return applicantAtoms.find((a) => a.key === key);
}

describe('Applicant registry', () => {
    describe('address1 atom', () => {
        it('exists', () => expect(find('address1')).toBeTruthy());
        it('is type text', () => expect(find('address1').type).toBe('text'));
        it('has idTemplate applicant-primary-address-address1', () =>
            expect(find('address1').idTemplate).toBe('applicant-primary-address-address1'));
        it('has postFill dismissPacContainer action', () => {
            const atom = find('address1');
            expect(Array.isArray(atom.postFill)).toBe(true);
            expect(atom.postFill[0]).toEqual({ action: 'dismissPacContainer' });
        });
    });

    describe('occupation atom', () => {
        it('exists and is mat-select', () => {
            const a = find('occupation');
            expect(a).toBeTruthy();
            expect(a.type).toBe('mat-select');
        });
        it('has precondition: industry DONE', () => {
            const a = find('occupation');
            expect(a.preconditions).toContainEqual({ atom: 'industry', state: 'DONE' });
        });
    });

    describe('county atom', () => {
        it('has precondition: addressState DONE', () => {
            const a = find('county');
            expect(a).toBeTruthy();
            expect(a.preconditions).toContainEqual({ atom: 'addressState', state: 'DONE' });
        });
    });

    describe('occupationYears atom', () => {
        it('has precondition: occupation DONE', () => {
            const a = find('occupationYears');
            expect(a).toBeTruthy();
            expect(a.preconditions).toContainEqual({ atom: 'occupation', state: 'DONE' });
        });
    });

    describe('LexisNexis lock flags', () => {
        it('dlNumber has skipIfLexisNexisLocked: true', () =>
            expect(find('dlNumber').skipIfLexisNexisLocked).toBe(true));
        it('ssn has skipIfLexisNexisLocked: true', () =>
            expect(find('ssn').skipIfLexisNexisLocked).toBe(true));
        it('firstName has skipIfLexisNexisLocked: true', () =>
            expect(find('firstName').skipIfLexisNexisLocked).toBe(true));
        it('dateOfBirth has skipIfLexisNexisLocked: true', () =>
            expect(find('dateOfBirth').skipIfLexisNexisLocked).toBe(true));
    });

    describe('date / phone / ssn types', () => {
        it('dateOfBirth is type date',    () => expect(find('dateOfBirth').type).toBe('date'));
        it('ssn is type ssn',             () => expect(find('ssn').type).toBe('ssn'));
        it('phone is type phone',         () => expect(find('phone').type).toBe('phone'));
    });

    describe('source mapping spot-checks', () => {
        it('firstName sources from FirstName',   () => expect(find('firstName').source).toBe('FirstName'));
        it('lastName sources from LastName',     () => expect(find('lastName').source).toBe('LastName'));
        it('dateOfBirth sources from DOB',       () => expect(find('dateOfBirth').source).toBe('DOB'));
        it('gender sources from Gender',         () => expect(find('gender').source).toBe('Gender'));
        it('leadChannel sources from LeadSource', () => expect(find('leadChannel').source).toBe('LeadSource'));
        it('address1 sources from Address',      () => expect(find('address1').source).toBe('Address'));
        it('city sources from City',             () => expect(find('city').source).toBe('City'));
        it('county sources from County',         () => expect(find('county').source).toBe('County'));
        it('email sources from Email',           () => expect(find('email').source).toBe('Email'));
        it('phone sources from Phone',           () => expect(find('phone').source).toBe('Phone'));
    });

    describe('getRegistry integration', () => {
        it('returns applicant atoms for applicant-details with no CoApplicant', () => {
            const atoms = getRegistry('applicant-details', { FirstName: 'John' });
            expect(atoms.length).toBe(45);
        });

        it('includes co-applicant atoms when clientData.CoApplicant is present', () => {
            const atoms = getRegistry('applicant-details', {
                FirstName: 'John',
                CoApplicant: { FirstName: 'Jane' },
            });
            expect(atoms.length).toBe(45 + 16);
        });

        it('returns [] for unknown route', () => {
            expect(getRegistry('some-unknown-route')).toEqual([]);
        });

        it('returns [] for phase-2 routes (pending)', () => {
            expect(getRegistry('drivers-compact')).toEqual([]);
            expect(getRegistry('home-dwelling-info')).toEqual([]);
        });
    });
});
