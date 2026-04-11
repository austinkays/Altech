/**
 * Altech EZLynx V2 — Recon: Issue Capture (§11.4.4)
 *
 * One-click diagnostic snapshot. Captures everything needed to diagnose a
 * production fill failure without live site access:
 *
 *   - Route + URL + page title + timestamp
 *   - Registry atom list for the current route
 *   - Per-atom: locator result, element classes, disabled/readonly, current
 *     value (PII-redacted), nearby mat-error text
 *   - Most recent fill trace (if available)
 *   - clientData keys present (values omitted)
 *   - SHA-256 hash of document.body.outerHTML
 *   - Browser / extension version
 *
 * Output via c5() — clipboard + file + Firestore write to
 *   users/{uid}/reconReports/{timestamp}
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                getRegistry: require('../registries').getRegistry,
                findScoped: require('../locator/find-scoped').findScoped,
                redactIfPii: require('./pii-redactor').redactIfPii,
                c5: require('./output').c5,
            };
        }
        return {
            getRegistry: global.AltechV2.registries.getRegistry,
            findScoped: global.AltechV2.locator.findScoped,
            redactIfPii: global.AltechV2.recon.piiRedactor.redactIfPii,
            c5: global.AltechV2.recon.output.c5,
        };
    };

    /** Collect mat-error text near an element (searches up to 3 ancestor levels). */
    function collectMatErrors(el) {
        if (!el) return [];
        let host = el.closest('mat-form-field') || el.parentElement;
        const errors = [];
        for (let i = 0; i < 3 && host; i++) {
            host.querySelectorAll('mat-error').forEach((e) => {
                const text = e.textContent.trim();
                if (text) errors.push(text);
            });
            if (errors.length > 0) break;
            host = host.parentElement;
        }
        return errors;
    }

    /** Snapshot a single atom for the report. */
    function snapshotAtom(atom, deps) {
        const ctx = {};
        let el = null;
        try {
            el = deps.findScoped(atom, ctx);
            if (!el && atom.idTemplate) el = document.getElementById(atom.idTemplate);
        } catch (_) { /* ignore */ }

        const raw = el ? el.value : null;
        const redacted = raw != null ? deps.redactIfPii(atom.source, raw) : null;

        return {
            key: atom.key,
            source: atom.source,
            idTemplate: atom.idTemplate,
            found: !!el,
            elementId: el ? el.id : null,
            classes: el ? Array.from(el.classList) : [],
            disabled: el ? !!el.disabled : null,
            readonly: el ? (!!el.readOnly || el.hasAttribute('readonly')) : null,
            value: redacted,
            matErrors: el ? collectMatErrors(el) : [],
        };
    }

    /**
     * Compute SHA-256 of a string via crypto.subtle (available in MV3 content scripts).
     * Returns hex string or null if unavailable.
     */
    async function sha256(text) {
        try {
            if (typeof crypto === 'undefined' || !crypto.subtle) return null;
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
        } catch (_) { return null; }
    }

    /**
     * @param {string} routeKey
     * @param {object} [clientData]
     * @param {object} [lastTrace]   FillTrace report from last orchestrator.run()
     * @param {string} [uid]         Firebase user UID for Firestore persistence
     * @returns {Promise<object>}    The full capture object
     */
    async function runIssueCapture(routeKey, clientData, lastTrace, uid) {
        const deps = getDeps();
        const atoms = deps.getRegistry(routeKey, clientData || {});
        const atomSnapshots = atoms.map((a) => snapshotAtom(a, deps));

        const bodyHash = await sha256(document.body ? document.body.outerHTML : '');

        const clientKeys = clientData ? Object.keys(clientData).filter((k) => {
            const v = clientData[k];
            return v != null && String(v).trim().length > 0;
        }) : [];

        let extVersion = null;
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                extVersion = chrome.runtime.getManifest().version;
            }
        } catch (_) { /* non-critical */ }

        const capture = {
            route: routeKey,
            url: typeof window !== 'undefined' ? window.location.href : null,
            title: typeof document !== 'undefined' ? document.title : null,
            timestamp: new Date().toISOString(),
            extVersion,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            bodyHash,
            clientDataKeys: clientKeys,
            atomCount: atoms.length,
            atoms: atomSnapshots,
            lastTrace: lastTrace || null,
        };

        const filename = `issue-capture-${routeKey}-${Date.now()}.json`;
        await deps.c5(capture, filename, uid || null);
        return capture;
    }

    const api = { runIssueCapture };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        global.AltechV2.recon.issueCapture = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
