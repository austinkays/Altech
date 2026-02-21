/**
 * Authentication Module
 * Email + Password auth via Firebase Authentication
 * 
 * Provides: signup, login, logout, password reset, auth state management
 * UI: Modal dialog with login/signup/reset forms + header user indicator
 */

const Auth = (() => {
    let _user = null;
    let _listeners = [];
    let _modalEl = null;

    // Promise that resolves once Firebase auth state is first known (signed in or out)
    let _authReadyResolve;
    const _authReady = new Promise(resolve => { _authReadyResolve = resolve; });

    // ── Auth state change callback ──
    function _onAuthStateChanged(user) {
        if (_authReadyResolve) { _authReadyResolve(user); _authReadyResolve = null; }
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
            // Trigger cloud sync on login
            if (typeof CloudSync !== 'undefined' && CloudSync.pullFromCloud) {
                CloudSync.pullFromCloud().catch(e => console.error('[Auth] Initial sync failed:', e));
            }
            // Load subscription state for paywall
            if (typeof Paywall !== 'undefined' && Paywall.loadSubscription) {
                Paywall.loadSubscription().catch(e => console.warn('[Auth] Subscription load failed:', e));
            }
        } else {
            console.log('[Auth] Signed out');
        }
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

        /** Promise that resolves once the initial auth state is known (user or null). */
        ready() { return _authReady; },

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
                return;
            }

            // Listen for auth state changes
            FirebaseConfig.auth.onAuthStateChanged(_onAuthStateChanged);
        },

        /**
         * Register a callback for auth state changes
         * @param {Function} fn - Called with user object (or null)
         */
        onAuthChange(fn) {
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

            // Validate invite code (must match onboarding VALID_CODES)
            const validCodes = typeof Onboarding !== 'undefined' && Onboarding.getValidCodes
                ? Onboarding.getValidCodes()
                : ['VANCOUVER'];
            if (!validCodes.includes(inviteCode)) {
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
        }
    };
})();
