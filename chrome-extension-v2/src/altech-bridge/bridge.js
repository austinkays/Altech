/**
 * Altech Bridge V2 — content script injected on altech.agency + altech-app.vercel.app
 *
 * Receives client data from the Altech web app via postMessage and stores it
 * in chrome.storage.local so the V2 extension popup can access it instantly.
 *
 * The message protocol (ALTECH_CLIENT_DATA / ALTECH_ADMIN_UPDATE /
 * ALTECH_BRIDGE_READY / ALTECH_EXTENSION_ACK) is reused verbatim from the
 * v0.7.2 bridge so the existing web-app auth + export flow keeps working
 * without any web-app changes.
 */
(function () {
    'use strict';

    // Signal to the web app that the extension is installed
    document.documentElement.setAttribute('data-altech-extension', 'true');
    document.documentElement.setAttribute('data-altech-extension-version', '2');

    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;

        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'ALTECH_ADMIN_UPDATE') {
            try {
                await chrome.storage.local.set({ isAdmin: msg.isAdmin === true });
            } catch (e) {
                console.warn('[AltechV2 Bridge] Could not store admin status:', e.message);
            }
            return;
        }

        if (msg.type === 'ALTECH_CLIENT_DATA') {
            const clientData = msg.clientData;
            if (!clientData || typeof clientData !== 'object') {
                window.postMessage(
                    { type: 'ALTECH_EXTENSION_ACK', success: false, error: 'Invalid data' },
                    '*'
                );
                return;
            }
            try {
                const isAdmin = msg.isAdmin === true;
                await chrome.storage.local.set({ clientData, isAdmin });
                const fieldCount = Object.values(clientData).filter(
                    (v) => v != null && String(v).trim().length > 0
                ).length;
                window.postMessage(
                    {
                        type: 'ALTECH_EXTENSION_ACK',
                        success: true,
                        fieldCount,
                        isAdmin,
                        name: [clientData.FirstName, clientData.LastName].filter(Boolean).join(' '),
                    },
                    '*'
                );
            } catch (e) {
                window.postMessage(
                    { type: 'ALTECH_EXTENSION_ACK', success: false, error: e.message },
                    '*'
                );
            }
        }
    });

    // Bridge-ready handshake — auth.js (altech-app) fires ALTECH_ADMIN_UPDATE
    // during onAuthStateChanged, which often races this script's injection.
    // Announcing ready causes it to re-send the current state.
    window.postMessage({ type: 'ALTECH_BRIDGE_READY', version: 2 }, '*');
})();
