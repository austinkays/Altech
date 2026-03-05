// ComplianceDashboard - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

// CGL Compliance Dashboard JavaScript
const STORAGE_KEY = 'altech_cgl_state';

const CGL_CACHE_KEY = 'altech_cgl_cache';
const CGL_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const IDB_POLICY_KEY = 'hawksoft_policy_data';
const IDB_ANNOTATIONS_KEY = 'user_annotations';

// ── IndexedDB wrapper (v2 — annotations store for Safe-Load) ──
const CglIDB = {
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
                    // Handle future version changes from other tabs
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

    async get(key, storeName) {
        const db = await this.open();
        const store = storeName || this.STORE;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async set(key, value, storeName) {
        const db = await this.open();
        const store = storeName || this.STORE;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(value, key);
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

const ComplianceDashboard = {
    policies: [],
    verifiedPolicies: {},
    dismissedPolicies: {},
    snoozedPolicies: {},
    policyNotes: {},
    showHidden: false,
    sortField: 'daysUntilExpiration',
    sortDirection: 'asc',
    savedSearch: '',
    savedFilter: 'all',
    hiddenTypes: ['auto', 'umbrella', 'wc', 'im', 'property', 'epli', 'do', 'eo', 'cyber', 'crime', 'liquor', 'garage', 'pollution'],
    notifyTypes: ['cgl', 'bond', 'pkg', 'bop', 'commercial'],
    sessionChanges: 0,
    _pageSize: 50,
    _visibleCount: 50,
    reminderDismissed: false,
    fileHandle: null,
    isDesktop: false,
    _diskSyncTimer: null,
    _kvSyncTimer: null,
    _kvAvailable: null, // null = unknown, true/false after first attempt
    _stateLoaded: false,  // Guard: don't sync to disk until state is loaded
    _lastSaveStatus: 'loading', // 'saved' | 'saving' | 'error' | 'loading'
    _printMode: false,
    _selectedForPrint: new Set(),

    // --- Vercel KV helpers ---

    /** Check if KV store is available (caches result) */
    async _checkKV() {
        if (this._kvAvailable !== null) return this._kvAvailable;
        try {
            const res = await Auth.apiFetch('/api/kv-store?key=cgl_state', { signal: AbortSignal.timeout(3000) });
            // 404 = KV works but no data yet, 501 = KV not configured, 401 = not authenticated
            this._kvAvailable = res.status !== 501 && res.status !== 401;
        } catch (e) {
            this._kvAvailable = false;
        }
        console.log('[CGL] Vercel KV:', this._kvAvailable ? 'available' : 'not available');
        return this._kvAvailable;
    },

    /** Save to KV (debounced, non-blocking) */
    _syncToKV(key, value) {
        if (this._kvAvailable === false) return;
        clearTimeout(this._kvSyncTimer);
        this._kvSyncTimer = setTimeout(async () => {
            try {
                const ok = await this._checkKV();
                if (!ok) return;
                const payload = JSON.stringify({ key, value });
                // Pre-flight size check — KV endpoint rejects > 1MB with 413
                if (payload.length > 900_000) {
                    console.log(`[CGL] ☁️ KV skip (${key}) — payload ${(payload.length / 1024).toFixed(0)}KB exceeds limit`);
                    return;
                }
                await Auth.apiFetch('/api/kv-store', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                });
                console.log('[CGL] ☁️ KV synced:', key);
            } catch (e) { /* silent */ }
        }, 2000);
    },

    /** Load from KV (returns null if unavailable) */
    async _loadFromKV(key) {
        try {
            const ok = await this._checkKV();
            if (!ok) return null;
            const res = await Auth.apiFetch(`/api/kv-store?key=${key}`, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const data = await res.json();
                console.log('[CGL] ☁️ KV loaded:', key);
                return data;
            }
        } catch (e) { /* silent */ }
        return null;
    },

    // --- State persistence ---

    loadState() {
        // Try new unified key first
        const state = localStorage.getItem(STORAGE_KEY);
        if (state) {
            try {
                const parsed = JSON.parse(state);
                this.verifiedPolicies = parsed.verifiedPolicies || {};
                this.dismissedPolicies = parsed.dismissedPolicies || {};
                this.snoozedPolicies = parsed.snoozedPolicies || {};
                this.policyNotes = parsed.policyNotes || {};
                this.sortField = parsed.sortField || 'daysUntilExpiration';
                this.sortDirection = parsed.sortDirection || 'asc';
                this.savedSearch = parsed.savedSearch || '';
                this.savedFilter = parsed.savedFilter || 'all';
                this.hiddenTypes = parsed.hiddenTypes || ['auto', 'umbrella', 'wc', 'im', 'property', 'epli', 'do', 'eo', 'cyber', 'crime', 'liquor', 'garage', 'pollution'];
                this.notifyTypes = parsed.notifyTypes || ['cgl', 'bond', 'pkg', 'bop', 'commercial'];
                this._stateLoaded = true;
                console.log('[CGL] State loaded:', Object.keys(this.verifiedPolicies).length, 'verified,', Object.keys(this.dismissedPolicies).length, 'dismissed,', Object.keys(this.snoozedPolicies).length, 'snoozed,', Object.keys(this.policyNotes).length, 'notes');
                return;
            } catch (e) {
                console.error('[CGL] Failed to parse state:', e);
            }
        }

        // Migrate from old keys
        const oldVerified = localStorage.getItem('compliance_updated_policies');
        const oldDismissed = localStorage.getItem('compliance_dismissed_policies');
        if (oldVerified) {
            try { this.verifiedPolicies = JSON.parse(oldVerified); } catch (e) {}
        }
        if (oldDismissed) {
            try { this.dismissedPolicies = JSON.parse(oldDismissed); } catch (e) {}
        }
        if (oldVerified || oldDismissed) {
            this.saveState();
            localStorage.removeItem('compliance_updated_policies');
            localStorage.removeItem('compliance_dismissed_policies');
            console.log('[CGL] Migrated old keys to altech_cgl_state');
        }
        this.notifyTypes = this.notifyTypes || ['cgl', 'bond', 'pkg', 'bop', 'commercial'];
    },

    saveState(options) {
        if (!this._stateLoaded && !options?.forceDiskSync) {
            console.warn('[CGL] ⚠️ Blocked save — state not yet loaded');
            return;
        }

        const stateObj = this._getStateSnapshot();

        // 1. PRIMARY: Write to IndexedDB (master source of truth)
        this._updateSaveStatus('saving');
        CglIDB.setAnnotations(stateObj).then(() => {
            this._updateSaveStatus('saved');
        }).catch(err => {
            console.error('[CGL] IndexedDB annotation write failed:', err);
            this._updateSaveStatus('error');
        });

        // 2. BACKUP: localStorage (survives page reload)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateObj));

        // 3. BACKUP: Linked disk file (File System Access API)
        if (this.fileHandle) {
            this.saveDiskFile();
        }

        // 4. BACKUP: Server disk file (debounced)
        this.syncStateToDisk(stateObj, options?.forceDiskSync);

        // 5. CLOUD: Vercel KV (debounced, non-blocking)
        this._syncToKV('cgl_state', stateObj);

        // 6. CLOUD SYNC: Firebase (debounced, non-blocking)
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
    },

    syncStateToDisk(stateObj, force = false) {
        // Guard: don't overwrite disk state before we've loaded it at least once
        if (!this._stateLoaded) {
            console.warn('[CGL] Skipping disk sync — state not yet loaded (prevents data wipe)');
            return;
        }
        // Guard: never overwrite disk with completely empty state (unless user explicitly cleared)
        if (!force) {
            const hasAnyData = Object.keys(stateObj.verifiedPolicies || {}).length > 0
                || Object.keys(stateObj.dismissedPolicies || {}).length > 0
                || Object.keys(stateObj.policyNotes || {}).length > 0;
            if (!hasAnyData) {
                console.warn('[CGL] Skipping disk sync — state is empty (use clearAll to explicitly wipe)');
                return;
            }
        }
        // Only sync to disk on localhost — production has no /local/ endpoint
        const _isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!_isLocal) return;
        clearTimeout(this._diskSyncTimer);
        this._diskSyncTimer = setTimeout(() => {
            fetch('/local/cgl-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(stateObj)
            }).catch(() => {}); // silent — server may not support this
        }, 500);
    },

    async loadStateFromDisk() {
        try {
            const res = await fetch('/local/cgl-state');
            if (!res.ok) return false;
            const data = await res.json();
            if (data.verifiedPolicies || data.dismissedPolicies) {
                // Smart Merge — local wins, but NEVER delete annotation keys
                const localV = this.verifiedPolicies;
                const localD = this.dismissedPolicies;
                const diskV = data.verifiedPolicies || {};
                const diskD = data.dismissedPolicies || {};
                this.verifiedPolicies = this._smartMergeDict(localV, diskV);
                this.dismissedPolicies = this._smartMergeDict(localD, diskD);
                // Merge notes — local wins, but NEVER delete disk-only notes
                const diskN = data.policyNotes || {};
                this.policyNotes = this._smartMergeDict(this.policyNotes, diskN);
                // Restore preferences from disk if not set locally
                if (data.sortField && !localStorage.getItem(STORAGE_KEY)) {
                    this.sortField = data.sortField;
                    this.sortDirection = data.sortDirection || 'asc';
                    this.savedSearch = data.savedSearch || '';
                    this.savedFilter = data.savedFilter || 'all';
                }
                this._stateLoaded = true;
                console.log('[CGL] Merged disk state: verified=' + Object.keys(this.verifiedPolicies).length + ', dismissed=' + Object.keys(this.dismissedPolicies).length + ', notes=' + Object.keys(this.policyNotes).length);
                // Save merged result back
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    verifiedPolicies: this.verifiedPolicies,
                    dismissedPolicies: this.dismissedPolicies,
                    policyNotes: this.policyNotes,
                    sortField: this.sortField,
                    sortDirection: this.sortDirection,
                    savedSearch: this.savedSearch,
                    savedFilter: this.savedFilter,
                    hiddenTypes: this.hiddenTypes,
                    notifyTypes: this.notifyTypes,
                    lastSaved: new Date().toISOString()
                }));
                return true;
            }
        } catch (e) {
            console.warn('[CGL] loadStateFromDisk failed — disk state NOT loaded. State will not sync to disk until loaded.', e);
        }
        return false;
    },

    // ── Safe-Load helper methods ──

    _hasAnnotationData(obj) {
        if (!obj) return false;
        return (Object.keys(obj.verifiedPolicies || {}).length > 0)
            || (Object.keys(obj.dismissedPolicies || {}).length > 0)
            || (Object.keys(obj.policyNotes || {}).length > 0);
    },

    _applyAnnotations(ann) {
        this.verifiedPolicies = ann.verifiedPolicies || {};
        this.dismissedPolicies = ann.dismissedPolicies || {};
        this.policyNotes = ann.policyNotes || {};
        if (ann.sortField) this.sortField = ann.sortField;
        if (ann.sortDirection) this.sortDirection = ann.sortDirection;
        if (ann.savedSearch !== undefined) this.savedSearch = ann.savedSearch;
        if (ann.savedFilter !== undefined) this.savedFilter = ann.savedFilter;
        if (ann.hiddenTypes) this.hiddenTypes = ann.hiddenTypes;
        if (ann.notifyTypes) this.notifyTypes = ann.notifyTypes;
    },

    _getStateSnapshot() {
        return {
            verifiedPolicies: this.verifiedPolicies,
            dismissedPolicies: this.dismissedPolicies,
            snoozedPolicies: this.snoozedPolicies,
            policyNotes: this.policyNotes,
            sortField: this.sortField,
            sortDirection: this.sortDirection,
            savedSearch: this.savedSearch,
            savedFilter: this.savedFilter,
            hiddenTypes: this.hiddenTypes,
            notifyTypes: this.notifyTypes,
            lastSaved: new Date().toISOString()
        };
    },

    async _writeAnnotationsToIDB() {
        return CglIDB.setAnnotations(this._getStateSnapshot());
    },

    // Smart merge: NEVER delete annotation keys from target
    // target keys win on conflicts, source fills gaps
    _smartMergeDict(target, source) {
        const merged = { ...target };
        for (const key of Object.keys(source || {})) {
            if (!(key in merged)) {
                merged[key] = source[key];
            }
        }
        return merged;
    },

    // ── Nuclear Option: Full backup download ──

    downloadFullBackup() {
        const snapshot = this._getStateSnapshot();
        const backup = {
            _meta: {
                version: '3.0',
                format: 'altech_cgl_backup',
                exportedAt: new Date().toISOString(),
                counts: {
                    verified: Object.keys(this.verifiedPolicies).length,
                    dismissed: Object.keys(this.dismissedPolicies).length,
                    notes: Object.keys(this.policyNotes).length
                }
            },
            ...snapshot
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `CGL_Backup_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('[CGL] 💾 Full backup downloaded:', backup._meta.counts);
    },

    async restoreFullBackup(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const backup = JSON.parse(text);
            // Validate format
            if (!backup.verifiedPolicies && !backup.dismissedPolicies && !backup.policyNotes) {
                alert('Invalid backup file — missing annotation data.');
                return;
            }
            const counts = {
                v: Object.keys(backup.verifiedPolicies || {}).length,
                d: Object.keys(backup.dismissedPolicies || {}).length,
                n: Object.keys(backup.policyNotes || {}).length
            };
            if (!confirm(`Restore backup?\n\nVerified: ${counts.v}\nDismissed: ${counts.d}\nNotes: ${counts.n}\n\nThis will MERGE with existing data (nothing will be deleted).`)) {
                return;
            }
            // Smart merge — never delete existing annotations
            this.verifiedPolicies = this._smartMergeDict(this.verifiedPolicies, backup.verifiedPolicies);
            this.dismissedPolicies = this._smartMergeDict(this.dismissedPolicies, backup.dismissedPolicies);
            this.policyNotes = this._smartMergeDict(this.policyNotes, backup.policyNotes);
            this.saveState();
            this.filterPolicies();
            this.updateStats();
            alert(`Backup restored! Merged ${counts.v} verified, ${counts.d} dismissed, ${counts.n} notes.`);
        } catch (e) {
            alert('Failed to parse backup file: ' + e.message);
        }
        fileInput.value = '';
    },

    // ── Save status indicator ──

    _updateSaveStatus(status) {
        this._lastSaveStatus = status;
        const dot = document.getElementById('cglSaveDot');
        const text = document.getElementById('cglSaveText');
        if (!dot || !text) return;
        switch (status) {
            case 'saved':
                dot.className = 'cgl-save-dot saved';
                text.textContent = 'Saved';
                break;
            case 'saving':
                dot.className = 'cgl-save-dot saving';
                text.textContent = 'Saving\u2026';
                break;
            case 'error':
                dot.className = 'cgl-save-dot error';
                text.textContent = 'Save Error';
                break;
            default:
                dot.className = 'cgl-save-dot loading';
                text.textContent = 'Loading\u2026';
        }
    },

    trackChange() {
        this.sessionChanges++;
        const countEl = document.getElementById('cglSessionCount');
        if (countEl) countEl.textContent = this.sessionChanges;

        if (this.sessionChanges >= 10 && !this.reminderDismissed) {
            const reminder = document.getElementById('cglBackupReminder');
            if (reminder) reminder.style.display = 'flex';
        }
    },

    dismissReminder() {
        this.reminderDismissed = true;
        const reminder = document.getElementById('cglBackupReminder');
        if (reminder) reminder.style.display = 'none';
    },

    reminderAction() {
        if (this.fileHandle) {
            this.saveDiskFile();
        } else {
            this.exportBackup();
        }
    },

    // --- File System Access API (Desktop) ---

    renderFileToolbar() {
        // File toolbar removed — auto-save to localStorage + disk handles persistence
    },

    updateFileStatus() {
        const statusEl = document.getElementById('cglFileStatus');
        if (!statusEl) return;

        if (this.fileHandle) {
            const name = this.fileHandle.name || 'file';
            statusEl.innerHTML = `<span class="linked">Linked: ${this.escapeHtml(name)}</span>`;
        } else {
            statusEl.innerHTML = `<span class="field-mode">No file linked</span>`;
        }

        // Update reminder button text
        const reminderBtn = document.getElementById('cglReminderAction');
        if (reminderBtn) {
            reminderBtn.textContent = this.fileHandle ? 'Save to disk' : 'Backup now';
        }
    },

    async openDiskFile() {
        try {
            const [handle] = await window.showOpenFilePicker({
                startIn: 'documents',
                types: [{
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] }
                }]
            });

            const file = await handle.getFile();
            const text = await file.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (parseErr) {
                alert('Invalid JSON file. Please select a valid CGL state export.');
                return;
            }

            // Support v2.0 format (meta + state) and flat format
            const stateData = data.state || data;

            // Load dismissed policies - convert arrays to objects if needed
            if (Array.isArray(stateData.dismissedPolicies)) {
                this.dismissedPolicies = {};
                stateData.dismissedPolicies.forEach(pn => {
                    this.dismissedPolicies[pn] = { dismissedAt: data.meta?.lastSaved || new Date().toISOString() };
                });
            } else if (stateData.dismissedPolicies && typeof stateData.dismissedPolicies === 'object') {
                this.dismissedPolicies = stateData.dismissedPolicies;
            }

            // Load verified policies - convert arrays to objects if needed
            if (Array.isArray(stateData.verifiedPolicies)) {
                this.verifiedPolicies = {};
                stateData.verifiedPolicies.forEach(pn => {
                    this.verifiedPolicies[pn] = { updatedAt: data.meta?.lastSaved || new Date().toISOString(), updatedBy: 'file' };
                });
            } else if (stateData.verifiedPolicies && typeof stateData.verifiedPolicies === 'object') {
                this.verifiedPolicies = stateData.verifiedPolicies;
            }

            this.fileHandle = handle;

            // Sync to localStorage as backup
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                verifiedPolicies: this.verifiedPolicies,
                dismissedPolicies: this.dismissedPolicies,
                lastSaved: new Date().toISOString()
            }));

            this.updateFileStatus();
            this.filterPolicies();
            this.updateStats();

            console.log('[CGL] Opened file:', handle.name, '| Verified:', Object.keys(this.verifiedPolicies).length, '| Dismissed:', Object.keys(this.dismissedPolicies).length);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[CGL] Error opening file:', err);
                alert('Failed to open file: ' + err.message);
            }
        }
    },

    async saveDiskFile() {
        try {
            if (!this.fileHandle) {
                return this.saveDiskFileAs();
            }

            const jsonData = {
                meta: {
                    version: '2.0',
                    lastSaved: new Date().toISOString(),
                    savedBy: 'Altech Desktop App'
                },
                state: {
                    dismissedPolicies: this.dismissedPolicies,
                    verifiedPolicies: this.verifiedPolicies,
                    policyNotes: this.policyNotes
                }
            };

            const writable = await this.fileHandle.createWritable();
            await writable.write(JSON.stringify(jsonData, null, 2));
            await writable.close();

            // Flash "Saved" indicator
            const flash = document.getElementById('cglSaveFlash');
            if (flash) {
                flash.classList.add('visible');
                setTimeout(() => flash.classList.remove('visible'), 1500);
            }

            // Reset session counter
            this.sessionChanges = 0;
            this.reminderDismissed = false;
            const reminder = document.getElementById('cglBackupReminder');
            if (reminder) reminder.style.display = 'none';
            const countEl = document.getElementById('cglSessionCount');
            if (countEl) countEl.textContent = '0';

            console.log('[CGL] Saved to disk:', this.fileHandle.name);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[CGL] Error saving file:', err);
                alert('Failed to save file: ' + err.message);
            }
        }
    },

    async saveDiskFileAs() {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'Altech_CGL_Master.json',
                startIn: 'documents',
                types: [{
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] }
                }]
            });

            this.fileHandle = handle;
            this.updateFileStatus();
            await this.saveDiskFile();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[CGL] Error saving file as:', err);
                alert('Failed to save file: ' + err.message);
            }
        }
    },

    // --- CSV Export / Import ---

    exportBackup() {
        const rows = ['PolicyNumber,Status,Date'];
        for (const [pn, data] of Object.entries(this.verifiedPolicies)) {
            rows.push(`${pn},verified,${data.updatedAt || ''}`);
        }
        for (const [pn, data] of Object.entries(this.dismissedPolicies)) {
            rows.push(`${pn},dismissed,${data.dismissedAt || ''}`);
        }

        if (rows.length === 1) {
            alert('Nothing to export yet. Verify or dismiss some policies first.');
            return;
        }

        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `CGL_Work_Backup_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        // Reset session counter after backup
        this.sessionChanges = 0;
        this.reminderDismissed = false;
        const reminder = document.getElementById('cglBackupReminder');
        if (reminder) reminder.style.display = 'none';
        const countEl = document.getElementById('cglSessionCount');
        if (countEl) countEl.textContent = '0';
    },

    importBackup(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.trim().split('\n');

            // Skip header row
            let imported = 0;
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length < 2) continue;
                const policyNumber = parts[0].trim();
                const status = parts[1].trim().toLowerCase();
                const date = parts[2] ? parts[2].trim() : new Date().toISOString();

                if (!policyNumber) continue;

                if (status === 'verified') {
                    this.verifiedPolicies[policyNumber] = { updatedAt: date, updatedBy: 'import' };
                    imported++;
                } else if (status === 'dismissed') {
                    this.dismissedPolicies[policyNumber] = { dismissedAt: date };
                    imported++;
                }
            }

            this.saveState();
            this.filterPolicies();
            this.updateStats();
            alert(`Restored ${imported} policy markers from backup.`);
        };
        reader.readAsText(file);
        fileInput.value = '';
    },

    // --- Init ---

    async init() {
        if (this._initialized) {
            // Already initialized — just refresh if needed
            return;
        }
        this._initialized = true;

        // ── Load annotations (disk → localStorage → IDB merge) ──
        try {
            // Step 1: ALWAYS load from disk first — it's the most reliable source
            try {
                console.log('[CGL] Loading annotations from disk...');
                const res = await fetch('/local/cgl-state');
                if (res.ok) {
                    const data = await res.json();
                    if (data.verifiedPolicies || data.dismissedPolicies || data.policyNotes) {
                        this.verifiedPolicies = data.verifiedPolicies || {};
                        this.dismissedPolicies = data.dismissedPolicies || {};
                        this.policyNotes = data.policyNotes || {};
                        if (data.sortField) this.sortField = data.sortField;
                        if (data.sortDirection) this.sortDirection = data.sortDirection;
                        if (data.hiddenTypes) this.hiddenTypes = data.hiddenTypes;
                        if (data.notifyTypes) this.notifyTypes = data.notifyTypes;
                        console.log('[CGL] ✅ Disk load — V:' +
                            Object.keys(this.verifiedPolicies).length + ' D:' +
                            Object.keys(this.dismissedPolicies).length + ' N:' +
                            Object.keys(this.policyNotes).length);
                    }
                }
            } catch (e) {
                console.warn('[CGL] Disk annotation load failed:', e);
            }

            // Step 2: Merge from localStorage (may have newer changes not yet saved to disk)
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const local = JSON.parse(raw);
                    if (local.verifiedPolicies || local.dismissedPolicies || local.policyNotes) {
                        this.verifiedPolicies = this._smartMergeDict(this.verifiedPolicies, local.verifiedPolicies || {});
                        this.dismissedPolicies = this._smartMergeDict(this.dismissedPolicies, local.dismissedPolicies || {});
                        this.policyNotes = this._smartMergeDict(this.policyNotes, local.policyNotes || {});
                    }
                }
            } catch (e) {}

            // Step 3: Try IDB merge (non-blocking — if it hangs, skip it)
            try {
                const ann = await Promise.race([
                    CglIDB.getAnnotations(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('IDB timeout')), 2000))
                ]);
                if (ann && (ann.verifiedPolicies || ann.dismissedPolicies || ann.policyNotes)) {
                    this.verifiedPolicies = this._smartMergeDict(this.verifiedPolicies, ann.verifiedPolicies || {});
                    this.dismissedPolicies = this._smartMergeDict(this.dismissedPolicies, ann.dismissedPolicies || {});
                    this.policyNotes = this._smartMergeDict(this.policyNotes, ann.policyNotes || {});
                }
            } catch (e) {
                console.warn('[CGL] IDB merge skipped:', e.message);
            }

            // Step 4: Try Vercel KV merge (cloud — non-blocking)
            try {
                const kvState = await this._loadFromKV('cgl_state');
                if (kvState && (kvState.verifiedPolicies || kvState.dismissedPolicies || kvState.policyNotes)) {
                    this.verifiedPolicies = this._smartMergeDict(this.verifiedPolicies, kvState.verifiedPolicies || {});
                    this.dismissedPolicies = this._smartMergeDict(this.dismissedPolicies, kvState.dismissedPolicies || {});
                    this.policyNotes = this._smartMergeDict(this.policyNotes, kvState.policyNotes || {});
                    console.log('[CGL] ☁️ KV merge complete');
                }
            } catch (e) {
                console.log('[CGL] KV merge skipped:', e.message || e);
            }

            // Step 5: Promote merged state everywhere
            this._stateLoaded = true;
            const snapshot = this._getStateSnapshot();
            CglIDB.setAnnotations(snapshot).catch(() => {});
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch (e) {}
            console.log('[CGL] 🔓 Annotations loaded — V:' +
                Object.keys(this.verifiedPolicies).length + ' D:' +
                Object.keys(this.dismissedPolicies).length + ' N:' +
                Object.keys(this.policyNotes).length);
        } catch (e) {
            console.error('[CGL] Annotation loading failed entirely:', e);
            this._stateLoaded = true; // Allow saves even if load failed
        }

        // ── Setup UI (non-critical — wrapped in try/catch) ──
        try {
            this.isDesktop = 'showOpenFilePicker' in window;
            this.renderFileToolbar();
            const searchInput = document.getElementById('cglSearchInput');
            const filterSelect = document.getElementById('cglFilterSelect');

            if (searchInput && this.savedSearch) {
                searchInput.value = this.savedSearch;
            }
            if (filterSelect && this.savedFilter) {
                filterSelect.value = this.savedFilter;
            }
            this.updateSortIndicator();
            this.renderTypeToggles();
            this.renderNotifyTypeToggles();

            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    this.savedSearch = searchInput.value;
                    this._visibleCount = this._pageSize;
                    this.saveState();
                    this.filterPolicies();
                });
            }
            if (filterSelect) {
                filterSelect.addEventListener('change', () => {
                    this.savedFilter = filterSelect.value;
                    this._visibleCount = this._pageSize;
                    this.saveState();
                    this.filterPolicies();
                });
            }
        } catch (e) {
            console.error('[CGL] UI setup error (non-fatal):', e);
        }

        // ── ALWAYS load policies — this must run no matter what ──
        await this.fetchPolicies();
    },

    // --- Data fetching ---

    async fetchPolicies(forceRefresh = false) {
        console.log('[CGL] fetchPolicies called, forceRefresh=' + forceRefresh);
        const loading = document.getElementById('cglLoading');
        const error = document.getElementById('cglError');
        const tableContainer = document.getElementById('cglTableContainer');

        if (!forceRefresh) {
            // ── Try ALL cache sources in parallel for speed ──
            const cached = await this._loadFromAnyCache();
            if (cached) {
                this._showCachedData(cached);
                return;
            }
        }

        // ── No cache or force refresh — try API with guaranteed fallback ──
        console.log('[CGL] No cache found — attempting API with fallback...');
        if (loading) loading.style.display = 'block';
        if (error) error.style.display = 'none';
        if (tableContainer) tableContainer.style.display = 'none';
        await this.fetchPoliciesFromAPI(false);
    },

    /** Try every cache source — returns first hit or null */
    async _loadFromAnyCache() {
        // Race all sources: disk, IDB, localStorage
        // Disk is most reliable, so try it directly + race with others

        // Source 1: Disk (most reliable — only available on localhost dev server)
        const _isDiskAvailable = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const diskPromise = (async () => {
            if (!_isDiskAvailable) return null;
            try {
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), 5000);
                const res = await fetch('/local/cgl-cache', { signal: controller.signal });
                clearTimeout(t);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.policies?.length > 0 && data?.allPolicies?.length > 0) {
                        console.log('[CGL] ✅ Disk cache:', data.policies.length, 'CGL +', data.allPolicies.length, 'total policies');
                        return data;
                    } else if (data?.policies?.length > 0) {
                        console.log('[CGL] ⚠️ Disk cache has policies but missing allPolicies — treating as stale');
                    }
                }
            } catch (e) {
                console.warn('[CGL] Disk cache failed:', e.message);
            }
            return null;
        })();

        // Source 2: IDB (fast if warmed)
        const idbPromise = (async () => {
            try {
                const data = await Promise.race([
                    CglIDB.get(IDB_POLICY_KEY),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('IDB timeout')), 3000))
                ]);
                if (data?.cachedAt && data?.policies?.length > 0 && data?.allPolicies?.length > 0) {
                    console.log('[CGL] ✅ IDB cache:', data.policies.length, 'CGL +', data.allPolicies.length, 'total policies');
                    return data;
                } else if (data?.cachedAt && data?.policies?.length > 0) {
                    console.log('[CGL] ⚠️ IDB cache has policies but missing allPolicies — treating as stale');
                }
            } catch (e) {
                console.warn('[CGL] IDB cache failed:', e.message);
            }
            return null;
        })();

        // Source 3: localStorage (synchronous fallback)
        const lsPromise = (async () => {
            try {
                const raw = localStorage.getItem(CGL_CACHE_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    if (data?.cachedAt && data?.policies?.length > 0 && data?.allPolicies?.length > 0) {
                        console.log('[CGL] ✅ localStorage cache:', data.policies.length, 'CGL +', data.allPolicies.length, 'total policies');
                        return data;
                    } else if (data?.cachedAt && data?.policies?.length > 0) {
                        console.log('[CGL] ⚠️ localStorage cache has policies but missing allPolicies — treating as stale');
                    }
                }
            } catch (e) {}
            return null;
        })();

        // Source 4: Vercel KV (cloud — may be slower)
        const kvPromise = (async () => {
            try {
                const data = await this._loadFromKV('cgl_cache');
                if (data?.cachedAt && data?.policies?.length > 0 && data?.allPolicies?.length > 0) {
                    console.log('[CGL] ✅ KV cache:', data.policies.length, 'CGL +', data.allPolicies.length, 'total policies');
                    return data;
                } else if (data?.cachedAt && data?.policies?.length > 0) {
                    console.log('[CGL] ⚠️ KV cache has policies but missing allPolicies — treating as stale');
                }
            } catch (e) {}
            return null;
        })();

        // Return the FIRST source that succeeds (race for speed)
        try {
            const results = await Promise.allSettled([diskPromise, idbPromise, lsPromise, kvPromise]);
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) return r.value;
            }
        } catch (e) {
            console.warn('[CGL] All cache sources failed:', e);
        }

        return null;
    },

    /** Show cached data and optionally kick off background refresh */
    _showCachedData(cached) {
        const loading = document.getElementById('cglLoading');
        const error = document.getElementById('cglError');
        const tableContainer = document.getElementById('cglTableContainer');

        this.policies = cached.policies || [];
        const cacheAge = Date.now() - (cached.cachedAt || 0);
        const ageMin = Math.round(cacheAge / 60000);
        const fetchTime = cached.metadata?.fetchedAt ? new Date(cached.metadata.fetchedAt).toLocaleString() : 'unknown';
        const lastFetchEl = document.getElementById('cglLastFetch');
        if (lastFetchEl) lastFetchEl.innerHTML = `Last updated: ${fetchTime} <span style="color:var(--apple-gray);font-size:12px;">(cached ${ageMin}m ago)</span>`;

        this.renderLastSynced(cached.last_synced_time || cached.metadata?.fetchedAt);

        if (loading) loading.style.display = 'none';
        if (tableContainer) tableContainer.style.display = 'block';
        if (error) error.style.display = 'none';
        this.deduplicateRenewals();
        this.checkForRenewals();
        this.renderTypeToggles();
        this.renderPolicies();
        this.updateStats();

        // Promote to IDB + localStorage in background
        CglIDB.set(IDB_POLICY_KEY, cached).catch(() => {});
        try { localStorage.setItem(CGL_CACHE_KEY, JSON.stringify(cached)); } catch (e) {}

        // If cache is stale AND we're NOT on localhost, refresh in background
        // (On localhost, HawkSoft API is never reachable — skip to avoid console errors)
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (cacheAge > CGL_CACHE_TTL && !isLocal) {
            console.log('[CGL] Cache stale — refreshing in background...');
            this.fetchPoliciesFromAPI(true);
        } else if (cacheAge > CGL_CACHE_TTL) {
            console.log('[CGL] Cache is ' + ageMin + 'm old (stale) — skipping background refresh on localhost');
        }
    },

    async fetchPoliciesFromAPI(isBackground = false, bypassServerCache = false) {
        const loading = document.getElementById('cglLoading');
        const error = document.getElementById('cglError');
        const tableContainer = document.getElementById('cglTableContainer');
        const API_TIMEOUT_MS = 65000; // 65 seconds max (Vercel function limit is 60s)

        if (isBackground) {
            const lastFetchEl = document.getElementById('cglLastFetch');
            if (lastFetchEl && !lastFetchEl.innerHTML.includes('↻')) {
                lastFetchEl.innerHTML += ' <span class="cgl-bg-refresh-tag" style="color:var(--apple-blue);font-size:12px;">↻ refreshing...</span>';
            }
        }

        // Update loading text to show progress
        if (!isBackground) {
            const loadingText = document.querySelector('.cgl-loading-text');
            const loadingSub = document.querySelector('.cgl-loading-sub');
            if (loadingText) loadingText.textContent = 'Connecting to HawkSoft…';
            if (loadingSub) loadingSub.textContent = 'Will fall back to cached data if unavailable';
        }

        // Start SSE progress listener (local server only — Vercel has no SSE endpoint)
        let progressSource = null;
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (isLocal) {
            try {
                progressSource = new EventSource('/local/compliance-progress');
                progressSource.onmessage = (event) => {
                    try {
                        const prog = JSON.parse(event.data);
                        this._renderFetchProgress(prog, isBackground);
                    } catch (e) {}
                };
                progressSource.onerror = () => {
                    progressSource.close();
                    progressSource = null;
                };
            } catch (e) { /* SSE not critical */ }
        }

        try {
            // Race fetch against timeout to prevent infinite hang
            const controller = new AbortController();
            const apiTimeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

            const apiUrl = (isBackground || bypassServerCache) ? '/api/compliance.js?refresh=true' : '/api/compliance.js';
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(apiTimeout);

            if (!response.ok) {
                throw new Error(`Failed to fetch policies: ${response.status}`);
            }

            // Detect if we got raw JS source instead of JSON (local dev without Vercel runtime)
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const bodyPreview = await response.clone().text();
                if (bodyPreview.trimStart().startsWith('/**') || bodyPreview.trimStart().startsWith('export') || bodyPreview.trimStart().startsWith('//')) {
                    throw { localDev: true, message: 'API not available — static file server detected' };
                }
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch policies');
            }

            if (data.metadata) {
                console.log('[CGL] ===== HAWKSOFT DEBUG INFO =====');
                console.log('[CGL] Clients scanned:', data.metadata.clientsScanned);
                console.log('[CGL] Total policies found:', data.metadata.totalPoliciesFound);
                console.log('[CGL] CGL policies in result:', data.metadata.glPoliciesMatched);
                console.log('[CGL] ================================');
            }

            this.policies = data.policies || [];

            if (data.metadata && data.metadata.fetchedAt) {
                const fetchTime = new Date(data.metadata.fetchedAt).toLocaleString();
                document.getElementById('cglLastFetch').textContent = `Last updated: ${fetchTime}`;
            }

            // Cache the response to disk + localStorage
            this.saveToCache(data);

            // Deduplicate renewed policies, then auto-clear stale markers
            this.deduplicateRenewals();
            this.checkForRenewals();

            this.renderTypeToggles();
            this.renderPolicies();
            this.updateStats();

            if (loading) loading.style.display = 'none';
            if (tableContainer) tableContainer.style.display = 'block';

        } catch (err) {
            // Detect abort (timeout) and treat as local dev / offline
            const isTimeout = err.name === 'AbortError';
            const isExpected = isTimeout || err.localDev;

            if (isExpected) {
                console.log(`[CGL] API unavailable (${isTimeout ? 'timeout' : 'local dev'}) — using cached data`);
            } else {
                console.warn('[CGL] Error fetching policies:', err.message || err);
            }

            if (isBackground) {
                // Background refresh failed — keep showing cached data silently
                console.log('[CGL] Background refresh skipped — HawkSoft unreachable');
                const lastFetch = document.getElementById('cglLastFetch');
                if (lastFetch) {
                    lastFetch.innerHTML = lastFetch.innerHTML.replace(/<span class="cgl-bg-refresh-tag"[^>]*>.*?<\/span>/, '<span style="color:#c00;font-size:12px;">⚠️ refresh failed</span>');
                    setTimeout(() => {
                        lastFetch.innerHTML = lastFetch.innerHTML.replace(/<span style="color:#c00[^>]*>.*?<\/span>/, '');
                    }, 5000);
                }
                // Clean up progress bar/banner
                const bar = document.getElementById('cglRefreshBar');
                const banner = document.getElementById('cglRefreshBanner');
                if (bar) bar.classList.remove('active');
                if (banner) banner.classList.remove('active');
                return;
            }

            if (loading) loading.style.display = 'none';

            if (err.localDev || isTimeout) {
                // Local dev / timeout — try disk cache as last resort
                this.showLocalDevMode();
            } else {
                // Real error — still try disk cache before showing error
                const _isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
                if (_isLocal) {
                    try {
                        const diskRes = await fetch('/local/cgl-cache');
                        if (diskRes.ok) {
                            const diskData = await diskRes.json();
                            if (diskData && diskData.policies && diskData.policies.length > 0) {
                                console.log('[CGL] API error but disk cache available — using cached data');
                                this.showLocalDevMode();
                                return;
                            }
                        }
                    } catch (diskErr) {}
                }
                if (error) error.style.display = 'block';
                const errMsg = document.getElementById('cglErrorMessage');
                if (errMsg) errMsg.textContent = err.message;
            }
        } finally {
            // Always close SSE progress stream
            if (progressSource) { try { progressSource.close(); } catch (e) {} }
            this._hideFetchProgress();
        }
    },

    // ── Fetch progress bar ──

    _renderFetchProgress(prog, isBackground) {
        if (!prog || prog.phase === 'idle') return;

        // Background refresh: update the refresh banner text
        if (isBackground) {
            const banner = document.getElementById('cglRefreshBanner');
            if (banner && prog.totalChunks > 0) {
                const pct = Math.round((prog.chunk / prog.totalChunks) * 100);
                banner.innerHTML = `<div class="mini-spinner"></div><span>Syncing from HawkSoft\u2026 ${pct}% (${prog.chunk}/${prog.totalChunks} batches)</span>`;
            }
            return;
        }

        // Full-screen loading: show the progress bar inside the loading spinner area
        const loadingEl = document.getElementById('cglLoading');
        if (!loadingEl) return;
        let progressBar = document.getElementById('cglFetchProgress');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.id = 'cglFetchProgress';
            progressBar.className = 'cgl-fetch-progress';
            progressBar.innerHTML = `
                <div class="cgl-fetch-progress-track">
                    <div class="cgl-fetch-progress-fill" id="cglFetchFill"></div>
                </div>
                <div class="cgl-fetch-progress-text" id="cglFetchText"></div>`;
            loadingEl.appendChild(progressBar);
        }
        if (prog.totalChunks > 0) {
            const pct = Math.round((prog.chunk / prog.totalChunks) * 100);
            const fill = document.getElementById('cglFetchFill');
            const text = document.getElementById('cglFetchText');
            if (fill) fill.style.width = pct + '%';
            if (text) text.textContent = `Syncing from HawkSoft\u2026 ${pct}% (batch ${prog.chunk} of ${prog.totalChunks})`;
        }
    },

    _hideFetchProgress() {
        const el = document.getElementById('cglFetchProgress');
        if (el) el.remove();
    },

    // ── Cache helpers (IndexedDB-backed) ──

    async saveToCache(data) {
        const cacheObj = {
            ...data,
            cachedAt: Date.now(),
            last_synced_time: new Date().toISOString()
        };
        // Primary: IndexedDB (no size limit)
        try {
            await CglIDB.set(IDB_POLICY_KEY, cacheObj);
        } catch (e) {
            console.warn('[CGL] IndexedDB write failed, falling back to localStorage:', e);
        }
        // Fallback: localStorage mirror
        try {
            localStorage.setItem(CGL_CACHE_KEY, JSON.stringify(cacheObj));
        } catch (e) {
            console.warn('[CGL] Cache too large for localStorage');
        }
        // Also persist to disk via server (localhost only)
        const _isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (_isLocal) {
            fetch('/local/cgl-cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cacheObj)
            }).catch(() => {});
        }

        // Cloud: Vercel KV (non-blocking) — skip if payload > 900KB (KV limit is 1MB)
        const cacheSize = JSON.stringify(cacheObj).length;
        if (cacheSize < 900_000) {
            this._syncToKV('cgl_cache', cacheObj);
        } else {
            console.log(`[CGL] Skipping KV cache sync — payload too large (${(cacheSize / 1024).toFixed(0)}KB)`);
        }

        // Update last-synced UI
        this.renderLastSynced(cacheObj.last_synced_time);
    },

    async loadFromCache() {
        // 1. Try IndexedDB first (primary store) — with timeout to prevent hangs
        try {
            const cached = await Promise.race([
                CglIDB.get(IDB_POLICY_KEY),
                new Promise((_, reject) => setTimeout(() => reject(new Error('IDB cache read timeout')), 3000))
            ]);
            if (cached && cached.cachedAt && cached.policies && cached.allPolicies?.length > 0) {
                console.log('[CGL] Cache loaded from IndexedDB:', cached.policies.length, 'CGL +', cached.allPolicies.length, 'total policies');
                return cached;
            }
        } catch (e) {
            console.warn('[CGL] IndexedDB cache read failed, trying localStorage:', e);
        }

        // 2. Fallback: localStorage
        try {
            const raw = localStorage.getItem(CGL_CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached.cachedAt && cached.policies && cached.allPolicies?.length > 0) {
                    // Promote back to IndexedDB
                    CglIDB.set(IDB_POLICY_KEY, cached).catch(() => {});
                    return cached;
                }
            }
        } catch (e) {
            // Corrupted JSON — silently fall through to API fetch
            console.warn('[CGL] localStorage cache corrupt, will fetch from API');
        }

        // 3. Fallback: server disk cache (survives both clears — localhost only)
        const _isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!_isLocalHost) return null;
        try {
            console.log('[CGL] Cache tier 3: trying disk /local/cgl-cache...');
            const controller = new AbortController();
            const diskTimeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch('/local/cgl-cache', { signal: controller.signal });
            clearTimeout(diskTimeout);
            if (res.ok) {
                const cached = await res.json();
                if (cached.cachedAt && cached.policies && cached.allPolicies?.length > 0) {
                    console.log('[CGL] Cache loaded from disk:', cached.policies.length, 'CGL +', cached.allPolicies.length, 'total policies');
                    // Restore to IndexedDB + localStorage
                    CglIDB.set(IDB_POLICY_KEY, cached).catch(() => {});
                    try { localStorage.setItem(CGL_CACHE_KEY, JSON.stringify(cached)); } catch (e) {}
                    return cached;
                }
            }
        } catch (e) {
            console.warn('[CGL] Disk cache fetch failed:', e);
        }

        return null;
    },

    renderLastSynced(isoTime) {
        const el = document.getElementById('cglLastSynced');
        if (!el) return;
        if (!isoTime) {
            el.textContent = '';
            return;
        }
        const syncDate = new Date(isoTime);
        const ageMs = Date.now() - syncDate.getTime();
        const isStale = ageMs > 24 * 60 * 60 * 1000; // older than 24h
        const timeStr = syncDate.toLocaleString();
        el.textContent = `Last synced: ${timeStr}`;
        el.style.color = isStale ? '#f59e0b' : '';
        el.title = isStale ? 'Data is over 24 hours old — consider refreshing' : '';
    },

    async showLocalDevMode() {
        const error = document.getElementById('cglError');
        const tableContainer = document.getElementById('cglTableContainer');
        const lastFetch = document.getElementById('cglLastFetch');
        const loading = document.getElementById('cglLoading');

        // Try ALL cache sources: disk → IDB → localStorage
        let cachedData = null;

        // Source 1: Disk (only available on local server)
        try {
            const res = await fetch('/local/cgl-cache');
            if (res.ok) {
                const data = await res.json();
                if (data?.policies?.length > 0) cachedData = data;
            }
        } catch (e) { /* disk not available (Vercel) — expected */ }

        // Source 2: IDB
        if (!cachedData) {
            try {
                const data = await Promise.race([
                    CglIDB.get(IDB_POLICY_KEY),
                    new Promise((_, rej) => setTimeout(() => rej('timeout'), 3000))
                ]);
                if (data?.policies?.length > 0) cachedData = data;
            } catch (e) { /* IDB failed */ }
        }

        // Source 3: localStorage
        if (!cachedData) {
            try {
                const raw = localStorage.getItem(CGL_CACHE_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    if (data?.policies?.length > 0) cachedData = data;
                }
            } catch (e) { /* localStorage failed */ }
        }

        // Source 4: Vercel KV (cloud)
        if (!cachedData) {
            try {
                const data = await this._loadFromKV('cgl_cache');
                if (data?.policies?.length > 0) cachedData = data;
            } catch (e) { /* KV not available */ }
        }

        if (cachedData) {
            this.policies = cachedData.policies;
            const fetchTime = cachedData.metadata?.fetchedAt
                ? new Date(cachedData.metadata.fetchedAt).toLocaleString()
                : 'unknown';
            const ageMin = cachedData.cachedAt ? Math.round((Date.now() - cachedData.cachedAt) / 60000) : '?';
            if (lastFetch) {
                lastFetch.innerHTML = `Last updated: ${fetchTime} <span style="color:var(--apple-gray);font-size:12px;">(cached ${ageMin}m ago — HawkSoft unavailable)</span>`;
            }
            this.renderLastSynced(cachedData.last_synced_time || cachedData.metadata?.fetchedAt);

            // Cross-promote to all stores
            CglIDB.set(IDB_POLICY_KEY, cachedData).catch(() => {});
            try { localStorage.setItem(CGL_CACHE_KEY, JSON.stringify(cachedData)); } catch (e) {}

            if (loading) loading.style.display = 'none';
            error.style.display = 'none';
            tableContainer.style.display = 'block';
            this.deduplicateRenewals();
            this.checkForRenewals();
            this.renderTypeToggles();
            this.renderPolicies();
            this.updateStats();
            console.log(`[CGL] Loaded ${this.policies.length} policies from cache (API unavailable)`);
            return;
        }

        // No cached data available — show helpful empty state
        error.style.display = 'none';
        if (loading) loading.style.display = 'none';
        tableContainer.style.display = 'block';

        if (lastFetch) {
            lastFetch.innerHTML = '<span style="color: #f59e0b; font-weight: 600;">⚡ No Data</span> — Click <strong>Refresh</strong> to fetch from HawkSoft, or use CSV Import / Open File to load data.';
        }

        this.policies = [];
        this.renderTypeToggles();
        this.renderPolicies();
        this.updateStats();
    },

    refresh() {
        if (this._printMode) this.togglePrintMode();
        this.forceRefresh();
    },

    async forceRefresh() {
        // Show syncing state
        const refreshBtn = document.querySelector('[onclick*="ComplianceDashboard.refresh()"]');
        const origLabel = refreshBtn ? refreshBtn.innerHTML : '';
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '⏳ Syncing...';
        }

        const bar = document.getElementById('cglRefreshBar');
        const banner = document.getElementById('cglRefreshBanner');

        // If we already have data, keep it visible and refresh in background
        if (this.policies && this.policies.length > 0) {
            if (bar) bar.classList.add('active');
            if (banner) banner.classList.add('active');
            await this.fetchPoliciesFromAPI(true, true);
            if (bar) bar.classList.remove('active');
            if (banner) banner.classList.remove('active');
        } else {
            // No existing data — full loading screen, bypass server cache
            await this.fetchPoliciesFromAPI(false, true);
        }

        // Restore button
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = origLabel;
        }
    },

    // --- Policy state helpers ---

    // Deduplicate renewed policies — same policyNumber keeps latest expiration,
    // same client+type with expired+active auto-dismisses the expired entry
    deduplicateRenewals() {
        if (!this.policies || this.policies.length === 0) return;

        // Phase 1: Same policyNumber — keep only the entry with the latest expiration
        const byPolicyNum = {};
        this.policies.forEach(p => {
            const pn = p.policyNumber;
            if (!byPolicyNum[pn]) byPolicyNum[pn] = [];
            byPolicyNum[pn].push(p);
        });

        const deduped = [];
        let dedupCount = 0;

        for (const pn of Object.keys(byPolicyNum)) {
            const group = byPolicyNum[pn];
            if (group.length === 1) {
                deduped.push(group[0]);
                continue;
            }
            group.sort((a, b) => new Date(b.expirationDate) - new Date(a.expirationDate));
            const winner = group[0];
            const oldest = group[group.length - 1];
            winner._renewedFrom = oldest.expirationDate;
            deduped.push(winner);
            dedupCount += group.length - 1;
            console.log(`[CGL] Dedup: ${pn} — kept exp ${winner.expirationDate}, removed ${group.length - 1} older term(s)`);
        }

        // Phase 2: Same client + same policy type where one is expired and another is active —
        // auto-dismiss the expired entry as superseded (catches cross-number renewals)
        const byClientType = {};
        deduped.forEach(p => {
            const key = `${p.clientNumber || ''}_${p.policyType || 'cgl'}`;
            if (!byClientType[key]) byClientType[key] = [];
            byClientType[key].push(p);
        });

        let supersededCount = 0;
        for (const key of Object.keys(byClientType)) {
            const group = byClientType[key];
            if (group.length <= 1) continue;

            const active = group.filter(p => p.daysUntilExpiration >= 0);
            const expired = group.filter(p => p.daysUntilExpiration < 0);

            if (active.length > 0 && expired.length > 0) {
                const newestActive = active.sort((a, b) => new Date(b.expirationDate) - new Date(a.expirationDate))[0];
                expired.forEach(expPolicy => {
                    if (!this.dismissedPolicies[expPolicy.policyNumber]) {
                        this.dismissedPolicies[expPolicy.policyNumber] = {
                            dismissedAt: new Date().toISOString(),
                            expirationDate: expPolicy.expirationDate,
                            reason: 'superseded'
                        };
                        this.addQuickNote(expPolicy.policyNumber, `Auto-dismissed: superseded by active policy ${newestActive.policyNumber} (exp ${new Date(newestActive.expirationDate).toLocaleDateString()})`);
                        supersededCount++;
                        console.log(`[CGL] Superseded: ${expPolicy.policyNumber} auto-dismissed — active ${newestActive.policyNumber} for same client+type`);
                    }
                    newestActive._renewalDetected = true;
                    newestActive._supersedes = expPolicy.policyNumber;
                });
            }
        }

        this.policies = deduped;
        if (dedupCount > 0 || supersededCount > 0) {
            if (supersededCount > 0) this.saveState();
            console.log(`[CGL] Dedup complete: ${dedupCount} duplicate term(s) removed, ${supersededCount} expired policy(ies) auto-dismissed`);
        }
    },

    // Auto-clear verified/dismissed markers when a policy renews (expiration date changes).
    // Sets needsStateUpdate flag so renewed policies stay prominent until user clicks "State Updated".
    // Idempotent: if needsStateUpdate is already set, clears the marker but skips adding duplicate notes.
    checkForRenewals() {
        if (!this.policies || this.policies.length === 0) return;
        let cleared = 0;

        this.policies.forEach(policy => {
            const pn = policy.policyNumber;
            const existingNote = this.getNoteData(pn);
            const alreadyFlagged = !!(existingNote && existingNote.needsStateUpdate && !existingNote.stateUpdated);

            // Check verified markers
            const verified = this.verifiedPolicies[pn];
            if (verified) {
                if (verified.expirationDate && policy.expirationDate) {
                    const storedExp = new Date(verified.expirationDate).getTime();
                    const currentExp = new Date(policy.expirationDate).getTime();
                    if (currentExp - storedExp > 30 * 24 * 60 * 60 * 1000) {
                        // Skip if user already acknowledged this exact expiration
                        if (existingNote?.stateUpdated && existingNote?.stateUpdatedForExp === policy.expirationDate) return;
                        console.log(`[CGL] Renewal detected: ${pn} — exp moved from ${verified.expirationDate} to ${policy.expirationDate}. Clearing verified marker.`);
                        if (!alreadyFlagged) {
                            this.addQuickNote(pn, `Auto-cleared: policy renewed (exp changed from ${new Date(verified.expirationDate).toLocaleDateString()} to ${new Date(policy.expirationDate).toLocaleDateString()})`);
                        }
                        delete this.verifiedPolicies[pn];
                        const nd = this.getNoteData(pn) || { log: [] };
                        nd.stateUpdated = null; nd.renewedTo = null; nd.needsStateUpdate = true;
                        this.policyNotes[pn] = nd;
                        cleared++;
                    }
                } else if (!verified.expirationDate && verified.updatedAt && policy.expirationDate) {
                    const verifiedAt = new Date(verified.updatedAt).getTime();
                    const currentExp = new Date(policy.expirationDate).getTime();
                    if (currentExp - verifiedAt > 180 * 24 * 60 * 60 * 1000) {
                        // Skip if user already acknowledged this exact expiration
                        if (existingNote?.stateUpdated && existingNote?.stateUpdatedForExp === policy.expirationDate) return;
                        console.log(`[CGL] Likely renewal (legacy marker): ${pn} — verified ${verified.updatedAt}, exp ${policy.expirationDate}. Clearing.`);
                        if (!alreadyFlagged) {
                            this.addQuickNote(pn, `Auto-cleared: likely renewal (verified ${new Date(verified.updatedAt).toLocaleDateString()}, now expires ${new Date(policy.expirationDate).toLocaleDateString()})`);
                        }
                        delete this.verifiedPolicies[pn];
                        const nd = this.getNoteData(pn) || { log: [] };
                        nd.stateUpdated = null; nd.renewedTo = null; nd.needsStateUpdate = true;
                        this.policyNotes[pn] = nd;
                        cleared++;
                    }
                }
            }

            // Check dismissed markers the same way
            const dismissed = this.dismissedPolicies[pn];
            if (dismissed) {
                if (dismissed.expirationDate && policy.expirationDate) {
                    const storedExp = new Date(dismissed.expirationDate).getTime();
                    const currentExp = new Date(policy.expirationDate).getTime();
                    if (currentExp - storedExp > 30 * 24 * 60 * 60 * 1000) {
                        // Skip if user already acknowledged this exact expiration
                        if (existingNote?.stateUpdated && existingNote?.stateUpdatedForExp === policy.expirationDate) return;
                        console.log(`[CGL] Renewal detected (dismissed): ${pn} — exp moved from ${dismissed.expirationDate} to ${policy.expirationDate}. Clearing dismissed marker.`);
                        if (!alreadyFlagged) {
                            this.addQuickNote(pn, `Auto-cleared: policy renewed (exp changed from ${new Date(dismissed.expirationDate).toLocaleDateString()} to ${new Date(policy.expirationDate).toLocaleDateString()})`);
                        }
                        delete this.dismissedPolicies[pn];
                        const nd = this.getNoteData(pn) || { log: [] };
                        nd.stateUpdated = null; nd.renewedTo = null; nd.needsStateUpdate = true;
                        this.policyNotes[pn] = nd;
                        cleared++;
                    }
                } else if (dismissed.dismissedAt && policy.expirationDate) {
                    const dismissedAt = new Date(dismissed.dismissedAt).getTime();
                    const currentExp = new Date(policy.expirationDate).getTime();
                    if (currentExp - dismissedAt > 180 * 24 * 60 * 60 * 1000) {
                        // Skip if user already acknowledged this exact expiration
                        if (existingNote?.stateUpdated && existingNote?.stateUpdatedForExp === policy.expirationDate) return;
                        console.log(`[CGL] Likely renewal (dismissed legacy): ${pn} — dismissed ${dismissed.dismissedAt}, exp ${policy.expirationDate}. Clearing.`);
                        if (!alreadyFlagged) {
                            this.addQuickNote(pn, `Auto-cleared: policy renewed (exp changed from ${new Date(dismissed.dismissedAt).toLocaleDateString()} to ${new Date(policy.expirationDate).toLocaleDateString()})`);
                        }
                        delete this.dismissedPolicies[pn];
                        const nd = this.getNoteData(pn) || { log: [] };
                        nd.stateUpdated = null; nd.renewedTo = null; nd.needsStateUpdate = true;
                        this.policyNotes[pn] = nd;
                        cleared++;
                    }
                }
            }
        });

        if (cleared > 0) {
            this.saveState();
            console.log(`[CGL] Auto-cleared ${cleared} marker(s) due to detected renewals.`);
        }
    },

    isHidden(policyNumber) {
        return !!this.verifiedPolicies[policyNumber] || !!this.dismissedPolicies[policyNumber] || this._isSnoozeActive(policyNumber);
    },

    _isSnoozeActive(policyNumber) {
        const snooze = this.snoozedPolicies[policyNumber];
        if (!snooze) return false;
        return new Date() < new Date(snooze.snoozedUntil);
    },

    _expireSnoozes() {
        const now = new Date();
        let expired = 0;
        for (const pn of Object.keys(this.snoozedPolicies)) {
            if (now >= new Date(this.snoozedPolicies[pn].snoozedUntil)) {
                delete this.snoozedPolicies[pn];
                expired++;
            }
        }
        if (expired > 0) {
            this.saveState();
            console.log(`[CGL] ${expired} snooze(s) expired`);
        }
    },

    getHiddenCount() {
        let count = 0;
        this.policies.forEach(p => {
            if (this.isHidden(p.policyNumber)) count++;
        });
        return count;
    },

    // --- User actions ---

    togglePolicyVerified(policyNumber) {
        if (this.verifiedPolicies[policyNumber]) {
            delete this.verifiedPolicies[policyNumber];
        } else {
            // Store the current expiration date so we can detect renewals later
            const policy = this.policies.find(p => p.policyNumber === policyNumber);
            this.verifiedPolicies[policyNumber] = {
                updatedAt: new Date().toISOString(),
                updatedBy: 'user',
                expirationDate: policy ? policy.expirationDate : null
            };
        }
        this.saveState();
        this.trackChange();
        this.filterPolicies();
        this.updateStats();
    },

    dismissPolicy(policyNumber) {
        const policy = this.policies.find(p => p.policyNumber === policyNumber);
        this.dismissedPolicies[policyNumber] = {
            dismissedAt: new Date().toISOString(),
            expirationDate: policy ? policy.expirationDate : null
        };
        this.saveState();
        this.trackChange();
        this.filterPolicies();
        this.updateStats();
    },

    snoozePolicy(policyNumber) {
        const existing = this.snoozedPolicies[policyNumber];
        const count = existing ? (existing.count || 1) + 1 : 1;
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        this.snoozedPolicies[policyNumber] = {
            snoozedAt: now.toISOString(),
            snoozedUntil: tomorrow.toISOString(),
            count
        };
        const label = tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        this.addQuickNote(policyNumber, `🛏️ Snoozed until ${label} (snooze #${count})`);
        this.saveState();
        this.trackChange();
        this.filterPolicies();
        this.updateStats();
    },

    unsnoozePolicy(policyNumber) {
        delete this.snoozedPolicies[policyNumber];
        this.saveState();
        this.filterPolicies();
        this.updateStats();
    },

    undismissPolicy(policyNumber) {
        delete this.dismissedPolicies[policyNumber];
        this.saveState();
        this.filterPolicies();
        this.updateStats();
    },

    unverifyPolicy(policyNumber) {
        delete this.verifiedPolicies[policyNumber];
        this.saveState();
        this.filterPolicies();
        this.updateStats();
    },

    toggleShowHidden() {
        this.showHidden = !this.showHidden;
        const btn = document.getElementById('cglShowHiddenBtn');
        if (this.showHidden) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        this.filterPolicies();
    },

    clearAll() {
        if (confirm('Clear ALL verified markers, dismissed policies, and notes? This cannot be undone.\n\nA backup will be downloaded automatically before clearing.')) {
            // Auto-backup before destructive clear (Nuclear Option)
            this.downloadFullBackup();

            this.verifiedPolicies = {};
            this.dismissedPolicies = {};
            this.snoozedPolicies = {};
            this.policyNotes = {};
            // Force disk sync even though state is empty (user explicitly cleared)
            this._stateLoaded = true;
            this.saveState({ forceDiskSync: true });
            // Also clear IDB annotations
            CglIDB.clearAnnotations().catch(() => {});
            this.showHidden = false;
            document.getElementById('cglShowHiddenBtn').classList.remove('active');
            this.renderPolicies();
            this.updateStats();
        }
    },

    // --- Sorting ---

    toggleSort(field) {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }
        this.updateSortIndicator();
        this.saveState();
        this.filterPolicies();
    },

    updateSortIndicator() {
        document.querySelectorAll('.cgl-table th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === this.sortField) {
                th.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    },

    _needsStateUpdate(policyNumber) {
        const nd = this.getNoteData(policyNumber);
        return !!(nd && nd.needsStateUpdate && !nd.stateUpdated);
    },

    sortPolicies(policies) {
        const field = this.sortField;
        const dir = this.sortDirection === 'asc' ? 1 : -1;
        return [...policies].sort((a, b) => {
            const aNeedsUpdate = this._needsStateUpdate(a.policyNumber);
            const bNeedsUpdate = this._needsStateUpdate(b.policyNumber);
            // Renewed-needs-state-update policies always sort first (above everything)
            if (aNeedsUpdate !== bNeedsUpdate) return aNeedsUpdate ? -1 : 1;

            let va = a[field], vb = b[field];
            if (field === 'daysUntilExpiration') {
                return (Number(va) - Number(vb)) * dir;
            }
            if (field === 'status') {
                const order = { critical: 0, expired: 1, 'expiring-soon': 2, active: 3 };
                return ((order[va] ?? 99) - (order[vb] ?? 99)) * dir;
            }
            va = (va || '').toString().toLowerCase();
            vb = (vb || '').toString().toLowerCase();
            return va.localeCompare(vb) * dir;
        });
    },

    // --- Policy Notes ---

    // Migrate old single-text note format to log array format
    _migrateNote(noteData) {
        if (!noteData) return null;
        // Already migrated
        if (noteData.log && Array.isArray(noteData.log)) return noteData;
        // Old format: { text, updatedAt }
        if (noteData.text) {
            return {
                log: [{ text: noteData.text, at: noteData.updatedAt || new Date().toISOString() }],
                renewedTo: noteData.renewedTo || null
            };
        }
        return null;
    },

    getNoteData(policyNumber) {
        const raw = this.policyNotes[policyNumber];
        if (!raw) return null;
        const migrated = this._migrateNote(raw);
        if (migrated && migrated !== raw) {
            this.policyNotes[policyNumber] = migrated;
        }
        return migrated;
    },

    getLatestNoteText(policyNumber) {
        const data = this.getNoteData(policyNumber);
        if (!data || !data.log || data.log.length === 0) return '';
        return data.log[data.log.length - 1].text;
    },

    formatNoteTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return diffMin + 'm ago';
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h ago';
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return diffDay + 'd ago';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },

    renderNoteLog(policyNumber) {
        const data = this.getNoteData(policyNumber);
        if (!data || !data.log || data.log.length === 0) return '';
        return data.log.slice().reverse().map((entry, revIdx) => {
            const origIdx = data.log.length - 1 - revIdx;
            return `
            <div class="cgl-note-entry">
                <span class="cgl-note-entry-text">${this.escapeHtml(entry.text)}</span>
                <span class="cgl-note-entry-time">${this.formatNoteTime(entry.at)}</span>
                <button class="cgl-note-delete-btn" onclick="ComplianceDashboard.deleteNoteEntry('${this.escapeHtml(policyNumber)}',${origIdx})" title="Delete this note">&times;</button>
            </div>
        `;
        }).join('');
    },

    toggleNote(policyNumber) {
        const row = document.getElementById('note-row-' + policyNumber);
        if (row) {
            const isOpening = row.style.display === 'none';
            row.style.display = isOpening ? 'table-row' : 'none';
            if (isOpening) {
                // Refresh note log
                const logEl = row.querySelector('.cgl-note-log');
                if (logEl) logEl.innerHTML = this.renderNoteLog(policyNumber);
                const input = row.querySelector('textarea');
                if (input) { input.value = ''; input.focus(); }
            }
        }
    },

    addQuickNote(policyNumber, text) {
        let data = this.getNoteData(policyNumber);
        if (!data) data = { log: [], renewedTo: null };
        data.log.push({ text, at: new Date().toISOString() });
        this.policyNotes[policyNumber] = data;
        this.saveState();
        this._refreshNoteUI(policyNumber);
    },

    deleteNoteEntry(policyNumber, index) {
        const data = this.getNoteData(policyNumber);
        if (!data || !data.log || index < 0 || index >= data.log.length) return;
        data.log.splice(index, 1);
        // If log is now empty and no other note metadata, clean up entirely
        if (data.log.length === 0 && !data.renewedTo && !data.stateUpdated) {
            delete this.policyNotes[policyNumber];
        } else {
            this.policyNotes[policyNumber] = data;
        }
        this.saveState();
        this._refreshNoteUI(policyNumber);
        // Refresh the note log in the expanded row
        const noteRow = document.getElementById('note-row-' + policyNumber);
        if (noteRow && noteRow.style.display !== 'none') {
            const logEl = noteRow.querySelector('.cgl-note-log');
            if (logEl) logEl.innerHTML = this.renderNoteLog(policyNumber);
        }
    },

    markRenewed(policyNumber) {
        const newPN = prompt('Enter the new/renewed policy number:');
        if (!newPN || !newPN.trim()) return;
        const trimmedPN = newPN.trim();
        // 1. Save locally first (immediate, non-blocking)
        let data = this.getNoteData(policyNumber);
        if (!data) data = { log: [], renewedTo: null };
        data.renewedTo = trimmedPN;
        data.log.push({ text: 'Renewed → ' + trimmedPN, at: new Date().toISOString() });
        this.policyNotes[policyNumber] = data;
        this.saveState();
        this._refreshNoteUI(policyNumber);
        // 2. Fire-and-forget to HawkSoft logger (non-blocking)
        const policy = this.policies.find(p => p.policyNumber === policyNumber);
        if (policy && policy.hawksoftId && policy.policyId) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
            const formattedLog = [
                `RE: Policy Renewed — Compliance Dashboard`,
                `Outbound — ${dateStr}, ${timeStr}`,
                ``,
                `Policy ${policyNumber} (${policy.clientName}) has been renewed.`,
                `New policy number: ${trimmedPN}`,
                `Carrier: ${policy.carrier}`,
                `Previous expiration: ${new Date(policy.expirationDate).toLocaleDateString()}`,
                ``,
                `Logged automatically via Altech CGL Compliance Dashboard.`,
                ``,
                `Action Items: Update HawkSoft with new policy number and renewal dates.`
            ].join('\n');
            const payload = {
                policyId: policyNumber,
                clientNumber: String(policy.hawksoftId),
                hawksoftPolicyId: policy.policyId,
                callType: 'Outbound',
                formattedLog
            };
            Auth.apiFetch('/api/hawksoft-logger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(res => {
                if (res.ok) {
                    const noteData = this.getNoteData(policyNumber);
                    if (noteData && noteData.log.length > 0) {
                        const last = noteData.log[noteData.log.length - 1];
                        last.text = last.text + ' ✓ logged to HawkSoft';
                        this.policyNotes[policyNumber] = noteData;
                        this.saveState();
                        this._refreshNoteUI(policyNumber);
                    }
                } else {
                    const noteData = this.getNoteData(policyNumber);
                    if (noteData && noteData.log.length > 0) {
                        const last = noteData.log[noteData.log.length - 1];
                        last.text = last.text + ' ⚠ HawkSoft log failed';
                        this.policyNotes[policyNumber] = noteData;
                        this.saveState();
                        this._refreshNoteUI(policyNumber);
                    }
                }
            }).catch(() => {
                const noteData = this.getNoteData(policyNumber);
                if (noteData && noteData.log.length > 0) {
                    const last = noteData.log[noteData.log.length - 1];
                    last.text = last.text + ' ⚠ HawkSoft log failed';
                    this.policyNotes[policyNumber] = noteData;
                    this.saveState();
                    this._refreshNoteUI(policyNumber);
                }
            });
        }
    },

    searchForPolicy(pn) {
        const searchInput = document.getElementById('cglSearchInput');
        if (searchInput) {
            searchInput.value = pn;
            this.savedSearch = pn;
            this._visibleCount = this._pageSize;
            this.saveState();
            this.filterPolicies();
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    clearRenewed(policyNumber) {
        const data = this.getNoteData(policyNumber);
        if (!data) return;
        data.renewedTo = null;
        data.log = data.log.filter(entry => !entry.text.startsWith('Renewed →') && !entry.text.startsWith('Renewed (New Policy #)'));
        this.policyNotes[policyNumber] = data;
        if (data.log.length === 0 && !data.stateUpdated) {
            delete this.policyNotes[policyNumber];
        }
        this.saveState();
        this._refreshNoteUI(policyNumber);
        this.filterPolicies();
    },

    markStateUpdated(policyNumber) {
        let data = this.getNoteData(policyNumber);
        if (!data) data = { log: [], renewedTo: null };
        data.stateUpdated = new Date().toISOString();
        data.needsStateUpdate = false;
        // Record which expiration was acknowledged so checkForRenewals() won't re-flag the same renewal
        const policy = this.policies?.find(p => p.policyNumber === policyNumber);
        if (policy?.expirationDate) data.stateUpdatedForExp = policy.expirationDate;
        data.log.push({ text: 'State website updated', at: new Date().toISOString() });
        this.policyNotes[policyNumber] = data;
        this.saveState();
        this._refreshNoteUI(policyNumber);
        this.filterPolicies();
    },

    saveNote(policyNumber) {
        const input = document.querySelector(`#note-row-${policyNumber} textarea`);
        if (!input) return;
        const text = input.value.trim();
        if (!text) return; // Don't save empty — user can just close
        let data = this.getNoteData(policyNumber);
        if (!data) data = { log: [], renewedTo: null };
        data.log.push({ text, at: new Date().toISOString() });
        this.policyNotes[policyNumber] = data;
        input.value = '';
        this.saveState();
        this._refreshNoteUI(policyNumber);
    },

    _refreshNoteUI(policyNumber) {
        const data = this.getNoteData(policyNumber);
        const hasNote = data && data.log && data.log.length > 0;
        const latestText = hasNote ? data.log[data.log.length - 1].text : '';
        const isStateUpdated = !!(data && data.stateUpdated);

        // Update note icon
        const btn = document.querySelector(`[data-note-for="${policyNumber}"]`);
        if (btn) {
            btn.classList.toggle('has-note', hasNote);
            btn.title = hasNote ? 'Note: ' + latestText : 'Add note';
        }
        // Update state badge
        const stateBadge = document.getElementById('state-badge-' + policyNumber);
        if (stateBadge) {
            stateBadge.style.display = isStateUpdated ? 'inline-block' : 'none';
            if (isStateUpdated) stateBadge.textContent = '✅ State Updated';
        }
        // Update note preview (hide if state updated since badge is more important)
        const preview = document.getElementById('note-preview-' + policyNumber);
        if (preview) {
            if (isStateUpdated) {
                preview.style.display = 'none';
            } else {
                let previewText = latestText;
                if (data && data.renewedTo) previewText = 'Renewed → ' + data.renewedTo;
                preview.textContent = previewText;
                preview.style.display = hasNote ? 'block' : 'none';
            }
        }
        // Apply/remove green row tint
        const row = document.querySelector(`[data-note-for="${policyNumber}"]`);
        if (row) {
            const tr = row.closest('tr');
            if (tr) tr.classList.toggle('cgl-state-updated-row', isStateUpdated);
        }
        // Update note log in expanded row
        const noteRow = document.getElementById('note-row-' + policyNumber);
        if (noteRow && noteRow.style.display !== 'none') {
            const logEl = noteRow.querySelector('.cgl-note-log');
            if (logEl) logEl.innerHTML = this.renderNoteLog(policyNumber);
        }
        // Update renewed badge
        const badgeEl = document.getElementById('renewed-badge-' + policyNumber);
        if (badgeEl && data && data.renewedTo) {
            badgeEl.style.display = 'inline-flex';
            badgeEl.style.alignItems = 'center';
            badgeEl.style.gap = '4px';
            badgeEl.innerHTML = `<span onclick="ComplianceDashboard.searchForPolicy('${data.renewedTo}')" style="cursor:pointer;" title="Click to find renewed policy">→ ${data.renewedTo}</span><span onclick="ComplianceDashboard.clearRenewed('${policyNumber}')" style="cursor:pointer;opacity:0.6;font-size:10px;" title="Clear renewal link">✕</span>`;
        } else if (badgeEl) {
            badgeEl.style.display = 'none';
            badgeEl.innerHTML = '';
        }
    },

    // --- Filtering ---

    toggleType(type) {
        const idx = this.hiddenTypes.indexOf(type);
        if (idx >= 0) {
            this.hiddenTypes.splice(idx, 1);
        } else {
            this.hiddenTypes.push(type);
        }
        this._visibleCount = this._pageSize;
        this.saveState();
        this.renderTypeToggles();
        this.filterPolicies();
        this.updateStats();
    },

    toggleOptions() {
        const panel = document.getElementById('cglOptionsPanel');
        if (!panel) return;
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        const btn = document.getElementById('cglOptionsBtn');
        if (btn) btn.classList.toggle('active', !isOpen);
        // Re-render checkboxes on open so policies are guaranteed to be loaded
        if (!isOpen) this.renderNotifyTypeToggles();
    },

    toggleNotifyType(type) {
        const idx = this.notifyTypes.indexOf(type);
        if (idx >= 0) {
            this.notifyTypes.splice(idx, 1);
        } else {
            this.notifyTypes.push(type);
        }
        this.saveState();
        this.renderNotifyTypeToggles();
        this.updateStats();
        this.filterPolicies();
    },

    renderNotifyTypeToggles() {
        const container = document.getElementById('cglNotifyTypeToggles');
        if (!container) return;
        const allTypes = ['cgl', 'bond', 'auto', 'wc', 'pkg', 'umbrella', 'bop', 'property', 'im', 'epli', 'do', 'eo', 'cyber', 'commercial'];
        const presentTypes = new Set(this.policies.map(p => p.policyType || 'cgl'));
        const typesToShow = allTypes.filter(t => presentTypes.has(t));
        container.innerHTML = typesToShow.map(type => {
            const isNotifying = this.notifyTypes.includes(type);
            const label = this._typeLabel(type);
            return `<label class="cgl-notify-type-label${isNotifying ? '' : ' cgl-notify-muted'}">
                <input type="checkbox" ${isNotifying ? 'checked' : ''}
                    onchange="ComplianceDashboard.toggleNotifyType('${type}')">
                <span class="cgl-type-badge ${type}">${label}</span>
            </label>`;
        }).join('');
    },

    renderTypeToggles() {
        const container = document.getElementById('cglTypeToggles');
        if (!container) return;

        // Gather all unique policy types present in the data
        const allTypes = ['cgl', 'bond', 'auto', 'wc', 'pkg', 'umbrella', 'bop', 'property', 'im', 'epli', 'do', 'eo', 'cyber', 'commercial'];
        const presentTypes = new Set(this.policies.map(p => p.policyType || 'cgl'));
        const typesToShow = allTypes.filter(t => presentTypes.has(t));

        container.innerHTML = typesToShow.map(type => {
            const isHidden = this.hiddenTypes.includes(type);
            const label = this._typeLabel(type);
            // Count only non-hidden/dismissed policies to match stat card total
            const count = this.policies.filter(p => (p.policyType || 'cgl') === type && !this.isHidden(p.policyNumber)).length;
            return `<button class="cgl-type-toggle cgl-type-badge ${type} ${isHidden ? 'cgl-type-hidden' : ''}" onclick="ComplianceDashboard.toggleType('${type}')" title="${isHidden ? 'Show' : 'Hide'} ${label} policies (${count})">${label} <span class="cgl-type-count">${count}</span></button>`;
        }).join('');
    },

    filterPolicies() {
        this._expireSnoozes();
        const searchTerm = document.getElementById('cglSearchInput').value.toLowerCase();
        const filterStatus = document.getElementById('cglFilterSelect').value;

        const filtered = this.policies.filter(policy => {
            const isHidden = this.isHidden(policy.policyNumber);

            // Hide policies whose type is toggled off
            const pType = policy.policyType || 'cgl';
            if (this.hiddenTypes.includes(pType)) return false;

            if (!this.showHidden && isHidden) return false;

            const matchesSearch =
                policy.clientName.toLowerCase().includes(searchTerm) ||
                policy.policyNumber.toLowerCase().includes(searchTerm) ||
                policy.carrier.toLowerCase().includes(searchTerm);

            const matchesStatus =
                filterStatus === 'all' ||
                (filterStatus === 'critical' && policy.daysUntilExpiration >= 0 && policy.daysUntilExpiration <= 5) ||
                (filterStatus === 'expiring-soon' && (policy.status === 'expiring-soon' || (policy.status === 'critical' && policy.daysUntilExpiration > 5))) ||
                (filterStatus === 'expired' && policy.status === 'expired') ||
                (filterStatus === 'manual-verification' && policy.requiresManualVerification) ||
                (filterStatus === 'not-updated' && !this.verifiedPolicies[policy.policyNumber]) ||
                (filterStatus === 'cgl-only' && (policy.policyType || 'cgl') === 'cgl') ||
                (filterStatus === 'bond-only' && policy.policyType === 'bond') ||
                (filterStatus === 'auto-only' && policy.policyType === 'auto') ||
                (filterStatus === 'wc-only' && policy.policyType === 'wc') ||
                (filterStatus === 'pkg-only' && policy.policyType === 'pkg') ||
                (filterStatus === 'umbrella-only' && policy.policyType === 'umbrella') ||
                (filterStatus === 'bop-only' && policy.policyType === 'bop') ||
                (filterStatus === 'property-only' && policy.policyType === 'property') ||
                (filterStatus === 'renewed' && this.getNoteData(policy.policyNumber)?.renewedTo) ||
                (filterStatus === 'has-notes' && this.getNoteData(policy.policyNumber)?.log?.length > 0) ||
                (filterStatus === 'state-updated' && this.getNoteData(policy.policyNumber)?.stateUpdated) ||
                (filterStatus === 'needs-state-update' && !this.getNoteData(policy.policyNumber)?.stateUpdated && !this.isHidden(policy.policyNumber));

            return matchesSearch && matchesStatus;
        });

        // Apply sort
        const sorted = this.sortPolicies(filtered);
        this.renderPolicies(sorted);
    },

    // --- Rendering ---

    renderPolicies(filteredList = null) {
        const tbody = document.getElementById('cglTableBody');
        if (!tbody) return;
        let policiesToRender = filteredList || this.policies.filter(p => {
            const pType = p.policyType || 'cgl';
            if (this.hiddenTypes.includes(pType)) return false;
            if (!this.showHidden && this.isHidden(p.policyNumber)) return false;
            return true;
        });

        // In print mode, exclude verified/dismissed
        if (this._printMode) {
            policiesToRender = policiesToRender.filter(p => !this.isHidden(p.policyNumber));
        }

        // Manage thead print checkbox column
        const thead = tbody.closest('table')?.querySelector('thead tr');
        if (thead) {
            const existingPrintTh = thead.querySelector('.cgl-print-th');
            if (this._printMode && !existingPrintTh) {
                const th = document.createElement('th');
                th.className = 'cgl-print-th';
                th.innerHTML = '<input type="checkbox" class="cgl-print-checkbox" id="cglPrintSelectAllCb" title="Select all">';
                thead.prepend(th);
                th.querySelector('#cglPrintSelectAllCb').addEventListener('change', (e) => {
                    ComplianceDashboard.togglePrintSelectAll(e.target.checked);
                });
            } else if (!this._printMode && existingPrintTh) {
                existingPrintTh.remove();
            }
        }

        const colSpan = this._printMode ? 9 : 8;

        // If no pre-sorted list provided, apply sort
        if (!filteredList) {
            policiesToRender = this.sortPolicies(policiesToRender);
        }

        const hiddenCount = this.getHiddenCount();
        const hiddenEl = document.getElementById('cglHiddenCount');
        if (hiddenEl) hiddenEl.textContent = hiddenCount;

        const visibleTotal = this.policies.filter(p => !this.isHidden(p.policyNumber)).length;
        const filteredEl = document.getElementById('cglFilteredCount');
        if (filteredEl) filteredEl.textContent = policiesToRender.length;
        const totalEl = document.getElementById('cglTotalCount');
        if (totalEl) totalEl.textContent = this.showHidden ? this.policies.length : visibleTotal;

        if (policiesToRender.length === 0) {
            let emptyMsg;
            if (this.policies.length === 0) {
                emptyMsg = 'No policy data loaded. Use <strong>CSV Import</strong> or <strong>Open File</strong> above to load data, or run <code>vercel dev</code> for live HawkSoft sync.';
            } else if (hiddenCount > 0 && !this.showHidden) {
                emptyMsg = 'All policies handled! Click "Show Hidden" to review.';
            } else {
                emptyMsg = 'No policies found matching your criteria';
            }
            tbody.innerHTML = `
                <tr>
                    <td colspan="${colSpan}" class="cgl-no-results">
                        ${emptyMsg}
                    </td>
                </tr>
            `;
            return;
        }

        // Pagination: only render first _visibleCount policies
        const totalToRender = policiesToRender.length;
        const paginated = policiesToRender.slice(0, this._visibleCount);
        const remaining = totalToRender - paginated.length;

        tbody.innerHTML = paginated.map(policy => {
            const isVerified = !!this.verifiedPolicies[policy.policyNumber];
            const isDismissed = !!this.dismissedPolicies[policy.policyNumber];
            const isHidden = isVerified || isDismissed;
            const statusLabel = this.getStatusLabel(policy.daysUntilExpiration);
            const expDate = new Date(policy.expirationDate).toLocaleDateString();
            const effDate = new Date(policy.effectiveDate).toLocaleDateString();
            const incDate = policy.inceptionDate ? new Date(policy.inceptionDate).toLocaleDateString() : null;

            const noteData = this.getNoteData(policy.policyNumber);
            const hasNote = noteData && noteData.log && noteData.log.length > 0;
            const latestNote = hasNote ? noteData.log[noteData.log.length - 1].text : '';
            const noteText = this.escapeHtml(latestNote);
            const renewedTo = noteData && noteData.renewedTo ? noteData.renewedTo : null;
            const isStateUpdated = !!(noteData && noteData.stateUpdated);
            const needsStateUpdate = !!(noteData && noteData.needsStateUpdate && !noteData.stateUpdated);

            const rowClass = isHidden ? 'hidden-row' : (needsStateUpdate ? 'cgl-needs-state-row' : (isStateUpdated ? 'cgl-state-updated-row' : ''));
            const pn = policy.policyNumber.replace(/'/g, "\\\\'");

            const verifiedTitle = isVerified
                ? 'Verified on ' + new Date(this.verifiedPolicies[policy.policyNumber].updatedAt).toLocaleDateString()
                : 'Done — state updated, hide policy';

            const isSnoozed = this._isSnoozeActive(policy.policyNumber);
            let actionHtml = '';
            if (isHidden && this.showHidden) {
                if (isSnoozed) {
                    const until = new Date(this.snoozedPolicies[policy.policyNumber].snoozedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    actionHtml = `<span class="cgl-snoozed-badge">🛏️ Until ${until}</span><button class="cgl-restore-btn" onclick="ComplianceDashboard.unsnoozePolicy('${pn}')">Wake</button>`;
                } else {
                    const fn = isDismissed ? 'undismissPolicy' : 'unverifyPolicy';
                    actionHtml = `<button class="cgl-restore-btn" onclick="ComplianceDashboard.${fn}('${pn}')">Restore</button>`;
                }
            } else if (!isHidden) {
                actionHtml = `<button class="cgl-snooze-btn" onclick="ComplianceDashboard.snoozePolicy('${pn}')" title="Hide until tomorrow">🛏️</button><button class="cgl-dismiss-btn" onclick="ComplianceDashboard.dismissPolicy('${pn}')">Dismiss</button>`;
            }

            const isSelected = this._printMode && this._selectedForPrint.has(policy.policyNumber);
            const printRowClass = isSelected ? ' cgl-print-selected' : '';

            return `
                <tr class="${rowClass}${printRowClass}">
                    ${this._printMode ? `<td style="text-align:center;"><input type="checkbox" class="cgl-print-checkbox" data-pn="${this.escapeHtml(policy.policyNumber)}" ${isSelected ? 'checked' : ''} onchange="ComplianceDashboard.togglePrintSelect('${pn}')"></td>` : ''}
                    <td>
                        <label class="cgl-toggle" title="${verifiedTitle}">
                            <input type="checkbox" ${isVerified ? 'checked' : ''} onchange="ComplianceDashboard.togglePolicyVerified('${pn}')">
                            <span class="cgl-toggle-slider"></span>
                        </label>
                    </td>
                    <td>
                        ${needsStateUpdate
                            ? `<span class="cgl-status-badge needs-state-update">⚠️ Renewed</span>`
                            : `<span class="cgl-status-badge ${policy.status}${policy.daysUntilExpiration <= 14 && !isHidden && this.notifyTypes.includes(policy.policyType || 'cgl') ? ' notifying' : ''}">
                            ${statusLabel}
                        </span>`}
                    </td>
                    <td>
                        <span class="cgl-type-badge ${policy.policyType || 'cgl'}">${ComplianceDashboard._typeLabel(policy.policyType || 'cgl')}</span>
                    </td>
                    <td>
                        <div style="font-weight: 600;">${this.clientLink(policy)}</div>
                        ${policy.email ? `<div style="font-size: 12px; color: var(--text-secondary);">${this.escapeHtml(policy.email)}</div>` : ''}
                        ${isStateUpdated ? `<span class="cgl-state-badge" id="state-badge-${pn}">✅ State Updated</span>` : `<span class="cgl-state-badge" id="state-badge-${pn}" style="display:none"></span>`}
                        ${hasNote && !isStateUpdated ? `<div class="cgl-note-preview" id="note-preview-${pn}">${renewedTo ? 'Renewed → ' + this.escapeHtml(renewedTo) : noteText}</div>` : `<div class="cgl-note-preview" id="note-preview-${pn}" style="display:none"></div>`}
                    </td>
                    <td style="font-family: monospace; font-size: 13px;">
                        <div>${this.escapeHtml(policy.policyNumber)}</div>
                        ${renewedTo
                            ? `<span class="cgl-renewed-badge" id="renewed-badge-${pn}" style="display:inline-flex;align-items:center;gap:4px;margin-top:2px;">
                                <span onclick="ComplianceDashboard.searchForPolicy('${this.escapeHtml(renewedTo)}')" style="cursor:pointer;" title="Click to find renewed policy">→ ${this.escapeHtml(renewedTo)}</span>
                                <span onclick="ComplianceDashboard.clearRenewed('${pn}')" style="cursor:pointer;opacity:0.6;font-size:10px;" title="Clear renewal link">✕</span>
                               </span>`
                            : `<span class="cgl-renewed-badge" id="renewed-badge-${pn}" style="display:none"></span>`}
                    </td>
                    <td>
                        <div>${this.escapeHtml(policy.carrier)}</div>
                        ${policy.requiresManualVerification ? '<span class="cgl-manual-badge">Manual Verification</span>' : ''}
                    </td>
                    <td>
                        <div style="font-weight: 600;">Exp: ${expDate}</div>
                        ${incDate ? `<div style="font-size: 12px; color: var(--text-secondary);">Inception: ${incDate}</div>` : ''}
                        <div style="font-size: 12px; color: var(--text-secondary);">Effective: ${effDate}</div>
                        ${policy._renewedFrom ? `<div class="cgl-auto-renewed-badge" title="Renewed from exp ${new Date(policy._renewedFrom).toLocaleDateString()}">🔄 Renewed</div>` : ''}
                        ${policy._renewalDetected ? `<div class="cgl-auto-renewed-badge" title="Supersedes expired policy ${policy._supersedes || ''}">🔄 Renewal confirmed</div>` : ''}
                    </td>
                    <td>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <button class="cgl-note-btn ${hasNote ? 'has-note' : ''}" data-note-for="${pn}" onclick="ComplianceDashboard.toggleNote('${pn}')" title="${hasNote ? 'Note: ' + noteText : 'Add note'}">📝</button>
                            ${actionHtml}
                        </div>
                    </td>
                </tr>
                <tr class="cgl-note-row" id="note-row-${pn}" style="display:none;">
                    <td colspan="${colSpan}">
                        <div class="cgl-quick-notes">
                            <button class="cgl-quick-note-btn" onclick="ComplianceDashboard.addQuickNote('${pn}','Notified insured')">📞 Notified Insured</button>
                            <button class="cgl-quick-note-btn" onclick="ComplianceDashboard.addQuickNote('${pn}','Emailed insured')">📧 Emailed Insured</button>
                            <button class="cgl-quick-note-btn" onclick="ComplianceDashboard.addQuickNote('${pn}','Left voicemail')">📱 Left Voicemail</button>
                            <button class="cgl-quick-note-btn" onclick="ComplianceDashboard.addQuickNote('${pn}','Renewal term confirmed')">✅ Renewal Confirmed</button>
                            <button class="cgl-quick-note-btn renew" onclick="ComplianceDashboard.markRenewed('${pn}')">🔄 Renewed (New Policy #)</button>
                            <button class="cgl-quick-note-btn" onclick="ComplianceDashboard.markStateUpdated('${pn}')" style="background:#ecfdf5;border-color:#a7f3d0;color:#047857;">🏛️ State Updated</button>
                            <button class="cgl-quick-note-btn cgl-snooze-quick" onclick="ComplianceDashboard.snoozePolicy('${pn}')">🛏️ Sleep Until Tomorrow</button>
                        </div>
                        <textarea class="cgl-note-input" rows="1" placeholder="Add a note…" onblur="ComplianceDashboard.saveNote('${pn}')" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.blur();}"></textarea>
                        <div class="cgl-note-log">${this.renderNoteLog(pn)}</div>
                    </td>
                </tr>
            `;
        }).join('');

        // Show More button if there are remaining policies
        if (remaining > 0) {
            const nextBatch = Math.min(remaining, this._pageSize);
            tbody.innerHTML += `
                <tr class="cgl-show-more-row">
                    <td colspan="${colSpan}" style="text-align: center; padding: 16px;">
                        <button onclick="ComplianceDashboard.showMore()" class="cgl-show-more-btn">
                            Show ${nextBatch} More (${remaining} remaining)
                        </button>
                    </td>
                </tr>
            `;
        }
    },

    showMore() {
        this._visibleCount += this._pageSize;
        this.filterPolicies();
    },

    showAll() {
        this._visibleCount = Infinity;
        this.filterPolicies();
    },

    // --- Stats ---

    updateStats() {
        const visiblePolicies = this.policies.filter(p => !this.isHidden(p.policyNumber) && !this.hiddenTypes.includes(p.policyType || 'cgl'));
        const _el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        _el('statTotal', visiblePolicies.length);
        _el('statCritical', visiblePolicies.filter(p => p.daysUntilExpiration >= 0 && p.daysUntilExpiration <= 5 && this.notifyTypes.includes(p.policyType || 'cgl')).length);
        _el('statExpiring', visiblePolicies.filter(p => p.status === 'expiring-soon' || (p.status === 'critical' && p.daysUntilExpiration > 5)).length);
        _el('statExpired', visiblePolicies.filter(p => (p.status === 'expired' || p.daysUntilExpiration < 0) && this.notifyTypes.includes(p.policyType || 'cgl')).length);
        _el('statManual', visiblePolicies.filter(p => p.requiresManualVerification).length);
        _el('statUpdated', Object.keys(this.verifiedPolicies).length);

        _el('cglHiddenCount', this.getHiddenCount());

        // Show the counter row once we have data (hidden during initial loading)
        const counterRow = document.getElementById('cglCounterRow');
        if (counterRow) counterRow.style.display = '';

        // Show annotation summary
        const annSummary = document.getElementById('cglAnnotationSummary');
        if (annSummary) {
            const nV = Object.keys(this.verifiedPolicies).length;
            const nD = Object.keys(this.dismissedPolicies).length;
            const nN = Object.keys(this.policyNotes).length;
            if (nV || nD || nN) {
                const parts = [];
                if (nV) parts.push(nV + ' updated');
                if (nD) parts.push(nD + ' dismissed');
                if (nN) parts.push(nN + ' notes');
                annSummary.textContent = parts.join(', ');
            } else {
                annSummary.textContent = '';
            }
        }
    },

    // --- Helpers ---

    getStatusLabel(daysUntilExpiration) {
        if (daysUntilExpiration < 0) return `Expired ${Math.abs(daysUntilExpiration)} days ago`;
        if (daysUntilExpiration === 0) return 'Expires today';
        if (daysUntilExpiration === 1) return 'Expires tomorrow';
        return `${daysUntilExpiration} days`;
    },

    // Build a clickable HawkSoft link for a client name
    // Desktop: hs:// protocol → HawkSoft desktop app
    // Mobile:  Agent Portal web URL
    clientLink(policy) {
        const name = this.escapeHtml(policy.clientName);
        const hsId = policy.hawksoftId || policy.clientNumber;
        if (!hsId) return `<span style="font-weight:600;">${name}</span>`;

        const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
        const href = isMobile
            ? `https://agents.hawksoft.app/client/${encodeURIComponent(hsId)}`
            : `hs://${encodeURIComponent(hsId)}`;
        const title = isMobile ? 'Open in HawkSoft Agent Portal' : 'Open in HawkSoft';
        return `<a href="${href}" class="cgl-client-link" title="${title}" target="_blank" rel="noopener">${name}</a>`;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    _typeLabel(type) {
        const labels = {
            cgl: 'CGL', bond: 'Bond', auto: 'Auto', wc: 'WC',
            pkg: 'Pkg', umbrella: 'Umbrella', im: 'Inland Marine',
            property: 'Property', epli: 'EPLI', do: 'D&O',
            eo: 'E&O', cyber: 'Cyber', crime: 'Crime',
            liquor: 'Liquor', garage: 'Garage', pollution: 'Pollution',
            bop: 'BOP', commercial: 'Comm'
        };
        return labels[type] || type.toUpperCase();
    },

    // --- Print Mode ---

    togglePrintMode() {
        this._printMode = !this._printMode;
        this._selectedForPrint.clear();
        const toolbar = document.getElementById('cglPrintToolbar');
        const btn = document.getElementById('cglPrintBtn');
        if (toolbar) toolbar.style.display = this._printMode ? 'flex' : 'none';
        if (btn) btn.textContent = this._printMode ? '✕ Cancel Print' : '🖨 Print';
        this.updatePrintCount();
        this.filterPolicies();
    },

    togglePrintSelect(policyNumber) {
        if (this._selectedForPrint.has(policyNumber)) {
            this._selectedForPrint.delete(policyNumber);
        } else {
            this._selectedForPrint.add(policyNumber);
        }
        // Update row highlight without full re-render
        const cb = document.querySelector(`.cgl-print-checkbox[data-pn="${CSS.escape(policyNumber)}"]`);
        if (cb) {
            const row = cb.closest('tr');
            if (row) row.classList.toggle('cgl-print-selected', this._selectedForPrint.has(policyNumber));
        }
        this.updatePrintCount();
    },

    togglePrintSelectAll(selectAll) {
        // Get currently visible (unresolved) policies
        const checkboxes = document.querySelectorAll('#cglTableBody .cgl-print-checkbox');
        if (typeof selectAll === 'undefined') {
            selectAll = this._selectedForPrint.size === 0;
        }
        checkboxes.forEach(cb => {
            const pn = cb.dataset.pn;
            if (!pn) return;
            if (selectAll) {
                this._selectedForPrint.add(pn);
            } else {
                this._selectedForPrint.delete(pn);
            }
            cb.checked = selectAll;
            const row = cb.closest('tr');
            if (row) row.classList.toggle('cgl-print-selected', selectAll);
        });
        // Sync the thead select-all checkbox
        const allCb = document.getElementById('cglPrintSelectAllCb');
        if (allCb) allCb.checked = selectAll;
        this.updatePrintCount();
    },

    updatePrintCount() {
        const countEl = document.getElementById('cglPrintCount');
        const genBtn = document.getElementById('cglPrintGenerateBtn');
        const n = this._selectedForPrint.size;
        if (countEl) countEl.textContent = n + ' selected';
        if (genBtn) genBtn.disabled = n === 0;
    },

    async generatePrintPDF() {
        const selected = this._selectedForPrint;
        if (selected.size === 0) return;

        // Gather policies in current sort order
        let printPolicies = this.policies.filter(p => selected.has(p.policyNumber));
        printPolicies = this.sortPolicies(printPolicies);

        // Lazy-load jsPDF
        if (typeof window.jspdf === 'undefined') {
            try {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            } catch {
                if (typeof App !== 'undefined' && App.toast) App.toast('Failed to load PDF library', 'error');
                return;
            }
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 12;
        const contentW = pageW - margin * 2;
        let y = margin;

        // --- Header ---
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Commercial Policy Report', margin, y + 5);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(dateStr, pageW - margin, y + 5, { align: 'right' });
        y += 10;

        // Counts summary
        const expired = printPolicies.filter(p => p.daysUntilExpiration < 0).length;
        const critical = printPolicies.filter(p => p.daysUntilExpiration >= 0 && p.daysUntilExpiration <= 5).length;
        const expiringSoon = printPolicies.filter(p => p.daysUntilExpiration > 5 && p.daysUntilExpiration <= 59).length;
        const active = printPolicies.filter(p => p.daysUntilExpiration >= 60).length;
        doc.setFontSize(9);
        doc.text(`${printPolicies.length} policies | ${expired} expired | ${critical} critical | ${expiringSoon} expiring soon | ${active} active`, margin, y + 3);
        y += 8;

        // Separator line
        doc.setDrawColor(200);
        doc.line(margin, y, pageW - margin, y);
        y += 4;

        // --- Column setup ---
        const cols = [
            { header: 'Status', width: 24 },
            { header: 'Type', width: 18 },
            { header: 'Client Name', width: 55 },
            { header: 'Policy #', width: 35 },
            { header: 'Expiration', width: 22 },
            { header: 'Carrier', width: 35 },
            { header: 'Notes', width: contentW - 24 - 18 - 55 - 35 - 22 - 35 }
        ];

        // Table header
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y, contentW, 7, 'F');
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(60);
        let cx = margin + 2;
        for (const col of cols) {
            doc.text(col.header, cx, y + 5);
            cx += col.width;
        }
        doc.setTextColor(0);
        y += 9;

        doc.setFont(undefined, 'normal');
        doc.setFontSize(7.5);

        const checkPage = (needed) => {
            if (y + needed > pageH - 12) {
                doc.addPage();
                y = margin;
                return true;
            }
            return false;
        };

        // --- Render each policy ---
        for (const policy of printPolicies) {
            const statusText = this.getStatusLabel(policy.daysUntilExpiration);
            const typeText = ComplianceDashboard._typeLabel(policy.policyType || 'cgl');
            const clientName = policy.clientName || policy.businessName || '';
            const policyNum = policy.policyNumber || '';
            const expDate = new Date(policy.expirationDate).toLocaleDateString();
            const carrier = policy.carrier || '';
            const noteData = this.getNoteData(policy.policyNumber);

            // Build notes text
            let notesLines = [];
            if (noteData && noteData.log && noteData.log.length > 0) {
                for (const entry of noteData.log) {
                    const d = new Date(entry.at);
                    const ts = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    notesLines.push(ts + ': ' + (entry.text || ''));
                }
            }
            if (noteData && noteData.renewedTo) {
                notesLines.unshift('Renewed → ' + noteData.renewedTo);
            }

            const notesColW = cols[6].width - 2;
            const wrappedNotes = notesLines.length > 0
                ? doc.splitTextToSize(notesLines.join(' | '), notesColW)
                : [];
            const rowH = Math.max(6, wrappedNotes.length * 3.5 + 2);

            checkPage(rowH + 2);

            // Alternate row shading
            const rowIdx = printPolicies.indexOf(policy);
            if (rowIdx % 2 === 0) {
                doc.setFillColor(252, 252, 252);
                doc.rect(margin, y - 1, contentW, rowH + 1, 'F');
            }

            // Status color
            if (policy.daysUntilExpiration < 0) {
                doc.setTextColor(200, 30, 20);
            } else if (policy.daysUntilExpiration <= 5) {
                doc.setTextColor(180, 80, 0);
            } else if (policy.daysUntilExpiration <= 59) {
                doc.setTextColor(160, 120, 0);
            } else {
                doc.setTextColor(30, 140, 50);
            }

            cx = margin + 2;
            doc.text(doc.splitTextToSize(statusText, cols[0].width - 2)[0] || '', cx, y + 3);

            doc.setTextColor(0);
            cx += cols[0].width;
            doc.text(typeText, cx, y + 3);
            cx += cols[1].width;
            doc.text(doc.splitTextToSize(clientName, cols[2].width - 2)[0] || '', cx, y + 3);
            cx += cols[2].width;
            doc.setFontSize(7);
            doc.text(doc.splitTextToSize(policyNum, cols[3].width - 2)[0] || '', cx, y + 3);
            doc.setFontSize(7.5);
            cx += cols[3].width;
            doc.text(expDate, cx, y + 3);
            cx += cols[4].width;
            doc.text(doc.splitTextToSize(carrier, cols[5].width - 2)[0] || '', cx, y + 3);
            cx += cols[5].width;

            // Notes
            if (wrappedNotes.length > 0) {
                doc.setFontSize(6.5);
                doc.setTextColor(80);
                doc.text(wrappedNotes, cx, y + 3);
                doc.setFontSize(7.5);
                doc.setTextColor(0);
            }

            // Bottom border
            doc.setDrawColor(230);
            doc.line(margin, y + rowH, pageW - margin, y + rowH);
            y += rowH + 1;
        }

        // --- Page numbers ---
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
            doc.text('Altech Field Lead — Commercial Policy Dashboard', margin, pageH - 6);
        }

        // Download
        const filename = `CGL_Report_${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}.pdf`;
        doc.save(filename);

        if (typeof App !== 'undefined' && App.toast) {
            App.toast(`PDF exported: ${printPolicies.length} policies`, 'success');
        }
    }
};

// Register on window so navigateTo() can find it via window['ComplianceDashboard']
window.ComplianceDashboard = ComplianceDashboard;
