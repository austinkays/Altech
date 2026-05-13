/**
 * Regression coverage for the auth-driven page reload in js/auth.js.
 *
 * Background:
 *   When a user signs in or out, the SPA needs to refresh so the UI reflects
 *   the new auth state — locked vault data disappears on sign-out, freshly
 *   restored cloud data + signed-in chrome appear on sign-in. Without a
 *   reload, plugins that cached state at boot can hold stale data and the
 *   user has to refresh manually.
 *
 * The contract these tests pin:
 *   1. A single `_scheduleAuthReload` helper exists and is idempotent
 *      (`_authReloadScheduled` flag prevents double-firing).
 *   2. `.login()` schedules a reload on success — except when MFA enrollment
 *      is about to open (the overlay would be destroyed by the reload, so we
 *      set `_suppressAuthReload` to swallow the next call).
 *   3. `.signup()` schedules a reload only when the signup actually created a
 *      session (no email-verification gate). MFA enrollment after signup is
 *      also suppressed.
 *   4. `.logout()` schedules a reload after `SupabaseAuth.logout()` resolves.
 *   5. `_onAuthStateChanged` detects ambient sign-outs (multi-tab, session
 *      expiry, admin-forced block) by tracking `_hadSignedInUser`. It must
 *      NOT reload on cold-load hydration (no prior user) or on null→user
 *      transitions (would double-trigger with login()'s direct schedule).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Auth — reload page on sign-in / sign-out', () => {
    const src = readSrc('js/auth.js');

    test('_scheduleAuthReload helper exists with idempotent + suppressible guards', () => {
        expect(src).toMatch(/function\s+_scheduleAuthReload\s*\(/);
        // Idempotent: re-entrant calls bail.
        expect(src).toMatch(/if\s*\(_authReloadScheduled\)\s*return/);
        // Suppress flag is consumed (not a one-way latch).
        expect(src).toMatch(/if\s*\(_suppressAuthReload\)\s*\{\s*_suppressAuthReload\s*=\s*false;\s*return;\s*\}/);
        // Actually calls window.location.reload.
        expect(src).toMatch(/window\.location\.reload\s*\(\s*\)/);
        // Delayed via setTimeout so the toast / modal-close UI ticks first.
        expect(src).toMatch(/setTimeout\s*\(\s*\(\s*\)\s*=>/);
    });

    test('logout schedules a reload after SupabaseAuth.logout resolves', () => {
        // The reload must come AFTER the awaited logout — scheduling before
        // would race against the SIGNED_OUT event and risk reloading while
        // the session is still partially valid.
        expect(src).toMatch(
            /async\s+logout\s*\(\)\s*\{[\s\S]*?await\s+SupabaseAuth\.logout\(\)[\s\S]*?_scheduleAuthReload\(/
        );
    });

    test('login schedules a reload on success when MFA enrollment is NOT opening', () => {
        // The else branch of the MFA-enforcement check runs when no
        // enrollment is required — that's where the reload schedules.
        expect(src).toMatch(/AuthMFAUI\.openEnroll[\s\S]*?\}\s*else\s*\{\s*_scheduleAuthReload\(/);
    });

    test('login suppresses the reload when MFA enrollment is about to open', () => {
        // Without _suppressAuthReload, the SDK's SIGNED_IN event would
        // race in and reload the page out from under the MFA modal.
        expect(src).toMatch(/_suppressAuthReload\s*=\s*true;\s*\n\s*AuthMFAUI\.openEnroll/);
    });

    test('signup reloads only when a session was actually created', () => {
        // Email-verification flows return signUp() with no session — a
        // reload there would drop the user back to the signed-out shell.
        // The session-presence guard prevents that.
        expect(src).toMatch(
            /SupabaseAuth\.user[\s\S]{0,80}?_scheduleAuthReload\(/
        );
    });

    test('_onAuthStateChanged tracks _hadSignedInUser to detect ambient sign-outs', () => {
        // Set on user→present, cleared on user→absent transition.
        // The flexible `[\s\S]{0,800}?` budget allows additional logic
        // between the `_hadSignedInUser = false` flip and the reload
        // schedule (e.g. the auth-gate's chrome-hide for the multi-tab
        // sign-out case lives between them).
        expect(src).toMatch(/_hadSignedInUser\s*=\s*true/);
        expect(src).toMatch(/if\s*\(_hadSignedInUser\)\s*\{\s*_hadSignedInUser\s*=\s*false;[\s\S]{0,800}?_scheduleAuthReload\(/);
    });

    test('cold-load with no session does NOT trigger a reload', () => {
        // Defensive: the ambient sign-out branch must be gated on
        // _hadSignedInUser. A bare `_scheduleAuthReload()` in the else
        // arm would reload every cold-load with no session (which lands
        // there via the SDK's initial null event).
        const elseBlock = src.match(/\}\s*else\s*\{\s*console\.log\(['"]\[Auth\] Signed out['"]\);[\s\S]*?\n\s*\}/);
        expect(elseBlock).not.toBeNull();
        expect(elseBlock[0]).toMatch(/if\s*\(_hadSignedInUser\)/);
    });
});
