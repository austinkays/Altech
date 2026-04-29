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
