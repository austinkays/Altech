/**
 * Altech EZLynx V2 — Content script entry point
 *
 * Runs at document_idle on every *.ezlynx.com page. Assumes all
 * AltechV2 sub-namespaces have already been populated by preceding
 * content_scripts entries in the manifest (see manifest.json for the
 * strict load order).
 *
 * Responsibilities:
 *   1. Install the SPA nav-detector so route changes refresh the toolbar.
 *   2. Mount the shadow-DOM toolbar.
 *   3. Wire the Fill button to the orchestrator.
 *   4. Listen for ALTECH_V2_FILL messages from the popup.
 *   5. Persist the last fill report back to background storage.
 *   6. Handle ALTECH_V2_RECON messages from popup / toolbar button relay.
 *   7. Handle ALTECH_V2_RECON_OPEN messages (Phase 4 — popup "Open Recon
 *      Tool" button) → toggle the on-page toolbar recon panel.
 *
 * Note on keyboard shortcut: Ctrl+Shift+A is wired via chrome.commands in
 * manifest.json + a background/service-worker.js listener that dispatches
 * ALTECH_V2_FILL to the active tab. Using chrome.commands instead of a
 * document keydown handler means the shortcut works even when focus is
 * inside an Angular mat-input (the Material CDK can swallow plain page
 * keydown events, but chrome.commands fires at the browser level).
 */
(function () {
    'use strict';

    if (window.__ALTECH_V2_CONTENT_INSTALLED__) return;
    window.__ALTECH_V2_CONTENT_INSTALLED__ = true;

    const V = window.AltechV2;
    if (!V) {
        console.error('[AltechV2] namespace missing — manifest load order broken');
        return;
    }

    const state = {
        routeKey: V.routes.detectRoute(window.location.href),
        clientData: null,
        uid: null,
        running: false,
        ui: null,
        lastTrace: null,
    };

    async function loadClientData() {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(['clientData', 'uid'], (r) => {
                    if (r && r.uid) state.uid = r.uid;
                    resolve((r && r.clientData) || null);
                });
            } catch (_) { resolve(null); }
        });
    }

    async function runFill() {
        if (state.running) return;
        state.running = true;
        state.ui.setState('running');

        const clientData = state.clientData || (await loadClientData());
        state.clientData = clientData;

        const report = await V.orchestrator.run(state.routeKey, clientData || {}, {
            onProgress(i, total, atom) {
                state.ui.setProgress(i, total, atom && atom.key);
            },
        });

        // Persist the last trace for Issue Capture
        state.lastTrace = report;

        state.ui.showReport(report);
        state.ui.setState('idle');
        state.running = false;

        try {
            chrome.runtime.sendMessage({ type: 'ALTECH_V2_REPORT', report });
        } catch (_) { /* service worker may be suspended — non-fatal */ }
    }

    async function runRecon(feature) {
        if (!V.recon || typeof V.recon.run !== 'function') {
            return { ok: false, error: 'Recon module not loaded' };
        }
        try {
            const result = await V.recon.run(feature, {
                routeKey: state.routeKey,
                clientData: state.clientData,
                lastTrace: state.lastTrace,
                uid: state.uid,
            });
            // Return a compact summary (not the full result, which may be huge)
            const summary = result.summary || result.counts || result.atomCount || null;
            return { ok: true, summary };
        } catch (e) {
            return { ok: false, error: e && e.message || String(e) };
        }
    }

    function onRouteChange(url) {
        state.routeKey = V.routes.detectRoute(url);
        if (state.ui) state.ui.setRoute(state.routeKey);
    }

    function bootstrap() {
        V.spa.install(onRouteChange);
        state.ui = V.ui.toolbar.mount({
            onMounted(ui) {
                ui.setRoute(state.routeKey);
                ui.onFillClick(runFill);
            },
        });
        // Pre-load client data so we don't stall on first click.
        loadClientData().then((cd) => { state.clientData = cd; });
    }

    // Listen for messages from popup / background relay.
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg) return false;

        if (msg.type === 'ALTECH_V2_FILL') {
            if (msg.clientData) state.clientData = msg.clientData;
            runFill().then(
                () => sendResponse({ ok: true }),
                (e) => sendResponse({ ok: false, error: String(e && e.message || e) })
            );
            return true; // async sendResponse
        }

        if (msg.type === 'ALTECH_V2_RECON') {
            runRecon(msg.feature).then(sendResponse);
            return true; // async sendResponse
        }

        if (msg.type === 'ALTECH_V2_RECON_OPEN') {
            // Phase 4 — popup "Open Recon Tool" button. Toggles the shadow
            // toolbar recon panel. Only meaningful for admin users; the UI
            // gate lives inside toolbar.toggleReconPanel().
            if (state.ui && typeof state.ui.toggleReconPanel === 'function') {
                state.ui.toggleReconPanel();
                sendResponse({ ok: true });
            } else {
                sendResponse({ ok: false, error: 'Toolbar not mounted' });
            }
            return false;
        }

        return false;
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }
})();
