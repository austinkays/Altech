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

function bootstrap({ reminders, policies, activity } = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="dashboardView" style="display:block;">
            <div id="widgetToday" class="widget-card widget-today"></div>
        </div>
        <div id="toast"></div>
    </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

    const w = dom.window;
    w.STORAGE_KEYS = { CLIENT_HISTORY: 'altech_client_history' };
    w.Utils = { escapeHTML: (s) => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])) };
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
    w.firebase = undefined;
    w.CloudSync = undefined;
    w.SupabaseSync = undefined;
    w.Auth = undefined;
    w.fetch = () => Promise.reject(new Error('no network'));

    dom.window.eval(WIDGETS_SRC);
    return dom;
}

describe('Today widget — render', () => {
    test('happy path: all three sections populated', () => {
        const dom = bootstrap({
            reminders: [
                { title: 'Call back insured', status: 'overdue', statusLabel: 'Missed' },
                { title: 'Send quote to Smith', status: 'due-today', statusLabel: 'Due today' },
            ],
            policies: [
                { policyNumber: 'P-1', expirationDate: new Date(Date.now() + 86400000 * 3).toISOString(), firstName: 'Pat', lastName: 'Q' },
            ],
            activity: [
                { ts: Date.now() - 60000, type: 'save', message: 'CGL state saved', ok: true },
                { ts: Date.now() - 30000, type: 'sync', message: 'Synced 3 docs', ok: true },
            ],
        });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('Today');
        expect(html).toContain('Call back insured');
        expect(html).toContain('Send quote to Smith');
        expect(html).toContain('Pat Q');
        // Exp date is "+3 days from now" — depending on the wall-clock hour the
        // round() lands on 3 or 4 days. Either is valid.
        expect(html).toMatch(/In [34]d/);
        expect(html).toContain('CGL state saved');
        expect(html).toContain('Synced 3 docs');
        expect(html).toContain('💾');
        expect(html).toContain('☁️');
        dom.window.close();
    });

    test('empty state: shows "No urgent reminders 🎉" + no-policy + no-activity placeholders', () => {
        const dom = bootstrap({ reminders: [], policies: [], activity: [] });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('No urgent reminders');
        expect(html).toContain('No policies expiring');
        expect(html).toContain('No recent activity');
        dom.window.close();
    });

    test('filters reminders to only overdue + due-today (drops due-soon / upcoming)', () => {
        const dom = bootstrap({
            reminders: [
                { title: 'Overdue task', status: 'overdue' },
                { title: 'Today task', status: 'due-today' },
                { title: 'Soon task', status: 'due-soon' },
                { title: 'Future task', status: 'upcoming' },
            ],
        });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('Overdue task');
        expect(html).toContain('Today task');
        expect(html).not.toContain('Soon task');
        expect(html).not.toContain('Future task');
        dom.window.close();
    });

    test('filters policies to the 14-day window + drops hidden ones', () => {
        const now = Date.now();
        const dom = bootstrap({
            policies: [
                { policyNumber: 'P-soon', expirationDate: new Date(now + 86400000 * 5).toISOString(), lastName: 'In' },
                { policyNumber: 'P-far',  expirationDate: new Date(now + 86400000 * 30).toISOString(), lastName: 'Out' },
                { policyNumber: 'P-yesterday', expirationDate: new Date(now - 86400000).toISOString(), lastName: 'Past' },
            ],
        });
        // Override isHidden to mark "P-far" as hidden — also outside the
        // window, so this is a defense check.
        dom.window.ComplianceDashboard.isHidden = (pn) => pn === 'P-far';
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).toContain('In');
        // Past is still in-window (14d back is the bound; "expired N days ago" is fine).
        expect(html).toContain('Past');
        // Out is excluded by both date and hidden.
        expect(html).not.toContain('Out');
        dom.window.close();
    });

    test('escapes HTML in titles and messages', () => {
        const dom = bootstrap({
            reminders: [{ title: '<img src=x onerror=alert(1)>', status: 'overdue', statusLabel: 'Missed' }],
            activity: [{ ts: Date.now(), type: 'save', message: '<script>alert(2)</script>', ok: true }],
        });
        dom.window.DashboardWidgets.renderTodayWidget();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        expect(html).not.toContain('<img src=x onerror=alert(1)>');
        expect(html).toContain('&lt;img');
        expect(html).not.toContain('<script>alert(2)</script>');
        expect(html).toContain('&lt;script');
        dom.window.close();
    });

    test('feature-detects missing Reminders/Compliance/ActivityLog without throwing', () => {
        const dom = bootstrap({}); // all undefined
        expect(() => dom.window.DashboardWidgets.renderTodayWidget()).not.toThrow();
        const html = dom.window.document.getElementById('widgetToday').innerHTML;
        // All three sections fall back to their empty-state strings.
        expect(html).toContain('No urgent reminders');
        expect(html).toContain('No policies expiring');
        expect(html).toContain('No recent activity');
        dom.window.close();
    });
});
