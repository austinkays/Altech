/**
 * Onboarding Module
 * First-run welcome flow + team invite/share functionality
 * 
 * localStorage key: altech_onboarded (tracks completion)
 * localStorage key: altech_user_name (user's first name for greeting)
 * 
 * Invite codes are self-validating 8-char codes (6 random + 2 checksum).
 * No server call needed. URL param ?invite=CODE auto-fills and validates.
 */

window.Onboarding = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_onboarded';
    const NAME_KEY = 'altech_user_name';
    const APP_URL = 'https://altech.agency';
    // Charset for invite codes (no I/O/1/0 to avoid confusion)
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    // Legacy static codes — kept for backward compat
    const LEGACY_CODES = ['VANCOUVER'];
    let _currentStep = 1;
    const TOTAL_STEPS = 4;

    /**
     * Check if user needs onboarding and show overlay if so.
     * If ?invite=CODE is in the URL, auto-fill and validate the code.
     */
    function init() {
        // Check for invite code in URL — auto-fill for both onboarding and signup
        _checkInviteParam();

        const done = localStorage.getItem(STORAGE_KEY);
        if (done) return;
        _show();
    }

    /** Detect ?invite=CODE and auto-fill the onboarding access code field */
    function _checkInviteParam() {
        try {
            const params = new URLSearchParams(window.location.search);
            const code = (params.get('invite') || '').trim().toUpperCase();
            if (!code) return;

            // Pre-fill onboarding access code (if visible)
            const onboardInput = document.getElementById('onboardingAccessCode');
            if (onboardInput) onboardInput.value = code;

            // Pre-fill signup invite code (if visible)
            const signupInput = document.getElementById('authSignupInviteCode');
            if (signupInput) signupInput.value = code;

            // Clean the URL without reloading (remove ?invite= param)
            const url = new URL(window.location);
            url.searchParams.delete('invite');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);

            // If onboarding isn't done yet, auto-validate after a short delay
            // (gives time for the overlay to render)
            if (!localStorage.getItem(STORAGE_KEY)) {
                setTimeout(() => {
                    if (_isValidCode(code)) {
                        // Skip straight to finish — the invite link IS the access code
                        const nameInput = document.getElementById('onboardingName');
                        finish();
                    }
                }, 400);
            }
        } catch (_) { /* URL parsing failed — ignore */ }
    }

    function _show() {
        const overlay = document.getElementById('onboardingOverlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        _currentStep = 1;
        _updateStep();
    }

    function _updateStep() {
        const overlay = document.getElementById('onboardingOverlay');
        if (!overlay) return;
        overlay.querySelectorAll('.onboarding-step').forEach(el => {
            el.classList.remove('active');
        });
        const active = overlay.querySelector(`[data-step="${_currentStep}"]`);
        if (active) active.classList.add('active');

        // Focus input on step 2
        if (_currentStep === 2) {
            setTimeout(() => {
                const input = document.getElementById('onboardingName');
                if (input) input.focus();
            }, 200);
        }
    }

    function next() {
        // On step 2, save the name
        if (_currentStep === 2) {
            const nameInput = document.getElementById('onboardingName');
            const name = nameInput?.value?.trim();
            if (name) {
                localStorage.setItem(NAME_KEY, name);
            }
        }

        // On step 3, save agency profile
        if (_currentStep === 3) {
            _saveAgencyProfile();
        }

        if (_currentStep < TOTAL_STEPS) {
            _currentStep++;
            _updateStep();
        }
    }

    function prev() {
        if (_currentStep > 1) {
            _currentStep--;
            _updateStep();
        }
    }

    function finish() {
        // Save name one more time in case
        const nameInput = document.getElementById('onboardingName');
        const name = nameInput?.value?.trim();
        if (name) {
            localStorage.setItem(NAME_KEY, name);
        }

        // Mark onboarding complete
        localStorage.setItem(STORAGE_KEY, Date.now().toString());

        // Animate out
        const overlay = document.getElementById('onboardingOverlay');
        if (overlay) {
            overlay.classList.add('exit');
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.classList.remove('exit');
            }, 300);
        }

        // Update the landing greeting with their name
        if (typeof App !== 'undefined' && App.updateLandingGreeting) {
            App.updateLandingGreeting();
        }

        // Trigger cloud sync for the name
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
    }

    /**
     * Validate access code and finish onboarding if correct.
     * Accepts: legacy static codes OR algorithmically-generated invite codes.
     */
    function validateCode() {
        const input = document.getElementById('onboardingAccessCode');
        const errorEl = document.getElementById('onboardingCodeError');
        const hintEl = document.getElementById('onboardingCodeHint');
        if (!input) return;

        const code = input.value.trim().toUpperCase().replace(/\s+/g, '');
        if (_isValidCode(code)) {
            // Valid!
            if (errorEl) errorEl.style.display = 'none';
            if (hintEl) hintEl.style.display = 'none';
            input.style.borderColor = 'var(--success, #34C759)';
            finish();
        } else {
            // Invalid
            if (errorEl) errorEl.style.display = 'block';
            if (hintEl) hintEl.style.display = 'none';
            input.style.borderColor = 'var(--danger, #FF3B30)';
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 400);
        }
    }

    /**
     * Check if a code is valid (legacy OR algorithmic).
     */
    function _isValidCode(code) {
        if (!code) return false;
        // Legacy static codes
        if (LEGACY_CODES.includes(code)) return true;
        // Algorithmic invite codes: 8 chars, last 2 are checksum
        return _validateInviteCode(code);
    }

    /**
     * Generate a unique 8-char invite code (6 random + 2 checksum).
     * Self-validating — no server call needed.
     */
    function _generateInviteCode() {
        let body = '';
        const arr = new Uint8Array(6);
        (crypto || window.crypto).getRandomValues(arr);
        for (let i = 0; i < 6; i++) {
            body += CODE_CHARS[arr[i] % CODE_CHARS.length];
        }
        return body + _checksum(body);
    }

    /**
     * Validate an 8-char invite code by verifying its checksum.
     */
    function _validateInviteCode(code) {
        if (!code || code.length !== 8) return false;
        const body = code.slice(0, 6);
        // Verify all chars are in the allowed set
        for (const ch of code) {
            if (!CODE_CHARS.includes(ch)) return false;
        }
        return code.slice(6) === _checksum(body);
    }

    /**
     * Compute 2-char checksum for a 6-char code body.
     */
    function _checksum(body) {
        let sum = 42; // salt
        for (const ch of body) sum = (sum * 31 + ch.charCodeAt(0)) & 0xFFFF;
        return CODE_CHARS[sum % CODE_CHARS.length] + CODE_CHARS[(sum >>> 5) % CODE_CHARS.length];
    }

    /**
     * Copy the share link to clipboard
     */
    function copyLink(btn) {
        const input = document.getElementById('onboardingShareUrl') ||
                      document.getElementById('shareModalUrl');
        if (!input) return;

        const url = input.value;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                _flashCopied(btn);
            }).catch(() => {
                _fallbackCopy(input, btn);
            });
        } else {
            _fallbackCopy(input, btn);
        }
    }

    function _fallbackCopy(input, btn) {
        input.select();
        document.execCommand('copy');
        _flashCopied(btn);
    }

    function _flashCopied(btn) {
        if (!btn) return;
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = original;
            btn.classList.remove('copied');
        }, 2000);
    }

    /**
     * Show a share modal (from account screen).
     * Generates a fresh unique invite code each time.
     */
    function showShareModal() {
        const inviteCode = _generateInviteCode();
        const inviteUrl = `${APP_URL}?invite=${inviteCode}`;

        let modal = document.getElementById('shareModal');
        if (modal) modal.remove(); // Rebuild fresh each time with new code

        modal = document.createElement('div');
        modal.id = 'shareModal';
        modal.className = 'onboarding-overlay';
        modal.innerHTML = `
            <div class="onboarding-card" style="max-width:400px">
                <button class="onboarding-close" onclick="document.getElementById('shareModal').style.display='none'">&times;</button>
                <div class="onboarding-brand">
                    <h2>Invite Your Team</h2>
                    <p>Share this link with colleagues</p>
                </div>
                <div class="onboarding-share-section">
                    <div class="onboarding-share-url">
                        <input type="text" id="shareModalUrl" readonly value="${inviteUrl}">
                        <button onclick="Onboarding.copyLink(this)">Copy</button>
                    </div>
                </div>
                <ul class="onboarding-features" style="margin-top:12px">
                    <li>
                        <div class="onboarding-feature-icon">🔗</div>
                        <div class="onboarding-feature-text">
                            <strong>One-click access</strong>
                            <span>The invite code is embedded in the link — no manual entry needed</span>
                        </div>
                    </li>
                    <li>
                        <div class="onboarding-feature-icon">🔑</div>
                        <div class="onboarding-feature-text">
                            <strong>Unique code: ${inviteCode}</strong>
                            <span>A new code is generated each time you open this dialog</span>
                        </div>
                    </li>
                    <li>
                        <div class="onboarding-feature-icon">💡</div>
                        <div class="onboarding-feature-text">
                            <strong>Pro tip</strong>
                            <span>On mobile, tap Share → "Add to Home Screen" for an app-like experience</span>
                        </div>
                    </li>
                </ul>
                <div class="onboarding-actions" style="margin-top:16px">
                    <button class="onboarding-btn onboarding-btn-primary" onclick="document.getElementById('shareModal').style.display='none'">Done</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
    }

    /**
     * Get the saved user name (for greeting personalization)
     */
    function getUserName() {
        return localStorage.getItem(NAME_KEY) || '';
    }

    /**
     * Check if onboarding has been completed
     */
    function isComplete() {
        return !!localStorage.getItem(STORAGE_KEY);
    }

    /**
     * Save agency profile from onboarding step 3
     */
    function _saveAgencyProfile() {
        const agencyName = document.getElementById('onboardingAgencyName')?.value?.trim() || '';
        const agencyState = document.getElementById('onboardingAgencyState')?.value?.trim() || '';
        const licenseNum = document.getElementById('onboardingLicenseNum')?.value?.trim() || '';
        const profile = { agencyName, agencyState, licenseNum };
        localStorage.setItem('altech_agency_profile', JSON.stringify(profile));
    }

    /**
     * Get saved agency profile
     */
    function getAgencyProfile() {
        try {
            return JSON.parse(localStorage.getItem('altech_agency_profile') || '{}');
        } catch { return {}; }
    }

    /**
     * Reset onboarding (for testing or re-onboarding)
     */
    function reset() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(NAME_KEY);
        console.log('[Onboarding] Reset — will show on next page load');
    }

    return {
        init,
        next,
        prev,
        finish,
        validateCode,
        copyLink,
        showShareModal,
        getUserName,
        getAgencyProfile,
        isValidCode: (code) => _isValidCode((code || '').toUpperCase().replace(/\s+/g, '')),
        getValidCodes: () => [...LEGACY_CODES],  // Legacy compat — auth.js fallback
        isComplete,
        reset
    };
})();
