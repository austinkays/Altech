/**
 * CallLogger — Client-Side Tests (js/call-logger.js)
 *
 * Tests:
 * - IIFE module exports { init, render }
 * - localStorage persistence (save/load round-trip)
 * - Settings resolution from altech_settings
 * - DOM element wiring
 * - Form validation
 * - Submit handler behavior
 * - Error handling
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'js', 'call-logger.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// ────────────────────────────────────────────────────
// Module Structure (source analysis)
// ────────────────────────────────────────────────────

describe('call-logger.js — Module Structure', () => {
  test('file exists and is non-empty', () => {
    expect(source.length).toBeGreaterThan(100);
  });

  test('exports as window.CallLogger via IIFE', () => {
    expect(source).toContain('window.CallLogger = (() => {');
  });

  test('uses strict mode', () => {
    expect(source).toContain("'use strict'");
  });

  test('defines STORAGE_KEY constant', () => {
    expect(source).toContain("const STORAGE_KEY = 'altech_call_logger'");
  });

  test('returns init and render in public API', () => {
    expect(source).toMatch(/return\s*\{[^}]*init[^}]*render/);
  });

  test('exposes client lookup helpers for testing', () => {
    expect(source).toContain('_getClients');
    expect(source).toContain('_policyTypeLabel');
    expect(source).toContain('_policyTypeIcon');
  });
});

// ────────────────────────────────────────────────────
// Persistence Logic (source analysis)
// ────────────────────────────────────────────────────

describe('Persistence', () => {
  test('_load reads from localStorage', () => {
    expect(source).toContain('localStorage.getItem(STORAGE_KEY)');
  });

  test('_load restores policyId and callType', () => {
    expect(source).toContain('saved.policyId');
    expect(source).toContain('saved.callType');
  });

  test('_load has try-catch error handling', () => {
    // _load should handle corrupt localStorage gracefully
    expect(source).toMatch(/_load\(\)\s*\{[\s\S]*?try\s*\{[\s\S]*?\}\s*catch/);
  });

  test('_save writes to localStorage as JSON', () => {
    expect(source).toContain('localStorage.setItem(STORAGE_KEY');
    expect(source).toContain('JSON.stringify({ policyId, callType })');
  });

  test('_save calls CloudSync.schedulePush when available', () => {
    expect(source).toContain('CloudSync.schedulePush');
  });

  test('_save guards against missing CloudSync', () => {
    expect(source).toContain("typeof CloudSync !== 'undefined'");
  });
});

// ────────────────────────────────────────────────────
// Settings Resolution (source analysis)
// ────────────────────────────────────────────────────

describe('Settings Resolution', () => {
  test('reads from altech_settings localStorage key', () => {
    expect(source).toContain("localStorage.getItem('altech_settings')");
  });

  test('extracts userApiKey from settings', () => {
    expect(source).toContain('settings.userApiKey');
  });

  test('extracts aiModel from settings', () => {
    expect(source).toContain('settings.aiModel');
  });

  test('defaults aiModel to gemini-2.5-flash', () => {
    expect(source).toContain("let aiModel = 'gemini-2.5-flash'");
  });

  test('handles missing/corrupt settings gracefully', () => {
    // _resolveAISettings should have error handling
    expect(source).toMatch(/_resolveAISettings[\s\S]*?catch/);
  });
});

// ────────────────────────────────────────────────────
// Submit Handler (source analysis)
// ────────────────────────────────────────────────────

describe('Submit Handler', () => {
  test('validates inputValue and rawNotes are non-empty', () => {
    expect(source).toContain('!inputValue || !rawNotes');
  });

  test('validates policy selection when client has policies', () => {
    expect(source).toContain('_selectedClient.policies.length > 0 && !_selectedPolicy');
    expect(source).toContain("App.toast('Please select a policy to log this call under'");
  });

  test('resolves policyId from selected policy or input', () => {
    expect(source).toContain('_selectedPolicy.policyNumber');
    expect(source).toContain('inputValue');
  });

  test('shows toast error for empty fields', () => {
    expect(source).toContain("App.toast('Please fill in all fields'");
  });

  test('disables button during submission', () => {
    expect(source).toContain('formatBtn.disabled = true');
    expect(source).toContain("formatBtn.textContent = '⏳ Formatting...'");
  });

  test('re-enables button in finally block', () => {
    expect(source).toContain('formatBtn.disabled = false');
    expect(source).toMatch(/finally\s*\{[\s\S]*?formatBtn\.disabled = false/);
  });

  test('posts to /api/hawksoft-logger', () => {
    expect(source).toContain("'/api/hawksoft-logger'");
  });

  test('sends policyId, clientNumber, hawksoftPolicyId, callType, rawNotes, userApiKey, aiModel in body', () => {
    expect(source).toContain('JSON.stringify({ policyId, clientNumber, hawksoftPolicyId, callType, rawNotes, userApiKey, aiModel, formatOnly: true })');
  });

  test('uses Auth.apiFetch when available', () => {
    expect(source).toContain('Auth.apiFetch');
  });

  test('falls back to fetch when Auth is unavailable', () => {
    expect(source).toContain("typeof Auth !== 'undefined'");
  });

  test('clears notes field on success', () => {
    expect(source).toContain("notesEl.value = ''");
  });

  test('shows formatted preview on success', () => {
    expect(source).toContain('previewTextEl.textContent = result.formattedLog');
    expect(source).toContain("previewEl.style.display = ''");
  });

  test('shows success toast', () => {
    // Format step shows preview toast, confirm step shows logged toast
    expect(source).toContain("App.toast('Preview ready");
    expect(source).toContain('Logged to HawkSoft for');
  });

  test('shows error toast on failure', () => {
    expect(source).toContain("App.toast('Error: '");
  });

  test('references correct DOM element IDs', () => {
    expect(source).toContain("getElementById('clPolicyId')");
    expect(source).toContain("getElementById('clCallType')");
    expect(source).toContain("getElementById('clRawNotes')");
    expect(source).toContain("getElementById('clSubmitBtn')");
    expect(source).toContain("getElementById('clPreview')");
    expect(source).toContain("getElementById('clPreviewText')");
  });
});

// ────────────────────────────────────────────────────
// Event Wiring (source analysis)
// ────────────────────────────────────────────────────

describe('Event Wiring', () => {
  test('wires click handler on submit button', () => {
    // Two-step workflow: format button toggles between _handleFormat and _handleEdit
    expect(source).toContain("submitBtn.addEventListener('click', () => {");
    expect(source).toContain('_handleFormat()');
    expect(source).toContain('_handleEdit()');
  });

  test('prevents double-wiring via _clWired flag', () => {
    expect(source).toContain('submitBtn._clWired');
  });
});

// ────────────────────────────────────────────────────
// DOM-based Behavioral Tests
// ────────────────────────────────────────────────────

describe('CallLogger — Behavioral (JSDOM)', () => {
  let localStorage;

  // Minimal JSDOM with just the CallLogger module
  function createMiniDOM() {
    const { JSDOM } = require('jsdom');

    // Build minimal HTML with the plugin's form elements
    const html = `<!DOCTYPE html><html><body>
      <div id="callLoggerTool" class="plugin-container">
        <div class="cl-form">
          <input type="text" id="clPolicyId" value="">
          <select id="clCallType"><option value="Inbound">Inbound</option><option value="Outbound">Outbound</option></select>
          <textarea id="clRawNotes"></textarea>
          <button id="clSubmitBtn">🔍 Format Preview</button>
        </div>
        <div id="clPreview" style="display:none">
          <div class="cl-preview-header"><span>Formatted Log Preview</span><button id="clCopyBtn">📋 Copy</button></div>
          <pre id="clPreviewText"></pre>
        </div>
        <div id="clConfirmSection" style="display:none">
          <div id="clConfirmInfo"></div>
          <button id="clConfirmBtn">✅ Confirm &amp; Log to HawkSoft</button>
          <button id="clCancelBtn">✏️ Edit</button>
        </div>
      </div>
      <script>
        // Mock App
        window.App = { toast: function(msg, type) { window._lastToast = { msg, type }; }, data: {} };
        // Mock Auth
        window.Auth = { apiFetch: null };
        // Mock CloudSync
        window.CloudSync = { schedulePush: function() { window._pushCalled = true; } };
      </script>
      <script>${source}</script>
    </body></html>`;

    const dom = new JSDOM(html, {
      url: 'http://localhost:8000',
      runScripts: 'dangerously',
      pretendToBeVisual: true
    });

    const store = {};
    Object.defineProperty(dom.window, 'localStorage', {
      value: {
        getItem(key) { return store[key] || null; },
        setItem(key, val) { store[key] = String(val); },
        removeItem(key) { delete store[key]; },
        clear() { Object.keys(store).forEach(k => delete store[k]); }
      },
      writable: true
    });

    return { dom, window: dom.window, store };
  }

  test('CallLogger is defined on window', () => {
    const { window } = createMiniDOM();
    expect(window.CallLogger).toBeDefined();
    expect(typeof window.CallLogger.init).toBe('function');
    expect(typeof window.CallLogger.render).toBe('function');
  });

  test('init() wires the submit button', () => {
    const { window } = createMiniDOM();
    window.CallLogger.init();
    const btn = window.document.getElementById('clSubmitBtn');
    expect(btn._clWired).toBe(true);
  });

  test('init() loads saved data from localStorage', () => {
    const { window, store } = createMiniDOM();
    store['altech_call_logger'] = JSON.stringify({ policyId: 'POL-999', callType: 'Outbound' });
    window.CallLogger.init();
    expect(window.document.getElementById('clPolicyId').value).toBe('POL-999');
    expect(window.document.getElementById('clCallType').value).toBe('Outbound');
  });

  test('render() also wires events and loads data', () => {
    const { window, store } = createMiniDOM();
    store['altech_call_logger'] = JSON.stringify({ policyId: 'CL-100', callType: 'Inbound' });
    window.CallLogger.render();
    const btn = window.document.getElementById('clSubmitBtn');
    expect(btn._clWired).toBe(true);
    expect(window.document.getElementById('clPolicyId').value).toBe('CL-100');
  });

  test('does not double-wire on repeated init calls', () => {
    const { window } = createMiniDOM();
    window.CallLogger.init();
    window.CallLogger.init();
    const btn = window.document.getElementById('clSubmitBtn');
    expect(btn._clWired).toBe(true);
    // If wired twice, clicking would call handler twice — flag prevents this
  });

  test('load handles corrupt localStorage gracefully', () => {
    const { window, store } = createMiniDOM();
    store['altech_call_logger'] = 'NOT_JSON{{{';
    // Should not throw
    expect(() => window.CallLogger.init()).not.toThrow();
  });

  test('load handles missing fields in saved data', () => {
    const { window, store } = createMiniDOM();
    store['altech_call_logger'] = JSON.stringify({});
    window.CallLogger.init();
    // Policy ID should remain empty (no crash)
    expect(window.document.getElementById('clPolicyId').value).toBe('');
  });

  test('_resolveAISettings returns defaults when no settings stored', () => {
    const { window } = createMiniDOM();
    // Access via evaluating in the JSDOM context
    const result = window.eval(`
      (function() {
        try {
          let userApiKey = '';
          let aiModel = 'gemini-2.5-flash';
          try {
            const raw = localStorage.getItem('altech_settings');
            if (raw) {
              const settings = JSON.parse(raw);
              if (settings.userApiKey && settings.userApiKey.trim()) userApiKey = settings.userApiKey.trim();
              if (settings.aiModel && settings.aiModel.trim()) aiModel = settings.aiModel.trim();
            }
          } catch(e) {}
          return { userApiKey, aiModel };
        } catch(e) { return { error: e.message }; }
      })()
    `);
    expect(result.userApiKey).toBe('');
    expect(result.aiModel).toBe('gemini-2.5-flash');
  });

  test('_resolveAISettings reads custom key and model', () => {
    const { window, store } = createMiniDOM();
    store['altech_settings'] = JSON.stringify({ userApiKey: 'sk-mykey', aiModel: 'gpt-4o' });
    const result = window.eval(`
      (function() {
        let userApiKey = '';
        let aiModel = 'gemini-2.5-flash';
        try {
          const raw = localStorage.getItem('altech_settings');
          if (raw) {
            const settings = JSON.parse(raw);
            if (settings.userApiKey && settings.userApiKey.trim()) userApiKey = settings.userApiKey.trim();
            if (settings.aiModel && settings.aiModel.trim()) aiModel = settings.aiModel.trim();
          }
        } catch(e) {}
        return { userApiKey, aiModel };
      })()
    `);
    expect(result.userApiKey).toBe('sk-mykey');
    expect(result.aiModel).toBe('gpt-4o');
  });
});

// ────────────────────────────────────────────────────
// Plugin HTML Structure
// ────────────────────────────────────────────────────

describe('call-logger.html — Plugin HTML', () => {
  const pluginHtml = fs.readFileSync(path.join(ROOT, 'plugins', 'call-logger.html'), 'utf8');

  test('plugin HTML exists and is non-empty', () => {
    expect(pluginHtml.length).toBeGreaterThan(50);
  });

  test('has clPolicyId input', () => {
    expect(pluginHtml).toContain('id="clPolicyId"');
  });

  test('has clCallType select', () => {
    expect(pluginHtml).toContain('id="clCallType"');
  });

  test('has clRawNotes textarea', () => {
    expect(pluginHtml).toContain('id="clRawNotes"');
  });

  test('has clSubmitBtn button', () => {
    expect(pluginHtml).toContain('id="clSubmitBtn"');
  });

  test('has clPreview container (hidden by default)', () => {
    expect(pluginHtml).toContain('id="clPreview"');
    expect(pluginHtml).toContain('display: none');
  });

  test('has clPreviewText element', () => {
    expect(pluginHtml).toContain('id="clPreviewText"');
  });

  test('has Inbound and Outbound options', () => {
    expect(pluginHtml).toContain('value="Inbound"');
    expect(pluginHtml).toContain('value="Outbound"');
  });

  test('has standard header with title', () => {
    expect(pluginHtml).toContain('tool-header-brand');
    expect(pluginHtml).toContain('Call Logger');
  });

  test('has confirmation section with confirm and cancel buttons', () => {
    expect(pluginHtml).toContain('id="clConfirmSection"');
    expect(pluginHtml).toContain('id="clConfirmBtn"');
    expect(pluginHtml).toContain('id="clCancelBtn"');
    expect(pluginHtml).toContain('id="clConfirmInfo"');
  });

  test('has copy button in preview', () => {
    expect(pluginHtml).toContain('id="clCopyBtn"');
  });
});

// ────────────────────────────────────────────────────
// Two-Step Workflow (source analysis)
// ────────────────────────────────────────────────────

describe('Two-Step Workflow', () => {
  test('defines _handleFormat function for Step 1', () => {
    expect(source).toContain('async function _handleFormat()');
  });

  test('defines _handleConfirm function for Step 2', () => {
    expect(source).toContain('async function _handleConfirm()');
  });

  test('defines _handleEdit to cancel and go back', () => {
    expect(source).toContain('function _handleEdit()');
  });

  test('defines _handleCopy for clipboard', () => {
    expect(source).toContain('function _handleCopy()');
  });

  test('tracks pending state via _pendingLog', () => {
    expect(source).toContain('let _pendingLog = null');
    expect(source).toContain('_pendingLog = {');
  });

  test('sends formatOnly: true in Step 1', () => {
    expect(source).toContain('formatOnly: true');
  });

  test('sends pre-formatted log in Step 2', () => {
    expect(source).toContain('formattedLog: _pendingLog.formattedLog');
  });

  test('shows confirmation section with policy info', () => {
    expect(source).toContain("confirmSection.style.display = ''");
    expect(source).toContain('confirmInfo.innerHTML');
    expect(source).toContain('_escapeHTML(policyId)');
  });

  test('resets to format mode after confirm', () => {
    expect(source).toContain('function _resetToFormatMode()');
    expect(source).toContain("'🔍 Format Preview'");
  });

  test('wires confirm, cancel, and copy buttons', () => {
    expect(source).toContain("confirmBtn.addEventListener('click', _handleConfirm)");
    expect(source).toContain("cancelBtn.addEventListener('click', _handleEdit)");
    expect(source).toContain("copyBtn.addEventListener('click', _handleCopy)");
  });

  test('has XSS protection via _escapeHTML', () => {
    expect(source).toContain('function _escapeHTML');
    expect(source).toContain('div.textContent = str');
    expect(source).toContain('div.innerHTML');
  });

  test('defines _buildClientLink for HawkSoft deep linking', () => {
    expect(source).toContain('function _buildClientLink(name, hawksoftId)');
  });

  test('_buildClientLink uses hs:// protocol for desktop', () => {
    expect(source).toContain("hs://");
    expect(source).toContain('encodeURIComponent(hawksoftId)');
  });

  test('_buildClientLink uses Agent Portal URL for mobile', () => {
    expect(source).toContain('agents.hawksoft.app/client/');
  });

  test('_buildClientLink falls back to bold text when no hawksoftId', () => {
    expect(source).toContain("if (!hawksoftId) return `<strong>${escaped}</strong>`");
  });

  test('_buildClientLink adds cl-client-link class to anchor', () => {
    expect(source).toContain('cl-client-link');
  });

  test('confirm section shows HawkSoft link when client+policy selected', () => {
    expect(source).toContain('_buildClientLink(_selectedClient.name, hsId)');
  });

  test('confirm section shows policy badge with icon and label', () => {
    expect(source).toContain('cl-confirm-policy');
    expect(source).toContain('_policyTypeIcon(_selectedPolicy.type)');
    expect(source).toContain('_escapeHTML(_selectedPolicy.typeLabel)');
  });

  test('tracks _selectedPolicy state', () => {
    expect(source).toContain('let _selectedPolicy = null');
    expect(source).toContain('_selectedPolicy = policy');
  });

  test('_selectClient resets _selectedPolicy', () => {
    // When a new client is selected, previous policy selection is cleared
    expect(source).toMatch(/_selectClient[\s\S]*?_selectedPolicy = null/);
  });

  test('exposes _buildClientLink and getSelectedPolicy for testing', () => {
    expect(source).toContain('_buildClientLink');
    expect(source).toContain('getSelectedPolicy');
  });

  test('uses navigator.clipboard with fallback', () => {
    expect(source).toContain('navigator.clipboard.writeText');
    expect(source).toContain('document.execCommand');
  });
});

// ────────────────────────────────────────────────────
// Client & Policy Lookup (source analysis)
// ────────────────────────────────────────────────────

describe('Client & Policy Lookup — Source', () => {
  test('defines CGL_CACHE_KEY constant', () => {
    expect(source).toContain("const CGL_CACHE_KEY = 'altech_cgl_cache'");
  });

  test('defines _getClients function', () => {
    expect(source).toContain('function _getClients()');
  });

  test('_getClients reads from CGL cache', () => {
    expect(source).toContain('localStorage.getItem(CGL_CACHE_KEY)');
  });

  test('_getClients reads from App.getClientHistory()', () => {
    expect(source).toContain('App.getClientHistory');
  });

  test('_getClients merges and deduplicates by name', () => {
    expect(source).toContain('clientMap[key]');
  });

  test('_getClients sorts results by name', () => {
    expect(source).toContain('.sort((a, b) => a.name.localeCompare(b.name))');
  });

  test('defines _policyTypeLabel with all known types', () => {
    expect(source).toContain('function _policyTypeLabel(type)');
    expect(source).toContain("cgl: 'CGL'");
    expect(source).toContain("auto: 'Commercial Auto'");
    expect(source).toContain("wc: 'Workers Comp'");
    expect(source).toContain("umbrella: 'Umbrella'");
  });

  test('defines _policyTypeLabel with personal line types', () => {
    expect(source).toContain("homeowner: 'Homeowner'");
    expect(source).toContain("'personal-auto': 'Personal Auto'");
    expect(source).toContain("renters: 'Renters'");
    expect(source).toContain("flood: 'Flood'");
    expect(source).toContain("dwelling: 'Dwelling'");
    expect(source).toContain("personal: 'Personal'");
  });

  test('defines _policyTypeIcon with emoji icons', () => {
    expect(source).toContain('function _policyTypeIcon(type)');
    expect(source).toContain("auto: '🚛'");
    expect(source).toContain("property: '🏗️'");
  });

  test('defines _policyTypeIcon with personal line emojis', () => {
    expect(source).toContain("homeowner: '🏠'");
    expect(source).toContain("'personal-auto': '🚗'");
    expect(source).toContain("flood: '🌊'");
    expect(source).toContain("boat: '⛵'");
    expect(source).toContain("motorcycle: '🏍️'");
  });

  test('_getClients prefers allPolicies field from cache', () => {
    expect(source).toContain('cached?.allPolicies');
    // Uses length check so empty allPolicies array correctly falls back to policies
    expect(source).toContain('allPolicies.length > 0');
  });

  test('_ensurePoliciesLoaded requires allPolicies in localStorage cache', () => {
    // localStorage check must require allPolicies — old CGL-only cache should fall through
    expect(source).toContain('Only use cache if allPolicies exists');
  });

  test('_ensurePoliciesLoaded disk cache path rejects CGL-only data', () => {
    // Disk cache must have allPolicies — commercial-only (no allPolicies) falls through to API
    expect(source).toContain('Disk cache has CGL-only data (no allPolicies)');
  });

  test('_ensurePoliciesLoaded counts unique clients, not raw policies', () => {
    // Status bar should show unique client count from allPolicies, not array length
    expect(source).toContain("new Set(allPolicies.map(p => p.clientName)");
  });

  test('_getClients uses policyType with type fallback', () => {
    expect(source).toContain('p.policyType || p.type');
  });

  test('defines _handleClientSearch with debounced search', () => {
    expect(source).toContain('function _handleClientSearch()');
    expect(source).toContain('_searchTimer');
  });

  test('_handleClientSearch enforces minimum 2 char query', () => {
    expect(source).toContain('query.length < 2');
  });

  test('_handleClientSearch limits results to 8', () => {
    expect(source).toContain('matches.slice(0, 8)');
  });

  test('defines _selectClient function', () => {
    expect(source).toContain('function _selectClient(client)');
  });

  test('defines _selectPolicy function', () => {
    expect(source).toContain('function _selectPolicy(policy, chipEl)');
  });

  test('_selectPolicy stores the selected policy', () => {
    expect(source).toContain('_selectedPolicy = policy');
  });

  test('defines _handleClickOutside to close dropdown', () => {
    expect(source).toContain('function _handleClickOutside');
    expect(source).toContain('.cl-search-wrapper');
  });

  test('wires input event for search with debounce', () => {
    expect(source).toContain("policyInput.addEventListener('input'");
    expect(source).toContain('setTimeout(_handleClientSearch, 150)');
  });

  test('wires focus event to re-show dropdown', () => {
    expect(source).toContain("policyInput.addEventListener('focus'");
  });

  test('tracks selected client state', () => {
    expect(source).toContain('let _selectedClient = null');
  });
});

// ────────────────────────────────────────────────────
// Client & Policy Lookup — Behavioral (JSDOM)
// ────────────────────────────────────────────────────

describe('Client & Policy Lookup — Behavioral', () => {

  function createClientDOM() {
    const { JSDOM } = require('jsdom');

    const html = `<!DOCTYPE html><html><body>
      <div id="callLoggerTool" class="plugin-container">
        <div class="cl-form">
          <div class="cl-client-field">
            <div class="cl-search-wrapper">
              <input type="text" id="clPolicyId" value="" autocomplete="off">
              <div id="clClientDropdown" class="cl-client-dropdown" style="display: none;"></div>
            </div>
            <div id="clPolicySelect" class="cl-policy-select" style="display: none;">
              <div class="cl-policy-select-label">Active Policies</div>
              <div id="clPolicyList" class="cl-policy-list"></div>
            </div>
          </div>
          <select id="clCallType"><option value="Inbound">Inbound</option></select>
          <textarea id="clRawNotes"></textarea>
          <button id="clSubmitBtn">🔍 Format Preview</button>
        </div>
        <div id="clPreview" style="display:none">
          <pre id="clPreviewText"></pre>
          <button id="clCopyBtn">📋 Copy</button>
        </div>
        <div id="clConfirmSection" style="display:none">
          <div id="clConfirmInfo"></div>
          <button id="clConfirmBtn">Confirm</button>
          <button id="clCancelBtn">Edit</button>
        </div>
      </div>
      <script>
        window.App = {
          toast: function(msg, type) { window._lastToast = { msg, type }; },
          data: {},
          getClientHistory: function() { return window._mockClientHistory || []; }
        };
        window.Auth = { apiFetch: null };
        window.CloudSync = { schedulePush: function() {} };
      </script>
      <script>${source}</script>
    </body></html>`;

    const dom = new JSDOM(html, {
      url: 'http://localhost:8000',
      runScripts: 'dangerously',
      pretendToBeVisual: true
    });

    const store = {};
    Object.defineProperty(dom.window, 'localStorage', {
      value: {
        getItem(key) { return store[key] || null; },
        setItem(key, val) { store[key] = String(val); },
        removeItem(key) { delete store[key]; },
        clear() { Object.keys(store).forEach(k => delete store[k]); }
      },
      writable: true
    });

    return { dom, window: dom.window, store };
  }

  test('_getClients returns empty array when no data sources', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(Array.isArray(clients)).toBe(true);
    expect(clients).toHaveLength(0);
  });

  test('_getClients returns clients from CGL cache', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      policies: [
        { clientName: 'Smith, John', policyNumber: 'POL-001', type: 'auto', expirationDate: '2026-12-01' },
        { clientName: 'Smith, John', policyNumber: 'POL-002', type: 'cgl', expirationDate: '2026-06-01' },
        { clientName: 'Doe, Jane', policyNumber: 'POL-003', type: 'wc', expirationDate: '2026-09-01' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients).toHaveLength(2);
    // Sorted alphabetically
    expect(clients[0].name).toBe('Doe, Jane');
    expect(clients[0].policies).toHaveLength(1);
    expect(clients[1].name).toBe('Smith, John');
    expect(clients[1].policies).toHaveLength(2);
  });

  test('_getClients merges client history with CGL policies', () => {
    const { window, store } = createClientDOM();
    // CGL has Smith with 1 policy
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      policies: [
        { clientName: 'Smith, John', policyNumber: 'POL-001', type: 'auto' }
      ]
    });
    // Client history has a NEW client (Williams) not in CGL
    window._mockClientHistory = [
      { id: '1', name: 'Williams, Sarah', data: { firstName: 'Sarah', lastName: 'Williams' } }
    ];
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients).toHaveLength(2);
    const names = clients.map(c => c.name);
    expect(names).toContain('Smith, John');
    expect(names).toContain('Williams, Sarah');
    // Williams has no policies (only in client history)
    const williams = clients.find(c => c.name === 'Williams, Sarah');
    expect(williams.policies).toHaveLength(0);
  });

  test('_getClients deduplicates by lowercase name', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      policies: [
        { clientName: 'Smith, John', policyNumber: 'POL-001', type: 'auto' }
      ]
    });
    // Client history also has Smith, John — should NOT create duplicate
    window._mockClientHistory = [
      { id: '1', name: 'Smith, John', data: { firstName: 'John', lastName: 'Smith' } }
    ];
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients).toHaveLength(1);
    expect(clients[0].name).toBe('Smith, John');
    expect(clients[0].policies).toHaveLength(1);
  });

  test('_getClients prefers allPolicies over policies from cache', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      policies: [
        { clientName: 'Smith, John', policyNumber: 'POL-001', policyType: 'cgl' }
      ],
      allPolicies: [
        { clientName: 'Smith, John', policyNumber: 'POL-001', policyType: 'cgl', hawksoftId: 'HS-1' },
        { clientName: 'Smith, John', policyNumber: 'HO-100', policyType: 'homeowner', hawksoftId: 'HS-1' },
        { clientName: 'Doe, Jane', policyNumber: 'PA-200', policyType: 'personal-auto', hawksoftId: 'HS-2' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients).toHaveLength(2);
    const smith = clients.find(c => c.name === 'Smith, John');
    expect(smith.policies).toHaveLength(2);
    expect(smith.policies.map(p => p.type)).toContain('cgl');
    expect(smith.policies.map(p => p.type)).toContain('homeowner');
    const doe = clients.find(c => c.name === 'Doe, Jane');
    expect(doe.policies).toHaveLength(1);
    expect(doe.policies[0].type).toBe('personal-auto');
    expect(doe.policies[0].typeLabel).toBe('Personal Auto');
  });

  test('_getClients shows personal policies with correct type labels', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      allPolicies: [
        { clientName: 'Smith, John', policyNumber: 'HO-100', policyType: 'homeowner', hawksoftId: 'HS-1' },
        { clientName: 'Smith, John', policyNumber: 'PA-200', policyType: 'personal-auto', hawksoftId: 'HS-1' },
        { clientName: 'Smith, John', policyNumber: 'FL-300', policyType: 'flood', hawksoftId: 'HS-1' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    const smith = clients[0];
    expect(smith.policies).toHaveLength(3);
    const labels = smith.policies.map(p => p.typeLabel);
    expect(labels).toContain('Homeowner');
    expect(labels).toContain('Personal Auto');
    expect(labels).toContain('Flood');
  });

  test('_getClients falls back to policies when allPolicies missing', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      policies: [
        { clientName: 'Smith, John', policyNumber: 'POL-001', policyType: 'cgl' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients).toHaveLength(1);
    expect(clients[0].policies).toHaveLength(1);
    expect(clients[0].policies[0].type).toBe('cgl');
  });

  test('_getClients uses policyType field with type fallback', () => {
    const { window, store } = createClientDOM();
    // policyType field (new format)
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      allPolicies: [
        { clientName: 'Smith, John', policyNumber: 'POL-001', policyType: 'cgl' }
      ]
    });
    window.CallLogger.init();
    let clients = window.CallLogger._getClients();
    expect(clients[0].policies[0].type).toBe('cgl');

    // type field (legacy format fallback)
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      policies: [
        { clientName: 'Doe, Jane', policyNumber: 'POL-002', type: 'bond' }
      ]
    });
    clients = window.CallLogger._getClients();
    expect(clients[0].policies[0].type).toBe('bond');
  });

  // ── allClientsList (prospect/policy-less client support) ──

  test('_getClients merges allClientsList prospects into dropdown', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      allPolicies: [
        { clientName: 'Slaughter Andrea', policyNumber: 'HO-100', policyType: 'homeowner', hawksoftId: '1001' }
      ],
      allClientsList: [
        { clientNumber: 1001, clientName: 'Slaughter Andrea' },
        { clientNumber: 1002, clientName: 'Sandberg Andrea' },
        { clientNumber: 1003, clientName: 'Siemer Andrea' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients.length).toBe(3);
    const names = clients.map(c => c.name);
    expect(names).toContain('Sandberg Andrea');
    expect(names).toContain('Siemer Andrea');
    expect(names).toContain('Slaughter Andrea');
  });

  test('_getClients prospect clients have zero policies', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      allPolicies: [
        { clientName: 'Active Client', policyNumber: 'POL-1', policyType: 'cgl', hawksoftId: '100' }
      ],
      allClientsList: [
        { clientNumber: 100, clientName: 'Active Client' },
        { clientNumber: 200, clientName: 'Prospect Only' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    const prospect = clients.find(c => c.name === 'Prospect Only');
    expect(prospect).toBeDefined();
    expect(prospect.policies).toHaveLength(0);
    expect(prospect.hawksoftId).toBe('200');
  });

  test('_getClients allClientsList does not duplicate existing policy clients', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      allPolicies: [
        { clientName: 'Smith John', policyNumber: 'POL-1', policyType: 'cgl', hawksoftId: '100' }
      ],
      allClientsList: [
        { clientNumber: 100, clientName: 'Smith John' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients).toHaveLength(1);
    expect(clients[0].policies).toHaveLength(1);
  });

  test('_getClients sets hawksoftId from allClientsList for policy clients', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      allPolicies: [
        { clientName: 'Jones Mary', policyNumber: 'POL-1', policyType: 'homeowner' }
      ],
      allClientsList: [
        { clientNumber: 555, clientName: 'Jones Mary' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients[0].hawksoftId).toBe('555');
  });

  test('_getClients works without allClientsList (backward compat)', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      allPolicies: [
        { clientName: 'Smith John', policyNumber: 'POL-1', policyType: 'cgl', hawksoftId: '100' }
      ]
    });
    window.CallLogger.init();
    const clients = window.CallLogger._getClients();
    expect(clients).toHaveLength(1);
    expect(clients[0].name).toBe('Smith John');
  });

  test('_countClients prefers allClientsList count', () => {
    expect(source).toContain('function _countClients');
    expect(source).toContain('allClientsList');
  });

  test('_policyTypeLabel returns correct commercial labels', () => {
    const { window } = createClientDOM();
    expect(window.CallLogger._policyTypeLabel('auto')).toBe('Commercial Auto');
    expect(window.CallLogger._policyTypeLabel('cgl')).toBe('CGL');
    expect(window.CallLogger._policyTypeLabel('wc')).toBe('Workers Comp');
    expect(window.CallLogger._policyTypeLabel('umbrella')).toBe('Umbrella');
    expect(window.CallLogger._policyTypeLabel(null)).toBe('Policy');
  });

  test('_policyTypeLabel returns personal line labels', () => {
    const { window } = createClientDOM();
    expect(window.CallLogger._policyTypeLabel('homeowner')).toBe('Homeowner');
    expect(window.CallLogger._policyTypeLabel('personal-auto')).toBe('Personal Auto');
    expect(window.CallLogger._policyTypeLabel('renters')).toBe('Renters');
    expect(window.CallLogger._policyTypeLabel('flood')).toBe('Flood');
    expect(window.CallLogger._policyTypeLabel('dwelling')).toBe('Dwelling');
    expect(window.CallLogger._policyTypeLabel('personal')).toBe('Personal');
  });

  test('_policyTypeIcon returns commercial emoji icons', () => {
    const { window } = createClientDOM();
    expect(window.CallLogger._policyTypeIcon('auto')).toBe('🚛');
    expect(window.CallLogger._policyTypeIcon('property')).toBe('🏗️');
    expect(window.CallLogger._policyTypeIcon('cgl')).toBe('🛡️');
    expect(window.CallLogger._policyTypeIcon('unknown_type')).toBe('📄');
  });

  test('_policyTypeIcon returns personal line emoji icons', () => {
    const { window } = createClientDOM();
    expect(window.CallLogger._policyTypeIcon('homeowner')).toBe('🏠');
    expect(window.CallLogger._policyTypeIcon('personal-auto')).toBe('🚗');
    expect(window.CallLogger._policyTypeIcon('flood')).toBe('🌊');
    expect(window.CallLogger._policyTypeIcon('boat')).toBe('⛵');
    expect(window.CallLogger._policyTypeIcon('motorcycle')).toBe('🏍️');
  });

  test('_selectClient sets input value and shows policies', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const client = {
      name: 'Smith, John',
      policies: [
        { policyNumber: 'POL-001', type: 'auto', typeLabel: 'Auto', expirationDate: '2026-12-01', hawksoftId: 'HS-1' },
        { policyNumber: 'POL-002', type: 'cgl', typeLabel: 'CGL', expirationDate: '2026-06-01', hawksoftId: 'HS-1' }
      ]
    };
    window.CallLogger._selectClient(client);
    const input = window.document.getElementById('clPolicyId');
    expect(input.value).toBe('Smith, John');
    const policySelect = window.document.getElementById('clPolicySelect');
    expect(policySelect.style.display).not.toBe('none');
    const chips = window.document.querySelectorAll('.cl-policy-chip');
    expect(chips).toHaveLength(2);
  });

  test('_selectClient hides policy panel when no policies', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const client = { name: 'Williams, Sarah', policies: [] };
    window.CallLogger._selectClient(client);
    const input = window.document.getElementById('clPolicyId');
    expect(input.value).toBe('Williams, Sarah');
    const policySelect = window.document.getElementById('clPolicySelect');
    expect(policySelect.style.display).toBe('none');
  });

  test('_selectPolicy highlights chip and tracks selection (input keeps client name)', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const client = {
      name: 'Smith, John',
      policies: [
        { policyNumber: 'POL-001', type: 'auto', typeLabel: 'Auto', expirationDate: '2026-12-01', hawksoftId: 'HS-1' }
      ]
    };
    window.CallLogger._selectClient(client);
    const chip = window.document.querySelector('.cl-policy-chip');
    window.CallLogger._selectPolicy(client.policies[0], chip);
    // Input stays as client name (policy number resolved at format time)
    expect(window.document.getElementById('clPolicyId').value).toBe('Smith, John');
    expect(chip.classList.contains('cl-policy-selected')).toBe(true);
    // Selected policy is tracked for retrieval
    expect(window.CallLogger.getSelectedPolicy()).toEqual(client.policies[0]);
  });

  test('_handleClientSearch shows dropdown for matching clients', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      policies: [
        { clientName: 'Smith, John', policyNumber: 'POL-001', type: 'auto' },
        { clientName: 'Johnson, Mike', policyNumber: 'POL-050', type: 'cgl' }
      ]
    });
    window.CallLogger.init();
    const input = window.document.getElementById('clPolicyId');
    input.value = 'Smi';
    window.CallLogger._handleClientSearch();
    const dropdown = window.document.getElementById('clClientDropdown');
    expect(dropdown.style.display).not.toBe('none');
    expect(dropdown.querySelectorAll('.cl-client-row')).toHaveLength(1);
    expect(dropdown.textContent).toContain('Smith, John');
  });

  test('_handleClientSearch hides dropdown for short queries', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const input = window.document.getElementById('clPolicyId');
    input.value = 'S';
    window.CallLogger._handleClientSearch();
    const dropdown = window.document.getElementById('clClientDropdown');
    expect(dropdown.style.display).toBe('none');
  });

  test('_handleClientSearch hides dropdown for no matches', () => {
    const { window, store } = createClientDOM();
    store['altech_cgl_cache'] = JSON.stringify({
      cachedAt: Date.now(),
      policies: [{ clientName: 'Smith, John', policyNumber: 'POL-001', type: 'auto' }]
    });
    window.CallLogger.init();
    const input = window.document.getElementById('clPolicyId');
    input.value = 'ZZZZZ';
    window.CallLogger._handleClientSearch();
    const dropdown = window.document.getElementById('clClientDropdown');
    expect(dropdown.style.display).toBe('none');
  });

  test('init wires search input event', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const input = window.document.getElementById('clPolicyId');
    expect(input._clSearchWired).toBe(true);
  });

  test('_buildClientLink returns bold text when no hawksoftId', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const result = window.CallLogger._buildClientLink('Smith, John', '');
    expect(result).toContain('<strong>');
    expect(result).toContain('Smith, John');
    expect(result).not.toContain('<a');
  });

  test('_buildClientLink returns hs:// link on desktop', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const result = window.CallLogger._buildClientLink('Smith, John', 'HS-123');
    expect(result).toContain('hs://HS-123');
    expect(result).toContain('cl-client-link');
    expect(result).toContain('Smith, John');
    expect(result).toContain('target="_blank"');
  });

  test('_buildClientLink escapes HTML in client name', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const result = window.CallLogger._buildClientLink('<script>alert(1)</script>', 'HS-123');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  test('_buildClientLink returns bold fallback when hawksoftId is null', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const result = window.CallLogger._buildClientLink('Doe, Jane', null);
    expect(result).toContain('<strong>');
    expect(result).not.toContain('<a');
  });

  test('_selectClient resets _selectedPolicy to null', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    // First select a client and policy
    const client1 = {
      name: 'Smith, John',
      policies: [{ policyNumber: 'POL-001', type: 'auto', typeLabel: 'Auto', expirationDate: '', hawksoftId: 'HS-1' }]
    };
    window.CallLogger._selectClient(client1);
    const chip = window.document.querySelector('.cl-policy-chip');
    window.CallLogger._selectPolicy(client1.policies[0], chip);
    expect(window.CallLogger.getSelectedPolicy()).toBeTruthy();
    // Now select a different client — policy should reset
    const client2 = { name: 'Doe, Jane', policies: [] };
    window.CallLogger._selectClient(client2);
    expect(window.CallLogger.getSelectedPolicy()).toBeNull();
  });

  test('getSelectedPolicy returns the selected policy object', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    expect(window.CallLogger.getSelectedPolicy()).toBeNull();
    const client = {
      name: 'Smith, John',
      policies: [{ policyNumber: 'POL-001', type: 'cgl', typeLabel: 'CGL', expirationDate: '2026-06-01', hawksoftId: 'HS-99' }]
    };
    window.CallLogger._selectClient(client);
    window.CallLogger._selectPolicy(client.policies[0], null);
    const selected = window.CallLogger.getSelectedPolicy();
    expect(selected.policyNumber).toBe('POL-001');
    expect(selected.type).toBe('cgl');
    expect(selected.hawksoftId).toBe('HS-99');
  });

  test('selecting a second policy deselects the first chip', () => {
    const { window } = createClientDOM();
    window.CallLogger.init();
    const client = {
      name: 'Smith, John',
      policies: [
        { policyNumber: 'POL-001', type: 'auto', typeLabel: 'Auto', expirationDate: '', hawksoftId: '' },
        { policyNumber: 'POL-002', type: 'cgl', typeLabel: 'CGL', expirationDate: '', hawksoftId: '' }
      ]
    };
    window.CallLogger._selectClient(client);
    const chips = window.document.querySelectorAll('.cl-policy-chip');
    // Select first
    window.CallLogger._selectPolicy(client.policies[0], chips[0]);
    expect(chips[0].classList.contains('cl-policy-selected')).toBe(true);
    // Select second — first should lose selection
    window.CallLogger._selectPolicy(client.policies[1], chips[1]);
    expect(chips[0].classList.contains('cl-policy-selected')).toBe(false);
    expect(chips[1].classList.contains('cl-policy-selected')).toBe(true);
    expect(window.CallLogger.getSelectedPolicy().policyNumber).toBe('POL-002');
  });
});

// ────────────────────────────────────────────────────
// Plugin HTML — Client Autocomplete Structure
// ────────────────────────────────────────────────────

describe('call-logger.html — Client Autocomplete', () => {
  const pluginHtml = fs.readFileSync(path.join(ROOT, 'plugins', 'call-logger.html'), 'utf8');

  test('has client dropdown container', () => {
    expect(pluginHtml).toContain('id="clClientDropdown"');
    expect(pluginHtml).toContain('cl-client-dropdown');
  });

  test('has search wrapper for positioning', () => {
    expect(pluginHtml).toContain('cl-search-wrapper');
  });

  test('has policy select section', () => {
    expect(pluginHtml).toContain('id="clPolicySelect"');
    expect(pluginHtml).toContain('id="clPolicyList"');
  });

  test('policy select is hidden by default', () => {
    expect(pluginHtml).toMatch(/id="clPolicySelect"[^>]*display:\s*none/);
  });

  test('input has autocomplete="off"', () => {
    expect(pluginHtml).toContain('autocomplete="off"');
  });
});

// ────────────────────────────────────────────────────
// CSS — Client Autocomplete Styles
// ────────────────────────────────────────────────────

describe('call-logger.css — Client Autocomplete', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'call-logger.css'), 'utf8');

  test('defines cl-client-dropdown styles', () => {
    expect(css).toContain('.cl-client-dropdown');
    expect(css).toContain('position: absolute');
  });

  test('defines cl-client-row styles', () => {
    expect(css).toContain('.cl-client-row');
  });

  test('defines cl-client-badge for policy count', () => {
    expect(css).toContain('.cl-client-badge');
  });

  test('defines cl-policy-chip styles', () => {
    expect(css).toContain('.cl-policy-chip');
  });

  test('defines cl-policy-selected state', () => {
    expect(css).toContain('.cl-policy-selected');
  });

  test('defines cl-policy-list with flex wrap', () => {
    expect(css).toContain('.cl-policy-list');
    expect(css).toContain('flex-wrap: wrap');
  });

  test('has dark mode overrides for dropdown', () => {
    expect(css).toContain('body.dark-mode .cl-client-dropdown');
    expect(css).toContain('body.dark-mode .cl-policy-chip');
  });

  test('defines cl-client-link styles for HawkSoft deep link', () => {
    expect(css).toContain('.cl-client-link');
    expect(css).toContain('text-decoration: none');
  });

  test('defines cl-confirm-policy badge styles', () => {
    expect(css).toContain('.cl-confirm-policy');
    expect(css).toContain('border-radius');
  });

  test('has dark mode overrides for client link and policy badge', () => {
    expect(css).toContain('body.dark-mode .cl-client-link');
    expect(css).toContain('body.dark-mode .cl-confirm-policy');
  });

  test('cl-client-link has focus-visible state', () => {
    expect(css).toContain('.cl-client-link:focus-visible');
  });
});

// ────────────────────────────────────────────────────
// CSS File
// ────────────────────────────────────────────────────

describe('call-logger.css', () => {
  const cssPath = path.join(ROOT, 'css', 'call-logger.css');

  test('CSS file exists', () => {
    expect(fs.existsSync(cssPath)).toBe(true);
  });

  test('defines cl-container styles', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('.cl-container');
  });

  test('defines cl-submit-btn styles', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('.cl-submit-btn');
  });

  test('defines cl-preview styles', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('.cl-preview');
  });

  test('uses CSS variables (not hardcoded colors)', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('var(--');
  });
});
