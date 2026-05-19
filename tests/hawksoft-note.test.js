/**
 * hawksoft-note.js — unit tests for the pure HawkSoft note builder + API
 * error type. The module's only dependency is the global `Utils`
 * (escapeHTML/escapeAttr), so the harness injects faithful Utils stubs
 * (escapeHTML delegates to a real JSDOM document so escaping fidelity is
 * exercised for real) and evals the module, mirroring tests/cgl-utils.test.js.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'hawksoft-note.js'), 'utf8');

function load() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost/', runScripts: 'outside-only',
    });
    const doc = dom.window.document;
    // Faithful mirrors of js/utils.js: escapeHTML via DOM serializer,
    // escapeAttr escaping & < > " '.
    dom.window.Utils = {
        escapeHTML: (s) => {
            if (s == null) return '';
            const div = doc.createElement('div');
            div.textContent = s;
            return div.innerHTML;
        },
        escapeAttr: (s) => {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },
    };
    dom.window.eval(SRC);
    return dom.window.HawkSoftNote;
}

const H = load();
const B = H.buildHawkSoftNote;

// Builders
const t = (text, o = {}) => ({ type: 'text', text, ...o });
const lnk = (text, href) => ({ type: 'link', text, href });
const p = (...runs) => B([{ type: 'paragraph', runs }]);

describe('buildHawkSoftNote — degenerate inputs', () => {
    test('undefined → ""', () => expect(B(undefined)).toBe(''));
    test('null → ""', () => expect(B(null)).toBe(''));
    test('non-array object → ""', () => expect(B({})).toBe(''));
    test('string → ""', () => expect(B('paragraph')).toBe(''));
    test('empty array → ""', () => expect(B([])).toBe(''));
    test('array of junk blocks → ""', () =>
        expect(B([null, undefined, 42, 'x', {}])).toBe(''));
});

describe('buildHawkSoftNote — paragraphs', () => {
    test('single plain text run', () => expect(p(t('hello'))).toBe('<div>hello</div>'));
    test('empty runs array → <div></div>', () =>
        expect(B([{ type: 'paragraph', runs: [] }])).toBe('<div></div>'));
    test('missing runs key → <div></div>', () =>
        expect(B([{ type: 'paragraph' }])).toBe('<div></div>'));
    test('multiple runs concatenate', () =>
        expect(p(t('a'), t('b'), t('c'))).toBe('<div>abc</div>'));
    test('two paragraph blocks, no separator', () =>
        expect(B([
            { type: 'paragraph', runs: [t('a')] },
            { type: 'paragraph', runs: [t('b')] },
        ])).toBe('<div>a</div><div>b</div>'));
});

describe('buildHawkSoftNote — single formatting flags', () => {
    test('bold', () =>
        expect(p(t('x', { bold: true }))).toBe('<div><span style="font-weight: bold;">x</span></div>'));
    test('italic', () =>
        expect(p(t('x', { italic: true }))).toBe('<div><span style="font-style: italic;">x</span></div>'));
    test('underline', () =>
        expect(p(t('x', { underline: true }))).toBe('<div><span style="text-decoration-line: underline;">x</span></div>'));
    test('color', () =>
        expect(p(t('x', { color: [12, 34, 56] }))).toBe('<div><span style="color: rgb(12, 34, 56);">x</span></div>'));
    test('bold:false → bare text, no span', () =>
        expect(p(t('x', { bold: false }))).toBe('<div>x</div>'));
    test('flag set but empty text → empty span', () =>
        expect(p(t('', { bold: true }))).toBe('<div><span style="font-weight: bold;"></span></div>'));
});

describe('buildHawkSoftNote — combined formatting (single span, fixed order)', () => {
    test('bold + italic', () =>
        expect(p(t('x', { bold: true, italic: true })))
            .toBe('<div><span style="font-weight: bold; font-style: italic;">x</span></div>'));
    const allFour = '<div><span style="font-weight: bold; font-style: italic; text-decoration-line: underline; color: rgb(1, 2, 3);">x</span></div>';
    test('bold + italic + underline + color', () =>
        expect(p(t('x', { bold: true, italic: true, underline: true, color: [1, 2, 3] }))).toBe(allFour));
    test('property order is independent of input key order', () =>
        expect(p({ type: 'text', color: [1, 2, 3], underline: true, italic: true, text: 'x', bold: true })).toBe(allFour));
});

describe('buildHawkSoftNote — color validation/clamping', () => {
    test('round then clamp [255.9,-10,300] → rgb(255, 0, 255)', () =>
        expect(p(t('x', { color: [255.9, -10, 300] }))).toBe('<div><span style="color: rgb(255, 0, 255);">x</span></div>'));
    test('[0,0,0]', () =>
        expect(p(t('x', { color: [0, 0, 0] }))).toBe('<div><span style="color: rgb(0, 0, 0);">x</span></div>'));
    test('numeric strings coerced', () =>
        expect(p(t('x', { color: ['255', '0', '0'] }))).toBe('<div><span style="color: rgb(255, 0, 0);">x</span></div>'));
    test('NaN component drops color, keeps other flags', () =>
        expect(p(t('x', { bold: true, color: [NaN, 0, 0] }))).toBe('<div><span style="font-weight: bold;">x</span></div>'));
    test('Infinity component drops color', () =>
        expect(p(t('x', { color: [Infinity, 0, 0] }))).toBe('<div>x</div>'));
    test('length-2 array → color dropped', () =>
        expect(p(t('x', { color: [1, 2] }))).toBe('<div>x</div>'));
    test('non-array color → dropped', () =>
        expect(p(t('x', { color: 'red' }))).toBe('<div>x</div>'));
    test('length-4 array → dropped', () =>
        expect(p(t('x', { color: [1, 2, 3, 4] }))).toBe('<div>x</div>'));
});

describe('buildHawkSoftNote — links', () => {
    test('https accepted', () =>
        expect(p(lnk('Site', 'https://example.com')))
            .toBe('<div><a target="_blank" href="https://example.com">Site</a></div>'));
    test('http accepted', () =>
        expect(p(lnk('x', 'http://x.com'))).toBe('<div><a target="_blank" href="http://x.com">x</a></div>'));
    test('mailto accepted', () =>
        expect(p(lnk('mail', 'mailto:a@b.com'))).toBe('<div><a target="_blank" href="mailto:a@b.com">mail</a></div>'));
    test('javascript: → degraded to inert text', () => {
        const out = p(lnk('Click', 'javascript:alert(1)'));
        expect(out).toBe('<div>Click</div>');
        expect(out).not.toContain('<a');
        expect(out).not.toContain('javascript:');
    });
    test('mixed-case JavaScript: rejected', () =>
        expect(p(lnk('c', 'JavaScript:alert(1)'))).toBe('<div>c</div>'));
    test('tab-obfuscated java\\tscript: rejected', () =>
        expect(p(lnk('c', 'java\tscript:alert(1)'))).toBe('<div>c</div>'));
    test('data: URL rejected, payload escaped as text', () => {
        const out = p(lnk('safe', 'data:text/html,<script>'));
        expect(out).toBe('<div>safe</div>');
        expect(out).not.toContain('<script>');
    });
    test('vbscript: rejected', () =>
        expect(p(lnk('v', 'vbscript:msgbox'))).toBe('<div>v</div>'));
    test('relative path rejected (no scheme)', () =>
        expect(p(lnk('rel', '/path/here'))).toBe('<div>rel</div>'));
    test('scheme-less host rejected', () =>
        expect(p(lnk('w', 'www.x.com'))).toBe('<div>w</div>'));
    test('missing href → plain text', () =>
        expect(p({ type: 'link', text: 'nohref' })).toBe('<div>nohref</div>'));
    test('empty text → URL becomes the visible label', () =>
        expect(p(lnk('', 'https://x.com')))
            .toBe('<div><a target="_blank" href="https://x.com">https://x.com</a></div>'));
    test('href attribute is escaped (no breakout)', () => {
        const out = p(lnk('L', 'https://x.com/?a="><b'));
        expect(out).toBe('<div><a target="_blank" href="https://x.com/?a=&quot;&gt;&lt;b">L</a></div>');
        expect(out).not.toContain('"><b');
    });
    test('link label HTML is escaped', () =>
        expect(p(lnk('<b>hi</b>', 'https://x.com')))
            .toBe('<div><a target="_blank" href="https://x.com">&lt;b&gt;hi&lt;/b&gt;</a></div>'));
});

describe('buildHawkSoftNote — escaping (XSS)', () => {
    test('ampersand/angle brackets escaped; quotes safe in text', () =>
        expect(p(t('A & B < C > D "q" \'a\''))).toBe('<div>A &amp; B &lt; C &gt; D "q" \'a\'</div>'));
    test('</span><script> injection is neutralized inside a styled span', () => {
        const out = p(t('</span><script>alert(1)</script>', { bold: true }));
        expect(out).toBe('<div><span style="font-weight: bold;">&lt;/span&gt;&lt;script&gt;alert(1)&lt;/script&gt;</span></div>');
        expect(out).not.toContain('<script>');
        expect(out).not.toContain('</span><script');
    });
    test('emoji / multibyte preserved', () =>
        expect(p(t('café 😀 — ✓'))).toBe('<div>café 😀 — ✓</div>'));
    test('non-string text coerces to empty', () => {
        expect(p(t(null))).toBe('<div></div>');
        expect(p(t(42))).toBe('<div></div>');
        expect(p(t({}))).toBe('<div></div>');
    });
});

describe('buildHawkSoftNote — lists', () => {
    test('bullet with two items', () =>
        expect(B([{ type: 'bullet', items: [[t('a')], [t('b')]] }]))
            .toBe('<ul><li>a</li><li>b</li></ul>'));
    test('numbered with two items', () =>
        expect(B([{ type: 'numbered', items: [[t('1')], [t('2')]] }]))
            .toBe('<ol><li>1</li><li>2</li></ol>'));
    test('empty items → ""', () =>
        expect(B([{ type: 'bullet', items: [] }])).toBe(''));
    test('missing items → ""', () =>
        expect(B([{ type: 'numbered' }])).toBe(''));
    test('formatted run inside a list item', () =>
        expect(B([{ type: 'bullet', items: [[t('x', { bold: true })]] }]))
            .toBe('<ul><li><span style="font-weight: bold;">x</span></li></ul>'));
    test('non-array item preserves cardinality as empty <li>', () =>
        expect(B([{ type: 'bullet', items: ['nope', [t('b')]] }]))
            .toBe('<ul><li></li><li>b</li></ul>'));
    test('multiple runs in one item', () =>
        expect(B([{ type: 'numbered', items: [[t('a'), t('b')]] }]))
            .toBe('<ol><li>ab</li></ol>'));
});

describe('buildHawkSoftNote — break & mixed document', () => {
    test('break block', () => expect(B([{ type: 'break' }])).toBe('<div><br></div>'));
    test('realistic mixed document (golden)', () => {
        const out = B([
            { type: 'paragraph', runs: [t('Hello '), t('World', { bold: true })] },
            { type: 'break' },
            { type: 'bullet', items: [[t('one')], [t('two')]] },
            { type: 'numbered', items: [[lnk('site', 'https://a.com')]] },
        ]);
        expect(out).toBe(
            '<div>Hello <span style="font-weight: bold;">World</span></div>' +
            '<div><br></div>' +
            '<ul><li>one</li><li>two</li></ul>' +
            '<ol><li><a target="_blank" href="https://a.com">site</a></li></ol>'
        );
    });
    test('unknown block type is skipped, neighbors intact', () =>
        expect(B([
            { type: 'paragraph', runs: [t('a')] },
            { type: 'quote', runs: [t('drop me')] },
            { type: 'paragraph', runs: [t('b')] },
        ])).toBe('<div>a</div><div>b</div>'));
    test('unknown run type is skipped, sibling runs intact', () =>
        expect(p(t('a'), { type: 'image', src: 'x' }, t('b'))).toBe('<div>ab</div>'));
    test('run with no type is skipped (no text fall-through)', () =>
        expect(p({ text: 'leak?' }, t('ok'))).toBe('<div>ok</div>'));
});

describe('HawkSoftAPIError', () => {
    const { HawkSoftAPIError } = H;
    test('shape: name, status, body, message, stack', () => {
        const e = new HawkSoftAPIError(404, { detail: 'gone' });
        expect(e).toBeInstanceOf(HawkSoftAPIError);
        expect(e.name).toBe('HawkSoftAPIError');
        expect(e.status).toBe(404);
        expect(e.body).toEqual({ detail: 'gone' });
        expect(e.message).toContain('404');
        expect(typeof e.stack).toBe('string');
    });
    test('401 → auth error only', () => {
        const e = new HawkSoftAPIError(401, '');
        expect(e.isAuthError).toBe(true);
        expect(e.isNotFound).toBe(false);
        expect(e.isServerError).toBe(false);
    });
    test('403 → auth error only', () => {
        const e = new HawkSoftAPIError(403, '');
        expect(e.isAuthError).toBe(true);
        expect(e.isNotFound).toBe(false);
        expect(e.isServerError).toBe(false);
    });
    test('404 → not found only', () => {
        const e = new HawkSoftAPIError(404, '');
        expect(e.isNotFound).toBe(true);
        expect(e.isAuthError).toBe(false);
        expect(e.isServerError).toBe(false);
    });
    test.each([500, 502, 503, 504])('%i → server error', (code) => {
        const e = new HawkSoftAPIError(code, '');
        expect(e.isServerError).toBe(true);
        expect(e.isAuthError).toBe(false);
        expect(e.isNotFound).toBe(false);
    });
    test.each([200, 400, 418, 499])('%i → no category', (code) => {
        const e = new HawkSoftAPIError(code, '');
        expect(e.isAuthError).toBe(false);
        expect(e.isNotFound).toBe(false);
        expect(e.isServerError).toBe(false);
    });
    test('non-numeric status → all categories false (guarded)', () => {
        for (const bad of ['500', undefined, null, NaN]) {
            const e = new HawkSoftAPIError(bad, '');
            expect(e.isAuthError).toBe(false);
            expect(e.isNotFound).toBe(false);
            expect(e.isServerError).toBe(false);
        }
    });
    test('body stored verbatim (object or string)', () => {
        expect(new HawkSoftAPIError(500, 'raw text').body).toBe('raw text');
        const obj = { a: 1 };
        expect(new HawkSoftAPIError(500, obj).body).toBe(obj);
    });
});
