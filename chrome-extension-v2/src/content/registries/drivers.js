/**
 * Altech EZLynx V2 — Drivers registry (~25 atoms per driver) — Phase 2
 *
 * Covers the `/rating/auto/{id}/drivers-compact` page. Every atom is
 * container-scoped to `additional-driver-fields[N]` via `scope: 'driver'`.
 *
 * **Important: this file exports the BASE atom list** (unindexed). The
 * `registries/index.js` router calls `expandEntityAtoms(driverAtoms,
 * 'driver', 'd', i, clientData.Drivers[i])` once per driver to produce
 * the final flat atom list passed to `topoSort`.
 *
 * Id templates contain `{N}` (modern) or `{N+1}` (legacy EZLynx — driver
 * 0 → D1). Both placeholders are pre-baked by `_expand.js` at expansion
 * time, so the locator never sees them.
 *
 * Source paths are relative to `clientData.Drivers[i]` (the entity slice
 * supplied via `atom._entity`). A driver payload is shaped like:
 *   { FirstName, LastName, DOB, Gender, MaritalStatus, Relationship,
 *     SSN, Industry, Occupation, LicenseStatus, AgeLicensed, DLNumber,
 *     DLState, Rated, DefensiveCourseDate, LicenseSuspendedRecently,
 *     SR22Required, FR44Required, GoodStudent, StudentFarAway,
 *     DriversEducation, MatureDriver, GoodDriver }
 *
 * Legacy exceptions (from plan §6.2):
 *   - `textD{N+1}DLNumber` — not driver-{N}-drivers-license-number
 *   - `drpD{N+1}DLState`   — not driver-{N}-drivers-license-state
 *
 * Preconditions:
 *   - `occupationTitle` waits for `occupationIndustry` DONE (Angular's
 *     title dropdown won't populate its options until the industry is
 *     selected and the server round-trips).
 *
 * Note on `extended1` / `driver_d1telematics_common`: the plan calls
 * these out as "label TBD at implementation time." They are carrier-
 * specific and not universally present — we omit them from the base
 * registry to keep `textD{N+1}DLNumber`-style legacy IDs contained. A
 * Phase 5 carrier-specific extension layer can attach them.
 */
(function (global) {
    'use strict';

    const driverAtoms = [
        // ── Personal ────────────────────────────────────────────────────────
        { key: 'firstName',              source: 'FirstName',     label: 'Driver First Name',
          idTemplate: 'driver-{N}-first-name',                    type: 'text' },
        { key: 'lastName',               source: 'LastName',      label: 'Driver Last Name',
          idTemplate: 'driver-{N}-last-name',                     type: 'text' },
        // DOB is pulled from applicant — skip silently if disabled.
        { key: 'dob',                    source: 'DOB',           label: 'Driver Date of Birth',
          idTemplate: 'driver-{N}-dob',                           type: 'date',
          skipIfDisabled: true },
        { key: 'gender',                 source: 'Gender',        label: 'Driver Gender',
          idTemplate: 'driver-{N}-gender',                        type: 'mat-select' },
        { key: 'maritalStatus',          source: 'MaritalStatus', label: 'Driver Marital Status',
          idTemplate: 'driver-{N}-maritalStatus',                 type: 'mat-select' },
        { key: 'relationship',           source: 'Relationship',  label: 'Driver Relationship',
          idTemplate: 'driver-{N}-relationship',                  type: 'mat-select' },
        { key: 'socialSecurityNumber',   source: 'SSN',           label: 'Driver SSN',
          idTemplate: 'driver-{N}-socialSecurityNumber',          type: 'ssn' },

        // ── Employment (industry → title precondition chain) ────────────────
        { key: 'occupationIndustry',     source: 'Industry',      label: 'Driver Industry',
          idTemplate: 'driver-{N}-occupationIndustry',            type: 'mat-select' },
        { key: 'occupationTitle',        source: 'Occupation',    label: 'Driver Occupation Title',
          idTemplate: 'driver-{N}-occupationTitle',               type: 'mat-select',
          preconditions: [{ atom: 'occupationIndustry', state: 'DONE' }] },

        // ── Driver's License ────────────────────────────────────────────────
        { key: 'driversLicenseStatus',   source: 'LicenseStatus', label: 'Driver License Status',
          idTemplate: 'driver-{N}-driversLicenseStatus',          type: 'mat-select' },
        { key: 'ageLicensed',            source: 'AgeLicensed',   label: 'Age First Licensed',
          idTemplate: 'driver-{N}-ageLicensed',                   type: 'text' },
        // ⚠️ Legacy id — driver 0 → D1, driver 1 → D2 (EZLynx historical naming).
        { key: 'dlNumber',               source: 'DLNumber',      label: 'DL Number',
          idTemplate: 'textD{N+1}DLNumber',                       type: 'text' },
        { key: 'dlState',                source: 'DLState',       label: 'DL State',
          idTemplate: 'drpD{N+1}DLState',                         type: 'mat-select' },

        // ── Driver attributes / flags ───────────────────────────────────────
        { key: 'ratedDriver',            source: 'Rated',                     label: 'Rated Driver',
          idTemplate: 'driver-{N}-ratedDriver',                               type: 'mat-toggle' },
        { key: 'defensiveDriverCourseDate', source: 'DefensiveCourseDate',    label: 'Defensive Driver Course Date',
          idTemplate: 'driver-{N}-defensiveDriverCourseDate',                 type: 'date' },
        { key: 'hasLicenseBeenSuspendedRecently', source: 'LicenseSuspendedRecently', label: 'License Suspended Recently',
          idTemplate: 'driver-{N}-hasLicenseBeenSuspendedRecently',           type: 'mat-toggle' },
        { key: 'isSR22Required',         source: 'SR22Required',              label: 'SR22 Required',
          idTemplate: 'driver-{N}-isSR22Required',                            type: 'mat-toggle' },
        { key: 'isFR44Required',         source: 'FR44Required',              label: 'FR44 Required',
          idTemplate: 'driver-{N}-isFR44Required',                            type: 'mat-toggle' },
        { key: 'isGoodStudent',          source: 'GoodStudent',               label: 'Good Student',
          idTemplate: 'driver-{N}-isGoodStudent',                             type: 'mat-toggle' },
        { key: 'isStudentFarAway',       source: 'StudentFarAway',            label: 'Student Far Away',
          idTemplate: 'driver-{N}-isStudentFarAway',                          type: 'mat-toggle' },
        { key: 'hasTakenDriversEducation', source: 'DriversEducation',        label: "Driver's Education",
          idTemplate: 'driver-{N}-hasTakenDriversEducation',                  type: 'mat-toggle' },
        { key: 'matureDriver',           source: 'MatureDriver',              label: 'Mature Driver',
          idTemplate: 'driver-{N}-matureDriver',                              type: 'mat-toggle' },
        { key: 'isGoodDriver',           source: 'GoodDriver',                label: 'Good Driver',
          idTemplate: 'driver-{N}-isGoodDriver',                              type: 'mat-toggle' },
    ];

    const api = { driverAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.driverAtoms = driverAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
