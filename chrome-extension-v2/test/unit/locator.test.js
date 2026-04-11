/**
 * Altech EZLynx V2 — Locator test suite
 */
const { findById, resolveId } = require('../../src/content/locator/find-by-id');
const { findScoped } = require('../../src/content/locator/find-scoped');
const { resolveScope } = require('../../src/content/locator/scope-resolvers');

describe('resolveId', () => {
    test('substitutes {N} with ctx.index', () => {
        expect(resolveId('driver-{N}-first-name', { index: 0 })).toBe('driver-0-first-name');
        expect(resolveId('driver-{N}-first-name', { index: 2 })).toBe('driver-2-first-name');
    });

    test('substitutes {entityId} with ctx.entityId', () => {
        expect(resolveId('contact-first-name-{entityId}', { entityId: '71455028' }))
            .toBe('contact-first-name-71455028');
    });

    test('handles both placeholders', () => {
        expect(resolveId('x-{N}-y-{entityId}', { index: 1, entityId: 'abc' }))
            .toBe('x-1-y-abc');
    });

    test('returns literal when no placeholders and no ctx', () => {
        expect(resolveId('applicant-first-name', {})).toBe('applicant-first-name');
    });

    test('returns empty string for null input', () => {
        expect(resolveId(null, {})).toBe('');
    });
});

describe('findById', () => {
    beforeEach(() => {
        document.body.innerHTML = '<input id="applicant-first-name"><input id="driver-0-first-name"><input id="driver-1-first-name">';
    });

    test('resolves a flat id', () => {
        const el = findById('applicant-first-name', {});
        expect(el).not.toBeNull();
        expect(el.id).toBe('applicant-first-name');
    });

    test('resolves a scoped id via {N} substitution', () => {
        const el = findById('driver-{N}-first-name', { index: 1 });
        expect(el.id).toBe('driver-1-first-name');
    });

    test('returns null when nothing matches', () => {
        expect(findById('nonexistent', {})).toBeNull();
    });
});

describe('resolveScope', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <additional-driver-fields><input id="driver-0-first-name"></additional-driver-fields>
            <additional-driver-fields><input id="driver-1-first-name"></additional-driver-fields>
            <vehicle-fields><input id="VIN-0"></vehicle-fields>
        `;
    });

    test('null scope returns document', () => {
        expect(resolveScope(null)).toBe(document);
    });

    test('driver scope picks the Nth wrapper', () => {
        const root = resolveScope('driver', 0);
        expect(root).not.toBeNull();
        expect(root.querySelector('input').id).toBe('driver-0-first-name');
    });

    test('unknown scope returns null', () => {
        expect(resolveScope('nonsense', 0)).toBeNull();
    });

    test('vehicle scope picks the Nth wrapper', () => {
        const root = resolveScope('vehicle', 0);
        expect(root).not.toBeNull();
    });
});

describe('findScoped', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <additional-driver-fields>
                <input id="driver-0-first-name">
                <input id="driver-0-last-name">
            </additional-driver-fields>
            <additional-driver-fields>
                <input id="driver-1-first-name">
                <input id="driver-1-last-name">
            </additional-driver-fields>
        `;
    });

    test('scoped lookup never crosses wrapper boundaries', () => {
        const atom = { idTemplate: 'driver-{N}-first-name', scope: 'driver' };
        const el0 = findScoped(atom, { index: 0 });
        const el1 = findScoped(atom, { index: 1 });
        expect(el0).not.toBeNull();
        expect(el1).not.toBeNull();
        expect(el0.id).toBe('driver-0-first-name');
        expect(el1.id).toBe('driver-1-first-name');
    });

    test('unscoped lookup falls back to getElementById', () => {
        const atom = { idTemplate: 'driver-0-last-name' };
        const el = findScoped(atom, {});
        expect(el).not.toBeNull();
    });

    test('returns null when the scope index is out of range', () => {
        const atom = { idTemplate: 'driver-{N}-first-name', scope: 'driver' };
        expect(findScoped(atom, { index: 5 })).toBeNull();
    });
});
