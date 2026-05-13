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
    // Provide STORAGE_KEYS so _loadSavedOverrides() doesn't throw
    dom.window.STORAGE_KEYS = { CARRIER_OVERRIDES: 'altech_carrier_overrides' };
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
        test('exports broadform questions (4 variables)', () => {
            expect(BroadformData.questions.length).toBeGreaterThanOrEqual(4);
        });

        test('first question is stateDropdown for WA and OR', () => {
            const q = BroadformData.questions[0];
            expect(q.type).toBe('stateDropdown');
            expect(q.states).toContain('WA');
            expect(q.states).toContain('OR');
        });

        test('includes ownedAuto and regularAccess yesNoToggle questions', () => {
            const owned = BroadformData.questions.find(q => q.id === 'ownedAuto');
            const access = BroadformData.questions.find(q => q.id === 'regularAccess');
            expect(owned).toBeDefined();
            expect(owned.type).toBe('yesNoToggle');
            expect(access).toBeDefined();
            expect(access.type).toBe('yesNoToggle');
        });

        test('exports underwritingVariables with all LOBs', () => {
            expect(BroadformData.underwritingVariables.length).toBeGreaterThan(10);
            const homeVars = BroadformData.underwritingVariables.filter(v => v.appliesTo.includes('home'));
            expect(homeVars.length).toBeGreaterThan(5);
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

    describe('carriers', () => {
        test('exports 6 carriers', () => {
            expect(BroadformData.carriers).toHaveLength(6);
        });

        test('every carrier has key, name, and lines', () => {
            BroadformData.carriers.forEach(c => {
                expect(c.key).toBeDefined();
                expect(c.name).toBeDefined();
                expect(c.lines).toBeDefined();
            });
        });

        test('Progressive supports broadform in WA and OR', () => {
            const prog = BroadformData.carriers.find(c => c.key === 'progressive');
            expect(prog.lines.broadform.states).toContain('WA');
            expect(prog.lines.broadform.states).toContain('OR');
        });
    });

    describe('operators', () => {
        test('eq operator returns true on match', () => {
            expect(BroadformData.operators.eq('WA', 'WA')).toBe(true);
            expect(BroadformData.operators.eq('WA', 'OR')).toBe(false);
        });

        test('in operator checks array membership', () => {
            expect(BroadformData.operators.in('WA', ['WA', 'OR'])).toBe(true);
            expect(BroadformData.operators.in('TX', ['WA', 'OR'])).toBe(false);
        });

        test('lte operator works for numbers', () => {
            expect(BroadformData.operators.lte(3, 5)).toBe(true);
            expect(BroadformData.operators.lte(5, 5)).toBe(true);
            expect(BroadformData.operators.lte(6, 5)).toBe(false);
        });
    });
});

// ── BroadformEngine ──────────────────────────────────────────────────────────
describe('BroadformEngine', () => {
    let BroadformEngine;

    beforeAll(() => {
        const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'http://localhost',
        });
        // Load data first, then engine
        const dataSrc = fs.readFileSync(
            path.resolve(__dirname, '../js/tools/broadform-data.js'), 'utf8'
        );
        const engineSrc = fs.readFileSync(
            path.resolve(__dirname, '../js/tools/broadform-engine.js'), 'utf8'
        );
        dom.window.eval(dataSrc);
        dom.window.eval(engineSrc);
        BroadformEngine = dom.window.BroadformEngine;
    });

    test('evaluate returns result with expected shape', () => {
        const profile = { addrState: 'WA', ownedAuto: false, regularAccess: false };
        const result = BroadformEngine.evaluate(profile, 'broadform');
        expect(result).toHaveProperty('eligible');
        expect(result).toHaveProperty('pending');
        expect(result).toHaveProperty('disqualified');
        expect(result).toHaveProperty('referOut');
        expect(result).toHaveProperty('missingFields');
        expect(Array.isArray(result.eligible)).toBe(true);
    });

    test('WA broadform with no disqualifiers returns Progressive eligible', () => {
        const profile = { state: 'WA', ownedAuto: false, regularAccess: false };
        const result = BroadformEngine.evaluate(profile, 'broadform');
        const prog = result.eligible.find(c => c.key === 'progressive');
        expect(prog).toBeDefined();
    });

    test('Dairyland is referOut for OR broadform', () => {
        const profile = { state: 'OR', ownedAuto: false, regularAccess: false };
        const result = BroadformEngine.evaluate(profile, 'broadform');
        const dairy = result.referOut.find(c => c.key === 'dairyland');
        expect(dairy).toBeDefined();
        expect(dairy.note).toMatch(/Do not quote/);
    });

    test('owning a vehicle disqualifies broadform carriers with ownedAuto rule', () => {
        const profile = { state: 'WA', ownedAuto: true, regularAccess: false };
        const result = BroadformEngine.evaluate(profile, 'broadform');
        // Progressive and Dairyland both require ownedAuto=false
        const disqKeys = result.disqualified.map(c => c.key);
        expect(disqKeys).toContain('progressive');
        expect(disqKeys).toContain('dairyland');
    });

    test('missing state returns all carriers as pending or missingFields populated', () => {
        const profile = { ownedAuto: false, regularAccess: false };
        const result = BroadformEngine.evaluate(profile, 'broadform');
        expect(result.missingFields.length).toBeGreaterThan(0);
    });

    test('mergeProfile fills null fields from new data', () => {
        const existing = { addrState: 'WA', ownedAuto: null };
        const merged = BroadformEngine.mergeProfile(existing, { ownedAuto: false, regularAccess: true });
        expect(merged.addrState).toBe('WA');
        expect(merged.ownedAuto).toBe(false);
        expect(merged.regularAccess).toBe(true);
    });

    test('mergeProfile does not overwrite existing values', () => {
        const existing = { addrState: 'WA', ownedAuto: true };
        const merged = BroadformEngine.mergeProfile(existing, { addrState: 'OR', ownedAuto: false });
        expect(merged.addrState).toBe('WA');
        expect(merged.ownedAuto).toBe(true);
    });
});

describe('BroadformData runtime overrides', () => {
    let BroadformData;

    beforeEach(() => {
        // Fresh load each test so overrides don't leak
        BroadformData = loadBroadformData();
    });

    test('getCarrierSummary returns a non-empty array describing carriers', () => {
        const summary = BroadformData.getCarrierSummary();
        expect(Array.isArray(summary)).toBe(true);
        expect(summary.length).toBeGreaterThanOrEqual(6);
        const prog = summary.find(s => s.key === 'progressive');
        expect(prog).toBeDefined();
        expect(prog.name).toBe('Progressive');
        expect(prog.lines).toBeDefined();
    });

    test('applyOverrides patches a carrier rule and resetOverrides restores it', () => {
        const original = BroadformData.carriers.find(c => c.key === 'safeco');
        const origHomeRulesCount = original.lines.home.rules.length;

        BroadformData.applyOverrides({
            safeco: {
                home: {
                    rules: [
                        { field: 'roofAge', op: 'lte', value: 99, reason: 'Test rule' }
                    ]
                }
            }
        });

        const patched = BroadformData.carriers.find(c => c.key === 'safeco');
        expect(patched.lines.home.rules.length).toBe(1);
        expect(patched.lines.home.rules[0].value).toBe(99);

        BroadformData.resetOverrides();
        const restored = BroadformData.carriers.find(c => c.key === 'safeco');
        expect(restored.lines.home.rules.length).toBe(origHomeRulesCount);
    });

    test('applyOverrides patches states list', () => {
        BroadformData.applyOverrides({
            pemco: {
                home: {
                    states: ['WA', 'OR', 'CA']
                }
            }
        });

        const pemco = BroadformData.carriers.find(c => c.key === 'pemco');
        expect(pemco.lines.home.states).toEqual(['WA', 'OR', 'CA']);
    });

    test('applyOverrides patches note field', () => {
        BroadformData.applyOverrides({
            progressive: {
                broadform: {
                    note: 'Updated test note'
                }
            }
        });

        const prog = BroadformData.carriers.find(c => c.key === 'progressive');
        expect(prog.lines.broadform.note).toBe('Updated test note');
    });

    test('resetOverrides restores all carriers to defaults', () => {
        BroadformData.applyOverrides({
            progressive: { broadform: { note: 'changed' } },
            safeco: { home: { states: ['XX'] } }
        });
        BroadformData.resetOverrides();

        const prog = BroadformData.carriers.find(c => c.key === 'progressive');
        expect(prog.lines.broadform.note).not.toBe('changed');

        const safeco = BroadformData.carriers.find(c => c.key === 'safeco');
        expect(safeco.lines.home.states).not.toEqual(['XX']);
    });
});

// Regression guard: the broadform tool saves rule edits to localStorage at
// STORAGE_KEYS.CARRIER_OVERRIDES and triggers a Sync.schedulePush(). The push
// goes through SupabaseSync.pushBlob which is configured to mirror anything
// in DOC_LOCAL_KEYS. If 'carrierOverrides' falls out of that map, user rule
// edits are silently dropped from cloud sync on device switch.
describe('CARRIER_OVERRIDES sync wiring (Supabase)', () => {
    const supabaseSyncSrc = fs.readFileSync(
        path.resolve(__dirname, '../js/supabase-sync.js'),
        'utf8'
    );

    test('carrierOverrides is registered in SupabaseSync.DOC_LOCAL_KEYS', () => {
        const docMapMatch = supabaseSyncSrc.match(/const DOC_LOCAL_KEYS = Object\.freeze\(\{([\s\S]*?)\}\);/);
        expect(docMapMatch).not.toBeNull();
        expect(docMapMatch[1]).toMatch(/carrierOverrides:\s*STORAGE_KEYS\.CARRIER_OVERRIDES/);
    });
});
