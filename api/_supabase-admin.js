/**
 * api/_supabase-admin.js — Shared service-role helpers for server-side endpoints.
 *
 * Centralizes the Supabase admin client + the `user_blobs` shape so /api/*
 * endpoints (Stripe webhook, reminders-sweep cron, etc.) don't each reinvent
 * the wiring. Mirrors the shape `js/supabase-sync.js` writes from the client,
 * so client reads via SupabaseSync.pullBlob(docKey) just work.
 *
 * Env requirements:
 *   SUPABASE_URL              — same value as /api/config?type=supabase-public
 *   SUPABASE_SERVICE_ROLE_KEY — server-only; NEVER exposed to the client.
 *                                Bypasses RLS for cross-user reads/writes
 *                                (cron sweeps, webhook subscription writes).
 *
 * Row shape (matches `public.user_blobs`):
 *   user_id   uuid           — Supabase auth user id
 *   doc_key   text           — e.g. 'reminders', 'subscription', 'dailyDigest'
 *   ciphertext text          — JSON blob (plaintext for unencrypted docs,
 *                              v=2 AAD envelope for encrypted docs)
 *   updated_at timestamptz   — auto-stamped by a BEFORE UPDATE trigger
 *   device_id  text          — best-effort attribution; nullable
 *
 * This helper only writes/reads PLAIN JSON payloads. Encrypted blobs
 * (currentForm, reminders, etc.) are written by the client via SupabaseSync
 * with the v=2 envelope and are NOT touched server-side — the server cannot
 * decrypt them without the user's vault key, by design.
 *
 * The server only writes the small handful of operational/metering docs that
 * the client expects in plaintext: `dailyDigest` (cron), `subscription`
 * (Stripe webhook), `rentcastUsage` (legacy migration path), etc.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Returns a Supabase client authenticated with the service role key, or null
 * if the env vars aren't set. Service role bypasses RLS — only use server-side.
 */
export function getServiceRoleClient() {
    const url = (process.env.SUPABASE_URL || '').trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

/**
 * Upsert a JSON payload into `user_blobs` for a given (user_id, doc_key).
 * `payload` is serialized to JSON.stringify before write — the client reads
 * it back via SupabaseSync.pullBlob(docKey) which returns `{ ciphertext }`
 * and JSON.parse()s the string.
 *
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function upsertUserBlob(userId, docKey, payload) {
    if (!userId || !docKey) return { ok: false, error: 'userId and docKey required' };
    const client = getServiceRoleClient();
    if (!client) return { ok: false, error: 'Supabase service role not configured' };

    const serialized = (typeof payload === 'string') ? payload : JSON.stringify(payload);

    const { error } = await client
        .from('user_blobs')
        .upsert(
            { user_id: userId, doc_key: docKey, ciphertext: serialized, device_id: 'server' },
            { onConflict: 'user_id,doc_key' }
        );

    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true };
}

/**
 * Read a single `user_blobs` row. Returns `null` when no row exists.
 *
 * @returns {Promise<{ ciphertext: string, updated_at: string, device_id: string } | null>}
 */
export async function getUserBlob(userId, docKey) {
    if (!userId || !docKey) return null;
    const client = getServiceRoleClient();
    if (!client) return null;

    const { data, error } = await client
        .from('user_blobs')
        .select('ciphertext, updated_at, device_id')
        .eq('user_id', userId)
        .eq('doc_key', docKey)
        .maybeSingle();

    if (error) {
        console.warn(`[supabase-admin] getUserBlob(${docKey}) error:`, error.message);
        return null;
    }
    return data || null;
}

/**
 * List all `user_blobs` rows for a given doc_key, across all users. Used by
 * server-side sweeps (the reminders cron) that need to fan out work to every
 * user who has a particular doc.
 *
 * Returns the raw rows — caller is responsible for parsing the `ciphertext`
 * field. For encrypted docs (reminders, currentForm, etc.) the value will be
 * a v=2 envelope; for plaintext docs it'll be JSON.
 *
 * @returns {Promise<Array<{ user_id: string, ciphertext: string, updated_at: string }>>}
 */
export async function listUserBlobsByDocKey(docKey) {
    if (!docKey) return [];
    const client = getServiceRoleClient();
    if (!client) return [];

    const { data, error } = await client
        .from('user_blobs')
        .select('user_id, ciphertext, updated_at')
        .eq('doc_key', docKey);

    if (error) {
        console.warn(`[supabase-admin] listUserBlobsByDocKey(${docKey}) error:`, error.message);
        return [];
    }
    return Array.isArray(data) ? data : [];
}
