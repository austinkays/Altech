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
  const source = fs.readFileSync(path.join(__dirname, '../api/_security.js'), 'utf8');
  const cleaned = source
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+default\s+/m, 'const __defaultExport = ')
    .replace(/^export\s+/gm, '');

  const extractFn = new Function(`
    ${cleaned}
    return { sanitizeInput, validateEmail, validatePhone };
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

  test('preserves normal text', () => {
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
