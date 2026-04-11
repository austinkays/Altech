/**
 * Altech EZLynx V2 — Dice similarity test suite
 */
const { diceSimilarity, bestMatch } = require('../../src/content/locator/dice-similarity');

describe('diceSimilarity', () => {
    test('returns 1 for exact matches', () => {
        expect(diceSimilarity('Retired', 'Retired')).toBe(1);
    });

    test('is case-insensitive', () => {
        expect(diceSimilarity('Retired', 'retired')).toBe(1);
    });

    test('returns 0 for null/undefined inputs', () => {
        expect(diceSimilarity(null, 'a')).toBe(0);
        expect(diceSimilarity('a', null)).toBe(0);
    });

    test('returns 0 when either string is shorter than 2 chars', () => {
        expect(diceSimilarity('a', 'ab')).toBe(0);
    });

    test('partial overlap is in (0, 1)', () => {
        const s = diceSimilarity('night', 'nacht');
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });
});

describe('bestMatch', () => {
    test('returns null for empty candidate list', () => {
        expect(bestMatch('x', [])).toBeNull();
    });

    test('picks the best candidate above threshold', () => {
        const result = bestMatch('Retired', ['Student', 'Retirement', 'Retired'], 0.7);
        expect(result).not.toBeNull();
        expect(result.value).toBe('Retired');
        expect(result.score).toBe(1);
    });

    test('returns null when no candidate exceeds the default 0.7 threshold', () => {
        const result = bestMatch('Engineer', ['Teacher', 'Chef', 'Driver']);
        expect(result).toBeNull();
    });

    test('accepts a custom threshold', () => {
        const result = bestMatch('Engineer', ['Engineering Manager'], 0.4);
        expect(result).not.toBeNull();
    });
});
