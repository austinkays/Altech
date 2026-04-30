/**
 * field-maps.js — EZLynx field maps ported straight from python_backend/ezlynx_filler.py.
 *
 * Two structures:
 *   SUBPAGE_FIELD_IDS  — per-subpage allowlist; key = field name, value = element ID
 *                        selector (or null for label-walk fallback). Captured from
 *                        real EZLynx DOM via MAT-SELECT INVENTORY across 7 Cowork
 *                        rounds. ~58 priority IDs total across 4 auto subpages.
 *   LABEL_PATTERNS     — fallback label-text patterns when ID isn't known.
 *                        Keys match SUBPAGE_FIELD_IDS so a field can fall back
 *                        cleanly.
 *
 * Loaded as a content-script before content.js — exposes via window.EZLYNX_MAPS.
 */
(function () {
    'use strict';

    // ── Subpage detection ─────────────────────────────────────────────
    const SUBPAGES = {
        applicant:           url => /\/account\/create\/personal|\/details/.test(url),
        'auto-coverage':     url => /\/rating\/auto\/.*coverage/.test(url),
        'auto-drivers':      url => /\/rating\/auto\/.*driver/.test(url),
        'auto-vehicles':     url => /\/rating\/auto\/.*vehicle/.test(url),
        'auto-policy-info':  url => /\/rating\/auto\//.test(url), // default for any /rating/auto/
        'home-coverage':     url => /\/rating\/home\/.*coverage/.test(url),
        'home-dwelling-info': url => /\/rating\/home\/.*dwelling/.test(url),
        'home-policy-info':  url => /\/rating\/home\//.test(url),
    };
    function detectSubpage(url) {
        if (!url) return null;
        const u = url.toLowerCase();
        for (const [name, test] of Object.entries(SUBPAGES)) {
            if (test(u)) return name;
        }
        return null;
    }

    // ── Per-subpage element-ID maps ───────────────────────────────────
    // Captured via Python filler MAT-SELECT INVENTORY in earlier rounds.
    // null = no priority ID, fall back to label-walk.
    const SUBPAGE_FIELD_IDS = {
        applicant: {
            // Applicant page — V1 worked here without IDs but having them
            // makes things deterministic. From Cowork's inventory dumps.
            Prefix:                 '#applicant-prefix',
            Suffix:                 '#applicant-name-suffix',
            State:                  '#applicant-rating-state',
            Gender:                 '#applicant-gender',
            MaritalStatus:          '#applicant-marital-status',
            DLStatus:               '#applicant-drivers-license-status',
            DLState:                '#applicant-drivers-license-state',
            Education:              '#applicant-education',
            Industry:               '#applicant-industry',
            Occupation:             '#applicant-occupation',
            ApplicantType:          '#applicant-type',
            LeadSource:             '#applicant-lead-channel',
            PreferredLanguage:      '#preferred-language',
            AddressType:            '#applicant-primary-address-applicantAddressType',
            PrimaryAddressState:    '#applicant-primary-address-addressState',
            PrimaryAddressCounty:   '#applicant-primary-address-addressCounty',
            YearsAtAddress:         '#applicant-primary-address-yearsAtAddress',
            MonthsAtAddress:        '#applicant-primary-address-monthsAtAddress',
            ContactMethod:          '#applicant-preferred-contact-method',
            ContactTime:            '#applicant-preferred-contact-time',
        },
        'auto-policy-info': {
            PriorCarrier:            '#priorCarrier',
            PriorPolicyTerm:         '#priorPolicyTerm',
            PriorLiabilityLimits:    '#priorLiabilityLimits',
            PriorYearsWithCarrier:   '#yearsWithPriorCarrier',
            YearsContinuousCoverage: '#yearsWithContinuousCoverage',
            CreditCheckAuth:         '#creditCheckAuthorized',
            PolicyTerm:              '#newPolicyTerm',
            PackageAuto:             '#package',
            AutoPolicyType:          '#policytypepa',
            PaperlessAuto:           '#coverage_paperlessauto_common',
            NumResidents:            '#numberofresidents_common',
            EffectiveDate:           null, // text input — handled by text fill path
        },
        'auto-drivers': {
            // Per-driver — driver-0 only for Phase 1; multi-driver iteration is Phase 2.
            // 'Education' deliberately NOT included — collides with "Driver Education"
            // (Yes/No question, not degree level).
            Gender:           '#driver-0-gender',
            MaritalStatus:    '#driver-0-maritalStatus',
            Industry:         '#driver-0-occupationIndustry',
            Occupation:       '#driver-0-occupationTitle',
            Relationship:     '#driver-0-relationship',
            DLStatus:         '#driver-0-driversLicenseStatus',
            DLState:          '#drpD1DLState',  // non-standard prefix
            AgeLicensed:      '#driver-0-ageLicensed',
            LicenseSuspended: '#driver-0-hasLicenseBeenSuspendedRecently',
            SR22Required:     '#driver-0-isSR22Required',
            FR44Required:     '#driver-0-isFR44Required',
            DriverEducation:  '#driver-0-hasTakenDriversEducation',
            MatureDriver:     '#driver-0-isMatureDriver',
            GoodDriver:       '#driver-0-isGoodDriver',
            GoodStudent:      '#driver-0-isGoodStudent',
            StudentFarAway:   '#driver-0-isStudentFarAway',
            RatedDriver:      '#driver-0-ratedDriver',
            DriverTelematics: '#driver_d1telematics_common',
        },
        'auto-coverage': {
            BodilyInjury:         '#bodily-injury',
            PropertyDamage:       '#property-damage',
            MedPaymentsAuto:      '#medical-payments',
            UMBI:                 '#uninsured-motorist',
            UnderinsuredMotorist: '#underinsured-motorist',
            UMPD:                 null, // state-specific (WAUMPD/CAUMPD/...) — label-walk
            PIP:                  null, // state-specific — label-walk
            Comprehensive:        '#vehicle-0-comprehensive',
            Collision:            '#vehicle-0-collision',
            TowingLabor:          '#vehicle-0-towingAndLabor',
            RentalReimbursement:  '#vehicle-0-extTransExpense',
            ResidenceIs:          '#residence',
        },
        'auto-vehicles': {
            VehicleYear:          '#selected-year-0',
            VehicleMake:          '#selected-make-0',
            VehicleModel:         '#selected-model-0',
            PassiveRestraints:    '#selected-restraint-0',
            AntiLockBrakes:       '#antilock-brakes-0',
            DaytimeRunningLights: '#daytime-runningLights-0',
            AntiTheft:            '#selected-antiTheft-0',
            VehicleUse:           '#selected-use-0',
            VehiclePerformance:   '#selected-performance-0',
            CarNew:               '#new-vehicle-0',
            OwnershipType:        '#selected-ownershipType-0',
            CarPool:              '#carpool-0',
            VehicleTelematics:    '#telematics-0',
            TransNetworkCompany:  '#transportation-network-coverage-0',
        },
    };

    // ── Per-subpage TEXT field input selectors (CSS) ──────────────────
    // These attempt direct ID match first, then fall back to label-near-input
    // patterns. Same idea as SUBPAGE_FIELD_IDS but for <input>.
    const SUBPAGE_TEXT_FIELDS = {
        applicant: {
            FirstName:      ["input[name*='FirstName' i]", "input[id*='FirstName' i]", "input[formcontrolname*='firstName' i]"],
            MiddleName:     ["input[name*='MiddleName' i]", "input[id*='MiddleName' i]", "input[formcontrolname*='middleName' i]"],
            LastName:       ["input[name*='LastName' i]", "input[id*='LastName' i]", "input[formcontrolname*='lastName' i]"],
            DOB:            ["input[name*='DateOfBirth' i]", "input[name*='DOB' i]", "input[id*='DOB' i]", "input[formcontrolname*='dob' i]"],
            SSN:            ["input[name*='SSN' i]", "input[id*='SSN' i]"],
            Email:          ["input[type='email']", "input[name*='Email' i]", "input[formcontrolname*='email' i]"],
            Phone:          ["input[name*='Phone' i]", "input[id*='Phone' i]", "input[formcontrolname*='phone' i]"],
            Address:        ["input[name*='Address' i][name*='Street' i]", "input[id*='addr' i][id*='street' i]", "input[id*='applicant-primary-address-addressStreet']"],
            City:           ["input[name*='City' i]", "input[id*='City' i]", "input[id*='applicant-primary-address-addressCity']"],
            Zip:            ["input[name*='Zip' i]", "input[name*='PostalCode' i]", "input[id*='Zip' i]", "input[id*='PostalCode' i]"],
            LicenseNumber:  ["input[name*='License' i]", "input[id*='License' i]", "input[id*='DL']"],
        },
        'auto-policy-info': {
            EffectiveDate:  ["input[name*='Effective' i]", "input[id*='Effective' i]", "input[formcontrolname*='effective' i]"],
        },
        'auto-drivers': {
            FirstName:      ["input[id*='driver-0-firstName' i]", "input[name*='FirstName' i]"],
            MiddleName:     ["input[id*='driver-0-middleName' i]"],
            LastName:       ["input[id*='driver-0-lastName' i]", "input[name*='LastName' i]"],
            DOB:            ["input[id*='driver-0-dob' i]", "input[id*='driver-0-dateOfBirth' i]"],
            LicenseNumber:  ["input[id*='driver-0-driverLicenseNumber' i]", "input[name*='License' i]"],
            StudentGPA:     ["input[id*='driver-0-gpa' i]", "input[name*='GPA' i]"],
        },
        'auto-vehicles': {},
        'auto-coverage': {},
    };

    // ── Label patterns for fallback matching ──────────────────────────
    // Used only when SUBPAGE_FIELD_IDS[subpage][key] === null. Order matters:
    // first match wins.
    const LABEL_PATTERNS = {
        UMPD:                  ['uninsured motorist property damage', 'umpd'],
        PIP:                   ['personal injury protection', 'pip'],
        EffectiveDate:         ['effective date', 'effective'],
    };

    // ── Value normalization ───────────────────────────────────────────
    // Altech sends raw values ('M', 'WA', 'BA'). Material typeahead
    // matches either way — V1 found this empirically. Pass through.
    const ABBREVIATIONS = {
        'M': 'Male', 'F': 'Female', 'X': 'Not Specified',
        'BA': 'Bachelors', 'MA': 'Masters', 'PHD': 'PhD',
        'WA': 'Washington', 'OR': 'Oregon', 'CA': 'California',
        'ID': 'Idaho', 'NV': 'Nevada', 'AZ': 'Arizona',
        // ... extend as needed; V1 had a more complete list at content.js:565
    };

    function expand(value) {
        if (!value) return '';
        const v = String(value).trim().toUpperCase();
        return ABBREVIATIONS[v] || String(value).trim();
    }

    // Public API
    window.EZLYNX_MAPS = Object.freeze({
        SUBPAGE_FIELD_IDS,
        SUBPAGE_TEXT_FIELDS,
        LABEL_PATTERNS,
        detectSubpage,
        expand,
    });
})();
