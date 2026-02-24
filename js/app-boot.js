/**
 * App Boot Sequence
 * Global error boundaries, service worker registration, window.onload handler,
 * hash router, keyboard shortcuts. Loads after all App modules and plugins.
 */
'use strict';

// ── Google Places API Loader ──
window.loadPlacesAPI = async function loadPlacesAPI() {
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
        
        // If no key from server, try checking window for injected key
        if (!apiKey && window.__PLACES_API_KEY__) {
            apiKey = window.__PLACES_API_KEY__;
        }
        
        // If still no key, check if it was passed as query parameter (local dev)
        if (!apiKey && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            apiKey = params.get('placesKey');
        }
        
        if (!apiKey) {
            console.info('ℹ️ Google Places API not configured - address autocomplete disabled. For local dev, set PLACES_API_KEY env var or add ?placesKey=... to URL');
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
        console.warn('ℹ️ Places API not available:', err.message);
    }
};

window.initPlaces = () => App.initPlaces();

// ── Global Error Boundaries ──
window.addEventListener('unhandledrejection', (e) => {
    console.error('[Unhandled Rejection]', e.reason);
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

// ── Fallback: If window.onload never fires, try rendering dashboard after 5s ──
setTimeout(() => {
    try {
        const greeting = document.getElementById('dashboardGreeting');
        if (greeting && !greeting.innerHTML.trim() && typeof DashboardWidgets !== 'undefined') {
            console.warn('[Boot] Fallback: window.onload may not have fired, force-rendering dashboard');
            try { App.loadDarkMode(); } catch (_) {}
            DashboardWidgets.init();
            App.goHome();
        }
    } catch (e) { console.error('[Boot] Fallback error:', e); }
}, 5000);

// ── ServiceWorker Registration (offline app shell) ──
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);
    }).catch((err) => {
        console.warn('[SW] Registration failed:', err.message);
    });
}

window.onload = async () => {
    console.log('[Boot] window.onload fired');

    // Apply dark mode preference FIRST — before any tool rendering
    try { App.loadDarkMode(); } catch (e) { console.error('[Boot] loadDarkMode error:', e); }

    // Initialize cloud sync (non-blocking), then load Places API (needs Auth for key fetch)
    try {
        if (typeof FirebaseConfig !== 'undefined' && FirebaseConfig.sdkLoaded) {
            FirebaseConfig.init().then(async () => {
                if (typeof Auth !== 'undefined') {
                    Auth.init();
                    try { await Auth.ready(); } catch (_) { /* continue anyway */ }
                }
                if (typeof window.loadPlacesAPI === 'function') window.loadPlacesAPI();
            }).catch(e => {
                console.warn('[App] Firebase init skipped:', e.message);
                if (typeof window.loadPlacesAPI === 'function') window.loadPlacesAPI();
            });
        } else {
            if (typeof window.loadPlacesAPI === 'function') window.loadPlacesAPI();
        }
    } catch (e) { console.error('[Boot] Firebase/Places init error:', e); }

    // Render landing page tools from config (legacy, for backwards compat)
    try { App.renderLandingTools(); } catch (e) { console.error('[Boot] renderLandingTools error:', e); }

    // Set landing greeting (legacy)
    try { App.updateLandingGreeting(); } catch (e) { console.error('[Boot] updateLandingGreeting error:', e); }
    try { App.updateCGLBadge(); } catch (e) { console.error('[Boot] updateCGLBadge error:', e); }

    // First-run onboarding for new users
    try {
        if (typeof Onboarding !== 'undefined') Onboarding.init();
    } catch (e) { console.error('[Boot] Onboarding.init error:', e); }

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
            if (App.initialized && App.save) App.save();
            App.toast('💾 Saved');
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
        // Cmd/Ctrl+K → Focus search (future: command palette)
        if (mod && e.key === 'k') {
            e.preventDefault();
            // For now, navigate home to show the tool grid
            App.goHome();
            return;
        }
        // Enter in wizard steps → advance to next step
        if (e.key === 'Enter' && !isInput && App.initialized) {
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
