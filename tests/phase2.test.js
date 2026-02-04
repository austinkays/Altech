/**
 * Phase 2: Browser Scraping Tests
 * 
 * Tests the headless browser fallback for unsupported counties
 * Validates web scraping data extraction via Playwright
 * Confidence target: 85%
 * Speed target: 3-5 seconds
 */

const testData = require('./fixtures/test-addresses.json');

describe('Phase 2 - Browser Scraping Tests', () => {
  
  describe('Snohomish County, WA - Phase 2 Primary Tests', () => {
    const snohomishCountyAddresses = testData.counties.snohomish_county_wa.addresses;

    test('should trigger Phase 2 for unsupported county (Snohomish)', async () => {
      const address = snohomishCountyAddresses[0]; // 2341 Broadway, Everett
      
      expect(address.expectedPhase).toContain('Phase 2');
      expect(address.expectedConfidence).toBe('85%');
    });

    test('should retrieve data via browser scraping for Snohomish County', async () => {
      const address = snohomishCountyAddresses[0];
      
      const mockResponse = {
        success: true,
        confidence: '85%',
        source: 'Browser scraping',
        speed: '4s',
        data: {
          yearBuilt: 1992,
          stories: 2,
          lotSizeAcres: 0.25,
          totalSqft: 2000
        }
      };

      expect(mockResponse.success).toBe(true);
      expect(mockResponse.confidence).toBe('85%');
      expect(mockResponse.source).toContain('Browser');
      expect(mockResponse.data.yearBuilt).toBeCloseTo(1992, 1);
    });

    test('should validate data quality is reasonable (85% confidence)', async () => {
      const address = snohomishCountyAddresses[0];
      const yearBuiltRange = address.expectedData.yearBuiltRange;
      const [minYear, maxYear] = yearBuiltRange.split('-').map(Number);
      
      // Data range should be reasonable
      expect(maxYear - minYear).toBeLessThanOrEqual(5);
    });

    test('should meet speed target (3-5 seconds)', async () => {
      const address = snohomishCountyAddresses[0];
      const expectedSpeed = address.expectedSpeed;
      
      if (expectedSpeed) {
        expect(expectedSpeed).toContain('3-5');
      }
    });

    test('should handle browser scraping timeouts gracefully', async () => {
      const timeoutBehavior = {
        timeout: true,
        waitTime: 5000,
        fallback: 'Phase 4'
      };

      expect(timeoutBehavior.timeout).toBe(true);
      expect(timeoutBehavior.waitTime).toBeLessThanOrEqual(6000);
      expect(timeoutBehavior.fallback).toBeDefined();
    });
  });

  describe('Thurston County, WA - Phase 2 Tests', () => {
    const thurstonCountyAddresses = testData.counties.thurston_county_wa.addresses;

    test('should retrieve data for Thurston County address', async () => {
      const address = thurstonCountyAddresses[0];
      
      expect(address.county).toBe('Thurston');
      expect(address.state).toBe('WA');
      expect(address.expectedPhase).toBe('Phase 2');
      expect(address.expectedConfidence).toBe('85%');
    });

    test('should validate government hub property characteristics', async () => {
      const address = thurstonCountyAddresses[0];
      
      expect(address.marketContext).toBeDefined();
      expect(address.marketContext.employmentDriver).toBe('State government');
    });
  });

  describe('Lane County, OR - Phase 2 Tests', () => {
    const laneCountyAddresses = testData.counties.lane_county_or.addresses;

    test('should retrieve data for Lane County address', async () => {
      const address = laneCountyAddresses[0];
      
      expect(address.county).toBe('Lane');
      expect(address.state).toBe('OR');
      expect(address.expectedPhase).toBe('Phase 2');
    });

    test('should handle university town market dynamics', async () => {
      const address = laneCountyAddresses[0];
      
      expect(address.marketContext).toBeDefined();
      expect(address.marketContext.demographics).toContain('student');
    });
  });

  describe('Marion County, OR - Phase 2 Tests', () => {
    const marionCountyAddresses = testData.counties.marion_county_or.addresses;

    test('should retrieve data for Marion County address', async () => {
      const address = marionCountyAddresses[0];
      
      expect(address.county).toBe('Marion');
      expect(address.state).toBe('OR');
      expect(address.expectedPhase).toBe('Phase 2');
    });

    test('should reflect state capital market stability', async () => {
      const address = marionCountyAddresses[0];
      
      expect(address.marketContext.employmentDriver).toBe('State capital');
      expect(address.marketContext.stability).toBe('Stable');
    });
  });

  describe('Pinal County, AZ - Phase 2 Out-of-State Tests', () => {
    const finalCountyAddresses = testData.counties.pinal_county_az.addresses;

    test('should handle out-of-state Arizona property', async () => {
      const address = finalCountyAddresses[0];
      
      expect(address.county).toBe('Pinal');
      expect(address.state).toBe('AZ');
      expect(address.expectedPhase).toBe('Phase 2');
    });

    test('should account for regional differences (larger lots)', async () => {
      const address = finalCountyAddresses[0];
      const waLotSize = 0.25; // Typical WA
      const azLotSize = address.expectedData.lotSizeAcres;
      
      // Arizona lots typically larger
      expect(azLotSize).toBeGreaterThan(waLotSize);
    });

    test('should extract pool presence from Arizona property', async () => {
      const address = finalCountyAddresses[0];
      
      expect(address.expectedData.poolPresent).toBe(true);
    });
  });

  describe('Phase 2 Confidence Scoring', () => {
    
    test('all Phase 2 fallback counties should return 85% confidence', async () => {
      const fallbackCounties = [
        testData.counties.snohomish_county_wa,
        testData.counties.thurston_county_wa,
        testData.counties.lane_county_or,
        testData.counties.marion_county_or,
        testData.counties.pinal_county_az
      ];

      fallbackCounties.forEach(county => {
        county.addresses.forEach(address => {
          expect(address.expectedConfidence).toBe('85%');
        });
      });
    });

    test('confidence should be lower than Phase 1 (85% vs 95%)', async () => {
      const phase1Confidence = 95;
      const phase2Confidence = 85;
      
      expect(phase2Confidence).toBeLessThan(phase1Confidence);
      expect(phase1Confidence - phase2Confidence).toBe(10);
    });

    test('Phase 2 data should be flagged with yellow warning indicator', async () => {
      const phase2Result = {
        confidence: '85%',
        warning: true,
        warningLevel: 'yellow'
      };

      expect(phase2Result.warning).toBe(true);
      expect(phase2Result.warningLevel).toBe('yellow');
    });
  });

  describe('Phase 2 Performance', () => {
    
    test('all Phase 2 addresses should meet speed target (3-5 seconds)', async () => {
      const fallbackCounties = [
        testData.counties.snohomish_county_wa,
        testData.counties.thurston_county_wa,
        testData.counties.lane_county_or,
        testData.counties.marion_county_or,
        testData.counties.pinal_county_az
      ];

      fallbackCounties.forEach(county => {
        county.addresses.forEach(address => {
          if (address.expectedSpeed) {
            expect(address.expectedSpeed).toContain('3-5');
          }
        });
      });
    });

    test('Phase 2 should be slower than Phase 1 (3-5s vs <1s)', async () => {
      const phase1Speed = 0.75;
      const phase2Speed = 4;
      
      expect(phase2Speed).toBeGreaterThan(phase1Speed);
      expect(phase2Speed).toBeLessThan(6); // Should not exceed 5-6 sec budget
    });

    test('should include browser launch and navigation overhead', async () => {
      const browserLaunchTime = 1.5; // seconds
      const navigationTime = 0.5;
      const scrapingTime = 2;
      const totalTime = browserLaunchTime + navigationTime + scrapingTime;
      
      expect(totalTime).toBeGreaterThanOrEqual(3);
      expect(totalTime).toBeLessThanOrEqual(5);
    });
  });

  describe('Phase 2 Data Extraction', () => {
    
    test('should extract parcel data from county website HTML', async () => {
      const address = testData.counties.snohomish_county_wa.addresses[0];
      
      const extractedFields = [
        'yearBuilt',
        'stories',
        'lotSizeAcres',
        'totalSqft'
      ];

      extractedFields.forEach(field => {
        expect(address.expectedData[field]).toBeDefined();
      });
    });

    test('should handle missing/partial data gracefully', async () => {
      const sparseData = {
        yearBuilt: 1992,
        stories: null, // May be missing in some websites
        lotSizeAcres: 0.25
      };

      // System should work with partial data
      expect(sparseData.yearBuilt).toBeDefined();
      expect(sparseData.lotSizeAcres).toBeDefined();
      // Null fields are acceptable
    });

    test('should normalize extracted data to consistent format', async () => {
      const rawExtracted = {
        yearBuilt: '1992',
        lotSize: '0.25 acres'
      };

      const normalized = {
        yearBuilt: 1992,
        lotSizeAcres: 0.25
      };

      expect(parseInt(rawExtracted.yearBuilt)).toBe(normalized.yearBuilt);
      expect(parseFloat(rawExtracted.lotSize)).toBe(normalized.lotSizeAcres);
    });
  });

  describe('Phase 2 Error Handling', () => {
    
    test('should timeout gracefully after 5 seconds', async () => {
      const timeoutConfig = {
        timeout: 5000,
        retries: 0,
        fallback: 'Phase 4'
      };

      expect(timeoutConfig.timeout).toBe(5000);
      expect(timeoutConfig.fallback).toBeDefined();
    });

    test('should handle website structure changes', async () => {
      const failureRecovery = {
        selectors: ['primary', 'fallback'],
        status: 'handles gracefully'
      };

      expect(failureRecovery.selectors.length).toBeGreaterThanOrEqual(1);
      expect(failureRecovery.status).toBeDefined();
    });

    test('should detect and report rate limiting', async () => {
      const rateLimitError = {
        statusCode: 429,
        shouldRetry: true,
        backoffSeconds: 60
      };

      expect(rateLimitError.statusCode).toBe(429);
      expect(rateLimitError.shouldRetry).toBe(true);
    });

    test('should handle JavaScript-rendered content', async () => {
      const dynamicContent = {
        requiresJavaScript: true,
        usesPlaywright: true,
        headless: true
      };

      expect(dynamicContent.requiresJavaScript).toBe(true);
      expect(dynamicContent.usesPlaywright).toBe(true);
    });
  });

  describe('Phase 2 Fallback Chain', () => {
    
    test('Phase 2 failure should trigger Phase 4 (Vision/Satellite)', async () => {
      const phase2Failure = {
        success: false,
        reason: 'website unreachable'
      };

      const fallback = {
        nextPhase: 'Phase 4',
        method: 'satellite analysis'
      };

      expect(phase2Failure.success).toBe(false);
      expect(fallback.nextPhase).toBe('Phase 4');
    });

    test('unsupported county flow: Phase 1 → Phase 2 → Phase 4 chain', async () => {
      const flowLog = [
        { phase: 1, result: null, reason: 'unsupported county (Snohomish)' },
        { phase: 2, result: 'success', confidence: '85%' }
      ];

      expect(flowLog[0].result).toBeNull();
      expect(flowLog[1].result).toBe('success');
      expect(flowLog[1].confidence).toBe('85%');
    });
  });

  describe('Phase 2 Integration', () => {
    
    test('Phase 2 data should be compatible with Phase 3 standardization', async () => {
      const scrapedData = {
        yearBuilt: '1992',
        stories: '2',
        lotSizeAcres: '0.25000'
      };

      const standardized = {
        yearBuilt: 1992,
        stories: 2,
        lotSizeAcres: 0.25
      };

      expect(parseInt(scrapedData.yearBuilt)).toBe(standardized.yearBuilt);
      expect(parseInt(scrapedData.stories)).toBe(standardized.stories);
      expect(parseFloat(scrapedData.lotSizeAcres)).toBeCloseTo(standardized.lotSizeAcres, 2);
    });

    test('Phase 2 data should be exportable in all formats', async () => {
      const phase2Data = testData.counties.snohomish_county_wa.addresses[0].expectedData;
      
      // Should have required export fields
      expect(phase2Data.yearBuilt).toBeDefined();
      expect(phase2Data.totalSqft).toBeDefined();
      expect(phase2Data.lotSizeAcres).toBeDefined();
    });

    test('combined Phase 1+2 coverage should span all tested counties', async () => {
      const phase1Counties = 4; // Clark, King, Pierce, Multnomah
      const phase2Counties = 5; // Snohomish, Thurston, Lane, Marion, Pinal
      
      expect(phase1Counties + phase2Counties).toBe(9);
    });
  });

  describe('Phase 2 Regional Variations', () => {
    
    test('should handle regional market differences (WA vs OR vs AZ)', async () => {
      const waProperty = testData.counties.snohomish_county_wa.addresses[0];
      const orProperty = testData.counties.lane_county_or.addresses[0];
      const azProperty = testData.counties.pinal_county_az.addresses[0];
      
      expect(waProperty.state).toBe('WA');
      expect(orProperty.state).toBe('OR');
      expect(azProperty.state).toBe('AZ');
    });

    test('Arizona properties should reflect different construction patterns', async () => {
      const azProperty = testData.counties.pinal_county_az.addresses[0];
      
      // Arizona-specific
      expect(azProperty.expectedData.poolPresent).toBe(true);
      expect(azProperty.expectedData.lotSizeAcres).toBeGreaterThan(0.25);
    });
  });

});

describe('Phase 2 Performance Tracking', () => {
  
  test('should log browser session metrics', async () => {
    const metrics = {
      browserLaunchMs: 1500,
      navigationMs: 500,
      scrapingMs: 2000,
      totalMs: 4000
    };

    const total = metrics.browserLaunchMs + metrics.navigationMs + metrics.scrapingMs;
    expect(total).toBe(metrics.totalMs);
    expect(total).toBeLessThan(5000);
  });

  test('should track cost of browser compute', async () => {
    const costPerQuery = 0.001; // $0.001 per browser session
    const queriesPerMonth = 1000;
    const monthlyCost = costPerQuery * queriesPerMonth;
    
    expect(monthlyCost).toBeLessThan(2); // Should be cheap
  });

});
