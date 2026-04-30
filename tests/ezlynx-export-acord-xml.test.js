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
        expect(content).toContain('<Phone id="0">');  // V200 schema is 0-indexed
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

    test('emits <Useage> typo + PrincipalOperator + miles per VehicleUse', () => {
        // V200 EZAUTO uses the typo <Useage> — schema confirmed via
        // HawkSoft's AJK.xml export. Do NOT correct to <Usage>.
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [{ firstName: 'A', lastName: 'B', dlNum: 'X' }];
        App.vehicles = [
            { vin: 'VIN1', year: '2020', use: 'Commute', oneWayMiles: '14', annualMiles: '7000' },
            { vin: 'VIN2', year: '2018', annualMiles: '10000' },  // no use → defaults to Pleasure
        ];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<VehiclesUse>');
        expect(content).toContain('<VehicleUse id="1">');
        expect(content).toContain('<Useage>Commute</Useage>');
        expect(content).toContain('<OneWayMiles>14</OneWayMiles>');
        expect(content).toContain('<AnnualMiles>7000</AnnualMiles>');
        expect(content).toContain('<PrincipalOperator>1</PrincipalOperator>');
        expect(content).toContain('<VehicleUse id="2">');
        expect(content).toContain('<Useage>Pleasure</Useage>');  // default
        expect(content).not.toContain('<Usage>');  // no corrected spelling
    });

    test('emits self-closing <DriverAssignment id="N"/> in VehicleAssignments', () => {
        // V200 EZAUTO requires the cross-reference — empty <DriverAssignment/>
        // is useless (rating engine doesn't know which driver primarily
        // operates the vehicle). Schema confirmed via HawkSoft AJK.xml.
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [{ firstName: 'A', lastName: 'B', dlNum: 'X' }];
        App.vehicles = [
            { vin: 'VIN1' },
            { vin: 'VIN2', principalOperator: '2' },
        ];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<VehicleAssignment id="1"><DriverAssignment id="1"/></VehicleAssignment>');
        expect(content).toContain('<VehicleAssignment id="2"><DriverAssignment id="2"/></VehicleAssignment>');
        expect(content).not.toContain('<DriverAssignment/>');  // no empty assignments
    });

    test('emits PrincipalVehicle on driver 0 when vehicles exist', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [{ firstName: 'A', lastName: 'B', dlNum: 'X' }];
        App.vehicles = [{ vin: 'VIN1' }];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<PrincipalVehicle>1</PrincipalVehicle>');
    });

    test('omits PrincipalVehicle when no vehicles', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [{ firstName: 'A', lastName: 'B', dlNum: 'X' }];
        App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        expect(content).not.toContain('<PrincipalVehicle>');
    });

    test('computes DateLicensed from DOB + ageLicensed when not stored directly', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [{
            firstName: 'A', lastName: 'B', dob: '1990-05-12',
            ageLicensed: '16', dlNum: 'X',
        }];
        App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        // 1990-05-12 + 16 years = 2006-05-12
        expect(content).toContain('<DateLicensed>2006-05-12</DateLicensed>');
    });

    test('uses dateLicensed directly when stored', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [{
            firstName: 'A', lastName: 'B', dob: '1990-05-12',
            dateLicensed: '2008-01-04', dlNum: 'X',
        }];
        App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<DateLicensed>2008-01-04</DateLicensed>');
    });

    test('emits <StatedAmount> per vehicle when set', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [];
        App.vehicles = [{ vin: 'V1', year: '2020', statedAmount: '30000' }];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<StatedAmount>30000</StatedAmount>');
    });

    // ── EZHOME (V200 EZHOME) — separate schema, separate output ────
    test('Home XML uses <EZHOME> root with correct namespace', () => {
        App.data = { qType: 'home', firstName: 'Jason', lastName: 'Johnston' };
        App.drivers = [];
        App.vehicles = [];
        const { content, filename } = App.buildEZLynxHomeXML();
        expect(content.startsWith('<EZHOME xmlns="http://www.ezlynx.com/XMLSchema/Home/V200">')).toBe(true);
        expect(content.endsWith('</EZHOME>')).toBe(true);
        expect(filename).toMatch(/^EZLynx_Home_Import_Johnston_\d{4}-\d{2}-\d{2}\.xml$/);
    });

    test('Home XML emits <RatingInfo> with all schema-confirmed fields', () => {
        App.data = {
            qType: 'home', firstName: 'A', lastName: 'B',
            yrBuilt: '2006', dwellingType: 'One Family', dwellingUsage: 'Primary',
            occupancyType: 'Owner Occupied', numOccupants: '4',
            fireHydrantFeet: '750', fireStationDist: '2', protectionClass: '5',
            numStories: '2', fullBaths: '2', halfBaths: '1',
            constructionStyle: 'Frame',
            roofType: 'COMPOSITION', roofShape: 'Gable', heatingType: 'Gas',
            roofYr: '2021', heatYr: '2023', plumbYr: '2021', elecYr: '2005',
            sqFt: '2314', purchaseDate: '2022-01-01',
            foundation: 'Basement - Finished',
        };
        App.drivers = [];
        App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<YearBuilt>2006</YearBuilt>');
        expect(content).toContain('<Dwelling>One Family</Dwelling>');
        expect(content).toContain('<NumberOfOccupants>4</NumberOfOccupants>');
        expect(content).toContain('<DwellingUse>Primary</DwellingUse>');
        expect(content).toContain('<DwellingOccupancy>Owner Occupied</DwellingOccupancy>');
        // 750 ft → "601-1000" range per V200 schema convention
        expect(content).toContain('<DistanceToFireHydrant>601-1000</DistanceToFireHydrant>');
        expect(content).toContain('<DistanceToFireStation>2</DistanceToFireStation>');
        // V200 EZHOME uses <ProtectionClass> NOT <ProtectionClassType> — verified
        // against real EZLynx export (Resources/John_Smith_Home.xml).
        expect(content).toContain('<ProtectionClass>5</ProtectionClass>');
        expect(content).not.toContain('<ProtectionClassType>');
        expect(content).toContain('<NumberOfStories>2</NumberOfStories>');
        expect(content).toContain('<NumberOfFullBaths>2</NumberOfFullBaths>');
        expect(content).toContain('<NumberOfHalfBaths>1</NumberOfHalfBaths>');
        expect(content).toContain('<Construction>Frame</Construction>');
        expect(content).toContain('<Structure>Dwelling</Structure>');
        expect(content).toContain('<Roof>COMPOSITION</Roof>');
        expect(content).toContain('<RoofDesign>Gable</RoofDesign>');
        expect(content).toContain('<HeatingType>Gas</HeatingType>');
        expect(content).toContain('<RoofingUpdateYear>2021</RoofingUpdateYear>');
        expect(content).toContain('<HeatingUpdateYear>2023</HeatingUpdateYear>');
        expect(content).toContain('<PlumbingUpdateYear>2021</PlumbingUpdateYear>');
        expect(content).toContain('<ElectricalUpdateYear>2005</ElectricalUpdateYear>');
        expect(content).toContain('<SquareFootage>2314</SquareFootage>');
        expect(content).toContain('<PurchaseDate>2022-01-01</PurchaseDate>');
        expect(content).toContain('<Foundation>Basement - Finished</Foundation>');
        // PurchasePrice was a guess in v1 — not in V200 EZHOME schema.
        expect(content).not.toContain('<PurchasePrice>');
    });

    test('Home XML emits <ReplacementCost> with PersonalLiability/MedicalPayments + <DeductibeInfo> typo preserved', () => {
        // V200 EZHOME schema has a typo — <DeductibeInfo> not <DeductibleInfo>.
        // Verified via real EZLynx export (Resources/John_Smith_Home.xml).
        // DO NOT correct.
        App.data = {
            qType: 'home', firstName: 'A', lastName: 'B',
            dwellingCoverage: '658300', otherStructures: '65830',
            homeLossOfUse: '131660', homePersonalProperty: '329150',
            personalLiability: '300000', medicalPayments: '5000',
            homeDeductible: '1000',
        };
        App.drivers = [];
        App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<ReplacementCost>');
        expect(content).toContain('<Dwelling>658300</Dwelling>');
        expect(content).toContain('<OtherStructures>65830</OtherStructures>');
        expect(content).toContain('<LossOfUse>131660</LossOfUse>');
        expect(content).toContain('<PersonalProperty>329150</PersonalProperty>');
        expect(content).toContain('<PersonalLiability>300000</PersonalLiability>');
        expect(content).toContain('<MedicalPayments>5000</MedicalPayments>');
        // DeductibeInfo nests <Deductible> when value present
        expect(content).toContain('<DeductibeInfo><Deductible>1000</Deductible></DeductibeInfo>');
        expect(content).not.toContain('<DeductibleInfo>');
    });

    test('Home XML emits self-closing <DeductibeInfo/> when no deductible set', () => {
        App.data = { qType: 'home', firstName: 'A', lastName: 'B',
                     dwellingCoverage: '500000' };
        App.drivers = [];
        App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<DeductibeInfo/>');
    });

    test('Home XML maps fireHydrantFeet to range buckets', () => {
        App.data = { qType: 'home', firstName: 'A', lastName: 'B' };
        App.drivers = []; App.vehicles = [];
        // 0-500 → "0-500"
        App.data.fireHydrantFeet = '300';
        expect(App.buildEZLynxHomeXML().content).toContain('<DistanceToFireHydrant>0-500</DistanceToFireHydrant>');
        // 501-600 → "501-600"
        App.data.fireHydrantFeet = '550';
        expect(App.buildEZLynxHomeXML().content).toContain('<DistanceToFireHydrant>501-600</DistanceToFireHydrant>');
        // 601-1000 → "601-1000"
        App.data.fireHydrantFeet = '750';
        expect(App.buildEZLynxHomeXML().content).toContain('<DistanceToFireHydrant>601-1000</DistanceToFireHydrant>');
        // 1001+ → "1001+"
        App.data.fireHydrantFeet = '1500';
        expect(App.buildEZLynxHomeXML().content).toContain('<DistanceToFireHydrant>1001+</DistanceToFireHydrant>');
    });

    test('Home XML uses single Address inside Applicant, no AltDwelling/ResidenceInfo wrapper', () => {
        // Real V200 EZHOME export has only <Applicant><Address>...</Address>
        // — applicant address IS the dwelling location. No AltDwelling
        // (that was a guess) and no ResidenceInfo/GarageLocation
        // (those are the EZAUTO Auto schema).
        App.data = {
            qType: 'home', firstName: 'A', lastName: 'B',
            addrStreet: '3652 P St', addrCity: 'Washougal',
            addrState: 'WA', addrZip: '98671',
        };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<Applicant>');
        expect(content).toContain('<StreetName>P St</StreetName>');
        expect(content).toContain('<StreetNumber>3652</StreetNumber>');
        expect(content).not.toContain('<AltDwelling>');
        expect(content).not.toContain('<ResidenceInfo>');
        expect(content).not.toContain('<GarageLocation>');
    });

    test('Home XML emits <Industry>/<Occupation> at PersonalInfo', () => {
        // Verified accepted by V200 EZHOME via Resources/John_Smith_Home.xml.
        // Now also emitted at the Auto Applicant level in batch-2 attempt
        // (top-level only — see Auto-side test for the per-driver exclusion
        // that prevents the prior PR #58 deserialization regression).
        App.data = {
            qType: 'home', firstName: 'A', lastName: 'B',
            industry: 'Insurance', occupation: 'Agent/Broker',
        };
        App.drivers = []; App.vehicles = [];
        const homeXml = App.buildEZLynxHomeXML().content;
        expect(homeXml).toContain('<Industry>Insurance</Industry>');
        expect(homeXml).toContain('<Occupation>Agent/Broker</Occupation>');
    });

    test('Home XML emits <YearsAtAddress> in Applicant Address', () => {
        App.data = { qType: 'home', firstName: 'A', lastName: 'B', yearsAtAddress: '10' };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<YearsAtAddress>10</YearsAtAddress>');
    });

    test('Home XML emits PolicyInfo with PolicyType/Package/CreditCheckAuth', () => {
        App.data = {
            qType: 'both', firstName: 'A', lastName: 'B',
            homePolicyType: 'HO3', policyTerm: '12 Month',
            effectiveDate: '2026-02-09', creditCheckAuth: 'Yes',
        };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<PolicyType>HO3</PolicyType>');
        expect(content).toContain('<Package>Yes</Package>');
        expect(content).toContain('<CreditCheckAuth>Yes</CreditCheckAuth>');
        expect(content).toContain('<Effective>2026-02-09</Effective>');
    });

    test('Home XML emits YearsWithContinuousCoverage when set', () => {
        App.data = {
            qType: 'home', firstName: 'A', lastName: 'B',
            priorCarrier: 'Nationwide', priorYears: '3',
            continuousCoverage: '5',
        };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<YearsWithPriorCarrier><Years>3</Years></YearsWithPriorCarrier>');
        expect(content).toContain('<YearsWithContinuousCoverage><Years>5</Years></YearsWithContinuousCoverage>');
    });

    test('Home XML emits <GeneralInfo><RatingStateCode> from addrState', () => {
        App.data = { qType: 'home', firstName: 'A', lastName: 'B', addrState: 'WA' };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<GeneralInfo><RatingStateCode>WA</RatingStateCode></GeneralInfo>');
    });

    test('Home XML Endorsements uses BurglarAlarm-only ProtectiveDevices + Sinkhole', () => {
        App.data = { qType: 'home', firstName: 'A', lastName: 'B' };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<ProtectiveDevices><BurglarAlarm>');
        expect(content).toContain('<DeadBolt>No</DeadBolt>');
        expect(content).toContain('<VisibleToNeighbor>No</VisibleToNeighbor>');
        expect(content).toContain('<MannedSecurity>No</MannedSecurity>');
        expect(content).toContain('<Sinkhole><SinkholeCollapse>No</SinkholeCollapse></Sinkhole>');
        // These wrappers from the prior guess are NOT in the real V200 EZHOME schema.
        expect(content).not.toContain('<SmokeDetector>');
        expect(content).not.toContain('<FireExtinguisher>');
        expect(content).not.toContain('<ScheduledPersonalProperty>');
        expect(content).not.toContain('<ReplacementCostDwelling>');
        expect(content).not.toContain('<ReplacementCostContent>');
        expect(content).not.toContain('<LossInfo>');
    });

    test('Auto XML emits <Industry>/<Occupation> at top-level Applicant only', () => {
        // V200 EZHOME-confirmed (real export); cross-ported to V200 EZAUTO
        // at the Applicant PersonalInfo level ONLY. Per-driver Industry/
        // Occupation broke deserialization in PR #58 (commit f92247e); we
        // explicitly do NOT emit them per-driver.
        App.data = {
            firstName: 'Austin', lastName: 'Smith',
            industry: 'Insurance', occupation: 'Agent/Broker',
        };
        App.drivers = [
            { firstName: 'Austin', lastName: 'Smith', dlNum: 'X' },
            { firstName: 'Jane',   lastName: 'Smith', dlNum: 'Y',
              industry: 'Healthcare', occupation: 'Nurse' },
        ];
        App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        // Applicant-level: present
        expect(content).toContain('<Industry>Insurance</Industry>');
        expect(content).toContain('<Occupation>Agent/Broker</Occupation>');
        // Per-driver Industry/Occupation: explicitly NOT emitted
        expect(content).not.toContain('Healthcare');
        expect(content).not.toContain('<Occupation>Nurse</Occupation>');
    });

    test('Auto XML emits <YearsAtAddress> in Applicant Address', () => {
        App.data = {
            firstName: 'A', lastName: 'B',
            addrStreet: '123 Main', addrCity: 'X', addrState: 'WA',
            yearsAtAddress: '7',
        };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<YearsAtAddress>7</YearsAtAddress>');
    });

    test('Auto XML emits <YearsWithContinuousCoverage> in PriorPolicyInfo', () => {
        App.data = {
            firstName: 'A', lastName: 'B',
            priorCarrier: 'Progressive', priorYears: '3',
            continuousCoverage: '5',
        };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<YearsWithPriorCarrier><Years>3</Years></YearsWithPriorCarrier>');
        expect(content).toContain('<YearsWithContinuousCoverage><Years>5</Years></YearsWithContinuousCoverage>');
    });

    test('Auto XML emits <CreditCheckAuth> + <Package> in PolicyInfo', () => {
        App.data = {
            qType: 'both', firstName: 'A', lastName: 'B',
            policyTerm: '6 Month', effectiveDate: '2026-09-13',
            creditCheckAuth: 'Yes',
        };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<CreditCheckAuth>Yes</CreditCheckAuth>');
        expect(content).toContain('<Package>Yes</Package>');

        App.data.qType = 'auto';
        const autoOnly = App.buildEZLynxXML().content;
        expect(autoOnly).toContain('<Package>No</Package>');
    });

    test('Auto XML emits <OwnershipType> per Vehicle when set', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [];
        App.vehicles = [
            { vin: 'V1', year: '2020', ownershipType: 'Owned' },
            { vin: 'V2', year: '2018', ownershipType: 'Leased' },
            { vin: 'V3', year: '2015' },  // no ownershipType — tag omitted
        ];
        const { content } = App.buildEZLynxXML();
        expect(content).toContain('<OwnershipType>Owned</OwnershipType>');
        expect(content).toContain('<OwnershipType>Leased</OwnershipType>');
        // Third vehicle should not have an OwnershipType tag at all
        // (we only emit when set — tagIf semantics)
        const ownershipMatches = content.match(/<OwnershipType>/g) || [];
        expect(ownershipMatches.length).toBe(2);
    });

    test('Home XML sets Multipolicy=Yes when qType is both', () => {
        App.data = { qType: 'both', firstName: 'A', lastName: 'B' };
        App.drivers = []; App.vehicles = [];
        const { content } = App.buildEZLynxHomeXML();
        expect(content).toContain('<Multipolicy>Yes</Multipolicy>');

        App.data.qType = 'home';
        expect(App.buildEZLynxHomeXML().content).toContain('<Multipolicy>No</Multipolicy>');
    });

    test('exportEZLynxXML downloads BOTH files when qType=both', () => {
        // Stub the side-effect methods so jsdom doesn't try to hit the
        // network (logExport in production calls fetch to record an audit
        // entry; toast just renders a notification).
        const downloaded = [];
        const orig = {
            downloadFile: App.downloadFile,
            logExport:    App.logExport,
            toast:        App.toast,
        };
        App.downloadFile = (content, filename) => { downloaded.push(filename); };
        App.logExport = () => {};
        App.toast = () => {};
        try {
            App.data = { qType: 'both', firstName: 'A', lastName: 'B' };
            App.drivers = []; App.vehicles = [];
            App.exportEZLynxXML();
            expect(downloaded.length).toBe(2);
            expect(downloaded.some(f => f.startsWith('EZLynx_Import_'))).toBe(true);
            expect(downloaded.some(f => f.startsWith('EZLynx_Home_Import_'))).toBe(true);
        } finally {
            Object.assign(App, orig);
        }
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
