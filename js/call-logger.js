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

    // ── Submit Handler ──

    async function _handleSubmit() {
        const policyEl = document.getElementById('clPolicyId');
        const typeEl = document.getElementById('clCallType');
        const notesEl = document.getElementById('clRawNotes');
        const submitBtn = document.getElementById('clSubmitBtn');
        const previewEl = document.getElementById('clPreview');
        const previewTextEl = document.getElementById('clPreviewText');

        if (!policyEl || !notesEl || !submitBtn) return;

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
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Logging...';

        try {
            // Use apiFetch for authenticated request
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch)
                ? Auth.apiFetch.bind(Auth)
                : fetch;

            const res = await fetchFn('/api/hawksoft-logger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ policyId, callType, rawNotes, userApiKey, aiModel })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server error (${res.status})`);
            }

            const result = await res.json();

            // Save policyId and callType for persistence
            _save(policyId, callType);

            // Clear notes field
            notesEl.value = '';

            // Show formatted log preview
            if (previewEl && previewTextEl && result.formattedLog) {
                previewTextEl.textContent = result.formattedLog;
                previewEl.style.display = '';
            }

            App.toast('✅ Logged to HawkSoft', 'success');

        } catch (error) {
            App.toast('Error: ' + (error.message || 'Failed to log call'), 'error');
        } finally {
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = '✨ Format & Log to HawkSoft';
        }
    }

    // ── Event Wiring ──

    function _wireEvents() {
        const submitBtn = document.getElementById('clSubmitBtn');
        if (submitBtn && !submitBtn._clWired) {
            submitBtn.addEventListener('click', _handleSubmit);
            submitBtn._clWired = true;
        }
    }

    return { init, render };
})();
