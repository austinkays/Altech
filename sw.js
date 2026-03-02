/**
 * Altech Service Worker — Offline App Shell Cache
 *
 * Strategy: Network-first for app shell (HTML, CSS, JS) — always serve fresh
 * files when online, fall back to cache when offline. This ensures deployments
 * are immediately visible on normal refresh without needing to bump a version.
 * Bumping CACHE_VERSION still works as a nuclear option to purge stale caches.
 */

const CACHE_VERSION = 'altech-v11';
const APP_SHELL = [
    '/',
    '/index.html',
    '/css/main.css',
    '/css/sidebar.css',
    '/css/dashboard.css',
    '/css/accounting.css',
    '/css/admin.css',
    '/css/auth.css',
    '/css/bug-report.css',
    '/css/call-logger.css',
    '/css/compliance.css',
    '/css/email.css',
    '/css/ezlynx.css',
    '/css/hawksoft.css',
    '/css/intake-assist.css',
    '/css/onboarding.css',
    '/css/paywall.css',
    '/css/quickref.css',
    '/css/quote-compare.css',
    '/css/reminders.css',
    '/css/security-info.css',
    '/css/theme-professional.css',
    '/css/vin-decoder.css',
    '/js/app-init.js',
    '/js/app-boot.js',
    '/js/app-core.js',
    '/js/app-scan.js',
    '/js/app-export.js',
    '/js/app-property.js',
    '/js/app-popups.js',
    '/js/app-vehicles.js',
    '/js/app-quotes.js',
    '/js/ai-provider.js',
    '/js/admin-panel.js',
    '/js/auth.js',
    '/js/bug-report.js',
    '/js/call-logger.js',
    '/js/cloud-sync.js',
    '/js/coi.js',
    '/js/compliance-dashboard.js',
    '/js/crypto-helper.js',
    '/js/data-backup.js',
    '/js/email-composer.js',
    '/js/ezlynx-tool.js',
    '/js/firebase-config.js',
    '/js/hawksoft-export.js',
    '/js/hawksoft-integration.js',
    '/js/intake-assist.js',
    '/js/onboarding.js',
    '/js/paywall.js',
    '/js/policy-qa.js',
    '/js/prospect.js',
    '/js/quick-ref.js',
    '/js/quote-compare.js',
    '/js/reminders.js',
    '/js/accounting-export.js',
    '/js/vin-decoder.js',
    '/js/dashboard-widgets.js',
];

// Plugin HTML files — cached on access
const PLUGIN_FILES = [
    '/plugins/accounting.html',
    '/plugins/call-logger.html',
    '/plugins/coi.html',
    '/plugins/compliance.html',
    '/plugins/email.html',
    '/plugins/ezlynx.html',
    '/plugins/hawksoft.html',
    '/plugins/intake-assist.html',
    '/plugins/prospect.html',
    '/plugins/qna.html',
    '/plugins/quoting.html',
    '/plugins/quickref.html',
    '/plugins/quotecompare.html',
    '/plugins/reminders.html',
    '/plugins/vin-decoder.html',
];

// ── Install: pre-cache app shell ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            console.log('[SW] Pre-caching app shell');
            return cache.addAll(APP_SHELL);
        }).then(() => self.skipWaiting())
    );
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

    // Never cache API calls or Firebase — always go to network
    if (url.pathname.startsWith('/api/') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('gstatic.com')) {
        return; // Let the browser handle it normally
    }

    // For navigation requests, network-first with cached fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).then((response) => {
                // Update cache with fresh index.html
                const clone = response.clone();
                caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', clone));
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
            if (response.ok) {
                // Update the cache with the fresh response
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
            });
        })
    );
});
