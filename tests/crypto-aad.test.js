// Tests for js/crypto-aad.js — the centralized AAD builder.
//
// AAD is bound into AES-GCM's authentication tag. If encrypt and decrypt
// don't produce byte-identical AAD, decryption fails. These tests pin the
// invariants that protect against ambiguous-concat bugs and silent drift.

const { CryptoAAD } = require('../js/crypto-aad.js');

const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));

describe('CryptoAAD.buildAAD', () => {
    const base = { table: 'user_quotes', rowId: 'row-1', userId: 'user-1' };

    test('deterministic for the same input', () => {
        expect(eq(CryptoAAD.buildAAD(base), CryptoAAD.buildAAD(base))).toBe(true);
    });

    test('changes with table', () => {
        const a = CryptoAAD.buildAAD(base);
        const b = CryptoAAD.buildAAD({ ...base, table: 'user_blobs' });
        expect(eq(a, b)).toBe(false);
    });

    test('changes with rowId', () => {
        const a = CryptoAAD.buildAAD(base);
        const b = CryptoAAD.buildAAD({ ...base, rowId: 'row-2' });
        expect(eq(a, b)).toBe(false);
    });

    test('changes with userId', () => {
        const a = CryptoAAD.buildAAD(base);
        const b = CryptoAAD.buildAAD({ ...base, userId: 'user-2' });
        expect(eq(a, b)).toBe(false);
    });

    test('changes with envelopeVersion', () => {
        const a = CryptoAAD.buildAAD({ ...base, envelopeVersion: 1 });
        const b = CryptoAAD.buildAAD({ ...base, envelopeVersion: 2 });
        expect(eq(a, b)).toBe(false);
    });

    test('default envelopeVersion is V2_AAD (=2)', () => {
        expect(CryptoAAD.ENVELOPE.V2_AAD).toBe(2);
        const defaulted = CryptoAAD.buildAAD(base);
        const explicit  = CryptoAAD.buildAAD({ ...base, envelopeVersion: 2 });
        expect(eq(defaulted, explicit)).toBe(true);
    });

    test('length-prefixing prevents ambiguous concat', () => {
        // Without length prefix, ("ab","c") and ("a","bc") would produce the
        // same byte stream. With prefix, they must differ.
        const a = CryptoAAD.buildAAD({ table: 'ab', rowId: 'c',  userId: 'u' });
        const b = CryptoAAD.buildAAD({ table: 'a',  rowId: 'bc', userId: 'u' });
        expect(eq(a, b)).toBe(false);
    });

    test('numeric rowId is coerced to string consistently', () => {
        const a = CryptoAAD.buildAAD({ ...base, rowId: 42 });
        const b = CryptoAAD.buildAAD({ ...base, rowId: '42' });
        expect(eq(a, b)).toBe(true);
    });

    test('rejects missing fields', () => {
        expect(() => CryptoAAD.buildAAD()).toThrow();
        expect(() => CryptoAAD.buildAAD({})).toThrow();
        expect(() => CryptoAAD.buildAAD({ table: 't', rowId: 'r' })).toThrow();
        expect(() => CryptoAAD.buildAAD({ rowId: 'r', userId: 'u' })).toThrow();
        expect(() => CryptoAAD.buildAAD({ table: 't', userId: 'u' })).toThrow();
    });

    test('rejects empty strings and null/undefined', () => {
        expect(() => CryptoAAD.buildAAD({ table: '',  rowId: 'r', userId: 'u' })).toThrow();
        expect(() => CryptoAAD.buildAAD({ table: 't', rowId: '',  userId: 'u' })).toThrow();
        expect(() => CryptoAAD.buildAAD({ table: 't', rowId: null, userId: 'u' })).toThrow();
        expect(() => CryptoAAD.buildAAD({ table: 't', rowId: 'r', userId: '' })).toThrow();
    });

    test('starts with the "altech" magic prefix', () => {
        const aad = CryptoAAD.buildAAD(base);
        // Layout: 4-byte length prefix, then 6 ASCII bytes "altech".
        expect(aad[0]).toBe(0);
        expect(aad[1]).toBe(0);
        expect(aad[2]).toBe(0);
        expect(aad[3]).toBe(6);
        expect(Buffer.from(aad.slice(4, 10)).toString('utf8')).toBe('altech');
    });
});
