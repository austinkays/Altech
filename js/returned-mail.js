/**
 * Returned Mail Tracker
 * Log returned mail for clients, validate addresses via Google Address Validation API,
 * and copy formatted notes to the HawkSoft logger.
 */
window.ReturnedMailTracker = (() => {
    'use strict';

    const STORAGE_KEY = STORAGE_KEYS.RETURNED_MAIL;

    const RETURN_REASONS = [
        'Moved — No Forwarding Address',
        'Undeliverable As Addressed',
        'Attempted — Not Known',
        'Vacant',
        'Refused',
        'Unclaimed',
        'Wrong Address',
        'Return to Sender',
        'No Such Number',
        'Insufficient Address',
        'Other',
    ];

    let _items = [];
    let _editId = null;
    let _validationResult = null;
    let _filterStatus = 'all';
    let _searchQuery = '';

    // ─── Init / Lifecycle ────────────────────────────────────────────────────

    function init() {
        _load();
        _wireEvents();
        render();
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) _items = JSON.parse(raw);
        } catch (e) {
            console.warn('[ReturnedMailTracker] Load failed:', e);
            _items = [];
        }
    }

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_items));
        } catch (e) {
            console.warn('[ReturnedMailTracker] Save failed:', e);
        }
    }

    // ─── Address Validation ──────────────────────────────────────────────────

    async function validateAddress() {
        const input = document.getElementById('rmtAddrInput');
        if (!input) return;
        const address = input.value.trim();
        if (!address) {
            App.toast('Enter an address to validate.', 'error');
            return;
        }

        const btn = document.getElementById('rmtValidateBtn');
        const resultEl = document.getElementById('rmtValidationResult');
        if (btn) { btn.disabled = true; btn.textContent = 'Validating…'; }
        if (resultEl) resultEl.innerHTML = '';

        try {
            const res = await fetch('/api/property-intelligence?mode=validate-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address }),
            });
            const data = await res.json();
            _validationResult = data;
            _renderValidationResult(data);
        } catch (err) {
            if (resultEl) resultEl.innerHTML =
                `<div class="rmt-validation-error">⚠️ Validation request failed: ${_esc(err.message)}</div>`;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Validate'; }
        }
    }

    function _renderValidationResult(data) {
        const el = document.getElementById('rmtValidationResult');
        if (!el) return;

        if (data.error) {
            el.innerHTML = `<div class="rmt-validation-error">⚠️ ${_esc(data.error)}</div>`;
            return;
        }

        const deliverability = data.deliverability || 'UNKNOWN';
        const deliverClass = {
            DELIVERABLE: 'rmt-v-deliverable',
            POSSIBLY_DELIVERABLE: 'rmt-v-possible',
            UNDELIVERABLE: 'rmt-v-undeliverable',
        }[deliverability] || 'rmt-v-possible';

        const missing = (data.missingComponents || []).map(_esc).join(', ');
        const unconfirmed = (data.unconfirmedComponents || []).map(_esc).join(', ');
        const suggestedAddr = data.standardizedAddress;

        el.innerHTML = `
            <div class="rmt-validation-card ${deliverClass}">
                <div class="rmt-validation-header">
                    <span class="rmt-deliverability-badge rmt-badge-${deliverability.toLowerCase()}">${deliverability.replace(/_/g, ' ')}</span>
                </div>
                ${suggestedAddr ? `
                <div class="rmt-suggested-row">
                    <span class="rmt-suggested-label">Google suggests:</span>
                    <span class="rmt-suggested-addr">${_esc(suggestedAddr)}</span>
                </div>` : ''}
                ${data.isMultiUnit ? `
                <div class="rmt-multiunit-warning">
                    🏢 Multi-unit building detected — add apartment or unit number before logging
                </div>` : ''}
                ${data.likelyReturnReason
                    ? `<p class="rmt-return-reason-hint">📬 ${_esc(data.likelyReturnReason)}</p>`
                    : ''}
                ${missing
                    ? `<p class="rmt-v-warning">Missing components: ${missing}</p>`
                    : ''}
                ${unconfirmed
                    ? `<p class="rmt-v-warning">Unconfirmed: ${unconfirmed}</p>`
                    : ''}
                ${(data.streetViewUrl || data.satelliteUrl) ? `
                <div class="rmt-map-images">
                    ${data.streetViewUrl ? `
                    <div class="rmt-map-img-wrap">
                        <div class="rmt-map-img-label">Street View</div>
                        <img class="rmt-map-img" src="${data.streetViewUrl}" alt="Street view" loading="lazy"
                             onerror="this.closest('.rmt-map-img-wrap').style.display='none'">
                    </div>` : ''}
                    ${data.satelliteUrl ? `
                    <div class="rmt-map-img-wrap">
                        <div class="rmt-map-img-label">Satellite</div>
                        <img class="rmt-map-img" src="${data.satelliteUrl}" alt="Satellite view" loading="lazy"
                             onerror="this.closest('.rmt-map-img-wrap').style.display='none'">
                    </div>` : ''}
                </div>` : ''}
                <button type="button" class="rmt-use-addr-btn" onclick="ReturnedMailTracker.useValidatedAddress()">
                    Use this address ↓
                </button>
            </div>`;
    }

    function useValidatedAddress() {
        if (!_validationResult?.standardizedAddress) return;
        const addrField = document.getElementById('rmtClientAddress');
        if (addrField) {
            addrField.value = _validationResult.standardizedAddress;
            addrField.focus();
        }
        document.getElementById('rmtFormSection')?.scrollIntoView({ behavior: 'smooth' });
    }

    // ─── Event Wiring ────────────────────────────────────────────────────────

    function _wireEvents() {
        // Validation controls
        const validateBtn = document.getElementById('rmtValidateBtn');
        if (validateBtn) validateBtn.addEventListener('click', validateAddress);

        const addrInput = document.getElementById('rmtAddrInput');
        if (addrInput) addrInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); validateAddress(); }
        });

        // Log form
        const form = document.getElementById('rmtLogForm');
        if (form) form.addEventListener('submit', submitForm);

        const cancelBtn = document.getElementById('rmtCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', cancelEdit);

        // Table controls
        const searchInput = document.getElementById('rmtSearchInput');
        if (searchInput) searchInput.addEventListener('input', e => {
            _searchQuery = e.target.value;
            renderTable();
        });

        const filterSelect = document.getElementById('rmtFilterStatus');
        if (filterSelect) filterSelect.addEventListener('change', e => {
            _filterStatus = e.target.value;
            renderTable();
        });

        // Export all button
        const exportBtn = document.getElementById('rmtExportBtn');
        if (exportBtn) exportBtn.addEventListener('click', exportCSV);
    }

    // ─── Form ────────────────────────────────────────────────────────────────

    function submitForm(e) {
        if (e) e.preventDefault();

        const clientName    = document.getElementById('rmtClientName')?.value.trim();
        const clientAddress = document.getElementById('rmtClientAddress')?.value.trim();
        const returnReason  = document.getElementById('rmtReturnReason')?.value;
        const dateReturned  = document.getElementById('rmtDateReturned')?.value;
        const status        = document.getElementById('rmtStatus')?.value;
        const notes         = document.getElementById('rmtNotes')?.value.trim();
        const policyNumber  = document.getElementById('rmtPolicyNumber')?.value.trim();

        if (!clientName || !clientAddress) {
            App.toast('Client name and address are required.', 'error');
            return;
        }

        const now = new Date().toISOString();

        if (_editId) {
            const idx = _items.findIndex(i => i.id === _editId);
            if (idx > -1) {
                _items[idx] = {
                    ..._items[idx],
                    clientName, clientAddress, returnReason,
                    dateReturned, status, notes, policyNumber,
                    updatedAt: now,
                };
            }
            _editId = null;
        } else {
            _items.unshift({
                id: crypto.randomUUID(),
                clientName,
                clientAddress,
                returnReason: returnReason || 'Other',
                dateReturned: dateReturned || now.split('T')[0],
                status: status || 'pending',
                notes,
                policyNumber,
                createdAt: now,
                updatedAt: now,
            });
        }

        _save();
        _resetForm();
        renderTable();
        App.toast('Entry saved.', 'success');
    }

    function _resetForm() {
        const form = document.getElementById('rmtLogForm');
        if (form) form.reset();

        // Keep today as default date
        const dateField = document.getElementById('rmtDateReturned');
        if (dateField) dateField.value = new Date().toISOString().split('T')[0];

        _editId = null;

        const submitBtn = document.getElementById('rmtSubmitBtn');
        if (submitBtn) submitBtn.textContent = 'Add Entry';

        const cancelBtn = document.getElementById('rmtCancelBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';

        const formTitle = document.getElementById('rmtFormTitle');
        if (formTitle) formTitle.textContent = 'Add Log Entry';
    }

    function cancelEdit() {
        _editId = null;
        _resetForm();
    }

    function editItem(id) {
        const item = _items.find(i => i.id === id);
        if (!item) return;

        _editId = id;

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        set('rmtClientName',    item.clientName);
        set('rmtClientAddress', item.clientAddress);
        set('rmtReturnReason',  item.returnReason);
        set('rmtDateReturned',  item.dateReturned);
        set('rmtStatus',        item.status);
        set('rmtNotes',         item.notes);
        set('rmtPolicyNumber',  item.policyNumber);

        const submitBtn = document.getElementById('rmtSubmitBtn');
        if (submitBtn) submitBtn.textContent = 'Save Changes';

        const cancelBtn = document.getElementById('rmtCancelBtn');
        if (cancelBtn) cancelBtn.style.display = '';

        const formTitle = document.getElementById('rmtFormTitle');
        if (formTitle) formTitle.textContent = 'Edit Entry';

        document.getElementById('rmtFormSection')?.scrollIntoView({ behavior: 'smooth' });
    }

    function deleteItem(id) {
        if (!confirm('Delete this entry?')) return;
        _items = _items.filter(i => i.id !== id);
        _save();
        renderTable();
    }

    // ─── HawkSoft Copy ───────────────────────────────────────────────────────

    function copyToHawkSoft(id) {
        const item = _items.find(i => i.id === id);
        if (!item) return;

        const lines = _buildPushNote(item);

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(lines).then(() => {
                App.toast('Copied — paste into HawkSoft logger.', 'success');
            }).catch(() => _fallbackCopy(lines));
        } else {
            _fallbackCopy(lines);
        }
    }

    function _fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); App.toast('Copied — paste into HawkSoft logger.', 'success'); }
        catch (e) { App.toast('Copy failed — select and copy manually.', 'error'); }
        finally { document.body.removeChild(ta); }
    }

    // ─── HawkSoft Direct Push ─────────────────────────────────────────────────

    function _buildPushNote(item) {
        const statusCap = (item.status || 'pending');
        const s = statusCap.charAt(0).toUpperCase() + statusCap.slice(1);
        return [
            `📬 Returned Mail — ${item.clientName}`,
            `Date Returned: ${item.dateReturned || 'N/A'}`,
            `Address: ${item.clientAddress}`,
            item.policyNumber ? `Policy #: ${item.policyNumber}` : null,
            `Return Reason: ${item.returnReason || 'Unknown'}`,
            `Status: ${s}`,
            item.notes ? `Notes: ${item.notes}` : null,
        ].filter(Boolean).join('\n');
    }

    function showPushModal(id) {
        const item = _items.find(i => i.id === id);
        if (!item) return;

        closePushModal();

        const defaultNote = _buildPushNote(item);

        const overlay = document.createElement('div');
        overlay.id = 'rmtHsModalOverlay';
        overlay.className = 'rmt-modal-overlay';
        overlay.innerHTML = `
            <div class="rmt-modal-box" role="dialog" aria-modal="true" aria-labelledby="rmtModalTitle">
                <div class="rmt-modal-header">
                    <h3 id="rmtModalTitle" class="rmt-modal-title">Push to HawkSoft</h3>
                    <button class="rmt-modal-close" onclick="ReturnedMailTracker.closePushModal()" aria-label="Close">\u2715</button>
                </div>
                <p class="rmt-modal-subtitle">Log this returned mail entry directly to the client\u2019s HawkSoft profile.</p>
                <div class="rmt-modal-field">
                    <label for="rmtHsClientNum" class="rmt-modal-label">HawkSoft Client # <span class="rmt-required">*</span></label>
                    <input id="rmtHsClientNum" type="text" class="rmt-input" placeholder="e.g. 12345" autocomplete="off">
                </div>
                <div class="rmt-modal-field">
                    <label for="rmtHsNote" class="rmt-modal-label">Log Note</label>
                    <textarea id="rmtHsNote" class="rmt-modal-textarea" rows="7">${_esc(defaultNote)}</textarea>
                </div>
                <div class="rmt-modal-footer">
                    <button type="button" class="rmt-btn-ghost" onclick="ReturnedMailTracker.closePushModal()">Cancel</button>
                    <button type="button" class="rmt-btn-primary" id="rmtHsPushBtn" onclick="ReturnedMailTracker.submitPushModal('${_esc(id)}')">
                        Push to HawkSoft
                    </button>
                </div>
            </div>`;

        overlay.addEventListener('click', e => { if (e.target === overlay) closePushModal(); });
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('rmt-modal-open'));
        document.getElementById('rmtHsClientNum')?.focus();
    }

    function closePushModal() {
        const existing = document.getElementById('rmtHsModalOverlay');
        if (existing) existing.remove();
    }

    async function submitPushModal(id) {
        const item = _items.find(i => i.id === id);
        if (!item) return;

        const clientNum = document.getElementById('rmtHsClientNum')?.value.trim();
        const noteText  = document.getElementById('rmtHsNote')?.value.trim();
        const pushBtn   = document.getElementById('rmtHsPushBtn');

        if (!clientNum) {
            App.toast('HawkSoft Client # is required.', 'error');
            document.getElementById('rmtHsClientNum')?.focus();
            return;
        }
        if (!noteText) {
            App.toast('Log note cannot be empty.', 'error');
            return;
        }

        if (pushBtn) { pushBtn.disabled = true; pushBtn.textContent = 'Pushing\u2026'; }

        try {
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch)
                ? Auth.apiFetch.bind(Auth)
                : fetch;

            const res = await fetchFn('/api/hawksoft-logger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    policyId: item.policyNumber || item.clientName,
                    clientNumber: clientNum,
                    callType: 'Mail',
                    formattedLog: noteText,
                }),
            });

            const result = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(result.error || `Server error (${res.status})`);
            }

            if (result.hawksoftLogged) {
                App.toast(`\u2705 Logged to HawkSoft for ${item.clientName}`, 'success');
                closePushModal();
            } else if (result.hawksoftStatus === 'push_failed' || result.hawksoftStatus === 'push_error') {
                const detail = result.hawksoftError ? ` — ${result.hawksoftError}` : '';
                App.toast(`\u26a0\ufe0f HawkSoft push failed${detail}`, 'error');
                if (pushBtn) { pushBtn.disabled = false; pushBtn.textContent = 'Push to HawkSoft'; }
            } else {
                App.toast('HawkSoft connection unavailable — note was not saved.', 'error');
                if (pushBtn) { pushBtn.disabled = false; pushBtn.textContent = 'Push to HawkSoft'; }
            }
        } catch (err) {
            App.toast('Push failed: ' + (err.message || 'Unknown error'), 'error');
            if (pushBtn) { pushBtn.disabled = false; pushBtn.textContent = 'Push to HawkSoft'; }
        }
    }

    // ─── Table Render ────────────────────────────────────────────────────────

    function renderTable() {
        const tbody   = document.getElementById('rmtTableBody');
        const emptyEl = document.getElementById('rmtEmpty');
        const countEl = document.getElementById('rmtCount');
        if (!tbody) return;

        let filtered = [..._items];
        if (_filterStatus !== 'all') filtered = filtered.filter(i => i.status === _filterStatus);
        if (_searchQuery) {
            const q = _searchQuery.toLowerCase();
            filtered = filtered.filter(i =>
                (i.clientName    || '').toLowerCase().includes(q) ||
                (i.clientAddress || '').toLowerCase().includes(q) ||
                (i.returnReason  || '').toLowerCase().includes(q) ||
                (i.policyNumber  || '').toLowerCase().includes(q)
            );
        }

        if (emptyEl) emptyEl.style.display = filtered.length ? 'none' : '';
        if (countEl) countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`;

        const statusBadgeClass = {
            pending:   'rmt-s-pending',
            contacted: 'rmt-s-contacted',
            resolved:  'rmt-s-resolved',
        };

        tbody.innerHTML = filtered.map(item => {
            const sc = statusBadgeClass[item.status] || 'rmt-s-pending';
            return `<tr>
                <td data-label="Client">${_esc(item.clientName)}</td>
                <td data-label="Address" class="rmt-td-addr">${_esc(item.clientAddress)}</td>
                <td data-label="Reason">${_esc(item.returnReason || '—')}</td>
                <td data-label="Date">${_esc(item.dateReturned || '—')}</td>
                <td data-label="Status"><span class="rmt-status-badge ${sc}">${_esc(item.status || 'pending')}</span></td>
                <td data-label="Policy">${_esc(item.policyNumber || '—')}</td>
                <td data-label="Notes" class="rmt-td-notes">${_esc(item.notes || '—')}</td>
                <td data-label="Actions" class="rmt-td-actions">
                    <button class="rmt-icon-btn" onclick="ReturnedMailTracker.showPushModal('${item.id}')" title="Push to HawkSoft">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                    <button class="rmt-icon-btn" onclick="ReturnedMailTracker.copyToHawkSoft('${item.id}')" title="Copy log to clipboard">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button class="rmt-icon-btn" onclick="ReturnedMailTracker.editItem('${item.id}')" title="Edit">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="rmt-icon-btn rmt-icon-btn-danger" onclick="ReturnedMailTracker.deleteItem('${item.id}')" title="Delete">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // ─── CSV Export ──────────────────────────────────────────────────────────

    function exportCSV() {
        if (!_items.length) { App.toast('No entries to export.', 'error'); return; }

        const headers = ['Client Name', 'Address', 'Policy #', 'Return Reason', 'Date Returned', 'Status', 'Notes'];
        const rows = _items.map(i => [
            i.clientName, i.clientAddress, i.policyNumber || '',
            i.returnReason, i.dateReturned, i.status, i.notes || '',
        ].map(v => `"${String(v || '').replace(/"/g, '""')}"`));

        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `returned-mail-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─── Public render ───────────────────────────────────────────────────────

    function render() {
        renderTable();
    }

    return {
        init,
        render,
        renderTable,
        validateAddress,
        useValidatedAddress,
        submitForm,
        editItem,
        deleteItem,
        copyToHawkSoft,
        showPushModal,
        closePushModal,
        submitPushModal,
        cancelEdit,
        exportCSV,
    };
})();
