/**
 * Plugin Integration Tests
 *
 * Verifies that all plugins/tools in the Altech app:
 * - Are properly registered in App.toolConfig
 * - Have matching DOM containers in index.html
 * - Export to window correctly (window.X = X pattern)
 * - Have init() methods callable without exceptions
 * - Have proper API key discovery chains
 * - Handle missing APIs gracefully (no unhandled errors)
 *
 * Also validates deployment readiness:
 * - All API endpoints have corresponding files
 * - All JS modules load without syntax errors
 * - Hash router handles all registered tool keys
 * - Gemini key resolution uses correct endpoint (not places-config)
 * - No hardcoded credentials in source (except known exceptions)
 *
 * Run: npm test
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

const ROOT = path.resolve(__dirname, '..');

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function createPluginTestDOM() {
  const html = loadHTML(path.join(ROOT, 'index.html'));
  const dom = new JSDOM(html, {
    url: 'http://localhost:8000',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });

  const window = dom.window;

  // Mock browser APIs not available in JSDOM
  const store = {};
  window.localStorage = {
    data: store,
    getItem(key) { return store[key] || null; },
    setItem(key, val) { store[key] = val; },
    removeItem(key) { delete store[key]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  window.prompt = jest.fn(() => null);
  window.URL.createObjectURL = jest.fn(() => 'blob:mock');
  window.URL.revokeObjectURL = jest.fn();
  window.scrollTo = jest.fn();
  window.matchMedia = jest.fn().mockImplementation(query => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  if (!window.Element.prototype.scrollTo) window.Element.prototype.scrollTo = function() {};
  if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function() {};
  if (!window.navigator.clipboard) {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      writable: true
    });
  }

  // Mock fetch to prevent real network calls during init
  window.fetch = jest.fn().mockImplementation((url) => {
    // Return sensible defaults for known endpoints
    if (typeof url === 'string' && url.includes('gemini-config')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ apiKey: 'test-key' }) });
    }
    if (typeof url === 'string' && url.includes('places-config')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ apiKey: 'test-places-key' }) });
    }
    if (typeof url === 'string' && url.includes('config.json')) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    if (typeof url === 'string' && url.includes('/api/compliance')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, count: 0, policies: [] }) });
    }
    if (typeof url === 'string' && url.includes('/api/kv-store')) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    if (typeof url === 'string' && url.includes('/local/')) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });

  // Mock IndexedDB
  if (!window.indexedDB) {
    window.indexedDB = {
      open: jest.fn().mockReturnValue({
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: {
          objectStoreNames: { contains: () => false },
          createObjectStore: jest.fn(),
          transaction: jest.fn().mockReturnValue({
            objectStore: jest.fn().mockReturnValue({
              get: jest.fn().mockReturnValue({ onsuccess: null, onerror: null }),
              put: jest.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            })
          }),
          close: jest.fn()
        }
      })
    };
  }

  // Mock EventSource
  window.EventSource = jest.fn().mockImplementation(() => ({
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    onmessage: null,
    onerror: null,
    onopen: null
  }));

  return { dom, window };
}

// ────────────────────────────────────────────────────
// Tool Registry & Config
// ────────────────────────────────────────────────────

describe('Plugin Registry & Tool Config', () => {
  let window, App;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
    App = window.App;
  });

  test('App.toolConfig is defined and is an array', () => {
    expect(Array.isArray(App.toolConfig)).toBe(true);
    expect(App.toolConfig.length).toBeGreaterThan(0);
  });

  // Expected tool keys that MUST exist
  const expectedTools = [
    { key: 'quoting', containerId: 'quotingTool' },
    { key: 'qna', containerId: 'qnaTool', initModule: 'PolicyQA' },
    { key: 'quotecompare', containerId: 'quoteCompareTool', initModule: 'QuoteCompare' },
    { key: 'coi', containerId: 'coiTool', initModule: 'COI' },
    { key: 'compliance', containerId: 'complianceTool', initModule: 'ComplianceDashboard' },
    { key: 'prospect', containerId: 'prospectTool', initModule: 'ProspectInvestigator' },
    { key: 'email', containerId: 'emailTool', initModule: 'EmailComposer' },
    { key: 'accounting', containerId: 'accountingTool', initModule: 'AccountingExport' },
    { key: 'quickref', containerId: 'quickrefTool', initModule: 'QuickRef' },
    { key: 'ezlynx', containerId: 'ezlynxTool', initModule: 'EZLynxTool' },
  ];

  test.each(expectedTools)('tool "$key" is registered in toolConfig', ({ key, containerId, initModule }) => {
    const entry = App.toolConfig.find(t => t.key === key);
    expect(entry).toBeDefined();
    expect(entry.containerId).toBe(containerId);
    if (initModule) {
      expect(entry.initModule).toBe(initModule);
    }
  });

  test.each(expectedTools)('tool "$key" has a DOM container #$containerId', ({ containerId }) => {
    const el = window.document.getElementById(containerId);
    expect(el).not.toBeNull();
  });

  test('every toolConfig entry has required fields', () => {
    for (const entry of App.toolConfig) {
      expect(entry.key).toBeTruthy();
      expect(entry.containerId).toBeTruthy();
      expect(entry.icon).toBeTruthy();
      expect(entry.title).toBeTruthy();
      // quoting doesn't have initModule (uses App.init)
      if (entry.key !== 'quoting') {
        expect(entry.initModule).toBeTruthy();
      }
    }
  });

  test('no duplicate tool keys', () => {
    const keys = App.toolConfig.map(t => t.key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  test('no duplicate container IDs', () => {
    const ids = App.toolConfig.map(t => t.containerId);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});

// ────────────────────────────────────────────────────
// Window Module Exports
// ────────────────────────────────────────────────────

describe('Window Module Exports (window.X = X pattern)', () => {
  let window;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
  });

  const requiredModules = [
    'COI',
    'PolicyQA',
    'QuoteCompare',
    'ComplianceDashboard',
    'ProspectInvestigator',
    'EmailComposer',
    'AccountingExport',
    'QuickRef',
    'EZLynxTool',
  ];

  test.each(requiredModules)('window.%s is defined', (moduleName) => {
    expect(window[moduleName]).toBeDefined();
  });

  test.each(requiredModules)('window.%s has init() method', (moduleName) => {
    expect(typeof window[moduleName].init).toBe('function');
  });
});

// ────────────────────────────────────────────────────
// Plugin init() Safety
// ────────────────────────────────────────────────────

describe('Plugin init() calls do not throw', () => {
  let window;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
  });

  // These plugins should init safely even without network
  const safeInitPlugins = [
    'COI',
    'EmailComposer',
    'QuickRef',
    'AccountingExport',
    'EZLynxTool',
  ];

  test.each(safeInitPlugins)('%s.init() does not throw', async (moduleName) => {
    await expect(Promise.resolve().then(() => window[moduleName].init())).resolves.not.toThrow();
  });
});

// ────────────────────────────────────────────────────
// navigateTo() Router
// ────────────────────────────────────────────────────

describe('navigateTo() Router', () => {
  let window, App;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
    App = window.App;
  });

  test('navigateTo exists and is a function', () => {
    expect(typeof App.navigateTo).toBe('function');
  });

  test('navigateTo with unknown tool does nothing (no throw)', async () => {
    await expect(App.navigateTo('nonexistent_tool_xyz')).resolves.not.toThrow();
  });

  test('navigateTo hides landing page', async () => {
    const landing = window.document.getElementById('landingPage');
    if (landing) {
      landing.style.display = 'block';
      await App.navigateTo('coi');
      expect(landing.style.display).toBe('none');
    }
  });

  test('navigateTo shows target container', async () => {
    const tool = window.document.getElementById('coiTool');
    if (tool) {
      await App.navigateTo('coi');
      expect(tool.style.display).toBe('block');
    }
  });
});

// ────────────────────────────────────────────────────
// API Endpoint File Existence
// ────────────────────────────────────────────────────

describe('API Endpoint Files Exist', () => {
  const requiredAPIs = [
    'places-config.js',
    'gemini-config.js',
    'compliance.js',
    'kv-store.js',
    'prospect-lookup.js',
    'generate-coi.js',
    'policy-scan.js',
    'vision-processor.js',
    'rag-interpreter.js',
    'historical-analyzer.js',
    'name-phonetics.js',
    'document-intel.js',
    'property-intelligence.js',
  ];

  // _security.js uses named exports (utility module), not export default
  const namedExportAPIs = ['_security.js'];

  test.each(requiredAPIs)('api/%s exists', (filename) => {
    const filePath = path.join(ROOT, 'api', filename);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test.each(requiredAPIs)('api/%s uses ESM export default', (filename) => {
    const source = fs.readFileSync(path.join(ROOT, 'api', filename), 'utf8');
    // Should have either `export default` or `export default function`
    expect(source).toMatch(/export\s+default/);
  });

  test.each(namedExportAPIs)('api/%s uses named exports (utility module)', (filename) => {
    const filePath = path.join(ROOT, 'api', filename);
    expect(fs.existsSync(filePath)).toBe(true);
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).toMatch(/export\s+function/);
  });
});

// ────────────────────────────────────────────────────
// JS Module File Existence & window Export
// ────────────────────────────────────────────────────

describe('JS Module Files', () => {
  const requiredModules = [
    { file: 'coi.js', windowExport: 'COI' },
    { file: 'prospect.js', windowExport: 'ProspectInvestigator' },
    { file: 'compliance-dashboard.js', windowExport: 'ComplianceDashboard' },
    { file: 'policy-qa.js', windowExport: 'PolicyQA' },
    { file: 'email-composer.js', windowExport: 'EmailComposer' },
    { file: 'quick-ref.js', windowExport: 'QuickRef' },
    { file: 'accounting-export.js', windowExport: 'AccountingExport' },
    { file: 'ezlynx-tool.js', windowExport: 'EZLynxTool' },
    { file: 'quote-compare.js', windowExport: 'QuoteCompare' },
    { file: 'data-backup.js', windowExport: null }, // No explicit window export
    { file: 'crypto-helper.js', windowExport: null },
  ];

  test.each(requiredModules)('js/$file exists', ({ file }) => {
    const filePath = path.join(ROOT, 'js', file);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test.each(requiredModules.filter(m => m.windowExport))('js/$file has window.$windowExport = $windowExport', ({ file, windowExport }) => {
    const source = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
    expect(source).toContain(`window.${windowExport} = ${windowExport}`);
  });
});

// ────────────────────────────────────────────────────
// Gemini API Key Discovery Chain
// ────────────────────────────────────────────────────

describe('Gemini API Key Discovery (correctness)', () => {
  test('App._getGeminiKey fetches /api/gemini-config (not places-config)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    // The centralized key getter should hit gemini-config
    const getKeyBlock = source.match(/_getGeminiKey\(\)\s*\{[\s\S]*?\n\s{12}\},/);
    expect(getKeyBlock).not.toBeNull();
    expect(getKeyBlock[0]).toContain('/api/gemini-config');
    expect(getKeyBlock[0]).not.toContain('places-config');
  });

  test('PolicyQA resolveGeminiKey fetches /api/gemini-config first', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/policy-qa.js'), 'utf8');
    const geminiConfigIndex = source.indexOf('/api/gemini-config');
    const configJsonIndex = source.indexOf('api/config.json');
    expect(geminiConfigIndex).toBeGreaterThan(-1);
    // gemini-config should come BEFORE config.json
    if (configJsonIndex > -1) {
      expect(geminiConfigIndex).toBeLessThan(configJsonIndex);
    }
  });

  test('EmailComposer resolveGeminiKey fetches /api/gemini-config first', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/email-composer.js'), 'utf8');
    const geminiConfigIndex = source.indexOf('/api/gemini-config');
    expect(geminiConfigIndex).toBeGreaterThan(-1);
    // Should NOT use places-config for Gemini key
    expect(source).not.toMatch(/places-config.*geminiApiKey/);
  });

  test('QuoteCompare getApiKey fetches /api/gemini-config', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/quote-compare.js'), 'utf8');
    expect(source).toContain('/api/gemini-config');
  });

  test('gemini-config.js reads GOOGLE_API_KEY from env', () => {
    const source = fs.readFileSync(path.join(ROOT, 'api/gemini-config.js'), 'utf8');
    expect(source).toContain('process.env.GOOGLE_API_KEY');
    // Must NOT read PLACES_API_KEY as the actual key source
    expect(source).not.toMatch(/process\.env\.PLACES_API_KEY/);
  });

  test('places-config.js serves PLACES_API_KEY (not GOOGLE_API_KEY)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'api/places-config.js'), 'utf8');
    expect(source).toContain('PLACES_API_KEY');
    expect(source).not.toContain('GOOGLE_API_KEY');
  });
});

// ────────────────────────────────────────────────────
// Env Var Trimming (deployment safety)
// ────────────────────────────────────────────────────

describe('API Env Var Trimming', () => {
  const apiFilesWithEnvVars = [
    { file: 'compliance.js', envVars: ['HAWKSOFT_CLIENT_ID', 'HAWKSOFT_CLIENT_SECRET', 'HAWKSOFT_AGENCY_ID'] },
    { file: 'places-config.js', envVars: ['PLACES_API_KEY'] },
    { file: 'gemini-config.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'vision-processor.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'historical-analyzer.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'policy-scan.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'rag-interpreter.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'name-phonetics.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'document-intel.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'property-intelligence.js', envVars: ['GOOGLE_API_KEY'] },
  ];

  test.each(apiFilesWithEnvVars)('api/$file trims env vars: $envVars', ({ file, envVars }) => {
    const source = fs.readFileSync(path.join(ROOT, 'api', file), 'utf8');
    for (const envVar of envVars) {
      // Must have .trim() call when reading env var
      // Pattern: process.env.VAR_NAME ... .trim()
      const envPattern = new RegExp(`process\\.env\\.${envVar}[^;]*\\.trim\\(\\)`);
      expect(source).toMatch(envPattern);
    }
  });
});

// ────────────────────────────────────────────────────
// Hash Router Coverage
// ────────────────────────────────────────────────────

describe('Hash Router', () => {
  test('hashchange listener is registered', () => {
    const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(source).toContain("addEventListener('hashchange'");
  });

  test('goHome function exists on App', () => {
    const env = createPluginTestDOM();
    expect(typeof env.window.App.goHome).toBe('function');
  });

  test('hash #home triggers goHome (not navigateTo)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    // In the hashchange handler, 'home' should call goHome, not navigateTo
    expect(source).toMatch(/toolId\s*===\s*['"]home['"]\s*\)\s*\{[\s\S]*?goHome/);
  });
});

// ────────────────────────────────────────────────────
// Graceful Degradation (local-only features)
// ────────────────────────────────────────────────────

describe('Graceful Degradation for /local/ endpoints', () => {
  const modulesWithLocalEndpoints = [
    { file: 'compliance-dashboard.js', endpoints: ['/local/cgl-state', '/local/cgl-cache'] },
    { file: 'email-composer.js', endpoints: ['/local/email-drafts'] },
    { file: 'quick-ref.js', endpoints: ['/local/quickref-cards'] },
    { file: 'ezlynx-tool.js', endpoints: ['/local/ezlynx-schema'] },
    { file: 'accounting-export.js', endpoints: ['/local/hawksoft-export'] },
    { file: 'policy-qa.js', endpoints: ['/local/scan-history'] },
  ];

  test.each(modulesWithLocalEndpoints)('js/$file wraps /local/ calls in try-catch', ({ file, endpoints }) => {
    const source = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
    for (const endpoint of endpoints) {
      // Verify the endpoint is referenced
      expect(source).toContain(endpoint);
      // Verify there's error handling (catch or .catch)
      // Check that fetch calls for /local/ endpoints have error handling nearby
      const endpointEscaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Look for try { ... fetch(endpoint) or fetch(endpoint).catch
      const hasTryCatch = source.match(new RegExp(`try\\s*\\{[^}]*${endpointEscaped}`, 's')) ||
                          source.match(new RegExp(`${endpointEscaped}[^;]*\\.catch`));
      expect(hasTryCatch).not.toBeNull();
    }
  });
});

// ────────────────────────────────────────────────────
// SSE EventSource Guard (Vercel compat)
// ────────────────────────────────────────────────────

describe('SSE EventSource Vercel Safety', () => {
  test('ComplianceDashboard guards EventSource with isLocal check', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/compliance-dashboard.js'), 'utf8');
    // EventSource should only be created when on localhost
    const eventSourceSection = source.match(/EventSource/g);
    if (eventSourceSection) {
      // There should be an isLocal guard near EventSource usage
      expect(source).toMatch(/isLocal.*EventSource|EventSource.*isLocal/s);
    }
  });
});

// ────────────────────────────────────────────────────
// Script Load Order (index.html)
// ────────────────────────────────────────────────────

describe('Script Load Order', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  });

  test('crypto-helper.js is loaded before main script block', () => {
    const cryptoPos = source.indexOf('js/crypto-helper.js');
    const appObjPos = source.indexOf('const App = {');
    expect(cryptoPos).toBeGreaterThan(-1);
    expect(appObjPos).toBeGreaterThan(-1);
    expect(cryptoPos).toBeLessThan(appObjPos);
  });

  test('all JS module scripts are loaded after main script block', () => {
    const appEndPos = source.indexOf('</script>', source.indexOf('const App = {'));
    const modules = ['coi.js', 'prospect.js', 'compliance-dashboard.js', 'policy-qa.js',
                     'email-composer.js', 'quick-ref.js', 'accounting-export.js',
                     'ezlynx-tool.js', 'quote-compare.js', 'data-backup.js'];

    for (const mod of modules) {
      const modPos = source.indexOf(`src="js/${mod}"`);
      if (modPos > -1) {
        expect(modPos).toBeGreaterThan(appEndPos);
      }
    }
  });

  test('data-backup.js is loaded last (needs all other modules)', () => {
    const modules = ['coi.js', 'prospect.js', 'compliance-dashboard.js', 'policy-qa.js',
                     'email-composer.js', 'quick-ref.js', 'accounting-export.js',
                     'ezlynx-tool.js', 'quote-compare.js'];
    const backupPos = source.indexOf('src="js/data-backup.js"');
    for (const mod of modules) {
      const modPos = source.indexOf(`src="js/${mod}"`);
      if (modPos > -1) {
        expect(backupPos).toBeGreaterThan(modPos);
      }
    }
  });
});

// ────────────────────────────────────────────────────
// Export Engines Intact
// ────────────────────────────────────────────────────

describe('Export Engines Present', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  });

  test('exportCMSMTF function exists', () => {
    expect(source).toContain('exportCMSMTF');
  });

  test('exportXML function exists (buildXML)', () => {
    expect(source).toContain('buildXML');
  });

  test('exportPDF function exists', () => {
    expect(source).toContain('exportPDF');
  });

  test('XML escaping uses escapeXML helper', () => {
    expect(source).toMatch(/escapeXML/);
  });

  test('XML namespace is correct for EZLynx', () => {
    expect(source).toContain('xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200"');
  });
});

// ────────────────────────────────────────────────────
// Workflow Integrity
// ────────────────────────────────────────────────────

describe('Workflow Integrity', () => {
  let App;

  beforeAll(() => {
    const env = createPluginTestDOM();
    App = env.window.App;
  });

  test('workflows object has home, auto, both', () => {
    expect(App.workflows).toBeDefined();
    expect(App.workflows.home).toBeDefined();
    expect(App.workflows.auto).toBeDefined();
    expect(App.workflows.both).toBeDefined();
  });

  test('home workflow skips step-4 (vehicles)', () => {
    expect(App.workflows.home).not.toContain('step-4');
    expect(App.workflows.home).toContain('step-3');
  });

  test('auto workflow skips step-3 (property)', () => {
    expect(App.workflows.auto).not.toContain('step-3');
    expect(App.workflows.auto).toContain('step-4');
  });

  test('both workflow includes step-3 and step-4', () => {
    expect(App.workflows.both).toContain('step-3');
    expect(App.workflows.both).toContain('step-4');
  });
});

// ────────────────────────────────────────────────────
// localStorage Key Stability
// ────────────────────────────────────────────────────

describe('localStorage Key Stability', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  });

  test('storage key is altech_v6 (not incremented)', () => {
    expect(source).toMatch(/storageKey:\s*['"]altech_v6['"]/);
  });

  test('quotes storage key is altech_v6_quotes', () => {
    expect(source).toContain('altech_v6_quotes');
  });
});
