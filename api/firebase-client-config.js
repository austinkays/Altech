/**
 * Firebase Config API Endpoint
 * 
 * Serves Firebase client configuration from Vercel environment variables.
 * This avoids hardcoding Firebase credentials in client-side JavaScript.
 * 
 * Environment variables (set in Vercel Dashboard):
 *   FIREBASE_API_KEY
 *   FIREBASE_AUTH_DOMAIN
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_STORAGE_BUCKET
 *   FIREBASE_MESSAGING_SENDER_ID
 *   FIREBASE_APP_ID
 * 
 * Note: Firebase client config is NOT secret — it's designed to be public.
 * This endpoint exists to enable config changes without code deploys.
 */

import { securityMiddleware } from './_security.js';

async function handler(req, res) {
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

    // Only return config if at least apiKey and projectId are set
    if (!config.apiKey || !config.projectId) {
        return res.status(404).json({
            error: 'Firebase config not set in environment variables',
            hint: 'Set FIREBASE_API_KEY and FIREBASE_PROJECT_ID in Vercel Dashboard',
        });
    }

    // Cache for 5 minutes — config rarely changes
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json(config);
}

export default securityMiddleware(handler);
