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

                        // Get Gemini API key
                        const apiKey = await this.getApiKey();
                        if (!apiKey) {
                            throw new Error('No Gemini API key found. Set GOOGLE_API_KEY in .env or api/config.json');
                        }

                        // Call Gemini to extract structured data
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
                    const prompt = `You are an expert insurance analyst. Analyze this EZLynx quote document and extract ALL carrier quotes into structured JSON.

Return ONLY valid JSON with this exact structure (no markdown, no commentary):
{
  "applicant": {
    "name": "Full Name",
    "address": "Full Address",
    "county": "County",
    "phone": "Phone",
    "email": "Email",
    "policyType": "HO3/HO5/Auto etc",
    "effectiveDate": "MM/DD/YYYY",
    "expirationDate": "MM/DD/YYYY",
    "priorCarrier": "Carrier Name",
    "yearsWithCarrier": "Duration"
  },
  "dwelling": {
    "replacementCost": "Amount",
    "yearBuilt": "Year",
    "sqft": "Square Footage",
    "stories": "Number",
    "constructionType": "Type",
    "roofType": "Type",
    "protectionClass": "Class",
    "heatingType": "Type"
  },
  "quotes": [
    {
      "carrier": "Carrier Name (e.g. Travelers Protect, Safeco, etc.)",
      "issuingCompany": "Full issuing company name if different",
      "premium12Month": 1234.00,
      "premiumLabel": "Total Premium or Paid-In-Full etc",
      "referenceNumber": "CCF# or Reference Number",
      "creditOrdered": "Yes/No/NA",
      "discounts": [
        { "name": "Discount Name", "amount": "-$123.00 or empty" }
      ],
      "totalSavings": "$123.00 or empty",
      "ratingMessages": ["Message 1", "Message 2"],
      "coverages": {
        "dwelling": "$Amount or INCLUDED",
        "otherStructures": "$Amount or INCLUDED",
        "lossOfUse": "$Amount or INCLUDED",
        "personalProperty": "$Amount or INCLUDED",
        "personalLiability": "$Amount or INCLUDED",
        "medicalPayments": "$Amount or INCLUDED"
      },
      "endorsements": {
        "creditCardLimit": "INCLUDED or Not Included",
        "increasedMold": "INCLUDED or Not Included",
        "lossAssessment": "INCLUDED or Not Included",
        "ordinanceOrLaw": "INCLUDED or 10% or Not Included",
        "replacementCostContent": "INCLUDED or Not Included",
        "replacementCostDwelling": "INCLUDED or Not Included",
        "waterBackup": "INCLUDED or Not Included",
        "allPerilsDeductible": "INCLUDED or $Amount or Not Included",
        "personalInjury": "INCLUDED or Not Included",
        "identityTheft": "INCLUDED or Not Included",
        "earthquake": "INCLUDED or Not Included",
        "scheduledPersonalProperty": "INCLUDED or Not Included"
      },
      "paymentPlans": [
        { "description": "Plan name", "totalPremium": "$Amount", "downPayment": "$Amount", "installment": "$Amount" }
      ]
    }
  ]
}

IMPORTANT:
- Extract EVERY carrier quote found in the document
- Sort quotes by premium (lowest first)
- If a carrier name is not explicitly stated, use the issuing company name
- Parse dollar amounts as numbers (no $ sign) for premium12Month
- Include ALL endorsements found, even if "Not Included"
- Include ALL payment plans for each carrier
- If data is missing, use empty string, not null`;

                    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                    const body = {
                        contents: [{
                            parts: [...parts, { text: prompt }]
                        }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 8192
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

                        // Extract JSON from response
                        const jsonMatch = text.match(/\{[\s\S]*\}/);
                        if (!jsonMatch) throw new Error('No valid JSON in Gemini response');

                        return JSON.parse(jsonMatch[0]);
                    } finally {
                        clearTimeout(timeout);
                    }
                },

                buildQuoteContext() {
                    if (!this.data?.quotes?.length) return 'No quote data available.';
                    const q = this.data;
                    const lines = [];
                    lines.push(`Applicant: ${q.applicant?.name || 'Unknown'}`);
                    lines.push(`Address: ${q.applicant?.address || 'Unknown'}`);
                    lines.push(`Policy: ${q.applicant?.policyType || 'HO3'}, Eff: ${q.applicant?.effectiveDate || '?'}, Prior: ${q.applicant?.priorCarrier || '?'} (${q.applicant?.yearsWithCarrier || '?'})`);
                    lines.push(`Property: ${q.dwelling?.sqft || '?'}sqft, built ${q.dwelling?.yearBuilt || '?'}, ${q.dwelling?.constructionType || '?'}, ${q.dwelling?.roofType || '?'} roof, protection class ${q.dwelling?.protectionClass || '?'}`);
                    lines.push('');
                    q.quotes.forEach(carrier => {
                        lines.push(`--- ${carrier.carrier} ---`);
                        lines.push(`  Premium: $${carrier.premium12Month || '?'}/yr (${carrier.premiumLabel || ''})`);
                        lines.push(`  Ref: ${carrier.referenceNumber || 'N/A'}`);
                        lines.push(`  Credit ordered: ${carrier.creditOrdered || 'N/A'}`);
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
                    return lines.join('\n');
                },

                async getRecommendation(extracted, apiKey) {
                    if (!extracted?.quotes?.length) return '';

                    const summaryForAI = extracted.quotes.map(q => {
                        const endorsements = Object.entries(q.endorsements || {})
                            .filter(([, v]) => v && v.toUpperCase().includes('INCLUDED'))
                            .map(([k]) => k);
                        return `${q.carrier}: $${q.premium12Month}/yr, ${endorsements.length} endorsements included (${endorsements.join(', ')}), discounts: ${(q.discounts || []).map(d => d.name).join(', ') || 'none'}, ${q.ratingMessages?.length || 0} rating messages`;
                    }).join('\n');

                    const prompt = `You are a sharp insurance analyst giving a thoughtful, non-obvious recommendation. The user can already SEE the premiums, carrier names, and basic coverage amounts — do NOT restate those. Instead, provide insights they would NOT get from just reading the table.

Here are the quotes:
${summaryForAI}

Property info: ${extracted.dwelling?.sqft || '?'}sqft, built ${extracted.dwelling?.yearBuilt || '?'}, ${extracted.dwelling?.constructionType || '?'} construction, ${extracted.dwelling?.roofType || '?'} roof
Prior carrier: ${extracted.applicant?.priorCarrier || 'Unknown'}
Years insured: ${extracted.applicant?.yearsWithCarrier || 'Unknown'}

Write a concise, insightful recommendation (3-4 paragraphs) that goes BEYOND the obvious. Focus on:

1. **Hidden value or risk** — Which carrier's endorsement package actually protects them better in a real claim scenario? Give a specific "what if" example (e.g., a tree falls on the house, a pipe bursts, a covered peril forces a rebuild to new code). Show how the extra $X/year with one carrier could save thousands in a real claim.

2. **The real cost difference** — Break down the price gap into what it actually buys. "The $170/yr difference between Carrier A and B gets you [specific endorsements], which would cover [specific scenario]." Calculate the cost-per-endorsement value.

3. **Red flags & deal-breakers** — Any rating messages, missing endorsements, or exclusions that are genuinely concerning for THIS specific property (age, construction type, location). Don't just list them — explain why they matter for this home.

4. **Bottom line** — One clear sentence: which carrier and why, from a "protect your biggest asset" perspective, not just price.

Rules:
- Do NOT restate premiums or coverage limits the user can already see in the comparison table
- Do NOT start with greetings, preambles, or "Let's dive in" — start with the insight
- Bold carrier names with **asterisks**
- Use plain language but respect the reader's intelligence — no need to define basic terms
- Be specific with dollar amounts when calculating value differences
- If a cheaper option is genuinely the best pick, say so — don't upsell for the sake of it`;

                    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                    const body = {
                        contents: [{ parts: [{ text: prompt }] }],
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

                    const { applicant, dwelling, quotes, recommendation } = this.data;

                    // -- Applicant bar --
                    const bar = document.getElementById('qcApplicantBar');
                    if (bar && applicant) {
                        bar.innerHTML = `
                            <div class="qc-applicant-name">${this.esc(applicant.name || 'Unknown Applicant')}</div>
                            <div class="qc-applicant-detail">
                                <span>📍 ${this.esc(applicant.address || '')}</span>
                                <span>📋 ${this.esc(applicant.policyType || 'HO3')}</span>
                                <span>📅 Eff: ${this.esc(applicant.effectiveDate || '')}</span>
                                ${applicant.priorCarrier ? `<span>🔄 Prior: ${this.esc(applicant.priorCarrier)}</span>` : ''}
                            </div>`;
                    }

                    // -- Sort quotes by premium --
                    const sorted = [...(quotes || [])].sort((a, b) => (a.premium12Month || 0) - (b.premium12Month || 0));
                    const cheapest = sorted[0]?.premium12Month || 0;
                    const mostExpensive = sorted[sorted.length - 1]?.premium12Month || 0;

                    // -- Premium cards --
                    const cards = document.getElementById('qcCards');
                    if (cards) {
                        cards.innerHTML = sorted.map((q, i) => {
                            const isBest = i === 0;
                            const monthly = q.premium12Month ? (q.premium12Month / 12).toFixed(0) : '—';
                            const savingsVsMax = mostExpensive && q.premium12Month ? (mostExpensive - q.premium12Month) : 0;
                            return `
                            <div class="qc-card${isBest ? ' best' : ''}">
                                ${isBest ? '<div class="qc-card-badge">Lowest Price</div>' : ''}
                                <div class="qc-card-carrier">${this.esc(q.carrier)}</div>
                                <div class="qc-card-premium">$${(q.premium12Month || 0).toLocaleString()}</div>
                                <div class="qc-card-monthly">~$${monthly}/mo</div>
                                ${savingsVsMax > 0 && !isBest ? '' :
                                  savingsVsMax > 0 ? `<div class="qc-card-savings">Save $${savingsVsMax.toLocaleString()} vs highest</div>` : ''}
                                <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${this.esc(q.premiumLabel || '')}</div>
                            </div>`;
                        }).join('');
                    }

                    // -- Coverage table --
                    const coverageKeys = ['dwelling', 'otherStructures', 'lossOfUse', 'personalProperty', 'personalLiability', 'medicalPayments'];
                    const coverageLabels = { dwelling: 'Dwelling (Cov A)', otherStructures: 'Other Structures (Cov B)', lossOfUse: 'Loss of Use (Cov D)', personalProperty: 'Personal Property (Cov C)', personalLiability: 'Personal Liability (Cov E)', medicalPayments: 'Medical Payments (Cov F)' };

                    const thead = document.getElementById('qcTableHead');
                    const tbody = document.getElementById('qcTableBody');
                    if (thead && tbody) {
                        thead.innerHTML = `<tr><th>Coverage</th>${sorted.map(q => `<th>${this.esc(q.carrier)}</th>`).join('')}</tr>`;
                        tbody.innerHTML = coverageKeys.map(key => `
                            <tr>
                                <td class="qc-row-label">${coverageLabels[key] || key}</td>
                                ${sorted.map(q => {
                                    const val = q.coverages?.[key] || '';
                                    return `<td>${this.formatCoverageVal(val)}</td>`;
                                }).join('')}
                            </tr>
                        `).join('');
                    }

                    // -- Endorsements table --
                    const allEndorsementKeys = new Set();
                    sorted.forEach(q => {
                        Object.keys(q.endorsements || {}).forEach(k => allEndorsementKeys.add(k));
                    });
                    const endorsementLabels = {
                        creditCardLimit: 'Credit Card Limit', increasedMold: 'Increased Mold',
                        lossAssessment: 'Loss Assessment', ordinanceOrLaw: 'Ordinance or Law',
                        replacementCostContent: 'Replacement Cost Content', replacementCostDwelling: 'Replacement Cost Dwelling',
                        waterBackup: 'Water Backup', allPerilsDeductible: 'All Perils Deductible',
                        personalInjury: 'Personal Injury', identityTheft: 'Identity Theft',
                        earthquake: 'Earthquake', scheduledPersonalProperty: 'Scheduled Personal Property'
                    };

                    const ehead = document.getElementById('qcEndorsementHead');
                    const ebody = document.getElementById('qcEndorsementBody');
                    if (ehead && ebody) {
                        ehead.innerHTML = `<tr><th>Endorsement</th>${sorted.map(q => `<th>${this.esc(q.carrier)}</th>`).join('')}</tr>`;
                        ebody.innerHTML = [...allEndorsementKeys].map(key => `
                            <tr>
                                <td class="qc-row-label">${endorsementLabels[key] || this.camelToTitle(key)}</td>
                                ${sorted.map(q => {
                                    const val = q.endorsements?.[key] || 'Not Included';
                                    return `<td>${this.formatEndorsementVal(val)}</td>`;
                                }).join('')}
                            </tr>
                        `).join('');
                    }

                    // -- Discounts & Messages --
                    const discountsDiv = document.getElementById('qcDiscounts');
                    if (discountsDiv) {
                        discountsDiv.innerHTML = sorted.map(q => `
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
                        payDiv.innerHTML = sorted.map(q => {
                            if (!q.paymentPlans?.length) return '';
                            return `
                            <div class="qc-payment-card">
                                <div class="qc-payment-carrier">${this.esc(q.carrier)}</div>
                                ${q.paymentPlans.map(p => `
                                    <div class="qc-payment-row">
                                        <span>${this.esc(p.description)}</span>
                                        <span>${this.esc(p.installment || p.totalPremium || '')}</span>
                                    </div>
                                `).join('')}
                            </div>`;
                        }).join('');
                    }

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

                // ── Saved Comparisons ─────────────────────────

                getSaved() {
                    try {
                        return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
                    } catch { return []; }
                },

                autoSave() {
                    if (!this.data?.quotes?.length) return;
                    const saved = this.getSaved();
                    const name = this.data.applicant?.name || 'Unknown';
                    const carriers = this.data.quotes.map(q => q.carrier).join(', ');
                    const entry = {
                        id: Date.now(),
                        timestamp: new Date().toISOString(),
                        name,
                        carriers,
                        carrierCount: this.data.quotes.length,
                        lowestPremium: Math.min(...this.data.quotes.map(q => q.premium12Month || Infinity)),
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
                    if (!this.data?.quotes) return App.toast('No data to copy');
                    const quotes = this.data.quotes;
                    const coverageKeys = ['dwelling', 'otherStructures', 'lossOfUse', 'personalProperty', 'personalLiability', 'medicalPayments'];
                    const rows = [
                        ['Coverage', ...quotes.map(q => q.carrier)],
                        ['12-Month Premium', ...quotes.map(q => '$' + (q.premium12Month || 0).toLocaleString())],
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

                exportPDF() {
                    if (!this.data?.quotes) return App.toast('No data to export');
                    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
                        return App.toast('❌ jsPDF not loaded');
                    }

                    const { jsPDF } = typeof jspdf !== 'undefined' ? jspdf : { jsPDF: window.jsPDF };
                    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                    const quotes = [...this.data.quotes].sort((a, b) => (a.premium12Month || 0) - (b.premium12Month || 0));
                    const applicant = this.data.applicant || {};
                    const pageW = doc.internal.pageSize.getWidth();

                    // Title
                    doc.setFontSize(18);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Quote Comparison Summary', 14, 18);
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`${applicant.name || 'N/A'} | ${applicant.policyType || 'HO3'} | Eff: ${applicant.effectiveDate || 'N/A'}`, 14, 25);
                    doc.text(`Generated by Altech Insurance Tools — ${new Date().toLocaleDateString()}`, 14, 30);

                    // Premium comparison
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Premium Comparison', 14, 40);

                    const premHeaders = ['Carrier', 'Annual Premium', 'Monthly Est.', 'Discounts'];
                    const premRows = quotes.map(q => [
                        q.carrier || 'Unknown',
                        '$' + (q.premium12Month || 0).toLocaleString(),
                        '~$' + (q.premium12Month ? (q.premium12Month / 12).toFixed(0) : '—'),
                        q.totalSavings || (q.discounts?.length ? q.discounts.length + ' applied' : 'None')
                    ]);

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

                    // Build conversation for Gemini
                    this.chatHistory.push({ role: 'user', parts: [{ text: userMsg }] });

                    try {
                        const apiKey = await this.getApiKey();
                        if (!apiKey) throw new Error('No API key');

                        const quoteContext = this.buildQuoteContext();
                        const systemInstruction = this.SYSTEM_PROMPT + '\n\nHere is the full quote data you\'re discussing:\n\n' + quoteContext;

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
                        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response.';

                        // Save to history
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
