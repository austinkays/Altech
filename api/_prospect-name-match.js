/**
 * Shared business-name normalization for public-records name searches.
 *
 * WA L&I, WA SOS (CCFS) / DOR, OR CCB, and OR SOS all match a typed name as a
 * single contiguous substring. Entity-suffix and connector noise ("LLC",
 * "INC", "& / AND", a leading "THE") then sinks otherwise-good matches:
 * searching "ABC Plumbing LLC" misses a record registered as "ABC PLUMBING
 * INC". These helpers strip that noise and build a SoQL-safe relaxed LIKE
 * clause (significant tokens joined by `%`, so any registered suffix and
 * interior words still match while token order is preserved).
 */

const ENTITY_SUFFIXES = new Set([
  'LLC', 'LLP', 'LLLP', 'LP', 'LTD', 'INC', 'INCORPORATED',
  'CORP', 'CORPORATION', 'CO', 'COMPANY', 'PLLC', 'PC', 'PA',
  'PS', 'APC', 'DBA',
]);

/**
 * Normalize a raw business name to its significant tokens: uppercased,
 * punctuation and "&"→space, a leading "THE" and trailing entity suffixes
 * removed (handles stacked suffixes like "CO INC"), bare "AND" dropped.
 * @param {string} rawName
 * @returns {string[]}
 */
export function normalizeBusinessTokens(rawName) {
  if (!rawName) return [];
  const cleaned = String(rawName)
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  let tokens = cleaned.split(' ').filter(Boolean);
  while (tokens.length > 1 && tokens[0] === 'THE') tokens.shift();
  while (tokens.length > 1 && ENTITY_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.filter(t => t !== 'AND');
}

/** SoQL-escape a token: double single-quotes, drop wildcard/escape chars. */
function _soqlSafe(token) {
  return token.replace(/'/g, "''").replace(/[\\%_]/g, '');
}

/**
 * Build a relaxed, SoQL-safe `upper(col) like upper('%a%b%')` clause.
 * Tokens are joined by `%` so a differing registered suffix or interior
 * words ("ABC PLUMBING" → "ABC QUALITY PLUMBING INC") still match.
 * Returns null when the name yields no usable tokens — the caller should
 * fall back to its original raw-substring query rather than emit `%%`
 * (which would match every row in the dataset).
 * @param {string} column  SoQL column name (trusted, not user input)
 * @param {string} rawName
 * @returns {string|null}
 */
export function buildSoqlNameClause(column, rawName) {
  const tokens = normalizeBusinessTokens(rawName).map(_soqlSafe).filter(Boolean);
  if (!tokens.length) return null;
  return `upper(${column}) like upper('%${tokens.join('%')}%')`;
}

/**
 * Relaxed plain-text search value for APIs that do their own tokenizing
 * (WA SOS CCFS "Contains" search, WA DOR). Suffix/connector-stripped name;
 * falls back to the original when stripping leaves nothing usable.
 * @param {string} rawName
 * @returns {string}
 */
export function relaxedSearchValue(rawName) {
  const tokens = normalizeBusinessTokens(rawName);
  return tokens.length ? tokens.join(' ') : (rawName || '');
}
