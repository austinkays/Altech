/**
 * IntakeAssist — Conversational AI Intake Assistant
 *
 * Lets agents describe a client in natural language.
 * Uses AIProvider.chat() for multi-turn conversation to collect
 * all insurance intake fields, then populates the main intake form.
 *
 * Storage key: altech_intake_assist (chat history across sessions)
 */
window.IntakeAssist = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_intake_assist';
    let chatHistory = [];    // [{ role: 'user'|'assistant', content: string }]
    let extractedData = {};
    let initialized = false;

    const SYSTEM_PROMPT = `You are a fast, friendly intake assistant for an insurance agent. Your job is to gather ALL the client information needed to run real insurance quotes through EZLynx. Be thorough — missing fields mean quotes won't rate.

GATHER FIELDS IN THIS ORDER:

PHASE 1 — IDENTITY & COVERAGE TYPE:
- Full name (first, last, prefix: Mr./Ms./Mrs./Dr.)
- Date of birth (YYYY-MM-DD), gender, marital status
- Email, phone
- Address (street, city, state 2-letter, zip, county)
- Quote type: "home", "auto", or "both"
- Desired effective date (when coverage should start)

PHASE 2 — COVERAGE SELECTIONS (critical for rating!):
For HOME quotes: occupancy type (Owner Occupied/Tenant), dwelling type (One Family/Condo/Townhome/Mobile Home), home policy type (HO3/HO5/HO4/HO6), estimated dwelling value (Coverage A dollar amount), personal liability limit ($100K-$500K), home deductible ($500-$5,000)
For AUTO quotes: desired liability limits (e.g. 100/300), property damage limit, comp deductible, collision deductible, uninsured motorist limits

PHASE 3 — PROPERTY & VEHICLE DETAILS:
For HOME: year built, sqft, stories, construction style, exterior walls, foundation type, roof type (Composition Shingle/Metal/Tile/Slate/Wood Shake), roof year, heating type, pool (Yes/No), trampoline (Yes/No), mortgage company
For AUTO: each vehicle (year, make, model, VIN), vehicle use (Commute/Pleasure/Business), annual miles, ownership (Owned/Leased/Lien). Each driver: name, DOB, gender, relationship (Self/Spouse/Child/Other), license state, license #, age first licensed

PHASE 4 — HISTORY & WRAP-UP:
- Prior carrier, years with carrier, prior liability limits, years continuous coverage
- Any accidents or violations in last 5 years (count)
- Co-applicant info if any (name, DOB, gender, relationship)
- Education level, occupation (these affect rates — ask naturally)
- Home prior carrier + years if different from auto
- Residence type for auto (Home Owned/Apartment/Condo)

CRITICAL RULES:
1. NEVER ask for information you can deduce. If the user gives a VIN and a system note provides the decoded year/make/model, USE that data — do NOT ask for year, make, or model again.
2. If you know the zip code for a US city (e.g. Happy Valley OR = 97086, Vancouver WA = 98660), fill it in and confirm rather than asking.
3. When the user says "no" to a field (e.g. "no email"), accept it and move on — never re-ask.
4. Parse everything the user gives you in each message. If they provide multiple pieces of data in one reply, acknowledge ALL of them.
5. System notes in [brackets] contain enrichment data (e.g. VIN decodes). Trust and use this data directly.
6. Use common sense and general knowledge. If the user mentions a well-known city, you likely know its zip code, state, and area codes — use that knowledge.
7. For coverage selections, suggest common defaults when the agent doesn't specify (e.g. "I'll note 100/300 liability — want different limits?"). This keeps the conversation fast.

Ask 2-3 questions at a time to keep the pace fast. Group related questions together (e.g. ask all deductibles at once, ask coverage limits together). Keep replies concise and friendly.

IMPORTANT — AFTER EVERY REPLY, append a JSON code block containing ALL fields collected SO FAR (not just what was gathered in this turn). This allows real-time progress tracking. Use EXACTLY these keys:
\`\`\`json
{"firstName":"","lastName":"","prefix":"","dob":"","gender":"Male|Female","maritalStatus":"Single|Married|Divorced|Widowed","email":"","phone":"","addrStreet":"","addrCity":"","addrState":"XX","addrZip":"","county":"","education":"","occupation":"","qType":"home|auto|both","effectiveDate":"YYYY-MM-DD","policyTerm":"6 Month|12 Month","occupancyType":"Owner Occupied|Tenant","dwellingUsage":"Primary|Secondary|Seasonal","dwellingType":"One Family|Condo|Townhome|Mobile Home","homePolicyType":"HO3|HO5|HO4|HO6","dwellingCoverage":"","personalLiability":"","homeDeductible":"","windDeductible":"","yearBuilt":"","sqFt":"","stories":"","constructionStyle":"","exteriorWalls":"","foundation":"","roofType":"","roofYear":"","heatingType":"","pool":"Yes|No","trampoline":"Yes|No","mortgagee":"","liabilityLimits":"","pdLimit":"","compDeductible":"","autoDeductible":"","umLimits":"","residenceIs":"","vehicles":[{"year":"","make":"","model":"","vin":"","use":"Commute|Pleasure|Business","annualMiles":"","ownershipType":"Owned|Leased|Lien"}],"drivers":[{"firstName":"","lastName":"","dob":"","gender":"","relationship":"Self|Spouse|Child|Other","dlState":"","dlNum":"","ageLicensed":""}],"coFirstName":"","coLastName":"","priorCarrier":"","priorYears":"","priorLiabilityLimits":"","continuousCoverage":"","homePriorCarrier":"","homePriorYears":"","accidents":"0","violations":"0"}
\`\`\`

Only include keys for which you have data. Omit empty fields. Use 2-letter state codes. Format dates as YYYY-MM-DD. Include this JSON block in EVERY response, even partial ones — this is how the form tracks progress in real time.`;

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
                _appendMsg('ai', '⚠️ No AI provider configured. Open **Settings → AI Model** and add your API key to use this feature.');
                _updateSuggestionChips();
                return;
            }

            const result = await AIProvider.chat(SYSTEM_PROMPT, chatHistory, {
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
                _renderPreview();
                _updateIntelPanel();
            }
            _updateSuggestionChips();
        } catch (err) {
            _hideTyping();
            _appendMsg('ai', '⚠️ ' + (err.message || 'Could not reach AI. Please check your settings.'));
            _updateSuggestionChips();
        }
    }

    /** Pre-fill input with a quick-start message and focus */
    function quickStart(coverageType) {
        const input = document.getElementById('iaInput');
        if (!input) return;
        input.value = 'New ' + coverageType + ' quote.';
        _autoResize(input);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
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
            'firstName', 'lastName', 'dob', 'email', 'phone',
            'addrStreet', 'addrCity', 'addrZip', 'county',
            'yearBuilt', 'sqFt', 'stories', 'constructionType', 'constructionStyle',
            'roofYear', 'mortgagee', 'coFirstName', 'coLastName',
            'effectiveDate', 'dwellingCoverage',
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
            'prefix', 'gender', 'maritalStatus', 'education', 'occupation',
            'occupancyType', 'dwellingUsage', 'dwellingType', 'homePolicyType',
            'personalLiability', 'homeDeductible', 'windDeductible',
            'exteriorWalls', 'foundation', 'roofType', 'heatingType',
            'pool', 'trampoline',
            'liabilityLimits', 'pdLimit', 'compDeductible', 'autoDeductible',
            'umLimits', 'residenceIs', 'policyTerm',
            'priorLiabilityLimits', 'continuousCoverage',
            'homePriorCarrier', 'homePriorYears',
        ];
        for (const key of selectFields) {
            if (extractedData[key]) {
                const el = document.getElementById(key);
                if (el) {
                    el.value = extractedData[key];
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
                for (const d of extractedData.drivers) {
                    if (!d.firstName && !d.lastName && !d.dob) continue;
                    const id = `driver_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    const driver = {
                        id,
                        firstName: d.firstName || '',
                        lastName: d.lastName || '',
                        dob: d.dob || '',
                        gender: d.gender || '',
                        maritalStatus: d.maritalStatus || '',
                        relationship: d.relationship || 'Self',
                        dlState: d.dlState || (extractedData.addrState || ''),
                        dlNum: d.dlNum || '',
                        ageLicensed: d.ageLicensed || '',
                        occupation: '',
                        education: '',
                    };
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
            _appendMsg('ai', "Hi! 👋 I'm your AI intake assistant. Tell me about your client — start with their name and what type of insurance they need (home, auto, or both)!");
        } else {
            for (const m of chatHistory) {
                // Skip system enrichment notes (VIN decode, etc.) — AI-only context
                if (m.content && m.content.startsWith('[System note')) continue;
                _appendMsg(m.role === 'user' ? 'user' : 'ai', m.content, false);
            }
        }

        if (Object.keys(extractedData).length > 0) {
            _renderPreview();
            _updateIntelPanel();
        }
        _updateSuggestionChips();
    }

    function _appendMsg(role, text, scroll = true) {
        const msgs = document.getElementById('iaChatMessages');
        if (!msgs) return;

        const div = document.createElement('div');
        div.className = 'ia-msg ia-msg-' + role;
        div.innerHTML = _renderMarkdown(text);
        msgs.appendChild(div);

        if (scroll) msgs.scrollTop = msgs.scrollHeight;
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
        msgs.scrollTop = msgs.scrollHeight;

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
        const preview = document.getElementById('iaExtractedPreview');
        if (!preview) return;

        const labels = {
            firstName: 'First Name', lastName: 'Last Name', prefix: 'Prefix',
            dob: 'Date of Birth', gender: 'Gender', maritalStatus: 'Marital Status',
            email: 'Email', phone: 'Phone',
            addrStreet: 'Street', addrCity: 'City', addrState: 'State', addrZip: 'Zip', county: 'County',
            education: 'Education', occupation: 'Occupation',
            qType: 'Quote Type', effectiveDate: 'Effective Date', policyTerm: 'Policy Term',
            occupancyType: 'Occupancy', dwellingUsage: 'Dwelling Usage', dwellingType: 'Dwelling Type',
            homePolicyType: 'Home Policy', dwellingCoverage: 'Dwelling Coverage',
            personalLiability: 'Personal Liability', homeDeductible: 'Home Deductible',
            windDeductible: 'Wind Deductible',
            yearBuilt: 'Year Built', sqFt: 'Sq Ft', stories: 'Stories',
            constructionStyle: 'Construction', constructionType: 'Construction',
            exteriorWalls: 'Exterior Walls', foundation: 'Foundation',
            roofType: 'Roof Type', roofYear: 'Roof Year', heatingType: 'Heating',
            pool: 'Pool', trampoline: 'Trampoline', mortgagee: 'Mortgagee',
            liabilityLimits: 'Liability Limits', pdLimit: 'Property Damage',
            compDeductible: 'Comp Deductible', autoDeductible: 'Collision Deductible',
            umLimits: 'UM/UIM Limits', residenceIs: 'Residence Type',
            coFirstName: 'Co-Applicant First', coLastName: 'Co-Applicant Last',
            priorCarrier: 'Prior Carrier', priorYears: 'Prior Years',
            priorLiabilityLimits: 'Prior Limits', continuousCoverage: 'Continuous Coverage',
            homePriorCarrier: 'Home Prior Carrier', homePriorYears: 'Home Prior Years',
            accidents: 'Accidents', violations: 'Violations'
        };

        const rows = Object.entries(extractedData)
            .filter(([k, v]) => v && k !== 'vehicles' && k !== 'drivers' && labels[k])
            .map(([k, v]) => `<div class="ia-field-row">
                <span class="ia-field-label">${labels[k]}</span>
                <span class="ia-field-value">${_esc(String(v))}</span>
            </div>`)
            .join('');

        if (!rows) return;

        const vehicleNote = Array.isArray(extractedData.vehicles) && extractedData.vehicles.length
            ? `<p class="ia-vehicles-note">🚗 ${extractedData.vehicles.length} vehicle(s) detected</p>`
            : '';

        const driverNote = Array.isArray(extractedData.drivers) && extractedData.drivers.length
            ? `<p class="ia-vehicles-note">🪪 ${extractedData.drivers.length} driver(s) detected</p>`
            : '';

        preview.style.display = 'block';
        preview.innerHTML = `
            <div class="ia-preview-header">
                <span>📋 Extracted Fields</span>
                <button class="ia-populate-btn" onclick="IntakeAssist.populateForm()">⚡ Populate Form</button>
            </div>
            <div class="ia-field-grid">${rows}</div>
            ${vehicleNote}
            ${driverNote}
        `;
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

    // ── Intelligence Panel (real-time visual context) ─────────────

    /** All trackable field categories with their keys and labels */
    const FIELD_GROUPS = [
        { label: 'Client', icon: '👤', keys: ['firstName', 'lastName', 'dob', 'gender', 'maritalStatus'] },
        { label: 'Contact', icon: '📞', keys: ['phone', 'email'] },
        { label: 'Address', icon: '📍', keys: ['addrStreet', 'addrCity', 'addrState', 'addrZip'] },
        { label: 'Policy', icon: '📋', keys: ['qType', 'effectiveDate'] },
        { label: 'Home Coverage', icon: '🏠', keys: ['homePolicyType', 'dwellingCoverage', 'personalLiability', 'homeDeductible', 'occupancyType'] },
        { label: 'Home Details', icon: '🏗️', keys: ['yearBuilt', 'sqFt', 'stories', 'roofType', 'roofYear', 'foundation'] },
        { label: 'Auto Coverage', icon: '📑', keys: ['liabilityLimits', 'compDeductible', 'autoDeductible'] },
        { label: 'Vehicles', icon: '🚗', keys: ['vehicles'] },
        { label: 'Drivers', icon: '🪪', keys: ['drivers'] },
        { label: 'History', icon: '📁', keys: ['priorCarrier', 'priorYears', 'accidents', 'violations'] },
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
        const panel = document.getElementById('iaIntelPanel');
        if (!panel) return;

        const hasData = Object.keys(extractedData).length > 0;
        panel.style.display = hasData ? 'block' : 'none';
        if (!hasData) return;

        _updateProgressRing();
        _updateFieldChecklist();
        _updateMapViews();
        _updateVehiclePanel();
    }

    /** Compute and animate the progress ring */
    function _updateProgressRing() {
        const totalFields = _countTotalExpected();
        const filledFields = _countFilled();
        const pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

        const arc = document.getElementById('iaProgressArc');
        const label = document.getElementById('iaProgressPercent');
        if (arc) {
            const circumference = 2 * Math.PI * 34; // r=34
            arc.setAttribute('stroke-dashoffset', String(circumference - (circumference * pct / 100)));
            // Color: blue → green as it fills
            if (pct >= 80) arc.setAttribute('stroke', 'var(--success)');
            else if (pct >= 50) arc.setAttribute('stroke', 'var(--apple-blue)');
            else arc.setAttribute('stroke', 'var(--apple-blue)');
        }
        if (label) label.textContent = String(pct);
    }

    function _countTotalExpected() {
        // Dynamic based on qType
        const qType = extractedData.qType || '';
        let total = 5 + 2 + 4 + 2 + 4; // client(5) + contact(2) + address(4) + policy(2) + history(4)
        if (qType === 'home' || qType === 'both') total += 5 + 6; // home coverage(5) + home details(6)
        if (qType === 'auto' || qType === 'both') total += 3 + 1 + 1; // auto coverage(3) + vehicles(1) + drivers(1)
        if (!qType) total += 5; // estimate before type known
        return total;
    }

    function _countFilled() {
        let count = 0;
        const simple = ['firstName', 'lastName', 'dob', 'gender', 'maritalStatus',
            'phone', 'email',
            'addrStreet', 'addrCity', 'addrState', 'addrZip',
            'qType', 'effectiveDate',
            'homePolicyType', 'dwellingCoverage', 'personalLiability', 'homeDeductible', 'occupancyType',
            'yearBuilt', 'sqFt', 'stories', 'roofType', 'roofYear', 'foundation',
            'constructionType', 'constructionStyle',
            'liabilityLimits', 'compDeductible', 'autoDeductible',
            'priorCarrier', 'priorYears', 'accidents', 'violations'];
        for (const k of simple) {
            if (extractedData[k]) count++;
        }
        if (Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0) {
            const v = extractedData.vehicles[0];
            if (v.vin || v.year || v.make) count++;
        }
        if (Array.isArray(extractedData.drivers) && extractedData.drivers.length > 0) {
            const d = extractedData.drivers[0];
            if (d.firstName || d.dob || d.dlNum) count++;
        }
        return count;
    }

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

    // ── Smart Suggestion Chips ──────────────────────────────────

    /** Get the last AI message content (for response triggers) */
    function _getLastAiMessage() {
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i].role === 'assistant') return chatHistory[i].content;
        }
        return null;
    }

    /** Determine which chips to show based on conversation state */
    function _computeSuggestionChips() {
        const chips = [];

        // Stage 1: Quick-start if no quote type known yet
        if (!extractedData.qType) {
            return [
                { label: '🏠 Home + Auto', qsType: 'home & auto bundle', type: 'start' },
                { label: '🏡 Home Only', qsType: 'homeowners', type: 'start' },
                { label: '🚗 Auto Only', qsType: 'auto', type: 'start' },
            ];
        }

        // Stage 2: Response-triggered suggestions from last AI message
        const lastAiMsg = _getLastAiMessage();
        if (lastAiMsg) {
            for (const trigger of RESPONSE_TRIGGERS) {
                if (trigger.pattern.test(lastAiMsg)) {
                    const tc = typeof trigger.chips === 'function' ? trigger.chips() : trigger.chips;
                    for (const c of tc) chips.push({ ...c, type: 'suggestion' });
                }
            }
            // Cap at 5 to avoid clutter
            if (chips.length > 5) chips.length = 5;
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
    }

    /** Click a suggestion chip — pre-fill and auto-send */
    function chipSend(text) {
        const input = document.getElementById('iaInput');
        if (!input) return;
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

    /** Reset intelligence panel on chat clear */
    function _resetIntelPanel() {
        _lastMapAddress = '';
        const panel = document.getElementById('iaIntelPanel');
        if (panel) panel.style.display = 'none';
        const mapPanel = document.getElementById('iaMapPanel');
        if (mapPanel) mapPanel.style.display = 'none';
        const vehPanel = document.getElementById('iaVehiclePanel');
        if (vehPanel) vehPanel.style.display = 'none';
        // Reset images
        for (const id of ['iaStreetView', 'iaSatelliteView']) {
            const img = document.getElementById(id);
            if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
        }
        for (const id of ['iaStreetViewEmpty', 'iaSatelliteEmpty']) {
            const el = document.getElementById(id);
            if (el) { el.textContent = 'Awaiting address...'; el.style.display = ''; }
        }
    }

    return { init, sendMessage, quickStart, applyAndSend, populateForm, clearChat, exportSnapshot, openFullMap, chipSend };
})();
