/**
 * Altech EZLynx V2 — Carrier detection tests (Phase 5)
 */
'use strict';

const {
    detectActiveCarriers,
    labelToCarrier,
    CARRIER_LABEL_MAP,
    CARRIER_ID_MARKERS,
} = require('../../src/content/special-cases/carrier-detection');

afterEach(() => {
    document.body.innerHTML = '';
});

describe('labelToCarrier', () => {
    test('maps known carrier labels to tags', () => {
        expect(labelToCarrier('Allstate Insurance')).toBe('allstate');
        expect(labelToCarrier('ASI Progressive')).toBe('asi');
        expect(labelToCarrier('Allied Insurance Company')).toBe('allied');
        expect(labelToCarrier('Modern Legacy Insurance')).toBe('ml');
        expect(labelToCarrier('Safeco Home')).toBe('safeco');
    });

    test('returns null for unrecognized labels', () => {
        expect(labelToCarrier('Unknown Carrier XYZ')).toBeNull();
        expect(labelToCarrier('')).toBeNull();
        expect(labelToCarrier(null)).toBeNull();
    });

    test('is case-insensitive', () => {
        expect(labelToCarrier('ALLSTATE')).toBe('allstate');
        expect(labelToCarrier('allied')).toBe('allied');
        expect(labelToCarrier('Modern LEGACY')).toBe('ml');
    });
});

describe('detectActiveCarriers — always includes common', () => {
    test('returns set with common even on empty page', () => {
        const result = detectActiveCarriers();
        expect(result).toBeInstanceOf(Set);
        expect(result.has('common')).toBe(true);
    });
});

describe('detectActiveCarriers — checkbox strategy', () => {
    function addCheckedCheckbox(label) {
        const el = document.createElement('mat-checkbox');
        el.classList.add('mat-checkbox-checked');
        el.textContent = label;
        document.body.appendChild(el);
        return el;
    }

    test('detects carrier from checked mat-checkbox', () => {
        addCheckedCheckbox('Allstate Fire and Casualty');
        const result = detectActiveCarriers();
        expect(result.has('allstate')).toBe(true);
        expect(result.has('common')).toBe(true);
    });

    test('detects multiple carriers from multiple checkboxes', () => {
        addCheckedCheckbox('Allied Insurance');
        addCheckedCheckbox('ASI Preferred');
        const result = detectActiveCarriers();
        expect(result.has('allied')).toBe(true);
        expect(result.has('asi')).toBe(true);
    });

    test('ignores unchecked checkboxes', () => {
        const el = document.createElement('mat-checkbox');
        // no mat-checkbox-checked class
        el.textContent = 'Allstate';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        expect(result.has('allstate')).toBe(false);
    });

    test('detects from mat-mdc-checkbox-checked variant', () => {
        const el = document.createElement('mat-checkbox');
        el.classList.add('mat-mdc-checkbox-checked');
        el.textContent = 'Safeco Insurance';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        expect(result.has('safeco')).toBe(true);
    });
});

describe('detectActiveCarriers — toggle strategy', () => {
    test('detects carrier from checked mat-slide-toggle', () => {
        const el = document.createElement('mat-slide-toggle');
        el.classList.add('mat-slide-toggle-checked');
        el.textContent = 'Progressive Home';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        expect(result.has('progressive')).toBe(true);
    });

    test('detects from mat-mdc-slide-toggle-checked variant', () => {
        const el = document.createElement('mat-slide-toggle');
        el.classList.add('mat-mdc-slide-toggle-checked');
        el.textContent = 'Travelers Select';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        expect(result.has('travelers')).toBe(true);
    });
});

describe('detectActiveCarriers — DOM id marker strategy', () => {
    test('detects Allstate from allstatexml element id', () => {
        const el = document.createElement('input');
        el.id = 'hail_allstatexmlKS';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        expect(result.has('allstate')).toBe(true);
    });

    test('detects ASI from asixml element id', () => {
        const el = document.createElement('input');
        el.id = 'paidinfullasixmlny';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        expect(result.has('asi')).toBe(true);
    });

    test('detects Allied from allied_ element id', () => {
        const el = document.createElement('input');
        el.id = 'allied_coolingyear';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        expect(result.has('allied')).toBe(true);
    });

    test('detects ML from _ml element id', () => {
        const el = document.createElement('input');
        el.id = 'animalpremises_ml';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        expect(result.has('ml')).toBe(true);
    });

    test('does not false-positive on unrelated ids', () => {
        const el = document.createElement('input');
        el.id = 'applicant-first-name';
        document.body.appendChild(el);
        const result = detectActiveCarriers();
        // Only 'common' should be present
        expect(result.size).toBe(1);
        expect(result.has('common')).toBe(true);
    });
});

describe('detectActiveCarriers — combined strategies', () => {
    test('merges results from both checkbox and DOM id strategies', () => {
        // Checkbox strategy: Allstate checked
        const cb = document.createElement('mat-checkbox');
        cb.classList.add('mat-checkbox-checked');
        cb.textContent = 'Allstate Fire';
        document.body.appendChild(cb);

        // DOM id strategy: ASI element present
        const el = document.createElement('input');
        el.id = 'paidinfullasixmlny';
        document.body.appendChild(el);

        const result = detectActiveCarriers();
        expect(result.has('common')).toBe(true);
        expect(result.has('allstate')).toBe(true);
        expect(result.has('asi')).toBe(true);
    });
});

describe('CARRIER_LABEL_MAP coverage', () => {
    test('has entries for all expected carriers', () => {
        expect(CARRIER_LABEL_MAP).toHaveProperty('allstate');
        expect(CARRIER_LABEL_MAP).toHaveProperty('asi');
        expect(CARRIER_LABEL_MAP).toHaveProperty('allied');
        expect(CARRIER_LABEL_MAP).toHaveProperty('modern legacy');
    });
});

describe('CARRIER_ID_MARKERS coverage', () => {
    test('has entries for allstate, asi, allied, ml', () => {
        const substrings = CARRIER_ID_MARKERS.map((m) => m.substring);
        expect(substrings).toContain('allstatexml');
        expect(substrings).toContain('asixml');
        expect(substrings).toContain('allied_');
        expect(substrings).toContain('_ml');
    });
});
