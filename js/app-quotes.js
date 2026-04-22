// js/app-quotes.js — Client history and quotes/drafts management
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {

    // === CLIENT HISTORY ===
    clientHistoryKey: STORAGE_KEYS.CLIENT_HISTORY,

    getClientHistory() {
        try {
            const raw = Utils.tryParseLS(this.clientHistoryKey, []);
            // Stamp _clientId on legacy entries so identity tracking works on records
            // saved before Phase 5. In-memory only; persists on next save.
            for (const c of raw) {
                if (c && c.data && !c.data._clientId) c.data._clientId = c.id;
            }
            return raw;
        } catch (e) {
            console.warn('[ClientHistory] Corrupt JSON:', e);
            return [];
        }
    },

    saveClientHistory(clients) {
        safeSave(this.clientHistoryKey, JSON.stringify(clients));
    },

    getClientSummary(data) {
        const parts = [];
        const qType = (data.qType || '').toLowerCase();
        if (qType === 'home' || qType === 'both') parts.push('Home');
        const vehicleCount = (data.vehicles && data.vehicles.length) || 0;
        if (qType === 'auto' || qType === 'both') {
            parts.push(vehicleCount ? `${vehicleCount} Car${vehicleCount > 1 ? 's' : ''}` : 'Auto');
        }
        return parts.join(', ') || 'Quote';
    },

    _newClientId() {
        return (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `cid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    },

    // Session 1 already guarantees prior record is saved before switch, so the
    // default outcome ("Keep & Switch") is always safe. The modal exists for
    // the rare "I typed into what I thought was a blank form, but it was
    // actually Client A — don't save my accidental edits" case.
    async _confirmSwitch(record /* null for blank form, else {id,data,...} */) {
        if (!this._dirty || !this.activeClientId) {
            await this._switchToClient(record);
            return;
        }
        const first = (this.data.firstName || '').trim();
        const last = (this.data.lastName || '').trim();
        const curName = [first, last].filter(Boolean).join(' ') || 'the current client';
        const choice = await this._promptDirtySwitch(curName);
        if (choice === 'cancel') return;
        if (choice === 'discard') {
            // Wipe the pending edits in memory so _saveActiveRecordNow inside
            // _switchToClient has nothing to flush to the active record.
            // Reload the record's last-saved data from its source so the
            // active record is restored to its pre-edit state.
            try {
                const quotes = await this.getQuotes();
                const src = quotes.find(q => q.id === this.activeClientId);
                if (src) {
                    this.data = JSON.parse(JSON.stringify(src.data));
                    this.data._clientId = this.activeClientId;
                }
            } catch(e) { console.warn('[DirtySwitch] restore-source error:', e); }
            this._dirty = false;
        }
        await this._switchToClient(record);
    },

    _promptDirtySwitch(currentName) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.onclick = (e) => {
                if (e.target === modal) { modal.remove(); resolve('cancel'); }
            };
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <span class="modal-icon">✏️</span>
                        <h2 class="modal-title">Unsaved changes to ${this.escapeHTML(currentName)}</h2>
                    </div>
                    <div class="modal-body">
                        <p>You've made changes that aren't yet written back to this client's saved record.</p>
                        <p style="margin-top:8px;color:var(--text-secondary);font-size:13px;">
                            <strong>Keep &amp; Switch</strong> saves your changes, then loads the other client.<br>
                            <strong>Discard &amp; Switch</strong> reverts this client to their last-saved state and then switches — your recent edits are lost.
                        </p>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn-secondary" id="ds-cancel">Cancel</button>
                        <button class="modal-btn modal-btn-secondary" id="ds-discard">Discard &amp; Switch</button>
                        <button class="modal-btn modal-btn-primary" id="ds-keep">Keep &amp; Switch</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            const close = (choice) => { modal.remove(); resolve(choice); };
            modal.querySelector('#ds-cancel').onclick = () => close('cancel');
            modal.querySelector('#ds-discard').onclick = () => close('discard');
            modal.querySelector('#ds-keep').onclick = () => close('keep');
        });
    },

    saveClient() {
        const snapshot = JSON.parse(JSON.stringify(this.data || {}));
        const firstName = (snapshot.firstName || '').trim();
        const lastName = (snapshot.lastName || '').trim();
        if (!firstName && !lastName) {
            this.toast('⚠️ Enter a client name before saving');
            return;
        }
        const clients = this.getClientHistory();
        // Reuse active id when editing an existing record so manual save-to-history
        // updates the same entry rather than creating a duplicate.
        const id = this.activeClientId || this._newClientId();
        snapshot._clientId = id;
        const name = [firstName, lastName].filter(Boolean).join(' ');
        const existingIdx = clients.findIndex(c => c.id === id);
        const entry = {
            id,
            name,
            summary: this.getClientSummary(snapshot),
            savedAt: new Date().toISOString(),
            data: snapshot
        };
        if (existingIdx >= 0) {
            clients.splice(existingIdx, 1);
        }
        clients.unshift(entry);
        if (clients.length > 50) clients.length = 50;
        this.activeClientId = id;
        this.saveClientHistory(clients);
        this.renderClientHistory();
        this.toast(`✅ ${name} saved to Client History`);
    },

    async loadClientFromHistory(id) {
        const clients = this.getClientHistory();
        const client = clients.find(c => c.id === id);
        if (!client) return;
        await this._confirmSwitch(client);
        if (this.activeClientId !== client.id) return;  // user canceled
        // Persist loaded data to altech_v6 so page reload restores the right client
        if (this.encryptionEnabled) {
            CryptoHelper.encrypt(this.data).then(encrypted => safeSave(this.storageKey, encrypted));
        } else {
            safeSave(this.storageKey, JSON.stringify(this.data));
        }
        this.toast(`✅ Restored ${client.name}`);
    },

    // Cleanup #10 (Phase 5): keyed by _clientId, not name. Two different John
    // Smiths now get two separate records. If the form has no active id yet,
    // generate one on first save-with-name and stamp it — activeClientId becomes
    // the session-stable identity from that point forward.
    autoSaveClient() {
        const firstName = (this.data.firstName || '').trim();
        const lastName = (this.data.lastName || '').trim();
        if (!firstName && !lastName) return; // No name = nothing to save yet

        // Assign a stable id on first meaningful save
        if (!this.activeClientId) {
            this.activeClientId = this._newClientId();
        }
        this.data._clientId = this.activeClientId;

        const snapshot = JSON.parse(JSON.stringify(this.data));
        const name = [firstName, lastName].filter(Boolean).join(' ');
        const clients = this.getClientHistory();

        const entry = {
            id: this.activeClientId,
            name,
            summary: this.getClientSummary(snapshot),
            savedAt: new Date().toISOString(),
            data: snapshot
        };

        const idx = clients.findIndex(c => c.id === this.activeClientId);
        if (idx >= 0) {
            clients.splice(idx, 1);  // pull existing entry …
        }
        clients.unshift(entry);       // … and re-insert at top with fresh timestamp

        if (clients.length > 50) clients.length = 50;
        this.saveClientHistory(clients);
        this.renderClientHistory();
        this.renderStep0ClientHistory();
        // Schedule cloud sync
        if (typeof CloudSync !== 'undefined') {
            try { CloudSync.schedulePush(); } catch(e) { /* ok */ }
        }
    },

    deleteClientFromHistory(id) {
        if (!confirm('Remove this client from recent history?')) return;
        const clients = this.getClientHistory();
        const filtered = clients.filter(c => c.id !== id);
        this.saveClientHistory(filtered);
        this.renderClientHistory();
        this.renderStep0ClientHistory();
        this.toast('🗑 Client removed from history');
        if (typeof CloudSync !== 'undefined') {
            try { CloudSync.schedulePush(); } catch(e) { /* ok */ }
        }
    },

    async startFresh() {
        await this._switchToClient(null);  // persists prior, clears DOM, nulls activeClientId
        safeSave(this.storageKey, JSON.stringify(this.data));
        this.next();
        this.toast('✨ Fresh form ready');
    },

    async startNewClient() {
        await this._switchToClient(null);
        safeSave(this.storageKey, JSON.stringify(this.data));
        this.step = 0;
        this.updateUI();
        this.toast('✅ Client saved — ready for new intake');
    },

    _step0ShowAll: false,

    renderStep0ClientHistory() {
        const container = document.getElementById('step0ClientHistoryList');
        if (!container) return;
        const allClients = this.getClientHistory();
        if (!allClients.length) {
            container.innerHTML = '<div class="hint" style="text-align:center;padding:12px 0;">No previous clients yet</div>';
            return;
        }
        const showAll = this._step0ShowAll;
        const searchTerm = (this._step0Search || '').toLowerCase();
        let filtered = allClients;
        if (searchTerm) {
            filtered = allClients.filter(c => {
                const name = (c.name || '').toLowerCase();
                const addr = [c.data.addrCity, c.data.addrState].filter(Boolean).join(', ').toLowerCase();
                const summary = (c.summary || '').toLowerCase();
                return name.includes(searchTerm) || addr.includes(searchTerm) || summary.includes(searchTerm);
            });
        }
        const displayed = (showAll || searchTerm) ? filtered : filtered.slice(0, 5);
        const totalCount = allClients.length;

        let html = '<div style="font-weight:600;font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Recent Clients <span class="ch-count-label">(' + totalCount + ' saved)</span></div>';

        // Search bar (show when >5 clients or when actively searching)
        if (totalCount > 5 || searchTerm) {
            html += `<div class="ch-search-bar">
                <input type="text" class="ch-search-input" placeholder="Search clients by name, city, or type…" value="${Utils.escapeAttr(this._step0Search || '')}" oninput="App._step0Search=this.value;App.renderStep0ClientHistory();">
            </div>`;
        }

        if (!displayed.length) {
            html += '<div class="ch-no-results">No clients match your search</div>';
        } else {
            const listClass = (showAll || searchTerm) ? 'ch-list-expanded' : '';
            html += `<div class="${listClass}">`;
            html += displayed.map(c => {
                const when = new Date(c.savedAt);
                const dateTime = when.toLocaleDateString() + ' · ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const addr = [c.data.addrCity, c.data.addrState].filter(Boolean).join(', ');
                return `<div class="ch-row">
                    <div class="ch-info">
                        <span class="ch-name">${this.escapeHTML(c.name)}</span>
                        <span class="ch-meta">${this.escapeHTML(c.summary)}${addr ? ' • ' + this.escapeHTML(addr) : ''} • ${dateTime}</span>
                    </div>
                    <div class="ch-actions" style="display:flex;align-items:center;gap:6px;">
                        <button class="btn btn-primary btn-sm" onclick="App.loadClientFromHistory('${c.id}'); App.next();">Restore</button>
                        <button class="ch-delete-btn" title="Delete this client" onclick="App.deleteClientFromHistory('${c.id}')">🗑</button>
                    </div>
                </div>`;
            }).join('');
            html += '</div>';
        }

        // View All / Collapse toggle (only when >5 and not searching)
        if (totalCount > 5 && !searchTerm) {
            if (showAll) {
                html += `<div style="text-align:center;margin-top:8px;"><button class="ch-view-all-btn" onclick="App._step0ShowAll=false;App.renderStep0ClientHistory();">Show Less ▲</button></div>`;
            } else {
                html += `<div style="text-align:center;margin-top:8px;"><button class="ch-view-all-btn" onclick="App._step0ShowAll=true;App.renderStep0ClientHistory();">View All ${totalCount} Clients ▼</button></div>`;
            }
        }

        container.innerHTML = html;
        // Restore cursor position in search input
        if (searchTerm) {
            const input = container.querySelector('.ch-search-input');
            if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
        }
    },

    _step6Search: '',

    renderClientHistory() {
        const container = document.getElementById('clientHistoryList');
        if (!container) return;
        const allClients = this.getClientHistory();
        if (!allClients.length) {
            container.innerHTML = '<div class="hint" style="text-align:center;padding:24px 0;">No saved clients yet.<br>Clients are saved automatically when you complete the form.</div>';
            return;
        }
        const searchTerm = (this._step6Search || '').toLowerCase();
        let filtered = allClients;
        if (searchTerm) {
            filtered = allClients.filter(c => {
                const name = (c.name || '').toLowerCase();
                const addr = [c.data.addrCity, c.data.addrState].filter(Boolean).join(', ').toLowerCase();
                const summary = (c.summary || '').toLowerCase();
                return name.includes(searchTerm) || addr.includes(searchTerm) || summary.includes(searchTerm);
            });
        }

        let html = '';
        // Search bar
        html += `<div class="ch-search-bar">
            <input type="text" class="ch-search-input" placeholder="Search clients by name, city, or type…" value="${Utils.escapeAttr(this._step6Search || '')}" oninput="App._step6Search=this.value;App.renderClientHistory();">
            <span class="ch-count-label">${allClients.length} saved</span>
        </div>`;

        if (!filtered.length) {
            html += '<div class="ch-no-results">No clients match your search</div>';
        } else {
            html += '<div class="ch-list-expanded">';
            html += filtered.map(c => {
                const when = new Date(c.savedAt);
                const dateTime = when.toLocaleDateString() + ' · ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const addr = [c.data.addrCity, c.data.addrState].filter(Boolean).join(', ');
                return `<div class="ch-row">
                    <div class="ch-info">
                        <span class="ch-name">${this.escapeHTML(c.name)}</span>
                        <span class="ch-meta">${this.escapeHTML(c.summary)}${addr ? ' • ' + this.escapeHTML(addr) : ''} • ${dateTime}</span>
                    </div>
                    <div class="ch-actions">
                        <button class="btn btn-primary btn-sm" onclick="App.loadClientFromHistory('${c.id}')">Restore</button>
                        <button class="btn btn-tertiary btn-sm" onclick="App.deleteClientFromHistory('${c.id}')">✕</button>
                    </div>
                </div>`;
            }).join('');
            html += '</div>';
        }

        container.innerHTML = html;
        // Restore cursor position in search input
        if (searchTerm) {
            const input = container.querySelector('.ch-search-input');
            if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
        }
    },

    escapeHTML(str) { return Utils.escapeHTML(str); },

    async getQuotes() {
        const encrypted = localStorage.getItem(this.quotesKey);
        if (!encrypted) return [];

        let quotes;
        if (this.encryptionEnabled) {
            const decrypted = await CryptoHelper.decrypt(encrypted);
            if (!decrypted) {
                // Park the unreadable ciphertext for later recovery rather than
                // letting the next saveQuotes() overwrite it silently.
                if (typeof this._parkCiphertextForRecovery === 'function') {
                    this._parkCiphertextForRecovery(this.quotesKey, encrypted, 'decrypt-returned-null');
                }
                return [];
            }
            quotes = decrypted;
        } else {
            try { quotes = JSON.parse(encrypted); }
            catch (e) { console.warn('[getQuotes] Corrupt JSON:', e); return []; }
        }
        // Stamp _clientId on legacy entries so identity-based lookups work on records
        // saved before Phase 5. In-memory only; persists on next saveQuotes().
        if (Array.isArray(quotes)) {
            for (const q of quotes) {
                if (q && q.data && !q.data._clientId) q.data._clientId = q.id;
            }
        }
        return quotes;
    },

    async saveQuotes(quotes) {
        if (this.encryptionEnabled) {
            const encrypted = await CryptoHelper.encrypt(quotes);
            safeSave(this.quotesKey, encrypted);
        } else {
            safeSave(this.quotesKey, JSON.stringify(quotes));
        }
        // Queue cloud sync so saved drafts propagate across devices
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            try { CloudSync.schedulePush(); } catch (e) { /* ok */ }
        }
    },

    getQuoteTitle(data) {
        const lastName = data.lastName?.trim();
        const firstName = data.firstName?.trim();
        const name = lastName ? `${lastName}, ${firstName || ''}`.trim() : (firstName || `Draft - ${new Date().toLocaleDateString()}`);
        const type = (data.qType || 'quote').toUpperCase();
        return `${name} • ${type}`;
    },

    getQuoteMeta(quote) {
        const updated = new Date(quote.updatedAt).toLocaleString();
        return `Updated ${updated}`;
    },

    async autoSaveCurrentQuote() {
        const snapshot = JSON.parse(JSON.stringify(this.data || {}));
        const quotes = await this.getQuotes();
        const autoId = 'current_draft';
        
        // Remove any existing auto-saved draft
        const filtered = quotes.filter(q => q.id !== autoId);
        
        // Add current data as auto-selected draft at top
        const baseTitle = this.getQuoteTitle(snapshot);
        const title = `${baseTitle} (Current Draft)`;
        filtered.unshift({ id: autoId, title, data: snapshot, updatedAt: new Date().toISOString() });
        await this.saveQuotes(filtered);
        this.selectedQuoteIds.add(autoId);
        await this.renderQuoteList();
        
        // Auto-select the current draft
        setTimeout(() => {
            const checkbox = document.querySelector(`.quote-checkbox[data-id="${autoId}"]`);
            if (checkbox) checkbox.checked = true;
        }, 50);
    },

    async saveQuote() {
        const snapshot = JSON.parse(JSON.stringify(this.data || {}));
        const quotes = await this.getQuotes();

        // If we're editing an existing record, update in place — no duplicate warning,
        // no new entry. Save-button during an edit should never fork identity.
        if (this.activeClientId) {
            const idx = quotes.findIndex(q => q.id === this.activeClientId);
            if (idx >= 0) {
                snapshot._clientId = this.activeClientId;
                quotes[idx].data = snapshot;
                quotes[idx].title = this.getQuoteTitle(snapshot);
                quotes[idx].updatedAt = new Date().toISOString();
                await this.saveQuotes(quotes);
                await this.renderQuoteList();
                this.toast('✅ Draft updated');
                return;
            }
            // activeClientId set but no matching quote — fall through to create fresh
        }

        // New record path: check for address duplicates and create a new entry.
        const address = `${snapshot.addrStreet || ''} ${snapshot.addrCity || ''} ${snapshot.addrState || ''}`.trim().toLowerCase();
        const duplicates = quotes.filter(q => {
            const qAddr = `${q.data.addrStreet || ''} ${q.data.addrCity || ''} ${q.data.addrState || ''}`.trim().toLowerCase();
            return qAddr && address && qAddr === address;
        });

        if (duplicates.length > 0) {
            const confirmed = await this.showDuplicateWarning(duplicates);
            if (!confirmed) return;
        }

        const id = this._newClientId();
        snapshot._clientId = id;
        const title = this.getQuoteTitle(snapshot);
        quotes.unshift({
            id,
            title,
            data: snapshot,
            updatedAt: new Date().toISOString(),
            starred: false,
            isDuplicate: duplicates.length > 0
        });
        this.activeClientId = id;  // future edits go back to this record
        this.data._clientId = id;  // keep App.data in sync with the new identity
        await this.saveQuotes(quotes);
        await this.renderQuoteList();
        this.toast('✅ Draft saved to library');
    },

    async loadQuote(id) {
        const quotes = await this.getQuotes();
        const quote = quotes.find(q => q.id === id);
        if (!quote) return;
        await this._confirmSwitch(quote);
        if (this.activeClientId !== quote.id) return;  // user canceled from the modal

        // Save loaded data with encryption so page reload restores this client
        if (this.encryptionEnabled) {
            const encrypted = await CryptoHelper.encrypt(this.data);
            safeSave(this.storageKey, encrypted);
        } else {
            safeSave(this.storageKey, JSON.stringify(this.data));
        }
        // Queue cloud sync so the loaded form propagates across devices
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            try { CloudSync.schedulePush(); } catch (e) { /* ok */ }
        }
        this.toast('✅ Draft loaded');
    },

    async deleteQuote(id) {
        const quotes = await this.getQuotes();
        const filtered = quotes.filter(q => q.id !== id);
        await this.saveQuotes(filtered);
        this.selectedQuoteIds.delete(id);
        await this.renderQuoteList();
        this.toast('🗑️ Draft removed');
    },

    async renameQuote(id) {
        const quotes = await this.getQuotes();
        const quote = quotes.find(q => q.id === id);
        if (!quote) return;
        const next = prompt('Rename draft', quote.title);
        if (next === null) return;
        quote.title = next.trim() || quote.title;
        quote.updatedAt = new Date().toISOString();
        await this.saveQuotes(quotes);
        await this.renderQuoteList();
    },

    // Cleanup #12 (Phase 5): replaced location.reload() with in-place switch.
    // Prior edits auto-persist to their record before we wipe the form.
    async startNewDraft() {
        if (!confirm('Start a new draft? Current form will be cleared.')) return;
        await this._switchToClient(null);
        localStorage.removeItem(this.storageKey);
        this.toast('✨ New draft started');
    },

    clearAllDrafts() {
        if (!confirm('Clear all saved drafts?')) return;
        localStorage.removeItem(this.quotesKey);
        this.selectedQuoteIds.clear();
        this.renderQuoteList();
        this.toast('🧹 Drafts cleared');
    },

    async renderQuoteList() {
        const list = document.getElementById('quoteList');
        if (!list) return;
        list.innerHTML = '';
        const quotes = await this.getQuotes();
        if (!quotes.length) {
            const empty = document.createElement('div');
            empty.className = 'hint';
            empty.textContent = 'No drafts saved yet. Click "Save Draft" to create one.';
            list.appendChild(empty);
            return;
        }
        quotes.forEach(q => {
            const row = document.createElement('div');
            row.className = 'quote-card';
            row.setAttribute('data-quote-id', q.id);
            const addr = `${q.data.addrStreet || ''} ${q.data.addrCity || ''} ${q.data.addrState || ''}`.trim();
            row.setAttribute('data-search-text', `${q.title} ${addr} ${this.getQuoteMeta(q)}`);

            // Header with name and star
            const header = document.createElement('div');
            header.className = 'quote-card-header';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'quote-checkbox';
            checkbox.dataset.id = q.id;
            checkbox.checked = this.selectedQuoteIds.has(q.id);
            checkbox.onchange = () => {
                if (checkbox.checked) {
                    this.selectedQuoteIds.add(q.id);
                } else {
                    this.selectedQuoteIds.delete(q.id);
                }
            };
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'quote-name';
            nameSpan.textContent = q.title;
            
            const starBtn = document.createElement('button');
            starBtn.className = 'quote-star';
            starBtn.textContent = q.starred ? '⭐' : '☆';
            starBtn.title = q.starred ? 'Remove from favorites' : 'Add to favorites';
            starBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleQuoteStar(q.id);
            };
            
            if (q.starred) row.classList.add('starred');
            
            header.appendChild(nameSpan);
            header.appendChild(starBtn);
            header.prepend(checkbox);

            // Stats
            const stats = document.createElement('div');
            stats.className = 'quote-stats';
            const statsText = this.getQuoteStats(q);
            stats.innerHTML = statsText;

            // Actions
            const actions = document.createElement('div');
            actions.className = 'quote-actions';

            const loadBtn = document.createElement('button');
            loadBtn.className = 'quote-action-btn';
            loadBtn.textContent = '📥 Load';
            loadBtn.onclick = () => this.loadQuote(q.id);

            const dupBtn = document.createElement('button');
            dupBtn.className = 'quote-action-btn';
            dupBtn.textContent = '📋 Copy';
            dupBtn.onclick = () => this.duplicateQuote(q.id);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'quote-action-btn delete';
            deleteBtn.textContent = '🗑️ Delete';
            deleteBtn.onclick = () => this.deleteQuote(q.id);

            actions.appendChild(loadBtn);
            actions.appendChild(dupBtn);
            actions.appendChild(deleteBtn);

            row.appendChild(header);
            row.appendChild(stats);
            row.appendChild(actions);
            list.appendChild(row);
        });

        // Also update Quick Start drafts panel
        this.renderQuickStartDrafts(quotes);
    },

    renderQuickStartDrafts(quotes) {
        const card = document.getElementById('quickStartDraftsCard');
        const container = document.getElementById('quickStartDraftList');
        if (!card || !container) return;
        if (!quotes || !quotes.length) {
            card.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        card.style.display = '';
        container.innerHTML = '';
        quotes.slice(0, 10).forEach(q => {
            const row = document.createElement('div');
            row.className = 'qs-draft-row';
            row.onclick = () => this.loadQuote(q.id);

            const info = document.createElement('div');
            info.className = 'qs-draft-info';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'qs-draft-name';
            nameSpan.textContent = q.title;
            info.appendChild(nameSpan);
            const meta = document.createElement('span');
            meta.className = 'qs-draft-meta';
            const qType = q.data?.qType ? q.data.qType.toUpperCase() : '';
            const dateStr = q.updatedAt ? new Date(q.updatedAt).toLocaleDateString() : '';
            meta.textContent = [qType, dateStr].filter(Boolean).join(' · ');
            info.appendChild(meta);

            const delBtn = document.createElement('button');
            delBtn.className = 'qs-draft-delete';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete draft';
            delBtn.onclick = (e) => { e.stopPropagation(); if (confirm('Delete "' + q.title + '"?')) this.deleteQuote(q.id); };

            row.appendChild(info);
            row.appendChild(delBtn);
            container.appendChild(row);
        });
    },

    filterQuotes(searchTerm) {
        const term = (searchTerm || '').toLowerCase();
        const cards = document.querySelectorAll('[data-quote-id]');
        cards.forEach(card => {
            const text = (card.getAttribute('data-search-text') || '').toLowerCase();
            card.style.display = text.includes(term) ? '' : 'none';
        });
    },

    selectAllQuotes() {
        this.getQuotes().then(quotes => {
            this.selectedQuoteIds = new Set(quotes.map(q => q.id));
            this.renderQuoteList();
            this.toast('✅ All drafts selected');
        });
    },

    clearQuoteSelection() {
        this.selectedQuoteIds.clear();
        this.renderQuoteList();
        this.toast('✖ Selection cleared');
    },
    
    async toggleQuoteStar(quoteId) {
        const quotes = await this.getQuotes();
        const quote = quotes.find(q => q.id === quoteId);
        if (!quote) return;
        quote.starred = !quote.starred;
        quote.updatedAt = new Date().toISOString();
        await this.saveQuotes(quotes);
        await this.renderQuoteList();
        this.toast(quote.starred ? '⭐ Added to favorites' : '☆ Removed from favorites');
    },
    
    showDuplicateWarning(duplicates) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(false);
                }
            };
            
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <span class="modal-icon">⚠️</span>
                        <h2 class="modal-title">Possible Duplicate</h2>
                    </div>
                    <div class="modal-body">
                        <p>We found ${duplicates.length} similar quote(s) for this address:</p>
                        <ul style="margin: 12px 0; padding-left: 20px;">
                            ${duplicates.map(d => `<li><strong>${this.escapeHTML(d.title)}</strong> - ${new Date(d.updatedAt).toLocaleDateString()}</li>`).join('')}
                        </ul>
                        <p>Do you want to save this as a new quote anyway?</p>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn-secondary" id="dup-cancel-btn">Cancel</button>
                        <button class="modal-btn modal-btn-primary" id="dup-save-btn">Save Anyway</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            modal.querySelector('#dup-cancel-btn').addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });
            modal.querySelector('#dup-save-btn').addEventListener('click', () => {
                modal.remove();
                resolve(true);
            });
        });
    },
    
    async duplicateQuote(quoteId) {
        const quotes = await this.getQuotes();
        const quote = quotes.find(q => q.id === quoteId);
        if (!quote) return;

        // Check for duplicate addresses
        const copiedAddr = `${quote.data.addrStreet || ''} ${quote.data.addrCity || ''}`.trim();
        const hasDuplicate = quotes.some(q => q.id !== quoteId &&
            `${q.data.addrStreet || ''} ${q.data.addrCity || ''}`.trim() === copiedAddr &&
            copiedAddr);

        if (hasDuplicate && !confirm('⚠️ A quote with this address already exists. Continue copying?')) {
            return;
        }

        // Copy property data, clear personal info AND the original's identity.
        // Route through _switchToClient with a null-id record so the next save
        // creates a new entry rather than overwriting the source quote.
        const newData = JSON.parse(JSON.stringify(quote.data));
        newData.firstName = '';
        newData.lastName = '';
        newData.email = '';
        newData.phone = '';
        newData.dob = '';
        delete newData._clientId;  // critical: strip source identity so copy is a fresh record

        await this._switchToClient({ id: null, data: newData });
        this.save();
        this.updateUI();
        this.renderQuoteList();
        this.toast('📋 Draft copied! (personal info cleared)');
    },
    
    getQuoteStats(q) {
        const d = q.data || {};
            const badges = [];
        
            // Coverage type badge
            if (d.qType) {
                const typeClass = d.qType === 'home' ? 'badge-home' : (d.qType === 'auto' ? 'badge-auto' : 'badge-both');
                badges.push(`<span class="quote-badge ${typeClass}">${d.qType.toUpperCase()}</span>`);
            }
        
            // Duplicate indicator
            if (q.isDuplicate) {
                badges.push(`<span class="quote-badge badge-duplicate">⚠️ DUPLICATE</span>`);
            }
        
            // Multi-driver/vehicle badges
            if (d.drivers && d.drivers.length > 0) {
                badges.push(`<span class="quote-badge" style="background: rgba(142, 142, 147, 0.12); color: #636366;">👤 ${d.drivers.length} driver${d.drivers.length > 1 ? 's' : ''}</span>`);
            }
            if (d.vehicles && d.vehicles.length > 0) {
                badges.push(`<span class="quote-badge" style="background: rgba(142, 142, 147, 0.12); color: #636366;">🚗 ${d.vehicles.length} vehicle${d.vehicles.length > 1 ? 's' : ''}</span>`);
            }
        
            // Property/location info
            const details = [];
            if (d.addrCity && d.addrState) details.push(`📍 ${d.addrCity}, ${d.addrState}`);
            if (d.yrBuilt) details.push(`🏠 ${d.yrBuilt}`);
        
        const updatedTime = new Date(q.updatedAt || q.timestamp).toLocaleDateString();
            details.push(`🕐 ${updatedTime}`);
        
            return badges.join('') + '<br><span style="font-size: 12px; color: var(--text-secondary);">' + details.join(' • ') + '</span>';
    },

    getSelectedQuoteIds() {
        if (this.selectedQuoteIds && this.selectedQuoteIds.size) {
            return Array.from(this.selectedQuoteIds);
        }
        return Array.from(document.querySelectorAll('.quote-checkbox:checked'))
            .map(cb => cb.dataset.id);
    },

    sanitizeFilename(name) {
        return name.replace(/[^a-z0-9\-_. ]/gi, '').replace(/\s+/g, '_').slice(0, 80) || 'quote';
    },

    async exportSelectedZip() {
        const ids = this.getSelectedQuoteIds();
        if (!ids.length) {
            this.toast('⚠️ Select drafts to export.');
            return;
        }
        try {
            await window.PDFLibs.ensure('jszip');
        } catch (e) {
            this.toast('⚠️ ZIP library failed to load — check your internet connection.');
            return;
        }
        const quotes = (await this.getQuotes()).filter(q => ids.includes(q.id));
        const zip = new JSZip();
        const errors = [];

        for (const q of quotes) {
            const folderName = this.sanitizeFilename(q.title);
            const folder = zip.folder(folderName);

            // Auto XML
            const qType = q.qType || q.data?.qType || 'both';
            if (qType === 'auto' || qType === 'both') {
                const xml = this.buildXML(q.data);
                if (xml.ok) {
                    folder.file(xml.filename, xml.content);
                } else {
                    errors.push(`${q.title}: Auto XML - ${xml.error.replace('⚠️ ', '')}`);
                }
            }

            // Home XML
            if (qType === 'home' || qType === 'both') {
                const homeXml = this.buildHomeXML(q.data);
                if (homeXml.ok) {
                    folder.file(homeXml.filename, homeXml.content);
                } else {
                    errors.push(`${q.title}: Home XML - ${homeXml.error.replace('⚠️ ', '')}`);
                }
            }

            const cmsmtf = this.buildCMSMTF(q.data);
            folder.file(cmsmtf.filename, cmsmtf.content);

            const csv = this.buildCSV(q.data);
            folder.file(csv.filename, csv.content);

            const pdf = await this.buildPDF(q.data);
            folder.file(pdf.filename, pdf.blob);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipName = `Altech_Quotes_${new Date().toISOString().split('T')[0]}.zip`;
        this.downloadBlob(zipBlob, zipName);

        if (errors.length) {
            this.toast('⚠️ Some XML exports were skipped.');
            console.warn('ZIP export warnings:', errors);
        } else {
            this.toast('📦 ZIP downloaded');
        }
    },

    async exportAllZip() {
        const quotes = await this.getQuotes();
        if (!quotes.length) {
            this.toast('⚠️ No drafts to export.');
            return;
        }
        this.selectedQuoteIds = new Set(quotes.map(q => q.id));
        await this.renderQuoteList();
        await this.exportSelectedZip();
    },
    
    reset() {
        if(confirm("Delete all data and start over?")) {
            localStorage.removeItem(this.storageKey);
            location.reload();
        }
    },

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1]; // Remove data:application/zip;base64, prefix
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

});
