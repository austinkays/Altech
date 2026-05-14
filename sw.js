/**
 * Altech Service Worker — Offline App Shell Cache
 *
 * Strategy: Network-first for app shell (HTML, CSS, JS) — always serve fresh
 * files when online, fall back to cache when offline. This ensures deployments
 * are immediately visible on normal refresh without needing to bump a version.
 * Bumping CACHE_VERSION still works as a nuclear option to purge stale caches.
 */

// Bumped to v13 during Phase 3 monolith decomposition (2026-04):
// components.css / compliance.css / intake-assist.css were split into shards,
// and several app-*.js + plugin helpers were extracted. Old precache paths
// would 404 and break the atomic cache.addAll() install.
// Bumped to v16 (2026-04-28) to invalidate cached PWA icons after the
// mountain-logo swap — old installs were still serving the yellow Tauri icon.
const CACHE_VERSION = 'altech-v81';
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    // CSS — core
    '/css/variables.css',
    '/css/base.css',
    '/css/layout.css',
    '/css/landing.css',
    '/css/animations.css',
    // CSS — components (split from components.css in 2026-04)
    '/css/components-cards.css',
    '/css/components-inputs.css',
    '/css/components-quote-library.css',
    '/css/components-buttons.css',
    '/css/components-forms.css',
    '/css/components-modals.css',
    '/css/components-toasts.css',
    '/css/components-loading.css',
    '/css/components-misc.css',
    '/css/components-acord.css',
    '/css/components-pwa.css',
    // CSS — compliance (split from compliance.css in 2026-04)
    '/css/compliance-main.css',
    '/css/compliance-print-dark.css',
    '/css/compliance-responsive.css',
    // CSS — intake-assist (split from intake-assist.css in 2026-04)
    '/css/intake-assist-chat.css',
    '/css/intake-assist-sidebar.css',
    '/css/intake-assist-features.css',
    '/css/intake-assist-polish.css',
    // CSS — other plugin stylesheets
    '/css/sidebar.css',
    '/css/dashboard.css',
    '/css/accounting.css',
    '/css/admin.css',
    '/css/auth.css',
    '/css/aurora-theme.css',
    '/css/broadform.css',
    '/css/bug-report.css',
    '/css/call-logger.css',
    '/css/commercial-quoter.css',
    '/css/dec-import.css',
    '/css/email.css',
    '/css/endorsement-parser.css',
    '/css/ezlynx.css',
    '/css/hawksoft.css',
    '/css/onboarding.css',
    '/css/paywall.css',
    '/css/quickref.css',
    '/css/quote-compare.css',
    '/css/reminders.css',
    '/css/returned-mail.css',
    '/css/security-info.css',
    '/css/task-sheet.css',
    '/css/theme-professional.css',
    '/css/vin-decoder.css',
    // JS — infrastructure (must load before App)
    '/js/crypto-helper.js',
    '/js/storage-keys.js',
    '/js/utils.js',
    '/js/fields.js',
    '/js/pdf-lib-loader.js',
    // JS — App core (order-dependent, see index.html)
    '/js/app-init.js',
    '/js/app-ui-utils.js',
    '/js/app-navigation.js',
    '/js/app-validation.js',
    '/js/app-core.js',
    '/js/app-places.js',
    '/js/app-carriers.js',
    '/js/app-applicant.js',
    '/js/app-ai-settings.js',
    '/js/app-scan.js',
    '/js/app-scan-doc-intel.js',
    '/js/app-property.js',
    '/js/app-property-maps.js',
    '/js/app-property-parcel.js',
    '/js/app-property-unified.js',
    '/js/app-property-rentcast.js',
    '/js/app-vehicles.js',
    '/js/app-popups.js',
    '/js/app-popups-history.js',
    '/js/app-export.js',
    '/js/app-export-pdf.js',
    '/js/app-export-csv.js',
    '/js/app-export-coverage-gap.js',
    '/js/app-export-cmsmtf.js',
    '/js/app-quotes.js',
    // JS — standalone modules
    '/js/ai-provider.js',
    '/js/dashboard-widgets.js',
    // JS — plugin helpers (must load before their plugin)
    '/js/prospect-formatters.js',
    '/js/compliance-idb.js',
    '/js/intake-assist-prompts.js',
    '/js/hawksoft-renderers.js',
    // JS — plugins
    '/js/accounting-export.js',
    '/js/auth.js',
    '/js/bug-report.js',
    '/js/call-logger.js',
    '/js/commercial-quoter.js',
    '/js/compliance-dashboard.js',
    '/js/data-backup.js',
    '/js/dec-import.js',
    '/js/email-composer.js',
    '/js/endorsement-parser.js',
    '/js/ezlynx-tool.js',
    '/js/hawksoft-export.js',
    '/js/intake-assist.js',
    '/js/onboarding.js',
    '/js/paywall.js',
    '/js/prospect.js',
    '/js/quick-ref.js',
    '/js/quoting-info-panels.js',
    '/js/quote-compare.js',
    '/js/reminders.js',
    '/js/returned-mail.js',
    '/js/task-sheet.js',
    '/js/vin-decoder.js',
    '/js/app-boot.js',
];

// Plugin HTML files — cached on access
const PLUGIN_FILES = [
    '/plugins/accounting.html',
    '/plugins/call-logger.html',
    '/plugins/compliance.html',
    '/plugins/email.html',
    '/plugins/ezlynx.html',
    '/plugins/hawksoft.html',
    '/plugins/intake-assist.html',
    '/plugins/prospect.html',
    '/plugins/quoting.html',
    '/plugins/quickref.html',
    '/plugins/quotecompare.html',
    '/plugins/reminders.html',
    '/plugins/vin-decoder.html',
    '/plugins/commercial-quoter.html',
    '/plugins/dec-import.html',
    '/plugins/endorsement.html',
    '/plugins/returned-mail.html',
    '/plugins/task-sheet.html',
];

// ── Install: pre-cache app shell ──
// NOTE: We intentionally do NOT call self.skipWaiting() here.
// The new SW waits until the user clicks "Update Now" in the update banner,
// which sends a SKIP_WAITING message (see listener below). This prevents
// serving a mix of old HTML + new JS during a deploy.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            console.log('[SW] Pre-caching app shell');
            return cache.addAll(APP_SHELL);
        })
    );
});

// ── Message handler: controlled activation from update banner ──
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] User accepted update — activating new version');
        self.skipWaiting();
    }
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k !== CACHE_VERSION)
                    .map((k) => {
                        console.log('[SW] Deleting old cache:', k);
                        return caches.delete(k);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ── Fetch: network-first for shell, bypass for APIs ──
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never intercept cross-origin requests — let the browser handle them
    // directly. SW fetch() runs against connect-src CSP, not script-src, so
    // intercepting CDN or external API requests causes CSP violations.
    if (url.origin !== self.location.origin) {
        return;
    }

    // Never cache same-origin API calls — always go to network
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // For navigation requests, network-first with cached fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).then((response) => {
                // Update cache with fresh index.html (GET only)
                if (event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', clone));
                }
                return response;
            }).catch(() => {
                return caches.match('/index.html');
            })
        );
        return;
    }

    // Network-first for all app shell and plugin files
    // Serve fresh from network when online, fall back to cache when offline
    event.respondWith(
        fetch(event.request).then((response) => {
            if (response.ok && event.request.method === 'GET') {
                // Update the cache with the fresh response (GET only)
                const clone = response.clone();
                caches.open(CACHE_VERSION).then((cache) => {
                    cache.put(event.request, clone);
                });
            }
            return response;
        }).catch(() => {
            // Offline — serve from cache
            return caches.match(event.request).then((cached) => {
                if (cached) return cached;
                // Last resort for HTML requests — serve index.html (SPA)
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('/index.html');
                }
                // Return empty 204 to avoid TypeError: Failed to convert value to 'Response'
                return new Response('', { status: 204 });
            });
        })
    );
});
