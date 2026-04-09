/**
 * @file EZLynx XML Import Tests
 *
 * Tests the XML → App.data / App.drivers / App.vehicles pipeline added in
 * app-scan.js (importEZLynxXML, _handleEZLynxXMLFile, _applyEZLynxData).
 *
 * Strategy: load full index.html via JSDOM (same as app.test.js) so we get
 * the real production App object with all methods intact. This means the
 * tests exercise the actual _applyEZLynxData code path.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

// ── Shared DOM setup (from app.test.js pattern) ───────────────────────

function createTestDOM() {
    const html = loadHTML(path.join(__dirname, '../index.html'));
    const dom = new JSDOM(html, {
        url: 'http://localhost:8000',
        runScripts: 'dangerously',
        pretendToBeVisual: true
    });
    const window = dom.window;

    // Mock localStorage
    const store = {};
    window.localStorage = {
        data: store,
        getItem(key) { return store[key] || null; },
        setItem(key, val) { store[key] = val; },
        removeItem(key) { delete store[key]; },
        clear() { Object.keys(store).forEach(k => delete store[k]); }
    };

    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
    window.prompt = jest.fn(() => null);
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = jest.fn();
    window.matchMedia = jest.fn().mockImplementation(q => ({
        matches: false, media: q, onchange: null,
        addListener: jest.fn(), removeListener: jest.fn(),
        addEventListener: jest.fn(), removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
    window.scrollTo = jest.fn();
    if (!window.Element.prototype.scrollTo) window.Element.prototype.scrollTo = function() {};
    if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function() {};
    if (!window.navigator.clipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
            value: { writeText: jest.fn(() => Promise.resolve()) },
            writable: true, configurable: true
        });
    }
    if (window.Auth) {
        Object.defineProperty(window.Auth, 'user', {
            get: () => ({ uid: 'test-user', email: 'test@test.com' }),
            configurable: true
        });
        if (!window.Auth.showModal) window.Auth.showModal = jest.fn();
        if (!window.Auth.ready) window.Auth.ready = () => Promise.resolve({ uid: 'test-user', email: 'test@test.com' });
    } else {
        window.Auth = { user: { uid: 'test-user', email: 'test@test.com' }, showModal: jest.fn(), ready: () => Promise.resolve({ uid: 'test-user', email: 'test@test.com' }) };
    }
    window.fetch = jest.fn((url) => {
        if (typeof url === 'string' && url.startsWith('plugins/')) {
            const pluginPath = path.resolve(__dirname, '..', url);
            if (fs.existsSync(pluginPath)) {
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(fs.readFileSync(pluginPath, 'utf8')),
                    json: () => Promise.resolve({})
                });
            }
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
    });

    return { dom, window, document: window.document, App: window.App };
}

// ── Sample XML — structure matching HawkSoft → EZLynx export ──────────
const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
  <Applicant>
    <ApplicantType>Applicant</ApplicantType>
    <PersonalInfo>
      <Name><FirstName>Kristin</FirstName><MiddleName>M</MiddleName><LastName>Buehler</LastName></Name>
      <DOB>1983-04-29</DOB>
      <Gender>Female</Gender>
      <MaritalStatus>Married</MaritalStatus>
      <Relation>Insured</Relation>
    </PersonalInfo>
    <Address>
      <AddressCode>StreetAddress</AddressCode>
      <Addr1><StreetName>Box 813</StreetName><StreetNumber>PO</StreetNumber></Addr1>
      <City>Winthrop</City><StateCode>WA</StateCode><County>Okanogan</County>
      <Zip5>98862</Zip5><Zip4>0813</Zip4>
      <Phone id="0"><PhoneType>Mobile</PhoneType><PhoneNumber>5037192796</PhoneNumber></Phone>
      <Phone id="1"><PhoneType>Mobile</PhoneType><PhoneNumber>3609105026</PhoneNumber></Phone>
      <Email>kristinbuehler23@gmail.com</Email>
    </Address>
  </Applicant>
  <Applicant>
    <ApplicantType>CoApplicant</ApplicantType>
    <PersonalInfo>
      <Name><FirstName>Joshua</FirstName><MiddleName></MiddleName><LastName>Buehler</LastName></Name>
      <DOB>1983-11-28</DOB>
      <Gender>Male</Gender>
      <MaritalStatus>Married</MaritalStatus>
      <Relation>Spouse</Relation>
    </PersonalInfo>
    <Address>
      <AddressCode>StreetAddress</AddressCode>
      <Addr1><StreetName>Box 813</StreetName><StreetNumber>PO</StreetNumber></Addr1>
      <City>Winthrop</City><StateCode>WA</StateCode>
      <Zip5>98862</Zip5>
      <Phone id="0"><PhoneType>Mobile</PhoneType><PhoneNumber>5037192796</PhoneNumber></Phone>
      <Email>kristinbuehler23@gmail.com</Email>
    </Address>
  </Applicant>
  <PriorPolicyInfo>
    <PriorCarrier>Other Standard</PriorCarrier>
    <PriorPolicyTerm>12 Month</PriorPolicyTerm>
    <Expiration>2026-04-14</Expiration>
    <YearsWithPriorCarrier><Years>More than 15</Years></YearsWithPriorCarrier>
  </PriorPolicyInfo>
  <PolicyInfo><PolicyTerm>12 Month</PolicyTerm><Effective>2025-04-14</Effective></PolicyInfo>
  <ResidenceInfo>
    <GarageLocation>
      <Address>
        <AddressCode>StreetAddress</AddressCode>
        <Addr1><StreetName>Hwy 20</StreetName><StreetNumber>1006</StreetNumber></Addr1>
        <City>Vancouver</City><StateCode>WA</StateCode><County>Clark</County>
        <Zip5>98682</Zip5>
      </Address>
    </GarageLocation>
  </ResidenceInfo>
  <Drivers>
    <Driver id="1">
      <Name><FirstName>Kristin</FirstName><LastName>Buehler</LastName></Name>
      <Gender>Female</Gender><DOB>1983-04-29</DOB>
      <DLNumber>BUEHLKM174J9</DLNumber><DLState>WA</DLState>
      <MaritalStatus>Married</MaritalStatus><Relation>Insured</Relation>
      <Rated>Rated</Rated><PrincipalVehicle>2</PrincipalVehicle>
    </Driver>
    <Driver id="2">
      <Name><FirstName>Joshua</FirstName><LastName>Buehler</LastName></Name>
      <Gender>Male</Gender><DOB>1983-11-28</DOB>
      <DLNumber>BUEHLJD177Q8</DLNumber><DLState>WA</DLState>
      <MaritalStatus>Married</MaritalStatus><Relation>Spouse</Relation>
      <Rated>Rated</Rated><PrincipalVehicle>1</PrincipalVehicle>
    </Driver>
  </Drivers>
  <Vehicles>
    <Vehicle id="1">
      <Year>2015</Year><Vin>JYADG24E7FA005208</Vin>
      <Make>YAMAHA</Make><Model>XT250</Model>
    </Vehicle>
    <Vehicle id="2">
      <Year>2022</Year><Vin>VBKXWM236NM374431</Vin>
      <Make>KTM</Make><Model>300 XC-W</Model>
    </Vehicle>
    <Vehicle id="3">
      <Year>2003</Year><Vin>JYAVP11E93A045871</Vin>
      <Make>YAMAHA</Make><Model>XVS1100 V-STAR 1100</Model>
    </Vehicle>
  </Vehicles>
  <VehiclesUse>
    <VehicleUse id="1"><Useage>Pleasure</Useage><PrincipalOperator>2</PrincipalOperator></VehicleUse>
    <VehicleUse id="2"><Useage>Pleasure</Useage><PrincipalOperator>1</PrincipalOperator></VehicleUse>
    <VehicleUse id="3"><Useage>Pleasure</Useage><PrincipalOperator>1</PrincipalOperator></VehicleUse>
  </VehiclesUse>
  <Coverages>
    <GeneralCoverage>
      <BI>250/500</BI><PD>100000</PD><MP>5000</MP>
      <UM>250/500</UM><UIM>250/500</UIM><Multicar>Yes</Multicar>
    </GeneralCoverage>
    <VehicleCoverage id="1">
      <OtherCollisionDeductible>1000</OtherCollisionDeductible>
      <CollisionDeductible>1000</CollisionDeductible>
      <TowingDeductible>No Coverage</TowingDeductible>
      <RentalDeductible>No Coverage</RentalDeductible>
    </VehicleCoverage>
    <VehicleCoverage id="2">
      <OtherCollisionDeductible>1000</OtherCollisionDeductible>
      <CollisionDeductible>1000</CollisionDeductible>
      <TowingDeductible>No Coverage</TowingDeductible>
      <RentalDeductible>No Coverage</RentalDeductible>
    </VehicleCoverage>
    <StateSpecificCoverage>
      <WA-Coverages><WA-UMPD>100000</WA-UMPD><WA-PIP>No Coverage</WA-PIP></WA-Coverages>
    </StateSpecificCoverage>
  </Coverages>
  <VehicleAssignments>
    <VehicleAssignment id="1"><DriverAssignment id="2"/></VehicleAssignment>
    <VehicleAssignment id="2"><DriverAssignment id="1"/></VehicleAssignment>
    <VehicleAssignment id="3"><DriverAssignment id="1"/></VehicleAssignment>
  </VehicleAssignments>
</EZAUTO>`;

// ── Minimal XML with only applicant (no co-app, no vehicles) ──
const MINIMAL_XML = `<?xml version="1.0" encoding="utf-8"?>
<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
  <Applicant>
    <ApplicantType>Applicant</ApplicantType>
    <PersonalInfo>
      <Name><FirstName>Jane</FirstName><LastName>Doe</LastName></Name>
      <DOB>1990-01-15</DOB><Gender>Female</Gender>
      <MaritalStatus>Single</MaritalStatus>
    </PersonalInfo>
    <Address><Email>jane@test.com</Email></Address>
  </Applicant>
</EZAUTO>`;

// ── Tests ──────────────────────────────────────────────────────────────

describe('EZLynx XML Import', () => {
    let App, window, dom;

    beforeAll(() => {
        const env = createTestDOM();
        dom = env.dom;
        window = env.window;
        App = env.App;
    });

    afterAll(() => { dom.window.close(); });

    // Helper: parse XML using the test DOM's DOMParser
    function parseXML(xmlStr) {
        const parser = new window.DOMParser();
        return parser.parseFromString(xmlStr, 'text/xml');
    }

    // Reset App state before each test
    beforeEach(() => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [];
    });

    describe('_ezTag helper', () => {
        test('extracts text from namespaced element', () => {
            const doc = parseXML(SAMPLE_XML);
            const apps = App._ezAll(doc, 'Applicant');
            expect(apps.length).toBe(2);
            expect(App._ezTag(apps[0], 'ApplicantType')).toBe('Applicant');
        });

        test('returns empty string for missing element', () => {
            const doc = parseXML(SAMPLE_XML);
            expect(App._ezTag(doc, 'NonExistentTag')).toBe('');
        });

        test('returns empty string for null parent', () => {
            expect(App._ezTag(null, 'Anything')).toBe('');
        });
    });

    describe('_ezAll helper', () => {
        test('returns array of matching elements', () => {
            const doc = parseXML(SAMPLE_XML);
            const drivers = App._ezAll(doc, 'Driver');
            expect(drivers.length).toBe(2);
        });

        test('returns empty array for null parent', () => {
            expect(App._ezAll(null, 'Anything')).toEqual([]);
        });
    });

    describe('_applyEZLynxData — Full XML', () => {
        beforeEach(() => {
            App.data = {};
            App.drivers = [];
            App.vehicles = [];
            const doc = parseXML(SAMPLE_XML);
            App._applyEZLynxData(doc);
        });

        // ── Primary Applicant ──
        test('maps primary applicant name', () => {
            expect(App.data.firstName).toBe('Kristin');
            expect(App.data.lastName).toBe('Buehler');
        });

        test('maps primary applicant DOB', () => {
            expect(App.data.dob).toBe('1983-04-29');
        });

        test('maps primary applicant gender (Female → F)', () => {
            expect(App.data.gender).toBe('F');
        });

        test('maps primary applicant marital status', () => {
            expect(App.data.maritalStatus).toBe('Married');
        });

        test('maps primary applicant email', () => {
            expect(App.data.email).toBe('kristinbuehler23@gmail.com');
        });

        test('maps primary applicant phone (first phone entry)', () => {
            expect(App.data.phone).toBe('5037192796');
        });

        // ── Co-Applicant ──
        test('maps co-applicant name', () => {
            expect(App.data.coFirstName).toBe('Joshua');
            expect(App.data.coLastName).toBe('Buehler');
        });

        test('maps co-applicant DOB', () => {
            expect(App.data.coDob).toBe('1983-11-28');
        });

        test('maps co-applicant gender (Male → M)', () => {
            expect(App.data.coGender).toBe('M');
        });

        test('maps co-applicant relationship', () => {
            expect(App.data.coRelationship).toBe('Spouse');
        });

        // ── Address (GarageLocation) ──
        test('maps garage address street (StreetNumber + StreetName)', () => {
            expect(App.data.addrStreet).toBe('1006 Hwy 20');
        });

        test('maps garage address city', () => {
            expect(App.data.addrCity).toBe('Vancouver');
        });

        test('maps garage address state', () => {
            expect(App.data.addrState).toBe('WA');
        });

        test('maps garage address zip', () => {
            expect(App.data.addrZip).toBe('98682');
        });

        test('maps garage address county', () => {
            expect(App.data.county).toBe('Clark');
        });

        // ── Prior Policy ──
        test('maps prior carrier', () => {
            expect(App.data.priorCarrier).toBe('Other Standard');
        });

        test('maps prior policy term', () => {
            expect(App.data.priorPolicyTerm).toBe('12 Month');
        });

        test('maps years with prior carrier', () => {
            expect(App.data.priorYears).toBe('More than 15');
        });

        // ── Coverages ──
        test('maps bodily injury limits', () => {
            expect(App.data.liabilityLimits).toBe('250/500');
        });

        test('maps property damage limit', () => {
            expect(App.data.pdLimit).toBe('100000');
        });

        test('maps medical payments', () => {
            expect(App.data.medPayments).toBe('5000');
        });

        test('maps UM limits', () => {
            expect(App.data.umLimits).toBe('250/500');
        });

        test('maps UIM limits', () => {
            expect(App.data.uimLimits).toBe('250/500');
        });

        test('maps comp deductible from first VehicleCoverage', () => {
            expect(App.data.compDeductible).toBe('1000');
        });

        test('maps collision deductible from first VehicleCoverage', () => {
            expect(App.data.autoDeductible).toBe('1000');
        });

        test('maps towing deductible', () => {
            expect(App.data.towingDeductible).toBe('No Coverage');
        });

        test('maps rental deductible', () => {
            expect(App.data.rentalDeductible).toBe('No Coverage');
        });

        test('maps WA UMPD limit', () => {
            expect(App.data.umpdLimit).toBe('100000');
        });

        // ── Drivers ──
        test('creates 2 drivers', () => {
            expect(App.drivers.length).toBe(2);
        });

        test('first driver is primary applicant', () => {
            expect(App.drivers[0].firstName).toBe('Kristin');
            expect(App.drivers[0].lastName).toBe('Buehler');
            expect(App.drivers[0].isPrimaryApplicant).toBe(true);
            expect(App.drivers[0].relationship).toBe('Self');
        });

        test('first driver has DL info', () => {
            expect(App.drivers[0].dlNum).toBe('BUEHLKM174J9');
            expect(App.drivers[0].dlState).toBe('WA');
        });

        test('second driver is spouse/co-applicant', () => {
            expect(App.drivers[1].firstName).toBe('Joshua');
            expect(App.drivers[1].lastName).toBe('Buehler');
            expect(App.drivers[1].isCoApplicant).toBe(true);
            expect(App.drivers[1].relationship).toBe('Spouse');
        });

        test('second driver has DL info', () => {
            expect(App.drivers[1].dlNum).toBe('BUEHLJD177Q8');
            expect(App.drivers[1].dlState).toBe('WA');
        });

        test('drivers have gender mapped', () => {
            expect(App.drivers[0].gender).toBe('F');
            expect(App.drivers[1].gender).toBe('M');
        });

        test('drivers have DOB', () => {
            expect(App.drivers[0].dob).toBe('1983-04-29');
            expect(App.drivers[1].dob).toBe('1983-11-28');
        });

        // ── Vehicles ──
        test('creates 3 vehicles', () => {
            expect(App.vehicles.length).toBe(3);
        });

        test('vehicle 1 data is correct', () => {
            expect(App.vehicles[0].vin).toBe('JYADG24E7FA005208');
            expect(App.vehicles[0].year).toBe('2015');
            expect(App.vehicles[0].make).toBe('YAMAHA');
            expect(App.vehicles[0].model).toBe('XT250');
        });

        test('vehicle 2 data is correct', () => {
            expect(App.vehicles[1].vin).toBe('VBKXWM236NM374431');
            expect(App.vehicles[1].year).toBe('2022');
            expect(App.vehicles[1].make).toBe('KTM');
            expect(App.vehicles[1].model).toBe('300 XC-W');
        });

        test('vehicle 3 data is correct', () => {
            expect(App.vehicles[2].vin).toBe('JYAVP11E93A045871');
            expect(App.vehicles[2].year).toBe('2003');
            expect(App.vehicles[2].make).toBe('YAMAHA');
            expect(App.vehicles[2].model).toBe('XVS1100 V-STAR 1100');
        });

        test('vehicles have Pleasure usage from VehicleUse', () => {
            expect(App.vehicles[0].use).toBe('Pleasure');
            expect(App.vehicles[1].use).toBe('Pleasure');
            expect(App.vehicles[2].use).toBe('Pleasure');
        });

        test('vehicles have driver assignments mapped', () => {
            // Vehicle 1 (XML id=1) assigned to Driver XML id=2 (Joshua)
            // Vehicle 2 (XML id=2) assigned to Driver XML id=1 (Kristin)
            // Vehicle 3 (XML id=3) assigned to Driver XML id=1 (Kristin)
            const kristinId = App.drivers[0].id;
            const joshuaId = App.drivers[1].id;
            expect(App.vehicles[0].primaryDriver).toBe(joshuaId);
            expect(App.vehicles[1].primaryDriver).toBe(kristinId);
            expect(App.vehicles[2].primaryDriver).toBe(kristinId);
        });

        test('default miles is 12000', () => {
            App.vehicles.forEach(v => expect(v.miles).toBe('12000'));
        });
    });

    describe('_applyEZLynxData — Minimal XML', () => {
        beforeEach(() => {
            App.data = {};
            App.drivers = [];
            App.vehicles = [];
            const doc = parseXML(MINIMAL_XML);
            App._applyEZLynxData(doc);
        });

        test('maps applicant from minimal XML', () => {
            expect(App.data.firstName).toBe('Jane');
            expect(App.data.lastName).toBe('Doe');
            expect(App.data.dob).toBe('1990-01-15');
            expect(App.data.gender).toBe('F');
        });

        test('no co-applicant fields set', () => {
            expect(App.data.coFirstName).toBeUndefined();
            expect(App.data.coLastName).toBeUndefined();
        });

        test('no drivers created', () => {
            expect(App.drivers.length).toBe(0);
        });

        test('no vehicles created', () => {
            expect(App.vehicles.length).toBe(0);
        });

        test('no crash on missing sections', () => {
            expect(App.data.addrStreet).toBeUndefined();
            expect(App.data.liabilityLimits).toBeUndefined();
            expect(App.data.priorCarrier).toBeUndefined();
        });
    });

    describe('_applyEZLynxData — Edge Cases', () => {
        test('handles empty XML root without crashing', () => {
            App.data = {};
            App.drivers = [];
            App.vehicles = [];
            const doc = parseXML('<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200"></EZAUTO>');
            expect(() => App._applyEZLynxData(doc)).not.toThrow();
        });

        test('handles XML without namespace', () => {
            App.data = {};
            App.drivers = [];
            App.vehicles = [];
            const noNsXml = `<EZAUTO>
                <Applicant>
                    <ApplicantType>Applicant</ApplicantType>
                    <PersonalInfo>
                        <Name><FirstName>Test</FirstName><LastName>User</LastName></Name>
                        <DOB>2000-06-15</DOB><Gender>Male</Gender>
                    </PersonalInfo>
                </Applicant>
            </EZAUTO>`;
            const doc = parseXML(noNsXml);
            App._applyEZLynxData(doc);
            expect(App.data.firstName).toBe('Test');
            expect(App.data.lastName).toBe('User');
            expect(App.data.gender).toBe('M');
        });

        test('gender mapping handles unknown values gracefully', () => {
            App.data = {};
            const xml = `<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
                <Applicant>
                    <ApplicantType>Applicant</ApplicantType>
                    <PersonalInfo>
                        <Name><FirstName>Pat</FirstName><LastName>Smith</LastName></Name>
                        <Gender>NonBinary</Gender>
                    </PersonalInfo>
                </Applicant>
            </EZAUTO>`;
            const doc = parseXML(xml);
            App._applyEZLynxData(doc);
            expect(App.data.gender).toBe('NonBinary');
        });

        test('address concatenates StreetNumber and StreetName', () => {
            App.data = {};
            const xml = `<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
                <ResidenceInfo>
                    <GarageLocation>
                        <Address>
                            <Addr1><StreetNumber>42</StreetNumber><StreetName>Maple Dr</StreetName></Addr1>
                            <City>Portland</City><StateCode>OR</StateCode><Zip5>97201</Zip5>
                        </Address>
                    </GarageLocation>
                </ResidenceInfo>
            </EZAUTO>`;
            const doc = parseXML(xml);
            App._applyEZLynxData(doc);
            expect(App.data.addrStreet).toBe('42 Maple Dr');
            expect(App.data.addrCity).toBe('Portland');
            expect(App.data.addrState).toBe('OR');
            expect(App.data.addrZip).toBe('97201');
        });

        test('address with only StreetName (no number)', () => {
            App.data = {};
            const xml = `<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
                <ResidenceInfo>
                    <GarageLocation>
                        <Address><Addr1><StreetName>Rural Route 3</StreetName></Addr1></Address>
                    </GarageLocation>
                </ResidenceInfo>
            </EZAUTO>`;
            const doc = parseXML(xml);
            App._applyEZLynxData(doc);
            expect(App.data.addrStreet).toBe('Rural Route 3');
        });

        test('driver with missing DL defaults dlState to WA', () => {
            App.data = {};
            App.drivers = [];
            const xml = `<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
                <Drivers>
                    <Driver id="1">
                        <Name><FirstName>Alex</FirstName><LastName>Doe</LastName></Name>
                        <DOB>1995-03-20</DOB><Gender>Male</Gender>
                        <Relation>Insured</Relation>
                    </Driver>
                </Drivers>
            </EZAUTO>`;
            const doc = parseXML(xml);
            App._applyEZLynxData(doc);
            expect(App.drivers.length).toBe(1);
            expect(App.drivers[0].dlNum).toBe('');
            expect(App.drivers[0].dlState).toBe('WA');
            expect(App.drivers[0].relationship).toBe('Self');
        });

        test('vehicle without matching VehicleUse defaults to Pleasure', () => {
            App.data = {};
            App.vehicles = [];
            const xml = `<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
                <Vehicles>
                    <Vehicle id="1"><Year>2020</Year><Vin>ABC123</Vin><Make>Toyota</Make><Model>Camry</Model></Vehicle>
                </Vehicles>
            </EZAUTO>`;
            const doc = parseXML(xml);
            App._applyEZLynxData(doc);
            expect(App.vehicles.length).toBe(1);
            expect(App.vehicles[0].use).toBe('Pleasure');
            expect(App.vehicles[0].primaryDriver).toBe('');
        });
    });
});
