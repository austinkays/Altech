/**
 * API Tests: _fetch-timeout.js + anthropic-proxy timeout mapping
 *
 * Covers the gap closed in the "vibe-coded review" pass: upstream AI calls
 * had no deadline, so a slow Anthropic/Gemini hung the serverless function
 * for the full maxDuration.
 *
 * - fetchWithTimeout: happy-path passthrough, timeout → tagged error,
 *   non-timeout errors propagate unchanged
 * - isUpstreamTimeout / sendUpstreamTimeout shape
 * - anthropic-proxy handler: timeout → 504 + Retry-After, success → 200
 *   passthrough, non-timeout upstream error → 500 (unchanged behavior)
 */

const fs = require('fs');
const path = require('path');

// ── Load _fetch-timeout.js (inject fetch so we control upstream timing) ──
function loadFetchTimeout(mockFetch) {
  const source = fs.readFileSync(path.join(__dirname, '../api/_fetch-timeout.js'), 'utf8');
  const cleaned = source.replace(/^export\s+/gm, '');
  const factory = new Function('fetch', `
    ${cleaned}
    return { fetchWithTimeout, isUpstreamTimeout, sendUpstreamTimeout, UPSTREAM_TIMEOUT_CODE };
  `);
  return factory(mockFetch);
}

// ── Load the anthropic-proxy inner handler with injected deps ──
function loadProxyHandler(deps) {
  const source = fs.readFileSync(path.join(__dirname, '../api/anthropic-proxy.js'), 'utf8');
  const cleaned = source
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+default\s+.*$/m, '');
  const factory = new Function(
    'fetchWithTimeout', 'isUpstreamTimeout', 'sendUpstreamTimeout',
    `${cleaned}\n return { handler };`
  );
  return factory(deps.fetchWithTimeout, deps.isUpstreamTimeout, deps.sendUpstreamTimeout).handler;
}

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

// ────────────────────────────────────────────────────
// fetchWithTimeout
// ────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  test('passes the Response through on fast success', async () => {
    const fake = { ok: true, status: 200, json: async () => ({ hi: 1 }) };
    const { fetchWithTimeout } = loadFetchTimeout(async () => fake);
    const res = await fetchWithTimeout('https://x', { method: 'POST' }, 1000);
    expect(res).toBe(fake);
  });

  test('rejects with code UPSTREAM_TIMEOUT when upstream never responds', async () => {
    // Mock fetch that only settles when the abort signal fires
    const hangingFetch = (_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
    const { fetchWithTimeout } = loadFetchTimeout(hangingFetch);
    const start = Date.now();
    await expect(fetchWithTimeout('https://x', {}, 50)).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
    expect(Date.now() - start).toBeLessThan(2000); // fast-fail, not a hang
  });

  test('propagates non-timeout fetch errors unchanged', async () => {
    const { fetchWithTimeout } = loadFetchTimeout(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(fetchWithTimeout('https://x', {}, 1000)).rejects.toThrow('ECONNREFUSED');
    await expect(fetchWithTimeout('https://x', {}, 1000)).rejects.not.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
  });
});

// ────────────────────────────────────────────────────
// isUpstreamTimeout / sendUpstreamTimeout
// ────────────────────────────────────────────────────

describe('isUpstreamTimeout', () => {
  test('true only for the tagged error', () => {
    const { isUpstreamTimeout } = loadFetchTimeout(async () => ({}));
    const tagged = Object.assign(new Error('t'), { code: 'UPSTREAM_TIMEOUT' });
    expect(isUpstreamTimeout(tagged)).toBe(true);
    expect(isUpstreamTimeout(new Error('other'))).toBe(false);
    expect(isUpstreamTimeout(null)).toBe(false);
  });
});

describe('sendUpstreamTimeout', () => {
  test('sets Retry-After and a 504 JSON body with requestId', () => {
    const { sendUpstreamTimeout } = loadFetchTimeout(async () => ({}));
    const res = makeRes();
    sendUpstreamTimeout(res, 'req-123');
    expect(res.headers['Retry-After']).toBe('30');
    expect(res.statusCode).toBe(504);
    expect(res.body.requestId).toBe('req-123');
    expect(res.body.error.message).toMatch(/did not respond in time/i);
  });
});

// ────────────────────────────────────────────────────
// anthropic-proxy handler — timeout mapping
// ────────────────────────────────────────────────────

describe('anthropic-proxy handler', () => {
  const realHelpers = loadFetchTimeout(async () => ({}));
  const validReq = () => ({
    method: 'POST',
    requestId: 'rid-1',
    body: { apiKey: 'sk-ant-test', messages: [{ role: 'user', content: 'hi' }] },
  });

  test('upstream timeout → 504 + Retry-After (not a hang, not a 500)', async () => {
    const handler = loadProxyHandler({
      fetchWithTimeout: async () => {
        throw Object.assign(new Error('timed out'), { code: 'UPSTREAM_TIMEOUT' });
      },
      isUpstreamTimeout: realHelpers.isUpstreamTimeout,
      sendUpstreamTimeout: realHelpers.sendUpstreamTimeout,
    });
    const res = makeRes();
    await handler(validReq(), res);
    expect(res.statusCode).toBe(504);
    expect(res.headers['Retry-After']).toBe('30');
    expect(res.body.error.message).toMatch(/did not respond in time/i);
  });

  test('happy path → 200 with upstream JSON unchanged', async () => {
    const upstream = { content: [{ text: 'hello' }] };
    const handler = loadProxyHandler({
      fetchWithTimeout: async () => ({ ok: true, status: 200, json: async () => upstream }),
      isUpstreamTimeout: realHelpers.isUpstreamTimeout,
      sendUpstreamTimeout: realHelpers.sendUpstreamTimeout,
    });
    const res = makeRes();
    await handler(validReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(upstream);
  });

  test('non-timeout upstream throw → 500 (existing behavior preserved)', async () => {
    const handler = loadProxyHandler({
      fetchWithTimeout: async () => { throw new Error('socket boom'); },
      isUpstreamTimeout: realHelpers.isUpstreamTimeout,
      sendUpstreamTimeout: realHelpers.sendUpstreamTimeout,
    });
    const res = makeRes();
    await handler(validReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toBe('socket boom');
  });
});
