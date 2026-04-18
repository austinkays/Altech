// js/sync-facade.js — Path B Phase 2 sync backend router.
//
// Tiny shim that exposes window.Sync and routes a stable subset of methods
// to either CloudSync (Firebase, the current default) or SupabaseSync
// (Path B, still opt-in) based on localStorage[STORAGE_KEYS.SYNC_BACKEND].
//
// Default backend is 'firebase'. New and migrated call sites should prefer
// window.Sync.xxx over CloudSync.xxx; the Firebase path stays fully
// functional and is still exercised by every existing call site that
// references CloudSync directly. Phase 4 will migrate more of those to
// window.Sync once the Supabase migration flow flips the flag.

'use strict';

(function () {
    function backend() {
        try {
            return localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND) === 'supabase'
                ? 'supabase'
                : 'firebase';
        } catch {
            return 'firebase';
        }
    }

    function legacy() { return (typeof window !== 'undefined') ? window.CloudSync : undefined; }
    function modern() { return (typeof window !== 'undefined') ? window.SupabaseSync : undefined; }

    function call(method, args, defaultValue) {
        const target = backend() === 'supabase' ? modern() : legacy();
        if (target && typeof target[method] === 'function') {
            return target[method].apply(target, args);
        }
        return defaultValue;
    }

    function callSupabase(method, args, defaultValue) {
        const target = modern();
        if (target && typeof target[method] === 'function') {
            return target[method].apply(target, args);
        }
        return defaultValue;
    }

    const Sync = {
        get backend() { return backend(); },
        get isSupabase() { return backend() === 'supabase'; },

        // ── Methods shared by both backends ──
        schedulePush(...args)   { return call('schedulePush', args); },
        pushToCloud(...args)    { return call('pushToCloud', args, Promise.resolve()); },
        pullFromCloud(...args)  { return call('pullFromCloud', args, Promise.resolve()); },
        fullSync(...args)       { return call('fullSync', args, Promise.resolve()); },
        refreshUI(...args)      { return call('refreshUI', args); },
        deleteCloudData(...args){ return call('deleteCloudData', args, Promise.resolve()); },

        // ── Supabase-only methods (no-op on Firebase) ──
        init(...args)        { return callSupabase('init', args, Promise.resolve(false)); },
        pushBlob(...args)    { return callSupabase('pushBlob', args, Promise.resolve({ ok: false, skipped: true })); },
        pullBlob(...args)    { return callSupabase('pullBlob', args, Promise.resolve(null)); },
        deleteBlob(...args)  { return callSupabase('deleteBlob', args, Promise.resolve({ ok: false, skipped: true })); },
        pushQuote(...args)   { return callSupabase('pushQuote', args, Promise.resolve({ ok: false, skipped: true })); },
        pullQuote(...args)   { return callSupabase('pullQuote', args, Promise.resolve(null)); },
        listQuotes(...args)  { return callSupabase('listQuotes', args, Promise.resolve([])); },
        deleteQuote(...args) { return callSupabase('deleteQuote', args, Promise.resolve({ ok: false, skipped: true })); },
    };

    window.Sync = Sync;
})();
