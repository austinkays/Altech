/**
 * Altech EZLynx V2 — PII Redactor
 *
 * Replaces sensitive field values with "[REDACTED]" based on the atom's
 * source key. Used by Issue Capture and Dry Run so reports are safe to
 * share in conversations without exposing client data.
 *
 * Source keys that match PII_PATTERN are always redacted regardless of
 * how they appear in dot-notation (e.g. "CoApplicant.SSN" also redacts).
 */
(function (global) {
    'use strict';

    // Match the leaf key name — handles both "SSN" and "CoApplicant.SSN".
    const PII_PATTERN = /\b(SSN|DOB|DLNumber|Phone|Email|MaidenName)\b/i;

    /**
     * @param {string} sourceKey   Atom's source path (e.g. 'SSN', 'CoApplicant.SSN')
     * @param {*}      value       Raw value to potentially redact
     * @returns {*}                '[REDACTED]' if PII, otherwise the original value
     */
    function redactIfPii(sourceKey, value) {
        if (!sourceKey) return value;
        if (PII_PATTERN.test(sourceKey)) return '[REDACTED]';
        return value;
    }

    /**
     * Returns true if the source key matches the PII pattern.
     * @param {string} sourceKey
     * @returns {boolean}
     */
    function isPii(sourceKey) {
        if (!sourceKey) return false;
        return PII_PATTERN.test(sourceKey);
    }

    const api = { redactIfPii, isPii };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        global.AltechV2.recon.piiRedactor = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
