/**
 * IntakeAssist — Conversational AI Intake Assistant (Enhanced)
 *
 * Lets agents describe a client in natural language.
 * Uses AIProvider.chat() for multi-turn conversation to collect
 * all insurance intake fields, then populates the main intake form.
 *
 * Storage key: altech_intake_assist (chat history across sessions)
 *
 * Phases:
 *   1. Historical Market Intelligence (auto after property intel)
 *   2. Satellite Hazard Detection (chip-triggered)
 *   3. Document Intelligence Upload (paperclip button)
 *   4. Insurance Rate Trend Panel (auto after property intel)
 *   5. Conversation Intelligence (dynamic system prompt)
 *   6. UI Polish (inline edit, copy, progress colors, section dots)
 */
window.IntakeAssist = (() => {
    'use strict';

    const STORAGE_KEY = STORAGE_KEYS.INTAKE_ASSIST;
    const MAX_CHAT_HISTORY = 100;
    let chatHistory = [];    // [{ role: 'user'|'assistant', content: string }]
    let extractedData = {};

    // ── Enhanced state (Phases 1-6) ─────────────────────────────
    let propertyIntel = null;      // Property intelligence data
    let marketIntel = null;        // Phase 1: Historical market analysis
    let insuranceTrends = null;    // Phase 4: Insurance rate trends
    let satelliteData = null;      // Phase 2: Satellite hazard scan results
    let riskFlags = [];            // Accumulated risk warnings
    let _propertyIntelLoaded = false;
    let _marketIntelLoaded = false;
    let _satelliteScanDone = false;
    let _propertyIntelFetching = false;
    let _docInputWired = false;
    let initialized = false;
    let _addressEnrichCache = {};  // Cache for county/zip lookups by city,state
    let _completionShown = false;  // Whether completion message has been shown

    // BASE_SYSTEM_PROMPT + dynamic prompt builder live in intake-assist-prompts.js.
    // This shim keeps the old name so internal call sites don't need to change.
    function _buildSystemPrompt() {
        const appData = (typeof App !== 'undefined' && App && App.data) ? App.data : {};
        return window.IntakeAssistPrompts.build(extractedData, riskFlags, appData);
    }


    // ── Public API ────────────────────────────────────────────────

    function init() {
        if (initialized) {
            _syncFromStorage();
            _renderAll();
            return;
        }
        initialized = true;
        _syncFromStorage();
        _renderAll();

        const input = document.getElementById('iaInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            input.addEventListener('input', () => _autoResize(input));
            input.focus();
        }

        // Phase 3: Wire document upload
        _wireDocUpload();
    }

    async function sendMessage() {
        const input = document.getElementById('iaInput');
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        _autoResize(input);

        _appendMsg('user', text);
        chatHistory.push({ role: 'user', content: text });
        _saveHistory();

        _showTyping();

        // Hide suggestion chips while AI is thinking
        const _chipRow = document.getElementById('iaChipRow');
        if (_chipRow) { _chipRow.innerHTML = ''; _chipRow.style.display = 'none'; }

        try {
            // Enrich: detect VINs and decode via NHTSA before sending to AI
            const vinEnrichment = await _enrichVINs(text);
            if (vinEnrichment) {
                // Inject decoded VIN data as a system-level note the AI can use
                chatHistory.push({ role: 'user', content: vinEnrichment });
            }

            const aiAvailable = typeof AIProvider !== 'undefined' && (AIProvider.isConfigured() || await AIProvider.isAvailable());
            if (!aiAvailable) {
                _hideTyping();
                _appendMsg('ai', '⚠️ Smart features are not configured. Open **Settings → Smart Features** and add your API key.');
                _updateSuggestionChips();
                return;
            }

            const result = await AIProvider.chat(_buildSystemPrompt(), chatHistory, {
                temperature: 0.35,
                maxTokens: 1024
            });

            const reply = (result && result.text) ? result.text : '';
            chatHistory.push({ role: 'assistant', content: reply });
            _saveHistory();

            _hideTyping();
            _appendMsg('ai', reply);

            // Extract JSON if the AI included structured data
            const extracted = _tryExtractJSON(reply);
            if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
                extractedData = Object.assign(extractedData, extracted);
                _saveHistory();
                _updateIntelPanel();
                _syncToAppData();
                if (_checkCompletion() && !_completionShown) {
                    _showCompletionMessage();
                }
            }

            // Behind-the-scenes research: auto-resolve county/zip from city+state
            const addrEnrichment = await _enrichAddress();
            if (addrEnrichment) {
                chatHistory.push({ role: 'user', content: addrEnrichment });
                _saveHistory();
            }

            // Auto-fetch property intel when we have enough address data
            _fetchPropertyIntel();

            _updateSuggestionChips();
        } catch (err) {
            _hideTyping();
            _appendMsg('ai', '⚠️ ' + (err.message || 'Could not reach service. Please check your settings.'));
            _updateSuggestionChips();
        }
    }

    /** Pre-fill input with a quick-start message and auto-send */
    function quickStart(coverageType) {
        const input = document.getElementById('iaInput');
        if (!input) return;
        input.value = 'New ' + coverageType + ' quote.';
        _autoResize(input);
        sendMessage();
    }

    /** Signal to the AI to apply collected data (used by the Done chip) */
    function applyAndSend() {
        const input = document.getElementById('iaInput');
        if (!input) return;
        input.value = "That's all the information I have. Please apply the data.";
        sendMessage();
    }

    /** Apply extracted data to the main intake form and navigate there */
    function populateForm() {
        if (!extractedData || Object.keys(extractedData).length === 0) {
            _toast('No data yet — continue the conversation first!');
            return;
        }

        let populated = 0;

        // AI key → form field ID mapping (for keys that don't match)
        const AI_TO_FORM = {
            yearBuilt: 'yrBuilt',
            stories: 'numStories',
            constructionType: 'constructionStyle',
            constructionStyle: 'constructionStyle',
            roofYear: 'roofYr',
        };

        // Simple text/date fields (AI key → auto-mapped to form ID)
        const simpleFields = [
            'firstName', 'lastName', 'middleName', 'dob', 'email', 'phone',
            'addrStreet', 'addrCity', 'addrZip', 'county',
            'yearBuilt', 'sqFt', 'stories', 'constructionType', 'constructionStyle',
            'roofYear', 'mortgagee', 'coFirstName', 'coLastName', 'coDob',
            'coOccupation',
            'effectiveDate', 'dwellingCoverage', 'homePriorExp',
            'lotSize', 'bedrooms',
            'purchaseDate', 'heatYr', 'plumbYr', 'elecYr',
        ];
        for (const key of simpleFields) {
            if (extractedData[key]) {
                const formId = AI_TO_FORM[key] || key;
                const el = document.getElementById(formId);
                if (el) {
                    el.value = extractedData[key];
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    populated++;
                }
            }
        }

        // Select/dropdown fields (set value + dispatch change)
        const selectFields = [
            'prefix', 'gender', 'maritalStatus',
            'education', 'occupation', 'industry', 'yearsAtAddress',
            'occupancyType', 'dwellingUsage', 'dwellingType', 'homePolicyType',
            'personalLiability', 'homeDeductible', 'windDeductible', 'theftDeductible',
            'medicalPayments',
            'exteriorWalls', 'foundation', 'roofType', 'roofShape',
            'heatingType', 'cooling', 'numStories',
            'pool', 'trampoline',
            'garageType', 'garageSpaces', 'numFireplaces', 'numOccupants',
            'fullBaths', 'halfBaths', 'fireHydrantFeet',
            'burglarAlarm', 'smokeDetector',
            'liabilityLimits', 'pdLimit', 'compDeductible', 'autoDeductible',
            'medPayments', 'umpdLimit', 'umLimits', 'residenceIs',
            'policyTerm', 'priorPolicyTerm',
            'priorLiabilityLimits', 'continuousCoverage',
            'homePriorCarrier', 'homePriorYears', 'homePriorPolicyTerm',
            'coGender', 'coRelationship', 'coIndustry', 'coMaritalStatus',
        ];
        for (const key of selectFields) {
            if (extractedData[key]) {
                const el = document.getElementById(key);
                if (el) {
                    // Normalize gender from AI (Male/Female) to form values (M/F) — applies to both applicant and co-applicant
                    let setValue = extractedData[key];
                    if (key === 'gender' || key === 'coGender') {
                        const g = String(setValue).trim().toLowerCase();
                        if (g === 'male' || g === 'm') setValue = 'M';
                        else if (g === 'female' || g === 'f') setValue = 'F';
                        else if (g === 'x' || g === 'not specified') setValue = 'X';
                    }
                    el.value = setValue;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    populated++;
                }
            }
        }

        // State <select> — match by 2-letter code or full name
        if (extractedData.addrState) {
            const el = document.getElementById('addrState');
            if (el) {
                const raw = extractedData.addrState.trim();
                const code = _resolveStateCode(raw);
                if (code) {
                    el.value = code;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    populated++;
                }
            }
        }

        // Quote type radio buttons (home / auto / both)
        if (extractedData.qType) {
            const radio = document.querySelector(`input[name="qType"][value="${extractedData.qType}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof App !== 'undefined' && typeof App.handleType === 'function') {
                    App.handleType();
                }
                populated++;
            }
        }

        // Accidents & violations (textarea fields)
        if (extractedData.accidents) {
            const el = document.getElementById('accidents');
            if (el) {
                el.value = extractedData.accidents === '0' ? 'None' : extractedData.accidents + ' accident(s) in last 5 years';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                populated++;
            }
        }
        if (extractedData.violations) {
            const el = document.getElementById('violations');
            if (el) {
                el.value = extractedData.violations === '0' ? 'None' : extractedData.violations + ' violation(s) in last 3 years';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                populated++;
            }
        }

        // Prior carrier + years (selects with text options)
        for (const key of ['priorCarrier', 'priorYears']) {
            if (extractedData[key]) {
                const el = document.getElementById(key);
                if (el) {
                    el.value = extractedData[key];
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    populated++;
                }
            }
        }

        // Vehicles — merge into App's vehicle array via app-vehicles.js
        if (Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0) {
            const vm = (typeof App !== 'undefined') ? App : null;
            if (vm && Array.isArray(vm.vehicles)) {
                for (const v of extractedData.vehicles) {
                    if (!v.vin && !v.year && !v.make) continue; // skip empty
                    const id = `vehicle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    const vehicle = {
                        id,
                        vin: v.vin || '',
                        year: v.year || '',
                        make: v.make || '',
                        model: v.model || '',
                        use: v.use || 'Commute',
                        miles: v.annualMiles || '12000',
                        ownershipType: v.ownershipType || 'Owned',
                        primaryDriver: ''
                    };
                    // Replace the default empty vehicle, or append
                    const emptyIdx = vm.vehicles.findIndex(ev => !ev.vin && !ev.year && !ev.make && !ev.model);
                    if (emptyIdx !== -1) {
                        vm.vehicles[emptyIdx] = vehicle;
                    } else {
                        vm.vehicles.push(vehicle);
                    }
                    populated++;
                }
                if (typeof vm.renderVehicles === 'function') vm.renderVehicles();
                if (typeof vm.saveDriversVehicles === 'function') vm.saveDriversVehicles();
            }
        }

        // Drivers — merge into App's driver array via app-vehicles.js
        if (Array.isArray(extractedData.drivers) && extractedData.drivers.length > 0) {
            const vm = (typeof App !== 'undefined') ? App : null;
            if (vm && Array.isArray(vm.drivers)) {
                // Gender normalization helper
                const _normGender = (g) => {
                    if (!g) return '';
                    const v = String(g).trim().toLowerCase();
                    if (v === 'male' || v === 'm') return 'M';
                    if (v === 'female' || v === 'f') return 'F';
                    if (v === 'x' || v === 'not specified') return 'X';
                    return g;
                };
                for (const d of extractedData.drivers) {
                    if (!d.firstName && !d.lastName && !d.dob) continue;
                    const id = `driver_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    const driver = {
                        id,
                        firstName: d.firstName || '',
                        lastName: d.lastName || '',
                        dob: d.dob || '',
                        gender: _normGender(d.gender),
                        maritalStatus: d.maritalStatus || '',
                        relationship: d.relationship || 'Self',
                        occupation: d.occupation || '',
                        industry: d.industry || '',
                        education: d.education || '',
                        dlStatus: d.dlStatus || '',
                        dlState: d.dlState || (extractedData.addrState || ''),
                        dlNum: d.dlNum || '',
                        ageLicensed: d.ageLicensed ? String(d.ageLicensed) : '',
                    };
                    // Inherit top-level applicant data for the Self driver
                    if (driver.relationship === 'Self' || extractedData.drivers.length === 1) {
                        if (!driver.gender && extractedData.gender) driver.gender = _normGender(extractedData.gender);
                        if (!driver.maritalStatus && extractedData.maritalStatus) driver.maritalStatus = extractedData.maritalStatus;
                        if (!driver.occupation && extractedData.occupation) driver.occupation = extractedData.occupation;
                        if (!driver.education && extractedData.education) driver.education = extractedData.education;
                        if (!driver.dlStatus && (driver.dlNum || driver.dlState)) driver.dlStatus = 'Valid';
                    }
                    const emptyIdx = vm.drivers.findIndex(ed => !ed.firstName && !ed.lastName && !ed.dob);
                    if (emptyIdx !== -1) {
                        vm.drivers[emptyIdx] = driver;
                    } else {
                        vm.drivers.push(driver);
                    }
                    populated++;
                }
                if (typeof vm.renderDrivers === 'function') vm.renderDrivers();
                if (typeof vm.saveDriversVehicles === 'function') vm.saveDriversVehicles();
            }
        }

        // Persist to App storage
        if (typeof App !== 'undefined' && typeof App.save === 'function') {
            App.save();
        }

        if (populated > 0) {
            _toast(`✅ ${populated} field${populated !== 1 ? 's' : ''} populated — review in the intake form.`);
            setTimeout(() => {
                if (typeof App !== 'undefined' && typeof App.navigateTo === 'function') {
                    App.navigateTo('quoting');
                }
            }, 900);
        } else {
            _toast('No matching fields found — try continuing the conversation.');
        }
    }

    /** Clear chat history and reset extracted data */
    function clearChat() {
        chatHistory = [];
        extractedData = {};
        propertyIntel = null;
        marketIntel = null;
        insuranceTrends = null;
        satelliteData = null;
        riskFlags = [];
        _propertyIntelLoaded = false;
        _marketIntelLoaded = false;
        _satelliteScanDone = false;
        _propertyIntelFetching = false;
        _addressEnrichCache = {};
        _completionShown = false;
        _dragCounter = 0;
        const _chatCard = document.querySelector('.ia-chat-card');
        if (_chatCard) _chatCard.classList.remove('ia-drag-over');
        _saveHistory();

        const msgs = document.getElementById('iaChatMessages');
        if (msgs) msgs.innerHTML = '';

        const preview = document.getElementById('iaExtractedPreview');
        if (preview) preview.style.display = 'none';

        _resetIntelPanel();
        _updateSuggestionChips();

        _appendMsg('ai', "Chat cleared! Tell me about your next client — start with their name and what coverage they need.");
    }

    // ── Private: rendering ────────────────────────────────────────

    function _renderAll() {
        const msgs = document.getElementById('iaChatMessages');
        if (!msgs) return;

        msgs.innerHTML = '';

        if (chatHistory.length === 0) {
            _appendMsg('ai', "Hi! 👋 I'm your intake assistant. Tell me about your client — start with their name and what type of insurance they need (home, auto, or both)!");
        } else {
            for (const m of chatHistory) {
                // Skip system enrichment notes (VIN decode, etc.) — AI-only context
                if (m.content && m.content.startsWith('[System note')) continue;
                _appendMsg(m.role === 'user' ? 'user' : 'ai', m.content, false);
            }
        }

        if (Object.keys(extractedData).length > 0) {
            _updateIntelPanel();
        }
        _updateSuggestionChips();
        // Scroll to bottom after restoring full chat history
        _scrollToBottom();
    }

    function _appendMsg(role, text, scroll = true) {
        const msgs = document.getElementById('iaChatMessages');
        if (!msgs) return;

        const div = document.createElement('div');
        div.className = 'ia-msg ia-msg-' + role;
        const displayText = role === 'ai' ? _stripJSONBlocks(text) : text;
        div.innerHTML = _renderMarkdown(displayText);
        msgs.appendChild(div);

        if (scroll) _scrollToBottom();
    }

    /** Reliably scroll messages to bottom, accounting for layout shifts from chips */
    function _scrollToBottom() {
        const msgs = document.getElementById('iaChatMessages');
        if (!msgs) return;
        // Immediate scroll
        msgs.scrollTop = msgs.scrollHeight;
        // Also scroll after next frame in case layout hasn't settled (chips rendering, etc.)
        requestAnimationFrame(() => {
            msgs.scrollTop = msgs.scrollHeight;
        });
    }

    function _renderMarkdown(text) {
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Code blocks
        html = html.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g,
            '<pre class="ia-code">$1</pre>');
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Inline code
        html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        // Line breaks
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    function _showTyping() {
        const msgs = document.getElementById('iaChatMessages');
        if (!msgs || document.getElementById('iaTypingIndicator')) return;

        const div = document.createElement('div');
        div.id = 'iaTypingIndicator';
        div.className = 'ia-msg ia-msg-ai ia-typing';
        div.innerHTML = '<span class="ia-dot"></span><span class="ia-dot"></span><span class="ia-dot"></span>';
        msgs.appendChild(div);
        _scrollToBottom();

        const btn = document.getElementById('iaSendBtn');
        if (btn) btn.disabled = true;
        const inp = document.getElementById('iaInput');
        if (inp) inp.disabled = true;
    }

    function _hideTyping() {
        const el = document.getElementById('iaTypingIndicator');
        if (el) el.remove();

        const btn = document.getElementById('iaSendBtn');
        if (btn) btn.disabled = false;
        const inp = document.getElementById('iaInput');
        if (inp) { inp.disabled = false; inp.focus(); }
    }

    function _renderPreview() {
        const container = document.getElementById('iaExtractedPreview');
        if (!container) return;

        const labels = {
            firstName: 'First Name', middleName: 'Middle Name', lastName: 'Last Name', prefix: 'Prefix',
            dob: 'Date of Birth', gender: 'Gender', maritalStatus: 'Marital Status',
            email: 'Email', phone: 'Phone',
            addrStreet: 'Street', addrCity: 'City', addrState: 'State', addrZip: 'Zip', county: 'County',
            education: 'Education', occupation: 'Occupation', industry: 'Industry',
            yearsAtAddress: 'Years at Address',
            qType: 'Quote Type', effectiveDate: 'Effective Date', policyTerm: 'Policy Term',
            occupancyType: 'Occupancy', dwellingUsage: 'Dwelling Usage', dwellingType: 'Dwelling Type',
            homePolicyType: 'Home Policy', dwellingCoverage: 'Dwelling Coverage',
            personalLiability: 'Personal Liability', homeDeductible: 'Home Deductible',
            windDeductible: 'Wind Deductible', theftDeductible: 'Theft Deductible',
            medicalPayments: 'Home Med Pay',
            yearBuilt: 'Year Built', sqFt: 'Sq Ft', stories: 'Stories',
            constructionStyle: 'Construction', constructionType: 'Construction',
            exteriorWalls: 'Exterior Walls', foundation: 'Foundation',
            roofType: 'Roof Type', roofShape: 'Roof Shape', roofYear: 'Roof Year', heatingType: 'Heating',
            cooling: 'Cooling', bedrooms: 'Bedrooms', fullBaths: 'Full Baths', halfBaths: 'Half Baths',
            lotSize: 'Lot Size', garageType: 'Garage Type', garageSpaces: 'Garage Spaces',
            numFireplaces: 'Fireplaces', numOccupants: 'Occupants',
            burglarAlarm: 'Burglar Alarm', smokeDetector: 'Smoke Detector',
            fireHydrantFeet: 'Hydrant Dist.',
            pool: 'Pool', trampoline: 'Trampoline', mortgagee: 'Mortgagee',
            liabilityLimits: 'Liability Limits', pdLimit: 'Property Damage',
            compDeductible: 'Comp Deductible', autoDeductible: 'Collision Deductible',
            medPayments: 'Auto Med Pay', umpdLimit: 'UMPD Limit',
            umLimits: 'UM/UIM Limits', residenceIs: 'Residence Type',
            coFirstName: 'Co-Applicant First', coLastName: 'Co-Applicant Last',
            coDob: 'Co-Applicant DOB', coGender: 'Co-Applicant Gender',
            coRelationship: 'Co-Applicant Relation',
            priorCarrier: 'Prior Carrier', priorYears: 'Prior Years',
            priorPolicyTerm: 'Prior Policy Term',
            priorLiabilityLimits: 'Prior Limits', continuousCoverage: 'Continuous Coverage',
            homePriorCarrier: 'Home Prior Carrier', homePriorYears: 'Home Prior Years',
            homePriorPolicyTerm: 'Home Prior Term', homePriorExp: 'Home Prior Exp',
            accidents: 'Accidents', violations: 'Violations'
        };

        const qType = extractedData.qType || '';
        const groups = FIELD_GROUPS.filter(g => {
            if ((g.label === 'Home Coverage' || g.label === 'Home Details') && qType === 'auto') return false;
            if ((g.label === 'Auto Coverage' || g.label === 'Vehicles' || g.label === 'Drivers') && qType === 'home') return false;
            return true;
        });

        let html = '';
        for (const g of groups) {
            const filled = g.keys.filter(k => _hasField(k)).length;
            if (filled === 0) continue;
            const total = g.keys.length;
            const done = filled === total;
            const statusClass = done ? 'ia-section-done' : 'ia-section-partial';

            let rowsHtml = '';
            for (const k of g.keys) {
                if (!_hasField(k)) continue;
                if (k === 'vehicles') {
                    for (const v of (extractedData.vehicles || [])) {
                        if (!v.vin && !v.year && !v.make) continue;
                        rowsHtml += `<div class="ia-section-field"><span class="ia-section-field-label">Vehicle</span><span class="ia-section-field-value">${_esc([v.year, v.make, v.model].filter(Boolean).join(' '))}</span></div>`;
                    }
                    continue;
                }
                if (k === 'drivers') {
                    for (const d of (extractedData.drivers || [])) {
                        if (!d.firstName && !d.lastName && !d.dob) continue;
                        rowsHtml += `<div class="ia-section-field"><span class="ia-section-field-label">Driver</span><span class="ia-section-field-value">${_esc([d.firstName, d.lastName].filter(Boolean).join(' '))}</span></div>`;
                    }
                    continue;
                }
                const val = extractedData[k] || (k === 'constructionStyle' ? extractedData.constructionType : '');
                if (!val) continue;
                // Phase 6a: inline edit pencil icon on simple fields
                rowsHtml += `<div class="ia-section-field" data-field-key="${k}"><span class="ia-section-field-label">${labels[k] || k}</span><span class="ia-section-field-value">${_esc(String(val))}</span><button class="ia-field-edit-btn" onclick="IntakeAssist._editField('${k}')" title="Edit" aria-label="Edit ${labels[k] || k}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></div>`;
            }

            html += `<div class="ia-section ${statusClass}" data-section-label="${g.label}">
                <button class="ia-section-header" onclick="this.parentElement.classList.toggle('ia-collapsed')">
                    <span class="ia-section-icon">${g.icon}</span>
                    <span class="ia-section-title">${g.label}</span>
                    <span class="ia-section-badge">${filled}/${total}</span>
                    <svg class="ia-section-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="ia-section-body">${rowsHtml}</div>
            </div>`;
        }

        container.innerHTML = html;
        container.style.display = html ? '' : 'none';

        // Phase 2: re-render hazard badges if satellite data exists
        if (satelliteData) {
            _renderHazardBadges(satelliteData);
        }
    }

    /** Check if a field has data (handles arrays and construction aliases) */
    function _hasField(k) {
        if (k === 'vehicles') {
            return Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0
                && (extractedData.vehicles[0].vin || extractedData.vehicles[0].year || extractedData.vehicles[0].make);
        }
        if (k === 'drivers') {
            return Array.isArray(extractedData.drivers) && extractedData.drivers.length > 0
                && (extractedData.drivers[0].firstName || extractedData.drivers[0].dob || extractedData.drivers[0].dlNum);
        }
        if (k === 'constructionStyle' || k === 'constructionType') {
            return !!(extractedData.constructionStyle || extractedData.constructionType);
        }
        return !!extractedData[k];
    }

    // ── Private: helpers ──────────────────────────────────────────

    function _tryExtractJSON(text) {
        // Prefer AIProvider.extractJSON if available
        if (typeof AIProvider !== 'undefined' && typeof AIProvider.extractJSON === 'function') {
            return AIProvider.extractJSON(text);
        }
        // Fallback: code-fenced JSON
        const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
        // Fallback: bare JSON object
        const obj = text.match(/\{[\s\S]*\}/);
        if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
        return null;
    }

    function _autoResize(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function _saveHistory() {
        try {
            if (chatHistory.length > MAX_CHAT_HISTORY) {
                chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY);
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ history: chatHistory, data: extractedData }));
        } catch (_) {}
    }

    function _syncFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                chatHistory = Array.isArray(parsed.history) ? parsed.history : [];
                extractedData = (parsed.data && typeof parsed.data === 'object') ? parsed.data : {};
            }
        } catch (_) {
            chatHistory = [];
            extractedData = {};
        }
    }

    function _esc(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * Detect VIN patterns in user text and decode via NHTSA API.
     * Returns an enrichment string to inject into the chat context,
     * or null if no VINs found.
     */
    async function _enrichVINs(text) {
        // VIN regex: 17 alphanumeric chars (no I, O, Q)
        const vinRegex = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;
        const matches = [...new Set((text.match(vinRegex) || []).map(v => v.toUpperCase()))];
        if (matches.length === 0) return null;

        const results = [];
        for (const vin of matches) {
            try {
                const decoded = await _decodeVIN(vin);
                if (decoded) {
                    results.push(`VIN ${vin} → ${decoded.year} ${decoded.make} ${decoded.model}`);
                }
            } catch (_) {
                // Silently skip failed decodes — AI can still ask
            }
        }

        if (results.length === 0) return null;
        return `[System note — VIN decoded from NHTSA database: ${results.join('; ')}. Use this data directly, do not ask for year/make/model.]`;
    }

    /** Call NHTSA vPIC API to decode a VIN. Returns { year, make, model } or null. */
    async function _decodeVIN(vin) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
            const resp = await fetch(
                `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            if (!resp.ok) return null;

            const data = await resp.json();
            const r = data?.Results?.[0];
            if (!r || !r.ModelYear) return null;

            return {
                year: r.ModelYear || '',
                make: r.Make || '',
                model: r.Model || ''
            };
        } catch (_) {
            clearTimeout(timeoutId);
            return null;
        }
    }

    /**
     * After the AI replies with extracted JSON, look up missing address fields
     * (county, zip) behind the scenes and inject a system note so the AI never
     * has to ask the user for publicly available geographic data.
     */
    async function _enrichAddress() {
        const city = extractedData.addrCity;
        const state = extractedData.addrState;

        // Need at least city + state to do any lookup
        if (!city || !state) return null;

        const needs = [];
        if (!extractedData.county) needs.push('county');
        if (!extractedData.addrZip) needs.push('zip');
        if (needs.length === 0) return null;

        // Build a lookup key to avoid re-fetching the same city
        const lookupKey = (city + ',' + state).toLowerCase();
        if (_addressEnrichCache[lookupKey]) {
            return _applyAddressEnrichment(_addressEnrichCache[lookupKey], needs);
        }

        try {
            // Use Census Geocoder (free, no key) — one-line address mode
            const addrStr = extractedData.addrStreet
                ? `${extractedData.addrStreet}, ${city}, ${state}`
                : `${city}, ${state}`;
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 6000);
            const url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'
                + '?address=' + encodeURIComponent(addrStr)
                + '&benchmark=Public_AR_Current&vintage=Current_Current&format=json';

            const resp = await fetch(url, { signal: controller.signal });
            clearTimeout(tid);
            if (!resp.ok) return null;

            const data = await resp.json();
            const match = data?.result?.addressMatches?.[0];
            if (!match) return null;

            const geo = match.geographies;
            const countyObj = geo?.Counties?.[0];
            const result = {
                county: countyObj?.BASENAME || countyObj?.NAME || null,
                zip: match.addressComponents?.zip || null,
            };

            _addressEnrichCache[lookupKey] = result;
            return _applyAddressEnrichment(result, needs);
        } catch (_) {
            return null; // Fail silently — AI can still ask if needed
        }
    }

    /** Apply looked-up address data and return a system note string */
    function _applyAddressEnrichment(result, needs) {
        const notes = [];
        if (needs.includes('county') && result.county) {
            extractedData.county = result.county;
            notes.push('county = ' + result.county);
        }
        if (needs.includes('zip') && result.zip) {
            extractedData.addrZip = result.zip;
            notes.push('zip = ' + result.zip);
        }
        if (notes.length === 0) return null;
        _saveHistory();
        _updateIntelPanel();
        return `[System note — Address enrichment from Census Geocoder: ${notes.join(', ')}. Use this data directly, do not ask the user for these fields.]`;
    }

    /** Resolve a US state to its 2-letter code. Accepts full names or abbreviations. */
    function _resolveStateCode(value) {
        const nameToCode = {
            'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
            'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
            'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
            'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
            'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
            'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
            'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
            'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
            'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
            'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
            'district of columbia':'DC'
        };
        const upper = value.toUpperCase().trim();
        // Already a 2-letter code
        if (/^[A-Z]{2}$/.test(upper)) return upper;
        // Full state name lookup
        return nameToCode[value.toLowerCase().trim()] || null;
    }

    function _toast(msg) {
        if (typeof App !== 'undefined' && typeof App.toast === 'function') {
            App.toast(msg);
        }
    }

    /** Sync extracted AI data to App.data in real-time (not just at populate time) */
    function _syncToAppData() {
        if (typeof App === 'undefined' || !App.data) return;

        // Normalize gender from AI output to form values (M/F/X)
        function _normalizeGender(g) {
            if (!g) return '';
            const val = String(g).trim().toLowerCase();
            if (val === 'male' || val === 'm') return 'M';
            if (val === 'female' || val === 'f') return 'F';
            if (val === 'x' || val === 'not specified' || val === 'nonbinary') return 'X';
            return g; // pass through if already correct
        }

        // AI extracted key → App.data form field key
        // ONLY include remappings where the AI JSON key differs from the form field ID
        const AI_TO_APP = {
            yearBuilt: 'yrBuilt',
            stories: 'numStories',
            roofYear: 'roofYr',
        };

        // Fields where AI JSON key matches the App.data / form field key directly
        const DIRECT = [
            // Personal
            'firstName', 'lastName', 'middleName', 'dob', 'gender', 'maritalStatus',
            'email', 'phone', 'county',
            'education', 'occupation', 'industry',
            // Address (AI key = form field ID)
            'addrStreet', 'addrCity', 'addrState', 'addrZip',
            // Home Details
            'dwellingType', 'dwellingUsage', 'occupancyType',
            'sqFt', 'constructionStyle', 'exteriorWalls', 'foundation',
            'roofType', 'roofShape', 'heatingType', 'cooling',
            'pool', 'trampoline', 'garageType', 'garageSpaces',
            'fireAlarm', 'sprinklers', 'protectionClass',
            'burglarAlarm', 'smokeDetector',
            'bedrooms', 'fullBaths', 'halfBaths', 'lotSize',
            'numOccupants', 'numFireplaces', 'fireHydrantFeet',
            'purchaseDate', 'heatYr', 'plumbYr', 'elecYr',
            // Home Coverage (AI key = form field ID)
            'homePolicyType', 'dwellingCoverage', 'personalLiability',
            'homeDeductible', 'windDeductible', 'theftDeductible',
            'medicalPayments', 'mortgagee',
            // Auto Coverage (AI key = form field ID)
            'liabilityLimits', 'pdLimit', 'compDeductible', 'autoDeductible',
            'medPayments', 'umpdLimit', 'umLimits', 'residenceIs',
            // Policy & History
            'effectiveDate', 'policyTerm', 'priorPolicyTerm',
            'priorCarrier', 'priorYears', 'priorLiabilityLimits', 'continuousCoverage',
            'homePriorCarrier', 'homePriorPolicyTerm', 'homePriorYears', 'homePriorExp',
            'yearsAtAddress',
            // Co-applicant (AI key = form field ID)
            'coFirstName', 'coLastName', 'coDob', 'coGender', 'coRelationship',
            'coOccupation', 'coIndustry', 'coMaritalStatus',
            // History
            'accidents', 'violations',
        ];

        let changed = false;

        for (const [aiKey, val] of Object.entries(extractedData)) {
            if (!val || aiKey === 'vehicles' || aiKey === 'drivers') continue;
            const formKey = AI_TO_APP[aiKey] || (DIRECT.includes(aiKey) ? aiKey : null);
            if (!formKey) continue;
            let normalizedVal = String(val);
            // Normalize gender values: Male→M, Female→F — applies to applicant AND co-applicant
            if (formKey === 'gender' || formKey === 'coGender') normalizedVal = _normalizeGender(val);
            if (App.data[formKey] !== normalizedVal) {
                App.data[formKey] = normalizedVal;
                changed = true;
            }
        }

        // Sync qType
        if (extractedData.qType && App.data.qType !== extractedData.qType) {
            App.data.qType = extractedData.qType;
            changed = true;
        }

        // Sync vehicles into App.vehicles
        if (Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0 && Array.isArray(App.vehicles)) {
            for (const v of extractedData.vehicles) {
                if (!v.vin && !v.year && !v.make) continue;
                const match = App.vehicles.find(ev =>
                    (v.vin && ev.vin === v.vin) ||
                    (v.year && v.make && ev.year === v.year && ev.make === v.make)
                );
                if (match) {
                    if (v.vin) match.vin = v.vin;
                    if (v.year) match.year = v.year;
                    if (v.make) match.make = v.make;
                    if (v.model) match.model = v.model;
                    if (v.use) match.use = v.use;
                    if (v.annualMiles) match.miles = v.annualMiles;
                    if (v.ownershipType) match.ownershipType = v.ownershipType;
                    changed = true;
                } else {
                    const id = 'vehicle_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    const emptyIdx = App.vehicles.findIndex(ev => !ev.vin && !ev.year && !ev.make && !ev.model);
                    const vehicle = {
                        id, vin: v.vin || '', year: v.year || '', make: v.make || '',
                        model: v.model || '', use: v.use || 'Commute',
                        miles: v.annualMiles || '12000', ownershipType: v.ownershipType || 'Owned',
                        primaryDriver: ''
                    };
                    if (emptyIdx !== -1) App.vehicles[emptyIdx] = vehicle;
                    else App.vehicles.push(vehicle);
                    changed = true;
                }
            }
        }

        // Sync drivers into App.drivers — includes ALL driver form fields
        if (Array.isArray(extractedData.drivers) && extractedData.drivers.length > 0 && Array.isArray(App.drivers)) {
            for (const d of extractedData.drivers) {
                if (!d.firstName && !d.lastName && !d.dob) continue;
                const match = App.drivers.find(ed =>
                    ed.firstName === d.firstName && ed.lastName === d.lastName
                );
                if (match) {
                    if (d.dob) match.dob = d.dob;
                    if (d.gender) match.gender = _normalizeGender(d.gender);
                    if (d.maritalStatus) match.maritalStatus = d.maritalStatus;
                    if (d.relationship) match.relationship = d.relationship;
                    if (d.occupation) match.occupation = d.occupation;
                    if (d.industry) match.industry = d.industry;
                    if (d.education) match.education = d.education;
                    if (d.dlStatus) match.dlStatus = d.dlStatus;
                    if (d.dlState) match.dlState = d.dlState;
                    if (d.dlNum) match.dlNum = d.dlNum;
                    if (d.ageLicensed) match.ageLicensed = String(d.ageLicensed);
                    changed = true;
                } else {
                    const id = 'driver_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    const emptyIdx = App.drivers.findIndex(ed => !ed.firstName && !ed.lastName && !ed.dob);
                    const driver = {
                        id, firstName: d.firstName || '', lastName: d.lastName || '',
                        dob: d.dob || '', gender: _normalizeGender(d.gender),
                        maritalStatus: d.maritalStatus || '',
                        relationship: d.relationship || 'Self',
                        occupation: d.occupation || '', industry: d.industry || '',
                        education: d.education || '',
                        dlStatus: d.dlStatus || '', dlState: d.dlState || (extractedData.addrState || ''),
                        dlNum: d.dlNum || '', ageLicensed: d.ageLicensed ? String(d.ageLicensed) : '',
                    };
                    if (emptyIdx !== -1) App.drivers[emptyIdx] = driver;
                    else App.drivers.push(driver);
                    changed = true;
                }
            }
        }

        // Propagate top-level applicant data to the primary (Self) driver
        if (Array.isArray(App.drivers) && App.drivers.length > 0) {
            const selfDriver = App.drivers.find(d => d.relationship === 'Self') || App.drivers[0];
            if (selfDriver) {
                // Inherit gender from main form if driver has none
                if (!selfDriver.gender && extractedData.gender) {
                    selfDriver.gender = _normalizeGender(extractedData.gender);
                    changed = true;
                }
                // Inherit marital status from main form if driver has none
                if (!selfDriver.maritalStatus && extractedData.maritalStatus) {
                    selfDriver.maritalStatus = extractedData.maritalStatus;
                    changed = true;
                }
                // Inherit occupation from top-level if driver has none
                if (!selfDriver.occupation && extractedData.occupation) {
                    selfDriver.occupation = extractedData.occupation;
                    changed = true;
                }
                // Inherit education from top-level if driver has none
                if (!selfDriver.education && extractedData.education) {
                    selfDriver.education = extractedData.education;
                    changed = true;
                }
                // If primary driver has no DL status, default to Valid (most common)
                if (!selfDriver.dlStatus && (selfDriver.dlNum || selfDriver.dlState)) {
                    selfDriver.dlStatus = 'Valid';
                    changed = true;
                }
            }
        }

        if (changed) {
            if (typeof App.save === 'function') App.save();
            if (typeof App.saveDriversVehicles === 'function') App.saveDriversVehicles();
            if (typeof CloudSync !== 'undefined' && typeof CloudSync.schedulePush === 'function') {
                CloudSync.schedulePush();
            }
        }
    }

    // ── Intelligence Panel (real-time visual context) ─────────────

    /** All trackable field categories with their keys and labels */
    const FIELD_GROUPS = [
        { label: 'Client', icon: '👤', keys: ['firstName', 'lastName', 'dob', 'gender', 'maritalStatus', 'education', 'occupation'] },
        { label: 'Contact', icon: '📞', keys: ['phone', 'email'] },
        { label: 'Address', icon: '📍', keys: ['addrStreet', 'addrCity', 'addrState', 'addrZip'] },
        { label: 'Policy', icon: '📋', keys: ['qType', 'effectiveDate'] },
        { label: 'Home Coverage', icon: '🏠', keys: ['homePolicyType', 'dwellingCoverage', 'personalLiability', 'homeDeductible', 'medicalPayments', 'theftDeductible', 'occupancyType'] },
        { label: 'Home Details', icon: '🏗️', keys: ['yearBuilt', 'sqFt', 'stories', 'roofType', 'roofShape', 'roofYear', 'foundation', 'cooling', 'bedrooms', 'garageType', 'lotSize'] },
        { label: 'Auto Coverage', icon: '📑', keys: ['liabilityLimits', 'compDeductible', 'autoDeductible', 'medPayments', 'umpdLimit', 'pdLimit'] },
        { label: 'Vehicles', icon: '🚗', keys: ['vehicles'] },
        { label: 'Drivers', icon: '🪪', keys: ['drivers'] },
        { label: 'History', icon: '📁', keys: ['priorCarrier', 'priorYears', 'yearsAtAddress', 'continuousCoverage', 'accidents', 'violations'] },
    ];

    /** AI-response triggers — when the AI asks about these topics, show quick-reply chips */
    const RESPONSE_TRIGGERS = [
        {
            pattern: /home\s*deductible|all\s*perils?\s*deductible/i,
            chips: [
                { label: '$1,000', text: 'Home deductible: $1,000' },
                { label: '$2,500', text: 'Home deductible: $2,500' },
                { label: '$5,000', text: 'Home deductible: $5,000' },
            ]
        },
        {
            pattern: /comp(rehensive)?\s*(and|&|\/)\s*coll(ision)?|comp\s*deductible|collision\s*deductible|physical\s*damage\s*deductible/i,
            chips: [
                { label: '$250/$500', text: 'Comp $250, Collision $500' },
                { label: '$500/$500', text: 'Comp $500, Collision $500' },
                { label: '$500/$1000', text: 'Comp $500, Collision $1,000' },
                { label: '$1000/$1000', text: 'Comp $1,000, Collision $1,000' },
            ]
        },
        {
            pattern: /liability\s*limit|bodily\s*injury|BI\s*(\/|and)\s*PD|coverage\s*limit/i,
            chips: [
                { label: '50/100/50', text: 'Liability: 50/100, PD 50K' },
                { label: '100/300/100', text: 'Liability: 100/300, PD 100K' },
                { label: '250/500/250', text: 'Liability: 250/500, PD 250K' },
            ]
        },
        {
            pattern: /dwelling\s*(coverage|value|amount)|coverage\s*A|how\s*much\s*(is|would).*(home|house)\s*(worth|value|insure)/i,
            chips: [
                { label: '$200K', text: 'Dwelling coverage: $200,000' },
                { label: '$300K', text: 'Dwelling coverage: $300,000' },
                { label: '$400K', text: 'Dwelling coverage: $400,000' },
                { label: '$500K', text: 'Dwelling coverage: $500,000' },
            ]
        },
        {
            pattern: /personal\s*liability\s*(limit|amount)?/i,
            chips: [
                { label: '$100K', text: 'Personal liability: $100,000' },
                { label: '$300K', text: 'Personal liability: $300,000' },
                { label: '$500K', text: 'Personal liability: $500,000' },
            ]
        },
        {
            pattern: /policy\s*type.*home|homeowner.*policy|HO-?\s*[3456]/i,
            chips: [
                { label: 'HO3', text: 'HO3 — Special Form' },
                { label: 'HO5', text: 'HO5 — Comprehensive Form' },
                { label: 'HO4', text: 'HO4 — Renters' },
                { label: 'HO6', text: 'HO6 — Condo' },
            ]
        },
        {
            pattern: /occupan(cy|t)|owner\s*occup|rent(er|ing)|tenant/i,
            chips: [
                { label: 'Owner Occupied', text: 'Owner occupied — primary residence' },
                { label: 'Tenant', text: 'Tenant / Renter' },
            ]
        },
        {
            pattern: /dwelling\s*type|type\s*of\s*(home|dwelling|property)|single\s*family|condo|townhome/i,
            chips: [
                { label: 'Single Family', text: 'One Family / Single Family home' },
                { label: 'Condo', text: 'Condo' },
                { label: 'Townhome', text: 'Townhome / Townhouse' },
            ]
        },
        {
            pattern: /uninsured|underinsured|UM\s*\/?\s*UIM/i,
            chips: [
                { label: 'Match BI', text: 'UM/UIM: match my liability limits' },
                { label: '50/100', text: 'UM/UIM: 50/100' },
                { label: '100/300', text: 'UM/UIM: 100/300' },
            ]
        },
        {
            pattern: /construction\s*(type|style)/i,
            chips: [
                { label: '🏗️ Frame', text: 'Frame construction' },
                { label: '🧱 Masonry', text: 'Masonry construction' },
                { label: '🏛️ Superior', text: 'Superior / fire-resistive construction' },
            ]
        },
        {
            pattern: /foundation\s*type|what\s*(type|kind)\s*of\s*foundation/i,
            chips: [
                { label: 'Slab', text: 'Slab foundation' },
                { label: 'Crawlspace', text: 'Crawlspace foundation' },
                { label: 'Basement', text: 'Full basement' },
            ]
        },
        {
            pattern: /roof\s*(type|material)|what\s*(type|kind)\s*(of\s*)?roof/i,
            chips: [
                { label: 'Comp Shingle', text: 'Composition shingle roof' },
                { label: 'Metal', text: 'Metal roof' },
                { label: 'Tile', text: 'Tile roof' },
            ]
        },
        {
            pattern: /how many (stories|floors|levels)/i,
            chips: [
                { label: '1 story', text: '1 story' },
                { label: '2 stories', text: '2 stories' },
                { label: '3+ stories', text: '3 stories' },
            ]
        },
        {
            pattern: /roof\b.*\b(year|age|old|replaced|updated|condition)/i,
            chips: () => {
                const y = new Date().getFullYear();
                return [
                    { label: String(y), text: 'Roof year: ' + y },
                    { label: String(y - 3), text: 'Roof year: ' + (y - 3) },
                    { label: String(y - 8), text: 'Roof year: ' + (y - 8) },
                    { label: String(y - 15), text: 'Roof year: ' + (y - 15) },
                ];
            }
        },
        {
            pattern: /square\s*foot|sq\.?\s*ft|home\s*size|how (big|large)/i,
            chips: [
                { label: '1,200 sqft', text: '1,200 square feet' },
                { label: '1,800 sqft', text: '1,800 square feet' },
                { label: '2,400 sqft', text: '2,400 square feet' },
                { label: '3,000+ sqft', text: '3,000 square feet' },
            ]
        },
        {
            pattern: /year\s*(built|constructed|was\s*(the\s*)?home)|when\s*(was|were).*built/i,
            chips: () => {
                const y = new Date().getFullYear();
                return [
                    { label: '2020s', text: 'Built in ' + (y - 2) },
                    { label: '2010s', text: 'Built in 2015' },
                    { label: '2000s', text: 'Built in 2005' },
                    { label: '1990s', text: 'Built in 1995' },
                    { label: 'Older', text: 'Built in 1980' },
                ];
            }
        },
        {
            pattern: /heating\s*(type|system|source)|what\s*(type|kind)\s*of\s*heat/i,
            chips: [
                { label: 'Forced Air', text: 'Forced air / gas furnace' },
                { label: 'Heat Pump', text: 'Heat pump' },
                { label: 'Electric', text: 'Electric baseboard' },
            ]
        },
        {
            pattern: /vehicle\s*use|usage|commute|pleasure|business.*vehicle|how.*use\s*(the\s*)?(car|vehicle)/i,
            chips: [
                { label: 'Commute', text: 'Commute — drives to work' },
                { label: 'Pleasure', text: 'Pleasure only' },
                { label: 'Business', text: 'Business use' },
            ]
        },
        {
            pattern: /annual\s*mile|how\s*(many|far)\s*(miles|do\s*(you|they)\s*drive)/i,
            chips: [
                { label: '7,500 mi', text: '7,500 annual miles' },
                { label: '12,000 mi', text: '12,000 annual miles' },
                { label: '15,000 mi', text: '15,000 annual miles' },
            ]
        },
        {
            pattern: /own(ed|ership)?|leas(ed?|ing)|lien|financ(ed|ing)|paid\s*off.*vehicle/i,
            chips: [
                { label: 'Owned', text: 'Vehicle is owned / paid off' },
                { label: 'Leased', text: 'Vehicle is leased' },
                { label: 'Lien', text: 'Vehicle has a lien / financed' },
            ]
        },
        {
            pattern: /accident|violation|ticket|claim|DUI|moving\s*violation|at.fault/i,
            chips: [
                { label: 'Clean record', text: '0 accidents, 0 violations in last 5 years' },
                { label: '1 accident', text: '1 accident in last 5 years' },
                { label: '1 ticket', text: '1 violation/ticket in last 3 years' },
            ]
        },
        {
            pattern: /prior\s*(insurance|carrier|company)|current\s*(insurance|carrier|provider)|who\s*(is|was).*insured\s*with/i,
            chips: [
                { label: 'State Farm', text: 'Prior carrier: State Farm' },
                { label: 'Allstate', text: 'Prior carrier: Allstate' },
                { label: 'Progressive', text: 'Prior carrier: Progressive' },
                { label: 'GEICO', text: 'Prior carrier: GEICO' },
                { label: 'No prior', text: 'No prior insurance' },
            ]
        },
        {
            pattern: /mortgage|lender|loan\s*company|who\s*holds\s*the\s*mortgage/i,
            chips: [
                { label: 'No mortgage', text: 'No mortgage — home is paid off' },
            ]
        },
        {
            pattern: /co.?applicant|spouse|additional\s*(insured|named)|anyone\s*else\s*on\s*the\s*policy/i,
            chips: [
                { label: 'No co-applicant', text: 'No co-applicant' },
            ]
        },
        {
            pattern: /how\s*(many\s*)?years?\s*(insured|with|of\s*coverage)|continuous\s*coverage/i,
            chips: [
                { label: '1-2 years', text: '2 years of prior coverage' },
                { label: '3-5 years', text: '5 years of prior coverage' },
                { label: '5+ years', text: '8 years of prior coverage' },
                { label: 'New', text: 'No prior coverage — new to insurance' },
            ]
        },
        {
            pattern: /pool|trampoline|attractive\s*nuisance/i,
            chips: [
                { label: 'No pool', text: 'No pool, no trampoline' },
                { label: 'Pool, no tramp', text: 'Yes pool, no trampoline' },
            ]
        },
        {
            pattern: /effective\s*date|when.*coverage\s*start|start\s*date|inception/i,
            chips: () => {
                const d = new Date();
                const fmt = (dt) => dt.toISOString().slice(0, 10);
                const d1 = new Date(d); d1.setDate(d1.getDate() + 1);
                const d7 = new Date(d); d7.setDate(d7.getDate() + 7);
                const d14 = new Date(d); d14.setDate(d14.getDate() + 14);
                const d30 = new Date(d); d30.setDate(d30.getDate() + 30);
                return [
                    { label: 'Tomorrow', text: 'Effective date: ' + fmt(d1) },
                    { label: '1 week', text: 'Effective date: ' + fmt(d7) },
                    { label: '2 weeks', text: 'Effective date: ' + fmt(d14) },
                    { label: '30 days', text: 'Effective date: ' + fmt(d30) },
                ];
            }
        },
        {
            pattern: /policy\s*term|6.month|12.month|annual.*semi/i,
            chips: [
                { label: '6 Month', text: '6 month policy term' },
                { label: '12 Month', text: '12 month policy term' },
            ]
        },
        {
            pattern: /gender|male\s*or\s*female|sex/i,
            chips: [
                { label: 'Male', text: 'Male' },
                { label: 'Female', text: 'Female' },
            ]
        },
        {
            pattern: /marital|married|single|divorced|widowed/i,
            chips: [
                { label: 'Single', text: 'Single' },
                { label: 'Married', text: 'Married' },
                { label: 'Divorced', text: 'Divorced' },
            ]
        },
    ];

    let _lastMapAddress = '';

    /** Master update — called after every AI reply that yields data */
    function _updateIntelPanel() {
        const header = document.getElementById('iaSidebarHeader');
        const empty = document.getElementById('iaSidebarEmpty');

        const hasData = Object.keys(extractedData).length > 0;
        if (header) header.style.display = hasData ? '' : 'none';
        if (empty) empty.style.display = hasData ? 'none' : '';
        if (!hasData) return;

        _updateProgressRing();
        _renderPreview();
        _updateMapViews();
        _updateVehiclePanel();
        _fetchPropertyIntel();
        _assessRisks();
    }

    /** Compute and animate the progress ring */
    function _updateProgressRing() {
        const totalFields = _countTotalExpected();
        const filledFields = _countFilled();
        const pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

        const arc = document.getElementById('iaProgressArc');
        const label = document.getElementById('iaProgressPercent');
        if (arc) {
            const circumference = 2 * Math.PI * 15;
            arc.setAttribute('stroke-dashoffset', String(circumference - (circumference * pct / 100)));
            // Phase 6c: color based on completion
            if (pct >= 100) arc.setAttribute('stroke', 'var(--success, #34C759)');
            else if (pct >= 80) arc.setAttribute('stroke', '#FF9500');
            else if (pct >= 40) arc.setAttribute('stroke', 'var(--apple-blue)');
            else arc.setAttribute('stroke', 'var(--text-secondary)');
        }
        if (label) label.textContent = String(pct);

        // Phase 6d: Section completion dots in tab badge
        const completeSections = _countCompleteSections();
        const totalSections = _countVisibleSections();
        const badge = document.getElementById('iaTabBadge');
        if (badge) {
            badge.textContent = completeSections + '/' + totalSections;
            badge.style.display = (completeSections > 0 || totalSections > 0) ? '' : 'none';
        }
    }

    // Ring count is backed by the same ezlynxRequired list the AI sees, so prompt
    // guidance and visible progress never drift. Extras (policy meta, vehicles, drivers,
    // prior-history) are layered on top because they're not in window.FIELDS.
    function _countRequiredFieldsStatus() {
        const fields = (typeof window !== 'undefined' && Array.isArray(window.FIELDS)) ? window.FIELDS : [];
        const appData = (typeof App !== 'undefined' && App && App.data) ? App.data : {};
        const qType = extractedData.qType || '';
        const isHome = qType === 'home' || qType === 'both' || !qType;
        const isAuto = qType === 'auto' || qType === 'both';

        const AI_KEY_TO_FIELD = { yearBuilt: 'yrBuilt', stories: 'numStories', constructionType: 'constructionStyle', roofYear: 'roofYr' };
        const FIELD_TO_AI = {};
        for (const [ai, field] of Object.entries(AI_KEY_TO_FIELD)) (FIELD_TO_AI[field] = FIELD_TO_AI[field] || []).push(ai);
        const hasCoSignal = !!(extractedData.coFirstName || extractedData.coLastName || extractedData.coDob ||
            appData.coFirstName || appData.coLastName || appData.coDob);

        let total = 0, filled = 0;
        for (const f of fields) {
            if (!f.ezlynxRequired) continue;
            if (f.section === 'hazards') continue; // auto-filled by Smart Fill
            if (!isHome && (f.section === 'property' || f.section === 'roof' || f.section === 'systems')) continue;
            if (f.section === 'coapplicant' && !hasCoSignal) continue;
            total++;
            const appVal = appData[f.id];
            if (appVal != null && appVal !== '' && appVal !== 0) { filled++; continue; }
            const aiKeys = FIELD_TO_AI[f.id] || [f.id];
            if (aiKeys.some(k => extractedData[k] != null && extractedData[k] !== '')) filled++;
        }

        // Extras not represented in fields.js
        const policyMeta = ['qType', 'effectiveDate'];
        for (const k of policyMeta) { total++; if (extractedData[k]) filled++; }

        if (isAuto) {
            const autoCov = ['liabilityLimits', 'compDeductible', 'autoDeductible'];
            total += autoCov.length;
            for (const k of autoCov) if (extractedData[k] || appData[k]) filled++;
            total += 2; // one vehicle + one driver
            if (Array.isArray(extractedData.vehicles) && extractedData.vehicles.length && (extractedData.vehicles[0].vin || extractedData.vehicles[0].year || extractedData.vehicles[0].make)) filled++;
            if (Array.isArray(extractedData.drivers) && extractedData.drivers.length && (extractedData.drivers[0].firstName || extractedData.drivers[0].dob || extractedData.drivers[0].dlNum)) filled++;
        }

        if (isHome) {
            const homeCov = ['homePolicyType', 'dwellingCoverage', 'personalLiability', 'homeDeductible'];
            total += homeCov.length;
            for (const k of homeCov) if (extractedData[k] || appData[k]) filled++;
        }

        // Prior insurance history (ezlynxRequired in the broader sense; not in fields.js)
        const history = ['priorCarrier', 'priorYears'];
        total += history.length;
        for (const k of history) if (extractedData[k] || appData[k]) filled++;

        return { total, filled };
    }

    function _countTotalExpected() { return _countRequiredFieldsStatus().total; }
    function _countFilled() { return _countRequiredFieldsStatus().filled; }

    /** Render the field group checklist */
    function _updateFieldChecklist() {
        const container = document.getElementById('iaFieldChecklist');
        if (!container) return;

        const qType = extractedData.qType || '';
        const groups = FIELD_GROUPS.filter(g => {
            if ((g.label === 'Home Coverage' || g.label === 'Home Details') && qType === 'auto') return false;
            if ((g.label === 'Auto Coverage' || g.label === 'Vehicles' || g.label === 'Drivers') && qType === 'home') return false;
            return true;
        });

        container.innerHTML = groups.map(g => {
            const filled = g.keys.filter(k => {
                if (k === 'vehicles') {
                    return Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0
                        && (extractedData.vehicles[0].vin || extractedData.vehicles[0].year || extractedData.vehicles[0].make);
                }
                if (k === 'drivers') {
                    return Array.isArray(extractedData.drivers) && extractedData.drivers.length > 0
                        && (extractedData.drivers[0].firstName || extractedData.drivers[0].dob || extractedData.drivers[0].dlNum);
                }
                // Handle backward compat: constructionType OR constructionStyle
                if (k === 'constructionStyle' || k === 'constructionType') {
                    return !!(extractedData.constructionStyle || extractedData.constructionType);
                }
                return !!extractedData[k];
            }).length;
            const total = g.keys.length;
            const done = filled === total;
            const partial = filled > 0 && !done;

            return `<div class="ia-checklist-row ${done ? 'ia-done' : partial ? 'ia-partial' : ''}">
                <span class="ia-checklist-icon">${done ? '✅' : partial ? '🔶' : '⬜'}</span>
                <span class="ia-checklist-label">${g.icon} ${g.label}</span>
                <span class="ia-checklist-count">${filled}/${total}</span>
            </div>`;
        }).join('');
    }

    /** Load street view + satellite when we have an address */
    async function _updateMapViews() {
        const street = extractedData.addrStreet || '';
        const city = extractedData.addrCity || '';
        const state = extractedData.addrState || '';
        const zip = extractedData.addrZip || '';

        // Need at least city+state or street+city to show maps
        if (!city && !street) return;

        const address = [street, city, state, zip].filter(Boolean).join(', ');
        if (address === _lastMapAddress) return; // Don't re-fetch same address
        _lastMapAddress = address;

        const mapPanel = document.getElementById('iaMapPanel');
        if (mapPanel) mapPanel.style.display = 'block';

        const addrLabel = document.getElementById('iaMapAddress');
        if (addrLabel) addrLabel.textContent = address;

        // Get API key via App's existing infrastructure
        let apiKey = null;
        if (typeof App !== 'undefined' && typeof App.ensureMapApiKey === 'function') {
            apiKey = await App.ensureMapApiKey();
        }
        if (!apiKey && window.__CACHED_MAP_API_KEY__) {
            apiKey = window.__CACHED_MAP_API_KEY__;
        }

        if (!apiKey) {
            // Show placeholder message
            const emptyS = document.getElementById('iaStreetViewEmpty');
            const emptyE = document.getElementById('iaSatelliteEmpty');
            if (emptyS) emptyS.textContent = 'Map key unavailable';
            if (emptyE) emptyE.textContent = 'Map key unavailable';
            return;
        }

        const encoded = encodeURIComponent(address);
        const streetUrl = `https://maps.googleapis.com/maps/api/streetview?size=400x220&location=${encoded}&fov=80&pitch=0&key=${apiKey}`;
        const satUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encoded}&zoom=19&size=400x220&maptype=satellite&key=${apiKey}`;

        const streetImg = document.getElementById('iaStreetView');
        const satImg = document.getElementById('iaSatelliteView');
        const emptyStreet = document.getElementById('iaStreetViewEmpty');
        const emptySat = document.getElementById('iaSatelliteEmpty');

        if (streetImg) {
            streetImg.src = streetUrl;
            streetImg.onload = () => { if (emptyStreet) emptyStreet.style.display = 'none'; streetImg.style.display = 'block'; };
            streetImg.onerror = () => { if (emptyStreet) emptyStreet.textContent = 'No street view available'; };
        }
        if (satImg) {
            satImg.src = satUrl;
            satImg.onload = () => { if (emptySat) emptySat.style.display = 'none'; satImg.style.display = 'block'; };
            satImg.onerror = () => { if (emptySat) emptySat.textContent = 'No satellite view available'; };
        }
    }

    /** Show decoded vehicle info */
    function _updateVehiclePanel() {
        const vehicles = extractedData.vehicles;
        if (!Array.isArray(vehicles) || vehicles.length === 0) return;

        const panel = document.getElementById('iaVehiclePanel');
        const info = document.getElementById('iaVehicleInfo');
        if (!panel || !info) return;

        const hasData = vehicles.some(v => v.vin || v.year || v.make);
        if (!hasData) return;

        panel.style.display = 'block';
        info.innerHTML = vehicles.filter(v => v.vin || v.year || v.make).map(v => `
            <div class="ia-vehicle-row">
                <div class="ia-vehicle-title">${_esc([v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle')}</div>
                ${v.vin ? `<div class="ia-vehicle-vin">VIN: <code>${_esc(v.vin)}</code></div>` : ''}
            </div>
        `).join('');
    }

    // ── Phase 1: Property Intel Auto-Fetch ──────────────────────

    let _lastPropertyIntelAddress = '';

    async function _fetchPropertyIntel() {
        const street = extractedData.addrStreet || '';
        const city = extractedData.addrCity || '';
        const state = extractedData.addrState || '';
        const zip = extractedData.addrZip || '';

        if (!street || !city || !state) return;

        const address = [street, city, state, zip].filter(Boolean).join(', ');
        if (address === _lastPropertyIntelAddress) return;
        if (_propertyIntelFetching) return;

        _lastPropertyIntelAddress = address;
        _propertyIntelFetching = true;

        try {
            const fetchFn = (window.Auth?.apiFetch || fetch).bind(window.Auth || window);
            const res = await fetchFn('/api/property-intelligence?mode=zillow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: street, city, state, zip,
                    aiSettings: window.AIProvider?.getSettings?.()
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    propertyIntel = data;
                    _propertyIntelLoaded = true;
                    // Merge useful fields
                    if (data.data?.yearBuilt && !extractedData.yearBuilt) {
                        extractedData.yearBuilt = String(data.data.yearBuilt);
                    }
                    if (data.data?.sqft && !extractedData.sqFt) {
                        extractedData.sqFt = String(data.data.sqft);
                    }
                    _renderPreview();
                    _updateSuggestionChips();
                    // Trigger Phase 1 + Phase 4
                    _fetchMarketIntel();
                    _fetchInsuranceTrends();
                }
            }
        } catch (e) {
            console.warn('[IntakeAssist] Property intel fetch failed:', e.message);
        } finally {
            _propertyIntelFetching = false;
        }
    }

    // ── Phase 1: Historical Market Intelligence ─────────────────

    async function _fetchMarketIntel() {
        if (_marketIntelLoaded || !_propertyIntelLoaded) return;

        const card = document.getElementById('iaMarketIntelCard');
        if (card) {
            card.style.display = '';
            // Show loading spinner
            const body = card.querySelector('.ia-sidebar-card-body');
            if (body) body.innerHTML = '<div class="ia-typing" style="justify-content:center;padding:16px;"><span class="ia-dot"></span><span class="ia-dot"></span><span class="ia-dot"></span></div>';
        }

        try {
            const fetchFn = (window.Auth?.apiFetch || fetch).bind(window.Auth || window);
            const res = await fetchFn('/api/historical-analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'analyzeValues',
                    address: extractedData.addrStreet || '',
                    city: extractedData.addrCity || '',
                    state: extractedData.addrState || '',
                    yearBuilt: extractedData.yearBuilt || null,
                    propertyValue: propertyIntel?.data?.assessedValue || propertyIntel?.data?.estimatedValue || null,
                    sqft: extractedData.sqFt || null,
                    aiSettings: window.AIProvider?.getSettings?.()
                })
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success && result.data) {
                    marketIntel = result.data;
                    _marketIntelLoaded = true;
                    _renderMarketIntelCard();
                    return;
                }
            }
            // Failed — collapse card silently
            if (card) card.style.display = 'none';
        } catch (e) {
            console.warn('[IntakeAssist] Market intel fetch failed:', e.message);
            if (card) card.style.display = 'none';
        }
    }

    function _renderMarketIntelCard() {
        const card = document.getElementById('iaMarketIntelCard');
        if (!card || !marketIntel) { if (card) card.style.display = 'none'; return; }

        card.style.display = '';
        const body = card.querySelector('.ia-sidebar-card-body');
        if (!body) return;

        // Appreciation rate
        const rate = marketIntel.appreciationRate?.annualAverage;
        const ratePct = rate != null ? (rate * 100).toFixed(1) : null;
        let rateClass = 'ia-appreciation-yellow';
        let rateArrow = '→';
        if (ratePct != null) {
            if (parseFloat(ratePct) > 3) { rateClass = 'ia-appreciation-green'; rateArrow = '↑'; }
            else if (parseFloat(ratePct) < 1) { rateClass = 'ia-appreciation-red'; rateArrow = '↓'; }
        }

        // Build sparkline from valueHistory
        let sparklineSvg = '';
        const vh = marketIntel.valueHistory;
        if (vh) {
            const points = [];
            const keys = ['tenYearsAgo', 'fiveYearsAgo', 'threeYearsAgo', 'oneYearAgo', 'current'];
            for (const k of keys) {
                if (vh[k]?.estimatedValue) points.push(vh[k].estimatedValue);
            }
            if (points.length >= 2) {
                sparklineSvg = _buildSVGSparkline(points, 180, 40);
            }
        }

        // Insurance trend note
        let trendNote = '';
        if (insuranceTrends?.homeownersInsurance?.historicalRates?.length >= 2) {
            const rates = insuranceTrends.homeownersInsurance.historicalRates;
            const oldest = rates[0];
            const newest = rates[rates.length - 1];
            if (oldest?.avgRate && newest?.avgRate) {
                const pctChange = Math.round(((newest.avgRate - oldest.avgRate) / oldest.avgRate) * 100);
                trendNote = '📋 Homeowners rates ' + (pctChange > 0 ? 'up' : 'down') + ' ' + Math.abs(pctChange) + '% in this market (' + oldest.year + '–' + newest.year + ')';
            }
        }

        body.innerHTML =
            (ratePct != null ? '<div class="ia-appreciation-badge ' + rateClass + '">+' + ratePct + '% / yr ' + rateArrow + '</div>' : '') +
            (sparklineSvg ? '<div class="ia-sparkline-wrap">' + sparklineSvg + '</div>' : '') +
            (trendNote ? '<div class="ia-market-trend-note">' + trendNote + '</div>' : '') +
            '<div class="ia-market-disclaimer">Estimated — verify with appraisal</div>';
    }

    function _buildSVGSparkline(values, width, height) {
        if (!values || values.length < 2) return '';
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const padding = 4;
        const w = width - padding * 2;
        const h = height - padding * 2;

        const points = values.map((v, i) => {
            const x = padding + (i / (values.length - 1)) * w;
            const y = padding + h - ((v - min) / range) * h;
            return { x, y };
        });

        const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
        const dots = points.map(p => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.5" fill="var(--apple-blue)"/>').join('');

        return '<svg class="ia-sparkline" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" fill="none">' +
            '<path d="' + pathD + '" stroke="var(--apple-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
            dots +
            '</svg>';
    }

    // ── Phase 2: Satellite Hazard Detection ─────────────────────

    async function _scanSatelliteHazards() {
        if (_satelliteScanDone) return;
        const street = extractedData.addrStreet || '';
        const city = extractedData.addrCity || '';
        const state = extractedData.addrState || '';
        const zip = extractedData.addrZip || '';
        if (!street || !city) return;

        _satelliteScanDone = true;
        _updateSuggestionChips(); // Remove the chip

        _appendMsg('ai', '🛰️ Scanning satellite imagery for hazards...');
        _showTyping();

        try {
            const fetchFn = (window.Auth?.apiFetch || fetch).bind(window.Auth || window);
            const res = await fetchFn('/api/property-intelligence?mode=satellite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: street, city, state, zip,
                    aiSettings: window.AIProvider?.getSettings?.()
                })
            });

            _hideTyping();

            if (res.ok) {
                const result = await res.json();
                if (result.success && result.data) {
                    satelliteData = result.data;
                    _renderHazardBadges(result.data);
                    _assessRisks();

                    // Show summary in chat
                    const hazards = [];
                    if (result.data.has_pool) hazards.push('🏊 Pool detected');
                    if (result.data.tree_overhang_roof) hazards.push('🌳 Tree overhang');
                    if (result.data.visible_hazards?.length > 0) {
                        for (const h of result.data.visible_hazards) hazards.push('⚠️ ' + _esc(String(h)));
                    }
                    if (result.data.brush_clearance_adequate === false) hazards.push('🔥 Possible WUI zone concern');

                    if (hazards.length > 0) {
                        _appendMsg('ai', '🛰️ **Satellite scan complete.** Found:\n' + hazards.join('\n') + '\n\nThese have been added to the risk assessment.');
                    } else {
                        _appendMsg('ai', '🛰️ **Satellite scan complete.** ✓ No significant hazards detected from aerial imagery.');
                    }
                } else {
                    _appendMsg('ai', '🛰️ Satellite scan completed — no additional hazards identified.');
                }
            } else {
                _appendMsg('ai', '🛰️ Satellite scan completed — no additional hazards identified.');
            }
        } catch (e) {
            _hideTyping();
            console.warn('[IntakeAssist] Satellite scan failed:', e.message);
            _appendMsg('ai', '🛰️ Satellite scan completed — no additional hazards identified.');
        }
        _updateSuggestionChips();
    }

    function _renderHazardBadges(data) {
        if (!data) return;
        // Find the property/home details section by data attribute
        const sections = document.querySelectorAll('#iaExtractedPreview .ia-section');
        let propSection = null;
        for (const s of sections) {
            const lbl = s.getAttribute('data-section-label');
            if (lbl === 'Home Details' || lbl === 'Home Coverage') {
                propSection = s;
                break;
            }
        }
        if (!propSection) return;

        const body = propSection.querySelector('.ia-section-body');
        if (!body) return;

        // Remove existing hazard badges
        const existing = body.querySelector('.ia-hazard-badges');
        if (existing) existing.remove();

        const badges = [];
        if (data.has_pool) badges.push({ icon: '🏊', label: 'Pool', level: 'orange' });
        if (data.tree_overhang_roof) badges.push({ icon: '🌳', label: 'Tree overhang', level: 'orange' });
        if (data.brush_clearance_adequate === false) badges.push({ icon: '🔥', label: 'WUI zone', level: 'red' });
        if (data.has_trampoline) badges.push({ icon: '⚠️', label: 'Trampoline', level: 'orange' });
        if (data.visible_hazards?.some(h => /water|flood|creek|river|pond/i.test(String(h)))) {
            badges.push({ icon: '💧', label: 'Water nearby', level: 'orange' });
        }

        if (badges.length === 0) {
            badges.push({ icon: '✓', label: 'No hazards detected', level: 'green' });
        }

        const container = document.createElement('div');
        container.className = 'ia-hazard-badges';
        container.innerHTML = badges.map(b =>
            '<span class="ia-hazard-badge ia-hazard-badge-' + b.level + '">' + b.icon + ' ' + _esc(b.label) + '</span>'
        ).join('');
        body.appendChild(container);
    }

    // ── Phase 3: Document Intelligence Upload + Drag-and-Drop ──

    let _dragCounter = 0; // Track nested dragenter/dragleave events

    function _wireDocUpload() {
        if (_docInputWired) return;
        const docInput = document.getElementById('iaDocInput');
        const docBtn = document.getElementById('iaDocBtn');
        if (docInput && docBtn) {
            docBtn.addEventListener('click', () => docInput.click());
            docInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) _handleDocUpload(file);
                docInput.value = '';
            });
            _docInputWired = true;
        }
        _wireDragDrop();
    }

    function _wireDragDrop() {
        const chatCard = document.querySelector('.ia-chat-card');
        if (!chatCard) return;

        chatCard.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            _dragCounter++;
            if (_dragCounter === 1) chatCard.classList.add('ia-drag-over');
        });

        chatCard.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        });

        chatCard.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            _dragCounter--;
            if (_dragCounter <= 0) {
                _dragCounter = 0;
                chatCard.classList.remove('ia-drag-over');
            }
        });

        chatCard.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            _dragCounter = 0;
            chatCard.classList.remove('ia-drag-over');
            const file = e.dataTransfer?.files?.[0];
            if (file) _handleDocUpload(file);
        });
    }

    async function _handleDocUpload(file) {
        if (!file) return;

        // 20MB limit (matches policy-scan server limit)
        if (file.size > 20 * 1024 * 1024) {
            _appendMsg('ai', '⚠️ File too large (max 20MB). Please use a smaller file or compress the image.');
            return;
        }

        // Validate MIME type
        const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        const isValid = validTypes.some(t => file.type === t) || file.type.startsWith('image/');
        if (!isValid) {
            _appendMsg('ai', '⚠️ Unsupported file type. Please upload a PDF or image (JPEG, PNG, WebP).');
            return;
        }

        const fileName = _esc(file.name);
        _appendMsg('ai', '📄 Scanning **' + fileName + '** for insurance data — this may take a moment...');
        _showTyping();

        // Hide suggestion chips while processing
        const _chipRow = document.getElementById('iaChipRow');
        if (_chipRow) { _chipRow.innerHTML = ''; _chipRow.style.display = 'none'; }

        try {
            let base64Data;
            let mimeType = file.type || 'application/octet-stream';

            if (file.type.startsWith('image/') && file.type !== 'application/pdf') {
                // Compress image before upload
                const optimized = await _optimizeImageFile(file, 1600, 0.85);
                base64Data = optimized.base64;
                mimeType = optimized.mimeType;
            } else {
                // Read PDF as-is
                base64Data = await _fileToBase64(file);
            }

            // Use the comprehensive policy-scan API (80+ field extraction)
            const fetchFn = (window.Auth?.apiFetch || fetch).bind(window.Auth || window);
            const res = await fetchFn('/api/policy-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    files: [{ data: base64Data, mimeType: mimeType }]
                })
            });

            _hideTyping();

            if (!res.ok) {
                _appendMsg('ai', "⚠️ Couldn't process that document — try a clearer image or a different file.");
                return;
            }

            const result = await res.json();
            const fields = result.fields || {};
            const confidence = result.confidence || {};
            const qualityIssues = result.quality_issues || [];

            // Count and merge extracted fields
            let fieldsFound = 0;
            const fieldSummary = { applicant: [], address: [], property: [], coverage: [], vehicle: [], policy: [] };

            for (const [key, value] of Object.entries(fields)) {
                if (!value || value === '' || value === 'N/A') continue;

                // Categorize for summary display
                const label = _fieldLabel(key);
                const displayVal = _esc(String(value));
                const conf = confidence[key];
                const star = (conf && conf >= 0.8) ? '' : (conf && conf >= 0.5) ? ' ⚠️' : '';

                if (['firstName', 'lastName', 'dob', 'gender', 'maritalStatus', 'phone', 'email', 'prefix', 'suffix', 'education', 'occupation', 'industry',
                     'coFirstName', 'coLastName', 'coDob', 'coGender', 'coEmail', 'coPhone', 'coRelationship'].includes(key)) {
                    fieldSummary.applicant.push('**' + label + '**: ' + displayVal + star);
                } else if (['addrStreet', 'addrCity', 'addrState', 'addrZip', 'county', 'yearsAtAddress'].includes(key)) {
                    fieldSummary.address.push('**' + label + '**: ' + displayVal + star);
                } else if (['dwellingType', 'dwellingUsage', 'occupancyType', 'yrBuilt', 'sqFt', 'roofType', 'roofShape', 'roofYr',
                             'constructionStyle', 'numStories', 'foundation', 'exteriorWalls', 'heatingType', 'cooling', 'heatYr',
                             'plumbYr', 'elecYr', 'sewer', 'waterSource', 'garageType', 'garageSpaces', 'lotSize',
                             'numOccupants', 'bedrooms', 'fullBaths', 'halfBaths', 'kitchenQuality', 'flooring',
                             'numFireplaces', 'purchaseDate', 'pool', 'trampoline', 'dogInfo', 'businessOnProperty', 'woodStove',
                             'burglarAlarm', 'fireAlarm', 'sprinklers', 'smokeDetector', 'fireStationDist', 'fireHydrantFeet', 'protectionClass'].includes(key)) {
                    fieldSummary.property.push('**' + label + '**: ' + displayVal + star);
                } else if (['homePolicyType', 'dwellingCoverage', 'personalLiability', 'medicalPayments', 'homeDeductible', 'windDeductible', 'mortgagee',
                             'autoPolicyType', 'liabilityLimits', 'pdLimit', 'umLimits', 'uimLimits', 'compDeductible', 'autoDeductible',
                             'medPayments', 'rentalDeductible', 'towingDeductible', 'studentGPA'].includes(key)) {
                    fieldSummary.coverage.push('**' + label + '**: ' + displayVal + star);
                } else if (['vin', 'vehDesc', 'additionalVehicles', 'additionalDrivers'].includes(key)) {
                    fieldSummary.vehicle.push('**' + label + '**: ' + displayVal + star);
                } else if (['policyNumber', 'effectiveDate', 'policyTerm', 'priorCarrier', 'priorExp', 'priorPolicyTerm',
                             'priorLiabilityLimits', 'priorYears', 'continuousCoverage',
                             'homePriorCarrier', 'homePriorExp', 'homePriorPolicyTerm', 'homePriorYears',
                             'accidents', 'violations', 'additionalInsureds', 'contactTime', 'referralSource'].includes(key)) {
                    fieldSummary.policy.push('**' + label + '**: ' + displayVal + star);
                }

                // Merge into extractedData using the same key names the AI conversation uses
                const mapped = _mapScanField(key, String(value));
                if (mapped) {
                    extractedData[mapped.key] = mapped.value;
                    fieldsFound++;
                }
            }

            // Parse additional vehicles into the vehicles array
            _parseAdditionalVehicles(fields);
            _parseAdditionalDrivers(fields);

            if (fieldsFound > 0) {
                // Build summary message
                let summary = '📋 **Extracted ' + fieldsFound + ' fields** from ' + fileName + ':\n\n';
                if (fieldSummary.applicant.length) summary += '**👤 Applicant**\n' + fieldSummary.applicant.join('\n') + '\n\n';
                if (fieldSummary.address.length) summary += '**📍 Address**\n' + fieldSummary.address.join('\n') + '\n\n';
                if (fieldSummary.property.length) summary += '**🏠 Property**\n' + fieldSummary.property.join('\n') + '\n\n';
                if (fieldSummary.vehicle.length) summary += '**🚗 Vehicles**\n' + fieldSummary.vehicle.join('\n') + '\n\n';
                if (fieldSummary.coverage.length) summary += '**🛡️ Coverage**\n' + fieldSummary.coverage.join('\n') + '\n\n';
                if (fieldSummary.policy.length) summary += '**📄 Policy**\n' + fieldSummary.policy.join('\n') + '\n\n';
                if (qualityIssues.length) summary += '⚠️ *Notes: ' + qualityIssues.join('; ') + '*';

                _appendMsg('ai', summary.trim());

                // Sync to App.data and update sidebar
                _saveHistory();
                _updateIntelPanel();
                _syncToAppData();

                // Auto-detect qType from fields if not set
                if (!extractedData.qType) {
                    const hasProperty = !!(extractedData.yearBuilt || extractedData.dwellingType || extractedData.sqFt || extractedData.roofType);
                    const hasAuto = !!(extractedData.vin || extractedData.vehDesc || (Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0));
                    if (hasProperty && hasAuto) extractedData.qType = 'both';
                    else if (hasProperty) extractedData.qType = 'home';
                    else if (hasAuto) extractedData.qType = 'auto';
                }

                // Auto-fetch property intel if we have an address
                _fetchPropertyIntel();

                // Now feed the extracted data to the AI so it can ask remaining questions
                await _askAIForRemainingFields(fileName, fieldsFound, fields);
            } else {
                _appendMsg('ai', '📄 Processed **' + fileName + '** but no insurance-relevant data was found. Try a policy declarations page, driver\'s license, or renewal notice.');
            }
        } catch (e) {
            _hideTyping();
            console.warn('[IntakeAssist] Doc upload failed:', e.message);
            _appendMsg('ai', "⚠️ Couldn't process that document — try a clearer image or a different file.");
        }
    }

    /** After document extraction, send the data to the AI so it reviews and asks remaining questions */
    async function _askAIForRemainingFields(fileName, fieldCount, rawFields) {
        // Build a system-level injection summarizing what was extracted
        const fieldSummaryLines = [];
        for (const [key, value] of Object.entries(rawFields)) {
            if (value && value !== '' && value !== 'N/A') {
                fieldSummaryLines.push(key + ': ' + String(value));
            }
        }
        const systemNote = '[System note — Document "' + fileName + '" was scanned and ' + fieldCount + ' fields were extracted. The extracted data has already been applied. Here is what was found:\n' + fieldSummaryLines.join('\n') + '\n\nReview the data, confirm what was found, and then ask the client about any MISSING required fields that were not in the document. Do NOT re-ask for fields that were already extracted.]';

        chatHistory.push({ role: 'user', content: systemNote });
        _saveHistory();

        _showTyping();

        try {
            const aiAvailable = typeof AIProvider !== 'undefined' && (AIProvider.isConfigured() || await AIProvider.isAvailable());
            if (!aiAvailable) {
                _hideTyping();
                return;
            }

            const result = await AIProvider.chat(_buildSystemPrompt(), chatHistory, {
                temperature: 0.35,
                maxTokens: 1024
            });

            const reply = (result && result.text) ? result.text : '';
            chatHistory.push({ role: 'assistant', content: reply });
            _saveHistory();

            _hideTyping();
            _appendMsg('ai', reply);

            // Extract any JSON the AI may include
            const extracted = _tryExtractJSON(reply);
            if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
                extractedData = Object.assign(extractedData, extracted);
                _saveHistory();
                _updateIntelPanel();
                _syncToAppData();
            }

            if (_checkCompletion() && !_completionShown) {
                _showCompletionMessage();
            }

            _updateSuggestionChips();
        } catch (err) {
            _hideTyping();
            console.warn('[IntakeAssist] AI follow-up after doc scan failed:', err.message);
            _updateSuggestionChips();
        }
    }

    /** Map policy-scan API field keys to extractedData keys used by _syncToAppData */
    function _mapScanField(scanKey, value) {
        if (!value || value === 'N/A' || value === '') return null;

        // Keys that map directly (scan key === extractedData key)
        const directKeys = [
            'firstName', 'lastName', 'prefix', 'suffix', 'dob', 'gender', 'maritalStatus', 'phone', 'email',
            'education', 'occupation', 'industry',
            'coFirstName', 'coLastName', 'coDob', 'coGender', 'coEmail', 'coPhone', 'coRelationship',
            'addrStreet', 'addrCity', 'addrState', 'addrZip', 'county', 'yearsAtAddress',
            'dwellingType', 'dwellingUsage', 'occupancyType', 'yearBuilt', 'sqFt',
            'roofType', 'roofShape', 'roofYear', 'constructionStyle',
            'stories', 'foundation', 'exteriorWalls', 'heatingType', 'cooling',
            'heatYr', 'plumbYr', 'elecYr', 'sewer', 'waterSource',
            'garageType', 'garageSpaces', 'lotSize', 'numOccupants', 'bedrooms',
            'fullBaths', 'halfBaths', 'kitchenQuality', 'flooring', 'numFireplaces',
            'purchaseDate', 'pool', 'trampoline', 'dogInfo', 'businessOnProperty', 'woodStove',
            'burglarAlarm', 'fireAlarm', 'sprinklers', 'smokeDetector',
            'fireStationDist', 'fireHydrantFeet', 'protectionClass',
            'homePolicyType', 'dwellingCoverage', 'personalLiability', 'medicalPayments',
            'homeDeductible', 'windDeductible', 'mortgagee',
            'autoPolicyType', 'liabilityLimits', 'pdLimit', 'umLimits', 'uimLimits',
            'compDeductible', 'autoDeductible', 'medPayments',
            'rentalDeductible', 'towingDeductible', 'studentGPA',
            'vin', 'vehDesc',
            'policyNumber', 'effectiveDate', 'policyTerm',
            'priorCarrier', 'priorExp', 'priorPolicyTerm', 'priorLiabilityLimits',
            'priorYears', 'continuousCoverage',
            'homePriorCarrier', 'homePriorExp', 'homePriorPolicyTerm', 'homePriorYears',
            'accidents', 'violations',
            'additionalInsureds', 'contactTime', 'referralSource',
        ];
        if (directKeys.includes(scanKey)) {
            return { key: scanKey, value: value };
        }
        // Remap scan API keys (form-field names) to internal AI conversation keys
        const remap = {
            'yrBuilt': 'yearBuilt',
            'year_built': 'yearBuilt',
            'roofYr': 'roofYear',
            'numStories': 'stories',
            'stories_visible': 'stories',
            'sqft': 'sqFt',
            'square_footage': 'sqFt',
            'roof_type': 'roofType',
            'foundation_type': 'foundation',
            'siding_type': 'exteriorWalls',
            'exteriorType': 'exteriorWalls',
            'lot_size_estimate': 'lotSize',
            'addressLine1': 'addrStreet',
            'city': 'addrCity',
            'state': 'addrState',
            'zip': 'addrZip',
        };
        if (remap[scanKey]) {
            return { key: remap[scanKey], value: value };
        }
        return null;
    }

    /** Parse additionalVehicles string from scan into extractedData.vehicles array */
    function _parseAdditionalVehicles(fields) {
        if (!fields) return;
        // Handle primary vehicle
        if (fields.vin || fields.vehDesc) {
            if (!Array.isArray(extractedData.vehicles)) extractedData.vehicles = [];
            const desc = (fields.vehDesc || '').trim();
            const parts = desc.match(/^(\d{4})\s+(\S+)\s+(.+)/);
            const primary = {
                vin: fields.vin || '',
                year: parts ? parts[1] : '',
                make: parts ? parts[2] : '',
                model: parts ? parts[3] : desc,
            };
            // Only add if not already present
            const exists = extractedData.vehicles.some(v => v.vin && v.vin === primary.vin);
            if (!exists && (primary.vin || primary.year)) extractedData.vehicles.push(primary);
        }
        // Handle additional vehicles (semicolon-separated)
        if (fields.additionalVehicles) {
            if (!Array.isArray(extractedData.vehicles)) extractedData.vehicles = [];
            const entries = fields.additionalVehicles.split(';').map(s => s.trim()).filter(Boolean);
            for (const entry of entries) {
                const vinMatch = entry.match(/VIN:\s*([A-HJ-NPR-Z0-9]{17})/i);
                const descMatch = entry.match(/^(\d{4})\s+(\S+)\s+(.+?)(?:\s*VIN:|$)/);
                const v = {
                    vin: vinMatch ? vinMatch[1] : '',
                    year: descMatch ? descMatch[1] : '',
                    make: descMatch ? descMatch[2] : '',
                    model: descMatch ? descMatch[3].trim() : entry,
                };
                const exists = extractedData.vehicles.some(ev =>
                    (v.vin && ev.vin === v.vin) || (v.year && v.make && ev.year === v.year && ev.make === v.make)
                );
                if (!exists && (v.vin || v.year)) extractedData.vehicles.push(v);
            }
        }
    }

    /** Parse additionalDrivers string from scan into extractedData.drivers array */
    function _parseAdditionalDrivers(fields) {
        if (!fields || !fields.additionalDrivers) return;
        if (!Array.isArray(extractedData.drivers)) extractedData.drivers = [];
        const entries = fields.additionalDrivers.split(';').map(s => s.trim()).filter(Boolean);
        for (const entry of entries) {
            const dobMatch = entry.match(/DOB:\s*(\d{4}-\d{2}-\d{2})/i);
            const namePart = entry.replace(/DOB:\s*\d{4}-\d{2}-\d{2}/i, '').trim();
            const nameWords = namePart.split(/\s+/);
            const driver = {
                firstName: nameWords[0] || '',
                lastName: nameWords.slice(1).join(' ') || '',
                dob: dobMatch ? dobMatch[1] : '',
            };
            const exists = extractedData.drivers.some(d =>
                d.firstName === driver.firstName && d.lastName === driver.lastName
            );
            if (!exists && driver.firstName) extractedData.drivers.push(driver);
        }
    }

    /** Human-readable label for a scan field key */
    function _fieldLabel(key) {
        const labels = {
            firstName: 'First Name', lastName: 'Last Name', prefix: 'Prefix', suffix: 'Suffix',
            dob: 'Date of Birth', gender: 'Gender', maritalStatus: 'Marital Status',
            phone: 'Phone', email: 'Email', education: 'Education', occupation: 'Occupation', industry: 'Industry',
            coFirstName: 'Co-Applicant First', coLastName: 'Co-Applicant Last', coDob: 'Co-Applicant DOB',
            coGender: 'Co-Applicant Gender', coEmail: 'Co-Applicant Email', coPhone: 'Co-Applicant Phone',
            coRelationship: 'Co-Applicant Relationship',
            addrStreet: 'Street', addrCity: 'City', addrState: 'State', addrZip: 'ZIP',
            county: 'County', yearsAtAddress: 'Years at Address',
            dwellingType: 'Dwelling Type', dwellingUsage: 'Dwelling Usage', occupancyType: 'Occupancy',
            yrBuilt: 'Year Built', sqFt: 'Square Feet', roofType: 'Roof Type', roofShape: 'Roof Shape',
            roofYr: 'Roof Year', constructionStyle: 'Construction', numStories: 'Stories',
            foundation: 'Foundation', exteriorWalls: 'Exterior Walls', heatingType: 'Heating',
            cooling: 'Cooling', garageType: 'Garage Type', garageSpaces: 'Garage Spaces',
            lotSize: 'Lot Size', pool: 'Pool', trampoline: 'Trampoline',
            fireAlarm: 'Fire Alarm', sprinklers: 'Sprinklers', protectionClass: 'Protection Class',
            homePolicyType: 'Home Policy Type', dwellingCoverage: 'Dwelling Coverage',
            personalLiability: 'Liability', medicalPayments: 'Medical Payments',
            homeDeductible: 'Home Deductible', windDeductible: 'Wind Deductible', mortgagee: 'Mortgagee',
            vin: 'VIN', vehDesc: 'Vehicle', additionalVehicles: 'Additional Vehicles',
            autoPolicyType: 'Auto Policy Type', liabilityLimits: 'Liability Limits',
            pdLimit: 'Property Damage', umLimits: 'UM Limits', compDeductible: 'Comp Deductible',
            autoDeductible: 'Collision Deductible', medPayments: 'Med Pay',
            policyNumber: 'Policy Number', effectiveDate: 'Effective Date', policyTerm: 'Policy Term',
            priorCarrier: 'Prior Carrier', priorExp: 'Prior Expiration', priorYears: 'Years w/ Prior',
            homePriorCarrier: 'Home Prior Carrier', homePriorExp: 'Home Prior Exp',
            additionalDrivers: 'Additional Drivers', additionalInsureds: 'Additional Insureds',
            accidents: 'Accidents', violations: 'Violations',
            bedrooms: 'Bedrooms', fullBaths: 'Full Baths', halfBaths: 'Half Baths',
            numFireplaces: 'Fireplaces', purchaseDate: 'Purchase Date',
            dogInfo: 'Dog Info', woodStove: 'Wood Stove', businessOnProperty: 'Business on Property',
            burglarAlarm: 'Burglar Alarm', smokeDetector: 'Smoke Detector',
            fireStationDist: 'Fire Station Dist', fireHydrantFeet: 'Fire Hydrant Dist',
            continuousCoverage: 'Continuous Coverage', priorLiabilityLimits: 'Prior Liability Limits',
            numOccupants: 'Occupants', heatYr: 'Heating Year', plumbYr: 'Plumbing Year',
            elecYr: 'Electrical Year', sewer: 'Sewer', waterSource: 'Water Source',
            kitchenQuality: 'Kitchen Quality', flooring: 'Flooring',
            uimLimits: 'UIM Limits', rentalDeductible: 'Rental', towingDeductible: 'Towing',
            studentGPA: 'Student GPA', referralSource: 'Referral Source', contactTime: 'Contact Time',
            priorPolicyTerm: 'Prior Policy Term',
            homePriorPolicyTerm: 'Home Prior Policy Term', homePriorYears: 'Years w/ Home Prior',
        };
        return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
    }

    function _optimizeImageFile(file, maxWidth, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width;
                    let h = img.height;
                    if (w > maxWidth) {
                        h = Math.round(h * (maxWidth / w));
                        w = maxWidth;
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    const base64 = dataUrl.split(',')[1];
                    // Canvas cleanup
                    canvas.width = 0;
                    canvas.height = 0;
                    resolve({ base64: base64, mimeType: 'image/jpeg' });
                };
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(file);
        });
    }

    function _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                const base64 = result.split(',')[1] || result;
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(file);
        });
    }

    // ── Phase 4: Insurance Rate Trend Panel ─────────────────────

    async function _fetchInsuranceTrends() {
        if (insuranceTrends || !_propertyIntelLoaded) return;

        try {
            const fetchFn = (window.Auth?.apiFetch || fetch).bind(window.Auth || window);
            const res = await fetchFn('/api/historical-analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'analyzeInsurance',
                    address: extractedData.addrStreet || '',
                    city: extractedData.addrCity || '',
                    state: extractedData.addrState || '',
                    county: extractedData.county || '',
                    aiSettings: window.AIProvider?.getSettings?.()
                })
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success && result.data) {
                    insuranceTrends = result.data;
                    _renderInsuranceTrendCard();
                    // Re-render market intel card if it has insurance data to show
                    if (marketIntel) _renderMarketIntelCard();
                }
            }
        } catch (e) {
            console.warn('[IntakeAssist] Insurance trends fetch failed:', e.message);
        }
    }

    function _renderInsuranceTrendCard() {
        const card = document.getElementById('iaInsuranceTrendCard');
        if (!card || !insuranceTrends) return;

        card.style.display = '';
        const body = card.querySelector('.ia-sidebar-card-body');
        if (!body) return;

        const ho = insuranceTrends.homeownersInsurance || {};
        const rates = ho.historicalRates || [];
        const pred = insuranceTrends.ratePrediction || {};
        const wf = insuranceTrends.wildfireInsurance || {};

        // Rate range estimate
        let rateRange = '';
        if (rates.length > 0) {
            const latest = rates[rates.length - 1];
            if (latest?.avgRate) {
                const low = Math.round(latest.avgRate * 0.8);
                const high = Math.round(latest.avgRate * 1.3);
                rateRange = 'Est. $' + low.toLocaleString() + ' – $' + high.toLocaleString() + '/yr for this area';
            }
        }

        // Trend arrow
        let trendHtml = '';
        if (rates.length >= 2) {
            const first = rates[0];
            const last = rates[rates.length - 1];
            if (first?.avgRate && last?.avgRate) {
                const pctChange = Math.round(((last.avgRate - first.avgRate) / first.avgRate) * 100);
                const arrow = pctChange > 0 ? '↑' : pctChange < 0 ? '↓' : '→';
                trendHtml = '<div class="ia-insurance-trend">' + arrow + ' ' + (pctChange > 0 ? '+' : '') + pctChange + '% since ' + first.year + '</div>';
            }
        }

        // Carrier restrictions
        let carrierNote = '';
        if (wf.carrierRestrictions) {
            carrierNote = '⚠️ ' + _esc(String(wf.carrierRestrictions));
        } else if (wf.riskLevel === 'high' || wf.riskLevel === 'very_high') {
            carrierNote = '⚠️ High wildfire risk area — carrier restrictions possible';
        }

        // Mitigation tip
        let mitigationTip = '';
        if (pred.mitigation?.length > 0) {
            mitigationTip = '💡 ' + _esc(pred.mitigation[0]);
        }

        body.innerHTML =
            (rateRange ? '<div class="ia-insurance-rate">' + _esc(rateRange) + '</div>' : '') +
            trendHtml +
            (carrierNote ? '<div class="ia-insurance-carrier-note">' + carrierNote + '</div>' : '') +
            (mitigationTip ? '<div class="ia-insurance-tip">' + mitigationTip + '</div>' : '');
    }

    // ── Risk Assessment ─────────────────────────────────────────

    function _assessRisks() {
        riskFlags = [];

        // Year built risks
        if (extractedData.yearBuilt) {
            const yr = parseInt(extractedData.yearBuilt);
            if (yr < 1970) riskFlags.push({ type: 'age', severity: 'high', message: 'Home built in ' + yr + ' — knob-and-tube wiring, lead paint, asbestos risk' });
            else if (yr < 1990) riskFlags.push({ type: 'age', severity: 'medium', message: 'Home built in ' + yr + ' — check for polybutylene plumbing' });
        }

        // Roof age risk
        if (extractedData.roofYear) {
            const roofAge = new Date().getFullYear() - parseInt(extractedData.roofYear);
            if (roofAge >= 25) riskFlags.push({ type: 'roof', severity: 'high', message: 'Roof is ' + roofAge + ' years old — replacement likely needed' });
            else if (roofAge >= 15) riskFlags.push({ type: 'roof', severity: 'medium', message: 'Roof is ' + roofAge + ' years old — inspect for wear' });
        }

        // Satellite hazards
        if (satelliteData) {
            if (satelliteData.has_pool) riskFlags.push({ type: 'liability', severity: 'medium', message: 'Pool detected — verify fence/enclosure' });
            if (satelliteData.tree_overhang_roof) riskFlags.push({ type: 'property', severity: 'medium', message: 'Tree overhanging roof — falling branch risk' });
            if (satelliteData.brush_clearance_adequate === false) riskFlags.push({ type: 'wui', severity: 'high', message: 'Inadequate defensible space — WUI zone concern' });
            if (satelliteData.has_trampoline) riskFlags.push({ type: 'liability', severity: 'medium', message: 'Trampoline detected — liability concern' });
        }

        // Pool/trampoline from extracted data
        if (extractedData.pool === 'Yes' && !riskFlags.some(f => f.message.includes('Pool'))) {
            riskFlags.push({ type: 'liability', severity: 'medium', message: 'Pool — verify fence/enclosure' });
        }
        if (extractedData.trampoline === 'Yes' && !riskFlags.some(f => f.message.includes('Trampoline'))) {
            riskFlags.push({ type: 'liability', severity: 'medium', message: 'Trampoline — liability concern' });
        }
    }

    // ── Completion Detection & Handoff ──────────────────────

    /** Check if all critical fields are collected for the current quote type */
    function _checkCompletion() {
        const qType = extractedData.qType;
        if (!qType) return false;

        const coreFields = ['firstName', 'lastName', 'dob', 'addrStreet', 'addrCity', 'addrState'];
        for (const f of coreFields) {
            if (!extractedData[f]) return false;
        }

        if (qType === 'home' || qType === 'both') {
            const homeFields = ['yearBuilt', 'sqFt', 'roofType'];
            for (const f of homeFields) {
                if (!extractedData[f]) return false;
            }
        }

        if (qType === 'auto' || qType === 'both') {
            if (!Array.isArray(extractedData.vehicles) || extractedData.vehicles.length === 0) return false;
            const v = extractedData.vehicles[0];
            if (!v.year && !v.make && !v.vin) return false;
            if (!Array.isArray(extractedData.drivers) || extractedData.drivers.length === 0) return false;
            const d = extractedData.drivers[0];
            if (!d.firstName && !d.lastName) return false;
        }

        return true;
    }

    /** Show the completion message with action buttons */
    function _showCompletionMessage() {
        if (_completionShown) return;
        _completionShown = true;

        const pct = _countTotalExpected() > 0
            ? Math.round((_countFilled() / _countTotalExpected()) * 100) : 0;
        const name = [extractedData.firstName, extractedData.lastName].filter(Boolean).join(' ');
        const qLabel = (extractedData.qType || '').charAt(0).toUpperCase() + (extractedData.qType || '').slice(1);

        _appendMsg('ai', '🎉 **All critical fields collected!** ' + _esc(name) + '\'s ' + qLabel + ' intake is **' + pct + '%** complete.\n\nYou can keep chatting to add details, or choose an action below.');

        // Show completion action chips
        const chipRow = document.getElementById('iaChipRow');
        if (chipRow) {
            chipRow.innerHTML = '';
            const actions = [
                { label: '📤 Export to EZLynx', cls: 'ia-chip-done', fn: _navigateToEZLynx },
                { label: '📋 Review Answers', cls: 'ia-chip-suggestion', fn: _showReviewSummary },
                { label: '⚡ Populate Form', cls: 'ia-chip-suggestion', fn: populateForm },
            ];
            for (const a of actions) {
                const btn = document.createElement('button');
                btn.className = 'ia-chip ' + a.cls;
                btn.textContent = a.label;
                btn.onclick = a.fn;
                chipRow.appendChild(btn);
            }
            chipRow.style.display = '';
            chipRow.classList.remove('ia-chips-visible');
            void chipRow.offsetWidth;
            chipRow.classList.add('ia-chips-visible');
        }
    }

    /** Navigate to EZLynx tool after populating main form */
    function _navigateToEZLynx() {
        _syncToAppData();
        populateForm();
        setTimeout(() => {
            if (typeof App !== 'undefined' && typeof App.navigateTo === 'function') {
                App.navigateTo('ezlynx');
            }
        }, 600);
    }

    /** Show a grouped review summary in the chat */
    function _showReviewSummary() {
        const parts = [];

        // Applicant
        const name = [extractedData.firstName, extractedData.lastName].filter(Boolean).join(' ');
        if (name) parts.push('**👤 Applicant:** ' + _esc(name));
        if (extractedData.dob) parts.push('DOB: ' + extractedData.dob);
        if (extractedData.phone) parts.push('Phone: ' + extractedData.phone);
        if (extractedData.email) parts.push('Email: ' + _esc(extractedData.email));

        // Address
        const addr = [extractedData.addrStreet, extractedData.addrCity, extractedData.addrState, extractedData.addrZip].filter(Boolean).join(', ');
        if (addr) parts.push('\n**📍 Address:** ' + _esc(addr));
        if (extractedData.county) parts.push('County: ' + _esc(extractedData.county));

        // Quote type
        if (extractedData.qType) parts.push('\n**📋 Quote Type:** ' + extractedData.qType.charAt(0).toUpperCase() + extractedData.qType.slice(1));

        // Home details
        if (extractedData.qType === 'home' || extractedData.qType === 'both') {
            const homeInfo = [];
            if (extractedData.yearBuilt) homeInfo.push(extractedData.yearBuilt + ' built');
            if (extractedData.sqFt) homeInfo.push(extractedData.sqFt + ' sqft');
            if (extractedData.stories) homeInfo.push(extractedData.stories + ' stories');
            if (extractedData.roofType) homeInfo.push(extractedData.roofType + ' roof');
            if (extractedData.constructionStyle || extractedData.constructionType) {
                homeInfo.push((extractedData.constructionStyle || extractedData.constructionType) + ' construction');
            }
            if (homeInfo.length) parts.push('**🏠 Home:** ' + homeInfo.join(' · '));
            if (extractedData.dwellingCoverage) parts.push('Dwelling: $' + extractedData.dwellingCoverage);
            if (extractedData.personalLiability) parts.push('Liability: $' + extractedData.personalLiability);
        }

        // Vehicles
        if (Array.isArray(extractedData.vehicles)) {
            for (const v of extractedData.vehicles) {
                if (v.year || v.make || v.model) {
                    parts.push('**🚗 Vehicle:** ' + [v.year, v.make, v.model].filter(Boolean).join(' ') + (v.vin ? ' (VIN: ' + v.vin + ')' : ''));
                }
            }
        }

        // Drivers
        if (Array.isArray(extractedData.drivers)) {
            for (const d of extractedData.drivers) {
                if (d.firstName || d.lastName) {
                    parts.push('**🪪 Driver:** ' + [d.firstName, d.lastName].filter(Boolean).join(' ') + (d.dob ? ' (DOB: ' + d.dob + ')' : ''));
                }
            }
        }

        // Coverage
        if (extractedData.liabilityLimits) parts.push('\n**📑 Auto Liability:** ' + extractedData.liabilityLimits);
        if (extractedData.dwellingCoverage) parts.push('**🏠 Dwelling Coverage:** $' + extractedData.dwellingCoverage);
        if (extractedData.priorCarrier) parts.push('**Prior Carrier:** ' + _esc(extractedData.priorCarrier));

        const pct = _countTotalExpected() > 0
            ? Math.round((_countFilled() / _countTotalExpected()) * 100) : 0;
        parts.push('\n**Progress:** ' + pct + '% (' + _countFilled() + '/' + _countTotalExpected() + ' fields)');

        _appendMsg('ai', '📋 **Intake Review:**\n\n' + parts.join('\n') + '\n\nEdit any field in the Data panel, or keep chatting to add more.');
    }

    // ── Phase 6a: Inline Field Edit ─────────────────────────────

    function _editField(key) {
        const fieldEl = document.querySelector('#iaExtractedPreview .ia-section-field[data-field-key="' + key + '"]');
        if (!fieldEl) return;

        const valueEl = fieldEl.querySelector('.ia-section-field-value');
        if (!valueEl || fieldEl.querySelector('.ia-field-edit-input')) return;

        const currentVal = extractedData[key] || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ia-field-edit-input';
        input.value = currentVal;
        input.setAttribute('aria-label', 'Edit field value');

        const originalHtml = valueEl.innerHTML;
        valueEl.innerHTML = '';
        valueEl.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
            const newVal = input.value.trim();
            if (newVal !== currentVal) {
                extractedData[key] = newVal;
                _saveHistory();
                _syncToAppData();
            }
            _renderPreview();
            _updateProgressRing();
        };

        const cancel = () => {
            input.removeEventListener('blur', save);
            _renderPreview();
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { cancel(); }
        });
    }

    // ── Phase 6b: Copy Snapshot ─────────────────────────────────

    function _copySnapshot() {
        if (!extractedData || Object.keys(extractedData).length === 0) {
            _toast('No data to copy yet');
            return;
        }

        const parts = [];
        if (extractedData.firstName || extractedData.lastName) {
            parts.push('Client: ' + [extractedData.firstName, extractedData.lastName].filter(Boolean).join(' '));
        }
        if (extractedData.dob) parts.push('DOB: ' + extractedData.dob);
        if (extractedData.qType) parts.push(extractedData.qType.charAt(0).toUpperCase() + extractedData.qType.slice(1) + ' quote');
        if (extractedData.addrStreet) {
            parts.push([extractedData.addrStreet, extractedData.addrCity, extractedData.addrState, extractedData.addrZip].filter(Boolean).join(', '));
        }
        if (extractedData.phone) parts.push('Ph: ' + extractedData.phone);
        if (extractedData.email) parts.push('Email: ' + extractedData.email);

        const text = parts.join(' | ');
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('iaCopyBtn');
                if (btn) {
                    const orig = btn.title;
                    btn.title = 'Copied!';
                    btn.classList.add('ia-copied');
                    setTimeout(() => { btn.title = orig; btn.classList.remove('ia-copied'); }, 1500);
                }
            }).catch(() => _toast('Copy failed'));
        }
    }

    // ── Phase 6d: Section counting helpers ──────────────────────

    function _countCompleteSections() {
        const qType = extractedData.qType || '';
        const groups = FIELD_GROUPS.filter(g => {
            if ((g.label === 'Home Coverage' || g.label === 'Home Details') && qType === 'auto') return false;
            if ((g.label === 'Auto Coverage' || g.label === 'Vehicles' || g.label === 'Drivers') && qType === 'home') return false;
            return true;
        });
        let complete = 0;
        for (const g of groups) {
            const filled = g.keys.filter(k => _hasField(k)).length;
            if (filled === g.keys.length && filled > 0) complete++;
        }
        return complete;
    }

    function _countVisibleSections() {
        const qType = extractedData.qType || '';
        return FIELD_GROUPS.filter(g => {
            if ((g.label === 'Home Coverage' || g.label === 'Home Details') && qType === 'auto') return false;
            if ((g.label === 'Auto Coverage' || g.label === 'Vehicles' || g.label === 'Drivers') && qType === 'home') return false;
            return true;
        }).length;
    }

    // ── Smart Suggestion Chips ──────────────────────────────────

    /** Get the last AI message content (for response triggers) */
    function _getLastAiMessage() {
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i].role === 'assistant') return chatHistory[i].content;
        }
        return null;
    }

    /**
     * Extract just the question portion of the AI's last message.
     * AI replies typically follow the pattern: "Got it, [confirmation]. [New question]"
     * We only want to match chips against the NEW question, not the confirmation of old data.
     */
    function _getLastAiQuestion() {
        const full = _getLastAiMessage();
        if (!full) return null;

        // Strip JSON code blocks — the AI appends structured data after every reply
        // that must not be matched against for chip suggestions
        const stripped = full.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim();
        if (!stripped) return null;

        // Split on double-newline (paragraph break) and take the last non-empty paragraph
        const paragraphs = stripped.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
        if (paragraphs.length > 1) {
            // Take the last paragraph — that's the new question
            return paragraphs[paragraphs.length - 1];
        }

        // Single paragraph — try splitting on sentence boundaries after confirmations
        // Look for the last question sentence (ends with ?)
        const sentences = stripped.split(/(?<=[.!])\s+/);
        const questionSentences = sentences.filter(s => s.trim().endsWith('?'));
        if (questionSentences.length > 0) {
            return questionSentences[questionSentences.length - 1];
        }

        // Fallback: return the full message (minus JSON)
        return stripped;
    }

    /** Determine which chips to show based on conversation state */
    function _computeSuggestionChips() {
        const chips = [];

        // Completion: show action chips when all critical fields are collected
        if (_completionShown && _checkCompletion()) {
            return [
                { label: '📤 Export to EZLynx', action: 'exportEZLynx', type: 'done' },
                { label: '📋 Review Answers', action: 'review', type: 'suggestion' },
                { label: '⚡ Populate Form', action: 'populate', type: 'suggestion' },
            ];
        }

        // Stage 1: Quick-start if no quote type known yet
        if (!extractedData.qType) {
            return [
                { label: '🏠 Home + Auto', qsType: 'home & auto bundle', type: 'start' },
                { label: '🏡 Home Only', qsType: 'homeowners', type: 'start' },
                { label: '🚗 Auto Only', qsType: 'auto', type: 'start' },
            ];
        }

        // Stage 2: Response-triggered suggestions from last AI message
        // Use only the question portion (last paragraph) to avoid matching
        // confirmation text from the previous topic
        const lastAiQuestion = _getLastAiQuestion();
        if (lastAiQuestion) {
            // Suppress chips for open-ended questions (name, address, email, DOB, VIN, etc.)
            const openEnded = /what\s*(is|'s|are)\s*(their|the|your|his|her)\s*(name|full\s*name|first\s*name|last\s*name|address|street|email|phone|number|date\s*of\s*birth|DOB|birthday|VIN)/i;
            const isOpenEnded = openEnded.test(lastAiQuestion);

            if (!isOpenEnded) {
                // Find the FIRST matching trigger only — don't accumulate from multiple
                for (const trigger of RESPONSE_TRIGGERS) {
                    if (trigger.pattern.test(lastAiQuestion)) {
                        const tc = typeof trigger.chips === 'function' ? trigger.chips() : trigger.chips;
                        for (const c of tc) chips.push({ ...c, type: 'suggestion' });
                        break; // Use only the first match — one topic at a time
                    }
                }
            }
        }

        // Phase 2: Satellite hazard scan chip
        if (extractedData.addrStreet && extractedData.addrCity && _propertyIntelLoaded && !_satelliteScanDone) {
            chips.push({ label: '🛰️ Scan Hazards', action: 'scanHazards', type: 'suggestion' });
        }

        // Stage 3: "Done — Apply" when enough fields collected
        if (_countFilled() >= 8) {
            chips.push({ label: '✅ Done — Apply', action: 'apply', type: 'done' });
        }

        return chips;
    }

    /** Render suggestion chips into the chip row */
    function _updateSuggestionChips() {
        const row = document.getElementById('iaChipRow');
        if (!row) return;

        const chips = _computeSuggestionChips();
        row.innerHTML = '';

        for (const chip of chips) {
            const btn = document.createElement('button');
            btn.className = 'ia-chip' + (chip.type ? ' ia-chip-' + chip.type : '');
            btn.textContent = chip.label;

            if (chip.action === 'apply') {
                btn.onclick = () => applyAndSend();
            } else if (chip.action === 'exportEZLynx') {
                btn.onclick = () => _navigateToEZLynx();
            } else if (chip.action === 'review') {
                btn.onclick = () => _showReviewSummary();
            } else if (chip.action === 'populate') {
                btn.onclick = () => populateForm();
            } else if (chip.action === 'scanHazards') {
                btn.onclick = () => _scanSatelliteHazards();
            } else if (chip.qsType) {
                btn.onclick = () => quickStart(chip.qsType);
            } else if (chip.text) {
                btn.onclick = () => chipSend(chip.text);
            }
            row.appendChild(btn);
        }

        if (chips.length > 0) {
            row.style.display = '';
            row.classList.remove('ia-chips-visible');
            void row.offsetWidth; // Force reflow for CSS transition
            row.classList.add('ia-chips-visible');
        } else {
            row.style.display = 'none';
        }

        // Re-scroll after chips change layout (chip row sits between messages and input,
        // so adding/removing chips resizes the messages container)
        _scrollToBottom();
    }

    /** Click a suggestion chip — pre-fill and auto-send */
    function chipSend(text) {
        const input = document.getElementById('iaInput');
        if (!input) return;
        // Clear chips immediately so new ones can appear after AI replies
        const chipRow = document.getElementById('iaChipRow');
        if (chipRow) { chipRow.innerHTML = ''; chipRow.style.display = 'none'; }
        input.value = text;
        _autoResize(input);
        sendMessage();
    }

    /** Open the current address in Google Maps */
    function openFullMap() {
        const address = _lastMapAddress;
        if (address) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
        }
    }

    /** Export current snapshot as formatted text to clipboard */
    function exportSnapshot() {
        if (!extractedData || Object.keys(extractedData).length === 0) {
            _toast('No data to export yet');
            return;
        }

        const lines = ['=== Insurance Intake Snapshot ===', `Generated: ${new Date().toLocaleString()}`, ''];

        const labels = {
            firstName: 'First Name', lastName: 'Last Name', prefix: 'Prefix',
            dob: 'Date of Birth', gender: 'Gender', maritalStatus: 'Marital Status',
            email: 'Email', phone: 'Phone',
            addrStreet: 'Street', addrCity: 'City', addrState: 'State', addrZip: 'Zip', county: 'County',
            education: 'Education', occupation: 'Occupation',
            qType: 'Quote Type', effectiveDate: 'Effective Date', policyTerm: 'Policy Term',
            occupancyType: 'Occupancy', dwellingUsage: 'Dwelling Usage', dwellingType: 'Dwelling Type',
            homePolicyType: 'Home Policy Type', dwellingCoverage: 'Dwelling Coverage (A)',
            personalLiability: 'Personal Liability', homeDeductible: 'Home Deductible',
            windDeductible: 'Wind Deductible',
            yearBuilt: 'Year Built', sqFt: 'Sq Ft', stories: 'Stories',
            constructionStyle: 'Construction', constructionType: 'Construction',
            exteriorWalls: 'Exterior Walls', foundation: 'Foundation',
            roofType: 'Roof Type', roofYear: 'Roof Year', heatingType: 'Heating',
            pool: 'Pool', trampoline: 'Trampoline', mortgagee: 'Mortgagee',
            liabilityLimits: 'Liability Limits (BI)', pdLimit: 'Property Damage Limit',
            compDeductible: 'Comp Deductible', autoDeductible: 'Collision Deductible',
            umLimits: 'UM/UIM Limits', residenceIs: 'Residence Type',
            coFirstName: 'Co-Applicant First', coLastName: 'Co-Applicant Last',
            priorCarrier: 'Prior Carrier', priorYears: 'Prior Years',
            priorLiabilityLimits: 'Prior Liability Limits', continuousCoverage: 'Years Continuous Coverage',
            homePriorCarrier: 'Home Prior Carrier', homePriorYears: 'Home Prior Years',
            accidents: 'Accidents (5yr)', violations: 'Violations (3yr)'
        };

        for (const [k, label] of Object.entries(labels)) {
            if (extractedData[k]) {
                lines.push(`${label}: ${extractedData[k]}`);
            }
        }

        if (Array.isArray(extractedData.vehicles)) {
            for (let i = 0; i < extractedData.vehicles.length; i++) {
                const v = extractedData.vehicles[i];
                if (!v.vin && !v.year && !v.make) continue;
                lines.push('');
                lines.push(`--- Vehicle ${i + 1} ---`);
                if (v.year) lines.push(`Year: ${v.year}`);
                if (v.make) lines.push(`Make: ${v.make}`);
                if (v.model) lines.push(`Model: ${v.model}`);
                if (v.vin) lines.push(`VIN: ${v.vin}`);
                if (v.use) lines.push(`Use: ${v.use}`);
                if (v.annualMiles) lines.push(`Annual Miles: ${v.annualMiles}`);
                if (v.ownershipType) lines.push(`Ownership: ${v.ownershipType}`);
            }
        }

        if (Array.isArray(extractedData.drivers)) {
            for (let i = 0; i < extractedData.drivers.length; i++) {
                const d = extractedData.drivers[i];
                if (!d.firstName && !d.lastName) continue;
                lines.push('');
                lines.push(`--- Driver ${i + 1} ---`);
                lines.push(`Name: ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`);
                if (d.dob) lines.push(`DOB: ${d.dob}`);
                if (d.gender) lines.push(`Gender: ${d.gender}`);
                if (d.relationship) lines.push(`Relationship: ${d.relationship}`);
                if (d.dlState) lines.push(`License State: ${d.dlState}`);
                if (d.dlNum) lines.push(`License #: ${d.dlNum}`);
            }
        }

        const pct = _countTotalExpected() > 0 ? Math.round((_countFilled() / _countTotalExpected()) * 100) : 0;
        lines.push('');
        lines.push(`Progress: ${pct}% complete (${_countFilled()} of ${_countTotalExpected()} fields)`);

        const txt = lines.join('\n');
        navigator.clipboard.writeText(txt).then(() => {
            _toast('📋 Snapshot copied to clipboard!');
        }).catch(() => {
            _toast('Failed to copy — check clipboard permissions');
        });
    }

    /** Reset sidebar on chat clear */
    function _resetIntelPanel() {
        _lastMapAddress = '';
        _lastPropertyIntelAddress = '';
        const header = document.getElementById('iaSidebarHeader');
        if (header) header.style.display = 'none';
        const empty = document.getElementById('iaSidebarEmpty');
        if (empty) empty.style.display = '';
        const preview = document.getElementById('iaExtractedPreview');
        if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
        const mapPanel = document.getElementById('iaMapPanel');
        if (mapPanel) mapPanel.style.display = 'none';
        const vehPanel = document.getElementById('iaVehiclePanel');
        if (vehPanel) vehPanel.style.display = 'none';
        // Reset intel cards
        const marketCard = document.getElementById('iaMarketIntelCard');
        if (marketCard) marketCard.style.display = 'none';
        const insuranceCard = document.getElementById('iaInsuranceTrendCard');
        if (insuranceCard) insuranceCard.style.display = 'none';
        // Reset progress ring
        const arc = document.getElementById('iaProgressArc');
        if (arc) arc.setAttribute('stroke-dashoffset', '94.2');
        const pctLabel = document.getElementById('iaProgressPercent');
        if (pctLabel) pctLabel.textContent = '0';
        const badge = document.getElementById('iaTabBadge');
        if (badge) { badge.textContent = '0/0'; badge.style.display = 'none'; }
        // Reset map images
        for (const id of ['iaStreetView', 'iaSatelliteView']) {
            const img = document.getElementById(id);
            if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
        }
        for (const id of ['iaStreetViewEmpty', 'iaSatelliteEmpty']) {
            const el = document.getElementById(id);
            if (el) { el.textContent = 'Awaiting address...'; el.style.display = ''; }
        }
    }

    /** Mobile tab switching (chat ↔ data) */
    function switchTab(tab) {
        const layout = document.querySelector('.ia-layout');
        if (!layout) return;
        layout.setAttribute('data-active-tab', tab);
        document.querySelectorAll('.ia-tab').forEach(t => {
            t.classList.toggle('ia-tab-active', t.getAttribute('data-tab') === tab);
        });
    }

    /** Strip JSON code blocks from AI messages before display */
    function _stripJSONBlocks(text) {
        if (!text) return text;
        return text.replace(/```(?:json)?\s*\n?\{[\s\S]*?\}\n?```/g, '').trim();
    }

    return {
        init, sendMessage, quickStart, applyAndSend, populateForm, clearChat,
        exportSnapshot, openFullMap, chipSend, switchTab,
        _editField, _copySnapshot, scanHazards: _scanSatelliteHazards,
        _showReviewSummary, _navigateToEZLynx, _syncToAppData, _checkCompletion
    };
})();
