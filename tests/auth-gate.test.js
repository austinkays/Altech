/**
 * Regression coverage for the forced sign-in gate.
 *
 * Background:
 *   Previously, an un-signed-in user could navigate to `/` and see the full
 *   dashboard — bento widgets, tool tiles, greeting — but most of it was
 *   broken (cloud sync 401s, paywall locked tools, vault unlock fired over
 *   the dashboard). The only existing gate was in `App.navigateTo` and only
 *   fired *after* the user clicked a tool tile.
 *
 *   This change adds a top-level gate at boot. When auth resolves with no
 *   user, the chrome is hidden and the existing `#authModal` is pinned open
 *   as a forced sign-in screen. The user can switch between login / signup /
 *   reset views but cannot dismiss the modal — only a real sign-in (or
 *   sign-up that creates a session) lifts the gate via PR #106's reload.
 *
 * Tests use static source-pattern checks (consistent with
 * `auth-bridge-race.test.js` + `auth-reload-on-change.test.js`).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Auth gate — forced sign-in screen when signed out', () => {
    const bootSrc   = readSrc('js/app-boot.js');
    const authSrc   = readSrc('js/auth.js');
    const cssSrc    = readSrc('css/components-modals.css');
    const animSrc   = readSrc('css/animations.css');
    const paletteSrc= readSrc('js/command-palette.js');

    // ── Boot integration ────────────────────────────────────────────────

    test('app-boot.js waits for Auth.whenSignedIn with a short timeout (≤ 3 s)', () => {
        // Auth.whenSignedIn returns the user or null after the timeout —
        // perfect signal for the gate. The original Auth.ready has a 15 s
        // safety timeout which is way too long to stare at a spinner.
        const m = bootSrc.match(/Auth\.whenSignedIn\(\s*(\d+)\s*\)/);
        expect(m).not.toBeNull();
        const timeoutMs = parseInt(m[1], 10);
        expect(timeoutMs).toBeGreaterThan(0);
        expect(timeoutMs).toBeLessThanOrEqual(3000);
    });

    test('app-boot.js sets auth-resolving while waiting, then transitions to auth-gated or normal boot', () => {
        // Both classes must be set on the body via classList.add to drive
        // the CSS state machine. The resolving class must come off before
        // either path proceeds (the spinner is meant for the wait, not
        // the modal).
        expect(bootSrc).toMatch(/document\.body\.classList\.add\(\s*['"]auth-resolving['"]\s*\)/);
        expect(bootSrc).toMatch(/document\.body\.classList\.remove\(\s*['"]auth-resolving['"]\s*\)/);
        expect(bootSrc).toMatch(/document\.body\.classList\.add\(\s*['"]auth-gated['"]\s*\)/);
    });

    test('app-boot.js opens the modal in forced mode when gated', () => {
        // `Auth.showModal({forced:true})` triggers the CSS-hides-close
        // behavior + the closeModal no-op. Plain Auth.showModal() would
        // still allow dismissal.
        expect(bootSrc).toMatch(/Auth\.showModal\(\s*\{[^}]*forced:\s*true/);
    });

    test('app-boot.js routes the password-reset deeplink to the reset view', () => {
        // ?type=recovery is Supabase's recovery-link marker. We open the
        // modal at the 'reset' view so the user can complete the flow
        // without dismissing the forced gate.
        expect(bootSrc).toMatch(/type=recovery/);
        expect(bootSrc).toMatch(/view:\s*[^,)]*['"]reset['"]/);
    });

    test('app-boot.js early-returns after gate so downstream init is skipped', () => {
        // After the forced modal opens, `renderLandingTools`,
        // `Onboarding.init`, `VaultUI.maybePromptUnlockOnLoad`, `Reminders`,
        // `DashboardWidgets.init`, the hash router, and the safety-net
        // refresh must all be skipped — none of them have anything useful
        // without a signed-in user, and DashboardWidgets in particular
        // would render an empty bento grid behind the modal.
        const gateBlock = bootSrc.match(/auth-gated[\s\S]*?return;/);
        expect(gateBlock).not.toBeNull();
    });

    test('Onboarding.init runs only after the gate confirms a signed-in user', () => {
        // The original boot called Onboarding.init unconditionally —
        // brand-new visitors saw the wizard before any auth screen. The
        // new flow is: sign-in screen first → after fresh signup, the
        // reload puts them in the signed-in branch and the wizard fires.
        // Onboarding.init must appear AFTER the gate's return so it can
        // only run on the signed-in path.
        const gateReturnIdx = bootSrc.search(/auth-gated[\s\S]*?return;/);
        const onboardingIdx = bootSrc.search(/Onboarding\.init\(\)/);
        expect(gateReturnIdx).toBeGreaterThan(-1);
        expect(onboardingIdx).toBeGreaterThan(gateReturnIdx);
    });

    // ── Auth.showModal forced mode ──────────────────────────────────────

    test('Auth.showModal accepts a forced option that adds body.auth-gated', () => {
        expect(authSrc).toMatch(/showModal\(opts\)/);
        expect(authSrc).toMatch(/forced\s*=\s*!!\(opts\s*&&\s*opts\.forced\)/);
        expect(authSrc).toMatch(/document\.body\.classList\.add\(\s*['"]auth-gated['"]\s*\)/);
    });

    test('Auth.showModal honors an explicit view option (used for reset deeplink)', () => {
        // The deeplink path passes { view: 'reset' } so the user lands on
        // the recovery form directly.
        expect(authSrc).toMatch(/view\s*=\s*opts\s*&&\s*opts\.view/);
        expect(authSrc).toMatch(/if\s*\(view\)\s*_showView\(view\)/);
    });

    test('Auth.closeModal is a no-op while body.auth-gated is present', () => {
        // The modal close button is hidden by CSS, but stray closeModal()
        // calls from elsewhere (plugin code, keyboard handlers, MFA
        // success path) must not lift the gate either.
        expect(authSrc).toMatch(/closeModal\(\)\s*\{[\s\S]{0,800}?classList\.contains\(\s*['"]auth-gated['"]\s*\)/);
    });

    test('Ambient sign-out adds auth-gated immediately so the chrome disappears before reload', () => {
        // Multi-tab sign-out and session expiry route through the
        // _onAuthStateChanged null path. PR #106 already schedules a
        // reload — adding auth-gated here is a visual nicety that hides
        // the dashboard during the ~600 ms reload bridge.
        expect(authSrc).toMatch(/_hadSignedInUser\s*=\s*false;[\s\S]{0,600}?classList\.add\(\s*['"]auth-gated['"]\s*\)/);
    });

    // ── CSS state machine ──────────────────────────────────────────────

    test('CSS hides every top-level overlay except #authModal + #toast under body.auth-gated', () => {
        expect(cssSrc).toMatch(/body\.auth-gated\s*>\s*\*:not\(#authModal\)/);
        expect(cssSrc).toMatch(/body\.auth-resolving\s*>\s*\*:not/);
        // #toast must remain visible — sign-in success / failure toasts
        // are part of the gate UX.
        expect(cssSrc).toMatch(/:not\(#toast\)/);
    });

    test('CSS hides the modal close button under body.auth-gated', () => {
        expect(cssSrc).toMatch(/body\.auth-gated\s+#authModal\s+\.auth-close\s*\{[\s\S]*?display:\s*none/);
    });

    test('CSS shows a loading spinner under body.auth-resolving', () => {
        expect(cssSrc).toMatch(/body\.auth-resolving::before/);
        expect(cssSrc).toMatch(/body\.auth-resolving::after/);
        expect(cssSrc).toMatch(/auth-gate-spin/);
    });

    test('@keyframes for the gate spinner lives in animations.css (not components-modals.css)', () => {
        // CLAUDE.md: all @keyframes belong in animations.css, never in
        // component CSS files.
        expect(animSrc).toMatch(/@keyframes\s+auth-gate-spin/);
        expect(cssSrc).not.toMatch(/@keyframes\s+auth-gate-spin/);
    });

    // ── Hotkeys ────────────────────────────────────────────────────────

    test('command-palette suppresses Cmd+K when body.auth-gated is present', () => {
        // Other hotkeys (Cmd+S, App.goHome on Esc) are registered inside
        // window.onload, which early-returns at the gate, so they're
        // never wired. Cmd+K wires from command-palette.js at
        // DOMContentLoaded independently — needs its own opt-out.
        expect(paletteSrc).toMatch(/_onGlobalKeydown[\s\S]{0,500}?classList\.contains\(\s*['"]auth-gated['"]\s*\)/);
    });
});
