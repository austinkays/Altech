/**
 * Altech EZLynx V2 — Abbreviation expansion
 *
 * Small curated list used to normalize clientData values before they are
 * matched against mat-select option text. Per the V2 plan (§14), this stays
 * small — anything else is caught by per-atom valueTransform in the registry.
 */
(function (global) {
    'use strict';

    const ABBREV_MAP = {
        // Gender
        'M': 'Male',
        'F': 'Female',
        // Marital status
        'S': 'Single',
        'D': 'Divorced',
        'W': 'Widowed',
        'SEP': 'Separated',
        // Education
        'HS': 'High School',
        'GED': 'GED',
        'ASSOC': 'Associate',
        'BS': 'Bachelor',
        'BA': 'Bachelor',
        'MS': 'Master',
        'MA': 'Master',
        'PHD': 'Doctorate',
        // DL status
        'VAL': 'Valid',
        'SUSP': 'Suspended',
        'REV': 'Revoked',
    };

    /**
     * Expand a raw value against the abbreviation map.
     * - Case-insensitive key match.
     * - Returns the expanded string if the raw value is an exact key match.
     * - Otherwise returns the raw value untouched.
     */
    function expand(raw) {
        if (raw == null) return raw;
        const s = String(raw).trim();
        if (!s) return s;
        const key = s.toUpperCase();
        if (Object.prototype.hasOwnProperty.call(ABBREV_MAP, key)) {
            return ABBREV_MAP[key];
        }
        return s;
    }

    const api = { ABBREV_MAP, expand };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.transforms = global.AltechV2.transforms || {};
        global.AltechV2.transforms.abbreviations = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
