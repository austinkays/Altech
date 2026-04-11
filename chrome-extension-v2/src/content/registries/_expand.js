/**
 * Altech EZLynx V2 — Multi-entity registry expansion helper (Phase 2)
 *
 * Turns a reusable base atom list (e.g. `driverAtoms`, `vehicleAtoms`,
 * `accidentAtoms`) into per-index copies with globally-unique keys,
 * rewritten precondition references, pre-baked `idTemplate` placeholder
 * substitutions, and the appropriate `scope` / `_index` / `_entity`
 * bookkeeping for the orchestrator.
 *
 * The orchestrator's `for (const atom of sorted)` loop never sees the
 * multi-entity structure — it just iterates a flat topologically-sorted
 * atom list. All expansion happens in `registries/index.js` before the
 * atoms ever reach `topoSort`. See plan §6.2–6.4.
 *
 * Rules:
 *   1. `key` is prefixed with `${prefix}${index}_` so d0_firstName and
 *      d1_firstName are distinct nodes in the dependency graph.
 *   2. Preconditions are rewritten ONLY if they reference another key in
 *      the same base list (`localKeys.has(p.atom)`). Cross-entity or
 *      cross-registry references pass through unchanged — future-proofs
 *      for e.g. a vehicle atom depending on a policy-level atom.
 *   3. `idTemplate` substitutes `{N+1}` first (legacy EZLynx ids like
 *      `textD{N+1}DLNumber`), then `{N}` (the modern `driver-{N}-…`
 *      pattern). Pre-baking here means the locator does not need to
 *      know about legacy `{N+1}` at all.
 *   4. `_entity` is set to the per-index payload (e.g.
 *      `clientData.Drivers[index]`) so the atom executor can read
 *      `atom.source` against the entity slice instead of the full
 *      clientData. Applicant/co-applicant atoms have no `_entity` and
 *      continue to read from the root — backwards compatible.
 */
(function (global) {
    'use strict';

    /**
     * @param {Array}  baseAtoms  Registry array (e.g. driverAtoms).
     * @param {string} scopeKey   Scope key for scope-resolvers (e.g. 'driver').
     * @param {string} prefix     Short key-prefix (e.g. 'd', 'v', 'acc').
     * @param {number} index      Entity index (0-based).
     * @param {*}      [entity]   Optional per-entity payload snapshot.
     * @returns {Array}           New atom array with rewritten keys.
     */
    function expandEntityAtoms(baseAtoms, scopeKey, prefix, index, entity) {
        if (!Array.isArray(baseAtoms) || baseAtoms.length === 0) return [];
        const rename = (k) => `${prefix}${index}_${k}`;
        const localKeys = new Set(baseAtoms.map((a) => a.key));

        return baseAtoms.map((atom) => {
            const preconditions = Array.isArray(atom.preconditions)
                ? atom.preconditions.map((p) =>
                    (p && p.atom && localKeys.has(p.atom))
                        ? Object.assign({}, p, { atom: rename(p.atom) })
                        : p
                )
                : undefined;

            const idTemplate = atom.idTemplate
                ? String(atom.idTemplate)
                    .replace(/\{N\+1\}/g, String(index + 1))
                    .replace(/\{N\}/g, String(index))
                : atom.idTemplate;

            const out = Object.assign({}, atom, {
                key: rename(atom.key),
                scope: scopeKey,
                _index: index,
                idTemplate,
            });
            if (preconditions) out.preconditions = preconditions;
            if (entity !== undefined) out._entity = entity;
            return out;
        });
    }

    const api = { expandEntityAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.expandEntityAtoms = expandEntityAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
