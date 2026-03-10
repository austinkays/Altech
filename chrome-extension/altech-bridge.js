/**
 * Altech Bridge — Lightweight content script injected on altech-app.vercel.app
 *
 * Receives client data from the web app via postMessage and stores it
 * in chrome.storage.local so the extension popup can access it instantly.
 * This eliminates the clipboard copy/paste dance.
 */
(function () {
    'use strict';

    // Signal to the web app that the extension is installed
    document.documentElement.setAttribute('data-altech-extension', 'true');

    // Listen for client data from the web app
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;

        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        // Fired by auth.js immediately after Firestore confirms admin status —
        // no need to click "Send to Extension" to unlock admin tools in the popup.
        if (msg.type === 'ALTECH_ADMIN_UPDATE') {
            try {
                await chrome.storage.local.set({ isAdmin: msg.isAdmin === true });
                console.log('[Altech Bridge] Admin status updated:', msg.isAdmin);
            } catch (e) {
                console.warn('[Altech Bridge] Could not store admin status:', e.message);
            }
            return;
        }

        if (msg.type === 'ALTECH_CLIENT_DATA') {
            const clientData = msg.clientData;
            if (!clientData || typeof clientData !== 'object') {
                window.postMessage({ type: 'ALTECH_EXTENSION_ACK', success: false, error: 'Invalid data' }, '*');
                return;
            }

            try {
                // Store clientData + isAdmin flag (set by Firebase auth in the web app)
                const isAdmin = msg.isAdmin === true;
                await chrome.storage.local.set({ clientData, isAdmin });
                const fieldCount = Object.values(clientData).filter(v => v && String(v).trim()).length;
                window.postMessage({
                    type: 'ALTECH_EXTENSION_ACK',
                    success: true,
                    fieldCount,
                    isAdmin,
                    name: [clientData.FirstName, clientData.LastName].filter(Boolean).join(' ')
                }, '*');
            } catch (e) {
                window.postMessage({ type: 'ALTECH_EXTENSION_ACK', success: false, error: e.message }, '*');
            }
        }

        // ── Property Data from Extension → Web App (Direct Auto-Fill) ──
        // When extension scrapes Zillow and sends property data, forward to web app
        if (msg.type === 'ALTECH_PROPERTY_DATA') {
            const propertyData = msg.propertyData;
            if (!propertyData || !propertyData.data) {
                console.warn('[Altech Bridge] Invalid property data received');
                return;
            }

            // Forward to web app via window.postMessage
            window.postMessage({
                type: 'ALTECH_PROPERTY_DATA',
                propertyData: propertyData,
                timestamp: Date.now()
            }, '*');
            console.log('[Altech Bridge] Property data forwarded to web app:', propertyData.fieldCount, 'fields');
        }
    });

    // ── Bridge-Ready Handshake ──
    // Firebase auth (onAuthStateChanged) often fires BEFORE document_idle, meaning
    // the ALTECH_ADMIN_UPDATE message fires before this script is even listening.
    // Announcing "ready" causes auth.js to immediately re-send the current admin
    // state so we never miss it — regardless of which side initializes first.
    window.postMessage({ type: 'ALTECH_BRIDGE_READY' }, '*');
    console.log('[Altech Bridge] Injected — requesting admin status from auth.js');
})();
