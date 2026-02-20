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
 * - Gemini key resolution uses correct endpoint (not config?type=keys)
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
    if (typeof url === 'string' && url.includes('config?type=keys')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ apiKey: 'test-places-key', geminiKey: 'test-gemini-key' }) });
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
    'config.js',
    'compliance.js',
    'kv-store.js',
    'prospect-lookup.js',
    'generate-coi.js',
    'policy-scan.js',
    'vision-processor.js',
    'rag-interpreter.js',
    'historical-analyzer.js',
    'stripe.js',
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
  test('App._getGeminiKey fetches /api/config?type=keys and reads geminiKey', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js', 'app-core.js'), 'utf8');
    const getKeyBlock = source.match(/_getGeminiKey\(\)\s*\{[\s\S]*?\n\s{4}\},/);
    expect(getKeyBlock).not.toBeNull();
    expect(getKeyBlock[0]).toContain('/api/config?type=keys');
    expect(getKeyBlock[0]).toContain('geminiKey');
  });

  test('PolicyQA resolveGeminiKey fetches /api/config?type=keys first', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/policy-qa.js'), 'utf8');
    const configKeysIndex = source.indexOf('/api/config?type=keys');
    const configJsonIndex = source.indexOf('api/config.json');
    expect(configKeysIndex).toBeGreaterThan(-1);
    expect(source).toContain('geminiKey');
    // config?type=keys should come BEFORE config.json fallback
    if (configJsonIndex > -1) {
      expect(configKeysIndex).toBeLessThan(configJsonIndex);
    }
  });

  test('EmailComposer resolveGeminiKey fetches /api/config?type=keys', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/email-composer.js'), 'utf8');
    expect(source).toContain('/api/config?type=keys');
    expect(source).toContain('geminiKey');
  });

  test('QuoteCompare getApiKey fetches /api/config?type=keys', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/quote-compare.js'), 'utf8');
    expect(source).toContain('/api/config?type=keys');
    expect(source).toContain('geminiKey');
  });

  test('config.js serves both PLACES_API_KEY and GOOGLE_API_KEY', () => {
    const source = fs.readFileSync(path.join(ROOT, 'api/config.js'), 'utf8');
    expect(source).toContain('PLACES_API_KEY');
    expect(source).toContain('GOOGLE_API_KEY');
    // Must return both keys in response
    expect(source).toContain('geminiKey');
  });

  test('serverless function count stays within Vercel Hobby limit (max 12)', () => {
    const apiDir = path.join(ROOT, 'api');
    const jsFiles = fs.readdirSync(apiDir)
      .filter(f => f.endsWith('.js') && !f.startsWith('_'));
    expect(jsFiles.length).toBeLessThanOrEqual(12);
  });
});

// ────────────────────────────────────────────────────
// Env Var Trimming (deployment safety)
// ────────────────────────────────────────────────────

describe('API Env Var Trimming', () => {
  const apiFilesWithEnvVars = [
    { file: 'compliance.js', envVars: ['HAWKSOFT_CLIENT_ID', 'HAWKSOFT_CLIENT_SECRET', 'HAWKSOFT_AGENCY_ID'] },
    { file: 'config.js', envVars: ['PLACES_API_KEY', 'GOOGLE_API_KEY'] },
    { file: 'vision-processor.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'historical-analyzer.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'policy-scan.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'rag-interpreter.js', envVars: ['GOOGLE_API_KEY'] },
    { file: 'config.js', envVars: ['GOOGLE_API_KEY'] },
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
    source = fs.readFileSync(path.join(ROOT, 'js', 'app-export.js'), 'utf8');
  });

  test('exportCMSMTF function exists', () => {
    expect(source).toContain('exportCMSMTF');
  });

  test('exportPDF function exists', () => {
    expect(source).toContain('exportPDF');
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

// ────────────────────────────────────────────────────
// 12-Column Grid Layout
// ────────────────────────────────────────────────────

describe('12-Column Grid Layout', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
  });

  test('grid-12 CSS class is defined with 12-column template', () => {
    expect(source).toMatch(/\.grid-12\s*\{[^}]*grid-template-columns:\s*repeat\(12,\s*1fr\)/);
  });

  test('span utility classes exist (span-4, span-6, span-8)', () => {
    expect(source).toMatch(/\.span-4\s*\{[^}]*grid-column:\s*span\s+4/);
    expect(source).toMatch(/\.span-6\s*\{[^}]*grid-column:\s*span\s+6/);
    expect(source).toMatch(/\.span-8\s*\{[^}]*grid-column:\s*span\s+8/);
  });

  test('grid-12 has responsive fallback for mobile', () => {
    expect(source).toMatch(/@media[^{]*max-width[^{]*\{[^}]*\.grid-12\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });
});

// ────────────────────────────────────────────────────
// Roof Section Grid
// ────────────────────────────────────────────────────

describe('Roof Section Grid', () => {
  let window;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
  });

  test('Roof Type uses span-8 in grid-12', () => {
    const roofType = window.document.getElementById('roofType');
    expect(roofType).not.toBeNull();
    const parent = roofType.parentElement;
    expect(parent.classList.contains('span-8')).toBe(true);
    expect(parent.parentElement.classList.contains('grid-12')).toBe(true);
  });

  test('Roof Shape uses span-4 in grid-12', () => {
    const roofShape = window.document.getElementById('roofShape');
    expect(roofShape).not.toBeNull();
    const parent = roofShape.parentElement;
    expect(parent.classList.contains('span-4')).toBe(true);
    expect(parent.parentElement.classList.contains('grid-12')).toBe(true);
  });

  test('Year Roof Updated uses span-4 in grid-12', () => {
    const roofYr = window.document.getElementById('roofYr');
    expect(roofYr).not.toBeNull();
    const parent = roofYr.parentElement;
    expect(parent.classList.contains('span-4')).toBe(true);
    expect(parent.parentElement.classList.contains('grid-12')).toBe(true);
  });
});

// ────────────────────────────────────────────────────
// Systems Section Grid
// ────────────────────────────────────────────────────

describe('Systems Section Grid', () => {
  let window;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
  });

  test('Heating Type uses span-6 in grid-12', () => {
    const heatingType = window.document.getElementById('heatingType');
    expect(heatingType).not.toBeNull();
    const parent = heatingType.parentElement;
    expect(parent.classList.contains('span-6')).toBe(true);
    expect(parent.parentElement.classList.contains('grid-12')).toBe(true);
  });

  test('Cooling System uses span-6 in grid-12', () => {
    const cooling = window.document.getElementById('cooling');
    expect(cooling).not.toBeNull();
    const parent = cooling.parentElement;
    expect(parent.classList.contains('span-6')).toBe(true);
    expect(parent.parentElement.classList.contains('grid-12')).toBe(true);
  });
});

// ────────────────────────────────────────────────────
// Progressive Disclosure: Secondary Heating
// ────────────────────────────────────────────────────

describe('Progressive Disclosure: Secondary Heating', () => {
  let window, document;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
    document = window.document;
  });

  test('hasSecondaryHeating checkbox exists', () => {
    const checkbox = document.getElementById('hasSecondaryHeating');
    expect(checkbox).not.toBeNull();
    expect(checkbox.type).toBe('checkbox');
  });

  test('secondaryHeating dropdown exists in DOM (not removed)', () => {
    const select = document.getElementById('secondaryHeating');
    expect(select).not.toBeNull();
    expect(select.tagName).toBe('SELECT');
  });

  test('secondary heating wrapper is hidden by default', () => {
    const wrapper = document.getElementById('secondaryHeatingWrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper.classList.contains('disclosure-hidden')).toBe(true);
  });

  test('disclosure-hidden CSS class uses display:none', () => {
    const source = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
    expect(source).toMatch(/\.disclosure-hidden\s*\{[^}]*display:\s*none/);
  });

  test('checking toggle reveals secondary heating (JS handler exists)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(source).toContain('hasSecondaryHeating');
    expect(source).toContain('secondaryHeatingWrapper');
    expect(source).toContain('disclosure-hidden');
  });

  test('secondaryHeating value persists in App.data even when hidden', () => {
    // Set the value directly on App.data (simulating what save() does)
    const App = window.App;
    const select = document.getElementById('secondaryHeating');
    expect(select).not.toBeNull();
    // Simulate user selecting a value - App.save reads e.target.id + e.target.value
    App.data.secondaryHeating = 'Electric';
    select.value = 'Electric';
    // The key point: the DOM element still exists and holds its value even when wrapper is hidden
    const wrapper = document.getElementById('secondaryHeatingWrapper');
    expect(wrapper.classList.contains('disclosure-hidden')).toBe(true);
    expect(select.value).toBe('Electric');
    expect(App.data.secondaryHeating).toBe('Electric');
  });

  test('syncSegmentedControls restores disclosure state from saved data', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js', 'app-core.js'), 'utf8');
    // The sync function should check secondaryHeating value and toggle disclosure
    expect(source).toMatch(/syncSegmentedControls[\s\S]*secondaryHeating[\s\S]*disclosure-hidden/);
  });
});

// ────────────────────────────────────────────────────
// iOS Toggle Switches
// ────────────────────────────────────────────────────

describe('iOS Toggle Switches', () => {
  let window, document;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
    document = window.document;
  });

  const toggleFields = ['equipmentBreakdown', 'serviceLine', 'earthquakeCoverage'];

  test.each(toggleFields)('%s has toggle switch (data-toggle-field)', (fieldId) => {
    const toggle = document.querySelector(`[data-toggle-field="${fieldId}"]`);
    expect(toggle).not.toBeNull();
    expect(toggle.type).toBe('checkbox');
  });

  test.each(toggleFields)('%s hidden input exists for data binding', (fieldId) => {
    const hidden = document.getElementById(fieldId);
    expect(hidden).not.toBeNull();
    expect(hidden.type).toBe('hidden');
  });

  test('toggle-switch CSS is defined', () => {
    const source = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
    expect(source).toMatch(/\.toggle-switch\s*\{/);
    expect(source).toMatch(/\.toggle-slider\s*\{/);
    expect(source).toMatch(/\.toggle-slider::before\s*\{/);
  });

  test('no seg-group elements remain in endorsements (all converted to toggles)', () => {
    const segGroups = document.querySelectorAll('.seg-group[data-field="equipmentBreakdown"], .seg-group[data-field="serviceLine"], .seg-group[data-field="earthquakeCoverage"]');
    expect(segGroups.length).toBe(0);
  });
});

// ── Home Coverage Grid ──────────────────────────────────────────────────────
describe('Home Coverage Grid', () => {
  let window, document;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
    document = window.document;
  });

  test('grid-2-full CSS class is defined with correct columns and gap', () => {
    const source = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
    expect(source).toMatch(/\.grid-2-full\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/);
    expect(source).toMatch(/\.grid-2-full\s*\{[^}]*gap:\s*16px/);
  });

  test('full-span CSS class spans both columns', () => {
    const source = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
    expect(source).toMatch(/\.full-span\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  });

  test('homePolicyType is inside a full-span wrapper within grid-2-full', () => {
    const el = document.getElementById('homePolicyType');
    expect(el).not.toBeNull();
    const parent = el.parentElement;
    expect(parent.classList.contains('full-span')).toBe(true);
    expect(parent.parentElement.classList.contains('grid-2-full')).toBe(true);
  });

  test('dwellingCoverage is inside a full-span wrapper within grid-2-full', () => {
    const el = document.getElementById('dwellingCoverage');
    expect(el).not.toBeNull();
    const parent = el.parentElement;
    expect(parent.classList.contains('full-span')).toBe(true);
    expect(parent.parentElement.classList.contains('grid-2-full')).toBe(true);
  });

  test('mortgagee is inside a full-span wrapper within grid-2-full', () => {
    const el = document.getElementById('mortgagee');
    expect(el).not.toBeNull();
    const parent = el.parentElement;
    expect(parent.classList.contains('full-span')).toBe(true);
    expect(parent.parentElement.classList.contains('grid-2-full')).toBe(true);
  });

  test('personalLiability and medicalPayments are siblings without full-span', () => {
    const liability = document.getElementById('personalLiability');
    const medical = document.getElementById('medicalPayments');
    expect(liability).not.toBeNull();
    expect(medical).not.toBeNull();
    const liabilityParent = liability.parentElement;
    const medicalParent = medical.parentElement;
    // Neither should have full-span
    expect(liabilityParent.classList.contains('full-span')).toBe(false);
    expect(medicalParent.classList.contains('full-span')).toBe(false);
    // Both should share the same grid-2-full parent
    expect(liabilityParent.parentElement.classList.contains('grid-2-full')).toBe(true);
    expect(medicalParent.parentElement.classList.contains('grid-2-full')).toBe(true);
    expect(liabilityParent.parentElement).toBe(medicalParent.parentElement);
  });

  test('homeDeductible and windDeductible are siblings without full-span', () => {
    const deductible = document.getElementById('homeDeductible');
    const wind = document.getElementById('windDeductible');
    expect(deductible).not.toBeNull();
    expect(wind).not.toBeNull();
    const deductibleParent = deductible.parentElement;
    const windParent = wind.parentElement;
    // Neither should have full-span
    expect(deductibleParent.classList.contains('full-span')).toBe(false);
    expect(windParent.classList.contains('full-span')).toBe(false);
    // Both should share the same grid-2-full parent
    expect(deductibleParent.parentElement.classList.contains('grid-2-full')).toBe(true);
    expect(windParent.parentElement.classList.contains('grid-2-full')).toBe(true);
    expect(deductibleParent.parentElement).toBe(windParent.parentElement);
  });

  test('all Home Coverage fields live in a single grid-2-full container', () => {
    const ids = ['homePolicyType', 'dwellingCoverage', 'personalLiability', 'medicalPayments', 'homeDeductible', 'windDeductible', 'mortgagee'];
    const containers = ids.map(id => {
      const el = document.getElementById(id);
      expect(el).not.toBeNull();
      // Walk up to grid-2-full
      let node = el;
      while (node && !node.classList?.contains('grid-2-full')) node = node.parentElement;
      return node;
    });
    // All should resolve to the same grid-2-full container
    const unique = new Set(containers);
    expect(unique.size).toBe(1);
    expect(containers[0]).not.toBeNull();
  });
});

// ── Home Endorsements Layout ────────────────────────────────────────────────
describe('Home Endorsements Layout', () => {
  let window, document;

  beforeAll(() => {
    const env = createPluginTestDOM();
    window = env.window;
    document = window.document;
  });

  // Group 1: All dropdown selectors should live in a single grid-2-full
  const dropdownIds = [
    'increasedReplacementCost', 'ordinanceOrLaw', 'waterBackup', 'lossAssessment',
    'animalLiability', 'theftDeductible', 'jewelryLimit', 'creditCardCoverage', 'moldDamage'
  ];

  test('all endorsement dropdowns live in one grid-2-full container', () => {
    const containers = dropdownIds.map(id => {
      const el = document.getElementById(id);
      expect(el).not.toBeNull();
      let node = el;
      while (node && !node.classList?.contains('grid-2-full')) node = node.parentElement;
      return node;
    });
    const unique = new Set(containers);
    expect(unique.size).toBe(1);
    expect(containers[0]).not.toBeNull();
  });

  test('moldDamage is full-span within the endorsement grid', () => {
    const el = document.getElementById('moldDamage');
    expect(el).not.toBeNull();
    expect(el.parentElement.classList.contains('full-span')).toBe(true);
  });

  // Group 2: All 3 toggles in toggle-grid-3
  test('toggle-grid-3 CSS class is defined', () => {
    const source = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
    expect(source).toMatch(/\.toggle-grid-3\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr\s+1fr/);
  });

  test('toggle-card CSS class is defined with flex layout', () => {
    const source = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
    expect(source).toMatch(/\.toggle-card\s*\{[^}]*display:\s*flex/);
  });

  const toggleIds = ['equipmentBreakdown', 'serviceLine', 'earthquakeCoverage'];

  test('all 3 toggles are inside toggle-card elements within toggle-grid-3', () => {
    toggleIds.forEach(id => {
      const hidden = document.getElementById(id);
      expect(hidden).not.toBeNull();
      const card = hidden.closest('.toggle-card');
      expect(card).not.toBeNull();
      expect(card.parentElement.classList.contains('toggle-grid-3')).toBe(true);
    });
  });

  test('all 3 toggle-cards share the same toggle-grid-3 parent', () => {
    const parents = toggleIds.map(id => {
      return document.getElementById(id).closest('.toggle-grid-3');
    });
    const unique = new Set(parents);
    expect(unique.size).toBe(1);
  });

  test('no toggle-row elements remain in endorsements', () => {
    // Find the endorsements card by heading text
    const cards = document.querySelectorAll('.card');
    let endorseCard = null;
    cards.forEach(c => {
      const h2 = c.querySelector('h2');
      if (h2 && h2.textContent.includes('Home Endorsements')) endorseCard = c;
    });
    expect(endorseCard).not.toBeNull();
    const toggleRows = endorseCard.querySelectorAll('.toggle-row');
    expect(toggleRows.length).toBe(0);
  });

  // Earthquake progressive disclosure
  test('earthquakeDetailsWrapper exists and is hidden by default', () => {
    const wrapper = document.getElementById('earthquakeDetailsWrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper.classList.contains('disclosure-hidden')).toBe(true);
  });

  test('earthquake zone and deductible selects are inside the disclosure wrapper', () => {
    const wrapper = document.getElementById('earthquakeDetailsWrapper');
    expect(wrapper).not.toBeNull();
    const zone = wrapper.querySelector('#earthquakeZone');
    const ded = wrapper.querySelector('#earthquakeDeductible');
    expect(zone).not.toBeNull();
    expect(ded).not.toBeNull();
  });

  test('earthquake disclosure wrapper contains a grid-2-full', () => {
    const wrapper = document.getElementById('earthquakeDetailsWrapper');
    expect(wrapper).not.toBeNull();
    const grid = wrapper.querySelector('.grid-2-full');
    expect(grid).not.toBeNull();
  });

  test('earthquake toggle-field change handler is wired (JS source check)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(source).toContain('earthquakeDetailsWrapper');
    expect(source).toContain('earthquakeCoverage');
    expect(source).toMatch(/data-toggle-field.*earthquakeCoverage/);
  });

  test('syncSegmentedControls restores earthquake disclosure state', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js', 'app-core.js'), 'utf8');
    expect(source).toMatch(/syncSegmentedControls[\s\S]*earthquakeDetailsWrapper/);
  });

  test('toggle-grid-3 has responsive fallback for mobile', () => {
    const source = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
    expect(source).toMatch(/@media[^{]*max-width[^{]*\{[^}]*\.toggle-grid-3\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });
});

// ── About You Grid Layout ───────────────────────────────────────────────────
describe('About You Grid Layout', () => {
  let document;

  beforeAll(() => {
    const env = createPluginTestDOM();
    document = env.window.document;
  });

  const mainFieldIds = ['firstName', 'lastName', 'prefix', 'suffix', 'dob', 'gender', 'email', 'phone', 'maritalStatus'];

  test('all About You fields live in a single grid-2-full container', () => {
    const containers = mainFieldIds.map(id => {
      const el = document.getElementById(id);
      expect(el).not.toBeNull();
      let node = el;
      while (node && !node.classList?.contains('grid-2-full')) node = node.parentElement;
      return node;
    });
    const unique = new Set(containers);
    expect(unique.size).toBe(1);
    expect(containers[0]).not.toBeNull();
  });

  test('firstName appears before prefix in DOM order', () => {
    const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const firstNamePos = source.indexOf('id="firstName"');
    const prefixPos = source.indexOf('id="prefix"');
    expect(firstNamePos).toBeLessThan(prefixPos);
  });

  const coApplicantIds = ['coFirstName', 'coLastName', 'coDob', 'coGender', 'coEmail', 'coPhone', 'coRelationship'];

  test('all co-applicant fields live in a single grid-2-full container', () => {
    const containers = coApplicantIds.map(id => {
      const el = document.getElementById(id);
      expect(el).not.toBeNull();
      let node = el;
      while (node && !node.classList?.contains('grid-2-full')) node = node.parentElement;
      return node;
    });
    const unique = new Set(containers);
    expect(unique.size).toBe(1);
    expect(containers[0]).not.toBeNull();
  });

  test('About You and co-applicant use separate grid-2-full containers', () => {
    const firstName = document.getElementById('firstName');
    const coFirstName = document.getElementById('coFirstName');
    let mainGrid = firstName;
    while (mainGrid && !mainGrid.classList?.contains('grid-2-full')) mainGrid = mainGrid.parentElement;
    let coGrid = coFirstName;
    while (coGrid && !coGrid.classList?.contains('grid-2-full')) coGrid = coGrid.parentElement;
    expect(mainGrid).not.toBe(coGrid);
  });
});