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

    test('SecurityInfo print cleanup is afterprint-ONLY (no early-fire backstop)', () => {
        const mod = bootJs.match(/window\.SecurityInfo = \(\(\) => \{[\s\S]*?\}\)\(\);/);
        expect(mod).not.toBeNull();
        const m = mod[0];
        expect(m).toMatch(/return \{ open, close, print \};/);
        expect(m).toMatch(/secinfo-printing/);
        expect(m).toMatch(/tech\.open = true/);
        // afterprint is the ONLY cleanup signal — it's the only event that
        // fires AFTER the PDF rasterizes.
        expect(m).toMatch(/addEventListener\('afterprint'/);
        // Regression guards: every "fire early" backstop blanked the export
        // by stripping body.secinfo-printing before rasterization.
        //  - the 2 s setTimeout ("Save as PDF" stays open >2 s)
        //  - the window `focus` listener (focus returns when the print
        //    PREVIEW opens, well before "Save as PDF" writes the file)
        // Strip comments first so the rationale above (which names the
        // banned patterns) doesn't trip these.
        const codeOnly = m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(codeOnly).not.toMatch(/setTimeout\s*\(/);
        expect(codeOnly).not.toMatch(/addEventListener\(\s*['"]focus['"]/);
        // The print button must call it.
        expect(overlay).toMatch(/onclick="SecurityInfo\.print\(\)"/);
    });

    test('print() hoists a nested overlay to <body> for isolation, then restores', () => {
        // Source-string regression: the print rule
        // `body.secinfo-printing > *:not(#securityInfoOverlay){display:none}`
        // only works if #securityInfoOverlay is a direct body child. At
        // runtime the overlay lives inside an app-shell wrapper, so print()
        // must hoist it to <body> for the print and put it back after.
        const mod = bootJs.match(/window\.SecurityInfo = \(\(\) => \{[\s\S]*?\}\)\(\);/);
        const m = mod[0];
        expect(m).toMatch(/origParent\s*=\s*o\.parentNode/);
        expect(m).toMatch(/origParent\s*!==\s*document\.body/);
        expect(m).toMatch(/document\.body\.appendChild\(o\)/);
        // Restore must use the original next sibling so order is preserved.
        expect(m).toMatch(/origParent\.insertBefore\(o,\s*origNextSibling\)/);
        expect(m).toMatch(/origParent\.appendChild\(o\)/);
    });

    test('behavioral: print() with overlay nested under a wrapper hoists + restores', () => {
        // Build a JSDOM that mirrors the live DOM (overlay nested inside a
        // wrapper, NOT a direct body child) and prove the hoist/restore
        // round-trip actually executes against a real DOM.
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(
            '<!DOCTYPE html><html><body>' +
            '<div id="wrapper">' +
            '<div id="securityInfoOverlay" style="display:flex">' +
            '<div class="secinfo-modal">content</div>' +
            '</div>' +
            '</div>' +
            '</body></html>',
            { url: 'http://localhost/', runScripts: 'outside-only' }
        );
        const { window } = dom;
        let printCalled = 0;
        window.print = () => { printCalled++; };
        // Eval JUST the SecurityInfo IIFE inside the test window.
        const iife = bootJs.match(/window\.SecurityInfo = \(\(\) => \{[\s\S]*?\}\)\(\);/)[0];
        window.eval(iife);

        const o = window.document.getElementById('securityInfoOverlay');
        const wrapper = window.document.getElementById('wrapper');

        // Pre-print: overlay is nested inside the wrapper, not body.
        expect(o.parentElement).toBe(wrapper);

        window.SecurityInfo.print();

        // Mid-print: overlay must be a direct body child so the @media
        // print isolation actually applies to it (not its wrapper).
        expect(o.parentElement).toBe(window.document.body);
        expect(window.document.body.classList.contains('secinfo-printing')).toBe(true);
        expect(printCalled).toBe(1);

        // Fire afterprint to simulate the dialog closing.
        window.dispatchEvent(new window.Event('afterprint'));

        // Post-print: overlay restored under its original wrapper and
        // body.secinfo-printing cleared.
        expect(o.parentElement).toBe(wrapper);
        expect(window.document.body.classList.contains('secinfo-printing')).toBe(false);
    });

    test('print isolation collapses siblings (no blank pages) + scoped + survives task-sheet', () => {
        expect(css).toMatch(/@media print/);
        const printBlock = css.slice(css.indexOf('@media print'));
        // Isolate the sibling-hide rule (scoped to the print body class,
        // overlay excluded).
        const sib = printBlock.match(
            /body\.secinfo-printing > \*:not\(#securityInfoOverlay\)[^{]*\{[^}]*\}/
        );
        expect(sib).not.toBeNull();
        // REGRESSION: siblings must be display:none, NOT merely
        // visibility:hidden. visibility:hidden keeps the layout box, so the
        // whole app's height spilled ~6 blank trailing pages after the
        // content. display:none collapses them → no blank pages.
        expect(sib[0]).toMatch(/display:\s*none\s*!important/);
        // The overlay must be shown AND position:static so multi-page
        // content paginates (absolute/fixed mis-paginates or clips).
        const ov = printBlock.match(
            /body\.secinfo-printing #securityInfoOverlay \{[^}]*\}/
        );
        expect(ov).not.toBeNull();
        expect(ov[0]).toMatch(/display:\s*block\s*!important/);
        expect(ov[0]).toMatch(/position:\s*static\s*!important/);
        expect(ov[0]).not.toMatch(/position:\s*(absolute|fixed)/);
        // Overlay subtree stays visible (backstop against a foreign rule).
        expect(printBlock).toMatch(/body\.secinfo-printing #securityInfoOverlay \*[\s\S]{0,80}visibility:\s*visible\s*!important/);
        // The brittle UNSCOPED `body > *` sibling-hide (task-sheet's
        // anti-pattern) must never appear here. Strip comments first so the
        // rationale comment quoting it doesn't trip this; our rule is
        // `body.secinfo-printing > *` which is correctly scoped.
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
