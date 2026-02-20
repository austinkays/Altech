// js/app-core.js — Core application logic (init, navigation, wizard, save/load, utilities)
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

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
            }
        });

        // Carrier autocomplete
        this.initCarrierAutocomplete();

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
        document.getElementById('phone').addEventListener('input', this.fmtPhone);

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

        // Map previews: update when address fields change
        ['addrStreet', 'addrCity', 'addrState', 'addrZip'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.scheduleMapPreviewUpdate());
                el.addEventListener('change', () => this.scheduleMapPreviewUpdate());
            }
        });

        // Initial preview render if address already exists
        this.updateMapPreviews();

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
    async _getGeminiKey() {
        if (this._geminiApiKey) return this._geminiApiKey;
        const saved = localStorage.getItem('gemini_api_key');
        if (saved) { this._geminiApiKey = saved; return saved; }
        if (typeof PolicyQA !== 'undefined' && PolicyQA._geminiApiKey) {
            this._geminiApiKey = PolicyQA._geminiApiKey;
            return this._geminiApiKey;
        }
        try {
            const res = await (typeof Auth !== 'undefined' ? Auth.apiFetch('/api/places-config') : fetch('/api/places-config'));
            if (res.ok) {
                const data = await res.json();
                if (data.geminiKey) { this._geminiApiKey = data.geminiKey; return data.geminiKey; }
            }
        } catch (_) {}
        return null;
    },

    // Dark Mode Functions
    updateDarkModeIcons(isDark) {
        const moonSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        const sunSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        document.querySelectorAll('.dark-mode-icon').forEach(icon => {
            icon.innerHTML = isDark ? sunSVG : moonSVG;
        });
    },

    loadDarkMode() {
        const darkMode = localStorage.getItem('altech_dark_mode');
        // Default to dark mode when no preference is stored
        const isDark = darkMode === null ? true : darkMode === 'true';
        if (isDark) {
            document.body.classList.add('dark-mode');
        }
        this.updateDarkModeIcons(isDark);
    },

    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('altech_dark_mode', isDark);
        this.updateDarkModeIcons(isDark);
        // Sync dark mode preference to cloud
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
    },

    initPlaces() {
        const streetInput = document.getElementById('addrStreet');
        if (!streetInput || !window.google?.maps?.places) return;

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

            this.setFieldValue('addrStreet', street || place.formatted_address || '', { autoFilled: true, source: 'places' });
            this.setFieldValue('addrCity', city, { autoFilled: true, source: 'places' });
            this.setFieldValue('addrState', state, { autoFilled: true, source: 'places' });
            this.setFieldValue('addrZip', zip, { autoFilled: true, source: 'places' });

            this.scheduleMapPreviewUpdate();

            refreshSessionToken();
        });
    },

    setFieldValue(id, value, options = {}) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value || '';
        this.data[id] = el.value;
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));

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

        // Move to next step automatically after selection
        if (this.step === 2) {
            this.step++;
        }
        
        // Reset step if out of bounds
        if (this.step >= this.flow.length) this.step = 0;
        this.updateUI();
        this.save({ target: document.querySelector('input[name="qType"]:checked') });
    },

    updateUI() {
        if (!this.flow || this.flow.length === 0) {
            console.warn('[App.updateUI] flow empty, calling handleType()');
            this.handleType();
            return; // handleType calls updateUI, avoid recursion
        }
        document.querySelectorAll('.step').forEach(e => e.classList.add('hidden'));
        const curId = this.flow[this.step];
        if (!curId) {
            console.error('[App.updateUI] No step at index', this.step);
            this.step = 0;
            return this.updateUI();
        }
        const curEl = document.getElementById(curId);
        if (!curEl) {
            console.error('[App.updateUI] Element not found:', curId);
            return;
        }
        curEl.classList.remove('hidden');

        // Show/hide insurance history cards based on qType
        const qType = document.querySelector('input[name="qType"]:checked')?.value || 'both';
        const showHome = qType === 'home' || qType === 'both';
        const showAuto = qType === 'auto' || qType === 'both';
        const homeCard = document.getElementById('homePriorCard');
        const autoCard = document.getElementById('autoPriorCard');
        if (homeCard) homeCard.style.display = showHome ? '' : 'none';
        if (autoCard) autoCard.style.display = showAuto ? '' : 'none';
        
        // Render drivers/vehicles when landing on step 4
        if (curId === 'step-4') {
            this.renderDrivers();
            this.renderVehicles();
            
            // Auto-add primary applicant as first driver if empty
            if (this.drivers.length === 0 && this.data.firstName) {
                this.drivers.push({
                    id: `driver_${Date.now()}`,
                    firstName: this.data.firstName || '',
                    lastName: this.data.lastName || '',
                    dob: this.data.dob || '',
                    dlNum: '',
                    dlState: 'WA',
                    relationship: 'Self'
                });
                this.renderDrivers();
            }
        }
        
        // Render client history on Quick Start page
        if (curId === 'step-0') {
            this.renderStep0ClientHistory();
        }

        // Auto-select current data when landing on export page
        if (curId === 'step-6') {
            this.autoSaveClient();
            this.renderClientHistory();
        }
        
        // Update step title
        const stepTitle = document.getElementById('stepTitle');
        const totalSteps = this.flow.length;
        const currentStep = this.step + 1;
        const stepName = this.stepTitles[curId] || 'Step';
        stepTitle.textContent = `Step ${currentStep} of ${totalSteps}: ${stepName}`;
        this.updateBreadcrumb();
        
        // Progress
        const pct = ((this.step + 1) / this.flow.length) * 100;
        document.getElementById('progressBar').style.width = pct + '%';
        
        // Buttons
        const back = document.getElementById('btnBack');
        const next = document.getElementById('btnNext');
        back.disabled = this.step === 0;
        next.textContent = this.step === this.flow.length - 1 ? 'Finish' : 'Next';
        
        document.getElementById('mainContainer').scrollTo(0,0);
    },

    next() {
        try {
            // Auto-init flow if somehow empty
            if (!this.flow || this.flow.length === 0) {
                console.warn('[App.next] flow was empty, calling handleType()');
                this.handleType();
            }

            // Validate current step before proceeding
            const curStepId = this.flow[this.step];
            if (!curStepId) {
                console.error('[App.next] No step at index', this.step, 'flow:', this.flow);
                return;
            }
            const stepNumber = parseInt(curStepId.split('-')[1]);
            
            if (typeof Validation !== 'undefined') {
                const errors = Validation.validateStep(stepNumber);
                
                // Clear all previous errors
                document.querySelectorAll('.validation-error').forEach(e => e.remove());
                document.querySelectorAll('input, select, textarea').forEach(el => {
                    el.style.borderColor = '';
                    el.style.background = '';
                });
                
                // Show new errors
                if (errors.length > 0) {
                    errors.forEach(err => {
                        if (err.field) {
                            Validation.showError(err.field, err.message);
                        }
                    });
                    
                    // Scroll to first error
                    const firstError = document.querySelector('.validation-error');
                    if (firstError) {
                        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    
                    this.toast('⚠️ Please fix validation errors before continuing');
                    return; // Don't proceed
                }
            }
            
            if (this.step < this.flow.length - 1) {
                this.step++;
                this.updateUI();
            }
        } catch(e) {
            console.error('[App.next] Error:', e);
        }
    },
    prev() {
        try {
            if (!this.flow || this.flow.length === 0) {
                console.warn('[App.prev] flow was empty, calling handleType()');
                this.handleType();
            }
            if (this.step > 0) {
                this.step--;
                this.updateUI();
            }
        } catch(e) {
            console.error('[App.prev] Error:', e);
        }
    },

    async save(e) {
        if (e && e.target) {
            const k = e.target.id || e.target.name;
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
        }, 500);
    },

    async load() {
        const s = localStorage.getItem(this.storageKey);
        if (!s) return;
        
        // Try decrypting first
        if (this.encryptionEnabled) {
            const decrypted = await CryptoHelper.decrypt(s);
            if (decrypted) {
                this.applyData(this._migrateSchema(decrypted));
            } else {
                console.warn('[App.load] Decryption returned null — stored data may be corrupt or key changed');
                this.toast('⚠️ Could not decrypt saved data. It may need to be re-entered.');
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
    CURRENT_SCHEMA_VERSION: 1,

    _migrateSchema(data) {
        if (!data || typeof data !== 'object') return data || {};
        const v = data._schemaVersion || 0;
        if (v >= this.CURRENT_SCHEMA_VERSION) return data;

        // Sequential migrations — each takes data at version N → N+1
        const migrations = [
            // v0 → v1: Add schema version field (no-op, just stamps it)
            (d) => { d._schemaVersion = 1; return d; },
            // Future: v1 → v2 example:
            // (d) => { if (d.oldField) { d.newField = d.oldField; delete d.oldField; } d._schemaVersion = 2; return d; },
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
        this.syncSegmentedControls();
        // Restore drivers/vehicles arrays and render cards
        this.loadDriversVehicles();
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

    // === PROGRESSIVE DISCLOSURE ===
    checkUpdates() {
        const yrBuilt = document.getElementById('yrBuilt').value;
        const updatesCard = document.getElementById('updatesCard');
        
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

    toggleCoApplicant() {
        const cb = document.getElementById('hasCoApplicant');
        const section = document.getElementById('coApplicantSection');
        if (!cb || !section) return;
        const show = cb.checked;
        section.classList.toggle('visible', show);
        this.data.hasCoApplicant = show ? 'yes' : '';
        this.save({});
    },

    restoreCoApplicantUI() {
        const cb = document.getElementById('hasCoApplicant');
        const section = document.getElementById('coApplicantSection');
        if (!cb || !section) return;
        const show = this.data.hasCoApplicant === 'yes';
        cb.checked = show;
        section.classList.toggle('visible', show);
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
                const res = await fetch('/api/name-phonetics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ firstName, lastName })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (!data.error) payload = data;
                }
            } catch (_) { /* server unavailable – fall through */ }

            // Try 2: Direct Gemini API (works in Tauri / offline / no server)
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

    formatDateDisplay(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = String(d.getFullYear());
        return `${mm}-${dd}-${yyyy}`;
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
Occupation: ${data.industry || ''}`;

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
        navigator.clipboard.writeText(this.getNotes());
        this.toast('📋 Copied to Clipboard!');
    },


    // ── Utilities ──
    toast(msg, duration, useHtml) {
        const t = document.getElementById('toast');
        // Support 2nd arg as options object: toast('msg', { type: 'error', duration: 4000 })
        let ms = 2500;
        let type = null;
        if (typeof duration === 'object' && duration !== null) {
            ms = duration.duration || 2500;
            type = duration.type || null;
        } else if (typeof duration === 'number') {
            ms = duration;
        }
        t.classList.remove('toast-error', 'toast-success');
        if (type) t.classList.add(`toast-${type}`);
        if (useHtml) {
            t.innerHTML = msg;
        } else {
            t.innerText = msg;
        }
        t.classList.add('show');
        setTimeout(() => { t.classList.remove('show', 'toast-error', 'toast-success'); }, ms);
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
        a.click();
        URL.revokeObjectURL(url);
    },

    // --- Export History ---

    logExport(type, filename) {
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
        let history = [];
        try { history = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
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
            try { entries = JSON.parse(localStorage.getItem('altech_export_history') || '[]'); } catch (e) {}
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
                            return `<tr style="border-bottom:1px solid color-mix(in srgb, var(--border) 50%, transparent);">
                                <td style="padding:6px 8px;white-space:nowrap;">${typeLabels[e.type] || this._escapeAttr(e.type || '')}</td>
                                <td style="padding:6px 8px;font-weight:500;">${this._escapeAttr(e.clientName || '')}</td>
                                <td style="padding:6px 8px;font-family:monospace;font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._escapeAttr(e.filename || '')}</td>
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


    // ── Plugin Navigation & Landing Page ──
    updateBackButtonVisibility() {
        const backButton = document.getElementById('backToHome');
        if (!backButton) return;

        const containers = document.querySelectorAll('.plugin-container');
        const anyActive = Array.from(containers).some(container => {
            if (container.classList.contains('active')) return true;
            return window.getComputedStyle(container).display !== 'none';
        });

        backButton.style.display = anyActive ? 'flex' : 'none';
        document.body.classList.toggle('tool-active', anyActive);
        this.updateBreadcrumb();
    },

    getActiveToolKey() {
        const toolMap = {
            quoting: 'quotingTool',
            coi: 'coiTool',
            prospect: 'prospectTool',
            compliance: 'complianceTool',
            qna: 'qnaTool',
            email: 'emailTool',
            quickref: 'quickrefTool',
            accounting: 'accountingTool',
            ezlynx: 'ezlynxTool',
            quotecompare: 'quoteCompareTool'
        };

        return Object.keys(toolMap).find(key => {
            const el = document.getElementById(toolMap[key]);
            if (!el) return false;
            if (el.classList.contains('active')) return true;
            return window.getComputedStyle(el).display !== 'none';
        }) || '';
    },

    updateBreadcrumb() {
        const bar = document.getElementById('breadcrumbBar');
        if (!bar) return;

        const toolKey = this.getActiveToolKey();
        if (!toolKey) {
            bar.style.display = 'none';
            return;
        }

        const crumbs = [
            '<a href="#home" onclick="App.goHome(); return false;" style="color:var(--apple-blue);text-decoration:none;">Home</a>',
            this.toolNames[toolKey] || toolKey
        ];

        if (toolKey === 'quoting') {
            const curId = this.flow?.[this.step];
            const stepName = this.stepTitles?.[curId];
            if (stepName) crumbs.push(stepName);
        }

        bar.innerHTML = crumbs.join(' <span style="opacity:0.4;">&rsaquo;</span> ');
        bar.style.display = 'flex';
    },

    observePluginVisibility() {
        const containers = document.querySelectorAll('.plugin-container');
        if (!containers.length) return;

        const observer = new MutationObserver(() => this.updateBackButtonVisibility());
        containers.forEach(container => {
            observer.observe(container, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        });

        this.updateBackButtonVisibility();
    },

    async navigateTo(toolName, options = {}) {
        // Look up tool from config array (single source of truth)
        const entry = this.toolConfig.find(t => t.key === toolName);
        if (!entry) return;

        document.getElementById('landingPage').style.display = 'none';

        document.querySelectorAll('.plugin-container').forEach(tool => {
            tool.classList.remove('active');
            tool.style.display = 'none';
        });

        const tool = document.getElementById(entry.containerId);
        if (!tool) return;

        // Lazy-load plugin HTML from external file on first access
        if (entry.htmlFile && !tool.dataset.loaded) {
            // Show standardized loading spinner while fetching
            tool.classList.add('active');
            tool.style.display = 'block';
            tool.dataset.loading = 'true';
            try {
                const resp = await fetch(entry.htmlFile);
                if (resp.ok) {
                    tool.innerHTML = await resp.text();
                    tool.dataset.loaded = 'true';
                } else {
                    console.error('[navigateTo] Failed to load plugin HTML:', entry.htmlFile, resp.status);
                    tool.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary,#666)">
                        <p style="font-size:1.1rem;margin-bottom:1rem">⚠️ Failed to load ${entry.name || entry.key}</p>
                        <button onclick="delete this.closest('.plugin-container').dataset.loaded; App.navigateTo('${entry.key}')"
                            style="padding:0.5rem 1.5rem;border-radius:8px;border:none;background:var(--apple-blue,#007AFF);color:#fff;cursor:pointer;font-size:0.95rem">
                            Retry
                        </button>
                    </div>`;
                }
            } catch(e) {
                console.error('[navigateTo] Error loading plugin HTML:', entry.htmlFile, e);
                tool.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary,#666)">
                    <p style="font-size:1.1rem;margin-bottom:1rem">⚠️ Connection error loading ${entry.name || entry.key}</p>
                    <button onclick="delete this.closest('.plugin-container').dataset.loaded; App.navigateTo('${entry.key}')"
                        style="padding:0.5rem 1.5rem;border-radius:8px;border:none;background:var(--apple-blue,#007AFF);color:#fff;cursor:pointer;font-size:0.95rem">
                        Retry
                    </button>
                </div>`;
            }
            delete tool.dataset.loading;
        }

        tool.classList.add('active');
        tool.style.display = 'block';
        try {
            // Quoting tool uses App.init(); all others use their module's init()
            if (entry.key === 'quoting') {
                if (!this.initialized) {
                    // Check for existing form data before init
                    const choice = await this._showIntakeSessionDialog();
                    if (choice === 'fresh') {
                        // Clear form data, then init blank
                        localStorage.removeItem(this.storageKey);
                        this.data = {};
                        this.drivers = [];
                        this.vehicles = [];
                        localStorage.removeItem('altech_drivers');
                        localStorage.removeItem('altech_vehicles');
                    } else if (choice === 'save-fresh') {
                        // Save current as draft, then clear
                        await this._saveCurrentAsDraft();
                        localStorage.removeItem(this.storageKey);
                        this.data = {};
                        this.drivers = [];
                        this.vehicles = [];
                        localStorage.removeItem('altech_drivers');
                        localStorage.removeItem('altech_vehicles');
                    }
                    // 'continue' — just proceed with existing data
                    await this.init();
                }
            } else if (entry.initModule) {
                const mod = window[entry.initModule];
                if (mod?.init) await mod.init();
            }
        } catch(e) {
            console.error('[navigateTo] init error for', toolName, e);
            this.toast(`⚠️ ${entry.title || toolName} failed to initialize`, { type: 'error', duration: 4000 });
            // Show inline error with retry button
            const existingErr = tool.querySelector('.plugin-init-error');
            if (!existingErr) {
                const errDiv = document.createElement('div');
                errDiv.className = 'plugin-init-error';
                errDiv.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary)">
                    <p style="font-size:1.1rem;margin-bottom:0.5rem">⚠️ ${entry.title || toolName} encountered an error</p>
                    <p style="font-size:0.85rem;margin-bottom:1rem;opacity:0.7">${e.message || 'Unknown error'}</p>
                    <button onclick="this.closest('.plugin-init-error').remove(); App.navigateTo('${entry.key}')"
                        style="padding:0.5rem 1.5rem;border-radius:8px;border:none;background:var(--apple-blue);color:#fff;cursor:pointer;font-size:0.95rem">
                        Retry
                    </button>
                </div>`;
                tool.prepend(errDiv);
            }
        }

        if (options.syncHash !== false) {
            const nextHash = `#${toolName}`;
            if (window.location.hash !== nextHash) {
                this._routerNavigating = true;
                history.pushState(null, '', nextHash);
                this._routerNavigating = false;
            }
        }

        this.updateBackButtonVisibility();
        this.updateBreadcrumb();
        window.scrollTo(0, 0);
    },

    openTool(toolName) {
        this.navigateTo(toolName);
    },

    updateLandingGreeting() {
        const el = document.getElementById('landingGreeting');
        if (!el) return;
        const h = new Date().getHours();
        const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

        // Use signed-in user's display name, fall back to onboarding name, then prompt
        const user = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
        if (user) {
            const rawName = user.displayName || user.email.split('@')[0];
            const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            el.textContent = greeting + ', ' + name;
        } else {
            const onboardName = typeof Onboarding !== 'undefined' ? Onboarding.getUserName() : '';
            if (onboardName) {
                const name = onboardName.charAt(0).toUpperCase() + onboardName.slice(1);
                el.innerHTML = greeting + ', ' + name + ' · <a href="#" onclick="Auth.showModal(); return false;" style="color:var(--apple-blue);text-decoration:none;font-weight:600;font-size:12px">Sign in for sync</a>';
            } else {
                el.innerHTML = greeting + ' ☀️ <a href="#" onclick="Auth.showModal(); return false;" style="color:var(--apple-blue);text-decoration:none;font-weight:600;">Sign in</a> for cloud sync';
            }
        }
    },

    // Render landing page tool grid from toolConfig (config-driven)
    renderLandingTools() {
        const mainGrid = document.getElementById('toolsGrid');
        const quickrefGrid = document.getElementById('quickrefGrid');

        // Category labels for bento section headers
        const categoryLabels = {
            quoting: 'Quoting & Sales',
            docs: 'Documents & Compliance',
            ops: 'Operations'
        };

        const renderCard = (t) => {
            const badgeHtml = t.badge ? `<span class="tool-notify-badge" id="${t.badge}"></span>` : '';
            const safeTitle = t.title.replace(/&/g, '&amp;');
            return `<div class="tool-row" tabindex="0" role="button" aria-label="${safeTitle}"
                onclick="App.navigateTo('${t.key}')"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigateTo('${t.key}')}">
                <div class="tool-icon ${t.color}">${t.icon}</div>${badgeHtml}
                <div class="tool-row-content"><div class="tool-title">${safeTitle}</div></div>
            </div>`;
        };

        if (mainGrid) {
            const visible = this.toolConfig.filter(t => !t.hidden && t.section !== 'quickref');
            // Group by category, preserving config order
            const seen = [];
            const groups = {};
            visible.forEach(t => {
                const cat = t.category || 'other';
                if (!groups[cat]) { groups[cat] = []; seen.push(cat); }
                groups[cat].push(t);
            });
            mainGrid.innerHTML = seen.map(cat => {
                const label = categoryLabels[cat];
                const cards = groups[cat].map(renderCard).join('');
                return `<div class="bento-category" data-category="${cat}">
                    ${label ? `<h3 class="bento-label">${label}</h3>` : ''}
                    <div class="bento-cards">${cards}</div>
                </div>`;
            }).join('');
        }
        if (quickrefGrid) {
            quickrefGrid.innerHTML = this.toolConfig
                .filter(t => t.section === 'quickref')
                .map(renderCard).join('');
        }
    },

    updateCGLBadge() {
        const badge = document.getElementById('cglBadge');
        if (!badge) return;
        try {
            const raw = localStorage.getItem('altech_cgl_cache');
            if (!raw) { badge.textContent = ''; badge.dataset.count = '0'; badge.classList.remove('badge-critical', 'badge-warning'); return; }
            const cached = JSON.parse(raw);
            const policies = cached.policies || [];
            // Load state to check verified/dismissed
            let verified = {}, dismissed = {};
            const stateRaw = localStorage.getItem('altech_cgl_state');
            if (stateRaw) {
                const st = JSON.parse(stateRaw);
                verified = st.verifiedPolicies || {};
                dismissed = st.dismissedPolicies || {};
            }
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            let warning = 0, critical = 0;
            policies.forEach(p => {
                if (verified[p.policyNumber] || dismissed[p.policyNumber]) return;
                if (!p.expirationDate) return;
                const exp = new Date(p.expirationDate);
                exp.setHours(0, 0, 0, 0);
                const days = Math.round((exp - now) / 86400000);
                if (days <= 14) critical++;
                else if (days <= 30) warning++;
            });
            // Show critical count (red) if any ≤14d, else warning count (amber) if any 15-30d
            const count = critical > 0 ? critical : warning;
            badge.textContent = count > 0 ? String(count) : '';
            badge.dataset.count = String(count);
            badge.classList.toggle('badge-critical', critical > 0);
            badge.classList.toggle('badge-warning', critical === 0 && warning > 0);
        } catch (e) {
            badge.textContent = '';
            badge.dataset.count = '0';
            badge.classList.remove('badge-critical', 'badge-warning');
        }
    },

    goHome() {
        // Hide all tools
        document.querySelectorAll('.plugin-container').forEach(tool => {
            tool.classList.remove('active');
            tool.style.display = 'none';
        });

        this.updateBackButtonVisibility();
        document.body.classList.remove('tool-active');
        const backButton = document.getElementById('backToHome');
        if (backButton) backButton.style.display = 'none';
        const breadcrumb = document.getElementById('breadcrumbBar');
        if (breadcrumb) breadcrumb.style.display = 'none';

        // Show landing page
        const lp = document.getElementById('landingPage');
        if (lp) lp.style.display = 'flex';

        // Update greeting
        this.updateLandingGreeting();

        // Update CGL badge
        this.updateCGLBadge();

        // Sync hash to #home (avoid re-trigger via _routerNavigating guard)
        if (window.location.hash !== '#home') {
            this._routerNavigating = true;
            history.replaceState(null, '', '#home');
            this._routerNavigating = false;
        }

        // Scroll to top
        window.scrollTo(0, 0);
    }
});
