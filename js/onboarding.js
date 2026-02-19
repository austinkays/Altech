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
    let _currentStep = 1;
    const TOTAL_STEPS = 3;

    /**
     * Check if user needs onboarding and show overlay if so
     */
    function init() {
        const done = localStorage.getItem(STORAGE_KEY);
        if (done) {
            _showInviteBar();
            return;
        }
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

        _showInviteBar();
    }

    function _showInviteBar() {
        const bar = document.getElementById('teamInviteBar');
        if (bar) bar.style.display = 'flex';
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
     * Show a share modal from the invite bar (after onboarding is done)
     */
    function showShareModal() {
        // Reuse the onboarding overlay in share-only mode
        const overlay = document.getElementById('onboardingOverlay');
        if (!overlay) return;

        // Jump directly to step 3 (share step)
        _currentStep = 3;
        overlay.style.display = 'flex';
        _updateStep();

        // Change the "Back" button to close
        const backBtn = overlay.querySelector('[data-step="3"] .onboarding-btn-secondary');
        if (backBtn) {
            backBtn.textContent = 'Close';
            backBtn.onclick = () => {
                overlay.classList.add('exit');
                setTimeout(() => {
                    overlay.style.display = 'none';
                    overlay.classList.remove('exit');
                    backBtn.textContent = 'Back';
                    backBtn.onclick = () => Onboarding.prev();
                }, 300);
            };
        }

        // Change finish button text
        const finishBtn = overlay.querySelector('[data-step="3"] .onboarding-btn-primary');
        if (finishBtn) {
            finishBtn.textContent = 'Done';
            finishBtn.onclick = () => {
                overlay.classList.add('exit');
                setTimeout(() => {
                    overlay.style.display = 'none';
                    overlay.classList.remove('exit');
                    finishBtn.textContent = 'Start Using Altech';
                    finishBtn.onclick = () => Onboarding.finish();
                }, 300);
            };
        }
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
        copyLink,
        showShareModal,
        getUserName,
        isComplete,
        reset
    };
})();
