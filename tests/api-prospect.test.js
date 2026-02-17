/**
 * API Tests: prospect-lookup.js
 *
 * Tests OSHA data parsing and WA SOS HTML parsing:
 * - calculateSummary (inspection data aggregation)
 * - parseInspections (raw DOL data → normalized inspections)
 * - parseViolations (raw violations → normalized format)
 * - parseWASOSHTML (HTML → business entity)
 *
 * Also validates module syntax.
 */

const fs = require('fs');
const path = require('path');

// ── Load functions from CJS source ──
// prospect-lookup.js is CJS (module.exports) — extract module-scoped helper functions
function loadProspectFunctions() {
  const source = fs.readFileSync(path.join(__dirname, '../api/prospect-lookup.js'), 'utf8');

  // The helpers (calculateSummary, parseInspections, parseViolations, parseWASOSHTML)
  // are defined at module scope AFTER the handler function.
  // We extract everything after the handler and before a hypothetical export.
  // Since it's CJS, the handler is: module.exports = async function handler(...) { ... }
  // Helper functions follow after the handler's closing '}'.

  // Strategy: eval the whole file in a sandbox, providing stub module/require
  const mockModule = { exports: {} };
  const mockRequire = () => ({});

  // We need to wrap in an async IIFE because the handler is async
  // But actually, we just need the pure functions at the bottom, not the handler.
  // Let's extract just the helper functions by finding them after the handler.

  // Find 'function calculateSummary' and extract from there to end of file
  const calcIdx = source.indexOf('function calculateSummary');
  const parseWAIdx = source.indexOf('function parseWASOSHTML');

  const helperCode = [
    source.substring(parseWAIdx, source.indexOf('function parseORSOSHTML')),
    source.substring(calcIdx)
  ].join('\n');

  const extractFn = new Function(`
    ${helperCode}
    return {
      calculateSummary, parseInspections, parseViolations, parseWASOSHTML
    };
  `);
  return extractFn();
}

let fns;

beforeAll(() => {
  fns = loadProspectFunctions();
});

// ────────────────────────────────────────────────────
// Module Syntax
// ────────────────────────────────────────────────────

describe('prospect-lookup.js — Module Syntax', () => {
  test('helper functions loaded successfully', () => {
    expect(typeof fns.calculateSummary).toBe('function');
    expect(typeof fns.parseInspections).toBe('function');
    expect(typeof fns.parseViolations).toBe('function');
    expect(typeof fns.parseWASOSHTML).toBe('function');
  });

  test('no duplicate function declarations in helpers', () => {
    const source = fs.readFileSync(path.join(__dirname, '../api/prospect-lookup.js'), 'utf8');
    const helpers = ['calculateSummary', 'parseInspections', 'parseViolations', 'parseWASOSHTML'];
    for (const name of helpers) {
      const matches = source.match(new RegExp(`^function ${name}\\b`, 'gm'));
      expect(matches).not.toBeNull();
      expect(matches.length).toBe(1);
    }
  });
});

// ────────────────────────────────────────────────────
// parseViolations
// ────────────────────────────────────────────────────

describe('parseViolations', () => {
  test('parses raw violation records', () => {
    const raw = [
      {
        citation_id: 'C-001',
        standard: '1926.501(b)(1)',
        viol_type: 'Serious',
        issuance_date: '2024-01-15',
        abate_date: '2024-03-01',
        current_penalty: '5000',
        initial_penalty: '7000',
        standard_description: 'Fall protection',
        abate_complete: 'Y'
      }
    ];
    const result = fns.parseViolations(raw);
    expect(result).toHaveLength(1);
    expect(result[0].citationNumber).toBe('C-001');
    expect(result[0].standardViolated).toBe('1926.501(b)(1)');
    expect(result[0].violationType).toBe('Serious');
    expect(result[0].currentPenalty).toBe(5000);
    expect(result[0].initialPenalty).toBe(7000);
    expect(result[0].abatementStatus).toBe('Completed');
  });

  test('returns "Pending" for non-abated violations', () => {
    const raw = [{ abate_complete: 'N' }];
    const result = fns.parseViolations(raw);
    expect(result[0].abatementStatus).toBe('Pending');
  });

  test('returns empty array for null input', () => {
    expect(fns.parseViolations(null)).toEqual([]);
    expect(fns.parseViolations(undefined)).toEqual([]);
  });

  test('returns empty array for non-array', () => {
    expect(fns.parseViolations('not an array')).toEqual([]);
  });

  test('handles missing fields gracefully', () => {
    const raw = [{}];
    const result = fns.parseViolations(raw);
    expect(result[0].citationNumber).toBe('');
    expect(result[0].currentPenalty).toBe(0);
    expect(result[0].abatementStatus).toBe('Pending');
  });
});

// ────────────────────────────────────────────────────
// parseInspections
// ────────────────────────────────────────────────────

describe('parseInspections', () => {
  test('parses raw OSHA inspection data', () => {
    const raw = [
      {
        activity_nr: '12345',
        open_date: '2024-06-01',
        insp_type: 'Planned',
        close_date: '2024-08-01',
        case_mod_date: '2024-08-15',
        naics_code: '236220',
        violations: [
          { citation_id: 'C-001', viol_type: 'Serious', current_penalty: '3000', abate_complete: 'Y' }
        ]
      }
    ];
    const result = fns.parseInspections(raw);
    expect(result).toHaveLength(1);
    expect(result[0].activityNumber).toBe('12345');
    expect(result[0].inspectionDate).toBe('2024-06-01');
    expect(result[0].inspectionType).toBe('Planned');
    expect(result[0].caseStatus).toBe('Closed');
    expect(result[0].violations).toHaveLength(1);
    expect(result[0].violations[0].violationType).toBe('Serious');
  });

  test('marks open cases (no case_mod_date) as Open', () => {
    const raw = [{ activity_nr: '1', case_mod_date: '' }];
    const result = fns.parseInspections(raw);
    expect(result[0].caseStatus).toBe('Open');
  });

  test('returns empty array for null input', () => {
    expect(fns.parseInspections(null)).toEqual([]);
    expect(fns.parseInspections(undefined)).toEqual([]);
  });
});

// ────────────────────────────────────────────────────
// calculateSummary
// ────────────────────────────────────────────────────

describe('calculateSummary', () => {
  test('returns zero-summary for empty input', () => {
    const result = fns.calculateSummary([]);
    expect(result.totalInspections).toBe(0);
    expect(result.seriousViolations).toBe(0);
    expect(result.totalPenalties).toBe(0);
    expect(result.lastInspection).toBeNull();
  });

  test('returns zero-summary for null', () => {
    const result = fns.calculateSummary(null);
    expect(result.totalInspections).toBe(0);
  });

  test('counts violations by type', () => {
    const inspections = [
      {
        inspectionDate: '2024-01-01',
        violations: [
          { violationType: 'Serious', currentPenalty: 5000 },
          { violationType: 'Serious', currentPenalty: 3000 },
          { violationType: 'Other', currentPenalty: 500 },
          { violationType: 'Willful', currentPenalty: 10000 },
          { violationType: 'Repeat', currentPenalty: 2000 },
        ]
      }
    ];
    const result = fns.calculateSummary(inspections);
    expect(result.totalInspections).toBe(1);
    expect(result.seriousViolations).toBe(2);
    expect(result.otherViolations).toBe(1);
    expect(result.willfulViolations).toBe(1);
    expect(result.repeatViolations).toBe(1);
    expect(result.totalPenalties).toBe(20500);
  });

  test('tracks latest inspection date', () => {
    const inspections = [
      { inspectionDate: '2023-01-01', violations: [] },
      { inspectionDate: '2024-06-15', violations: [] },
      { inspectionDate: '2024-03-01', violations: [] },
    ];
    const result = fns.calculateSummary(inspections);
    expect(result.lastInspection).toBe('2024-06-15');
    expect(result.totalInspections).toBe(3);
  });

  test('handles inspections with no violations array', () => {
    const inspections = [
      { inspectionDate: '2024-01-01' }
    ];
    const result = fns.calculateSummary(inspections);
    expect(result.totalInspections).toBe(1);
    expect(result.seriousViolations).toBe(0);
    expect(result.totalPenalties).toBe(0);
  });
});

// ────────────────────────────────────────────────────
// parseWASOSHTML
// ────────────────────────────────────────────────────

describe('parseWASOSHTML', () => {
  test('extracts fields from WA SOS HTML', () => {
    const html = `
      <div>UBI: 603-456-789</div>
      <div>Entity Name: Acme Construction LLC</div>
      <div>Status: Active</div>
      <div>Entity Type: Limited Liability Company</div>
    `;
    const result = fns.parseWASOSHTML(html, 'Acme', '603-456-789');
    expect(result.ubi).toBe('603-456-789');
    expect(result.businessName).toBe('Acme Construction LLC');
    expect(result.status).toBe('Active');
    expect(result.entityType).toBe('Limited Liability Company');
    expect(result.jurisdiction).toBe('WA');
  });

  test('falls back to parameters when HTML has no matches', () => {
    const result = fns.parseWASOSHTML('<div>nothing here</div>', 'Fallback Corp', '999-000-111');
    expect(result.businessName).toBe('Fallback Corp');
    expect(result.ubi).toBe('999-000-111');
    expect(result.jurisdiction).toBe('WA');
  });

  test('handles empty HTML', () => {
    const result = fns.parseWASOSHTML('', 'Test', '');
    expect(result.businessName).toBe('Test');
    expect(result.ubi).toBe('');
  });

  test('returns expected structure fields', () => {
    const result = fns.parseWASOSHTML('', 'Test', '');
    expect(result).toHaveProperty('ubi');
    expect(result).toHaveProperty('businessName');
    expect(result).toHaveProperty('entityType');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('jurisdiction');
    expect(result).toHaveProperty('principalOffice');
    expect(result).toHaveProperty('registeredAgent');
    expect(result).toHaveProperty('officers');
    expect(result).toHaveProperty('filingHistory');
  });
});
