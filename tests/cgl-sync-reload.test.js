/**
 * CGL Dashboard — sync-reload fix ("had to hit Refresh every time")
 *
 * Root cause this guards against: init() read localStorage exactly once,
 * BEFORE the Supabase restoreFromCloud() had written CGL_STATE, and nothing
 * ever re-read it — so the page sat empty until a manual Refresh.
 *
 * The fix wires the plugin page to re-render when synced data lands:
 *   - _wireSyncReload() subscribes to ActivityLog (mirrors dashboard-widgets)
 *   - it reacts ONLY to { type:'sync' } (the restore event) — never to the
 *     dashboard's own { type:'save', area:'cgl' } (which would loop)
 *   - _applySyncedReload() re-reads via the existing loadState() then repaints
 *     WITHOUT an API call when rows exist; pulls once if the page came up empty
 *   - _loadFromAnyCache() returns a policies-only (no allPolicies) blob
 *     instead of null so the user sees rows instantly
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');

function loadDashboard() {
    const dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="cglTableContainer"></div></body></html>',
        { url: 'http://localhost/', runScripts: 'outside-only' }
    );
    const { window } = dom;

    window.STORAGE_KEYS = { CGL_STATE: 'altech_cgl_state', CGL_CACHE: 'altech_cgl_cache' };
    window.Utils = {
        escapeHTML: (s) => String(s == null ? '' : s),
        escapeAttr: (s) => String(s == null ? '' : s),
        tryParseLS: (k, fb) => { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
        // Synchronous passthrough so subscriber → reload is deterministic.
        debounce: (fn) => fn
    };
    window.CglIDB = {
        setAnnotations: () => Promise.resolve(),
        getAnnotations: () => Promise.resolve(null),
        get: () => Promise.resolve(null),
        set: () => Promise.resolve()
    };
    window.Auth = { apiFetch: () => Promise.resolve({ ok: false, status: 501 }) };
    window.Sync = { schedulePush: () => {} };
    window.App = { toast: () => {} };

    // Capturable ActivityLog stub.
    const _subs = [];
    window.ActivityLog = {
        add: () => {},
        subscribe: (fn) => { _subs.push(fn); return () => {}; },
        _emit: (evt) => _subs.forEach((fn) => fn(evt))
    };

    window.eval(fs.readFileSync(path.join(ROOT, 'js/cgl-utils.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(ROOT, 'js/cgl-renderers.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(ROOT, 'js/cgl-backup.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(ROOT, 'js/compliance-dashboard.js'), 'utf8'));

    const CD = window.ComplianceDashboard;
    CD._kvAvailable = false;
    CD.syncStateToDisk = () => {};
    CD._syncToKV = () => {};
    CD._loadFromKV = () => Promise.resolve(null);

    return { CD, window };
}

describe('CGL sync-reload — ActivityLog subscription', () => {
    test('_wireSyncReload registers a subscriber and is idempotent', () => {
        const { CD } = loadDashboard();
        CD._wireSyncReload();
        CD._wireSyncReload(); // second call must be a no-op
        expect(CD._syncReloadWired).toBe(true);
    });

    test("a { type:'sync' } event re-reads restored CGL_STATE + repaints, NO API call", async () => {
        const { CD, window } = loadDashboard();
        CD._stateLoaded = true;
        CD.policies = [{ policyNumber: 'P1' }];
        let rendered = 0, statted = 0, apiCalls = 0;
        CD.renderPolicies = () => { rendered++; };
        CD.updateStats = () => { statted++; };
        CD.fetchPolicies = () => { apiCalls++; };
        CD.fetchPoliciesFromAPI = () => { apiCalls++; return Promise.resolve(); };

        CD._wireSyncReload();
        // Simulate restoreFromCloud() writing the synced blob, THEN emitting.
        window.localStorage.setItem('altech_cgl_state', JSON.stringify({
            verifiedPolicies: { 'POL-1': { updatedAt: '2026-05-01T10:00:00Z' } },
            dismissedPolicies: {}, policyNotes: {}
        }));
        window.ActivityLog._emit({ type: 'sync', area: 'supabase', message: 'Restored 3 docs from cloud' });
        await new Promise((r) => setTimeout(r, 0));

        expect(CD.verifiedPolicies['POL-1']).toBeTruthy(); // picked up post-init
        expect(rendered).toBeGreaterThan(0);
        expect(statted).toBeGreaterThan(0);
        expect(apiCalls).toBe(0); // cheap repaint, no network
    });

    test("the dashboard's own { type:'save', area:'cgl' } event does NOT loop", async () => {
        const { CD, window } = loadDashboard();
        CD._stateLoaded = true;
        CD.policies = [{ policyNumber: 'P1' }];
        let rendered = 0;
        CD.renderPolicies = () => { rendered++; };
        CD.updateStats = () => {};
        CD.fetchPolicies = () => {};
        CD.fetchPoliciesFromAPI = () => Promise.resolve();

        CD._wireSyncReload();
        window.ActivityLog._emit({ type: 'save', area: 'cgl', message: 'CGL state saved' });
        window.ActivityLog._emit(null); // ActivityLog.clear() passes null
        await new Promise((r) => setTimeout(r, 0));

        expect(rendered).toBe(0); // never reacted → no render loop
    });

    test('cold open (no rows) self-heals by pulling the table once on sync', async () => {
        const { CD, window } = loadDashboard();
        CD._stateLoaded = true;
        CD.policies = [];
        let pulled = 0;
        CD.renderPolicies = () => {};
        CD.updateStats = () => {};
        CD.fetchPolicies = () => { pulled++; };

        CD._wireSyncReload();
        window.ActivityLog._emit({ type: 'sync', area: 'supabase' });
        await new Promise((r) => setTimeout(r, 0));

        expect(pulled).toBe(1);
    });
});

describe('CGL sync-reload — cold-open cache gate softened', () => {
    test('_loadFromAnyCache returns a policies-only blob (no allPolicies) instead of null', async () => {
        const { CD, window } = loadDashboard();
        window.localStorage.setItem('altech_cgl_cache', JSON.stringify({
            cachedAt: Date.now(),
            policies: [{ policyNumber: 'P1' }]
            // intentionally NO allPolicies — pre-fix this returned null and
            // stalled on the slow server-cached API until a manual Refresh
        }));

        const cached = await CD._loadFromAnyCache();

        expect(cached).not.toBeNull();
        expect(cached._partialCache).toBe(true);
        expect(cached.policies).toHaveLength(1);
    });
});

describe('CGL loading→table reveal (stuck on "Loading…" until Refresh)', () => {
    // Reproduce the stuck state the bug report captured: data loaded
    // (rows + correct footer) but #cglLoading still display:block and
    // #cglTableContainer still display:none.
    function mountStuckDom(window) {
        window.document.body.innerHTML =
            '<div id="cglLoading" style="display:block"></div>' +
            '<div id="cglError" style="display:none"></div>' +
            '<div id="cglTableContainer" style="display:none">' +
            '<table><tbody id="cglTableBody"></tbody></table></div>' +
            '<div id="cglLastFetch"></div>';
    }
    function stubRender(CD) {
        CD._normalizePolicyKeys = () => {};
        CD.renderLastSynced = () => {};
        CD.renderTypeToggles = () => {};
        CD.renderPolicies = () => {};
        CD.updateStats = () => {};
        CD.deduplicateRenewals = () => {};
        CD.checkForRenewals = () => {};
        CD.verifyAllClients = () => {};
        CD.fetchPoliciesFromAPI = () => Promise.resolve();
    }
    const disp = (window, id) => window.document.getElementById(id).style.display;

    test('_revealTable() hides loading, shows table, clears error — idempotent', () => {
        const { CD, window } = loadDashboard();
        mountStuckDom(window);
        CD._revealTable();
        expect(disp(window, 'cglLoading')).toBe('none');
        expect(disp(window, 'cglTableContainer')).toBe('block');
        expect(disp(window, 'cglError')).toBe('none');
        CD._revealTable(); // idempotent
        expect(disp(window, 'cglLoading')).toBe('none');
        expect(disp(window, 'cglTableContainer')).toBe('block');
    });

    test('_showCachedData leaves the table visible on the cache-hit path', () => {
        const { CD, window } = loadDashboard();
        mountStuckDom(window);
        stubRender(CD);
        CD._showCachedData({
            policies: [{ policyNumber: 'P1' }], allPolicies: [{}],
            cachedAt: Date.now(), metadata: {}
        });
        expect(disp(window, 'cglLoading')).toBe('none');
        expect(disp(window, 'cglTableContainer')).toBe('block');
    });

    test('_showCachedData still reveals the table even if a renewal step throws', () => {
        const { CD, window } = loadDashboard();
        mountStuckDom(window);
        stubRender(CD);
        CD.deduplicateRenewals = () => { throw new Error('boom'); };
        expect(() => CD._showCachedData({
            policies: [{ policyNumber: 'P1' }], allPolicies: [{}],
            cachedAt: Date.now(), metadata: {}
        })).not.toThrow();
        expect(disp(window, 'cglLoading')).toBe('none');
        expect(disp(window, 'cglTableContainer')).toBe('block');
    });

    test('boot-time sync event reveals the table (the actual reported bug)', async () => {
        const { CD, window } = loadDashboard();
        mountStuckDom(window);                  // loading up, table hidden
        stubRender(CD);
        CD._stateLoaded = true;
        CD.policies = [{ policyNumber: 'P1' }]; // data already underneath
        let apiCalls = 0;
        CD.fetchPolicies = () => { apiCalls++; };

        CD._wireSyncReload();
        window.ActivityLog._emit({ type: 'sync', area: 'supabase', message: 'Restored' });
        await new Promise((r) => setTimeout(r, 0));

        expect(disp(window, 'cglLoading')).toBe('none');        // was 'block'
        expect(disp(window, 'cglTableContainer')).toBe('block'); // was 'none'
        expect(apiCalls).toBe(0); // pure repaint+reveal, no network
    });
});
