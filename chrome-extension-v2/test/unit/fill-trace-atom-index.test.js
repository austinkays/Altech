/**
 * Phase 4 — FillTrace registerAtoms() + atomIndex in report
 *
 * Verifies the trace captures label / scope / index metadata for every
 * registered atom and that toReport() surfaces them as report.atomIndex.
 */
'use strict';

const { createFillTrace } = require('../../src/content/orchestrator/fill-trace');

describe('FillTrace registerAtoms → report.atomIndex', () => {
    test('captures label, scope, index, idTemplate, type for every atom', () => {
        const trace = createFillTrace({ routeKey: 'drivers-compact' });
        trace.registerAtoms([
            { key: 'd0_firstName', label: 'First Name', scope: 'driver', _index: 0,
              idTemplate: 'driver-0-first-name', type: 'text' },
            { key: 'd0_lastName',  label: 'Last Name',  scope: 'driver', _index: 0,
              idTemplate: 'driver-0-last-name',  type: 'text' },
        ]);
        trace.finalize('d0_firstName', 'DONE', { attempts: 1 });
        const report = trace.toReport();
        expect(report.atomIndex).toBeDefined();
        expect(report.atomIndex.d0_firstName).toEqual({
            label: 'First Name', scope: 'driver', index: 0,
            idTemplate: 'driver-0-first-name', type: 'text',
        });
        expect(report.atomIndex.d0_lastName.label).toBe('Last Name');
    });

    test('atoms without label default to the key itself', () => {
        const trace = createFillTrace({ routeKey: 'applicant-details' });
        trace.registerAtoms([{ key: 'someField', scope: null }]);
        const report = trace.toReport();
        expect(report.atomIndex.someField.label).toBe('someField');
    });

    test('registerAtoms is idempotent — later calls overwrite earlier meta', () => {
        const trace = createFillTrace({});
        trace.registerAtoms([{ key: 'foo', label: 'First Label' }]);
        trace.registerAtoms([{ key: 'foo', label: 'Second Label' }]);
        expect(trace.toReport().atomIndex.foo.label).toBe('Second Label');
    });

    test('non-array input is a safe no-op', () => {
        const trace = createFillTrace({});
        expect(() => trace.registerAtoms(null)).not.toThrow();
        expect(() => trace.registerAtoms(undefined)).not.toThrow();
        expect(() => trace.registerAtoms({})).not.toThrow();
        expect(trace.toReport().atomIndex).toEqual({});
    });

    test('reports still include counts, entries, durationMs, meta', () => {
        const trace = createFillTrace({ routeKey: 'x' });
        trace.registerAtoms([{ key: 'a', label: 'A' }]);
        trace.finalize('a', 'DONE', null);
        const r = trace.toReport();
        expect(r.meta.routeKey).toBe('x');
        expect(r.counts.DONE).toBe(1);
        expect(r.entries.length).toBeGreaterThan(0);
        expect(typeof r.durationMs).toBe('number');
    });
});
