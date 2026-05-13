// intake-v2-places.js — Google Places autocomplete wired per home card.
//
// v1 (js/app-places.js) attaches Places autocomplete to a single global
// `#addrStreet` input — that pattern doesn't translate to v2's
// per-home cards (`iv2-home-address-{id}`). Re-binding on every card
// repaint would leak Autocomplete instances and burn billing session
// tokens. Instead we attach lazily, once per input, via a focus-event
// delegation: the first time an agent focuses a home address input,
// we instantiate the Autocomplete bound to that exact element and
// remember it so future repaints reuse the same instance.
//
// Place selection writes the full "Street, City, ST ZIP, County"
// string back to `home.address` (single-field shape the v2 schema
// already uses). Structured parts are stashed in `home.__placesParts`
// so the smart-fill orchestrator can skip re-parsing.
//
// v1 pain points fixed here:
//   - Auto-bind on every card render (leaked listeners) → bind once per
//     element via WeakSet
//   - Three duplicate /api/config?type=keys fetches → use
//     IntakeV2MapsKey.get() (shared promise-cached loader)
//   - Silent failure on key missing → console.warn + no Places UI; the
//     agent can still type manually and Smart Scan still works
//   - "User typed but didn't pick from dropdown" silently accepted →
//     on input blur, fall through to manual entry (no toast); next
//     focus refreshes the session token so they get a clean retry

'use strict';

(function () {

let _scriptPromise = null;        // promise that resolves when the Google Maps SDK is ready
const _wiredInputs = new WeakSet(); // inputs that already have an Autocomplete attached

// Inject the Maps JS SDK once. Subsequent calls return the same promise
// (idempotent). Resolves null if the loader can't fetch the key —
// consumers fall back to a no-op without throwing.
function _loadMapsScript() {
    if (_scriptPromise) return _scriptPromise;
    _scriptPromise = (async () => {
        if (!window.IntakeV2MapsKey) return null;
        const apiKey = await window.IntakeV2MapsKey.get();
        if (!apiKey) return null;
        // SDK already loaded (some other plugin grabbed it first)? Reuse.
        if (window.google && window.google.maps && window.google.maps.places) return window.google;
        return new Promise((resolve) => {
            const callbackName = '_iv2PlacesReady';
            window[callbackName] = () => {
                try { delete window[callbackName]; } catch (_) {}
                resolve(window.google || null);
            };
            const s = document.createElement('script');
            s.async = true;
            s.defer = true;
            s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}&v=weekly`;
            s.onerror = () => { try { delete window[callbackName]; } catch (_) {} resolve(null); };
            document.head.appendChild(s);
        });
    })();
    return _scriptPromise;
}

// Build the formatted single-string address v2 stores per home.
function _formatAddressLine(p) {
    const parts = [];
    if (p.street) parts.push(p.street);
    if (p.city)   parts.push(p.city);
    const stateZip = [p.state, p.zip].filter(Boolean).join(' ').trim();
    if (stateZip) parts.push(stateZip);
    if (p.county) parts.push(p.county);
    return parts.join(', ');
}

// Read Google's address_components into the shape parseAddress in
// intake-v2-smart-fill expects. Note v1 strips " County" from the
// admin_area_level_2 string — we deliberately KEEP " County" because
// parseAddress detects that exact suffix as the county-hint slot.
function _readPlace(place) {
    const parts = {
        street_number: '', route: '',
        locality: '', postal_town: '', sublocality_level_1: '',
        administrative_area_level_1: '', administrative_area_level_2: '',
        postal_code: '',
    };
    if (!place || !Array.isArray(place.address_components)) {
        return { street: '', city: '', state: '', zip: '', county: '' };
    }
    place.address_components.forEach((c) => {
        for (const t of c.types || []) {
            if (Object.prototype.hasOwnProperty.call(parts, t)) {
                parts[t] = c.short_name || c.long_name || '';
                break;
            }
        }
    });
    return {
        street: [parts.street_number, parts.route].filter(Boolean).join(' ').trim()
              || place.formatted_address || '',
        city:   parts.locality || parts.postal_town || parts.sublocality_level_1 || '',
        state:  (parts.administrative_area_level_1 || '').toUpperCase(),
        zip:    parts.postal_code || '',
        county: parts.administrative_area_level_2 || '',
    };
}

// Resolve homeId from an address input — every v2 home input is rendered
// with `data-collection="homes"` + `data-item-id="<id>"` (intake-v2-property.js).
function _homeIdFor(input) {
    return input && input.getAttribute && input.getAttribute('data-item-id');
}

// Attach Places autocomplete to a single home address input. Idempotent
// per input via the WeakSet guard.
function _attachToInput(input) {
    if (_wiredInputs.has(input)) return;
    if (!window.google || !window.google.maps || !window.google.maps.places) return;
    _wiredInputs.add(input);

    let sessionToken = new google.maps.places.AutocompleteSessionToken();
    const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address'],
        sessionToken,
    });

    // Refresh session token on focus + after each place pick — bills
    // every autocomplete-then-detail cycle as one session instead of
    // separate keystroke-bills.
    input.addEventListener('focus', () => {
        sessionToken = new google.maps.places.AutocompleteSessionToken();
        autocomplete.setOptions({ sessionToken });
    });

    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const homeId = _homeIdFor(input);
        if (!homeId) return;
        if (!place || (!place.address_components && !place.formatted_address)) {
            // Agent typed something Google couldn't resolve. Fall
            // through silently — they can still hit Smart Scan with
            // the raw text. (v1 fires a toast here; v2 doesn't because
            // the manual-entry path is normal.)
            return;
        }
        const p = _readPlace(place);
        const line = _formatAddressLine(p);
        const home = window.IntakeV2 && window.IntakeV2.getItem && window.IntakeV2.getItem('homes', homeId);
        if (!home) return;
        // Write the formatted line as the canonical home.address —
        // setItemField walks the dotted path + schedules save +
        // re-renders the card (which picks up the new address in the
        // map-thumbnail and Smart Scan flows).
        if (line) window.IntakeV2.setItemField('homes', homeId, 'address', line);
        // Cache the structured parts so Smart Scan can skip
        // parseAddress's regex split. parseAddress's output and
        // _readPlace's output are intentionally the same shape.
        try { home.__placesParts = p; } catch (_) {}
        // Refresh session token after a successful pick (next
        // autocomplete cycle is billed as a new session).
        sessionToken = new google.maps.places.AutocompleteSessionToken();
        autocomplete.setOptions({ sessionToken });
    });
}

// Delegated focus listener — fires the first time the agent focuses a
// home address input. Bootstraps the SDK load if needed, then attaches
// the Autocomplete instance. Subsequent focuses are no-ops via the
// WeakSet check.
async function _onAddressFocus(e) {
    const input = e.target;
    if (!input || input.tagName !== 'INPUT') return;
    if (!input.id || !input.id.startsWith('iv2-home-address-')) return;
    if (_wiredInputs.has(input)) return;
    const google = await _loadMapsScript();
    if (!google) return;          // Maps SDK couldn't load — manual entry only
    _attachToInput(input);
}

function init() {
    if (init._wired) return;
    init._wired = true;
    // `focusin` bubbles (unlike `focus`), so a single document listener
    // catches every home-card address input no matter when it was
    // rendered. Re-renders don't break anything because the WeakSet
    // tracks DOM elements; a removed input gets garbage-collected and
    // its replacement re-attaches on next focus.
    document.addEventListener('focusin', _onAddressFocus);
}

// Auto-init when IntakeV2 boots so the listener is in place before any
// home card renders. Falls back to DOMContentLoaded if IntakeV2 hasn't
// loaded yet (load-order safety belt).
if (window.IntakeV2 && typeof window.IntakeV2.onBoot === 'function') {
    window.IntakeV2.onBoot(init);
} else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.IntakeV2Places = { init };

})();
