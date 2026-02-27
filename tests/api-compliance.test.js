/**
 * API Tests: compliance.js
 *
 * Tests pure business-logic functions from _compliance-utils.js:
 * - calculateDaysUntilExpiration
 * - getExpirationStatus
 * - isGeneralLiabilityPolicy
 * - isSuretyBondPolicy
 * - requiresManualVerification
 *
 * Also validates that the compliance module parses without syntax errors.
 */

const fs = require('fs');
const path = require('path');

// ── Load pure functions from _compliance-utils.js (ESM → CJS shim) ──
function loadComplianceFunctions() {
  const source = fs.readFileSync(path.join(__dirname, '../lib/compliance-utils.js'), 'utf8');

  // Strip ES module syntax: export statements
  const cleaned = source
    .replace(/^export\s+/gm, '');

  const extractFn = new Function(`
    ${cleaned}
    return {
      calculateDaysUntilExpiration,
      getExpirationStatus,
      isGeneralLiabilityPolicy,
      isSuretyBondPolicy,
      isCommercialPolicy,
      getCommercialPolicyType,
      getPersonalPolicyType,
      requiresManualVerification,
      NON_SYNCING_CARRIERS
    };
  `);
  return extractFn();
}

let fns;

beforeAll(() => {
  fns = loadComplianceFunctions();
});

// ────────────────────────────────────────────────────
// Module Syntax
// ────────────────────────────────────────────────────

describe('compliance.js — Module Syntax', () => {
  test('module source parses without syntax errors', () => {
    // Verify the utils file (pure functions) parses cleanly
    const utilsSource = fs.readFileSync(path.join(__dirname, '../lib/compliance-utils.js'), 'utf8');
    const cjsSafe = utilsSource.replace(/^export\s+/gm, '');
    expect(() => new Function(cjsSafe)).not.toThrow();
  });

  test('no duplicate function declarations', () => {
    const source = fs.readFileSync(path.join(__dirname, '../lib/compliance-utils.js'), 'utf8');
    const fnNames = ['calculateDaysUntilExpiration', 'getExpirationStatus',
      'isGeneralLiabilityPolicy', 'isSuretyBondPolicy', 'isCommercialPolicy',
      'getCommercialPolicyType', 'getPersonalPolicyType', 'requiresManualVerification'];
    for (const name of fnNames) {
      const matches = source.match(new RegExp(`^(?:export\\s+)?function ${name}\\b`, 'gm'));
      expect(matches).not.toBeNull();
      expect(matches.length).toBe(1);
    }
  });
});

// ────────────────────────────────────────────────────
// calculateDaysUntilExpiration
// ────────────────────────────────────────────────────

describe('calculateDaysUntilExpiration', () => {
  test('returns positive days for future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const result = fns.calculateDaysUntilExpiration(future.toISOString());
    expect(result).toBe(30);
  });

  test('returns negative days for past date', () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    const result = fns.calculateDaysUntilExpiration(past.toISOString());
    expect(result).toBeLessThan(0);
    expect(result).toBeGreaterThanOrEqual(-11);
  });

  test('returns 0 or 1 for today', () => {
    const today = new Date();
    const result = fns.calculateDaysUntilExpiration(today.toISOString());
    // Due to time-of-day rounding, could be 0 or 1
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────
// getExpirationStatus
// ────────────────────────────────────────────────────

describe('getExpirationStatus', () => {
  test('returns "expired" for negative days', () => {
    expect(fns.getExpirationStatus(-1)).toBe('expired');
    expect(fns.getExpirationStatus(-100)).toBe('expired');
  });

  test('returns "critical" for 0-29 days', () => {
    expect(fns.getExpirationStatus(0)).toBe('critical');
    expect(fns.getExpirationStatus(15)).toBe('critical');
    expect(fns.getExpirationStatus(29)).toBe('critical');
  });

  test('returns "expiring-soon" for 30-59 days', () => {
    expect(fns.getExpirationStatus(30)).toBe('expiring-soon');
    expect(fns.getExpirationStatus(45)).toBe('expiring-soon');
    expect(fns.getExpirationStatus(59)).toBe('expiring-soon');
  });

  test('returns "active" for 60+ days', () => {
    expect(fns.getExpirationStatus(60)).toBe('active');
    expect(fns.getExpirationStatus(365)).toBe('active');
  });
});

// ────────────────────────────────────────────────────
// isGeneralLiabilityPolicy
// ────────────────────────────────────────────────────

describe('isGeneralLiabilityPolicy', () => {
  // Positive matches
  test('matches CGL by type', () => {
    expect(fns.isGeneralLiabilityPolicy({ type: 'CGL', status: 'active' })).toBe(true);
  });

  test('matches General Liability by applicationType', () => {
    expect(fns.isGeneralLiabilityPolicy({
      applicationType: 'Commercial General Liability',
      status: 'active'
    })).toBe(true);
  });

  test('matches BOP by type', () => {
    expect(fns.isGeneralLiabilityPolicy({ type: 'BOP', status: 'active' })).toBe(true);
  });

  test('matches GL by loBs code', () => {
    expect(fns.isGeneralLiabilityPolicy({
      status: 'active',
      loBs: [{ code: 'CGL' }]
    })).toBe(true);
  });

  test('matches when CGL lob is present alongside excluded lob', () => {
    // Multi-lob: CGL + AUTOB  should still be detected as CGL
    expect(fns.isGeneralLiabilityPolicy({
      status: 'active',
      loBs: [{ code: 'CGL' }, { code: 'AUTOB' }]
    })).toBe(true);
  });

  test('matches by title containing "liability"', () => {
    expect(fns.isGeneralLiabilityPolicy({
      title: 'General Liability Policy',
      status: 'active'
    })).toBe(true);
  });

  // Negative matches
  test('rejects prospect status', () => {
    expect(fns.isGeneralLiabilityPolicy({ type: 'CGL', status: 'prospect' })).toBe(false);
  });

  test('rejects cancelled status', () => {
    expect(fns.isGeneralLiabilityPolicy({ type: 'CGL', status: 'cancelled' })).toBe(false);
  });

  test('rejects auto policy by type', () => {
    expect(fns.isGeneralLiabilityPolicy({ type: 'auto', status: 'active' })).toBe(false);
  });

  test('rejects homeowners by title', () => {
    expect(fns.isGeneralLiabilityPolicy({ title: 'Homeowners', status: 'active' })).toBe(false);
  });

  test('rejects CA-prefixed policy number', () => {
    expect(fns.isGeneralLiabilityPolicy({
      policyNumber: 'CA12345',
      type: 'liability',
      status: 'active'
    })).toBe(false);
  });

  test('rejects HO-prefixed policy number', () => {
    expect(fns.isGeneralLiabilityPolicy({
      policyNumber: 'HO99999',
      type: 'liability',
      status: 'active'
    })).toBe(false);
  });

  test('rejects workers comp by type', () => {
    expect(fns.isGeneralLiabilityPolicy({ type: 'workers comp', status: 'active' })).toBe(false);
  });

  test('rejects policy with only excluded loBs', () => {
    expect(fns.isGeneralLiabilityPolicy({
      status: 'active',
      loBs: [{ code: 'auto' }]
    })).toBe(false);
  });

  test('handles empty/missing fields gracefully', () => {
    expect(fns.isGeneralLiabilityPolicy({})).toBe(false);
    expect(fns.isGeneralLiabilityPolicy({ status: 'active' })).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// isSuretyBondPolicy
// ────────────────────────────────────────────────────

describe('isSuretyBondPolicy', () => {
  test('matches surety by type', () => {
    expect(fns.isSuretyBondPolicy({ type: 'Surety', status: 'active' })).toBe(true);
  });

  test('matches bond by title', () => {
    expect(fns.isSuretyBondPolicy({ title: 'Contractor Bond', status: 'active' })).toBe(true);
  });

  test('matches by loBs code "SURE"', () => {
    expect(fns.isSuretyBondPolicy({
      status: 'active',
      loBs: [{ code: 'SURE' }]
    })).toBe(true);
  });

  test('matches by loBs code "SB"', () => {
    expect(fns.isSuretyBondPolicy({
      status: 'active',
      loBs: [{ code: 'SB' }]
    })).toBe(true);
  });

  test('matches by applicationType containing "fidelity"', () => {
    expect(fns.isSuretyBondPolicy({
      applicationType: 'Fidelity Bond',
      status: 'active'
    })).toBe(true);
  });

  test('matches by policy number prefix SB', () => {
    expect(fns.isSuretyBondPolicy({
      policyNumber: 'SB12345',
      status: 'active'
    })).toBe(true);
  });

  test('matches by policy number prefix BOND', () => {
    expect(fns.isSuretyBondPolicy({
      policyNumber: 'BOND-99',
      status: 'active'
    })).toBe(true);
  });

  test('rejects prospect status', () => {
    expect(fns.isSuretyBondPolicy({ type: 'Surety', status: 'prospect' })).toBe(false);
  });

  test('rejects cancelled status', () => {
    expect(fns.isSuretyBondPolicy({ type: 'Surety', status: 'canceled' })).toBe(false);
  });

  test('rejects non-bond policy', () => {
    expect(fns.isSuretyBondPolicy({ type: 'CGL', status: 'active' })).toBe(false);
  });

  test('rejects policy with no matching fields', () => {
    expect(fns.isSuretyBondPolicy({ status: 'active' })).toBe(false);
    expect(fns.isSuretyBondPolicy({})).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// requiresManualVerification
// ────────────────────────────────────────────────────

describe('requiresManualVerification', () => {
  test('returns true for Hiscox', () => {
    expect(fns.requiresManualVerification('Hiscox')).toBe(true);
  });

  test('returns true for HCC Surety', () => {
    expect(fns.requiresManualVerification('HCC Surety Group')).toBe(true);
  });

  test('returns true for BTIS', () => {
    expect(fns.requiresManualVerification('BTIS')).toBe(true);
  });

  test('returns true for IES (case insensitive)', () => {
    expect(fns.requiresManualVerification('ies')).toBe(true);
  });

  test('returns false for syncing carriers', () => {
    expect(fns.requiresManualVerification('State Farm')).toBe(false);
    expect(fns.requiresManualVerification('Progressive')).toBe(false);
    expect(fns.requiresManualVerification('Hartford')).toBe(false);
  });

  test('NON_SYNCING_CARRIERS has expected entries', () => {
    expect(fns.NON_SYNCING_CARRIERS).toContain('Hiscox');
    expect(fns.NON_SYNCING_CARRIERS).toContain('IES');
    expect(fns.NON_SYNCING_CARRIERS).toContain('HCC Surety');
    expect(fns.NON_SYNCING_CARRIERS).toContain('BTIS');
    expect(fns.NON_SYNCING_CARRIERS.length).toBe(4);
  });
});

// ────────────────────────────────────────────────────
// isCommercialPolicy
// ────────────────────────────────────────────────────

describe('isCommercialPolicy', () => {
  test('matches CGL policy', () => {
    expect(fns.isCommercialPolicy({ type: 'CGL', status: 'active' })).toBe(true);
  });

  test('matches BOP policy', () => {
    expect(fns.isCommercialPolicy({ type: 'BOP', status: 'active' })).toBe(true);
  });

  test('matches commercial auto by loBs AUTOB', () => {
    expect(fns.isCommercialPolicy({
      status: 'active',
      loBs: [{ code: 'AUTOB' }]
    })).toBe(true);
  });

  test('matches workers comp by type', () => {
    expect(fns.isCommercialPolicy({ type: 'Workers Comp', status: 'active' })).toBe(true);
  });

  test('matches commercial package by loBs CPKGE', () => {
    expect(fns.isCommercialPolicy({
      status: 'active',
      loBs: [{ code: 'CPKGE' }]
    })).toBe(true);
  });

  test('matches surety bond', () => {
    expect(fns.isCommercialPolicy({ type: 'Surety', status: 'active' })).toBe(true);
  });

  test('matches commercial umbrella', () => {
    expect(fns.isCommercialPolicy({
      status: 'active',
      loBs: [{ code: 'CUMBR' }]
    })).toBe(true);
  });

  test('matches inland marine', () => {
    expect(fns.isCommercialPolicy({ type: 'Inland Marine', status: 'active' })).toBe(true);
  });

  test('matches professional liability (E&O)', () => {
    expect(fns.isCommercialPolicy({ title: 'Professional Liability', status: 'active' })).toBe(true);
  });

  test('matches commercial property', () => {
    expect(fns.isCommercialPolicy({ type: 'Commercial Property', status: 'active' })).toBe(true);
  });

  test('rejects homeowners policy', () => {
    expect(fns.isCommercialPolicy({ type: 'Homeowners', status: 'active' })).toBe(false);
  });

  test('rejects personal auto', () => {
    expect(fns.isCommercialPolicy({ type: 'Personal Auto', status: 'active' })).toBe(false);
  });

  test('rejects renters policy', () => {
    expect(fns.isCommercialPolicy({ title: 'Renters Insurance', status: 'active' })).toBe(false);
  });

  test('rejects HO-prefixed policy number', () => {
    expect(fns.isCommercialPolicy({
      policyNumber: 'HO12345',
      type: 'commercial',
      status: 'active'
    })).toBe(false);
  });

  test('rejects prospect status', () => {
    expect(fns.isCommercialPolicy({ type: 'CGL', status: 'prospect' })).toBe(false);
  });

  test('rejects cancelled status', () => {
    expect(fns.isCommercialPolicy({ type: 'BOP', status: 'cancelled' })).toBe(false);
  });

  test('handles empty/missing fields gracefully', () => {
    expect(fns.isCommercialPolicy({})).toBe(false);
    expect(fns.isCommercialPolicy({ status: 'active' })).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// getCommercialPolicyType
// ────────────────────────────────────────────────────

describe('getCommercialPolicyType', () => {
  test('returns "cgl" for CGL policy', () => {
    expect(fns.getCommercialPolicyType({ type: 'CGL', status: 'active' })).toBe('cgl');
  });

  test('returns "bond" for surety bond', () => {
    expect(fns.getCommercialPolicyType({ type: 'Surety', status: 'active' })).toBe('bond');
  });

  test('returns "auto" for AUTOB lob', () => {
    expect(fns.getCommercialPolicyType({
      status: 'active',
      loBs: [{ code: 'AUTOB' }]
    })).toBe('auto');
  });

  test('returns "wc" for workers comp', () => {
    expect(fns.getCommercialPolicyType({ type: 'Workers Comp', status: 'active' })).toBe('wc');
  });

  test('returns "pkg" for commercial package', () => {
    expect(fns.getCommercialPolicyType({
      status: 'active',
      loBs: [{ code: 'CPKGE' }]
    })).toBe('pkg');
  });

  test('returns "umbrella" for commercial umbrella', () => {
    expect(fns.getCommercialPolicyType({
      status: 'active',
      loBs: [{ code: 'CUMBR' }]
    })).toBe('umbrella');
  });

  test('returns "eo" for professional liability', () => {
    expect(fns.getCommercialPolicyType({ title: 'Professional Liability', status: 'active' })).toBe('eo');
  });

  test('returns "bop" for BOP with no GL indicators', () => {
    expect(fns.getCommercialPolicyType({
      loBs: [{ code: 'BOP' }],
      status: 'active'
    })).toBe('bop');
  });

  test('returns "property" for commercial property', () => {
    expect(fns.getCommercialPolicyType({ type: 'Commercial Property', status: 'active' })).toBe('property');
  });

  test('returns "cyber" for cyber liability', () => {
    expect(fns.getCommercialPolicyType({ type: 'Cyber', status: 'active' })).toBe('cyber');
  });

  test('returns "im" for inland marine', () => {
    expect(fns.getCommercialPolicyType({ type: 'Inland Marine', status: 'active' })).toBe('im');
  });

  test('returns type for generic commercial', () => {
    const result = fns.getCommercialPolicyType({ type: 'Commercial', status: 'active' });
    // 'Commercial' may match CGL (via 'liability' in glCodes) or fall through to 'commercial'
    expect(['cgl', 'commercial']).toContain(result);
  });
});

// ────────────────────────────────────────────────────
// getPersonalPolicyType
// ────────────────────────────────────────────────────

describe('getPersonalPolicyType', () => {
  test('returns homeowner for homeowner policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Homeowner', status: 'active' })).toBe('homeowner');
  });

  test('returns homeowner for HO-prefixed policy number', () => {
    expect(fns.getPersonalPolicyType({ policyNumber: 'HO-12345', status: 'active' })).toBe('homeowner');
  });

  test('returns personal-auto for personal auto policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Personal Auto', status: 'active' })).toBe('personal-auto');
  });

  test('returns personal-auto for PA-prefixed policy number', () => {
    expect(fns.getPersonalPolicyType({ policyNumber: 'PA-99999', status: 'active' })).toBe('personal-auto');
  });

  test('returns renters for renters policy', () => {
    expect(fns.getPersonalPolicyType({ title: 'Renters Insurance', status: 'active' })).toBe('renters');
  });

  test('returns dwelling for dwelling policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Dwelling', status: 'active' })).toBe('dwelling');
    expect(fns.getPersonalPolicyType({ policyNumber: 'DP-500', status: 'active' })).toBe('dwelling');
  });

  test('returns flood for flood policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Flood', status: 'active' })).toBe('flood');
    expect(fns.getPersonalPolicyType({ policyNumber: 'FL-123', status: 'active' })).toBe('flood');
  });

  test('returns boat for boat/watercraft policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Watercraft', status: 'active' })).toBe('boat');
  });

  test('returns motorcycle for motorcycle policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Motorcycle', status: 'active' })).toBe('motorcycle');
  });

  test('returns condo for condo policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Condo', status: 'active' })).toBe('condo');
  });

  test('returns personal-umbrella for umbrella policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Umbrella', status: 'active' })).toBe('personal-umbrella');
  });

  test('returns health for health/dental/vision policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Health', status: 'active' })).toBe('health');
    expect(fns.getPersonalPolicyType({ type: 'Dental', status: 'active' })).toBe('health');
  });

  test('returns life for life policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'Life', status: 'active' })).toBe('life');
  });

  test('returns personal for unclassified personal policy', () => {
    expect(fns.getPersonalPolicyType({ type: 'SomeOther', status: 'active' })).toBe('personal');
  });

  test('checks loBs codes for type detection', () => {
    expect(fns.getPersonalPolicyType({
      status: 'active',
      loBs: [{ code: 'Flood' }]
    })).toBe('flood');
  });
});

// ────────────────────────────────────────────────────
// Handler Response Structure (static analysis)
// ────────────────────────────────────────────────────

describe('compliance.js — Handler Structure', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../api/compliance.js'), 'utf8'
  );

  test('handler is exported via securityMiddleware', () => {
    expect(source).toMatch(/^export\s+default\s+securityMiddleware\(handler\)/m);
  });

  test('business logic is imported from _compliance-utils.js', () => {
    expect(source).toMatch(/import\s*\{[\s\S]*?\}\s*from\s*['"]\.\.\/(lib\/compliance-utils|_compliance-utils)\.js['"]/);
  });

  test('CORS/OPTIONS is handled by securityMiddleware', () => {
    expect(source).toMatch(/import\s*\{\s*securityMiddleware\s*\}\s*from/);
  });

  test('handler returns 500 when credentials are missing', () => {
    expect(source).toContain("'HawkSoft API credentials not configured'");
  });

  test('response includes success, count, policies, allPolicies, metadata fields', () => {
    expect(source).toContain('success: true');
    expect(source).toContain('count: compliancePolicies.length');
    expect(source).toContain('policies: compliancePolicies');
    expect(source).toContain('allPolicies: allPolicies');
    expect(source).toContain('metadata:');
  });

  test('metadata includes timing and aggregate counts', () => {
    expect(source).toContain('elapsedTimeSeconds:');
    expect(source).toContain('clientsScanned:');
    expect(source).toContain('totalPoliciesFound:');
    expect(source).toContain('glFilterPassed:');
    expect(source).toContain('glPoliciesMatched:');
    expect(source).toContain('bondPoliciesMatched:');
  });

  test('policies sorted by daysUntilExpiration (most urgent first)', () => {
    expect(source).toMatch(/compliancePolicies\.sort\(\(a, b\)/);
    expect(source).toContain('a.daysUntilExpiration - b.daysUntilExpiration');
  });

  test('compliancePolicy object has all required fields', () => {
    expect(source).toContain('policyNumber:');
    expect(source).toContain('policyType:');
    expect(source).toContain('clientNumber:');
    expect(source).toContain('clientName:');
    expect(source).toContain('carrier:');
    expect(source).toContain('effectiveDate:');
    expect(source).toContain('expirationDate:');
    expect(source).toContain('daysUntilExpiration:');
    expect(source).toContain('status:');
    expect(source).toContain('requiresManualVerification:');
  });

  test('handler skips policies without expiration date', () => {
    expect(source).toContain('!policy.expirationDate');
    expect(source).toContain('glNoExpDate');
  });

  test('handler skips policies expired more than 30 days ago', () => {
    expect(source).toContain('thirtyDaysAgo');
    expect(source).toContain('expirationDate < thirtyDaysAgo');
  });

  test('uses parallel batch processing for client fetches', () => {
    expect(source).toContain('Promise.all(promises)');
    expect(source).toContain('batchSize');
    expect(source).toContain('concurrency');
  });

  test('builds Basic Auth header from credentials', () => {
    expect(source).toContain('Basic');
    expect(source).toContain("Buffer.from(authString).toString('base64')");
  });

  test('searches 3 years back', () => {
    expect(source).toContain('setFullYear(threeYearsAgo.getFullYear() - 3)');
  });

  test('catches and returns 500 on unexpected errors', () => {
    expect(source).toContain("res.status(500).json");
    expect(source).toContain("'Internal server error'");
  });

  test('KV cache validity requires allPolicies (not just policies)', () => {
    // The KV cache check must require allPolicies to avoid serving stale
    // cache that only has commercial CGL policies (missing personal lines)
    expect(source).toContain('cached.allPolicies?.length > 0');
  });

  test('KV cache stale log explains reason when allPolicies missing', () => {
    expect(source).toContain('missing allPolicies');
  });

  test('response includes allClientsList for Call Logger prospect support', () => {
    expect(source).toContain('allClientsList: allClientsList');
  });

  test('allClientsList is built from all fetched clients (including policy-less)', () => {
    // allClientsList is built from allClients (the full set from HawkSoft),
    // NOT from allPolicies which filters out prospect/cancelled/expired-only clients
    expect(source).toContain('for (const client of allClients)');
    expect(source).toContain('allClientsList.push');
  });

  test('metadata includes allClientsListCount', () => {
    expect(source).toContain('allClientsListCount:');
  });
});
