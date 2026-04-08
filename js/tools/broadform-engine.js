/**
 * broadform-engine.js
 * Matching engine for the Carrier Recommendation Engine.
 * Compares a ClientProfile against carrier rules to determine eligibility.
 *
 * PURE LOGIC — no DOM access, no AI calls, no side effects.
 *
 * Depends on: window.BroadformData (js/tools/broadform-data.js)
 * Exposes:    window.BroadformEngine
 */
window.BroadformEngine = (() => {
    'use strict';

    /**
     * Evaluate a client profile against all carriers for a given line of business.
     *
     * @param {Object}      profile - Partial ClientProfile (null values = unknown)
     * @param {string}      lob     - Line of business: 'home'|'auto'|'broadform'|'nonowners'
     * @returns {{
     *   eligible:      Array<{key,name,status:'ready',note}>,
     *   pending:       Array<{key,name,status:'pending',missingFields:string[],note}>,
     *   disqualified:  Array<{key,name,status:'disqualified',reasons:string[],note}>,
     *   referOut:      Array<{key,name,status:'referOut',note}>,
     *   missingFields: Array<{id,label,type,...}>
     * }}
     */
    function evaluate(profile, lob) {
        const data = window.BroadformData;
        if (!data) return _emptyResult();

        const state = profile.state || null;
        const result = {
            eligible:     [],
            pending:      [],
            disqualified: [],
            referOut:     [],
            missingFields: [],
        };

        const allMissingFieldIds = new Set();

        for (const carrier of data.carriers) {
            const lineData = carrier.lines[lob];
            if (!lineData) continue; // carrier doesn't offer this LOB

            // ── State check ──────────────────────────────────────────────
            if (state) {
                // Check referOut first
                if (lineData.referOut && lineData.referOut[state]) {
                    result.referOut.push({
                        key: carrier.key, name: carrier.name,
                        status: 'referOut', note: lineData.referOut[state],
                    });
                    continue;
                }
                if (!lineData.states.includes(state)) continue; // not offered in this state
            } else {
                // State unknown — carrier is pending, state is missing
                allMissingFieldIds.add('state');
            }

            // ── Rule evaluation ──────────────────────────────────────────
            const reasons = [];
            const missing = [];
            let disqualified = false;

            for (const rule of lineData.rules || []) {
                const val = profile[rule.field];

                if (val === null || val === undefined || val === '') {
                    // Field missing — track it but don't disqualify
                    missing.push(rule.field);
                    allMissingFieldIds.add(rule.field);
                    continue;
                }

                // Evaluate rule
                const op = data.operators[rule.op];
                if (!op) continue;

                if (!op(val, rule.value)) {
                    // Rule failed — carrier disqualified
                    disqualified = true;
                    reasons.push(rule.reason || ('Failed: ' + rule.field + ' ' + rule.op + ' ' + rule.value));
                }
            }

            if (disqualified) {
                result.disqualified.push({
                    key: carrier.key, name: carrier.name,
                    status: 'disqualified', reasons,
                    note: lineData.note || null,
                });
            } else if (missing.length > 0 || !state) {
                result.pending.push({
                    key: carrier.key, name: carrier.name,
                    status: 'pending', missingFields: missing,
                    note: lineData.note || null,
                });
            } else {
                result.eligible.push({
                    key: carrier.key, name: carrier.name,
                    status: 'ready',
                    note: lineData.note || null,
                });
            }
        }

        // ── Build missing fields list from variable metadata ─────────
        result.missingFields = Array.from(allMissingFieldIds)
            .map(id => data.variableById[id])
            .filter(v => v && v.appliesTo.includes(lob));

        return result;
    }

    /**
     * Build a partial ClientProfile from App.data, App.drivers, App.vehicles.
     * Returns only fields that have non-empty values. Nulls for unknowns.
     */
    function buildProfileFromAppData() {
        const app = window.App;
        if (!app || !app.data) return {};

        const d = app.data;
        const profile = {};
        const currentYear = new Date().getFullYear();

        // ── Direct mappings ──────────────────────────────────────────
        if (d.addrState) profile.state = d.addrState;

        // Roof age: current year minus roof year
        if (d.roofYr) {
            const yr = parseInt(d.roofYr, 10);
            if (!isNaN(yr) && yr > 1900) profile.roofAge = currentYear - yr;
        }
        if (d.roofType) profile.roofType = d.roofType;
        if (d.yrBuilt) {
            const yr = parseInt(d.yrBuilt, 10);
            if (!isNaN(yr)) profile.yearBuilt = yr;
        }
        if (d.dwellingType) profile.dwellingType = d.dwellingType;

        // Boolean mappings from yes/no strings
        if (d.pool) profile.hasPool = _yesNoToBool(d.pool);
        if (d.trampoline) profile.hasTrampoline = _yesNoToBool(d.trampoline);
        if (d.woodStove) profile.hasWoodStove = _yesNoToBool(d.woodStove);

        if (d.dogInfo) profile.dogBreed = d.dogInfo;
        if (d.protectionClass) {
            const pc = parseInt(d.protectionClass, 10);
            if (!isNaN(pc)) profile.protectionClass = pc;
        }

        // Prior insurance
        if (d.homePriorCarrier) profile.priorInsurance = true;
        else if (d.priorCarrier) profile.priorInsurance = true;

        // Prior years
        if (d.priorYears) {
            const py = parseInt(d.priorYears, 10);
            if (!isNaN(py)) profile.priorYears = py;
        }

        // ── Vehicle data ─────────────────────────────────────────────
        if (Array.isArray(app.vehicles) && app.vehicles.length > 0) {
            let oldestAge = 0;
            for (const v of app.vehicles) {
                const yr = parseInt(v.year, 10);
                if (!isNaN(yr) && yr > 1900) {
                    const age = currentYear - yr;
                    if (age > oldestAge) oldestAge = age;
                }
            }
            if (oldestAge > 0) profile.vehicleAge = oldestAge;
        }

        // ── Driver data ──────────────────────────────────────────────
        if (Array.isArray(app.drivers) && app.drivers.length > 0) {
            let youngest = Infinity;
            for (const drv of app.drivers) {
                if (drv.dob) {
                    const dob = new Date(drv.dob);
                    if (!isNaN(dob.getTime())) {
                        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                        if (age > 0 && age < youngest) youngest = age;
                    }
                }
            }
            if (youngest < Infinity) profile.driverAge = youngest;
        }

        return profile;
    }

    /**
     * Merge extracted data into existing profile.
     * New values fill nulls/undefined only — user-corrected values are preserved.
     */
    function mergeProfile(existing, newData) {
        const merged = Object.assign({}, existing);
        for (const [key, val] of Object.entries(newData)) {
            if (val === null || val === undefined || val === '') continue;
            if (merged[key] === null || merged[key] === undefined || merged[key] === '') {
                merged[key] = val;
            }
        }
        return merged;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _yesNoToBool(val) {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
            const lower = val.toLowerCase().trim();
            if (lower === 'yes' || lower === 'true' || lower === '1') return true;
            if (lower === 'no' || lower === 'false' || lower === '0' || lower === 'none') return false;
        }
        return null;
    }

    function _emptyResult() {
        return { eligible: [], pending: [], disqualified: [], referOut: [], missingFields: [] };
    }

    return { evaluate, buildProfileFromAppData, mergeProfile };
})();
