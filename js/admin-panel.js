/**
 * Admin Panel Module
 * 
 * Provides a user-management panel for admins to:
 * - View all registered users
 * - Grant/revoke admin privileges
 * - Block/unblock users
 * 
 * Only accessible when Auth.isAdmin === true.
 * Talks to /api/admin serverless endpoint.
 */

window.AdminPanel = (() => {
    'use strict';

    let _overlay = null;
    let _users = [];

    // ── API Helpers ──────────────────────────────────────────────────

    async function _apiFetch(action, options = {}) {
        if (!Auth.isSignedIn) throw new Error('Not signed in');
        const token = await Auth.getIdToken();
        if (!token) throw new Error('No auth token');

        const url = `/api/admin?action=${action}`;
        const resp = await fetch(url, {
            ...options,
            headers: {
                ...(options.headers || {}),
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `API error ${resp.status}`);
        return data;
    }

    async function _loadUsers() {
        const data = await _apiFetch('list');
        _users = (data.users || []).sort((a, b) => {
            // Admins first, then alphabetical
            if (a.isAdmin !== b.isAdmin) return b.isAdmin ? 1 : -1;
            return (a.email || '').localeCompare(b.email || '');
        });
        return _users;
    }

    async function _updateUser(targetUid, updates) {
        return _apiFetch('update', {
            method: 'POST',
            body: JSON.stringify({ targetUid, ...updates }),
        });
    }

    // ── Rendering ────────────────────────────────────────────────────

    function _formatDate(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch { return ''; }
    }

    function _renderUserCard(user) {
        const isYou = Auth.uid === user.uid;
        const initial = (user.displayName || user.email || '?')[0].toUpperCase();
        const name = user.displayName || user.email?.split('@')[0] || 'Unknown';

        const badges = [];
        if (isYou) badges.push('<span class="admin-badge admin-badge-you">You</span>');
        if (user.isAdmin) badges.push('<span class="admin-badge admin-badge-admin">Admin</span>');
        if (user.isBlocked) badges.push('<span class="admin-badge admin-badge-blocked">Blocked</span>');

        const classes = ['admin-user-card'];
        if (user.isBlocked) classes.push('is-blocked');
        if (isYou) classes.push('is-you');

        // Action buttons (disabled for self)
        let actions = '';
        if (!isYou) {
            if (user.isAdmin) {
                actions += `<button class="admin-action-btn admin-btn-revoke" data-uid="${user.uid}" data-action="revoke-admin">Revoke Admin</button>`;
            } else {
                actions += `<button class="admin-action-btn admin-btn-admin" data-uid="${user.uid}" data-action="grant-admin">Grant Admin</button>`;
            }
            if (user.isBlocked) {
                actions += `<button class="admin-action-btn admin-btn-unblock" data-uid="${user.uid}" data-action="unblock">Unblock</button>`;
            } else {
                actions += `<button class="admin-action-btn admin-btn-block" data-uid="${user.uid}" data-action="block">Block</button>`;
            }
        }

        return `
            <div class="${classes.join(' ')}">
                <div class="admin-user-avatar">${initial}</div>
                <div class="admin-user-info">
                    <div class="admin-user-name">${_escapeHtml(name)} ${badges.join('')}</div>
                    <div class="admin-user-email">${_escapeHtml(user.email)}</div>
                    <div class="admin-user-meta">Joined ${_formatDate(user.createdAt)}${user.lastLogin ? ' · Last login ' + _formatDate(user.lastLogin) : ''}</div>
                </div>
                <div class="admin-user-actions">${actions}</div>
            </div>
        `;
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _renderBody() {
        const body = _overlay?.querySelector('.admin-panel-body');
        if (!body) return;

        if (_users.length === 0) {
            body.innerHTML = '<div class="admin-loading">No users found.</div>';
            return;
        }

        const countEl = `<div class="admin-user-count">${_users.length} user${_users.length !== 1 ? 's' : ''} · ${_users.filter(u => u.isAdmin).length} admin${_users.filter(u => u.isAdmin).length !== 1 ? 's' : ''}</div>`;
        body.innerHTML = countEl + _users.map(_renderUserCard).join('');
    }

    // ── Button Actions ───────────────────────────────────────────────

    async function _handleAction(btn) {
        const uid = btn.dataset.uid;
        const action = btn.dataset.action;
        if (!uid || !action) return;

        const user = _users.find(u => u.uid === uid);
        if (!user) return;

        // Confirm destructive actions
        const actionLabels = {
            'grant-admin': `Grant admin access to ${user.email}?`,
            'revoke-admin': `Revoke admin access from ${user.email}?`,
            'block': `Block ${user.email}? They will be signed out immediately on next login.`,
            'unblock': `Unblock ${user.email}?`,
        };

        if (!confirm(actionLabels[action] || `Perform ${action}?`)) return;

        btn.disabled = true;
        btn.textContent = '...';

        try {
            const updates = {};
            if (action === 'grant-admin') updates.isAdmin = true;
            else if (action === 'revoke-admin') updates.isAdmin = false;
            else if (action === 'block') updates.isBlocked = true;
            else if (action === 'unblock') updates.isBlocked = false;

            await _updateUser(uid, updates);

            // Refresh user list
            await _loadUsers();
            _renderBody();

            if (typeof App !== 'undefined' && App.toast) {
                App.toast(`Updated ${user.email}`, 2000);
            }
        } catch (e) {
            console.error('[AdminPanel] Action failed:', e.message);
            if (typeof App !== 'undefined' && App.toast) {
                App.toast(e.message || 'Action failed', { type: 'error', duration: 4000 });
            }
            btn.disabled = false;
            btn.textContent = action.replace('-', ' ');
        }
    }

    // ── Overlay Management ───────────────────────────────────────────

    function _getOverlay() {
        if (_overlay) return _overlay;

        _overlay = document.createElement('div');
        _overlay.id = 'adminPanelOverlay';
        _overlay.className = 'admin-panel-overlay';
        _overlay.innerHTML = `
            <div class="admin-panel">
                <div class="admin-panel-header">
                    <h3>🛡️ User Management</h3>
                    <button class="admin-panel-close" onclick="AdminPanel.close()">&times;</button>
                </div>
                <div class="admin-panel-body">
                    <div class="admin-loading">Loading users...</div>
                </div>
            </div>
        `;

        // Close on backdrop click
        _overlay.addEventListener('click', (e) => {
            if (e.target === _overlay) close();
        });

        // Delegate action button clicks
        _overlay.addEventListener('click', (e) => {
            const btn = e.target.closest('.admin-action-btn');
            if (btn) _handleAction(btn);
        });

        document.body.appendChild(_overlay);
        return _overlay;
    }

    // ── Public API ───────────────────────────────────────────────────

    async function open() {
        if (!Auth.isAdmin) {
            console.warn('[AdminPanel] Not an admin');
            return;
        }

        const overlay = _getOverlay();
        overlay.classList.add('active');
        overlay.style.display = 'flex';

        // Load users
        const body = overlay.querySelector('.admin-panel-body');
        body.innerHTML = '<div class="admin-loading">Loading users...</div>';

        try {
            await _loadUsers();
            _renderBody();
        } catch (e) {
            console.error('[AdminPanel] Load failed:', e.message);
            body.innerHTML = `<div class="admin-error">Failed to load users: ${_escapeHtml(e.message)}</div>`;
        }
    }

    function close() {
        if (_overlay) {
            _overlay.classList.remove('active');
            _overlay.style.display = 'none';
        }
    }

    return { open, close };
})();
