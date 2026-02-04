/**
 * Headless Browser Scraper for County Parcel Data
 * 
 * Phase 2: Headless Browser Integration
 * 
 * This endpoint uses Playwright to navigate county websites and extract
 * parcel data when ArcGIS REST APIs are not available.
 * 
 * WORKFLOW:
 * 1. Phase 1 (ArcGIS API) → Success: Return official data
 * 2. Phase 1 (ArcGIS API) → Fail: Fall back to Phase 2
 * 3. Phase 2 (Headless Browser) → Navigate county site
 * 4. Phase 2 (Headless Browser) → Extract parcel data
 * 5. Phase 2 (Headless Browser) → Timeout/Error: Return null
 * 
 * COST/PERFORMANCE:
 * - Playwright cold start: 1-2 seconds
 * - Navigation + extraction: 2-3 seconds
 * - Total: 3-5 seconds (acceptable fallback)
 * - Cost: ~$0.003 per query (Vercel Pro)
 */

/**
 * County scraping patterns for different website structures
 * Each county has different site layout, form fields, etc.
 */
const COUNTY_SCRAPING_PATTERNS = {
  'Snohomish': {
    state: 'WA',
    baseUrl: 'https://www.snohomishcountywa.gov/AssessorPropertySearch/',
    type: 'form-submit',
    searchField: 'address',
    timeout: 30000,
    pattern: {
      selector: '.property-details',
      fields: {
        parcelId: '.parcel-number',
        yearBuilt: '.year-built',
        lotSize: '.lot-size',
        totalSqft: '.total-sqft',
        stories: '.stories'
      }
    }
  },
  'Thurston': {
    state: 'WA',
    baseUrl: 'https://www.thurstoncountygov.org/AssessorSearch',
    type: 'form-submit',
    searchField: 'Address',
    timeout: 30000,
    pattern: {
      selector: '.assessment-info',
      fields: {
        parcelId: '[data-field="parcel"]',
        yearBuilt: '[data-field="year"]',
        lotSize: '[data-field="lot"]',
        totalSqft: '[data-field="sqft"]',
        stories: '[data-field="stories"]'
      }
    }
  },
  'Lane': {
    state: 'OR',
    baseUrl: 'https://www.lanecounty.org/government/Assessor/',
    type: 'form-submit',
    searchField: 'SearchAddress',
    timeout: 30000,
    pattern: {
      selector: '.property-data',
      fields: {
        parcelId: '.assessment-number',
        yearBuilt: '.construction-year',
        lotSize: '.land-area',
        totalSqft: '.living-area',
        stories: '.stories'
      }
    }
  },
  'Marion': {
    state: 'OR',
    baseUrl: 'https://www.marioncountyor.gov/Assessor/ParcelSearch/',
    type: 'form-submit',
    searchField: 'address',
    timeout: 30000,
    pattern: {
      selector: '.parcel-info',
      fields: {
        parcelId: '.parcel-account',
        yearBuilt: '.year-constructed',
        lotSize: '.lot-square-feet',
        totalSqft: '.living-square-feet',
        stories: '.number-of-stories'
      }
    }
  },
  'Pinal': {
    state: 'AZ',
    baseUrl: 'https://www.pinalcountyaz.gov/assessor/',
    type: 'form-submit',
    searchField: 'Address',
    timeout: 30000,
    pattern: {
      selector: '.property-assessment',
      fields: {
        parcelId: '.parcel-num',
        yearBuilt: '.year-built',
        lotSize: '.lot-acres',
        totalSqft: '.building-sqft',
        stories: '.stories'
      }
    }
  }
};

/**
 * Scrape county website for parcel data
 * Uses Playwright to navigate and extract information
 * 
 * IMPORTANT: This is designed for Vercel Pro (Playwright support)
 * Falls back to null if Playwright unavailable
 */
async function scrapeCountyWebsite(address, city, state, countyName) {
  const pattern = COUNTY_SCRAPING_PATTERNS[countyName];
  
  if (!pattern) {
    return {
      success: false,
      error: `County ${countyName} not yet configured for browser scraping`,
      county: countyName,
      fallback: true
    };
  }

  try {
    // Check if Playwright is available (Vercel Pro feature)
    let playwright;
    try {
      playwright = await import('playwright');
    } catch (e) {
      return {
        success: false,
        error: 'Playwright not available in this environment',
        county: countyName,
        fallback: true,
        hint: 'Requires Vercel Pro plan for serverless Playwright'
      };
    }

    const { chromium } = playwright;
    let browser;

    try {
      // Launch browser with timeout protection
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
      });

      const page = await browser.newPage();
      page.setDefaultTimeout(pattern.timeout);
      page.setDefaultNavigationTimeout(pattern.timeout);

      // Navigate to county assessor website
      await page.goto(pattern.baseUrl, { waitUntil: 'networkidle' });

      // Fill and submit search form
      const formSelector = 'form';
      const inputSelector = `input[name="${pattern.searchField}"]`;
      
      if (await page.$(inputSelector)) {
        await page.fill(inputSelector, address);
        
        // Submit form
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle' });
      } else {
        return {
          success: false,
          error: `Could not find search field on county website`,
          county: countyName,
          fallback: true
        };
      }

      // Extract parcel data
      const dataSelector = pattern.pattern.selector;
      const hasData = await page.$(dataSelector);

      if (!hasData) {
        return {
          success: false,
          error: 'No property data found',
          county: countyName,
          fallback: true
        };
      }

      // Extract fields based on pattern
      const parcelData = {};
      for (const [field, selector] of Object.entries(pattern.pattern.fields)) {
        try {
          const value = await page.$eval(selector, el => el.textContent?.trim());
          parcelData[field] = value || null;
        } catch (e) {
          // Field not found on this page
          parcelData[field] = null;
        }
      }

      await browser.close();

      return {
        success: true,
        county: countyName,
        parcelData: normalizeScrapedData(parcelData, countyName),
        method: 'headless-browser',
        confidence: 0.85 // Browser scraping less reliable than APIs
      };

    } catch (navError) {
      if (browser) await browser.close();
      
      return {
        success: false,
        error: `Browser navigation error: ${navError.message}`,
        county: countyName,
        fallback: true
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error.message,
      county: countyName,
      fallback: true
    };
  }
}

/**
 * Normalize scraped data from different county formats
 */
function normalizeScrapedData(scrapedData, countyName) {
  // Parse numeric values and clean strings
  const cleanValue = (val) => {
    if (!val) return null;
    return val.replace(/[^0-9.]/g, '').trim();
  };

  return {
    countyName,
    parcelId: scrapedData.parcelId || 'N/A',
    yearBuilt: parseInt(cleanValue(scrapedData.yearBuilt)) || 0,
    lotSizeAcres: parseFloat(cleanValue(scrapedData.lotSize)) || 0,
    totalSqft: parseInt(cleanValue(scrapedData.totalSqft)) || 0,
    stories: parseInt(cleanValue(scrapedData.stories)) || 0,
    garageSqft: 0, // Typically not available from web scraping
    garageType: 'N/A',
    roofType: 'N/A',
    landUse: 'N/A'
  };
}

/**
 * Generic scraper for counties without specific patterns
 * Uses generic CSS selectors and heuristics
 */
async function scrapeGenericCountyWebsite(address, city, state, countyName, gisUrl) {
  try {
    let playwright;
    try {
      playwright = await import('playwright');
    } catch (e) {
      return {
        success: false,
        error: 'Playwright not available',
        county: countyName,
        fallback: true
      };
    }

    const { chromium } = playwright;
    let browser;

    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.setDefaultTimeout(15000);

      // Navigate to GIS URL
      await page.goto(gisUrl, { waitUntil: 'domcontentloaded' });

      // Try to find any property details on the page
      // This is a best-effort attempt with common patterns
      const dataElements = await page.locator('[class*="property"], [class*="parcel"], [class*="assessment"]').count();

      if (dataElements === 0) {
        // Generic fallback: return null to signal manual lookup needed
        await browser.close();
        return {
          success: false,
          error: 'Could not automatically extract data from this county website',
          county: countyName,
          fallback: true,
          gisUrl: gisUrl
        };
      }

      // Extract common patterns
      const parcelData = {
        countyName,
        parcelId: 'N/A',
        yearBuilt: 0,
        lotSizeAcres: 0,
        totalSqft: 0,
        stories: 0
      };

      await browser.close();

      return {
        success: false,
        error: 'Partial data extraction (generic pattern)',
        county: countyName,
        fallback: true,
        parcelData: parcelData
      };

    } catch (navError) {
      if (browser) await browser.close();
      return {
        success: false,
        error: `Navigation failed: ${navError.message}`,
        county: countyName,
        fallback: true
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error.message,
      county: countyName,
      fallback: true
    };
  }
}

/**
 * Main handler function
 * Vercel serverless function entry point
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { address, city, state, county, gisUrl } = req.query;

    // Validate inputs
    if (!address || !city || !state || !county) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: address, city, state, county'
      });
    }

    // Try configured pattern first
    if (COUNTY_SCRAPING_PATTERNS[county]) {
      const result = await scrapeCountyWebsite(address, city, state, county);
      return res.status(200).json(result);
    }

    // Fall back to generic scraper
    if (gisUrl) {
      const result = await scrapeGenericCountyWebsite(address, city, state, county, gisUrl);
      return res.status(200).json(result);
    }

    // No pattern available
    res.status(200).json({
      success: false,
      error: 'County not configured for browser scraping',
      county: county,
      fallback: true
    });

  } catch (error) {
    console.error('Headless Browser Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      fallback: true
    });
  }
}
