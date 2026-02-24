/**
 * Altech Service Worker — Offline App Shell Cache
 *
 * Strategy: Cache-first for app shell (HTML, CSS, JS), network-first for API calls.
 * Bumping CACHE_VERSION invalidates the old cache on the next page load.
 */

const CACHE_VERSION = 'altech-v5';
const APP_SHELL = [
    '/',
    '/index.html',
    '/css/main.css',
    '/css/sidebar.css',
    '/css/dashboard.css',
    '/css/accounting.css',
    '/css/auth.css',
    '/css/compliance.css',
    '/css/email.css',
    '/css/ezlynx.css',
    '/css/hawksoft.css',
    '/css/onboarding.css',
    '/css/paywall.css',
    '/css/quickref.css',
    '/css/quote-compare.css',
    '/css/reminders.css',
    '/css/vin-decoder.css',
    '/js/app-core.js',
    '/js/app-scan.js',
    '/js/app-export.js',
    '/js/app-property.js',
    '/js/app-popups.js',
    '/js/app-vehicles.js',
    '/js/app-quotes.js',
    '/js/auth.js',
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

// Plugin HTML files — cache on first access (lazy)
const PLUGIN_FILES = [
    '/plugins/accounting.html',
    '/plugins/coi.html',
    '/plugins/compliance.html',
    '/plugins/email.html',
    '/plugins/ezlynx.html',
    '/plugins/hawksoft.html',
    '/plugins/prospect.html',
    '/plugins/qna.html',
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

// ── Fetch: cache-first for shell, network-first for API ──
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never cache API calls or Firebase — always go to network
    if (url.pathname.startsWith('/api/') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('gstatic.com')) {
        return; // Let the browser handle it normally
    }

    // For navigation requests, serve cached index.html (SPA)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('/index.html').then((cached) => {
                return cached || fetch(event.request);
            })
        );
        return;
    }

    // Cache-first for app shell and plugin files
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                // Cache plugin HTML on first access
                if (response.ok && PLUGIN_FILES.some((p) => url.pathname === p)) {
                    const clone = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(() => {
                // Offline fallback for HTML — serve index.html
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('/index.html');
                }
            });
        })
    );
});
