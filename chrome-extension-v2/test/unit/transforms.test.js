/**
 * Altech EZLynx V2 — Transforms test suite
 */
const { expand, ABBREV_MAP } = require('../../src/content/transforms/abbreviations');
const { strip, stripInt } = require('../../src/content/transforms/currency-strip');
const { normalize } = require('../../src/content/transforms/phone-format');

describe('abbreviations.expand', () => {
    test('expands known gender codes', () => {
        expect(expand('M')).toBe('Male');
        expect(expand('F')).toBe('Female');
    });

    test('is case-insensitive on keys', () => {
        expect(expand('hs')).toBe('High School');
        expect(expand('PHd')).toBe('Doctorate');
    });

    test('returns trimmed input unchanged when not a key', () => {
        expect(expand(' Retired ')).toBe('Retired');
        expect(expand('Chef')).toBe('Chef');
    });

    test('passes null / empty through', () => {
        expect(expand(null)).toBe(null);
        expect(expand(undefined)).toBe(undefined);
        expect(expand('')).toBe('');
    });

    test('ABBREV_MAP is populated with the core set', () => {
        expect(Object.keys(ABBREV_MAP).length).toBeGreaterThanOrEqual(10);
        expect(ABBREV_MAP.HS).toBe('High School');
    });
});

describe('currency-strip.strip', () => {
    test('strips $ and commas from formatted currency', () => {
        expect(strip('$1,234.56')).toBe('1234.56');
        expect(strip('$1,000,000')).toBe('1000000');
    });

    test('handles numeric input', () => {
        expect(strip(1234)).toBe('1234');
        expect(strip(0)).toBe('0');
    });

    test('handles null / empty', () => {
        expect(strip(null)).toBe('');
        expect(strip('')).toBe('');
        expect(strip(undefined)).toBe('');
    });

    test('preserves negatives', () => {
        expect(strip('-$500')).toBe('-500');
    });

    test('collapses multiple decimal points to the first', () => {
        expect(strip('1.2.3')).toBe('1.23');
    });
});

describe('currency-strip.stripInt', () => {
    test('normalizes deductible-like values for mat-option matching', () => {
        expect(stripInt('$1,000')).toBe('1000');
        expect(stripInt('1000.99')).toBe('1000');
        expect(stripInt(500)).toBe('500');
    });

    test('returns empty string on non-numeric input', () => {
        expect(stripInt('abc')).toBe('');
        expect(stripInt(null)).toBe('');
    });
});

describe('phone-format.normalize', () => {
    test('strips formatting to 10 digits', () => {
        expect(normalize('(702) 555-1234')).toBe('7025551234');
        expect(normalize('702.555.1234')).toBe('7025551234');
        expect(normalize('702-555-1234')).toBe('7025551234');
    });

    test('drops leading 1 country code on 11-digit input', () => {
        expect(normalize('1 702 555 1234')).toBe('7025551234');
        expect(normalize('+1 (702) 555-1234')).toBe('7025551234');
    });

    test('returns empty string for empty input', () => {
        expect(normalize('')).toBe('');
        expect(normalize(null)).toBe('');
    });
});
