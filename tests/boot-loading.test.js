const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function createBootDom(url = 'http://localhost:8000') {
  const html = `<!doctype html><html><head></head><body>
    <div id="dashboardGreeting"></div>
    <div id="dashboardView" style="display:block"></div>
  </body></html>`;

  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });

  const w = dom.window;
  w.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
  w.App = {
    mapApiKey: null,
    loadDarkMode: jest.fn(),
    goHome: jest.fn(),
    navigateTo: jest.fn().mockResolvedValue(undefined),
    observePluginVisibility: jest.fn(),
    renderLandingTools: jest.fn(),
    updateLandingGreeting: jest.fn(),
    updateCGLBadge: jest.fn(),
    initPlaces: jest.fn(),
    toast: jest.fn(),
    initialized: true,
    save: jest.fn(),
    next: jest.fn(),
    _routerNavigating: false
  };
  w.Auth = {
    init: jest.fn(),
    ready: jest.fn().mockResolvedValue(undefined),
    apiFetch: jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ apiKey: 'k_server' }) }))
  };
  w.FirebaseConfig = {
    sdkLoaded: false,
    init: jest.fn().mockResolvedValue(undefined)
  };
  w.DashboardWidgets = {
    init: jest.fn(),
    refreshAll: jest.fn(),
    renderHeader: jest.fn()
  };
  w.Onboarding = { init: jest.fn() };
  w.Reminders = { init: jest.fn(), checkAlerts: jest.fn() };
  w.navigator.serviceWorker = { register: jest.fn().mockResolvedValue({ scope: '/' }) };

  const source = fs.readFileSync(path.join(ROOT, 'js/app-boot.js'), 'utf8');
  w.eval(source);

  return dom;
}

describe('App Boot + First-Load Reliability', () => {
  test('boot source includes both first-load fallback and safety-net widget render', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/app-boot.js'), 'utf8');

    expect(source).toContain('Fallback: If window.onload never fires');
    expect(source).toContain('setTimeout(() => {');
    expect(source).toContain('5000');
    expect(source).toContain('Safety Net: Force-render dashboard widgets if still empty after 2s');
    expect(source).toContain('DashboardWidgets.refreshAll()');
    expect(source).toContain('DashboardWidgets.renderHeader()');
  });

  test('loadPlacesAPI uses server key and injects Google script', async () => {
    const dom = createBootDom();
    const w = dom.window;

    w.Auth.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiKey: 'server_123' })
    });

    const before = w.document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]').length;
    await w.loadPlacesAPI();
    const afterScripts = [...w.document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')];
    const after = afterScripts.length;

    expect(after).toBe(before + 1);
    expect(afterScripts[afterScripts.length - 1].src).toContain('key=server_123');
    expect(w.App.mapApiKey).toBe('server_123');

    dom.window.close();
  });

  test('loadPlacesAPI falls back to query param key when server key unavailable', async () => {
    const dom = createBootDom('http://localhost:8000/?placesKey=query_999');
    const w = dom.window;

    w.Auth.apiFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const before = w.document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]').length;

    await w.loadPlacesAPI();

    const scripts = [...w.document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')];
    expect(scripts.length).toBe(before + 1);
    expect(scripts[scripts.length - 1].src).toContain('key=query_999');
    expect(w.App.mapApiKey).toBe('query_999');

    dom.window.close();
  });

  test('loadPlacesAPI exits cleanly without script injection when no key exists', async () => {
    const dom = createBootDom();
    const w = dom.window;

    w.Auth.apiFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    delete w.__PLACES_API_KEY__;

    const before = w.document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]').length;
    await w.loadPlacesAPI();
    const after = w.document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]').length;

    expect(after).toBe(before);

    dom.window.close();
  });
});
