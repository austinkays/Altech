/**
 * Regression coverage for the reminders enhancements:
 *   - dueTime: optional HH:MM that flips "due-today" → "overdue" when passed
 *   - frequency: 'every-n-days' + companion everyNDays integer
 *   - undoComplete: 5-second undo window with pre-completion dueDate restore
 *
 * Most assertions are source-level so we don't have to stand up the full
 * Reminders module against the real localStorage / DOM stack — the parts
 * that NEED runtime (dueTime normalization, _addMonthsClamped) are exercised
 * by extracting individual functions and calling them directly.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SRC = readSrc('js/reminders.js');

/** Extract a top-level `function NAME(...)` body and turn it into a runnable fn. */
function extractFn(name, argNames) {
    const re = new RegExp(`function ${name}\\(([^)]*)\\) \\{([\\s\\S]+?)\\n    \\}`);
    const m = SRC.match(re);
    if (!m) throw new Error(`Could not extract ${name}() from reminders.js`);
    const argList = argNames || m[1];
    // eslint-disable-next-line no-new-func
    return new Function(...argList.split(',').map(s => s.trim()).filter(Boolean), m[2]);
}

// ── dueTime ──────────────────────────────────────────────────────────────

describe('dueTime — HH:MM normalization', () => {
    const normalize = extractFn('_normalizeTime', 'value');

    test('passes through 24-hour HH:MM', () => {
        expect(normalize('13:45')).toBe('13:45');
        expect(normalize('00:00')).toBe('00:00');
        expect(normalize('23:59')).toBe('23:59');
        expect(normalize('9:00')).toBe('09:00');
    });

    test('converts 12-hour with AM/PM', () => {
        expect(normalize('1:30 PM')).toBe('13:30');
        expect(normalize('12:00 AM')).toBe('00:00');
        expect(normalize('12:30 PM')).toBe('12:30');
        expect(normalize('11:59 pm')).toBe('23:59');
    });

    test('returns null for empty / garbage', () => {
        expect(normalize('')).toBeNull();
        expect(normalize(null)).toBeNull();
        expect(normalize(undefined)).toBeNull();
        expect(normalize('garbage')).toBeNull();
        expect(normalize('25:00')).toBeNull();
        expect(normalize('12:60 AM')).toBeNull();
    });
});

describe('_getStatus respects dueTime via _isTimePassedToday', () => {
    // _isTimePassedToday calls _nowPST(); we can't easily stub that without
    // the full module. Instead test the deterministic logic: parse HH:MM,
    // compare to a known "now" minutes value.
    test('source: _getStatus checks dueTime before returning due-today', () => {
        expect(SRC).toMatch(/if\s*\(task\.dueTime\s*&&\s*_isTimePassedToday\(task\.dueTime\)\)\s*return\s*'overdue'/);
    });

    test('source: status label appends " @ <12h>" when dueTime is set', () => {
        expect(SRC).toMatch(/atTime\s*=\s*task\.dueTime\s*\?\s*` @ \$\{_format12hour\(task\.dueTime\)\}`/);
    });

    test('_format12hour handles AM/PM rollovers', () => {
        const fmt = extractFn('_format12hour', 'timeStr');
        // Inlined dep — normalization passes through 24h values.
        global._normalizeTime = extractFn('_normalizeTime', 'value');
        try {
            expect(fmt('00:00')).toBe('12:00 AM');
            expect(fmt('12:00')).toBe('12:00 PM');
            expect(fmt('13:05')).toBe('1:05 PM');
            expect(fmt('09:30')).toBe('9:30 AM');
        } finally {
            delete global._normalizeTime;
        }
    });
});

// ── every-n-days ─────────────────────────────────────────────────────────

describe('frequency: every-n-days', () => {
    test('_getNextDueDate advances by everyNDays in the loop', () => {
        // Source guard — the loop body must include the new branch.
        expect(SRC).toMatch(/freq === ['"]every-n-days['"]\)/);
        expect(SRC).toMatch(/next\.setDate\(next\.getDate\(\) \+ n\)/);
    });

    test('_autoAdvanceRecurring fast-forwards stale every-n-days tasks', () => {
        // The autoAdvance path walks the dueDate forward in N-day steps so a
        // 30-day-cycle task that's 60 days stale lands at "today" not "60 days ago".
        const block = SRC.slice(SRC.indexOf('function _autoAdvanceRecurring'));
        expect(block.slice(0, 3000)).toMatch(/while \(tmp < today\) tmp\.setDate\(tmp\.getDate\(\) \+ n\)/);
    });

    test('addTask stamps everyNDays only when frequency is every-n-days', () => {
        const block = SRC.slice(SRC.indexOf('function addTask(title, options'));
        expect(block.slice(0, 2000)).toMatch(/options\.frequency === ['"]every-n-days['"]/);
        expect(block.slice(0, 2000)).toMatch(/Math\.max\(1, Math\.floor\(options\.everyNDays\)\)/);
    });

    test('updateTask scrubs everyNDays when frequency moves off every-n-days', () => {
        const block = SRC.slice(SRC.indexOf('function updateTask(id, updates)'));
        expect(block.slice(0, 1500)).toMatch(/updates\.frequency\s*&&\s*updates\.frequency\s*!==\s*['"]every-n-days['"]/);
        expect(block.slice(0, 1500)).toMatch(/updates\.everyNDays\s*=\s*null/);
    });

    test('saveEdit refuses non-integer / zero / missing every-n-days input', () => {
        const block = SRC.slice(SRC.indexOf('function saveEdit'));
        expect(block.slice(0, 2500)).toContain("frequency === 'every-n-days'");
        expect(block.slice(0, 2500)).toMatch(/!Number\.isFinite\(n\)\s*\|\|\s*n\s*<\s*1\s*\|\|\s*Math\.floor\(n\)\s*!==\s*n/);
        expect(block.slice(0, 2500)).toMatch(/Pick a whole number.*Every N days/);
    });
});

// ── undo toast ───────────────────────────────────────────────────────────

describe('undoComplete — 5-second undo window', () => {
    test('toggle snapshots the pre-completion dueDate before calling completeTask', () => {
        const block = SRC.slice(SRC.indexOf('function toggle(id)'));
        expect(block.slice(0, 1000)).toMatch(/const\s+preCompleteDueDate\s*=\s*task\.dueDate/);
        expect(block.slice(0, 1000)).toContain('completeTask(id)');
        expect(block.slice(0, 1000)).toContain('_showUndoToast(id, title, preCompleteDueDate)');
    });

    test('_showUndoToast uses App.toast with useHtml=true', () => {
        const block = SRC.slice(SRC.indexOf('function _showUndoToast'));
        // HTML rendering must be on so the button is clickable.
        expect(block.slice(0, 1500)).toMatch(/App\.toast\(msg,\s*\{[^}]*type:\s*['"]success['"]/);
        expect(block.slice(0, 1500)).toMatch(/App\.toast\(msg,\s*\{[^}]*\},\s*true\)/);
        // Escapes the title against Utils.escapeHTML before interpolating into the button.
        expect(block.slice(0, 1500)).toContain('Utils.escapeHTML');
        // 5-second expiry — the toast duration must match.
        expect(block.slice(0, 1500)).toContain('expiresAt: Date.now() + 5000');
        expect(block.slice(0, 1500)).toContain('duration: 5000');
    });

    test('undoComplete is no-op after the 5s window expires', () => {
        const block = SRC.slice(SRC.indexOf('function undoComplete'));
        expect(block.slice(0, 1500)).toMatch(/Date\.now\(\)\s*>\s*_pendingUndo\.expiresAt/);
    });

    test('undoComplete pops the completion AND restores the pre-completion dueDate', () => {
        const block = SRC.slice(SRC.indexOf('function undoComplete'));
        expect(block.slice(0, 1500)).toContain('task.completions.pop()');
        expect(block.slice(0, 1500)).toMatch(/task\.dueDate\s*=\s*_pendingUndo\.preCompleteDueDate/);
    });

    test('undoComplete is exported on the public surface', () => {
        // The plugin HTML wires onclick="Reminders.undoComplete('${id}')" — the
        // export must exist or every undo click is a silent no-op.
        expect(SRC).toMatch(/^\s+undoComplete,/m);
    });
});

// ── modal HTML wiring ────────────────────────────────────────────────────

describe('reminders.html — new inputs', () => {
    const html = readSrc('plugins/reminders.html');

    test('time-of-day input exists with type=time', () => {
        expect(html).toMatch(/<input\s+type="time"\s+id="remEditDueTime"/);
    });

    test('every-N-days field has min=1, step=1 and is hidden until selected', () => {
        expect(html).toMatch(/id="remEditEveryNRow"[^>]*style="display:none/);
        expect(html).toMatch(/<input\s+type="number"\s+id="remEditEveryN"[^>]*min="1"[^>]*step="1"/);
    });

    test('frequency select wires onchange to Reminders._syncFreqDependentFields', () => {
        expect(html).toMatch(/<select\s+id="remEditFrequency"[^>]*onchange="Reminders\._syncFreqDependentFields\(\)"/);
        expect(html).toContain('<option value="every-n-days">');
    });
});
