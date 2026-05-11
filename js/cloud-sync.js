/**
 * Cloud Sync Module
 * Bidirectional sync between localStorage and Firestore
 * 
 * Data model in Firestore:
 *   users/{uid}/
 *     sync/settings    → { darkMode, deviceId, lastSync }
 *     sync/currentForm → { data: {...}, updatedAt, deviceId }
 *     sync/cglState    → { data: {...}, updatedAt, deviceId }
 *     sync/clientHistory → { data: [...], updatedAt, deviceId }
 *     sync/quickRefCards → { data: [...], updatedAt, deviceId }
 *     quotes/{quoteId} → { ...quote, updatedAt, deviceId }
 * 
 * Conflict strategy: "Keep both" — if remote updatedAt > local lastSync,
 * creates a conflict copy so the user can review/merge manually.
 */

const CloudSync = (() => {
    // ── Constants ──
    const DEVICE_ID = _getOrCreateDeviceId();
    const SYNC_DEBOUNCE_MS = 3000; // Debounce cloud writes
    const SYNC_META_KEY = STORAGE_KEYS.SYNC_META; // localStorage key for sync metadata

    // ── Policy gate ──────────────────────────────────────────────────────────
    // Agency policy: cloud sync is restricted to admin accounts until the
    // Path B Phase 4 migration ships (end-to-end encrypted Supabase backend).
    // Non-admin accounts stay local-only so plaintext client NPI never leaves
    // the browser via Firestore. This gate cannot be overridden from the UI —
    // `isAdmin` is a server-managed claim set in the user's Firestore profile.
    //
    // When Auth isn't loaded yet (during initial page boot), we conservatively
    // return true (blocked) — the admin's own first sync will fire on the next
    // debounce tick after their profile loads.
    function _policyBlocksSync() {
        if (typeof Auth === 'undefined') return true;
        return Auth.isAdmin !== true;
    }

    // Single source of truth for all synced Firestore documents (excludes quotes, which use a subcollection).
    // Each string is both the Firestore doc name under users/{uid}/sync/ AND the key in _getLocalData().
    // Add new sync types here; push & delete automatically pick them up.
    const SYNC_DOCS = [
        'settings', 'currentForm', 'cglState', 'clientHistory',
        'quickRefCards', 'quickRefNumbers', 'quickRefEmojis', 'reminders', 'glossary',
        'vaultData', 'vaultMeta',
        'commercialDraft', 'commercialQuotes',
        'carrierOverrides',
    ];

    // docType → STORAGE_KEYS slot. Used by _resolveConflict to apply the
    // user's "Use Cloud" choice for any synced doc generically — without
    // this, only currentForm and cglState had a write-back path. Keys not
    // listed here intentionally fall through to a no-op (the cloud version
    // wins on the *server*, but we don't have a local slot to update — the
    // next pullFromCloud will fetch the right thing).
    const DOC_LOCAL_KEYS = Object.freeze({
        currentForm:      STORAGE_KEYS.FORM,
        cglState:         STORAGE_KEYS.CGL_STATE,
        clientHistory:    STORAGE_KEYS.CLIENT_HISTORY,
        quickRefCards:    STORAGE_KEYS.QUICKREF_CARDS,
        quickRefNumbers:  STORAGE_KEYS.QUICKREF_NUMBERS,
        quickRefEmojis:   STORAGE_KEYS.QUICKREF_EMOJIS,
        reminders:        STORAGE_KEYS.REMINDERS,
        glossary:         STORAGE_KEYS.AGENCY_GLOSSARY,
        vaultMeta:        STORAGE_KEYS.ACCT_VAULT_META,
        commercialDraft:  STORAGE_KEYS.COMMERCIAL_DRAFT,
        commercialQuotes: STORAGE_KEYS.COMMERCIAL_QUOTES,
        carrierOverrides: STORAGE_KEYS.CARRIER_OVERRIDES,
    });

    // ── State ──
    let _debouncedPush = null;
    let _syncing = false;
    let _isPulling = false; // Guard: prevent push during pull operations
    let _lastSyncTime = 0;
    let _listeners = [];

    // ── Device ID (unique per browser) ──
    function _getOrCreateDeviceId() {
        let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
        if (!id) {
            id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
        }
        return id;
    }

    // ── Sync metadata ──
    function _getSyncMeta() {
        return Utils.tryParseLS(SYNC_META_KEY, {});
    }

    function _setSyncMeta(meta) {
        localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    }

    // ── Firestore helpers ──
    function _userDoc(path) {
        const uid = Auth.uid;
        if (!uid || !FirebaseConfig.db) return null;
        return FirebaseConfig.db.collection('users').doc(uid).collection('sync').doc(path);
    }

    function _quotesCol() {
        const uid = Auth.uid;
        if (!uid || !FirebaseConfig.db) return null;
        return FirebaseConfig.db.collection('users').doc(uid).collection('quotes');
    }

    // ── Notifications ──
    function _refreshSyncUI() {
        const statusEl = document.getElementById('authSyncStatus');
        const tsEl = document.getElementById('authSyncTimestamp');
        if (!statusEl) return;

        if (_policyBlocksSync()) {
            statusEl.textContent = 'Local-only (admin-restricted)';
            if (tsEl) tsEl.textContent = '';
            return;
        }
        if (localStorage.getItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED) === 'true') {
            statusEl.textContent = 'Disabled — local-only';
            if (tsEl) tsEl.textContent = '';
            return;
        }

        if (_syncing) {
            statusEl.textContent = 'Syncing…';
            return;
        }

        if (_lastSyncTime) {
            statusEl.textContent = 'Synced';
            if (tsEl) {
                const d = new Date(_lastSyncTime);
                const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const today = new Date();
                const isToday = d.toDateString() === today.toDateString();
                tsEl.textContent = isToday ? `Today at ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
            }
        } else {
            statusEl.textContent = 'Ready to sync';
            if (tsEl) tsEl.textContent = '';
        }
    }

    function _notify(message, type = 'info') {
        _listeners.forEach(fn => {
            try { fn({ message, type }); } catch (e) { console.error('[CloudSync] Listener error:', e); }
        });

        // Update the account modal sync status
        _refreshSyncUI();

        // Also show a toast if the App toast system exists
        const indicator = document.getElementById('syncIndicator');
        if (indicator) {
            indicator.textContent = message;
            indicator.className = `sync-indicator sync-${type}`;
            indicator.style.display = 'block';
            setTimeout(() => { indicator.style.display = 'none'; }, 3000);
        }
    }

    // ── Trim client history for cloud sync (Firestore 1MB doc limit) ──
    const _CH_ESSENTIAL_FIELDS = [
        'firstName', 'lastName', 'dob', 'gender', 'email', 'phone', 'maritalStatus',
        'coFirstName', 'coLastName', 'coDob', 'coEmail', 'coPhone',
        'hasCoApplicant', 'coRelationship',
        'address', 'addrStreet', 'city', 'addrCity', 'state', 'addrState', 'zip', 'addrZip', 'county',
        'qType', 'priorCarrier', 'priorYears',
        'dwellingType', 'yrBuilt', 'sqFt', 'roofType', 'constructionType',
        'dwelling', 'liability', 'deductibleAOP',
        'bodInjury', 'propDamage', 'compDed', 'collDed',
        'occupation', 'industry', 'education',
    ];
    function _trimClientHistoryForSync(clients) {
        if (!Array.isArray(clients)) return clients;
        // Cap at 25 entries for cloud (local keeps 50)
        const capped = clients.slice(0, 25);
        return capped.map(entry => {
            if (!entry || !entry.data) return entry;
            const slim = {};
            for (const k of _CH_ESSENTIAL_FIELDS) {
                if (entry.data[k] != null && entry.data[k] !== '') slim[k] = entry.data[k];
            }
            return { id: entry.id, name: entry.name, summary: entry.summary, savedAt: entry.savedAt, data: slim };
        });
    }

    // ── Crypto helpers for cross-device sync ──
    // Encrypted localStorage data (AES-256-GCM via CryptoHelper) uses a per-device key,
    // so raw encrypted blobs can't be decrypted on other devices. We decrypt before pushing
    // to Firestore (plaintext JSON, protected by Firebase Auth + owner-only rules + HTTPS +
    // Google at-rest encryption) and re-encrypt after pulling.

    /**
     * Decrypt a raw localStorage value for cloud push.
     * Returns the plaintext JS object, or null on failure.
     */
    async function _decryptForSync(raw) {
        if (!raw) return null;
        try {
            if (typeof CryptoHelper !== 'undefined' && CryptoHelper.decrypt) {
                const result = await CryptoHelper.decrypt(raw);
                if (result != null) return result;
            }
            // Fallback: try parsing as plain JSON (unencrypted or test env)
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
            return null;
        }
    }

    /**
     * Encrypt a plaintext JS object for localStorage storage.
     * Returns the encrypted string, or JSON.stringify fallback.
     */
    async function _encryptForStorage(data) {
        if (data == null) return null;
        try {
            if (typeof CryptoHelper !== 'undefined' && CryptoHelper.encrypt) {
                return await CryptoHelper.encrypt(data);
            }
        } catch (e) {
            console.warn('[CloudSync] Encrypt for storage failed, using JSON fallback:', e);
        }
        return JSON.stringify(data);
    }

    /**
     * Detect if a value from Firestore is in the old opaque encrypted format
     * (a base64 string that CryptoHelper produced) vs. plaintext JSON.
     * Old format: a long base64 string; plaintext: an object/array.
     */
    function _isOldEncryptedFormat(val) {
        if (typeof val === 'string') {
            // CryptoHelper.encrypt produces a base64 string; plaintext data is always an object/array
            // A base64 string won't start with { or [ and will be >50 chars
            return val.length > 50 && !/^\s*[\[{]/.test(val);
        }
        return false;
    }

    // ── Read local data (async — decrypts encrypted fields) ──
    async function _getLocalData() {
        const tryParse = (key) => {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        };

        // Decrypt encrypted fields so Firestore gets plaintext JSON
        const [currentForm, quotes, vaultData, commercialDraft, commercialQuotes] =
            await Promise.all([
                _decryptForSync(localStorage.getItem(STORAGE_KEYS.FORM)),
                _decryptForSync(localStorage.getItem(STORAGE_KEYS.QUOTES)),
                _decryptForSync(localStorage.getItem(STORAGE_KEYS.ACCT_VAULT)),
                _decryptForSync(localStorage.getItem(STORAGE_KEYS.COMMERCIAL_DRAFT)),
                _decryptForSync(localStorage.getItem(STORAGE_KEYS.COMMERCIAL_QUOTES)),
            ]);

        return {
            currentForm,
            quotes,
            cglState: tryParse(STORAGE_KEYS.CGL_STATE),
            clientHistory: _trimClientHistoryForSync(tryParse(STORAGE_KEYS.CLIENT_HISTORY)),
            quickRefCards: tryParse(STORAGE_KEYS.QUICKREF_CARDS),
            quickRefNumbers: tryParse(STORAGE_KEYS.QUICKREF_NUMBERS),
            quickRefEmojis: tryParse(STORAGE_KEYS.QUICKREF_EMOJIS),
            reminders: tryParse(STORAGE_KEYS.REMINDERS),
            glossary: localStorage.getItem(STORAGE_KEYS.AGENCY_GLOSSARY) || null,
            vaultData,
            vaultMeta: tryParse(STORAGE_KEYS.ACCT_VAULT_META),
            commercialDraft,
            commercialQuotes,
            carrierOverrides: tryParse(STORAGE_KEYS.CARRIER_OVERRIDES),
            settings: {
                darkMode: localStorage.getItem(STORAGE_KEYS.DARK_MODE) === 'true',
                theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'default',
            }
        };
    }

    // ── Write local data ──
    function _setLocalData(key, data) {
        if (data === null || data === undefined) return;
        try {
            if (typeof data === 'string') {
                localStorage.setItem(key, data);
            } else {
                localStorage.setItem(key, JSON.stringify(data));
            }
        } catch (e) {
            console.error('[CloudSync] Failed to write localStorage:', key, e);
        }
    }

    // ── Conflict detection ──
    function _hasConflict(remoteUpdatedAt, docType) {
        const meta = _getSyncMeta();
        const lastSync = meta[`lastSync_${docType}`] || 0;
        return remoteUpdatedAt > lastSync;
    }

    function _markSynced(docType) {
        const meta = _getSyncMeta();
        meta[`lastSync_${docType}`] = Date.now();
        _setSyncMeta(meta);
    }

    // ── Core sync operations ──

    /**
     * Push a single document to Firestore.
     *
     * Push-side conflict detection (new): before writing, fetch the remote
     * doc and check whether its updatedAt is newer than our last sync for
     * this docType. If so — AND the remote data actually differs from what
     * we're about to write — that means another device wrote since we last
     * pulled, so a blind overwrite would silently lose their work. Return
     * a conflict descriptor instead; pushToCloud collects these and routes
     * them to _showConflictDialog so the user picks remote vs. local.
     *
     * Pass options.skipConflictCheck=true to force a push (used by
     * _resolveConflict after the user has already picked "Keep Local").
     */
    async function _pushDoc(docPath, localData, docType, options = {}) {
        const ref = _userDoc(docPath);
        if (!ref || localData == null) return { ok: true, skipped: true };

        if (!options.skipConflictCheck) {
            try {
                const snap = await ref.get();
                if (snap.exists) {
                    const remote = snap.data();
                    const remoteTime = remote.updatedAt?.toMillis?.() || 0;
                    const remoteDevice = remote.deviceId;
                    // Other-device write since our last sync? Compare data to
                    // distinguish a real conflict from a same-payload echo
                    // (e.g. another device wrote the identical value).
                    if (remoteDevice !== DEVICE_ID
                            && _hasConflict(remoteTime, docType)
                            && JSON.stringify(remote.data) !== JSON.stringify(localData)) {
                        console.warn(`[CloudSync] Push aborted for ${docPath} — remote newer (device: ${remoteDevice}, time: ${new Date(remoteTime).toISOString()})`);
                        return {
                            ok: false,
                            conflict: true,
                            docType,
                            docPath,
                            remoteData: remote.data,
                            localData,
                            remoteTime,
                            remoteDevice,
                            localTime: _getSyncMeta()[`lastSync_${docType}`] || 0,
                        };
                    }
                }
            } catch (e) {
                // Read failure is non-fatal — fall through to the write. The
                // worst case is we miss the conflict; the cloud doc gets a
                // chance to be recovered from the user's other device.
                console.warn(`[CloudSync] Pre-push conflict check failed for ${docPath}:`, e.code || e.message || e);
            }
        }

        try {
            await ref.set({
                data: localData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deviceId: DEVICE_ID,
                docType
            }, { merge: true });
            _markSynced(docType);
            return { ok: true };
        } catch (e) {
            console.error(`[CloudSync] Push failed for ${docPath}:`, e.code || e.message || e);
            return { ok: false, docPath, error: e };
        }
    }

    /**
     * Pull a single document from Firestore, handling conflicts
     */
    async function _pullDoc(docPath, localStorageKey, docType) {
        const ref = _userDoc(docPath);
        if (!ref) return null;

        try {
            const snap = await ref.get();
            if (!snap.exists) return null;

            const remote = snap.data();
            const remoteData = remote.data;
            const remoteTime = remote.updatedAt?.toMillis?.() || 0;
            const remoteDevice = remote.deviceId;

            // No conflict if same device or first sync
            if (remoteDevice === DEVICE_ID || !_hasConflict(remoteTime, docType)) {
                if (localStorageKey != null) _setLocalData(localStorageKey, remoteData);
                _markSynced(docType);
                return { data: remoteData, conflict: false };
            }

            // Conflict! Keep both versions
            const localData = Utils.tryParseLS(localStorageKey, null);

            if (localData && JSON.stringify(localData) !== JSON.stringify(remoteData)) {
                return {
                    data: remoteData,
                    localData,
                    conflict: true,
                    remoteDevice,
                    remoteTime
                };
            }

            // Data is identical, no real conflict
            if (localStorageKey != null) _setLocalData(localStorageKey, remoteData);
            _markSynced(docType);
            return { data: remoteData, conflict: false };
        } catch (e) {
            console.error(`[CloudSync] Pull failed for ${docPath}:`, e);
            return null;
        }
    }

    /**
     * Sync quotes collection (array ↔ Firestore documents)
     */
    async function _pushQuotes(localQuotes) {
        const col = _quotesCol();
        if (!col || !localQuotes?.length) return;

        const batch = FirebaseConfig.db.batch();
        for (const quote of localQuotes) {
            const ref = col.doc(quote.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
            batch.set(ref, {
                ...quote,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deviceId: DEVICE_ID
            }, { merge: true });
        }
        await Promise.race([
            batch.commit(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('[CloudSync] Firestore batch commit timed out')), 15_000)
            )
        ]);
        _markSynced('quotes');
    }

    async function _pullQuotes() {
        const col = _quotesCol();
        if (!col) return [];

        try {
            const snap = await col.orderBy('updatedAt', 'desc').get();
            const remoteQuotes = [];
            snap.forEach(doc => {
                const data = doc.data();
                remoteQuotes.push({
                    ...data,
                    id: doc.id,
                    _remoteUpdatedAt: data.updatedAt?.toMillis?.() || 0,
                    _remoteDeviceId: data.deviceId
                });
            });
            return remoteQuotes;
        } catch (e) {
            console.error('[CloudSync] Pull quotes failed:', e);
            return [];
        }
    }

    /**
     * Merge remote + local quotes, detecting conflicts
     */
    function _mergeQuotes(localQuotes, remoteQuotes) {
        const localMap = new Map((localQuotes || []).map(q => [q.id, q]));
        const remoteMap = new Map(remoteQuotes.map(q => [q.id, q]));
        const merged = [];
        const conflicts = [];

        // All remote quotes
        for (const [id, remote] of remoteMap) {
            const local = localMap.get(id);
            if (!local) {
                // New from cloud — add it
                const { _remoteUpdatedAt, _remoteDeviceId, updatedAt, deviceId, ...cleanRemote } = remote;
                merged.push(cleanRemote);
            } else {
                // Exists locally — check conflict
                const remoteTime = remote._remoteUpdatedAt || 0;
                const meta = _getSyncMeta();
                const lastSync = meta.lastSync_quotes || 0;

                if (remoteTime > lastSync && remote._remoteDeviceId !== DEVICE_ID) {
                    // Modified on another device since last sync
                    const localClean = { ...local };
                    const { _remoteUpdatedAt, _remoteDeviceId, updatedAt, deviceId, ...remoteClean } = remote;

                    if (JSON.stringify(localClean.data) !== JSON.stringify(remoteClean.data)) {
                        // Real conflict — keep both
                        merged.push(localClean);
                        const conflictCopy = {
                            ...remoteClean,
                            id: remoteClean.id + '_conflict_' + Date.now(),
                            name: (remoteClean.name || 'Quote') + ' (conflict copy)',
                            _isConflict: true,
                            _originalId: id
                        };
                        merged.push(conflictCopy);
                        conflicts.push({ localId: id, conflictId: conflictCopy.id });
                    } else {
                        merged.push(localClean);
                    }
                } else {
                    merged.push(local);
                }
            }
            localMap.delete(id);
        }

        // Remaining local-only quotes
        for (const [, local] of localMap) {
            merged.push(local);
        }

        return { merged, conflicts };
    }

    // ── Public API ──
    return {
        // Exposed for SupabaseSync (Path B Phase 2) so both backends sweep
        // the same doc set. Frozen to prevent accidental mutation.
        SYNC_DOCS: Object.freeze(SYNC_DOCS.slice()),

        get isSyncing() { return _syncing; },
        get deviceId() { return DEVICE_ID; },
        get isAvailable() { return FirebaseConfig.isReady && Auth.isSignedIn; },

        // Sync gate — trips for EITHER the user-facing opt-out checkbox OR the
        // admin-only agency policy. When true, schedulePush/pushToCloud/
        // pullFromCloud/fullSync are no-ops. Intentionally does NOT gate
        // deleteCloudData: a user whose sync is off should still be able to
        // scrub residue (policy-blocked users don't have residue to scrub
        // unless they were previously admin and got demoted).
        get disabledByUser() {
            return _policyBlocksSync() || localStorage.getItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED) === 'true';
        },
        // Raw user opt-out flag — admin panel / settings UI reads this to know
        // whether to show the toggle as checked. Separate from the policy gate
        // so we can render "Disabled by policy" vs "You disabled this" distinctly.
        get disabledByUserOptOut() { return localStorage.getItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED) === 'true'; },
        get disabledByPolicy() { return _policyBlocksSync(); },

        refreshUI() { _refreshSyncUI(); },

        setDisabled(disabled) {
            if (disabled) {
                localStorage.setItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED, 'true');
                if (_debouncedPush && typeof _debouncedPush.cancel === 'function') _debouncedPush.cancel();
                _notify('☁️ Cloud sync disabled — data stays on this device', 'info');
            } else {
                // Re-enable is user-initiated; do NOT auto-fullSync — that would pull-then-push
                // and could overwrite local edits made while sync was off. User clicks
                // "Sync Now" when ready to reconcile.
                localStorage.removeItem(STORAGE_KEYS.CLOUD_SYNC_DISABLED);
                _notify('☁️ Cloud sync re-enabled — click Sync Now when ready', 'success');
            }
            _refreshSyncUI();
        },

        /**
         * Register a sync event listener
         * @param {Function} fn - Called with { message, type }
         */
        onSync(fn) {
            _listeners.push(fn);
        },

        /**
         * Push all local data to Firestore
         * @param {Object} options - { settingsOnly: bool }
         */
        async pushToCloud(options = {}) {
            if (!this.isAvailable) return;
            if (this.disabledByUser) return;
            if (_syncing) return;
            _syncing = true;

            try {
                const local = await _getLocalData();

                if (options.settingsOnly) {
                    await _pushDoc('settings', local.settings, 'settings');
                    _syncing = false;
                    _refreshSyncUI();
                    return;
                }

                // Push all data types in parallel (tolerant of individual failures)
                const results = await Promise.allSettled([
                    ...SYNC_DOCS.map(key => _pushDoc(key, local[key], key)),
                    local.quotes?.length ? _pushQuotes(local.quotes) : Promise.resolve()
                ]);

                // Collect push-side conflicts surfaced by _pushDoc. The user
                // picks remote vs. local in one consolidated dialog instead of
                // one popup per conflicted doc.
                const pushConflicts = results
                    .filter(r => r.status === 'fulfilled' && r.value && r.value.conflict)
                    .map(r => r.value);
                if (pushConflicts.length > 0) {
                    const labelFor = {
                        currentForm: '📝 Current Form',
                        cglState: '🛡️ CGL Compliance State',
                        clientHistory: '👥 Client History',
                        reminders: '⏰ Reminders',
                        quickRefCards: '🗂️ Quick Reference Cards',
                        quickRefNumbers: '🗂️ Quick Reference Numbers',
                        quickRefEmojis: '🗂️ Quick Reference Emojis',
                        glossary: '📚 Glossary',
                        carrierOverrides: '🎯 Carrier Rules',
                        commercialDraft: '🏢 Commercial Draft',
                        vaultData: '🔐 Vault Data',
                        vaultMeta: '🔐 Vault Meta',
                    };
                    const conflictsForDialog = pushConflicts.map(c => ({
                        type: labelFor[c.docType] || c.docType,
                        docType: c.docType,
                        remote: c.remoteData,
                        local: c.localData,
                        remoteTime: c.remoteTime,
                        localTime: c.localTime,
                        // Tag as push-side so _resolveConflict can route to the
                        // right write path.
                        pushSide: true,
                    }));
                    if (window.ActivityLog) {
                        window.ActivityLog.add({
                            type: 'sync', area: 'firebase', ok: false,
                            message: `Sync conflict — ${pushConflicts.length} doc${pushConflicts.length === 1 ? '' : 's'} need review`,
                            detail: pushConflicts.map(c => c.docType).join(', '),
                        });
                    }
                    _notify(`⚠️ ${pushConflicts.length} sync conflict${pushConflicts.length === 1 ? '' : 's'} — review needed`, 'warning');
                    this._showConflictDialog(conflictsForDialog);
                }

                const failures = results.filter(r => r.status === 'rejected' || (r.value && r.value.ok === false && !r.value.conflict));
                if (failures.length > 0) {
                    console.warn(`[CloudSync] ${failures.length}/${results.length} doc(s) failed to push`);
                    failures.forEach(f => {
                        const detail = f.reason || f.value?.error;
                        if (detail) console.warn('[CloudSync] Failure detail:', detail.code || detail.message || detail);
                    });
                }

                // Only show error if ALL non-skipped docs failed
                const attempted = results.filter(r => !(r.value && r.value.skipped));
                const succeeded = attempted.filter(r => r.status === 'fulfilled' && r.value && r.value.ok);
                if (attempted.length > 0 && succeeded.length === 0) {
                    _notify('Sync failed — changes saved locally', 'error');
                    if (window.ActivityLog) window.ActivityLog.add({
                        type: 'sync', area: 'firebase', ok: false,
                        message: 'Cloud sync failed — changes saved locally',
                        detail: failures.map(f => (f.reason && f.reason.message) || (f.value && f.value.error && f.value.error.message) || '').filter(Boolean).slice(0, 3).join('; '),
                    });
                } else {
                    _lastSyncTime = Date.now();
                    if (failures.length === 0) {
                        _notify('☁️ Synced to cloud', 'success');
                        if (window.ActivityLog) window.ActivityLog.add({
                            type: 'sync', area: 'firebase', ok: true,
                            message: `Synced ${succeeded.length} doc${succeeded.length === 1 ? '' : 's'} to cloud`,
                        });
                    } else if (window.ActivityLog) {
                        // Partial success — surface as a warning so the user knows
                        // some docs didn't make it but the rest are safe.
                        window.ActivityLog.add({
                            type: 'sync', area: 'firebase', ok: false,
                            message: `Partial sync — ${failures.length}/${attempted.length} docs failed`,
                            detail: failures.slice(0, 3).map(f => (f.reason && f.reason.message) || '').filter(Boolean).join('; '),
                        });
                    }
                }
                console.log('[CloudSync] Push complete');
            } catch (e) {
                console.error('[CloudSync] Push error:', e.code || e.message || e);
                if (window.ActivityLog) window.ActivityLog.add({
                    type: 'sync', area: 'firebase', ok: false,
                    message: 'Cloud sync errored',
                    detail: e && (e.message || e.code) || String(e),
                });
                // Don't show toast for transient/network errors during background sync
            } finally {
                _syncing = false;
                _refreshSyncUI();
            }
        },

        /**
         * Pull all cloud data to local, handling conflicts
         * Called on login and periodic sync
         */
        async pullFromCloud() {
            if (!this.isAvailable) return;
            if (this.disabledByUser) return;
            if (_syncing) return;
            _syncing = true;
            _isPulling = true; // Prevent push triggers during pull

            try {
                const conflicts = [];

                // Pull settings (no conflict — always take latest)
                const settingsResult = await _pullDoc('settings', null, 'settings');
                if (settingsResult?.data) {
                    if (settingsResult.data.darkMode !== undefined) {
                        localStorage.setItem(STORAGE_KEYS.DARK_MODE, settingsResult.data.darkMode);
                        if (typeof App !== 'undefined' && App.loadDarkMode) App.loadDarkMode();
                    }
                    if (settingsResult.data.theme) {
                        localStorage.setItem(STORAGE_KEYS.THEME, settingsResult.data.theme);
                        if (typeof App !== 'undefined' && App.loadTheme) App.loadTheme();
                    }
                }

                // Pull form data (conflict possible — decrypt on pull for cross-device support)
                const formResult = await _pullDoc('currentForm', null, 'currentForm');
                if (formResult?.data != null) {
                    // Handle old encrypted format (base64 from pre-cross-device sync)
                    let formData = formResult.data;
                    if (_isOldEncryptedFormat(formData)) {
                        const decrypted = await _decryptForSync(formData);
                        formData = decrypted || formData; // keep raw if decrypt fails (different device)
                    }

                    // Conflict detection: decrypt local for comparison
                    const localDecrypted = await _decryptForSync(localStorage.getItem(STORAGE_KEYS.FORM));
                    if (typeof formData === 'object' && localDecrypted &&
                        JSON.stringify(localDecrypted) !== JSON.stringify(formData) &&
                        formResult.data !== undefined) {
                        // Check if this is from a different device with newer data
                        const meta = _getSyncMeta();
                        const lastSync = meta['lastSync_currentForm'] || 0;
                        const remoteTime = formResult.remoteTime || 0;
                        if (remoteTime > lastSync) {
                            conflicts.push({
                                type: 'Current Form',
                                remote: formData,
                                local: localDecrypted,
                                remoteTime: remoteTime,
                                localTime: lastSync
                            });
                        }
                    }

                    if (typeof formData === 'object' && !formResult.conflict) {
                        // Encrypt plaintext and store locally
                        const encrypted = await _encryptForStorage(formData);
                        if (encrypted) localStorage.setItem(STORAGE_KEYS.FORM, encrypted);
                        _markSynced('currentForm');
                        if (typeof App !== 'undefined') {
                            App.data = formData;
                            if (App.load) await App.load();
                        }
                    }
                }

                // Pull CGL state
                const cglResult = await _pullDoc('cglState', STORAGE_KEYS.CGL_STATE, 'cglState');
                if (cglResult?.conflict) {
                    conflicts.push({
                        type: 'CGL Compliance State',
                        remote: cglResult.data,
                        local: cglResult.localData,
                        remoteTime: cglResult.remoteTime,
                        localTime: _getSyncMeta()['lastSync_cglState'] || 0
                    });
                }
                // Reload CGL in-memory state after cloud pull
                // Re-run renewal check to clean up stale markers resurrected by cloud data
                if (cglResult?.data && typeof ComplianceDashboard !== 'undefined' && ComplianceDashboard.loadState) {
                    ComplianceDashboard.loadState();
                    if (ComplianceDashboard.policies?.length > 0 && ComplianceDashboard.checkForRenewals) {
                        ComplianceDashboard.checkForRenewals();
                        if (ComplianceDashboard.filterPolicies) ComplianceDashboard.filterPolicies();
                    }
                }

                // Pull client history
                await _pullDoc('clientHistory', STORAGE_KEYS.CLIENT_HISTORY, 'clientHistory');

                // Pull Quick Reference cards
                const qrResult = await _pullDoc('quickRefCards', STORAGE_KEYS.QUICKREF_CARDS, 'quickRefCards');
                if (qrResult?.data && typeof QuickRef !== 'undefined') {
                    QuickRef.cards = qrResult.data;
                    if (QuickRef.renderCards) QuickRef.renderCards();
                }

                // Pull Quick Reference numbers
                const qnResult = await _pullDoc('quickRefNumbers', STORAGE_KEYS.QUICKREF_NUMBERS, 'quickRefNumbers');
                if (qnResult?.data && typeof QuickRef !== 'undefined') {
                    QuickRef.numbers = qnResult.data;
                    if (QuickRef.renderNumbers) QuickRef.renderNumbers();
                }

                // Pull Quick Reference emojis
                const qeResult = await _pullDoc('quickRefEmojis', STORAGE_KEYS.QUICKREF_EMOJIS, 'quickRefEmojis');
                if (qeResult?.data && typeof QuickRef !== 'undefined') {
                    QuickRef.emojis = qeResult.data;
                    if (QuickRef.renderEmojis) QuickRef.renderEmojis();
                }

                // Pull Reminders
                const remResult = await _pullDoc('reminders', STORAGE_KEYS.REMINDERS, 'reminders');
                if (remResult?.data && typeof Reminders !== 'undefined') {
                    Reminders.state = remResult.data;
                    if (Reminders.render) Reminders.render();
                }

                // Pull Commercial Quoter draft + saved quotes (encrypted locally)
                const commDraftResult = await _pullDoc('commercialDraft', null, 'commercialDraft');
                if (commDraftResult?.data != null) {
                    let draftData = commDraftResult.data;
                    if (_isOldEncryptedFormat(draftData)) {
                        draftData = await _decryptForSync(draftData) || draftData;
                    }
                    if (typeof draftData === 'object') {
                        const encrypted = await _encryptForStorage(draftData);
                        if (encrypted) localStorage.setItem(STORAGE_KEYS.COMMERCIAL_DRAFT, encrypted);
                    } else {
                        // Old format that couldn't be decrypted — store as-is (same device may still decrypt)
                        localStorage.setItem(STORAGE_KEYS.COMMERCIAL_DRAFT, typeof draftData === 'string' ? draftData : JSON.stringify(draftData));
                    }
                    _markSynced('commercialDraft');
                    if (typeof CommercialQuoter !== 'undefined' && CommercialQuoter.render) CommercialQuoter.render();
                }
                const commQuotesResult = await _pullDoc('commercialQuotes', null, 'commercialQuotes');
                if (commQuotesResult?.data != null) {
                    let quotesData = commQuotesResult.data;
                    if (_isOldEncryptedFormat(quotesData)) {
                        quotesData = await _decryptForSync(quotesData) || quotesData;
                    }
                    if (typeof quotesData === 'object' || Array.isArray(quotesData)) {
                        const encrypted = await _encryptForStorage(quotesData);
                        if (encrypted) localStorage.setItem(STORAGE_KEYS.COMMERCIAL_QUOTES, encrypted);
                    } else {
                        localStorage.setItem(STORAGE_KEYS.COMMERCIAL_QUOTES, typeof quotesData === 'string' ? quotesData : JSON.stringify(quotesData));
                    }
                    _markSynced('commercialQuotes');
                }

                // Pull Agency Glossary
                const glossaryResult = await _pullDoc('glossary', null, 'glossary');
                if (glossaryResult?.data != null) {
                    localStorage.setItem(STORAGE_KEYS.AGENCY_GLOSSARY, typeof glossaryResult.data === 'string' ? glossaryResult.data : JSON.stringify(glossaryResult.data));
                    const glossaryEl = document.getElementById('agencyGlossaryText');
                    if (glossaryEl) glossaryEl.value = localStorage.getItem(STORAGE_KEYS.AGENCY_GLOSSARY) || '';
                }

                // Pull Vault (encrypt on pull for local storage, plaintext in Firestore)
                const vaultDataResult = await _pullDoc('vaultData', null, 'vaultData');
                if (vaultDataResult?.data != null) {
                    let vaultPlaintext = vaultDataResult.data;
                    if (_isOldEncryptedFormat(vaultPlaintext)) {
                        vaultPlaintext = await _decryptForSync(vaultPlaintext) || vaultPlaintext;
                    }
                    if (typeof vaultPlaintext === 'object') {
                        const encrypted = await _encryptForStorage(vaultPlaintext);
                        if (encrypted) localStorage.setItem(STORAGE_KEYS.ACCT_VAULT, encrypted);
                    } else {
                        // Old format that couldn't be decrypted — store as-is
                        localStorage.setItem(STORAGE_KEYS.ACCT_VAULT, typeof vaultPlaintext === 'string' ? vaultPlaintext : JSON.stringify(vaultPlaintext));
                    }
                    _markSynced('vaultData');
                }
                const vaultMetaResult = await _pullDoc('vaultMeta', null, 'vaultMeta');
                if (vaultMetaResult?.data != null) {
                    _setLocalData(STORAGE_KEYS.ACCT_VAULT_META, vaultMetaResult.data);
                }

                // Pull Carrier Rule Overrides (user-edited carrier rules from Broadform / Carrier Fit)
                const carrierOverridesResult = await _pullDoc('carrierOverrides', STORAGE_KEYS.CARRIER_OVERRIDES, 'carrierOverrides');
                if (carrierOverridesResult?.data != null && typeof window.BroadformData !== 'undefined') {
                    try { window.BroadformData.applyOverrides(carrierOverridesResult.data); } catch (e) { /* ok */ }
                }

                // Pull quotes (merge strategy — quotes stored encrypted locally)
                const remoteQuotes = await _pullQuotes();
                if (remoteQuotes.length > 0) {
                    // Decrypt local quotes for merge comparison
                    const localDecryptedQuotes = await _decryptForSync(localStorage.getItem(STORAGE_KEYS.QUOTES));
                    let localQuotes = Array.isArray(localDecryptedQuotes) ? localDecryptedQuotes : [];

                    const { merged, conflicts: quoteConflicts } = _mergeQuotes(localQuotes, remoteQuotes);
                    // Encrypt merged quotes back to localStorage
                    const encryptedQuotes = await _encryptForStorage(merged);
                    if (encryptedQuotes) localStorage.setItem(STORAGE_KEYS.QUOTES, encryptedQuotes);
                    _markSynced('quotes');

                    if (quoteConflicts.length) {
                        conflicts.push({
                            type: 'Saved Quotes',
                            quoteConflicts
                        });
                    }

                    // Refresh quotes UI if visible
                    if (typeof App !== 'undefined' && App.renderQuotesList) {
                        App.renderQuotesList();
                    }
                }

                _lastSyncTime = Date.now();

                // Show conflict resolution if needed
                if (conflicts.length > 0) {
                    _notify(`⚠️ ${conflicts.length} conflict(s) found — review needed`, 'warning');
                    this._showConflictDialog(conflicts);
                } else {
                    _notify('☁️ Synced from cloud', 'success');
                }

                console.log('[CloudSync] Pull complete, conflicts:', conflicts.length);
            } catch (e) {
                _notify('Sync failed — using local data', 'error');
                console.error('[CloudSync] Pull error:', e);
            } finally {
                _isPulling = false;
                _syncing = false;
                _refreshSyncUI();
            }
        },

        /**
         * Debounced push — call after every local save
         */
        schedulePush() {
            if (!this.isAvailable || _isPulling) return;
            if (this.disabledByUser) return;
            if (!_debouncedPush) _debouncedPush = Utils.debounce(() => this.pushToCloud(), SYNC_DEBOUNCE_MS);
            _debouncedPush();
        },

        /**
         * Manual full sync (pull then push)
         */
        async fullSync() {
            if (!this.isAvailable) {
                _notify('Sign in to sync across devices', 'info');
                return;
            }
            if (this.disabledByUser) {
                _notify('Cloud sync is disabled — re-enable it in Account → Sync', 'info');
                return;
            }
            await this.pullFromCloud();
            await this.pushToCloud();
        },

        /**
         * Delete all cloud data for current user
         */
        async deleteCloudData() {
            if (!this.isAvailable) return;

            if (!confirm('Delete all cloud data? Local data will be kept.')) return;

            try {
                const uid = Auth.uid;
                const db = FirebaseConfig.db;

                // Delete sync docs
                await Promise.all(SYNC_DOCS.map(doc =>
                    db.collection('users').doc(uid).collection('sync').doc(doc).delete()
                ));

                // Delete quotes
                const quotesSnap = await _quotesCol().get();
                const batch = db.batch();
                quotesSnap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();

                // Clear sync metadata
                localStorage.removeItem(SYNC_META_KEY);

                _notify('Cloud data deleted', 'success');
            } catch (e) {
                console.error('[CloudSync] Delete failed:', e);
                _notify('Failed to delete cloud data', 'error');
            }
        },

        /**
         * Show conflict resolution dialog
         */
        _showConflictDialog(conflicts) {
            // Build a simple modal for conflict resolution
            let existing = document.getElementById('conflictDialog');
            if (existing) existing.remove();

            const dialog = document.createElement('div');
            dialog.id = 'conflictDialog';
            dialog.className = 'auth-modal-overlay';
            dialog.style.display = 'flex';

            // For currentForm and shallow-object docs, build a per-field diff
            // so the user can see exactly what's different before picking a
            // side. Skips noisy/internal keys (anything starting with _).
            function _buildConflictDiffHTML(c) {
                const remote = c.remote;
                const local = c.local;
                if (!remote || !local || typeof remote !== 'object' || typeof local !== 'object'
                        || Array.isArray(remote) || Array.isArray(local)) {
                    return '';
                }
                const esc = (window.Utils && Utils.escapeHTML) ? Utils.escapeHTML : (s => String(s ?? ''));
                const fmt = (v) => {
                    if (v == null || v === '') return '<em>(empty)</em>';
                    if (typeof v === 'object') return esc(JSON.stringify(v).slice(0, 80));
                    return esc(String(v));
                };
                const keys = new Set([
                    ...Object.keys(remote).filter(k => !k.startsWith('_')),
                    ...Object.keys(local).filter(k => !k.startsWith('_')),
                ]);
                const diffs = [];
                for (const k of keys) {
                    const rv = remote[k];
                    const lv = local[k];
                    // Cheap deep compare via JSON for nested values.
                    if (JSON.stringify(rv) === JSON.stringify(lv)) continue;
                    diffs.push({ key: k, local: lv, remote: rv });
                }
                if (diffs.length === 0) return '';
                const MAX = 12;
                const rows = diffs.slice(0, MAX).map(d => `
                    <tr>
                        <td class="conflict-diff-key">${esc(d.key)}</td>
                        <td class="conflict-diff-remote">${fmt(d.remote)}</td>
                        <td class="conflict-diff-local">${fmt(d.local)}</td>
                    </tr>`).join('');
                const overflowNote = diffs.length > MAX
                    ? `<div class="conflict-diff-more">… and ${diffs.length - MAX} more field${diffs.length - MAX === 1 ? '' : 's'}</div>`
                    : '';
                return `
                    <details class="conflict-diff">
                        <summary>Show ${diffs.length} difference${diffs.length === 1 ? '' : 's'}</summary>
                        <table class="conflict-diff-table">
                            <thead><tr><th>Field</th><th>☁️ Cloud</th><th>📱 Local</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                        ${overflowNote}
                    </details>
                `;
            }

            // Format timestamps for display
            function _fmtTime(ms) {
                if (!ms) return 'Unknown';
                const d = new Date(ms);
                const now = new Date();
                const isToday = d.toDateString() === now.toDateString();
                const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                if (isToday) return `Today at ${time}`;
                const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
                if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
                return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${time}`;
            }

            let conflictHTML = conflicts.map((c, i) => {
                const icon = c.type === 'CGL Compliance State' ? '🛡️' :
                             c.type === 'Current Form' ? '📝' :
                             c.type === 'Quick Reference Cards' ? '🗂️' : '📄';
                if (c.quoteConflicts) {
                    return `<div class="conflict-item">
                        <div class="conflict-item-header">
                            <span class="conflict-icon">${icon}</span>
                            <span class="conflict-label">${c.type}</span>
                        </div>
                        <p>${c.quoteConflicts.length} quote(s) modified on another device. Conflict copies created.</p>
                        <p class="conflict-hint">Review your Quote Library to merge or delete duplicates.</p>
                    </div>`;
                }
                const cloudNewer = (c.remoteTime || 0) >= (c.localTime || 0);
                const localNewer = (c.localTime || 0) > (c.remoteTime || 0);
                const cloudBadge = cloudNewer ? '<span class="conflict-newest">✦ Recommended</span>' : '';
                const localBadge = localNewer ? '<span class="conflict-newest">✦ Recommended</span>' : '';
                const diffHtml = _buildConflictDiffHTML(c);
                return `<div class="conflict-item">
                    <div class="conflict-item-header">
                        <span class="conflict-icon">${icon}</span>
                        <span class="conflict-label">${c.type}</span>
                    </div>
                    <p>Modified on another device since your last sync.</p>
                    <div class="conflict-actions">
                        <button class="btn-auth ${cloudNewer ? 'btn-auth-primary' : 'btn-auth-secondary'}" onclick="CloudSync._resolveConflict(${i}, 'remote')">
                            <span class="conflict-btn-content">
                                <span>☁️ Use Cloud</span>
                                <span class="conflict-timestamp">${_fmtTime(c.remoteTime)}</span>
                            </span>
                            ${cloudBadge}
                        </button>
                        <button class="btn-auth ${localNewer ? 'btn-auth-primary' : 'btn-auth-secondary'}" onclick="CloudSync._resolveConflict(${i}, 'local')">
                            <span class="conflict-btn-content">
                                <span>📱 Keep Local</span>
                                <span class="conflict-timestamp">${_fmtTime(c.localTime)}</span>
                            </span>
                            ${localBadge}
                        </button>
                    </div>
                    ${diffHtml}
                </div>`;
            }).join('');

            dialog.innerHTML = `
                <div class="auth-modal conflict-modal">
                    <button class="auth-close" onclick="document.getElementById('conflictDialog').remove()">&times;</button>
                    <div class="conflict-modal-icon">⚠️</div>
                    <div class="auth-modal-header">
                        <h3>Sync Conflict</h3>
                        <p class="auth-subtitle">Choose which version to keep</p>
                    </div>
                    <div class="auth-modal-body">
                        ${conflictHTML}
                    </div>
                </div>
            `;

            // Store conflicts for resolution
            dialog._conflicts = conflicts;
            document.body.appendChild(dialog);
        },

        /**
         * Resolve a single conflict
         */
        async _resolveConflict(index, choice) {
            const dialog = document.getElementById('conflictDialog');
            if (!dialog || !dialog._conflicts) return;

            const conflict = dialog._conflicts[index];
            if (!conflict) return;

            // docType is set on push-side conflicts (new path); fall back to
            // the type-label sniff for legacy pull-side conflicts.
            const docType = conflict.docType
                || (conflict.type === 'Current Form' ? 'currentForm'
                  : conflict.type === 'CGL Compliance State' ? 'cglState'
                  : null);

            if (docType === 'currentForm') {
                if (choice === 'remote') {
                    const encrypted = await _encryptForStorage(conflict.remote);
                    if (encrypted) localStorage.setItem(STORAGE_KEYS.FORM, encrypted);
                    if (typeof App !== 'undefined') {
                        App.data = conflict.remote;
                        if (App.load) App.load();
                    }
                    _markSynced('currentForm');
                } else {
                    // Force-push past the conflict check — the user just resolved it.
                    await _pushDoc('currentForm', conflict.local, 'currentForm', { skipConflictCheck: true });
                }
            } else if (docType === 'cglState') {
                if (choice === 'remote') {
                    _setLocalData(STORAGE_KEYS.CGL_STATE, conflict.remote);
                    _markSynced('cglState');
                    if (typeof ComplianceDashboard !== 'undefined' && ComplianceDashboard.init) {
                        ComplianceDashboard.init();
                    }
                } else {
                    await _pushDoc('cglState', conflict.local, 'cglState', { skipConflictCheck: true });
                }
            } else if (docType) {
                // Generic resolution for the other SYNC_DOCS (reminders, glossary,
                // commercialDraft, carrierOverrides, etc.) — same write semantics.
                const lsKey = DOC_LOCAL_KEYS[docType];
                if (choice === 'remote') {
                    if (lsKey) _setLocalData(lsKey, conflict.remote);
                    _markSynced(docType);
                } else {
                    await _pushDoc(docType, conflict.local, docType, { skipConflictCheck: true });
                }
            }

            // Remove resolved conflict from UI
            const item = dialog.querySelectorAll('.conflict-item')[index];
            if (item) {
                item.innerHTML = `<p style="color:var(--success-color,#34c759)">✓ Resolved — using ${choice} version</p>`;
            }

            // If all resolved, auto-close after delay
            const remaining = dialog.querySelectorAll('.conflict-actions');
            if (remaining.length === 0) {
                setTimeout(() => dialog.remove(), 1500);
            }
        },

        /**
         * Get sync status for UI
         */
        getStatus() {
            if (!FirebaseConfig.isReady) return { status: 'unavailable', label: 'Cloud sync not configured' };
            if (!Auth.isSignedIn) return { status: 'signed-out', label: 'Sign in to sync' };
            if (_syncing) return { status: 'syncing', label: 'Syncing...' };
            if (_lastSyncTime) {
                const ago = Math.round((Date.now() - _lastSyncTime) / 1000);
                const label = ago < 60 ? 'Synced just now' :
                              ago < 3600 ? `Synced ${Math.round(ago / 60)}m ago` :
                              `Synced ${Math.round(ago / 3600)}h ago`;
                return { status: 'synced', label };
            }
            return { status: 'ready', label: 'Ready to sync' };
        }
    };
})();
