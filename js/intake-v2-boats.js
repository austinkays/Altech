// intake-v2-boats.js — Boat / PWC card renderer.
//
// Reuses IntakeV2EntityCard.renderEntityCard for the standard card shell and
// the operator picker. Adds:
//   - HIN validator: 12 alphanumeric chars. Inline warning when present and
//     invalid, but never blocks (per plan — defer with Alt+L if missing).
//   - Older/wood-hull "marine survey required" warning (Safeco, Travelers).
//
// All special handling beyond the standard fields lives in the post-render
// pass below — the field schema in intake-v2-fields.js drives the grid.

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

const HIN_RE = /^[A-Z0-9]{12}$/;

function decodeHIN(hin) {
    if (!hin) return { ok: false, reason: 'empty' };
    // Strip spaces, hyphens, and non-alphanumeric chars — agents often
    // paste HINs with separators ("ABC-1234-5678") from dealer paperwork.
    const v = String(hin).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!HIN_RE.test(v)) return { ok: false, reason: 'format', normalized: v };
    return { ok: true, normalized: v, manufacturerCode: v.slice(0, 3) };
}

function boatWarnings(b) {
    const warns = [];
    if (b.hin && !HIN_RE.test(String(b.hin).toUpperCase())) warns.push('HIN should be 12 alphanumeric characters.');
    const yr = Number(b.year);
    const age = yr ? (new Date().getFullYear() - yr) : 0;
    if (age > 15 && Number(b.length) > 30) warns.push('Safeco requires a Marine Survey for boats > 15 yrs and > 30 ft.');
    if (b.hullMaterial === 'Wood' && age > 5) warns.push('Safeco requires a Marine Survey for wood boats > 5 yrs.');
    if (age > 30 && Number(b.marketValue) > 30000 && !(b.docs && b.docs.photos)) {
        warns.push('Travelers requires bilge / running gear / engine / exterior photos.');
    }
    return warns;
}

function extraBoatBody(b) {
    const warns = boatWarnings(b);
    if (!warns.length) return '';
    return `<div style="margin-top:8px; padding:8px 10px; border-radius:8px; background:rgba(197,136,0,0.08); border-left:3px solid #C58800; font-size:12px;">
        <strong style="color:#C58800">Heads up:</strong> ${warns.map(w => esc(w)).join(' · ')}
    </div>`;
}

function renderBoats() {
    const root = document.querySelector('[data-render="boats"]');
    if (!root) return;
    const boats = window.IntakeV2.data.boats || [];
    if (!boats.length) {
        root.innerHTML = '';
        return;
    }
    const cards = boats.map(b => window.IntakeV2EntityCard.renderEntityCard('boats', b, {
        extraBodyHTML: extraBoatBody(b),
    })).join('');
    root.innerHTML = `<h4 style="margin:6px 0; color:var(--text-secondary); font-size:12px; text-transform:uppercase; letter-spacing:0.05em;">Boats / PWC (${boats.length})</h4>${cards}`;
    window.IntakeV2EntityCard.wireCardActions(root, 'boats');

    // HIN normalize on blur (uppercase + trim) — but never block
    root.querySelectorAll('input[data-field-path="hin"]').forEach(inp => {
        inp.addEventListener('blur', () => {
            const decoded = decodeHIN(inp.value);
            if (decoded.normalized && decoded.normalized !== inp.value) {
                inp.value = decoded.normalized;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (!decoded.ok && decoded.reason === 'format' && inp.value) {
                inp.title = 'HIN should be 12 alphanumeric characters — saved anyway. Press Alt+L to defer.';
                inp.style.borderColor = '#C58800';
            } else {
                inp.title = '';
                inp.style.borderColor = '';
            }
        });
    });
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('boats', renderBoats);
    renderBoats();
});

// Expose validator for tests
window.IntakeV2Boats = { decodeHIN, boatWarnings };

})();
