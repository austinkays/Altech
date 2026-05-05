/**
 * @file App.exportClientJsonForFiller tests
 *
 * Pure data-transformation function — maps Altech App.data + App.drivers
 * to the shape python_backend/ezlynx_filler.py expects (TEXT_FIELD_MAP +
 * BASE_DROPDOWN_LABELS keys).
 *
 * Uses the same JSDOM + index.html boot pattern as ezlynx-import.test.js.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

function bootApp() {
    const html = loadHTML(path.join(__dirname, '../index.html'));
    const dom = new JSDOM(html, {
        url: 'http://localhost:8000',
        runScripts: 'dangerously',
        pretendToBeVisual: true,
    });
    const w = dom.window;
    // jsdom doesn't have crypto.subtle — App tolerates absent CryptoHelper.
    return w;
}

describe('App.exportClientJsonForFiller', () => {
    let App;

    beforeAll(() => {
        const win = bootApp();
        App = win.App;
        expect(typeof App.exportClientJsonForFiller).toBe('function');
    });

    test('maps core identity fields to filler keys', () => {
        App.data = {
            firstName: 'Jane',
            lastName:  'Doe',
            middleName: 'Q',
            dob: '1990-05-12',
            email: 'jane@example.com',
            phone: '5555551234',
        };
        App.drivers = [];

        const out = App.exportClientJsonForFiller();
        expect(out.FirstName).toBe('Jane');
        expect(out.LastName).toBe('Doe');
        expect(out.MiddleName).toBe('Q');
        // DOB converted from YYYY-MM-DD (Altech storage) to MM/DD/YYYY
        // (the format EZLynx's date inputs accept). See export function.
        expect(out.DOB).toBe('05/12/1990');
        expect(out.Email).toBe('jane@example.com');
        expect(out.Phone).toBe('5555551234');
    });

    test('converts DOB from YYYY-MM-DD to MM/DD/YYYY', () => {
        App.data = { dob: '2002-09-28' };
        App.drivers = [];
        expect(App.exportClientJsonForFiller().DOB).toBe('09/28/2002');
    });

    test('passes DOB through unchanged when not in YYYY-MM-DD form', () => {
        // Belt-and-suspenders for legacy data that's already MM/DD/YYYY,
        // or partial values. Don't break what's already correct.
        App.data = { dob: '09/28/2002' };
        App.drivers = [];
        expect(App.exportClientJsonForFiller().DOB).toBe('09/28/2002');
    });

    test('returns empty DOB string when missing', () => {
        App.data = {};
        App.drivers = [];
        expect(App.exportClientJsonForFiller().DOB).toBe('');
    });

    test('maps address fields including County', () => {
        App.data = {
            addrStreet: '123 Main St',
            addrCity:   'Vancouver',
            addrState:  'WA',
            county:     'Clark',
            addrZip:    '98686',
        };
        App.drivers = [];

        const out = App.exportClientJsonForFiller();
        expect(out.Address).toBe('123 Main St');
        expect(out.City).toBe('Vancouver');
        expect(out.State).toBe('WA');
        expect(out.County).toBe('Clark');
        expect(out.Zip).toBe('98686');
    });

    test('passes raw form values for dropdowns (filler expands abbreviations)', () => {
        App.data = {
            gender:        'M',
            maritalStatus: 'Single',
            education:     'BA',
            occupation:    'Agent/Broker',
            industry:      'Insurance',
        };
        App.drivers = [];

        const out = App.exportClientJsonForFiller();
        expect(out.Gender).toBe('M');             // not 'Male' — filler does that
        expect(out.MaritalStatus).toBe('Single');
        expect(out.Education).toBe('BA');         // not 'Bachelors'
        expect(out.Occupation).toBe('Agent/Broker');
        expect(out.Industry).toBe('Insurance');
    });

    test('pulls LicenseNumber + DLState from drivers[0]', () => {
        App.data = {};
        App.drivers = [
            { dlNum: 'DOEJA123XY', dlState: 'WA', dlStatus: 'Valid' },
            { dlNum: 'OTHER456',   dlState: 'OR' },
        ];

        const out = App.exportClientJsonForFiller();
        expect(out.LicenseNumber).toBe('DOEJA123XY');
        expect(out.DLState).toBe('WA');
        expect(out.DLStatus).toBe('Valid');
    });

    test('returns empty strings for missing fields, not undefined', () => {
        App.data = {};
        App.drivers = [];

        const out = App.exportClientJsonForFiller();
        // Filler expects keys to be present so its `if (!value) continue`
        // gate works predictably. Don't return undefined.
        expect(out.FirstName).toBe('');
        expect(out.DOB).toBe('');
        expect(out.County).toBe('');
        expect(out.LicenseNumber).toBe('');
    });

    test('handles missing drivers array gracefully', () => {
        App.data = { firstName: 'Solo' };
        App.drivers = undefined;

        const out = App.exportClientJsonForFiller();
        expect(out.FirstName).toBe('Solo');
        expect(out.LicenseNumber).toBe('');
    });
});

// ─── Wire-format contract ─────────────────────────────────────────────
//
// Lock down EVERY Altech field that's wired to flow through to the
// Python filler. The point: a future change to fields.js or the export
// function won't silently drop or rename a field. If anyone adds a new
// Altech field that should flow to EZLynx, this is where the contract
// gets updated, in the same commit.

describe('App.exportClientJsonForFiller — wire-format contract', () => {
    let App;

    beforeAll(() => {
        const win = (() => {
            const html = loadHTML(path.join(__dirname, '../index.html'));
            const dom = new JSDOM(html, {
                url: 'http://localhost:8000', runScripts: 'dangerously', pretendToBeVisual: true,
            });
            return dom.window;
        })();
        App = win.App;
    });

    test('every wired field flows when present (canonical happy path)', () => {
        App.data = {
            // applicant section (fields.js section: 'applicant')
            prefix: 'Mr.',
            firstName: 'Jane',
            middleName: 'Q',
            lastName: 'Doe',
            suffix: 'Jr.',
            dob: '1985-07-04',
            gender: 'F',
            maritalStatus: 'Married',
            phone: '5551234567',
            email: 'jane@example.com',
            education: 'MA',
            industry: 'Technology',
            occupation: 'Software Engineer',
            // address section
            addrStreet: '456 Oak Ave',
            addrCity: 'Seattle',
            addrState: 'WA',
            addrZip: '98101',
            county: 'King',
            yearsAtAddress: '3',
            monthsAtAddress: '6',
            // previous address subsection (EZLynx surfaces this when
            // tenure is short)
            previousAddrStreet: '789 Pine Ln',
            previousAddrCity:   'Portland',
            previousAddrState:  'OR',
            previousAddrZip:    '97201',
            // auto policy info — only filled on /rating/auto/ pages
            effectiveDate:      '2026-06-01',
            policyTerm:         '12 Month',
            autoPolicyType:     'Standard',
            residenceIs:        'Home (owned)',
            priorCarrier:       'Progressive',
            priorPolicyTerm:    '6 Month',
            priorYears:         '5',
            continuousCoverage: '5+',
            creditCheckAuth:    true,
            liabilityLimits:    '100/300',
            pdLimit:            '100000',
            medPayments:        '5000',
            umpdLimit:          '50000',
            compDeductible:     '500',
            autoDeductible:     '500',
            studentGPA:         '3.7',
        };
        App.drivers = [{
            dlNum: 'DOEJA456XY',
            dlState: 'WA',
            dlStatus: 'Valid',
            // Drivers-page-specific fields (Phase 1: single driver from [0])
            ageLicensed:      '18',
            goodDriver:       'Yes',
            matureDriver:     'Yes',
            licenseSusRev:    'No',
            sr22:             'No',
            fr44:             'No',
            driverEducation:  'Yes',
            relationship:     'Self',
        }];

        // toMatchObject: this test asserts the Phase-1 applicant page
        // contract — every field below MUST equal the listed value. Extra
        // keys (the home/co-app/Drivers[]/Vehicles[] additions) are
        // covered by the "exact key set" test below, which is the
        // single source of truth for the full key list.
        expect(App.exportClientJsonForFiller()).toMatchObject({
            FirstName:       'Jane',
            LastName:        'Doe',
            MiddleName:      'Q',
            DOB:             '07/04/1985',  // converted YYYY-MM-DD → MM/DD/YYYY
            Email:           'jane@example.com',
            Phone:           '5551234567',
            Address:         '456 Oak Ave',
            City:            'Seattle',
            State:           'WA',
            County:          'King',
            Zip:             '98101',
            Gender:          'F',
            MaritalStatus:   'Married',
            Education:       'MA',
            Occupation:      'Software Engineer',
            Industry:        'Technology',
            Prefix:          'Mr.',
            Suffix:          'Jr.',
            LicenseNumber:   'DOEJA456XY',
            DLState:         'WA',
            DLStatus:        'Valid',
            AgeLicensed:      '18',
            GoodDriver:       'Yes',
            MatureDriver:     'Yes',
            LicenseSuspended: 'No',
            SR22Required:     'No',
            FR44Required:     'No',
            DriverEducation:  'Yes',
            Relationship:     'Self',
            YearsAtAddress:  '3',
            MonthsAtAddress: '6',
            PreviousAddress: '789 Pine Ln',
            PreviousCity:    'Portland',
            PreviousState:   'OR',
            PreviousZip:     '97201',
            EffectiveDate:           '06/01/2026',  // converted from YYYY-MM-DD
            PolicyTerm:              '12 Month',
            AutoPolicyType:          'Standard',
            ResidenceIs:             'Home (owned)',
            PriorCarrier:            'Progressive',
            PriorPolicyTerm:         '6 Month',
            PriorYearsWithCarrier:   '5',
            YearsContinuousCoverage: '5+',
            CreditCheckAuth:         'Yes',  // boolean true → 'Yes'
            BodilyInjury:            '100/300',
            PropertyDamage:          '100000',
            MedPaymentsAuto:         '5000',
            UMPD:                    '50000',
            Comprehensive:           '500',
            Collision:               '500',
            StudentGPA:              '3.7',
        });
    });

    test('every wired field defaults to empty string when source is missing', () => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [];
        // No undefined values — keeps the wire format predictable for the
        // Python `if not value: continue` gate. Drivers[] and Vehicles[]
        // arrays are empty arrays (not strings) when nothing's loaded.
        const out = App.exportClientJsonForFiller();
        Object.entries(out).forEach(([k, v]) => {
            if (k === 'Drivers' || k === 'Vehicles') {
                expect(Array.isArray(v)).toBe(true);
                expect(v).toHaveLength(0);
            } else {
                expect(v).toBe('');
            }
        });
    });

    test('exact key set — no extra, no missing', () => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [];
        expect(Object.keys(App.exportClientJsonForFiller()).sort()).toEqual([
            // ── Phase 1 (driver0 + applicant + auto) ──
            'Address', 'AgeLicensed', 'AutoPolicyType', 'BodilyInjury',
            'City', 'Collision', 'Comprehensive', 'ContinuousMonths',
            'County', 'CreditCheckAuth', 'DLState', 'DLStatus', 'DOB',
            'DriverEducation', 'Drivers', 'Education', 'EffectiveDate',
            'Email', 'FR44Required', 'FirstName', 'Gender', 'GoodDriver',
            'Industry', 'LastName', 'LicenseNumber', 'LicenseSuspended',
            'MaritalStatus', 'MatureDriver', 'MedPaymentsAuto',
            'MiddleName', 'MonthsAtAddress', 'MultiPolicy', 'Occupation',
            'Phone', 'PolicyTerm', 'Prefix', 'PreviousAddress',
            'PreviousCity', 'PreviousState', 'PreviousZip',
            'PriorAutoExpiration', 'PriorCarrier', 'PriorLiabilityLimits',
            'PriorMonths', 'PriorPolicyStatus', 'PriorPolicyTerm',
            'PriorYearsWithCarrier', 'PropertyDamage', 'QuoteType',
            'Relationship', 'RentalReimbursement', 'ResidenceIs',
            'SR22Required', 'State', 'StudentGPA', 'Suffix', 'Towing',
            'UIM', 'UM', 'UMPD', 'Vehicles', 'YearsAtAddress',
            'YearsContinuousCoverage', 'Zip',
            // ── Co-applicant block ──
            'CoDOB', 'CoEducation', 'CoEmail', 'CoFirstName',
            'CoGender', 'CoIndustry', 'CoLastName', 'CoMaritalStatus',
            'CoMiddleName', 'CoOccupation', 'CoPhone', 'CoPrefix',
            'CoRelationship', 'CoSuffix',
            // ── Home / dwelling block ──
            'Bedrooms', 'ConstructionStyle', 'Cooling', 'DwellingCoverage',
            'DwellingType', 'DwellingUsage', 'EarthquakeCoverage',
            'EarthquakeDeductible', 'ElectricalYear', 'ExteriorWalls',
            'FireHydrantFeet', 'FireStationDist', 'FloodCoverage',
            'Foundation', 'FullBaths', 'GarageSpaces', 'GarageType',
            'HalfBaths', 'HeatingType', 'HeatingYear', 'HomeDeductible',
            'HomeEffectiveDate', 'HomeLossOfUse', 'HomePersonalProperty',
            'HomePolicyTerm', 'HomePolicyType', 'HomePriorCarrier',
            'HomePriorExp', 'HomePriorLiability', 'HomePriorPolicyTerm',
            'HomePriorYears', 'IncreasedReplacementCost', 'MedicalPayments',
            'Mortgagee', 'NumOccupants', 'NumStories', 'OccupancyType',
            'OtherStructures', 'PersonalLiability', 'PlumbingYear',
            'Pool', 'ProtectionClass', 'RoofShape', 'RoofType', 'RoofYear',
            'SquareFootage', 'WindDeductible', 'YearBuilt',
        ].sort());
    });

    // Field-by-field test: gives a clear failure point when one mapping
    // breaks. The happy-path test above checks them all at once; this
    // one isolates each field so a regression shows the exact name.
    test.each([
        ['firstName',       'Jane',           'FirstName',      'Jane'],
        ['lastName',        'Doe',            'LastName',       'Doe'],
        ['middleName',      'Q',              'MiddleName',     'Q'],
        ['dob',             '1985-07-04',     'DOB',            '07/04/1985'],
        ['email',           'a@b.com',        'Email',          'a@b.com'],
        ['phone',           '5551234567',     'Phone',          '5551234567'],
        ['addrStreet',      '1 Main',         'Address',        '1 Main'],
        ['addrCity',        'Vancouver',      'City',           'Vancouver'],
        ['addrState',       'WA',             'State',          'WA'],
        ['county',          'Clark',          'County',         'Clark'],
        ['addrZip',         '98686',          'Zip',            '98686'],
        ['gender',          'M',              'Gender',         'M'],
        ['maritalStatus',   'Single',         'MaritalStatus',  'Single'],
        ['education',       'BA',             'Education',      'BA'],
        ['occupation',      'Agent/Broker',   'Occupation',     'Agent/Broker'],
        ['industry',        'Insurance',      'Industry',       'Insurance'],
        ['prefix',          'Mr.',            'Prefix',         'Mr.'],
        ['suffix',          'Sr.',            'Suffix',         'Sr.'],
        ['yearsAtAddress',     '5',          'YearsAtAddress',  '5'],
        ['monthsAtAddress',    '6',          'MonthsAtAddress', '6'],
        ['previousAddrStreet', '789 Pine',     'PreviousAddress',         '789 Pine'],
        ['previousAddrCity',   'Portland',     'PreviousCity',            'Portland'],
        ['previousAddrState',  'OR',           'PreviousState',           'OR'],
        ['previousAddrZip',    '97201',        'PreviousZip',             '97201'],
        // auto policy info
        ['effectiveDate',      '2026-06-01',   'EffectiveDate',           '06/01/2026'],
        ['policyTerm',         '12 Month',     'PolicyTerm',              '12 Month'],
        ['autoPolicyType',     'Standard',     'AutoPolicyType',          'Standard'],
        ['residenceIs',        'Home (owned)', 'ResidenceIs',             'Home (owned)'],
        ['priorCarrier',       'Progressive',  'PriorCarrier',            'Progressive'],
        ['priorPolicyTerm',    '6 Month',      'PriorPolicyTerm',         '6 Month'],
        ['priorYears',         '5',            'PriorYearsWithCarrier',   '5'],
        ['continuousCoverage', '5+',           'YearsContinuousCoverage', '5+'],
        ['liabilityLimits',    '100/300',      'BodilyInjury',            '100/300'],
        ['pdLimit',            '100000',       'PropertyDamage',          '100000'],
        ['medPayments',        '5000',         'MedPaymentsAuto',         '5000'],
        ['umpdLimit',          '50000',        'UMPD',                    '50000'],
        ['compDeductible',     '500',          'Comprehensive',           '500'],
        ['autoDeductible',     '500',          'Collision',               '500'],
        ['studentGPA',         '3.7',          'StudentGPA',              '3.7'],
    ])('Altech.%s = %j → filler.%s = %j', (altechKey, value, fillerKey, expected) => {
        App.data = { [altechKey]: value };
        App.drivers = [];
        expect(App.exportClientJsonForFiller()[fillerKey]).toBe(expected);
    });

    test.each([
        ['dlNum',           'PRIMARY1', 'LicenseNumber',    'PRIMARY1'],
        ['dlState',         'WA',       'DLState',          'WA'],
        ['dlStatus',        'Valid',    'DLStatus',         'Valid'],
        // Phase 1 driver fields (single driver from drivers[0])
        ['ageLicensed',     '18',       'AgeLicensed',      '18'],
        ['goodDriver',      'Yes',      'GoodDriver',       'Yes'],
        ['matureDriver',    'Yes',      'MatureDriver',     'Yes'],
        ['licenseSusRev',   'No',       'LicenseSuspended', 'No'],
        ['sr22',            'No',       'SR22Required',     'No'],
        ['fr44',            'No',       'FR44Required',     'No'],
        ['driverEducation', 'Yes',      'DriverEducation',  'Yes'],
        ['relationship',    'Self',     'Relationship',     'Self'],
    ])('drivers[0].%s = %j → filler.%s = %j', (driverKey, value, fillerKey, expected) => {
        App.data = {};
        App.drivers = [{ [driverKey]: value }];
        expect(App.exportClientJsonForFiller()[fillerKey]).toBe(expected);
    });

    test('creditCheckAuth boolean coerces to Yes/No string for EZLynx', () => {
        // Altech stores the credit-check authorization as a checkbox
        // (boolean). EZLynx's dropdown/radio expects a Yes/No string.
        App.data = { creditCheckAuth: true };
        App.drivers = [];
        expect(App.exportClientJsonForFiller().CreditCheckAuth).toBe('Yes');

        App.data = { creditCheckAuth: false };
        expect(App.exportClientJsonForFiller().CreditCheckAuth).toBe('No');

        // Already a string passes through unchanged (legacy data)
        App.data = { creditCheckAuth: 'Yes' };
        expect(App.exportClientJsonForFiller().CreditCheckAuth).toBe('Yes');

        App.data = {};  // missing
        expect(App.exportClientJsonForFiller().CreditCheckAuth).toBe('');
    });

    test('effectiveDate converts YYYY-MM-DD to MM/DD/YYYY (same as DOB)', () => {
        App.data = { effectiveDate: '2026-06-01' };
        App.drivers = [];
        expect(App.exportClientJsonForFiller().EffectiveDate).toBe('06/01/2026');
    });

    test('Phase 2: full Drivers[] array now flows alongside driver0 fields', () => {
        // Wire format keeps the back-compat driver0 keys at the top level
        // (LicenseNumber, GoodDriver, SR22Required, etc.) while *also*
        // emitting a Drivers[] array with every driver. The Python filler
        // can iterate the array on EZLynx's drivers page and still grab
        // the primary off the flat keys for the applicant page.
        App.data = {};
        App.drivers = [
            { firstName: 'Pat', lastName: 'Smith', dob: '1980-01-15', dlNum: 'PRIMARY1', goodDriver: 'Yes', sr22: 'No', isPrimaryApplicant: true },
            { firstName: 'Sam', lastName: 'Smith', dob: '1982-03-04', dlNum: 'SECOND02', goodDriver: 'No',  sr22: 'Yes', isCoApplicant: true, relationship: 'Spouse' },
        ];
        const out = App.exportClientJsonForFiller();
        // Back-compat: driver0 still surfaces at top level.
        expect(out.LicenseNumber).toBe('PRIMARY1');
        expect(out.GoodDriver).toBe('Yes');
        expect(out.SR22Required).toBe('No');
        // New: Drivers[] array carries everyone.
        expect(Array.isArray(out.Drivers)).toBe(true);
        expect(out.Drivers).toHaveLength(2);
        expect(out.Drivers[0].FirstName).toBe('Pat');
        expect(out.Drivers[0].DOB).toBe('01/15/1980');
        expect(out.Drivers[0].LicenseNumber).toBe('PRIMARY1');
        expect(out.Drivers[0].IsPrimaryApplicant).toBe(true);
        expect(out.Drivers[1].FirstName).toBe('Sam');
        expect(out.Drivers[1].LicenseNumber).toBe('SECOND02');
        expect(out.Drivers[1].IsCoApplicant).toBe(true);
        expect(out.Drivers[1].Relationship).toBe('Spouse');
    });

    test('drivers[1+] are ignored on the applicant page (only drivers[0] flows)', () => {
        App.data = {};
        App.drivers = [
            { dlNum: 'PRIMARY1', dlState: 'WA', dlStatus: 'Valid' },
            { dlNum: 'IGNORED2', dlState: 'OR', dlStatus: 'Suspended' },
        ];
        const out = App.exportClientJsonForFiller();
        expect(out.LicenseNumber).toBe('PRIMARY1');
        expect(out.DLState).toBe('WA');
        expect(out.DLStatus).toBe('Valid');
    });

    // Documented gaps — Altech fields that exist but are NOT yet wired.
    // This test never fails; it's a TODO marker that any contributor
    // checking "is X wired?" finds in one place.
    test('documented gaps (Altech collects, filler does NOT yet receive)', () => {
        // Still deliberately not wired:
        //
        //   primaryHomeAddr / primaryHomeCity / primaryHomeState / primaryHomeZip
        //     EZLynx's applicant page handles mailing-vs-residence via a
        //     single Address Type selector on one address (Home / Mailing
        //     / Office / Billing / Seasonal). Filling a SECOND address
        //     block requires clicking "Add address" + setting the type
        //     before filling — out of scope for applicant-page automation.
        //     The primary address fields above already cover the common case.
        //
        // Adding any of these to the export requires:
        //   1. New line in exportClientJsonForFiller
        //   2. TEXT_FIELD_MAP / dropdown entry in ezlynx_filler.py with
        //      ID-anchored selectors that don't collide with primary
        //   3. Helper to click "Add address" + select the type
        //   4. Happy-path assertion above
        //   5. Remove from this list
        const NOT_YET_WIRED = [
            'primaryHomeAddr', 'primaryHomeCity', 'primaryHomeState', 'primaryHomeZip',
        ];
        expect(NOT_YET_WIRED.length).toBeGreaterThan(0);
    });

    test('full auto-policy block now flows (Phase 2)', () => {
        // These were previously documented as "out of scope" because the
        // Phase 1 filler only consumed the applicant page. With the round-
        // trip use-case (HawkSoft import → Altech edit → EZLynx export),
        // the filler now needs them: priorExp drives Prior Policy
        // Expiration on the rating form; UM/UIM are real dropdowns on
        // multi-tier carriers; towing/rental are vehicle-level coverages
        // the filler hands to EZLynx's vehicles page; accidents/violations
        // surface on the drivers page.
        App.data = {
            priorExp:           '2026-04-14',
            umLimits:           '100/300',
            uimLimits:          '100/300',
            rentalDeductible:   '30/900',
            towingDeductible:   '100',
        };
        App.drivers = [{ accidents: 'At fault 2023-05', violations: 'Speeding 6-10' }];
        const out = App.exportClientJsonForFiller();
        expect(out.PriorAutoExpiration).toBe('04/14/2026');
        expect(out.UM).toBe('100/300');
        expect(out.UIM).toBe('100/300');
        expect(out.RentalReimbursement).toBe('30/900');
        expect(out.Towing).toBe('100');
        expect(out.Drivers[0].Accidents).toBe('At fault 2023-05');
        expect(out.Drivers[0].Violations).toBe('Speeding 6-10');
    });

    test('full home/dwelling block flows when present', () => {
        App.data = {
            yrBuilt: '1996', dwellingType: 'One Family', sqFt: '2400',
            constructionStyle: 'Frame', protectionClass: '3',
            dwellingCoverage: '387660', otherStructures: '38766',
            homePersonalProperty: '116298', homeLossOfUse: '24',
            roofType: 'Composition', roofYr: '2018',
            heatingType: 'Gas', heatYr: '2010', cooling: 'Central',
            numStories: '2', bedrooms: '4', fullBaths: '2', halfBaths: '1',
            pool: 'No', earthquakeCoverage: 'No',
            homePolicyType: 'HO-3', homeDeductible: '1000',
            personalLiability: '300000', medicalPayments: '1000',
            mortgagee: 'Wells Fargo Home Mortgage',
            homePriorCarrier: 'Other Standard', homePriorYears: '5',
            homePriorExp: '2026-05-20',
        };
        App.drivers = [];
        const out = App.exportClientJsonForFiller();
        expect(out.YearBuilt).toBe('1996');
        expect(out.DwellingType).toBe('One Family');
        expect(out.SquareFootage).toBe('2400');
        expect(out.DwellingCoverage).toBe('387660');
        expect(out.OtherStructures).toBe('38766');
        expect(out.HomePersonalProperty).toBe('116298');
        expect(out.RoofType).toBe('Composition');
        expect(out.HeatingType).toBe('Gas');
        expect(out.HomePolicyType).toBe('HO-3');
        expect(out.HomeDeductible).toBe('1000');
        expect(out.PersonalLiability).toBe('300000');
        expect(out.Mortgagee).toBe('Wells Fargo Home Mortgage');
        expect(out.HomePriorExp).toBe('05/20/2026');
    });

    test('co-applicant block flows when present', () => {
        App.data = {
            coFirstName: 'Rochelle', coLastName: 'Peters',
            coDob: '1981-06-22', coGender: 'F',
            coRelationship: 'Spouse', coMaritalStatus: 'Married',
            coEmail: 'r@example.com', coPhone: '5551112222',
            coOccupation: 'Nurse', coIndustry: 'Medical',
            coEducation: 'Bachelors',
        };
        App.drivers = [];
        const out = App.exportClientJsonForFiller();
        expect(out.CoFirstName).toBe('Rochelle');
        expect(out.CoLastName).toBe('Peters');
        expect(out.CoDOB).toBe('06/22/1981');
        expect(out.CoGender).toBe('F');
        expect(out.CoRelationship).toBe('Spouse');
        expect(out.CoMaritalStatus).toBe('Married');
        expect(out.CoEmail).toBe('r@example.com');
        expect(out.CoOccupation).toBe('Nurse');
    });

    test('multiPolicy + qType flow through to MultiPolicy + QuoteType', () => {
        App.data = { qType: 'both', multiPolicy: 'yes' };
        App.drivers = [];
        const out = App.exportClientJsonForFiller();
        expect(out.QuoteType).toBe('both');
        expect(out.MultiPolicy).toBe('yes');
    });

    test('Vehicles[] array carries every vehicle with use + assignment', () => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [
            { vin: '1HGCM82633A004352', year: '2003', make: 'HONDA', model: 'ACCORD',
              use: 'Pleasure', miles: '5500', antiTheft: 'None', primaryDriver: 'driver_1' },
            { vin: '5FNYG1H4XSB159334', year: '2025', make: 'HONDA', model: 'PILOT',
              use: 'Commute', miles: '12000', primaryDriver: '' },
        ];
        const out = App.exportClientJsonForFiller();
        expect(Array.isArray(out.Vehicles)).toBe(true);
        expect(out.Vehicles).toHaveLength(2);
        expect(out.Vehicles[0].VIN).toBe('1HGCM82633A004352');
        expect(out.Vehicles[0].AnnualMiles).toBe('5500');
        expect(out.Vehicles[0].PrimaryDriver).toBe('driver_1');
        expect(out.Vehicles[1].Use).toBe('Commute');
    });
});
