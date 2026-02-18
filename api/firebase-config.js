/**
 * Firebase Config API Endpoint
 * Returns Firebase client configuration from Vercel environment variables.
 * 
 * Required env vars (set in Vercel Dashboard → Settings → Environment Variables):
 *   FIREBASE_API_KEY
 *   FIREBASE_AUTH_DOMAIN
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_STORAGE_BUCKET
 *   FIREBASE_MESSAGING_SENDER_ID
 *   FIREBASE_APP_ID
 */

import { securityMiddleware } from './_security.js';

export default securityMiddleware(async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const config = {
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.FIREBASE_APP_ID || ''
    };

    // Don't expose empty config — return 404 if not configured
    if (!config.apiKey || !config.projectId) {
        return res.status(404).json({
            error: 'Firebase not configured',
            hint: 'Set FIREBASE_API_KEY and FIREBASE_PROJECT_ID in Vercel environment variables'
        });
    }

    // Cache for 1 hour (config rarely changes)
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(config);
});
