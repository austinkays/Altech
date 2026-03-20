// QuoteCompare - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

const QuoteCompare = {
                data: null,
                chatHistory: [],
                STORAGE_KEY: 'altech_v6_quote_comparisons',

                SYSTEM_PROMPT: `You are a friendly, approachable insurance expert named "Altech Quote Advisor." You're helping a regular person (not an insurance professional) understand their homeowner's insurance quotes.

Your personality:
- Warm, patient, and genuinely helpful — like a knowledgeable friend who knows this stuff well
- You use simple, everyday language — no jargon without explaining it
- When you use an insurance term, always explain what it means in plain English (ELI5 style)
- Use analogies and real-world examples ("Think of it like...")
- Be specific with dollar amounts and carrier names from the actual quotes
- If something is a bad deal or a red flag, say so honestly but kindly
- Use emoji sparingly for friendliness (1-2 per response max)
- Keep responses concise (2-4 short paragraphs) unless asked for more detail
- If asked about something not in the quotes, say so rather than guessing

Examples of how to explain things:
- "Ordinance or Law coverage" → "If your city changed its building codes since your house was built in 1973, and you had a big claim, you might need to rebuild to the NEW codes. That costs extra. This coverage pays for that difference — super important for older homes!"
- "Loss Assessment" → "If you're in an HOA and the shared pool gets damaged but the HOA's insurance doesn't cover it all, they can 'assess' (charge) each homeowner. This coverage helps pay your share."
- "All Perils Deductible" → "This is what you pay out of pocket before insurance kicks in. Think of it like your co-pay at the doctor. A $1,000 deductible means you cover the first $1,000 of a claim."
- "Replacement Cost vs Actual Cash Value" → "Replacement cost = they buy you a brand new couch. Actual cash value = they give you what your 5-year-old couch is worth today (way less). You want replacement cost!"

You have access to the full quote data. Reference specific numbers, carriers, and coverages from the data when answering.`,

                init() {
                    this.bindEvents();
                    this.reset();
                    this.renderSavedList();
                },

                bindEvents() {
                    const zone = document.getElementById('qcUploadZone');
                    const input = document.getElementById('qcFileInput');
                    if (!zone || !input) return;

                    // Remove old listeners by cloning
                    const newZone = zone.cloneNode(true);
                    zone.parentNode.replaceChild(newZone, zone);
                    const newInput = newZone.querySelector('input[type="file"]');

                    newZone.addEventListener('click', (e) => {
                        if (e.target !== newInput) newInput.click();
                    });

                    newInput.addEventListener('change', (e) => {
                        if (e.target.files?.length) this.handleFiles(e.target.files);
                    });

                    newZone.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        newZone.classList.add('dragover');
                    });
                    newZone.addEventListener('dragleave', () => {
                        newZone.classList.remove('dragover');
                    });
                    newZone.addEventListener('drop', (e) => {
                        e.preventDefault();
                        newZone.classList.remove('dragover');
                        if (e.dataTransfer.files?.length) this.handleFiles(e.dataTransfer.files);
                    });
                },

                reset() {
                    this.data = null;
                    this.chatHistory = [];
                    this._activeTab = null;
                    const zone = document.getElementById('qcUploadZone');
                    const loading = document.getElementById('qcLoading');
                    const results = document.getElementById('qcResults');
                    const progress = document.getElementById('qcProgress');
                    const chatMsgs = document.getElementById('qcChatMessages');
                    const saved = document.getElementById('qcSavedSection');
                    if (zone) zone.style.display = 'block';
                    if (loading) { loading.classList.remove('active'); loading.style.display = 'none'; }
                    if (results) results.classList.remove('active');
                    if (progress) progress.style.width = '0%';
                    if (saved) saved.style.display = '';
                    if (chatMsgs) chatMsgs.innerHTML = '<div class="qc-msg qc-msg-ai">Hey there! 👋 I\'ve looked over your quotes and I\'m ready to help you make sense of everything. Ask me anything — like "What does ordinance or law mean?" or "Why is Travelers cheaper?" — and I\'ll explain it in plain English!</div>';
                    // Re-bind events for the freshly reset view
                    this.bindEvents();
                    this.renderSavedList();
                },

                async handleFiles(files) {
                    const zone = document.getElementById('qcUploadZone');
                    const loading = document.getElementById('qcLoading');
                    const progress = document.getElementById('qcProgress');

                    if (zone) zone.style.display = 'none';
                    if (loading) { loading.style.display = 'block'; loading.classList.add('active'); }
                    if (progress) progress.style.width = '30%';

                    try {
                        // Convert files to base64
                        const parts = [];
                        for (const file of files) {
                            const base64 = await this.fileToBase64(file);
                            const mimeType = file.type || 'application/pdf';
                            parts.push({ inlineData: { data: base64, mimeType } });
                        }

                        if (progress) progress.style.width = '50%';

                        // Get API key (may be null if user has non-Gemini provider)
                        const apiKey = await this.getApiKey();

                        // Call AI to extract structured data (AIProvider tried first inside)
                        const extracted = await this.extractWithGemini(parts, apiKey);
                        if (progress) progress.style.width = '80%';

                        // Get smart recommendation
                        const recommendation = await this.getRecommendation(extracted, apiKey);
                        if (progress) progress.style.width = '95%';

                        this.data = { ...extracted, recommendation };
                        this.renderResults();
                        this.autoSave();

                        if (progress) progress.style.width = '100%';
                        if (loading) { loading.classList.remove('active'); loading.style.display = 'none'; }
                        App.toast('✅ Quote analysis complete');
                    } catch (err) {
                        console.error('Quote compare error:', err);
                        if (loading) { loading.classList.remove('active'); loading.style.display = 'none'; }
                        if (zone) zone.style.display = 'block';
                        if (progress) progress.style.width = '0%';
                        App.toast('❌ ' + (err.message || 'Failed to analyze quote'));
                    }
                },

                fileToBase64(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = () => reject(new Error('Failed to read file'));
                        reader.readAsDataURL(file);
                    });
                },

                async getApiKey() {
                    // Try App's stored key first
                    if (typeof App !== 'undefined' && App._geminiApiKey) return App._geminiApiKey;
                    // Try localStorage
                    const stored = localStorage.getItem('gemini_api_key');
                    if (stored) return stored;
                    // Try config endpoint (serves both Places + Gemini keys)
                    try {
                        const res = await (typeof Auth !== 'undefined' ? Auth.apiFetch('/api/config?type=keys') : fetch('/api/config?type=keys'));
                        if (res.ok) {
                            const cfg = await res.json();
                            return cfg.geminiKey || null;
                        }
                    } catch {}
                    // Fallback: local dev config
                    try {
                        const res = await fetch('/api/config.json');
                        if (res.ok) {
                            const cfg = await res.json();
                            return cfg.apiKey || cfg.GOOGLE_API_KEY || cfg.googleApiKey || null;
                        }
                    } catch {}
                    return null;
                },

                async extractWithGemini(parts, apiKey) {
                    const systemPrompt = `You are an expert insurance analyst parsing EZLynx comparative rater output documents from independent insurance agencies. These documents may contain Auto quotes, Home (HO3/HO5) quotes, or both in the same PDF.

CRITICAL RULES:
- Return valid JSON only — no markdown, no commentary, no code fences
- Never hallucinate carriers, premiums, or quote numbers
- Extract EVERY carrier quote, including "Alternate Quote" variants
- Auto quotes use 6-month terms; Home quotes use 12-month terms — do NOT convert
- Quote identifiers appear as: "CCF#:", "Quote Number:", "Reference Number:", "Policy Number:", or "REFERENCE NUMBER:" — capture all variants
- Carrier errors (e.g. "Carrier Error: Invalid SubProduct") should still be extracted with an error flag
- "Agent Input" = standard quote; "Alternate Quote" = modified/alternate version — capture both with isAlternate flag`;

                    const prompt = `Analyze this EZLynx quote document and extract ALL quotes into this exact JSON structure:

{
  "applicant": {
    "name": "Full name",
    "address": "Full address",
    "county": "County name",
    "homePhone": "Phone",
    "cellPhone": "Phone",
    "email": "Email",
    "effectiveDate": "MM/DD/YYYY",
    "priorCarrier": "Carrier name or empty",
    "yearsWithCarrier": "X years or empty"
  },
  "autoQuotes": [
    {
      "carrier": "Carrier name (e.g. Progressive, Travelers, Safeco, Nationwide, PEMCO, Mutual of Enumclaw, Dairyland)",
      "isAlternate": false,
      "alternateName": "e.g. Smart Savings Rate, PAF Ded-Increase Comp/Coll, or empty",
      "referenceNumber": "Any of: CCF#, Quote Number, Policy Number, Reference Number value — include the label prefix if helpful",
      "premiumAmount": 462.00,
      "premiumTerm": "6 Month",
      "premiumLabel": "Paid-In-Full or Total Premium",
      "creditOrdered": "Yes/No/NA",
      "hasCarrierError": false,
      "carrierErrorMessage": "Error text or empty",
      "discounts": [
        { "name": "Discount name", "amount": "-$123 or empty" }
      ],
      "totalSavings": "$421.00 or empty",
      "ratingMessages": ["Message 1", "Message 2"],
      "coverages": {
        "bodilyInjury": { "limit": "250/500", "premium": 119.00 },
        "propertyDamage": { "limit": "100000", "premium": 56.00 },
        "uninsuredMotorist": { "limit": "250/500", "premium": 0 },
        "underinsuredMotorist": { "limit": "250/500", "premium": 73.00 },
        "umpd": { "limit": "100000", "premium": 0 },
        "uimpd": { "limit": "100000", "premium": 0 },
        "comprehensive": { "deductible": "500", "premium": 56.00 },
        "collision": { "deductible": "500", "premium": 172.00 },
        "towing": { "limit": "100", "premium": 5.00 },
        "rentalReimbursement": { "limit": "30/900", "premium": 10.00 },
        "pip": { "limit": "10000", "premium": 14.00 },
        "pipDeductible": 14.00,
        "apip": { "limit": "", "premium": 0 }
      },
      "paymentPlans": [
        { "description": "Paid-In-Full", "totalPremium": "$462.00", "downPayment": "", "installment": "" },
        { "description": "6 Payments 16.67% Down EFT", "totalPremium": "$528.00", "downPayment": "$88.03", "installment": "$89.00" }
      ]
    }
  ],
  "homeQuotes": [
    {
      "carrier": "Carrier name",
      "issuingCompany": "Full issuing company name if different",
      "isAlternate": false,
      "alternateName": "e.g. Protect Plus or empty",
      "referenceNumber": "CCF#, Quote Number, or Reference Number value",
      "premiumAmount": 943.42,
      "premiumTerm": "12 Month",
      "premiumLabel": "Total Premium or Paid-In-Full",
      "creditOrdered": "Yes/No/NA",
      "hasCarrierError": false,
      "carrierErrorMessage": "",
      "discounts": [
        { "name": "Discount name", "amount": "-$232.00 or empty" }
      ],
      "totalSavings": "$481.00 or empty",
      "ratingMessages": ["Message 1"],
      "coverages": {
        "dwelling": "$711,100 or INCLUDED",
        "otherStructures": "INCLUDED or $amount",
        "lossOfUse": "INCLUDED or $amount",
        "personalProperty": "INCLUDED or $amount",
        "personalLiability": "$500,000 or INCLUDED",
        "medicalPayments": "$5,000 or INCLUDED",
        "deductible": "$2,500 or INCLUDED"
      },
      "endorsements": {
        "creditCardLimit": "INCLUDED or Not Included",
        "increasedMold": "INCLUDED or Not Included",
        "lossAssessment": "INCLUDED or Not Included",
        "ordinanceOrLaw": "10% or INCLUDED or Not Included",
        "replacementCostContent": "INCLUDED or Not Included",
        "replacementCostDwelling": "INCLUDED or Not Included",
        "waterBackup": "INCLUDED or Not Included",
        "allPerilsDeductible": "INCLUDED or $2,500 or Not Included",
        "personalInjury": "INCLUDED or Not Included",
        "identityTheft": "INCLUDED or Not Included",
        "earthquake": "INCLUDED or Not Included",
        "scheduledPersonalProperty": "INCLUDED or Not Included"
      },
      "paymentPlans": [
        { "description": "Total Premium", "totalPremium": "$943.42", "downPayment": "", "installment": "" }
      ]
    }
  ]
}

RULES:
- premiumAmount must be a NUMBER (no $ sign)
- Coverage premiums must be NUMBERs
- Extract every carrier including those with errors (set hasCarrierError: true)
- Sort autoQuotes by premiumAmount ascending; sort homeQuotes by premiumAmount ascending
- Alternate quotes are SEPARATE entries in the array with isAlternate: true
- If a coverage field is "INCLUDED" keep it as the string "INCLUDED"
- If a coverage is not present in the quote, use empty string ""
- The referenceNumber field should capture: CCF# values, Quote Numbers, Policy Numbers, and Reference Numbers — include whatever identifier is present`;

                    // Try AIProvider first (supports all providers with multimodal)
                    if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
                        try {
                            console.log('[QuoteCompare] Trying AIProvider for extraction...');
                            const aiResult = await AIProvider.ask(systemPrompt, prompt, {
                                temperature: 0.1, maxTokens: 8192, responseFormat: 'json', parts
                            });
                            if (aiResult.text) {
                                const parsed = (typeof AIProvider !== 'undefined' && AIProvider.extractJSON)
                                    ? AIProvider.extractJSON(aiResult.text)
                                    : JSON.parse(aiResult.text.match(/\{[\s\S]*\}/)?.[0] || '{}');
                                if (parsed && (parsed.autoQuotes || parsed.homeQuotes || parsed.quotes || parsed.applicant)) {
                                    console.log('[QuoteCompare] AIProvider extraction successful');
                                    return parsed;
                                }
                            }
                        } catch (e) {
                            console.warn('[QuoteCompare] AIProvider extraction failed, trying Gemini fallback:', e);
                        }
                    }

                    // Fallback: direct Gemini API
                    if (!apiKey) throw new Error('No API key found. Configure an AI provider in Settings or set GOOGLE_API_KEY.');
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                    const body = {
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: [{
                            parts: [...parts, { text: prompt }]
                        }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 8192,
                            response_mime_type: 'application/json'
                        }
                    };

                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 60000);

                    try {
                        const res = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                            signal: controller.signal
                        });
                        clearTimeout(timeout);

                        if (!res.ok) {
                            const errData = await res.json().catch(() => ({}));
                            throw new Error(errData.error?.message || `Gemini API error: ${res.status}`);
                        }

                        const data = await res.json();
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

                        // Use robust JSON extractor
                        const parsed = (typeof AIProvider !== 'undefined' && AIProvider.extractJSON)
                            ? AIProvider.extractJSON(text)
                            : JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
                        if (!parsed) throw new Error('No valid JSON in response');
                        return parsed;
                    } finally {
                        clearTimeout(timeout);
                    }
                },

                buildQuoteContext() {
                    const autoQ = this.data?.autoQuotes || [];
                    const homeQ = this.data?.homeQuotes || this.data?.quotes || [];
                    if (!autoQ.length && !homeQ.length) return 'No quote data available.';
                    const q = this.data;
                    const lines = [];
                    lines.push(`Applicant: ${q.applicant?.name || 'Unknown'}`);
                    lines.push(`Address: ${q.applicant?.address || 'Unknown'}`);
                    lines.push(`Eff: ${q.applicant?.effectiveDate || '?'}, Prior: ${q.applicant?.priorCarrier || '?'} (${q.applicant?.yearsWithCarrier || '?'})`);
                    lines.push('');
                    if (autoQ.length) {
                        lines.push('=== AUTO QUOTES ===');
                        autoQ.forEach(carrier => {
                            lines.push(`--- ${carrier.carrier} ---`);
                            lines.push(`  Premium: $${carrier.premiumAmount || '?'}/6mo (${carrier.premiumLabel || ''})`);
                            lines.push(`  Ref: ${carrier.referenceNumber || 'N/A'}`);
                            lines.push(`  Credit ordered: ${carrier.creditOrdered || 'N/A'}`);
                            if (carrier.hasCarrierError) lines.push(`  ⚠ Carrier Error: ${carrier.carrierErrorMessage || 'unknown'}`);
                            if (carrier.discounts?.length) {
                                lines.push(`  Discounts: ${carrier.discounts.map(d => d.name + (d.amount ? ' ' + d.amount : '')).join(', ')}`);
                                if (carrier.totalSavings) lines.push(`  Total savings: ${carrier.totalSavings}`);
                            }
                            const cov = carrier.coverages || {};
                            if (cov.bodilyInjury) lines.push(`  BI: ${cov.bodilyInjury.limit}`);
                            if (cov.propertyDamage) lines.push(`  PD: ${cov.propertyDamage.limit}`);
                            if (cov.comprehensive) lines.push(`  Comp ded: $${cov.comprehensive.deductible}`);
                            if (cov.collision) lines.push(`  Coll ded: $${cov.collision.deductible}`);
                            if (cov.pip) lines.push(`  PIP: ${cov.pip.limit}`);
                            if (carrier.ratingMessages?.length) {
                                lines.push(`  Rating Messages:`);
                                carrier.ratingMessages.forEach(m => lines.push(`    - ${m}`));
                            }
                            lines.push('');
                        });
                    }
                    if (homeQ.length) {
                        lines.push('=== HOME QUOTES ===');
                        homeQ.forEach(carrier => {
                            lines.push(`--- ${carrier.carrier} ---`);
                            lines.push(`  Premium: $${carrier.premiumAmount || carrier.premium12Month || '?'}/yr (${carrier.premiumLabel || ''})`);
                            lines.push(`  Ref: ${carrier.referenceNumber || 'N/A'}`);
                            lines.push(`  Credit ordered: ${carrier.creditOrdered || 'N/A'}`);
                            if (carrier.hasCarrierError) lines.push(`  ⚠ Carrier Error: ${carrier.carrierErrorMessage || 'unknown'}`);
                            if (carrier.discounts?.length) {
                                lines.push(`  Discounts: ${carrier.discounts.map(d => d.name + (d.amount ? ' ' + d.amount : '')).join(', ')}`);
                                if (carrier.totalSavings) lines.push(`  Total savings: ${carrier.totalSavings}`);
                            }
                            lines.push(`  Coverages:`);
                            Object.entries(carrier.coverages || {}).forEach(([k, v]) => lines.push(`    ${k}: ${v}`));
                            lines.push(`  Endorsements:`);
                            Object.entries(carrier.endorsements || {}).forEach(([k, v]) => lines.push(`    ${k}: ${v}`));
                            if (carrier.ratingMessages?.length) {
                                lines.push(`  Rating Messages:`);
                                carrier.ratingMessages.forEach(m => lines.push(`    - ${m}`));
                            }
                            if (carrier.paymentPlans?.length) {
                                lines.push(`  Payment Plans:`);
                                carrier.paymentPlans.forEach(p => lines.push(`    ${p.description}: total ${p.totalPremium}, down ${p.downPayment}, installment ${p.installment}`));
                            }
                            lines.push('');
                        });
                    }
                    return lines.join('\n');
                },

                async getRecommendation(extracted, apiKey) {
                    const autoQ = extracted?.autoQuotes || [];
                    const homeQ = extracted?.homeQuotes || extracted?.quotes || [];
                    if (!autoQ.length && !homeQ.length) return '';

                    const autoSummary = autoQ
                        .filter(q => !q.hasCarrierError)
                        .map(q => `AUTO ${q.carrier}: $${q.premiumAmount}/6mo, discounts: ${(q.discounts || []).map(d => d.name).join(', ') || 'none'}, ${q.ratingMessages?.length || 0} rating messages`)
                        .join('\n');
                    const homeSummary = homeQ
                        .filter(q => !q.hasCarrierError)
                        .map(q => {
                            const endorsements = Object.entries(q.endorsements || {})
                                .filter(([, v]) => v && v.toUpperCase().includes('INCLUDED'))
                                .map(([k]) => k);
                            return `HOME ${q.carrier}: $${q.premiumAmount || q.premium12Month}/yr, ${endorsements.length} endorsements included (${endorsements.join(', ')}), discounts: ${(q.discounts || []).map(d => d.name).join(', ') || 'none'}, ${q.ratingMessages?.length || 0} rating messages`;
                        }).join('\n');
                    const summaryForAI = [autoSummary, homeSummary].filter(Boolean).join('\n');

                    const systemPrompt = `You are a sharp insurance analyst giving a thoughtful, non-obvious recommendation. The user can already SEE the premiums, carrier names, and basic coverage amounts — do NOT restate those. Instead, provide insights they would NOT get from just reading the table.

Rules:
- Do NOT restate premiums or coverage limits the user can already see in the comparison table
- Do NOT start with greetings, preambles, or "Let's dive in" — start with the insight
- Bold carrier names with **asterisks**
- Use plain language but respect the reader's intelligence — no need to define basic terms
- Be specific with dollar amounts when calculating value differences
- If a cheaper option is genuinely the best pick, say so — don't upsell for the sake of it`;

                    const userMessage = `Here are the quotes:
${summaryForAI}

Prior carrier: ${extracted.applicant?.priorCarrier || 'Unknown'}
Years insured: ${extracted.applicant?.yearsWithCarrier || 'Unknown'}
Effective date: ${extracted.applicant?.effectiveDate || 'Unknown'}

Write a concise, insightful recommendation (3-4 paragraphs) that goes BEYOND the obvious. Focus on:

1. **Hidden value or risk** — Which carrier's endorsement package actually protects them better in a real claim scenario? Give a specific "what if" example (e.g., a tree falls on the house, a pipe bursts, a covered peril forces a rebuild to new code). Show how the extra $X/year with one carrier could save thousands in a real claim.

2. **The real cost difference** — Break down the price gap into what it actually buys. "The $170/yr difference between Carrier A and B gets you [specific endorsements], which would cover [specific scenario]." Calculate the cost-per-endorsement value.

3. **Red flags & deal-breakers** — Any rating messages, missing endorsements, or exclusions that are genuinely concerning for THIS specific risk. Don't just list them — explain why they matter.

4. **Bottom line** — One clear sentence: which carrier and why, from a "protect your biggest asset" perspective, not just price.`;

                    // Try AIProvider first (supports all providers)
                    if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
                        try {
                            const result = await AIProvider.ask(systemPrompt, userMessage, {
                                temperature: 0.5,
                                maxTokens: 2048
                            });
                            if (result.text) return result.text;
                        } catch (e) {
                            console.warn('[QuoteCompare] AIProvider recommendation failed:', e);
                        }
                    }

                    // Fallback: direct Gemini
                    if (!apiKey) return 'Unable to generate recommendation.';
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                    const body = {
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ parts: [{ text: userMessage }] }],
                        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 }
                    };

                    try {
                        const res = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        if (!res.ok) return 'Unable to generate recommendation.';
                        const data = await res.json();
                        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    } catch {
                        return 'Unable to generate recommendation.';
                    }
                },

                renderResults() {
                    const results = document.getElementById('qcResults');
                    if (!results || !this.data) return;

                    // Normalize legacy format: old quotes[] → homeQuotes[]
                    if (this.data.quotes && !this.data.autoQuotes && !this.data.homeQuotes) {
                        this.data.homeQuotes = this.data.quotes;
                    }
                    const autoQuotes = this.data.autoQuotes || [];
                    const homeQuotes = this.data.homeQuotes || [];
                    const hasAuto = autoQuotes.length > 0;
                    const hasHome = homeQuotes.length > 0;
                    const { applicant, recommendation } = this.data;

                    // Default active tab — auto if available, else home
                    if (!this._activeTab || (this._activeTab === 'auto' && !hasAuto) || (this._activeTab === 'home' && !hasHome)) {
                        this._activeTab = hasAuto ? 'auto' : 'home';
                    }

                    // -- Applicant bar --
                    const bar = document.getElementById('qcApplicantBar');
                    if (bar && applicant) {
                        bar.innerHTML = `
                            <div class="qc-applicant-name">${this.esc(applicant.name || 'Unknown Applicant')}</div>
                            <div class="qc-applicant-detail">
                                <span>📍 ${this.esc(applicant.address || '')}</span>
                                <span>📅 Eff: ${this.esc(applicant.effectiveDate || '')}</span>
                                ${applicant.priorCarrier ? `<span>🔄 Prior: ${this.esc(applicant.priorCarrier)}</span>` : ''}
                            </div>`;
                    }

                    // -- Tab bar (only when both lines present) --
                    let tabBar = document.getElementById('qcTabBar');
                    if (!tabBar && bar) {
                        tabBar = document.createElement('div');
                        tabBar.id = 'qcTabBar';
                        bar.insertAdjacentElement('afterend', tabBar);
                    }
                    if (tabBar) {
                        if (hasAuto && hasHome) {
                            tabBar.className = 'qc-tab-bar';
                            tabBar.innerHTML = `
                                <button class="qc-tab-btn${this._activeTab === 'auto' ? ' active' : ''}" data-tab-target="auto" onclick="QuoteCompare._switchTab('auto')">Auto (${autoQuotes.length} carrier${autoQuotes.length !== 1 ? 's' : ''})</button>
                                <button class="qc-tab-btn${this._activeTab === 'home' ? ' active' : ''}" data-tab-target="home" onclick="QuoteCompare._switchTab('home')">Home (${homeQuotes.length} carrier${homeQuotes.length !== 1 ? 's' : ''})</button>`;
                        } else {
                            tabBar.className = '';
                            tabBar.innerHTML = '';
                        }
                    }

                    // -- Render active line (cards, tables, discounts, payments) --
                    this._renderLine(this._activeTab);

                    // -- Smart Recommendation --
                    const recDiv = document.getElementById('qcRecommendation');
                    if (recDiv && recommendation) {
                        // Convert markdown bold to HTML
                        const formatted = this.esc(recommendation)
                            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br>');
                        recDiv.innerHTML = `
                            <details class="qc-details" open>
                                <summary style="font-size:14px;text-transform:none;letter-spacing:0;border:none;margin:0 0 12px;">💡 Smart Recommendation</summary>
                                <div class="qc-rec-body">${formatted}</div>
                            </details>`;
                    }

                    // Hide saved section when viewing results
                    const savedSection = document.getElementById('qcSavedSection');
                    if (savedSection) savedSection.style.display = 'none';

                    results.classList.add('active');
                },

                _switchTab(tab) {
                    this._renderLine(tab);
                },

                _renderLine(tab) {
                    this._activeTab = tab;
                    const isAuto = tab === 'auto';
                    const quotes = isAuto
                        ? (this.data?.autoQuotes || [])
                        : (this.data?.homeQuotes || this.data?.quotes || []);

                    // Update tab button active states
                    const tabBar = document.getElementById('qcTabBar');
                    if (tabBar) {
                        tabBar.querySelectorAll('.qc-tab-btn').forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.tabTarget === tab);
                        });
                    }

                    // Split valid vs error carriers; sort valid ascending by premium
                    const validQuotes = quotes.filter(q => !q.hasCarrierError)
                        .sort((a, b) => (a.premiumAmount || 0) - (b.premiumAmount || 0));
                    const errorQuotes = quotes.filter(q => q.hasCarrierError);
                    const sorted = [...validQuotes, ...errorQuotes];
                    const divisor = isAuto ? 6 : 12;
                    const periodLabel = isAuto ? '6mo' : 'mo';
                    const mostExpensive = validQuotes.length > 0 ? (validQuotes[validQuotes.length - 1]?.premiumAmount || 0) : 0;

                    // -- Premium cards --
                    const cards = document.getElementById('qcCards');
                    if (cards) {
                        cards.innerHTML = sorted.map((q, i) => {
                            if (q.hasCarrierError) {
                                return `
                                <div class="qc-card error">
                                    <div class="qc-card-carrier">${this.esc(q.carrier)}</div>
                                    <div class="qc-card-error-msg">⚠ ${this.esc(q.carrierErrorMessage || 'Carrier error — quote unavailable')}</div>
                                </div>`;
                            }
                            const isBest = i === 0 && !q.isAlternate;
                            const isAlt = q.isAlternate;
                            const premium = q.premiumAmount || 0;
                            const monthly = premium ? (premium / divisor).toFixed(0) : '—';
                            const savingsVsMax = isBest && mostExpensive ? (mostExpensive - premium) : 0;
                            const badgeText = isAlt ? (q.alternateName || 'Alternate') : (isBest ? 'Lowest Price' : null);
                            return `
                            <div class="qc-card${isBest ? ' best' : ''}${isAlt ? ' alt' : ''}">
                                ${badgeText ? `<div class="qc-card-badge">${this.esc(badgeText)}</div>` : ''}
                                <div class="qc-card-carrier">${this.esc(q.carrier)}</div>
                                ${q.referenceNumber ? `<div class="qc-card-ref">${this.esc(q.referenceNumber)}</div>` : ''}
                                <div class="qc-card-premium">$${premium.toLocaleString()}</div>
                                <div class="qc-card-monthly">~$${monthly}/${periodLabel}</div>
                                ${isBest && savingsVsMax > 0 ? `<div class="qc-card-savings">Save $${savingsVsMax.toLocaleString()} vs highest</div>` : ''}
                                <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${this.esc(q.premiumLabel || '')}</div>
                            </div>`;
                        }).join('');
                    }

                    // -- Coverage table --
                    const thead = document.getElementById('qcTableHead');
                    const tbody = document.getElementById('qcTableBody');
                    if (thead && tbody) {
                        if (isAuto) {
                            const autoCovKeys = [
                                { label: 'Bodily Injury',   get: c => c?.bodilyInjury?.limit },
                                { label: 'Property Damage', get: c => c?.propertyDamage?.limit },
                                { label: 'Comp Ded',        get: c => c?.comprehensive?.deductible },
                                { label: 'Collision Ded',   get: c => c?.collision?.deductible },
                                { label: 'UM/UIM',          get: c => c?.uninsuredMotorist?.limit || c?.underinsuredMotorist?.limit },
                                { label: 'PIP',             get: c => c?.pip?.limit },
                                { label: 'Towing',          get: c => c?.towing?.limit },
                                { label: 'Rental',          get: c => c?.rentalReimbursement?.limit },
                            ];
                            thead.innerHTML = `<tr><th>Coverage</th>${validQuotes.map(q => `<th>${this.esc(q.carrier)}</th>`).join('')}</tr>`;
                            tbody.innerHTML = autoCovKeys.map(({ label, get }) => `
                                <tr>
                                    <td class="qc-row-label">${label}</td>
                                    ${validQuotes.map(q => `<td>${this.formatCoverageVal(get(q.coverages) || '')}</td>`).join('')}
                                </tr>`).join('');
                        } else {
                            const homeCovKeys = ['dwelling', 'otherStructures', 'lossOfUse', 'personalProperty', 'personalLiability', 'medicalPayments', 'deductible'];
                            const homeCovLabels = {
                                dwelling: 'Dwelling (Cov A)', otherStructures: 'Other Structures (Cov B)',
                                lossOfUse: 'Loss of Use (Cov D)', personalProperty: 'Personal Property (Cov C)',
                                personalLiability: 'Personal Liability (Cov E)', medicalPayments: 'Medical Payments (Cov F)',
                                deductible: 'Deductible'
                            };
                            thead.innerHTML = `<tr><th>Coverage</th>${validQuotes.map(q => `<th>${this.esc(q.carrier)}</th>`).join('')}</tr>`;
                            tbody.innerHTML = homeCovKeys.map(key => `
                                <tr>
                                    <td class="qc-row-label">${homeCovLabels[key] || key}</td>
                                    ${validQuotes.map(q => `<td>${this.formatCoverageVal(q.coverages?.[key] || '')}</td>`).join('')}
                                </tr>`).join('');
                        }
                    }

                    // -- Endorsements section: visible for home only --
                    const endorsementsDetails = document.getElementById('qcEndorsementHead')?.closest('details');
                    if (endorsementsDetails) endorsementsDetails.style.display = isAuto ? 'none' : '';
                    if (!isAuto) {
                        const ehead = document.getElementById('qcEndorsementHead');
                        const ebody = document.getElementById('qcEndorsementBody');
                        if (ehead && ebody) {
                            const allEndorsementKeys = new Set();
                            validQuotes.forEach(q => Object.keys(q.endorsements || {}).forEach(k => allEndorsementKeys.add(k)));
                            const endorsementLabels = {
                                creditCardLimit: 'Credit Card Limit', increasedMold: 'Increased Mold',
                                lossAssessment: 'Loss Assessment', ordinanceOrLaw: 'Ordinance or Law',
                                replacementCostContent: 'Replacement Cost Content', replacementCostDwelling: 'Replacement Cost Dwelling',
                                waterBackup: 'Water Backup', allPerilsDeductible: 'All Perils Deductible',
                                personalInjury: 'Personal Injury', identityTheft: 'Identity Theft',
                                earthquake: 'Earthquake', scheduledPersonalProperty: 'Scheduled Personal Property'
                            };
                            ehead.innerHTML = `<tr><th>Endorsement</th>${validQuotes.map(q => `<th>${this.esc(q.carrier)}</th>`).join('')}</tr>`;
                            ebody.innerHTML = [...allEndorsementKeys].map(key => `
                                <tr>
                                    <td class="qc-row-label">${endorsementLabels[key] || this.camelToTitle(key)}</td>
                                    ${validQuotes.map(q => {
                                        const val = q.endorsements?.[key] || 'Not Included';
                                        return `<td>${this.formatEndorsementVal(val)}</td>`;
                                    }).join('')}
                                </tr>`).join('');
                        }
                    }

                    // -- Discounts & Messages --
                    const discountsDiv = document.getElementById('qcDiscounts');
                    if (discountsDiv) {
                        discountsDiv.innerHTML = validQuotes.map(q => `
                            <div style="margin-bottom: 16px;">
                                <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:var(--text);">${this.esc(q.carrier)}</div>
                                ${q.discounts?.length ? `
                                    <div style="font-size:12px;font-weight:600;color:#34c759;margin-bottom:4px;">Discounts${q.totalSavings ? ' (Total: ' + this.esc(q.totalSavings) + ')' : ''}</div>
                                    <ul class="qc-detail-list">
                                        ${q.discounts.map(d => `<li class="qc-discount">${this.esc(d.name)}${d.amount ? ': ' + this.esc(d.amount) : ''}</li>`).join('')}
                                    </ul>` : '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">No discounts listed</div>'}
                                ${q.ratingMessages?.length ? `
                                    <div style="font-size:12px;font-weight:600;color:#ff9500;margin:8px 0 4px;">Rating Messages</div>
                                    <ul class="qc-detail-list">
                                        ${q.ratingMessages.map(m => `<li class="qc-warning">${this.esc(m)}</li>`).join('')}
                                    </ul>` : ''}
                            </div>
                        `).join('');
                    }

                    // -- Payment Plans --
                    const payDiv = document.getElementById('qcPaymentPlans');
                    if (payDiv) {
                        payDiv.innerHTML = validQuotes.filter(q => q.paymentPlans?.length).map(q => `
                            <div class="qc-payment-card">
                                <div class="qc-payment-carrier">${this.esc(q.carrier)}</div>
                                ${q.paymentPlans.map(p => `
                                    <div class="qc-payment-row">
                                        <span>${this.esc(p.description)}</span>
                                        <span>${this.esc(p.installment || p.totalPremium || '')}</span>
                                    </div>
                                `).join('')}
                            </div>`).join('');
                    }
                },

                // ── Saved Comparisons ─────────────────────────

                getSaved() {
                    return Utils.tryParseLS(this.STORAGE_KEY, []);
                },

                autoSave() {
                    const allQuotes = [
                        ...(this.data?.autoQuotes || []),
                        ...(this.data?.homeQuotes || this.data?.quotes || [])
                    ];
                    if (!allQuotes.length) return;
                    const saved = this.getSaved();
                    const name = this.data.applicant?.name || 'Unknown';
                    const carriers = [...new Set(allQuotes.map(q => q.carrier))].join(', ');
                    const entry = {
                        id: Date.now(),
                        timestamp: new Date().toISOString(),
                        name,
                        carriers,
                        carrierCount: allQuotes.length,
                        lowestPremium: Math.min(...allQuotes.map(q => q.premiumAmount || q.premium12Month || Infinity)),
                        data: this.data
                    };
                    // Avoid duplicates — if same applicant name already saved within last 60s, overwrite
                    const recentIdx = saved.findIndex(s => s.name === name && (Date.now() - new Date(s.timestamp).getTime()) < 60000);
                    if (recentIdx >= 0) {
                        saved[recentIdx] = entry;
                    } else {
                        saved.unshift(entry);
                    }
                    // Keep max 20
                    if (saved.length > 20) saved.length = 20;
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saved));
                },

                loadSaved(id) {
                    const saved = this.getSaved();
                    const entry = saved.find(s => s.id === id);
                    if (!entry?.data) return App.toast('⚠️ Comparison not found');
                    this.data = entry.data;
                    this.chatHistory = [];
                    const zone = document.getElementById('qcUploadZone');
                    const loading = document.getElementById('qcLoading');
                    const progress = document.getElementById('qcProgress');
                    if (zone) zone.style.display = 'none';
                    if (loading) { loading.classList.remove('active'); loading.style.display = 'none'; }
                    if (progress) progress.style.width = '100%';
                    this.renderResults();
                    App.toast('✅ Loaded comparison');
                },

                deleteSaved(id, e) {
                    if (e) e.stopPropagation();
                    const saved = this.getSaved().filter(s => s.id !== id);
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saved));
                    this.renderSavedList();
                    App.toast('🗑️ Comparison deleted');
                },

                renderSavedList() {
                    const list = document.getElementById('qcSavedList');
                    const section = document.getElementById('qcSavedSection');
                    if (!list || !section) return;
                    const saved = this.getSaved();
                    if (!saved.length) {
                        section.style.display = 'none';
                        return;
                    }
                    section.style.display = '';
                    list.innerHTML = saved.map(s => {
                        const date = new Date(s.timestamp);
                        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                        const premium = s.lowestPremium && s.lowestPremium !== Infinity ? '$' + s.lowestPremium.toLocaleString() + '/yr lowest' : '';
                        return `
                        <div class="qc-saved-item" onclick="QuoteCompare.loadSaved(${s.id})">
                            <div class="qc-saved-item-icon">📊</div>
                            <div class="qc-saved-item-info">
                                <div class="qc-saved-item-name">${this.esc(s.name)}</div>
                                <div class="qc-saved-item-meta">${s.carrierCount || '?'} carriers &bull; ${premium ? premium + ' &bull; ' : ''}${dateStr} ${timeStr}</div>
                            </div>
                            <button class="qc-saved-item-delete" onclick="QuoteCompare.deleteSaved(${s.id}, event)" title="Delete">✕</button>
                        </div>`;
                    }).join('');
                },

                formatCoverageVal(val) {
                    if (!val) return '<span class="qc-val-missing">—</span>';
                    const s = String(val).trim().toUpperCase();
                    if (s === 'INCLUDED' || s === 'INCLUDE') {
                        return '<span class="qc-val-included">✓ Included</span>';
                    }
                    // If it's a dollar amount
                    if (val.match && val.match(/^\$?[\d,.]+$/)) {
                        return `<span style="font-weight:600;">${this.esc(val)}</span>`;
                    }
                    return this.esc(val);
                },

                formatEndorsementVal(val) {
                    if (!val) return '<span class="qc-val-missing">✗</span>';
                    const s = String(val).trim().toUpperCase();
                    if (s === 'INCLUDED' || s === 'INCLUDE') {
                        return '<span class="qc-val-included">✓ Included</span>';
                    }
                    if (s === 'NOT INCLUDED' || s === 'N/A' || s === 'NO') {
                        return '<span class="qc-val-missing">✗</span>';
                    }
                    return this.esc(val);
                },

                camelToTitle(str) {
                    return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
                },

                esc(str) {
                    if (!str) return '';
                    const d = document.createElement('div');
                    d.textContent = String(str);
                    return d.innerHTML;
                },

                copyTable() {
                    const allQuotes = [
                        ...(this.data?.autoQuotes || []),
                        ...(this.data?.homeQuotes || this.data?.quotes || [])
                    ];
                    if (!allQuotes.length) return App.toast('No data to copy');
                    const quotes = allQuotes;
                    const coverageKeys = ['dwelling', 'otherStructures', 'lossOfUse', 'personalProperty', 'personalLiability', 'medicalPayments'];
                    const rows = [
                        ['Coverage', ...quotes.map(q => q.carrier)],
                        ['Premium', ...quotes.map(q => '$' + (q.premiumAmount || q.premium12Month || 0).toLocaleString() + (q.premiumTerm ? ' ' + q.premiumTerm : ''))],

                        ...coverageKeys.map(k => [
                            k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
                            ...quotes.map(q => q.coverages?.[k] || 'N/A')
                        ])
                    ];
                    const tsv = rows.map(r => r.join('\t')).join('\n');
                    navigator.clipboard.writeText(tsv).then(
                        () => App.toast('📋 Table copied to clipboard'),
                        () => App.toast('❌ Copy failed')
                    );
                },

                async exportPDF() {
                    const allExportQuotes = [
                        ...(this.data?.autoQuotes || []),
                        ...(this.data?.homeQuotes || this.data?.quotes || [])
                    ];
                    if (!allExportQuotes.length) return App.toast('No data to export');
                    // Lazy-load jsPDF from CDN if missing
                    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
                        try {
                            await new Promise((resolve, reject) => {
                                const s = document.createElement('script');
                                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                                s.onload = () => resolve();
                                s.onerror = () => reject(new Error('CDN unreachable'));
                                document.head.appendChild(s);
                            });
                        } catch (_) { /* check below */ }
                    }
                    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
                        return App.toast('❌ jsPDF not loaded — check internet and reload');
                    }

                    const { jsPDF } = typeof jspdf !== 'undefined' ? jspdf : (window.jspdf || { jsPDF: window.jsPDF });
                    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                    const quotes = [...allExportQuotes].sort((a, b) => (a.premiumAmount || a.premium12Month || 0) - (b.premiumAmount || b.premium12Month || 0));
                    const applicant = this.data.applicant || {};
                    const pageW = doc.internal.pageSize.getWidth();

                    // Title
                    doc.setFontSize(18);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Quote Comparison Summary', 14, 18);
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`${applicant.name || 'N/A'} | Eff: ${applicant.effectiveDate || 'N/A'}`, 14, 25);
                    doc.text(`Generated by Altech Insurance Tools — ${new Date().toLocaleDateString()}`, 14, 30);

                    // Premium comparison
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Premium Comparison', 14, 40);

                    const premHeaders = ['Carrier', 'Annual Premium', 'Monthly Est.', 'Discounts'];
                    const premRows = quotes.map(q => {
                        const prem = q.premiumAmount || q.premium12Month || 0;
                        const divisor = q.premiumTerm === '6 Month' ? 6 : 12;
                        return [
                            q.carrier || 'Unknown',
                            '$' + prem.toLocaleString() + (q.premiumTerm ? ' ' + q.premiumTerm : ''),
                            '~$' + (prem ? (prem / divisor).toFixed(0) : '—') + '/mo',
                            q.totalSavings || (q.discounts?.length ? q.discounts.length + ' applied' : 'None')
                        ];
                    });

                    doc.autoTable ? doc.autoTable({
                        head: [premHeaders], body: premRows,
                        startY: 44, theme: 'grid', styles: { fontSize: 9 },
                        headStyles: { fillColor: [0, 122, 255] }
                    }) : (() => {
                        let y = 44;
                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'bold');
                        premHeaders.forEach((h, i) => doc.text(h, 14 + i * 60, y));
                        y += 6;
                        doc.setFont('helvetica', 'normal');
                        premRows.forEach(row => {
                            row.forEach((c, i) => doc.text(String(c), 14 + i * 60, y));
                            y += 5;
                        });
                    })();

                    // Coverage comparison
                    let covY = (doc.autoTable?.previous?.finalY || 80) + 10;
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Coverage Comparison', 14, covY);
                    covY += 6;

                    const covKeys = ['dwelling', 'otherStructures', 'lossOfUse', 'personalProperty', 'personalLiability', 'medicalPayments'];
                    const covLabels = { dwelling: 'Dwelling', otherStructures: 'Other Structures', lossOfUse: 'Loss of Use', personalProperty: 'Personal Property', personalLiability: 'Personal Liability', medicalPayments: 'Medical Payments' };

                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Coverage', 14, covY);
                    quotes.forEach((q, i) => doc.text(q.carrier || 'Unknown', 60 + i * 55, covY));
                    covY += 5;
                    doc.setFont('helvetica', 'normal');
                    covKeys.forEach(k => {
                        doc.text(covLabels[k] || k, 14, covY);
                        quotes.forEach((q, i) => {
                            const v = q.coverages?.[k] || '—';
                            doc.text(String(v).substring(0, 20), 60 + i * 55, covY);
                        });
                        covY += 5;
                    });

                    const fileName = `Quote_Compare_${(applicant.name || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                    doc.save(fileName);
                    App.toast('📥 PDF downloaded');
                },

                // ── Chat Methods ──────────────────────────────

                toggleChat() {
                    const chat = document.getElementById('qcChat');
                    if (chat) chat.classList.toggle('open');
                },

                askChip(question) {
                    const input = document.getElementById('qcChatInput');
                    if (input) input.value = question;
                    this.sendChat();
                },

                async sendChat() {
                    const input = document.getElementById('qcChatInput');
                    const messagesDiv = document.getElementById('qcChatMessages');
                    if (!input || !messagesDiv) return;

                    const userMsg = input.value.trim();
                    if (!userMsg) return;
                    input.value = '';

                    // Add user message
                    const userBubble = document.createElement('div');
                    userBubble.className = 'qc-msg qc-msg-user';
                    userBubble.textContent = userMsg;
                    messagesDiv.appendChild(userBubble);

                    // Show typing indicator
                    const typing = document.createElement('div');
                    typing.className = 'qc-msg-typing active';
                    typing.innerHTML = '<span class="qc-typing-dot"></span><span class="qc-typing-dot"></span><span class="qc-typing-dot"></span>';
                    messagesDiv.appendChild(typing);
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;

                    // Build conversation in normalized format
                    this.chatHistory.push({ role: 'user', parts: [{ text: userMsg }] });

                    try {
                        const quoteContext = this.buildQuoteContext();
                        const systemInstruction = this.SYSTEM_PROMPT + '\n\nHere is the full quote data you\'re discussing:\n\n' + quoteContext;

                        let reply = '';

                        // Try AIProvider.chat() first (supports all providers)
                        if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured() && AIProvider.chat) {
                            try {
                                // Convert Gemini-style history to normalized format
                                const normalizedHistory = this.chatHistory.map(m => ({
                                    role: m.role === 'model' ? 'assistant' : m.role,
                                    content: m.parts?.[0]?.text || m.content || ''
                                }));
                                const result = await AIProvider.chat(systemInstruction, normalizedHistory, {
                                    temperature: 0.7,
                                    maxTokens: 2048
                                });
                                reply = result.text || '';
                            } catch (e) {
                                console.warn('[QuoteCompare] AIProvider.chat failed, trying fallback:', e);
                            }
                        }

                        // Fallback: direct Gemini API
                        if (!reply) {
                            const apiKey = await this.getApiKey();
                            if (!apiKey) throw new Error('No API key');
                            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                            const body = {
                                systemInstruction: { parts: [{ text: systemInstruction }] },
                                contents: this.chatHistory,
                                generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
                            };
                            const res = await fetch(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body)
                            });
                            if (!res.ok) throw new Error('API error');
                            const data = await res.json();
                            reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response.';
                        }

                        if (!reply) reply = 'Sorry, I couldn\'t generate a response.';

                        // Save to history (keep Gemini format for backward compat)
                        this.chatHistory.push({ role: 'model', parts: [{ text: reply }] });

                        // Remove typing, add response
                        typing.remove();
                        const aiBubble = document.createElement('div');
                        aiBubble.className = 'qc-msg qc-msg-ai';
                        // Format markdown bold and newlines
                        aiBubble.innerHTML = this.esc(reply)
                            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br>');
                        messagesDiv.appendChild(aiBubble);
                    } catch (err) {
                        typing.remove();
                        const errBubble = document.createElement('div');
                        errBubble.className = 'qc-msg qc-msg-ai';
                        errBubble.textContent = 'Oops! I had trouble connecting. Please try again.';
                        messagesDiv.appendChild(errBubble);
                    }

                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
            };

            window.QuoteCompare = QuoteCompare;
