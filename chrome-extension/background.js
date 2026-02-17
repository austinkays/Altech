/**
 * Altech EZLynx Filler — Background Service Worker
 *
 * Handles message relay between popup ↔ content script
 * and manages extension lifecycle.
 */

// Set defaults on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        clientData: null,
        lastFillReport: null,
        settings: {
            autoShowToolbar: true,
            fillDelay: 150,
            dropdownWait: 800
        }
    });
    console.log('[Altech] Extension installed — ready to fill EZLynx forms.');
});

// Inject content script programmatically if it's not already loaded
async function ensureContentScript(tabId) {
    try {
        await chrome.tabs.sendMessage(tabId, { type: 'ping' });
        return true; // already loaded
    } catch (e) {
        // Not loaded — inject it
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
            // Wait a moment for the script to initialize
            await new Promise(r => setTimeout(r, 500));
            return true;
        } catch (injErr) {
            console.warn('[Altech] Failed to inject content script:', injErr.message);
            return false;
        }
    }
}

// Relay messages between popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'fillPage') {
        // Popup asks to fill the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs[0]) {
                sendResponse({ error: 'No active tab' });
                return;
            }
            // Ensure content script is injected
            const injected = await ensureContentScript(tabs[0].id);
            if (!injected) {
                sendResponse({ error: 'Could not inject filler script. Make sure you\'re on an EZLynx page.' });
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, msg, (response) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: 'Content script not responding. Try refreshing the EZLynx page.' });
                } else {
                    sendResponse(response);
                }
            });
        });
        return true; // async
    }

    if (msg.type === 'getPageInfo') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs[0]) {
                sendResponse({ page: 'unknown', url: '' });
                return;
            }
            // Try to talk to content script, inject if needed
            const injected = await ensureContentScript(tabs[0].id);
            if (!injected) {
                // Can't inject — check URL directly
                const url = (tabs[0].url || '').toLowerCase();
                if (url.includes('ezlynx.com')) {
                    sendResponse({ page: 'ezlynx', url: tabs[0].url });
                } else {
                    sendResponse({ page: 'not-ezlynx', url: tabs[0].url || '' });
                }
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { type: 'getPageInfo' }, (response) => {
                if (chrome.runtime.lastError) {
                    const url = (tabs[0].url || '').toLowerCase();
                    sendResponse({ page: url.includes('ezlynx.com') ? 'ezlynx' : 'not-ezlynx', url: tabs[0].url || '' });
                } else {
                    sendResponse(response);
                }
            });
        });
        return true;
    }

    if (msg.type === 'scrapePage') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs[0]) {
                sendResponse({ error: 'No active tab' });
                return;
            }
            const injected = await ensureContentScript(tabs[0].id);
            if (!injected) {
                sendResponse({ error: 'Could not inject scraper. Make sure you\'re on an EZLynx page.' });
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { type: 'scrapePage' }, (response) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: 'Scraper failed. Try refreshing the page.' });
                } else {
                    sendResponse(response);
                }
            });
        });
        return true;
    }

    // ── Property Scraper: inject property-scraper.js into any page ──
    if (msg.type === 'scrapeProperty') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs[0]) {
                sendResponse({ error: 'No active tab' });
                return;
            }
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['property-scraper.js']
                });
                const result = results?.[0]?.result;
                if (result) {
                    // Store latest property scrape in extension storage
                    await chrome.storage.local.set({ propertyData: result });
                    sendResponse(result);
                } else {
                    sendResponse({ error: 'No data returned from property scraper.' });
                }
            } catch (e) {
                console.warn('[Altech] Property scrape failed:', e.message);
                sendResponse({ error: `Could not scrape this page: ${e.message}` });
            }
        });
        return true;
    }

    // ── Get stored property data ──
    if (msg.type === 'getPropertyData') {
        chrome.storage.local.get('propertyData', (result) => {
            sendResponse(result.propertyData || null);
        });
        return true;
    }
});
