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
 * Convert a JS value into Firestore REST field format.
 * Supports: string, boolean, number (int/double), null, array, plain object (map).
 */
function toFirestoreValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'boolean')            return { booleanValue: value };
    if (typeof value === 'number') {
        return Number.isInteger(value)
            ? { integerValue: String(value) }
            : { doubleValue: value };
    }
    if (typeof value === 'string')             return { stringValue: value };
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(toFirestoreValue) } };
    }
    if (typeof value === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(value)) fields[k] = toFirestoreValue(v);
        return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
}

/**
 * Convert a plain JS object into a Firestore `fields` map.
 * Supports nested arrays and objects (via toFirestoreValue).
 */
function toFirestoreFields(obj) {
    const fields = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) continue;
        fields[key] = toFirestoreValue(value);
    }
    return fields;
}

// ── Document parser ─────────────────────────────────────────────────────

/**
 * Recursively convert a Firestore REST value object into a plain JS value.
 * Handles: string, boolean, integer, double, null, timestamp, array, map.
 */
export function parseFirestoreValue(val) {
    if (!val) return null;
    if ('stringValue'    in val) return val.stringValue;
    if ('booleanValue'   in val) return val.booleanValue;
    if ('integerValue'   in val) return Number(val.integerValue);
    if ('doubleValue'    in val) return val.doubleValue;
    if ('nullValue'      in val) return null;
    if ('timestampValue' in val) return val.timestampValue; // ISO 8601 string
    if ('arrayValue'     in val) return (val.arrayValue.values || []).map(parseFirestoreValue);
    if ('mapValue'       in val) {
        const out = {};
        const fields = val.mapValue.fields || {};
        for (const [k, v] of Object.entries(fields)) out[k] = parseFirestoreValue(v);
        return out;
    }
    return null;
}

/**
 * Convert a Firestore REST document response into a plain JS object.
 * Extracts the UID from the document path and adds it as `uid`.
 * Handles nested maps and arrays (unlike the original primitive-only parser).
 */
export function parseFirestoreDoc(doc) {
    if (!doc || !doc.fields) return null;
    const result = {};
    for (const [key, val] of Object.entries(doc.fields)) {
        result[key] = parseFirestoreValue(val);
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

// Module-level token cache so multi-call jobs (e.g. crons iterating users)
// don't JWT-exchange on every Firestore request. Tokens are valid for 1 h.
let _adminTokenCache = { token: null, expiresAt: 0 };

async function _getAdminToken() {
    const now = Date.now();
    if (_adminTokenCache.token && _adminTokenCache.expiresAt - now > 60_000) {
        return _adminTokenCache.token;
    }
    const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!saKey) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not configured');

    const sa = JSON.parse(Buffer.from(saKey, 'base64').toString());
    const token = await getServiceAccountToken(sa);
    _adminTokenCache = { token, expiresAt: now + 3600_000 };
    return token;
}

/**
 * Patch a Firestore document using a service account (for use in webhooks/background jobs).
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY env var (base64-encoded service account JSON).
 * Returns true on success.
 */
export async function firestoreSetAsAdmin(path, fields) {
    const token = await _getAdminToken();
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

/**
 * Fetch a single Firestore document using a service account.
 * Returns the raw Firestore document object, or null if the doc doesn't exist
 * or on any failure (caller can treat both as "no data").
 */
export async function firestoreGetAsAdmin(path) {
    const token = await _getAdminToken();
    const resp = await fetch(`${FIRESTORE_BASE}/${path}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return resp.json();
}

/**
 * List all documents in a Firestore collection using a service account.
 * Handles pagination automatically (pageSize=100 per request).
 * Returns an array of raw Firestore document objects (may be empty).
 */
export async function firestoreListAsAdmin(collectionPath) {
    const token = await _getAdminToken();
    const docs = [];
    let pageToken = null;

    do {
        const url = new URL(`${FIRESTORE_BASE}/${collectionPath}`);
        url.searchParams.set('pageSize', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const resp = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!resp.ok) break;
        const data = await resp.json();
        if (data.documents) docs.push(...data.documents);
        pageToken = data.nextPageToken || null;
    } while (pageToken);

    return docs;
}
