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
        running: false,
        ui: null,
    };

    async function loadClientData() {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(['clientData'], (r) => resolve((r && r.clientData) || null));
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

        state.ui.showReport(report);
        state.ui.setState('idle');
        state.running = false;

        try {
            chrome.runtime.sendMessage({ type: 'ALTECH_V2_REPORT', report });
        } catch (_) { /* service worker may be suspended — non-fatal */ }
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

    // Listen for popup-initiated fills via background relay.
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg || msg.type !== 'ALTECH_V2_FILL') return false;
        if (msg.clientData) state.clientData = msg.clientData;
        runFill().then(
            () => sendResponse({ ok: true }),
            (e) => sendResponse({ ok: false, error: String(e && e.message || e) })
        );
        return true; // async sendResponse
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }
})();
