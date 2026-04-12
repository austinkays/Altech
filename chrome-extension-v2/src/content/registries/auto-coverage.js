/**
 * Altech EZLynx V2 — Auto Coverage `/rating/auto/{id}/coverage` registry
 *
 * Flat registry (no index, no scope). Covers the auto coverage page which
 * was not formally reconned (§2: "Auto coverage/policy pages — ⏳ Not
 * reconned — flat single-entity, discover during implementation").
 *
 * The v1 extension (`chrome-extension/content.js` line 939) fills this
 * page entirely with mat-select dropdowns via label matching:
 *   BodilyInjury, PropertyDamage, MedPaymentsAuto, Comprehensive,
 *   Collision, TowingLabor, RentalReimbursement, UMPD, UMBI.
 * No text fields are filled (v1 line 327–330 returns `{}` for text).
 *
 * ID templates are best-guess based on EZLynx's observed naming patterns.
 * Every atom is tagged `_needsRecon: true` — run Registry Audit (§11.4.2)
 * on a live EZLynx auto coverage page to validate and correct IDs.
 *
 * Source keys match the Altech `clientData` field names from `js/fields.js`
 * (section: 'auto-coverage').
 *
 * Deductible transform: Comprehensive and Collision deductibles use
 * `currencyStrip.stripInt()` so a clientData value of `"$500"` normalizes
 * to `"500"` and matches the mat-option text exactly (§7.7 pattern).
 *
 * All atoms inherit `skipIfLexisNexisLocked: true` and `skipIfDisabled:
 * true` via atom-executor defaults.
 */
(function (global) {
    'use strict';

    const getCurrencyStrip = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('../transforms/currency-strip');
        }
        return (global.AltechV2
            && global.AltechV2.transforms
            && global.AltechV2.transforms.currencyStrip) || null;
    };

    function deductibleTransform(v) {
        const cs = getCurrencyStrip();
        return cs && typeof cs.stripInt === 'function' ? cs.stripInt(v) : String(v == null ? '' : v);
    }

    const autoCoverageAtoms = [
        // ── Liability ───────────────────────────────────────────────────
        { key: 'bodilyInjury', source: 'liabilityLimits', label: 'Bodily Injury Limits',
          idTemplate: 'bodilyInjury', type: 'mat-select', _needsRecon: true },
        { key: 'propertyDamage', source: 'pdLimit', label: 'Property Damage Limits',
          idTemplate: 'propertyDamage', type: 'mat-select', _needsRecon: true },
        { key: 'medicalPayments', source: 'medPayments', label: 'Medical Payments',
          idTemplate: 'medicalPayments', type: 'mat-select', _needsRecon: true },

        // ── UM / UIM ────────────────────────────────────────────────────
        { key: 'umBodilyInjury', source: 'umLimits', label: 'Uninsured Motorist BI',
          idTemplate: 'umBodilyInjury', type: 'mat-select', _needsRecon: true },
        { key: 'umPropertyDamage', source: 'umpdLimit', label: 'Uninsured Motorist PD',
          idTemplate: 'umPropertyDamage', type: 'mat-select', _needsRecon: true },
        { key: 'uimBodilyInjury', source: 'uimLimits', label: 'Underinsured Motorist BI',
          idTemplate: 'uimBodilyInjury', type: 'mat-select', _needsRecon: true },

        // ── Per-vehicle deductibles ─────────────────────────────────────
        // Comprehensive and Collision use deductible transform (§7.7) to
        // match raw-integer mat-option texts like "500", "1000".
        { key: 'comprehensive', source: 'compDeductible', label: 'Comprehensive Deductible',
          idTemplate: 'comprehensive', type: 'mat-select',
          valueTransform: deductibleTransform, _needsRecon: true },
        { key: 'collision', source: 'autoDeductible', label: 'Collision Deductible',
          idTemplate: 'collision', type: 'mat-select',
          valueTransform: deductibleTransform, _needsRecon: true },

        // ── Optional coverages ──────────────────────────────────────────
        { key: 'towingLabor', source: 'towingDeductible', label: 'Towing and Labor',
          idTemplate: 'towingLabor', type: 'mat-select', _needsRecon: true },
        { key: 'rentalReimbursement', source: 'rentalDeductible', label: 'Rental Reimbursement',
          idTemplate: 'rentalReimbursement', type: 'mat-select', _needsRecon: true },
    ];

    const api = { autoCoverageAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.autoCoverageAtoms = autoCoverageAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
