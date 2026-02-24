/**
 * Config & Utilities — Unified Endpoint
 * 
 * Routes via ?type= query parameter:
 *   GET  /api/config?type=firebase    → Firebase client config (no auth)
 *   GET  /api/config?type=keys        → Places + Gemini API keys (auth required)
 *   POST /api/config?type=phonetics   → Name pronunciation via Gemini (no auth, rate-limited by securityMiddleware)
 *   POST /api/config?type=bugreport   → Create GitHub Issue from in-app bug report (auth required)
 *   POST /api/config?type=anthropic   → Proxy to Anthropic Messages API (user supplies their own key)
 * 
 * Environment variables:
 *   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
 *   FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID
 *   PLACES_API_KEY, GOOGLE_API_KEY
 *   GITHUB_ISSUES_TOKEN — GitHub PAT with Issues write scope
 */

import { securityMiddleware, verifyFirebaseToken, sanitizeInput } from '../lib/security.js';

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

const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER || 'austinkays';
const GITHUB_REPO  = process.env.GITHUB_REPO_NAME  || 'Altech';

const CATEGORY_LABELS = {
    bug:     ['bug'],
    ui:      ['bug', 'ui'],
    feature: ['enhancement'],
    question:['question'],
    other:   ['triage'],
};

async function handleBugReport(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Require auth
    const user = await verifyFirebaseToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required.', requestId: req.requestId });
    }

    const token = (process.env.GITHUB_ISSUES_TOKEN || '').trim();
    if (!token) {
        return res.status(500).json({
            error: 'GitHub Issues integration not configured',
            hint: 'Set GITHUB_ISSUES_TOKEN in Vercel environment variables',
            requestId: req.requestId,
        });
    }

    const { title, description, category, steps, screenshot, userAgent, currentPage, appVersion } = req.body || {};

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
        return res.status(400).json({ error: 'Title is required (min 3 characters)', requestId: req.requestId });
    }

    const safeTitle       = sanitizeInput(title, 120);
    const safeDescription = sanitizeInput(description || '', 2000);
    const safeSteps       = sanitizeInput(steps || '', 1000);
    const safeCategory    = CATEGORY_LABELS[category] ? category : 'bug';
    const safePage        = sanitizeInput(currentPage || 'unknown', 100);
    const safeVersion     = sanitizeInput(appVersion || 'unknown', 20);
    const safeUA          = sanitizeInput(userAgent || '', 300);

    const body = [
        `### Description`,
        safeDescription || '_No description provided_',
        '',
        safeSteps ? `### Steps to Reproduce\n${safeSteps}` : '',
        '',
        `### Environment`,
        `| Field | Value |`,
        `|-------|-------|`,
        `| **Reporter** | ${user.email || 'unknown'} |`,
        `| **Page** | ${safePage} |`,
        `| **App Version** | ${safeVersion} |`,
        `| **User Agent** | ${safeUA} |`,
        `| **Timestamp** | ${new Date().toISOString()} |`,
        '',
        screenshot ? `### Screenshot\n![screenshot](${screenshot})` : '',
    ].filter(Boolean).join('\n');

    const labels = CATEGORY_LABELS[safeCategory] || ['bug'];

    try {
        const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify({ title: `[Bug Report] ${safeTitle}`, body, labels }),
        });

        if (!ghRes.ok) {
            const errData = await ghRes.json().catch(() => ({}));
            console.error(`[BugReport] GitHub API error: ${ghRes.status}`, errData.message, `[${req.requestId}]`);
            return res.status(502).json({ error: 'Failed to create issue on GitHub', detail: errData.message || ghRes.statusText, requestId: req.requestId });
        }

        const issue = await ghRes.json();
        console.log(`[BugReport] Created issue #${issue.number} by ${user.email} [${req.requestId}]`);
        return res.status(201).json({ success: true, issueNumber: issue.number, issueUrl: issue.html_url, requestId: req.requestId });
    } catch (err) {
        console.error(`[BugReport] Error:`, err.message, `[${req.requestId}]`);
        return res.status(500).json({ error: 'Internal error creating bug report', requestId: req.requestId });
    }
}

// ── Anthropic Proxy ─────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function handleAnthropic(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { model, system, messages, max_tokens, temperature, apiKey } = req.body || {};

    if (!apiKey) {
        return res.status(400).json({ error: 'Missing Anthropic API key' });
    }

    if (!messages || !messages.length) {
        return res.status(400).json({ error: 'Missing messages' });
    }

    const body = {
        model: model || 'claude-sonnet-4-20250514',
        messages,
        max_tokens: max_tokens || 4096
    };

    if (system) body.system = system;
    if (typeof temperature === 'number') body.temperature = temperature;

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data?.error || { message: `Anthropic API error (${response.status})` }
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('[config/anthropic] Error:', err);
        return res.status(500).json({ error: { message: err.message || 'Internal server error' } });
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
        case 'bugreport':
            return handleBugReport(req, res);
        case 'anthropic':
            return handleAnthropic(req, res);
        default:
            return res.status(400).json({ error: 'Missing or invalid type parameter. Use ?type=firebase|keys|phonetics|bugreport|anthropic' });
    }
}

export default securityMiddleware(router);
