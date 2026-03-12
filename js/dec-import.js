/**
 * Dec Page Importer — CMSMTF Generator from Insurance Declarations Pages
 *
 * Reads uploaded PDF dec pages, extracts structured data via Anthropic Claude,
 * presents an editable review panel, and generates downloadable .CMSMTF files
 * for HawkSoft 6 import.
 *
 * window.DecImport
 */
window.DecImport = (() => {
    'use strict';

    // ── Module State (no localStorage) ──────────────────────────
    let _extractedData = null;   // Parsed JSON from AI
    let _pdfFileName = '';       // Original filename for download naming
    let _isExtracting = false;   // Prevent double-submit

    // ── Helpers ─────────────────────────────────────────────────

    /** Trim to string or empty */
    function _val(v) { return (v == null ? '' : String(v)).trim(); }

    /** CMSMTF line: key = value */
    function _line(key, value) { return `${key} = ${_val(value)}`; }

    /**
     * Normalize a date string to MM/DD/YYYY for CMSMTF.
     * Accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, etc.
     */
    function _fmtDate(v) {
        if (!v) return '';
        const s = _val(v);
        // Already MM/DD/YYYY
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
        // ISO: YYYY-MM-DD
        const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) return `${iso[2].padStart(2, '0')}/${iso[3].padStart(2, '0')}/${iso[1]}`;
        return s;
    }

    /**
     * Convert a string to Title Case (first letter of each word uppercase, rest lowercase).
     */
    function _toTitleCase(s) {
        if (!s) return '';
        return s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }

    /**
     * Parse "Last, First" or "First Last" into { firstName, lastName }.
     * Returns Title Case names.
     */
    function _parseName(raw) {
        if (!raw) return { firstName: '', lastName: '' };
        const s = _val(raw);
        if (s.includes(',')) {
            const parts = s.split(',').map(p => p.trim());
            return { lastName: _toTitleCase(parts[0] || ''), firstName: _toTitleCase(parts.slice(1).join(' ').trim()) };
        }
        const parts = s.split(/\s+/);
        if (parts.length === 1) return { firstName: _toTitleCase(parts[0]), lastName: '' };
        return { firstName: _toTitleCase(parts.slice(0, -1).join(' ')), lastName: _toTitleCase(parts[parts.length - 1]) };
    }

    /**
     * Calculate policy term in months from effective and expiration dates.
     * Returns '6' or '12' (defaults to '12' if indeterminate).
     */
    function _calcTerm(effDate, expDate) {
        if (!effDate || !expDate) return '';
        const parse = (d) => {
            const s = _val(d);
            const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
            const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (mdy) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2]);
            return null;
        };
        const eff = parse(effDate);
        const exp = parse(expDate);
        if (!eff || !exp) return '';
        const months = (exp.getFullYear() - eff.getFullYear()) * 12 + (exp.getMonth() - eff.getMonth());
        return months <= 6 ? '6' : '12';
    }

    /**
     * Read a File as base64 (strip the data-url prefix).
     */
    function _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.split(',')[1] || '';
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    // ── AI Extraction ───────────────────────────────────────────

    async function _extractFromPDF(file) {
        if (_isExtracting) return;
        _isExtracting = true;
        _showStatus('Extracting data from dec page…', 'loading');

        try {
            const base64 = await _fileToBase64(file);

            // Get the user's API key from AIProvider
            let apiKey = '';
            if (typeof AIProvider !== 'undefined' && AIProvider.getApiKey) {
                apiKey = AIProvider.getApiKey();
            }
            if (!apiKey) {
                _showStatus('Please configure an Anthropic API key in Settings → AI Provider.', 'error');
                return;
            }

            const systemPrompt = `You are an insurance declarations page data extractor. Extract structured data from the uploaded PDF dec page and return ONLY valid JSON with no markdown fences or extra text.

Return this exact JSON structure:
{
  "namedInsureds": ["Full Name as printed"],
  "mailingAddress": { "street": "", "city": "", "state": "", "zip": "" },
  "policyNumber": "",
  "carrier": "",
  "writingCarrier": "",
  "effectiveDate": "MM/DD/YYYY",
  "expirationDate": "MM/DD/YYYY",
  "policyType": "HOME|AUTO|BOTH",
  "premium": "",
  "vehicles": [
    { "year": "", "make": "", "model": "", "vin": "", "use": "", "annualMileage": "", "garagingZip": "", "comp": "", "coll": "", "towing": "", "rental": "" }
  ],
  "drivers": [
    { "fullName": "", "dob": "MM/DD/YYYY", "licenseNumber": "", "licenseState": "", "gender": "", "maritalStatus": "", "relationship": "" }
  ],
  "coverages": {
    "dwelling": "", "liability": "", "deductibleAOP": "", "deductibleWind": "",
    "bi": "", "pd": "", "umBi": "", "uimBi": "", "medical": "", "pip": ""
  },
  "property": {
    "yearBuilt": "", "sqFt": "", "stories": "", "roofType": "", "constructionStyle": "",
    "foundation": "", "heating": "", "protectionClass": ""
  },
  "mortgagee": { "name": "", "address": "", "city": "", "state": "", "zip": "", "loanNumber": "" },
  "priorCarrier": "",
  "agencyName": ""
}

Rules:
- Extract ALL named insureds exactly as printed (may be comma-separated on the dec page).
- For vehicles and drivers, extract ALL listed — do not skip any.
- Dates must be MM/DD/YYYY format.
- For coverage amounts, include the dollar value as a plain number string (no $ or commas).
- If a field is not found on the dec page, leave it as empty string "".
- "policyType" should be HOME if it's a homeowners/dwelling/renters policy, AUTO if auto/vehicle, BOTH if it covers both.
- Return ONLY the JSON object, nothing else.`;

            const messages = [{
                role: 'user',
                content: [
                    {
                        type: 'document',
                        source: {
                            type: 'base64',
                            media_type: 'application/pdf',
                            data: base64
                        }
                    },
                    {
                        type: 'text',
                        text: 'Extract all structured insurance data from this declarations page. Return only the JSON object.'
                    }
                ]
            }];

            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch) ? Auth.apiFetch.bind(Auth) : fetch;
            const res = await fetchFn('/api/anthropic-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    system: systemPrompt,
                    messages,
                    max_tokens: 4096,
                    temperature: 0,
                    apiKey
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || `API error (${res.status})`);
            }

            const data = await res.json();
            const raw = data?.content?.[0]?.text || '';

            // Strip markdown fences if present
            const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

            let parsed;
            try {
                parsed = JSON.parse(cleaned);
            } catch (e) {
                throw new Error('AI returned invalid JSON. Please try again.');
            }

            _extractedData = parsed;
            _populateReviewPanel(parsed);
            _showStatus('Data extracted successfully. Review and edit below, then generate CMSMTF.', 'success');

        } catch (err) {
            console.warn('[DecImport] Extraction error:', err.message);
            _showStatus(err.message || 'Extraction failed.', 'error');
        } finally {
            _isExtracting = false;
        }
    }

    // ── Review Panel Population ─────────────────────────────────

    function _populateReviewPanel(data) {
        const panel = document.getElementById('diReviewPanel');
        if (!panel) return;
        panel.classList.remove('di-hidden');

        // Client section
        const insureds = (data.namedInsureds || []).join(', ');
        _setVal('diNamedInsureds', insureds);
        _setVal('diStreet', data.mailingAddress?.street);
        _setVal('diCity', data.mailingAddress?.city);
        _setVal('diState', data.mailingAddress?.state);
        _setVal('diZip', data.mailingAddress?.zip);

        // Policy section
        _setVal('diPolicyNumber', data.policyNumber);
        _setVal('diCarrier', data.carrier);
        _setVal('diWritingCarrier', data.writingCarrier);
        _setVal('diEffective', data.effectiveDate);
        _setVal('diExpiration', data.expirationDate);
        _setVal('diTerm', _calcTerm(data.effectiveDate, data.expirationDate));
        _setVal('diPolicyType', data.policyType);
        _setVal('diPremium', data.premium);
        _setVal('diPriorCarrier', data.priorCarrier);
        _setVal('diAgencyName', data.agencyName);

        // Coverages
        const cov = data.coverages || {};
        _setVal('diDwelling', cov.dwelling);
        _setVal('diLiability', cov.liability);
        _setVal('diDeductibleAOP', cov.deductibleAOP);
        _setVal('diDeductibleWind', cov.deductibleWind);
        _setVal('diBi', cov.bi);
        _setVal('diPd', cov.pd);
        _setVal('diUmBi', cov.umBi);
        _setVal('diUimBi', cov.uimBi);
        _setVal('diMedical', cov.medical);
        _setVal('diPip', cov.pip);

        // Property
        const prop = data.property || {};
        _setVal('diYearBuilt', prop.yearBuilt);
        _setVal('diSqFt', prop.sqFt);
        _setVal('diStories', prop.stories);
        _setVal('diRoofType', prop.roofType);
        _setVal('diConstructionStyle', prop.constructionStyle);
        _setVal('diFoundation', prop.foundation);
        _setVal('diHeating', prop.heating);
        _setVal('diProtectionClass', prop.protectionClass);

        // Mortgagee
        const mort = data.mortgagee || {};
        _setVal('diMortgageeName', mort.name);
        _setVal('diMortgageeAddress', mort.address);
        _setVal('diMortgageeCity', mort.city);
        _setVal('diMortgageeState', mort.state);
        _setVal('diMortgageeZip', mort.zip);
        _setVal('diLoanNumber', mort.loanNumber);

        // Vehicles (dynamic)
        _renderVehicles(data.vehicles || []);

        // Drivers (dynamic)
        _renderDrivers(data.drivers || []);

        // Show generate button
        const genSection = document.getElementById('diGenerateSection');
        if (genSection) genSection.classList.remove('di-hidden');
    }

    function _setVal(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = _val(value);
    }

    function _renderVehicles(vehicles) {
        const container = document.getElementById('diVehiclesContainer');
        if (!container) return;

        if (!vehicles.length) {
            container.innerHTML = '<p class="di-empty">No vehicles found on dec page.</p>';
            return;
        }

        container.innerHTML = vehicles.map((v, i) => `
            <div class="di-card" data-vehicle-index="${i}">
                <div class="di-card-header">Vehicle ${i + 1}</div>
                <div class="di-grid">
                    <label class="di-field"><span>Year</span><input type="text" data-veh="year" value="${_escHtml(v.year)}"></label>
                    <label class="di-field"><span>Make</span><input type="text" data-veh="make" value="${_escHtml(v.make)}"></label>
                    <label class="di-field"><span>Model</span><input type="text" data-veh="model" value="${_escHtml(v.model)}"></label>
                    <label class="di-field"><span>VIN</span><input type="text" data-veh="vin" value="${_escHtml(v.vin)}"></label>
                    <label class="di-field"><span>Use</span><input type="text" data-veh="use" value="${_escHtml(v.use)}"></label>
                    <label class="di-field"><span>Annual Mileage</span><input type="text" data-veh="annualMileage" value="${_escHtml(v.annualMileage)}"></label>
                    <label class="di-field"><span>Garaging ZIP</span><input type="text" data-veh="garagingZip" value="${_escHtml(v.garagingZip)}"></label>
                    <label class="di-field"><span>Comp Ded</span><input type="text" data-veh="comp" value="${_escHtml(v.comp)}"></label>
                    <label class="di-field"><span>Coll Ded</span><input type="text" data-veh="coll" value="${_escHtml(v.coll)}"></label>
                    <label class="di-field"><span>Towing</span><input type="text" data-veh="towing" value="${_escHtml(v.towing)}"></label>
                    <label class="di-field"><span>Rental</span><input type="text" data-veh="rental" value="${_escHtml(v.rental)}"></label>
                </div>
            </div>
        `).join('');
    }

    function _renderDrivers(drivers) {
        const container = document.getElementById('diDriversContainer');
        if (!container) return;

        if (!drivers.length) {
            container.innerHTML = '<p class="di-empty">No drivers found on dec page.</p>';
            return;
        }

        container.innerHTML = drivers.map((d, i) => `
            <div class="di-card" data-driver-index="${i}">
                <div class="di-card-header">Driver ${i + 1}</div>
                <div class="di-grid">
                    <label class="di-field"><span>Full Name</span><input type="text" data-drv="fullName" value="${_escHtml(d.fullName)}"></label>
                    <label class="di-field"><span>DOB</span><input type="text" data-drv="dob" value="${_escHtml(d.dob)}"></label>
                    <label class="di-field"><span>License #</span><input type="text" data-drv="licenseNumber" value="${_escHtml(d.licenseNumber)}"></label>
                    <label class="di-field"><span>License State</span><input type="text" data-drv="licenseState" value="${_escHtml(d.licenseState)}"></label>
                    <label class="di-field"><span>Gender</span><input type="text" data-drv="gender" value="${_escHtml(d.gender)}"></label>
                    <label class="di-field"><span>Marital Status</span><input type="text" data-drv="maritalStatus" value="${_escHtml(d.maritalStatus)}"></label>
                    <label class="di-field"><span>Relationship</span><input type="text" data-drv="relationship" value="${_escHtml(d.relationship)}"></label>
                </div>
            </div>
        `).join('');
    }

    function _escHtml(v) {
        if (v == null) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Read Form Back ──────────────────────────────────────────

    /**
     * Read the review panel inputs back into a structured object.
     */
    function _readForm() {
        const g = id => (document.getElementById(id)?.value || '').trim();

        const namedInsuredsRaw = g('diNamedInsureds');
        const namedInsureds = namedInsuredsRaw ? namedInsuredsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

        const data = {
            namedInsureds,
            mailingAddress: { street: g('diStreet'), city: g('diCity'), state: g('diState'), zip: g('diZip') },
            policyNumber: g('diPolicyNumber'),
            carrier: g('diCarrier'),
            writingCarrier: g('diWritingCarrier'),
            effectiveDate: g('diEffective'),
            expirationDate: g('diExpiration'),
            term: g('diTerm'),
            policyType: g('diPolicyType'),
            premium: g('diPremium'),
            priorCarrier: g('diPriorCarrier'),
            agencyName: g('diAgencyName'),
            coverages: {
                dwelling: g('diDwelling'), liability: g('diLiability'),
                deductibleAOP: g('diDeductibleAOP'), deductibleWind: g('diDeductibleWind'),
                bi: g('diBi'), pd: g('diPd'),
                umBi: g('diUmBi'), uimBi: g('diUimBi'),
                medical: g('diMedical'), pip: g('diPip')
            },
            property: {
                yearBuilt: g('diYearBuilt'), sqFt: g('diSqFt'), stories: g('diStories'),
                roofType: g('diRoofType'), constructionStyle: g('diConstructionStyle'),
                foundation: g('diFoundation'), heating: g('diHeating'),
                protectionClass: g('diProtectionClass')
            },
            mortgagee: {
                name: g('diMortgageeName'), address: g('diMortgageeAddress'),
                city: g('diMortgageeCity'), state: g('diMortgageeState'),
                zip: g('diMortgageeZip'), loanNumber: g('diLoanNumber')
            },
            vehicles: [],
            drivers: []
        };

        // Read vehicles from dynamic cards
        document.querySelectorAll('#diVehiclesContainer .di-card').forEach(card => {
            const veh = {};
            card.querySelectorAll('input[data-veh]').forEach(inp => {
                veh[inp.dataset.veh] = inp.value.trim();
            });
            data.vehicles.push(veh);
        });

        // Read drivers from dynamic cards
        document.querySelectorAll('#diDriversContainer .di-card').forEach(card => {
            const drv = {};
            card.querySelectorAll('input[data-drv]').forEach(inp => {
                drv[inp.dataset.drv] = inp.value.trim();
            });
            data.drivers.push(drv);
        });

        return data;
    }

    // ── CMSMTF Generation ───────────────────────────────────────

    /**
     * Build a complete CMSMTF string from the review panel data.
     */
    function _generateCMSMTF(data) {
        const lines = [];

        // ── Client Block ──
        // First named insured → client
        const primary = _parseName(data.namedInsureds[0] || '');
        const addr = data.mailingAddress || {};

        lines.push(_line('gen_sLastName', primary.lastName));
        lines.push(_line('gen_sFirstName', primary.firstName));
        lines.push(_line('gen_cInitial', ''));
        lines.push(_line('gen_sAddress1', addr.street));
        lines.push(_line('gen_sCity', addr.city));
        lines.push(_line('gen_sState', addr.state));
        lines.push(_line('gen_sZip', addr.zip));
        lines.push(_line('gen_sPhone', ''));
        lines.push(_line('gen_sCellPhone', ''));
        lines.push(_line('gen_sEmail', ''));

        // Client Misc Data Set 1 (DOB/prefix/suffix/gender/edu/occ/industry)
        for (let i = 0; i < 10; i++) {
            lines.push(_line(`gen_sClientMiscData[${i}]`, ''));
        }

        // Client Misc Data Set 2 (co-applicant slots)
        for (let i = 0; i < 10; i++) {
            lines.push(_line(`gen_sClientMisc2Data[${i}]`, ''));
        }

        // Client Misc Data Set 3 (unused)
        for (let i = 0; i < 10; i++) {
            lines.push(_line(`gen_sClientMisc3Data[${i}]`, ''));
        }

        // ── Policy Meta Block ──
        const pt = (data.policyType || '').toUpperCase();
        const isHome = pt === 'HOME' || pt === 'BOTH';
        const isAuto = pt === 'AUTO' || pt === 'BOTH';

        let policyType, lobCode, applicationType;
        if (isHome && isAuto) {
            policyType = 'HOME'; lobCode = 'HOME'; applicationType = 'Personal';
        } else if (isAuto) {
            policyType = 'AUTO'; lobCode = 'AUTOP'; applicationType = 'Personal';
        } else {
            policyType = 'HOME'; lobCode = 'HOME'; applicationType = 'Personal';
        }

        lines.push(_line('gen_sCMSPolicyType', policyType));
        lines.push(_line('gen_sApplicationType', applicationType));
        lines.push(_line('gen_sCompany', data.carrier));
        lines.push(_line('gen_sWritingCompany', data.writingCarrier));
        lines.push(_line('gen_sTerm', data.term));
        lines.push(_line('gen_sLOBCode', lobCode));
        lines.push(_line('gen_sPolicyNumber', data.policyNumber));
        lines.push(_line('gen_tEffectiveDate', _fmtDate(data.effectiveDate)));
        lines.push(_line('gen_tExpirationDate', _fmtDate(data.expirationDate)));
        lines.push(_line('gen_dTotal', data.premium));
        lines.push(_line('gen_sCounty', ''));

        // ── Home Block ──
        if (isHome) {
            const prop = data.property || {};
            const cov = data.coverages || {};
            const mort = data.mortgagee || {};

            lines.push(_line('gen_nYearBuilt', prop.yearBuilt));
            lines.push(_line('gen_sConstruction', prop.constructionStyle));
            lines.push(_line('gen_sProtectionClass', prop.protectionClass));

            // Lienholder / Mortgagee
            if (mort.name) {
                lines.push(_line('gen_sLPType1', 'Mortgagee'));
                lines.push(_line('gen_sLpName1', mort.name));
                lines.push(_line('gen_sLPName1Line2', ''));
                lines.push(_line('gen_sLpAddress1', mort.address));
                lines.push(_line('gen_sLpCity1', mort.city));
                lines.push(_line('gen_sLpState1', mort.state));
                lines.push(_line('gen_sLpZip1', mort.zip));
                lines.push(_line('gen_sLpLoanNumber1', mort.loanNumber));
            }
        }

        // ── Auto Block ──
        if (isAuto) {
            const cov = data.coverages || {};
            lines.push(_line('gen_sBi', cov.bi));
            lines.push(_line('gen_sPd', cov.pd));
            lines.push(_line('gen_sUmBi', cov.umBi));
            lines.push(_line('gen_sUimBi', cov.uimBi));
            lines.push(_line('gen_sMedical', cov.medical));
            lines.push(_line('gen_sPip', cov.pip));

            // Vehicles
            (data.vehicles || []).forEach((v, i) => {
                const idx = `[${i}]`;
                lines.push(_line(`veh_sYr${idx}`, v.year));
                lines.push(_line(`veh_sMake${idx}`, v.make));
                lines.push(_line(`veh_sModel${idx}`, v.model));
                lines.push(_line(`veh_sVIN${idx}`, v.vin));
                lines.push(_line(`veh_sUse${idx}`, v.use));
                lines.push(_line(`veh_lMileage${idx}`, v.annualMileage));
                lines.push(_line(`veh_sGaragingZip${idx}`, v.garagingZip));
                lines.push(_line(`veh_sComp${idx}`, v.comp));
                lines.push(_line(`veh_sColl${idx}`, v.coll));
                lines.push(_line(`veh_sTowing${idx}`, v.towing));
                lines.push(_line(`veh_sRentRemb${idx}`, v.rental));
            });

            // Drivers — first named insured is driver [0], additional named insureds
            // become additional drivers with relationship "Named Insured"
            const allDrivers = [...(data.drivers || [])];

            // If there are additional named insureds not already in drivers, add them
            if (data.namedInsureds.length > 1) {
                const existingNames = new Set(allDrivers.map(d => (d.fullName || '').toLowerCase()));
                data.namedInsureds.slice(1).forEach(name => {
                    if (!existingNames.has(name.toLowerCase())) {
                        allDrivers.push({ fullName: name, relationship: 'Named Insured', dob: '', licenseNumber: '', licenseState: '', gender: '', maritalStatus: '' });
                    }
                });
            }

            allDrivers.forEach((d, i) => {
                const idx = `[${i}]`;
                const parsed = _parseName(d.fullName);
                lines.push(_line(`drv_sLastName${idx}`, parsed.lastName));
                lines.push(_line(`drv_sFirstName${idx}`, parsed.firstName));
                lines.push(_line(`drv_cInitial${idx}`, ''));
                lines.push(_line(`drv_tBirthDate${idx}`, _fmtDate(d.dob)));
                lines.push(_line(`drv_sLicenseNum${idx}`, d.licenseNumber));
                lines.push(_line(`drv_sLicensingState${idx}`, d.licenseState));
                lines.push(_line(`drv_sSex${idx}`, d.gender));
                lines.push(_line(`drv_sMaritalStatus${idx}`, d.maritalStatus));
                lines.push(_line(`drv_sRelationship${idx}`, d.relationship || (i === 0 ? 'Self' : 'Named Insured')));
            });
        }

        // Join with CRLF for Windows/HawkSoft compatibility
        return lines.join('\r\n') + '\r\n';
    }

    // ── Download ────────────────────────────────────────────────

    function _downloadCMSMTF(content) {
        const data = _readForm();
        const baseName = _pdfFileName
            ? _pdfFileName.replace(/\.pdf$/i, '')
            : (data.namedInsureds[0] || 'dec_import').replace(/[^a-zA-Z0-9_-]/g, '_');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}.cmsmtf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── Status / Toast ──────────────────────────────────────────

    function _showStatus(message, type) {
        const el = document.getElementById('diStatus');
        if (!el) return;
        el.textContent = message;
        el.className = 'di-status';
        if (type) el.classList.add(`di-status-${type}`);
        el.classList.remove('di-hidden');
    }

    function _hideStatus() {
        const el = document.getElementById('diStatus');
        if (el) el.classList.add('di-hidden');
    }

    // ── Clear / Reset ───────────────────────────────────────────

    function _clear() {
        _extractedData = null;
        _pdfFileName = '';
        _isExtracting = false;

        const panel = document.getElementById('diReviewPanel');
        if (panel) panel.classList.add('di-hidden');

        const genSection = document.getElementById('diGenerateSection');
        if (genSection) genSection.classList.add('di-hidden');

        // Clear file input
        const fileInput = document.getElementById('diFileInput');
        if (fileInput) fileInput.value = '';

        // Reset drop zone label
        const label = document.querySelector('.di-drop-label');
        if (label) label.textContent = 'Drop a PDF dec page here, or click to browse';

        _hideStatus();
    }

    // ── Event Wiring ────────────────────────────────────────────

    function _wireEvents() {
        const dropZone = document.getElementById('diDropZone');
        const fileInput = document.getElementById('diFileInput');
        const extractBtn = document.getElementById('diExtractBtn');
        const generateBtn = document.getElementById('diGenerateBtn');
        const clearBtn = document.getElementById('diClearBtn');

        if (dropZone) {
            dropZone.addEventListener('click', () => fileInput?.click());

            dropZone.addEventListener('dragover', e => {
                e.preventDefault();
                dropZone.classList.add('di-drop-active');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('di-drop-active');
            });

            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.classList.remove('di-drop-active');
                const file = e.dataTransfer?.files?.[0];
                if (file && file.type === 'application/pdf') {
                    _pdfFileName = file.name;
                    const label = dropZone.querySelector('.di-drop-label');
                    if (label) label.textContent = file.name;
                    // Store file for extract button
                    dropZone._selectedFile = file;
                }
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                const file = fileInput.files?.[0];
                if (file) {
                    _pdfFileName = file.name;
                    const label = document.querySelector('.di-drop-label');
                    if (label) label.textContent = file.name;
                    if (dropZone) dropZone._selectedFile = file;
                }
            });
        }

        if (extractBtn) {
            extractBtn.addEventListener('click', () => {
                const file = dropZone?._selectedFile;
                if (!file) {
                    _showStatus('Please select a PDF file first.', 'error');
                    return;
                }
                _extractFromPDF(file);
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                const data = _readForm();
                if (!data.namedInsureds.length && !data.policyNumber) {
                    _showStatus('No data to export. Extract a dec page first.', 'error');
                    return;
                }
                const cmsmtf = _generateCMSMTF(data);
                _downloadCMSMTF(cmsmtf);
                _showStatus('CMSMTF file downloaded.', 'success');
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', _clear);
        }
    }

    // ── Init ────────────────────────────────────────────────────

    function init() {
        _wireEvents();
    }

    function render() {
        // No-op — HTML is loaded from plugins/dec-import.html
    }

    // ── Public API ──────────────────────────────────────────────

    return {
        init,
        render,
        // Exposed for testing
        _generateCMSMTF,
        _parseName,
        _toTitleCase,
        _calcTerm,
        _fmtDate,
        _readForm,
        _val,
        _line
    };
})();
