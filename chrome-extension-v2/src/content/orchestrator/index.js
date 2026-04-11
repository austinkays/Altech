/**
 * Altech EZLynx V2 — Orchestrator main run loop
 *
 * Entry point: `run(routeKey, clientData)`
 *
 *   1. Load atoms for the route from the registry
 *   2. Topologically sort by preconditions
 *   3. Execute atoms sequentially — one at a time, never parallel
 *   4. Mark blocked atoms whose precondition atom FAILED
 *   5. Stream every transition to a FillTrace
 *   6. Return { report, counts }
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                getRegistry: require('../registries').getRegistry,
                getEntityCount: require('../registries').getEntityCount,
                topoSort: require('./dependency-graph').topoSort,
                createFillTrace: require('./fill-trace').createFillTrace,
                executeAtom: require('./atom-executor').executeAtom,
                discoverCoApplicantEntityId: require('../special-cases/entity-id-discovery').discoverCoApplicantEntityId,
            };
        }
        return {
            getRegistry: global.AltechV2.registries.getRegistry,
            getEntityCount: global.AltechV2.registries.getEntityCount,
            topoSort: global.AltechV2.orchestrator.topoSort,
            createFillTrace: global.AltechV2.orchestrator.createFillTrace,
            executeAtom: global.AltechV2.orchestrator.executeAtom,
            discoverCoApplicantEntityId: global.AltechV2.specialCases && global.AltechV2.specialCases.discoverCoApplicantEntityId,
        };
    };

    /**
     * @param {string} routeKey
     * @param {object} clientData
     * @param {object} [opts]   { onProgress?: (i, total, atom) => void }
     * @returns {Promise<object>}  fill report
     */
    async function run(routeKey, clientData, opts) {
        const deps = getDeps();
        const trace = deps.createFillTrace({ routeKey, startedAt: new Date().toISOString() });

        const rawAtoms = deps.getRegistry(routeKey, clientData);
        if (!rawAtoms || rawAtoms.length === 0) {
            trace.log('*', 'NO_REGISTRY', {
                routeKey,
                message: 'no registry for this route — pending Phase 1',
            });
            return trace.toReport();
        }

        // Topological sort — fail fast on cycles or bad references.
        let sorted;
        try {
            sorted = deps.topoSort(rawAtoms);
        } catch (e) {
            trace.log('*', 'REGISTRY_ERROR', { error: e.message, detail: e.detail });
            return trace.toReport();
        }

        // ── Pre-run: co-applicant entity discovery ──────────────────────────
        // If any atom needs coApplicant scope AND clientData.CoApplicant exists,
        // run entity discovery before the main loop so {entityId} can be resolved.
        const needsEntityDiscovery = sorted.some((a) => a.scope === 'coApplicant');
        let coApplicantEntityId = null;
        if (needsEntityDiscovery && clientData && clientData.CoApplicant) {
            trace.log('*', 'ENTITY_DISCOVERY_START', { scope: 'coApplicant' });
            try {
                coApplicantEntityId = await deps.discoverCoApplicantEntityId();
                trace.log('*', 'ENTITY_DISCOVERY_DONE', { entityId: coApplicantEntityId });
            } catch (e) {
                // Non-fatal — co-applicant atoms will reach FAILED at LOCATE.
                trace.log('*', 'ENTITY_DISCOVERY_FAILED', { error: e && e.message });
            }
        }

        // Track terminal state per atom key so later atoms can detect
        // BLOCKED dependencies.
        const terminalState = new Map();

        const total = sorted.length;
        let i = 0;
        for (const atom of sorted) {
            i++;
            if (opts && typeof opts.onProgress === 'function') {
                try { opts.onProgress(i, total, atom); } catch (_) { /* ignore */ }
            }

            // BLOCKED check: if any precondition terminated in FAILED/BLOCKED,
            // this atom never runs.
            const blockedBy = findBlockedBy(atom, terminalState);
            if (blockedBy) {
                trace.finalize(atom.key, 'BLOCKED', { blockedBy });
                terminalState.set(atom.key, 'BLOCKED');
                continue;
            }

            const ctx = {
                index: atom._index,
                entityId: atom.scope === 'coApplicant' ? coApplicantEntityId : atom._entityId,
            };
            try {
                const result = await deps.executeAtom(atom, { clientData, ctx, trace });
                terminalState.set(atom.key, result.state);
            } catch (e) {
                trace.finalize(atom.key, 'FAILED', { reason: 'executor-exception', error: e && e.message });
                terminalState.set(atom.key, 'FAILED');
            }
        }

        return trace.toReport();
    }

    function findBlockedBy(atom, terminalState) {
        const preconds = Array.isArray(atom.preconditions) ? atom.preconditions : [];
        for (const p of preconds) {
            const state = terminalState.get(p.atom);
            if (state === 'FAILED' || state === 'BLOCKED') return p.atom;
            if (p.state === 'DONE' && state !== 'DONE') return p.atom;
        }
        return null;
    }

    const api = { run, findBlockedBy };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.orchestrator.run = run;
    }
})(typeof window !== 'undefined' ? window : globalThis);
