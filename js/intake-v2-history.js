// intake-v2-history.js — 35-month loss / violation history.
//
// "Clean record" toggle: one tap on `history.hasCleanHistory` collapses every
// incident input and writes the standard "no incidents" answer for every
// operator (PDF and exporters honor the flag).
//
// When toggled off, the agent fills two parallel tables:
//   - Losses     [{ date, type, amount, operatorId, asset }]
//   - Violations [{ date, type, operatorId }]
// Both are keyed by operator id so the PDF can group "by operator".

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

const LOSS_TYPES = ['', 'At-fault Accident', 'Not-at-fault Accident', 'Comprehensive', 'Towing', 'Other'];
const VIOL_TYPES = ['', 'Speeding', 'Reckless', 'DUI', 'At-fault Accident', 'Other'];

function operatorOptions() {
    const ops = window.IntakeV2.data.operators || [];
    return ['<option value="">— select operator —</option>'].concat(
        ops.map(o => `<option value="${escAttr(o.id)}">${esc((o.firstName || '') + ' ' + (o.lastName || '') || 'Operator')}</option>`)
    ).join('');
}

function renderLossRow(loss, idx) {
    return `<tr data-history-row="loss" data-history-idx="${idx}">
        <td><input type="date" data-history-field="date" value="${escAttr(loss.date || '')}"></td>
        <td><select data-history-field="type">${LOSS_TYPES.map(t => `<option value="${escAttr(t)}" ${loss.type === t ? 'selected' : ''}>${esc(t || '—')}</option>`).join('')}</select></td>
        <td><input type="number" data-history-field="amount" placeholder="$" value="${escAttr(loss.amount || '')}"></td>
        <td><select data-history-field="operatorId">${operatorOptions().replace(`value="${loss.operatorId || ''}"`, `value="${loss.operatorId || ''}" selected`)}</select></td>
        <td><input type="text" data-history-field="asset" placeholder="vehicle/boat/RV" value="${escAttr(loss.asset || '')}"></td>
        <td><button type="button" class="iv2-icon-btn is-danger" data-history-remove="loss" data-history-idx="${idx}">×</button></td>
    </tr>`;
}

function renderViolRow(v, idx) {
    return `<tr data-history-row="violation" data-history-idx="${idx}">
        <td><input type="date" data-history-field="date" value="${escAttr(v.date || '')}"></td>
        <td><select data-history-field="type">${VIOL_TYPES.map(t => `<option value="${escAttr(t)}" ${v.type === t ? 'selected' : ''}>${esc(t || '—')}</option>`).join('')}</select></td>
        <td><select data-history-field="operatorId">${operatorOptions().replace(`value="${v.operatorId || ''}"`, `value="${v.operatorId || ''}" selected`)}</select></td>
        <td><button type="button" class="iv2-icon-btn is-danger" data-history-remove="violation" data-history-idx="${idx}">×</button></td>
    </tr>`;
}

function _wireCleanToggle(root, h) {
    // Wire BOTH render paths (clean-collapsed AND incident-list) so that
    // untoggling the checkbox actually re-renders the section. Pre-fix the
    // listener attachment lived after the clean-state early-return, so once
    // the user toggled ON, the checkbox in the rendered "clean" state had
    // no handler — untoggling did nothing.
    const cleanCb = root.querySelector('#iv2-hasCleanHistory');
    if (!cleanCb) return;
    cleanCb.addEventListener('change', () => {
        h.hasCleanHistory = cleanCb.checked;
        if (cleanCb.checked) {
            // Clear lists when toggling on so PDF doesn't carry stale rows
            h.losses = [];
            h.violations = [];
        }
        window.IntakeV2.save();
        window.IntakeV2.requestRerender('history');
    });
}

function render() {
    const root = document.querySelector('[data-render="history"]');
    if (!root) return;
    const h = window.IntakeV2.data.history;

    // Use the unified .iv2-checkbox-row markup so the box sits
    // immediately next to its label. The legacy inline-style version
    // also abused `transform: scale(1.4)` which knocked the checkbox
    // out of its normal flow and pushed it far from the label text.
    const cleanToggle = `
        <div class="iv2-field" data-field-wrap="history.hasCleanHistory">
            <label class="iv2-checkbox-row" for="iv2-hasCleanHistory" style="font-size:14px;">
                <input type="checkbox" id="iv2-hasCleanHistory" data-iv2-path="history.hasCleanHistory" ${h.hasCleanHistory ? 'checked' : ''}>
                <span><strong>No incidents in the last 35 months</strong> — applies to every operator above</span>
            </label>
        </div>`;

    if (h.hasCleanHistory) {
        root.innerHTML = `${cleanToggle}
            <div style="margin-top:8px; padding:10px 12px; border-radius:8px; background:rgba(27,135,63,0.06); border-left:3px solid #1B873F; font-size:13px;">
                Clean record recorded for all operators. Untoggle above to enter specific incidents.
            </div>`;
        _wireCleanToggle(root, h);
        // Re-apply deferred-field styling after innerHTML replacement
        if (window.IntakeV2._defer) window.IntakeV2._defer.render();
        return;
    }

    const losses = h.losses || [];
    const viols  = h.violations || [];

    root.innerHTML = `${cleanToggle}
        <div style="margin-top:12px">
            <h4 style="margin:8px 0; font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Losses / Claims (last 35 months)</h4>
            <table style="width:100%; font-size:13px; border-collapse:collapse;" id="iv2-loss-table">
                <thead><tr style="text-align:left; color:var(--text-secondary)"><th>Date</th><th>Type</th><th>Amount</th><th>Operator</th><th>Asset</th><th></th></tr></thead>
                <tbody>${losses.map(renderLossRow).join('') || `<tr><td colspan="6" style="color:var(--text-secondary); padding:8px; font-style:italic;">Nothing here yet. Check the box above if the client truly has a clean record, or use <strong>+ Add loss</strong> to log specific incidents.</td></tr>`}</tbody>
            </table>
            <button type="button" class="iv2-add-btn is-ghost" data-history-add="loss" style="margin-top:6px">+ Add loss</button>
        </div>
        <div style="margin-top:12px">
            <h4 style="margin:8px 0; font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Violations (last 35 months)</h4>
            <table style="width:100%; font-size:13px; border-collapse:collapse;" id="iv2-viol-table">
                <thead><tr style="text-align:left; color:var(--text-secondary)"><th>Date</th><th>Type</th><th>Operator</th><th></th></tr></thead>
                <tbody>${viols.map(renderViolRow).join('') || `<tr><td colspan="4" style="color:var(--text-secondary); padding:8px; font-style:italic;">Nothing here yet. Check the box above if the client truly has a clean record, or use <strong>+ Add violation</strong> to log specific incidents.</td></tr>`}</tbody>
            </table>
            <button type="button" class="iv2-add-btn is-ghost" data-history-add="violation" style="margin-top:6px">+ Add violation</button>
        </div>
    `;

    _wireCleanToggle(root, h);

    // Add buttons
    root.querySelectorAll('[data-history-add]').forEach(btn => {
        btn.addEventListener('click', () => {
            const which = btn.getAttribute('data-history-add');
            if (which === 'loss') (h.losses = h.losses || []).push({ date:'', type:'', amount:'', operatorId:'', asset:'' });
            else (h.violations = h.violations || []).push({ date:'', type:'', operatorId:'' });
            window.IntakeV2.save();
            window.IntakeV2.requestRerender('history');
        });
    });
    // Remove buttons
    root.querySelectorAll('[data-history-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
            const which = btn.getAttribute('data-history-remove');
            const idx = Number(btn.getAttribute('data-history-idx'));
            if (which === 'loss')      (h.losses = h.losses || []).splice(idx, 1);
            else                       (h.violations = h.violations || []).splice(idx, 1);
            window.IntakeV2.save();
            window.IntakeV2.requestRerender('history');
        });
    });
    // Field handlers
    root.querySelectorAll('[data-history-row]').forEach(tr => {
        const kind = tr.getAttribute('data-history-row');
        const idx  = Number(tr.getAttribute('data-history-idx'));
        tr.querySelectorAll('[data-history-field]').forEach(el => {
            el.addEventListener('change', () => {
                const field = el.getAttribute('data-history-field');
                const target = kind === 'loss' ? h.losses[idx] : h.violations[idx];
                if (!target) return;
                target[field] = el.value;
                window.IntakeV2.scheduleSave();
            });
            el.addEventListener('input', () => {
                const field = el.getAttribute('data-history-field');
                const target = kind === 'loss' ? h.losses[idx] : h.violations[idx];
                if (!target) return;
                target[field] = el.value;
                window.IntakeV2.scheduleSave();
            });
        });
    });

    // Re-apply deferred-field styling after innerHTML replacement.
    if (window.IntakeV2._defer) window.IntakeV2._defer.render();
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('history', render);
    render();
});

})();
