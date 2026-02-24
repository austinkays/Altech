/**
 * API Tests: _security.js
 *
 * Tests the exported validator/sanitizer functions:
 * - sanitizeInput
 * - validateEmail
 * - validatePhone
 *
 * Also validates module syntax.
 */

const fs = require('fs');
const path = require('path');

// ── Load functions from ESM source ──
function loadSecurityFunctions() {
  const source = fs.readFileSync(path.join(__dirname, '../lib/security.js'), 'utf8');
  const cleaned = source
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+default\s+/m, 'const __defaultExport = ')
    .replace(/^export\s+/gm, '');

  const extractFn = new Function(`
    ${cleaned}
    return { sanitizeInput, validateEmail, validatePhone, validateSSN, validateZip };
  `);
  return extractFn();
}

let fns;

beforeAll(() => {
  fns = loadSecurityFunctions();
});

// ────────────────────────────────────────────────────
// Module Syntax
// ────────────────────────────────────────────────────

describe('_security.js — Module Syntax', () => {
  test('module source parses without errors', () => {
    expect(fns).toBeDefined();
    expect(typeof fns.sanitizeInput).toBe('function');
    expect(typeof fns.validateEmail).toBe('function');
    expect(typeof fns.validatePhone).toBe('function');
  });
});

// ────────────────────────────────────────────────────
// sanitizeInput
// ────────────────────────────────────────────────────

describe('sanitizeInput', () => {
  test('trims whitespace', () => {
    expect(fns.sanitizeInput('  hello  ')).toBe('hello');
  });

  test('truncates to maxLength', () => {
    const long = 'a'.repeat(600);
    expect(fns.sanitizeInput(long).length).toBe(500); // default maxLength
  });

  test('truncates to custom maxLength', () => {
    expect(fns.sanitizeInput('hello world', 5)).toBe('hello');
  });

  test('strips angle brackets (XSS prevention)', () => {
    expect(fns.sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  test('returns empty string for non-string input', () => {
    expect(fns.sanitizeInput(null)).toBe('');
    expect(fns.sanitizeInput(undefined)).toBe('');
    expect(fns.sanitizeInput(123)).toBe('');
    expect(fns.sanitizeInput({})).toBe('');
  });

  test('handles empty string', () => {
    expect(fns.sanitizeInput('')).toBe('');
  });

  test('preserves normal text including special characters', () => {
    expect(fns.sanitizeInput("O'Brien & Co.")).toBe("O'Brien & Co.");
  });
});

// ────────────────────────────────────────────────────
// validateEmail
// ────────────────────────────────────────────────────

describe('validateEmail', () => {
  test('accepts valid email', () => {
    expect(fns.validateEmail('user@example.com')).toBe(true);
  });

  test('accepts email with subdomain', () => {
    expect(fns.validateEmail('user@mail.example.com')).toBe(true);
  });

  test('accepts email with plus addressing', () => {
    expect(fns.validateEmail('user+tag@example.com')).toBe(true);
  });

  test('rejects missing @', () => {
    expect(fns.validateEmail('userexample.com')).toBe(false);
  });

  test('rejects missing domain', () => {
    expect(fns.validateEmail('user@')).toBe(false);
  });

  test('rejects missing TLD', () => {
    expect(fns.validateEmail('user@example')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(fns.validateEmail('')).toBe(false);
  });

  test('rejects null/undefined', () => {
    expect(fns.validateEmail(null)).toBe(false);
    expect(fns.validateEmail(undefined)).toBe(false);
  });

  test('rejects non-string', () => {
    expect(fns.validateEmail(123)).toBe(false);
  });

  test('rejects overly long email (255+)', () => {
    const longEmail = 'a'.repeat(250) + '@b.com';
    expect(fns.validateEmail(longEmail)).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// validatePhone
// ────────────────────────────────────────────────────

describe('validatePhone', () => {
  test('accepts 10-digit phone', () => {
    expect(fns.validatePhone('5551234567')).toBe(true);
  });

  test('accepts formatted US phone', () => {
    expect(fns.validatePhone('(555) 123-4567')).toBe(true);
  });

  test('accepts phone with country code', () => {
    expect(fns.validatePhone('+1-555-123-4567')).toBe(true);
  });

  test('accepts international phone (15 digits)', () => {
    expect(fns.validatePhone('123456789012345')).toBe(true);
  });

  test('rejects too short (< 10 digits)', () => {
    expect(fns.validatePhone('123456')).toBe(false);
  });

  test('rejects too long (> 15 digits)', () => {
    expect(fns.validatePhone('1234567890123456')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(fns.validatePhone('')).toBe(false);
  });

  test('rejects null/undefined', () => {
    expect(fns.validatePhone(null)).toBe(false);
    expect(fns.validatePhone(undefined)).toBe(false);
  });

  test('rejects non-string', () => {
    expect(fns.validatePhone(12345)).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// validateSSN
// ────────────────────────────────────────────────────

describe('validateSSN', () => {
  test('accepts valid SSN with dashes', () => {
    expect(fns.validateSSN('123-45-6789')).toBe(true);
  });

  test('accepts valid SSN without dashes', () => {
    expect(fns.validateSSN('123456789')).toBe(true);
  });

  test('rejects area 000', () => {
    expect(fns.validateSSN('000-45-6789')).toBe(false);
  });

  test('rejects area 666', () => {
    expect(fns.validateSSN('666-45-6789')).toBe(false);
  });

  test('rejects ITIN (area 900+)', () => {
    expect(fns.validateSSN('900-45-6789')).toBe(false);
    expect(fns.validateSSN('999-45-6789')).toBe(false);
  });

  test('rejects group 00', () => {
    expect(fns.validateSSN('123-00-6789')).toBe(false);
  });

  test('rejects serial 0000', () => {
    expect(fns.validateSSN('123-45-0000')).toBe(false);
  });

  test('rejects all-same-digit pattern', () => {
    expect(fns.validateSSN('111-11-1111')).toBe(false);
    expect(fns.validateSSN('999-99-9999')).toBe(false);
  });

  test('rejects too short', () => {
    expect(fns.validateSSN('12345')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(fns.validateSSN('')).toBe(false);
  });

  test('rejects null/undefined', () => {
    expect(fns.validateSSN(null)).toBe(false);
    expect(fns.validateSSN(undefined)).toBe(false);
  });

  test('rejects non-string', () => {
    expect(fns.validateSSN(123456789)).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// validateZip
// ────────────────────────────────────────────────────

describe('validateZip', () => {
  test('accepts 5-digit ZIP', () => {
    expect(fns.validateZip('98001')).toBe(true);
  });

  test('accepts ZIP+4 format', () => {
    expect(fns.validateZip('98001-1234')).toBe(true);
  });

  test('rejects ZIP with letters', () => {
    expect(fns.validateZip('9800A')).toBe(false);
  });

  test('rejects 4-digit ZIP', () => {
    expect(fns.validateZip('9800')).toBe(false);
  });

  test('rejects 6-digit ZIP', () => {
    expect(fns.validateZip('980011')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(fns.validateZip('')).toBe(false);
  });

  test('rejects null/undefined', () => {
    expect(fns.validateZip(null)).toBe(false);
    expect(fns.validateZip(undefined)).toBe(false);
  });
});
