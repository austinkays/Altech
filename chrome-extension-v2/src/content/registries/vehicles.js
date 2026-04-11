/**
 * Altech EZLynx V2 — Vehicles registry (~21 atoms per vehicle) — Phase 2
 *
 * Covers the `/rating/auto/{id}/vehicles-compact` page. Every atom is
 * container-scoped to `vehicle-fields[N]` via `scope: 'vehicle'`.
 *
 * This file exports the BASE atom list. `registries/index.js` expands it
 * per-vehicle via `expandEntityAtoms(vehicleAtoms, 'vehicle', 'v', i,
 * clientData.Vehicles[i])`.
 *
 * ── VIN decoder short-circuit (plan §6.3, §7.1) ─────────────────────────
 *
 *   1. `vin` atom fills first and carries
 *      `postFill: [{action:'clickVinLookup'},{action:'waitForDecodeComplete'}]`.
 *      clickVinLookup clicks `#vin-lookup-btn-{N}`; waitForDecodeComplete
 *      polls `#selected-year-{N}` until it has a value (10 s timeout).
 *   2. Year/Make/Model/SubModel/PurchaseDate/PassiveRestraints/
 *      AntiLockBrakes/CostNewValue all carry BOTH:
 *        - `preconditions: [{ atom: 'vin', state: 'DONE' }]` — the VIN
 *          atom's POST_FILL is awaited before these run (the atom
 *          executor awaits runPostFill before VERIFY → DONE), so by the
 *          time topo-sort lets these run, decode has either succeeded or
 *          timed out.
 *        - `skipIfAlreadyFilled: true` — after a successful decode,
 *          Angular has pre-populated the value, so the atom SKIPs with
 *          reason `already-filled`. On decode failure/timeout, the atom
 *          fills normally from `clientData.Vehicles[i]`.
 *
 *   Together, these two flags give us the short-circuit: one fill
 *   primitive, zero custom cascade logic, and no race — the race would
 *   only reopen if the POST_FILL wait didn't gate subsequent atoms.
 *
 * ── Legacy exception: `textV1CostNew` (plan §6.3) ───────────────────────
 *   Cost New uses a legacy hardcoded id that does NOT follow the
 *   `selected-*-{N}` pattern. Per the plan note "hand-curated in
 *   registry" and the V0.7.2 behaviour, the base-registry atom hardcodes
 *   `textV1CostNew` — meaning it only targets vehicle **index 0**. For
 *   vehicles 1+, the expanded atom's idTemplate will STILL be
 *   `textV1CostNew` (no {N} to substitute), causing it to lose the race
 *   to vehicle 0's element. That's fine for Phase 2 because:
 *     (a) The atom is gated by `preconditions: [vin DONE]` and carries
 *         `skipIfAlreadyFilled: true`, so a successful decode skips it.
 *     (b) Phase 4 polish + Recon Tool will flag vehicle-index>0 Cost New
 *         as a known gap in registry-audit.
 *     (c) Most quotes have 1–2 vehicles; vehicle 0 Cost New is the
 *         common case we need working now.
 */
(function (global) {
    'use strict';

    const vehicleAtoms = [
        // ── VIN (gate atom) ────────────────────────────────────────────────
        { key: 'vin',                       source: 'VIN',                  label: 'VIN',
          idTemplate: 'VIN-{N}',                                            type: 'text',
          postFill: [
              { action: 'clickVinLookup' },
              { action: 'waitForDecodeComplete' },
          ] },

        // ── VIN-decoded fields (skipIfAlreadyFilled + precondition on vin) ─
        // Year / Make / Model / SubModel are mat-select triggers whose
        // display text populates after decode. Use ng-valid verify with
        // skipIfAlreadyFilled sniffing the display value.
        { key: 'year',          source: 'Year',               label: 'Year',
          idTemplate: 'selected-year-{N}',              type: 'mat-select',
          skipIfAlreadyFilled: true,
          preconditions: [{ atom: 'vin', state: 'DONE' }] },
        { key: 'make',          source: 'Make',               label: 'Make',
          idTemplate: 'selected-make-{N}',              type: 'mat-select',
          skipIfAlreadyFilled: true,
          preconditions: [{ atom: 'vin', state: 'DONE' }] },
        { key: 'model',         source: 'Model',              label: 'Model',
          idTemplate: 'selected-model-{N}',             type: 'mat-select',
          skipIfAlreadyFilled: true,
          preconditions: [{ atom: 'vin', state: 'DONE' }] },
        { key: 'subModel',      source: 'SubModel',           label: 'Sub-Model',
          idTemplate: 'selected-submodel-{N}',          type: 'mat-select',
          skipIfAlreadyFilled: true,
          preconditions: [{ atom: 'vin', state: 'DONE' }] },
        { key: 'purchaseDate',  source: 'PurchaseDate',       label: 'Purchase Date',
          idTemplate: 'selected-purchaseDate-{N}',      type: 'date',
          skipIfAlreadyFilled: true,
          preconditions: [{ atom: 'vin', state: 'DONE' }] },
        { key: 'passiveRestraints', source: 'PassiveRestraints', label: 'Passive Restraints',
          idTemplate: 'selected-passiveRestraints-{N}', type: 'mat-select',
          skipIfAlreadyFilled: true,
          preconditions: [{ atom: 'vin', state: 'DONE' }] },
        { key: 'antiLockBrakes', source: 'AntiLockBrakes',    label: 'Anti-Lock Brakes',
          idTemplate: 'selected-antiLockBrakes-{N}',    type: 'mat-select',
          skipIfAlreadyFilled: true,
          preconditions: [{ atom: 'vin', state: 'DONE' }] },
        // ⚠️ Legacy id — hand-curated, vehicle 0 only (see header note).
        { key: 'costNew',       source: 'CostNew',            label: 'Cost New',
          idTemplate: 'textV1CostNew',                  type: 'currency',
          skipIfAlreadyFilled: true,
          preconditions: [{ atom: 'vin', state: 'DONE' }] },

        // ── Legacy-alias atoms (may be sibling fields of the VIN-decoded ─────
        // ones above — plan §6.3 notes them with "(if not already filled)"
        // suffix). Carry skipIfAlreadyFilled so they become a no-op when
        // decode already wrote them. No precondition on vin because the
        // ids aren't guaranteed to exist in the DOM at all — atom will
        // FAIL locate and move on if they're just aliases.
        { key: 'restraintLegacy',    source: 'PassiveRestraints', label: 'Passive Restraints (alt)',
          idTemplate: 'selected-restraint-{N}',          type: 'mat-select',
          skipIfAlreadyFilled: true },
        { key: 'antiLockBrakesLegacy', source: 'AntiLockBrakes',  label: 'Anti-Lock Brakes (alt)',
          idTemplate: 'antilock-brakes-{N}',             type: 'mat-select',
          skipIfAlreadyFilled: true },

        // ── Always-fill atoms ───────────────────────────────────────────────
        { key: 'use',                source: 'Use',              label: 'Vehicle Use',
          idTemplate: 'selected-use-{N}',               type: 'mat-select' },
        { key: 'annualMiles',        source: 'AnnualMiles',      label: 'Annual Miles',
          idTemplate: 'annual-miles-{N}',               type: 'number' },
        { key: 'daytimeRunningLights', source: 'DaytimeRunningLights', label: 'Daytime Running Lights',
          idTemplate: 'daytime-runningLights-{N}',      type: 'mat-toggle' },
        { key: 'antiTheft',          source: 'AntiTheft',        label: 'Anti-Theft',
          idTemplate: 'selected-antiTheft-{N}',         type: 'mat-select' },
        { key: 'transportationNetworkCoverage', source: 'TNC',   label: 'Transportation Network Coverage',
          idTemplate: 'transportation-network-coverage-{N}', type: 'mat-toggle' },
    ];

    const api = { vehicleAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.vehicleAtoms = vehicleAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
