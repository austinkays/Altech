/**
 * API Tests: property-intelligence.js
 *
 * Tests pure utility functions:
 * - fuzzyMapLookup (fuzzy string matching)
 * - parseNum (safe integer parser)
 * - haversineDistance (great-circle distance)
 * - estimateProtectionClass (ISO protection class)
 * - isRespondingStation (fire station filtering)
 * - classifyStationReliability (station classification)
 *
 * Also validates module syntax and key constants.
 */

const fs = require('fs');
const path = require('path');

// ── Load pure functions from ESM source ──
function loadPropertyFunctions() {
  const source = fs.readFileSync(path.join(__dirname, '../api/property-intelligence.js'), 'utf8');
  const preamble = source.split(/^export\s+default\s+/m)[0];
  const cleaned = preamble
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+/gm, '');

  const extractFn = new Function(`
    ${cleaned}
    return {
      fuzzyMapLookup, parseNum,
      haversineDistance, estimateProtectionClass,
      isRespondingStation, classifyStationReliability,
      HEATING_MAP, COOLING_MAP, ROOF_MAP, FOUNDATION_MAP,
      CONSTRUCTION_MAP, EXTERIOR_MAP, COUNTY_ARCGIS_CONFIG,
      NON_RESPONDING_KEYWORDS
    };
  `);
  return extractFn();
}

let fns;

beforeAll(() => {
  fns = loadPropertyFunctions();
});

// ────────────────────────────────────────────────────
// Module Syntax
// ────────────────────────────────────────────────────

describe('property-intelligence.js — Module Syntax', () => {
  test('module source parses without errors', () => {
    const source = fs.readFileSync(path.join(__dirname, '../api/property-intelligence.js'), 'utf8');
    const cjsSafe = source
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s+default\s+/m, 'const __handler = ')
      .replace(/^export\s+/gm, '');
    expect(() => new Function(cjsSafe)).not.toThrow();
  });

  test('all utility functions loaded successfully', () => {
    expect(typeof fns.fuzzyMapLookup).toBe('function');
    expect(typeof fns.parseNum).toBe('function');
    expect(typeof fns.haversineDistance).toBe('function');
    expect(typeof fns.estimateProtectionClass).toBe('function');
    expect(typeof fns.isRespondingStation).toBe('function');
    expect(typeof fns.classifyStationReliability).toBe('function');
  });
});

// ────────────────────────────────────────────────────
// Key Constants
// ────────────────────────────────────────────────────

describe('Property Intelligence Constants', () => {
  test('COUNTY_ARCGIS_CONFIG has expected counties', () => {
    expect(fns.COUNTY_ARCGIS_CONFIG).toHaveProperty('Clark');
    expect(fns.COUNTY_ARCGIS_CONFIG).toHaveProperty('King');
    expect(fns.COUNTY_ARCGIS_CONFIG).toHaveProperty('Pierce');
    expect(fns.COUNTY_ARCGIS_CONFIG).toHaveProperty('Multnomah');
  });

  test('each county config has required fields', () => {
    for (const [county, config] of Object.entries(fns.COUNTY_ARCGIS_CONFIG)) {
      expect(config).toHaveProperty('state');
      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('fields');
      expect(Array.isArray(config.fields)).toBe(true);
    }
  });

  test('HEATING_MAP has common heating types', () => {
    expect(fns.HEATING_MAP['forced air']).toBe('Forced Air - Gas');
    expect(fns.HEATING_MAP['heat pump']).toBe('Heat Pump');
    expect(fns.HEATING_MAP['baseboard']).toBe('Electric Baseboard');
  });

  test('ROOF_MAP has standard roofing types', () => {
    expect(fns.ROOF_MAP['composition']).toBe('Asphalt/Composite Shingle');
    expect(fns.ROOF_MAP['metal']).toBe('Metal');
    expect(fns.ROOF_MAP['tile']).toBe('Clay Tile');
    expect(fns.ROOF_MAP['shake']).toBe('Wood Shake');
  });

  test('FOUNDATION_MAP covers common foundations', () => {
    expect(fns.FOUNDATION_MAP['slab']).toBe('Slab');
    expect(fns.FOUNDATION_MAP['crawl space']).toBe('Crawlspace');
    expect(fns.FOUNDATION_MAP['basement']).toBe('Basement (Unfinished)');
    expect(fns.FOUNDATION_MAP['finished basement']).toBe('Basement (Finished)');
  });
});

// ────────────────────────────────────────────────────
// fuzzyMapLookup
// ────────────────────────────────────────────────────

describe('fuzzyMapLookup', () => {
  const testMap = {
    'forced air': 'Forced Air - Gas',
    'heat pump': 'Heat Pump',
    'baseboard': 'Electric Baseboard',
    'electric baseboard': 'Electric Baseboard',
  };

  test('exact match', () => {
    expect(fns.fuzzyMapLookup('forced air', testMap)).toBe('Forced Air - Gas');
  });

  test('case insensitive match', () => {
    expect(fns.fuzzyMapLookup('Forced Air', testMap)).toBe('Forced Air - Gas');
    expect(fns.fuzzyMapLookup('HEAT PUMP', testMap)).toBe('Heat Pump');
  });

  test('partial match (input contains key)', () => {
    expect(fns.fuzzyMapLookup('gas forced air furnace', testMap)).toBe('Forced Air - Gas');
  });

  test('reverse partial match (key contains input)', () => {
    // 'baseboard' is a key, and 'electric baseboard' is also a key
    // Testing that a shorter input can match a longer key
    expect(fns.fuzzyMapLookup('electric', testMap)).toBe('Electric Baseboard');
  });

  test('returns null for no match', () => {
    expect(fns.fuzzyMapLookup('geothermal', testMap)).toBeNull();
  });

  test('returns null for null/undefined input', () => {
    expect(fns.fuzzyMapLookup(null, testMap)).toBeNull();
    expect(fns.fuzzyMapLookup(undefined, testMap)).toBeNull();
  });

  test('returns null for non-string input', () => {
    expect(fns.fuzzyMapLookup(123, testMap)).toBeNull();
  });

  test('handles whitespace', () => {
    expect(fns.fuzzyMapLookup('  heat pump  ', testMap)).toBe('Heat Pump');
  });
});

// ────────────────────────────────────────────────────
// parseNum
// ────────────────────────────────────────────────────

describe('parseNum', () => {
  test('parses integer', () => {
    expect(fns.parseNum(42)).toBe(42);
  });

  test('parses string integer', () => {
    expect(fns.parseNum('1985')).toBe(1985);
  });

  test('parses string with non-numeric chars', () => {
    expect(fns.parseNum('$2,500')).toBe(2500);
  });

  test('parses string with units', () => {
    expect(fns.parseNum('1500 sqft')).toBe(1500);
  });

  test('returns null for null', () => {
    expect(fns.parseNum(null)).toBeNull();
  });

  test('returns null for undefined', () => {
    expect(fns.parseNum(undefined)).toBeNull();
  });

  test('returns null for non-numeric string', () => {
    expect(fns.parseNum('abc')).toBeNull();
  });

  test('returns 0 for numeric 0', () => {
    expect(fns.parseNum(0)).toBe(0);
  });
});

// ────────────────────────────────────────────────────
// haversineDistance
// ────────────────────────────────────────────────────

describe('haversineDistance', () => {
  test('same point returns 0', () => {
    expect(fns.haversineDistance(47.6, -122.3, 47.6, -122.3)).toBe(0);
  });

  test('approximate Seattle to Portland (~145 miles)', () => {
    const dist = fns.haversineDistance(47.6062, -122.3321, 45.5152, -122.6784);
    expect(dist).toBeGreaterThan(140);
    expect(dist).toBeLessThan(150);
  });

  test('nearby points (< 1 mile)', () => {
    // Two points ~0.3 miles apart in Seattle
    const dist = fns.haversineDistance(47.6062, -122.3321, 47.610, -122.335);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(1);
  });
});

// ────────────────────────────────────────────────────
// estimateProtectionClass
// ────────────────────────────────────────────────────

describe('estimateProtectionClass', () => {
  test('< 1 mile → class 4', () => {
    expect(fns.estimateProtectionClass(0.5)).toBe(4);
  });

  test('1-2 miles → class 5', () => {
    expect(fns.estimateProtectionClass(1.5)).toBe(5);
  });

  test('2-3 miles → class 6', () => {
    expect(fns.estimateProtectionClass(2.5)).toBe(6);
  });

  test('3-4 miles → class 7', () => {
    expect(fns.estimateProtectionClass(3.5)).toBe(7);
  });

  test('4-5 miles → class 8', () => {
    expect(fns.estimateProtectionClass(4.5)).toBe(8);
  });

  test('5-7 miles → class 9', () => {
    expect(fns.estimateProtectionClass(6)).toBe(9);
  });

  test('7+ miles → class 10', () => {
    expect(fns.estimateProtectionClass(10)).toBe(10);
    expect(fns.estimateProtectionClass(50)).toBe(10);
  });

  test('boundary: exactly 1 mile → class 5', () => {
    expect(fns.estimateProtectionClass(1)).toBe(5);
  });
});

// ────────────────────────────────────────────────────
// isRespondingStation
// ────────────────────────────────────────────────────

describe('isRespondingStation', () => {
  test('accepts regular fire station', () => {
    expect(fns.isRespondingStation({ name: 'Station 5', types: ['fire_station'] })).toBe(true);
  });

  test('rejects training center', () => {
    expect(fns.isRespondingStation({ name: 'Fire Training Center', types: [] })).toBe(false);
  });

  test('rejects administrative office', () => {
    expect(fns.isRespondingStation({ name: 'Fire Admin Building', types: [] })).toBe(false);
  });

  test('accepts station with training in name if also has "station"', () => {
    expect(fns.isRespondingStation({ name: 'Station 5 Training Center', types: ['fire_station'] })).toBe(true);
  });

  test('rejects fire prevention office', () => {
    expect(fns.isRespondingStation({ name: 'Fire Prevention Office', types: [] })).toBe(false);
  });

  test('rejects museum', () => {
    expect(fns.isRespondingStation({ name: 'Historical Fire Museum', types: [] })).toBe(false);
  });

  test('handles empty name', () => {
    expect(fns.isRespondingStation({ name: '', types: ['fire_station'] })).toBe(true);
  });

  test('handles missing name', () => {
    expect(fns.isRespondingStation({ types: ['fire_station'] })).toBe(true);
  });
});

// ────────────────────────────────────────────────────
// classifyStationReliability
// ────────────────────────────────────────────────────

describe('classifyStationReliability', () => {
  test('classifies volunteer station', () => {
    expect(fns.classifyStationReliability({ name: 'Volunteer Fire Company 7' })).toBe('volunteer');
  });

  test('classifies regular station as "responding"', () => {
    expect(fns.classifyStationReliability({ name: 'Fire Station 12' })).toBe('responding');
  });

  test('classifies admin/training as "review"', () => {
    expect(fns.classifyStationReliability({ name: 'Fire Training Facility' })).toBe('review');
  });

  test('classifies headquarters as "review"', () => {
    expect(fns.classifyStationReliability({ name: 'Fire Department Headquarters' })).toBe('review');
  });

  test('handles empty name as "responding"', () => {
    expect(fns.classifyStationReliability({ name: '' })).toBe('responding');
  });
});
