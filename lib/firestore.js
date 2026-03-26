/**
 * lib/firestore.js — Shared Firestore REST utility
 *
 * Lightweight Firestore REST helpers used across serverless API routes.
 * Eliminates duplicated implementations in admin.js and stripe.js.
 *
 * Two auth modes:
 *   - User ID token  (firestoreGet, firestoreSet, firestoreList)
 *   - Service account (firestoreSetAsAdmin) — used by Stripe webhook
 *
 * Usage:
 *   import { firestoreGet, firestoreSet, firestoreList, firestoreSetAsAdmin, parseFirestoreDoc } from '../lib/firestore.js';
 */

const FIRESTORE_PROJECT = process.env.FIREBASE_PROJECT_ID || 'altech-app-5f3d0';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;

// ── Field value serialiser ──────────────────────────────────────────────

/**
 * Convert a plain JS object into Firestore field format.
 * Supports: string, boolean, number.
 */
function toFirestoreFields(obj) {
    const fields = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'boolean') {
            fields[key] = { booleanValue: value };
        } else if (typeof value === 'number') {
            fields[key] = { integerValue: String(value) };
        } else if (typeof value === 'string') {
            fields[key] = { stringValue: value };
        }
        // null / undefined are intentionally skipped
    }
    return fields;
}

// ── Document parser ─────────────────────────────────────────────────────

/**
 * Convert a Firestore REST document response into a plain JS object.
 * Extracts the UID from the document path and adds it as `uid`.
 */
export function parseFirestoreDoc(doc) {
    if (!doc || !doc.fields) return null;
    const result = {};
    for (const [key, val] of Object.entries(doc.fields)) {
        result[key] =
            val.stringValue  ??
            val.booleanValue ??
            (val.integerValue !== undefined ? Number(val.integerValue) : undefined) ??
            val.doubleValue  ??
            val.nullValue    ??
            null;
    }
    // Attach UID from document path (e.g. ".../users/abc123" → "abc123")
    if (doc.name) {
        result.uid = doc.name.split('/').pop();
    }
    return result;
}

// ── User-token operations ───────────────────────────────────────────────

/**
 * Fetch a single Firestore document using a caller's ID token.
 * Returns the raw Firestore document object, or null on failure.
 */
export async function firestoreGet(path, idToken) {
    const resp = await fetch(`${FIRESTORE_BASE}/${path}`, {
        headers: { 'Authorization': `Bearer ${idToken}` },
    });
    if (!resp.ok) return null;
    return resp.json();
}

/**
 * Patch (merge) a Firestore document using a caller's ID token.
 * Only the provided fields are updated (updateMask).
 * Returns true on success.
 */
export async function firestoreSet(path, fields, idToken) {
    const firestoreFields = toFirestoreFields(fields);
    const maskParams = Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');

    const resp = await fetch(`${FIRESTORE_BASE}/${path}?${maskParams}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: firestoreFields }),
    });
    return resp.ok;
}

/**
 * List all documents in a Firestore collection using a caller's ID token.
 * Handles pagination automatically (pageSize=100 per request).
 * Returns an array of raw Firestore document objects.
 */
export async function firestoreList(collectionPath, idToken) {
    const docs = [];
    let pageToken = null;

    do {
        const url = new URL(`${FIRESTORE_BASE}/${collectionPath}`);
        url.searchParams.set('pageSize', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const resp = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${idToken}` },
        });

        if (!resp.ok) break;
        const data = await resp.json();
        if (data.documents) docs.push(...data.documents);
        pageToken = data.nextPageToken || null;
    } while (pageToken);

    return docs;
}

// ── Service-account operations ──────────────────────────────────────────

/**
 * Generate a short-lived Google OAuth2 access token from a service account.
 * Used by server-side operations that don't have a user ID token (e.g. Stripe webhooks).
 */
async function getServiceAccountToken(serviceAccount) {
    const { createSign } = await import('crypto');
    const now = Math.floor(Date.now() / 1000);

    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        iss:   serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud:   'https://oauth2.googleapis.com/token',
        iat:   now,
        exp:   now + 3600,
    })).toString('base64url');

    const signInput = `${header}.${payload}`;
    const sign = createSign('RSA-SHA256');
    sign.update(signInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');
    const jwt = `${signInput}.${signature}`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResp.ok) throw new Error('Service account token exchange failed');
    const tokenData = await tokenResp.json();
    return tokenData.access_token;
}

/**
 * Patch a Firestore document using a service account (for use in webhooks/background jobs).
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY env var (base64-encoded service account JSON).
 * Returns true on success.
 */
export async function firestoreSetAsAdmin(path, fields) {
    const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!saKey) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not configured');

    const sa = JSON.parse(Buffer.from(saKey, 'base64').toString());
    const token = await getServiceAccountToken(sa);

    const firestoreFields = toFirestoreFields(fields);
    const maskParams = Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');

    const resp = await fetch(`${FIRESTORE_BASE}/${path}?${maskParams}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: firestoreFields }),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Firestore PATCH failed: ${errText}`);
    }
    return true;
}
