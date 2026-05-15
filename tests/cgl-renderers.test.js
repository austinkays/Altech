/**
 * cgl-renderers.js — unit tests for the badge/note HTML builders extracted
 * from compliance-dashboard.js. These are pure (args + globals CglUtil/Utils
 * only); onclick handlers are ComplianceDashboard.* string literals, never
 * invoked here. The harness evals cgl-utils.js first (CglRenderers depends on
 * window.CglUtil) — same load order as index.html.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const UTILS_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'cgl-utils.js'), 'utf8');
const REND_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'cgl-renderers.js'), 'utf8');

function load() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost/', runScripts: 'outside-only',
    });
    dom.window.Utils = {
        escapeAttr: (s) => String(s == null ? '' : s).replace(/"/g, '&quot;'),
        escapeHTML: (s) => String(s == null ? '' : s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])),
    };
    dom.window.eval(UTILS_SRC);   // window.CglUtil — must precede renderers
    dom.window.eval(REND_SRC);    // window.CglRenderers
    return dom.window.CglRenderers;
}

describe('CglRenderers.liCcbBadges', () => {
    const R = load();
    test('non-applicable policy type → empty', () => {
        expect(R.liCcbBadges({ policyType: 'auto', clientNumber: '1' }, { classification: 'wa-contractor' })).toBe('');
    });
    test('no/unverified compliance → "Verify" chip wired to reverifyClient', () => {
        const html = R.liCcbBadges({ policyType: 'cgl', clientNumber: 'C1' }, null);
        expect(html).toContain('❓ Verify');
        expect(html).toContain("ComplianceDashboard.reverifyClient('C1')");
        const html2 = R.liCcbBadges({ policyType: 'cgl', clientNumber: 'C1' }, { classification: 'unverified' });
        expect(html2).toContain('❓ Verify');
    });
    test('exempt → empty (suppressed)', () => {
        expect(R.liCcbBadges({ policyType: 'cgl', clientNumber: 'C1' }, { classification: 'exempt' })).toBe('');
    });
    test('wa-contractor not yet reported → needs-report WA L&I badge', () => {
        const html = R.liCcbBadges(
            { policyType: 'cgl', clientNumber: 'C1', expirationDate: '2026-12-31' },
            { classification: 'wa-contractor' });
        expect(html).toContain('🛠️ WA L&amp;I');
        expect(html).toContain("ComplianceDashboard.markReportedToWA('C1', '2026-12-31')");
    });
    test('wa-contractor reported for current expiration → reported badge', () => {
        const html = R.liCcbBadges(
            { policyType: 'cgl', clientNumber: 'C1', expirationDate: '2026-12-31' },
            { classification: 'wa-contractor', waReportedForExp: '2026-12-31', waReportedAt: '2026-06-01T00:00:00Z' });
        expect(html).toContain('✅ WA L&amp;I');
        expect(html).toContain("ComplianceDashboard.clearReportedWA('C1')");
    });
    test('wa-or-contractor emits both WA and OR badges', () => {
        const html = R.liCcbBadges(
            { policyType: 'cgl', clientNumber: 'C1', expirationDate: '2026-12-31' },
            { classification: 'wa-or-contractor' });
        expect(html).toContain('WA L&amp;I');
        expect(html).toContain('OR CCB');
    });
    test('apostrophe in clientNumber is JS-escaped in the onclick', () => {
        const html = R.liCcbBadges({ policyType: 'cgl', clientNumber: "O'X" }, null);
        expect(html).toContain("reverifyClient('O\\'X')");
    });
});

describe('CglRenderers.classificationOverride', () => {
    const R = load();
    test('non-applicable → empty', () => {
        expect(R.classificationOverride({ policyType: 'wc', clientNumber: '1' }, {})).toBe('');
    });
    test('renders the 4 class buttons + reverify, active state reflects classification', () => {
        const html = R.classificationOverride(
            { policyType: 'cgl', clientNumber: 'C1' },
            { classification: 'or-contractor', classificationSource: 'manual' });
        expect(html).toContain("setClientClassification('C1', 'wa-contractor')");
        expect(html).toContain("setClientClassification('C1', 'or-contractor')");
        expect(html).toContain("setClientClassification('C1', 'wa-or-contractor')");
        expect(html).toContain("setClientClassification('C1', 'exempt')");
        expect(html).toContain("ComplianceDashboard.reverifyClient('C1')");
        // active class on the matching button
        expect(html).toMatch(/cgl-class-btn active[^>]*or-contractor/);
        expect(html).toContain('manual override');
    });
    test('null compliance → unverified source label, no active button', () => {
        const html = R.classificationOverride({ policyType: 'cgl', clientNumber: 'C1' }, null);
        expect(html).toContain('unverified');
        expect(html).not.toContain('cgl-class-btn active');
    });
});

describe('CglRenderers.noteLog', () => {
    const R = load();
    test('null / empty log → empty string', () => {
        expect(R.noteLog('P1', null)).toBe('');
        expect(R.noteLog('P1', { log: [] })).toBe('');
    });
    test('entries render newest-first with escaped text + delete onclick', () => {
        const data = { log: [
            { text: 'first <b>', at: new Date(Date.now() - 7200000).toISOString() },
            { text: 'second', at: new Date(Date.now() - 60000).toISOString() },
        ] };
        const html = R.noteLog('P1', data);
        // reversed: 'second' (origIdx 1) appears before 'first' (origIdx 0)
        expect(html.indexOf('second')).toBeLessThan(html.indexOf('first'));
        expect(html).toContain('first &lt;b&gt;');               // HTML-escaped
        expect(html).toContain("deleteNoteEntry('P1',1)");        // newest = origIdx 1
        expect(html).toContain("deleteNoteEntry('P1',0)");        // oldest = origIdx 0
    });
    test('policyNumber with apostrophe is JS-escaped in the delete onclick', () => {
        const html = R.noteLog("P'1", { log: [{ text: 'x', at: new Date().toISOString() }] });
        expect(html).toContain("deleteNoteEntry('P\\'1',0)");
    });
});
