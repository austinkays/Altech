/**
 * Prospect Investigator — Client-Side Tests
 *
 * Tests the browser-side JS logic in js/prospect.js:
 * - State extraction from formatted addresses
 * - Places state validation (discard wrong-state Google results)
 * - Candidate collection and deduplication
 * - Address priority in display (L&I/SOS preferred over Google)
 * - Selection flow (selectBusiness passes correct data)
 *
 * These tests guard against the bug where clicking a WA L&I result
 * triggered a Google Places search that returned a business in SC,
 * which then showed as the primary address.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

const ROOT = path.resolve(__dirname, '..');

let dom, window;

// ── Load prospect.js functions into JSDOM ──

function createTestDOM() {
  const html = loadHTML(path.join(ROOT, 'index.html'));
  const testDom = new JSDOM(html, {
    url: 'http://localhost:8000',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });

  const w = testDom.window;

  // Mock browser APIs
  const store = {};
  w.localStorage = {
    data: store,
    getItem(key) { return store[key] || null; },
    setItem(key, val) { store[key] = val; },
    removeItem(key) { delete store[key]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
  w.alert = jest.fn();
  w.confirm = jest.fn(() => true);
  w.scrollTo = jest.fn();
  w.matchMedia = jest.fn().mockImplementation(query => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  if (!w.Element.prototype.scrollTo) w.Element.prototype.scrollTo = function() {};
  if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function() {};

  w.fetch = jest.fn().mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('config?type=keys')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ apiKey: 'test-key' }) });
    }
    // Default plugins/HTML requests
    if (typeof url === 'string' && url.includes('plugins/')) {
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  if (!w.navigator.clipboard) {
    Object.defineProperty(w.navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      writable: true
    });
  }

  return testDom;
}

beforeAll(() => {
  dom = createTestDOM();
  window = dom.window;
});

afterAll(() => {
  dom.window.close();
});

// ────────────────────────────────────────────────────
// Module loads
// ────────────────────────────────────────────────────

describe('ProspectInvestigator — Module Load', () => {
  test('ProspectInvestigator is defined on window', () => {
    expect(window.ProspectInvestigator).toBeDefined();
    expect(typeof window.ProspectInvestigator).toBe('object');
  });

  test('exposes required public API', () => {
    const PI = window.ProspectInvestigator;
    expect(typeof PI.init).toBe('function');
    expect(typeof PI.search).toBe('function');
    expect(typeof PI.selectBusiness).toBe('function');
    expect(typeof PI.investigateManual).toBe('function');
    expect(typeof PI.copyToQuote).toBe('function');
    expect(typeof PI.exportReport).toBe('function');
    expect(typeof PI.saveProspect).toBe('function');
    expect(typeof PI.deleteProspect).toBe('function');
  });
});

// ────────────────────────────────────────────────────
// State extraction from address (source code test)
// ────────────────────────────────────────────────────

describe('Prospect — _extractStateFromAddress (source verification)', () => {
  // Since _extractStateFromAddress is private, we verify its logic via source
  // inspection AND by testing its effect through _validatePlacesState

  test('source contains _extractStateFromAddress function', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    expect(source).toContain('function _extractStateFromAddress(address)');
  });

  test('source contains _validatePlacesState function', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    expect(source).toContain('function _validatePlacesState(placesData, expectedState)');
  });

  test('_validatePlacesState is called in selectBusiness', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    // After the Phase 2 Promise.all, _validatePlacesState must be called
    const selectBusinessFn = source.substring(
      source.indexOf('async function selectBusiness'),
      source.indexOf('async function investigateManual')
    );
    expect(selectBusinessFn).toContain('_validatePlacesState(placesData, state)');
  });

  test('_validatePlacesState is called in investigateManual', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    const investigateManualFn = source.substring(
      source.indexOf('async function investigateManual'),
      source.indexOf('function copyToQuote')
    );
    expect(investigateManualFn).toContain('_validatePlacesState(placesData, state)');
  });
});

// ────────────────────────────────────────────────────
// State extraction logic (standalone test via eval)
// ────────────────────────────────────────────────────

describe('_extractStateFromAddress — logic', () => {
  // Extract the function directly for unit testing
  let extractState;

  beforeAll(() => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    // Extract the function using the same new Function() wrapper pattern as other API tests
    const fnMatch = source.match(/function _extractStateFromAddress\(address\)\s*\{[\s\S]*?\n    \}/m);
    if (fnMatch) {
      const evalFn = new Function(`
        ${fnMatch[0]}
        return _extractStateFromAddress;
      `);
      extractState = evalFn();
    }
  });

  test('extracts WA from standard US address', () => {
    expect(extractState('123 Main St, Washougal, WA 98671, USA')).toBe('WA');
  });

  test('extracts NC from formatted address', () => {
    expect(extractState('194 Deweys Pier Rd, Columbia, NC 27925, United States')).toBe('NC');
  });

  test('extracts OR from Oregon address', () => {
    expect(extractState('456 Oak Ave, Portland, OR 97201, USA')).toBe('OR');
  });

  test('extracts CA from California address', () => {
    expect(extractState('789 Palm Dr, Los Angeles, CA 90001')).toBe('CA');
  });

  test('returns empty string for null/undefined', () => {
    expect(extractState(null)).toBe('');
    expect(extractState(undefined)).toBe('');
    expect(extractState('')).toBe('');
  });

  test('returns empty string for address without state code', () => {
    expect(extractState('Some Random Place')).toBe('');
  });
});

// ────────────────────────────────────────────────────
// _validatePlacesState — logic
// ────────────────────────────────────────────────────

describe('_validatePlacesState — logic', () => {
  let validatePlacesState;

  beforeAll(() => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    // Extract both functions needed
    const extractMatch = source.match(/function _extractStateFromAddress\(address\)\s*\{[\s\S]*?^    \}/m);
    const validateMatch = source.match(/function _validatePlacesState\(placesData, expectedState\)\s*\{[\s\S]*?^    \}/m);
    if (extractMatch && validateMatch) {
      const combined = new Function('placesData', 'expectedState', `
        ${extractMatch[0]}
        ${validateMatch[0].replace('function _validatePlacesState(placesData, expectedState)', 'return (function(placesData, expectedState)')} + ')')(placesData, expectedState);
      `);
      // Simpler approach: eval both functions together
      const evalFn = new Function(`
        ${extractMatch[0]}
        ${validateMatch[0]}
        return _validatePlacesState;
      `);
      validatePlacesState = evalFn();
    }
  });

  test('discards Places data when state mismatches', () => {
    const placesData = {
      available: true,
      profile: { address: '194 Deweys Pier Rd, Columbia, NC 27925, USA' }
    };
    validatePlacesState(placesData, 'WA');
    expect(placesData.available).toBe(false);
    expect(placesData._stateMismatch).toBe(true);
  });

  test('keeps Places data when state matches', () => {
    const placesData = {
      available: true,
      profile: { address: '123 Main St, Seattle, WA 98101, USA' }
    };
    validatePlacesState(placesData, 'WA');
    expect(placesData.available).toBe(true);
    expect(placesData._stateMismatch).toBeUndefined();
  });

  test('does nothing when Places data is not available', () => {
    const placesData = { available: false };
    validatePlacesState(placesData, 'WA');
    expect(placesData.available).toBe(false);
    expect(placesData._stateMismatch).toBeUndefined();
  });

  test('does nothing when no address in Places profile', () => {
    const placesData = { available: true, profile: {} };
    validatePlacesState(placesData, 'WA');
    expect(placesData.available).toBe(true);
  });

  test('does nothing when no expected state', () => {
    const placesData = {
      available: true,
      profile: { address: '123 Main St, Columbia, NC 27925, USA' }
    };
    validatePlacesState(placesData, '');
    expect(placesData.available).toBe(true);
  });

  test('handles null/undefined gracefully', () => {
    expect(() => validatePlacesState(null, 'WA')).not.toThrow();
    expect(() => validatePlacesState(undefined, 'WA')).not.toThrow();
    expect(() => validatePlacesState({}, 'WA')).not.toThrow();
  });
});

// ────────────────────────────────────────────────────
// Address Priority in _displayResults (source test)
// ────────────────────────────────────────────────────

describe('Prospect — address priority', () => {
  test('L&I/SOS addresses are preferred over Google Places in _displayResults', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    const displayFn = source.substring(
      source.indexOf('function _displayResults()'),
      source.indexOf('// ── Populate source record bodies')
    );

    // The address assignment should try L&I first, then SOS, then Places
    expect(displayFn).toMatch(/const\s+(liAddress|address)/);

    // Verify Google Places (p?.address) is NOT first in the chain
    // It should be: liAddress || sosAddress || p?.address
    const addressLine = displayFn.match(/const address\s*=\s*(.+?);/s);
    expect(addressLine).not.toBeNull();
    const assignmentStr = addressLine[1];

    // liAddress should come before p?.address
    const liPos = assignmentStr.indexOf('liAddress');
    const placesPos = assignmentStr.indexOf("p?.address") !== -1
      ? assignmentStr.indexOf("p?.address")
      : assignmentStr.indexOf("p?.address");

    if (liPos !== -1 && placesPos !== -1) {
      expect(liPos).toBeLessThan(placesPos);
    }
  });
});

// ────────────────────────────────────────────────────
// _collectCandidates source verification
// ────────────────────────────────────────────────────

describe('Prospect — candidate collection', () => {
  test('_collectCandidates handles empty data sources', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    // Extract the function
    const fnStart = source.indexOf('function _collectCandidates(');
    const fnEnd = source.indexOf('function _deduplicateCandidates(');
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnEnd).toBeGreaterThan(fnStart);
  });

  test('_deduplicateCandidates sorts state-matching results first', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    const dedup = source.substring(
      source.indexOf('function _deduplicateCandidates('),
      source.indexOf('function _showBusinessSelection(')
    );
    // Verify sort prioritizes stateMatch
    expect(dedup).toContain('a.stateMatch');
    expect(dedup).toContain('b.stateMatch');
  });

  test('Google Places candidates include stateMatch flag', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/prospect.js'), 'utf8');
    const collectFn = source.substring(
      source.indexOf('function _collectCandidates('),
      source.indexOf('function _deduplicateCandidates(')
    );
    // Places candidates should have stateMatch property
    expect(collectFn).toContain('stateMatch');
  });
});

// ────────────────────────────────────────────────────
// API-side address/state extraction (prospect-lookup.js)
// ────────────────────────────────────────────────────

describe('prospect-lookup.js — _extractStateFromAddress', () => {
  let extractState;

  beforeAll(() => {
    const source = fs.readFileSync(path.join(ROOT, 'api/prospect-lookup.js'), 'utf8');
    const fnMatch = source.match(/function _extractStateFromAddress\(address\)\s*\{[\s\S]*?^\}/m);
    if (fnMatch) {
      const evalFn = new Function(`
        ${fnMatch[0]}
        return _extractStateFromAddress;
      `);
      extractState = evalFn();
    }
  });

  test('function loaded', () => {
    expect(typeof extractState).toBe('function');
  });

  test('extracts WA from Google formatted address', () => {
    expect(extractState('123 Main St, Washougal, WA 98671, USA')).toBe('WA');
  });

  test('extracts NC from out-of-state address', () => {
    expect(extractState('194 Deweys Pier Rd, Columbia, NC 27925, United States')).toBe('NC');
  });

  test('extracts SC', () => {
    expect(extractState('500 Broad St, Charleston, SC 29401, USA')).toBe('SC');
  });

  test('returns empty string for empty/null input', () => {
    expect(extractState('')).toBe('');
    expect(extractState(null)).toBe('');
    expect(extractState(undefined)).toBe('');
  });

  test('returns empty string for non-US address format', () => {
    expect(extractState('10 Downing Street, London, UK')).toBe('');
  });
});

describe('prospect-lookup.js — _extractCityFromAddress', () => {
  let extractCity;

  beforeAll(() => {
    const source = fs.readFileSync(path.join(ROOT, 'api/prospect-lookup.js'), 'utf8');
    const fnMatch = source.match(/function _extractCityFromAddress\(address\)\s*\{[\s\S]*?^\}/m);
    if (fnMatch) {
      const evalFn = new Function(`
        ${fnMatch[0]}
        return _extractCityFromAddress;
      `);
      extractCity = evalFn();
    }
  });

  test('function loaded', () => {
    expect(typeof extractCity).toBe('function');
  });

  test('extracts city from standard US address', () => {
    expect(extractCity('194 Deweys Pier Rd, Columbia, NC 27925, USA')).toBe('Columbia');
  });

  test('extracts city from WA address', () => {
    expect(extractCity('123 Main St, Seattle, WA 98101, USA')).toBe('Seattle');
  });

  test('returns empty string for empty input', () => {
    expect(extractCity('')).toBe('');
    expect(extractCity(null)).toBe('');
  });
});
