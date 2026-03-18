/**
 * CallLogger — Call note formatter + HawkSoft logger
 * Formats messy shorthand call notes, then logs to HawkSoft.
 * Uses apiFetch() for authenticated API calls.
 *
 * localStorage key: altech_call_logger
 */
window.CallLogger = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_call_logger';
    const CGL_CACHE_KEY = 'altech_cgl_cache';
    let _searchTimer = null;
    let _selectedClient = null;  // { name, policies: [...] }
    let _selectedPolicy = null;  // { policyNumber, type, typeLabel, expirationDate, hawksoftId, hawksoftPolicyId }

    let _policiesReady = false;  // true once we have policy data in cache
    let _selectedChannel = 'Inbound';   // Channel button selection
    let _selectedActivityType = null;   // Activity type pill selection
    let _lastTemplate = '';             // Last-applied activity template text

    function init() {
        _load();
        _wireEvents();
        _ensurePoliciesLoaded();  // Background fetch if cache is empty
    }

    function render() {
        // HTML is loaded from plugins/call-logger.html — just re-wire events
        _load();
        _wireEvents();
        _ensurePoliciesLoaded();
    }

    // ── Persistence ──

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                const policyEl = document.getElementById('clPolicyId');
                const initialsEl = document.getElementById('clAgentInitials');
                if (policyEl && saved.policyId) policyEl.value = saved.policyId;
                if (saved.channelType) { _selectedChannel = saved.channelType; _applyChannelUI(); }
                if (saved.activityType) { _selectedActivityType = saved.activityType; _applyActivityUI(); }
                if (initialsEl && saved.agentInitials) initialsEl.value = saved.agentInitials;
            }
        } catch (e) {
            console.warn('[CallLogger] Load error:', e);
        }
    }

    function _save(policyId, callType) {
        try {
            const initialsEl = document.getElementById('clAgentInitials');
            const agentInitials = initialsEl ? initialsEl.value.trim().toUpperCase() : '';
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ policyId, callType, agentInitials, channelType: _selectedChannel, activityType: _selectedActivityType }));
            if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
                CloudSync.schedulePush();
            }
        } catch (e) {
            console.warn('[CallLogger] Save error:', e);
        }
    }

    // ── Settings Resolution ──

    function _resolveAISettings() {
        let userApiKey = '';
        let aiModel = 'gemini-2.5-flash';

        try {
            // Read from AIProvider's storage key (altech_ai_settings)
            // Fields: { provider, model, apiKey }
            const raw = localStorage.getItem('altech_ai_settings');
            if (raw) {
                const settings = JSON.parse(raw);
                if (settings.apiKey && settings.apiKey.trim()) {
                    userApiKey = settings.apiKey.trim();
                }
                if (settings.model && settings.model.trim()) {
                    aiModel = settings.model.trim();
                }
            }
        } catch (e) {
            // Fall through to defaults
        }

        return { userApiKey, aiModel };
    }

    // ── Policy Pre-Loading ──

    /**
     * Ensure policy data is available for client autocomplete.
     * If the compliance cache is empty (user hasn't visited Compliance Dashboard),
     * fetch policies independently so HawkSoft Logger works standalone.
     */
    async function _ensurePoliciesLoaded() {
        // Quick check: does localStorage already have policy data (allPolicies format)?
        try {
            const raw = localStorage.getItem(CGL_CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                const allPolicies = cached?.allPolicies;
                // Only use cache if allPolicies exists — older cache has only `policies` (CGL-only)
                if (allPolicies && allPolicies.length > 0) {
                    _policiesReady = true;
                    _logPolicyBreakdown(allPolicies, cached?.metadata, 'localStorage cache');
                    const clientCount = _countClients(cached);
                    _updateStatusBar('ready', clientCount + ' clients loaded');
                    return; // Cache is warm — nothing to do
                }
                // Old cache format (only CGL `policies`) — fall through to re-fetch so personal lines appear
            }
        } catch (e) { /* ignore parse errors */ }

        // Cache is empty — show loading state
        _updateStatusBar('loading', 'Checking local cache…');

        // Try disk cache first (fast, survives browser storage clears)
        // Only accept disk cache if it has allPolicies (includes personal lines)
        try {
            const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            if (isLocal) {
                const diskRes = await fetch('/local/cgl-cache');
                if (diskRes.ok) {
                    const diskData = await diskRes.json();
                    const allPolicies = diskData?.allPolicies;
                    if (allPolicies && allPolicies.length > 0) {
                        // Promote disk cache to localStorage (has all lines including personal)
                        localStorage.setItem(CGL_CACHE_KEY, JSON.stringify(diskData));
                        _policiesReady = true;
                        _logPolicyBreakdown(allPolicies, diskData?.metadata, 'disk cache');
                        const clientCount = _countClients(diskData);
                        _updateStatusBar('ready', clientCount + ' clients loaded');
                        return;
                    } else if (diskData?.policies?.length > 0) {
                        console.log('[CallLogger] Disk cache has CGL-only data (no allPolicies) — falling through to API');
                    }
                }
            }
        } catch (e) {
            console.warn('[CallLogger] Disk cache check failed:', e.message);
        }

        // No cache anywhere — fetch from compliance API directly
        _updateStatusBar('loading', 'Syncing clients from HawkSoft…');
        try {
            console.log('[CallLogger] No cached policies — fetching from compliance API...');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
            const res = await fetch('/api/compliance', { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // Check we got JSON, not raw JS source (local dev without Vercel runtime)
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const preview = await res.clone().text();
                if (preview.trimStart().startsWith('/**') || preview.trimStart().startsWith('export') || preview.trimStart().startsWith('//')) {
                    throw new Error('API not available — static file server');
                }
            }

            const data = await res.json();
            if (data.success) {
                const cacheObj = {
                    ...data,
                    cachedAt: Date.now(),
                    last_synced_time: new Date().toISOString()
                };
                localStorage.setItem(CGL_CACHE_KEY, JSON.stringify(cacheObj));
                _policiesReady = true;
                const allPolicies = data.allPolicies || data.policies || [];
                _logPolicyBreakdown(allPolicies, data.metadata, 'API fetch');
                const clientCount = _countClients(data);
                _updateStatusBar('ready', clientCount + ' clients loaded');
            } else {
                _updateStatusBar('error', 'Could not load clients');
            }
        } catch (e) {
            const isAbort = e.name === 'AbortError';
            if (isAbort) {
                _updateStatusBar('error', 'Request timed out');
            } else {
                _updateStatusBar('error', 'Could not load clients');
            }
            if (!isAbort) console.warn('[CallLogger] Policy pre-fetch failed:', e.message);
        }
    }

    /**
     * Update the status bar with current loading state.
     * @param {'idle'|'loading'|'ready'|'error'} state
     * @param {string} message
     */
    function _updateStatusBar(state, message) {
        const dot = document.getElementById('clStatusDot');
        const text = document.getElementById('clStatusText');
        const btn = document.getElementById('clRefreshBtn');

        if (dot) {
            dot.className = 'cl-status-indicator';
            if (state === 'loading') dot.classList.add('cl-status-loading');
            else if (state === 'ready') dot.classList.add('cl-status-ready');
            else if (state === 'error') dot.classList.add('cl-status-error');
        }
        if (text) text.textContent = message || '';
        if (btn) {
            btn.disabled = (state === 'loading');
            btn.classList.toggle('cl-refreshing', state === 'loading');
        }
    }

    // ── Channel & Activity Selection ──

    function _handleChannelSelect(channel) {
        _selectedChannel = channel;
        _applyChannelUI();
    }

    function _applyChannelUI() {
        const group = document.getElementById('clChannelGroup');
        if (!group) return;
        group.querySelectorAll('.cl-channel-btn').forEach(btn => {
            btn.classList.toggle('cl-channel-selected', btn.dataset.channel === _selectedChannel);
        });
    }

    function _handleActivitySelect(activity, template) {
        const notesEl = document.getElementById('clRawNotes');
        if (_selectedActivityType === activity) {
            // Deselect — remove template if it's still the default
            _selectedActivityType = null;
            if (notesEl && _lastTemplate && notesEl.value === _lastTemplate) {
                notesEl.value = '';
            }
            _lastTemplate = '';
            _applyActivityUI();
            return;
        }
        _selectedActivityType = activity;
        _applyActivityUI();
        // Insert template only if textarea is empty or still has old template
        if (notesEl && template) {
            if (!notesEl.value.trim() || notesEl.value === _lastTemplate) {
                notesEl.value = template;
                _lastTemplate = template;
                notesEl.focus();
                // Place cursor after first blank to fill
                const blankIdx = template.indexOf('[');
                if (blankIdx !== -1) {
                    const endIdx = template.indexOf(']', blankIdx);
                    if (endIdx !== -1) notesEl.setSelectionRange(blankIdx, endIdx + 1);
                }
            }
        } else {
            _lastTemplate = '';
        }
    }

    function _applyActivityUI() {
        const group = document.getElementById('clActivityGroup');
        if (!group) return;
        group.querySelectorAll('.cl-activity-btn').forEach(btn => {
            btn.classList.toggle('cl-activity-selected', btn.dataset.activity === _selectedActivityType);
        });
    }

    /**
     * Manual refresh — force-fetch from API, bypass ALL caches (client + server KV).
     */
    async function _refreshPolicies() {
        _updateStatusBar('loading', 'Refreshing client list…');
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000); // 60s — full HawkSoft fetch can take 30-50s
            const res = await fetch('/api/compliance?refresh=true', { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const preview = await res.clone().text();
                if (preview.trimStart().startsWith('/**') || preview.trimStart().startsWith('export') || preview.trimStart().startsWith('//')) {
                    throw new Error('API not available — static file server');
                }
            }

            const data = await res.json();
            if (data.success) {
                const cacheObj = {
                    ...data,
                    cachedAt: Date.now(),
                    last_synced_time: new Date().toISOString()
                };
                localStorage.setItem(CGL_CACHE_KEY, JSON.stringify(cacheObj));
                _policiesReady = true;
                const allPolicies = data.allPolicies || data.policies || [];
                _logPolicyBreakdown(allPolicies, data.metadata, 'Refresh');
                const clientCount = _countClients(data);
                _updateStatusBar('ready', clientCount + ' clients loaded');
            } else {
                _updateStatusBar('error', 'Refresh failed — no data returned');
            }
        } catch (e) {
            const isAbort = e.name === 'AbortError';
            _updateStatusBar('error', isAbort ? 'Request timed out' : 'Refresh failed');
            if (!isAbort) console.warn('[CallLogger] Refresh failed:', e.message);
        }
    }

    /**
     * Count unique client names from cached data.
     * Prefers allClientsList (includes prospects) over allPolicies-derived count.
     */
    function _countClients(data) {
        if (data?.allClientsList?.length > 0) {
            return new Set(data.allClientsList.map(c => c.clientName).filter(Boolean)).size;
        }
        const policies = data?.allPolicies || data?.policies || [];
        return new Set(policies.map(p => p.clientName).filter(Boolean)).size;
    }

    /**
     * Log a breakdown of policy data for diagnostics.
     * Shows commercial vs personal counts so we can verify personal lines are included.
     */
    function _logPolicyBreakdown(allPolicies, metadata, source) {
        const commercial = allPolicies.filter(p => p.lineOfBusiness === 'commercial');
        const personal = allPolicies.filter(p => p.lineOfBusiness === 'personal');
        const unknown = allPolicies.filter(p => !p.lineOfBusiness);
        const clientCount = new Set(allPolicies.map(p => p.clientName).filter(Boolean)).size;
        const personalClients = new Set(personal.map(p => p.clientName).filter(Boolean)).size;
        const commercialClients = new Set(commercial.map(p => p.clientName).filter(Boolean)).size;

        console.log(`[CallLogger] ${source}: ${allPolicies.length} policies for ${clientCount} clients`);
        console.log(`[CallLogger]   ↳ Commercial: ${commercial.length} policies (${commercialClients} clients)`);
        console.log(`[CallLogger]   ↳ Personal:   ${personal.length} policies (${personalClients} clients)`);
        if (unknown.length) console.log(`[CallLogger]   ↳ Unknown:    ${unknown.length} (no lineOfBusiness field — stale cache?)`);

        // Show policy type distribution
        const types = {};
        for (const p of allPolicies) { types[p.policyType || 'unknown'] = (types[p.policyType || 'unknown'] || 0) + 1; }
        console.log('[CallLogger]   ↳ Policy types:', types);

        // Show server-side breakdown if available (from metadata)
        if (metadata?.allPoliciesBreakdown) {
            console.log('[CallLogger]   ↳ Server breakdown:', metadata.allPoliciesBreakdown);
        }

        // Sample some personal-line client names for verification
        if (personal.length > 0) {
            const sampleNames = [...new Set(personal.slice(0, 10).map(p => p.clientName).filter(Boolean))];
            console.log('[CallLogger]   ↳ Sample personal clients:', sampleNames);
        } else {
            console.warn('[CallLogger] ⚠️ ZERO personal policies — HawkSoft API may not be returning personal-line clients');
        }
    }

    // ── Client & Policy Lookup ──

    /**
     * Retrieve all known clients merged from Client History + CGL cache.
     * Returns array of { name, policies: [...] } sorted by name.
     */
    function _getClients() {
        const clientMap = {};  // name (lowercase) → { name, policies }

        // Source 1: CGL compliance cache (HawkSoft policies — richest data)
        // allPolicies contains commercial + personal; policies contains CGL-only (fallback)
        let cachedData = null;
        try {
            const raw = localStorage.getItem(CGL_CACHE_KEY);
            if (raw) {
                cachedData = JSON.parse(raw);
                // Fix: empty array [] is truthy in JS, so use length check for proper fallback
                const allPolicies = cachedData?.allPolicies;
                const policies = (allPolicies && allPolicies.length > 0)
                    ? allPolicies
                    : (cachedData?.policies || []);
                for (const p of policies) {
                    if (!p.clientName) continue;
                    const key = p.clientName.toLowerCase().trim();
                    if (!clientMap[key]) clientMap[key] = { name: p.clientName, policies: [], hawksoftId: String(p.hawksoftId || p.clientNumber || '') };
                    // Ensure hawksoftId is set at the client level (first policy wins)
                    if (!clientMap[key].hawksoftId && (p.hawksoftId || p.clientNumber)) {
                        clientMap[key].hawksoftId = String(p.hawksoftId || p.clientNumber);
                    }
                    const pType = p.policyType || p.type || 'unknown';
                    clientMap[key].policies.push({
                        policyNumber: p.policyNumber || '',
                        type: pType,
                        typeLabel: _policyTypeLabel(pType),
                        expirationDate: p.expirationDate || '',
                        hawksoftId: String(p.hawksoftId || p.clientNumber || ''),
                        hawksoftPolicyId: p.hawksoftPolicyId || p.policyId || ''
                    });
                }
            }
        } catch (e) { /* ignore parse errors */ }

        // Source 2: Full HawkSoft client list (includes prospects & policy-less clients)
        // These are clients returned by the HawkSoft "changed clients" API but who may have
        // no qualifying policies (prospects, cancelled-only, expired-only).
        try {
            if (cachedData?.allClientsList) {
                for (const c of cachedData.allClientsList) {
                    if (!c.clientName) continue;
                    const key = c.clientName.toLowerCase().trim();
                    if (!clientMap[key]) {
                        clientMap[key] = { name: c.clientName, policies: [], hawksoftId: String(c.clientNumber || '') };
                    }
                    if (!clientMap[key].hawksoftId && c.clientNumber) {
                        clientMap[key].hawksoftId = String(c.clientNumber);
                    }
                    // Merge search aliases (company name, DBA, all people names)
                    if (c.searchAliases && Array.isArray(c.searchAliases)) {
                        if (!clientMap[key].searchAliases) clientMap[key].searchAliases = [];
                        for (const alias of c.searchAliases) {
                            if (!clientMap[key].searchAliases.includes(alias)) {
                                clientMap[key].searchAliases.push(alias);
                            }
                        }
                    }
                }
            }
        } catch (e) { /* ignore */ }

        // Source 2: Client History (personal lines clients from the intake form)
        // These may not appear in HawkSoft cache if they're personal-only clients
        try {
            if (typeof App !== 'undefined' && App.getClientHistory) {
                const history = App.getClientHistory() || [];
                for (const c of history) {
                    const name = c.name || (c.data && `${c.data.firstName || ''} ${c.data.lastName || ''}`.trim());
                    if (!name) continue;
                    const key = name.toLowerCase().trim();
                    if (!clientMap[key]) clientMap[key] = { name, policies: [] };
                    // Infer policy types from quote data (qType: 'home', 'auto', 'both')
                    if (c.data && c.data.qType) {
                        const qType = c.data.qType.toLowerCase();
                        const existingPolicies = clientMap[key].policies;
                        if ((qType === 'home' || qType === 'both') && !existingPolicies.some(p => p.type === 'homeowner')) {
                            existingPolicies.push({
                                policyNumber: c.data.priorCarrier ? `(${c.data.priorCarrier})` : '',
                                type: 'homeowner',
                                typeLabel: 'Homeowner',
                                expirationDate: '',
                                hawksoftId: ''
                            });
                        }
                        if ((qType === 'auto' || qType === 'both') && !existingPolicies.some(p => p.type === 'personal-auto')) {
                            existingPolicies.push({
                                policyNumber: '',
                                type: 'personal-auto',
                                typeLabel: 'Personal Auto',
                                expirationDate: '',
                                hawksoftId: ''
                            });
                        }
                    }
                }
            }
        } catch (e) { /* ignore */ }

        return Object.values(clientMap).sort((a, b) => a.name.localeCompare(b.name));
    }

    function _policyTypeLabel(type) {
        if (!type) return 'Policy';
        const labels = {
            // Commercial lines
            cgl: 'CGL', bond: 'Bond', auto: 'Commercial Auto', wc: 'Workers Comp',
            pkg: 'Package', umbrella: 'Umbrella', im: 'Inland Marine',
            property: 'Commercial Property', epli: 'EPLI', do: 'D&O',
            eo: 'E&O', cyber: 'Cyber', crime: 'Crime',
            liquor: 'Liquor', garage: 'Garage', pollution: 'Pollution',
            bop: 'BOP', commercial: 'Commercial',
            // Personal lines
            homeowner: 'Homeowner', 'personal-auto': 'Personal Auto',
            renters: 'Renters', condo: 'Condo', dwelling: 'Dwelling',
            flood: 'Flood', earthquake: 'Earthquake', boat: 'Boat',
            rv: 'RV', motorcycle: 'Motorcycle',
            'personal-umbrella': 'Personal Umbrella',
            life: 'Life', health: 'Health', personal: 'Personal'
        };
        return labels[type] || type.toUpperCase();
    }

    function _policyTypeIcon(type) {
        const icons = {
            // Commercial lines
            auto: '🚛', cgl: '🛡️', bond: '📜',
            wc: '👷', umbrella: '☂️', im: '📦', pkg: '📋',
            bop: '🏢', epli: '👥', do: '⚖️', eo: '🔒',
            cyber: '💻', crime: '🚨', liquor: '🍷', garage: '🔧',
            pollution: '🌿', commercial: '🏪', property: '🏗️',
            // Personal lines
            homeowner: '🏠', 'personal-auto': '🚗',
            renters: '🏘️', condo: '🏙️', dwelling: '🏡',
            flood: '🌊', earthquake: '🌋', boat: '⛵',
            rv: '🚐', motorcycle: '🏍️',
            'personal-umbrella': '☔',
            life: '💚', health: '🏥', personal: '📋'
        };
        return icons[type] || '📄';
    }

    /**
     * Handle typing in the client/policy ID field — show autocomplete dropdown.
     */
    function _handleClientSearch() {
        const input = document.getElementById('clPolicyId');
        const dropdown = document.getElementById('clClientDropdown');
        if (!input || !dropdown) return;

        const query = input.value.trim().toLowerCase();

        // Clear previous selection if user edits the input
        if (_selectedClient && input.value.trim() !== _selectedClient.name) {
            _selectedClient = null;
            _selectedPolicy = null;
            const policySelect = document.getElementById('clPolicySelect');
            if (policySelect) policySelect.style.display = 'none';
        }

        if (query.length < 2) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }

        const clients = _getClients();
        const matches = clients.filter(c => {
            // Match against display name
            if (c.name.toLowerCase().includes(query)) return true;
            // Match against client number (HawkSoft ID)
            if (c.hawksoftId && c.hawksoftId.includes(query)) return true;
            // Match against search aliases (company name, DBA, all people names)
            if (c.searchAliases && c.searchAliases.some(a => a.includes(query))) return true;
            return false;
        });

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }

        // Render dropdown (max 8 results)
        const shown = matches.slice(0, 8);
        dropdown.innerHTML = shown.map((c, i) => {
            const policyCount = c.policies.length;
            const badge = policyCount > 0
                ? `<span class="cl-client-badge">${policyCount} ${policyCount === 1 ? 'policy' : 'policies'}</span>`
                : '<span class="cl-client-badge cl-client-badge-none">No policies</span>';
            const idLabel = c.hawksoftId ? `<span class="cl-client-number">#${_escapeHTML(c.hawksoftId)}</span>` : '';
            return `<div class="cl-client-row" data-index="${i}">${_escapeHTML(c.name)} ${idLabel} ${badge}</div>`;
        }).join('');

        dropdown.style.display = '';

        // Wire click handlers on rows
        dropdown.querySelectorAll('.cl-client-row').forEach((row, idx) => {
            row.addEventListener('click', () => _selectClient(shown[idx]));
        });
    }

    /**
     * User selected a client from the dropdown.
     */
    function _selectClient(client) {
        const input = document.getElementById('clPolicyId');
        const dropdown = document.getElementById('clClientDropdown');
        const policySelect = document.getElementById('clPolicySelect');
        const policyList = document.getElementById('clPolicyList');

        _selectedClient = client;
        _selectedPolicy = null;

        // Close dropdown
        if (dropdown) dropdown.style.display = 'none';

        // If client has policies, show policy picker — keep input as client name
        if (client.policies.length > 0 && policySelect && policyList) {
            input.value = client.name;
            policyList.innerHTML = client.policies.map((p, i) => {
                const icon = _policyTypeIcon(p.type);
                const exp = p.expirationDate
                    ? `<span class="cl-policy-exp">Exp: ${p.expirationDate}</span>`
                    : '';
                const numDisplay = p.policyNumber || 'No policy #';
                return `<div class="cl-policy-chip" data-index="${i}">
                    <span class="cl-policy-icon">${icon}</span>
                    <span class="cl-policy-info">
                        <span class="cl-policy-type">${_escapeHTML(p.typeLabel)}</span>
                        <span class="cl-policy-num">${_escapeHTML(numDisplay)}</span>
                    </span>
                    ${exp}
                </div>`;
            }).join('');
            policySelect.style.display = '';

            // Wire click on each policy chip
            policyList.querySelectorAll('.cl-policy-chip').forEach((chip, idx) => {
                chip.addEventListener('click', () => _selectPolicy(client.policies[idx], chip));
            });
        } else {
            // No policies — just set the name
            input.value = client.name;
            if (policySelect) policySelect.style.display = 'none';
        }
    }

    /**
     * User picked a specific policy — set it as the active policy ID.
     */
    function _selectPolicy(policy, chipEl) {
        // Store the selected policy — policyNumber will be used as the API policyId
        _selectedPolicy = policy;

        // Visual feedback — highlight selected chip
        const list = document.getElementById('clPolicyList');
        if (list) {
            list.querySelectorAll('.cl-policy-chip').forEach(c => c.classList.remove('cl-policy-selected'));
        }
        if (chipEl) chipEl.classList.add('cl-policy-selected');
    }

    /**
     * Close dropdown when clicking outside.
     */
    function _handleClickOutside(e) {
        const dropdown = document.getElementById('clClientDropdown');
        const wrapper = document.querySelector('.cl-search-wrapper');
        if (dropdown && wrapper && !wrapper.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }

    // ── Internal State ──

    let _pendingLog = null;  // { formattedLog, policyId, callType }

    // ── Step 1: Format Preview ──

    async function _handleFormat() {
        const policyEl = document.getElementById('clPolicyId');
        const notesEl = document.getElementById('clRawNotes');
        const formatBtn = document.getElementById('clSubmitBtn');
        const previewEl = document.getElementById('clPreview');
        const previewTextEl = document.getElementById('clPreviewText');
        const confirmSection = document.getElementById('clConfirmSection');
        const confirmInfo = document.getElementById('clConfirmInfo');

        if (!policyEl || !notesEl || !formatBtn) return;

        const inputValue = policyEl.value.trim();
        const callType = _selectedChannel;
        const rawNotes = notesEl.value.trim();

        // Validate required fields
        if (!inputValue || !rawNotes) {
            App.toast('Please fill in all fields', 'error');
            return;
        }

        // If a client was selected from autocomplete and has policies, require policy selection
        if (_selectedClient && _selectedClient.policies.length > 0 && !_selectedPolicy) {
            App.toast('Please select a policy to log this call under', 'error');
            return;
        }

        // Resolve the actual policy ID: selected policy > input value
        const policyId = (_selectedPolicy && _selectedPolicy.policyNumber)
            ? _selectedPolicy.policyNumber : inputValue;

        // HawkSoft client number — needed for the logNotes API (different from policy number)
        // Priority: selected policy's hawksoftId > selected client's hawksoftId > empty
        const clientNumber = (_selectedPolicy && _selectedPolicy.hawksoftId)
            ? _selectedPolicy.hawksoftId
            : (_selectedClient && _selectedClient.hawksoftId)
                ? _selectedClient.hawksoftId
                : '';

        // HawkSoft internal policy GUID — needed to link log to the specific policy (not just client)
        const hawksoftPolicyId = (_selectedPolicy && _selectedPolicy.hawksoftPolicyId)
            ? _selectedPolicy.hawksoftPolicyId : '';

        // Agent initials — persisted so it's remembered
        const initialsEl = document.getElementById('clAgentInitials');
        const agentInitials = initialsEl ? initialsEl.value.trim().toUpperCase() : '';

        // Resolve settings
        const { userApiKey, aiModel } = _resolveAISettings();

        // Disable button
        formatBtn.disabled = true;
        formatBtn.classList.add('cl-loading');

        try {
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch)
                ? Auth.apiFetch.bind(Auth)
                : fetch;

            const res = await fetchFn('/api/hawksoft-logger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ policyId, clientNumber, hawksoftPolicyId, callType, rawNotes, agentInitials, activityType: _selectedActivityType || '', glossary: localStorage.getItem('altech_agency_glossary') || '', userApiKey, aiModel, formatOnly: true })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server error (${res.status})`);
            }

            const result = await res.json();

            if (!result.formattedLog) {
                throw new Error('No formatted log returned');
            }

            // Store pending log for confirmation
            _pendingLog = {
                formattedLog: result.formattedLog,
                policyId: result.policyId || policyId,
                clientNumber: result.clientNumber || clientNumber,
                hawksoftPolicyId: result.hawksoftPolicyId || hawksoftPolicyId,
                callType: result.callType || callType
            };

            // Save policyId and callType for persistence
            _save(policyId, callType);

            // Show formatted log preview
            if (previewEl && previewTextEl) {
                previewTextEl.textContent = result.formattedLog;
                previewEl.style.display = '';
            }

            // Show confirmation section with clear summary
            if (confirmSection && confirmInfo) {
                const channelIcons = { 'Inbound': '📥', 'Outbound': '📤', 'Walk-In': '🚶', 'Email': '📧', 'Text': '💬' };
                const infoIcon = channelIcons[callType] || '📥';
                let infoHtml = '<div class="cl-confirm-summary">';

                // Client row
                infoHtml += '<div class="cl-confirm-row"><span class="cl-confirm-label">Client:</span> ';
                if (_selectedClient && _selectedPolicy) {
                    const hsId = _selectedPolicy.hawksoftId || '';
                    infoHtml += _buildClientLink(_selectedClient.name, hsId);
                } else if (_selectedClient) {
                    // Client selected from autocomplete but no policy (prospect/policy-less)
                    const hsId = _selectedClient.hawksoftId || '';
                    infoHtml += _buildClientLink(_selectedClient.name, hsId);
                } else {
                    infoHtml += `<strong>${_escapeHTML(policyId)}</strong>`;
                }
                infoHtml += '</div>';

                // Policy row
                if (_selectedClient && _selectedPolicy) {
                    const pIcon = _policyTypeIcon(_selectedPolicy.type);
                    infoHtml += `<div class="cl-confirm-row"><span class="cl-confirm-label">Policy:</span> <span class="cl-confirm-policy">${pIcon} ${_escapeHTML(_selectedPolicy.typeLabel)} ${_escapeHTML(_selectedPolicy.policyNumber)}</span></div>`;
                } else if (_selectedClient && _selectedClient.policies.length === 0) {
                    infoHtml += '<div class="cl-confirm-row"><span class="cl-confirm-label">Policy:</span> <span class="cl-confirm-policy">📋 No active policies</span></div>';
                }

                // Channel row
                infoHtml += `<div class="cl-confirm-row"><span class="cl-confirm-label">Channel:</span> ${infoIcon} ${_escapeHTML(callType)}</div>`;

                // Activity row (if selected)
                if (_selectedActivityType) {
                    infoHtml += `<div class="cl-confirm-row"><span class="cl-confirm-label">Activity:</span> ${_escapeHTML(_selectedActivityType)}</div>`;
                }

                infoHtml += '</div>';

                confirmInfo.innerHTML = infoHtml;
                confirmSection.style.display = '';
            }

            // Change format button to re-format mode
            formatBtn.innerHTML = '<span class="cl-btn-text">Re-format</span><svg class="cl-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
            formatBtn.classList.remove('cl-loading');
            formatBtn.classList.add('cl-edit-mode');

            // Exit edit mode if re-formatting while editing
            const existingEditTA = previewEl ? previewEl.querySelector('.cl-edit-textarea') : null;
            if (existingEditTA) {
                previewTextEl.style.display = '';
                existingEditTA.remove();
                const cancelBtn = document.getElementById('clCancelBtn');
                if (cancelBtn) cancelBtn.textContent = 'Edit';
            }

            App.toast('Preview ready — review and confirm below', 'success');

        } catch (error) {
            App.toast('Error: ' + (error.message || 'Failed to format call'), 'error');
        } finally {
            formatBtn.disabled = false;
            if (!formatBtn.classList.contains('cl-edit-mode')) {
                formatBtn.classList.remove('cl-loading');
                formatBtn.innerHTML = '<span class="cl-btn-text">Format &amp; Preview</span><svg class="cl-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg><span class="cl-btn-spinner"></span>';
            }
        }
    }

    // ── Step 2: Confirm & Send to HawkSoft ──

    async function _handleConfirm() {
        // If user is in edit mode, save their edits before confirming
        const editTA = document.querySelector('.cl-edit-textarea');
        if (editTA && _pendingLog) {
            _pendingLog.formattedLog = editTA.value;
            const previewTextEl = document.getElementById('clPreviewText');
            if (previewTextEl) {
                previewTextEl.textContent = _pendingLog.formattedLog;
                previewTextEl.style.display = '';
            }
            editTA.remove();
            const cancelBtn = document.getElementById('clCancelBtn');
            if (cancelBtn) cancelBtn.textContent = 'Edit';
        }

        if (!_pendingLog) {
            App.toast('No formatted log to send — format first', 'error');
            return;
        }

        const confirmBtn = document.getElementById('clConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Sending to HawkSoft…';
        }

        try {
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch)
                ? Auth.apiFetch.bind(Auth)
                : fetch;

            const res = await fetchFn('/api/hawksoft-logger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    policyId: _pendingLog.policyId,
                    clientNumber: _pendingLog.clientNumber,
                    hawksoftPolicyId: _pendingLog.hawksoftPolicyId,
                    callType: _pendingLog.callType,
                    formattedLog: _pendingLog.formattedLog
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server error (${res.status})`);
            }

            const result = await res.json();

            let statusMsg;
            if (result.hawksoftLogged) {
                statusMsg = `✅ Logged to HawkSoft for ${_escapeHTML(_pendingLog.policyId)}`;
                App.toast(statusMsg, 'success');

                // Only reset on success — clear form and return to initial state
                const notesEl = document.getElementById('clRawNotes');
                if (notesEl) notesEl.value = '';
                _resetToFormatMode();
                _pendingLog = null;
            } else if (result.hawksoftStatus === 'push_failed' || result.hawksoftStatus === 'push_error') {
                const errDetail = result.hawksoftError ? ` (${result.hawksoftError})` : '';
                statusMsg = `⚠️ HawkSoft push failed — copy the log manually`;
                console.warn('[HawkSoft Logger] ── PUSH FAILURE DIAGNOSTICS ──');
                console.warn('[HawkSoft Logger]   hawksoftError:', result.hawksoftError);
                console.warn('[HawkSoft Logger]   hawksoftStatus:', result.hawksoftStatus);
                console.warn('[HawkSoft Logger]   Request sent:', JSON.stringify({
                    clientNumber: _pendingLog.clientNumber,
                    policyId: _pendingLog.policyId,
                    callType: _pendingLog.callType,
                    logLength: (_pendingLog.formattedLog || '').length
                }));
                console.warn('[HawkSoft Logger]   Server response:', JSON.stringify({
                    hawksoftLogged: result.hawksoftLogged,
                    hawksoftStatus: result.hawksoftStatus,
                    clientNumber: result.clientNumber,
                    policyId: result.policyId,
                    callType: result.callType
                }));
                App.toast(statusMsg + errDetail, 'error');
                // Keep confirm section visible so user can copy/retry
            } else {
                statusMsg = '✅ Formatted — copy log manually';
                App.toast(statusMsg, 'success');
                // Keep confirm section visible so user can copy
            }

        } catch (error) {
            App.toast('Error: ' + (error.message || 'Failed to send to HawkSoft'), 'error');
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirm & Push to HawkSoft';
            }
        }
    }

    // ── Edit: Toggle inline editing of formatted output ──

    function _handleEdit() {
        const previewEl = document.getElementById('clPreview');
        const previewTextEl = document.getElementById('clPreviewText');
        const cancelBtn = document.getElementById('clCancelBtn');
        const formatBtn = document.getElementById('clSubmitBtn');

        if (!_pendingLog || !previewEl || !previewTextEl) {
            // No pending log — full reset
            _pendingLog = null;
            _resetToFormatMode();
            if (previewEl) previewEl.style.display = 'none';
            const cs = document.getElementById('clConfirmSection');
            if (cs) cs.style.display = 'none';
            return;
        }

        // Check if already in edit mode (textarea exists)
        const existing = previewEl.querySelector('.cl-edit-textarea');
        if (existing) {
            // Exit edit mode — save edits
            _pendingLog.formattedLog = existing.value;
            previewTextEl.textContent = _pendingLog.formattedLog;
            previewTextEl.style.display = '';
            existing.remove();
            if (cancelBtn) cancelBtn.textContent = 'Edit';
            if (formatBtn) formatBtn.innerHTML = '<span class="cl-btn-text">Re-format</span><svg class="cl-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
            App.toast('Edits saved', 'success');
            return;
        }

        // Enter edit mode — show textarea with formatted text
        const textarea = document.createElement('textarea');
        textarea.className = 'cl-edit-textarea';
        textarea.value = _pendingLog.formattedLog;
        previewTextEl.style.display = 'none';
        previewTextEl.insertAdjacentElement('afterend', textarea);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        if (cancelBtn) cancelBtn.textContent = 'Done Editing';
        if (formatBtn) formatBtn.textContent = 'Done Editing';
    }

    // ── Copy formatted log ──

    function _handleCopy() {
        const previewTextEl = document.getElementById('clPreviewText');
        if (!previewTextEl) return;

        const text = previewTextEl.textContent;
        if (!text) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                App.toast('Copied to clipboard', 'success');
            }).catch(() => {
                _fallbackCopy(text);
            });
        } else {
            _fallbackCopy(text);
        }
    }

    function _fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            App.toast('Copied to clipboard', 'success');
        } catch (e) {
            App.toast('Copy failed — select and copy manually', 'error');
        }
        document.body.removeChild(ta);
    }

    // ── Helpers ──

    function _resetToFormatMode() {
        const formatBtn = document.getElementById('clSubmitBtn');
        const confirmSection = document.getElementById('clConfirmSection');
        if (formatBtn) {
            formatBtn.innerHTML = '<span class="cl-btn-text">Format &amp; Preview</span><svg class="cl-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg><span class="cl-btn-spinner"></span>';
            formatBtn.classList.remove('cl-edit-mode');
            formatBtn.classList.remove('cl-loading');
        }
        if (confirmSection) {
            confirmSection.style.display = 'none';
        }
    }

    /**
     * Full form reset — clears client, channel, activity, notes, preview/confirm.
     * Keeps agent initials (they rarely change between calls).
     */
    function _resetForm() {
        // Reset internal state
        _selectedClient = null;
        _selectedPolicy = null;
        _selectedChannel = 'Inbound';
        _selectedActivityType = null;
        _lastTemplate = '';
        _pendingLog = null;

        // Clear form inputs
        const policyEl = document.getElementById('clPolicyId');
        const notesEl = document.getElementById('clRawNotes');
        if (policyEl) policyEl.value = '';
        if (notesEl) notesEl.value = '';

        // Hide client dropdown + policy selector
        const dropdown = document.getElementById('clClientDropdown');
        const policySelect = document.getElementById('clPolicySelect');
        const policyList = document.getElementById('clPolicyList');
        if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
        if (policySelect) policySelect.style.display = 'none';
        if (policyList) policyList.innerHTML = '';

        // Reset channel buttons to Inbound
        _applyChannelUI();

        // Reset activity buttons (deselect all)
        _applyActivityUI();

        // Hide preview + confirm
        const previewEl = document.getElementById('clPreview');
        const previewTextEl = document.getElementById('clPreviewText');
        const confirmSection = document.getElementById('clConfirmSection');
        const confirmInfo = document.getElementById('clConfirmInfo');
        if (previewEl) previewEl.style.display = 'none';
        if (previewTextEl) previewTextEl.textContent = '';
        if (confirmSection) confirmSection.style.display = 'none';
        if (confirmInfo) confirmInfo.innerHTML = '';

        // Remove any edit textarea
        const editTA = document.querySelector('.cl-edit-textarea');
        if (editTA) editTA.remove();

        // Reset submit button
        _resetToFormatMode();

        // Focus the client search input
        if (policyEl) policyEl.focus();
    }

    function _escapeHTML(str) { return Utils.escapeHTML(str); }

    /**
     * Build a clickable HawkSoft link for a client name.
     * Desktop: hs:// protocol → HawkSoft desktop app
     * Mobile:  Agent Portal web URL
     * Falls back to bold text if no hawksoftId.
     */
    function _buildClientLink(name, hawksoftId) {
        const escaped = _escapeHTML(name);
        if (!hawksoftId) return `<strong>${escaped}</strong>`;
        const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
        const href = isMobile
            ? `https://agents.hawksoft.app/client/${encodeURIComponent(hawksoftId)}`
            : `hs://${encodeURIComponent(hawksoftId)}`;
        const title = isMobile ? 'Open in HawkSoft Agent Portal' : 'Open in HawkSoft';
        return `<a href="${href}" class="cl-client-link" title="${title}" target="_blank" rel="noopener">${escaped}</a>`;
    }

    // ── Event Wiring ──

    function _wireEvents() {
        // Client search / autocomplete on the policy ID input
        const policyInput = document.getElementById('clPolicyId');
        if (policyInput && !policyInput._clSearchWired) {
            policyInput.addEventListener('input', () => {
                clearTimeout(_searchTimer);
                _searchTimer = setTimeout(_handleClientSearch, 150);
            });
            policyInput.addEventListener('focus', () => {
                // Re-show dropdown if there's already text
                if (policyInput.value.trim().length >= 2) {
                    _handleClientSearch();
                }
            });
            policyInput._clSearchWired = true;
        }

        // Close dropdown when clicking outside
        if (!document._clOutsideWired) {
            document.addEventListener('click', _handleClickOutside);
            document._clOutsideWired = true;
        }

        // Format / Re-format button
        const submitBtn = document.getElementById('clSubmitBtn');
        if (submitBtn && !submitBtn._clWired) {
            submitBtn.addEventListener('click', () => {
                // If in edit mode, check if we should toggle edit or re-format
                const editTA = document.querySelector('.cl-edit-textarea');
                if (editTA && _pendingLog) {
                    // In edit mode — toggle out (save edits) via _handleEdit
                    _handleEdit();
                    return;
                }
                // Otherwise always (re-)format via AI
                _handleFormat();
            });
            submitBtn._clWired = true;
        }

        // Confirm button
        const confirmBtn = document.getElementById('clConfirmBtn');
        if (confirmBtn && !confirmBtn._clWired) {
            confirmBtn.addEventListener('click', _handleConfirm);
            confirmBtn._clWired = true;
        }

        // Cancel button (goes back to edit)
        const cancelBtn = document.getElementById('clCancelBtn');
        if (cancelBtn && !cancelBtn._clWired) {
            cancelBtn.addEventListener('click', _handleEdit);
            cancelBtn._clWired = true;
        }

        // Copy button
        const copyBtn = document.getElementById('clCopyBtn');
        if (copyBtn && !copyBtn._clWired) {
            copyBtn.addEventListener('click', _handleCopy);
            copyBtn._clWired = true;
        }

        // Refresh clients button
        const refreshBtn = document.getElementById('clRefreshBtn');
        if (refreshBtn && !refreshBtn._clWired) {
            refreshBtn.addEventListener('click', _refreshPolicies);
            refreshBtn._clWired = true;
        }

        // + New Log button
        const newLogBtn = document.getElementById('clNewLogBtn');
        if (newLogBtn && !newLogBtn._clWired) {
            newLogBtn.addEventListener('click', _resetForm);
            newLogBtn._clWired = true;
        }

        // Channel buttons (event delegation)
        const channelGroup = document.getElementById('clChannelGroup');
        if (channelGroup && !channelGroup._clWired) {
            channelGroup.addEventListener('click', (e) => {
                const btn = e.target.closest('.cl-channel-btn');
                if (btn && btn.dataset.channel) _handleChannelSelect(btn.dataset.channel);
            });
            channelGroup._clWired = true;
        }

        // Activity type pills (event delegation)
        const activityGroup = document.getElementById('clActivityGroup');
        if (activityGroup && !activityGroup._clWired) {
            activityGroup.addEventListener('click', (e) => {
                const btn = e.target.closest('.cl-activity-btn');
                if (btn && btn.dataset.activity) _handleActivitySelect(btn.dataset.activity, btn.dataset.template || '');
            });
            activityGroup._clWired = true;
        }
    }

    return { init, render, resetForm: _resetForm, _getClients, _policyTypeLabel, _policyTypeIcon, _selectClient, _selectPolicy, _handleClientSearch, _buildClientLink, _ensurePoliciesLoaded, _updateStatusBar, _refreshPolicies, _handleChannelSelect, _handleActivitySelect, getSelectedPolicy: () => _selectedPolicy, getSelectedChannel: () => _selectedChannel, getSelectedActivityType: () => _selectedActivityType };
})();
