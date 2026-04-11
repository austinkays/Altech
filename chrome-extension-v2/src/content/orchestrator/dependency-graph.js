/**
 * Altech EZLynx V2 — Dependency graph
 *
 * Pure function. Input: an array of atoms with optional `preconditions`
 * (a list of `{ atom: <key>, state?: 'DONE' }`). Output: the same array
 * in topological order so every atom's precondition keys appear before
 * the atom itself.
 *
 * Throws on:
 *   - cycles
 *   - references to non-existent atom keys
 *   - duplicate atom keys
 *
 * The registry integrity test depends on all three of these throws.
 */
(function (global) {
    'use strict';

    class DependencyGraphError extends Error {
        constructor(message, detail) {
            super(message);
            this.name = 'DependencyGraphError';
            this.detail = detail || null;
        }
    }

    /**
     * @param {Array} atoms  Each atom: { key, preconditions?: [{atom: <key>}] }
     * @returns {Array}      Same atoms, reordered
     */
    function topoSort(atoms) {
        if (!Array.isArray(atoms)) throw new DependencyGraphError('atoms must be an array');
        if (atoms.length === 0) return [];

        // 1. Check for duplicate keys.
        const byKey = new Map();
        for (const a of atoms) {
            if (!a || !a.key) throw new DependencyGraphError('atom missing key', { atom: a });
            if (byKey.has(a.key)) throw new DependencyGraphError('duplicate atom key: ' + a.key);
            byKey.set(a.key, a);
        }

        // 2. Build edges and check all references exist.
        const deps = new Map(); // key → Set<key>
        const dependents = new Map(); // key → Set<key>
        for (const a of atoms) {
            deps.set(a.key, new Set());
            dependents.set(a.key, new Set());
        }
        for (const a of atoms) {
            const preconds = Array.isArray(a.preconditions) ? a.preconditions : [];
            for (const p of preconds) {
                const ref = p && p.atom;
                if (!ref) continue;
                if (!byKey.has(ref)) {
                    throw new DependencyGraphError(
                        'precondition references unknown atom: ' + a.key + ' → ' + ref,
                        { atom: a.key, missing: ref }
                    );
                }
                if (ref === a.key) {
                    throw new DependencyGraphError('atom depends on itself: ' + a.key);
                }
                deps.get(a.key).add(ref);
                dependents.get(ref).add(a.key);
            }
        }

        // 3. Kahn's algorithm.
        const inDegree = new Map();
        for (const a of atoms) inDegree.set(a.key, deps.get(a.key).size);
        const queue = [];
        for (const a of atoms) if (inDegree.get(a.key) === 0) queue.push(a.key);

        const sortedKeys = [];
        while (queue.length > 0) {
            const k = queue.shift();
            sortedKeys.push(k);
            for (const d of dependents.get(k)) {
                inDegree.set(d, inDegree.get(d) - 1);
                if (inDegree.get(d) === 0) queue.push(d);
            }
        }

        if (sortedKeys.length !== atoms.length) {
            const cycleNodes = atoms
                .filter((a) => !sortedKeys.includes(a.key))
                .map((a) => a.key);
            throw new DependencyGraphError('cycle detected in dependency graph', { cycleNodes });
        }

        return sortedKeys.map((k) => byKey.get(k));
    }

    const api = { topoSort, DependencyGraphError };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.orchestrator.topoSort = topoSort;
        global.AltechV2.orchestrator.DependencyGraphError = DependencyGraphError;
    }
})(typeof window !== 'undefined' ? window : globalThis);
