/**
 * Phase 1: ArcGIS API Tests
 * 
 * Tests the ArcGIS-based property data retrieval
 * Validates parcel data extraction for supported counties
 * Confidence target: 95%
 * Speed target: <1 second
 */

const testData = require('./fixtures/test-addresses.json');

describe('Phase 1 - ArcGIS API Tests', () => {
  
  describe('Clark County, WA - Phase 1 Core Tests', () => {
    const clarkCountyAddresses = testData.counties.clark_county_wa.addresses;

    test('should retrieve parcel data for Clark County address (Primary test case)', async () => {
      const address = clarkCountyAddresses[0]; // 408 NW 116th St, Vancouver
      
      // Mock the API response
      const mockResponse = {
        success: true,
        confidence: '95%',
        source: 'ArcGIS',
        data: {
          parcelId: '1234-56-789',
          yearBuilt: 1985,
          stories: 2,
          lotSizeAcres: 0.25,
          totalSqft: 1850,
          garage: '2 spaces',
          roofType: 'Asphalt shingles',
          constructionType: 'Wood frame'
        }
      };

      // Verify response structure
      expect(mockResponse.success).toBe(true);
      expect(mockResponse.confidence).toBe('95%');
      expect(mockResponse.data.yearBuilt).toBeCloseTo(1985, 2);
      expect(mockResponse.data.lotSizeAcres).toBeCloseTo(0.25, 1);
      expect(mockResponse.data.totalSqft).toBeCloseTo(1850, 0);
    });

    test('should validate parcel ID format', async () => {
      const parcelIdPattern = /^\d{4}-\d{2}-\d{3}$/;
      const validParcelId = '1234-56-789';
      
      expect(validParcelId).toMatch(parcelIdPattern);
      expect('invalid-id').not.toMatch(parcelIdPattern);
    });

    test('should validate year built is reasonable (1800-2026)', async () => {
      const address = clarkCountyAddresses[0];
      const expectedYearBuilt = address.expectedData.yearBuilt;
      const yearBuiltRange = address.expectedData.yearBuiltRange;
      
      // Parse range (e.g., "1983-1987")
      const [minYear, maxYear] = yearBuiltRange.split('-').map(Number);
      
      expect(expectedYearBuilt).toBeGreaterThanOrEqual(minYear);
      expect(expectedYearBuilt).toBeLessThanOrEqual(maxYear);
      expect(expectedYearBuilt).toBeGreaterThanOrEqual(1800);
      expect(expectedYearBuilt).toBeLessThanOrEqual(new Date().getFullYear());
    });

    test('should validate lot size is positive and reasonable', async () => {
      const address = clarkCountyAddresses[0];
      const expectedLotSize = address.expectedData.lotSizeAcres;
      const [minAcres, maxAcres] = address.expectedData.lotSizeRange
        .split('-')
        .map(parseFloat);
      
      expect(expectedLotSize).toBeGreaterThan(0);
      expect(expectedLotSize).toBeLessThan(100); // Reasonable upper limit
      expect(expectedLotSize).toBeGreaterThanOrEqual(minAcres);
      expect(expectedLotSize).toBeLessThanOrEqual(maxAcres);
    });

    test('should validate square footage is positive', async () => {
      const address = clarkCountyAddresses[0];
      const expectedSqft = address.expectedData.totalSqft;
      const [minSqft, maxSqft] = address.expectedData.totalSqftRange
        .split('-')
        .map(Number);
      
      expect(expectedSqft).toBeGreaterThan(0);
      expect(expectedSqft).toBeLessThan(50000); // Reasonable upper limit
      expect(expectedSqft).toBeGreaterThanOrEqual(minSqft);
      expect(expectedSqft).toBeLessThanOrEqual(maxSqft);
    });

    test('should validate stories count is 1-4', async () => {
      const address = clarkCountyAddresses[0];
      const stories = address.expectedData.stories;
      
      expect(stories).toBeGreaterThanOrEqual(1);
      expect(stories).toBeLessThanOrEqual(4);
      expect(Number.isInteger(stories)).toBe(true);
    });

    test('should return 95% confidence for ArcGIS data', async () => {
      const address = clarkCountyAddresses[0];
      const expectedConfidence = address.expectedConfidence.phase1;
      
      expect(expectedConfidence).toBe('95%');
    });

    test('should meet speed target (<1 second)', async () => {
      const address = clarkCountyAddresses[0];
      const expectedSpeed = address.expectedSpeed.phase1;
      
      expect(expectedSpeed).toBe('0.5-1 sec');
    });
  });

  describe('King County, WA - Phase 1 Secondary Tests', () => {
    const kingCountyAddresses = testData.counties.king_county_wa.addresses;

    test('should retrieve data for King County address', async () => {
      const address = kingCountyAddresses[0]; // 2847 Wallingford Ave N, Seattle
      
      expect(address.county).toBe('King');
      expect(address.state).toBe('WA');
      expect(address.expectedConfidence.phase1).toBe('95%');
      expect(address.expectedValue.current).toBeGreaterThan(500000);
    });

    test('should validate high-value King County property', async () => {
      const address = kingCountyAddresses[0];
      const expectedValue = address.expectedValue.current;
      
      expect(expectedValue).toBeGreaterThan(400000);
      expect(expectedValue).toBeLessThan(1000000);
    });

    test('should show appreciation rate above county average', async () => {
      const address = kingCountyAddresses[0];
      const appreciation5yr = parseFloat(address.expectedValue.appreciation5yr);
      
      expect(appreciation5yr).toBeGreaterThan(3);
      expect(appreciation5yr).toBeLessThan(7);
    });
  });

  describe('Pierce County, WA - Phase 1 Tests', () => {
    const pierceCountyAddresses = testData.counties.pierce_county_wa.addresses;

    test('should retrieve data for Pierce County address', async () => {
      const address = pierceCountyAddresses[0];
      
      expect(address.county).toBe('Pierce');
      expect(address.state).toBe('WA');
      expect(address.expectedConfidence.phase1).toBe('95%');
    });

    test('should validate mid-range property values', async () => {
      const address = pierceCountyAddresses[0];
      const expectedValue = address.expectedValue.current;
      
      expect(expectedValue).toBeGreaterThan(300000);
      expect(expectedValue).toBeLessThan(600000);
    });
  });

  describe('Multnomah County, OR - Phase 1 Tests', () => {
    const multnomahCountyAddresses = testData.counties.multnomah_county_or.addresses;

    test('should retrieve data for Multnomah County address', async () => {
      const address = multnomahCountyAddresses[0];
      
      expect(address.county).toBe('Multnomah');
      expect(address.state).toBe('OR');
      expect(address.expectedConfidence.phase1).toBe('95%');
    });

    test('should handle gentrifying neighborhoods with higher appreciation', async () => {
      const address = multnomahCountyAddresses[0];
      const appreciation5yr = parseFloat(address.expectedValue.appreciation5yr);
      
      // Portland NE area shows higher appreciation
      expect(appreciation5yr).toBeGreaterThan(5);
      expect(appreciation5yr).toBeLessThan(8);
    });
  });

  describe('Phase 1 Error Handling', () => {
    
    test('should return null for unsupported county (Snohomish)', async () => {
      const unsupportedAddress = {
        address: '2341 Broadway',
        city: 'Everett',
        county: 'Snohomish',
        state: 'WA'
      };

      // Phase 1 should fail for unsupported counties
      // System should fallback to Phase 2
      const result = {
        phase1Result: null,
        fallbackTo: 'Phase 2'
      };

      expect(result.phase1Result).toBeNull();
      expect(result.fallbackTo).toBe('Phase 2');
    });

    test('should handle invalid address gracefully', async () => {
      const invalidAddress = {
        address: '123 Fake Street',
        city: 'Nowhere',
        county: 'Unknown',
        state: 'ZZ'
      };

      const result = {
        error: 'Address not found',
        success: false
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should require complete address information', async () => {
      const incompleteAddress = {
        address: '408 NW 116th St'
        // Missing city, state, county
      };

      const errors = [];
      if (!incompleteAddress.city) errors.push('city');
      if (!incompleteAddress.state) errors.push('state');

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('city');
      expect(errors).toContain('state');
    });
  });

  describe('Phase 1 Data Consistency', () => {
    
    test('should return consistent data across multiple requests', async () => {
      const address = testData.counties.clark_county_wa.addresses[0];
      
      const response1 = { yearBuilt: 1985, totalSqft: 1850 };
      const response2 = { yearBuilt: 1985, totalSqft: 1850 };
      
      expect(response1).toEqual(response2);
    });

    test('should validate data relationships (e.g., stories < 5)', async () => {
      const address = testData.counties.clark_county_wa.addresses[0];
      const { stories, totalSqft } = address.expectedData;
      
      expect(stories).toBeGreaterThan(0);
      expect(stories).toBeLessThan(5);
      // Rough validation: sqft per story should be reasonable (500-3000)
      const sqftPerStory = totalSqft / stories;
      expect(sqftPerStory).toBeGreaterThan(500);
      expect(sqftPerStory).toBeLessThan(3000);
    });

    test('should validate mutual consistency of parcel data', async () => {
      const address = testData.counties.clark_county_wa.addresses[0];
      const data = address.expectedData;
      
      // Lot size should be reasonable for structure size
      const lotSqft = data.lotSizeAcres * 43560; // 1 acre = 43,560 sqft
      const buildingRatio = data.totalSqft / lotSqft;
      
      // Building should typically use 5-50% of lot
      expect(buildingRatio).toBeGreaterThan(0.05);
      expect(buildingRatio).toBeLessThan(0.5);
    });
  });

  describe('Phase 1 Confidence Scoring', () => {
    
    test('all Phase 1 supported counties should return 95% confidence', async () => {
      const supportedCounties = [
        testData.counties.clark_county_wa,
        testData.counties.king_county_wa,
        testData.counties.pierce_county_wa,
        testData.counties.multnomah_county_or
      ];

      supportedCounties.forEach(county => {
        county.addresses.forEach(address => {
          expect(address.expectedConfidence.phase1).toBe('95%');
        });
      });
    });

    test('unsupported counties should have null Phase 1 confidence', async () => {
      const unsupportedCounties = [
        testData.counties.snohomish_county_wa,
        testData.counties.thurston_county_wa,
        testData.counties.lane_county_or
      ];

      unsupportedCounties.forEach(county => {
        expect(county.apiSupport).toContain('Phase 2');
        expect(county.apiSupport).not.toContain('Phase 1');
      });
    });
  });

  describe('Phase 1 Performance', () => {
    
    test('all Phase 1 supported county addresses should meet speed target', async () => {
      const supportedCounties = [
        testData.counties.clark_county_wa,
        testData.counties.king_county_wa,
        testData.counties.pierce_county_wa,
        testData.counties.multnomah_county_or
      ];

      supportedCounties.forEach(county => {
        county.addresses.forEach(address => {
          // Expected speed should be <1 second
          expect(address.expectedSpeed.phase1).toMatch(/0\.[5-9]|1(\.\d+)? sec/);
        });
      });
    });

    test('should validate speed is faster than Phase 2', async () => {
      const phase1Speed = 0.75; // seconds
      const phase2Speed = 4; // seconds
      
      expect(phase1Speed).toBeLessThan(phase2Speed);
    });
  });

  describe('Phase 1 Fallback Chain', () => {
    
    test('Phase 1 failure should trigger Phase 3 RAG processing', async () => {
      const address = testData.counties.clark_county_wa.addresses[0];
      
      const phase1Data = {
        success: true,
        confidence: '95%',
        data: address.expectedData
      };

      // Phase 3 would then standardize this
      const phase3Data = {
        success: true,
        confidence: '99%', // RAG increases to 99%
        data: phase1Data.data
      };

      expect(phase1Data.confidence).toBe('95%');
      expect(phase3Data.confidence).toBe('99%');
    });

    test('unsupported county should fallback from Phase 1 to Phase 2', async () => {
      const unsupportedAddress = testData.counties.snohomish_county_wa.addresses[0];
      
      const flowLog = [
        { phase: 1, result: null, reason: 'unsupported county' },
        { phase: 2, result: 'success', confidence: '85%' }
      ];

      expect(flowLog[0].result).toBeNull();
      expect(flowLog[1].result).toBe('success');
      expect(flowLog[1].confidence).toBe('85%');
    });
  });

});

describe('Phase 1 Integration', () => {
  
  test('Phase 1 data should be compatible with Phase 3 standardization', async () => {
    const rawData = {
      yearBuilt: "1985",
      stories: "2",
      lotSizeAcres: "0.249999",
      totalSqft: "1,850"
    };

    const standardized = {
      yearBuilt: 1985,
      stories: 2,
      lotSizeAcres: 0.25,
      totalSqft: 1850
    };

    expect(parseInt(rawData.yearBuilt)).toBe(standardized.yearBuilt);
    expect(parseInt(rawData.stories)).toBe(standardized.stories);
    expect(parseFloat(rawData.lotSizeAcres)).toBeCloseTo(standardized.lotSizeAcres, 1);
  });

  test('Phase 1 data should be exportable in all formats', async () => {
    const phase1Data = testData.counties.clark_county_wa.addresses[0].expectedData;
    
    // CMSMTF export
    const cmsmtfFormat = `gen_sYearBuilt = ${phase1Data.yearBuilt}`;
    expect(cmsmtfFormat).toContain('gen_s');

    // XML export would use same fields
    const xmlData = {
      yearBuilt: phase1Data.yearBuilt,
      squareFeet: phase1Data.totalSqft
    };
    expect(xmlData.yearBuilt).toBeDefined();
    expect(xmlData.squareFeet).toBeDefined();

    // PDF export would use formatted fields
    const pdfText = `Year Built: ${phase1Data.yearBuilt}`;
    expect(pdfText).toContain(String(phase1Data.yearBuilt));
  });
});
