/**
 * @file Round-trip test — Altech client → EZLynx XML export → re-import
 *
 * Catches lossy mappings the unidirectional tests miss: comma stripping,
 * date format conversions, enum normalization, etc. If a value goes out
 * one shape and comes back another, the round-trip assertion fires.
 *
 * Strategy:
 *   1. Populate a full client (App.data + drivers + vehicles)
 *   2. Export via buildEZLynxXML() / buildEZLynxHomeXML()
 *   3. Wipe App state
 *   4. Re-parse the exported XML via _applyEZLynxData
 *   5. Assert key fields survived the round trip
 */

const { JSDOM } = require('jsdom');
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
    // JSDOM doesn't implement Element.prototype.scrollTo or scrollIntoView,
    // which App.updateUI() calls on the main container during handleType().
    // Same polyfill as ezlynx-import.test.js.
    w.scrollTo = () => {};
    if (!w.Element.prototype.scrollTo) w.Element.prototype.scrollTo = function () {};
    if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};
    return w;
}

describe('EZLynx XML round-trip (export → import)', () => {
    let App, win;

    beforeAll(() => {
        win = bootApp();
        App = win.App;
        expect(typeof App.buildEZLynxXML).toBe('function');
        expect(typeof App.buildEZLynxHomeXML).toBe('function');
        expect(typeof App._applyEZLynxData).toBe('function');
    });

    function parseXml(xmlStr) {
        return new win.DOMParser().parseFromString(xmlStr, 'text/xml');
    }

    test('Auto XML: applicant identity round-trips', () => {
        App.data = {
            qType: 'auto',
            firstName: 'Joshua',
            lastName: 'Peters',
            middleName: 'J',
            dob: '1980-10-18',
            gender: 'M',
            maritalStatus: 'Married',
            email: 'jpeters@example.com',
            phone: '3606351334',
            addrStreet: '18305 SE 19th St',
            addrCity: 'Vancouver',
            addrState: 'WA',
            addrZip: '98683',
            county: 'Clark',
        };
        App.drivers = [];
        App.vehicles = [];

        const xml = App.buildEZLynxXML().content;

        // Wipe and re-import
        App.data = {};
        App.drivers = [];
        App.vehicles = [];
        App._applyEZLynxData(parseXml(xml));

        expect(App.data.firstName).toBe('Joshua');
        expect(App.data.lastName).toBe('Peters');
        expect(App.data.middleName).toBe('J');
        expect(App.data.dob).toBe('1980-10-18');
        expect(App.data.gender).toBe('M');
        expect(App.data.maritalStatus).toBe('Married');
        expect(App.data.email).toBe('jpeters@example.com');
        expect(App.data.phone).toBe('3606351334');
        expect(App.data.addrStreet).toBe('18305 SE 19th St');
        expect(App.data.addrCity).toBe('Vancouver');
        expect(App.data.addrState).toBe('WA');
        expect(App.data.addrZip).toBe('98683');
        expect(App.data.county).toBe('Clark');
    });

    test('Auto XML: co-applicant block round-trips', () => {
        App.data = {
            qType: 'auto',
            firstName: 'Joshua', lastName: 'Peters', dob: '1980-10-18',
            addrStreet: '18305 SE 19th St', addrCity: 'Vancouver',
            addrState: 'WA', addrZip: '98683',
            // co-app
            coFirstName: 'Rochelle',
            coLastName: 'Peters',
            coDob: '1981-06-22',
            coGender: 'F',
            coMaritalStatus: 'Married',
            coRelationship: 'Spouse',
        };
        App.drivers = [];
        App.vehicles = [];

        const xml = App.buildEZLynxXML().content;

        App.data = {}; App.drivers = []; App.vehicles = [];
        App._applyEZLynxData(parseXml(xml));

        expect(App.data.coFirstName).toBe('Rochelle');
        expect(App.data.coLastName).toBe('Peters');
        expect(App.data.coDob).toBe('1981-06-22');
        expect(App.data.coGender).toBe('F');
        expect(App.data.coMaritalStatus).toBe('Married');
        expect(App.data.coRelationship).toBe('Spouse');
    });

    test('Auto XML: prior policy round-trips', () => {
        App.data = {
            qType: 'auto',
            firstName: 'A', lastName: 'B', dob: '1990-01-01',
            addrStreet: '1 Main', addrCity: 'X', addrState: 'WA', addrZip: '98000',
            priorCarrier: 'Other Standard',
            priorPolicyTerm: '6 Month',
            priorYears: 'More than 15',
            priorExp: '2026-06-24',
            policyTerm: '6 Month',
            effectiveDate: '2025-12-24',
        };
        App.drivers = [];
        App.vehicles = [];

        const xml = App.buildEZLynxXML().content;

        App.data = {}; App.drivers = []; App.vehicles = [];
        App._applyEZLynxData(parseXml(xml));

        expect(App.data.priorCarrier).toBe('Other Standard');
        expect(App.data.priorPolicyTerm).toBe('6 Month');
        expect(App.data.priorYears).toBe('More than 15');
        expect(App.data.priorExp).toBe('2026-06-24');
        expect(App.data.policyTerm).toBe('6 Month');
        expect(App.data.effectiveDate).toBe('2025-12-24');
    });

    test('Auto XML: drivers + vehicles + assignments round-trip', () => {
        App.data = {
            qType: 'auto',
            firstName: 'Joshua', lastName: 'Peters', dob: '1980-10-18',
            addrStreet: '1 Main', addrCity: 'X', addrState: 'WA', addrZip: '98000',
        };
        App.drivers = [
            { id: 'd1', firstName: 'Joshua', lastName: 'Peters', dob: '1980-10-18',
              gender: 'M', dlNum: 'WDL652B7623B', dlState: 'WA', maritalStatus: 'Married',
              relationship: 'Self', isPrimaryApplicant: true },
            { id: 'd2', firstName: 'Rochelle', lastName: 'Peters', dob: '1981-06-22',
              gender: 'F', dlNum: 'WDL491B8G93B', dlState: 'WA', maritalStatus: 'Married',
              relationship: 'Spouse', isCoApplicant: true },
        ];
        App.vehicles = [
            { id: 'v1', vin: '19XFC1F39GE210090', year: '2016', make: 'HONDA', model: 'CIVIC EX' },
            { id: 'v2', vin: '2GNALBEK3D6351457', year: '2013', make: 'CHEVROLET', model: 'EQUINOX LS' },
        ];

        const xml = App.buildEZLynxXML().content;

        App.data = {}; App.drivers = []; App.vehicles = [];
        App._applyEZLynxData(parseXml(xml));

        expect(App.drivers).toHaveLength(2);
        expect(App.drivers[0].firstName).toBe('Joshua');
        expect(App.drivers[0].dob).toBe('1980-10-18');
        expect(App.drivers[0].dlNum).toBe('WDL652B7623B');
        expect(App.drivers[1].firstName).toBe('Rochelle');
        expect(App.drivers[1].dob).toBe('1981-06-22');
        expect(App.drivers[1].relationship).toBe('Spouse');

        expect(App.vehicles).toHaveLength(2);
        expect(App.vehicles[0].vin).toBe('19XFC1F39GE210090');
        expect(App.vehicles[0].year).toBe('2016');
        expect(App.vehicles[0].make).toBe('HONDA');
        expect(App.vehicles[1].vin).toBe('2GNALBEK3D6351457');
    });

    test('Home XML: applicant + co-app + prior policy round-trip', () => {
        App.data = {
            qType: 'home',
            firstName: 'Joshua', lastName: 'Peters', dob: '1980-10-18',
            gender: 'M', maritalStatus: 'Married',
            phone: '3606351334', email: 'j@example.com',
            addrStreet: '18305 SE 19th St', addrCity: 'Vancouver',
            addrState: 'WA', addrZip: '98683', county: 'Clark',
            // co-app
            coFirstName: 'Rochelle', coLastName: 'Peters',
            coDob: '1981-06-22', coGender: 'F', coMaritalStatus: 'Married',
            coRelationship: 'Spouse',
            // prior home policy
            homePriorCarrier: 'Other Standard',
            homePriorPolicyTerm: '12 Month',
            homePriorYears: 'More than 15',
            homePriorExp: '2026-05-20',
            homePolicyTerm: '12 Month',
            homeEffectiveDate: '2025-05-20',
        };
        App.drivers = [];
        App.vehicles = [];

        const xml = App.buildEZLynxHomeXML().content;

        // Round-trip via _applyEZLynxData (re-detects EZHOME root)
        App.data = {}; App.drivers = []; App.vehicles = [];
        App._applyEZLynxData(parseXml(xml));

        expect(App.data.firstName).toBe('Joshua');
        expect(App.data.lastName).toBe('Peters');
        expect(App.data.coFirstName).toBe('Rochelle');
        expect(App.data.coLastName).toBe('Peters');
        expect(App.data.coDob).toBe('1981-06-22');
        expect(App.data.coRelationship).toBe('Spouse');
        // Address — comes back via AltDwelling
        expect(App.data.addrStreet).toBe('18305 SE 19th St');
        expect(App.data.addrCity).toBe('Vancouver');
        expect(App.data.addrState).toBe('WA');
        expect(App.data.addrZip).toBe('98683');
        // Prior policy routes to home-prefixed fields when EZHOME imported
        expect(App.data.homePriorCarrier).toBe('Other Standard');
        expect(App.data.homePriorYears).toBe('More than 15');
        expect(App.data.homePriorExp).toBe('2026-05-20');
        expect(App.data.homeEffectiveDate).toBe('2025-05-20');
    });

    test('Home XML: rating info + replacement cost round-trip', () => {
        App.data = {
            qType: 'home',
            firstName: 'A', lastName: 'B',
            addrStreet: '1 Main', addrCity: 'X', addrState: 'WA', addrZip: '98000',
            yrBuilt: '1996',
            dwellingType: 'One Family',
            dwellingUsage: 'Primary',
            constructionStyle: 'Frame',
            protectionClass: '3',
            sqFt: '2400',
            // ReplacementCost (comma-stripping survives round trip)
            dwellingCoverage: '387660',
            otherStructures: '38766',
            homePersonalProperty: '116298',
            homeLossOfUse: '24',
        };
        App.drivers = [];
        App.vehicles = [];

        const xml = App.buildEZLynxHomeXML().content;

        App.data = {}; App.drivers = []; App.vehicles = [];
        App._applyEZLynxData(parseXml(xml));

        expect(App.data.yrBuilt).toBe('1996');
        expect(App.data.dwellingType).toBe('One Family');
        expect(App.data.dwellingUsage).toBe('Primary');
        expect(App.data.constructionStyle).toBe('Frame');
        expect(App.data.protectionClass).toBe('3');
        expect(App.data.sqFt).toBe('2400');
        // The exporter emits these with commas (e.g. "387,660"); the importer
        // strips commas. End-to-end the value must equal what we put in.
        expect(App.data.dwellingCoverage).toBe('387660');
        expect(App.data.otherStructures).toBe('38766');
        expect(App.data.homePersonalProperty).toBe('116298');
        expect(App.data.homeLossOfUse).toBe('24');
    });

    test('Round-trip is idempotent — exporting the imported data produces the same XML', () => {
        App.data = {
            qType: 'auto',
            firstName: 'Pat', lastName: 'Smith', dob: '1985-03-12',
            gender: 'F', maritalStatus: 'Single',
            phone: '5551234567', email: 'pat@example.com',
            addrStreet: '42 Maple Dr', addrCity: 'Portland',
            addrState: 'OR', addrZip: '97201', county: 'Multnomah',
        };
        App.drivers = [];
        App.vehicles = [];

        const xml1 = App.buildEZLynxXML().content;

        App.data = {}; App.drivers = []; App.vehicles = [];
        App._applyEZLynxData(parseXml(xml1));

        const xml2 = App.buildEZLynxXML().content;

        // Both XMLs should be byte-equivalent — anything else means the
        // import/export pair is lossy.
        expect(xml2).toBe(xml1);
    });
});
