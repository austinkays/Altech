/**
 * Vercel KV Storage API (Upstash Redis REST)
 * Provides a key-value store for persisting CGL annotations, email drafts, 
 * export history, and other user data across sessions.
 * 
 * On Vercel: Uses Upstash Redis REST API — shared across all users
 * Locally: Returns 501 — clients fall back to localStorage/IDB/disk
 * 
 * Supports env vars:
 *   REDIS_URL (from Vercel Redis integration) — auto-parsed to REST endpoint
 *   KV_REST_API_URL + KV_REST_API_TOKEN (legacy/manual) — used directly
 * 
 * Routes:
 *   GET  /api/kv-store?key=cgl_state        → Get value
 *   POST /api/kv-store  { key, value }       → Set value
 *   DELETE /api/kv-store?key=cgl_state       → Delete key
 * 
 * Supported keys:
 *   cgl_state       — CGL annotations (verified, dismissed, notes)
 *   cgl_cache       — Policy cache from HawkSoft
 *   email_drafts    — Encrypted email draft history
 *   export_history  — Export log entries
 */

// Parse Upstash REST credentials from REDIS_URL or explicit env vars
function getRedisCredentials() {
    // Option 1: Explicit REST API vars (legacy @vercel/kv style)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        return {
            url: process.env.KV_REST_API_URL,
            token: process.env.KV_REST_API_TOKEN
        };
    }

    // Option 2: Parse from REDIS_URL (Vercel Redis integration)
    // Format: rediss://default:TOKEN@HOST:PORT
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return null;

    try {
        const parsed = new URL(redisUrl);
        const host = parsed.hostname; // e.g. "mature-lizard-12345.upstash.io"
        const token = parsed.password; // the REST API token
        if (!host || !token) return null;
        return {
            url: `https://${host}`,
            token
        };
    } catch {
        return null;
    }
}

// Execute a Redis command via Upstash REST API
async function redisCommand(creds, args) {
    const resp = await fetch(`${creds.url}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${creds.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(args)
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Upstash REST error ${resp.status}: ${text}`);
    }
    return resp.json();
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Validate Redis is configured
    const creds = getRedisCredentials();
    if (!creds) {
        return res.status(501).json({
            error: 'Redis not configured',
            hint: 'Add REDIS_URL via Vercel Dashboard → Storage → Redis, or set KV_REST_API_URL + KV_REST_API_TOKEN manually'
        });
    }

    // Allowed keys (prevent arbitrary key access)
    const ALLOWED_KEYS = ['cgl_state', 'cgl_cache', 'email_drafts', 'export_history'];

    try {
        if (req.method === 'GET') {
            const key = req.query?.key;
            if (!key || !ALLOWED_KEYS.includes(key)) {
                return res.status(400).json({ error: 'Invalid key. Allowed: ' + ALLOWED_KEYS.join(', ') });
            }
            const result = await redisCommand(creds, ['GET', key]);
            if (result.result === null || result.result === undefined) {
                return res.status(404).json({ error: 'Key not found', key });
            }
            // Upstash returns strings; parse JSON if stored as JSON
            let value = result.result;
            try { value = JSON.parse(value); } catch {}
            return res.status(200).json(value);
        }

        if (req.method === 'POST') {
            const { key, value } = req.body || {};
            if (!key || !ALLOWED_KEYS.includes(key)) {
                return res.status(400).json({ error: 'Invalid key. Allowed: ' + ALLOWED_KEYS.join(', ') });
            }
            if (value === undefined || value === null) {
                return res.status(400).json({ error: 'Missing value' });
            }

            // Size guard: 1MB max per key
            const serialized = JSON.stringify(value);
            if (serialized.length > 1_000_000) {
                return res.status(413).json({ error: `Value too large: ${(serialized.length / 1024).toFixed(0)}KB (max 1MB)` });
            }

            await redisCommand(creds, ['SET', key, serialized]);
            return res.status(200).json({ ok: true, key, size: serialized.length });
        }

        if (req.method === 'DELETE') {
            const key = req.query?.key;
            if (!key || !ALLOWED_KEYS.includes(key)) {
                return res.status(400).json({ error: 'Invalid key. Allowed: ' + ALLOWED_KEYS.join(', ') });
            }
            await redisCommand(creds, ['DEL', key]);
            return res.status(200).json({ ok: true, key });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('[KV Store] Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
