/**
 * Altech EZLynx V2 — Incidents registry — Phase 2
 *
 * Covers the `/rating/auto/{id}/incidents` page. Unlike drivers and
 * vehicles, incidents have **no wrapper component**. Atoms query by id
 * directly and rely on route-scoped atom loading plus a per-type local
 * index to prevent collisions across incident sub-types (particularly
 * the legacy `Amount-{N}` id that's unique to comp-loss).
 *
 * This file exports THREE base atom lists, one per sub-type:
 *   - accidentAtoms   (8 atoms × N accidents)
 *   - violationAtoms  (3 atoms × N violations)
 *   - compLossAtoms   (5 atoms × N comp losses, includes legacy Amount-{N})
 *
 * `registries/index.js` walks `clientData.Incidents[]`, routes each
 * entry by its `Type` field to the correct sub-registry, and expands
 * with a per-type local index counter. The `scope` key for each type
 * (`accident` / `violation` / `compLoss`) resolves to `document` in
 * `scope-resolvers.js` — atoms use flat id lookup.
 *
 * Source paths are relative to `clientData.Incidents[globalIdx]` (the
 * entity slice supplied via `atom._entity` at expansion time). Shape:
 *   { Type: 'Accident'|'Violation'|'CompLoss',
 *     Date, Driver, Description,
 *     PdAmount, BiAmount, CollisionAmount, MpAmount,  // accident
 *     VehicleInvolved, LossAmount }
 */
(function (global) {
    'use strict';

    // ── Accident (8 atoms × N) ────────────────────────────────────────────
    const accidentAtoms = [
        { key: 'date',          source: 'Date',        label: 'Accident Date',
          idTemplate: 'accidentDate-{N}',              type: 'date' },
        // EZLynx auto-defaults this to Driver 1. skipIfEqualsDefault keeps
        // us from fighting the default when clientData says "Driver 1".
        { key: 'driver',        source: 'Driver',      label: 'Accident Driver',
          idTemplate: 'accident-driver-{N}',           type: 'mat-select',
          skipIfEqualsDefault: true },
        { key: 'description',   source: 'Description', label: 'Accident Description',
          idTemplate: 'accidentDescription-{N}',       type: 'mat-select' },
        { key: 'pdAmount',      source: 'PdAmount',    label: 'Property Damage Amount',
          idTemplate: 'pdAmount-{N}',                  type: 'currency' },
        { key: 'biAmount',      source: 'BiAmount',    label: 'Bodily Injury Amount',
          idTemplate: 'biAmount-{N}',                  type: 'currency' },
        { key: 'collisionAmount', source: 'CollisionAmount', label: 'Collision Amount',
          idTemplate: 'collisionAmount-{N}',           type: 'currency' },
        { key: 'mpAmount',      source: 'MpAmount',    label: 'Medical Payments Amount',
          idTemplate: 'mpAmount-{N}',                  type: 'currency' },
        { key: 'vehicleInvolved', source: 'VehicleInvolved', label: 'Vehicle Involved',
          idTemplate: 'accident-vehicleInvolved-{N}',  type: 'mat-select' },
    ];

    // ── Violation (3 atoms × N) ───────────────────────────────────────────
    const violationAtoms = [
        { key: 'date',        source: 'Date',        label: 'Violation Date',
          idTemplate: 'violationDate-{N}',           type: 'date' },
        { key: 'driver',      source: 'Driver',      label: 'Violation Driver',
          idTemplate: 'violation-driver-{N}',        type: 'mat-select',
          skipIfEqualsDefault: true },
        { key: 'description', source: 'Description', label: 'Violation Description',
          idTemplate: 'violationDescription-{N}',    type: 'mat-select' },
    ];

    // ── Comp Loss (5 atoms × N) ───────────────────────────────────────────
    const compLossAtoms = [
        { key: 'dateOfLoss',    source: 'Date',        label: 'Comp Loss Date',
          idTemplate: 'compLoss-dateOfLoss-{N}',     type: 'date' },
        { key: 'driver',        source: 'Driver',      label: 'Comp Loss Driver',
          idTemplate: 'compLoss-driver-{N}',         type: 'mat-select',
          skipIfEqualsDefault: true },
        { key: 'lossDescription', source: 'Description', label: 'Comp Loss Description',
          idTemplate: 'compLoss-lossDescription-{N}', type: 'mat-select' },
        // ⚠️ Legacy id — missing the `compLoss-` prefix. Collides across
        // incident sub-types if route-scoped loading is broken, which is
        // why only the cl{N}_amount atom carries this id (never acc/vio).
        { key: 'amount',        source: 'LossAmount',  label: 'Comp Loss Amount',
          idTemplate: 'Amount-{N}',                  type: 'currency' },
        { key: 'vehicleInvolved', source: 'VehicleInvolved', label: 'Vehicle Involved',
          idTemplate: 'compLoss-vehicleInvolved-{N}', type: 'mat-select' },
    ];

    const api = { accidentAtoms, violationAtoms, compLossAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.accidentAtoms = accidentAtoms;
        global.AltechV2.registries.violationAtoms = violationAtoms;
        global.AltechV2.registries.compLossAtoms = compLossAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
