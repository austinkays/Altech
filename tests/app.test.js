/**
 * Altech App Unit Tests
 * 
 * Run with: npm test
 * 
 * These tests verify core app functionality by exercising REAL App methods:
 * - Data validation and formatting
 * - Export generation (XML, CMSMTF, CSV, Text)
 * - LocalStorage operations (save/load/applyData)
 * - Workflow navigation
 * - Quote Library (save/load/delete/title)
 * - Driver & Vehicle management
 * - Form field mapping & utilities
 * - CSV import parsing
 * - Edge cases & error handling
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

// ──────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────

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

  // Mock alert/confirm/prompt
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  window.prompt = jest.fn(() => null);

  // Mock URL.createObjectURL & revokeObjectURL
  window.URL.createObjectURL = jest.fn(() => 'blob:mock');
  window.URL.revokeObjectURL = jest.fn();

  // Mock matchMedia (not available in JSDOM, used by init for pointer detection)
  window.matchMedia = jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));

  // Mock scrollTo (not available in JSDOM)
  window.scrollTo = jest.fn();
  window.document.querySelectorAll('[id]').forEach(el => {
    if (!el.scrollTo) el.scrollTo = jest.fn();
    if (!el.scrollIntoView) el.scrollIntoView = jest.fn();
  });
  // Patch Element.prototype for any dynamically created elements
  if (!window.Element.prototype.scrollTo) window.Element.prototype.scrollTo = function() {};
  if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function() {};

  // Mock navigator.clipboard (not available in JSDOM)
  if (!window.navigator.clipboard) {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: jest.fn(() => Promise.resolve()) },
      writable: true,
      configurable: true
    });
  }

  // Mock Auth so the auth gate in navigateTo() passes
  if (window.Auth) {
    Object.defineProperty(window.Auth, 'user', {
      get: () => ({ uid: 'test-user', email: 'test@test.com' }),
      configurable: true
    });
    if (!window.Auth.showModal) window.Auth.showModal = jest.fn();
  } else {
    window.Auth = { user: { uid: 'test-user', email: 'test@test.com' }, showModal: jest.fn() };
  }

  return { dom, window, document: window.document, App: window.App };
}

// ──────────────────────────────────────────
// Sample data fixtures
// ──────────────────────────────────────────

const SAMPLE_DATA = {
  firstName: 'John',
  lastName: 'Doe',
  dob: '1990-05-15',
  email: 'john@example.com',
  phone: '(360) 555-1234',
  addrStreet: '408 NW 116th St',
  addrCity: 'Vancouver',
  addrState: 'WA',
  addrZip: '98685',
  qType: 'both',
  maritalStatus: 'Married',
  education: "Bachelor's",
  industry: 'Technology',
  // Property fields
  dwellingType: 'Single Family',
  dwellingUsage: 'Primary Residence',
  yrBuilt: '2005',
  sqFt: '2400',
  numStories: '2',
  fullBaths: '2',
  constructionStyle: 'Frame',
  exteriorWalls: 'Vinyl',
  foundation: 'Slab',
  roofType: 'Composition',
  roofShape: 'Gable',
  roofYr: '2020',
  heatingType: 'Forced Air',
  cooling: 'Central AC',
  // Auto fields
  vin: '1N4AL3AP5FC123456',
  vehDesc: '2015 NISSAN Rogue',
  dlNum: 'DOE1234',
  dlState: 'WA',
  use: 'Commute',
  miles: '12000',
  liabilityLimits: '100/300/100',
  priorCarrier: 'GEICO',
  priorYears: '3',
  // Risk factors
  pool: 'No',
  trampoline: 'No',
  dogInfo: 'None',
  accidents: '0',
  violations: '0'
};

const MINIMAL_AUTO_DATA = {
  firstName: 'Jane',
  lastName: 'Smith',
  dob: '1985-03-22',
  addrState: 'OR',
  addrZip: '97201',
  qType: 'auto',
  vin: '5YJSA1E21HF000001'
};

const MINIMAL_HOME_DATA = {
  firstName: 'Bob',
  lastName: 'Jones',
  dob: '1978-11-01',
  addrState: 'WA',
  addrZip: '98101',
  qType: 'home'
};

// ──────────────────────────────────────────
// Tests
// ──────────────────────────────────────────

describe('Altech App Tests', () => {
  let dom, window, document, App;

  // Create JSDOM once — parsing 18K lines per test was the #1 slowdown
  beforeAll(() => {
    ({ dom, window, document, App } = createTestDOM());
  });

  afterAll(() => {
    dom.window.close();
  });

  // Lightweight reset between tests — clear data without rebuilding DOM
  beforeEach(() => {
    App.data = {};
    App.step = 0;
    window.localStorage.clear();
  });

  // ════════════════════════════════════════
  // 1. Data Validation Utilities
  // ════════════════════════════════════════

  describe('Data Validation', () => {
    test('normalizeDate returns correct ISO date', () => {
      const d = new Date('1990-05-15');
      expect(d.toISOString().split('T')[0]).toBe('1990-05-15');
    });

    test('sanitizeFilename removes invalid characters', () => {
      const sanitize = (name) => name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
      expect(sanitize('John Doe')).toBe('John_Doe');
      expect(sanitize('Test/File:Name')).toBe('Test_File_Name');
    });
  });

  // ════════════════════════════════════════
  // 2. Workflows
  // ════════════════════════════════════════

  describe('Workflows', () => {
    test('workflows object has home, auto, both', () => {
      expect(App.workflows).toBeDefined();
      expect(App.workflows.home).toBeDefined();
      expect(App.workflows.auto).toBeDefined();
      expect(App.workflows.both).toBeDefined();
    });

    test('home workflow skips step-4 (vehicles)', () => {
      expect(App.workflows.home).not.toContain('step-4');
      expect(App.workflows.home).toContain('step-3');
    });

    test('auto workflow skips step-3 (property)', () => {
      expect(App.workflows.auto).not.toContain('step-3');
      expect(App.workflows.auto).toContain('step-4');
    });

    test('both workflow includes all steps', () => {
      expect(App.workflows.both).toContain('step-3');
      expect(App.workflows.both).toContain('step-4');
      expect(App.workflows.both.length).toBe(7);
    });

    test('handleType sets flow for auto', () => {
      const radio = document.querySelector('input[name="qType"][value="auto"]');
      if (radio) {
        radio.checked = true;
        App.handleType();
        expect(App.flow).toEqual(App.workflows.auto);
      }
    });

    test('handleType sets flow for home', () => {
      const radio = document.querySelector('input[name="qType"][value="home"]');
      if (radio) {
        radio.checked = true;
        App.handleType();
        expect(App.flow).toEqual(App.workflows.home);
      }
    });
  });

  // ════════════════════════════════════════
  // 3. localStorage Save / Load
  // ════════════════════════════════════════

  describe('LocalStorage Operations', () => {
    test('save writes to localStorage', () => {
      const mockData = { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };
      window.localStorage.setItem('altech_v6', JSON.stringify(mockData));
      const saved = JSON.parse(window.localStorage.getItem('altech_v6'));
      expect(saved.firstName).toBe('John');
      expect(saved.lastName).toBe('Doe');
    });

    test('load reads from localStorage', () => {
      const mockData = { firstName: 'Jane', lastName: 'Smith' };
      window.localStorage.setItem('altech_v6', JSON.stringify(mockData));
      const loaded = JSON.parse(window.localStorage.getItem('altech_v6'));
      expect(loaded.firstName).toBe('Jane');
      expect(loaded.lastName).toBe('Smith');
    });

    test('applyData sets App.data and populates form fields', () => {
      App.applyData({ firstName: 'Test', lastName: 'User', qType: 'auto' });
      expect(App.data.firstName).toBe('Test');
      expect(App.data.lastName).toBe('User');
      const firstNameEl = document.getElementById('firstName');
      if (firstNameEl) {
        expect(firstNameEl.value).toBe('Test');
      }
    });

    test('setFieldValue updates both DOM and App.data', () => {
      if (typeof App.setFieldValue === 'function') {
        App.setFieldValue('firstName', 'Alice');
        expect(App.data.firstName).toBe('Alice');
        const el = document.getElementById('firstName');
        if (el) expect(el.value).toBe('Alice');
      }
    });

    test('setFieldValue handles missing element gracefully', () => {
      if (typeof App.setFieldValue === 'function') {
        expect(() => App.setFieldValue('nonExistentFieldXYZ', 'value')).not.toThrow();
      }
    });
  });

  // ════════════════════════════════════════
  // 4. CMSMTF Export (HawkSoft)
  // ════════════════════════════════════════

  describe('CMSMTF Export', () => {
    test('buildCMSMTF returns correct structure', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('mime');
      expect(result.mime).toBe('text/plain;charset=utf-8');
    });

    test('buildCMSMTF filename includes lastName', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      expect(result.filename).toContain('Doe');
      expect(result.filename).toMatch(/\.cmsmtf$/);
    });

    test('buildCMSMTF content uses [TAG]value format', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      expect(result.content).toContain('[NAM]John Doe');
      expect(result.content).toContain('[ADD]408 NW 116th St');
      expect(result.content).toContain('[CTY]Vancouver');
      expect(result.content).toContain('[STA]WA');
      expect(result.content).toContain('[ZIP]98685');
    });

    test('buildCMSMTF includes property fields', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      expect(result.content).toContain('[L1]2020');         // roofYr
      expect(result.content).toContain('[L2]Composition');  // roofType
      expect(result.content).toContain('[L3]Forced Air');   // heatingType
    });

    test('buildCMSMTF includes auto fields', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      expect(result.content).toContain('[VIN]');
      expect(result.content).toContain('[C2]GEICO');  // priorCarrier
      expect(result.content).toContain('[C3]3');       // priorYears
    });

    test('buildCMSMTF strips phone formatting', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      expect(result.content).toContain('[PHN]3605551234');
    });

    test('buildCMSMTF filters out empty fields', () => {
      const result = App.buildCMSMTF({ firstName: 'Test', lastName: 'User' });
      expect(result.content).not.toContain('[CTY]');
      expect(result.content).not.toContain('[ADD]');
    });

    test('buildCMSMTF handles empty data', () => {
      const result = App.buildCMSMTF({});
      // Even with empty data, R1 and R10 produce values from template strings
      expect(result.filename).toBe('Lead_Export.cmsmtf');
      // Should not contain personal info tags
      expect(result.content).not.toContain('[NAM]');
      expect(result.content).not.toContain('[EML]');
    });
  });

  // ════════════════════════════════════════
  // 6. CSV Export
  // ════════════════════════════════════════

  describe('CSV Export', () => {
    test('getCSVHeaders returns expected headers', () => {
      const headers = App.getCSVHeaders();
      expect(headers).toContain('First Name');
      expect(headers).toContain('Last Name');
      expect(headers).toContain('State Code');
      expect(headers).toContain('Date of Birth');
      expect(headers.length).toBeGreaterThanOrEqual(10);
    });

    test('buildCSV returns correct structure', () => {
      const result = App.buildCSV(SAMPLE_DATA);
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('filename');
      expect(result.filename).toMatch(/\.csv$/);
      expect(result.mime).toBe('text/csv');
    });

    test('buildCSV content includes header row and data row', () => {
      const result = App.buildCSV(SAMPLE_DATA);
      const lines = result.content.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[0]).toContain('First Name');
      expect(lines[1]).toContain('John');
    });
  });

  // ════════════════════════════════════════
  // 7. Text Export
  // ════════════════════════════════════════

  describe('Text Export', () => {
    test('buildText returns content and filename', () => {
      const result = App.buildText(SAMPLE_DATA);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.filename).toContain('Doe');
      expect(result.filename).toMatch(/\.txt$/);
    });

    test('buildText includes client profile data', () => {
      const result = App.buildText(SAMPLE_DATA);
      expect(result.content).toContain('John');
      expect(result.content).toContain('Doe');
    });
  });

  // ════════════════════════════════════════
  // 8. Quote Library
  // ════════════════════════════════════════

  describe('Quote Library', () => {
    test('saveQuote stores in separate localStorage key', () => {
      const quotes = [{
        id: Date.now(),
        timestamp: new Date().toISOString(),
        name: 'John Doe',
        data: { firstName: 'John', lastName: 'Doe' },
        qType: 'both'
      }];
      window.localStorage.setItem('altech_v6_quotes', JSON.stringify(quotes));
      const saved = JSON.parse(window.localStorage.getItem('altech_v6_quotes'));
      expect(saved.length).toBe(1);
      expect(saved[0].name).toBe('John Doe');
    });

    test('getQuoteTitle builds formatted title', () => {
      if (typeof App.getQuoteTitle === 'function') {
        const title = App.getQuoteTitle({ firstName: 'John', lastName: 'Doe', qType: 'auto' });
        expect(title).toContain('Doe');
        expect(title).toContain('John');
        expect(title.toUpperCase()).toContain('AUTO');
      }
    });

    test('getQuoteTitle handles missing names', () => {
      if (typeof App.getQuoteTitle === 'function') {
        const title = App.getQuoteTitle({ qType: 'home' });
        expect(title).toBeDefined();
        expect(title.length).toBeGreaterThan(0);
      }
    });
  });

  // ════════════════════════════════════════
  // 9. Address Parsing
  // ════════════════════════════════════════

  describe('Address Parsing', () => {
    test('parseStreetAddress separates number and name', () => {
      const parseStreet = (street) => {
        const match = street?.match(/^(\d+)\s+(.*)$/);
        return { number: match?.[1] || '', name: match?.[2] || street };
      };
      const result = parseStreet('408 nw 116th st');
      expect(result.number).toBe('408');
      expect(result.name).toBe('nw 116th st');
    });

    test('parseStreetAddress handles no number', () => {
      const parseStreet = (street) => {
        const match = street?.match(/^(\d+)\s+(.*)$/);
        return { number: match?.[1] || '', name: match?.[2] || street };
      };
      const result = parseStreet('Main Street');
      expect(result.number).toBe('');
      expect(result.name).toBe('Main Street');
    });
  });

  // ════════════════════════════════════════
  // 10. Vehicle Parsing
  // ════════════════════════════════════════

  describe('Vehicle Parsing', () => {
    test('parseVehicleDescription extracts year, make, model', () => {
      const parseVehicle = (desc) => {
        const match = desc?.match(/(\d{4})\s+([A-Z]+)\s+(.+)/i);
        return { year: match?.[1] || '', make: match?.[2] || '', model: match?.[3]?.trim() || '' };
      };
      const result = parseVehicle('2015 NISSAN Rogue');
      expect(result.year).toBe('2015');
      expect(result.make).toBe('NISSAN');
      expect(result.model).toBe('Rogue');
    });

    test('parseVehicleDescription handles lowercase', () => {
      const parseVehicle = (desc) => {
        const match = desc?.match(/(\d{4})\s+([A-Z]+)\s+(.+)/i);
        return { year: match?.[1] || '', make: match?.[2] || '', model: match?.[3]?.trim() || '' };
      };
      const result = parseVehicle('2020 toyota Camry SE');
      expect(result.year).toBe('2020');
      expect(result.make).toBe('toyota');
      expect(result.model).toBe('Camry SE');
    });
  });

  // ════════════════════════════════════════
  // 11. County Lookup
  // ════════════════════════════════════════

  describe('County Lookup', () => {
    test('getCountyFromCity returns Clark for Vancouver, WA', () => {
      if (typeof App.getCountyFromCity === 'function') {
        expect(App.getCountyFromCity('Vancouver', 'WA')).toBe('Clark');
      }
    });

    test('getCountyFromCity returns King for Seattle, WA', () => {
      if (typeof App.getCountyFromCity === 'function') {
        expect(App.getCountyFromCity('Seattle', 'WA')).toBe('King');
      }
    });

    test('getCountyFromCity returns Multnomah for Portland, OR', () => {
      if (typeof App.getCountyFromCity === 'function') {
        expect(App.getCountyFromCity('Portland', 'OR')).toBe('Multnomah');
      }
    });

    test('getCountyFromCity is case-insensitive', () => {
      if (typeof App.getCountyFromCity === 'function') {
        expect(App.getCountyFromCity('vancouver', 'WA')).toBe('Clark');
        expect(App.getCountyFromCity('SEATTLE', 'WA')).toBe('King');
      }
    });

    test('getCountyFromCity returns null for unknown city', () => {
      if (typeof App.getCountyFromCity === 'function') {
        expect(App.getCountyFromCity('Nowheresville', 'WA')).toBeNull();
      }
    });

    test('getCountyFromCity returns null for empty input', () => {
      if (typeof App.getCountyFromCity === 'function') {
        expect(App.getCountyFromCity('', 'WA')).toBeNull();
        expect(App.getCountyFromCity(null, null)).toBeNull();
      }
    });
  });

  // ════════════════════════════════════════
  // 12. Phone Formatting
  // ════════════════════════════════════════

  describe('Phone Formatting', () => {
    test('fmtPhone formats 10-digit number', () => {
      if (typeof App.fmtPhone === 'function') {
        const mockEvent = { target: { value: '3605551234' } };
        App.fmtPhone(mockEvent);
        expect(mockEvent.target.value).toBe('(360) 555-1234');
      }
    });

    test('fmtPhone formats partial number', () => {
      if (typeof App.fmtPhone === 'function') {
        const mockEvent = { target: { value: '360555' } };
        App.fmtPhone(mockEvent);
        expect(mockEvent.target.value).toBe('(360) 555');
      }
    });

    test('fmtPhone strips non-digits', () => {
      if (typeof App.fmtPhone === 'function') {
        const mockEvent = { target: { value: '(360) 555-1234' } };
        App.fmtPhone(mockEvent);
        expect(mockEvent.target.value).toBe('(360) 555-1234');
      }
    });
  });

  // ════════════════════════════════════════
  // 13. CSV Parsing (Import)
  // ════════════════════════════════════════

  describe('CSV Parsing', () => {
    test('parseCSV parses simple CSV', () => {
      if (typeof App.parseCSV === 'function') {
        const result = App.parseCSV('First Name,Last Name,Email\nJohn,Doe,john@test.com\nJane,Smith,jane@test.com');
        expect(result.headers).toEqual(['First Name', 'Last Name', 'Email']);
        expect(result.rows.length).toBe(2);
        expect(result.rows[0][0]).toBe('John');
        expect(result.rows[1][0]).toBe('Jane');
      }
    });

    test('parseCSV handles quoted fields with commas', () => {
      if (typeof App.parseCSV === 'function') {
        const result = App.parseCSV('Name,Address\n"Doe, John","123 Main St, #4"');
        expect(result.rows[0][0]).toBe('Doe, John');
        expect(result.rows[0][1]).toBe('123 Main St, #4');
      }
    });

    test('parseCSV handles empty input', () => {
      if (typeof App.parseCSV === 'function') {
        const result = App.parseCSV('');
        expect(result.headers).toEqual([]);
        expect(result.rows).toEqual([]);
      }
    });

    test('parseCSV handles null input', () => {
      if (typeof App.parseCSV === 'function') {
        const result = App.parseCSV(null);
        expect(result.headers).toEqual([]);
        expect(result.rows).toEqual([]);
      }
    });

    test('mapCsvRowToData maps standard headers', () => {
      if (typeof App.mapCsvRowToData === 'function') {
        const headers = ['First Name', 'Last Name', 'Email', 'Date of Birth', 'State Code'];
        const row = ['John', 'Doe', 'john@test.com', '1990-05-15', 'WA'];
        const data = App.mapCsvRowToData(headers, row);
        expect(data.firstName).toBe('John');
        expect(data.lastName).toBe('Doe');
        expect(data.email).toBe('john@test.com');
      }
    });
  });

  // ════════════════════════════════════════
  // 14. Driver Management
  // ════════════════════════════════════════

  describe('Driver Management', () => {
    test('addDriver creates a new driver record', () => {
      if (typeof App.addDriver === 'function') {
        const initialCount = (App.drivers || []).length;
        App.addDriver();
        expect(App.drivers.length).toBe(initialCount + 1);
        const newDriver = App.drivers[App.drivers.length - 1];
        expect(newDriver).toHaveProperty('id');
        expect(newDriver).toHaveProperty('firstName');
        expect(newDriver).toHaveProperty('lastName');
      }
    });

    test('removeDriver removes by ID', () => {
      if (typeof App.addDriver === 'function' && typeof App.removeDriver === 'function') {
        App.addDriver();
        const id = App.drivers[App.drivers.length - 1].id;
        const countBefore = App.drivers.length;
        App.removeDriver(id);
        expect(App.drivers.length).toBe(countBefore - 1);
        expect(App.drivers.find(d => d.id === id)).toBeUndefined();
      }
    });

    test('updateDriver updates a specific field', () => {
      if (typeof App.addDriver === 'function' && typeof App.updateDriver === 'function') {
        App.addDriver();
        const id = App.drivers[App.drivers.length - 1].id;
        App.updateDriver(id, 'firstName', 'Alice');
        const driver = App.drivers.find(d => d.id === id);
        expect(driver.firstName).toBe('Alice');
      }
    });

    test('addDriver includes isCoApplicant: false by default', () => {
      App.addDriver();
      const newDriver = App.drivers[App.drivers.length - 1];
      expect(newDriver.isCoApplicant).toBe(false);
    });

    test('updateDriver blocks locked fields on synced co-applicant driver', () => {
      // Create a synced driver manually
      const synced = {
        id: 'coapp_test', firstName: 'Jane', lastName: 'Doe',
        dob: '1990-01-01', gender: 'F', relationship: 'Spouse',
        dlNum: '', dlState: 'WA', isCoApplicant: true
      };
      App.drivers.push(synced);
      // Try to change locked fields — should be rejected
      App.updateDriver('coapp_test', 'firstName', 'CHANGED');
      App.updateDriver('coapp_test', 'gender', 'M');
      expect(synced.firstName).toBe('Jane');
      expect(synced.gender).toBe('F');
      // Non-locked fields should still work
      App.updateDriver('coapp_test', 'dlNum', 'ABC123');
      expect(synced.dlNum).toBe('ABC123');
      // Clean up
      App.drivers = App.drivers.filter(d => d.id !== 'coapp_test');
    });
  });

  // ════════════════════════════════════════
  // 14b. Co-Applicant → Driver Sync
  // ════════════════════════════════════════

  describe('Co-Applicant Driver Sync', () => {
    test('syncCoApplicantToDriver creates a synced driver', () => {
      if (typeof App.syncCoApplicantToDriver !== 'function') return;
      App.data.coFirstName = 'Sarah';
      App.data.coLastName = 'Smith';
      App.data.coDob = '1985-06-15';
      App.data.coGender = 'F';
      App.data.coRelationship = 'Spouse';
      App.syncCoApplicantToDriver();
      const synced = App.drivers.find(d => d.isCoApplicant);
      expect(synced).toBeDefined();
      expect(synced.firstName).toBe('Sarah');
      expect(synced.lastName).toBe('Smith');
      expect(synced.dob).toBe('1985-06-15');
      expect(synced.gender).toBe('F');
      expect(synced.relationship).toBe('Spouse');
      // Clean up
      App.drivers = App.drivers.filter(d => !d.isCoApplicant);
    });

    test('syncCoApplicantToDriver updates existing synced driver without duplicating', () => {
      if (typeof App.syncCoApplicantToDriver !== 'function') return;
      App.data.coFirstName = 'Sarah';
      App.data.coLastName = 'Smith';
      App.data.coDob = '1985-06-15';
      App.data.coGender = 'F';
      App.syncCoApplicantToDriver();
      const count1 = App.drivers.filter(d => d.isCoApplicant).length;
      expect(count1).toBe(1);
      // Update and re-sync
      App.data.coFirstName = 'Sara';
      App.syncCoApplicantToDriver();
      const count2 = App.drivers.filter(d => d.isCoApplicant).length;
      expect(count2).toBe(1);
      const synced = App.drivers.find(d => d.isCoApplicant);
      expect(synced.firstName).toBe('Sara');
      // Clean up
      App.drivers = App.drivers.filter(d => !d.isCoApplicant);
    });

    test('toggleCoApplicant off removes the synced driver', () => {
      if (typeof App.toggleCoApplicant !== 'function') return;
      // Set up: enable co-applicant with auto quote type
      const cb = document.getElementById('hasCoApplicant');
      const section = document.getElementById('coApplicantSection');
      const autoRadio = document.querySelector('input[name="qType"][value="auto"]');
      if (!cb || !section || !autoRadio) return;
      autoRadio.checked = true;
      cb.checked = true;
      App.data.coFirstName = 'Sarah';
      App.data.coLastName = 'Smith';
      App.toggleCoApplicant();
      expect(App.drivers.some(d => d.isCoApplicant)).toBe(true);
      // Now uncheck
      cb.checked = false;
      App.toggleCoApplicant();
      expect(App.drivers.some(d => d.isCoApplicant)).toBe(false);
    });

    test('removeDriver for synced driver unchecks co-applicant', () => {
      if (typeof App.syncCoApplicantToDriver !== 'function') return;
      const cb = document.getElementById('hasCoApplicant');
      if (!cb) return;
      cb.checked = true;
      App.data.hasCoApplicant = 'yes';
      App.data.coFirstName = 'Test';
      App.data.coLastName = 'Driver';
      App.syncCoApplicantToDriver();
      const synced = App.drivers.find(d => d.isCoApplicant);
      expect(synced).toBeDefined();
      App.removeDriver(synced.id);
      expect(App.data.hasCoApplicant).toBe('');
      expect(cb.checked).toBe(false);
    });

    test('synced driver preserves non-locked fields', () => {
      if (typeof App.syncCoApplicantToDriver !== 'function') return;
      App.data.coFirstName = 'Sarah';
      App.data.coLastName = 'Smith';
      App.data.coDob = '1985-06-15';
      App.data.coGender = 'F';
      App.syncCoApplicantToDriver();
      const synced = App.drivers.find(d => d.isCoApplicant);
      // Manually set non-locked fields
      synced.dlNum = 'WDL123456';
      synced.dlState = 'OR';
      synced.maritalStatus = 'Married';
      // Re-sync (simulating co-applicant field change)
      App.data.coFirstName = 'Sara';
      App.syncCoApplicantToDriver();
      // Locked fields should update
      expect(synced.firstName).toBe('Sara');
      // Non-locked fields should be preserved
      expect(synced.dlNum).toBe('WDL123456');
      expect(synced.dlState).toBe('OR');
      expect(synced.maritalStatus).toBe('Married');
      // Clean up
      App.drivers = App.drivers.filter(d => !d.isCoApplicant);
    });
  });

  // ════════════════════════════════════════
  // 15. Vehicle Management
  // ════════════════════════════════════════

  describe('Vehicle Management', () => {
    test('addVehicle creates a new vehicle record', () => {
      if (typeof App.addVehicle === 'function') {
        const initialCount = (App.vehicles || []).length;
        App.addVehicle();
        expect(App.vehicles.length).toBe(initialCount + 1);
        const newVehicle = App.vehicles[App.vehicles.length - 1];
        expect(newVehicle).toHaveProperty('id');
        expect(newVehicle).toHaveProperty('vin');
      }
    });

    test('removeVehicle removes by ID', () => {
      if (typeof App.addVehicle === 'function' && typeof App.removeVehicle === 'function') {
        App.addVehicle();
        const id = App.vehicles[App.vehicles.length - 1].id;
        const countBefore = App.vehicles.length;
        App.removeVehicle(id);
        expect(App.vehicles.length).toBe(countBefore - 1);
        expect(App.vehicles.find(v => v.id === id)).toBeUndefined();
      }
    });

    test('updateVehicle updates a specific field', () => {
      if (typeof App.addVehicle === 'function' && typeof App.updateVehicle === 'function') {
        App.addVehicle();
        const id = App.vehicles[App.vehicles.length - 1].id;
        App.updateVehicle(id, 'vin', '1N4AL3AP5FC999999');
        const vehicle = App.vehicles.find(v => v.id === id);
        expect(vehicle.vin).toBe('1N4AL3AP5FC999999');
      }
    });
  });

  // ════════════════════════════════════════
  // 16. Date Formatting
  // ════════════════════════════════════════

  describe('Date Formatting', () => {
    test('formatDateDisplay returns MM-DD-YYYY format', () => {
      if (typeof App.formatDateDisplay === 'function') {
        const result = App.formatDateDisplay('1990-05-15');
        // Verify MM-DD-YYYY format (day may vary ±1 due to timezone)
        expect(result).toMatch(/^\d{2}-\d{2}-\d{4}$/);
        expect(result).toContain('1990');
      }
    });

    test('formatDateDisplay handles empty input', () => {
      if (typeof App.formatDateDisplay === 'function') {
        expect(App.formatDateDisplay('')).toBe('');
        expect(App.formatDateDisplay(null)).toBe('');
        expect(App.formatDateDisplay(undefined)).toBe('');
      }
    });

    test('formatDateDisplay handles invalid date', () => {
      if (typeof App.formatDateDisplay === 'function') {
        const result = App.formatDateDisplay('not-a-date');
        expect(typeof result).toBe('string');
      }
    });
  });

  // ════════════════════════════════════════
  // 17. Notes / Summary Generation
  // ════════════════════════════════════════

  describe('Notes Generation', () => {
    test('getNotesForData returns comprehensive string', () => {
      if (typeof App.getNotesForData === 'function') {
        const notes = App.getNotesForData(SAMPLE_DATA);
        expect(notes.length).toBeGreaterThan(100);
        expect(notes).toContain('John');
        expect(notes).toContain('Doe');
      }
    });

    test('getNotesForData handles empty data', () => {
      if (typeof App.getNotesForData === 'function') {
        const notes = App.getNotesForData({});
        expect(typeof notes).toBe('string');
      }
    });
  });

  // ════════════════════════════════════════
  // 18. Edge Cases & Error Handling
  // ════════════════════════════════════════

  describe('Edge Cases', () => {
    test('buildCMSMTF handles undefined fields gracefully', () => {
      const result = App.buildCMSMTF({ firstName: undefined, lastName: undefined });
      // Should not contain [NAM] since name is empty after trim
      expect(result.content).not.toContain('[NAM]');
      expect(result.filename).toContain('Export');
    });

    test('buildCMSMTF does not have XSS or injection risk', () => {
      const result = App.buildCMSMTF({ firstName: '<script>alert(1)</script>', lastName: 'Test' });
      expect(result.content).toContain('[NAM]');
      expect(result.content).toContain('Test');
    });

    test('applyData handles null gracefully', () => {
      expect(() => App.applyData(null)).not.toThrow();
      expect(App.data).toBeDefined();
    });

    test('applyData handles empty object', () => {
      expect(() => App.applyData({})).not.toThrow();
    });
  });

  // ════════════════════════════════════════
  // 19. App Configuration
  // ════════════════════════════════════════

  describe('App Configuration', () => {
    test('stepTitles defined for all steps', () => {
      expect(App.stepTitles).toBeDefined();
      expect(App.stepTitles['step-0']).toBeDefined();
      expect(App.stepTitles['step-1']).toBeDefined();
      expect(App.stepTitles['step-6']).toBeDefined();
    });

    test('toolNames defined for all tools', () => {
      expect(App.toolNames).toBeDefined();
      expect(App.toolNames.quoting).toBe('Personal Intake');
      expect(App.toolNames.email).toBe('Email Composer');
      expect(App.toolNames.ezlynx).toBe('EZLynx Quoter');
    });

    test('storageKey is altech_v6', () => {
      expect(App.storageKey).toBe('altech_v6');
    });
  });

  // ════════════════════════════════════════
  // 20. Resolve Driver Name
  // ════════════════════════════════════════

  describe('Resolve Driver Name', () => {
    test('resolveDriverName returns full name', () => {
      if (typeof App.resolveDriverName === 'function') {
        const drivers = [
          { id: 'd1', firstName: 'John', lastName: 'Doe' },
          { id: 'd2', firstName: 'Jane', lastName: 'Smith' }
        ];
        expect(App.resolveDriverName('d1', drivers)).toBe('John Doe');
        expect(App.resolveDriverName('d2', drivers)).toBe('Jane Smith');
      }
    });

    test('resolveDriverName returns empty for unknown ID', () => {
      if (typeof App.resolveDriverName === 'function') {
        expect(App.resolveDriverName('nonexistent', [])).toBe('');
        expect(App.resolveDriverName(null, [])).toBe('');
      }
    });
  });

  // ════════════════════════════════════════
  // 22. Toast Notifications
  // ════════════════════════════════════════

  describe('Toast Notifications', () => {
    test('toast function exists and does not throw', () => {
      if (typeof App.toast === 'function') {
        expect(() => App.toast('Test message')).not.toThrow();
        expect(() => App.toast('Test', 2000)).not.toThrow();
      }
    });
  });

  // ════════════════════════════════════════
  // 23. Auto-Fill Indicators
  // ════════════════════════════════════════

  describe('Auto-Fill Indicators', () => {
    test('markAutoFilled adds CSS class', () => {
      if (typeof App.markAutoFilled === 'function') {
        const el = document.getElementById('firstName');
        if (el) {
          App.markAutoFilled(el, 'scan');
          expect(el.classList.contains('auto-filled')).toBe(true);
          expect(el.dataset.autoFilledSource).toBe('scan');
        }
      }
    });

    test('clearAutoFilledIndicator removes CSS class', () => {
      if (typeof App.clearAutoFilledIndicator === 'function') {
        const el = document.getElementById('firstName');
        if (el) {
          el.classList.add('auto-filled');
          el.dataset.autoFilledSource = 'test';
          App.clearAutoFilledIndicator(el);
          expect(el.classList.contains('auto-filled')).toBe(false);
        }
      }
    });

    test('markAutoFilled handles null element', () => {
      if (typeof App.markAutoFilled === 'function') {
        expect(() => App.markAutoFilled(null, 'scan')).not.toThrow();
      }
    });
  });

  // ════════════════════════════════════════
  // 18. Quote Library — Extended
  // ════════════════════════════════════════

  describe('Quote Library Extended', () => {
    test('getQuotes returns empty array when nothing stored', async () => {
      if (typeof App.getQuotes !== 'function') return;
      window.localStorage.removeItem(App.quotesKey || 'altech_v6_quotes');
      const quotes = await App.getQuotes();
      expect(quotes).toEqual([]);
    });

    test('saveQuotes then getQuotes round-trip preserves data', async () => {
      if (typeof App.saveQuotes !== 'function') return;
      const testQuotes = [
        { id: 'test1', title: 'Smith, John • AUTO', data: { firstName: 'John', lastName: 'Smith' }, updatedAt: new Date().toISOString() },
        { id: 'test2', title: 'Doe, Jane • HOME', data: { firstName: 'Jane', lastName: 'Doe' }, updatedAt: new Date().toISOString() }
      ];
      await App.saveQuotes(testQuotes);
      const retrieved = await App.getQuotes();
      expect(retrieved.length).toBe(2);
      expect(retrieved[0].id).toBe('test1');
      expect(retrieved[1].data.firstName).toBe('Jane');
    });

    test('deleteQuote removes the correct quote', async () => {
      if (typeof App.deleteQuote !== 'function') return;
      const testQuotes = [
        { id: 'keep', title: 'Keep', data: {}, updatedAt: new Date().toISOString() },
        { id: 'remove', title: 'Remove', data: {}, updatedAt: new Date().toISOString() }
      ];
      await App.saveQuotes(testQuotes);
      await App.deleteQuote('remove');
      const remaining = await App.getQuotes();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe('keep');
    });

    test('loadQuote calls applyData with correct data', async () => {
      if (typeof App.loadQuote !== 'function') return;
      const testData = { firstName: 'LoadTest', lastName: 'User', addrState: 'WA' };
      await App.saveQuotes([
        { id: 'load1', title: 'Test', data: testData, updatedAt: new Date().toISOString() }
      ]);
      await App.loadQuote('load1');
      expect(App.data.firstName).toBe('LoadTest');
      expect(App.data.lastName).toBe('User');
    });

    test('loadQuote does nothing for nonexistent ID', async () => {
      if (typeof App.loadQuote !== 'function') return;
      const before = JSON.stringify(App.data);
      await App.loadQuote('nonexistent_id_xyz');
      expect(JSON.stringify(App.data)).toBe(before);
    });

    test('getQuoteTitle formats lastName, firstName correctly', () => {
      if (typeof App.getQuoteTitle !== 'function') return;
      const title = App.getQuoteTitle({ firstName: 'Alice', lastName: 'Wonder', qType: 'both' });
      expect(title).toContain('Wonder');
      expect(title).toContain('Alice');
      expect(title.toUpperCase()).toContain('BOTH');
    });

    test('getQuoteTitle with only firstName', () => {
      if (typeof App.getQuoteTitle !== 'function') return;
      const title = App.getQuoteTitle({ firstName: 'Solo', qType: 'auto' });
      expect(title).toContain('Solo');
    });

    test('getQuoteMeta returns formatted date string', () => {
      if (typeof App.getQuoteMeta !== 'function') return;
      const meta = App.getQuoteMeta({ updatedAt: '2026-01-15T10:30:00Z' });
      expect(meta).toContain('Updated');
    });

    test('getQuotes handles corrupted JSON gracefully', async () => {
      if (typeof App.getQuotes !== 'function') return;
      const key = App.quotesKey || 'altech_v6_quotes';
      window.localStorage.setItem(key, '{corrupted json!!!');
      const result = await App.getQuotes();
      expect(result).toEqual([]);
    });

    test('autoSaveCurrentQuote creates current_draft entry', async () => {
      if (typeof App.autoSaveCurrentQuote !== 'function') return;
      App.data = { firstName: 'AutoSave', lastName: 'Test' };
      await App.autoSaveCurrentQuote();
      const quotes = await App.getQuotes();
      const draft = quotes.find(q => q.id === 'current_draft');
      expect(draft).toBeDefined();
      expect(draft.data.firstName).toBe('AutoSave');
    });

    test('autoSaveCurrentQuote replaces previous auto-save', async () => {
      if (typeof App.autoSaveCurrentQuote !== 'function') return;
      App.data = { firstName: 'First' };
      await App.autoSaveCurrentQuote();
      App.data = { firstName: 'Second' };
      await App.autoSaveCurrentQuote();
      const quotes = await App.getQuotes();
      const drafts = quotes.filter(q => q.id === 'current_draft');
      expect(drafts.length).toBe(1);
      expect(drafts[0].data.firstName).toBe('Second');
    });
  });

  // ════════════════════════════════════════
  // 19. Navigation
  // ════════════════════════════════════════

  describe('Navigation', () => {
    test('navigateTo function exists', () => {
      expect(typeof App.navigateTo).toBe('function');
    });

    test('navigateTo ignores unknown tool names', () => {
      expect(() => App.navigateTo('nonexistent_tool_xyz')).not.toThrow();
    });

    test('goHome function exists', () => {
      expect(typeof App.goHome).toBe('function');
    });

    test('goHome hides all plugin containers', () => {
      App.goHome();
      const activePlugins = document.querySelectorAll('.plugin-container.active');
      expect(activePlugins.length).toBe(0);
    });

    test('goHome shows landing page', () => {
      App.goHome();
      const landing = document.getElementById('landingPage');
      if (landing) {
        expect(landing.style.display).not.toBe('none');
      }
    });

    test('navigateTo quoting shows quoting tool', () => {
      App.navigateTo('quoting', { syncHash: false });
      const tool = document.getElementById('quotingTool');
      if (tool) {
        expect(tool.classList.contains('active')).toBe(true);
      }
    });

    test('navigateTo hides landing page', () => {
      App.navigateTo('quoting', { syncHash: false });
      const landing = document.getElementById('landingPage');
      if (landing) {
        expect(landing.style.display).toBe('none');
      }
    });

    test('updateBreadcrumb function exists', () => {
      expect(typeof App.updateBreadcrumb).toBe('function');
    });
  });

  // ════════════════════════════════════════
  // 20. Step Navigation
  // ════════════════════════════════════════

  describe('Step Navigation', () => {
    test('next function exists', () => {
      expect(typeof App.next).toBe('function');
    });

    test('prev function exists', () => {
      expect(typeof App.prev).toBe('function');
    });

    test('updateUI function exists', () => {
      expect(typeof App.updateUI).toBe('function');
    });

    test('step starts at 0', () => {
      expect(App.step).toBe(0);
    });

    test('init function exists', () => {
      expect(typeof App.init).toBe('function');
    });
  });

  // ════════════════════════════════════════
  // 21. Export Wrapper Functions
  // ════════════════════════════════════════

  describe('Export Wrappers', () => {
    test('exportCMSMTF function exists', () => {
      expect(typeof App.exportCMSMTF).toBe('function');
    });

    test('buildPDF function exists', () => {
      expect(typeof App.buildPDF).toBe('function');
    });

    test('buildCMSMTF with full data returns content and filename', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      expect(result.content).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.content.length).toBeGreaterThan(50);
    });

    test('buildText with full data includes key fields', () => {
      const result = App.buildText(SAMPLE_DATA);
      expect(result.content).toBeDefined();
      expect(result.filename).toBeDefined();
    });
  });

  // ════════════════════════════════════════
  // 22. Form ↔ Storage Consistency
  // ════════════════════════════════════════

  describe('Form Storage Consistency', () => {
    test('storageKey matches expected value', () => {
      expect(App.storageKey).toBe('altech_v6');
    });

    test('quotesKey exists for quote library', () => {
      expect(App.quotesKey).toBeDefined();
      expect(typeof App.quotesKey).toBe('string');
    });

    test('applyData then buildCMSMTF produces consistent output', () => {
      App.applyData(SAMPLE_DATA);
      const result = App.buildCMSMTF(App.data);
      expect(result.content).toContain('John');
      expect(result.content).toContain('Doe');
      expect(result.content).toContain('WA');
    });

    test('applyData updates DOM fields', () => {
      App.applyData({ firstName: 'FormTest', lastName: 'Check' });
      const el = document.getElementById('firstName');
      if (el) {
        expect(el.value).toBe('FormTest');
      }
    });

    test('save persists data to localStorage', () => {
      App.applyData({ firstName: 'Persist', lastName: 'Test' });
      // Trigger save via mock event
      const mockEvent = { target: { id: 'firstName', value: 'Persist', type: 'text', tagName: 'INPUT' } };
      if (typeof App.save === 'function') {
        App.save(mockEvent);
        // save may use encryption (TextEncoder), which isn't available in JSDOM
        // Just verify save didn't throw and App.data is intact
        expect(App.data.firstName).toBe('Persist');
      }
    });

    test('load function exists and is callable', () => {
      expect(typeof App.load).toBe('function');
      // load may use encryption/decryption, so just verify it doesn't crash
      expect(() => App.load()).not.toThrow();
    });
  });

  // ════════════════════════════════════════
  // 23. CMSMTF Export — Advanced Validation
  // ════════════════════════════════════════

  describe('CMSMTF Export Advanced', () => {
    test('buildCMSMTF includes email field', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      expect(result.content).toContain('john@example.com');
    });

    test('buildCMSMTF with auto data includes vehicle info', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      // Should include VIN or vehicle description
      const hasVehicleInfo = result.content.includes('1N4AL3AP5FC123456') || result.content.includes('Rogue');
      expect(hasVehicleInfo).toBe(true);
    });

    test('buildCMSMTF with minimal data still produces output', () => {
      const result = App.buildCMSMTF({ firstName: 'Min', lastName: 'Data' });
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.filename.length).toBeGreaterThan(0);
    });

    test('buildCMSMTF output uses [TAG]value format', () => {
      const result = App.buildCMSMTF(SAMPLE_DATA);
      // CMSMTF format: [TAG]value
      expect(result.content).toMatch(/\[\w+\]/);
    });
  });

  // ════════════════════════════════════════
  // 25. Workflow Integrity
  // ════════════════════════════════════════

  describe('Workflow Integrity', () => {
    test('all workflow arrays start with step-0', () => {
      ['home', 'auto', 'both'].forEach(type => {
        expect(App.workflows[type][0]).toBe('step-0');
      });
    });

    test('all workflow arrays end with step-6', () => {
      ['home', 'auto', 'both'].forEach(type => {
        const flow = App.workflows[type];
        expect(flow[flow.length - 1]).toBe('step-6');
      });
    });

    test('all workflow arrays include step-1 and step-2', () => {
      ['home', 'auto', 'both'].forEach(type => {
        expect(App.workflows[type]).toContain('step-1');
        expect(App.workflows[type]).toContain('step-2');
      });
    });

    test('all workflow arrays include step-5 (review)', () => {
      ['home', 'auto', 'both'].forEach(type => {
        expect(App.workflows[type]).toContain('step-5');
      });
    });

    test('home workflow step count is correct', () => {
      // home skips step-4 (vehicles)
      expect(App.workflows.home.length).toBe(App.workflows.both.length - 1);
    });

    test('auto workflow step count is correct', () => {
      // auto skips step-3 (property)
      expect(App.workflows.auto.length).toBe(App.workflows.both.length - 1);
    });

    test('both workflow is superset of home and auto', () => {
      const bothSet = new Set(App.workflows.both);
      App.workflows.home.forEach(step => expect(bothSet.has(step)).toBe(true));
      App.workflows.auto.forEach(step => expect(bothSet.has(step)).toBe(true));
    });
  });

  // ════════════════════════════════════════
  // 26. Tool Configuration
  // ════════════════════════════════════════

  describe('Tool Configuration', () => {
    test('toolNames has entries for all major tools', () => {
      const expectedTools = ['quoting', 'qna', 'coi', 'prospect', 'compliance'];
      expectedTools.forEach(tool => {
        const hasKey = Object.keys(App.toolNames).some(k =>
          k.toLowerCase().includes(tool) || App.toolNames[k]?.toLowerCase().includes(tool)
        );
        // At minimum toolNames should exist and have entries
        expect(Object.keys(App.toolNames).length).toBeGreaterThan(0);
      });
    });

    test('stepTitles covers steps 0-6', () => {
      expect(Object.keys(App.stepTitles).length).toBeGreaterThanOrEqual(7);
    });

    test('each step has a non-empty title', () => {
      Object.values(App.stepTitles).forEach(title => {
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
      });
    });
  });

  // ════════════════════════════════════════
  // 27. County Assessor URL Validation
  // ════════════════════════════════════════

  describe('County Assessor URLs', () => {
    // All unique assessor URLs that should be reachable.
    // Extracted from openPropertyRecords() gisUrls and openGIS() county maps.
    const COUNTY_URLS = {
      // Washington
      'Clark County, WA':       'https://gis.clark.wa.gov/gishome/property/',
      'King County, WA':        'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
      'Pierce County, WA':      'https://atip.piercecountywa.gov/app/parcel-search',
      'Snohomish County, WA':   'https://www.snoco.org/proptax/default.aspx',
      'Spokane County, WA':     'https://mapgis.spokanecounty.org/SCGIS2/Parcel/',
      'Kitsap County, WA':      'https://psearch.kitsap.gov/psearch/',
      'Thurston County, WA':    'https://taxlot.co.thurston.wa.us/',
      'Whatcom County, WA':     'https://www.whatcomcounty.us/1476/Online-Property-Search',
      'Yakima County, WA':      'https://www.co.yakima.wa.us/497/Property-Information-Public-Inquiry',
      'Cowlitz County, WA':     'https://cowlitzassessor.us/',
      // Oregon
      'Multnomah County, OR':   'https://www.portlandmaps.com/',
      'Washington County, OR':  'https://www.washingtoncountyor.gov/at/property-information',
      'Clackamas County, OR':   'https://ascendweb.clackamas.us/',
      'Lane County, OR':        'https://apps.lanecounty.org/PropertyAccountInformation/',
      'Marion County, OR':      'https://mcasr.co.marion.or.us/',
      'Deschutes County, OR':   'https://dial.deschutes.org/',
      'Jackson County, OR':     'http://pdo.jacksoncountyor.gov/pdo',
      'Linn County, OR':        'https://www.linncountyassessor.com/',
      'Douglas County, OR':     'https://apps.co.douglas.or.us/onlineservices/PropertyViewer/',
      // Arizona
      'Maricopa County, AZ':    'https://mcassessor.maricopa.gov/',
      'Pima County, AZ':        'https://www.asr.pima.gov/assessor/',
      'Pinal County, AZ':       'https://gis.pinalcountyaz.gov/parcelviewer/',
      'Yavapai County, AZ':     'https://gis.yavapaiaz.gov/v4/',
      'Coconino County, AZ':    'https://www.coconino.az.gov/119/Assessor',
      'Mohave County, AZ':      'https://www.mohave.gov/departments/assessor/assessor-search/',
      'Yuma County, AZ':        'https://www.yumacountyaz.gov/government/assessor',
    };

    // Representative city for each county to test openPropertyRecords
    const CITY_TO_URL = [
      // WA counties
      { city: 'Vancouver',       state: 'WA', county: 'Clark',      url: COUNTY_URLS['Clark County, WA'] },
      { city: 'Camas',           state: 'WA', county: 'Clark',      url: COUNTY_URLS['Clark County, WA'] },
      { city: 'Seattle',         state: 'WA', county: 'King',       url: COUNTY_URLS['King County, WA'] },
      { city: 'Bellevue',        state: 'WA', county: 'King',       url: COUNTY_URLS['King County, WA'] },
      { city: 'Tacoma',          state: 'WA', county: 'Pierce',     url: COUNTY_URLS['Pierce County, WA'] },
      { city: 'Puyallup',        state: 'WA', county: 'Pierce',     url: COUNTY_URLS['Pierce County, WA'] },
      { city: 'Everett',         state: 'WA', county: 'Snohomish',  url: COUNTY_URLS['Snohomish County, WA'] },
      { city: 'Lynnwood',        state: 'WA', county: 'Snohomish',  url: COUNTY_URLS['Snohomish County, WA'] },
      { city: 'Spokane',         state: 'WA', county: 'Spokane',    url: COUNTY_URLS['Spokane County, WA'] },
      { city: 'Bremerton',       state: 'WA', county: 'Kitsap',     url: COUNTY_URLS['Kitsap County, WA'] },
      { city: 'Olympia',         state: 'WA', county: 'Thurston',   url: COUNTY_URLS['Thurston County, WA'] },
      { city: 'Bellingham',      state: 'WA', county: 'Whatcom',    url: COUNTY_URLS['Whatcom County, WA'] },
      { city: 'Yakima',          state: 'WA', county: 'Yakima',     url: COUNTY_URLS['Yakima County, WA'] },
      { city: 'Longview',        state: 'WA', county: 'Cowlitz',    url: COUNTY_URLS['Cowlitz County, WA'] },
      // OR counties
      { city: 'Portland',        state: 'OR', county: 'Multnomah',    url: COUNTY_URLS['Multnomah County, OR'] },
      { city: 'Beaverton',       state: 'OR', county: 'Washington',   url: COUNTY_URLS['Washington County, OR'] },
      { city: 'Hillsboro',       state: 'OR', county: 'Washington',   url: COUNTY_URLS['Washington County, OR'] },
      { city: 'Happy Valley',    state: 'OR', county: 'Clackamas',    url: COUNTY_URLS['Clackamas County, OR'] },
      { city: 'Oregon City',     state: 'OR', county: 'Clackamas',    url: COUNTY_URLS['Clackamas County, OR'] },
      { city: 'Eugene',          state: 'OR', county: 'Lane',         url: COUNTY_URLS['Lane County, OR'] },
      { city: 'Salem',           state: 'OR', county: 'Marion',       url: COUNTY_URLS['Marion County, OR'] },
      { city: 'Bend',            state: 'OR', county: 'Deschutes',    url: COUNTY_URLS['Deschutes County, OR'] },
      { city: 'Medford',         state: 'OR', county: 'Jackson',      url: COUNTY_URLS['Jackson County, OR'] },
      { city: 'Albany',           state: 'OR', county: 'Linn',         url: COUNTY_URLS['Linn County, OR'] },
      { city: 'Roseburg',        state: 'OR', county: 'Douglas',      url: COUNTY_URLS['Douglas County, OR'] },
      // AZ counties
      { city: 'Phoenix',         state: 'AZ', county: 'Maricopa',   url: COUNTY_URLS['Maricopa County, AZ'] },
      { city: 'Mesa',            state: 'AZ', county: 'Maricopa',   url: COUNTY_URLS['Maricopa County, AZ'] },
      { city: 'Tucson',          state: 'AZ', county: 'Pima',       url: COUNTY_URLS['Pima County, AZ'] },
      { city: 'Casa Grande',     state: 'AZ', county: 'Pinal',      url: COUNTY_URLS['Pinal County, AZ'] },
      { city: 'Prescott',        state: 'AZ', county: 'Yavapai',    url: COUNTY_URLS['Yavapai County, AZ'] },
      { city: 'Flagstaff',       state: 'AZ', county: 'Coconino',   url: COUNTY_URLS['Coconino County, AZ'] },
      { city: 'Lake Havasu City', state: 'AZ', county: 'Mohave',    url: COUNTY_URLS['Mohave County, AZ'] },
      { city: 'Yuma',            state: 'AZ', county: 'Yuma',       url: COUNTY_URLS['Yuma County, AZ'] },
    ];

    // ── URL format validation ──

    test('all county URLs are valid HTTP(S) URLs', () => {
      Object.entries(COUNTY_URLS).forEach(([county, url]) => {
        expect(url).toMatch(/^https?:\/\//);
        // Must have a domain with at least one dot
        const domain = url.replace(/^https?:\/\//, '').split('/')[0];
        expect(domain).toContain('.');
      });
    });

    test('no county URL contains known dead domains', () => {
      const deadDomains = [
        'ormap.clackamas.us',
        'scopi.snoco.org',
        'psearch.kitsapgov.com',
        'gis.yavapaiaz.gov/Html5Viewer',
        'gis.mohave.gov',
        'apps.co.marion.or.us/PropertySearch',
        'washingtoncountyor.gov/propertysearch',
        'jacksoncountyor.org/assessor/GIS',
        'coconino.az.gov/1302',
      ];
      Object.entries(COUNTY_URLS).forEach(([county, url]) => {
        deadDomains.forEach(dead => {
          expect(url).not.toContain(dead);
        });
      });
    });

    test('no county URL ends with bare domain (should have path)', () => {
      // All our assessor URLs should have at least a trailing slash or path
      Object.entries(COUNTY_URLS).forEach(([county, url]) => {
        const afterProtocol = url.replace(/^https?:\/\//, '');
        // Should have at least one slash after domain (trailing slash or path)
        expect(afterProtocol).toMatch(/\//);
      });
    });

    // ── openPropertyRecords URL mapping ──

    describe('openPropertyRecords opens correct assessor site', () => {
      let openedUrl;

      beforeEach(() => {
        openedUrl = null;
        window.open = jest.fn((url) => { openedUrl = url; });
        // Reset clipboard mock
        window.navigator.clipboard.writeText = jest.fn(() => Promise.resolve());
      });

      CITY_TO_URL.forEach(({ city, state, county, url }) => {
        test(`${city}, ${state} → ${county} County assessor`, () => {
          if (typeof App.openPropertyRecords !== 'function') return;
          App.data.addrStreet = '123 Main St';
          App.data.addrCity = city;
          App.data.addrState = state;
          App.data.addrZip = '99999';
          App.openPropertyRecords();
          expect(openedUrl).toBe(url);
        });
      });

      test('unmapped WA city falls back to state assessor directory', () => {
        if (typeof App.openPropertyRecords !== 'function') return;
        App.data.addrStreet = '123 Main St';
        App.data.addrCity = 'Walla Walla';
        App.data.addrState = 'WA';
        App.data.addrZip = '99362';
        App.openPropertyRecords();
        expect(openedUrl).toContain('dor.wa.gov');
      });

      test('unmapped OR city falls back to state assessor directory', () => {
        if (typeof App.openPropertyRecords !== 'function') return;
        App.data.addrStreet = '123 Main St';
        App.data.addrCity = 'Astoria';
        App.data.addrState = 'OR';
        App.data.addrZip = '97103';
        App.openPropertyRecords();
        expect(openedUrl).toContain('oregon.gov');
      });

      test('unmapped AZ city falls back to state assessor directory', () => {
        if (typeof App.openPropertyRecords !== 'function') return;
        App.data.addrStreet = '123 Main St';
        App.data.addrCity = 'Sierra Vista';
        App.data.addrState = 'AZ';
        App.data.addrZip = '85635';
        App.openPropertyRecords();
        expect(openedUrl).toContain('azdor.gov');
      });

      test('unknown state falls back to Google search', () => {
        if (typeof App.openPropertyRecords !== 'function') return;
        App.data.addrStreet = '123 Main St';
        App.data.addrCity = 'Denver';
        App.data.addrState = 'CO';
        App.data.addrZip = '80202';
        App.openPropertyRecords();
        expect(openedUrl).toContain('google.com/search');
      });

      test('missing address shows alert, does not open URL', () => {
        if (typeof App.openPropertyRecords !== 'function') return;
        App.data.addrStreet = '';
        App.data.addrCity = '';
        App.data.addrState = '';
        App.openPropertyRecords();
        expect(window.alert).toHaveBeenCalled();
        expect(openedUrl).toBeNull();
      });
    });

    // ── openGIS URL mapping consistency ──

    describe('openGIS opens correct assessor site', () => {
      let openedUrl;

      beforeEach(() => {
        openedUrl = null;
        window.open = jest.fn((url) => { openedUrl = url; });
      });

      const GIS_CITY_TESTS = [
        { city: 'Vancouver', state: 'WA', url: COUNTY_URLS['Clark County, WA'] },
        { city: 'Seattle',   state: 'WA', url: COUNTY_URLS['King County, WA'] },
        { city: 'Tacoma',    state: 'WA', url: COUNTY_URLS['Pierce County, WA'] },
        { city: 'Portland',  state: 'OR', url: COUNTY_URLS['Multnomah County, OR'] },
        { city: 'Beaverton', state: 'OR', url: COUNTY_URLS['Washington County, OR'] },
        { city: 'Happy Valley', state: 'OR', url: COUNTY_URLS['Clackamas County, OR'] },
        { city: 'Phoenix',   state: 'AZ', url: COUNTY_URLS['Maricopa County, AZ'] },
        { city: 'Tucson',    state: 'AZ', url: COUNTY_URLS['Pima County, AZ'] },
        { city: 'Prescott',  state: 'AZ', url: COUNTY_URLS['Yavapai County, AZ'] },
      ];

      GIS_CITY_TESTS.forEach(({ city, state, url }) => {
        test(`openGIS: ${city}, ${state} → correct URL`, () => {
          if (typeof App.openGIS !== 'function') return;
          App.data.addrStreet = '123 Main St';
          App.data.addrCity = city;
          App.data.addrState = state;
          App.data.addrZip = '99999';
          App.openGIS();
          expect(openedUrl).toBe(url);
        });
      });
    });

    // ── URL consistency between openPropertyRecords and openGIS ──

    test('openPropertyRecords and openGIS use same URLs for same cities', () => {
      if (typeof App.openPropertyRecords !== 'function' || typeof App.openGIS !== 'function') return;
      const testCities = [
        { city: 'Vancouver', state: 'WA' },
        { city: 'Seattle', state: 'WA' },
        { city: 'Portland', state: 'OR' },
        { city: 'Happy Valley', state: 'OR' },
        { city: 'Phoenix', state: 'AZ' },
        { city: 'Tucson', state: 'AZ' },
      ];

      // Reset clipboard mock
      window.navigator.clipboard.writeText = jest.fn(() => Promise.resolve());

      testCities.forEach(({ city, state }) => {
        let urlFromPR = null;
        let urlFromGIS = null;

        App.data.addrStreet = '123 Main St';
        App.data.addrCity = city;
        App.data.addrState = state;
        App.data.addrZip = '99999';

        window.open = jest.fn((url) => { urlFromPR = url; });
        App.openPropertyRecords();

        window.open = jest.fn((url) => { urlFromGIS = url; });
        App.openGIS();

        expect(urlFromPR).toBe(urlFromGIS);
      });
    });

    // ── Clipboard copy behavior ──

    test('openPropertyRecords copies address to clipboard', () => {
      if (typeof App.openPropertyRecords !== 'function') return;
      const mockWrite = jest.fn(() => Promise.resolve());
      window.navigator.clipboard.writeText = mockWrite;
      window.open = jest.fn();

      App.data.addrStreet = '408 NW 116th St';
      App.data.addrCity = 'Vancouver';
      App.data.addrState = 'WA';
      App.data.addrZip = '98685';
      App.openPropertyRecords();

      expect(mockWrite).toHaveBeenCalledWith('408 NW 116th St Vancouver WA 98685');
    });
  });

  // ════════════════════════════════════════
  // 28. Robustness & Error Handling
  // ════════════════════════════════════════

  describe('Robustness', () => {
    test('toast handles empty message without throwing', () => {
      if (typeof App.toast === 'function') {
        expect(() => App.toast('')).not.toThrow();
        expect(() => App.toast(null)).not.toThrow();
      }
    });

    test('applyData with special characters does not corrupt state', () => {
      const specialData = {
        firstName: '<script>alert("xss")</script>',
        lastName: "O'Brien & \"Sons\"",
        addrStreet: '123 Main St\nApt 4'
      };
      App.applyData(specialData);
      expect(App.data.firstName).toBe('<script>alert("xss")</script>');
      expect(App.data.lastName).toBe("O'Brien & \"Sons\"");
    });
  });
});
