/**
 * SAM.gov Entity Management API v3 lookup.
 * Returns active federal registrations for a business name (with optional state filter).
 */

export async function handleSAMLookup(query) {
  const { name, state } = query;
  if (!name) return { success: false, error: 'Missing required parameter: name' };

  console.log('[SAM Lookup] Searching for:', { name, state });

  try {
    const samApiKey = (process.env.SAM_GOV_API_KEY || '').trim();

    const params = new URLSearchParams({
      api_key: samApiKey || 'DEMO_KEY',
      legalBusinessName: name,
      registrationStatus: 'A', // Active registrations
    });
    if (state) params.append('physicalAddress.stateOrProvinceCode', state);

    const apiUrl = `https://api.sam.gov/entity-information/v3/entities?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Altech-Insurance-Platform/1.0'
      }
    });

    if (!response.ok) {
      console.warn(`[SAM Lookup] API returned ${response.status}`);
      return {
        success: true,
        available: false,
        source: 'SAM.gov (System for Award Management)',
        entities: [],
        note: 'SAM.gov lookup unavailable — business may not have federal registrations'
      };
    }

    const data = await response.json();
    const entities = (data.entityData || []).slice(0, 5);

    return {
      success: true,
      available: true,
      source: 'SAM.gov (System for Award Management)',
      totalRecords: data.totalRecords || 0,
      entities: entities.map(e => {
        const reg = e.entityRegistration || {};
        const core = e.coreData || {};
        const addr = core.physicalAddress || {};
        const naics = (core.naicsCode || []).map(n => ({ code: n.naicsCode, isPrimary: n.naicsPrimary }));
        return {
          ueiSAM: reg.ueiSAM || '',
          cageCode: reg.cageCode || '',
          legalBusinessName: reg.legalBusinessName || '',
          dbaName: reg.dbaName || '',
          registrationStatus: reg.registrationStatus || '',
          activationDate: reg.activationDate || '',
          expirationDate: reg.registrationExpirationDate || '',
          entityType: core.entityInformation?.entityTypeDesc || '',
          entityStructure: core.entityInformation?.entityStructureDesc || '',
          profitStructure: core.entityInformation?.profitStructureDesc || '',
          organizationStructure: core.entityInformation?.organizationStructureDesc || '',
          stateOfIncorporation: core.entityInformation?.stateOfIncorporation || '',
          address: {
            street: addr.addressLine1 || '',
            city: addr.city || '',
            state: addr.stateOrProvinceCode || '',
            zip: addr.zipCode || '',
            country: addr.countryCode || 'US'
          },
          naicsCodes: naics,
          congressionalDistrict: core.congressionalDistrict || '',
        };
      })
    };
  } catch (error) {
    console.error('[SAM Lookup] Error:', error);
    return {
      success: true,
      available: false,
      source: 'SAM.gov (System for Award Management)',
      entities: [],
      note: 'SAM.gov lookup failed — business may not have federal registrations'
    };
  }
}
