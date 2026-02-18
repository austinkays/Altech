/**
 * Firebase Configuration
 * 
 * Setup instructions:
 * 1. Go to https://console.firebase.google.com
 * 2. Create a new project (or use existing)
 * 3. Enable Authentication → Email/Password provider
 * 4. Create Firestore Database (start in production mode)
 * 5. Copy your config values below OR set them as Vercel env vars
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
    // Firebase project configuration
    // Set these values directly OR use Vercel environment variables via /api/firebase-config
    const _config = {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: ''
    };

    let _initialized = false;
    let _app = null;
    let _auth = null;
    let _db = null;

    return {
        /**
         * Initialize Firebase with config.
         * Uses the hardcoded config values above.
         */
        async init() {
            if (_initialized) return true;

            try {
                const config = { ..._config };

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
