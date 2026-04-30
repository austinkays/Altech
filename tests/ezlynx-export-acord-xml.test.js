/**
 * @file ACORD XML emitter contract tests (Build B safety-net path)
 *
 * Pure data-transformation: App.data + drivers + vehicles → EZLynx XML.
 * No DOM, no network. Same JSDOM-load pattern as the other ezlynx tests
 * so we get the real production App object.
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
    return dom.window;
}

describe('App.buildEZLynxXML — ACORD XML emitter', () => {
    let App;

    beforeAll(() => {
        const win = bootApp();
        App = win.App;
        expect(typeof App.buildEZLynxXML).toBe('function');
        expect(typeof App.exportEZLynxXML).toBe('function');
    });

    test('emits well-formed XML with the EZAUTO root + xmlns', () => {
        App.data = { firstName: 'Jane', lastName: 'Doe' };
        App.drivers = [];
        App.vehicles = [];
        const { content, filename, mime } = App.buildEZLynxXML();
        expect(content.startsWith('<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">')).toBe(true);
        expect(content.endsWith('</EZAUTO>')).toBe(true);
        expect(mime).toBe('application/xml;charset=utf-8');
        expect(filename).toMatch(/^EZLynx_Import_Doe_\d{4}-\d{2}-\d{2}\.xml$/);
    });

    test('includes the primary applicant identity + address inside <Applicant>', () => {
        App.data = {
            firstName: 'Jane',
            middleName: 'Q',
            lastName: 'Doe',
            dob: '1985-07-04',
            gender: 'F',
            maritalStatus: 'Married',
            phone: '5551234567',
            email: 'jane@example.com',
            addrStreet: '2705 NW 126th St',
            addrCity: 'Vancouver',
            addrState: 'WA',
            county: 'Clark',
            addrZip: '98685-2003',
        };
        App.drivers = [];
        App.vehicles = [];

        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<ApplicantType>Applicant</ApplicantType>');
        expect(content).toContain('<FirstName>Jane</FirstName>');
        expect(content).toContain('<MiddleName>Q</MiddleName>');
        expect(content).toContain('<LastName>Doe</LastName>');
        expect(content).toContain('<DOB>1985-07-04</DOB>');
        expect(content).toContain('<Gender>Female</Gender>');  // expanded from F
        expect(content).toContain('<MaritalStatus>Married</MaritalStatus>');
        expect(content).toContain('<Relation>Insured</Relation>');
        expect(content).toContain('<StreetNumber>2705</StreetNumber>');
        expect(content).toContain('<StreetName>NW 126th St</StreetName>');
        expect(content).toContain('<City>Vancouver</City>');
        expect(content).toContain('<StateCode>WA</StateCode>');
        expect(content).toContain('<County>Clark</County>');
        expect(content).toContain('<Zip5>98685</Zip5>');
        expect(content).toContain('<Zip4>2003</Zip4>');
        expect(content).toContain('<PhoneNumber>5551234567</PhoneNumber>');
        expect(content).toContain('<Email>jane@example.com</Email>');
    });

    test('expands gender abbreviations (M→Male, F→Female, X→Not Specified)', () => {
        App.drivers = [];
        App.vehicles = [];
        App.data = { firstName: 'A', lastName: 'B', gender: 'M' };
        expect(App.buildEZLynxXML().content).toContain('<Gender>Male</Gender>');
        App.data.gender = 'F';
        expect(App.buildEZLynxXML().content).toContain('<Gender>Female</Gender>');
        App.data.gender = 'X';
        expect(App.buildEZLynxXML().content).toContain('<Gender>Not Specified</Gender>');
    });

    test('passes DOB through unchanged (already YYYY-MM-DD)', () => {
        App.drivers = [];
        App.vehicles = [];
        App.data = { firstName: 'A', lastName: 'B', dob: '2002-09-28' };
        expect(App.buildEZLynxXML().content).toContain('<DOB>2002-09-28</DOB>');
    });

    test('converts MM/DD/YYYY DOB back to ISO for the XML', () => {
        // The wire-format export (Playwright filler) uses MM/DD/YYYY.
        // If a caller pre-converts DOB before passing it in, normalize.
        App.drivers = [];
        App.vehicles = [];
        App.data = { firstName: 'A', lastName: 'B', dob: '09/28/2002' };
        expect(App.buildEZLynxXML().content).toContain('<DOB>2002-09-28</DOB>');
    });

    test('emits drivers with sequential ids and per-driver fields', () => {
        App.data = { firstName: 'Jane', lastName: 'Doe', addrStreet: '1 Main' };
        App.drivers = [
            { firstName: 'Jane', lastName: 'Doe', dob: '1985-07-04', gender: 'F',
              dlNum: 'DOE123', dlState: 'WA', maritalStatus: 'Married',
              goodStudent: 'No', matureDriver: 'Yes', ratedDriver: 'Rated' },
            { firstName: 'John', lastName: 'Doe', dob: '1986-08-15', gender: 'M',
              dlNum: 'DOE456', dlState: 'WA', maritalStatus: 'Married',
              relationship: 'Spouse', ratedDriver: 'Rated' },
        ];
        App.vehicles = [];

        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<Drivers>');
        expect(content).toContain('<Driver id="1">');
        expect(content).toContain('<Driver id="2">');
        expect(content).toContain('<DLNumber>DOE123</DLNumber>');
        expect(content).toContain('<DLNumber>DOE456</DLNumber>');
        // Driver 1 = Insured (auto-tagged), driver 2 = Spouse from data
        expect(content).toContain('<Relation>Insured</Relation>');
        expect(content).toContain('<Relation>Spouse</Relation>');
    });

    test('emits vehicles with VIN + UseVinLookup + per-vehicle id', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [];
        App.vehicles = [
            { vin: '4S4BP61C687301418', year: '2008', make: 'SUBARU',
              model: 'OUTBACK 2.5I', annualMiles: '7500' },
            { vin: '2B5WB35Z1WK158456', year: '1998', make: 'DODGE',
              model: 'RAM WAGON B3500', annualMiles: '12500' },
        ];

        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<Vehicles>');
        expect(content).toContain('<Vehicle id="1">');
        expect(content).toContain('<Vehicle id="2">');
        expect(content).toContain('<UseVinLookup>Yes</UseVinLookup>');
        expect(content).toContain('<Vin>4S4BP61C687301418</Vin>');
        expect(content).toContain('<Make>SUBARU</Make>');
        expect(content).toContain('<Model>OUTBACK 2.5I</Model>');
        expect(content).toContain('<VehicleUse id="1">');
        expect(content).toContain('<AnnualMiles>7500</AnnualMiles>');
    });

    test('emits coverages with general + per-vehicle deductibles + WA state-specific', () => {
        App.data = {
            firstName: 'A', lastName: 'B', addrState: 'WA',
            liabilityLimits: '100/300', pdLimit: '100000',
            umLimits: '100/300', uimLimits: '100/300',
            compDeductible: '500', autoDeductible: '500',
            umpdLimit: '25000', pipLimit: '10000',
        };
        App.drivers = [];
        App.vehicles = [{ vin: 'VIN1', year: '2020' }];

        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<GeneralCoverage>');
        expect(content).toContain('<BI>100/300</BI>');
        expect(content).toContain('<PD>100000</PD>');
        expect(content).toContain('<UM>100/300</UM>');
        expect(content).toContain('<UIM>100/300</UIM>');
        expect(content).toContain('<VehicleCoverage id="1">');
        expect(content).toContain('<OtherCollisionDeductible>500</OtherCollisionDeductible>');
        expect(content).toContain('<CollisionDeductible>500</CollisionDeductible>');
        expect(content).toContain('<StateSpecificCoverage>');
        expect(content).toContain('<WA-Coverages>');
        expect(content).toContain('<WA-UMPD>25000</WA-UMPD>');
        expect(content).toContain('<WA-PIP>10000</WA-PIP>');
    });

    test('flags Multicar=Yes when 2+ vehicles', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [];
        App.vehicles = [{ vin: 'V1' }, { vin: 'V2' }];
        expect(App.buildEZLynxXML().content).toContain('<Multicar>Yes</Multicar>');

        App.vehicles = [{ vin: 'V1' }];
        expect(App.buildEZLynxXML().content).not.toContain('<Multicar>');
    });

    test('emits PriorPolicyInfo only when prior carrier or years present', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [];
        App.vehicles = [];
        // Empty case — no PriorPolicyInfo emitted
        expect(App.buildEZLynxXML().content).not.toContain('<PriorPolicyInfo>');

        App.data.priorCarrier = 'Progressive';
        App.data.priorPolicyTerm = '6 Month';
        App.data.priorYears = '5';
        App.data.priorExp = '2026-03-13';
        const xml = App.buildEZLynxXML().content;
        expect(xml).toContain('<PriorPolicyInfo>');
        expect(xml).toContain('<PriorCarrier>Progressive</PriorCarrier>');
        expect(xml).toContain('<PriorPolicyTerm>6 Month</PriorPolicyTerm>');
        expect(xml).toContain('<Expiration>2026-03-13</Expiration>');
        expect(xml).toContain('<YearsWithPriorCarrier><Years>5</Years></YearsWithPriorCarrier>');
    });

    test('XML-escapes special characters in user data', () => {
        App.data = {
            firstName: 'O\'Reilly & Sons <test>',
            lastName: 'Doe',
            email: 'a&b@example.com',
        };
        App.drivers = [];
        App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<FirstName>O\'Reilly &amp; Sons &lt;test&gt;</FirstName>');
        expect(content).toContain('<Email>a&amp;b@example.com</Email>');
    });

    test('emits PersonalInfo extras (Industry / Occupation / Education / Prefix / Suffix / SSN)', () => {
        // First import test showed Occupation/job didn't populate without these.
        App.data = {
            firstName: 'A', lastName: 'B',
            prefix: 'Mr.', suffix: 'Jr.',
            ssn: '123-45-6789',
            industry: 'Insurance',
            occupation: 'Agent/Broker',
            education: 'Bachelors',
        };
        App.drivers = [];
        App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<Prefix>Mr.</Prefix>');
        expect(content).toContain('<Suffix>Jr.</Suffix>');
        expect(content).toContain('<SSN>123-45-6789</SSN>');
        expect(content).toContain('<Industry>Insurance</Industry>');
        expect(content).toContain('<Occupation>Agent/Broker</Occupation>');
        expect(content).toContain('<Education>Bachelors</Education>');
    });

    test('omits PersonalInfo extras when source data is missing', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [];
        App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        // Don't emit empty optional tags — EZLynx prefers absence
        expect(content).not.toContain('<Industry>');
        expect(content).not.toContain('<Occupation>');
        expect(content).not.toContain('<Prefix>');
    });

    test('emits per-driver Industry/Occupation/Education + driving-history flags', () => {
        // Driver 0 inherits from App.data when not set on driver record.
        App.data = {
            firstName: 'A', lastName: 'B',
            industry: 'Insurance', occupation: 'Agent/Broker', education: 'Bachelors',
        };
        App.drivers = [{
            firstName: 'A', lastName: 'B', dlNum: 'X', dlState: 'WA',
            ageLicensed: '18', goodDriver: 'Yes', matureDriver: 'No',
            licenseSusRev: 'No', sr22: 'No', fr44: 'No',
            driverEducation: 'Yes', studentGPA: '3.7',
        }];
        App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<AgeLicensed>18</AgeLicensed>');
        expect(content).toContain('<Industry>Insurance</Industry>');
        expect(content).toContain('<Occupation>Agent/Broker</Occupation>');
        expect(content).toContain('<Education>Bachelors</Education>');
        expect(content).toContain('<GoodDriver>Yes</GoodDriver>');
        expect(content).toContain('<LicenseSuspended>No</LicenseSuspended>');
        expect(content).toContain('<SR22Required>No</SR22Required>');
        expect(content).toContain('<FR44Required>No</FR44Required>');
        expect(content).toContain('<DriverEducation>Yes</DriverEducation>');
        expect(content).toContain('<StudentGPA>3.7</StudentGPA>');
    });

    test('emits MedPay in GeneralCoverage when set', () => {
        App.data = {
            firstName: 'A', lastName: 'B',
            liabilityLimits: '100/300', medPayments: '5000',
        };
        App.drivers = [];
        App.vehicles = [{ vin: 'V1' }];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<MedPay>5000</MedPay>');
    });

    test('round-trips through DOMParser without errors', () => {
        // Parse the emitted XML to confirm it's actually well-formed.
        // jsdom provides DOMParser globally.
        App.data = {
            firstName: 'Jane', lastName: 'Doe', dob: '1985-07-04',
            addrStreet: '2705 NW 126th St', addrCity: 'Vancouver',
            addrState: 'WA', addrZip: '98685', email: 'j@d.com',
        };
        App.drivers = [{ firstName: 'Jane', lastName: 'Doe', dlNum: 'X' }];
        App.vehicles = [{ vin: 'VIN1', year: '2020', make: 'TOYOTA' }];

        const { content } = App.buildEZLynxXML();
        const win = bootApp();
        const parser = new win.DOMParser();
        const doc = parser.parseFromString(content, 'application/xml');
        const errors = doc.getElementsByTagName('parsererror');
        expect(errors.length).toBe(0);
        expect(doc.documentElement.tagName).toBe('EZAUTO');
    });
});
