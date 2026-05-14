// intake-v2-maps-key.js — Shared Google Maps API key loader for intake v2.
//
// v1 fetches /api/config?type=keys from three separate modules
// (app-boot.js's loadPlacesAPI, app-places.js's _getGeminiKey,
// app-property-maps.js's ensureMapApiKey) and coordinates through a
// `window.__CACHED_MAP_API_KEY__` global. v2 collapses that into one
// promise-cached loader: every consumer awaits the same in-flight
// fetch instead of firing duplicate requests against the rate-limited
// auth-gated endpoint.
//
// Public API:
//   IntakeV2MapsKey.get()      → Promise<string|null>
//      Resolves with the Maps Places key. Resolves null if the user is
//      not signed in, the endpoint returns no key, or the network call
//      fails. Never rejects — consumers fall back to manual entry
//      without try/catch boilerplate.
//   IntakeV2MapsKey.getPricing()  → Promise<{ perCall, freeMonthlyLimit } | null>
//      Same fetch, returns the Rentcast pricing block the endpoint
//      ships alongside the keys (Phase 21 reads this for the overage
//      modal so prices can update without a code redeploy).

'use strict';

(function () {

let _pending = null;     // in-flight fetch promise; awaited by every caller
let _cached  = null;     // resolved { apiKey, geminiKey, rentcastPricing } payload

async function _load() {
    if (_cached) return _cached;
    if (_pending) return _pending;
    _pending = (async () => {
        try {
            const fetcher = (window.Auth && typeof window.Auth.apiFetch === 'function')
                ? window.Auth.apiFetch.bind(window.Auth)
                : window.fetch.bind(window);
            const resp = await fetcher('/api/config?type=keys');
            if (!resp || !resp.ok) return { apiKey: null, geminiKey: null, rentcastPricing: null };
            const json = await resp.json();
            _cached = {
                apiKey: json && json.apiKey ? String(json.apiKey) : null,
                geminiKey: json && json.geminiKey ? String(json.geminiKey) : null,
                // Phase 21 — keep this null-safe so older /api/config
                // responses don't break the loader before that PR lands.
                rentcastPricing: (json && json.rentcastPricing) || null,
            };
            return _cached;
        } catch (_) {
            // Silent failure — caller decides whether to toast. Resetting
            // `_pending` would re-fire on next call which could thrash a
            // genuinely-broken endpoint; instead keep the cached failure
            // for the session and let the user refresh.
            _cached = { apiKey: null, geminiKey: null, rentcastPricing: null };
            return _cached;
        } finally {
            _pending = null;
        }
    })();
    return _pending;
}

async function get() {
    const out = await _load();
    return out.apiKey;
}

async function getPricing() {
    const out = await _load();
    return out.rentcastPricing;
}

// Test seam — lets the smart-fill unit tests inject a fake key so the
// places + maps modules can run end-to-end without hitting the network.
function _setForTest(payload) { _cached = payload; _pending = null; }
function _resetForTest()      { _cached = null;    _pending = null; }

window.IntakeV2MapsKey = { get, getPricing, _setForTest, _resetForTest };

})();
