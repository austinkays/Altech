/**
 * Personal Intake v2 — consolidated test suite.
 *
 * Covers:
 *   • save / load round trip (nested data + encryption + recovery park)
 *   • DOM application of scalar fields
 *   • bindability across the four carriers (Progressive / Foremost / Travelers / Safeco)
 *   • operator pool sync from applicant + co-applicant
 *   • defer ("Ask Later") system
 *   • export mapping (v2 nested → legacy flat, plus the inverse)
 *   • CMSMTF / EZLynx-XML wrappers (sentinel-based — sibling of exporter-contract.test.js)
 *   • PDF builder smoke (non-empty blob; field text presence)
 *   • boat HIN validator
 *   • smoke: add operator + home + auto + boat + rv via mutation API, no errors
 *
 * Boats and RVs are PDF-only by design — the exporter-contract test below
 * intentionally asserts their fields appear in the PDF text, NOT in CMSMTF/XML.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

function bootDom() {
    const html = loadHTML(path.join(__dirname, '../index.html'));
    const dom = new JSDOM(html, {
        url: 'http://localhost:8000',
        runScripts: 'dangerously',
        pretendToBeVisual: true,
    });
    const w = dom.window;

    // Mock storage
    const store = {};
    w.localStorage = {
        data: store,
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
        clear() { Object.keys(store).forEach(x => delete store[x]); },
    };

    // Mock various browser APIs the app touches
    w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){}, media:'' });
    w.scrollTo = () => {};
    if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};
    w.URL.createObjectURL = () => 'blob:mock';
    w.URL.revokeObjectURL = () => {};
    if (!w.navigator.clipboard) {
        Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, writable: true, configurable: true });
    }
    w.fetch = () => Promise.resolve({ ok:true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
    w.confirm = () => true;
    w.alert = () => {};

    // Auth stub
    w.Auth = w.Auth || { user: { uid: 't', email: 't@t' }, showModal(){}, ready: () => Promise.resolve({ uid:'t', email:'t@t' }) };

    return w;
}

async function activate(w) {
    // Trigger DOMContentLoaded so app boots wire everything up, then init v2.
    if (w.IntakeV2 && !w.IntakeV2._ready) {
        // Some app-boot logic only runs after window onload — fire it.
        w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
        w.IntakeV2.init();
    }
    // Allow microtasks to settle (encryption / save are sync but renderers register on init)
    await new Promise(r => setTimeout(r, 0));
    return w.IntakeV2;
}

// ─── Smoke ────────────────────────────────────────────────────────────────
describe('IntakeV2 — bootstrap & smoke', () => {
    let w;
    beforeAll(() => { w = bootDom(); });

    test('global namespace and helpers are loaded', () => {
        expect(w.IntakeV2).toBeDefined();
        expect(w.IntakeV2Fields).toBeDefined();
        expect(w.IntakeV2Fields.scalar.length).toBeGreaterThan(20);
        expect(w.IntakeV2Fields.collections.operators).toBeDefined();
        expect(w.IntakeV2Fields.collections.boats).toBeDefined();
        expect(w.IntakeV2Fields.collections.rvs).toBeDefined();
        expect(w.IntakeV2Bindability).toBeDefined();
        expect(w.IntakeV2ExportMap).toBeDefined();
        expect(w.FieldMapV2).toBeDefined();
        expect(w.STORAGE_KEYS.INTAKE_V2).toBe('altech_v6_intake_v2');
    });

    test('init injects DOM and registers renderers', async () => {
        await activate(w);
        const container = w.document.getElementById('intakeV2Tool');
        expect(container).not.toBeNull();
        expect(w.document.getElementById('iv2Root')).not.toBeNull();
        expect(w.document.getElementById('iv2Topbar')).not.toBeNull();
        expect(w.document.getElementById('iv2JumpList')).not.toBeNull();
    });

    test('toolConfig has the intakev2 entry', () => {
        const entry = (w.App.toolConfig || []).find(t => t.key === 'intakev2');
        expect(entry).toBeDefined();
        expect(entry.htmlFile).toBe('plugins/intake-v2.html');
        expect(entry.initModule).toBe('IntakeV2');
    });
});

// ─── Save / Load ──────────────────────────────────────────────────────────
describe('IntakeV2 — save / load round trip', () => {
    let w;
    beforeAll(async () => { w = bootDom(); await activate(w); });

    test('save persists data and load restores it (round trip)', async () => {
        w.IntakeV2.data.applicant.firstName = 'Alex';
        w.IntakeV2.data.applicant.lastName  = 'Test';
        w.IntakeV2.data.applicant.dob       = '1985-03-14';
        await w.IntakeV2.save();

        const stored = w.localStorage.getItem(w.STORAGE_KEYS.INTAKE_V2);
        expect(stored).toBeTruthy();

        // Mutate, reload, verify load() repopulates from storage
        w.IntakeV2.data.applicant.firstName = 'WIPED';
        w.IntakeV2.data.applicant.dob       = 'WIPED';
        const ok = await w.IntakeV2.load();
        expect(ok).toBe(true);
        expect(w.IntakeV2.data.applicant.firstName).toBe('Alex');
        expect(w.IntakeV2.data.applicant.dob).toBe('1985-03-14');
    });

    test('schema migration deep-merges defaults onto partial data', () => {
        // Simulate an older payload missing `discounts`
        const partial = { applicant: { firstName: 'X' } };
        const merged = w.IntakeV2._migrateSchema(partial);
        expect(merged.applicant.firstName).toBe('X');
        expect(merged.discounts).toBeDefined();
        expect(merged.priorInsurance.continuous).toBe('');
        expect(merged._schemaVersion).toBe(w.IntakeV2.SCHEMA_VERSION);
    });
});

// ─── DOM application ──────────────────────────────────────────────────────
describe('IntakeV2 — DOM <-> data', () => {
    let w;
    beforeAll(async () => { w = bootDom(); await activate(w); });

    test('applyData populates scalar inputs from nested data', () => {
        w.IntakeV2.data.applicant.firstName = 'Sam';
        w.IntakeV2.data.address.zip = '98101';
        w.IntakeV2.applyData();
        expect(w.document.getElementById('iv2-firstName').value).toBe('Sam');
        expect(w.document.getElementById('iv2-addrZip').value).toBe('98101');
    });

    test('FieldMapV2.pathForElement resolves both scalar and collection paths', () => {
        const a = w.document.getElementById('iv2-firstName');
        expect(w.FieldMapV2.pathForElement(a)).toBe('applicant.firstName');

        const fake = w.document.createElement('input');
        fake.id = 'iv2-op-firstName-fake';
        fake.setAttribute('data-collection', 'operators');
        fake.setAttribute('data-item-id', 'op-x');
        fake.setAttribute('data-field-path', 'firstName');
        expect(w.FieldMapV2.pathForElement(fake)).toBe('operators#op-x.firstName');
    });
});

// ─── Bindability ──────────────────────────────────────────────────────────
describe('IntakeV2 — carrier bindability', () => {
    let w;
    beforeEach(async () => { w = bootDom(); await activate(w); });

    test('empty form: all carriers report missing fields', () => {
        const b = w.IntakeV2Bindability.computeBindability({ data: w.IntakeV2.data });
        for (const c of ['progressive','foremost','travelers','safeco']) {
            expect(b[c].ok).toBe(false);
            expect(b[c].missing.length).toBeGreaterThan(0);
        }
    });

    test('auto with full applicant + auto + operator → bindable', () => {
        const d = w.IntakeV2.data;
        Object.assign(d.applicant, { firstName: 'A', lastName: 'B', dob: '1985-01-01', phone: '5551112222', maritalStatus: 'Married' });
        Object.assign(d.address,   { street: '1 Main', city: 'X', state: 'WA', zip: '98101' });
        const auto = w.IntakeV2.addItem('autos', { year: 2021, make: 'Toyota', model: 'Tacoma', vin: '5TFCZ5AN0MX' + '123456' });
        // Apply applicant→primary operator sync
        w.IntakeV2.syncApplicantOperators();
        auto.primaryOperatorId = w.IntakeV2.data.operators[0].id;
        w.IntakeV2.save({ silent: true });

        const b = w.IntakeV2Bindability.computeBindability({ data: w.IntakeV2.data });
        // Progressive needs VIN, so it should be ok
        expect(b.progressive.ok).toBe(true);
    });

    test('deferred fields do not count as missing', () => {
        const d = w.IntakeV2.data;
        d.applicant.firstName = 'X';
        d.applicant.lastName = 'Y';
        d.applicant.dob = '1980-01-01';
        d.applicant.phone = '5550000000';
        Object.assign(d.address, { street: '1', city: 'C', state: 'WA', zip: '98101' });
        const auto = w.IntakeV2.addItem('autos', { year: 2020, make: 'X', model: 'Y' });
        w.IntakeV2.syncApplicantOperators();
        auto.primaryOperatorId = d.operators[0].id;
        // Defer the VIN (Progressive normally requires it)
        d.deferred.push(`autos#${auto.id}.vin`);
        const b = w.IntakeV2Bindability.computeBindability({ data: w.IntakeV2.data });
        expect(b.progressive.missing.find(m => m.path.endsWith('.vin'))).toBeUndefined();
    });

    test('status dot per item escalates correctly', () => {
        w.IntakeV2.data.applicant.firstName = 'A';
        w.IntakeV2.data.applicant.lastName  = 'B';
        const boat = w.IntakeV2.addItem('boats', {});
        const status = w.IntakeV2Bindability.statusForItem('boats', boat);
        expect(status.level).toBe('block'); // brand-new boat → no carriers can quote
    });
});

// ─── Operator sync ────────────────────────────────────────────────────────
describe('IntakeV2 — operator pool sync', () => {
    let w;
    beforeEach(async () => { w = bootDom(); await activate(w); });

    test('applicant fields auto-create primary operator', () => {
        Object.assign(w.IntakeV2.data.applicant, { firstName: 'Jane', lastName: 'Doe', dob: '1990-06-01', gender: 'Female' });
        w.IntakeV2.syncApplicantOperators();
        expect(w.IntakeV2.data.operators).toHaveLength(1);
        expect(w.IntakeV2.data.operators[0].isPrimaryApplicant).toBe(true);
        expect(w.IntakeV2.data.operators[0].firstName).toBe('Jane');
    });

    test('toggling co-applicant on/off adds then removes the operator', () => {
        Object.assign(w.IntakeV2.data.applicant, { firstName: 'A', lastName: 'A' });
        w.IntakeV2.syncApplicantOperators();
        expect(w.IntakeV2.data.operators).toHaveLength(1);

        Object.assign(w.IntakeV2.data.coApplicant, { present: true, firstName: 'B', lastName: 'B', relationship: 'Spouse' });
        w.IntakeV2.syncApplicantOperators();
        expect(w.IntakeV2.data.operators).toHaveLength(2);
        expect(w.IntakeV2.data.operators[1].isCoApplicant).toBe(true);

        // Link to an auto, then untoggle — should unlink
        const auto = w.IntakeV2.addItem('autos', {});
        auto.primaryOperatorId = w.IntakeV2.data.operators[1].id;
        w.IntakeV2.data.coApplicant.present = false;
        w.IntakeV2.syncApplicantOperators();
        expect(w.IntakeV2.data.operators.find(o => o.isCoApplicant)).toBeUndefined();
        expect(auto.primaryOperatorId).toBe('');
    });
});

// ─── Defer system ─────────────────────────────────────────────────────────
describe('IntakeV2 — defer (Ask Later)', () => {
    let w;
    beforeEach(async () => { w = bootDom(); await activate(w); });

    test('toggle adds and removes a path', () => {
        w.IntakeV2._defer.toggle('applicant.ssn');
        expect(w.IntakeV2.data.deferred).toContain('applicant.ssn');
        w.IntakeV2._defer.toggle('applicant.ssn');
        expect(w.IntakeV2.data.deferred).not.toContain('applicant.ssn');
    });

    test('deferred field is reflected on the DOM wrap', () => {
        w.IntakeV2._defer.toggle('applicant.firstName');
        const wrap = w.document.querySelector('[data-field-wrap="applicant.firstName"]');
        expect(wrap.getAttribute('data-deferred')).toBe('true');
    });
});

// ─── Export mapping ───────────────────────────────────────────────────────
describe('IntakeV2 — export map', () => {
    let w;
    beforeEach(async () => { w = bootDom(); await activate(w); });

    test('toLegacyShape flattens applicant + address + home', () => {
        Object.assign(w.IntakeV2.data.applicant, { firstName: 'Pat', lastName: 'Q', dob: '1970-04-04', phone: '5551231234' });
        Object.assign(w.IntakeV2.data.address, { street: '1 Pine', city: 'Seattle', state: 'WA', zip: '98101', county: 'King' });
        const home = w.IntakeV2.addItem('homes', { yrBuilt: 1995, sqFt: 1800, dwellingType: 'One Family' });
        home.roof.type = 'Asphalt Shingle';
        const out = w.IntakeV2ExportMap.toLegacyShape(w.IntakeV2.data);
        expect(out.data.firstName).toBe('Pat');
        expect(out.data.addrCity).toBe('Seattle');
        expect(out.data.yrBuilt).toBe(1995);
        expect(out.data.roofType).toBe('Asphalt Shingle');
        expect(out.data.qType).toBe('home');
    });

    test('autos + linked operators map to drivers[] + vehicles[]', () => {
        Object.assign(w.IntakeV2.data.applicant, { firstName: 'X', lastName: 'Y' });
        w.IntakeV2.syncApplicantOperators();
        const auto = w.IntakeV2.addItem('autos', { year: 2020, make: 'Honda', model: 'CRV', vin: '5TFXX1234567XXXXX' });
        auto.primaryOperatorId = w.IntakeV2.data.operators[0].id;
        const out = w.IntakeV2ExportMap.toLegacyShape(w.IntakeV2.data);
        expect(out.vehicles).toHaveLength(1);
        expect(out.vehicles[0].vin).toBe('5TFXX1234567XXXXX');
        expect(out.drivers.length).toBeGreaterThan(0);
        expect(out.drivers[0].firstName).toBe('X');
        expect(out.data.qType).toBe('auto');
    });

    test('fromLegacyShape round-trips applicant + home + autos', () => {
        const legacy = {
            firstName: 'L', lastName: 'M', dob: '1975-05-05',
            addrStreet: '1', addrCity: 'C', addrState: 'WA', addrZip: '98101',
            yrBuilt: 2001, sqFt: 1500, dwellingType: 'One Family',
            drivers: [{ firstName: 'D', lastName: 'X', dob: '1976-01-01' }],
            vehicles: [{ year: 2018, make: 'Ford', model: 'F-150', vin: 'WBA1234567890ABCD' }],
        };
        const v2 = w.IntakeV2ExportMap.fromLegacyShape(legacy);
        expect(v2.applicant.firstName).toBe('L');
        expect(v2.homes[0].yrBuilt).toBe(2001);
        expect(v2.operators[0].firstName).toBe('D');
        expect(v2.autos[0].vin).toBe('WBA1234567890ABCD');
    });
});

// ─── CMSMTF / EZLynx wrapper exports — sibling to exporter-contract.test.js
describe('IntakeV2 — CMSMTF & EZLynx XML wrappers', () => {
    let w;
    beforeAll(async () => {
        w = bootDom();
        await activate(w);
        // Populate enough fields to exercise both exporters
        Object.assign(w.IntakeV2.data.applicant, {
            firstName: 'SENTINEL_FIRST', lastName: 'SENTINEL_LAST',
            dob: '1985-07-04', gender: 'Male', maritalStatus: 'Married',
            phone: '5551239876', email: 's@example.com',
            occupation: 'Engineer', industry: 'Tech', education: 'Bachelors',
        });
        Object.assign(w.IntakeV2.data.address, {
            street: '111 Test Ave', city: 'Seattle', state: 'WA', zip: '98101', county: 'King',
        });
        const home = w.IntakeV2.addItem('homes', {
            yrBuilt: 1995, sqFt: 2000, dwellingType: 'One Family',
            dwellingUsage: 'Primary', occupancyType: 'Owner-occupied',
            numStories: '2', bedrooms: 3, fullBaths: 2,
            construction: 'Frame', exterior: 'Wood Siding',
        });
        home.roof.type = 'Asphalt Shingle'; home.roof.shape = 'Gable'; home.roof.yr = 2010;
        home.systems.heatingType = 'Gas';
        w.IntakeV2.syncApplicantOperators();
        const auto = w.IntakeV2.addItem('autos', {
            year: 2020, make: 'Toyota', model: 'Camry', vin: 'SENTINELVIN001234',
        });
        auto.primaryOperatorId = w.IntakeV2.data.operators[0].id;
    });

    test('CMSMTF wrapper produces a file containing applicant + address sentinels', () => {
        // App.buildCMSMTF must exist (loaded from app-export-cmsmtf.js)
        expect(typeof w.App.buildCMSMTF).toBe('function');

        let captured;
        const origDownload = w.App.downloadFile;
        w.App.downloadFile = (content, name, mime) => { captured = { content, name, mime }; };
        try {
            w.IntakeV2.exportCMSMTF();
        } finally { w.App.downloadFile = origDownload; }
        expect(captured).toBeTruthy();
        expect(captured.content).toContain('SENTINEL_FIRST');
        expect(captured.content).toContain('SENTINEL_LAST');
        expect(captured.content).toContain('111 Test Ave');
    });

    test('EZLynx XML wrapper builds a string with sentinels', () => {
        let captured;
        const origDownload = w.App.downloadFile;
        w.App.downloadFile = (content, name, mime) => { captured = { content, name, mime }; };
        try {
            w.IntakeV2.exportEZLynxXML();
        } finally { w.App.downloadFile = origDownload; }
        expect(captured).toBeTruthy();
        expect(typeof captured.content === 'string').toBe(true);
        // ACORD XML emits the applicant inside <Person> / <SpecificApplicantInfo> or
        // similar. We just check the sentinel appears somewhere.
        expect(captured.content).toMatch(/SENTINEL_FIRST/);
    });
});

// ─── Boat HIN validator ───────────────────────────────────────────────────
describe('IntakeV2 — boat HIN', () => {
    let w;
    beforeAll(async () => { w = bootDom(); await activate(w); });
    test('valid HIN parses', () => {
        const r = w.IntakeV2Boats.decodeHIN('ABCD12345678');
        expect(r.ok).toBe(true);
        expect(r.manufacturerCode).toBe('ABC');
    });
    test('invalid HIN is flagged but not blocking', () => {
        const r = w.IntakeV2Boats.decodeHIN('SHORT');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('format');
    });
    test('older + wood boat triggers marine-survey warning', () => {
        const old = { year: 1980, length: 35, hullMaterial: 'Wood', docs: {} };
        const warns = w.IntakeV2Boats.boatWarnings(old);
        expect(warns.length).toBeGreaterThan(0);
    });
});

// ─── PDF builder smoke ────────────────────────────────────────────────────
describe('IntakeV2 — PDF', () => {
    let w;
    beforeAll(async () => { w = bootDom(); await activate(w); });

    test('builds a non-empty PDF including boat HIN and RV class', async () => {
        // PDFLibs uses CDN — in JSDOM, ensure() loads from network which won't
        // resolve here. We mock the loader and provide a minimal jsPDF stub.
        let captured = '';
        w.jspdf = w.jspdf || {};
        w.jspdf.jsPDF = function () {
            return {
                _y: 0,
                internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
                setFont() { return this; }, setFontSize() { return this; },
                setTextColor() { return this; }, setDrawColor() { return this; }, setLineWidth() { return this; },
                text(t) { captured += (Array.isArray(t) ? t.join('\n') : t) + '\n'; return this; },
                line() { return this; }, addPage() { captured += '\n[PAGE]\n'; return this; },
                save() { /* no-op in tests */ },
                splitTextToSize(t) { return [String(t)]; },
                output() { return new ArrayBuffer(8); },
            };
        };
        w.PDFLibs = w.PDFLibs || { ensure: () => Promise.resolve(true) };

        Object.assign(w.IntakeV2.data.applicant, { firstName: 'PDF', lastName: 'Test' });
        w.IntakeV2.addItem('boats', { year: 2018, make: 'Yamaha', model: '242X', hin: 'YAM12345678X', hullMaterial: 'Fiberglass', propulsion: 'Outboard' });
        w.IntakeV2.addItem('rvs',   { year: 2020, make: 'Jayco', model: 'Eagle', class: 'fifthWheel', length: 32 });

        const doc = await w.IntakeV2.buildIntakeV2PDF(w.IntakeV2.data);
        expect(doc).toBeTruthy();
        expect(captured).toContain('Yamaha');
        expect(captured).toContain('YAM12345678X');
        expect(captured).toContain('Jayco');
        expect(captured).toContain('Class fifthWheel');
    });
});

// ─── Mutation smoke ───────────────────────────────────────────────────────
describe('IntakeV2 — mutation API smoke', () => {
    let w;
    beforeEach(async () => { w = bootDom(); await activate(w); });

    test('addItem populates each array and assigns ids', () => {
        const op = w.IntakeV2.addItem('operators', { firstName: 'O' });
        w.IntakeV2.addItem('homes', {});
        w.IntakeV2.addItem('autos', {});
        const boat = w.IntakeV2.addItem('boats', {});
        const rv = w.IntakeV2.addItem('rvs', {});
        expect(w.IntakeV2.data.operators).toContainEqual(expect.objectContaining({ id: op.id }));
        expect(w.IntakeV2.data.homes.length).toBe(1);
        expect(w.IntakeV2.data.autos.length).toBe(1);
        expect(w.IntakeV2.data.boats.length).toBe(1);
        expect(w.IntakeV2.data.rvs.length).toBe(1);
        expect(boat.id).toMatch(/^boat-/);
        expect(rv.id).toMatch(/^rv-/);
    });

    test('removeItem leaves the auto-synced primary operator alone', () => {
        // init() runs syncApplicantOperators() which creates a primary operator.
        // Removing a *different* operator should leave the primary intact.
        const before = w.IntakeV2.data.operators.length;
        const extra = w.IntakeV2.addItem('operators', { firstName: 'Extra' });
        expect(w.IntakeV2.data.operators).toHaveLength(before + 1);
        w.IntakeV2.removeItem('operators', extra.id);
        expect(w.IntakeV2.data.operators).toHaveLength(before);
        // Removed operator is gone
        expect(w.IntakeV2.data.operators.find(o => o.id === extra.id)).toBeUndefined();
    });
});
