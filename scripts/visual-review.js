// Visual review script — captures screenshots of all major pages/plugins
// Uses App.navigateTo() after boot to properly switch plugins
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8000';
const OUT = './scripts/screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const PLUGINS = [
    { name: '03-quoting',     key: 'quoting' },
    { name: '04-intake',      key: 'intake' },
    { name: '05-ezlynx',      key: 'ezlynx' },
    { name: '06-hawksoft',    key: 'hawksoft' },
    { name: '07-compliance',  key: 'compliance' },
    { name: '08-reminders',   key: 'reminders' },
    { name: '09-calllogger',  key: 'calllogger' },
    { name: '10-accounting',  key: 'accounting' },
    { name: '11-quickref',    key: 'quickref' },
    { name: '12-prospect',    key: 'prospect' },
    { name: '13-email',       key: 'email' },
    { name: '14-vindecoder',  key: 'vindecoder' },
    { name: '15-quotecompare',key: 'quotecompare' },
];

async function bootPage(browser, viewport) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();

    // Hide auth modal and onboarding before scripts run
    await page.addInitScript(() => {
        // Mock Firebase Auth so app thinks user is signed in (avoid auth modal)
        window.__mockFirebaseSignedIn = true;
    });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // Wait for App.boot to finish
    await page.waitForFunction(() => typeof window.App !== 'undefined' && typeof window.App.navigateTo === 'function', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // Mock Auth.user so the auth gate passes, and dismiss any modals
    await page.evaluate(() => {
        // Patch Auth to appear signed in — 'user' is a getter so we need defineProperty
        if (typeof window.Auth !== 'undefined') {
            const mockUser = { uid: 'preview-user', email: 'preview@altech.local', displayName: 'Preview User', emailVerified: true };
            try {
                Object.defineProperty(window.Auth, 'user', { get: () => mockUser, configurable: true });
                Object.defineProperty(window.Auth, 'isSignedIn', { get: () => true, configurable: true });
            } catch(e) {}
            // Make Auth.ready() resolve immediately with the mock user
            window.Auth.ready = () => Promise.resolve(mockUser);
        }
        // Dismiss modals
        const modal = document.getElementById('authModal');
        if (modal) modal.style.display = 'none';
        const onboard = document.getElementById('onboardingOverlay');
        if (onboard) onboard.style.display = 'none';
        const paywall = document.getElementById('paywallModal');
        if (paywall) paywall.style.display = 'none';
    });

    return { page, ctx };
}

const browser = await chromium.launch({ headless: true });

// ---- DESKTOP screenshots ----
const { page, ctx } = await bootPage(browser, { width: 1440, height: 900 });

// 01 — Dashboard (light default)
{
    const file = path.join(OUT, '01-dashboard.png');
    await page.screenshot({ path: file });
    console.log('✅ 01-dashboard');
}

// 02 — Dashboard dark
{
    await page.evaluate(() => document.body.classList.add('dark-mode'));
    await page.waitForTimeout(300);
    const file = path.join(OUT, '02-dashboard-dark.png');
    await page.screenshot({ path: file });
    await page.evaluate(() => document.body.classList.remove('dark-mode'));
    console.log('✅ 02-dashboard-dark');
}

// Navigate to each plugin in the same page context
for (const pg of PLUGINS) {
    await page.evaluate((key) => { App.navigateTo(key); }, pg.key);
    await page.waitForTimeout(2000);
    // Dismiss any auth modal that appeared
    await page.evaluate(() => {
        const modal = document.getElementById('authModal');
        if (modal) modal.style.display = 'none';
    });
    const file = path.join(OUT, `${pg.name}.png`);
    await page.screenshot({ path: file });
    console.log(`✅ ${pg.name}`);
}

await ctx.close();

// ---- MOBILE screenshot ----
const { page: mob, ctx: mobCtx } = await bootPage(browser, { width: 375, height: 812 });
await mob.evaluate(() => {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
});
await mob.screenshot({ path: path.join(OUT, '16-dashboard-mobile.png') });
console.log('✅ 16-dashboard-mobile');
await mob.evaluate((key) => { App.navigateTo(key); }, 'quoting');
await mob.waitForTimeout(2000);
await mob.screenshot({ path: path.join(OUT, '17-quoting-mobile.png') });
console.log('✅ 17-quoting-mobile');
await mobCtx.close();

await browser.close();
console.log('\nDone. Screenshots saved to scripts/screenshots/');
