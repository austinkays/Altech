// intake-v2-property-maps.js — Satellite + Street View thumbnails for
// the v2 home card. Ports js/app-property-maps.js but tuned for the
// per-home context.
//
// v1 fetches base64 data-URLs eagerly (~700 KB for a single home's
// previews — slow on cellular and unnecessary for the in-form view; v1
// needs the data-URL form only for PDF export). v2 renders plain
// <img src=...> tags pointing straight at Google's Static Maps +
// Street View URLs. Browser caches handle the rest. The PDF export
// flow (intake-v2-export) can still call the URLs through
// fetchImageDataUrl when it actually needs base64.
//
// Public API:
//   IntakeV2PropertyMaps.attach(homeCardEl, home)
//     Renders or refreshes the thumbnails for one home card. Idempotent
//     and debounced 450 ms across rapid address edits (matches v1's
//     responsiveness budget).
//   IntakeV2PropertyMaps.openSatellite(home) / openStreetView(home)
//     Click-through behavior: satellite opens a Google Maps search;
//     Street View geocodes first for pano placement, falls back to a
//     query-based pano URL on geocoding failure.

'use strict';

(function () {

const THUMB_W = 400;     // Half v1's 640px — sharper at 2× DPR, less data
const THUMB_H = 240;     // Same 16:9-ish aspect ratio
const STATIC_ZOOM = 19;  // v1's zoom level for property-level detail
const DEBOUNCE_MS = 450; // Match v1's responsiveness budget

const _attachTimers = new WeakMap();   // per-cardEl debounce timers
const _lastAddresses = new WeakMap();  // last address rendered per cardEl (skip no-op refreshes)
const _metaCache = new Map();          // address → { hasStreetView: boolean }

function _esc(s) {
    return (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');
}

// Probe Street View Static Metadata API (free — does not count against
// the paid Street View quota) so we can render a "No coverage" placeholder
// instead of a broken 404'd image for rural / new-construction addresses.
async function _hasStreetViewCoverage(address, apiKey) {
    if (_metaCache.has(address)) return _metaCache.get(address).hasStreetView;
    try {
        const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url);
        if (!resp.ok) return true; // be optimistic — fall back to the image and let it 404 if it does
        const json = await resp.json();
        const ok = json && json.status === 'OK';
        _metaCache.set(address, { hasStreetView: ok });
        return ok;
    } catch (_) {
        return true;
    }
}

function _staticMapUrl(address, apiKey) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=${STATIC_ZOOM}&size=${THUMB_W}x${THUMB_H}&maptype=satellite&key=${encodeURIComponent(apiKey)}`;
}
function _staticMapUrl2x(address, apiKey) {
    return `${_staticMapUrl(address, apiKey)}&scale=2`;
}
function _streetViewUrl(address, apiKey) {
    return `https://maps.googleapis.com/maps/api/streetview?size=${THUMB_W}x${THUMB_H}&location=${encodeURIComponent(address)}&fov=80&pitch=0&key=${encodeURIComponent(apiKey)}`;
}
function _streetViewUrl2x(address, apiKey) {
    return `${_streetViewUrl(address, apiKey).replace(`size=${THUMB_W}x${THUMB_H}`, `size=${THUMB_W * 2}x${THUMB_H * 2}`)}`;
}

async function _render(homeCardEl, home) {
    // Find / create the thumbnails container — sits right above the
    // .iv2-field-grid so the agent sees visual confirmation of the
    // address before scrolling through the structural fields.
    let host = homeCardEl.querySelector('[data-iv2-thumbs]');
    const address = (home && home.address) || '';
    if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-iv2-thumbs', '');
        host.className = 'iv2-thumbs';
        // Insert before the field grid (.iv2-field-grid is the first
        // grid in the card body — the address header above it isn't a
        // grid, so this selector lands in the right place).
        const grid = homeCardEl.querySelector('.iv2-field-grid');
        if (grid && grid.parentNode) grid.parentNode.insertBefore(host, grid);
        else homeCardEl.appendChild(host);
    }
    // Empty address — clear the host (e.g., agent deleted the address).
    if (!address) {
        host.innerHTML = '';
        host.style.display = 'none';
        return;
    }
    host.style.display = '';

    const apiKey = window.IntakeV2MapsKey ? await window.IntakeV2MapsKey.get() : null;
    if (!apiKey) {
        // No key (user signed out, endpoint down, dev environment).
        // Show a minimal placeholder so the agent isn't confused by an
        // empty box where thumbnails used to be.
        host.innerHTML = `<div class="iv2-thumb-empty">Map previews require a signed-in session.</div>`;
        return;
    }

    // Place loading skeletons synchronously so the agent gets feedback
    // immediately, then probe coverage in the background and swap the
    // skeletons for real images.
    host.innerHTML = `
        <div class="iv2-thumb iv2-thumb-loading" data-thumb="satellite" role="button" tabindex="0" aria-label="Open satellite view in Google Maps">
            <div class="iv2-thumb-skeleton"></div>
            <span class="iv2-thumb-caption">Satellite</span>
        </div>
        <div class="iv2-thumb iv2-thumb-loading" data-thumb="streetview" role="button" tabindex="0" aria-label="Open Street View in Google Maps">
            <div class="iv2-thumb-skeleton"></div>
            <span class="iv2-thumb-caption">Street View</span>
        </div>`;

    // Satellite imagery covers the entire US — no probe needed.
    const satEl = host.querySelector('[data-thumb="satellite"]');
    const satImg = new Image();
    satImg.alt = 'Satellite view';
    satImg.loading = 'lazy';
    satImg.decoding = 'async';
    satImg.width = THUMB_W;
    satImg.height = THUMB_H;
    satImg.src = _staticMapUrl(address, apiKey);
    satImg.srcset = `${_staticMapUrl(address, apiKey)} 1x, ${_staticMapUrl2x(address, apiKey)} 2x`;
    satImg.onload = () => satEl.classList.remove('iv2-thumb-loading');
    satImg.onerror = () => {
        satEl.classList.remove('iv2-thumb-loading');
        satEl.innerHTML = `<div class="iv2-thumb-empty">Satellite image unavailable.</div><span class="iv2-thumb-caption">Satellite</span>`;
    };
    const satSkel = satEl.querySelector('.iv2-thumb-skeleton');
    if (satSkel) satSkel.replaceWith(satImg);
    satEl.addEventListener('click', () => openSatellite(home));
    satEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSatellite(home); } });

    // Street View may have no coverage in rural areas — probe the
    // metadata endpoint first.
    const svEl = host.querySelector('[data-thumb="streetview"]');
    const hasCoverage = await _hasStreetViewCoverage(address, apiKey);
    if (!hasCoverage) {
        svEl.classList.remove('iv2-thumb-loading');
        svEl.innerHTML = `<div class="iv2-thumb-empty">No Street View coverage for this address.</div><span class="iv2-thumb-caption">Street View</span>`;
        return;
    }
    const svImg = new Image();
    svImg.alt = 'Street View';
    svImg.loading = 'lazy';
    svImg.decoding = 'async';
    svImg.width = THUMB_W;
    svImg.height = THUMB_H;
    svImg.src = _streetViewUrl(address, apiKey);
    svImg.srcset = `${_streetViewUrl(address, apiKey)} 1x, ${_streetViewUrl2x(address, apiKey)} 2x`;
    svImg.onload = () => svEl.classList.remove('iv2-thumb-loading');
    svImg.onerror = () => {
        svEl.classList.remove('iv2-thumb-loading');
        svEl.innerHTML = `<div class="iv2-thumb-empty">Street View image unavailable.</div><span class="iv2-thumb-caption">Street View</span>`;
    };
    const svSkel = svEl.querySelector('.iv2-thumb-skeleton');
    if (svSkel) svSkel.replaceWith(svImg);
    svEl.addEventListener('click', () => openStreetView(home));
    svEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStreetView(home); } });
}

function attach(homeCardEl, home) {
    if (!homeCardEl || !home) return;
    const address = home.address || '';
    // Skip no-op refreshes: re-rendering with the same address shouldn't
    // re-fire the API calls. The map-thumbnails DOM stays in place
    // through .innerHTML rewrites on the parent card.
    if (_lastAddresses.get(homeCardEl) === address) return;
    _lastAddresses.set(homeCardEl, address);
    // Debounce — protects against burst re-renders from rapid edits
    // (every keystroke in the address input fires setItemField, which
    // fires requestRerender, which calls attach again).
    clearTimeout(_attachTimers.get(homeCardEl));
    _attachTimers.set(homeCardEl, setTimeout(() => _render(homeCardEl, home), DEBOUNCE_MS));
}

function openSatellite(home) {
    const address = (home && home.address) || '';
    if (!address) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank', 'noopener,noreferrer');
}

async function openStreetView(home) {
    const address = (home && home.address) || '';
    if (!address) return;
    // Geocode first to get precise lat/lng so the pano viewpoint is
    // accurate (v1's pattern — the query-based pano URL sometimes
    // lands the user on the wrong house). 8s timeout matches v1.
    try {
        const apiKey = window.IntakeV2MapsKey ? await window.IntakeV2MapsKey.get() : null;
        if (apiKey) {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 8000);
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`;
            const resp = await fetch(url, { signal: ctrl.signal });
            clearTimeout(tid);
            if (resp.ok) {
                const json = await resp.json();
                const loc = json && json.results && json.results[0] && json.results[0].geometry && json.results[0].geometry.location;
                if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
                    window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.lat},${loc.lng}`, '_blank', 'noopener,noreferrer');
                    return;
                }
            }
        }
    } catch (_) { /* fall through */ }
    // Fallback — query-based pano (might land slightly off but better
    // than nothing).
    window.open(`https://www.google.com/maps/@?api=1&map_action=pano&query=${encodeURIComponent(address)}`, '_blank', 'noopener,noreferrer');
}

window.IntakeV2PropertyMaps = { attach, openSatellite, openStreetView };

})();
