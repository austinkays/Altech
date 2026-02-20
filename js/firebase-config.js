147931/**
 * Firebase Configuration
 * 
 * Config resolution order:
 * 1. Fetches from /api/config?type=firebase (env-var driven, production)
 * 2. Falls back to hardcoded values below (local dev)
 * 
 * To use env vars, set in Vercel Dashboard → Environment Variables:
 *   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
 *   FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID
 * 
 * Firestore Security Rules (paste in Firebase Console → Firestore → Rules):
 * 
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /users/{userId}/{document=**} {
 *         allow read, write: if request.auth != null && request.auth.uid == userId;
 *       }
 *     }
 *   }
 */

const FirebaseConfig = (() => {
    // Hardcoded fallback — used when env-based API config is unavailable (local dev)
    // In production, set FIREBASE_* env vars in Vercel and this code fetches from /api/config?type=firebase
    const _fallbackConfig = {
        apiKey: 'AIzaSyBoLK7NcAZwdRKNanGDi42lubXg2UlEL1U',
        authDomain: 'altech-app-5f3d0.firebaseapp.com',
        projectId: 'altech-app-5f3d0',
        storageBucket: 'altech-app-5f3d0.firebasestorage.app',
        messagingSenderId: '80158794755',
        appId: '1:80158794755:web:a7410b551a47ce554b1a36'
    };

    let _initialized = false;
    let _app = null;
    let _auth = null;
    let _db = null;

    /**
     * Try to load config from /api/config?type=firebase (env-var driven).
     * Falls back to hardcoded _fallbackConfig if the API is unavailable.
     */
    async function _resolveConfig() {
        try {
            const resp = await fetch('/api/config?type=firebase');
            if (resp.ok) {
                const data = await resp.json();
                if (data.apiKey && data.projectId) {
                    console.log('[Firebase] Config loaded from environment');
                    return data;
                }
            }
        } catch (_) {
            // Network error or local dev — fall through
        }
        console.log('[Firebase] Using fallback config');
        return { ..._fallbackConfig };
    }

    return {
        /**
         * Initialize Firebase with config.
         * Tries env-var API first, then falls back to hardcoded values.
         */
        async init() {
            if (_initialized) return true;

            try {
                const config = await _resolveConfig();

                if (!config.apiKey || !config.projectId) {
                    console.warn('[Firebase] No configuration found. Set values in js/firebase-config.js. Cloud sync disabled.');
                    return false;
                }

                // Initialize Firebase
                _app = firebase.initializeApp(config);
                _auth = firebase.auth();
                _db = firebase.firestore();

                // Enable offline persistence for Firestore
                try {
                    await _db.enablePersistence({ synchronizeTabs: true });
                } catch (e) {
                    if (e.code === 'failed-precondition') {
                        console.warn('[Firebase] Persistence unavailable (multiple tabs open)');
                    } else if (e.code === 'unimplemented') {
                        console.warn('[Firebase] Persistence not supported in this browser');
                    }
                }

                _initialized = true;
                console.log('[Firebase] Initialized successfully');
                return true;
            } catch (e) {
                console.error('[Firebase] Initialization failed:', e);
                return false;
            }
        },

        get app() { return _app; },
        get auth() { return _auth; },
        get db() { return _db; },
        get isReady() { return _initialized; },

        /**
         * Check if Firebase SDKs are loaded (CDN scripts)
         */
        get sdkLoaded() {
            return typeof firebase !== 'undefined' &&
                   typeof firebase.auth === 'function' &&
                   typeof firebase.firestore === 'function';
        }
    };
})();
