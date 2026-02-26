/**
 * Dashboard Widgets Module
 * Renders live data widgets for the desktop command center bento layout.
 * Widgets: Reminders, Recent Drafts, CGL Compliance, Quick Actions, Quick Launch.
 *
 * @module DashboardWidgets
 */
window.DashboardWidgets = (() => {
    'use strict';

    let _refreshInterval = null;
    let _complianceBgInterval = null;
    let _complianceBgFetching = false;
    const COMPLIANCE_BG_FETCH_INTERVAL = 60 * 60 * 1000; // 1 hour
    let _initialized = false;

    // ── SVG Icon Library (Lucide-style, 24×24, stroke-based) ──
    const ICONS = {
        // Sidebar & widget icons
        home:        '<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        scanLine:    '<svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
        messageCircle: '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
        scale:       '<svg viewBox="0 0 24 24"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 8 4 12 8 16"/><polyline points="16 8 20 12 16 16"/></svg>',
        zap:         '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        upload:      '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        shieldCheck: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
        bell:        '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
        search:      '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        mail:        '<svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
        calculator:  '<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>',
        bookOpen:    '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        car:         '<svg viewBox="0 0 24 24"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
        fileText:    '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
        // UI icons
        chevronLeft: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
        chevronRight:'<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
        moon:        '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
        user:        '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        menu:        '<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        plus:        '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        star:        '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        check:       '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        alertCircle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        checkCircle: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        arrowRight:  '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
        sparkles:    '<svg viewBox="0 0 24 24"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>',
        clipboard:   '<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    };

    // Tool → Lucide icon mapping
    const TOOL_ICONS = {
        quoting:      'home',
        intake:       'scanLine',
        qna:          'messageCircle',
        quotecompare: 'scale',
        ezlynx:       'zap',
        hawksoft:     'upload',
        coi:          'fileText',
        compliance:   'shieldCheck',
        reminders:    'bell',
        prospect:     'search',
        email:        'mail',
        accounting:   'calculator',
        quickref:     'bookOpen',
        vindecoder:   'car',
    };

    /**
     * Get SVG icon HTML by name. Returns inline SVG string.
     */
    function icon(name, size) {
        const svg = ICONS[name] || ICONS.home;
        if (size) {
            return svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
        }
        return svg;
    }

    /**
     * Get the icon name for a tool key
     */
    function toolIcon(toolKey) {
        return TOOL_ICONS[toolKey] || 'home';
    }

    // ── Helpers ──

    function _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function _relativeTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function _dueDateText(dueDateStr, task) {
        // Use statusLabel from the new Reminders module if available
        if (task && task.statusLabel) return task.statusLabel;
        if (!dueDateStr) return '';
        const parts = dueDateStr.split('-');
        const due = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        due.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.round((due - today) / 86400000);

        if (diff < -1) return 'Missed';
        if (diff === -1) return 'Yesterday';
        if (diff === 0) return 'Due today';
        if (diff === 1) return 'Tomorrow';
        if (diff <= 7) return `In ${diff} days`;
        return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ── Render: Reminders Widget ──

    function renderRemindersWidget() {
        const container = document.getElementById('widgetReminders');
        if (!container) return;

        const hasModule = typeof Reminders !== 'undefined' && Reminders.getCounts;
        const counts = hasModule ? Reminders.getCounts() : { total: 0, overdue: 0, dueToday: 0, dueSoon: 0, completed: 0, upcoming: 0, snoozed: 0 };

        // Get upcoming tasks
        let tasks = [];
        if (hasModule && Reminders.getUpcomingTasks) {
            tasks = Reminders.getUpcomingTasks(5);
        }

        // Weekly summary
        let weeklySummaryHtml = '';
        if (hasModule && Reminders.getWeeklySummary) {
            const ws = Reminders.getWeeklySummary();
            if (ws.total > 0) {
                weeklySummaryHtml = `<div class="reminder-weekly-summary">📊 ${ws.done}/${ws.total} done this week</div>`;
            }
        }

        const snoozedPill = counts.snoozed ? `
                <div class="reminder-stat-pill stat-pill-snoozed">
                    <span class="stat-count">${counts.snoozed}</span>
                    <span class="stat-label">Snoozed</span>
                </div>` : '';

        const statsHtml = `
            <div class="reminder-stats">
                <div class="reminder-stat-pill stat-pill-overdue">
                    <span class="stat-count">${counts.overdue}</span>
                    <span class="stat-label">Missed</span>
                </div>
                <div class="reminder-stat-pill stat-pill-today">
                    <span class="stat-count">${counts.dueToday}</span>
                    <span class="stat-label">Today</span>
                </div>
                <div class="reminder-stat-pill stat-pill-soon">
                    <span class="stat-count">${counts.dueSoon}</span>
                    <span class="stat-label">Soon</span>
                </div>${snoozedPill}
                <div class="reminder-stat-pill stat-pill-completed">
                    <span class="stat-count">${counts.completed}</span>
                    <span class="stat-label">Done</span>
                </div>
            </div>
            ${weeklySummaryHtml}`;

        let taskListHtml;
        if (tasks.length === 0) {
            taskListHtml = `
                <div class="widget-empty">
                    <div class="widget-empty-icon">${icon('sparkles', 32)}</div>
                    <div class="widget-empty-text">No upcoming reminders — you're all caught up!</div>
                </div>`;
        } else {
            taskListHtml = `<div class="reminder-task-list">${tasks.map(t => {
                const priorityClass = t.priority === 'high' ? 'priority-high' : t.priority === 'low' ? 'priority-low' : 'priority-normal';
                const dueText = _dueDateText(t.dueDate, t);
                const isOverdue = t.status === 'overdue';
                const isSnoozed = t.status === 'snoozed';
                const isCompleted = t.status === 'completed';
                const hasNotes = t.notes && t.notes.trim().length > 0;
                const catBadge = t.category ? `<span class="reminder-tag reminder-tag-cat">${_escapeHTML(t.category)}</span>` : '';
                const freqLabel = t.frequency === 'weekdays' ? 'Mon\u2013Fri' : (t.frequency || 'weekly');
                const freqBadge = `<span class="reminder-tag reminder-tag-freq">${_escapeHTML(freqLabel)}</span>`;
                const notesToggle = hasNotes ? `<button class="reminder-notes-toggle" onclick="event.stopPropagation(); DashboardWidgets.toggleNotes('${t.id}')" title="Show notes"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>` : '';
                const notesContent = hasNotes ? `<div class="reminder-task-notes" id="rem-notes-${t.id}" style="display:none;"><div class="reminder-task-notes-inner">${_escapeHTML(t.notes)}</div></div>` : '';
                return `<div class="reminder-task-row-wrap" data-task-id="${t.id}">
                    <div class="reminder-task-row">
                        <div class="reminder-task-check ${isCompleted ? 'checked' : ''}" onclick="event.stopPropagation(); DashboardWidgets.toggleTask('${t.id}')"></div>
                        <div class="reminder-task-priority ${priorityClass}"></div>
                        <div class="reminder-task-info">
                            <div class="reminder-task-title">${_escapeHTML(t.title)}${notesToggle}</div>
                            <div class="reminder-task-tags">${catBadge}${freqBadge}</div>
                        </div>
                        <div class="reminder-task-due ${isOverdue ? 'overdue' : isSnoozed ? 'snoozed' : ''}">${_escapeHTML(dueText)}</div>
                    </div>
                    ${notesContent}
                </div>`;
            }).join('')}</div>`;
        }

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('bell', 16)} Reminders</div>
                <button class="widget-action" onclick="App.navigateTo('reminders')">View All →</button>
            </div>
            ${statsHtml}
            ${taskListHtml}`;
    }

    // ── Render: Recent Clients Widget ──

    function renderClientsWidget() {
        const container = document.getElementById('widgetDrafts');
        if (!container) return;

        let clients = [];
        let totalClients = 0;
        try {
            const raw = localStorage.getItem('altech_client_history');
            if (raw) {
                const allClients = JSON.parse(raw) || [];
                totalClients = allClients.length;
                clients = allClients.slice(0, 5); // already sorted newest-first
            }
        } catch (e) { /* ignore */ }

        let listHtml;
        if (clients.length === 0) {
            listHtml = `
                <div class="widget-empty">
                    <div class="widget-empty-icon">${icon('user', 32)}</div>
                    <div class="widget-empty-text">No saved clients yet</div>
                    <div class="widget-empty-sub">Complete a quote to see clients here</div>
                </div>`;
        } else {
            listHtml = `<div class="client-list">${clients.map(c => {
                const timeText = _relativeTime(c.savedAt);
                const qType = (c.data && c.data.qType || '').toLowerCase();
                const typeIcon = qType === 'home' ? icon('home', 14) : qType === 'auto' ? icon('car', 14) : qType === 'both' ? icon('home', 14) + icon('car', 14) : icon('user', 14);
                return `<div class="client-row" onclick="App.loadClientFromHistory('${c.id}'); App.navigateTo('quoting');">
                    <div class="client-type-icon">${typeIcon}</div>
                    <div class="client-info">
                        <div class="client-name">${_escapeHTML(c.name || 'Unnamed Client')}</div>
                        <div class="client-summary">${_escapeHTML(c.summary || '')}</div>
                    </div>
                    <div class="client-time">${_escapeHTML(timeText)}</div>
                </div>`;
            }).join('')}</div>`;
        }

        const countLabel = totalClients > 0 ? `<span class="client-count-badge">${totalClients}</span>` : '';

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('user', 16)} Recent Clients ${countLabel}</div>
                <button class="widget-action" onclick="App.navigateTo('quoting')">All Clients →</button>
            </div>
            ${listHtml}`;
    }

    // ── Render: CGL Compliance Widget ──

    function renderComplianceWidget() {
        const container = document.getElementById('widgetCompliance');
        if (!container) return;

        let warning = 0, critical = 0, totalPolicies = 0, okCount = 0;
        const flaggedPolicies = []; // collect policies needing attention
        try {
            const raw = localStorage.getItem('altech_cgl_cache');
            if (raw) {
                const cached = JSON.parse(raw);
                const policies = cached.policies || [];
                totalPolicies = policies.length;
                let verified = {}, dismissed = {};
                const stateRaw = localStorage.getItem('altech_cgl_state');
                if (stateRaw) {
                    const st = JSON.parse(stateRaw);
                    verified = st.verifiedPolicies || {};
                    dismissed = st.dismissedPolicies || {};
                }
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                policies.forEach(p => {
                    if (verified[p.policyNumber] || dismissed[p.policyNumber]) return;
                    if (!p.expirationDate) return;
                    const exp = new Date(p.expirationDate);
                    exp.setHours(0, 0, 0, 0);
                    const days = Math.round((exp - now) / 86400000);
                    if (days <= 14) {
                        critical++;
                        flaggedPolicies.push({ ...p, days, severity: 'critical' });
                    } else if (days <= 30) {
                        warning++;
                        flaggedPolicies.push({ ...p, days, severity: 'warning' });
                    } else {
                        okCount++;
                    }
                });
                // Sort critical first, then by days ascending
                flaggedPolicies.sort((a, b) => {
                    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
                    return a.days - b.days;
                });
            }
        } catch (e) { /* ignore */ }

        let severityClass;
        if (critical > 0) {
            severityClass = 'severity-critical';
        } else if (warning > 0) {
            severityClass = 'severity-warning';
        } else {
            severityClass = 'severity-ok';
        }

        // Apply severity class to the widget
        container.className = container.className.replace(/severity-\w+/g, '').trim();
        container.classList.add(severityClass);

        // Stat pills (like reminders widget)
        const statPillsHtml = `<div class="compliance-stats">
            <div class="compliance-stat-pill ${critical > 0 ? 'stat-critical' : ''}">
                <span class="stat-count">${critical}</span>
                <span class="stat-label">Critical</span>
            </div>
            <div class="compliance-stat-pill ${warning > 0 ? 'stat-warning' : ''}">
                <span class="stat-count">${warning}</span>
                <span class="stat-label">Warning</span>
            </div>
            <div class="compliance-stat-pill stat-ok">
                <span class="stat-count">${okCount}</span>
                <span class="stat-label">Current</span>
            </div>
            <div class="compliance-stat-pill stat-total">
                <span class="stat-count">${totalPolicies}</span>
                <span class="stat-label">Total</span>
            </div>
        </div>`;

        // Build policy list HTML when there are flagged policies
        let policyListHtml = '';
        if (flaggedPolicies.length > 0) {
            const rows = flaggedPolicies.slice(0, 10).map(p => {
                const rawName = _escapeHTML(p.clientName || p.businessName || p.insuredName || p.namedInsured || 'Unknown Insured');
                const hsId = p.hawksoftId || p.clientNumber;
                let nameHtml;
                if (hsId) {
                    const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
                    const href = isMobile
                        ? `https://agents.hawksoft.app/client/${encodeURIComponent(hsId)}`
                        : `hs://${encodeURIComponent(hsId)}`;
                    const title = isMobile ? 'Open in HawkSoft Agent Portal' : 'Open in HawkSoft';
                    nameHtml = `<a href="${href}" class="compliance-policy-link" title="${title}" target="_blank" rel="noopener">${rawName}</a>`;
                } else {
                    nameHtml = rawName;
                }
                const num = _escapeHTML(p.policyNumber || '—');
                const expDate = p.expirationDate ? new Date(p.expirationDate) : null;
                const expText = expDate ? expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                const daysText = p.days <= 0 ? 'Expired' : `${p.days}d left`;
                return `<div class="compliance-policy-row">
                    <div class="compliance-policy-severity ${p.severity}"></div>
                    <div class="compliance-policy-info">
                        <div class="compliance-policy-name">${nameHtml}</div>
                        <div class="compliance-policy-number">${num} · Exp ${_escapeHTML(expText)}</div>
                    </div>
                    <div class="compliance-policy-exp ${p.severity}">${_escapeHTML(daysText)}</div>
                </div>`;
            }).join('');
            const moreCount = flaggedPolicies.length > 10 ? flaggedPolicies.length - 10 : 0;
            const moreHtml = moreCount > 0 ? `<div class="compliance-policy-more">+${moreCount} more — <a href="#" onclick="event.preventDefault(); App.navigateTo('compliance')">View all</a></div>` : '';
            policyListHtml = `<div class="compliance-policy-list">${rows}${moreHtml}</div>`;
        } else if (totalPolicies === 0) {
            policyListHtml = `<div class="widget-empty">
                <div class="widget-empty-icon">${icon('shieldCheck', 32)}</div>
                <div class="widget-empty-text">No compliance data yet</div>
                <div class="widget-empty-sub">Sign in to sync CGL policies from HawkSoft</div>
            </div>`;
        } else {
            policyListHtml = `<div class="compliance-all-clear">
                ${icon('checkCircle', 20)}
                <span>All ${totalPolicies} policies are current — no expirations within 30 days</span>
            </div>`;
        }

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('shieldCheck', 16)} CGL Compliance</div>
                <button class="widget-action" onclick="App.navigateTo('compliance')">Full Dashboard →</button>
            </div>
            ${statPillsHtml}
            ${policyListHtml}`;
    }

    // ── Background CGL Compliance Fetch ──
    // Silently refreshes compliance cache so the widget (and full dashboard) stay current.
    // Only runs on production (HawkSoft API unreachable on localhost).

    async function _backgroundComplianceFetch() {
        if (_complianceBgFetching) return;
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (isLocal) return;

        // Check cache age — skip if fresh enough
        try {
            const raw = localStorage.getItem('altech_cgl_cache');
            if (raw) {
                const cached = JSON.parse(raw);
                const age = Date.now() - (cached.cachedAt || 0);
                if (age < COMPLIANCE_BG_FETCH_INTERVAL) {
                    console.log('[DashboardWidgets] CGL cache fresh (' + Math.round(age / 60000) + 'm) — skip bg fetch');
                    return;
                }
            }
        } catch (e) { /* proceed with fetch */ }

        _complianceBgFetching = true;
        console.log('[DashboardWidgets] CGL background refresh starting...');
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 65000);
            const res = await fetch('/api/compliance.js', { signal: controller.signal });
            clearTimeout(timeout);
            if (!res.ok) throw new Error('API ' + res.status);

            const data = await res.json();
            if (data?.policies?.length > 0) {
                const cacheObj = {
                    ...data,
                    cachedAt: Date.now(),
                    last_synced_time: new Date().toISOString()
                };
                try { localStorage.setItem('altech_cgl_cache', JSON.stringify(cacheObj)); } catch (e) {}
                // Update IDB if available (CglIDB is a module-level const in compliance-dashboard.js)
                if (typeof CglIDB !== 'undefined' && CglIDB.set) {
                    CglIDB.set('hawksoft_policy_data', cacheObj).catch(() => {});
                }
                // Re-render widget + badges with fresh data
                renderComplianceWidget();
                updateBadges();
                console.log('[DashboardWidgets] CGL background refresh done — ' + data.policies.length + ' policies');
            }
        } catch (e) {
            console.log('[DashboardWidgets] CGL background refresh failed (silent):', e.message);
        } finally {
            _complianceBgFetching = false;
        }
    }

    // ── Render: Quick Actions Widget ──

    function renderQuickActions() {
        const container = document.getElementById('widgetQuickActions');
        if (!container) return;

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('zap', 16)} Quick Actions</div>
            </div>
            <div class="quick-actions-grid">
                <button class="quick-action-btn" onclick="App.navigateTo('quoting')">
                    ${icon('plus', 22)}
                    <span class="quick-action-label">New Quote</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('intake')">
                    ${icon('scanLine', 22)}
                    <span class="quick-action-label">Scan Policy</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('prospect')">
                    ${icon('search', 22)}
                    <span class="quick-action-label">Prospect</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('qna')">
                    ${icon('messageCircle', 22)}
                    <span class="quick-action-label">Policy Q&A</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('ezlynx')">
                    ${icon('zap', 22)}
                    <span class="quick-action-label">EZLynx</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('hawksoft')">
                    ${icon('upload', 22)}
                    <span class="quick-action-label">HawkSoft</span>
                </button>
            </div>`;
    }

    // ── Render: Quick Launch Strip ──

    function renderQuickLaunch() {
        const container = document.getElementById('widgetQuickLaunch');
        if (!container) return;

        // Tools that are NOT already shown as widgets or quick actions
        const widgetKeys = new Set(['reminders', 'compliance']);
        const quickActionKeys = new Set(['quoting', 'intake', 'prospect', 'qna', 'ezlynx', 'hawksoft']);
        const toolConfig = (typeof App !== 'undefined' && App.toolConfig) ? App.toolConfig : [];

        const launchTools = toolConfig.filter(t => !t.hidden && !widgetKeys.has(t.key) && !quickActionKeys.has(t.key));

        // Group by category for dividers
        const groups = [];
        let lastCat = null;
        launchTools.forEach(t => {
            if (t.category !== lastCat && groups.length > 0) {
                groups.push({ divider: true });
            }
            lastCat = t.category;
            groups.push(t);
        });

        const itemsHtml = groups.map(item => {
            if (item.divider) return '<div class="quick-launch-divider"></div>';
            const iconName = toolIcon(item.key);
            return `<button class="quick-launch-item" onclick="App.navigateTo('${item.key}')" title="${_escapeHTML(item.title)}">
                ${icon(iconName, 24)}
                <span class="quick-launch-label">${_escapeHTML(item.title)}</span>
            </button>`;
        }).join('');

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('arrowRight', 16)} More Tools</div>
            </div>
            <div class="quick-launch-strip">${itemsHtml}</div>`;
    }

    // ── Sidebar Rendering ──

    function renderSidebar() {
        const sidebar = document.getElementById('appSidebar');
        if (!sidebar) return;

        const toolConfig = (typeof App !== 'undefined' && App.toolConfig) ? App.toolConfig : [];
        const categoryLabels = {
            quoting: 'Quoting',
            export: 'Export',
            docs: 'Documents',
            ops: 'Operations'
        };

        // Group tools by category
        const seen = [];
        const groups = {};
        toolConfig.filter(t => !t.hidden).forEach(t => {
            const cat = t.category || 'other';
            if (!groups[cat]) { groups[cat] = []; seen.push(cat); }
            groups[cat].push(t);
        });

        const navHtml = seen.map(cat => {
            const label = categoryLabels[cat] || cat;
            const items = groups[cat].map(t => {
                const iconName = toolIcon(t.key);
                const badgeHtml = t.badge ? `<span class="sidebar-badge" id="sidebar-${t.badge}"></span>` : '';
                return `<a class="sidebar-nav-item" data-tool="${t.key}" data-tooltip="${_escapeHTML(t.title)}"
                    href="#${t.key}" onclick="event.preventDefault(); App.navigateTo('${t.key}')">
                    <span class="sidebar-nav-icon">${icon(iconName, 20)}</span>
                    <span class="sidebar-nav-item-label">${_escapeHTML(t.title)}</span>
                    ${badgeHtml}
                </a>`;
            }).join('');
            return `<div class="sidebar-nav-group">
                <div class="sidebar-nav-label">${_escapeHTML(label)}</div>
                ${items}
            </div>`;
        }).join('');

        sidebar.innerHTML = `
            <div class="sidebar-brand">
                <div class="sidebar-brand-logo">AL</div>
                <div class="sidebar-brand-text">
                    <div class="sidebar-brand-name">Altech</div>
                    <div class="sidebar-brand-sub">Insurance Toolkit</div>
                </div>
            </div>
            <nav class="sidebar-nav">
                <div class="sidebar-nav-group">
                    <a class="sidebar-nav-item active" data-tool="home" data-tooltip="Dashboard"
                        href="#home" onclick="event.preventDefault(); App.goHome()">
                        <span class="sidebar-nav-icon">${icon('home', 20)}</span>
                        <span class="sidebar-nav-item-label">Dashboard</span>
                    </a>
                </div>
                ${navHtml}
            </nav>
            <div class="sidebar-footer">
                <div class="sidebar-footer-actions">
                    <button class="sidebar-footer-btn" onclick="App.toggleDarkMode()" title="Toggle dark mode" aria-label="Toggle dark mode">
                        ${icon('moon', 18)}
                    </button>
                    <button class="sidebar-footer-btn" onclick="Auth.showModal()" title="Account" aria-label="Account">
                        ${icon('user', 18)}
                    </button>
                </div>
                <button class="sidebar-collapse-toggle" onclick="DashboardWidgets.toggleSidebar()">
                    ${icon('chevronLeft', 20)}
                    <span class="sidebar-collapse-label">Collapse</span>
                </button>
            </div>`;
    }

    // ── Header Rendering ──

    function renderHeader() {
        const header = document.getElementById('appHeader');
        if (!header) return;

        // Greeting
        const h = new Date().getHours();
        const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
        let name = '';
        try {
            const user = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
            if (user) {
                const rawName = user.displayName || user.email.split('@')[0];
                name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            } else if (typeof Onboarding !== 'undefined') {
                name = Onboarding.getUserName() || '';
                if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
            }
        } catch (e) { /* ignore */ }

        const greetingHtml = name
            ? `<span class="header-greeting">${greeting}, <span class="greeting-name">${_escapeHTML(name)}</span></span>`
            : `<span class="header-greeting">${greeting}</span>`;

        // Reminder count for notification bell
        let urgentCount = 0;
        if (typeof Reminders !== 'undefined' && Reminders.getCounts) {
            const c = Reminders.getCounts();
            urgentCount = c.overdue + c.dueToday;
        }

        const badgeHtml = urgentCount > 0
            ? `<span class="header-notification-badge">${urgentCount}</span>`
            : '<span class="header-notification-badge"></span>';

        header.innerHTML = `
            <div class="header-breadcrumb" id="dashBreadcrumb">
                <button class="mobile-menu-btn" onclick="DashboardWidgets.toggleMobileSidebar()" aria-label="Menu">
                    ${icon('menu', 20)}
                </button>
                <span class="breadcrumb-current">Dashboard</span>
            </div>
            <div class="header-actions">
                ${greetingHtml}
                <button class="header-notification-btn" onclick="App.navigateTo('reminders')" title="Reminders" aria-label="Reminders">
                    ${icon('bell', 18)}
                    ${badgeHtml}
                </button>
            </div>`;
    }

    // ── Mobile Bottom Nav ──

    function renderMobileNav() {
        const nav = document.getElementById('mobileBottomNav');
        if (!nav) return;

        nav.innerHTML = `<div class="mobile-bottom-nav-inner">
            <button class="mobile-nav-item active" onclick="App.goHome()">
                ${icon('home', 22)}
                <span>Home</span>
            </button>
            <button class="mobile-nav-item" onclick="App.navigateTo('quoting')">
                ${icon('home', 22)}
                <span>Quoting</span>
            </button>
            <button class="mobile-nav-item" onclick="App.navigateTo('reminders')">
                ${icon('bell', 22)}
                <span>Reminders</span>
            </button>
            <button class="mobile-nav-item" onclick="App.navigateTo('prospect')">
                ${icon('search', 22)}
                <span>Search</span>
            </button>
            <button class="mobile-nav-item" onclick="DashboardWidgets.toggleMobileSidebar()">
                ${icon('menu', 22)}
                <span>More</span>
            </button>
        </div>`;
    }

    // ── Sidebar State Management ──

    function toggleSidebar() {
        document.body.classList.toggle('sidebar-collapsed');
        // Save preference
        try {
            localStorage.setItem('altech_sidebar_collapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '');
        } catch (e) { /* ignore */ }
    }

    function toggleMobileSidebar() {
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('active');
    }

    function _closeMobileSidebar() {
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
    }

    // ── Update active sidebar item ──

    function setActiveSidebarItem(toolKey) {
        const items = document.querySelectorAll('.sidebar-nav-item');
        items.forEach(item => {
            item.classList.toggle('active', item.dataset.tool === toolKey);
        });
    }

    // ── Update breadcrumb ──

    function updateBreadcrumb(toolName, toolTitle) {
        const bc = document.getElementById('dashBreadcrumb');
        if (!bc) return;
        const menuBtn = `<button class="mobile-menu-btn" onclick="DashboardWidgets.toggleMobileSidebar()" aria-label="Menu">${icon('menu', 20)}</button>`;

        if (!toolName || toolName === 'home') {
            bc.innerHTML = `${menuBtn}<span class="breadcrumb-current">Dashboard</span>`;
        } else {
            bc.innerHTML = `${menuBtn}<a href="#home" onclick="event.preventDefault(); App.goHome()">Dashboard</a>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-current">${_escapeHTML(toolTitle || toolName)}</span>`;
        }
    }

    // ── Update sidebar badges ──

    function updateBadges() {
        // Reminders badge
        if (typeof Reminders !== 'undefined' && Reminders.getCounts) {
            const counts = Reminders.getCounts();
            const urgent = counts.overdue + counts.dueToday;
            const badge = document.getElementById('sidebar-remindersBadge');
            if (badge) {
                badge.textContent = urgent > 0 ? urgent : '';
            }
        }
        // CGL badge
        const cglBadge = document.getElementById('sidebar-cglBadge');
        if (cglBadge) {
            try {
                const raw = localStorage.getItem('altech_cgl_cache');
                if (!raw) { cglBadge.textContent = ''; return; }
                const cached = JSON.parse(raw);
                const policies = cached.policies || [];
                let verified = {}, dismissed = {};
                const stateRaw = localStorage.getItem('altech_cgl_state');
                if (stateRaw) {
                    const st = JSON.parse(stateRaw);
                    verified = st.verifiedPolicies || {};
                    dismissed = st.dismissedPolicies || {};
                }
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                let count = 0;
                policies.forEach(p => {
                    if (verified[p.policyNumber] || dismissed[p.policyNumber]) return;
                    if (!p.expirationDate) return;
                    const exp = new Date(p.expirationDate);
                    exp.setHours(0, 0, 0, 0);
                    const days = Math.round((exp - now) / 86400000);
                    if (days <= 30) count++;
                });
                cglBadge.textContent = count > 0 ? count : '';
            } catch (e) {
                cglBadge.textContent = '';
            }
        }
    }

    // ── Dashboard Greeting ──

    function renderGreeting() {
        const container = document.getElementById('dashboardGreeting');
        if (!container) return;

        const h = new Date().getHours();
        const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
        let name = '';
        try {
            const user = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
            if (user) {
                const rawName = user.displayName || user.email.split('@')[0];
                name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            } else if (typeof Onboarding !== 'undefined') {
                name = Onboarding.getUserName() || '';
                if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
            }
        } catch (e) { /* ignore */ }

        const nameHtml = name ? `, <span class="greeting-name">${_escapeHTML(name)}</span>` : '';
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        container.innerHTML = `
            <h1>${greeting}${nameHtml}</h1>
            <p>${today} — Here's your overview</p>`;
    }

    // ── Toggle Task from Widget ──

    function toggleTask(taskId) {
        if (typeof Reminders !== 'undefined' && Reminders.toggle) {
            Reminders.toggle(taskId);
            // Re-render the widget after a short delay
            setTimeout(() => {
                renderRemindersWidget();
                updateBadges();
            }, 100);
        }
    }

    // ── Refresh All Widgets ──

    function refreshAll() {
        try { renderGreeting(); } catch (e) { console.error('[DashboardWidgets] renderGreeting error:', e); }
        try { renderRemindersWidget(); } catch (e) { console.error('[DashboardWidgets] renderRemindersWidget error:', e); }
        try { renderClientsWidget(); } catch (e) { console.error('[DashboardWidgets] renderClientsWidget error:', e); }
        try { renderComplianceWidget(); } catch (e) { console.error('[DashboardWidgets] renderComplianceWidget error:', e); }
        try { renderQuickActions(); } catch (e) { console.error('[DashboardWidgets] renderQuickActions error:', e); }
        try { renderQuickLaunch(); } catch (e) { console.error('[DashboardWidgets] renderQuickLaunch error:', e); }
        try { updateBadges(); } catch (e) { console.error('[DashboardWidgets] updateBadges error:', e); }
        try { renderHeader(); } catch (e) { console.error('[DashboardWidgets] renderHeader error:', e); }
    }

    // ── Show/Hide Dashboard ──

    function showDashboard() {
        const dv = document.getElementById('dashboardView');
        const pv = document.getElementById('pluginViewport');
        const lp = document.getElementById('landingPage');
        if (dv) dv.style.display = '';
        if (pv) { pv.style.display = 'none'; pv.classList.remove('active'); }
        if (lp) lp.style.display = 'none';
        setActiveSidebarItem('home');
        updateBreadcrumb(null);
        _closeMobileSidebar();
        refreshAll();

        // Start auto-refresh (widgets every 60s, compliance API every hour)
        _stopAutoRefresh();
        _refreshInterval = setInterval(() => {
            if (document.getElementById('dashboardView')?.style.display !== 'none') {
                renderRemindersWidget();
                renderClientsWidget();
                renderComplianceWidget();
                updateBadges();
            }
        }, 60000);
        // Hourly compliance background fetch — fire once now if stale, then every hour
        _backgroundComplianceFetch();
        _complianceBgInterval = setInterval(_backgroundComplianceFetch, COMPLIANCE_BG_FETCH_INTERVAL);
    }

    function hideDashboard(toolKey, toolTitle) {
        const dv = document.getElementById('dashboardView');
        const pv = document.getElementById('pluginViewport');
        const lp = document.getElementById('landingPage');
        if (dv) dv.style.display = 'none';
        if (pv) { pv.style.display = 'block'; pv.classList.add('active'); }
        if (lp) lp.style.display = 'none';
        setActiveSidebarItem(toolKey);
        updateBreadcrumb(toolKey, toolTitle);
        _closeMobileSidebar();

        // Auto-collapse sidebar on plugin open (if screen < 1280px)
        if (window.innerWidth < 1280) {
            document.body.classList.add('sidebar-collapsed');
        }

        _stopAutoRefresh();
    }

    function _stopAutoRefresh() {
        if (_refreshInterval) {
            clearInterval(_refreshInterval);
            _refreshInterval = null;
        }
        if (_complianceBgInterval) {
            clearInterval(_complianceBgInterval);
            _complianceBgInterval = null;
        }
    }

    // ── Init ──

    function init() {
        if (_initialized) return;
        _initialized = true;
        console.log('[DashboardWidgets] init() started');

        // Restore sidebar collapsed preference
        try {
            const collapsed = localStorage.getItem('altech_sidebar_collapsed');
            if (collapsed === '1') {
                document.body.classList.add('sidebar-collapsed');
            }
        } catch (e) { /* ignore */ }

        // Auto-collapse on medium screens
        if (window.innerWidth >= 1024 && window.innerWidth < 1280) {
            document.body.classList.add('sidebar-collapsed');
        }

        // Each render wrapped in try-catch to prevent cascade failure
        try { renderSidebar(); } catch (e) { console.error('[DashboardWidgets] renderSidebar error:', e); }
        try { renderHeader(); } catch (e) { console.error('[DashboardWidgets] renderHeader error:', e); }
        try { renderMobileNav(); } catch (e) { console.error('[DashboardWidgets] renderMobileNav error:', e); }
        try { refreshAll(); } catch (e) { console.error('[DashboardWidgets] refreshAll error:', e); }

        console.log('[DashboardWidgets] init() completed');
    }

    // ── Public API ──

    /** Toggle collapsible notes for a task in the dashboard widget */
    function toggleNotes(taskId) {
        const el = document.getElementById(`rem-notes-${taskId}`);
        if (!el) return;
        const isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
        // Rotate the chevron
        const wrap = el.closest('.reminder-task-row-wrap');
        if (wrap) wrap.classList.toggle('notes-open', !isOpen);
    }

    return {
        init,
        refreshAll,
        showDashboard,
        hideDashboard,
        toggleSidebar,
        toggleMobileSidebar,
        toggleTask,
        toggleNotes,
        setActiveSidebarItem,
        updateBreadcrumb,
        updateBadges,
        renderHeader,
        icon,
        toolIcon,
        ICONS,
        TOOL_ICONS,
    };
})();
