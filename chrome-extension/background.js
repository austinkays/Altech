/**
 * Altech EZLynx Filler — Background Service Worker
 *
 * Handles message relay between popup ↔ content script
 * and manages extension lifecycle.
 */

// Import the built-in schema so it's available on install/update
importScripts('defaultSchema.js');

// ── Schema URL — fetched on every startup to auto-sync team schema ──
const SCHEMA_URL = 'https://altech.agency/ezlynx_schema.json';

// Set defaults on install/update — seed knownOptions with built-in schema
// Only set clientData, lastFillReport, and settings if they don't already exist
chrome.runtime.onInstalled.addListener(async (details) => {
    const store = await chrome.storage.local.get(['knownOptions', 'clientData', 'lastFillReport', 'settings']);

    // Merge built-in schema with any existing user scrapes (user data wins)
    const existing = store.knownOptions || {};
    const merged = { ...DEFAULT_SCHEMA, ...existing };

    const updates = { knownOptions: merged };

    // Only initialize these on fresh install — NOT on updates
    if (details.reason === 'install') {
        updates.clientData = null;
        updates.lastFillReport = null;
        updates.settings = {
            autoShowToolbar: true,
            fillDelay: 150,
            dropdownWait: 800
        };
    } else {
        // On update, only set settings if none exist yet
        if (!store.settings) {
            updates.settings = {
                autoShowToolbar: true,
                fillDelay: 150,
                dropdownWait: 800
            };
        }
    }

    await chrome.storage.local.set(updates);
    console.log(`[Altech] Extension ${details.reason} — ${Object.keys(merged).length} schema fields ready (${Object.keys(DEFAULT_SCHEMA).length} built-in + ${Object.keys(existing).length} user-scraped).`);

    // After install/update, also fetch latest schema from Vercel
    fetchRemoteSchema();


});

// ── Auto-sync schema from Vercel on every service worker startup ──
// This runs whenever the service worker wakes up (on extension click, message, alarm, etc.)
fetchRemoteSchema();

// ── Extension icon is enabled on ALL pages ──
// The popup works everywhere (property scraper, paste, etc.).
// The EZLynx fill toolbar (content.js) is still restricted to EZLynx pages via content_scripts in manifest.



async function fetchRemoteSchema() {
    try {
        const res = await fetch(SCHEMA_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const remote = await res.json();

        // Filter to only flat key→array entries (skip _pages metadata)
        const remoteSchema = {};
        for (const [k, v] of Object.entries(remote)) {
            if (k.startsWith('_')) continue; // skip _pages etc.
            if (Array.isArray(v) && v.length > 0) remoteSchema[k] = v;
        }

        if (Object.keys(remoteSchema).length === 0) return;

        // Merge: remote schema is the baseline, then overlay local user scrapes on top
        // This means admin-published schema is always applied, but local scrapes can add new fields
        const store = await chrome.storage.local.get('knownOptions');
        const existing = store.knownOptions || {};

        // Start with built-in defaults, layer remote on top, then local scrapes on top
        const merged = { ...DEFAULT_SCHEMA, ...remoteSchema, ...existing };

        // But for keys that exist in remote, merge their option arrays (add any new remote options)
        for (const [k, remoteOptions] of Object.entries(remoteSchema)) {
            if (existing[k] && Array.isArray(existing[k])) {
                // Combine: existing options + any new remote options not already present
                const existingSet = new Set(existing[k].map(o => String(o).toLowerCase()));
                const combined = [...existing[k]];
                for (const opt of remoteOptions) {
                    if (!existingSet.has(String(opt).toLowerCase())) {
                        combined.push(opt);
                    }
                }
                merged[k] = combined;
            }
        }

        await chrome.storage.local.set({ knownOptions: merged });
        console.log(`[Altech] Schema synced from Vercel — ${Object.keys(merged).length} total fields (${Object.keys(remoteSchema).length} from remote).`);
    } catch (e) {
        // Silent fail — extension works fine with built-in + local schema
        console.log(`[Altech] Remote schema fetch skipped: ${e.message}`);
    }
}

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
    // Validate sender — only accept messages from our extension or EZLynx pages
    const isExtension = sender.id === chrome.runtime.id;
    const isEzlynx = sender.url && sender.url.includes('ezlynx.com');
    if (!isExtension && !isEzlynx) {
        console.warn('[Altech] Rejected message from unknown sender:', sender.url);
        return;
    }

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
