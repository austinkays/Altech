'use strict';

/**
 * tests/supabase-sync.test.js
 *
 * Integration tests for js/supabase-sync.js — the Path B Phase 2 Supabase
 * client. Covers:
 *   - round-trip ciphertext is preserved unmodified
 *   - cross-user pulls return null (RLS deny-by-default, no error)
 *   - every method is a no-op when SYNC_BACKEND !== 'supabase'
 *   - quote CRUD round-trips
 *   - schedulePush() sweeps all DOC_LOCAL_KEYS entries
 *
 * Approach mirrors tests/utils.test.js: source files are read with
 * fs.readFileSync and evaluated in the Node.js global context against an
 * in-memory localStorage + an in-memory mock of window.Supabase.client
 * that enforces row-level security by filtering every operation by the
 * authenticated user id.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const storageKeysSrc = fs.readFileSync(path.join(ROOT, 'js', 'storage-keys.js'), 'utf8');
const utilsSrc       = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
const supabaseSyncSrc = fs.readFileSync(path.join(ROOT, 'js', 'supabase-sync.js'), 'utf8');

// ── Mock Supabase client ─────────────────────────────────────────────────────

/**
 * Tiny in-memory clone of the subset of the supabase-js client that
 * supabase-sync.js uses. Critically, it enforces RLS by filtering every
 * operation by the id of whichever user is currently "signed in" — i.e. the
 * session returned from auth.getSession(). A caller authenticated as user A
 * can never observe or modify user B's rows, matching the behavior of the
 * real `own_*` policies in db/migrations/0001_initial_schema.sql.
 */
function createMockSupabase(initialSession) {
    const rows = { user_blobs: [], user_quotes: [] };
    let currentSession = initialSession || null;

    function authUid() { return currentSession && currentSession.user && currentSession.user.id; }

    function table(name) {
        const store = rows[name];
        if (!store) throw new Error('Unknown table: ' + name);

        // Pending filter/order state for the current fluent chain.
        let filters = [];
        let ordering = null;
        let pendingWrite = null; // { kind: 'upsert'|'delete', payload?, onConflict? }
        let selectColumns = null;

        function matches(row) {
            // RLS: always filter by current auth uid.
            if (row.user_id !== authUid()) return false;
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

            upsert(payload, opts) {
                pendingWrite = { kind: 'upsert', payload, onConflict: opts && opts.onConflict };
                return chain;
            },
            delete() {
                pendingWrite = { kind: 'delete' };
                return chain;
            },

            // Terminal resolvers.
            maybeSingle() { return resolve(true); },
            single()      { return resolve(true); },
            then(onFulfilled, onRejected) { return resolve(false).then(onFulfilled, onRejected); },
        };

        function resolve(single) {
            if (!authUid()) {
                return Promise.resolve({ data: null, error: { message: 'not authenticated' } });
            }

            if (pendingWrite && pendingWrite.kind === 'upsert') {
                const payload = pendingWrite.payload;
                if (payload.user_id !== authUid()) {
                    // Simulates the RLS WITH CHECK violation.
                    return Promise.resolve({ data: null, error: { message: 'row-level security violation' } });
                }
                const conflictCols = (pendingWrite.onConflict || 'id').split(',').map(s => s.trim());
                const idx = store.findIndex(r => conflictCols.every(c => r[c] === payload[c]));
                if (idx >= 0) {
                    store[idx] = { ...store[idx], ...payload, updated_at: new Date().toISOString() };
                    const data = single ? projection(store[idx]) : [projection(store[idx])];
                    return Promise.resolve({ data, error: null });
                } else {
                    const id = payload.id || 'mockid_' + Math.random().toString(36).slice(2, 10);
                    const now = new Date().toISOString();
                    const row = { id, created_at: now, updated_at: now, ...payload };
                    store.push(row);
                    const data = single ? projection(row) : [projection(row)];
                    return Promise.resolve({ data, error: null });
                }
            }

            if (pendingWrite && pendingWrite.kind === 'delete') {
                const keep = [];
                let deleted = 0;
                for (const r of store) {
                    if (matches(r)) { deleted++; } else { keep.push(r); }
                }
                store.length = 0;
                store.push(...keep);
                return Promise.resolve({ data: null, error: null, count: deleted });
            }

            // SELECT path.
            let out = store.filter(matches).map(projection);
            if (ordering) {
                out.sort((a, b) => {
                    const av = a[ordering.col], bv = b[ordering.col];
                    if (av === bv) return 0;
                    return (av > bv ? 1 : -1) * (ordering.ascending ? 1 : -1);
                });
            }
            if (single) {
                return Promise.resolve({ data: out[0] || null, error: null });
            }
            return Promise.resolve({ data: out, error: null });
        }

        return chain;
    }

    return {
        _rows: rows,
        _setSession(session) { currentSession = session; },
        from: table,
        auth: {
            getSession: jest.fn(async () => ({ data: { session: currentSession }, error: null })),
            getUser: jest.fn(async () => ({
                data: { user: currentSession ? currentSession.user : null },
                error: null,
            })),
        },
    };
}

// ── Test harness ─────────────────────────────────────────────────────────────

let lsStore;
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

function loadSupabaseSync({ session, backend = 'supabase' } = {}) {
    installLocalStorage();
    if (backend) localStorage.setItem('altech_sync_backend', backend);

    // Fresh globals so the IIFE in supabase-sync.js sees a clean world.
    global.window = {};

    // storage-keys.js assigns to window.STORAGE_KEYS; utils.js assigns to window.Utils.
    eval(storageKeysSrc);
    eval(utilsSrc);
    global.STORAGE_KEYS = global.window.STORAGE_KEYS;
    global.Utils = global.window.Utils;

    mockClient = createMockSupabase(session);
    global.window.Supabase = {
        isReady: true,
        client: mockClient,
        init: jest.fn(async () => true),
    };
    global.window.localStorage = global.localStorage;

    // Silence console.error during tests (mock client surfaces expected errors).
    eval(supabaseSyncSrc);
    SupabaseSync = global.window.SupabaseSync;
    return SupabaseSync;
}

// Auth session fixtures.
const USER_A = { user: { id: '00000000-0000-0000-0000-0000000000aa', email: 'a@example.com' } };
const USER_B = { user: { id: '00000000-0000-0000-0000-0000000000bb', email: 'b@example.com' } };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SupabaseSync (Path B Phase 2)', () => {
    describe('feature-flag gating', () => {
        beforeEach(() => { loadSupabaseSync({ session: USER_A, backend: 'firebase' }); });

        test('is dormant when SYNC_BACKEND != "supabase"', async () => {
            expect(SupabaseSync.enabled).toBe(false);

            // Every method either returns null, an empty list, or a skipped result.
            await expect(SupabaseSync.pushBlob('currentForm', 'opaque')).resolves.toEqual({ ok: false, skipped: true });
            await expect(SupabaseSync.pullBlob('currentForm')).resolves.toBeNull();
            await expect(SupabaseSync.deleteBlob('currentForm')).resolves.toEqual({ ok: false, skipped: true });

            await expect(SupabaseSync.pushQuote('q1', 'cipher')).resolves.toEqual({ ok: false, skipped: true });
            await expect(SupabaseSync.pullQuote('q1')).resolves.toBeNull();
            await expect(SupabaseSync.listQuotes()).resolves.toEqual([]);
            await expect(SupabaseSync.deleteQuote('q1')).resolves.toEqual({ ok: false, skipped: true });

            // schedulePush is sync but must not enqueue anything.
            expect(SupabaseSync.schedulePush()).toBeUndefined();
            // init() returns false via the Supabase global when flag is off.
            await expect(SupabaseSync.init()).resolves.toBe(false);

            // No rows should have been written to either table.
            expect(mockClient._rows.user_blobs).toEqual([]);
            expect(mockClient._rows.user_quotes).toEqual([]);
        });

        test('schedulePush is a no-op when disabled even after repeated calls', async () => {
            jest.useFakeTimers();
            SupabaseSync.schedulePush();
            SupabaseSync.schedulePush();
            jest.advanceTimersByTime(5000);
            await Promise.resolve();
            expect(mockClient._rows.user_blobs).toEqual([]);
            jest.useRealTimers();
        });
    });

    describe('user_blobs round-trip', () => {
        beforeEach(() => { loadSupabaseSync({ session: USER_A, backend: 'supabase' }); });

        test('pushBlob then pullBlob returns the same ciphertext unchanged', async () => {
            // This is a representative AES-GCM base64 string — 64 bytes of random.
            const ciphertext = 'A0lMnop0U29tZVJhbmRvbUJhc2U2NDE1NjQxOTE0NDE1NjQxOTE0NEF6UT09';
            const push = await SupabaseSync.pushBlob('currentForm', ciphertext);
            expect(push).toEqual({ ok: true });

            const pulled = await SupabaseSync.pullBlob('currentForm');
            expect(pulled).not.toBeNull();
            expect(pulled.ciphertext).toBe(ciphertext);
            expect(pulled.device_id).toBe(SupabaseSync.deviceId);
            expect(typeof pulled.updated_at).toBe('string');
        });

        test('pushBlob upsert replaces an existing row for the same doc_key', async () => {
            await SupabaseSync.pushBlob('currentForm', 'cipher-v1');
            await SupabaseSync.pushBlob('currentForm', 'cipher-v2');
            const rows = mockClient._rows.user_blobs.filter(r => r.doc_key === 'currentForm');
            expect(rows).toHaveLength(1);
            expect(rows[0].ciphertext).toBe('cipher-v2');
        });

        test('pullBlob returns null when no row exists', async () => {
            const pulled = await SupabaseSync.pullBlob('noSuchDoc');
            expect(pulled).toBeNull();
        });

        test('deleteBlob removes the row', async () => {
            await SupabaseSync.pushBlob('currentForm', 'cipher');
            const del = await SupabaseSync.deleteBlob('currentForm');
            expect(del).toEqual({ ok: true });
            expect(await SupabaseSync.pullBlob('currentForm')).toBeNull();
        });
    });

    describe('RLS isolation (cross-user)', () => {
        test('user B cannot read a blob written by user A (returns null, not error)', async () => {
            // User A writes.
            loadSupabaseSync({ session: USER_A, backend: 'supabase' });
            await SupabaseSync.pushBlob('currentForm', 'A-only-payload');

            // Switch the same mock client's session to user B (simulates a
            // different client/JWT). We reuse the same mock rows store so we
            // can confirm isolation is enforced by the select filter, not by
            // the absence of data.
            mockClient._setSession(USER_B);

            const pulled = await SupabaseSync.pullBlob('currentForm');
            expect(pulled).toBeNull();
        });

        test('user B cannot read or list another user\'s quotes', async () => {
            loadSupabaseSync({ session: USER_A, backend: 'supabase' });
            await SupabaseSync.pushQuote(null, 'A-quote-1');
            await SupabaseSync.pushQuote(null, 'A-quote-2');

            mockClient._setSession(USER_B);

            const list = await SupabaseSync.listQuotes();
            expect(list).toEqual([]);
        });
    });

    describe('user_quotes round-trip', () => {
        beforeEach(() => { loadSupabaseSync({ session: USER_A, backend: 'supabase' }); });

        test('pushQuote creates a new row and returns its id', async () => {
            const result = await SupabaseSync.pushQuote(null, 'cipher-1');
            expect(result.ok).toBe(true);
            expect(typeof result.id).toBe('string');
            expect(result.id.length).toBeGreaterThan(0);
        });

        test('pushQuote with explicit id upserts', async () => {
            const explicitId = '11111111-1111-1111-1111-111111111111';
            await SupabaseSync.pushQuote(explicitId, 'cipher-first');
            await SupabaseSync.pushQuote(explicitId, 'cipher-second');

            const pulled = await SupabaseSync.pullQuote(explicitId);
            expect(pulled).not.toBeNull();
            expect(pulled.ciphertext).toBe('cipher-second');
        });

        test('listQuotes returns all rows, newest first', async () => {
            await SupabaseSync.pushQuote(null, 'c1');
            await new Promise(r => setTimeout(r, 2));
            await SupabaseSync.pushQuote(null, 'c2');

            const list = await SupabaseSync.listQuotes();
            expect(list).toHaveLength(2);
            // Mock sorts desc by updated_at, same as the real ORDER BY clause.
            expect(new Date(list[0].updated_at).getTime())
                .toBeGreaterThanOrEqual(new Date(list[1].updated_at).getTime());
        });

        test('deleteQuote removes just that row', async () => {
            const r1 = await SupabaseSync.pushQuote(null, 'keep');
            const r2 = await SupabaseSync.pushQuote(null, 'drop');
            await SupabaseSync.deleteQuote(r2.id);
            const remaining = await SupabaseSync.listQuotes();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].id).toBe(r1.id);
        });
    });

    describe('schedulePush sweep', () => {
        test('debounced push writes every DOC_LOCAL_KEYS entry that exists in localStorage', async () => {
            jest.useFakeTimers();
            loadSupabaseSync({ session: USER_A, backend: 'supabase' });

            // Seed a few localStorage keys per the DOC_LOCAL_KEYS mapping.
            localStorage.setItem(STORAGE_KEYS.FORM,         'cipher-form');
            localStorage.setItem(STORAGE_KEYS.CGL_STATE,    'cipher-cgl');
            localStorage.setItem(STORAGE_KEYS.REMINDERS,    'cipher-reminders');

            SupabaseSync.schedulePush();
            // Fire the 3 s debounce.
            jest.advanceTimersByTime(3500);
            jest.useRealTimers();

            // Drain pending microtasks from the Promise.allSettled chain.
            await new Promise(resolve => setImmediate(resolve));

            const docs = mockClient._rows.user_blobs.map(r => r.doc_key).sort();
            expect(docs).toEqual(['cglState', 'currentForm', 'reminders']);

            const form = mockClient._rows.user_blobs.find(r => r.doc_key === 'currentForm');
            expect(form.ciphertext).toBe('cipher-form');
            expect(form.user_id).toBe(USER_A.user.id);
        });
    });

    describe('no-auth case', () => {
        test('pushBlob skips when the session is missing', async () => {
            loadSupabaseSync({ session: null, backend: 'supabase' });
            const result = await SupabaseSync.pushBlob('currentForm', 'cipher');
            expect(result).toEqual({ ok: false, skipped: true });
            expect(mockClient._rows.user_blobs).toEqual([]);
        });
    });
});
