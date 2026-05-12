// intake-v2-autos.js — Auto card renderer, plus the shared entity-card helper
// that boats / RVs / homes reuse (window.IntakeV2EntityCard).
//
// An entity card shows:
//   - Title (year / make / model or address)
//   - Status dot (computed by IntakeV2Bindability.statusForItem)
//   - Field grid (driven by IntakeV2Fields.collections[collKey].fields)
//   - Operator picker (for autos / boats / RVs — not homes)
//   - Remove button
//
// Saving happens via the global delegated input listener in intake-v2-core.js
// — every input/select/textarea inside the card carries data-collection /
// data-item-id / data-field-path attributes so the path resolver in
// FieldMapV2 finds the right nested write target.

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

function renderField(item, collKey, f) {
    const elId = `iv2-${f.idStem}-${item.id}`;
    const fullClass = f.mode === 'full' ? ' iv2-full-only' : '';
    const v = window.IntakeV2._getByPath(item, f.path);
    const dataAttrs = ` data-collection="${escAttr(collKey)}" data-item-id="${escAttr(item.id)}" data-field-path="${escAttr(f.path)}"`;
    let control;
    if (f.type === 'select') {
        const opts = (f.options || []).map(opt => `<option value="${escAttr(opt)}" ${String(v ?? '') === String(opt) ? 'selected' : ''}>${esc(opt || '—')}</option>`).join('');
        control = `<select id="${escAttr(elId)}"${dataAttrs}>${opts}</select>`;
    } else if (f.type === 'checkbox') {
        return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(collKey)}#${escAttr(item.id)}.${escAttr(f.path)}">
            <label style="flex-direction:row; align-items:center; gap:6px;"><input type="checkbox" id="${escAttr(elId)}"${dataAttrs} ${v ? 'checked' : ''}> ${esc(f.label)}${f.bindable ? ' <span style="color:var(--apple-blue)" title="Required to bind">✦</span>' : ''}</label>
            <span class="iv2-field-defer-badge" style="display:none">deferred</span>
        </div>`;
    } else if (f.type === 'textarea') {
        control = `<textarea id="${escAttr(elId)}"${dataAttrs} rows="2">${esc(v ?? '')}</textarea>`;
    } else {
        control = `<input type="${escAttr(f.type)}" id="${escAttr(elId)}"${dataAttrs} value="${escAttr(v ?? '')}">`;
    }
    return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(collKey)}#${escAttr(item.id)}.${escAttr(f.path)}">
        <label for="${escAttr(elId)}">${esc(f.label)}${f.bindable ? ' <span style="color:var(--apple-blue)" title="Required to bind">✦</span>' : ''}</label>
        ${control}
        <span class="iv2-field-defer-badge" style="display:none">deferred</span>
    </div>`;
}

function defaultTitle(collKey, item) {
    if (collKey === 'autos') return `${item.year || ''} ${item.make || ''} ${item.model || ''}`.trim() || 'New Auto';
    if (collKey === 'boats') return `${item.year || ''} ${item.make || ''} ${item.model || ''} ${item.length ? '(' + item.length + ' ft)' : ''}`.trim() || 'New Boat';
    if (collKey === 'rvs')   return `${item.year || ''} ${item.make || ''} ${item.model || ''} ${item.class ? '· ' + item.class : ''}`.trim() || 'New RV';
    if (collKey === 'homes') return item.address || 'New Home';
    return 'New';
}

function renderEntityCard(collKey, item, opts) {
    opts = opts || {};
    const fields = window.IntakeV2Fields.collections[collKey].fields;
    const fieldsHTML = fields.map(f => renderField(item, collKey, f)).join('');
    const status = window.IntakeV2Bindability
        ? window.IntakeV2Bindability.statusForItem(collKey, item)
        : { level: 'ok', missing: [] };
    const title = opts.title || defaultTitle(collKey, item);

    const operatorPickerSlot = opts.hideOperatorPicker
        ? ''
        : `<div style="margin-top:8px"><label style="font-size:11px; color:var(--text-secondary)">Operators (click to link as additional · Shift+click to set primary)</label><div data-operator-picker-for="${escAttr(item.id)}"></div></div>`;

    const extra = opts.extraBodyHTML || '';

    return `
        <div class="iv2-card" data-card-of="${escAttr(collKey)}" data-item-id="${escAttr(item.id)}">
            <div class="iv2-card-header">
                <span class="iv2-card-status is-${status.level}" data-card-status-for="${escAttr(item.id)}" title="${status.level === 'ok' ? 'Ready to bind' : status.level === 'warn' ? 'Quotable but missing some carrier requirements' : 'Blocking info missing'}"></span>
                <span class="iv2-card-title">${esc(title)}</span>
                <span class="iv2-card-actions">
                    <button type="button" class="iv2-icon-btn is-danger" data-remove-card="${escAttr(item.id)}" data-coll="${escAttr(collKey)}" title="Remove">×</button>
                </span>
            </div>
            <div class="iv2-field-grid">${fieldsHTML}</div>
            ${operatorPickerSlot}
            ${extra}
        </div>`;
}

function wireCardActions(root, collKey) {
    root.querySelectorAll(`[data-remove-card][data-coll="${collKey}"]`).forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-remove-card');
            const item = window.IntakeV2.getItem(collKey, id);
            const title = item ? defaultTitle(collKey, item) : 'this item';
            if (!confirm(`Remove ${title}?`)) return;
            window.IntakeV2.removeItem(collKey, id);
        });
    });
    // Operator picker mount points
    root.querySelectorAll('[data-operator-picker-for]').forEach(slot => {
        const itemId = slot.getAttribute('data-operator-picker-for');
        const item = window.IntakeV2.getItem(collKey, itemId);
        if (item && window.IntakeV2OperatorPicker) {
            window.IntakeV2OperatorPicker.render(slot, item, collKey);
        }
    });
    if (window.IntakeV2._defer) window.IntakeV2._defer.render();
}

function renderAutos() {
    const root = document.querySelector('[data-render="autos"]');
    if (!root) return;
    const autos = window.IntakeV2.data.autos || [];
    if (!autos.length) {
        root.innerHTML = '';
        return;
    }
    const cards = autos.map(a => renderEntityCard('autos', a)).join('');
    root.innerHTML = `<h4 style="margin:6px 0; color:var(--text-secondary); font-size:12px; text-transform:uppercase; letter-spacing:0.05em;">Autos (${autos.length})</h4>${cards}`;
    wireCardActions(root, 'autos');

    // VIN decode on paste/blur via the free NHTSA vPIC API.
    // (window.VinDecoder.decode is DOM-bound to the VIN Decoder plugin's
    // own inputs — not usable from here. We fetch the same endpoint directly.)
    root.querySelectorAll('input[data-field-path="vin"]').forEach(inp => {
        inp.addEventListener('blur',  () => decodeVinIntoCard(inp));
        inp.addEventListener('paste', () => setTimeout(() => decodeVinIntoCard(inp), 50));
    });
}

const _vinCache = new Map();
async function decodeVinIntoCard(input) {
    const vin = (input.value || '').trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (vin.length !== 17) return;
    const itemId = input.getAttribute('data-item-id');
    const item = window.IntakeV2.getItem('autos', itemId);
    if (!item) return;
    // Only auto-fill empty fields so we don't overwrite agent edits.
    if (item.year && item.make && item.model) return;

    let parsed = _vinCache.get(vin);
    if (!parsed) {
        try {
            const resp = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`);
            if (!resp.ok) return;
            const json = await resp.json();
            const map = {};
            (json.Results || []).forEach(r => { if (r.Variable && r.Value && r.Value !== 'Not Applicable') map[r.Variable] = r.Value; });
            parsed = {
                year:  map['Model Year']      || '',
                make:  map['Make']            || '',
                model: map['Model']           || '',
                body:  map['Body Class']      || '',
            };
            _vinCache.set(vin, parsed);
        } catch (_) { return; }
    }
    let changed = false;
    if (parsed.year  && !item.year)  { item.year  = parsed.year;  changed = true; }
    if (parsed.make  && !item.make)  { item.make  = parsed.make;  changed = true; }
    if (parsed.model && !item.model) { item.model = parsed.model; changed = true; }
    if (!changed) return;
    window.IntakeV2.save();
    window.IntakeV2.requestRerender('autos');
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('autos', renderAutos);
    renderAutos();
});

// Expose helpers for boats / rvs / homes
window.IntakeV2EntityCard = { renderEntityCard, wireCardActions, renderField, defaultTitle };

})();
