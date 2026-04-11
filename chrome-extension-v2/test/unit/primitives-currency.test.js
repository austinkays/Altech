/**
 * Altech EZLynx V2 — Currency primitive test suite
 */
const { fillCurrency } = require('../../src/content/primitives/currency');
const { fillNumber } = require('../../src/content/primitives/number');
const { fillDate, normalize } = require('../../src/content/primitives/date');

function makeInput(initial) {
    const el = document.createElement('input');
    el.type = 'text';
    if (initial != null) el.value = initial;
    document.body.appendChild(el);
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('fillCurrency', () => {
    test('strips $ and commas before filling', () => {
        const el = makeInput('');
        fillCurrency(el, '$1,234.56');
        expect(el.value).toBe('1234.56');
    });

    test('handles integer values', () => {
        const el = makeInput('');
        fillCurrency(el, 500000);
        expect(el.value).toBe('500000');
    });

    test('empty input → empty string', () => {
        const el = makeInput('prev');
        fillCurrency(el, null);
        expect(el.value).toBe('');
    });
});

describe('fillNumber', () => {
    test('strips non-numeric characters', () => {
        const el = makeInput('');
        fillNumber(el, '42 miles');
        expect(el.value).toBe('42');
    });

    test('preserves negative sign', () => {
        const el = makeInput('');
        fillNumber(el, '-5.5');
        expect(el.value).toBe('-5.5');
    });

    test('collapses multiple decimal points', () => {
        const el = makeInput('');
        fillNumber(el, '1.2.3');
        expect(el.value).toBe('1.23');
    });
});

describe('fillDate / normalize', () => {
    test('normalizes ISO to US', () => {
        expect(normalize('2024-03-15')).toBe('03/15/2024');
    });

    test('zero-pads US shorthand', () => {
        expect(normalize('3/5/2024')).toBe('03/05/2024');
    });

    test('expands 2-digit year', () => {
        expect(normalize('3/5/24')).toBe('03/05/2024');
    });

    test('handles Date instance', () => {
        const d = new Date(Date.UTC(2024, 2, 15)); // March 15, 2024 UTC
        // Use local-timezone computation from the function itself to avoid
        // flaky timezone assertions. Just assert shape.
        expect(normalize(d)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    test('fillDate writes normalized value', () => {
        const el = makeInput('');
        fillDate(el, '2024-03-15');
        expect(el.value).toBe('03/15/2024');
    });
});
