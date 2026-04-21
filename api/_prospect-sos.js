/**
 * Secretary of State business entity lookups (WA, OR, AZ).
 *
 * - WA: CCFS Direct API + WA DOR fallback when Turnstile blocks us.
 * - OR: Oregon Socrata Business Registry (data.oregon.gov dataset tckn-sxa6).
 * - AZ: CAPTCHA-protected. Returns manual-search deep link.
 */

import { fetchLIPrincipals } from './_prospect-li.js';

const STATE_SOS_ENDPOINTS = {
  'WA': {
    name: 'Washington Secretary of State',
    searchUrl: 'https://ccfs.sos.wa.gov/api/BusinessSearch',
    detailsUrl: 'https://ccfs.sos.wa.gov/api/BusinessDetails',
    manualUrl: 'https://ccfs.sos.wa.gov/#/BusinessSearch'
  },
  'OR': {
    name: 'Oregon Secretary of State',
    searchUrl: 'https://data.oregon.gov/resource/tckn-sxa6.json',
    detailsUrl: 'https://sos.oregon.gov/business/Pages/find.aspx',
    manualUrl: 'https://sos.oregon.gov/business/Pages/find.aspx'
  },
  'AZ': {
    name: 'Arizona Corporation Commission',
    searchUrl: 'https://ecorp.azcc.gov/BusinessSearch',
    detailsUrl: 'https://ecorp.azcc.gov/BusinessSearch',
    manualUrl: 'https://ecorp.azcc.gov/BusinessSearch/BusinessSearchResults'
  }
};

export async function handleSOSLookup(query) {
  const { name, ubi, state } = query;
  if (!name && !ubi) {
    return { success: false, error: 'Missing required parameters: name or ubi' };
  }
  if (!state) {
    return { success: false, error: 'Missing required parameter: state' };
  }
  if (!['WA', 'OR', 'AZ'].includes(state)) {
    return { success: false, error: 'Invalid state. Supported states: WA, OR, AZ' };
  }

  console.log('[SOS Lookup] Searching:', { name, ubi, state });
  return await searchSOSEntity(name, ubi, state);
}

async function searchSOSEntity(businessName, ubi, state) {
  try {
    const endpoint = STATE_SOS_ENDPOINTS[state];
    if (!endpoint) {
      return { success: false, available: false, error: `No SOS endpoint configured for state: ${state}` };
    }

    const searchParam = ubi || businessName;
    const searchType = ubi ? 'ubi' : 'name';
    console.log(`[SOS Lookup] Querying ${endpoint.name} by ${searchType}: ${searchParam}`);

    let entityData;
    switch (state) {
      case 'WA': entityData = await scrapeWASOS(businessName, ubi); break;
      case 'OR': entityData = await scrapeORSOS(businessName, ubi); break;
      case 'AZ': entityData = await scrapeAZSOS(businessName, ubi); break;
      default: throw new Error(`Unsupported state: ${state}`);
    }

    if (!entityData) {
      return {
        success: false,
        available: true,
        source: endpoint.name,
        state,
        error: 'No business entity found'
      };
    }

    // Scraper returned a manual-search fallback (Turnstile-blocked, etc.)
    if (entityData.manualSearch) {
      const result = {
        success: false,
        available: true,
        source: endpoint.name,
        state,
        manualSearch: true,
        searchUrl: entityData.searchUrl,
        searchTerm: entityData.searchTerm,
        error: entityData.message
      };
      if (entityData.deepLinked) result.deepLinked = true;
      if (entityData.tip) result.tip = entityData.tip;
      return result;
    }

    return {
      success: true,
      available: true,
      source: endpoint.name,
      state,
      entity: entityData
    };
  } catch (error) {
    console.error('[SOS Lookup] Search error:', error);
    return {
      success: false,
      available: false,
      source: STATE_SOS_ENDPOINTS[state]?.name || `${state} Secretary of State`,
      state,
      error: `SOS lookup failed: ${error.message}`
    };
  }
}

// ── WA: CCFS Direct API ──────────────────────────────────────────────────────
// As of Jan 2026, WA SOS moved their API to ccfs-api.prod.sos.wa.gov and now
// requires Cloudflare Turnstile for searches. We try the API; if blocked,
// fall back to WA DOR; if that also misses, return a manual-search link.
async function scrapeWASOS(businessName, ubi) {
  try {
    console.log(`[WA SOS] Querying WA SOS API by ${ubi ? 'UBI' : 'name'}: ${ubi || businessName}`);
    const apiUrl = 'https://ccfs-api.prod.sos.wa.gov/api/BusinessSearch/GetBusinessSearchList';

    const searchPayload = ubi
      ? {
          Type: 'UBI', SearchType: 'UBI',
          SearchEntityName: ubi.replace(/[\s-]/g, ''),
          SearchValue: ubi.replace(/[\s-]/g, ''),
          SearchCriteria: 'Contains', IsSearch: true, PageID: 1, PageCount: 25
        }
      : {
          Type: 'BusinessName', SearchType: 'BusinessName',
          SearchEntityName: businessName, SortType: 'ASC', SortBy: 'Entity Name',
          SearchValue: businessName, SearchCriteria: 'Contains',
          IsSearch: true, PageID: 1, PageCount: 25
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

    if (!response.ok) {
      console.warn(`[WA SOS] API returned ${response.status} — likely Turnstile-blocked, trying WA DOR`);
      const dorResult = await tryWADORLookup(businessName, ubi);
      if (dorResult) return dorResult;
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
      const dorResult = await tryWADORLookup(businessName, ubi);
      if (dorResult) return dorResult;
      return {
        manualSearch: true,
        searchUrl: `https://ccfs.sos.wa.gov/#/BusinessSearch`,
        searchTerm: ubi || businessName,
        message: 'WA SOS returned an unexpected response. Use the link below to search manually.'
      };
    }

    console.log(`[WA SOS] Found ${data.length || 0} result(s)`);

    if (!data || data.length === 0) return null;

    if (!ubi && data.length > 1) {
      console.log('[WA SOS] Multiple results found - returning selection list');
      return {
        multipleResults: true,
        count: data.length,
        results: data.slice(0, 20).map(entity => ({
          ubi: entity.UBI || entity.ubi || '',
          businessName: entity.Name || entity.BusinessName || '',
          entityType: entity.EntityType || entity.Type || 'Unknown',
          status: entity.Status || 'Unknown',
          city: entity.PrincipalAddress?.City || entity.City || '',
          formationDate: entity.FormationDate || entity.FilingDate || ''
        }))
      };
    }

    const entity = data[0];
    const entityUbi = entity.UBI || entity.ubi || ubi || '';

    // Enrich with L&I principals (contractors)
    let principals = [];
    if (entityUbi) {
      principals = await fetchLIPrincipals(entityUbi);
    }

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
    const dorResult = await tryWADORLookup(businessName, ubi);
    if (dorResult) return dorResult;
    return {
      manualSearch: true,
      searchUrl: `https://ccfs.sos.wa.gov/#/BusinessSearch`,
      searchTerm: ubi || businessName,
      message: 'WA SOS lookup failed. Use the link below to search manually.'
    };
  }
}

/**
 * WA Department of Revenue — partial data fallback when CCFS is blocked.
 */
async function tryWADORLookup(businessName, ubi) {
  try {
    if (!businessName && !ubi) return null;
    const searchTerm = ubi || businessName;
    console.log('[WA DOR] Attempting DOR lookup for:', searchTerm);

    const dorUrl = `https://secure.dor.wa.gov/gteunauth/_/GetBusinesses?searchBy=${ubi ? 'UBI' : 'BN'}&searchValue=${encodeURIComponent(searchTerm)}&pageNumber=1&sortOrder=ASC&sortColumn=0`;

    const response = await fetch(dorUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`[WA DOR] API returned ${response.status}`);
      return null;
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn('[WA DOR] Non-JSON response');
      return null;
    }

    // DOR may return { Businesses: [...] } or an array directly
    const businesses = Array.isArray(data) ? data : (data.Businesses || data.businesses || []);
    if (!businesses.length) {
      console.log('[WA DOR] No results');
      return null;
    }

    console.log(`[WA DOR] Found ${businesses.length} result(s)`);

    if (!ubi && businesses.length > 1) {
      return {
        multipleResults: true,
        count: businesses.length,
        results: businesses.slice(0, 20).map(b => ({
          ubi: b.UBI || b.ubi || '',
          businessName: b.BusinessName || b.TradeName || b.businessName || '',
          entityType: b.EntityType || b.BusinessType || 'Unknown',
          status: b.Status || b.AccountStatus || 'Unknown',
          city: b.City || b.LocationCity || '',
          formationDate: b.OpenDate || b.FirstRegistration || ''
        })),
        dataSource: 'WA Department of Revenue'
      };
    }

    const b = businesses[0];
    const entityUbi = b.UBI || b.ubi || ubi || '';
    let principals = [];
    if (entityUbi) {
      principals = await fetchLIPrincipals(entityUbi);
    }

    return {
      ubi: entityUbi,
      businessName: b.BusinessName || b.TradeName || b.businessName || businessName,
      entityType: b.EntityType || b.BusinessType || 'Unknown',
      status: b.Status || b.AccountStatus || 'Unknown',
      formationDate: b.OpenDate || b.FirstRegistration || '',
      expirationDate: '',
      jurisdiction: 'WA',
      principalOffice: {
        street: b.Address || b.LocationAddress || '',
        city: b.City || b.LocationCity || '',
        state: 'WA',
        zip: b.Zip || b.LocationZip || ''
      },
      registeredAgent: {},
      officers: principals.map(p => ({
        name: p.name,
        title: p.title || 'Principal',
        appointmentDate: p.startDate || ''
      })),
      governors: principals,
      businessActivity: b.NAICS || b.NAICSDescription || '',
      dataSource: 'WA Department of Revenue',
      partialData: true
    };
  } catch (error) {
    console.error('[WA DOR] Lookup error:', error);
    return null;
  }
}

// ── OR: Oregon Socrata Business Registry (tckn-sxa6) ─────────────────────────
async function scrapeORSOS(businessName, ubi) {
  try {
    console.log('[OR SOS] Querying Oregon Socrata API for:', businessName || ubi);

    const baseUrl = 'https://data.oregon.gov/resource/tckn-sxa6.json';
    const safeName = (businessName || '').replace(/'/g, "''");
    const params = new URLSearchParams();
    if (ubi) {
      params.append('$where', `registry_number='${ubi}'`);
    } else {
      params.append('$where', `upper(business_name) like upper('%${safeName}%')`);
    }
    params.append('$limit', '50');

    const apiUrl = `${baseUrl}?${params.toString()}`;
    console.log('[OR SOS] API URL:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Altech-Insurance-Platform/1.0',
        'X-App-Token': process.env.SOCRATA_APP_TOKEN || ''
      }
    });

    if (!response.ok) {
      console.warn(`[OR SOS] API returned ${response.status}`);
      return {
        manualSearch: true,
        searchUrl: 'https://sos.oregon.gov/business/Pages/find.aspx',
        searchTerm: businessName || ubi,
        message: 'Oregon SOS API temporarily unavailable.'
      };
    }

    const records = await response.json();
    console.log(`[OR SOS] Found ${records.length} record(s)`);

    if (!records || records.length === 0) return null;

    // Group records by registry_number to consolidate entity + agent + principals
    const grouped = {};
    for (const rec of records) {
      const regNum = rec.registry_number || 'unknown';
      if (!grouped[regNum]) grouped[regNum] = { entity: rec, agents: [], principals: [] };
      const assocType = (rec.associated_name_type || '').toUpperCase();
      if (assocType.includes('REGISTERED AGENT')) {
        grouped[regNum].agents.push(rec);
      } else if (assocType.includes('AUTHORIZED REPRESENTATIVE') || assocType.includes('PRINCIPAL')) {
        grouped[regNum].principals.push(rec);
      } else if (!grouped[regNum].entitySet) {
        grouped[regNum].entity = rec;
        grouped[regNum].entitySet = true;
      }
    }

    const regNums = Object.keys(grouped);

    // Multi-match by name: return selection list
    if (!ubi && regNums.length > 1) {
      console.log('[OR SOS] Multiple entities found — returning selection list');
      const uniqueEntities = regNums.map(rn => {
        const g = grouped[rn];
        return {
          ubi: rn,
          businessName: g.entity.business_name || businessName,
          entityType: g.entity.entity_type || 'Unknown',
          status: g.entity.entity_status || 'Unknown',
          city: g.entity.city || '',
          formationDate: g.entity.registry_date || ''
        };
      });
      return {
        multipleResults: true,
        count: uniqueEntities.length,
        results: uniqueEntities.slice(0, 20)
      };
    }

    const regNum = regNums[0];
    const g = grouped[regNum];
    const e = g.entity;
    const agent = g.agents[0];
    const principals = g.principals;

    return {
      ubi: regNum,
      businessName: e.business_name || businessName,
      entityType: e.entity_type || 'Unknown',
      status: e.entity_status || 'Unknown',
      formationDate: e.registry_date || '',
      expirationDate: '',
      jurisdiction: e.jurisdiction || 'OR',
      principalOffice: {
        street: e.address || '',
        city: e.city || '',
        state: e.state || 'OR',
        zip: e.zip_code || e.zip || ''
      },
      registeredAgent: agent ? {
        name: [agent.first_name, agent.last_name].filter(Boolean).join(' ') || agent.entity_of_record_name || '',
        address: {
          street: agent.address || '',
          city: agent.city || '',
          state: agent.state || 'OR',
          zip: agent.zip_code || agent.zip || ''
        }
      } : {},
      officers: principals.map(p => ({
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.entity_of_record_name || '',
        title: p.associated_name_type || 'Principal',
        appointmentDate: ''
      })),
      governors: principals.map(p => ({
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.entity_of_record_name || '',
        title: p.associated_name_type || 'Principal',
        startDate: ''
      })),
      businessActivity: '',
      detailsUrl: e.business_details || `https://sos.oregon.gov/business/Pages/find.aspx`,
      dataSource: 'Oregon Socrata API (data.oregon.gov)'
    };
  } catch (error) {
    console.error('[OR SOS] API error:', error);
    return {
      manualSearch: true,
      searchUrl: 'https://sos.oregon.gov/business/Pages/find.aspx',
      searchTerm: businessName || ubi,
      message: 'Oregon SOS lookup failed. Use the link below to search manually.'
    };
  }
}

// ── Legacy HTML parsers ──────────────────────────────────────────────────────
// Kept for backwards compatibility with callers that pass raw HTML from a
// headless browser. Current scrapers all hit structured APIs instead; OR/AZ
// stubs intentionally return null (no usable GET response shape).

export function parseWASOSHTML(html, businessName, ubi) {
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

export function parseORSOSHTML(html, businessName, ubi) {
  // OR SOS doesn't expose a usable API/response from a simple GET.
  // Return null so the caller surfaces "not available" instead of fake data.
  console.log('[OR SOS] HTML parsing not implemented — OR SOS requires browser-based search');
  return null;
}

export function parseAZSOSHTML(html, businessName, ubi) {
  // AZ Corporation Commission doesn't expose a usable API/response from a simple GET.
  // Return null so the caller surfaces "not available" instead of fake data.
  console.log('[AZ SOS] HTML parsing not implemented — AZ SOS requires browser-based search');
  return null;
}

// ── AZ: CAPTCHA-protected, no public API ─────────────────────────────────────
async function scrapeAZSOS(businessName, ubi) {
  const searchTerm = (ubi || businessName || '').trim();
  const encodedTerm = encodeURIComponent(searchTerm);
  console.log('[AZ SOS] No public API — returning manual search deep link for:', searchTerm);

  return {
    manualSearch: true,
    searchUrl: `https://ecorp.azcc.gov/BusinessSearch/BusinessSearchResults?searchTerm=${encodedTerm}`,
    searchTerm,
    state: 'AZ',
    message: 'Arizona Corporation Commission requires browser access. The link below will open search results directly.',
    tip: 'Look for: Entity Status (Active/Inactive), Entity Type (LLC/Corp), Date of Formation, Statutory Agent name, and Principal Address.',
    deepLinked: true
  };
}
