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
            // Upsert user profile to Firestore and check admin/blocked status
            _syncUserProfile(user).catch(e => console.warn('[Auth] Profile sync failed:', e));
            // Trigger cloud sync on login
            if (typeof CloudSync !== 'undefined' && CloudSync.pullFromCloud) {
                CloudSync.pullFromCloud().catch(e => console.error('[Auth] Initial sync failed:', e));
            }
            // Load subscription state for paywall
            if (typeof Paywall !== 'undefined' && Paywall.loadSubscription) {
                Paywall.loadSubscription().catch(e => console.warn('[Auth] Subscription load failed:', e));
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

                // Only admins can see the "Invite Your Team" and admin panel sections
                _refreshAdminVisibility();
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
