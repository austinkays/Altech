// js/cgl-backup.js — Disk-file + JSON/CSV backup-restore I/O for the CGL dashboard.
//
// Third cut of the compliance-dashboard.js monolith decomposition, continuing
// the js/cgl-utils.js (pure helpers) and js/cgl-renderers.js (pure builders)
// extractions and mirroring the hawksoft-export.js → hawksoft-renderers.js
// precedent. compliance-dashboard.js was at its frozen audit-docs size ceiling
// with zero headroom; this is the cohesive "get state in/out of files" slice.
//
// Unlike cgl-utils/cgl-renderers these are NOT pure (File System Access API,
// FileReader, Blob/URL downloads, the linked fileHandle, localStorage). They
// take the dashboard instance `d` and call back into it for the bits that stay
// in the core (d._getStateSnapshot / d._safeLSWrite / d.saveState /
// d.filterPolicies / d.updateStats); intra-slice calls stay direct. The
// dashboard keeps one-line forwarders so all `this.x()` call sites and the two
// plugins/compliance.html onclick/onchange bindings work unchanged.
//
// Loaded BEFORE js/compliance-dashboard.js (after cgl-renderers.js) so the
// plugin IIFE can reference window.CglBackup.

'use strict';

window.CglBackup = (() => {
    'use strict';

    function downloadFullBackup(d) {
        const snapshot = d._getStateSnapshot();
        const backup = {
            _meta: {
                version: '3.0',
                format: 'altech_cgl_backup',
                exportedAt: new Date().toISOString(),
                counts: {
                    verified: Object.keys(d.verifiedPolicies).length,
                    dismissed: Object.keys(d.dismissedPolicies).length,
                    notes: Object.keys(d.policyNotes).length
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
    }

    async function restoreFullBackup(d, fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const backup = JSON.parse(text);
            // Validate format
            if (!backup.verifiedPolicies && !backup.dismissedPolicies && !backup.policyNotes) {
                if (typeof App !== 'undefined' && App.toast) App.toast('Invalid backup file — missing annotation data.', 'error');
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
            d.verifiedPolicies = CglUtil._smartMergeDict(d.verifiedPolicies, backup.verifiedPolicies);
            d.dismissedPolicies = CglUtil._smartMergeDict(d.dismissedPolicies, backup.dismissedPolicies);
            d.policyNotes = CglUtil._smartMergeDict(d.policyNotes, backup.policyNotes);
            d.saveState();
            d.filterPolicies();
            d.updateStats();
            if (typeof App !== 'undefined' && App.toast) App.toast(`Backup restored! Merged ${counts.v} verified, ${counts.d} dismissed, ${counts.n} notes.`, 'success');
        } catch (e) {
            if (typeof App !== 'undefined' && App.toast) App.toast('Failed to parse backup file: ' + e.message, 'error');
        }
        fileInput.value = '';
    }

    function renderFileToolbar(/* d */) {
        // File toolbar removed — auto-save to localStorage + disk handles persistence
    }

    function updateFileStatus(d) {
        const statusEl = document.getElementById('cglFileStatus');
        if (!statusEl) return;

        if (d.fileHandle) {
            const name = d.fileHandle.name || 'file';
            statusEl.innerHTML = `<span class="linked">Linked: ${Utils.escapeHTML(name)}</span>`;
        } else {
            statusEl.innerHTML = `<span class="field-mode">No file linked</span>`;
        }

        // Update reminder button text
        const reminderBtn = document.getElementById('cglReminderAction');
        if (reminderBtn) {
            reminderBtn.textContent = d.fileHandle ? 'Save to disk' : 'Backup now';
        }
    }

    async function openDiskFile(d) {
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
                if (typeof App !== 'undefined' && App.toast) App.toast('Invalid JSON file. Please select a valid CGL state export.', 'error');
                return;
            }

            // Support v2.0 format (meta + state) and flat format
            const stateData = data.state || data;

            // Load dismissed policies - convert arrays to objects if needed
            if (Array.isArray(stateData.dismissedPolicies)) {
                d.dismissedPolicies = {};
                stateData.dismissedPolicies.forEach(pn => {
                    d.dismissedPolicies[pn] = { dismissedAt: data.meta?.lastSaved || new Date().toISOString() };
                });
            } else if (stateData.dismissedPolicies && typeof stateData.dismissedPolicies === 'object') {
                d.dismissedPolicies = stateData.dismissedPolicies;
            }

            // Load verified policies - convert arrays to objects if needed
            if (Array.isArray(stateData.verifiedPolicies)) {
                d.verifiedPolicies = {};
                stateData.verifiedPolicies.forEach(pn => {
                    d.verifiedPolicies[pn] = { updatedAt: data.meta?.lastSaved || new Date().toISOString(), updatedBy: 'file' };
                });
            } else if (stateData.verifiedPolicies && typeof stateData.verifiedPolicies === 'object') {
                d.verifiedPolicies = stateData.verifiedPolicies;
            }

            d.fileHandle = handle;

            // Sync to localStorage as backup
            d._safeLSWrite(STORAGE_KEYS.CGL_STATE, JSON.stringify({
                verifiedPolicies: d.verifiedPolicies,
                dismissedPolicies: d.dismissedPolicies,
                lastSaved: new Date().toISOString()
            }));

            updateFileStatus(d);
            d.filterPolicies();
            d.updateStats();

            console.log('[CGL] Opened file:', handle.name, '| Verified:', Object.keys(d.verifiedPolicies).length, '| Dismissed:', Object.keys(d.dismissedPolicies).length);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[CGL] Error opening file:', err);
                if (typeof App !== 'undefined' && App.toast) App.toast('Failed to open file: ' + err.message, 'error');
            }
        }
    }

    async function saveDiskFile(d) {
        try {
            if (!d.fileHandle) {
                return saveDiskFileAs(d);
            }

            const jsonData = {
                meta: {
                    version: '2.0',
                    lastSaved: new Date().toISOString(),
                    savedBy: 'Altech Desktop App'
                },
                state: {
                    dismissedPolicies: d.dismissedPolicies,
                    verifiedPolicies: d.verifiedPolicies,
                    policyNotes: d.policyNotes
                }
            };

            const writable = await d.fileHandle.createWritable();
            await writable.write(JSON.stringify(jsonData, null, 2));
            await writable.close();

            // Flash "Saved" indicator
            const flash = document.getElementById('cglSaveFlash');
            if (flash) {
                flash.classList.add('visible');
                setTimeout(() => flash.classList.remove('visible'), 1500);
            }

            // Reset session counter
            d.sessionChanges = 0;
            d.reminderDismissed = false;
            const reminder = document.getElementById('cglBackupReminder');
            if (reminder) reminder.style.display = 'none';
            const countEl = document.getElementById('cglSessionCount');
            if (countEl) countEl.textContent = '0';

            console.log('[CGL] Saved to disk:', d.fileHandle.name);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[CGL] Error saving file:', err);
                if (typeof App !== 'undefined' && App.toast) App.toast('Failed to save file: ' + err.message, 'error');
            }
        }
    }

    async function saveDiskFileAs(d) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'Altech_CGL_Master.json',
                startIn: 'documents',
                types: [{
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] }
                }]
            });

            d.fileHandle = handle;
            updateFileStatus(d);
            await saveDiskFile(d);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[CGL] Error saving file as:', err);
                if (typeof App !== 'undefined' && App.toast) App.toast('Failed to save file: ' + err.message, 'error');
            }
        }
    }

    function exportBackup(d) {
        const rows = ['PolicyNumber,Status,Date'];
        for (const [pn, data] of Object.entries(d.verifiedPolicies)) {
            rows.push(`${pn},verified,${data.updatedAt || ''}`);
        }
        for (const [pn, data] of Object.entries(d.dismissedPolicies)) {
            rows.push(`${pn},dismissed,${data.dismissedAt || ''}`);
        }

        if (rows.length === 1) {
            if (typeof App !== 'undefined' && App.toast) App.toast('Nothing to export yet. Verify or dismiss some policies first.', 'error');
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
        d.sessionChanges = 0;
        d.reminderDismissed = false;
        const reminder = document.getElementById('cglBackupReminder');
        if (reminder) reminder.style.display = 'none';
        const countEl = document.getElementById('cglSessionCount');
        if (countEl) countEl.textContent = '0';
    }

    function importBackup(d, fileInput) {
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
                    d.verifiedPolicies[policyNumber] = { updatedAt: date, updatedBy: 'import' };
                    imported++;
                } else if (status === 'dismissed') {
                    d.dismissedPolicies[policyNumber] = { dismissedAt: date };
                    imported++;
                }
            }

            d.saveState();
            d.filterPolicies();
            d.updateStats();
            if (typeof App !== 'undefined' && App.toast) App.toast(`Restored ${imported} policy markers from backup.`, 'success');
        };
        reader.readAsText(file);
        fileInput.value = '';
    }

    return {
        downloadFullBackup,
        restoreFullBackup,
        renderFileToolbar,
        updateFileStatus,
        openDiskFile,
        saveDiskFile,
        saveDiskFileAs,
        exportBackup,
        importBackup,
    };
})();
