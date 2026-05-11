// js/compliance-idb.js — IndexedDB wrapper for the CGL Compliance Dashboard.
// Extracted from compliance-dashboard.js during Phase 3 monolith decomposition (2026-04).
// Loaded BEFORE compliance-dashboard.js so the plugin IIFE can reference window.CglIDB.
'use strict';

const IDB_ANNOTATIONS_KEY = 'user_annotations';

window.CglIDB = {
    _db: null,
    DB_NAME: 'altech_cgl',
    STORE: 'cache',
    ANNOTATIONS_STORE: 'annotations',
    DB_VERSION: 2,

    async open() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    console.warn('[CGL] IndexedDB open timed out (upgrade may be blocked by another tab)');
                    reject(new Error('IndexedDB open timed out'));
                }
            }, 3000);

            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache');
                }
                if (!db.objectStoreNames.contains('annotations')) {
                    db.createObjectStore('annotations');
                }
                console.log('[CGL] IndexedDB upgraded to v' + this.DB_VERSION);
            };
            req.onblocked = () => {
                console.warn('[CGL] IndexedDB upgrade blocked — close other Altech tabs');
            };
            req.onsuccess = () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    this._db = req.result;
                    this._db.onversionchange = () => {
                        this._db.close();
                        this._db = null;
                    };
                    resolve(this._db);
                }
            };
            req.onerror = () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    reject(req.error);
                }
            };
        });
    },

    // Stored shape: { __sec: 'v1', ct: <base64 ciphertext> } when the value
    // was encrypted at write time, OR the raw JS value when CryptoHelper was
    // unavailable / locked at write time. .get() handles both transparently.
    _looksWrapped(v) {
        return v && typeof v === 'object' && v.__sec === 'v1' && typeof v.ct === 'string';
    },

    async _wrap(value) {
        if (typeof CryptoHelper === 'undefined' || !CryptoHelper.encrypt) return value;
        try {
            const ct = await CryptoHelper.encrypt(value);
            if (typeof ct === 'string' && ct.length > 40) return { __sec: 'v1', ct };
        } catch (e) {
            console.warn('[CGL IDB] encrypt-at-rest failed; storing plaintext:', (e && e.message) || e);
        }
        return value;
    },

    async _unwrap(stored) {
        if (!this._looksWrapped(stored)) return stored;
        if (typeof CryptoHelper === 'undefined' || !CryptoHelper.decrypt) return null;
        try { return await CryptoHelper.decrypt(stored.ct); }
        catch (e) {
            console.warn('[CGL IDB] decrypt-at-rest failed:', (e && e.message) || e);
            return null;
        }
    },

    async get(key, storeName) {
        const db = await this.open();
        const store = storeName || this.STORE;
        const raw = await new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        if (raw === undefined) return undefined;
        return await this._unwrap(raw);
    },

    async set(key, value, storeName) {
        const db = await this.open();
        const store = storeName || this.STORE;
        const wrapped = await this._wrap(value);
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(wrapped, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async del(key, storeName) {
        const db = await this.open();
        const store = storeName || this.STORE;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    // Convenience: annotation-specific methods (master source of truth)
    async getAnnotations() {
        return this.get(IDB_ANNOTATIONS_KEY, this.ANNOTATIONS_STORE);
    },
    async setAnnotations(value) {
        return this.set(IDB_ANNOTATIONS_KEY, value, this.ANNOTATIONS_STORE);
    },
    async clearAnnotations() {
        return this.del(IDB_ANNOTATIONS_KEY, this.ANNOTATIONS_STORE);
    }
};
