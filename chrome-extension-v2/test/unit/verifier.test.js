/**
 * Altech EZLynx V2 — Verifier test suite
 */
const { verifyNgValid } = require('../../src/content/verifier/ng-valid');
const { verifyValueMatches } = require('../../src/content/verifier/value-matches');
const { getErrorText } = require('../../src/content/verifier/error-text');

afterEach(() => { document.body.innerHTML = ''; });

function makeInput(classes, value) {
    const el = document.createElement('input');
    el.type = 'text';
    if (Array.isArray(classes)) classes.forEach((c) => el.classList.add(c));
    if (value != null) el.value = value;
    document.body.appendChild(el);
    return el;
}

describe('verifyNgValid', () => {
    test('passes when ng-valid is present and ng-invalid absent', () => {
        const el = makeInput(['ng-valid', 'ng-touched', 'ng-dirty']);
        const r = verifyNgValid(el);
        expect(r.ok).toBe(true);
    });

    test('fails when ng-invalid is present', () => {
        const el = makeInput(['ng-invalid']);
        expect(verifyNgValid(el).ok).toBe(false);
        expect(verifyNgValid(el).reason).toBe('ng-invalid');
    });

    test('fails when neither valid nor invalid is present', () => {
        const el = makeInput([]);
        expect(verifyNgValid(el).ok).toBe(false);
    });

    test('mat-error text overrides ng-valid (server-side validation)', () => {
        const form = document.createElement('mat-form-field');
        const el = document.createElement('input');
        el.classList.add('ng-valid');
        const err = document.createElement('mat-error');
        err.textContent = 'Must be unique';
        form.appendChild(el);
        form.appendChild(err);
        document.body.appendChild(form);
        const r = verifyNgValid(el);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('mat-error');
        expect(r.errorText).toBe('Must be unique');
    });

    test('missing element returns failure', () => {
        expect(verifyNgValid(null).ok).toBe(false);
    });
});

describe('verifyValueMatches', () => {
    test('passes when DOM value equals expected', () => {
        const el = makeInput([], '7025551234');
        expect(verifyValueMatches(el, '7025551234').ok).toBe(true);
    });

    test('fails on mismatch', () => {
        const el = makeInput([], '702555');
        const r = verifyValueMatches(el, '7025551234');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('value-mismatch');
        expect(r.actual).toBe('702555');
    });

    test('normalize function applies before comparison', () => {
        const el = makeInput([], '(702) 555-1234');
        const r = verifyValueMatches(el, '7025551234', (s) => s.replace(/\D+/g, ''));
        expect(r.ok).toBe(true);
    });
});

describe('getErrorText', () => {
    test('returns null when no mat-error exists nearby', () => {
        const el = makeInput(['ng-valid']);
        expect(getErrorText(el)).toBeNull();
    });

    test('returns joined text from all mat-errors in parent form field', () => {
        const form = document.createElement('mat-form-field');
        const el = document.createElement('input');
        form.appendChild(el);
        const e1 = document.createElement('mat-error'); e1.textContent = 'Required';
        const e2 = document.createElement('mat-error'); e2.textContent = 'Too long';
        form.appendChild(e1); form.appendChild(e2);
        document.body.appendChild(form);
        expect(getErrorText(el)).toContain('Required');
        expect(getErrorText(el)).toContain('Too long');
    });
});
