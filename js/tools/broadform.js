/**
 * broadform.js
 * Carrier Recommendation Engine — Dynamic UI module.
 *
 * Three-panel layout:
 *   1. LOB pills + State dropdown
 *   2. AI Info Dump  — paste raw client notes → AI extracts structured data
 *   3. Known Data Chips + Dynamic Questionnaire — only asks what's still missing
 *   4. Carrier Result Cards — real-time, re-evaluated on every answer change
 *
 * Stateless — answers are held in memory; no localStorage.
 * Depends on: window.ToolComponents   (js/tools/_tool-components.js)
 *             window.BroadformData    (js/tools/broadform-data.js)
 *             window.BroadformEngine  (js/tools/broadform-engine.js)
 *             window.Utils            (js/utils.js)
 *             window.AIProvider       (js/ai-provider.js)   — optional for info dump
 *
 * Exposes: window.Broadform  (matches initModule in toolConfig)
 */
window.Broadform = (() => {
    'use strict';

    const TC = () => window.ToolComponents;
    const DATA = () => window.BroadformData;
    const ENGINE = () => window.BroadformEngine;

    // ── Private state (reset on every init) ──────────────────────────────────
    let _selectedLob = 'auto';
    let _profile = {};           // Current ClientProfile (partial)
    let _aiParsing = false;      // True while AI is processing info dump

    // ── Public ───────────────────────────────────────────────────────────────

    function init() {
        _selectedLob = 'auto';
        _profile = {};
        _aiParsing = false;

        // Pre-populate from intake form if available
        if (window.BroadformEngine && window.App && window.App.data) {
            _profile = ENGINE().buildProfileFromAppData();
        }

        _buildUI();
    }

    // ── UI Build ─────────────────────────────────────────────────────────────

    function _buildUI() {
        const container = document.getElementById('bfContainer');
        if (!container) return;

        const data = DATA();
        if (!data) return;

        // LOB pill bar
        const lobBarHTML = data.linesOfBusiness.map(lob => {
            const active = lob.id === _selectedLob ? ' tc-toggle-active' : '';
            return `<button class="tc-toggle-btn${active}" data-lob="${Utils.escapeAttr(lob.id)}" aria-pressed="${lob.id === _selectedLob}">${Utils.escapeHTML(lob.label)}</button>`;
        }).join('');

        // Info dump area
        const infoDumpHTML = `
            <div class="bf-info-dump">
                <p class="bf-section-title">Quick Fill — Paste Client Notes</p>
                <p class="bf-info-subtitle">Paste raw client notes, emails, or dec page text. AI will extract underwriting data automatically.</p>
                <textarea class="bf-info-textarea" id="bfInfoDump" placeholder="Paste client notes here... e.g. 'John Smith, lives in Tacoma WA, roof replaced 2019, has a pool, German Shepherd, home built 1985, been with Safeco 3 years.'" rows="3"></textarea>
                <div class="bf-info-actions">
                    <button class="bf-btn bf-btn-primary" id="bfParseAI" title="Extract data from notes using AI">
                        <span class="bf-btn-icon">✨</span> Parse with AI
                    </button>
                    <button class="bf-btn bf-btn-secondary" id="bfPullForm" title="Pull data from the intake form">
                        <span class="bf-btn-icon">📋</span> Pull from Form
                    </button>
                </div>
                <div id="bfAIStatus" class="bf-ai-status" style="display:none;"></div>
            </div>
        `;

        // Known data chips (from profile)
        const chipsHTML = _buildChipsHTML();

        // Dynamic questionnaire (only missing fields for current LOB)
        const questionsHTML = _buildQuestionsHTML();

        // Carrier results
        const resultsHTML = _buildResultsHTML();

        container.innerHTML = `
            <div id="bfLobBar" class="bf-lob-bar" role="group" aria-label="Line of business">
                ${lobBarHTML}
            </div>

            ${infoDumpHTML}

            <div id="bfChipsArea" class="bf-known-data">
                ${chipsHTML}
            </div>

            <div id="bfQuestionsArea">
                ${questionsHTML}
            </div>

            <div class="bf-results" id="bfResults" aria-live="polite">
                ${resultsHTML}
            </div>

            <div class="bf-footer-actions">
                <button id="bfResetBtn" class="bf-btn bf-btn-ghost">Reset All</button>
            </div>

            <details class="bf-rule-editor" id="bfRuleEditor">
                <summary class="bf-rule-editor-toggle">
                    <span class="bf-rule-editor-icon">⚙️</span> Edit Carrier Rules
                    ${_hasOverrides() ? '<span class="bf-rule-badge">Modified</span>' : ''}
                </summary>
                <div class="bf-rule-editor-body">
                    <p class="bf-rule-editor-hint">Describe rule changes in plain English and AI will update the carrier knowledge base. Changes are saved locally.</p>
                    <textarea class="bf-info-textarea" id="bfRuleInput" placeholder="e.g. 'Safeco now accepts wood shake roofs in WA' or 'Change Progressive max roof age to 25 years' or 'Add USAA as a new carrier for home in WA with max roof age 20'" rows="3"></textarea>
                    <div class="bf-info-actions">
                        <button class="bf-btn bf-btn-primary" id="bfApplyRules">
                            <span class="bf-btn-icon">✨</span> Apply with AI
                        </button>
                        <button class="bf-btn bf-btn-secondary" id="bfViewRules" title="View current carrier rules">
                            <span class="bf-btn-icon">📖</span> View Current Rules
                        </button>
                        <button class="bf-btn bf-btn-ghost" id="bfResetRules" title="Reset all rules to defaults"${_hasOverrides() ? '' : ' disabled'}>
                            Reset to Defaults
                        </button>
                    </div>
                    <div id="bfRuleStatus" class="bf-ai-status" style="display:none;"></div>
                    <pre id="bfRulePreview" class="bf-rule-preview" style="display:none;"></pre>
                </div>
            </details>
        `;

        _wireEvents(container);
    }

    // ── Chips: Display known profile data ────────────────────────────────────

    function _buildChipsHTML() {
        const data = DATA();
        if (!data) return '';

        const entries = [];
        for (const v of data.underwritingVariables) {
            const val = _profile[v.id];
            if (val === null || val === undefined || val === '') continue;
            let display = String(val);
            if (typeof val === 'boolean') display = val ? 'Yes' : 'No';
            entries.push({ id: v.id, label: v.label, value: display });
        }

        if (entries.length === 0) return '';

        const chips = entries.map(e =>
            `<span class="bf-chip" data-field="${Utils.escapeAttr(e.id)}">
                <span class="bf-chip-label">${Utils.escapeHTML(e.label)}:</span>
                <span class="bf-chip-value">${Utils.escapeHTML(e.value)}</span>
                <button class="bf-chip-remove" data-remove="${Utils.escapeAttr(e.id)}" title="Clear this value" aria-label="Remove ${Utils.escapeAttr(e.label)}">&times;</button>
            </span>`
        ).join('');

        return `
            <p class="bf-section-title">Known Data</p>
            <div class="bf-chip-list">${chips}</div>
        `;
    }

    // ── Dynamic Questions: Only unknown fields ───────────────────────────────

    function _buildQuestionsHTML() {
        const engine = ENGINE();
        const data = DATA();
        if (!engine || !data) return '';

        const result = engine.evaluate(_profile, _selectedLob);
        const missing = result.missingFields || [];
        if (missing.length === 0 && _profile.state) return '';

        const html = missing.map(v => {
            if (v.type === 'stateDropdown') {
                return TC().stateDropdown(v.id, v.label, v.states || data.supportedStates);
            }
            if (v.type === 'yesNoToggle') {
                return TC().yesNoToggle(v.id, v.label);
            }
            if (v.type === 'number') {
                return TC().numberInput(v.id, v.label, v);
            }
            if (v.type === 'text') {
                return TC().textInput(v.id, v.label, v);
            }
            if (v.type === 'select' && v.options) {
                return TC().selectDropdown(v.id, v.label, v.options);
            }
            // Fallback: text input
            return TC().textInput(v.id, v.label, v);
        }).join('');

        if (!html) return '';
        return `<p class="bf-section-title">Still Needed</p><div class="bf-questions">${html}</div>`;
    }

    // ── Results: Carrier cards ───────────────────────────────────────────────

    function _buildResultsHTML() {
        const engine = ENGINE();
        if (!engine) return '';

        const result = engine.evaluate(_profile, _selectedLob);

        // Don't show results if no state selected
        if (!_profile.state) return '';

        const sections = [];

        // Eligible carriers
        if (result.eligible.length) {
            const cards = result.eligible.map(c =>
                TC().enhancedCarrierCard({ name: c.name, status: 'ready', note: c.note })
            ).join('');
            sections.push(`<p class="bf-results-title">Ready to Quote</p><div class="bf-carrier-grid">${cards}</div>`);
        }

        // Pending carriers
        if (result.pending.length) {
            const cards = result.pending.map(c => {
                const missingLabels = (c.missingFields || []).map(fid => {
                    const v = DATA().variableById[fid];
                    return v ? v.label : fid;
                });
                return TC().enhancedCarrierCard({
                    name: c.name, status: 'pending',
                    missingFields: missingLabels, note: c.note,
                });
            }).join('');
            sections.push(`<p class="bf-results-title">Needs More Info</p><div class="bf-carrier-grid">${cards}</div>`);
        }

        // Refer out
        if (result.referOut.length) {
            const cards = result.referOut.map(c =>
                TC().enhancedCarrierCard({ name: c.name, status: 'referOut', note: c.note })
            ).join('');
            sections.push(`<p class="bf-results-title">Refer Out</p><div class="bf-carrier-grid">${cards}</div>`);
        }

        // Disqualified carriers
        if (result.disqualified.length) {
            const cards = result.disqualified.map(c =>
                TC().enhancedCarrierCard({
                    name: c.name, status: 'disqualified',
                    reasons: c.reasons, note: c.note,
                })
            ).join('');
            sections.push(`<p class="bf-results-title">Not Eligible</p><div class="bf-carrier-grid">${cards}</div>`);
        }

        if (sections.length === 0 && _profile.state) {
            return `<p class="bf-results-title">No carriers found for ${Utils.escapeHTML(_selectedLob)} in ${Utils.escapeHTML(_profile.state)}</p>`;
        }

        return sections.join('');
    }

    // ── Incremental re-render helpers ────────────────────────────────────────

    function _refreshChips() {
        const area = document.getElementById('bfChipsArea');
        if (area) area.innerHTML = _buildChipsHTML();
    }

    function _refreshQuestions() {
        const area = document.getElementById('bfQuestionsArea');
        if (area) area.innerHTML = _buildQuestionsHTML();
    }

    function _refreshResults() {
        const area = document.getElementById('bfResults');
        if (area) area.innerHTML = _buildResultsHTML();
    }

    function _refreshAll() {
        _refreshChips();
        _refreshQuestions();
        _refreshResults();
    }

    // ── Event Wiring ─────────────────────────────────────────────────────────

    function _wireEvents(container) {
        container.addEventListener('change', e => {
            // State / select dropdown
            if (e.target.matches('.tc-state-select')) {
                const id = e.target.dataset.id;
                const val = e.target.value;
                _profile[id] = val === '' ? null : val;
                _refreshAll();
                return;
            }
            // Number input
            if (e.target.matches('.tc-number-input')) {
                const id = e.target.dataset.id;
                const val = e.target.value;
                _profile[id] = val === '' ? null : parseFloat(val);
                _refreshAll();
                return;
            }
            // Text input
            if (e.target.matches('.tc-text-input')) {
                const id = e.target.dataset.id;
                const val = e.target.value.trim();
                _profile[id] = val === '' ? null : val;
                _refreshAll();
                return;
            }
        });

        // Debounce text/number inputs for real-time update
        container.addEventListener('input', Utils.debounce(e => {
            if (e.target.matches('.tc-number-input, .tc-text-input')) {
                const id = e.target.dataset.id;
                let val = e.target.value;
                if (e.target.matches('.tc-number-input')) {
                    val = val === '' ? null : parseFloat(val);
                } else {
                    val = val.trim() === '' ? null : val.trim();
                }
                _profile[id] = val;
                _refreshResults();
            }
        }, 400));

        container.addEventListener('click', e => {
            // LOB pill bar
            const lobBtn = e.target.closest('[data-lob]');
            if (lobBtn) {
                _selectedLob = lobBtn.dataset.lob;
                // Re-render LOB pills active state
                const bar = document.getElementById('bfLobBar');
                if (bar) {
                    bar.querySelectorAll('.tc-toggle-btn').forEach(b => {
                        const active = b.dataset.lob === _selectedLob;
                        b.classList.toggle('tc-toggle-active', active);
                        b.setAttribute('aria-pressed', String(active));
                    });
                }
                _refreshAll();
                return;
            }

            // Reset button
            if (e.target.matches('#bfResetBtn')) {
                _profile = {};
                _selectedLob = 'auto';
                _buildUI();
                return;
            }

            // Remove chip
            const removeBtn = e.target.closest('.bf-chip-remove');
            if (removeBtn) {
                const field = removeBtn.dataset.remove;
                delete _profile[field];
                _refreshAll();
                return;
            }

            // Parse with AI
            if (e.target.closest('#bfParseAI')) {
                _parseWithAI();
                return;
            }

            // Pull from Form
            if (e.target.closest('#bfPullForm')) {
                _pullFromForm();
                return;
            }

            // Rule editor buttons
            if (e.target.closest('#bfApplyRules')) {
                _applyRulesWithAI();
                return;
            }
            if (e.target.closest('#bfViewRules')) {
                _viewRules();
                return;
            }
            if (e.target.closest('#bfResetRules')) {
                _resetRules();
                return;
            }

            // Yes / No toggle buttons
            const btn = e.target.closest('.tc-toggle-btn[data-id]');
            if (!btn) return;

            const { id, value } = btn.dataset;
            _profile[id] = (value === 'yes');

            // Update visual state
            const group = btn.closest('.tc-toggle-group');
            if (group) {
                group.querySelectorAll('.tc-toggle-btn').forEach(b => {
                    b.classList.remove('tc-toggle-active');
                    b.setAttribute('aria-pressed', 'false');
                });
            }
            btn.classList.add('tc-toggle-active');
            btn.setAttribute('aria-pressed', 'true');

            _refreshAll();
        });
    }

    // ── AI Info Dump Parser ──────────────────────────────────────────────────

    async function _parseWithAI() {
        const textarea = document.getElementById('bfInfoDump');
        const statusEl = document.getElementById('bfAIStatus');
        if (!textarea || !statusEl) return;

        const notes = textarea.value.trim();
        if (!notes) {
            _showAIStatus(statusEl, 'warning', 'Paste some client notes first.');
            return;
        }

        const AIProvider = window.AIProvider;
        if (!AIProvider) {
            _showAIStatus(statusEl, 'error', 'AI provider not available. Enter data manually.');
            return;
        }

        if (_aiParsing) return;
        _aiParsing = true;

        const parseBtn = document.getElementById('bfParseAI');
        if (parseBtn) {
            parseBtn.disabled = true;
            parseBtn.innerHTML = '<span class="bf-btn-icon bf-spin">⏳</span> Parsing…';
        }
        _showAIStatus(statusEl, 'info', 'Analyzing client notes…');

        try {
            const systemPrompt = DATA().aiSystemPrompt;
            const userMessage = `Extract underwriting data from the following client notes. Return ONLY a JSON object with the ClientProfile fields. If a field cannot be determined, omit it.\n\nClient Notes:\n${notes}`;

            const response = await AIProvider.ask(systemPrompt, userMessage, {
                temperature: 0.1,
                maxTokens: 1024,
                responseFormat: 'json',
            });

            if (!response) throw new Error('Empty response from AI');

            // Parse JSON response (handle markdown code fences)
            let parsed;
            const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            parsed = JSON.parse(jsonStr);

            // Merge extracted data into profile (only fill nulls)
            const engine = ENGINE();
            _profile = engine ? engine.mergeProfile(_profile, parsed) : Object.assign({}, _profile, parsed);

            const fieldCount = Object.keys(parsed).filter(k => parsed[k] !== null && parsed[k] !== undefined).length;
            _showAIStatus(statusEl, 'success', `Extracted ${fieldCount} field${fieldCount !== 1 ? 's' : ''} from notes.`);

            _refreshAll();
        } catch (err) {
            _showAIStatus(statusEl, 'error', 'Could not parse notes. Try rewording or enter data manually.');
        } finally {
            _aiParsing = false;
            if (parseBtn) {
                parseBtn.disabled = false;
                parseBtn.innerHTML = '<span class="bf-btn-icon">✨</span> Parse with AI';
            }
        }
    }

    function _pullFromForm() {
        const engine = ENGINE();
        if (!engine) return;

        const fromForm = engine.buildProfileFromAppData();
        const merged = engine.mergeProfile(_profile, fromForm);
        const newFields = Object.keys(merged).length - Object.keys(_profile).length;
        _profile = merged;

        _refreshAll();

        const statusEl = document.getElementById('bfAIStatus');
        if (statusEl) {
            if (newFields > 0) {
                _showAIStatus(statusEl, 'success', `Pulled ${newFields} new field${newFields !== 1 ? 's' : ''} from intake form.`);
            } else {
                _showAIStatus(statusEl, 'info', 'No additional data found in intake form.');
            }
        }
    }

    function _showAIStatus(el, type, msg) {
        el.style.display = 'block';
        el.className = 'bf-ai-status bf-ai-status-' + type;
        el.textContent = msg;
        if (type === 'success' || type === 'info') {
            setTimeout(() => { if (el) el.style.display = 'none'; }, 4000);
        }
    }

    // ── Rule Editor Helpers ──────────────────────────────────────────────────

    function _hasOverrides() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.CARRIER_OVERRIDES);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            return obj && typeof obj === 'object' && Object.keys(obj).length > 0;
        } catch { return false; }
    }

    function _viewRules() {
        const data = DATA();
        if (!data) return;
        const preview = document.getElementById('bfRulePreview');
        if (!preview) return;
        const summary = data.getCarrierSummary();
        preview.textContent = JSON.stringify(summary, null, 2);
        preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
    }

    function _resetRules() {
        const data = DATA();
        if (!data) return;
        data.resetOverrides();
        localStorage.removeItem(STORAGE_KEYS.CARRIER_OVERRIDES);
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) CloudSync.schedulePush();
        _buildUI();
        const statusEl = document.getElementById('bfRuleStatus');
        if (statusEl) _showAIStatus(statusEl, 'success', 'Rules reset to defaults.');
    }

    async function _applyRulesWithAI() {
        const textarea = document.getElementById('bfRuleInput');
        const statusEl = document.getElementById('bfRuleStatus');
        const applyBtn = document.getElementById('bfApplyRules');
        if (!textarea || !statusEl) return;

        const instructions = textarea.value.trim();
        if (!instructions) {
            _showAIStatus(statusEl, 'warning', 'Describe a rule change first.');
            return;
        }

        const AIProvider = window.AIProvider;
        if (!AIProvider) {
            _showAIStatus(statusEl, 'error', 'AI provider not available.');
            return;
        }

        const data = DATA();
        if (!data) return;

        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<span class="bf-btn-icon bf-spin">⏳</span> Applying…';
        }
        _showAIStatus(statusEl, 'info', 'AI is interpreting your rule changes…');

        try {
            const currentRules = JSON.stringify(data.getCarrierSummary(), null, 2);
            const systemPrompt = `You are a carrier underwriting rules editor. You will receive the current carrier knowledge base and the user's requested changes. Return ONLY a valid JSON object representing the overrides to apply.

The overrides object shape is:
{
  "<carrierKey>": {
    "<lob>": {
      "states": ["WA","OR"],        // optional: replace supported states
      "rules": [                    // optional: replace/add rules array
        { "field": "<fieldName>", "op": "<operator>", "value": <val>, "reason": "..." }
      ],
      "note": "...",                // optional: update carrier note
      "referOutNote": "..."         // optional: update refer-out note
    }
  }
}

Operators: eq, neq, lt, lte, gt, gte, in, notIn, notInFuzzy
Fields: state, roofAge, yearBuilt, roofType, heatingType, constructionType, foundationType, dwellingType, creditTier, claimCount, pool, trampoline, dogBreed, sqFt, homeAge, protectionClass, priorInsurance, priorLapse

Carrier keys: progressive, dairyland, safeco, pemco, nationalGeneral, foremost
LOBs: auto, home, umbrella

Important rules:
- Only include carriers/LOBs that the user wants to change
- For rule changes, include ALL rules for that carrier+LOB (not just the changed ones)
- If adding a new carrier, use a camelCase key and include all fields
- Return ONLY the JSON — no markdown, no explanation`;

            const userMessage = `Current carrier rules:\n${currentRules}\n\nRequested changes:\n${instructions}`;

            const response = await AIProvider.ask(systemPrompt, userMessage, {
                temperature: 0.1,
                maxTokens: 4096,
                responseFormat: 'json',
            });

            if (!response) throw new Error('Empty AI response');

            const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            const overrides = JSON.parse(jsonStr);

            if (!overrides || typeof overrides !== 'object' || Object.keys(overrides).length === 0) {
                throw new Error('AI returned empty overrides');
            }

            // Merge with existing overrides
            let existing = {};
            try {
                const raw = localStorage.getItem(STORAGE_KEYS.CARRIER_OVERRIDES);
                if (raw) existing = JSON.parse(raw);
            } catch { /* ignore */ }

            for (const [carrier, lobs] of Object.entries(overrides)) {
                if (!existing[carrier]) existing[carrier] = {};
                for (const [lob, changes] of Object.entries(lobs)) {
                    existing[carrier][lob] = changes;
                }
            }

            localStorage.setItem(STORAGE_KEYS.CARRIER_OVERRIDES, JSON.stringify(existing));
            data.applyOverrides(existing);
            if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) CloudSync.schedulePush();

            const carrierCount = Object.keys(overrides).length;
            _showAIStatus(statusEl, 'success', `Updated rules for ${carrierCount} carrier${carrierCount !== 1 ? 's' : ''}.`);
            textarea.value = '';

            // Show updated rules and refresh results
            const preview = document.getElementById('bfRulePreview');
            if (preview) {
                preview.textContent = JSON.stringify(data.getCarrierSummary(), null, 2);
                preview.style.display = 'block';
            }
            _refreshResults();

            // Update badge + reset button state
            const editor = document.getElementById('bfRuleEditor');
            if (editor) {
                const toggle = editor.querySelector('.bf-rule-editor-toggle');
                if (toggle && !toggle.querySelector('.bf-rule-badge')) {
                    toggle.insertAdjacentHTML('beforeend', ' <span class="bf-rule-badge">Modified</span>');
                }
                const resetBtn = document.getElementById('bfResetRules');
                if (resetBtn) resetBtn.disabled = false;
            }
        } catch (err) {
            _showAIStatus(statusEl, 'error', 'Could not apply changes. Try rewording your request.');
        } finally {
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.innerHTML = '<span class="bf-btn-icon">✨</span> Apply with AI';
            }
        }
    }

    return { init };
})();
