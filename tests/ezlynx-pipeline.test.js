/**
 * EZLynx Data Pipeline Tests
 *
 * End-to-end verification that ALL intake form data flows correctly through:
 *   App.data → EZLynxTool.loadFromIntake() → EZ form fields → getFormData() → extension
 *
 * Sections:
 *  §1  getFormData() — key mapping via loadDemo() (uses valid select values)
 *  §2  loadFromIntake() → getFormData() round-trip (text + select fields)
 *  §3  Pass-through fields from App.data (not on EZ form)
 *  §4  CoApplicant construction
 *  §5  Multi-driver / multi-vehicle arrays
 *  §6  Incidents array
 *  §7  Date formatting & ZIP truncation
 *  §8  Extension field coverage (content.js mapping completeness)
 *  §9  Driver object field structure
 *  §10 Vehicle object field structure
 *  §11 loadFromIntake() — text input mappings (arbitrary values)
 *  §12 loadFromIntake() — select dropdown mappings (valid values)
 *  §13 Full pipeline end-to-end
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

const ROOT = path.resolve(__dirname, '..');

// ── Shared DOM setup ──

function createTestDOM() {
    const html = loadHTML(path.join(ROOT, 'index.html'));
    const dom = new JSDOM(html, {
        url: 'http://localhost:8000',
        runScripts: 'dangerously',
        pretendToBeVisual: true
    });
    const window = dom.window;

    // Mock browser APIs
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
    window.scrollTo = jest.fn();
    window.matchMedia = jest.fn().mockImplementation(q => ({
        matches: false, media: q, onchange: null,
        addListener: jest.fn(), removeListener: jest.fn(),
        addEventListener: jest.fn(), removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
    if (!window.Element.prototype.scrollTo) window.Element.prototype.scrollTo = function() {};
    if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function() {};
    if (!window.navigator.clipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
            value: { writeText: jest.fn().mockResolvedValue(undefined) },
            writable: true
        });
    }
    window.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    window.EventSource = jest.fn().mockImplementation(() => ({
        close: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(),
        onmessage: null, onerror: null, onopen: null
    }));

    // Mock Auth
    if (window.Auth) {
        Object.defineProperty(window.Auth, 'user', {
            get: () => ({ uid: 'test-user', email: 'test@test.com' }),
            configurable: true
        });
        if (!window.Auth.showModal) window.Auth.showModal = jest.fn();
    } else {
        window.Auth = { user: { uid: 'test-user', email: 'test@test.com' }, showModal: jest.fn() };
    }

    return { dom, window };
}

// ── Full sample client data using VALID select <option> values ──

const FULL_CLIENT = {
    // Personal (Step 1)
    firstName: 'Sarah', lastName: 'Johnson', middleName: 'Marie',
    dob: '1988-05-22', gender: 'F', maritalStatus: 'Married',
    email: 'sarah.johnson@email.com', phone: '3605551234',
    addrStreet: '456 Oak Avenue', addrCity: 'Vancouver', addrState: 'WA',
    addrZip: '98686-1234', county: 'Clark',
    yearsAtAddress: '5', education: 'Bachelors',
    occupation: 'Agent/Broker', industry: 'Insurance',
    prefix: 'Mrs', suffix: 'Jr',
    contactTime: 'Morning', contactMethod: 'Email', referralSource: 'Referral',

    // Auto (Step 2)
    qType: 'both',
    policyTerm: '12 Month', effectiveDate: '2026-04-01',
    priorCarrier: 'State Farm', priorPolicyTerm: '6 Month',
    priorYears: '3', priorLiabilityLimits: '100/300',
    priorExp: '2026-04-01',
    liabilityLimits: '100/300', pdLimit: '100000',
    compDeductible: '500', autoDeductible: '500',
    medPayments: '5000', umpdLimit: '25000',
    uimLimits: '100/300', autoPolicyType: 'Standard',
    continuousCoverage: '5', numOccupants: '3',
    residenceIs: 'Home (owned)', accidents: '0', violations: '0',
    rentalDeductible: '30/900', towingDeductible: '100',
    studentGPA: '3.5',

    // Home (Step 3)
    dwellingUsage: 'Primary', occupancyType: 'Owner Occupied',
    dwellingType: 'One Family', numStories: '2',
    constructionStyle: 'Ranch', exteriorWalls: 'Siding, Vinyl',
    foundation: 'Crawl Space - Enclosed', roofType: 'Architectural Shingles',
    roofShape: 'Gable', roofYr: '2015', heatingType: 'Gas - Forced Air',
    cooling: 'Central Air', burglarAlarm: 'None', fireAlarm: 'Local',
    sprinklers: 'None', protectionClass: '4',
    sqFt: '1800', yrBuilt: '1995', lotSize: '0.25', bedrooms: '3',
    smokeDetector: 'Local', fireHydrantFeet: '1-500',
    fullBaths: '2', halfBaths: '1',
    garageType: 'Attached', garageSpaces: '2', numFireplaces: '1',
    pool: 'No', trampoline: 'No',
    purchaseDate: '2020-06-15',
    secondaryHeating: 'Wood Stove', kitchenQuality: 'Custom',
    sewer: 'Public', waterSource: 'Public',
    flooring: 'Hardwood', fireStationDist: '3',
    tidalWaterDist: '10', heatYr: '2018', plumbYr: '2019',
    elecYr: '2020', roofUpdate: '2015',
    woodStove: 'Yes', dogInfo: 'Lab mix',
    businessOnProperty: 'Yes',

    // Home Coverage (Step 5)
    homePolicyType: 'HO3', homePriorCarrier: 'Safeco',
    homePriorPolicyTerm: '12 Month', homePriorYears: '4',
    homePriorExp: '2026-04-01', homePriorLiability: '300000',
    dwellingCoverage: '350000', personalLiability: '300000',
    medicalPayments: '5000', homeDeductible: '1000',
    theftDeductible: '1000', windDeductible: '2500',
    mortgagee: 'US Bank',

    // Endorsements
    increasedReplacementCost: '25%', ordinanceOrLaw: '10%',
    waterBackup: '5000', lossAssessment: '10000',
    animalLiability: '100000', jewelryLimit: '5000',
    creditCardCoverage: '2500', moldDamage: '10000',
    equipmentBreakdown: 'Yes', serviceLine: 'Yes',
    earthquakeCoverage: 'Yes', earthquakeZone: 'Zone 3',
    earthquakeDeductible: '10%',

    // Additional
    additionalInsureds: 'John Smith',
    coEmail: 'mike@email.com', coPhone: '3605559999',
};

const FULL_DRIVERS = [
    {
        firstName: 'Sarah', lastName: 'Johnson', dob: '1988-05-22',
        gender: 'F', maritalStatus: 'Married', relationship: 'Self',
        occupation: 'Agent/Broker', education: 'Bachelors',
        dlNum: 'JOHNSAB123XY', dlState: 'WA', ageLicensed: '16',
        dlStatus: 'Active', sr22: 'No', fr44: 'No',
        goodDriver: 'Yes', matureDriver: 'No', driverEducation: 'Yes',
        licenseSusRev: 'No', isCoApplicant: false,
    },
    {
        firstName: 'Mike', lastName: 'Johnson', dob: '1986-03-10',
        gender: 'M', maritalStatus: 'Married', relationship: 'Spouse',
        occupation: 'Engineer', education: 'Masters',
        dlNum: 'JOHNSCD456ZW', dlState: 'WA', ageLicensed: '17',
        dlStatus: 'Active', sr22: 'No', fr44: 'No',
        goodDriver: 'Yes', matureDriver: 'No', driverEducation: 'No',
        licenseSusRev: 'No', isCoApplicant: true,
    }
];

const FULL_VEHICLES = [
    {
        vin: '1HGCV1F34LA123456', year: '2020', make: 'Honda', model: 'Accord',
        use: 'Commute', miles: '15000', ownershipType: 'Owned',
        performance: 'Standard', antiTheft: 'Active', passiveRestraints: 'Air Bags Both Sides',
        antiLockBrakes: 'All 4 Wheels', daytimeRunningLights: 'Yes',
        carNew: 'No', telematics: 'No', carPool: 'No', tnc: 'No',
        primaryDriver: 'Sarah Johnson',
        garagingAddr: '456 Oak Avenue', garagingCity: 'Vancouver',
        garagingState: 'WA', garagingZip: '98686-1234',
    },
    {
        vin: '5YJSA1E26MF123789', year: '2021', make: 'Tesla', model: 'Model 3',
        use: 'Pleasure', miles: '8000', ownershipType: 'Leased',
        performance: 'Intermediate', antiTheft: 'None', passiveRestraints: 'Air Bags Driver Only',
        antiLockBrakes: 'All 4 Wheels', daytimeRunningLights: 'Yes',
        carNew: 'No', telematics: 'Yes', carPool: 'No', tnc: 'No',
        primaryDriver: 'Mike Johnson',
        garagingAddr: '456 Oak Avenue', garagingCity: 'Vancouver',
        garagingState: 'WA', garagingZip: '98686',
    }
];

// ═══════════════════════════════════════════════════════════════
// §1  getFormData() — Key Mapping via loadDemo()
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §1 getFormData() key mapping via loadDemo', () => {
    let window, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    test('personal fields from demo', () => {
        EZLynxTool.loadDemo();
        const r = EZLynxTool.getFormData();

        expect(r.FirstName).toBe('Austin');
        expect(r.LastName).toBe('Kays');
        expect(r.DOB).toBe('01/15/1990');
        expect(r.Gender).toBe('Male');
        expect(r.MaritalStatus).toBe('Single');
        expect(r.Email).toBe('austin@example.com');
        expect(r.Phone).toBe('3605551234');
        expect(r.Address).toBe('123 Main St');
        expect(r.City).toBe('Vancouver');
        expect(r.State).toBe('WA');
        expect(r.Zip).toBe('98686');
        expect(r.County).toBe('Clark');
        expect(r.YearsAtAddress).toBe('5');
        expect(r.Education).toBe('Bachelors');
        expect(r.Industry).toBe('Insurance');
        expect(r.Occupation).toBe('Agent/Broker');
        expect(r.LicenseNumber).toBe('KAYSAB123XY');
    });

    test('auto policy fields from demo', () => {
        EZLynxTool.loadDemo();
        const r = EZLynxTool.getFormData();

        expect(r.PolicyTerm).toBe('12 Month');
        expect(r.EffectiveDate).toBe('03/01/2026');
        expect(r.PriorCarrier).toBe('State Farm');
        expect(r.PriorPolicyTerm).toBe('6 Month');
        expect(r.PriorYearsWithCarrier).toBe('3');
        expect(r.BodilyInjury).toBe('100/300');
        expect(r.PropertyDamage).toBe('100000');
        expect(r.Comprehensive).toBe('500');
        expect(r.Collision).toBe('500');
        expect(r.MedPaymentsAuto).toBe('5000');
        expect(r.UMPD).toBe('100000');
        expect(r.PriorLiabilityLimits).toBe('50/100');
        expect(r.YearsContinuousCoverage).toBe('5');
        expect(r.NumResidents).toBe('2');
        expect(r.ResidenceIs).toBe('Home (owned)');
        expect(r.Accidents).toBe('0');
        expect(r.Violations).toBe('0');
    });

    test('driver/vehicle fields from demo', () => {
        EZLynxTool.loadDemo();
        const r = EZLynxTool.getFormData();

        expect(r.DLState).toBe('WA');
        expect(r.AgeLicensed).toBe('16');
        expect(r.VehicleYear).toBe('2022');
        expect(r.VehicleMake).toBe('Honda');
        expect(r.VehicleModel).toBe('Civic');
        expect(r.VehicleUse).toBe('Pleasure');
        expect(r.AnnualMiles).toBe('12000');
        expect(r.OwnershipType).toBe('Owned');
    });

    test('home dwelling fields from demo', () => {
        EZLynxTool.loadDemo();
        const r = EZLynxTool.getFormData();

        expect(r.DwellingUsage).toBe('Primary');
        expect(r.OccupancyType).toBe('Owner Occupied');
        expect(r.DwellingType).toBe('One Family');
        expect(r.NumStories).toBe('2');
        expect(r.ConstructionStyle).toBe('Ranch');
        expect(r.ExteriorWalls).toBe('Siding, Vinyl');
        expect(r.FoundationType).toBe('Crawl Space - Enclosed');
        expect(r.RoofType).toBe('Architectural Shingles');
        expect(r.RoofDesign).toBe('Gable');
        expect(r.RoofYear).toBe('2015');
        expect(r.HeatingType).toBe('Gas - Forced Air');
        expect(r.Cooling).toBe('Central Air');
        expect(r.ProtectionClass).toBe('4');
        expect(r.SqFt).toBe('1800');
        expect(r.YearBuilt).toBe('1995');
    });

    test('home coverage fields from demo', () => {
        EZLynxTool.loadDemo();
        const r = EZLynxTool.getFormData();

        expect(r.HomePolicyType).toBe('HO3');
        expect(r.HomePriorCarrier).toBe('Safeco');
        expect(r.HomePriorPolicyTerm).toBe('12 Month');
        expect(r.HomePriorYears).toBe('4');
        expect(r.HomePriorExp).toBe('03/01/2026');
        expect(r.DwellingCoverage).toBe('350000');
        expect(r.HomePersonalLiability).toBe('300000');
        expect(r.HomeMedicalPayments).toBe('5000');
        expect(r.AllPerilsDeductible).toBe('1000');
        expect(r.TheftDeductible).toBe('1000');
        expect(r.WindDeductible).toBe('1000');
        expect(r.Mortgagee).toBe('US Bank');
    });

    test('empty fields excluded from output', () => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.setField('ezFirstName', 'Test');
        const r = EZLynxTool.getFormData();
        expect(r.FirstName).toBe('Test');
        expect(r.LastName).toBeUndefined();
    });

    test('whitespace-only fields excluded', () => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.setField('ezFirstName', '   ');
        const r = EZLynxTool.getFormData();
        expect(r.FirstName).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════════
// §2  loadFromIntake() → getFormData() round-trip
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §2 loadFromIntake() round-trip', () => {
    let window, App, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    beforeEach(() => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.incidents = [];
    });

    test('personal text fields round-trip', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [...FULL_VEHICLES];
        EZLynxTool.loadFromIntake();
        const out = EZLynxTool.getFormData();

        expect(out.FirstName).toBe('Sarah');
        expect(out.LastName).toBe('Johnson');
        expect(out.MiddleName).toBe('Marie');
        expect(out.DOB).toBe('05/22/1988');
        expect(out.Email).toBe('sarah.johnson@email.com');
        expect(out.Phone).toBe('3605551234');
        expect(out.Address).toBe('456 Oak Avenue');
        expect(out.City).toBe('Vancouver');
        expect(out.Zip).toBe('98686');
        expect(out.County).toBe('Clark');
    });

    test('personal select fields round-trip', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [...FULL_VEHICLES];
        EZLynxTool.loadFromIntake();
        const out = EZLynxTool.getFormData();

        expect(out.Gender).toBe('Female');   // F → Female
        expect(out.MaritalStatus).toBe('Married');
        expect(out.State).toBe('WA');
        expect(out.YearsAtAddress).toBe('5');
        expect(out.Education).toBe('Bachelors');
        expect(out.Industry).toBe('Insurance');
        expect(out.Occupation).toBe('Agent/Broker');
    });

    test('auto policy fields round-trip', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [...FULL_VEHICLES];
        EZLynxTool.loadFromIntake();
        const out = EZLynxTool.getFormData();

        expect(out.PolicyTerm).toBe('12 Month');
        expect(out.EffectiveDate).toBe('04/01/2026');
        expect(out.PriorCarrier).toBe('State Farm');
        expect(out.PriorPolicyTerm).toBe('6 Month');
        expect(out.PriorYearsWithCarrier).toBe('3');
        expect(out.BodilyInjury).toBe('100/300');
        expect(out.PropertyDamage).toBe('100000');
        expect(out.Comprehensive).toBe('500');
        expect(out.Collision).toBe('500');
        expect(out.MedPaymentsAuto).toBe('5000');
        expect(out.UMPD).toBe('25000');
        expect(out.PriorLiabilityLimits).toBe('100/300');
        expect(out.YearsContinuousCoverage).toBe('5');
        expect(out.NumResidents).toBe('3');
        expect(out.ResidenceIs).toBe('Home (owned)');
    });

    test('driver fields round-trip', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [...FULL_VEHICLES];
        EZLynxTool.loadFromIntake();
        const out = EZLynxTool.getFormData();

        expect(out.DLState).toBe('WA');
        expect(out.AgeLicensed).toBe('16');
        expect(out.LicenseNumber).toBe('JOHNSAB123XY');
    });

    test('vehicle fields round-trip', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [...FULL_VEHICLES];
        EZLynxTool.loadFromIntake();
        const out = EZLynxTool.getFormData();

        expect(out.VIN).toBe('1HGCV1F34LA123456');
        expect(out.VehicleYear).toBe('2020');
        expect(out.VehicleMake).toBe('Honda');
        expect(out.VehicleModel).toBe('Accord');
        expect(out.VehicleUse).toBe('Commute');
        expect(out.AnnualMiles).toBe('15000');
        expect(out.OwnershipType).toBe('Owned');
    });

    test('home dwelling fields round-trip', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();
        const out = EZLynxTool.getFormData();

        expect(out.DwellingUsage).toBe('Primary');
        expect(out.OccupancyType).toBe('Owner Occupied');
        expect(out.DwellingType).toBe('One Family');
        expect(out.NumStories).toBe('2');
        expect(out.ConstructionStyle).toBe('Ranch');
        expect(out.ExteriorWalls).toBe('Siding, Vinyl');
        expect(out.FoundationType).toBe('Crawl Space - Enclosed');
        expect(out.RoofType).toBe('Architectural Shingles');
        expect(out.RoofDesign).toBe('Gable');
        expect(out.RoofYear).toBe('2015');
        expect(out.HeatingType).toBe('Gas - Forced Air');
        expect(out.Cooling).toBe('Central Air');
        expect(out.BurglarAlarm).toBe('None');
        expect(out.FireDetection).toBe('Local');
        expect(out.SprinklerSystem).toBe('None');
        expect(out.ProtectionClass).toBe('4');
        expect(out.SqFt).toBe('1800');
        expect(out.YearBuilt).toBe('1995');
        expect(out.LotSize).toBe('0.25');
        expect(out.Bedrooms).toBe('3');
        expect(out.SmokeDetector).toBe('Local');
        expect(out.FeetFromHydrant).toBe('1-500');
        expect(out.NumFullBaths).toBe('2');
        expect(out.NumHalfBaths).toBe('1');
        expect(out.NumOccupants).toBe('3');
        expect(out.GarageType).toBe('Attached');
        expect(out.GarageSpaces).toBe('2');
        expect(out.NumFireplaces).toBe('1');
        expect(out.Pool).toBe('No');
        expect(out.Trampoline).toBe('No');
    });

    test('home coverage fields round-trip', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();
        const out = EZLynxTool.getFormData();

        expect(out.HomePolicyType).toBe('HO3');
        expect(out.HomePriorCarrier).toBe('Safeco');
        expect(out.HomePriorPolicyTerm).toBe('12 Month');
        expect(out.HomePriorYears).toBe('4');
        expect(out.HomePriorExp).toBe('04/01/2026');
        expect(out.DwellingCoverage).toBe('350000');
        expect(out.HomePersonalLiability).toBe('300000');
        expect(out.HomeMedicalPayments).toBe('5000');
        expect(out.AllPerilsDeductible).toBe('1000');
        expect(out.TheftDeductible).toBe('1000');
        expect(out.WindDeductible).toBe('2500');
        expect(out.Mortgagee).toBe('US Bank');
    });
});

// ═══════════════════════════════════════════════════════════════
// §3  Pass-through fields (App.data extras not on EZ form)
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §3 pass-through fields from App.data', () => {
    let window, App, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    beforeEach(() => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.incidents = [];
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [...FULL_VEHICLES];
    });

    test('Prefix and Suffix', () => {
        const out = EZLynxTool.getFormData();
        expect(out.Prefix).toBe('Mrs');
        expect(out.Suffix).toBe('Jr');
    });

    test('auto policy extras', () => {
        const out = EZLynxTool.getFormData();
        expect(out.AutoPolicyType).toBe('Standard');
        expect(out.UMPD_PD).toBe('25000');
        expect(out.UIM).toBe('100/300');
        expect(out.RentalReimbursement).toBe('30/900');
        expect(out.TowingLabor).toBe('100');
        expect(out.StudentGPA).toBe('3.5');
        expect(out.PriorExpiration).toBe('04/01/2026');
    });

    test('home property extras', () => {
        const out = EZLynxTool.getFormData();
        expect(out.PurchaseDate).toBe('06/15/2020');
        expect(out.SecondaryHeating).toBe('Wood Stove');
        expect(out.KitchenQuality).toBe('Custom');
        expect(out.Sewer).toBe('Public');
        expect(out.WaterSource).toBe('Public');
        expect(out.Flooring).toBe('Hardwood');
        expect(out.FireStationDist).toBe('3');
        expect(out.TidalWaterDist).toBe('10');
        expect(out.HeatingUpdateYear).toBe('2018');
        expect(out.PlumbingUpdateYear).toBe('2019');
        expect(out.ElectricalUpdateYear).toBe('2020');
        expect(out.RoofUpdateYear).toBe('2015');
    });

    test('home hazard toggles', () => {
        const out = EZLynxTool.getFormData();
        expect(out.WoodStove).toBe('Yes');
        expect(out.DogOnPremises).toBe('Yes');
        expect(out.BusinessOnPremises).toBe('Yes');
    });

    test('endorsements', () => {
        const out = EZLynxTool.getFormData();
        expect(out.IncreasedReplacementCost).toBe('25%');
        expect(out.OrdinanceOrLaw).toBe('10%');
        expect(out.WaterBackup).toBe('5000');
        expect(out.LossAssessment).toBe('10000');
        expect(out.AnimalLiability).toBe('100000');
        expect(out.JewelryLimit).toBe('5000');
        expect(out.CreditCardCoverage).toBe('2500');
        expect(out.MoldDamage).toBe('10000');
        expect(out.EquipmentBreakdown).toBe('Yes');
        expect(out.ServiceLine).toBe('Yes');
        expect(out.EarthquakeCoverage).toBe('Yes');
        expect(out.EarthquakeZone).toBe('Zone 3');
        expect(out.EarthquakeDeductible).toBe('10%');
    });

    test('contact preferences', () => {
        const out = EZLynxTool.getFormData();
        expect(out.ContactTime).toBe('Morning');
        expect(out.ContactMethod).toBe('Email');
        expect(out.LeadSource).toBe('Referral');
    });

    test('additional insureds', () => {
        const out = EZLynxTool.getFormData();
        expect(out.AdditionalInsureds).toBe('John Smith');
    });

    test('home prior liability', () => {
        const out = EZLynxTool.getFormData();
        expect(out.HomePriorLiability).toBe('300000');
    });
});

// ═══════════════════════════════════════════════════════════════
// §4  CoApplicant construction
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §4 CoApplicant object', () => {
    let window, App, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    beforeEach(() => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.incidents = [];
    });

    test('CoApplicant built from driver with isCoApplicant flag', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [];

        const out = EZLynxTool.getFormData();
        expect(out.CoApplicant).toBeDefined();
        expect(out.CoApplicant.FirstName).toBe('Mike');
        expect(out.CoApplicant.LastName).toBe('Johnson');
        expect(out.CoApplicant.DOB).toBe('03/10/1986');
        expect(out.CoApplicant.Gender).toBe('Male');
        expect(out.CoApplicant.MaritalStatus).toBe('Married');
        expect(out.CoApplicant.Relationship).toBe('Spouse');
        expect(out.CoApplicant.Email).toBe('mike@email.com');
        expect(out.CoApplicant.Phone).toBe('3605559999');
    });

    test('CoApplicant absent when no driver has isCoApplicant', () => {
        App.data = { firstName: 'Test', lastName: 'User' };
        App.drivers = [{ ...FULL_DRIVERS[0], isCoApplicant: false }];
        App.vehicles = [];

        const out = EZLynxTool.getFormData();
        expect(out.CoApplicant).toBeUndefined();
    });

    test('CoApplicant Email/Phone from App.data coEmail/coPhone', () => {
        App.data = { ...FULL_CLIENT, coEmail: 'different@email.com', coPhone: '1112223333' };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [];

        const out = EZLynxTool.getFormData();
        expect(out.CoApplicant.Email).toBe('different@email.com');
        expect(out.CoApplicant.Phone).toBe('1112223333');
    });
});

// ═══════════════════════════════════════════════════════════════
// §5  Multi-driver and multi-vehicle arrays
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §5 Drivers[] and Vehicles[]', () => {
    let window, App, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    beforeEach(() => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.incidents = [];
    });

    test('Drivers array includes all drivers with correct structure', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [];

        const out = EZLynxTool.getFormData();
        expect(out.Drivers).toHaveLength(2);

        const d1 = out.Drivers[0];
        expect(d1.FirstName).toBe('Sarah');
        expect(d1.LastName).toBe('Johnson');
        expect(d1.DOB).toBe('05/22/1988');
        expect(d1.Gender).toBe('Female');
        expect(d1.MaritalStatus).toBe('Married');
        expect(d1.Relationship).toBe('Self');
        expect(d1.LicenseNumber).toBe('JOHNSAB123XY');
        expect(d1.DLState).toBe('WA');
        expect(d1.AgeLicensed).toBe('16');
        expect(d1.LicenseStatus).toBe('Active');
        expect(d1.SR22).toBe('No');
        expect(d1.FR44).toBe('No');
        expect(d1.GoodDriver).toBe('Yes');
        expect(d1.MatureDriver).toBe('No');
        expect(d1.DriverEducation).toBe('Yes');
        expect(d1.LicenseSusRev).toBe('No');
        expect(d1.IsCoApplicant).toBe(false);

        const d2 = out.Drivers[1];
        expect(d2.FirstName).toBe('Mike');
        expect(d2.Gender).toBe('Male');
        expect(d2.IsCoApplicant).toBe(true);
    });

    test('Vehicles array includes all vehicles with correct structure', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [];
        App.vehicles = [...FULL_VEHICLES];

        const out = EZLynxTool.getFormData();
        expect(out.Vehicles).toHaveLength(2);

        const v1 = out.Vehicles[0];
        expect(v1.VIN).toBe('1HGCV1F34LA123456');
        expect(v1.Year).toBe('2020');
        expect(v1.Make).toBe('Honda');
        expect(v1.Model).toBe('Accord');
        expect(v1.Use).toBe('Commute');
        expect(v1.AnnualMiles).toBe('15000');
        expect(v1.Ownership).toBe('Owned');
        expect(v1.Performance).toBe('Standard');
        expect(v1.AntiTheft).toBe('Active');
        expect(v1.PassiveRestraints).toBe('Air Bags Both Sides');
        expect(v1.AntiLockBrakes).toBe('All 4 Wheels');
        expect(v1.DaytimeRunningLights).toBe('Yes');
        expect(v1.NewVehicle).toBe('No');
        expect(v1.Telematics).toBe('No');
        expect(v1.CarPool).toBe('No');
        expect(v1.TNC).toBe('No');
        expect(v1.PrimaryDriver).toBe('Sarah Johnson');
        expect(v1.GaragingAddress).toBe('456 Oak Avenue');
        expect(v1.GaragingCity).toBe('Vancouver');
        expect(v1.GaragingState).toBe('WA');
        expect(v1.GaragingZip).toBe('98686');

        const v2 = out.Vehicles[1];
        expect(v2.VIN).toBe('5YJSA1E26MF123789');
        expect(v2.Ownership).toBe('Leased');
    });

    test('Drivers absent when empty', () => {
        App.data = { firstName: 'Test' };
        App.drivers = [];
        App.vehicles = [];
        expect(EZLynxTool.getFormData().Drivers).toBeUndefined();
    });

    test('Vehicles absent when empty', () => {
        App.data = { firstName: 'Test' };
        App.drivers = [];
        App.vehicles = [];
        expect(EZLynxTool.getFormData().Vehicles).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════════
// §6  Incidents array
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §6 Incidents array', () => {
    let window, App, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    beforeEach(() => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        App.data = {};
        App.drivers = [];
        App.vehicles = [];
    });

    test('Incidents array included when incidents exist', () => {
        EZLynxTool.incidents = [
            { type: 'violation', subtype: 'Speeding', date: '2025-06-15', description: '15 over', amount: '250' },
            { type: 'accident', subtype: 'At Fault', date: '2024-01-10', description: 'Rear-end', amount: '5000' }
        ];

        const out = EZLynxTool.getFormData();
        expect(out.Incidents).toHaveLength(2);
        expect(out.Incidents[0].Type).toBe('violation');
        expect(out.Incidents[0].Subtype).toBe('Speeding');
        expect(out.Incidents[0].Date).toBe('2025-06-15');
        expect(out.Incidents[1].Type).toBe('accident');
        expect(out.Incidents[1].Amount).toBe('5000');
    });

    test('Incidents absent when none', () => {
        EZLynxTool.incidents = [];
        expect(EZLynxTool.getFormData().Incidents).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════════
// §7  Date formatting & ZIP truncation
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §7 date formatting & ZIP', () => {
    let window, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    test('_fmtDateForEZ converts YYYY-MM-DD → MM/DD/YYYY', () => {
        expect(EZLynxTool._fmtDateForEZ('2026-04-01')).toBe('04/01/2026');
        expect(EZLynxTool._fmtDateForEZ('1988-12-25')).toBe('12/25/1988');
    });

    test('_fmtDateForEZ passes through non-ISO dates', () => {
        expect(EZLynxTool._fmtDateForEZ('04/01/2026')).toBe('04/01/2026');
        expect(EZLynxTool._fmtDateForEZ('Jan 1, 2026')).toBe('Jan 1, 2026');
    });

    test('_fmtDateForEZ handles empty/null/undefined', () => {
        expect(EZLynxTool._fmtDateForEZ('')).toBe('');
        expect(EZLynxTool._fmtDateForEZ(null)).toBe('');
        expect(EZLynxTool._fmtDateForEZ(undefined)).toBe('');
    });

    test('ZIP truncated to 5 digits in getFormData', () => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.setField('ezZip', '98686-1234');
        EZLynxTool.setField('ezFirstName', 'Test');
        expect(EZLynxTool.getFormData().Zip).toBe('98686');
    });

    test('ZIP already 5 digits is unchanged', () => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.setField('ezZip', '98686');
        EZLynxTool.setField('ezFirstName', 'Test');
        expect(EZLynxTool.getFormData().Zip).toBe('98686');
    });

    test('Vehicle garaging ZIP truncated to 5 digits', () => {
        const env = createTestDOM();
        const EZ = env.window.EZLynxTool;
        EZ.init();
        env.window.App.data = {};
        env.window.App.drivers = [];
        env.window.App.vehicles = [{ vin: 'TEST', garagingZip: '98686-9999' }];
        expect(EZ.getFormData().Vehicles[0].GaragingZip).toBe('98686');
    });
});

// ═══════════════════════════════════════════════════════════════
// §8  Extension field coverage (content.js)
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §8 extension field coverage', () => {
    const contentJS = fs.readFileSync(path.join(ROOT, 'chrome-extension', 'content.js'), 'utf8');

    function extractObjectKeys(varName) {
        const regex = new RegExp(`const\\s+${varName}\\s*=\\s*\\{([\\s\\S]*?)\\};`, 'm');
        const match = contentJS.match(regex);
        if (!match) return [];
        const keys = [];
        for (const m of match[1].matchAll(/^\s{4}(\w+)\s*:/gm)) {
            keys.push(m[1]);
        }
        return keys;
    }

    const textFieldKeys = [
        ...extractObjectKeys('BASE_TEXT_FIELDS'),
        ...extractObjectKeys('AUTO_TEXT_FIELDS'),
        ...extractObjectKeys('HOME_TEXT_FIELDS'),
    ];
    const dropdownKeys = [
        ...extractObjectKeys('BASE_DROPDOWN_LABELS'),
        ...extractObjectKeys('AUTO_DROPDOWN_LABELS'),
        ...extractObjectKeys('HOME_DROPDOWN_LABELS'),
    ];
    const toggleKeys = (() => {
        const match = contentJS.match(/const\s+TOGGLE_MAP\s*=\s*\{([\s\S]*?)\};/m);
        if (!match) return [];
        return [...match[1].matchAll(/^\s{4}(\w+)\s*:/gm)].map(m => m[1]);
    })();

    const extensionKnownKeys = new Set([...textFieldKeys, ...dropdownKeys, ...toggleKeys]);

    const CORE_KEYS = [
        'FirstName', 'LastName', 'MiddleName', 'DOB', 'Gender', 'MaritalStatus',
        'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'County',
        'YearsAtAddress', 'Education', 'Occupation', 'Industry', 'LicenseNumber',
        'PolicyTerm', 'PriorCarrier', 'PriorPolicyTerm', 'PriorYearsWithCarrier',
        'EffectiveDate', 'BodilyInjury', 'PropertyDamage', 'Comprehensive',
        'Collision', 'MedPaymentsAuto', 'UMPD', 'PriorLiabilityLimits',
        'YearsContinuousCoverage', 'NumResidents', 'ResidenceIs',
        'DLState', 'AgeLicensed',
        'VIN', 'VehicleYear', 'VehicleMake', 'VehicleModel', 'VehicleUse',
        'AnnualMiles', 'OwnershipType',
        'DwellingUsage', 'OccupancyType', 'DwellingType', 'NumStories',
        'ConstructionStyle', 'ExteriorWalls', 'FoundationType', 'RoofType',
        'RoofDesign', 'RoofYear', 'HeatingType', 'Cooling',
        'BurglarAlarm', 'FireDetection', 'SprinklerSystem', 'ProtectionClass',
        'SqFt', 'YearBuilt', 'LotSize', 'Bedrooms',
        'SmokeDetector', 'FeetFromHydrant',
        'NumFullBaths', 'NumHalfBaths', 'NumOccupants',
        'GarageType', 'GarageSpaces', 'NumFireplaces',
        'Pool', 'Trampoline',
        'HomePolicyType', 'HomePriorCarrier', 'HomePriorPolicyTerm',
        'HomePriorYears',
        'DwellingCoverage', 'HomePersonalLiability', 'HomeMedicalPayments',
        'AllPerilsDeductible', 'TheftDeductible', 'WindDeductible', 'Mortgagee',
    ];

    test('every core EZ key has an extension mapping', () => {
        const missing = CORE_KEYS.filter(k => !extensionKnownKeys.has(k));
        expect(missing).toEqual([]);
    });

    test('extension has text field selectors for text-input fields', () => {
        const expected = ['FirstName', 'LastName', 'MiddleName', 'DOB', 'Email', 'Phone',
            'Address', 'City', 'Zip', 'LicenseNumber',
            'VIN', 'VehicleMake', 'VehicleModel', 'AnnualMiles', 'EffectiveDate',
            'SqFt', 'YearBuilt', 'RoofYear', 'PurchaseDate', 'Mortgagee',
            'DwellingCoverage', 'LotSize', 'Bedrooms', 'GarageSpaces', 'NumFireplaces'];
        expect(expected.filter(k => !textFieldKeys.includes(k))).toEqual([]);
    });

    test('extension has dropdown labels for select fields', () => {
        const expected = [
            'Gender', 'MaritalStatus', 'State', 'Education', 'Occupation', 'Industry',
            'County', 'YearsAtAddress',
            'PolicyTerm', 'PriorCarrier', 'PriorPolicyTerm', 'PriorYearsWithCarrier',
            'BodilyInjury', 'PropertyDamage', 'Comprehensive', 'Collision',
            'MedPaymentsAuto', 'UMPD', 'ResidenceIs',
            'DLState', 'AgeLicensed', 'VehicleYear', 'VehicleUse', 'OwnershipType',
            'DwellingUsage', 'OccupancyType', 'DwellingType', 'NumStories',
            'ConstructionStyle', 'ExteriorWalls', 'FoundationType', 'RoofType',
            'RoofDesign', 'HeatingType', 'Cooling',
            'BurglarAlarm', 'FireDetection', 'SprinklerSystem', 'ProtectionClass',
            'SmokeDetector', 'FeetFromHydrant',
            'NumFullBaths', 'NumHalfBaths', 'NumOccupants', 'GarageType',
            'Pool', 'Trampoline',
            'HomePolicyType', 'HomePriorCarrier', 'HomePriorPolicyTerm', 'HomePriorYears',
            'HomePersonalLiability', 'HomeMedicalPayments',
            'AllPerilsDeductible', 'TheftDeductible', 'WindDeductible',
        ];
        expect(expected.filter(k => !dropdownKeys.includes(k))).toEqual([]);
    });

    test('extension has toggle mappings for Yes/No fields', () => {
        const expected = ['Pool', 'Trampoline', 'WoodStove', 'DogOnPremises', 'BusinessOnPremises'];
        expect(expected.filter(k => !toggleKeys.includes(k))).toEqual([]);
    });

    test('Industry fills BEFORE Occupation in DROPDOWN_PRIORITY', () => {
        const m = contentJS.match(/const\s+DROPDOWN_PRIORITY\s*=\s*\[([\s\S]*?)\]/);
        expect(m).not.toBeNull();
        expect(m[1].indexOf("'Industry'")).toBeLessThan(m[1].indexOf("'Occupation'"));
    });

    test('State fills BEFORE County in DROPDOWN_PRIORITY', () => {
        const m = contentJS.match(/const\s+DROPDOWN_PRIORITY\s*=\s*\[([\s\S]*?)\]/);
        expect(m).not.toBeNull();
        expect(m[1].indexOf("'State'")).toBeLessThan(m[1].indexOf("'County'"));
    });

    test('extension handles CoApplicant injection', () => {
        expect(contentJS).toContain('smartData.CoApplicant || clientData.CoApplicant');
        expect(contentJS).toContain('coApp.FirstName');
    });

    test('extension has page-aware field activation', () => {
        expect(contentJS).toContain('function detectPage()');
        expect(contentJS).toContain('function getActiveTextFields()');
        expect(contentJS).toContain('function getActiveDropdowns()');
        expect(contentJS).toContain('AUTO_TEXT_FIELDS');
        expect(contentJS).toContain('HOME_TEXT_FIELDS');
    });

    test('extension has state abbreviation expansion', () => {
        expect(contentJS).toContain("'WA':'Washington'");
        expect(contentJS).toContain("'OR':'Oregon'");
    });

    test('extension has fuzzy matching for dropdowns', () => {
        expect(contentJS).toContain('function bestMatch(');
        expect(contentJS).toContain('function similarity(');
    });
});

// ═══════════════════════════════════════════════════════════════
// §9  Driver object field names
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §9 Driver object fields', () => {
    let window, App, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    test('driver object has all expected keys', () => {
        App.data = {};
        App.drivers = [FULL_DRIVERS[0]];
        App.vehicles = [];

        const driver = EZLynxTool.getFormData().Drivers[0];
        const expected = [
            'FirstName', 'LastName', 'DOB', 'Gender', 'MaritalStatus',
            'Relationship', 'Occupation', 'Education', 'LicenseNumber',
            'DLState', 'AgeLicensed', 'LicenseStatus', 'SR22', 'FR44',
            'GoodDriver', 'MatureDriver', 'DriverEducation', 'LicenseSusRev',
            'IsCoApplicant'
        ];
        for (const key of expected) {
            expect(driver).toHaveProperty(key);
        }
    });

    test('gender M/F expanded to Male/Female', () => {
        App.data = {};
        App.drivers = [
            { ...FULL_DRIVERS[0], gender: 'M' },
            { ...FULL_DRIVERS[1], gender: 'F' },
        ];
        App.vehicles = [];

        const out = EZLynxTool.getFormData();
        expect(out.Drivers[0].Gender).toBe('Male');
        expect(out.Drivers[1].Gender).toBe('Female');
    });
});

// ═══════════════════════════════════════════════════════════════
// §10  Vehicle object field names
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §10 Vehicle object fields', () => {
    let window, App, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    test('vehicle object has all expected keys', () => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [FULL_VEHICLES[0]];

        const vehicle = EZLynxTool.getFormData().Vehicles[0];
        const expected = [
            'VIN', 'Year', 'Make', 'Model', 'Use', 'AnnualMiles', 'Ownership',
            'Performance', 'AntiTheft', 'PassiveRestraints', 'AntiLockBrakes',
            'DaytimeRunningLights', 'NewVehicle', 'Telematics', 'CarPool', 'TNC',
            'PrimaryDriver', 'GaragingAddress', 'GaragingCity', 'GaragingState', 'GaragingZip'
        ];
        for (const key of expected) {
            expect(vehicle).toHaveProperty(key);
        }
    });

    test('Ownership uses ownershipType not ownership', () => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [{ vin: 'TEST', ownershipType: 'Leased', ownership: undefined }];
        expect(EZLynxTool.getFormData().Vehicles[0].Ownership).toBe('Leased');
    });
});

// ═══════════════════════════════════════════════════════════════
// §11  loadFromIntake() — text input mappings (arbitrary values)
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §11 loadFromIntake() text input mappings', () => {
    let window, App, EZLynxTool, document;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        document = window.document;
        EZLynxTool.init();
    });

    beforeEach(() => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.incidents = [];
    });

    // Text inputs accept arbitrary values — test each mapping
    const textMappings = {
        firstName: 'ezFirstName', lastName: 'ezLastName', middleName: 'ezMiddleName',
        email: 'ezEmail', phone: 'ezPhone',
        addrStreet: 'ezAddress', addrCity: 'ezCity',
        county: 'ezCounty',
    };

    test.each(Object.entries(textMappings))(
        'App.data.%s → %s',
        (intakeField, ezField) => {
            App.data = { [intakeField]: 'TestValue_' + intakeField };
            App.drivers = [];
            App.vehicles = [];
            EZLynxTool.loadFromIntake();

            const el = document.getElementById(ezField);
            expect(el).not.toBeNull();
            expect(el.tagName).toBe('INPUT');
            expect(el.value).toBe('TestValue_' + intakeField);
        }
    );

    test('dob maps with YYYY-MM-DD → MM/DD/YYYY formatting', () => {
        App.data = { dob: '1990-01-15' };
        App.drivers = [];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();
        expect(document.getElementById('ezDOB').value).toBe('01/15/1990');
    });

    test('gender M→Male and F→Female for ezGender select', () => {
        App.data = { gender: 'M' };
        App.drivers = [];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();
        expect(document.getElementById('ezGender').value).toBe('Male');

        App.data = { gender: 'F' };
        EZLynxTool.loadFromIntake();
        expect(document.getElementById('ezGender').value).toBe('Female');
    });

    test('driver dlNum → ezLicenseNumber', () => {
        App.data = {};
        App.drivers = [{ dlNum: 'DL123' }];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();
        expect(document.getElementById('ezLicenseNumber').value).toBe('DL123');
    });

    test('driver dlState → ezDLState, ageLicensed → ezAgeLicensed', () => {
        App.data = {};
        App.drivers = [{ dlState: 'OR', ageLicensed: '17' }];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();
        expect(document.getElementById('ezDLState').value).toBe('OR');
        expect(document.getElementById('ezAgeLicensed').value).toBe('17');
    });

    test('vehicle text fields: vin, year, make, model, miles', () => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [{
            vin: 'TESTVIN123', year: '2022', make: 'Ford', model: 'F-150', miles: '20000'
        }];
        EZLynxTool.loadFromIntake();

        expect(document.getElementById('ezVIN').value).toBe('TESTVIN123');
        expect(document.getElementById('ezVehicleYear').value).toBe('2022');
        expect(document.getElementById('ezVehicleMake').value).toBe('Ford');
        expect(document.getElementById('ezVehicleModel').value).toBe('F-150');
        expect(document.getElementById('ezAnnualMiles').value).toBe('20000');
    });

    test('vehicle select fields: use → ezVehicleUse, ownershipType → ezOwnershipType', () => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [{ use: 'Commute', ownershipType: 'Owned' }];
        EZLynxTool.loadFromIntake();

        expect(document.getElementById('ezVehicleUse').value).toBe('Commute');
        expect(document.getElementById('ezOwnershipType').value).toBe('Owned');
    });

    test('numOccupants maps to BOTH ezNumResidents AND ezNumOccupants', () => {
        App.data = { numOccupants: '4' };
        App.drivers = [];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();

        expect(document.getElementById('ezNumResidents').value).toBe('4');
        expect(document.getElementById('ezNumOccupants').value).toBe('4');
    });

    test('ZIP+4 truncated to 5 digits on load', () => {
        App.data = { addrZip: '98686-1234' };
        App.drivers = [];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();
        expect(document.getElementById('ezZip').value).toBe('98686');
    });

    test('occupation populates dynamically after industry is set', () => {
        App.data = { industry: 'Insurance', occupation: 'Agent/Broker' };
        App.drivers = [];
        App.vehicles = [];
        EZLynxTool.loadFromIntake();

        expect(document.getElementById('ezIndustry').value).toBe('Insurance');
        expect(document.getElementById('ezOccupation').value).toBe('Agent/Broker');
    });
});

// ═══════════════════════════════════════════════════════════════
// §12  loadFromIntake() — select dropdown mappings (valid values)
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §12 loadFromIntake() select mappings', () => {
    let window, App, EZLynxTool, document;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        document = window.document;
        EZLynxTool.init();
    });

    beforeEach(() => {
        EZLynxTool.formFields.forEach(id => EZLynxTool.setField(id, ''));
        EZLynxTool.incidents = [];
    });

    // Each entry uses values that exist as <option> in the EZ selects
    const selectMappings = [
        { intake: 'addrState', value: 'WA', ezField: 'ezState' },
        { intake: 'addrState', value: 'OR', ezField: 'ezState' },
        { intake: 'yearsAtAddress', value: '5', ezField: 'ezYearsAtAddress' },
        { intake: 'policyTerm', value: '12 Month', ezField: 'ezPolicyTerm' },
        { intake: 'policyTerm', value: '6 Month', ezField: 'ezPolicyTerm' },
        { intake: 'priorPolicyTerm', value: '6 Month', ezField: 'ezPriorPolicyTerm' },
        { intake: 'liabilityLimits', value: '100/300', ezField: 'ezBodilyInjury' },
        { intake: 'pdLimit', value: '100000', ezField: 'ezPropertyDamage' },
        { intake: 'compDeductible', value: '500', ezField: 'ezComprehensive' },
        { intake: 'autoDeductible', value: '500', ezField: 'ezCollision' },
        { intake: 'medPayments', value: '5000', ezField: 'ezMedPaymentsAuto' },
        { intake: 'priorLiabilityLimits', value: '100/300', ezField: 'ezPriorLiabilityLimits' },
        { intake: 'continuousCoverage', value: '5', ezField: 'ezYearsContinuousCoverage' },
        { intake: 'numOccupants', value: '3', ezField: 'ezNumResidents' },
        { intake: 'residenceIs', value: 'Home (owned)', ezField: 'ezResidenceIs' },
        { intake: 'dwellingUsage', value: 'Primary', ezField: 'ezDwellingUsage' },
        { intake: 'occupancyType', value: 'Owner Occupied', ezField: 'ezOccupancyType' },
        { intake: 'dwellingType', value: 'One Family', ezField: 'ezDwellingType' },
        { intake: 'numStories', value: '2', ezField: 'ezNumStories' },
        { intake: 'constructionStyle', value: 'Ranch', ezField: 'ezConstructionStyle' },
        { intake: 'exteriorWalls', value: 'Siding, Vinyl', ezField: 'ezExteriorWalls' },
        { intake: 'foundation', value: 'Crawl Space - Enclosed', ezField: 'ezFoundationType' },
        { intake: 'roofType', value: 'Architectural Shingles', ezField: 'ezRoofType' },
        { intake: 'roofShape', value: 'Gable', ezField: 'ezRoofDesign' },
        { intake: 'heatingType', value: 'Gas - Forced Air', ezField: 'ezHeatingType' },
        { intake: 'cooling', value: 'Central Air', ezField: 'ezCooling' },
        { intake: 'burglarAlarm', value: 'None', ezField: 'ezBurglarAlarm' },
        { intake: 'fireAlarm', value: 'Local', ezField: 'ezFireDetection' },
        { intake: 'sprinklers', value: 'None', ezField: 'ezSprinklerSystem' },
        { intake: 'protectionClass', value: '4', ezField: 'ezProtectionClass' },
        { intake: 'smokeDetector', value: 'Local', ezField: 'ezSmokeDetector' },
        { intake: 'fireHydrantFeet', value: '1-500', ezField: 'ezFeetFromHydrant' },
        { intake: 'fullBaths', value: '2', ezField: 'ezNumFullBaths' },
        { intake: 'halfBaths', value: '1', ezField: 'ezNumHalfBaths' },
        { intake: 'numOccupants', value: '3', ezField: 'ezNumOccupants' },
        { intake: 'garageType', value: 'Attached', ezField: 'ezGarageType' },
        { intake: 'garageSpaces', value: '2', ezField: 'ezGarageSpaces' },
        { intake: 'numFireplaces', value: '1', ezField: 'ezNumFireplaces' },
        { intake: 'pool', value: 'No', ezField: 'ezPool' },
        { intake: 'trampoline', value: 'No', ezField: 'ezTrampoline' },
        { intake: 'homePolicyType', value: 'HO3', ezField: 'ezHomePolicyType' },
        { intake: 'homePriorPolicyTerm', value: '12 Month', ezField: 'ezHomePriorPolicyTerm' },
        { intake: 'homePriorYears', value: '4', ezField: 'ezHomePriorYears' },
        { intake: 'personalLiability', value: '300000', ezField: 'ezHomePersonalLiability' },
        { intake: 'medicalPayments', value: '5000', ezField: 'ezHomeMedicalPayments' },
        { intake: 'homeDeductible', value: '1000', ezField: 'ezAllPerilsDeductible' },
        { intake: 'theftDeductible', value: '1000', ezField: 'ezTheftDeductible' },
        { intake: 'windDeductible', value: '2500', ezField: 'ezWindDeductible' },
    ];

    test.each(selectMappings)(
        'App.data.$intake=$value → $ezField',
        ({ intake, value, ezField }) => {
            App.data = { [intake]: value };
            App.drivers = [];
            App.vehicles = [];
            EZLynxTool.loadFromIntake();

            const el = document.getElementById(ezField);
            expect(el).not.toBeNull();
            expect(el.value).toBe(value);
        }
    );
});

// ═══════════════════════════════════════════════════════════════
// §13  Full pipeline end-to-end
// ═══════════════════════════════════════════════════════════════

describe('EZLynx Pipeline — §13 full end-to-end', () => {
    let window, App, EZLynxTool;

    beforeAll(() => {
        const env = createTestDOM();
        window = env.window;
        App = window.App;
        EZLynxTool = window.EZLynxTool;
        EZLynxTool.init();
    });

    test('full client data → complete output with all sections', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [...FULL_VEHICLES];
        EZLynxTool.loadFromIntake();

        const out = EZLynxTool.getFormData();

        // Personal
        expect(out.FirstName).toBe('Sarah');
        expect(out.LastName).toBe('Johnson');
        expect(out.State).toBe('WA');
        expect(out.Zip).toBe('98686');
        expect(out.Industry).toBe('Insurance');
        expect(out.Occupation).toBe('Agent/Broker');

        // Pass-throughs
        expect(out.Prefix).toBe('Mrs');
        expect(out.AutoPolicyType).toBe('Standard');
        expect(out.PurchaseDate).toBe('06/15/2020');
        expect(out.WoodStove).toBe('Yes');
        expect(out.DogOnPremises).toBe('Yes');
        expect(out.BusinessOnPremises).toBe('Yes');
        expect(out.EarthquakeCoverage).toBe('Yes');
        expect(out.ContactTime).toBe('Morning');
        expect(out.LeadSource).toBe('Referral');

        // CoApplicant
        expect(out.CoApplicant).toBeDefined();
        expect(out.CoApplicant.FirstName).toBe('Mike');
        expect(out.CoApplicant.Email).toBe('mike@email.com');

        // Multi arrays
        expect(out.Drivers).toHaveLength(2);
        expect(out.Vehicles).toHaveLength(2);

        // Endorsements
        expect(out.EquipmentBreakdown).toBe('Yes');
        expect(out.ServiceLine).toBe('Yes');
        expect(out.MoldDamage).toBe('10000');
    });

    test('field count ≥75 scalar fields', () => {
        App.data = { ...FULL_CLIENT };
        App.drivers = [...FULL_DRIVERS];
        App.vehicles = [...FULL_VEHICLES];
        EZLynxTool.loadFromIntake();

        const out = EZLynxTool.getFormData();
        const scalarKeys = Object.keys(out).filter(k =>
            typeof out[k] === 'string' || typeof out[k] === 'number'
        );
        expect(scalarKeys.length).toBeGreaterThanOrEqual(75);
    });
});
