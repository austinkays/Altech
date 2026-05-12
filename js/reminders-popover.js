// RemindersPopover — quick-access popover anchored to the header bell button.
//
// Why
//   Tapping the bell to navigate to the full Reminders plugin is overkill
//   when the user just wants to glance at what's due, check off one item,
//   or jot a new one. This module renders a small floating panel right
//   under the bell with the most urgent ~15 items (overdue + due-today
//   + due-soon, sorted by status), a quick-add input, and check/snooze
//   buttons that wire through the existing Reminders module API.
//
// Contract
//   • open() / close() / toggle()  — public surface
//   • Lazy-creates the DOM on first open (no boot-time cost)
//   • Re-renders after every action so the list stays current
//   • Click-outside and Esc close
//   • "View all reminders →" footer link navigates to the full plugin
//     for power use (filters, edit, all-time list)
//
// Anchoring
//   Fixed top-right under the header bell. Doesn't depend on the bell
//   button being at any specific offset — uses getBoundingClientRect
//   on the trigger if available, falls back to a sensible default.

window.RemindersPopover = (() => {
    'use strict';

    const POPOVER_ID = 'remindersPopover';
    const MAX_ITEMS = 15;
    let _docListenersBound = false;

    function _esc(s) { return (window.Utils && window.Utils.escapeHTML) ? Utils.escapeHTML(s) : String(s || ''); }
    function _attr(s) { return (window.Utils && window.Utils.escapeAttr) ? Utils.escapeAttr(s) : String(s || '').replace(/"/g, '&quot;'); }

    function _isOpen() {
        const el = document.getElementById(POPOVER_ID);
        return !!(el && el.classList.contains('rem-popover-open'));
    }

    function _ensureDom() {
        let el = document.getElementById(POPOVER_ID);
        if (el) return el;
        el = document.createElement('div');
        el.id = POPOVER_ID;
        el.className = 'rem-popover';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Reminders');
        document.body.appendChild(el);
        return el;
    }

    function _position(el) {
        // Anchor under the bell button. Falls back to a sensible default if
        // the bell isn't found (e.g., on a route where the header is hidden).
        const bell = document.querySelector('.header-notification-btn');
        if (bell && typeof bell.getBoundingClientRect === 'function') {
            const r = bell.getBoundingClientRect();
            el.style.top = `${Math.round(r.bottom + 8)}px`;
            // Right-align to the bell's right edge so it stays on-screen even
            // on narrow viewports.
            const right = Math.max(8, Math.round(window.innerWidth - r.right));
            el.style.right = `${right}px`;
            el.style.left = 'auto';
        } else {
            el.style.top = '64px';
            el.style.right = '16px';
            el.style.left = 'auto';
        }
    }

    function _statusBadge(task) {
        const map = {
            'overdue':    { label: 'Overdue',  cls: 'rem-pop-badge-overdue' },
            'due-today':  { label: 'Today',    cls: 'rem-pop-badge-today' },
            'due-soon':   { label: 'Soon',     cls: 'rem-pop-badge-soon' },
            'snoozed':    { label: 'Snoozed',  cls: 'rem-pop-badge-snoozed' },
            'upcoming':   { label: '',         cls: '' },
            'no-date':    { label: '',         cls: '' },
        };
        const m = map[task.status] || map['upcoming'];
        if (!m.label) return '';
        return `<span class="rem-pop-badge ${m.cls}">${_esc(m.label)}</span>`;
    }

    function _renderList() {
        if (typeof Reminders === 'undefined' || typeof Reminders.getUpcomingTasks !== 'function') {
            return `<div class="rem-pop-empty">Reminders unavailable</div>`;
        }
        const tasks = Reminders.getUpcomingTasks(MAX_ITEMS);
        if (!tasks.length) {
            return `<div class="rem-pop-empty">No reminders due. Nice work.</div>`;
        }
        return tasks.map(t => {
            const id = _attr(t.id);
            const title = _esc(t.title || '(untitled)');
            const badge = _statusBadge(t);
            const sub = t.statusLabel ? `<div class="rem-pop-sub">${_esc(t.statusLabel)}</div>` : '';
            return `
                <div class="rem-pop-row" data-task-id="${id}">
                    <button type="button" class="rem-pop-check"
                            aria-label="Mark complete"
                            onclick="RemindersPopover._complete('${id}')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>
                    </button>
                    <div class="rem-pop-body">
                        <div class="rem-pop-title-row">
                            <span class="rem-pop-title">${title}</span>
                            ${badge}
                        </div>
                        ${sub}
                    </div>
                    <div class="rem-pop-actions">
                        <button type="button" class="rem-pop-action"
                                title="Push to tomorrow"
                                onclick="RemindersPopover._tomorrow('${id}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function _render() {
        const el = _ensureDom();
        const counts = (typeof Reminders !== 'undefined' && typeof Reminders.getCounts === 'function')
            ? Reminders.getCounts() : null;
        const urgent = counts ? (counts.overdue + counts.dueToday) : 0;
        const countLabel = urgent > 0
            ? `<span class="rem-pop-count">${urgent} urgent</span>`
            : '';

        el.innerHTML = `
            <div class="rem-pop-header">
                <div class="rem-pop-title-main">Reminders ${countLabel}</div>
                <button type="button" class="rem-pop-close" aria-label="Close"
                        onclick="RemindersPopover.close()">&times;</button>
            </div>
            <form class="rem-pop-add" onsubmit="return RemindersPopover._quickAdd(event)">
                <input type="text" id="remPopAddInput" class="rem-pop-input"
                       placeholder="Add a reminder…" maxlength="200" autocomplete="off">
                <button type="submit" class="rem-pop-add-btn" aria-label="Add">+</button>
            </form>
            <div class="rem-pop-list">${_renderList()}</div>
            <div class="rem-pop-footer">
                <a href="#tool/reminders" class="rem-pop-viewall"
                   onclick="RemindersPopover._navAll(event)">View all reminders →</a>
            </div>
        `;
    }

    function _onDocClick(e) {
        const el = document.getElementById(POPOVER_ID);
        if (!el || !el.classList.contains('rem-popover-open')) return;
        if (el.contains(e.target)) return;
        // Don't close if user clicked the bell itself — that would re-open.
        if (e.target.closest && e.target.closest('.header-notification-btn')) return;
        close();
    }
    function _onDocKey(e) {
        if (e.key === 'Escape' && _isOpen()) close();
    }

    function open() {
        const el = _ensureDom();
        _render();
        _position(el);
        // Reflow before toggling the class so the transition fires.
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight;
        el.classList.add('rem-popover-open');
        if (!_docListenersBound) {
            _docListenersBound = true;
            document.addEventListener('mousedown', _onDocClick);
            document.addEventListener('keydown', _onDocKey);
        }
        // Focus the quick-add input so the keyboard-driven flow feels native.
        const input = document.getElementById('remPopAddInput');
        if (input && typeof input.focus === 'function') {
            try { input.focus(); } catch { /* noop */ }
        }
    }

    function close() {
        const el = document.getElementById(POPOVER_ID);
        if (el) el.classList.remove('rem-popover-open');
    }

    function toggle() {
        _isOpen() ? close() : open();
    }

    function _quickAdd(e) {
        if (e) e.preventDefault();
        const input = document.getElementById('remPopAddInput');
        if (!input) return false;
        const title = (input.value || '').trim();
        if (!title) return false;
        if (typeof Reminders !== 'undefined' && typeof Reminders.addTask === 'function') {
            try { Reminders.addTask(title); } catch (err) {
                console.warn('[RemindersPopover] addTask failed:', err && err.message);
            }
        }
        input.value = '';
        _render();
        _position(_ensureDom());
        // Keep the popover open so users can rapid-fire additions.
        const refocus = document.getElementById('remPopAddInput');
        if (refocus && typeof refocus.focus === 'function') refocus.focus();
        return false;
    }

    function _complete(id) {
        if (typeof Reminders !== 'undefined' && typeof Reminders.toggle === 'function') {
            try { Reminders.toggle(id); } catch (err) {
                console.warn('[RemindersPopover] toggle failed:', err && err.message);
            }
        }
        _render();
    }

    function _tomorrow(id) {
        if (typeof Reminders !== 'undefined' && typeof Reminders.pushToTomorrow === 'function') {
            try { Reminders.pushToTomorrow(id); } catch (err) {
                console.warn('[RemindersPopover] pushToTomorrow failed:', err && err.message);
            }
        }
        _render();
    }

    function _navAll(e) {
        if (e) e.preventDefault();
        close();
        if (typeof App !== 'undefined' && typeof App.navigateTo === 'function') {
            App.navigateTo('reminders');
        } else {
            window.location.hash = '#tool/reminders';
        }
        return false;
    }

    return Object.freeze({
        open, close, toggle,
        _quickAdd, _complete, _tomorrow, _navAll,
        // For tests:
        _isOpen, _render,
    });
})();
