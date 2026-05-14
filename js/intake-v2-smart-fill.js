// intake-v2-smart-fill.js — Home smart-fill orchestrator for intake v2.
//
// Mirrors v1's App.smartAutoFill() (js/app-property.js) but writes back to
// a specific home item in IntakeV2.data.homes[] instead of the flat v1
// App.data shape. Fires all four /api/property-intelligence modes in
// parallel and merges with the same priority v1 uses:
//
//   ArcGIS (county records, authoritative) > Rentcast/Gemini (gap-fill) >
//   Satellite vision (last-resort gap-fill, medium/high confidence only)
//
// FEMA flood + fire-station data merge in directly (no overlap with the
// other sources). Per-field source attribution is tracked in `sources`
// so future commits can surface confidence badges next to each value.
//
// Public API:
//   IntakeV2SmartFill.run(homeId)            → orchestrate + apply silently
//   IntakeV2SmartFill.parseAddress(string)   → { street, city, state, zip, county? }
//   IntakeV2SmartFill.mergeResults({arcgis,zillow,fire,vision})
//      → { merged, sources }    (exported so a future review modal can
//                                  show the merge without re-fetching)

'use strict';

(function () {

const FETCH_TIMEOUT_MS = 12000; // matches v1's smartAutoFill budget

// ── Address parsing ────────────────────────────────────────────────────────

// v2 stores property address as a single string ("123 Main St, City, ST
// 98101 [, County]"). The four backend modes all expect address parts
// separated. Parser is forgiving — returns null only when the input lacks
// enough commas to be a plausible street address.
function parseAddress(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) return null; // need at least street, city, state-zip
    const street = parts[0];
    // Walk backwards: the LAST segment is state-zip — unless it's a
    // country tag (Google Places appends ", USA" / "United States"),
    // in which case the segment before it is state-zip.
    let stateZipIdx = parts.length - 1;
    if (/USA|United States/i.test(parts[stateZipIdx]) && parts.length > 3) stateZipIdx--;
    const stateZip = parts[stateZipIdx];
    // City is always at index 1 (right after street). County is the
    // optional fourth segment that sits between city and state-zip:
    //   "Street, City, County, State Zip"  → 4 segments, county at 2
    //   "Street, City, State Zip"          → 3 segments, no county
    const city   = parts[1] || '';
    const county = (stateZipIdx >= 3) ? (parts[stateZipIdx - 1] || '') : '';
    const m = stateZip.match(/^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?/);
    const state = m ? m[1].toUpperCase() : '';
    const zip   = (m && m[2]) ? m[2] : '';
    return { street, city, state, zip, county };
}

// ── Fetchers ───────────────────────────────────────────────────────────────

// Pull a single backend mode through Auth.apiFetch (adds the bearer token
// without us having to wire it manually). Returns null on any non-2xx,
// unexpected shape, or timeout. Per-mode callers decide how to interpret
// the missing data.
async function _fetchMode(mode, body, signal) {
    try {
        const init = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
            signal,
        };
        const fetcher = (window.Auth && typeof window.Auth.apiFetch === 'function')
            ? window.Auth.apiFetch.bind(window.Auth)
            : window.fetch.bind(window);
        const resp = await fetcher(`/api/property-intelligence?mode=${encodeURIComponent(mode)}`, init);
        if (!resp || !resp.ok) return null;
        const json = await resp.json();
        if (!json || json.success === false) return null;
        return json;
    } catch (_) {
        // AbortError or network error — silent; the orchestrator surfaces
        // a single combined message at the end based on what came back.
        return null;
    }
}

async function fetchZillow(parts, signal, opts) {
    // Rentcast soft-cap gate. Snapshot the counter; if the agent is at
    // or over their free tier, surface the overage modal before the
    // call goes out. Agent picks "Skip Rentcast" → we still attempt
    // the call but skip the Rentcast tier in the request body (server
    // falls back to AI search only, which is free). Agent picks "Run
    // anyway" → the call proceeds as normal and the audit log entry
    // is already written by the modal.
    let skipRentcastTier = false;
    if (!opts || opts.checkBudget !== false) {
        if (window.IntakeV2Rentcast && typeof window.IntakeV2Rentcast.getSnapshot === 'function') {
            try {
                const snap = await window.IntakeV2Rentcast.getSnapshot();
                if (snap.isOver) {
                    const approved = await window.IntakeV2Rentcast.confirmOverage(
                        [parts.street, parts.city, parts.state, parts.zip].filter(Boolean).join(', ')
                    );
                    if (!approved) skipRentcastTier = true;
                }
            } catch (_) { /* counter unavailable — proceed without budget guard */ }
        }
    }
    const out = await _fetchMode('zillow', {
        address: parts.street, city: parts.city, state: parts.state, zip: parts.zip,
        skipRentcastTier,
        aiSettings: window.AIProvider && window.AIProvider.getSettings ? window.AIProvider.getSettings() : null,
    }, signal);
    if (!out) return null;
    const result = { data: out.data || out, sources: out.sources || null, source: out.source || 'Rentcast/AI' };
    // Increment the counter ONLY when the response was actually served
    // by Rentcast (source attribution includes the string). A 500, an
    // AI-only fallback, or a "no data found" miss never burns a credit.
    if (!skipRentcastTier && window.IntakeV2Rentcast && typeof window.IntakeV2Rentcast.recordCall === 'function') {
        const src = String(result.source || '').toLowerCase();
        if (src.includes('rentcast')) {
            window.IntakeV2Rentcast.recordCall(
                [parts.street, parts.city, parts.state, parts.zip].filter(Boolean).join(', ')
            );
        }
    }
    return result;
}

async function fetchArcgis(parts, signal) {
    const out = await _fetchMode('arcgis', {
        address: parts.street, city: parts.city, state: parts.state, county: parts.county,
    }, signal);
    return out ? { data: out.parcelData || null, flood: out.floodData || null, source: 'County ArcGIS' } : null;
}

async function fetchFire(parts, signal) {
    const out = await _fetchMode('firestation', {
        address: parts.street, city: parts.city, state: parts.state, zip: parts.zip,
    }, signal);
    if (!out) return null;
    return {
        data: {
            fireStationDist: out.fireStationDist,
            fireStationName: out.fireStationName,
            protectionClass: out.protectionClass,
            stationReliability: out.stationReliability || 'responding',
        },
        source: 'Fire / Protection Class',
    };
}

async function fetchVision(parts, signal) {
    const out = await _fetchMode('satellite', {
        address: parts.street, city: parts.city, state: parts.state, zip: parts.zip,
        aiSettings: window.AIProvider && window.AIProvider.getSettings ? window.AIProvider.getSettings() : null,
    }, signal);
    if (!out) return null;
    return {
        data: out.data || {},
        satelliteImage: out.satelliteImage || null,
        streetViewImage: out.streetViewImage || null,
        source: 'AI Vision (satellite + Street View)',
    };
}

// ── Merge ──────────────────────────────────────────────────────────────────

// Per-source field readers — each one normalizes the various shapes the
// upstream APIs return into the v2 home schema's field names. Reading is
// "best-effort first match"; if the source didn't supply the field, we
// return undefined so the merge can skip it.
function _readArcgis(data) {
    if (!data) return {};
    return {
        yrBuilt:    _num(data.yearBuilt),
        sqFt:       _num(data.totalSqft || data.sqFt),
        lotSize:    data.lotSizeAcres ?? data.lotSize,
        bedrooms:   _num(data.bedrooms),
        fullBaths:  _num(data.fullBaths ?? data.bathrooms),
        numStories: data.stories ? String(data.stories) : undefined,
        dwellingType:    data.dwellingType,
        construction:    data.constructionStyle,
        exterior:        data.exteriorWalls,
        foundation:      data.foundationType,
        'garage.type':   data.garageType,
        'garage.spaces': _num(data.garageSpaces),
        'roof.type':     data.roofType,
        'roof.shape':    data.roofShape,
        'roof.yr':       _num(data.roofYr),
        'systems.heatingType': data.heatingType,
        'systems.coolingType': data.cooling,
        'hazards.pool':      data.pool === true || data.pool === 'true' || data.pool === 'Yes',
        'hazards.woodStove': data.woodStove === true || data.woodStove === 'true',
        county:    data.county,
    };
}
function _readZillow(data) {
    if (!data) return {};
    // Zillow / Rentcast / Gemini response shapes are normalized by the
    // server but a few legacy fields show up in alternate names — pick
    // through them defensively.
    const pick = (...keys) => {
        for (const k of keys) {
            const v = data[k];
            if (v != null && v !== '') return (typeof v === 'object' && 'value' in v) ? v.value : v;
        }
        return undefined;
    };
    const bathsRaw = pick('bathrooms', 'baths', 'num_bathrooms');
    let fullB, halfB;
    if (bathsRaw != null) {
        const n = Number(bathsRaw);
        if (Number.isFinite(n)) {
            fullB = Math.floor(n);
            halfB = (n - fullB) >= 0.5 ? 1 : 0;
        }
    }
    return {
        yrBuilt:    _num(pick('yearBuilt', 'yr_built', 'year_built')),
        sqFt:       _num(pick('squareFootage', 'sqft', 'sqFt', 'square_footage', 'building_area')),
        lotSize:    pick('lotSize', 'lot_size', 'lotSizeAcres'),
        bedrooms:   _num(pick('bedrooms', 'beds', 'num_bedrooms')),
        fullBaths:  _num(pick('fullBaths') ?? fullB),
        halfBaths:  _num(pick('halfBaths') ?? halfB),
        numStories: pick('numStories', 'stories'),
        dwellingType:    pick('propertyType', 'dwelling_type', 'property_type'),
        construction:    pick('constructionStyle', 'construction'),
        exterior:        pick('exteriorWalls', 'exterior'),
        foundation:      pick('foundationType', 'foundation'),
        'garage.type':   pick('garageType'),
        'garage.spaces': _num(pick('garageSpaces')),
        'roof.type':     pick('roofType', 'roof_type'),
        'roof.shape':    pick('roofShape', 'roof_shape'),
        'roof.yr':       _num(pick('roofYr', 'roofYearUpdated', 'roof_year')),
        'systems.heatingType': pick('heatingType', 'heating'),
        'systems.coolingType': pick('cooling', 'coolingType'),
        county:    pick('county'),
    };
}
function _readVision(data) {
    if (!data) return {};
    // Vision returns per-field confidence; we only merge values where
    // confidence is explicitly 'high' or 'medium'. v1 used `conf !==
    // 'low'`, which would also accept missing/null/undefined confidence
    // — tightened here so an absent confidence string is treated as low.
    //
    // Boolean hazards (pool / trampoline / tree overhang / brush
    // clearance) no longer auto-merge from this function; they're
    // surfaced as confirmation prompts by extractVisionHazards() and
    // routed through the review modal so the agent can confirm each
    // sighting before it lands in the form.
    const ok = (val, conf) => (val != null && val !== '' && (conf === 'high' || conf === 'medium')) ? val : undefined;
    const conf = data.confidence || {};
    return {
        exterior:    ok(data.exterior_walls, conf.exterior_walls),
        'roof.shape':ok(data.roof_shape,    conf.roof_shape),
        'roof.type': ok(data.roof_material, conf.roof_material),
        numStories:  ok(data.stories,       conf.stories),
    };
}

// Vision hazard prompts — booleans + scoring the satellite/Street-View
// AI returns alongside the structural fields. Each entry is a row the
// review modal renders as a checkbox the agent confirms or unchecks
// before apply. The booleans deliberately don't enter `_readVision`'s
// auto-merge dict — they represent things you might miss on a phone
// call and the agent should look at the imagery before saying yes.
//
// Each hazard entry:
//   { id, icon, label, path?, applyFn?, severity }
//   - `path`     — if set, applyFn writes a string value via
//                  setItemField (used for the dropdown-style fields
//                  pool/trampoline where v2 stores "Yes"/"No"
//                  rather than true/false).
//   - `applyFn`  — custom apply (used for the freeform hazards that
//                  drop into the home's notes field instead of a
//                  dedicated path).
//   - `severity` — drives the chip color in the modal.
// Vision booleans come back as `true | false | null` per the
// satellite endpoint spec — but the AI provider can drift over time
// and serialize them as `'true'` / `'Yes'` / `1`. Match the same
// lenient truthy check ArcGIS uses (_readArcgis treats `true` / `'true'`
// / `'Yes'` as positive evidence) so a string-shape drift doesn't
// silently drop hazard prompts.
const _isTruthyVisionBool = (v) =>
    v === true || v === 'true' || v === 'Yes' || v === 1 || v === '1';
// Brush clearance is the inverse — "false" means inadequate. Match
// against falsy values strictly (null/undefined → not enough data to
// flag, leave it alone).
const _isFalsyVisionBool = (v) =>
    v === false || v === 'false' || v === 'No' || v === 0 || v === '0';

const VISION_HAZARD_HANDLERS = Object.freeze({
    pool: {
        icon: '🏊',
        label: 'Pool visible from satellite',
        detect: (d) => _isTruthyVisionBool(d.has_pool),
        applyTo: (homeId) => window.IntakeV2.setItemField('homes', homeId, 'hazards.pool', true),
        severity: 'warn',
    },
    trampoline: {
        icon: '🎪',
        label: 'Trampoline visible from satellite',
        detect: (d) => _isTruthyVisionBool(d.has_trampoline),
        applyTo: (homeId) => window.IntakeV2.setItemField('homes', homeId, 'hazards.trampoline', true),
        severity: 'warn',
    },
    treeOverhang: {
        icon: '🌲',
        label: 'Tree overhang over roof',
        detect: (d) => _isTruthyVisionBool(d.tree_overhang_roof),
        // No dedicated path — append a note instead so the agent can
        // mention it during the call and reflect it in coverage.
        applyTo: (homeId, home) => {
            const next = [home.notes || '', '⚠ Tree overhang on roof (AI vision).'].filter(Boolean).join(' ');
            window.IntakeV2.setItemField('homes', homeId, 'notes', next);
        },
        severity: 'warn',
    },
    brushClearance: {
        icon: '🔥',
        label: 'Brush clearance inadequate',
        detect: (d) => _isFalsyVisionBool(d.brush_clearance_adequate),
        applyTo: (homeId, home) => {
            const next = [home.notes || '', '⚠ Brush clearance inadequate (AI vision).'].filter(Boolean).join(' ');
            window.IntakeV2.setItemField('homes', homeId, 'notes', next);
        },
        severity: 'risk',
    },
});

function extractVisionHazards(visionPayload) {
    if (!visionPayload || !visionPayload.data) return [];
    const d = visionPayload.data;
    const out = [];
    for (const [id, h] of Object.entries(VISION_HAZARD_HANDLERS)) {
        if (h.detect(d)) {
            out.push({ id, icon: h.icon, label: h.label, severity: h.severity });
        }
    }
    return out;
}
function _readFire(data) {
    if (!data) return {};
    return {
        'hazards.fireStationDist': _num(data.fireStationDist),
        'hazards.protectionClass': _num(data.protectionClass),
    };
}

function _num(v) {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : v; // string falls through (e.g. "1.5" stories)
}

// Merge the four source dicts using ArcGIS-first / Zillow-gap-fill /
// Vision-last priority. Booleans (pool, trampoline, woodStove) treat
// `true` as positive evidence — once any source says true, the field
// stays true even if a later source returns false (cannot reliably
// negate from a photo / a county miss).
function mergeResults({ arcgis, zillow, fire, vision }) {
    const arc = _readArcgis(arcgis && arcgis.data);
    const zil = _readZillow(zillow && zillow.data);
    const vis = _readVision(vision && vision.data);
    const fir = _readFire(fire && fire.data);

    const merged = {};
    const sources = {};
    const PRIORITY = [
        ['arcgis', arc, arcgis && arcgis.source],
        ['zillow', zil, zillow && zillow.source],
        ['vision', vis, vision && vision.source],
        ['fire',   fir, fire   && fire.source],
    ];
    for (const [_, dict, src] of PRIORITY) {
        for (const [key, val] of Object.entries(dict)) {
            if (val == null || val === '') continue;
            if (typeof val === 'boolean') {
                // True wins; once true, never overwrite with false.
                if (val === true && merged[key] !== true) { merged[key] = true; sources[key] = src; }
                continue;
            }
            // ArcGIS-first / Zillow-gap-fill — don't overwrite a value
            // that's already set by a higher-priority source.
            if (merged[key] != null && merged[key] !== '') continue;
            merged[key] = val;
            sources[key] = src;
        }
    }

    // Flood data has its own shape; attach as-is so the future review
    // modal can show it. No v2 fields exist for floodZone yet, so it's
    // ignored by the silent apply path.
    if (arcgis && arcgis.flood) {
        merged.__flood = arcgis.flood;
        sources.__flood = arcgis.source;
    }
    if (vision && (vision.satelliteImage || vision.streetViewImage)) {
        merged.__images = {
            satellite: vision.satelliteImage,
            streetView: vision.streetViewImage,
        };
    }
    return { merged, sources };
}

// ── Apply ──────────────────────────────────────────────────────────────────

// Write each merged field into the v2 home item via setItemField. Dotted
// paths are passed through verbatim — setItemField walks them. Existing
// non-empty values are preserved (gap-fill only) so we never overwrite
// the agent's typed value.
function _applyToHome(homeId, merged) {
    const home = window.IntakeV2.getItem('homes', homeId);
    if (!home) return 0;
    let count = 0;
    for (const [path, value] of Object.entries(merged)) {
        if (path.startsWith('__')) continue; // __flood, __images — meta
        if (value == null || value === '') continue;
        // Resolve current value through the dotted path to check empty.
        const current = path.split('.').reduce((acc, k) => acc && acc[k], home);
        if (current != null && current !== '' && current !== false) continue;
        const writeVal = (typeof value === 'number') ? String(value) : value;
        window.IntakeV2.setItemField('homes', homeId, path, writeVal);
        count++;
    }
    return count;
}

// ── Public orchestrator ────────────────────────────────────────────────────

async function run(homeId, options = {}) {
    const home = window.IntakeV2.getItem('homes', homeId);
    if (!home) return { ok: false, reason: 'no-home' };
    const parts = parseAddress(home.address);
    if (!parts || !parts.street || !parts.city || !parts.state) {
        if (window.App && window.App.toast) {
            window.App.toast('Enter the full property address first (street, city, ST ZIP)', { type: 'info', duration: 3000 });
        }
        return { ok: false, reason: 'bad-address' };
    }

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    if (window.App && window.App.toast) {
        window.App.toast('Looking up property from county + Rentcast + AI vision…', { type: 'info', duration: 3000 });
    }
    let arcgis, zillow, fire, vision;
    try {
        [arcgis, zillow, fire, vision] = await Promise.all([
            fetchArcgis(parts, ctrl.signal),
            fetchZillow(parts, ctrl.signal),
            fetchFire(parts, ctrl.signal),
            fetchVision(parts, ctrl.signal),
        ]);
    } finally {
        clearTimeout(tid);
    }

    const { merged, sources } = mergeResults({ arcgis, zillow, fire, vision });
    const hazards = extractVisionHazards(vision);
    // Underwriter notes from the vision endpoint: a freeform summary
    // (`notes`) + an array of bullet-point flags (`visible_hazards`).
    // Surface these in the review modal as a read-only callout so the
    // agent sees the AI's qualitative observations alongside the
    // checkbox prompts.
    const visionNotes = (vision && vision.data && (vision.data.notes || (vision.data.visible_hazards && vision.data.visible_hazards.length)))
        ? {
            summary: vision.data.notes || '',
            bullets: Array.isArray(vision.data.visible_hazards) ? vision.data.visible_hazards : [],
        }
        : null;

    // If onPreview is provided, hand the merged dict to a review modal
    // instead of applying directly. (Phase 17 wires this; Phase 16
    // keeps the silent-apply path so the existing button keeps working.)
    if (typeof options.onPreview === 'function') {
        return { ok: true, parts, merged, sources, hazards, visionNotes, arcgis, zillow, fire, vision };
    }

    const filled = _applyToHome(homeId, merged);
    const liveSources = [arcgis, zillow, fire, vision].filter(Boolean).map(s => s.source).filter(Boolean);
    if (window.App && window.App.toast) {
        if (filled > 0) {
            window.App.toast(`Filled ${filled} field${filled === 1 ? '' : 's'} from ${liveSources.length} source${liveSources.length === 1 ? '' : 's'}`, { type: 'success', duration: 3500 });
        } else if (liveSources.length === 0) {
            window.App.toast('No property data sources reachable — check connection or fill manually', { type: 'error', duration: 4000 });
        } else {
            window.App.toast('Sources returned no usable data for that address', { type: 'info', duration: 3000 });
        }
    }
    return { ok: true, filled, parts, merged, sources, arcgis, zillow, fire, vision };
}

// ── Review modal ───────────────────────────────────────────────────────────

// Human-readable label for each v2 home field path. Looked up via the
// collection schema so the modal matches whatever the form actually shows
// (rename a label in intake-v2-fields.js, the modal picks it up
// automatically). Fields not in the schema (county, fireStationDist,
// hazards.* booleans, etc.) get fallback labels here.
function _labelForPath(path) {
    const FALLBACKS = {
        'county':                  'County',
        'hazards.fireStationDist': 'Fire station distance (mi)',
        'hazards.protectionClass': 'Protection class',
        'hazards.pool':            'Pool',
        'hazards.trampoline':      'Trampoline',
        'hazards.woodStove':       'Wood / pellet stove',
    };
    if (FALLBACKS[path]) return FALLBACKS[path];
    const fields = window.IntakeV2Fields && window.IntakeV2Fields.collections && window.IntakeV2Fields.collections.homes;
    if (fields && fields.fields) {
        const f = fields.fields.find(x => x.path === path);
        if (f) return f.label;
    }
    return path;
}

function _formatValue(path, val) {
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (val == null) return '';
    return String(val);
}

// Render a single review row. Each row owns its own checkbox keyed on the
// merged path so the apply step can iterate `[data-path][checked]`.
function _renderReviewRow(path, value, sourceLabel) {
    const id = `iv2-sf-row-${path.replace(/[.#]/g, '-')}`;
    return `<label class="iv2-smartfill-row" for="${id}">
        <input type="checkbox" id="${id}" data-path="${path}" checked>
        <span class="iv2-smartfill-label">${_esc(_labelForPath(path))}</span>
        <span class="iv2-smartfill-value">${_esc(_formatValue(path, value))}</span>
        <span class="iv2-smartfill-source">${_esc(sourceLabel || 'Unknown')}</span>
    </label>`;
}

let _modalEl = null;
function _modal() {
    if (_modalEl) return _modalEl;
    const el = document.createElement('div');
    el.className = 'iv2-smartfill-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Property data review');
    el.hidden = true;
    el.innerHTML = `
        <div class="iv2-smartfill-modal" role="document">
            <header class="iv2-smartfill-head">
                <div>
                    <h3>✨ Smart Scan results</h3>
                    <p class="iv2-smartfill-sources"></p>
                </div>
                <button type="button" class="iv2-smartfill-close" aria-label="Close">✕</button>
            </header>
            <div class="iv2-smartfill-body"></div>
            <footer class="iv2-smartfill-foot">
                <span class="iv2-smartfill-hint">Uncheck any value you'd rather type yourself.</span>
                <button type="button" class="iv2-smartfill-cancel">Skip</button>
                <button type="button" class="iv2-smartfill-apply">Apply selected</button>
            </footer>
        </div>
    `;
    document.body.appendChild(el);
    _modalEl = el;
    // Close on overlay click (outside the modal box) + Esc.
    el.addEventListener('click', (e) => { if (e.target === el) _closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (!_modalEl || _modalEl.hidden) return;
        if (e.key === 'Escape') _closeModal();
    });
    el.querySelector('.iv2-smartfill-close').addEventListener('click', _closeModal);
    el.querySelector('.iv2-smartfill-cancel').addEventListener('click', _closeModal);
    return el;
}

function _closeModal() {
    if (!_modalEl) return;
    _modalEl.hidden = true;
    _modalEl.removeAttribute('data-home-id');
}

// Update the "Apply N selected" button's count to reflect current
// checkbox state. Re-runs on every row toggle.
function _updateApplyCount() {
    if (!_modalEl) return;
    // Count both scalar field rows AND vision hazard prompts — either
    // class of suggestion contributes to the "Apply N selected" total.
    const scalar  = _modalEl.querySelectorAll('.iv2-smartfill-row input[type=checkbox]:checked').length;
    const hazards = _modalEl.querySelectorAll('.iv2-smartfill-hazard input[type=checkbox]:checked').length;
    const total = scalar + hazards;
    const btn = _modalEl.querySelector('.iv2-smartfill-apply');
    btn.textContent = total === 0 ? 'Nothing selected' : `Apply ${total} selected`;
    btn.disabled = total === 0;
}

function _showReviewModal(homeId, payload) {
    const el = _modal();
    const body = el.querySelector('.iv2-smartfill-body');
    const sourcesNode = el.querySelector('.iv2-smartfill-sources');

    // Build the row list. Sort by source priority (ArcGIS first, then
    // Zillow, then Vision, then Fire) so the agent's eye lands on the
    // highest-confidence data first. Sub-string matches are intentional
    // so a server-side rename (`"Rentcast"` ↔ `"Rentcast/AI"` ↔
    // `"Rentcast + Redfin"`) doesn't drop the row into the unsorted
    // bucket — anything with `rentcast` anywhere lands in the Zillow
    // tier.
    const ORDER_RULES = [
        { rank: 0, match: /arcgis|county/i        },
        { rank: 1, match: /rentcast|redfin|zillow/i },
        { rank: 2, match: /vision|satellite|street/i },
        { rank: 3, match: /fire|protection/i      },
    ];
    function _sourceRank(label) {
        if (!label) return 99;
        for (const rule of ORDER_RULES) if (rule.match.test(label)) return rule.rank;
        return 98;
    }
    const rows = Object.entries(payload.merged)
        .filter(([k]) => !k.startsWith('__'))
        .sort(([ka, _a], [kb, _b]) => {
            return _sourceRank(payload.sources[ka]) - _sourceRank(payload.sources[kb]);
        });

    // Vision findings — hazard prompts (pool / trampoline / tree / brush)
    // surface at the top of the modal, BEFORE the scalar field rows.
    // Each prompt is a checkbox the agent confirms or rejects; rejected
    // hazards never write to the form. Underwriter notes (the
    // freeform `notes` + `visible_hazards` bullets the vision endpoint
    // returns) render as a read-only callout under the checkboxes.
    let hazardHTML = '';
    const hazards = Array.isArray(payload.hazards) ? payload.hazards : [];
    if (hazards.length || payload.visionNotes) {
        const hazardRows = hazards.map(h => {
            const id = `iv2-sf-hazard-${h.id}`;
            return `<label class="iv2-smartfill-hazard iv2-smartfill-hazard-${_esc(h.severity)}" for="${id}">
                <input type="checkbox" id="${id}" data-hazard-id="${_esc(h.id)}">
                <span class="iv2-smartfill-hazard-icon" aria-hidden="true">${h.icon}</span>
                <span class="iv2-smartfill-hazard-label">${_esc(h.label)}</span>
                <span class="iv2-smartfill-hazard-hint">Confirm if you spot it in the imagery</span>
            </label>`;
        }).join('');
        let notesHTML = '';
        if (payload.visionNotes) {
            const summary = _esc(payload.visionNotes.summary);
            const bullets = (payload.visionNotes.bullets || []).map(b => `<li>${_esc(b)}</li>`).join('');
            notesHTML = `<div class="iv2-smartfill-vision-notes">
                <strong>Underwriter notes from satellite + Street View</strong>
                ${summary ? `<p>${summary}</p>` : ''}
                ${bullets ? `<ul>${bullets}</ul>` : ''}
            </div>`;
        }
        hazardHTML = `<section class="iv2-smartfill-section">
            <h4 class="iv2-smartfill-section-title">🛰️ Vision findings</h4>
            ${hazardRows ? `<div class="iv2-smartfill-hazards">${hazardRows}</div>` : ''}
            ${notesHTML}
        </section>`;
    }

    if (rows.length === 0 && !hazards.length) {
        body.innerHTML = `<p class="iv2-smartfill-empty">No new property data found for that address. Try a different format (street, city, state, ZIP), or fill manually.</p>`;
        el.querySelector('.iv2-smartfill-apply').style.display = 'none';
    } else {
        el.querySelector('.iv2-smartfill-apply').style.display = '';
        const scalarHTML = rows.length
            ? `<section class="iv2-smartfill-section">
                ${hazards.length ? `<h4 class="iv2-smartfill-section-title">📋 Property details</h4>` : ''}
                ${rows.map(([path, value]) => _renderReviewRow(path, value, payload.sources[path])).join('')}
            </section>`
            : '';
        body.innerHTML = hazardHTML + scalarHTML;
    }

    // Source summary — list every source that actually returned data so
    // the agent knows what was consulted.
    const liveSources = [];
    if (payload.arcgis) liveSources.push('County ArcGIS');
    if (payload.zillow) liveSources.push(payload.zillow.source || 'Rentcast/AI');
    if (payload.fire)   liveSources.push('Fire / Protection Class');
    if (payload.vision) liveSources.push('AI Vision');
    sourcesNode.textContent = liveSources.length
        ? `Pulled from ${liveSources.join(' · ')}`
        : 'No sources returned data — try again or fill manually';

    // Wire per-row checkbox toggling. Re-binds on every open since the
    // body innerHTML is rebuilt.
    body.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', _updateApplyCount);
    });

    // Wire the apply button. Single-shot — replaces the listener each
    // open so it closes over the current homeId / payload pair.
    const applyBtn = el.querySelector('.iv2-smartfill-apply');
    const clone = applyBtn.cloneNode(true);
    applyBtn.parentNode.replaceChild(clone, applyBtn);
    clone.addEventListener('click', () => {
        // Scalar fields — checked rows write via _applyToHome's
        // gap-fill rules (never overwrites an agent's typed value).
        const subset = {};
        body.querySelectorAll('input[type=checkbox][data-path]:checked').forEach(cb => {
            const p = cb.getAttribute('data-path');
            subset[p] = payload.merged[p];
        });
        const filled = _applyToHome(homeId, subset);

        // Vision hazards — each checked checkbox calls its handler's
        // applyTo(homeId, home). Handlers know how to translate the
        // hazard into the right v2 path (pool/trampoline → hazard
        // dropdown; tree/brush → notes append).
        let hazardsApplied = 0;
        const home = window.IntakeV2.getItem('homes', homeId);
        body.querySelectorAll('input[type=checkbox][data-hazard-id]:checked').forEach(cb => {
            const hid = cb.getAttribute('data-hazard-id');
            const handler = VISION_HAZARD_HANDLERS[hid];
            if (!handler || !home) return;
            try { handler.applyTo(homeId, home); hazardsApplied++; } catch (_) {}
        });

        _closeModal();
        if (window.App && window.App.toast) {
            const parts = [];
            if (filled)         parts.push(`${filled} field${filled === 1 ? '' : 's'}`);
            if (hazardsApplied) parts.push(`${hazardsApplied} hazard${hazardsApplied === 1 ? '' : 's'}`);
            const summary = parts.length ? parts.join(' + ') : 'nothing';
            window.App.toast(`✓ Applied ${summary} from Smart Scan`, { type: 'success', duration: 3000 });
        }
        if (window.IntakeV2 && typeof window.IntakeV2.requestRerender === 'function') {
            window.IntakeV2.requestRerender();
        }
    });

    el.setAttribute('data-home-id', homeId);
    el.hidden = false;
    _updateApplyCount();
}

function _esc(s) {
    return (window.Utils && window.Utils.escapeHTML)
        ? window.Utils.escapeHTML(String(s ?? ''))
        : String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// runWithReview — same orchestration as run() but routes the merged
// payload into the review modal instead of writing directly. The
// orchestrator's `onPreview` option is what tells run() to skip the
// silent-apply path.
async function runWithReview(homeId) {
    const result = await run(homeId, { onPreview: true });
    if (!result.ok) return result;
    _showReviewModal(homeId, result);
    return result;
}

window.IntakeV2SmartFill = { run, runWithReview, parseAddress, mergeResults, extractVisionHazards };

})();
