/**
 * Reminders — Weekly Task & Reminder Tracker
 * Stores to localStorage('altech_reminders') and syncs to cloud.
 *
 * Data model:
 * {
 *   tasks: [{ id, title, notes, frequency, dueDate, category, priority, completions:[], createdAt }],
 *   categories: ['Renewals', 'Follow-ups', 'Admin', 'Marketing'],
 *   lastAlertShown: timestamp
 * }
 */
window.Reminders = (() => {
    'use strict';

    const STORAGE_KEY = 'altech_reminders';

    const DEFAULT_CATEGORIES = ['Renewals', 'Follow-ups', 'Admin', 'Marketing', 'Compliance'];

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
            }
        } catch (e) {
            console.error('[Reminders] Load error:', e);
        }
    }

    // ── Date Helpers ──

    /** Parse YYYY-MM-DD as local midnight (not UTC) */
    function _parseLocalDate(dateStr) {
        if (!dateStr) return new Date(NaN);
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function _today() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function _formatDate(dateStr) {
        if (!dateStr) return '';
        const d = _parseLocalDate(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function _relativeDate(dateStr) {
        if (!dateStr) return '';
        const due = _parseLocalDate(dateStr);
        const today = _today();
        const diff = Math.round((due - today) / (1000 * 60 * 60 * 24));
        if (diff < 0) return `${Math.abs(diff)}d overdue`;
        if (diff === 0) return 'Due today';
        if (diff === 1) return 'Due tomorrow';
        if (diff <= 7) return `Due in ${diff}d`;
        return _formatDate(dateStr);
    }

    function _getNextDueDate(task) {
        const freq = task.frequency || 'weekly';
        const today = _today();
        const due = _parseLocalDate(task.dueDate);

        // If not yet due, keep current date
        if (due > today) return task.dueDate;

        // Calculate next occurrence
        const next = new Date(due);
        while (next <= today) {
            if (freq === 'daily') next.setDate(next.getDate() + 1);
            else if (freq === 'weekly') next.setDate(next.getDate() + 7);
            else if (freq === 'biweekly') next.setDate(next.getDate() + 14);
            else if (freq === 'monthly') next.setMonth(next.getMonth() + 1);
            else break; // 'once' — don't advance
        }
        return next.toISOString().split('T')[0];
    }

    function _getStatus(task) {
        if (!task.dueDate) return 'no-date';
        const due = _parseLocalDate(task.dueDate);
        const today = _today();
        const diff = Math.round((due - today) / (1000 * 60 * 60 * 24));

        // Check if completed this period
        const lastCompletion = task.completions?.[task.completions.length - 1];
        if (lastCompletion) {
            const lc = new Date(lastCompletion);
            lc.setHours(0, 0, 0, 0);
            if (lc >= today) return 'completed';
            // For recurring: completed if done since last due cycle started
            if (task.frequency !== 'once') {
                const cycleDays = task.frequency === 'daily' ? 1 :
                    task.frequency === 'weekly' ? 7 :
                    task.frequency === 'biweekly' ? 14 : 30;
                const cycleStart = new Date(due);
                cycleStart.setDate(cycleStart.getDate() - cycleDays);
                if (lc > cycleStart) return 'completed';
            }
        }

        if (diff < 0) return 'overdue';
        if (diff === 0) return 'due-today';
        if (diff <= 2) return 'due-soon';
        return 'upcoming';
    }

    function _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ── Task CRUD ──

    function addTask(title, options = {}) {
        const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const today = _today();
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        _state.tasks.push({
            id,
            title: title.trim(),
            notes: options.notes || '',
            frequency: options.frequency || 'weekly',
            dueDate: options.dueDate || nextWeek.toISOString().split('T')[0],
            category: options.category || 'Admin',
            priority: options.priority || 'normal', // low, normal, high
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
        // For recurring tasks, advance the due date
        if (task.frequency !== 'once') {
            task.dueDate = _getNextDueDate(task);
        }
        _save();
    }

    function uncompleteTask(id) {
        const task = _state.tasks.find(t => t.id === id);
        if (!task) return;
        // Remove most recent completion
        if (task.completions.length) {
            task.completions.pop();
        }
        _save();
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
        const counts = { total: 0, overdue: 0, dueToday: 0, dueSoon: 0, completed: 0, upcoming: 0 };
        _state.tasks.forEach(t => {
            counts.total++;
            const s = _getStatus(t);
            if (s === 'overdue') counts.overdue++;
            else if (s === 'due-today') counts.dueToday++;
            else if (s === 'due-soon') counts.dueSoon++;
            else if (s === 'completed') counts.completed++;
            else counts.upcoming++;
        });
        return counts;
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

        // Show toast if App available
        if (typeof App !== 'undefined' && App.toast) {
            const msg = counts.overdue > 0
                ? `⏰ ${counts.overdue} overdue reminder${counts.overdue > 1 ? 's' : ''}${counts.dueToday ? ` + ${counts.dueToday} due today` : ''}`
                : `📋 ${counts.dueToday} reminder${counts.dueToday > 1 ? 's' : ''} due today`;
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
        else if (filter === 'active') tasks = tasks.filter(t => !['completed'].includes(_getStatus(t)));

        if (catFilter !== 'all') tasks = tasks.filter(t => t.category === catFilter);
        if (search) tasks = tasks.filter(t =>
            t.title.toLowerCase().includes(search) ||
            t.notes.toLowerCase().includes(search) ||
            t.category.toLowerCase().includes(search)
        );

        // Sort: overdue first, then due-today, then due-soon, then upcoming, completed last
        const order = { 'overdue': 0, 'due-today': 1, 'due-soon': 2, 'upcoming': 3, 'no-date': 4, 'completed': 5 };
        tasks.sort((a, b) => {
            const sa = _getStatus(a), sb = _getStatus(b);
            if (order[sa] !== order[sb]) return order[sa] - order[sb];
            // Within same status, sort by priority then date
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
            const statusClass = `rem-status-${status}`;
            const priorityDot = t.priority === 'high' ? '<span class="rem-priority-dot high"></span>' :
                                t.priority === 'low' ? '<span class="rem-priority-dot low"></span>' : '';

            return `<div class="rem-task-card ${statusClass}" data-id="${t.id}" style="animation-delay: ${i * 0.02}s;">
                <div class="rem-task-row">
                    <button class="rem-check-btn ${isCompleted ? 'checked' : ''}" onclick="Reminders.toggle('${t.id}')" aria-label="Toggle complete">
                        ${isCompleted ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                    </button>
                    <div class="rem-task-content">
                        <div class="rem-task-title ${isCompleted ? 'rem-done' : ''}">${priorityDot}${_escapeHTML(t.title)}</div>
                        <div class="rem-task-meta">
                            <span class="rem-badge rem-badge-${status}">${_relativeDate(t.dueDate)}</span>
                            <span class="rem-badge rem-cat">${_escapeHTML(t.category)}</span>
                            <span class="rem-badge rem-freq">${t.frequency}</span>
                        </div>
                        ${t.notes ? `<div class="rem-task-notes">${_escapeHTML(t.notes)}</div>` : ''}
                    </div>
                    <div class="rem-task-actions">
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

        // Default due date: next Monday
        const today = _today();
        const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + daysUntilMonday);
        document.getElementById('remEditDueDate').value = nextMonday.toISOString().split('T')[0];

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
        const status = _getStatus(_state.tasks.find(t => t.id === id));
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
        // Update active filter button
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

        // Wire up search + category filter
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
