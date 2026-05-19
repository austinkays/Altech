/**
 * Regression coverage for the Security & Data Protection page.
 *
 * This page is shown to auditors / IT to demonstrate how the application
 * stores and encrypts data. Two failure modes must never silently recur:
 *
 *   1. STALE / FALSE CLAIMS — the modal used to assert Firebase Auth +
 *      "Multi-tenant Firestore rules" + "TLS 1.3". Firebase was removed
 *      (Supabase is the sole backend) and the app does not control the TLS
 *      version, so those are now false. An auditor-facing page asserting
 *      false controls is worse than no page. These tests fail the build if
 *      the stale claims come back or the real controls disappear.
 *   2. BROKEN ENTRY POINT — the page must stay reachable from the header
 *      padlock and the print/close wiring must stay intact.
 *
 * Source-text assertions (no DOM/Redis/network), mirroring the
 * kv-store-cache-miss / cgl-cache-cron-warm regression style.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Security & Data Protection page — accurate, reachable, printable', () => {
    const indexHtml   = readSrc('index.html');
    const dashboardJs = readSrc('js/dashboard-widgets.js');
    const bootJs      = readSrc('js/app-boot.js');
    const css         = readSrc('css/security-info.css');

    // Isolate just the security overlay markup so assertions don't match
    // unrelated parts of index.html.
    const overlay = (() => {
        const start = indexHtml.indexOf('id="securityInfoOverlay"');
        expect(start).toBeGreaterThan(-1);
        // Bound the slice precisely to the modal: the next box-drawing
        // banner comment ("PLUGIN VIEWPORT") immediately follows the
        // overlay, so cutting there keeps unrelated index.html copy (which
        // legitimately uses em dashes) out of these assertions.
        const end = indexHtml.indexOf('<!-- ╔', start);
        return indexHtml.slice(start, end > start ? end : start + 12000);
    })();

    test('no stale Firebase / Firestore / TLS-version claims remain', () => {
        expect(overlay).not.toMatch(/Firebase/i);
        expect(overlay).not.toMatch(/Firestore/i);
        // The app cannot assert a specific TLS version — HSTS is the real,
        // code-enforced transport control.
        expect(overlay).not.toMatch(/TLS\s*1\.3/i);
    });

    test('states the real backend + isolation model (Supabase RLS, per-row)', () => {
        expect(overlay).toMatch(/Supabase/);
        expect(overlay).toMatch(/Row[‑-]Level Security/i);
        expect(overlay).toMatch(/PostgreSQL/);
        // The self-checking migration + operator verification are concrete,
        // auditable controls — keep them described.
        expect(overlay).toMatch(/self[‑-]checking database migration/i);
        expect(overlay).toMatch(/cross[‑-]user reads return/i);
    });

    test('states the real crypto: AES-256-GCM, Argon2id, PBKDF2, HKDF, per-user MK', () => {
        expect(overlay).toMatch(/AES[‑-]256[‑-]GCM/);
        expect(overlay).toMatch(/Argon2id/);
        expect(overlay).toMatch(/PBKDF2[‑-]SHA[‑-]256/);
        expect(overlay).toMatch(/600,000 iterations/);
        expect(overlay).toMatch(/HKDF[‑-]SHA[‑-]256/);
        expect(overlay).toMatch(/never sent to the server/i);
    });

    test('states real auth + MFA (Supabase Auth, TOTP, WebAuthn passkeys)', () => {
        expect(overlay).toMatch(/Supabase Auth/);
        expect(overlay).toMatch(/TOTP/);
        expect(overlay).toMatch(/WebAuthn passkeys/i);
        expect(overlay).toMatch(/verified server[‑-]side on each request/i);
    });

    test('lists the real, code-enforced security headers with exact values', () => {
        expect(overlay).toMatch(/max-age=31536000; includeSubDomains/);
        expect(overlay).toMatch(/default-src 'self'/);
        expect(overlay).toMatch(/X[‑-]Frame[‑-]Options[\s\S]{0,40}DENY/);
        expect(overlay).toMatch(/camera=\(\), microphone=\(\), geolocation=\(\)/);
    });

    test('honest scope disclaimer — describes the build, not a certification', () => {
        expect(overlay).toMatch(/not an independent audit or (a )?(compliance )?certification/i);
        // Must not imply a certification it does not hold.
        expect(overlay).not.toMatch(/SOC ?2|ISO ?27001|HIPAA[\s-]?compliant|PCI[\s-]?DSS/i);
    });

    test('summary-first, with a collapsible technical section for auditors', () => {
        expect(overlay).toMatch(/class="secinfo-tech"/);
        expect(overlay).toMatch(/<summary[^>]*>[\s\S]*?Technical detail \(for IT \/ auditors\)/);
        expect(overlay).toMatch(/In plain language/);
    });

    test('reachable from the header padlock (between night-mode and account)', () => {
        // The lock button must sit in the sidebar footer actions, wired to
        // SecurityInfo.open(), using the padlock icon.
        const footer = dashboardJs.match(/sidebar-footer-actions[\s\S]{0,900}?<\/button>\s*<\/div>/);
        expect(footer).not.toBeNull();
        const block = footer[0];
        expect(block).toMatch(/onclick="SecurityInfo\.open\(\)"/);
        expect(block).toMatch(/icon\('lock', 18\)/);
        // Ordering: moon (night mode) → lock → user (account).
        const iMoon = block.indexOf("icon('moon'");
        const iLock = block.indexOf("icon('lock'");
        const iUser = block.indexOf("icon('user'");
        expect(iMoon).toBeGreaterThan(-1);
        expect(iLock).toBeGreaterThan(iMoon);
        expect(iUser).toBeGreaterThan(iLock);
    });

    test('SecurityInfo print cleanup is afterprint-driven, NOT a premature timer', () => {
        const mod = bootJs.match(/window\.SecurityInfo = \(\(\) => \{[\s\S]*?\}\)\(\);/);
        expect(mod).not.toBeNull();
        const m = mod[0];
        expect(m).toMatch(/return \{ open, close, print \};/);
        expect(m).toMatch(/secinfo-printing/);
        expect(m).toMatch(/tech\.open = true/);
        expect(m).toMatch(/addEventListener\('afterprint'/);
        // Regression: the old setTimeout(…, 2000) fallback stripped the print
        // class while a "Save as PDF" dialog was still open (those take
        // >2 s) → blank page. There must be no short timer racing the dialog.
        expect(m).not.toMatch(/setTimeout\([^)]*,\s*\d{3,4}\s*\)/);
        // A window-focus backstop is allowed (only fires once the dialog
        // closes, never while it is open).
        expect(m).toMatch(/addEventListener\('focus'/);
        // The print button must call it.
        expect(overlay).toMatch(/onclick="SecurityInfo\.print\(\)"/);
    });

    test('print isolation is visibility-based, scoped, and survives task-sheet', () => {
        expect(css).toMatch(/@media print/);
        const printBlock = css.slice(css.indexOf('@media print'));
        // Robust "print only this subtree": blank everything via visibility
        // (a foreign display:none can't collapse it away), re-show only the
        // overlay subtree. This replaced the brittle display:none-siblings
        // approach that lost the specificity/timing fight and printed blank.
        expect(printBlock).toMatch(/body\.secinfo-printing \*\s*\{\s*visibility:\s*hidden\s*!important/);
        expect(printBlock).toMatch(/body\.secinfo-printing #securityInfoOverlay \*[\s\S]{0,80}visibility:\s*visible\s*!important/);
        // Must still force the overlay's own display (id-specificity beats
        // task-sheet's `body > *:not(.app-shell){display:none!important}`).
        expect(printBlock).toMatch(/body\.secinfo-printing #securityInfoOverlay \{[\s\S]*?display:\s*block\s*!important/);
        // The brittle, unscoped-prone `body > *` sibling-hide must NOT come
        // back as an actual rule — that's the pattern (in task-sheet.css)
        // that caused the blank page. Strip comments first so the rationale
        // comment (which quotes the anti-pattern) doesn't trip this.
        const printRulesOnly = printBlock.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(printRulesOnly).not.toMatch(/\bbody\s*>\s*\*/);
        expect(printBlock).toMatch(/body\.secinfo-printing \.secinfo-tech \.secinfo-tech-body \{ display: block/);
    });

    test('task-sheet global print rule no longer blanks the security page', () => {
        // task-sheet.css ships an UNSCOPED @media print rule. It must
        // exclude #securityInfoOverlay or it hides the page on every print.
        const ts = readSrc('css/task-sheet.css');
        const tsPrint = ts.slice(ts.indexOf('@media print'));
        expect(tsPrint).toMatch(/body > \*:not\(\.app-shell\):not\(#securityInfoOverlay\)/);
    });

    test('correct contact email (altechinsurance.com), not the old domain', () => {
        expect(overlay).toMatch(/mailto:austin@altechinsurance\.com/);
        expect(overlay).toMatch(/>austin@altechinsurance\.com</);
        // The old address must not linger anywhere in the page.
        expect(overlay).not.toMatch(/austin@altech\.agency/);
    });

    test('no em dashes in the security page (style requirement)', () => {
        // Auditor-facing copy must read clean — no — (U+2014) or its HTML
        // entities. Hyphens in compounds (e.g. "AES-256-GCM") are fine.
        expect(overlay).not.toMatch(/—/);          // em dash char
        expect(overlay).not.toMatch(/&mdash;|&#8212;|&#x2014;/i); // entities
    });
});
