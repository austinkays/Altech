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

function isGeneralLiabilityPolicy(policyType) {
  const glKeywords = [
    'general liability',
    'gl',
    'cgl',
    'commercial general liability',
    'liability'
  ];

  const type = policyType.toLowerCase();
  return glKeywords.some(keyword => type.includes(keyword));
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

    console.log('[Compliance] Fetching clients from HawkSoft...');

    // Step 1: Get list of changed clients (recent changes)
    // Use a wider date range (365 days) to ensure we get all active CGL policies
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    const asOfDate = oneYearAgo.toISOString();

    console.log('[Compliance] Searching for policies changed since:', asOfDate);

    const changedClientsResponse = await fetch(
      `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients?version=${API_VERSION}&asOf=${asOfDate}`,
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
      return res.status(changedClientsResponse.status).json({
        success: false,
        error: 'Failed to fetch clients from HawkSoft',
        status: changedClientsResponse.status
      });
    }

    const clientIds = await changedClientsResponse.json();
    console.log(`[Compliance] Found ${clientIds.length} clients`);

    // Limit to first 100 clients to avoid timeouts
    const limitedClientIds = clientIds.slice(0, 100);

    // Step 2: Fetch client details in batches
    const batchSize = 50; // Fetch in batches of 50
    const allClients = [];

    for (let i = 0; i < limitedClientIds.length; i += batchSize) {
      const batch = limitedClientIds.slice(i, i + batchSize);

      const batchResponse = await fetch(
        `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients?version=${API_VERSION}`,
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
        allClients.push(...batchClients);
      }
    }

    console.log(`[Compliance] Fetched details for ${allClients.length} clients`);

    // Step 3: Extract and filter General Liability policies
    const compliancePolicies = [];

    console.log('[Compliance] Processing clients for CGL policies...');
    let totalPolicies = 0;
    let glPoliciesFound = 0;

    for (const client of allClients) {
      if (!client.Policies || client.Policies.length === 0) continue;

      totalPolicies += client.Policies.length;

      const glPolicies = client.Policies.filter(policy =>
        isGeneralLiabilityPolicy(policy.PolicyType || '') &&
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

    console.log(`[Compliance] Summary: Scanned ${allClients.length} clients with ${totalPolicies} total policies`);
    console.log(`[Compliance] Found ${glPoliciesFound} General Liability policies`);
    console.log(`[Compliance] Final filtered count: ${compliancePolicies.length}`);

    return res.status(200).json({
      success: true,
      count: compliancePolicies.length,
      policies: compliancePolicies,
      metadata: {
        fetchedAt: new Date().toISOString(),
        clientsScanned: allClients.length,
        nonSyncingCarriers: NON_SYNCING_CARRIERS
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
