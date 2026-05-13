/**
 * Compliance Dashboard — State Preservation Tests
 *
 * Critical contract: the L&I/CCB tracker added in PR #40 must be PURELY ADDITIVE.
 * Existing user data — verifiedPolicies, dismissedPolicies, snoozedPolicies, policyNotes,
 * sortField, sortDirection, savedSearch, savedFilter, hiddenTypes, notifyTypes — must
 * survive a load/save round-trip exactly as it was, regardless of whether
 * clientCompliance is present in the saved JSON.
 *
 * These tests load js/compliance-dashboard.js into a JSDOM and exercise the load/save
 * path against pre-PR-40 state shapes (no clientCompliance) and post-PR-40 shapes.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');

function loadDashboard() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost/',
        runScripts: 'outside-only'
    });
    const { window } = dom;

    // Stubs for globals the dashboard reads at load time
    window.STORAGE_KEYS = {
        CGL_STATE: 'altech_cgl_state',
        CGL_CACHE: 'altech_cgl_cache'
    };
    window.Utils = {
        escapeHTML: (s) => String(s == null ? '' : s),
        escapeAttr: (s) => String(s == null ? '' : s),
        tryParseLS: (k, fallback) => {
            try {
                const v = window.localStorage.getItem(k);
                return v ? JSON.parse(v) : fallback;
            } catch (e) {
                return fallback;
            }
        },
        debounce: (fn) => fn
    };
    window.CglIDB = {
        setAnnotations: () => Promise.resolve(),
        get: () => Promise.resolve(null),
        set: () => Promise.resolve()
    };
    window.Auth = { apiFetch: () => Promise.resolve({ ok: false, status: 501 }) };
    window.Sync = { schedulePush: () => {} };
    window.App = { toast: () => {} };
    window.AbortSignal = window.AbortSignal || { timeout: () => undefined };

    // Run the dashboard source
    const src = fs.readFileSync(path.join(ROOT, 'js/compliance-dashboard.js'), 'utf8');
    window.eval(src);

    // Disable async storage tiers so tests don't dangle setTimeouts
    const CD = window.ComplianceDashboard;
    CD._kvAvailable = false;       // skips KV checks
    CD.syncStateToDisk = () => {}; // skips disk sync
    CD._syncToKV = () => {};       // skips KV sync

    return { CD, window };
}

describe('CGL Compliance — state preservation across PR #40 (L&I/CCB tracker)', () => {

    test('legacy state (no clientCompliance) loads with all existing fields intact', () => {
        const { CD, window } = loadDashboard();
        const legacyState = {
            verifiedPolicies: {
                'POL-A': { updatedAt: '2026-01-15T10:00:00Z', updatedBy: 'user', expirationDate: '2026-12-31' }
            },
            dismissedPolicies: {
                'POL-B': { dismissedAt: '2026-02-01T09:00:00Z', expirationDate: '2026-03-15', reason: 'superseded' }
            },
            snoozedPolicies: {
                'POL-C': { snoozedUntil: '2099-01-01T00:00:00Z', snoozedCount: 1 }
            },
            policyNotes: {
                'POL-A': {
                    log: [
                        { text: 'Notified insured', at: '2026-01-10T08:00:00Z' },
                        { text: 'Renewal confirmed', at: '2026-01-12T08:00:00Z' }
                    ],
                    stateUpdated: '2026-01-13T09:00:00Z',
                    stateUpdatedForExp: '2026-12-31',
                    renewedTo: 'POL-A2'
                }
            },
            sortField: 'clientName',
            sortDirection: 'desc',
            savedSearch: 'acme',
            savedFilter: 'cgl-only',
            hiddenTypes: ['auto', 'wc'],
            notifyTypes: ['cgl', 'bond'],
            lastSaved: '2026-04-01T12:00:00Z'
            // NOTE: no clientCompliance — this is the pre-PR-40 shape
        };
        window.localStorage.setItem('altech_cgl_state', JSON.stringify(legacyState));

        CD.loadState();

        // All existing fields restored exactly
        expect(CD.verifiedPolicies).toEqual(legacyState.verifiedPolicies);
        expect(CD.dismissedPolicies).toEqual(legacyState.dismissedPolicies);
        expect(CD.snoozedPolicies).toEqual(legacyState.snoozedPolicies);
        expect(CD.policyNotes).toEqual(legacyState.policyNotes);
        expect(CD.sortField).toBe('clientName');
        expect(CD.sortDirection).toBe('desc');
        expect(CD.savedSearch).toBe('acme');
        expect(CD.savedFilter).toBe('cgl-only');
        expect(CD.hiddenTypes).toEqual(['auto', 'wc']);
        expect(CD.notifyTypes).toEqual(['cgl', 'bond']);

        // New field defaults to empty — no migration error
        expect(CD.clientCompliance).toEqual({});
    });

    test('save → load round-trip preserves every existing dictionary verbatim', () => {
        const { CD } = loadDashboard();
        CD.verifiedPolicies = { 'POL-A': { updatedAt: '2026-01-15T10:00:00Z' } };
        CD.dismissedPolicies = { 'POL-B': { dismissedAt: '2026-02-01T09:00:00Z' } };
        CD.snoozedPolicies = { 'POL-C': { snoozedUntil: '2099-01-01T00:00:00Z' } };
        CD.policyNotes = { 'POL-A': { log: [{ text: 'x', at: 'y' }], stateUpdated: 'z' } };
        CD.hiddenTypes = ['auto'];
        CD.notifyTypes = ['cgl', 'bond'];
        CD._stateLoaded = true;

        // First save (writes everything including new clientCompliance: {})
        CD.saveState();

        // Reset and reload from localStorage
        CD.verifiedPolicies = {};
        CD.dismissedPolicies = {};
        CD.snoozedPolicies = {};
        CD.policyNotes = {};
        CD.clientCompliance = {};
        CD.loadState();

        expect(CD.verifiedPolicies).toEqual({ 'POL-A': { updatedAt: '2026-01-15T10:00:00Z' } });
        expect(CD.dismissedPolicies).toEqual({ 'POL-B': { dismissedAt: '2026-02-01T09:00:00Z' } });
        expect(CD.snoozedPolicies).toEqual({ 'POL-C': { snoozedUntil: '2099-01-01T00:00:00Z' } });
        expect(CD.policyNotes).toEqual({ 'POL-A': { log: [{ text: 'x', at: 'y' }], stateUpdated: 'z' } });
    });

    test('markReportedToWA writes ONLY to clientCompliance — never touches existing dicts', () => {
        const { CD } = loadDashboard();
        const originalVerified = { 'POL-A': { updatedAt: '2026-01-15T10:00:00Z' } };
        const originalDismissed = { 'POL-B': { dismissedAt: '2026-02-01T09:00:00Z' } };
        const originalSnoozed = { 'POL-C': { snoozedUntil: '2099-01-01T00:00:00Z' } };
        const originalNotes = { 'POL-A': { log: [{ text: 'preserved', at: 't' }], stateUpdated: 'preserved' } };
        CD.verifiedPolicies = JSON.parse(JSON.stringify(originalVerified));
        CD.dismissedPolicies = JSON.parse(JSON.stringify(originalDismissed));
        CD.snoozedPolicies = JSON.parse(JSON.stringify(originalSnoozed));
        CD.policyNotes = JSON.parse(JSON.stringify(originalNotes));
        CD._stateLoaded = true;
        // Avoid filterPolicies/updateStats (no DOM) — stub them
        CD.filterPolicies = () => {};
        CD.updateStats = () => {};

        CD.markReportedToWA('CLIENT-123', '2026-12-31');

        // The new clientCompliance entry was created
        expect(CD.clientCompliance['CLIENT-123']).toBeDefined();
        expect(CD.clientCompliance['CLIENT-123'].waReportedForExp).toBe('2026-12-31');
        expect(CD.clientCompliance['CLIENT-123'].waReportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

        // Existing dictionaries are untouched
        expect(CD.verifiedPolicies).toEqual(originalVerified);
        expect(CD.dismissedPolicies).toEqual(originalDismissed);
        expect(CD.snoozedPolicies).toEqual(originalSnoozed);
        expect(CD.policyNotes).toEqual(originalNotes);
    });

    test('setClientClassification (manual override) writes ONLY to clientCompliance', () => {
        const { CD } = loadDashboard();
        CD.verifiedPolicies = { 'POL-A': { updatedAt: 'x' } };
        CD.policyNotes = { 'POL-A': { log: [{ text: 'preserved' }] } };
        CD._stateLoaded = true;
        CD.filterPolicies = () => {};
        CD.updateStats = () => {};

        CD.setClientClassification('CLIENT-123', 'exempt');

        expect(CD.clientCompliance['CLIENT-123'].classification).toBe('exempt');
        expect(CD.clientCompliance['CLIENT-123'].classificationSource).toBe('manual');
        expect(CD.verifiedPolicies).toEqual({ 'POL-A': { updatedAt: 'x' } });
        expect(CD.policyNotes).toEqual({ 'POL-A': { log: [{ text: 'preserved' }] } });
    });

    test('clearReportedWA does not delete the clientCompliance entry — only nullifies WA fields', () => {
        const { CD } = loadDashboard();
        CD.clientCompliance['CLIENT-X'] = {
            classification: 'wa-or-contractor',
            classificationSource: 'auto',
            verifiedAt: '2026-04-01T00:00:00Z',
            waLicense: { license: 'WA-12345', status: 'Active' },
            orLicense: { number: 'OR-67890', status: 'Active' },
            waReportedAt: '2026-04-15T00:00:00Z',
            waReportedForExp: '2026-12-31',
            orReportedAt: '2026-04-15T00:00:00Z',
            orReportedForExp: '2026-12-31'
        };
        CD._stateLoaded = true;
        CD.filterPolicies = () => {};
        CD.updateStats = () => {};

        CD.clearReportedWA('CLIENT-X');

        // WA fields cleared
        expect(CD.clientCompliance['CLIENT-X'].waReportedAt).toBeNull();
        expect(CD.clientCompliance['CLIENT-X'].waReportedForExp).toBeNull();
        // OR fields preserved
        expect(CD.clientCompliance['CLIENT-X'].orReportedAt).toBe('2026-04-15T00:00:00Z');
        expect(CD.clientCompliance['CLIENT-X'].orReportedForExp).toBe('2026-12-31');
        // Classification preserved
        expect(CD.clientCompliance['CLIENT-X'].classification).toBe('wa-or-contractor');
        expect(CD.clientCompliance['CLIENT-X'].waLicense).toEqual({ license: 'WA-12345', status: 'Active' });
    });

    test('verifyClient skips clients with manual classification (sticky)', async () => {
        const { CD, window } = loadDashboard();
        CD.clientCompliance['CLIENT-X'] = {
            classification: 'exempt',
            classificationSource: 'manual',
            verifiedAt: '2026-04-01T00:00:00Z'
        };
        CD._stateLoaded = true;

        let apiCalled = false;
        window.Auth.apiFetch = () => { apiCalled = true; return Promise.resolve({ ok: false }); };

        await CD.verifyClient('CLIENT-X', 'Some Business Name');

        // Manual entry preserved exactly — no API call made
        expect(apiCalled).toBe(false);
        expect(CD.clientCompliance['CLIENT-X']).toEqual({
            classification: 'exempt',
            classificationSource: 'manual',
            verifiedAt: '2026-04-01T00:00:00Z'
        });
    });

    test('_hasAnnotationData stays true when only legacy data exists (no clientCompliance)', () => {
        const { CD } = loadDashboard();
        const legacyOnly = {
            verifiedPolicies: { 'POL-A': { updatedAt: 'x' } },
            dismissedPolicies: {},
            policyNotes: {}
            // No clientCompliance
        };
        expect(CD._hasAnnotationData(legacyOnly)).toBe(true);
    });

    test('_hasAnnotationData returns true when only clientCompliance has data', () => {
        const { CD } = loadDashboard();
        const compliancyOnly = {
            verifiedPolicies: {},
            dismissedPolicies: {},
            policyNotes: {},
            clientCompliance: { 'CLIENT-X': { classification: 'wa-contractor' } }
        };
        expect(CD._hasAnnotationData(compliancyOnly)).toBe(true);
    });

    test('_hasAnnotationData false when ALL dictionaries are empty', () => {
        const { CD } = loadDashboard();
        expect(CD._hasAnnotationData({
            verifiedPolicies: {}, dismissedPolicies: {}, policyNotes: {}, clientCompliance: {}
        })).toBe(false);
    });

    test('_getStateSnapshot includes every existing field plus clientCompliance', () => {
        const { CD } = loadDashboard();
        CD.verifiedPolicies = { a: 1 };
        CD.dismissedPolicies = { b: 2 };
        CD.snoozedPolicies = { c: 3 };
        CD.policyNotes = { d: 4 };
        CD.clientCompliance = { e: 5 };
        CD.sortField = 'foo';
        CD.sortDirection = 'asc';
        CD.savedSearch = 'bar';
        CD.savedFilter = 'baz';
        CD.hiddenTypes = ['x'];
        CD.notifyTypes = ['y'];

        const snap = CD._getStateSnapshot();
        expect(snap.verifiedPolicies).toEqual({ a: 1 });
        expect(snap.dismissedPolicies).toEqual({ b: 2 });
        expect(snap.snoozedPolicies).toEqual({ c: 3 });
        expect(snap.policyNotes).toEqual({ d: 4 });
        expect(snap.clientCompliance).toEqual({ e: 5 });
        expect(snap.sortField).toBe('foo');
        expect(snap.sortDirection).toBe('asc');
        expect(snap.savedSearch).toBe('bar');
        expect(snap.savedFilter).toBe('baz');
        expect(snap.hiddenTypes).toEqual(['x']);
        expect(snap.notifyTypes).toEqual(['y']);
        expect(snap.lastSaved).toBeDefined();
    });

    test('isHidden behavior unchanged — only verified/dismissed/snoozed dicts decide', () => {
        const { CD } = loadDashboard();
        CD.verifiedPolicies = { 'POL-V': { updatedAt: 'x' } };
        CD.dismissedPolicies = { 'POL-D': { dismissedAt: 'x' } };
        CD.snoozedPolicies = { 'POL-S': { snoozedUntil: '2099-01-01T00:00:00Z' } };
        CD.clientCompliance = {
            'CLIENT-V': { classification: 'wa-contractor', waReportedForExp: '2026-12-31' }
        };

        expect(CD.isHidden('POL-V')).toBe(true);
        expect(CD.isHidden('POL-D')).toBe(true);
        expect(CD.isHidden('POL-S')).toBe(true);
        expect(CD.isHidden('POL-OTHER')).toBe(false);
        // clientCompliance must NEVER affect isHidden — policies stay visible regardless of L&I/CCB state
    });

    test('needsLIReport / needsCCBReport are FALSE for non-applicable types (bonds, auto, wc, etc.)', () => {
        const { CD } = loadDashboard();
        CD.clientCompliance['CLIENT-1'] = {
            classification: 'wa-or-contractor',
            classificationSource: 'auto',
            waReportedForExp: null,
            orReportedForExp: null
        };
        const bondPolicy = { policyType: 'bond', clientNumber: 'CLIENT-1', expirationDate: '2026-12-31' };
        const autoPolicy = { policyType: 'auto', clientNumber: 'CLIENT-1', expirationDate: '2026-12-31' };
        const wcPolicy = { policyType: 'wc', clientNumber: 'CLIENT-1', expirationDate: '2026-12-31' };
        const cglPolicy = { policyType: 'cgl', clientNumber: 'CLIENT-1', expirationDate: '2026-12-31' };

        expect(CD.needsLIReport(bondPolicy)).toBe(false);  // bonds never need L&I report
        expect(CD.needsLIReport(autoPolicy)).toBe(false);
        expect(CD.needsLIReport(wcPolicy)).toBe(false);
        expect(CD.needsLIReport(cglPolicy)).toBe(true);    // CGL contractor → yes

        expect(CD.needsCCBReport(bondPolicy)).toBe(false);
        expect(CD.needsCCBReport(cglPolicy)).toBe(true);
    });

    test('needsLIReport flips back to TRUE on renewal (expiration date change)', () => {
        const { CD } = loadDashboard();
        CD.clientCompliance['CLIENT-1'] = {
            classification: 'wa-contractor',
            classificationSource: 'auto',
            waReportedForExp: '2026-12-31'  // reported for old expiration
        };
        const oldPolicy = { policyType: 'cgl', clientNumber: 'CLIENT-1', expirationDate: '2026-12-31' };
        const renewedPolicy = { policyType: 'cgl', clientNumber: 'CLIENT-1', expirationDate: '2027-12-31' };

        expect(CD.needsLIReport(oldPolicy)).toBe(false);     // matches reported expiration
        expect(CD.needsLIReport(renewedPolicy)).toBe(true);  // new expiration → needs re-report
    });

    test('verifyClient skips when classification was set within retry window (24h)', async () => {
        const { CD, window } = loadDashboard();
        const recentISO = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1h ago
        CD.clientCompliance['CLIENT-X'] = {
            classification: 'exempt',
            classificationSource: 'auto',
            verifiedAt: recentISO
        };
        CD._stateLoaded = true;

        let apiCalled = false;
        window.Auth.apiFetch = () => { apiCalled = true; return Promise.resolve({ ok: false }); };

        await CD.verifyClient('CLIENT-X', 'ABC Co');

        expect(apiCalled).toBe(false);
        expect(CD.clientCompliance['CLIENT-X'].classification).toBe('exempt');
    });
});
