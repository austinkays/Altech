// endorsement-parser.js — AI-Powered Insurance Endorsement Email Parser
// Extracts structured data from carrier change request emails (auto/home endorsements)

const EndorsementParser = {
    initialized: false,
    _parsedData: null,
    _geminiApiKey: null,
    _parsing: false,

    init() {
        // Always try to wire events (in case HTML just loaded)
        this._wireEvents();
        
        // Only resolve API key once
        if (!this.initialized) {
            this.initialized = true;
            this.resolveGeminiKey();
            console.log('[EndorsementParser] initialized');
        }
    },

    _wireEvents() {
        console.log('[EndorsementParser] Wiring events...');
        const parseBtn = document.getElementById('epParseBtn');
        const resetBtn = document.getElementById('epResetBtn');
        const pasteArea = document.getElementById('epPasteArea');

        console.log('[EndorsementParser] Found elements:', { parseBtn: !!parseBtn, resetBtn: !!resetBtn, pasteArea: !!pasteArea });

        if (parseBtn) {
            // Remove any existing listener first (safe to call even if none exists)
            if (this._parseHandler) {
                parseBtn.removeEventListener('click', this._parseHandler);
            }
            // Create and store the handler
            this._parseHandler = () => {
                console.log('[EndorsementParser] Parse button clicked!');
                this.parse();
            };
            parseBtn.addEventListener('click', this._parseHandler);
        } else {
            console.warn('[EndorsementParser] Parse button not found in DOM!');
        }

        if (resetBtn) {
            if (this._resetHandler) {
                resetBtn.removeEventListener('click', this._resetHandler);
            }
            this._resetHandler = () => this.reset();
            resetBtn.addEventListener('click', this._resetHandler);
        }

        // Allow Ctrl+Enter to parse
        if (pasteArea) {
            pasteArea.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    this.parse();
                }
            });
        }
    },

    async resolveGeminiKey() {
        // Try localStorage first
        const localKey = localStorage.getItem('gemini_api_key');
        if (localKey && localKey.trim()) {
            this._geminiApiKey = localKey.trim();
            return;
        }

        // Try fetching from config API (authenticated users)
        if (typeof Auth !== 'undefined' && Auth.isSignedIn) {
            try {
                const resp = await Auth.apiFetch('/api/config?type=keys');
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.geminiKey) {
                        this._geminiApiKey = data.geminiKey;
                        return;
                    }
                }
            } catch (e) {
                console.warn('[EndorsementParser] Could not fetch API key:', e);
            }
        }

        // Fallback to environment variable (local dev)
        if (typeof process !== 'undefined' && process.env?.GOOGLE_API_KEY) {
            this._geminiApiKey = process.env.GOOGLE_API_KEY;
        }
    },

    async parse() {
        console.log('[EndorsementParser] parse() method called');
        
        const pasteArea = document.getElementById('epPasteArea');
        const parseBtn = document.getElementById('epParseBtn');
        const rawText = pasteArea?.value?.trim();

        console.log('[EndorsementParser] Raw text length:', rawText?.length || 0);

        // Show immediate visual feedback
        if (parseBtn) {
            parseBtn.disabled = true;
            parseBtn.textContent = '⏳ Parsing...';
        }

        if (!rawText) {
            this._showToast('Please paste the endorsement email text', 'error');
            if (parseBtn) {
                parseBtn.disabled = false;
                parseBtn.textContent = '🔍 Parse Request';
            }
            return;
        }

        if (!this._geminiApiKey) {
            console.warn('[EndorsementParser] No Gemini API key found');
            this._showToast('Gemini API key required. Set in Settings or localStorage.', 'error');
            if (parseBtn) {
                parseBtn.disabled = false;
                parseBtn.textContent = '🔍 Parse Request';
            }
            return;
        }

        if (this._parsing) return;

        this._parsing = true;
        this._showParsingState(true);

        try {
            // Step 1: Redact sensitive data before sending to Google
            const { redactedText, tokenMap } = this._redactSensitiveData(rawText);
            
            // Step 2: Send redacted text to AI
            const parsedData = await this._extractWithAI(redactedText);
            
            if (parsedData) {
                // Step 3: Restore real values after AI parsing
                const restoredData = this._restoreRedactedData(parsedData, tokenMap);
                
                // Step 4: Generate customer email draft
                const emailDraft = await this._generateEmailDraft(restoredData);
                restoredData.emailDraft = emailDraft;
                
                this._parsedData = restoredData;
                this.render(restoredData);
                this._showToast('Endorsement parsed successfully', 'success');
            } else {
                throw new Error('Failed to extract data from AI response');
            }
        } catch (error) {
            console.error('[EndorsementParser] Parse error:', error);
            this._showToast('Failed to parse endorsement: ' + error.message, 'error');
        } finally {
            this._parsing = false;
            this._showParsingState(false);
            if (parseBtn) {
                parseBtn.disabled = false;
                parseBtn.textContent = '🔍 Parse Request';
            }
        }
    },

    _redactSensitiveData(text) {
        const tokenMap = {};
        let redactedText = text;
        let tokenCounter = 1;

        // Redact policy numbers (common patterns: ABC123456, 12-AB-345678, etc.)
        const policyPattern = /\b([A-Z]{2,4}[-\s]?\d{6,10}|\d{2,3}[-\s][A-Z]{2}[-\s]\d{6,8})\b/g;
        redactedText = redactedText.replace(policyPattern, (match) => {
            const token = `POLICY-${tokenCounter++}`;
            tokenMap[token] = match;
            return token;
        });

        // Redact VINs (17 alphanumeric characters)
        const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
        redactedText = redactedText.replace(vinPattern, (match) => {
            const token = `VIN-${tokenCounter++}`;
            tokenMap[token] = match;
            return token;
        });

        // Redact phone numbers
        const phonePattern = /\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;
        redactedText = redactedText.replace(phonePattern, (match) => {
            const token = `PHONE-${tokenCounter++}`;
            tokenMap[token] = match;
            return token;
        });

        // Redact email addresses
        const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        redactedText = redactedText.replace(emailPattern, (match) => {
            const token = `EMAIL-${tokenCounter++}`;
            tokenMap[token] = match;
            return token;
        });

        // Redact SSNs (###-##-####)
        const ssnPattern = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;
        redactedText = redactedText.replace(ssnPattern, (match) => {
            const token = `SSN-${tokenCounter++}`;
            tokenMap[token] = match;
            return token;
        });

        // Redact full addresses (keep street name, redact house number, city, state, zip)
        const addressPattern = /\b(\d+)\s+([A-Za-z\s]+)(?:,?\s+([A-Za-z\s]+),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?))\b/g;
        redactedText = redactedText.replace(addressPattern, (match, number, street, city, state, zip) => {
            const token = `ADDRESS-${tokenCounter++}`;
            tokenMap[token] = match;
            return `[REDACTED] ${street}`; // Keep street name for context
        });

        console.log('[EndorsementParser] Redacted', Object.keys(tokenMap).length, 'sensitive items');
        
        return { redactedText, tokenMap };
    },

    _restoreRedactedData(data, tokenMap) {
        // Recursively restore redacted tokens with real values
        if (!data || typeof data !== 'object') {
            if (typeof data === 'string') {
                // Check if string contains any tokens
                let restored = data;
                Object.keys(tokenMap).forEach(token => {
                    restored = restored.replace(new RegExp(token, 'g'), tokenMap[token]);
                });
                return restored;
            }
            return data;
        }

        if (Array.isArray(data)) {
            return data.map(item => this._restoreRedactedData(item, tokenMap));
        }

        const restored = {};
        Object.keys(data).forEach(key => {
            restored[key] = this._restoreRedactedData(data[key], tokenMap);
        });
        return restored;
    },

    async _extractWithAI(rawText) {
        const systemPrompt = `You are an insurance endorsement parser. Extract structured data from the endorsement/change request email below.

Output ONLY valid JSON (no markdown, no explanation) with these exact keys:

{
  "requestType": "string (e.g., 'Add Vehicle', 'Update Coverage', 'Change Address')",
  "submittedDate": "string (date or null)",
  "confirmationNumber": "string or null",
  "insuredName": "string (customer/policyholder name)",
  "policyNumber": "string",
  "policyType": "string (e.g., 'Auto', 'Home', 'Umbrella')",
  "effectiveDate": "string (date when change takes effect)",
  "vehicleDetails": {
    "year": "string or null",
    "make": "string or null",
    "model": "string or null",
    "vin": "string or null",
    "garagingAddress": "string or null",
    "operator": "string or null",
    "use": "string or null"
  },
  "homeDetails": {
    "address": "string or null",
    "coverageType": "string or null"
  },
  "coverageChanges": [
    {
      "type": "string (coverage name)",
      "limit": "string or null",
      "deductible": "string or null"
    }
  ],
  "additionalInterests": [
    {
      "name": "string (lienholder or loss payee name)",
      "address": "string or null",
      "type": "string (e.g., 'Lienholder', 'Loss Payee', 'Additional Insured')"
    }
  ],
  "contactInfo": {
    "phone": "string or null",
    "email": "string or null"
  },
  "otherFields": {}
}

Rules:
- Use null for missing/blank values (never "N/A" or "NaN")
- Extract ALL labeled fields you find, even if unusual — put extras in otherFields as key-value pairs
- Be thorough — missing data causes processing delays
- Output valid JSON only`;

        const userPrompt = `Parse this endorsement email:\n\n${rawText}`;

        try {
            // Use AIProvider if available (follows app pattern)
            if (typeof AIProvider !== 'undefined') {
                const response = await AIProvider.ask(systemPrompt, userPrompt, this._geminiApiKey);
                return this._parseAIResponse(response);
            } else {
                // Fallback: direct Gemini API call
                const response = await this._callGeminiDirect(systemPrompt, userPrompt);
                return this._parseAIResponse(response);
            }
        } catch (error) {
            console.error('[EndorsementParser] AI extraction failed:', error);
            throw error;
        }
    },

    async _callGeminiDirect(systemPrompt, userPrompt) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
        
        const response = await fetch(`${url}?key=${this._geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: systemPrompt },
                        { text: userPrompt }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2048
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },

    _parseAIResponse(responseText) {
        // Try to extract JSON from response (may be wrapped in markdown code block)
        let jsonStr = responseText.trim();

        // Remove markdown code blocks if present
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
        }

        try {
            const parsed = JSON.parse(jsonStr);
            return this._validateAndClean(parsed);
        } catch (e) {
            console.error('[EndorsementParser] JSON parse error:', e);
            console.error('Raw response:', responseText);
            throw new Error('AI returned invalid JSON');
        }
    },

    _validateAndClean(data) {
        // Ensure all expected top-level keys exist
        const cleaned = {
            requestType: data.requestType || null,
            submittedDate: data.submittedDate || null,
            confirmationNumber: data.confirmationNumber || null,
            insuredName: data.insuredName || null,
            policyNumber: data.policyNumber || null,
            policyType: data.policyType || null,
            effectiveDate: data.effectiveDate || null,
            vehicleDetails: data.vehicleDetails || {},
            homeDetails: data.homeDetails || {},
            coverageChanges: Array.isArray(data.coverageChanges) ? data.coverageChanges : [],
            additionalInterests: Array.isArray(data.additionalInterests) ? data.additionalInterests : [],
            contactInfo: data.contactInfo || {},
            otherFields: data.otherFields || {}
        };

        return cleaned;
    },

    async _generateEmailDraft(data) {
        console.log('[EndorsementParser] Generating customer email draft...');
        
        try {
            const prompt = `You are a professional insurance agent. Based on the following endorsement details, write a short and friendly email to the insured letting them know their policy changes have been processed.

Endorsement Details:
- Insured: ${data.insuredName || 'the insured'}
- Policy Number: ${data.policyNumber || '[policy number]'}
- Policy Type: ${data.policyType || 'insurance policy'}
- Effective Date: ${data.effectiveDate || '[effective date]'}
- Request Type: ${data.requestType || 'endorsement request'}

Changes Made:
${this._summarizeChanges(data)}

Write a brief, professional but friendly email (3-4 sentences max) confirming these changes were made. Use a warm tone, include the key details, and mention they can call with questions. Do NOT include subject line, just the email body.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this._geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                throw new Error(`Email generation failed: ${response.status}`);
            }

            const result = await response.json();
            const emailText = result.candidates?.[0]?.content?.parts?.[0]?.text || 
                'Dear valued customer,\n\nYour endorsement request has been processed successfully. If you have any questions, please don\'t hesitate to contact us.\n\nThank you for your business!';

            return emailText.trim();
        } catch (error) {
            console.error('[EndorsementParser] Email generation error:', error);
            // Return fallback template
            return `Dear ${data.insuredName || 'valued customer'},\n\nYour ${data.requestType || 'endorsement request'} for policy ${data.policyNumber || '[policy number]'} has been successfully processed, effective ${data.effectiveDate || 'as requested'}.\n\nIf you have any questions about these changes, please don't hesitate to call us.\n\nThank you for your business!`;
        }
    },

    _summarizeChanges(data) {
        const changes = [];
        
        if (data.vehicleDetails && Object.keys(data.vehicleDetails).length > 0) {
            if (data.vehicleDetails.added) changes.push('- Vehicle added: ' + data.vehicleDetails.added);
            if (data.vehicleDetails.removed) changes.push('- Vehicle removed: ' + data.vehicleDetails.removed);
            if (data.vehicleDetails.changed) changes.push('- Vehicle updated: ' + data.vehicleDetails.changed);
        }
        
        if (data.homeDetails && Object.keys(data.homeDetails).length > 0) {
            if (data.homeDetails.addressChange) changes.push('- Property address updated');
            if (data.homeDetails.coverageIncrease) changes.push('- Coverage increased');
        }
        
        if (data.coverageChanges && data.coverageChanges.length > 0) {
            data.coverageChanges.forEach(change => {
                changes.push(`- ${change.type}: ${change.limit || change.deductible || 'updated'}`);
            });
        }
        
        if (data.additionalInterests && data.additionalInterests.length > 0) {
            data.additionalInterests.forEach(interest => {
                changes.push(`- ${interest.type} added: ${interest.name}`);
            });
        }
        
        return changes.length > 0 ? changes.join('\n') : '- Policy endorsement changes as requested';
    },

    render(data) {
        const pasteView = document.getElementById('epPasteView');
        const displayView = document.getElementById('epDisplayView');
        const cardsContainer = document.getElementById('epCardsContainer');

        if (!displayView || !cardsContainer) {
            console.error('[EndorsementParser] Display elements not found');
            return;
        }

        // Hide paste view, show display view
        if (pasteView) pasteView.style.display = 'none';
        displayView.style.display = 'block';

        // Clear previous cards
        cardsContainer.innerHTML = '';

        // Render each section
        this._renderRequestMetadata(data, cardsContainer);
        this._renderInsuredInfo(data, cardsContainer);
        this._renderSubjectOfChange(data, cardsContainer);
        this._renderCoverageChanges(data, cardsContainer);
        this._renderAdditionalInterests(data, cardsContainer);
        this._renderContactInfo(data, cardsContainer);
        this._renderOtherFields(data, cardsContainer);
        this._renderEmailDraft(data, cardsContainer);
    },

    _renderRequestMetadata(data, container) {
        const fields = [
            { label: 'Request Type', value: data.requestType, highlight: true },
            { label: 'Submitted Date', value: data.submittedDate },
            { label: 'Confirmation Number', value: data.confirmationNumber }
        ];

        const hasData = fields.some(f => f.value);
        if (!hasData) return;

        const card = this._createCard('Request Details', fields);
        container.appendChild(card);
    },

    _renderInsuredInfo(data, container) {
        const fields = [
            { label: 'Insured Name', value: data.insuredName, highlight: true },
            { label: 'Policy Number', value: data.policyNumber, highlight: true },
            { label: 'Policy Type', value: data.policyType },
            { label: 'Effective Date', value: data.effectiveDate, highlight: true }
        ];

        const hasData = fields.some(f => f.value);
        if (!hasData) return;

        const card = this._createCard('Policyholder Information', fields);
        container.appendChild(card);
    },

    _renderSubjectOfChange(data, container) {
        const vehicle = data.vehicleDetails || {};
        const home = data.homeDetails || {};

        const vehicleFields = [
            { label: 'Year', value: vehicle.year },
            { label: 'Make', value: vehicle.make },
            { label: 'Model', value: vehicle.model },
            { label: 'VIN', value: vehicle.vin, highlight: true },
            { label: 'Garaging Address', value: vehicle.garagingAddress },
            { label: 'Operator', value: vehicle.operator },
            { label: 'Use', value: vehicle.use }
        ];

        const homeFields = [
            { label: 'Property Address', value: home.address },
            { label: 'Coverage Type', value: home.coverageType }
        ];

        const hasVehicle = vehicleFields.some(f => f.value);
        const hasHome = homeFields.some(f => f.value);

        if (hasVehicle) {
            const card = this._createCard('Vehicle Details', vehicleFields);
            container.appendChild(card);
        }

        if (hasHome) {
            const card = this._createCard('Home/Property Details', homeFields);
            container.appendChild(card);
        }
    },

    _renderCoverageChanges(data, container) {
        const changes = data.coverageChanges || [];
        if (changes.length === 0) return;

        const card = document.createElement('div');
        card.className = 'ep-card';

        const header = document.createElement('div');
        header.className = 'ep-card-header';
        header.textContent = 'Coverage Changes';
        card.appendChild(header);

        const table = document.createElement('table');
        table.className = 'ep-coverage-table';

        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Coverage Type</th><th>Limit</th><th>Deductible</th></tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        changes.forEach(change => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this._escapeHtml(change.type || 'N/A')}</td>
                <td>${this._escapeHtml(change.limit || '—')}</td>
                <td>${this._escapeHtml(change.deductible || '—')}</td>
            `;
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        card.appendChild(table);
        container.appendChild(card);
    },

    _renderAdditionalInterests(data, container) {
        const interests = data.additionalInterests || [];
        if (interests.length === 0) return;

        const card = document.createElement('div');
        card.className = 'ep-card';

        const header = document.createElement('div');
        header.className = 'ep-card-header';
        header.textContent = 'Additional Interests';
        card.appendChild(header);

        interests.forEach(interest => {
            const block = document.createElement('div');
            block.className = 'ep-interest-block';

            if (interest.type) {
                const badge = document.createElement('span');
                badge.className = 'ep-badge';
                badge.textContent = interest.type;
                block.appendChild(badge);
            }

            if (interest.name) {
                const name = document.createElement('div');
                name.className = 'ep-interest-name';
                name.textContent = interest.name;
                block.appendChild(name);
            }

            if (interest.address) {
                const address = document.createElement('div');
                address.className = 'ep-interest-address';
                address.textContent = interest.address;
                block.appendChild(address);
            }

            card.appendChild(block);
        });

        container.appendChild(card);
    },

    _renderContactInfo(data, container) {
        const contact = data.contactInfo || {};
        const fields = [
            { label: 'Phone', value: contact.phone },
            { label: 'Email', value: contact.email }
        ];

        const hasData = fields.some(f => f.value);
        if (!hasData) return;

        const card = this._createCard('Contact Information', fields);
        container.appendChild(card);
    },

    _renderOtherFields(data, container) {
        const other = data.otherFields || {};
        const keys = Object.keys(other);
        if (keys.length === 0) return;

        const fields = keys.map(key => ({
            label: this._formatFieldName(key),
            value: other[key]
        }));

        const card = this._createCard('Other Details', fields);
        container.appendChild(card);
    },

    _createCard(title, fields) {
        const card = document.createElement('div');
        card.className = 'ep-card';

        const header = document.createElement('div');
        header.className = 'ep-card-header';
        header.textContent = title;
        card.appendChild(header);

        fields.forEach(field => {
            if (!field.value && field.value !== 0) return; // Skip null/undefined/empty

            const row = document.createElement('div');
            row.className = 'ep-field-row';

            const label = document.createElement('span');
            label.className = 'ep-label';
            label.textContent = field.label + ':';
            row.appendChild(label);

            const value = document.createElement('span');
            value.className = 'ep-value';
            if (field.highlight) value.classList.add('ep-highlight');
            value.textContent = String(field.value);
            row.appendChild(value);

            card.appendChild(row);
        });

        return card;
    },

    _renderEmailDraft(data, container) {
        if (!data.emailDraft) return;

        const card = document.createElement('div');
        card.className = 'ep-card ep-email-card';

        const header = document.createElement('div');
        header.className = 'ep-card-header';
        header.textContent = '📧 Customer Email Draft';
        card.appendChild(header);

        const emailContainer = document.createElement('div');
        emailContainer.className = 'ep-email-content';

        const emailText = document.createElement('pre');
        emailText.className = 'ep-email-text';
        emailText.id = 'epEmailText';
        emailText.textContent = data.emailDraft;
        emailContainer.appendChild(emailText);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'ep-btn-secondary ep-copy-btn';
        copyBtn.id = 'epCopyEmailBtn';
        copyBtn.textContent = '📋 Copy to Clipboard';
        copyBtn.addEventListener('click', () => {
            const text = document.getElementById('epEmailText')?.textContent;
            if (text) {
                navigator.clipboard.writeText(text).then(() => {
                    this._showToast('Email copied to clipboard', 'success');
                    copyBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy to Clipboard';
                    }, 2000);
                }).catch(err => {
                    console.error('[EndorsementParser] Copy failed:', err);
                    this._showToast('Failed to copy email', 'error');
                });
            }
        });
        emailContainer.appendChild(copyBtn);

        card.appendChild(emailContainer);
        container.appendChild(card);
    },

    _formatFieldName(str) {
        // Convert camelCase or snake_case to Title Case
        return str
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    },

    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    _showParsingState(parsing) {
        const btn = document.getElementById('epParseBtn');
        if (!btn) return;

        if (parsing) {
            btn.disabled = true;
            btn.textContent = '⏳ Parsing...';
        } else {
            btn.disabled = false;
            btn.textContent = '🔍 Parse Request';
        }
    },

    _showToast(message, type = 'info') {
        // Use App.toast if available, otherwise console
        if (typeof App !== 'undefined' && typeof App.toast === 'function') {
            App.toast(message, type);
        } else {
            console.log(`[EndorsementParser] ${type.toUpperCase()}: ${message}`);
        }
    },

    reset() {
        this._parsedData = null;

        const pasteView = document.getElementById('epPasteView');
        const displayView = document.getElementById('epDisplayView');
        const pasteArea = document.getElementById('epPasteArea');
        const cardsContainer = document.getElementById('epCardsContainer');

        if (pasteView) pasteView.style.display = 'block';
        if (displayView) displayView.style.display = 'none';
        if (pasteArea) pasteArea.value = '';
        if (cardsContainer) cardsContainer.innerHTML = '';

        console.log('[EndorsementParser] Reset to paste view');
    }
};
