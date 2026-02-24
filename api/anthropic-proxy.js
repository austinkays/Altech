/**
 * Anthropic Proxy — Vercel Serverless Function
 * 
 * Proxies requests to the Anthropic Messages API to avoid CORS issues.
 * The user's API key is sent in the request body (never stored server-side).
 * 
 * POST /api/anthropic-proxy
 * Body: { model, system, messages, max_tokens, temperature, apiKey }
 * 
 * SECURITY:
 * - Requires Firebase authentication (Bearer token)
 * - Rate limited via securityMiddleware (20 req/min/IP, 60/min authenticated)
 * - CORS restricted to allowed origins only
 */

import { securityMiddleware, requireAuth } from '../lib/security.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { model, system, messages, max_tokens, temperature, apiKey } = req.body || {};

        if (!apiKey) {
            return res.status(400).json({ error: 'Missing Anthropic API key' });
        }

        // Validate API key is a non-empty string that looks like an Anthropic key
        if (typeof apiKey !== 'string' || !apiKey.startsWith('sk-ant-')) {
            return res.status(400).json({ error: 'Invalid Anthropic API key format' });
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
        console.error('[anthropic-proxy] Error:', err.message || 'Unknown error');
        return res.status(500).json({ error: { message: err.message || 'Internal server error' } });
    }
}

export default securityMiddleware(requireAuth(handler));
