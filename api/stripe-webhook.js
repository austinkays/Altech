/**
 * Stripe Webhook Handler
 * 
 * POST /api/stripe-webhook
 * Auth: Stripe signature verification (no Firebase auth required)
 * 
 * Processes Stripe subscription events and updates the user's plan
 * status in Firestore at users/{uid}/sync/subscription.
 * 
 * Handled events:
 *   - checkout.session.completed    → activate subscription
 *   - customer.subscription.updated → plan change / renewal
 *   - customer.subscription.deleted → cancel / expire
 *   - invoice.payment_failed        → mark payment issue
 * 
 * Environment variables:
 *   STRIPE_SECRET_KEY      — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET  — Webhook signing secret (whsec_...)
 *   FIREBASE_PROJECT_ID    — For Firestore REST API
 *   FIREBASE_SERVICE_ACCOUNT_KEY — Base64-encoded service account JSON
 */

import Stripe from 'stripe';

// Firestore REST API helper (avoids Firebase Admin SDK dependency)
async function updateFirestoreSubscription(uid, subData) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'altech-app-5f3d0';

    // Use service account for server-to-server auth if available
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

    // Convert to Firestore REST format
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
            headers: {
                'Content-Type': 'application/json',
                ...authHeader,
            },
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

// Minimal JWT generation for service account (avoids google-auth-library dependency)
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

export default async function handler(req, res) {
    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeKey || !webhookSecret) {
        return res.status(503).json({ error: 'Stripe webhook not configured' });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });

    // Verify webhook signature
    let event;
    try {
        const sig = req.headers['stripe-signature'];
        // Vercel provides raw body for signature verification
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
                if (!uid) {
                    console.warn('[Webhook] No firebaseUid in checkout session metadata');
                    break;
                }

                // Get subscription details
                const subscription = await stripe.subscriptions.retrieve(session.subscription);
                await updateFirestoreSubscription(uid, {
                    plan: 'pro',
                    active: true,
                    status: subscription.status,
                    stripeCustomerId: session.customer,
                    stripeSubscriptionId: subscription.id,
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
                    plan: isActive ? 'pro' : 'free',
                    active: isActive,
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
                    plan: 'free',
                    active: false,
                    status: 'canceled',
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
                    status: 'past_due',
                    updatedAt: new Date().toISOString(),
                });
                console.log(`[Webhook] Payment failed for uid=${uid}`);
                break;
            }

            default:
                console.log(`[Webhook] Unhandled event type: ${event.type}`);
        }
    } catch (err) {
        console.error(`[Webhook] Processing error for ${event.type}:`, err.message);
        // Return 200 to prevent Stripe retries for processing errors
    }

    return res.status(200).json({ received: true });
}
