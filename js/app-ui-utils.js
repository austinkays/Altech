// js/app-ui-utils.js — UI utility methods (dark mode, toast, date formatting, clipboard)
// Extracted from app-core.js — Session 4 refactor
'use strict';

Object.assign(App, {

    updateDarkModeIcons(isDark) {
        const moonSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        const sunSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        document.querySelectorAll('.dark-mode-icon').forEach(icon => {
            icon.innerHTML = isDark ? sunSVG : moonSVG;
        });
    },

    loadDarkMode() {
        const darkMode = localStorage.getItem(STORAGE_KEYS.DARK_MODE);
        // Default to dark mode when no preference is stored
        const isDark = darkMode === null ? true : darkMode === 'true';
        if (isDark) {
            document.body.classList.add('dark-mode');
        }
        this.updateDarkModeIcons(isDark);
        // Sync theme-color meta with dark mode state
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = isDark ? '#000000' : '#007AFF';
    },

    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem(STORAGE_KEYS.DARK_MODE, isDark);
        this.updateDarkModeIcons(isDark);
        // Sync theme-color meta with dark mode state
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = isDark ? '#000000' : '#007AFF';
        // Aurora is dark-only — deactivate if switching to light
        if (!isDark && document.body.classList.contains('theme-aurora')) {
            this.setTheme('default');
        }
        // Light is light-only — deactivate if switching to dark
        if (isDark && document.body.classList.contains('theme-light')) {
            this.setTheme('default');
        }
        // Sync dark mode preference to cloud
        if (window.Sync && window.Sync.schedulePush) {
            window.Sync.schedulePush();
        }
    },

    // ── Theme system ──
    // Valid themes: 'default', 'aurora' (dark-only), 'light' (light-only)
    _VALID_THEMES: ['default', 'aurora', 'light'],

    setTheme(themeId) {
        if (!this._VALID_THEMES.includes(themeId)) themeId = 'default';

        // Remove all theme-* classes from body
        document.body.classList.forEach(cls => {
            if (cls.startsWith('theme-')) document.body.classList.remove(cls);
        });

        if (themeId === 'aurora') {
            // Aurora is a dark theme — ensure dark mode is on
            if (!document.body.classList.contains('dark-mode')) {
                document.body.classList.add('dark-mode');
                localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'true');
                this.updateDarkModeIcons(true);
            }
            document.body.classList.add('theme-aurora');
        } else if (themeId === 'light') {
            // Light is a light theme — ensure dark mode is off (inverse of Aurora)
            if (document.body.classList.contains('dark-mode')) {
                document.body.classList.remove('dark-mode');
                localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'false');
                this.updateDarkModeIcons(false);
            }
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.content = '#007AFF';
            document.body.classList.add('theme-light');
        }

        localStorage.setItem(STORAGE_KEYS.THEME, themeId);

        // Update theme selector UI if present
        const sel = document.getElementById('themeSelect');
        if (sel) sel.value = themeId;

        if (window.Sync && window.Sync.schedulePush) {
            window.Sync.schedulePush();
        }
    },

    loadTheme() {
        const themeId = localStorage.getItem(STORAGE_KEYS.THEME) || 'default';
        if (themeId !== 'default') {
            this.setTheme(themeId);
        }
    },

    formatDateDisplay(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        // Use UTC getters: ISO date strings ("YYYY-MM-DD") parse as midnight UTC.
        // Local getters shift the date back 5-8 hours in US timezones → off-by-one calendar day.
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const yyyy = String(d.getUTCFullYear());
        return `${mm}-${dd}-${yyyy}`;
    },

    // ── Utilities ──
    // toast() — single-toast UI with a small queue. New messages wait their
    // turn so important alerts (especially errors) aren't clobbered when
    // multiple things happen in quick succession (e.g., autosave + AI fail).
    //
    // Signature: toast(msg, duration|opts, useHtml)
    //   duration: number ms, OR { type, duration, dedupe }
    //     type: 'error' | 'success' | 'info' | 'warning'
    //     dedupe: false to allow duplicates (default true — same message
    //             enqueued twice in a row collapses to one entry)
    //
    // Errors are guaranteed at least 3500ms; non-errors default to 2500ms.
    toast(msg, duration, useHtml) {
        const t = document.getElementById('toast');
        if (!t) return;

        // Parse args
        let ms = 2500;
        let type = null;
        let dedupe = true;
        if (typeof duration === 'object' && duration !== null) {
            type = duration.type || null;
            ms = duration.duration || (type === 'error' ? 3500 : 2500);
            if (duration.dedupe === false) dedupe = false;
        } else if (typeof duration === 'number') {
            ms = duration;
        }

        // Lazy-init the queue. Stored on the toast element so multiple App
        // instances (tests) don't fight over a module-level queue.
        if (!t._toastQueue) {
            t._toastQueue = [];
            t._toastShowing = false;
        }

        // Skip duplicate consecutive entries — protects against renders that
        // fire 10× the same "saved" toast in 200ms.
        if (dedupe) {
            const last = t._toastQueue[t._toastQueue.length - 1];
            if (last && last.msg === msg && last.type === type) return;
            // Also dedupe against the currently-displayed toast.
            if (t._toastShowing && t._currentMsg === msg && t._currentType === type) return;
        }

        t._toastQueue.push({ msg, ms, type, useHtml });
        if (!t._toastShowing) this._toastDrain();
    },

    _toastDrain() {
        const t = document.getElementById('toast');
        if (!t || !t._toastQueue) return;
        if (t._toastQueue.length === 0) {
            t._toastShowing = false;
            t._currentMsg = null;
            t._currentType = null;
            return;
        }
        t._toastShowing = true;
        const { msg, ms, type, useHtml } = t._toastQueue.shift();
        t._currentMsg = msg;
        t._currentType = type;

        t.classList.remove('toast-error', 'toast-success', 'toast-info', 'toast-warning');
        if (type) t.classList.add(`toast-${type}`);
        if (useHtml) {
            t.innerHTML = msg;
        } else {
            t.innerText = msg;
        }
        t.classList.add('show');

        // Show duration + 200ms hide animation gap before next.
        setTimeout(() => {
            t.classList.remove('show', 'toast-error', 'toast-success', 'toast-info', 'toast-warning');
            setTimeout(() => this._toastDrain(), 200);
        }, ms);
    },

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => this.toast('📋 Copied to Clipboard!'));
    },

});
