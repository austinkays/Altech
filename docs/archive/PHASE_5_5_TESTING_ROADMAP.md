# Phase 5.5 - Enhanced Testing Infrastructure

**Document Date**: February 4, 2026
**Status**: Planning & Documentation
**Purpose**: Establish comprehensive testing framework before Phases 6-10
**Timeline**: 2-3 days

---

## Overview

As Altech's 6-layer property intelligence system grows more complex, we need solid testing infrastructure to validate:
- Each phase works independently
- Fallback chains work correctly
- No regressions between phases
- Performance meets targets
- Cost tracking stays accurate

This document outlines Phase 5.5: **Enhanced Testing Infrastructure**.

---

## What's Complete (Phases 1-5)

✅ **Phase 1**: ArcGIS REST APIs for property data (95% confidence)
✅ **Phase 2**: Headless browser scraping fallback (85% confidence)
✅ **Phase 3**: RAG interpretation of raw data (99% confidence)
✅ **Phase 4**: Vision processing for images/PDFs (85-95% confidence)
✅ **Phase 5**: Historical analysis and market intelligence (70-80% confidence)

**System Status**: 6-layer intelligence fully operational, all tests passing (12/12)

---

## Phase 5.5 Objectives

### Objective 1: Verified Test Data
- [ ] Document 60+ real/realistic sample addresses
- [ ] Organize by county (8 counties: WA, OR, AZ)
- [ ] Organize by test type (Phase 1 test, Phase 2 fallback, error scenarios, etc.)
- [ ] Document expected outcomes for each address
- [ ] Create fixtures file (✅ DONE - `tests/fixtures/test-addresses.json`)

### Objective 2: Per-Phase Test Suites
- [ ] Phase 1 test suite (`tests/phase1.test.js`)
  - Test ArcGIS API for Clark, King, Pierce, Multnomah counties
  - Verify parcel data extraction
  - Verify confidence scoring (95%)
  - Verify speed (<1 sec)

- [ ] Phase 2 test suite (`tests/phase2.test.js`)
  - Test browser fallback for Snohomish, Thurston, Lane, Marion, Pinal
  - Verify browser scraping works
  - Verify confidence scoring (85%)
  - Verify speed (3-5 sec)

- [ ] Phase 3 test suite (`tests/phase3.test.js`)
  - Test RAG interpretation
  - Verify standardization
  - Verify confidence (99%)
  - Verify no hallucinations

- [ ] Phase 4 test suite (`tests/phase4.test.js`)
  - Test image processing
  - Test PDF extraction
  - Test satellite analysis
  - Verify confidence (85-95%)

- [ ] Phase 5 test suite (`tests/phase5.test.js`)
  - Test value history calculations
  - Test insurance trend analysis
  - Test market comparison
  - Test timeline generation

- [ ] Integration test suite (`tests/integration.test.js`)
  - Test end-to-end workflows (all phases)
  - Test fallback chains
  - Test error scenarios

### Objective 3: Performance Benchmarking
- [ ] Create performance tracking (`tests/performance.test.js`)
- [ ] Track API response times
- [ ] Track total workflow time
- [ ] Track cost per query
- [ ] Establish baselines (targets vs actual)

### Objective 4: Documentation
- [ ] Testing guide (✅ DONE - `docs/TESTING_GUIDE.md`)
- [ ] Test data documentation (✅ DONE - `tests/fixtures/test-addresses.json`)
- [ ] Performance benchmarks doc
- [ ] Troubleshooting guide

---

## Work Breakdown

### Task 1: Create Phase 1 Test Suite

**File**: `/tests/phase1.test.js`

```javascript
describe('Phase 1 - ArcGIS API Tests', () => {
  // Test each supported county
  const addresses = [
    {
      address: "408 NW 116th St",
      city: "Vancouver",
      state: "WA",
      county: "Clark",
      expectedParcelId: /^\d+-\d+-\d+$/,
      expectedYearBuilt: 1985,
      expectedConfidence: "95%"
    },
    // ... more addresses
  ];

  addresses.forEach(addr => {
    test(`Clark County - ${addr.address}`, async () => {
      const result = await phase1.getParcelData(addr);
      expect(result.confidence).toBe("95%");
      expect(result.yearBuilt).toEqual(addr.expectedYearBuilt);
      expect(result.speed).toBeLessThan(1000); // < 1 sec
    });
  });

  test('Unsupported county falls back to Phase 2', async () => {
    const result = await phase1.getParcelData({
      address: "123 Main",
      city: "Foo",
      county: "Unknown"
    });
    expect(result.fallback).toBe("Phase 2");
  });

  test('Invalid address returns null', async () => {
    const result = await phase1.getParcelData({
      address: "123 Fake Street",
      city: "Nowhere"
    });
    expect(result).toBeNull();
  });
});
```

**Verification Checklist**:
- [ ] Clark County returns 95% confidence
- [ ] King County returns 95% confidence
- [ ] Pierce County returns 95% confidence
- [ ] Multnomah County returns 95% confidence
- [ ] Unsupported county triggers fallback
- [ ] Speed consistently <1 second
- [ ] Parcel IDs validate correctly
- [ ] All expected fields populated

---

### Task 2: Create Phase 2 Test Suite

**File**: `/tests/phase2.test.js`

```javascript
describe('Phase 2 - Browser Scraping Tests', () => {
  const fallbackAddresses = [
    {
      address: "2341 Broadway",
      city: "Everett",
      county: "Snohomish",
      expectedConfidence: "85%"
    },
    // ... more addresses
  ];

  fallbackAddresses.forEach(addr => {
    test(`${addr.county} - ${addr.address}`, async () => {
      const result = await phase2.scrapeProperty(addr);
      expect(result.confidence).toBe("85%");
      expect(result.speed).toBeGreaterThan(3000); // > 3 sec
      expect(result.speed).toBeLessThan(5000);   // < 5 sec
      expect(result.data).toBeDefined();
    });
  });

  test('Browser timeout handled gracefully', async () => {
    const result = await phase2.scrapeProperty({
      address: "unlikely to exist address"
    });
    expect(result.error).toBe("Timeout");
    expect(result.fallback).toBe("Phase 4");
  });
});
```

**Verification Checklist**:
- [ ] Snohomish County scraping works
- [ ] Thurston County scraping works
- [ ] Lane County scraping works
- [ ] Marion County scraping works
- [ ] Pinal County scraping works
- [ ] Confidence consistently 85%
- [ ] Speed 3-5 seconds
- [ ] Timeout triggers fallback
- [ ] Data quality reasonable

---

### Task 3: Create Phase 3 Test Suite

**File**: `/tests/phase3.test.js`

```javascript
describe('Phase 3 - RAG Interpretation Tests', () => {
  test('Standardizes raw parcel data', async () => {
    const raw = {
      yearBuilt: "1985",
      stories: "2",
      lotSizeAcres: "0.249999",
      totalSqft: "1,850"
    };

    const standardized = await phase3.standardize(raw);
    expect(standardized.yearBuilt).toBe(1985);
    expect(standardized.stories).toBe(2);
    expect(standardized.lotSizeAcres).toBe(0.25);
    expect(standardized.totalSqft).toBe(1850);
    expect(standardized.confidence).toBe("99%");
  });

  test('No hallucinations in standardization', async () => {
    const raw = {
      yearBuilt: "unknown",
      roofType: "not specified"
    };

    const result = await phase3.standardize(raw);
    expect(result.yearBuilt).toBeNull();
    expect(result.roofType).toBeNull();
    // Should not invent data
  });

  test('Handles missing fields gracefully', async () => {
    const raw = {
      yearBuilt: "1985"
      // Missing other fields
    };

    const result = await phase3.standardize(raw);
    expect(result.yearBuilt).toBe(1985);
    expect(result.stories).toBeNull();
    // Should not fail
  });
});
```

**Verification Checklist**:
- [ ] Data standardized correctly
- [ ] No hallucinations
- [ ] Confidence always 99%
- [ ] Missing fields handled
- [ ] Number parsing works
- [ ] String cleanup works
- [ ] Speed <1 second

---

### Task 4: Create Phase 4 Test Suite

**File**: `/tests/phase4.test.js`

```javascript
describe('Phase 4 - Vision Processing Tests', () => {
  test('Extracts roof data from image', async () => {
    const imageUrl = "path/to/roof-photo.jpg";
    const result = await phase4.analyzeRoof(imageUrl);
    
    expect(result.roofType).toBeDefined();
    expect(result.condition).toBeDefined();
    expect(result.color).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  test('Extracts tax data from PDF', async () => {
    const pdfPath = "path/to/tax-summary.pdf";
    const result = await phase4.analyzePDF(pdfPath);
    
    expect(result.yearBuilt).toBeDefined();
    expect(result.squareFeet).toBeDefined();
    expect(result.assessedValue).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  test('Analyzes satellite image', async () => {
    const coords = { lat: 47.6062, lng: -122.3321 };
    const result = await phase4.analyzeSatellite(coords);
    
    expect(result.floodRisk).toBeDefined();
    expect(result.wildfireRisk).toBeDefined();
    expect(result.lotCharacteristics).toBeDefined();
  });

  test('Confidence score inversely correlates with image quality', async () => {
    const goodImage = await phase4.analyzeRoof("clear-roof-photo.jpg");
    const blurryImage = await phase4.analyzeRoof("blurry-roof-photo.jpg");
    
    expect(goodImage.confidence).toBeGreaterThan(blurryImage.confidence);
  });
});
```

**Verification Checklist**:
- [ ] Image analysis works
- [ ] PDF extraction works
- [ ] Satellite analysis works
- [ ] Confidence scores reasonable (85-95%)
- [ ] Speed <3 seconds per image
- [ ] Handles missing/invalid images

---

### Task 5: Create Phase 5 Test Suite

**File**: `/tests/phase5.test.js`

```javascript
describe('Phase 5 - Historical Analysis Tests', () => {
  test('Calculates value appreciation', async () => {
    const address = "2847 Wallingford Ave N, Seattle, WA";
    const result = await phase5.analyzeValueHistory(address);
    
    expect(result.valueSamples).toBeDefined();
    expect(result.appreciation10yr).toBeCloseTo(5.1, 0.3);  // ±0.3%
    expect(result.appreciation5yr).toBeCloseTo(4.8, 0.3);
    expect(result.currentValue).toBe(750000);
  });

  test('Analyzes insurance trends', async () => {
    const address = "2847 Wallingford Ave N, Seattle, WA";
    const result = await phase5.analyzeInsuranceTrends(address);
    
    expect(result.homeownersHistory).toBeDefined();
    expect(result.trendPercentage).toBeCloseTo(2.6, 0.2);  // ±0.2%
    expect(result.predictions).toBeDefined();
  });

  test('Compares to market baseline', async () => {
    const address = "1524 NE 42nd Ave, Portland, OR";
    const result = await phase5.compareToMarket(address);
    
    expect(result.fairValue).toBeCloseTo(765000, 15000);  // ±$15k
    expect(result.pricePerSqft).toBeDefined();
    expect(result.investmentOutlook).toBeDefined();
  });

  test('Confidence is realistic (70-80%)', async () => {
    const result = await phase5.analyzeValueHistory("any address");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.confidence).toBeLessThanOrEqual(80);
  });
});
```

**Verification Checklist**:
- [ ] Value history calculations accurate
- [ ] Appreciation rates within ±0.3%
- [ ] Insurance trends show realistic increases
- [ ] Market comparisons reasonable
- [ ] Timeline events documented
- [ ] Confidence 70-80%
- [ ] Speed <3 seconds per analysis

---

### Task 6: Create Integration Test Suite

**File**: `/tests/integration.test.js`

```javascript
describe('Integration - Full Workflows', () => {
  test('Complete Phase 1 to Phase 3 flow', async () => {
    const addr = "408 NW 116th St, Vancouver, WA";
    
    // Phase 1: Get raw data
    const phase1 = await getPhase1Data(addr);
    expect(phase1.confidence).toBe("95%");
    
    // Phase 3: Standardize
    const phase3 = await phase3.standardize(phase1.data);
    expect(phase3.confidence).toBe("99%");
    
    // Verify consistency
    expect(phase3.yearBuilt).toBe(phase1.yearBuilt);
  });

  test('Fallback chain: Phase 1 → Phase 2', async () => {
    const addr = "2341 Broadway, Everett, WA";
    
    // Phase 1 should fail for unsupported county
    const phase1 = await getPhase1Data(addr);
    expect(phase1).toBeNull();
    
    // Should fallback to Phase 2
    const phase2 = await phase2.scrapeProperty(addr);
    expect(phase2.confidence).toBe("85%");
  });

  test('Full workflow with vision data', async () => {
    const addr = "408 NW 116th St, Vancouver, WA";
    
    // Get parcel data
    const parcelData = await getParcelData(addr);
    expect(parcelData).toBeDefined();
    
    // User uploads image
    const visionData = await phase4.analyzeRoof("roof-photo.jpg");
    expect(visionData.roofType).toBeDefined();
    
    // Merge results
    const merged = mergeData(parcelData, visionData);
    expect(merged.confidence).toBeLessThan(99);  // Combined confidence
  });

  test('Complete quote export with all phases', async () => {
    const formData = {
      address: "408 NW 116th St",
      city: "Vancouver",
      state: "WA"
    };
    
    // Trigger full analysis
    const analysis = await analyzeProperty(formData);
    
    // Export should include all phases
    const cmsmtf = await exportCMSMTF(analysis);
    expect(cmsmtf).toMatch(/gen_sFirstName/);
    
    const xml = await exportXML(analysis);
    expect(xml).toMatch(/<firstName>/);
    
    const pdf = await exportPDF(analysis);
    expect(pdf).toBeDefined();
  });
});
```

**Verification Checklist**:
- [ ] Phase 1→3 chain works
- [ ] Fallback chain (1→2) works
- [ ] Vision data merges correctly
- [ ] All exports include all phase data
- [ ] No data loss in pipelines
- [ ] Error handling graceful

---

### Task 7: Create Performance Tracking

**File**: `/tests/performance.test.js`

```javascript
describe('Performance Benchmarks', () => {
  const benchmarks = {
    phase1: { target: 1000, max: 2000 },      // 1 sec target, 2 sec max
    phase2: { target: 4000, max: 6000 },      // 4 sec target, 6 sec max
    phase3: { target: 1000, max: 2000 },      // 1 sec target, 2 sec max
    phase4Image: { target: 3000, max: 5000 }, // 3 sec target, 5 sec max
    phase5: { target: 3000, max: 5000 }       // 3 sec target, 5 sec max
  };

  test('Phase 1 meets speed target', async () => {
    const start = Date.now();
    const result = await phase1.getParcelData("408 NW 116th St, Vancouver, WA");
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(benchmarks.phase1.max);
  });

  test('Full workflow completes within budget', async () => {
    const start = Date.now();
    const result = await fullWorkflow("408 NW 116th St, Vancouver, WA");
    const elapsed = Date.now() - start;
    
    // Phase 1 (1s) + Phase 3 (1s) + Phase 5 (3s) = ~5s budget
    expect(elapsed).toBeLessThan(6000);
  });

  test('Cost tracking', async () => {
    const costs = await trackCosts(100);  // 100 queries
    
    expect(costs.phase1).toBe(0);        // Free
    expect(costs.phase2).toBeLessThan(0.10);  // Browser compute
    expect(costs.phase3).toBeLessThan(0.20);  // Gemini
    expect(costs.phase4).toBeLessThan(0.10);  // Vision
    expect(costs.phase5).toBeLessThan(0.20);  // Analysis
    expect(costs.total).toBeLessThan(0.50);   // < 50 cents per 100 queries
  });
});
```

**Verification Checklist**:
- [ ] Phase 1 <2 seconds (typical <1s)
- [ ] Phase 2 <6 seconds (typical 3-5s)
- [ ] Phase 3 <2 seconds (typical <1s)
- [ ] Phase 4 <5 seconds (typical 2-3s)
- [ ] Phase 5 <5 seconds (typical 2-3s)
- [ ] Full workflow <6 seconds
- [ ] Cost per query <$0.01

---

## Documentation Updates

### Update 1: TESTING_GUIDE.md
✅ **DONE** - Comprehensive testing guide with sample addresses

### Update 2: Test Fixtures
✅ **DONE** - `tests/fixtures/test-addresses.json` with 60+ addresses

### Update 3: Performance Benchmarks Doc
- [ ] Create `docs/PERFORMANCE_BENCHMARKS.md`
- Document target speeds by phase
- Document cost tracking
- Show historical trends (if available)

### Update 4: Troubleshooting Guide
- [ ] Create `docs/TROUBLESHOOTING.md`
- Common issues and solutions
- Debug commands
- Log patterns to look for

---

## Test Execution Roadmap

### Week 1: Phase 1-2 Tests
- [ ] Day 1: Create & run Phase 1 tests
- [ ] Day 1: Create & run Phase 2 tests
- [ ] Day 2: Fix any failures
- [ ] Day 2: Document results

### Week 1-2: Phase 3-4 Tests
- [ ] Day 3: Create & run Phase 3 tests
- [ ] Day 3: Create & run Phase 4 tests
- [ ] Day 4: Fix any failures
- [ ] Day 4: Document results

### Week 2: Phase 5 & Integration
- [ ] Day 5: Create & run Phase 5 tests
- [ ] Day 5: Create & run integration tests
- [ ] Day 6: Fix any failures
- [ ] Day 6: Document results

### Week 2-3: Performance & Polish
- [ ] Day 7: Performance benchmarking
- [ ] Day 7: Create benchmark doc
- [ ] Day 8: Final validation
- [ ] Day 8: Create troubleshooting guide

---

## Success Criteria

✅ **All Phase 1-5 Test Suites Created**
- Phase 1: 95% confidence, <1 sec ✓
- Phase 2: 85% confidence, 3-5 sec ✓
- Phase 3: 99% confidence, <1 sec ✓
- Phase 4: 85-95% confidence, 2-3 sec ✓
- Phase 5: 70-80% confidence, 2-3 sec ✓

✅ **Integration Tests Complete**
- Full workflows tested end-to-end
- Fallback chains validated
- Error scenarios handled

✅ **Performance Benchmarks**
- All phases meet speed targets
- Cost tracking established
- Historical trends documented

✅ **Documentation Complete**
- Testing guide ✓
- Test fixtures ✓
- Performance benchmarks (pending)
- Troubleshooting guide (pending)

---

## Dependencies Before Phases 6-10

**Before starting Phase 6**, we must have:
- [ ] All Phase 1-5 tests passing
- [ ] All test suites documented
- [ ] Performance benchmarks established
- [ ] Sample addresses verified
- [ ] Cost tracking system in place
- [ ] Team familiar with test suite

---

## What Comes After Phase 5.5

### Phase 6: Batch Processing
- Process 100+ addresses in one upload
- Queue management
- Rate limiting

### Phase 7: Document Intelligence
- Extract text from complex documents
- Tax document parsing
- Deed analysis

### Phase 8: Comparative Market Analysis
- Automated comp generation
- Price trending
- Investment scoring

### Phase 9: Risk Assessment
- Insurance scoring
- Hazard quantification
- Recommendations

### Phase 10: Integration & Polish
- Production hardening
- Performance optimization
- Final UI polish

**Total estimated effort**: Phases 6-10 = 2-3 weeks (after Phase 5.5 complete)

---

## Notes

1. **Test Data is Real-ish**: We're using real addresses but simplified expected data. This is acceptable for phase testing.

2. **API Keys Required**: Phase 4-5 tests require valid API keys. Set them in `.env` before running.

3. **Flaky Tests**: Browser scraping (Phase 2) might be flaky if websites change. Document known failure modes.

4. **Cost Monitoring**: Track API costs in tests. Alert if monthly budget exceeded.

5. **Version Control**: Commit test results alongside code. Track performance over time.

---

## Quick Start (After Implementation)

```bash
# Run all tests
npm test

# Run phase-specific tests
npm run test:phase1
npm run test:phase2
npm run test:phase3
npm run test:phase4
npm run test:phase5

# Run integration tests
npm run test:integration

# Performance benchmarks
npm run test:performance

# Generate report
npm run test:report
```

---

**Document Status**: Complete Planning Phase
**Next Step**: Begin implementation (Tasks 1-7 above)
**Estimated Duration**: 2-3 days
**Prerequisites**: All Phases 1-5 stable

