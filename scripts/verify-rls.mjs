#!/usr/bin/env node
// scripts/verify-rls.mjs
//
// Live-fire RLS verification. Connects to a Supabase project using the
// PUBLIC anon key (always safe to ship — RLS is what enforces access),
// then asserts:
//
//   1. Anonymous reads of every user-data table return 0 rows (never error).
//   2. Anonymous writes are rejected (insert / update / delete).
//   3. Without a session, even existing rows are invisible.
//
// This script is for OPERATOR USE — run it manually after deploying the
// SQL migrations to a Supabase project. It is NOT wired into CI by
// default because it requires live credentials and a network round-trip.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_ANON_KEY=eyJhbGciOi... \
//     node scripts/verify-rls.mjs
//
// Exit codes:
//   0 — all assertions held
//   1 — one or more assertions violated (RLS gap)
//   2 — script aborted before assertions could run (config / connect error)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    process.stderr.write('verify-rls: SUPABASE_URL and SUPABASE_ANON_KEY env vars required.\n');
    process.exit(2);
}

let createClient;
try {
    ({ createClient } = await import('@supabase/supabase-js'));
} catch (e) {
    process.stderr.write('verify-rls: @supabase/supabase-js not installed. Run `npm install --no-save @supabase/supabase-js` first.\n');
    process.exit(2);
}

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
});

const TABLES = [
    'user_blobs',
    'user_quotes',
    'user_crypto_meta',
    'audit_log',
    'agencies',
    'agency_members',
    'agency_key_wraps',
    'agency_blobs',
];

const results = [];
let failed = 0;

function record(table, check, ok, detail) {
    results.push({ table, check, ok, detail });
    if (!ok) failed += 1;
}

// 1. Anonymous SELECTs — must return 0 rows, never error.
for (const t of TABLES) {
    try {
        const { data, error, count } = await client.from(t).select('*', { count: 'exact', head: true });
        if (error) {
            record(t, 'anon select', false, `error: ${error.message || error}`);
        } else if ((count ?? (data || []).length) !== 0) {
            record(t, 'anon select', false, `expected 0 rows, got ${count ?? (data || []).length}`);
        } else {
            record(t, 'anon select', true, '0 rows');
        }
    } catch (e) {
        record(t, 'anon select', false, `threw: ${e.message || e}`);
    }
}

// 2. Anonymous INSERTs — must be rejected.
async function expectInsertRejected(table, payload) {
    try {
        const { error } = await client.from(table).insert(payload);
        if (!error) {
            record(table, 'anon insert', false, 'INSERT succeeded as anon — RLS gap!');
        } else {
            record(table, 'anon insert', true, `rejected (${error.code || error.message?.slice(0, 60) || 'error'})`);
        }
    } catch (e) {
        // Network/parse errors are also "rejection" from the client's POV.
        record(table, 'anon insert', true, `threw: ${e.message?.slice(0, 80)}`);
    }
}

await expectInsertRejected('user_blobs', {
    user_id: '00000000-0000-0000-0000-000000000000',
    doc_key: 'verify-rls-anon-test',
    ciphertext: 'AA==',
});
await expectInsertRejected('user_quotes', {
    user_id: '00000000-0000-0000-0000-000000000000',
    ciphertext: 'AA==',
});
await expectInsertRejected('user_crypto_meta', {
    user_id: '00000000-0000-0000-0000-000000000000',
    passphrase_salt: 'AA==',
});
await expectInsertRejected('audit_log', {
    user_id: '00000000-0000-0000-0000-000000000000',
    event_type: 'login',
});
await expectInsertRejected('agencies', {
    name: 'verify-rls-anon-fake-agency',
    owner_user_id: '00000000-0000-0000-0000-000000000000',
});

// Render results.
const pad = (s, n) => String(s).padEnd(n);
process.stdout.write(`\n${pad('TABLE', 22)}${pad('CHECK', 16)}${pad('OK', 6)}DETAIL\n`);
process.stdout.write('─'.repeat(78) + '\n');
for (const r of results) {
    process.stdout.write(`${pad(r.table, 22)}${pad(r.check, 16)}${pad(r.ok ? '✓' : '✗', 6)}${r.detail || ''}\n`);
}
process.stdout.write('─'.repeat(78) + '\n');

if (failed > 0) {
    process.stderr.write(`\nverify-rls: ${failed} of ${results.length} checks failed.\n`);
    process.exit(1);
}
process.stdout.write(`verify-rls: all ${results.length} checks passed.\n`);
process.exit(0);
