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

function requiresManualVerification(carrier) {
  return NON_SYNCING_CARRIERS.some(
    nonSyncCarrier => carrier.toLowerCase().includes(nonSyncCarrier.toLowerCase())
  );
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
    // Get HawkSoft credentials from environment
    const HAWKSOFT_CLIENT_ID = process.env.HAWKSOFT_CLIENT_ID;
    const HAWKSOFT_CLIENT_SECRET = process.env.HAWKSOFT_CLIENT_SECRET;
    const HAWKSOFT_AGENCY_ID = process.env.HAWKSOFT_AGENCY_ID;

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
    console.log(`[Compliance] Total batches: ${batches.length} (${batchSize} clients each, ${concurrency} concurrent)`);

    // Process batches in parallel chunks
    for (let i = 0; i < batches.length; i += concurrency) {
      const chunk = batches.slice(i, i + concurrency);
      const chunkNum = Math.floor(i / concurrency) + 1;
      const totalChunks = Math.ceil(batches.length / concurrency);
      console.log(`[Compliance] Processing chunk ${chunkNum}/${totalChunks} (${chunk.length} parallel requests)...`);

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

    // Step 3: Extract and filter General Liability policies
    const compliancePolicies = [];

    console.log('[Compliance] Processing clients for CGL policies...');
    let totalPolicies = 0;
    let glPoliciesFound = 0;
    let glFilterPassed = 0;     // How many pass isGeneralLiabilityPolicy()
    let glNoExpDate = 0;         // GL matches without expiration date
    let glExpiredOver90 = 0;     // GL matches expired more than 90 days ago
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
        if (!isGeneralLiabilityPolicy(policy)) return false;

        // This policy IS a CGL match
        glFilterPassed++;

        if (!policy.expirationDate) {
          glNoExpDate++;
          return false; // Skip policies with no expiration date
        }

        const expirationDate = new Date(policy.expirationDate);
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        if (expirationDate < sixtyDaysAgo) {
          glExpiredOver90++;
          return false; // Skip policies expired more than 60 days ago
        }

        return true;
      });

      if (glPolicies.length > 0) {
        const displayName = client.details?.companyName ||
                           client.details?.dbaName ||
                           (client.people && client.people[0] ? `${client.people[0].firstName || ''} ${client.people[0].lastName || ''}`.trim() : 'Unknown');
        console.log(`[Compliance] Client "${displayName}" has ${glPolicies.length} CGL policies`);
        glPoliciesFound += glPolicies.length;
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
          clientNumber: client.clientNumber,
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
    console.log(`[Compliance] GL Filter Passed (isGeneralLiabilityPolicy): ${glFilterPassed}`);
    console.log(`[Compliance] GL No Expiration Date: ${glNoExpDate}`);
    console.log(`[Compliance] GL Expired >90 Days: ${glExpiredOver90}`);
    console.log(`[Compliance] CGL Policies in Final Result: ${glPoliciesFound}`);
    console.log(`[Compliance] Final Filtered Count: ${compliancePolicies.length}`);
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
        glExpiredOver90: glExpiredOver90,
        glPoliciesMatched: glPoliciesFound,
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
