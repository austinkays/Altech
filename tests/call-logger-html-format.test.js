/**
 * CallLogger — plain-text → HawkSoft HTML dialect conversion (Confirm & Push).
 *
 * The sanctioned partner API was VERIFIED in production to transmit the
 * buildHawkSoftNote() dialect and HawkSoft renders it (log Row #234). These
 * tests lock the deterministic converter and the list-view-safe contract
 * (line 1 stays a PLAIN <div>, no spans), plus the safe plain-text fallback.
 *
 * Harness mirrors tests/call-logger-rich-preview.test.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'js', 'call-logger.js'), 'utf8');
const utilsSource = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
const storageKeysSource = fs.readFileSync(path.join(ROOT, 'js', 'storage-keys.js'), 'utf8');
const hawksoftNoteSource = fs.readFileSync(path.join(ROOT, 'js', 'hawksoft-note.js'), 'utf8');

function createDOM() {
    const { JSDOM } = require('jsdom');
    const html = `<!DOCTYPE html><html><body>
      <script>
        window.App = { toast: function(){}, data: {} };
        window.Auth = { apiFetch: function(){ window._apiFetchCalled = true; throw new Error('no network in unit test'); } };
        window.Sync = { schedulePush: function(){} };
      </script>
      <script>${storageKeysSource}</script>
      <script>${utilsSource}</script>
      <script>${hawksoftNoteSource}</script>
      <script>${source}</script>
    </body></html>`;
    const dom = new JSDOM(html, { url: 'http://localhost:8000', runScripts: 'dangerously', pretendToBeVisual: true });
    const store = {};
    Object.defineProperty(dom.window, 'localStorage', {
        value: {
            getItem: k => store[k] || null,
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; },
            clear: () => Object.keys(store).forEach(k => delete store[k]),
        },
        writable: true,
    });
    return dom.window;
}

describe('CallLogger plain→HTML — wiring (source analysis)', () => {
    test('Confirm & Push converts then falls back to plain text', () => {
        expect(source).toMatch(/const noteToSend = _plainToHawkSoftHtml\(_pendingLog\.formattedLog\) \|\| _pendingLog\.formattedLog;/);
        expect(source).toMatch(/formattedLog: noteToSend/);
        // _pendingLog.formattedLog must NOT be reassigned to the HTML
        expect(source).not.toMatch(/_pendingLog\.formattedLog\s*=\s*noteToSend/);
        expect(source).not.toMatch(/_pendingLog\.formattedLog\s*=\s*_plainToHawkSoftHtml/);
    });
    test('builder is the escaping boundary (no manual string HTML build)', () => {
        expect(source).toContain('window.HawkSoftNote.buildHawkSoftNote(_plainToNoteContent(text))');
    });
    test('converters exposed for testing', () => {
        expect(source).toMatch(/_plainToNoteContent,\s*_plainToHawkSoftHtml\s*}/);
    });
});

describe('_plainToNoteContent — structure', () => {
    let C;
    beforeAll(() => { C = createDOM().CallLogger; });

    test('first line → PLAIN paragraph (list-view-safe, no formatting)', () => {
        const ir = C._plainToNoteContent('RE: AJK — called insured re: renewal');
        expect(ir).toEqual([{ type: 'paragraph', runs: [{ type: 'text', text: 'RE: AJK — called insured re: renewal' }] }]);
    });

    test('leading blank lines are skipped before the summary', () => {
        const ir = C._plainToNoteContent('\n\nRE: summary\nbody');
        expect(ir[0]).toEqual({ type: 'paragraph', runs: [{ type: 'text', text: 'RE: summary' }] });
        expect(ir[1]).toEqual({ type: 'paragraph', runs: [{ type: 'text', text: 'body' }] });
    });

    test('Action: label is bolded in a body line', () => {
        const ir = C._plainToNoteContent('RE: x\nAction: follow up Fri');
        expect(ir[1]).toEqual({ type: 'paragraph', runs: [
            { type: 'text', text: 'Action: ', bold: true },
            { type: 'text', text: 'follow up Fri' },
        ] });
    });

    test('consecutive "- " lines collapse into one bullet block', () => {
        const ir = C._plainToNoteContent('RE: x\n- one\n- two\n* three');
        expect(ir[1]).toEqual({ type: 'bullet', items: [
            [{ type: 'text', text: 'one' }],
            [{ type: 'text', text: 'two' }],
            [{ type: 'text', text: 'three' }],
        ] });
    });

    test('numbered lines collapse into one numbered block', () => {
        const ir = C._plainToNoteContent('RE: x\n1. first\n2) second');
        expect(ir[1]).toEqual({ type: 'numbered', items: [
            [{ type: 'text', text: 'first' }],
            [{ type: 'text', text: 'second' }],
        ] });
    });

    test('blank body line → break, and flushes an open list', () => {
        const ir = C._plainToNoteContent('RE: x\n- a\n\nplain tail');
        expect(ir).toEqual([
            { type: 'paragraph', runs: [{ type: 'text', text: 'RE: x' }] },
            { type: 'bullet', items: [[{ type: 'text', text: 'a' }]] },
            { type: 'break' },
            { type: 'paragraph', runs: [{ type: 'text', text: 'plain tail' }] },
        ]);
    });

    test('empty / whitespace input → empty IR', () => {
        expect(C._plainToNoteContent('')).toEqual([]);
        expect(C._plainToNoteContent('   \n  ')).toEqual([]);
        expect(C._plainToNoteContent(null)).toEqual([]);
    });
});

describe('_plainToHawkSoftHtml — output + safety', () => {
    let w, C;
    beforeAll(() => { w = createDOM(); C = w.CallLogger; });

    test('line 1 is a clean plain <div> — no spans (collapsed-list-safe)', () => {
        const html = C._plainToHawkSoftHtml('RE: AJK — payment received\nAction: none');
        const firstDiv = html.slice(0, html.indexOf('</div>') + 6);
        expect(firstDiv).toBe('<div>RE: AJK — payment received</div>');
        expect(firstDiv).not.toContain('<span');
    });

    test('realistic log → expected HawkSoft dialect', () => {
        const html = C._plainToHawkSoftHtml(
            'RE: AJK — coverage Q on 2022 CR-V\nQuoted options to insured\n- raise comp ded\n- add rental\nAction: send revised dec'
        );
        expect(html).toBe(
            '<div>RE: AJK — coverage Q on 2022 CR-V</div>' +
            '<div>Quoted options to insured</div>' +
            '<ul><li>raise comp ded</li><li>add rental</li></ul>' +
            '<div><span style="font-weight: bold;">Action: </span>send revised dec</div>'
        );
    });

    test('text is escaped (XSS boundary via buildHawkSoftNote)', () => {
        const html = C._plainToHawkSoftHtml('RE: ok\nweird <b>x</b> & "q" </span><script>alert(1)</script>');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<b>x</b>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&amp;');
    });

    test('empty/blank → null (caller falls back to plain text)', () => {
        expect(C._plainToHawkSoftHtml('')).toBeNull();
        expect(C._plainToHawkSoftHtml('   ')).toBeNull();
    });

    test('builder missing → null (safe fallback, never throws)', () => {
        const saved = w.HawkSoftNote;
        try {
            w.HawkSoftNote = undefined;
            expect(C._plainToHawkSoftHtml('RE: x\nbody')).toBeNull();
        } finally {
            w.HawkSoftNote = saved;
        }
    });

    test('deterministic — same input, same output', () => {
        const t = 'RE: a\n1. x\n2. y\nAction: z';
        expect(C._plainToHawkSoftHtml(t)).toBe(C._plainToHawkSoftHtml(t));
    });
});
