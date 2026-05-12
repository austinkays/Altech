// intake-v2-review.js — Final section: validation summary + export buttons.
//
// Shows per-carrier readiness with click-to-jump for missing fields, plus
// the deferred-fields appendix. Export buttons trigger PDF (always), CMSMTF
// (home/auto only, disabled if neither present), EZLynx XML (same gating),
// and "Save as quote".

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

function carriersBlock(bind) {
    if (!bind) return '<em style="color:var(--text-secondary)">Carrier readiness will appear once you start filling fields.</em>';
    return `<div class="iv2-bindability" style="display:flex; flex-wrap:wrap; gap:8px;">
        ${Object.entries(bind).map(([k, v]) => `
            <span class="iv2-carrier ${v.ok ? 'is-ok' : 'is-miss'}" data-review-carrier="${escAttr(k)}">
                <span class="iv2-carrier-mark"></span>${esc(v.label)} ${v.ok ? '✓ ready' : `· ${v.missing.length} missing`}
            </span>
        `).join('')}
    </div>`;
}

function missingDetail(bind) {
    if (!bind) return '';
    const rows = [];
    for (const [carrier, v] of Object.entries(bind)) {
        if (v.ok || !v.missing.length) continue;
        rows.push(`<details style="margin:6px 0;"><summary style="cursor:pointer; font-weight:600;">${esc(v.label)} (${v.missing.length} missing)</summary>
            <ul style="margin:6px 0 6px 18px; padding:0;">
                ${v.missing.slice(0, 20).map(m => `<li style="font-size:13px;"><a href="#" data-jump-path="${escAttr(m.path)}" style="color:var(--apple-blue); text-decoration:none;">${esc(m.label)}${m.itemLabel ? ` — ${esc(m.itemLabel)}` : ''}</a></li>`).join('')}
                ${v.missing.length > 20 ? `<li style="font-size:12px; color:var(--text-secondary)">…and ${v.missing.length - 20} more</li>` : ''}
            </ul>
        </details>`);
    }
    return rows.join('');
}

function deferredBlock(data) {
    const list = data.deferred || [];
    if (!list.length) return '';
    return `<details style="margin-top:10px;" open><summary style="cursor:pointer; font-weight:600;">Deferred for follow-up (${list.length})</summary>
        <ul style="margin:6px 0 6px 18px;">
            ${list.map(p => `<li style="font-size:13px;"><a href="#" data-jump-path="${escAttr(p)}" style="color:#C58800; text-decoration:none;">${esc(window.IntakeV2._defer ? window.IntakeV2._defer.labelForPath(p) : p)}</a></li>`).join('')}
        </ul>
        <div style="font-size:11px; color:var(--text-secondary)">These will appear in the PDF appendix so the client gets the same follow-up list.</div>
    </details>`;
}

function exportButtons(data) {
    const hasHomeAuto = (data.homes && data.homes.length) || (data.autos && data.autos.length);
    const dimAttr = hasHomeAuto ? '' : 'disabled title="Add a home or auto to enable HawkSoft / EZLynx exports"';
    return `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:14px;">
        <button type="button" class="iv2-add-btn" data-export="pdf">📄 Export PDF Summary</button>
        <button type="button" class="iv2-add-btn" data-export="cmsmtf" ${dimAttr}>📤 HawkSoft CMSMTF (home/auto)</button>
        <button type="button" class="iv2-add-btn" data-export="ezlynx" ${dimAttr}>⚡ EZLynx XML (home/auto)</button>
        <button type="button" class="iv2-add-btn is-ghost" data-export="save-quote">💾 Save as quote</button>
    </div>
    <div style="font-size:11px; color:var(--text-secondary); margin-top:6px">Boats and RVs export to PDF only — HawkSoft and EZLynx personal lines do not have native boat/RV raters.</div>`;
}

function render() {
    const root = document.querySelector('[data-render="review"]');
    if (!root) return;
    const data = window.IntakeV2.data;
    const bind = window.IntakeV2.bindability || (window.IntakeV2Bindability && window.IntakeV2Bindability.computeBindability({ data }));
    root.innerHTML = `
        <h4 style="margin:4px 0; color:var(--text-secondary); font-size:12px; text-transform:uppercase; letter-spacing:0.05em;">Carrier readiness</h4>
        ${carriersBlock(bind)}
        ${missingDetail(bind)}
        ${deferredBlock(data)}
        ${exportButtons(data)}
        <div class="iv2-status-legend" style="margin-top:14px;">
            <span><span class="iv2-card-status is-ok"></span> ready</span>
            <span><span class="iv2-card-status is-warn"></span> some carriers missing</span>
            <span><span class="iv2-card-status is-block"></span> no carriers can quote yet</span>
        </div>
    `;

    root.querySelectorAll('[data-jump-path]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const path = a.getAttribute('data-jump-path');
            if (window.IntakeV2._defer && typeof window.IntakeV2._defer.jumpToPath === 'function') {
                window.IntakeV2._defer.jumpToPath(path);
            }
        });
    });
    root.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', () => {
            const which = btn.getAttribute('data-export');
            if (which === 'pdf')        window.IntakeV2.exportPDF();
            else if (which === 'cmsmtf')window.IntakeV2.exportCMSMTF();
            else if (which === 'ezlynx')window.IntakeV2.exportEZLynxXML();
            else if (which === 'save-quote') window.IntakeV2.saveAsQuote();
        });
    });
}

window.IntakeV2.onBoot(function () {
    this._review = { render };
    this.registerRenderer('review', render);
    render();
});

})();
