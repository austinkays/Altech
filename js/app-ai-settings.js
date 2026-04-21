// js/app-ai-settings.js — AI provider / model / API key settings UI for App.
// Extracted from app-core.js during Phase 3 monolith decomposition (2026-04).
'use strict';

Object.assign(App, {
    // ── AI Settings Management ───────────────────────────────────

    /** Load saved AI settings into the settings UI */
    loadAISettings() {
        if (typeof AIProvider === 'undefined') return;
        const s = AIProvider.getSettings();
        const providerSel = document.getElementById('aiProviderSelect');
        const modelSel = document.getElementById('aiModelSelect');
        const keyInput = document.getElementById('aiApiKeyInput');
        if (providerSel) providerSel.value = s.provider || 'google';
        this._populateAIModels(s.provider || 'google');
        if (modelSel) modelSel.value = s.model || AIProvider.PROVIDERS[s.provider || 'google'].defaultModel;
        if (keyInput) keyInput.value = s.apiKey || '';
        this._updateAIProviderHint(s.provider || 'google');
    },

    /** Called when provider dropdown changes */
    onAIProviderChange() {
        const provider = document.getElementById('aiProviderSelect')?.value || 'google';
        this._populateAIModels(provider);
        this._updateAIProviderHint(provider);
        // Update key placeholder
        const keyInput = document.getElementById('aiApiKeyInput');
        const keyLink = document.getElementById('aiKeyLink');
        if (typeof AIProvider !== 'undefined') {
            const p = AIProvider.PROVIDERS[provider];
            if (keyInput) keyInput.placeholder = p?.keyPlaceholder || '';
            if (keyLink) {
                keyLink.href = p?.keyUrl || '#';
                keyLink.textContent = '(get key)';
            }
        }
    },

    /** Called when model dropdown changes */
    onAIModelChange() {
        const provider = document.getElementById('aiProviderSelect')?.value || 'google';
        this._updateModelInfo(provider);
    },

    /** Populate model dropdown based on selected provider */
    _populateAIModels(provider) {
        const sel = document.getElementById('aiModelSelect');
        if (!sel || typeof AIProvider === 'undefined') return;
        const models = AIProvider.PROVIDERS[provider]?.models || [];
        sel.innerHTML = models.map(m => {
            const cost = (m.costIn != null && m.costOut != null)
                ? ` [$${m.costIn}/$${m.costOut}/M]`
                : '';
            return `<option value="${m.id}">${m.label}${cost} — ${m.desc}</option>`;
        }).join('');
        this._updateModelInfo(provider);
    },

    /** Toggle the cost estimates panel */
    toggleCostEstimates() {
        const panel = document.getElementById('aiCostEstimates');
        const btn = document.getElementById('aiCostToggle');
        if (!panel) return;
        const show = panel.style.display === 'none';
        panel.style.display = show ? 'block' : 'none';
        if (btn) btn.textContent = show ? '▲ Hide cost per tool' : '▼ Show cost per tool';
    },

    // Token usage estimates per tool (inputTokens, outputTokens, hasImages, imageCount)
    _toolTokenEstimates: [
        { tool: 'Policy Scan (photo)',   icon: '📸', inputBase: 2500,  outputAvg: 2000, images: 2,  note: '1–10 page dec page scan' },
        { tool: 'Policy Scan (text)',    icon: '📄', inputBase: 10000, outputAvg: 2000, images: 0,  note: 'Desktop text import' },
        { tool: 'Policy Q&A (1 question)', icon: '💬', inputBase: 15000, outputAvg: 1000, images: 0, note: 'Varies with policy length' },
        { tool: 'GIS Property Extract',  icon: '🏠', inputBase: 1300,  outputAvg: 1000, images: 1,  note: 'County assessor screenshot' },
        { tool: 'Driver License Scan',   icon: '🪪', inputBase: 300,   outputAvg: 300,  images: 1,  note: 'Single DL photo' },
        { tool: 'Property Image Analysis',icon: '📷', inputBase: 800,   outputAvg: 400,  images: 1,  note: 'Roof/exterior photo' },
        { tool: 'Aerial Hazard Check',   icon: '🛰️', inputBase: 600,   outputAvg: 600,  images: 1,  note: 'Satellite imagery' },
        { tool: 'PDF Document Analysis', icon: '📋', inputBase: 800,   outputAvg: 600,  images: 1,  note: 'Tax/deed PDF page' },
        { tool: 'Prospect AI Dossier',   icon: '🔍', inputBase: 3500,  outputAvg: 6000, images: 0,  note: 'Full risk analysis' },
        { tool: 'Full Quote Intake',     icon: '⚡', inputBase: 18100, outputAvg: 6700, images: 5,  note: 'Scan + DL + property + Q&A' }
    ],

    /** Build cost estimate table for the selected model */
    _updateCostEstimates(model) {
        const table = document.getElementById('aiCostTable');
        if (!table) return;
        if (!model || model.costIn == null || model.costOut == null) {
            table.innerHTML = '<tr><td style="color:var(--text-secondary)">Select a model to see cost estimates</td></tr>';
            return;
        }
        const imgTokens = 1500; // avg tokens per image
        const fmt = (cents) => {
            if (cents < 0.01) return '<$0.01';
            if (cents < 1) return '$' + cents.toFixed(3);
            return '$' + cents.toFixed(2);
        };
        let html = '<tr style="border-bottom:1px solid var(--border,#BEC5D4)">' +
            '<td style="padding:3px 0;font-weight:600;color:var(--text)">Tool</td>' +
            '<td style="padding:3px 4px;font-weight:600;color:var(--text);text-align:right">Est. Cost</td>' +
            '<td style="padding:3px 0;font-weight:600;color:var(--text);text-align:right">Tokens</td></tr>';

        this._toolTokenEstimates.forEach(t => {
            const totalIn = t.inputBase + (t.images * imgTokens);
            const totalOut = t.outputAvg;
            const costIn = (totalIn / 1_000_000) * model.costIn;
            const costOut = (totalOut / 1_000_000) * model.costOut;
            const total = costIn + costOut;
            const totalTokens = totalIn + totalOut;
            const tokenStr = totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + 'K' : totalTokens;
            const isLast = t.tool === 'Full Quote Intake';
            const rowStyle = isLast ? 'border-top:1px solid var(--border,#BEC5D4);font-weight:600' : '';
            html += `<tr style="${rowStyle}">` +
                `<td style="padding:2px 0;color:var(--text)">${t.icon} ${t.tool}</td>` +
                `<td style="padding:2px 4px;text-align:right;color:var(--apple-blue);font-weight:600;white-space:nowrap">${fmt(total)}</td>` +
                `<td style="padding:2px 0;text-align:right;color:var(--text-secondary);white-space:nowrap">~${tokenStr}</td></tr>`;
        });

        table.innerHTML = html;
    },

    /** Show model details card for selected model */
    _updateModelInfo(provider) {
        const panel = document.getElementById('aiModelInfo');
        if (!panel || typeof AIProvider === 'undefined') return;
        const modelId = document.getElementById('aiModelSelect')?.value;
        const models = AIProvider.PROVIDERS[provider]?.models || [];
        const m = models.find(x => x.id === modelId);
        if (!m) { panel.style.display = 'none'; return; }

        panel.style.display = 'block';
        const nameEl = document.getElementById('aiModelInfoName');
        const costEl = document.getElementById('aiModelInfoCost');
        const ctxEl = document.getElementById('aiModelInfoContext');
        const tagsEl = document.getElementById('aiModelInfoTags');

        if (nameEl) nameEl.textContent = m.label;
        if (costEl) {
            costEl.textContent = (m.costIn != null && m.costOut != null)
                ? `$${m.costIn} in / $${m.costOut} out per M tokens`
                : 'Pricing varies';
        }
        if (ctxEl) ctxEl.textContent = m.context ? `Context: ${m.context} tokens` : '';

        if (tagsEl) {
            const TAG_LABELS = (typeof AIProvider !== 'undefined' && AIProvider.TAG_LABELS) ? AIProvider.TAG_LABELS : {};
            tagsEl.innerHTML = (m.tags || []).map(t => {
                const lbl = TAG_LABELS[t] || t;
                return `<span style="display:inline-block;padding:2px 7px;border-radius:6px;background:var(--bg-card,#fff);border:1px solid var(--border,#BEC5D4);font-size:10px;color:var(--text-secondary);white-space:nowrap">${lbl}</span>`;
            }).join('');
        }

        // Update cost estimates table
        this._updateCostEstimates(m);

        // Show/reset the toggle button
        const toggle = document.getElementById('aiCostToggle');
        if (toggle) toggle.style.display = 'block';
    },

    /** Update the hint text below settings */
    _updateAIProviderHint(provider) {
        const hint = document.getElementById('aiProviderHint');
        if (!hint) return;
        const hints = {
            google: 'Gemini 2.5 Flash is used by default. Free tier available at aistudio.google.com.',
            openrouter: 'OpenRouter gives you access to 100+ models with one API key — including Claude Opus, GPT-4o, Llama, and more. Pay per token at openrouter.ai.',
            openai: 'Use your OpenAI API key for GPT-4o and o3-mini. Requires an OpenAI account with billing enabled.',
            anthropic: 'Claude models from Anthropic. Requires a CORS proxy (routed through /api/anthropic-proxy). Best-in-class for document analysis.'
        };
        hint.textContent = hints[provider] || '';
    },

    /** Save agency name from the account settings field */
    saveAgencyName(name) {
        const trimmed = (name || '').trim();
        try {
            const existing = Utils.tryParseLS(STORAGE_KEYS.AGENCY_PROFILE, {});
            existing.agencyName = trimmed || 'Altech Insurance Agency';
            localStorage.setItem(STORAGE_KEYS.AGENCY_PROFILE, JSON.stringify(existing));
            if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) CloudSync.schedulePush();
            this.toast('\u2705 Agency name saved');
        } catch (e) {
            this.toast('Could not save agency name', { type: 'error' });
        }
    },

    /** Save AI settings from the form */
    saveAISettings() {
        if (typeof AIProvider === 'undefined') return;
        const provider = document.getElementById('aiProviderSelect')?.value || 'google';
        const model = document.getElementById('aiModelSelect')?.value || '';
        const apiKey = document.getElementById('aiApiKeyInput')?.value?.trim() || '';
        AIProvider.saveSettings({ provider, model, apiKey });
        // Reset cached key so _getGeminiKey re-resolves
        this._geminiApiKey = null;
        this.toast('\u2705 Settings saved — ' + (AIProvider.PROVIDERS[provider]?.name || provider));
    },

    /** Toggle visibility of the API key field */
    toggleAIKeyVisibility() {
        const input = document.getElementById('aiApiKeyInput');
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
    },

    /** Test connection to the configured AI provider */
    async testAIConnection() {
        if (typeof AIProvider === 'undefined') return;
        const btn = document.getElementById('aiTestBtn');
        const result = document.getElementById('aiTestResult');
        if (btn) { btn.disabled = true; btn.textContent = 'Testing...'; }
        // Temporarily save current form values for the test
        const provider = document.getElementById('aiProviderSelect')?.value || 'google';
        const model = document.getElementById('aiModelSelect')?.value || '';
        const apiKey = document.getElementById('aiApiKeyInput')?.value?.trim() || '';
        const prev = AIProvider.getSettings();
        AIProvider.saveSettings({ provider, model, apiKey });

        const test = await AIProvider.testConnection();

        if (result) {
            result.style.display = 'block';
            if (test.success) {
                result.style.background = 'rgba(52,199,89,0.1)';
                result.style.color = 'var(--success, #34C759)';
                result.textContent = '\u2705 Connected! Response: ' + (test.text || 'OK').slice(0, 50);
            } else {
                result.style.background = 'rgba(255,59,48,0.1)';
                result.style.color = 'var(--danger, #FF3B30)';
                result.textContent = '\u274C ' + (test.error || 'Connection failed');
                // Restore previous settings on failure
                AIProvider.saveSettings(prev);
            }
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Test Connection'; }
    }
});
