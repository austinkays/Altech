/**
 * Stripe API — Unified Endpoint
 * 
 * Routes via ?action= query parameter:
 *   POST /api/stripe?action=checkout   → Create Checkout session (auth required)
 *   POST /api/stripe?action=portal     → Create Customer Portal session (auth required)
 *   POST /api/stripe?action=webhook    → Stripe webhook (signature verification)
 * 
 * Environment variables:
 *   STRIPE_SECRET_KEY      — Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_PRICE_ID        — Default price ID for the Pro plan
 *   APP_URL                — Base URL for success/cancel redirects
 *   STRIPE_WEBHOOK_SECRET  — Webhook signing secret (whsec_...)
 *   FIREBASE_PROJECT_ID    — For Firestore REST API (webhook)
 *   FIREBASE_SERVICE_ACCOUNT_KEY — Base64-encoded service account JSON (webhook)
 */

import Stripe from 'stripe';
import { securityMiddleware, requireAuth } from '../lib/security.js';

// ── Checkout Handler ────────────────────────────────────────────────────

async function handleCheckout(req, res, stripe) {
    const uid = req.uid;
    const email = req.userEmail;
    const priceId = req.body?.priceId || process.env.STRIPE_PRICE_ID;
    const appUrl = process.env.APP_URL || 'https://altech.agency';

    if (!priceId) {
        return res.status(400).json({ error: 'No price ID configured' });
    }

    try {
        let customerId = null;
        const existingCustomers = await stripe.customers.list({ limit: 1, email });

        if (existingCustomers.data.length > 0) {
            customerId = existingCustomers.data[0].id;
        } else {
            const customer = await stripe.customers.create({
                email,
                metadata: { firebaseUid: uid },
            });
            customerId = customer.id;
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/?checkout=cancelled`,
            subscription_data: { metadata: { firebaseUid: uid } },
            metadata: { firebaseUid: uid },
            allow_promotion_codes: true,
        });

        return res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (err) {
        console.error(`[Checkout] Error for uid=${uid}:`, err.message);
        return res.status(500).json({ error: 'Failed to create checkout session' });
    }
}

// ── Portal Handler ──────────────────────────────────────────────────────

async function handlePortal(req, res, stripe) {
    const email = req.userEmail;
    const appUrl = process.env.APP_URL || 'https://altech.agency';

    try {
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

// ── Webhook Handler ─────────────────────────────────────────────────────

async function updateFirestoreSubscription(uid, subData) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'altech-app-5f3d0';

    let authHeader = {};
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString());
            const token = await getServiceAccountToken(sa);
            authHeader = { 'Authorization': `Bearer ${token}` };
        } catch (e) {
            console.error('[Webhook] Service account auth failed:', e.message);
            return false;
        }
    }

    const docPath = `users/${uid}/sync/subscription`;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`;

    const fields = {};
    for (const [key, value] of Object.entries(subData)) {
        if (typeof value === 'string') {
            fields[key] = { stringValue: value };
        } else if (typeof value === 'boolean') {
            fields[key] = { booleanValue: value };
        } else if (typeof value === 'number') {
            fields[key] = { integerValue: String(value) };
        }
    }

    try {
        const resp = await fetch(url + '?updateMask.fieldPaths=' + Object.keys(subData).join('&updateMask.fieldPaths='), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ fields }),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error(`[Webhook] Firestore update failed for uid=${uid}:`, errText);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`[Webhook] Firestore update error for uid=${uid}:`, e.message);
        return false;
    }
}

async function getServiceAccountToken(serviceAccount) {
    const crypto = await import('crypto');
    const now = Math.floor(Date.now() / 1000);

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    })).toString('base64url');

    const signInput = `${header}.${payload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');
    const jwt = `${signInput}.${signature}`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResp.ok) throw new Error('Token exchange failed');
    const tokenData = await tokenResp.json();
    return tokenData.access_token;
}

async function handleWebhook(req, res, stripe) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        return res.status(503).json({ error: 'Stripe webhook not configured' });
    }

    let event;
    try {
        const sig = req.headers['stripe-signature'];
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        console.error('[Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const uid = session.metadata?.firebaseUid;
                if (!uid) { console.warn('[Webhook] No firebaseUid in checkout session metadata'); break; }

                const subscription = await stripe.subscriptions.retrieve(session.subscription);
                await updateFirestoreSubscription(uid, {
                    plan: 'pro', active: true, status: subscription.status,
                    stripeCustomerId: session.customer, stripeSubscriptionId: subscription.id,
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                    updatedAt: new Date().toISOString(),
                });
                console.log(`[Webhook] Activated pro plan for uid=${uid}`);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const uid = subscription.metadata?.firebaseUid;
                if (!uid) break;

                const isActive = ['active', 'trialing'].includes(subscription.status);
                await updateFirestoreSubscription(uid, {
                    plan: isActive ? 'pro' : 'free', active: isActive,
                    status: subscription.status,
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                    updatedAt: new Date().toISOString(),
                });
                console.log(`[Webhook] Subscription ${subscription.status} for uid=${uid}`);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const uid = subscription.metadata?.firebaseUid;
                if (!uid) break;

                await updateFirestoreSubscription(uid, {
                    plan: 'free', active: false, status: 'canceled',
                    updatedAt: new Date().toISOString(),
                });
                console.log(`[Webhook] Subscription canceled for uid=${uid}`);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const uid = invoice.subscription
                    ? (await stripe.subscriptions.retrieve(invoice.subscription)).metadata?.firebaseUid
                    : null;
                if (!uid) break;

                await updateFirestoreSubscription(uid, {
                    status: 'past_due', updatedAt: new Date().toISOString(),
                });
                console.log(`[Webhook] Payment failed for uid=${uid}`);
                break;
            }

            default:
                console.log(`[Webhook] Unhandled event type: ${event.type}`);
        }
    } catch (err) {
        console.error(`[Webhook] Processing error for ${event.type}:`, err.message);
    }

    return res.status(200).json({ received: true });
}

// ── Router ──────────────────────────────────────────────────────────────

async function router(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
        return res.status(503).json({ error: 'Stripe not configured' });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });
    const action = (req.query?.action || '').toLowerCase();

    switch (action) {
        case 'checkout':
            // Requires auth — wrap dynamically
            return securityMiddleware(requireAuth((r, s) => handleCheckout(r, s, stripe)))(req, res);
        case 'portal':
            return securityMiddleware(requireAuth((r, s) => handlePortal(r, s, stripe)))(req, res);
        case 'webhook':
            // Webhook uses Stripe signature, not Firebase auth
            return handleWebhook(req, res, stripe);
        default:
            return res.status(400).json({ error: 'Missing or invalid action parameter. Use ?action=checkout|portal|webhook' });
    }
}

export default router;
