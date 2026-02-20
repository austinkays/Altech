// js/app-quotes.js — Client history and quotes/drafts management
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {

    // === CLIENT HISTORY ===
    clientHistoryKey: 'altech_client_history',

    getClientHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.clientHistoryKey)) || [];
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

    saveClient() {
        const snapshot = JSON.parse(JSON.stringify(this.data || {}));
        const firstName = (snapshot.firstName || '').trim();
        const lastName = (snapshot.lastName || '').trim();
        if (!firstName && !lastName) {
            this.toast('⚠️ Enter a client name before saving');
            return;
        }
        const clients = this.getClientHistory();
        const id = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const name = [firstName, lastName].filter(Boolean).join(' ');
        clients.unshift({
            id,
            name,
            summary: this.getClientSummary(snapshot),
            savedAt: new Date().toISOString(),
            data: snapshot
        });
        // Cap at 50 entries
        if (clients.length > 50) clients.length = 50;
        this.saveClientHistory(clients);
        this.renderClientHistory();
        this.toast(`✅ ${name} saved to Client History`);
    },

    loadClientFromHistory(id) {
        const clients = this.getClientHistory();
        const client = clients.find(c => c.id === id);
        if (!client) return;
        this.applyData(client.data);
        // Persist loaded data
        if (this.encryptionEnabled) {
            CryptoHelper.encrypt(this.data).then(encrypted => safeSave(this.storageKey, encrypted));
        } else {
            safeSave(this.storageKey, JSON.stringify(this.data));
        }
        this.toast(`✅ Restored ${client.name}`);
    },

    autoSaveClient() {
        const snapshot = JSON.parse(JSON.stringify(this.data || {}));
        const firstName = (snapshot.firstName || '').trim();
        const lastName = (snapshot.lastName || '').trim();
        if (!firstName && !lastName) return; // No name = nothing to save

        const clients = this.getClientHistory();
        const name = [firstName, lastName].filter(Boolean).join(' ');

        // Dedup: update existing entry if same name + address combo
        const addr = `${snapshot.addrStreet || ''} ${snapshot.addrCity || ''} ${snapshot.addrState || ''}`.trim().toLowerCase();
        const existingIdx = clients.findIndex(c => {
            const cName = (c.name || '').toLowerCase();
            const cAddr = `${c.data.addrStreet || ''} ${c.data.addrCity || ''} ${c.data.addrState || ''}`.trim().toLowerCase();
            return cName === name.toLowerCase() && addr && cAddr === addr;
        });

        if (existingIdx >= 0) {
            // Update existing entry with latest data
            clients[existingIdx].data = snapshot;
            clients[existingIdx].summary = this.getClientSummary(snapshot);
            clients[existingIdx].savedAt = new Date().toISOString();
            // Move to top
            const [updated] = clients.splice(existingIdx, 1);
            clients.unshift(updated);
        } else {
            // New client — add to top
            const id = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            clients.unshift({
                id,
                name,
                summary: this.getClientSummary(snapshot),
                savedAt: new Date().toISOString(),
                data: snapshot
            });
        }

        // Cap at 50 entries
        if (clients.length > 50) clients.length = 50;
        this.saveClientHistory(clients);
        this.renderClientHistory();
        // Schedule cloud sync
        if (typeof CloudSync !== 'undefined') {
            try { CloudSync.schedulePush(); } catch(e) { /* ok */ }
        }
    },

    deleteClientFromHistory(id) {
        const clients = this.getClientHistory();
        const filtered = clients.filter(c => c.id !== id);
        this.saveClientHistory(filtered);
        this.renderClientHistory();
        this.toast('🗑️ Client removed');
        if (typeof CloudSync !== 'undefined') {
            try { CloudSync.schedulePush(); } catch(e) { /* ok */ }
        }
    },

    startFresh() {
        this.data = {};
        this.drivers = [];
        this.vehicles = [];
        // Clear all form inputs
        document.querySelectorAll('#mainContainer input, #mainContainer select, #mainContainer textarea').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = false;
            } else {
                el.value = '';
            }
        });
        // Save empty state
        safeSave(this.storageKey, JSON.stringify(this.data));
        this.handleType();
        this.next();
        this.toast('✨ Fresh form ready');
    },

    renderStep0ClientHistory() {
        const container = document.getElementById('step0ClientHistoryList');
        if (!container) return;
        const clients = this.getClientHistory().slice(0, 5);
        if (!clients.length) {
            container.innerHTML = '<div class="hint" style="text-align:center;padding:12px 0;">No previous clients yet</div>';
            return;
        }
        container.innerHTML = '<div style="font-weight:600;font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Recent Clients</div>' +
            clients.map(c => {
                const date = new Date(c.savedAt).toLocaleDateString();
                const addr = [c.data.addrCity, c.data.addrState].filter(Boolean).join(', ');
                return `<div class="ch-row">
                    <div class="ch-info">
                        <span class="ch-name">${this.escapeHTML(c.name)}</span>
                        <span class="ch-meta">${this.escapeHTML(c.summary)}${addr ? ' • ' + this.escapeHTML(addr) : ''} • ${date}</span>
                    </div>
                    <div class="ch-actions">
                        <button class="btn btn-primary btn-sm" onclick="App.loadClientFromHistory('${c.id}'); App.next();">Restore</button>
                    </div>
                </div>`;
            }).join('');
    },

    renderClientHistory() {
        const container = document.getElementById('clientHistoryList');
        if (!container) return;
        const clients = this.getClientHistory();
        if (!clients.length) {
            container.innerHTML = '<div class="hint" style="text-align:center;padding:24px 0;">No saved clients yet.<br>Clients are saved automatically when you complete the form.</div>';
            return;
        }
        container.innerHTML = clients.map(c => {
            const date = new Date(c.savedAt).toLocaleDateString();
            const addr = [c.data.addrCity, c.data.addrState].filter(Boolean).join(', ');
            return `<div class="ch-row">
                <div class="ch-info">
                    <span class="ch-name">${this.escapeHTML(c.name)}</span>
                    <span class="ch-meta">${this.escapeHTML(c.summary)}${addr ? ' • ' + this.escapeHTML(addr) : ''} • ${date}</span>
                </div>
                <div class="ch-actions">
                    <button class="btn btn-primary btn-sm" onclick="App.loadClientFromHistory('${c.id}')">Restore</button>
                    <button class="btn btn-tertiary btn-sm" onclick="App.deleteClientFromHistory('${c.id}')">✕</button>
                </div>
            </div>`;
        }).join('');
    },

    escapeHTML(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    },

    async getQuotes() {
        const encrypted = localStorage.getItem(this.quotesKey);
        if (!encrypted) return [];
        
        if (this.encryptionEnabled) {
            const decrypted = await CryptoHelper.decrypt(encrypted);
            return decrypted || [];
        } else {
            try { return JSON.parse(encrypted); }
            catch (e) { console.warn('[getQuotes] Corrupt JSON:', e); return []; }
        }
    },

    async saveQuotes(quotes) {
        if (this.encryptionEnabled) {
            const encrypted = await CryptoHelper.encrypt(quotes);
            safeSave(this.quotesKey, encrypted);
        } else {
            safeSave(this.quotesKey, JSON.stringify(quotes));
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
        
        // Check for duplicates based on address
        const address = `${snapshot.addrStreet || ''} ${snapshot.addrCity || ''} ${snapshot.addrState || ''}`.trim().toLowerCase();
        const duplicates = quotes.filter(q => {
            const qAddr = `${q.data.addrStreet || ''} ${q.data.addrCity || ''} ${q.data.addrState || ''}`.trim().toLowerCase();
            return qAddr && address && qAddr === address;
        });
        
        // Show duplicate warning modal if found
        if (duplicates.length > 0) {
            const confirmed = await this.showDuplicateWarning(duplicates);
            if (!confirmed) return; // User canceled
        }
        
        const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        const title = this.getQuoteTitle(snapshot);
        quotes.unshift({ 
            id, 
            title, 
            data: snapshot, 
            updatedAt: new Date().toISOString(),
            starred: false,
            isDuplicate: duplicates.length > 0
        });
        await this.saveQuotes(quotes);
        await this.renderQuoteList();
        this.toast('✅ Draft saved to library');
    },

    async loadQuote(id) {
        const quotes = await this.getQuotes();
        const quote = quotes.find(q => q.id === id);
        if (!quote) return;
        this.applyData(quote.data);
        
        // Save loaded data with encryption
        if (this.encryptionEnabled) {
            const encrypted = await CryptoHelper.encrypt(this.data);
            safeSave(this.storageKey, encrypted);
        } else {
            safeSave(this.storageKey, JSON.stringify(this.data));
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

    startNewDraft() {
        if (!confirm('Start a new draft? Current form will be cleared.')) return;
        localStorage.removeItem(this.storageKey);
        location.reload();
    },

    /**
     * Shows a session dialog when opening the intake tool with existing data.
     * Returns: 'continue' | 'fresh' | 'save-fresh'
     * Disabled: always continues with existing data silently.
     * User can start fresh from the "New Client" button on step 0.
     */
    _showIntakeSessionDialog() {
        return Promise.resolve('continue');
    },

    /** Save current form data as a named draft (used by session dialog) */
    async _saveCurrentAsDraft() {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return;
        let snapshot;
        try { snapshot = JSON.parse(raw); } catch { return; }
        const quotes = await this.getQuotes();
        const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        const title = this.getQuoteTitle(snapshot);
        quotes.unshift({
            id,
            title,
            data: snapshot,
            updatedAt: new Date().toISOString(),
            starred: false
        });
        await this.saveQuotes(quotes);
        this.toast('💾 Previous intake saved as draft');
    },

    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
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
            const qType = q.qType ? q.qType.toUpperCase() : '';
            const dateStr = q.timestamp ? new Date(q.timestamp).toLocaleDateString() : '';
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
                            ${duplicates.map(d => `<li><strong>${this._escapeAttr(d.title)}</strong> - ${new Date(d.updatedAt).toLocaleDateString()}</li>`).join('')}
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
        
        // Copy property data, clear personal info
        const newData = JSON.parse(JSON.stringify(quote.data));
        newData.firstName = '';
        newData.lastName = '';
        newData.email = '';
        newData.phone = '';
        newData.dob = '';
        
        this.data = newData;
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
        if (!window.JSZip) {
            this.toast('⚠️ ZIP export unavailable.');
            return;
        }
        const ids = this.getSelectedQuoteIds();
        if (!ids.length) {
            this.toast('⚠️ Select drafts to export.');
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
