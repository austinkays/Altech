/**
 * Stripe Customer Portal Session
 * 
 * POST /api/customer-portal
 * Auth: Required (Firebase ID token)
 * 
 * Creates a Stripe Customer Portal session so users can manage
 * their subscription, update payment methods, and cancel.
 * 
 * Environment variables:
 *   STRIPE_SECRET_KEY — Stripe secret key
 *   APP_URL           — Base URL for return redirect
 */

import Stripe from 'stripe';
import { securityMiddleware, requireAuth } from './_security.js';

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
        return res.status(503).json({ error: 'Stripe not configured' });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });
    const email = req.userEmail;
    const appUrl = process.env.APP_URL || 'https://altech-insurance.vercel.app';

    try {
        // Find customer by email
        const customers = await stripe.customers.list({ email, limit: 1 });

        if (customers.data.length === 0) {
            return res.status(404).json({ error: 'No billing account found' });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: customers.data[0].id,
            return_url: appUrl,
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[Portal] Error:', err.message);
        return res.status(500).json({ error: 'Failed to create portal session' });
    }
}

export default securityMiddleware(requireAuth(handler));
