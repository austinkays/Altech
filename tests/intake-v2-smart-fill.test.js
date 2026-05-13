/**
 * Unit tests for the v2 home smart-fill orchestrator pure helpers.
 *
 * Smoke-tests parseAddress + mergeResults from
 * js/intake-v2-smart-fill.js by loading the file as text and running
 * the IIFE inside a JSDOM-less Function() sandbox. We can't exercise
 * the full `run()` orchestrator without mocking /api/property-intelligence
 * — that's covered by the existing intake-v2.test.js DOM smoke.
 */

const fs = require('fs');
const path = require('path');

function loadSmartFill() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'intake-v2-smart-fill.js'), 'utf8');
    const sandbox = {
        window: {},
        document: { createElement: () => ({ classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener() {}, hidden: true, querySelector() { return null; }, appendChild() {} }), body: { appendChild() {} }, addEventListener() {} },
        console,
        setTimeout,
        clearTimeout,
        AbortController: class { constructor() { this.signal = {}; } abort() {} },
    };
    sandbox.window.IntakeV2 = {};
    sandbox.window.Utils = {
        escapeHTML: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])),
    };
    // Run the IIFE — assigns window.IntakeV2SmartFill.
    new Function('window', 'document', 'console', 'setTimeout', 'clearTimeout', 'AbortController', source)
        (sandbox.window, sandbox.document, sandbox.console, sandbox.setTimeout, sandbox.clearTimeout, sandbox.AbortController);
    return sandbox.window.IntakeV2SmartFill;
}

describe('IntakeV2SmartFill — parseAddress', () => {
    const SF = loadSmartFill();

    test('returns null for empty / unreasonable input', () => {
        expect(SF.parseAddress('')).toBeNull();
        expect(SF.parseAddress(null)).toBeNull();
        expect(SF.parseAddress('123 Main St')).toBeNull();   // missing comma → can't isolate city
    });

    test('parses a standard "Street, City, ST ZIP" address', () => {
        const out = SF.parseAddress('123 Main St, Anytown, WA 98101');
        expect(out).toEqual({ street: '123 Main St', city: 'Anytown', state: 'WA', zip: '98101', county: '' });
    });

    test('strips trailing ", USA" / ", United States" segments (Google Places format)', () => {
        const a = SF.parseAddress('123 Main St, Anytown, WA 98101, USA');
        expect(a.state).toBe('WA');
        expect(a.zip).toBe('98101');
        const b = SF.parseAddress('123 Main St, Anytown, WA 98101, United States');
        expect(b.state).toBe('WA');
    });

    test('handles 9-digit ZIP+4', () => {
        const out = SF.parseAddress('456 Elm Ave, Springfield, IL 62701-2345');
        expect(out.zip).toBe('62701-2345');
    });

    test('accepts a county hint between city and state', () => {
        // When autocomplete returns a 4-segment address, the segment
        // before state-zip is interpreted as county.
        const out = SF.parseAddress('123 Main St, Anytown, Clark County, WA 98101');
        expect(out.county).toBe('Clark County');
        expect(out.state).toBe('WA');
    });

    test('uppercases the state code', () => {
        expect(SF.parseAddress('1 A, B, ca 90210').state).toBe('CA');
    });
});

describe('IntakeV2SmartFill — mergeResults priority', () => {
    const SF = loadSmartFill();

    test('ArcGIS wins over Zillow for overlapping scalar fields', () => {
        const out = SF.mergeResults({
            arcgis: { data: { yearBuilt: 1952 }, source: 'County ArcGIS' },
            zillow: { data: { yearBuilt: 1948 }, source: 'Rentcast' },
            fire:   null,
            vision: null,
        });
        expect(out.merged.yrBuilt).toBe(1952);
        expect(out.sources.yrBuilt).toBe('County ArcGIS');
    });

    test('Zillow gap-fills fields ArcGIS did not return', () => {
        const out = SF.mergeResults({
            arcgis: { data: { yearBuilt: 1952 }, source: 'County ArcGIS' },
            zillow: { data: { squareFootage: 1800 }, source: 'Rentcast' },
            fire: null, vision: null,
        });
        expect(out.merged.yrBuilt).toBe(1952);
        expect(out.merged.sqFt).toBe(1800);
        expect(out.sources.sqFt).toBe('Rentcast');
    });

    test('Vision only contributes medium/high confidence values', () => {
        const out = SF.mergeResults({
            arcgis: null, zillow: null, fire: null,
            vision: {
                data: {
                    exterior_walls: 'Brick',
                    roof_shape: 'Hip',
                    confidence: { exterior_walls: 'high', roof_shape: 'low' },
                },
                source: 'AI Vision',
            },
        });
        expect(out.merged.exterior).toBe('Brick');
        expect(out.merged['roof.shape']).toBeUndefined();
    });

    test('Booleans (pool, trampoline) — true wins; later false never overwrites true', () => {
        const out = SF.mergeResults({
            arcgis: { data: { pool: false }, source: 'County ArcGIS' },
            zillow: null, fire: null,
            vision: { data: { has_pool: true, has_trampoline: true }, source: 'AI Vision' },
        });
        expect(out.merged['hazards.pool']).toBe(true);
        expect(out.merged['hazards.trampoline']).toBe(true);
    });

    test('Fire station data merges directly without overlap conflict', () => {
        const out = SF.mergeResults({
            arcgis: null, zillow: null, vision: null,
            fire: { data: { fireStationDist: 1.2, protectionClass: 4 }, source: 'Fire / PC' },
        });
        expect(out.merged['hazards.fireStationDist']).toBe(1.2);
        expect(out.merged['hazards.protectionClass']).toBe(4);
    });

    test('Flood data attaches as __flood meta (not a v2 field today)', () => {
        const out = SF.mergeResults({
            arcgis: { data: { yearBuilt: 1990 }, flood: { floodZone: 'X', sfha: false }, source: 'County ArcGIS' },
            zillow: null, fire: null, vision: null,
        });
        expect(out.merged.__flood).toEqual({ floodZone: 'X', sfha: false });
    });

    test('Empty / null source dicts are skipped silently', () => {
        const out = SF.mergeResults({ arcgis: null, zillow: null, fire: null, vision: null });
        expect(out.merged).toEqual({});
        expect(out.sources).toEqual({});
    });
});
