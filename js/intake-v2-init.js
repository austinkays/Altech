// intake-v2-init.js — IntakeV2 namespace bootstrap.
//
// Creates window.IntakeV2 with default state and feature-detected dependencies.
// Subsequent js/intake-v2-*.js files extend this object via Object.assign().
// MUST load before every other intake-v2-*.js script.
//
// The v2 intake is a single-page workspace (not a wizard). It lives alongside
// the legacy `quoting` tool during rollout — never extends window.App, never
// mutates App.data. Storage and cloud sync are isolated under STORAGE_KEYS.INTAKE_V2.
//
// See plan: /root/.claude/plans/the-current-personal-intake-peppy-rossum.md

'use strict';

(function () {
    if (window.IntakeV2) return; // idempotent — re-loading won't clobber state

    const SCHEMA_VERSION = 1;

    function defaultData() {
        return {
            _schemaVersion: SCHEMA_VERSION,
            meta: {
                quoteId: null,
                createdAt: null,
                updatedAt: null,
                mode: 'quick',
                sourceQuoteId: null,
                importedFromLegacy: false,
            },
            applicant: {
                prefix: '', firstName: '', middleName: '', lastName: '', suffix: '',
                dob: '', ssn: '', gender: '', maritalStatus: '',
                phone: '', email: '',
                education: '', industry: '', occupation: '',
                employerName: '', yearsEmployed: '',
            },
            coApplicant: {
                present: false, relationship: '',
                prefix: '', firstName: '', middleName: '', lastName: '', suffix: '',
                dob: '', ssn: '', gender: '', maritalStatus: '',
                phone: '', email: '',
                education: '', industry: '', occupation: '',
                employerName: '', yearsEmployed: '',
            },
            address: {
                street: '', city: '', state: '', zip: '', county: '', yearsAt: '',
                previous: { street: '', city: '', state: '', zip: '' },
                primaryHome: { street: '', city: '', state: '', zip: '' },
            },
            household: {
                tcpaConsent: false, creditCheckAuth: false,
                contactMethod: '', contactTime: '',
                referralSource: '',
                homeownership: '', // 'own' | 'rent' | 'condo' | 'mh'
            },
            operators: [],   // unified household pool
            homes: [],
            autos: [],
            boats: [],
            rvs: [],
            priorInsurance: {
                home: { carrier: '', exp: '', years: '', months: '', limits: '' },
                auto: { carrier: '', exp: '', years: '', months: '', limits: '' },
                boat: { carrier: '', exp: '', years: '', months: '', limits: '' },
                rv:   { carrier: '', exp: '', years: '', months: '', limits: '' },
                continuous: '', continuousMonths: '',
                lapses: [],
            },
            history: {
                hasCleanHistory: false,
                losses: [],     // [{ date, type, amount, operatorId, asset }]
                violations: [], // [{ date, type, operatorId }]
            },
            discounts: {
                homeowner: false,
                safetyCourse: { auto: false, boat: false, rv: false },
                affinity:     { usaa: false, hog: false, uscgAux: false, usps: false },
            },
            notes: { freeText: '', agencyTags: [] },
            deferred: [], // string paths the agent marked "ask later"
        };
    }

    window.IntakeV2 = {
        SCHEMA_VERSION,
        STORAGE_KEY:  window.STORAGE_KEYS && window.STORAGE_KEYS.INTAKE_V2,
        QUOTES_KEY:   window.STORAGE_KEYS && window.STORAGE_KEYS.INTAKE_V2_QUOTES,
        DEFAULTS_KEY: window.STORAGE_KEYS && window.STORAGE_KEYS.AGENCY_DEFAULTS,
        MODE_KEY:     window.STORAGE_KEYS && window.STORAGE_KEYS.INTAKE_V2_MODE,
        RAILS_KEY:    window.STORAGE_KEYS && window.STORAGE_KEYS.INTAKE_V2_RAILS,

        data: defaultData(),
        mode: 'quick',        // 'quick' | 'full' — toggle in top bar
        rails: 'expanded',    // 'expanded' | 'collapsed' — workspace chrome
        bindability: null,    // last computed { progressive: {ok,missing}, foremost, travelers, safeco }
        lastEntries: [],      // ring buffer (cap 5) of recent field writes for the peek strip

        _container: null,
        _ready: false,
        _initStarted: false,
        _saveTimeout: null,
        _saveToken: 0,
        _lastSaveOk: true,
        _agencyDefaults: null,

        defaultData,

        // Called by App.navigateTo() once plugins/intake-v2.html is injected.
        init() {
            if (this._initStarted) return;
            this._initStarted = true;
            this._container = document.getElementById('intakeV2Tool');
            if (!this._container) {
                // eslint-disable-next-line no-console
                console.warn('IntakeV2.init: #intakeV2Tool container missing');
                return;
            }
            // Each module attaches its own bring-up via _bootHooks. Modules push
            // a function here when they load (intake-v2-core, intake-v2-layout, etc.),
            // and we run them in order once the plugin HTML is injected.
            (this._bootHooks || []).forEach(fn => {
                try { fn.call(this); } catch (err) { console.error('IntakeV2 boot hook failed:', err); }
            });
            this._ready = true;
        },

        // Each module calls `IntakeV2.onBoot(fn)` from its top level to register
        // bring-up code that runs after the plugin HTML is in the DOM.
        onBoot(fn) {
            if (typeof fn !== 'function') return;
            (this._bootHooks = this._bootHooks || []).push(fn);
            if (this._ready) {
                try { fn.call(this); } catch (err) { console.error('IntakeV2 onBoot late call failed:', err); }
            }
        },

        // Returns true if v2 is the user's default intake tool. Currently the
        // tool is opt-in (beta badge); this helper exists so dashboard widgets
        // and CommandPalette can detect "is v2 active?" cleanly later.
        isEnabled() {
            try {
                return localStorage.getItem(window.STORAGE_KEYS.INTAKE_V2_ENABLED) === '1';
            } catch (_) { return false; }
        },
    };

    // Inherit Utils helpers without copying — every consumer goes through
    // IntakeV2.utils to keep imports tight.
    window.IntakeV2.utils = window.Utils || null;
})();
