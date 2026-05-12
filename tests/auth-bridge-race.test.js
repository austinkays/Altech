/**
 * Regression coverage for the Supabase→Auth.user bridge race in js/auth.js.
 *
 * Background — full story in CHANGELOG entry "fix(auth): close cold-load
 * bridge race…" and in the PR #98 description.
 *
 * The bug (twice — PR #98 only fixed one half):
 *   1. `Auth.init` registers a bridge listener via `SupabaseAuth.addAuthListener`.
 *   2. The Supabase JS v2 SDK fires `'INITIAL_SESSION'` (NOT `'INITIAL'`) at
 *      listener-attach time with whatever the in-memory session is — which
 *      can be null if attached before getSession() finishes hydrating.
 *   3. PR #98 guarded `event === 'INITIAL' && !sbUser`, which only catches
 *      the SYNTHETIC `'INITIAL'` event `addAuthListener` fires itself. The
 *      SDK's null `'INITIAL_SESSION'` slipped through, calling
 *      `_onAuthStateChanged(null)` and (one-shot) resolving `Auth._authReady`
 *      with null. Every later `await Auth.ready()` returned null, the
 *      app-navigation auth gate opened the Welcome Back modal on F5 even
 *      with a valid Supabase session in storage.
 *   4. Even with a tighter bridge guard, Firebase's `onAuthStateChanged`
 *      fires `null` for Supabase-only users (no Firebase identity) and that
 *      null also leaked into `_authReady` via `_onAuthStateChanged`.
 *
 * The fix (PR #99):
 *   • Conservative bridge guard — any null event from the bridge that
 *     ISN'T explicit SIGNED_OUT is ignored. Forward-compatible against
 *     future SDK event types.
 *   • `_authReady` only resolves on a POSITIVE signal (real user). The 15s
 *     safety timeout still catches genuinely-unauthenticated cold loads.
 *
 * These tests pin the source patterns so a refactor can't quietly reintroduce
 * the race. Behavioral tests (event firing through the real bridge) would
 * need a heavier SDK mock; the static guards are enough to keep the
 * one-character typo from coming back.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Auth bridge — Supabase INITIAL_SESSION race', () => {
    const src = readSrc('js/auth.js');

    test('bridge listener filters every null event EXCEPT explicit SIGNED_OUT', () => {
        // The previous (buggy) guard was `event === 'INITIAL' && !sbUser`.
        // That string-equality check missed the SDK's `'INITIAL_SESSION'`
        // event entirely. The fix flips the polarity: any null user is
        // suspect unless paired with SIGNED_OUT.
        expect(src).toMatch(
            /if\s*\(!sbUser\s*&&\s*event\s*!==\s*['"]SIGNED_OUT['"]\)\s*return/
        );
        // And the narrow string-match against 'INITIAL' alone must be gone —
        // it was the source of the typo bug.
        expect(src).not.toMatch(
            /if\s*\(\s*event\s*===\s*['"]INITIAL['"]\s*&&\s*!sbUser\s*\)\s*return/
        );
    });

    test('_authReady only resolves on a populated user (positive signal)', () => {
        // Defense-in-depth against any null leaking through into
        // _onAuthStateChanged from EITHER backend (Firebase fires null for
        // Supabase-only users). The 15s timeout below still catches
        // genuinely-unauthenticated cold loads, so callers don't hang.
        expect(src).toMatch(
            /if\s*\(_authReadyResolve\s*&&\s*user\)\s*\{\s*_authReadyResolve\(user\);\s*_authReadyResolve\s*=\s*null;\s*\}/
        );
        // The pre-fix unconditional resolve must be gone — that's the line
        // that poisoned _authReady with null on the first bridge fire.
        expect(src).not.toMatch(
            /^\s*if\s*\(_authReadyResolve\)\s*\{\s*_authReadyResolve\(user\);\s*_authReadyResolve\s*=\s*null;\s*\}/m
        );
    });

    test('15s safety timeout still resolves _authReady with null as the last-resort fallback', () => {
        // Without this, genuinely-unauthenticated users would hang forever
        // on Auth.ready() since the tightening above rejects null
        // resolutions. The timeout is the escape hatch.
        expect(src).toContain('READY_TIMEOUT_MS = 15000');
        expect(src).toMatch(/_authReadyResolve\(null\)/);
    });

    test('belt-and-suspenders mirror against SupabaseAuth.user is still wired', () => {
        // PR #98's additive hardening — re-read SupabaseAuth.user after
        // registering the listener so we catch the restored session even if
        // the SDK never fires a usable event for it. The conservative guard
        // makes this a redundant safety net rather than the primary path,
        // but it stays as cheap insurance.
        expect(src).toContain('SupabaseAuth.user && !_user');
        expect(src).toMatch(/SupabaseAuth\.ready\(\)\)\.then\(_mirrorSb\)/);
    });
});
