/**
 * Altech EZLynx V2 — Applicant /create/personal registry
 *
 * Covers the primary applicant on the /web/account/create/personal page
 * (route key: 'applicant-details').
 *
 * Field IDs grounded in live registry-audit of 2026-04-12. The create page
 * uses `contact-{field}-0` pattern (not `applicant-{field}` from recon).
 *
 * Groups (in execution order, respecting preconditions):
 *   Personal (12) → DL & Work (5) → Address (11) → Contact (4)
 *
 * Fields that only exist on existing-account pages (applicantType,
 * customerSince, accountName, assignedTo, csr, leadChannel,
 * preferredLanguage, ratingState, education, priorEmployerYears,
 * contactMethod, contactTime) are omitted — they're not on the create page.
 */
(function (global) {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // Personal (12 atoms)
    // ─────────────────────────────────────────────────────────────────────────
    const PERSONAL = [
        { key: 'prefix',         source: 'Prefix',        label: 'Prefix',
          idTemplate: 'contact-prefixes-0',                type: 'mat-select',
          skipIfLexisNexisLocked: true },
        { key: 'firstName',      source: 'FirstName',     label: 'First Name',
          idTemplate: 'contact-first-name-0',              type: 'text',
          skipIfLexisNexisLocked: true },
        { key: 'middleName',     source: 'MiddleName',    label: 'Middle Name',
          idTemplate: 'contact-middle-name-0',             type: 'text',
          skipIfLexisNexisLocked: true },
        { key: 'lastName',       source: 'LastName',      label: 'Last Name',
          idTemplate: 'contact-last-name-0',               type: 'text',
          skipIfLexisNexisLocked: true },
        { key: 'suffix',         source: 'Suffix',        label: 'Suffix',
          idTemplate: 'contact-suffix-0',                  type: 'mat-select',
          skipIfLexisNexisLocked: true },
        { key: 'gender',         source: 'Gender',        label: 'Gender',
          idTemplate: 'contact-gender-0',                  type: 'mat-select',
          skipIfLexisNexisLocked: true },
        { key: 'dateOfBirth',    source: 'DOB',           label: 'Date of Birth',
          idTemplate: 'contact-date-of-birth-0',           type: 'date',
          skipIfLexisNexisLocked: true },
        { key: 'maritalStatus',  source: 'MaritalStatus', label: 'Marital Status',
          idTemplate: 'contact-marital-statuses-0',        type: 'mat-select',
          skipIfLexisNexisLocked: true },
        { key: 'ssn',            source: 'SSN',           label: 'Social Security Number',
          idTemplate: 'contact-social-security-number-0',  type: 'ssn',
          skipIfLexisNexisLocked: true },
        { key: 'maidenName',     source: 'MaidenName',    label: 'Maiden Name',
          idTemplate: 'contact-maiden-name-0',             type: 'text',
          skipIfLexisNexisLocked: true },
        { key: 'nickname',       source: 'Nickname',      label: 'Nickname',
          idTemplate: 'contact-nickname-0',                type: 'text' },
        { key: 'relationship',   source: 'Relationship',  label: 'Relationship',
          idTemplate: 'contact-relationships-0',           type: 'mat-select' },
        { key: 'dlNumber',       source: 'LicenseNumber', label: "Driver's License Number",
          idTemplate: 'contact-drivers-license-number-0',  type: 'text',
          skipIfLexisNexisLocked: true },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // DL & Work (5 atoms)
    // Occupation has a precondition on industry; occupationYears on occupation.
    // Note: dlState has a typo in real DOM: 'contactdrivers-license-state-0'
    //       (missing hyphen between contact and drivers)
    // ─────────────────────────────────────────────────────────────────────────
    const DL_WORK = [
        { key: 'dlStatus',          source: 'LicenseStatus',    label: 'DL Status',
          idTemplate: 'contact-drivers-license-status-0',        type: 'mat-select' },
        { key: 'dlState',           source: 'DLState',          label: 'DL State',
          idTemplate: 'contactdrivers-license-state-0',          type: 'mat-select' },
        { key: 'industry',          source: 'Industry',         label: 'Industry',
          idTemplate: 'contact-industry-0',                      type: 'mat-select' },
        { key: 'occupation',        source: 'Occupation',       label: 'Occupation',
          idTemplate: 'contact-occupation-0',                    type: 'mat-select',
          preconditions: [{ atom: 'industry', state: 'DONE' }] },
        { key: 'occupationYears',   source: 'OccupationYears',  label: 'Years at Occupation',
          idTemplate: 'contact-occupation-years-0',              type: 'text',
          preconditions: [{ atom: 'occupation', state: 'DONE' }] },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // Address (11 atoms)
    // address1 has a postFill dismissPacContainer to kill the Places overlay
    // before city/state/county fill.
    // county has a precondition on addressState.
    // ─────────────────────────────────────────────────────────────────────────
    const ADDRESS = [
        { key: 'address1',        source: 'Address',      label: 'Address Line 1',
          idTemplate: 'contact-address-0-address1',        type: 'text',
          postFill: [{ action: 'dismissPacContainer' }] },
        { key: 'addressUnit',     source: 'AddressUnit',  label: 'Unit / Apt',
          idTemplate: 'contact-address-0-addressUnit',     type: 'text' },
        { key: 'address2',        source: 'Address2',     label: 'Address Line 2',
          idTemplate: 'contact-address-0-address2',        type: 'text' },
        { key: 'city',            source: 'City',         label: 'City',
          idTemplate: 'contact-address-0-addressCity',     type: 'text' },
        { key: 'addressState',    source: 'State',        label: 'Address State',
          idTemplate: 'contact-address-0-addressState',    type: 'mat-select' },
        { key: 'county',          source: 'County',       label: 'County',
          idTemplate: 'contact-address-0-addressCounty',   type: 'mat-select',
          preconditions: [{ atom: 'addressState', state: 'DONE' }] },
        { key: 'postalCode',      source: 'Zip',          label: 'Postal Code',
          idTemplate: 'contact-address-0-postalCode',      type: 'text' },
        { key: 'postalCodeSuffix', source: 'ZipSuffix',   label: 'Postal Code Suffix',
          idTemplate: 'contact-address-0-postalCodeSuffix', type: 'text' },
        { key: 'yearsAtAddress',  source: 'YearsAtAddress', label: 'Years at Address',
          idTemplate: 'contact-address-0-yearsAtAddress',  type: 'mat-select' },
        { key: 'monthsAtAddress', source: 'MonthsAtAddress', label: 'Months at Address',
          idTemplate: 'contact-address-0-monthsAtAddress', type: 'mat-select' },
        { key: 'country',         source: 'Country',      label: 'Country',
          idTemplate: 'contact-address-0-country',         type: 'text' },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // Contact (4 atoms)
    // ─────────────────────────────────────────────────────────────────────────
    const CONTACT = [
        { key: 'phoneType',     source: 'PhoneType',     label: 'Phone Type',
          idTemplate: 'Mobile_PhoneType-type',            type: 'mat-select' },
        { key: 'phone',         source: 'Phone',         label: 'Phone Number',
          idTemplate: 'Mobile_PhoneType-applicant-phone-0-additional-number', type: 'phone' },
        { key: 'emailType',     source: 'EmailType',     label: 'Email Type',
          idTemplate: 'contact-0-email-0-type',           type: 'mat-select' },
        { key: 'email',         source: 'Email',         label: 'Email',
          idTemplate: 'contact-0-email-0-email-address',  type: 'text' },
    ];

    const applicantAtoms = [
        ...PERSONAL,
        ...DL_WORK,
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
