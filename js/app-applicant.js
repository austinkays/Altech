// js/app-applicant.js — Primary applicant + co-applicant UI + driver-card sync.
// Extracted from app-core.js during Phase 3 monolith decomposition (2026-04).
'use strict';

Object.assign(App, {
    updatePrimaryHomeSection(val) {
        const section = document.getElementById('primaryHomeSection');
        if (!section) return;
        section.classList.toggle('hidden', !val || val === 'Primary');
    },

    toggleCoApplicant() {
        const cb = document.getElementById('hasCoApplicant');
        const section = document.getElementById('coApplicantSection');
        if (!cb || !section) return;
        const show = cb.checked;
        section.classList.toggle('visible', show);
        this.data.hasCoApplicant = show ? 'yes' : '';

        // When unchecking, clear every co-applicant field so stale values don't
        // leak into exports (EzLynx/HawkSoft don't gate on hasCoApplicant).
        if (!show && window.FIELDS) {
            window.FIELDS
                .filter(f => f.section === 'coapplicant')
                .forEach(f => {
                    const el = document.getElementById(f.id);
                    if (el) { el.value = ''; if (el.type === 'checkbox') el.checked = false; }
                    this.data[f.id] = '';
                });
        }
        this.save({});

        // Sync co-applicant as Driver 2 for auto/both quotes
        const qType = (document.querySelector('input[name="qType"]:checked') || {}).value || 'both';
        const isAuto = qType === 'auto' || qType === 'both';
        if (isAuto) {
            if (show) {
                this.syncCoApplicantToDriver();
            } else {
                // Remove synced driver
                this.drivers = this.drivers.filter(d => !d.isCoApplicant);
                this.renderDrivers();
                this.renderVehicles();
                this.saveDriversVehicles();
            }
        }
    },

    /**
     * Syncs primary applicant (Step 1) form data to a paired driver entry.
     * Locks Name, DOB, Gender, Marital Status — other fields stay editable.
     * Mirrors the co-applicant sync pattern but uses isPrimaryApplicant flag.
     */
    // Maps Step 1 education values (verbose) to the shorter driver-card select values.
    _mapEducationToDriverCard(val) {
        const map = {
            'No High School Diploma': 'No High School',
            'High School Diploma':    'High School',
            'Some College - No Degree': 'Some College',
            'Vocational/Technical Degree': 'Some College',
            'Associates Degree': 'Associates',
            'Phd':            'Doctorate',
            'Medical Degree': 'Doctorate',
            'Law Degree':     'Doctorate',
        };
        return map[val] || val;  // 'Bachelors' / 'Masters' pass through unchanged
    },

    syncPrimaryApplicantToDriver() {
        const first = (this.data.firstName || '').trim();
        const last = (this.data.lastName || '').trim();
        const dob = (this.data.dob || '').trim();
        const gender = (this.data.gender || '').trim();
        const marital = (this.data.maritalStatus || '').trim();
        const education = (this.data.education || '').trim();
        const industry = (this.data.industry || '').trim();

        // Find existing synced driver or create one
        let synced = this.drivers.find(d => d.isPrimaryApplicant);
        if (!synced) {
            synced = {
                id: `primary_${Date.now()}`,
                firstName: '',
                lastName: '',
                dob: '',
                dlNum: '',
                dlState: 'WA',
                relationship: 'Self',
                isPrimaryApplicant: true,
                isCoApplicant: false
            };
            this.drivers.unshift(synced); // Always first
        }

        // Overwrite locked fields from Step 1
        synced.firstName = first;
        synced.lastName = last;
        synced.dob = dob;
        synced.gender = gender;
        synced.maritalStatus = marital;
        synced.education = this._mapEducationToDriverCard(education);
        synced.occupation = industry;  // industry category → driver's "Occupation Industry" dropdown
        synced.industry = industry;
    },

    /**
     * Attaches change/blur listeners on Step 1 applicant fields so edits
     * auto-sync into the paired driver entry. Idempotent (dataset guard).
     */
    restorePrimaryApplicantUI() {
        const syncFields = ['firstName', 'lastName', 'dob', 'gender', 'maritalStatus', 'education', 'occupation', 'industry'];
        syncFields.forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if (el && !el.dataset.primarySyncBound) {
                el.dataset.primarySyncBound = '1';
                const handler = () => {
                    this.syncPrimaryApplicantToDriver();
                    this.renderDrivers();
                    this.renderVehicles();
                    this.saveDriversVehicles();
                };
                el.addEventListener('change', handler);
                if (el.tagName === 'INPUT') {
                    el.addEventListener('blur', handler);
                }
            }
        });
    },

    /**
     * Syncs co-applicant form data to a paired driver entry.
     * Locks Name, DOB, Gender, Relationship, MaritalStatus, Occupation (Industry), Education.
     * @param {object} [options]
     * @param {boolean} [options.skipRender=false] Skip renderDrivers/Vehicles calls (used when
     *   the caller will render immediately after, e.g. updateUI step-4 block).
     */
    syncCoApplicantToDriver(options = {}) {
        const coFirst = (this.data.coFirstName || '').trim();
        const coLast = (this.data.coLastName || '').trim();
        const coDob = (this.data.coDob || '').trim();
        const coGender = (this.data.coGender || '').trim();
        const coRelationship = (this.data.coRelationship || 'Spouse').trim();

        // Find existing synced driver or create one
        let synced = this.drivers.find(d => d.isCoApplicant);
        if (!synced) {
            synced = {
                id: `coapp_${Date.now()}`,
                firstName: '',
                lastName: '',
                dob: '',
                dlNum: '',
                dlState: 'WA',
                relationship: 'Spouse',
                isCoApplicant: true
            };
            this.drivers.push(synced);
        }

        // Only overwrite locked fields (Name, DOB, Gender, Relationship)
        synced.firstName = coFirst;
        synced.lastName = coLast;
        synced.dob = coDob;
        synced.gender = coGender;
        synced.relationship = coRelationship === 'Domestic Partner' ? 'Spouse' : (coRelationship || 'Spouse');

        const coMarital = (this.data.coMaritalStatus || '').trim();
        const coEducation = (this.data.coEducation || '').trim();
        const coIndustry = (this.data.coIndustry || '').trim();
        // Only overwrite when Step 1 has a value — don't wipe existing driver card data with empty.
        // Fields are locked in LOCKED_FIELDS so user cannot manually override via driver card UI.
        if (coMarital) synced.maritalStatus = coMarital;
        if (coEducation) synced.education = this._mapEducationToDriverCard(coEducation);
        if (coIndustry) {
            synced.occupation = coIndustry;  // industry category → driver's "Occupation Industry" dropdown
            synced.industry = coIndustry;
        }

        const { skipRender = false } = options;
        if (!skipRender) {
            this.renderDrivers();
            this.renderVehicles();
            this.saveDriversVehicles();
        }
    },

    restoreCoApplicantUI() {
        const cb = document.getElementById('hasCoApplicant');
        const section = document.getElementById('coApplicantSection');
        if (!cb || !section) return;
        const show = this.data.hasCoApplicant === 'yes';
        cb.checked = show;
        section.classList.toggle('visible', show);

        // Attach co-applicant → driver sync listeners (idempotent)
        const syncFields = ['coFirstName', 'coLastName', 'coDob', 'coGender', 'coRelationship',
                    'coMaritalStatus', 'coEducation', 'coOccupation', 'coIndustry'];
        syncFields.forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if (el && !el.dataset.coSyncBound) {
                el.dataset.coSyncBound = '1';
                el.addEventListener('change', () => {
                    if (this.data.hasCoApplicant === 'yes') {
                        this.syncCoApplicantToDriver();
                    }
                });
                if (el.tagName === 'INPUT') {
                    el.addEventListener('blur', () => {
                        if (this.data.hasCoApplicant === 'yes') {
                            this.syncCoApplicantToDriver();
                        }
                    });
                }
            }
        });

        // If already enabled and has auto workflow, ensure synced driver exists
        if (show) {
            const qType = (document.querySelector('input[name="qType"]:checked') || {}).value || 'both';
            if (qType === 'auto' || qType === 'both') {
                const hasSynced = this.drivers && this.drivers.some(d => d.isCoApplicant);
                if (!hasSynced) this.syncCoApplicantToDriver();
            }
        }
    },
});
