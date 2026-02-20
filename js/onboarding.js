/**
 * Onboarding Module
 * First-run welcome flow + team invite/share functionality
 * 
 * localStorage key: altech_onboarded (tracks completion)
 * localStorage key: altech_user_name (user's first name for greeting)
 */

window.Onboarding = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_onboarded';
    const NAME_KEY = 'altech_user_name';
    // Access codes — add new codes here as needed
    const VALID_CODES = ['ALTECH-2026', 'ALTECH2026', 'WELCOME2026'];
    let _currentStep = 1;
    const TOTAL_STEPS = 3;

    /**
     * Check if user needs onboarding and show overlay if so
     */
    function init() {
        const done = localStorage.getItem(STORAGE_KEY);
        if (done) return;
        _show();
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
     * Validate access code and finish onboarding if correct
     */
    function validateCode() {
        const input = document.getElementById('onboardingAccessCode');
        const errorEl = document.getElementById('onboardingCodeError');
        const hintEl = document.getElementById('onboardingCodeHint');
        if (!input) return;

        const code = input.value.trim().toUpperCase().replace(/\s+/g, '');
        if (VALID_CODES.includes(code)) {
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
     * Show a share modal (from account screen)
     */
    function showShareModal() {
        // Build a lightweight share modal
        let modal = document.getElementById('shareModal');
        if (!modal) {
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
                            <input type="text" id="shareModalUrl" readonly value="https://altech-app.vercel.app">
                            <button onclick="Onboarding.copyLink(this)">Copy</button>
                        </div>
                    </div>
                    <ul class="onboarding-features" style="margin-top:12px">
                        <li>
                            <div class="onboarding-feature-icon">🔑</div>
                            <div class="onboarding-feature-text">
                                <strong>Access Code</strong>
                                <span>New users will need the team access code to get started</span>
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
        }
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
        isComplete,
        reset
    };
})();
