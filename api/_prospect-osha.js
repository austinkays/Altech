/**
 * OSHA Inspection database lookup via DOL Enforcement API.
 * Fetches inspections + violations, computes summary counts and penalties.
 */

export async function handleOSHALookup(query) {
  const { name, city, state } = query;
  if (!name) {
    return { success: false, error: 'Missing required parameter: name' };
  }
  console.log('[OSHA Lookup] Searching for:', { name, city, state });
  return await searchOSHAInspections(name, city, state);
}

async function searchOSHAInspections(businessName, city, state) {
  try {
    console.log(`[OSHA Lookup] Querying OSHA database for: ${businessName}`);
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

    // API sometimes returns HTML error pages instead of JSON — guard for that
    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();

    if (!response.ok || !contentType.includes('json')) {
      console.warn(`[OSHA Lookup] API returned ${response.status}, content-type: ${contentType}`);
      return emptyOSHAResult(businessName, city, state);
    }

    let rawData;
    try {
      rawData = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[OSHA Lookup] JSON parse failed:', parseErr.message);
      return emptyOSHAResult(businessName, city, state);
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

        inspectionsWithViolations.push({ ...inspection, violations });
      } catch (violationError) {
        console.error('[OSHA Lookup] Error fetching violations:', violationError);
        inspectionsWithViolations.push({ ...inspection, violations: [] });
      }
    }

    const inspections = parseInspections(inspectionsWithViolations);
    const summary = calculateSummary(inspections);

    return {
      success: true,
      available: true,
      source: 'U.S. Department of Labor - OSHA',
      establishment: { name: businessName, city: city || '', state: state || '' },
      summary,
      inspections
    };
  } catch (error) {
    console.error('[OSHA Lookup] Search error:', error);
    return {
      success: false,
      available: false,
      source: 'U.S. Department of Labor - OSHA',
      error: `OSHA lookup failed: ${error.message}`,
      establishment: { name: businessName, city: city || '', state: state || '' },
      summary: emptySummary(),
      inspections: []
    };
  }
}

function emptyOSHAResult(businessName, city, state) {
  return {
    success: true,
    available: true,
    source: 'U.S. Department of Labor - OSHA',
    establishment: { name: businessName, city: city || '', state: state || '' },
    summary: emptySummary(),
    inspections: []
  };
}

function emptySummary() {
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

function calculateSummary(inspections) {
  if (!inspections || inspections.length === 0) return emptySummary();

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
    totalPenalties,
    lastInspection: lastInspectionDate
  };
}

function parseInspections(rawData) {
  if (!rawData || !Array.isArray(rawData)) return [];

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
  if (!rawViolations || !Array.isArray(rawViolations)) return [];

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
