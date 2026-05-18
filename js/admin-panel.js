// js/admin-panel.js — Admin "User Management" modal.
//
// Rebuilds the legacy (Phase-D-removed) AdminPanel against the Supabase admin
// endpoint. Opened only for signed-in admins from the account modal's Team tab
// (`onclick="AdminPanel.open()"`). Lists users and toggles the two app_metadata
// flags (is_admin / is_blocked) the server whitelists.
//
// Pure IIFE: no DOM / Auth / App access at load (only inside open()), so it is
// safe to evaluate under tests/load-html.cjs in JSDOM.

window.AdminPanel = (() => {
    'use strict';

    const ENDPOINT = '/api/admin-supabase';

    function _q(id) { return document.getElementById(id); }

    function _toast(msg, type) {
        if (typeof App !== 'undefined' && App.toast) App.toast(msg, { type: type || 'info' });
    }

    function _setStatus(text) {
        const el = _q('adminPanelStatus');
        if (el) { el.textContent = text || ''; el.style.display = text ? '' : 'none'; }
    }

    function _setError(text) {
        const el = _q('adminPanelError');
        if (el) { el.textContent = text || ''; el.style.display = text ? 'block' : 'none'; }
    }

    async function open() {
        if (typeof window.Auth === 'undefined' || !Auth.isAdmin) {
            _toast('Admin access required', 'error');
            return;
        }
        const modal = _q('adminPanelModal');
        if (!modal) return;
        modal.classList.add('active');
        modal.style.display = 'flex';
        _setError('');
        const list = _q('adminUserList');
        if (list) list.innerHTML = '';
        await _load();
    }

    function close() {
        const modal = _q('adminPanelModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    async function _load() {
        _setStatus('Loading users…');
        _setError('');
        try {
            const res = await Auth.apiFetch(`${ENDPOINT}?action=list`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                _setStatus('');
                _setError(data && data.error ? data.error : `Failed to load users (${res.status})`);
                return;
            }
            _setStatus('');
            _render(Array.isArray(data.users) ? data.users : []);
        } catch (e) {
            _setStatus('');
            _setError('Network error loading users.');
        }
    }

    function _render(users) {
        const list = _q('adminUserList');
        if (!list) return;
        list.innerHTML = '';
        const selfUid = (typeof window.Auth !== 'undefined' && Auth.uid) || null;

        if (users.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'admin-user-sub';
            empty.style.padding = '0.75rem 0';
            empty.textContent = 'No users found.';
            list.appendChild(empty);
            return;
        }

        users.forEach(u => {
            const isSelf = !!selfUid && u.uid === selfUid;

            const row = document.createElement('div');
            row.className = 'admin-user-row';

            const meta = document.createElement('div');
            meta.className = 'admin-user-meta';

            const emailLine = document.createElement('div');
            emailLine.className = 'admin-user-email';
            emailLine.textContent = u.email || '(no email)';   // textContent → XSS-safe
            if (u.isAdmin) {
                const b = document.createElement('span');
                b.className = 'admin-badge is-admin';
                b.textContent = 'ADMIN';
                emailLine.appendChild(b);
            }
            if (u.isBlocked) {
                const b = document.createElement('span');
                b.className = 'admin-badge is-blocked';
                b.textContent = 'BLOCKED';
                emailLine.appendChild(b);
            }

            const sub = document.createElement('div');
            sub.className = 'admin-user-sub';
            sub.textContent = (u.displayName || '—') + (isSelf ? ' · you' : '');

            meta.appendChild(emailLine);
            meta.appendChild(sub);

            const adminBtn = document.createElement('button');
            adminBtn.className = 'btn-auth btn-auth-small btn-auth-secondary';
            adminBtn.style.marginTop = '0';
            adminBtn.textContent = u.isAdmin ? 'Remove admin' : 'Make admin';
            adminBtn.onclick = () => _setFlag(u.uid, { isAdmin: !u.isAdmin }, adminBtn);

            const blockBtn = document.createElement('button');
            blockBtn.className = 'btn-auth btn-auth-small btn-auth-secondary';
            blockBtn.style.marginTop = '0';
            blockBtn.textContent = u.isBlocked ? 'Unblock' : 'Block';
            blockBtn.onclick = () => _setFlag(u.uid, { isBlocked: !u.isBlocked }, blockBtn);

            // Mirror the server-side self-protection guards client-side.
            if (isSelf) {
                adminBtn.disabled = true;
                blockBtn.disabled = true;
                adminBtn.title = blockBtn.title = "You can't change your own admin/blocked status.";
            }

            row.appendChild(meta);
            row.appendChild(adminBtn);
            row.appendChild(blockBtn);
            list.appendChild(row);
        });
    }

    async function _setFlag(uid, patch, btn) {
        if (btn) btn.disabled = true;
        try {
            const res = await Auth.apiFetch(`${ENDPOINT}?action=update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ targetUid: uid }, patch)),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                _toast(data && data.error ? data.error : 'Update failed', 'error');
                if (btn) btn.disabled = false;
                return;
            }
            _toast('User updated', 'success');
            if (typeof window !== 'undefined' && window.ActivityLog) {
                window.ActivityLog.add({
                    type: 'sync', area: 'admin', ok: true,
                    message: `Updated user ${uid.slice(0, 8)}`,
                });
            }
            await _load();   // refresh badges/labels from the source of truth
        } catch (e) {
            _toast('Network error updating user.', 'error');
            if (btn) btn.disabled = false;
        }
    }

    return { open, close };
})();
