/**
 * Altech EZLynx V2 — Home Policy Info `/rating/home/{id}/policy-info` registry
 *
 * Flat registry (no index, no scope). Covers the core home policy info
 * atoms from plan §6.6. Source keys match legacy Altech keys observed in
 * `chrome-extension/content.js` FIELD_LABEL_MAP + POSITIONAL_OVERRIDES for
 * `/rating/home/*\/policy-info` (e.g. `HomePriorCarrier`, `PriorExpiration`,
 * `HomePriorMonths`, `HomeContinuousMonths`).
 *
 * Dynamic reveal (§7.5):
 *   The `swimmingPoolOnPremises`, `dogInfo`, `trampoline`, and
 *   `businessOrDaycareOnPremises` toggles reveal child atoms only after the
 *   toggle goes ON. Parent atoms carry a `waitForChildAtomsReady` postFill
 *   action that polls until the child id exists in the DOM. Child atoms
 *   are appended conditionally by `getRegistry()` only when `clientData`
 *   actually has a value for them — the reveal polling and the conditional
 *   loading together keep the registry self-pruning.
 *
 * All atoms inherit `skipIfLexisNexisLocked: true` and `skipIfDisabled:
 * true` via the atom-executor defaults. An atom with no matching
 * `clientData` source SKIPs cleanly at PRECHECK (empty-source).
 *
 * Plan-header discrepancy note:
 *   §6.6 header reads "18 core atoms" but the enumerated list is 17. We
 *   ship the enumerated 17 to keep ids grounded in recon evidence; if a
 *   future live session confirms an 18th field, it can be appended here.
 *   `home-dwelling-info` handles the 49-count requirement separately.
 */
(function (global) {
    'use strict';

    // ── Child atoms revealed by the swimming-pool toggle (§7.5). These
    //    are only appended to the final atom list when clientData has a
    //    value for them, and each carries a precondition on the parent
    //    toggle reaching DONE.
    const POOL_CHILDREN_KEYS = ['poolType', 'poolFenced'];
    // ── Child atoms revealed by the dogs-on-premises toggle.
    const DOG_CHILDREN_KEYS  = ['numberOfDogs', 'dogBreed', 'dogBiteHistory'];
    // ── Child atoms revealed by the trampoline toggle.
    const TRAMPOLINE_CHILDREN_KEYS = ['trampolineFenced'];
    // ── Child atoms revealed by the business-or-daycare toggle.
    const BUSINESS_CHILDREN_KEYS = ['numberOfEmployees', 'businessType'];

    // Core (flat) atom list — order reflects legacy page field order where
    // known. Atom-executor runs post-topoSort so ordering is cosmetic.
    const homePolicyInfoAtoms = [
        // ── Prior-policy history ─────────────────────────────────────────
        { key: 'priorCarrier', source: 'HomePriorCarrier', label: 'Prior Carrier',
          idTemplate: 'priorCarrier', type: 'mat-select' },
        { key: 'priorPolicyExpirationDate', source: 'PriorExpiration', label: 'Expiration Date (current policy)',
          idTemplate: 'priorPolicyExpirationDate', type: 'date' },
        { key: 'priorPolicyPremium', source: 'HomePriorPremium', label: 'Prior Policy Premium',
          idTemplate: 'priorPolicyPremium', type: 'currency' },
        { key: 'monthsWithPriorCarrier', source: 'HomePriorMonths', label: 'Months with Prior Carrier',
          idTemplate: 'monthsWithPriorCarrier', type: 'number' },
        { key: 'yearsWithPriorCarrier', source: 'HomePriorYears', label: 'Years with Prior Carrier',
          idTemplate: 'yearsWithPriorCarrier', type: 'number' },
        { key: 'monthsWithContinuousCoverage', source: 'HomeContinuousMonths', label: 'Months with Continuous Coverage',
          idTemplate: 'monthsWithContinuousCoverage', type: 'number' },
        { key: 'yearsWithContinuousCoverage', source: 'YearsContinuousCoverage', label: 'Years with Continuous Coverage',
          idTemplate: 'yearsWithContinuousCoverage', type: 'number' },

        // ── Underwriting reports ─────────────────────────────────────────
        { key: 'creditCheckAuthorized', source: 'CreditCheckAuth', label: 'Credit Check and Other Underwriting Reports Authorized',
          idTemplate: 'creditCheckAuthorized', type: 'mat-toggle' },

        // ── New policy setup ─────────────────────────────────────────────
        { key: 'package', source: 'QuoteAsPackage', label: 'Quote as Package',
          idTemplate: 'package', type: 'mat-toggle' },
        { key: 'effectiveDateNewPolicy', source: 'EffectiveDate', label: 'Effective Date (New Policy)',
          idTemplate: 'effectiveDateNewPolicy', type: 'date' },

        // ── Risk questionnaire (toggles) ─────────────────────────────────
        { key: 'propertyInsurance', source: 'PropertyInsurancePriorLoss',
          label: 'Has property insurance been cancelled, declined or non-renewed in the last 5 yrs?',
          idTemplate: 'propertyInsurance', type: 'mat-toggle' },
        { key: 'homeUnderConstruction', source: 'HomeUnderConstruction',
          label: 'Is the home under construction?',
          idTemplate: 'homeUnderConstruction', type: 'mat-toggle' },

        // Trampoline toggle — dynamic reveal (§7.5).
        { key: 'trampoline', source: 'Trampoline', label: 'Trampoline on Premises',
          idTemplate: 'trampoline', type: 'mat-toggle',
          postFill: [{ action: 'waitForChildAtomsReady', children: TRAMPOLINE_CHILDREN_KEYS }] },

        // Business / daycare toggle — dynamic reveal. `numberOfEmployees`
        // is the revealed child.
        { key: 'businessOrDaycareOnPremises', source: 'BusinessOrDaycare',
          label: 'Is there a business or daycare on the premises?',
          idTemplate: 'businessOrDaycareOnPremises', type: 'mat-toggle',
          postFill: [{ action: 'waitForChildAtomsReady', children: BUSINESS_CHILDREN_KEYS }] },

        // Number of employees — revealed only after the business toggle.
        // Modeled as a core atom so the test count stays predictable; the
        // precondition blocks it until the parent toggle is DONE.
        { key: 'numberOfEmployees', source: 'NumberOfEmployees', label: '# of Employees',
          idTemplate: 'numberOfEmployees', type: 'number',
          preconditions: [{ atom: 'businessOrDaycareOnPremises', state: 'DONE' }] },

        // Swimming pool toggle — dynamic reveal.
        { key: 'swimmingPoolOnPremises', source: 'SwimmingPool',
          label: 'Is there a swimming pool on the premises?',
          idTemplate: 'swimmingPoolOnPremises', type: 'mat-toggle',
          postFill: [{ action: 'waitForChildAtomsReady', children: POOL_CHILDREN_KEYS }] },

        // Dog / animal toggle — dynamic reveal.
        { key: 'dogInfo', source: 'DogsOnPremises', label: 'Are dogs on the premises?',
          idTemplate: 'dogInfo', type: 'mat-toggle',
          postFill: [{ action: 'waitForChildAtomsReady', children: DOG_CHILDREN_KEYS }] },
    ];

    // ── Optional child atoms (conditional, only loaded when clientData
    //    carries a value for them). These are returned alongside the core
    //    list by buildHomePolicyInfoAtoms(clientData). Each child atom
    //    carries a precondition on its parent toggle so it stays BLOCKED
    //    until the toggle is flipped on.
    //
    //    The presence check uses the legacy Altech source key names. If a
    //    key is absent (or empty), the child atom is omitted entirely —
    //    this is what the plan means by "only defined if clientData has
    //    values for them" (§6.6).
    const CHILD_ATOM_SPECS = [
        // swimming-pool children
        { key: 'poolType', source: 'PoolType', label: 'Pool Type',
          idTemplate: 'poolType', type: 'mat-select',
          preconditions: [{ atom: 'swimmingPoolOnPremises', state: 'DONE' }] },
        { key: 'poolFenced', source: 'PoolFenced', label: 'Pool Fenced',
          idTemplate: 'poolFenced', type: 'mat-toggle',
          preconditions: [{ atom: 'swimmingPoolOnPremises', state: 'DONE' }] },

        // dog children
        { key: 'numberOfDogs', source: 'NumberOfDogs', label: 'Number of Dogs',
          idTemplate: 'numberOfDogs', type: 'number',
          preconditions: [{ atom: 'dogInfo', state: 'DONE' }] },
        { key: 'dogBreed', source: 'DogBreed', label: 'Dog Breed',
          idTemplate: 'dogBreed', type: 'text',
          preconditions: [{ atom: 'dogInfo', state: 'DONE' }] },
        { key: 'dogBiteHistory', source: 'DogBiteHistory', label: 'Dog Bite History',
          idTemplate: 'dogBiteHistory', type: 'mat-toggle',
          preconditions: [{ atom: 'dogInfo', state: 'DONE' }] },

        // trampoline children
        { key: 'trampolineFenced', source: 'TrampolineFenced', label: 'Trampoline Fenced',
          idTemplate: 'trampolineFenced', type: 'mat-toggle',
          preconditions: [{ atom: 'trampoline', state: 'DONE' }] },

        // business children (businessType reveal-only; numberOfEmployees
        // is already a core atom above).
        { key: 'businessType', source: 'BusinessType', label: 'Business Type',
          idTemplate: 'businessType', type: 'mat-select',
          preconditions: [{ atom: 'businessOrDaycareOnPremises', state: 'DONE' }] },
    ];

    /**
     * Build the final atom list for the policy-info route. Returns the
     * 17 core atoms plus any child atoms whose source keys appear on
     * clientData.
     *
     * @param {object} [clientData]
     * @returns {Array}
     */
    function buildHomePolicyInfoAtoms(clientData) {
        const atoms = homePolicyInfoAtoms.slice();
        if (!clientData) return atoms;
        for (const spec of CHILD_ATOM_SPECS) {
            const v = clientData[spec.source];
            if (v != null && v !== '') atoms.push(spec);
        }
        return atoms;
    }

    const api = {
        homePolicyInfoAtoms,
        homePolicyInfoChildAtomSpecs: CHILD_ATOM_SPECS,
        buildHomePolicyInfoAtoms,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        Object.assign(global.AltechV2.registries, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
