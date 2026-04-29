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
        };
        App.drivers = [{
            dlNum: 'DOEJA456XY',
            dlState: 'WA',
            dlStatus: 'Valid',
        }];

        // toEqual with a literal object — deliberate, so any new key in
        // the export shows up here as a failure that demands a contract
        // update + a test entry for the new field.
        expect(App.exportClientJsonForFiller()).toEqual({
            FirstName:      'Jane',
            LastName:       'Doe',
            MiddleName:     'Q',
            DOB:            '07/04/1985',  // converted YYYY-MM-DD → MM/DD/YYYY
            Email:          'jane@example.com',
            Phone:          '5551234567',
            Address:        '456 Oak Ave',
            City:           'Seattle',
            State:          'WA',
            County:         'King',
            Zip:            '98101',
            Gender:         'F',
            MaritalStatus:  'Married',
            Education:      'MA',
            Occupation:     'Software Engineer',
            Industry:       'Technology',
            Prefix:         'Mr.',
            Suffix:         'Jr.',
            LicenseNumber:  'DOEJA456XY',
            DLState:        'WA',
            DLStatus:       'Valid',
            YearsAtAddress: '3',
            MonthsAtAddress: '6',
        });
    });

    test('every wired field defaults to empty string when source is missing', () => {
        App.data = {};
        App.drivers = [];
        // No undefined values — keeps the wire format predictable for the
        // Python `if not value: continue` gate.
        const out = App.exportClientJsonForFiller();
        Object.values(out).forEach(v => expect(v).toBe(''));
    });

    test('exact key set — no extra, no missing', () => {
        App.data = {};
        App.drivers = [];
        expect(Object.keys(App.exportClientJsonForFiller()).sort()).toEqual([
            'Address', 'City', 'County', 'DLState', 'DLStatus', 'DOB',
            'Education', 'Email', 'FirstName', 'Gender', 'Industry',
            'LastName', 'LicenseNumber', 'MaritalStatus', 'MiddleName',
            'MonthsAtAddress', 'Occupation', 'Phone', 'Prefix',
            'State', 'Suffix', 'YearsAtAddress', 'Zip',
        ]);
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
        ['yearsAtAddress',  '5',              'YearsAtAddress', '5'],
        ['monthsAtAddress', '6',              'MonthsAtAddress', '6'],
    ])('Altech.%s = %j → filler.%s = %j', (altechKey, value, fillerKey, expected) => {
        App.data = { [altechKey]: value };
        App.drivers = [];
        expect(App.exportClientJsonForFiller()[fillerKey]).toBe(expected);
    });

    test.each([
        ['dlNum',    'PRIMARY1', 'LicenseNumber', 'PRIMARY1'],
        ['dlState',  'WA',       'DLState',       'WA'],
        ['dlStatus', 'Valid',    'DLStatus',      'Valid'],
    ])('drivers[0].%s = %j → filler.%s = %j', (driverKey, value, fillerKey, expected) => {
        App.data = {};
        App.drivers = [{ [driverKey]: value }];
        expect(App.exportClientJsonForFiller()[fillerKey]).toBe(expected);
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
        const NOT_YET_WIRED = [
            // address section — Previous Address subsection on EZLynx
            'previousAddrStreet', 'previousAddrCity',
            'previousAddrState', 'previousAddrZip',
            // address section — non-resident primary home (rare)
            'primaryHomeAddr', 'primaryHomeCity', 'primaryHomeState',
        ];
        // No assertion — the list itself is the contract. Adding any of
        // these to the export requires (1) a new line in
        // exportClientJsonForFiller, (2) a TEXT_FIELD_MAP/dropdown entry
        // in ezlynx_filler.py, (3) a happy-path assertion above, (4)
        // remove from this list.
        expect(NOT_YET_WIRED.length).toBeGreaterThan(0);
    });
});
