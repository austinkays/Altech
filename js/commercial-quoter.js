/**
 * Commercial Lines Quoter
 * =======================
 * Self-contained 7-step commercial intake wizard.
 * Steps: 0=Quick Start, 1=Business Info, 2=Coverage Types, 3=Locations,
 *        4=Owner & Background, 5=Prior Insurance, 6=Review & Export
 *
 * Storage: altech_commercial_v1 (draft, encrypted), altech_commercial_quotes (history, encrypted)
 * Cloud-synced via cloud-sync.js SYNC_DOCS.
 */
window.CommercialQuoter = (() => {
    'use strict';

    const STORAGE_KEY = STORAGE_KEYS.COMMERCIAL_DRAFT;
    const QUOTES_KEY  = STORAGE_KEYS.COMMERCIAL_QUOTES;

    let _data   = {};
    let _step   = 0;
    let _quotes = [];
    let _cqPlacesInit   = false;
    let _debouncedCQMap = null;

    // ── Public API ────────────────────────────────────────────────────────────

    async function init() {
        await _load();
        _renderStep0();
        _updateUI();
        _wireEvents();
    }

    async function save() {
        _collectFields();
        await _save();
    }

    async function load() {
        await _load();
    }

    function getQuotes() {
        return _quotes;
    }

    async function saveQuote() {
        _collectFields();
        const covList = ['covGL','covBond','covPL','covBA','covProp','covBPP','covIM','covCargo'];
        const covNames = { covGL:'GL', covBond:'Bond', covPL:'PL', covBA:'Business Auto',
                           covProp:'Property', covBPP:'BPP', covIM:'Inland Marine', covCargo:'Cargo' };
        const selectedCovs = covList.filter(k => _data[k]).map(k => covNames[k]);

        const quote = {
            id: _genId(),
            bizName: _data.bizName || 'Unnamed Business',
            coverages: selectedCovs,
            timestamp: new Date().toISOString(),
            data: Object.assign({}, _data),
        };
        _quotes.push(quote);
        await _saveQuotesArray();
        await _save();
        if (typeof App !== 'undefined' && App.toast) App.toast('✓ Saved to Commercial History');
    }

    async function loadQuote(id) {
        const q = _quotes.find(x => x.id === id);
        if (!q) return;
        _data = Object.assign({}, q.data);
        await _save();
        _step = 1;
        _updateUI();
    }

    function newQuote() {
        _data = {};
        _step = 1;
        _updateUI();
    }

    function prev() {
        if (_step > 0) {
            _collectFields();
            _save();
            _step--;
            _updateUI();
        }
    }

    function next() {
        if (_step < 6) {
            _collectFields();
            _save();
            _step++;
            _updateUI();
        }
    }

    async function render() {
        // Called by cloud sync after pull
        await _load();
        _populateFields();
        if (_step === 0) _renderStep0();
        if (_step === 6) _renderSummary();
    }

    function exportPDF() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            if (typeof App !== 'undefined' && App.toast) App.toast('PDF library not loaded — reload and try again', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc     = new jsPDF();
        const pageW   = doc.internal.pageSize.getWidth();
        const margin  = 15;
        let y         = 24;

        function addLine(text, opts) {
            opts = opts || {};
            if (y > 272) { doc.addPage(); y = 20; }
            const fs = opts.fontSize || 10;
            doc.setFontSize(fs);
            doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
            doc.setTextColor.apply(doc, opts.color || [30, 30, 30]);
            const lines = doc.splitTextToSize(String(text || ''), pageW - margin * 2);
            doc.text(lines, margin, y);
            y += lines.length * (fs * 0.42) + (opts.gap !== undefined ? opts.gap : 4);
        }

        function sectionHeader(title) {
            y += 4;
            doc.setFillColor(0, 122, 255);
            doc.rect(margin, y - 4, pageW - margin * 2, 9, 'F');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(title, margin + 2, y + 2);
            y += 12;
            doc.setTextColor(30, 30, 30);
        }

        function field(label, key) {
            const v = _data[key];
            if (v === undefined || v === null || v === '' || v === false) return;
            addLine(label + ': ' + v);
        }

        // ── Header bar ──
        doc.setFillColor(0, 122, 255);
        doc.rect(0, 0, pageW, 15, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('Commercial Insurance Intake', margin, 10);
        const bizLabel = (_data.bizName || 'Unnamed').slice(0, 35);
        doc.setFontSize(10);
        doc.text(bizLabel, pageW - margin - doc.getTextWidth(bizLabel), 10);
        y = 24;

        // ── Business Info ──
        sectionHeader('Business Information');
        field('Business Name', 'bizName');
        field('Contact', 'contactName');
        field('Email', 'contactEmail');
        field('Phone', 'bizPhone');
        field('Address', 'bizStreet');
        const cityLine = [_data.bizCity, _data.bizState, _data.bizZip].filter(Boolean).join(', ');
        if (cityLine) addLine('City/State/Zip: ' + cityLine);
        field('Date Started', 'dateStarted');
        field('Years in Industry', 'yrsIndustry');
        field('Years Mgmt Exp', 'yrsMgtExp');
        field('Annual Receipts (Est)', 'annualReceiptsEst');
        field('Prior Year Receipts', 'annualReceiptsPrior');
        field('Effective Date', 'effectiveDate');
        field('Marketing Agent', 'marketingAgent');

        // ── Coverage Types ──
        sectionHeader('Coverage Types Selected');
        const covList = ['covGL','covBond','covPL','covBA','covProp','covBPP','covIM','covCargo'];
        const covNames = {
            covGL:'General Liability', covBond:'Bond', covPL:'Professional Liability',
            covBA:'Business Auto', covProp:'Property', covBPP:'Business Personal Property',
            covIM:'Inland Marine', covCargo:'Cargo',
        };
        const detailMap = {
            covGL:   ['glOccLimit:Occ Limit','glAggLimit:Agg Limit','glDeductible:Deductible'],
            covBond: ['bondType:Bond Type','bondAmount:Bond Amount'],
            covPL:   ['plLimit:PL Limit','plDeductible:PL Deductible','plRetro:Retroactive Date'],
            covBA:   ['baNumVehicles:# Vehicles','baVehicleTypes:Vehicle Types','baBILimits:BI Limits','baPDLimit:PD Limit'],
            covProp: ['propBuildingValue:Building Value','propContentsValue:Contents Value','propDeductible:Deductible','propConstruction:Construction','propYearBuilt:Year Built','propSprinklers:Sprinklers'],
            covBPP:  ['bppValue:BPP Value','bppDeductible:Deductible'],
            covIM:   ['imDescription:Description','imValue:Total Value'],
            covCargo:['cargoNumVehicles:# Vehicles','cargoRadius:Radius (mi)','cargoValue:Max Load Value'],
        };
        let anyCov = false;
        covList.forEach(k => {
            if (!_data[k]) return;
            anyCov = true;
            addLine('• ' + covNames[k], { bold: true });
            (detailMap[k] || []).forEach(pair => {
                const sep   = pair.indexOf(':');
                const fKey  = pair.slice(0, sep);
                const fLabel= pair.slice(sep + 1);
                if (_data[fKey]) addLine('    ' + fLabel + ': ' + _data[fKey], { color: [80, 80, 80] });
            });
        });
        if (!anyCov) addLine('None selected');

        // ── Locations ──
        sectionHeader('Locations & Property');
        field('# Locations', 'numLocations');
        field('States of Operation', 'statesOperate');
        field('Countries', 'countriesOperate');
        field('Own/Lease Building', 'ownLeaseBuild');
        field('Building Value', 'buildingValue');
        field('Location Address(es)', 'locAddress');

        // ── Owner & Background ──
        sectionHeader('Owner & Background');
        field('# Owners', 'numOwners');
        field('Owner Name(s)', 'ownerNames');
        field('Owner Home Address', 'ownerHomeAddress');
        field('Owner DOB', 'ownerDOB');
        field('Prior Conviction', 'convicted');
        field('Bankruptcy', 'bankruptcy');
        field('Lawsuits', 'lawsuits');
        field('FT Employees', 'ftEmployees');
        field('PT Employees', 'ptEmployees');
        field('Payroll', 'payroll');
        field('Subcontractors', 'hasSubcontractors');
        if (_data.hasSubcontractors === 'Y') {
            field('Subcontracting Costs', 'subcontractingCosts');
            field('Obtain Certs of Insurance', 'obtainCerts');
        }

        // ── Prior Insurance ──
        sectionHeader('Prior Insurance');
        field('Current Carrier', 'currentInsurance');
        field('Policy Expiration', 'policyExpiration');
        field('Reason for Quote', 'reasonForQuote');
        field('Claims', 'insuranceClaims');

        const safeName = (_data.bizName || 'Commercial').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        doc.save(safeName + '_Commercial_Quote.pdf');
        if (typeof App !== 'undefined' && App.toast) App.toast('✓ PDF downloaded');
    }

    function exportCMSMTF() {
        const d = _data;
        const lines = [];
        const ln = (key, val) => key + ' = ' + (val || '').toString().replace(/[\r\n]+/g, ' ');

        // Split contactName into first/last
        const parts     = (d.contactName || '').trim().split(' ');
        const firstName = parts[0] || '';
        const lastName  = parts.length > 1 ? parts.slice(1).join(' ') : firstName;

        // Build FSC notes
        const covList  = ['covGL','covBond','covPL','covBA','covProp','covBPP','covIM','covCargo'];
        const covNames = {
            covGL:'General Liability', covBond:'Bond', covPL:'Professional Liability',
            covBA:'Business Auto', covProp:'Property', covBPP:'Business Personal Property',
            covIM:'Inland Marine', covCargo:'Cargo',
        };
        const covDetails = {
            covGL:   'Occ: ' + (d.glOccLimit||'') + ' / Agg: ' + (d.glAggLimit||'') + ' / Ded: ' + (d.glDeductible||''),
            covBond: 'Type: ' + (d.bondType||'') + ' / Amount: ' + (d.bondAmount||''),
            covPL:   'Limit: ' + (d.plLimit||'') + ' / Ded: ' + (d.plDeductible||'') + ' / Retro: ' + (d.plRetro||''),
            covBA:   'Vehicles: ' + (d.baNumVehicles||'') + ' / Types: ' + (d.baVehicleTypes||'') + ' / BI: ' + (d.baBILimits||'') + ' / PD: ' + (d.baPDLimit||''),
            covProp: 'Bldg: ' + (d.propBuildingValue||'') + ' / Contents: ' + (d.propContentsValue||'') + ' / Ded: ' + (d.propDeductible||'') + ' / Const: ' + (d.propConstruction||''),
            covBPP:  'Value: ' + (d.bppValue||'') + ' / Ded: ' + (d.bppDeductible||''),
            covIM:   'Desc: ' + (d.imDescription||'') + ' / Value: ' + (d.imValue||''),
            covCargo:'Vehicles: ' + (d.cargoNumVehicles||'') + ' / Radius: ' + (d.cargoRadius||'') + ' / Max Load: ' + (d.cargoValue||''),
        };

        let fsc = 'Commercial Lines Intake — ' + (d.bizName || '');
        fsc += '\nEffective: ' + (d.effectiveDate || '') + ' | Receipts: ' + (d.annualReceiptsEst || '');
        fsc += '\n\nCoverages:';
        covList.forEach(k => {
            if (d[k]) fsc += '\n  ' + covNames[k] + ': ' + covDetails[k];
        });
        fsc += '\n\nLocations: ' + (d.numLocations||'') + ' | States: ' + (d.statesOperate||'') + ' | Building: ' + (d.ownLeaseBuild||'');
        fsc += '\nFT Employees: ' + (d.ftEmployees||'') + ' | PT Employees: ' + (d.ptEmployees||'') + ' | Payroll: ' + (d.payroll||'');
        if (d.hasSubcontractors === 'Y') {
            fsc += '\nSubcontractors: Yes | Costs: ' + (d.subcontractingCosts||'') + ' | Certs: ' + (d.obtainCerts||'');
        }
        if (d.insuranceClaims) fsc += '\n\nClaims: ' + d.insuranceClaims;
        if (d.convicted === 'Y' || d.bankruptcy === 'Y' || d.lawsuits === 'Y') {
            fsc += '\nBackground: Convicted=' + (d.convicted||'N') + ' Bankruptcy=' + (d.bankruptcy||'N') + ' Lawsuits=' + (d.lawsuits||'N');
        }

        // ── Client Block ──
        lines.push(ln('gen_bBusinessType', 'L'));
        lines.push(ln('gen_sCustType', 'Commercial'));
        lines.push(ln('gen_sBusinessName', d.bizName));
        lines.push(ln('gen_sDBAName', ''));
        lines.push(ln('gen_sLastName', lastName));
        lines.push(ln('gen_sFirstName', firstName));
        lines.push(ln('gen_cInitial', ''));
        lines.push(ln('gen_sAddress1', d.bizStreet));
        lines.push(ln('gen_sCity', d.bizCity));
        lines.push(ln('gen_sState', d.bizState));
        lines.push(ln('gen_sZip', d.bizZip));
        lines.push(ln('gen_sFEIN', ''));
        lines.push(ln('gen_sBusinessLicense', ''));
        lines.push(ln('gen_sClientSource', ''));
        lines.push(ln('gen_sClientNotes', ''));
        lines.push(ln('gen_sNAICS', ''));
        lines.push(ln('gen_sWebsite', ''));
        lines.push(ln('gen_sPhone', d.bizPhone));
        lines.push(ln('gen_sWorkPhone', ''));
        lines.push(ln('gen_sFax', ''));
        lines.push(ln('gen_sPager', ''));
        lines.push(ln('gen_sCellPhone', ''));
        lines.push(ln('gen_sMsgPhone', ''));
        lines.push(ln('gen_sEmail', d.contactEmail));
        lines.push(ln('gen_sEmailWork', ''));
        lines.push(ln('gen_lClientOffice', ''));

        // ── Policy Block ──
        lines.push(ln('gen_sAgencyID', ''));
        lines.push(ln('gen_sCMSPolicyType', 'ENHANCED'));
        lines.push(ln('gen_sApplicationType', 'Commercial'));
        lines.push(ln('gen_sCompany', d.currentInsurance));
        lines.push(ln('gen_lPolicyOffice', ''));
        lines.push(ln('gen_sPolicyTitle', 'Commercial Lines — ' + (d.bizName || '')));
        lines.push(ln('gen_sForm', ''));
        lines.push(ln('gen_sLOBCode', 'CGL'));
        lines.push(ln('gen_sPolicyNumber', ''));
        lines.push(ln('gen_tProductionDate', ''));
        lines.push(ln('gen_tExpirationDate', d.policyExpiration));
        lines.push(ln('gen_tEffectiveDate', d.effectiveDate));
        lines.push(ln('gen_sLeadSource', ''));
        lines.push(ln('gen_dTotal', ''));
        lines.push(ln('gen_nTerm', '12'));
        lines.push(ln('gen_nClientStatus', '1'));
        lines.push(ln('gen_sStatus', 'Quote'));
        lines.push(ln('gen_sFSCNotes', fsc));
        lines.push(ln('gen_dFilingFee', ''));
        lines.push(ln('gen_dPolicyFee', ''));
        lines.push(ln('gen_dBrokerFee', ''));
        lines.push(ln('gen_sProducer', d.marketingAgent));
        lines.push(ln('gen_sProgram', ''));

        // ── Commercial Coverage Array ──
        let covIdx = 0;
        covList.forEach(k => {
            if (!d[k]) return;
            lines.push(ln('gen_Coverage[' + covIdx + ']', covNames[k]));
            lines.push(ln('gen_CoverageLimits[' + covIdx + ']', ''));
            lines.push(ln('gen_CoverageDeds[' + covIdx + ']', ''));
            covIdx++;
        });

        const content = lines.join('\r\n') + '\r\n';
        const blob    = new Blob([content], { type: 'text/plain' });
        const url     = URL.createObjectURL(blob);
        const a       = document.createElement('a');
        const safeName = (d.bizName || 'Commercial').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        a.href     = url;
        a.download = safeName + '_Commercial_HawkSoft.CMSMTF';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof App !== 'undefined' && App.toast) App.toast('✓ HawkSoft file downloaded');
    }

    // ── Private — Persistence ─────────────────────────────────────────────────

    async function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                if (typeof CryptoHelper !== 'undefined') {
                    const dec = await CryptoHelper.decrypt(raw);
                    if (dec && typeof dec === 'object') _data = dec;
                } else {
                    _data = JSON.parse(raw);
                }
            }
        } catch (e) {
            console.warn('[CommercialQuoter] draft load failed', e);
        }
        try {
            const rawQ = localStorage.getItem(QUOTES_KEY);
            if (rawQ) {
                if (typeof CryptoHelper !== 'undefined') {
                    const dec = await CryptoHelper.decrypt(rawQ);
                    if (Array.isArray(dec)) _quotes = dec;
                } else {
                    const parsed = JSON.parse(rawQ);
                    if (Array.isArray(parsed)) _quotes = parsed;
                }
            }
        } catch (e) {
            console.warn('[CommercialQuoter] quotes load failed', e);
            _quotes = [];
        }
    }

    async function _save() {
        try {
            if (typeof CryptoHelper !== 'undefined') {
                const enc = await CryptoHelper.encrypt(_data);
                if (enc) localStorage.setItem(STORAGE_KEY, enc);
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
            }
            if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
                CloudSync.schedulePush();
            }
        } catch (e) {
            console.warn('[CommercialQuoter] save error', e);
        }
    }

    async function _saveQuotesArray() {
        try {
            if (typeof CryptoHelper !== 'undefined') {
                const enc = await CryptoHelper.encrypt(_quotes);
                if (enc) localStorage.setItem(QUOTES_KEY, enc);
            } else {
                localStorage.setItem(QUOTES_KEY, JSON.stringify(_quotes));
            }
            if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
                CloudSync.schedulePush();
            }
        } catch (e) {
            console.warn('[CommercialQuoter] quotes save error', e);
        }
    }

    // ── Private — UI ──────────────────────────────────────────────────────────

    function _collectFields() {
        const app = document.getElementById('cq-app');
        if (!app) return;
        app.querySelectorAll('[id^="cq_"]').forEach(el => {
            const key = el.id.slice(3); // strip "cq_" prefix
            if (el.type === 'checkbox') {
                _data[key] = el.checked;
            } else if (el.type === 'radio') {
                if (el.checked) _data[key] = el.value;
            } else {
                _data[key] = el.value;
            }
        });
    }

    function _populateFields() {
        const app = document.getElementById('cq-app');
        if (!app) return;
        app.querySelectorAll('[id^="cq_"]').forEach(el => {
            const key = el.id.slice(3);
            if (_data[key] === undefined) return;
            if (el.type === 'checkbox') {
                el.checked = !!_data[key];
                const detail = el.closest('.cq-coverage-row') && el.closest('.cq-coverage-row').querySelector('.cq-coverage-detail');
                if (detail) detail.classList.toggle('hidden', !el.checked);
            } else if (el.type === 'radio') {
                el.checked = (el.value === String(_data[key]));
            } else {
                el.value = _data[key];
            }
        });
        _toggleSubcontractorFields();
    }

    function _toggleSubcontractorFields() {
        const el = document.querySelector('input[name="cq_hasSubcontractors"]:checked');
        const sub = document.getElementById('cq-sub-detail');
        if (sub) sub.classList.toggle('hidden', !el || el.value !== 'Y');
    }

    function _updateUI() {
        const app = document.getElementById('cq-app');
        if (!app) return;

        // Show active step, hide others
        app.querySelectorAll('.cq-step').forEach(function(s, i) {
            s.classList.toggle('hidden', i !== _step);
        });

        // Step indicator dots
        app.querySelectorAll('.cq-dot').forEach(function(dot, i) {
            dot.classList.toggle('active', i === _step);
            dot.setAttribute('aria-current', i === _step ? 'step' : 'false');
        });

        // Step title + progress bar
        var STEP_TITLES = ['Quick Start', 'Business Info', 'Coverage Types', 'Locations', 'Owner & Background', 'Prior Insurance', 'Review & Export'];
        var titleEl = document.getElementById('cq-step-title');
        if (titleEl) titleEl.textContent = 'Step ' + (_step + 1) + ' / 7 \u2014 ' + STEP_TITLES[_step];
        var progressEl = document.getElementById('cq-progress-bar');
        if (progressEl) progressEl.style.width = Math.round(_step / 6 * 100) + '%';
        var counterEl = document.getElementById('cq-step-counter');
        if (counterEl) counterEl.textContent = (_step + 1) + ' / 7';

        // Footer button visibility
        const prevBtn     = document.getElementById('cq-btn-prev');
        const nextBtn     = document.getElementById('cq-btn-next');
        const exportGroup = document.getElementById('cq-export-group');
        if (prevBtn)     prevBtn.classList.toggle('hidden', _step === 0);
        if (nextBtn)     nextBtn.classList.toggle('hidden', _step === 6);
        if (exportGroup) exportGroup.classList.toggle('hidden', _step !== 6);

        // Dynamic step content
        if (_step === 0) _renderStep0();
        if (_step === 6) _renderSummary();

        // Restore saved values into visible fields
        _populateFields();
        // Initialise Places autocomplete + map preview when on Business Info step
        if (_step === 1) setTimeout(_initCQPlaces, 50);
    }

    function _renderStep0() {
        const list = document.getElementById('cq-recent-list');
        if (!list) return;
        if (!_quotes.length) {
            list.innerHTML = '<p class="hint">No saved commercial quotes yet.</p>';
            return;
        }
        const recent = _quotes.slice(-5).reverse();
        list.innerHTML = recent.map(function(q) {
            return '<div class="cq-recent-item card">' +
                '<div class="cq-recent-info">' +
                '<strong>' + Utils.escapeHTML(q.bizName || 'Unnamed Business') + '</strong>' +
                '<span class="hint">' + Utils.escapeHTML((q.coverages || []).join(', ')) + '</span>' +
                '<span class="hint">' + (q.timestamp ? new Date(q.timestamp).toLocaleDateString() : '') + '</span>' +
                '</div>' +
                '<button class="btn btn-sm" onclick="CommercialQuoter.loadQuote(\'' + Utils.escapeAttr(q.id) + '\')">Load</button>' +
                '</div>';
        }).join('');
    }

    function _renderSummary() {
        const el = document.getElementById('cq-summary');
        if (!el) return;

        function row(label, key) {
            const v = _data[key];
            if (v === undefined || v === null || v === '' || v === false) return '';
            return '<div class="cq-summary-row">' +
                '<span class="cq-summary-label">' + Utils.escapeHTML(label) + ':</span> ' +
                '<span>' + Utils.escapeHTML(String(v)) + '</span></div>';
        }

        const covList  = ['covGL','covBond','covPL','covBA','covProp','covBPP','covIM','covCargo'];
        const covNames = {
            covGL:'General Liability', covBond:'Bond', covPL:'Professional Liability',
            covBA:'Business Auto', covProp:'Property', covBPP:'Business Personal Property',
            covIM:'Inland Marine', covCargo:'Cargo',
        };
        const selectedCovs = covList.filter(function(k) { return _data[k]; }).map(function(k) { return covNames[k]; });

        el.innerHTML =
            '<div class="cq-summary-section">' +
            '<div class="cq-summary-title">Business Info</div>' +
            row('Business Name','bizName') +
            row('Contact','contactName') +
            row('Email','contactEmail') +
            row('Phone','bizPhone') +
            row('Address','bizStreet') +
            (_data.bizCity || _data.bizState || _data.bizZip
                ? '<div class="cq-summary-row"><span class="cq-summary-label">City/State/Zip:</span> <span>' +
                  Utils.escapeHTML([_data.bizCity, _data.bizState, _data.bizZip].filter(Boolean).join(', ')) + '</span></div>'
                : '') +
            row('Effective Date','effectiveDate') +
            row('Annual Receipts','annualReceiptsEst') +
            '</div>' +
            '<div class="cq-summary-section">' +
            '<div class="cq-summary-title">Coverage Types</div>' +
            (selectedCovs.length
                ? '<div class="cq-summary-row">' +
                  selectedCovs.map(function(n) { return '<span class="cq-badge">' + Utils.escapeHTML(n) + '</span>'; }).join(' ') +
                  '</div>'
                : '<div class="hint">None selected</div>') +
            '</div>' +
            '<div class="cq-summary-section">' +
            '<div class="cq-summary-title">Workforce</div>' +
            row('FT Employees','ftEmployees') +
            row('PT Employees','ptEmployees') +
            row('Payroll','payroll') +
            (_data.hasSubcontractors === 'Y' ? row('Subcontracting Costs','subcontractingCosts') : '') +
            '</div>' +
            '<div class="cq-summary-section">' +
            '<div class="cq-summary-title">Prior Insurance</div>' +
            row('Current Carrier','currentInsurance') +
            row('Policy Expiration','policyExpiration') +
            row('Reason for Quote','reasonForQuote') +
            row('Claims','insuranceClaims') +
            '</div>';
    }

    function _wireEvents() {
        const app = document.getElementById('cq-app');
        if (!app) return;

        // Debounced auto-save on any input change
        app.addEventListener('input', Utils.debounce(function() {
            _collectFields();
            _save();
            if (_step === 1) _scheduleCQMapPreview();
        }, 400));

        // Coverage checkbox toggles + subcontractor reveal
        app.addEventListener('change', function(e) {
            var el = e.target;
            if (el.classList.contains('cq-cov-check')) {
                var row = el.closest('.cq-coverage-row');
                var detail = row && row.querySelector('.cq-coverage-detail');
                if (detail) detail.classList.toggle('hidden', !el.checked);
            }
            if (el.name === 'cq_hasSubcontractors') {
                _toggleSubcontractorFields();
            }
        });
    }

    function _getCQAddress() {
        return [_data.bizStreet, _data.bizCity, _data.bizState, _data.bizZip]
            .filter(Boolean).join(', ').trim();
    }

    async function _updateCQMapPreviews() {
        const streetImg = document.getElementById('cq-biz-streetViewImg');
        const satImg    = document.getElementById('cq-biz-satelliteViewImg');
        const hint      = document.getElementById('cq-biz-mapHint');
        if (!streetImg || !satImg) return;

        const address = _getCQAddress();
        if (!address) {
            if (hint) hint.textContent = 'Enter an address to load previews.';
            streetImg.removeAttribute('src');
            satImg.removeAttribute('src');
            return;
        }

        if (typeof App === 'undefined' || !App.ensureMapApiKey) return;
        const apiKey = await App.ensureMapApiKey();
        if (!apiKey) {
            if (hint) hint.textContent = 'Map previews unavailable.';
            return;
        }

        const enc = encodeURIComponent(address);
        streetImg.src = 'https://maps.googleapis.com/maps/api/streetview?size=640x360&location=' + enc + '&fov=80&pitch=0&key=' + apiKey;
        satImg.src    = 'https://maps.googleapis.com/maps/api/staticmap?center=' + enc + '&zoom=19&size=640x360&maptype=satellite&key=' + apiKey;
        streetImg.style.cursor = 'pointer';
        satImg.style.cursor    = 'pointer';
        streetImg.onclick = _openBizStreetView;
        satImg.onclick    = _openBizMaps;
        if (hint) hint.textContent = '\u00a0';
    }

    function _scheduleCQMapPreview() {
        if (!_debouncedCQMap) _debouncedCQMap = Utils.debounce(_updateCQMapPreviews, 450);
        _debouncedCQMap();
    }

    function _initCQPlaces() {
        if (_cqPlacesInit) return;
        const streetInput = document.getElementById('cq_bizStreet');
        if (!streetInput) return;
        if (!window.google?.maps?.places) {
            setTimeout(_initCQPlaces, 600);
            return;
        }
        _cqPlacesInit = true;

        let sessionToken = new google.maps.places.AutocompleteSessionToken();
        const ac = new google.maps.places.Autocomplete(streetInput, {
            types: ['address'],
            componentRestrictions: { country: 'us' },
            fields: ['address_components', 'formatted_address'],
            sessionToken
        });

        const refreshToken = () => {
            sessionToken = new google.maps.places.AutocompleteSessionToken();
            ac.setOptions({ sessionToken });
        };
        streetInput.addEventListener('focus', refreshToken);

        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (!place?.address_components) {
                if (typeof App !== 'undefined' && App.toast) App.toast('\u26a0\ufe0f Address not found.', 'error');
                return;
            }
            const parts = { street_number: '', route: '', locality: '', postal_town: '',
                            administrative_area_level_1: '', postal_code: '' };
            place.address_components.forEach(c => {
                const t = c.types?.[0];
                if (t && Object.prototype.hasOwnProperty.call(parts, t)) {
                    parts[t] = c.short_name || c.long_name || '';
                }
            });
            const street = [parts.street_number, parts.route].filter(Boolean).join(' ').trim();
            const city   = parts.locality || parts.postal_town || '';
            const state  = parts.administrative_area_level_1 || '';
            const zip    = parts.postal_code || '';

            const setField = (id, val) => {
                const el = document.getElementById(id);
                if (el) { el.value = val; _data[id.slice(3)] = val; }
            };
            setField('cq_bizStreet', street || place.formatted_address || '');
            setField('cq_bizCity',   city);
            setField('cq_bizState',  state);
            setField('cq_bizZip',    zip);
            _save();
            _scheduleCQMapPreview();
            refreshToken();
        });
    }

    function _openBizStreetView() {
        const addr = _getCQAddress();
        if (!addr) return;
        window.open('https://www.google.com/maps/@?api=1&map_action=pano&parameters=&viewpoint=' + encodeURIComponent(addr), '_blank');
    }

    function _openBizMaps() {
        const addr = _getCQAddress();
        if (!addr) return;
        window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr), '_blank');
    }

    function _genId() {
        return 'cq_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    return { init, save, load, getQuotes, saveQuote, loadQuote, newQuote, prev, next, exportPDF, exportCMSMTF, render, openBizStreetView: _openBizStreetView, openBizMaps: _openBizMaps };
})();
