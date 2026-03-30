/**
 * AIProvider — Unified Multi-Provider AI Abstraction Layer
 * 
 * Supports: Google Gemini (default), OpenRouter (100+ models), OpenAI, Anthropic (via proxy)
 * Storage key: altech_ai_settings → { provider, model, encryptedKey, iv }
 * API keys are AES-GCM encrypted at rest via Web Crypto API. Never stored as plaintext.
 *
 * Usage:
 *   const result = await AIProvider.ask(systemPrompt, userMessage, { temperature: 0.2 });
 *   // Returns: { text: '...', raw: {...} }
 */
window.AIProvider = (() => {
    'use strict';

    const STORAGE_KEY = STORAGE_KEYS.AI_SETTINGS;
    const SALT_KEY = STORAGE_KEYS.AI_SALT;

    // ── Crypto helpers (AES-GCM key encryption) ──────────────────

    function _buf2b64(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }
    function _b642buf(b64) {
        return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    }
    function _getSalt() {
        let s = localStorage.getItem(SALT_KEY);
        if (!s) {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            s = _buf2b64(salt);
            localStorage.setItem(SALT_KEY, s);
        }
        return _b642buf(s);
    }
    async function _deriveKey(salt) {
        const km = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode('altech-insurance-app-v1'),
            { name: 'PBKDF2' }, false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
            km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
    }
    async function _encryptKey(plaintext) {
        if (!plaintext) return { encryptedKey: '', iv: '' };
        const salt = _getSalt();
        const key = await _deriveKey(salt);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
        return { encryptedKey: _buf2b64(ct), iv: _buf2b64(iv) };
    }
    async function _decryptKey(encryptedKey, iv) {
        if (!encryptedKey || !iv) return '';
        try {
            const key = await _deriveKey(_getSalt());
            const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _b642buf(iv) }, key, _b642buf(encryptedKey));
            return new TextDecoder().decode(pt);
        } catch (_) { return ''; }
    }

    // ── Provider Registry ────────────────────────────────────────

    // Model field schema:
    //   id       — API identifier
    //   label    — Display name
    //   desc     — One-line description
    //   costIn   — $/M input tokens  (null = free or variable)
    //   costOut  — $/M output tokens (null = free or variable)
    //   context  — Context window size (string, e.g. '1M', '128K')
    //   tags     — Array of strength tags for comparison
    //              Possible: coding, reasoning, speed, value, agents, vision,
    //                        multilingual, long-context, open-source, search

    const PROVIDERS = {
        google: {
            name: 'Google Gemini',
            defaultModel: 'gemini-2.5-flash',
            models: [
                { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Fast thinking model with built-in reasoning', costIn: 0.15, costOut: 0.60, context: '1M', tags: ['speed', 'value', 'reasoning', 'vision'] },
                { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'State-of-the-art reasoning & coding', costIn: 1.25, costOut: 10, context: '1M', tags: ['reasoning', 'coding', 'long-context', 'vision'] },
                { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Previous generation — still very capable', costIn: 0.10, costOut: 0.40, context: '1M', tags: ['speed', 'value', 'vision'] }
            ],
            keyUrl: 'https://aistudio.google.com/apikey',
            keyPlaceholder: 'AIza...',
            needsProxy: false
        },
        openrouter: {
            name: 'OpenRouter',
            defaultModel: 'anthropic/claude-sonnet-4',
            models: [
                // ── Anthropic ──
                { id: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6', desc: 'Strongest coding & long-running professional tasks', costIn: 5, costOut: 25, context: '1M', tags: ['coding', 'reasoning', 'agents', 'long-context'] },
                { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', desc: 'Most capable Sonnet — frontier coding & agents', costIn: 3, costOut: 15, context: '1M', tags: ['coding', 'agents', 'speed', 'reasoning'] },
                { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', desc: 'Advanced agents, speculative execution', costIn: 3, costOut: 15, context: '1M', tags: ['coding', 'agents', 'reasoning'] },
                { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', desc: 'Balanced speed & intelligence — great all-rounder', costIn: 3, costOut: 15, context: '1M', tags: ['coding', 'reasoning', 'agents'] },
                { id: 'anthropic/claude-opus-4', label: 'Claude Opus 4', desc: 'SWE-bench leader — sustained agentic workflows', costIn: 5, costOut: 25, context: '1M', tags: ['coding', 'reasoning', 'agents', 'long-context'] },
                { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', desc: 'Legacy — still fast & highly capable', costIn: 3, costOut: 15, context: '200K', tags: ['coding', 'speed', 'vision'] },
                { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', desc: 'Fastest Claude — simple tasks & chat', costIn: 0.80, costOut: 4, context: '200K', tags: ['speed', 'value'] },

                // ── OpenAI ──
                { id: 'openai/gpt-4.1', label: 'GPT-4.1', desc: 'Flagship — strong coding & 1M context', costIn: 2, costOut: 8, context: '1M', tags: ['coding', 'long-context', 'reasoning'] },
                { id: 'openai/gpt-4o', label: 'GPT-4o', desc: 'Multimodal flagship — text, images, audio', costIn: 2.50, costOut: 10, context: '128K', tags: ['vision', 'multilingual', 'coding'] },
                { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', desc: 'GPT-4o level at lower cost & latency', costIn: 0.40, costOut: 1.60, context: '1M', tags: ['speed', 'value', 'coding'] },
                { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast & cheap — great for high-volume', costIn: 0.15, costOut: 0.60, context: '128K', tags: ['speed', 'value'] },
                { id: 'openai/o3-mini', label: 'o3-mini', desc: 'STEM reasoning with adjustable depth', costIn: 1.10, costOut: 4.40, context: '200K', tags: ['reasoning', 'coding'] },
                { id: 'openai/o4-mini', label: 'o4-mini', desc: 'Compact reasoning — AIME 99.5%, tool use', costIn: 1.10, costOut: 4.40, context: '200K', tags: ['reasoning', 'coding', 'agents'] },

                // ── Google via OpenRouter ──
                { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', desc: 'Google frontier — enhanced SWE & agentic', costIn: 2, costOut: 12, context: '1M', tags: ['coding', 'reasoning', 'agents', 'vision'] },
                { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', desc: 'Near-Pro quality at Flash speed & price', costIn: 0.50, costOut: 3, context: '1M', tags: ['speed', 'value', 'reasoning', 'vision'] },
                { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: '#1 LMArena — deep reasoning & thinking', costIn: 1.25, costOut: 10, context: '1M', tags: ['reasoning', 'coding', 'long-context', 'vision'] },
                { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Best value for thinking models', costIn: 0.15, costOut: 0.60, context: '1M', tags: ['speed', 'value', 'reasoning'] },

                // ── xAI ──
                { id: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast', desc: '#1 Trivia, #1 SEO — massive 2M context', costIn: 0.20, costOut: 0.50, context: '2M', tags: ['speed', 'value', 'long-context', 'agents'] },

                // ── MiniMax ──
                { id: 'minimax/minimax-m2.5', label: 'MiniMax M2.5', desc: '#1 Programming, #1 Technology on OpenRouter', costIn: 0.30, costOut: 1.10, context: '197K', tags: ['coding', 'value', 'agents'] },

                // ── Moonshot ──
                { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5', desc: '#2 Programming — visual coding & agent swarm', costIn: 0.45, costOut: 2.20, context: '262K', tags: ['coding', 'vision', 'agents', 'value'] },

                // ── Z.ai ──
                { id: 'z-ai/glm-5', label: 'GLM 5', desc: '#3 Programming — full-system construction', costIn: 0.95, costOut: 2.55, context: '205K', tags: ['coding', 'agents', 'open-source'] },

                // ── DeepSeek ──
                { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', desc: 'GPT-5 class reasoning — IMO gold medal', costIn: 0.26, costOut: 0.38, context: '164K', tags: ['reasoning', 'value', 'coding', 'open-source'] },
                { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', desc: 'Open-source o1-class reasoning', costIn: 0.70, costOut: 2.50, context: '64K', tags: ['reasoning', 'open-source', 'value'] },
                { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', desc: 'Fast general-purpose chat', costIn: 0.14, costOut: 0.28, context: '128K', tags: ['speed', 'value', 'open-source'] },

                // ── Meta Llama ──
                { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', desc: '400B MoE — latest from Meta', costIn: 0.20, costOut: 0.60, context: '1M', tags: ['open-source', 'value', 'long-context'] },
                { id: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout', desc: 'Efficient Llama 4 — 10M context window', costIn: 0.10, costOut: 0.30, context: '10M', tags: ['open-source', 'value', 'long-context', 'speed'] },
                { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', desc: 'Strong open-source model', costIn: 0.10, costOut: 0.20, context: '128K', tags: ['open-source', 'value', 'speed'] },

                // ── Mistral ──
                { id: 'mistralai/mistral-large', label: 'Mistral Large', desc: 'Mistral flagship — 128K context', costIn: 2, costOut: 6, context: '128K', tags: ['reasoning', 'multilingual', 'coding'] },
                { id: 'mistralai/codestral', label: 'Codestral', desc: 'Code-specialized Mistral model', costIn: 0.30, costOut: 0.90, context: '256K', tags: ['coding', 'value'] },
                { id: 'mistralai/mistral-small', label: 'Mistral Small', desc: 'Efficient & affordable', costIn: 0.10, costOut: 0.30, context: '32K', tags: ['speed', 'value'] },

                // ── Qwen ──
                { id: 'qwen/qwen3.5-397b-a17b', label: 'Qwen 3.5 397B', desc: 'Hybrid linear-attention — state-of-the-art', costIn: 0.55, costOut: 3.50, context: '262K', tags: ['reasoning', 'multilingual', 'vision', 'value'] },
                { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B', desc: 'Strong multilingual model', costIn: 0.20, costOut: 0.60, context: '128K', tags: ['multilingual', 'value', 'open-source'] },

                // ── Cohere ──
                { id: 'cohere/command-r-plus', label: 'Command R+', desc: 'RAG-optimized with citation grounding', costIn: 2.50, costOut: 10, context: '128K', tags: ['reasoning', 'search'] },

                // ── Perplexity ──
                { id: 'perplexity/sonar-pro', label: 'Sonar Pro', desc: 'Search-augmented generation with sources', costIn: 3, costOut: 15, context: '200K', tags: ['search', 'reasoning'] }
            ],
            keyUrl: 'https://openrouter.ai/keys',
            keyPlaceholder: 'sk-or-...',
            needsProxy: false
        },
        openai: {
            name: 'OpenAI',
            defaultModel: 'gpt-4o',
            models: [
                { id: 'gpt-4o', label: 'GPT-4o', desc: 'Multimodal flagship — text, images, audio', costIn: 2.50, costOut: 10, context: '128K', tags: ['vision', 'multilingual', 'coding'] },
                { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast & affordable', costIn: 0.15, costOut: 0.60, context: '128K', tags: ['speed', 'value'] },
                { id: 'o3-mini', label: 'o3-mini', desc: 'STEM reasoning with adjustable depth', costIn: 1.10, costOut: 4.40, context: '200K', tags: ['reasoning', 'coding'] }
            ],
            keyUrl: 'https://platform.openai.com/api-keys',
            keyPlaceholder: 'sk-...',
            needsProxy: false
        },
        anthropic: {
            name: 'Anthropic',
            defaultModel: 'claude-sonnet-4-20250514',
            models: [
                { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', desc: 'Balanced speed & intelligence', costIn: 3, costOut: 15, context: '1M', tags: ['coding', 'reasoning', 'agents'] },
                { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', desc: 'Most capable — sustained agentic workflows', costIn: 5, costOut: 25, context: '1M', tags: ['coding', 'reasoning', 'agents', 'long-context'] },
                { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', desc: 'Fast & highly capable', costIn: 3, costOut: 15, context: '200K', tags: ['coding', 'speed', 'vision'] }
            ],
            keyUrl: 'https://console.anthropic.com/settings/keys',
            keyPlaceholder: 'sk-ant-...',
            needsProxy: true  // Anthropic requires server-side proxy for CORS
        }
    };

    // ── Tag display config ───────────────────────────────────────
    const TAG_LABELS = {
        coding: '💻 Coding', reasoning: '🧠 Reasoning', speed: '⚡ Fast',
        value: '💰 Value', agents: '🤖 Agents', vision: '👁 Vision',
        multilingual: '🌐 Multilingual', 'long-context': '📄 Long Context',
        'open-source': '🔓 Open Source', search: '🔍 Search'
    };

    // ── Settings Management ──────────────────────────────────────
    // Stored format: { provider, model, encryptedKey, iv }
    // API key is AES-GCM encrypted — never written as plaintext.

    function _getRawSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return { provider: 'google', model: 'gemini-2.5-flash', encryptedKey: '', iv: '' };
    }

    /** Returns { provider, model } only — use resolveApiKey() to get the decrypted key. */
    function getSettings() {
        const s = _getRawSettings();
        return { provider: s.provider, model: s.model };
    }

    /** Save settings, encrypting the API key before storage. */
    async function saveSettings(settings) {
        const { provider, model, apiKey } = settings;
        const { encryptedKey, iv } = await _encryptKey(apiKey || '');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, model, encryptedKey, iv }));
        // Remove any legacy plaintext keys
        localStorage.removeItem('gemini_api_key');
    }

    function getProvider() {
        return _getRawSettings().provider || 'google';
    }

    function getModel() {
        const s = _getRawSettings();
        return s.model || PROVIDERS[s.provider || 'google'].defaultModel;
    }

    /**
     * Async key resolution — decrypts stored key, migrates legacy plaintext keys,
     * then falls back to server-side Gemini key.
     */
    let _serverKeyCache = null;
    async function resolveApiKey() {
        const s = _getRawSettings();
        // 1. Decrypt stored encrypted key
        if (s.encryptedKey && s.iv) {
            const decrypted = await _decryptKey(s.encryptedKey, s.iv);
            if (decrypted) return decrypted;
        }
        // 2. Migrate legacy plaintext key (one-time re-encrypt)
        if (s.apiKey) {
            console.warn('[AIProvider] Migrating plaintext key to encrypted storage...');
            await saveSettings({ provider: s.provider, model: s.model, apiKey: s.apiKey });
            return s.apiKey;
        }
        // 3. Legacy gemini_api_key fallback
        const legacyKey = localStorage.getItem('gemini_api_key');
        if (legacyKey && getProvider() === 'google') return legacyKey;
        // 4. Server-side key for Google provider
        if (getProvider() === 'google') {
            if (_serverKeyCache) return _serverKeyCache;
            try {
                const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch) ? Auth.apiFetch.bind(Auth) : fetch;
                const res = await fetchFn('/api/config?type=keys');
                if (res.ok) {
                    const data = await res.json();
                    if (data.geminiKey) { _serverKeyCache = data.geminiKey; return data.geminiKey; }
                }
            } catch (_) {}
        }
        return '';
    }

    function isConfigured() {
        const s = _getRawSettings();
        return !!(s.encryptedKey || s.apiKey || localStorage.getItem('gemini_api_key'));
    }

    /**
     * Async check — true if any key is available (local or server-side).
     */
    async function isAvailable() {
        const key = await resolveApiKey();
        return !!key;
    }

    // ── Unified API Call ─────────────────────────────────────────

    /**
     * Send a prompt to the configured AI provider.
     * @param {string} systemPrompt - System instructions
     * @param {string} userMessage - User's message/question
     * @param {Object} opts - { temperature, maxTokens, responseFormat, parts }
     *   - parts: array of Gemini-style parts (for multimodal/vision). If provided, userMessage is ignored for Google.
     *   - responseFormat: 'json' to request JSON output (provider-specific)
     *   - schema: JSON schema for structured output (Google only)
     * @returns {Promise<{text: string, raw: Object}>}
     */

    const DEFAULT_TIMEOUT_MS = 45000;

    function _withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('AI request timed out')), ms);
            promise.then(
                val => { clearTimeout(timer); resolve(val); },
                err => { clearTimeout(timer); reject(err); }
            );
        });
    }

    async function ask(systemPrompt, userMessage, opts = {}) {
        const provider = getProvider();
        const model = getModel();
        const apiKey = await resolveApiKey();

        if (!apiKey) {
            throw new Error('No API key configured. Open your account settings to add one.');
        }

        const temperature = opts.temperature ?? 0.2;
        const maxTokens = opts.maxTokens ?? 4096;
        const timeoutMs = opts.timeout ?? DEFAULT_TIMEOUT_MS;

        let result;
        switch (provider) {
            case 'google':
                result = _callGoogle(apiKey, model, systemPrompt, userMessage, { temperature, maxTokens, ...opts });
                break;
            case 'openrouter':
                result = _callOpenRouter(apiKey, model, systemPrompt, userMessage, { temperature, maxTokens, ...opts });
                break;
            case 'openai':
                result = _callOpenAI(apiKey, model, systemPrompt, userMessage, { temperature, maxTokens, ...opts });
                break;
            case 'anthropic':
                result = _callAnthropic(apiKey, model, systemPrompt, userMessage, { temperature, maxTokens, ...opts });
                break;
            default:
                throw new Error(`Unknown AI provider: ${provider}`);
        }
        return _withTimeout(result, timeoutMs);
    }

    // ── Google Gemini ────────────────────────────────────────────

    async function _callGoogle(apiKey, model, systemPrompt, userMessage, opts) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const body = {
            contents: [{ role: 'user', parts: opts.parts || [{ text: userMessage }] }],
            generationConfig: {
                temperature: opts.temperature,
                maxOutputTokens: opts.maxTokens
            }
        };

        // Add system instruction if provided
        if (systemPrompt) {
            body.systemInstruction = { role: 'system', parts: [{ text: systemPrompt }] };
        }

        // Structured JSON output
        if (opts.responseFormat === 'json') {
            body.generationConfig.response_mime_type = 'application/json';
            if (opts.schema) body.generationConfig.response_schema = opts.schema;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Google API error (${res.status})`);
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return { text, raw: data };
    }

    // ── Multimodal Format Converters ─────────────────────────────

    /**
     * Convert Gemini-style parts to OpenAI/OpenRouter multimodal content array.
     * Supports image/* types as image_url; non-image types (PDFs) are skipped.
     */
    function _convertPartsToOpenAI(parts, userMessage) {
        const content = [];
        for (const part of parts) {
            if (part.inlineData) {
                const mime = part.inlineData.mimeType;
                if (mime.startsWith('image/')) {
                    content.push({
                        type: 'image_url',
                        image_url: { url: `data:${mime};base64,${part.inlineData.data}` }
                    });
                }
            } else if (part.text) {
                content.push({ type: 'text', text: part.text });
            }
        }
        if (userMessage && !parts.some(p => p.text === userMessage)) {
            content.push({ type: 'text', text: userMessage });
        }
        return content;
    }

    /**
     * Convert Gemini-style parts to Anthropic multimodal content array.
     * Supports image/* types as image blocks; non-image types are skipped.
     */
    function _convertPartsToAnthropic(parts, userMessage) {
        const content = [];
        for (const part of parts) {
            if (part.inlineData) {
                const mime = part.inlineData.mimeType;
                if (mime.startsWith('image/')) {
                    content.push({
                        type: 'image',
                        source: { type: 'base64', media_type: mime, data: part.inlineData.data }
                    });
                }
            } else if (part.text) {
                content.push({ type: 'text', text: part.text });
            }
        }
        if (userMessage && !parts.some(p => p.text === userMessage)) {
            content.push({ type: 'text', text: userMessage });
        }
        return content;
    }

    // ── OpenRouter (OpenAI-compatible) ───────────────────────────

    async function _callOpenRouter(apiKey, model, systemPrompt, userMessage, opts) {
        const url = 'https://openrouter.ai/api/v1/chat/completions';

        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        // Support multimodal: if opts.parts contains images, convert to OpenAI vision format
        const hasImages = opts.parts?.some(p => p.inlineData?.mimeType?.startsWith('image/'));
        if (hasImages) {
            messages.push({ role: 'user', content: _convertPartsToOpenAI(opts.parts, userMessage) });
        } else {
            messages.push({ role: 'user', content: userMessage });
        }

        const body = {
            model,
            messages,
            temperature: opts.temperature,
            max_tokens: opts.maxTokens
        };

        if (opts.responseFormat === 'json') {
            body.response_format = { type: 'json_object' };
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Altech Insurance'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `OpenRouter API error (${res.status})`);
        }

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        return { text, raw: data };
    }

    // ── OpenAI ───────────────────────────────────────────────────

    async function _callOpenAI(apiKey, model, systemPrompt, userMessage, opts) {
        const url = 'https://api.openai.com/v1/chat/completions';

        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        // Support multimodal: if opts.parts contains images, convert to OpenAI vision format
        const hasImages = opts.parts?.some(p => p.inlineData?.mimeType?.startsWith('image/'));
        if (hasImages) {
            messages.push({ role: 'user', content: _convertPartsToOpenAI(opts.parts, userMessage) });
        } else {
            messages.push({ role: 'user', content: userMessage });
        }

        const body = {
            model,
            messages,
            temperature: opts.temperature,
            max_tokens: opts.maxTokens
        };

        if (opts.responseFormat === 'json') {
            body.response_format = { type: 'json_object' };
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `OpenAI API error (${res.status})`);
        }

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        return { text, raw: data };
    }

    // ── Anthropic (via server proxy for CORS) ────────────────────

    async function _callAnthropic(apiKey, model, systemPrompt, userMessage, opts) {
        // Anthropic doesn't allow browser-direct calls (no CORS).
        // Route through our Vercel serverless proxy.
        const url = '/api/anthropic-proxy';

        // Support multimodal: if opts.parts contains images, convert to Anthropic vision format
        const hasImages = opts.parts?.some(p => p.inlineData?.mimeType?.startsWith('image/'));
        const messages = hasImages
            ? [{ role: 'user', content: _convertPartsToAnthropic(opts.parts, userMessage) }]
            : [{ role: 'user', content: userMessage }];

        const body = {
            model,
            system: systemPrompt || '',
            messages,
            max_tokens: opts.maxTokens,
            temperature: opts.temperature,
            apiKey  // Proxy uses this to authenticate with Anthropic
        };

        const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch) ? Auth.apiFetch.bind(Auth) : fetch;
        const res = await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Anthropic API error (${res.status})`);
        }

        const data = await res.json();
        const text = data?.content?.[0]?.text || '';
        return { text, raw: data };
    }

    // ── Connection Test ──────────────────────────────────────────

    async function testConnection() {
        try {
            const result = await ask(
                'You are a helpful assistant.',
                'Say "OK" and nothing else.',
                { temperature: 0, maxTokens: 10 }
            );
            return { success: true, text: result.text.trim() };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ── Robust JSON Extraction ───────────────────────────────────

    /**
     * Extract and parse JSON from an AI response string.
     * Handles: clean JSON, markdown-fenced JSON, nested objects, trailing commas.
     * @param {string} text - Raw AI response text
     * @returns {Object|Array|null} Parsed JSON or null
     */
    function extractJSON(text) {
        if (!text) return null;
        const trimmed = text.trim();

        // 1. Direct parse (cleanest path)
        try { return JSON.parse(trimmed); } catch (_) {}

        // 2. Strip markdown code fences: ```json ... ``` or ``` ... ```
        const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
        if (fenced) {
            try { return JSON.parse(fenced[1].trim()); } catch (_) {}
        }

        // 3. Find outermost JSON object or array (handles nested)
        const firstBrace = trimmed.indexOf('{');
        const firstBracket = trimmed.indexOf('[');
        let start, open, close;

        if (firstBrace === -1 && firstBracket === -1) return null;
        if (firstBracket === -1 || (firstBrace !== -1 && firstBrace < firstBracket)) {
            start = firstBrace; open = '{'; close = '}';
        } else {
            start = firstBracket; open = '['; close = ']';
        }

        let depth = 0;
        let inString = false;
        let escape = false;
        let end = -1;

        for (let i = start; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === open) depth++;
            if (ch === close) { depth--; if (depth === 0) { end = i; break; } }
        }

        if (end === -1) return null;
        const candidate = trimmed.slice(start, end + 1);

        try { return JSON.parse(candidate); } catch (_) {}

        // 4. Fix trailing commas before } or ] and retry
        const cleaned = candidate.replace(/,\s*([}\]])/g, '$1');
        try { return JSON.parse(cleaned); } catch (_) {}

        return null;
    }

    // ── Multi-Turn Chat ──────────────────────────────────────────

    /**
     * Send a multi-turn conversation to the configured provider.
     * @param {string} systemPrompt - System instructions
     * @param {Array<{role: string, content: string}>} messages - Conversation history
     *   Each message has `role` ('user' or 'assistant') and `content` (text).
     * @param {Object} opts - { temperature, maxTokens }
     * @returns {Promise<{text: string, raw: Object}>}
     */
    async function chat(systemPrompt, messages, opts = {}) {
        const provider = getProvider();
        const model = getModel();
        const apiKey = await resolveApiKey();

        if (!apiKey) {
            throw new Error('No API key configured. Open your account settings to add one.');
        }

        const temperature = opts.temperature ?? 0.5;
        const maxTokens = opts.maxTokens ?? 2048;
        const timeoutMs = opts.timeout ?? DEFAULT_TIMEOUT_MS;

        let result;
        switch (provider) {
            case 'google':
                result = _chatGoogle(apiKey, model, systemPrompt, messages, { temperature, maxTokens });
                break;
            case 'openrouter':
            case 'openai':
                result = _chatOpenAI(apiKey, model, systemPrompt, messages, { temperature, maxTokens }, provider);
                break;
            case 'anthropic':
                result = _chatAnthropic(apiKey, model, systemPrompt, messages, { temperature, maxTokens });
                break;
            default:
                throw new Error(`Unknown AI provider: ${provider}`);
        }
        return _withTimeout(result, timeoutMs);
    }

    async function _chatGoogle(apiKey, model, systemPrompt, messages, opts) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
        const body = {
            contents,
            generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens }
        };
        if (systemPrompt) {
            body.systemInstruction = { role: 'system', parts: [{ text: systemPrompt }] };
        }
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Google API error (${res.status})`);
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return { text, raw: data };
    }

    async function _chatOpenAI(apiKey, model, systemPrompt, messages, opts, provider) {
        const isOpenRouter = provider === 'openrouter';
        const url = isOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
        const msgs = [];
        if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
        messages.forEach(m => msgs.push({ role: m.role, content: m.content }));
        const body = { model, messages: msgs, temperature: opts.temperature, max_tokens: opts.maxTokens };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        if (isOpenRouter) { headers['HTTP-Referer'] = window.location.origin; headers['X-Title'] = 'Altech Insurance'; }
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `${provider} API error (${res.status})`);
        }
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        return { text, raw: data };
    }

    async function _chatAnthropic(apiKey, model, systemPrompt, messages, opts) {
        const url = '/api/anthropic-proxy';
        const msgs = messages.map(m => ({ role: m.role, content: m.content }));
        const body = { model, system: systemPrompt || '', messages: msgs, max_tokens: opts.maxTokens, temperature: opts.temperature, apiKey };
        const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch) ? Auth.apiFetch.bind(Auth) : fetch;
        const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Anthropic API error (${res.status})`);
        }
        const data = await res.json();
        const text = data?.content?.[0]?.text || '';
        return { text, raw: data };
    }

    // ── Public API ───────────────────────────────────────────────

    return {
        PROVIDERS,
        TAG_LABELS,
        getSettings,
        saveSettings,  // now async — always await when saving a key
        getProvider,
        getModel,
        // getApiKey removed — use resolveApiKey() (async, handles decryption)
        isConfigured,
        isAvailable,
        resolveApiKey,
        ask,
        chat,
        extractJSON,
        testConnection
    };
})();
