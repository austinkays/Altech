/**
 * Toast queueing — verifies that consecutive toast() calls don't clobber
 * each other and that dedup works.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function bootstrapApp() {
    const dom = new JSDOM('<!doctype html><html><body><div id="toast"></div></body></html>', {
        url: 'http://localhost',
        runScripts: 'outside-only',
    });
    // Stub out App + Object.assign target so we can extract the toast method.
    dom.window.App = {};
    dom.window.eval(`Object.assign = function(target, src) {
        Object.keys(src).forEach(k => { target[k] = src[k]; });
        return target;
    };`);
    // Inline app-ui-utils — but it does Object.assign(App, {...}) so we need App globally.
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-ui-utils.js'), 'utf8');
    dom.window.eval(src);
    // After eval, App has toast() bound. Bind `this` to App so calls work like they do in production.
    dom.window.App.toast = dom.window.App.toast.bind(dom.window.App);
    dom.window.App._toastDrain = dom.window.App._toastDrain.bind(dom.window.App);
    return dom;
}

describe('App.toast() — queue + dedupe', () => {
    test('two rapid toasts both display (queue, not clobber)', () => {
        jest.useFakeTimers();
        const dom = bootstrapApp();
        const { App } = dom.window;
        const t = dom.window.document.getElementById('toast');

        App.toast('first', { type: 'success', duration: 100 });
        App.toast('second', { type: 'error', duration: 100 });

        // First toast is showing immediately
        expect(t.innerText).toBe('first');
        expect(t.classList.contains('toast-success')).toBe(true);

        // After first duration + 200ms gap, second should show
        jest.advanceTimersByTime(100);  // first hides
        jest.advanceTimersByTime(200);  // gap → second drains
        expect(t.innerText).toBe('second');
        expect(t.classList.contains('toast-error')).toBe(true);

        jest.useRealTimers();
        dom.window.close();
    });

    test('duplicate consecutive toasts dedupe by default', () => {
        jest.useFakeTimers();
        const dom = bootstrapApp();
        const { App } = dom.window;
        const t = dom.window.document.getElementById('toast');

        App.toast('saved', { type: 'success', duration: 100 });
        App.toast('saved', { type: 'success', duration: 100 });
        App.toast('saved', { type: 'success', duration: 100 });

        expect(t._toastQueue.length).toBe(0); // all but first deduped (first is showing, not in queue)
        expect(t.innerText).toBe('saved');

        jest.useRealTimers();
        dom.window.close();
    });

    test('dedupe: false allows duplicates through', () => {
        jest.useFakeTimers();
        const dom = bootstrapApp();
        const { App } = dom.window;
        const t = dom.window.document.getElementById('toast');

        App.toast('saved', { duration: 100 });
        App.toast('saved', { duration: 100, dedupe: false });

        expect(t._toastQueue.length).toBe(1);
        jest.useRealTimers();
        dom.window.close();
    });

    test('errors get a default 3500ms duration (longer than the 2500ms info default)', () => {
        const dom = bootstrapApp();
        const { App } = dom.window;
        const t = dom.window.document.getElementById('toast');

        App.toast('boom', { type: 'error' });
        // The currently-showing toast's ms isn't directly inspectable, but the
        // queue entry has the parsed ms. Push another to inspect.
        App.toast('next', { type: 'error' });
        expect(t._toastQueue[0].ms).toBe(3500);
        dom.window.close();
    });

    test('returns silently when no #toast element exists', () => {
        const dom = bootstrapApp();
        const { App } = dom.window;
        const t = dom.window.document.getElementById('toast');
        t.remove();
        expect(() => App.toast('orphan')).not.toThrow();
        dom.window.close();
    });
});
