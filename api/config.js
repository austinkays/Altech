/**
 * Config & Utilities — Unified Endpoint
 * 
 * Routes via ?type= query parameter:
 *   GET  /api/config?type=firebase    → Firebase client config (no auth)
 *   GET  /api/config?type=keys        → Places + Gemini API keys (auth required)
 *   POST /api/config?type=phonetics   → Name pronunciation via Gemini (no auth, rate-limited by securityMiddleware)
 * 
 * Environment variables:
 *   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
 *   FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID
 *   PLACES_API_KEY, GOOGLE_API_KEY
 */

import { securityMiddleware, verifyFirebaseToken, sanitizeInput } from './_security.js';

// ── Firebase Config ─────────────────────────────────────────────────────

function handleFirebaseConfig(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const config = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
    };

    if (!config.apiKey || !config.projectId) {
        return res.status(404).json({
            error: 'Firebase config not set in environment variables',
            hint: 'Set FIREBASE_API_KEY and FIREBASE_PROJECT_ID in Vercel Dashboard',
        });
    }

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json(config);
}

// ── API Keys (Places + Gemini) ──────────────────────────────────────────

async function handleKeys(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Require Firebase Auth — API keys must not be exposed to unauthenticated callers
    const user = await verifyFirebaseToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    const apiKey = (process.env.PLACES_API_KEY || '').trim();
    const geminiKey = (process.env.GOOGLE_API_KEY || '').trim();

    if (!apiKey && !geminiKey) {
        return res.status(500).json({ error: 'No API keys configured' });
    }

    return res.status(200).json({ apiKey, geminiKey });
}

// ── Name Phonetics ──────────────────────────────────────────────────────

async function handlePhonetics(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const apiKey = (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim();
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
        case 'firebase':
            return handleFirebaseConfig(req, res);
        case 'keys':
            return handleKeys(req, res);
        case 'phonetics':
            return handlePhonetics(req, res);
        default:
            return res.status(400).json({ error: 'Missing or invalid type parameter. Use ?type=firebase|keys|phonetics' });
    }
}

export default securityMiddleware(router);
