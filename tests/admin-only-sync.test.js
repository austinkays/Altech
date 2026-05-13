'use strict';

/**
 * tests/admin-only-sync.test.js
 *
 * Agency policy: cloud sync is restricted to admin accounts. Non-admins stay
 * local-only so plaintext client NPI never leaves the browser. After Phase D
 * the gate lives entirely in js/sync-facade.js (Firebase + js/cloud-sync.js
 * are gone) and reads `SupabaseAuth.isAdmin` directly.
 *
 * Source-level regression guard: if a future refactor removes a gate, this
 * test fails loudly instead of silently re-opening the sync door for
 * non-admins.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const syncFacadeSrc = fs.readFileSync(path.join(ROOT, 'js', 'sync-facade.js'), 'utf8');
const authSrc       = fs.readFileSync(path.join(ROOT, 'js', 'auth.js'), 'utf8');
const indexSrc      = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('Admin-only cloud sync policy', () => {
    describe('js/sync-facade.js', () => {
        test('defines policyBlocksSync helper', () => {
            expect(syncFacadeSrc).toMatch(/function policyBlocksSync\(\)/);
        });

        test('policyBlocksSync reads SupabaseAuth.isAdmin and fails closed when missing', () => {
            const block = syncFacadeSrc.match(/function policyBlocksSync\(\)\s*\{([\s\S]*?)\n\s*\}/);
            expect(block).not.toBeNull();
            expect(block[1]).toMatch(/window\.SupabaseAuth/);
            expect(block[1]).toMatch(/if \(!a\) return true/);
            expect(block[1]).toMatch(/isAdmin !== true/);
        });

        test('writeBlocked combines MFA and policy gates', () => {
            expect(syncFacadeSrc).toMatch(/function writeBlocked\(\)/);
            const block = syncFacadeSrc.match(/function writeBlocked\(\)\s*\{([\s\S]*?)\n\s*\}/);
            expect(block[1]).toMatch(/mfaBlocksSync\(\)/);
            expect(block[1]).toMatch(/policyBlocksSync\(\)/);
        });

        test('every write method gates through writeBlocked', () => {
            const writeMethods = ['schedulePush', 'pushToCloud', 'fullSync', 'pushBlob', 'deleteBlob', 'pushQuote', 'deleteQuote'];
            for (const m of writeMethods) {
                const sig = new RegExp(`${m}\\(\\.\\.\\.args\\)\\s*\\{[\\s\\S]*?if \\(writeBlocked\\(\\)\\)`);
                expect(syncFacadeSrc).toMatch(sig);
            }
        });

        test('pullFromCloud and read methods stay open (not gated)', () => {
            // Reads must never be blocked — a demoted admin still needs to see
            // their local data; an MFA-required user needs to migrate first.
            const readMethods = ['pullBlob', 'pullQuote', 'listQuotes'];
            for (const m of readMethods) {
                const block = syncFacadeSrc.match(new RegExp(`${m}\\(\\.\\.\\.args\\)[^\\n]*\\{[^}]*\\}`));
                if (block) {
                    expect(block[0]).not.toMatch(/if \(writeBlocked\(\)\)/);
                }
            }
        });
    });

    describe('js/auth.js settings modal', () => {
        test('reads SupabaseAuth admin/blocked claims into legacy Auth state', () => {
            // The settings modal + sidebar UI inspects `Auth.isAdmin`. Auth.js
            // mirrors the Supabase claims so existing call sites see the
            // correct value.
            expect(authSrc).toMatch(/SupabaseAuth\.isAdmin === true/);
            expect(authSrc).toMatch(/SupabaseAuth\.isBlocked === true/);
        });

        test('force-disables the sync opt-out toggle for non-admins', () => {
            // The Account modal renders an "opt out of cloud sync" toggle.
            // Non-admins must see it checked + disabled so they can't
            // mistakenly think they have a working sync.
            expect(authSrc).toMatch(/if \(!_isAdmin\) \{[\s\S]*?syncDisabledEl\.checked = true/);
            expect(authSrc).toMatch(/syncDisabledEl\.disabled = true/);
        });
    });

    describe('Account Sync toggle wiring', () => {
        test('toggle exists in the Account modal', () => {
            expect(indexSrc).toMatch(/authSyncDisabled/);
        });
    });
});
