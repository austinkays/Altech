/**
 * Altech EZLynx Filler — Popup Script
 *
 * Manages client data loading (from clipboard), displays status,
 * and sends fill commands to the content script.
 */

const $ = id => document.getElementById(id);

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    // Show version from manifest
    const manifest = chrome.runtime.getManifest();
    const versionEl = $('extVersion');
    if (versionEl && manifest.version) versionEl.textContent = `v${manifest.version}`;

    await refreshUI();
    checkPage();
    loadStoredPropertyData();
    await checkAdminStatus();
    initTheme();

    $('themeToggle').addEventListener('click', toggleTheme);
    $('pasteBtn').addEventListener('click', pasteFromClipboard);
    $('fillBtn').addEventListener('click', () => sendFill());
    $('refillBtn').addEventListener('click', () => sendFill());
    $('clearBtn').addEventListener('click', clearData);
    $('manualPasteBtn').addEventListener('click', loadManualPaste);
    $('copyPropBtn').addEventListener('click', copyPropertyToClipboard);
    $('clearPropBtn').addEventListener('click', clearPropertyData);

    // Admin toggle — just toggles visibility when already unlocked
    $('adminToggle').addEventListener('click', () => {
        const zone = $('adminZone');
        if (zone.classList.contains('visible')) {
            zone.classList.remove('visible');
            $('adminToggle').textContent = '🔓 Admin Tools';
        } else {
            zone.classList.add('visible');
            $('adminToggle').textContent = '🔓 Admin Tools ▲';
            loadSchemaStats();
        }
    });
});

// ── Admin Auth (role-based via isAdmin flag from Altech web app) ──
async function checkAdminStatus() {
    try {
        const { isAdmin } = await chrome.storage.local.get('isAdmin');
        if (isAdmin === true) {
            unlockAdmin();
        }
    } catch (e) {
        console.warn('[Altech Popup] Could not check admin status:', e.message);
    }
}

// Live-update: if isAdmin arrives in storage while the popup is already open
// (e.g. the bridge just injected and received the handshake), unlock immediately.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.isAdmin && changes.isAdmin.newValue === true) {
        unlockAdmin();
    }
});

let _adminUnlocked = false;
function unlockAdmin() {
    if (_adminUnlocked) return; // Prevent duplicate event listener registration
    _adminUnlocked = true;
    const toggle = $('adminToggle');
    const zone = $('adminZone');
    toggle.classList.add('visible');
    toggle.textContent = '🔓 Admin Tools';
    zone.classList.add('visible');
    loadSchemaStats();
    // Wire admin buttons (only after unlock)
    $('scrapeBtn').addEventListener('click', scrapeCurrentPage);
    $('propertyBtn').addEventListener('click', scrapePropertyData);
    $('exportSchemaBtn').addEventListener('click', exportSchema);
}

// ── Theme Management (dark / light, persisted via chrome.storage.local) ──
async function initTheme() {
    try {
        const { darkMode } = await chrome.storage.local.get('darkMode');
        // Default to system preference if no stored preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const useDark = darkMode !== undefined ? darkMode === true : prefersDark;
        applyTheme(useDark);
    } catch (e) {
        // Fallback to system preference
        applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
}

function applyTheme(dark) {
    document.body.classList.toggle('dark', dark);
    $('themeToggle').textContent = dark ? '☀️' : '🌙';
    $('themeToggle').title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    // Style the clipboard paste button to match theme
    const pasteBtn = $('pasteBtn');
    if (pasteBtn) {
        pasteBtn.style.background = dark ? '#3a3a3c' : '#f2f2f7';
        pasteBtn.style.color = dark ? '#0a84ff' : '#007AFF';
    }
}

async function toggleTheme() {
    const isDark = document.body.classList.contains('dark');
    applyTheme(!isDark);
    try {
        await chrome.storage.local.set({ darkMode: !isDark });
    } catch (e) { /* storage unavailable */ }
}


async function refreshUI() {
    const { clientData } = await chrome.storage.local.get('clientData');
    const nameEl = $('clientName');
    const fieldsEl = $('clientFields');
    const fillBtn = $('fillBtn');
    const refillBtn = $('refillBtn');
    const clearBtn = $('clearBtn');

    if (clientData && Object.keys(clientData).length > 0) {
        const name = [clientData.FirstName, clientData.LastName].filter(Boolean).join(' ') || 'Unnamed';
        nameEl.textContent = name;
        nameEl.classList.remove('empty');

        const fieldCount = Object.values(clientData).filter(v => v && String(v).trim()).length;
        const hasAuto = !!(clientData.VIN || clientData.VehicleMake || clientData.BodilyInjury);
        const hasHome = !!(clientData.DwellingType || clientData.YearBuilt || clientData.HomePolicyType);

        fieldsEl.innerHTML = `
            <span class="client-stat"><strong>${fieldCount}</strong> fields</span>
            ${hasAuto ? '<span class="client-stat">🚗 Auto</span>' : ''}
            ${hasHome ? '<span class="client-stat">🏠 Home</span>' : ''}
        `;

        fillBtn.disabled = false;
        refillBtn.disabled = false;
        clearBtn.disabled = false;
        setStatus(`✅ ${name} ready — navigate to an EZLynx form and click Fill`, 'success');
    } else {
        nameEl.textContent = 'No client loaded';
        nameEl.classList.add('empty');
        fieldsEl.innerHTML = '';
        fillBtn.disabled = true;
        refillBtn.disabled = true;
        clearBtn.disabled = true;
    }
}

// ── Check what page we're on ──
function checkPage() {
    const pageNames = {
        'applicant': '👤 Applicant Form',
        'auto-policy': '🚗 Auto Policy',
        'auto-incident': '⚠️ Auto Incidents',
        'auto-driver': '🚘 Auto Driver',
        'auto-vehicle': '🚙 Auto Vehicle',
        'auto-coverage': '🛡 Auto Coverage',
        'home-dwelling': '🏠 Home Dwelling',
        'home-coverage': '🛡 Home Coverage',
        'lead-info': '📋 Lead Info',
        'ezlynx': '✓ EZLynx (navigate to a form)'
    };
    const dot = $('pageDot');
    const label = $('pageLabel');

    chrome.runtime.sendMessage({ type: 'getPageInfo' }, (response) => {
        if (chrome.runtime.lastError || !response) {
            // Content script not reachable — check tab URL directly as fallback
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const url = (tabs[0]?.url || '').toLowerCase();
                if (url.includes('ezlynx.com')) {
                    dot.classList.add('connected');
                    label.innerHTML = '<strong>✓ EZLynx</strong> — refresh the page to enable filling';
                } else {
                    dot.classList.remove('connected');
                    label.innerHTML = 'Not on EZLynx — open <strong>app.ezlynx.com</strong>';
                }
            });
            return;
        }

        const page = response.page || 'unknown';
        const isEzlynx = page !== 'not-ezlynx' && page !== 'unknown';

        if (isEzlynx) {
            dot.classList.add('connected');
            label.innerHTML = `<strong>${pageNames[page] || 'EZLynx'}</strong>`;
        } else {
            dot.classList.remove('connected');
            label.innerHTML = 'Not on EZLynx — open <strong>app.ezlynx.com</strong>';
        }
    });
}

// ── Paste from clipboard ──
async function pasteFromClipboard() {
    const status = $('status');

    try {
        const text = await navigator.clipboard.readText();
        if (!text || !text.trim()) {
            setStatus('Clipboard is empty. Copy data from Altech first.', 'error');
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            setStatus('Clipboard doesn\'t contain valid JSON. Use "Send to Extension" in Altech.', 'error');
            return;
        }

        if (!data || typeof data !== 'object') {
            setStatus('Invalid data format.', 'error');
            return;
        }

        // Accept both { _altech_extension: true, clientData: {...} } and raw data
        let clientData = data;
        if (data._altech_extension && data.clientData) {
            clientData = data.clientData;
        }

        const fieldCount = Object.values(clientData).filter(v => v && String(v).trim()).length;
        if (fieldCount === 0) {
            setStatus('No fields found in the pasted data.', 'error');
            return;
        }

        await chrome.storage.local.set({ clientData });
        await refreshUI();
        setStatus(`✅ Loaded ${fieldCount} fields for ${clientData.FirstName || ''} ${clientData.LastName || ''}`, 'success');

    } catch (err) {
        // Clipboard API failed — show manual paste textarea as fallback
        console.warn('[Altech] Clipboard API failed:', err.message);
        showManualPaste();
        setStatus('Clipboard blocked — paste manually below (Ctrl+V into the box).', 'error');
    }
}

// ── Show manual paste fallback ──
function showManualPaste() {
    const area = $('pasteArea');
    area.style.display = 'block';
    const ta = $('pasteTextarea');
    ta.value = '';
    ta.focus();
}

// ── Process manually pasted data ──
async function loadManualPaste() {
    const ta = $('pasteTextarea');
    const text = ta.value.trim();
    if (!text) {
        setStatus('Paste area is empty. Press Ctrl+V first.', 'error');
        return;
    }
    try {
        let data = JSON.parse(text);
        let clientData = data;
        if (data._altech_extension && data.clientData) {
            clientData = data.clientData;
        }
        const fieldCount = Object.values(clientData).filter(v => v && String(v).trim()).length;
        if (fieldCount === 0) {
            setStatus('No fields found in the pasted data.', 'error');
            return;
        }
        await chrome.storage.local.set({ clientData });
        await refreshUI();
        $('pasteArea').style.display = 'none';
        setStatus(`✅ Loaded ${fieldCount} fields for ${clientData.FirstName || ''} ${clientData.LastName || ''}`, 'success');
    } catch (e) {
        setStatus('Invalid JSON. Use "Copy for Extension" in Altech first.', 'error');
    }
}

// ── Send fill command to content script ──
async function sendFill() {
    const { clientData } = await chrome.storage.local.get('clientData');
    if (!clientData) {
        setStatus('No client data loaded.', 'error');
        return;
    }

    $('fillBtn').disabled = true;
    $('refillBtn').disabled = true;
    $('fillBtn').textContent = '⏳ Filling...';
    setStatus('Sending data to EZLynx page...', '');

    chrome.runtime.sendMessage({ type: 'fillPage', clientData }, (response) => {
        $('fillBtn').disabled = false;
        $('refillBtn').disabled = false;
        $('fillBtn').textContent = '⚡ Fill This Page';

        if (chrome.runtime.lastError) {
            setStatus('Content script not loaded. Are you on an EZLynx page?', 'error');
            return;
        }

        if (!response) {
            setStatus('No response from page. Try refreshing EZLynx.', 'error');
            return;
        }

        if (response.error) {
            setStatus(`Error: ${response.error}`, 'error');
            return;
        }

        const { textFilled, textSkipped, ddFilled, ddSkipped } = response;
        const total = (textFilled || 0) + (ddFilled || 0);
        const skipped = (textSkipped || 0) + (ddSkipped || 0);

        if (total > 0) {
            setStatus(`✅ Filled ${total} fields${skipped > 0 ? ` (${skipped} not found on this page)` : ''}`, 'success');
        } else {
            setStatus('No matching fields found on this page. Navigate to a form page.', 'error');
        }
    });
}

// ── Clear data ──
async function clearData() {
    await chrome.storage.local.set({ clientData: null });
    await refreshUI();
    setStatus('Client data cleared.', '');
}

// ── Status helper ──
function setStatus(text, type) {
    const el = $('status');
    el.textContent = text;
    el.className = 'status' + (type ? ' ' + type : '');
}

// ── Scrape current EZLynx page for all form fields & dropdown options ──
async function scrapeCurrentPage() {
    const btn = $('scrapeBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Scraping...';
    setStatus('Scraping all fields and dropdowns on this page...', '');

    chrome.runtime.sendMessage({ type: 'scrapePage' }, async (response) => {
        btn.disabled = false;
        btn.textContent = '🔍 Scrape This Page';

        if (chrome.runtime.lastError) {
            setStatus('Scraper failed — content script not loaded.', 'error');
            return;
        }

        if (!response || response.error) {
            setStatus(`Scrape error: ${response?.error || 'No response'}`, 'error');
            return;
        }

        const { stats, page, nativeSelects, dropdowns } = response;
        const checkboxCount = (response.checkboxes || []).length;
        const radioCount = (response.radioGroups || []).length;
        const summary = `${stats.totalInputs} inputs, ${stats.totalNativeSelects + stats.totalCustomDropdowns} dropdowns (${stats.totalOptions} options)` +
            (checkboxCount > 0 || radioCount > 0 ? `, ${checkboxCount} checkboxes, ${radioCount} radio groups` : '');

        // ── 1. Store scrape in chrome.storage.local (for extension's smart fill) ──
        const storedScrapes = (await chrome.storage.local.get('scrapeHistory'))?.scrapeHistory || {};
        storedScrapes[page] = response;
        await chrome.storage.local.set({ scrapeHistory: storedScrapes });

        // ── 2. Build a schema-compatible object (matches ezlynx_schema.json format) ──
        // Merge native selects and custom dropdowns into { label: [options] }
        const schemaUpdate = {};
        for (const [key, info] of Object.entries(nativeSelects || {})) {
            if (info.options?.length > 0) {
                schemaUpdate[info.label || key] = info.options;
            }
        }
        for (const [key, info] of Object.entries(dropdowns || {})) {
            if (info.options?.length > 0) {
                schemaUpdate[info.label || key] = info.options;
            }
        }

        // Store the flattened schema for smart fill — auto-injected, no file needed
        const knownOptions = (await chrome.storage.local.get('knownOptions'))?.knownOptions || {};
        Object.assign(knownOptions, schemaUpdate);
        await chrome.storage.local.set({ knownOptions });

        // Count how many pages have been scraped
        const scrapedPages = Object.keys(storedScrapes).filter(k => storedScrapes[k]?.stats);
        const totalKnown = Object.keys(knownOptions).length;

        setStatus(`✅ Scraped ${summary}\n📦 Schema stored (${totalKnown} total fields from ${scrapedPages.length} page${scrapedPages.length !== 1 ? 's' : ''}) — auto-used on next fill!`, 'success');
        loadSchemaStats(); // Refresh the stats display
    });
}

// ═══════════════════════════════════════════════════════════════
// PROPERTY DATA SCRAPING (GIS / Zillow / Assessor sites)
// ═══════════════════════════════════════════════════════════════

// Friendly field labels for display
const PROP_FIELD_LABELS = {
    yrBuilt: 'Year Built', sqFt: 'Sq Ft', lotSize: 'Lot Size (acres)',
    bedrooms: 'Bedrooms', fullBaths: 'Full Baths', halfBaths: 'Half Baths',
    numStories: 'Stories', roofType: 'Roof Type', roofShape: 'Roof Shape',
    foundation: 'Foundation', exteriorWalls: 'Exterior Walls',
    constructionStyle: 'Construction', heatingType: 'Heating',
    cooling: 'Cooling', garageType: 'Garage Type', garageSpaces: 'Garage Spaces',
    pool: 'Pool', numFireplaces: 'Fireplaces', sewer: 'Sewer',
    waterSource: 'Water Source', flooring: 'Flooring',
    assessedValue: 'Assessed Value', ownerName: 'Owner', parcelId: 'Parcel ID',
    purchaseDate: 'Purchase Date', woodStove: 'Wood Stove',
    dwellingType: 'Dwelling Type', dwellingUsage: 'Dwelling Use',
    occupancyType: 'Occupancy', numOccupants: 'Occupants',
    kitchenQuality: 'Kitchen/Bath Quality',
};

// ── Scrape property data from current page ──
async function scrapePropertyData() {
    const btn = $('propertyBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Scanning page...';
    setStatus('Scraping property data from this page...', '');

    chrome.runtime.sendMessage({ type: 'scrapeProperty' }, async (response) => {
        btn.disabled = false;
        btn.textContent = '🏠 Grab Property Data';

        if (chrome.runtime.lastError) {
            setStatus('Property scrape failed — cannot access this page.', 'error');
            return;
        }

        if (!response || response.error) {
            setStatus(`Property scrape error: ${response?.error || 'No response'}`, 'error');
            return;
        }

        if (!response.fieldCount || response.fieldCount === 0) {
            setStatus('No property data found on this page. Try a Zillow listing or county GIS site.', 'error');
            return;
        }

        // Display results
        displayPropertyResults(response);
        setStatus(`✅ Found ${response.fieldCount} property fields from ${response.siteType}!`, 'success');
    });
}

// ── Display property results in popup ──
function displayPropertyResults(result) {
    const container = $('propertyResults');
    const badge = $('propSiteBadge');
    const addr = $('propAddress');
    const count = $('propFieldCount');
    const list = $('propFieldList');

    // Show container
    container.style.display = 'block';

    // Site badge
    badge.textContent = result.siteType.toUpperCase();
    badge.className = 'site-badge ' + result.siteType;

    // Address
    addr.textContent = result.address || result.pageTitle?.split('|')[0]?.trim() || 'Unknown address';

    // Field count
    count.textContent = `${result.fieldCount} fields`;

    // Render fields
    list.innerHTML = '';
    const data = result.data || {};
    // Show in a logical order
    const fieldOrder = [
        'yrBuilt', 'sqFt', 'lotSize', 'bedrooms', 'fullBaths', 'halfBaths',
        'numStories', 'constructionStyle', 'exteriorWalls', 'roofType', 'roofShape',
        'foundation', 'heatingType', 'cooling', 'garageType', 'garageSpaces',
        'flooring', 'numFireplaces', 'pool', 'woodStove', 'sewer', 'waterSource',
        'assessedValue', 'ownerName', 'parcelId', 'purchaseDate'
    ];

    // Show ordered fields first, then any remaining
    const shown = new Set();
    for (const key of fieldOrder) {
        if (data[key]) {
            addPropField(list, key, data[key]);
            shown.add(key);
        }
    }
    // Remaining fields not in our order list
    for (const [key, value] of Object.entries(data)) {
        if (!shown.has(key) && value && key !== 'address' && key !== 'city' && key !== 'state' && key !== 'zip') {
            addPropField(list, key, value);
        }
    }
}

function addPropField(container, key, value) {
    const row = document.createElement('div');
    row.className = 'prop-field';
    const label = document.createElement('span');
    label.className = 'prop-label';
    label.textContent = PROP_FIELD_LABELS[key] || key;
    const val = document.createElement('span');
    val.className = 'prop-value';
    val.textContent = value;
    row.appendChild(label);
    row.appendChild(val);
    container.appendChild(row);
}

// ── Load previously stored property data ──
async function loadStoredPropertyData() {
    const { propertyData } = await chrome.storage.local.get('propertyData');
    if (propertyData && propertyData.fieldCount > 0) {
        displayPropertyResults(propertyData);
    }
}

// ── Copy property data to clipboard (for Altech import) ──
async function copyPropertyToClipboard() {
    const { propertyData } = await chrome.storage.local.get('propertyData');
    if (!propertyData || !propertyData.data) {
        setStatus('No property data to copy. Scrape a page first.', 'error');
        return;
    }

    const exportData = {
        _altech_property: true,
        _source: propertyData.siteType,
        _url: propertyData.url,
        _timestamp: propertyData.timestamp,
        address: propertyData.address,
        data: propertyData.data
    };

    try {
        await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
        setStatus('✅ Property data copied! Paste in Altech → Step 3 → "Import from Extension"', 'success');
    } catch (e) {
        // Fallback: create a textarea for manual copy
        const ta = document.createElement('textarea');
        ta.value = JSON.stringify(exportData, null, 2);
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        setStatus('✅ Property data copied to clipboard!', 'success');
    }
}

// ── Clear stored property data ──
async function clearPropertyData() {
    await chrome.storage.local.remove('propertyData');
    $('propertyResults').style.display = 'none';
    setStatus('Property data cleared.', '');
}

// ═══════════════════════════════════════════════════════════════
// SCHEMA MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// ── Show schema stats on popup open ──
async function loadSchemaStats() {
    const textEl = $('schemaStatsText');
    const dotEl = document.querySelector('.schema-dot');
    try {
        const knownOptions = (await chrome.storage.local.get('knownOptions'))?.knownOptions || {};
        const totalFields = Object.keys(knownOptions).length;
        let totalOptions = 0;
        for (const v of Object.values(knownOptions)) {
            if (Array.isArray(v)) totalOptions += v.length;
        }
        const builtInCount = (typeof DEFAULT_SCHEMA !== 'undefined') ? Object.keys(DEFAULT_SCHEMA).length : 0;
        const userAdded = Math.max(0, totalFields - builtInCount);

        if (totalFields > 0) {
            textEl.innerHTML = `<strong>${totalFields}</strong> dropdown fields (${totalOptions} options)` +
                (userAdded > 0 ? ` · <strong>${userAdded}</strong> from scrapes` : '');
            if (dotEl) dotEl.style.background = '#34c759';
        } else {
            textEl.textContent = 'No schema loaded';
            if (dotEl) dotEl.style.background = '#ff3b30';
        }
    } catch (e) {
        textEl.textContent = 'Schema unavailable';
        if (dotEl) dotEl.style.background = '#ff9500';
    }
}

// ── Export current schema as JSON file (admin pushes to repo → Vercel → team auto-syncs) ──
async function exportSchema() {
    try {
        const knownOptions = (await chrome.storage.local.get('knownOptions'))?.knownOptions || {};
        if (Object.keys(knownOptions).length === 0) {
            setStatus('No schema to export. Scrape some EZLynx pages first.', 'error');
            return;
        }

        // Filter out internal panel IDs and non-array values
        const cleaned = {};
        for (const [k, v] of Object.entries(knownOptions)) {
            if (k.includes('-panel') || k.includes('mat-select-') || k === '1') continue;
            if (k.startsWith('_')) continue; // skip metadata keys
            if (Array.isArray(v) && v.length > 0) cleaned[k] = v;
        }

        // Sort keys alphabetically for clean diffs
        const sorted = {};
        for (const k of Object.keys(cleaned).sort()) {
            sorted[k] = cleaned[k];
        }

        const json = JSON.stringify(sorted, null, 2);

        // Download as ezlynx_schema.json — admin commits this to the repo
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ezlynx_schema.json';
        a.click();
        URL.revokeObjectURL(url);

        setStatus(`✅ Exported ${Object.keys(sorted).length} fields as ezlynx_schema.json — commit to repo & push to deploy!`, 'success');
    } catch (e) {
        setStatus(`Export failed: ${e.message}`, 'error');
    }
}