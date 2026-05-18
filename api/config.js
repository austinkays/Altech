/**
 * Config & Utilities — Unified Endpoint
 *
 * Routes via ?type= query parameter:
 *   GET  /api/config?type=supabase-public  → Supabase URL + anon key (no auth; RLS enforces access)
 *   GET  /api/config?type=keys             → Places + Gemini API keys (auth required)
 *   POST /api/config?type=phonetics        → Name pronunciation via Gemini (auth required)
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   PLACES_API_KEY, GOOGLE_API_KEY
 */

import { securityMiddleware, verifyAuthToken, sanitizeInput } from '../lib/security.js';

// ── Supabase Public Config ──────────────────────────────────────────────
//
// Returns SUPABASE_URL + SUPABASE_ANON_KEY. Both are safe to ship to the
// browser — the anon key is a JWT with `role: anon` claims, and every table
// is protected by Row Level Security. Never return SUPABASE_SERVICE_ROLE_KEY
// from here; that key bypasses RLS and must only be used in server-side
// code with explicit server-only env var access.

function handleSupabasePublicConfig(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const url = (process.env.SUPABASE_URL || '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

    if (!url || !anonKey) {
        return res.status(404).json({
            error: 'Supabase config not set in environment variables',
            hint: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel Dashboard',
        });
    }

    // Defense-in-depth: the service-role key is similarly named and it would
    // be catastrophic to return it by accident. Explicitly reject any value
    // whose JWT payload claims `role: service_role`.
    if (_looksLikeServiceRoleKey(anonKey)) {
        console.error('[Supabase] SUPABASE_ANON_KEY env var appears to contain a service_role JWT. Refusing to serve.');
        return res.status(500).json({ error: 'Supabase anon key misconfigured' });
    }

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json({ url, anonKey });
}

function _looksLikeServiceRoleKey(jwt) {
    try {
        const payload = jwt.split('.')[1];
        if (!payload) return false;
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return decoded.role === 'service_role';
    } catch {
        return false;
    }
}

// ── API Keys (Places + Gemini) ──────────────────────────────────────────

async function handleKeys(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Require Firebase Auth — API keys must not be exposed to unauthenticated callers
    const user = await verifyAuthToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    const apiKey = (process.env.PLACES_API_KEY || '').trim();
    const geminiKey = (process.env.GOOGLE_API_KEY || '').trim();

    if (!apiKey && !geminiKey) {
        return res.status(500).json({ error: 'No API keys configured' });
    }

    // Rentcast pricing block — intake v2's overage modal reads the
    // per-call cost from here so a price change doesn't require a
    // client-side code edit. Falls back to defaults if the env vars
    // aren't set; v1's hardcoded "$0.50" string stays as the floor.
    // Clamp to non-negative values — a negative pricing string in env
    // would otherwise sail through `parseFloat` + `Number.isFinite`
    // and produce nonsense "${-0.50} per lookup" in the overage modal.
    const rentcastPerCallRaw = parseFloat(process.env.RENTCAST_PER_CALL_USD || '0.50');
    const rentcastFreeLimitRaw = parseInt(process.env.RENTCAST_FREE_LIMIT || '50', 10);
    const rentcastPricing = {
        perCall: Number.isFinite(rentcastPerCallRaw) && rentcastPerCallRaw >= 0 ? rentcastPerCallRaw : 0.50,
        freeMonthlyLimit: Number.isFinite(rentcastFreeLimitRaw) && rentcastFreeLimitRaw >= 0 ? rentcastFreeLimitRaw : 50,
        currency: 'USD',
    };

    return res.status(200).json({ apiKey, geminiKey, rentcastPricing });
}

// ── Name Phonetics ──────────────────────────────────────────────────────

async function handlePhonetics(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Require authentication to prevent unauthenticated API quota consumption
    const user = await verifyAuthToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const apiKey = (process.env.GOOGLE_API_KEY || '').trim();
        if (!apiKey) {
            return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
        }

        const rawFirst = sanitizeInput(req.body?.firstName || '', 80);
        const rawLast = sanitizeInput(req.body?.lastName || '', 80);
        if (!rawFirst && !rawLast) {
            return res.status(400).json({ error: 'First or last name is required' });
        }

        const prompt =
            'Generate phonetic pronunciations for the provided name(s).\n' +
            'Rules:\n' +
            '- Return plain ASCII with syllable breaks using hyphens.\n' +
            '- Use uppercase for the stressed syllable.\n' +
            '- If unsure, provide a best-effort guess.\n' +
            'Return ONLY JSON with this shape:\n' +
            '{"firstNamePhonetic":"","lastNamePhonetic":""}\n' +
            `First Name: ${rawFirst}\n` +
            `Last Name: ${rawLast}`;

        const payload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 256,
                response_mime_type: 'application/json',
                response_schema: {
                    type: 'object',
                    properties: {
                        firstNamePhonetic: { type: 'string' },
                        lastNamePhonetic: { type: 'string' }
                    },
                    required: ['firstNamePhonetic', 'lastNamePhonetic']
                }
            }
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();
        if (!response.ok) {
            return res.status(500).json({ error: data?.error?.message || 'Gemini request failed' });
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return res.status(500).json({ error: 'Malformed JSON from Gemini' });
        }

        return res.status(200).json({
            firstNamePhonetic: parsed.firstNamePhonetic || '',
            lastNamePhonetic: parsed.lastNamePhonetic || ''
        });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Server error' });
    }
}

// ── Router ──────────────────────────────────────────────────────────────

async function router(req, res) {
    const type = (req.query?.type || '').toLowerCase();

    switch (type) {
        case 'supabase-public':
            return handleSupabasePublicConfig(req, res);
        case 'keys':
            return handleKeys(req, res);
        case 'phonetics':
            return handlePhonetics(req, res);
        default:
            return res.status(400).json({ error: 'Missing or invalid type parameter. Use ?type=supabase-public|keys|phonetics' });
    }
}

export default securityMiddleware(router);
