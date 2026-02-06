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
  // ACORD Standard Codes for CGL/Liability policies
  const glCodes = [
    'cgl',          // Commercial General Liability (ACORD standard)
    'gl',           // General Liability (shortcode)
    'bop',          // Business Owners Policy (includes GL coverage)
    'cumbr',        // Commercial Umbrella (often tied to GL)
    'general liability',
    'commercial general liability',
    'gen liab',
    'comm gen liab',
    'liability',
    'commercial'    // General commercial type
  ];

  // Check LOBs array (this is the primary field per HawkSoft docs)
  if (policy.LOBs && Array.isArray(policy.LOBs)) {
    for (const lob of policy.LOBs) {
      if (lob.Code && typeof lob.Code === 'string') {
        const codeLower = lob.Code.toLowerCase();
        for (const glCode of glCodes) {
          if (codeLower.includes(glCode)) {
            console.log(`[Compliance] ✓ MATCH FOUND in LOBs[].Code: "${lob.Code}"`);
            return true;
          }
        }
      }
    }
  }

  // Check other documented fields: Type, ApplicationType, Title
  const fieldsToCheck = [
    policy.Type,
    policy.ApplicationType,
    policy.Title
  ];

  for (let i = 0; i < fieldsToCheck.length; i++) {
    const field = fieldsToCheck[i];
    const fieldNames = ['Type', 'ApplicationType', 'Title'];
    if (field && typeof field === 'string') {
      const fieldLower = field.toLowerCase();
      for (const code of glCodes) {
        if (fieldLower.includes(code)) {
          console.log(`[Compliance] ✓ MATCH FOUND in ${fieldNames[i]}: "${field}"`);
          return true;
        }
      }
    }
  }

  // Log non-matches for debugging
  const lobCodes = policy.LOBs ? policy.LOBs.map(l => l.Code).join(', ') : 'none';
  console.log(`[Compliance] ✗ NO MATCH: Type="${policy.Type || 'null'}", ApplicationType="${policy.ApplicationType || 'null'}", Title="${policy.Title || 'null'}", LOBs.Code=[${lobCodes}]`);

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

    // Limit to first 100 clients to avoid timeouts
    const limitedClientIds = clientIds.slice(0, 100);
    if (clientIds.length > 100) {
      console.log(`[Compliance] ⚠ Limited to first 100 clients (${clientIds.length} total available)`);
    }

    // Step 3: Fetch client details in batches
    console.log('[Compliance] Fetching client details in batches...');
    const batchSize = 50;
    const allClients = [];

    for (let i = 0; i < limitedClientIds.length; i += batchSize) {
      const batch = limitedClientIds.slice(i, i + batchSize);
      console.log(`[Compliance] Fetching batch ${Math.floor(i / batchSize) + 1} (${batch.length} clients)...`);

      const batchResponse = await fetch(
        `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients?version=${API_VERSION}&include=Policies`,
        {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ clientNumbers: batch })
        }
      );

      if (batchResponse.ok) {
        const batchClients = await batchResponse.json();
        console.log(`[Compliance] ✓ Batch returned ${batchClients.length} clients`);
        allClients.push(...batchClients);
      } else {
        console.error(`[Compliance] ✗ Batch fetch failed:`, batchResponse.status);
      }
    }

    console.log(`[Compliance] ✓ Total clients fetched: ${allClients.length}`);

    // FORENSIC LOGGING: Client structure analysis
    if (allClients.length > 0) {
      const sampleClient = allClients[0];
      console.log('[Compliance] ===== CLIENT STRUCTURE FORENSICS =====');
      console.log('[Compliance] Sample client keys:', Object.keys(sampleClient));
      console.log('[Compliance] Has policies array?', Array.isArray(sampleClient.policies));
      console.log('[Compliance] Policies count in first client:', sampleClient.policies ? sampleClient.policies.length : 0);
      console.log('[Compliance] ========================================');
    }

    // Step 4: If no policies in client objects, fetch them separately per client
    let clientsWithPolicies = 0;
    let clientsWithoutPolicies = 0;

    for (const client of allClients) {
      if (client.policies && client.policies.length > 0) {
        clientsWithPolicies++;
      } else {
        clientsWithoutPolicies++;
      }
    }

    console.log(`[Compliance] Clients with embedded policies: ${clientsWithPolicies}`);
    console.log(`[Compliance] Clients without embedded policies: ${clientsWithoutPolicies}`);

    // If most clients don't have policies, try fetching them separately
    if (clientsWithoutPolicies > 0 && clientsWithPolicies < 10) {
      console.log('[Compliance] ⚠ Policies not embedded in client response, attempting separate policy fetch...');

      // Try fetching policies for a sample client to test
      if (allClients.length > 0 && allClients[0].ClientNumber) {
        const sampleClientNumber = allClients[0].ClientNumber;
        console.log(`[Compliance] Testing policy fetch for client ${sampleClientNumber}...`);

        try {
          const policiesResponse = await fetch(
            `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients/${sampleClientNumber}/policies?version=${API_VERSION}`,
            {
              method: 'GET',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
              }
            }
          );

          if (policiesResponse.ok) {
            const policies = await policiesResponse.json();
            console.log(`[Compliance] ✓ Separate policy endpoint works! Found ${policies.length} policies for sample client`);
            console.log(`[Compliance] Now fetching policies for all ${allClients.length} clients...`);

            // Fetch policies for all clients
            for (const client of allClients.slice(0, 100)) { // Limit to avoid timeout
              try {
                const clientPoliciesResponse = await fetch(
                  `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients/${client.ClientNumber}/policies?version=${API_VERSION}`,
                  {
                    method: 'GET',
                    headers: {
                      'Authorization': authHeader,
                      'Content-Type': 'application/json'
                    }
                  }
                );

                if (clientPoliciesResponse.ok) {
                  client.policies = await clientPoliciesResponse.json();
                }
              } catch (err) {
                console.error(`[Compliance] Failed to fetch policies for client ${client.ClientNumber}:`, err.message);
              }
            }

            console.log('[Compliance] ✓ Completed separate policy fetch for all clients');
          } else {
            console.log(`[Compliance] ✗ Separate policy endpoint returned ${policiesResponse.status}`);
          }
        } catch (err) {
          console.error('[Compliance] Error testing separate policy fetch:', err.message);
        }
      }
    }

    // FORENSIC LOGGING: Output first complete raw policy object
    console.log('[Compliance] Searching for first policy to log...');
    let foundSamplePolicy = false;
    for (const client of allClients) {
      if (client.policies && client.policies.length > 0) {
        console.log('[Compliance] ===== RAW POLICY FORENSICS =====');
        console.log('[Compliance] Full raw policy object:');
        console.log(JSON.stringify(client.policies[0], null, 2));
        console.log('[Compliance] ===================================');
        foundSamplePolicy = true;
        break;
      }
    }

    if (!foundSamplePolicy) {
      console.log('[Compliance] ✗ NO POLICIES FOUND IN ANY CLIENT - This is the root cause!');
    }

    // Step 3: Extract and filter General Liability policies
    const compliancePolicies = [];

    console.log('[Compliance] Processing clients for CGL policies...');
    let totalPolicies = 0;
    let glPoliciesFound = 0;
    const policyTypesFound = new Set();

    for (const client of allClients) {
      if (!client.policies || client.policies.length === 0) continue;

      totalPolicies += client.policies.length;

      // Log all unique policy type values from all possible fields
      client.policies.forEach(policy => {
        // Capture documented fields
        if (policy.Type) policyTypesFound.add(`Type:${policy.Type}`);
        if (policy.ApplicationType) policyTypesFound.add(`AppType:${policy.ApplicationType}`);
        if (policy.Title) policyTypesFound.add(`Title:${policy.Title}`);

        // Capture LOBs array codes (primary field per HawkSoft docs)
        if (policy.LOBs && Array.isArray(policy.LOBs)) {
          policy.LOBs.forEach(lob => {
            if (lob.Code) policyTypesFound.add(`LOB:${lob.Code}`);
          });
        }
      });

      const glPolicies = client.policies.filter(policy =>
        isGeneralLiabilityPolicy(policy) &&  // Pass full policy object
        policy.ExpirationDate // Must have expiration date
      );

      if (glPolicies.length > 0) {
        console.log(`[Compliance] Client "${client.BusinessName || client.FirstName + ' ' + client.LastName}" has ${glPolicies.length} CGL policies`);
        glPoliciesFound += glPolicies.length;
      }

      for (const policy of glPolicies) {
        const daysUntilExpiration = calculateDaysUntilExpiration(policy.ExpirationDate);
        const clientName = client.BusinessName ||
                          `${client.FirstName || ''} ${client.LastName || ''}`.trim() ||
                          'Unknown';

        const compliancePolicy = {
          policyNumber: policy.PolicyNumber,
          policyId: policy.PolicyId,
          clientNumber: client.ClientNumber,
          clientName: clientName,
          businessName: client.BusinessName,
          carrier: policy.Carrier || 'Unknown',
          effectiveDate: policy.EffectiveDate,
          expirationDate: policy.ExpirationDate,
          daysUntilExpiration: daysUntilExpiration,
          status: getExpirationStatus(daysUntilExpiration),
          requiresManualVerification: requiresManualVerification(policy.Carrier || ''),
          ubi: client.UBI,
          lniLink: client.UBI ? `https://secure.lni.wa.gov/verify/Detail.aspx?UBI=${client.UBI}` : undefined,
          email: client.Email,
          phone: client.Phone
        };

        compliancePolicies.push(compliancePolicy);
      }
    }

    // Sort by days until expiration (most urgent first)
    compliancePolicies.sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('[Compliance] ===== FINAL SUMMARY =====');
    console.log(`[Compliance] Clients Scanned: ${allClients.length}`);
    console.log(`[Compliance] Total Policies Found: ${totalPolicies}`);
    console.log(`[Compliance] CGL Policies Matched: ${glPoliciesFound}`);
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
