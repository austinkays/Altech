/**
 * Altech EZLynx V2 — Co-applicant registry (~16 atoms)
 *
 * The co-applicant lives on the same /details route as the primary applicant,
 * inside an inline mat-expansion-panel. The panel is revealed after entity ID
 * discovery (special-cases/entity-id-discovery.js) clicks "Add contact" and
 * detects the new entityId from the resulting DOM change.
 *
 * All atoms use:
 *   scope: 'coApplicant'   → scoped inside the mat-expansion-panel
 *   {entityId} in idTemplate → resolved by find-by-id.js at LOCATE time
 *   source path 'CoApplicant.X' → dot-notation into clientData.CoApplicant
 *
 * Plan §6.5 + §7.6.
 */
(function (global) {
    'use strict';

    const coApplicantAtoms = [
        // ── Personal ────────────────────────────────────────────────────────
        { key: 'coPrefix',         source: 'CoApplicant.Prefix',       label: 'Co-App Prefix',
          idTemplate: 'contact-prefix-{entityId}',                      type: 'mat-select',
          scope: 'coApplicant', skipIfLexisNexisLocked: true },
        { key: 'coFirstName',      source: 'CoApplicant.FirstName',    label: 'Co-App First Name',
          idTemplate: 'contact-first-name-{entityId}',                  type: 'text',
          scope: 'coApplicant', skipIfLexisNexisLocked: true },
        { key: 'coMiddleName',     source: 'CoApplicant.MiddleName',   label: 'Co-App Middle Name',
          idTemplate: 'contact-middle-name-{entityId}',                 type: 'text',
          scope: 'coApplicant' },
        { key: 'coLastName',       source: 'CoApplicant.LastName',     label: 'Co-App Last Name',
          idTemplate: 'contact-last-name-{entityId}',                   type: 'text',
          scope: 'coApplicant', skipIfLexisNexisLocked: true },
        { key: 'coSuffix',         source: 'CoApplicant.Suffix',       label: 'Co-App Suffix',
          idTemplate: 'contact-suffix-{entityId}',                      type: 'mat-select',
          scope: 'coApplicant' },
        { key: 'coDateOfBirth',    source: 'CoApplicant.DOB',          label: 'Co-App Date of Birth',
          idTemplate: 'contact-date-of-birth-{entityId}',               type: 'date',
          scope: 'coApplicant', skipIfLexisNexisLocked: true },
        { key: 'coGender',         source: 'CoApplicant.Gender',       label: 'Co-App Gender',
          idTemplate: 'contact-gender-{entityId}',                      type: 'mat-select',
          scope: 'coApplicant', skipIfLexisNexisLocked: true },
        { key: 'coMaritalStatus',  source: 'CoApplicant.MaritalStatus', label: 'Co-App Marital Status',
          idTemplate: 'contact-marital-status-{entityId}',              type: 'mat-select',
          scope: 'coApplicant' },
        { key: 'coRelationship',   source: 'CoApplicant.Relationship', label: 'Co-App Relationship',
          idTemplate: 'contact-relationship-{entityId}',                type: 'mat-select',
          scope: 'coApplicant' },
        { key: 'coSsn',            source: 'CoApplicant.SSN',          label: 'Co-App SSN',
          idTemplate: 'contact-social-security-number-{entityId}',      type: 'ssn',
          scope: 'coApplicant', skipIfLexisNexisLocked: true },

        // ── Driver's License ────────────────────────────────────────────────
        { key: 'coDlNumber',       source: 'CoApplicant.DLNumber',     label: 'Co-App DL Number',
          idTemplate: 'contact-drivers-license-number-{entityId}',      type: 'text',
          scope: 'coApplicant', skipIfLexisNexisLocked: true },
        { key: 'coDlState',        source: 'CoApplicant.DLState',      label: 'Co-App DL State',
          idTemplate: 'contact-drivers-license-state-{entityId}',       type: 'mat-select',
          scope: 'coApplicant' },

        // ── Employment ──────────────────────────────────────────────────────
        { key: 'coIndustry',       source: 'CoApplicant.Industry',     label: 'Co-App Industry',
          idTemplate: 'contact-industry-{entityId}',                    type: 'mat-select',
          scope: 'coApplicant' },
        { key: 'coOccupation',     source: 'CoApplicant.Occupation',   label: 'Co-App Occupation',
          idTemplate: 'contact-occupation-{entityId}',                  type: 'mat-select',
          scope: 'coApplicant',
          preconditions: [{ atom: 'coIndustry', state: 'DONE' }] },

        // ── Contact ─────────────────────────────────────────────────────────
        { key: 'coEmail',          source: 'CoApplicant.Email',        label: 'Co-App Email',
          idTemplate: 'contact-email-address-{entityId}',               type: 'text',
          scope: 'coApplicant' },
        { key: 'coPhone',          source: 'CoApplicant.Phone',        label: 'Co-App Phone',
          idTemplate: 'contact-phone-number-{entityId}',                type: 'phone',
          scope: 'coApplicant' },
    ];

    const api = { coApplicantAtoms };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.registries = global.AltechV2.registries || {};
        global.AltechV2.registries.coApplicantAtoms = coApplicantAtoms;
    }
})(typeof window !== 'undefined' ? window : globalThis);
