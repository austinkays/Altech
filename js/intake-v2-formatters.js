// intake-v2-formatters.js — input-time auto-formatters for the v2 intake.
//
// Each formatter is a pure (string) → string transform. The renderer stamps
// `data-iv2-format="<name>"` on inputs that opt in; a delegated capture-phase
// `input` listener (wired in intake-v2-layout.js) applies the formatter to
// the keystroke BEFORE the bubble-phase save listener in intake-v2-core.js
// reads `el.value`, so the value persisted to data is the formatted form.
//
// Why save the formatted value rather than the raw digits:
//   - CMSMTF / EZLynx / PDF exports all expect the agent-friendly format
//     (e.g. "(555) 123-4567" for phone, "12345-6789" for ZIP+4). Storing the
//     formatted string keeps the exporters simple.
//   - Reload round-trips correctly — the input shows what the user typed.
//   - If a downstream consumer needs digits only, they can strip non-digits
//     trivially. Going the other way (parsing arbitrary user input) is the
//     painful case we already had.
//
// Cursor handling is deliberately simple: after rewriting `el.value`, the
// browser drops the cursor at the end. Users type these fields linearly in
// almost all cases (phone, ZIP, VIN, plate, DL), so we don't bother
// preserving caret position mid-string.

'use strict';

(function () {

function phone(value) {
    // Strip everything that isn't a digit and cap at 10 — US/CA NANP format.
    const d = (value || '').replace(/\D/g, '').slice(0, 10);
    if (!d) return '';
    if (d.length <= 3) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function vin(value) {
    // VINs are 17 chars: A-Z (excluding I, O, Q to avoid confusion with
    // 1/0) plus 0-9. Force uppercase, strip whitespace + illegal letters,
    // cap at 17.
    return (value || '')
        .toUpperCase()
        .replace(/[^A-HJ-NPR-Z0-9]/g, '')
        .slice(0, 17);
}

function plate(value) {
    // Most US plates: A-Z + 0-9 + occasional space/dash. Strip everything
    // else, force uppercase, cap at 10 (longest US plate is 8 chars; some
    // states use 10 with special formats).
    return (value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\-\s]/g, '')
        .slice(0, 10);
}

function dl(value) {
    // DL numbers vary wildly by state: digits only (CA), letters + digits
    // (WA), some include dashes. Force uppercase, strip illegal chars,
    // cap at 25 (longest known format).
    return (value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\*\-]/g, '')
        .slice(0, 25);
}

function zip(value) {
    // US ZIP: 5 digits OR 5+4 with a dash. Strip non-digits, format as
    // 12345 or 12345-6789 depending on length.
    const d = (value || '').replace(/\D/g, '').slice(0, 9);
    if (!d) return '';
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function apply(name, value) {
    const fn = { phone, vin, plate, dl, zip }[name];
    return fn ? fn(value) : value;
}

window.IntakeV2Formatters = { phone, vin, plate, dl, zip, apply };

})();
