/**
 * Reminders — Weekly Task & Reminder Tracker
 * Stores to localStorage('altech_reminders') and syncs to cloud.
 *
 * All time logic uses PST (America/Los_Angeles). Resets at 12:00 AM PST.
 * Snooze/defer state persists in localStorage alongside task data.
 *
 * Data model:
 * {
 *   tasks: [{ id, title, notes, frequency, dueDate, dueDay, category, priority,
 *             completions:[], snooze:{type,until,originalDueDate}, createdAt }],
 *   categories: ['Renewals', 'Follow-ups', 'Admin', 'Marketing', 'Compliance'],
 *   lastAlertShown: timestamp,
 *   gracePeriodEnabled: false
 * }
 */
window.Reminders = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_reminders';
    const PST_TIMEZONE = 'America/Los_Angeles';
    const DEFAULT_CATEGORIES = ['Renewals', 'Follow-ups', 'Admin', 'Marketing', 'Compliance'];

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let _state = {
        tasks: [],
        categories: [...DEFAULT_CATEGORIES],
        lastAlertShown: 0
    };

    // ── Persistence ──

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
        } catch (e) {
            console.error('[Reminders] Save error:', e);
        }
        // Cloud sync
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
        _updateBadge();
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                _state.tasks = parsed.tasks || [];
                _state.categories = parsed.categories || [...DEFAULT_CATEGORIES];
                _state.lastAlertShown = parsed.lastAlertShown || 0;
                // gracePeriodEnabled removed — tasks always go overdue at midnight PST
            }
        } catch (e) {
            console.error('[Reminders] Load error:', e);
        }
    }

    // ── PST Date Helpers ──

    /** Get the current date/time in PST as a Date-like object */
    function _nowPST() {
        // Get current time formatted in PST timezone
        const now = new Date();
        const pstStr = now.toLocaleString('en-US', { timeZone: PST_TIMEZONE });
        return new Date(pstStr);
    }

    /** Get today's date at midnight PST as YYYY-MM-DD */
    function _todayPST() {
        const pst = _nowPST();
        return _toDateStr(pst);
    }

    /** Parse YYYY-MM-DD as a date (no time component) */
    function _parseLocalDate(dateStr) {
        if (!dateStr) return new Date(NaN);
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    /** Format a Date as YYYY-MM-DD */
    function _toDateStr(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // Keep legacy alias for compatibility
    const _toLocalDateStr = _toDateStr;

    function _todayDate() {
        return _parseLocalDate(_todayPST());
    }

    function _pstDayOfWeek() {
        return _nowPST().getDay(); // 0=Sun…6=Sat
    }

    function _pstHour() {
        return _nowPST().getHours();
    }

    function _formatDate(dateStr) {
        if (!dateStr) return '';
        const d = _parseLocalDate(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /** Get the day name for a YYYY-MM-DD date string */
    function _dayName(dateStr) {
        if (!dateStr) return '';
        const d = _parseLocalDate(dateStr);
        return DAY_NAMES[d.getDay()];
    }

    function _dayNameShort(dateStr) {
        if (!dateStr) return '';
        const d = _parseLocalDate(dateStr);
        return DAY_NAMES_SHORT[d.getDay()];
    }

    /** Diff in days between a date string and today (PST). Positive = future. */
    function _dayDiff(dateStr) {
        if (!dateStr) return NaN;
        const due = _parseLocalDate(dateStr);
        const today = _todayDate();
        return Math.round((due - today) / (1000 * 60 * 60 * 24));
    }

    // Returns the most recent Monday at midnight (PST-based week start)
    function _getMostRecentMonday() {
        const today = _todayDate();
        const day = today.getDay(); // 0=Sun … 6=Sat
        const diff = day === 0 ? 6 : day - 1; // days since last Monday
        const monday = new Date(today);
        monday.setDate(monday.getDate() - diff);
        return monday;
    }

    /** Get the Monday that starts the NEXT week from today (PST) */
    function _getNextMonday() {
        const today = _todayDate();
        const day = today.getDay();
        const daysUntilMon = day === 0 ? 1 : (8 - day);
        const monday = new Date(today);
        monday.setDate(monday.getDate() + daysUntilMon);
        return monday;
    }

    // ── Snooze Helpers ──

    /** Check if a task's snooze is still active. Cleans up expired snoozes. */
    function _isSnoozeActive(task) {
        if (!task.snooze) return false;
        const now = _nowPST();
        const until = new Date(task.snooze.until);
        if (now > until) {
            // Snooze expired — clean up
            _clearExpiredSnooze(task);
            return false;
        }
        return true;
    }

    function _clearExpiredSnooze(task) {
        if (!task.snooze) return;
        const sType = task.snooze.type;

        if (sType === 'push-tomorrow' && task.snooze.originalDueDate) {
            // Already pushed — dueDate was updated, nothing to revert
        }
        if (sType === 'skip-week') {
            // If the next week has started, reset the task for the new week
            // The completion cycle logic handles this naturally
        }
        delete task.snooze;
    }

    /** Get human-readable label for a snoozed task */
    function _getSnoozeLabel(task) {
        if (!task.snooze || !_isSnoozeActive(task)) return null;
        switch (task.snooze.type) {
            case 'snooze-tonight': return 'Snoozed until tonight';
            case 'push-tomorrow': return 'Pushed to tomorrow';
            case 'skip-week': return 'Skipped this week — resets Monday';
            default: return 'Snoozed';
        }
    }

    // ── Status Logic (PST-based, snooze-aware) ──

    function _getNextDueDate(task) {
        const freq = task.frequency || 'weekly';
        const today = _todayDate();
        const due = _parseLocalDate(task.dueDate);

        // If not yet due, keep current date
        if (due > today) return task.dueDate;

        // Calculate next occurrence
        const next = new Date(due);
        while (next <= today) {
            if (freq === 'daily') next.setDate(next.getDate() + 1);
            else if (freq === 'weekdays') {
                next.setDate(next.getDate() + 1);
                while (next.getDay() === 0 || next.getDay() === 6) {
                    next.setDate(next.getDate() + 1);
                }
            }
            else if (freq === 'weekly') {
                const dayOfWeek = next.getDay();
                const daysUntilMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
                next.setDate(next.getDate() + daysUntilMon);
            }
            else if (freq === 'biweekly') next.setDate(next.getDate() + 14);
            else if (freq === 'monthly') next.setMonth(next.getMonth() + 1);
            else break; // 'once' — don't advance
        }
        return _toDateStr(next);
    }

    function _getStatus(task) {
        if (!task.dueDate) return 'no-date';
        const due = _parseLocalDate(task.dueDate);
        const today = _todayDate();
        const diff = Math.round((due - today) / (1000 * 60 * 60 * 24));

        // Check if completed this period
        const lastCompletion = task.completions?.[task.completions.length - 1];
        if (lastCompletion) {
            const lc = new Date(lastCompletion);
            // Convert completion timestamp to PST date for comparison
            const lcPSTStr = lc.toLocaleString('en-US', { timeZone: PST_TIMEZONE });
            const lcPST = new Date(lcPSTStr);
            lcPST.setHours(0, 0, 0, 0);

            if (lcPST >= today) return 'completed';
            // For recurring: completed if done since current cycle started
            if (task.frequency !== 'once') {
                let cycleStart;
                if (task.frequency === 'daily' || task.frequency === 'weekdays') {
                    cycleStart = today;
                } else if (task.frequency === 'weekly') {
                    cycleStart = _getMostRecentMonday();
                } else {
                    const cycleDays = task.frequency === 'biweekly' ? 14 : 30;
                    cycleStart = new Date(due);
                    cycleStart.setDate(cycleStart.getDate() - cycleDays);
                }
                if (lcPST >= cycleStart) return 'completed';
            }
        }

        // Check snooze state — if snoozed, show snoozed status instead of overdue
        if (_isSnoozeActive(task)) {
            return 'snoozed';
        }

        // Weekly tasks: show as "due [day]" for the whole week, not overdue until after that day passes
        if (task.frequency === 'weekly' && diff < 0) {
            // Only mark overdue after midnight PST on the due date has passed
            // diff < 0 means due date is in the past — it IS overdue
            return 'overdue';
        }

        // Daily tasks during the current day  — never "overdue" until midnight PST passes
        if (diff < 0) return 'overdue';
        if (diff === 0) return 'due-today';
        if (diff <= 2) return 'due-soon';
        return 'upcoming';
    }

    /** Get user-friendly status text for a task */
    function _getStatusLabel(task) {
        const status = _getStatus(task);
        const diff = _dayDiff(task.dueDate);

        // If snoozed, show snooze label
        const snoozeLabel = _getSnoozeLabel(task);
        if (snoozeLabel) return snoozeLabel;

        switch (status) {
            case 'completed': return 'Completed';
            case 'due-today': return 'Due today';
            case 'due-soon':
                if (diff === 1) return 'Due tomorrow';
                return `Due ${_dayName(task.dueDate)}`;
            case 'upcoming':
                if (diff <= 7) return `Due ${_dayName(task.dueDate)}`;
                return _formatDate(task.dueDate);
            case 'overdue':
                return 'Missed — resets tonight at midnight';
            case 'snoozed':
                return _getSnoozeLabel(task) || 'Snoozed';
            case 'no-date':
                return 'No due date';
            default:
                return '';
        }
    }

    function _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ── Task CRUD ──

    function addTask(title, options = {}) {
        const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const today = _todayDate();
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        _state.tasks.push({
            id,
            title: title.trim(),
            notes: options.notes || '',
            frequency: options.frequency || 'weekly',
            dueDate: options.dueDate || _toDateStr(nextWeek),
            dueDay: options.dueDay || null, // e.g. 5 for Friday (weekly tasks)
            category: options.category || 'Admin',
            priority: options.priority || 'normal',
            completions: [],
            createdAt: new Date().toISOString()
        });
        _save();
        return id;
    }

    function updateTask(id, updates) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        Object.assign(task, updates);
        _save();
    }

    function deleteTask(id) {
        _state.tasks = _state.tasks.filter(t => t.id !== id);
        _save();
    }

    function completeTask(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        task.completions.push(new Date().toISOString());
        // Clear any active snooze
        delete task.snooze;
        // For recurring tasks, advance the due date
        if (task.frequency !== 'once') {
            task.dueDate = _getNextDueDate(task);
        }
        _save();
    }

    function uncompleteTask(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        if (task.completions.length) {
            task.completions.pop();
        }
        _save();
    }

    // ── Snooze / Defer Actions ──

    /** Snooze until 11:59 PM PST tonight */
    function snoozeUntilTonight(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        const todayStr = _todayPST();
        const [y, m, d] = todayStr.split('-').map(Number);
        // Create a timestamp for 11:59 PM PST today
        // We store as ISO string but the check uses PST comparison
        const endOfDay = new Date(y, m - 1, d, 23, 59, 59);
        task.snooze = {
            type: 'snooze-tonight',
            until: endOfDay.toISOString(),
            originalDueDate: task.dueDate
        };
        _save();
        render();
        if (typeof App !== 'undefined' && App.toast) {
            App.toast('Snoozed until tonight', 'success');
        }
    }

    /** Push to tomorrow (daily tasks only) */
    function pushToTomorrow(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        const today = _todayDate();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const originalDue = task.dueDate;
        task.dueDate = _toDateStr(tomorrow);
        task.snooze = {
            type: 'push-tomorrow',
            until: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59).toISOString(),
            originalDueDate: originalDue
        };
        _save();
        render();
        if (typeof App !== 'undefined' && App.toast) {
            App.toast('Pushed to tomorrow — no penalty', 'success');
        }
    }

    /** Skip this week (weekly tasks only) — resets next Monday */
    function skipThisWeek(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        const nextMon = _getNextMonday();
        task.snooze = {
            type: 'skip-week',
            until: new Date(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate(), 0, 0, 1).toISOString(),
            originalDueDate: task.dueDate
        };
        _save();
        render();
        if (typeof App !== 'undefined' && App.toast) {
            App.toast('Skipped this week — resets Monday', 'success');
        }
    }

    /** Show the snooze/defer action sheet for a task */
    function showSnoozeMenu(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        const status = _getStatus(task);
        if (status === 'completed') return;

        // Build action sheet options based on task type
        const isDaily = ['daily', 'weekdays', 'once'].includes(task.frequency);
        const isWeekly = ['weekly', 'biweekly'].includes(task.frequency);

        let menuHtml = `<div class="rem-snooze-menu" id="remSnoozeMenu" data-task-id="${id}">
            <div class="rem-snooze-header">What would you like to do?</div>
            <button class="rem-snooze-option" onclick="Reminders.snoozeUntilTonight('${id}'); Reminders.closeSnoozeMenu();">
                <span class="rem-snooze-icon">🕐</span>
                <span class="rem-snooze-text">
                    <strong>Snooze until tonight</strong>
                    <small>Suppresses until 11:59 PM today</small>
                </span>
            </button>`;

        if (isDaily) {
            menuHtml += `<button class="rem-snooze-option" onclick="Reminders.pushToTomorrow('${id}'); Reminders.closeSnoozeMenu();">
                <span class="rem-snooze-icon">📅</span>
                <span class="rem-snooze-text">
                    <strong>Push to tomorrow</strong>
                    <small>Moves due date forward one day, no penalty</small>
                </span>
            </button>`;
        }

        if (isWeekly) {
            menuHtml += `<button class="rem-snooze-option" onclick="Reminders.skipThisWeek('${id}'); Reminders.closeSnoozeMenu();">
                <span class="rem-snooze-icon">⏭️</span>
                <span class="rem-snooze-text">
                    <strong>Skip this week</strong>
                    <small>Marks as skipped, resets next Monday</small>
                </span>
            </button>`;
        }

        menuHtml += `<button class="rem-snooze-option rem-snooze-complete" onclick="Reminders.toggle('${id}'); Reminders.closeSnoozeMenu();">
                <span class="rem-snooze-icon">✅</span>
                <span class="rem-snooze-text">
                    <strong>I did it!</strong>
                    <small>Mark as complete</small>
                </span>
            </button>
            <button class="rem-snooze-cancel" onclick="Reminders.closeSnoozeMenu()">Cancel</button>
        </div>`;

        // Show the overlay
        let overlay = document.getElementById('remSnoozeOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'remSnoozeOverlay';
            overlay.className = 'rem-snooze-overlay';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeSnoozeMenu();
            });
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = menuHtml;
        overlay.style.display = 'flex';
    }

    function closeSnoozeMenu() {
        const overlay = document.getElementById('remSnoozeOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    // ── Categories ──

    function addCategory(name) {
        if (!name?.trim()) return;
        if (!_state.categories.includes(name.trim())) {
            _state.categories.push(name.trim());
            _save();
        }
    }

    // ── Counts ──

    function getCounts() {
        const counts = { total: 0, overdue: 0, dueToday: 0, dueSoon: 0, completed: 0, upcoming: 0, snoozed: 0 };
        _state.tasks.forEach(t => {
            counts.total++;
            const s = _getStatus(t);
            if (s === 'overdue') counts.overdue++;
            else if (s === 'due-today') counts.dueToday++;
            else if (s === 'due-soon') counts.dueSoon++;
            else if (s === 'completed') counts.completed++;
            else if (s === 'snoozed') counts.snoozed++;
            else counts.upcoming++;
        });
        return counts;
    }

    /** Get weekly completion summary: tasks done vs total this week */
    function getWeeklySummary() {
        const weekStart = _getMostRecentMonday();
        const todayStr = _todayPST();
        let totalThisWeek = 0;
        let doneThisWeek = 0;

        _state.tasks.forEach(t => {
            // Count tasks that are active this week (not one-time tasks from other weeks)
            const freq = t.frequency || 'once';
            if (freq === 'once') {
                const diff = _dayDiff(t.dueDate);
                const due = _parseLocalDate(t.dueDate);
                if (due < weekStart) return; // Past one-time task
                if (diff > 6) return; // Future one-time task
            }
            totalThisWeek++;

            // Check if completed this week
            const lastCompletion = t.completions?.[t.completions.length - 1];
            if (lastCompletion) {
                const lcPSTStr = new Date(lastCompletion).toLocaleString('en-US', { timeZone: PST_TIMEZONE });
                const lcPST = new Date(lcPSTStr);
                lcPST.setHours(0, 0, 0, 0);
                if (lcPST >= weekStart) doneThisWeek++;
            }
        });

        return { done: doneThisWeek, total: totalThisWeek };
    }

    /**
     * Get upcoming (non-completed) tasks sorted by due date, for dashboard widget.
     * @param {number} limit - Maximum tasks to return (default 5)
     * @returns {Array<{id, title, dueDate, category, priority, status, statusLabel}>}
     */
    function getUpcomingTasks(limit = 5) {
        return _state.tasks
            .map(t => ({ ...t, status: _getStatus(t), statusLabel: _getStatusLabel(t) }))
            .filter(t => t.status !== 'completed')
            .sort((a, b) => {
                const order = { 'overdue': 0, 'due-today': 1, 'snoozed': 2, 'due-soon': 3, 'upcoming': 4, 'no-date': 5 };
                const diff = (order[a.status] ?? 6) - (order[b.status] ?? 6);
                if (diff !== 0) return diff;
                if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                return a.dueDate ? -1 : 1;
            })
            .slice(0, limit);
    }

    // ── Badge ──

    function _updateBadge() {
        const badge = document.getElementById('remindersBadge');
        if (!badge) return;
        const counts = getCounts();
        const urgent = counts.overdue + counts.dueToday;
        badge.textContent = urgent > 0 ? urgent : '';
        badge.dataset.count = urgent;
    }

    // ── Alert Check ──

    function checkAlerts() {
        const counts = getCounts();
        const urgent = counts.overdue + counts.dueToday;

        // Only show alert once per 4 hours
        const now = Date.now();
        if (now - _state.lastAlertShown < 4 * 60 * 60 * 1000) return;
        if (urgent === 0) return;

        _state.lastAlertShown = now;
        _save();

        if (typeof App !== 'undefined' && App.toast) {
            const msg = counts.overdue > 0
                ? `⏰ ${counts.overdue} missed task${counts.overdue > 1 ? 's' : ''}${counts.dueToday ? ` + ${counts.dueToday} due today` : ''}`
                : `📋 ${counts.dueToday} task${counts.dueToday > 1 ? 's' : ''} due today`;
            App.toast(msg);
        }
    }

    // ── Render ──

    function _renderStats() {
        const counts = getCounts();
        const el = (id, val) => {
            const e = document.getElementById(id);
            if (e) e.textContent = val;
        };
        el('remStatTotal', counts.total);
        el('remStatOverdue', counts.overdue);
        el('remStatDueToday', counts.dueToday);
        el('remStatCompleted', counts.completed);

        // Weekly summary
        const summaryEl = document.getElementById('remWeeklySummary');
        if (summaryEl) {
            const summary = getWeeklySummary();
            summaryEl.textContent = `${summary.done}/${summary.total} tasks done this week`;
            summaryEl.title = `${summary.done} of ${summary.total} tasks completed this week`;
        }
    }

    function _renderTasks(filter = 'all') {
        const list = document.getElementById('remTaskList');
        if (!list) return;

        const search = (document.getElementById('remSearchInput')?.value || '').toLowerCase();
        const catFilter = document.getElementById('remCategoryFilter')?.value || 'all';

        let tasks = [..._state.tasks];

        // Filter
        if (filter === 'overdue') tasks = tasks.filter(t => _getStatus(t) === 'overdue');
        else if (filter === 'due-today') tasks = tasks.filter(t => _getStatus(t) === 'due-today');
        else if (filter === 'completed') tasks = tasks.filter(t => _getStatus(t) === 'completed');
        else if (filter === 'snoozed') tasks = tasks.filter(t => _getStatus(t) === 'snoozed');
        else if (filter === 'active') tasks = tasks.filter(t => !['completed'].includes(_getStatus(t)));

        if (catFilter !== 'all') tasks = tasks.filter(t => t.category === catFilter);
        if (search) tasks = tasks.filter(t =>
            t.title.toLowerCase().includes(search) ||
            t.notes.toLowerCase().includes(search) ||
            t.category.toLowerCase().includes(search)
        );

        // Sort: overdue first, then due-today, snoozed, then due-soon, upcoming, completed last
        const order = { 'overdue': 0, 'due-today': 1, 'snoozed': 2, 'due-soon': 3, 'upcoming': 4, 'no-date': 5, 'completed': 6 };
        tasks.sort((a, b) => {
            const sa = _getStatus(a), sb = _getStatus(b);
            if (order[sa] !== order[sb]) return order[sa] - order[sb];
            const pOrd = { high: 0, normal: 1, low: 2 };
            if (pOrd[a.priority] !== pOrd[b.priority]) return pOrd[a.priority] - pOrd[b.priority];
            return _parseLocalDate(a.dueDate) - _parseLocalDate(b.dueDate);
        });

        if (tasks.length === 0) {
            list.innerHTML = `<div class="rem-empty">
                <div class="rem-empty-icon"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                <p>${filter === 'all' && !search ? 'No reminders yet. Tap + to add one.' : 'No matching reminders.'}</p>
            </div>`;
            return;
        }

        list.innerHTML = tasks.map((t, i) => {
            const status = _getStatus(t);
            const isCompleted = status === 'completed';
            const isSnoozed = status === 'snoozed';
            const statusClass = `rem-status-${status}`;
            const statusLabel = _getStatusLabel(t);
            const priorityDot = t.priority === 'high' ? '<span class="rem-priority-dot high"></span>' :
                                t.priority === 'low' ? '<span class="rem-priority-dot low"></span>' : '';

            const snoozeIcon = isSnoozed ? '<span class="rem-snooze-indicator" title="Snoozed">🕐</span>' : '';
            const canSnooze = !isCompleted;

            return `<div class="rem-task-card ${statusClass} ${isSnoozed ? 'rem-snoozed' : ''}" data-id="${t.id}" style="animation-delay: ${i * 0.02}s;">
                <div class="rem-task-row">
                    <button class="rem-check-btn ${isCompleted ? 'checked' : ''}" onclick="Reminders.toggle('${t.id}')" aria-label="Toggle complete">
                        ${isCompleted ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                    </button>
                    <div class="rem-task-content" ${canSnooze ? `onclick="Reminders.showSnoozeMenu('${t.id}')"` : ''} ${canSnooze ? 'style="cursor:pointer;"' : ''}>
                        <div class="rem-task-title ${isCompleted ? 'rem-done' : ''}">${priorityDot}${snoozeIcon}${_escapeHTML(t.title)}</div>
                        <div class="rem-task-meta">
                            <span class="rem-badge rem-badge-${status}">${_escapeHTML(statusLabel)}</span>
                            <span class="rem-badge rem-cat">${_escapeHTML(t.category)}</span>
                            <span class="rem-badge rem-freq">${t.frequency === 'weekdays' ? 'Mon–Fri' : t.frequency}</span>
                        </div>
                        ${t.notes ? `<div class="rem-task-notes">${_escapeHTML(t.notes)}</div>` : ''}
                    </div>
                    <div class="rem-task-actions">
                        ${canSnooze ? `<button class="rem-action-btn rem-snooze-btn" onclick="Reminders.showSnoozeMenu('${t.id}')" title="Snooze/Defer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>` : ''}
                        <button class="rem-action-btn" onclick="Reminders.showEdit('${t.id}')" title="Edit"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="rem-action-btn" onclick="Reminders.remove('${t.id}')" title="Delete"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function _renderCategoryOptions(selectId, selected) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const isFilter = selectId === 'remCategoryFilter';
        let html = isFilter ? '<option value="all">All Categories</option>' : '';
        html += _state.categories.map(c =>
            `<option value="${_escapeHTML(c)}" ${c === selected ? 'selected' : ''}>${_escapeHTML(c)}</option>`
        ).join('');
        sel.innerHTML = html;
    }

    function render(filter) {
        _renderStats();
        _renderTasks(filter || _currentFilter);
        _renderCategoryOptions('remCategoryFilter');
        _renderCategoryOptions('remEditCategory');
    }

    // ── Modal: Add/Edit ──

    let _currentFilter = 'all';
    let _editingId = null;

    function showAdd() {
        _editingId = null;
        const modal = document.getElementById('remEditModal');
        if (!modal) return;
        modal.style.display = 'flex';
        document.getElementById('remEditModalTitle').textContent = 'New Reminder';
        document.getElementById('remEditTitle').value = '';
        document.getElementById('remEditNotes').value = '';
        document.getElementById('remEditFrequency').value = 'weekly';
        document.getElementById('remEditPriority').value = 'normal';

        // Default due date: next Monday (PST)
        const today = _todayDate();
        const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + daysUntilMonday);
        document.getElementById('remEditDueDate').value = _toDateStr(nextMonday);

        _renderCategoryOptions('remEditCategory', 'Admin');
        document.getElementById('remEditTitle').focus();
    }

    function showEdit(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        _editingId = id;
        const modal = document.getElementById('remEditModal');
        if (!modal) return;
        modal.style.display = 'flex';
        document.getElementById('remEditModalTitle').textContent = 'Edit Reminder';
        document.getElementById('remEditTitle').value = task.title;
        document.getElementById('remEditNotes').value = task.notes;
        document.getElementById('remEditFrequency').value = task.frequency;
        document.getElementById('remEditDueDate').value = task.dueDate;
        document.getElementById('remEditPriority').value = task.priority;
        _renderCategoryOptions('remEditCategory', task.category);
    }

    function saveEdit() {
        const title = document.getElementById('remEditTitle').value.trim();
        if (!title) {
            document.getElementById('remEditTitle').focus();
            return;
        }
        const data = {
            title,
            notes: document.getElementById('remEditNotes').value.trim(),
            frequency: document.getElementById('remEditFrequency').value,
            dueDate: document.getElementById('remEditDueDate').value,
            category: document.getElementById('remEditCategory').value,
            priority: document.getElementById('remEditPriority').value
        };

        if (_editingId) {
            updateTask(_editingId, data);
        } else {
            addTask(title, data);
        }
        closeEdit();
        render();
    }

    function closeEdit() {
        const modal = document.getElementById('remEditModal');
        if (modal) modal.style.display = 'none';
        _editingId = null;
    }

    function toggle(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        const status = _getStatus(task);
        if (status === 'completed') {
            uncompleteTask(id);
        } else {
            completeTask(id);
        }
        render();
    }

    function remove(id) {
        if (!confirm('Delete this reminder?')) return;
        deleteTask(id);
        render();
    }

    function setFilter(filter) {
        _currentFilter = filter;
        document.querySelectorAll('.rem-filter-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.filter === filter);
        });
        render(filter);
    }

    // ── Init ──

    function init() {
        _load();
        render();
        _updateBadge();
        checkAlerts();

        const searchInput = document.getElementById('remSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => render());
        }
        const catFilter = document.getElementById('remCategoryFilter');
        if (catFilter) {
            catFilter.addEventListener('change', () => render());
        }
    }

    // ── Public API ──

    return {
        init,
        render,
        showAdd,
        showEdit,
        saveEdit,
        closeEdit,
        toggle,
        remove,
        setFilter,
        addCategory,
        checkAlerts,
        getCounts,
        getWeeklySummary,
        getUpcomingTasks,

        // Snooze/defer
        snoozeUntilTonight,
        pushToTomorrow,
        skipThisWeek,
        showSnoozeMenu,
        closeSnoozeMenu,

        // For cloud sync
        get state() { return _state; },
        set state(s) {
            _state = s || { tasks: [], categories: [...DEFAULT_CATEGORIES], lastAlertShown: 0 };
            _save();
        },

        // Update badge (called from landing page)
        updateBadge: _updateBadge
    };
})();
