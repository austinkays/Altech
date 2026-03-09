// endorsement-parser.js — AI-Powered Insurance Endorsement Email Parser
// Extracts structured data from carrier change request emails (auto/home endorsements)

const EndorsementParser = {
    initialized: false,
    _parsedData: null,
    _geminiApiKey: null,
    _parsing: false,

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this._wireEvents();
        this.resolveGeminiKey();
        console.log('[EndorsementParser] initialized');
    },

    _wireEvents() {
        const parseBtn = document.getElementById('epParseBtn');
        const resetBtn = document.getElementById('epResetBtn');
        const pasteArea = document.getElementById('epPasteArea');

        if (parseBtn) {
            parseBtn.addEventListener('click', () => this.parse());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.reset());
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
        const pasteArea = document.getElementById('epPasteArea');
        const rawText = pasteArea?.value?.trim();

        if (!rawText) {
            this._showToast('Please paste the endorsement email text', 'error');
            return;
        }

        if (!this._geminiApiKey) {
            this._showToast('Gemini API key required. Set in Settings or localStorage.', 'error');
            return;
        }

        if (this._parsing) return;

        this._parsing = true;
        this._showParsingState(true);

        try {
            const parsedData = await this._extractWithAI(rawText);
            
            if (parsedData) {
                this._parsedData = parsedData;
                this.render(parsedData);
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
        }
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
