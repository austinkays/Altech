// js/sync-facade.js — Supabase-only sync + auth facade.
//
// Routes window.Sync / window.AuthFacade calls to SupabaseSync / SupabaseAuth.
// Firebase was removed entirely in the May 2026 Phase D cleanup; the legacy
// CloudSync / firebase-config / admin-panel modules no longer ship.
//
// This file exists so call sites that say `window.Sync.schedulePush()` or
// `AuthFacade.uid` don't have to know which backend is active — there's only
// one, but the indirection lets us swap in a different backend later without
// editing 30+ plugins.

'use strict';

(function () {
    function modern() { return (typeof window !== 'undefined') ? window.SupabaseSync : undefined; }

    function callSupabase(method, args, defaultValue) {
        const target = modern();
        if (target && typeof target[method] === 'function') {
            return target[method].apply(target, args);
        }
        return defaultValue;
    }

    // MFA gate: block writes until the user has a verified MFA factor. Opt-out
    // users (CLOUD_SYNC_DISABLED=true) are exempt — SupabaseAuth.mfaRequired()
    // already accounts for that.
    function mfaBlocksSync() {
        const sa = (typeof window !== 'undefined') ? window.SupabaseAuth : undefined;
        if (!sa || typeof sa.mfaRequired !== 'function') return false;
        return sa.mfaRequired();
    }

    // Agency policy gate: cloud sync is admin-only. Defaults to "blocked" if
    // SupabaseAuth isn't loaded yet (fail-closed on boot).
    function policyBlocksSync() {
        if (typeof window === 'undefined') return true;
        const a = window.SupabaseAuth;
        if (!a) return true;
        return a.isAdmin !== true;
    }

    // Combined gate: writes blocked if MFA missing OR non-admin. Reads stay
    // open so a demoted admin can inspect local data, and so admins during
    // the brief pre-profile-load boot window aren't fully cut off.
    function writeBlocked() {
        return mfaBlocksSync() || policyBlocksSync();
    }

    const Sync = {
        get backend() { return 'supabase'; },
        get isSupabase() { return true; },
        get mfaBlocked() { return mfaBlocksSync(); },
        get policyBlocked() { return policyBlocksSync(); },

        schedulePush(...args) {
            if (writeBlocked()) return undefined;
            return callSupabase('schedulePush', args);
        },
        pushToCloud(...args) {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            // Supabase doesn't expose a single pushToCloud; `pushAllBlobs` is
            // the equivalent sweep call. Map for backward-compat with the
            // legacy CloudSync.pushToCloud() callers.
            return callSupabase('pushAllBlobs', args, Promise.resolve());
        },
        pullFromCloud(...args) { return callSupabase('restoreFromCloud', args, Promise.resolve({ restored: [], skipped: [], failed: [] })); },
        fullSync(...args) {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return Promise.resolve()
                .then(() => callSupabase('restoreFromCloud', [], Promise.resolve()))
                .then(() => callSupabase('pushAllBlobs', args, Promise.resolve()));
        },
        refreshUI(...args) { return callSupabase('refreshUI', args); },

        init(...args)        { return callSupabase('init', args, Promise.resolve(false)); },
        pushBlob(...args)    {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return callSupabase('pushBlob', args, Promise.resolve({ ok: false, skipped: true }));
        },
        pullBlob(...args)    { return callSupabase('pullBlob', args, Promise.resolve(null)); },
        deleteBlob(...args)  {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return callSupabase('deleteBlob', args, Promise.resolve({ ok: false, skipped: true }));
        },
        pushQuote(...args)   {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return callSupabase('pushQuote', args, Promise.resolve({ ok: false, skipped: true }));
        },
        pullQuote(...args)   { return callSupabase('pullQuote', args, Promise.resolve(null)); },
        listQuotes(...args)  { return callSupabase('listQuotes', args, Promise.resolve([])); },
        // Recovery: pulls plain-JSON blobs from Supabase + decrypts + writes
        // to localStorage. Returns { restored, skipped, failed }.
        restoreFromCloud(...args) { return callSupabase('restoreFromCloud', args, Promise.resolve({ restored: [], skipped: [], failed: [] })); },
        deleteQuote(...args) {
            if (writeBlocked()) return Promise.resolve({ ok: false, skipped: mfaBlocksSync() ? 'mfa-required' : 'policy-blocked' });
            return callSupabase('deleteQuote', args, Promise.resolve({ ok: false, skipped: true }));
        },
    };

    window.Sync = Sync;

    // ── Legacy CloudSync compatibility shim ────────────────────────────────
    //
    // Firebase's CloudSync was removed in Phase D, but ~17 call sites still
    // say `CloudSync.*`: the account modal's Sync Now / keep-local / Delete
    // Cloud Data buttons, the glossary Save inline handler, and several
    // plugins' `if (typeof CloudSync!=='undefined' && CloudSync.schedulePush)`
    // guards. Without this object those throw ReferenceError (or silently
    // no-op behind the typeof guard). Route them to the live Sync facade and
    // add the two methods Sync doesn't carry (setDisabled, deleteCloudData).
    const CloudSync = {
        fullSync(...a) { return Sync.fullSync(...a); },
        schedulePush(...a) { return Sync.schedulePush(...a); },
        pushToCloud(...a) { return Sync.pushToCloud(...a); },

        // Opt out of cloud sync on this device. Local-only flag — the same key
        // SupabaseAuth's MFA-exempt check and Auth.showModal both read.
        setDisabled(disabled) {
            try {
                localStorage.setItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED, disabled ? 'true' : 'false');
            } catch (e) { /* storage may be unavailable */ }
            if (Sync.refreshUI) Sync.refreshUI();
            if (typeof App !== 'undefined' && App.toast) {
                App.toast(disabled
                    ? 'Cloud sync disabled — data stays on this device'
                    : 'Cloud sync enabled', { type: 'info' });
            }
            return disabled;
        },

        deleteCloudData() { return CloudSync._deleteCloudData(); },

        // Erase ALL of the signed-in user's synced rows. Calls SupabaseSync
        // directly (NOT the Sync.* wrappers) so it is intentionally NOT subject
        // to the admin-only writeBlocked() gate — self-erasure of your own
        // data is a right-to-erasure action, and RLS scopes every delete to
        // the caller's own rows. Cloud-only: localStorage is untouched, and
        // user_crypto_meta is deliberately preserved (vault-meta.js owns it;
        // deleting it would brick E2E key recovery).
        async _deleteCloudData() {
            const ans = window.prompt(
                'This permanently deletes ALL your synced cloud data (documents + quotes). ' +
                'Local data on this device is NOT affected.\n\nType DELETE to confirm:');
            if (ans !== 'DELETE') return;

            const ss = (typeof window !== 'undefined') ? window.SupabaseSync : null;
            if (!ss) {
                if (typeof App !== 'undefined' && App.toast) App.toast('Sync backend unavailable', { type: 'error' });
                return;
            }

            let docOk = 0, docFail = 0, qOk = 0, qFail = 0;
            try {
                for (const docKey of Object.keys(ss.DOC_LOCAL_KEYS || {})) {
                    const r = await ss.deleteBlob(docKey);
                    if (r && r.ok) docOk++; else docFail++;
                }
                const quotes = await ss.listQuotes();
                for (const q of (quotes || [])) {
                    const r = await ss.deleteQuote(q.id);
                    if (r && r.ok) qOk++; else qFail++;
                }
            } catch (e) {
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast('Cloud delete error: ' + (e && e.message ? e.message : e), { type: 'error' });
                }
            }

            const failed = docFail + qFail;
            const msg = `Cloud data deleted (${docOk} docs, ${qOk} quotes)` +
                (failed ? ` — ${failed} failed, retry to finish` : '');
            if (typeof App !== 'undefined' && App.toast) {
                App.toast(msg, { type: failed ? 'error' : 'success' });
            }
            if (typeof window !== 'undefined' && window.ActivityLog) {
                window.ActivityLog.add({
                    type: 'sync', area: 'supabase', ok: !failed,
                    message: failed ? `Cloud data delete: ${failed} doc/quote(s) failed` : 'Deleted all cloud data',
                });
            }
        },
    };
    window.CloudSync = CloudSync;

    // ── Auth facade ────────────────────────────────────────────────────────
    //
    // Same indirection pattern for auth — most plugins read `Auth.*` directly
    // (auth.js now thin-wraps SupabaseAuth), but `AuthFacade` lets code that
    // wants to be explicit about the backend reach for it.

    function modernAuth() { return (typeof window !== 'undefined') ? window.SupabaseAuth : undefined; }

    const AuthFacade = {
        get backend() { return 'supabase'; },
        get isSupabase() { return true; },
        get active() { return modernAuth(); },
        get supabase() { return modernAuth(); },

        get uid() {
            const a = modernAuth();
            return a ? (typeof a.uid === 'function' ? a.uid() : a.uid) || null : null;
        },
        get email() {
            const a = modernAuth();
            return a ? (typeof a.email === 'function' ? a.email() : a.email) || null : null;
        },
        get isSignedIn() {
            const a = modernAuth();
            return !!(a && (typeof a.isSignedIn === 'function' ? a.isSignedIn() : a.isSignedIn));
        },
        get isAdmin() {
            const a = modernAuth();
            return !!(a && (typeof a.isAdmin === 'function' ? a.isAdmin() : a.isAdmin));
        },
        get isBlocked() {
            const a = modernAuth();
            return !!(a && (typeof a.isBlocked === 'function' ? a.isBlocked() : a.isBlocked));
        },

        async signIn(email, password) {
            const a = modernAuth();
            if (!a) throw new Error('SupabaseAuth not loaded');
            return a.signIn(email, password);
        },
        async signUp(email, password, opts) {
            const a = modernAuth();
            if (!a) throw new Error('SupabaseAuth not loaded');
            return a.signUp(email, password, opts);
        },
        async sendPasswordReset(email) {
            const a = modernAuth();
            if (!a) throw new Error('SupabaseAuth not loaded');
            return a.sendPasswordReset(email);
        },
        async logout() {
            const a = modernAuth();
            if (a && typeof a.logout === 'function') return a.logout();
        },
        async apiFetch(url, options) {
            const a = modernAuth();
            if (a && typeof a.apiFetch === 'function') return a.apiFetch(url, options);
            return fetch(url, options);
        },
        onAuthStateChange(fn) {
            const a = modernAuth();
            if (a && typeof a.addAuthListener === 'function') return a.addAuthListener(fn);
        },
    };

    window.AuthFacade = AuthFacade;
})();
