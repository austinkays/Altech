'use strict';

/**
 * tests/admin-only-sync.test.js
 *
 * Agency policy: cloud sync is restricted to admin accounts until Path B
 * Phase 4 (end-to-end encrypted Supabase backend) ships. Non-admins stay
 * local-only so plaintext client NPI never leaves the browser.
 *
 * This file is a source-level regression guard: it asserts that the gates
 * exist in both js/cloud-sync.js and js/sync-facade.js and that every write
 * method routes through them. If a future refactor removes a gate, this
 * test fails loudly instead of silently re-opening the sync door for
 * non-admins.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cloudSyncSrc  = fs.readFileSync(path.join(ROOT, 'js', 'cloud-sync.js'), 'utf8');
const syncFacadeSrc = fs.readFileSync(path.join(ROOT, 'js', 'sync-facade.js'), 'utf8');
const authSrc       = fs.readFileSync(path.join(ROOT, 'js', 'auth.js'), 'utf8');
const indexSrc      = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cloudPolicySrc = cloudSyncSrc.slice(
    cloudSyncSrc.indexOf('function _policyBlocksSync'),
    cloudSyncSrc.indexOf('let _authRefreshWired')
);

describe('Admin-only cloud sync policy', () => {
    describe('js/cloud-sync.js', () => {
        test('defines _policyBlocksSync', () => {
            expect(cloudSyncSrc).toMatch(/function _policyBlocksSync\(\)/);
        });

        test('_policyBlocksSync uses Supabase admin claims by default and fails closed', () => {
            // Supabase is the Phase D default. A missing active auth module must
            // block sync during the boot window until the JWT/user is hydrated.
            expect(cloudSyncSrc).toMatch(/app_metadata\.is_admin/);
            expect(cloudPolicySrc).toMatch(/_activeBackend\(\) === 'supabase'/);
            expect(cloudPolicySrc).toMatch(/typeof SupabaseAuth === 'undefined'/);
            expect(cloudPolicySrc).toMatch(/SupabaseAuth\.isAdmin !== true/);
            expect(cloudPolicySrc).toMatch(/typeof Auth === 'undefined'/);
        });

        test('_policyBlocksSync preserves Firebase fallback for explicit Firebase users', () => {
            // Must check Auth.isAdmin !== true (not just == false) so that
            // a missing or undefined field also blocks, fail-closed.
            expect(cloudPolicySrc).toMatch(/Auth\.isAdmin !== true/);
        });

        test('wires Supabase auth refresh events to refresh CloudSync UI', () => {
            expect(cloudSyncSrc).toMatch(/function _wireAuthRefresh\(\)/);
            expect(cloudSyncSrc).toMatch(/SupabaseAuth\.addAuthListener\(\(\) => _refreshSyncUI\(\)\)/);
            expect(cloudSyncSrc).toMatch(/refreshUI\(\)\s*\{\s*_wireAuthRefresh\(\);\s*_refreshSyncUI\(\);/);
        });

        test('disabledByUser getter chains through _policyBlocksSync', () => {
            // Every existing `if (this.disabledByUser) return;` site now also
            // gates non-admins. If the chain is broken, every write method
            // would need its own explicit policy check — which it doesn't have.
            const getter = cloudSyncSrc.match(/get disabledByUser\(\)\s*\{([\s\S]*?)\n\s*\},/);
            expect(getter).not.toBeNull();
            expect(getter[1]).toMatch(/_policyBlocksSync\(\)/);
        });

        test('_refreshSyncUI shows "admin-restricted" status for policy-blocked users', () => {
            // User-visible status must distinguish policy block from user opt-out.
            expect(cloudSyncSrc).toMatch(/admin-restricted/i);
        });

        test('Account Sync toggle calls CloudSync.setDisabled and re-enable removes opt-out flag', () => {
            expect(indexSrc).toContain('id="authSyncDisabled" onchange="CloudSync.setDisabled(this.checked)"');
            expect(cloudSyncSrc).toMatch(/setDisabled\(disabled\)/);
            expect(cloudSyncSrc).toMatch(/localStorage\.removeItem\(STORAGE_KEYS\.CLOUD_SYNC_DISABLED\)/);
        });
    });

    describe('js/sync-facade.js', () => {
        test('defines policyBlocksSync helper', () => {
            expect(syncFacadeSrc).toMatch(/function policyBlocksSync\(\)/);
        });

        test('policyBlocksSync fails closed when active auth backend is undefined', () => {
            const block = syncFacadeSrc.match(/function policyBlocksSync\(\)\s*\{([\s\S]*?)\n\s*\}/);
            expect(block).not.toBeNull();
            expect(block[1]).toMatch(/backend\(\) === 'supabase' \? window\.SupabaseAuth : window\.Auth/);
            expect(block[1]).toMatch(/if \(!a\) return true/);
            expect(block[1]).toMatch(/isAdmin !== true/);
        });

        test('writeBlocked combines MFA and policy gates', () => {
            // Defense in depth for the Supabase backend (Phase 4+).
            expect(syncFacadeSrc).toMatch(/function writeBlocked\(\)/);
            const block = syncFacadeSrc.match(/function writeBlocked\(\)\s*\{([\s\S]*?)\n\s*\}/);
            expect(block[1]).toMatch(/mfaBlocksSync\(\)/);
            expect(block[1]).toMatch(/policyBlocksSync\(\)/);
        });

        test('every write method gates through writeBlocked', () => {
            // Walk the Sync object and confirm writes (not reads) check the gate.
            const writeMethods = ['schedulePush', 'pushToCloud', 'fullSync', 'pushBlob', 'deleteBlob', 'pushQuote', 'deleteQuote'];
            for (const m of writeMethods) {
                const methodRe = new RegExp(`${m}\\s*\\(\\.\\.\\.args\\)[\\s\\S]{0,200}?if \\(writeBlocked\\(\\)\\)`);
                expect(syncFacadeSrc).toMatch(methodRe);
            }
        });

        test('pullFromCloud and read methods stay open (not gated)', () => {
            // A demoted admin must still be able to pull their data to inspect
            // or export it. Reads are safe — the user already has access to
            // their own uid-scoped data by Firestore Security Rules.
            const pullFromCloud = syncFacadeSrc.match(/pullFromCloud\(\.\.\.args\)\s*\{\s*return call[^}]*\}/);
            expect(pullFromCloud).not.toBeNull();
            expect(pullFromCloud[0]).not.toMatch(/writeBlocked/);
        });
    });

    describe('js/auth.js settings modal', () => {
        test('Supabase is the default auth backend unless Firebase is explicitly selected', () => {
            const useSupabase = authSrc.match(/function _useSupabase\(\)\s*\{([\s\S]*?)\n\s*\}/);
            expect(useSupabase).not.toBeNull();
            expect(useSupabase[1]).toMatch(/SYNC_BACKEND\) !== 'firebase'/);
        });

        test('mirrors Supabase admin and blocked claims onto legacy Auth state', () => {
            expect(authSrc).toMatch(/user\._backend === 'supabase'/);
            expect(authSrc).toMatch(/_isAdmin = SupabaseAuth\.isAdmin === true/);
            expect(authSrc).toMatch(/_isBlocked = SupabaseAuth\.isBlocked === true/);
        });

        test('force-disables the sync opt-out toggle for non-admins', () => {
            // A non-admin can't toggle sync on — the checkbox is checked and
            // disabled, with explanatory text swapped in.
            expect(authSrc).toMatch(/if \(!_isAdmin\)/);
            expect(authSrc).toMatch(/syncDisabledEl\.checked = true/);
            expect(authSrc).toMatch(/syncDisabledEl\.disabled = true/);
            expect(authSrc).toMatch(/admin policy/i);
        });
    });
});
