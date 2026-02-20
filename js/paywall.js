/**
 * js/paywall.js — Subscription gate UI for premium features
 *
 * Usage:
 *   if (!Paywall.canUse('ai')) { Paywall.show('ai'); return; }
 *
 * Current behavior (pre-Stripe):
 *   - Free tier: all features unlocked (no gate)
 *   - When Stripe is wired: check Auth.user.plan / custom claims
 *
 * The show() method renders a modal with plan benefits and a CTA.
 * The gate is intentionally soft during beta — calling canUse() always
 * returns true until PAYWALL_ENABLED is flipped to true.
 */
window.Paywall = (() => {
    'use strict';

    // Feature tiers — which features require which plan
    const TIERS = {
        ai:       { plan: 'pro', label: 'AI Scanning & Extraction' },
        export:   { plan: 'pro', label: 'Multi-Format Export' },
        cloud:    { plan: 'pro', label: 'Cloud Sync & Backup' },
        prospect: { plan: 'pro', label: 'Prospect Intelligence' },
    };

    // Master switch — set to true when Stripe is connected
    const PAYWALL_ENABLED = false;

    /**
     * Check if the current user can use a feature.
     * Returns true when paywall is disabled (beta) or user has the required plan.
     */
    function canUse(featureKey) {
        if (!PAYWALL_ENABLED) return true;

        const tier = TIERS[featureKey];
        if (!tier) return true; // Unknown feature = free

        // Check auth state
        if (typeof Auth === 'undefined' || !Auth.isSignedIn) return false;

        // Check custom claims (set by Stripe webhook → Firebase Cloud Function)
        const claims = Auth.user?._tokenResult?.claims || {};
        return claims.plan === tier.plan && claims.active === true;
    }

    /**
     * Show the subscription gate modal for a specific feature.
     */
    function show(featureKey) {
        // Remove any existing paywall
        const existing = document.querySelector('.paywall-overlay');
        if (existing) existing.remove();

        const tier = TIERS[featureKey] || { label: 'Premium Feature' };
        const isSignedIn = typeof Auth !== 'undefined' && Auth.isSignedIn;

        const overlay = document.createElement('div');
        overlay.className = 'paywall-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) dismiss();
        });

        overlay.innerHTML = `
            <div class="paywall-card">
                <button class="paywall-close" onclick="Paywall.dismiss()" aria-label="Close">&times;</button>
                <div class="paywall-icon">🔒</div>
                <h2 class="paywall-title">${tier.label} is a Pro Feature</h2>
                <p class="paywall-subtitle">
                    Upgrade to Altech Pro to unlock AI-powered scanning, multi-format exports, cloud sync, and more.
                </p>
                <ul class="paywall-features">
                    <li><span class="check">✓</span> AI policy scanning & data extraction</li>
                    <li><span class="check">✓</span> HawkSoft, EZLynx & PDF exports</li>
                    <li><span class="check">✓</span> Cloud sync across all devices</li>
                    <li><span class="check">✓</span> Prospect intelligence & GIS research</li>
                    <li><span class="check">✓</span> Priority support</li>
                </ul>
                <button class="paywall-cta paywall-cta-primary" onclick="Paywall.upgrade()">
                    Upgrade to Pro
                </button>
                <button class="paywall-cta paywall-cta-secondary" onclick="Paywall.dismiss()">
                    Maybe Later
                </button>
                ${!isSignedIn ? `<p class="paywall-signin-note">Already have an account? <a onclick="Paywall.dismiss(); Auth.showModal();">Sign in</a></p>` : ''}
            </div>
        `;

        document.body.appendChild(overlay);

        // Trap focus inside modal
        const card = overlay.querySelector('.paywall-card');
        const firstBtn = card.querySelector('button');
        if (firstBtn) firstBtn.focus();

        // Escape key closes
        overlay._escHandler = (e) => {
            if (e.key === 'Escape') dismiss();
        };
        document.addEventListener('keydown', overlay._escHandler);
    }

    /**
     * Dismiss the paywall modal.
     */
    function dismiss() {
        const overlay = document.querySelector('.paywall-overlay');
        if (overlay) {
            document.removeEventListener('keydown', overlay._escHandler);
            overlay.remove();
        }
    }

    /**
     * Handle upgrade button click.
     * Pre-Stripe: show sign-in or a "coming soon" toast.
     * Post-Stripe: redirect to Stripe checkout session.
     */
    function upgrade() {
        dismiss();

        if (!PAYWALL_ENABLED) {
            // Beta mode — no Stripe yet
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('🚀 Pro subscriptions coming soon!', 3000);
            }
            return;
        }

        // When Stripe is wired, this will create a checkout session:
        // window.location.href = `/api/create-checkout?uid=${Auth.uid}`;
        if (typeof Auth !== 'undefined' && !Auth.isSignedIn) {
            Auth.showModal();
        } else {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('Redirecting to checkout...', 2000);
            }
            // TODO: Stripe checkout redirect
        }
    }

    return {
        canUse,
        show,
        dismiss,
        upgrade,
        get enabled() { return PAYWALL_ENABLED; },
    };
})();
