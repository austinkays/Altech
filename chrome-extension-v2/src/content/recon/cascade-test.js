/**
 * Altech EZLynx V2 — Recon: Cascade Test (§11.4.5)
 *
 * Tests known parent→child cascade relationships by temporarily setting a
 * parent field to its "unlock trigger" value, waiting for the child to
 * become enabled, then restoring the parent.
 *
 * Only runs on routes explicitly marked `cascadeTestable: true` in the
 * route definitions, to avoid triggering autosave or form submission on
 * sensitive pages.
 *
 * Registry atoms that participate in a cascade should include:
 *   declaredCascades: [{ parent: 'industryId', trigger: 'Retired', child: 'occupationId' }]
 *
 * This metadata lives on the registry atom that IS the parent. The cascade
 * tester reads it from route atoms and runs each declared cascade.
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                getRegistry: require('../registries').getRegistry,
                detectRoute: require('../routes/router').detectRoute,
                waitEnabled: require('../waits/wait-enabled').waitEnabled,
            };
        }
        return {
            getRegistry: global.AltechV2.registries.getRegistry,
            detectRoute: global.AltechV2.routes.detectRoute,
            waitEnabled: global.AltechV2.waits.waitEnabled,
        };
    };

    /**
     * Check if the current route is marked cascadeTestable.
     * Falls back to true for unknown routes so we don't silently skip.
     */
    function isCascadeTestable(routeKey) {
        try {
            const defs = (typeof module !== 'undefined' && module.exports)
                ? require('../routes/route-definitions').routeDefinitions
                : (global.AltechV2.routes && global.AltechV2.routes.routeDefinitions);
            if (!defs) return false;
            const def = defs.find((d) => d.key === routeKey);
            return def ? !!def.cascadeTestable : false;
        } catch (_) { return false; }
    }

    /**
     * Set a simple text/input field value and fire input event.
     * For select-like elements, also fire change.
     */
    function setFieldValue(el, value) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement ? window.HTMLInputElement.prototype : {},
            'value'
        );
        if (nativeInputValueSetter && nativeInputValueSetter.set) {
            nativeInputValueSetter.set.call(el, value);
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Run a single cascade test.
     * @param {object} cascade  { parent, trigger, child }
     * @param {object} deps
     * @returns {Promise<object>}  { cascade, pass, failReason, durationMs }
     */
    async function runOneCascade(cascade, deps) {
        const parentEl = document.getElementById(cascade.parent);
        const childEl = document.getElementById(cascade.child);
        const start = Date.now();

        if (!parentEl) {
            return { cascade, pass: false, failReason: `parent element #${cascade.parent} not found`, durationMs: 0 };
        }
        if (!childEl) {
            return { cascade, pass: false, failReason: `child element #${cascade.child} not found`, durationMs: 0 };
        }

        const originalValue = parentEl.value;
        const wasDisabled = childEl.disabled;

        // If child is already enabled, record but don't fail — cascade might already be triggered.
        if (!wasDisabled) {
            return { cascade, pass: true, failReason: null, note: 'child already enabled', durationMs: 0 };
        }

        try {
            // Set the trigger value on the parent
            setFieldValue(parentEl, cascade.trigger);

            // Wait for child to become enabled (up to 5s)
            const enabled = await deps.waitEnabled('#' + CSS.escape(cascade.child), { timeoutMs: 5000 });
            const durationMs = Date.now() - start;

            if (!enabled) {
                // Restore parent
                setFieldValue(parentEl, originalValue);
                return { cascade, pass: false, failReason: 'child did not become enabled within 5s', durationMs };
            }

            // Restore parent
            setFieldValue(parentEl, originalValue);
            return { cascade, pass: true, failReason: null, durationMs };
        } catch (e) {
            setFieldValue(parentEl, originalValue);
            return { cascade, pass: false, failReason: e.message || 'exception', durationMs: Date.now() - start };
        }
    }

    /**
     * @param {string} routeKey
     * @param {object} [clientData]
     * @returns {Promise<object>}
     */
    async function runCascadeTest(routeKey, clientData) {
        const deps = getDeps();

        if (!isCascadeTestable(routeKey)) {
            return {
                route: routeKey,
                timestamp: new Date().toISOString(),
                skipped: true,
                reason: `Route '${routeKey}' is not marked cascadeTestable — skipped to avoid side effects`,
                results: [],
            };
        }

        // Collect declared cascades from registry atoms
        const atoms = deps.getRegistry(routeKey, clientData || {});
        const allCascades = [];
        for (const atom of atoms) {
            if (Array.isArray(atom.declaredCascades)) {
                for (const c of atom.declaredCascades) {
                    allCascades.push(c);
                }
            }
        }

        if (allCascades.length === 0) {
            return {
                route: routeKey,
                timestamp: new Date().toISOString(),
                skipped: false,
                reason: 'No declaredCascades found in registry atoms',
                results: [],
            };
        }

        const results = [];
        for (const cascade of allCascades) {
            const result = await runOneCascade(cascade, deps);
            results.push(result);
        }

        const passed = results.filter((r) => r.pass).length;
        const failed = results.filter((r) => !r.pass).length;

        return {
            route: routeKey,
            timestamp: new Date().toISOString(),
            skipped: false,
            summary: { total: results.length, passed, failed },
            results,
        };
    }

    const api = { runCascadeTest };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        global.AltechV2.recon.cascadeTest = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
