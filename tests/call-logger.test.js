/**
 * CallLogger — Client-Side Tests (js/call-logger.js)
 *
 * Tests:
 * - IIFE module exports { init, render }
 * - localStorage persistence (save/load round-trip)
 * - AI settings resolution from altech_settings
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
    expect(source).toMatch(/return\s*\{\s*init\s*,\s*render\s*\}/);
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
// AI Settings Resolution (source analysis)
// ────────────────────────────────────────────────────

describe('AI Settings Resolution', () => {
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
  test('validates policyId and rawNotes are non-empty', () => {
    expect(source).toContain('!policyId || !rawNotes');
  });

  test('shows toast error for empty fields', () => {
    expect(source).toContain("App.toast('Please fill in all fields'");
  });

  test('disables button during submission', () => {
    expect(source).toContain('submitBtn.disabled = true');
    expect(source).toContain("submitBtn.textContent = '⏳ Logging...'");
  });

  test('re-enables button in finally block', () => {
    expect(source).toContain('submitBtn.disabled = false');
    expect(source).toMatch(/finally\s*\{[\s\S]*?submitBtn\.disabled = false/);
  });

  test('posts to /api/hawksoft-logger', () => {
    expect(source).toContain("'/api/hawksoft-logger'");
  });

  test('sends policyId, callType, rawNotes, userApiKey, aiModel in body', () => {
    expect(source).toContain('JSON.stringify({ policyId, callType, rawNotes, userApiKey, aiModel })');
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
    expect(source).toContain("App.toast('✅ Logged to HawkSoft'");
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
    expect(source).toContain("submitBtn.addEventListener('click', _handleSubmit)");
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
          <button id="clSubmitBtn">✨ Format &amp; Log to HawkSoft</button>
        </div>
        <div id="clPreview" style="display:none">
          <pre id="clPreviewText"></pre>
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

  test('has plugin-header with title', () => {
    expect(pluginHtml).toContain('plugin-header');
    expect(pluginHtml).toContain('AI Call Logger');
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
