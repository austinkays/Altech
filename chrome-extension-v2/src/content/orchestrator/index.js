/**
 * Altech EZLynx V2 — Orchestrator main run loop
 *
 * Entry point: `run(routeKey, clientData)`
 *
 *   1. Load atoms for the route from the registry
 *   2. Topologically sort by preconditions
 *   3. Execute atoms in batches:
 *        - Pure-DOM types with no preconditions run in parallel waves
 *          (text/phone/ssn/number/currency/date). They touch independent
 *          inputs and never open a CDK overlay, so racing them is safe.
 *        - Anything else (mat-select/toggle/radio, anything with deps,
 *          anything with postFill) runs strictly serial — one overlay
 *          at a time.
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
                ensureEntities: require('../special-cases/add-entity').ensureEntities,
            };
        }
        return {
            getRegistry: global.AltechV2.registries.getRegistry,
            getEntityCount: global.AltechV2.registries.getEntityCount,
            topoSort: global.AltechV2.orchestrator.topoSort,
            createFillTrace: global.AltechV2.orchestrator.createFillTrace,
            executeAtom: global.AltechV2.orchestrator.executeAtom,
            discoverCoApplicantEntityId: global.AltechV2.specialCases && global.AltechV2.specialCases.discoverCoApplicantEntityId,
            ensureEntities: global.AltechV2.specialCases && global.AltechV2.specialCases.ensureEntities,
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

        // Phase 4 — capture atom metadata for the fill-report renderer.
        // Registers label / scope / _index / idTemplate for every atom in
        // the topo-sorted run list so the per-atom drill-down can show
        // human-readable labels grouped by section.
        if (typeof trace.registerAtoms === 'function') {
            trace.registerAtoms(sorted);
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

        // ── Pre-run: multi-entity container provisioning (Phase 2) ──────────
        // For drivers-compact / vehicles-compact / incidents routes, click
        // the "Add Driver" / "Add Vehicle" / "Add Accident" etc. buttons
        // until there are enough wrappers / sub-type slots to cover every
        // entry in clientData. Idempotent — no-ops if already provisioned.
        // ensureEntities never throws; downstream atoms will FAIL at LOCATE
        // cleanly on any failures, which are also recorded in the trace.
        if (deps.ensureEntities && (
            routeKey === 'drivers-compact' ||
            routeKey === 'vehicles-compact' ||
            routeKey === 'incidents'
        )) {
            try {
                const addResult = await deps.ensureEntities(routeKey, clientData, trace);
                trace.log('*', 'ENSURE_ENTITIES_DONE', addResult);
            } catch (e) {
                trace.log('*', 'ENSURE_ENTITIES_FAILED', { error: e && e.message });
            }
        }

        // Track terminal state per atom key so later atoms can detect
        // BLOCKED dependencies.
        const terminalState = new Map();

        const total = sorted.length;
        let i = 0;

        const runOne = async (atom) => {
            i++;
            if (opts && typeof opts.onProgress === 'function') {
                try { opts.onProgress(i, total, atom); } catch (_) { /* ignore */ }
            }

            const blockedBy = findBlockedBy(atom, terminalState);
            if (blockedBy) {
                trace.finalize(atom.key, 'BLOCKED', { blockedBy });
                terminalState.set(atom.key, 'BLOCKED');
                return;
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
        };

        // Group atoms into runs of parallelizable batches and serial atoms.
        let cursor = 0;
        while (cursor < sorted.length) {
            const batch = collectParallelBatch(sorted, cursor);
            if (batch.length > 1) {
                // Parallel wave — execute all together. terminalState is only
                // mutated after each runOne resolves, so atoms in the batch
                // can't see one another's results (safe — collectParallelBatch
                // guarantees no intra-batch preconditions).
                await Promise.all(batch.map(runOne));
                cursor += batch.length;
            } else {
                // Serial — overlay-heavy or precondition-bearing atom.
                await runOne(sorted[cursor]);
                cursor += 1;
            }
        }

        return trace.toReport();
    }

    // Types that are safe to fill concurrently — they touch independent
    // <input> elements and never open a CDK overlay panel.
    const PARALLEL_TYPES = new Set(['text', 'phone', 'ssn', 'number', 'currency', 'date']);

    function isParallelizable(atom) {
        if (!PARALLEL_TYPES.has(atom.type)) return false;
        if (Array.isArray(atom.preconditions) && atom.preconditions.length > 0) return false;
        if (Array.isArray(atom.postFill) && atom.postFill.length > 0) return false;
        return true;
    }

    function collectParallelBatch(sorted, start) {
        const batch = [];
        for (let j = start; j < sorted.length; j++) {
            if (!isParallelizable(sorted[j])) break;
            batch.push(sorted[j]);
        }
        return batch;
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

    const api = { run, findBlockedBy, isParallelizable, collectParallelBatch };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.orchestrator.run = run;
        global.AltechV2.orchestrator.isParallelizable = isParallelizable;
        global.AltechV2.orchestrator.collectParallelBatch = collectParallelBatch;
    }
})(typeof window !== 'undefined' ? window : globalThis);
