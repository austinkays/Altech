/**
 * Regression coverage for the Today widget.
 *
 * The widget consolidates three sections (urgent reminders, expiring policies,
 * recent activity) into one card at the top of the bento grid. Each section
 * is feature-detected at render time, so this test:
 *   1. Boots dashboard-widgets.js in JSDOM with minimal stubs.
 *   2. Asserts each collector function returns the expected slice.
 *   3. Asserts the render output contains the right items + section titles.
 *   4. Asserts the empty-state branches fire when collectors return nothing.
 *   5. Asserts the Cmd+K "action:today" command exists with the right behavior.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const WIDGETS_SRC = readSrc('js/dashboard-widgets.js');
const PALETTE_SRC = readSrc('js/command-palette.js');

// ── Source-level guards ───────────────────────────────────────────────────

describe('Today widget — source layout', () => {
    test('renders into #widgetToday in the bento grid', () => {
        const html = readSrc('index.html');
        expect(html).toMatch(/<div id="widgetToday" class="widget-card widget-today"><\/div>/);
        // Today comes first in the grid so it's prominent.
        const idx = html.indexOf('id="widgetToday"');
        const wIdx = html.indexOf('id="widgetWeather"');
        expect(idx).toBeGreaterThan(0);
        expect(wIdx).toBeGreaterThan(idx);
    });

    test('renderTodayWidget is exposed on the DashboardWidgets public API', () => {
        expect(WIDGETS_SRC).toMatch(/^\s+renderTodayWidget,/m);
    });

    test('refreshAll calls renderTodayWidget alongside the other widgets', () => {
        expect(WIDGETS_SRC).toMatch(/try \{ renderTodayWidget\(\); \}/);
    });

    test('subscribes to ActivityLog so live events refresh the widget', () => {
        expect(WIDGETS_SRC).toMatch(/window\.ActivityLog\.subscribe\(\(\)\s*=>\s*\{/);
        expect(WIDGETS_SRC).toMatch(/_todayActivitySubscribed/);
    });

    test('CSS for .widget-today spans 8 columns and has flash animation', () => {
        const css = readSrc('css/dashboard.css');
        expect(css).toMatch(/\.widget-today\s*\{[^}]*grid-column:\s*span\s*8/);
        expect(css).toContain('@keyframes widget-today-flash');
        expect(css).toMatch(/\.widget-today\.widget-flash/);
    });
});

// ── Cmd+K integration ────────────────────────────────────────────────────

describe('Today widget — Cmd+K "Today view" command', () => {
    test('action:today command exists with goHome + scrollIntoView wiring', () => {
        expect(PALETTE_SRC).toContain("id: 'action:today'");
        expect(PALETTE_SRC).toContain("label: 'Today view'");
        expect(PALETTE_SRC).toContain('window.App.goHome()');
        expect(PALETTE_SRC).toMatch(/document\.getElementById\(['"]widgetToday['"]\)/);
        expect(PALETTE_SRC).toContain("scrollIntoView({ behavior: 'smooth'");
        // Flash class is added then auto-removed.
        expect(PALETTE_SRC).toContain("el.classList.add('widget-flash')");
        expect(PALETTE_SRC).toContain("el.classList.remove('widget-flash')");
    });
});

// ── Render behavior in JSDOM ─────────────────────────────────────────────

function bootstrap({ reminders, policies, activity, quotes } = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="dashboardView" style="display:block;">
            <div id="widgetToday" class="widget-card widget-today"></div>
        </div>
        <div id="toast"></div>
    </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

    const w = dom.window;
    w.STORAGE_KEYS = {
        CLIENT_HISTORY: 'altech_client_history',
        QUOTES: 'altech_v6_quotes',
        INTAKE_V2_QUOTES: 'altech_v6_intake_v2_quotes',
        COMMERCIAL_QUOTES: 'altech_commercial_quotes',
    };
    // Seed the quote stores (the "Unfinished" source) into JSDOM localStorage.
    for (const [k, v] of Object.entries(quotes || {})) {
        if (w.STORAGE_KEYS[k]) w.localStorage.setItem(w.STORAGE_KEYS[k], JSON.stringify(v));
    }
    w.Utils = {
        escapeHTML: (s) => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])),
        tryParseLS: (key, fallback) => {
            try { const r = w.localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
        },
    };
    w.Reminders = reminders ? {
        getUpcomingTasks: () => reminders,
        getCounts: () => ({ total: reminders.length, overdue: 0, dueToday: 0, dueSoon: 0, completed: 0, upcoming: 0, snoozed: 0 }),
    } : undefined;
    w.ComplianceDashboard = policies ? {
        policies,
        isHidden: () => false,
    } : undefined;
    w.ActivityLog = activity ? { list: () => activity, subscribe: () => () => {} } : undefined;
    w.App = { navigateTo: () => {}, goHome: () => {} };

    // Stub everything dashboard-widgets.js needs but doesn't matter for this test.
    w.SupabaseSync = undefined;
    w.Sync = undefined;
    w.Auth = undefined;
    w.fetch = () => Promise.reject(new Error('no network'));

    dom.window.eval(WIDGETS_SRC);
    return dom;
}

describe('Today widget — render (Next + Unfinished triage)', () => {
    test('happy path: Next ranks failure → overdue → expiring → due-today; Unfinished lists stale drafts', () => {
        const now = Date.now();
        const dom = bootstrap({
            reminders: [
                { title: 'Call back insured', status: 'overdue', statusLabel: 'Missed' },
                { title: 'Send quote to Smith', status: 'due-today', statusLabel: 'Due today' },
            ],
            policies: [
                { policyNumber: 'P-1', expirationDate: new Date(now + 86400000 * 3).toISOString(), firstName: 'Pat', lastName: 'Q' },
            ],
            activity: [
                { ts: now - 30000, type: 'error', message: 'Sync failed', ok: false },
            ],
            quotes: {
                QUOTES: [
                    { id: '1', title: 'Stale Jones quote', updatedAt: new Date(now - 86400000 * 5).toISOString() },
                    { id: '2', title: 'Fresh quote', updatedAt: new Date(now - 3600000).toISOString() },
                ],
            },
        });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('Today');
        expect(html).toContain('⚡ Next');
        expect(html).toContain('🗂️ Unfinished');
        // All four Next sources rendered.
        expect(html).toContain('Sync failed');
        expect(html).toContain('today-activity-fail');
        expect(html).toContain('Call back insured');
        expect(html).toContain('Pat Q');
        expect(html).toMatch(/In [34]d/);
        expect(html).toContain('Send quote to Smith');
        // Ranking: failure < overdue < expiring < due-today.
        expect(html.indexOf('Sync failed')).toBeLessThan(html.indexOf('Call back insured'));
        expect(html.indexOf('Call back insured')).toBeLessThan(html.indexOf('Pat Q'));
        expect(html.indexOf('Pat Q')).toBeLessThan(html.indexOf('Send quote to Smith'));
        // Unfinished: stale draft shown with idle age, fresh one excluded.
        expect(html).toContain('Stale Jones quote');
        expect(html).toContain('idle 5d');
        expect(html).toContain('today-src-tag');
        expect(html).not.toContain('Fresh quote');
        dom.window.close();
    });

    test('empty states: "All clear" + "Nothing left hanging"', () => {
        const dom = bootstrap({ reminders: [], policies: [], activity: [], quotes: {} });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('All clear — nothing urgent');
        expect(html).toContain('Nothing left hanging');
        dom.window.close();
    });

    test('Next is capped at 5 and keeps the failure pinned first', () => {
        const now = Date.now();
        const reminders = [];
        for (let i = 0; i < 8; i++) reminders.push({ title: `Overdue ${i}`, status: 'overdue' });
        const dom = bootstrap({
            reminders,
            activity: [{ ts: now, type: 'error', message: 'Boom', ok: false }],
        });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        const rows = (html.match(/today-row/g) || []).length;
        expect(rows).toBe(5);
        expect(html).toContain('Boom');
        expect(html.indexOf('Boom')).toBeLessThan(html.indexOf('Overdue 0'));
        // 8 overdue + 1 failure, capped at 5 → only first 4 overdue survive.
        expect(html).not.toContain('Overdue 7');
        dom.window.close();
    });

    test('Next: expirations honor the 7-day window + isHidden', () => {
        const now = Date.now();
        const dom = bootstrap({
            policies: [
                { policyNumber: 'P-soon', expirationDate: new Date(now + 86400000 * 5).toISOString(), lastName: 'Insoon' },
                { policyNumber: 'P-far',  expirationDate: new Date(now + 86400000 * 12).toISOString(), lastName: 'Outfar' },
                { policyNumber: 'P-hidden', expirationDate: new Date(now + 86400000 * 2).toISOString(), lastName: 'Hiddenone' },
            ],
        });
        dom.window.ComplianceDashboard.isHidden = (pn) => pn === 'P-hidden';
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('Insoon');          // 5d ≤ 7d window
        expect(html).not.toContain('Outfar');      // 12d > 7d window
        expect(html).not.toContain('Hiddenone');   // dismissed/hidden
        dom.window.close();
    });

    test('Unfinished: ≥2d threshold, oldest-first, cap 4, derives name + source tag across stores', () => {
        const now = Date.now();
        const day = 86400000;
        const dom = bootstrap({
            quotes: {
                QUOTES: [
                    { id: 'a', data: { firstName: 'Ann', lastName: 'Lee' }, updatedAt: new Date(now - day * 9).toISOString() },
                    { id: 'b', title: 'Yesterday only', updatedAt: new Date(now - day * 1).toISOString() }, // fresh — excluded
                ],
                COMMERCIAL_QUOTES: [
                    { id: 'c', data: { bizName: 'Acme LLC' }, updatedAt: new Date(now - day * 3).toISOString() },
                ],
                INTAKE_V2_QUOTES: [
                    { id: 'd', title: 'V2 draft', updatedAt: new Date(now - day * 6).toISOString() },
                ],
            },
        });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        // Derived names + source tags.
        expect(html).toContain('Ann Lee');
        expect(html).toContain('Acme LLC');
        expect(html).toContain('V2 draft');
        expect(html).toContain('>PL<');
        expect(html).toContain('>Comm<');
        expect(html).toContain('>V2<');
        // Fresh (1d) excluded by the 2-day threshold.
        expect(html).not.toContain('Yesterday only');
        // Oldest first: Ann (9d) before V2 (6d) before Acme (3d).
        expect(html.indexOf('Ann Lee')).toBeLessThan(html.indexOf('V2 draft'));
        expect(html.indexOf('V2 draft')).toBeLessThan(html.indexOf('Acme LLC'));
        // Deep-link nav per store.
        expect(html).toContain("App.navigateTo('quoting')");
        expect(html).toContain("App.navigateTo('commercial')");
        expect(html).toContain("App.navigateTo('intakev2')");
        dom.window.close();
    });

    test('rows are clickable and wired to the right destinations', () => {
        const now = Date.now();
        const dom = bootstrap({
            reminders: [{ title: 'Overdue task', status: 'overdue' }],
            activity: [{ ts: now, type: 'error', message: 'Boom', ok: false }],
        });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('today-row');
        // (innerHTML serializes the `&&` guard as &amp;&amp;, so assert the
        // ampersand-free part — the failure row opens the Activity panel.)
        expect(html).toContain('window.ActivityLog.openPanel()'); // failure row
        expect(html).toContain("App.navigateTo('reminders')");    // overdue row + header link
        dom.window.close();
    });

    test('escapes HTML in Next titles and Unfinished draft names', () => {
        const dom = bootstrap({
            reminders: [{ title: '<img src=x onerror=alert(1)>', status: 'overdue' }],
            activity: [{ ts: Date.now(), type: 'error', message: '<script>alert(2)</script>', ok: false }],
            quotes: { QUOTES: [{ id: 'x', title: '<b>xss</b>', updatedAt: new Date(Date.now() - 86400000 * 4).toISOString() }] },
        });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).not.toContain('<img src=x onerror=alert(1)>');
        expect(html).toContain('&lt;img');
        expect(html).not.toContain('<script>alert(2)</script>');
        expect(html).toContain('&lt;script');
        expect(html).not.toContain('<b>xss</b>');
        expect(html).toContain('&lt;b&gt;xss');
        dom.window.close();
    });

    test('feature-detects missing Reminders/Compliance/ActivityLog/quote stores without throwing', () => {
        const dom = bootstrap({}); // all undefined, no quote stores seeded
        expect(() => dom.window.DashboardWidgets.renderTodayWidget()).not.toThrow();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('All clear — nothing urgent');
        expect(html).toContain('Nothing left hanging');
        dom.window.close();
    });
});
