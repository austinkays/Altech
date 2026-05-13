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
                <button type="button" class="iv2-smart-scan-btn" data-rentcast-prefill="${escAttr(home.id)}" title="Smart Scan — pull from county records, Rentcast, fire-station data, and AI vision in parallel"><span class="iv2-smart-scan-icon" aria-hidden="true">✨</span> Smart Scan</button>
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

    // Wire Smart Scan buttons. Each click toggles a loading state on
    // the button itself so the agent can see it's in flight (orchestra
    // can take 8-12s for ArcGIS+Vision+Fire+Zillow). Re-entrancy is
    // blocked while a scan is open.
    root.querySelectorAll('[data-rentcast-prefill]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.dataset.busy === '1') return;
            const id = btn.getAttribute('data-rentcast-prefill');
            const original = btn.innerHTML;
            btn.dataset.busy = '1';
            btn.disabled = true;
            btn.classList.add('is-loading');
            btn.innerHTML = '<span class="iv2-smart-scan-spinner" aria-hidden="true"></span> Scanning…';
            try {
                await tryPrefill(id);
            } finally {
                btn.dataset.busy = '0';
                btn.disabled = false;
                btn.classList.remove('is-loading');
                btn.innerHTML = original;
            }
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
    // Delegate to the smart-fill orchestrator (intake-v2-smart-fill.js).
    // `runWithReview` fires the same parallel ArcGIS + Rentcast + Fire +
    // Vision sweep v1's smartAutoFill uses, then opens a review modal so
    // the agent can uncheck any value they'd rather type themselves
    // before applying. Falls back to a no-op + toast if the smart-fill
    // module didn't load for any reason.
    if (window.IntakeV2SmartFill && typeof window.IntakeV2SmartFill.runWithReview === 'function') {
        return window.IntakeV2SmartFill.runWithReview(homeId);
    }
    if (window.App && window.App.toast) {
        window.App.toast('Smart fill module not loaded — refresh the page', { type: 'error', duration: 3500 });
    }
}

// Legacy `pickField` / `DWELLING_NORMALIZE` / `applyPrefill` were removed
// in May 2026 — they only handled the Rentcast single-source fetch the
// old tryPrefill ran, and their field coverage was a tiny subset of what
// the new IntakeV2SmartFill module (intake-v2-smart-fill.js) writes. The
// orchestrator now reaches all four /api/property-intelligence modes
// (ArcGIS, Rentcast/Gemini, Fire Station, Vision) in parallel and merges
// using the same ArcGIS-first priority v1's smartAutoFill uses.

window.IntakeV2.onBoot(function () {
    this.registerRenderer('homes', renderHomes);
    renderHomes();
});

})();
