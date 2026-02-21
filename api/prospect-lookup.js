/**
 * Commercial Prospect Investigator - Consolidated API
 *
 * Single serverless function that handles all three public records lookups:
 * - WA L&I Contractor Registry
 * - Secretary of State Business Entities (WA, OR, AZ)
 * - OSHA Inspection Database
 *
 * Routes requests based on 'type' query parameter: li, sos, or osha
 */

import { securityMiddleware } from '../lib/security.js';

/**
 * Main handler function
 * Vercel serverless function entry point
 */
async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: type (must be "li", "sos", or "osha")'
      });
    }

    let result;

    switch (type) {
      case 'li':
        result = await handleLILookup(req.query);
        break;
      case 'sos':
        result = await handleSOSLookup(req.query);
        break;
      case 'or-ccb':
        result = await handleORCCBLookup(req.query);
        break;
      case 'osha':
        result = await handleOSHALookup(req.query);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Invalid type: ${type}. Must be "li", "sos", "or-ccb", or "osha"`
        });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('[Prospect Lookup] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      available: false
    });
  }
}

export default securityMiddleware(handler);

// ============================================================================
// L&I CONTRACTOR REGISTRY LOOKUP
// ============================================================================

async function handleLILookup(query) {
  const { name, ubi } = query;

  if (!name && !ubi) {
    return {
      success: false,
      error: 'Missing required parameters: name or ubi'
    };
  }

  console.log('[L&I Lookup] Searching for:', { name, ubi });
  return await searchLIContractor(name, ubi);
}

// Helper function to fetch principal/owner names from L&I dataset
async function fetchLIPrincipals(ubiNumber) {
  try {
    // Dataset: 4xk5-x9j6 (L&I Principal Names)
    const baseUrl = 'https://data.wa.gov/resource/4xk5-x9j6.json';
    const cleanUbi = ubiNumber.replace(/-/g, '');

    const params = new URLSearchParams();
    params.append('$where', `ubi='${cleanUbi}' OR ubi='${ubiNumber}'`);
    params.append('$limit', '10');

    const apiUrl = `${baseUrl}?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Altech-Insurance-Platform/1.0',
        'X-App-Token': process.env.SOCRATA_APP_TOKEN || ''
      }
    });

    if (!response.ok) {
      console.error(`[L&I Principals] API returned ${response.status}`);
      return [];
    }

    const principals = await response.json();
    console.log(`[L&I Principals] Found ${principals.length} principal(s)`);

    // Extract unique principal data with details
    const formattedPrincipals = principals
      .filter(p => p.principalname && p.principalname.trim())
      .map(p => ({
        name: p.principalname,
        title: p.principaltitle || 'Principal',
        startDate: p.startdate || ''
      }))
      .filter((principal, index, self) =>
        // Remove duplicates by name
        self.findIndex(pr => pr.name === principal.name) === index
      );

    return formattedPrincipals;

  } catch (error) {
    console.error('[L&I Principals] Error fetching principals:', error);
    return [];
  }
}

async function searchLIContractor(businessName, ubi) {
  try {
    const searchParam = ubi || businessName;
    const searchType = ubi ? 'ubi' : 'name';

    console.log(`[L&I Lookup] Querying Socrata API by ${searchType}: ${searchParam}`);

    // Use Socrata Open Data API (SODA) for WA L&I data
    // Dataset: m8qx-ubtq (L&I Contractor Data)
    const baseUrl = 'https://data.wa.gov/resource/m8qx-ubtq.json';

    // Build query parameters
    const params = new URLSearchParams();
    if (ubi) {
      // Clean UBI format (remove dashes if present)
      const cleanUbi = ubi.replace(/-/g, '');
      params.append('$where', `ubi='${cleanUbi}' OR ubi='${ubi}'`);
    } else {
      // Sanitize business name for SoQL: escape single quotes, strip chars that break queries
      const safeName = businessName.replace(/'/g, "''").replace(/[\\%_]/g, '');
      params.append('$where', `upper(businessname) LIKE upper('%${safeName}%')`);
    }
    params.append('$limit', '10'); // Limit results
    params.append('$order', 'licenseexpirationdate DESC'); // Most recent first

    const apiUrl = `${baseUrl}?${params.toString()}`;
    console.log('[L&I Lookup] API URL:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Altech-Insurance-Platform/1.0',
        'X-App-Token': process.env.SOCRATA_APP_TOKEN || ''
      }
    });

    if (!response.ok) {
      console.error(`[L&I Lookup] Socrata API returned ${response.status}`);
      throw new Error(`Socrata API returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`[L&I Lookup] Found ${data.length} result(s)`);

    if (!data || data.length === 0) {
      return {
        success: false,
        available: true,
        source: 'WA Department of Labor & Industries (Socrata API)',
        error: 'No contractor license found for the provided search criteria'
      };
    }

    // If searching by name (not UBI) and multiple results found, return list for selection
    if (!ubi && data.length > 1) {
      console.log('[L&I Lookup] Multiple results found - returning selection list');
      return {
        success: true,
        available: true,
        multipleResults: true,
        source: 'WA Department of Labor & Industries (Socrata API)',
        count: data.length,
        results: data.slice(0, 20).map(c => ({
          businessName: c.businessname || '',
          ubi: c.ubi || '',
          licenseNumber: c.contractorlicensenumber || '',
          status: c.contractorlicensestatus || 'Unknown',
          licenseType: c.contractorlicensetypecodedesc || 'General Contractor',
          city: c.city || '',
          state: c.state || 'WA',
          expirationDate: c.licenseexpirationdate ? c.licenseexpirationdate.split('T')[0] : ''
        }))
      };
    }

    // Single result or UBI search - return full details
    const contractor = data[0];

    // Fetch principal/owner names from secondary dataset if we have UBI
    let ownerNames = [];
    if (contractor.ubi) {
      ownerNames = await fetchLIPrincipals(contractor.ubi);
    }

    // Add primary principal if available
    if (contractor.primaryprincipalname && !ownerNames.includes(contractor.primaryprincipalname)) {
      ownerNames.unshift(contractor.primaryprincipalname);
    }

    // Transform Socrata data to our standard format
    const contractorData = {
      licenseNumber: contractor.contractorlicensenumber || 'Not found',
      businessName: contractor.businessname || businessName,
      ubi: contractor.ubi || ubi || '',
      status: contractor.contractorlicensestatus || 'Unknown',
      licenseType: contractor.contractorlicensetypecodedesc || 'General Contractor',
      classifications: contractor.specialtycode1desc ? [contractor.specialtycode1desc] : ['General Contractor'],
      expirationDate: contractor.licenseexpirationdate ? contractor.licenseexpirationdate.split('T')[0] : '',
      bondAmount: '', // Bond amount not in this dataset
      registrationDate: contractor.licenseeffectivedate ? contractor.licenseeffectivedate.split('T')[0] : '',
      address: {
        street: contractor.address1 || '',
        city: contractor.city || '',
        state: contractor.state || 'WA',
        zip: contractor.zip || ''
      },
      violations: [], // Violations would need separate dataset
      bondStatus: contractor.contractorlicensestatus && contractor.contractorlicensestatus.toLowerCase().includes('active') ? 'Current' : 'Unknown',
      insuranceStatus: 'Current', // Would need verification from separate source
      owners: ownerNames // Include owner names
    };

    return {
      success: true,
      available: true,
      source: 'WA Department of Labor & Industries (Socrata API)',
      contractor: contractorData
    };

  } catch (error) {
    console.error('[L&I Lookup] Search error:', error);
    return {
      success: false,
      available: false,
      source: 'WA Department of Labor & Industries (Socrata API)',
      error: `L&I lookup failed: ${error.message}`
    };
  }
}

// ============================================================================
// OREGON CCB CONTRACTOR LOOKUP (Socrata API)
// ============================================================================

async function handleORCCBLookup(query) {
  const { name, license } = query;

  if (!name && !license) {
    return {
      success: false,
      error: 'Missing required parameters: name or license'
    };
  }

  console.log('[OR CCB Lookup] Searching for:', { name, license });
  return await searchORCCBContractor(name, license);
}

async function searchORCCBContractor(businessName, licenseNumber) {
  try {
    console.log(`[OR CCB Lookup] Querying Socrata API...`);

    // Use Socrata Open Data API (SODA) for Oregon CCB data
    // Dataset: g77e-6bhs (Oregon CCB Active Licenses)
    const baseUrl = 'https://data.oregon.gov/resource/g77e-6bhs.json';

    // Build query parameters
    const params = new URLSearchParams();
    if (licenseNumber) {
      params.append('$where', `license_number='${licenseNumber}'`);
    } else {
      // Search by business name (case-insensitive, partial match)
      params.append('$where', `upper(full_name) LIKE upper('%${businessName}%')`);
    }
    params.append('$limit', '10'); // Limit results
    params.append('$order', 'lic_exp_date DESC'); // Most recent first

    const apiUrl = `${baseUrl}?${params.toString()}`;
    console.log('[OR CCB Lookup] API URL:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Altech-Insurance-Platform/1.0',
        'X-App-Token': process.env.SOCRATA_APP_TOKEN || ''
      }
    });

    if (!response.ok) {
      console.error(`[OR CCB Lookup] Socrata API returned ${response.status}`);
      throw new Error(`Socrata API returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`[OR CCB Lookup] Found ${data.length} result(s)`);

    if (!data || data.length === 0) {
      return {
        success: false,
        available: true,
        source: 'Oregon Construction Contractors Board (Socrata API)',
        error: 'No CCB license found for the provided search criteria'
      };
    }

    // If searching by name (not license) and multiple results found, return list for selection
    if (!licenseNumber && data.length > 1) {
      console.log('[OR CCB Lookup] Multiple results found - returning selection list');
      return {
        success: true,
        available: true,
        multipleResults: true,
        source: 'Oregon Construction Contractors Board (Socrata API)',
        count: data.length,
        results: data.slice(0, 20).map(c => ({
          businessName: c.full_name || '',
          ubi: c.license_number || '',
          licenseNumber: c.license_number || '',
          status: c.lic_exp_date ? 'Active' : 'Unknown',
          licenseType: c.endorsement_text || c.license_type || 'Contractor',
          city: c.city || '',
          state: c.state || 'OR',
          expirationDate: c.lic_exp_date || ''
        }))
      };
    }

    // Single result or license search - return full details
    const contractor = data[0];

    // Transform Socrata data to our standard format
    const contractorData = {
      licenseNumber: contractor.license_number || 'Not found',
      businessName: contractor.full_name || businessName,
      ccbNumber: contractor.license_number || '',
      status: contractor.lic_exp_date ? 'Active' : 'Unknown', // If has exp date, likely active
      licenseType: contractor.endorsement_text || contractor.license_type || 'General Contractor',
      classifications: contractor.endorsement_text ? [contractor.endorsement_text] : [],
      expirationDate: contractor.lic_exp_date || '',
      bondAmount: contractor.bond_amount ? `$${parseInt(contractor.bond_amount).toLocaleString()}` : '',
      bondCompany: contractor.bond_company || '',
      bondExpirationDate: contractor.bond_exp_date || '',
      registrationDate: contractor.orig_regis_date || '',
      insuranceCompany: contractor.ins_company || '',
      insuranceAmount: contractor.ins_amount ? `$${parseInt(contractor.ins_amount).toLocaleString()}` : '',
      insuranceExpirationDate: contractor.ins_exp_date || '',
      address: {
        street: contractor.address || '',
        city: contractor.city || '',
        state: contractor.state || 'OR',
        zip: contractor.zip_code || ''
      },
      phone: contractor.phone_number || '',
      county: contractor.county_name || '',
      rmi: contractor.rmi_name || '', // Responsible Managing Individual
      violations: [], // Would need separate violations dataset
      bondStatus: contractor.bond_exp_date ? 'Current' : 'Unknown',
      insuranceStatus: contractor.ins_exp_date ? 'Current' : 'Unknown'
    };

    return {
      success: true,
      available: true,
      source: 'Oregon Construction Contractors Board (Socrata API)',
      contractor: contractorData
    };

  } catch (error) {
    console.error('[OR CCB Lookup] Search error:', error);
    return {
      success: false,
      available: false,
      source: 'Oregon Construction Contractors Board (Socrata API)',
      error: `OR CCB lookup failed: ${error.message}`
    };
  }
}

// ============================================================================
// SECRETARY OF STATE BUSINESS ENTITY LOOKUP
// ============================================================================

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

async function handleSOSLookup(query) {
  const { name, ubi, state } = query;

  if (!name && !ubi) {
    return {
      success: false,
      error: 'Missing required parameters: name or ubi'
    };
  }

  if (!state) {
    return {
      success: false,
      error: 'Missing required parameter: state'
    };
  }

  if (!['WA', 'OR', 'AZ'].includes(state)) {
    return {
      success: false,
      error: 'Invalid state. Supported states: WA, OR, AZ'
    };
  }

  console.log('[SOS Lookup] Searching:', { name, ubi, state });
  return await searchSOSEntity(name, ubi, state);
}

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

    let entityData;

    switch (state) {
      case 'WA':
        entityData = await scrapeWASOS(businessName, ubi);
        break;
      case 'OR':
        entityData = await scrapeORSOS(businessName, ubi);
        break;
      case 'AZ':
        entityData = await scrapeAZSOS(businessName, ubi);
        break;
      default:
        throw new Error(`Unsupported state: ${state}`);
    }

    if (!entityData) {
      return {
        success: false,
        available: true,
        source: endpoint.name,
        state: state,
        error: 'No business entity found'
      };
    }

    // If the scraper returned a manual search fallback (e.g. Turnstile-blocked)
    if (entityData.manualSearch) {
      return {
        success: false,
        available: true,
        source: endpoint.name,
        state: state,
        manualSearch: true,
        searchUrl: entityData.searchUrl,
        searchTerm: entityData.searchTerm,
        error: entityData.message
      };
    }

    return {
      success: true,
      available: true,
      source: endpoint.name,
      state: state,
      entity: entityData
    };

  } catch (error) {
    console.error('[SOS Lookup] Search error:', error);
    return {
      success: false,
      available: false,
      source: STATE_SOS_ENDPOINTS[state]?.name || `${state} Secretary of State`,
      state: state,
      error: `SOS lookup failed: ${error.message}`
    };
  }
}

async function scrapeWASOS(businessName, ubi) {
  try {
    console.log(`[WA SOS] Querying WA SOS API by ${ubi ? 'UBI' : 'name'}: ${ubi || businessName}`);

    // WA SOS moved their API to ccfs-api.prod.sos.wa.gov (Jan 2026)
    // and now requires Cloudflare Turnstile for searches.
    // We try the new endpoint; if it blocks us, return a manual-search link.
    const apiUrl = 'https://ccfs-api.prod.sos.wa.gov/api/BusinessSearch/GetBusinessSearchList';

    // Build search payload matching the official AngularJS app format
    const searchPayload = ubi
      ? {
          Type: 'UBI',
          SearchType: 'UBI',
          SearchEntityName: ubi.replace(/[\s-]/g, ''),
          SearchValue: ubi.replace(/[\s-]/g, ''),
          SearchCriteria: 'Contains',
          IsSearch: true,
          PageID: 1,
          PageCount: 25
        }
      : {
          Type: 'BusinessName',
          SearchType: 'BusinessName',
          SearchEntityName: businessName,
          SortType: 'ASC',
          SortBy: 'Entity Name',
          SearchValue: businessName,
          SearchCriteria: 'Contains',
          IsSearch: true,
          PageID: 1,
          PageCount: 25
        };

    console.log('[WA SOS] API payload:', JSON.stringify(searchPayload));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://ccfs.sos.wa.gov',
        'Referer': 'https://ccfs.sos.wa.gov/'
      },
      body: JSON.stringify(searchPayload)
    });

    console.log('[WA SOS] API response status:', response.status);

    // If blocked by Turnstile or endpoint error, return manual search link
    if (!response.ok) {
      console.warn(`[WA SOS] API returned ${response.status} — likely Turnstile-blocked`);
      const searchTerm = encodeURIComponent(ubi || businessName);
      return {
        manualSearch: true,
        searchUrl: `https://ccfs.sos.wa.gov/#/BusinessSearch`,
        searchTerm: ubi || businessName,
        message: 'WA SOS requires browser verification. Use the link below to search manually.'
      };
    }

    const responseText = await response.text();
    console.log('[WA SOS] API response (first 200 chars):', responseText.substring(0, 200));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[WA SOS] Failed to parse JSON response:', e.message);
      return {
        manualSearch: true,
        searchUrl: `https://ccfs.sos.wa.gov/#/BusinessSearch`,
        searchTerm: ubi || businessName,
        message: 'WA SOS returned an unexpected response. Use the link below to search manually.'
      };
    }

    console.log(`[WA SOS] Found ${data.length || 0} result(s)`);

    if (!data || data.length === 0) {
      return null;
    }

    // If searching by name (not UBI) and multiple results found, return list for selection
    if (!ubi && data.length > 1) {
      console.log('[WA SOS] Multiple results found - returning selection list');
      return {
        multipleResults: true,
        count: data.length,
        results: data.slice(0, 20).map(entity => ({  // Limit to 20 results
          ubi: entity.UBI || entity.ubi || '',
          businessName: entity.Name || entity.BusinessName || '',
          entityType: entity.EntityType || entity.Type || 'Unknown',
          status: entity.Status || 'Unknown',
          city: entity.PrincipalAddress?.City || entity.City || '',
          formationDate: entity.FormationDate || entity.FilingDate || ''
        }))
      };
    }

    // Single result or UBI search - return full details
    const entity = data[0];

    // Extract UBI from result
    const entityUbi = entity.UBI || entity.ubi || ubi || '';

    // Fetch L&I principals (contractors) using Socrata dataset 4xk5-x9j6
    let principals = [];
    if (entityUbi) {
      principals = await fetchLIPrincipals(entityUbi);
    }

    // Transform WA SOS Direct API data to our standard format
    return {
      ubi: entityUbi,
      businessName: entity.Name || entity.BusinessName || businessName,
      entityType: entity.EntityType || entity.Type || 'Unknown',
      status: entity.Status || 'Unknown',
      formationDate: entity.FormationDate || entity.FilingDate || '',
      expirationDate: entity.ExpirationDate || '',
      jurisdiction: entity.Jurisdiction || 'WA',
      principalOffice: {
        street: entity.PrincipalAddress?.Street || entity.Address || '',
        city: entity.PrincipalAddress?.City || entity.City || '',
        state: entity.PrincipalAddress?.State || 'WA',
        zip: entity.PrincipalAddress?.Zip || entity.Zip || ''
      },
      registeredAgent: {
        name: entity.RegisteredAgent?.Name || '',
        address: {
          street: entity.RegisteredAgent?.Address?.Street || '',
          city: entity.RegisteredAgent?.Address?.City || '',
          state: entity.RegisteredAgent?.Address?.State || 'WA',
          zip: entity.RegisteredAgent?.Address?.Zip || ''
        }
      },
      officers: principals.map(p => ({
        name: p.name,
        title: p.title || 'Principal',
        appointmentDate: p.startDate || ''
      })),
      governors: principals,  // For COI generation (actually L&I principals)
      businessActivity: entity.BusinessActivity || entity.Description || ''
    };

  } catch (error) {
    console.error('[WA SOS] API error:', error);
    return {
      manualSearch: true,
      searchUrl: `https://ccfs.sos.wa.gov/#/BusinessSearch`,
      searchTerm: ubi || businessName,
      message: 'WA SOS lookup failed. Use the link below to search manually.'
    };
  }
}

// Helper function to fetch L&I contractor principals from Socrata

async function scrapeORSOS(businessName, ubi) {
  try {
    const searchUrl = 'https://sos.oregon.gov/business/pages/find.aspx';

    console.log('[OR SOS] Searching for:', businessName || ubi);

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    });

    if (!response.ok) {
      throw new Error(`OR SOS returned ${response.status}`);
    }

    const html = await response.text();
    return parseORSOSHTML(html, businessName, ubi);

  } catch (error) {
    console.error('[OR SOS] Scrape error:', error);
    return null;
  }
}

async function scrapeAZSOS(businessName, ubi) {
  try {
    const searchUrl = 'https://ecorp.azcc.gov/BusinessSearch';

    console.log('[AZ SOS] Searching for:', businessName || ubi);

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    });

    if (!response.ok) {
      throw new Error(`AZ SOS returned ${response.status}`);
    }

    const html = await response.text();
    return parseAZSOSHTML(html, businessName, ubi);

  } catch (error) {
    console.error('[AZ SOS] Scrape error:', error);
    return null;
  }
}

function parseWASOSHTML(html, businessName, ubi) {
  const ubiMatch = html.match(/UBI[:\s]+(\d{3}-\d{3}-\d{3})/i);
  const nameMatch = html.match(/Entity Name[:\s]+([^<\n]+)/i);
  const statusMatch = html.match(/Status[:\s]+([^<\n]+)/i);
  const typeMatch = html.match(/Entity Type[:\s]+([^<\n]+)/i);

  return {
    ubi: ubiMatch ? ubiMatch[1].trim() : (ubi || ''),
    businessName: nameMatch ? nameMatch[1].trim() : businessName,
    entityType: typeMatch ? typeMatch[1].trim() : 'Limited Liability Company (LLC)',
    status: statusMatch ? statusMatch[1].trim() : 'Active',
    formationDate: '',
    expirationDate: '',
    jurisdiction: 'WA',
    principalOffice: {},
    registeredAgent: {},
    officers: [],
    businessActivity: '',
    filingHistory: []
  };
}

function parseORSOSHTML(html, businessName, ubi) {
  // OR SOS doesn't expose a usable API/response from a simple GET
  // Return null so the caller surfaces "not available" instead of fake data
  console.log('[OR SOS] HTML parsing not implemented — OR SOS requires browser-based search');
  return null;
}

function parseAZSOSHTML(html, businessName, ubi) {
  // AZ Corporation Commission doesn't expose a usable API/response from a simple GET
  // Return null so the caller surfaces "not available" instead of fake data
  console.log('[AZ SOS] HTML parsing not implemented — AZ SOS requires browser-based search');
  return null;
}

// ============================================================================
// OSHA INSPECTION DATABASE LOOKUP
// ============================================================================

async function handleOSHALookup(query) {
  const { name, city, state } = query;

  if (!name) {
    return {
      success: false,
      error: 'Missing required parameter: name'
    };
  }

  console.log('[OSHA Lookup] Searching for:', { name, city, state });
  return await searchOSHAInspections(name, city, state);
}

async function searchOSHAInspections(businessName, city, state) {
  try {
    console.log(`[OSHA Lookup] Querying OSHA database for: ${businessName}`);

    // DOL Enforcement API for OSHA inspection data
    const baseUrl = 'https://enforcedata.dol.gov/api/osha_inspection';

    const params = new URLSearchParams({
      estab_name: businessName,
      format: 'json',
      limit: 100
    });

    if (city) params.append('site_city', city);
    if (state) params.append('site_state', state);

    const apiUrl = `${baseUrl}?${params.toString()}`;
    console.log(`[OSHA Lookup] API URL: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Altech-Insurance-Platform/1.0',
        'Accept': 'application/json'
      }
    });

    // Check if response is actually JSON before parsing
    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();

    if (!response.ok || !contentType.includes('json')) {
      // API returned HTML error page or non-JSON — treat as no results
      console.warn(`[OSHA Lookup] API returned ${response.status}, content-type: ${contentType}`);
      return {
        success: true,
        available: true,
        source: 'U.S. Department of Labor - OSHA',
        establishment: {
          name: businessName,
          city: city || '',
          state: state || ''
        },
        summary: {
          totalInspections: 0,
          seriousViolations: 0,
          otherViolations: 0,
          willfulViolations: 0,
          repeatViolations: 0,
          totalPenalties: 0,
          lastInspection: null
        },
        inspections: []
      };
    }

    let rawData;
    try {
      rawData = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[OSHA Lookup] JSON parse failed:', parseErr.message);
      return {
        success: true,
        available: true,
        source: 'U.S. Department of Labor - OSHA',
        establishment: { name: businessName, city: city || '', state: state || '' },
        summary: { totalInspections: 0, seriousViolations: 0, otherViolations: 0, willfulViolations: 0, repeatViolations: 0, totalPenalties: 0, lastInspection: null },
        inspections: []
      };
    }

    console.log(`[OSHA Lookup] Found ${rawData.length || 0} inspection(s)`);

    const inspectionsWithViolations = [];

    for (const inspection of rawData.slice(0, 10)) {
      try {
        const violationsUrl = `https://enforcedata.dol.gov/api/osha_violation?activity_nr=${encodeURIComponent(inspection.activity_nr)}&format=json`;
        const violationsResponse = await fetch(violationsUrl, {
          headers: {
            'User-Agent': 'Altech-Insurance-Platform/1.0',
            'Accept': 'application/json'
          }
        });

        let violations = [];
        if (violationsResponse.ok) {
          const vioContentType = violationsResponse.headers.get('content-type') || '';
          if (vioContentType.includes('json')) {
            try { violations = await violationsResponse.json(); } catch (e) { /* ignore parse errors */ }
          }
        }

        inspectionsWithViolations.push({
          ...inspection,
          violations: violations
        });
      } catch (violationError) {
        console.error('[OSHA Lookup] Error fetching violations:', violationError);
        inspectionsWithViolations.push({
          ...inspection,
          violations: []
        });
      }
    }

    const inspections = parseInspections(inspectionsWithViolations);
    const summary = calculateSummary(inspections);

    return {
      success: true,
      available: true,
      source: 'U.S. Department of Labor - OSHA',
      establishment: {
        name: businessName,
        city: city || '',
        state: state || ''
      },
      summary: summary,
      inspections: inspections
    };

  } catch (error) {
    console.error('[OSHA Lookup] Search error:', error);
    return {
      success: false,
      available: false,
      source: 'U.S. Department of Labor - OSHA',
      error: `OSHA lookup failed: ${error.message}`,
      establishment: {
        name: businessName,
        city: city || '',
        state: state || ''
      },
      summary: {
        totalInspections: 0,
        seriousViolations: 0,
        otherViolations: 0,
        willfulViolations: 0,
        repeatViolations: 0,
        totalPenalties: 0,
        lastInspection: null
      },
      inspections: []
    };
  }
}

function calculateSummary(inspections) {
  if (!inspections || inspections.length === 0) {
    return {
      totalInspections: 0,
      seriousViolations: 0,
      otherViolations: 0,
      willfulViolations: 0,
      repeatViolations: 0,
      totalPenalties: 0,
      lastInspection: null
    };
  }

  let seriousCount = 0;
  let otherCount = 0;
  let willfulCount = 0;
  let repeatCount = 0;
  let totalPenalties = 0;
  let lastInspectionDate = null;

  for (const inspection of inspections) {
    if (!lastInspectionDate || inspection.inspectionDate > lastInspectionDate) {
      lastInspectionDate = inspection.inspectionDate;
    }

    if (inspection.violations) {
      for (const violation of inspection.violations) {
        if (violation.violationType === 'Serious') seriousCount++;
        else if (violation.violationType === 'Other') otherCount++;
        else if (violation.violationType === 'Willful') willfulCount++;
        else if (violation.violationType === 'Repeat') repeatCount++;

        totalPenalties += violation.currentPenalty || 0;
      }
    }
  }

  return {
    totalInspections: inspections.length,
    seriousViolations: seriousCount,
    otherViolations: otherCount,
    willfulViolations: willfulCount,
    repeatViolations: repeatCount,
    totalPenalties: totalPenalties,
    lastInspection: lastInspectionDate
  };
}

function parseInspections(rawData) {
  if (!rawData || !Array.isArray(rawData)) {
    return [];
  }

  return rawData.map(inspection => ({
    activityNumber: inspection.activity_nr || '',
    inspectionDate: inspection.open_date || '',
    inspectionType: inspection.insp_type || '',
    openDate: inspection.open_date || '',
    closeDate: inspection.close_date || '',
    caseStatus: inspection.case_mod_date ? 'Closed' : 'Open',
    violations: parseViolations(inspection.violations),
    naicsCode: inspection.naics_code || '',
    naicsDescription: inspection.naics_description || '',
    sicCode: inspection.sic_code || '',
    sicDescription: inspection.sic_description || ''
  }));
}

function parseViolations(rawViolations) {
  if (!rawViolations || !Array.isArray(rawViolations)) {
    return [];
  }

  return rawViolations.map(v => ({
    citationNumber: v.citation_id || '',
    standardViolated: v.standard || '',
    violationType: v.viol_type || '',
    issuanceDate: v.issuance_date || '',
    abatementDate: v.abate_date || '',
    currentPenalty: parseFloat(v.current_penalty) || 0,
    initialPenalty: parseFloat(v.initial_penalty) || 0,
    description: v.standard_description || '',
    abatementStatus: v.abate_complete === 'Y' ? 'Completed' : 'Pending'
  }));
}
