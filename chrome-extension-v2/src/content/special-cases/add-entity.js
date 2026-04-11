/**
 * Altech EZLynx V2 — Add-entity handler (Phase 2)
 *
 * Clicks the "Add Driver" / "Add Vehicle" / "Add Accident" (etc.)
 * buttons on the auto-rating pages until the target entity count
 * matches what's in `clientData`. Called eagerly by the orchestrator
 * BEFORE the main atom loop, so all wrappers are mounted and the
 * scoped locator can resolve `additional-driver-fields[N]` /
 * `vehicle-fields[N]` / the Nth incident's id templates without
 * re-entering mid-loop.
 *
 * ── Contracts ───────────────────────────────────────────────────────
 *
 * Each `addXxxIfNeeded(targetIndex)` is **idempotent**:
 *   - If the DOM already has >= targetIndex+1 wrappers for that scope,
 *     the function is a no-op and returns true immediately. Re-running
 *     the Fill button is safe.
 *   - Otherwise it clicks the corresponding Add button, polls for the
 *     new wrapper to mount (bounded by `pollPredicate` with a 5 s
 *     default), and returns true on success / false on timeout.
 *
 * `ensureEntities(routeKey, clientData)` is the orchestrator-facing
 * entrypoint. It walks the appropriate clientData array for the route
 * and calls addXxxIfNeeded() for each missing index in order. The
 * result is a per-entity counter object that the trace logs for
 * debugging.
 *
 * ── Button matching ─────────────────────────────────────────────────
 *
 * Prefer id-based lookups (`#add-accident-btn` etc.) where EZLynx has
 * them, and fall back to text-match on `<button>` textContent for
 * cases where recon hasn't produced a stable id yet. The fallback
 * logic mirrors `special-cases/entity-id-discovery.js` which uses the
 * same `Array.from(document.querySelectorAll('button'))` pattern.
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                pollPredicate: require('../waits/poll-predicate').pollPredicate,
            };
        }
        return {
            pollPredicate: global.AltechV2.waits.pollPredicate,
        };
    };

    // ── Button lookup helpers ───────────────────────────────────────────
    function findButtonById(id) {
        return document.getElementById(id) || null;
    }

    function findButtonByText(regex) {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find((b) => regex.test(b.textContent || '')) || null;
    }

    // ── Wrapper count helpers ───────────────────────────────────────────
    function driverWrapperCount() {
        return document.querySelectorAll('additional-driver-fields').length;
    }
    function vehicleWrapperCount() {
        return document.querySelectorAll('vehicle-fields').length;
    }
    // Incidents have no wrapper — count via the presence of the Nth
    // sub-type-specific id (e.g. `accidentDate-0`, `accidentDate-1`, …).
    function accidentCount() {
        let n = 0;
        while (document.getElementById(`accidentDate-${n}`)) n++;
        return n;
    }
    function violationCount() {
        let n = 0;
        while (document.getElementById(`violationDate-${n}`)) n++;
        return n;
    }
    function compLossCount() {
        let n = 0;
        while (document.getElementById(`compLoss-dateOfLoss-${n}`)) n++;
        return n;
    }

    // ── Generic add-loop ────────────────────────────────────────────────
    /**
     * @param {string}   label        Human label for trace output
     * @param {() => number} countFn  Returns current wrapper count
     * @param {() => Element|null} buttonFn  Returns the Add button element
     * @param {number}   targetIndex  Desired top index (0-based)
     * @param {object}   [opts]
     */
    async function addEntityIfNeeded(label, countFn, buttonFn, targetIndex, opts) {
        const { pollPredicate } = getDeps();
        const targetCount = targetIndex + 1;

        // Idempotent short-circuit.
        if (countFn() >= targetCount) return true;

        // Click the button once per missing entity, polling between clicks.
        while (countFn() < targetCount) {
            const btn = buttonFn();
            if (!btn) return false;
            const before = countFn();
            try { btn.click(); } catch (_) { return false; }

            const poll = await pollPredicate(
                () => countFn() > before,
                { timeoutMs: (opts && opts.timeoutMs) || 5000, intervalMs: 50 }
            );
            if (!poll.ok) return false;
        }
        return true;
    }

    // ── Public add-* helpers ────────────────────────────────────────────
    async function addDriverIfNeeded(targetIndex, opts) {
        return addEntityIfNeeded(
            'driver',
            driverWrapperCount,
            () => findButtonByText(/add\s+driver/i),
            targetIndex,
            opts,
        );
    }

    async function addVehicleIfNeeded(targetIndex, opts) {
        return addEntityIfNeeded(
            'vehicle',
            vehicleWrapperCount,
            () => findButtonByText(/add\s+vehicle/i),
            targetIndex,
            opts,
        );
    }

    async function addIncidentIfNeeded(subType, targetIndex, opts) {
        // subType: 'accident' | 'violation' | 'compLoss'
        let countFn, buttonFn;
        switch (subType) {
            case 'accident':
                countFn = accidentCount;
                buttonFn = () => findButtonById('add-accident-btn') || findButtonByText(/add\s+accident/i);
                break;
            case 'violation':
                countFn = violationCount;
                buttonFn = () => findButtonById('add-violation-btn') || findButtonByText(/add\s+violation/i);
                break;
            case 'compLoss':
                countFn = compLossCount;
                buttonFn = () => findButtonById('add-comp-loss-btn') || findButtonByText(/add\s+comp(-|\s)loss/i);
                break;
            default:
                return false;
        }
        return addEntityIfNeeded(`incident-${subType}`, countFn, buttonFn, targetIndex, opts);
    }

    /**
     * Normalize an incident Type string to one of the three sub-type keys.
     * Accepts 'Accident', 'accident', 'ACC', 'Violation', 'violation',
     * 'CompLoss', 'comp-loss', 'comp loss', 'CompLOSS', etc.
     * Returns null on unrecognized input.
     */
    function normalizeIncidentType(raw) {
        if (!raw) return null;
        const s = String(raw).toLowerCase().replace(/[\s_-]/g, '');
        if (s.startsWith('acc')) return 'accident';
        if (s.startsWith('vio')) return 'violation';
        if (s.startsWith('comp')) return 'compLoss';
        return null;
    }

    /**
     * Orchestrator-facing entrypoint. Walks clientData for the current
     * route and calls the corresponding add-*IfNeeded helpers serially.
     * Returns a per-entity counter object for trace logging. Never
     * throws — on failure, downstream atoms will FAIL at LOCATE
     * naturally which surfaces cleanly in the fill report.
     *
     * @param {string}   routeKey
     * @param {object}   clientData
     * @param {object}   [trace]  Optional trace for logging
     */
    async function ensureEntities(routeKey, clientData, trace) {
        const result = { drivers: 0, vehicles: 0, accident: 0, violation: 0, compLoss: 0, failures: [] };
        if (!clientData) return result;
        const log = (s, d) => { try { if (trace && trace.log) trace.log('*', s, d); } catch (_) {} };

        if (routeKey === 'drivers-compact' && Array.isArray(clientData.Drivers)) {
            for (let i = 0; i < clientData.Drivers.length; i++) {
                const ok = await addDriverIfNeeded(i);
                if (ok) result.drivers++;
                else result.failures.push({ scope: 'driver', index: i });
            }
            log('ENSURE_ENTITIES', { drivers: result.drivers, failures: result.failures.length });
            return result;
        }

        if (routeKey === 'vehicles-compact' && Array.isArray(clientData.Vehicles)) {
            for (let i = 0; i < clientData.Vehicles.length; i++) {
                const ok = await addVehicleIfNeeded(i);
                if (ok) result.vehicles++;
                else result.failures.push({ scope: 'vehicle', index: i });
            }
            log('ENSURE_ENTITIES', { vehicles: result.vehicles, failures: result.failures.length });
            return result;
        }

        if (routeKey === 'incidents' && Array.isArray(clientData.Incidents)) {
            // Per-type local counters must match registries/index.js order.
            const counters = { accident: 0, violation: 0, compLoss: 0 };
            for (const entry of clientData.Incidents) {
                const sub = normalizeIncidentType(entry && entry.Type);
                if (!sub) continue;
                const localIndex = counters[sub];
                const ok = await addIncidentIfNeeded(sub, localIndex);
                if (ok) { counters[sub]++; result[sub]++; }
                else { result.failures.push({ scope: sub, index: localIndex }); }
            }
            log('ENSURE_ENTITIES', {
                accident: result.accident,
                violation: result.violation,
                compLoss: result.compLoss,
                failures: result.failures.length,
            });
            return result;
        }

        return result;
    }

    const api = {
        addDriverIfNeeded,
        addVehicleIfNeeded,
        addIncidentIfNeeded,
        ensureEntities,
        normalizeIncidentType,
        // Exported for unit tests:
        _driverWrapperCount: driverWrapperCount,
        _vehicleWrapperCount: vehicleWrapperCount,
        _accidentCount: accidentCount,
        _violationCount: violationCount,
        _compLossCount: compLossCount,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.specialCases = global.AltechV2.specialCases || {};
        Object.assign(global.AltechV2.specialCases, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
