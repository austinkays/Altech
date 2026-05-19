/**
 * api/_prospect-name-match.js — business-name normalization for public-records
 * name searches. Pure functions; loaded by stripping ESM keywords and
 * evaluating in `new Function` (same pattern as api-prospect.test.js).
 */

const fs = require('fs');
const path = require('path');

function loadNameMatch() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'api/_prospect-name-match.js'), 'utf8'
  ).replace(/^export\s+/gm, '');
  return new Function(`
    ${src}
    return { normalizeBusinessTokens, buildSoqlNameClause, relaxedSearchValue };
  `)();
}

let M;
beforeAll(() => { M = loadNameMatch(); });

describe('normalizeBusinessTokens', () => {
  test('strips trailing entity suffixes', () => {
    expect(M.normalizeBusinessTokens('ABC Plumbing LLC')).toEqual(['ABC', 'PLUMBING']);
    expect(M.normalizeBusinessTokens('ABC Plumbing, Inc.')).toEqual(['ABC', 'PLUMBING']);
    expect(M.normalizeBusinessTokens('Smith Co Inc')).toEqual(['SMITH']);
  });

  test('strips a leading "THE" and normalizes "&"/AND', () => {
    expect(M.normalizeBusinessTokens('The Corner Store')).toEqual(['CORNER', 'STORE']);
    expect(M.normalizeBusinessTokens('Mac & Cheese Co')).toEqual(['MAC', 'CHEESE']);
  });

  test('keeps the name when it is only a suffix-ish word', () => {
    // Single token never stripped (guard against matching everything).
    expect(M.normalizeBusinessTokens('Company')).toEqual(['COMPANY']);
    expect(M.normalizeBusinessTokens('')).toEqual([]);
    expect(M.normalizeBusinessTokens(null)).toEqual([]);
  });

  test('preserves digits', () => {
    expect(M.normalizeBusinessTokens('7-Eleven #221')).toEqual(['7', 'ELEVEN', '221']);
  });
});

describe('buildSoqlNameClause', () => {
  test('joins tokens with % so suffix/interior words still match', () => {
    expect(M.buildSoqlNameClause('businessname', 'ABC Plumbing LLC'))
      .toBe("upper(businessname) like upper('%ABC%PLUMBING%')");
  });

  test('drops punctuation/wildcard/escape chars before building the clause', () => {
    // Apostrophes, %, _, \ are non-[A-Z0-9] so they split tokens and never
    // reach the SoQL string — the clause stays injection-safe.
    const clause = M.buildSoqlNameClause('full_name', "O'Brien %_\\ Co");
    // Exact match already proves the input's ' % _ \ were stripped before
    // hitting the SoQL string (the lone _ below is the column name).
    expect(clause).toBe("upper(full_name) like upper('%O%BRIEN%')");
    expect(clause).not.toContain('\\');
    expect(clause).not.toContain("''");
  });

  test('returns null when no usable tokens (caller falls back)', () => {
    expect(M.buildSoqlNameClause('businessname', '   ')).toBeNull();
    expect(M.buildSoqlNameClause('businessname', '&&&')).toBeNull();
  });
});

describe('relaxedSearchValue', () => {
  test('returns the suffix-stripped phrase for tokenizing APIs', () => {
    expect(M.relaxedSearchValue('ABC Plumbing & Heating LLC')).toBe('ABC PLUMBING HEATING');
  });

  test('falls back to the original when stripping leaves nothing', () => {
    expect(M.relaxedSearchValue('LLC')).toBe('LLC');
    expect(M.relaxedSearchValue('')).toBe('');
  });
});
