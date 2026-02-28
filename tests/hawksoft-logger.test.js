/**
 * HawkSoft Logger API Tests (api/hawksoft-logger.js)
 *
 * Tests:
 * - Request validation (method, required fields, length limits)
 * - AI provider detection from model name
 * - HawkSoft push logic (action codes, auth headers)
 * - Response shape
 * - Error handling
 * - System prompt content
 */

const fs = require('fs');
const path = require('path');

// ── Load handler source (strip ESM imports/exports) ──

const SOURCE_PATH = path.join(__dirname, '../api/hawksoft-logger.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// We can't evaluate the full module (ESM imports), but we can test
// the handler logic by verifying source structure + extracting testable
// pieces via string analysis and lightweight eval

// ────────────────────────────────────────────────────
// Module Syntax & Structure
// ────────────────────────────────────────────────────

describe('hawksoft-logger.js — Module Structure', () => {
  test('file exists and is non-empty', () => {
    expect(source.length).toBeGreaterThan(100);
  });

  test('uses securityMiddleware', () => {
    expect(source).toContain("import { securityMiddleware } from '../lib/security.js'");
    expect(source).toContain('export default securityMiddleware(handler)');
  });

  test('imports createRouter from _ai-router.js', () => {
    expect(source).toContain("import { createRouter } from './_ai-router.js'");
  });

  test('exports a default function', () => {
    expect(source).toContain('export default');
  });

  test('handler is an async function', () => {
    expect(source).toMatch(/async\s+function\s+handler\s*\(\s*req\s*,\s*res\s*\)/);
  });
});

// ────────────────────────────────────────────────────
// System Prompt Quality
// ────────────────────────────────────────────────────

describe('SYSTEM_PROMPT', () => {
  // Extract the SYSTEM_PROMPT constant
  const promptMatch = source.match(/const SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/);
  const prompt = promptMatch ? promptMatch[1] : '';

  test('system prompt is defined and non-empty', () => {
    expect(prompt.length).toBeGreaterThan(100);
  });

  test('identifies role as call log formatter', () => {
    expect(prompt.toLowerCase()).toContain('call log formatter');
  });

  test('includes formatting rules', () => {
    expect(prompt).toContain('RULES:');
    // Should have multiple numbered rules
    expect(prompt).toMatch(/1\./);
    expect(prompt).toMatch(/5\./);
  });

  test('specifies output FORMAT template', () => {
    expect(prompt).toContain('FORMAT:');
    expect(prompt).toContain('RE:');
    expect(prompt).toContain('Action Items:');
  });

  test('requires insurance terminology', () => {
    expect(prompt.toLowerCase()).toContain('insurance');
  });

  test('forbids markdown/code blocks in output', () => {
    expect(prompt.toLowerCase()).toContain('do not wrap in markdown');
  });

  test('requires past tense', () => {
    expect(prompt.toLowerCase()).toContain('past tense');
  });

  test('prohibits adding information', () => {
    expect(prompt.toLowerCase()).toContain('do not add information');
  });
});

// ────────────────────────────────────────────────────
// Request Validation Logic (source analysis)
// ────────────────────────────────────────────────────

describe('Request Validation', () => {
  test('rejects non-POST methods', () => {
    expect(source).toContain("req.method !== 'POST'");
    expect(source).toContain('405');
    expect(source).toContain('Method not allowed');
  });

  test('validates policyId is present and non-empty string', () => {
    expect(source).toContain('!policyId');
    expect(source).toContain("typeof policyId !== 'string'");
    expect(source).toContain('!policyId.trim()');
    expect(source).toContain('Policy ID is required');
  });

  test('validates rawNotes is present and non-empty string', () => {
    expect(source).toContain('!rawNotes');
    expect(source).toContain("typeof rawNotes !== 'string'");
    expect(source).toContain('!rawNotes.trim()');
    expect(source).toContain('Call notes are required');
  });

  test('enforces 10,000 character limit on notes', () => {
    expect(source).toContain('rawNotes.length > 10000');
    expect(source).toContain('Notes too long');
    expect(source).toContain('max 10,000');
  });

  test('returns 400 for validation errors', () => {
    // All validation paths return 400
    const validationBlocks = source.match(/res\.status\(400\)/g);
    expect(validationBlocks).not.toBeNull();
    expect(validationBlocks.length).toBeGreaterThanOrEqual(3); // policyId, rawNotes, length
  });

  test('destructures all expected body fields', () => {
    expect(source).toContain('policyId');
    expect(source).toContain('callType');
    expect(source).toContain('rawNotes');
    expect(source).toContain('userApiKey');
    expect(source).toContain('aiModel');
  });

  test('defaults callType to Inbound', () => {
    expect(source).toMatch(/callType\s*\|\|\s*'Inbound'/);
  });

  test('trims all input fields', () => {
    expect(source).toContain('policyId.trim()');
    expect(source).toContain('rawNotes.trim()');
  });
});

// ────────────────────────────────────────────────────
// AI Provider Detection
// ────────────────────────────────────────────────────

describe('AI Provider Detection', () => {
  test('detects OpenAI from gpt- prefix', () => {
    expect(source).toContain("model.startsWith('gpt-')");
    expect(source).toContain("aiSettings.provider = 'openai'");
  });

  test('detects Anthropic from claude- prefix or anthropic keyword', () => {
    expect(source).toContain("model.startsWith('claude-')");
    expect(source).toContain("model.includes('anthropic')");
    expect(source).toContain("aiSettings.provider = 'anthropic'");
  });

  test('detects OpenRouter from slash in model name', () => {
    expect(source).toContain("model.includes('/')");
    expect(source).toContain("aiSettings.provider = 'openrouter'");
  });

  test('defaults to Google provider', () => {
    expect(source).toContain("aiSettings.provider = 'google'");
  });

  test('uses createRouter with aiSettings', () => {
    expect(source).toContain('createRouter(aiSettings)');
  });

  test('passes user API key to aiSettings when provided', () => {
    expect(source).toContain('aiSettings.apiKey = userApiKey.trim()');
  });
});

// ────────────────────────────────────────────────────
// AI Call
// ────────────────────────────────────────────────────

describe('AI Formatting Call', () => {
  test('calls ai.ask() with SYSTEM_PROMPT', () => {
    expect(source).toContain('ai.ask(SYSTEM_PROMPT');
  });

  test('passes temperature and maxTokens', () => {
    expect(source).toContain('temperature: 0.3');
    expect(source).toContain('maxTokens: 1024');
  });

  test('includes policyId in user message', () => {
    expect(source).toContain('${cleanPolicyId}');
  });

  test('includes callType in user message', () => {
    expect(source).toContain('${cleanCallType}');
  });

  test('includes timestamp/timezone in user message', () => {
    expect(source).toContain('America/Los_Angeles');
    expect(source).toContain('PST');
  });

  test('includes raw notes in user message', () => {
    expect(source).toContain('${cleanNotes}');
  });

  test('throws on empty AI response', () => {
    expect(source).toContain('AI returned empty response');
  });
});

// ────────────────────────────────────────────────────
// HawkSoft Push Logic
// ────────────────────────────────────────────────────

describe('HawkSoft Push', () => {
  test('reads HawkSoft credentials from environment', () => {
    expect(source).toContain('process.env.HAWKSOFT_CLIENT_ID');
    expect(source).toContain('process.env.HAWKSOFT_CLIENT_SECRET');
    expect(source).toContain('process.env.HAWKSOFT_AGENCY_ID');
  });

  test('only pushes when all 3 HawkSoft credentials present', () => {
    expect(source).toContain('HAWKSOFT_CLIENT_ID && HAWKSOFT_CLIENT_SECRET && HAWKSOFT_AGENCY_ID');
  });

  test('uses Basic Auth with base64-encoded credentials', () => {
    expect(source).toContain('Basic');
    expect(source).toContain("Buffer.from(authString).toString('base64')");
  });

  test('targets HawkSoft integration API v3.0', () => {
    expect(source).toContain('https://integration.hawksoft.app');
    expect(source).toContain("'3.0'");
  });

  test('constructs correct log endpoint path', () => {
    expect(source).toContain('/vendor/agency/');
    expect(source).toContain('/client/');
    expect(source).toContain('/log?version=');
  });

  test('uses action code 5 for Inbound calls (Phone From Insured)', () => {
    expect(source).toContain('5');
    expect(source).toMatch(/5.*Phone From Insured/);
  });

  test('uses action code 1 for Outbound calls (Phone To Insured)', () => {
    expect(source).toContain('1');
    expect(source).toMatch(/1.*Phone To Insured/);
  });

  test('includes required refId and ts in log request body', () => {
    expect(source).toContain('crypto.randomUUID()');
    expect(source).toContain('new Date().toISOString()');
    expect(source).toMatch(/refId/);
    expect(source).toMatch(/\bts\b/);
  });

  test('switches action based on callType being Outbound', () => {
    expect(source).toContain("cleanCallType === 'Outbound' ? 1 : 5");
  });

  test('sets hawksoftLogged to true only on success', () => {
    expect(source).toContain('hawksoftLogged = true');
    // Also check logRes.ok guard
    expect(source).toContain('logRes.ok');
  });

  test('HawkSoft push failure does not crash the request', () => {
    // catch block should exist around HawkSoft push
    expect(source).toContain("console.warn('[HawkSoft Logger]");
    // hawksoftLogged stays false on failure
    expect(source).toContain('let hawksoftLogged = false');
  });

  test('logs skip message when credentials not configured', () => {
    expect(source).toContain('HawkSoft credentials not configured');
  });
});

// ────────────────────────────────────────────────────
// Response Shape
// ────────────────────────────────────────────────────

describe('Response', () => {
  test('returns 200 with formattedLog, hawksoftLogged, policyId, callType', () => {
    expect(source).toContain('res.status(200).json');
    expect(source).toMatch(/formattedLog.*hawksoftLogged/s);
    expect(source).toMatch(/policyId.*callType/s);
  });

  test('trims formattedLog before returning', () => {
    expect(source).toContain('formattedLog.trim()');
  });

  test('returns 500 on unexpected errors', () => {
    expect(source).toContain('res.status(500)');
    expect(source).toContain('Failed to format call notes');
  });
});

// ────────────────────────────────────────────────────
// Behavioral tests via mock handler eval
// ────────────────────────────────────────────────────

describe('Handler behavior (mocked)', () => {
  let handler;

  beforeAll(() => {
    // Strip ESM syntax and evaluate handler with mocks
    const cleaned = source
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s+default\s+securityMiddleware\(handler\)\s*;?\s*$/gm, '');

    // Mock createRouter to return a fake ai.ask()
    const mockCreateRouter = (settings) => ({
      ask: async (sys, user, opts) => 'RE: Test Subject\nInbound Call — 01/01/2026\n\nFormatted notes.\n\nAction Items: None'
    });

    const factory = new Function('createRouter', 'fetch', 'Buffer', 'console', `
      ${cleaned}
      return handler;
    `);

    handler = factory(mockCreateRouter, globalThis.fetch, Buffer, console);
  });

  function createReq(body, method = 'POST') {
    return { method, body, headers: {} };
  }

  function createRes() {
    const res = {
      _status: null,
      _json: null,
      status(code) { res._status = code; return res; },
      json(data) { res._json = data; return res; }
    };
    return res;
  }

  test('rejects GET requests with 405', async () => {
    const res = createRes();
    await handler(createReq({}, 'GET'), res);
    expect(res._status).toBe(405);
    expect(res._json.error).toContain('Method not allowed');
  });

  test('rejects missing policyId with 400', async () => {
    const res = createRes();
    await handler(createReq({ rawNotes: 'some notes' }), res);
    expect(res._status).toBe(400);
    expect(res._json.error).toContain('Policy ID');
  });

  test('rejects empty policyId with 400', async () => {
    const res = createRes();
    await handler(createReq({ policyId: '   ', rawNotes: 'some notes' }), res);
    expect(res._status).toBe(400);
    expect(res._json.error).toContain('Policy ID');
  });

  test('rejects missing rawNotes with 400', async () => {
    const res = createRes();
    await handler(createReq({ policyId: 'POL-123' }), res);
    expect(res._status).toBe(400);
    expect(res._json.error).toContain('Call notes');
  });

  test('rejects empty rawNotes with 400', async () => {
    const res = createRes();
    await handler(createReq({ policyId: 'POL-123', rawNotes: '' }), res);
    expect(res._status).toBe(400);
    expect(res._json.error).toContain('Call notes');
  });

  test('rejects notes over 10000 chars with 400', async () => {
    const res = createRes();
    await handler(createReq({ policyId: 'POL-123', rawNotes: 'x'.repeat(10001) }), res);
    expect(res._status).toBe(400);
    expect(res._json.error).toContain('Notes too long');
  });

  test('accepts exactly 10000 char notes', async () => {
    const res = createRes();
    await handler(createReq({ policyId: 'POL-123', rawNotes: 'x'.repeat(10000) }), res);
    expect(res._status).toBe(200);
  });

  test('returns 200 with formatted log on success', async () => {
    const res = createRes();
    await handler(createReq({ policyId: 'POL-123', rawNotes: 'called about home quote' }), res);
    expect(res._status).toBe(200);
    expect(res._json.formattedLog).toContain('RE: Test Subject');
    expect(res._json.policyId).toBe('POL-123');
    expect(res._json.callType).toBe('Inbound');
    expect(res._json.hawksoftLogged).toBe(false); // No env vars set
  });

  test('defaults callType to Inbound', async () => {
    const res = createRes();
    await handler(createReq({ policyId: 'X', rawNotes: 'notes' }), res);
    expect(res._json.callType).toBe('Inbound');
  });

  test('respects explicit Outbound callType', async () => {
    const res = createRes();
    await handler(createReq({ policyId: 'X', rawNotes: 'notes', callType: 'Outbound' }), res);
    expect(res._json.callType).toBe('Outbound');
  });

  test('handles null body gracefully', async () => {
    const res = createRes();
    await handler(createReq(null), res);
    expect(res._status).toBe(400);
  });

  test('returns 500 when AI returns empty', async () => {
    // Create handler with createRouter that returns empty
    const cleaned = source
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s+default\s+securityMiddleware\(handler\)\s*;?\s*$/gm, '');

    const emptyRouter = () => ({
      ask: async () => ''
    });

    const factory = new Function('createRouter', 'fetch', 'Buffer', 'console', `
      ${cleaned}
      return handler;
    `);

    const emptyHandler = factory(emptyRouter, globalThis.fetch, Buffer, console);
    const res = createRes();
    await emptyHandler(createReq({ policyId: 'X', rawNotes: 'notes' }), res);
    expect(res._status).toBe(500);
    expect(res._json.error).toContain('empty response');
  });

  test('returns 500 when AI throws', async () => {
    const cleaned = source
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s+default\s+securityMiddleware\(handler\)\s*;?\s*$/gm, '');

    const errorRouter = () => ({
      ask: async () => { throw new Error('API limit reached'); }
    });

    const factory = new Function('createRouter', 'fetch', 'Buffer', 'console', `
      ${cleaned}
      return handler;
    `);

    const errorHandler = factory(errorRouter, globalThis.fetch, Buffer, console);
    const res = createRes();
    await errorHandler(createReq({ policyId: 'X', rawNotes: 'notes' }), res);
    expect(res._status).toBe(500);
    expect(res._json.error).toContain('API limit reached');
  });
});

// ────────────────────────────────────────────────────
// AI Settings Detection (behavioral)
// ────────────────────────────────────────────────────

describe('AI Settings Detection (behavioral)', () => {
  function makeHandlerWithRouterSpy() {
    const cleaned = source
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s+default\s+securityMiddleware\(handler\)\s*;?\s*$/gm, '');

    const capturedSettings = [];
    const spyRouter = (settings) => {
      capturedSettings.push({ ...settings });
      return { ask: async () => 'RE: Test\nFormatted' };
    };

    const factory = new Function('createRouter', 'fetch', 'Buffer', 'console', `
      ${cleaned}
      return handler;
    `);

    return { handler: factory(spyRouter, globalThis.fetch, Buffer, console), capturedSettings };
  }

  function createReq(body) {
    return { method: 'POST', body, headers: {} };
  }

  function createRes() {
    const res = { _status: null, _json: null, status(c) { res._status = c; return res; }, json(d) { res._json = d; return res; } };
    return res;
  }

  test('no userApiKey → empty aiSettings', async () => {
    const { handler, capturedSettings } = makeHandlerWithRouterSpy();
    await handler(createReq({ policyId: 'P', rawNotes: 'notes' }), createRes());
    expect(capturedSettings[0]).toEqual({});
  });

  test('gpt-4o model → openai provider', async () => {
    const { handler, capturedSettings } = makeHandlerWithRouterSpy();
    await handler(createReq({ policyId: 'P', rawNotes: 'n', userApiKey: 'sk-xxx', aiModel: 'gpt-4o' }), createRes());
    expect(capturedSettings[0].provider).toBe('openai');
    expect(capturedSettings[0].model).toBe('gpt-4o');
  });

  test('claude-3 model → anthropic provider', async () => {
    const { handler, capturedSettings } = makeHandlerWithRouterSpy();
    await handler(createReq({ policyId: 'P', rawNotes: 'n', userApiKey: 'key', aiModel: 'claude-3-sonnet' }), createRes());
    expect(capturedSettings[0].provider).toBe('anthropic');
  });

  test('org/model format → openrouter provider', async () => {
    const { handler, capturedSettings } = makeHandlerWithRouterSpy();
    await handler(createReq({ policyId: 'P', rawNotes: 'n', userApiKey: 'key', aiModel: 'meta/llama-3.1' }), createRes());
    expect(capturedSettings[0].provider).toBe('openrouter');
  });

  test('unknown model → google provider', async () => {
    const { handler, capturedSettings } = makeHandlerWithRouterSpy();
    await handler(createReq({ policyId: 'P', rawNotes: 'n', userApiKey: 'key', aiModel: 'gemini-2.0-flash' }), createRes());
    expect(capturedSettings[0].provider).toBe('google');
  });

  test('userApiKey with no model → google provider', async () => {
    const { handler, capturedSettings } = makeHandlerWithRouterSpy();
    await handler(createReq({ policyId: 'P', rawNotes: 'n', userApiKey: 'key' }), createRes());
    expect(capturedSettings[0].provider).toBe('google');
    expect(capturedSettings[0].apiKey).toBe('key');
  });
});
