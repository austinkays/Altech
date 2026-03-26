/**
 * HawkSoft Logger API
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

IMPORTANT: HawkSoft does not reliably preserve blank lines between paragraphs. Format your
output so it reads clearly even when rendered as a single block of text with single line breaks.

RULES:
1. Fix all spelling errors and abbreviations
2. Use complete sentences in past tense
3. Keep the same factual content — do NOT add information that wasn't in the notes
4. Use professional insurance terminology where appropriate
5. Include a brief subject line on the first line
6. Keep it concise — typically 2-5 sentences in the body
7. Do NOT wrap in markdown or code blocks — return plain text only
8. Do NOT use blank lines — use single line breaks only
9. VOICE: If the raw notes are written in first person ("I called", "I spoke with"), keep the
   formatted log in first person. Do NOT convert "I" to "agent" or third person. If the notes
   are already third person or impersonal, keep them that way.
10. Match the voice to the activity type:
    - Payment, Policy Change, Renewal, Certificate: write as COMPLETED actions ("processed", "issued", "received")
    - Coverage Q, New Quote: in-progress framing is fine ("client inquired about...", "quoted...")
    - Claim: write as reported/filed
    - Other or unspecified: follow whatever the raw notes suggest
11. Put action items inline at the end of the body using "Action: [text]" — not on a separate line

FORMAT (2 lines — no blank lines):
RE: [One-sentence summary specific enough to understand without opening the entry]
[Full body: detail, key numbers, first person if applicable. Action: [follow-up or None.]]

CRITICAL FORMATTING RULES:
- Line 1 (RE:) is the ONLY line visible in HawkSoft's log list — agents will NOT see line 2
  unless they open the entry. Make line 1 a complete, informative summary of what happened.
- Do NOT put date, time, initials, carrier, channel, or line of business in line 1 — HawkSoft
  already shows all of those in separate columns beside the log entry.
- Line 1 should answer: "What happened on this call?" in one readable sentence.
- Line 2 is the full detail for when the entry is opened.

EXAMPLE OUTPUT:
RE: Called Progressive to backdate missed $586 refund; additional $780 coming, payments dropping to ~$265/mo
I saw Progressive had refunded William's current policy for $586 but hadn't processed the previous term, so I called and got them to backdate the adjustment. An additional $780 refund is forthcoming which will cover the next 3 payments and reduce ongoing payments to ~$265 due to the retroactive 5-year accident-free discount. Action: Monitor for refund and confirm payment adjustments with client.`;

// ── Channel Code Mapping (HawkSoft API v3.0) ──────────────────
// Maps client-side callType strings to HawkSoft log field objects.
// Each entry provides: channel (LogAction code 1-56), method, direction, party.
// LogAction enum: Phone 1-8, Mail 9-16, Walk In 17-24, Online 25-32, Email 33-40, Text 41-48, Chat 49-56.
// Within each group: To Insured (+0), To Carrier (+1), To Agency Staff (+2), To 3rd Party (+3),
//                    From Insured (+4), From Carrier (+5), From Agency Staff (+6), From 3rd Party (+7).
const CHANNEL_MAP = {
    'Inbound':  { channel: 5,  method: 'Phone',   direction: 'From', party: 'Insured' },
    'Outbound': { channel: 1,  method: 'Phone',   direction: 'To',   party: 'Insured' },
    'Walk-In':  { channel: 21, method: 'Walk In',  direction: 'From', party: 'Insured' },
    'Email':    { channel: 33, method: 'Email',    direction: 'To',   party: 'Insured' },
    'Text':     { channel: 41, method: 'Text',     direction: 'To',   party: 'Insured' },
    'Mail':     { channel: 9,  method: 'Mail',     direction: 'To',   party: 'Insured' },
};
const DEFAULT_CHANNEL = { channel: 5, method: 'Phone', direction: 'From', party: 'Insured' };

// ── HawkSoft Push Helper ─────────────────────────────────────────

/**
 * Push a formatted log note to HawkSoft.
 * Returns { hawksoftLogged, hawksoftStatus, hawksoftError }.
 */
async function _pushToHawkSoft(logText, hawksoftClientId, cleanHawksoftPolicyId, cleanCallType) {
    const HAWKSOFT_CLIENT_ID = (process.env.HAWKSOFT_CLIENT_ID || '').trim();
    const HAWKSOFT_CLIENT_SECRET = (process.env.HAWKSOFT_CLIENT_SECRET || '').trim();
    const HAWKSOFT_AGENCY_ID = (process.env.HAWKSOFT_AGENCY_ID || '').trim();

    if (!HAWKSOFT_CLIENT_ID || !HAWKSOFT_CLIENT_SECRET || !HAWKSOFT_AGENCY_ID) {
        console.log('[HawkSoft Logger] HawkSoft credentials not configured — skipping push');
        return { hawksoftLogged: false, hawksoftStatus: 'no_credentials', hawksoftError: null };
    }

    try {
        const authHeader = `Basic ${Buffer.from(`${HAWKSOFT_CLIENT_ID}:${HAWKSOFT_CLIENT_SECRET}`).toString('base64')}`;
        const BASE_URL = 'https://integration.hawksoft.app';
        const API_VERSION = '3.0';
        const channelInfo = CHANNEL_MAP[cleanCallType] || DEFAULT_CHANNEL;

        const refId = crypto.randomUUID();
        const ts = new Date().toISOString();
        const logUrl = `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/client/${hawksoftClientId}/log?version=${API_VERSION}`;
        const logBody = {
            refId,
            ts,
            note: logText,
            channel: channelInfo.channel,
            method: channelInfo.method,
            direction: channelInfo.direction,
            party: channelInfo.party
        };
        if (cleanHawksoftPolicyId) logBody.policyId = cleanHawksoftPolicyId;

        console.log(`[HawkSoft Logger]   URL: ${logUrl}`);
        console.log(`[HawkSoft Logger]   Body: ${JSON.stringify({ refId, ts: ts.substring(0, 19), channel: channelInfo.channel, method: channelInfo.method, direction: channelInfo.direction, party: channelInfo.party, policyId: cleanHawksoftPolicyId || '(none)', noteLen: logText.length })}`);

        const logRes = await fetch(logUrl, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(logBody)
        });

        const resText = await logRes.text().catch(() => '');
        console.log(`[HawkSoft Logger]   Response: ${logRes.status} ${logRes.statusText} — ${resText.substring(0, 300)}`);

        if (logRes.ok) {
            console.log(`[HawkSoft Logger] ✅ Note logged to HawkSoft for client ${hawksoftClientId}`);
            return { hawksoftLogged: true, hawksoftStatus: 'logged', hawksoftError: null };
        } else {
            const hawksoftError = `HawkSoft returned ${logRes.status}: ${resText.substring(0, 200)}`;
            console.warn(`[HawkSoft Logger] ⚠️ HawkSoft push failed (${logRes.status}): ${resText.substring(0, 200)}`);
            return { hawksoftLogged: false, hawksoftStatus: 'push_failed', hawksoftError };
        }
    } catch (hsErr) {
        console.warn('[HawkSoft Logger] ⚠️ HawkSoft push error:', hsErr.message);
        return { hawksoftLogged: false, hawksoftStatus: 'push_error', hawksoftError: hsErr.message };
    }
}

// ── Handler ──────────────────────────────────────────────────────

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { policyId, clientNumber, hawksoftPolicyId, callType, rawNotes, agentInitials, activityType, glossary, userApiKey, aiModel, formatOnly, formattedLog: preFormattedLog } = req.body || {};

    // ── Validation ──
    if (!policyId || typeof policyId !== 'string' || !policyId.trim()) {
      return res.status(400).json({ error: 'Policy ID is required' });
    }

    const cleanPolicyId = policyId.trim();
    const hawksoftClientId = String(clientNumber || '').trim() || cleanPolicyId;
    const cleanHawksoftPolicyId = (hawksoftPolicyId || '').trim();
    const cleanCallType = (callType || 'Inbound').trim();

    // ── Step 2: Push pre-formatted log to HawkSoft (skip AI) ──
    if (preFormattedLog && typeof preFormattedLog === 'string' && preFormattedLog.trim()) {
      const logText = preFormattedLog.trim();
      console.log(`[HawkSoft Logger] ── PRE-FORMATTED PUSH ── clientNumber=${hawksoftClientId} policyId=${cleanPolicyId}`);

      const { hawksoftLogged, hawksoftStatus, hawksoftError } = await _pushToHawkSoft(
          logText, hawksoftClientId, cleanHawksoftPolicyId, cleanCallType
      );

      return res.status(200).json({
        formattedLog: logText,
        hawksoftLogged,
        hawksoftStatus,
        hawksoftError,
        policyId: cleanPolicyId,
        hawksoftPolicyId: cleanHawksoftPolicyId,
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

    const cleanInitials = (agentInitials || '').trim().toUpperCase();
    const cleanActivityType = (activityType || '').trim();
    const cleanGlossary = (glossary || '').trim().substring(0, 500);
    const userMessage = `Policy/Client ID: ${cleanPolicyId}
Call Type: ${cleanCallType}${cleanActivityType ? `\nActivity: ${cleanActivityType}` : ''}
Timestamp: ${timestamp} PST${cleanInitials ? `\nAgent: ${cleanInitials}` : ''}${cleanGlossary ? `\n\nAgency glossary (use these when interpreting shorthand):\n${cleanGlossary}` : ''}
Agent's shorthand notes:
${cleanNotes}`;

    console.log(`[HawkSoft Logger] Formatting notes for policy ${cleanPolicyId} (${cleanNotes.length} chars)`);

    let formattedLog = await ai.ask(SYSTEM_PROMPT, userMessage, {
      temperature: 0.3,
      maxTokens: 2048
    });

    if (!formattedLog || !formattedLog.trim()) {
      throw new Error('AI returned empty response');
    }

    // ── Post-processing: ensure initials are on RE: line (deterministic) ──
    if (cleanInitials) {
      formattedLog = formattedLog.trim();
      formattedLog = formattedLog.replace(new RegExp(`\\s*[—–-]\\s*${cleanInitials}\\s*$`, 'gm'), (match, offset) => {
        const lineStart = formattedLog.lastIndexOf('\n', offset - 1);
        return lineStart <= 0 ? match : '';
      });
      const lines = formattedLog.split('\n');
      if (lines[0] && lines[0].startsWith('RE:') && !lines[0].includes(cleanInitials)) {
        lines[0] = lines[0].trimEnd() + ` — ${cleanInitials}`;
      }
      formattedLog = lines.join('\n');
    }

    // ── If formatOnly, return preview without pushing ──
    if (formatOnly) {
      return res.status(200).json({
        formattedLog: formattedLog.trim(),
        hawksoftLogged: false,
        policyId: cleanPolicyId,
        hawksoftPolicyId: cleanHawksoftPolicyId,
        clientNumber: hawksoftClientId,
        callType: cleanCallType
      });
    }

    // ── Push AI-formatted log to HawkSoft ──
    console.log(`[HawkSoft Logger] ── AI-FORMATTED PUSH ── clientNumber=${hawksoftClientId} policyId=${cleanPolicyId}`);
    const { hawksoftLogged, hawksoftStatus, hawksoftError } = await _pushToHawkSoft(
        formattedLog.trim(), hawksoftClientId, cleanHawksoftPolicyId, cleanCallType
    );

    return res.status(200).json({
      formattedLog: formattedLog.trim(),
      hawksoftLogged,
      hawksoftStatus,
      hawksoftError,
      policyId: cleanPolicyId,
      hawksoftPolicyId: cleanHawksoftPolicyId,
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
