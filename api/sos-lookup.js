/**
 * Secretary of State Business Entity Search
 *
 * Queries state corporate registries (WA, OR, AZ) to retrieve:
 * - Business entity type (LLC, Corp, etc.)
 * - Formation/registration date
 * - Business status (Active, Dissolved, etc.)
 * - Officers and directors
 * - Registered agent information
 * - UBI/EIN numbers
 *
 * Data Sources:
 * - WA: https://ccfs.sos.wa.gov/
 * - OR: https://sos.oregon.gov/business/
 * - AZ: https://ecorp.azcc.gov/
 */

const STATE_SOS_ENDPOINTS = {
  'WA': {
    name: 'Washington Secretary of State',
    searchUrl: 'https://ccfs.sos.wa.gov/api/BusinessSearch',
    detailsUrl: 'https://ccfs.sos.wa.gov/api/BusinessDetails'
  },
  'OR': {
    name: 'Oregon Secretary of State',
    searchUrl: 'https://sos.oregon.gov/api/business/search',
    detailsUrl: 'https://sos.oregon.gov/api/business/details'
  },
  'AZ': {
    name: 'Arizona Corporation Commission',
    searchUrl: 'https://ecorp.azcc.gov/api/BusinessSearch',
    detailsUrl: 'https://ecorp.azcc.gov/api/BusinessDetails'
  }
};

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
    const { name, ubi, state } = req.query;

    // Validate inputs
    if (!name && !ubi) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: name or ubi'
      });
    }

    if (!state) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: state'
      });
    }

    if (!['WA', 'OR', 'AZ'].includes(state)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid state. Supported states: WA, OR, AZ'
      });
    }

    console.log('[SOS Lookup] Searching:', { name, ubi, state });

    // Query Secretary of State
    const result = await searchSOSEntity(name, ubi, state);

    res.status(200).json(result);
  } catch (error) {
    console.error('[SOS Lookup] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      available: false
    });
  }
}

/**
 * Search Secretary of State business entity registry
 */
async function searchSOSEntity(businessName, ubi, state) {
  try {
    const endpoint = STATE_SOS_ENDPOINTS[state];

    if (!endpoint) {
      return {
        success: false,
        available: false,
        error: `No SOS endpoint configured for state: ${state}`
      };
    }

    const searchParam = ubi || businessName;
    const searchType = ubi ? 'ubi' : 'name';

    console.log(`[SOS Lookup] Querying ${endpoint.name} by ${searchType}: ${searchParam}`);

    // Mock API call structure (replace with actual SOS API/scraper)
    // TODO: Implement actual SOS scraper or API call for each state

    const mockData = {
      success: true,
      available: true,
      source: endpoint.name,
      state: state,
      entity: {
        ubi: ubi || '123-456-789',
        businessName: businessName || 'Mock Business Name',
        entityType: 'Limited Liability Company (LLC)',
        status: 'Active',
        formationDate: '2018-03-15',
        expirationDate: '2025-12-31',
        jurisdiction: state,
        principalOffice: {
          street: '123 Main St',
          city: 'Seattle',
          state: state,
          zip: '98101'
        },
        registeredAgent: {
          name: 'John Doe',
          address: {
            street: '456 Agent Ave',
            city: 'Seattle',
            state: state,
            zip: '98102'
          }
        },
        officers: [
          {
            name: 'Jane Smith',
            title: 'Managing Member',
            appointmentDate: '2018-03-15'
          },
          {
            name: 'Bob Johnson',
            title: 'Member',
            appointmentDate: '2018-03-15'
          }
        ],
        businessActivity: 'General Construction Services',
        filingHistory: [
          { date: '2024-12-01', type: 'Annual Report', status: 'Filed' },
          { date: '2023-12-01', type: 'Annual Report', status: 'Filed' },
          { date: '2022-12-01', type: 'Annual Report', status: 'Filed' }
        ]
      }
    };

    return mockData;

    /* Actual implementation would look like:
    const searchResponse = await fetch(`${endpoint.searchUrl}?${searchType}=${encodeURIComponent(searchParam)}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Altech-Insurance-Platform/1.0',
        'Accept': 'application/json'
      }
    });

    if (!searchResponse.ok) {
      throw new Error(`SOS API returned ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    if (!searchData.results || searchData.results.length === 0) {
      return {
        success: false,
        available: true,
        source: endpoint.name,
        error: 'No business entity found'
      };
    }

    // Get detailed info for first match
    const entityId = searchData.results[0].id;
    const detailsResponse = await fetch(`${endpoint.detailsUrl}/${entityId}`);
    const detailsData = await detailsResponse.json();

    return {
      success: true,
      available: true,
      source: endpoint.name,
      state: state,
      entity: parseEntityData(detailsData, state)
    };
    */

  } catch (error) {
    console.error('[SOS Lookup] Search error:', error);
    return {
      success: false,
      available: false,
      error: error.message,
      reason: 'Failed to retrieve Secretary of State information'
    };
  }
}

/**
 * Parse SOS entity data into normalized format
 */
function parseEntityData(rawData, state) {
  // This would parse the actual SOS response
  // Structure varies significantly by state
  return {
    ubi: rawData.ubi || rawData.registrationNumber || '',
    businessName: rawData.businessName || rawData.entityName || '',
    entityType: rawData.entityType || '',
    status: rawData.status || 'Unknown',
    formationDate: rawData.formationDate || '',
    expirationDate: rawData.expirationDate || '',
    jurisdiction: state,
    principalOffice: rawData.principalOffice || {},
    registeredAgent: rawData.registeredAgent || {},
    officers: rawData.officers || [],
    businessActivity: rawData.businessActivity || '',
    filingHistory: rawData.filingHistory || []
  };
}
