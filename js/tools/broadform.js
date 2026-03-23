/**
 * broadform.js
 * Carrier Eligibility Tool — Broadform & Non-Owners — Plugin IIFE module.
 *
 * Stateless questionnaire — answers are held in memory only; no localStorage.
 * Depends on: window.ToolComponents (js/tools/_tool-components.js)
 *             window.BroadformData   (js/tools/broadform-data.js)
 *             window.Utils           (js/utils.js)
 *
 * Exposes: window.Broadform  (matches initModule in toolConfig)
 */
window.Broadform = (() => {
    'use strict';

    // ── Private state ────────────────────────────────────────────────────────
    // Reset on every init() — questionnaire is stateless across navigations.
    let _selectedPolicyType = 'broadform';
    let _answers = {
        state:         null,   // 'WA' | 'OR' | null
        ownedAuto:     null,   // true | false | null
        regularAccess: null,   // true | false | null
    };

    // ── Public ───────────────────────────────────────────────────────────────

    /**
     * Called by App.navigateTo() on first (and every) visit to the plugin.
     * Resets state and rebuilds the questionnaire UI.
     */
    function init() {
        _selectedPolicyType = 'broadform';
        _answers = { state: null, ownedAuto: null, regularAccess: null };
        _buildUI();
    }

    // ── Private ──────────────────────────────────────────────────────────────

    function _buildUI() {
        const container = document.getElementById('bfContainer');
        if (!container) return;

        // Policy-type pill bar
        const policyBarHTML = BroadformData.policyTypes.map(pt => {
            const safeId    = Utils.escapeAttr(pt.id);
            const safeLabel = Utils.escapeHTML(pt.label);
            const activeClass = (pt.id === _selectedPolicyType) ? ' tc-toggle-active' : '';
            return `<button class="tc-toggle-btn${activeClass}" data-type="${safeId}" aria-pressed="${pt.id === _selectedPolicyType}">${safeLabel}</button>`;
        }).join('');

        // Questions for current policy type
        const qs = BroadformData.questionsByType[_selectedPolicyType] || [];
        const questionsHTML = qs.map(q => {
            if (q.type === 'stateDropdown') {
                return ToolComponents.stateDropdown(q.id, q.label, q.states);
            }
            if (q.type === 'yesNoToggle') {
                return ToolComponents.yesNoToggle(q.id, q.label);
            }
            return '';
        }).join('');

        container.innerHTML = `
            <h2 style="font-size:20px;font-weight:700;color:var(--text);margin:0 0 20px;">Carrier Eligibility</h2>
            <div id="bfPolicyTypeBar" style="display:flex;gap:10px;margin-bottom:24px;" role="group" aria-label="Policy type">
                ${policyBarHTML}
            </div>
            <p class="bf-section-title">Questionnaire</p>
            <div class="bf-questions" id="bfQuestions">${questionsHTML}</div>
            <div style="margin-top:12px;">
                <button id="bfResetBtn" class="tc-toggle-btn" style="max-width:none;width:auto;padding:9px 20px;">Reset</button>
            </div>
            <div class="bf-results" id="bfResults" aria-live="polite"></div>
        `;

        _wireEvents(container);
    }

    function _wireEvents(container) {
        // State dropdown change
        container.addEventListener('change', e => {
            if (!e.target.matches('.tc-state-select')) return;
            const val = e.target.value;
            _answers.state = val === '' ? null : val;
            _updateResults();
        });

        // All click delegation
        container.addEventListener('click', e => {
            // Policy type pill bar
            const typeBtn = e.target.closest('[data-type]');
            if (typeBtn && document.getElementById('bfPolicyTypeBar') &&
                document.getElementById('bfPolicyTypeBar').contains(typeBtn)) {
                _selectedPolicyType = typeBtn.dataset.type;
                _answers = { state: null, ownedAuto: null, regularAccess: null };
                _buildUI();
                return;
            }

            // Reset button
            if (e.target.matches('#bfResetBtn')) {
                _answers = { state: null, ownedAuto: null, regularAccess: null };
                _buildUI();
                return;
            }

            // Yes / No toggle buttons (questions only)
            const btn = e.target.closest('.tc-toggle-btn[data-id]');
            if (!btn) return;

            const { id, value } = btn.dataset;
            _answers[id] = (value === 'yes');

            // Update visual pressed state within this question's toggle group
            const group = btn.closest('.tc-toggle-group');
            if (group) {
                group.querySelectorAll('.tc-toggle-btn').forEach(b => {
                    b.classList.remove('tc-toggle-active');
                    b.setAttribute('aria-pressed', 'false');
                });
            }
            btn.classList.add('tc-toggle-active');
            btn.setAttribute('aria-pressed', 'true');

            _updateResults();
        });
    }

    function _renderCarrierCard(c) {
        if (c.status === 'referOut') {
            return `
                <div class="tc-carrier-card" style="border-color:#FF9F0A;box-shadow:0 0 0 1px #FF9F0A,0 4px 16px rgba(255,159,10,.10);">
                    <div class="tc-carrier-name">${Utils.escapeHTML(c.name)}</div>
                    <div class="tc-badge" style="background:rgba(255,159,10,.15);color:#FF9F0A;">Refer Out</div>
                    ${c.note ? `<div class="tc-carrier-note">${Utils.escapeHTML(c.note)}</div>` : ''}
                </div>`;
        }
        return ToolComponents.carrierCard(c);
    }

    function _updateResults() {
        const resultsEl = document.getElementById('bfResults');
        if (!resultsEl) return;

        const result = BroadformData.rules.evaluate(
            _answers.state,
            _answers.ownedAuto,
            _answers.regularAccess,
            _selectedPolicyType
        );

        if (result === null) {
            resultsEl.innerHTML = '';
            return;
        }

        if (result.outcome === 'hard-stop') {
            resultsEl.innerHTML = `
                <p class="bf-results-title">Eligibility Result</p>
                ${ToolComponents.hardStop(result.message)}
            `;
            return;
        }

        if (result.outcome === 'eligible') {
            const cardsHTML = result.carriers
                .map(c => _renderCarrierCard(c))
                .join('');
            resultsEl.innerHTML = `
                <p class="bf-results-title">Available Carriers</p>
                <div class="bf-carrier-grid">${cardsHTML}</div>
            `;
        }
    }

    return { init };
})();
