/**
 * broadform.js
 * Broadform / Non-Owner Eligibility Filter — Plugin IIFE module.
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
        _answers = { state: null, ownedAuto: null, regularAccess: null };
        _buildUI();
    }

    // ── Private ──────────────────────────────────────────────────────────────

    function _buildUI() {
        const container = document.getElementById('bfContainer');
        if (!container) return;

        const questionsHTML = BroadformData.questions.map(q => {
            if (q.type === 'stateDropdown') {
                return ToolComponents.stateDropdown(q.id, q.label, q.states);
            }
            if (q.type === 'yesNoToggle') {
                return ToolComponents.yesNoToggle(q.id, q.label);
            }
            return '';
        }).join('');

        container.innerHTML = `
            <p class="bf-section-title">Questionnaire</p>
            <div class="bf-questions" id="bfQuestions">${questionsHTML}</div>
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

        // Yes / No button clicks (delegated)
        container.addEventListener('click', e => {
            const btn = e.target.closest('.tc-toggle-btn');
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

    function _updateResults() {
        const resultsEl = document.getElementById('bfResults');
        if (!resultsEl) return;

        const result = BroadformData.rules.evaluate(
            _answers.state,
            _answers.ownedAuto,
            _answers.regularAccess
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
                .map(c => ToolComponents.carrierCard(c))
                .join('');
            resultsEl.innerHTML = `
                <p class="bf-results-title">Available Carriers</p>
                <div class="bf-carrier-grid">${cardsHTML}</div>
            `;
        }
    }

    return { init };
})();
