// js/app-navigation.js — Navigation methods (wizard steps, plugin routing, landing page)
// Extracted from app-core.js — Session 4 refactor
'use strict';

Object.assign(App, {

    _routerNavigating: false,

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
            // Plugin HTML not loaded yet — expected during lazy-load boot
            console.debug('[App.updateUI] Element not found:', curId);
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
        // Hide "Same as Home Carrier" row on auto-only quotes
        const sameCarrierRow = document.querySelector('.same-carrier-row');
        if (sameCarrierRow) sameCarrierRow.style.display = showHome ? '' : 'none';
        // Hide home-specific property cards on auto-only quotes
        document.querySelectorAll('#step-3 .qtype-home-only').forEach(el => {
            el.style.display = showHome ? '' : 'none';
        });
        // Show auto-only elements (garaging address label, same-as-mailing checkbox)
        document.querySelectorAll('#step-3 .qtype-auto-only').forEach(el => {
            el.style.display = (qType === 'auto') ? '' : 'none';
        });

        // Init Google Places autocomplete when address step is visible
        if (curId === 'step-3') {
            this.initPlaces();
        }

        // Render drivers/vehicles when landing on step 4
        if (curId === 'step-4') {
            // Sync primary applicant into driver list (creates if absent, updates locked fields)
            this.syncPrimaryApplicantToDriver();
            // Also re-sync co-applicant profile (marital, industry/occupation, education)
            if (this.data.hasCoApplicant === 'yes') {
                this.syncCoApplicantToDriver({ skipRender: true });
            }

            // Migrate global driving history to Driver 1 (one-time: moves data.accidents/violations/studentGPA)
            if (this.drivers.length > 0) {
                const d1 = this.drivers[0];
                if (this.data.accidents && !d1.accidents) { d1.accidents = this.data.accidents; }
                if (this.data.violations && !d1.violations) { d1.violations = this.data.violations; }
                if (this.data.studentGPA && !d1.studentGPA) { d1.studentGPA = this.data.studentGPA; }
            }

            this.renderDrivers();
            this.renderVehicles();
            this.saveDriversVehicles();

            // Restore broadform/non-owners display state from saved value
            const savedAutoType = document.getElementById('autoPolicyType')?.value || 'Standard';
            this.handleAutoType(savedAutoType);
        }

        // Load Rentcast usage counter when property step is visible
        if (curId === 'step-3' && typeof this.initPropertyStepUI === 'function') {
            this.initPropertyStepUI();
        }

        // Render client history on Quick Start page
        if (curId === 'step-0') {
            this.renderStep0ClientHistory();
        }

        // Auto-save client history on EVERY step change (not just step-6)
        // This ensures no session data is lost even if user never reaches export
        this.autoSaveClient();

        // Render full client history on export page
        if (curId === 'step-6') {
            this.renderClientHistory();
            // Show/hide quick-edit jump buttons based on active workflow
            const hasVehicles = this.flow.includes('step-4');
            const jv = document.getElementById('editJumpVehicles');
            const jp = document.getElementById('editJumpProperty');
            if (jv) jv.style.display = hasVehicles ? '' : 'none';
            // Property step always present in current workflows — but guard anyway
            const hasProperty = this.flow.includes('step-3');
            if (jp) jp.style.display = hasProperty ? '' : 'none';
        }
        
        // Update step title
        const stepTitle = document.getElementById('stepTitle');
        const totalSteps = this.flow.length;
        const currentStep = this.step + 1;
        const stepName = this.stepTitles[curId] || 'Step';
        if (stepTitle) stepTitle.textContent = `Step ${currentStep} of ${totalSteps}: ${stepName}`;
        this.updateBreadcrumb();
        
        // Progress
        const pct = ((this.step + 1) / this.flow.length) * 100;
        const progressBar = document.getElementById('progressBar');
        if (progressBar) progressBar.style.width = pct + '%';
        
        // Buttons
        const back = document.getElementById('btnBack');
        const next = document.getElementById('btnNext');
        if (back) back.disabled = this.step === 0;
        if (next) {
            const nextText = this.step === this.flow.length - 1 ? 'Finish' : 'Next';
            const nextLabel = next.querySelector('.btn-label');
            if (nextLabel) { nextLabel.textContent = nextText; } else { next.textContent = nextText; }
        }

        // Dot nav + step counter (personal quoting tool)
        const pqNav = document.getElementById('pq-step-nav');
        if (pqNav) pqNav.innerHTML = this._buildPqDotNav();
        const pqCounter = document.getElementById('pq-step-counter');
        if (pqCounter) pqCounter.textContent = `Step ${currentStep} of ${totalSteps}`;

        // Mark quoting-active on body so footer/exit-button don't overlap
        document.body.classList.add('quoting-active');

        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) mainContainer.scrollTo(0,0);
    },

    _buildPqDotNav() {
        if (!this.flow || this.flow.length === 0) return '';
        const dots = this.flow.map((stepId, i) => {
            const label = (this.stepDotLabels || {})[stepId] || String(i + 1);
            const isActive = i === this.step;
            const isDone = i < this.step;
            const cls = ['pq-dot', isActive ? 'active' : '', isDone ? 'pq-done' : ''].filter(Boolean).join(' ');
            return `<span class="${cls}" aria-label="Step ${i + 1}: ${Utils.escapeAttr(label)}">` +
                `<span class="pq-dot-inner">${isDone ? '✓' : i + 1}</span>` +
                `<span class="pq-dot-label">${Utils.escapeHTML(label)}</span>` +
                `</span>`;
        });
        return `<div class="pq-step-track">${dots.join('')}</div>`;
    },

    next() {
        try {
            // Save client history before navigating (immediate, no debounce)
            this._saveClientHistoryNow();

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

            // Soft (non-blocking) completion hints on steps 1 and 3.
            // The user can still continue — we just nudge them not to forget.
            if (stepNumber === 1) {
                const missing = ['firstName', 'lastName'].filter(id => {
                    const el = document.getElementById(id);
                    return el && !el.value.trim();
                });
                if (missing.length > 0) {
                    this.toast('💡 Tip: First and last name are needed for exports — you can fill them in any time.', 'info');
                }
            } else if (stepNumber === 3) {
                const missing = ['addrStreet', 'addrCity', 'addrState', 'addrZip'].filter(id => {
                    const el = document.getElementById(id);
                    return el && !el.value.trim();
                });
                if (missing.length > 0) {
                    this.toast('💡 Tip: Property address is used in exports and carrier lookups — fill it in when ready.', 'info');
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
            // Save client history before navigating back
            this._saveClientHistoryNow();

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

    // Select a coverage type and start a fresh intake from Step 1.
    // Called by the coverage-type cards on Step 0 (replaces the old "New Client" button +
    // the separate Step 2 coverage-selection screen).
    selectTypeAndStart(type) {
        // startFresh() clears all radios then calls handleType() which defaults to 'both'.
        // After it returns we re-apply the user's actual selection.
        this.startFresh();
        const radio = document.querySelector(`input[name="qType"][value="${CSS.escape(type)}"]`);
        if (radio) radio.checked = true;
        this.handleType(); // re-run with the correct radio now checked
    },

    // Jump directly to a step by its step ID string (e.g. 'step-1') or 0-based flow index.
    // Used by edit-shortcut buttons on the Review & Export page.
    jumpToStep(stepIdOrIndex) {
        let idx;
        if (typeof stepIdOrIndex === 'string') {
            idx = this.flow.indexOf(stepIdOrIndex);
        } else {
            idx = stepIdOrIndex;
        }
        if (idx < 0 || idx >= this.flow.length) return;
        this.step = idx;
        this.updateUI();
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

        // Quoting tool has its own header home button — hide the floating exit button
        const quotingActive = document.body.classList.contains('quoting-active');
        const showBack = anyActive && !quotingActive;
        // Sidebar handles navigation — only show back button when sidebar is not present
        const hasSidebar = document.querySelector('.app-sidebar');
        backButton.style.display = (showBack && !hasSidebar) ? 'flex' : 'none';
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
            (this.toolConfig.find(t => t.key === toolKey)?.name) || toolKey
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
        // ── Route aliases for common/short hash names ──
        const routeAliases = { vin: 'vindecoder', compare: 'quotecompare', scan: 'quoting', policyqa: 'qna', cgl: 'compliance' };
        if (routeAliases[toolName]) toolName = routeAliases[toolName];

        // Look up tool from config array (single source of truth)
        const entry = this.toolConfig.find(t => t.key === toolName);
        if (!entry) {
            // Unknown route — fall back to dashboard instead of stale view
            this.goHome();
            return;
        }

        // ── Auth gate: require sign-in to access any tool ──
        // Wait for Firebase auth state to resolve before checking (avoids false-negative on page load)
        if (typeof Auth !== 'undefined') {
            try { await Auth.ready(); } catch (_) { /* timeout or no Firebase — continue */ }
            if (!Auth.user) {
                Auth.showModal();
                // Delay toast slightly so it renders above the auth modal
                setTimeout(() => this.toast('Please sign in to access tools', { type: 'info', duration: 3000 }), 150);
                return;
            }
        }

        // Hide dashboard view, show plugin viewport (command center layout)
        if (typeof DashboardWidgets !== 'undefined') {
            DashboardWidgets.hideDashboard(toolName, entry.title || entry.name);
        }
        const lp = document.getElementById('landingPage');
        if (lp) lp.style.display = 'none';

        // Remove quoting-active when switching away from quoting tool
        if (toolName !== 'quoting') {
            document.body.classList.remove('quoting-active');
        }

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
                    if (toolName === 'quoting') this._stampEzlynxLabels(tool);
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
            const rawName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
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
            quoting: 'Quoting',
            export: 'Export',
            docs: 'Compliance',
            ops: 'Tools'
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

    _stampEzlynxLabels(container) {
        const EZ_SPAN = '<span class="ez-req" title="Required for EZLynx rating" style="color:#f5c842;margin-left:3px;font-size:0.85em;">✦</span>';
        container.querySelectorAll('[id]').forEach(el => {
            if (!window.FIELD_BY_ID?.[el.id]?.ezlynxRequired) return;
            // Walk up two levels: handles both plain wrappers and input-with-action nesting
            const p = el.parentElement;
            const lbl = p?.querySelector(':scope > label.label')
                      || p?.parentElement?.querySelector(':scope > label.label');
            if (lbl && !lbl.querySelector('.ez-req')) lbl.insertAdjacentHTML('beforeend', EZ_SPAN);
        });
    },

    goHome() {
        // Save client history before leaving quoting wizard
        try { this._saveClientHistoryNow(); } catch(e) { /* ok */ }

        // Hide all tools
        document.querySelectorAll('.plugin-container').forEach(tool => {
            tool.classList.remove('active');
            tool.style.display = 'none';
        });

        this.updateBackButtonVisibility();
        document.body.classList.remove('tool-active');
        document.body.classList.remove('quoting-active');
        const backButton = document.getElementById('backToHome');
        if (backButton) backButton.style.display = 'none';
        const breadcrumb = document.getElementById('breadcrumbBar');
        if (breadcrumb) breadcrumb.style.display = 'none';

        // Show command center dashboard (or fall back to legacy landing page)
        if (typeof DashboardWidgets !== 'undefined') {
            DashboardWidgets.showDashboard();
        } else {
            const lp = document.getElementById('landingPage');
            if (lp) lp.style.display = 'flex';
        }

        // Update greeting (legacy)
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
    },

    /** Show/hide Vehicles & Drivers section based on auto policy type.
     *  Called from #autoPolicyType onchange and on step-4 entry. */
    handleAutoType(val) {
        const isBroadform = val === 'NonOwners' || val === 'BroadForm';
        const driversCard  = document.getElementById('step4DriversCard');
        const vehiclesCard = document.getElementById('step4VehiclesCard');
        const notice       = document.getElementById('step4NonOwnersNotice');
        if (driversCard)  driversCard.classList.toggle('hidden', isBroadform);
        if (vehiclesCard) vehiclesCard.classList.toggle('hidden', isBroadform);
        if (notice)       notice.classList.toggle('hidden', !isBroadform);
    },

});
