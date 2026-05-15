/**
 * cgl-utils.js — unit tests for the pure helper module extracted from
 * compliance-dashboard.js. Every function here is pure (args + global Utils
 * only), so the harness just injects a Utils stub and evals the module.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'cgl-utils.js'), 'utf8');

function load() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost/', runScripts: 'outside-only',
    });
    // Faithful-enough Utils stubs: identity-ish so we can assert the JS-escape
    // layer of escJsAttr independently of the HTML-attr layer.
    dom.window.Utils = {
        escapeAttr: (s) => String(s == null ? '' : s).replace(/"/g, '&quot;'),
        escapeHTML: (s) => String(s == null ? '' : s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])),
    };
    dom.window.eval(SRC);
    return dom.window.CglUtil;
}

describe('CglUtil.escJsAttr', () => {
    const U = load();
    test('null/undefined → empty string', () => {
        expect(U.escJsAttr(null)).toBe('');
        expect(U.escJsAttr(undefined)).toBe('');
    });
    test('apostrophe is JS-escaped before the HTML-attr layer', () => {
        // O'Brien → JS layer → O\'Brien → escapeAttr (no quotes) → unchanged
        expect(U.escJsAttr("O'Brien")).toBe("O\\'Brien");
    });
    test('backslash is doubled (JS string safety)', () => {
        expect(U.escJsAttr('a\\b')).toBe('a\\\\b');
    });
    test('double quote flows through the HTML-attr layer', () => {
        expect(U.escJsAttr('a"b')).toBe('a&quot;b');
    });
});

describe('CglUtil._hasAnnotationData', () => {
    const U = load();
    test('false for null / all-empty', () => {
        expect(U._hasAnnotationData(null)).toBe(false);
        expect(U._hasAnnotationData({ verifiedPolicies: {}, dismissedPolicies: {}, policyNotes: {}, clientCompliance: {} })).toBe(false);
    });
    test('true when any dict has data', () => {
        expect(U._hasAnnotationData({ verifiedPolicies: { a: 1 } })).toBe(true);
        expect(U._hasAnnotationData({ clientCompliance: { c: 1 } })).toBe(true);
        expect(U._hasAnnotationData({ policyNotes: { p: 1 } })).toBe(true);
    });
});

describe('CglUtil._smartMergeDict', () => {
    const U = load();
    test('target wins on conflict, source fills gaps, never deletes', () => {
        const out = U._smartMergeDict({ a: 1, b: 2 }, { b: 99, c: 3 });
        expect(out).toEqual({ a: 1, b: 2, c: 3 });
    });
    test('null/undefined source is safe', () => {
        expect(U._smartMergeDict({ a: 1 }, null)).toEqual({ a: 1 });
        expect(U._smartMergeDict({ a: 1 }, undefined)).toEqual({ a: 1 });
    });
    test('returns a new object (no mutation of target)', () => {
        const t = { a: 1 };
        U._smartMergeDict(t, { b: 2 });
        expect(t).toEqual({ a: 1 });
    });
});

describe('CglUtil._migrateNote', () => {
    const U = load();
    test('null → null', () => expect(U._migrateNote(null)).toBeNull());
    test('already migrated (log array) passes through', () => {
        const m = { log: [{ text: 'x', at: 't' }], renewedTo: null };
        expect(U._migrateNote(m)).toBe(m);
    });
    test('legacy {text,updatedAt} → log array shape', () => {
        const r = U._migrateNote({ text: 'hi', updatedAt: '2026-01-01', renewedTo: 'P9' });
        expect(r.log).toEqual([{ text: 'hi', at: '2026-01-01' }]);
        expect(r.renewedTo).toBe('P9');
    });
    test('object with neither text nor log → null', () => {
        expect(U._migrateNote({ foo: 1 })).toBeNull();
    });
});

describe('CglUtil.formatNoteTime', () => {
    const U = load();
    test('falsy → empty', () => expect(U.formatNoteTime('')).toBe(''));
    test('<1 min → just now', () => {
        expect(U.formatNoteTime(new Date(Date.now() - 5000).toISOString())).toBe('just now');
    });
    test('minutes / hours / days buckets', () => {
        expect(U.formatNoteTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5m ago');
        expect(U.formatNoteTime(new Date(Date.now() - 3 * 3600000).toISOString())).toBe('3h ago');
        expect(U.formatNoteTime(new Date(Date.now() - 2 * 86400000).toISOString())).toBe('2d ago');
    });
    test('>7 days → a localized date string (not the relative form)', () => {
        const out = U.formatNoteTime(new Date(Date.now() - 30 * 86400000).toISOString());
        expect(out).not.toMatch(/ago|just now/);
        expect(out.length).toBeGreaterThan(0);
    });
});

describe('CglUtil._noteIcon / _noteLabel / _noteIconHtml', () => {
    const U = load();
    test('known phrases map to icons', () => {
        expect(U._noteIcon('Notified Insured')).toBe('📞');
        expect(U._noteIcon('emailed insured')).toBe('📧');
        expect(U._noteIcon('auto-cleared blah')).toBe('🔄');
    });
    test('💤-prefixed → no icon; unknown → 💬', () => {
        expect(U._noteIcon('💤 snoozed')).toBe('');
        expect(U._noteIcon('whatever')).toBe('💬');
        expect(U._noteIcon('')).toBe('💬');
    });
    test('_noteLabel known + default', () => {
        expect(U._noteLabel('left voicemail')).toBe('Left Voicemail');
        expect(U._noteLabel('renewed to P9')).toBe('Renewed');
        expect(U._noteLabel('anything else')).toBe('Note');
    });
    test('_noteIconHtml empty when icon suppressed; span otherwise', () => {
        expect(U._noteIconHtml('💤 snoozed')).toBe('');
        const html = U._noteIconHtml('Notified Insured');
        expect(html).toContain('📞');
        expect(html).toContain('class="cgl-note-icon"');
        expect(html.endsWith('</span> ')).toBe(true);
    });
});

describe('CglUtil._isLICCBApplicableType', () => {
    const U = load();
    test('applicable commercial types', () => {
        for (const t of ['cgl', 'pkg', 'bop', 'commercial']) {
            expect(U._isLICCBApplicableType({ policyType: t })).toBe(true);
        }
    });
    test('missing policyType defaults to cgl (applicable)', () => {
        expect(U._isLICCBApplicableType({})).toBe(true);
    });
    test('non-applicable types', () => {
        for (const t of ['auto', 'wc', 'umbrella', 'bond']) {
            expect(U._isLICCBApplicableType({ policyType: t })).toBe(false);
        }
    });
});

describe('CglUtil._summarizeLILookup / _summarizeCCBLookup', () => {
    const U = load();
    test('null → null', () => {
        expect(U._summarizeLILookup(null)).toBeNull();
        expect(U._summarizeCCBLookup(null)).toBeNull();
    });
    test('LI contractor shape uses license', () => {
        expect(U._summarizeLILookup({ contractor: { licenseNumber: 'L1', status: 'Active', businessName: 'B' } }))
            .toEqual({ license: 'L1', status: 'Active', businessName: 'B' });
    });
    test('CCB contractor shape uses number (ccbNumber || licenseNumber)', () => {
        expect(U._summarizeCCBLookup({ contractor: { ccbNumber: 'C1', status: 'A', businessName: 'B' } }).number).toBe('C1');
        expect(U._summarizeCCBLookup({ contractor: { licenseNumber: 'L9', status: 'A', businessName: 'B' } }).number).toBe('L9');
    });
    test('multipleResults flag', () => {
        const r = U._summarizeLILookup({ multipleResults: true, results: [{ licenseNumber: 'L', status: 'S', businessName: 'N' }], count: 4 });
        expect(r.multiple).toBe(true);
        expect(r.count).toBe(4);
    });
});

describe('CglUtil._scrubUndefined', () => {
    const U = load();
    test('undefined → null; primitives unchanged', () => {
        expect(U._scrubUndefined(undefined)).toBeNull();
        expect(U._scrubUndefined(5)).toBe(5);
        expect(U._scrubUndefined('x')).toBe('x');
    });
    test('drops undefined values and empty-string keys, recurses arrays/objects', () => {
        const out = U._scrubUndefined({ a: 1, b: undefined, '': 9, nested: { c: undefined, d: 2 }, arr: [1, undefined] });
        expect(out).toEqual({ a: 1, nested: { d: 2 }, arr: [1, null] });
    });
});

describe('CglUtil.getStatusLabel', () => {
    const U = load();
    test('expired / today / tomorrow / future', () => {
        expect(U.getStatusLabel(-3)).toBe('Expired 3 days ago');
        expect(U.getStatusLabel(0)).toBe('Expired today');
        expect(U.getStatusLabel(1)).toBe('Expires tomorrow');
        expect(U.getStatusLabel(12)).toBe('12 days');
    });
});

describe('CglUtil.clientLink', () => {
    const U = load();
    test('no HawkSoft id → bold span, name HTML-escaped', () => {
        const out = U.clientLink({ clientName: 'A & B <co>' });
        expect(out).toContain('font-weight:600');
        expect(out).toContain('A &amp; B &lt;co&gt;');
        expect(out).not.toContain('<a ');
    });
    test('with id (desktop UA) → hs:// deep link', () => {
        const out = U.clientLink({ clientName: 'Acme', clientNumber: '123' });
        expect(out).toContain('href="hs://123"');
        expect(out).toContain('class="cgl-client-link"');
    });
});

describe('CglUtil._typeLabel', () => {
    const U = load();
    test('known codes mapped', () => {
        expect(U._typeLabel('cgl')).toBe('CGL');
        expect(U._typeLabel('im')).toBe('Inland Marine');
        expect(U._typeLabel('bop')).toBe('BOP');
    });
    test('unknown → uppercased input', () => {
        expect(U._typeLabel('xyz')).toBe('XYZ');
    });
});
