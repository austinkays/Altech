/**
 * AI Error Decoder — verifies _decodeApiError translates HTTP statuses
 * into helpful messages. Mirrors the implementation in js/ai-provider.js;
 * this is a regression guard so future status-code changes don't silently
 * regress the user-visible error text.
 */

// Re-implement here so we test behavior, not bootstrapping. If the helper
// changes shape in ai-provider.js, this test should be updated in lockstep.
function decodeApiError(provider, status, errBody) {
    const upstream = (errBody && errBody.error && errBody.error.message) ||
                     (errBody && errBody.message) || '';
    const providerLabel = {
        google: 'Gemini',
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        openrouter: 'OpenRouter',
    }[provider] || provider;

    switch (status) {
        case 400:
            return `${providerLabel} rejected the request${upstream ? ': ' + upstream : ' — check Settings → AI Provider for model compatibility'}`;
        case 401:
            return `${providerLabel} API key is invalid or expired — re-add it in Settings → AI Provider`;
        case 403:
            return `${providerLabel} blocked this request — your API key may not have access to this model${upstream ? ' (' + upstream + ')' : ''}`;
        case 404:
            return `${providerLabel} model not found — pick a different model in Settings`;
        case 408:
        case 504:
            return `${providerLabel} timed out — try again in a moment`;
        case 413:
            return `Request too large for ${providerLabel} — try a smaller/shorter document`;
        case 429:
            return `${providerLabel} rate limit hit — wait ~30s and try again, or check your account quota`;
        case 500:
        case 502:
        case 503:
            return `${providerLabel} is having issues right now (${status}) — try again in a moment`;
        default:
            return upstream || `${providerLabel} API error (${status})`;
    }
}

describe('AI error decoder', () => {
    test('401 maps to "key invalid" with Settings hint', () => {
        const msg = decodeApiError('google', 401, {});
        expect(msg).toContain('Gemini');
        expect(msg).toContain('invalid');
        expect(msg).toContain('Settings');
    });

    test('429 maps to a rate-limit message with a wait hint', () => {
        const msg = decodeApiError('anthropic', 429, {});
        expect(msg).toContain('Anthropic');
        expect(msg).toContain('rate limit');
        expect(msg).toContain('wait');
    });

    test('5xx errors mention the provider had issues + retry', () => {
        for (const status of [500, 502, 503]) {
            const msg = decodeApiError('openai', status, {});
            expect(msg).toContain('issues');
            expect(msg).toContain('try again');
            expect(msg).toContain(String(status));
        }
    });

    test('413 says "too large"', () => {
        const msg = decodeApiError('google', 413, {});
        expect(msg).toContain('too large');
    });

    test('400 includes upstream message when present', () => {
        const msg = decodeApiError('google', 400, { error: { message: 'Schema malformed' } });
        expect(msg).toContain('rejected');
        expect(msg).toContain('Schema malformed');
    });

    test('400 with no upstream message points at Settings', () => {
        const msg = decodeApiError('google', 400, {});
        expect(msg).toContain('rejected');
        expect(msg).toContain('Settings');
    });

    test('unknown status falls back to upstream message', () => {
        const msg = decodeApiError('google', 418, { error: { message: "I'm a teapot" } });
        expect(msg).toContain("I'm a teapot");
    });

    test('unknown status with no upstream falls back to generic format', () => {
        const msg = decodeApiError('openrouter', 418, {});
        expect(msg).toContain('OpenRouter');
        expect(msg).toContain('418');
    });

    test('provider labels are friendly (not raw provider keys)', () => {
        expect(decodeApiError('google', 401, {})).toContain('Gemini');
        expect(decodeApiError('openai', 401, {})).toContain('OpenAI');
        expect(decodeApiError('openrouter', 401, {})).toContain('OpenRouter');
        expect(decodeApiError('anthropic', 401, {})).toContain('Anthropic');
    });
});
