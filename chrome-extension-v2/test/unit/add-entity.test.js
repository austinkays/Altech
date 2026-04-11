/**
 * add-entity handler tests (Phase 2)
 *
 * Covers:
 *   - addDriverIfNeeded(N) — clicks "Add Driver" when container count < N+1,
 *     polls until new additional-driver-fields wrapper mounts, returns true
 *   - Idempotency: no-op when wrapper count already ≥ target
 *   - normalizeIncidentType
 *   - ensureEntities() drives the per-sub-type counter for incidents
 *   - Graceful failure: no button → returns false (no throw)
 */
'use strict';

const {
    addDriverIfNeeded, addVehicleIfNeeded, addIncidentIfNeeded,
    ensureEntities, normalizeIncidentType,
    _driverWrapperCount, _vehicleWrapperCount,
} = require('../../src/content/special-cases/add-entity');

afterEach(() => { document.body.innerHTML = ''; });

function makeButton(text, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    if (onClick) btn.addEventListener('click', onClick);
    document.body.appendChild(btn);
    return btn;
}

function makeDriverWrapper() {
    const el = document.createElement('additional-driver-fields');
    document.body.appendChild(el);
    return el;
}

function makeVehicleWrapper() {
    const el = document.createElement('vehicle-fields');
    document.body.appendChild(el);
    return el;
}

describe('normalizeIncidentType', () => {
    it('canonicalizes accident/violation/compLoss', () => {
        expect(normalizeIncidentType('Accident')).toBe('accident');
        expect(normalizeIncidentType('violation')).toBe('violation');
        expect(normalizeIncidentType('Comp Loss')).toBe('compLoss');
        expect(normalizeIncidentType('comp-loss')).toBe('compLoss');
    });
    it('returns null for garbage', () => {
        expect(normalizeIncidentType(null)).toBeNull();
        expect(normalizeIncidentType('foo')).toBeNull();
    });
});

describe('addDriverIfNeeded', () => {
    it('no-op (returns true immediately) when wrapper count already ≥ target+1', async () => {
        makeDriverWrapper();
        makeDriverWrapper();
        expect(_driverWrapperCount()).toBe(2);

        let clicks = 0;
        makeButton('Add Driver', () => { clicks++; });
        const ok = await addDriverIfNeeded(1); // want index 1 → need 2 wrappers, have 2
        expect(ok).toBe(true);
        expect(clicks).toBe(0);
    });

    it('clicks Add Driver and polls until wrapper mounts', async () => {
        makeDriverWrapper(); // start with 1
        expect(_driverWrapperCount()).toBe(1);

        const btn = makeButton('Add Driver', () => {
            setTimeout(() => { makeDriverWrapper(); }, 30);
        });
        const ok = await addDriverIfNeeded(1);
        expect(ok).toBe(true);
        expect(_driverWrapperCount()).toBe(2);
    });

    it('returns false when the Add Driver button does not exist', async () => {
        makeDriverWrapper();
        const ok = await addDriverIfNeeded(1, { timeoutMs: 500 });
        expect(ok).toBe(false);
    });

    it('returns false on timeout if click does not produce a new wrapper', async () => {
        makeDriverWrapper();
        makeButton('Add Driver', () => { /* noop */ });
        jest.useFakeTimers();
        const promise = addDriverIfNeeded(1, { timeoutMs: 200 });
        jest.advanceTimersByTime(500);
        const ok = await promise;
        jest.useRealTimers();
        expect(ok).toBe(false);
    });
});

describe('addVehicleIfNeeded', () => {
    it('idempotent when sufficient wrappers exist', async () => {
        makeVehicleWrapper();
        makeVehicleWrapper();
        let clicks = 0;
        makeButton('Add Vehicle', () => { clicks++; });
        const ok = await addVehicleIfNeeded(1);
        expect(ok).toBe(true);
        expect(clicks).toBe(0);
    });

    it('clicks Add Vehicle and polls until wrapper mounts', async () => {
        makeVehicleWrapper();
        makeButton('Add Vehicle', () => {
            setTimeout(() => { makeVehicleWrapper(); }, 20);
        });
        const ok = await addVehicleIfNeeded(1);
        expect(ok).toBe(true);
        expect(_vehicleWrapperCount()).toBe(2);
    });
});

describe('addIncidentIfNeeded', () => {
    function makeAccidentInput(index) {
        const input = document.createElement('input');
        input.id = 'accidentDate-' + index;
        document.body.appendChild(input);
    }

    function makeCompLossInput(index) {
        const input = document.createElement('input');
        input.id = 'compLoss-dateOfLoss-' + index;
        document.body.appendChild(input);
    }

    it('no-op when accident N already exists', async () => {
        makeAccidentInput(0);
        let clicks = 0;
        const btn = document.createElement('button');
        btn.id = 'add-accident-btn';
        btn.addEventListener('click', () => { clicks++; });
        document.body.appendChild(btn);

        const ok = await addIncidentIfNeeded('accident', 0);
        expect(ok).toBe(true);
        expect(clicks).toBe(0);
    });

    it('clicks #add-accident-btn and polls until new accidentDate-N exists', async () => {
        const btn = document.createElement('button');
        btn.id = 'add-accident-btn';
        btn.addEventListener('click', () => {
            setTimeout(() => makeAccidentInput(0), 20);
        });
        document.body.appendChild(btn);

        const ok = await addIncidentIfNeeded('accident', 0);
        expect(ok).toBe(true);
        expect(document.getElementById('accidentDate-0')).toBeTruthy();
    });

    it('compLoss uses compLoss-dateOfLoss-{N} for counting', async () => {
        const btn = document.createElement('button');
        btn.id = 'add-comp-loss-btn';
        btn.addEventListener('click', () => {
            setTimeout(() => makeCompLossInput(0), 20);
        });
        document.body.appendChild(btn);

        const ok = await addIncidentIfNeeded('compLoss', 0);
        expect(ok).toBe(true);
        expect(document.getElementById('compLoss-dateOfLoss-0')).toBeTruthy();
    });

    it('returns false for unknown sub-type', async () => {
        const ok = await addIncidentIfNeeded('bigfoot', 0);
        expect(ok).toBe(false);
    });
});

describe('ensureEntities — drivers route', () => {
    it('clicks Add Driver once per missing driver', async () => {
        // Need 2 drivers. Start with 0 wrappers.
        let clicks = 0;
        makeButton('Add Driver', () => {
            clicks++;
            setTimeout(() => makeDriverWrapper(), 10);
        });

        const result = await ensureEntities('drivers-compact', {
            Drivers: [{ FirstName: 'A' }, { FirstName: 'B' }],
        });
        expect(result.drivers).toBe(2);
        expect(clicks).toBe(2);
        expect(_driverWrapperCount()).toBe(2);
    });

    it('no-op when all drivers already present', async () => {
        makeDriverWrapper();
        makeDriverWrapper();
        let clicks = 0;
        makeButton('Add Driver', () => { clicks++; });

        const result = await ensureEntities('drivers-compact', {
            Drivers: [{ FirstName: 'A' }, { FirstName: 'B' }],
        });
        expect(result.drivers).toBe(2);
        expect(clicks).toBe(0);
    });

    it('empty Drivers list → zero actions', async () => {
        const result = await ensureEntities('drivers-compact', { Drivers: [] });
        expect(result.drivers).toBe(0);
        expect(result.failures).toEqual([]);
    });
});

describe('ensureEntities — incidents route with per-type counter', () => {
    it('clicks the correct sub-type button in the correct order', async () => {
        const clicks = { accident: 0, violation: 0, compLoss: 0 };
        const btnA = document.createElement('button'); btnA.id = 'add-accident-btn';
        btnA.addEventListener('click', () => {
            clicks.accident++;
            setTimeout(() => {
                const i = document.createElement('input');
                i.id = 'accidentDate-' + (clicks.accident - 1);
                document.body.appendChild(i);
            }, 10);
        });
        document.body.appendChild(btnA);

        const btnV = document.createElement('button'); btnV.id = 'add-violation-btn';
        btnV.addEventListener('click', () => {
            clicks.violation++;
            setTimeout(() => {
                const i = document.createElement('input');
                i.id = 'violationDate-' + (clicks.violation - 1);
                document.body.appendChild(i);
            }, 10);
        });
        document.body.appendChild(btnV);

        const btnC = document.createElement('button'); btnC.id = 'add-comp-loss-btn';
        btnC.addEventListener('click', () => {
            clicks.compLoss++;
            setTimeout(() => {
                const i = document.createElement('input');
                i.id = 'compLoss-dateOfLoss-' + (clicks.compLoss - 1);
                document.body.appendChild(i);
            }, 10);
        });
        document.body.appendChild(btnC);

        const result = await ensureEntities('incidents', {
            Incidents: [
                { Type: 'Accident', Date: '1' },
                { Type: 'Accident', Date: '2' },
                { Type: 'Violation', Date: '3' },
                { Type: 'CompLoss', Date: '4' },
            ],
        });

        expect(clicks.accident).toBe(2);
        expect(clicks.violation).toBe(1);
        expect(clicks.compLoss).toBe(1);
        expect(result.accident).toBe(2);
        expect(result.violation).toBe(1);
        expect(result.compLoss).toBe(1);
    });
});
