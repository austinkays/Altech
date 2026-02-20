/**
 * Create Stripe Checkout Session
 * 
 * POST /api/create-checkout
 * Body: { priceId?: string }
 * Auth: Required (Firebase ID token)
 * 
 * Creates a Stripe Checkout session for the authenticated user.
 * If the user doesn't have a Stripe customer ID yet, one is created.
 * 
 * Environment variables:
 *   STRIPE_SECRET_KEY     — Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_PRICE_ID       — Default price ID for the Pro plan
 *   APP_URL               — Base URL for success/cancel redirects
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
    const uid = req.uid; // Set by requireAuth
    const email = req.userEmail; // Set by requireAuth
    const priceId = req.body?.priceId || process.env.STRIPE_PRICE_ID;
    const appUrl = process.env.APP_URL || 'https://altech-insurance.vercel.app';

    if (!priceId) {
        return res.status(400).json({ error: 'No price ID configured' });
    }

    try {
        // Check if user already has a Stripe customer ID stored in Firestore
        let customerId = null;
        
        // Search for existing customer by metadata (uid)
        const existingCustomers = await stripe.customers.list({
            limit: 1,
            email: email,
        });

        if (existingCustomers.data.length > 0) {
            customerId = existingCustomers.data[0].id;
        } else {
            // Create new Stripe customer
            const customer = await stripe.customers.create({
                email: email,
                metadata: { firebaseUid: uid },
            });
            customerId = customer.id;
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/?checkout=cancelled`,
            subscription_data: {
                metadata: { firebaseUid: uid },
            },
            metadata: { firebaseUid: uid },
            allow_promotion_codes: true,
        });

        return res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (err) {
        console.error(`[Checkout] Error for uid=${uid}:`, err.message);
        return res.status(500).json({ error: 'Failed to create checkout session' });
    }
}

export default securityMiddleware(requireAuth(handler));
