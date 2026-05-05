/**
 * @file Contract test — every ezlynxRequired field reaches at least one
 * downstream exporter (EZLynx XML auto, EZLynx XML home, HawkSoft FSC).
 *
 * Companion to ezlynx-required-coverage.test.js (which checks the filler
 * JSON). This widens the safety net so a regression in the EZLynx XML or
 * HawkSoft output path can't silently drop a required field.
 *
 * Strategy: for each `ezlynxRequired: true` field in fields.js, set a
 * unique sentinel value, run all three exporters, and assert the sentinel
 * appears in at least one output (or is documented as "not flowed" with a
 * reason).
 *
 * PDF is intentionally excluded — `buildPDF` produces a binary blob that
 * needs jsPDF runtime + text extraction to verify, out of scope for a
 * JSDOM contract test. The PDF exporter's text content comes from the
 * same `getNotesForData` source as the text export, so the FSC and XML
 * coverage transitively protects the PDF in practice.
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
    w.scrollTo = () => {};
    if (!w.Element.prototype.scrollTo) w.Element.prototype.scrollTo = function () {};
    if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};
    return w;
}

// Fields that are ezlynxRequired but intentionally NOT round-tripped to
// the listed exporter. Each entry needs a one-line reason. The
// "filler JSON" entries mean the field flows to the desktop browser-fill
// path (App.exportClientJsonForFiller) and from there onto the EZLynx
// web form — even though the V200 XML schema doesn't have a slot for it.
const NOT_IN_FSC = {
    // HawkSoft's tagged-field format covers identity, address, drivers,
    // vehicles, and home-rating data, but several Altech-tracked fields
    // don't have a matching FSC tag — they pack into misc-data or flow
    // only via the EZLynx filler JSON path.
    purchaseDate:        'No FSC tag for purchase date — flows via filler JSON',
    creditCheckAuth:     'Maps to FSC misc data only when truthy; flows via filler JSON',
    coIndustry:          'Not in HawkSoft co-app misc fields — flows via filler JSON',
    occupancyType:       'No FSC tag — flows via filler JSON',
    numOccupants:        'No FSC tag — flows via filler JSON',
    bedrooms:            'No FSC tag (HawkSoft uses bedroom-count via dwelling type) — flows via filler JSON',
    fireStationDist:     'No FSC tag — flows via filler JSON',
    fireHydrantFeet:     'No FSC tag — flows via filler JSON',
    priorYears:          'Surfaced via misc-data when "More than 15" enum is set; sentinel substring lost',
    priorMonths:         'No FSC tag — flows via filler JSON',
    continuousMonths:    'No FSC tag (continuousCoverage already covers the boolean) — flows via filler JSON',
    homePriorYears:      'No FSC tag for home-specific prior years — flows via filler JSON',
    homePriorExp:        'No FSC tag for home-specific prior expiration — flows via filler JSON',
};
const NOT_IN_EZAUTO = {
    // EZAUTO is auto-only; home fields don't appear in the auto XML.
    yrBuilt: 'Home field — flows in EZHOME XML',
    sqFt: 'Home field — flows in EZHOME XML',
    dwellingType: 'Home field — flows in EZHOME XML',
    dwellingUsage: 'Home field — flows in EZHOME XML',
    occupancyType: 'Home field — flows via filler JSON (no V200 schema slot)',
    numStories: 'Home field — flows in EZHOME XML',
    numOccupants: 'Home field — flows via filler JSON (no V200 schema slot)',
    bedrooms: 'Home field — flows via filler JSON (no V200 schema slot)',
    fullBaths: 'Home field — flows via filler JSON (no V200 schema slot)',
    constructionStyle: 'Home field — flows in EZHOME XML (sentinel suppressed by Construction enum normalizer; only Frame/Masonry/Stucco/Log pass)',
    exteriorWalls: 'Home field — flows via filler JSON (no V200 schema slot)',
    foundation: 'Home field — flows via filler JSON (no V200 schema slot)',
    roofType: 'Home field — flows in EZHOME XML',
    roofShape: 'Home field — flows via filler JSON (no V200 schema slot)',
    roofYr: 'Home field — flows via filler JSON (no V200 schema slot)',
    heatingType: 'Home field — flows in EZHOME XML',
    heatYr: 'Home field — flows via filler JSON (no V200 schema slot)',
    plumbYr: 'Home field — flows via filler JSON (no V200 schema slot)',
    elecYr: 'Home field — flows via filler JSON (no V200 schema slot)',
    fireStationDist: 'Home field — flows via filler JSON (no V200 schema slot in EZHOME either)',
    fireHydrantFeet: 'Home field — flows in EZHOME XML (sentinel converted to range like "0-500"; substring lost)',
    protectionClass: 'Home field — flows in EZHOME XML',
    dwellingCoverage: 'Home field — flows in EZHOME XML',
    personalLiability: 'Home field — flows via filler JSON (no V200 schema slot in EZHOME)',
    medicalPayments: 'Home field — flows via filler JSON (no V200 schema slot in EZHOME)',
    homeDeductible: 'Home field — V200 EZHOME has empty <DeductibeInfo/> block; flows via filler JSON',
    increasedReplacementCost: 'Home field — flows in EZHOME XML as Yes/No only (sentinel string suppressed)',
    homePriorCarrier: 'Home prior policy — flows in EZHOME XML',
    homePriorYears: 'Home prior policy — flows in EZHOME XML',
    homePriorExp: 'Home prior policy — flows in EZHOME XML',
    purchaseDate: 'Not in EZAUTO schema — flows via filler JSON',
    creditCheckAuth: 'Not in EZAUTO schema — flows via filler JSON',
    industry: 'Not in V200 EZAUTO Applicant block — flows via filler JSON',
    occupation: 'Not in V200 EZAUTO Applicant block — flows via filler JSON',
    coOccupation: 'Not in V200 EZAUTO CoApplicant PersonalInfo — flows via filler JSON',
    coIndustry: 'Not in V200 EZAUTO CoApplicant PersonalInfo — flows via filler JSON',
    medPayments: 'Not in V200 EZAUTO GeneralCoverage block (BI/PD/UM/UIM only) — flows via filler JSON',
    priorMonths: 'V200 PriorPolicyInfo only emits Years; Months flow via filler JSON',
    priorLiabilityLimits: 'Not in V200 PriorPolicyInfo — flows via filler JSON',
    continuousCoverage: 'Not in V200 EZAUTO schema — flows via filler JSON',
    continuousMonths: 'Not in V200 EZAUTO schema — flows via filler JSON',
};
const NOT_IN_EZHOME = {
    // EZHOME is home-only; auto-specific fields don't appear in the home
    // XML. Some home fields aren't in V200 EZHOME schema either.
    liabilityLimits: 'Auto field — flows in EZAUTO XML',
    pdLimit: 'Auto field — flows in EZAUTO XML',
    medPayments: 'Auto field — flows in EZAUTO XML / filler JSON',
    umLimits: 'Auto field — flows in EZAUTO XML',
    uimLimits: 'Auto field — flows in EZAUTO XML',
    umpdLimit: 'Auto field — flows in EZAUTO XML (StateSpecificCoverage)',
    compDeductible: 'Auto field — flows in EZAUTO XML (per-vehicle)',
    autoDeductible: 'Auto field — flows in EZAUTO XML (per-vehicle)',
    rentalDeductible: 'Auto field — flows in EZAUTO XML (per-vehicle)',
    towingDeductible: 'Auto field — flows in EZAUTO XML (per-vehicle)',
    policyTerm: 'Auto policy term — EZHOME has its own (homePolicyTerm)',
    effectiveDate: 'Auto effective date — EZHOME has its own (homeEffectiveDate)',
    priorCarrier: 'Auto prior carrier — EZHOME has its own (homePriorCarrier)',
    priorPolicyTerm: 'Auto prior term — flows in EZAUTO XML',
    priorYears: 'Auto prior years — EZHOME has its own (homePriorYears)',
    priorMonths: 'Auto prior months — flows via filler JSON',
    priorExp: 'Auto prior expiration — EZHOME has its own (homePriorExp)',
    priorLiabilityLimits: 'Auto-specific — flows via filler JSON',
    continuousCoverage: 'Auto-specific — flows via filler JSON',
    continuousMonths: 'Auto-specific — flows via filler JSON',
    purchaseDate: 'Not in V200 EZHOME schema — flows via filler JSON',
    creditCheckAuth: 'Not in V200 EZHOME schema — flows via filler JSON',
    industry: 'Not in V200 EZHOME Applicant block — flows via filler JSON',
    occupation: 'Not in V200 EZHOME Applicant block — flows via filler JSON',
    coOccupation: 'Not in V200 EZHOME CoApplicant — flows via filler JSON',
    coIndustry: 'Not in V200 EZHOME CoApplicant — flows via filler JSON',
    occupancyType: 'Not in V200 EZHOME RatingInfo — flows via filler JSON',
    numOccupants: 'Not in V200 EZHOME RatingInfo — flows via filler JSON',
    bedrooms: 'Not in V200 EZHOME RatingInfo — flows via filler JSON',
    fullBaths: 'Not in V200 EZHOME RatingInfo — flows via filler JSON',
    constructionStyle: 'Wired but sentinel suppressed by Construction enum normalizer (only Frame/Masonry/Stucco/Log pass)',
    exteriorWalls: 'Not in V200 EZHOME RatingInfo — flows via filler JSON',
    foundation: 'Not in V200 EZHOME RatingInfo — flows via filler JSON',
    roofShape: 'Not in V200 EZHOME — flows via filler JSON',
    roofYr: 'Not in V200 EZHOME RatingInfo — flows via filler JSON',
    heatYr: 'Not in V200 EZHOME — flows via filler JSON',
    plumbYr: 'Not in V200 EZHOME — flows via filler JSON',
    elecYr: 'Not in V200 EZHOME — flows via filler JSON',
    fireStationDist: 'Not in V200 EZHOME schema — flows via filler JSON',
    fireHydrantFeet: 'Wired in EZHOME but sentinel converted to range like "0-500" (substring lost)',
    personalLiability: 'Not in V200 EZHOME — flows via filler JSON',
    medicalPayments: 'Not in V200 EZHOME — flows via filler JSON',
    homeDeductible: 'V200 EZHOME has empty <DeductibeInfo/> — flows via filler JSON',
    increasedReplacementCost: 'Wired but sentinel string suppressed by Yes/No conversion',
};

describe('Exporter contract — ezlynxRequired fields reach exporters', () => {
    let App, FIELDS, win;

    beforeAll(() => {
        win = bootApp();
        App = win.App;
        FIELDS = win.FIELDS || [];
        expect(typeof App.buildEZLynxXML).toBe('function');
        expect(typeof App.buildEZLynxHomeXML).toBe('function');
        expect(typeof App.buildCMSMTF).toBe('function');
    });

    // Fields with sentinel values that survive any per-format conversion.
    // - Dates: 2099-12-31 → '12/31/2099' or '2099-12-31' (year survives both)
    // - creditCheckAuth: must be 'Yes' to survive boolean coercion
    // - phone fields: digits only (FSC + EZAUTO strip non-digits)
    // - All others: a unique marker string ezlynxRequired fields shouldn't
    //   collide with realistic data.
    function sentinelFor(f) {
        if (f.id === 'creditCheckAuth') return 'Yes';
        if (f.type === 'date') return '2099-12-31';
        if (f.type === 'tel' || f.id === 'phone') return '5559990000';
        return `EZSENT_${f.id}`;
    }
    // What substring to grep for in exporter output. Date fields produce
    // either YYYY-MM-DD or MM/DD/YYYY depending on the exporter — the
    // 4-digit year survives both.
    function searchableSentinel(f) {
        if (f.id === 'creditCheckAuth') return 'Yes';
        if (f.type === 'date') return '2099';
        if (f.type === 'tel' || f.id === 'phone') return '5559990000';
        return `EZSENT_${f.id}`;
    }

    function applySentinel(fieldId, value) {
        App.data = {};
        App.data[fieldId] = value;
        // qType: include both schemas so each per-LOB exporter visits the
        // right code paths.
        App.data.qType = 'both';
        // addrState: trigger WA state-specific coverage block.
        if (!App.data.addrState) App.data.addrState = 'WA';
        // co-applicant gate: HawkSoft FSC + EZLynx XML only emit a co-app
        // block when coFirstName/coLastName is non-empty (otherwise the
        // entire block is suppressed). Stub a name so co-app *fields*
        // flow when set independently.
        if (!App.data.coFirstName) App.data.coFirstName = 'CoStub';
        App.data.hasCoApplicant = 'yes';
        // Stub driver + vehicle so per-driver/per-vehicle XML blocks emit.
        // Without these the EZAUTO exporter skips Drivers + Vehicles entirely
        // and per-vehicle deductibles (comp/coll/towing/rental) never flow.
        App.drivers = [{
            id: 'stub_d', firstName: 'Stub', lastName: 'Driver',
            dob: '1990-01-01', dlNum: 'STUB1', dlState: 'WA',
            relationship: 'Self', isPrimaryApplicant: true,
        }];
        App.vehicles = [{
            id: 'stub_v', vin: 'STUBVIN0000000001', year: '2020',
            make: 'STUB', model: 'STUB', use: 'Pleasure', miles: '12000',
        }];
    }

    const requiredFields = (() => {
        // FIELDS isn't populated until beforeAll, so guard the lazy access.
        const list = (typeof window !== 'undefined' && window.FIELDS) ? window.FIELDS : null;
        return list || [];
    })();

    test('every ezlynxRequired field reaches at least one downstream exporter', () => {
        // Union check across all four exporters (EZAUTO XML, EZHOME XML,
        // HawkSoft FSC, EZLynx desktop filler JSON). A required field has
        // to land in *some* output path, otherwise the producer's data is
        // genuinely lost. Per-exporter coverage gaps are catalogued in
        // NOT_IN_EZAUTO/NOT_IN_EZHOME/NOT_IN_FSC below — this union test
        // catches the catastrophic case where a field falls through every
        // path.
        const required = FIELDS.filter(f => f.ezlynxRequired);
        const failures = [];

        for (const f of required) {
            const sent = sentinelFor(f);
            const search = searchableSentinel(f);
            applySentinel(f.id, sent);

            const ezAuto = App.buildEZLynxXML().content;
            const ezHome = App.buildEZLynxHomeXML().content;
            const fsc = App.buildCMSMTF(App.data).content;
            const fillerJson = JSON.stringify(App.exportClientJsonForFiller());

            const reached = ezAuto.includes(search)
                         || ezHome.includes(search)
                         || fsc.includes(search)
                         || fillerJson.includes(search);

            if (!reached) {
                failures.push(`${f.id} (sentinel=${sent}) — not found in EZAUTO, EZHOME, FSC, or filler JSON`);
            }
        }

        if (failures.length) {
            // Surface as a single failure with a list — easier than 70+ separate jest.each entries.
            throw new Error(`Required fields not reaching ANY exporter (catastrophic — these are silently dropped):\n  ${failures.join('\n  ')}`);
        }
    });

    test('every ezlynxRequired field reaches EZAUTO XML (or is documented as not auto-relevant)', () => {
        const required = FIELDS.filter(f => f.ezlynxRequired);
        const failures = [];

        for (const f of required) {
            if (NOT_IN_EZAUTO[f.id]) continue;
            const sent = sentinelFor(f);
            const search = searchableSentinel(f);
            applySentinel(f.id, sent);
            const xml = App.buildEZLynxXML().content;
            if (!xml.includes(search)) {
                failures.push(`${f.id} (sentinel=${sent}) — not in EZAUTO output. Add to NOT_IN_EZAUTO with a reason, or wire it in app-export-acord-xml.js buildEZLynxXML.`);
            }
        }
        expect(failures).toEqual([]);
    });

    test('every ezlynxRequired field reaches EZHOME XML (or is documented as not home-relevant)', () => {
        const required = FIELDS.filter(f => f.ezlynxRequired);
        const failures = [];

        for (const f of required) {
            if (NOT_IN_EZHOME[f.id]) continue;
            const sent = sentinelFor(f);
            const search = searchableSentinel(f);
            applySentinel(f.id, sent);
            const xml = App.buildEZLynxHomeXML().content;
            if (!xml.includes(search)) {
                failures.push(`${f.id} (sentinel=${sent}) — not in EZHOME output. Add to NOT_IN_EZHOME with a reason, or wire it in app-export-acord-xml.js buildEZLynxHomeXML.`);
            }
        }
        expect(failures).toEqual([]);
    });

    test('every ezlynxRequired field reaches HawkSoft FSC (or is documented as not FSC-relevant)', () => {
        const required = FIELDS.filter(f => f.ezlynxRequired);
        const failures = [];

        for (const f of required) {
            if (NOT_IN_FSC[f.id]) continue;
            const sent = sentinelFor(f);
            const search = searchableSentinel(f);
            applySentinel(f.id, sent);
            const fsc = App.buildCMSMTF(App.data).content;
            if (!fsc.includes(search)) {
                failures.push(`${f.id} (sentinel=${sent}) — not in FSC output. Add to NOT_IN_FSC with a reason, or wire it in app-export-cmsmtf.js buildCMSMTF.`);
            }
        }
        expect(failures).toEqual([]);
    });

    // Smoke tests: exporters don't throw on edge inputs that producers
    // can hit (empty client, minimal client, full client).
    test('exporters do not throw on empty client', () => {
        App.data = {};
        App.drivers = [];
        App.vehicles = [];
        expect(() => App.buildEZLynxXML()).not.toThrow();
        expect(() => App.buildEZLynxHomeXML()).not.toThrow();
        expect(() => App.buildCMSMTF(App.data)).not.toThrow();
    });

    test('exporters do not throw on minimal client (name only)', () => {
        App.data = { firstName: 'A', lastName: 'B' };
        App.drivers = [];
        App.vehicles = [];
        expect(() => App.buildEZLynxXML()).not.toThrow();
        expect(() => App.buildEZLynxHomeXML()).not.toThrow();
        expect(() => App.buildCMSMTF(App.data)).not.toThrow();
    });

    test('NOT_IN_FSC / NOT_IN_EZAUTO / NOT_IN_EZHOME each have non-empty reasons', () => {
        const all = [NOT_IN_FSC, NOT_IN_EZAUTO, NOT_IN_EZHOME];
        for (const dict of all) {
            for (const [id, reason] of Object.entries(dict)) {
                expect(typeof reason).toBe('string');
                expect(reason.length).toBeGreaterThan(10);
            }
        }
    });

    test('no orphan exclusions — every NOT_IN_* entry is still ezlynxRequired in fields.js', () => {
        const reqIds = new Set(FIELDS.filter(f => f.ezlynxRequired).map(f => f.id));
        const allExclusions = [
            ...Object.keys(NOT_IN_FSC),
            ...Object.keys(NOT_IN_EZAUTO),
            ...Object.keys(NOT_IN_EZHOME),
        ];
        const orphans = allExclusions.filter(id => !reqIds.has(id));
        expect(orphans).toEqual([]);
    });
});
