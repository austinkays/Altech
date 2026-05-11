// js/command-palette.js — Cmd+K (or Ctrl+K) jump-to-anywhere palette.
//
// Why: clicking through 4 plugins to assemble a single workflow ("call comes
// in → look up client → start a quote → drop a reminder") wastes seconds
// every time. This palette is one keystroke + a few characters of fuzzy
// search → action. No mouse needed.
//
// Sources of items:
//   1. Tools — every entry from App.toolConfig
//   2. Recent clients — last ~30 from STORAGE_KEYS.CLIENT_HISTORY
//   3. Built-in actions — "Add reminder", "Open activity log", "Export…",
//      "New quote", "Toggle dark mode", etc.
//
// Public API:
//   CommandPalette.open()   / .close()   / .toggle()
//   CommandPalette.register({ id, label, hint, run })  // for plugins to add custom commands
//
// Keyboard:
//   Cmd/Ctrl+K           — toggle palette
//   ↑ / ↓                — move selection
//   Enter                — run selected
//   Esc                  — close
//   Cmd/Ctrl+/           — quick-add reminder shortcut (jumps straight to that command)

(function () {
    'use strict';

    // ── Custom command registry (plugins can extend) ─────────────────────
    const _registered = [];
    function register(cmd) {
        if (!cmd || !cmd.id || !cmd.label || typeof cmd.run !== 'function') return;
        // Replace existing registration with same id (idempotent on re-init).
        const existing = _registered.findIndex(c => c.id === cmd.id);
        if (existing >= 0) _registered[existing] = cmd;
        else _registered.push(cmd);
    }

    // ── Utilities ───────────────────────────────────────────────────────
    function _esc(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    /**
     * Score a string against a query for fuzzy matching.
     * Higher = better. Returns 0 if no match. Used for ranking.
     *
     * Rules (in priority order):
     *  1. Exact prefix match → very high score
     *  2. Word-boundary prefix in any token → high score
     *  3. Contiguous substring → medium
     *  4. Subsequence (chars-in-order) → low
     */
    function _score(text, query) {
        if (!query) return 1;
        const t = text.toLowerCase();
        const q = query.toLowerCase();

        if (t === q) return 1000;
        if (t.startsWith(q)) return 900 - (t.length - q.length); // prefer shorter matches

        // Word-boundary prefix
        const tokens = t.split(/[\s\-_/]+/);
        for (const tok of tokens) {
            if (tok.startsWith(q)) return 700;
        }

        // Contiguous substring
        const idx = t.indexOf(q);
        if (idx >= 0) return 500 - idx;

        // Subsequence
        let ti = 0, qi = 0, gaps = 0;
        while (ti < t.length && qi < q.length) {
            if (t[ti] === q[qi]) { qi++; gaps -= 1; }
            else { gaps += 1; }
            ti++;
        }
        if (qi === q.length) return Math.max(50 - gaps, 1);
        return 0;
    }

    // ── Source builders ─────────────────────────────────────────────────

    function _toolItems() {
        const tools = (window.App && window.App.toolConfig) || [];
        return tools.map(t => ({
            id: 'tool:' + t.key,
            label: t.title || t.name || t.key,
            hint: t.beta ? 'Tool · Beta' : 'Tool',
            icon: t.icon || '🔧',
            run: () => window.App && window.App.navigateTo && window.App.navigateTo(t.key),
        }));
    }

    function _clientItems() {
        let history = [];
        try {
            const KEY = window.STORAGE_KEYS && window.STORAGE_KEYS.CLIENT_HISTORY;
            const raw = KEY && localStorage.getItem(KEY);
            if (raw) history = JSON.parse(raw) || [];
        } catch { /* ignore */ }
        return history.slice(0, 30).map(c => {
            const summary = c.data && (c.data.addrCity || c.data.qType) || '';
            return {
                id: 'client:' + c.id,
                label: c.name || 'Unnamed Client',
                hint: ['Client', summary].filter(Boolean).join(' · '),
                icon: '👤',
                run: () => {
                    if (window.App && typeof window.App.loadClientFromHistory === 'function') {
                        window.App.loadClientFromHistory(c.id);
                        if (typeof window.App.navigateTo === 'function') window.App.navigateTo('quoting');
                    }
                },
            };
        });
    }

    function _builtInItems() {
        const items = [
            {
                id: 'action:new-quote',
                label: 'New quote',
                hint: 'Action · Personal Intake — clear current and start fresh',
                icon: '✏️',
                run: () => {
                    // Navigate to intake (no-op if already there) then clear
                    // the active client so the form is genuinely fresh. The
                    // earlier version only navigated and left the previous
                    // client's data on screen.
                    if (window.App && typeof window.App.navigateTo === 'function') {
                        window.App.navigateTo('quoting');
                    }
                    // Defer so the intake plugin's HTML is in the DOM before
                    // startNewClient writes to it (lazy-loaded plugins).
                    setTimeout(() => {
                        if (window.App && typeof window.App.startNewClient === 'function') {
                            window.App.startNewClient();
                        }
                    }, 200);
                },
            },
            {
                id: 'action:phonetic',
                label: 'Phonetic speller',
                hint: 'Action · Spell anything in APCO alphabet (Adam · Boy · Charles…)',
                icon: '📞',
                run: () => {
                    if (window.PhoneticSpeller && typeof window.PhoneticSpeller.open === 'function') {
                        window.PhoneticSpeller.open();
                    }
                },
            },
            {
                id: 'action:add-reminder',
                label: 'Add reminder',
                hint: 'Action · Reminders',
                icon: '⏰',
                run: () => {
                    if (window.App && typeof window.App.navigateTo === 'function') window.App.navigateTo('reminders');
                    // Defer so the reminders plugin loads, then open its modal.
                    setTimeout(() => {
                        if (window.Reminders && typeof window.Reminders.showAdd === 'function') {
                            window.Reminders.showAdd();
                        }
                    }, 250);
                },
            },
            {
                id: 'action:open-activity-log',
                label: 'Open activity log',
                hint: 'Action · See recent saves, syncs, exports',
                icon: '📜',
                run: () => window.ActivityLog && window.ActivityLog.openPanel(),
            },
            {
                id: 'action:toggle-dark-mode',
                label: 'Toggle dark mode',
                hint: 'Action · Theme',
                icon: '🌙',
                run: () => window.App && typeof window.App.toggleDarkMode === 'function' && window.App.toggleDarkMode(),
            },
            {
                id: 'action:home',
                label: 'Go to dashboard',
                hint: 'Action · Home',
                icon: '🏠',
                run: () => window.App && typeof window.App.goHome === 'function' && window.App.goHome(),
            },
            {
                id: 'action:export-files',
                label: 'Export files…',
                hint: 'Action · Pick PDF / EZLynx / HawkSoft / Text',
                icon: '📦',
                run: () => window.App && typeof window.App.openExportPicker === 'function' && window.App.openExportPicker(),
            },
        ];
        // Drop actions whose handler genuinely doesn't exist on this build.
        return items.filter(i => typeof i.run === 'function');
    }

    function _allItems() {
        return [].concat(_builtInItems(), _toolItems(), _registered, _clientItems());
    }

    // ── Filtering / ranking ─────────────────────────────────────────────

    function _filter(query) {
        const items = _allItems();
        if (!query) {
            // Default ordering: built-ins first, tools, custom, clients
            return items.slice(0, 40);
        }
        return items
            .map(item => {
                const labelScore = _score(item.label, query);
                const hintScore = item.hint ? _score(item.hint, query) * 0.5 : 0;
                return { item, score: Math.max(labelScore, hintScore) };
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 40)
            .map(r => r.item);
    }

    // ── Rendering ───────────────────────────────────────────────────────

    let _selectedIndex = 0;
    let _filteredCache = [];

    function _ensurePalette() {
        let p = document.getElementById('altechCmdPalette');
        if (p) return p;

        p = document.createElement('div');
        p.id = 'altechCmdPalette';
        p.setAttribute('role', 'dialog');
        p.setAttribute('aria-label', 'Command palette');
        p.style.cssText = `
            position: fixed; inset: 0; z-index: 10000; display: none;
            background: rgba(0,0,0,0.45); backdrop-filter: blur(4px);
            font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        p.innerHTML = `
            <div id="altechCmdInner" style="position:absolute; top:14vh; left:50%; transform:translateX(-50%); width:min(620px, calc(100vw - 32px)); max-height:60vh; background:var(--bg-card, #fff); color:var(--text, #1c1c1e); border:1px solid var(--border, #ddd); border-radius:14px; box-shadow:0 24px 64px rgba(0,0,0,0.35); overflow:hidden; display:flex; flex-direction:column;">
                <div style="padding:14px 18px; border-bottom:1px solid var(--border, #ddd); display:flex; align-items:center; gap:10px;">
                    <span aria-hidden="true" style="opacity:0.5; font-size:16px;">⌘K</span>
                    <input type="text" id="altechCmdInput"
                           placeholder="Jump to a tool, client, or action…"
                           autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                           aria-label="Command palette search"
                           style="flex:1; background:transparent; border:none; outline:none; font-size:15px; color:inherit;">
                </div>
                <div id="altechCmdResults" role="listbox" aria-label="Suggestions"
                     style="flex:1; overflow-y:auto; padding:4px 0;"></div>
                <div style="padding:8px 14px; border-top:1px solid var(--border, #ddd); font-size:11px; color:var(--text-secondary, #888); display:flex; gap:18px;">
                    <span><kbd style="font-family:inherit; padding:1px 6px; background:var(--bg-input, #eee); border-radius:4px;">↑↓</kbd> navigate</span>
                    <span><kbd style="font-family:inherit; padding:1px 6px; background:var(--bg-input, #eee); border-radius:4px;">Enter</kbd> open</span>
                    <span><kbd style="font-family:inherit; padding:1px 6px; background:var(--bg-input, #eee); border-radius:4px;">Esc</kbd> close</span>
                </div>
            </div>
        `;
        document.body.appendChild(p);

        const input = p.querySelector('#altechCmdInput');
        const results = p.querySelector('#altechCmdResults');

        // Click outside the inner panel closes
        p.addEventListener('click', (e) => {
            const inner = document.getElementById('altechCmdInner');
            if (inner && !inner.contains(e.target)) close();
        });

        // Click on a result runs it
        results.addEventListener('click', (e) => {
            const row = e.target.closest('[data-cmd-idx]');
            if (!row) return;
            const idx = Number(row.dataset.cmdIdx);
            const item = _filteredCache[idx];
            if (item) {
                close();
                try { item.run(); } catch (err) { console.warn('[CommandPalette] run failed:', err); }
            }
        });

        // Hover updates selection (purely visual)
        results.addEventListener('mousemove', (e) => {
            const row = e.target.closest('[data-cmd-idx]');
            if (!row) return;
            const idx = Number(row.dataset.cmdIdx);
            if (idx !== _selectedIndex) {
                _selectedIndex = idx;
                _refreshSelection();
            }
        });

        input.addEventListener('input', _refreshResults);
        input.addEventListener('keydown', _onInputKey);

        return p;
    }

    function _refreshResults() {
        const input = document.getElementById('altechCmdInput');
        const results = document.getElementById('altechCmdResults');
        if (!input || !results) return;
        _filteredCache = _filter(input.value.trim());
        _selectedIndex = 0;
        if (_filteredCache.length === 0) {
            results.innerHTML = `<div style="padding:24px 18px; color:var(--text-secondary, #888); text-align:center;">No matches. Try a tool name (e.g. "compliance"), a client name, or "add reminder".</div>`;
            return;
        }
        results.innerHTML = _filteredCache.map((it, i) => `
            <div role="option" data-cmd-idx="${i}" aria-selected="${i === _selectedIndex}"
                 style="padding:10px 18px; display:flex; align-items:center; gap:12px; cursor:pointer; ${i === _selectedIndex ? 'background:var(--bg-input, rgba(0,122,255,0.08));' : ''}">
                <span style="font-size:18px; width:24px; text-align:center;">${_esc(it.icon || '•')}</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:500;">${_esc(it.label)}</div>
                    ${it.hint ? `<div style="font-size:12px; color:var(--text-secondary, #888); margin-top:1px;">${_esc(it.hint)}</div>` : ''}
                </div>
                ${i === 0 ? `<span style="font-size:11px; color:var(--text-secondary, #888); border:1px solid var(--border, #ddd); padding:2px 6px; border-radius:4px;">Enter</span>` : ''}
            </div>
        `).join('');
    }

    function _refreshSelection() {
        const results = document.getElementById('altechCmdResults');
        if (!results) return;
        results.querySelectorAll('[data-cmd-idx]').forEach((row, i) => {
            const isSelected = i === _selectedIndex;
            row.setAttribute('aria-selected', String(isSelected));
            row.style.background = isSelected ? 'var(--bg-input, rgba(0,122,255,0.08))' : '';
            // Keep the selected row in view
            if (isSelected) {
                const r = row.getBoundingClientRect();
                const c = results.getBoundingClientRect();
                if (r.bottom > c.bottom) row.scrollIntoView({ block: 'nearest' });
                else if (r.top < c.top) row.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    function _onInputKey(e) {
        const max = _filteredCache.length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (max > 0) { _selectedIndex = (_selectedIndex + 1) % max; _refreshSelection(); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (max > 0) { _selectedIndex = (_selectedIndex - 1 + max) % max; _refreshSelection(); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = _filteredCache[_selectedIndex];
            if (item) {
                close();
                try { item.run(); } catch (err) { console.warn('[CommandPalette] run failed:', err); }
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    }

    function open(initialQuery = '') {
        const p = _ensurePalette();
        p.style.display = 'block';
        const input = document.getElementById('altechCmdInput');
        if (input) {
            input.value = initialQuery;
            input.focus();
            input.select();
        }
        _refreshResults();
    }

    function close() {
        const p = document.getElementById('altechCmdPalette');
        if (p) p.style.display = 'none';
    }

    function toggle() {
        const p = document.getElementById('altechCmdPalette');
        if (p && p.style.display === 'block') close();
        else open();
    }

    // ── Global hotkey ───────────────────────────────────────────────────

    function _onGlobalKeydown(e) {
        // Cmd+K (Mac) or Ctrl+K (Windows/Linux) toggles
        const meta = e.metaKey || e.ctrlKey;
        if (meta && e.key.toLowerCase() === 'k') {
            // Don't intercept browser address-bar focus inside contenteditable
            // or password managers. We accept the trade-off that this also fires
            // inside form inputs — that's the expected SPA palette behavior.
            e.preventDefault();
            toggle();
            return;
        }
        // Cmd+/ (or Ctrl+/) opens palette pre-filtered to "Add reminder"
        if (meta && e.key === '/') {
            e.preventDefault();
            open('add reminder');
            return;
        }
    }

    function _wireOnce() {
        if (_wireOnce._done) return;
        _wireOnce._done = true;
        document.addEventListener('keydown', _onGlobalKeydown);
    }

    // Wire as soon as the DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _wireOnce);
    } else {
        _wireOnce();
    }

    window.CommandPalette = { open, close, toggle, register };

    // Expose internals for tests (off the public surface).
    window.CommandPalette._test = { _score, _filter, _allItems };
})();
