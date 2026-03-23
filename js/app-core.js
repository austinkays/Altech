// js/app-core.js — Core application logic (init, navigation, wizard, save/load, utilities)
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

// ── Validation module ──────────────────────────────────────────────────────
// Provides step-level required-field validation for the quoting wizard.
// Called by App.next() before advancing to the next step.
const Validation = {
    /**
     * Validate required fields for a given step number.
     * Returns an array of { field, message } objects — empty = valid.
     */
    validateStep(step) {
        const errors = [];
        if (step !== 5) return errors; // only step 5 has required-field gates right now

        const qType = document.querySelector('input[name="qType"]:checked')?.value || 'both';
        const needsAuto = qType === 'auto' || qType === 'both';
        const needsHome = qType === 'home' || qType === 'both';

        // ── Auto prior insurance (required when auto is being quoted) ──
        if (needsAuto) {
            const autoRequired = [
                { id: 'priorCarrier',        label: 'Prior Auto Carrier' },
                { id: 'priorPolicyTerm',     label: 'Prior Auto Policy Term' },
                { id: 'priorLiabilityLimits',label: 'Prior Liability Limits' },
                { id: 'priorYears',          label: 'Years with Prior Carrier' },
                { id: 'continuousCoverage',  label: 'Years with Continuous Coverage' },
                { id: 'priorExp',            label: 'Prior Auto Policy Expiration' },
            ];
            autoRequired.forEach(({ id, label }) => {
                const el = document.getElementById(id);
                if (!el) return;
                const val = el.type === 'checkbox' ? el.checked : el.value;
                if (!val) errors.push({ field: id, message: `${label} is required` });
            });
        }

        // ── Home prior insurance (required when home is being quoted) ──
        if (needsHome) {
            const homeRequired = [
                { id: 'homePriorCarrier',    label: 'Prior Home Carrier' },
                { id: 'homePriorPolicyTerm', label: 'Prior Home Policy Term' },
                { id: 'homePriorLiability',  label: 'Prior Liability Level' },
                { id: 'homePriorYears',      label: 'Years with Prior Carrier (Home)' },
                { id: 'homePriorExp',        label: 'Prior Home Policy Expiration' },
            ];
            homeRequired.forEach(({ id, label }) => {
                const el = document.getElementById(id);
                if (!el) return;
                const val = el.type === 'checkbox' ? el.checked : el.value;
                if (!val) errors.push({ field: id, message: `${label} is required` });
            });
        }

        return errors;
    },

    /**
     * Insert a validation error message below the given field element.
     * Highlights the field border red.
     */
    showError(fieldId, message) {
        const el = document.getElementById(fieldId);
        if (!el) return;
        el.style.borderColor = 'var(--danger, #ff3b30)';

        const err = document.createElement('span');
        err.className = 'validation-error';
        err.textContent = message;
        el.insertAdjacentElement('afterend', err);
    },
};

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
        try { await this.renderQuoteList(); } catch(e) { console.error('[App.init] renderQuoteList() failed:', e); }
        try { this.renderClientHistory(); } catch(e) { console.error('[App.init] renderClientHistory() failed:', e); }

        // Resolve Gemini API key for local scanning (shared across App + PolicyQA)
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
                    // Only handle if Step 0 is active (PolicyQA has its own handler)
                    const step0 = document.getElementById('step-0');
                    if (!step0 || step0.style.display === 'none' || step0.classList.contains('hidden')) return;
                    // Skip if PolicyQA tool is active
                    const qnaTool = document.getElementById('qnaTool');
                    if (qnaTool && qnaTool.style.display !== 'none') return;

                    const paths = event.payload?.paths;
                    if (!paths?.length) return;

                    const status = document.getElementById('scanStatus');
                    if (status) { status.classList.remove('hidden'); status.textContent = '⏳ Processing dropped file...'; }

                    for (const filePath of paths) {
                        const fileName = filePath.split('\\').pop().split('/').pop();
                        console.log('[Step0 Drop] Processing:', fileName);
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
                        // Feed dropped files into the existing scan pipeline
                        const scanInput = document.getElementById('policyScanInput');
                        if (scanInput) {
                            // DataTransfer can't be assigned to input; trigger handleScanFiles directly
                            this.handleScanFiles({ target: { files: e.dataTransfer.files } });
                        }
                    }
                });
                scanDrop.addEventListener('click', () => this.openScanPicker());
            }
        }

        const scanInput = document.getElementById('policyScanInput');
        if (scanInput) {
            scanInput.addEventListener('change', (e) => this.handleScanFiles(e));
        }

        const initialDlInput = document.getElementById('initialDlScanInput');
        if (initialDlInput) {
            initialDlInput.addEventListener('change', (e) => this.handleInitialDriverLicenseFile(e.target.files[0]));
        }

        const docIntelInput = document.getElementById('docIntelInput');
        if (docIntelInput) {
            docIntelInput.addEventListener('change', (e) => this.handleDocIntelFiles(e));
        }
        
        // Auto-save listeners — use event delegation (one listener, not 200+)
        document.body.addEventListener('input', (e) => {
            if (e.target.matches('#quotingTool input, #quotingTool select, #quotingTool textarea')) {
                this.clearAutoFilledIndicator(e.target);
                this.save(e);
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

        // Secondary heating progressive disclosure
        const secHeatCheck = document.getElementById('hasSecondaryHeating');
        const secHeatWrap = document.getElementById('secondaryHeatingWrapper');
        if (secHeatCheck && secHeatWrap) {
            secHeatCheck.addEventListener('change', () => {
                secHeatWrap.classList.toggle('disclosure-hidden', !secHeatCheck.checked);
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
    async _getGeminiKey() {
        // Check AIProvider for any configured key (supports all providers)
        if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
            // For Google provider, return the key directly for legacy callers
            if (AIProvider.getProvider() === 'google') {
                return AIProvider.getApiKey();
            }
            // For non-Google providers, callers should use AIProvider.ask() instead
            // but still return any available Google key as fallback
        }
        if (this._geminiApiKey) return this._geminiApiKey;
        const saved = localStorage.getItem('gemini_api_key');
        if (saved) { this._geminiApiKey = saved; return saved; }
        if (typeof PolicyQA !== 'undefined' && PolicyQA._geminiApiKey) {
            this._geminiApiKey = PolicyQA._geminiApiKey;
            return this._geminiApiKey;
        }
        try {
            const res = await (typeof Auth !== 'undefined' ? Auth.apiFetch('/api/config?type=keys') : fetch('/api/config?type=keys'));
            if (res.ok) {
                const data = await res.json();
                if (data.geminiKey) { this._geminiApiKey = data.geminiKey; return data.geminiKey; }
            }
        } catch (_) {}
        return null;
    },

    initPlaces() {
        if (this._placesInitialized) return;
        const streetInput = document.getElementById('addrStreet');
        if (!streetInput || !window.google?.maps?.places) return;
        this._placesInitialized = true;

        let sessionToken = new google.maps.places.AutocompleteSessionToken();
        const autocomplete = new google.maps.places.Autocomplete(streetInput, {
            types: ['address'],
            componentRestrictions: { country: 'us' },
            fields: ['address_components', 'formatted_address'],
            sessionToken
        });

        const refreshSessionToken = () => {
            sessionToken = new google.maps.places.AutocompleteSessionToken();
            autocomplete.setOptions({ sessionToken });
        };

        streetInput.addEventListener('focus', () => refreshSessionToken());

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place || !place.address_components) {
                this.toast('⚠️ Address not found. Try a different entry.');
                return;
            }

            const parts = {
                street_number: '',
                route: '',
                locality: '',
                postal_town: '',
                administrative_area_level_1: '',
                administrative_area_level_2: '',
                postal_code: ''
            };

            place.address_components.forEach((component) => {
                const type = component.types?.[0];
                if (type && Object.prototype.hasOwnProperty.call(parts, type)) {
                    parts[type] = component.short_name || component.long_name || '';
                }
            });

            const street = [parts.street_number, parts.route].filter(Boolean).join(' ').trim();
            const city = parts.locality || parts.postal_town || '';
            const state = parts.administrative_area_level_1 || '';
            const zip = parts.postal_code || '';
            // County: Google returns "Clark County" — strip " County" suffix for EZLynx
            let county = parts.administrative_area_level_2 || '';
            county = county.replace(/\s*County$/i, '').trim();

            this.setFieldValue('addrStreet', street || place.formatted_address || '', { autoFilled: true, source: 'places' });
            this.setFieldValue('addrCity', city, { autoFilled: true, source: 'places' });
            this.setFieldValue('addrState', state, { autoFilled: true, source: 'places' });
            this.setFieldValue('addrZip', zip, { autoFilled: true, source: 'places' });
            if (county) {
                this.setFieldValue('county', county, { autoFilled: true, source: 'places' });
            }

            if (typeof this.scheduleMapPreviewUpdate === 'function') this.scheduleMapPreviewUpdate();

            refreshSessionToken();
        });
    },

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
                const driverList = document.getElementById('driverCardList');
                const vehicleList = document.getElementById('vehicleCardList');
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

    // Debounced client history auto-save (3s debounce, separate from form save)
    _clientHistorySaveTimeout: null,
    _scheduleClientHistorySave() {
        if (this._clientHistorySaveTimeout) clearTimeout(this._clientHistorySaveTimeout);
        this._clientHistorySaveTimeout = setTimeout(() => {
            try { this.autoSaveClient(); } catch(e) { console.warn('[AutoSave] Client history save error:', e); }
        }, 3000);
    },

    // Immediate client history save (no debounce) — for navigation, beforeunload, manual save
    _saveClientHistoryNow() {
        if (this._clientHistorySaveTimeout) clearTimeout(this._clientHistorySaveTimeout);
        try { this.autoSaveClient(); } catch(e) { console.warn('[AutoSave] Client history save error:', e); }
    },

    async save(e) {
        if (e && e.target) {
            const k = e.target.id || e.target.name;
            // hasCoApplicant uses 'yes'/'' string convention — toggleCoApplicant() is the sole authority
            if (e.target.type === 'checkbox' && k === 'hasCoApplicant') return;
            this.data[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

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
    CURRENT_SCHEMA_VERSION: 2,

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
        Object.keys(this.data).forEach(k => {
            const el = document.getElementById(k);
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

    // === CARRIER AUTOCOMPLETE ===
    _carrierListCache: null,

    getCarrierList() {
        if (this._carrierListCache) return this._carrierListCache;
        const dl = document.getElementById('carrierList');
        if (!dl) return [];
        this._carrierListCache = Array.from(dl.options).map(o => o.value).filter(Boolean);
        return this._carrierListCache;
    },

    initCarrierAutocomplete() {
        const carriers = this.getCarrierList();
        const optionsHTML = '<option value="">Select carrier...</option>' +
            carriers.map(c => {
                const esc = c.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
                return `<option value="${esc}">${esc}</option>`;
            }).join('');
        ['homePriorCarrier', 'priorCarrier'].forEach(id => {
            const el = document.getElementById(id);
            if (!el || el.tagName !== 'SELECT') return;
            el.innerHTML = optionsHTML;
            // Restore saved value
            if (this.data[id]) el.value = this.data[id];
        });
    },

    handleSameCarrier() {
        const qType = document.querySelector('input[name="qType"]:checked')?.value || 'both';
        if (qType === 'auto') {
            const cb2 = document.getElementById('sameAsHomeCarrier');
            if (cb2) cb2.checked = false;
            this.toast?.('No home carrier on file — this is an auto-only quote.', 'info');
            return;
        }
        const cb = document.getElementById('sameAsHomeCarrier');
        const autoInput = document.getElementById('priorCarrier');
        const homeInput = document.getElementById('homePriorCarrier');
        if (!cb || !autoInput || !homeInput) return;
        if (cb.checked) {
            autoInput.value = homeInput.value || '';
            autoInput.disabled = true;
            autoInput.style.opacity = '0.6';
            autoInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            autoInput.disabled = false;
            autoInput.style.opacity = '';
        }
        this.data.sameAsHomeCarrier = cb.checked;
    },

    validatePriorYearsCoverage() {
        const yearsEl = document.getElementById('priorYears');
        const covEl = document.getElementById('continuousCoverage');
        if (!yearsEl || !covEl) return;
        const yrsVal = yearsEl.value;
        const covVal = covEl.value;
        if (!yrsVal || !covVal) return;
        const yrs = yrsVal === 'More than 15' ? 16 : parseInt(yrsVal, 10);
        const cov = covVal === 'More than 15' ? 16 : parseInt(covVal, 10);
        if (isNaN(yrs) || isNaN(cov)) return;
        if (yrs >= 5 && cov < yrs) {
            // Auto-correct: continuous coverage should be at least as high as years with carrier
            const targetVal = yrs > 15 ? 'More than 15' : String(yrs);
            const opt = covEl.querySelector(`option[value="${targetVal}"]`);
            if (opt) {
                covEl.value = targetVal;
                covEl.dispatchEvent(new Event('change', { bubbles: true }));
                this.toast(`\u2139\ufe0f Continuous coverage updated to match ${yrsVal} years with carrier`);
            }
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

    fmtPhone(e) {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
        e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
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

    updatePrimaryHomeSection(val) {
        const section = document.getElementById('primaryHomeSection');
        if (!section) return;
        section.classList.toggle('hidden', !val || val === 'Primary');
    },

    toggleCoApplicant() {
        const cb = document.getElementById('hasCoApplicant');
        const section = document.getElementById('coApplicantSection');
        if (!cb || !section) return;
        const show = cb.checked;
        section.classList.toggle('visible', show);
        this.data.hasCoApplicant = show ? 'yes' : '';
        this.save({});

        // Sync co-applicant as Driver 2 for auto/both quotes
        const qType = (document.querySelector('input[name="qType"]:checked') || {}).value || 'both';
        const isAuto = qType === 'auto' || qType === 'both';
        if (isAuto) {
            if (show) {
                this.syncCoApplicantToDriver();
            } else {
                // Remove synced driver
                this.drivers = this.drivers.filter(d => !d.isCoApplicant);
                this.renderDrivers();
                this.renderVehicles();
                this.saveDriversVehicles();
            }
        }
    },

    /**
     * Syncs primary applicant (Step 1) form data to a paired driver entry.
     * Locks Name, DOB, Gender, Marital Status — other fields stay editable.
     * Mirrors the co-applicant sync pattern but uses isPrimaryApplicant flag.
     */
    // Maps Step 1 education values (verbose) to the shorter driver-card select values.
    _mapEducationToDriverCard(val) {
        const map = {
            'No High School Diploma': 'No High School',
            'High School Diploma':    'High School',
            'Some College - No Degree': 'Some College',
            'Vocational/Technical Degree': 'Some College',
            'Associates Degree': 'Associates',
            'Phd':            'Doctorate',
            'Medical Degree': 'Doctorate',
            'Law Degree':     'Doctorate',
        };
        return map[val] || val;  // 'Bachelors' / 'Masters' pass through unchanged
    },

    syncPrimaryApplicantToDriver() {
        const first = (this.data.firstName || '').trim();
        const last = (this.data.lastName || '').trim();
        const dob = (this.data.dob || '').trim();
        const gender = (this.data.gender || '').trim();
        const marital = (this.data.maritalStatus || '').trim();
        const education = (this.data.education || '').trim();
        const industry = (this.data.industry || '').trim();

        // Find existing synced driver or create one
        let synced = this.drivers.find(d => d.isPrimaryApplicant);
        if (!synced) {
            synced = {
                id: `primary_${Date.now()}`,
                firstName: '',
                lastName: '',
                dob: '',
                dlNum: '',
                dlState: 'WA',
                relationship: 'Self',
                isPrimaryApplicant: true,
                isCoApplicant: false
            };
            this.drivers.unshift(synced); // Always first
        }

        // Overwrite locked fields from Step 1
        synced.firstName = first;
        synced.lastName = last;
        synced.dob = dob;
        synced.gender = gender;
        synced.maritalStatus = marital;
        synced.education = this._mapEducationToDriverCard(education);
        synced.occupation = industry;  // industry category → driver's "Occupation Industry" dropdown
        synced.industry = industry;
    },

    /**
     * Attaches change/blur listeners on Step 1 applicant fields so edits
     * auto-sync into the paired driver entry. Idempotent (dataset guard).
     */
    restorePrimaryApplicantUI() {
        const syncFields = ['firstName', 'lastName', 'dob', 'gender', 'maritalStatus', 'education', 'occupation', 'industry'];
        syncFields.forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if (el && !el.dataset.primarySyncBound) {
                el.dataset.primarySyncBound = '1';
                const handler = () => {
                    this.syncPrimaryApplicantToDriver();
                    this.renderDrivers();
                    this.renderVehicles();
                    this.saveDriversVehicles();
                };
                el.addEventListener('change', handler);
                if (el.tagName === 'INPUT') {
                    el.addEventListener('blur', handler);
                }
            }
        });
    },

    /**
     * Syncs co-applicant form data to a paired driver entry.
     * Locks Name, DOB, Gender, Relationship, MaritalStatus, Occupation (Industry), Education.
     * @param {object} [options]
     * @param {boolean} [options.skipRender=false] Skip renderDrivers/Vehicles calls (used when
     *   the caller will render immediately after, e.g. updateUI step-4 block).
     */
    syncCoApplicantToDriver(options = {}) {
        const coFirst = (this.data.coFirstName || '').trim();
        const coLast = (this.data.coLastName || '').trim();
        const coDob = (this.data.coDob || '').trim();
        const coGender = (this.data.coGender || '').trim();
        const coRelationship = (this.data.coRelationship || 'Spouse').trim();

        // Find existing synced driver or create one
        let synced = this.drivers.find(d => d.isCoApplicant);
        if (!synced) {
            synced = {
                id: `coapp_${Date.now()}`,
                firstName: '',
                lastName: '',
                dob: '',
                dlNum: '',
                dlState: 'WA',
                relationship: 'Spouse',
                isCoApplicant: true
            };
            this.drivers.push(synced);
        }

        // Only overwrite locked fields (Name, DOB, Gender, Relationship)
        synced.firstName = coFirst;
        synced.lastName = coLast;
        synced.dob = coDob;
        synced.gender = coGender;
        synced.relationship = coRelationship === 'Domestic Partner' ? 'Spouse' : (coRelationship || 'Spouse');

        const coMarital = (this.data.coMaritalStatus || '').trim();
        const coEducation = (this.data.coEducation || '').trim();
        const coIndustry = (this.data.coIndustry || '').trim();
        // Only overwrite when Step 1 has a value — don't wipe existing driver card data with empty.
        // Fields are locked in LOCKED_FIELDS so user cannot manually override via driver card UI.
        if (coMarital) synced.maritalStatus = coMarital;
        if (coEducation) synced.education = this._mapEducationToDriverCard(coEducation);
        if (coIndustry) {
            synced.occupation = coIndustry;  // industry category → driver's "Occupation Industry" dropdown
            synced.industry = coIndustry;
        }

        const { skipRender = false } = options;
        if (!skipRender) {
            this.renderDrivers();
            this.renderVehicles();
            this.saveDriversVehicles();
        }
    },

    restoreCoApplicantUI() {
        const cb = document.getElementById('hasCoApplicant');
        const section = document.getElementById('coApplicantSection');
        if (!cb || !section) return;
        const show = this.data.hasCoApplicant === 'yes';
        cb.checked = show;
        section.classList.toggle('visible', show);

        // Attach co-applicant → driver sync listeners (idempotent)
        const syncFields = ['coFirstName', 'coLastName', 'coDob', 'coGender', 'coRelationship',
                    'coMaritalStatus', 'coEducation', 'coOccupation', 'coIndustry'];
        syncFields.forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if (el && !el.dataset.coSyncBound) {
                el.dataset.coSyncBound = '1';
                el.addEventListener('change', () => {
                    if (this.data.hasCoApplicant === 'yes') {
                        this.syncCoApplicantToDriver();
                    }
                });
                if (el.tagName === 'INPUT') {
                    el.addEventListener('blur', () => {
                        if (this.data.hasCoApplicant === 'yes') {
                            this.syncCoApplicantToDriver();
                        }
                    });
                }
            }
        });

        // If already enabled and has auto workflow, ensure synced driver exists
        if (show) {
            const qType = (document.querySelector('input[name="qType"]:checked') || {}).value || 'both';
            if (qType === 'auto' || qType === 'both') {
                const hasSynced = this.drivers && this.drivers.some(d => d.isCoApplicant);
                if (!hasSynced) this.syncCoApplicantToDriver();
            }
        }
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
        const key = 'altech_export_history';
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
            entries = Utils.tryParseLS('altech_export_history', []);
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
                            const esc = typeof this._escapeAttr === 'function' ? this._escapeAttr.bind(this) : (s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
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
                <button class="btn btn-tertiary" onclick="if(confirm('Clear export history?')){localStorage.removeItem('altech_export_history');fetch('/local/export-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).catch(()=>{});App.loadExportHistory();}">Clear History</button>
            </div>
        `;
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
            firstName: 'Sarah',
            lastName: 'Mitchell',
            suffix: '',
            dob: '1985-07-22',
            gender: 'F',
            maritalStatus: 'Married',
            email: 'sarah.mitchell@example.com',
            phone: '3605559876',
            // Co-Applicant
            hasCoApplicant: 'yes',
            coFirstName: 'David',
            coLastName: 'Mitchell',
            coDob: '1983-03-15',
            coGender: 'M',
            coEmail: 'david.mitchell@example.com',
            coPhone: '3605559877',
            coRelationship: 'Spouse',
            coEducation: 'Bachelors',
            coOccupation: 'Software Engineer',
            coIndustry: 'Information Technology',

            // ── Step 2: Coverage Type & Demographics ──
            qType: 'both',
            education: 'Bachelors',
            occupation: 'Marketing Manager',
            industry: 'Advertising',

            // ── Step 3: Property Details ──
            addrStreet: '2847 Evergreen Terrace',
            addrCity: 'Vancouver',
            addrState: 'WA',
            addrZip: '98686',
            county: 'Clark',
            yearsAtAddress: '6',
            dwellingUsage: 'Primary',
            occupancyType: 'Owner',
            dwellingType: 'Single Family',
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
            foundation: 'Full Basement',
            kitchenQuality: 'Standard',
            garageType: 'Attached',
            garageSpaces: '2',
            roofType: 'Architectural Shingles',
            roofShape: 'Gable',
            roofYr: '2018',
            heatingType: 'Gas - Forced Air',
            cooling: 'Central Air',
            sewer: 'Public',
            waterSource: 'Public',
            flooring: 'Hardwood',
            numFireplaces: '1',
            fireStationDist: '3',
            fireHydrantFeet: '1-500',
            protectionClass: '4',
            burglarAlarm: 'Local',
            fireAlarm: 'Local',
            sprinklers: 'None',
            smokeDetector: 'Local',
            pool: 'No',
            trampoline: 'No',
            woodStove: 'No',
            dogInfo: '',
            businessOnProperty: '',
            // Home Coverage
            homePolicyType: 'HO3',
            dwellingCoverage: '425000',
            personalLiability: '300000',
            medicalPayments: '5000',
            homeDeductible: '1000',
            windDeductible: '2%',
            mortgagee: 'US Bank NA',

            // ── Step 4: Auto & Driving ──
            accidents: '0',
            violations: '0',
            autoPolicyType: 'Standard',
            liabilityLimits: '100/300',
            pdLimit: '100000',
            umLimits: '100/300',
            uimLimits: '100/300',
            compDeductible: '500',
            autoDeductible: '500',
            medPayments: '5000',
            rentalDeductible: '50/day',
            towingDeductible: '100',

            // ── Step 5: Insurance History ──
            policyTerm: '12 Month',
            effectiveDate: '2026-04-01',
            homePriorCarrier: 'Safeco',
            homePriorPolicyTerm: '12 Month',
            homePriorYears: '4',
            homePriorExp: '2026-03-31',
            priorCarrier: 'State Farm',
            priorPolicyTerm: '6 Month',
            priorLiabilityLimits: '50/100',
            priorYears: '6',
            continuousCoverage: '8',
            priorExp: '2026-03-31',
            additionalInsureds: '',
            contactTime: 'Morning',
            contactMethod: 'Email',
            referralSource: 'Referral',
            tcpaConsent: true,
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
                firstName: 'Sarah',
                lastName: 'Mitchell',
                dob: '1985-07-22',
                gender: 'F',
                maritalStatus: 'Married',
                dlNum: 'MITCSA385RG',
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
                firstName: 'David',
                lastName: 'Mitchell',
                dob: '1983-03-15',
                gender: 'M',
                maritalStatus: 'Married',
                dlNum: 'MITCDA383QK',
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

        this.toast('🧪 Demo client loaded — Sarah & David Mitchell');
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

    // ── AI Settings Management ───────────────────────────────────

    /** Load saved AI settings into the settings UI */
    loadAISettings() {
        if (typeof AIProvider === 'undefined') return;
        const s = AIProvider.getSettings();
        const providerSel = document.getElementById('aiProviderSelect');
        const modelSel = document.getElementById('aiModelSelect');
        const keyInput = document.getElementById('aiApiKeyInput');
        if (providerSel) providerSel.value = s.provider || 'google';
        this._populateAIModels(s.provider || 'google');
        if (modelSel) modelSel.value = s.model || AIProvider.PROVIDERS[s.provider || 'google'].defaultModel;
        if (keyInput) keyInput.value = s.apiKey || '';
        this._updateAIProviderHint(s.provider || 'google');
    },

    /** Called when provider dropdown changes */
    onAIProviderChange() {
        const provider = document.getElementById('aiProviderSelect')?.value || 'google';
        this._populateAIModels(provider);
        this._updateAIProviderHint(provider);
        // Update key placeholder
        const keyInput = document.getElementById('aiApiKeyInput');
        const keyLink = document.getElementById('aiKeyLink');
        if (typeof AIProvider !== 'undefined') {
            const p = AIProvider.PROVIDERS[provider];
            if (keyInput) keyInput.placeholder = p?.keyPlaceholder || '';
            if (keyLink) {
                keyLink.href = p?.keyUrl || '#';
                keyLink.textContent = '(get key)';
            }
        }
    },

    /** Called when model dropdown changes */
    onAIModelChange() {
        const provider = document.getElementById('aiProviderSelect')?.value || 'google';
        this._updateModelInfo(provider);
    },

    /** Populate model dropdown based on selected provider */
    _populateAIModels(provider) {
        const sel = document.getElementById('aiModelSelect');
        if (!sel || typeof AIProvider === 'undefined') return;
        const models = AIProvider.PROVIDERS[provider]?.models || [];
        sel.innerHTML = models.map(m => {
            const cost = (m.costIn != null && m.costOut != null)
                ? ` [$${m.costIn}/$${m.costOut}/M]`
                : '';
            return `<option value="${m.id}">${m.label}${cost} — ${m.desc}</option>`;
        }).join('');
        this._updateModelInfo(provider);
    },

    /** Toggle the cost estimates panel */
    toggleCostEstimates() {
        const panel = document.getElementById('aiCostEstimates');
        const btn = document.getElementById('aiCostToggle');
        if (!panel) return;
        const show = panel.style.display === 'none';
        panel.style.display = show ? 'block' : 'none';
        if (btn) btn.textContent = show ? '▲ Hide cost per tool' : '▼ Show cost per tool';
    },

    // Token usage estimates per tool (inputTokens, outputTokens, hasImages, imageCount)
    _toolTokenEstimates: [
        { tool: 'Policy Scan (photo)',   icon: '📸', inputBase: 2500,  outputAvg: 2000, images: 2,  note: '1–10 page dec page scan' },
        { tool: 'Policy Scan (text)',    icon: '📄', inputBase: 10000, outputAvg: 2000, images: 0,  note: 'Desktop text import' },
        { tool: 'Policy Q&A (1 question)', icon: '💬', inputBase: 15000, outputAvg: 1000, images: 0, note: 'Varies with policy length' },
        { tool: 'GIS Property Extract',  icon: '🏠', inputBase: 1300,  outputAvg: 1000, images: 1,  note: 'County assessor screenshot' },
        { tool: 'Driver License Scan',   icon: '🪪', inputBase: 300,   outputAvg: 300,  images: 1,  note: 'Single DL photo' },
        { tool: 'Property Image Analysis',icon: '📷', inputBase: 800,   outputAvg: 400,  images: 1,  note: 'Roof/exterior photo' },
        { tool: 'Aerial Hazard Check',   icon: '🛰️', inputBase: 600,   outputAvg: 600,  images: 1,  note: 'Satellite imagery' },
        { tool: 'PDF Document Analysis', icon: '📋', inputBase: 800,   outputAvg: 600,  images: 1,  note: 'Tax/deed PDF page' },
        { tool: 'Prospect AI Dossier',   icon: '🔍', inputBase: 3500,  outputAvg: 6000, images: 0,  note: 'Full risk analysis' },
        { tool: 'Full Quote Intake',     icon: '⚡', inputBase: 18100, outputAvg: 6700, images: 5,  note: 'Scan + DL + property + Q&A' }
    ],

    /** Build cost estimate table for the selected model */
    _updateCostEstimates(model) {
        const table = document.getElementById('aiCostTable');
        if (!table) return;
        if (!model || model.costIn == null || model.costOut == null) {
            table.innerHTML = '<tr><td style="color:var(--text-secondary)">Select a model to see cost estimates</td></tr>';
            return;
        }
        const imgTokens = 1500; // avg tokens per image
        const fmt = (cents) => {
            if (cents < 0.01) return '<$0.01';
            if (cents < 1) return '$' + cents.toFixed(3);
            return '$' + cents.toFixed(2);
        };
        let html = '<tr style="border-bottom:1px solid var(--border,#BEC5D4)">' +
            '<td style="padding:3px 0;font-weight:600;color:var(--text)">Tool</td>' +
            '<td style="padding:3px 4px;font-weight:600;color:var(--text);text-align:right">Est. Cost</td>' +
            '<td style="padding:3px 0;font-weight:600;color:var(--text);text-align:right">Tokens</td></tr>';

        this._toolTokenEstimates.forEach(t => {
            const totalIn = t.inputBase + (t.images * imgTokens);
            const totalOut = t.outputAvg;
            const costIn = (totalIn / 1_000_000) * model.costIn;
            const costOut = (totalOut / 1_000_000) * model.costOut;
            const total = costIn + costOut;
            const totalTokens = totalIn + totalOut;
            const tokenStr = totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + 'K' : totalTokens;
            const isLast = t.tool === 'Full Quote Intake';
            const rowStyle = isLast ? 'border-top:1px solid var(--border,#BEC5D4);font-weight:600' : '';
            html += `<tr style="${rowStyle}">` +
                `<td style="padding:2px 0;color:var(--text)">${t.icon} ${t.tool}</td>` +
                `<td style="padding:2px 4px;text-align:right;color:var(--apple-blue);font-weight:600;white-space:nowrap">${fmt(total)}</td>` +
                `<td style="padding:2px 0;text-align:right;color:var(--text-secondary);white-space:nowrap">~${tokenStr}</td></tr>`;
        });

        table.innerHTML = html;
    },

    /** Show model details card for selected model */
    _updateModelInfo(provider) {
        const panel = document.getElementById('aiModelInfo');
        if (!panel || typeof AIProvider === 'undefined') return;
        const modelId = document.getElementById('aiModelSelect')?.value;
        const models = AIProvider.PROVIDERS[provider]?.models || [];
        const m = models.find(x => x.id === modelId);
        if (!m) { panel.style.display = 'none'; return; }

        panel.style.display = 'block';
        const nameEl = document.getElementById('aiModelInfoName');
        const costEl = document.getElementById('aiModelInfoCost');
        const ctxEl = document.getElementById('aiModelInfoContext');
        const tagsEl = document.getElementById('aiModelInfoTags');

        if (nameEl) nameEl.textContent = m.label;
        if (costEl) {
            costEl.textContent = (m.costIn != null && m.costOut != null)
                ? `$${m.costIn} in / $${m.costOut} out per M tokens`
                : 'Pricing varies';
        }
        if (ctxEl) ctxEl.textContent = m.context ? `Context: ${m.context} tokens` : '';

        if (tagsEl) {
            const TAG_LABELS = (typeof AIProvider !== 'undefined' && AIProvider.TAG_LABELS) ? AIProvider.TAG_LABELS : {};
            tagsEl.innerHTML = (m.tags || []).map(t => {
                const lbl = TAG_LABELS[t] || t;
                return `<span style="display:inline-block;padding:2px 7px;border-radius:6px;background:var(--bg-card,#fff);border:1px solid var(--border,#BEC5D4);font-size:10px;color:var(--text-secondary);white-space:nowrap">${lbl}</span>`;
            }).join('');
        }

        // Update cost estimates table
        this._updateCostEstimates(m);

        // Show/reset the toggle button
        const toggle = document.getElementById('aiCostToggle');
        if (toggle) toggle.style.display = 'block';
    },

    /** Update the hint text below settings */
    _updateAIProviderHint(provider) {
        const hint = document.getElementById('aiProviderHint');
        if (!hint) return;
        const hints = {
            google: 'Gemini 2.5 Flash is used by default. Free tier available at aistudio.google.com.',
            openrouter: 'OpenRouter gives you access to 100+ models with one API key — including Claude Opus, GPT-4o, Llama, and more. Pay per token at openrouter.ai.',
            openai: 'Use your OpenAI API key for GPT-4o and o3-mini. Requires an OpenAI account with billing enabled.',
            anthropic: 'Claude models from Anthropic. Requires a CORS proxy (routed through /api/anthropic-proxy). Best-in-class for document analysis.'
        };
        hint.textContent = hints[provider] || '';
    },

    /** Save agency name from the account settings field */
    saveAgencyName(name) {
        const trimmed = (name || '').trim();
        try {
            const existing = Utils.tryParseLS('altech_agency_profile', {});
            existing.agencyName = trimmed || 'Altech Insurance Agency';
            localStorage.setItem('altech_agency_profile', JSON.stringify(existing));
            if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) CloudSync.schedulePush();
            this.toast('\u2705 Agency name saved');
        } catch (e) {
            this.toast('Could not save agency name', { type: 'error' });
        }
    },

    /** Save AI settings from the form */
    saveAISettings() {
        if (typeof AIProvider === 'undefined') return;
        const provider = document.getElementById('aiProviderSelect')?.value || 'google';
        const model = document.getElementById('aiModelSelect')?.value || '';
        const apiKey = document.getElementById('aiApiKeyInput')?.value?.trim() || '';
        AIProvider.saveSettings({ provider, model, apiKey });
        // Reset cached key so _getGeminiKey re-resolves
        this._geminiApiKey = null;
        this.toast('\u2705 AI settings saved — ' + (AIProvider.PROVIDERS[provider]?.name || provider));
    },

    /** Toggle visibility of the API key field */
    toggleAIKeyVisibility() {
        const input = document.getElementById('aiApiKeyInput');
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
    },

    /** Test connection to the configured AI provider */
    async testAIConnection() {
        if (typeof AIProvider === 'undefined') return;
        const btn = document.getElementById('aiTestBtn');
        const result = document.getElementById('aiTestResult');
        if (btn) { btn.disabled = true; btn.textContent = 'Testing...'; }
        // Temporarily save current form values for the test
        const provider = document.getElementById('aiProviderSelect')?.value || 'google';
        const model = document.getElementById('aiModelSelect')?.value || '';
        const apiKey = document.getElementById('aiApiKeyInput')?.value?.trim() || '';
        const prev = AIProvider.getSettings();
        AIProvider.saveSettings({ provider, model, apiKey });

        const test = await AIProvider.testConnection();

        if (result) {
            result.style.display = 'block';
            if (test.success) {
                result.style.background = 'rgba(52,199,89,0.1)';
                result.style.color = 'var(--success, #34C759)';
                result.textContent = '\u2705 Connected! Response: ' + (test.text || 'OK').slice(0, 50);
            } else {
                result.style.background = 'rgba(255,59,48,0.1)';
                result.style.color = 'var(--danger, #FF3B30)';
                result.textContent = '\u274C ' + (test.error || 'Connection failed');
                // Restore previous settings on failure
                AIProvider.saveSettings(prev);
            }
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Test Connection'; }
    }
});
