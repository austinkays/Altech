/**
 * Altech EZLynx V2 — Auto Policy Info `/rating/auto/{id}/policy-info` registry
 *
 * Flat registry (no index, no scope). Covers the auto policy info page
 * which was not formally reconned (§2: "Auto coverage/policy pages — ⏳
 * Not reconned — flat single-entity, discover during implementation").
 *
 * ID templates are best-guess based on EZLynx's observed naming conventions
 * from fully-reconned pages (applicant, home-policy-info). Every atom is
 * tagged `_needsRecon: true` — run Registry Audit (§11.4.2) on a live
 * EZLynx auto policy-info page to validate and correct IDs.
 *
 * Source keys match the Altech `clientData` field names from `js/fields.js`
 * (section: 'prior-insurance' and 'auto-coverage').
 *
 * V1 reference (`chrome-extension/content.js` §4):
 *   The v1 extension's auto-policy page fills the following dropdowns
 *   (via label matching): ResidenceIs, NumResidents → AutoPolicyType →
 *   PolicyTerm → PriorCarrier → PriorPolicyTerm → PriorYearsWithCarrier
 *   → PriorLiabilityLimits → YearsContinuousCoverage. Text fields:
 *   EffectiveDate, PriorExpiration.
 *
 *   Fill order matters: ResidenceIs and NumResidents trigger Angular
 *   cascades that load correct prior-carrier options. They must precede
 *   PriorCarrier. (V1 comment lines 916-921.)
 *
 * All atoms inherit `skipIfLexisNexisLocked: true` and `skipIfDisabled:
 * true` via atom-executor defaults.
 */
(function (global) {
    'use strict';

    const autoPolicyInfoAtoms = [
        // ── Policy setup (fill first — cascades load prior-carrier options)
        { key: 'residenceIs', source: 'residenceIs', label: 'Residence Is',
          idTemplate: 'residenceIs', type: 'mat-select', _needsRecon: true },
        { key: 'numResidents', source: 'numResidents', label: 'Number of Residents',
          idTemplate: 'numResidents', type: 'mat-select', _needsRecon: true },

        // ── Policy type & term ──────────────────────────────────────────
        { key: 'autoPolicyType', source: 'autoPolicyType', label: 'Auto Policy Type',
          idTemplate: 'autoPolicyType', type: 'mat-select', _needsRecon: true },
        { key: 'policyTerm', source: 'policyTerm', label: 'New Policy Term',
          idTemplate: 'policyTerm', type: 'mat-select', _needsRecon: true },
        { key: 'effectiveDateNewPolicy', source: 'effectiveDate', label: 'Effective Date (New Policy)',
          idTemplate: 'effectiveDateNewPolicy', type: 'date', _needsRecon: true },

        // ── Prior insurance ─────────────────────────────────────────────
        // PriorCarrier depends on ResidenceIs cascade (§ v1 lines 916-921)
        { key: 'priorCarrier', source: 'priorCarrier', label: 'Prior Carrier',
          idTemplate: 'priorCarrier', type: 'mat-select',
          preconditions: [{ atom: 'residenceIs', state: 'DONE' }],
          _needsRecon: true },
        { key: 'priorPolicyExpirationDate', source: 'priorExp', label: 'Prior Expiration Date',
          idTemplate: 'priorPolicyExpirationDate', type: 'date', _needsRecon: true },
        { key: 'priorPolicyTerm', source: 'priorPolicyTerm', label: 'Prior Policy Term',
          idTemplate: 'priorPolicyTerm', type: 'mat-select', _needsRecon: true },
        { key: 'yearsWithPriorCarrier', source: 'priorYears', label: 'Years with Prior Carrier',
          idTemplate: 'yearsWithPriorCarrier', type: 'mat-select', _needsRecon: true },
        { key: 'priorLiabilityLimits', source: 'priorLiabilityLimits', label: 'Prior Liability Limits',
          idTemplate: 'priorLiabilityLimits', type: 'mat-select', _needsRecon: true },
        { key: 'yearsContinuousCoverage', source: 'continuousCoverage', label: 'Years with Continuous Coverage',
          idTemplate: 'yearsContinuousCoverage', type: 'mat-select', _needsRecon: true },

        // ── Credit check ────────────────────────────────────────────────
        { key: 'creditCheckAuthorized', source: 'CreditCheckAuth', label: 'Credit Check Authorized',
          idTemplate: 'creditCheckAuthorized', type: 'mat-toggle', _needsRecon: true },
    ];

    const api = { autoPolicyInfoAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.autoPolicyInfoAtoms = autoPolicyInfoAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
