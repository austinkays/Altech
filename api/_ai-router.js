/**
 * Server-Side AI Provider Router
 * 
 * Mirrors the client-side AIProvider but runs in Vercel serverless functions.
 * Accepts user AI settings from request body to route through their chosen provider.
 * Falls back to process.env.GOOGLE_API_KEY + Gemini when no user settings are provided.
 * 
 * Supports: Google Gemini, OpenRouter, OpenAI, Anthropic
 * Supports: Text calls, Vision/multimodal calls, Google Search grounding (Google-only)
 * 
 * Usage:
 *   import { createRouter } from './_ai-router.js';
 *   const ai = createRouter(req.body.aiSettings);
 *   const text = await ai.ask(systemPrompt, userMessage, { temperature: 0.2 });
 *   const text = await ai.askVision(systemPrompt, images, { temperature: 0.2 });
 */

// ── Constants ────────────────────────────────────────────────────

const DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// ── Robust JSON Extraction (server-side port of client extractJSON) ──

/**
 * Extract and parse JSON from an AI response string.
 * Handles: clean JSON, markdown-fenced JSON, nested objects, trailing commas.
 * @param {string} text - Raw AI response text
 * @returns {Object|Array|null} Parsed JSON or null
 */
export function extractJSON(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();

    // 1. Direct parse
    try { return JSON.parse(trimmed); } catch (_) {}

    // 2. Strip markdown code fences
    const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenced) {
        try { return JSON.parse(fenced[1].trim()); } catch (_) {}
    }

    // 3. Find outermost JSON object or array via depth-tracking
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    let start, open, close;

    if (firstBrace === -1 && firstBracket === -1) return null;
    if (firstBracket === -1 || (firstBrace !== -1 && firstBrace < firstBracket)) {
        start = firstBrace; open = '{'; close = '}';
    } else {
        start = firstBracket; open = '['; close = ']';
    }

    let depth = 0, inString = false, escape = false, end = -1;
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

    // 4. Fix trailing commas
    const cleaned = candidate.replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(cleaned); } catch (_) {}

    return null;
}

// ── Image Format Converters ──────────────────────────────────────

/**
 * Convert image data to Google Gemini inline_data format
 * @param {Object} img - { base64Data, mimeType }
 * @returns {Object} Gemini-format part
 */
function toGeminiImage(img) {
    return {
        inline_data: {
            mime_type: img.mimeType || 'image/jpeg',
            data: img.base64Data
        }
    };
}

/**
 * Convert image data to OpenAI/OpenRouter image_url format
 * @param {Object} img - { base64Data, mimeType }
 * @returns {Object} OpenAI-format content part
 */
function toOpenAIImage(img) {
    const mime = img.mimeType || 'image/jpeg';
    return {
        type: 'image_url',
        image_url: {
            url: `data:${mime};base64,${img.base64Data}`,
            detail: 'high'
        }
    };
}

/**
 * Convert image data to Anthropic format
 * @param {Object} img - { base64Data, mimeType }
 * @returns {Object} Anthropic-format content part
 */
function toAnthropicImage(img) {
    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: img.mimeType || 'image/jpeg',
            data: img.base64Data
        }
    };
}

// ── Provider Call Functions ───────────────────────────────────────

async function callGoogle(apiKey, model, systemPrompt, userMessage, opts = {}) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
            temperature: opts.temperature ?? 0.2,
            maxOutputTokens: opts.maxTokens ?? 4096
        }
    };

    if (systemPrompt) {
        body.systemInstruction = { role: 'system', parts: [{ text: systemPrompt }] };
    }

    if (opts.responseFormat === 'json') {
        body.generationConfig.response_mime_type = 'application/json';
        if (opts.schema) body.generationConfig.response_schema = opts.schema;
    }

    // Google Search grounding (Google-only feature)
    if (opts.googleSearch) {
        body.tools = [{ google_search: {} }];
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

    // Google Search grounding returns multiple parts
    if (opts.googleSearch) {
        const allParts = data?.candidates?.[0]?.content?.parts || [];
        const text = allParts.map(p => p.text || '').filter(Boolean).join('');
        return { text, raw: data, groundingMetadata: data?.candidates?.[0]?.groundingMetadata };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { text, raw: data };
}

async function callGoogleVision(apiKey, model, systemPrompt, images, textPrompt, opts = {}) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

    const parts = images.map(toGeminiImage);
    parts.push({ text: textPrompt });

    const body = {
        contents: [{ parts }],
        generationConfig: {
            temperature: opts.temperature ?? 0.2,
            maxOutputTokens: opts.maxTokens ?? 4096
        }
    };

    if (systemPrompt) {
        body.systemInstruction = { role: 'system', parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Google Vision API error (${res.status})`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { text, raw: data };
}

async function callOpenRouter(apiKey, model, systemPrompt, userMessage, opts = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userMessage });

    const body = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 4096
    };

    if (opts.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
    }

    const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://altech-app.vercel.app',
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

async function callOpenRouterVision(apiKey, model, systemPrompt, images, textPrompt, opts = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    const content = images.map(toOpenAIImage);
    content.push({ type: 'text', text: textPrompt });
    messages.push({ role: 'user', content });

    const body = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 4096
    };

    const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://altech-app.vercel.app',
            'X-Title': 'Altech Insurance'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `OpenRouter Vision API error (${res.status})`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    return { text, raw: data };
}

async function callOpenAI(apiKey, model, systemPrompt, userMessage, opts = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userMessage });

    const body = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 4096
    };

    if (opts.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
    }

    const res = await fetch(OPENAI_URL, {
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

async function callOpenAIVision(apiKey, model, systemPrompt, images, textPrompt, opts = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    const content = images.map(toOpenAIImage);
    content.push({ type: 'text', text: textPrompt });
    messages.push({ role: 'user', content });

    const body = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 4096
    };

    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `OpenAI Vision API error (${res.status})`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    return { text, raw: data };
}

async function callAnthropic(apiKey, model, systemPrompt, userMessage, opts = {}) {
    const messages = [{ role: 'user', content: userMessage }];

    const body = {
        model,
        messages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.2
    };

    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
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

async function callAnthropicVision(apiKey, model, systemPrompt, images, textPrompt, opts = {}) {
    const content = images.map(toAnthropicImage);
    content.push({ type: 'text', text: textPrompt });

    const messages = [{ role: 'user', content }];

    const body = {
        model,
        messages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.2
    };

    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Anthropic Vision API error (${res.status})`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    return { text, raw: data };
}

// ── Router Factory ───────────────────────────────────────────────

/**
 * Create an AI router instance from user settings or environment defaults.
 * 
 * @param {Object} [aiSettings] - Optional user AI settings from request body
 *   { provider: 'google'|'openrouter'|'openai'|'anthropic', model: string, apiKey: string }
 * @returns {Object} Router with ask(), askVision(), askWithSearch(), provider, model
 */
export function createRouter(aiSettings) {
    // Resolve provider, model, apiKey with fallback chain
    let provider = aiSettings?.provider || 'google';
    let model = aiSettings?.model || '';
    let apiKey = aiSettings?.apiKey || '';

    // Fall back to environment Google API key
    const envKey = (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim();

    if (!apiKey) {
        provider = 'google';
        model = DEFAULT_MODEL;
        apiKey = envKey;
    }

    if (!model) {
        const defaults = {
            google: DEFAULT_MODEL,
            openrouter: 'anthropic/claude-sonnet-4',
            openai: 'gpt-4o',
            anthropic: 'claude-sonnet-4-20250514'
        };
        model = defaults[provider] || DEFAULT_MODEL;
    }

    if (!apiKey) {
        console.warn('[AI Router] No API key available (user or env)');
    }

    const isGoogle = provider === 'google';

    /**
     * Send a text prompt to the configured AI provider.
     * @param {string} systemPrompt - System instructions
     * @param {string} userMessage - User's message
     * @param {Object} opts - { temperature, maxTokens, responseFormat, googleSearch }
     * @returns {Promise<string>} Response text
     */
    async function ask(systemPrompt, userMessage, opts = {}) {
        if (!apiKey) throw new Error('No AI API key configured');

        let result;
        switch (provider) {
            case 'google':
                result = await callGoogle(apiKey, model, systemPrompt, userMessage, opts);
                break;
            case 'openrouter':
                result = await callOpenRouter(apiKey, model, systemPrompt, userMessage, opts);
                break;
            case 'openai':
                result = await callOpenAI(apiKey, model, systemPrompt, userMessage, opts);
                break;
            case 'anthropic':
                result = await callAnthropic(apiKey, model, systemPrompt, userMessage, opts);
                break;
            default:
                throw new Error(`Unknown AI provider: ${provider}`);
        }
        return result.text;
    }

    /**
     * Send a vision/multimodal prompt to the configured AI provider.
     * @param {string} systemPrompt - System instructions (or null)
     * @param {Array<{base64Data: string, mimeType: string}>} images - Array of images
     * @param {string} textPrompt - Text prompt to accompany images
     * @param {Object} opts - { temperature, maxTokens }
     * @returns {Promise<string>} Response text
     */
    async function askVision(systemPrompt, images, textPrompt, opts = {}) {
        if (!apiKey) throw new Error('No AI API key configured');
        if (!images || images.length === 0) throw new Error('No images provided');

        let result;
        switch (provider) {
            case 'google':
                result = await callGoogleVision(apiKey, model, systemPrompt, images, textPrompt, opts);
                break;
            case 'openrouter':
                result = await callOpenRouterVision(apiKey, model, systemPrompt, images, textPrompt, opts);
                break;
            case 'openai':
                result = await callOpenAIVision(apiKey, model, systemPrompt, images, textPrompt, opts);
                break;
            case 'anthropic':
                result = await callAnthropicVision(apiKey, model, systemPrompt, images, textPrompt, opts);
                break;
            default:
                throw new Error(`Unknown AI provider: ${provider}`);
        }
        return result.text;
    }

    /**
     * Send a prompt with Google Search grounding.
     * Only works with Google provider. Falls back to regular ask() for other providers.
     * Other providers can still give great analysis — they just won't have live search.
     * 
     * @param {string} systemPrompt - System instructions
     * @param {string} userMessage - User's message
     * @param {Object} opts - { temperature, maxTokens }
     * @returns {Promise<{text: string, grounded: boolean}>}
     */
    async function askWithSearch(systemPrompt, userMessage, opts = {}) {
        if (!apiKey) throw new Error('No AI API key configured');

        if (isGoogle) {
            // Google with search grounding
            const result = await callGoogle(apiKey, model, systemPrompt, userMessage, {
                ...opts,
                googleSearch: true
            });
            return {
                text: result.text,
                grounded: true,
                groundingMetadata: result.groundingMetadata
            };
        }

        // For non-Google providers, use regular ask (they may have training cutoff data)
        // OpenRouter models like Perplexity Sonar have their own search capabilities
        const text = await ask(systemPrompt, userMessage, opts);
        return { text, grounded: false };
    }

    return {
        ask,
        askVision,
        askWithSearch,
        extractJSON,
        provider,
        model,
        apiKey: !!apiKey,  // Boolean only (don't leak key to logs)
        isGoogle
    };
}

/**
 * Helper: Get environment Google API key for cases that MUST use Google
 * (e.g., Google Maps, Google Places — not AI calls)
 */
export function getEnvGoogleKey() {
    return (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim();
}
