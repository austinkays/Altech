/**
 * Altech EZLynx V2 — mat-select pickOption test suite
 *
 * The full fillMatSelect requires a live CDK overlay which jsdom can't
 * simulate. We test the pure pickOption matching logic instead, which is
 * where the exact/case-insensitive/dice fallback cascade lives.
 */
const { pickOption } = require('../../src/content/primitives/mat-select');
const { fillMatToggle, coerce } = require('../../src/content/primitives/mat-toggle');
const { fillMatRadio } = require('../../src/content/primitives/mat-radio');

describe('mat-select.pickOption', () => {
    const genderOptions = ['Male', 'Female'];

    test('exact match wins', () => {
        expect(pickOption('Male', genderOptions)).toBe(0);
        expect(pickOption('Female', genderOptions)).toBe(1);
    });

    test('abbreviation is expanded before matching', () => {
        expect(pickOption('M', genderOptions)).toBe(0);
        expect(pickOption('F', genderOptions)).toBe(1);
    });

    test('case-insensitive exact is second priority', () => {
        expect(pickOption('male', genderOptions)).toBe(0);
        expect(pickOption('MALE', genderOptions)).toBe(0);
    });

    test('dice fallback fires when neither exact path matches', () => {
        // Edit distance 1, similarity > 0.7 for strings of this length.
        const options = ['Retired', 'Retirement Planner', 'Student'];
        expect(pickOption('Retiree', options)).toBe(0);
    });

    test('returns -1 when no candidate clears threshold', () => {
        expect(pickOption('Astronaut', ['Male', 'Female'])).toBe(-1);
    });

    test('empty target returns -1', () => {
        expect(pickOption('', genderOptions)).toBe(-1);
        expect(pickOption(null, genderOptions)).toBe(-1);
    });

    test('empty options return -1', () => {
        expect(pickOption('Male', [])).toBe(-1);
    });

    test('skipAbbrev disables abbreviation expansion', () => {
        // "M" would normally expand to Male, but we disable it — now M
        // doesn't match 'Male' exactly and dice < 0.7 for such a short string.
        expect(pickOption('M', genderOptions, { skipAbbrev: true })).toBe(-1);
    });
});

describe('mat-toggle.coerce', () => {
    test('true-like values → true', () => {
        expect(coerce(true)).toBe(true);
        expect(coerce('true')).toBe(true);
        expect(coerce('Yes')).toBe(true);
        expect(coerce('Y')).toBe(true);
        expect(coerce('1')).toBe(true);
        expect(coerce('on')).toBe(true);
    });

    test('false-like values → false', () => {
        expect(coerce(false)).toBe(false);
        expect(coerce('false')).toBe(false);
        expect(coerce('no')).toBe(false);
        expect(coerce('')).toBe(false);
        expect(coerce(null)).toBe(false);
        expect(coerce(undefined)).toBe(false);
    });
});

describe('fillMatToggle', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    function makeToggle(checked) {
        const host = document.createElement('mat-slide-toggle');
        host.className = 'mat-mdc-slide-toggle' + (checked ? ' mat-mdc-slide-toggle-checked' : '');
        const btn = document.createElement('button');
        btn.setAttribute('role', 'switch');
        host.appendChild(btn);
        document.body.appendChild(host);
        return { host, btn };
    }

    test('clicks when current state differs from target', () => {
        const { host, btn } = makeToggle(false);
        const clicks = [];
        btn.addEventListener('click', () => clicks.push(1));
        const r = fillMatToggle(host, true);
        expect(r.ok).toBe(true);
        expect(r.changed).toBe(true);
        expect(clicks.length).toBe(1);
    });

    test('does not click when already in target state (idempotency)', () => {
        const { host, btn } = makeToggle(true);
        const clicks = [];
        btn.addEventListener('click', () => clicks.push(1));
        const r = fillMatToggle(host, true);
        expect(r.ok).toBe(true);
        expect(r.changed).toBe(false);
        expect(clicks.length).toBe(0);
    });

    test('walks up from a child element to find the toggle host', () => {
        const { host, btn } = makeToggle(false);
        const inner = document.createElement('span');
        host.appendChild(inner);
        const r = fillMatToggle(inner, true);
        expect(r.ok).toBe(true);
        expect(r.changed).toBe(true);
    });
});

describe('fillMatRadio', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    function makeGroup(labels) {
        const group = document.createElement('mat-radio-group');
        labels.forEach((label) => {
            const btn = document.createElement('mat-radio-button');
            btn.textContent = label;
            group.appendChild(btn);
        });
        document.body.appendChild(group);
        return group;
    }

    test('clicks the matching radio by label text', () => {
        const group = makeGroup(['Option A', 'Option B', 'Option C']);
        const clicks = [];
        group.querySelectorAll('mat-radio-button').forEach((b, i) =>
            b.addEventListener('click', () => clicks.push(i)));
        const r = fillMatRadio(group, 'Option B');
        expect(r.ok).toBe(true);
        expect(clicks).toEqual([1]);
    });

    test('is case-insensitive', () => {
        const group = makeGroup(['Yes', 'No']);
        const r = fillMatRadio(group, 'yes');
        expect(r.ok).toBe(true);
        expect(r.picked).toBe('Yes');
    });

    test('falls back to contains match', () => {
        const group = makeGroup(['Less than 1 year', 'More than 5 years']);
        const r = fillMatRadio(group, 'less than 1');
        expect(r.ok).toBe(true);
        expect(r.picked).toBe('Less than 1 year');
    });

    test('returns { ok: false } when nothing matches', () => {
        const group = makeGroup(['Yes', 'No']);
        const r = fillMatRadio(group, 'Maybe');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('no-match');
    });
});
