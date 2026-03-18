'use strict';

/**
 * tests/utils.test.js
 *
 * Unit tests for all four window.Utils functions:
 *   escapeHTML, escapeAttr, tryParseLS, debounce
 *
 * Architecture: hybrid eval approach.
 * - js/utils.js is read with fs.readFileSync and evaluated via eval() in the
 *   Node.js global context (not inside a JSDOM runScripts environment).
 * - global.document is set to a real JSDOM document so escapeHTML's
 *   document.createElement('div') works correctly.
 * - global.window is set to {} so utils.js can assign window.Utils.
 * - setTimeout inside debounce resolves to the Node.js global, which
 *   jest.useFakeTimers() patches reliably (would NOT work inside JSDOM's own
 *   timer context).
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const utilsSource = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');

let Utils;
let lsStore;

beforeAll(() => {
    // Minimal JSDOM — only needed for document.createElement in escapeHTML.
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost',
    });
    global.document = dom.window.document;
    global.window = {};

    // Lightweight localStorage mock — tryParseLS reads from this.
    lsStore = {};
    global.localStorage = {
        getItem:    (key) => (Object.prototype.hasOwnProperty.call(lsStore, key) ? lsStore[key] : null),
        setItem:    (key, val) => { lsStore[key] = String(val); },
        removeItem: (key) => { delete lsStore[key]; },
        clear:      () => { Object.keys(lsStore).forEach(k => delete lsStore[k]); },
    };

    // eslint-disable-next-line no-eval
    eval(utilsSource);
    Utils = global.window.Utils;
});

beforeEach(() => {
    // Wipe localStorage between every test so tests are fully isolated.
    Object.keys(lsStore).forEach(k => delete lsStore[k]);
});


// ─────────────────────────────────────────────────────────────────────────────
// Utils.escapeHTML — 10 tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Utils.escapeHTML', () => {
    test('is exposed as a function', () => {
        expect(typeof Utils.escapeHTML).toBe('function');
    });

    test('returns empty string for null', () => {
        expect(Utils.escapeHTML(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
        expect(Utils.escapeHTML(undefined)).toBe('');
    });

    test('returns plain string unchanged when no special chars', () => {
        expect(Utils.escapeHTML('Hello World')).toBe('Hello World');
    });

    test('escapes & to &amp;', () => {
        expect(Utils.escapeHTML('AT&T')).toBe('AT&amp;T');
    });

    test('escapes < to &lt;', () => {
        expect(Utils.escapeHTML('a < b')).toBe('a &lt; b');
    });

    test('escapes > to &gt;', () => {
        expect(Utils.escapeHTML('a > b')).toBe('a &gt; b');
    });

    test('escapes multiple special chars in one string', () => {
        expect(Utils.escapeHTML('<b>AT&T</b>')).toBe('&lt;b&gt;AT&amp;T&lt;/b&gt;');
    });

    test('does not escape double quotes — text node safe, use escapeAttr for attributes', () => {
        expect(Utils.escapeHTML('"quoted"')).toBe('"quoted"');
    });

    test('does not escape single quotes — text node safe, use escapeAttr for attributes', () => {
        expect(Utils.escapeHTML("it's fine")).toBe("it's fine");
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// Utils.escapeAttr — 12 tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Utils.escapeAttr', () => {
    test('is exposed as a function', () => {
        expect(typeof Utils.escapeAttr).toBe('function');
    });

    test('returns empty string for null', () => {
        expect(Utils.escapeAttr(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
        expect(Utils.escapeAttr(undefined)).toBe('');
    });

    test('returns plain string unchanged when no special chars', () => {
        expect(Utils.escapeAttr('Hello World')).toBe('Hello World');
    });

    test('escapes & to &amp;', () => {
        expect(Utils.escapeAttr('a & b')).toBe('a &amp; b');
    });

    test('escapes < to &lt;', () => {
        expect(Utils.escapeAttr('<value')).toBe('&lt;value');
    });

    test('escapes > to &gt;', () => {
        expect(Utils.escapeAttr('value>')).toBe('value&gt;');
    });

    test('escapes " to &quot;', () => {
        expect(Utils.escapeAttr('say "hi"')).toBe('say &quot;hi&quot;');
    });

    test("escapes ' to &#39;", () => {
        expect(Utils.escapeAttr("it's")).toBe("it&#39;s");
    });

    test('escapes all five special chars in one string', () => {
        expect(Utils.escapeAttr(`<a href="x" title='y'>&`)).toBe(
            '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;'
        );
    });

    test('coerces numbers to string before escaping', () => {
        expect(Utils.escapeAttr(42)).toBe('42');
    });

    test('returns empty string for empty string input', () => {
        expect(Utils.escapeAttr('')).toBe('');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// Utils.tryParseLS — 11 tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Utils.tryParseLS', () => {
    test('is exposed as a function', () => {
        expect(typeof Utils.tryParseLS).toBe('function');
    });

    test('returns fallback when key is absent from localStorage', () => {
        expect(Utils.tryParseLS('missing_key', [])).toEqual([]);
    });

    test('returns fallback for invalid JSON', () => {
        lsStore.bad_json = 'not-valid-{json}';
        expect(Utils.tryParseLS('bad_json', 'default')).toBe('default');
    });

    test('returns parsed object for valid JSON object', () => {
        lsStore.obj_key = JSON.stringify({ a: 1, b: 'two' });
        expect(Utils.tryParseLS('obj_key', null)).toEqual({ a: 1, b: 'two' });
    });

    test('returns parsed array for valid JSON array', () => {
        lsStore.arr_key = JSON.stringify([1, 2, 3]);
        expect(Utils.tryParseLS('arr_key', null)).toEqual([1, 2, 3]);
    });

    test('returns parsed number for stored JSON number', () => {
        lsStore.num_key = '7';
        expect(Utils.tryParseLS('num_key', 0)).toBe(7);
    });

    test('returns parsed string for stored JSON string', () => {
        lsStore.str_key = '"hello"';
        expect(Utils.tryParseLS('str_key', '')).toBe('hello');
    });

    test('returns false — falsy stored value is not overridden by fallback (uses ?? not ||)', () => {
        lsStore.bool_key = 'false';
        expect(Utils.tryParseLS('bool_key', true)).toBe(false);
    });

    test('returns 0 — falsy stored value is not overridden by fallback (uses ?? not ||)', () => {
        lsStore.zero_key = '0';
        expect(Utils.tryParseLS('zero_key', 99)).toBe(0);
    });

    test('returns empty string — falsy stored value is not overridden by fallback (uses ?? not ||)', () => {
        lsStore.empty_str_key = '""';
        expect(Utils.tryParseLS('empty_str_key', 'default')).toBe('');
    });

    test('returns fallback when stored value is JSON null (null ?? fallback)', () => {
        lsStore.null_key = 'null';
        expect(Utils.tryParseLS('null_key', 'fallback')).toBe('fallback');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// Utils.debounce — 8 tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Utils.debounce', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('is exposed as a function', () => {
        expect(typeof Utils.debounce).toBe('function');
    });

    test('does not call fn immediately on first invocation', () => {
        const fn = jest.fn();
        const deb = Utils.debounce(fn, 100);
        deb();
        expect(fn).not.toHaveBeenCalled();
    });

    test('calls fn once after the delay elapses', () => {
        const fn = jest.fn();
        const deb = Utils.debounce(fn, 100);
        deb();
        jest.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('resets the timer on repeated calls within the delay window', () => {
        const fn = jest.fn();
        const deb = Utils.debounce(fn, 100);
        deb();
        jest.advanceTimersByTime(50);
        deb();                          // restart the 100 ms window
        jest.advanceTimersByTime(50);   // only 50 ms since last call — should not fire
        expect(fn).not.toHaveBeenCalled();
        jest.advanceTimersByTime(50);   // now 100 ms since last call — should fire
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('calls fn with the correct arguments', () => {
        const fn = jest.fn();
        const deb = Utils.debounce(fn, 50);
        deb('a', 'b', 3);
        jest.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledWith('a', 'b', 3);
    });

    test('.cancel() prevents the pending call from firing', () => {
        const fn = jest.fn();
        const deb = Utils.debounce(fn, 100);
        deb();
        deb.cancel();
        jest.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });

    test('.cancel() is safe to call when no timer is pending', () => {
        const deb = Utils.debounce(jest.fn(), 100);
        expect(() => deb.cancel()).not.toThrow();
    });

    test('fires again on a new invocation after the delay has already elapsed', () => {
        const fn = jest.fn();
        const deb = Utils.debounce(fn, 100);
        deb();
        jest.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
        deb();
        jest.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
