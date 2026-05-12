/**
 * js/supabase-auth.js — Path B Phase 3 Supabase Auth client.
 *
 * Mirrors the slice of js/auth.js that downstream code depends on, but
 * talks to Supabase Auth (email + password + MFA factors) instead of Firebase.
 * Supabase is the default auth backend unless SYNC_BACKEND is explicitly set
 * to "firebase"; in Supabase mode it drives the login modal and enforces
 * mandatory MFA enrollment for any account that has cloud sync enabled.
 *
 * The Firebase path remains available behind the explicit "firebase" backend
 * flag while the app finishes moving to Supabase.
 *
 * Public surface (parallel to window.Auth):
 *   SupabaseAuth.init()                 — wires up the onAuthStateChange listener
 *   SupabaseAuth.signIn(email, pw)      — email + password sign-in
 *   SupabaseAuth.signUp(email, pw, opts)— email + password signup (no email verify bypass)
 *   SupabaseAuth.sendPasswordReset(email)
 *   SupabaseAuth.logout()
 *   SupabaseAuth.uid / email / isSignedIn / isAdmin / isBlocked
 *   SupabaseAuth.apiFetch(url, opts)    — injects the access token as a Bearer
 *   SupabaseAuth.addAuthListener(fn)    — symmetric to Auth.onAuthChange
 *   SupabaseAuth.enrollTOTP()           — returns { factorId, qrCode, secret }
 *   SupabaseAuth.verifyTOTP(code)       — completes enrollment or challenge
 *   SupabaseAuth.mfaRequired            — true when cloud sync is on and no verified factor
 *   SupabaseAuth.recordMfaDismiss()     — bumps user_metadata.mfa_dismiss_count
 *
 * Admin / block flags live on app_metadata (is_admin, is_blocked). Writing
 * them is done server-side only via api/admin-supabase.js using the
 * service-role key; this module only reads them.
 */

'use strict';

window.SupabaseAuth = (() => {
    const MFA_HARD_ENFORCE_DISMISSES = 3;
    const MFA_HARD_ENFORCE_DAYS = 14;

    let _session = null;
    let _user = null;
    let _factors = null;         // Cached listFactors() result; refreshed after auth events.
    let _authSubscription = null;
    let _listeners = [];
    let _inited = false;

    let _authReadyResolve;
    const _authReady = new Promise(resolve => { _authReadyResolve = resolve; });
    setTimeout(() => { if (_authReadyResolve) { _authReadyResolve(null); _authReadyResolve = null; } }, 5000);

    function _enabled() {
        try { return localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND) !== 'firebase'; }
        catch { return true; }
    }

    function _client() {
        const sb = window.Supabase;
        return (sb && sb.isReady && sb.client) ? sb.client : null;
    }

    function _cloudSyncEnabled() {
        // Match CloudSync.disabledByUser: opt-out flag exempts the user from MFA.
        try { return localStorage.getItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED) !== 'true'; }
        catch { return true; }
    }

    function _meta() {
        return (_user && _user.user_metadata) || {};
    }

    function _appMeta() {
        return (_user && _user.app_metadata) || {};
    }

    function _factorType(factor) {
        return String((factor && (factor.factor_type || factor.type)) || '').toLowerCase();
    }

    function _factorList() {
        if (!_factors) return [];
        const out = [];
        const seen = new Set();
        Object.keys(_factors).forEach(key => {
            const bucket = _factors[key];
            if (!Array.isArray(bucket)) return;
            bucket.forEach(factor => {
                if (!factor) return;
                const id = factor.id || `${_factorType(factor)}:${out.length}`;
                if (seen.has(id)) return;
                seen.add(id);
                out.push(factor);
            });
        });
        return out;
    }

    function _isWebAuthnFactor(factor) {
        const type = _factorType(factor);
        return type === 'webauthn' || type === 'passkey' || type === 'security_key';
    }

    function _hasVerifiedFactor(predicate) {
        const factors = _factorList();
        if (!Array.isArray(factors)) return false;
        return factors.some(factor => {
            if (!factor || factor.status !== 'verified') return false;
            return typeof predicate === 'function' ? predicate(factor) : true;
        });
    }

    async function _refreshFactors() {
        const client = _client();
        if (!client || !client.auth || !client.auth.mfa || typeof client.auth.mfa.listFactors !== 'function') {
            _factors = null;
            return;
        }
        try {
            const { data, error } = await client.auth.mfa.listFactors();
            if (error) {
                console.warn('[SupabaseAuth] listFactors failed:', error.message || error);
                _factors = null;
            } else {
                _factors = data || null;
            }
        } catch (e) {
            console.warn('[SupabaseAuth] listFactors threw:', e && e.message);
            _factors = null;
        }
    }

    function _onAuthChange(event, session) {
        _session = session || null;
        _user = _session ? _session.user : null;

        if (_authReadyResolve) { _authReadyResolve(_user); _authReadyResolve = null; }

        // Factor list depends on the signed-in user; refresh lazily.
        const factorsReady = _user
            ? _refreshFactors()
            : Promise.resolve().then(() => { _factors = null; });
        factorsReady.then(() => {
            // Block immediately if the server-side admin flipped is_blocked.
            if (_user && _meta().is_blocked === true) {
                console.warn('[SupabaseAuth] User is blocked — signing out');
                logout().catch(() => {});
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast('Your account has been blocked. Contact your administrator.', { type: 'error', duration: 6000 });
                }
                return;
            }
            _listeners.forEach(fn => {
                try { fn(_user, event); } catch (e) { console.error('[SupabaseAuth] Listener error:', e); }
            });
        });
    }

    async function init() {
        if (_inited) return true;
        if (!_enabled()) return false;

        if (!window.Supabase || typeof window.Supabase.init !== 'function') {
            console.warn('[SupabaseAuth] window.Supabase missing — staying dormant');
            return false;
        }
        const ready = await window.Supabase.init();
        if (!ready) return false;

        const client = _client();
        if (!client || !client.auth) return false;

        // Hydrate from the persisted session before firing listeners.
        try {
            const { data } = await client.auth.getSession();
            _session = (data && data.session) || null;
            _user = _session ? _session.user : null;
            if (_authReadyResolve) { _authReadyResolve(_user); _authReadyResolve = null; }
            if (_user) await _refreshFactors();
        } catch (e) {
            console.warn('[SupabaseAuth] getSession failed:', e && e.message);
        }

        const { data: sub } = client.auth.onAuthStateChange((event, session) => _onAuthChange(event, session));
        _authSubscription = sub && sub.subscription ? sub.subscription : null;
        _inited = true;
        return true;
    }

    async function signIn(email, password) {
        const client = _client();
        if (!client) throw new Error('Supabase not initialized');
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange may arrive after the login modal checks
        // mfaEnforcementLevel(), so hydrate immediately and refresh factors
        // before returning to the caller.
        if (data && data.session) {
            _session = data.session;
            _user = data.session.user || null;
            if (_authReadyResolve) { _authReadyResolve(_user); _authReadyResolve = null; }
            if (_user) await _refreshFactors();
            else _factors = null;
        }
        return data;
    }

    async function signUp(email, password, opts = {}) {
        const client = _client();
        if (!client) throw new Error('Supabase not initialized');
        const payload = {
            email,
            password,
            options: {
                // Phase 3 does not wire email verification links to a custom URL;
                // Supabase default redirect is fine for the parallel login modal.
                data: opts.metadata || {},
            },
        };
        const { data, error } = await client.auth.signUp(payload);
        if (error) throw error;
        if (data && data.session) {
            _session = data.session;
            _user = data.session.user || null;
            if (_authReadyResolve) { _authReadyResolve(_user); _authReadyResolve = null; }
            if (_user) await _refreshFactors();
            else _factors = null;
        }
        return data;
    }

    async function sendPasswordReset(email) {
        const client = _client();
        if (!client) throw new Error('Supabase not initialized');
        const { error } = await client.auth.resetPasswordForEmail(email);
        if (error) throw error;
        return true;
    }

    async function logout() {
        const client = _client();
        if (!client) return;
        try { await client.auth.signOut(); } catch (e) {
            console.warn('[SupabaseAuth] signOut failed:', e && e.message);
        }
        _session = null;
        _user = null;
        _factors = null;
    }

    async function getAccessToken() {
        const client = _client();
        if (!client) return null;
        try {
            const { data } = await client.auth.getSession();
            return (data && data.session && data.session.access_token) || null;
        } catch { return null; }
    }

    async function apiFetch(url, options = {}) {
        // Wait for the session to be hydrated from localStorage before
        // making the request — otherwise a call fired at window.onload
        // (e.g. loadPlacesAPI in app-boot.js) goes out with no Authorization
        // header because `getSession()` returns null before init completes,
        // and the server replies 401 even though the user IS signed in.
        // _authReady has a 5s safety timeout so this never hangs forever
        // when the user genuinely isn't signed in.
        if (!_inited) {
            try { await _authReady; } catch (_) { /* timeout — fall through */ }
        }
        const token = await getAccessToken();
        if (token) {
            options = {
                ...options,
                headers: { ...(options.headers || {}), 'Authorization': `Bearer ${token}` },
            };
        }
        return fetch(url, options);
    }

    // ── MFA ─────────────────────────────────────────────────────────────

    async function enrollTOTP() {
        const client = _client();
        if (!client) throw new Error('Supabase not initialized');
        const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp' });
        if (error) throw error;
        // data.totp.qr_code is an SVG data URL; data.totp.secret is the Base32 secret.
        return {
            factorId: data.id,
            qrCode: data.totp && data.totp.qr_code,
            secret: data.totp && data.totp.secret,
            uri: data.totp && data.totp.uri,
        };
    }

    async function verifyTOTP(factorId, code) {
        const client = _client();
        if (!client) throw new Error('Supabase not initialized');
        // A fresh enrollment requires a challenge → verify sequence; an
        // already-enrolled factor used for step-up auth does too. Same shape.
        const challenge = await client.auth.mfa.challenge({ factorId });
        if (challenge.error) throw challenge.error;
        const { data, error } = await client.auth.mfa.verify({
            factorId,
            challengeId: challenge.data.id,
            code,
        });
        if (error) throw error;
        // Factor is now 'verified' server-side; refresh the cache so mfaRequired
        // flips false without another round-trip.
        await _refreshFactors();
        return data;
    }

    async function unenrollTOTP(factorId) {
        const client = _client();
        if (!client) throw new Error('Supabase not initialized');
        const { error } = await client.auth.mfa.unenroll({ factorId });
        if (error) throw error;
        await _refreshFactors();
        return true;
    }

    // ── WebAuthn / passkey MFA ───────────────────────────────────────────
    //
    // Requires @supabase/auth-js >= 2.73 (bundled in supabase-js >= 2.74).
    // The SDK exposes client.auth.mfa.webauthn.{register,authenticate} which
    // wrap navigator.credentials.{create,get} and the enroll → challenge →
    // verify round-trip into one call.
    //
    // RP id: defaults to the current origin's hostname. Passkeys are bound
    // to that, so altech.agency credentials won't be portable to other domains.

    function _passkeySupported() {
        // PublicKeyCredential is the WebAuthn entry point. Available in all
        // modern browsers; absent in JSDOM (tests) and old IE/Safari.
        return typeof window !== 'undefined'
            && typeof window.PublicKeyCredential === 'function'
            && typeof navigator !== 'undefined'
            && navigator.credentials
            && typeof navigator.credentials.create === 'function';
    }

    /**
     * Enroll a WebAuthn passkey factor for the currently signed-in user.
     * Triggers the platform's native authenticator UI (Face ID / Touch ID /
     * Windows Hello / hardware key) — must be called from a user gesture.
     *
     * @param {{friendlyName?: string}} opts — friendlyName defaults to a
     *   short device label derived from the user agent.
     * @returns {Promise<{id?: string}>} factor info on success.
     */
    async function enrollPasskey(opts = {}) {
        const client = _client();
        if (!client) throw new Error('Supabase not initialized');
        if (!_passkeySupported()) {
            throw new Error('This browser does not support passkeys (WebAuthn).');
        }
        const wa = client.auth.mfa && client.auth.mfa.webauthn;
        if (!wa || typeof wa.register !== 'function') {
            throw new Error('Passkey MFA unavailable — Supabase SDK is too old. Upgrade to supabase-js >= 2.74.');
        }
        const friendlyName = opts.friendlyName || _defaultPasskeyName();
        const { data, error } = await wa.register({ friendlyName });
        if (error) {
            await _refreshFactors();
            if (_hasVerifiedFactor(_isWebAuthnFactor)) {
                return { alreadyEnrolled: true };
            }
            throw error;
        }
        // Refresh the factor cache so mfaRequired() / hasVerifiedFactor() flips
        // immediately. register() returns a session-bearing response, so the
        // factor is verified on land.
        await _refreshFactors();
        return data;
    }

    /**
     * Step-up authenticate an existing passkey factor. Used when a returning
     * user signs in with email+password and has a verified webauthn factor.
     * Browser prompts for the passkey (no friendly name needed — the factor
     * is identified by id).
     */
    async function authenticatePasskey(factorId) {
        const client = _client();
        if (!client) throw new Error('Supabase not initialized');
        if (!_passkeySupported()) {
            throw new Error('This browser does not support passkeys (WebAuthn).');
        }
        const wa = client.auth.mfa && client.auth.mfa.webauthn;
        if (!wa || typeof wa.authenticate !== 'function') {
            throw new Error('Passkey MFA unavailable — Supabase SDK is too old.');
        }
        const { data, error } = await wa.authenticate({
            factorId,
            webauthn: {}, // empty — SDK derives rpId/rpOrigins from window.location
        });
        if (error) throw error;
        await _refreshFactors();
        return data;
    }

    function _defaultPasskeyName() {
        try {
            const ua = navigator.userAgent || '';
            // Best-effort short label: "Chrome on macOS", "Safari on iPhone".
            // Used purely for the user's later "manage passkeys" view.
            let browser = 'Browser';
            if (/Edg\//.test(ua)) browser = 'Edge';
            else if (/Chrome\//.test(ua)) browser = 'Chrome';
            else if (/Safari\//.test(ua)) browser = 'Safari';
            else if (/Firefox\//.test(ua)) browser = 'Firefox';
            let os = 'this device';
            if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
            else if (/Android/.test(ua)) os = 'Android';
            else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
            else if (/Windows/.test(ua)) os = 'Windows';
            else if (/Linux/.test(ua)) os = 'Linux';
            return `${browser} on ${os}`;
        } catch { return 'This device'; }
    }

    /**
     * Returns whether the user must enroll at least one verified MFA factor
     * before cloud sync is allowed to run. Opt-out users (local-only) are
     * exempt. Supabase listFactors() returns server-owned factor status, so a
     * verified TOTP, phone, or WebAuthn factor satisfies the gate.
     */
    function mfaRequired() {
        if (!_user) return false;
        if (!_cloudSyncEnabled()) return false;
        return !_hasVerifiedFactor();
    }

    /**
     * Returns `"soft" | "hard" | null`. `null` means no enrollment needed.
     * `soft` means show the modal but allow "Set up later"; `hard` means the
     * modal cannot be dismissed. Hard triggers after MFA_HARD_ENFORCE_DISMISSES
     * dismissals OR MFA_HARD_ENFORCE_DAYS since first prompt — whichever hits
     * first. Timestamps live in user_metadata so they survive across devices.
     */
    function mfaEnforcementLevel() {
        if (!mfaRequired()) return null;
        const m = _meta();
        const dismisses = Number(m.mfa_dismiss_count || 0);
        const firstSeen = m.mfa_first_prompt_at ? Date.parse(m.mfa_first_prompt_at) : 0;
        const now = Date.now();
        const daysSince = firstSeen ? (now - firstSeen) / (24 * 60 * 60 * 1000) : 0;
        if (dismisses >= MFA_HARD_ENFORCE_DISMISSES) return 'hard';
        if (firstSeen && daysSince >= MFA_HARD_ENFORCE_DAYS) return 'hard';
        return 'soft';
    }

    /**
     * Record that the user dismissed the TOTP enrollment modal. Bumps the
     * dismiss counter and stamps the first-seen timestamp on the first call.
     * Stored in user_metadata via updateUser — the user can always rewrite
     * their own metadata under default Supabase policies.
     */
    async function recordMfaDismiss() {
        const client = _client();
        if (!client || !_user) return false;
        const m = _meta();
        const patch = {
            mfa_dismiss_count: Number(m.mfa_dismiss_count || 0) + 1,
        };
        if (!m.mfa_first_prompt_at) patch.mfa_first_prompt_at = new Date().toISOString();
        try {
            const { data, error } = await client.auth.updateUser({ data: patch });
            if (error) { console.warn('[SupabaseAuth] recordMfaDismiss failed:', error.message); return false; }
            if (data && data.user) _user = data.user;
            return true;
        } catch (e) {
            console.warn('[SupabaseAuth] recordMfaDismiss threw:', e && e.message);
            return false;
        }
    }

    // ── Listener plumbing ──────────────────────────────────────────────

    function addAuthListener(fn) {
        if (typeof fn !== 'function') return;
        if (_listeners.includes(fn)) return;
        _listeners.push(fn);
        // Fire immediately with current state for symmetry with Auth.onAuthChange.
        try { fn(_user, 'INITIAL'); } catch (e) { console.error('[SupabaseAuth] Listener error:', e); }
    }

    function removeAuthListener(fn) {
        _listeners = _listeners.filter(f => f !== fn);
    }

    return {
        get enabled() { return _enabled(); },
        get user() { return _user; },
        get session() { return _session; },
        get uid() { return _user ? _user.id : null; },
        get email() { return _user ? _user.email || null : null; },
        get isSignedIn() { return !!_user; },
        get isAdmin() {
            // app_metadata is server-managed (service-role only); user_metadata
            // is self-editable. Admin flag is intentionally stored on
            // app_metadata — user_metadata mirror is a read-only legacy surface.
            const app = _appMeta();
            if (app && app.is_admin === true) return true;
            // Backwards-compat: older seeded accounts may have the flag on
            // user_metadata. The admin-supabase.js endpoint migrates these on
            // the next write.
            return _meta().is_admin === true;
        },
        get isBlocked() {
            const app = _appMeta();
            if (app && app.is_blocked === true) return true;
            return _meta().is_blocked === true;
        },

        ready() { return _authReady; },
        getAccessToken,

        init,
        signIn,
        signUp,
        sendPasswordReset,
        logout,
        apiFetch,

        enrollTOTP,
        verifyTOTP,
        unenrollTOTP,
        enrollPasskey,
        authenticatePasskey,
        passkeySupported: _passkeySupported,
        mfaRequired,
        mfaEnforcementLevel,
        hasVerifiedFactor: _hasVerifiedFactor,
        recordMfaDismiss,

        addAuthListener,
        removeAuthListener,

        // Exposed for tests: lets the harness force-refresh factors after
        // mutating a mock client, without having to wait for an auth event.
        _refreshFactors,
        _onAuthChange,
    };
})();
