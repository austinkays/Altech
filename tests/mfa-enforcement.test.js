'use strict';

/**
 * tests/mfa-enforcement.test.js
 *
 * Integration tests for the MFA gate in js/sync-facade.js. The gate lives on
 * window.Sync (the Phase 2+3 router) and blocks every Supabase write until
 * the signed-in user has a verified TOTP factor. Opt-out users
 * (CLOUD_SYNC_DISABLED=true) are exempt — their schedulePush still calls
 * through. On the Firebase path, the gate is inert regardless of flags.
 *
 * We load supabase-auth + supabase-sync + sync-facade in the Node global
 * context against the same in-memory mock used by tests/supabase-sync.test.js,
 * extended with a full auth + MFA surface.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const storageKeysSrc   = fs.readFileSync(path.join(ROOT, 'js', 'storage-keys.js'), 'utf8');
const utilsSrc         = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
const supabaseSyncSrc  = fs.readFileSync(path.join(ROOT, 'js', 'supabase-sync.js'), 'utf8');
const supabaseAuthSrc  = fs.readFileSync(path.join(ROOT, 'js', 'supabase-auth.js'), 'utf8');
const syncFacadeSrc    = fs.readFileSync(path.join(ROOT, 'js', 'sync-facade.js'), 'utf8');

// ── Mock Supabase client ────────────────────────────────────────────────

function createMockSupabase() {
    const users = [];
    const factors = [];
    const challenges = [];
    const rows = { user_blobs: [], user_quotes: [] };
    let session = null;
    let authListeners = [];

    function _authUid() { return session && session.user && session.user.id; }
    function _fire(event) {
        const snap = session;
        authListeners.forEach(cb => { try { cb(event, snap); } catch {} });
    }
    function _mkSession(u) {
        return { access_token: 't_' + u.id, refresh_token: 'r_' + u.id, user: u };
    }

    function from(name) {
        const store = rows[name];
        let filters = [], ordering = null, pendingWrite = null, selectColumns = null;
        function matches(r) {
            if (r.user_id !== _authUid()) return false;
            return filters.every(({ col, val }) => r[col] === val);
        }
        function projection(r) {
            if (!selectColumns || selectColumns === '*') return { ...r };
            const out = {};
            for (const c of selectColumns.split(',').map(s => s.trim())) out[c] = r[c];
            return out;
        }
        const chain = {
            select(c) { selectColumns = c || '*'; return chain; },
            eq(c, v) { filters.push({ col: c, val: v }); return chain; },
            order(c, o) { ordering = { col: c, ascending: !!(o && o.ascending) }; return chain; },
            upsert(p, o) { pendingWrite = { kind: 'upsert', payload: p, onConflict: o && o.onConflict }; return chain; },
            delete() { pendingWrite = { kind: 'delete' }; return chain; },
            maybeSingle() { return resolve(true); },
            single() { return resolve(true); },
            then(f, r) { return resolve(false).then(f, r); },
        };
        function resolve(single) {
            if (!_authUid()) return Promise.resolve({ data: null, error: { message: 'not authenticated' } });
            if (pendingWrite && pendingWrite.kind === 'upsert') {
                const p = pendingWrite.payload;
                if (p.user_id !== _authUid()) return Promise.resolve({ data: null, error: { message: 'RLS' } });
                const keys = (pendingWrite.onConflict || 'id').split(',').map(s => s.trim());
                const idx = store.findIndex(r => keys.every(k => r[k] === p[k]));
                const now = new Date().toISOString();
                if (idx >= 0) {
                    store[idx] = { ...store[idx], ...p, updated_at: now };
                    return Promise.resolve({ data: single ? projection(store[idx]) : [projection(store[idx])], error: null });
                }
                const id = p.id || 'mk_' + Math.random().toString(36).slice(2, 8);
                const row = { id, created_at: now, updated_at: now, ...p };
                store.push(row);
                return Promise.resolve({ data: single ? projection(row) : [projection(row)], error: null });
            }
            if (pendingWrite && pendingWrite.kind === 'delete') {
                const keep = []; for (const r of store) if (!matches(r)) keep.push(r);
                store.length = 0; store.push(...keep);
                return Promise.resolve({ data: null, error: null });
            }
            let out = store.filter(matches).map(projection);
            if (ordering) {
                out.sort((a, b) => {
                    const av = a[ordering.col], bv = b[ordering.col];
                    if (av === bv) return 0;
                    return (av > bv ? 1 : -1) * (ordering.ascending ? 1 : -1);
                });
            }
            if (single) return Promise.resolve({ data: out[0] || null, error: null });
            return Promise.resolve({ data: out, error: null });
        }
        return chain;
    }

    const auth = {
        async signUp({ email, password }) {
            if (users.find(u => u.email === email)) return { data: null, error: { message: 'exists' } };
            const user = {
                id: 'u_' + Math.random().toString(36).slice(2, 8),
                email, password, app_metadata: {}, user_metadata: {},
            };
            users.push(user);
            session = _mkSession(user);
            _fire('SIGNED_IN');
            return { data: { user, session }, error: null };
        },
        async signInWithPassword({ email, password }) {
            const u = users.find(x => x.email === email && x.password === password);
            if (!u) return { data: null, error: { message: 'Invalid login' } };
            session = _mkSession(u); _fire('SIGNED_IN');
            return { data: { user: u, session }, error: null };
        },
        async resetPasswordForEmail() { return { data: {}, error: null }; },
        async signOut() { session = null; _fire('SIGNED_OUT'); return { error: null }; },
        async getSession() { return { data: { session }, error: null }; },
        async getUser() { return { data: { user: session ? session.user : null }, error: null }; },
        async updateUser({ data }) {
            if (!session) return { data: null, error: { message: 'not authenticated' } };
            session.user.user_metadata = { ...(session.user.user_metadata || {}), ...data };
            const p = users.find(u => u.id === session.user.id);
            if (p) p.user_metadata = session.user.user_metadata;
            return { data: { user: session.user }, error: null };
        },
        onAuthStateChange(cb) {
            authListeners.push(cb);
            return { data: { subscription: { unsubscribe() { authListeners = authListeners.filter(f => f !== cb); } } } };
        },
        mfa: {
            async enroll({ factorType }) {
                if (!session) return { data: null, error: { message: 'not authenticated' } };
                const id = 'f_' + Math.random().toString(36).slice(2, 6);
                factors.push({ id, user_id: session.user.id, factor_type: factorType, status: 'unverified' });
                return {
                    data: { id, type: factorType, totp: { qr_code: 'data:image/svg+xml;utf8,<svg/>', secret: 'ABCD', uri: 'otpauth://totp/test' } },
                    error: null,
                };
            },
            async challenge({ factorId }) {
                const id = 'c_' + Math.random().toString(36).slice(2, 6);
                challenges.push({ id, factor_id: factorId });
                return { data: { id }, error: null };
            },
            async verify({ factorId, challengeId, code }) {
                const f = factors.find(x => x.id === factorId);
                if (!f) return { data: null, error: { message: 'factor not found' } };
                if (!challenges.find(c => c.id === challengeId && c.factor_id === factorId)) {
                    return { data: null, error: { message: 'challenge not found' } };
                }
                if (!/^\d{6}$/.test(String(code || ''))) return { data: null, error: { message: 'Invalid code' } };
                f.status = 'verified';
                return { data: { user: session && session.user }, error: null };
            },
            async unenroll({ factorId }) {
                const idx = factors.findIndex(f => f.id === factorId);
                if (idx >= 0) factors.splice(idx, 1);
                return { data: { id: factorId }, error: null };
            },
            async listFactors() {
                if (!session) return { data: null, error: { message: 'not authenticated' } };
                const mine = factors.filter(f => f.user_id === session.user.id);
                return { data: { all: mine.slice(), totp: mine.filter(f => f.factor_type === 'totp') }, error: null };
            },
        },
    };

    return { _rows: rows, _session: () => session, from, auth };
}

// ── Harness ──────────────────────────────────────────────────────────────

let lsStore;
function installLocalStorage() {
    lsStore = {};
    global.localStorage = {
        getItem(k) { return Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null; },
        setItem(k, v) { lsStore[k] = String(v); },
        removeItem(k) { delete lsStore[k]; },
        clear() { lsStore = {}; global.localStorage.data = lsStore; },
    };
    global.localStorage.data = lsStore;
}

async function loadStack({ backend = 'supabase', cloudSyncDisabled = false } = {}) {
    installLocalStorage();
    if (backend) localStorage.setItem('altech_sync_backend', backend);
    if (cloudSyncDisabled) localStorage.setItem('altech_cloud_sync_disabled', 'true');

    global.window = {};
    global.window.localStorage = global.localStorage;
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, async json() { return {}; } }));

    eval(storageKeysSrc);
    eval(utilsSrc);
    global.STORAGE_KEYS = global.window.STORAGE_KEYS;
    global.Utils = global.window.Utils;

    const mockClient = createMockSupabase();
    global.window.Supabase = { isReady: true, client: mockClient, init: jest.fn(async () => true) };

    eval(supabaseAuthSrc);
    eval(supabaseSyncSrc);
    eval(syncFacadeSrc);

    await global.window.SupabaseAuth.init();
    return { mockClient };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('MFA enforcement (sync-facade gate)', () => {
    describe('cloud-sync user without verified TOTP', () => {
        test('Sync.schedulePush is blocked (no-op, no rows written)', async () => {
            const { mockClient } = await loadStack({ backend: 'supabase' });
            const { SupabaseAuth, Sync } = global.window;

            await SupabaseAuth.signUp('alice@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();
            expect(SupabaseAuth.mfaRequired()).toBe(true);
            expect(Sync.mfaBlocked).toBe(true);

            localStorage.setItem(STORAGE_KEYS.FORM, 'cipher-form');
            jest.useFakeTimers();
            const ret = Sync.schedulePush();
            expect(ret).toBeUndefined();
            jest.advanceTimersByTime(5000);
            jest.useRealTimers();
            await new Promise(r => setImmediate(r));

            expect(mockClient._rows.user_blobs).toEqual([]);
        });

        test('Sync.pushBlob returns {skipped: "mfa-required"}', async () => {
            const { mockClient } = await loadStack({ backend: 'supabase' });
            const { SupabaseAuth, Sync } = global.window;
            await SupabaseAuth.signUp('bob@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();

            await expect(Sync.pushBlob('currentForm', 'cipher'))
                .resolves.toEqual({ ok: false, skipped: 'mfa-required' });
            expect(mockClient._rows.user_blobs).toEqual([]);
        });

        test('Sync.pushQuote, deleteBlob, deleteQuote, fullSync, pushToCloud all gated', async () => {
            await loadStack({ backend: 'supabase' });
            const { SupabaseAuth, Sync } = global.window;
            await SupabaseAuth.signUp('carol@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();

            await expect(Sync.pushQuote(null, 'c')).resolves.toEqual({ ok: false, skipped: 'mfa-required' });
            await expect(Sync.deleteBlob('currentForm')).resolves.toEqual({ ok: false, skipped: 'mfa-required' });
            await expect(Sync.deleteQuote('x')).resolves.toEqual({ ok: false, skipped: 'mfa-required' });
            await expect(Sync.fullSync()).resolves.toEqual({ ok: false, skipped: 'mfa-required' });
            await expect(Sync.pushToCloud()).resolves.toEqual({ ok: false, skipped: 'mfa-required' });
        });

        test('reads (pullBlob, pullQuote, listQuotes, pullFromCloud) are NOT gated', async () => {
            // A user without TOTP must still be able to read their own data —
            // Phase 4 migration relies on this. Only writes are blocked.
            await loadStack({ backend: 'supabase' });
            const { SupabaseAuth, Sync } = global.window;
            await SupabaseAuth.signUp('dana@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();

            // No rows exist yet so these resolve to null/[] — the important
            // thing is they don't short-circuit with {skipped: 'mfa-required'}.
            await expect(Sync.pullBlob('currentForm')).resolves.toBeNull();
            await expect(Sync.pullQuote('x')).resolves.toBeNull();
            await expect(Sync.listQuotes()).resolves.toEqual([]);
        });
    });

    describe('after TOTP verify', () => {
        test('Sync.schedulePush flows through once a factor is verified', async () => {
            const { mockClient } = await loadStack({ backend: 'supabase' });
            const { SupabaseAuth, Sync } = global.window;

            await SupabaseAuth.signUp('ed@example.com', 'pw1234');
            const enroll = await SupabaseAuth.enrollTOTP();
            await SupabaseAuth.verifyTOTP(enroll.factorId, '123456');
            expect(SupabaseAuth.mfaRequired()).toBe(false);
            expect(Sync.mfaBlocked).toBe(false);

            localStorage.setItem(STORAGE_KEYS.FORM, 'cipher-after-mfa');
            jest.useFakeTimers();
            Sync.schedulePush();
            jest.advanceTimersByTime(3500);
            jest.useRealTimers();
            await new Promise(r => setImmediate(r));

            const forms = mockClient._rows.user_blobs.filter(r => r.doc_key === 'currentForm');
            expect(forms).toHaveLength(1);
            expect(forms[0].ciphertext).toBe('cipher-after-mfa');
        });

        test('Sync.pushBlob writes once a factor is verified', async () => {
            const { mockClient } = await loadStack({ backend: 'supabase' });
            const { SupabaseAuth, Sync } = global.window;
            await SupabaseAuth.signUp('fran@example.com', 'pw1234');
            const enroll = await SupabaseAuth.enrollTOTP();
            await SupabaseAuth.verifyTOTP(enroll.factorId, '654321');

            await expect(Sync.pushBlob('currentForm', 'verified-cipher')).resolves.toEqual({ ok: true });
            const row = mockClient._rows.user_blobs.find(r => r.doc_key === 'currentForm');
            expect(row).toBeDefined();
            expect(row.ciphertext).toBe('verified-cipher');
        });
    });

    describe('opt-out exemption (CLOUD_SYNC_DISABLED=true)', () => {
        test('Sync.pushBlob calls through even without a TOTP factor', async () => {
            const { mockClient } = await loadStack({ backend: 'supabase', cloudSyncDisabled: true });
            const { SupabaseAuth, Sync } = global.window;
            await SupabaseAuth.signUp('gary@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();

            expect(SupabaseAuth.mfaRequired()).toBe(false);
            expect(Sync.mfaBlocked).toBe(false);

            await expect(Sync.pushBlob('currentForm', 'opt-out-cipher')).resolves.toEqual({ ok: true });
            const row = mockClient._rows.user_blobs.find(r => r.doc_key === 'currentForm');
            expect(row && row.ciphertext).toBe('opt-out-cipher');
        });

        test('Sync.schedulePush sweeps local keys even without a TOTP factor', async () => {
            const { mockClient } = await loadStack({ backend: 'supabase', cloudSyncDisabled: true });
            const { SupabaseAuth, Sync } = global.window;
            await SupabaseAuth.signUp('helen@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();

            localStorage.setItem(STORAGE_KEYS.FORM, 'cipher-x');
            jest.useFakeTimers();
            Sync.schedulePush();
            jest.advanceTimersByTime(3500);
            jest.useRealTimers();
            await new Promise(r => setImmediate(r));

            const forms = mockClient._rows.user_blobs.filter(r => r.doc_key === 'currentForm');
            expect(forms).toHaveLength(1);
            expect(forms[0].ciphertext).toBe('cipher-x');
        });
    });

    describe('Firebase backend (default): gate is inert', () => {
        test('Sync.mfaBlocked is false and Supabase methods are no-ops', async () => {
            await loadStack({ backend: 'firebase' });
            const { Sync } = global.window;
            expect(Sync.backend).toBe('firebase');
            expect(Sync.mfaBlocked).toBe(false);

            // On firebase, supabase-only methods still return the default (not
            // an mfa-required skip) because the gate short-circuits on backend.
            await expect(Sync.pushBlob('currentForm', 'x'))
                .resolves.toEqual({ ok: false, skipped: true });
        });
    });
});
