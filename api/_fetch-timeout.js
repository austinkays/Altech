/**
 * fetchWithTimeout — `fetch` with an AbortController deadline.
 *
 * The AI upstreams (Anthropic / Gemini / OpenAI / OpenRouter) have no
 * server-side response guarantee; a slow one would otherwise hang the
 * serverless function until Vercel's `maxDuration` kills it. On timeout this
 * rejects with an Error tagged `err.code = 'UPSTREAM_TIMEOUT'` so routable
 * handlers can map it to a fast 504. Non-timeout fetch failures propagate
 * unchanged.
 *
 * @param {string|URL} url
 * @param {object} [options]      Standard fetch init (no `signal` — supplied here)
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<Response>}
 */
export const UPSTREAM_TIMEOUT_CODE = 'UPSTREAM_TIMEOUT';

export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err && err.name === 'AbortError') {
            const e = new Error(`Upstream request timed out after ${timeoutMs}ms`);
            e.code = UPSTREAM_TIMEOUT_CODE;
            throw e;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/** True when an error originated from a `fetchWithTimeout` deadline. */
export function isUpstreamTimeout(err) {
    return !!err && err.code === UPSTREAM_TIMEOUT_CODE;
}

/**
 * Send the standard 504 for an upstream timeout: sets `Retry-After` so the
 * client's `_decodeApiError` 504 mapping surfaces a friendly retry message
 * instead of a hung spinner. Returns the result of `res.json(...)`.
 */
export function sendUpstreamTimeout(res, requestId) {
    res.setHeader('Retry-After', '30');
    return res.status(504).json({
        error: { message: 'The AI provider did not respond in time. Please try again.' },
        requestId,
    });
}
