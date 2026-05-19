/**
 * Regression coverage for the "CGL dashboard spins every morning" bug.
 *
 * Background:
 *   The daily /api/compliance?refresh=true cron is supposed to warm a shared
 *   Redis cache so the dashboard loads instantly when staff arrive. It was
 *   broken four ways at once:
 *
 *     1. KEY MISMATCH — api/compliance.js reads/writes the BARE Redis key
 *        `cgl_cache`, but api/kv-store.js (the only KV path the browser uses)
 *        prefixed every key per-user (`uid:<id>:cgl_cache`). The cron warmed a
 *        key no client could ever read.
 *     2. SERVER TTL — api/compliance.js only served the cached payload if it
 *        was < 15 min old. A once-a-day warm was "too stale to serve" by
 *        08:15, so every later open did a full cold HawkSoft refetch.
 *     3. CRON TIMING — the cron fired at 0 15 * * * (UTC) = 08:00 Pacific,
 *        exactly when staff arrive, instead of before the workday.
 *     4. CLIENT TIMEOUT — the browser aborted the cold fetch at 65s ("Vercel
 *        limit is 60s", stale — vercel.json sets maxDuration 300), dropping
 *        the user on the "No Data" screen AND wasting the in-flight server
 *        fetch that would have warmed the cache.
 *
 *   These tests pin each fix so a future refactor can't silently reintroduce
 *   the morning-spin failure. They assert on source text (no live Redis /
 *   network) — the same approach as kv-store-cache-miss.test.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('CGL morning cache warm — cron + client must agree on a SHARED key', () => {
    const kvSrc         = readSrc('api/kv-store.js');
    const complianceSrc = readSrc('api/compliance.js');
    const dashboardSrc  = readSrc('js/compliance-dashboard.js');
    const vercelJson    = JSON.parse(readSrc('vercel.json'));

    test('Fix 1: api/kv-store.js treats cgl_cache as a SHARED (non-per-user) key', () => {
        // A SHARED_KEYS list must exist and contain cgl_cache, and the
        // effective Redis key must be computed through it (not an
        // unconditional `uid:` prefix).
        expect(kvSrc).toMatch(/SHARED_KEYS\s*=\s*\[[^\]]*['"]cgl_cache['"][^\]]*\]/);
        expect(kvSrc).toMatch(
            /SHARED_KEYS\.includes\(\s*k\s*\)\s*\?\s*k\s*:\s*`uid:\$\{uid\}:\$\{k\}`/
        );
        // The old unconditional prefix must be gone.
        expect(kvSrc).not.toMatch(/const\s+keyPrefix\s*=\s*`uid:\$\{uid\}:`/);
        // All three Redis ops route through the helper.
        expect(kvSrc).toMatch(/redis\.get\(\s*redisKey\(key\)\s*\)/);
        expect(kvSrc).toMatch(/redis\.set\(\s*redisKey\(key\)/);
        expect(kvSrc).toMatch(/redis\.del\(\s*redisKey\(key\)\s*\)/);
    });

    test('Fix 1: private keys stay per-user (cgl_cache is the ONLY shared key)', () => {
        const m = kvSrc.match(/SHARED_KEYS\s*=\s*(\[[^\]]*\])/);
        expect(m).not.toBeNull();
        const shared = JSON.parse(m[1].replace(/'/g, '"'));
        expect(shared).toEqual(['cgl_cache']);
        // cgl_state / email_drafts / export_history must NOT be shared —
        // they're genuinely per-user private data.
        expect(shared).not.toContain('cgl_state');
        expect(shared).not.toContain('email_drafts');
        expect(shared).not.toContain('export_history');
    });

    test('Fix 1: the cron + server write the same BARE key the shared path reads', () => {
        // api/compliance.js must use the bare 'cgl_cache' (no uid prefix) so
        // it lines up with kv-store's SHARED_KEYS entry.
        expect(complianceSrc).toMatch(/KV_CACHE_KEY\s*=\s*['"]cgl_cache['"]/);
        expect(complianceSrc).toMatch(/redisClient\.get\(\s*KV_CACHE_KEY\s*\)/);
        expect(complianceSrc).toMatch(/kvClient\.set\(\s*KV_CACHE_KEY\s*,/);
    });

    test('Fix 2: server cache TTL is long enough that a daily warm serves all day', () => {
        const m = complianceSrc.match(/KV_CACHE_TTL_MS\s*=\s*([^;]+);/);
        expect(m).not.toBeNull();
        // eslint-disable-next-line no-eval
        const ttlMs = eval(m[1]); // simple arithmetic literal from source
        const FIFTEEN_MIN = 15 * 60 * 1000;
        expect(ttlMs).toBeGreaterThan(FIFTEEN_MIN);
        // Must comfortably cover a full workday between two daily cron runs.
        expect(ttlMs).toBeGreaterThanOrEqual(12 * 60 * 60 * 1000);
    });

    test('Fix 2: an over-1MB payload no longer skips the KV write silently', () => {
        // The `else` branch must log loudly so a recurrence is diagnosable
        // from Vercel logs instead of being an invisible no-op.
        expect(complianceSrc).toMatch(
            /serialized\.length\s*<\s*1_000_000[\s\S]*?\}\s*else\s*\{[\s\S]*?console\.(warn|error)\([^)]*KV cache SKIPPED/
        );
    });

    test('Fix 3: the compliance cron runs BEFORE the workday, not at 08:00 Pacific', () => {
        const cron = vercelJson.crons.find(c => c.path.includes('/api/compliance'));
        expect(cron).toBeTruthy();
        expect(cron.path).toContain('refresh=true');
        // 0 15 * * * UTC = 08:00 PDT = arrival time (the bug). The hour field
        // must be earlier so the warm completes before staff arrive.
        const hourUTC = parseInt(cron.schedule.split(/\s+/)[1], 10);
        expect(cron.schedule).not.toBe('0 15 * * *');
        expect(hourUTC).toBeLessThan(15); // earlier than 08:00 Pacific
    });

    test('Fix 4: client API timeout matches the 300s server budget, not a stale 60s assumption', () => {
        const m = dashboardSrc.match(/const\s+API_TIMEOUT_MS\s*=\s*(\d+);/);
        expect(m).not.toBeNull();
        const timeoutMs = parseInt(m[1], 10);
        expect(timeoutMs).toBeGreaterThan(65000); // old value that bailed too early
        // Bounded so the worst-case spinner is still finite (≤ the 300s
        // function budget in vercel.json).
        expect(timeoutMs).toBeLessThanOrEqual(300000);
        // The misleading "Vercel function limit is 60s" comment must be gone.
        expect(dashboardSrc).not.toMatch(/Vercel function limit is 60s/);
    });

    test('vercel.json still grants api/compliance.js the 300s budget the client now waits for', () => {
        expect(vercelJson.functions['api/compliance.js'].maxDuration).toBe(300);
    });
});
