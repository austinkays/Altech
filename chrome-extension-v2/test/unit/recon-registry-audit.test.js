/**
 * Altech EZLynx V2 — Registry Audit recon tests
 *
 * We stub getRegistry and findScoped/findById to keep tests DOM-focused.
 */
'use strict';

// We need to mock the dependency modules before requiring registry-audit
jest.mock('../../src/content/registries', () => ({
    getRegistry: jest.fn(),
}));
jest.mock('../../src/content/locator/find-scoped', () => ({
    findScoped: jest.fn(),
}));
jest.mock('../../src/content/locator/find-by-id', () => ({
    findById: jest.fn(),
}));

const { getRegistry } = require('../../src/content/registries');
const { findScoped } = require('../../src/content/locator/find-scoped');
const { runRegistryAudit } = require('../../src/content/recon/registry-audit');

afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
});

function makeEl(id, opts = {}) {
    const el = document.createElement('input');
    el.type = 'text';
    el.id = id;
    if (opts.disabled) el.disabled = true;
    if (opts.lexis) {
        el.disabled = true;
        const wrapper = document.createElement('div');
        wrapper.textContent = 'Disabled by LexisNexis';
        wrapper.appendChild(el);
        document.body.appendChild(wrapper);
        return el;
    }
    document.body.appendChild(el);
    return el;
}

describe('runRegistryAudit — basic statuses', () => {
    test('RESOLVED: element exists and is not disabled', () => {
        makeEl('applicant-first-name');
        getRegistry.mockReturnValue([
            { key: 'firstName', idTemplate: 'applicant-first-name', label: 'First Name' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runRegistryAudit('applicant-details', {});
        expect(result.atoms[0].status).toBe('RESOLVED');
    });

    test('MISSING: element not found by locator or direct id', () => {
        // No DOM element created
        getRegistry.mockReturnValue([
            { key: 'missingField', idTemplate: 'does-not-exist', label: 'Missing' },
        ]);
        findScoped.mockReturnValue(null);

        const result = runRegistryAudit('applicant-details', {});
        expect(result.atoms[0].status).toBe('MISSING');
    });

    test('CONDITIONALLY_SKIPPED: element exists but is disabled (no LexisNexis)', () => {
        makeEl('applicant-dob', { disabled: true });
        getRegistry.mockReturnValue([
            { key: 'dob', idTemplate: 'applicant-dob', label: 'Date of Birth' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runRegistryAudit('applicant-details', {});
        expect(result.atoms[0].status).toBe('CONDITIONALLY_SKIPPED');
    });

    test('LEXIS_NEXIS_LOCKED: disabled element with LexisNexis text in ancestor', () => {
        makeEl('applicant-ssn', { lexis: true });
        getRegistry.mockReturnValue([
            { key: 'ssn', idTemplate: 'applicant-ssn', label: 'SSN' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runRegistryAudit('applicant-details', {});
        expect(result.atoms[0].status).toBe('LEXIS_NEXIS_LOCKED');
    });
});

describe('runRegistryAudit — counts', () => {
    test('counts are correct for a mix of statuses', () => {
        makeEl('field-a');            // RESOLVED
        makeEl('field-b', { disabled: true }); // CONDITIONALLY_SKIPPED
        // field-c: MISSING (no DOM)

        getRegistry.mockReturnValue([
            { key: 'a', idTemplate: 'field-a', label: 'A' },
            { key: 'b', idTemplate: 'field-b', label: 'B' },
            { key: 'c', idTemplate: 'field-c', label: 'C' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runRegistryAudit('some-route', {});
        expect(result.counts.RESOLVED).toBe(1);
        expect(result.counts.CONDITIONALLY_SKIPPED).toBe(1);
        expect(result.counts.MISSING).toBe(1);
    });
});

describe('runRegistryAudit — unknown fields', () => {
    test('detects page fields not in registry', () => {
        makeEl('known-field');
        makeEl('unknown-extra-field');

        getRegistry.mockReturnValue([
            { key: 'known', idTemplate: 'known-field', label: 'Known' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runRegistryAudit('some-route', {});
        expect(result.unknown).toContain('unknown-extra-field');
        expect(result.unknown).not.toContain('known-field');
    });
});

describe('runRegistryAudit — empty registry', () => {
    test('returns empty atoms array when registry is empty', () => {
        getRegistry.mockReturnValue([]);
        const result = runRegistryAudit('unknown-route', {});
        expect(result.atoms).toEqual([]);
        expect(result.atomCount).toBe(0);
    });
});

describe('runRegistryAudit — result shape', () => {
    test('result has route, timestamp, atomCount, counts, atoms, unknown', () => {
        getRegistry.mockReturnValue([]);
        const result = runRegistryAudit('test-route', {});
        expect(result).toHaveProperty('route', 'test-route');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('atomCount');
        expect(result).toHaveProperty('counts');
        expect(result).toHaveProperty('atoms');
        expect(result).toHaveProperty('unknown');
    });
});
