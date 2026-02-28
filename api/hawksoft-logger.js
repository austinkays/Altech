/**
 * HawkSoft Call Logger API
 *
 * Accepts messy shorthand call notes, uses AI to format them into
 * professional insurance call log entries, then optionally pushes
 * the formatted note to HawkSoft via their REST API.
 *
 * POST /api/hawksoft-logger
 * Body: { policyId, callType, rawNotes, userApiKey?, aiModel?, formatOnly?, formattedLog? }
 * Returns: { formattedLog, hawksoftLogged }
 *
 * Two-step workflow:
 *   Step 1 (formatOnly: true)  — AI formats notes, returns preview, no HawkSoft push
 *   Step 2 (formattedLog: '...') — Pushes pre-formatted log to HawkSoft, skips AI
 *
 * Security: securityMiddleware (CORS, rate limiting, headers)
 */

import { securityMiddleware } from '../lib/security.js';
import { createRouter } from './_ai-router.js';

// ── System Prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a professional insurance agency call log formatter.

Your job is to take messy, abbreviated shorthand notes from an insurance agent's phone call
and rewrite them as a clean, professional HawkSoft-style log entry.

RULES:
1. Fix all spelling errors and abbreviations
2. Use complete sentences in past tense
3. Keep the same factual content — do NOT add information that wasn't in the notes
4. Use professional insurance terminology where appropriate
5. Include a brief subject line at the top (e.g., "RE: Homeowners Quote Inquiry")
6. Add the call direction (Inbound/Outbound) and timestamp
7. Keep it concise — typically 3-8 sentences
8. End with any action items or follow-up needed
9. Do NOT wrap in markdown or code blocks — return plain text only

FORMAT:
RE: [Brief Subject]
[Call Direction] Call — [Date/Time]

[Formatted note body]

Action Items: [any follow-ups, or "None" if none mentioned]`;

// ── Handler ──────────────────────────────────────────────────────

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { policyId, clientNumber, callType, rawNotes, userApiKey, aiModel, formatOnly, formattedLog: preFormattedLog } = req.body || {};

    // ── Validation ──
    if (!policyId || typeof policyId !== 'string' || !policyId.trim()) {
      return res.status(400).json({ error: 'Policy ID is required' });
    }

    const cleanPolicyId = policyId.trim();
    // clientNumber is the HawkSoft client ID used for the logNotes API
    // (policyId is the policy number used for display)
    const hawksoftClientId = String(clientNumber || '').trim() || cleanPolicyId;
    const cleanCallType = (callType || 'Inbound').trim();

    // ── Step 2: Push pre-formatted log to HawkSoft (skip AI) ──
    if (preFormattedLog && typeof preFormattedLog === 'string' && preFormattedLog.trim()) {
      const logText = preFormattedLog.trim();
      let hawksoftLogged = false;
      let hawksoftStatus = 'no_credentials';
      let hawksoftError = null;
      const HAWKSOFT_CLIENT_ID = (process.env.HAWKSOFT_CLIENT_ID || '').trim();
      const HAWKSOFT_CLIENT_SECRET = (process.env.HAWKSOFT_CLIENT_SECRET || '').trim();
      const HAWKSOFT_AGENCY_ID = (process.env.HAWKSOFT_AGENCY_ID || '').trim();

      if (HAWKSOFT_CLIENT_ID && HAWKSOFT_CLIENT_SECRET && HAWKSOFT_AGENCY_ID) {
        try {
          const authString = `${HAWKSOFT_CLIENT_ID}:${HAWKSOFT_CLIENT_SECRET}`;
          const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
          const BASE_URL = 'https://integration.hawksoft.app';
          const API_VERSION = '3.0';

          const refId = crypto.randomUUID();
          const ts = new Date().toISOString();
          const actionCode = cleanCallType === 'Outbound' ? 1 : 5; // 1 = Phone To Insured, 5 = Phone From Insured
          const logUrl = `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/client/${hawksoftClientId}/log?version=${API_VERSION}`;
          const logBody = { refId, ts, note: logText, action: actionCode };
          console.log(`[HawkSoft Logger] ── PRE-FORMATTED PUSH ──`);
          console.log(`[HawkSoft Logger]   URL: ${logUrl}`);
          console.log(`[HawkSoft Logger]   Body: ${JSON.stringify({ refId, ts: ts.substring(0, 19), action: actionCode, noteLen: logText.length })}`);
          console.log(`[HawkSoft Logger]   clientNumber=${hawksoftClientId} policyId=${cleanPolicyId} callType=${cleanCallType}`);
          const logRes = await fetch(logUrl, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(logBody)
            }
          );

          const resText = await logRes.text().catch(() => '');
          console.log(`[HawkSoft Logger]   Response: ${logRes.status} ${logRes.statusText} — ${resText.substring(0, 300)}`);
          if (logRes.ok) {
            hawksoftLogged = true;
            hawksoftStatus = 'logged';
            console.log(`[HawkSoft Logger] ✅ Pre-formatted note logged for client ${hawksoftClientId}`);
          } else {
            hawksoftStatus = 'push_failed';
            hawksoftError = `HawkSoft returned ${logRes.status}: ${resText.substring(0, 200)}`;
            console.warn(`[HawkSoft Logger] ⚠️ HawkSoft push failed (${logRes.status}): ${resText.substring(0, 200)}`);
          }
        } catch (hsErr) {
          hawksoftStatus = 'push_error';
          hawksoftError = hsErr.message;
          console.warn('[HawkSoft Logger] ⚠️ HawkSoft push error:', hsErr.message);
        }
      } else {
        console.log('[HawkSoft Logger] HawkSoft credentials not configured — skipping push');
      }

      return res.status(200).json({
        formattedLog: logText,
        hawksoftLogged,
        hawksoftStatus,
        hawksoftError,
        policyId: cleanPolicyId,
        clientNumber: hawksoftClientId,
        callType: cleanCallType
      });
    }

    // ── Step 1: AI format (with optional HawkSoft push) ──
    if (!rawNotes || typeof rawNotes !== 'string' || !rawNotes.trim()) {
      return res.status(400).json({ error: 'Call notes are required' });
    }
    if (rawNotes.length > 10000) {
      return res.status(400).json({ error: 'Notes too long (max 10,000 characters)' });
    }

    const cleanNotes = rawNotes.trim();

    // ── AI Formatting ──
    const aiSettings = {};
    if (userApiKey && userApiKey.trim()) {
      aiSettings.apiKey = userApiKey.trim();
      // Detect provider from model name
      const model = (aiModel || '').trim();
      if (model.startsWith('gpt-')) {
        aiSettings.provider = 'openai';
      } else if (model.startsWith('claude-') || model.includes('anthropic')) {
        aiSettings.provider = 'anthropic';
      } else if (model.includes('/')) {
        aiSettings.provider = 'openrouter';
      } else {
        aiSettings.provider = 'google';
      }
      if (model) aiSettings.model = model;
    }

    const ai = createRouter(aiSettings);

    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const userMessage = `Policy/Client ID: ${cleanPolicyId}
Call Type: ${cleanCallType}
Timestamp: ${timestamp} PST
Agent's shorthand notes:
${cleanNotes}`;

    console.log(`[HawkSoft Logger] Formatting notes for policy ${cleanPolicyId} (${cleanNotes.length} chars)`);

    const formattedLog = await ai.ask(SYSTEM_PROMPT, userMessage, {
      temperature: 0.3,
      maxTokens: 1024
    });

    if (!formattedLog || !formattedLog.trim()) {
      throw new Error('AI returned empty response');
    }

    // ── If formatOnly, return preview without pushing ──
    if (formatOnly) {
      return res.status(200).json({
        formattedLog: formattedLog.trim(),
        hawksoftLogged: false,
        policyId: cleanPolicyId,
        clientNumber: hawksoftClientId,
        callType: cleanCallType
      });
    }

    // ── Optional HawkSoft Push ──
    let hawksoftLogged = false;
    let hawksoftStatus = 'no_credentials';
    let hawksoftError = null;
    const HAWKSOFT_CLIENT_ID = (process.env.HAWKSOFT_CLIENT_ID || '').trim();
    const HAWKSOFT_CLIENT_SECRET = (process.env.HAWKSOFT_CLIENT_SECRET || '').trim();
    const HAWKSOFT_AGENCY_ID = (process.env.HAWKSOFT_AGENCY_ID || '').trim();

    if (HAWKSOFT_CLIENT_ID && HAWKSOFT_CLIENT_SECRET && HAWKSOFT_AGENCY_ID) {
      try {
        const authString = `${HAWKSOFT_CLIENT_ID}:${HAWKSOFT_CLIENT_SECRET}`;
        const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
        const BASE_URL = 'https://integration.hawksoft.app';
        const API_VERSION = '3.0';

        // HawkSoft log note endpoint — /client/{id}/log per API v3.0 docs
        const refId2 = crypto.randomUUID();
        const ts2 = new Date().toISOString();
        const actionCode2 = cleanCallType === 'Outbound' ? 1 : 5; // 1 = Phone To Insured, 5 = Phone From Insured
        const logUrl2 = `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/client/${hawksoftClientId}/log?version=${API_VERSION}`;
        const logBody2 = { refId: refId2, ts: ts2, note: formattedLog.trim(), action: actionCode2 };
        console.log(`[HawkSoft Logger] ── AI-FORMATTED PUSH ──`);
        console.log(`[HawkSoft Logger]   URL: ${logUrl2}`);
        console.log(`[HawkSoft Logger]   Body: ${JSON.stringify({ refId: refId2, ts: ts2.substring(0, 19), action: actionCode2, noteLen: formattedLog.trim().length })}`);
        console.log(`[HawkSoft Logger]   clientNumber=${hawksoftClientId} policyId=${cleanPolicyId} callType=${cleanCallType}`);
        const logRes = await fetch(logUrl2, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(logBody2)
          }
        );

        const resText2 = await logRes.text().catch(() => '');
        console.log(`[HawkSoft Logger]   Response: ${logRes.status} ${logRes.statusText} — ${resText2.substring(0, 300)}`);
        if (logRes.ok) {
          hawksoftLogged = true;
          hawksoftStatus = 'logged';
          console.log(`[HawkSoft Logger] ✅ Note logged to HawkSoft for client ${hawksoftClientId}`);
        } else {
          hawksoftStatus = 'push_failed';
          hawksoftError = `HawkSoft returned ${logRes.status}: ${resText2.substring(0, 200)}`;
          console.warn(`[HawkSoft Logger] ⚠️ HawkSoft push failed (${logRes.status}): ${resText2.substring(0, 200)}`);
        }
      } catch (hsErr) {
        hawksoftStatus = 'push_error';
        hawksoftError = hsErr.message;
        console.warn('[HawkSoft Logger] ⚠️ HawkSoft push error:', hsErr.message);
        // Don't fail the request — the formatted log is still useful
      }
    } else {
      console.log('[HawkSoft Logger] HawkSoft credentials not configured — skipping push');
    }

    return res.status(200).json({
      formattedLog: formattedLog.trim(),
      hawksoftLogged,
      hawksoftStatus,
      hawksoftError,
      policyId: cleanPolicyId,
      clientNumber: hawksoftClientId,
      callType: cleanCallType
    });

  } catch (error) {
    console.error('[HawkSoft Logger] Error:', error.message);
    return res.status(500).json({
      error: error.message || 'Failed to format call notes'
    });
  }
}

export default securityMiddleware(handler);
