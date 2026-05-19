/**
 * CallLogger — Rich-format preview (DRY RUN) tests.
 *
 * Verifies the local buildHawkSoftNote() preview panel is:
 *  - correct (presets render the expected HawkSoft HTML), and
 *  - ISOLATED from the live push path (no apiFetch / _pendingLog / Auth in
 *    the preview code; cannot trigger a HawkSoft push).
 *
 * Harness mirrors tests/call-logger.test.js (JSDOM, dangerously-run inline
 * sources), additionally injecting js/hawksoft-note.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'js', 'call-logger.js'), 'utf8');
const utilsSource = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
const storageKeysSource = fs.readFileSync(path.join(ROOT, 'js', 'storage-keys.js'), 'utf8');
const hawksoftNoteSource = fs.readFileSync(path.join(ROOT, 'js', 'hawksoft-note.js'), 'utf8');
const pluginHtml = fs.readFileSync(path.join(ROOT, 'plugins', 'call-logger.html'), 'utf8');

// ── Isolation guarantees (source analysis) ────────────────────────────

describe('rich preview — isolation from the push path', () => {
    function fnBody(name) {
        const i = source.indexOf('function ' + name + '(');
        expect(i).toBeGreaterThan(-1);
        // crude brace match good enough for these small functions
        let depth = 0, started = false, out = '';
        for (let j = i; j < source.length; j++) {
            const c = source[j];
            out += c;
            if (c === '{') { depth++; started = true; }
            else if (c === '}') { depth--; if (started && depth === 0) break; }
        }
        return out;
    }

    test('_rpBuild exists and is pure (no network/push references)', () => {
        const body = fnBody('_rpBuild');
        expect(body).toContain('JSON.parse');
        expect(body).toContain('HawkSoftNote.buildHawkSoftNote');
        for (const banned of ['apiFetch', '_pendingLog', '_pushToHawkSoft', 'Auth.', '_handleConfirm', 'fetch(']) {
            expect(body).not.toContain(banned);
        }
    });

    test('_initRichPreview wires only clRp* elements, no push triggers', () => {
        const body = fnBody('_initRichPreview');
        expect(body).toContain('clRpPanel');
        expect(body).toContain('_rpBuild');
        for (const banned of ['apiFetch', '_pendingLog', '_pushToHawkSoft', '_handleConfirm', '_handleFormat', 'clConfirmBtn', 'clSubmitBtn']) {
            expect(body).not.toContain(banned);
        }
    });

    test('preview output is rendered only from builder output (sanitization boundary)', () => {
        // renderOut.innerHTML must be assigned res.html (builder output), never raw input.
        expect(source).toMatch(/renderOut\.innerHTML\s*=\s*res\.html/);
        expect(source).not.toMatch(/renderOut\.innerHTML\s*=\s*input\.value/);
    });

    test('public API exposes _rpBuild / RP_PRESETS / _initRichPreview for testing', () => {
        expect(source).toMatch(/return\s*\{[^}]*_rpBuild[^}]*RP_PRESETS/);
    });

    test('plugin HTML carries the DRY RUN panel and prefixed ids', () => {
        expect(pluginHtml).toContain('id="clRpPanel"');
        expect(pluginHtml).toContain('id="clRpInput"');
        expect(pluginHtml).toContain('id="clRpHtml"');
        expect(pluginHtml).toContain('id="clRpRender"');
        expect(pluginHtml).toContain('DRY RUN');
    });
});

// ── Behavioral (JSDOM) ────────────────────────────────────────────────

describe('rich preview — behavior', () => {
    function createDOM() {
        const { JSDOM } = require('jsdom');
        const html = `<!DOCTYPE html><html><body>
          <details id="clRpPanel">
            <summary>preview</summary>
            <div id="clRpPresets">
              <button class="cl-rp-preset" data-preset="bold">b</button>
              <button class="cl-rp-preset" data-preset="list">l</button>
              <button class="cl-rp-preset" data-preset="link">k</button>
              <button class="cl-rp-preset" data-preset="mixed">m</button>
            </div>
            <textarea id="clRpInput"></textarea>
            <button id="clRpGen">gen</button>
            <span id="clRpError"></span>
            <pre id="clRpHtml"></pre>
            <div id="clRpRender"></div>
          </details>
          <script>
            window.App = { toast: function(){}, data: {} };
            window.Auth = { apiFetch: function(){ window._apiFetchCalled = true; throw new Error('preview must not call the API'); } };
            window.Sync = { schedulePush: function(){ window._pushCalled = true; } };
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

    test('_rpBuild renders each preset to expected HawkSoft HTML', () => {
        const w = createDOM();
        const { _rpBuild, RP_PRESETS } = w.CallLogger;

        const bold = _rpBuild(JSON.stringify(RP_PRESETS.bold));
        expect(bold.ok).toBe(true);
        expect(bold.html).toContain('<span style="font-weight: bold;">AUTO-12345</span>');
        expect(bold.html).toContain('<span style="font-style: italic;">received</span>');

        const list = _rpBuild(JSON.stringify(RP_PRESETS.list));
        expect(list.html).toContain('<ul><li>');
        expect(list.html).toContain('<span style="font-weight: bold;">home</span>');

        const link = _rpBuild(JSON.stringify(RP_PRESETS.link));
        expect(link.html).toContain('<a target="_blank" href="https://www.progressive.com/claims/">progressive.com/claims</a>');
        expect(link.html).toContain('color: rgb(192, 0, 0);');

        const mixed = _rpBuild(JSON.stringify(RP_PRESETS.mixed));
        expect(mixed.html).toContain('<div><br></div>');
        expect(mixed.html).toContain('<ol><li>');
        expect(mixed.html).toContain('color: rgb(0, 128, 0);');

        for (const k of Object.keys(RP_PRESETS)) {
            const r = _rpBuild(JSON.stringify(RP_PRESETS[k]));
            expect(r.ok).toBe(true);
            expect(typeof r.html).toBe('string');
            expect(r.html.length).toBeGreaterThan(0);
            expect(r.html).not.toContain('<script');
        }
    });

    test('_rpBuild reports invalid JSON without throwing', () => {
        const w = createDOM();
        const r = w.CallLogger._rpBuild('{not json]');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/Invalid JSON/);
    });

    test('_rpBuild on a non-array yields the builder empty-string contract', () => {
        const w = createDOM();
        const r = w.CallLogger._rpBuild('{}');
        expect(r.ok).toBe(true);
        expect(r.html).toBe('');
    });

    test('_rpBuild degrades a javascript: link to inert text (XSS boundary)', () => {
        const w = createDOM();
        const r = w.CallLogger._rpBuild(JSON.stringify([
            { type: 'paragraph', runs: [{ type: 'link', text: 'x', href: 'javascript:alert(1)' }] },
        ]));
        expect(r.ok).toBe(true);
        expect(r.html).toBe('<div>x</div>');
        expect(r.html).not.toContain('<a');
    });

    test('_initRichPreview prefills, renders on preset click, shows JSON errors — no API calls', () => {
        const w = createDOM();
        w.CallLogger._initRichPreview();
        const doc = w.document;
        const input = doc.getElementById('clRpInput');
        const htmlOut = doc.getElementById('clRpHtml');
        const renderOut = doc.getElementById('clRpRender');
        const errOut = doc.getElementById('clRpError');

        // prefilled with the mixed preset
        expect(input.value.length).toBeGreaterThan(0);
        expect(() => JSON.parse(input.value)).not.toThrow();

        // click the "bold" preset → both outputs populate
        doc.querySelector('.cl-rp-preset[data-preset="bold"]').dispatchEvent(new w.Event('click', { bubbles: true }));
        expect(htmlOut.textContent).toContain('<span style="font-weight: bold;">AUTO-12345</span>');
        expect(renderOut.innerHTML).toContain('<span style="font-weight: bold;">');
        expect(renderOut.querySelector('span')).not.toBeNull();
        expect(errOut.textContent).toBe('');

        // invalid JSON via Generate → error shown, outputs cleared
        input.value = '{bad';
        doc.getElementById('clRpGen').dispatchEvent(new w.Event('click', { bubbles: true }));
        expect(errOut.textContent).toMatch(/Invalid JSON/);
        expect(htmlOut.textContent).toBe('');
        expect(renderOut.innerHTML).toBe('');

        // the preview never reached the network
        expect(w._apiFetchCalled).toBeUndefined();
        expect(w._pushCalled).toBeUndefined();
    });

    test('_initRichPreview is idempotent (guard flag)', () => {
        const w = createDOM();
        w.CallLogger._initRichPreview();
        const panel = w.document.getElementById('clRpPanel');
        expect(panel._clRpWired).toBe(true);
        // second call must not re-prefill / re-wire (no throw, stays wired)
        expect(() => w.CallLogger._initRichPreview()).not.toThrow();
        expect(panel._clRpWired).toBe(true);
    });
});
