// intake-v2-operators.js — Household operator pool.
//
// Renders the operator list in #iv2-household. Each operator card holds the
// declared collection fields (DL, DOB, relationship, etc.) and a "link
// badges" row showing which autos/boats/RVs the operator is attached to.
//
// Also exports renderOperatorPicker(card, item, collectionKey) so auto/boat/
// RV cards can drop a chip-style multi-select with an inline "+ New" picker.
// Adding a new operator from the picker never leaves the current section —
// the mini-form expands in place and auto-selects on submit.

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

function ageOf(dob) {
    if (!dob) return '';
    // Use the shared timezone-safe helper — `new Date('YYYY-MM-DD')` parses
    // as UTC midnight, which is the wrong day in negative-UTC locales.
    const age = window.IntakeV2._ageFromDob(dob);
    return age > 0 ? age : '';
}

function operatorName(op) {
    return [op.firstName, op.lastName].filter(Boolean).join(' ').trim() || 'Unnamed';
}

function linkedProducts(op) {
    const out = [];
    const d = window.IntakeV2.data;
    ['autos','boats','rvs'].forEach(coll => {
        (d[coll] || []).forEach((item, idx) => {
            if (item.primaryOperatorId === op.id || (Array.isArray(item.additionalOperatorIds) && item.additionalOperatorIds.includes(op.id))) {
                const label = coll === 'autos' ? 'Auto'
                           : coll === 'boats' ? 'Boat'
                           : coll === 'rvs'   ? 'RV'
                           : coll;
                const tag = [item.year, item.make, item.model].filter(Boolean).join(' ') || `#${idx+1}`;
                out.push({ coll, idx, label: `${label}: ${tag}` });
            }
        });
    });
    return out;
}

// Fields on a primary-applicant / co-applicant operator card that are mirrored
// from the Quick Start applicant / co-applicant cluster. Editing them on the
// operator card looks like it works, but the next applicant keystroke would
// silently overwrite the edit — so we lock them with readonly / disabled and
// nudge the agent to the canonical source.
const SYNCED_FIELD_PATHS = new Set([
    'firstName','middleName','lastName','dob','gender','maritalStatus','occupation','industry','education',
    // relationship is synced for co-applicant only — guarded below
]);

function renderField(item, collKey, f) {
    const elId = `iv2-${f.idStem}-${item.id}`;
    const fullClass = f.mode === 'full' ? ' iv2-full-only' : '';
    const v = window.IntakeV2._getByPath(item, f.path);
    const dataAttrs = ` data-collection="${escAttr(collKey)}" data-item-id="${escAttr(item.id)}" data-field-path="${escAttr(f.path)}"`;

    // Lock the synced fields on the primary-applicant / co-applicant card.
    // Edits would be discarded anyway by the next syncApplicantOperators().
    const isSynced = (item.isPrimaryApplicant || item.isCoApplicant)
        && (SYNCED_FIELD_PATHS.has(f.path) || (item.isCoApplicant && f.path === 'relationship'));
    const lockAttr  = isSynced ? ' readonly tabindex="-1" title="Synced with the Quick Start block — edit it there"' : '';
    const lockSelAttr = isSynced ? ' disabled title="Synced with the Quick Start block — edit it there"' : '';
    const lockStyle = isSynced ? ' style="opacity:0.65; cursor:not-allowed;"' : '';

    // data-field-wrap matches the format used elsewhere
    // (`${collKey}#${itemId}.${path}`) so the defer system's primary
    // [data-field-wrap] selector picks up operator fields too — without it,
    // operator-card fields only got deferred styling via a redundant
    // second-pass selector in defer.js.
    const wrapAttr = ` data-field-wrap="operators#${escAttr(item.id)}.${escAttr(f.path)}"`;

    let control;
    if (f.type === 'select') {
        const opts = (f.options || []).map(opt => `<option value="${escAttr(opt)}" ${String(v ?? '') === String(opt) ? 'selected' : ''}>${esc(opt || '—')}</option>`).join('');
        control = `<select id="${escAttr(elId)}"${dataAttrs}${lockSelAttr}${lockStyle}>${opts}</select>`;
    } else if (f.type === 'checkbox') {
        return `<div class="iv2-field${fullClass}"${wrapAttr}><label style="flex-direction:row; align-items:center; gap:6px;"><input type="checkbox" id="${escAttr(elId)}"${dataAttrs}${lockSelAttr}${lockStyle} ${v ? 'checked' : ''}> ${esc(f.label)}</label><span class="iv2-field-defer-badge" style="display:none">deferred</span></div>`;
    } else if (f.type === 'textarea') {
        control = `<textarea id="${escAttr(elId)}"${dataAttrs}${lockAttr}${lockStyle} rows="2">${esc(v ?? '')}</textarea>`;
    } else {
        control = `<input type="${escAttr(f.type)}" id="${escAttr(elId)}"${dataAttrs}${lockAttr}${lockStyle} value="${escAttr(v ?? '')}">`;
    }
    return `<div class="iv2-field${fullClass}"${wrapAttr}>
        <label for="${escAttr(elId)}">${esc(f.label)}${f.bindable ? ' <span style="color:var(--apple-blue)" title="Required to bind a carrier">✦</span>' : ''}${isSynced ? ' <span style="font-size:10px; color:var(--text-secondary)">🔒</span>' : ''}</label>
        ${control}
        <span class="iv2-field-defer-badge" style="display:none">deferred</span>
    </div>`;
}

function renderOperatorCard(op) {
    const fields = window.IntakeV2Fields.collections.operators.fields;
    const fieldsHTML = fields.map(f => renderField(op, 'operators', f)).join('');
    const isLocked = op.isPrimaryApplicant || op.isCoApplicant;
    const lockNote = op.isPrimaryApplicant ? '<span class="iv2-section-count" title="Synced with applicant block above">Primary Applicant — synced</span>'
                  : op.isCoApplicant ? '<span class="iv2-section-count" title="Synced with co-applicant block above">Co-Applicant — synced</span>'
                  : '';
    const links = linkedProducts(op);
    const linksHTML = links.length
        ? links.map(l => `<span class="iv2-section-count">${esc(l.label)}</span>`).join(' ')
        : '<span style="color:var(--text-secondary); font-size:11px">Not linked to any product yet</span>';

    const status = window.IntakeV2Bindability ? window.IntakeV2Bindability.statusForItem('operators', op) : { level: 'ok' };
    const removeBtn = isLocked
        ? `<button type="button" class="iv2-icon-btn" disabled title="Synced — remove the applicant or co-applicant block instead">Remove</button>`
        : `<button type="button" class="iv2-icon-btn is-danger" data-remove-op="${escAttr(op.id)}">Remove</button>`;

    return `
        <div class="iv2-card" data-card-of="operators" data-item-id="${escAttr(op.id)}">
            <div class="iv2-card-header">
                <span class="iv2-card-status is-${status.level}" title="${status.level === 'ok' ? 'Ready for all carriers' : status.level === 'warn' ? 'Quotable but missing some carrier requirements' : 'Blocking info missing'}"></span>
                <span class="iv2-card-title">${esc(operatorName(op))} ${op.dob ? `<span style="font-size:11px; color:var(--text-secondary)">· age ${ageOf(op.dob)}</span>` : ''}</span>
                ${lockNote}
                <span class="iv2-card-actions">
                    <button type="button" class="iv2-icon-btn" data-phonetic-op="${escAttr(op.id)}" title="Spell name on a call">🔤</button>
                    ${removeBtn}
                </span>
            </div>
            <div class="iv2-field-grid">${fieldsHTML}</div>
            <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:4px;">${linksHTML}</div>
        </div>`;
}

function render() {
    const root = document.querySelector('[data-render="operators"]');
    if (!root) return;
    const ops = window.IntakeV2.data.operators || [];
    const cards = ops.map(renderOperatorCard).join('');
    root.innerHTML = `
        ${cards}
        <button type="button" class="iv2-add-btn is-ghost" data-add-op>+ Add operator (N)</button>
        <span style="font-size:11px; color:var(--text-secondary); margin-left:8px">All household drivers, boat operators, and RV operators. Applicant + co-applicant auto-sync from above.</span>
    `;

    // Wire actions
    root.querySelectorAll('[data-add-op]').forEach(btn => btn.addEventListener('click', () => {
        const item = window.IntakeV2.addItem('operators', {});
        setTimeout(() => {
            const first = document.querySelector(`[data-card-of="operators"][data-item-id="${item.id}"] input`);
            if (first) first.focus();
        }, 50);
    }));
    root.querySelectorAll('[data-remove-op]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-op');
        const op = window.IntakeV2.getItem('operators', id);
        if (!op) return;
        const links = linkedProducts(op);
        if (links.length) {
            if (!confirm(`${operatorName(op)} is linked to:\n${links.map(l => '• ' + l.label).join('\n')}\n\nRemove the operator AND unlink from all of those?`)) return;
            ['autos','boats','rvs'].forEach(coll => {
                (window.IntakeV2.data[coll] || []).forEach(item => {
                    if (item.primaryOperatorId === id) item.primaryOperatorId = '';
                    if (Array.isArray(item.additionalOperatorIds)) {
                        item.additionalOperatorIds = item.additionalOperatorIds.filter(x => x !== id);
                    }
                });
            });
        }
        window.IntakeV2.removeItem('operators', id);
    }));
    root.querySelectorAll('[data-phonetic-op]').forEach(btn => btn.addEventListener('click', () => {
        if (!window.PhoneticSpeller || typeof window.PhoneticSpeller.open !== 'function') return;
        const id = btn.getAttribute('data-phonetic-op');
        const op = window.IntakeV2.getItem('operators', id);
        if (!op) return;
        window.PhoneticSpeller.open(operatorName(op));
    }));

    // Re-render defer badges after replacing innerHTML
    if (window.IntakeV2._defer) window.IntakeV2._defer.render();
}

// ─── Operator picker — used by auto/boat/RV cards to link operators ────────
//
// Renders a chip row with all operators, marks the primary, lets the agent
// toggle additionals, and supports an inline "+ Add operator" mini-form.
function renderOperatorPicker(container, item, collKey) {
    if (!container) return;
    const ops = window.IntakeV2.data.operators || [];
    const primary = item.primaryOperatorId;
    const additionals = new Set(Array.isArray(item.additionalOperatorIds) ? item.additionalOperatorIds : []);

    const chips = ops.map(op => {
        const isPrimary = op.id === primary;
        const isSel = isPrimary || additionals.has(op.id);
        return `<button type="button" class="iv2-chip ${isSel ? 'is-selected' : ''} ${isPrimary ? 'is-primary' : ''}" data-op-id="${escAttr(op.id)}" data-card-coll="${escAttr(collKey)}" data-card-id="${escAttr(item.id)}" title="${isPrimary ? 'Primary operator — click to make additional' : isSel ? 'Linked as additional — click to remove' : 'Click to link as additional · Shift+click to set primary'}">${esc(operatorName(op))}</button>`;
    }).join('');

    container.innerHTML = `
        <div class="iv2-chip-row">
            ${chips}
            <button type="button" class="iv2-chip iv2-chip-add" data-inline-add-op="${escAttr(item.id)}" data-card-coll="${escAttr(collKey)}">+ Add operator</button>
        </div>
        <div data-inline-add-form-for="${escAttr(item.id)}"></div>
    `;

    container.querySelectorAll('[data-op-id]').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const opId = chip.getAttribute('data-op-id');
            item.additionalOperatorIds = Array.isArray(item.additionalOperatorIds) ? item.additionalOperatorIds : [];
            if (e.shiftKey) {
                // Shift+click: set as primary. The previous primary (if any
                // and different) becomes an additional operator so they
                // stay linked.
                const prevPrimary = item.primaryOperatorId;
                if (prevPrimary && prevPrimary !== opId && !item.additionalOperatorIds.includes(prevPrimary)) {
                    item.additionalOperatorIds.push(prevPrimary);
                }
                item.primaryOperatorId = opId;
                item.additionalOperatorIds = item.additionalOperatorIds.filter(x => x !== opId);
            } else if (item.primaryOperatorId === opId) {
                // Click the existing primary: demote to additional (still linked).
                // Matches the chip tooltip "Primary operator — click to make additional".
                item.primaryOperatorId = '';
                if (!item.additionalOperatorIds.includes(opId)) item.additionalOperatorIds.push(opId);
            } else {
                // Click another chip: toggle as additional.
                const i = item.additionalOperatorIds.indexOf(opId);
                if (i === -1) item.additionalOperatorIds.push(opId);
                else item.additionalOperatorIds.splice(i, 1);
            }
            window.IntakeV2.save();
            // Re-render only the operator pool (link-badge counts changed)
            // and the affected product collection (chip-row primary star
            // moved). Skipping layout/coverage/history/review here is a
            // measurable perf win on quotes with many entities.
            window.IntakeV2.requestRerender('operators');
            window.IntakeV2.requestRerender(collKey);
        });
    });

    container.querySelectorAll('[data-inline-add-op]').forEach(btn => {
        btn.addEventListener('click', () => openInlineAddForm(container, item, collKey));
    });
}

function openInlineAddForm(container, item, collKey) {
    const target = container.querySelector(`[data-inline-add-form-for="${item.id}"]`);
    if (!target) return;
    if (target.querySelector('.iv2-mini-form')) { target.innerHTML = ''; return; }
    target.innerHTML = `
        <div class="iv2-mini-form is-open">
            <div class="iv2-field"><label>First Name</label><input type="text" data-mini="firstName"></div>
            <div class="iv2-field"><label>Last Name</label><input type="text" data-mini="lastName"></div>
            <div class="iv2-field"><label>DOB</label><input type="date" data-mini="dob"></div>
            <div class="iv2-field"><label>DL State</label><input type="text" data-mini="dl.state" maxlength="2" placeholder="WA"></div>
            <div class="iv2-field"><label>Relationship</label><select data-mini="relationship"><option value="">—</option><option>Spouse</option><option>Child</option><option>Parent</option><option>Sibling</option><option>Other</option></select></div>
            <div class="iv2-mini-actions">
                <button type="button" class="iv2-icon-btn" data-mini-cancel>Cancel</button>
                <button type="button" class="iv2-add-btn" data-mini-submit>Add & link</button>
            </div>
        </div>`;
    const form = target.querySelector('.iv2-mini-form');
    form.querySelector('[data-mini-cancel]').addEventListener('click', () => { target.innerHTML = ''; });
    form.querySelector('[data-mini-submit]').addEventListener('click', () => {
        const partial = {};
        form.querySelectorAll('[data-mini]').forEach(el => {
            const k = el.getAttribute('data-mini');
            const v = el.type === 'checkbox' ? el.checked : el.value;
            window.IntakeV2._setByPath(partial, k, v);
        });
        // Add the operator without firing a save yet, link it to the parent
        // product, then save once. Two concurrent saves were racing —
        // whichever encryption finished last won, sometimes persisting the
        // pre-link state to disk.
        const newOp = window.IntakeV2.addItem('operators', partial, { quiet: true });
        if (!item.primaryOperatorId) item.primaryOperatorId = newOp.id;
        else {
            item.additionalOperatorIds = Array.isArray(item.additionalOperatorIds) ? item.additionalOperatorIds : [];
            item.additionalOperatorIds.push(newOp.id);
        }
        window.IntakeV2.save();
        // Narrow the re-render to the affected sections — operator panel
        // (for the new link badge) and the parent product (for the chip
        // row's updated primary star). Avoids re-rendering layout / coverage
        // / history / review for an op-link change.
        window.IntakeV2.requestRerender('operators');
        window.IntakeV2.requestRerender(collKey);
    });
    form.querySelector('input').focus();
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('operators', render);
    render();
});

// Expose so product entity modules can drop in the picker
window.IntakeV2OperatorPicker = { render: renderOperatorPicker };

})();
