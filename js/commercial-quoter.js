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
        const doc    = new jsPDF({ unit: 'mm', format: 'a4' });
        const pageW  = doc.internal.pageSize.getWidth();
        const pageH  = doc.internal.pageSize.getHeight();
        const ML     = 12;      // left margin
        const MR     = 12;      // right margin
        const LABEL_W = 56;     // label column width (right-aligned)
        const VALUE_X = ML + LABEL_W + 3.5;
        const VALUE_W = pageW - VALUE_X - MR;
        const LINE_H  = 4.3;    // line-height for 9pt body text
        const FOOTER_RESERVE = 13;

        let y = 0;
        let rowIdx = 0;

        // ── Palette ──────────────────────────────────────────────────────
        const BLUE      = [0, 102, 204];
        const BLUE_MID  = [0, 78, 168];
        const BLUE_LT   = [224, 236, 255];
        const WHITE     = [255, 255, 255];
        const DARK      = [28, 28, 30];
        const GRAY      = [105, 105, 110];
        const ROW_ALT   = [247, 250, 255];
        const DIVIDER   = [210, 218, 232];

        // ── Helpers ──────────────────────────────────────────────────────

        function checkBreak(needed) {
            if (y + (needed || 8) > pageH - FOOTER_RESERVE) {
                doc.addPage();
                y = 12;
                rowIdx = 0;
            }
        }

        function sectionHeader(title) {
            checkBreak(14);
            y += 4;
            doc.setFillColor(...BLUE_MID);
            doc.rect(ML, y, pageW - ML - MR, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...WHITE);
            doc.text(title.toUpperCase(), ML + 3, y + 5.5);
            y += 12;
            rowIdx = 0;
        }

        // Two-column field row: right-aligned gray label | left-aligned dark value
        function row(label, value) {
            if (value === undefined || value === null || String(value).trim() === '' || value === false) return;
            value = String(value);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const lines = doc.splitTextToSize(value, VALUE_W);
            const rh = Math.max(7, lines.length * LINE_H + 3);

            checkBreak(rh);

            if (rowIdx % 2 === 1) {
                doc.setFillColor(...ROW_ALT);
                doc.rect(ML, y, pageW - ML - MR, rh, 'F');
            }

            const ty = y + LINE_H + 0.3;   // text baseline

            // Label
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...GRAY);
            doc.text(label, ML + LABEL_W, ty, { align: 'right' });

            // Vertical divider
            doc.setDrawColor(...DIVIDER);
            doc.setLineWidth(0.25);
            doc.line(ML + LABEL_W + 1.8, y + 1, ML + LABEL_W + 1.8, y + rh - 1);

            // Value
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...DARK);
            doc.text(lines, VALUE_X, ty);

            y += rh;
            rowIdx++;
        }

        // Highlight row for selected coverage type names
        function covRow(name) {
            checkBreak(9);
            doc.setFillColor(...BLUE_LT);
            doc.rect(ML, y, pageW - ML - MR, 8, 'F');
            doc.setFillColor(...BLUE);
            doc.roundedRect(ML + 2, y + 2, 3.5, 4, 0.8, 0.8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...BLUE_MID);
            doc.text(name, ML + 7.5, y + 5.5);
            y += 9;
            rowIdx = 0;
        }

        // ── Header ───────────────────────────────────────────────────────
        doc.setFillColor(...BLUE);
        doc.rect(0, 0, pageW, 20, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...WHITE);
        doc.text('Commercial Insurance Intake', ML, 10);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(180, 210, 255);
        const genDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        doc.text('Generated ' + genDate, ML, 16.5);

        const bizLabel = (_data.bizName || 'Unnamed Business').slice(0, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...WHITE);
        doc.text(bizLabel, pageW - MR - doc.getTextWidth(bizLabel), 12);

        y = 27;

        // ── Business Info ─────────────────────────────────────────────────
        sectionHeader('Business Information');
        row('Business Name', _data.bizName);
        row('Contact', _data.contactName);
        row('Email', _data.contactEmail);
        row('Phone', _fmtPhone(_data.bizPhone));
        row('Address', _data.bizStreet);
        const cityLine = [_data.bizCity, _data.bizState, _data.bizZip].filter(Boolean).join(', ');
        if (cityLine) row('City / State / Zip', cityLine);
        row('Date Started', _data.dateStarted);
        row('Years in Industry', _data.yrsIndustry);
        row('Yrs Mgmt Experience', _data.yrsMgtExp);
        row('Annual Receipts (Est)', _fmtDollar(_data.annualReceiptsEst));
        row('Prior Year Receipts', _fmtDollar(_data.annualReceiptsPrior));
        row('Effective Date', _data.effectiveDate);
        row('Marketing Agent', _data.marketingAgent);

        // ── Coverage Types ────────────────────────────────────────────────
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
            covRow(covNames[k]);
            (detailMap[k] || []).forEach(pair => {
                const sep    = pair.indexOf(':');
                const fKey   = pair.slice(0, sep);
                const fLabel = pair.slice(sep + 1);
                if (_data[fKey]) row(fLabel, DOLLAR_KEYS.has(fKey) ? _fmtDollar(_data[fKey]) : _data[fKey]);
            });
        });
        if (!anyCov) row('Coverages', 'None selected');

        // ── Locations ─────────────────────────────────────────────────────
        sectionHeader('Locations & Property');
        row('# Locations', _data.numLocations);
        row('States of Operation', _data.statesOperate);
        row('Countries', _data.countriesOperate);
        row('Own / Lease Building', _data.ownLeaseBuild);
        row('Building Value', _fmtDollar(_data.buildingValue));
        row('Location Address(es)', _data.locAddress);

        // ── Owner & Background ────────────────────────────────────────────
        sectionHeader('Owner & Background');
        row('# Owners', _data.numOwners);
        row('Owner Name(s)', _data.ownerNames);
        row('Owner Home Address', _data.ownerHomeAddress);
        row('Owner DOB', _data.ownerDOB);
        row('Prior Conviction', _data.convicted);
        row('Bankruptcy', _data.bankruptcy);
        row('Lawsuits', _data.lawsuits);
        row('FT Employees', _data.ftEmployees);
        row('PT Employees', _data.ptEmployees);
        row('Payroll', _fmtDollar(_data.payroll));
        row('Subcontractors', _data.hasSubcontractors);
        if (_data.hasSubcontractors === 'Y') {
            row('Subcontracting Costs', _fmtDollar(_data.subcontractingCosts));
            row('Obtain Certs', _data.obtainCerts);
        }

        // ── Prior Insurance ───────────────────────────────────────────────
        sectionHeader('Prior Insurance');
        row('Current Carrier', _data.currentInsurance);
        row('Policy Expiration', _data.policyExpiration);
        row('Reason for Quote', _data.reasonForQuote);
        row('Claims', _data.insuranceClaims);

        // ── Footer on every page ──────────────────────────────────────────
        const totalPages = doc.getNumberOfPages ? doc.getNumberOfPages() : doc.internal.pages.length - 1;
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setDrawColor(...DIVIDER);
            doc.setLineWidth(0.3);
            doc.line(ML, pageH - 10, pageW - MR, pageH - 10);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...GRAY);
            doc.text('Altech Commercial Lines', ML, pageH - 6);
            const pgStr = 'Page ' + p + ' of ' + totalPages;
            doc.text(pgStr, pageW - MR - doc.getTextWidth(pgStr), pageH - 6);
        }

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

    // ── Private — Formatting helpers ──────────────────────────────────────────

    const DOLLAR_IDS = new Set([
        'cq_annualReceiptsEst','cq_annualReceiptsPrior',
        'cq_glOccLimit','cq_glAggLimit','cq_glDeductible',
        'cq_bondAmount','cq_plLimit','cq_plDeductible',
        'cq_baBILimits','cq_baPDLimit',
        'cq_propBuildingValue','cq_propContentsValue','cq_propDeductible',
        'cq_bppValue','cq_bppDeductible','cq_imValue','cq_cargoValue',
        'cq_buildingValue','cq_payroll','cq_subcontractingCosts',
    ]);

    // Dollar keys without the "cq_" prefix, for use in exportPDF
    const DOLLAR_KEYS = new Set([
        'annualReceiptsEst','annualReceiptsPrior',
        'glOccLimit','glAggLimit','glDeductible',
        'bondAmount','plLimit','plDeductible',
        'baBILimits','baPDLimit',
        'propBuildingValue','propContentsValue','propDeductible',
        'bppValue','bppDeductible','imValue','cargoValue',
        'buildingValue','payroll','subcontractingCosts',
    ]);

    function _fmtDollar(val) {
        const raw = String(val || '').replace(/[^0-9.]/g, '');
        if (!raw) return String(val || '');
        const num = parseFloat(raw);
        if (isNaN(num)) return String(val || '');
        return '$' + Math.round(num).toLocaleString('en-US');
    }

    function _fmtPhone(val) {
        const d = String(val || '').replace(/\D/g, '').slice(0, 10);
        if (d.length < 10) return String(val || '');
        return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
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

    // Pre-fill location address from business address when step 3 is first shown
    function _autofillLocation() {
        const locEl = document.getElementById('cq_locAddress');
        if (!locEl || locEl.value.trim()) return;
        const addr = [_data.bizStreet, _data.bizCity, _data.bizState, _data.bizZip]
            .filter(Boolean).join(', ');
        if (addr) {
            locEl.value = addr;
            _data.locAddress = addr;
        }
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
        // Pre-fill location address from biz address on first visit to step 3
        if (_step === 3) _autofillLocation();
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

        // Phone number live formatter — runs before the debounced save
        app.addEventListener('input', function(e) {
            if (e.target.id !== 'cq_bizPhone') return;
            const el = e.target;
            const digits = el.value.replace(/\D/g, '').slice(0, 10);
            if (!digits)          { el.value = '';                                                              return; }
            if (digits.length <= 3) { el.value = '(' + digits;                                                 return; }
            if (digits.length <= 6) { el.value = '(' + digits.slice(0,3) + ') ' + digits.slice(3);            return; }
            el.value = '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
        });

        // Dollar formatter on blur (capture phase so it fires before save)
        app.addEventListener('blur', function(e) {
            if (!DOLLAR_IDS.has(e.target.id)) return;
            const formatted = _fmtDollar(e.target.value);
            if (formatted) e.target.value = formatted;
        }, true);

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
