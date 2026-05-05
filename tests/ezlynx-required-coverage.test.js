/**
 * @file Wire-format coverage contract for ezlynxRequired fields
 *
 * Every field marked `ezlynxRequired: true` in js/fields.js must have a
 * destination in the EZLynx filler JSON (App.exportClientJsonForFiller).
 * This test parametrizes over the registry so that:
 *
 *   1. Adding a new `ezlynxRequired` field WITHOUT updating either the
 *      filler-key map below or the exporter itself fails the test.
 *
 *   2. Renaming or deleting a wired filler key fails the test.
 *
 * Catches the kind of silent drop fixed in the import/export integrity
 * pass: the producer sets a value in the form, hits Export, and EZLynx
 * gets an empty field on a page that should have been populated.
 *
 * NOT a happy-path test — those live in ezlynx-export-filler.test.js
 * and exercise specific values + format conversions. This is a
 * structural contract: "is the field wired at all?"
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

// Authoritative map: every ezlynxRequired field id in fields.js → its
// expected key in the filler JSON. Adding a new ezlynxRequired field
// requires either:
//   (a) adding it here + wiring it in app-export.js, OR
//   (b) adding it to UNWIRED_INTENTIONAL with a comment explaining why.
// Sentinel value used for the assertion. For date fields the converter
// produces MM/DD/YYYY so we use a year that survives slicing.
const EZLYNX_REQUIRED_TO_FILLER_KEY = {
    // ── Applicant identity ──
    firstName:       'FirstName',
    lastName:        'LastName',
    dob:             'DOB',
    gender:          'Gender',
    maritalStatus:   'MaritalStatus',
    phone:           'Phone',
    industry:        'Industry',
    occupation:      'Occupation',
    // ── Co-applicant ──
    coFirstName:     'CoFirstName',
    coLastName:      'CoLastName',
    coDob:           'CoDOB',
    coGender:        'CoGender',
    coRelationship:  'CoRelationship',
    coOccupation:    'CoOccupation',
    coIndustry:      'CoIndustry',
    coMaritalStatus: 'CoMaritalStatus',
    // ── Address ──
    addrStreet:      'Address',
    addrCity:        'City',
    addrState:       'State',
    addrZip:         'Zip',
    // ── Property ──
    yrBuilt:           'YearBuilt',
    sqFt:              'SquareFootage',
    dwellingType:      'DwellingType',
    dwellingUsage:     'DwellingUsage',
    occupancyType:     'OccupancyType',
    numStories:        'NumStories',
    numOccupants:      'NumOccupants',
    bedrooms:          'Bedrooms',
    fullBaths:         'FullBaths',
    constructionStyle: 'ConstructionStyle',
    exteriorWalls:     'ExteriorWalls',
    foundation:        'Foundation',
    // ── Roof / systems ──
    roofType:          'RoofType',
    roofShape:         'RoofShape',
    roofYr:            'RoofYear',
    heatingType:       'HeatingType',
    heatYr:            'HeatingYear',
    plumbYr:           'PlumbingYear',
    elecYr:            'ElectricalYear',
    // ── Hazards ──
    fireStationDist:   'FireStationDist',
    fireHydrantFeet:   'FireHydrantFeet',
    protectionClass:   'ProtectionClass',
    // ── Home coverage ──
    dwellingCoverage:        'DwellingCoverage',
    personalLiability:       'PersonalLiability',
    medicalPayments:         'MedicalPayments',
    homeDeductible:          'HomeDeductible',
    increasedReplacementCost: 'IncreasedReplacementCost',
    // ── Auto coverage ──
    liabilityLimits:   'BodilyInjury',
    pdLimit:           'PropertyDamage',
    medPayments:       'MedPaymentsAuto',
    umLimits:          'UM',
    uimLimits:         'UIM',
    umpdLimit:         'UMPD',
    compDeductible:    'Comprehensive',
    autoDeductible:    'Collision',
    rentalDeductible:  'RentalReimbursement',
    towingDeductible:  'Towing',
    // ── Policy / prior insurance ──
    policyTerm:        'PolicyTerm',
    effectiveDate:     'EffectiveDate',
    priorCarrier:      'PriorCarrier',
    priorPolicyTerm:   'PriorPolicyTerm',
    priorYears:        'PriorYearsWithCarrier',
    priorMonths:       'PriorMonths',
    priorExp:          'PriorAutoExpiration',
    priorLiabilityLimits: 'PriorLiabilityLimits',
    continuousCoverage: 'YearsContinuousCoverage',
    continuousMonths:  'ContinuousMonths',
    homePriorCarrier:  'HomePriorCarrier',
    homePriorYears:    'HomePriorYears',
    homePriorExp:      'HomePriorExp',
    creditCheckAuth:   'CreditCheckAuth',
};

// Fields that ARE marked ezlynxRequired in fields.js but intentionally
// skip the filler — usually because they're date-only inputs that
// EZLynx doesn't have a single counterpart for, or they need a
// pre-export conversion the producer applies manually.
const UNWIRED_INTENTIONAL = {
    purchaseDate: 'EZLynx tracks property purchase via mortgage info, not a standalone field.',
};

describe('ezlynxRequired wire-format coverage', () => {
    let App;
    let FIELDS;

    beforeAll(() => {
        const win = bootApp();
        App = win.App;
        FIELDS = win.FIELDS || [];
        expect(FIELDS.length).toBeGreaterThan(50);
    });

    test('every ezlynxRequired field is either wired or explicitly skipped', () => {
        const required = FIELDS.filter(f => f.ezlynxRequired).map(f => f.id);
        const wired = new Set([...Object.keys(EZLYNX_REQUIRED_TO_FILLER_KEY), ...Object.keys(UNWIRED_INTENTIONAL)]);
        const missing = required.filter(id => !wired.has(id));
        expect(missing).toEqual([]);
    });

    test('no orphan map entries (every map key is still ezlynxRequired in fields.js)', () => {
        const required = new Set(FIELDS.filter(f => f.ezlynxRequired).map(f => f.id));
        const orphans = Object.keys(EZLYNX_REQUIRED_TO_FILLER_KEY).filter(id => !required.has(id));
        expect(orphans).toEqual([]);
    });

    // Parametrized: for each (altechId, fillerKey), set App.data and
    // assert the filler JSON produces a non-empty value at the mapped
    // key. Catches "I added a field but the exporter never read it."
    test.each(Object.entries(EZLYNX_REQUIRED_TO_FILLER_KEY))(
        'App.data.%s flows to filler.%s',
        (altechId, fillerKey) => {
            App.data = {};
            App.drivers = [];
            App.vehicles = [];

            // Pick a sentinel that survives any conversion the exporter
            // applies. Date-shaped sentinel for date fields, free string
            // otherwise.
            const field = FIELDS.find(f => f.id === altechId);
            let sentinel = `__${altechId}__`;
            if (field && field.type === 'date') {
                sentinel = '2099-12-31';
            } else if (altechId === 'creditCheckAuth') {
                // checkbox → 'Yes' string after coercion
                sentinel = 'Yes';
            }
            App.data[altechId] = sentinel;

            const out = App.exportClientJsonForFiller();
            expect(out[fillerKey]).toBeDefined();
            expect(out[fillerKey]).not.toBe('');
        }
    );

    test('UNWIRED_INTENTIONAL fields document why they skip the filler', () => {
        Object.entries(UNWIRED_INTENTIONAL).forEach(([id, reason]) => {
            expect(typeof reason).toBe('string');
            expect(reason.length).toBeGreaterThan(20);
        });
    });
});
