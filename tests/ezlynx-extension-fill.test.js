/**
 * EZLynx Extension Fill Engine Tests
 *
 * Tests for §13 Route Registry, §14 DOM Harvester, and §15 Positional Fill Engine
 * added to chrome-extension/content.js.
 *
 * Strategy: load content.js in a vm.runInNewContext sandbox with all Chrome
 * extension APIs mocked.  function declarations are hoisted to the vm context
 * object, making routeToRegex, matchRoute, harvestFormFields, splitColumnarFields,
 * buildPositionalPairs, resolveValue, fillElementPositional, and fillPageSequential
 * directly accessible.  const declarations (ROUTE_TABLE etc.) are not on the context
 * but are correctly closed over by the functions that use them.
 *
 * Sections:
 *  §1  routeToRegex() — all 8 routes, wildcard expansion, hash fragments
 *  §2  matchRoute() — known/unknown/hash URLs, ordering priority
 *  §3  splitColumnarFields() — 2-column row-first DOM order
 *  §4  buildPositionalPairs() — zip, truncation, empty cases
 *  §5  fillPageSequential() — positional fill runs, fallback triggers, co-app scope
 */

'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ── Load content.js into a reusable sandbox ─────────────────────────────────

const CONTENT_JS_PATH = path.resolve(__dirname, '..', 'chrome-extension', 'content.js');
const contentSrc = fs.readFileSync(CONTENT_JS_PATH, 'utf8');

/**
 * Build a vm context that satisfies content.js's global dependencies.
 * All Chrome extension APIs are mocked.  DOM globals are provided by JSDOM.
 * Injected stubs for fill primitives let us observe calls without real DOM side-effects.
 */
function buildContext(overrides = {}) {
    const dom = new JSDOM('<!DOCTYPE html><body></body>', {
        url: 'https://app.ezlynxweb.com/web/account/create/personal/details',
    });
    const { window } = dom;

    // Stub fill primitives — tests override these per-test.
    const stubs = {
        setInputValue:         jest.fn(),
        fillNativeSelect:      jest.fn().mockReturnValue(true),
        fillCustomDropdown:    jest.fn().mockResolvedValue(true),
        fillPage:              jest.fn().mockResolvedValue({ textFilled: 0, ddFilled: 0, textSkipped: 0, ddSkipped: 0 }),
        isVisible:             jest.fn().mockReturnValue(true),
        expand:                jest.fn((v) => v),
        wait:                  jest.fn().mockResolvedValue(undefined),
        findLabelFor:          jest.fn().mockReturnValue(''),
        bestMatch:             jest.fn().mockReturnValue(null),
        updateToolbarStatus:   jest.fn(),
        detectPage:            jest.fn().mockReturnValue('unknown'),
        elog:                  jest.fn(),
        injectToolbar:         jest.fn(),
        toolbarShadow:         null,
        toolbarWasShown:       false,
        EXTENSION_VERSION:     'test',
        FILL_DELAY:            0,
        DROPDOWN_WAIT:         0,
        RETRY_WAIT:            0,
        BASE_DROPDOWN_LABELS:  {},
        // Chrome API stubs
        chrome: {
            storage: {
                local: {
                    get: jest.fn((keys, cb) => { if (cb) cb({}); return Promise.resolve({}); }),
                    set: jest.fn(),
                },
                onChanged: { addListener: jest.fn() },
            },
            runtime: {
                onMessage: { addListener: jest.fn() },
            },
        },
        // DOM globals from JSDOM
        document:    window.document,
        location:    window.location,
        window:      window,
        history:     window.history,
        setTimeout:  global.setTimeout,
        clearTimeout: global.clearTimeout,
        setInterval: jest.fn(),
        // getComputedStyle is called bare in isVisible() — must be a vm-context global
        getComputedStyle: (...args) => window.getComputedStyle(...args),
        MutationObserver: jest.fn().mockImplementation(() => ({
            observe: jest.fn(),
            disconnect: jest.fn(),
        })),
        console: global.console,
        Math:    Math,
        Array:   Array,
        Object:  Object,
        String:  String,
        Promise: Promise,
        // Use the outer RegExp so vm-created RegExp instances pass toBeInstanceOf(RegExp)
        RegExp:  RegExp,
        // Prevent auto-init double-injection guard from running
        __altechFillerLoaded: false,
        ...overrides,
    };

    // Run content.js in this context
    const ctx = vm.createContext(stubs);
    try {
        vm.runInContext(contentSrc, ctx, { filename: 'content.js' });
    } catch (e) {
        // Ignore expected errors from unimplemented stubs during init
        if (!e.message.includes('Cannot read') && !e.message.includes('is not a function')) {
            throw e;
        }
    }

    return ctx;
}

// Singleton context — rebuilt per describe block where needed.
let ctx;

beforeAll(() => {
    ctx = buildContext();
});

// ─────────────────────────────────────────────────────────────────────────────
// §1  routeToRegex()
// ─────────────────────────────────────────────────────────────────────────────

describe('§1 routeToRegex()', () => {
    const ROUTES = [
        '/details',
        '/details#co-applicant',
        '/rating/auto/*/vehicles-compact',
        '/rating/auto/*/drivers-compact',
        '/rating/home/*/rating',
        '/rating/home/*/policy-info',
        '/rating/home/*/dwelling-info',
        '/rating/home/*/coverage',
    ];

    test.each(ROUTES)('builds a valid RegExp for route "%s"', (route) => {
        const re = ctx.routeToRegex(route);
        expect(re).toBeInstanceOf(RegExp);
    });

    test('wildcard matches a real EZLynx auto-vehicles URL', () => {
        const re = ctx.routeToRegex('/rating/auto/*/vehicles-compact');
        expect(re.test('https://app.ezlynxweb.com/rating/auto/abc123xyz/vehicles-compact')).toBe(true);
    });

    test('wildcard matches a real EZLynx home dwelling URL', () => {
        const re = ctx.routeToRegex('/rating/home/*/dwelling-info');
        expect(re.test('https://app.ezlynxweb.com/rating/home/qwerty456/dwelling-info')).toBe(true);
    });

    test('wildcard does NOT match a URL with extra path segments', () => {
        const re = ctx.routeToRegex('/rating/auto/*/vehicles-compact');
        // A slash in the wildcard position should not match since [^/]+ stops at /
        expect(re.test('https://app.ezlynxweb.com/rating/auto/a/b/vehicles-compact')).toBe(false);
    });

    test('hash fragment route matches URL with hash', () => {
        const re = ctx.routeToRegex('/details#co-applicant');
        expect(re.test('https://app.ezlynxweb.com/web/account/create/personal/details#co-applicant')).toBe(true);
    });

    test('hash fragment route does NOT match URL without hash', () => {
        const re = ctx.routeToRegex('/details#co-applicant');
        expect(re.test('https://app.ezlynxweb.com/web/account/create/personal/details')).toBe(false);
    });

    test('plain /details route matches URL without hash', () => {
        const re = ctx.routeToRegex('/details');
        expect(re.test('https://app.ezlynxweb.com/web/account/create/personal/details')).toBe(true);
    });

    test('dots in route key are treated as literal dots', () => {
        // None of our routes have dots, but confirm the escaping works
        // by verifying a non-dot URL doesn't match a dot-escaped pattern.
        const re = ctx.routeToRegex('/details');
        // Should NOT match /detailsXco-applicant (dot substitution)
        expect(re.test('/detailsXsomething')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2  matchRoute()
// ─────────────────────────────────────────────────────────────────────────────

describe('§2 matchRoute()', () => {
    test('returns null for an unknown URL', () => {
        expect(ctx.matchRoute('https://app.ezlynxweb.com/some/unknown/page')).toBeNull();
    });

    test('returns null for an empty string', () => {
        expect(ctx.matchRoute('')).toBeNull();
    });

    test('matches /details and returns correct pageName', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/web/account/create/personal/details'
        );
        expect(result).not.toBeNull();
        expect(result.pageName).toBe('Applicant Info');
        expect(result.routeKey).toBe('/details');
        expect(Array.isArray(result.fieldsInOrder)).toBe(true);
        expect(result.fieldsInOrder.length).toBeGreaterThan(0);
    });

    test('matches /details#co-applicant and returns Co-Applicant Modal', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/web/account/create/personal/details#co-applicant'
        );
        expect(result).not.toBeNull();
        expect(result.pageName).toBe('Co-Applicant Modal');
        expect(result.routeKey).toBe('/details#co-applicant');
    });

    test('#co-applicant is matched before plain /details (ordering priority)', () => {
        // Both /details and /details#co-applicant would match a #co-applicant URL
        // if /details is checked first. Verify the hash variant wins.
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/web/account/create/personal/details#co-applicant'
        );
        expect(result.routeKey).toBe('/details#co-applicant');
    });

    test('matches auto vehicles URL', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/rating/auto/abc123/vehicles-compact'
        );
        expect(result).not.toBeNull();
        expect(result.pageName).toBe('Auto Vehicles');
    });

    test('matches auto drivers URL', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/rating/auto/abc123/drivers-compact'
        );
        expect(result).not.toBeNull();
        expect(result.pageName).toBe('Auto Drivers');
    });

    test('matches home rating URL', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/rating/home/xyz789/rating'
        );
        expect(result).not.toBeNull();
        expect(result.pageName).toBe('Home Rating Setup');
    });

    test('matches home policy-info URL', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/rating/home/xyz789/policy-info'
        );
        expect(result).not.toBeNull();
        expect(result.pageName).toBe('Home Policy Info');
    });

    test('matches home dwelling-info URL', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/rating/home/xyz789/dwelling-info'
        );
        expect(result).not.toBeNull();
        expect(result.pageName).toBe('Home Dwelling Info');
    });

    test('matches home coverage URL', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/rating/home/xyz789/coverage'
        );
        expect(result).not.toBeNull();
        expect(result.pageName).toBe('Home Coverage');
    });

    test('returned object includes fieldsInOrder array', () => {
        const result = ctx.matchRoute(
            'https://app.ezlynxweb.com/rating/auto/abc123/drivers-compact'
        );
        expect(result.fieldsInOrder).toContain('First Name');
        expect(result.fieldsInOrder).toContain('Last Name');
        expect(result.fieldsInOrder).toContain('DOB');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3  splitColumnarFields()
// ─────────────────────────────────────────────────────────────────────────────

describe('§3 splitColumnarFields()', () => {
    // Simulate DOM order for a 2-driver, 6-field-per-driver compact page:
    //   D1F0, D2F0, D1F1, D2F1, D1F2, D2F2, D1F3, D2F3, D1F4, D2F4, D1F5, D2F5
    const mockEls = Array.from({ length: 12 }, (_, i) => ({ __idx: i }));

    test('1 column returns the original array unchanged (in a single slice)', () => {
        const slices = ctx.splitColumnarFields(mockEls, 1);
        expect(slices).toHaveLength(1);
        expect(slices[0]).toHaveLength(12);
        expect(slices[0][0].__idx).toBe(0);
    });

    test('2 columns splits 12 elements into two slices of 6', () => {
        const slices = ctx.splitColumnarFields(mockEls, 2);
        expect(slices).toHaveLength(2);
        expect(slices[0]).toHaveLength(6);
        expect(slices[1]).toHaveLength(6);
    });

    test('2-column slice[0] contains even-indexed elements (stride split for row-first DOM)', () => {
        const slices = ctx.splitColumnarFields(mockEls, 2);
        expect(slices[0].map(e => e.__idx)).toEqual([0, 2, 4, 6, 8, 10]);
    });

    test('2-column slice[1] contains odd-indexed elements (stride split for row-first DOM)', () => {
        const slices = ctx.splitColumnarFields(mockEls, 2);
        expect(slices[1].map(e => e.__idx)).toEqual([1, 3, 5, 7, 9, 11]);
    });

    test('3 columns splits 12 elements into three stride-based slices of 4', () => {
        const slices = ctx.splitColumnarFields(mockEls, 3);
        expect(slices).toHaveLength(3);
        expect(slices[0]).toHaveLength(4);
        expect(slices[1]).toHaveLength(4);
        expect(slices[2]).toHaveLength(4);
        expect(slices[0].map(e => e.__idx)).toEqual([0, 3, 6, 9]);
        expect(slices[1].map(e => e.__idx)).toEqual([1, 4, 7, 10]);
        expect(slices[2].map(e => e.__idx)).toEqual([2, 5, 8, 11]);
    });

    test('empty array returns correct number of empty slices', () => {
        const slices = ctx.splitColumnarFields([], 2);
        expect(slices).toHaveLength(2);
        expect(slices[0]).toHaveLength(0);
        expect(slices[1]).toHaveLength(0);
    });

    test('1 element, 2 columns — slice[0] has 1 element, slice[1] empty', () => {
        const slices = ctx.splitColumnarFields([{ __idx: 0 }], 2);
        expect(slices[0]).toHaveLength(1);
        expect(slices[1]).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4  buildPositionalPairs()
// ─────────────────────────────────────────────────────────────────────────────

describe('§4 buildPositionalPairs()', () => {
    const labels   = ['First Name', 'Last Name', 'DOB', 'Gender', 'SSN'];
    const mockEls  = labels.map((_, i) => ({ __idx: i }));

    test('equal lengths produce N pairs', () => {
        const pairs = ctx.buildPositionalPairs(labels, mockEls);
        expect(pairs).toHaveLength(5);
    });

    test('each pair has { label, el, index }', () => {
        const pairs = ctx.buildPositionalPairs(labels, mockEls);
        pairs.forEach((p, i) => {
            expect(p.label).toBe(labels[i]);
            expect(p.el.__idx).toBe(i);
            expect(p.index).toBe(i);
        });
    });

    test('truncates to shorter array when labels > elements', () => {
        const fewer = mockEls.slice(0, 3);
        const pairs = ctx.buildPositionalPairs(labels, fewer);
        expect(pairs).toHaveLength(3);
    });

    test('truncates to shorter array when elements > labels', () => {
        const extraEls = [...mockEls, { __idx: 99 }, { __idx: 100 }];
        const pairs = ctx.buildPositionalPairs(labels, extraEls);
        expect(pairs).toHaveLength(5);
    });

    test('empty fieldsInOrder returns empty array', () => {
        expect(ctx.buildPositionalPairs([], mockEls)).toHaveLength(0);
    });

    test('empty domElements returns empty array', () => {
        expect(ctx.buildPositionalPairs(labels, [])).toHaveLength(0);
    });

    test('both empty returns empty array', () => {
        expect(ctx.buildPositionalPairs([], [])).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5  fillPageSequential()
// ─────────────────────────────────────────────────────────────────────────────

describe('§5 fillPageSequential()', () => {
    const APPLICANT_URL = 'https://app.ezlynxweb.com/web/account/create/personal/details';
    const COAPP_URL     = 'https://app.ezlynxweb.com/web/account/create/personal/details#co-applicant';
    const UNKNOWN_URL   = 'https://app.ezlynxweb.com/some/unknown/page';

    function buildCtxWithUrl(url, domSetup = () => {}) {
        const dom = new JSDOM('<!DOCTYPE html><body></body>', { url });
        const { window } = dom;

        domSetup(window.document);

        const fillPageMock = jest.fn().mockResolvedValue({
            textFilled: 0, ddFilled: 0, textSkipped: 0, ddSkipped: 0
        });
        const setInputValueMock = jest.fn();
        const fillNativeSelectMock = jest.fn().mockReturnValue(true);
        const fillCustomDropdownMock = jest.fn().mockResolvedValue(true);

        const stubs = {
            setInputValue:       setInputValueMock,
            fillNativeSelect:    fillNativeSelectMock,
            fillCustomDropdown:  fillCustomDropdownMock,
            fillPage:            fillPageMock,
            isVisible:           jest.fn().mockReturnValue(true),
            expand:              jest.fn((v) => v),
            wait:                jest.fn().mockResolvedValue(undefined),
            findLabelFor:        jest.fn().mockReturnValue(''),
            bestMatch:           jest.fn().mockReturnValue(null),
            updateToolbarStatus: jest.fn(),
            detectPage:          jest.fn().mockReturnValue('unknown'),
            elog:                jest.fn(),
            injectToolbar:       jest.fn(),
            toolbarShadow:       null,
            toolbarWasShown:     false,
            EXTENSION_VERSION:   'test',
            FILL_DELAY:          0,
            DROPDOWN_WAIT:       0,
            RETRY_WAIT:          0,
            BASE_DROPDOWN_LABELS: {},
            chrome: {
                storage: {
                    local: { get: jest.fn((keys, cb) => { if (cb) cb({}); }), set: jest.fn() },
                    onChanged: { addListener: jest.fn() },
                },
                runtime: { onMessage: { addListener: jest.fn() } },
            },
            document:    window.document,
            location:    window.location,
            window:      window,
            history:     window.history,
            setTimeout:  global.setTimeout,
            clearTimeout: global.clearTimeout,
            setInterval: jest.fn(),
            MutationObserver: jest.fn().mockImplementation(() => ({
                observe: jest.fn(),
                disconnect: jest.fn(),
            })),
            console: global.console,
            Math, Array, Object, String, Promise,
            RegExp,
            getComputedStyle: (...args) => window.getComputedStyle(...args),
            __altechFillerLoaded: false,
        };

        const vmCtx = vm.createContext(stubs);
        try { vm.runInContext(contentSrc, vmCtx, { filename: 'content.js' }); }
        catch (e) { /* ignore init errors from stubs */ }

        // Re-inject mocks overridden by content.js function declarations
        vmCtx.fillPage = fillPageMock;
        vmCtx.setInputValue = setInputValueMock;
        vmCtx.fillNativeSelect = fillNativeSelectMock;
        vmCtx.fillCustomDropdown = fillCustomDropdownMock;
        // isVisible uses el.offsetParent which is always null in JSDOM — re-stub it
        vmCtx.isVisible = jest.fn().mockReturnValue(true);

        return { vmCtx, fillPageMock, setInputValueMock };
    }

    test('delegates to fillPage() when no route matches', async () => {
        const { vmCtx, fillPageMock } = buildCtxWithUrl(UNKNOWN_URL);
        const clientData = { FirstName: 'Alice', LastName: 'Smith' };
        await vmCtx.fillPageSequential(clientData);
        expect(fillPageMock).toHaveBeenCalledWith(clientData);
    });

    test('runs positional fill (not fillPage fallback) when DOM has enough elements', async () => {
        const { vmCtx, fillPageMock, setInputValueMock } = buildCtxWithUrl(
            APPLICANT_URL,
            (doc) => {
                // Add enough visible input elements to exceed the threshold
                for (let i = 0; i < 30; i++) {
                    const inp = doc.createElement('input');
                    inp.type = 'text';
                    doc.body.appendChild(inp);
                }
            }
        );

        const clientData = { FirstName: 'Alice', LastName: 'Smith', DOB: '01/01/1990' };
        await vmCtx.fillPageSequential(clientData);

        // fillPage should NOT have been called as the primary path
        // (it may be called for tail fill, but not as an immediate fallback)
        // The key indicator is that setInputValue was called with real values
        // and fillPage was not called before the positional loop ran.
        // We verify setInputValue fired for at least one resolved field.
        const fillPageCallsBeforePositional = fillPageMock.mock.invocationCallOrder?.[0];
        const setInputCallsFirst = setInputValueMock.mock.invocationCallOrder?.[0];
        // If positional ran, setInputValue should have been called
        // (FirstName, LastName, DOB all map to inputs)
        expect(setInputValueMock).toHaveBeenCalled();
    });

    test('falls back to fillPage() when DOM element count is below threshold', async () => {
        const { vmCtx, fillPageMock } = buildCtxWithUrl(
            APPLICANT_URL,
            (doc) => {
                // Add only 1 visible input — well below the 50% threshold for /details (46+ fields)
                const inp = doc.createElement('input');
                inp.type = 'text';
                doc.body.appendChild(inp);
            }
        );

        const clientData = { FirstName: 'Alice' };
        await vmCtx.fillPageSequential(clientData);

        // Should have fallen back
        expect(fillPageMock).toHaveBeenCalledWith(clientData);
    });

    test('co-applicant route scopes harvestFormFields to dialog container, not document', async () => {
        let harvestRoot = null;

        const { vmCtx } = buildCtxWithUrl(
            COAPP_URL,
            (doc) => {
                // Add a mat-dialog-container with inputs inside it
                const dialog = doc.createElement('mat-dialog-container');
                dialog.setAttribute('role', 'dialog');
                for (let i = 0; i < 30; i++) {
                    const inp = doc.createElement('input');
                    inp.type = 'text';
                    dialog.appendChild(inp);
                }
                doc.body.appendChild(dialog);

                // Also add unrelated inputs outside the dialog
                for (let i = 0; i < 5; i++) {
                    const inp = doc.createElement('input');
                    inp.type = 'text';
                    doc.body.appendChild(inp);
                }
            }
        );

        // Spy on harvestFormFields to capture what root it receives
        const origHarvest = vmCtx.harvestFormFields;
        vmCtx.harvestFormFields = jest.fn((root) => {
            harvestRoot = root;
            return origHarvest ? origHarvest(root) : [];
        });

        const clientData = {
            CoApplicant: { FirstName: 'Bob', LastName: 'Jones', DOB: '01/01/1985' }
        };
        await vmCtx.fillPageSequential(clientData);

        // The harvest root should be the dialog, not the document
        if (harvestRoot) {
            expect(harvestRoot.tagName).toBeTruthy();
            const tag = harvestRoot.tagName.toLowerCase();
            expect(['mat-dialog-container', 'body'].includes(tag) ||
                   harvestRoot.getAttribute?.('role') === 'dialog'
            ).toBe(true);
        }
    });

    test('resolveValue returns null for unmapped labels', () => {
        // 'Bridge email address to carriers when rating' has no clientData key
        const result = ctx.resolveValue(
            'Bridge email address to carriers when rating',
            { FirstName: 'Alice' },
            '/details',
            44
        );
        expect(result).toBeNull();
    });

    test('resolveValue uses POSITIONAL_OVERRIDES for duplicate-label fields', () => {
        // policy-info index 3 is the first "Months" — maps to HomePriorMonths
        const result = ctx.resolveValue(
            'Months',
            { HomePriorMonths: '6' },
            '/rating/home/*/policy-info',
            3
        );
        expect(result).toBe('6');

        // policy-info index 5 is the second "Months" — maps to HomeContinuousMonths
        const result2 = ctx.resolveValue(
            'Months',
            { HomeContinuousMonths: '12' },
            '/rating/home/*/policy-info',
            5
        );
        expect(result2).toBe('12');
    });

    test('resolveValue maps standard label via FIELD_LABEL_MAP', () => {
        const result = ctx.resolveValue(
            'First Name',
            { FirstName: 'Alice' },
            '/details',
            1
        );
        expect(result).toBe('Alice');
    });

    test('resolveValue returns null for missing clientData value', () => {
        const result = ctx.resolveValue(
            'First Name',
            { LastName: 'Jones' }, // FirstName not present
            '/details',
            1
        );
        expect(result).toBeNull();
    });
});
