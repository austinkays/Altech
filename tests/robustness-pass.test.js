/**
 * Regression coverage for the robustness pass (LAUNCH_PREP §C5/C6/C8).
 *   - C5: Auth.ready() 5s timeout is now 15s + Auth.whenSignedIn() helper exists
 *   - C6: sw.js CACHE_VERSION auto-bump via scripts/bump-sw-version.mjs +
 *         .githooks/pre-commit
 *   - C8: ActivityLog hook on _parkCiphertextForRecovery so silent decryption
 *         failures surface in the header status pill
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── C5: Auth.ready timeout + whenSignedIn ────────────────────────────────

describe('C5 — Auth.ready timeout + whenSignedIn', () => {
    const src = readSrc('js/auth.js');

    test('safety timeout bumped from 5s to 15s', () => {
        // Source-level guard. The pre-fix value was a bare `5000` next to
        // _authReadyResolve(null); the new value lives in READY_TIMEOUT_MS.
        expect(src).toContain('READY_TIMEOUT_MS = 15000');
        expect(src).not.toMatch(/setTimeout\([^,]*_authReadyResolve\(null\)[^,]*,\s*5000\)/);
    });

    test('readyTimedOut getter exposes whether ready() resolved via timeout', () => {
        expect(src).toMatch(/get readyTimedOut\(\)\s*\{\s*return _authTimedOut/);
    });

    test('whenSignedIn(timeoutMs) resolves on real Firebase user, null on timeout', () => {
        expect(src).toContain('whenSignedIn(timeoutMs = 30000)');
        // Resolves immediately when user already populated.
        expect(src).toMatch(/if\s*\(_user\)\s*return Promise\.resolve\(_user\)/);
        // Registers a listener that resolves on the first non-null user.
        expect(src).toContain('_listeners.push(handler)');
    });

    test('detach helper removes the listener on both success and timeout paths', () => {
        // No leaked listeners — both the user-arrived and timeout paths call detach().
        const block = src.slice(src.indexOf('whenSignedIn(timeoutMs'));
        const detachCount = (block.slice(0, 1500).match(/detach\(\)/g) || []).length;
        expect(detachCount).toBeGreaterThanOrEqual(2);
    });
});

// ── C6: SW cache auto-bump ───────────────────────────────────────────────

describe('C6 — sw.js CACHE_VERSION auto-bump', () => {
    test('scripts/bump-sw-version.mjs exists and bumps the version integer', () => {
        const out = cp.execSync('node scripts/bump-sw-version.mjs --dry-run', {
            cwd: ROOT,
            encoding: 'utf8',
        });
        // Output format: "[bump-sw] (dry-run) would bump altech-v<N> → altech-v<N+1>"
        const m = out.match(/altech-v(\d+)\s*→\s*altech-v(\d+)/);
        expect(m).toBeTruthy();
        const [, fromN, toN] = m;
        expect(Number(toN)).toBe(Number(fromN) + 1);
    });

    test('dry-run does not modify sw.js', () => {
        const before = readSrc('sw.js');
        cp.execSync('node scripts/bump-sw-version.mjs --dry-run', {
            cwd: ROOT,
            encoding: 'utf8',
        });
        const after = readSrc('sw.js');
        expect(after).toBe(before);
    });

    test('pre-commit hook references the bump script + git-adds sw.js', () => {
        const hook = readSrc('.githooks/pre-commit');
        expect(hook).toContain('scripts/bump-sw-version.mjs');
        expect(hook).toContain('git add sw.js');
        // Skip path: dev manually bumped CACHE_VERSION in the same commit.
        expect(hook).toContain('SW_ALREADY_BUMPED');
        // Trigger paths cover js/css/plugins/api/index/manifest/sw itself.
        expect(hook).toMatch(/js\/.*css\/.*plugins\//);
    });
});

// ── C8: ActivityLog on decryption failure ────────────────────────────────

describe('C8 — _parkCiphertextForRecovery surfaces via ActivityLog', () => {
    const src = readSrc('js/app-core.js');

    test('emits an ActivityLog error event with the recovery reason + count', () => {
        // The hook lives inside _parkCiphertextForRecovery so all call sites
        // (App.load FORM + app-quotes pull) benefit automatically.
        const fnStart = src.indexOf('_parkCiphertextForRecovery(originalKey');
        expect(fnStart).toBeGreaterThan(0);
        const fnBlock = src.slice(fnStart, fnStart + 2500);
        expect(fnBlock).toMatch(/window\.ActivityLog\s*&&\s*typeof\s+window\.ActivityLog\.add/);
        expect(fnBlock).toMatch(/type:\s*['"]error['"]/);
        expect(fnBlock).toMatch(/area:\s*['"]crypto['"]/);
        // Detail string should point the user at the recovery API.
        expect(fnBlock).toMatch(/App\.getRecoveryBlobs\(\)/);
    });

    test('still parks the ciphertext even if ActivityLog is unavailable', () => {
        // Defensive — feature-detected at call time, so plugins/tests that
        // boot without ActivityLog don't blow up the recovery path.
        const fnStart = src.indexOf('_parkCiphertextForRecovery(originalKey');
        const fnBlock = src.slice(fnStart, fnStart + 2500);
        const setIdx = fnBlock.indexOf('localStorage.setItem(STORAGE_KEYS.DECRYPTION_RECOVERY');
        const activityIdx = fnBlock.indexOf('window.ActivityLog');
        // The persistence has to happen BEFORE the optional ActivityLog emit.
        expect(setIdx).toBeGreaterThan(-1);
        expect(activityIdx).toBeGreaterThan(setIdx);
    });
});
