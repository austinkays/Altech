/**
 * App Boot Sequence
 * Global error boundaries, service worker registration, window.onload handler,
 * hash router, keyboard shortcuts. Loads after all App modules and plugins.
 */
'use strict';

// ── Google Places API Loader ──
window._placesAPILoading = false;
window.loadPlacesAPI = async function loadPlacesAPI() {
    // Prevent duplicate script loads
    if (window.google?.maps?.places || window._placesAPILoading) return;
    window._placesAPILoading = true;
    try {
        let apiKey = null;
        
        // Try fetching from server endpoint first (Vercel production)
        try {
            const res = await (typeof Auth !== 'undefined' ? Auth.apiFetch('/api/config?type=keys') : fetch('/api/config?type=keys'));
            if (res.ok) {
                const data = await res.json();
                apiKey = data.apiKey;
            }
        } catch (e) {
            // Server endpoint not available, try alternative methods
        }
        
        // If no key from server, check if it was passed as query parameter (local dev)
        if (!apiKey && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            apiKey = params.get('placesKey');
        }
        
        if (!apiKey) {
            console.info('ℹ️ Google Places API not configured - address autocomplete disabled. For local dev, set PLACES_API_KEY env var or add ?placesKey=... to URL');
            window._placesAPILoading = false;
            return;
        }
        
        // Cache key for map previews (Street View + Satellite)
        if (typeof App !== 'undefined') App.mapApiKey = apiKey;
        else window.__CACHED_MAP_API_KEY__ = apiKey;
        
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initPlaces`;
        script.async = true;
        script.defer = true;
        script.onerror = () => console.warn('⚠️ Places API script failed to load - address autocomplete disabled');
        document.head.appendChild(script);
        console.info('✓ Places API loaded');
    } catch (err) {
        window._placesAPILoading = false;
        console.warn('ℹ️ Places API not available:', err.message);
    }
};

window.initPlaces = () => App.initPlaces();

// ── Global Error Boundaries ──
window.addEventListener('unhandledrejection', (e) => {
    console.error('[Unhandled Rejection]', e.reason?.stack || e.reason);
    if (typeof App !== 'undefined' && App.toast) {
        App.toast(`Unexpected error: ${e.reason?.message || 'Something went wrong'}`, { type: 'error', duration: 4000 });
    }
});
window.addEventListener('error', (e) => {
    // Ignore script-load errors (have their own handlers) and ResizeObserver
    if (e.message === 'ResizeObserver loop limit exceeded') return;
    if (e.message?.includes('ResizeObserver loop')) return;
    console.error('[Global Error]', e.message, e.filename, e.lineno);
});

// ── ServiceWorker Registration + PWA Update & Install ──
(() => {
    if (!('serviceWorker' in navigator)) return;

    let _waitingSW = null;

    // Show the update banner when a new SW is waiting
    function showUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) banner.style.display = '';
    }

    // Called by the "Update Now" button (onclick in HTML)
    window._applySwUpdate = function () {
        const banner = document.getElementById('updateBanner');
        if (banner) banner.style.display = 'none';
        if (_waitingSW) {
            _waitingSW.postMessage({ type: 'SKIP_WAITING' });
        }
    };

    // When the new SW takes control, reload to get the fresh assets
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);

        // If a SW is already waiting (e.g. user returned to the tab)
        if (reg.waiting) {
            _waitingSW = reg.waiting;
            showUpdateBanner();
        }

        // Detect new SW installs
        reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener('statechange', () => {
                // installed = new SW finished install, waiting to activate
                if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                    _waitingSW = newSW;
                    showUpdateBanner();
                }
            });
        });

        // Check for updates every 30 minutes
        setInterval(() => { reg.update(); }, 30 * 60 * 1000);
    }).catch((err) => {
        console.warn('[SW] Registration failed:', err.message);
    });

    // ── beforeinstallprompt: capture deferred install prompt ──
    let _deferredInstallPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredInstallPrompt = e;
        // Show install button in sidebar if it exists
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) installBtn.style.display = '';
    });

    // Expose install trigger for the sidebar button
    window._triggerPwaInstall = function () {
        if (!_deferredInstallPrompt) return;
        _deferredInstallPrompt.prompt();
        _deferredInstallPrompt.userChoice.then((result) => {
            console.log('[PWA] Install prompt result:', result.outcome);
            _deferredInstallPrompt = null;
            const installBtn = document.getElementById('pwaInstallBtn');
            if (installBtn) installBtn.style.display = 'none';
        });
    };

    // If already in standalone mode, hide install button
    if (window.matchMedia('(display-mode: standalone)').matches) {
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) installBtn.style.display = 'none';
    }

    // Hide install button after app is installed
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed');
        _deferredInstallPrompt = null;
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) installBtn.style.display = 'none';
    });
})();

// ── beforeunload: Save client history before page close/refresh ──
// Also trigger the native browser warning if the form has unsaved edits, so
// closing the tab mid-intake doesn't silently drop work. Modern browsers
// ignore the custom message and show their own generic prompt, but setting
// event.returnValue (and returning a non-empty string) is what triggers it.
window.addEventListener('beforeunload', (event) => {
    try {
        if (typeof App !== 'undefined' && App._saveClientHistoryNow) {
            App._saveClientHistoryNow();
        }
        if (typeof App !== 'undefined' && App._dirty && App.activeClientId) {
            event.preventDefault();
            event.returnValue = 'You have unsaved changes. Leave anyway?';
            return event.returnValue;
        }
    } catch (e) { /* best-effort — can't block unload */ }
});

window.onload = async () => {
    console.log('[Boot] window.onload fired');

    // Apply dark mode preference FIRST — before any tool rendering
    try { App.loadDarkMode(); } catch (e) { console.error('[Boot] loadDarkMode error:', e); }
    // Apply theme (e.g. Aurora) after dark mode
    try { App.loadTheme(); } catch (e) { console.error('[Boot] loadTheme error:', e); }

    // Decrypt at-rest store BEFORE plugins read their localStorage state.
    // SecureStorage migrates any plaintext-on-disk PII (CGL state, reminders,
    // client history, glossary, carrier overrides) to ciphertext on first run,
    // and populates the in-memory cache so plugin sync reads keep working.
    try {
        if (typeof SecureStorage !== 'undefined') await SecureStorage.init();
    } catch (e) { console.error('[Boot] SecureStorage init error:', e); }

    // Idle-lock: clear the v2 vault key after 15 min of inactivity. This is
    // the "unattended workstation" control E&O cyber underwriters and most
    // agency security audits expect. Configurable per device via
    // STORAGE_KEYS.IDLE_TIMEOUT_MS (default 15 min, 0 = disabled).
    try {
        if (typeof IdleLock !== 'undefined') IdleLock.init();
    } catch (e) { console.error('[Boot] IdleLock init error:', e); }

    // Initialize Auth (Supabase facade), then load Places API (needs Auth for key fetch).
    try {
        if (typeof Auth !== 'undefined') {
            try { Auth.init(); } catch (e) { console.warn('[Boot] Auth init skipped:', e && e.message); }
        }
        if (typeof window.loadPlacesAPI === 'function') window.loadPlacesAPI();
    } catch (e) { console.error('[Boot] Auth/Places init error:', e); }

    // Supabase Auth — the sole auth/sync backend after Phase D cleanup.
    try {
        if (typeof SupabaseAuth !== 'undefined') {
            SupabaseAuth.init().catch(e => console.warn('[Boot] SupabaseAuth init skipped:', e && e.message));
        }
    } catch (e) { console.error('[Boot] SupabaseAuth init error:', e); }

    // ── Auth gate: forced sign-in screen when signed out ─────────────────
    // Hide the chrome behind `body.auth-resolving` while we wait up to 2 s
    // for Supabase to confirm the session (it usually returns in <100 ms
    // since getSession() reads from localStorage). If no user resolves, the
    // gate pins the forced sign-in modal via `body.auth-gated` and bails
    // out of every downstream boot step — Onboarding, vault unlock, the
    // hash router, dashboard widgets, the safety-net widget refresh. None
    // of them have anything useful to render without a signed-in user.
    //
    // Plugins lazy-load on navigation, so leaving them uninitialized is
    // safe; the renderLandingTools call is also skipped because the user
    // can't see it under `body.auth-gated`. The auth modal lives outside
    // .app-shell so the CSS still shows it.
    //
    // Password-reset deeplinks (`?code=...&type=recovery` from the email
    // link) bypass the redirect path — Supabase delivers the recovery
    // session via hash/query params and the user needs the reset form,
    // not the login form. Same modal, different view, still gated until
    // they pick a new password and the SDK fires SIGNED_IN → reload.
    //
    // After successful sign-in via this modal, PR #106's
    // `_scheduleAuthReload` fires a window.location.reload — boot
    // re-enters here, Auth.whenSignedIn resolves with the new user
    // inside the 2 s budget, gate is skipped, normal flow proceeds.
    try {
        document.body.classList.add('auth-resolving');
        const _isRecovery = /[?&]type=recovery\b/.test(window.location.search)
            || /[?&]type=recovery\b/.test(window.location.hash);
        let _gateUser = null;
        if (typeof Auth !== 'undefined' && typeof Auth.whenSignedIn === 'function') {
            _gateUser = await Auth.whenSignedIn(2000);
        }
        document.body.classList.remove('auth-resolving');
        if (!_gateUser) {
            document.body.classList.add('auth-gated');
            if (typeof Auth !== 'undefined' && Auth.showModal) {
                Auth.showModal({ forced: true, view: _isRecovery ? 'reset' : 'login' });
            }
            console.log('[Boot] Auth gate active — skipping downstream boot');
            return;
        }
    } catch (e) {
        console.error('[Boot] Auth gate error:', e);
        try { document.body.classList.remove('auth-resolving'); } catch (_) {}
    }

    // Build landing page tool grid from toolConfig (must run once before goHome)
    try { App.renderLandingTools(); } catch (e) { console.error('[Boot] renderLandingTools error:', e); }

    // First-run onboarding wizard — only fires after the user has a
    // session, so brand-new visitors hit the sign-in screen first and
    // see the wizard on the reload that follows a fresh signup.
    try {
        if (typeof Onboarding !== 'undefined') Onboarding.init();
    } catch (e) { console.error('[Boot] Onboarding.init error:', e); }

    // If E2E v2 is enabled and the vault is locked, prompt for the
    // passphrase before the user can interact with encrypted data.
    // Vault unlock is meaningless without a signed-in user (the wrap
    // metadata lives in Supabase), so it stays inside the gate.
    try {
        if (typeof VaultUI !== 'undefined' && VaultUI.maybePromptUnlockOnLoad) {
            VaultUI.maybePromptUnlockOnLoad();
        }
    } catch (e) { console.error('[Boot] Vault unlock prompt error:', e); }

    // Show reminder badges + check for alerts
    try {
        if (typeof Reminders !== 'undefined') {
            Reminders.init();
            Reminders.checkAlerts();
        }
    } catch (e) { console.error('[Boot] Reminders init error:', e); }

    // Initialize desktop command center dashboard
    try {
        if (typeof DashboardWidgets !== 'undefined') {
            console.log('[Boot] Calling DashboardWidgets.init()');
            DashboardWidgets.init();
            console.log('[Boot] DashboardWidgets.init() completed');
        } else {
            console.warn('[Boot] DashboardWidgets is undefined — script may not have loaded');
        }
    } catch (e) { console.error('[Boot] DashboardWidgets.init error:', e); }

    // Initialize Chrome extension property data listener
    try {
        if (typeof App !== 'undefined' && typeof App.initPropertyExtensionListener === 'function') {
            App.initPropertyExtensionListener();
        }
    } catch (e) { console.error('[Boot] initPropertyExtensionListener error:', e); }

    // Don't auto-init the quoting tool anymore
    // It will init when user clicks the card
    try { App.observePluginVisibility(); } catch (e) { console.error('[Boot] observePluginVisibility error:', e); }

    // ── Hash Router: initial route ──
    const hash = window.location.hash.replace('#', '');
    if (!hash || hash === 'home') {
        // Default to #home — show dashboard
        if (window.location.hash !== '#home') {
            history.replaceState(null, '', '#home');
        }
        try { App.goHome(); } catch (e) { console.error('[Boot] goHome error:', e); }
    } else {
        // Deep-link into a specific tool
        try { await App.navigateTo(hash, { syncHash: false }); } catch (e) { console.error('[Boot] navigateTo error:', e); }
    }

    // ── Safety Net: Force-render dashboard widgets if still empty after 2s ──
    setTimeout(() => {
        try {
            const dv = document.getElementById('dashboardView');
            const greeting = document.getElementById('dashboardGreeting');
            if (dv && dv.style.display !== 'none' && greeting && !greeting.innerHTML.trim()) {
                console.warn('[Boot] Safety net: widgets still empty after 2s, force-rendering');
                if (typeof DashboardWidgets !== 'undefined') {
                    DashboardWidgets.refreshAll();
                    DashboardWidgets.renderHeader();
                }
            }
        } catch (e) { console.error('[Boot] Safety net error:', e); }
    }, 2000);

    // ── Hash Router: handle back/forward & hash changes ──
    window.addEventListener('hashchange', async () => {
        if (App._routerNavigating) return; // guard against programmatic hash sets
        const toolId = window.location.hash.replace('#', '');
        if (!toolId || toolId === 'home') {
            App.goHome();
        } else {
            await App.navigateTo(toolId, { syncHash: false });
        }
    });

    // ── Desktop Keyboard Shortcuts ──
    document.addEventListener('keydown', (e) => {
        // Don't intercept when typing in an input/textarea
        const tag = document.activeElement?.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
        const mod = e.metaKey || e.ctrlKey;

        // Cmd/Ctrl+S → Save current form
        if (mod && e.key === 's') {
            e.preventDefault();
            if (App.initialized && App.save) {
                App.save();
                App.toast('💾 Saved');
            }
            return;
        }
        // Escape → Go home (unless in a modal/popup)
        if (e.key === 'Escape' && !isInput) {
            const modal = document.querySelector('.paywall-overlay, .onboarding-overlay[style*="flex"], [class*="popup"][style*="flex"]');
            if (!modal) {
                App.goHome();
            }
            return;
        }
        // Enter in wizard steps → advance to next step
        if (e.key === 'Enter' && !isInput && App.initialized) {
            const focused = document.activeElement;
            if (focused && (focused.tagName === 'BUTTON' || focused.tagName === 'A')) return;
            const activeStep = document.querySelector('.step:not(.hidden)');
            if (activeStep) {
                e.preventDefault();
                App.next();
            }
        }
    });
};

// ── Security & Privacy Info Modal ──
window.SecurityInfo = (() => {
    const open = () => { document.getElementById('securityInfoOverlay').style.display = 'flex'; };
    const close = () => { document.getElementById('securityInfoOverlay').style.display = 'none'; };
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.getElementById('securityInfoOverlay').style.display === 'flex') close();
    });
    return { open, close };
})();

// ── 3D Tilt Effect for Tool Cards ──
(() => {
    const MAX_TILT = 8; // degrees
    function handleMove(card, clientX, clientY) {
        const r = card.getBoundingClientRect();
        const x = (clientX - r.left) / r.width;
        const y = (clientY - r.top) / r.height;
        const rx = (x - 0.5) * MAX_TILT;
        const ry = (0.5 - y) * MAX_TILT;
        card.style.setProperty('--rx', rx + 'deg');
        card.style.setProperty('--ry', ry + 'deg');
        card.style.setProperty('--shine-x', (x * 100) + '%');
        card.style.setProperty('--shine-y', (y * 100) + '%');
    }
    function resetCard(card) {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--shine-x', '50%');
        card.style.setProperty('--shine-y', '50%');
    }
    document.addEventListener('mousemove', e => {
        const card = e.target.closest('.tool-row');
        if (card) handleMove(card, e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('mouseleave', e => {
        if (e.target.classList && e.target.classList.contains('tool-row')) resetCard(e.target);
    }, true);
    document.addEventListener('mouseout', e => {
        const card = e.target.closest('.tool-row');
        if (card && !card.contains(e.relatedTarget)) resetCard(card);
    }, { passive: true });
    // Touch support
    document.addEventListener('touchmove', e => {
        const t = e.touches[0];
        const card = document.elementFromPoint(t.clientX, t.clientY)?.closest('.tool-row');
        if (card) handleMove(card, t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchend', () => {
        document.querySelectorAll('.tool-row').forEach(resetCard);
    }, { passive: true });
})();
