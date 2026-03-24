// fields.js — single source of truth for all App.data intake form fields.
// Add or rename fields here only. Do not hardcode labels in app-export.js or hawksoft-export.js.
//
// Each entry: { id, label, type, section }
//   id      — matches the HTML <input id> in plugins/quoting.html AND the App.data key
//   label   — canonical display label used in PDF and HawkSoft FSC exports
//   type    — 'text' | 'select' | 'date' | 'number' | 'tel' | 'email' | 'textarea' | 'checkbox' | 'logic'
//   section — logical grouping (applicant | coapplicant | address | property | roof | systems |
//             hazards | home-coverage | home-endorsements | auto-coverage | prior-insurance | notes)
//   ezlynxRequired — optional boolean; when true, a ✦ indicator is shown next to the label in the Personal Lines form
//
// Special export notes are documented as comments — no runtime magic, no extra properties.
// Ghost fields (not present in plugins/quoting.html — set only by AI scan) are marked inForm: false.

/* eslint-disable */
window.FIELDS = [

    // ── Applicant ──────────────────────────────────────────────────────────
    { id: 'prefix',         label: 'Prefix',           type: 'select',  section: 'applicant' },
    { id: 'firstName',      label: 'First Name',        type: 'text',    section: 'applicant', ezlynxRequired: true },
    { id: 'middleName',     label: 'Middle Name',       type: 'text',    section: 'applicant', inForm: false }, // ghost — not in quoting.html; PDF reads it but will get ''
    { id: 'lastName',       label: 'Last Name',         type: 'text',    section: 'applicant', ezlynxRequired: true },
    { id: 'suffix',         label: 'Suffix',            type: 'select',  section: 'applicant' },
    { id: 'dob',            label: 'Date of Birth',     type: 'date',    section: 'applicant', ezlynxRequired: true },
    { id: 'gender',         label: 'Gender',            type: 'select',  section: 'applicant', ezlynxRequired: true },
    { id: 'maritalStatus',  label: 'Marital Status',    type: 'select',  section: 'applicant', ezlynxRequired: true },
    { id: 'phone',          label: 'Phone',             type: 'tel',     section: 'applicant', ezlynxRequired: true },
    { id: 'email',          label: 'Email',             type: 'email',   section: 'applicant' },
    { id: 'education',      label: 'Education',         type: 'select',  section: 'applicant' },
    { id: 'industry',       label: 'Industry',          type: 'select',  section: 'applicant', ezlynxRequired: true },
    { id: 'occupation',     label: 'Occupation',        type: 'text',    section: 'applicant', ezlynxRequired: true },

    // ── Co-Applicant ───────────────────────────────────────────────────────
    { id: 'coFirstName',    label: 'Co-App First Name', type: 'text',    section: 'coapplicant', ezlynxRequired: true },
    { id: 'coLastName',     label: 'Co-App Last Name',  type: 'text',    section: 'coapplicant', ezlynxRequired: true },
    { id: 'coDob',          label: 'Co-App DOB',        type: 'date',    section: 'coapplicant', ezlynxRequired: true },
    { id: 'coGender',       label: 'Co-App Gender',     type: 'select',  section: 'coapplicant', ezlynxRequired: true },
    { id: 'coEmail',        label: 'Co-App Email',      type: 'email',   section: 'coapplicant' },
    { id: 'coPhone',        label: 'Co-App Phone',      type: 'tel',     section: 'coapplicant' },
    { id: 'coRelationship', label: 'Relationship',      type: 'select',  section: 'coapplicant', ezlynxRequired: true },
    { id: 'coOccupation',   label: 'Co-App Occupation', type: 'text',    section: 'coapplicant', ezlynxRequired: true },
    { id: 'coEducation',    label: 'Co-App Education',  type: 'select',  section: 'coapplicant' },
    { id: 'coIndustry',     label: 'Co-App Industry',   type: 'select',  section: 'coapplicant', ezlynxRequired: true },
    { id: 'coMaritalStatus',label: 'Co-App Marital Status', type: 'select', section: 'coapplicant', ezlynxRequired: true },

    // ── Address ────────────────────────────────────────────────────────────
    // NOTE: field IDs are addrStreet/addrCity/addrState/addrZip — NOT address/city/state/zip
    { id: 'addrStreet',       label: 'Street Address',       type: 'text',   section: 'address', ezlynxRequired: true },
    { id: 'addrCity',         label: 'City',                 type: 'text',   section: 'address', ezlynxRequired: true },
    { id: 'addrState',        label: 'State',                type: 'select', section: 'address', ezlynxRequired: true },
    { id: 'addrZip',          label: 'ZIP Code',             type: 'text',   section: 'address', ezlynxRequired: true },
    { id: 'county',           label: 'County',               type: 'text',   section: 'address' },
    { id: 'yearsAtAddress',      label: 'Years at Address',          type: 'number', section: 'address' },
    { id: 'previousAddrStreet', label: 'Previous Street Address',   type: 'text',   section: 'address', ezlynxRequired: false },
    { id: 'previousAddrCity',   label: 'Previous City',             type: 'text',   section: 'address', ezlynxRequired: false },
    { id: 'previousAddrState',  label: 'Previous State',            type: 'select', section: 'address', ezlynxRequired: false },
    { id: 'previousAddrZip',    label: 'Previous ZIP',              type: 'text',   section: 'address', ezlynxRequired: false },
    { id: 'primaryHomeAddr',  label: 'Primary Home Address', type: 'text',   section: 'address' },
    { id: 'primaryHomeCity',  label: 'Primary Home City',    type: 'text',   section: 'address' },
    { id: 'primaryHomeState', label: 'Primary Home State',   type: 'select', section: 'address' },
    { id: 'primaryHomeZip',   label: 'Primary Home ZIP',     type: 'text',   section: 'address' },

    // ── Property ───────────────────────────────────────────────────────────
    { id: 'yrBuilt',          label: 'Year Built',           type: 'number', section: 'property', ezlynxRequired: true },
    { id: 'sqFt',             label: 'Square Footage',       type: 'number', section: 'property', ezlynxRequired: true },
    { id: 'lotSize',          label: 'Lot Size',             type: 'text',   section: 'property' },
    { id: 'dwellingType',     label: 'Dwelling Type',        type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'dwellingUsage',    label: 'Dwelling Usage',       type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'occupancyType',    label: 'Occupancy',            type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'numStories',       label: 'Stories',              type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'numOccupants',     label: 'Occupants',            type: 'number', section: 'property', ezlynxRequired: true },
    { id: 'bedrooms',         label: 'Bedrooms',             type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'fullBaths',        label: 'Full Baths',           type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'halfBaths',        label: 'Half Baths',           type: 'select', section: 'property' },
    { id: 'constructionStyle',label: 'Construction',         type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'exteriorWalls',    label: 'Exterior Walls',       type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'foundation',       label: 'Foundation',           type: 'select', section: 'property', ezlynxRequired: true },
    { id: 'garageType',       label: 'Garage Type',          type: 'select', section: 'property' },
    { id: 'garageSpaces',     label: 'Garage Spaces',        type: 'select', section: 'property' },
    { id: 'kitchenQuality',   label: 'Kitchen/Bath Quality', type: 'select', section: 'property' },
    { id: 'flooring',         label: 'Flooring',             type: 'text',   section: 'property' }, // PDF only — not in HawkSoft FSC
    { id: 'numFireplaces',    label: 'Fireplaces',           type: 'select', section: 'property' }, // ⚠️ HawkSoft FSC: skipped if value === '0' — see _buildFscNotes
    { id: 'purchaseDate',     label: 'Purchase Date',        type: 'date',   section: 'property', ezlynxRequired: true },

    // ── Roof ───────────────────────────────────────────────────────────────
    { id: 'roofType',   label: 'Roof Type',        type: 'select', section: 'roof', ezlynxRequired: true },
    { id: 'roofShape',  label: 'Roof Shape',       type: 'select', section: 'roof', ezlynxRequired: true },
    { id: 'roofYr',     label: 'Roof Year',        type: 'number', section: 'roof', ezlynxRequired: true },
    { id: 'roofUpdate', label: 'Roof Update Type', type: 'select', section: 'roof' }, // PDF only — not in HawkSoft FSC

    // ── Systems ────────────────────────────────────────────────────────────
    { id: 'heatingType',  label: 'Heating Type',       type: 'select', section: 'systems', ezlynxRequired: true },
    { id: 'heatYr',       label: 'Heating Updated',    type: 'number', section: 'systems', ezlynxRequired: true },
    { id: 'cooling',      label: 'Cooling',            type: 'select', section: 'systems' },
    { id: 'plumbYr',      label: 'Plumbing Updated',   type: 'number', section: 'systems', ezlynxRequired: true },
    { id: 'elecYr',       label: 'Electrical Updated', type: 'number', section: 'systems', ezlynxRequired: true },
    { id: 'sewer',        label: 'Sewer',              type: 'select', section: 'systems' }, // PDF only — not in HawkSoft FSC
    { id: 'waterSource',  label: 'Water Source',       type: 'select', section: 'systems' }, // PDF only — not in HawkSoft FSC

    // ── Hazards / Safety ───────────────────────────────────────────────────
    { id: 'burglarAlarm',       label: 'Burglar Alarm',        type: 'select',   section: 'hazards' },
    { id: 'fireAlarm',          label: 'Fire Alarm',           type: 'select',   section: 'hazards' },
    { id: 'smokeDetector',      label: 'Smoke Detector',       type: 'select',   section: 'hazards' },
    { id: 'sprinklers',         label: 'Sprinklers',           type: 'select',   section: 'hazards' },
    { id: 'deadbolt',           label: 'Deadbolt',             type: 'select',   section: 'hazards', inForm: false }, // ghost — AI scan only; used by HawkSoft HS home.deadbolt
    { id: 'fireExtinguisher',   label: 'Fire Extinguisher',    type: 'select',   section: 'hazards', inForm: false }, // ghost — AI scan only; used by HawkSoft HS home.fireExtinguisher
    { id: 'pool',               label: 'Swimming Pool',        type: 'select',   section: 'hazards' },
    { id: 'trampoline',         label: 'Trampoline',           type: 'select',   section: 'hazards' }, // ⚠️ HawkSoft FSC: skipped if value === 'No' — see _buildFscNotes
    { id: 'woodStove',          label: 'Wood Stove',           type: 'select',   section: 'hazards' }, // ⚠️ HawkSoft FSC: skipped if value === 'None' — see _buildFscNotes
    { id: 'secondaryHeating',   label: 'Secondary Heating',    type: 'select',   section: 'hazards' }, // PDF only — not in HawkSoft FSC
    { id: 'dogInfo',            label: 'Dogs',                 type: 'text',     section: 'hazards' }, // NOTE: QUICKREF.md incorrectly calls this dogBreed
    { id: 'businessOnProperty', label: 'Business on Property', type: 'select',   section: 'hazards' }, // ⚠️ HawkSoft FSC: skipped if value === 'No' — see _buildFscNotes
    { id: 'fireStationDist',    label: 'Fire Station (mi)',    type: 'number',   section: 'hazards', ezlynxRequired: true }, // PDF only — not in HawkSoft FSC
    { id: 'fireHydrantFeet',    label: 'Fire Hydrant (ft)',    type: 'number',   section: 'hazards', ezlynxRequired: true }, // PDF only — not in HawkSoft FSC
    { id: 'tidalWaterDist',     label: 'Tidal Water (ft)',     type: 'number',   section: 'hazards' }, // PDF only — not in HawkSoft FSC
    { id: 'protectionClass',    label: 'Protection Class',     type: 'text',     section: 'hazards', ezlynxRequired: true },

    // ── Home Coverage ──────────────────────────────────────────────────────
    { id: 'homePolicyType',       label: 'Policy Type',                 type: 'select',   section: 'home-coverage' },
    { id: 'dwellingCoverage',     label: 'Dwelling Coverage',           type: 'text',     section: 'home-coverage', ezlynxRequired: true },
    { id: 'otherStructures',      label: 'Other Structures (Cov B)',    type: 'text',     section: 'home-coverage', ezlynxRequired: false },
    { id: 'homePersonalProperty', label: 'Personal Property',           type: 'text',     section: 'home-coverage' },
    { id: 'homeLossOfUse',        label: 'Loss of Use',                 type: 'text',     section: 'home-coverage' },
    { id: 'personalLiability',    label: 'Personal Liability',          type: 'text',     section: 'home-coverage', ezlynxRequired: true },
    { id: 'medicalPayments',      label: 'Medical Payments',            type: 'text',     section: 'home-coverage', ezlynxRequired: true },
    { id: 'homeDeductible',       label: 'Deductible (AOP)',            type: 'text',     section: 'home-coverage', ezlynxRequired: true },
    { id: 'windDeductible',       label: 'Wind/Hail Deductible',        type: 'text',     section: 'home-coverage' },
    { id: 'mortgagee',            label: 'Mortgagee / Lienholder',      type: 'text',     section: 'home-coverage' },

    // ── Home Endorsements ──────────────────────────────────────────────────
    { id: 'increasedReplacementCost', label: 'Increased Replacement Cost', type: 'text',   section: 'home-endorsements', ezlynxRequired: true },
    { id: 'ordinanceOrLaw',           label: 'Ordinance or Law',           type: 'text',   section: 'home-endorsements' },
    { id: 'waterBackup',              label: 'Water Backup',               type: 'text',   section: 'home-endorsements' }, // ⚠️ HawkSoft FSC: skipped if value === 'No' — see _buildFscNotes
    { id: 'lossAssessment',           label: 'Loss Assessment',            type: 'text',   section: 'home-endorsements' },
    { id: 'animalLiability',          label: 'Animal Liability',           type: 'text',   section: 'home-endorsements' }, // ⚠️ HawkSoft FSC: skipped if value === 'No' — see _buildFscNotes
    { id: 'theftDeductible',          label: 'Theft Deductible',           type: 'text',   section: 'home-endorsements' },
    { id: 'jewelryLimit',             label: 'Jewelry/Valuables Limit',    type: 'text',   section: 'home-endorsements' },
    { id: 'creditCardCoverage',       label: 'Credit Card Coverage',       type: 'text',   section: 'home-endorsements' },
    { id: 'moldDamage',               label: 'Mold Damage',                type: 'text',   section: 'home-endorsements' },
    { id: 'equipmentBreakdown',       label: 'Equipment Breakdown',        type: 'select', section: 'home-endorsements' }, // ⚠️ HawkSoft FSC: skipped if value === 'No' — see _buildFscNotes
    { id: 'serviceLine',              label: 'Service Line',               type: 'select', section: 'home-endorsements' }, // ⚠️ HawkSoft FSC: skipped if value === 'No' — see _buildFscNotes
    { id: 'additionalInsureds',       label: 'Additional Insureds',        type: 'textarea', section: 'home-endorsements' },
    { id: 'earthquakeCoverage',       label: 'Earthquake Coverage',        type: 'select', section: 'home-endorsements' },
    { id: 'earthquakeZone',           label: 'Earthquake Zone',            type: 'text',   section: 'home-endorsements' },
    { id: 'earthquakeDeductible',     label: 'Earthquake Deductible',      type: 'text',   section: 'home-endorsements' },

    // ── Auto Coverage ──────────────────────────────────────────────────────
    { id: 'autoPolicyType',    label: 'Auto Policy Type',       type: 'select', section: 'auto-coverage' },
    { id: 'residenceIs',       label: 'Residence Is',           type: 'select', section: 'auto-coverage' },
    { id: 'liabilityLimits',   label: 'Liability Limits',       type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'pdLimit',           label: 'Property Damage',        type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'medPayments',       label: 'Med Pay (Auto)',         type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'umLimits',          label: 'UM Limits',              type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'uimLimits',         label: 'UIM Limits',             type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'umpdLimit',         label: 'UMPD Limit',             type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'compDeductible',    label: 'Comprehensive Ded.',     type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'autoDeductible',    label: 'Collision Ded.',         type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'rentalDeductible',  label: 'Rental Reimbursement',   type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'towingDeductible',  label: 'Towing/Roadside',        type: 'text',   section: 'auto-coverage', ezlynxRequired: true },
    { id: 'studentGPA',        label: 'Student GPA',            type: 'text',   section: 'auto-coverage' },
    { id: 'accidents',         label: 'Accidents',              type: 'text',   section: 'auto-coverage' },
    { id: 'violations',        label: 'Violations',             type: 'text',   section: 'auto-coverage' },

    // ── Policy / Prior Insurance ───────────────────────────────────────────
    { id: 'qType',                label: 'Quote Type',          type: 'logic',  section: 'prior-insurance' }, // logic-only — drives workflow, not directly exported
    { id: 'policyTerm',           label: 'Policy Term',         type: 'select', section: 'prior-insurance', ezlynxRequired: true },
    { id: 'effectiveDate',        label: 'Effective Date',      type: 'date',   section: 'prior-insurance', ezlynxRequired: true },
    { id: 'priorCarrier',         label: 'Prior Auto Carrier',  type: 'text',   section: 'prior-insurance', ezlynxRequired: true },
    { id: 'priorPolicyTerm',      label: 'Prior Auto Term',     type: 'select', section: 'prior-insurance', ezlynxRequired: true },
    { id: 'priorYears',           label: 'Prior Auto Years',    type: 'number', section: 'prior-insurance', ezlynxRequired: true },
    { id: 'priorExp',             label: 'Prior Auto Exp.',     type: 'date',   section: 'prior-insurance', ezlynxRequired: true },
    { id: 'priorLiabilityLimits', label: 'Prior Auto Limits',   type: 'text',   section: 'prior-insurance', ezlynxRequired: true },
    { id: 'continuousCoverage',   label: 'Continuous Coverage', type: 'select', section: 'prior-insurance', ezlynxRequired: true },
    { id: 'homePriorCarrier',     label: 'Home Prior Carrier',  type: 'text',   section: 'prior-insurance', ezlynxRequired: true },
    { id: 'homePriorYears',       label: 'Home Prior Years',    type: 'number', section: 'prior-insurance', ezlynxRequired: true },
    { id: 'homePriorPolicyTerm',  label: 'Home Prior Term',     type: 'select', section: 'prior-insurance' }, // PDF only — not in HawkSoft FSC
    { id: 'homePriorExp',         label: 'Home Prior Exp.',     type: 'date',   section: 'prior-insurance', ezlynxRequired: true }, // PDF only — not in HawkSoft FSC
    { id: 'homePriorLiability',   label: 'Home Prior Liability',type: 'text',   section: 'prior-insurance' }, // PDF only — not in HawkSoft FSC
    { id: 'creditCheckAuth',      label: 'Credit Check Authorization', type: 'checkbox', section: 'prior-insurance', ezlynxRequired: true }, // note: uses checkbox-row in quoting.html — DOM pass cannot auto-stamp

    // ── Notes / Contact ────────────────────────────────────────────────────
    { id: 'referralSource', label: 'Referral Source',    type: 'select',   section: 'notes' },
    { id: 'contactTime',    label: 'Best Contact Time',  type: 'text',     section: 'notes' },
    { id: 'contactMethod',  label: 'Contact Method',     type: 'select',   section: 'notes' },
    { id: 'tcpaConsent',    label: 'TCPA Consent',       type: 'checkbox', section: 'notes' },
    { id: 'pdfNotes',       label: 'Notes',              type: 'textarea', section: 'notes' }, // PDF only — free-text notes section at end of PDF

];

// Lookup map: FIELD_BY_ID['fieldId'] → { id, label, type, section }
window.FIELD_BY_ID = Object.fromEntries(window.FIELDS.map(f => [f.id, f]));
