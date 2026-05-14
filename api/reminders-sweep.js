/**
 * api/reminders-sweep.js — Daily reminder sweep (Vercel Cron)
 *
 * Runs at 13:00 UTC (06:00 PT) every day via vercel.json "crons" entry.
 * For each user with a `reminders` blob, filters tasks due today (dueDate
 * <= today and not completed today), writes a digest to the `dailyDigest`
 * blob. The client reads the digest on next open and surfaces a toast /
 * sidebar badge.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` on cron
 * invocations. Set CRON_SECRET in the Vercel project env.
 *
 * Phase D note: previously read/wrote Firestore docs at
 * `users/{uid}/sync/reminders` and `users/{uid}/sync/dailyDigest`. Now
 * reads/writes Supabase `user_blobs` with doc_key `'reminders'` and
 * `'dailyDigest'`. The reminders blob is encrypted client-side (v=2 AAD
 * envelope) — the server CAN'T decrypt it, so the cron skips encrypted
 * payloads and only processes plaintext ones (legacy users who haven't
 * enrolled E2E yet). Once every user is on E2E, this cron will become
 * a no-op; the digest will need to be generated client-side instead.
 */

import {
    getServiceRoleClient,
    listUserBlobsByDocKey,
    upsertUserBlob,
} from './_supabase-admin.js';

// Pacific-time YYYY-MM-DD string (matches client's _todayDate()).
function pacificTodayStr() {
    const pstParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const y = pstParts.find(p => p.type === 'year').value;
    const m = pstParts.find(p => p.type === 'month').value;
    const d = pstParts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

// Decide if a task should appear in today's digest. Server-side heuristic —
// intentionally simpler than client's _getStatus(): if the due date is <=
// today and the latest completion isn't from today, surface it. Client still
// owns the canonical "overdue / due-today / snoozed" classification on load.
function _isDueOrOverdue(task, today, todayStr) {
    if (!task || !task.dueDate) return false;
    if (task.dueDate > todayStr) return false;
    const comps = task.completions || [];
    const last = comps.length ? new Date(comps[comps.length - 1]) : null;
    // 'once' tasks stay completed forever — any completion disqualifies them
    // from future digests. Without this, a once-task finished yesterday still
    // surfaces in tomorrow's "X reminders due today" toast.
    if (task.frequency === 'once' && last) return false;
    if (last) {
        const lastPstStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(last)
         .filter(p => p.type !== 'literal')
         .map(p => p.value).join('-');
        if (lastPstStr === todayStr) return false;   // completed today
    }
    const snooze = task.snooze;
    if (snooze && snooze.until) {
        const until = new Date(snooze.until);
        if (until > today) return false;             // still snoozed
    }
    return true;
}

// Detect v=2 AAD envelope. These ciphertexts cannot be decrypted server-side
// (the user's vault key never leaves their device).
function _isV2Envelope(value) {
    if (!value || typeof value !== 'object') return false;
    return value.v != null && value.iv != null && value.ct != null;
}

export default async function handler(req, res) {
    // Vercel adds `Authorization: Bearer ${CRON_SECRET}` for scheduled invocations.
    const auth = req.headers.authorization || '';
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!getServiceRoleClient()) {
        return res.status(503).json({ error: 'Supabase service role not configured' });
    }

    const today = new Date();
    const todayStr = pacificTodayStr();

    const summary = {
        date: todayStr,
        usersScanned: 0,
        usersWithReminders: 0,
        usersWithDueItems: 0,
        usersEncrypted: 0,
        totalDueItems: 0,
        errors: [],
    };

    let rows;
    try {
        rows = await listUserBlobsByDocKey('reminders');
    } catch (err) {
        return res.status(500).json({ error: 'Failed to list reminders blobs', details: err.message });
    }

    for (const row of rows) {
        summary.usersScanned++;
        const uid = row.user_id;
        if (!uid) continue;

        try {
            let parsed = null;
            try { parsed = JSON.parse(row.ciphertext); } catch { parsed = null; }

            // E2E-encrypted blobs can't be processed server-side. Track them
            // so we know the cron's reach is shrinking as users migrate.
            if (_isV2Envelope(parsed)) {
                summary.usersEncrypted++;
                continue;
            }

            const tasks = parsed && parsed.tasks;
            if (!Array.isArray(tasks) || tasks.length === 0) continue;

            summary.usersWithReminders++;

            const due = tasks
                .filter(t => _isDueOrOverdue(t, today, todayStr))
                .map(t => ({
                    id: String(t.id || ''),
                    title: String(t.title || ''),
                    category: String(t.category || ''),
                    priority: String(t.priority || ''),
                    frequency: String(t.frequency || ''),
                    dueDate: String(t.dueDate || ''),
                }));

            if (due.length === 0) continue;

            summary.usersWithDueItems++;
            summary.totalDueItems += due.length;

            const result = await upsertUserBlob(uid, 'dailyDigest', {
                date: todayStr,
                generatedAt: new Date().toISOString(),
                dueCount: due.length,
                tasks: due,
            });
            if (!result.ok) {
                summary.errors.push({ uid, error: result.error });
            }
        } catch (err) {
            summary.errors.push({ uid, error: err.message });
        }
    }

    return res.status(200).json(summary);
}
