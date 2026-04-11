/**
 * Altech EZLynx V2 — Text primitive test suite
 *
 * The test setup polyfills document.execCommand so 'insertText' and 'delete'
 * behave as they would in a real browser from the DOM's perspective. What
 * this suite cannot verify is the "reaches Angular FormControl" half of the
 * V2 contract — that requires a live EZLynx page and is covered by the
 * manual validation protocol (§12.3 of the plan).
 */
const { fillText } = require('../../src/content/primitives/text');

function makeInput(initialValue) {
    const el = document.createElement('input');
    el.type = 'text';
    if (initialValue != null) el.value = initialValue;
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('fillText', () => {
    test('writes a value into an empty input', () => {
        const el = makeInput('');
        const r = fillText(el, 'John');
        expect(r.ok).toBe(true);
        expect(el.value).toBe('John');
    });

    test('replaces existing value (delete → insertText)', () => {
        const el = makeInput('Old Value');
        const r = fillText(el, 'New');
        expect(r.ok).toBe(true);
        expect(el.value).toBe('New');
    });

    test('dispatches an input event during fill', () => {
        const el = makeInput('');
        const events = [];
        el.addEventListener('input', (e) => events.push(e.type));
        fillText(el, 'Hello');
        // Polyfill dispatches one input event per execCommand call (delete + insertText).
        expect(events.length).toBeGreaterThanOrEqual(1);
    });

    test('dispatches a blur event after insertText', () => {
        const el = makeInput('');
        let blurred = false;
        el.addEventListener('blur', () => { blurred = true; });
        fillText(el, 'x');
        expect(blurred).toBe(true);
    });

    test('returns { ok: false, reason: "disabled" } on a disabled element', () => {
        const el = makeInput('');
        el.disabled = true;
        const r = fillText(el, 'x');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('disabled');
    });

    test('returns { ok: false, reason: "readonly" } on a readonly element', () => {
        const el = makeInput('');
        el.readOnly = true;
        const r = fillText(el, 'x');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('readonly');
    });

    test('returns { ok: false, reason: "missing-element" } when passed null', () => {
        const r = fillText(null, 'x');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('missing-element');
    });

    test('coerces null value to empty string', () => {
        const el = makeInput('prev');
        const r = fillText(el, null);
        expect(r.ok).toBe(true);
        expect(el.value).toBe('');
    });
});
