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
        const darkMode = localStorage.getItem('altech_dark_mode');
        // Default to dark mode when no preference is stored
        const isDark = darkMode === null ? true : darkMode === 'true';
        if (isDark) {
            document.body.classList.add('dark-mode');
        }
        this.updateDarkModeIcons(isDark);
    },

    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('altech_dark_mode', isDark);
        this.updateDarkModeIcons(isDark);
        // Sync dark mode preference to cloud
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
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
    toast(msg, duration, useHtml) {
        const t = document.getElementById('toast');
        if (!t) return;
        // Support 2nd arg as options object: toast('msg', { type: 'error', duration: 4000 })
        let ms = 2500;
        let type = null;
        if (typeof duration === 'object' && duration !== null) {
            ms = duration.duration || 2500;
            type = duration.type || null;
        } else if (typeof duration === 'number') {
            ms = duration;
        }
        t.classList.remove('toast-error', 'toast-success');
        if (type) t.classList.add(`toast-${type}`);
        if (useHtml) {
            t.innerHTML = msg;
        } else {
            t.innerText = msg;
        }
        t.classList.add('show');
        setTimeout(() => { t.classList.remove('show', 'toast-error', 'toast-success'); }, ms);
    },

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => this.toast('📋 Copied to Clipboard!'));
    },

});
