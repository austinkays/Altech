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
        // Grab a generous slice — the overlay is well under 12k chars.
        return indexHtml.slice(start, start + 12000);
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

    test('SecurityInfo exposes open/close/print; print scopes + forces detail open', () => {
        const mod = bootJs.match(/window\.SecurityInfo = \(\(\) => \{[\s\S]*?\}\)\(\);/);
        expect(mod).not.toBeNull();
        const m = mod[0];
        expect(m).toMatch(/return \{ open, close, print \};/);
        expect(m).toMatch(/secinfo-printing/);
        expect(m).toMatch(/\.secinfo-tech/);
        expect(m).toMatch(/tech\.open = true/);
        expect(m).toMatch(/addEventListener\('afterprint'/);
        // The print button must call it.
        expect(overlay).toMatch(/onclick="SecurityInfo\.print\(\)"/);
    });

    test('print stylesheet is scoped so it never leaks into normal viewing', () => {
        expect(css).toMatch(/@media print/);
        // Every print rule must be gated on body.secinfo-printing — otherwise
        // it would hide the whole app on any unrelated window.print().
        const printBlock = css.slice(css.indexOf('@media print'));
        expect(printBlock).toMatch(/body\.secinfo-printing > \*:not\(#securityInfoOverlay\)/);
        expect(printBlock).toMatch(/body\.secinfo-printing \.secinfo-tech \.secinfo-tech-body \{ display: block/);
    });
});
