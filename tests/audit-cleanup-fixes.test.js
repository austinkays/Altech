/**
 * Regression coverage for the audit-driven cleanup batch in:
 *   - js/app-export.js               (_safeFileNamePart)
 *   - js/app-export-cmsmtf.js        (CRLF line endings + 2KB notes cap)
 *   - js/app-export-pdf.js           (doc.output('blob') OOM guard)
 *   - js/reminders.js                (monthly clamp + snooze PST string + saveEdit validation)
 *   - js/compliance-dashboard.js     (escJsAttr + _safeLSWrite quota toast)
 *
 * Each section asserts source-level evidence where the runtime is hard to
 * stand up (compliance dashboard pulls IndexedDB + cloud sync). The
 * filename + monthly-clamp helpers are exercised against real code.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── 1. _safeFileNamePart ─────────────────────────────────────────────────

describe('_safeFileNamePart', () => {
    // Extract the helper into a runnable function without booting all of App.
    // The helper is pure — no dependency on other App methods — so eval-loading
    // just its body keeps the test fast.
    let safe;
    beforeAll(() => {
        const src = readSrc('js/app-export.js');
        const match = src.match(/_safeFileNamePart\(s, fallback = ''\) \{([\s\S]+?)\n    \},/);
        if (!match) throw new Error('Could not locate _safeFileNamePart body');
        // Wrap as a callable function. The body uses `String(s)` and `Math.min`
        // — both globals — so no extra context needed.
        // eslint-disable-next-line no-new-func
        safe = new Function('s', 'fallback', `fallback = fallback ?? '';${match[1]}`);
    });

    test("strips < > : \" | ? * \\ / from inputs", () => {
        expect(safe('a<b>c:d"e|f?g*h\\i/j', '')).toBe('abcdefghij');
    });

    test('keeps spaces, hyphens, apostrophes, dots, unicode', () => {
        // Apostrophes / accents / spaces are legal in filenames on every OS
        // we ship to — only the Windows-illegal set needs stripping.
        expect(safe("O'Brien", '')).toBe("O'Brien");
        expect(safe('Smith Jr.', '')).toBe('Smith Jr');
        expect(safe('López', '')).toBe('López');
    });

    test('collapses whitespace and trims trailing dots/spaces', () => {
        expect(safe('  Foo   Bar  ', '')).toBe('Foo Bar');
        expect(safe('Foo...   ', '')).toBe('Foo');
    });

    test('strips C0 control characters', () => {
        expect(safe('Foo\x00Bar\x1FBaz', '')).toBe('FooBarBaz');
    });

    test('caps length at 80 characters', () => {
        const out = safe('A'.repeat(200), '');
        expect(out.length).toBe(80);
    });

    test('returns fallback for empty / null / pure-junk input', () => {
        expect(safe('', 'Client')).toBe('Client');
        expect(safe(null, 'Client')).toBe('Client');
        expect(safe(undefined, 'Client')).toBe('Client');
        expect(safe('<><><>', 'Client')).toBe('Client');
    });
});

// ── 2. CMSMTF CRLF + notes cap ───────────────────────────────────────────

describe('CMSMTF export', () => {
    const src = readSrc('js/app-export-cmsmtf.js');

    test('joins lines with CRLF (HawkSoft tagged-file format)', () => {
        expect(src).toMatch(/\.join\(['"]\\r\\n['"]\)/);
        expect(src).not.toMatch(/lines\.filter\(l => l\)\.join\(['"]\\n['"]\)/);
    });

    test('caps gen_sClientNotes at 2048 chars with ellipsis', () => {
        expect(src).toMatch(/NOTES_CAP\s*=\s*2048/);
        expect(src).toMatch(/notes\.slice\(0,\s*NOTES_CAP - 1\)/);
    });

    test('uses _safeFileNamePart for the filename', () => {
        expect(src).toMatch(/_safeFileNamePart\(data\.lastName,\s*['"]Export['"]\)/);
    });
});

// ── 3. PDF OOM guard ─────────────────────────────────────────────────────

describe('PDF export OOM guard', () => {
    const src = readSrc('js/app-export-pdf.js');

    test('wraps doc.output("blob") in try/catch + user toast', () => {
        // doc.output('blob') can throw OOM on a 50-vehicle PDF; the guard
        // must surface a toast and rethrow so the caller's logExport
        // still treats it as a failure.
        expect(src).toMatch(/try \{[^}]*doc\.output\(['"]blob['"]\)/s);
        expect(src).toMatch(/PDF too large to assemble/);
    });

    test('uses _safeFileNamePart for the filename', () => {
        expect(src).toMatch(/_safeFileNamePart\(data\.lastName/);
    });
});

// ── 4. Reminders monthly clamp ───────────────────────────────────────────

describe('reminders _addMonthsClamped', () => {
    let addMonths;
    beforeAll(() => {
        const src = readSrc('js/reminders.js');
        const m = src.match(/function _addMonthsClamped\(date, n\) \{([\s\S]+?)\n    \}/);
        if (!m) throw new Error('Could not locate _addMonthsClamped body');
        // eslint-disable-next-line no-new-func
        addMonths = new Function('date', 'n', m[1]);
    });

    test('Jan 31 + 1 month → Feb 28 in a non-leap year', () => {
        const out = addMonths(new Date(2025, 0, 31), 1);
        expect(out.getFullYear()).toBe(2025);
        expect(out.getMonth()).toBe(1); // February
        expect(out.getDate()).toBe(28);
    });

    test('Jan 31 + 1 month → Feb 29 in a leap year', () => {
        const out = addMonths(new Date(2024, 0, 31), 1);
        expect(out.getMonth()).toBe(1);
        expect(out.getDate()).toBe(29);
    });

    test('Mar 31 + 1 month → Apr 30 (Apr has 30 days)', () => {
        const out = addMonths(new Date(2025, 2, 31), 1);
        expect(out.getMonth()).toBe(3);
        expect(out.getDate()).toBe(30);
    });

    test('Aug 15 + 1 month → Sep 15 (no clamping needed)', () => {
        const out = addMonths(new Date(2025, 7, 15), 1);
        expect(out.getMonth()).toBe(8);
        expect(out.getDate()).toBe(15);
    });

    test('Dec 31 + 1 month → Jan 31 of next year', () => {
        const out = addMonths(new Date(2025, 11, 31), 1);
        expect(out.getFullYear()).toBe(2026);
        expect(out.getMonth()).toBe(0);
        expect(out.getDate()).toBe(31);
    });
});

// ── 5. Reminders snooze + saveEdit (source-level guards) ─────────────────

describe('reminders snooze + saveEdit guards', () => {
    const src = readSrc('js/reminders.js');

    test('_isSnoozeActive prefers untilDateStr over local-tz instant', () => {
        // The TZ-bug fix: a snoozed task with `untilDateStr` should be
        // resolved via PST date-string comparison, not the legacy
        // local-tz ISO instant. We only assert the source predicate to
        // avoid standing up the full reminders module in JSDOM.
        expect(src).toMatch(/task\.snooze\.untilDateStr/);
        expect(src).toMatch(/_todayPST\(\) > task\.snooze\.untilDateStr/);
    });

    test('snoozeUntilTonight writes untilDateStr', () => {
        expect(src).toContain("type: 'snooze-tonight'");
        // Both fields present in the same object literal — `untilDateStr`
        // is the TZ-independent backstop for `until`.
        const block = src.slice(src.indexOf("type: 'snooze-tonight'"));
        expect(block.slice(0, 500)).toContain('untilDateStr');
    });

    test('pushToTomorrow writes untilDateStr', () => {
        expect(src).toContain("type: 'push-tomorrow'");
        const block = src.slice(src.indexOf("type: 'push-tomorrow'"));
        expect(block.slice(0, 500)).toContain('untilDateStr');
    });

    test("saveEdit rejects empty or malformed dueDate", () => {
        // Regex check happens inline; the fix should refuse to save when
        // dueDate is empty or doesn't match YYYY-MM-DD.
        expect(src).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
        expect(src).toMatch(/Pick a due date before saving/);
    });

    test('monthly recurrence uses _addMonthsClamped in _getNextDueDate', () => {
        // The pre-fix code was `next.setMonth(next.getMonth() + 1)` which
        // overflowed Jan 31 to Mar 3.
        expect(src).not.toMatch(/freq === ['"]monthly['"]\) next\.setMonth/);
        expect(src).toMatch(/_addMonthsClamped\(next, 1\)/);
    });
});

// ── 6. Compliance dashboard guards ───────────────────────────────────────

describe('compliance-dashboard guards', () => {
    const src = readSrc('js/compliance-dashboard.js');

    test('escJsAttr helper is defined and applied at policy-number sites', () => {
        // Dual-escape helper: backslash-escape for the JS string, then
        // HTML-attr-encode. Both layers must be present.
        expect(src).toContain('function escJsAttr(s)');
        // The JS-layer escape (must come before the HTML-attr layer).
        expect(src).toContain(".replace(/\\\\/g, '\\\\\\\\').replace(/'/g, \"\\\\'\")");
        expect(src).toContain('Utils.escapeAttr(js)');
        // The broken legacy escape must be gone (it produced `\\'` not `\'`).
        expect(src).not.toContain('replace(/\'/g, "\\\\\\\\\'");');
        // Master pn binding routes through escJsAttr.
        expect(src).toContain('const pn = escJsAttr(policy.policyNumber)');
        // The two live-update sites use escJsAttr.
        expect(src).toContain("searchForPolicy('${escJsAttr(data.renewedTo)}')");
        expect(src).toContain("clearRenewed('${escJsAttr(policyNumber)}')");
    });

    test('_safeLSWrite helper is defined and used at user-state sites', () => {
        expect(src).toMatch(/_safeLSWrite\(key,\s*value\)/);
        // Recognises QuotaExceededError + legacy WebKit / Firefox codes.
        expect(src).toMatch(/QuotaExceededError/);
        // Shows a one-time toast.
        expect(src).toMatch(/_quotaToastShown/);
        // The four user-state write sites should go through the helper —
        // the master saveState site (#1 of 4) plus the merge-back + file-open
        // + annotations-promote sites.
        const matches = src.match(/this\._safeLSWrite\(STORAGE_KEY,/g) || [];
        expect(matches.length).toBeGreaterThanOrEqual(4);
    });
});

// ── 7. Start-fresh button + palette commands ────────────────────────────

describe('intake "Start fresh" button', () => {
    const html = readSrc('plugins/quoting.html');
    const css = readSrc('css/layout.css');

    test('acb-fresh-btn lives inside the active-client badge actions row', () => {
        // The button must sit next to History/Save in `.acb-actions` so it
        // only shows when there's something to clear.
        expect(html).toMatch(/<div class="acb-actions">[\s\S]*acb-fresh-btn[\s\S]*<\/div>/);
        // Wires App.startNewClient (existing API; clears the form + resets to step 0).
        expect(html).toContain('onclick="App.startNewClient()"');
    });

    test('acb-fresh-btn has a hover style that signals the destructive action', () => {
        // Shares the base style with .acb-history-btn but the hover uses
        // --warning (amber) instead of --apple-blue to hint at "you're
        // about to wipe the form".
        expect(css).toMatch(/\.acb-fresh-btn:hover[\s\S]*--warning/);
    });
});
