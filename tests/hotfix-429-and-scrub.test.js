/**
 * Regression coverage for the 429 storm + cglState invalid-argument hotfix.
 *
 * 429 storm:
 *   - verifyClient short-circuits when _verify429Until is in the future
 *   - 429 response triggers exponential backoff (60s → 5min → 30min cap)
 *   - Successful response resets _verify429Count to 0
 *   - _drainVerifyQueue schedules a single wake-up timer (not a busy loop)
 *     when rate-limited
 *   - Lowered concurrency: 3 → 1
 *   - Inter-request delay: 600ms
 *
 * cglState invalid-argument:
 *   - _scrubUndefined exists in both compliance-dashboard.js (used by
 *     clientCompliance writes) and cloud-sync.js (last-mile defense at push)
 *   - Removes undefined values recursively from any object/array tree
 *   - Preserves null, falsy primitives, and arrays
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CGL_SRC = readSrc('js/compliance-dashboard.js');
const SYNC_SRC = readSrc('js/cloud-sync.js');

describe('hotfix: 429 storm in verifyClient + _drainVerifyQueue', () => {
    test('verifyClient short-circuits while a 429 backoff window is active', () => {
        const fnStart = CGL_SRC.indexOf('async verifyClient(clientNumber, businessName)');
        const fnBlock = CGL_SRC.slice(fnStart, fnStart + 5000);
        expect(fnBlock).toMatch(/this\._verify429Until\s*&&\s*Date\.now\(\)\s*<\s*this\._verify429Until/);
    });

    test('429 from either upstream sets an exponential backoff window + counter', () => {
        const fnStart = CGL_SRC.indexOf('async verifyClient(clientNumber, businessName)');
        const fnBlock = CGL_SRC.slice(fnStart, fnStart + 5000);
        // Detection covers both LI and CCB responses.
        expect(fnBlock).toMatch(/waRes\.status === 429.*orRes\.status === 429/s);
        // Counter increments + backoff math caps at 30 minutes.
        expect(fnBlock).toMatch(/this\._verify429Count\s*=\s*\(this\._verify429Count \|\| 0\) \+ 1/);
        expect(fnBlock).toMatch(/Math\.min\(30 \* 60 \* 1000/);
        // Backoff start: 60s.
        expect(fnBlock).toMatch(/60 \* 1000 \* Math\.pow\(5/);
    });

    test('successful response resets _verify429Count to 0', () => {
        const fnStart = CGL_SRC.indexOf('async verifyClient(clientNumber, businessName)');
        const fnBlock = CGL_SRC.slice(fnStart, fnStart + 5000);
        expect(fnBlock).toMatch(/this\._verify429Count\s*=\s*0/);
    });

    test('429 path emits an ActivityLog error so the user notices', () => {
        const fnStart = CGL_SRC.indexOf('async verifyClient(clientNumber, businessName)');
        const fnBlock = CGL_SRC.slice(fnStart, fnStart + 5000);
        expect(fnBlock).toMatch(/window\.ActivityLog/);
        expect(fnBlock).toContain('L&I/CCB rate limit hit');
    });

    test('concurrency lowered 3 → 1; inter-request delay set', () => {
        // Sequential against Socrata; 600ms between requests.
        expect(CGL_SRC).toMatch(/_verifyConcurrency:\s*1/);
        expect(CGL_SRC).toMatch(/_verifyMinIntervalMs:\s*600/);
    });

    test('_drainVerifyQueue schedules a single wake-up timer during backoff', () => {
        const fnStart = CGL_SRC.indexOf('_drainVerifyQueue()');
        const fnBlock = CGL_SRC.slice(fnStart, fnStart + 2500);
        // Single timer guard — avoid stacking N concurrent wake-ups when
        // many policy renders fire while we're rate-limited.
        expect(fnBlock).toMatch(/if \(!this\._verify429Timer\)/);
        expect(fnBlock).toContain('setTimeout(()');
        // Returns early when in backoff so the while loop doesn't run.
        expect(fnBlock).toMatch(/return;\s*\n\s*}\s*\n\s*while/);
    });

    test('_drainVerifyQueue spaces requests by _verifyMinIntervalMs', () => {
        const fnStart = CGL_SRC.indexOf('_drainVerifyQueue()');
        const fnBlock = CGL_SRC.slice(fnStart, fnStart + 2500);
        expect(fnBlock).toMatch(/setTimeout\(\(\)\s*=>\s*this\._drainVerifyQueue\(\),\s*this\._verifyMinIntervalMs\)/);
    });
});

describe('hotfix: undefined → invalid-argument scrubbing', () => {
    test('compliance _scrubUndefined helper exists and is applied to clientCompliance writes', () => {
        expect(CGL_SRC).toContain('_scrubUndefined(obj)');
        // Applied to the auto-classification write so a missing license
        // field doesn't poison the whole cglState push.
        expect(CGL_SRC).toMatch(/this\.clientCompliance\[clientNumber\]\s*=\s*this\._scrubUndefined\(\{/);
    });

    test('_getStateSnapshot scrubs before returning so all save paths are safe', () => {
        // Match the function definition specifically (not the caller).
        const fnStart = CGL_SRC.indexOf('_getStateSnapshot() {');
        expect(fnStart).toBeGreaterThan(0);
        const fnBlock = CGL_SRC.slice(fnStart, fnStart + 1500);
        expect(fnBlock).toMatch(/this\._scrubUndefined\s*\?\s*this\._scrubUndefined\(raw\)\s*:\s*raw/);
    });

    test('cloud-sync _scrubUndefined exists + is called inside _pushDoc before ref.set', () => {
        expect(SYNC_SRC).toContain('function _scrubUndefined(value)');
        // Used at the actual Firestore write boundary. Phase B (May 11):
        // the scrubbed plaintext is then passed through _wrapForFirestore,
        // and the resulting v=2 envelope (stored in `wrapped`) is what
        // lands in the `data` field.
        const fnStart = SYNC_SRC.indexOf('async function _pushDoc');
        const fnBlock = SYNC_SRC.slice(fnStart, fnStart + 4500);
        expect(fnBlock).toMatch(/const scrubbed = _scrubUndefined\(localData\)/);
        expect(fnBlock).toMatch(/const wrapped = await _wrapForFirestore\(scrubbed/);
        expect(fnBlock).toMatch(/data:\s*wrapped/);
    });

    test('_scrubUndefined handles array + null + nested + Date correctly', () => {
        // Source-level: must not double-wrap Date instances and must recurse arrays.
        expect(SYNC_SRC).toMatch(/if \(value instanceof Date\) return value/);
        expect(SYNC_SRC).toMatch(/Array\.isArray\(value\)\) return value\.map\(_scrubUndefined\)/);
        // Drops undefined keys entirely rather than emitting them as null.
        expect(SYNC_SRC).toMatch(/if \(v === undefined\) continue/);
    });
});
