/**
 * CGL Compliance Dashboard API
 * Fetches General Liability policies from HawkSoft API
 * Vercel Serverless Function
 */

// Non-syncing carriers that require manual verification
const NON_SYNCING_CARRIERS = [
  'Hiscox',
  'IES',
  'HCC Surety',
  'BTIS'
];

function calculateDaysUntilExpiration(expirationDate) {
  const expDate = new Date(expirationDate);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getExpirationStatus(daysUntilExpiration) {
  if (daysUntilExpiration < 0) return 'expired';
  if (daysUntilExpiration < 30) return 'critical';
  if (daysUntilExpiration < 60) return 'expiring-soon';
  return 'active';
}

function isGeneralLiabilityPolicy(policy) {
  // Skip non-active policies (prospects, quotes, cancelled)
  const policyStatus = (policy.status || '').toLowerCase();
  if (policyStatus === 'prospect' || policyStatus === 'cancelled' || policyStatus === 'canceled') {
    return false;
  }

  // ACORD Standard Codes for CGL/Liability policies
  const glCodes = [
    'cgl',          // Commercial General Liability (ACORD standard)
    'gl',           // General Liability (shortcode)
    'bop',          // Business Owners Policy (includes GL coverage)
    'bopgl',        // BOP General Liability
    'cumbr',        // Commercial Umbrella (often tied to GL)
    'general liability',
    'commercial general liability',
    'gen liab',
    'comm gen liab',
    'liability'
  ];

  // Codes that are NOT CGL - exclude these
  const excludeCodes = [
    'auto',         // Auto policies
    'ca',           // Commercial Auto
    'personal',     // Personal lines
    'home',         // Homeowners
    'renters',      // Renters
    'condo',        // Condo
    'life',         // Life insurance
    'health',       // Health insurance
    'dental',       // Dental
    'vision',       // Vision
    'flood',        // Flood
    'earthquake',   // Earthquake
    'workers',      // Workers comp
    'wc',           // Workers comp
    'property',     // Property only
    'fire',         // Fire only
    'umbrella',     // Personal umbrella (not commercial)
    'boat',         // Boat/Marine
    'rv',           // RV
    'motorcycle',   // Motorcycle
    'dwelling',     // Dwelling fire
    'garage',       // Garage keepers (not GL)
    'garag'         // Garage keepers code
  ];

  // Check if policy should be EXCLUDED first
  const policyNumber = (policy.policyNumber || '').toUpperCase();

  // Exclude based on policy number prefixes (CA, HO, PA, etc.)
  if (policyNumber.startsWith('CA') ||
      policyNumber.startsWith('HO') ||
      policyNumber.startsWith('PA') ||
      policyNumber.startsWith('DP') ||
      policyNumber.startsWith('FL')) {
    return false;
  }

  // Check for exclusion codes in all fields
  const allFieldsToCheck = [
    policy.type,
    policy.applicationType,
    policy.title
  ];

  for (const field of allFieldsToCheck) {
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const excludeCode of excludeCodes) {
        if (fieldLower.includes(excludeCode)) {
          return false; // Exclude this policy
        }
      }
    }
  }

  // Check loBs array - FIRST check if ANY lob is a CGL match, THEN check exclusions
  // This prevents a multi-lob policy (e.g., CGL + AUTOB) from being excluded by the non-CGL lob
  let hasCglLob = false;
  if (policy.loBs && Array.isArray(policy.loBs)) {
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const glCode of glCodes) {
          if (codeLower === glCode || codeLower.includes(glCode)) {
            hasCglLob = true;
            break;
          }
        }
        if (hasCglLob) break;
      }
    }
  }

  // If a CGL lob was found, this IS a CGL policy - return true immediately
  if (hasCglLob) {
    return true;
  }

  // Only check loBs exclusions if no CGL lob was found
  if (policy.loBs && Array.isArray(policy.loBs)) {
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const excludeCode of excludeCodes) {
          if (codeLower.includes(excludeCode)) {
            return false; // Exclude this policy
          }
        }
      }
    }
  }

  // Check other fields - must be exact or specific match
  if (policy.type && typeof policy.type === 'string') {
    const typeLower = policy.type.toLowerCase();
    for (const glCode of glCodes) {
      if (typeLower === glCode || (glCode.length > 5 && typeLower.includes(glCode))) {
        return true;
      }
    }
  }

  if (policy.applicationType && typeof policy.applicationType === 'string') {
    const appTypeLower = policy.applicationType.toLowerCase();
    for (const glCode of glCodes) {
      if (appTypeLower.includes(glCode)) {
        return true;
      }
    }
  }

  if (policy.title && typeof policy.title === 'string') {
    const titleLower = policy.title.toLowerCase();
    for (const glCode of glCodes) {
      if (titleLower === glCode || titleLower.includes(glCode)) {
        return true;
      }
    }
  }

  return false;
}

function isSuretyBondPolicy(policy) {
  // Skip non-active policies
  const policyStatus = (policy.status || '').toLowerCase();
  if (policyStatus === 'prospect' || policyStatus === 'cancelled' || policyStatus === 'canceled') {
    return false;
  }

  // Surety bond codes/keywords
  const bondCodes = [
    'surety',
    'sure',
    'bond',
    'sb',
    'contractor bond',
    'license bond',
    'permit bond',
    'performance bond',
    'bid bond',
    'fidelity'
  ];

  // Check all relevant fields
  const fieldsToCheck = [
    policy.type,
    policy.applicationType,
    policy.title
  ];

  for (const field of fieldsToCheck) {
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const code of bondCodes) {
        if (fieldLower.includes(code)) {
          return true;
        }
      }
    }
  }

  // Check loBs array
  if (policy.loBs && Array.isArray(policy.loBs)) {
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const code of bondCodes) {
          if (codeLower === code || codeLower.includes(code)) {
            return true;
          }
        }
      }
    }
  }

  // Check policy number prefix
  const policyNumber = (policy.policyNumber || '').toUpperCase();
  if (policyNumber.startsWith('SB') || policyNumber.startsWith('SURE') || policyNumber.startsWith('BOND')) {
    return true;
  }

  return false;
}

function requiresManualVerification(carrier) {
  return NON_SYNCING_CARRIERS.some(
    nonSyncCarrier => carrier.toLowerCase().includes(nonSyncCarrier.toLowerCase())
  );
}

// ── Commercial Policy Detection (broad filter for all commercial lines) ──

function isCommercialPolicy(policy) {
  // Skip non-active policies (prospects, quotes, cancelled)
  const policyStatus = (policy.status || '').toLowerCase();
  if (policyStatus === 'prospect' || policyStatus === 'cancelled' || policyStatus === 'canceled') {
    return false;
  }

  // Personal lines to EXCLUDE
  const personalCodes = [
    'home', 'homeowner', 'ho', 'renters', 'condo', 'dwelling',
    'personal auto', 'personal', 'life', 'health', 'dental', 'vision',
    'flood', 'earthquake', 'boat', 'rv', 'motorcycle', 'pet',
    'travel', 'wedding', 'special event'
  ];

  // Personal policy number prefixes
  const policyNumber = (policy.policyNumber || '').toUpperCase();
  if (policyNumber.startsWith('HO') || policyNumber.startsWith('DP') ||
      policyNumber.startsWith('FL') || policyNumber.startsWith('PA')) {
    return false;
  }

  // Commercial codes/keywords we want to INCLUDE
  const commercialCodes = [
    'cgl', 'gl', 'bop', 'bopgl', 'general liability', 'commercial general liability',
    'gen liab', 'comm gen liab', 'liability',
    'autob', 'commercial auto', 'comm auto', 'ca', 'business auto', 'hired auto',
    'non-owned auto', 'truck', 'fleet',
    'workers', 'wc', 'work comp', 'workers comp', 'workers compensation',
    'cpkge', 'commercial package', 'comm pkg', 'package',
    'cumbr', 'commercial umbrella', 'comm umbrella', 'excess',
    'property', 'commercial property', 'comm prop', 'bldg', 'building',
    'prpty', 'cp',
    'inland', 'inland marine', 'im',
    'crime', 'employee dishonesty',
    'epli', 'employment practices',
    'do', 'd&o', 'directors', 'officers',
    'eo', 'e&o', 'errors', 'professional',
    'cyber', 'data breach',
    'pollution', 'environmental',
    'liquor', 'llqu',
    'garage', 'garag', 'garagekeepers',
    'artisan', 'contractor',
    'surety', 'sure', 'bond', 'sb', 'fidelity',
    'commercial'
  ];

  // Gather all text fields to search
  const fieldsToCheck = [
    policy.type,
    policy.applicationType,
    policy.title
  ];

  // Check for personal exclusions first
  for (const field of fieldsToCheck) {
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const code of personalCodes) {
        if (fieldLower.includes(code)) {
          return false;
        }
      }
    }
  }

  // Check loBs for personal exclusions
  if (policy.loBs && Array.isArray(policy.loBs)) {
    let hasCommercialLob = false;
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const code of commercialCodes) {
          if (codeLower === code || codeLower.includes(code)) {
            hasCommercialLob = true;
            break;
          }
        }
        if (hasCommercialLob) break;
      }
    }
    if (hasCommercialLob) return true;

    // If loBs exist but none matched commercial, check if personal
    for (const lob of policy.loBs) {
      if (lob.code && typeof lob.code === 'string') {
        const codeLower = lob.code.toLowerCase();
        for (const code of personalCodes) {
          if (codeLower.includes(code)) {
            return false;
          }
        }
      }
    }
  }

  // Check other fields for commercial matches
  for (const field of fieldsToCheck) {
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const code of commercialCodes) {
        if (fieldLower === code || fieldLower.includes(code)) {
          return true;
        }
      }
    }
  }

  return false;
}

function getCommercialPolicyType(policy) {
  if (isSuretyBondPolicy(policy)) return 'bond';

  // Classify by loBs codes first, then title/type — check SPECIFIC types
  // before isGeneralLiabilityPolicy() which broadly matches 'liability'
  const allText = [
    policy.type, policy.applicationType, policy.title,
    ...(policy.loBs || []).map(l => l.code || '')
  ].filter(Boolean).join(' ').toLowerCase();

  if (/autob|commercial auto|comm auto|business auto|hired auto|fleet|truck/i.test(allText)) return 'auto';
  if (/workers|wc|work comp/i.test(allText)) return 'wc';
  if (/cpkge|commercial package|comm pkg/i.test(allText)) return 'pkg';
  if (/cumbr|commercial umbrella|comm umbrella|excess/i.test(allText)) return 'umbrella';
  if (/inland|im/i.test(allText)) return 'im';
  if (/epli|employment practices/i.test(allText)) return 'epli';
  if (/d&o|directors.*officers|officers.*directors/i.test(allText)) return 'do';
  if (/e&o|errors.*omissions|professional/i.test(allText)) return 'eo';
  if (/cyber|data breach/i.test(allText)) return 'cyber';
  if (/crime|employee dishonesty/i.test(allText)) return 'crime';
  if (/liquor|llqu/i.test(allText)) return 'liquor';
  if (/garage|garag/i.test(allText)) return 'garage';
  if (/pollution|environmental/i.test(allText)) return 'pollution';
  if (/bop/i.test(allText)) return 'bop';
  if (/prpty|commercial property|comm prop|cp|bldg|building/i.test(allText)) return 'property';
  if (/property/i.test(allText)) return 'property';

  // CGL is the catch-all for general liability
  if (isGeneralLiabilityPolicy(policy)) return 'cgl';

  return 'commercial'; // generic commercial fallback
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get HawkSoft credentials from environment (trim to handle CLI newlines)
    const HAWKSOFT_CLIENT_ID = (process.env.HAWKSOFT_CLIENT_ID || '').trim();
    const HAWKSOFT_CLIENT_SECRET = (process.env.HAWKSOFT_CLIENT_SECRET || '').trim();
    const HAWKSOFT_AGENCY_ID = (process.env.HAWKSOFT_AGENCY_ID || '').trim();

    if (!HAWKSOFT_CLIENT_ID || !HAWKSOFT_CLIENT_SECRET || !HAWKSOFT_AGENCY_ID) {
      return res.status(500).json({
        success: false,
        error: 'HawkSoft API credentials not configured'
      });
    }

    // Create Basic Auth header
    const authString = `${HAWKSOFT_CLIENT_ID}:${HAWKSOFT_CLIENT_SECRET}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    const BASE_URL = 'https://integration.hawksoft.app';
    const API_VERSION = '3.0';

    console.log('[Compliance] ===== STARTING HAWKSOFT DATA FETCH =====');
    const startTime = Date.now();

    // Step 1: Calculate date range - GO BACK 3 YEARS
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const asOfDate = threeYearsAgo.toISOString();
    const today = new Date().toISOString();

    console.log('[Compliance] Date Range Configuration:');
    console.log(`[Compliance]   Today: ${today}`);
    console.log(`[Compliance]   Search Start Date (3 years ago): ${asOfDate}`);
    console.log(`[Compliance]   Date calculation verified: ${threeYearsAgo.getFullYear()} (should be 3 years before ${new Date().getFullYear()})`);

    // Step 2: Get list of changed clients
    console.log('[Compliance] Fetching client list from HawkSoft...');
    const changedClientsResponse = await fetch(
      `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients?version=${API_VERSION}&asOf=${asOfDate}&include=Policies`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!changedClientsResponse.ok) {
      console.error('[Compliance] Failed to fetch clients:', changedClientsResponse.status);
      const errorText = await changedClientsResponse.text();
      console.error('[Compliance] Error response:', errorText);
      return res.status(changedClientsResponse.status).json({
        success: false,
        error: 'Failed to fetch clients from HawkSoft',
        status: changedClientsResponse.status,
        details: errorText
      });
    }

    const clientIds = await changedClientsResponse.json();
    console.log(`[Compliance] ✓ Found ${clientIds.length} client IDs`);

    // Process ALL clients using parallel batch requests
    console.log(`[Compliance] Fetching ALL ${clientIds.length} client details with parallel batching...`);
    const batchSize = 50;
    const concurrency = 10; // 10 parallel requests at a time
    const allClients = [];

    // Create all batch arrays
    const batches = [];
    for (let i = 0; i < clientIds.length; i += batchSize) {
      batches.push(clientIds.slice(i, i + batchSize));
    }
    const totalChunks = Math.ceil(batches.length / concurrency);
    console.log(`[Compliance] Total batches: ${batches.length} (${batchSize} clients each, ${concurrency} concurrent, ${totalChunks} chunks)`);

    // Emit progress for SSE
    if (typeof global !== 'undefined') {
      global.__complianceProgress = { chunk: 0, totalChunks, phase: 'fetching', startedAt: Date.now() };
    }

    // Process batches in parallel chunks
    for (let i = 0; i < batches.length; i += concurrency) {
      const chunk = batches.slice(i, i + concurrency);
      const chunkNum = Math.floor(i / concurrency) + 1;
      console.log(`[Compliance] Processing chunk ${chunkNum}/${totalChunks} (${chunk.length} parallel requests)...`);
      if (typeof global !== 'undefined') {
        global.__complianceProgress = { chunk: chunkNum, totalChunks, phase: 'fetching', startedAt: global.__complianceProgress?.startedAt || Date.now() };
      }

      const promises = chunk.map(batch =>
        fetch(
          `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients?version=${API_VERSION}&include=Policies`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ clientNumbers: batch })
          }
        ).then(async (resp) => {
          if (resp.ok) {
            return resp.json();
          }
          console.error(`[Compliance] ✗ Batch failed: ${resp.status}`);
          return [];
        }).catch(err => {
          console.error(`[Compliance] ✗ Batch error: ${err.message}`);
          return [];
        })
      );

      const results = await Promise.all(promises);
      for (const clients of results) {
        if (Array.isArray(clients)) {
          allClients.push(...clients);
        }
      }
    }

    console.log(`[Compliance] ✓ Total clients fetched: ${allClients.length}`);
    if (typeof global !== 'undefined') {
      global.__complianceProgress = { chunk: totalChunks, totalChunks, phase: 'done', startedAt: global.__complianceProgress?.startedAt || Date.now() };
    }

    // Step 3: Extract and filter General Liability policies
    const compliancePolicies = [];

    console.log('[Compliance] Processing clients for commercial policies...');
    let totalPolicies = 0;
    let glPoliciesFound = 0;
    let bondPoliciesFound = 0;
    let commercialPoliciesFound = 0;
    let glFilterPassed = 0;     // How many pass isGeneralLiabilityPolicy()
    let bondFilterPassed = 0;   // How many pass isSuretyBondPolicy()
    let commercialFilterPassed = 0; // How many pass isCommercialPolicy()
    let glNoExpDate = 0;         // Matches without expiration date
    let glExpiredOver90 = 0;     // Matches expired more than 30 days ago
    const policyTypesFound = new Set();

    for (const client of allClients) {
      if (!client.policies || client.policies.length === 0) continue;

      totalPolicies += client.policies.length;

      // Log all unique policy type values from all possible fields
      client.policies.forEach(policy => {
        // Capture documented fields (all camelCase per actual API)
        if (policy.type) policyTypesFound.add(`type:${policy.type}`);
        if (policy.applicationType) policyTypesFound.add(`appType:${policy.applicationType}`);
        if (policy.title) policyTypesFound.add(`title:${policy.title}`);

        // Capture loBs array codes (camelCase per actual API)
        if (policy.loBs && Array.isArray(policy.loBs)) {
          policy.loBs.forEach(lob => {
            if (lob.code) policyTypesFound.add(`lob:${lob.code}`);
          });
        }
      });

      const glPolicies = client.policies.filter(policy => {
        const isCommercial = isCommercialPolicy(policy);
        const isCgl = isGeneralLiabilityPolicy(policy);
        const isBond = isSuretyBondPolicy(policy);

        if (!isCommercial) return false;

        // Tag with specific type
        policy._policyType = getCommercialPolicyType(policy);

        if (isCgl) glFilterPassed++;
        if (isBond) bondFilterPassed++;
        commercialFilterPassed++;

        if (!policy.expirationDate) {
          glNoExpDate++;
          return false; // Skip policies with no expiration date
        }

        const expirationDate = new Date(policy.expirationDate);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (expirationDate < thirtyDaysAgo) {
          glExpiredOver90++;
          return false; // Skip policies expired more than 30 days ago
        }

        return true;
      });

      if (glPolicies.length > 0) {
        const displayName = client.details?.companyName ||
                           client.details?.dbaName ||
                           (client.people && client.people[0] ? `${client.people[0].firstName || ''} ${client.people[0].lastName || ''}`.trim() : 'Unknown');
        const cglCount = glPolicies.filter(p => p._policyType === 'cgl').length;
        const bondCount = glPolicies.filter(p => p._policyType === 'bond').length;
        const otherCount = glPolicies.length - cglCount - bondCount;
        const parts = [];
        if (cglCount) parts.push(`${cglCount} CGL`);
        if (bondCount) parts.push(`${bondCount} bond`);
        if (otherCount) parts.push(`${otherCount} other commercial`);
        console.log(`[Compliance] Client "${displayName}" has ${parts.join(' + ')} policies`);
        glPoliciesFound += cglCount;
        bondPoliciesFound += bondCount;
        commercialPoliciesFound += glPolicies.length;
      }

      for (const policy of glPolicies) {
        const daysUntilExpiration = policy.expirationDate
          ? calculateDaysUntilExpiration(policy.expirationDate)
          : null;

        // Get client name from companyName, dbaName (fallback), or people array (individuals)
        const clientName = client.details?.companyName ||
                          client.details?.dbaName ||
                          (client.people && client.people[0] ? `${client.people[0].firstName || ''} ${client.people[0].lastName || ''}`.trim() : '') ||
                          `Client #${client.clientNumber}`;

        const compliancePolicy = {
          policyNumber: policy.policyNumber,
          policyId: policy.id,
          policyType: policy._policyType || 'cgl',
          clientNumber: client.clientNumber,
          hawksoftId: client.clientNumber,
          clientName: clientName,
          businessName: client.details?.companyName,
          carrier: policy.carrier || 'Unknown',
          effectiveDate: policy.effectiveDate,
          expirationDate: policy.expirationDate,
          inceptionDate: policy.inceptionDate,
          daysUntilExpiration: daysUntilExpiration,
          status: daysUntilExpiration !== null ? getExpirationStatus(daysUntilExpiration) : 'unknown',
          requiresManualVerification: requiresManualVerification(policy.carrier || ''),
          email: client.details?.email,
          phone: client.details?.phone
        };

        compliancePolicies.push(compliancePolicy);
      }
    }

    // Sort by days until expiration (most urgent first, nulls at end)
    compliancePolicies.sort((a, b) => {
      if (a.daysUntilExpiration === null) return 1;
      if (b.daysUntilExpiration === null) return -1;
      return a.daysUntilExpiration - b.daysUntilExpiration;
    });

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('[Compliance] ===== FINAL SUMMARY =====');
    console.log(`[Compliance] Clients Scanned: ${allClients.length}`);
    console.log(`[Compliance] Total Policies Found: ${totalPolicies}`);
    console.log(`[Compliance] Commercial Filter Passed (isCommercialPolicy): ${commercialFilterPassed}`);
    console.log(`[Compliance] GL Filter Passed (isGeneralLiabilityPolicy): ${glFilterPassed}`);
    console.log(`[Compliance] Bond Filter Passed (isSuretyBondPolicy): ${bondFilterPassed}`);
    console.log(`[Compliance] No Expiration Date: ${glNoExpDate}`);
    console.log(`[Compliance] Expired >30 Days: ${glExpiredOver90}`);
    console.log(`[Compliance] CGL Policies in Final Result: ${glPoliciesFound}`);
    console.log(`[Compliance] Bond Policies in Final Result: ${bondPoliciesFound}`);
    console.log(`[Compliance] Total Commercial in Final Result: ${compliancePolicies.length}`);
    console.log(`[Compliance] All Policy Types Found:`, Array.from(policyTypesFound).sort());
    console.log(`[Compliance] Search Date Range: ${asOfDate} to ${today}`);
    console.log(`[Compliance] Elapsed Time: ${elapsedTime}s`);
    console.log('[Compliance] ===================================');

    return res.status(200).json({
      success: true,
      count: compliancePolicies.length,
      policies: compliancePolicies,
      metadata: {
        fetchedAt: today,
        searchStartDate: asOfDate,
        searchEndDate: today,
        searchYearsBack: 3,
        clientsScanned: allClients.length,
        totalPoliciesFound: totalPolicies,
        glFilterPassed: glFilterPassed,
        glNoExpDate: glNoExpDate,
        glExpiredOver30: glExpiredOver90,
        glPoliciesMatched: glPoliciesFound,
        bondPoliciesMatched: bondPoliciesFound,
        allPolicyTypes: Array.from(policyTypesFound).sort(),
        nonSyncingCarriers: NON_SYNCING_CARRIERS,
        elapsedTimeSeconds: parseFloat(elapsedTime)
      }
    });

  } catch (error) {
    console.error('[Compliance] API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    });
  }
}
