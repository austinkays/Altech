/**
 * Altech EZLynx V2 — Home Dwelling Info `/rating/home/{id}/dwelling-info` registry
 *
 * Flat registry (no index, no scope). Covers the 49 core dwelling-info
 * atoms from plan §6.7. All id templates are literal form-control ids —
 * kebab-case where the plan used kebab-case (`year-built`, `dead-bolt`),
 * camelCase everywhere else.
 *
 * **Zero cascade preconditions** — verified by recon (§6.7). The old
 * extension assumed Dwelling Type → Number of Stories and Roof Type →
 * Roof Design were cascading dependencies; recon confirmed neither is
 * real. This registry therefore ships with NO `preconditions` on any
 * atom. The registry-integrity test asserts this explicitly so a future
 * edit that adds a precondition here will fail loud.
 *
 * `noOfUnitsInFireDivision` is conditionally disabled by EZLynx — we set
 * `skipIfDisabled: true` explicitly so the atom SKIPs cleanly rather than
 * FAILing on the disabled precheck.
 *
 * Explicit per-system `yearUpdated{Heating,Electrical,Plumbing,Roofing}`
 * ids — the old extension used POSITIONAL_OVERRIDES to disambiguate four
 * "Year Updated" fields by DOM position, which was brittle. V2 uses
 * explicit, unambiguous ids.
 *
 * First atom `dwelling` (position 0) matches the `fieldsInOrder[0] ===
 * 'Dwelling'` observed in `chrome-extension/content.js` §14 ROUTE_TABLE
 * for `/rating/home/*\/dwelling-info`. It is the 49th atom beyond the 48
 * enumerated in the plan's §6.7 field list and brings the registry to
 * the header-stated total of 49.
 */
(function (global) {
    'use strict';

    const homeDwellingInfoAtoms = [
        // ── Header / dwelling summary ────────────────────────────────────
        // Matches old-extension field[0] 'Dwelling' — mat-select from
        // observation. Source is the legacy `DwellingCoverage` key.
        { key: 'dwelling', source: 'DwellingCoverage', label: 'Dwelling',
          idTemplate: 'dwelling', type: 'mat-select' },

        // ── Usage / occupancy ────────────────────────────────────────────
        { key: 'dwellingUsage', source: 'DwellingUsage', label: 'Dwelling Usage',
          idTemplate: 'dwellingUsage', type: 'mat-select' },
        { key: 'dwellingOccupancy', source: 'OccupancyType', label: 'Occupancy Type',
          idTemplate: 'dwellingOccupancy', type: 'mat-select' },
        { key: 'dwellingType', source: 'DwellingType', label: 'Dwelling Type',
          idTemplate: 'dwellingType', type: 'mat-select' },
        { key: 'numberOfOccupants', source: 'NumberOfOccupants', label: 'Number of Occupants',
          idTemplate: 'numberOfOccupants', type: 'number' },

        // ── Structure ────────────────────────────────────────────────────
        { key: 'numberOfStories', source: 'NumberOfStories', label: 'Number of Stories',
          idTemplate: 'numberOfStories', type: 'mat-select' },
        { key: 'squareFootage', source: 'SqFt', label: 'Square Footage',
          idTemplate: 'squareFootage', type: 'number' },
        { key: 'year-built', source: 'YearBuilt', label: 'Year Built',
          idTemplate: 'year-built', type: 'number' },
        { key: 'constructionStyle', source: 'ConstructionStyle', label: 'Construction Style',
          idTemplate: 'constructionStyle', type: 'mat-select' },
        { key: 'roofType', source: 'RoofType', label: 'Roof Type (main material)',
          idTemplate: 'roofType', type: 'mat-select' },
        { key: 'foundationType', source: 'FoundationType', label: 'Foundation Type',
          idTemplate: 'foundationType', type: 'mat-select' },
        { key: 'roofDesign', source: 'RoofDesign', label: 'Roof Design',
          idTemplate: 'roofDesign', type: 'mat-select' },
        { key: 'exteriorWalls', source: 'ExteriorWalls', label: 'Exterior Walls',
          idTemplate: 'exteriorWalls', type: 'mat-select' },

        // ── Baths / rooms ────────────────────────────────────────────────
        { key: 'numberOfFullBaths', source: 'NumberOfFullBaths', label: 'Number Of Full Baths',
          idTemplate: 'numberOfFullBaths', type: 'number' },
        { key: 'numberOfHalfBaths', source: 'NumberOfHalfBaths', label: 'Number Of Half Baths',
          idTemplate: 'numberOfHalfBaths', type: 'number' },
        { key: 'numberOfWoodBurningStoves', source: 'NumberOfWoodBurningStoves', label: '# of Wood Burning Stoves',
          idTemplate: 'numberOfWoodBurningStoves', type: 'number' },

        // ── Heating ──────────────────────────────────────────────────────
        { key: 'heatingType', source: 'HeatingType', label: 'Heating Type',
          idTemplate: 'heatingType', type: 'mat-select' },
        { key: 'secondaryHeatingSourceType', source: 'SecondaryHeatingSourceType', label: 'Heating Source Type',
          idTemplate: 'secondaryHeatingSourceType', type: 'mat-select' },

        // ── Security / detection ─────────────────────────────────────────
        { key: 'burglarAlarmType', source: 'BurglarAlarm', label: 'Burglar Alarm',
          idTemplate: 'burglarAlarmType', type: 'mat-select' },
        { key: 'dead-bolt', source: 'DeadBolt', label: 'Dead Bolt',
          idTemplate: 'dead-bolt', type: 'mat-toggle' },
        { key: 'fireDetectionType', source: 'FireDetection', label: 'Fire Detection',
          idTemplate: 'fireDetectionType', type: 'mat-select' },
        { key: 'sprinklerSystemType', source: 'SprinklerSystem', label: 'Sprinkler System',
          idTemplate: 'sprinklerSystemType', type: 'mat-select' },
        { key: 'smokeDetectorTypes', source: 'SmokeDetector', label: 'Smoke Detector',
          idTemplate: 'smokeDetectorTypes', type: 'mat-select' },

        // ── Purchase ─────────────────────────────────────────────────────
        { key: 'purchasePrice', source: 'PurchasePrice', label: 'Purchase Price',
          idTemplate: 'purchasePrice', type: 'currency' },
        { key: 'purchaseDate', source: 'PurchaseDate', label: 'Purchase Date',
          idTemplate: 'purchaseDate', type: 'date' },

        // ── Protection class / fire / water ─────────────────────────────
        { key: 'distanceFromFireStation', source: 'DistanceFromFireStation', label: 'Distance From Fire Station(miles)',
          idTemplate: 'distanceFromFireStation', type: 'number' },
        { key: 'feetFromHydrant', source: 'FeetFromHydrant', label: 'Feet From Hydrant',
          idTemplate: 'feetFromHydrant', type: 'number' },
        { key: 'distanceToTidalWater', source: 'DistanceToTidalWater', label: 'Distance To Tidal Water(miles)',
          idTemplate: 'distanceToTidalWater', type: 'number' },
        { key: 'protectionClass', source: 'ProtectionClass', label: 'Protection class',
          idTemplate: 'protectionClass', type: 'mat-select' },
        // Conditionally disabled by EZLynx — skip rather than fail.
        { key: 'noOfUnitsInFireDivision', source: 'NoOfUnitsInFireDivision',
          label: 'Number of Units in Fire Division',
          idTemplate: 'noOfUnitsInFireDivision', type: 'number',
          skipIfDisabled: true },
        { key: 'insideCityLimits', source: 'InsideCityLimits', label: 'Inside City Limits',
          idTemplate: 'insideCityLimits', type: 'mat-toggle' },
        { key: 'withinFireDistrict', source: 'WithinFireDistrict', label: 'Within Fire District',
          idTemplate: 'withinFireDistrict', type: 'mat-toggle' },

        // ── System updates (explicit per-system ids, no positional
        //    disambiguation) ───────────────────────────────────────────────
        { key: 'heatingUpdate', source: 'HeatingUpdate', label: 'Heating Update',
          idTemplate: 'heatingUpdate', type: 'mat-select' },
        { key: 'yearUpdatedHeating', source: 'HeatingUpdateYear', label: 'Year Updated (Heating)',
          idTemplate: 'yearUpdatedHeating', type: 'number' },
        { key: 'electricalUpdate', source: 'ElectricalUpdate', label: 'Electrical Update',
          idTemplate: 'electricalUpdate', type: 'mat-select' },
        { key: 'yearUpdatedElectrical', source: 'ElectricalUpdateYear', label: 'Year Updated (Electrical)',
          idTemplate: 'yearUpdatedElectrical', type: 'number' },
        { key: 'plumbingUpdate', source: 'PlumbingUpdate', label: 'Plumbing Update',
          idTemplate: 'plumbingUpdate', type: 'mat-select' },
        { key: 'yearUpdatedPlumbing', source: 'PlumbingUpdateYear', label: 'Year Updated (Plumbing)',
          idTemplate: 'yearUpdatedPlumbing', type: 'number' },
        { key: 'roofingUpdate', source: 'RoofingUpdate', label: 'Roofing Update',
          idTemplate: 'roofingUpdate', type: 'mat-select' },
        { key: 'yearUpdatedRoofing', source: 'RoofingUpdateYear', label: 'Year Updated (Roofing)',
          idTemplate: 'yearUpdatedRoofing', type: 'number' },

        // ── Discounts ────────────────────────────────────────────────────
        { key: 'multiPolicyDiscount', source: 'MultipolicyDiscount', label: 'Multipolicy Discount',
          idTemplate: 'multiPolicyDiscount', type: 'mat-toggle' },
        { key: 'nonSmoker', source: 'NonSmoker', label: 'Non Smoker',
          idTemplate: 'nonSmoker', type: 'mat-toggle' },
        { key: 'retireesCredit', source: 'RetireesCredit', label: 'Retirees Credit',
          idTemplate: 'retireesCredit', type: 'mat-toggle' },
        { key: 'matureDiscount', source: 'MatureDiscount', label: 'Mature Discount',
          idTemplate: 'matureDiscount', type: 'mat-toggle' },
        { key: 'retirementCommunity', source: 'RetirementCommunity', label: 'Retirement Community',
          idTemplate: 'retirementCommunity', type: 'mat-toggle' },
        { key: 'visibleToNeighbor', source: 'VisibleToNeighbor', label: 'Visible To Neighbor',
          idTemplate: 'visibleToNeighbor', type: 'mat-toggle' },
        { key: 'mannedSecurity', source: 'MannedSecurity', label: 'Manned Security',
          idTemplate: 'mannedSecurity', type: 'mat-toggle' },
        { key: 'limitedAccessCommunity', source: 'LimitedAccessCommunity', label: 'Limited Access Community',
          idTemplate: 'limitedAccessCommunity', type: 'mat-toggle' },
        { key: 'gatedCommunity', source: 'GatedCommunity', label: 'Gated Community',
          idTemplate: 'gatedCommunity', type: 'mat-toggle' },
    ];

    const api = { homeDwellingInfoAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        Object.assign(global.AltechV2.registries, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
