/**
 * Altech EZLynx V2 — Dry Run recon tests
 *
 * Verifies that dry-run describes what would happen without touching the DOM.
 */
'use strict';

jest.mock('../../src/content/registries', () => ({
    getRegistry: jest.fn(),
}));
jest.mock('../../src/content/locator/find-scoped', () => ({
    findScoped: jest.fn(),
}));
jest.mock('../../src/content/orchestrator/dependency-graph', () => ({
    topoSort: jest.fn((atoms) => atoms), // passthrough — no reordering in tests
}));
jest.mock('../../src/content/transforms/abbreviations', () => ({
    expand: jest.fn((v) => v), // no-op transform in tests
}));

const { getRegistry } = require('../../src/content/registries');
const { findScoped } = require('../../src/content/locator/find-scoped');
const { runDryRun } = require('../../src/content/recon/dry-run');

afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
});

function makeInput(id) {
    const el = document.createElement('input');
    el.type = 'text';
    el.id = id;
    document.body.appendChild(el);
    return el;
}

describe('runDryRun — basic happy path', () => {
    test('returns FILL action for atom with present element and source value', () => {
        makeInput('applicant-first-name');
        getRegistry.mockReturnValue([
            { key: 'firstName', idTemplate: 'applicant-first-name', source: 'FirstName', label: 'First Name', type: 'text' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runDryRun('applicant-details', { FirstName: 'Jane' });
        expect(result.rows[0].action).toBe('FILL');
        expect(result.rows[0].value).toBe('Jane');
        expect(result.summary.fill).toBe(1);
        expect(result.summary.skip).toBe(0);
    });

    test('value appears in markdown output', () => {
        makeInput('applicant-first-name');
        getRegistry.mockReturnValue([
            { key: 'firstName', idTemplate: 'applicant-first-name', source: 'FirstName', label: 'First Name', type: 'text' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runDryRun('applicant-details', { FirstName: 'Jane' });
        expect(result.markdown).toContain('Jane');
        expect(result.markdown).toContain('firstName');
    });
});

describe('runDryRun — skip conditions', () => {
    test('SKIP when element not found', () => {
        // No DOM element
        getRegistry.mockReturnValue([
            { key: 'missingField', idTemplate: 'does-not-exist', source: 'X', label: 'Missing', type: 'text' },
        ]);
        findScoped.mockReturnValue(null);

        const result = runDryRun('test', { X: 'val' });
        expect(result.rows[0].action).toBe('SKIP');
        expect(result.rows[0].reason).toMatch(/not found/);
    });

    test('SKIP when no source value', () => {
        makeInput('applicant-nickname');
        getRegistry.mockReturnValue([
            { key: 'nickname', idTemplate: 'applicant-nickname', source: 'Nickname', label: 'Nickname', type: 'text' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runDryRun('applicant-details', {}); // no Nickname in clientData
        expect(result.rows[0].action).toBe('SKIP');
        expect(result.rows[0].reason).toBe('no source value');
    });

    test('SKIP when element is disabled', () => {
        const el = makeInput('dob-field');
        el.disabled = true;
        getRegistry.mockReturnValue([
            { key: 'dob', idTemplate: 'dob-field', source: 'DOB', label: 'DOB', type: 'date' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        const result = runDryRun('test', { DOB: '01/01/1990' });
        expect(result.rows[0].action).toBe('SKIP');
        expect(result.rows[0].reason).toMatch(/disabled/);
    });
});

describe('runDryRun — DOM is NOT modified', () => {
    test('input value remains empty after dry run', () => {
        const el = makeInput('applicant-first-name');
        getRegistry.mockReturnValue([
            { key: 'firstName', idTemplate: 'applicant-first-name', source: 'FirstName', label: 'First Name', type: 'text' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        runDryRun('applicant-details', { FirstName: 'Jane' });
        // DOM must remain untouched — value should still be ''
        expect(el.value).toBe('');
    });
});

describe('runDryRun — BLOCKED propagation', () => {
    test('dependent atom is BLOCKED when precondition not DONE', () => {
        // industry is missing its element → will SKIP; occupation depends on it → BLOCKED
        getRegistry.mockReturnValue([
            { key: 'industry', idTemplate: 'industry-field', source: 'Industry', label: 'Industry', type: 'mat-select' },
            { key: 'occupation', idTemplate: 'occupation-field', source: 'Occupation', label: 'Occupation', type: 'mat-select',
              preconditions: [{ atom: 'industry', state: 'DONE' }] },
        ]);
        findScoped.mockReturnValue(null); // neither element found

        const result = runDryRun('test', { Industry: 'Tech', Occupation: 'Engineer' });
        const industry = result.rows.find((r) => r.key === 'industry');
        const occupation = result.rows.find((r) => r.key === 'occupation');
        expect(industry.action).toBe('SKIP');
        expect(occupation.action).toBe('BLOCKED');
    });
});

describe('runDryRun — result shape', () => {
    test('has all required properties', () => {
        getRegistry.mockReturnValue([]);
        const result = runDryRun('test', {});
        expect(result).toHaveProperty('route', 'test');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('rows');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('markdown');
        expect(result.summary).toHaveProperty('total');
        expect(result.summary).toHaveProperty('fill');
        expect(result.summary).toHaveProperty('skip');
        expect(result.summary).toHaveProperty('blocked');
    });
});
