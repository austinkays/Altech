// js/app-core.js — Core application logic (init, navigation, wizard, save/load, utilities)
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

// Validation module lives in app-validation.js (window-scoped const).

Object.assign(App, {
    // ── Initialization & Setup ──
    async init() {
        console.log('[App.init] Starting...');
        try {
        // Load dark mode preference
        this.loadDarkMode();

        // Detect Tauri desktop environment
        this.isDesktop = !!(window.__TAURI__ || window.__TAURI_IPC__);

        try { await this.load(); } catch(e) { console.error('[App.init] load() failed:', e); }
        try { await this.loadDocIntelResults(); } catch(e) { console.error('[App.init] loadDocIntelResults() failed:', e); }
        try { await this.loadDriversVehicles(); } catch(e) { console.error('[App.init] loadDriversVehicles() failed:', e); }
        this.handleType(); // Set initial flow — MUST run
        console.log('[App.init] handleType done, flow:', this.flow, 'step:', this.step);
        this.updateScanCoverage();
        this.calculateResidenceTime(); // Show residence time if purchaseDate loaded
        this.togglePreviousAddress(this.data.yearsAtAddress || ''); // Restore conditional previous address block
        try { await this.renderQuoteList(); } catch(e) { console.error('[App.init] renderQuoteList() failed:', e); }
        try { this.renderClientHistory(); } catch(e) { console.error('[App.init] renderClientHistory() failed:', e); }

        // Resolve Gemini API key for local scanning
        if (!this._geminiApiKey) {
            const savedKey = localStorage.getItem('gemini_api_key');
            if (savedKey) {
                this._geminiApiKey = savedKey;
            }
            // Key must be set via localStorage('gemini_api_key') or server env var.
            // No longer falls back to api/config.json (security: never serve keys as static files).
        }

        // Desktop-specific branding
        if (this.isDesktop) {
            document.body.classList.add('tauri-desktop');
            const brand = document.querySelector('.logo > span:last-child');
            if (brand) {
                brand.textContent = 'PolicyPilot';
                const badge = document.createElement('span');
                badge.className = 'desktop-badge';
                badge.textContent = 'Desktop';
                brand.appendChild(badge);
            }

            // Show scan drop zone in Step 0
            const scanDrop = document.getElementById('scanDropZone');
            if (scanDrop) {
                scanDrop.style.display = '';
                scanDrop.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; scanDrop.classList.add('drag-over'); });
                scanDrop.addEventListener('dragleave', () => scanDrop.classList.remove('drag-over'));
                scanDrop.addEventListener('drop', (e) => { e.preventDefault(); scanDrop.classList.remove('drag-over'); });
                scanDrop.addEventListener('click', () => this.openScanPicker());
            }
            // Tauri native drag-drop listener for Step 0 policy scan
            if (window.__TAURI__?.event?.listen) {
                window.__TAURI__.event.listen('tauri://drag-drop', async (event) => {
                    // Only handle if Step 0 is active
                    const step0 = document.getElementById('step-0');
                    if (!step0 || step0.style.display === 'none' || step0.classList.contains('hidden')) return;

                    const paths = event.payload?.paths;
                    if (!paths?.length) return;

                    const status = document.getElementById('scanStatus');
                    if (status) { status.classList.remove('hidden'); status.textContent = '⏳ Processing dropped file...'; }

                    for (const filePath of paths) {
                        const fileName = filePath.split('\\').pop().split('/').pop();
                        console.log('[Step0 Drop] Processing:', fileName);

                        // Route XML files to the EZLynx import pipeline
                        if (fileName.toLowerCase().endsWith('.xml')) {
                            try {
                                const bytes = await window.__TAURI__.fs.readFile(filePath);
                                const xmlText = new TextDecoder().decode(bytes);
                                this._parseAndApplyXML(xmlText);
                            } catch (err) {
                                console.error('[Step0 Drop] XML read error:', err);
                                if (status) status.textContent = `⚠️ ${err.message || err}`;
                            }
                            continue;
                        }

                        try {
                            const text = await window.__TAURI__.core.invoke('process_policy_file', { filePath });
                            if (text && !text.startsWith('Error:') && !text.startsWith('Execution failed:')) {
                                // Create a fake File object with the extracted text for processScan to handle
                                // For images/PDFs dropped via Tauri, we use direct Gemini with the raw file
                                const ext = fileName.split('.').pop().toLowerCase();
                                if (['pdf'].includes(ext)) {
                                    // PDF: text was extracted by Python — show it and auto-scan if Gemini key available
                                    if (status) status.textContent = `✅ Extracted ${text.length} chars from ${fileName}. Processing with AI...`;
                                    // Use text directly — feed to Gemini for structured extraction
                                    await this.processScanFromText(text, fileName);
                                } else {
                                    if (status) status.textContent = `✅ ${fileName} processed (${text.length} chars)`;
                                }
                                this.toast(`✅ ${fileName} processed`);
                            } else {
                                if (status) status.textContent = `⚠️ Could not extract text from ${fileName}`;
                            }
                        } catch (err) {
                            console.error('[Step0 Drop] Error:', err);
                            if (status) status.textContent = `⚠️ ${err.message || err}`;
                        }
                    }
                });
            }
        }

        // Browser (non-Tauri): also show scan drop zone on desktop browsers
        if (!this.isDesktop) {
            const scanDrop = document.getElementById('scanDropZone');
            if (scanDrop && window.matchMedia('(pointer: fine)').matches) {
                scanDrop.style.display = '';
                scanDrop.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; scanDrop.classList.add('drag-over'); });
                scanDrop.addEventListener('dragleave', () => scanDrop.classList.remove('drag-over'));
                scanDrop.addEventListener('drop', (e) => {
                    e.preventDefault();
                    scanDrop.classList.remove('drag-over');
                    if (e.dataTransfer?.files?.length) {
                        const file = e.dataTransfer.files[0];
                        // Route XML files to the EZLynx import pipeline
                        if (file.name.toLowerCase().endsWith('.xml')) {
                            this._handleEZLynxXMLFile(file);
                            return;
                        }
                        // Feed other files into the existing scan pipeline
                        this.handleScanFiles({ target: { files: e.dataTransfer.files } });
                    }
                });
                scanDrop.addEventListener('click', () => this.openScanPicker());
            }
        }

        const scanInput = document.getElementById('policyScanInput');
        if (scanInput) {
            scanInput.addEventListener('change', (e) => this.handleScanFiles(e));
        }

        const docIntelInput = document.getElementById('docIntelInput');
        if (docIntelInput) {
            docIntelInput.addEventListener('change', (e) => this.handleDocIntelFiles(e));
        }

        const ezlynxXmlInput = document.getElementById('ezlynxXmlInput');
        if (ezlynxXmlInput) {
            ezlynxXmlInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) this._handleEZLynxXMLFile(e.target.files[0]);
            });
        }
        
        // Auto-save listeners — use event delegation (one listener, not 200+)
        document.body.addEventListener('input', (e) => {
            if (e.target.matches('#quotingTool input, #quotingTool select, #quotingTool textarea')) {
                this.clearAutoFilledIndicator(e.target);
                this.save(e);
                if ((e.target.id === 'firstName' || e.target.id === 'lastName') &&
                    typeof DashboardWidgets !== 'undefined') {
                    DashboardWidgets.refreshBreadcrumb();
                }
            }
        });
        document.body.addEventListener('change', (e) => {
            if (e.target.matches('#quotingTool input, #quotingTool select, #quotingTool textarea')) {
                this.clearAutoFilledIndicator(e.target);
                this.save(e);
                // Show/hide "please specify" input when "Other" is selected in a dropdown
                if (e.target.tagName === 'SELECT') {
                    if (e.target.value === 'Other') {
                        this._showOtherField(e.target);
                    } else {
                        this._hideOtherField(e.target);
                    }
                }
            }
        });

        // Carrier autocomplete
        this.initCarrierAutocomplete();

        // Dynamic occupation dropdown — populate based on industry selection
        this._initOccupationDropdown();

        // Sync "Same as Home Carrier" when home carrier changes
        const _homeCarrierInput = document.getElementById('homePriorCarrier');
        if (_homeCarrierInput) {
            _homeCarrierInput.addEventListener('change', () => {
                const cb = document.getElementById('sameAsHomeCarrier');
                if (cb && cb.checked) this.handleSameCarrier();
            });
        }

        // Restore sameAsHomeCarrier checkbox state from data
        const _sameCarrierCb = document.getElementById('sameAsHomeCarrier');
        if (_sameCarrierCb && this.data.sameAsHomeCarrier) {
            _sameCarrierCb.checked = true;
            this.handleSameCarrier();
        }

        // Validate years with carrier vs continuous coverage
        const _priorYearsEl = document.getElementById('priorYears');
        const _contCovEl = document.getElementById('continuousCoverage');
        if (_priorYearsEl) _priorYearsEl.addEventListener('change', () => this.validatePriorYearsCoverage());
        if (_contCovEl) _contCovEl.addEventListener('change', () => this.validatePriorYearsCoverage());
        document.body.addEventListener('blur', (e) => {
            if (!e.target.matches('#quotingTool input, #quotingTool select, #quotingTool textarea')) return;
            if (typeof Validation === 'undefined') return;
            const id = e.target.id;
            
            // Field-specific validation
            let result;
            switch(id) {
                case 'email':
                        result = Validation.email(e.target.value);
                        break;
                    case 'phone':
                        result = Validation.phone(e.target.value);
                        break;
                    case 'dob':
                        result = Validation.dob(e.target.value);
                        break;
                    case 'addrState':
                        result = Validation.stateCode(e.target.value);
                        break;
                    case 'addrZip':
                        result = Validation.zipCode(e.target.value);
                        break;
                    case 'yrBuilt':
                    case 'roofYr':
                    case 'heatYr':
                        result = Validation.year(e.target.value, 'Year');
                        break;
                    case 'firstName':
                    case 'lastName':
                        result = Validation.required(e.target.value, e.target.previousElementSibling?.textContent || 'This field');
                        break;
                }
                
                if (result) {
                    if (result.valid) {
                        Validation.clearError(id);
                    } else {
                        Validation.showError(id, result.message);
                    }
                }
        }, true); // capture phase for blur
        // Phone format
        const phoneEl = document.getElementById('phone');
        if (phoneEl) phoneEl.addEventListener('input', this.fmtPhone);
        const coPhone = document.getElementById('coPhone');
        if (coPhone) coPhone.addEventListener('input', this.fmtPhone);

        // Segmented control click handler
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('.seg-btn');
            if (!btn) return;
            const group = btn.closest('.seg-group');
            if (!group) return;
            const fieldId = group.dataset.field;
            const hidden = document.getElementById(fieldId);
            if (!hidden) return;
            group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('seg-active'));
            btn.classList.add('seg-active');
            hidden.value = btn.dataset.value;
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // iOS toggle switch handler
        document.body.addEventListener('change', (e) => {
            const toggle = e.target.closest('[data-toggle-field]');
            if (!toggle) return;
            const fieldId = toggle.dataset.toggleField;
            const hidden = document.getElementById(fieldId);
            if (!hidden) return;
            hidden.value = toggle.checked ? 'Yes' : '';
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Secondary heating progressive disclosure.
        // When the user unchecks, clear the hidden select + persisted value so the PDF
        // doesn't print a stale "Secondary Heat: Wood" after the toggle is turned off.
        const secHeatCheck = document.getElementById('hasSecondaryHeating');
        const secHeatWrap = document.getElementById('secondaryHeatingWrapper');
        if (secHeatCheck && secHeatWrap) {
            secHeatCheck.addEventListener('change', () => {
                const on = secHeatCheck.checked;
                secHeatWrap.classList.toggle('disclosure-hidden', !on);
                if (!on) {
                    const sel = document.getElementById('secondaryHeating');
                    if (sel) sel.value = '';
                    this.data.secondaryHeating = '';
                    this.save({});
                }
            });
        }

        // Earthquake coverage progressive disclosure
        const eqWrap = document.getElementById('earthquakeDetailsWrapper');
        if (eqWrap) {
            document.body.addEventListener('change', (e) => {
                const toggle = e.target.closest('[data-toggle-field="earthquakeCoverage"]');
                if (!toggle) return;
                eqWrap.classList.toggle('disclosure-hidden', !toggle.checked);
            });
        }

        // Dwelling Usage → primary home address progressive disclosure
        document.body.addEventListener('change', (e) => {
            if (e.target.id === 'dwellingUsage') {
                this.updatePrimaryHomeSection(e.target.value);
            }
        });

        // Map previews: update when address fields change (guard: app-property.js may not be loaded)
        if (typeof this.scheduleMapPreviewUpdate === 'function') {
            ['addrStreet', 'addrCity', 'addrState', 'addrZip'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', () => this.scheduleMapPreviewUpdate());
                    el.addEventListener('change', () => this.scheduleMapPreviewUpdate());
                }
            });
        }

        // Initial preview render if address already exists
        if (typeof this.updateMapPreviews === 'function') {
            this.updateMapPreviews();
        }

        this.initialized = true;
        console.log('[App.init] Complete. flow:', this.flow.length, 'steps');
        } catch(initErr) {
            console.error('[App.init] FATAL ERROR:', initErr);
            // Ensure flow is set even if init fails
            if (!this.flow || this.flow.length === 0) {
                this.handleType();
            }
            this.initialized = true;
        }
    },

    // Centralized Gemini API key retrieval — use this everywhere
    // Now checks AIProvider first, then falls back to legacy key chain

    setFieldValue(id, value, options = {}) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value || '';
        this.data[id] = el.value;
        this.save();

        if (options.autoFilled) {
            this.markAutoFilled(el, options.source || 'scan');
        }

        if (id === 'vin') {
            this.decodeVin(el);
        }
    },

    markAutoFilled(el, source) {
        if (!el) return;
        el.classList.add('auto-filled');
        if (source) {
            el.dataset.autoFilledSource = source;
        }
    },

    clearAutoFilledIndicator(el) {
        if (!el || !el.classList) return;
        if (el.classList.contains('auto-filled')) {
            el.classList.remove('auto-filled');
            delete el.dataset.autoFilledSource;
        }
    },


    // ── Wizard Step Control ──
    handleType() {
        const t = document.querySelector('input[name="qType"]:checked')?.value || 'both';
        const prevFlow = this.flow || [];
        this.flow = this.workflows[t];
        
        // Clear data for steps excluded from the new workflow
        // (prevents stale home data leaking into auto-only quotes, etc.)
        const allSteps = this.workflows.both; // superset of all steps
        const excludedSteps = allSteps.filter(s => !this.flow.includes(s));
        excludedSteps.forEach(stepId => {
            const stepEl = document.getElementById(stepId);
            if (!stepEl) return;
            stepEl.querySelectorAll('input, select, textarea').forEach(el => {
                if (!el.id || el.type === 'radio' || el.type === 'hidden' || el.type === 'file') return;
                if (el.type === 'checkbox') {
                    el.checked = false;
                    delete this.data[el.id];
                } else {
                    el.value = '';
                    delete this.data[el.id];
                }
            });
            // Clear drivers/vehicles arrays when step-4 (auto) is excluded
            if (stepId === 'step-4') {
                this.drivers = [];
                this.vehicles = [];
                delete this.data.drivers;
                delete this.data.vehicles;
                const driverList = document.getElementById('driversList');
                const vehicleList = document.getElementById('vehiclesList');
                if (driverList) driverList.innerHTML = '';
                if (vehicleList) vehicleList.innerHTML = '';
            }
        });

        // Auto-set multiPolicy = 'yes' when quoting both auto and home.
        // This pre-populates the Package Discount toggle in EZLynx without
        // requiring manual entry in the intake form.
        const multiPolicyEl = document.getElementById('multiPolicy');
        if (multiPolicyEl) {
            const mpVal = t === 'both' ? 'yes' : '';
            multiPolicyEl.value = mpVal;
            this.data.multiPolicy = mpVal;
        }

        // Reset step if out of bounds
        if (this.step >= this.flow.length) this.step = 0;
        this.updateUI();
        this.save({ target: document.querySelector('input[name="qType"]:checked') });
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Client identity + session isolation
    //
    // activeClientId is the wrapper id of the record currently being edited. It
    // is the single source of truth for "which client is this form for?" — set
    // by applyData from data._clientId, cleared on startFresh / startNewClient.
    // When set, every nav / beforeunload / manual save propagates the live form
    // back to the matching record in altech_v6_quotes (see _saveActiveRecordNow
    // wired into _saveClientHistoryNow below).
    //
    // _switchPromise serializes rapid load clicks so a pending save for Client
    // A cannot be interleaved with a DOM clear for Client B.
    // ═══════════════════════════════════════════════════════════════════════
    activeClientId: null,
    _switchPromise: null,
    // _dirty: true whenever the user has typed something since the last flush
    // to the active record. Drives the switch-confirmation modal and the
    // beforeunload warning. Cleared by _saveActiveRecordNow and _switchToClient.
    _dirty: false,

    async _switchToClient(record /* null | {id, data, ...} */) {
        // Serialize rapid switch clicks — wait for any in-flight switch to finish
        if (this._switchPromise) {
            try { await this._switchPromise; } catch(_) {}
        }
        this._switchPromise = (async () => {
            // Let any debounced save finish before we clear
            if (this.saveTimeout) {
                await new Promise(r => setTimeout(r, 520));
            }
            // Flush active record back to its quote entry before switching away
            try { await this._saveActiveRecordNow(); } catch(e) { console.warn('[Switch] flush prior record:', e); }

            // Full DOM reset — this is the "no carryover" guarantee. Without it,
            // loadQuote(B) leaves Client A's residual input values visible and
            // any subsequent save() re-captures them into Client B's data.
            document.querySelectorAll('#mainContainer input, #mainContainer select, #mainContainer textarea').forEach(el => {
                if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
                else el.value = '';
            });
            this.data = {};
            this.drivers = [];
            this.vehicles = [];
            this.activeClientId = null;

            if (record && record.data) {
                // Stamp wrapper id into data so identity travels with the blob.
                // applyData will read _clientId and set activeClientId.
                const dataWithId = record.id
                    ? { ...record.data, _clientId: record.id }
                    : { ...record.data };
                this.applyData(dataWithId);
            } else {
                // Blank form — refresh UI hooks without applying data
                this.handleType();
                if (typeof this.updateUI === 'function') this.updateUI();
            }
            // Freshly-loaded or freshly-cleared form is clean by definition
            this._dirty = false;
            if (typeof this._updateActiveClientBadge === 'function') this._updateActiveClientBadge();
        })();
        try { await this._switchPromise; } finally { this._switchPromise = null; }
    },

    // Flush the live form back to its matching quote record. Called from
    // _saveClientHistoryNow so nav / beforeunload / explicit save all propagate
    // the current edits to the record the user loaded from — never silently
    // stranding edits in altech_v6 alone.
    async _saveActiveRecordNow() {
        if (!this.activeClientId) return;
        if (typeof this.getQuotes !== 'function' || typeof this.saveQuotes !== 'function') return;
        try {
            const quotes = await this.getQuotes();
            const idx = quotes.findIndex(q => q.id === this.activeClientId);
            if (idx < 0) return;
            // Snapshot the PRE-update state into history — "undo the changes I just made"
            // means restoring whatever the record looked like before this save. 60s dedup
            // keeps the list from filling with near-identical snapshots during rapid typing.
            this._addHistorySnapshot(quotes[idx]);
            quotes[idx].data = JSON.parse(JSON.stringify(this.data));
            quotes[idx].updatedAt = new Date().toISOString();
            if (typeof this.getQuoteTitle === 'function') {
                quotes[idx].title = this.getQuoteTitle(this.data);
            }
            await this.saveQuotes(quotes);
            this._dirty = false;
            if (typeof this._updateActiveClientBadge === 'function') this._updateActiveClientBadge();
        } catch(e) { console.warn('[ActiveRecord] save-back error:', e); }
    },

    // History cap: 5 snapshots per record. Enough to roll back a bad AI-fill or
    // accidental nuke, not enough to bloat the encrypted quote blob.
    HISTORY_CAP: 5,
    HISTORY_DEDUP_MS: 60_000,  // Ignore snapshot attempts within 1 min of the last one

    _addHistorySnapshot(record, { force = false } = {}) {
        if (!record || !record.data) return;
        if (!record.history) record.history = [];
        const latest = record.history[0];
        if (latest && !force) {
            const ageMs = Date.now() - new Date(latest.snapshotAt).getTime();
            if (ageMs < this.HISTORY_DEDUP_MS) return;
            if (JSON.stringify(latest.data) === JSON.stringify(record.data)) return;
        }
        record.history.unshift({
            snapshotAt: new Date().toISOString(),
            data: JSON.parse(JSON.stringify(record.data)),
        });
        if (record.history.length > this.HISTORY_CAP) {
            record.history.length = this.HISTORY_CAP;
        }
    },

    // Restore a snapshot. Pushes the current state as a fresh snapshot first
    // (force=true, bypass dedup) so the undo is itself undoable.
    async _restoreSnapshot(snapshotIndex) {
        if (!this.activeClientId) return;
        const quotes = await this.getQuotes();
        const idx = quotes.findIndex(q => q.id === this.activeClientId);
        if (idx < 0) return;
        const record = quotes[idx];
        if (!record.history || !record.history[snapshotIndex]) return;
        const snapshot = record.history[snapshotIndex];
        // Save current state into history BEFORE restoring, so the restore is reversible
        const currentAsRecord = { ...record, data: JSON.parse(JSON.stringify(this.data)) };
        this._addHistorySnapshot(currentAsRecord, { force: true });
        record.history = currentAsRecord.history;
        // Overwrite record.data with snapshot and persist
        record.data = JSON.parse(JSON.stringify(snapshot.data));
        record.data._clientId = this.activeClientId;
        record.updatedAt = new Date().toISOString();
        await this.saveQuotes(quotes);
        // Re-apply the restored data to the live form
        await this._switchToClient(record);
        this.toast('↩️ Restored to ' + new Date(snapshot.snapshotAt).toLocaleTimeString());
    },

    // History modal — opens from the badge's ⏮ button. Shows up to 5 snapshots
    // with relative timestamps; click Restore to revert the form to that state.
    async _showHistoryModal() {
        if (!this.activeClientId) {
            this.toast('⚠️ No active client — nothing to restore');
            return;
        }
        const quotes = await this.getQuotes();
        const record = quotes.find(q => q.id === this.activeClientId);
        const history = (record && record.history) || [];
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        let bodyHtml;
        if (!history.length) {
            bodyHtml = '<p style="color:var(--text-secondary);">No history yet — snapshots are captured automatically as you work. Make more edits and save to build up history.</p>';
        } else {
            bodyHtml = '<div class="history-list">' + history.map((h, i) => {
                const when = new Date(h.snapshotAt).toLocaleString();
                const filled = Object.keys(h.data || {}).filter(k => {
                    const v = h.data[k];
                    return v !== null && v !== undefined && v !== '' && !String(k).startsWith('_');
                }).length;
                return `<div class="history-row">
                    <div class="history-info">
                        <div class="history-when">${when}</div>
                        <div class="history-meta">${filled} fields captured</div>
                    </div>
                    <button class="modal-btn modal-btn-primary" data-history-idx="${i}">Restore</button>
                </div>`;
            }).join('') + '</div>';
        }
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <span class="modal-icon">⏮</span>
                    <h2 class="modal-title">Recent snapshots</h2>
                </div>
                <div class="modal-body">
                    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">
                        Automatic snapshots capture the form state roughly once a minute as you work. Restoring is itself undoable — your current state is saved before the restore.
                    </p>
                    ${bodyHtml}
                </div>
                <div class="modal-actions">
                    <button class="modal-btn modal-btn-secondary" id="history-close">Close</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('#history-close').onclick = () => modal.remove();
        modal.querySelectorAll('[data-history-idx]').forEach(btn => {
            btn.onclick = async () => {
                const idx = parseInt(btn.dataset.historyIdx, 10);
                if (!confirm('Restore the form to this snapshot? Your current state will be saved as an undo point first.')) return;
                modal.remove();
                await this._restoreSnapshot(idx);
            };
        });
    },

    // Badge rendering — shows "Editing: [Client Name] · [status]" below the header.
    // Hidden when no active record (blank form / fresh start).
    _updateActiveClientBadge() {
        const badge = document.getElementById('activeClientBadge');
        if (!badge) return;
        if (!this.activeClientId) {
            badge.style.display = 'none';
            return;
        }
        const first = (this.data.firstName || '').trim();
        const last = (this.data.lastName || '').trim();
        const name = [first, last].filter(Boolean).join(' ') || 'Untitled Client';
        const status = this._dirty ? 'unsaved changes' : 'saved';
        const statusClass = this._dirty ? 'acb-status-dirty' : 'acb-status-clean';
        const nameEl = document.getElementById('acbName');
        const statusEl = document.getElementById('acbStatus');
        if (nameEl) nameEl.textContent = name;
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = 'acb-status ' + statusClass;
        }
        badge.style.display = '';
    },

    // Debounced client history auto-save (3s debounce, separate from form save)
    _clientHistorySaveTimeout: null,
    _scheduleClientHistorySave() {
        if (this._clientHistorySaveTimeout) clearTimeout(this._clientHistorySaveTimeout);
        this._clientHistorySaveTimeout = setTimeout(() => {
            try { this.autoSaveClient(); } catch(e) { console.warn('[AutoSave] Client history save error:', e); }
        }, 3000);
    },

    // Immediate client history save (no debounce) — for navigation, beforeunload, manual save.
    // Also flushes the active record back to its quote entry so edits never strand.
    _saveClientHistoryNow() {
        if (this._clientHistorySaveTimeout) clearTimeout(this._clientHistorySaveTimeout);
        try { this.autoSaveClient(); } catch(e) { console.warn('[AutoSave] Client history save error:', e); }
        if (this.activeClientId) {
            this._saveActiveRecordNow().catch(e => console.warn('[ActiveRecord] async flush error:', e));
        }
    },

    async save(e) {
        if (e && e.target) {
            const k = (window.FieldMap && window.FieldMap.storageKeyForElement(e.target)) || e.target.id || e.target.name;
            // hasCoApplicant uses 'yes'/'' string convention — toggleCoApplicant() is the sole authority
            if (e.target.type === 'checkbox' && k === 'hasCoApplicant') return;
            this.data[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            // User input = form is dirty until next flush to the active record
            this._dirty = true;
            if (typeof this._updateActiveClientBadge === 'function') this._updateActiveClientBadge();

            if (k === 'firstName' || k === 'lastName') {
                this.data.firstNamePhonetic = '';
                this.data.lastNamePhonetic = '';
                this.updateNamePronunciationUI();
            }
        }

        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveToken += 1;
        const token = this.saveToken;

        this.saveTimeout = setTimeout(async () => {
            if (token !== this.saveToken) return;
            if (this._saving) return;
            this._saving = true;

            try {
                const dataToSave = JSON.parse(JSON.stringify(this.data || {}));
                dataToSave._schemaVersion = this.CURRENT_SCHEMA_VERSION;

                if (this.encryptionEnabled) {
                    const encrypted = await CryptoHelper.encrypt(dataToSave);
                    safeSave(this.storageKey, encrypted);
                } else {
                    safeSave(this.storageKey, JSON.stringify(dataToSave));
                }

                const ind = document.getElementById('saveIndicator');
                if (ind) {
                    ind.style.opacity = 1;
                    setTimeout(() => { ind.style.opacity = 0; }, 1500);
                }

                // Also schedule a debounced client history save on meaningful input
                this._scheduleClientHistorySave();
            } finally {
                this._saving = false;
            }
        }, 500);
    },

    async load() {
        const s = localStorage.getItem(this.storageKey);
        if (!s) return;
        
        // Try decrypting first
        if (this.encryptionEnabled) {
            try {
                const decrypted = await CryptoHelper.decrypt(s);
                if (decrypted) {
                    this.applyData(this._migrateSchema(decrypted));
                } else {
                    console.warn('[App.load] Decryption returned null — stored data may be corrupt or key changed');
                    this.toast('⚠️ Could not decrypt saved data. It may need to be re-entered.');
                }
            } catch (e) {
                console.error('[App.load] Error during load/apply:', e);
            }
        } else {
            try {
                this.applyData(this._migrateSchema(JSON.parse(s)));
            } catch (e) {
                console.error('[App.load] Corrupt JSON in localStorage:', e);
                this.toast('⚠️ Saved data was corrupted. Starting fresh.');
            }
        }
    },

    /**
     * Schema migration runner.
     * Current version: 1. Bumps data through sequential migrations
     * when adding a new migration, increment CURRENT_SCHEMA_VERSION
     * and add an entry to the migrations array below.
     */
    CURRENT_SCHEMA_VERSION: 3,

    _migrateSchema(data) {
        if (!data || typeof data !== 'object') return data || {};
        const v = data._schemaVersion || 0;
        if (v >= this.CURRENT_SCHEMA_VERSION) return data;

        // Sequential migrations — each takes data at version N → N+1
        const migrations = [
            // v0 → v1: Add schema version field (no-op, just stamps it)
            (d) => { d._schemaVersion = 1; return d; },
            // v1 → v2: Normalize hasCoApplicant + migrate legacy field names
            (d) => {
                // Normalize hasCoApplicant from boolean/variant to string 'yes'/''
                if (d.hasCoApplicant === true)  d.hasCoApplicant = 'yes';
                if (d.hasCoApplicant === false || d.hasCoApplicant === 'no') d.hasCoApplicant = '';
                if (d.hasCoApplicant === 'on')  d.hasCoApplicant = 'yes';
                // Migrate legacy field names (older clients used different keys)
                if (d.address && !d.addrStreet)        d.addrStreet = d.address;
                if (d.city && !d.addrCity)              d.addrCity = d.city;
                if (d.state && !d.addrState)            d.addrState = d.state;
                if (d.zip && !d.addrZip)                d.addrZip = d.zip;
                if (d.bodInjury && !d.liabilityLimits)  d.liabilityLimits = d.bodInjury;
                if (d.propDamage && !d.pdLimit)          d.pdLimit = d.propDamage;
                if (d.collDed && !d.autoDeductible)      d.autoDeductible = d.collDed;
                d._schemaVersion = 2;
                return d;
            },
            // v2 → v3: Stamp _clientId for identity tracking. Existing altech_v6
            // data gets a fresh UUID; records loaded through quotes/history will
            // have their wrapper id stamped in the getQuotes/getClientHistory
            // pre-return loops so identity stays consistent across sources.
            (d) => {
                if (!d._clientId) {
                    d._clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                        ? crypto.randomUUID()
                        : `cid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                }
                d._schemaVersion = 3;
                return d;
            },
        ];

        let migrated = { ...data };
        for (let i = v; i < this.CURRENT_SCHEMA_VERSION; i++) {
            if (migrations[i]) {
                console.log(`[Schema] Migrating v${i} → v${i + 1}`);
                migrated = migrations[i](migrated);
            }
        }
        return migrated;
    },

    applyData(data) {
        this.data = data || {};
        // Identity sync — _clientId in the data is the single source of truth for
        // which record we're editing. Boot, _switchToClient, loadDemoClient all
        // funnel through here, so activeClientId is always consistent with the
        // data on screen.
        this.activeClientId = this.data._clientId || null;
        // Normalize stored phone numbers to (xxx) xxx-xxxx format
        ['phone', 'coPhone'].forEach(k => {
            if (this.data[k]) this.data[k] = this._fmtPhoneVal(this.data[k]);
        });
        Object.keys(this.data).forEach(k => {
            const domId = (window.FieldMap && window.FieldMap.domIdForStorageKey(k)) || k;
            const el = document.getElementById(domId);
            if(el) {
                if(el.type === 'checkbox') {
                    el.checked = this.data[k];
                } else {
                    el.value = this.data[k];
                }
            }
            if(k === 'qType') {
                const r = document.querySelector(`input[name="qType"][value="${this.data[k]}"]`);
                if(r) r.checked = true;
            }
        });
        this.checkUpdates();
        this.handleType();
        this.updateNamePronunciationUI();
        this.computeOtherStructures();
        this.restoreCoApplicantUI();
        this.updatePrimaryHomeSection(this.data.dwellingUsage);
        this.restorePrimaryApplicantUI();
        this.syncSegmentedControls();
        // Refresh dynamic occupation dropdown for loaded industry
        this._populateOccupation(this.data.industry || '', this.data.occupation || '');
        this._populateCoOccupation && this._populateCoOccupation(this.data.coIndustry || '', this.data.coOccupation || '');
        // Restore drivers/vehicles arrays and render cards
        this.loadDriversVehicles();
        // Re-inject "Other" specify fields for dropdowns that were saved with "Other" selected
        this._restoreOtherFields();
        // Refresh the active-client badge to reflect the loaded record
        if (typeof this._updateActiveClientBadge === 'function') this._updateActiveClientBadge();
        // Debounced save to capture full form state (including DOM defaults)
        // after loading client data from Firestore or local history
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.save(), 500);
    },

    syncSegmentedControls() {
        document.querySelectorAll('.seg-group[data-field]').forEach(group => {
            const fieldId = group.dataset.field;
            const val = this.data[fieldId] || '';
            group.querySelectorAll('.seg-btn').forEach(btn => {
                btn.classList.toggle('seg-active', btn.dataset.value === val);
            });
        });
        // Sync iOS toggle switches
        document.querySelectorAll('[data-toggle-field]').forEach(toggle => {
            const fieldId = toggle.dataset.toggleField;
            const val = this.data[fieldId] || '';
            toggle.checked = (val === 'Yes');
        });
        // Restore progressive disclosure state
        const secHeatVal = this.data.secondaryHeating || '';
        const secHeatCheck = document.getElementById('hasSecondaryHeating');
        const secHeatWrap = document.getElementById('secondaryHeatingWrapper');
        if (secHeatCheck && secHeatWrap) {
            const hasValue = secHeatVal !== '';
            secHeatCheck.checked = hasValue;
            secHeatWrap.classList.toggle('disclosure-hidden', !hasValue);
        }
        // Restore earthquake disclosure state
        const eqVal = this.data.earthquakeCoverage || '';
        const eqWrap = document.getElementById('earthquakeDetailsWrapper');
        if (eqWrap) {
            eqWrap.classList.toggle('disclosure-hidden', eqVal !== 'Yes');
        }
    },


    // === OTHER FIELD HANDLERS ===
    // When a dropdown is set to "Other", a text input is injected directly below
    // it so agents can specify what "Other" means. The value is stored as
    // `fieldId_other` in App.data and appears in PDF exports only
    // (HawkSoft / EZLynx export pipelines use the raw "Other" value unchanged).
    _showOtherField(sel) {
        const wrapperId = sel.id + '_other_wrap';
        if (document.getElementById(wrapperId)) return; // already visible
        const input = document.createElement('input');
        input.type = 'text';
        input.id = sel.id + '_other';
        input.name = sel.id + '_other';
        input.placeholder = 'Please specify…';
        input.setAttribute('maxlength', '120');
        input.value = this.data[sel.id + '_other'] || '';
        const wrapper = document.createElement('div');
        wrapper.id = wrapperId;
        wrapper.className = 'other-specify-wrapper';
        wrapper.style.cssText = 'margin-top: 6px;';
        wrapper.appendChild(input);
        const formGroup = sel.closest('.form-group');
        if (formGroup) {
            formGroup.appendChild(wrapper);
        } else {
            sel.parentNode.insertBefore(wrapper, sel.nextSibling);
        }
    },

    _hideOtherField(sel) {
        const wrap = document.getElementById(sel.id + '_other_wrap');
        if (wrap) wrap.remove();
        if (sel.id + '_other' in this.data) {
            delete this.data[sel.id + '_other'];
            this.save();
        }
    },

    _restoreOtherFields() {
        document.querySelectorAll('#quotingTool select').forEach(sel => {
            if (sel.value === 'Other') {
                if (!document.getElementById(sel.id + '_other_wrap')) {
                    this._showOtherField(sel);
                }
                const inp = document.getElementById(sel.id + '_other');
                if (inp) inp.value = this.data[sel.id + '_other'] || '';
            }
        });
    },

    // === PROGRESSIVE DISCLOSURE ===
    checkUpdates() {
        const yrBuiltEl = document.getElementById('yrBuilt');
        const updatesCard = document.getElementById('updatesCard');
        if (!yrBuiltEl || !updatesCard) return;
        const yrBuilt = yrBuiltEl.value;
        
        if(yrBuilt && parseInt(yrBuilt) < 2000) {
            updatesCard.classList.remove('hidden');
        } else {
            updatesCard.classList.add('hidden');
        }
    },

    // === FEATURES ===
    async decodeVin(el) {
        const v = (el.value || '').toUpperCase().trim();
        const resultEl = document.getElementById('vinResult');
        const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;

        if (!v) {
            if (resultEl) resultEl.innerText = '';
            return;
        }

        if (!vinRegex.test(v)) {
            if (resultEl) resultEl.innerText = 'Invalid VIN format (17 chars, no I/O/Q).';
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            if (resultEl) resultEl.innerText = 'Decoding VIN...';
            const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${v}?format=json`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!r.ok) {
                throw new Error(`VIN decode failed: ${r.status}`);
            }

            const d = await r.json();
            const r1 = d && d.Results && d.Results[0];
            if (!r1) {
                throw new Error('No vehicle data found for VIN');
            }

            const desc = `${r1.ModelYear || ''} ${r1.Make || ''} ${r1.Model || ''}`.trim();
            const descEl = document.getElementById('vehDesc');
            if (descEl) descEl.value = desc;
            if (resultEl) resultEl.innerText = desc ? `OK ${desc}` : 'VIN decoded.';
            this.data.vehDesc = desc;
        } catch (e) {
            clearTimeout(timeoutId);
            if (resultEl) {
                resultEl.innerText = e && e.name === 'AbortError'
                    ? 'VIN decode timed out. Enter details manually.'
                    : 'VIN decode failed. Enter details manually.';
            }
        }
    },

    _fmtPhoneVal(val) {
        const x = (val || '').replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
        if (!x) return val || '';
        return !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    },

    fmtPhone(e) {
        e.target.value = App._fmtPhoneVal(e.target.value);
    },

    // ── Notes & Formatting ──
    getNamePronunciation(data) {
        const first = (data.firstNamePhonetic || '').trim();
        const last = (data.lastNamePhonetic || '').trim();

        if (!first && !last) return '';
        if (first && last) return `First: ${first} | Last: ${last}`;
        if (first) return `First: ${first}`;
        return `Last: ${last}`;
    },

    computeOtherStructures() {
        const raw = (this.data.dwellingCoverage || '').replace(/[^0-9.]/g, '');
        const dwelling = parseFloat(raw) || 0;
        const other = dwelling ? String(Math.round(dwelling * 0.10)) : '';
        const el = document.getElementById('otherStructures');
        if (el) el.value = other;
        this.data.otherStructures = other;
    },

    updateNamePronunciationUI() {
        const firstEl = document.getElementById('firstNamePhonetic');
        const lastEl = document.getElementById('lastNamePhonetic');
        if (firstEl) firstEl.value = (this.data.firstNamePhonetic || '').trim();
        if (lastEl) lastEl.value = (this.data.lastNamePhonetic || '').trim();
        // Update button style to show pronunciation exists
        const btnFirst = document.getElementById('pronBtnFirst');
        const btnLast = document.getElementById('pronBtnLast');
        if (btnFirst) btnFirst.classList.toggle('has-value', !!(this.data.firstNamePhonetic || '').trim());
        if (btnLast) btnLast.classList.toggle('has-value', !!(this.data.lastNamePhonetic || '').trim());
    },

    togglePronunciation(which) {
        const popup = document.getElementById(which === 'first' ? 'pronPopupFirst' : 'pronPopupLast');
        if (!popup) return;
        popup.classList.toggle('active');
        // Close the other popup
        const other = document.getElementById(which === 'first' ? 'pronPopupLast' : 'pronPopupFirst');
        if (other) other.classList.remove('active');
    },


    async generateNamePronunciation() {
        const firstName = (this.data.firstName || '').trim();
        const lastName = (this.data.lastName || '').trim();
        if (!firstName && !lastName) {
            this.toast('⚠️ Enter a first or last name first.');
            return;
        }

        const btns = document.querySelectorAll('.popup-btn-gen');
        btns.forEach(b => { b.disabled = true; b.textContent = '...'; });

        try {
            // Try 1: Server API (works on Vercel / local server)
            let payload = null;
            try {
                const res = await fetch('/api/config?type=phonetics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ firstName, lastName })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (!data.error) payload = data;
                }
            } catch (_) { /* server unavailable – fall through */ }

            // Try 2: AIProvider (supports all providers)
            if (!payload && typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
                try {
                    const systemPrompt = 'You are a linguistics expert who generates phonetic pronunciation guides. Return only valid JSON.';
                    const userMessage =
                        'Generate phonetic pronunciations for the provided name(s).\n' +
                        'Rules:\n' +
                        '- Return plain ASCII with syllable breaks using hyphens.\n' +
                        '- Use uppercase for the stressed syllable.\n' +
                        '- If unsure, provide a best-effort guess.\n' +
                        'Return ONLY JSON: {"firstNamePhonetic":"","lastNamePhonetic":""}\n\n' +
                        `First Name: ${firstName}\nLast Name: ${lastName}`;
                    const result = await AIProvider.ask(systemPrompt, userMessage, {
                        temperature: 0.2, maxTokens: 256, responseFormat: 'json'
                    });
                    if (result.text) {
                        const parsed = AIProvider.extractJSON(result.text);
                        if (parsed && (parsed.firstNamePhonetic || parsed.lastNamePhonetic)) payload = parsed;
                    }
                } catch (e) { console.warn('[Pronunciation] AIProvider failed:', e); }
            }

            // Try 3: Direct Gemini API fallback (works in Tauri / offline / no server)
            if (!payload) {
                const key = await this._getGeminiKey();

                if (key) {
                    const prompt =
                        'Generate phonetic pronunciations for the provided name(s).\n' +
                        'Rules:\n' +
                        '- Return plain ASCII with syllable breaks using hyphens.\n' +
                        '- Use uppercase for the stressed syllable.\n' +
                        '- If unsure, provide a best-effort guess.\n' +
                        'Return ONLY JSON: {"firstNamePhonetic":"","lastNamePhonetic":""}\n' +
                        `First Name: ${firstName}\nLast Name: ${lastName}`;

                    const geminiRes = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                                generationConfig: {
                                    temperature: 0.2,
                                    maxOutputTokens: 256,
                                    response_mime_type: 'application/json',
                                    response_schema: {
                                        type: 'object',
                                        properties: {
                                            firstNamePhonetic: { type: 'string' },
                                            lastNamePhonetic: { type: 'string' }
                                        },
                                        required: ['firstNamePhonetic', 'lastNamePhonetic']
                                    }
                                }
                            })
                        }
                    );

                    if (geminiRes.ok) {
                        const geminiData = await geminiRes.json();
                        const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) payload = JSON.parse(text);
                    }
                }
            }

            if (!payload) throw new Error('No API available');

            this.data.firstNamePhonetic = payload.firstNamePhonetic || '';
            this.data.lastNamePhonetic = payload.lastNamePhonetic || '';
            this.updateNamePronunciationUI();
            this.save();
            this.toast('✓ Pronunciation added');
            // Close popups after generating
            document.querySelectorAll('.pronunciation-popup').forEach(p => p.classList.remove('active'));
        } catch (err) {
            console.error('[Pronunciation] Failed:', err);
            this.toast('⚠️ Unable to generate pronunciation right now');
        } finally {
            btns.forEach(b => { b.disabled = false; b.textContent = 'Generate'; });
        }
    },

    resolveDriverName(driverId, driversArr) {
        if (!driverId) return '';
        const drivers = driversArr || this.drivers || [];
        const driver = drivers.find(d => d.id === driverId);
        return driver ? [driver.firstName, driver.lastName].filter(Boolean).join(' ') : '';
    },

    getNotesForData(data) {
        const fmt = (v) => this.formatDateDisplay(v);
        const drivers = (data.drivers && data.drivers.length) ? data.drivers : (this.drivers || []);
        const vehicles = (data.vehicles && data.vehicles.length) ? data.vehicles : (this.vehicles || []);
        const qType = data.qType || 'both';
        const includeHome = qType === 'home' || qType === 'both';
        const includeAuto = qType === 'auto' || qType === 'both';

        let notes = `
=== CLIENT PROFILE ===
Name: ${data.firstName || ''} ${data.lastName || ''}
Email: ${data.email || ''}
Phone: ${data.phone || ''}
DOB: ${fmt(data.dob)}
Marital Status: ${data.maritalStatus || ''}
Education: ${data.education || ''}
Occupation: ${data.occupation || ''}
Industry: ${data.industry || ''}`;

        // Co-Applicant
        if (data.hasCoApplicant === 'yes' && (data.coFirstName || data.coLastName)) {
            notes += `

=== CO-APPLICANT ===
Name: ${data.coFirstName || ''} ${data.coLastName || ''}
DOB: ${fmt(data.coDob)}
Gender: ${data.coGender || ''}
Email: ${data.coEmail || ''}
Phone: ${data.coPhone || ''}
Relationship: ${data.coRelationship || ''}`;
        }

        // Property (home + both)
        if (includeHome) {
            notes += `

=== DWELLING SPECIFICATIONS ===
Address: ${data.addrStreet || ''}, ${data.addrCity || ''}, ${data.addrState || ''} ${data.addrZip || ''}
Dwelling Type: ${data.dwellingType || ''} (${data.dwellingUsage || ''})
Year Built: ${data.yrBuilt || ''} | Square Feet: ${data.sqFt || ''}
Stories: ${data.numStories || ''} | Bathrooms: ${data.fullBaths || ''}
Construction: ${data.constructionStyle || ''} | Walls: ${data.exteriorWalls || ''}
Foundation: ${data.foundation || ''}
Roof: ${data.roofType || ''} (${data.roofShape || ''}) - Updated: ${data.roofYr || ''}
Heating: ${data.heatingType || ''} (Updated: ${data.heatYr || ''})
Cooling: ${data.cooling || ''}
Plumbing Updated: ${data.plumbYr || ''}
Electrical Updated: ${data.elecYr || ''}
Fire Station: ${data.fireStationDist || ''} miles | Hydrant: ${data.fireHydrantFeet || ''} feet
Protection Class: ${data.protectionClass || ''}
Burglar Alarm: ${data.burglarAlarm || ''}
Fire Alarm: ${data.fireAlarm || ''}
Sprinklers: ${data.sprinklers || ''}`;
        }

        // Drivers & Vehicles (auto + both)
        if (includeAuto) {
            notes += `

=== DRIVERS & VEHICLES ===
${drivers.map((d, i) => `Driver ${i + 1}: ${[d.firstName, d.lastName].filter(Boolean).join(' ')} | Relationship: ${d.relationship || ''} | Occupation: ${d.occupation || ''} | DOB: ${fmt(d.dob)} | DL: ${(d.dlNum || '').toUpperCase()} (${(d.dlState || '').toUpperCase()})`).join('\n')}
${vehicles.map((v, i) => { const desc = [v.year, v.make, v.model].filter(Boolean).join(' '); return `Vehicle ${i + 1}: ${desc || 'Unknown'} | VIN: ${v.vin || ''} | Use: ${v.use || ''} | Miles: ${v.miles || ''} | Primary Driver: ${this.resolveDriverName(v.primaryDriver, drivers)}`; }).join('\n')}
Vehicle (Legacy): ${data.vehDesc || ''}
VIN (Legacy): ${data.vin || ''}
Driver's License: ${(data.dlNum || '').toUpperCase()} (${(data.dlState || '').toUpperCase()})
Usage: ${data.use || ''} | Annual Miles: ${data.miles || ''}
Commute Distance: ${data.commuteDist || ''} miles
Ride Sharing: ${data.rideSharing || 'No'}
Telematics: ${data.telematics || ''}`;
        }

        notes += `

=== POLICY HISTORY & RISK ===
${includeAuto ? `Current Liability: ${data.liabilityLimits || ''}\n` : ''}Deductibles: ${includeHome ? `Home ${data.homeDeductible || ''}` : ''}${includeHome && includeAuto ? ' / ' : ''}${includeAuto ? `Auto ${data.autoDeductible || ''}` : ''}
${includeHome ? `Home Prior Carrier: ${data.homePriorCarrier || data.priorCarrier || ''} (${data.homePriorYears || data.priorYears || ''} years)\nHome Prior Expiration: ${fmt(data.homePriorExp || data.priorExp)}\n` : ''}${includeAuto ? `Auto Prior Carrier: ${data.priorCarrier || ''} (${data.priorYears || ''} years)\nAuto Prior Expiration: ${fmt(data.priorExp)}\n` : ''}Effective Date: ${fmt(data.effectiveDate)}
${includeAuto ? `Accidents: ${data.accidents || 'None'}\nViolations: ${data.violations || 'None'}\nStudent GPA: ${data.studentGPA || 'N/A'}\n` : ''}${includeHome ? `Pool: ${data.pool || 'No'}\nTrampoline: ${data.trampoline || 'No'}\nWood Stove: ${data.woodStove && data.woodStove !== 'None' ? data.woodStove : 'None'}\nDog: ${data.dogInfo || 'None'}\nBusiness on Property: ${data.businessOnProperty || 'No'}` : ''}

=== ADDITIONAL INFORMATION ===
${includeHome ? `Mortgagee: ${data.mortgagee || ''}\n` : ''}Additional Insureds: ${data.additionalInsureds || 'None'}
${includeHome ? `Purchase Date: ${fmt(data.purchaseDate)}\nKitchen/Bath Quality: ${data.kitchenQuality || ''}\n` : ''}Best Contact Time: ${data.contactTime || ''}
Referral Source: ${data.referralSource || ''}
TCPA Consent: ${data.tcpaConsent ? 'Yes' : 'No'}`;

        return notes.trim();
    },

    getNotes() {
        return this.getNotesForData(this.data);
    },

    copyNotes() {
        this.copyToClipboard(this.getNotes());
    },


    downloadFile(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        this.downloadBlob(blob, filename);
    },

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        // Append to DOM so Firefox/Edge initiates the transfer before the ref is lost
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Defer revoke: browser needs time to start the byte transfer.
        // Synchronous revoke causes 0-byte / failed downloads on Firefox and Edge.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },

    // --- Export History ---

    logExport(type, filename) {
        // Ensure client is saved to history when they export
        try { this._saveClientHistoryNow(); } catch(e) { /* ok */ }

        const clientName = `${this.data.firstName || ''} ${this.data.lastName || ''}`.trim() || 'Unknown';
        const entry = {
            type,
            filename,
            clientName,
            exportedAt: new Date().toISOString(),
            qType: (document.querySelector('input[name="qType"]:checked') || {}).value || 'unknown'
        };
        // Save to localStorage
        const key = STORAGE_KEYS.EXPORT_HISTORY;
        let history = Utils.tryParseLS(key, []);
        history.unshift(entry);
        history = history.slice(0, 200);
        localStorage.setItem(key, JSON.stringify(history));
        // Also save to disk (fire-and-forget)
        fetch('/local/export-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        }).catch(() => {});
    },

    async loadExportHistory() {
        const container = document.getElementById('exportHistoryList');
        if (!container) return;
        // Try disk first, fall back to localStorage
        let entries = [];
        try {
            const res = await fetch('/local/export-history');
            if (res.ok) {
                const data = await res.json();
                entries = data.entries || [];
            }
        } catch (e) {}
        if (entries.length === 0) {
            entries = Utils.tryParseLS(STORAGE_KEYS.EXPORT_HISTORY, []);
        }
        if (entries.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">No exports yet. Export a file to see it here.</p>';
            return;
        }
        const typeLabels = { CMSMTF: '📂 HawkSoft', XML: '🚗 Auto XML', HomeXML: '🏠 Home XML', BothXML: '📦 Both XML', PDF: '📄 PDF', Text: '📝 Text', CSV: '📊 CSV' };
        container.innerHTML = `
            <div style="max-height:300px;overflow-y:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead><tr style="text-align:left;border-bottom:1px solid var(--border);">
                        <th style="padding:6px 8px;">Type</th>
                        <th style="padding:6px 8px;">Client</th>
                        <th style="padding:6px 8px;">File</th>
                        <th style="padding:6px 8px;">Date</th>
                    </tr></thead>
                    <tbody>
                        ${entries.slice(0, 50).map(e => {
                            const d = new Date(e.exportedAt);
                            const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                            const esc = (s) => Utils.escapeAttr(s);
                            return `<tr style="border-bottom:1px solid color-mix(in srgb, var(--border) 50%, transparent);">
                                <td style="padding:6px 8px;white-space:nowrap;">${typeLabels[e.type] || esc(e.type || '')}</td>
                                <td style="padding:6px 8px;font-weight:500;">${esc(e.clientName || '')}</td>
                                <td style="padding:6px 8px;font-family:monospace;font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e.filename || '')}</td>
                                <td style="padding:6px 8px;white-space:nowrap;color:var(--text-secondary);">${dateStr}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:8px;text-align:right;">
                <button class="btn btn-tertiary" onclick="App.clearExportHistory()">Clear History</button>
            </div>
        `;
    },

    clearExportHistory() {
        if (!confirm('Clear export history?')) return;
        localStorage.removeItem(STORAGE_KEYS.EXPORT_HISTORY);
        fetch('/local/export-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {});
        this.loadExportHistory();
    },


    // ── Demo Client Loader ──────────────────────────────────
    // Populates the entire intake form with realistic sample data
    // so you can demonstrate HawkSoft, EZLynx, and PDF exports.
    loadDemoClient() {
        // Clear first
        this.data = {};
        this.drivers = [];
        this.vehicles = [];

        const demo = {
            // ── Step 1: Client Information ──
            prefix: 'MRS',
            firstName: 'Sample',
            middleName: 'A',
            lastName: 'Client',
            suffix: '',
            dob: '1985-07-22',
            gender: 'F',
            maritalStatus: 'Married',
            email: 'demo@example.com',
            phone: '5555559876',
            // Co-Applicant
            hasCoApplicant: 'yes',
            coFirstName: 'Sample',
            coLastName: 'Spouse',
            coDob: '1983-03-15',
            coGender: 'M',
            coEmail: 'demo.spouse@example.com',
            coPhone: '5555559877',
            coRelationship: 'Spouse',
            coEducation: 'Bachelors',
            coOccupation: 'Software Engineer',
            coIndustry: 'Information Technology',
            coMaritalStatus: 'Married',

            // ── Step 2: Coverage Type & Demographics ──
            qType: 'both',
            education: 'Bachelors',
            occupation: 'Marketing Manager',
            industry: 'Business/Sales/Office',

            // ── Step 3: Property Details ──
            addrStreet: '2847 Evergreen Terrace',
            addrCity: 'Vancouver',
            addrState: 'WA',
            addrZip: '98686',
            county: 'Clark',
            yearsAtAddress: '6',
            previousAddrStreet: '1420 Oak Hollow Lane',
            previousAddrCity: 'Portland',
            previousAddrState: 'OR',
            previousAddrZip: '97205',
            primaryHomeAddr: '2847 Evergreen Terrace',
            primaryHomeCity: 'Vancouver',
            primaryHomeState: 'WA',
            primaryHomeZip: '98686',
            dwellingUsage: 'Primary',
            occupancyType: 'Owner Occupied',
            dwellingType: 'One Family',
            numStories: '2',
            bedrooms: '4',
            fullBaths: '2',
            halfBaths: '1',
            sqFt: '2200',
            yrBuilt: '2003',
            lotSize: '0.28',
            numOccupants: '4',
            purchaseDate: '2019-08-15',
            constructionStyle: 'Colonial',
            exteriorWalls: 'Siding, Vinyl',
            foundation: 'Basement - Finished',
            kitchenQuality: 'Semi-Custom',
            garageType: 'Attached',
            garageSpaces: '2',
            flooring: 'Hardwood',
            numFireplaces: '1',
            // Roof
            roofType: 'Architectural Shingles',
            roofShape: 'Gable',
            roofYr: '2018',
            roofUpdate: 'Complete Update',
            // Systems
            heatingType: 'Gas - Forced Air',
            heatYr: 'Complete Update',
            cooling: 'Central Air',
            plumbYr: 'Partial Update',
            elecYr: 'Complete Update',
            sewer: 'Public',
            waterSource: 'Public',
            // Hazards / Safety
            burglarAlarm: 'Local',
            fireAlarm: 'Local',
            sprinklers: '',
            smokeDetector: 'Local',
            deadbolt: 'Yes',
            fireExtinguisher: 'Yes',
            pool: 'Above Ground',
            trampoline: 'Yes with Safety Net',
            woodStove: 'None',
            secondaryHeating: '',
            dogInfo: '1 Golden Retriever, 4 yrs',
            businessOnProperty: 'No',
            fireStationDist: '3',
            fireHydrantFeet: '1-500',
            tidalWaterDist: 'more than 5',
            protectionClass: '4',
            // Home Coverage
            homePolicyType: 'HO3',
            dwellingCoverage: '425000',
            otherStructures: '42500',
            homePersonalProperty: '212500',
            homeLossOfUse: '85000',
            personalLiability: '300000',
            medicalPayments: '5000',
            homeDeductible: '1000',
            windDeductible: '2%',
            mortgagee: 'US Bank NA — Loan #4488-7721',
            // Home Endorsements
            increasedReplacementCost: '125',
            ordinanceOrLaw: '10',
            waterBackup: '5000',
            lossAssessment: '25000',
            animalLiability: '100000',
            theftDeductible: '500',
            jewelryLimit: '5000',
            creditCardCoverage: '5000',
            moldDamage: '50000',
            equipmentBreakdown: 'Yes',
            serviceLine: 'Yes',
            additionalInsureds: 'Sample Relative (mother-in-law)\n123 Sample St, Vancouver WA 98686',
            earthquakeCoverage: 'No',
            earthquakeZone: '',
            earthquakeDeductible: '',

            // ── Step 4: Auto & Driving ──
            autoPolicyType: 'Standard',
            residenceIs: 'Home (owned)',
            liabilityLimits: '100/300',
            pdLimit: '100000',
            medPayments: '5000',
            umLimits: '100/300',
            uimLimits: '100/300',
            umpdLimit: '50000',
            compDeductible: '500',
            autoDeductible: '500',
            rentalDeductible: '50/1500',
            towingDeductible: '100',
            studentGPA: '',
            accidents: '0',
            violations: '0',

            // ── Step 5: Insurance History ──
            policyTerm: '12 Month',
            effectiveDate: '2026-04-01',
            homePriorCarrier: 'Safeco',
            homePriorPolicyTerm: '12 Month',
            homePriorYears: '4',
            homePriorExp: '2026-03-31',
            homePriorLiability: '$300,000',
            priorCarrier: 'State Farm',
            priorPolicyTerm: '6 Month',
            priorLiabilityLimits: '50/100',
            priorYears: '6',
            continuousCoverage: '8',
            priorExp: '2026-03-31',
            creditCheckAuth: true,

            // ── Notes / Contact ──
            referralSource: 'Referral',
            contactTime: 'Morning',
            contactMethod: 'Email',
            tcpaConsent: true,
            pdfNotes: 'Client referred by Jake Torres at First National Mortgage. Needs quote before closing on April 15. Currently insured with Safeco (home) and State Farm (auto) — looking to bundle. Pool is above-ground with safety fence and locking ladder. Trampoline has net enclosure. Golden Retriever is friendly, no bite history.',
        };

        // Apply all form data
        this.applyData(demo);

        // Set qType radio button
        const qTypeRadio = document.querySelector('input[name="qType"][value="both"]');
        if (qTypeRadio) qTypeRadio.checked = true;
        this.handleType();

        // Show co-applicant section
        const coCheck = document.getElementById('hasCoApplicant');
        if (coCheck) {
            coCheck.checked = true;
            this.toggleCoApplicant();
        }

        // ── Demo Drivers ──
        this.drivers = [
            {
                id: 'driver_demo_1',
                firstName: 'Sample',
                lastName: 'Client',
                dob: '1985-07-22',
                gender: 'F',
                maritalStatus: 'Married',
                dlNum: 'SMPLCL385RG',
                dlState: 'WA',
                dlStatus: 'Valid',
                relationship: 'Self',
                isCoApplicant: false,
                occupation: 'Marketing Manager',
                education: 'Bachelors',
                ageLicensed: '16',
                sr22: 'No',
                fr44: 'No',
                goodDriver: 'Yes',
                matureDriver: 'No',
                licenseSusRev: 'No',
                driverEducation: 'No'
            },
            {
                id: 'driver_demo_2',
                firstName: 'Sample',
                lastName: 'Spouse',
                dob: '1983-03-15',
                gender: 'M',
                maritalStatus: 'Married',
                dlNum: 'SMPLSP383QK',
                dlState: 'WA',
                dlStatus: 'Valid',
                relationship: 'Spouse',
                isCoApplicant: true,
                occupation: 'Software Engineer',
                education: 'Masters',
                ageLicensed: '16',
                sr22: 'No',
                fr44: 'No',
                goodDriver: 'Yes',
                matureDriver: 'No',
                licenseSusRev: 'No',
                driverEducation: 'No'
            }
        ];

        // ── Demo Vehicles ──
        this.vehicles = [
            {
                id: 'vehicle_demo_1',
                vin: '1HGCV1F34LA012345',
                year: '2020',
                make: 'Honda',
                model: 'Accord',
                use: 'Commute',
                miles: '14000',
                primaryDriver: 'driver_demo_1',
                ownershipType: 'Owned',
                performance: 'Standard',
                antiTheft: 'Active',
                passiveRestraints: 'Both Front & Side',
                antiLockBrakes: 'Yes',
                daytimeRunningLights: 'Yes',
                carNew: 'No',
                telematics: 'No',
                carPool: 'No',
                tnc: 'No'
            },
            {
                id: 'vehicle_demo_2',
                vin: '5YFBURHE1LP987654',
                year: '2022',
                make: 'Toyota',
                model: 'Camry',
                use: 'Commute',
                miles: '11000',
                primaryDriver: 'driver_demo_2',
                ownershipType: 'Lien',
                performance: 'Standard',
                antiTheft: 'Alarm Only',
                passiveRestraints: 'Both Front & Side',
                antiLockBrakes: 'Yes',
                daytimeRunningLights: 'Yes',
                carNew: 'No',
                telematics: 'Yes',
                carPool: 'No',
                tnc: 'No'
            }
        ];

        // Save drivers/vehicles into App.data and render cards
        this.saveDriversVehicles();
        if (typeof this.renderDriverCards === 'function') this.renderDriverCards();
        if (typeof this.renderVehicleCards === 'function') this.renderVehicleCards();

        // Save to localStorage
        this.save();

        // Navigate to step 1 (Client Info)
        this.step = 0;
        this.next();

        this.toast('🧪 Demo client loaded');
    },

    // ═══════════════════════════════════════════════════════════
    // ── Dynamic Occupation Dropdown (Industry → Occupation) ──
    // ═══════════════════════════════════════════════════════════
    // Occupation titles sourced from EZLynx schema to ensure exact match on auto-fill.

    _OCCUPATIONS_BY_INDUSTRY: {
        'Homemaker/House person': ['Homemaker'],
        'Retired': ['Retired'],
        'Disabled': ['Disabled'],
        'Unemployed': ['Unemployed'],
        'Student': ['Student'],
        'Agriculture/Forestry/Fishing': ['Farm/Ranch Owner', 'Farm/Ranch Worker', 'Fisherman', 'Forester', 'Laborer', 'Landscaper/Groundskeeper', 'Logger', 'Nursery Worker', 'Rancher', 'Supervisor', 'Other'],
        'Art/Design/Media': ['Actor', 'Announcer/Broadcaster', 'Artist', 'Author/Writer', 'Dancer', 'Designer', 'Director', 'Editor', 'Journalist/Reporter', 'Musician', 'Photographer', 'Printer', 'Producer', 'Other'],
        'Banking/Finance/Real Estate': ['Accountant/Auditor', 'Analyst', 'Appraiser', 'Bank Teller', 'Banker', 'Branch Manager', 'Broker', 'Clerk', 'Controller', 'Financial Planner', 'Investment Banker', 'Loan Officer', 'Real Estate Agent/Broker', 'Tax Preparer', 'Trader', 'Underwriter', 'Other'],
        'Business/Sales/Office': ['Account Executive', 'Administrative Assistant', 'Buyer', 'Cashier/Checker', 'Clerk', 'Customer Service Representative', 'Director/Administrator', 'Executive', 'Human Resources', 'Manager', 'Marketing', 'Office Manager', 'Receptionist/Secretary', 'Sales Representative', 'Supervisor', 'Other'],
        'Construction/Energy Trades': ['Carpenter', 'Contractor', 'Electrician', 'Foreman/Supervisor', 'Handyman', 'HVAC Technician', 'Laborer', 'Painter', 'Plumber', 'Project Manager', 'Roofer', 'Utility Worker', 'Welder', 'Other'],
        'Education/Library': ['College Professor', 'Counselor', 'Instructor', 'Librarian', 'Principal', 'School Administrator', 'Teacher', 'Teacher Aide', 'Tutor', 'Other'],
        'Engineer/Architect/Science/Math': ['Actuary', 'Architect', 'Chemist', 'Drafter', 'Engineer', 'Lab Technician', 'Mathematician', 'Research Analyst', 'Scientist', 'Surveyor', 'Technician', 'Other'],
        'Government/Military': ['Commissioned Officer', 'Enlisted', 'Federal Worker', 'Fire Fighter', 'Letter Carrier/Mail', 'Military - Enlisted', 'Military - Officer', 'Postal Worker', 'State/Local Worker', 'Other'],
        'Information Technology': ['Analyst', 'Computer Programmer', 'Database Administrator', 'Help Desk', 'IT Manager', 'Network Administrator', 'Software Developer', 'Systems Administrator', 'Technical Support', 'Web Developer', 'Other'],
        'Insurance': ['Accountant/Auditor', 'Actuarial Clerk', 'Actuary', 'Administrative Assistant', 'Agent/Broker', 'Analyst', 'Attorney', 'Claims Adjuster', 'Clerk', 'Commissioner', 'Customer Service Representative', 'Director/Administrator', 'Executive', 'Product Manager', 'Receptionist/Secretary', 'Sales Representative', 'Underwriter', 'Other'],
        'Legal/Law Enforcement/Security': ['Attorney', 'Bailiff', 'Corrections Officer', 'Court Clerk', 'Detective', 'Guard', 'Judge', 'Legal Assistant/Paralegal', 'Police Officer', 'Security Guard', 'Sheriff', 'Other'],
        'Maintenance/Repair/Housekeeping': ['Custodian/Janitor', 'Housekeeper', 'Maintenance Worker', 'Mechanic', 'Other'],
        'Manufacturing/Production': ['Assembler', 'Factory Worker', 'Foreman/Supervisor', 'Inspector', 'Machine Operator', 'Packer', 'Plant Manager', 'Quality Control', 'Technician', 'Warehouse Worker', 'Other'],
        'Medical/Social Services/Religion': ['Chiropractor', 'Clergy', 'Counselor', 'Dental Hygienist', 'Dentist', 'EMT/Paramedic', 'Lab Technician', 'Nurse - Licensed', 'Nurse - Registered', 'Optometrist', 'Pharmacist', 'Physician/Surgeon', 'Social Worker', 'Therapist', 'Veterinarian', 'Other'],
        'Personal Care/Service': ['Barber/Hairstylist', 'Child/Day Care Worker', 'Cosmetologist', 'Fitness Trainer', 'Funeral Director', 'Pet Groomer', 'Other'],
        'Restaurant/Hotel Services': ['Baker', 'Bartender', 'Bus Person', 'Chef/Cook', 'Desk Clerk', 'Host/Hostess', 'Hotel Manager', 'Restaurant Manager', 'Server', 'Wait Staff', 'Other'],
        'Sports/Recreation': ['Athlete', 'Coach', 'Fitness Instructor', 'Lifeguard', 'Official/Referee', 'Recreation Worker', 'Other'],
        'Travel/Transportation/Warehousing': ['Air Traffic Controller', 'Bus Driver', 'Dispatcher', 'Driver/Trucker', 'Flight Attendant', 'Forklift Operator', 'Messenger/Courier', 'Mover', 'Pilot', 'Ship Captain/Officer', 'Taxi/Limo Driver', 'Travel Agent', 'Warehouse Worker', 'Other'],
        'Other': ['Accountant/Auditor', 'Administrative Assistant', 'Agent/Broker', 'Analyst', 'Clerk', 'Contractor', 'Customer Service Representative', 'Director/Administrator', 'Engineer', 'Executive', 'Laborer', 'Manager', 'Nurse - Registered', 'Sales Representative', 'Teacher', 'Other']
    },

    _initOccupationDropdown() {
        const industrySel = document.getElementById('industry');
        const occupationSel = document.getElementById('occupation');
        if (!industrySel || !occupationSel) return;

        // When industry changes → repopulate occupation select
        industrySel.addEventListener('change', () => {
            const savedOccupation = this.data.occupation || '';
            this._populateOccupation(industrySel.value, savedOccupation);
        });

        // Initial population based on loaded data
        const currentIndustry = this.data.industry || industrySel.value || '';
        const currentOccupation = this.data.occupation || '';
        this._populateOccupation(currentIndustry, currentOccupation);
    },

    _populateOccupation(industry, currentValue) {
        const occupationSel = document.getElementById('occupation');
        if (!occupationSel) return;

        const titles = this._OCCUPATIONS_BY_INDUSTRY[industry] || [];
        let html = '<option value="">Select...</option>';
        titles.forEach(t => {
            const selected = (t === currentValue) ? ' selected' : '';
            html += `<option value="${t}"${selected}>${t}</option>`;
        });

        // If saved value doesn't match any option (legacy free-text), add it as a custom option
        if (currentValue && !titles.includes(currentValue)) {
            html += `<option value="${currentValue}" selected>${currentValue}</option>`;
        }

        occupationSel.innerHTML = html;
    },

    _populateCoOccupation(industry, currentValue) {
        const occupationSel = document.getElementById('coOccupation');
        if (!occupationSel) return;
        const map = this._OCCUPATIONS_BY_INDUSTRY || {};
        const occupations = (industry && map[industry]) ? [...map[industry]] : [];
        if (occupations.length > 0 && !occupations.includes('Other')) occupations.push('Other');
        const current = currentValue || occupationSel.value;
        occupationSel.innerHTML = '<option value="">Select...</option>' +
            occupations.map(o => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('');
        if (current && !occupations.includes(current) && current !== '') {
            const opt = document.createElement('option');
            opt.value = current; opt.textContent = current; opt.selected = true;
            occupationSel.appendChild(opt);
        }
    },

});
