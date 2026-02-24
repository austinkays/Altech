/**
 * AI Router Tests (_ai-router.js)
 *
 * Tests defensive handling of extractJSON and createRouter:
 * - extractJSON with non-string inputs (objects, numbers, null, arrays)
 * - extractJSON with valid string inputs (clean JSON, fenced, nested)
 * - createRouter return shape (ask, askVision, askWithSearch)
 * - askWithSearch always returns { text, grounded } object, never raw string
 *
 * These tests specifically guard against the "text.trim is not a function"
 * crash that occurred when askWithSearch returned an object but callers
 * expected a string.
 */

const fs = require('fs');
const path = require('path');

// ── Load extractJSON and createRouter from ESM source ──
function loadAIRouterFunctions() {
  const source = fs.readFileSync(path.join(__dirname, '../api/_ai-router.js'), 'utf8');

  // Strip import/export to make it evaluable
  const cleaned = source
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+/gm, '');

  // We can't actually call the AI providers (no API key), but we can
  // test extractJSON and verify createRouter's return structure
  const extractFn = new Function('fetch', `
    ${cleaned}
    return { extractJSON, createRouter };
  `);

  // Pass a mock fetch so it doesn't throw on reference
  return extractFn(async () => ({ ok: false }));
}

let fns;

beforeAll(() => {
  fns = loadAIRouterFunctions();
});

// ────────────────────────────────────────────────────
// Module loads
// ────────────────────────────────────────────────────

describe('_ai-router.js — Module Syntax', () => {
  test('extractJSON and createRouter loaded successfully', () => {
    expect(typeof fns.extractJSON).toBe('function');
    expect(typeof fns.createRouter).toBe('function');
  });
});

// ────────────────────────────────────────────────────
// extractJSON — Type Safety (the crash that was fixed)
// ────────────────────────────────────────────────────

describe('extractJSON — type safety', () => {
  test('returns null for null input', () => {
    expect(fns.extractJSON(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(fns.extractJSON(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(fns.extractJSON('')).toBeNull();
  });

  test('returns null for numeric input (no .trim method)', () => {
    expect(fns.extractJSON(42)).toBeNull();
  });

  test('returns null for boolean input', () => {
    expect(fns.extractJSON(true)).toBeNull();
  });

  test('returns null for plain object input (the askWithSearch bug)', () => {
    // This is exactly the bug: askWithSearch returns { text: '...', grounded: true }
    // and that object was passed directly to extractJSON
    const askWithSearchResult = { text: '{"key":"value"}', grounded: true };
    expect(fns.extractJSON(askWithSearchResult)).toBeNull();
  });

  test('returns null for array input', () => {
    expect(fns.extractJSON([1, 2, 3])).toBeNull();
  });
});

// ────────────────────────────────────────────────────
// extractJSON — Valid String Inputs
// ────────────────────────────────────────────────────

describe('extractJSON — valid string parsing', () => {
  test('parses clean JSON object', () => {
    const result = fns.extractJSON('{"name": "Acme", "state": "WA"}');
    expect(result).toEqual({ name: 'Acme', state: 'WA' });
  });

  test('parses clean JSON array', () => {
    const result = fns.extractJSON('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  test('parses markdown-fenced JSON', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(fns.extractJSON(input)).toEqual({ key: 'value' });
  });

  test('parses fenced without json label', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(fns.extractJSON(input)).toEqual({ key: 'value' });
  });

  test('extracts JSON embedded in prose text', () => {
    const input = 'Here is the analysis:\n\n{"risk": "low", "score": 85}\n\nThat is my assessment.';
    expect(fns.extractJSON(input)).toEqual({ risk: 'low', score: 85 });
  });

  test('handles trailing commas', () => {
    const input = '{"a": 1, "b": 2,}';
    expect(fns.extractJSON(input)).toEqual({ a: 1, b: 2 });
  });

  test('handles whitespace around JSON', () => {
    const input = '   \n  {"key": "val"}  \n  ';
    expect(fns.extractJSON(input)).toEqual({ key: 'val' });
  });

  test('returns null for non-JSON string', () => {
    expect(fns.extractJSON('This is just plain text with no JSON')).toBeNull();
  });

  test('handles nested JSON objects', () => {
    const input = '{"outer": {"inner": {"deep": true}}}';
    expect(fns.extractJSON(input)).toEqual({ outer: { inner: { deep: true } } });
  });

  test('handles JSON with escaped quotes in strings', () => {
    const input = '{"msg": "He said \\"hello\\""}';
    expect(fns.extractJSON(input)).toEqual({ msg: 'He said "hello"' });
  });
});

// ────────────────────────────────────────────────────
// createRouter — Return Shape
// ────────────────────────────────────────────────────

describe('createRouter — return shape', () => {
  test('returns object with ask, askVision, askWithSearch methods', () => {
    const router = fns.createRouter({ provider: 'google', apiKey: 'test-key' });
    expect(typeof router.ask).toBe('function');
    expect(typeof router.askVision).toBe('function');
    expect(typeof router.askWithSearch).toBe('function');
    expect(typeof router.extractJSON).toBe('function');
  });

  test('exposes provider and model info', () => {
    const router = fns.createRouter({ provider: 'google', apiKey: 'test-key' });
    expect(router.provider).toBe('google');
    expect(typeof router.model).toBe('string');
    expect(router.model.length).toBeGreaterThan(0);
  });

  test('defaults to google provider when no settings', () => {
    const router = fns.createRouter({});
    expect(router.provider).toBe('google');
    expect(router.isGoogle).toBe(true);
  });

  test('does not leak API key (returns boolean)', () => {
    const router = fns.createRouter({ provider: 'google', apiKey: 'super-secret-key' });
    expect(router.apiKey).toBe(true);
    expect(typeof router.apiKey).toBe('boolean');
  });

  test('sets correct default models per provider', () => {
    const google = fns.createRouter({ provider: 'google', apiKey: 'k' });
    expect(google.model).toContain('gemini');

    const openai = fns.createRouter({ provider: 'openai', apiKey: 'k' });
    expect(openai.model).toContain('gpt');

    const anthropic = fns.createRouter({ provider: 'anthropic', apiKey: 'k' });
    expect(anthropic.model).toContain('claude');
  });

  test('isGoogle flag correctly set', () => {
    expect(fns.createRouter({ provider: 'google', apiKey: 'k' }).isGoogle).toBe(true);
    expect(fns.createRouter({ provider: 'openai', apiKey: 'k' }).isGoogle).toBe(false);
    expect(fns.createRouter({ provider: 'anthropic', apiKey: 'k' }).isGoogle).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// askWithSearch — Contract Verification
// ────────────────────────────────────────────────────

describe('askWithSearch — return contract', () => {
  test('askWithSearch throws when no API key configured', async () => {
    const router = fns.createRouter({ provider: 'google' });
    // No apiKey → should throw
    await expect(router.askWithSearch('sys', 'user')).rejects.toThrow('No AI API key configured');
  });

  // Verify that even if ask() returns a string, askWithSearch wraps it
  // This is a structural test — the function signature documents the contract
  test('askWithSearch is documented to return { text, grounded } object', () => {
    // Read the source and verify the function returns an object with text/grounded
    const source = fs.readFileSync(path.join(__dirname, '../api/_ai-router.js'), 'utf8');

    // Verify Google path returns { text, grounded, groundingMetadata }
    expect(source).toMatch(/return\s*\{\s*text:\s*result\.text\s*,\s*grounded:\s*true/);

    // Verify non-Google path returns { text, grounded: false }
    expect(source).toMatch(/return\s*\{\s*text\s*,\s*grounded:\s*false\s*\}/);
  });

  test('callers must destructure .text from askWithSearch result', () => {
    // Verify prospect-lookup.js correctly destructures
    const prospectSource = fs.readFileSync(path.join(__dirname, '../api/prospect-lookup.js'), 'utf8');
    expect(prospectSource).toMatch(/searchResult\?\.text/);
    expect(prospectSource).not.toMatch(/const rawText = await ai\.askWithSearch/);

    // Verify property-intelligence.js correctly destructures
    const propertySource = fs.readFileSync(path.join(__dirname, '../api/property-intelligence.js'), 'utf8');
    expect(propertySource).toMatch(/searchResult\?\.text/);
    expect(propertySource).not.toMatch(/const text = await ai\.askWithSearch/);
  });
});
