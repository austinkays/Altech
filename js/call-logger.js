/**
 * CallLogger — AI-powered call note formatter + HawkSoft logger
 * Formats messy shorthand call notes via AI, then logs to HawkSoft.
 * Uses apiFetch() for authenticated API calls.
 *
 * localStorage key: altech_call_logger
 */
window.CallLogger = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_call_logger';
    const CGL_CACHE_KEY = 'altech_cgl_cache';
    let _searchTimer = null;
    let _selectedClient = null;  // { name, policies: [...] }
    let _selectedPolicy = null;  // { policyNumber, type, typeLabel, expirationDate, hawksoftId }

    function init() {
        _load();
        _wireEvents();
    }

    function render() {
        // HTML is loaded from plugins/call-logger.html — just re-wire events
        _load();
        _wireEvents();
    }

    // ── Persistence ──

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                const policyEl = document.getElementById('clPolicyId');
                const typeEl = document.getElementById('clCallType');
                if (policyEl && saved.policyId) policyEl.value = saved.policyId;
                if (typeEl && saved.callType) typeEl.value = saved.callType;
            }
        } catch (e) {
            console.warn('[CallLogger] Load error:', e);
        }
    }

    function _save(policyId, callType) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ policyId, callType }));
            if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
                CloudSync.schedulePush();
            }
        } catch (e) {
            console.warn('[CallLogger] Save error:', e);
        }
    }

    // ── AI Settings Resolution ──

    function _resolveAISettings() {
        let userApiKey = '';
        let aiModel = 'gemini-2.5-flash';

        try {
            const raw = localStorage.getItem('altech_settings');
            if (raw) {
                const settings = JSON.parse(raw);
                if (settings.userApiKey && settings.userApiKey.trim()) {
                    userApiKey = settings.userApiKey.trim();
                }
                if (settings.aiModel && settings.aiModel.trim()) {
                    aiModel = settings.aiModel.trim();
                }
            }
        } catch (e) {
            // Fall through to defaults
        }

        return { userApiKey, aiModel };
    }

    // ── Client & Policy Lookup ──

    /**
     * Retrieve all known clients merged from Client History + CGL cache.
     * Returns array of { name, policies: [...] } sorted by name.
     */
    function _getClients() {
        const clientMap = {};  // name (lowercase) → { name, policies }

        // Source 1: CGL compliance cache (HawkSoft policies — richest data)
        try {
            const raw = localStorage.getItem(CGL_CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                const policies = cached?.policies || [];
                for (const p of policies) {
                    if (!p.clientName) continue;
                    const key = p.clientName.toLowerCase().trim();
                    if (!clientMap[key]) clientMap[key] = { name: p.clientName, policies: [] };
                    clientMap[key].policies.push({
                        policyNumber: p.policyNumber || '',
                        type: p.type || 'unknown',
                        typeLabel: _policyTypeLabel(p.type),
                        expirationDate: p.expirationDate || '',
                        hawksoftId: p.hawksoftId || p.clientNumber || ''
                    });
                }
            }
        } catch (e) { /* ignore parse errors */ }

        // Source 2: Client History (quote-based clients)
        try {
            if (typeof App !== 'undefined' && App.getClientHistory) {
                const history = App.getClientHistory() || [];
                for (const c of history) {
                    const name = c.name || (c.data && `${c.data.firstName || ''} ${c.data.lastName || ''}`.trim());
                    if (!name) continue;
                    const key = name.toLowerCase().trim();
                    if (!clientMap[key]) clientMap[key] = { name, policies: [] };
                }
            }
        } catch (e) { /* ignore */ }

        return Object.values(clientMap).sort((a, b) => a.name.localeCompare(b.name));
    }

    function _policyTypeLabel(type) {
        if (!type) return 'Policy';
        const labels = {
            cgl: 'CGL', bond: 'Bond', auto: 'Auto', wc: 'Workers Comp',
            pkg: 'Package', umbrella: 'Umbrella', im: 'Inland Marine',
            property: 'Property', epli: 'EPLI', do: 'D&O',
            eo: 'E&O', cyber: 'Cyber', crime: 'Crime',
            liquor: 'Liquor', garage: 'Garage', pollution: 'Pollution',
            bop: 'BOP', commercial: 'Commercial'
        };
        return labels[type] || type.toUpperCase();
    }

    function _policyTypeIcon(type) {
        const icons = {
            auto: '🚗', property: '🏠', cgl: '🛡️', bond: '📜',
            wc: '👷', umbrella: '☂️', im: '📦', pkg: '📋',
            bop: '🏢', epli: '👥', do: '⚖️', eo: '🔒',
            cyber: '💻', crime: '🚨', liquor: '🍷', garage: '🔧',
            pollution: '🌿', commercial: '🏪'
        };
        return icons[type] || '📄';
    }

    /**
     * Handle typing in the client/policy ID field — show autocomplete dropdown.
     */
    function _handleClientSearch() {
        const input = document.getElementById('clPolicyId');
        const dropdown = document.getElementById('clClientDropdown');
        if (!input || !dropdown) return;

        const query = input.value.trim().toLowerCase();

        // Clear previous selection if user edits the input
        if (_selectedClient && input.value.trim() !== _selectedClient.name) {
            _selectedClient = null;
            _selectedPolicy = null;
            const policySelect = document.getElementById('clPolicySelect');
            if (policySelect) policySelect.style.display = 'none';
        }

        if (query.length < 2) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }

        const clients = _getClients();
        const matches = clients.filter(c => c.name.toLowerCase().includes(query));

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }

        // Render dropdown (max 8 results)
        const shown = matches.slice(0, 8);
        dropdown.innerHTML = shown.map((c, i) => {
            const policyCount = c.policies.length;
            const badge = policyCount > 0
                ? `<span class="cl-client-badge">${policyCount} ${policyCount === 1 ? 'policy' : 'policies'}</span>`
                : '<span class="cl-client-badge cl-client-badge-none">No policies</span>';
            return `<div class="cl-client-row" data-index="${i}">${_escapeHTML(c.name)} ${badge}</div>`;
        }).join('');

        dropdown.style.display = '';

        // Wire click handlers on rows
        dropdown.querySelectorAll('.cl-client-row').forEach((row, idx) => {
            row.addEventListener('click', () => _selectClient(shown[idx]));
        });
    }

    /**
     * User selected a client from the dropdown.
     */
    function _selectClient(client) {
        const input = document.getElementById('clPolicyId');
        const dropdown = document.getElementById('clClientDropdown');
        const policySelect = document.getElementById('clPolicySelect');
        const policyList = document.getElementById('clPolicyList');

        _selectedClient = client;
        _selectedPolicy = null;

        // Close dropdown
        if (dropdown) dropdown.style.display = 'none';

        // If client has policies, show policy picker — keep input as client name
        if (client.policies.length > 0 && policySelect && policyList) {
            input.value = client.name;
            policyList.innerHTML = client.policies.map((p, i) => {
                const icon = _policyTypeIcon(p.type);
                const exp = p.expirationDate
                    ? `<span class="cl-policy-exp">Exp: ${p.expirationDate}</span>`
                    : '';
                const numDisplay = p.policyNumber || 'No policy #';
                return `<div class="cl-policy-chip" data-index="${i}">
                    <span class="cl-policy-icon">${icon}</span>
                    <span class="cl-policy-info">
                        <span class="cl-policy-type">${_escapeHTML(p.typeLabel)}</span>
                        <span class="cl-policy-num">${_escapeHTML(numDisplay)}</span>
                    </span>
                    ${exp}
                </div>`;
            }).join('');
            policySelect.style.display = '';

            // Wire click on each policy chip
            policyList.querySelectorAll('.cl-policy-chip').forEach((chip, idx) => {
                chip.addEventListener('click', () => _selectPolicy(client.policies[idx], chip));
            });
        } else {
            // No policies — just set the name
            input.value = client.name;
            if (policySelect) policySelect.style.display = 'none';
        }
    }

    /**
     * User picked a specific policy — set it as the active policy ID.
     */
    function _selectPolicy(policy, chipEl) {
        // Store the selected policy — policyNumber will be used as the API policyId
        _selectedPolicy = policy;

        // Visual feedback — highlight selected chip
        const list = document.getElementById('clPolicyList');
        if (list) {
            list.querySelectorAll('.cl-policy-chip').forEach(c => c.classList.remove('cl-policy-selected'));
        }
        if (chipEl) chipEl.classList.add('cl-policy-selected');
    }

    /**
     * Close dropdown when clicking outside.
     */
    function _handleClickOutside(e) {
        const dropdown = document.getElementById('clClientDropdown');
        const wrapper = document.querySelector('.cl-search-wrapper');
        if (dropdown && wrapper && !wrapper.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }

    // ── Internal State ──

    let _pendingLog = null;  // { formattedLog, policyId, callType }

    // ── Step 1: Format Preview ──

    async function _handleFormat() {
        const policyEl = document.getElementById('clPolicyId');
        const typeEl = document.getElementById('clCallType');
        const notesEl = document.getElementById('clRawNotes');
        const formatBtn = document.getElementById('clSubmitBtn');
        const previewEl = document.getElementById('clPreview');
        const previewTextEl = document.getElementById('clPreviewText');
        const confirmSection = document.getElementById('clConfirmSection');
        const confirmInfo = document.getElementById('clConfirmInfo');

        if (!policyEl || !notesEl || !formatBtn) return;

        const inputValue = policyEl.value.trim();
        const callType = typeEl ? typeEl.value : 'Inbound';
        const rawNotes = notesEl.value.trim();

        // Validate required fields
        if (!inputValue || !rawNotes) {
            App.toast('Please fill in all fields', 'error');
            return;
        }

        // If a client was selected from autocomplete and has policies, require policy selection
        if (_selectedClient && _selectedClient.policies.length > 0 && !_selectedPolicy) {
            App.toast('Please select a policy to log this call under', 'error');
            return;
        }

        // Resolve the actual policy ID: selected policy > input value
        const policyId = (_selectedPolicy && _selectedPolicy.policyNumber)
            ? _selectedPolicy.policyNumber : inputValue;

        // Resolve AI settings
        const { userApiKey, aiModel } = _resolveAISettings();

        // Disable button
        formatBtn.disabled = true;
        formatBtn.textContent = '⏳ Formatting...';

        try {
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch)
                ? Auth.apiFetch.bind(Auth)
                : fetch;

            const res = await fetchFn('/api/hawksoft-logger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ policyId, callType, rawNotes, userApiKey, aiModel, formatOnly: true })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server error (${res.status})`);
            }

            const result = await res.json();

            if (!result.formattedLog) {
                throw new Error('No formatted log returned');
            }

            // Store pending log for confirmation
            _pendingLog = {
                formattedLog: result.formattedLog,
                policyId: result.policyId || policyId,
                callType: result.callType || callType
            };

            // Save policyId and callType for persistence
            _save(policyId, callType);

            // Show formatted log preview
            if (previewEl && previewTextEl) {
                previewTextEl.textContent = result.formattedLog;
                previewEl.style.display = '';
            }

            // Show confirmation section with client info + HawkSoft link
            if (confirmSection && confirmInfo) {
                const infoIcon = callType === 'Outbound' ? '📤' : '📥';
                let infoHtml = `<strong>${infoIcon} ${_escapeHTML(callType)} Call</strong> — logging to `;

                if (_selectedClient && _selectedPolicy) {
                    // Client link (hs:// desktop / Agent Portal mobile) + policy badge
                    const hsId = _selectedPolicy.hawksoftId || '';
                    infoHtml += _buildClientLink(_selectedClient.name, hsId);
                    const pIcon = _policyTypeIcon(_selectedPolicy.type);
                    infoHtml += ` <span class="cl-confirm-policy">${pIcon} ${_escapeHTML(_selectedPolicy.typeLabel)} ${_escapeHTML(_selectedPolicy.policyNumber)}</span>`;
                } else {
                    infoHtml += `<strong>${_escapeHTML(policyId)}</strong>`;
                }

                confirmInfo.innerHTML = infoHtml;
                confirmSection.style.display = '';
            }

            // Change format button to "Edit" mode
            formatBtn.textContent = '✏️ Edit Notes';
            formatBtn.classList.add('cl-edit-mode');

            App.toast('Preview ready — review and confirm below', 'success');

        } catch (error) {
            App.toast('Error: ' + (error.message || 'Failed to format call'), 'error');
        } finally {
            formatBtn.disabled = false;
        }
    }

    // ── Step 2: Confirm & Send to HawkSoft ──

    async function _handleConfirm() {
        if (!_pendingLog) {
            App.toast('No formatted log to send — format first', 'error');
            return;
        }

        const confirmBtn = document.getElementById('clConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '⏳ Sending to HawkSoft...';
        }

        try {
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch)
                ? Auth.apiFetch.bind(Auth)
                : fetch;

            const res = await fetchFn('/api/hawksoft-logger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    policyId: _pendingLog.policyId,
                    callType: _pendingLog.callType,
                    formattedLog: _pendingLog.formattedLog
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server error (${res.status})`);
            }

            const result = await res.json();

            // Clear form
            const notesEl = document.getElementById('clRawNotes');
            if (notesEl) notesEl.value = '';

            const statusMsg = result.hawksoftLogged
                ? `✅ Logged to HawkSoft for ${_escapeHTML(_pendingLog.policyId)}`
                : '✅ Formatted (HawkSoft credentials not configured — copy log manually)';

            App.toast(statusMsg, 'success');

            // Reset to initial state but keep preview visible
            _resetToFormatMode();
            _pendingLog = null;

        } catch (error) {
            App.toast('Error: ' + (error.message || 'Failed to send to HawkSoft'), 'error');
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = '✅ Confirm & Log to HawkSoft';
            }
        }
    }

    // ── Edit: Go back to editing ──

    function _handleEdit() {
        _pendingLog = null;
        _resetToFormatMode();

        // Hide preview and confirm
        const previewEl = document.getElementById('clPreview');
        const confirmSection = document.getElementById('clConfirmSection');
        if (previewEl) previewEl.style.display = 'none';
        if (confirmSection) confirmSection.style.display = 'none';

        App.toast('Edit your notes and format again', 'success');
    }

    // ── Copy formatted log ──

    function _handleCopy() {
        const previewTextEl = document.getElementById('clPreviewText');
        if (!previewTextEl) return;

        const text = previewTextEl.textContent;
        if (!text) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                App.toast('Copied to clipboard', 'success');
            }).catch(() => {
                _fallbackCopy(text);
            });
        } else {
            _fallbackCopy(text);
        }
    }

    function _fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            App.toast('Copied to clipboard', 'success');
        } catch (e) {
            App.toast('Copy failed — select and copy manually', 'error');
        }
        document.body.removeChild(ta);
    }

    // ── Helpers ──

    function _resetToFormatMode() {
        const formatBtn = document.getElementById('clSubmitBtn');
        const confirmSection = document.getElementById('clConfirmSection');
        if (formatBtn) {
            formatBtn.textContent = '✨ Format Preview';
            formatBtn.classList.remove('cl-edit-mode');
        }
        if (confirmSection) {
            confirmSection.style.display = 'none';
        }
    }

    function _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Build a clickable HawkSoft link for a client name.
     * Desktop: hs:// protocol → HawkSoft desktop app
     * Mobile:  Agent Portal web URL
     * Falls back to bold text if no hawksoftId.
     */
    function _buildClientLink(name, hawksoftId) {
        const escaped = _escapeHTML(name);
        if (!hawksoftId) return `<strong>${escaped}</strong>`;
        const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
        const href = isMobile
            ? `https://agents.hawksoft.app/client/${encodeURIComponent(hawksoftId)}`
            : `hs://${encodeURIComponent(hawksoftId)}`;
        const title = isMobile ? 'Open in HawkSoft Agent Portal' : 'Open in HawkSoft';
        return `<a href="${href}" class="cl-client-link" title="${title}" target="_blank" rel="noopener">${escaped}</a>`;
    }

    // ── Event Wiring ──

    function _wireEvents() {
        // Client search / autocomplete on the policy ID input
        const policyInput = document.getElementById('clPolicyId');
        if (policyInput && !policyInput._clSearchWired) {
            policyInput.addEventListener('input', () => {
                clearTimeout(_searchTimer);
                _searchTimer = setTimeout(_handleClientSearch, 150);
            });
            policyInput.addEventListener('focus', () => {
                // Re-show dropdown if there's already text
                if (policyInput.value.trim().length >= 2) {
                    _handleClientSearch();
                }
            });
            policyInput._clSearchWired = true;
        }

        // Close dropdown when clicking outside
        if (!document._clOutsideWired) {
            document.addEventListener('click', _handleClickOutside);
            document._clOutsideWired = true;
        }

        // Format / Edit button (toggles based on state)
        const submitBtn = document.getElementById('clSubmitBtn');
        if (submitBtn && !submitBtn._clWired) {
            submitBtn.addEventListener('click', () => {
                if (_pendingLog) {
                    _handleEdit();
                } else {
                    _handleFormat();
                }
            });
            submitBtn._clWired = true;
        }

        // Confirm button
        const confirmBtn = document.getElementById('clConfirmBtn');
        if (confirmBtn && !confirmBtn._clWired) {
            confirmBtn.addEventListener('click', _handleConfirm);
            confirmBtn._clWired = true;
        }

        // Cancel button (goes back to edit)
        const cancelBtn = document.getElementById('clCancelBtn');
        if (cancelBtn && !cancelBtn._clWired) {
            cancelBtn.addEventListener('click', _handleEdit);
            cancelBtn._clWired = true;
        }

        // Copy button
        const copyBtn = document.getElementById('clCopyBtn');
        if (copyBtn && !copyBtn._clWired) {
            copyBtn.addEventListener('click', _handleCopy);
            copyBtn._clWired = true;
        }
    }

    return { init, render, _getClients, _policyTypeLabel, _policyTypeIcon, _selectClient, _selectPolicy, _handleClientSearch, _buildClientLink, getSelectedPolicy: () => _selectedPolicy };
})();
