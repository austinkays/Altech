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
        _checkProspectTransfer();
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

    function goToStep(i) {
        if (i === _step || i < 0 || i > 6) return;
        _collectFields();
        _save();
        _step = i;
        _updateUI();
    }

    async function render() {
        // Called by cloud sync after pull
        await _load();
        _populateFields();
        if (_step === 0) _renderStep0();
        if (_step === 6) _renderSummary();
    }

    async function exportPDF() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            if (typeof App !== 'undefined' && App.toast) App.toast('PDF library not loaded — reload and try again', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc   = new jsPDF({ unit: 'mm' }); // Letter format (jsPDF default)
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const FOOTER_RESERVE = 16;

        let y = 0;

        // ── Palette (matches personal lines C object) ─────────────────────
        const C = {
            navy:     [15, 39, 69],       // #0f2745 — brand navy
            dark:     [26, 26, 26],       // #1a1a1a
            body:     [17, 17, 17],       // #111    — value text
            mid:      [85, 85, 85],       // #555    — secondary text
            label:    [68, 68, 68],       // #444    — field labels
            muted:    [68, 68, 68],       // #444    — de-emphasized values
            light:    [187, 187, 187],    // #bbb    — section header rule
            border:   [221, 227, 235],    // #dde3eb — card/border
            rule:     [204, 204, 204],    // #ccc    — footer rule
            footerTx: [119, 119, 119],    // #777    — footer text
            white:    [255, 255, 255],
        };

        const margin   = 15.2; // 0.6in side margins (matches personal lines)
        const contentW = pageW - margin * 2;

        // ── Null-value detection ──────────────────────────────────────────
        const isEmptyish = (val) => {
            if (!val && val !== 0) return true;
            const s = String(val).trim();
            return /^(none|not updated|n\/a|no coverage|unknown)$/i.test(s);
        };

        // ── Page-break guard ──────────────────────────────────────────────
        const checkPage = (needed = 18) => {
            if (y + needed > pageH - FOOTER_RESERVE) {
                doc.addPage();
                y = 14;
                return true;
            }
            return false;
        };

        // ── Footer — matches personal lines drawFooter() ──────────────────
        const drawFooter = () => {
            const total = doc.internal.getNumberOfPages();
            for (let i = 1; i <= total; i++) {
                doc.setPage(i);
                doc.setDrawColor(...C.rule);
                doc.setLineWidth(0.35);
                doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(...C.footerTx);
                doc.text('Generated by Altech Insurance Tools', margin, pageH - 7);
                doc.text(`Page ${i} of ${total}`, pageW - margin, pageH - 7, { align: 'right' });
            }
        };

        // ── Section header — text + rule (personal lines pattern) ─────────
        const sectionHeader = (title) => {
            checkPage(16);
            const labelText = title.toUpperCase();
            doc.setFontSize(7);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...C.navy);
            doc.text(labelText, margin, y + 5.5);
            const labelW = doc.getTextWidth(labelText);
            doc.setDrawColor(...C.light);
            doc.setLineWidth(0.4);
            doc.line(margin + labelW + 2.8, y + 4, pageW - margin, y + 4);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...C.dark);
            y += 7;
        };

        // ── Coverage sub-header (lighter treatment, visually distinct) ────
        const covRow = (name) => {
            checkPage(10);
            doc.setFillColor(...C.border);
            doc.rect(margin, y, contentW, 7.5, 'F');
            doc.setFillColor(...C.navy);
            doc.rect(margin, y, 2, 7.5, 'F');
            doc.setFont(undefined, 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...C.navy);
            doc.text(name, margin + 5, y + 5.2);
            y += 8.5;
        };

        // ── Key-value grid — 2-col, matches personal lines kvTable ────────
        const kvTable = (fields, cols = 2, cellH = 13) => {
            const filtered = fields.filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '');
            if (!filtered.length) return;
            const colW = contentW / cols;
            const colGap = 2.8;
            const usableColW = colW - colGap;
            let col = 0;
            let rowWrapped = false;
            const spanLast = filtered.length % cols === 1 && cols > 1;

            filtered.forEach(([label, value], i) => {
                if (col === 0) {
                    checkPage(cellH + 2);
                    rowWrapped = false;
                }
                const cellX = margin + col * colW;
                const cellY = y;

                // Label — 6.5pt uppercase #444
                doc.setFontSize(6.5);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(...C.label);
                doc.text(label.toUpperCase(), cellX, cellY + 3);

                // Value — null-ish → #444 normal; else → #111 normal
                const deEmphasize = isEmptyish(value);
                doc.setFontSize(9.5);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(...(deEmphasize ? C.muted : C.body));
                const isLastItem = (i === filtered.length - 1);
                const effectiveMaxW = (spanLast && isLastItem) ? usableColW * 2 + colGap : usableColW;
                const valLines = doc.splitTextToSize(String(value), effectiveMaxW);
                doc.text(valLines[0] || '', cellX, cellY + 8.5);
                if (valLines[1]) {
                    doc.text(valLines[1], cellX, cellY + 12.5);
                    rowWrapped = true;
                }

                col++;
                if (col >= cols) {
                    col = 0;
                    y += cellH + (rowWrapped && cols !== 2 ? 4 : 0);
                }
            });
            if (col > 0) {
                y += spanLast ? cellH - 3 : cellH;
            }
            doc.setFont(undefined, 'normal');
            y += 1; // minimal trailing gap
        };

        // ── Logo fetch (async, defensive) ────────────────────────────────
        let logoImg = null;
        try {
            if (typeof App !== 'undefined' && App.fetchImageDataUrl) {
                logoImg = await App.fetchImageDataUrl('Resources/altech-logo.png');
            }
        } catch (e) { /* graceful skip — logo is optional */ }

        // ── Timestamp helper ──────────────────────────────────────────────
        const now  = new Date();
        const pad2 = (n) => String(n).padStart(2, '0');
        const tsDate = `${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}/${now.getFullYear()}`;
        let hrs = now.getHours();
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12 || 12;
        const tsStr = `${tsDate} ${hrs}:${pad2(now.getMinutes())} ${ampm}`;

        // ── Page 1 header ─────────────────────────────────────────────────
        y = 11;
        const logoH = 18;
        const logoW = 18;
        let headerTextX = margin;
        if (logoImg?.dataUrl) {
            doc.addImage(logoImg.dataUrl, logoImg.format, margin, y - 1, logoW, logoH);
            headerTextX = margin + logoW + 3.5;
        }
        // Agency name — 11pt bold navy
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...C.navy);
        doc.text('Altech Insurance', headerTextX, y + 5);
        // Subtitle — 8pt uppercase #555
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...C.mid);
        doc.text('COMMERCIAL INSURANCE INTAKE', headerTextX, y + 11);

        // Doc ref — 10pt bold navy | Timestamp — 9pt #555
        const docRef = `CQ-${now.getFullYear()}-${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...C.navy);
        doc.text(docRef, pageW - margin, y + 5, { align: 'right' });
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...C.mid);
        doc.text(tsStr, pageW - margin, y + 11, { align: 'right' });

        y += Math.max(logoH + 1, 14);

        // 0.7px navy separator under header
        doc.setDrawColor(...C.navy);
        doc.setLineWidth(0.7);
        doc.line(margin, y, pageW - margin, y);
        y += 5;

        // ── Business card (applicant-card analog) ─────────────────────────
        const cardPadX    = 5;
        const cardPadY    = 4.2;
        const bizName     = _data.bizName || 'Unnamed Business';
        const contactLine = [_data.contactName, _data.contactEmail].filter(Boolean).join('  ·  ');
        const cardH       = contactLine ? 28 : 22;
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.4);
        doc.roundedRect(margin, y, contentW, cardH, 1.4, 1.4, 'S');
        // Left navy accent bar
        doc.setFillColor(...C.navy);
        doc.roundedRect(margin, y, 1, cardH, 0.5, 0.5, 'F');
        // Business name — 14pt bold navy
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...C.navy);
        doc.text(bizName, margin + cardPadX, y + cardPadY + 8);
        // Contact row — 9pt #555
        if (contactLine) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...C.mid);
            doc.text(contactLine, margin + cardPadX, y + cardPadY + 17);
        }
        y += cardH + 6;

        // ── Business Information ──────────────────────────────────────────
        sectionHeader('Business Information');
        const cityLine = [_data.bizCity, _data.bizState, _data.bizZip].filter(Boolean).join(', ');
        kvTable([
            ['Business Name',          _data.bizName],
            ['Contact',                _data.contactName],
            ['Email',                  _data.contactEmail],
            ['Phone',                  _fmtPhone(_data.bizPhone)],
            ['Address',                _data.bizStreet],
            ['City / State / Zip',     cityLine || null],
            ['Date Started',           _data.dateStarted],
            ['Years in Industry',      _data.yrsIndustry],
            ['Yrs Mgmt Experience',    _data.yrsMgtExp],
            ['Annual Receipts (Est)',  _fmtDollar(_data.annualReceiptsEst)],
            ['Prior Year Receipts',    _fmtDollar(_data.annualReceiptsPrior)],
            ['Effective Date',         _data.effectiveDate],
            ['Marketing Agent',        _data.marketingAgent],
        ]);

        // ── Coverage Types ────────────────────────────────────────────────
        sectionHeader('Coverage Types Selected');
        const covList  = ['covGL', 'covBond', 'covPL', 'covBA', 'covProp', 'covBPP', 'covIM', 'covCargo'];
        const covNames = {
            covGL: 'General Liability', covBond: 'Bond', covPL: 'Professional Liability',
            covBA: 'Business Auto', covProp: 'Property', covBPP: 'Business Personal Property',
            covIM: 'Inland Marine', covCargo: 'Cargo',
        };
        const detailMap = {
            covGL:    [['glOccLimit', 'Occ Limit'], ['glAggLimit', 'Agg Limit'], ['glDeductible', 'Deductible']],
            covBond:  [['bondType', 'Bond Type'], ['bondAmount', 'Bond Amount']],
            covPL:    [['plLimit', 'PL Limit'], ['plDeductible', 'PL Deductible'], ['plRetro', 'Retroactive Date']],
            covBA:    [['baNumVehicles', '# Vehicles'], ['baVehicleTypes', 'Vehicle Types'], ['baBILimits', 'BI Limits'], ['baPDLimit', 'PD Limit']],
            covProp:  [['propBuildingValue', 'Building Value'], ['propContentsValue', 'Contents Value'], ['propDeductible', 'Deductible'], ['propConstruction', 'Construction'], ['propYearBuilt', 'Year Built'], ['propSprinklers', 'Sprinklers']],
            covBPP:   [['bppValue', 'BPP Value'], ['bppDeductible', 'Deductible']],
            covIM:    [['imDescription', 'Description'], ['imValue', 'Total Value']],
            covCargo: [['cargoNumVehicles', '# Vehicles'], ['cargoRadius', 'Radius (mi)'], ['cargoValue', 'Max Load Value']],
        };
        let anyCov = false;
        covList.forEach(k => {
            if (!_data[k]) return;
            anyCov = true;
            covRow(covNames[k]);
            const details = (detailMap[k] || []).map(([fKey, fLabel]) => [
                fLabel, DOLLAR_KEYS.has(fKey) ? _fmtDollar(_data[fKey]) : _data[fKey],
            ]);
            kvTable(details);
        });
        if (!anyCov) kvTable([['Coverages', 'None selected']]);

        // ── Locations & Property ──────────────────────────────────────────
        sectionHeader('Locations & Property');
        kvTable([
            ['# Locations',          _data.numLocations],
            ['States of Operation',  _data.statesOperate],
            ['Countries',            _data.countriesOperate],
            ['Own / Lease Building', _data.ownLeaseBuild],
            ['Building Value',       _fmtDollar(_data.buildingValue)],
            ['Location Address(es)', _data.locAddress],
        ]);

        // ── Owner & Background ────────────────────────────────────────────
        sectionHeader('Owner & Background');
        const subFields = _data.hasSubcontractors === 'Y' ? [
            ['Subcontracting Costs', _fmtDollar(_data.subcontractingCosts)],
            ['Obtain Certs',         _data.obtainCerts],
        ] : [];
        kvTable([
            ['# Owners',           _data.numOwners],
            ['Owner Name(s)',       _data.ownerNames],
            ['Owner Home Address',  _data.ownerHomeAddress],
            ['Owner DOB',           _data.ownerDOB],
            ['Owner SSN',           _data.ownerSSN ? '***-**-' + String(_data.ownerSSN).replace(/\D/g, '').slice(-4) : ''],
            ['Prior Conviction',    _data.convicted],
            ['Bankruptcy',          _data.bankruptcy],
            ['Lawsuits',            _data.lawsuits],
            ['FT Employees',        _data.ftEmployees],
            ['PT Employees',        _data.ptEmployees],
            ['Payroll',             _fmtDollar(_data.payroll)],
            ['Subcontractors',      _data.hasSubcontractors],
            ...subFields,
        ]);

        // ── Prior Insurance ───────────────────────────────────────────────
        sectionHeader('Prior Insurance');
        kvTable([
            ['Current Carrier',   _data.currentInsurance],
            ['Policy Expiration', _data.policyExpiration],
            ['Reason for Quote',  _data.reasonForQuote],
            ['Claims',            _data.insuranceClaims],
        ]);

        // ── Footer ────────────────────────────────────────────────────────
        drawFooter();

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
        lines.push(ln('gen_sNAICS', d._aiNAICS || ''));
        lines.push(ln('gen_sWebsite', d._bizWebsite || ''));
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
            dot.onclick = function() { goToStep(i); };
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
        if (_step === 1) { setTimeout(_initCQPlaces, 50); _renderIntelSidebar(); }
        // Render AI coverage banner on step 2
        if (_step === 2) _renderCoverageBanner();
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
            '</div>' +
            (_data._aiGLClass || _data._aiRiskNote
                ? '<div class="cq-summary-section">' +
                  '<div class="cq-summary-title">Prospect Intelligence</div>' +
                  (_data._aiGLClass ? '<div class="cq-summary-row"><span class="cq-summary-label">GL Classification:</span> <span>' + Utils.escapeHTML(_data._aiGLClass) + '</span></div>' : '') +
                  (_data._aiRiskNote ? '<div class="cq-summary-row"><span class="cq-summary-label">Risk Assessment:</span> <span>' + Utils.escapeHTML(String(_data._aiRiskNote).substring(0, 200)) + '</span></div>' : '') +
                  (_data._bizWebsite ? '<div class="cq-summary-row"><span class="cq-summary-label">Website:</span> <span>' + Utils.escapeHTML(_data._bizWebsite) + '</span></div>' : '') +
                  '</div>'
                : '');
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

    // ── Prospect Intel Integration ──────────────────────────────────────────────

    /** Check for pending prospect data on init and apply it */
    function _checkProspectTransfer() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.PROSPECT_TO_QUOTER);
            if (!raw) return;
            const prospectData = JSON.parse(raw);
            localStorage.removeItem(STORAGE_KEYS.PROSPECT_TO_QUOTER);
            _applyProspectData(prospectData);
            _step = 1; // Jump to business info step
        } catch (e) {
            console.warn('[CommercialQuoter] prospect transfer failed', e);
        }
    }

    /** Map prospect investigation data to quoter fields — only fills empties */
    function _applyProspectData(pd) {
        if (!pd) return;
        let count = 0;

        const setIfEmpty = (key, val) => {
            if (!val) return;
            if (_data[key] && String(_data[key]).trim()) return; // don't overwrite
            _data[key] = val;
            count++;
        };

        setIfEmpty('bizName', pd.bizName);
        setIfEmpty('bizPhone', pd.bizPhone);
        setIfEmpty('bizStreet', pd.bizStreet);
        setIfEmpty('bizCity', pd.bizCity);
        setIfEmpty('bizState', pd.bizState);
        setIfEmpty('bizZip', pd.bizZip);
        setIfEmpty('dateStarted', pd.dateStarted);

        // Store AI fields (always overwrite — they're intel, not user data)
        if (pd._aiGLClass) _data._aiGLClass = pd._aiGLClass;
        if (pd._aiRecommendedCovs) _data._aiRecommendedCovs = pd._aiRecommendedCovs;
        if (pd._aiNAICS) _data._aiNAICS = pd._aiNAICS;
        if (pd._aiRiskNote) _data._aiRiskNote = pd._aiRiskNote;
        if (pd._aiRedFlags) _data._aiRedFlags = pd._aiRedFlags;
        if (pd._aiExecutiveSummary) _data._aiExecutiveSummary = pd._aiExecutiveSummary;
        if (pd.bizWebsite) _data._bizWebsite = pd.bizWebsite;
        if (pd.ownerNames) _data._ownerNames = pd.ownerNames;
        if (pd._sourceData) _data._sourceData = pd._sourceData;
        if (pd._timestamp) _data._intelTimestamp = pd._timestamp;

        _save();
        if (count > 0 && typeof App !== 'undefined' && App.toast) {
            App.toast('Intel auto-filled ' + count + ' field' + (count > 1 ? 's' : ''));
        }
    }

    /** Run prospect investigation from within the quoter */
    async function investigateBusiness() {
        const bizName = document.getElementById('cq_bizName')?.value?.trim();
        const bizState = document.getElementById('cq_bizState')?.value?.trim() || 'WA';

        if (!bizName) {
            if (typeof App !== 'undefined' && App.toast) App.toast('Enter a business name first');
            return;
        }

        // Check if ProspectInvestigator is loaded
        if (typeof ProspectInvestigator === 'undefined') {
            if (typeof App !== 'undefined' && App.toast) App.toast('Prospect Intel not available', 'error');
            return;
        }

        const btn = document.getElementById('cq-investigate-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="cq-intel-spinner"></span> Investigating...';
        }

        try {
            // Populate the prospect search fields and run a search
            // We'll use the ProspectInvestigator's API to get data
            // First check if there's already loaded data for this business
            const existing = ProspectInvestigator.currentData;
            if (existing && existing.displayName?.toLowerCase() === bizName.toLowerCase()) {
                // Reuse already-loaded data
                const quoterData = ProspectInvestigator.getQuoterData();
                if (quoterData) {
                    _applyProspectData(quoterData);
                    _populateFields();
                    _renderIntelSidebar();
                    _renderCoverageBanner();
                }
            } else {
                if (typeof App !== 'undefined' && App.toast) {
                    App.toast('Open Prospect Intel to investigate "' + Utils.escapeHTML(bizName) + '" first, then use "Start Commercial Quote"');
                }
            }
        } catch (e) {
            console.error('[CommercialQuoter] investigate error', e);
            if (typeof App !== 'undefined' && App.toast) App.toast('Investigation failed', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '🔍 Investigate Business';
            }
        }
    }

    /** Render intel sidebar in step 1 with investigation data */
    function _renderIntelSidebar() {
        const container = document.getElementById('cq-intel-sidebar');
        if (!container) return;

        const src = _data._sourceData;
        if (!src && !_data._aiExecutiveSummary) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';

        const esc = (s) => Utils.escapeHTML(s || '');

        // Source status pills
        const sources = [];
        if (src) {
            const pill = (name, available, status) => {
                const color = available ? (status === 'active' || status === 'Active' ? 'var(--success)' : 'orange') : 'var(--text-tertiary)';
                return '<span class="cq-intel-pill" style="border-color:' + color + ';color:' + color + ';">' + esc(name) + '</span>';
            };
            sources.push(pill('L&I', src.li?.available !== false && src.li?.contractor, src.li?.contractor?.status));
            sources.push(pill('SOS', src.sos?.available !== false && src.sos?.entity, src.sos?.entity?.status));
            sources.push(pill('OSHA', src.osha?.available !== false, src.osha?.summary?.totalInspections > 0 ? 'found' : 'clear'));
            sources.push(pill('SAM', src.sam?.available !== false && src.sam?.entities?.length > 0, 'found'));
            sources.push(pill('Google', src.places?.available !== false && src.places?.profile, 'active'));
        }

        // Risk assessment
        let riskHtml = '';
        if (_data._aiRiskNote) {
            riskHtml = '<div class="cq-intel-risk"><strong>Risk Assessment:</strong> ' + esc(_data._aiRiskNote).substring(0, 300) + '</div>';
        }

        // Red flags
        let flagsHtml = '';
        if (_data._aiRedFlags) {
            flagsHtml = '<div class="cq-intel-flags"><strong>Red Flags:</strong> ' + esc(_data._aiRedFlags).substring(0, 300) + '</div>';
        }

        // GL class hint
        let glHtml = '';
        if (_data._aiGLClass) {
            glHtml = '<div class="cq-intel-gl"><strong>GL Classification:</strong> ' + esc(_data._aiGLClass) + '</div>';
        }

        // Executive summary
        let summaryHtml = '';
        if (_data._aiExecutiveSummary) {
            summaryHtml = '<div class="cq-intel-summary">' + esc(_data._aiExecutiveSummary).substring(0, 500) + '</div>';
        }

        // OSHA quick stats
        let oshaHtml = '';
        if (src?.osha?.summary) {
            const o = src.osha.summary;
            oshaHtml = '<div class="cq-intel-osha">' +
                '<strong>OSHA:</strong> ' + (o.totalInspections || 0) + ' inspections, ' +
                (o.seriousViolations || 0) + ' serious, $' + ((o.totalPenalties || 0).toLocaleString()) + ' penalties</div>';
        }

        container.innerHTML =
            '<div class="cq-intel-header">' +
                '<h3>🧠 Business Intelligence</h3>' +
                ((_data._intelTimestamp) ? '<span class="hint">' + new Date(_data._intelTimestamp).toLocaleDateString() + '</span>' : '') +
            '</div>' +
            (sources.length ? '<div class="cq-intel-sources">' + sources.join('') + '</div>' : '') +
            summaryHtml + glHtml + riskHtml + flagsHtml + oshaHtml;
    }

    /** Render AI coverage recommendations banner on step 2 */
    function _renderCoverageBanner() {
        const banner = document.getElementById('cq-ai-coverage-banner');
        if (!banner) return;

        if (!_data._aiRecommendedCovs) {
            banner.style.display = 'none';
            return;
        }

        const text = _data._aiRecommendedCovs;
        // Map coverage keywords to checkbox IDs
        const covMap = {
            'general liability': 'cq_covGL', 'gl': 'cq_covGL', 'cgl': 'cq_covGL',
            'bond': 'cq_covBond', 'surety': 'cq_covBond',
            'professional liability': 'cq_covPL', 'e&o': 'cq_covPL', 'errors': 'cq_covPL',
            'business auto': 'cq_covBA', 'auto': 'cq_covBA', 'commercial auto': 'cq_covBA',
            'property': 'cq_covProp', 'building': 'cq_covProp',
            'bpp': 'cq_covBPP', 'business personal property': 'cq_covBPP', 'contents': 'cq_covBPP',
            'inland marine': 'cq_covIM', 'tools': 'cq_covIM', 'equipment': 'cq_covIM',
            'cargo': 'cq_covCargo', 'motor truck cargo': 'cq_covCargo',
        };

        const textLower = text.toLowerCase();
        const suggestions = [];
        const seen = new Set();

        Object.entries(covMap).forEach(function(entry) {
            const keyword = entry[0];
            const checkId = entry[1];
            if (textLower.includes(keyword) && !seen.has(checkId)) {
                seen.add(checkId);
                const el = document.getElementById(checkId);
                if (el && !el.checked) {
                    const nameMap = { cq_covGL:'GL', cq_covBond:'Bond', cq_covPL:'E&O', cq_covBA:'Auto',
                                      cq_covProp:'Property', cq_covBPP:'BPP', cq_covIM:'Inland Marine', cq_covCargo:'Cargo' };
                    suggestions.push({ id: checkId, name: nameMap[checkId] || keyword });
                }
            }
        });

        if (!suggestions.length) {
            banner.style.display = 'none';
            return;
        }

        banner.style.display = 'block';
        banner.innerHTML =
            '<div class="cq-cov-banner-inner">' +
                '<div class="cq-cov-banner-label">🧠 AI Recommended Coverages</div>' +
                '<div class="cq-cov-banner-pills">' +
                suggestions.map(function(s) {
                    return '<button class="cq-cov-pill" onclick="CommercialQuoter.applyCoverageSuggestion(\'' + Utils.escapeAttr(s.id) + '\')">' +
                        '+ ' + Utils.escapeHTML(s.name) + '</button>';
                }).join('') +
                '</div>' +
            '</div>';
    }

    /** Enable a coverage toggle from AI suggestion */
    function applyCoverageSuggestion(checkId) {
        const el = document.getElementById(checkId);
        if (!el) return;
        el.checked = true;
        _data[checkId.slice(3)] = true;
        // Show the detail panel
        const row = el.closest('.cq-coverage-row');
        const detail = row && row.querySelector('.cq-coverage-detail');
        if (detail) detail.classList.remove('hidden');
        _save();
        // Re-render banner (remove the applied suggestion)
        _renderCoverageBanner();
        if (typeof App !== 'undefined' && App.toast) App.toast('✓ ' + checkId.replace('cq_cov', '') + ' coverage enabled');
    }

    return { init, save, load, getQuotes, saveQuote, loadQuote, newQuote, prev, next, goToStep, exportPDF, exportCMSMTF, render, openBizStreetView: _openBizStreetView, openBizMaps: _openBizMaps, investigateBusiness: investigateBusiness, applyCoverageSuggestion: applyCoverageSuggestion };
})();
