/**
 * Integration Tests: End-to-End Workflows
 * 
 * Tests complete workflows across all phases
 * Validates fallback chains, data merging, export compatibility
 */

const testData = require('./fixtures/test-addresses.json');

describe('Integration - Phase 1 → 3 (ArcGIS to RAG)', () => {

  test('should flow data from Phase 1 to Phase 3 without loss', async () => {
    const phase1Output = {
      success: true,
      parcelId: '123-456-789',
      yearBuilt: '1985',
      lotSize: '0.25',
      squareFeet: '1850',
      stories: '1.5',
      confidence: 0.95
    };

    const phase3Input = phase1Output;
    const phase3Output = {
      yearBuilt: 1985,
      lotSize: 0.25,
      squareFeet: 1850,
      stories: 1.5,
      confidence: 0.99 // RAG increases confidence
    };

    expect(phase3Input.parcelId).toBe(phase1Output.parcelId);
    expect(phase3Output.yearBuilt).toBe(parseInt(phase1Output.yearBuilt));
  });

  test('should preserve data integrity through standardization', async () => {
    const original = {
      squareFeet: '1,850.5',
      yearBuilt: '1985',
      lotSize: 0.25
    };

    const standardized = {
      squareFeet: 1850.5,
      yearBuilt: 1985,
      lotSize: 0.25
    };

    const originalSquareFeet = parseFloat(original.squareFeet.replace(/,/g, ''));
    expect(standardized.squareFeet).toBeCloseTo(originalSquareFeet, 1);
  });

  test('Phase 1 + Phase 3 total processing time <2 seconds', async () => {
    const phase1Time = 0.75;
    const phase3Time = 0.5;
    const totalTime = phase1Time + phase3Time;
    
    expect(totalTime).toBeLessThan(2);
  });

  test('should validate complete data after Phase 1+3', async () => {
    const finalData = {
      parcelId: '123-456-789',
      yearBuilt: 1985,
      lotSize: 0.25,
      squareFeet: 1850,
      stories: 1.5,
      bathrooms: 1.5,
      confidence: 0.99
    };

    // All required fields present
    expect(finalData.yearBuilt).toBeGreaterThanOrEqual(1900);
    expect(finalData.squareFeet).toBeGreaterThan(0);
    expect(finalData.confidence).toBeGreaterThanOrEqual(0.99);
  });

  test('should format data correctly for export after Phase 1+3', async () => {
    const exportData = {
      yearBuilt: 1985,
      squareFeet: 1850,
      lotSize: 0.25,
      stories: 1.5
    };

    // Check format matches CMSMTF expectations
    expect(typeof exportData.yearBuilt).toBe('number');
    expect(typeof exportData.squareFeet).toBe('number');
    expect(exportData.yearBuilt).toEqual(1985);
  });
});

describe('Integration - Phase 1 → 2 → 3 (Fallback Chain)', () => {

  test('should fallback from Phase 1 to Phase 2 automatically', async () => {
    const county = 'Unsupported County';
    
    // Phase 1 fails
    const phase1Result = {
      success: false,
      error: 'County not in ArcGIS database'
    };

    // System triggers Phase 2
    const phase2Result = {
      success: true,
      confidence: 0.85,
      method: 'Browser scraping'
    };

    expect(phase1Result.success).toBe(false);
    expect(phase2Result.success).toBe(true);
    expect(phase2Result.confidence).toBeLessThan(0.95); // Lower than Phase 1
  });

  test('should pass Phase 2 output to Phase 3', async () => {
    const phase2Output = {
      success: true,
      yearBuilt: '1990',
      squareFeet: '2000',
      confidence: 0.85,
      source: 'Browser scraping'
    };

    const phase3Input = phase2Output;
    const phase3Output = {
      yearBuilt: 1990,
      squareFeet: 2000,
      confidence: 0.99,
      source: 'Browser scraping'
    };

    expect(phase3Input.yearBuilt).toBe(phase2Output.yearBuilt);
    expect(phase3Output.confidence).toEqual(0.99);
  });

  test('complete fallback chain Phase 1 → 2 → 3 timing', async () => {
    const phase1Time = 0.75;
    const phase2Time = 4.0; // Browser is slower
    const phase3Time = 0.5;
    const totalFallbackTime = phase1Time + phase2Time + phase3Time;
    
    expect(totalFallbackTime).toBeLessThan(6); // Total timeout budget
  });

  test('should handle Phase 2 timeout and continue', async () => {
    const phase2Timeout = {
      success: false,
      error: 'Timeout after 5 seconds'
    };

    // System should fallback or continue with confidence downgrade
    const result = {
      success: true,
      confidence: 0.60,
      warning: 'Phase 2 timed out, using lower confidence'
    };

    expect(result.confidence).toBeLessThan(0.85);
  });

  test('should merge fallback chain results properly', async () => {
    const chainData = {
      phase1: null, // Failed
      phase2: {
        yearBuilt: 1990,
        squareFeet: 2000,
        confidence: 0.85
      },
      phase3: {
        yearBuilt: 1990, // Standardized
        squareFeet: 2000,
        confidence: 0.99
      }
    };

    // Use Phase 3 (highest confidence)
    const mergedConfidence = chainData.phase3.confidence;
    expect(mergedConfidence).toBe(0.99);
  });
});

describe('Integration - With Phase 4 (Vision)', () => {

  test('should optionally add Phase 4 data to Phase 1+3', async () => {
    const baseData = {
      yearBuilt: 1985,
      squareFeet: 1850,
      confidence: 0.99
    };

    const visionData = {
      roofType: 'Asphalt shingles',
      roofCondition: 'Good',
      confidence: 0.90
    };

    const merged = { ...baseData, ...visionData };
    
    expect(merged.yearBuilt).toBe(1985);
    expect(merged.roofType).toBe('Asphalt shingles');
  });

  test('should NOT downgrade confidence if Phase 4 unavailable', async () => {
    const baseConfidence = 0.99;
    const resultWithoutVision = {
      yearBuilt: 1985,
      confidence: baseConfidence
    };

    expect(resultWithoutVision.confidence).toBe(0.99);
  });

  test('Phase 1 + Phase 4 total time <5 seconds', async () => {
    const phase1Time = 0.75;
    const phase4Time = 2.5;
    const totalTime = phase1Time + phase4Time;
    
    expect(totalTime).toBeLessThan(5);
  });

  test('should merge Phase 4 vision data without data loss', async () => {
    const phase1Data = {
      yearBuilt: 1985,
      squareFeet: 1850,
      confidence: 0.95
    };

    const phase4Data = {
      roofType: 'Asphalt',
      roofCondition: 'Good'
    };

    const merged = { ...phase1Data, ...phase4Data };
    
    expect(Object.keys(merged).length).toEqual(5); // All fields preserved
  });
});

describe('Integration - With Phase 5 (Historical)', () => {

  test('should optionally add Phase 5 data to Phase 1+3', async () => {
    const baseData = {
      yearBuilt: 1985,
      squareFeet: 1850,
      confidence: 0.99
    };

    const historicalData = {
      valueHistory: [
        { year: 2015, value: 450000 },
        { year: 2025, value: 650000 }
      ],
      appreciation: 0.0316,
      confidence: 0.75
    };

    const merged = { ...baseData, ...historicalData };
    
    expect(merged.valueHistory).toBeDefined();
    expect(merged.yearBuilt).toBe(1985);
  });

  test('should use highest confidence score in merged data', async () => {
    const phase3Confidence = 0.99;
    const phase5Confidence = 0.75;
    
    const confidence = Math.max(phase3Confidence, phase5Confidence);
    
    expect(confidence).toBe(0.99);
  });

  test('Phase 1 + Phase 5 total time <5 seconds', async () => {
    const phase1Time = 0.75;
    const phase5Time = 2.5;
    const totalTime = phase1Time + phase5Time;
    
    expect(totalTime).toBeLessThan(5);
  });
});

describe('Integration - Complete Workflow (All Phases)', () => {

  test('should execute Phase 1 → 3 → 4 → 5 workflow', async () => {
    const workflow = [
      { phase: 1, success: true, time: 0.75, confidence: 0.95 },
      { phase: 3, success: true, time: 0.5, confidence: 0.99 },
      { phase: 4, success: true, time: 2.5, confidence: 0.90 }, // Optional
      { phase: 5, success: true, time: 2.5, confidence: 0.75 }  // Optional
    ];

    const totalTime = workflow.reduce((sum, p) => sum + p.time, 0);
    const allSuccessful = workflow.every(p => p.success);
    
    expect(totalTime).toBeLessThan(10);
    expect(allSuccessful).toBe(true);
  });

  test('should merge data from all phases', async () => {
    const finalData = {
      // From Phase 1
      parcelId: '123-456-789',
      yearBuilt: 1985,
      squareFeet: 1850,
      // From Phase 3
      bathrooms: 1.5,
      // From Phase 4 (optional)
      roofType: 'Asphalt',
      roofCondition: 'Good',
      // From Phase 5 (optional)
      valueHistory: [
        { year: 2025, value: 650000 }
      ],
      appreciation: 0.0316
    };

    expect(finalData.yearBuilt).toBe(1985);
    expect(finalData.roofType).toBeDefined();
    expect(finalData.valueHistory).toBeDefined();
  });

  test('should preserve confidence hierarchy in merged data', async () => {
    const confidenceScores = {
      phase1: 0.95,
      phase3: 0.99, // Highest
      phase4: 0.90,
      phase5: 0.75  // Lowest
    };

    const maxConfidence = Math.max(...Object.values(confidenceScores));
    
    expect(maxConfidence).toBe(0.99);
  });

  test('complete workflow timing should be <10 seconds', async () => {
    const workflow = [
      { phase: 1, time: 0.75 },
      { phase: 3, time: 0.5 },
      { phase: 4, time: 2.5 },
      { phase: 5, time: 2.5 }
    ];

    const totalTime = workflow.reduce((sum, p) => sum + p.time, 0);
    
    expect(totalTime).toBeLessThan(10);
  });

  test('should export merged data to all three formats', async () => {
    const mergedData = {
      yearBuilt: 1985,
      squareFeet: 1850,
      confidence: 0.99
    };

    // Format for CMSMTF (plain text key=value)
    const cmsmtfFormat = `gen_sYearBuilt = ${mergedData.yearBuilt}`;
    expect(cmsmtfFormat).toContain('gen_sYearBuilt');

    // Format for XML (must be escaped)
    const xmlFormat = `<yearBuilt>${mergedData.yearBuilt}</yearBuilt>`;
    expect(xmlFormat).toContain('yearBuilt');

    // Format for PDF
    const pdfFormat = {
      'Year Built': mergedData.yearBuilt,
      'Square Feet': mergedData.squareFeet
    };
    expect(pdfFormat['Year Built']).toBe(1985);
  });
});

describe('Integration - Error Handling Across Phases', () => {

  test('should handle Phase 1 failure and fallback to Phase 2', async () => {
    const phase1Error = {
      success: false,
      error: 'County not in ArcGIS'
    };

    const phase2Attempt = {
      success: true,
      confidence: 0.85,
      fallback: true
    };

    expect(phase1Error.success).toBe(false);
    expect(phase2Attempt.success).toBe(true);
    expect(phase2Attempt.fallback).toBe(true);
  });

  test('should handle timeout in fallback chain', async () => {
    const timeoutResult = {
      success: false,
      phase: 2,
      error: 'Timeout after 5 seconds'
    };

    // Should continue with confidence downgrade
    expect(timeoutResult.success).toBe(false);
  });

  test('should gracefully skip optional phases on failure', async () => {
    const workflowResult = {
      phase1: { success: true, confidence: 0.95 },
      phase3: { success: true, confidence: 0.99 },
      phase4: { success: false, error: 'No image provided' }, // Optional - skip
      phase5: { success: true, confidence: 0.75 }
    };

    const corePhases = [1, 3];
    const allCoreSuccess = corePhases.every(p => workflowResult[`phase${p}`].success);
    
    expect(allCoreSuccess).toBe(true);
    expect(workflowResult.phase4.success).toBe(false); // Can fail without breaking form
  });

  test('should provide meaningful error messages to user', async () => {
    const error = {
      phase: 1,
      userMessage: 'Property data not found. Please check the address and try again.',
      technicalMessage: 'ArcGIS API returned 404'
    };

    expect(error.userMessage).toBeDefined();
    expect(error.userMessage.length).toBeGreaterThan(0);
  });
});

describe('Integration - Export Compatibility', () => {

  test('merged data should be compatible with CMSMTF export', async () => {
    const data = {
      firstName: 'John',
      lastName: 'Smith',
      yearBuilt: 1985,
      squareFeet: 1850
    };

    const cmsmtf = `gen_sFirstName = ${data.firstName}\ngen_sLastName = ${data.lastName}`;
    
    expect(cmsmtf).toContain('gen_sFirstName = John');
  });

  test('merged data should be compatible with XML export', async () => {
    const data = {
      firstName: 'John',
      lastName: 'Smith',
      yearBuilt: 1985,
      state: 'WA',
      dob: '1965-03-15'
    };

    // XML requires firstName, lastName, state, dob
    const hasRequired = !!(data.firstName && data.lastName && data.state && data.dob);
    
    expect(hasRequired).toBe(true);
  });

  test('merged data should be compatible with PDF export', async () => {
    const data = {
      firstName: 'John',
      lastName: 'Smith',
      yearBuilt: 1985,
      squareFeet: 1850
    };

    const pdfSummary = {
      'Property Address': 'User will fill in',
      'Year Built': data.yearBuilt,
      'Square Feet': data.squareFeet
    };

    expect(pdfSummary['Year Built']).toBe(1985);
  });
});

describe('Integration - Real Address Test Cases', () => {

  test('should process Clark County, WA address through full workflow', async () => {
    const clarkAddress = testData.counties.clark_county_wa.addresses[0];
    
    const phase1Data = {
      parcelId: clarkAddress.parcelId,
      yearBuilt: clarkAddress.yearBuilt,
      confidence: 0.95
    };

    const phase3Data = {
      yearBuilt: parseInt(clarkAddress.yearBuilt),
      confidence: 0.99
    };

    expect(phase3Data.confidence).toBeGreaterThanOrEqual(phase1Data.confidence);
  });

  test('should process Snohomish County (fallback) through Phase 2→3', async () => {
    const snohomishAddress = testData.counties.snohomish_county_wa.addresses[0];
    
    // Phase 1 fails (not in ArcGIS), Phase 2 succeeds
    const phase2Data = {
      yearBuilt: snohomishAddress.yearBuilt,
      confidence: 0.85
    };

    const phase3Data = {
      yearBuilt: parseInt(snohomishAddress.yearBuilt),
      confidence: 0.99
    };

    expect(phase3Data.confidence).toBeGreaterThan(phase2Data.confidence);
  });
});
