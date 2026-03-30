// DataBackup + globals - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

// ── Data Backup & Restore ────────────────────────────
const DataBackup = {
    BACKUP_KEYS: [
        STORAGE_KEYS.FORM, STORAGE_KEYS.QUOTES, STORAGE_KEYS.DOC_INTEL,
        STORAGE_KEYS.DARK_MODE, STORAGE_KEYS.COI_DRAFT, STORAGE_KEYS.EMAIL_DRAFTS,
        STORAGE_KEYS.QUICKREF_CARDS, STORAGE_KEYS.ENCRYPTION_SALT
    ],

    exportAll() {
        const backup = { _meta: { version: 1, exportedAt: new Date().toISOString(), app: 'Altech' }, data: {} };
        this.BACKUP_KEYS.forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) backup.data[key] = val;
        });
        // Also grab any CGL / QNA / export-history keys
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('altech_') || k.startsWith('cgl_'))) {
                if (!backup.data[k]) backup.data[k] = localStorage.getItem(k);
            }
        }
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `altech-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        App.toast('📦 Backup exported!');
    },

    importPrompt() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const backup = JSON.parse(text);
                if (!backup._meta || !backup.data) {
                    App.toast('⚠️ Invalid backup file');
                    return;
                }
                if (!confirm(`Restore backup from ${backup._meta.exportedAt}?\nThis will overwrite current data.`)) return;
                let count = 0;
                Object.entries(backup.data).forEach(([key, value]) => {
                    try { localStorage.setItem(key, value); count++; } catch (e) {}
                });
                App.toast(`✅ Restored ${count} items. Reloading...`);
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                App.toast('❌ Failed to read backup: ' + err.message);
            }
        };
        input.click();
    }
};

// Global drag-over handler: show "copy" cursor instead of "no-drop" icon
window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('drop', (e) => { e.preventDefault(); });

// Desktop keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

    // Ctrl+O — Open file dialog (Step 0 scan picker)
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        if (App.isDesktop && window.__TAURI__?.core?.invoke) {
            window.__TAURI__.core.invoke('open_file_dialog').then(filePath => {
                if (filePath) {
                    const fileName = filePath.split('\\').pop().split('/').pop();
                    App.toast('⏳ Processing ' + fileName + '...');
                    window.__TAURI__.core.invoke('process_policy_file', { filePath }).then(text => {
                        if (text && !text.startsWith('Error:')) {
                            App.processScanFromText(text, fileName);
                        } else {
                            App.toast('⚠️ Could not extract text');
                        }
                    });
                }
            });
        } else {
            App.openScanPicker();
        }
    }

    // Ctrl+Enter — Send Q&A message (when in Q&A tool)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const qnaInput = document.getElementById('qnaInput');
        if (qnaInput && (document.activeElement === qnaInput || !isInput)) {
            e.preventDefault();
            if (typeof PolicyQA !== 'undefined') PolicyQA.sendMessage();
        }
    }

    // Arrow Left/Right — Step navigation (only when not in an input)
    if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            App.prevStep();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            App.nextStep();
        }
    }

    // Ctrl+S — Prevent browser save, show save toast instead
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        App.toast('✓ Auto-saved');
    }

    // Escape — Close Q&A tool, return to form
    if (e.key === 'Escape') {
        const qnaTool = document.getElementById('qnaTool');
        if (qnaTool && qnaTool.style.display !== 'none') {
            e.preventDefault();
            if (typeof App !== 'undefined') App.showTool('quoting');
        }
    }
});
