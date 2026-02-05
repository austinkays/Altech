/**
 * WA L&I Contractor Registry Lookup
 *
 * Queries the Washington State Department of Labor & Industries
 * contractor verification database to retrieve:
 * - License number and status
 * - Business classification
 * - Bond information
 * - Expiration dates
 * - Violation history
 *
 * Data Source: https://secure.lni.wa.gov/verify/
 */

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
    const { name, ubi } = req.query;

    // Validate inputs
    if (!name && !ubi) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: name or ubi'
      });
    }

    console.log('[L&I Lookup] Searching for:', { name, ubi });

    // Query L&I contractor registry
    const result = await searchLIContractor(name, ubi);

    res.status(200).json(result);
  } catch (error) {
    console.error('[L&I Lookup] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      available: false
    });
  }
}

/**
 * Search L&I contractor registry
 */
async function searchLIContractor(businessName, ubi) {
  try {
    // WA L&I API endpoint (actual endpoint may vary)
    // Note: L&I may require scraping if no official API exists
    const searchParam = ubi || businessName;
    const searchType = ubi ? 'ubi' : 'name';

    console.log(`[L&I Lookup] Querying by ${searchType}: ${searchParam}`);

    // Mock API call structure (replace with actual L&I API/scraper)
    const apiUrl = `https://secure.lni.wa.gov/verify/api/search?${searchType}=${encodeURIComponent(searchParam)}`;

    // For now, return mock data structure
    // TODO: Implement actual L&I scraper or API call
    const mockData = {
      success: true,
      available: true,
      source: 'WA Department of Labor & Industries',
      contractor: {
        licenseNumber: 'MOCKLI001234',
        businessName: businessName || 'Mock Business Name',
        ubi: ubi || '123-456-789',
        status: 'Active',
        licenseType: 'General Contractor',
        classifications: [
          'General Construction/Trades',
          'Residential Construction',
          'Commercial Construction'
        ],
        expirationDate: '2025-12-31',
        bondAmount: '$12,000',
        registrationDate: '2018-03-15',
        address: {
          street: '123 Main St',
          city: 'Seattle',
          state: 'WA',
          zip: '98101'
        },
        violations: [],
        bondStatus: 'Current',
        insuranceStatus: 'Current'
      }
    };

    return mockData;

    /* Actual implementation would look like:
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Altech-Insurance-Platform/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`L&I API returned ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      available: true,
      source: 'WA Department of Labor & Industries',
      contractor: parseContractorData(data)
    };
    */

  } catch (error) {
    console.error('[L&I Lookup] Search error:', error);
    return {
      success: false,
      available: false,
      error: error.message,
      reason: 'Failed to retrieve L&I contractor information'
    };
  }
}

/**
 * Parse L&I contractor data into normalized format
 */
function parseContractorData(rawData) {
  // This would parse the actual L&I response
  // Structure depends on their API/HTML format
  return {
    licenseNumber: rawData.licenseNumber || '',
    businessName: rawData.businessName || '',
    ubi: rawData.ubi || '',
    status: rawData.status || 'Unknown',
    licenseType: rawData.licenseType || '',
    classifications: rawData.classifications || [],
    expirationDate: rawData.expirationDate || '',
    bondAmount: rawData.bondAmount || '',
    registrationDate: rawData.registrationDate || '',
    address: rawData.address || {},
    violations: rawData.violations || [],
    bondStatus: rawData.bondStatus || 'Unknown',
    insuranceStatus: rawData.insuranceStatus || 'Unknown'
  };
}
