/**
 * Altech EZLynx V2 — Page Inventory recon tests
 */
'use strict';

const { runPageInventory } = require('../../src/content/recon/page-inventory');

afterEach(() => { document.body.innerHTML = ''; });

function makeInput(id, opts = {}) {
    const el = document.createElement('input');
    el.type = opts.type || 'text';
    if (id) el.id = id;
    if (opts.disabled) el.disabled = true;
    if (opts.required) el.required = true;
    if (opts.hidden) el.style.display = 'none';
    document.body.appendChild(el);
    return el;
}

describe('runPageInventory — basic field collection', () => {
    test('returns structured object with required shape', () => {
        makeInput('first-name');
        const result = runPageInventory('applicant-details');
        expect(result).toHaveProperty('route', 'applicant-details');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('fields');
        expect(result).toHaveProperty('scopeContainers');
        expect(result).toHaveProperty('cascadesDetected');
    });

    test('counts 3 visible inputs, skips 1 hidden', () => {
        makeInput('field-1');
        makeInput('field-2');
        makeInput('field-3');
        makeInput('field-hidden', { hidden: true });
        const result = runPageInventory('applicant-details');
        // hidden field excluded
        const ids = result.fields.map((f) => f.id);
        expect(ids).toContain('field-1');
        expect(ids).toContain('field-2');
        expect(ids).toContain('field-3');
        expect(ids).not.toContain('field-hidden');
    });

    test('skips hidden inputs (type=hidden)', () => {
        const el = document.createElement('input');
        el.type = 'hidden';
        el.id = 'secret-field';
        document.body.appendChild(el);
        const result = runPageInventory('test');
        const ids = result.fields.map((f) => f.id);
        expect(ids).not.toContain('secret-field');
    });

    test('marks disabled field correctly', () => {
        makeInput('disabled-field', { disabled: true });
        const result = runPageInventory('test');
        const field = result.fields.find((f) => f.id === 'disabled-field');
        expect(field).toBeTruthy();
        expect(field.disabled).toBe(true);
    });

    test('marks required field correctly', () => {
        makeInput('required-field', { required: true });
        const result = runPageInventory('test');
        const field = result.fields.find((f) => f.id === 'required-field');
        expect(field).toBeTruthy();
        expect(field.required).toBe(true);
    });

    test('order is monotonically increasing', () => {
        makeInput('a'); makeInput('b'); makeInput('c');
        const result = runPageInventory('test');
        const orders = result.fields.map((f) => f.order);
        for (let i = 1; i < orders.length; i++) {
            expect(orders[i]).toBeGreaterThan(orders[i - 1]);
        }
    });
});

describe('runPageInventory — label extraction', () => {
    test('extracts label from mat-form-field → mat-label', () => {
        document.body.innerHTML = `
            <mat-form-field>
                <mat-label>First Name</mat-label>
                <input id="fn-input" type="text">
            </mat-form-field>
        `;
        const result = runPageInventory('test');
        const field = result.fields.find((f) => f.id === 'fn-input');
        expect(field).toBeTruthy();
        expect(field.label).toBe('First Name');
    });

    test('falls back to aria-label when no mat-label', () => {
        const el = document.createElement('input');
        el.type = 'text';
        el.id = 'aria-input';
        el.setAttribute('aria-label', 'My Field');
        document.body.appendChild(el);
        const result = runPageInventory('test');
        const field = result.fields.find((f) => f.id === 'aria-input');
        expect(field.label).toBe('My Field');
    });
});

describe('runPageInventory — scope containers', () => {
    test('reports additional-driver-fields instances', () => {
        document.body.innerHTML = `
            <additional-driver-fields>
                <input id="d0-first" type="text">
            </additional-driver-fields>
            <additional-driver-fields>
                <input id="d1-first" type="text">
            </additional-driver-fields>
        `;
        const result = runPageInventory('drivers-compact');
        const scopeEntry = result.scopeContainers.find((s) => s.includes('additional-driver-fields'));
        expect(scopeEntry).toBeTruthy();
        expect(scopeEntry).toContain('2 instances');
    });

    test('detects scope on individual fields inside driver container', () => {
        document.body.innerHTML = `
            <additional-driver-fields>
                <input id="d0-first" type="text">
            </additional-driver-fields>
        `;
        const result = runPageInventory('drivers-compact');
        const field = result.fields.find((f) => f.id === 'd0-first');
        expect(field).toBeTruthy();
        expect(field.scope).toBe('additional-driver-fields');
    });

    test('returns empty scopeContainers when no scope wrappers exist', () => {
        makeInput('solo-field');
        const result = runPageInventory('applicant-details');
        expect(result.scopeContainers).toEqual([]);
    });
});

describe('runPageInventory — route fallback', () => {
    test('uses pathname when routeKey is null', () => {
        makeInput('any-field');
        const result = runPageInventory(null);
        // jsdom's window.location.pathname is typically '/'
        expect(result.route).toBeTruthy();
    });
});
