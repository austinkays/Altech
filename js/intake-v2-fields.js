// intake-v2-fields.js — Personal Intake v2 field registry.
//
// Single source of truth for v2 field definitions. Unlike v1's flat `FIELDS`
// array, v2 uses *path-based* identifiers (e.g. `applicant.firstName`) plus
// per-collection schemas for repeating sections (operators, homes, autos,
// boats, rvs).
//
// Each scalar entry: { id, path, label, type, section, options?, mode, bindable?, speller?, kind? }
//   - id        — flat DOM id used on the <input> (e.g. `iv2-firstName`)
//   - path      — canonical storage location in IntakeV2.data
//                  (e.g. 'applicant.firstName', 'address.previous.street')
//   - mode      — 'quick' (visible in Quick mode) | 'full' (only in Full mode)
//                  Quick mode is the default on a call.
//   - bindable  — which carriers REQUIRE this field. Drives the top-bar
//                  red/amber/green readiness pill and the per-card status dot.
//                  Format: { progressive: true, foremost: true, ... }
//   - speller   — 'general' | 'vin' | 'dl' | 'plate' | 'email' — opts the
//                  field into the inset phonetic-speller button. Mode drives
//                  PhoneticSpeller.open's sanitization (uppercase / I-O-Q
//                  warning / @-dot expansion / etc.). Click delegation +
//                  Alt+P shortcut wired once in intake-v2-layout.js.
//   - kind      — 'switch' for the toggle-pill checkbox variant (see
//                  .iv2-switch-row). Used for headline gates like the
//                  "Add Co-Applicant" toggle.
//
// FieldMapV2 helpers mirror v1's FieldMap (js/fields.js:230) — pathForElement
// resolves the canonical path from a DOM node, idForPath builds the flat DOM id.
//
// ────────────────────────────────────────────────────────────────────────
// EZLynx + HawkSoft schema audit (May 2026)
// ────────────────────────────────────────────────────────────────────────
//
// Compiled against js/ezlynx-tool.js (formFields[] + keyMap, lines 59-150)
// and js/app-export-cmsmtf.js (HawkSoft tagged-field writer, gen_s* /
// drv_s* / veh_s* sections). Legend:
//   ✅ field exists in v2 schema and exports cleanly today
//   ⚠️ field exists but mapping is incomplete OR lives only in PDF/notes
//   ❌ field is missing from v2 — add when the underwriter asks
//
// EZLynx — Personal Lines application
//   Applicant:        FirstName ✅  LastName ✅  MiddleName ✅  DOB ✅
//                     Gender ✅  MaritalStatus ✅  Phone ✅  Email ✅
//                     SSN ✅  Education ✅  Industry ✅  Occupation ✅
//                     Employer ✅  YearsAtEmployer ✅  (added May 2026)
//                     Prefix ✅  Suffix ✅
//   Co-Applicant:     Same surface as Applicant via coApplicant.* — Prefix
//                     and Suffix exist on coApplicant in data shape but
//                     aren't on the form yet ⚠️ (would need Phase-X UI work)
//   Address:          Address ✅  City ✅  State ✅  Zip ✅  County ✅
//                     YearsAtAddress ✅  Previous(Address|City|State|Zip) ✅
//   Drivers:          LicenseNumber ✅  DLState ✅  AgeLicensed ✅
//                     Accidents/Violations 35-mo tracker ✅ (history section)
//                     DefensiveDrivingCourse ⚠️  MatureDriverDiscount ⚠️
//                     MVRStatus ⚠️  (planned for Phase 8 driver polish)
//   Vehicles:         VehicleYear ✅  Make ✅  Model ✅  VIN ✅
//                     LicensePlate ✅  PlateState ✅  (added May 2026)
//                     VehicleUse ✅  AnnualMiles ✅  OwnershipType ✅
//                     LienHolder(Name|Address|LoanNumber) ✅
//                     CommuteMiles ✅  DaysPerWeek ✅  AntiTheftDevice ✅
//                     PurchaseDate ⚠️  OriginalOwner ⚠️  ExistingDamage ⚠️
//   Home/Dwelling:    YearBuilt ✅  SqFt ✅  LotSize ✅  DwellingType ✅
//                     DwellingUsage ✅  OccupancyType ✅  NumStories ✅
//                     ConstructionStyle ✅  ExteriorWalls ✅  FoundationType ✅
//                     GarageType ✅  GarageSpaces ✅  Roof(Type|Shape|Year) ✅
//                     Heating/CoolingType ✅  Plumbing/ElectricalYr ✅
//                     Bedrooms ✅  FullBaths ✅  HalfBaths ✅  NumOccupants ✅
//                     Pool ✅  Trampoline ✅  WoodStove ✅  Business ✅
//                     Mortgagee(Name|Loan|Address) ✅
//                     BurglarAlarm/FireDetection/Sprinkler ⚠️ (single .alarms
//                       enum today — EZLynx splits them across three fields)
//                     SmokeDetector ❌  NumFireplaces ❌  Bedrooms vs Beds ⚠️
//   Prior Insurance:  PriorCarrier ✅  PriorPolicyTerm ⚠️ (carrier+exp only,
//                     no policy-number field yet — Phase-X if EZLynx needs it)
//                     ContinuousMonths ✅  PriorLiabilityLimits ✅
//   Coverage (auto):  BodilyInjury / PropertyDamage covered via
//                     coverages.liab (combined 25/50/25 style) ⚠️ (EZLynx
//                     expects them split — exporter normalizes)
//                     Comp/Coll/UM/UIM/MedPay/Towing/Rental ✅
//   Coverage (home):  DwellingCoverage (Cov A) ✅  PersonalProperty (C) ✅
//                     LossOfUse (D) ✅  PersonalLiability (E) ✅
//                     MedicalPayments (F) ✅  AllPerilsDeductible ✅
//                     TheftDeductible ⚠️  WindDeductible ⚠️ (single
//                     deductible value today — multi-peril split is on the
//                     home endorsement card but not in the export map)
//
// HawkSoft — Client Intake (CMSMTF tagged-field format)
//   Client (gen_s*):  LastName ✅  FirstName ✅  Address1/City/State/Zip ✅
//                     Phone ✅  CellPhone (mirrors Phone) ⚠️
//                     Email ✅  ClientSource (mirrors referralSource) ✅
//                     County ✅  GAddress/GCity/GState/GZip ✅
//                     ClientMiscData[0..29] — DOB / Gender / Marital /
//                       Education / Industry / Occupation / Prefix / Suffix
//                       all serialized through this catch-all ✅
//   Household:        Co-Applicant flows through ClientMiscData ⚠️ — no
//                     dedicated hsm_s* tags exist on the CMSMTF template
//   Drivers (drv_s*): FirstName ✅  LastName ✅  LicenseNum ✅
//                     LicensingState ✅  Sex ✅  MaritalStatus ✅
//                     DriversOccupation ✅  Relationship ✅
//                     BirthDate ⚠️ (currently in misc_data; HawkSoft has
//                       a dedicated drv_sBirthDt slot that we don't fill)
//   Vehicles (veh_s*):Yr ✅  Make ✅  Model ✅  VIN ✅  Use ✅
//                     Comp/Coll/Towing/RentRemb ✅  GaragingZip ✅
//                     LicensePlate ❌ (Phase-8 follow-up; v2 schema now
//                       carries the field but the CMSMTF mapping doesn't
//                       yet write veh_sPlate / veh_sPlateState)
//   Policies (pol_s*):Policy number, effective/expiration, carrier — the
//                     CMSMTF writer carries placeholders but most pol_s*
//                     tags are unset today ⚠️ (intake v2 collects carrier
//                     + expiration; explicit policy number field deferred)
//   Risks (FSC notes):Property hazards (pool/trampoline/woodstove/business),
//                     alarms, protection class, distance to hydrant, dogs —
//                     all included in the FSC notes payload, not as
//                     tagged fields ⚠️
//
// Caveats: boats + RVs are intentionally PDF-only on both exports (the
// exporter-contract test pins this) — their fields don't appear in CMSMTF
// or the EZLynx form-field array.

'use strict';

/* eslint-disable */
(function () {

const ALL = true; // shorthand for "every carrier requires this for the line"
const requiredBy = (...carriers) => carriers.reduce((m, c) => (m[c] = true, m), {});

// ─── Top-level scalar fields (applicant, co-applicant, address, household) ──
//
// Section maps to one of the workspace sections:
//   quick | household | coverage | history | review
// Path uses dot notation. For nested objects under address.previous etc., the
// dot path is the literal nested key.
//
// Note: per-collection-item fields live in IntakeV2Fields.collections below.

const SCALAR = [
    // ── Applicant ─────────────────────────────────────────────────────────
    { id: 'iv2-prefix',         path: 'applicant.prefix',         label: 'Prefix',           type: 'select', options: ['', 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Mx.'], section: 'quick', mode: 'full' },
    { id: 'iv2-firstName',      path: 'applicant.firstName',      label: 'First Name',       type: 'text',   section: 'quick', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco'), speller: 'general' },
    { id: 'iv2-middleName',     path: 'applicant.middleName',     label: 'Middle',           type: 'text',   section: 'quick', mode: 'full',  speller: 'general' },
    { id: 'iv2-lastName',       path: 'applicant.lastName',       label: 'Last Name',        type: 'text',   section: 'quick', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco'), speller: 'general' },
    { id: 'iv2-suffix',         path: 'applicant.suffix',         label: 'Suffix',           type: 'select', options: ['', 'Jr.', 'Sr.', 'II', 'III', 'IV'], section: 'quick', mode: 'full' },
    { id: 'iv2-dob',            path: 'applicant.dob',            label: 'Date of Birth',    type: 'date',   section: 'quick', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
    { id: 'iv2-ssn',            path: 'applicant.ssn',            label: 'SSN (optional, for credit pull)', type: 'text', section: 'quick', mode: 'full' },
    { id: 'iv2-gender',         path: 'applicant.gender',         label: 'Gender',           type: 'select', options: ['', 'Male', 'Female', 'Nonbinary', 'Prefer not to say'], section: 'quick', mode: 'full' },
    { id: 'iv2-maritalStatus',  path: 'applicant.maritalStatus',  label: 'Marital Status',   type: 'select', options: ['', 'Single', 'Married', 'Divorced', 'Widowed', 'Domestic Partner'], section: 'quick', mode: 'quick' },
    { id: 'iv2-phone',          path: 'applicant.phone',          label: 'Phone',            type: 'tel',    section: 'quick', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
    { id: 'iv2-email',          path: 'applicant.email',          label: 'Email',            type: 'email',  section: 'quick', mode: 'quick', speller: 'email' },
    { id: 'iv2-occupation',     path: 'applicant.occupation',     label: 'Occupation',       type: 'text',   section: 'quick', mode: 'full' },
    { id: 'iv2-industry',       path: 'applicant.industry',       label: 'Industry',         type: 'text',   section: 'quick', mode: 'full' },
    { id: 'iv2-education',      path: 'applicant.education',      label: 'Education',        type: 'select', options: ['', 'No HS', 'High School', 'Some College', 'Associates', 'Bachelors', 'Masters', 'Doctorate'], section: 'quick', mode: 'full' },
    // Employer name + years employed fill the row that used to leave
    // four empty grid columns next to Industry/Education. Both fields
    // are first-class on the EZLynx Personal Lines application — the
    // exporter pipes them through `Employer` / `YearsAtEmployer` tags
    // when the carrier asks for occupation specifics.
    { id: 'iv2-employerName',   path: 'applicant.employerName',   label: 'Employer Name',     type: 'text',   section: 'quick', mode: 'full', speller: 'general' },
    { id: 'iv2-yearsEmployed',  path: 'applicant.yearsEmployed',  label: 'Years Employed',    type: 'number', section: 'quick', mode: 'full' },

    // ── Co-Applicant (visible when coApplicant.present === true) ──────────
    // Headline gate — rendered as a switch (toggle pill) instead of a
    // square checkbox so the agent can see at a glance whether a
    // co-applicant is on the policy. `kind: 'switch'` is read by all
    // three renderers (intake-v2-layout/-operators/-autos).
    { id: 'iv2-coPresent',       path: 'coApplicant.present',      label: 'Add Co-Applicant', type: 'checkbox', kind: 'switch', section: 'quick', mode: 'quick' },
    { id: 'iv2-coRelationship',  path: 'coApplicant.relationship', label: 'Relationship',    type: 'select', options: ['', 'Spouse', 'Domestic Partner', 'Parent', 'Child', 'Sibling', 'Other'], section: 'quick', mode: 'quick' },
    { id: 'iv2-coFirstName',     path: 'coApplicant.firstName',    label: 'Co-App First',    type: 'text',   section: 'quick', mode: 'quick', speller: 'general' },
    { id: 'iv2-coLastName',      path: 'coApplicant.lastName',     label: 'Co-App Last',     type: 'text',   section: 'quick', mode: 'quick', speller: 'general' },
    { id: 'iv2-coDob',           path: 'coApplicant.dob',          label: 'Co-App DOB',      type: 'date',   section: 'quick', mode: 'quick' },
    { id: 'iv2-coGender',        path: 'coApplicant.gender',       label: 'Co-App Gender',   type: 'select', options: ['', 'Male', 'Female', 'Nonbinary', 'Prefer not to say'], section: 'quick', mode: 'full' },
    { id: 'iv2-coMaritalStatus', path: 'coApplicant.maritalStatus',label: 'Co-App Marital',  type: 'select', options: ['', 'Single', 'Married', 'Divorced', 'Widowed', 'Domestic Partner'], section: 'quick', mode: 'full' },
    { id: 'iv2-coPhone',         path: 'coApplicant.phone',        label: 'Co-App Phone',    type: 'tel',    section: 'quick', mode: 'full' },
    { id: 'iv2-coEmail',         path: 'coApplicant.email',        label: 'Co-App Email',    type: 'email',  section: 'quick', mode: 'full',  speller: 'email' },
    { id: 'iv2-coOccupation',    path: 'coApplicant.occupation',   label: 'Co-App Occupation', type: 'text', section: 'quick', mode: 'full' },
    { id: 'iv2-coIndustry',      path: 'coApplicant.industry',     label: 'Co-App Industry', type: 'text',   section: 'quick', mode: 'full' },
    { id: 'iv2-coEducation',     path: 'coApplicant.education',    label: 'Co-App Education',type: 'select', options: ['', 'No HS', 'High School', 'Some College', 'Associates', 'Bachelors', 'Masters', 'Doctorate'], section: 'quick', mode: 'full' },

    // ── Mailing Address ───────────────────────────────────────────────────
    { id: 'iv2-addrStreet', path: 'address.street', label: 'Street Address', type: 'text',   section: 'quick', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco'), speller: 'general' },
    { id: 'iv2-addrCity',   path: 'address.city',   label: 'City',           type: 'text',   section: 'quick', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco'), speller: 'general' },
    { id: 'iv2-addrState',  path: 'address.state',  label: 'State',          type: 'select', options: usStateOptions(), section: 'quick', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
    { id: 'iv2-addrZip',    path: 'address.zip',    label: 'ZIP Code',       type: 'text',   section: 'quick', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
    { id: 'iv2-county',     path: 'address.county', label: 'County',         type: 'text',   section: 'quick', mode: 'full',  speller: 'general' },
    { id: 'iv2-yearsAt',    path: 'address.yearsAt',label: 'Years at Address', type: 'number', section: 'quick', mode: 'full' },

    // Previous address (full mode only)
    { id: 'iv2-prevAddrStreet', path: 'address.previous.street', label: 'Previous Street', type: 'text',   section: 'quick', mode: 'full',  speller: 'general' },
    { id: 'iv2-prevAddrCity',   path: 'address.previous.city',   label: 'Previous City',   type: 'text',   section: 'quick', mode: 'full',  speller: 'general' },
    { id: 'iv2-prevAddrState',  path: 'address.previous.state',  label: 'Previous State',  type: 'select', options: usStateOptions(), section: 'quick', mode: 'full' },
    { id: 'iv2-prevAddrZip',    path: 'address.previous.zip',    label: 'Previous ZIP',    type: 'text',   section: 'quick', mode: 'full' },

    // ── Household preferences ─────────────────────────────────────────────
    { id: 'iv2-homeownership',   path: 'household.homeownership', label: 'Homeownership', type: 'select', options: ['', 'Own home', 'Rent', 'Condo', 'Manufactured home'], section: 'quick', mode: 'quick' },
    { id: 'iv2-contactMethod',   path: 'household.contactMethod', label: 'Preferred Contact', type: 'select', options: ['', 'Phone', 'Email', 'Text'], section: 'quick', mode: 'full' },
    { id: 'iv2-contactTime',     path: 'household.contactTime',   label: 'Best Time to Call', type: 'select', options: ['', 'Morning', 'Afternoon', 'Evening'], section: 'quick', mode: 'full' },
    { id: 'iv2-referralSource',  path: 'household.referralSource',label: 'Referral Source', type: 'text', section: 'quick', mode: 'full',  speller: 'general' },
    // tcpaConsent and creditCheckAuth are visible in Quick mode because the
    // talk-track sidebar's `tcpa-consent` and `credit-pull` prompts both ask
    // the agent to capture these on the call — keeping them in Full-only made
    // the prompts unactionable until the agent switched modes.
    { id: 'iv2-tcpaConsent',     path: 'household.tcpaConsent',   label: 'TCPA consent obtained', type: 'checkbox', section: 'quick', mode: 'quick' },
    { id: 'iv2-creditCheckAuth', path: 'household.creditCheckAuth', label: 'Credit pull authorized', type: 'checkbox', section: 'quick', mode: 'quick' },

    // ── Coverage section (universal coverages — per-product details live in collection fields) ──
    { id: 'iv2-priorContinuous',       path: 'priorInsurance.continuous',       label: 'Continuous Coverage', type: 'select', options: ['', 'Yes', 'No'], section: 'coverage', mode: 'quick' },
    { id: 'iv2-priorContinuousMonths', path: 'priorInsurance.continuousMonths', label: 'Months Continuous',   type: 'number', section: 'coverage', mode: 'full' },

    { id: 'iv2-priorHomeCarrier',  path: 'priorInsurance.home.carrier',  label: 'Prior Home Carrier',  type: 'text', section: 'coverage', mode: 'full' },
    { id: 'iv2-priorHomeExp',      path: 'priorInsurance.home.exp',      label: 'Prior Home Expiration', type: 'date', section: 'coverage', mode: 'full' },
    { id: 'iv2-priorAutoCarrier',  path: 'priorInsurance.auto.carrier',  label: 'Prior Auto Carrier',  type: 'text', section: 'coverage', mode: 'full' },
    { id: 'iv2-priorAutoExp',      path: 'priorInsurance.auto.exp',      label: 'Prior Auto Expiration', type: 'date', section: 'coverage', mode: 'full' },
    { id: 'iv2-priorAutoLimits',   path: 'priorInsurance.auto.limits',   label: 'Prior Auto Liability Limits', type: 'text', section: 'coverage', mode: 'full' },
    { id: 'iv2-priorBoatCarrier',  path: 'priorInsurance.boat.carrier',  label: 'Prior Boat Carrier',  type: 'text', section: 'coverage', mode: 'full' },
    { id: 'iv2-priorBoatExp',      path: 'priorInsurance.boat.exp',      label: 'Prior Boat Expiration', type: 'date', section: 'coverage', mode: 'full' },
    { id: 'iv2-priorRvCarrier',    path: 'priorInsurance.rv.carrier',    label: 'Prior RV Carrier',    type: 'text', section: 'coverage', mode: 'full' },
    { id: 'iv2-priorRvExp',        path: 'priorInsurance.rv.exp',        label: 'Prior RV Expiration', type: 'date', section: 'coverage', mode: 'full' },

    // Discounts (Quick mode for the affinity ones — common discount drivers)
    { id: 'iv2-discountHomeowner',         path: 'discounts.homeowner',                 label: 'Homeowner discount',           type: 'checkbox', section: 'coverage', mode: 'quick' },
    { id: 'iv2-discountSafetyAuto',        path: 'discounts.safetyCourse.auto',         label: 'Defensive-driver course',      type: 'checkbox', section: 'coverage', mode: 'full' },
    { id: 'iv2-discountSafetyBoat',        path: 'discounts.safetyCourse.boat',         label: 'Boater safety course',         type: 'checkbox', section: 'coverage', mode: 'quick' },
    { id: 'iv2-discountSafetyRv',          path: 'discounts.safetyCourse.rv',           label: 'RV safety course',             type: 'checkbox', section: 'coverage', mode: 'quick' },
    { id: 'iv2-affinityUsaa',              path: 'discounts.affinity.usaa',             label: 'USAA',                         type: 'checkbox', section: 'coverage', mode: 'quick' },
    { id: 'iv2-affinityHog',               path: 'discounts.affinity.hog',              label: 'Harley Owners Group',          type: 'checkbox', section: 'coverage', mode: 'quick' },
    { id: 'iv2-affinityUscgAux',           path: 'discounts.affinity.uscgAux',          label: 'US Coast Guard Auxiliary',     type: 'checkbox', section: 'coverage', mode: 'quick' },
    { id: 'iv2-affinityUsps',              path: 'discounts.affinity.usps',             label: 'US Power Squadron',            type: 'checkbox', section: 'coverage', mode: 'quick' },

    // ── History section ───────────────────────────────────────────────────
    { id: 'iv2-hasCleanHistory', path: 'history.hasCleanHistory', label: 'No incidents in the last 35 months (all operators)', type: 'checkbox', section: 'history', mode: 'quick' },

    // ── Notes ─────────────────────────────────────────────────────────────
    { id: 'iv2-notes', path: 'notes.freeText', label: 'Agent Notes', type: 'textarea', section: 'review', mode: 'full' },
];

// ─── Repeating collections ────────────────────────────────────────────────
//
// Each entry describes one item in an array. Renderers (operators, autos,
// boats, rvs, homes) read this and build cards. `id` on a collection field
// is a template — actual DOM ids get the collection index appended:
// `iv2-op-firstName-{id}`, `iv2-auto-vin-{id}`, etc.
//
// `bindable` is read by the bindability engine, which checks per-item.

const COLLECTIONS = {
    operators: {
        itemPath: 'operators',
        min: 1, // primary applicant must always exist as an operator
        fields: [
            { idStem: 'op-firstName',      path: 'firstName',       label: 'First Name', type: 'text',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco'), speller: 'general' },
            { idStem: 'op-lastName',       path: 'lastName',        label: 'Last Name',  type: 'text',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco'), speller: 'general' },
            { idStem: 'op-dob',            path: 'dob',             label: 'DOB',        type: 'date',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'op-relationship',   path: 'relationship',    label: 'Relationship', type: 'select', options: ['', 'Self', 'Spouse', 'Domestic Partner', 'Child', 'Parent', 'Sibling', 'Other'], mode: 'quick' },
            { idStem: 'op-gender',         path: 'gender',          label: 'Gender',     type: 'select', options: ['', 'Male', 'Female', 'Nonbinary'], mode: 'full' },
            { idStem: 'op-maritalStatus',  path: 'maritalStatus',   label: 'Marital',    type: 'select', options: ['', 'Single', 'Married', 'Divorced', 'Widowed', 'Domestic Partner'], mode: 'full' },
            { idStem: 'op-dl-num',         path: 'dl.num',          label: 'DL Number',  type: 'text',   mode: 'full',  speller: 'dl' },
            { idStem: 'op-dl-state',       path: 'dl.state',        label: 'DL State',   type: 'select', options: usStateOptions(), mode: 'quick' },
            { idStem: 'op-dl-status',      path: 'dl.status',       label: 'License Status', type: 'select', options: ['', 'Valid', 'Permit', 'Suspended', 'Revoked', 'None'], mode: 'full' },
            // `computed: true` marks a field as derived from other inputs
            // (here: licensing age = current year - DOB year - yrsDriving).
            // The renderer stamps `readonly tabindex="-1"` so the field
            // skips the tab order — the agent shouldn't be landing in a
            // value the form recomputes on every save anyway.
            { idStem: 'op-dl-ageLicensed', path: 'dl.ageLicensed',  label: 'Age Licensed (auto)', type: 'number', mode: 'full', computed: true },
            { idStem: 'op-yearsAuto',      path: 'dl.yearsAuto',    label: 'Yrs Driving',type: 'number', mode: 'full' },
            { idStem: 'op-yearsBoat',      path: 'dl.yearsBoat',    label: 'Yrs Boating',type: 'number', mode: 'full' },
            { idStem: 'op-yearsRV',        path: 'dl.yearsRV',      label: 'Yrs RV',     type: 'number', mode: 'full' },
            { idStem: 'op-occupation',     path: 'occupation',      label: 'Occupation', type: 'text',   mode: 'full' },
            { idStem: 'op-education',      path: 'education',       label: 'Education',  type: 'select', options: ['', 'No HS', 'High School', 'Some College', 'Associates', 'Bachelors', 'Masters', 'Doctorate'], mode: 'full' },
            { idStem: 'op-ssn',            path: 'ssn',             label: 'SSN (optional)', type: 'text', mode: 'full' },
            // ── Underwriting flags ────────────────────────────────────────
            // Subheader spans the full grid; the rest are checkboxes the
            // agent should ask about during the intake call. SR-22 / FR-44
            // and license-suspension history specifically gate Progressive
            // and Foremost auto bind eligibility.
            { idStem: 'op-flag-header',     path: '__header.flags',     label: 'Underwriting flags', type: 'header', mode: 'full' },
            { idStem: 'op-sr22',            path: 'sr22Required',       label: 'SR-22 / FR-44 required',          type: 'checkbox', mode: 'full' },
            { idStem: 'op-suspended',       path: 'licenseSuspended5y', label: 'License suspended in last 5 yrs', type: 'checkbox', mode: 'full' },
            { idStem: 'op-goodStudent',     path: 'goodStudent',        label: 'Good student (B+ avg, < 25)',     type: 'checkbox', mode: 'full' },
            { idStem: 'op-distantStudent',  path: 'distantStudent',     label: 'Distant student (away 100+ mi)',  type: 'checkbox', mode: 'full' },
            // ── Discounts + MVR ──────────────────────────────────────────
            // Defensive-driving course + mature driver discount + MVR
            // status all feed EZLynx's discount block. The DDC completion
            // date is paired with the checkbox because most carriers
            // honor the discount for 3 years from the course date.
            { idStem: 'op-disc-header',     path: '__header.discounts', label: 'Discounts & MVR',                 type: 'header', mode: 'full' },
            { idStem: 'op-ddc',             path: 'defensiveDriving',   label: 'Defensive driving course',        type: 'checkbox', mode: 'full' },
            { idStem: 'op-ddcDate',         path: 'defensiveDrivingAt', label: 'DDC completion date',             type: 'date',   mode: 'full' },
            { idStem: 'op-matureDriver',    path: 'matureDriver',       label: 'Mature driver (55+) discount',    type: 'checkbox', mode: 'full' },
            { idStem: 'op-mvrStatus',       path: 'mvrStatus',          label: 'MVR status',                       type: 'select',
              options: ['', 'Clean', 'Reviewed — clean', 'Reviewed — minor', 'Reviewed — major', 'Pending pull'], mode: 'full' },
        ],
    },

    homes: {
        itemPath: 'homes',
        fields: [
            { idStem: 'home-yrBuilt',      path: 'yrBuilt',          label: 'Year Built',         type: 'number', mode: 'quick', bindable: requiredBy('travelers','safeco','foremost') },
            { idStem: 'home-sqFt',         path: 'sqFt',             label: 'Square Footage',     type: 'number', mode: 'quick', bindable: requiredBy('travelers','safeco','foremost') },
            { idStem: 'home-lotSize',      path: 'lotSize',          label: 'Lot Size',           type: 'text',   mode: 'full' },
            { idStem: 'home-dwellingType', path: 'dwellingType',     label: 'Dwelling Type',      type: 'select', options: ['', 'One Family', 'Two Family', 'Three Family', 'Four Family', 'Condo', 'Townhouse', 'Manufactured'], mode: 'quick', bindable: requiredBy('travelers','safeco','foremost') },
            { idStem: 'home-dwellingUsage',path: 'dwellingUsage',    label: 'Usage',              type: 'select', options: ['', 'Primary', 'Secondary', 'Seasonal', 'Rental'], mode: 'quick' },
            { idStem: 'home-occupancyType',path: 'occupancyType',    label: 'Occupancy',          type: 'select', options: ['', 'Owner-occupied', 'Tenant-occupied', 'Vacant'], mode: 'quick' },
            { idStem: 'home-numStories',   path: 'numStories',       label: 'Stories',            type: 'select', options: ['', '1', '1.5', '2', '2.5', '3', '3+'], mode: 'full' },
            { idStem: 'home-numOccupants', path: 'numOccupants',     label: 'Occupants',          type: 'number', mode: 'full' },
            { idStem: 'home-bedrooms',     path: 'bedrooms',         label: 'Bedrooms',           type: 'number', mode: 'full' },
            { idStem: 'home-fullBaths',    path: 'fullBaths',        label: 'Full Baths',         type: 'number', mode: 'full' },
            { idStem: 'home-halfBaths',    path: 'halfBaths',        label: 'Half Baths',         type: 'number', mode: 'full' },
            { idStem: 'home-construction', path: 'construction',     label: 'Construction',       type: 'select', options: ['', 'Frame', 'Brick', 'Brick Veneer', 'Stucco', 'Stone', 'Concrete Block', 'Log'], mode: 'full', bindable: requiredBy('travelers','safeco') },
            { idStem: 'home-exterior',     path: 'exterior',         label: 'Exterior Walls',     type: 'select', options: ['', 'Wood Siding', 'Vinyl Siding', 'Aluminum', 'Stucco', 'Brick', 'Stone'], mode: 'full' },
            { idStem: 'home-foundation',   path: 'foundation',       label: 'Foundation',         type: 'select', options: ['', 'Slab', 'Crawl', 'Basement', 'Pier'], mode: 'full' },
            { idStem: 'home-garageType',   path: 'garage.type',      label: 'Garage Type',        type: 'select', options: ['', 'Attached', 'Detached', 'Carport', 'None'], mode: 'full' },
            { idStem: 'home-garageSpaces', path: 'garage.spaces',    label: 'Garage Spaces',      type: 'number', mode: 'full' },
            { idStem: 'home-roofType',     path: 'roof.type',        label: 'Roof Type',          type: 'select', options: ['', 'Asphalt Shingle', 'Wood Shake', 'Tile', 'Metal', 'Slate', 'Membrane'], mode: 'full', bindable: requiredBy('travelers','safeco') },
            { idStem: 'home-roofShape',    path: 'roof.shape',       label: 'Roof Shape',         type: 'select', options: ['', 'Gable', 'Hip', 'Flat', 'Mansard', 'Gambrel'], mode: 'full' },
            { idStem: 'home-roofYr',       path: 'roof.yr',          label: 'Roof Year',          type: 'number', mode: 'quick', bindable: requiredBy('travelers','safeco') },
            { idStem: 'home-heatingType',  path: 'systems.heatingType',  label: 'Heating',        type: 'select', options: ['', 'Gas', 'Electric', 'Oil', 'Propane', 'Heat Pump', 'Wood'], mode: 'full' },
            { idStem: 'home-coolingType',  path: 'systems.coolingType',  label: 'Cooling',        type: 'select', options: ['', 'Central', 'Window', 'None'], mode: 'full' },
            { idStem: 'home-plumbingYr',   path: 'systems.plumbingYr',   label: 'Plumbing Year',  type: 'number', mode: 'full' },
            { idStem: 'home-electricalYr', path: 'systems.electricalYr', label: 'Electrical Year',type: 'number', mode: 'full' },
            { idStem: 'home-protectionClass', path: 'hazards.protectionClass', label: 'Protection Class', type: 'number', mode: 'full' },
            { idStem: 'home-fireStationDist', path: 'hazards.fireStationDist', label: 'Fire Station (miles)', type: 'number', mode: 'full' },
            { idStem: 'home-fireHydrantFeet', path: 'hazards.fireHydrantFeet', label: 'Hydrant (feet)',       type: 'number', mode: 'full' },
            { idStem: 'home-alarms',          path: 'hazards.alarms',          label: 'Alarms',         type: 'select', options: ['', 'None', 'Local', 'Central Station'], mode: 'full' },
            { idStem: 'home-pool',            path: 'hazards.pool',            label: 'Pool',           type: 'checkbox', mode: 'full' },
            { idStem: 'home-trampoline',      path: 'hazards.trampoline',      label: 'Trampoline',     type: 'checkbox', mode: 'full' },
            { idStem: 'home-woodStove',       path: 'hazards.woodStove',       label: 'Wood / pellet stove', type: 'checkbox', mode: 'full' },
            { idStem: 'home-business',        path: 'hazards.businessOnPremises', label: 'Business on premises', type: 'checkbox', mode: 'full' },
            { idStem: 'home-dogs',            path: 'hazards.dogs',            label: 'Dogs (breeds)',  type: 'text', mode: 'full' },
            { idStem: 'home-purchaseDate',    path: 'purchaseDate',            label: 'Purchase Date', type: 'date', mode: 'full' },

            // ── Coverage selections ───────────────────────────────────────
            // Coverage A is the dwelling limit — the single most important
            // number on a homeowners quote. Marked bindable so the per-card
            // status dot reflects whether the agent has captured it.
            { idStem: 'home-cov-header',         path: '__header.coverages',          label: 'Coverage selections', type: 'header', mode: 'quick' },
            { idStem: 'home-cov-dwellingA',      path: 'coverages.dwellingA',         label: 'Coverage A — Dwelling',     type: 'number', mode: 'quick', bindable: requiredBy('travelers','safeco','foremost') },
            { idStem: 'home-cov-otherStructuresB', path: 'coverages.otherStructuresB', label: 'Coverage B — Other Structures', type: 'number', mode: 'full' },
            { idStem: 'home-cov-personalPropertyC', path: 'coverages.personalPropertyC', label: 'Coverage C — Personal Property', type: 'number', mode: 'full' },
            { idStem: 'home-cov-lossOfUseD',     path: 'coverages.lossOfUseD',        label: 'Coverage D — Loss of Use',  type: 'number', mode: 'full' },
            { idStem: 'home-cov-liabilityE',     path: 'coverages.liabilityE',        label: 'Coverage E — Liability',    type: 'select', options: ['', '100,000', '300,000', '500,000', '1,000,000'], mode: 'quick' },
            { idStem: 'home-cov-medPayF',        path: 'coverages.medPayF',           label: 'Coverage F — Med Pay',      type: 'select', options: ['', '1,000', '2,000', '5,000', '10,000'], mode: 'full' },
            { idStem: 'home-cov-deductible',     path: 'coverages.deductible',        label: 'All-Peril Deductible',      type: 'select', options: ['', '500', '1,000', '1,500', '2,500', '5,000', '10,000'], mode: 'quick' },
            { idStem: 'home-cov-windHail',       path: 'coverages.windHailDeductible',label: 'Wind/Hail Deductible',      type: 'select', options: ['', 'Same as AOP', '1%', '2%', '5%', '$1,000', '$2,500', '$5,000'], mode: 'full' },
            { idStem: 'home-cov-replType',       path: 'coverages.replacementType',   label: 'Settlement Type',           type: 'select', options: ['', 'Replacement Cost', 'Actual Cash Value (ACV)', 'Modified RC'], mode: 'full' },
            // Endorsements — most-requested, all checkboxes
            { idStem: 'home-end-header',         path: '__header.endorsements',       label: 'Endorsements', type: 'header', mode: 'full' },
            { idStem: 'home-end-waterBackup',    path: 'endorsements.waterBackup',    label: 'Water/Sewer Backup',          type: 'checkbox', mode: 'full' },
            { idStem: 'home-end-equipBreak',     path: 'endorsements.equipmentBreakdown', label: 'Equipment Breakdown',     type: 'checkbox', mode: 'full' },
            { idStem: 'home-end-serviceLine',    path: 'endorsements.serviceLine',    label: 'Service Line',                type: 'checkbox', mode: 'full' },
            { idStem: 'home-end-scheduledProp',  path: 'endorsements.scheduledProperty', label: 'Scheduled Personal Property', type: 'checkbox', mode: 'full' },
            { idStem: 'home-end-ordinanceLaw',   path: 'endorsements.ordinanceLaw',   label: 'Ordinance or Law',            type: 'checkbox', mode: 'full' },
            { idStem: 'home-end-identityTheft',  path: 'endorsements.identityTheft',  label: 'Identity Theft',              type: 'checkbox', mode: 'full' },

            // ── Mortgage / lien holder ────────────────────────────────────
            // Required for binding any mortgaged home — the carrier issues
            // a Mortgagee Clause certificate to this entity.
            { idStem: 'home-mort-header',  path: '__header.mortgage',         label: 'Mortgage / Lien Holder', type: 'header', mode: 'full' },
            { idStem: 'home-mort-name',    path: 'mortgageCompany.name',      label: 'Mortgage Company',     type: 'text', mode: 'full', speller: 'general' },
            { idStem: 'home-mort-loanNum', path: 'mortgageCompany.loanNumber',label: 'Loan #',               type: 'text', mode: 'full', speller: 'dl' },
            { idStem: 'home-mort-address', path: 'mortgageCompany.address',   label: 'Mortgagee Address',    type: 'text', mode: 'full', speller: 'general' },

            // Free-form per-home notes. Smart Scan's vision-hazard
            // handlers (treeOverhang, brushClearance) append into this
            // field — they have no dedicated path in the schema, but
            // need somewhere visible. Also useful for ad-hoc agent
            // observations the carrier should see.
            { idStem: 'home-notes-header', path: '__header.notes',            label: 'Notes',                 type: 'header', mode: 'full' },
            { idStem: 'home-notes',        path: 'notes',                     label: 'Home notes',            type: 'textarea', mode: 'full' },
        ],
    },

    autos: {
        itemPath: 'autos',
        fields: [
            { idStem: 'auto-year',          path: 'year',          label: 'Year',      type: 'number', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'auto-make',          path: 'make',          label: 'Make',      type: 'text',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'auto-model',         path: 'model',         label: 'Model',     type: 'text',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            // `decode: 'vin'` adds a "Decode VIN" action button next to the
            // speller — clicking validates + sanitizes + fetches NHTSA and
            // auto-fills the year/make/model fields of this same auto card.
            // See VinDecoder.decodeForIntake in js/vin-decoder.js.
            { idStem: 'auto-vin',           path: 'vin',           label: 'VIN',       type: 'text',   mode: 'quick', bindable: requiredBy('progressive'), speller: 'vin', decode: 'vin', placeholder: '1HGBH41JXMN109186' },
            // License plate + plate state are HawkSoft-required and used by
            // EZLynx for ID-card generation. Added May 2026 — historically
            // intake v2 leaned on VIN alone, which left agents copy/pasting
            // plates from the prior carrier's dec page into the export.
            { idStem: 'auto-licensePlate',  path: 'licensePlate',  label: 'License Plate', type: 'text', mode: 'full', speller: 'plate' },
            { idStem: 'auto-plateState',    path: 'plateState',    label: 'Plate State',   type: 'select', options: usStateOptions(), mode: 'full' },
            { idStem: 'auto-garagingZip',   path: 'garagingZip',   label: 'Garaging ZIP', type: 'text',  mode: 'quick' },
            { idStem: 'auto-useType',       path: 'useType',       label: 'Use',       type: 'select', options: ['', 'Pleasure', 'Commute', 'Business', 'Farm', 'Artisan'], mode: 'quick' },
            { idStem: 'auto-annualMiles',   path: 'annualMiles',   label: 'Annual Miles', type: 'number', mode: 'full' },
            { idStem: 'auto-ownership',     path: 'ownership',     label: 'Ownership', type: 'select', options: ['', 'Owned', 'Financed', 'Leased'], mode: 'full' },
            { idStem: 'auto-liab',          path: 'coverages.liab',        label: 'Liability',  type: 'select', options: ['', '25/50/25', '50/100/50', '100/300/100', '250/500/100', '300/500/300', '500/500/500'], mode: 'quick' },
            { idStem: 'auto-collDed',       path: 'coverages.collDed',     label: 'Coll Ded',   type: 'select', options: ['', 'None', '250', '500', '1000', '2500'], mode: 'full' },
            { idStem: 'auto-compDed',       path: 'coverages.compDed',     label: 'Comp Ded',   type: 'select', options: ['', 'None', '250', '500', '1000', '2500'], mode: 'full' },
            { idStem: 'auto-umuim',         path: 'coverages.umuim',       label: 'UM/UIM',     type: 'select', options: ['', '25/50', '50/100', '100/300', '250/500'], mode: 'full' },
            { idStem: 'auto-medpay',        path: 'coverages.medpay',      label: 'Med Pay',    type: 'select', options: ['', 'None', '1000', '2000', '5000', '10000'], mode: 'full' },
            { idStem: 'auto-towingDed',     path: 'coverages.towingDed',   label: 'Towing',     type: 'select', options: ['', 'None', 'Included'], mode: 'full' },
            { idStem: 'auto-rentalDed',     path: 'coverages.rentalDed',   label: 'Rental',     type: 'select', options: ['', 'None', '30/900', '40/1200', '50/1500'], mode: 'full' },
            // ── Commute / use details ─────────────────────────────────────
            { idStem: 'auto-use-header',     path: '__header.use',          label: 'Commute & use',  type: 'header', mode: 'full' },
            { idStem: 'auto-oneWayMiles',    path: 'oneWayMiles',           label: 'One-way miles to work', type: 'number', mode: 'full' },
            { idStem: 'auto-daysPerWeek',    path: 'daysPerWeek',           label: 'Days/week to work',     type: 'number', mode: 'full' },
            { idStem: 'auto-antiTheft',      path: 'antiTheftDevice',       label: 'Anti-theft device',     type: 'select', options: ['', 'None', 'Active disabling', 'Passive disabling', 'Recovery (LoJack)', 'Alarm only'], mode: 'full' },
            { idStem: 'auto-purchaseDate',   path: 'purchaseDate',          label: 'Purchase Date',          type: 'date',     mode: 'full' },
            { idStem: 'auto-originalOwner',  path: 'originalOwner',         label: 'Original owner',         type: 'checkbox', mode: 'full' },
            { idStem: 'auto-existingDamage', path: 'existingDamage',        label: 'Existing damage',        type: 'select',
              options: ['', 'None', 'Minor cosmetic', 'Body damage', 'Mechanical', 'Frame / structural'], mode: 'full' },
            // ── Lien holder ───────────────────────────────────────────────
            // Required for binding any financed or leased vehicle. Carrier
            // issues a Loss Payee endorsement to this entity.
            { idStem: 'auto-lien-header',    path: '__header.lien',         label: 'Lien holder', type: 'header', mode: 'full' },
            { idStem: 'auto-lien-name',      path: 'lienHolder.name',       label: 'Lien Holder Name',     type: 'text', mode: 'full', speller: 'general' },
            { idStem: 'auto-lien-address',   path: 'lienHolder.address',    label: 'Lien Holder Address',  type: 'text', mode: 'full', speller: 'general' },
            { idStem: 'auto-lien-loanNum',   path: 'lienHolder.loanNumber', label: 'Loan / Lease #',       type: 'text', mode: 'full', speller: 'dl' },
        ],
    },

    boats: {
        itemPath: 'boats',
        fields: [
            { idStem: 'boat-kind',         path: 'kind',           label: 'Type',         type: 'select', options: ['', 'boat', 'pwc'], mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'boat-year',         path: 'year',           label: 'Year',         type: 'number', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'boat-make',         path: 'make',           label: 'Make',         type: 'text',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'boat-model',        path: 'model',          label: 'Model',        type: 'text',   mode: 'quick' },
            { idStem: 'boat-length',       path: 'length',         label: 'Length (ft)',  type: 'number', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'boat-hin',          path: 'hin',            label: 'HIN (12 chars)', type: 'text', mode: 'quick' /* warns but never blocks */ },
            { idStem: 'boat-hullMaterial', path: 'hullMaterial',   label: 'Hull Material',type: 'select', options: ['', 'Fiberglass', 'Aluminum', 'Wood', 'Steel', 'Inflatable', 'Composite'], mode: 'quick', bindable: requiredBy('safeco','travelers') },
            { idStem: 'boat-hullDesign',   path: 'hullDesign',     label: 'Hull Design',  type: 'select', options: ['', 'Deep-V', 'Modified-V', 'Flat', 'Pontoon', 'Catamaran', 'Tri-Hull', 'Cathedral'], mode: 'full' },
            { idStem: 'boat-propulsion',   path: 'propulsion',     label: 'Propulsion',   type: 'select', options: ['', 'Outboard', 'Inboard', 'I/O (Sterndrive)', 'Jet Drive', 'Sail', 'Non-Powered'], mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'boat-engineCount',  path: 'engineCount',    label: '# Engines',    type: 'number', mode: 'full' },
            { idStem: 'boat-totalHP',      path: 'totalHP',        label: 'Total HP',     type: 'number', mode: 'quick', bindable: requiredBy('progressive','foremost') },
            { idStem: 'boat-maxSpeed',     path: 'maxSpeed',       label: 'Max Speed (mph)', type: 'number', mode: 'full' },
            { idStem: 'boat-mods',         path: 'modifications', label: 'Modifications', type: 'textarea', mode: 'full' },
            { idStem: 'boat-mooringZip',   path: 'mooringZip',     label: 'Mooring ZIP',  type: 'text',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'boat-navWaters',    path: 'navigationWaters', label: 'Waters Navigated', type: 'select', options: ['', 'Inland Lakes', 'Rivers', 'Intracoastal', 'Coastal', 'Great Lakes', 'Ocean'], mode: 'quick' },
            { idStem: 'boat-layUp',        path: 'layUpMonths',    label: 'Lay-Up Months', type: 'text',  mode: 'full' },
            { idStem: 'boat-marketValue',  path: 'marketValue',    label: 'Market Value', type: 'number', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'boat-purchasePrice',path: 'purchasePrice',  label: 'Purchase Price', type: 'number', mode: 'full' },
            { idStem: 'boat-addlEquip',    path: 'addlEquipmentValue', label: 'Add\'l Equipment $', type: 'number', mode: 'full' },
            // Trailer
            { idStem: 'boat-trailer-year', path: 'trailer.year',     label: 'Trailer Year',   type: 'number', mode: 'full' },
            { idStem: 'boat-trailer-make', path: 'trailer.make',     label: 'Trailer Make',   type: 'text',   mode: 'full' },
            { idStem: 'boat-trailer-cap',  path: 'trailer.capacityLbs', label: 'Trailer Cap (lbs)', type: 'number', mode: 'full' },
            { idStem: 'boat-trailer-axles',path: 'trailer.axles',    label: 'Trailer Axles',  type: 'number', mode: 'full' },
            { idStem: 'boat-trailer-value',path: 'trailer.value',    label: 'Trailer Value',  type: 'number', mode: 'full' },
            // Docs
            { idStem: 'boat-doc-bos',      path: 'docs.billOfSale',     label: 'Bill of Sale on file',   type: 'checkbox', mode: 'full' },
            { idStem: 'boat-doc-appraisal',path: 'docs.dealerAppraisal',label: 'Dealer Appraisal on file', type: 'checkbox', mode: 'full' },
            { idStem: 'boat-doc-photos',   path: 'docs.photos',         label: 'Photos on file',         type: 'checkbox', mode: 'full' },
            { idStem: 'boat-doc-survey',   path: 'docs.marineSurvey',   label: 'Marine Survey on file',  type: 'checkbox', mode: 'full' },
            // Usage
            { idStem: 'boat-use-pleasure', path: 'usage.pleasure',  label: 'Pleasure', type: 'checkbox', mode: 'quick' },
            { idStem: 'boat-use-rental',   path: 'usage.rental',    label: 'Rented out', type: 'checkbox', mode: 'quick' },
            { idStem: 'boat-use-charter',  path: 'usage.charter',   label: 'Chartered', type: 'checkbox', mode: 'quick' },
            { idStem: 'boat-use-commercial', path: 'usage.commercial', label: 'Commercial', type: 'checkbox', mode: 'quick' },
            // ── Coverage selections ───────────────────────────────────────
            { idStem: 'boat-cov-header',     path: '__header.coverages',     label: 'Coverage selections', type: 'header', mode: 'quick' },
            { idStem: 'boat-cov-hullType',   path: 'coverages.hullValueType',label: 'Hull Settlement', type: 'select', options: ['', 'Agreed Value', 'Actual Cash Value'], mode: 'quick' },
            { idStem: 'boat-cov-liability',  path: 'coverages.liabilityLimit', label: 'Liability Limit', type: 'select', options: ['', '50,000', '100,000', '300,000', '500,000', '1,000,000'], mode: 'quick' },
            { idStem: 'boat-cov-deductible', path: 'coverages.deductible',    label: 'Deductible',      type: 'select', options: ['', '250', '500', '1,000', '2,500', '5,000'], mode: 'quick' },
            { idStem: 'boat-cov-medPay',     path: 'coverages.medPay',        label: 'Medical Payments',type: 'select', options: ['', 'None', '1,000', '5,000', '10,000', '25,000'], mode: 'full' },
            { idStem: 'boat-cov-umBoater',   path: 'coverages.umBoater',      label: 'Uninsured Boater',type: 'select', options: ['', 'None', '50,000', '100,000', '300,000', '500,000'], mode: 'full' },
            { idStem: 'boat-cov-fuelSpill',  path: 'coverages.fuelSpillIncluded', label: 'Fuel Spill Liability', type: 'checkbox', mode: 'full' },
            { idStem: 'boat-cov-personalEffects', path: 'coverages.personalEffects', label: 'Personal Effects $', type: 'number', mode: 'full' },
            // ── Lien holder ───────────────────────────────────────────────
            { idStem: 'boat-lien-header',    path: '__header.lien',           label: 'Lien holder',     type: 'header', mode: 'full' },
            { idStem: 'boat-lien-name',      path: 'lienHolder.name',         label: 'Lien Holder Name',type: 'text', mode: 'full' },
            { idStem: 'boat-lien-address',   path: 'lienHolder.address',      label: 'Lien Holder Address', type: 'text', mode: 'full' },
            { idStem: 'boat-lien-loanNum',   path: 'lienHolder.loanNumber',   label: 'Loan #',          type: 'text', mode: 'full' },
        ],
    },

    rvs: {
        itemPath: 'rvs',
        fields: [
            { idStem: 'rv-class',          path: 'class',          label: 'Class / Type', type: 'select', options: ['', 'A', 'B', 'C', 'travelTrailer', 'fifthWheel', 'toyHauler', 'popUp', 'busConversion'], mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'rv-year',           path: 'year',           label: 'Year',          type: 'number', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'rv-make',           path: 'make',           label: 'Make',          type: 'text',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'rv-model',          path: 'model',          label: 'Model',         type: 'text',   mode: 'quick' },
            { idStem: 'rv-length',         path: 'length',         label: 'Length (ft)',   type: 'number', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'rv-vin',            path: 'vin',            label: 'VIN',           type: 'text',   mode: 'full' },
            { idStem: 'rv-garagingZip',    path: 'garagingZip',    label: 'Garaging ZIP',  type: 'text',   mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'rv-fullTimer',      path: 'fullTimer',      label: 'Full-Time Residence', type: 'checkbox', mode: 'quick' },
            { idStem: 'rv-stationary',     path: 'stationary',     label: 'Stationary year-round', type: 'checkbox', mode: 'full' },
            { idStem: 'rv-rentalCharter',  path: 'rentalCharter',  label: 'Rented or chartered', type: 'checkbox', mode: 'full' },
            { idStem: 'rv-marketValue',    path: 'marketValue',    label: 'Market Value',  type: 'number', mode: 'quick', bindable: requiredBy('progressive','foremost','travelers','safeco') },
            { idStem: 'rv-purchasePrice',  path: 'purchasePrice',  label: 'Purchase Price',type: 'number', mode: 'full' },
            { idStem: 'rv-addlEquip',      path: 'addlEquipmentValue', label: 'Add\'l Equipment $', type: 'number', mode: 'full' },
            { idStem: 'rv-tlr',            path: 'totalLossReplacementRequested', label: 'Total Loss Replacement requested', type: 'checkbox', mode: 'full' },
            // ── Coverage selections ───────────────────────────────────────
            // Motorhomes (Class A/B/C/bus) carry their own auto liability;
            // towables (travel trailer / 5W / toy hauler / pop-up) typically
            // don't but should have Vacation Liability when in use. Both
            // surfaces here so the agent can pick whichever the carrier
            // requires for the chosen RV class.
            { idStem: 'rv-cov-header',       path: '__header.coverages',     label: 'Coverage selections', type: 'header', mode: 'quick' },
            { idStem: 'rv-cov-compDed',      path: 'coverages.compDeductible', label: 'Comprehensive Deductible', type: 'select', options: ['', '250', '500', '1,000', '2,500', '5,000'], mode: 'quick' },
            { idStem: 'rv-cov-collDed',      path: 'coverages.collDeductible', label: 'Collision Deductible',     type: 'select', options: ['', '250', '500', '1,000', '2,500', '5,000'], mode: 'quick' },
            { idStem: 'rv-cov-liability',    path: 'coverages.liabilityLimit', label: 'Liability (motorhomes)',   type: 'select', options: ['', '50/100/50', '100/300/100', '250/500/100', '300/500/300', '500/500/500'], mode: 'full' },
            { idStem: 'rv-cov-vacationLiab', path: 'coverages.vacationLiability', label: 'Vacation Liability (towables)', type: 'checkbox', mode: 'full' },
            { idStem: 'rv-cov-umuim',        path: 'coverages.umuim',         label: 'UM/UIM',                 type: 'select', options: ['', '25/50', '50/100', '100/300', '250/500'], mode: 'full' },
            { idStem: 'rv-cov-medPay',       path: 'coverages.medPay',        label: 'Medical Payments',       type: 'select', options: ['', 'None', '1,000', '5,000', '10,000', '25,000'], mode: 'full' },
            { idStem: 'rv-cov-personalEffects', path: 'coverages.personalEffects', label: 'Personal Effects $', type: 'number', mode: 'full' },
            { idStem: 'rv-cov-awning',       path: 'coverages.awningDamage',  label: 'Awning Damage',          type: 'checkbox', mode: 'full' },
            { idStem: 'rv-cov-emergencyExp', path: 'coverages.emergencyExpense', label: 'Emergency Expense',   type: 'checkbox', mode: 'full' },
            // ── Lien holder ───────────────────────────────────────────────
            { idStem: 'rv-lien-header',      path: '__header.lien',           label: 'Lien holder',     type: 'header', mode: 'full' },
            { idStem: 'rv-lien-name',        path: 'lienHolder.name',         label: 'Lien Holder Name',type: 'text', mode: 'full' },
            { idStem: 'rv-lien-address',     path: 'lienHolder.address',      label: 'Lien Holder Address', type: 'text', mode: 'full' },
            { idStem: 'rv-lien-loanNum',     path: 'lienHolder.loanNumber',   label: 'Loan #',          type: 'text', mode: 'full' },
        ],
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function usStateOptions() {
    // Return `[value, label]` tuples; the renderer detects array-of-arrays
    // and emits `<option value=value>label</option>` directly. Tuples let
    // the dropdown show the full state name while the stored value stays
    // the 2-letter USPS code (what EZLynx + HawkSoft + every carrier API
    // parses). Built fresh each call rather than cached in a const above
    // because SCALAR_FIELDS initialization at module top calls this
    // function — referencing a `const` declared later in the file would
    // trip a TDZ ReferenceError under `'use strict'`.
    return [
        ['', ''],
        ['AL', 'Alabama (AL)'],         ['AK', 'Alaska (AK)'],
        ['AZ', 'Arizona (AZ)'],         ['AR', 'Arkansas (AR)'],
        ['CA', 'California (CA)'],      ['CO', 'Colorado (CO)'],
        ['CT', 'Connecticut (CT)'],     ['DE', 'Delaware (DE)'],
        ['DC', 'District of Columbia (DC)'],
        ['FL', 'Florida (FL)'],         ['GA', 'Georgia (GA)'],
        ['HI', 'Hawaii (HI)'],          ['ID', 'Idaho (ID)'],
        ['IL', 'Illinois (IL)'],        ['IN', 'Indiana (IN)'],
        ['IA', 'Iowa (IA)'],            ['KS', 'Kansas (KS)'],
        ['KY', 'Kentucky (KY)'],        ['LA', 'Louisiana (LA)'],
        ['ME', 'Maine (ME)'],           ['MD', 'Maryland (MD)'],
        ['MA', 'Massachusetts (MA)'],   ['MI', 'Michigan (MI)'],
        ['MN', 'Minnesota (MN)'],       ['MS', 'Mississippi (MS)'],
        ['MO', 'Missouri (MO)'],        ['MT', 'Montana (MT)'],
        ['NE', 'Nebraska (NE)'],        ['NV', 'Nevada (NV)'],
        ['NH', 'New Hampshire (NH)'],   ['NJ', 'New Jersey (NJ)'],
        ['NM', 'New Mexico (NM)'],      ['NY', 'New York (NY)'],
        ['NC', 'North Carolina (NC)'],  ['ND', 'North Dakota (ND)'],
        ['OH', 'Ohio (OH)'],            ['OK', 'Oklahoma (OK)'],
        ['OR', 'Oregon (OR)'],          ['PA', 'Pennsylvania (PA)'],
        ['RI', 'Rhode Island (RI)'],    ['SC', 'South Carolina (SC)'],
        ['SD', 'South Dakota (SD)'],    ['TN', 'Tennessee (TN)'],
        ['TX', 'Texas (TX)'],           ['UT', 'Utah (UT)'],
        ['VT', 'Vermont (VT)'],         ['VA', 'Virginia (VA)'],
        ['WA', 'Washington (WA)'],      ['WV', 'West Virginia (WV)'],
        ['WI', 'Wisconsin (WI)'],       ['WY', 'Wyoming (WY)'],
    ];
}

// FieldMapV2 — mirror of v1's FieldMap (js/fields.js:230) but path-based.
const FieldMapV2 = (function () {
    const byId = new Map();
    SCALAR.forEach(f => byId.set(f.id, f));

    function pathForElement(el) {
        if (!el || !el.id) return null;
        // Scalar lookup (DOM id is the registry id)
        const f = byId.get(el.id);
        if (f) return f.path;
        // Collection item lookup — DOM id encoded as `iv2-{idStem}-{collectionItemId}`
        // The element MUST carry data-collection (e.g. "operators") and data-item-id.
        const collection = el.getAttribute('data-collection');
        const itemId     = el.getAttribute('data-item-id');
        const fieldPath  = el.getAttribute('data-field-path');
        if (collection && itemId != null && fieldPath) {
            return `${collection}#${itemId}.${fieldPath}`;
        }
        return null;
    }

    function idForPath(path) {
        for (const f of SCALAR) if (f.path === path) return f.id;
        return null;
    }

    function getField(idOrPath) {
        if (byId.has(idOrPath)) return byId.get(idOrPath);
        for (const f of SCALAR) if (f.path === idOrPath) return f;
        return null;
    }

    return { pathForElement, idForPath, getField, byId };
})();

window.IntakeV2Fields = { scalar: SCALAR, collections: COLLECTIONS };
window.FieldMapV2 = FieldMapV2;

})();
