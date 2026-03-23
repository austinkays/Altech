'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load BroadformData into a minimal JSDOM (no DOM or Utils dependency on evaluate())
function loadBroadformData() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        runScripts: 'dangerously',
        url: 'http://localhost',
    });
    const src = fs.readFileSync(
        path.resolve(__dirname, '../js/tools/broadform-data.js'),
        'utf8'
    );
    dom.window.eval(src);
    return dom.window.BroadformData;
}

describe('BroadformData', () => {
    let BroadformData;

    beforeAll(() => {
        BroadformData = loadBroadformData();
    });

    describe('questions array', () => {
        test('exports 3 questions', () => {
            expect(BroadformData.questions).toHaveLength(3);
        });

        test('first question is stateDropdown for WA and OR', () => {
            const q = BroadformData.questions[0];
            expect(q.type).toBe('stateDropdown');
            expect(q.states).toContain('WA');
            expect(q.states).toContain('OR');
        });

        test('second and third questions are yesNoToggle', () => {
            expect(BroadformData.questions[1].type).toBe('yesNoToggle');
            expect(BroadformData.questions[2].type).toBe('yesNoToggle');
        });
    });

    describe('rules.evaluate', () => {
        // ── Hard stop cases ──────────────────────────────────────────────

        test('hard-stop when ownedAuto is true (state selected)', () => {
            const result = BroadformData.rules.evaluate('WA', true, false);
            expect(result).not.toBeNull();
            expect(result.outcome).toBe('hard-stop');
        });

        test('hard-stop when regularAccess is true (state selected)', () => {
            const result = BroadformData.rules.evaluate('OR', false, true);
            expect(result).not.toBeNull();
            expect(result.outcome).toBe('hard-stop');
        });

        test('hard-stop when ownedAuto is true regardless of state being null', () => {
            const result = BroadformData.rules.evaluate(null, true, false);
            expect(result.outcome).toBe('hard-stop');
        });

        test('hard-stop message mentions Broadform ineligibility', () => {
            const result = BroadformData.rules.evaluate('WA', true, false);
            expect(result.message).toMatch(/Ineligible for Broadform/);
        });

        // ── Null / incomplete cases ──────────────────────────────────────

        test('returns null when state is not selected', () => {
            expect(BroadformData.rules.evaluate(null, false, false)).toBeNull();
        });

        test('returns null when ownedAuto is not answered', () => {
            expect(BroadformData.rules.evaluate('WA', null, null)).toBeNull();
        });

        test('returns null when regularAccess is not answered', () => {
            expect(BroadformData.rules.evaluate('WA', false, null)).toBeNull();
        });

        // ── WA eligible ──────────────────────────────────────────────────

        test('WA + both no → outcome is eligible', () => {
            const result = BroadformData.rules.evaluate('WA', false, false);
            expect(result.outcome).toBe('eligible');
        });

        test('WA eligible → Progressive is ready', () => {
            const result = BroadformData.rules.evaluate('WA', false, false);
            const progressive = result.carriers.find(c => c.key === 'progressive');
            expect(progressive).toBeDefined();
            expect(progressive.disabled).toBe(false);
        });

        test('WA eligible → Dairyland is ready with note', () => {
            const result = BroadformData.rules.evaluate('WA', false, false);
            const dairyland = result.carriers.find(c => c.key === 'dairyland');
            expect(dairyland).toBeDefined();
            expect(dairyland.disabled).toBe(false);
            expect(dairyland.note).toMatch(/WA Broadform eligible/);
        });

        // ── OR eligible ──────────────────────────────────────────────────

        test('OR + both no → outcome is eligible', () => {
            const result = BroadformData.rules.evaluate('OR', false, false);
            expect(result.outcome).toBe('eligible');
        });

        test('OR eligible → Progressive is ready', () => {
            const result = BroadformData.rules.evaluate('OR', false, false);
            const progressive = result.carriers.find(c => c.key === 'progressive');
            expect(progressive).toBeDefined();
            expect(progressive.disabled).toBe(false);
        });

        test('OR eligible → Dairyland is disabled with warning note', () => {
            const result = BroadformData.rules.evaluate('OR', false, false);
            const dairyland = result.carriers.find(c => c.key === 'dairyland');
            expect(dairyland).toBeDefined();
            expect(dairyland.disabled).toBe(true);
            expect(dairyland.note).toMatch(/Do not quote/);
        });
    });
});
