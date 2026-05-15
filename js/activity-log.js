// js/activity-log.js — In-memory ring buffer + slide-out viewer for save/sync/export events.
//
// Goal: when something feels broken ("did my save go through?", "was that
// quote actually exported?"), the user has a single place to look without
// opening DevTools or hunting through localStorage.
//
// Entries are stored in localStorage (key: STORAGE_KEYS.ACTIVITY_LOG, capped
// at 100) so they survive a page reload but don't bloat sync (this key is
// LOCAL-ONLY, never pushed to Firebase or Supabase).
//
// Public API:
//   ActivityLog.add({ type, area, message, ok, detail })
//   ActivityLog.list()                    → array, newest first
//   ActivityLog.subscribe(fn)             → returns unsubscribe()
//   ActivityLog.lastStatus()              → { ok, ts, message } | null
//   ActivityLog.clear()
//   ActivityLog.openPanel() / closePanel()

(function () {
    'use strict';

    const KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.ACTIVITY_LOG) || 'altech_activity_log';
    const MAX_ENTRIES = 100;
    // Bursty callers (e.g. ComplianceDashboard.saveState fires from ~20 sites
    // on a bulk verify/dismiss) would otherwise flood the 100-slot buffer with
    // identical rows and evict every meaningful event. Consecutive identical
    // entries within this window collapse into one row with a running count,
    // mirroring the App.toast dedupe.
    const COALESCE_WINDOW_MS = 5 * 60_000;

    let _entries = _loadFromStorage();
    const _subscribers = new Set();

    function _loadFromStorage() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
        } catch {
            return [];
        }
    }

    function _persist() {
        try {
            localStorage.setItem(KEY, JSON.stringify(_entries.slice(0, MAX_ENTRIES)));
        } catch (e) {
            // Quota exhausted — drop the oldest 30 entries and try again.
            // If still failing, give up silently (the in-memory copy is fine).
            _entries = _entries.slice(0, MAX_ENTRIES - 30);
            try { localStorage.setItem(KEY, JSON.stringify(_entries)); } catch { /* ignore */ }
        }
    }

    /**
     * Append an entry to the activity log.
     * @param {Object} opts
     * @param {'save'|'sync'|'export'|'import'|'ai'|'error'} opts.type
     * @param {string} [opts.area]      e.g. 'cgl', 'reminders', 'intake', 'pdf'
     * @param {string} opts.message     Short human-readable summary
     * @param {boolean} [opts.ok=true]  Did it succeed?
     * @param {string} [opts.detail]    Extra info — error text, file name, etc.
     *
     * Consecutive identical events (same type+area+message+ok) within
     * COALESCE_WINDOW_MS collapse into the existing head entry: its `count`
     * increments and its timestamp moves forward, instead of pushing a
     * duplicate row.
     */
    function add(opts) {
        if (!opts || !opts.message) return;
        const now = Date.now();
        const type = opts.type || 'save';
        const area = opts.area || '';
        const message = String(opts.message).slice(0, 200);
        const ok = opts.ok === false ? false : true;
        const detail = opts.detail ? String(opts.detail).slice(0, 500) : '';

        const head = _entries[0];
        if (head
            && head.type === type
            && head.area === area
            && head.message === message
            && head.ok === ok
            && (now - head.ts) < COALESCE_WINDOW_MS) {
            head.count = (head.count || 1) + 1;
            head.ts = now;
            if (detail) head.detail = detail;
            _persist();
            _subscribers.forEach(fn => { try { fn(head); } catch (e) { /* swallow */ } });
            return;
        }

        const entry = { ts: now, type, area, message, ok, detail, count: 1 };
        _entries.unshift(entry);
        if (_entries.length > MAX_ENTRIES) _entries.length = MAX_ENTRIES;
        _persist();
        _subscribers.forEach(fn => { try { fn(entry); } catch (e) { /* swallow */ } });
    }

    function list() { return _entries.slice(); }

    function lastStatus() {
        if (_entries.length === 0) return null;
        const e = _entries[0];
        return { ok: e.ok, ts: e.ts, message: e.message, type: e.type };
    }

    function subscribe(fn) {
        _subscribers.add(fn);
        return () => _subscribers.delete(fn);
    }

    function clear() {
        _entries = [];
        _persist();
        _subscribers.forEach(fn => { try { fn(null); } catch (e) { /* swallow */ } });
    }

    // ── Slide-out viewer panel ────────────────────────────────────────────

    function _esc(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    function _formatTime(ts) {
        const d = new Date(ts);
        const now = Date.now();
        const diff = now - ts;
        if (diff < 60_000) return 'just now';
        if (diff < 3600_000) return Math.round(diff / 60_000) + 'm ago';
        if (diff < 86_400_000) return Math.round(diff / 3600_000) + 'h ago';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
               ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    function _typeIcon(type, ok) {
        if (!ok) return '⚠️';
        return ({
            save: '💾', sync: '☁️', export: '📤', import: '📥', ai: '🤖', error: '❌',
        })[type] || '•';
    }

    function _ensurePanel() {
        let panel = document.getElementById('altechActivityPanel');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'altechActivityPanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Activity log');
        panel.style.cssText = `
            position: fixed; top: 0; right: -420px; bottom: 0; width: 400px;
            background: var(--bg-card, #fff); border-left: 1px solid var(--border, #ddd);
            box-shadow: -4px 0 24px rgba(0,0,0,0.12); z-index: 9999;
            transition: right 0.25s ease; display: flex; flex-direction: column;
            font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: var(--text, #1c1c1e);
        `;
        panel.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border, #ddd);">
                <strong style="font-size:14px;">Activity</strong>
                <div style="display:flex; gap:8px;">
                    <button id="altechActivityClear" style="background:transparent; border:1px solid var(--border, #ddd); color:var(--text-secondary, #666); padding:4px 10px; border-radius:6px; cursor:pointer; font-size:12px;">Clear</button>
                    <button id="altechActivityClose" aria-label="Close activity log" style="background:transparent; border:none; color:var(--text-secondary, #666); cursor:pointer; font-size:18px; padding:0 4px;">×</button>
                </div>
            </div>
            <div id="altechActivityList" style="flex:1; overflow-y:auto; padding:8px 0;"></div>
            <div style="padding:8px 16px; border-top:1px solid var(--border, #ddd); color:var(--text-secondary, #666); font-size:11px;">
                Stored locally on this device · capped at ${MAX_ENTRIES} entries
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('#altechActivityClose').addEventListener('click', closePanel);
        panel.querySelector('#altechActivityClear').addEventListener('click', () => {
            if (window.confirm('Clear the activity log on this device?')) clear();
            _renderPanel();
        });

        // ESC closes
        panel._escListener = (e) => { if (e.key === 'Escape' && panel.style.right === '0px') closePanel(); };
        document.addEventListener('keydown', panel._escListener);

        return panel;
    }

    function _renderPanel() {
        const panel = document.getElementById('altechActivityPanel');
        if (!panel) return;
        const list = panel.querySelector('#altechActivityList');
        if (!list) return;
        if (_entries.length === 0) {
            list.innerHTML = `<div style="padding:24px 16px; color:var(--text-secondary, #666); text-align:center;">No activity yet. Saves, syncs, exports, and AI calls will appear here.</div>`;
            return;
        }
        list.innerHTML = _entries.map(e => {
            const icon = _typeIcon(e.type, e.ok);
            const time = _esc(_formatTime(e.ts));
            const count = (e.count > 1)
                ? ` <span style="opacity:0.6; font-variant-numeric:tabular-nums;">×${Number(e.count)}</span>`
                : '';
            const area = e.area ? `<span style="opacity:0.6;">·  ${_esc(e.area)}</span>` : '';
            const detail = e.detail ? `<div style="opacity:0.7; font-size:12px; margin-top:2px;">${_esc(e.detail)}</div>` : '';
            const tone = e.ok ? '' : 'background: rgba(255,59,48,0.06);';
            return `
                <div style="padding:10px 16px; border-bottom:1px solid var(--border, #eee); ${tone}">
                    <div style="display:flex; align-items:baseline; justify-content:space-between; gap:8px;">
                        <div style="flex:1;"><span style="margin-right:6px;">${icon}</span>${_esc(e.message)}${count} ${area}</div>
                        <span style="opacity:0.6; font-size:11px; white-space:nowrap;">${time}</span>
                    </div>
                    ${detail}
                </div>
            `;
        }).join('');
    }

    function openPanel() {
        const panel = _ensurePanel();
        _renderPanel();
        // Trigger a reflow so the transition fires.
        panel.offsetHeight;  // eslint-disable-line no-unused-expressions
        panel.style.right = '0px';
    }

    function closePanel() {
        const panel = document.getElementById('altechActivityPanel');
        if (panel) panel.style.right = '-420px';
    }

    // Subscribe to keep the panel live while open.
    subscribe(() => {
        const panel = document.getElementById('altechActivityPanel');
        if (panel && panel.style.right === '0px') _renderPanel();
    });

    // Public surface
    window.ActivityLog = { add, list, lastStatus, subscribe, clear, openPanel, closePanel };
})();
