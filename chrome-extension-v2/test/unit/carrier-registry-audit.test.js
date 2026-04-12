/**
 * Altech EZLynx V2 — Registry Audit carrier-specific tests (Phase 5)
 *
 * Tests the CARRIER_SKIPPED status and carrier-aware audit behavior.
 * Core audit statuses (RESOLVED, MISSING, etc.) are tested in
 * recon-registry-audit.test.js; this file focuses on Phase 5 additions.
 */
'use strict';

jest.mock('../../src/content/registries', () => ({
    getRegistry: jest.fn(),
}));
jest.mock('../../src/content/locator/find-scoped', () => ({
    findScoped: jest.fn(),
}));
jest.mock('../../src/content/locator/find-by-id', () => ({
    findById: jest.fn(),
}));
jest.mock('../../src/content/registries/carrier-extensions', () => ({
    getAllCarrierAtoms: jest.fn(),
}));
jest.mock('../../src/content/special-cases/carrier-detection', () => ({
    detectActiveCarriers: jest.fn(),
}));

const { getRegistry } = require('../../src/content/registries');
const { findScoped } = require('../../src/content/locator/find-scoped');
const { getAllCarrierAtoms } = require('../../src/content/registries/carrier-extensions');
const { detectActiveCarriers } = require('../../src/content/special-cases/carrier-detection');
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
    document.body.appendChild(el);
    return el;
}

describe('runRegistryAudit — CARRIER_SKIPPED status', () => {
    test('carrier atoms not in registry are reported as CARRIER_SKIPPED', () => {
        // Core atoms present on page
        makeEl('dwelling');
        getRegistry.mockReturnValue([
            { key: 'dwelling', idTemplate: 'dwelling', label: 'Dwelling' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        // Carrier extensions: 2 atoms, neither loaded (not in getRegistry result)
        getAllCarrierAtoms.mockReturnValue([
            { key: 'coverage_paperless_common', idTemplate: 'coverage_paperless_common',
              label: 'Paperless', carriers: ['common'], _carrierExtension: true },
            { key: 'hail_allstatexmlKS', idTemplate: 'hail_allstatexmlKS',
              label: 'Hail Deductible', carriers: ['allstate'], _carrierExtension: true },
        ]);

        // Only 'common' is active (no Allstate)
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('home-coverage', {});

        // The core atom should be RESOLVED
        const coreAtom = result.atoms.find((a) => a.key === 'dwelling');
        expect(coreAtom.status).toBe('RESOLVED');

        // Both carrier atoms should be CARRIER_SKIPPED
        const paperless = result.atoms.find((a) => a.key === 'coverage_paperless_common');
        expect(paperless.status).toBe('CARRIER_SKIPPED');
        expect(paperless.reason).toBe('no-client-data'); // carrier matches (common), but no data

        const hail = result.atoms.find((a) => a.key === 'hail_allstatexmlKS');
        expect(hail.status).toBe('CARRIER_SKIPPED');
        expect(hail.reason).toBe('carrier-not-active'); // allstate not in active set

        expect(result.counts.CARRIER_SKIPPED).toBe(2);
    });

    test('carrier atom already in registry is NOT duplicated as CARRIER_SKIPPED', () => {
        makeEl('booktransfer');
        getRegistry.mockReturnValue([
            { key: 'booktransfer', idTemplate: 'booktransfer', label: 'Book Transfer',
              carriers: ['common'], _carrierExtension: true },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));

        getAllCarrierAtoms.mockReturnValue([
            { key: 'booktransfer', idTemplate: 'booktransfer', label: 'Book Transfer',
              carriers: ['common'], _carrierExtension: true },
        ]);
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('home-policy-info', {});

        // Should appear once as RESOLVED, not duplicated
        const matches = result.atoms.filter((a) => a.key === 'booktransfer');
        expect(matches).toHaveLength(1);
        expect(matches[0].status).toBe('RESOLVED');
        expect(result.counts.CARRIER_SKIPPED).toBe(0);
    });
});

describe('runRegistryAudit — CARRIER_SKIPPED reason classification', () => {
    beforeEach(() => {
        getRegistry.mockReturnValue([]);
        findScoped.mockReturnValue(null);
    });

    test('reason is carrier-not-active when carrier tag not in active set', () => {
        getAllCarrierAtoms.mockReturnValue([
            { key: 'hail_allstatexmlKS', idTemplate: 'hail_allstatexmlKS',
              label: 'Hail', carriers: ['allstate'], _carrierExtension: true },
        ]);
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('home-dwelling-info', {});
        const atom = result.atoms.find((a) => a.key === 'hail_allstatexmlKS');
        expect(atom.status).toBe('CARRIER_SKIPPED');
        expect(atom.reason).toBe('carrier-not-active');
        expect(atom.carrierRequired).toEqual(['allstate']);
    });

    test('reason is no-client-data when carrier matches but no source data', () => {
        getAllCarrierAtoms.mockReturnValue([
            { key: 'coverage_paperless_common', idTemplate: 'coverage_paperless_common',
              label: 'Paperless', carriers: ['common'], _carrierExtension: true },
        ]);
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('home-coverage', {});
        const atom = result.atoms.find((a) => a.key === 'coverage_paperless_common');
        expect(atom.status).toBe('CARRIER_SKIPPED');
        expect(atom.reason).toBe('no-client-data');
    });
});

describe('runRegistryAudit — counts include CARRIER_SKIPPED', () => {
    test('counts object has CARRIER_SKIPPED field', () => {
        getRegistry.mockReturnValue([]);
        findScoped.mockReturnValue(null);
        getAllCarrierAtoms.mockReturnValue([]);
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('home-coverage', {});
        expect(result.counts).toHaveProperty('CARRIER_SKIPPED', 0);
    });

    test('CARRIER_SKIPPED count reflects skipped carrier atoms', () => {
        getRegistry.mockReturnValue([]);
        findScoped.mockReturnValue(null);
        getAllCarrierAtoms.mockReturnValue([
            { key: 'a', idTemplate: 'a', label: 'A', carriers: ['allstate'], _carrierExtension: true },
            { key: 'b', idTemplate: 'b', label: 'B', carriers: ['asi'], _carrierExtension: true },
            { key: 'c', idTemplate: 'c', label: 'C', carriers: ['common'], _carrierExtension: true },
        ]);
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('home-policy-info', {});
        expect(result.counts.CARRIER_SKIPPED).toBe(3);
    });
});

describe('runRegistryAudit — activeCarriers in result', () => {
    test('result includes activeCarriers array', () => {
        getRegistry.mockReturnValue([]);
        findScoped.mockReturnValue(null);
        getAllCarrierAtoms.mockReturnValue([]);
        detectActiveCarriers.mockReturnValue(new Set(['common', 'allstate']));

        const result = runRegistryAudit('home-coverage', {});
        expect(result.activeCarriers).toEqual(expect.arrayContaining(['common', 'allstate']));
    });
});

describe('runRegistryAudit — carrier atoms do not pollute unknown list', () => {
    test('carrier-skipped atom ids do not appear in unknown', () => {
        // Page has an element with the carrier-specific id
        makeEl('hail_allstatexmlKS');

        getRegistry.mockReturnValue([]);
        findScoped.mockReturnValue(null);
        getAllCarrierAtoms.mockReturnValue([
            { key: 'hail_allstatexmlKS', idTemplate: 'hail_allstatexmlKS',
              label: 'Hail', carriers: ['allstate'], _carrierExtension: true },
        ]);
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('home-dwelling-info', {});
        // The element's id should NOT appear as unknown since it's a known carrier atom
        expect(result.unknown).not.toContain('hail_allstatexmlKS');
    });
});

describe('runRegistryAudit — graceful fallback', () => {
    test('works when getAllCarrierAtoms returns empty for unknown routes', () => {
        getRegistry.mockReturnValue([]);
        findScoped.mockReturnValue(null);
        // Simulate no carrier atoms for the route
        getAllCarrierAtoms.mockReturnValue([]);
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('home-coverage', {});
        expect(result.counts.CARRIER_SKIPPED).toBe(0);
        expect(result.atoms).toEqual([]);
    });
});

describe('runRegistryAudit — no carrier routes unaffected', () => {
    test('applicant-details works normally with carrier module loaded', () => {
        makeEl('applicant-first-name');
        getRegistry.mockReturnValue([
            { key: 'firstName', idTemplate: 'applicant-first-name', label: 'First Name' },
        ]);
        findScoped.mockImplementation((atom) => document.getElementById(atom.idTemplate));
        getAllCarrierAtoms.mockReturnValue([]); // no carrier atoms for this route
        detectActiveCarriers.mockReturnValue(new Set(['common']));

        const result = runRegistryAudit('applicant-details', {});
        expect(result.atoms[0].status).toBe('RESOLVED');
        expect(result.counts.CARRIER_SKIPPED).toBe(0);
    });
});
