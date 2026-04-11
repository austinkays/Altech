/**
 * Altech EZLynx V2 — Dependency graph test suite
 */
const { topoSort, DependencyGraphError } = require('../../src/content/orchestrator/dependency-graph');

describe('topoSort', () => {
    test('returns [] for empty input', () => {
        expect(topoSort([])).toEqual([]);
    });

    test('preserves order when no preconditions exist', () => {
        const atoms = [
            { key: 'a' },
            { key: 'b' },
            { key: 'c' },
        ];
        const sorted = topoSort(atoms);
        expect(sorted.map((a) => a.key)).toEqual(['a', 'b', 'c']);
    });

    test('orders dependents after their dependencies', () => {
        const atoms = [
            { key: 'occupation', preconditions: [{ atom: 'industry', state: 'DONE' }] },
            { key: 'industry' },
            { key: 'occupation-years', preconditions: [{ atom: 'occupation' }] },
        ];
        const sorted = topoSort(atoms);
        const order = sorted.map((a) => a.key);
        expect(order.indexOf('industry')).toBeLessThan(order.indexOf('occupation'));
        expect(order.indexOf('occupation')).toBeLessThan(order.indexOf('occupation-years'));
    });

    test('throws DependencyGraphError on duplicate keys', () => {
        expect(() => topoSort([{ key: 'a' }, { key: 'a' }]))
            .toThrow(DependencyGraphError);
    });

    test('throws on precondition referencing an unknown atom', () => {
        expect(() => topoSort([
            { key: 'a', preconditions: [{ atom: 'missing' }] },
        ])).toThrow(/unknown atom/);
    });

    test('throws on a direct cycle', () => {
        expect(() => topoSort([
            { key: 'a', preconditions: [{ atom: 'b' }] },
            { key: 'b', preconditions: [{ atom: 'a' }] },
        ])).toThrow(/cycle/);
    });

    test('throws on self-dependency', () => {
        expect(() => topoSort([
            { key: 'a', preconditions: [{ atom: 'a' }] },
        ])).toThrow(/itself/);
    });

    test('throws on a 3-cycle', () => {
        expect(() => topoSort([
            { key: 'a', preconditions: [{ atom: 'b' }] },
            { key: 'b', preconditions: [{ atom: 'c' }] },
            { key: 'c', preconditions: [{ atom: 'a' }] },
        ])).toThrow(/cycle/);
    });

    test('throws on atom missing key', () => {
        expect(() => topoSort([{ foo: 'bar' }])).toThrow(/missing key/);
    });
});
