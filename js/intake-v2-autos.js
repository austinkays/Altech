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
    // Subsection heading: spans the full grid, gives the agent a visual
    // anchor between groups of fields (e.g. "Coverage Selections" /
    // "Lien Holder" inside an auto card). Pre-fix the header was rendered
    // without the `iv2-full-only` class even when its `mode === 'full'`,
    // so in Quick mode users saw orphan headings (ENDORSEMENTS, MORTGAGE /
    // LIEN HOLDER, NOTES) with nothing underneath — the actual checkboxes
    // + text inputs were hidden by the full-only mode toggle. Respect the
    // declared mode so the header rides along with its content.
    if (f.type === 'header') {
        const fullClass = f.mode === 'full' ? ' iv2-full-only' : '';
        return `<div class="iv2-field${fullClass}" style="grid-column: 1 / -1; margin-top:6px; margin-bottom:-2px;">
            <h5 style="margin:0; font-size:11px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.06em; font-weight:600; border-top:1px solid var(--border); padding-top:8px;">${esc(f.label)}</h5>
        </div>`;
    }
    const elId = `iv2-${f.idStem}-${item.id}`;
    const fullClass = f.mode === 'full' ? ' iv2-full-only' : '';
    const v = window.IntakeV2._getByPath(item, f.path);
    const dataAttrs = ` data-collection="${escAttr(collKey)}" data-item-id="${escAttr(item.id)}" data-field-path="${escAttr(f.path)}"`;
    let control;
    if (f.type === 'select') {
        // Plain strings → value === label; [value, label] tuples (used by
        // the state list) preserve a distinct USPS value while showing the
        // full state name. See US_STATES in intake-v2-fields.js.
        const opts = (f.options || []).map(opt => {
            const [value, label] = Array.isArray(opt) ? opt : [opt, opt];
            return `<option value="${escAttr(value)}" ${String(v ?? '') === String(value) ? 'selected' : ''}>${esc(label || '—')}</option>`;
        }).join('');
        control = `<select id="${escAttr(elId)}"${dataAttrs}>${opts}</select>`;
    } else if (f.type === 'checkbox') {
        // Switch variant via kind:'switch'; default is the standard
        // square checkbox row. Wraps a real <input type="checkbox"> so
        // core's save/load handlers continue to match. The bindable
        // mark (`*`, red) is appended inside the label span so it
        // inherits the row's vertical centering instead of floating above.
        const rowClass = f.kind === 'switch' ? 'iv2-switch-row' : 'iv2-checkbox-row';
        const labelHTML = `${esc(f.label)}${f.bindable ? ' <span class="iv2-bindable-mark" role="img" aria-label="Required to bind — at least one carrier needs this field" title="Required to bind — at least one carrier needs this field">*</span>' : ''}`;
        return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(collKey)}#${escAttr(item.id)}.${escAttr(f.path)}">
            <label class="${rowClass}" for="${escAttr(elId)}"><input type="checkbox" id="${escAttr(elId)}"${dataAttrs} ${v ? 'checked' : ''}> <span>${labelHTML}</span></label>
            <span class="iv2-field-defer-badge" style="display:none">deferred</span>
        </div>`;
    } else if (f.type === 'textarea') {
        control = `<textarea id="${escAttr(elId)}"${dataAttrs} rows="2">${esc(v ?? '')}</textarea>`;
    } else {
        // `f.placeholder` is optional — set on the schema entry for
        // fields where a real example (e.g. a VIN) reads better than
        // an empty input. The renderer omits the attribute entirely
        // when it's not set so undefined values don't end up as the
        // literal string "undefined".
        const phAttr = f.placeholder ? ` placeholder="${escAttr(f.placeholder)}"` : '';
        const input = `<input type="${escAttr(f.type)}" id="${escAttr(elId)}"${dataAttrs}${phAttr} value="${escAttr(v ?? '')}">`;
        // Inset phonetic-speller button — VIN gets mode='vin' (warns on
        // I/O/Q), license plate gets mode='plate' (uppercase + strip
        // whitespace). Click delegation + Alt+P shortcut live in
        // intake-v2-layout.js so this stays a pure renderer.
        //
        // VIN fields additionally render a "Decode VIN" pill that calls
        // VinDecoder.decodeForIntake and writes year/make/model back
        // onto this same item via the auto-decode click handler in
        // wireAutoVinDecode (intake-v2-autos.js, below).
        const decodeBtn = f.decode === 'vin'
            ? `<button type="button" class="iv2-decode-btn" data-iv2-decode-vin data-collection="${escAttr(collKey)}" data-item-id="${escAttr(item.id)}" title="Look up year/make/model from this VIN">Decode VIN</button>`
            : '';
        if (f.speller || f.decode) {
            control = `<div class="iv2-input-wrap">${input}${f.speller ? `<button type="button" class="iv2-speller-btn" data-speller-mode="${escAttr(f.speller)}" tabindex="-1" aria-label="Phonetic speller (Alt+P)" title="Phonetic speller (Alt+P)">🔤</button>` : ''}</div>${decodeBtn}`;
        } else {
            control = input;
        }
    }
    return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(collKey)}#${escAttr(item.id)}.${escAttr(f.path)}">
        <label for="${escAttr(elId)}">${esc(f.label)}${f.bindable ? ' <span class="iv2-bindable-mark" role="img" aria-label="Required to bind — at least one carrier needs this field" title="Required to bind — at least one carrier needs this field">*</span>' : ''}</label>
        ${control}
        <span class="iv2-field-defer-badge" style="display:none">deferred</span>
    </div>`;
}

function defaultTitle(collKey, item) {
    if (collKey === 'autos') return `${item.year || ''} ${item.make || ''} ${item.model || ''}`.trim() || 'New Auto';
    if (collKey === 'boats') return `${item.year || ''} ${item.make || ''} ${item.model || ''} ${item.length ? '(' + item.length + ' ft)' : ''}`.trim() || 'New Boat';
    if (collKey === 'rvs') {
        // Translate the camelCase `class` field to a display label so the
        // card title says "Bus Conversion" instead of "busConversion".
        // Stored value stays unchanged; same map as the chip row in
        // intake-v2-rvs.js (kept here to avoid a cross-module require).
        const RV_CLASS_LABELS = {
            A: 'Class A', B: 'Class B', C: 'Class C',
            travelTrailer: 'Travel Trailer', fifthWheel: '5th Wheel',
            toyHauler: 'Toy Hauler', popUp: 'Pop-Up', busConversion: 'Bus Conversion',
        };
        const classLabel = item.class ? (RV_CLASS_LABELS[item.class] || item.class) : '';
        return `${item.year || ''} ${item.make || ''} ${item.model || ''} ${classLabel ? '· ' + classLabel : ''}`.trim() || 'New RV';
    }
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
        // 8s timeout matches the legacy VinDecoder's NHTSA fetch budget.
        // Without it the request can hang indefinitely on a flaky network
        // and the auto-fill never resolves.
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 8000);
        try {
            const resp = await fetch(
                `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`,
                { signal: ctrl.signal }
            );
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
        finally { clearTimeout(tid); }
    }
    let changed = false;
    if (parsed.year  && !item.year)  { item.year  = parsed.year;  changed = true; }
    if (parsed.make  && !item.make)  { item.make  = parsed.make;  changed = true; }
    if (parsed.model && !item.model) { item.model = parsed.model; changed = true; }
    if (!changed) return;
    window.IntakeV2.save();
    window.IntakeV2.requestRerender('autos');
}

// Delegated click handler for every "Decode VIN" pill stamped by
// renderField when `f.decode === 'vin'`. Reads the sibling VIN input,
// calls VinDecoder.decodeForIntake (NHTSA + local), and writes the
// resolved year/make/model back into the owning auto item via the
// existing mutateItem flow — that fires the same save/rerender chain a
// manual keystroke would.
async function _wireVinDecode(btn) {
    if (btn.dataset.busy === '1') return;
    const collKey = btn.getAttribute('data-collection');
    const itemId  = btn.getAttribute('data-item-id');
    if (!collKey || !itemId) return;
    const wrap = btn.parentElement && btn.parentElement.querySelector('.iv2-input-wrap input');
    if (!wrap) return;
    const vin = wrap.value;
    if (!vin || vin.length < 17) {
        if (typeof App !== 'undefined' && App.toast) {
            App.toast('Need a 17-character VIN to decode.', { type: 'info', duration: 2500 });
        }
        return;
    }
    if (!window.VinDecoder || typeof window.VinDecoder.decodeForIntake !== 'function') return;

    btn.dataset.busy = '1';
    const original = btn.textContent;
    btn.textContent = 'Decoding…';
    btn.disabled = true;
    try {
        const result = await window.VinDecoder.decodeForIntake(vin);
        if (!result) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast(`Could not decode VIN ${vin}`, { type: 'error', duration: 3000 });
            }
            return;
        }
        // Only overwrite blank fields — never clobber an agent's manual
        // typo correction with the NHTSA value if they've already
        // entered something.
        const item = window.IntakeV2.getItem(collKey, itemId);
        if (!item) return;
        // Only overwrite blank fields — never clobber a manual typo
        // correction with the NHTSA value the agent just rejected.
        const candidates = { year: result.year, make: result.make, model: result.model, trim: result.trim };
        const writes = [];
        for (const [path, value] of Object.entries(candidates)) {
            if (!value) continue;
            const current = item[path];
            if (current && String(current).trim() !== '') continue;
            writes.push([path, value]);
        }
        if (writes.length === 0) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('VIN decoded — no blank fields to fill.', { type: 'info', duration: 2500 });
            }
            return;
        }
        for (const [path, value] of writes) {
            window.IntakeV2.setItemField(collKey, itemId, path, value);
        }
        // setItemField schedules a debounced save; force the renderer
        // to repaint the card immediately so the agent sees the
        // year/make/model populated without waiting for the next save.
        window.IntakeV2.requestRerender('autos');
        if (typeof App !== 'undefined' && App.toast) {
            App.toast(`✓ Decoded: ${[result.year, result.make, result.model].filter(Boolean).join(' ')}`, { type: 'success', duration: 2500 });
        }
    } finally {
        btn.dataset.busy = '0';
        btn.textContent = original;
        btn.disabled = false;
    }
}

// Auto-decode the VIN as soon as the input reaches 17 valid characters.
// Debounced ~500ms so an agent typing through the field doesn't fire 17
// NHTSA round-trips. `_autoDecodedVins` remembers VINs we've already
// auto-fired against — if the agent edits the value back to one we
// already decoded, we don't re-fire (the click handler still works for
// explicit retries).
const _autoDecodedVins = new Set();
let _autoDecodeTimer = null;
function _scheduleAutoDecode(input, btn) {
    clearTimeout(_autoDecodeTimer);
    _autoDecodeTimer = setTimeout(() => {
        const vin = (input.value || '').toUpperCase().trim();
        if (vin.length !== 17) return;
        // Same alphabet rule the local _isValidVin uses — keeps us from
        // hitting NHTSA on obviously-bogus 17-char strings (e.g. an
        // agent pasting a HIN or a phone number).
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return;
        if (_autoDecodedVins.has(vin)) return;
        _autoDecodedVins.add(vin);
        // Reuse the click-handler path so success/failure toasts +
        // the "Decoding…" button label work identically to the
        // manual click case.
        _wireVinDecode(btn);
    }, 500);
}

// onBoot fires every time IntakeV2.init() runs (on each navigation to
// the v2 tool, not just once per page-load). Without this guard the
// delegated document listeners below would accumulate — re-navigating
// to v2 five times means five duplicate click handlers, each running
// the decode logic on every click. Module-scope boolean stops that.
let _autosDelegatesWired = false;

window.IntakeV2.onBoot(function () {
    this.registerRenderer('autos', renderAutos);
    renderAutos();
    if (_autosDelegatesWired) return;
    _autosDelegatesWired = true;

    // Delegated decode-button handler — wired once at boot. Uses
    // event delegation because the auto cards re-render on every
    // mutation; binding per-button would leak listeners.
    document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('[data-iv2-decode-vin]');
        if (!btn) return;
        if (!btn.closest('#intakeV2Tool')) return;
        _wireVinDecode(btn);
    });

    // Delegated input handler — fires the debounced auto-decode when
    // an agent finishes typing/pasting a 17-character VIN. Limited to
    // inputs whose sibling wrap carries a [data-iv2-decode-vin] button,
    // so we don't run the regex on every keystroke across the form.
    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el || el.tagName !== 'INPUT') return;
        if (!el.closest('#intakeV2Tool')) return;
        const fieldWrap = el.closest('.iv2-field');
        if (!fieldWrap) return;
        const btn = fieldWrap.querySelector('[data-iv2-decode-vin]');
        if (!btn) return;
        _scheduleAutoDecode(el, btn);
    });
});

// Expose helpers for boats / rvs / homes
window.IntakeV2EntityCard = { renderEntityCard, wireCardActions, renderField, defaultTitle };

})();
