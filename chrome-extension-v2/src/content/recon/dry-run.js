/**
 * Altech EZLynx V2 — Recon: Dry Run (§11.4.3)
 *
 * Simulates a full fill pass without actually touching the DOM. For each
 * atom in the current route's registry:
 *
 *   1. Locate the element (read-only)
 *   2. Run precheck (disabled / LexisNexis locked)
 *   3. Read + transform the source value
 *   4. Describe what WOULD happen ("would fill ... via ... primitive")
 *
 * No fill primitive is ever called. The DOM is read but never written.
 *
 * Output: markdown table (one row per atom) via c3()
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                getRegistry: require('../registries').getRegistry,
                topoSort: require('../orchestrator/dependency-graph').topoSort,
                findScoped: require('../locator/find-scoped').findScoped,
                expand: require('../transforms/abbreviations').expand,
            };
        }
        return {
            getRegistry: global.AltechV2.registries.getRegistry,
            topoSort: global.AltechV2.orchestrator.topoSort,
            findScoped: global.AltechV2.locator.findScoped,
            expand: global.AltechV2.transforms.abbreviations.expand,
        };
    };

    /** Walk dot-notation path in data object. */
    function readSource(data, path) {
        if (!data || !path) return undefined;
        const parts = String(path).split('.');
        let cur = data;
        for (const p of parts) {
            if (cur == null) return undefined;
            cur = cur[p];
        }
        return cur;
    }

    function isLexisNexisLocked(el) {
        if (!el || !el.disabled) return false;
        let host = el.parentElement;
        for (let i = 0; i < 3 && host; i++) {
            if (/LexisNexis/i.test(host.textContent || '')) return true;
            host = host.parentElement;
        }
        return false;
    }

    /**
     * Simulate one atom and return a dry-run row object.
     * @param {object} atom
     * @param {object} clientData
     * @param {Set}    terminalState  Keys that reached DONE in prior steps
     * @param {object} deps
     * @returns {object}  { key, label, idTemplate, action, reason, value }
     */
    function simulateAtom(atom, clientData, terminalState, deps) {
        // BLOCKED check
        const preconds = Array.isArray(atom.preconditions) ? atom.preconditions : [];
        for (const p of preconds) {
            if (p.state === 'DONE' && !terminalState.has(p.atom)) {
                return { key: atom.key, label: atom.label || atom.key, idTemplate: atom.idTemplate,
                    action: 'BLOCKED', reason: `precondition '${p.atom}' not DONE`, value: null };
            }
        }

        // LOCATE
        let el = null;
        try {
            el = deps.findScoped(atom, {});
            if (!el && atom.idTemplate) el = document.getElementById(atom.idTemplate);
        } catch (_) { /* ignore */ }

        if (!el) {
            return { key: atom.key, label: atom.label || atom.key, idTemplate: atom.idTemplate,
                action: 'SKIP', reason: 'element not found', value: null };
        }

        // PRECHECK
        if (isLexisNexisLocked(el)) {
            return { key: atom.key, label: atom.label || atom.key, idTemplate: atom.idTemplate,
                action: 'SKIP', reason: 'LexisNexis locked', value: null };
        }
        if (el.disabled) {
            return { key: atom.key, label: atom.label || atom.key, idTemplate: atom.idTemplate,
                action: 'SKIP', reason: 'element disabled', value: null };
        }

        // SOURCE VALUE
        const raw = readSource(clientData, atom.source);
        if (raw == null || String(raw).trim() === '') {
            return { key: atom.key, label: atom.label || atom.key, idTemplate: atom.idTemplate,
                action: 'SKIP', reason: 'no source value', value: null };
        }

        // TRANSFORM (expand abbreviations for text types)
        let value = String(raw);
        if ((atom.type === 'text' || !atom.type) && atom.abbreviationExpand !== false) {
            try { value = deps.expand(value) || value; } catch (_) { /* non-critical */ }
        }

        return {
            key: atom.key,
            label: atom.label || atom.key,
            idTemplate: atom.idTemplate,
            action: 'FILL',
            reason: `via ${atom.type || 'text'} primitive, verify via ${atom.verify || 'ng-valid'}`,
            value,
        };
    }

    /**
     * @param {string} routeKey
     * @param {object} [clientData]
     * @returns {object}  { route, timestamp, rows: [], summary }
     */
    function runDryRun(routeKey, clientData) {
        const deps = getDeps();
        const raw = deps.getRegistry(routeKey, clientData || {});

        let sorted;
        try {
            sorted = deps.topoSort(raw);
        } catch (_) {
            sorted = raw;
        }

        const terminalDone = new Set();
        const rows = [];

        for (const atom of sorted) {
            const row = simulateAtom(atom, clientData || {}, terminalDone, deps);
            rows.push(row);
            if (row.action === 'FILL') terminalDone.add(atom.key);
        }

        const fillCount = rows.filter((r) => r.action === 'FILL').length;
        const skipCount = rows.filter((r) => r.action === 'SKIP').length;
        const blockCount = rows.filter((r) => r.action === 'BLOCKED').length;

        // Render as markdown table
        const lines = [
            `# Dry Run — ${routeKey}`,
            ``,
            `**${new Date().toISOString()}** | ${rows.length} atoms | ✅ ${fillCount} fill · ⏭ ${skipCount} skip · 🚫 ${blockCount} blocked`,
            ``,
            `| # | Key | Label | Id | Action | Reason | Value |`,
            `|---|-----|-------|-----|--------|--------|-------|`,
        ];
        rows.forEach((r, i) => {
            const icon = r.action === 'FILL' ? '✅' : r.action === 'SKIP' ? '⏭' : '🚫';
            const val = r.value != null ? r.value.toString().slice(0, 40) : '—';
            lines.push(`| ${i + 1} | \`${r.key}\` | ${r.label} | \`${r.idTemplate || '—'}\` | ${icon} ${r.action} | ${r.reason} | ${val} |`);
        });

        return {
            route: routeKey,
            timestamp: new Date().toISOString(),
            rows,
            summary: { total: rows.length, fill: fillCount, skip: skipCount, blocked: blockCount },
            markdown: lines.join('\n'),
        };
    }

    const api = { runDryRun };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        global.AltechV2.recon.dryRun = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
