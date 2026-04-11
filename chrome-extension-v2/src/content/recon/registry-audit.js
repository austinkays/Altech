/**
 * Altech EZLynx V2 — Recon: Registry Audit (§11.4.2)
 *
 * For the current route, iterates every atom in its registry and checks
 * each one against the live DOM. Also walks the page for labeled fields
 * that match no atom — these are "Unknown" additions EZLynx made without
 * a corresponding registry entry.
 *
 * Status codes:
 *   RESOLVED           — element exists, not disabled, not LexisNexis-locked
 *   CONDITIONALLY_SKIPPED — element exists but is disabled (expected — e.g., DL status)
 *   LEXIS_NEXIS_LOCKED — element exists and disabled, LexisNexis text in 3 ancestors
 *   MISSING            — atom's id does not resolve to any element
 *   UNKNOWN            — page field has id that matches no atom in registry
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                getRegistry: require('../registries').getRegistry,
                findScoped: require('../locator/find-scoped').findScoped,
                findById: require('../locator/find-by-id').findById,
            };
        }
        return {
            getRegistry: global.AltechV2.registries.getRegistry,
            findScoped: global.AltechV2.locator.findScoped,
            findById: global.AltechV2.locator.findById,
        };
    };

    /** Mirror of atom-executor's private isLexisNexisLocked — checks 3 ancestors. */
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
     * Audit a single atom and return its status entry.
     * @param {object} atom
     * @param {object} deps
     * @returns {object}  { key, label, idTemplate, status, elementId, classes, disabled }
     */
    function auditAtom(atom, deps) {
        const ctx = {};
        let el = null;
        try {
            el = deps.findScoped(atom, ctx);
            if (!el && atom.idTemplate) {
                // Last-resort direct id lookup (no scope, no placeholder resolution)
                el = document.getElementById(atom.idTemplate);
            }
        } catch (_) { /* locator error → treat as missing */ }

        const entry = {
            key: atom.key,
            label: atom.label || atom.key,
            idTemplate: atom.idTemplate,
            status: null,
            elementId: el ? el.id : null,
            classes: el ? Array.from(el.classList) : [],
            disabled: el ? el.disabled : null,
        };

        if (!el) {
            entry.status = 'MISSING';
            return entry;
        }

        if (isLexisNexisLocked(el)) {
            entry.status = 'LEXIS_NEXIS_LOCKED';
            return entry;
        }

        if (el.disabled) {
            entry.status = 'CONDITIONALLY_SKIPPED';
            return entry;
        }

        entry.status = 'RESOLVED';
        return entry;
    }

    /**
     * Walk labeled form fields on the page and collect their ids.
     * Used to detect fields not covered by any registry atom.
     */
    function collectPageFieldIds() {
        const ids = new Set();
        const els = document.querySelectorAll('input, select, textarea, mat-select, mat-slide-toggle, mat-radio-group');
        for (const el of els) {
            if (el.id && el.type !== 'hidden') ids.add(el.id);
        }
        return ids;
    }

    /**
     * @param {string} routeKey
     * @param {object} [clientData]
     * @returns {object}  { route, timestamp, atoms: [], unknown: [] }
     */
    function runRegistryAudit(routeKey, clientData) {
        const deps = getDeps();
        const atoms = deps.getRegistry(routeKey, clientData || {});

        // Per-atom audit
        const auditedAtoms = atoms.map((atom) => auditAtom(atom, deps));

        // Build set of all atom ids for unknown-field detection
        const registryIds = new Set(atoms.map((a) => a.idTemplate).filter(Boolean));

        // Unknown fields: page has them, registry doesn't
        const pageIds = collectPageFieldIds();
        const unknownIds = [];
        for (const id of pageIds) {
            if (!registryIds.has(id)) unknownIds.push(id);
        }

        const counts = {
            RESOLVED: 0, CONDITIONALLY_SKIPPED: 0, LEXIS_NEXIS_LOCKED: 0, MISSING: 0,
        };
        for (const a of auditedAtoms) {
            if (counts[a.status] !== undefined) counts[a.status]++;
        }

        return {
            route: routeKey,
            timestamp: new Date().toISOString(),
            atomCount: atoms.length,
            counts,
            atoms: auditedAtoms,
            unknown: unknownIds,
        };
    }

    const api = { runRegistryAudit };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        global.AltechV2.recon.registryAudit = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
