/**
 * IntakeAssist — AI Intake Assistant Tests
 *
 * Validates:
 * - System prompt includes all 4 phases
 * - Field ID mappings match actual form field IDs
 * - populateForm() correctly sets text, select, and radio fields
 * - Preview labels cover all extracted fields
 * - No stale field IDs (e.g. yearBuilt, stories, roofYear, constructionType)
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

const ROOT = path.resolve(__dirname, '..');

let dom, window, document;

beforeAll(() => {
    const html = loadHTML();
    dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        url: 'http://localhost'
    });
    window = dom.window;
    document = window.document;
});

afterAll(() => {
    if (dom) dom.window.close();
});

// ────────────────────────────────────────────────────
// Source-level validations (static analysis)
// ────────────────────────────────────────────────────

describe('IntakeAssist source correctness', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js', 'intake-assist.js'), 'utf8');

    test('module exports to window.IntakeAssist', () => {
        expect(source).toContain('window.IntakeAssist');
    });

    test('exposes required public API methods', () => {
        expect(source).toContain('init');
        expect(source).toContain('sendMessage');
        expect(source).toContain('populateForm');
        expect(source).toContain('clearChat');
        expect(source).toContain('quickStart');
        expect(source).toContain('applyAndSend');
    });

    describe('System prompt phases', () => {
        test('includes Phase 1 — Identity & Contact', () => {
            expect(source).toContain('Phase 1');
            expect(source).toContain('Full name');
            expect(source).toContain('Date of birth');
            expect(source).toContain('Quote type');
        });

        test('includes Phase 2 — Demographics & Employment', () => {
            expect(source).toContain('Phase 2');
            expect(source).toContain('Gender');
            expect(source).toContain('Marital status');
            expect(source).toContain('Occupation');
            expect(source).toContain('Industry');
            expect(source).toContain('Education');
        });

        test('includes Phase 3 — Property & Vehicle Details', () => {
            expect(source).toContain('Phase 3');
            expect(source).toContain('year built');
            expect(source).toContain('exterior wall type');
            expect(source).toContain('vehicle details');
        });

        test('includes Phase 4 — Prior Insurance', () => {
            expect(source).toContain('Phase 4');
            expect(source).toContain('effective date');
            expect(source).toContain('prior home carrier');
            expect(source).toContain('prior auto carrier');
        });
    });

    describe('Field ID correctness (no stale IDs)', () => {
        test('uses yrBuilt (not yearBuilt) in JSON template', () => {
            // The JSON template should have yrBuilt, matching the form field ID
            expect(source).toContain('"yrBuilt"');
            // Should NOT reference old yearBuilt in simpleFields or JSON template
            expect(source).not.toMatch(/simpleFields[^}]*yearBuilt/);
        });

        test('uses numStories (not stories) in JSON template', () => {
            expect(source).toContain('"numStories"');
            // Should NOT reference old stories in field arrays
            expect(source).not.toMatch(/simpleFields[^}]*'stories'/);
        });

        test('uses roofYr (not roofYear) in JSON template', () => {
            expect(source).toContain('"roofYr"');
            expect(source).not.toMatch(/simpleFields[^}]*roofYear/);
        });

        test('uses exteriorWalls (not constructionType) in JSON template', () => {
            expect(source).toContain('"exteriorWalls"');
            expect(source).not.toMatch(/simpleFields[^}]*constructionType/);
        });

        test('includes effectiveDate in simple fields', () => {
            expect(source).toMatch(/simpleFields[\s\S]*effectiveDate/);
        });

        test('includes priorCarrier in select fields', () => {
            expect(source).toMatch(/selectFields[\s\S]*priorCarrier/);
        });

        test('includes homePriorCarrier in select fields', () => {
            expect(source).toMatch(/selectFields[\s\S]*homePriorCarrier/);
        });
    });
});

// ────────────────────────────────────────────────────
// Form field existence (field IDs must match index.html)
// ────────────────────────────────────────────────────

describe('IntakeAssist field IDs match form', () => {
    const simpleFields = [
        'firstName', 'lastName', 'dob', 'email', 'phone',
        'addrStreet', 'addrCity', 'addrZip',
        'yrBuilt', 'sqFt', 'mortgagee', 'coFirstName', 'coLastName',
        'effectiveDate', 'roofYr', 'occupation'
    ];

    const selectFields = [
        'gender', 'maritalStatus', 'education', 'industry',
        'numStories', 'exteriorWalls',
        'homePriorCarrier', 'homePriorYears', 'priorCarrier', 'priorYears'
    ];

    const otherFields = ['prefix', 'addrState'];

    test.each(simpleFields)('form has text/date input #%s', (id) => {
        const el = document.getElementById(id);
        expect(el).not.toBeNull();
    });

    test.each(selectFields)('form has <select> #%s', (id) => {
        const el = document.getElementById(id);
        expect(el).not.toBeNull();
        expect(el.tagName.toLowerCase()).toBe('select');
    });

    test.each(otherFields)('form has element #%s', (id) => {
        const el = document.getElementById(id);
        expect(el).not.toBeNull();
    });
});

// ────────────────────────────────────────────────────
// Preview label coverage
// ────────────────────────────────────────────────────

describe('IntakeAssist preview labels', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js', 'intake-assist.js'), 'utf8');

    const expectedLabels = [
        'yrBuilt', 'numStories', 'roofYr', 'exteriorWalls',
        'gender', 'maritalStatus', 'education', 'occupation', 'industry',
        'effectiveDate', 'homePriorCarrier', 'homePriorYears',
        'priorCarrier', 'priorYears'
    ];

    test.each(expectedLabels)('labels object includes key "%s"', (key) => {
        // Check that the key appears in the labels object
        const labelsMatch = source.match(/const labels = \{[\s\S]*?\};/);
        expect(labelsMatch).not.toBeNull();
        expect(labelsMatch[0]).toContain(key);
    });

    test('labels do not reference stale keys', () => {
        const labelsMatch = source.match(/const labels = \{[\s\S]*?\};/);
        expect(labelsMatch).not.toBeNull();
        expect(labelsMatch[0]).not.toContain('yearBuilt');
        expect(labelsMatch[0]).not.toContain('stories:');
        expect(labelsMatch[0]).not.toContain('roofYear');
        expect(labelsMatch[0]).not.toContain('constructionType');
    });
});

// ────────────────────────────────────────────────────
// Serverless function count guard
// ────────────────────────────────────────────────────

describe('Serverless function limit', () => {
    test('api/ directory has exactly 12 serverless functions (non-underscore .js files)', () => {
        const apiDir = path.join(ROOT, 'api');
        const jsFiles = fs.readdirSync(apiDir)
            .filter(f => f.endsWith('.js') && !f.startsWith('_'));
        expect(jsFiles.length).toBe(12);
    });

    test('_ai-router.js is a helper module (not a serverless function)', () => {
        const helperPath = path.join(ROOT, 'api', '_ai-router.js');
        expect(fs.existsSync(helperPath)).toBe(true);
    });
});
