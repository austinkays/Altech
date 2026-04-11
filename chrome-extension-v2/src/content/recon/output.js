/**
 * Altech EZLynx V2 — Recon output helpers
 *
 * Three output tiers used by recon features:
 *
 *   C3 — clipboard + file download
 *        Used by: Page Inventory, Registry Audit, Dry Run, Cascade Test,
 *                 Diff Registry
 *
 *   C5 — clipboard + file download + Firestore write
 *        Used by: Issue Capture only
 *
 * Firestore writes go through the background service worker to avoid
 * needing firebase scripts inside the content context.
 */
(function (global) {
    'use strict';

    /**
     * Copy a string to the clipboard via the async Clipboard API.
     * Falls back silently if the API is unavailable (e.g., in tests).
     * @param {string} text
     * @returns {Promise<void>}
     */
    async function copyToClipboard(text) {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard &&
                typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(text);
            }
        } catch (_) { /* non-fatal — clipboard may be blocked */ }
    }

    /**
     * Trigger a browser file download for the given text content.
     * No-ops in non-browser environments.
     * @param {string} text
     * @param {string} filename
     */
    function downloadAsFile(text, filename) {
        try {
            if (typeof document === 'undefined') return;
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'recon-output.json';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (_) { /* non-fatal */ }
    }

    /**
     * C3 — Copy JSON to clipboard AND trigger a file download.
     * @param {object|string} data     Object will be JSON.stringify'd with 2-space indent.
     * @param {string}        filename Download filename (e.g. 'page-inventory.json')
     * @returns {Promise<void>}
     */
    async function c3(data, filename) {
        const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        await copyToClipboard(text);
        downloadAsFile(text, filename || 'recon-output.json');
    }

    /**
     * C5 — Copy JSON to clipboard + download + write to Firestore.
     *
     * The Firestore write is relayed through the background service worker
     * via `chrome.runtime.sendMessage`. Silently no-ops if the service
     * worker isn't available (tests, non-extension contexts).
     *
     * @param {object|string} data
     * @param {string}        filename
     * @param {string}        [uid]     Firebase user UID; if absent Firestore write is skipped
     * @returns {Promise<void>}
     */
    async function c5(data, filename, uid) {
        const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        await copyToClipboard(text);
        downloadAsFile(text, filename || 'issue-capture.json');

        if (uid) {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime &&
                    typeof chrome.runtime.sendMessage === 'function') {
                    chrome.runtime.sendMessage({
                        type: 'ALTECH_RECON_ISSUE',
                        uid,
                        data: typeof data === 'string' ? JSON.parse(data) : data,
                        timestamp: new Date().toISOString(),
                    });
                }
            } catch (_) { /* non-fatal — Firestore write failure doesn't break capture */ }
        }
    }

    const api = { copyToClipboard, downloadAsFile, c3, c5 };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        global.AltechV2.recon.output = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
