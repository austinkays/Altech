/**
 * Authentication Module
 * Email + Password auth via Firebase Authentication
 * 
 * Provides: signup, login, logout, password reset, auth state management
 * UI: Modal dialog with login/signup/reset forms + header user indicator
 */

const Auth = (() => {
    let _user = null;
    let _isAdmin = false;
    let _isBlocked = false;
    let _listeners = [];
    let _modalEl = null;

    // ── Path B Phase 3 backend routing ──
    // Phase D default: Supabase handles auth unless the user explicitly opts
    // back to Firebase with SYNC_BACKEND=firebase. This keeps the login modal
    // aligned with Sync/AuthFacade, which already treat a missing backend flag
    // as Supabase.
    function _useSupabase() {
        try {
            return localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND) !== 'firebase'
                && typeof window.SupabaseAuth !== 'undefined';
        } catch {
            return typeof window.SupabaseAuth !== 'undefined';
        }
    }

    // Promise that resolves once Firebase auth state is first known (signed in or out)
    let _authReadyResolve;
    const _authReady = new Promise(resolve => { _authReadyResolve = resolve; });
    // Safety timeout: resolve _authReady after 15s even if Firebase never fires
    // onAuthStateChanged. Previously 5s, which was too tight on slow cellular
    // networks — callers awaiting ready() saw `null` and skipped the initial
    // sync even though Firebase eventually came online seconds later. The
    // _onAuthStateChanged listener still fires whenever Firebase responds, so
    // long-running tasks can subscribe via Auth.onAuthChange / whenSignedIn for
    // a real "signed in" signal rather than a "status known" signal.
    const READY_TIMEOUT_MS = 15000;
    let _authTimedOut = false;
    setTimeout(() => {
        if (_authReadyResolve) {
            _authTimedOut = true;
            _authReadyResolve(null);
            _authReadyResolve = null;
        }
    }, READY_TIMEOUT_MS);

    // Translate a Supabase user object into the Firebase-ish shape the rest
    // of this module (and consumers via `Auth.user`) already understand. The
    // getters at the bottom read `uid` / `email` / `displayName` /
    // `emailVerified` / `getIdToken()` — we synthesize all four. Returning
    // null preserves the "signed out" semantics for the same callback.
    function _normalizeSupabaseUser(sbUser) {
        if (!sbUser) return null;
        const meta = sbUser.user_metadata || {};
        const displayName = meta.display_name || meta.full_name || meta.name || '';
        return {
            uid: sbUser.id,
            email: sbUser.email || '',
            displayName,
            // Firebase exposes a boolean; Supabase exposes a timestamp string.
            emailVerified: !!sbUser.email_confirmed_at || !!sbUser.confirmed_at,
            // Consumers that call `getIdToken()` (cloud-sync, secure-storage)
            // get the Supabase access token instead — same JWT semantics from
            // the consumer's POV.
            getIdToken: async () => {
                try {
                    if (typeof SupabaseAuth !== 'undefined' && typeof SupabaseAuth.getAccessToken === 'function') {
                        return await SupabaseAuth.getAccessToken();
                    }
                } catch (_) { /* fall through */ }
                return null;
            },
            _backend: 'supabase',
            _raw: sbUser,
        };
    }

    function _isSupabaseUser(user) {
        return !!(user && user._backend === 'supabase');
    }

    let _supabaseRestoreInFlight = false;
    async function _restoreSupabaseCloudAfterSignIn() {
        if (_supabaseRestoreInFlight) return;

        // Row-encrypted Supabase blobs need the v2 vault key. If the vault is
        // still locked, vault-ui's unlock handlers will run this same restore
        // after the user supplies the passphrase/passkey.
        try {
            if (typeof CryptoHelper !== 'undefined'
                && typeof CryptoHelper.isV2Unlocked === 'function'
                && !CryptoHelper.isV2Unlocked()) {
                return;
            }
        } catch (_) { return; }

        const sync = (typeof window !== 'undefined' && window.Sync && typeof window.Sync.restoreFromCloud === 'function')
            ? window.Sync
            : ((typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.restoreFromCloud === 'function') ? SupabaseSync : null);
        if (!sync) return;

        _supabaseRestoreInFlight = true;
        try {
            const result = await sync.restoreFromCloud();
            if (result && result.restored && result.restored.length) {
                console.log('[Auth] Restored Supabase docs after sign-in:', result.restored);
                try { if (typeof Reminders !== 'undefined' && Reminders.init) Reminders.init(); } catch (e) { console.warn('[Auth] reminders re-init failed:', e); }
                try { if (typeof ComplianceDashboard !== 'undefined' && ComplianceDashboard.init) ComplianceDashboard.init(); } catch (_) {}
                try { if (typeof DashboardWidgets !== 'undefined' && DashboardWidgets.refreshAll) DashboardWidgets.refreshAll(); } catch (_) {}
            } else if (result && result.failed && result.failed.length) {
                console.warn('[Auth] Supabase restore after sign-in could not decrypt:', result.failed);
            }
        } catch (e) {
            console.warn('[Auth] Supabase restore after sign-in failed:', e && e.message);
        } finally {
            _supabaseRestoreInFlight = false;
        }
    }

    // ── Auth state change callback ──
    function _onAuthStateChanged(user) {
        // Defense-in-depth against the same race the conservative bridge
        // guard in Auth.init() addresses: only resolve `_authReady` from a
        // POSITIVE signal (a real user). A null first-event from any source
        // (Firebase reporting "no Firebase user" for a Supabase-only account,
        // or a future SDK regression) is a false-negative — every caller
        // awaiting `Auth.ready()` would see null, the auth gate in
        // app-navigation would open the Welcome Back modal, even though a
        // populated user event was arriving a few hundred ms later.
        //
        // The 15s safety timeout below still resolves with null for
        // genuinely unauthenticated cold loads, so callers can't hang
        // forever — that's the tradeoff. Worst case for an unauthenticated
        // user is a 15s wait on the first tool-tile click before the
        // sign-in modal appears; in exchange, authenticated users no longer
        // get falsely logged out on F5.
        if (_authReadyResolve && user) { _authReadyResolve(user); _authReadyResolve = null; }
        if (user && user._backend === 'supabase' && typeof SupabaseAuth !== 'undefined') {
            _isAdmin = SupabaseAuth.isAdmin === true;
            _isBlocked = SupabaseAuth.isBlocked === true;
        }
        _user = user;
        _updateHeaderUI(user);
        // Refresh landing greeting with user's name
        if (typeof App !== 'undefined' && App.updateLandingGreeting) {
            App.updateLandingGreeting();
        }
        _listeners.forEach(fn => {
            try { fn(user); } catch (e) { console.error('[Auth] Listener error:', e); }
        });

        if (user) {
            console.log('[Auth] Signed in:', user.email);
            // Upsert user profile to Firestore and check admin/blocked status
            _syncUserProfile(user).catch(e => console.warn('[Auth] Profile sync failed:', e));
            // Trigger cloud sync on login — but ONLY when this user is still on
            // the Firebase backend. Post-migration users are signed in via
            // SupabaseAuth and their data lives in user_blobs; pulling from
            // Firebase here would silently overwrite their localStorage with
            // stale pre-migration values and apparently delete reminders /
            // quick-ref / cgl state. This was the cause of the May 2026
            // "missing reminders" report.
            const onSupabase = _isSupabaseUser(user) || _useSupabase();
            if (onSupabase) {
                _restoreSupabaseCloudAfterSignIn();
            } else if (typeof CloudSync !== 'undefined' && CloudSync.pullFromCloud) {
                CloudSync.pullFromCloud().catch(e => console.error('[Auth] Initial sync failed:', e));
            }
            // Load subscription state for paywall
            if (typeof Paywall !== 'undefined' && Paywall.loadSubscription) {
                Paywall.loadSubscription().catch(e => console.warn('[Auth] Subscription load failed:', e));
            }
            // Retry Places API if not loaded yet (key endpoint requires auth)
            if (!window.google?.maps?.places && typeof window.loadPlacesAPI === 'function') {
                window.loadPlacesAPI();
            }
            // Refresh dashboard widgets now that auth data is available
            if (typeof DashboardWidgets !== 'undefined' && DashboardWidgets.refreshAll) {
                try { DashboardWidgets.refreshAll(); } catch (e) { /* ignore */ }
            }
        } else {
            _isAdmin = false;
            _isBlocked = false;
            console.log('[Auth] Signed out');
        }
    }

    // ── Firestore Profile Sync ──
    // Upserts the user's profile doc on login, reads back admin/blocked flags.
    // isAdmin and isBlocked are server-managed fields — never set from the client.
    // Bootstrap: After first deploy, manually set isAdmin=true on your user doc
    // in Firebase Console → Firestore → users/{your-uid}.
    async function _syncUserProfile(user) {
        if (!user || !FirebaseConfig.isReady) return;
        const db = FirebaseConfig.db;
        const uid = user.uid;
        const profileRef = db.collection('users').doc(uid);

        try {
            const snap = await profileRef.get();
            const now = new Date().toISOString();

            if (snap.exists) {
                // Update lastLogin + displayName
                const data = snap.data();
                await profileRef.update({
                    lastLogin: now,
                    displayName: user.displayName || data.displayName || '',
                    email: user.email || data.email || '',
                });
                _isAdmin = data.isAdmin === true;
                _isBlocked = data.isBlocked === true;
            } else {
                // First login — create profile doc (no admin/blocked fields — those are managed via admin panel)
                const profile = {
                    email: user.email || '',
                    displayName: user.displayName || '',
                    createdAt: now,
                    lastLogin: now,
                };
                await profileRef.set(profile);
                _isAdmin = false;
                _isBlocked = false;
            }

            // If blocked, sign them out immediately
            if (_isBlocked) {
                console.warn('[Auth] User is blocked — signing out');
                await FirebaseConfig.auth.signOut();
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast('Your account has been blocked. Contact your administrator.', { type: 'error', duration: 6000 });
                }
                return;
            }

            console.log(`[Auth] Profile synced — isAdmin: ${_isAdmin}`);

            // Push admin status to the Chrome extension immediately after Firestore confirms it.
            // This means the extension popup unlocks as soon as the user signs in on altech.agency
            // — no need to click "Send to Extension" first.
            window.postMessage({ type: 'ALTECH_ADMIN_UPDATE', isAdmin: _isAdmin }, '*');
        } catch (e) {
            // Firestore may not be reachable (offline) — fail safe: no admin access
            console.warn('[Auth] Profile sync error, admin access unavailable offline:', e.message);
            _isAdmin = false;
            _isBlocked = false;
        }

        // Update admin UI sections if modal is already open (handles async timing)
        _refreshAdminVisibility();
    }

    // ── Bridge-Ready Handshake ──
    // When the bridge content script loads (document_idle), it fires ALTECH_BRIDGE_READY.
    // We respond immediately with whichever _isAdmin value we currently have.
    // This solves the race: if Firebase auth already ran, the bridge gets the answer
    // instantly. If auth hasn't run yet, the reply sends _isAdmin=false (safe default),
    // and a second ALTECH_ADMIN_UPDATE fires once Firestore confirms the real value.
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'ALTECH_BRIDGE_READY') return;
        window.postMessage({ type: 'ALTECH_ADMIN_UPDATE', isAdmin: _isAdmin }, '*');
        console.log('[Auth] Bridge ready — replied with isAdmin:', _isAdmin);
    });

    /** Show/hide admin-only sections based on current _isAdmin state */
    function _refreshAdminVisibility() {
        const inviteSection = document.getElementById('authInviteSection');
        if (inviteSection) inviteSection.style.display = _isAdmin ? '' : 'none';
        const adminSection = document.getElementById('authAdminSection');
        if (adminSection) adminSection.style.display = _isAdmin ? '' : 'none';
    }

    // ── Header UI ──
    function _updateHeaderUI(user) {
        const btn = document.getElementById('authUserBtn');
        const indicator = document.getElementById('authUserIndicator');
        if (!btn) return;

        if (user) {
            const initial = (user.displayName || user.email || '?')[0].toUpperCase();
            btn.innerHTML = `<span class="auth-avatar">${initial}</span>`;
            btn.title = user.email || 'Account';
            btn.classList.add('signed-in');
            if (indicator) {
                indicator.textContent = '';
                indicator.style.display = 'none';
            }
        } else {
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            btn.title = 'Sign in to sync across devices';
            btn.classList.remove('signed-in');
            if (indicator) {
                indicator.textContent = '';
                indicator.style.display = 'none';
            }
        }
    }

    // ── Modal Management ──
    function _getModal() {
        if (_modalEl) return _modalEl;
        _modalEl = document.getElementById('authModal');
        return _modalEl;
    }

    function _showView(viewName) {
        const modal = _getModal();
        if (!modal) return;
        modal.querySelectorAll('.auth-view').forEach(v => v.style.display = 'none');
        const view = modal.querySelector(`[data-auth-view="${viewName}"]`);
        if (view) view.style.display = 'block';
        _clearErrors();
    }

    function _clearErrors() {
        const modal = _getModal();
        if (!modal) return;
        modal.querySelectorAll('.auth-error').forEach(el => {
            el.textContent = '';
            el.style.display = 'none';
        });
    }

    function _showError(viewName, message) {
        const modal = _getModal();
        if (!modal) return;
        const view = modal.querySelector(`[data-auth-view="${viewName}"]`);
        if (!view) return;
        const errEl = view.querySelector('.auth-error');
        if (errEl) {
            errEl.textContent = message;
            errEl.style.display = 'block';
        }
    }

    function _setLoading(viewName, loading) {
        const modal = _getModal();
        if (!modal) return;
        const view = modal.querySelector(`[data-auth-view="${viewName}"]`);
        if (!view) return;
        const btn = view.querySelector('button[type="submit"]');
        if (btn) {
            btn.disabled = loading;
            btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
            btn.textContent = loading ? 'Please wait...' : btn.dataset.originalText;
        }
    }

    // ── Friendly error messages for Supabase AuthApiError ──
    function _supabaseErrorMessage(err) {
        if (!err) return 'Something went wrong. Please try again.';
        const msg = String(err.message || '').toLowerCase();
        if (msg.includes('invalid login credentials')) return 'Invalid email or password. Please try again.';
        if (msg.includes('email not confirmed')) return 'Please confirm your email address before signing in.';
        if (msg.includes('user already registered')) return 'An account with this email already exists. Try signing in.';
        if (msg.includes('password should be at least')) return 'Password is too short.';
        if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please try again in a few minutes.';
        if (msg.includes('network')) return 'Network error. Check your connection and try again.';
        return err.message || 'Something went wrong. Please try again.';
    }

    // ── Friendly error messages ──
    function _friendlyError(code) {
        const map = {
            'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/user-disabled': 'This account has been disabled.',
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password. Try again or reset your password.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/too-many-requests': 'Too many attempts. Please try again in a few minutes.',
            'auth/network-request-failed': 'Network error. Check your connection and try again.',
            'auth/invalid-credential': 'Invalid email or password. Please try again.',
            'auth/missing-password': 'Please enter your password.',
        };
        return map[code] || 'Something went wrong. Please try again.';
    }

    return {
        get user() { return _user; },
        get isSignedIn() { return !!_user; },
        get uid() { return _user?.uid || null; },
        get email() { return _user?.email || null; },
        get displayName() { return _user?.displayName || null; },
        get isEmailVerified() { return _user?.emailVerified || false; },
        get isAdmin() { return _isAdmin; },
        get isBlocked() { return _isBlocked; },

        /** Promise that resolves once the initial auth state is known (user or null). */
        ready() { return _authReady; },

        /** True if ready() resolved via the safety timeout rather than a real Firebase event. */
        get readyTimedOut() { return _authTimedOut; },

        /**
         * Resolve once the user is actually signed in (non-null user).
         * Use this instead of ready() when the caller specifically needs an
         * authenticated user — e.g. pulling cloud data on slow networks where
         * ready() may have timed out before Firebase responded.
         *
         * @param {number} [timeoutMs=30000] returns null if no sign-in by then.
         * @returns {Promise<object|null>}
         */
        whenSignedIn(timeoutMs = 30000) {
            if (_user) return Promise.resolve(_user);
            return new Promise(resolve => {
                let settled = false;
                function detach() {
                    const idx = _listeners.indexOf(handler);
                    if (idx >= 0) _listeners.splice(idx, 1);
                }
                const handler = (u) => {
                    if (settled || !u) return;
                    settled = true;
                    detach();
                    resolve(u);
                };
                _listeners.push(handler);
                setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    detach();
                    resolve(null);
                }, timeoutMs);
            });
        },

        /**
         * Get the current user's Firebase ID token for authenticating API calls.
         * Returns null if not signed in or on error.
         */
        async getIdToken() {
            if (!_user) return null;
            try { return await _user.getIdToken(); } catch { return null; }
        },

        /**
         * Fetch wrapper that automatically injects the Firebase ID token.
         * Use instead of fetch() for all /api/ calls that require authentication.
         */
        async apiFetch(url, options = {}) {
            const token = await this.getIdToken();
            if (token) {
                options = {
                    ...options,
                    headers: { ...(options.headers || {}), 'Authorization': `Bearer ${token}` },
                };
            }
            return fetch(url, options);
        },

        /**
         * Initialize auth — call after Firebase is ready
         */
        async init() {
            if (!FirebaseConfig.isReady) {
                console.warn('[Auth] Firebase not initialized, auth disabled');
                _updateHeaderUI(null);
                // Fall through — don't return — so Supabase listener still wires.
            } else {
                // Listen for Firebase auth state changes
                FirebaseConfig.auth.onAuthStateChanged(_onAuthStateChanged);
            }

            // Supabase users have their session in SupabaseAuth, not Firebase.
            // Without this listener, `Auth.user` stays null for Supabase-backed
            // users even after a successful sign-in — which made the auth gate
            // in app-navigation re-open the login modal on every tool click,
            // creating a repeat-sign-in loop where each click hit
            // `token?grant_type=password` again and again. We mirror Supabase's
            // user into the auth.js `_user` slot (normalized to the Firebase
            // shape the getters expect) so every consumer sees a consistent
            // signed-in state regardless of backend.
            if (typeof SupabaseAuth !== 'undefined' && typeof SupabaseAuth.addAuthListener === 'function') {
                SupabaseAuth.addAuthListener((sbUser, event) => {
                    // SupabaseAuth's `addAuthListener` fires its OWN synthetic
                    // event named `'INITIAL'` synchronously at registration
                    // time, with whatever `_user` is at that instant. The
                    // Supabase JS v2 SDK fires a DIFFERENT event named
                    // `'INITIAL_SESSION'` — distinct strings. The previous
                    // guard `event === 'INITIAL' && !sbUser` only caught the
                    // synthetic null, missing the SDK's null INITIAL_SESSION
                    // that fires when the listener is attached BEFORE the
                    // SDK finishes hydrating from storage. That null leaked
                    // through and called `_onAuthStateChanged(null)`, which
                    // (one-shot) resolved `Auth._authReady` with null and
                    // set `_user = null` — every later `await Auth.ready()`
                    // returned null, the auth gate in app-navigation saw
                    // no user, and a real F5 with a valid Supabase session
                    // landed on the Welcome Back modal anyway.
                    //
                    // Conservative guard: a NULL user is only ever a real
                    // signal when it accompanies an explicit `SIGNED_OUT`
                    // event. Every other null is either pre-hydration noise
                    // (`INITIAL`, `INITIAL_SESSION`) or a transient SDK
                    // re-emit and should be ignored. This is also
                    // forward-compatible: if supabase-js adds a new event
                    // type that delivers a null user mid-session, we won't
                    // accidentally sign the user out.
                    if (!sbUser && event !== 'SIGNED_OUT') return;
                    _onAuthStateChanged(_normalizeSupabaseUser(sbUser));
                });

                // Belt-and-suspenders mirror against the cold-load race that
                // PR #90's bridge listener still loses on some boots:
                //   1. app-boot.js fires `Auth.init()` BEFORE `SupabaseAuth.init()`.
                //   2. `addAuthListener` fires `(null, 'INITIAL')` synchronously
                //      because `SupabaseAuth._user` is still null — the early-
                //      return guard above swallows it. So far so good.
                //   3. `SupabaseAuth.init()` runs, awaits `getSession()`,
                //      populates `_user` from the persisted session, then
                //      registers `client.auth.onAuthStateChange(_onAuthChange)`.
                //   4. The Supabase JS v2 SDK is *supposed* to fire
                //      `INITIAL_SESSION` immediately after step 3 — but in
                //      practice the listener attached at step 3 sometimes
                //      misses the synthetic restore event (or `_refreshFactors`
                //      stalls before the fan-out), so `_onAuthChange` never
                //      runs the `_listeners.forEach` for the restored session.
                //   5. Result: `Auth._user` stays null forever despite
                //      `SupabaseAuth.user` being populated. Every tool tile
                //      click re-opens the Welcome Back modal, the dashboard
                //      greeting shows no name, F5 prompts sign-in again.
                // The fix is to re-read `SupabaseAuth.user` ourselves:
                //   • If already hydrated, mirror now (no-op if the
                //     synchronous INITIAL fire already populated us).
                //   • Otherwise wait for `SupabaseAuth.ready()` (resolves
                //     when `getSession` settles or via the 5s safety timeout)
                //     and mirror once. The `!_user` guard inside the deferred
                //     branch avoids clobbering a real event that arrived in
                //     between.
                const _mirrorSb = () => {
                    if (SupabaseAuth.user && !_user) {
                        _onAuthStateChanged(_normalizeSupabaseUser(SupabaseAuth.user));
                    }
                };
                if (SupabaseAuth.user) {
                    _mirrorSb();
                } else if (typeof SupabaseAuth.ready === 'function') {
                    Promise.resolve(SupabaseAuth.ready()).then(_mirrorSb).catch(() => {});
                }
            }
        },

        /**
         * Register a callback for auth state changes.
         * Deduplicates by function reference — calling with the same fn twice is a no-op.
         * @param {Function} fn - Called with user object (or null)
         */
        onAuthChange(fn) {
            if (_listeners.includes(fn)) return;
            _listeners.push(fn);
            // Fire immediately with current state
            if (_user !== undefined) fn(_user);
        },

        /**
         * Show the auth modal
         */
        showModal() {
            const modal = _getModal();
            if (!modal) return;

            if (_user) {
                _showView('account');
                // Populate account view
                const emailEl = modal.querySelector('#authAccountEmail');
                const nameEl = modal.querySelector('#authAccountName');
                const avatarEl = modal.querySelector('#authAccountAvatar');
                if (emailEl) emailEl.textContent = _user.email;
                if (nameEl) nameEl.value = _user.displayName || '';
                if (avatarEl) avatarEl.textContent = (_user.displayName || _user.email || '?')[0].toUpperCase();
                const agencyEl = modal.querySelector('#authAccountAgency');
                if (agencyEl) {
                    try {
                        const profile = Utils.tryParseLS(STORAGE_KEYS.AGENCY_PROFILE, {});
                        agencyEl.value = profile.agencyName || '';
                    } catch (e) { /* ignore */ }
                }

                // Only admins can see the "Invite Your Team" and admin panel sections
                _refreshAdminVisibility();

                // Load AI settings into the form
                if (typeof App !== 'undefined' && App.loadAISettings) App.loadAISettings();

                // Set theme dropdown to current value
                const themeEl = modal.querySelector('#themeSelect');
                if (themeEl) themeEl.value = localStorage.getItem(STORAGE_KEYS.THEME) || 'default';

                // Reflect cloud-sync opt-out state. For non-admin accounts the
                // checkbox is force-checked, disabled, and the explanatory text
                // is rewritten — cloud sync is restricted to admins by agency
                // policy until Path B Phase 4 (E2E encryption) ships.
                const syncDisabledEl = modal.querySelector('#authSyncDisabled');
                if (syncDisabledEl) {
                    if (!_isAdmin) {
                        syncDisabledEl.checked = true;
                        syncDisabledEl.disabled = true;
                        const label = syncDisabledEl.closest('label');
                        const desc = label ? label.querySelector('span > span') : null;
                        if (desc) desc.textContent = 'Cloud sync is restricted to admin accounts by agency policy. Client data stays encrypted in this browser and is not uploaded.';
                        const strong = label ? label.querySelector('strong') : null;
                        if (strong) strong.textContent = 'Cloud sync disabled by admin policy';
                    } else {
                        syncDisabledEl.disabled = false;
                        syncDisabledEl.checked = localStorage.getItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED) === 'true';
                    }
                }
                if (typeof CloudSync !== 'undefined' && CloudSync.refreshUI) CloudSync.refreshUI();

                // Render E2E encryption row based on current state
                if (typeof VaultUI !== 'undefined' && VaultUI.refreshSettingsRow) VaultUI.refreshSettingsRow();
            } else {
                _showView('login');
            }

            modal.classList.add('active');
            modal.style.display = 'flex';
            // Focus first input
            setTimeout(() => {
                const firstInput = modal.querySelector('.auth-view[style*="block"] input:not([type="hidden"])');
                if (firstInput) firstInput.focus();
            }, 100);
        },

        /**
         * Close the auth modal
         */
        closeModal() {
            const modal = _getModal();
            if (!modal) return;
            modal.classList.remove('active');
            modal.style.display = 'none';
            _clearErrors();
        },

        /**
         * Switch between login/signup/reset views
         */
        switchView(viewName) {
            _showView(viewName);
        },

        /**
         * Sign up with email + password
         */
        async signup(email, password, displayName) {
            if (_useSupabase()) {
                _setLoading('signup', true);
                _clearErrors();
                try {
                    await SupabaseAuth.signUp(email, password, { metadata: { display_name: displayName || '' } });
                    // New accounts with cloud sync enabled must enroll TOTP before
                    // sync will push anything. Open the TOTP view in-place instead
                    // of closing the modal.
                    if (SupabaseAuth.mfaRequired()) {
                        if (typeof AuthMFAUI !== 'undefined') AuthMFAUI.openEnroll({ hard: true });
                        else this.closeModal();
                    } else {
                        this.closeModal();
                    }
                } catch (e) {
                    _showError('signup', _supabaseErrorMessage(e));
                } finally {
                    _setLoading('signup', false);
                }
                return;
            }
            if (!FirebaseConfig.isReady) return;
            _setLoading('signup', true);
            _clearErrors();

            try {
                const cred = await FirebaseConfig.auth.createUserWithEmailAndPassword(email, password);
                if (displayName) {
                    await cred.user.updateProfile({ displayName });
                    // Refresh greeting now that displayName is set
                    if (typeof App !== 'undefined' && App.updateLandingGreeting) {
                        App.updateLandingGreeting();
                    }
                }
                // Send email verification
                try {
                    await cred.user.sendEmailVerification();
                    console.log('[Auth] Verification email sent to', email);
                } catch (e) {
                    console.warn('[Auth] Email verification send failed:', e.message);
                }
                this.closeModal();
            } catch (e) {
                _showError('signup', _friendlyError(e.code));
            } finally {
                _setLoading('signup', false);
            }
        },

        /**
         * Sign in with email + password
         */
        async login(email, password) {
            if (_useSupabase()) {
                _setLoading('login', true);
                _clearErrors();
                try {
                    await SupabaseAuth.signIn(email, password);
                    // Synchronously mirror SupabaseAuth.user into auth.js's
                    // _user BEFORE we close the modal. Without this, there's
                    // a ~500ms race window where `Auth.user` is still null
                    // (the SDK's SIGNED_IN event hasn't gone through
                    // _onAuthChange → _refreshFactors → _listeners yet), and
                    // clicking any tool tile in that window hits the auth
                    // gate, sees null, and re-opens the Welcome Back modal —
                    // exactly the loop the user reported. The deferred event
                    // path still runs and is idempotent; we just don't wait
                    // for it.
                    const sbUser = SupabaseAuth.user;
                    if (sbUser) _onAuthStateChanged(_normalizeSupabaseUser(sbUser));

                    // Always close the Welcome Back modal on a successful sign-in
                    // and surface a confirmation toast so the user has unambiguous
                    // feedback that it worked.
                    this.closeModal();
                    if (typeof App !== 'undefined' && App.toast) {
                        App.toast(`🔓 Signed in as ${email}`, { type: 'success', duration: 3000 });
                    }
                    const level = SupabaseAuth.mfaEnforcementLevel();
                    if (level && typeof AuthMFAUI !== 'undefined') {
                        AuthMFAUI.openEnroll({ hard: level === 'hard' });
                    }
                } catch (e) {
                    _showError('login', _supabaseErrorMessage(e));
                    if (typeof App !== 'undefined' && App.toast) {
                        App.toast(`Sign-in failed: ${_supabaseErrorMessage(e)}`, { type: 'error', duration: 5000 });
                    }
                } finally {
                    _setLoading('login', false);
                }
                return;
            }
            if (!FirebaseConfig.isReady) return;
            _setLoading('login', true);
            _clearErrors();

            try {
                await FirebaseConfig.auth.signInWithEmailAndPassword(email, password);
                this.closeModal();
            } catch (e) {
                _showError('login', _friendlyError(e.code));
            } finally {
                _setLoading('login', false);
            }
        },

        /**
         * Send password reset email
         */
        async resetPassword(email) {
            if (_useSupabase()) {
                _setLoading('reset', true);
                _clearErrors();
                try {
                    await SupabaseAuth.sendPasswordReset(email);
                    const view = _getModal()?.querySelector('[data-auth-view="reset"]');
                    const successEl = view?.querySelector('.auth-success');
                    if (successEl) {
                        successEl.textContent = `Reset link sent to ${email}. Check your inbox.`;
                        successEl.style.display = 'block';
                    }
                } catch (e) {
                    _showError('reset', _supabaseErrorMessage(e));
                } finally {
                    _setLoading('reset', false);
                }
                return;
            }
            if (!FirebaseConfig.isReady) return;
            _setLoading('reset', true);
            _clearErrors();

            try {
                await FirebaseConfig.auth.sendPasswordResetEmail(email);
                _showError('reset', ''); // clear
                const view = _getModal()?.querySelector('[data-auth-view="reset"]');
                const successEl = view?.querySelector('.auth-success');
                if (successEl) {
                    successEl.textContent = `Reset link sent to ${email}. Check your inbox.`;
                    successEl.style.display = 'block';
                }
            } catch (e) {
                _showError('reset', _friendlyError(e.code));
            } finally {
                _setLoading('reset', false);
            }
        },

        /**
         * Update display name
         */
        async updateName(newName) {
            if (!_user) return;
            try {
                await _user.updateProfile({ displayName: newName });
                _updateHeaderUI(_user);
                // Refresh landing greeting with updated name
                if (typeof App !== 'undefined' && App.updateLandingGreeting) {
                    App.updateLandingGreeting();
                }
                // Sync name change
                if (typeof CloudSync !== 'undefined') {
                    await CloudSync.pushToCloud({ settingsOnly: true });
                }
            } catch (e) {
                console.error('[Auth] Update name failed:', e);
            }
        },

        /**
         * Sign out
         */
        async logout() {
            if (_useSupabase()) {
                try {
                    await SupabaseAuth.logout();
                    this.closeModal();
                } catch (e) {
                    console.error('[Auth] Supabase logout failed:', e);
                }
                return;
            }
            if (!FirebaseConfig.isReady) return;
            try {
                await FirebaseConfig.auth.signOut();
                this.closeModal();
            } catch (e) {
                console.error('[Auth] Logout failed:', e);
            }
        },

        /**
         * Resend email verification (for signed-in users who haven't verified)
         */
        async resendVerification() {
            if (!_user) return;
            try {
                await _user.sendEmailVerification();
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast('Verification email sent. Check your inbox.', 3000);
                }
            } catch (e) {
                console.error('[Auth] Resend verification failed:', e);
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast('Could not send verification email. Try again later.', { type: 'error', duration: 4000 });
                }
            }
        },

        /**
         * Handle login form submission
         */
        handleLoginSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const email = form.querySelector('#authLoginEmail')?.value?.trim();
            const password = form.querySelector('#authLoginPassword')?.value;
            if (email && password) this.login(email, password);
        },

        /**
         * Handle signup form submission
         */
        handleSignupSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const name = form.querySelector('#authSignupName')?.value?.trim();
            const email = form.querySelector('#authSignupEmail')?.value?.trim();
            const inviteCode = (form.querySelector('#authSignupInviteCode')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
            const password = form.querySelector('#authSignupPassword')?.value;
            const confirm = form.querySelector('#authSignupConfirm')?.value;

            // Validate invite code — supports both legacy static codes and generated invite codes
            const codeValid = typeof Onboarding !== 'undefined' && Onboarding.isValidCode
                ? Onboarding.isValidCode(inviteCode)
                : false;
            if (!codeValid) {
                _showError('signup', 'Invalid invite code. Ask your team admin for the code.');
                return;
            }
            if (password !== confirm) {
                _showError('signup', 'Passwords do not match.');
                return;
            }
            if (email && password) this.signup(email, password, name);
        },

        /**
         * Handle reset form submission
         */
        handleResetSubmit(e) {
            e.preventDefault();
            const email = e.target.querySelector('#authResetEmail')?.value?.trim();
            if (email) this.resetPassword(email);
        },

        /**
         * Change password for signed-in user (re-authenticates first)
         */
        async changePassword(currentPassword, newPassword) {
            if (!_user || !FirebaseConfig.isReady) return;

            const form = document.getElementById('authChangePwForm');
            const errEl = form?.querySelector('.auth-error');
            const successEl = form?.querySelector('.auth-success');
            const submitBtn = form?.querySelector('button[type="submit"]');

            // Clear previous messages
            if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
            if (successEl) { successEl.textContent = ''; successEl.style.display = 'none'; }
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Please wait...'; }

            try {
                // Re-authenticate with current password
                const credential = firebase.auth.EmailAuthProvider.credential(_user.email, currentPassword);
                await _user.reauthenticateWithCredential(credential);

                // Update to new password
                await _user.updatePassword(newPassword);

                // Show success
                if (successEl) {
                    successEl.textContent = 'Password updated successfully.';
                    successEl.style.display = 'block';
                }
                // Clear form fields
                if (form) {
                    form.querySelector('#authCurrentPassword').value = '';
                    form.querySelector('#authNewPassword').value = '';
                    form.querySelector('#authConfirmNewPassword').value = '';
                }
                console.log('[Auth] Password changed successfully');
            } catch (e) {
                const msg = e.code === 'auth/wrong-password' ? 'Current password is incorrect.'
                    : e.code === 'auth/weak-password' ? 'New password must be at least 6 characters.'
                    : e.code === 'auth/requires-recent-login' ? 'Session expired. Please sign out and sign back in, then try again.'
                    : _friendlyError(e.code);
                if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
                console.error('[Auth] Change password failed:', e.code);
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Update Password'; }
            }
        },

        /**
         * Handle change password form submission
         */
        handleChangePasswordSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const current = form.querySelector('#authCurrentPassword')?.value;
            const newPw = form.querySelector('#authNewPassword')?.value;
            const confirm = form.querySelector('#authConfirmNewPassword')?.value;
            const errEl = form.querySelector('.auth-error');

            if (newPw !== confirm) {
                if (errEl) { errEl.textContent = 'New passwords do not match.'; errEl.style.display = 'block'; }
                return;
            }
            if (current && newPw) this.changePassword(current, newPw);
        }
    };
})();

// Expose on window for testability and consistency with other modules
window.Auth = Auth;
