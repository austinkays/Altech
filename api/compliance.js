/**
 * CGL Compliance Dashboard API
 * Fetches General Liability policies from HawkSoft API
 * Vercel Serverless Function
 */

import { securityMiddleware } from '../lib/security.js';
import {
  NON_SYNCING_CARRIERS,
  calculateDaysUntilExpiration,
  getExpirationStatus,
  isGeneralLiabilityPolicy,
  isSuretyBondPolicy,
  requiresManualVerification,
  isCommercialPolicy,
  getCommercialPolicyType,
  getPersonalPolicyType,
} from '../lib/compliance-utils.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ── Server-side KV cache check ──
    // On Vercel, the HawkSoft API can take 30-60s. Check Redis cache first
    // and return immediately if the data is fresh (< 15 minutes old).
    const KV_CACHE_KEY = 'cgl_cache';
    const KV_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
    const forceRefresh = req.query?.refresh === 'true';
    let redisClient = null;

    try {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl && !forceRefresh) {
        const { default: Redis } = await import('ioredis');
        redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          commandTimeout: 3000,
          lazyConnect: true,
          retryStrategy(times) { return times > 1 ? null : 500; }
        });
        redisClient.on('error', () => {});
        await redisClient.connect();

        const raw = await redisClient.get(KV_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          const age = Date.now() - (cached.cachedAt || 0);
          if (age < KV_CACHE_TTL_MS && cached.policies?.length > 0 && cached.allPolicies?.length > 0) {
            console.log(`[Compliance] ✅ KV cache hit — ${cached.policies.length} CGL + ${cached.allPolicies.length} total policies, ${Math.round(age / 60000)}m old`);
            try { redisClient.disconnect(); } catch {}
            return res.status(200).json(cached);
          }
          const reason = !cached.allPolicies?.length ? 'missing allPolicies' : `stale (${Math.round(age / 60000)}m old)`;
          console.log(`[Compliance] KV cache invalid (${reason}) — refreshing from HawkSoft`);
        }
      }
    } catch (kvErr) {
      console.log('[Compliance] KV cache check skipped:', kvErr.message);
    }

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
    const allPolicies = [];  // All policy types (commercial + personal) for Call Logger

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

      // Compute client name once for this client (used by both allPolicies and compliancePolicies)
      const clientName = client.details?.companyName ||
                        client.details?.dbaName ||
                        (client.people && client.people[0] ? `${client.people[0].firstName || ''} ${client.people[0].lastName || ''}`.trim() : '') ||
                        `Client #${client.clientNumber}`;

      // Build allPolicies entries for ALL non-cancelled policies (all lines of business)
      // Used by Call Logger for client/policy autocomplete — include personal lines too.
      // Skip policies with expiration date older than ~1 year; keep no-expiry policies (e.g. life/health).
      const allPoliciesLookback = new Date();
      allPoliciesLookback.setFullYear(allPoliciesLookback.getFullYear() - 1);

      for (const policy of client.policies) {
        const policyStatus = (policy.status || '').toLowerCase();
        if (policyStatus === 'prospect' || policyStatus === 'cancelled' || policyStatus === 'canceled') continue;

        // Skip policies with an expiration date older than ~1 year (keep no-expiry policies like life/health)
        if (policy.expirationDate) {
          const expDate = new Date(policy.expirationDate);
          if (expDate < allPoliciesLookback) continue;
        }

        const isCommercialPol = isCommercialPolicy(policy);
        const pType = isCommercialPol
          ? getCommercialPolicyType(policy)
          : getPersonalPolicyType(policy);

        allPolicies.push({
          policyNumber: policy.policyNumber,
          policyType: pType,
          lineOfBusiness: isCommercialPol ? 'commercial' : 'personal',
          clientNumber: client.clientNumber,
          hawksoftId: client.clientNumber,
          clientName: clientName,
          carrier: policy.carrier || 'Unknown',
          expirationDate: policy.expirationDate || ''
        });
      }

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

    // Compute personal vs commercial breakdown for diagnostics
    const personalPolicies = allPolicies.filter(p => p.lineOfBusiness === 'personal');
    const commercialAllPolicies = allPolicies.filter(p => p.lineOfBusiness === 'commercial');
    const personalClientNames = new Set(personalPolicies.map(p => p.clientName).filter(Boolean));
    const commercialClientNames = new Set(commercialAllPolicies.map(p => p.clientName).filter(Boolean));
    const allClientNames = new Set(allPolicies.map(p => p.clientName).filter(Boolean));

    // Count policy types in allPolicies
    const policyTypeBreakdown = {};
    for (const p of allPolicies) {
      const t = p.policyType || 'unknown';
      policyTypeBreakdown[t] = (policyTypeBreakdown[t] || 0) + 1;
    }

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
    console.log(`[Compliance] All Policies (all lines): ${allPolicies.length}`);
    console.log(`[Compliance]   ↳ Commercial: ${commercialAllPolicies.length} policies, ${commercialClientNames.size} unique clients`);
    console.log(`[Compliance]   ↳ Personal:   ${personalPolicies.length} policies, ${personalClientNames.size} unique clients`);
    console.log(`[Compliance]   ↳ Total unique clients: ${allClientNames.size}`);
    console.log(`[Compliance]   ↳ Policy type breakdown:`, policyTypeBreakdown);
    console.log(`[Compliance] All Policy Types Found:`, Array.from(policyTypesFound).sort());
    console.log(`[Compliance] Search Date Range: ${asOfDate} to ${today}`);
    console.log(`[Compliance] Elapsed Time: ${elapsedTime}s`);
    console.log('[Compliance] ===================================');

    const responsePayload = {
      success: true,
      count: compliancePolicies.length,
      policies: compliancePolicies,
      allPolicies: allPolicies,
      cachedAt: Date.now(),
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
        elapsedTimeSeconds: parseFloat(elapsedTime),
        allPoliciesBreakdown: {
          commercial: commercialAllPolicies.length,
          personal: personalPolicies.length,
          commercialClients: commercialClientNames.size,
          personalClients: personalClientNames.size,
          totalClients: allClientNames.size,
          policyTypes: policyTypeBreakdown
        }
      }
    };

    // ── Save to KV cache for next request ──
    try {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        let kvClient = redisClient;
        if (!kvClient || kvClient.status !== 'ready') {
          const { default: Redis } = await import('ioredis');
          kvClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,
            commandTimeout: 5000,
            lazyConnect: true,
            retryStrategy(times) { return times > 1 ? null : 500; }
          });
          kvClient.on('error', () => {});
          await kvClient.connect();
        }
        const serialized = JSON.stringify(responsePayload);
        if (serialized.length < 1_000_000) {
          await kvClient.set(KV_CACHE_KEY, serialized);
          console.log(`[Compliance] ☁️ KV cache updated — ${compliancePolicies.length} policies (${(serialized.length / 1024).toFixed(0)}KB)`);
        }
        try { kvClient.disconnect(); } catch {}
      }
    } catch (kvErr) {
      console.log('[Compliance] KV cache write failed:', kvErr.message);
    }

    return res.status(200).json(responsePayload);

  } catch (error) {
    console.error('[Compliance] API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    });
  }
}

export default securityMiddleware(handler);