/**
 * Altech EZLynx Filler V2 — Background Service Worker
 *
 * Slimmed replacement for v0.7.2's background.js. No remote schema fetch,
 * no defaultSchema import, no knownOptions. The V2 atom registries are
 * static and bundled with the content scripts.
 *
 * Responsibilities:
 *   1. Relay { type: 'ALTECH_V2_FILL' } from popup → active EZLynx tab
 *   2. Initialize storage on install (clientData: null, lastFillReport: null)
 *   3. Expose getActiveEzlynxTab helper to the popup
 */

importScripts('storage.js');

const { getKeys, setKeys } = self.AltechV2Storage;

// ── Install / update ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
    const existing = await getKeys(['clientData', 'lastFillReport', 'settings']);
    const updates = {};

    if (details.reason === 'install') {
        updates.clientData = existing.clientData ?? null;
        updates.lastFillReport = null;
        updates.settings = {
            autoShowToolbar: true,
            maxRetries: 3,
            retryDelayMs: 500,
            pollTimeoutMs: 5000,
        };
    } else if (!existing.settings) {
        updates.settings = {
            autoShowToolbar: true,
            maxRetries: 3,
            retryDelayMs: 500,
            pollTimeoutMs: 5000,
        };
    }

    if (Object.keys(updates).length > 0) {
        await setKeys(updates);
    }
    console.log('[AltechV2] Extension', details.reason, '— storage initialized');
});

// ── Message relay ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === 'ALTECH_V2_FILL_REQUEST') {
        // Popup → active tab: forward fill request to the content script
        (async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || !tab.id) {
                    sendResponse({ ok: false, error: 'No active tab' });
                    return;
                }
                const url = tab.url || '';
                if (!/ezlynx\.com/.test(url)) {
                    sendResponse({ ok: false, error: 'Active tab is not an EZLynx page' });
                    return;
                }
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: 'ALTECH_V2_FILL',
                    clientData: msg.clientData || null,
                });
                sendResponse({ ok: true, response });
            } catch (e) {
                sendResponse({ ok: false, error: String(e && e.message || e) });
            }
        })();
        return true; // async sendResponse
    }

    if (msg.type === 'ALTECH_V2_LAST_REPORT') {
        (async () => {
            const { lastFillReport } = await getKeys(['lastFillReport']);
            sendResponse({ ok: true, report: lastFillReport || null });
        })();
        return true;
    }

    if (msg.type === 'ALTECH_V2_REPORT') {
        // Content script → background: persist last fill report
        (async () => {
            await setKeys({ lastFillReport: msg.report || null });
            sendResponse({ ok: true });
        })();
        return true;
    }

    return false;
});
