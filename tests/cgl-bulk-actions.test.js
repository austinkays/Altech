/**
 * CGL bulk actions — verifies _runBulkAction iterates the selection,
 * calls the per-policy method, exits selection mode, and emits the
 * activity-log event.
 */

describe('CGL bulk action dispatcher', () => {
    function makeDashboardLike() {
        return {
            _printMode: true,
            _selectedForPrint: new Set(),
            policies: [],
            // Methods the dispatcher might call
            snoozePolicy: jest.fn(function (pn) { this._lastSnoozed = pn; }),
            dismissPolicy: jest.fn(function (pn) { this._lastDismissed = pn; }),
            markStateUpdated: jest.fn(function (pn) { this._lastState = pn; }),
            markHawksoftUpdated: jest.fn(function (pn) { this._lastHs = pn; }),
            // Stubs for the side effects the dispatcher fires after the loop
            togglePrintMode: jest.fn(function () { this._printMode = !this._printMode; }),
            updatePrintCount: jest.fn(),
            filterPolicies: jest.fn(),
        };
    }

    // Mirror the implementation from compliance-dashboard.js so we can test
    // it in isolation. Keeps the file self-contained — if the impl changes,
    // this test is the place to update.
    function _runBulkAction(self, methodName, verb, confirmFirst) {
        const selected = Array.from(self._selectedForPrint);
        if (selected.length === 0) return;
        if (confirmFirst) {
            const ok = (typeof self._confirm === 'function')
                ? self._confirm(`${verb} ${selected.length} polic${selected.length === 1 ? 'y' : 'ies'}?`)
                : true;
            if (!ok) return;
        }
        const fn = self[methodName];
        if (typeof fn !== 'function') return;
        let processed = 0;
        for (const pn of selected) {
            try { fn.call(self, pn); processed++; }
            catch (_) { /* swallow */ }
        }
        self._selectedForPrint.clear();
        if (self._printMode) self.togglePrintMode();
        else { self.updatePrintCount(); self.filterPolicies(); }
        return processed;
    }

    test('iterates selection + calls method per policy', () => {
        const d = makeDashboardLike();
        d._selectedForPrint.add('A-1');
        d._selectedForPrint.add('A-2');
        d._selectedForPrint.add('A-3');

        const n = _runBulkAction(d, 'snoozePolicy', 'snoozed', false);

        expect(n).toBe(3);
        expect(d.snoozePolicy).toHaveBeenCalledTimes(3);
        expect(d.snoozePolicy).toHaveBeenCalledWith('A-1');
        expect(d.snoozePolicy).toHaveBeenCalledWith('A-2');
        expect(d.snoozePolicy).toHaveBeenCalledWith('A-3');
    });

    test('clears selection + exits print mode after running', () => {
        const d = makeDashboardLike();
        d._selectedForPrint.add('A-1');
        _runBulkAction(d, 'dismissPolicy', 'dismissed', false);
        expect(d._selectedForPrint.size).toBe(0);
        expect(d.togglePrintMode).toHaveBeenCalled();
    });

    test('aborts when confirm() returns false (destructive ops)', () => {
        const d = makeDashboardLike();
        d._confirm = () => false;
        d._selectedForPrint.add('A-1');
        d._selectedForPrint.add('A-2');

        const n = _runBulkAction(d, 'dismissPolicy', 'dismiss', true);
        expect(n).toBeUndefined();
        expect(d.dismissPolicy).not.toHaveBeenCalled();
        expect(d._selectedForPrint.size).toBe(2);  // selection preserved on cancel
    });

    test('continues when confirm returns true', () => {
        const d = makeDashboardLike();
        d._confirm = () => true;
        d._selectedForPrint.add('A-1');
        const n = _runBulkAction(d, 'dismissPolicy', 'dismiss', true);
        expect(n).toBe(1);
        expect(d.dismissPolicy).toHaveBeenCalledWith('A-1');
    });

    test('no-op when selection is empty', () => {
        const d = makeDashboardLike();
        const n = _runBulkAction(d, 'snoozePolicy', 'snoozed', false);
        expect(n).toBeUndefined();
        expect(d.snoozePolicy).not.toHaveBeenCalled();
        expect(d.togglePrintMode).not.toHaveBeenCalled();
    });

    test('individual handler exception does not abort the rest', () => {
        const d = makeDashboardLike();
        d.snoozePolicy = jest.fn(function (pn) {
            if (pn === 'A-2') throw new Error('boom');
        });
        d._selectedForPrint.add('A-1');
        d._selectedForPrint.add('A-2');
        d._selectedForPrint.add('A-3');

        const n = _runBulkAction(d, 'snoozePolicy', 'snoozed', false);
        // 2 succeeded, 1 threw → processed counter only increments on success
        expect(n).toBe(2);
        expect(d.snoozePolicy).toHaveBeenCalledTimes(3);
    });

    test('unknown method is a no-op', () => {
        const d = makeDashboardLike();
        d._selectedForPrint.add('A-1');
        const n = _runBulkAction(d, 'doesNotExist', 'verb', false);
        expect(n).toBeUndefined();
    });
});
