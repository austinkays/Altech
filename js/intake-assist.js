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

    const SYSTEM_PROMPT = `You are a fast, friendly intake assistant for an insurance agent. Your job is to gather client information through a natural conversation.

Collect these fields as the conversation progresses:
- Full name (first, last, prefix: Mr./Ms./Mrs./Dr.)
- Date of birth (output as YYYY-MM-DD)
- Email and phone (if user says "no email" or similar, skip it — don't re-ask)
- Current address (street, city, state 2-letter abbreviation, zip)
- Quote type: "home" (home only), "auto" (auto only), or "both" (home + auto bundle)
- For HOME: year built, square footage, stories, construction type (Frame/Masonry/Superior), roof year, mortgage company
- For AUTO: vehicle details (year, make, model, VIN), each driver (name, DOB, license number)
- Co-applicant info if any (first name, last name)
- Prior insurance carrier and years insured

IMPORTANT RULES:
1. NEVER ask for information you can deduce. If the user gives a VIN and a system note provides the decoded year/make/model, USE that data — do NOT ask for year, make, or model again.
2. If you know the zip code for a US city (e.g. Happy Valley OR = 97086, Vancouver WA = 98660), fill it in and confirm rather than asking.
3. When the user says "no" to a field (e.g. "no email"), accept it and move on — never re-ask.
4. Parse everything the user gives you in each message. If they provide multiple pieces of data in one reply, acknowledge ALL of them.
5. System notes in [brackets] contain enrichment data (e.g. VIN decodes). Trust and use this data directly.

Ask 2-3 questions at a time to keep the pace fast. Keep your replies concise and friendly.

When you have gathered all relevant data (or the agent says "done" / "that's it" / "apply"), output:
1. A brief confirmation sentence
2. A JSON code block with ALL collected fields using EXACTLY these keys:
{"firstName":"","lastName":"","prefix":"","dob":"YYYY-MM-DD","email":"","phone":"","addrStreet":"","addrCity":"","addrState":"XX","addrZip":"","qType":"home|auto|both","yearBuilt":"","sqFt":"","stories":"","constructionType":"","roofYear":"","mortgagee":"","coFirstName":"","coLastName":"","priorCarrier":"","priorYears":"","vehicles":[{"year":"","make":"","model":"","vin":""}]}

Only include keys for which you have data. Omit empty fields. Use 2-letter state codes. Format DOB as YYYY-MM-DD.`;

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
                _renderPreview();
            }
        } catch (err) {
            _hideTyping();
            _appendMsg('ai', '⚠️ ' + (err.message || 'Could not reach AI. Please check your settings.'));
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

        // Simple text/date fields
        const simpleFields = [
            'firstName', 'lastName', 'dob', 'email', 'phone',
            'addrStreet', 'addrCity', 'addrZip',
            'yearBuilt', 'sqFt', 'stories', 'constructionType',
            'roofYear', 'mortgagee', 'coFirstName', 'coLastName'
        ];
        for (const key of simpleFields) {
            if (extractedData[key]) {
                const el = document.getElementById(key);
                if (el) {
                    el.value = extractedData[key];
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    populated++;
                }
            }
        }

        // Prefix <select>
        if (extractedData.prefix) {
            const el = document.getElementById('prefix');
            if (el) {
                el.value = extractedData.prefix;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                populated++;
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
                        use: 'Commute',
                        miles: '12000',
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
        }
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
            dob: 'Date of Birth', email: 'Email', phone: 'Phone',
            addrStreet: 'Street', addrCity: 'City', addrState: 'State', addrZip: 'Zip',
            qType: 'Quote Type', yearBuilt: 'Year Built', sqFt: 'Sq Ft',
            stories: 'Stories', constructionType: 'Construction',
            roofYear: 'Roof Year', mortgagee: 'Mortgagee',
            coFirstName: 'Co-First Name', coLastName: 'Co-Last Name',
            priorCarrier: 'Prior Carrier', priorYears: 'Prior Years'
        };

        const rows = Object.entries(extractedData)
            .filter(([k, v]) => v && k !== 'vehicles' && labels[k])
            .map(([k, v]) => `<div class="ia-field-row">
                <span class="ia-field-label">${labels[k]}</span>
                <span class="ia-field-value">${_esc(String(v))}</span>
            </div>`)
            .join('');

        if (!rows) return;

        const vehicleNote = Array.isArray(extractedData.vehicles) && extractedData.vehicles.length
            ? `<p class="ia-vehicles-note">🚗 ${extractedData.vehicles.length} vehicle(s) detected — add in the intake form's Auto section.</p>`
            : '';

        preview.style.display = 'block';
        preview.innerHTML = `
            <div class="ia-preview-header">
                <span>📋 Extracted Fields</span>
                <button class="ia-populate-btn" onclick="IntakeAssist.populateForm()">⚡ Populate Form</button>
            </div>
            <div class="ia-field-grid">${rows}</div>
            ${vehicleNote}
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

    return { init, sendMessage, quickStart, applyAndSend, populateForm, clearChat };
})();
