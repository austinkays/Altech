'use strict';

/**
 * tests/supabase-auth.test.js
 *
 * Integration tests for js/supabase-auth.js — the Path B Phase 3 Supabase
 * Auth client. Covers:
 *   - signUp / signIn / logout round-trips
 *   - session persistence across listener fires
 *   - apiFetch injects the bearer token on outgoing requests
 *   - mfaRequired() flips false only after a verified TOTP factor is present
 *   - opt-out users (CLOUD_SYNC_DISABLED=true) are exempt from MFA regardless of factors
 *   - cross-user pullBlob from Phase 2 still returns null after a different user signs in
 *
 * Approach mirrors tests/supabase-sync.test.js: eval source files in the Node
 * global context against an in-memory localStorage + an in-memory mock of
 * window.Supabase.client that stores users, sessions, and MFA factors.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const storageKeysSrc  = fs.readFileSync(path.join(ROOT, 'js', 'storage-keys.js'), 'utf8');
const utilsSrc        = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
const supabaseSyncSrc = fs.readFileSync(path.join(ROOT, 'js', 'supabase-sync.js'), 'utf8');
const supabaseAuthSrc = fs.readFileSync(path.join(ROOT, 'js', 'supabase-auth.js'), 'utf8');

// ── Mock Supabase client with auth + MFA + sync tables ───────────────────

function createMockSupabase() {
    const users = [];       // { id, email, password, app_metadata, user_metadata }
    const factors = [];     // { id, user_id, factor_type, status }
    const challenges = [];  // { id, factor_id }
    const rows = { user_blobs: [], user_quotes: [] };
    let session = null;
    let authListeners = [];

    function _fireAuthChange(event) {
        const snapshot = session;
        authListeners.forEach(cb => {
            try { cb(event, snapshot); } catch (e) { /* swallow */ }
        });
    }

    function _makeSession(user) {
        return {
            access_token: 'token_' + user.id,
            refresh_token: 'refresh_' + user.id,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
        };
    }

    function _authUid() { return session && session.user && session.user.id; }

    function from(name) {
        const store = rows[name];
        if (!store) throw new Error('Unknown table: ' + name);
        let filters = [];
        let ordering = null;
        let pendingWrite = null;
        let selectColumns = null;

        function matches(row) {
            if (row.user_id !== _authUid()) return false;
            return filters.every(({ col, val }) => row[col] === val);
        }
        function projection(row) {
            if (!selectColumns || selectColumns === '*') return { ...row };
            const out = {};
            for (const col of selectColumns.split(',').map(s => s.trim())) out[col] = row[col];
            return out;
        }

        const chain = {
            select(cols) { selectColumns = cols || '*'; return chain; },
            eq(col, val) { filters.push({ col, val }); return chain; },
            order(col, opts) { ordering = { col, ascending: !!(opts && opts.ascending) }; return chain; },
            upsert(payload, opts) { pendingWrite = { kind: 'upsert', payload, onConflict: opts && opts.onConflict }; return chain; },
            delete() { pendingWrite = { kind: 'delete' }; return chain; },
            maybeSingle() { return resolve(true); },
            single() { return resolve(true); },
            then(onF, onR) { return resolve(false).then(onF, onR); },
        };
        function resolve(single) {
            if (!_authUid()) return Promise.resolve({ data: null, error: { message: 'not authenticated' } });
            if (pendingWrite && pendingWrite.kind === 'upsert') {
                const p = pendingWrite.payload;
                if (p.user_id !== _authUid()) return Promise.resolve({ data: null, error: { message: 'RLS violation' } });
                const keys = (pendingWrite.onConflict || 'id').split(',').map(s => s.trim());
                const idx = store.findIndex(r => keys.every(k => r[k] === p[k]));
                const now = new Date().toISOString();
                if (idx >= 0) {
                    store[idx] = { ...store[idx], ...p, updated_at: now };
                    return Promise.resolve({ data: single ? projection(store[idx]) : [projection(store[idx])], error: null });
                }
                const id = p.id || 'mockid_' + Math.random().toString(36).slice(2, 10);
                const row = { id, created_at: now, updated_at: now, ...p };
                store.push(row);
                return Promise.resolve({ data: single ? projection(row) : [projection(row)], error: null });
            }
            if (pendingWrite && pendingWrite.kind === 'delete') {
                const keep = [];
                for (const r of store) if (!matches(r)) keep.push(r);
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
        async signUp({ email, password, options }) {
            if (users.find(u => u.email === email)) {
                return { data: null, error: { message: 'User already registered' } };
            }
            const user = {
                id: 'u_' + Math.random().toString(36).slice(2, 10),
                email,
                password,
                app_metadata: {},
                user_metadata: (options && options.data) || {},
                created_at: new Date().toISOString(),
            };
            users.push(user);
            session = _makeSession(user);
            _fireAuthChange('SIGNED_IN');
            return { data: { user, session }, error: null };
        },

        async signInWithPassword({ email, password }) {
            const u = users.find(x => x.email === email && x.password === password);
            if (!u) return { data: null, error: { message: 'Invalid login credentials' } };
            session = _makeSession(u);
            _fireAuthChange('SIGNED_IN');
            return { data: { user: u, session }, error: null };
        },

        async resetPasswordForEmail(email) {
            // Real Supabase does not disclose whether the email exists.
            void email;
            return { data: {}, error: null };
        },

        async signOut() {
            session = null;
            _fireAuthChange('SIGNED_OUT');
            return { error: null };
        },

        async getSession() { return { data: { session }, error: null }; },
        async getUser() {
            return { data: { user: session ? session.user : null }, error: null };
        },

        async updateUser({ data }) {
            if (!session) return { data: null, error: { message: 'not authenticated' } };
            session.user.user_metadata = { ...(session.user.user_metadata || {}), ...data };
            // Mirror write-through so the users[] source of truth reflects it too.
            const persisted = users.find(u => u.id === session.user.id);
            if (persisted) persisted.user_metadata = session.user.user_metadata;
            return { data: { user: session.user }, error: null };
        },

        onAuthStateChange(cb) {
            authListeners.push(cb);
            return { data: { subscription: { unsubscribe: () => {
                authListeners = authListeners.filter(f => f !== cb);
            } } } };
        },

        mfa: {
            async enroll({ factorType }) {
                if (!session) return { data: null, error: { message: 'not authenticated' } };
                const id = 'f_' + Math.random().toString(36).slice(2, 8);
                factors.push({
                    id, user_id: session.user.id, factor_type: factorType, status: 'unverified',
                });
                return {
                    data: {
                        id,
                        type: factorType,
                        totp: {
                            qr_code: 'data:image/svg+xml;utf8,<svg/>',
                            secret: 'JBSWY3DPEHPK3PXP',
                            uri: 'otpauth://totp/test',
                        },
                    },
                    error: null,
                };
            },
            async challenge({ factorId }) {
                const id = 'c_' + Math.random().toString(36).slice(2, 8);
                challenges.push({ id, factor_id: factorId });
                return { data: { id }, error: null };
            },
            async verify({ factorId, challengeId, code }) {
                const f = factors.find(x => x.id === factorId);
                if (!f) return { data: null, error: { message: 'factor not found' } };
                if (!challenges.find(c => c.id === challengeId && c.factor_id === factorId)) {
                    return { data: null, error: { message: 'challenge not found' } };
                }
                // Test harness accepts any 6-digit code. Real Supabase validates TOTP.
                if (!/^\d{6}$/.test(String(code || ''))) {
                    return { data: null, error: { message: 'Invalid code' } };
                }
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
                return {
                    data: {
                        all: mine.slice(),
                        totp: mine.filter(f => f.factor_type === 'totp'),
                    },
                    error: null,
                };
            },
        },
    };

    return {
        _users: users,
        _factors: factors,
        _rows: rows,
        _session: () => session,
        _setAdmin(uid, flag) {
            const u = users.find(x => x.id === uid);
            if (u) u.app_metadata = { ...(u.app_metadata || {}), is_admin: flag === undefined ? true : !!flag };
        },
        from,
        auth,
    };
}

// ── Harness ──────────────────────────────────────────────────────────────

let lsStore;
let SupabaseAuth;
let SupabaseSync;
let mockClient;

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

async function loadModules({ backend = 'supabase', cloudSyncDisabled = false, includeSync = false } = {}) {
    installLocalStorage();
    if (backend) localStorage.setItem('altech_sync_backend', backend);
    if (cloudSyncDisabled) localStorage.setItem('altech_cloud_sync_disabled', 'true');

    global.window = {};
    global.fetch = jest.fn(async (url, opts) => ({
        ok: true,
        status: 200,
        url,
        _opts: opts,
        async json() { return {}; },
    }));
    global.window.fetch = global.fetch;
    global.window.localStorage = global.localStorage;

    eval(storageKeysSrc);
    eval(utilsSrc);
    global.STORAGE_KEYS = global.window.STORAGE_KEYS;
    global.Utils = global.window.Utils;

    mockClient = createMockSupabase();
    global.window.Supabase = {
        isReady: true,
        client: mockClient,
        init: jest.fn(async () => true),
    };

    eval(supabaseAuthSrc);
    SupabaseAuth = global.window.SupabaseAuth;

    if (includeSync) {
        eval(supabaseSyncSrc);
        SupabaseSync = global.window.SupabaseSync;
    }

    await SupabaseAuth.init();
    return SupabaseAuth;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('SupabaseAuth (Path B Phase 3)', () => {
    describe('feature-flag gating', () => {
        test('init() resolves false when SYNC_BACKEND != "supabase"', async () => {
            installLocalStorage();
            localStorage.setItem('altech_sync_backend', 'firebase');
            global.window = {};
            eval(storageKeysSrc);
            eval(utilsSrc);
            global.STORAGE_KEYS = global.window.STORAGE_KEYS;
            global.window.Supabase = { isReady: true, client: createMockSupabase(), init: jest.fn(async () => true) };
            eval(supabaseAuthSrc);
            await expect(global.window.SupabaseAuth.init()).resolves.toBe(false);
            expect(global.window.SupabaseAuth.isSignedIn).toBe(false);
        });
    });

    describe('signUp / signIn / logout', () => {
        beforeEach(async () => { await loadModules({ backend: 'supabase' }); });

        test('signUp creates a session and flips isSignedIn true', async () => {
            expect(SupabaseAuth.isSignedIn).toBe(false);
            await SupabaseAuth.signUp('alice@example.com', 'hunter2');
            expect(SupabaseAuth.isSignedIn).toBe(true);
            expect(SupabaseAuth.email).toBe('alice@example.com');
            expect(SupabaseAuth.uid).toMatch(/^u_/);
        });

        test('signIn with correct password establishes a session', async () => {
            await SupabaseAuth.signUp('bob@example.com', 'pw1234');
            await SupabaseAuth.logout();
            expect(SupabaseAuth.isSignedIn).toBe(false);
            await SupabaseAuth.signIn('bob@example.com', 'pw1234');
            expect(SupabaseAuth.isSignedIn).toBe(true);
            expect(SupabaseAuth.email).toBe('bob@example.com');
        });

        test('signIn with bad password throws', async () => {
            await SupabaseAuth.signUp('carol@example.com', 'pw1234');
            await SupabaseAuth.logout();
            await expect(SupabaseAuth.signIn('carol@example.com', 'wrong'))
                .rejects.toMatchObject({ message: expect.stringMatching(/Invalid login/i) });
            expect(SupabaseAuth.isSignedIn).toBe(false);
        });

        test('logout tears down the session and fires listeners', async () => {
            await SupabaseAuth.signUp('dave@example.com', 'pw1234');
            const events = [];
            SupabaseAuth.addAuthListener((user, event) => events.push({ uid: user ? user.id : null, event }));
            await SupabaseAuth.logout();
            expect(SupabaseAuth.isSignedIn).toBe(false);
            expect(SupabaseAuth.uid).toBeNull();
            // The first listener fire is the immediate INITIAL; we expect at
            // least one subsequent SIGNED_OUT with uid=null.
            const hasSignedOut = events.some(e => e.event === 'SIGNED_OUT' && e.uid === null);
            expect(hasSignedOut).toBe(true);
        });

        test('sendPasswordReset resolves without error for any email', async () => {
            await expect(SupabaseAuth.sendPasswordReset('unknown@example.com')).resolves.toBe(true);
        });
    });

    describe('apiFetch bearer injection', () => {
        beforeEach(async () => { await loadModules({ backend: 'supabase' }); });

        test('attaches Authorization: Bearer <access_token> once signed in', async () => {
            await SupabaseAuth.signUp('ed@example.com', 'pw1234');
            const expected = 'Bearer ' + mockClient._session().access_token;
            await SupabaseAuth.apiFetch('/api/admin-supabase?action=list');
            expect(global.fetch).toHaveBeenCalledTimes(1);
            const [, opts] = global.fetch.mock.calls[0];
            expect(opts.headers.Authorization).toBe(expected);
        });

        test('omits the Authorization header when not signed in', async () => {
            await SupabaseAuth.apiFetch('/api/admin-supabase?action=list');
            const [, opts] = global.fetch.mock.calls[0];
            expect(opts && opts.headers && opts.headers.Authorization).toBeUndefined();
        });

        test('preserves caller-provided headers when injecting the token', async () => {
            await SupabaseAuth.signUp('frank@example.com', 'pw1234');
            await SupabaseAuth.apiFetch('/api/admin-supabase?action=update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Custom': '1' },
                body: '{}',
            });
            const [, opts] = global.fetch.mock.calls[0];
            expect(opts.method).toBe('POST');
            expect(opts.headers['Content-Type']).toBe('application/json');
            expect(opts.headers['X-Custom']).toBe('1');
            expect(opts.headers.Authorization).toMatch(/^Bearer /);
        });
    });

    describe('mfaRequired gate', () => {
        beforeEach(async () => { await loadModules({ backend: 'supabase' }); });

        test('false when no user is signed in', () => {
            expect(SupabaseAuth.mfaRequired()).toBe(false);
        });

        test('true for a fresh cloud-sync user with no verified TOTP factor', async () => {
            await SupabaseAuth.signUp('gina@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();
            expect(SupabaseAuth.mfaRequired()).toBe(true);
            expect(SupabaseAuth.mfaEnforcementLevel()).toBe('soft');
        });

        test('false after TOTP factor is enrolled AND verified', async () => {
            await SupabaseAuth.signUp('helen@example.com', 'pw1234');
            const enroll = await SupabaseAuth.enrollTOTP();
            expect(enroll.factorId).toMatch(/^f_/);
            expect(enroll.qrCode).toMatch(/^data:image\/svg/);
            // Still required: factor is unverified.
            await SupabaseAuth._refreshFactors();
            expect(SupabaseAuth.mfaRequired()).toBe(true);

            await SupabaseAuth.verifyTOTP(enroll.factorId, '123456');
            expect(SupabaseAuth.mfaRequired()).toBe(false);
            expect(SupabaseAuth.mfaEnforcementLevel()).toBeNull();
        });

        test('verifyTOTP rejects non-6-digit codes', async () => {
            await SupabaseAuth.signUp('ira@example.com', 'pw1234');
            const enroll = await SupabaseAuth.enrollTOTP();
            await expect(SupabaseAuth.verifyTOTP(enroll.factorId, 'abc'))
                .rejects.toMatchObject({ message: expect.stringMatching(/Invalid code/i) });
            expect(SupabaseAuth.mfaRequired()).toBe(true);
        });

        test('hard enforcement after 3 dismissals', async () => {
            await SupabaseAuth.signUp('june@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();
            expect(SupabaseAuth.mfaEnforcementLevel()).toBe('soft');

            await SupabaseAuth.recordMfaDismiss();
            await SupabaseAuth.recordMfaDismiss();
            expect(SupabaseAuth.mfaEnforcementLevel()).toBe('soft');

            await SupabaseAuth.recordMfaDismiss();
            expect(SupabaseAuth.mfaEnforcementLevel()).toBe('hard');
        });
    });

    describe('cloud-sync opt-out exemption', () => {
        test('mfaRequired stays false when CLOUD_SYNC_DISABLED=true even with no factor', async () => {
            await loadModules({ backend: 'supabase', cloudSyncDisabled: true });
            await SupabaseAuth.signUp('kevin@example.com', 'pw1234');
            await SupabaseAuth._refreshFactors();
            expect(SupabaseAuth.mfaRequired()).toBe(false);
            expect(SupabaseAuth.mfaEnforcementLevel()).toBeNull();
        });
    });

    describe('admin / blocked flags', () => {
        beforeEach(async () => { await loadModules({ backend: 'supabase' }); });

        test('isAdmin reads app_metadata.is_admin set by the service role', async () => {
            const res = await SupabaseAuth.signUp('leo@example.com', 'pw1234');
            expect(SupabaseAuth.isAdmin).toBe(false);
            mockClient._setAdmin(res.user.id, true);
            // The next getSession reflects the new metadata; simulate the
            // refresh path that onAuthStateChange would take.
            const fresh = mockClient._session();
            SupabaseAuth._onAuthChange('TOKEN_REFRESHED', fresh);
            await new Promise(r => setImmediate(r));
            expect(SupabaseAuth.isAdmin).toBe(true);
        });

        test('isBlocked reads app_metadata.is_blocked', async () => {
            const res = await SupabaseAuth.signUp('mia@example.com', 'pw1234');
            expect(SupabaseAuth.isBlocked).toBe(false);
            const u = mockClient._users.find(x => x.id === res.user.id);
            u.app_metadata = { ...(u.app_metadata || {}), is_blocked: true };
            const fresh = mockClient._session();
            SupabaseAuth._onAuthChange('TOKEN_REFRESHED', fresh);
            await new Promise(r => setImmediate(r));
            expect(SupabaseAuth.isBlocked).toBe(true);
        });
    });

    describe('cross-user RLS after sign-in (Phase 2 contract preserved)', () => {
        test('user B cannot pull user A\'s blob after signing in', async () => {
            await loadModules({ backend: 'supabase', includeSync: true });

            // User A signs up and pushes a blob.
            await SupabaseAuth.signUp('nancy@example.com', 'pw1234');
            const pushA = await SupabaseSync.pushBlob('currentForm', 'cipher-A');
            expect(pushA).toEqual({ ok: true });

            await SupabaseAuth.logout();

            // User B signs up (fresh account) and tries to pull the same doc_key.
            await SupabaseAuth.signUp('oscar@example.com', 'pw1234');
            const pullB = await SupabaseSync.pullBlob('currentForm');
            expect(pullB).toBeNull();

            // listQuotes cross-user isolation holds too.
            const list = await SupabaseSync.listQuotes();
            expect(list).toEqual([]);
        });
    });
});
