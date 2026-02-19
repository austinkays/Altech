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
    const SYNC_META_KEY = 'altech_sync_meta'; // localStorage key for sync metadata

    // ── State ──
    let _syncTimer = null;
    let _syncing = false;
    let _isPulling = false; // Guard: prevent push during pull operations
    let _lastSyncTime = 0;
    let _listeners = [];

    // ── Device ID (unique per browser) ──
    function _getOrCreateDeviceId() {
        let id = localStorage.getItem('altech_device_id');
        if (!id) {
            id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            localStorage.setItem('altech_device_id', id);
        }
        return id;
    }

    // ── Sync metadata ──
    function _getSyncMeta() {
        try {
            return JSON.parse(localStorage.getItem(SYNC_META_KEY)) || {};
        } catch { return {}; }
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
    function _notify(message, type = 'info') {
        _listeners.forEach(fn => {
            try { fn({ message, type }); } catch (e) { console.error('[CloudSync] Listener error:', e); }
        });

        // Also show a toast if the App toast system exists
        const indicator = document.getElementById('syncIndicator');
        if (indicator) {
            indicator.textContent = message;
            indicator.className = `sync-indicator sync-${type}`;
            indicator.style.display = 'block';
            setTimeout(() => { indicator.style.display = 'none'; }, 3000);
        }
    }

    // ── Read local data ──
    function _getLocalData() {
        const tryParse = (key) => {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        };

        return {
            currentForm: tryParse('altech_v6'),
            quotes: tryParse('altech_v6_quotes'),
            cglState: tryParse('altech_cgl_state'),
            clientHistory: tryParse('altech_client_history'),
            quickRefCards: tryParse('altech_quickref_cards'),
            reminders: tryParse('altech_reminders'),
            settings: {
                darkMode: localStorage.getItem('altech_dark_mode') === 'true',
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
     * Push a single document to Firestore
     */
    async function _pushDoc(docPath, localData, docType) {
        const ref = _userDoc(docPath);
        if (!ref || localData == null) return { ok: true, skipped: true };

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
                _setLocalData(localStorageKey, remoteData);
                _markSynced(docType);
                return { data: remoteData, conflict: false };
            }

            // Conflict! Keep both versions
            const localData = (() => {
                try { return JSON.parse(localStorage.getItem(localStorageKey)); } catch { return null; }
            })();

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
            _setLocalData(localStorageKey, remoteData);
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
        await batch.commit();
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
        get isSyncing() { return _syncing; },
        get deviceId() { return DEVICE_ID; },
        get isAvailable() { return FirebaseConfig.isReady && Auth.isSignedIn; },

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
            if (_syncing) return;
            _syncing = true;

            try {
                const local = _getLocalData();

                if (options.settingsOnly) {
                    await _pushDoc('settings', local.settings, 'settings');
                    _syncing = false;
                    return;
                }

                // Push all data types in parallel (tolerant of individual failures)
                const results = await Promise.allSettled([
                    _pushDoc('settings', local.settings, 'settings'),
                    _pushDoc('currentForm', local.currentForm, 'currentForm'),
                    _pushDoc('cglState', local.cglState, 'cglState'),
                    _pushDoc('clientHistory', local.clientHistory, 'clientHistory'),
                    _pushDoc('quickRefCards', local.quickRefCards, 'quickRefCards'),
                    _pushDoc('reminders', local.reminders, 'reminders'),
                    local.quotes?.length ? _pushQuotes(local.quotes) : Promise.resolve()
                ]);

                const failures = results.filter(r => r.status === 'rejected' || (r.value && r.value.ok === false));
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
                } else {
                    _lastSyncTime = Date.now();
                    if (failures.length === 0) {
                        _notify('☁️ Synced to cloud', 'success');
                    }
                    // Partial success: silently continue (no toast to avoid noise)
                }
                console.log('[CloudSync] Push complete');
            } catch (e) {
                console.error('[CloudSync] Push error:', e.code || e.message || e);
                // Don't show toast for transient/network errors during background sync
            } finally {
                _syncing = false;
            }
        },

        /**
         * Pull all cloud data to local, handling conflicts
         * Called on login and periodic sync
         */
        async pullFromCloud() {
            if (!this.isAvailable) return;
            if (_syncing) return;
            _syncing = true;
            _isPulling = true; // Prevent push triggers during pull

            try {
                const conflicts = [];

                // Pull settings (no conflict — always take latest)
                const settingsResult = await _pullDoc('settings', null, 'settings');
                if (settingsResult?.data) {
                    if (settingsResult.data.darkMode !== undefined) {
                        localStorage.setItem('altech_dark_mode', settingsResult.data.darkMode);
                        if (typeof App !== 'undefined' && App.loadDarkMode) App.loadDarkMode();
                    }
                }

                // Pull form data (conflict possible)
                const formResult = await _pullDoc('currentForm', 'altech_v6', 'currentForm');
                if (formResult?.conflict) {
                    conflicts.push({
                        type: 'Current Form',
                        remote: formResult.data,
                        local: formResult.localData,
                        remoteTime: formResult.remoteTime,
                        localTime: _getSyncMeta()['lastSync_currentForm'] || 0
                    });
                } else if (formResult?.data && typeof App !== 'undefined') {
                    App.data = formResult.data;
                    if (App.load) App.load();
                }

                // Pull CGL state
                const cglResult = await _pullDoc('cglState', 'altech_cgl_state', 'cglState');
                if (cglResult?.conflict) {
                    conflicts.push({
                        type: 'CGL Compliance State',
                        remote: cglResult.data,
                        local: cglResult.localData,
                        remoteTime: cglResult.remoteTime,
                        localTime: _getSyncMeta()['lastSync_cglState'] || 0
                    });
                }

                // Pull client history
                await _pullDoc('clientHistory', 'altech_client_history', 'clientHistory');

                // Pull Quick Reference cards
                const qrResult = await _pullDoc('quickRefCards', 'altech_quickref_cards', 'quickRefCards');
                if (qrResult?.data && typeof QuickRef !== 'undefined') {
                    QuickRef.cards = qrResult.data;
                    if (QuickRef.renderCards) QuickRef.renderCards();
                }

                // Pull Reminders
                const remResult = await _pullDoc('reminders', 'altech_reminders', 'reminders');
                if (remResult?.data && typeof Reminders !== 'undefined') {
                    Reminders.state = remResult.data;
                    if (Reminders.render) Reminders.render();
                }

                // Pull quotes (merge strategy)
                const remoteQuotes = await _pullQuotes();
                if (remoteQuotes.length > 0) {
                    const localQuotesRaw = localStorage.getItem('altech_v6_quotes');
                    let localQuotes = [];
                    try { localQuotes = JSON.parse(localQuotesRaw) || []; } catch {}

                    const { merged, conflicts: quoteConflicts } = _mergeQuotes(localQuotes, remoteQuotes);
                    _setLocalData('altech_v6_quotes', merged);
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
            }
        },

        /**
         * Debounced push — call after every local save
         */
        schedulePush() {
            if (!this.isAvailable || _isPulling) return;
            clearTimeout(_syncTimer);
            _syncTimer = setTimeout(() => this.pushToCloud(), SYNC_DEBOUNCE_MS);
        },

        /**
         * Manual full sync (pull then push)
         */
        async fullSync() {
            if (!this.isAvailable) {
                _notify('Sign in to sync across devices', 'info');
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
                const syncDocs = ['settings', 'currentForm', 'cglState', 'clientHistory', 'quickRefCards', 'reminders'];
                await Promise.all(syncDocs.map(doc =>
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
                const cloudBadge = cloudNewer ? '<span class="conflict-newest">✦ Newest</span>' : '';
                const localBadge = localNewer ? '<span class="conflict-newest">✦ Newest</span>' : '';
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
        _resolveConflict(index, choice) {
            const dialog = document.getElementById('conflictDialog');
            if (!dialog || !dialog._conflicts) return;

            const conflict = dialog._conflicts[index];
            if (!conflict) return;

            if (conflict.type === 'Current Form') {
                if (choice === 'remote') {
                    _setLocalData('altech_v6', conflict.remote);
                    if (typeof App !== 'undefined') {
                        App.data = conflict.remote;
                        if (App.load) App.load();
                    }
                    _markSynced('currentForm');
                } else {
                    // Push local to cloud
                    _pushDoc('currentForm', conflict.local, 'currentForm');
                }
            } else if (conflict.type === 'CGL Compliance State') {
                if (choice === 'remote') {
                    _setLocalData('altech_cgl_state', conflict.remote);
                    _markSynced('cglState');
                    // Refresh CGL UI
                    if (typeof ComplianceDashboard !== 'undefined' && ComplianceDashboard.init) {
                        ComplianceDashboard.init();
                    }
                } else {
                    _pushDoc('cglState', conflict.local, 'cglState');
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
