/**
 * Orchestrator multi-entity loop — drivers-compact end-to-end (Phase 2)
 *
 * Builds a jsdom stand-in of a drivers-compact page with TWO pre-mounted
 * `additional-driver-fields` wrappers, each containing a text input
 * tagged with the full `driver-{N}-*` id set from the base registry.
 * Runs `orchestrator.run('drivers-compact', clientData)` and asserts:
 *
 *   1. Both drivers' atoms reach DONE (no cross-contamination)
 *   2. driver 0's inputs receive driver 0's values (not driver 1's)
 *   3. The expanded keys `d0_firstName` / `d1_firstName` both appear in
 *      the trace with state DONE
 *   4. ensureEntities is a no-op because the wrappers already exist
 */
'use strict';

const { run } = require('../../src/content/orchestrator/index');
const { driverAtoms } = require('../../src/content/registries/drivers');

afterEach(() => { document.body.innerHTML = ''; });

function makeNgInput(container, id) {
    const el = document.createElement('input');
    el.id = id;
    el.classList.add('ng-pristine', 'ng-invalid');
    el.addEventListener('input', () => {
        el.classList.remove('ng-pristine', 'ng-invalid');
        el.classList.add('ng-dirty', 'ng-valid', 'ng-touched');
    });
    container.appendChild(el);
    return el;
}

// Plant a plain input for every id the driver registry references. Atoms
// whose source is empty on the given clientData will SKIP at PRECHECK
// without ever touching the element, so a plain input is enough — no need
// to model mat-selects / mat-toggles.
function plantAllDriverIds(wrapper, driverIndex) {
    for (const atom of driverAtoms) {
        const id = String(atom.idTemplate)
            .replace(/\{N\+1\}/g, String(driverIndex + 1))
            .replace(/\{N\}/g, String(driverIndex));
        makeNgInput(wrapper, id);
    }
}

function buildDriverPage(driverCount) {
    document.body.innerHTML = '';
    const wrappers = [];
    for (let i = 0; i < driverCount; i++) {
        const wrapper = document.createElement('additional-driver-fields');
        document.body.appendChild(wrapper);
        plantAllDriverIds(wrapper, i);
        wrappers.push(wrapper);
    }
    return wrappers;
}

describe('orchestrator.run — drivers-compact multi-entity', () => {
    it('fills both drivers into their own wrappers (no cross-contamination)', async () => {
        buildDriverPage(2);

        const clientData = {
            Drivers: [
                { FirstName: 'Alice', LastName: 'Ahern' },
                { FirstName: 'Bob',   LastName: 'Belmont' },
            ],
        };

        const report = await run('drivers-compact', clientData);

        // Both expected atoms reached DONE.
        const d0fn = report.entries.find((e) => e.atom === 'd0_firstName' && /DONE|SKIPPED|FAILED/.test(e.state));
        const d1fn = report.entries.find((e) => e.atom === 'd1_firstName' && /DONE|SKIPPED|FAILED/.test(e.state));
        const d0ln = report.entries.find((e) => e.atom === 'd0_lastName' && /DONE|SKIPPED|FAILED/.test(e.state));
        const d1ln = report.entries.find((e) => e.atom === 'd1_lastName' && /DONE|SKIPPED|FAILED/.test(e.state));

        expect(d0fn).toBeTruthy();
        expect(d1fn).toBeTruthy();
        expect(d0fn.state).toBe('DONE');
        expect(d1fn.state).toBe('DONE');
        expect(d0ln.state).toBe('DONE');
        expect(d1ln.state).toBe('DONE');

        // Cross-contamination check — each wrapper's input has the right value.
        const wrappers = document.querySelectorAll('additional-driver-fields');
        expect(wrappers[0].querySelector('#driver-0-first-name').value).toBe('Alice');
        expect(wrappers[0].querySelector('#driver-0-last-name').value).toBe('Ahern');
        expect(wrappers[1].querySelector('#driver-1-first-name').value).toBe('Bob');
        expect(wrappers[1].querySelector('#driver-1-last-name').value).toBe('Belmont');
    }, 15000);

    it('logs ENSURE_ENTITIES_DONE for drivers-compact route', async () => {
        buildDriverPage(2);
        const clientData = {
            Drivers: [
                { FirstName: 'Alice' },
                { FirstName: 'Bob' },
            ],
        };
        const report = await run('drivers-compact', clientData);
        const ensure = report.entries.find((e) => e.state === 'ENSURE_ENTITIES_DONE');
        expect(ensure).toBeTruthy();
    });

    it('empty Drivers array yields NO_REGISTRY trace entry', async () => {
        const report = await run('drivers-compact', { Drivers: [] });
        const noReg = report.entries.find((e) => e.state === 'NO_REGISTRY');
        expect(noReg).toBeTruthy();
    });
});
