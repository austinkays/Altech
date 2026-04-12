/**
 * Phase 4 — fill-report-panel rendering
 *
 * Feeds a hand-crafted fill-trace report into renderReport() and asserts
 * the emitted DOM fragment carries:
 *   1. route + counts pills
 *   2. LexisNexis banner with human-readable labels
 *   3. collapsible per-atom groups by scope/route
 *   4. distinct state classes (done/skip/fail/blocked)
 *   5. FAILED rows show attempt count + reason
 *   6. multi-entity rows surface the scope + index
 */
'use strict';

const { renderReport, classifyAtom, reasonText } =
    require('../../src/content/ui/fill-report-panel');

afterEach(() => { document.body.innerHTML = ''; });

function mount(report) {
    const host = document.createElement('div');
    host.appendChild(renderReport(report));
    document.body.appendChild(host);
    return host;
}

function makeReport({
    routeKey = 'applicant-details',
    counts = { DONE: 2, SKIPPED: 1, FAILED: 1, BLOCKED: 0 },
    entries = [],
    atomIndex = {},
} = {}) {
    return { meta: { routeKey }, durationMs: 42, counts, entries, atomIndex };
}

describe('renderReport — empty / NO_REGISTRY', () => {
    test('null report → "No report yet." placeholder', () => {
        const host = mount(null);
        expect(host.querySelector('.av2-empty')).not.toBeNull();
    });

    test('NO_REGISTRY entry → renders route + note, no per-atom table', () => {
        const report = makeReport({
            counts: { DONE: 0, SKIPPED: 0, FAILED: 0, BLOCKED: 0 },
            entries: [{ t: 0, atom: '*', state: 'NO_REGISTRY', detail: null }],
        });
        const host = mount(report);
        expect(host.querySelector('.av2-route')).not.toBeNull();
        expect(host.querySelector('.av2-note')).not.toBeNull();
        expect(host.querySelector('.av2-atom-list')).toBeNull();
    });
});

describe('renderReport — counts + route', () => {
    test('shows four state pills with counts', () => {
        const host = mount(makeReport());
        const pills = host.querySelectorAll('.av2-counts .av2-pill');
        expect(pills.length).toBe(4);
        expect(pills[0].textContent).toContain('2');  // DONE
        expect(pills[1].textContent).toContain('1');  // SKIPPED
        expect(pills[2].textContent).toContain('1');  // FAILED
        expect(pills[3].textContent).toContain('0');  // BLOCKED
    });

    test('route label surfaces meta.routeKey', () => {
        const host = mount(makeReport({ routeKey: 'home-policy-info' }));
        expect(host.querySelector('.av2-val').textContent).toBe('home-policy-info');
    });
});

describe('renderReport — LexisNexis banner', () => {
    const entries = [
        { t: 0, atom: 'dateOfBirth',  state: 'SKIPPED', detail: { reason: 'lexis-nexis' } },
        { t: 0, atom: 'ssn',          state: 'SKIPPED', detail: { reason: 'lexis-nexis' } },
        { t: 0, atom: 'firstName',    state: 'DONE',    detail: { attempts: 1 } },
    ];
    const atomIndex = {
        dateOfBirth: { label: 'Date of Birth' },
        ssn:         { label: 'Social Security Number' },
        firstName:   { label: 'First Name' },
    };

    test('surfaces atom labels (not keys) in banner body', () => {
        const host = mount(makeReport({ entries, atomIndex, counts: { DONE: 1, SKIPPED: 2, FAILED: 0, BLOCKED: 0 } }));
        const banner = host.querySelector('.av2-lexis-banner');
        expect(banner).not.toBeNull();
        expect(banner.querySelector('.av2-lexis-title').textContent).toMatch(/2 fields locked by LexisNexis/);
        expect(banner.querySelector('.av2-lexis-body').textContent).toContain('Date of Birth');
        expect(banner.querySelector('.av2-lexis-body').textContent).toContain('Social Security Number');
    });

    test('singular "field" when exactly one lock', () => {
        const oneLock = [{ t: 0, atom: 'dateOfBirth', state: 'SKIPPED', detail: { reason: 'lexis-nexis' } }];
        const host = mount(makeReport({
            entries: oneLock,
            atomIndex,
            counts: { DONE: 0, SKIPPED: 1, FAILED: 0, BLOCKED: 0 },
        }));
        expect(host.querySelector('.av2-lexis-title').textContent).toMatch(/1 field locked/);
    });

    test('absent when no LexisNexis locks', () => {
        const host = mount(makeReport({
            entries: [{ t: 0, atom: 'firstName', state: 'DONE', detail: { attempts: 1 } }],
            counts: { DONE: 1, SKIPPED: 0, FAILED: 0, BLOCKED: 0 },
        }));
        expect(host.querySelector('.av2-lexis-banner')).toBeNull();
    });

    test('falls back to atom key when atomIndex is empty', () => {
        const host = mount(makeReport({
            entries: [{ t: 0, atom: 'dateOfBirth', state: 'SKIPPED', detail: { reason: 'lexis-nexis' } }],
            counts: { DONE: 0, SKIPPED: 1, FAILED: 0, BLOCKED: 0 },
        }));
        expect(host.querySelector('.av2-lexis-body').textContent).toContain('dateOfBirth');
    });
});

describe('renderReport — per-atom state styling', () => {
    const entries = [
        { t: 0, atom: 'firstName',  state: 'DONE',    detail: { attempts: 1 } },
        { t: 0, atom: 'nickname',   state: 'SKIPPED', detail: { reason: 'empty-source' } },
        { t: 0, atom: 'priorYears', state: 'FAILED',  detail: { reason: 'not-found', attempts: 3 } },
        { t: 0, atom: 'occupation', state: 'BLOCKED', detail: { blockedBy: 'industry' } },
    ];
    const atomIndex = {
        firstName:  { label: 'First Name' },
        nickname:   { label: 'Nickname' },
        priorYears: { label: 'Prior Employer Years' },
        occupation: { label: 'Occupation' },
    };

    test('each row carries a state-specific class', () => {
        const host = mount(makeReport({ entries, atomIndex, counts: { DONE: 1, SKIPPED: 1, FAILED: 1, BLOCKED: 1 } }));
        expect(host.querySelector('.av2-atom.av2-done')).not.toBeNull();
        expect(host.querySelector('.av2-atom.av2-skipped')).not.toBeNull();
        expect(host.querySelector('.av2-atom.av2-failed')).not.toBeNull();
        expect(host.querySelector('.av2-atom.av2-blocked')).not.toBeNull();
    });

    test('state badge classes distinguish DONE/SKIP/FAIL/BLOCK', () => {
        const host = mount(makeReport({ entries, atomIndex, counts: { DONE: 1, SKIPPED: 1, FAILED: 1, BLOCKED: 1 } }));
        expect(host.querySelector('.av2-badge.av2-state-done')).not.toBeNull();
        expect(host.querySelector('.av2-badge.av2-state-skip')).not.toBeNull();
        expect(host.querySelector('.av2-badge.av2-state-fail')).not.toBeNull();
        expect(host.querySelector('.av2-badge.av2-state-blk')).not.toBeNull();
    });

    test('FAILED row shows attempt count', () => {
        const host = mount(makeReport({ entries, atomIndex, counts: { DONE: 1, SKIPPED: 1, FAILED: 1, BLOCKED: 1 } }));
        const failedRow = host.querySelector('.av2-atom.av2-failed');
        expect(failedRow.textContent).toContain('3 attempts');
        expect(failedRow.textContent).toContain('Element not found'); // from REASON_LABEL
    });

    test('BLOCKED row shows the atom that blocked it', () => {
        const host = mount(makeReport({ entries, atomIndex, counts: { DONE: 1, SKIPPED: 1, FAILED: 1, BLOCKED: 1 } }));
        const blockedRow = host.querySelector('.av2-atom.av2-blocked');
        expect(blockedRow.textContent).toContain('Blocked by industry');
    });

    test('row label uses atom.label not the key', () => {
        const host = mount(makeReport({ entries, atomIndex, counts: { DONE: 1, SKIPPED: 1, FAILED: 1, BLOCKED: 1 } }));
        const labels = Array.from(host.querySelectorAll('.av2-atom-label')).map((e) => e.textContent);
        expect(labels).toEqual(expect.arrayContaining(['First Name', 'Nickname', 'Prior Employer Years', 'Occupation']));
    });
});

describe('renderReport — grouping by scope/route', () => {
    test('multi-entity atoms grouped by Driver N / Vehicle N', () => {
        const entries = [
            { t: 0, atom: 'd0_firstName', state: 'DONE',   detail: {} },
            { t: 0, atom: 'd1_firstName', state: 'FAILED', detail: { reason: 'not-found', attempts: 1 } },
            { t: 0, atom: 'v0_year',      state: 'DONE',   detail: {} },
        ];
        const atomIndex = {
            d0_firstName: { label: 'Driver First Name', scope: 'driver',  index: 0 },
            d1_firstName: { label: 'Driver First Name', scope: 'driver',  index: 1 },
            v0_year:      { label: 'Vehicle Year',      scope: 'vehicle', index: 0 },
        };
        const host = mount(makeReport({
            routeKey: 'drivers-compact',
            entries,
            atomIndex,
            counts: { DONE: 2, SKIPPED: 0, FAILED: 1, BLOCKED: 0 },
        }));
        const groupTitles = Array.from(host.querySelectorAll('.av2-group-title')).map((e) => e.textContent);
        expect(groupTitles).toContain('Driver 1');
        expect(groupTitles).toContain('Driver 2');
        expect(groupTitles).toContain('Vehicle 1');
    });

    test('groups with any issue are open; all-DONE groups stay collapsed', () => {
        const entries = [
            { t: 0, atom: 'd0_firstName', state: 'DONE',   detail: {} },
            { t: 0, atom: 'd1_firstName', state: 'FAILED', detail: { reason: 'not-found' } },
        ];
        const atomIndex = {
            d0_firstName: { label: 'Driver First Name', scope: 'driver', index: 0 },
            d1_firstName: { label: 'Driver First Name', scope: 'driver', index: 1 },
        };
        const host = mount(makeReport({
            routeKey: 'drivers-compact',
            entries,
            atomIndex,
            counts: { DONE: 1, SKIPPED: 0, FAILED: 1, BLOCKED: 0 },
        }));
        const groups = host.querySelectorAll('details.av2-group');
        const byTitle = {};
        groups.forEach((g) => {
            const t = g.querySelector('.av2-group-title').textContent;
            byTitle[t] = g;
        });
        expect(byTitle['Driver 1'].hasAttribute('open')).toBe(false);
        expect(byTitle['Driver 2'].hasAttribute('open')).toBe(true);
    });

    test('row shows "scope #N" meta line for multi-entity atoms', () => {
        const host = mount(makeReport({
            routeKey: 'drivers-compact',
            entries: [{ t: 0, atom: 'd1_firstName', state: 'FAILED', detail: { reason: 'not-found', attempts: 1 } }],
            atomIndex: { d1_firstName: { label: 'First Name', scope: 'driver', index: 1 } },
            counts: { DONE: 0, SKIPPED: 0, FAILED: 1, BLOCKED: 0 },
        }));
        const row = host.querySelector('.av2-atom.av2-failed');
        expect(row.querySelector('.av2-atom-meta').textContent).toContain('driver #2');
    });

    test('flat home route atoms grouped under "Home Policy Info"', () => {
        const host = mount(makeReport({
            routeKey: 'home-policy-info',
            entries: [{ t: 0, atom: 'swimmingPoolOnPremises', state: 'DONE', detail: {} }],
            atomIndex: { swimmingPoolOnPremises: { label: 'Pool on Premises' } },
            counts: { DONE: 1, SKIPPED: 0, FAILED: 0, BLOCKED: 0 },
        }));
        expect(host.querySelector('.av2-group-title').textContent).toBe('Home Policy Info');
    });
});

describe('classifyAtom — key-prefix fallback when no atomIndex meta', () => {
    test('d0_ → Driver 1', () => {
        expect(classifyAtom('d0_firstName', null, 'drivers-compact')).toEqual({
            group: 'driver-0', label: 'Driver 1',
        });
    });
    test('v2_ → Vehicle 3', () => {
        expect(classifyAtom('v2_year', null, 'vehicles-compact')).toEqual({
            group: 'vehicle-2', label: 'Vehicle 3',
        });
    });
    test('acc0_ / vio0_ / cl0_', () => {
        expect(classifyAtom('acc0_date', null, 'incidents').label).toBe('Accident 1');
        expect(classifyAtom('vio0_date', null, 'incidents').label).toBe('Violation 1');
        expect(classifyAtom('cl0_date',  null, 'incidents').label).toBe('Comp Loss 1');
    });
    test('unknown key on unknown route → "Other"', () => {
        expect(classifyAtom('weird', null, 'blah').group).toBe('other');
    });
});

describe('reasonText — user-facing translation', () => {
    test('maps internal reason strings to friendly labels', () => {
        expect(reasonText({ reason: 'lexis-nexis' })).toBe('Locked by LexisNexis');
        expect(reasonText({ reason: 'disabled' })).toBe('Field disabled');
        expect(reasonText({ reason: 'empty-source' })).toBe('No source value');
        expect(reasonText({ reason: 'not-found' })).toBe('Element not found');
    });
    test('blockedBy renders "Blocked by <atom>"', () => {
        expect(reasonText({ blockedBy: 'industry' })).toBe('Blocked by industry');
    });
    test('unknown reason passes through verbatim', () => {
        expect(reasonText({ reason: 'zalgo' })).toBe('zalgo');
    });
    test('null/empty detail → null', () => {
        expect(reasonText(null)).toBeNull();
        expect(reasonText({})).toBeNull();
    });
});
