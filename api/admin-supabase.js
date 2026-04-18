/**
 * Admin API (Supabase flavor) — Path B Phase 3
 *
 * Mirrors api/admin.js but against Supabase Auth users instead of Firebase.
 * Uses two separate Supabase contexts per request:
 *
 *   1. Anon-key client bound to the caller's access token — used to verify
 *      identity (getUser) and to read their app_metadata.is_admin flag.
 *      Respects Row Level Security and cannot escalate privilege.
 *
 *   2. Service-role admin client — used ONLY after the caller has been
 *      confirmed as an admin, and ONLY to mutate target users' metadata via
 *      auth.admin.updateUserById / listUsers. The service-role key is a
 *      server-only secret; it is never returned to the browser.
 *
 * Routes via ?action= query parameter (same shape as /api/admin):
 *   GET  /api/admin-supabase?action=list     → List all Supabase users
 *   POST /api/admin-supabase?action=update   → Patch a user's app_metadata
 *
 * Required env vars:
 *   SUPABASE_URL              (browser-safe, same value as /api/config?type=supabase-public)
 *   SUPABASE_ANON_KEY         (browser-safe)
 *   SUPABASE_SERVICE_ROLE_KEY (server only — NEVER exposed to the client)
 */

import { securityMiddleware } from '../lib/security.js';
import { createClient } from '@supabase/supabase-js';

// ── Supabase client factories ───────────────────────────────────────────

function getServiceRoleClient() {
    const url = (process.env.SUPABASE_URL || '').trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

function getCallerClient(accessToken) {
    const url = (process.env.SUPABASE_URL || '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
    if (!url || !anonKey || !accessToken) return null;
    return createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
}

// ── Admin verification ──────────────────────────────────────────────────

/**
 * Verify the caller is a Supabase-authenticated admin.
 *
 * Returns { uid, email } on success, or null on failure.
 *
 * The is_admin flag is read from app_metadata — which, unlike user_metadata,
 * can only be written by the service role. A malicious client can mutate
 * their own user_metadata via the standard auth.updateUser API, so we DO NOT
 * trust user_metadata.is_admin here.
 */
async function verifySupabaseAdmin(req) {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!accessToken) return null;

    const callerClient = getCallerClient(accessToken);
    if (!callerClient) return null;

    const { data, error } = await callerClient.auth.getUser();
    if (error || !data || !data.user) return null;

    const appMeta = data.user.app_metadata || {};
    if (appMeta.is_admin !== true) return null;
    if (appMeta.is_blocked === true) return null;

    return { uid: data.user.id, email: data.user.email || '' };
}

// ── Handlers ────────────────────────────────────────────────────────────

async function handleListUsers(admin, res, requestId) {
    const service = getServiceRoleClient();
    if (!service) {
        return res.status(500).json({ error: 'Supabase service role not configured.', requestId });
    }
    try {
        // Page through all users. The default perPage is 50; 1,000 is the
        // ceiling Supabase supports in one call. Altech has 5 users, so one
        // page is plenty, but the loop keeps us honest if the count grows.
        let all = [];
        let page = 1;
        while (true) {
            const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
            if (error) throw error;
            if (!data || !Array.isArray(data.users) || data.users.length === 0) break;
            all = all.concat(data.users);
            if (data.users.length < 1000) break;
            page += 1;
        }

        const users = all.map(u => ({
            uid: u.id,
            email: u.email || '',
            displayName: (u.user_metadata && u.user_metadata.display_name) || '',
            isAdmin: !!(u.app_metadata && u.app_metadata.is_admin === true),
            isBlocked: !!(u.app_metadata && u.app_metadata.is_blocked === true),
            createdAt: u.created_at || '',
            lastLogin: u.last_sign_in_at || '',
        }));
        return res.status(200).json({ users, requestId });
    } catch (e) {
        console.error(`[AdminSupabase] List users failed [${requestId}]:`, e.message);
        return res.status(500).json({ error: 'Failed to list users.', requestId });
    }
}

async function handleUpdateUser(admin, req, res, requestId) {
    const service = getServiceRoleClient();
    if (!service) {
        return res.status(500).json({ error: 'Supabase service role not configured.', requestId });
    }
    try {
        const { targetUid, isAdmin, isBlocked } = req.body || {};
        if (!targetUid || typeof targetUid !== 'string') {
            return res.status(400).json({ error: 'targetUid is required.', requestId });
        }
        if (targetUid === admin.uid && isBlocked === true) {
            return res.status(400).json({ error: 'You cannot block yourself.', requestId });
        }
        if (targetUid === admin.uid && isAdmin === false) {
            return res.status(400).json({ error: 'You cannot remove your own admin access.', requestId });
        }

        // Whitelist: we only ever patch these two flags. Reject any unexpected
        // fields a caller might try to smuggle in.
        const appMeta = {};
        if (typeof isAdmin === 'boolean')   appMeta.is_admin = isAdmin;
        if (typeof isBlocked === 'boolean') appMeta.is_blocked = isBlocked;
        if (Object.keys(appMeta).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update.', requestId });
        }

        // Pull current metadata so we merge rather than overwrite sibling keys.
        const { data: existing, error: readErr } = await service.auth.admin.getUserById(targetUid);
        if (readErr || !existing || !existing.user) {
            return res.status(404).json({ error: 'User not found.', requestId });
        }
        const merged = { ...(existing.user.app_metadata || {}), ...appMeta };

        const { data, error } = await service.auth.admin.updateUserById(targetUid, { app_metadata: merged });
        if (error) throw error;

        console.log(`[AdminSupabase] ${admin.email} updated user ${targetUid}:`, appMeta, `[${requestId}]`);
        return res.status(200).json({ success: true, updated: appMeta, user: { uid: data.user.id }, requestId });
    } catch (e) {
        console.error(`[AdminSupabase] Update user failed [${requestId}]:`, e.message);
        return res.status(500).json({ error: 'Failed to update user.', requestId });
    }
}

// ── Router ──────────────────────────────────────────────────────────────

export default securityMiddleware(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const action = req.query?.action || req.url?.split('action=')[1]?.split('&')[0] || '';

    const admin = await verifySupabaseAdmin(req);
    if (!admin) {
        return res.status(403).json({ error: 'Admin access required.', requestId });
    }

    switch (action) {
        case 'list':
            if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed', requestId });
            return handleListUsers(admin, res, requestId);

        case 'update':
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', requestId });
            return handleUpdateUser(admin, req, res, requestId);

        default:
            return res.status(400).json({ error: `Unknown action: ${action}`, requestId });
    }
});
