// Tests for the PII scrub in bug reports (js/bug-report.js client side
// and api/config.js server side). Bug reports get posted to a PUBLIC
// GitHub Issues repo, so anything that looks like an SSN / phone /
// email / VIN / credit card / DOB must be redacted before the report
// leaves the browser AND a second time on the server.
//
// Both implementations use the same regex set — if you change one, change
// the other. These tests run against the client implementation by extracting
// the regex from the bug-report.js source; the server-side implementation
// is verified by source-level regex match.

const fs = require('fs');
const path = require('path');

const CLIENT_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'bug-report.js'), 'utf8');
const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', 'api', 'config.js'), 'utf8');

// Pull _scrubPII out of the source via eval so we can drive it with real inputs.
// The function is self-contained (no closures), so this is safe + fast.
function loadClientScrub() {
    const m = CLIENT_SRC.match(/function _scrubPII\(text\) \{[\s\S]*?\n {4}\}/);
    if (!m) throw new Error('_scrubPII not found in js/bug-report.js');
    // The function uses no external symbols — wrap in an IIFE that returns it.
    // eslint-disable-next-line no-new-func
    return new Function(`${m[0]}\nreturn _scrubPII;`)();
}

describe('Bug report PII scrub (client)', () => {
    const scrub = loadClientScrub();

    test('SSN — hyphenated and space-separated are redacted', () => {
        expect(scrub('SSN: 123-45-6789')).toBe('SSN: [REDACTED-SSN]');
        expect(scrub('SSN 123 45 6789')).toBe('SSN [REDACTED-SSN]');
    });

    test('Phone — common US formats', () => {
        expect(scrub('Call 425-555-1234')).toBe('Call [REDACTED-PHONE]');
        expect(scrub('Call (425) 555-1234')).toBe('Call [REDACTED-PHONE]');
        expect(scrub('Call +1 425 555 1234')).toBe('Call [REDACTED-PHONE]');
        expect(scrub('Call 425.555.1234')).toBe('Call [REDACTED-PHONE]');
    });

    test('Email is redacted', () => {
        expect(scrub('Contact jane.doe@example.com please')).toBe('Contact [REDACTED-EMAIL] please');
        expect(scrub('a+b@c.co')).toBe('[REDACTED-EMAIL]');
    });

    test('Credit card — 13-19 digit runs with separators', () => {
        expect(scrub('Card 4111 1111 1111 1111')).toBe('Card [REDACTED-CC]');
        expect(scrub('Card 4111-1111-1111-1111')).toBe('Card [REDACTED-CC]');
        expect(scrub('Card 4111111111111111')).toBe('Card [REDACTED-CC]');
    });

    test('VIN — 17-char alphanumeric (excluding I/O/Q)', () => {
        expect(scrub('VIN 1HGCM82633A123456')).toBe('VIN [REDACTED-VIN]');
        // Same as 5YJ3E1EA7KF317XYZ — letters K/Y/Z allowed
        expect(scrub('5YJ3E1EA7KF317XYZ')).toBe('[REDACTED-VIN]');
        // 16 chars — not a VIN, stays as-is
        expect(scrub('1HGCM82633A12345')).toBe('1HGCM82633A12345');
    });

    test('DOB — M/D/YYYY shapes', () => {
        expect(scrub('DOB 5/11/1990')).toBe('DOB [REDACTED-DOB]');
        expect(scrub('Born 11-05-1990')).toBe('Born [REDACTED-DOB]');
        // 2-digit year — NOT redacted (too many false positives for short dates in error messages)
        expect(scrub('after 5/11/26')).toBe('after 5/11/26');
    });

    test('Multiple PII in one string — all get scrubbed', () => {
        const input = 'Customer Sue (sue@x.com, 425-555-1234, DOB 5/11/1980, SSN 123-45-6789) reported a bug.';
        const out = scrub(input);
        expect(out).toContain('[REDACTED-EMAIL]');
        expect(out).toContain('[REDACTED-PHONE]');
        expect(out).toContain('[REDACTED-DOB]');
        expect(out).toContain('[REDACTED-SSN]');
        // Name still present — there's no general regex for free-text names.
        expect(out).toContain('Customer Sue');
    });

    test('Non-PII content is preserved unchanged', () => {
        const input = 'When I click Save the page reloads. Step 1: open form. Step 2: type. Step 3: click.';
        expect(scrub(input)).toBe(input);
    });

    test('Edge cases: empty, null, non-strings', () => {
        expect(scrub('')).toBe('');
        expect(scrub(null)).toBeNull();
        expect(scrub(undefined)).toBeUndefined();
        expect(scrub(42)).toBe(42);
    });
});

describe('Bug report PII scrub (server)', () => {
    test('api/config.js exports a scrubBugReportPII helper with the same patterns', () => {
        expect(SERVER_SRC).toContain('function scrubBugReportPII(text)');
        // Each redaction marker is present (one-line check per pattern).
        expect(SERVER_SRC).toContain("'[REDACTED-SSN]'");
        expect(SERVER_SRC).toContain("'[REDACTED-PHONE]'");
        expect(SERVER_SRC).toContain("'[REDACTED-EMAIL]'");
        expect(SERVER_SRC).toContain("'[REDACTED-CC]'");
        expect(SERVER_SRC).toContain("'[REDACTED-VIN]'");
        expect(SERVER_SRC).toContain("'[REDACTED-DOB]'");
    });

    test('handleBugReport calls scrubBugReportPII on title/description/steps', () => {
        // Source-level guard so the wiring isn't lost in a refactor.
        expect(SERVER_SRC).toMatch(/safeTitle\s*=\s*scrubBugReportPII\(/);
        expect(SERVER_SRC).toMatch(/safeDescription\s*=\s*scrubBugReportPII\(/);
        expect(SERVER_SRC).toMatch(/safeSteps\s*=\s*scrubBugReportPII\(/);
    });
});

describe('Bug report modal — PII warning is present', () => {
    test('bugreport-privacy-notice div is rendered with the public-on-GitHub warning', () => {
        expect(CLIENT_SRC).toMatch(/bugreport-privacy-notice/);
        expect(CLIENT_SRC).toMatch(/Reports are public on GitHub/);
        expect(CLIENT_SRC).toMatch(/auto-redacted/);
    });
});
