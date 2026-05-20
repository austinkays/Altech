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

    // Regression: a real user report. The home address came from the
    // legacy _formatAddressLine ordering ("Street, City, State Zip, County"
    // — county AT END) which the previous parser mis-read as
    // state="LE", zip="" (treating "Lewis County" as the state-zip
    // slot). Smart Scan then sent garbage to Rentcast/Redfin/Zillow and
    // those sources returned nothing — only Fire/Protection Class came
    // back, surfacing as the "Smart Scan didn't find much" report.
    //
    // The pattern-based parser must extract state="WA", zip="98591",
    // county="Lewis County" regardless of the county's position.
    test('parses county-AT-END layout (legacy Places format) correctly', () => {
        const out = SF.parseAddress('180 Drews Prairie Rd, Toledo, WA 98591, Lewis County');
        expect(out.street).toBe('180 Drews Prairie Rd');
        expect(out.city).toBe('Toledo');
        expect(out.state).toBe('WA');     // not 'LE'
        expect(out.zip).toBe('98591');    // not ''
        expect(out.county).toBe('Lewis County');
    });

    test('parses county-AT-END plus trailing USA tag', () => {
        const out = SF.parseAddress('180 Drews Prairie Rd, Toledo, WA 98591, Lewis County, USA');
        expect(out.state).toBe('WA');
        expect(out.zip).toBe('98591');
        expect(out.county).toBe('Lewis County');
    });

    test('parses county-BEFORE-state plus trailing USA tag', () => {
        const out = SF.parseAddress('180 Drews Prairie Rd, Toledo, Lewis County, WA 98591, USA');
        expect(out.state).toBe('WA');
        expect(out.zip).toBe('98591');
        expect(out.county).toBe('Lewis County');
    });

    test('uppercases the state code', () => {
        expect(SF.parseAddress('1 A, B, ca 90210').state).toBe('CA');
    });

    // Regression: js/intake-v2-places.js `_formatAddressLine` builds the
    // home.address string. Earlier versions appended county AFTER
    // state-zip ("Street, City, State Zip, County"), which made
    // parseAddress (walks backward to find state-zip) treat
    // "King County" as the state-zip — mangling state to "KI" and
    // emptying ZIP. Smart Scan then sent garbage to the
    // property-intelligence API and returned nothing useful. The
    // contract for round-tripping a Places result is:
    //   _formatAddressLine → "Street, City, County, State Zip"
    //   parseAddress       → { state: 'WA', zip: '98101', county: 'King County' }
    test('round-trips a 4-part Places address with county BEFORE state-zip', () => {
        // Inline-extract _formatAddressLine from intake-v2-places.js so
        // the contract is locked at the test layer (no IIFE-load needed —
        // it's a pure function).
        const placesSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'intake-v2-places.js'), 'utf8');
        const fnSrc = placesSrc.match(/function _formatAddressLine\(p\) \{[\s\S]*?\n\}/)[0];
        // eslint-disable-next-line no-new-func
        const _formatAddressLine = new Function(`${fnSrc}; return _formatAddressLine;`)();

        const line = _formatAddressLine({
            street: '123 Main St', city: 'Seattle',
            state: 'WA', zip: '98101', county: 'King County',
        });
        // Order matters: county must precede state-zip so parseAddress
        // can identify the trailing state-zip correctly.
        expect(line).toBe('123 Main St, Seattle, King County, WA 98101');

        const parsed = SF.parseAddress(line);
        expect(parsed.street).toBe('123 Main St');
        expect(parsed.city).toBe('Seattle');
        expect(parsed.state).toBe('WA');     // NOT 'KI'
        expect(parsed.zip).toBe('98101');    // NOT ''
        expect(parsed.county).toBe('King County');
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

    test('ArcGIS pool=true still auto-merges (only VISION booleans moved to confirmation)', () => {
        // Phase 22 removed vision booleans from the merge dict (they
        // now route through extractVisionHazards as confirmation
        // prompts). ArcGIS booleans are still authoritative — county
        // records aren't a guess from a satellite photo, so they
        // continue to merge directly when the field is unset.
        const out = SF.mergeResults({
            arcgis: { data: { pool: true }, source: 'County ArcGIS' },
            zillow: null, fire: null, vision: null,
        });
        expect(out.merged['hazards.pool']).toBe(true);
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

describe('IntakeV2SmartFill — vision confidence tightening', () => {
    const SF = loadSmartFill();

    test('Confidence "high" or "medium" → merged; "low" → skipped', () => {
        const high = SF.mergeResults({
            arcgis: null, zillow: null, fire: null,
            vision: { data: { exterior_walls: 'Brick', confidence: { exterior_walls: 'high' } }, source: 'V' },
        });
        expect(high.merged.exterior).toBe('Brick');
        const low = SF.mergeResults({
            arcgis: null, zillow: null, fire: null,
            vision: { data: { exterior_walls: 'Brick', confidence: { exterior_walls: 'low' } }, source: 'V' },
        });
        expect(low.merged.exterior).toBeUndefined();
    });

    test('Missing confidence string is treated as low (does not merge)', () => {
        // v1 used `conf !== 'low'` which would also accept undefined.
        // v2 tightened to require an explicit 'high'/'medium' string.
        const out = SF.mergeResults({
            arcgis: null, zillow: null, fire: null,
            vision: { data: { exterior_walls: 'Brick' }, source: 'V' },  // no confidence field
        });
        expect(out.merged.exterior).toBeUndefined();
    });

    test('Vision booleans no longer enter the merge dict directly', () => {
        // Phase 22: pool / trampoline routed through extractVisionHazards
        // for explicit confirmation, not auto-merged into the form.
        const out = SF.mergeResults({
            arcgis: null, zillow: null, fire: null,
            vision: { data: { has_pool: true, has_trampoline: true }, source: 'V' },
        });
        expect(out.merged['hazards.pool']).toBeUndefined();
        expect(out.merged['hazards.trampoline']).toBeUndefined();
    });
});

describe('IntakeV2SmartFill — extractVisionHazards', () => {
    const SF = loadSmartFill();

    test('Returns no hazards when vision payload is null / data missing', () => {
        expect(SF.extractVisionHazards(null)).toEqual([]);
        expect(SF.extractVisionHazards({ data: null })).toEqual([]);
    });

    test('Extracts pool + trampoline when booleans are explicitly true', () => {
        const out = SF.extractVisionHazards({
            data: { has_pool: true, has_trampoline: true },
        });
        const ids = out.map(h => h.id).sort();
        expect(ids).toEqual(['pool', 'trampoline']);
    });

    test('Ignores false / null booleans (no row for unconfirmed sightings)', () => {
        const out = SF.extractVisionHazards({
            data: { has_pool: false, has_trampoline: null, tree_overhang_roof: undefined },
        });
        expect(out).toEqual([]);
    });

    test('Brush clearance is the inverse — false means inadequate, surfaces as a risk', () => {
        const out = SF.extractVisionHazards({
            data: { brush_clearance_adequate: false },
        });
        expect(out.length).toBe(1);
        expect(out[0].id).toBe('brushClearance');
        expect(out[0].severity).toBe('risk');
    });

    test('Tree overhang is detected when boolean is true', () => {
        const out = SF.extractVisionHazards({
            data: { tree_overhang_roof: true },
        });
        expect(out.length).toBe(1);
        expect(out[0].id).toBe('treeOverhang');
    });

    test('Lenient truthy detection — string "Yes" / number 1 / string "true" all surface a hazard', () => {
        // Bug-hunt audit #7: vision boolean detection was strict
        // (=== true) where ArcGIS is lenient. If the AI provider ever
        // serializes booleans as strings or numbers, strict detection
        // silently drops the hazard prompt. These cases pin the
        // lenient detection that survives that drift.
        for (const truthy of [true, 'true', 'Yes', 1, '1']) {
            const out = SF.extractVisionHazards({ data: { has_pool: truthy } });
            expect(out.length).toBe(1);
            expect(out[0].id).toBe('pool');
        }
        // Brush is the inverse — false / 'false' / 'No' / 0 / '0' all
        // mean "inadequate", which is the risk-flag direction.
        for (const falsy of [false, 'false', 'No', 0, '0']) {
            const out = SF.extractVisionHazards({ data: { brush_clearance_adequate: falsy } });
            expect(out.length).toBe(1);
            expect(out[0].id).toBe('brushClearance');
        }
    });

    test('Null / undefined / missing brush clearance is NOT flagged (no evidence either way)', () => {
        // "Adequate" defaults to null in the AI response when the
        // imagery can't tell. Don't surface a hazard the agent has
        // no basis to confirm.
        for (const indeterminate of [null, undefined]) {
            const out = SF.extractVisionHazards({ data: { brush_clearance_adequate: indeterminate } });
            expect(out).toEqual([]);
        }
    });
});
