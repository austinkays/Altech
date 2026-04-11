/**
 * Altech EZLynx V2 — PII Redactor tests
 */
'use strict';

const { redactIfPii, isPii } = require('../../src/content/recon/pii-redactor');

describe('redactIfPii', () => {
    // PII keys that must always be redacted
    const piiKeys = ['SSN', 'DOB', 'DLNumber', 'Phone', 'Email', 'MaidenName'];
    for (const key of piiKeys) {
        test(`redacts ${key}`, () => {
            expect(redactIfPii(key, 'any-value')).toBe('[REDACTED]');
        });
        test(`redacts dot-notation CoApplicant.${key}`, () => {
            expect(redactIfPii(`CoApplicant.${key}`, 'any-value')).toBe('[REDACTED]');
        });
    }

    // Case-insensitive
    test('redacts ssn (lowercase)', () => {
        expect(redactIfPii('ssn', '123-45-6789')).toBe('[REDACTED]');
    });
    test('redacts dob (lowercase)', () => {
        expect(redactIfPii('dob', '01/01/1990')).toBe('[REDACTED]');
    });

    // Non-PII keys should pass through unchanged
    const nonPiiKeys = ['FirstName', 'LastName', 'Address', 'City', 'State', 'Zip', 'Industry'];
    for (const key of nonPiiKeys) {
        test(`does NOT redact ${key}`, () => {
            expect(redactIfPii(key, 'Jane')).toBe('Jane');
        });
    }

    // Null/undefined source key
    test('returns value unchanged when sourceKey is null', () => {
        expect(redactIfPii(null, 'value')).toBe('value');
    });
    test('returns value unchanged when sourceKey is undefined', () => {
        expect(redactIfPii(undefined, 'value')).toBe('value');
    });

    // Null value
    test('returns null value as-is for non-PII key', () => {
        expect(redactIfPii('FirstName', null)).toBe(null);
    });
    test('returns [REDACTED] for PII key even when value is null', () => {
        expect(redactIfPii('SSN', null)).toBe('[REDACTED]');
    });
});

describe('isPii', () => {
    test('returns true for SSN', () => expect(isPii('SSN')).toBe(true));
    test('returns true for Email', () => expect(isPii('Email')).toBe(true));
    test('returns true for CoApplicant.DLNumber', () => expect(isPii('CoApplicant.DLNumber')).toBe(true));
    test('returns false for FirstName', () => expect(isPii('FirstName')).toBe(false));
    test('returns false for null', () => expect(isPii(null)).toBe(false));
    test('returns false for empty string', () => expect(isPii('')).toBe(false));
});
