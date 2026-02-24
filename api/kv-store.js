/**
 * Vercel KV Storage API (Redis Cloud via ioredis)
 * Provides a key-value store for persisting CGL annotations, email drafts, 
 * export history, and other user data across sessions.
 * 
 * On Vercel: Uses Redis Cloud (via REDIS_URL env var from Vercel Storage)
 * Locally: Returns 501 — clients fall back to localStorage/IDB/disk
 * 
 * Env var:
 *   REDIS_URL — set automatically by Vercel Redis integration
 *              Format: redis://default:PASSWORD@HOST:PORT
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

import Redis from 'ioredis';
import { securityMiddleware, requireAuth } from '../lib/security.js';

// Reuse connection across warm function invocations
let client = null;

function getRedisClient() {
    if (client && client.status === 'ready') return client;

    const url = process.env.REDIS_URL;
    if (!url) return null;

    client = new Redis(url, {
        maxRetriesPerRequest: 2,
        connectTimeout: 5000,
        commandTimeout: 5000,
        lazyConnect: true,          // Don't connect until first command
        enableOfflineQueue: true,
        retryStrategy(times) {
            if (times > 2) return null; // Give up after 2 retries
            return Math.min(times * 200, 1000);
        }
    });

    client.on('error', (err) => {
        console.error('[KV Store] Redis connection error:', err.message);
    });

    return client;
}

async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Validate Redis is configured
    const redis = getRedisClient();
    if (!redis) {
        return res.status(501).json({
            error: 'Redis not configured',
            hint: 'Add REDIS_URL via Vercel Dashboard → Storage → Redis'
        });
    }

    // Prefix all Redis keys with the authenticated user's UID for per-user isolation
    const uid = req.uid;
    const keyPrefix = `uid:${uid}:`;

    // Allowed keys (prevent arbitrary key access)
    const ALLOWED_KEYS = ['cgl_state', 'cgl_cache', 'email_drafts', 'export_history'];

    try {
        // Ensure connected
        if (redis.status !== 'ready') {
            await redis.connect();
        }

        if (req.method === 'GET') {
            const key = req.query?.key;
            if (!key || !ALLOWED_KEYS.includes(key)) {
                return res.status(400).json({ error: 'Invalid key. Allowed: ' + ALLOWED_KEYS.join(', ') });
            }
            const result = await redis.get(keyPrefix + key);
            if (result === null || result === undefined) {
                return res.status(404).json({ error: 'Key not found', key });
            }
            // Parse JSON if stored as JSON
            let value = result;
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

            await redis.set(keyPrefix + key, serialized);
            return res.status(200).json({ ok: true, key, size: serialized.length });
        }

        if (req.method === 'DELETE') {
            const key = req.query?.key;
            if (!key || !ALLOWED_KEYS.includes(key)) {
                return res.status(400).json({ error: 'Invalid key. Allowed: ' + ALLOWED_KEYS.join(', ') });
            }
            await redis.del(keyPrefix + key);
            return res.status(200).json({ ok: true, key });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('[KV Store] Error:', err.message, err.stack);
        return res.status(500).json({ 
            error: 'Redis operation failed',
            message: err.message
        });
    }
}

export default securityMiddleware(requireAuth(handler));
