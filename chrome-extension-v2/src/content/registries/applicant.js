/**
 * Altech EZLynx V2 — Applicant /details registry (45 atoms)
 *
 * Covers the primary applicant on the /web/account/create/personal/details
 * page (route key: 'applicant-details').
 *
 * Field id inventory grounded in plan §6.1 (5 live recon sessions, Apr 2026).
 * clientData source keys match js/ezlynx-tool.js getFormData() output.
 *
 * Groups (in execution order, respecting preconditions):
 *   Personal (12) → DL & Work (7) → Meta (7) → Address (13) → Contact (6)
 *
 * All atoms default to skipIfLexisNexisLocked + skipIfDisabled (inherited
 * from atom-executor defaults). Personal group fields are the most commonly
 * locked by LexisNexis prefill so we call it out explicitly there.
 */
(function (global) {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // §6.1 Personal (12 atoms)
    // ─────────────────────────────────────────────────────────────────────────
    const PERSONAL = [
        { key: 'prefix',         source: 'Prefix',        label: 'Prefix',
          idTemplate: 'applicant-prefix',                  type: 'mat-select',
          skipIfLexisNexisLocked: true },
        { key: 'firstName',      source: 'FirstName',     label: 'First Name',
          idTemplate: 'applicant-first-name',              type: 'text',
          skipIfLexisNexisLocked: true },
        { key: 'middleName',     source: 'MiddleName',    label: 'Middle Name',
          idTemplate: 'applicant-middle-name',             type: 'text',
          skipIfLexisNexisLocked: true },
        { key: 'lastName',       source: 'LastName',      label: 'Last Name',
          idTemplate: 'applicant-last-name',               type: 'text',
          skipIfLexisNexisLocked: true },
        { key: 'suffix',         source: 'Suffix',        label: 'Suffix',
          idTemplate: 'applicant-name-suffix',             type: 'mat-select',
          skipIfLexisNexisLocked: true },
        { key: 'gender',         source: 'Gender',        label: 'Gender',
          idTemplate: 'applicant-gender',                  type: 'mat-select',
          skipIfLexisNexisLocked: true },
        { key: 'dateOfBirth',    source: 'DOB',           label: 'Date of Birth',
          idTemplate: 'applicant-date-of-birth',           type: 'date',
          skipIfLexisNexisLocked: true },
        { key: 'maritalStatus',  source: 'MaritalStatus', label: 'Marital Status',
          idTemplate: 'applicant-marital-status',          type: 'mat-select',
          skipIfLexisNexisLocked: true },
        { key: 'ssn',            source: 'SSN',           label: 'Social Security Number',
          idTemplate: 'applicant-social-security-number',  type: 'ssn',
          skipIfLexisNexisLocked: true },
        { key: 'maidenName',     source: 'MaidenName',    label: 'Maiden Name',
          idTemplate: 'applicant-maiden-name',             type: 'text',
          skipIfLexisNexisLocked: true },
        { key: 'nickname',       source: 'Nickname',      label: 'Nickname',
          idTemplate: 'applicant-nickname',                type: 'text' },
        { key: 'dlNumber',       source: 'LicenseNumber', label: "Driver's License Number",
          idTemplate: 'applicant-drivers-license-number',  type: 'text',
          skipIfLexisNexisLocked: true },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // §6.1 DL & Work (7 atoms)
    // Occupation has a precondition on industry; occupationYears on occupation.
    // ─────────────────────────────────────────────────────────────────────────
    const DL_WORK = [
        { key: 'dlStatus',          source: 'LicenseStatus',    label: 'DL Status',
          idTemplate: 'applicant-drivers-license-status',        type: 'mat-select' },
        { key: 'dlState',           source: 'DLState',          label: 'DL State',
          idTemplate: 'applicant-drivers-license-state',         type: 'mat-select' },
        { key: 'education',         source: 'Education',        label: 'Education',
          idTemplate: 'applicant-education',                     type: 'mat-select' },
        { key: 'industry',          source: 'Industry',         label: 'Industry',
          idTemplate: 'applicant-industry',                      type: 'mat-select' },
        { key: 'occupation',        source: 'Occupation',       label: 'Occupation',
          idTemplate: 'applicant-occupation',                    type: 'mat-select',
          preconditions: [{ atom: 'industry', state: 'DONE' }] },
        { key: 'occupationYears',   source: 'OccupationYears',  label: 'Years at Occupation',
          idTemplate: 'applicant-occupation-years',              type: 'text',
          preconditions: [{ atom: 'occupation', state: 'DONE' }] },
        { key: 'priorEmployerYears', source: 'PriorEmployerYears', label: 'Prior Employer Years',
          idTemplate: 'applicant-prior-employer-in-years',       type: 'text' },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // §6.1 Meta (7 atoms)
    // ─────────────────────────────────────────────────────────────────────────
    const META = [
        { key: 'applicantType',    source: 'ApplicantType',   label: 'Applicant Type',
          idTemplate: 'applicant-type',                        type: 'mat-select' },
        { key: 'customerSince',    source: 'CustomerSince',   label: 'Customer Since',
          idTemplate: 'applicant-customer-since',              type: 'date' },
        { key: 'accountName',      source: 'AccountName',     label: 'Account Name',
          idTemplate: 'applicant-account-name',                type: 'text' },
        { key: 'assignedTo',       source: 'AssignedTo',      label: 'Assigned To',
          idTemplate: 'input-assigned-to',                     type: 'text' },
        { key: 'csr',              source: 'CSR',             label: 'CSR',
          idTemplate: 'input-csr',                             type: 'text' },
        { key: 'leadChannel',      source: 'LeadSource',      label: 'Lead Channel',
          idTemplate: 'applicant-lead-channel',                type: 'mat-select' },
        { key: 'preferredLanguage', source: 'PreferredLanguage', label: 'Preferred Language',
          idTemplate: 'preferred-language',                    type: 'mat-select' },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // §6.1 Address (13 atoms)
    // address1 has a postFill dismissPacContainer to kill the Places overlay
    // before city/state/county fill.
    // county has a precondition on addressState (Angular won't render county
    // options until state is selected).
    // ─────────────────────────────────────────────────────────────────────────
    const ADDRESS = [
        { key: 'ratingState',     source: 'State',        label: 'Rating State',
          idTemplate: 'applicant-rating-state',           type: 'mat-select' },
        // ⚠️ Legacy id — inconsistent naming vs the rest of the address block.
        { key: 'zipLegacy',       source: 'Zip',          label: 'ZIP (legacy field)',
          idTemplate: 'applicant-primaryaddress-postalcode', type: 'text' },
        { key: 'addressType',     source: 'AddressType',  label: 'Address Type',
          idTemplate: 'applicant-primary-address-applicantAddressType', type: 'mat-select' },
        { key: 'address1',        source: 'Address',      label: 'Address Line 1',
          idTemplate: 'applicant-primary-address-address1', type: 'text',
          postFill: [{ action: 'dismissPacContainer' }] },
        { key: 'addressUnit',     source: 'AddressUnit',  label: 'Unit / Apt',
          idTemplate: 'applicant-primary-address-addressUnit', type: 'text' },
        { key: 'address2',        source: 'Address2',     label: 'Address Line 2',
          idTemplate: 'applicant-primary-address-address2', type: 'text' },
        { key: 'city',            source: 'City',         label: 'City',
          idTemplate: 'applicant-primary-address-addressCity', type: 'text' },
        { key: 'addressState',    source: 'State',        label: 'Address State',
          idTemplate: 'applicant-primary-address-addressState', type: 'mat-select' },
        { key: 'county',          source: 'County',       label: 'County',
          idTemplate: 'applicant-primary-address-addressCounty', type: 'mat-select',
          preconditions: [{ atom: 'addressState', state: 'DONE' }] },
        { key: 'postalCode',      source: 'Zip',          label: 'Postal Code',
          idTemplate: 'applicant-primary-address-postalCode', type: 'text' },
        { key: 'postalCodeSuffix', source: 'ZipSuffix',   label: 'Postal Code Suffix',
          idTemplate: 'applicant-primary-address-postalCodeSuffix', type: 'text' },
        { key: 'yearsAtAddress',  source: 'YearsAtAddress', label: 'Years at Address',
          idTemplate: 'applicant-primary-address-yearsAtAddress', type: 'text' },
        { key: 'monthsAtAddress', source: 'MonthsAtAddress', label: 'Months at Address',
          idTemplate: 'applicant-primary-address-monthsAtAddress', type: 'text' },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // §6.1 Contact (6 atoms)
    // ─────────────────────────────────────────────────────────────────────────
    const CONTACT = [
        { key: 'phoneType',     source: 'PhoneType',     label: 'Phone Type',
          idTemplate: 'Mobile_PhoneType-type',            type: 'mat-select' },
        { key: 'phone',         source: 'Phone',         label: 'Phone Number',
          idTemplate: 'Mobile_PhoneType-applicant-phone-0-personal-number', type: 'phone' },
        { key: 'emailType',     source: 'EmailType',     label: 'Email Type',
          idTemplate: 'applicant-email-0-type',           type: 'mat-select' },
        { key: 'email',         source: 'Email',         label: 'Email',
          idTemplate: 'applicant-email-0-email-address',  type: 'text' },
        { key: 'contactMethod', source: 'ContactMethod', label: 'Preferred Contact Method',
          idTemplate: 'applicant-preferred-contact-method', type: 'mat-select' },
        { key: 'contactTime',   source: 'ContactTime',   label: 'Preferred Contact Time',
          idTemplate: 'applicant-preferred-contact-time', type: 'mat-select' },
    ];

    const applicantAtoms = [
        ...PERSONAL,
        ...DL_WORK,
        ...META,
        ...ADDRESS,
        ...CONTACT,
    ];

    const api = { applicantAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.applicantAtoms = applicantAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
