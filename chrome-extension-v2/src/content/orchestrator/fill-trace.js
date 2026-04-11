/**
 * Altech EZLynx V2 — FillTrace
 *
 * Structured logger for atom state transitions. Every LOCATE/PRECHECK/
 * FILL/VERIFY transition streams through here. The toolbar's fill report
 * panel reads from a trace at the end of the orchestrator run. Also
 * persisted to chrome.storage.local.lastFillReport for the popup.
 */
(function (global) {
    'use strict';

    function createFillTrace(meta) {
        const entries = [];
        const counts = { DONE: 0, SKIPPED: 0, FAILED: 0, BLOCKED: 0 };
        const startedAt = Date.now();

        function log(atomKey, state, detail) {
            entries.push({
                t: Date.now() - startedAt,
                atom: atomKey,
                state,
                detail: detail || null,
            });
        }

        function finalize(atomKey, terminalState, detail) {
            log(atomKey, terminalState, detail);
            if (counts[terminalState] != null) counts[terminalState]++;
        }

        function toReport() {
            return {
                meta: meta || {},
                startedAt,
                durationMs: Date.now() - startedAt,
                counts,
                total: entries.filter((e) => /^(DONE|SKIPPED|FAILED|BLOCKED)$/.test(e.state)).length,
                entries,
            };
        }

        return { log, finalize, counts, toReport };
    }

    const api = { createFillTrace };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.orchestrator = global.AltechV2.orchestrator || {};
        global.AltechV2.orchestrator.createFillTrace = createFillTrace;
    }
})(typeof window !== 'undefined' ? window : globalThis);
