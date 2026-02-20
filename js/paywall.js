/**
 * js/paywall.js — Subscription gate UI for premium features
 *
 * Usage:
 *   if (!Paywall.canUse('ai')) { Paywall.show('ai'); return; }
 *
 * Behavior:
 *   - When PAYWALL_ENABLED = false: all features unlocked (beta mode)
 *   - When PAYWALL_ENABLED = true: checks Firestore subscription doc
 *
 * The show() method renders a modal with plan benefits and a CTA.
 * upgrade() creates a Stripe Checkout session via /api/create-checkout.
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

    // Master switch — flip to true when Stripe products are configured
    const PAYWALL_ENABLED = false;

    // Cached subscription state (loaded from Firestore on auth)
    let _subscription = null;

    /**
     * Load subscription data from Firestore.
     * Called automatically when user signs in.
     */
    async function loadSubscription() {
        _subscription = null;
        if (typeof FirebaseConfig === 'undefined' || !FirebaseConfig.isReady) return;
        if (typeof Auth === 'undefined' || !Auth.isSignedIn) return;

        try {
            const doc = await FirebaseConfig.db
                .collection('users')
                .doc(Auth.uid)
                .collection('sync')
                .doc('subscription')
                .get();

            if (doc.exists) {
                _subscription = doc.data();
            }
        } catch (e) {
            console.warn('[Paywall] Failed to load subscription:', e.message);
        }
    }

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

        // Check subscription from Firestore
        if (_subscription && _subscription.active && _subscription.plan === tier.plan) {
            return true;
        }

        return false;
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
     * Creates a Stripe Checkout session and redirects to it.
     */
    async function upgrade() {
        dismiss();

        if (!PAYWALL_ENABLED) {
            // Beta mode — no Stripe yet
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('🚀 Pro subscriptions coming soon!', 3000);
            }
            return;
        }

        // Must be signed in to subscribe
        if (typeof Auth === 'undefined' || !Auth.isSignedIn) {
            Auth.showModal();
            return;
        }

        if (typeof App !== 'undefined' && App.toast) {
            App.toast('Creating checkout session...', 2000);
        }

        try {
            const resp = await Auth.apiFetch('/api/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            const data = await resp.json();

            if (resp.ok && data.url) {
                window.location.href = data.url;
            } else {
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast(data.error || 'Checkout failed. Please try again.', { type: 'error', duration: 4000 });
                }
            }
        } catch (e) {
            console.error('[Paywall] Checkout error:', e);
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('Network error. Please try again.', { type: 'error', duration: 4000 });
            }
        }
    }

    /**
     * Open Stripe Customer Portal for subscription management.
     */
    async function manageBilling() {
        if (typeof Auth === 'undefined' || !Auth.isSignedIn) return;

        try {
            const resp = await Auth.apiFetch('/api/customer-portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await resp.json();
            if (resp.ok && data.url) {
                window.location.href = data.url;
            } else {
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast(data.error || 'Unable to open billing portal.', { type: 'error', duration: 4000 });
                }
            }
        } catch (e) {
            console.error('[Paywall] Billing portal error:', e);
        }
    }

    return {
        canUse,
        show,
        dismiss,
        upgrade,
        manageBilling,
        loadSubscription,
        get enabled() { return PAYWALL_ENABLED; },
        get subscription() { return _subscription; },
        get isPro() { return _subscription?.active && _subscription?.plan === 'pro'; },
    };
})();
