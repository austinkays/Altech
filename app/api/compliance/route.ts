/**
 * CGL Compliance Dashboard API Route
 *
 * Fetches General Liability policies from HawkSoft API
 * Route: /app/api/compliance/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';

// Non-syncing carriers that require manual verification
const NON_SYNCING_CARRIERS = [
  'Hiscox',
  'IES',
  'HCC Surety',
  'BTIS'
];

interface HawkSoftPolicy {
  PolicyId: string;
  PolicyNumber: string;
  PolicyType: string;
  Carrier: string;
  EffectiveDate: string;
  ExpirationDate: string;
  Premium?: number;
  Status?: string;
}

interface HawkSoftClient {
  ClientNumber: number;
  FirstName: string;
  LastName: string;
  BusinessName?: string;
  Email?: string;
  Phone?: string;
  UBI?: string;
  Policies?: HawkSoftPolicy[];
}

interface CompliancePolicy {
  policyNumber: string;
  policyId: string;
  clientNumber: number;
  clientName: string;
  businessName?: string;
  carrier: string;
  effectiveDate: string;
  expirationDate: string;
  daysUntilExpiration: number;
  status: 'active' | 'expiring-soon' | 'critical' | 'expired';
  requiresManualVerification: boolean;
  ubi?: string;
  lniLink?: string;
  email?: string;
  phone?: string;
}

function calculateDaysUntilExpiration(expirationDate: string): number {
  const expDate = new Date(expirationDate);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getExpirationStatus(daysUntilExpiration: number): CompliancePolicy['status'] {
  if (daysUntilExpiration < 0) return 'expired';
  if (daysUntilExpiration < 30) return 'critical';
  if (daysUntilExpiration < 60) return 'expiring-soon';
  return 'active';
}

function isGeneralLiabilityPolicy(policyType: string): boolean {
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

function requiresManualVerification(carrier: string): boolean {
  return NON_SYNCING_CARRIERS.some(
    nonSyncCarrier => carrier.toLowerCase().includes(nonSyncCarrier.toLowerCase())
  );
}

export async function GET(request: NextRequest) {
  try {
    // Get HawkSoft credentials from environment
    const HAWKSOFT_CLIENT_ID = process.env.HAWKSOFT_CLIENT_ID;
    const HAWKSOFT_CLIENT_SECRET = process.env.HAWKSOFT_CLIENT_SECRET;
    const HAWKSOFT_AGENCY_ID = process.env.HAWKSOFT_AGENCY_ID;

    if (!HAWKSOFT_CLIENT_ID || !HAWKSOFT_CLIENT_SECRET || !HAWKSOFT_AGENCY_ID) {
      return NextResponse.json(
        { error: 'HawkSoft API credentials not configured' },
        { status: 500 }
      );
    }

    // Create Basic Auth header
    const authString = `${HAWKSOFT_CLIENT_ID}:${HAWKSOFT_CLIENT_SECRET}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    const BASE_URL = 'https://integration.hawksoft.app';
    const API_VERSION = '3.0';

    console.log('[Compliance] Fetching clients from HawkSoft...');

    // Step 1: Get list of changed clients (recent changes)
    // Use a reasonable date range (e.g., last 90 days) to get active clients
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const asOfDate = ninetyDaysAgo.toISOString();

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
      return NextResponse.json(
        { error: 'Failed to fetch clients from HawkSoft', status: changedClientsResponse.status },
        { status: changedClientsResponse.status }
      );
    }

    const clientIds: number[] = await changedClientsResponse.json();
    console.log(`[Compliance] Found ${clientIds.length} clients`);

    // Limit to first 100 clients to avoid timeouts
    const limitedClientIds = clientIds.slice(0, 100);

    // Step 2: Fetch client details in batches
    const batchSize = 50; // Fetch in batches of 50
    const allClients: HawkSoftClient[] = [];

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
    const compliancePolicies: CompliancePolicy[] = [];

    for (const client of allClients) {
      if (!client.Policies || client.Policies.length === 0) continue;

      const glPolicies = client.Policies.filter(policy =>
        isGeneralLiabilityPolicy(policy.PolicyType || '') &&
        policy.ExpirationDate // Must have expiration date
      );

      for (const policy of glPolicies) {
        const daysUntilExpiration = calculateDaysUntilExpiration(policy.ExpirationDate);
        const clientName = client.BusinessName ||
                          `${client.FirstName || ''} ${client.LastName || ''}`.trim() ||
                          'Unknown';

        const compliancePolicy: CompliancePolicy = {
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

    console.log(`[Compliance] Found ${compliancePolicies.length} General Liability policies`);

    return NextResponse.json({
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
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Support OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
