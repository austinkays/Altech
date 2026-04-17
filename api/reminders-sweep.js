/**
 * api/reminders-sweep.js — Daily reminder sweep (Vercel Cron)
 *
 * Runs at 13:00 UTC (06:00 PT) every day via vercel.json "crons" entry.
 * For each user, reads `users/{uid}/sync/reminders`, filters tasks due
 * today (dueDate <= today and not completed today), writes a digest to
 * `users/{uid}/sync/dailyDigest`. The client reads the digest on next
 * open and surfaces a toast / sidebar badge.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` on cron
 * invocations. Set CRON_SECRET in the Vercel project env.
 *
 * Pro tier unlocks unlimited daily crons; this endpoint is purely
 * additive — existing client-side reminder logic is unchanged.
 */

import {
    firestoreListAsAdmin,
    firestoreGetAsAdmin,
    firestoreSetAsAdmin,
    parseFirestoreDoc,
} from '../lib/firestore.js';

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

export default async function handler(req, res) {
    // Vercel adds `Authorization: Bearer ${CRON_SECRET}` for scheduled invocations.
    const auth = req.headers.authorization || '';
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const today = new Date();
    const todayStr = pacificTodayStr();

    const summary = {
        date: todayStr,
        usersScanned: 0,
        usersWithReminders: 0,
        usersWithDueItems: 0,
        totalDueItems: 0,
        errors: [],
    };

    let users;
    try {
        users = await firestoreListAsAdmin('users');
    } catch (err) {
        return res.status(500).json({ error: 'Failed to list users', details: err.message });
    }

    for (const userDoc of users) {
        summary.usersScanned++;
        const uid = (userDoc.name || '').split('/').pop();
        if (!uid) continue;

        try {
            const raw = await firestoreGetAsAdmin(`users/${uid}/sync/reminders`);
            if (!raw) continue;
            const parsed = parseFirestoreDoc(raw);
            const tasks = parsed && parsed.data && parsed.data.tasks;
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

            await firestoreSetAsAdmin(`users/${uid}/sync/dailyDigest`, {
                date: todayStr,
                generatedAt: new Date().toISOString(),
                dueCount: due.length,
                tasks: due,
            });
        } catch (err) {
            summary.errors.push({ uid, error: err.message });
        }
    }

    return res.status(200).json(summary);
}
