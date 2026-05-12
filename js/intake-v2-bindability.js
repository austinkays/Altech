// intake-v2-bindability.js — Live carrier bindability calculation.
//
// Reads IntakeV2Fields for any field marked `bindable: { carrier: true }`,
// inspects IntakeV2.data, and returns per-carrier per-product readiness.
//
// The carrier list (Progressive, Foremost, Travelers, Safeco) is fixed for
// this rebuild. To extend, add a new key in CARRIERS and tag the relevant
// fields in `js/intake-v2-fields.js`.
//
// Deferred fields (paths in IntakeV2.data.deferred) are NOT marked missing —
// they're surfaced separately in the Review section. This lets the agent
// move on with confidence while leaving a clear follow-up trail.
//
// The output drives:
//   - top-bar ✓/✗ indicator (intake-v2-layout.js)
//   - per-card status dots (intake-v2-operators / autos / boats / rvs / property)
//   - Review section validation summary (intake-v2-review.js)

'use strict';

(function () {

const CARRIERS = ['progressive', 'foremost', 'travelers', 'safeco'];
const CARRIER_LABELS = {
    progressive: 'Progressive',
    foremost:    'Foremost',
    travelers:   'Travelers',
    safeco:      'Safeco',
};

// Per-product "is this product even in play" — derived from arrays being non-empty.
function activeProducts(data) {
    return {
        home: Array.isArray(data.homes) && data.homes.length > 0,
        auto: Array.isArray(data.autos) && data.autos.length > 0,
        boat: Array.isArray(data.boats) && data.boats.length > 0,
        rv:   Array.isArray(data.rvs)   && data.rvs.length   > 0,
    };
}

function valueAt(obj, dotPath) {
    if (!obj || !dotPath) return undefined;
    const parts = dotPath.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

function isFilled(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'boolean') return true; // checkbox presence is enough
    if (Array.isArray(v)) return v.length > 0;
    return true;
}

// Each scalar field marked `bindable.{carrier}: true` is a per-applicant check.
// Each collection field marked `bindable.{carrier}: true` is a per-item check
// — Progressive needs vehicle VIN on every auto, not just one.

function computeBindability(opts) {
    const data    = (opts && opts.data)     || (window.IntakeV2 && window.IntakeV2.data);
    const fields  = (opts && opts.fields)   || window.IntakeV2Fields;
    if (!data || !fields) return null;

    const deferred = new Set(Array.isArray(data.deferred) ? data.deferred : []);
    const active   = activeProducts(data);

    // Determine which "lines" are in scope per carrier. If a carrier doesn't
    // write a particular product line, missing fields for that product don't
    // hurt — but for this rebuild we assume all four carriers write all four
    // lines. If that changes, narrow `productsForCarrier(carrier)`.
    const productsForCarrier = () => active;

    const out = {};

    for (const carrier of CARRIERS) {
        const missing = []; // { path, label, productKey, itemId? }
        const prods = productsForCarrier();

        // 1) Scalar (top-level) fields — applicant, address, etc.
        for (const f of fields.scalar) {
            if (!f.bindable || !f.bindable[carrier]) continue;

            // Co-applicant fields only required if coApplicant.present
            if (f.path.startsWith('coApplicant.') && !data.coApplicant?.present) continue;

            if (deferred.has(f.path)) continue;
            const v = valueAt(data, f.path);
            if (!isFilled(v)) missing.push({ path: f.path, label: f.label });
        }

        // 2) Collection-item fields — operators, homes, autos, boats, rvs.
        for (const [collKey, collDef] of Object.entries(fields.collections)) {
            const productKey = collKey === 'homes' ? 'home'
                             : collKey === 'autos' ? 'auto'
                             : collKey === 'boats' ? 'boat'
                             : collKey === 'rvs'   ? 'rv'
                             : null;
            // Operators are required-if-any auto/boat/rv exists; not their own product.
            const isOperatorPool = collKey === 'operators';
            if (!isOperatorPool && productKey && !prods[productKey]) continue;

            const items = Array.isArray(data[collKey]) ? data[collKey] : [];

            if (isOperatorPool) {
                // Operators only matter for the carrier if there's any vehicle / boat / rv
                if (!prods.auto && !prods.boat && !prods.rv) continue;
            }

            for (const item of items) {
                for (const f of collDef.fields) {
                    if (!f.bindable || !f.bindable[carrier]) continue;
                    const fieldDotPath = `${collKey}#${item.id}.${f.path}`;
                    if (deferred.has(fieldDotPath)) continue;
                    const v = valueAt(item, f.path);
                    if (!isFilled(v)) {
                        missing.push({
                            path: fieldDotPath,
                            label: f.label,
                            productKey: productKey || 'operator',
                            itemId: item.id,
                            itemLabel: itemSummary(collKey, item),
                        });
                    }
                }
                // Synthetic checks: fields that don't live in collDef.fields
                // but are still required to bind. (Operator picker manages
                // primaryOperatorId; the home card renders address in a
                // separate header above the field grid.)
                if (collKey === 'autos' || collKey === 'boats' || collKey === 'rvs') {
                    const primaryPath = `${collKey}#${item.id}.primaryOperatorId`;
                    if (!deferred.has(primaryPath) && !isFilled(item.primaryOperatorId)) {
                        missing.push({
                            path: primaryPath,
                            label: 'Primary operator',
                            productKey: productKey,
                            itemId: item.id,
                            itemLabel: itemSummary(collKey, item),
                        });
                    }
                }
                if (collKey === 'homes') {
                    const addrPath = `${collKey}#${item.id}.address`;
                    if (!deferred.has(addrPath) && !isFilled(item.address)) {
                        missing.push({
                            path: addrPath,
                            label: 'Property address',
                            productKey: 'home',
                            itemId: item.id,
                            itemLabel: itemSummary(collKey, item),
                        });
                    }
                }
            }
        }

        out[carrier] = {
            label: CARRIER_LABELS[carrier],
            ok: missing.length === 0,
            missing,
        };
    }

    return out;
}

// Per-card status used by entity renderers to show the red/yellow/green dot.
// Returns the status object for one item.
function statusForItem(collKey, item, deferredSet) {
    if (!item) return { level: 'block', missing: [] };
    const fields = window.IntakeV2Fields && window.IntakeV2Fields.collections[collKey];
    if (!fields) return { level: 'ok', missing: [] };

    const deferred = deferredSet || new Set(window.IntakeV2.data.deferred || []);
    const carrierMissing = {};
    for (const c of CARRIERS) carrierMissing[c] = [];

    for (const f of fields.fields) {
        if (!f.bindable) continue;
        const v = valueAt(item, f.path);
        const path = `${collKey}#${item.id}.${f.path}`;
        if (deferred.has(path)) continue;
        if (isFilled(v)) continue;
        for (const c of CARRIERS) {
            if (f.bindable[c]) carrierMissing[c].push({ path, label: f.label });
        }
    }
    // Same synthetic checks as computeBindability — without these the
    // per-card status dot would be green for a vehicle with no driver
    // or a home with no property address.
    if (collKey === 'autos' || collKey === 'boats' || collKey === 'rvs') {
        const primaryPath = `${collKey}#${item.id}.primaryOperatorId`;
        if (!deferred.has(primaryPath) && !isFilled(item.primaryOperatorId)) {
            for (const c of CARRIERS) carrierMissing[c].push({ path: primaryPath, label: 'Primary operator' });
        }
    }
    if (collKey === 'homes') {
        const addrPath = `${collKey}#${item.id}.address`;
        if (!deferred.has(addrPath) && !isFilled(item.address)) {
            for (const c of CARRIERS) carrierMissing[c].push({ path: addrPath, label: 'Property address' });
        }
    }

    // Green = no carrier blocked; Yellow = at least one carrier ok; Red = none ok.
    const okCount = CARRIERS.filter(c => carrierMissing[c].length === 0).length;
    let level = 'block';
    if (okCount === CARRIERS.length) level = 'ok';
    else if (okCount > 0) level = 'warn';
    // Worst-case missing list — union across carriers (deduped by path)
    const seen = new Set();
    const missing = [];
    for (const c of CARRIERS) for (const m of carrierMissing[c]) {
        if (seen.has(m.path)) continue;
        seen.add(m.path);
        missing.push(m);
    }
    return { level, missing, perCarrier: carrierMissing };
}

function itemSummary(collKey, item) {
    if (!item) return '';
    if (collKey === 'operators') return `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Operator';
    if (collKey === 'homes')     return `${item.address || ''}`.trim() || 'Home';
    if (collKey === 'autos')     return `${item.year || ''} ${item.make || ''} ${item.model || ''}`.trim() || 'Auto';
    if (collKey === 'boats')     return `${item.year || ''} ${item.make || ''} ${item.model || ''}`.trim() || 'Boat';
    if (collKey === 'rvs')       return `${item.year || ''} ${item.make || ''} ${item.model || ''}`.trim() || 'RV';
    return '';
}

window.IntakeV2Bindability = {
    CARRIERS,
    CARRIER_LABELS,
    activeProducts,
    computeBindability,
    statusForItem,
    valueAt,
    isFilled,
};

})();
