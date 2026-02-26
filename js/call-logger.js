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

        const policyId = policyEl.value.trim();
        const callType = typeEl ? typeEl.value : 'Inbound';
        const rawNotes = notesEl.value.trim();

        // Validate
        if (!policyId || !rawNotes) {
            App.toast('Please fill in all fields', 'error');
            return;
        }

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

            // Show confirmation section with client info
            if (confirmSection && confirmInfo) {
                const infoIcon = callType === 'Outbound' ? '📤' : '📥';
                confirmInfo.innerHTML = `<strong>${infoIcon} ${_escapeHTML(callType)} Call</strong> — logging to <strong>${_escapeHTML(policyId)}</strong>`;
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

    // ── Event Wiring ──

    function _wireEvents() {
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

    return { init, render };
})();
