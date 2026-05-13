// intake-v2-property.js — Home/property card renderer.
//
// Uses IntakeV2EntityCard.renderEntityCard for the standard card shell, then
// adds an "Address + autofill" header so the agent can paste a Zillow URL or
// type an address and have Rentcast + ArcGIS prefill the property fields.
//
// Each home card carries a short "address" field above the standard field
// grid. Subsequent fields (yrBuilt, sqFt, …) are driven by the collection
// schema in intake-v2-fields.js.

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

// Year-built advisories. Surface inline cues an underwriter would
// otherwise have to compute mentally — "1952 home with no electrical
// year? Probably knob-and-tube. Flag it before the carrier asks."
//
// Each rule returns either null (rule doesn't apply) or
// { id, severity, message, fieldId? } where fieldId is the DOM id
// the agent should jump to. Severity classes:
//   'info'  — neutral fact (e.g. "Home age: 74 yrs")
//   'warn'  — likely-needs-attention (amber underline tone)
//   'risk'  — carrier will probably push back (red tone)
function _homeAdvisories(home) {
    const now = new Date().getFullYear();
    const yr  = parseInt(home.yrBuilt, 10);
    const out = [];
    if (Number.isFinite(yr) && yr > 1700 && yr <= now) {
        const age = now - yr;
        // Plain context chip — no severity, just the math the
        // underwriter would do anyway.
        out.push({ id: 'age', severity: 'info', message: `Home age: ${age} year${age === 1 ? '' : 's'}.` });

        if (age >= 45 && !home.systems?.electricalYr) {
            out.push({
                id: 'electrical',
                severity: 'warn',
                message: 'Knob-and-tube risk — built before 1980 with no electrical-update year captured. Most carriers want a documented update.',
                fieldId: `iv2-home-electricalYr-${home.id}`,
            });
        }
        if (age >= 45 && !home.systems?.plumbingYr) {
            out.push({
                id: 'plumbing',
                severity: 'warn',
                message: 'Galvanized / polybutylene era — built before 1980 with no plumbing-update year. Confirm with the insured before binding.',
                fieldId: `iv2-home-plumbingYr-${home.id}`,
            });
        }
    }
    const roofYr = parseInt(home.roof?.yr, 10);
    if (Number.isFinite(roofYr) && roofYr > 1700 && roofYr <= now) {
        const roofAge = now - roofYr;
        if (roofAge >= 20) {
            out.push({
                id: 'roof-age',
                severity: 'risk',
                message: `Roof is ${roofAge} years old — Travelers / Safeco require < 20 years; expect mandatory replacement quote.`,
                fieldId: `iv2-home-roofYr-${home.id}`,
            });
        } else if (roofAge >= 15) {
            out.push({
                id: 'roof-age',
                severity: 'warn',
                message: `Roof is ${roofAge} years old — most carriers will inspect or surcharge once past 15 years.`,
                fieldId: `iv2-home-roofYr-${home.id}`,
            });
        }
    } else if (Number.isFinite(yr) && (now - yr) >= 20) {
        // Year built ≥20yrs ago + no roof year captured at all.
        out.push({
            id: 'roof-missing',
            severity: 'warn',
            message: 'Roof year empty on a 20+ year old home. Capture before binding — carriers default to year-built and may surcharge.',
            fieldId: `iv2-home-roofYr-${home.id}`,
        });
    }
    return out;
}

function advisoriesHeader(home) {
    const advisories = _homeAdvisories(home);
    if (!advisories.length) return '';
    const items = advisories.map(a => {
        const cls = `iv2-advisory iv2-advisory-${a.severity}`;
        const jump = a.fieldId
            ? ` <button type="button" class="iv2-advisory-jump" data-jump-to-field="${escAttr(a.fieldId)}">Go to field →</button>`
            : '';
        return `<li class="${cls}"><span class="iv2-advisory-icon" aria-hidden="true">${a.severity === 'info' ? 'ℹ' : a.severity === 'risk' ? '⛔' : '⚠'}</span><span>${esc(a.message)}</span>${jump}</li>`;
    }).join('');
    return `<ul class="iv2-advisory-list" role="status" aria-live="polite">${items}</ul>`;
}

function addressHeader(home) {
    return `
        <div class="iv2-field-grid" style="margin-bottom:8px">
            <div class="iv2-field" data-field-wrap="homes#${escAttr(home.id)}.address" style="grid-column: span 2;">
                <label for="iv2-home-address-${escAttr(home.id)}">Property Address</label>
                <div class="iv2-input-wrap">
                    <input type="text" id="iv2-home-address-${escAttr(home.id)}" data-collection="homes" data-item-id="${escAttr(home.id)}" data-field-path="address" value="${escAttr(home.address || '')}" placeholder="123 Main St, Anytown, WA 98101">
                    <button type="button" class="iv2-speller-btn" data-speller-mode="general" tabindex="-1" aria-label="Phonetic speller (Alt+P)" title="Phonetic speller (Alt+P)">🔤</button>
                </div>
                <span class="iv2-field-defer-badge" style="display:none">deferred</span>
            </div>
            <div class="iv2-field" style="align-self:end">
                <button type="button" class="iv2-icon-btn" data-rentcast-prefill="${escAttr(home.id)}" title="Pull property details from Rentcast">⚡ Autofill from address</button>
            </div>
        </div>`;
}

function renderHomes() {
    const root = document.querySelector('[data-render="homes"]');
    if (!root) return;
    const homes = window.IntakeV2.data.homes || [];
    if (!homes.length) {
        root.innerHTML = '';
        return;
    }
    const cards = homes.map(h => {
        return window.IntakeV2EntityCard.renderEntityCard('homes', h, {
            title: h.address || 'New Home',
            hideOperatorPicker: true,
            extraBodyHTML: '', // address rendered as header instead
        }).replace('<div class="iv2-field-grid">', addressHeader(h) + advisoriesHeader(h) + '<div class="iv2-field-grid">');
    }).join('');
    root.innerHTML = `<h4 style="margin:6px 0; color:var(--text-secondary); font-size:12px; text-transform:uppercase; letter-spacing:0.05em;">Homes (${homes.length})</h4>${cards}`;
    window.IntakeV2EntityCard.wireCardActions(root, 'homes');

    // Wire prefill buttons
    root.querySelectorAll('[data-rentcast-prefill]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-rentcast-prefill');
            tryPrefill(id);
        });
    });

    // Wire advisory "Go to field →" jump buttons. Scrolls to the
    // flagged field and focuses it so the agent can type the missing
    // value without scrolling-hunting through the card.
    root.querySelectorAll('[data-jump-to-field]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-jump-to-field');
            const el = document.getElementById(id);
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
        });
    });
}

async function tryPrefill(homeId) {
    const home = window.IntakeV2.getItem('homes', homeId);
    if (!home || !home.address) {
        if (window.App && window.App.toast) window.App.toast('Enter the property address first', { type: 'info' });
        return;
    }
    // Call the property-intelligence endpoint directly — Rentcast + Gemini
    // fallback. `Auth.apiFetch` adds the bearer token; fall back to fetch().
    if (window.App && window.App.toast) window.App.toast('Looking up property…', { type: 'info', duration: 1500 });
    // 12s budget — Rentcast + Gemini fallback can be slower than NHTSA so we
    // give it a bit more than VIN decode. Anything longer suggests a real
    // outage and the agent should fill manually.
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    try {
        const body = JSON.stringify({ address: home.address });
        const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal };
        const doFetch = (window.Auth && typeof window.Auth.apiFetch === 'function')
            ? window.Auth.apiFetch.bind(window.Auth)
            : window.fetch.bind(window);
        const resp = await doFetch('/api/property-intelligence?mode=zillow', init);
        if (!resp || !resp.ok) {
            if (window.App && window.App.toast) window.App.toast('Property lookup failed', { type: 'error' });
            return;
        }
        const data = await resp.json();
        const filled = applyPrefill(home, data);
        // Toast only reflects what actually happened. The previous code
        // always showed "Property details filled" even when the API
        // returned nothing useful — false positive on a quiet failure.
        if (window.App && window.App.toast) {
            if (filled > 0) window.App.toast(`Filled ${filled} field${filled > 1 ? 's' : ''} from address`, { type: 'success' });
            else            window.App.toast('No property details found for that address', { type: 'info' });
        }
    } catch (err) {
        if (window.App && window.App.toast) window.App.toast('Property lookup failed', { type: 'error' });
        // eslint-disable-next-line no-console
        console.warn('property lookup failed:', err);
    } finally { clearTimeout(tid); }
}

// Rentcast / Gemini returns fields under a few different shapes (top-level,
// or nested under `result` / `rentcast`). Pull from whichever shape arrived.
function pickField(data, names) {
    if (!data || typeof data !== 'object') return null;
    const sources = [data, data.result, data.rentcast, data.unified].filter(Boolean);
    for (const src of sources) {
        for (const n of names) {
            const v = src[n];
            if (v != null && v !== '') {
                // Some Gemini paths return { value, source } per field.
                if (typeof v === 'object' && 'value' in v) return v.value;
                return v;
            }
        }
    }
    return null;
}

const DWELLING_NORMALIZE = {
    'single family':       'One Family',
    'single-family':       'One Family',
    'sfr':                 'One Family',
    'duplex':              'Two Family',
    'triplex':             'Three Family',
    'fourplex':            'Four Family',
    'condo':               'Condo',
    'condominium':         'Condo',
    'townhouse':           'Townhouse',
    'townhome':            'Townhouse',
    'manufactured':        'Manufactured',
    'mobile':              'Manufactured',
};

function applyPrefill(home, data) {
    const get = (...names) => pickField(data, names);

    const yearBuilt = get('yearBuilt', 'yr_built', 'year_built');
    const sqFt      = get('squareFootage', 'sqft', 'sqFt', 'square_footage', 'building_area');
    const lotSize   = get('lotSize', 'lot_size', 'lotSizeAcres');
    const beds      = get('bedrooms', 'beds', 'num_bedrooms');
    const baths     = get('bathrooms', 'fullBaths', 'baths', 'num_bathrooms');
    const dwelling  = get('propertyType', 'dwelling_type', 'property_type');
    const county    = get('county');

    let filled = 0;
    if (yearBuilt && !home.yrBuilt) { home.yrBuilt = String(yearBuilt); filled++; }
    if (sqFt      && !home.sqFt)    { home.sqFt    = String(sqFt);      filled++; }
    if (lotSize   && !home.lotSize) { home.lotSize = String(lotSize);   filled++; }
    if (beds      && !home.bedrooms){ home.bedrooms= String(beds);      filled++; }
    if (baths) {
        const n = Number(baths);
        if (Number.isFinite(n)) {
            const full = Math.floor(n);
            const half = (n - full) >= 0.5 ? 1 : 0;
            if (!home.fullBaths)        { home.fullBaths = String(full); filled++; }
            if (!home.halfBaths && half){ home.halfBaths = String(half); filled++; }
        }
    }
    if (dwelling && !home.dwellingType) {
        const norm = DWELLING_NORMALIZE[String(dwelling).toLowerCase().trim()] || dwelling;
        home.dwellingType = norm;
        filled++;
    }
    if (county && !window.IntakeV2.data.address.county) {
        const c = String(county).replace(/\s+County$/i, '').trim();
        window.IntakeV2.data.address.county = c;
        filled++;
    }

    if (filled > 0) {
        window.IntakeV2.save();
        window.IntakeV2.requestRerender();
    }
    return filled;
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('homes', renderHomes);
    renderHomes();
});

})();
