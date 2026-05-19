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
        expect(source).toMatch(/return\s*\{[^}]*_plainToNoteContent[^}]*_plainToHawkSoftHtml/);
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

describe('_parseEmphasis — markdown ** → bold runs', () => {
    let C;
    beforeAll(() => { C = createDOM().CallLogger; });

    test('paired ** becomes a bold run', () => {
        expect(C._parseEmphasis('a **b** c')).toEqual([
            { type: 'text', text: 'a ' },
            { type: 'text', text: 'b', bold: true },
            { type: 'text', text: ' c' },
        ]);
    });
    test('no markers → single plain run', () => {
        expect(C._parseEmphasis('plain text')).toEqual([{ type: 'text', text: 'plain text' }]);
    });
    test('adjacent emphasis', () => {
        expect(C._parseEmphasis('**a** **b**')).toEqual([
            { type: 'text', text: 'a', bold: true },
            { type: 'text', text: ' ' },
            { type: 'text', text: 'b', bold: true },
        ]);
    });
    test('stray/unpaired ** is stripped (never reaches HawkSoft)', () => {
        expect(C._parseEmphasis('a ** b')).toEqual([{ type: 'text', text: 'a  b' }]);
    });
});

describe('emphasis end-to-end through the builder', () => {
    let C;
    beforeAll(() => { C = createDOM().CallLogger; });

    test('RE: line strips ** and stays a plain span-free <div>', () => {
        const html = C._plainToHawkSoftHtml('RE: **AJK** — payment **$500**\nbody');
        const firstDiv = html.slice(0, html.indexOf('</div>') + 6);
        expect(firstDiv).toBe('<div>RE: AJK — payment $500</div>');
        expect(firstDiv).not.toContain('<span');
        expect(firstDiv).not.toContain('*');
    });
    test('body **term** → bold span', () => {
        const html = C._plainToHawkSoftHtml('RE: x\nQuoted **$500** to **Progressive** today');
        expect(html).toContain('<div>Quoted <span style="font-weight: bold;">$500</span> to <span style="font-weight: bold;">Progressive</span> today</div>');
    });
    test('AI-marked **Action:** is honored (not double-processed)', () => {
        const html = C._plainToHawkSoftHtml('RE: x\n**Action:** call back Fri');
        expect(html).toBe('<div>RE: x</div><div><span style="font-weight: bold;">Action:</span> call back Fri</div>');
    });
    test('legacy plain "Action:" still auto-bolds when AI did not mark it', () => {
        const html = C._plainToHawkSoftHtml('RE: x\nAction: call back Fri');
        expect(html).toContain('<div><span style="font-weight: bold;">Action: </span>call back Fri</div>');
    });
    test('emphasis inside a list item', () => {
        const html = C._plainToHawkSoftHtml('RE: x\n- raise **comp** ded');
        expect(html).toBe('<div>RE: x</div><ul><li>raise <span style="font-weight: bold;">comp</span> ded</li></ul>');
    });
    test('emphasized text is still HTML-escaped (XSS boundary holds)', () => {
        const html = C._plainToHawkSoftHtml('RE: x\n**<b>&</b>** done');
        expect(html).not.toContain('<b>&</b>');
        expect(html).toContain('<span style="font-weight: bold;">&lt;b&gt;&amp;&lt;/b&gt;</span>');
    });
});

describe('_setPreviewView — in-flow rendered preview', () => {
    function dom() {
        const { JSDOM } = require('jsdom');
        const fs = require('fs'), path = require('path');
        const R = path.resolve(__dirname, '..');
        const html = `<!DOCTYPE html><html><body>
          <script>window.App={toast:function(){}};window.Auth={apiFetch:null};window.Sync={schedulePush:function(){}};</script>
          <script>${fs.readFileSync(path.join(R,'js','storage-keys.js'),'utf8')}</script>
          <script>${fs.readFileSync(path.join(R,'js','utils.js'),'utf8')}</script>
          <script>${fs.readFileSync(path.join(R,'js','hawksoft-note.js'),'utf8')}</script>
          <script>${fs.readFileSync(path.join(R,'js','call-logger.js'),'utf8')}</script>
          <div id="clPvToggle"><button class="cl-pv-tab cl-pv-active" data-pv="plain">Plain</button><button class="cl-pv-tab" data-pv="rich">Formatted</button></div>
          <pre id="clPreviewText"></pre>
          <div id="clPreviewRender" style="display:none"></div>
        </body></html>`;
        const d = new JSDOM(html, { url: 'http://localhost', runScripts: 'dangerously' });
        return d.window;
    }
    test('rich renders builder HTML; plain restores the <pre>', () => {
        const w = dom(), doc = w.document;
        doc.getElementById('clPreviewText').textContent = 'RE: x\nQuoted **$500**';
        w.CallLogger._setPreviewView('rich');
        const r = doc.getElementById('clPreviewRender');
        expect(r.style.display).toBe('');
        expect(doc.getElementById('clPreviewText').style.display).toBe('none');
        expect(r.innerHTML).toContain('<span style="font-weight: bold;">$500</span>');
        expect(doc.querySelector('.cl-pv-tab[data-pv="rich"]').classList.contains('cl-pv-active')).toBe(true);
        w.CallLogger._setPreviewView('plain');
        expect(r.style.display).toBe('none');
        expect(doc.getElementById('clPreviewText').style.display).toBe('');
    });
    test('rich is forced to plain while the edit textarea is open', () => {
        const w = dom(), doc = w.document;
        doc.getElementById('clPreviewText').textContent = 'RE: x\nbody';
        const ta = doc.createElement('textarea'); ta.className = 'cl-edit-textarea';
        doc.body.appendChild(ta);
        w.CallLogger._setPreviewView('rich');
        expect(doc.getElementById('clPreviewRender').style.display).toBe('none');
        expect(doc.getElementById('clPreviewText').style.display).toBe('');
    });
});
