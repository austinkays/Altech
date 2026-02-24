/**
 * IntakeAssist — Conversational AI Intake Assistant (Enhanced)
 *
 * Visual real-time intake with:
 *  - Progress dashboard tracking completion %
 *  - Categorized data cards (Personal/Address/Property/Auto/Insurance)
 *  - Real-time property intelligence auto-fetch
 *  - Risk assessment badges
 *  - Smart context-aware suggestion chips
 *  - Driver license / document upload
 *  - Vehicle visual cards
 *
 * Storage key: altech_intake_assist (chat history across sessions)
 */
window.IntakeAssist = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_intake_assist';
    let chatHistory = [];    // [{ role: 'user'|'assistant', content: string }]
    let extractedData = {};
    let propertyIntel = null;   // cached property intelligence results
    let riskFlags = [];         // detected risk factors
    let initialized = false;
    let _propertyFetchInFlight = false;

    // ── Field categories for progress tracking ───────────────────
    const FIELD_CATEGORIES = {
        personal: {
            label: 'Personal', icon: '👤', color: '#007AFF',
            fields: ['firstName', 'lastName', 'prefix', 'dob', 'email', 'phone']
        },
        address: {
            label: 'Address', icon: '📍', color: '#FF9500',
            fields: ['addrStreet', 'addrCity', 'addrState', 'addrZip']
        },
        property: {
            label: 'Property', icon: '🏠', color: '#34C759',
            fields: ['yearBuilt', 'sqFt', 'stories', 'constructionType', 'roofYear', 'mortgagee']
        },
        auto: {
            label: 'Auto', icon: '🚗', color: '#FF3B30',
            fields: ['vehicles']
        },
        insurance: {
            label: 'Insurance', icon: '🛡️', color: '#AF52DE',
            fields: ['qType', 'priorCarrier', 'priorYears', 'coFirstName', 'coLastName']
        }
    };

    const SYSTEM_PROMPT = `You are a fast, friendly intake assistant for an insurance agent. Your job is to gather client information through a natural conversation.

Collect these fields as the conversation progresses:
- Full name (first, last, prefix: Mr./Ms./Mrs./Dr.)
- Date of birth (output as YYYY-MM-DD)
- Email and phone
- Current address (street, city, state 2-letter abbreviation, zip)
- Quote type: "home" (home only), "auto" (auto only), or "both" (home + auto bundle)
- For HOME: year built, square footage, stories, construction type (Frame/Masonry/Superior), roof year, mortgage company
- For AUTO: vehicle details (year, make, model, VIN), each driver (name, DOB, license number)
- Co-applicant info if any (first name, last name)
- Prior insurance carrier and years insured

Ask 2-3 questions at a time to keep the pace fast. Keep your replies concise and friendly.

IMPORTANT: After every user reply, output a partial JSON block with whatever fields you've collected so far (even if incomplete). This lets the form update in real-time. Wrap the JSON in a code fence tagged \`\`\`json.

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

        // DL upload handler
        const dlInput = document.getElementById('iaDlUpload');
        if (dlInput) {
            dlInput.addEventListener('change', _handleDlUpload);
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
            if (typeof AIProvider === 'undefined' || !AIProvider.isConfigured()) {
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
                const prevAddr = _getAddressKey(extractedData);
                extractedData = Object.assign(extractedData, extracted);
                _saveHistory();
                _renderProgress();
                _renderDataCards();
                _updateSmartChips();

                // Auto-fetch property intelligence when address is newly complete
                const newAddr = _getAddressKey(extractedData);
                if (newAddr && newAddr !== prevAddr && !_propertyFetchInFlight) {
                    _fetchPropertyIntelligence();
                }

                // Check for risk flags
                _assessRisks();
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

        // Merge property intelligence data into extractedData for population
        const mergedData = Object.assign({}, extractedData);
        if (propertyIntel) {
            if (propertyIntel.yearBuilt && !mergedData.yearBuilt) mergedData.yearBuilt = String(propertyIntel.yearBuilt);
            if ((propertyIntel.sqftGross || propertyIntel.sqFt) && !mergedData.sqFt) mergedData.sqFt = String(propertyIntel.sqftGross || propertyIntel.sqFt);
            if (propertyIntel.stories && !mergedData.stories) mergedData.stories = String(propertyIntel.stories);
            if (propertyIntel.constructionType && !mergedData.constructionType) mergedData.constructionType = propertyIntel.constructionType;

        }

        // Simple text/date fields
        const simpleFields = [
            'firstName', 'lastName', 'dob', 'email', 'phone',
            'addrStreet', 'addrCity', 'addrZip',
            'yearBuilt', 'sqFt', 'stories', 'constructionType',
            'roofYear', 'mortgagee', 'coFirstName', 'coLastName'
        ];
        for (const key of simpleFields) {
            if (mergedData[key]) {
                const el = document.getElementById(key);
                if (el) {
                    el.value = mergedData[key];
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    populated++;
                }
            }
        }

        // Prefix <select>
        if (mergedData.prefix) {
            const el = document.getElementById('prefix');
            if (el) {
                el.value = mergedData.prefix;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                populated++;
            }
        }

        // State <select> — match by 2-letter code or full name
        if (mergedData.addrState) {
            const el = document.getElementById('addrState');
            if (el) {
                const raw = mergedData.addrState.trim();
                const code = _resolveStateCode(raw);
                if (code) {
                    el.value = code;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    populated++;
                }
            }
        }

        // Prior carrier
        if (mergedData.priorCarrier) {
            const el = document.getElementById('priorCarrier');
            if (el) {
                el.value = mergedData.priorCarrier;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                populated++;
            }
        }

        // Prior years
        if (mergedData.priorYears) {
            const el = document.getElementById('priorYears');
            if (el) {
                el.value = mergedData.priorYears;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                populated++;
            }
        }

        // Quote type radio buttons (home / auto / both)
        if (mergedData.qType) {
            const radio = document.querySelector('input[name="qType"][value="' + mergedData.qType + '"]');
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof App !== 'undefined' && typeof App.handleType === 'function') {
                    App.handleType();
                }
                populated++;
            }
        }

        // Persist to App storage
        if (typeof App !== 'undefined' && typeof App.save === 'function') {
            App.save();
        }

        if (populated > 0) {
            _toast('\u2705 ' + populated + ' field' + (populated !== 1 ? 's' : '') + ' populated — review in the intake form.');
            setTimeout(() => {
                if (typeof App !== 'undefined' && typeof App.navigateTo === 'function') {
                    App.navigateTo('quoting');
                }
            }, 900);
        } else {
            _toast('No matching fields found — try continuing the conversation.');
        }
    }

    /** Manually trigger property intelligence lookup */
    function fetchPropertyData() {
        if (!extractedData.addrStreet || !extractedData.addrCity || !extractedData.addrState) {
            _toast('Need at least street, city, and state to look up property data.');
            return;
        }
        _fetchPropertyIntelligence();
    }

    /** Trigger DL scan file picker */
    function triggerDlUpload() {
        const dlInput = document.getElementById('iaDlUpload');
        if (dlInput) dlInput.click();
    }

    /** Clear chat history and reset extracted data */
    function clearChat() {
        chatHistory = [];
        extractedData = {};
        propertyIntel = null;
        riskFlags = [];
        _saveHistory();

        const msgs = document.getElementById('iaChatMessages');
        if (msgs) msgs.innerHTML = '';

        _renderProgress();
        _renderDataCards();
        _renderRiskBadges();
        _updateSmartChips();

        const propPanel = document.getElementById('iaPropertyIntel');
        if (propPanel) { propPanel.style.display = 'none'; propPanel.innerHTML = ''; }

        _appendMsg('ai', "Chat cleared! Tell me about your next client — start with their name and what coverage they need.");
    }

    // ── Private: Progress Dashboard ───────────────────────────────

    function _renderProgress() {
        const container = document.getElementById('iaProgressDashboard');
        if (!container) return;

        const qType = extractedData.qType || 'both';
        let totalFields = 0;
        let filledFields = 0;
        const bars = [];

        for (const [catKey, cat] of Object.entries(FIELD_CATEGORIES)) {
            // Skip property fields for auto-only, skip auto fields for home-only
            if (catKey === 'property' && qType === 'auto') continue;
            if (catKey === 'auto' && qType === 'home') continue;

            let catTotal = cat.fields.length;
            let catFilled = 0;
            for (const f of cat.fields) {
                if (f === 'vehicles') {
                    if (Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0) catFilled++;
                } else {
                    if (extractedData[f]) catFilled++;
                }
            }
            totalFields += catTotal;
            filledFields += catFilled;
            const pct = catTotal > 0 ? Math.round((catFilled / catTotal) * 100) : 0;

            bars.push('<div class="ia-prog-category">' +
                '<div class="ia-prog-cat-header">' +
                    '<span>' + cat.icon + ' ' + cat.label + '</span>' +
                    '<span class="ia-prog-cat-count">' + catFilled + '/' + catTotal + '</span>' +
                '</div>' +
                '<div class="ia-prog-bar-track">' +
                    '<div class="ia-prog-bar-fill" style="width:' + pct + '%;background:' + cat.color + '"></div>' +
                '</div>' +
            '</div>');
        }

        const overallPct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
        const circumference = 2 * Math.PI * 38;
        const dashOffset = circumference - (circumference * overallPct / 100);

        container.style.display = 'block';
        container.innerHTML =
            '<div class="ia-progress-inner">' +
                '<div class="ia-progress-ring-wrap">' +
                    '<svg class="ia-progress-ring" viewBox="0 0 84 84">' +
                        '<circle class="ia-ring-bg" cx="42" cy="42" r="38"/>' +
                        '<circle class="ia-ring-fill" cx="42" cy="42" r="38" ' +
                            'stroke-dasharray="' + circumference.toFixed(1) + '" ' +
                            'stroke-dashoffset="' + dashOffset.toFixed(1) + '"/>' +
                    '</svg>' +
                    '<div class="ia-ring-label">' +
                        '<span class="ia-ring-pct">' + overallPct + '%</span>' +
                        '<span class="ia-ring-sub">Complete</span>' +
                    '</div>' +
                '</div>' +
                '<div class="ia-prog-categories">' + bars.join('') + '</div>' +
            '</div>';
    }

    // ── Private: Categorized Data Cards ───────────────────────────

    function _renderDataCards() {
        const container = document.getElementById('iaDataCards');
        if (!container) return;

        const fieldLabels = {
            firstName: 'First Name', lastName: 'Last Name', prefix: 'Prefix',
            dob: 'Date of Birth', email: 'Email', phone: 'Phone',
            addrStreet: 'Street', addrCity: 'City', addrState: 'State', addrZip: 'Zip',
            qType: 'Quote Type', yearBuilt: 'Year Built', sqFt: 'Sq Ft',
            stories: 'Stories', constructionType: 'Construction',
            roofYear: 'Roof Year', mortgagee: 'Mortgagee',
            coFirstName: 'Co-First Name', coLastName: 'Co-Last Name',
            priorCarrier: 'Prior Carrier', priorYears: 'Prior Years'
        };

        const hasData = Object.keys(extractedData).some(k => extractedData[k] && k !== 'vehicles');
        const hasVehicles = Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0;

        if (!hasData && !hasVehicles) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        let html = '<div class="ia-datacards-header">' +
            '<span>\uD83D\uDCCB Extracted Data</span>' +
            '<button class="ia-populate-btn" onclick="IntakeAssist.populateForm()">\u26A1 Populate Form</button>' +
        '</div>';

        const qType = extractedData.qType || 'both';

        for (const [catKey, cat] of Object.entries(FIELD_CATEGORIES)) {
            if (catKey === 'property' && qType === 'auto') continue;
            if (catKey === 'auto' && qType === 'home') continue;

            // Check if category has any data
            const catHasData = cat.fields.some(f => {
                if (f === 'vehicles') return hasVehicles;
                return !!extractedData[f];
            });
            if (!catHasData) continue;

            html += '<div class="ia-datacard">' +
                '<div class="ia-datacard-header" style="border-left-color:' + cat.color + '">' +
                    '<span>' + cat.icon + ' ' + cat.label + '</span>' +
                '</div>' +
                '<div class="ia-datacard-grid">';

            for (const f of cat.fields) {
                if (f === 'vehicles') continue; // handled separately
                if (!extractedData[f]) continue;
                const label = fieldLabels[f] || f;
                const val = _esc(String(extractedData[f]));
                // Add source badge if property intel provided this value
                const fromIntel = propertyIntel && propertyIntel[f] && !extractedData['_user_' + f];
                html += '<div class="ia-datacard-field">' +
                    '<span class="ia-field-label">' + label + '</span>' +
                    '<span class="ia-field-value">' + val +
                        (fromIntel ? ' <span class="ia-badge ia-badge-intel" title="From property lookup">AI</span>' : '') +
                    '</span>' +
                '</div>';
            }

            html += '</div></div>';
        }

        // Vehicle cards
        if (hasVehicles) {
            html += '<div class="ia-datacard">' +
                '<div class="ia-datacard-header" style="border-left-color:#FF3B30">' +
                    '<span>\uD83D\uDE97 Vehicles (' + extractedData.vehicles.length + ')</span>' +
                '</div>' +
                '<div class="ia-vehicle-list">';

            for (const v of extractedData.vehicles) {
                const title = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
                html += '<div class="ia-vehicle-card">' +
                    '<div class="ia-vehicle-icon">\uD83D\uDE97</div>' +
                    '<div class="ia-vehicle-info">' +
                        '<div class="ia-vehicle-title">' + _esc(title) + '</div>' +
                        (v.vin ? '<div class="ia-vehicle-vin">VIN: ' + _esc(v.vin) + '</div>' : '') +
                    '</div>' +
                '</div>';
            }

            html += '</div></div>';
        }

        container.innerHTML = html;
    }

    // ── Private: Property Intelligence ────────────────────────────

    async function _fetchPropertyIntelligence() {
        const panel = document.getElementById('iaPropertyIntel');
        if (!panel) return;

        const addr = extractedData.addrStreet;
        const city = extractedData.addrCity;
        const state = extractedData.addrState;
        const zip = extractedData.addrZip || '';

        if (!addr || !city || !state) return;

        _propertyFetchInFlight = true;
        panel.style.display = 'block';
        panel.innerHTML =
            '<div class="ia-intel-loading">' +
                '<div class="ia-intel-spinner"></div>' +
                '<div class="ia-intel-loading-text">' +
                    '<div class="ia-intel-loading-title">Fetching Property Intelligence\u2026</div>' +
                    '<div class="ia-intel-loading-addr">' + _esc(addr + ', ' + city + ', ' + state + ' ' + zip) + '</div>' +
                '</div>' +
            '</div>';

        try {
            const fetchFn = (typeof Auth !== 'undefined' && typeof Auth.apiFetch === 'function')
                ? Auth.apiFetch.bind(Auth) : fetch;

            const aiSettings = (typeof AIProvider !== 'undefined' && typeof AIProvider.getSettings === 'function')
                ? AIProvider.getSettings() : {};

            const resp = await fetchFn('/api/property-intelligence?mode=arcgis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: addr, city: city, state: state, zip: zip, aiSettings: aiSettings })
            });

            if (!resp.ok) throw new Error('API returned ' + resp.status);
            const result = await resp.json();

            if (result.success && result.data) {
                propertyIntel = result.data;
                _renderPropertyIntelCard(result.data, result.confidence);

                // Auto-merge intel data into extractedData where missing
                if (result.data.yearBuilt && !extractedData.yearBuilt) extractedData.yearBuilt = String(result.data.yearBuilt);
                if ((result.data.sqftGross || result.data.sqFt) && !extractedData.sqFt) extractedData.sqFt = String(result.data.sqftGross || result.data.sqFt);
                if (result.data.stories && !extractedData.stories) extractedData.stories = String(result.data.stories);
                _saveHistory();
                _renderProgress();
                _renderDataCards();
                _assessRisks();
            } else {
                panel.innerHTML =
                    '<div class="ia-intel-empty">' +
                        '<span>\uD83D\uDFE1</span> No property data found for this address. You can continue manually.' +
                    '</div>';
            }
        } catch (err) {
            panel.innerHTML =
                '<div class="ia-intel-empty">' +
                    '<span>\u26A0\uFE0F</span> Could not fetch property data: ' + _esc(err.message || 'Unknown error') +
                '</div>';
        } finally {
            _propertyFetchInFlight = false;
        }
    }

    function _renderPropertyIntelCard(data, confidence) {
        const panel = document.getElementById('iaPropertyIntel');
        if (!panel) return;

        const confPct = Math.round((confidence || 0.7) * 100);
        const fields = [];
        if (data.yearBuilt) fields.push({ l: 'Year Built', v: data.yearBuilt });
        if (data.sqftGross) fields.push({ l: 'Square Feet', v: Number(data.sqftGross).toLocaleString() });
        if (data.stories) fields.push({ l: 'Stories', v: data.stories });
        if (data.bedrooms) fields.push({ l: 'Bedrooms', v: data.bedrooms });
        if (data.bathrooms) fields.push({ l: 'Bathrooms', v: data.bathrooms });
        if (data.roofType) fields.push({ l: 'Roof Type', v: data.roofType });
        if (data.lotSizeAcres) fields.push({ l: 'Lot Size', v: data.lotSizeAcres + ' acres' });
        if (data.assessedValue) fields.push({ l: 'Assessed Value', v: '$' + Number(data.assessedValue).toLocaleString() });
        if (data.owner) fields.push({ l: 'Owner', v: data.owner });
        if (data.landUseCode) fields.push({ l: 'Land Use', v: data.landUseCode });

        let html =
            '<div class="ia-intel-header">' +
                '<div class="ia-intel-title">' +
                    '<span>\uD83C\uDFE0</span> Property Intelligence' +
                '</div>' +
                '<div class="ia-intel-confidence">' +
                    '<span class="ia-conf-dot" style="background:' + (confPct >= 80 ? '#34C759' : confPct >= 50 ? '#FF9500' : '#FF3B30') + '"></span>' +
                    confPct + '% confidence' +
                '</div>' +
            '</div>' +
            '<div class="ia-intel-grid">';

        for (const f of fields) {
            html += '<div class="ia-intel-field">' +
                '<span class="ia-field-label">' + f.l + '</span>' +
                '<span class="ia-field-value">' + _esc(String(f.v)) + '</span>' +
            '</div>';
        }

        html += '</div>';

        if (data.dataSource) {
            html += '<div class="ia-intel-source">Source: ' + _esc(data.dataSource) + '</div>';
        }

        panel.innerHTML = html;
    }

    // ── Private: Risk Assessment ──────────────────────────────────

    function _assessRisks() {
        riskFlags = [];
        const d = extractedData;
        const p = propertyIntel || {};

        // Roof age warning
        const roofYear = parseInt(d.roofYear || p.roofYear, 10);
        if (roofYear && (new Date().getFullYear() - roofYear) >= 20) {
            riskFlags.push({ level: 'warning', icon: '\uD83D\uDEE0\uFE0F', text: 'Roof is ' + (new Date().getFullYear() - roofYear) + '+ years old' });
        }

        // Old construction
        const yearBuilt = parseInt(d.yearBuilt || p.yearBuilt, 10);
        if (yearBuilt && yearBuilt < 1970) {
            riskFlags.push({ level: 'info', icon: '\uD83C\uDFDA\uFE0F', text: 'Pre-1970 construction — check for knob & tube wiring' });
        }

        // Large lot
        if (p.lotSizeAcres && parseFloat(p.lotSizeAcres) > 2) {
            riskFlags.push({ level: 'info', icon: '\uD83C\uDF33', text: 'Large lot (' + p.lotSizeAcres + ' acres) — check brush/wildfire exposure' });
        }

        // High assessed value
        if (p.assessedValue && p.assessedValue > 750000) {
            riskFlags.push({ level: 'info', icon: '\uD83D\uDCB0', text: 'High-value property ($' + Number(p.assessedValue).toLocaleString() + ') — consider umbrella' });
        }

        _renderRiskBadges();
    }

    function _renderRiskBadges() {
        const container = document.getElementById('iaRiskBadges');
        if (!container) return;

        if (riskFlags.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML =
            '<div class="ia-risk-header">\u26A0\uFE0F Risk Indicators</div>' +
            '<div class="ia-risk-list">' +
                riskFlags.map(function(r) {
                    return '<div class="ia-risk-badge ia-risk-' + r.level + '">' +
                        '<span class="ia-risk-icon">' + r.icon + '</span>' +
                        '<span>' + _esc(r.text) + '</span>' +
                    '</div>';
                }).join('') +
            '</div>';
    }

    // ── Private: Smart Chips ──────────────────────────────────────

    function _updateSmartChips() {
        const row = document.getElementById('iaSmartChips');
        if (!row) return;

        const d = extractedData;
        const chips = [];

        // Show contextual chips based on what's missing
        if (!d.firstName) {
            chips.push({ label: '\uD83D\uDC64 Add Client Name', msg: "The client's name is " });
        }
        if (!d.qType) {
            chips.push({ label: '\uD83C\uDFE0 Home + Auto', msg: 'New home & auto bundle quote.' });
            chips.push({ label: '\uD83D\uDE97 Auto Only', msg: 'New auto quote.' });
        }
        if (d.addrStreet && d.addrCity && d.addrState && !propertyIntel && !_propertyFetchInFlight) {
            chips.push({ label: '\uD83D\uDD0D Lookup Property', action: 'fetchProperty' });
        }
        if (d.firstName && !d.dob) {
            chips.push({ label: '\uD83C\uDF82 Add DOB', msg: "Their date of birth is " });
        }
        if (d.firstName && !d.addrStreet) {
            chips.push({ label: '\uD83D\uDCCD Add Address', msg: "Their address is " });
        }
        if (d.qType && (d.qType === 'auto' || d.qType === 'both') && (!d.vehicles || d.vehicles.length === 0)) {
            chips.push({ label: '\uD83D\uDE97 Add Vehicle', msg: "The vehicle is a " });
        }
        // Always show Done chip when we have meaningful data
        if (d.firstName && d.qType) {
            chips.push({ label: '\u2705 Done — Apply', action: 'apply' });
        }

        if (chips.length === 0) return;

        row.innerHTML = chips.map(function(c) {
            if (c.action === 'apply') {
                return '<button class="ia-chip ia-chip-done" onclick="IntakeAssist.applyAndSend()">' + c.label + '</button>';
            }
            if (c.action === 'fetchProperty') {
                return '<button class="ia-chip ia-chip-intel" onclick="IntakeAssist.fetchPropertyData()">' + c.label + '</button>';
            }
            return '<button class="ia-chip" onclick="IntakeAssist.quickStart(\'' + _esc(c.msg).replace(/'/g, "\\'") + '\')">' + c.label + '</button>';
        }).join('');
    }

    // ── Private: Driver License Upload ────────────────────────────

    async function _handleDlUpload(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        // Reset input so same file can be re-selected
        e.target.value = '';

        _appendMsg('user', '\uD83D\uDCF7 Uploaded driver license image');
        chatHistory.push({ role: 'user', content: '[Uploaded driver license image for scanning]' });
        _showTyping();

        try {
            const base64Data = await _fileToBase64(file);
            const mimeType = file.type || 'image/jpeg';

            const fetchFn = (typeof Auth !== 'undefined' && typeof Auth.apiFetch === 'function')
                ? Auth.apiFetch.bind(Auth) : fetch;

            const aiSettings = (typeof AIProvider !== 'undefined' && typeof AIProvider.getSettings === 'function')
                ? AIProvider.getSettings() : {};

            const resp = await fetchFn('/api/vision-processor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'scanDriverLicense',
                    base64Data: base64Data,
                    mimeType: mimeType,
                    aiSettings: aiSettings
                })
            });

            if (!resp.ok) throw new Error('API returned ' + resp.status);
            const result = await resp.json();

            _hideTyping();

            if (result.success && result.data) {
                const dlData = result.data;
                // Map DL fields to intake fields
                if (dlData.firstName) extractedData.firstName = dlData.firstName;
                if (dlData.lastName) extractedData.lastName = dlData.lastName;
                if (dlData.dob) extractedData.dob = dlData.dob;
                if (dlData.addressLine1) extractedData.addrStreet = dlData.addressLine1;
                if (dlData.city) extractedData.addrCity = dlData.city;
                if (dlData.state) extractedData.addrState = dlData.state;
                if (dlData.zip) extractedData.addrZip = dlData.zip;
                _saveHistory();

                const conf = result.confidence ? ' (' + result.confidence + '% confidence)' : '';
                _appendMsg('ai', '\u2705 **Driver license scanned!**' + conf + '\n\nExtracted: **' +
                    [dlData.firstName, dlData.lastName].filter(Boolean).join(' ') + '**' +
                    (dlData.dob ? ', DOB: ' + dlData.dob : '') +
                    (dlData.addressLine1 ? '\nAddress: ' + dlData.addressLine1 + ', ' + (dlData.city || '') + ' ' + (dlData.state || '') + ' ' + (dlData.zip || '') : '') +
                    '\n\nI\'ve added this to the intake. What else do you know about this client?');

                chatHistory.push({ role: 'assistant', content: 'Driver license data extracted and applied.' });
                _saveHistory();
                _renderProgress();
                _renderDataCards();
                _updateSmartChips();

                // Auto-fetch property if address is complete
                if (extractedData.addrStreet && extractedData.addrCity && extractedData.addrState && !_propertyFetchInFlight) {
                    _fetchPropertyIntelligence();
                }
            } else {
                _appendMsg('ai', '\u26A0\uFE0F Could not read driver license. Try a clearer photo or enter the information manually.');
            }
        } catch (err) {
            _hideTyping();
            _appendMsg('ai', '\u26A0\uFE0F DL scan failed: ' + (err.message || 'Unknown error'));
        }
    }

    function _fileToBase64(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                var result = reader.result;
                var base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = function() { reject(new Error('Failed to read file')); };
            reader.readAsDataURL(file);
        });
    }

    // ── Private: rendering ────────────────────────────────────────

    function _renderAll() {
        const msgs = document.getElementById('iaChatMessages');
        if (!msgs) return;

        msgs.innerHTML = '';

        if (chatHistory.length === 0) {
            _appendMsg('ai', "Hi! \uD83D\uDC4B I'm your AI intake assistant. Tell me about your client — start with their name and what type of insurance they need (home, auto, or both)!\n\n\uD83D\uDCA1 **Tip:** You can also scan a driver's license using the camera button below.");
        } else {
            for (const m of chatHistory) {
                _appendMsg(m.role === 'user' ? 'user' : 'ai', m.content, false);
            }
        }

        _renderProgress();
        _renderDataCards();
        _assessRisks();
        _renderRiskBadges();
        _updateSmartChips();

        if (propertyIntel) {
            _renderPropertyIntelCard(propertyIntel, 0.7);
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

    // ── Private: helpers ──────────────────────────────────────────

    function _getAddressKey(d) {
        if (d.addrStreet && d.addrCity && d.addrState) {
            return (d.addrStreet + '|' + d.addrCity + '|' + d.addrState).toLowerCase();
        }
        return null;
    }

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
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                history: chatHistory,
                data: extractedData,
                propertyIntel: propertyIntel,
                riskFlags: riskFlags
            }));
        } catch (_) {}
    }

    function _syncFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                chatHistory = Array.isArray(parsed.history) ? parsed.history : [];
                extractedData = (parsed.data && typeof parsed.data === 'object') ? parsed.data : {};
                propertyIntel = parsed.propertyIntel || null;
                riskFlags = Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [];
            } else {
                chatHistory = [];
                extractedData = {};
                propertyIntel = null;
                riskFlags = [];
            }
        } catch (_) {
            chatHistory = [];
            extractedData = {};
            propertyIntel = null;
            riskFlags = [];
        }
    }

    function _esc(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

    return {
        init: init,
        sendMessage: sendMessage,
        quickStart: quickStart,
        applyAndSend: applyAndSend,
        populateForm: populateForm,
        fetchPropertyData: fetchPropertyData,
        triggerDlUpload: triggerDlUpload,
        clearChat: clearChat
    };
})();
