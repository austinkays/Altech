/**
 * Altech EZLynx V2 — Recon: Diff Registry vs Page (§11.4.6)
 *
 * Compares the current route's registry atoms against every labeled form
 * field present in the live DOM. Three-way result:
 *
 *   tracked  — field is in registry AND on page
 *   stale    — field is in registry BUT NOT on page (EZLynx may have changed the id)
 *   new      — field is on page BUT NOT in registry (EZLynx added a new field)
 *
 * Output via c3() — clipboard + file.
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                getRegistry: require('../registries').getRegistry,
            };
        }
        return {
            getRegistry: global.AltechV2.registries.getRegistry,
        };
    };

    /** Collect all labeled form field ids from the live page. */
    function collectPageFields() {
        const fields = [];
        const els = document.querySelectorAll(
            'input:not([type="hidden"]), select, textarea, mat-select, mat-slide-toggle, mat-radio-group'
        );
        for (const el of els) {
            if (!el.id) continue;
            let label = '';
            // Nearest mat-label
            const mf = el.closest('mat-form-field');
            if (mf) {
                const ml = mf.querySelector('mat-label, label');
                if (ml) label = ml.textContent.trim();
            }
            if (!label && el.getAttribute('aria-label')) label = el.getAttribute('aria-label');
            if (!label && el.placeholder) label = el.placeholder;
            fields.push({ id: el.id, label, tag: el.tagName, disabled: el.disabled });
        }
        return fields;
    }

    /**
     * @param {string} routeKey
     * @param {object} [clientData]
     * @returns {object}  { route, timestamp, tracked, stale, new }
     */
    function runDiffRegistry(routeKey, clientData) {
        const deps = getDeps();
        const atoms = deps.getRegistry(routeKey, clientData || {});

        // Registry atom ids — only include ids without placeholders (no {N} etc.)
        const registryEntries = atoms.map((a) => ({
            key: a.key,
            label: a.label || a.key,
            idTemplate: a.idTemplate,
            hasPlaceholder: a.idTemplate ? /\{/.test(a.idTemplate) : false,
        }));

        const pageFields = collectPageFields();
        const pageIdMap = new Map(pageFields.map((f) => [f.id, f]));
        const registryIdMap = new Map(
            registryEntries.filter((e) => e.idTemplate && !e.hasPlaceholder)
                .map((e) => [e.idTemplate, e])
        );

        const tracked = [];
        const stale = [];
        const newFields = [];

        // Registry entries → tracked or stale
        for (const [id, entry] of registryIdMap) {
            if (pageIdMap.has(id)) {
                tracked.push({ key: entry.key, label: entry.label, id });
            } else {
                stale.push({ key: entry.key, label: entry.label, id });
            }
        }

        // Placeholder atoms — note them separately (can't diff without N)
        const placeholderAtoms = registryEntries.filter((e) => e.hasPlaceholder);

        // Page fields not in registry
        for (const [id, field] of pageIdMap) {
            if (!registryIdMap.has(id)) {
                newFields.push({ id, label: field.label, tag: field.tag });
            }
        }

        return {
            route: routeKey,
            timestamp: new Date().toISOString(),
            summary: {
                tracked: tracked.length,
                stale: stale.length,
                new: newFields.length,
                placeholder: placeholderAtoms.length,
            },
            tracked,
            stale,
            new: newFields,
            placeholderAtoms: placeholderAtoms.map((e) => ({ key: e.key, label: e.label, idTemplate: e.idTemplate })),
        };
    }

    const api = { runDiffRegistry };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        global.AltechV2.recon.diffRegistry = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
