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
    test('empty registry route produces a NO_REGISTRY trace entry', async () => {
        const report = await run('applicant-details', {});
        const noReg = report.entries.find((e) => e.state === 'NO_REGISTRY');
        expect(noReg).toBeTruthy();
        expect(report.counts.DONE).toBe(0);
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
