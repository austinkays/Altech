/**
 * Oregon Construction Contractors Board (CCB) Active Licenses
 * Socrata dataset g77e-6bhs.
 */

export async function handleORCCBLookup(query) {
  const { name, license } = query;
  if (!name && !license) {
    return { success: false, error: 'Missing required parameters: name or license' };
  }
  console.log('[OR CCB Lookup] Searching for:', { name, license });
  return await searchORCCBContractor(name, license);
}

async function searchORCCBContractor(businessName, licenseNumber) {
  try {
    console.log(`[OR CCB Lookup] Querying Socrata API...`);
    const baseUrl = 'https://data.oregon.gov/resource/g77e-6bhs.json';

    const params = new URLSearchParams();
    if (licenseNumber) {
      params.append('$where', `license_number='${licenseNumber}'`);
    } else {
      params.append('$where', `upper(full_name) LIKE upper('%${businessName}%')`);
    }
    params.append('$limit', '10');
    params.append('$order', 'lic_exp_date DESC');

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

    // Multi-match selection list (name search, >1 result)
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

    const contractor = data[0];
    const contractorData = {
      licenseNumber: contractor.license_number || 'Not found',
      businessName: contractor.full_name || businessName,
      ccbNumber: contractor.license_number || '',
      status: contractor.lic_exp_date ? 'Active' : 'Unknown',
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
      violations: [],
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
