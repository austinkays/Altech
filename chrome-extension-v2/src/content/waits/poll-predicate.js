/**
 * Altech EZLynx V2 — Poll predicate
 *
 * Generic polling primitive. Every wait in the extension delegates here —
 * there are no hardcoded delays. Default: 50ms interval, 5s timeout.
 *
 * Returns:
 *   { ok: true, value: <predicate-return> } on pass
 *   { ok: false, elapsedMs }                 on timeout
 */
(function (global) {
    'use strict';

    /**
     * @param {() => any} predicate  Truthy return ends the poll. Can be async.
     * @param {object}   [opts]
     * @param {number}   [opts.timeoutMs=5000]
     * @param {number}   [opts.intervalMs=50]
     * @returns {Promise<{ok: boolean, value?: any, elapsedMs: number}>}
     */
    async function pollPredicate(predicate, opts) {
        const timeoutMs = (opts && opts.timeoutMs) || 5000;
        const intervalMs = (opts && opts.intervalMs) || 50;
        const start = Date.now();
        const deadline = start + timeoutMs;
        // Check once up front — predicate may already be satisfied.
        try {
            const v = await predicate();
            if (v) return { ok: true, value: v, elapsedMs: Date.now() - start };
        } catch (_) { /* swallow predicate errors, treat as false */ }

        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, intervalMs));
            try {
                const v = await predicate();
                if (v) return { ok: true, value: v, elapsedMs: Date.now() - start };
            } catch (_) { /* continue */ }
        }
        return { ok: false, elapsedMs: Date.now() - start };
    }

    const api = { pollPredicate };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.waits = global.AltechV2.waits || {};
        global.AltechV2.waits.pollPredicate = pollPredicate;
    }
})(typeof window !== 'undefined' ? window : globalThis);
