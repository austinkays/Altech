// js/supabase-config.js — Supabase client bootstrap (Path B)
//
// Mirrors the firebase-config.js pattern: exposes window.Supabase.{ isReady, client }.
// Safe to load before keys are configured — isReady stays false and every caller
// checks it. No app behavior changes until Phase 1 wires up js/supabase-sync.js.
//
// Required env vars (exposed via /api/config?type=supabase-public — public anon
// key is safe to ship, RLS enforces access):
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
//
// These are pulled at runtime the same way firebase config is; see api/config.js.

'use strict';

(function initSupabaseConfig() {
    const Supabase = {
        isReady: false,
        client: null,
        url: null,

        async init() {
            if (this.isReady) return true;

            // @supabase/supabase-js UMD bundle must be loaded first (index.html <script>).
            if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
                // Library not loaded yet — this is fine during Phase 0, the script tag
                // is commented out until Phase 2.
                return false;
            }

            // Fetch config from the same endpoint pattern used for Firebase.
            let config;
            try {
                const res = await fetch('/api/config?type=supabase-public');
                if (!res.ok) {
                    console.warn('[Supabase] Config endpoint returned', res.status, '- staying disabled');
                    return false;
                }
                config = await res.json();
            } catch (e) {
                console.warn('[Supabase] Failed to fetch config:', e.message);
                return false;
            }

            if (!config.url || !config.anonKey) {
                console.warn('[Supabase] URL or anon key missing — staying disabled');
                return false;
            }

            try {
                this.client = window.supabase.createClient(config.url, config.anonKey, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: false, // App is not served from a /auth/callback route
                    },
                });
                this.url = config.url;
                this.isReady = true;
                console.log('[Supabase] Client ready');
                return true;
            } catch (e) {
                console.error('[Supabase] createClient failed:', e.message);
                return false;
            }
        },
    };

    window.Supabase = Supabase;
})();
