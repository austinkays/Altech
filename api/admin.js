/**
 * Admin API — User Management
 * 
 * Routes via ?action= query parameter:
 *   GET  /api/admin?action=list     → List all user profiles (admin only)
 *   POST /api/admin?action=update   → Update a user's role/blocked status (admin only)
 * 
 * Admin verification: Caller's Firebase ID token is verified, then their
 * Firestore profile doc (users/{uid}) is checked for isAdmin === true.
 * 
 * Requires: FIREBASE_API_KEY env var
 */

import { securityMiddleware, verifyFirebaseToken } from '../lib/security.js';
import { firestoreGet, firestoreSet, firestoreList, parseFirestoreDoc } from '../lib/firestore.js';

// ── Verify Admin ────────────────────────────────────────────────────────

/**
 * Verify the caller is an admin. Returns { uid, email, idToken } or null.
 * First verifies Firebase ID token, then checks Firestore profile for isAdmin.
 */
async function verifyAdmin(req) {
    // 1. Verify Firebase ID token
    const user = await verifyFirebaseToken(req);
    if (!user) return null;

    const uid = user.localId;
    const email = user.email;

    // 2. Extract raw ID token for Firestore REST calls
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) return null;

    // 3. Check Firestore profile for isAdmin flag
    const profileDoc = await firestoreGet(`users/${uid}`, idToken);
    const profile = parseFirestoreDoc(profileDoc);

    if (!profile || profile.isAdmin !== true) {
        return null; // Not admin
    }

    return { uid, email, idToken };
}

// ── Handlers ────────────────────────────────────────────────────────────

/**
 * GET /api/admin?action=list — List all user profiles
 */
async function handleListUsers(admin, res, requestId) {
    try {
        const docs = await firestoreList('users', admin.idToken);
        
        const users = docs
            .map(parseFirestoreDoc)
            .filter(Boolean)
            .map(u => ({
                uid: u.uid,
                email: u.email || '',
                displayName: u.displayName || '',
                isAdmin: u.isAdmin === true,
                isBlocked: u.isBlocked === true,
                createdAt: u.createdAt || '',
                lastLogin: u.lastLogin || '',
            }));

        return res.status(200).json({ users, requestId });
    } catch (e) {
        console.error(`[Admin] List users failed [${requestId}]:`, e.message);
        return res.status(500).json({ error: 'Failed to list users.', requestId });
    }
}

/**
 * POST /api/admin?action=update — Update a user's isAdmin or isBlocked status
 * Body: { targetUid, isAdmin?: boolean, isBlocked?: boolean }
 */
async function handleUpdateUser(admin, req, res, requestId) {
    try {
        const { targetUid, isAdmin, isBlocked } = req.body || {};

        if (!targetUid || typeof targetUid !== 'string') {
            return res.status(400).json({ error: 'targetUid is required.', requestId });
        }

        // Prevent admin from blocking themselves
        if (targetUid === admin.uid && isBlocked === true) {
            return res.status(400).json({ error: 'You cannot block yourself.', requestId });
        }

        // Prevent admin from removing their own admin
        if (targetUid === admin.uid && isAdmin === false) {
            return res.status(400).json({ error: 'You cannot remove your own admin access.', requestId });
        }

        // Build update fields
        const updates = {};
        if (typeof isAdmin === 'boolean') updates.isAdmin = isAdmin;
        if (typeof isBlocked === 'boolean') updates.isBlocked = isBlocked;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update.', requestId });
        }

        const success = await firestoreSet(`users/${targetUid}`, updates, admin.idToken);

        if (!success) {
            return res.status(500).json({ error: 'Failed to update user.', requestId });
        }

        console.log(`[Admin] ${admin.email} updated user ${targetUid}:`, updates, `[${requestId}]`);
        return res.status(200).json({ success: true, updated: updates, requestId });
    } catch (e) {
        console.error(`[Admin] Update user failed [${requestId}]:`, e.message);
        return res.status(500).json({ error: 'Failed to update user.', requestId });
    }
}

// ── Main Handler ────────────────────────────────────────────────────────

export default securityMiddleware(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const action = req.query?.action || req.url?.split('action=')[1]?.split('&')[0] || '';

    // All admin endpoints require admin verification
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(403).json({ error: 'Admin access required.', requestId });
    }

    switch (action) {
        case 'list':
            if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
            return handleListUsers(admin, res, requestId);

        case 'update':
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
            return handleUpdateUser(admin, req, res, requestId);

        default:
            return res.status(400).json({ error: `Unknown action: ${action}`, requestId });
    }
});
