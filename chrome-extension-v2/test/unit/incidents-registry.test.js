/**
 * Incidents registry — three sub-registries + per-type expansion (Phase 2)
 *
 * Key invariants:
 *   - 8 accident / 3 violation / 5 compLoss atoms in the base registries
 *   - Legacy `Amount-{N}` id (no `compLoss-` prefix) lives ONLY in compLoss
 *   - `Type` field on clientData.Incidents[] entries routes each atom
 *     to the correct sub-registry via a per-type local index counter
 *   - Mixed incident types don't collide across sub-types after expansion
 */
'use strict';

const {
    accidentAtoms, violationAtoms, compLossAtoms,
} = require('../../src/content/registries/incidents');
const { getRegistry, normalizeIncidentType } = require('../../src/content/registries');
const { topoSort } = require('../../src/content/orchestrator/dependency-graph');

describe('Incidents registry — base atom counts', () => {
    it('accident sub-registry has 8 atoms', () => {
        expect(accidentAtoms.length).toBe(8);
    });
    it('violation sub-registry has 3 atoms', () => {
        expect(violationAtoms.length).toBe(3);
    });
    it('compLoss sub-registry has 5 atoms', () => {
        expect(compLossAtoms.length).toBe(5);
    });
});

describe('Incidents registry — legacy Amount-{N} in compLoss only', () => {
    it('compLoss has an atom with idTemplate Amount-{N}', () => {
        const amt = compLossAtoms.find((a) => a.idTemplate === 'Amount-{N}');
        expect(amt).toBeTruthy();
        expect(amt.key).toBe('amount');
    });

    it('neither accident nor violation have Amount-{N}', () => {
        expect(accidentAtoms.find((a) => a.idTemplate === 'Amount-{N}')).toBeUndefined();
        expect(violationAtoms.find((a) => a.idTemplate === 'Amount-{N}')).toBeUndefined();
    });
});

describe('Incidents registry — base shape', () => {
    const allBase = [
        ['accident',  accidentAtoms],
        ['violation', violationAtoms],
        ['compLoss',  compLossAtoms],
    ];

    for (const [label, atoms] of allBase) {
        it(`${label} — no duplicate keys within sub-registry`, () => {
            const keys = atoms.map((a) => a.key);
            expect(new Set(keys).size).toBe(keys.length);
        });
        it(`${label} — every atom has key / source / idTemplate / type`, () => {
            for (const a of atoms) {
                expect(typeof a.key).toBe('string');
                expect(typeof a.source).toBe('string');
                expect(typeof a.idTemplate).toBe('string');
                expect(typeof a.type).toBe('string');
            }
        });
    }

    it('accident driver atom carries skipIfEqualsDefault', () => {
        const driver = accidentAtoms.find((a) => a.key === 'driver');
        expect(driver.skipIfEqualsDefault).toBe(true);
    });
});

describe('Incidents registry — normalizeIncidentType', () => {
    it('normalizes the three canonical forms', () => {
        expect(normalizeIncidentType('Accident')).toBe('accident');
        expect(normalizeIncidentType('Violation')).toBe('violation');
        expect(normalizeIncidentType('CompLoss')).toBe('compLoss');
    });

    it('is case- and whitespace-insensitive', () => {
        expect(normalizeIncidentType('accident')).toBe('accident');
        expect(normalizeIncidentType('ACCIDENT')).toBe('accident');
        expect(normalizeIncidentType('comp loss')).toBe('compLoss');
        expect(normalizeIncidentType('comp-loss')).toBe('compLoss');
        expect(normalizeIncidentType('comp_loss')).toBe('compLoss');
    });

    it('returns null for unrecognized input', () => {
        expect(normalizeIncidentType('claim')).toBeNull();
        expect(normalizeIncidentType('')).toBeNull();
        expect(normalizeIncidentType(null)).toBeNull();
    });
});

describe('Incidents registry — routing and per-type local index', () => {
    const mixedIncidents = {
        Incidents: [
            { Type: 'Accident',  Date: '2024-01-15', Description: 'Rear-end' },
            { Type: 'Accident',  Date: '2024-08-03', Description: 'Parking lot' },
            { Type: 'Violation', Date: '2023-11-12', Description: 'Speeding' },
            { Type: 'CompLoss',  Date: '2025-02-20', Description: 'Hail' },
        ],
    };

    it('empty Incidents returns []', () => {
        expect(getRegistry('incidents', { Incidents: [] })).toEqual([]);
    });

    it('expands each incident entry to its sub-registry atoms', () => {
        const atoms = getRegistry('incidents', mixedIncidents);
        expect(atoms.length).toBe(
            accidentAtoms.length * 2 +
            violationAtoms.length * 1 +
            compLossAtoms.length * 1
        );
    });

    it('assigns per-type local indices starting at 0 for each sub-type', () => {
        const atoms = getRegistry('incidents', mixedIncidents);
        // Accident 0 + Accident 1 (local indices 0 and 1)
        expect(atoms.find((a) => a.key === 'acc0_date')).toBeTruthy();
        expect(atoms.find((a) => a.key === 'acc1_date')).toBeTruthy();
        // Violation 0 (local index 0, not 2)
        expect(atoms.find((a) => a.key === 'vio0_date')).toBeTruthy();
        expect(atoms.find((a) => a.key === 'vio1_date')).toBeUndefined();
        // CompLoss 0 (local index 0, not 3)
        expect(atoms.find((a) => a.key === 'cl0_dateOfLoss')).toBeTruthy();
    });

    it('pre-bakes {N} into sub-type-specific ids', () => {
        const atoms = getRegistry('incidents', mixedIncidents);
        expect(atoms.find((a) => a.key === 'acc0_date').idTemplate).toBe('accidentDate-0');
        expect(atoms.find((a) => a.key === 'acc1_date').idTemplate).toBe('accidentDate-1');
        expect(atoms.find((a) => a.key === 'vio0_date').idTemplate).toBe('violationDate-0');
        expect(atoms.find((a) => a.key === 'cl0_dateOfLoss').idTemplate).toBe('compLoss-dateOfLoss-0');
    });

    it('legacy Amount-{N} only appears on cl*_amount atoms (no acc/vio collision)', () => {
        const atoms = getRegistry('incidents', mixedIncidents);
        const amountAtoms = atoms.filter((a) => a.idTemplate && a.idTemplate.startsWith('Amount-'));
        expect(amountAtoms.length).toBe(1);
        expect(amountAtoms[0].key).toBe('cl0_amount');
        expect(amountAtoms[0].idTemplate).toBe('Amount-0');
        expect(amountAtoms[0].scope).toBe('compLoss');
    });

    it('unrecognized Type values are silently skipped', () => {
        const weird = {
            Incidents: [
                { Type: 'Accident',  Date: '2024-01-15' },
                { Type: 'Bigfoot',   Date: '2024-02-15' },
                { Type: 'Violation', Date: '2024-03-15' },
            ],
        };
        const atoms = getRegistry('incidents', weird);
        expect(atoms.length).toBe(accidentAtoms.length + violationAtoms.length);
    });

    it('globally-unique keys after expansion of mixed incidents', () => {
        const atoms = getRegistry('incidents', mixedIncidents);
        const keys = atoms.map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('expanded list topo-sorts without errors', () => {
        const atoms = getRegistry('incidents', mixedIncidents);
        expect(() => topoSort(atoms)).not.toThrow();
    });

    it('each expanded atom carries _entity = its source incident entry', () => {
        const atoms = getRegistry('incidents', mixedIncidents);
        const acc0 = atoms.find((a) => a.key === 'acc0_date');
        const acc1 = atoms.find((a) => a.key === 'acc1_date');
        expect(acc0._entity).toEqual(mixedIncidents.Incidents[0]);
        expect(acc1._entity).toEqual(mixedIncidents.Incidents[1]);
    });
});
