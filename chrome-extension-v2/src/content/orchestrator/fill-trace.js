/**
 * Altech EZLynx V2 — FillTrace
 *
 * Structured logger for atom state transitions. Every LOCATE/PRECHECK/
 * FILL/VERIFY transition streams through here. The toolbar's fill report
 * panel reads from a trace at the end of the orchestrator run. Also
 * persisted to chrome.storage.local.lastFillReport for the popup.
 *
 * Phase 4 additions:
 *   - `registerAtoms(atoms)` — capture the post-topo-sorted atom list so
 *     the report renderer can look up label / scope / _index / _entity
 *     metadata by atom key. Intermediate transitions (LOCATE / FILL / etc.)
 *     only carry the key, so the renderer needs this index to show the
 *     human-readable label + group the rows by section.
 *   - `report.atomIndex` — key → { label, scope, index, idTemplate, entity }
 *   - Keeps the runtime shape of existing fields (`entries`, `counts`,
 *     `meta`, `durationMs`, `total`) fully backwards compatible.
 */
(function (global) {
    'use strict';

    function createFillTrace(meta) {
        const entries = [];
        const counts = { DONE: 0, SKIPPED: 0, FAILED: 0, BLOCKED: 0 };
        const atomIndex = {};
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

        /**
         * Capture atom metadata for per-atom report rendering.
         * Safe to call multiple times; later registrations overwrite earlier
         * ones for the same key.
         *
         * @param {Array<object>} atoms  Flat, topo-sorted atom spec array.
         */
        function registerAtoms(atoms) {
            if (!Array.isArray(atoms)) return;
            for (const a of atoms) {
                if (!a || !a.key) continue;
                atomIndex[a.key] = {
                    label: a.label || a.key,
                    scope: a.scope || null,
                    index: (a._index != null) ? a._index : null,
                    idTemplate: a.idTemplate || null,
                    type: a.type || null,
                };
            }
        }

        function toReport() {
            return {
                meta: meta || {},
                startedAt,
                durationMs: Date.now() - startedAt,
                counts,
                total: entries.filter((e) => /^(DONE|SKIPPED|FAILED|BLOCKED)$/.test(e.state)).length,
                entries,
                atomIndex,
            };
        }

        return { log, finalize, registerAtoms, counts, toReport };
    }

    const api = { createFillTrace };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.orchestrator = global.AltechV2.orchestrator || {};
        global.AltechV2.orchestrator.createFillTrace = createFillTrace;
    }
})(typeof window !== 'undefined' ? window : globalThis);
