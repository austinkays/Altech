/**
 * Altech EZLynx V2 — Home Coverage `/rating/home/{id}/coverage` registry
 *
 * Flat registry (no index, no scope). Covers the core home coverage atoms
 * from plan §6.8. Source keys match `chrome-extension/content.js`
 * FIELD_LABEL_MAP for `/rating/home/*\/coverage`.
 *
 * Currency transform (§6.8):
 *   `dwelling`, `estReplacementCost`, and `loss-of-use-amount` are raw
 *   currency inputs. The transform strips `$` and commas via
 *   `transforms/currency-strip.js` → `strip()`; EZLynx reformats to
 *   `$X,XXX` on blur.
 *
 * Deductible transform (§7.7):
 *   `allPerilsDeductible`, `theftDeductible`, `windDeductible`,
 *   `personalLiability`, and `medicalPayments` are mat-selects whose
 *   option texts are raw integers (e.g. `"1000"`). The transform uses
 *   `currencyStrip.stripInt()` so a clientData value of `"$1,000"`
 *   normalizes to `"1000"` and matches the mat-option text exactly
 *   without needing fuzzy similarity.
 *
 * Dynamic reveal (§7.5):
 *   First / Second / Third Mortgagee toggles reveal sub-fields only once
 *   the toggle is ON. Each carries a `waitForChildAtomsReady` postFill
 *   action with the child ids for the corresponding mortgagee block.
 *   The child atoms themselves are not part of the Phase 3 core
 *   registry — Phase 5 can attach them as carrier-specific extensions.
 *
 * Plan-header discrepancy note:
 *   §6.8 header reads "19 atoms" but the enumerated field list contains
 *   17 distinct ids. We ship the enumerated 17 rather than fabricating
 *   two extras whose DOM ids haven't been confirmed by recon. The
 *   registry integrity test asserts the 17-atom count explicitly; if a
 *   future live session surfaces the missing two atoms they can be
 *   appended without schema changes elsewhere.
 */
(function (global) {
    'use strict';

    // Lazy-load currency-strip so this registry works under both CJS
    // (unit tests) and the content-script IIFE pattern.
    const getCurrencyStrip = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return require('../transforms/currency-strip');
        }
        return (global.AltechV2
            && global.AltechV2.transforms
            && global.AltechV2.transforms.currencyStrip) || null;
    };

    // Currency transform — dollar → raw decimal. Used on dwelling /
    // estReplacementCost / loss-of-use-amount.
    function currencyTransform(v) {
        const cs = getCurrencyStrip();
        return cs && typeof cs.strip === 'function' ? cs.strip(v) : String(v == null ? '' : v);
    }

    // Deductible transform — dollar → raw integer. Used on the five
    // mat-select deductible atoms so "$1,000" matches the "1000" option
    // text exactly. See §7.7.
    function deductibleTransform(v) {
        const cs = getCurrencyStrip();
        return cs && typeof cs.stripInt === 'function' ? cs.stripInt(v) : String(v == null ? '' : v);
    }

    // Child atom id groups for the three mortgagee reveals (§7.5). These
    // ids are illustrative — the orchestrator's `waitForChildAtomsReady`
    // simply polls until the first one exists, so an empty array means
    // "no children to wait for" (a no-op that still logs supported:true
    // for audit). Phase 5 can attach real child atoms.
    const FIRST_MORTGAGEE_CHILDREN = [
        'firstMortgageeName',
        'firstMortgageeLoanNumber',
    ];
    const SECOND_MORTGAGEE_CHILDREN = [
        'secondMortgageeName',
        'secondMortgageeLoanNumber',
    ];
    const THIRD_MORTGAGEE_CHILDREN = [
        'thirdMortgageeName',
        'thirdMortgageeLoanNumber',
    ];

    const homeCoverageAtoms = [
        // ── Core dwelling coverage (currency) ───────────────────────────
        { key: 'dwelling', source: 'DwellingCoverage', label: 'Dwelling',
          idTemplate: 'dwelling', type: 'currency',
          valueTransform: currencyTransform },
        { key: 'estReplacementCost', source: 'EstReplacementCost', label: 'Est. Replacement. Cost',
          idTemplate: 'estReplacementCost', type: 'currency',
          valueTransform: currencyTransform },

        // ── Coverage percentages / amounts (mat-select) ─────────────────
        { key: 'other-structure', source: 'OtherStructure', label: 'Other Structure',
          idTemplate: 'other-structure', type: 'mat-select' },
        { key: 'personal-property', source: 'HomePersonalProperty', label: 'Personal Property',
          idTemplate: 'personal-property', type: 'mat-select' },
        { key: 'loss-of-use', source: 'HomeLossOfUse', label: 'Loss Of Use',
          idTemplate: 'loss-of-use', type: 'mat-select' },
        { key: 'loss-of-use-amount', source: 'HomeLossOfUseAmount', label: 'Loss Of Use Amount',
          idTemplate: 'loss-of-use-amount', type: 'currency',
          valueTransform: currencyTransform },

        // ── Liability / medical (mat-select, raw-number option text) ────
        { key: 'personalLiability', source: 'HomePersonalLiability', label: 'Personal Liability',
          idTemplate: 'personalLiability', type: 'mat-select',
          valueTransform: deductibleTransform },
        { key: 'medicalPayments', source: 'HomeMedicalPayments', label: 'Medical Payments',
          idTemplate: 'medicalPayments', type: 'mat-select',
          valueTransform: deductibleTransform },

        // ── Deductibles (mat-select, raw-number option text — §7.7) ─────
        { key: 'allPerilsDeductible', source: 'AllPerilsDeductible', label: 'All Perils Deductible',
          idTemplate: 'allPerilsDeductible', type: 'mat-select',
          valueTransform: deductibleTransform },
        { key: 'theftDeductible', source: 'TheftDeductible', label: 'Theft Deductible',
          idTemplate: 'theftDeductible', type: 'mat-select',
          valueTransform: deductibleTransform },
        { key: 'windDeductible', source: 'WindDeductible', label: 'Wind Deductible',
          idTemplate: 'windDeductible', type: 'mat-select',
          valueTransform: deductibleTransform },

        // ── Mortgagees (toggles → dynamic reveal, §7.5) ─────────────────
        { key: 'firstMortgagee', source: 'Mortgagee', label: 'First mortgagee',
          idTemplate: 'firstMortgagee', type: 'mat-toggle',
          postFill: [{ action: 'waitForChildAtomsReady', children: FIRST_MORTGAGEE_CHILDREN }] },
        { key: 'secondMortgagee', source: 'SecondMortgagee', label: 'Second mortgagee',
          idTemplate: 'secondMortgagee', type: 'mat-toggle',
          postFill: [{ action: 'waitForChildAtomsReady', children: SECOND_MORTGAGEE_CHILDREN }] },
        { key: 'thirdMortgagee', source: 'ThirdMortgagee', label: 'Third mortgagee',
          idTemplate: 'thirdMortgagee', type: 'mat-toggle',
          postFill: [{ action: 'waitForChildAtomsReady', children: THIRD_MORTGAGEE_CHILDREN }] },

        // ── Other interests ─────────────────────────────────────────────
        { key: 'cosigner', source: 'Cosigner', label: 'Cosigner',
          idTemplate: 'cosigner', type: 'mat-toggle' },
        { key: 'equityLineOfCredit', source: 'EquityLineOfCredit', label: 'Equity line of credit',
          idTemplate: 'equityLineOfCredit', type: 'mat-toggle' },
        { key: 'numberOfOtherInterests', source: 'NumberOfOtherInterests', label: '# of Other Interests',
          idTemplate: 'numberOfOtherInterests', type: 'number' },
    ];

    const api = {
        homeCoverageAtoms,
        // Exposed for unit tests that need to spot-check transform wiring.
        _transforms: { currencyTransform, deductibleTransform },
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        Object.assign(global.AltechV2.registries, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
