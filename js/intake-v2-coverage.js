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
        // Unified .iv2-checkbox-row / .iv2-switch-row markup from
        // Phase 3. Coverage was missed by that pass — Discounts +
        // Affinity Memberships kept the legacy inline-styled <label>
        // which floated the checkbox above the label text whenever
        // the parent grid stretched.
        const rowClass = f.kind === 'switch' ? 'iv2-switch-row' : 'iv2-checkbox-row';
        return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(f.path)}"><label class="${rowClass}" for="${escAttr(f.id)}"><input type="checkbox" id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}"> <span>${esc(f.label)}</span></label><span class="iv2-field-defer-badge" style="display:none">deferred</span></div>`;
    } else {
        control = `<input type="${escAttr(f.type)}" id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}">`;
    }
    return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(f.path)}">
        <label for="${escAttr(f.id)}">${esc(f.label)}</label>
        ${control}
        <span class="iv2-field-defer-badge" style="display:none">deferred</span>
    </div>`;
}

// Visibility for fields that should appear conditionally on a sibling field's
// value (e.g. "Months Continuous" only when "Continuous Coverage" is Yes).
// Kept here instead of in fields.js because the conditions are renderer-side
// UX, not data-shape rules — the data field still exists when hidden.
const CONDITIONAL_REVEAL = [
    {
        // Reveal `priorInsurance.continuousMonths` when continuous is 'Yes'.
        // Pre-fix, picking Yes/No produced no visible feedback because the
        // months field is `mode:'full'` and Quick mode hides it — the agent
        // had no way to tell the dropdown actually did anything.
        field: 'priorInsurance.continuousMonths',
        showIf: (data) => data.priorInsurance && data.priorInsurance.continuous === 'Yes',
    },
];

function _applyConditionalReveal(root) {
    const data = window.IntakeV2.data;
    for (const rule of CONDITIONAL_REVEAL) {
        const wrap = root.querySelector(`[data-field-wrap="${rule.field}"]`);
        if (!wrap) continue;
        const show = !!rule.showIf(data);
        // Use a class so we don't fight with iv2-full-only mode toggles. The
        // CSS rule (added in intake-v2.css) flips display:block back on when
        // .iv2-revealed is set, overriding the mode-based hide.
        wrap.classList.toggle('iv2-revealed', show);
    }
}

function renderCoverage() {
    const root = document.querySelector('[data-render="coverage"]');
    if (!root) return;
    const fields = window.IntakeV2Fields.scalar;
    const html = CLUSTERS.map(c => {
        const items = c.paths.map(p => fields.find(f => f.path === p)).filter(Boolean);
        const grid  = items.map(renderScalarField).join('');
        // If EVERY field in the cluster is `mode: 'full'`, the cluster
        // body is entirely hidden in Quick mode. Pre-fix the cluster
        // header still rendered → user saw "PRIOR HOME" / "PRIOR AUTO" /
        // etc. with no inputs beneath. Tag the whole cluster `iv2-full-only`
        // so it rides with its content.
        const allFull = items.length > 0 && items.every(f => f.mode === 'full');
        const clusterClass = allFull ? 'iv2-field-cluster iv2-full-only' : 'iv2-field-cluster';
        return `<div class="${clusterClass}">
            <h4 style="margin:8px 0 6px; font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">${esc(c.title)}</h4>
            <div class="iv2-field-grid">${grid}</div>
        </div>`;
    }).join('');
    // Append a Quick-mode hint pointing to the Full toggle. Hidden in
    // Full mode by CSS (`.iv2-full-mode-hint` rule). Without this hint,
    // an agent in Quick mode sees Continuous Coverage + Discounts only,
    // and has no obvious way to discover that Prior Home / Prior Auto /
    // Prior Boat / Prior RV exist behind the topbar Quick/Full pill.
    // Pre-fix the icon was `›` and the copy "More fields in Full mode",
    // which the user read as inline-expand. `⇆` mirrors the topbar's
    // rails-toggle glyph and the explicit "Switch to Full mode" phrasing
    // names the action — the existing title= tooltip still lists the
    // four field groups behind the toggle.
    const _hint = `
        <button type="button" class="iv2-full-mode-hint" data-mode-set="full" title="Switch to Full mode to enter Prior Insurance carriers, mortgage info, endorsements, and notes.">
            <span aria-hidden="true">⇆</span>
            <span>Switch to Full mode for more fields</span>
        </button>`;
    root.innerHTML = html + _hint;

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

    _applyConditionalReveal(root);

    // Defensive: in addition to the delegated input/change handler on the
    // plugin root (intake-v2-core.js), wire a direct handler that updates
    // the conditional-reveal state immediately. Pre-fix, picking Yes left
    // the agent staring at a dropdown with no follow-up field — even
    // though save eventually fired, the lack of visible feedback made
    // them think the dropdown was broken.
    const contEl = document.getElementById('iv2-priorContinuous');
    if (contEl && !contEl._iv2ContinuousWired) {
        contEl._iv2ContinuousWired = true;
        contEl.addEventListener('change', () => {
            try {
                // Mirror into data so the reveal check below sees the fresh
                // value, and schedule a save so the field is persisted even
                // if the delegated handler in intake-v2-core somehow misses
                // it. The delegated handler will also run via event bubbling,
                // so this is idempotent.
                window.IntakeV2._setByPath(
                    window.IntakeV2.data,
                    'priorInsurance.continuous',
                    contEl.value
                );
                if (typeof window.IntakeV2.scheduleSave === 'function') {
                    window.IntakeV2.scheduleSave();
                }
            } catch (_) { /* fallback: rely on the delegated path */ }
            _applyConditionalReveal(root);
        });
    }
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('coverage', renderCoverage);
    renderCoverage();
});

})();
