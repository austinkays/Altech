/**
 * Altech EZLynx V2 — Atom executor test suite
 *
 * Integration-flavored unit tests. Each test constructs a mini DOM,
 * runs executeAtom against a registry-shaped spec, and asserts the
 * terminal state + trace entries.
 */
const { executeAtom, readSource } = require('../../src/content/orchestrator/atom-executor');
const { createFillTrace } = require('../../src/content/orchestrator/fill-trace');
const { run, findBlockedBy } = require('../../src/content/orchestrator/index');

afterEach(() => { document.body.innerHTML = ''; });

describe('readSource', () => {
    test('reads top-level keys', () => {
        expect(readSource({ FirstName: 'Jane' }, 'FirstName')).toBe('Jane');
    });

    test('reads dot-notation paths', () => {
        expect(readSource({ CoApplicant: { FirstName: 'John' } }, 'CoApplicant.FirstName'))
            .toBe('John');
    });

    test('returns undefined on broken paths', () => {
        expect(readSource({}, 'FirstName')).toBeUndefined();
        expect(readSource(null, 'FirstName')).toBeUndefined();
    });
});

function makeNgInput(id, classes) {
    const el = document.createElement('input');
    el.type = 'text';
    el.id = id;
    if (Array.isArray(classes)) classes.forEach((c) => el.classList.add(c));
    document.body.appendChild(el);
    // Simulate Angular's ControlValueAccessor: on input event, add ng-valid.
    el.addEventListener('input', () => {
        el.classList.remove('ng-pristine', 'ng-invalid');
        el.classList.add('ng-dirty', 'ng-valid', 'ng-touched');
    });
    return el;
}

describe('executeAtom — text atom happy path', () => {
    test('reaches DONE when fill succeeds and ng-valid transitions', async () => {
        makeNgInput('applicant-first-name', ['ng-pristine', 'ng-invalid']);
        const trace = createFillTrace();
        const atom = {
            key: 'firstName',
            idTemplate: 'applicant-first-name',
            type: 'text',
            source: 'FirstName',
            verify: 'ng-valid',
        };
        const result = await executeAtom(atom, {
            clientData: { FirstName: 'Jane' },
            ctx: {},
            trace,
        });
        expect(result.state).toBe('DONE');
        expect(trace.counts.DONE).toBe(1);
        expect(document.getElementById('applicant-first-name').value).toBe('Jane');
    });
});

describe('executeAtom — skip paths', () => {
    test('SKIPPED when source value is empty', async () => {
        makeNgInput('applicant-nickname', ['ng-pristine']);
        const trace = createFillTrace();
        const atom = {
            key: 'nickname',
            idTemplate: 'applicant-nickname',
            type: 'text',
            source: 'Nickname',
        };
        const result = await executeAtom(atom, {
            clientData: {},
            ctx: {},
            trace,
        });
        expect(result.state).toBe('SKIPPED');
        expect(result.reason).toBe('empty-source');
    });

    test('SKIPPED when element is disabled', async () => {
        const el = makeNgInput('applicant-dob', ['ng-invalid']);
        el.disabled = true;
        const trace = createFillTrace();
        const atom = {
            key: 'dob',
            idTemplate: 'applicant-dob',
            type: 'text',
            source: 'DOB',
        };
        const result = await executeAtom(atom, {
            clientData: { DOB: '01/01/2000' },
            ctx: {},
            trace,
        });
        expect(result.state).toBe('SKIPPED');
        expect(result.reason).toBe('disabled');
    });

    test('SKIPPED with lexis-nexis when disabled and nearby text mentions LexisNexis', async () => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = '<span>Disabled by LexisNexis</span><input id="applicant-dob" class="ng-invalid">';
        document.body.appendChild(wrapper);
        const el = document.getElementById('applicant-dob');
        el.disabled = true;
        const trace = createFillTrace();
        const atom = {
            key: 'dob',
            idTemplate: 'applicant-dob',
            type: 'text',
            source: 'DOB',
        };
        const result = await executeAtom(atom, {
            clientData: { DOB: '01/01/2000' },
            ctx: {},
            trace,
        });
        expect(result.state).toBe('SKIPPED');
        expect(result.reason).toBe('lexis-nexis');
    });

    test('FAILED with not-found when the element never appears', async () => {
        const trace = createFillTrace();
        const atom = {
            key: 'missing',
            idTemplate: 'no-such-field',
            type: 'text',
            source: 'FirstName',
            maxRetries: 0,
        };
        const result = await executeAtom(atom, {
            clientData: { FirstName: 'X' },
            ctx: {},
            trace,
        });
        expect(result.state).toBe('FAILED');
        expect(result.reason).toBe('not-found');
    }, 10000);
});

describe('executeAtom — skipIfAlreadyFilled', () => {
    test('SKIPPED when current value equals transformed target', async () => {
        const el = makeNgInput('applicant-first-name', ['ng-valid']);
        el.value = 'Jane';
        const trace = createFillTrace();
        const atom = {
            key: 'firstName',
            idTemplate: 'applicant-first-name',
            type: 'text',
            source: 'FirstName',
            skipIfAlreadyFilled: true,
        };
        const result = await executeAtom(atom, {
            clientData: { FirstName: 'Jane' },
            ctx: {},
            trace,
        });
        expect(result.state).toBe('SKIPPED');
        expect(result.reason).toBe('already-filled');
    });
});

describe('executeAtom — valueTransform', () => {
    test('applies deductible-style integer transform for currency strings', async () => {
        makeNgInput('allPerilsDeductible', ['ng-pristine', 'ng-invalid']);
        const trace = createFillTrace();
        const atom = {
            key: 'deductible',
            idTemplate: 'allPerilsDeductible',
            type: 'text',
            source: 'AllPerilsDeductible',
            valueTransform: (v) => String(v).replace(/[$,]/g, '').trim(),
        };
        const result = await executeAtom(atom, {
            clientData: { AllPerilsDeductible: '$1,000' },
            ctx: {},
            trace,
        });
        expect(result.state).toBe('DONE');
        expect(document.getElementById('allPerilsDeductible').value).toBe('1000');
    });
});

describe('orchestrator.run', () => {
    // 'applicant-details' now has 45 real atoms — use a Phase-2 route that
    // still has an empty registry so the NO_REGISTRY path is exercised.
    test('empty registry route produces a NO_REGISTRY trace entry', async () => {
        const report = await run('drivers-compact', {});
        const noReg = report.entries.find((e) => e.state === 'NO_REGISTRY');
        expect(noReg).toBeTruthy();
        expect(report.counts.DONE).toBe(0);
    });
});

describe('executeAtom — postFill clickVinLookup + waitForDecodeComplete (Phase 2)', () => {
    test('invokes the VIN lookup button and polls for #selected-year-{N}', async () => {
        // VIN input field
        const vinInput = makeNgInput('VIN-0', ['ng-pristine', 'ng-invalid']);
        // VIN lookup button — clicking it simulates Angular's VIN decoder
        // populating the year trigger after a short delay.
        const btn = document.createElement('button');
        btn.id = 'vin-lookup-btn-0';
        let clicked = 0;
        btn.addEventListener('click', () => {
            clicked++;
            setTimeout(() => {
                const year = document.createElement('span');
                year.id = 'selected-year-0';
                year.textContent = '2020';
                document.body.appendChild(year);
            }, 30);
        });
        document.body.appendChild(btn);

        const trace = createFillTrace();
        const atom = {
            key: 'v0_vin',
            idTemplate: 'VIN-0',
            type: 'text',
            source: 'VIN',
            _index: 0,
            _entity: { VIN: '1HGCM82633A004352' },
            postFill: [
                { action: 'clickVinLookup' },
                { action: 'waitForDecodeComplete' },
            ],
        };

        const result = await executeAtom(atom, { clientData: {}, ctx: { index: 0 }, trace });
        expect(result.state).toBe('DONE');
        expect(clicked).toBe(1);

        // Trace must include supported:true entries for both postFill actions.
        const clickEntry = trace.toReport().entries.find((e) =>
            e.state === 'POST_FILL' && e.detail && e.detail.action === 'clickVinLookup'
        );
        expect(clickEntry).toBeTruthy();
        expect(clickEntry.detail.supported).toBe(true);

        const waitEntry = trace.toReport().entries.find((e) =>
            e.state === 'POST_FILL' && e.detail && e.detail.action === 'waitForDecodeComplete'
        );
        expect(waitEntry).toBeTruthy();
        expect(waitEntry.detail.supported).toBe(true);
        expect(waitEntry.detail.decoded).toBe(true);

        // The vin input value reflects the _entity slice (not root clientData).
        expect(document.getElementById('VIN-0').value).toBe('1HGCM82633A004352');
    }, 15000);

    test('clickVinLookup logs supported:false when the button is missing', async () => {
        makeNgInput('VIN-0', ['ng-pristine', 'ng-invalid']);
        const trace = createFillTrace();
        const atom = {
            key: 'v0_vin',
            idTemplate: 'VIN-0',
            type: 'text',
            source: 'VIN',
            _index: 0,
            _entity: { VIN: 'XYZ' },
            postFill: [{ action: 'clickVinLookup' }],
            maxRetries: 0,
        };
        const result = await executeAtom(atom, { clientData: {}, ctx: { index: 0 }, trace });
        expect(result.state).toBe('DONE');
        const clickEntry = trace.toReport().entries.find((e) =>
            e.state === 'POST_FILL' && e.detail && e.detail.action === 'clickVinLookup'
        );
        expect(clickEntry.detail.supported).toBe(false);
        expect(clickEntry.detail.reason).toBe('button-not-found');
    });
});

describe('executeAtom — atom._entity per-entity source slicing (Phase 2)', () => {
    test('reads source from atom._entity instead of clientData root', async () => {
        makeNgInput('driver-1-first-name', ['ng-pristine', 'ng-invalid']);
        const trace = createFillTrace();
        const atom = {
            key: 'd1_firstName',
            idTemplate: 'driver-1-first-name',
            type: 'text',
            source: 'FirstName',
            _index: 1,
            _entity: { FirstName: 'Bob' },
            scope: 'driver',
        };
        // clientData deliberately has no FirstName at the root — the atom
        // must read from _entity.
        const result = await executeAtom(atom, { clientData: {}, ctx: { index: 1 }, trace });
        expect(result.state).toBe('DONE');
        expect(document.getElementById('driver-1-first-name').value).toBe('Bob');
    });
});

describe('findBlockedBy', () => {
    test('returns null when all preconditions are DONE', () => {
        const atom = { key: 'c', preconditions: [{ atom: 'a', state: 'DONE' }] };
        const term = new Map([['a', 'DONE']]);
        expect(findBlockedBy(atom, term)).toBeNull();
    });

    test('returns the failing precondition key', () => {
        const atom = { key: 'c', preconditions: [{ atom: 'a' }] };
        const term = new Map([['a', 'FAILED']]);
        expect(findBlockedBy(atom, term)).toBe('a');
    });

    test('returns the blocked-state precondition key', () => {
        const atom = { key: 'c', preconditions: [{ atom: 'b' }] };
        const term = new Map([['b', 'BLOCKED']]);
        expect(findBlockedBy(atom, term)).toBe('b');
    });

    test('requires DONE when precondition specifies state: DONE', () => {
        const atom = { key: 'c', preconditions: [{ atom: 'a', state: 'DONE' }] };
        const term = new Map([['a', 'SKIPPED']]);
        expect(findBlockedBy(atom, term)).toBe('a');
    });
});
