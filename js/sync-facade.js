// js/sync-facade.js — Phase D backend router.
//
// Routes window.Sync / window.AuthFacade calls to the Supabase stack
// (SupabaseSync + SupabaseAuth). The Firebase stack (CloudSync + Auth)
// is no longer the default — the May 2026 "drop Firebase" pass flipped
// SYNC_BACKEND to 'supabase' as the default and left the Firebase code
// in place as a one-release fallback. A user can opt back to Firebase
// only by explicitly setting localStorage[SYNC_BACKEND]='firebase';
// every fresh install uses Supabase.
//
// Phase D follow-ups (one release later): delete cloud-sync.js,
// firebase-config.js, auth.js, admin-panel.js — they're already dead code
// for any user who doesn't explicitly opt back in.

'use strict';

(function () {
    function backend() {
        try {
            // Phase D (May 2026): default flipped to 'supabase'. Only an explicit
            // 'firebase' value falls back — every other value (including missing
            // key) routes to Supabase.
            return localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND) === 'firebase'
                ? 'firebase'
                : 'supabase';
        } catch {
            return 'supabase';
        }
    }

    function legacy() { return (typeof window !== 'undefined') ? window.CloudSync : undefined; }
    function modern() { return (typeof window !== 'undefined') ? window.SupabaseSync : undefined; }

    function call(method, args, defaultValue) {
        const target = backend() === 'supabase' ? modern() : legacy();
        if (target && typeof target[method] === 'function') {
            return target[method].apply(target, args);
        }
        return defaultValue;
    }

    function callSupabase(method, args, defaultValue) {
        const target = modern();
        if (target && typeof target[method] === 'function') {
            return target[method].apply(target, args);
        }
        return defaultValue;
    }

    // Phase 3 MFA gate: on Supabase, block every push until the user has a
    // verified TOTP factor. Opt-out users (CLOUD_SYNC_DISABLED=true) are
    // exempt — SupabaseAuth.mfaRequired() already checks that and returns
    // false. Firebase path is untouched; it has no MFA requirement.
    function mfaBlocksSync() {
        if (backend() !== 'supabase') return false;
        const sa = (typeof window !== 'undefined') ? window.SupabaseAuth : undefined;
        if (!sa || typeof sa.mfaRequired !== 'function') return false;
        return sa.mfaRequired();
    }

    // Agency policy gate: cloud sync is admin-only until Path B Phase 4 ships
    // E2E encryption. Enforced at the facade layer so both Firebase and
    // Supabase backends are covered. Defaults to "blocked" if Auth isn't
    // loaded yet (fail-closed on boot).
    function policyBlocksSync() {
        if (typeof window === 'undefined') return true;
        const a = window.Auth;
        if (!a) return true;
        return a.isAdmin !== true;
    }

    // Combined gate: either MFA missing or non-admin policy. Writes are
    // blocked; reads stay open so a demoted admin can still inspect their
    // local data, and so admins during the brief pre-profile-load boot
    // window aren't fully cut off.
    function writeBlocked() {
        return mfaBlocksSync() || policyBlocksSync();
    }

    const Sync = {
        get backend() { return backend(); },
        get isSupabase() { return backend() === 'supabase'; },
        get mfaBlocked() { return mfaBlocksSync(); },
        get policyBlocked() { return policyBlocksSync(); },

        // ── Methods shared by both backends ──
        schedulePush(...args)   {
            if (writeBlocked()) return undefined;
            return call('schedulePush', args);
        },
        pushToCloud(...args)    {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return call('pushToCloud', args, Promise.resolve());
        },
        pullFromCloud(...args)  { return call('pullFromCloud', args, Promise.resolve()); },
        fullSync(...args)       {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return call('fullSync', args, Promise.resolve());
        },
        refreshUI(...args)      { return call('refreshUI', args); },
        deleteCloudData(...args){ return call('deleteCloudData', args, Promise.resolve()); },

        // ── Supabase-only methods (no-op on Firebase) ──
        // Writes are MFA + policy gated; reads are not (a signed-in user
        // without TOTP, or a demoted admin, still needs to be able to pull
        // their data to migrate or inspect it).
        init(...args)        { return callSupabase('init', args, Promise.resolve(false)); },
        pushBlob(...args)    {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return callSupabase('pushBlob', args, Promise.resolve({ ok: false, skipped: true }));
        },
        pullBlob(...args)    { return callSupabase('pullBlob', args, Promise.resolve(null)); },
        deleteBlob(...args)  {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return callSupabase('deleteBlob', args, Promise.resolve({ ok: false, skipped: true }));
        },
        pushQuote(...args)   {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return callSupabase('pushQuote', args, Promise.resolve({ ok: false, skipped: true }));
        },
        pullQuote(...args)   { return callSupabase('pullQuote', args, Promise.resolve(null)); },
        listQuotes(...args)  { return callSupabase('listQuotes', args, Promise.resolve([])); },
        // Recovery: pulls plain-JSON blobs from Supabase + decrypts + writes
        // to localStorage. No-op on Firebase (CloudSync.pullFromCloud already
        // covers that path). Returns { restored, skipped, failed } from
        // SupabaseSync.restoreFromCloud.
        restoreFromCloud(...args) { return callSupabase('restoreFromCloud', args, Promise.resolve({ restored: [], skipped: ['firebase-backend'], failed: [] })); },
        deleteQuote(...args) {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return callSupabase('deleteQuote', args, Promise.resolve({ ok: false, skipped: true }));
        },
    };

    window.Sync = Sync;

    // ── Auth facade ────────────────────────────────────────────────────
    //
    // Routes the small handful of signin/signout/listener calls that the
    // Phase 3 login modal and Phase 4 migration flow need. Every existing
    // call site that reads `Auth.uid`, `Auth.apiFetch`, etc. continues to
    // hit the Firebase `Auth` singleton directly — the facade only matters
    // for code that must switch depending on SYNC_BACKEND.

    function legacyAuth() { return (typeof window !== 'undefined') ? window.Auth : undefined; }
    function modernAuth() { return (typeof window !== 'undefined') ? window.SupabaseAuth : undefined; }

    function activeAuth() { return backend() === 'supabase' ? modernAuth() : legacyAuth(); }

    const AuthFacade = {
        get backend() { return backend(); },
        get isSupabase() { return backend() === 'supabase'; },

        // Active underlying module — callers can reach for provider-specific
        // methods without re-resolving the flag themselves.
        get active() { return activeAuth(); },
        get firebase() { return legacyAuth(); },
        get supabase() { return modernAuth(); },

        // Shared read-only surface. Falls through to whichever backend the
        // flag selects. Each getter tolerates a missing module (script load
        // order hiccups, tests that don't load auth.js, etc.).
        get uid() {
            const a = activeAuth();
            return a ? (typeof a.uid === 'function' ? a.uid() : a.uid) || null : null;
        },
        get email() {
            const a = activeAuth();
            return a ? (typeof a.email === 'function' ? a.email() : a.email) || null : null;
        },
        get isSignedIn() {
            const a = activeAuth();
            return !!(a && (typeof a.isSignedIn === 'function' ? a.isSignedIn() : a.isSignedIn));
        },
        get isAdmin() {
            const a = activeAuth();
            return !!(a && (typeof a.isAdmin === 'function' ? a.isAdmin() : a.isAdmin));
        },
        get isBlocked() {
            const a = activeAuth();
            return !!(a && (typeof a.isBlocked === 'function' ? a.isBlocked() : a.isBlocked));
        },

        async signIn(email, password) {
            const a = activeAuth();
            if (!a) throw new Error('No auth backend available');
            if (backend() === 'supabase') return a.signIn(email, password);
            // Firebase Auth exposes .login, not .signIn.
            if (typeof a.login === 'function') return a.login(email, password);
            if (typeof a.signIn === 'function') return a.signIn(email, password);
            throw new Error('Active auth backend does not support signIn');
        },

        async signUp(email, password, opts) {
            const a = activeAuth();
            if (!a) throw new Error('No auth backend available');
            if (backend() === 'supabase') return a.signUp(email, password, opts);
            if (typeof a.signup === 'function') return a.signup(email, password, opts && opts.displayName);
            if (typeof a.signUp === 'function') return a.signUp(email, password, opts);
            throw new Error('Active auth backend does not support signUp');
        },

        async sendPasswordReset(email) {
            const a = activeAuth();
            if (!a) throw new Error('No auth backend available');
            if (backend() === 'supabase') return a.sendPasswordReset(email);
            if (typeof a.resetPassword === 'function') return a.resetPassword(email);
            if (typeof a.sendPasswordReset === 'function') return a.sendPasswordReset(email);
            throw new Error('Active auth backend does not support password reset');
        },

        async logout() {
            const a = activeAuth();
            if (a && typeof a.logout === 'function') return a.logout();
        },

        async apiFetch(url, options) {
            const a = activeAuth();
            if (a && typeof a.apiFetch === 'function') return a.apiFetch(url, options);
            return fetch(url, options);
        },

        onAuthStateChange(fn) {
            const a = activeAuth();
            if (!a) return;
            // Firebase flavor calls this `onAuthChange`; Supabase flavor uses
            // `addAuthListener`. Accept either to keep callers terse.
            if (typeof a.onAuthChange === 'function') return a.onAuthChange(fn);
            if (typeof a.addAuthListener === 'function') return a.addAuthListener(fn);
        },
    };

    window.AuthFacade = AuthFacade;

    // ── Phase D: Firebase-SDK-not-loaded shim ──────────────────────────────
    //
    // When the Firebase compat scripts aren't on the page (the default
    // post-Phase-D state), the existing `window.Auth` singleton from
    // js/auth.js still exists but its underlying `firebase.auth()` is
    // undefined — all its methods would throw. The 25+ plugins that call
    // `Auth.apiFetch / Auth.isSignedIn / Auth.uid / Auth.isAdmin` directly
    // (rather than through AuthFacade) would break en masse.
    //
    // Fix: at the end of facade setup, detect missing Firebase SDK and
    // REPLACE `window.Auth` with a proxy that routes the legacy surface
    // through AuthFacade (which in turn hits SupabaseAuth). Existing
    // callers keep working unchanged; SupabaseAuth handles auth.
    function _firebaseSdkAvailable() {
        return typeof window !== 'undefined'
            && typeof window.firebase !== 'undefined'
            && typeof window.firebase.initializeApp === 'function';
    }
    // The real Firebase Auth singleton (js/auth.js) defines an `init` method
    // AND `login` method. Tests that mock `window.Auth = { isAdmin, uid, ... }`
    // typically don't bother adding these. If neither is present, treat the
    // existing Auth as a test mock (or absent) and skip the shim — replacing
    // a deliberate test mock would invalidate the test setup.
    function _isRealFirebaseAuthSingleton() {
        if (typeof window === 'undefined') return false;
        const a = window.Auth;
        return !!(a && typeof a.init === 'function' && typeof a.login === 'function');
    }
    // Surgical patch: when Firebase SDK isn't loaded but the legacy `Auth`
    // singleton (js/auth.js) still defines `apiFetch`, that method would
    // happily send unauthenticated requests (no bearer token) because
    // `firebase.auth().currentUser.getIdToken()` would throw. Every
    // auth-required endpoint would 401. Override ONLY `apiFetch` to
    // delegate to SupabaseAuth.apiFetch (which sends a Supabase JWT). All
    // other Auth properties (uid, isSignedIn, isAdmin, login, ready, etc.)
    // stay untouched so test mocks aren't disturbed and any UI gates that
    // depend on `Auth.isSignedIn` continue to read the legacy value (false
    // when Firebase isn't loaded — UI shows signed-out state, which is the
    // safe default).
    if (typeof window !== 'undefined' && _isRealFirebaseAuthSingleton()) {
        const _origAuth = window.Auth;
        const _origApiFetch = typeof _origAuth.apiFetch === 'function'
            ? _origAuth.apiFetch.bind(_origAuth)
            : null;
        try {
            Object.defineProperty(_origAuth, 'apiFetch', {
                configurable: true,
                writable: true,
                value(url, options) {
                    // LIVE check: Firebase may be lazy-loaded or mocked AFTER
                    // sync-facade.js runs (some test setups mock firebase in
                    // beforeEach). Re-check on every call so the legacy
                    // Auth.apiFetch wins when Firebase IS available, and the
                    // SupabaseAuth fallback only kicks in when it genuinely
                    // isn't.
                    if (_firebaseSdkAvailable() && _origApiFetch) {
                        return _origApiFetch(url, options);
                    }
                    const sa = modernAuth();
                    if (sa && typeof sa.apiFetch === 'function') {
                        return sa.apiFetch(url, options);
                    }
                    if (_origApiFetch) return _origApiFetch(url, options);
                    return fetch(url, options);
                },
            });
        } catch { /* property non-configurable — no-op */ }
    }
})();
