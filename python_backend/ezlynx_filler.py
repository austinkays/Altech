"""
EZLynx Smart Form Filler

Loads a client profile (JSON) and the scraped dropdown schema,
launches Chromium for manual login, then auto-fills text fields
and uses fuzzy matching to select the best dropdown options.

Handles Angular Material (mat-select), native <select>, and custom
dropdown components used by EZLynx.

Usage:
    python ezlynx_filler.py
    python ezlynx_filler.py --client client_data.json --schema ezlynx_schema.json
"""

import argparse
import difflib
import json
import os
import sys
import time

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print(
        "ERROR: playwright is not installed.\n"
        "  Run:  pip install playwright && python -m playwright install chromium",
        file=sys.stderr,
    )
    sys.exit(1)


EZLYNX_URL = "https://app.ezlynx.com"

# ── Field Mapping ────────────────────────────────────────────────
# Maps client_data keys → common EZLynx input selectors to try.
# Each entry is a list of CSS selectors, tried in order until one works.
TEXT_FIELD_MAP = {
    "FirstName": [
        "input[name*='FirstName' i]",
        "input[id*='FirstName' i]",
        "input[placeholder*='First Name' i]",
        "input[name*='fname' i]",
        "input[formcontrolname*='firstName' i]",
    ],
    "LastName": [
        "input[name*='LastName' i]",
        "input[id*='LastName' i]",
        "input[placeholder*='Last Name' i]",
        "input[name*='lname' i]",
        "input[formcontrolname*='lastName' i]",
    ],
    "MiddleName": [
        "input[name*='MiddleName' i]",
        "input[name*='MiddleInitial' i]",
        "input[id*='MiddleName' i]",
        "input[id*='MiddleInitial' i]",
        "input[placeholder*='Middle' i]",
        "input[formcontrolname*='middleName' i]",
    ],
    # Zip lives in the same visual row as Address State on the EZLynx
    # Personal Lines Applicant page, well above DOB. Filling it here
    # rather than alongside the address group makes the visual fill
    # animation track the form's top-to-bottom layout.
    "Zip": [
        "input[name*='Zip' i]",
        "input[name*='ZipCode' i]",
        "input[name*='PostalCode' i]",
        "input[id*='Zip' i]",
        "input[id*='PostalCode' i]",
        "input[placeholder*='Zip' i]",
        "input[formcontrolname*='zip' i]",
        "input[formcontrolname*='postalCode' i]",
    ],
    "DOB": [
        "input[name*='DateOfBirth' i]",
        "input[name*='DOB' i]",
        "input[id*='DateOfBirth' i]",
        "input[id*='DOB' i]",
        "input[name*='BirthDate' i]",
        "input[placeholder*='Date of Birth' i]",
        "input[placeholder*='MM/DD/YYYY' i]",
        "input[formcontrolname*='dob' i]",
        "input[formcontrolname*='dateOfBirth' i]",
    ],
    "SSN": [
        "input[name*='SSN' i]",
        "input[name*='SocialSecurity' i]",
        "input[id*='SSN' i]",
        "input[formcontrolname*='ssn' i]",
    ],
    "Email": [
        "input[name*='Email' i]",
        "input[id*='Email' i]",
        "input[type='email']",
        "input[placeholder*='Email' i]",
        "input[formcontrolname*='email' i]",
    ],
    "Phone": [
        "input[name*='Phone' i]",
        "input[name*='HomePhone' i]",
        "input[id*='Phone' i]",
        "input[type='tel']",
        "input[placeholder*='Phone' i]",
        "input[formcontrolname*='phone' i]",
    ],
    "CellPhone": [
        "input[name*='CellPhone' i]",
        "input[name*='MobilePhone' i]",
        "input[id*='CellPhone' i]",
        "input[formcontrolname*='cellPhone' i]",
    ],
    "Address": [
        "input[name*='Address' i]",
        "input[name*='StreetAddress' i]",
        "input[id*='Address' i]",
        "input[placeholder*='Address' i]",
        "input[name*='Street' i]",
        "input[formcontrolname*='address' i]",
    ],
    "City": [
        "input[name*='City' i]",
        "input[id*='City' i]",
        "input[placeholder*='City' i]",
        "input[formcontrolname*='city' i]",
    ],
    "LicenseNumber": [
        "input[name*='License' i]",
        "input[name*='DLNumber' i]",
        "input[id*='License' i]",
        "input[id*='DL' i]",
        "input[formcontrolname*='license' i]",
    ],
    "AccountName": [
        "input[name*='AccountName' i]",
        "input[id*='AccountName' i]",
        "input[formcontrolname*='accountName' i]",
    ],
    "Nickname": [
        "input[name*='Nickname' i]",
        "input[id*='Nickname' i]",
        "input[formcontrolname*='nickname' i]",
    ],
    "MaidenName": [
        "input[name*='Maiden' i]",
        "input[id*='Maiden' i]",
        "input[formcontrolname*='maidenName' i]",
    ],
    # ── Vehicle text fields ──
    "VIN": [
        "input[name*='VIN' i]", "input[id*='VIN' i]",
        "input[placeholder*='VIN' i]", "input[formcontrolname*='vin' i]",
    ],
    "VehicleMake": [
        "input[name*='Make' i]", "input[id*='Make' i]",
        "input[formcontrolname*='make' i]",
    ],
    "VehicleModel": [
        "input[name*='Model' i]", "input[id*='Model' i]",
        "input[formcontrolname*='model' i]",
    ],
    "AnnualMiles": [
        "input[name*='Miles' i]", "input[name*='Mileage' i]",
        "input[name*='AnnualMileage' i]", "input[formcontrolname*='annualMileage' i]",
    ],
    # ── Home / dwelling text fields ──
    "SqFt": [
        "input[name*='SqFt' i]", "input[name*='SquareFeet' i]",
        "input[name*='LivingArea' i]", "input[formcontrolname*='squareFeet' i]",
    ],
    "YearBuilt": [
        "input[name*='YearBuilt' i]", "input[id*='YearBuilt' i]",
        "input[formcontrolname*='yearBuilt' i]",
    ],
    "PurchaseDate": [
        "input[name*='PurchaseDate' i]", "input[name*='DateOfPurchase' i]",
        "input[formcontrolname*='purchaseDate' i]",
    ],
    "Mortgagee": [
        "input[name*='Mortgagee' i]", "input[name*='Lienholder' i]",
        "input[formcontrolname*='mortgagee' i]",
    ],
    "DwellingCoverage": [
        "input[name*='CoverageA' i]", "input[name*='DwellingCov' i]",
        "input[formcontrolname*='coverageA' i]",
    ],
    "GarageSpaces": [
        "input[name*='Garage' i]", "input[name*='GarageStalls' i]",
        "input[formcontrolname*='garage' i]",
    ],
    "NumFireplaces": [
        "input[name*='Fireplace' i]", "input[id*='Fireplace' i]",
        "input[formcontrolname*='fireplace' i]",
    ],
    # ── Policy text fields ──
    "EffectiveDate": [
        "input[name*='EffectiveDate' i]", "input[name*='InceptionDate' i]",
        "input[formcontrolname*='effectiveDate' i]",
    ],
    "StudentGPA": [
        "input[name*='GPA' i]", "input[id*='GPA' i]",
        "input[formcontrolname*='gpa' i]",
    ],
}

# ── Dropdown Label Mappings (page-aware) ────────────────────────
#
# The filler detects which EZLynx page is open and only tries
# the relevant dropdown label patterns, avoiding conflicts when
# the same label (e.g. "prior carrier") appears on different pages.

# Base labels — safe on ANY page (applicant, drivers, lead info, etc.)
BASE_DROPDOWN_LABELS = {
    # Order is intentional — dict iteration order matches visual top-to-bottom
    # on the EZLynx Personal Lines Applicant page so the user sees a clean
    # left-to-right, top-to-bottom fill animation instead of a scattered one.
    # Insertion order is preserved in Python 3.7+.
    "State":           ["address state", "state"],
    "Suffix":          ["suffix"],
    "Prefix":          ["prefix"],
    "Gender":          ["gender"],
    "MaritalStatus":   ["marital status", "marital"],
    "DLStatus":        ["dl status", "license status", "driver license status"],
    "Education":       ["education"],
    # Industry must precede Occupation — Occupation's option list is
    # data-dependent on Industry. With dict insertion order preserved,
    # iteration fills Industry first.
    "Industry":        ["occupation industry", "industry"],
    "Occupation":      ["occupation title", "occupation"],
    # Primary Address > County — separate from the rating-level State.
    # EZLynx auto-syncs Primary Address > State from the rating Address State,
    # so we deliberately do NOT define a PrimaryAddressState entry here
    # (would be a redundant fill). County is its own selection driven by
    # the synced state's options, so we fill it explicitly.
    "PrimaryAddressCounty": ["county"],
    "Relationship":    ["relationship", "relation"],
    "ApplicantType":   ["applicant type"],
    "LeadSource":      ["lead source"],
    "Language":        ["preferred language", "language"],
    "AddressType":     ["address type"],
    "YearsAtAddress":  ["years at address"],
    "MonthsAtAddress": ["months at address"],
    "PhoneType":       ["phone type"],
    "ContactMethod":   ["contact method"],
    "ContactTime":     ["contact time"],
    "EmailType":       ["email type"],
}

# Auto-specific labels — only tried on /rating/auto/ pages
AUTO_DROPDOWN_LABELS = {
    # ── Policy Info ──
    "AutoPolicyType":          ["policy type"],
    "PolicyTerm":              ["new policy term", "policy term"],
    "PriorCarrier":            ["prior carrier"],
    "PriorPolicyTerm":         ["prior policy term"],
    "PriorYearsWithCarrier":   ["years with prior carrier"],
    "PriorLiabilityLimits":    ["prior liability limits"],
    "YearsContinuousCoverage": ["years with continuous coverage"],
    "CreditCheckAuth":         ["credit check"],
    "NumResidents":            ["number of residents"],
    "PackageAuto":             ["package"],
    # ── Drivers ──
    "DLState":           ["license state", "dl state", "driver license state"],
    "AgeLicensed":       ["age licensed"],
    "DriverEducation":   ["driver education"],
    "GoodDriver":        ["good driver"],
    "MatureDriver":      ["mature driver"],
    "SR22Required":      ["sr-22 required", "sr22"],
    "FR44Required":      ["fr-44 required", "fr44"],
    "LicenseSuspended":  ["license sus/rev"],
    # ── Vehicles ──
    "VehicleYear":          ["year"],
    "VehicleUse":           ["vehicle use"],
    "PassiveRestraints":    ["passive restraints"],
    "AntiLockBrakes":       ["anti-lock brakes"],
    "DaytimeRunningLights": ["daytime running lights"],
    "AntiTheft":            ["anti-theft"],
    "VehiclePerformance":   ["performance"],
    "OwnershipType":        ["ownership type"],
    "CarNew":               ["was the car new"],
    "CarPool":              ["car pool"],
    # ── Coverage ──
    "BodilyInjury":    ["bodily injury"],
    "PropertyDamage":  ["property damage"],
    "MedPaymentsAuto": ["medical payments"],
    "Comprehensive":   ["comprehensive"],
    "Collision":       ["collision"],
    "UMPD":            ["uninsured motorist property damage"],
    "ResidenceIs":     ["residence is"],
    # ── Previously unmapped (scraped from schema) ──
    "PaperlessAuto":        ["paperless"],
    "DriverTelematics":     ["telematics"],
    "VehicleTelematics":    ["telematics"],
    "TransNetworkCompany":  ["transportation network company", "transportation network"],
    "VehicleSalvaged":      ["salvaged"],
}

# Home-specific labels — only tried on /rating/home/ pages
HOME_DROPDOWN_LABELS = {
    # ── Rating / Policy ──
    "HomePolicyType":    ["policy/form type", "policy type"],
    "HomePriorCarrier":  ["prior carrier"],
    "QuoteAsPackage":    ["quote as package", "package"],
    # ── Dwelling Info ──
    "DwellingUsage":     ["dwelling usage"],
    "OccupancyType":     ["occupancy type"],
    "DwellingType":      ["dwelling type"],
    "NumStories":        ["number of stories"],
    "ConstructionStyle": ["construction style"],
    "RoofType":          ["roof type"],
    "RoofDesign":        ["roof design"],
    "FoundationType":    ["foundation type", "foundation"],
    "ExteriorWalls":     ["exterior walls"],
    "HeatingType":       ["heating type"],
    "SecondaryHeating":  ["secondary heating source type", "secondary heating"],
    "BurglarAlarm":      ["burglar alarm"],
    "FireDetection":     ["fire detection"],
    "SprinklerSystem":   ["sprinkler system"],
    "SmokeDetector":     ["smoke detector"],
    "ProtectionClass":   ["protection class"],
    "FeetFromHydrant":   ["feet from hydrant"],
    "NumFullBaths":      ["number of full baths"],
    "NumHalfBaths":      ["number of half baths"],
    "NumOccupants":      ["number of occupants"],
    "HeatingUpdate":     ["heating update"],
    "ElectricalUpdate":  ["electrical update"],
    "PlumbingUpdate":    ["plumbing update"],
    "RoofingUpdate":     ["roofing update"],
    "WoodBurningStoves": ["# of wood burning stoves", "wood burning stoves"],
    # ── Coverage ──
    "HomePersonalLiability": ["personal liability"],
    "HomeMedicalPayments":  ["medical payments"],
    "AllPerilsDeductible":  ["all perils deductible"],
    "TheftDeductible":      ["theft deductible"],
    "WindDeductible":       ["wind deductible"],
    # ── Endorsements ──
    "IncreasedReplacementCost": ["increased replacement cost dwelling percentage"],
    "LossAssessment":          ["loss assessment"],
    "OrdinanceOrLaw":          ["ordinance or law"],
    "WaterBackup":             ["water backup"],
    "EarthquakeZone":          ["earthquake zone"],
    # ── Previously unmapped (scraped from schema) ──
    "MortgageBilled":       ["mortgage billed"],
    "PaperlessHome":        ["paperless"],
    "DistanceTidalWater":   ["distance to tidal water"],
    "BuildingSettlement":   ["cov a plus", "building settlement"],
    "EarthquakeDeductible": ["deductible"],
    "IncreasedCreditCard":  ["increased coverage on credit card"],
    "IncreasedJewelry":     ["increased limit on jewelry"],
    "IncreasedMold":        ["increased mold property damage"],
}

# Lead Info page labels
LEAD_DROPDOWN_LABELS = {
    "LeadPriority": ["priority"],
    "LeadStatus":   ["lead status"],
}


def get_active_dropdowns(url):
    """Return the dropdown label mappings appropriate for the current page URL."""
    url_lower = (url or "").lower()
    active = dict(BASE_DROPDOWN_LABELS)

    if "/rating/auto/" in url_lower:
        active.update(AUTO_DROPDOWN_LABELS)
    elif "/rating/home/" in url_lower:
        active.update(HOME_DROPDOWN_LABELS)

    if "/lead-info" in url_lower:
        active.update(LEAD_DROPDOWN_LABELS)

    return active


# Also try native <select> selectors as fallback
DROPDOWN_SELECT_MAP = {
    "Gender": [
        "select[name*='Gender' i]", "select[id*='Gender' i]",
        "select[formcontrolname*='gender' i]",
    ],
    "MaritalStatus": [
        "select[name*='Marital' i]", "select[id*='Marital' i]",
        "select[formcontrolname*='marital' i]",
    ],
    "State": [
        "select[name='State' i]", "select[id='State' i]",
        "select[name*='AddressState' i]", "select[id*='AddressState' i]",
        "select[formcontrolname*='state' i]",
    ],
    "Suffix": [
        "select[name*='Suffix' i]", "select[id*='Suffix' i]",
    ],
    "Prefix": [
        "select[name*='Prefix' i]", "select[id*='Prefix' i]",
    ],
    "Education": [
        "select[name*='Education' i]", "select[id*='Education' i]",
    ],
    "Occupation": [
        "select[name*='Occupation' i]", "select[id*='Occupation' i]",
    ],
    "Industry": [
        "select[name*='Industry' i]", "select[id*='Industry' i]",
    ],
    "ApplicantType": [
        "select[name*='Applicant' i]", "select[id*='Applicant' i]",
    ],
    "DLStatus": [
        "select[name*='DLStatus' i]", "select[id*='DLStatus' i]",
        "select[name*='LicenseStatus' i]",
    ],
    "DLState": [
        "select[name*='LicenseState' i]", "select[name*='DLState' i]",
        "select[id*='LicenseState' i]", "select[id*='DLState' i]",
    ],
    "LeadSource": [
        "select[name*='LeadSource' i]", "select[id*='LeadSource' i]",
        "select[name*='Lead' i]",
    ],
    "Language": [
        "select[name*='Language' i]", "select[id*='Language' i]",
    ],
    "County": [
        "select[name*='County' i]", "select[id*='County' i]",
        "select[formcontrolname*='county' i]",
    ],
    "YearsAtAddress": [
        "select[name*='YearsAtAddress' i]", "select[id*='YearsAtAddress' i]",
        "select[name*='YearsAt' i]", "select[formcontrolname*='yearsAt' i]",
    ],
    "MonthsAtAddress": [
        "select[name*='MonthsAtAddress' i]", "select[id*='MonthsAtAddress' i]",
        "select[formcontrolname*='monthsAt' i]",
    ],
}

# Common abbreviation expansions for fuzzy matching
ABBREVIATIONS = {
    # Personal
    "M":         "Male",
    "F":         "Female",
    "S":         "Single",
    "D":         "Divorced",
    "W":         "Widowed",
    "SEP":       "Separated",
    "DP":        "Domestic Partner",
    # States (all 50 + DC + territories)
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    # Education
    "HS":        "High School Diploma",
    "BA":        "Bachelors",
    "BS":        "Bachelors",
    "MA":        "Masters",
    "PHD":       "Phd",
    "GED":       "High School Diploma",
    "JD":        "Law Degree",
    "MD":        "Medical Degree",
    # Name suffixes / prefixes
    "JR":        "Jr",
    "SR":        "Sr",
    "II":        "II",
    "III":       "III",
    "MR":        "Mr",
    "MRS":       "Mrs",
    "DR":        "Dr",
    # Vehicle / dwelling
    "COMMUTE":         "To/From Work",
    "WORK":            "To/From Work",
    "SCHOOL":          "To/From School",
    "SINGLE FAMILY":   "One Family",
    "CONDO":           "Condo",
    "TOWNHOME":        "Townhouse",
    "ROW HOUSE":       "Rowhouse",
    "DUPLEX":          "Two Family",
    "TRIPLEX":         "Three Family",
    "FOURPLEX":        "Four Family",
    # Dwelling details
    "TENANT OCCUPIED": "Renter Occupied",
    "CRAWLSPACE":      "Crawl Space - Enclosed",
    "BASEMENT FINISHED": "Basement - Finished",
    "BASEMENT (FINISHED)": "Basement - Finished",
    "BASEMENT UNFINISHED": "Basement - Unfinished",
    "BASEMENT (UNFINISHED)": "Basement - Unfinished",
    "SLAB":            "Slab",
    "PIER/PILE":       "Pilings/stilts",
    # Alarms
    "MONITORED":       "Central",
    "LOCAL":           "Local",
    "NONE":            "None",
    # Roof
    "GABLE":           "Gable",
    "HIP":             "Hip",
    "FLAT":            "Flat",
    "GAMBREL":         "Gambrel",
    # Insurance / coverage
    "HO3":             "HO3 - Dwelling",
    "HO4":             "HO4 - Renters",
    "HO5":             "HO5",
    "HO6":             "HO6 - Condo",
    "NO COVERAGE":     "No Coverage",
}


# ── JavaScript helpers that run IN the browser ──

# Find a dropdown by its visible label text on the page
FIND_DROPDOWN_BY_LABEL_JS = """
(labelPatterns) => {
    // Normalize text for comparison
    function norm(s) { return (s || '').replace(/[\\*\\:]/g, '').trim().toLowerCase(); }

    // Strategy A — scan all label-like elements, then walk to nearby dropdown.
    // Gather all visible label-like elements.
    // Angular Material 15+ uses <mat-label> (a custom element, not <label>),
    // which is why we must list it explicitly — generic 'label' selectors miss it.
    const labels = document.querySelectorAll(
        'label, legend, mat-label, .mat-form-field-label, [class*="label"], ' +
        '[class*="form-field"] > span, [class*="form-field"] > div'
    );

    // Strategy B — scan all dropdowns, then look up their aria-labelledby
    // label and check if its text matches. More robust because it follows
    // the accessibility linkage Angular Material always sets up.
    function checkAriaLinkage(pat) {
        const dropdowns = document.querySelectorAll(
            'mat-select, select, [role="listbox"], [role="combobox"]'
        );
        for (const dd of dropdowns) {
            const lblId = dd.getAttribute('aria-labelledby');
            if (!lblId) continue;
            const lblEl = document.getElementById(lblId);
            if (!lblEl) continue;
            const lblText = norm(lblEl.textContent);
            if (!lblText || lblText.length > 60) continue;
            if (lblText !== pat && !lblText.includes(pat)) continue;
            const id = dd.id || '';
            return {
                found: true,
                type: dd.tagName.toLowerCase(),
                id: id,
                selector: id ? '#' + id : null,
                via: 'aria-labelledby',
            };
        }
        return null;
    }

    // Strategy C — fallback: match dropdowns by id or name attribute.
    // EZLynx uses patterns like id="applicant-state" / name="state".
    function checkIdOrName(pat) {
        const sluggedPat = pat.replace(/\\s+/g, ''); // "address state" -> "addressstate"
        const dropdowns = document.querySelectorAll(
            'mat-select, select, [role="listbox"], [role="combobox"]'
        );
        for (const dd of dropdowns) {
            const id = (dd.id || '').toLowerCase();
            const nm = (dd.getAttribute('name') || '').toLowerCase();
            const fc = (dd.getAttribute('formcontrolname') || '').toLowerCase();
            const haystack = id + '|' + nm + '|' + fc;
            // Match against the slugged pattern (no spaces) and also each token
            const tokens = pat.split(/\\s+/).filter(t => t.length >= 3);
            const allTokensHit = tokens.length > 0 && tokens.every(t => haystack.includes(t));
            if (haystack.includes(sluggedPat) || allTokensHit) {
                return {
                    found: true,
                    type: dd.tagName.toLowerCase(),
                    id: dd.id,
                    selector: dd.id ? '#' + dd.id : null,
                    via: 'id-or-name',
                };
            }
        }
        return null;
    }

    for (const pattern of labelPatterns) {
        const pat = pattern.toLowerCase();

        // Strategy A — label-text walk
        for (const lbl of labels) {
            const text = norm(lbl.textContent);
            if (!text || text.length > 60) continue;
            if (text !== pat && !text.includes(pat)) continue;

            // Found a matching label — now find the nearest dropdown

            // 1. Check label[for] -> element by id
            const forId = lbl.getAttribute('for') || lbl.htmlFor;
            if (forId) {
                const el = document.getElementById(forId);
                if (el && (el.tagName === 'SELECT' || el.tagName === 'MAT-SELECT' ||
                    el.getAttribute('role') === 'listbox' || el.getAttribute('role') === 'combobox')) {
                    return { found: true, type: el.tagName.toLowerCase(), id: forId, selector: '#' + forId };
                }
            }

            // 2. Look for a select/mat-select in the same parent container
            const container = lbl.closest(
                '.mat-form-field, fieldset, .form-group, .form-field, ' +
                '[class*="form-field"], [class*="form-group"], .field-wrapper, ' +
                '.col, .column, [class*="col-"]'
            ) || lbl.parentElement;

            if (container) {
                // Check native select
                const sel = container.querySelector('select');
                if (sel) {
                    const id = sel.id || sel.name || '';
                    return {
                        found: true, type: 'select', id: id,
                        selector: id ? '#' + id : null,
                    };
                }

                // Check mat-select
                const matSel = container.querySelector('mat-select, [role="listbox"], [role="combobox"]');
                if (matSel) {
                    const id = matSel.id || '';
                    return {
                        found: true, type: 'mat-select', id: id,
                        selector: id ? '#' + id : null,
                        containerIndex: Array.from(document.querySelectorAll(
                            '.mat-form-field, fieldset, [class*="form-field"]'
                        )).indexOf(container),
                    };
                }
            }

            // 3. Check next sibling
            let next = lbl.nextElementSibling;
            while (next) {
                if (next.tagName === 'SELECT') {
                    return { found: true, type: 'select', id: next.id, selector: next.id ? '#' + next.id : null };
                }
                if (next.tagName === 'MAT-SELECT' || next.getAttribute('role') === 'listbox') {
                    return { found: true, type: 'mat-select', id: next.id, selector: next.id ? '#' + next.id : null };
                }
                next = next.nextElementSibling;
            }
        }

        // Strategy B — aria-labelledby reverse lookup
        const ariaHit = checkAriaLinkage(pat);
        if (ariaHit) return ariaHit;

        // Strategy C — id/name pattern fallback
        const idHit = checkIdOrName(pat);
        if (idHit) return idHit;
    }

    // No match — return diagnostic info so the next dev round can see what's
    // actually on the page (label texts + dropdown ids/names).
    const matLabelTexts = Array.from(document.querySelectorAll('mat-label'))
        .map(el => (el.textContent || '').trim()).filter(t => t).slice(0, 30);
    const dropdownAttrs = Array.from(document.querySelectorAll(
        'mat-select, [role="combobox"], [role="listbox"]'
    )).map(dd => ({
        id: dd.id || null,
        name: dd.getAttribute('name') || null,
        formcontrolname: dd.getAttribute('formcontrolname') || null,
        ariaLabelledby: dd.getAttribute('aria-labelledby') || null,
    })).slice(0, 30);
    return { found: false, debug: { matLabelTexts, dropdownAttrs } };
}
"""

# Get options from a native <select> by selector or id
GET_SELECT_OPTIONS_JS = """
(selectorOrId) => {
    let el = document.querySelector(selectorOrId);
    if (!el && selectorOrId) el = document.getElementById(selectorOrId);
    if (!el || el.tagName !== 'SELECT') return [];
    const opts = [];
    el.querySelectorAll('option').forEach(o => {
        const t = o.textContent.trim();
        const v = o.value || '';
        if (t && !['', 'select', 'select one', '--select--', '-- select --', 'choose'].includes(t.toLowerCase())) {
            opts.push({ text: t, value: v });
        }
    });
    return opts;
}
"""


def smart_select_native(page, selectors, target_value, schema_options=None):
    """Select a value in a native <select> element using fuzzy matching.
    Returns (success: bool, diag: dict) with diagnostic details."""
    diag = {'method': 'native', 'target': target_value, 'expanded': None,
            'element_found': False, 'options_count': 0, 'options_sample': [],
            'match_method': None, 'matched_text': None, 'error': None}

    if not target_value or not target_value.strip():
        diag['error'] = 'ERR_EMPTY_VALUE'
        return False, diag

    target = target_value.strip()
    expanded = ABBREVIATIONS.get(target.upper(), target)
    diag['expanded'] = expanded if expanded != target else None

    # Find the select element
    select_el = None
    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                select_el = loc.first
                break
        except Exception:
            continue

    if not select_el:
        diag['error'] = 'ERR_ELEMENT_NOT_FOUND'
        return False, diag

    diag['element_found'] = True

    # Get options
    actual_options = []
    try:
        opts = select_el.locator("option")
        for i in range(opts.count()):
            text = opts.nth(i).inner_text().strip()
            value = opts.nth(i).get_attribute("value") or ""
            if text and text.lower() not in ("", "select", "select one", "-- select --", "--select--", "choose"):
                actual_options.append({"text": text, "value": value})
    except Exception:
        pass

    option_texts = [o["text"] for o in actual_options]
    diag['options_count'] = len(actual_options)
    diag['options_sample'] = option_texts[:8]  # first 8 for diagnostics

    # Try exact, expanded, fuzzy, substring
    for attempt in [target, expanded]:
        for opt in actual_options:
            if opt["text"].lower() == attempt.lower() or opt["value"].lower() == attempt.lower():
                try:
                    select_el.select_option(label=opt["text"])
                    diag['match_method'] = 'exact'
                    diag['matched_text'] = opt["text"]
                    return True, diag
                except Exception:
                    try:
                        select_el.select_option(value=opt["value"])
                        diag['match_method'] = 'exact_value'
                        diag['matched_text'] = opt["value"]
                        return True, diag
                    except Exception as e:
                        diag['error'] = f'ERR_SELECT_FAILED: {e}'

    # Fuzzy
    candidates = option_texts + (schema_options or [])
    for attempt in [expanded, target]:
        matches = difflib.get_close_matches(attempt, candidates, n=3, cutoff=0.4)
        if matches:
            diag['fuzzy_candidates'] = matches
            best = matches[0]
            for opt in actual_options:
                if opt["text"].lower() == best.lower():
                    try:
                        select_el.select_option(label=opt["text"])
                        diag['match_method'] = 'fuzzy'
                        diag['matched_text'] = opt["text"]
                        return True, diag
                    except Exception as e:
                        diag['error'] = f'ERR_FUZZY_SELECT_FAILED: {e}'

    # Substring
    for opt in actual_options:
        if target.lower() in opt["text"].lower() or opt["text"].lower() in target.lower():
            try:
                select_el.select_option(label=opt["text"])
                diag['match_method'] = 'substring'
                diag['matched_text'] = opt["text"]
                return True, diag
            except Exception as e:
                diag['error'] = f'ERR_SUBSTRING_SELECT_FAILED: {e}'

    diag['error'] = 'ERR_NO_MATCH'
    return False, diag


def smart_select_custom(page, label_patterns, target_value, schema_options=None):
    """
    Select a value in an Angular Material / custom dropdown.
    Returns (success: bool, diag: dict) with diagnostic details.
    """
    diag = {'method': 'custom', 'target': target_value, 'expanded': None,
            'label_patterns': label_patterns, 'label_found': False,
            'dropdown_type': None, 'overlay_opened': False,
            'options_count': 0, 'options_sample': [],
            'match_method': None, 'matched_text': None, 'error': None}

    if not target_value or not target_value.strip():
        diag['error'] = 'ERR_EMPTY_VALUE'
        return False, diag

    target = target_value.strip()
    expanded = ABBREVIATIONS.get(target.upper(), target)
    diag['expanded'] = expanded if expanded != target else None

    # Step 1: Find the dropdown element by label
    try:
        result = page.evaluate(FIND_DROPDOWN_BY_LABEL_JS, label_patterns)
    except Exception as e:
        diag['error'] = f'ERR_LABEL_SEARCH: {e}'
        return False, diag

    if not result.get("found"):
        diag['error'] = 'ERR_LABEL_NOT_FOUND'
        # Surface the page debug info so we can see what mat-labels
        # and dropdowns ARE on the page when matching fails.
        debug = result.get('debug') or {}
        diag['mat_labels_on_page'] = debug.get('matLabelTexts', [])
        diag['dropdowns_on_page'] = debug.get('dropdownAttrs', [])
        return False, diag

    diag['label_found'] = True
    diag['match_via'] = result.get('via', 'label-walk')
    dd_type = result.get("type", "")
    dd_selector = result.get("selector")
    dd_id = result.get("id", "")
    diag['dropdown_type'] = dd_type
    diag['dropdown_id'] = dd_id

    # Step 2: If it's a native select, use the standard method
    if dd_type == "select":
        selectors = []
        if dd_selector:
            selectors.append(dd_selector)
        if dd_id:
            selectors.append(f"#{dd_id}")
            selectors.append(f"select#{dd_id}")
        if selectors:
            return smart_select_native(page, selectors, target_value, schema_options)
        diag['error'] = 'ERR_NO_SELECTOR_FOR_NATIVE'
        return False, diag

    # Step 3: It's a custom dropdown (mat-select, role=listbox, etc.)
    # Click to open the panel
    dropdown_el = None
    try:
        if dd_selector:
            dropdown_el = page.locator(dd_selector).first
        elif dd_id:
            dropdown_el = page.locator(f"#{dd_id}").first

        if not dropdown_el or not dropdown_el.is_visible():
            # Try finding by container index
            idx = result.get("containerIndex", -1)
            if idx >= 0:
                containers = page.locator(".mat-form-field, fieldset, [class*='form-field']")
                if containers.count() > idx:
                    dropdown_el = containers.nth(idx).locator("mat-select, [role='listbox'], [role='combobox']").first
    except Exception:
        pass

    if not dropdown_el:
        diag['error'] = 'ERR_DROPDOWN_ELEMENT_NOT_FOUND'
        return False, diag

    try:
        # Round 6 finding (Cowork): force=True bypasses the actionability check
        # but the click is still hit-tested at the element's center, which the
        # mdc-notched-outline label covers. Angular Material's global form-field
        # listener opens the overlay visually, but the mat-select trigger's OWN
        # click handler — which kicks off the async option-load API call — never
        # fires. Result: overlay opens, options never appear, keyboard typeahead
        # has nothing to match. Manual user clicks land on the chevron arrow at
        # the right edge (not covered by the label), so they work instantly.
        #
        # Strategy ladder, real-mouse-equivalents first, force/JS as fallback:
        click_method = 'failed'
        # 1. Click the .mat-mdc-select-arrow chevron child — child of the
        #    trigger, NOT covered by the notched-outline label. Bubbles
        #    through the trigger's click handler the way a real click does.
        try:
            arrow = dropdown_el.locator('.mat-mdc-select-arrow').first
            if arrow.count() > 0:
                arrow.click(timeout=3000)
                click_method = 'arrow'
        except Exception:
            pass
        # 2. Click the .mat-mdc-select-trigger inner div directly.
        if click_method == 'failed':
            try:
                trigger = dropdown_el.locator('.mat-mdc-select-trigger').first
                if trigger.count() > 0:
                    trigger.click(timeout=3000)
                    click_method = 'trigger'
            except Exception:
                pass
        # 3. CDP-level mouse click at the right edge of the bbox (chevron
        #    position) — proper hit-test with no notched-outline interference.
        if click_method == 'failed':
            try:
                box = dropdown_el.bounding_box()
                if box:
                    x = box['x'] + box['width'] - 12
                    y = box['y'] + box['height'] / 2
                    page.mouse.click(x, y)
                    click_method = 'bbox-edge'
            except Exception:
                pass
        # 4. force=True click — legacy path. May not trigger option load.
        if click_method == 'failed':
            try:
                dropdown_el.click(force=True, timeout=5000)
                click_method = 'force'
            except Exception:
                pass
        # 5. Pure JS click — synthetic, last resort.
        if click_method == 'failed':
            try:
                dropdown_el.evaluate("el => el.click()")
                click_method = 'js'
            except Exception:
                pass
        diag['click_method'] = click_method
        if click_method == 'failed':
            diag['error'] = 'ERR_CLICK_FAILED'
            return False, diag
        # Wait for Angular Material overlay to appear instead of blind sleep
        try:
            page.wait_for_selector(
                '.cdk-overlay-container mat-option, .cdk-overlay-container [role="option"], '
                '[role="listbox"] [role="option"], .mat-select-panel mat-option',
                state='visible', timeout=5000
            )
        except PWTimeout:
            pass  # Overlay may not appear if keyboard shortcut works first
    except Exception as e:
        diag['error'] = f'ERR_CLICK_FAILED: {e}'
        return False, diag

    diag['overlay_opened'] = True

    # Helper: poll cdk-overlay for at least one option to render.
    # Round 5 finding: Angular Material can open the overlay BEFORE
    # streaming options in. wait_for_selector(state='visible') returns as
    # soon as the panel exists, even if options=0. Poll the count until
    # we have something to type/click against.
    OPTION_SEL = (
        '.cdk-overlay-container mat-option, '
        '.cdk-overlay-container [role="option"], '
        '.mat-select-panel mat-option'
    )
    def _wait_for_options(max_ms=3000, poll_ms=100):
        deadline = time.time() + (max_ms / 1000.0)
        last = 0
        while time.time() < deadline:
            try:
                last = page.locator(OPTION_SEL).count()
                if last > 0:
                    return last
            except Exception:
                pass
            time.sleep(poll_ms / 1000.0)
        return last

    # Force focus onto the mat-select trigger. force=True bypasses
    # actionability AND focus management, so keyboard typing was going
    # nowhere on State/Occupation. Explicit focus puts the listbox at
    # the keyboard target.
    try:
        dropdown_el.evaluate("el => el.focus && el.focus()")
    except Exception:
        pass

    # Helper: read the mat-select's displayed value to verify a fill actually
    # committed. Cowork Round 4 caught the false-positive: with force=True
    # bypassing actionability + focus, keyboard-typeahead can type into nothing,
    # the overlay closes on click-out, and the script declared success without
    # the value sticking. Verifying via DOM closes that hole.
    # Returns: True (verified stuck), False (definitely empty), None (unknown).
    def _verify_value_committed(expected_pool):
        if not dd_id:
            return None
        try:
            data = page.evaluate("""
                (id) => {
                    const el = document.getElementById(id);
                    if (!el) return null;
                    const cls = el.className || '';
                    const valEl = el.querySelector('.mat-mdc-select-min-line')
                               || el.querySelector('.mat-mdc-select-value-text')
                               || el.querySelector('.mat-select-value-text');
                    return {
                        empty: cls.includes('mat-mdc-select-empty'),
                        ariaInvalid: el.getAttribute('aria-invalid'),
                        text: valEl ? (valEl.textContent || '').trim() : '',
                    };
                }
            """, dd_id)
        except Exception:
            return None
        if not data:
            return None
        if data.get('empty') or data.get('ariaInvalid') == 'true':
            return False
        text = (data.get('text') or '').lower()
        if not text:
            return False
        for needle in expected_pool:
            if not needle:
                continue
            n = needle.lower()
            if n == text or n in text or text in n:
                return True
        return False  # has some text but not what we expected

    # Step 3b: Try keyboard shortcut first (faster for long lists like States)
    # Angular Material mat-selects support typing to jump to matching options.
    # Wait for at least one option to render before typing — typing into an
    # empty overlay does nothing and the overlay closes on Enter, false-success.
    options_visible = _wait_for_options(max_ms=3000)
    diag['options_loaded_count'] = options_visible
    try:
        # Type the RAW target to filter/jump, then press Enter.
        # Material typeahead matches either way — typing "WA" narrows
        # to "WA" (code-style options) AND to "Washington" (name-style
        # options, by first-letter jumping). Typing the expanded form
        # ("Washington") only works for name-style dropdowns and breaks
        # silently on code dropdowns like State, where it fails verify
        # and forces a slow re-open/option-click fallback (~5s).
        # The expanded form is still used by the option-click fuzzy
        # matcher in the fallback path, so we don't lose that capability.
        type_value = target
        page.keyboard.type(type_value, delay=50)
        time.sleep(0.15)  # Brief pause for typeahead filter
        page.keyboard.press("Enter")
        # Wait for overlay to close (indicates successful selection)
        try:
            page.wait_for_selector(
                '.cdk-overlay-container mat-option, .mat-select-panel',
                state='hidden', timeout=2000
            )
        except PWTimeout:
            pass

        # Check if the dropdown closed (successful selection)
        overlay_still_open = False
        try:
            overlay_still_open = page.locator(".cdk-overlay-container mat-option, .cdk-overlay-container [role='option']").count() > 0
        except Exception:
            pass

        if not overlay_still_open:
            # Verify the value actually persisted before declaring success.
            # When verification is impossible (no dd_id), trust the overlay
            # close and continue — preserves prior behavior for legacy paths.
            verified = _verify_value_committed([type_value, expanded, target])
            if verified is True:
                diag['match_method'] = 'keyboard'
                diag['matched_text'] = type_value
                diag['verified'] = True
                return True, diag
            elif verified is None:
                diag['match_method'] = 'keyboard'
                diag['matched_text'] = type_value
                diag['verified'] = 'unknown'
                return True, diag
            # verified is False — overlay closed but value did NOT stick.
            # Don't return success; fall through to direct option-click below.
            diag['keyboard_attempted_but_not_persisted'] = True
    except Exception:
        pass

    # Step 3c: If keyboard typing didn't persist, re-open the dropdown so
    # Step 4 can find options and click one directly. Use the same chevron-
    # first click ladder as the initial open — force-click on the wrapper
    # would re-trigger the same hit-test problem the chevron click solves.
    if diag.get('keyboard_attempted_but_not_persisted'):
        reopened = False
        try:
            arrow = dropdown_el.locator('.mat-mdc-select-arrow').first
            if arrow.count() > 0:
                arrow.click(timeout=3000)
                reopened = True
        except Exception:
            pass
        if not reopened:
            try:
                box = dropdown_el.bounding_box()
                if box:
                    page.mouse.click(box['x'] + box['width'] - 12,
                                     box['y'] + box['height'] / 2)
                    reopened = True
            except Exception:
                pass
        if not reopened:
            try:
                dropdown_el.click(force=True, timeout=5000)
            except Exception:
                try:
                    dropdown_el.evaluate("el => el.click()")
                except Exception:
                    pass
        try:
            dropdown_el.evaluate("el => el.focus && el.focus()")
        except Exception:
            pass
        _wait_for_options(max_ms=3000)

    # Step 4: Find options in the overlay panel
    # Angular Material renders options in a CDK overlay at document body level
    option_texts = []
    try:
        # Try multiple selectors for overlay options
        overlay_selectors = [
            ".cdk-overlay-container mat-option",
            ".cdk-overlay-container [role='option']",
            "[role='listbox'] [role='option']",
            ".mat-select-panel mat-option",
            ".mat-option",
            ".cdk-overlay-pane mat-option",
            ".cdk-overlay-pane [role='option']",
            # Generic overlay patterns
            "[class*='overlay'] [role='option']",
            "[class*='dropdown'] li",
            "[class*='select-panel'] [class*='option']",
        ]

        options_loc = None
        for osel in overlay_selectors:
            try:
                loc = page.locator(osel)
                if loc.count() > 0:
                    options_loc = loc
                    break
            except Exception:
                continue

        if options_loc:
            for i in range(options_loc.count()):
                text = options_loc.nth(i).inner_text().strip()
                if text and text.lower() not in ("", "select", "select one", "--select--", "-- select --", "choose"):
                    option_texts.append(text)
    except Exception as e:
        diag['error'] = f'ERR_OPTIONS_SCAN: {e}'

    diag['options_count'] = len(option_texts)
    diag['options_sample'] = option_texts[:8]  # first 8 for diagnostics

    if not option_texts:
        diag['error'] = 'ERR_NO_OPTIONS_IN_OVERLAY'
        # Close the panel and bail
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return False, diag

    # Step 5: Find best match and click it
    best_match = None

    # Exact match
    for attempt in [target, expanded]:
        for ot in option_texts:
            if ot.lower() == attempt.lower():
                best_match = ot
                break
        if best_match:
            break

    # Fuzzy match
    if not best_match:
        candidates = option_texts + (schema_options or [])
        for attempt in [expanded, target]:
            matches = difflib.get_close_matches(attempt, candidates, n=3, cutoff=0.4)
            if matches:
                diag['fuzzy_candidates'] = matches
                best = matches[0]
                # Make sure it's in the actual overlay options
                for ot in option_texts:
                    if ot.lower() == best.lower():
                        best_match = ot
                        break
                if best_match:
                    break

    # Substring match
    if not best_match:
        for ot in option_texts:
            if target.lower() in ot.lower() or ot.lower() in target.lower():
                best_match = ot
                break

    if best_match:
        diag['matched_text'] = best_match
        # Click the matching option. Same force-click strategy as the
        # mat-select trigger — the cdk-overlay panel can have its own
        # hit-test quirks, and force=True with a JS fallback is reliable
        # without the 30s default timeout.
        try:
            for osel in overlay_selectors:
                try:
                    loc = page.locator(osel)
                    for i in range(loc.count()):
                        if loc.nth(i).inner_text().strip() == best_match:
                            opt_el = loc.nth(i)
                            try:
                                opt_el.click(force=True, timeout=5000)
                            except Exception:
                                opt_el.evaluate("el => el.click()")
                            # Wait for overlay to dismiss after clicking option
                            try:
                                page.wait_for_selector(
                                    '.cdk-overlay-container mat-option, .mat-select-panel',
                                    state='hidden', timeout=2000
                                )
                            except PWTimeout:
                                pass
                            # Verify the value actually persisted on the
                            # mat-select trigger. With direct-click on the
                            # option this almost always works, but if it
                            # didn't we want to know — not a silent success.
                            verified = _verify_value_committed([best_match, expanded, target])
                            if verified is False:
                                diag['error'] = 'ERR_OPTION_CLICK_NOT_PERSISTED'
                                diag['option_clicked'] = best_match
                                return False, diag
                            diag['match_method'] = 'exact' if best_match.lower() in [target.lower(), expanded.lower()] else \
                                                   'fuzzy' if diag.get('fuzzy_candidates') else 'substring'
                            diag['verified'] = True if verified is True else 'unknown'
                            return True, diag
                except Exception:
                    continue
        except Exception as e:
            diag['error'] = f'ERR_CLICK_OPTION: {e}'

    # Close the panel if we couldn't select
    if not best_match:
        diag['error'] = 'ERR_NO_MATCH'
    elif not diag.get('error'):
        diag['error'] = 'ERR_CLICK_OPTION_NOT_FOUND'
    try:
        page.keyboard.press("Escape")
        # Wait for overlay to fully close
        try:
            page.wait_for_selector(
                '.cdk-overlay-container mat-option, .mat-select-panel',
                state='hidden', timeout=1500
            )
        except PWTimeout:
            pass
    except Exception:
        pass
    return False, diag


def fill_text(page, selectors: list, value: str) -> bool:
    """Fill a text input field, trying multiple selectors."""
    if not value or not value.strip():
        return False

    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.fill("")  # Clear first
                loc.first.fill(value.strip())
                return True
        except Exception:
            continue

    # Fallback: try finding by nearby label text
    # This handles cases where the input doesn't have matching name/id attributes
    return False


def fill_text_by_label(page, label_text: str, value: str) -> bool:
    """Fill a text input by finding it near a label with matching text."""
    if not value or not value.strip():
        return False

    try:
        result = page.evaluate("""(labelText) => {
            function norm(s) { return (s || '').replace(/[\\*\\:]/g, '').trim().toLowerCase(); }
            const labels = document.querySelectorAll('label, legend, mat-label, [class*="label"]');
            const pat = labelText.toLowerCase();

            for (const lbl of labels) {
                const text = norm(lbl.textContent);
                if (!text || text.length > 60) continue;
                if (text !== pat && !text.includes(pat)) continue;

                // Found label — find nearest input
                const forId = lbl.getAttribute('for') || lbl.htmlFor;
                if (forId) {
                    const el = document.getElementById(forId);
                    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                        return { found: true, selector: '#' + forId };
                    }
                }

                const container = lbl.closest(
                    '.mat-form-field, fieldset, .form-group, [class*="form-field"], ' +
                    '[class*="form-group"], .field-wrapper, .col, [class*="col-"]'
                ) || lbl.parentElement;

                if (container) {
                    const inp = container.querySelector('input, textarea');
                    if (inp && inp.id) return { found: true, selector: '#' + inp.id };
                    if (inp && inp.name) return { found: true, selector: '[name="' + inp.name + '"]' };
                }
            }
            return { found: false };
        }""", label_text)

        if result.get("found") and result.get("selector"):
            loc = page.locator(result["selector"])
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.fill("")
                loc.first.fill(value.strip())
                return True
    except Exception:
        pass

    return False


def run(client_file: str, schema_file: str):
    print("--- EZLynx Smart Form Filler ---\n")

    # Load client data
    if not os.path.exists(client_file):
        print(f"ERROR: Client data file not found: {client_file}")
        print("Create it with your client info (see sample_client_data.json).")
        sys.exit(1)

    with open(client_file, "r", encoding="utf-8") as f:
        client = json.load(f)
    print(f"[v] Loaded client data: {client.get('FirstName', '?')} {client.get('LastName', '?')}")

    # Load schema (optional but recommended)
    schema = {}
    if os.path.exists(schema_file):
        with open(schema_file, "r", encoding="utf-8") as f:
            raw_schema = json.load(f)
        # Strip metadata keys (_pages, _meta, etc.) — only keep dropdown data
        schema = {k: v for k, v in raw_schema.items() if not k.startswith("_")}
        pages = raw_schema.get("_pages", {})
        print(f"[v] Loaded schema with {len(schema)} dropdown definitions")
        if pages:
            print(f"    Pages remembered: {', '.join(p.get('label', k) for k, p in pages.items())}")
    else:
        print(f"[!] Schema file not found: {schema_file} (will use live options only)")

    # ── In-browser toolbar (injected into EZLynx page) ──
    FILLER_TOOLBAR = """
    (function() {
        if (document.getElementById('_altech_filler_toolbar')) return;
        const bar = document.createElement('div');
        bar.id = '_altech_filler_toolbar';
        bar.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
        bar.innerHTML = `
            <div id="_altech_filler_inner" style="
                position:fixed; top:8px; left:50%; transform:translateX(-50%); z-index:999999;
                background:rgba(22,33,62,0.95); color:#fff;
                padding:6px 14px; border-radius:10px;
                box-shadow:0 4px 20px rgba(0,0,0,0.35); font-family:-apple-system,BlinkMacSystemFont,sans-serif;
                display:flex; align-items:center; gap:8px;
                border:1px solid rgba(255,255,255,0.12);
                cursor:grab; user-select:none; font-size:12px;
                max-width:calc(100vw - 40px); box-sizing:border-box;
                contain:layout; pointer-events:auto;
            ">
                <span style="font-weight:700; font-size:12px;">
                    Altech Filler
                </span>
                <button id="_altech_fill_btn" style="
                    background:#007AFF; color:#fff; border:none; border-radius:6px;
                    padding:5px 12px; font-size:11px; font-weight:600; cursor:pointer;
                ">Fill Now</button>
                <button id="_altech_close_btn" style="
                    background:#ff3b30; color:#fff; border:none; border-radius:6px;
                    padding:5px 12px; font-size:11px; font-weight:600; cursor:pointer;
                ">Close</button>
                <span id="_altech_filler_status" style="
                    color:rgba(255,255,255,0.5); font-size:10px; max-width:260px;
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                ">Navigate to the form, then click Fill Now.</span>
            </div>
        `;
        document.body.appendChild(bar);
        window._altech_filler_action = '';

        // ── Draggable ──
        var inner = document.getElementById('_altech_filler_inner');
        var dragging = false, dx = 0, dy = 0;
        inner.addEventListener('mousedown', function(e) {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true;
            dx = e.clientX - inner.getBoundingClientRect().left;
            dy = e.clientY - inner.getBoundingClientRect().top;
            inner.style.cursor = 'grabbing';
            e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if (!dragging) return;
            inner.style.left = (e.clientX - dx) + 'px';
            inner.style.top = (e.clientY - dy) + 'px';
            inner.style.transform = 'none';
        });
        document.addEventListener('mouseup', function() {
            dragging = false;
            if (inner) inner.style.cursor = 'grab';
        });

        document.getElementById('_altech_fill_btn').addEventListener('click', function(e) {
            e.stopPropagation();
            window._altech_filler_action = 'fill';
            this.textContent = 'Filling...';
            this.style.background = '#555';
            this.disabled = true;
        });
        document.getElementById('_altech_close_btn').addEventListener('click', function(e) {
            e.stopPropagation();
            window._altech_filler_action = 'close';
            this.textContent = 'Closing...';
            this.style.background = '#555';
            this.disabled = true;
        });
    })();
    """

    def inject_filler_toolbar(pg):
        try:
            pg.evaluate(FILLER_TOOLBAR)
        except Exception:
            pass

    def update_filler_status(pg, text):
        try:
            pg.evaluate(f"""(() => {{
                const s = document.getElementById('_altech_filler_status');
                if (s) s.textContent = {json.dumps(text)};
            }})()""")
        except Exception:
            pass

    def reset_fill_btn(pg):
        try:
            pg.evaluate("""(() => {
                const btn = document.getElementById('_altech_fill_btn');
                if (btn) { btn.textContent = 'Fill Again'; btn.style.background = '#007AFF'; btn.disabled = false; }
                window._altech_filler_action = '';
            })()""")
        except Exception:
            pass

    # Persist login between runs via a real Chromium user data dir.
    # Cookies/session live at ~/.altech-ezlynx-filler-profile so the user
    # doesn't have to re-MFA every time.
    user_data_dir = os.path.join(os.path.expanduser("~"), ".altech-ezlynx-filler-profile")

    # Defensive sweep: previous Ctrl+C exits leave Chromium lockfiles that
    # make launch_persistent_context die with TargetClosedError on next run.
    # Sweep these BEFORE launch — Playwright is not running yet, so it's safe.
    if os.path.isdir(user_data_dir):
        for stale_lock in ("SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"):
            lock_path = os.path.join(user_data_dir, stale_lock)
            try:
                if os.path.exists(lock_path) or os.path.islink(lock_path):
                    os.remove(lock_path)
            except Exception:
                pass

    with sync_playwright() as p:
        # launch_persistent_context replaces launch + new_context.
        # no_viewport=True lets the page use the full window size, which is what
        # the user expects when they maximize Chromium. --start-maximized opens
        # the window maximized on launch.
        context = p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            args=["--start-maximized"],
            no_viewport=True,
        )
        page = context.pages[0] if context.pages else context.new_page()

        # Event-based close detection: page.is_closed() and len(context.pages)
        # cache state in Playwright's sync API and don't always reflect a
        # user-driven window close. Register handlers that flip a flag, then
        # poll the flag (cheap) instead of polling Playwright state (cached).
        # We use a list as a mutable flag so closure-captures see updates.
        close_state = {'closed': False}
        def _on_close(*_args):
            close_state['closed'] = True
        try:
            context.on("close", _on_close)
            page.on("close", _on_close)
        except Exception:
            pass

        try:
            # Step 1: Navigate
            print(f"\n[*] Opening EZLynx: {EZLYNX_URL}")
            page.goto(EZLYNX_URL, wait_until="domcontentloaded")
            # Wait for page body to be ready instead of blind sleep
            try:
                page.wait_for_selector('body', state='visible', timeout=10000)
            except PWTimeout:
                pass
            inject_filler_toolbar(page)
            print("[*] Toolbar injected. Log in and navigate to the form.\n")

            # Re-inject on navigation (both full loads and SPA navigations)
            page.on("load", lambda: inject_filler_toolbar(page))
            page.on("domcontentloaded", lambda: inject_filler_toolbar(page))

            # Wait for user to click "Fill Now"
            last_inject = time.time()
            last_url = page.url
            running = True

            while running:
                time.sleep(0.5)

                # Re-inject toolbar if removed by SPA navigation or DOM rebuild
                now = time.time()
                current_url = ''
                try:
                    current_url = page.url
                except Exception:
                    pass

                url_changed = current_url != last_url
                if url_changed:
                    last_url = current_url

                if url_changed or now - last_inject > 2:
                    try:
                        exists = page.evaluate("!!document.getElementById('_altech_filler_toolbar')")
                        if not exists:
                            inject_filler_toolbar(page)
                            if url_changed:
                                update_filler_status(page, f"Page changed. Click Fill Now to fill this form.")
                    except Exception:
                        try:
                            inject_filler_toolbar(page)
                        except Exception:
                            pass
                    last_inject = now

                try:
                    action = page.evaluate("window._altech_filler_action || ''")
                except Exception:
                    action = ''

                if action == 'close':
                    print("[*] Close clicked — toolbar removed. Close the Chromium window when you're done; the script will exit then.")
                    try:
                        page.evaluate("""
                            var tb = document.getElementById('_altech_filler_toolbar');
                            if (tb) tb.remove();
                            window._altech_filler_action = '';
                        """)
                    except Exception:
                        pass
                    # Wait until the user closes the browser themselves. Three
                    # signals — any one is sufficient:
                    #   (a) the on("close") handler set close_state['closed']
                    #   (b) page.evaluate("1") raises (real round-trip — Playwright's
                    #       cached state can lie, an evaluate() can't)
                    #   (c) the persistent context has no live pages
                    while True:
                        time.sleep(0.5)
                        if close_state['closed']:
                            break
                        try:
                            page.evaluate("1")
                        except Exception:
                            break
                        try:
                            if not context.pages:
                                break
                        except Exception:
                            break
                    print("[*] Chromium closed by user. Exiting.")
                    break

                if action != 'fill':
                    continue

                # ── Do the fill ──
                update_filler_status(page, "Filling text fields...")
                page.wait_for_load_state("domcontentloaded")
                # Wait for form inputs to be present on the page
                try:
                    page.wait_for_selector('input, select, mat-select, [role="listbox"]',
                                           state='visible', timeout=8000)
                except PWTimeout:
                    pass

                fill_report = []  # Collect diagnostic report for all fields

                # Fill text fields
                print("\n[*] Filling text fields...")
                filled = 0
                skipped = 0

                for key, selectors in TEXT_FIELD_MAP.items():
                    value = client.get(key, "")
                    if not value:
                        continue
                    update_filler_status(page, f"Text: {key}...")
                    try:
                        if fill_text(page, selectors, value):
                            print(f"  [v] {key}: '{value}'")
                            fill_report.append({'field': key, 'type': 'text', 'value': value,
                                                'status': 'OK', 'error': None})
                            filled += 1
                            time.sleep(0.15)
                        else:
                            print(f"  [x] {key}: '{value}' -> FIELD NOT FOUND on page")
                            fill_report.append({'field': key, 'type': 'text', 'value': value,
                                                'status': 'FAIL', 'error': 'ERR_FIELD_NOT_FOUND'})
                            skipped += 1
                    except Exception as e:
                        print(f"  [!] {key}: '{value}' -> ERROR: {e}")
                        fill_report.append({'field': key, 'type': 'text', 'value': value,
                                            'status': 'ERROR', 'error': f'ERR_EXCEPTION: {e}'})
                        skipped += 1

                print(f"\n     Text fields: {filled} filled, {skipped} not found")

                # Fill dropdowns (page-aware: only tries labels relevant to current page)
                current_url = ''
                try:
                    current_url = page.url
                except Exception:
                    pass
                active_dropdowns = get_active_dropdowns(current_url)
                page_context = 'auto' if '/rating/auto/' in current_url.lower() else \
                               'home' if '/rating/home/' in current_url.lower() else \
                               'lead' if '/lead-info' in current_url.lower() else 'applicant'
                update_filler_status(page, f"Matching dropdowns ({page_context} page, {len(active_dropdowns)} mappings)...")
                print(f"\n[*] Filling dropdowns -- page context: {page_context} ({len(active_dropdowns)} mappings)")
                dd_filled = 0
                dd_skipped = 0
                dd_retried = []  # Track fields that failed and need retry

                # Data fallback map: when a logical field isn't in client data,
                # synthesize it from a related field. Lets one State value in
                # the client JSON cover both applicant-level State AND the
                # Primary Address State without duplication.
                CLIENT_FALLBACKS = {
                    "PrimaryAddressState": "State",
                    "PrimaryAddressCounty": "County",
                }
                for key, label_patterns in active_dropdowns.items():
                    value = client.get(key, "")
                    if not value and key in CLIENT_FALLBACKS:
                        value = client.get(CLIENT_FALLBACKS[key], "")
                    if not value:
                        continue

                    update_filler_status(page, f"Dropdown: {key} = '{value}'...")

                    # Find schema options for this dropdown
                    schema_options = None
                    for schema_key, opts in schema.items():
                        sk = schema_key.lower()
                        kl = key.lower()
                        if kl in sk or sk in kl:
                            schema_options = opts
                            break
                        for lp in label_patterns:
                            if lp in sk or sk in lp:
                                schema_options = opts
                                break
                        if schema_options:
                            break

                    success = False
                    diag = None

                    try:
                        # Try custom dropdown (Angular Material) by label first
                        success, diag = smart_select_custom(page, label_patterns, value, schema_options)
                        if success:
                            method = diag.get('match_method', 'custom')
                            matched = diag.get('matched_text', '')
                            print(f"  [v] {key}: '{value}' -> '{matched}' ({method})")
                            fill_report.append({'field': key, 'type': 'dropdown', 'value': value,
                                                'status': 'OK', 'diag': diag})
                            dd_filled += 1
                            time.sleep(0.3)
                        # Fallback to native <select> selectors
                        elif key in DROPDOWN_SELECT_MAP:
                            # Preserve custom's diag — it carries the on-page debug
                            # payload (mat_labels_on_page, dropdowns_on_page) which
                            # smart_select_native does NOT regenerate. We only swap
                            # to native's diag if native actually succeeded.
                            custom_diag = diag
                            success, native_diag = smart_select_native(page, DROPDOWN_SELECT_MAP[key], value, schema_options)
                            if success:
                                diag = native_diag
                                method = diag.get('match_method', 'native')
                                matched = diag.get('matched_text', '')
                                print(f"  [v] {key}: '{value}' -> '{matched}' ({method}, native)")
                                fill_report.append({'field': key, 'type': 'dropdown', 'value': value,
                                                    'status': 'OK', 'diag': diag})
                                dd_filled += 1
                                time.sleep(0.15)
                            else:
                                # Native fallback also failed. Keep custom's diag
                                # (which has the debug payload) but record that
                                # native was attempted too.
                                diag = custom_diag or {}
                                diag['native_attempted'] = True
                                diag['native_error'] = native_diag.get('error') if native_diag else None

                        if not success:
                            err = diag.get('error', 'UNKNOWN') if diag else 'NO_DIAG'
                            opts_count = diag.get('options_count', 0) if diag else 0
                            opts_sample = diag.get('options_sample', []) if diag else []
                            expanded = diag.get('expanded') if diag else None
                            label_found = diag.get('label_found', False) if diag else False

                            detail = f"  [x] {key}: '{value}'"
                            if expanded:
                                detail += f" (expanded: '{expanded}')"
                            detail += f" -> {err}"
                            if label_found:
                                detail += f" | label found, type={diag.get('dropdown_type','?')}"
                            else:
                                detail += f" | label NOT found (searched: {label_patterns})"
                            if opts_count > 0:
                                detail += f" | {opts_count} options visible"
                                if opts_sample:
                                    detail += f": [{', '.join(opts_sample[:5])}{'...' if opts_count > 5 else ''}]"
                            print(detail)

                            fill_report.append({'field': key, 'type': 'dropdown', 'value': value,
                                                'status': 'FAIL', 'diag': diag})
                            dd_retried.append((key, label_patterns, value, schema_options))
                            dd_skipped += 1

                    except Exception as e:
                        print(f"  [!] {key}: '{value}' -> EXCEPTION: {e}")
                        fill_report.append({'field': key, 'type': 'dropdown', 'value': value,
                                            'status': 'ERROR', 'error': str(e)})
                        dd_retried.append((key, label_patterns, value, schema_options))
                        dd_skipped += 1

                # ── Retry failed dropdowns (up to 1 retry with extra wait) ──
                if dd_retried:
                    print(f"\n[*] Retrying {len(dd_retried)} failed dropdown(s) with longer wait...")
                    update_filler_status(page, f"Retrying {len(dd_retried)} failed dropdown(s)...")
                    # Wait for dependent dropdowns to render (Angular change detection)
                    try:
                        page.wait_for_load_state('networkidle', timeout=5000)
                    except PWTimeout:
                        pass

                    for key, label_patterns, value, schema_options in dd_retried:
                        update_filler_status(page, f"Retry: {key} = '{value}'...")
                        try:
                            success, diag = smart_select_custom(page, label_patterns, value, schema_options)
                            if not success and key in DROPDOWN_SELECT_MAP:
                                success, diag = smart_select_native(page, DROPDOWN_SELECT_MAP[key], value, schema_options)

                            if success:
                                matched = diag.get('matched_text', '')
                                method = diag.get('match_method', '?')
                                print(f"  [v] RETRY {key}: '{value}' -> '{matched}' ({method})")
                                dd_filled += 1
                                dd_skipped -= 1
                                # Update report entry
                                for r in fill_report:
                                    if r['field'] == key and r['status'] == 'FAIL':
                                        r['status'] = 'OK_RETRY'
                                        r['diag'] = diag
                                        break
                                time.sleep(0.3)
                            else:
                                err = diag.get('error', '?') if diag else '?'
                                print(f"  [x] RETRY {key}: still failed -> {err}")
                        except Exception as e:
                            print(f"  [!] RETRY {key}: error -> {e}")

                print(f"\n     Dropdowns: {dd_filled} filled, {dd_skipped} not matched")

                # Extra fields — combine all dropdown label sets for the check.
                # CLIENT_FALLBACKS source keys count as consumed too (e.g. when
                # PrimaryAddressCounty pulls from "County", don't then warn
                # that "County" is unmapped — it was used).
                all_dropdown_keys = set(BASE_DROPDOWN_LABELS.keys()) | set(AUTO_DROPDOWN_LABELS.keys()) | \
                                    set(HOME_DROPDOWN_LABELS.keys()) | set(LEAD_DROPDOWN_LABELS.keys())
                handled_keys = set(TEXT_FIELD_MAP.keys()) | all_dropdown_keys | set(CLIENT_FALLBACKS.values())
                extra_keys = [k for k in client.keys() if k not in handled_keys and client[k]]
                if extra_keys:
                    print(f"\n[*] {len(extra_keys)} unmapped fields: {', '.join(extra_keys)}")

                total = filled + dd_filled
                print(f"\n{'=' * 50}")
                print(f"[OK] Form fill complete: {total} fields populated")
                print(f"{'=' * 50}")

                # ── Diagnostic Report ──
                failures = [r for r in fill_report if r['status'] in ('FAIL', 'ERROR')]
                if failures:
                    print(f"\n--- FILL REPORT: {len(failures)} FAILED FIELD(S) ---")
                    for r in failures:
                        field = r['field']
                        val = r['value']
                        d = r.get('diag') or {}
                        err = d.get('error', r.get('error', '?'))
                        print(f"\n  FIELD: {field}")
                        print(f"    Value sent: '{val}'")
                        if d.get('expanded'):
                            print(f"    Expanded to: '{d['expanded']}'")
                        print(f"    Error code: {err}")
                        if r['type'] == 'dropdown':
                            print(f"    Label found: {d.get('label_found', '?')}")
                            if d.get('label_found'):
                                print(f"    Match via: {d.get('match_via', '?')}")
                                print(f"    Dropdown type: {d.get('dropdown_type', '?')}")
                                print(f"    Dropdown ID: {d.get('dropdown_id', 'none')}")
                                print(f"    Overlay opened: {d.get('overlay_opened', '?')}")
                            print(f"    Options found: {d.get('options_count', 0)}")
                            if d.get('options_sample'):
                                print(f"    Options sample: {d['options_sample']}")
                            if d.get('fuzzy_candidates'):
                                print(f"    Fuzzy near-matches: {d['fuzzy_candidates']}")
                            # When label search fails, dump what IS on the page
                            # so the next fix can target the actual selectors.
                            if not d.get('label_found') and d.get('mat_labels_on_page'):
                                print(f"    mat-label texts on page: {d['mat_labels_on_page']}")
                            if not d.get('label_found') and d.get('dropdowns_on_page'):
                                print(f"    Dropdown attrs on page (first 10):")
                                for dd_info in d['dropdowns_on_page'][:10]:
                                    print(f"      - {dd_info}")
                            # Surface the click-was-fired-but-value-didn't-stick path
                            if d.get('keyboard_attempted_but_not_persisted'):
                                print(f"    Note: keyboard typeahead opened overlay but value didn't persist; option-click also tried")
                            if d.get('options_loaded_count') is not None:
                                print(f"    Options visible after open (waited up to 3s): {d['options_loaded_count']}")
                            if d.get('click_method'):
                                print(f"    Click method that opened overlay: {d['click_method']}")
                    print(f"\n{'=' * 50}")

                    # Mat-select inventory: at the end of any FAIL report,
                    # dump every mat-select on the page with its id, name,
                    # and current displayed value. Lets the next round see
                    # which fields are actually filled vs which the script
                    # claims to have filled. Cowork-driven debugging stays
                    # quick without ad-hoc patches.
                    try:
                        inventory = page.evaluate("""
                            () => Array.from(document.querySelectorAll('mat-select')).map(el => {
                                const valEl = el.querySelector('.mat-mdc-select-min-line')
                                           || el.querySelector('.mat-mdc-select-value-text');
                                const lblId = el.getAttribute('aria-labelledby');
                                const lblEl = lblId ? document.getElementById(lblId) : null;
                                return {
                                    id: el.id || null,
                                    name: el.getAttribute('name') || null,
                                    label: lblEl ? (lblEl.textContent || '').trim() : null,
                                    value: valEl ? (valEl.textContent || '').trim() : '',
                                    empty: (el.className || '').includes('mat-mdc-select-empty'),
                                };
                            }).slice(0, 40)
                        """)
                        if inventory:
                            print(f"\n--- MAT-SELECT INVENTORY (first 40, post-fill state) ---")
                            for i, dd_info in enumerate(inventory):
                                print(f"  [#{i:2}] {dd_info.get('label') or '?':<30} "
                                      f"id={dd_info.get('id') or '-':<40} "
                                      f"value={'(empty)' if dd_info.get('empty') else repr(dd_info.get('value'))}")
                            print(f"{'=' * 50}")
                    except Exception:
                        pass

                update_filler_status(page,
                    f"Done! {total} filled, {len(failures)} failed. "
                    f"{'Check terminal for error details. ' if failures else ''}"
                    f"Click Fill Again or Close.")
                reset_fill_btn(page)

        except KeyboardInterrupt:
            print("\n[!] Interrupted by user.")
            try:
                context.close()
            except Exception:
                pass
            print("[*] Browser closed.")
        except Exception as e:
            print(f"\n[!] Unexpected error: {e}")
            try:
                context.close()
            except Exception:
                pass
            print("[*] Browser closed.")
        # Normal exit: the user already closed Chromium (the action='close'
        # handler waited for that). Just let the with-block clean up.


def main():
    parser = argparse.ArgumentParser(
        description="EZLynx Smart Form Filler -- auto-fill with fuzzy dropdown matching"
    )
    parser.add_argument(
        "-c", "--client",
        default="client_data.json",
        help="Client data JSON file (default: client_data.json)",
    )
    parser.add_argument(
        "-s", "--schema",
        default="ezlynx_schema.json",
        help="Scraped schema JSON file (default: ezlynx_schema.json)",
    )
    args = parser.parse_args()
    run(client_file=args.client, schema_file=args.schema)


if __name__ == "__main__":
    main()
