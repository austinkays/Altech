/**
 * Altech EZLynx V2 — Orchestrator parallel-batching tests
 *
 * Covers the new collectParallelBatch / isParallelizable helpers and the
 * end-to-end behavior that consecutive non-overlay atoms with no
 * preconditions run together via Promise.all rather than serially.
 */
const {
    isParallelizable,
    collectParallelBatch,
} = require('../../src/content/orchestrator/index');

describe('isParallelizable', () => {
    test.each([
        ['text', true],
        ['phone', true],
        ['ssn', true],
        ['number', true],
        ['currency', true],
        ['date', true],
    ])('%s atom is parallelizable when no preconditions/postFill', (type, expected) => {
        expect(isParallelizable({ key: 'k', type })).toBe(expected);
    });

    test.each([
        ['mat-select'],
        ['mat-toggle'],
        ['mat-radio'],
        ['unknown'],
    ])('%s atom is NOT parallelizable', (type) => {
        expect(isParallelizable({ key: 'k', type })).toBe(false);
    });

    test('atom with preconditions is not parallelizable', () => {
        expect(isParallelizable({
            key: 'k', type: 'text', preconditions: [{ atom: 'other' }],
        })).toBe(false);
    });

    test('atom with postFill is not parallelizable', () => {
        expect(isParallelizable({
            key: 'k', type: 'text', postFill: [{ action: 'dismissPacContainer' }],
        })).toBe(false);
    });

    test('empty preconditions / postFill arrays are still parallelizable', () => {
        expect(isParallelizable({
            key: 'k', type: 'text', preconditions: [], postFill: [],
        })).toBe(true);
    });
});

describe('collectParallelBatch', () => {
    test('returns consecutive parallelizable atoms only', () => {
        const sorted = [
            { key: 'a', type: 'text' },
            { key: 'b', type: 'phone' },
            { key: 'c', type: 'mat-select' }, // boundary
            { key: 'd', type: 'text' },
        ];
        expect(collectParallelBatch(sorted, 0).map((a) => a.key)).toEqual(['a', 'b']);
    });

    test('returns single-atom batch for the mat-select boundary', () => {
        const sorted = [
            { key: 'c', type: 'mat-select' },
            { key: 'd', type: 'text' },
        ];
        expect(collectParallelBatch(sorted, 0)).toEqual([]);
    });

    test('starts fresh batch after a boundary', () => {
        const sorted = [
            { key: 'a', type: 'mat-select' },
            { key: 'b', type: 'text' },
            { key: 'c', type: 'date' },
            { key: 'd', type: 'mat-toggle' },
        ];
        expect(collectParallelBatch(sorted, 1).map((a) => a.key)).toEqual(['b', 'c']);
    });

    test('precondition breaks the batch even between two text atoms', () => {
        const sorted = [
            { key: 'a', type: 'text' },
            { key: 'b', type: 'text', preconditions: [{ atom: 'a' }] },
        ];
        expect(collectParallelBatch(sorted, 0).map((a) => a.key)).toEqual(['a']);
    });
});

describe('orchestrator parallel batching — end to end', () => {
    test('parallelizable atoms truly run concurrently', async () => {
        // We can't import `run` and use it cleanly without Angular elements,
        // so we replicate the batching behavior with a stub executeAtom and
        // measure parallelism via call interleaving.
        const calls = [];
        const slowExec = (key, ms) => async () => {
            calls.push('start:' + key);
            await new Promise((r) => setTimeout(r, ms));
            calls.push('end:' + key);
            return { state: 'DONE' };
        };
        const atoms = [
            { key: 'a', type: 'text', exec: slowExec('a', 30) },
            { key: 'b', type: 'text', exec: slowExec('b', 30) },
            { key: 'c', type: 'text', exec: slowExec('c', 30) },
        ];

        // Walk the same way as run(): collectParallelBatch + Promise.all.
        let cursor = 0;
        while (cursor < atoms.length) {
            const batch = collectParallelBatch(atoms, cursor);
            if (batch.length > 1) {
                await Promise.all(batch.map((a) => a.exec()));
                cursor += batch.length;
            } else {
                await atoms[cursor].exec();
                cursor += 1;
            }
        }

        // All three started before any finished — proves concurrency.
        const startA = calls.indexOf('start:a');
        const startB = calls.indexOf('start:b');
        const startC = calls.indexOf('start:c');
        const endA = calls.indexOf('end:a');
        expect(startA).toBeLessThan(endA);
        expect(startB).toBeLessThan(endA);
        expect(startC).toBeLessThan(endA);
    });
});
