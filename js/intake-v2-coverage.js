// intake-v2-coverage.js — Coverage / Prior insurance / Discounts section.
//
// Pulls every scalar field with section === 'coverage' from IntakeV2Fields,
// groups them into clusters (Prior Home / Prior Auto / Prior Boat / Prior RV
// / Discounts / Affinity), and renders a tight field grid.

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

const CLUSTERS = [
    { title: 'Prior Insurance — Continuous coverage', paths: ['priorInsurance.continuous','priorInsurance.continuousMonths'] },
    { title: 'Prior Home',  paths: ['priorInsurance.home.carrier','priorInsurance.home.exp'] },
    { title: 'Prior Auto',  paths: ['priorInsurance.auto.carrier','priorInsurance.auto.exp','priorInsurance.auto.limits'] },
    { title: 'Prior Boat',  paths: ['priorInsurance.boat.carrier','priorInsurance.boat.exp'] },
    { title: 'Prior RV',    paths: ['priorInsurance.rv.carrier','priorInsurance.rv.exp'] },
    { title: 'Discounts',           paths: ['discounts.homeowner','discounts.safetyCourse.auto','discounts.safetyCourse.boat','discounts.safetyCourse.rv'] },
    { title: 'Affinity memberships',paths: ['discounts.affinity.usaa','discounts.affinity.hog','discounts.affinity.uscgAux','discounts.affinity.usps'] },
];

function renderScalarField(f) {
    const fullClass = f.mode === 'full' ? ' iv2-full-only' : '';
    let control;
    if (f.type === 'select') {
        // Plain strings → value === label; [value, label] tuples for
        // dropdowns where the value is a code but the label is the
        // human-readable name. See US_STATES in intake-v2-fields.js.
        const opts = (f.options || []).map(opt => {
            const [value, label] = Array.isArray(opt) ? opt : [opt, opt];
            return `<option value="${escAttr(value)}">${esc(label || '—')}</option>`;
        }).join('');
        control = `<select id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}">${opts}</select>`;
    } else if (f.type === 'checkbox') {
        return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(f.path)}"><label style="flex-direction:row; align-items:center; gap:6px;"><input type="checkbox" id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}"> ${esc(f.label)}</label><span class="iv2-field-defer-badge" style="display:none">deferred</span></div>`;
    } else {
        control = `<input type="${escAttr(f.type)}" id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}">`;
    }
    return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(f.path)}">
        <label for="${escAttr(f.id)}">${esc(f.label)}</label>
        ${control}
        <span class="iv2-field-defer-badge" style="display:none">deferred</span>
    </div>`;
}

function renderCoverage() {
    const root = document.querySelector('[data-render="coverage"]');
    if (!root) return;
    const fields = window.IntakeV2Fields.scalar;
    const html = CLUSTERS.map(c => {
        const items = c.paths.map(p => fields.find(f => f.path === p)).filter(Boolean);
        const grid  = items.map(renderScalarField).join('');
        return `<div class="iv2-field-cluster">
            <h4 style="margin:8px 0 6px; font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">${esc(c.title)}</h4>
            <div class="iv2-field-grid">${grid}</div>
        </div>`;
    }).join('');
    root.innerHTML = html;

    // Repaint values
    for (const p of CLUSTERS.flatMap(c => c.paths)) {
        const f = window.IntakeV2Fields.scalar.find(x => x.path === p);
        if (!f) continue;
        const el = document.getElementById(f.id);
        if (!el) continue;
        const v = window.IntakeV2._getByPath(window.IntakeV2.data, p);
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v == null ? '' : String(v);
    }
    if (window.IntakeV2._defer) window.IntakeV2._defer.render();
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('coverage', renderCoverage);
    renderCoverage();
});

})();
