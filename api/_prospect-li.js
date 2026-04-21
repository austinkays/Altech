/**
 * WA L&I Contractor Registry (Socrata dataset m8qx-ubtq) + Principal Names (4xk5-x9j6).
 * Exports: handleLILookup (endpoint), fetchLIPrincipals (helper used by SOS lookups too).
 */

export async function handleLILookup(query) {
  const { name, ubi } = query;
  if (!name && !ubi) {
    return { success: false, error: 'Missing required parameters: name or ubi' };
  }
  console.log('[L&I Lookup] Searching for:', { name, ubi });
  return await searchLIContractor(name, ubi);
}

// Helper: fetch principal/owner names from the L&I Principal Names dataset
export async function fetchLIPrincipals(ubiNumber) {
  try {
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

    return principals
      .filter(p => p.principalname && p.principalname.trim())
      .map(p => ({
        name: p.principalname,
        title: p.principaltitle || 'Principal',
        startDate: p.startdate || ''
      }))
      .filter((principal, index, self) =>
        self.findIndex(pr => pr.name === principal.name) === index
      );
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

    const baseUrl = 'https://data.wa.gov/resource/m8qx-ubtq.json';
    const params = new URLSearchParams();
    if (ubi) {
      const cleanUbi = ubi.replace(/-/g, '');
      params.append('$where', `ubi='${cleanUbi}' OR ubi='${ubi}'`);
    } else {
      // Sanitize for SoQL: escape single quotes, strip chars that break queries
      const safeName = businessName.replace(/'/g, "''").replace(/[\\%_]/g, '');
      params.append('$where', `upper(businessname) LIKE upper('%${safeName}%')`);
    }
    params.append('$limit', '10');
    params.append('$order', 'licenseexpirationdate DESC');

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

    // Multi-match selection list (name search, >1 result)
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

    // Single result or UBI search: return full details
    const contractor = data[0];

    // Enrich with principal names from secondary dataset
    let ownerNames = [];
    if (contractor.ubi) {
      ownerNames = await fetchLIPrincipals(contractor.ubi);
    }
    if (contractor.primaryprincipalname && !ownerNames.includes(contractor.primaryprincipalname)) {
      ownerNames.unshift(contractor.primaryprincipalname);
    }

    const contractorData = {
      licenseNumber: contractor.contractorlicensenumber || 'Not found',
      businessName: contractor.businessname || businessName,
      ubi: contractor.ubi || ubi || '',
      status: contractor.contractorlicensestatus || 'Unknown',
      licenseType: contractor.contractorlicensetypecodedesc || 'General Contractor',
      classifications: contractor.specialtycode1desc ? [contractor.specialtycode1desc] : ['General Contractor'],
      expirationDate: contractor.licenseexpirationdate ? contractor.licenseexpirationdate.split('T')[0] : '',
      bondAmount: '',
      registrationDate: contractor.licenseeffectivedate ? contractor.licenseeffectivedate.split('T')[0] : '',
      address: {
        street: contractor.address1 || '',
        city: contractor.city || '',
        state: contractor.state || 'WA',
        zip: contractor.zip || ''
      },
      violations: [],
      bondStatus: contractor.contractorlicensestatus && contractor.contractorlicensestatus.toLowerCase().includes('active') ? 'Current' : 'Unknown',
      insuranceStatus: 'Current',
      owners: ownerNames
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
