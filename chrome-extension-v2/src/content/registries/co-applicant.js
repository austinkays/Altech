/**
 * Altech EZLynx V2 — Co-applicant registry (~16 atoms)
 *
 * The co-applicant lives on the same /create/personal route as the primary
 * applicant. Primary applicant uses index 0, co-applicant uses index 1+.
 *
 * All atoms use:
 *   scope: 'coApplicant'   → scoped inside the co-applicant section
 *   {entityId} in idTemplate → resolved at LOCATE time (typically "1")
 *   source path 'CoApplicant.X' → dot-notation into clientData.CoApplicant
 *
 * ID patterns grounded in live registry-audit of 2026-04-12 (primary applicant
 * at index 0 observed, co-applicant pattern inferred for index 1+).
 * Marked _needsRecon where co-applicant pattern hasn't been verified live.
 */
(function (global) {
    'use strict';

    const coApplicantAtoms = [
        // ── Personal ────────────────────────────────────────────────────────
        { key: 'coRelationship',   source: 'CoApplicant.Relationship', label: 'Co-App Relationship',
          idTemplate: 'contact-relationships-{entityId}',              type: 'mat-select',
          scope: 'coApplicant', _needsRecon: true },
        { key: 'coPrefix',         source: 'CoApplicant.Prefix',       label: 'Co-App Prefix',
          idTemplate: 'contact-prefixes-{entityId}',                    type: 'mat-select',
          scope: 'coApplicant', skipIfLexisNexisLocked: true, _needsRecon: true },
        { key: 'coFirstName',      source: 'CoApplicant.FirstName',    label: 'Co-App First Name',
          idTemplate: 'contact-first-name-{entityId}',                  type: 'text',
          scope: 'coApplicant', skipIfLexisNexisLocked: true, _needsRecon: true },
        { key: 'coMiddleName',     source: 'CoApplicant.MiddleName',   label: 'Co-App Middle Name',
          idTemplate: 'contact-middle-name-{entityId}',                 type: 'text',
          scope: 'coApplicant', _needsRecon: true },
        { key: 'coLastName',       source: 'CoApplicant.LastName',     label: 'Co-App Last Name',
          idTemplate: 'contact-last-name-{entityId}',                   type: 'text',
          scope: 'coApplicant', skipIfLexisNexisLocked: true, _needsRecon: true },
        { key: 'coSuffix',         source: 'CoApplicant.Suffix',       label: 'Co-App Suffix',
          idTemplate: 'contact-suffix-{entityId}',                      type: 'mat-select',
          scope: 'coApplicant', _needsRecon: true },
        { key: 'coDateOfBirth',    source: 'CoApplicant.DOB',          label: 'Co-App Date of Birth',
          idTemplate: 'contact-date-of-birth-{entityId}',               type: 'date',
          scope: 'coApplicant', skipIfLexisNexisLocked: true, _needsRecon: true },
        { key: 'coGender',         source: 'CoApplicant.Gender',       label: 'Co-App Gender',
          idTemplate: 'contact-gender-{entityId}',                      type: 'mat-select',
          scope: 'coApplicant', skipIfLexisNexisLocked: true, _needsRecon: true },
        { key: 'coMaritalStatus',  source: 'CoApplicant.MaritalStatus', label: 'Co-App Marital Status',
          idTemplate: 'contact-marital-statuses-{entityId}',            type: 'mat-select',
          scope: 'coApplicant', _needsRecon: true },
        { key: 'coSsn',            source: 'CoApplicant.SSN',          label: 'Co-App SSN',
          idTemplate: 'contact-social-security-number-{entityId}',      type: 'ssn',
          scope: 'coApplicant', skipIfLexisNexisLocked: true, _needsRecon: true },

        // ── Driver's License ────────────────────────────────────────────────
        { key: 'coDlNumber',       source: 'CoApplicant.DLNumber',     label: 'Co-App DL Number',
          idTemplate: 'contact-drivers-license-number-{entityId}',      type: 'text',
          scope: 'coApplicant', skipIfLexisNexisLocked: true, _needsRecon: true },
        { key: 'coDlState',        source: 'CoApplicant.DLState',      label: 'Co-App DL State',
          idTemplate: 'contactdrivers-license-state-{entityId}',        type: 'mat-select',
          scope: 'coApplicant', _needsRecon: true },

        // ── Employment ──────────────────────────────────────────────────────
        { key: 'coIndustry',       source: 'CoApplicant.Industry',     label: 'Co-App Industry',
          idTemplate: 'contact-industry-{entityId}',                    type: 'mat-select',
          scope: 'coApplicant', _needsRecon: true },
        { key: 'coOccupation',     source: 'CoApplicant.Occupation',   label: 'Co-App Occupation',
          idTemplate: 'contact-occupation-{entityId}',                  type: 'mat-select',
          scope: 'coApplicant', _needsRecon: true,
          preconditions: [{ atom: 'coIndustry', state: 'DONE' }] },

        // ── Contact ─────────────────────────────────────────────────────────
        { key: 'coEmail',          source: 'CoApplicant.Email',        label: 'Co-App Email',
          idTemplate: 'contact-{entityId}-email-0-email-address',       type: 'text',
          scope: 'coApplicant', _needsRecon: true },
        { key: 'coPhone',          source: 'CoApplicant.Phone',        label: 'Co-App Phone',
          idTemplate: 'Mobile_PhoneType-applicant-phone-{entityId}-additional-number', type: 'phone',
          scope: 'coApplicant', _needsRecon: true },
    ];

    const api = { coApplicantAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.coApplicantAtoms = coApplicantAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
