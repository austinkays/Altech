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

        showModal() {
            const modal = _getModal();
            if (!modal) return;

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
            } else {
                _showView('login');
            }

            modal.classList.add('active');
            modal.style.display = 'flex';
            setTimeout(() => {
                const firstInput = modal.querySelector('.auth-view[style*="block"] input:not([type="hidden"])');
                if (firstInput) firstInput.focus();
            }, 100);
        },

        closeModal() {
            const modal = _getModal();
            if (!modal) return;
            modal.classList.remove('active');
            modal.style.display = 'none';
            _clearErrors();
        },

        switchView(viewName) {
            _showView(viewName);
        },

        async signup(email, password, displayName) {
            _setLoading('signup', true);
            _clearErrors();
            try {
                await SupabaseAuth.signUp(email, password, { metadata: { display_name: displayName || '' } });
                if (SupabaseAuth.mfaRequired && SupabaseAuth.mfaRequired()) {
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
