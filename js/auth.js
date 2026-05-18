/**
 * Authentication Module — Supabase-only.
 *
 * Email + Password auth via Supabase (with passkey/TOTP MFA). After Phase D
 * (May 2026), Firebase is gone entirely; this file is a thin wrapper that
 * preserves the legacy `Auth.*` API surface for the ~40 call sites that read
 * `Auth.user`, `Auth.uid`, `Auth.apiFetch`, `Auth.isAdmin`, etc.
 *
 * All actual auth state lives in `window.SupabaseAuth` (js/supabase-auth.js);
 * Auth.* is the consumer-facing facade.
 */

const Auth = (() => {
    let _user = null;
    let _isAdmin = false;
    let _isBlocked = false;
    let _listeners = [];
    let _modalEl = null;

    // ── Auth-driven page reload ──
    // After a real sign-in or sign-out, refresh the page so the UI reflects
    // the new state — locked vault data disappears on sign-out, freshly
    // restored cloud data + signed-in chrome appear on sign-in. Without a
    // reload, plugins that cached state at boot can hold stale data and the
    // user has to refresh manually.
    //
    // `_authReloadScheduled` makes the helper idempotent — `.login()`
    // schedules it directly, the ambient listener may also detect a
    // transition; only the first call wins.
    // `_suppressAuthReload` is the escape hatch for flows that need to keep
    // the page mounted across the auth event (e.g. MFA enrollment opens an
    // overlay immediately after sign-in and would be destroyed by a reload).
    // `_hadSignedInUser` tracks "we previously had a real user" so the
    // ambient listener can tell a genuine sign-out from cold-load hydration.
    let _authReloadScheduled = false;
    let _suppressAuthReload = false;
    let _hadSignedInUser = false;
    const AUTH_RELOAD_DELAY_MS = 600;
    function _scheduleAuthReload(reason) {
        if (_authReloadScheduled) return;
        if (_suppressAuthReload) { _suppressAuthReload = false; return; }
        _authReloadScheduled = true;
        try { console.log('[Auth] Reloading page after auth change:', reason); } catch (_) {}
        setTimeout(() => {
            try {
                if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
                    window.location.reload();
                }
            } catch (e) {
                console.warn('[Auth] reload failed:', e && e.message);
                _authReloadScheduled = false;
            }
        }, AUTH_RELOAD_DELAY_MS);
    }

    // Promise that resolves once auth state is first known (signed in or out).
    let _authReadyResolve;
    const _authReady = new Promise(resolve => { _authReadyResolve = resolve; });
    // Safety timeout: resolve _authReady after 15s even if SupabaseAuth never
    // fires. Callers awaiting ready() see null on slow networks. The listener
    // still fires whenever SupabaseAuth responds; use Auth.whenSignedIn for a
    // real "signed in" signal rather than a "status known" signal.
    const READY_TIMEOUT_MS = 15000;
    let _authTimedOut = false;
    setTimeout(() => {
        if (_authReadyResolve) {
            _authTimedOut = true;
            _authReadyResolve(null);
            _authReadyResolve = null;
        }
    }, READY_TIMEOUT_MS);

    // Translate a Supabase user object into the legacy shape the rest of the
    // app expects. Consumers read `uid`, `email`, `displayName`,
    // `emailVerified`, and `getIdToken()` — we synthesize all four.
    function _normalizeSupabaseUser(sbUser) {
        if (!sbUser) return null;
        const meta = sbUser.user_metadata || {};
        const displayName = meta.display_name || meta.full_name || meta.name || '';
        return {
            uid: sbUser.id,
            email: sbUser.email || '',
            displayName,
            emailVerified: !!sbUser.email_confirmed_at || !!sbUser.confirmed_at,
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
        // Only resolve `_authReady` from a POSITIVE signal (a real user). A
        // null first-event would poison `_authReady` and the app-navigation
        // auth gate would open the Welcome Back modal even though a real
        // user event is on its way. The 15s safety timeout still resolves
        // with null for genuinely unauthenticated cold loads.
        if (_authReadyResolve && user) { _authReadyResolve(user); _authReadyResolve = null; }

        if (user && typeof SupabaseAuth !== 'undefined') {
            _isAdmin = SupabaseAuth.isAdmin === true;
            _isBlocked = SupabaseAuth.isBlocked === true;
        } else {
            _isAdmin = false;
            _isBlocked = false;
        }

        _user = user;
        _updateHeaderUI(user);
        if (typeof App !== 'undefined' && App.updateLandingGreeting) {
            App.updateLandingGreeting();
        }
        _listeners.forEach(fn => {
            try { fn(user); } catch (e) { console.error('[Auth] Listener error:', e); }
        });

        if (user) {
            console.log('[Auth] Signed in:', user.email);
            _hadSignedInUser = true;
            // Note: don't clear `body.auth-gated` here. When sign-in
            // happens via the forced gate (cold load with no session), the
            // boot function already early-returned — `.app-shell` is empty.
            // PR #106's `_scheduleAuthReload` fires in ~600 ms; keeping the
            // gate up means the user sees the modal until the reload
            // re-enters at a clean boot with `Auth.whenSignedIn` resolving
            // truthy, instead of a half-rendered shell during the gap.
            // Best-effort restore from Supabase if the vault key is already
            // available. Otherwise the vault-unlock UI runs this restore.
            _restoreSupabaseCloudAfterSignIn().catch(e => console.warn('[Auth] Supabase restore failed:', e && e.message));
            if (typeof Paywall !== 'undefined' && Paywall.loadSubscription) {
                Paywall.loadSubscription().catch(e => console.warn('[Auth] Subscription load failed:', e));
            }
            if (!window.google?.maps?.places && typeof window.loadPlacesAPI === 'function') {
                window.loadPlacesAPI();
            }
            if (typeof DashboardWidgets !== 'undefined' && DashboardWidgets.refreshAll) {
                try { DashboardWidgets.refreshAll(); } catch (e) { /* ignore */ }
            }
            // Push admin status to the Chrome extension so its popup unlocks
            // as soon as the user signs in.
            window.postMessage({ type: 'ALTECH_ADMIN_UPDATE', isAdmin: _isAdmin }, '*');
            _refreshAdminVisibility();
        } else {
            console.log('[Auth] Signed out');
            // Ambient sign-out (multi-tab logout, expired session, server
            // forced sign-out via is_blocked). Only fire when we previously
            // had a real user — cold-load with no session also lands here
            // via SIGNED_OUT events from the SDK and must NOT trigger a
            // reload loop. Explicit `.logout()` schedules its own reload
            // first; `_authReloadScheduled` then dedupes this path.
            if (_hadSignedInUser) {
                _hadSignedInUser = false;
                // Hide the chrome right away — PR #106 reloads in ~600 ms
                // and the gate would appear after the reload anyway, but
                // adding `auth-gated` now means the user doesn't see the
                // dashboard for the bridge window. Stays safe on the
                // fresh boot because the new boot resets the class either
                // by signed-in (removed) or signed-out (re-added).
                try {
                    if (document.body) document.body.classList.add('auth-gated');
                } catch (_) {}
                _scheduleAuthReload('signed-out');
            }
        }
    }

    // ── Bridge-Ready Handshake (Chrome extension) ──
    // When the bridge content script loads (document_idle), it fires
    // ALTECH_BRIDGE_READY. We respond immediately with whichever _isAdmin we
    // currently have. If auth hasn't run yet, the reply sends _isAdmin=false
    // (safe default), and a second ALTECH_ADMIN_UPDATE fires once Supabase
    // confirms the real value.
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'ALTECH_BRIDGE_READY') return;
        window.postMessage({ type: 'ALTECH_ADMIN_UPDATE', isAdmin: _isAdmin }, '*');
        console.log('[Auth] Bridge ready — replied with isAdmin:', _isAdmin);
    });

    function _refreshAdminVisibility() {
        const inviteSection = document.getElementById('authInviteSection');
        if (inviteSection) inviteSection.style.display = _isAdmin ? '' : 'none';
        const adminSection = document.getElementById('authAdminSection');
        if (adminSection) adminSection.style.display = _isAdmin ? '' : 'none';
        const teamTab = document.getElementById('acctTabTeam');
        if (teamTab) teamTab.style.display = _isAdmin ? '' : 'none';
        // Admin revoked while the Team tab is showing → fall back to Profile.
        if (!_isAdmin && teamTab && teamTab.classList.contains('seg-active')) _acctTab('profile');
    }

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
        // The account view is the tabbed settings surface — widen it. Other
        // views (login/signup/reset) stay at the narrow default width.
        const card = modal.querySelector('.auth-modal');
        if (card) card.classList.toggle('auth-modal-wide', viewName === 'account');
        _clearErrors();
    }

    // Account-modal tab switcher. Replaces the old <details> accordion: shows
    // one .acct-tab-panel, lights its .seg-btn, and (standing in for the two
    // removed `ontoggle` lazy-loads) hydrates the glossary / EZLynx inputs the
    // first time the Preferences tab is opened, without clobbering unsaved edits.
    function _acctTab(name) {
        const modal = _getModal();
        if (!modal) return;
        modal.querySelectorAll('.acct-tabnav .seg-btn').forEach(b => {
            b.classList.toggle('seg-active', b.dataset.acctTab === name);
        });
        modal.querySelectorAll('.acct-tab-panel').forEach(p => {
            p.hidden = (p.dataset.acctPanel !== name);
        });
        if (name === 'preferences') {
            try {
                const t = document.getElementById('agencyGlossaryText');
                if (t && !t.value) t.value = localStorage.getItem('altech_agency_glossary') || '';
                const p = document.getElementById('ezlynxXmlPathInput');
                if (p && !p.value) p.value = localStorage.getItem(STORAGE_KEYS.EZLYNX_XML_PATH) || '';
            } catch (e) { /* ignore */ }
        }
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

    // Friendly error messages for Supabase AuthApiError.
    function _supabaseErrorMessage(err) {
        if (!err) return 'Something went wrong. Please try again.';
        const msg = String(err.message || '').toLowerCase();
        if (msg.includes('invalid login credentials')) return 'Invalid email or password. Please try again.';
        if (msg.includes('email not confirmed')) return 'Please confirm your email address before signing in.';
        if (msg.includes('user already registered')) return 'An account with this email already exists. Try signing in.';
        if (msg.includes('password should be at least')) return 'Password is too short.';
        if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please try again in a few minutes.';
        if (msg.includes('network')) return 'Network error. Check your connection and try again.';
        if (msg.includes('same password') || msg.includes('new password should be different')) return 'New password must be different from the current one.';
        return err.message || 'Something went wrong. Please try again.';
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

        /** True if ready() resolved via the safety timeout rather than a real event. */
        get readyTimedOut() { return _authTimedOut; },

        /**
         * Resolve once the user is actually signed in (non-null user).
         * Use this instead of ready() when the caller specifically needs an
         * authenticated user — e.g. pulling cloud data on slow networks where
         * ready() may have timed out before Supabase responded.
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

        async getIdToken() {
            if (!_user) return null;
            try { return await _user.getIdToken(); } catch { return null; }
        },

        /**
         * Fetch wrapper that injects the Supabase access token as Authorization.
         * Use instead of fetch() for all /api/ calls that require authentication.
         */
        async apiFetch(url, options = {}) {
            // Prefer the SupabaseAuth.apiFetch which awaits session hydration
            // (avoids 401s when called at window.onload before init resolves).
            if (typeof SupabaseAuth !== 'undefined' && typeof SupabaseAuth.apiFetch === 'function') {
                return SupabaseAuth.apiFetch(url, options);
            }
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
         * Initialize auth — wires the SupabaseAuth listener bridge.
         */
        async init() {
            if (typeof SupabaseAuth === 'undefined' || typeof SupabaseAuth.addAuthListener !== 'function') {
                console.warn('[Auth] SupabaseAuth missing — auth disabled');
                _updateHeaderUI(null);
                return;
            }

            SupabaseAuth.addAuthListener((sbUser, event) => {
                // `addAuthListener` fires synchronously with `(_user, 'INITIAL')`
                // at registration time. The SDK then fires `'INITIAL_SESSION'`
                // with the restored user — but sometimes the listener attaches
                // before hydration finishes, so the SDK delivers a null
                // INITIAL_SESSION instead. Conservative guard: any null user is
                // only ever a real signal when it accompanies an explicit
                // SIGNED_OUT event.
                if (!sbUser && event !== 'SIGNED_OUT') return;
                _onAuthStateChanged(_normalizeSupabaseUser(sbUser));
            });

            // Belt-and-suspenders mirror — if SupabaseAuth already hydrated
            // before we attached, the SDK's restore-event may not re-fire.
            const _mirror = () => {
                if (SupabaseAuth.user && !_user) {
                    _onAuthStateChanged(_normalizeSupabaseUser(SupabaseAuth.user));
                }
            };
            if (SupabaseAuth.user) {
                _mirror();
            } else if (typeof SupabaseAuth.ready === 'function') {
                Promise.resolve(SupabaseAuth.ready()).then(_mirror).catch(() => {});
            }
        },

        /**
         * Register a callback for auth state changes.
         * Deduplicates by function reference — calling with the same fn twice is a no-op.
         */
        onAuthChange(fn) {
            if (_listeners.includes(fn)) return;
            _listeners.push(fn);
            if (_user !== undefined) fn(_user);
        },

        /**
         * Open the auth modal.
         *
         * @param {object} [opts]
         * @param {boolean} [opts.forced]  When true, pin the modal as a forced
         *   sign-in gate: sets `body.auth-gated` (CSS hides every other
         *   top-level overlay + the modal close button), and `closeModal()`
         *   becomes a no-op until the gate is lifted. Used at boot by
         *   `_authGate` in app-boot.js when there's no signed-in user.
         * @param {'login'|'signup'|'reset'} [opts.view]  Initial view. The
         *   password-reset deeplink (`?code=...&type=recovery`) opens at
         *   'reset' so the user can complete recovery without dismissing
         *   the gate.
         */
        showModal(opts) {
            const modal = _getModal();
            if (!modal) return;

            const forced = !!(opts && opts.forced);
            const view = opts && opts.view;
            if (forced) {
                try { document.body.classList.add('auth-gated'); } catch (_) {}
            }

            if (_user) {
                _showView('account');
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

                _refreshAdminVisibility();

                if (typeof App !== 'undefined' && App.loadAISettings) App.loadAISettings();

                const themeEl = modal.querySelector('#themeSelect');
                if (themeEl) themeEl.value = localStorage.getItem(STORAGE_KEYS.THEME) || 'default';

                // Reflect cloud-sync opt-out state. Non-admin accounts are
                // force-checked + disabled — cloud sync is restricted to admins
                // by agency policy until E2E key rotation is fully audited.
                const syncDisabledEl = modal.querySelector('#authSyncDisabled');
                if (syncDisabledEl) {
                    if (!_isAdmin) {
                        syncDisabledEl.checked = true;
                        syncDisabledEl.disabled = true;
                        const label = syncDisabledEl.closest('label');
                        const desc = label ? label.querySelector('span > span') : null;
                        if (desc) desc.textContent = 'Cloud sync is restricted to admin accounts by agency policy.';
                        const strong = label ? label.querySelector('strong') : null;
                        if (strong) strong.textContent = 'Cloud sync disabled by admin policy';
                    } else {
                        syncDisabledEl.disabled = false;
                        syncDisabledEl.checked = localStorage.getItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED) === 'true';
                    }
                }
                if (typeof window.Sync !== 'undefined' && window.Sync.refreshUI) window.Sync.refreshUI();

                if (typeof VaultUI !== 'undefined' && VaultUI.refreshSettingsRow) VaultUI.refreshSettingsRow();

                // Always (re)open on the Profile tab with the correct
                // single-panel visible state, every time the modal is shown.
                _acctTab('profile');
            } else {
                _showView('login');
            }

            // Caller-specified view wins over the default branching above
            // (used for the password-reset deeplink so the user lands on
            // the reset form, not the login form). Applies in both
            // signed-in and signed-out paths.
            if (view) _showView(view);

            modal.classList.add('active');
            modal.style.display = 'flex';
            setTimeout(() => {
                const firstInput = modal.querySelector('.auth-view[style*="block"] input:not([type="hidden"])');
                if (firstInput) firstInput.focus();
            }, 100);
        },

        closeModal() {
            // The forced sign-in gate latches the modal open until a real
            // user appears — _onAuthStateChanged clears `auth-gated` and the
            // page-reload helper from PR #106 then re-enters at a clean
            // boot. Manual close attempts (X button hidden by CSS, but a
            // stray call from a plugin or the keyboard handler) become
            // no-ops while the gate is up.
            if (document.body && document.body.classList.contains('auth-gated')) return;
            const modal = _getModal();
            if (!modal) return;
            modal.classList.remove('active');
            modal.style.display = 'none';
            _clearErrors();
        },

        switchView(viewName) {
            _showView(viewName);
        },

        /** Switch the account modal's active settings tab (inline onclick API). */
        acctTab(name) {
            _acctTab(name);
        },

        async signup(email, password, displayName) {
            _setLoading('signup', true);
            _clearErrors();
            try {
                await SupabaseAuth.signUp(email, password, { metadata: { display_name: displayName || '' } });
                if (SupabaseAuth.mfaRequired && SupabaseAuth.mfaRequired()) {
                    if (typeof AuthMFAUI !== 'undefined') {
                        // Same MFA-enroll suppression as login() — keep the
                        // overlay alive across the SDK's SIGNED_IN event.
                        _suppressAuthReload = true;
                        AuthMFAUI.openEnroll({ hard: true });
                    } else {
                        this.closeModal();
                    }
                } else {
                    this.closeModal();
                    // Only reload when signup actually created a session
                    // (Supabase instances with email verification disabled).
                    // When verification is required, no session exists yet —
                    // SupabaseAuth.user is null and a reload would just drop
                    // the user back to the signed-out landing page.
                    if (typeof SupabaseAuth !== 'undefined' && SupabaseAuth.user) {
                        _scheduleAuthReload('signed-up');
                    }
                }
            } catch (e) {
                _showError('signup', _supabaseErrorMessage(e));
            } finally {
                _setLoading('signup', false);
            }
        },

        async login(email, password) {
            _setLoading('login', true);
            _clearErrors();
            try {
                await SupabaseAuth.signIn(email, password);
                // Mirror SupabaseAuth.user into auth.js immediately so the
                // auth gate doesn't race against the listener fan-out.
                const sbUser = SupabaseAuth.user;
                if (sbUser) _onAuthStateChanged(_normalizeSupabaseUser(sbUser));

                this.closeModal();
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast(`🔓 Signed in as ${email}`, { type: 'success', duration: 3000 });
                }
                const level = SupabaseAuth.mfaEnforcementLevel && SupabaseAuth.mfaEnforcementLevel();
                if (level && typeof AuthMFAUI !== 'undefined') {
                    // MFA enrollment opens an overlay the user has to
                    // complete — block the auto-reload so the modal isn't
                    // ripped out from under them. `_suppressAuthReload` is
                    // consumed by the next `_scheduleAuthReload` call (which
                    // arrives shortly via the SDK's SIGNED_IN listener).
                    _suppressAuthReload = true;
                    AuthMFAUI.openEnroll({ hard: level === 'hard' });
                } else {
                    _scheduleAuthReload('signed-in');
                }
            } catch (e) {
                _showError('login', _supabaseErrorMessage(e));
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast(`Sign-in failed: ${_supabaseErrorMessage(e)}`, { type: 'error', duration: 5000 });
                }
            } finally {
                _setLoading('login', false);
            }
        },

        async resetPassword(email) {
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
        },

        async updateName(newName) {
            if (!_user) return;
            try {
                const sb = (typeof window !== 'undefined') ? window.Supabase : null;
                if (sb && sb.client && sb.client.auth && typeof sb.client.auth.updateUser === 'function') {
                    const { data, error } = await sb.client.auth.updateUser({ data: { display_name: newName } });
                    if (error) throw error;
                    if (data && data.user) {
                        _user = _normalizeSupabaseUser(data.user);
                    }
                }
                _updateHeaderUI(_user);
                if (typeof App !== 'undefined' && App.updateLandingGreeting) {
                    App.updateLandingGreeting();
                }
                if (typeof window.Sync !== 'undefined' && window.Sync.pushToCloud) {
                    await window.Sync.pushToCloud({ settingsOnly: true });
                }
            } catch (e) {
                console.error('[Auth] Update name failed:', e);
            }
        },

        async logout() {
            try {
                await SupabaseAuth.logout();
                this.closeModal();
                _scheduleAuthReload('signed-out');
            } catch (e) {
                console.error('[Auth] Logout failed:', e);
            }
        },

        async resendVerification() {
            if (!_user) return;
            try {
                const sb = (typeof window !== 'undefined') ? window.Supabase : null;
                if (sb && sb.client && sb.client.auth && typeof sb.client.auth.resend === 'function') {
                    const { error } = await sb.client.auth.resend({ type: 'signup', email: _user.email });
                    if (error) throw error;
                }
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast('Verification email sent. Check your inbox.', { type: 'success', duration: 3000 });
                }
            } catch (e) {
                console.error('[Auth] Resend verification failed:', e);
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast(`Could not send verification email: ${_supabaseErrorMessage(e)}`, { type: 'error', duration: 4000 });
                }
            }
        },

        handleLoginSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const email = form.querySelector('#authLoginEmail')?.value?.trim();
            const password = form.querySelector('#authLoginPassword')?.value;
            if (email && password) this.login(email, password);
        },

        handleSignupSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const name = form.querySelector('#authSignupName')?.value?.trim();
            const email = form.querySelector('#authSignupEmail')?.value?.trim();
            const inviteCode = (form.querySelector('#authSignupInviteCode')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
            const password = form.querySelector('#authSignupPassword')?.value;
            const confirm = form.querySelector('#authSignupConfirm')?.value;

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

        handleResetSubmit(e) {
            e.preventDefault();
            const email = e.target.querySelector('#authResetEmail')?.value?.trim();
            if (email) this.resetPassword(email);
        },

        /**
         * Change password for signed-in user. Supabase requires a recent
         * session (the access token must be < ~60 min old) or it returns a
         * "requires recent login" error — the catch path surfaces that as a
         * friendly message asking the user to sign out and back in.
         */
        async changePassword(currentPassword, newPassword) {
            if (!_user) return;

            const form = document.getElementById('authChangePwForm');
            const errEl = form?.querySelector('.auth-error');
            const successEl = form?.querySelector('.auth-success');
            const submitBtn = form?.querySelector('button[type="submit"]');

            if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
            if (successEl) { successEl.textContent = ''; successEl.style.display = 'none'; }
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Please wait...'; }

            try {
                const sb = (typeof window !== 'undefined') ? window.Supabase : null;
                if (!sb || !sb.client || !sb.client.auth) throw new Error('Supabase not initialized');

                // Re-verify the current password against Supabase before
                // updating, so users can't change the password just because a
                // session was hijacked.
                const verify = await sb.client.auth.signInWithPassword({ email: _user.email, password: currentPassword });
                if (verify.error) {
                    if (errEl) { errEl.textContent = 'Current password is incorrect.'; errEl.style.display = 'block'; }
                    return;
                }

                const { error } = await sb.client.auth.updateUser({ password: newPassword });
                if (error) throw error;

                if (successEl) {
                    successEl.textContent = 'Password updated successfully.';
                    successEl.style.display = 'block';
                }
                if (form) {
                    form.querySelector('#authCurrentPassword').value = '';
                    form.querySelector('#authNewPassword').value = '';
                    form.querySelector('#authConfirmNewPassword').value = '';
                }
                console.log('[Auth] Password changed successfully');
            } catch (e) {
                const msg = _supabaseErrorMessage(e);
                if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
                console.error('[Auth] Change password failed:', e && e.message);
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Update Password'; }
            }
        },

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
