/**
 * Regression coverage for the kv-store cache-miss response.
 *
 * Background:
 *   api/kv-store.js previously returned `404 { error: 'Key not found' }`
 *   when the requested Redis key was empty. The CGL dashboard handled it
 *   gracefully (`if (res.ok)` → falls through to `return null`), but
 *   Chrome DevTools auto-logged every 4xx response as a red error in the
 *   Console panel — confusing users who saw "GET /api/kv-store 404" and
 *   assumed the app was broken when it was just a normal empty cache.
 *
 *   Cache miss now returns `200 + null body` instead. The endpoint stays
 *   200 + value on a hit; 401 / 501 still signal real auth / config
 *   failures; 400 still signals an invalid key. The console is quiet on
 *   the happy path.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('kv-store — cache miss returns 200 + null instead of 404', () => {
    const apiSrc       = readSrc('api/kv-store.js');
    const dashboardSrc = readSrc('js/compliance-dashboard.js');

    test('kv-store GET handler returns 200 + null body when the Redis key is empty', () => {
        // The miss arm of the GET branch — verify both the status code
        // and the null payload.
        expect(apiSrc).toMatch(
            /result\s*===\s*null\s*\|\|\s*result\s*===\s*undefined[\s\S]{0,800}?res\.status\(\s*200\s*\)\.json\(\s*null\s*\)/
        );
    });

    test('kv-store no longer emits a 404 from the cache-miss path', () => {
        // The legacy `return res.status(404).json({ error: 'Key not found', ... })`
        // must be gone — that's the line that produced the DevTools red
        // log on every CGL dashboard load.
        expect(apiSrc).not.toMatch(/status\(404\)\.json\(\s*\{\s*error:\s*['"]Key not found/);
    });

    test('kv-store still 400s an invalid key (not-allowed list)', () => {
        // The 4xx path that's a REAL client error (invalid key) must
        // stay — this regression test pins it so a future cleanup
        // can't accidentally swallow the 400 too.
        expect(apiSrc).toMatch(/status\(400\)[\s\S]{0,200}?ALLOWED_KEYS/);
    });

    test('compliance dashboard _checkKV no longer mentions 404 as the "empty data" signal', () => {
        // The inline comment explaining the status-code semantics has to
        // match the new behavior — otherwise the next developer who
        // touches `_checkKV` will think 404 still means "KV works".
        const checkKVBlock = dashboardSrc.match(/async _checkKV\(\)\s*\{[\s\S]*?return this\._kvAvailable;\s*\},/);
        expect(checkKVBlock).not.toBeNull();
        expect(checkKVBlock[0]).not.toMatch(/404\s*=\s*KV works but no data/);
        expect(checkKVBlock[0]).toMatch(/200/);
    });

    test('_loadFromKV only logs a cache hit when the response body is non-null', () => {
        // Previously the console.log fired for every 200 response, which
        // with the new behavior would fire on every cache miss too (200
        // + null body). The guard ensures the "KV loaded" log only
        // surfaces on actual hits.
        const loadFromKVBlock = dashboardSrc.match(/async _loadFromKV\([\s\S]*?return null;\s*\},/);
        expect(loadFromKVBlock).not.toBeNull();
        expect(loadFromKVBlock[0]).toMatch(
            /if\s*\(data\s*!==\s*null\s*&&\s*data\s*!==\s*undefined\)\s*\{[\s\S]*?console\.log\(\s*['"]\[CGL\] ☁️ KV loaded/
        );
    });
});
