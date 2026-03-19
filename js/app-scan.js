// js/app-scan.js — AI scanning, policy extraction, document intelligence
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {
    openScanPicker() {
        const input = document.getElementById('policyScanInput');
        if (input) input.click();
    },

    exportDemoPolicyDoc() {
        const jsPDF = window.jspdf && window.jspdf.jsPDF;
        if (!jsPDF) {
            this.toast('⚠️ PDF library not available.');
            return;
        }

        const demo = {
            firstName: 'Jordan',
            lastName: 'Reed',
            dob: '1988-05-12',
            phone: '(360) 555-0199',
            email: 'jordan.reed@example.com',
            addrStreet: '412 Evergreen Terrace',
            addrCity: 'Vancouver',
            addrState: 'WA',
            addrZip: '98686',
            vin: '1HGCM82633A123456',
            vehDesc: '2019 Honda Civic',
            liabilityLimits: '100/300/100',
            homeDeductible: '$1,000',
            autoDeductible: '$500',
            priorCarrier: 'State Farm',
            priorExp: '2025-12-31'
        };

        const doc = new jsPDF({ unit: 'pt', format: 'letter' });
        const marginX = 48;
        let y = 60;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Insurance Policy Declarations (Demo)', marginX, y);
        y += 22;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('Use this document to demo policy scan auto-fill.', marginX, y);
        y += 18;

        const addSection = (title, lines) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(title, marginX, y);
            y += 16;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            lines.forEach(line => {
                const wrapped = doc.splitTextToSize(line, 520);
                wrapped.forEach(w => {
                    doc.text(w, marginX, y);
                    y += 14;
                });
            });
            y += 8;
        };

        addSection('POLICYHOLDER / INSURED', [
            `Name: ${demo.firstName} ${demo.lastName}`,
            `DOB: ${demo.dob}`,
            `Phone: ${demo.phone}`,
            `Email: ${demo.email}`
        ]);

        addSection('ADDRESS', [
            `Street: ${demo.addrStreet}`,
            `City: ${demo.addrCity}`,
            `State: ${demo.addrState}`,
            `ZIP: ${demo.addrZip}`
        ]);

        addSection('VEHICLES', [
            `VIN: ${demo.vin}`,
            `Vehicle: ${demo.vehDesc}`
        ]);

        addSection('COVERAGE DETAILS', [
            `Liability Limits (BI/PD): ${demo.liabilityLimits}`,
            `Home Deductible: ${demo.homeDeductible}`,
            `Auto Deductible: ${demo.autoDeductible}`
        ]);

        addSection('PRIOR INSURANCE', [
            `Previous Carrier: ${demo.priorCarrier}`,
            `Expiration Date: ${demo.priorExp}`
        ]);

        doc.save('Altech_Demo_Policy.pdf');
        this.toast('⬇️ Demo policy PDF downloaded');
    },

    openInitialDriverLicensePicker() {
        const input = document.getElementById('initialDlScanInput');
        if (input) input.click();
    },

    openDocIntelPicker() {
        const input = document.getElementById('docIntelInput');
        if (input) input.click();
    },

    // ─── Shared section clear helper ────────────────────
    _clearSection(previewId, resultsId, statusId, inputId) {
        const preview = document.getElementById(previewId);
        if (preview) preview.innerHTML = '';
        const results = document.getElementById(resultsId);
        if (results) results.innerHTML = '';
        const status = document.getElementById(statusId);
        if (status) {
            status.classList.add('hidden');
            status.textContent = '';
        }
        const input = document.getElementById(inputId);
        if (input) input.value = '';
    },

    clearScan() {
        this.scanFiles = [];
        this.extractedData = null;
        this._clearSection('scanPreview', 'scanResults', 'scanStatus', 'policyScanInput');
    },

    // ─── GIS Screenshot/PDF Upload ───
    async handleGISUpload(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const status = document.getElementById('gisUploadStatus');
        const resultsDiv = document.getElementById('gisUploadResults');
        if (status) { status.classList.remove('hidden'); status.textContent = '⏳ Analyzing GIS document with AI...'; }
        if (resultsDiv) resultsDiv.innerHTML = '';

        try {
            // Convert files to inline data for Gemini
            const inlineData = [];
            for (const file of files) {
                inlineData.push(await this.fileToInlineData(file));
            }

            const key = await this._getGeminiKey();
            if (!key) {
                if (status) status.textContent = '⚠️ No Gemini API key available. Set GOOGLE_API_KEY on Vercel or enter key in Policy Q&A.';
                return;
            }

            const gisSchema = {
                type: 'object',
                properties: {
                    fields: {
                        type: 'object',
                        properties: {
                            yrBuilt: { type: 'string' }, sqFt: { type: 'string' },
                            lotSize: { type: 'string' }, dwellingType: { type: 'string' },
                            numStories: { type: 'string' }, bedrooms: { type: 'string' },
                            fullBaths: { type: 'string' }, halfBaths: { type: 'string' },
                            constructionStyle: { type: 'string' }, exteriorWalls: { type: 'string' },
                            foundation: { type: 'string' }, roofType: { type: 'string' },
                            roofShape: { type: 'string' }, heatingType: { type: 'string' },
                            cooling: { type: 'string' }, garageType: { type: 'string' },
                            garageSpaces: { type: 'string' }, numFireplaces: { type: 'string' },
                            sewer: { type: 'string' }, waterSource: { type: 'string' },
                            pool: { type: 'string' }, flooring: { type: 'string' },
                            kitchenQuality: { type: 'string' },
                            parcelNumber: { type: 'string' }, zoning: { type: 'string' },
                            ownerName: { type: 'string' },
                        }
                    },
                    confidence: {
                        type: 'object',
                        properties: {
                            yrBuilt: { type: 'number' }, sqFt: { type: 'number' },
                            lotSize: { type: 'number' }, dwellingType: { type: 'number' },
                            numStories: { type: 'number' }, bedrooms: { type: 'number' },
                            fullBaths: { type: 'number' }, halfBaths: { type: 'number' },
                            constructionStyle: { type: 'number' }, exteriorWalls: { type: 'number' },
                            foundation: { type: 'number' }, roofType: { type: 'number' },
                            roofShape: { type: 'number' }, heatingType: { type: 'number' },
                            cooling: { type: 'number' }, garageType: { type: 'number' },
                            garageSpaces: { type: 'number' }, numFireplaces: { type: 'number' },
                            sewer: { type: 'number' }, waterSource: { type: 'number' },
                            pool: { type: 'number' }, flooring: { type: 'number' },
                            kitchenQuality: { type: 'number' },
                            parcelNumber: { type: 'number' }, zoning: { type: 'number' },
                            ownerName: { type: 'number' },
                        }
                    },
                    quality_issues: { type: 'array', items: { type: 'string' } }
                },
                required: ['fields']
            };

            const prompt =
                'You are reading a county assessor record, GIS map screenshot, or property tax document for an insurance quote.\n\n' +
                'Extract EVERY available property detail. Be precise — insurance underwriters need exact values, not approximations.\n\n' +
                'FIELD EXTRACTION RULES:\n' +
                '- Year Built: extract the 4-digit year the structure was originally constructed (not renovated)\n' +
                '- Square Footage: heated/finished living area only (not total including garage or basement unless finished)\n' +
                '- Lot Size: convert to acres if shown in sq ft (divide by 43,560). Round to 2 decimal places.\n' +
                '- Dwelling Type: map to one of: One Family, Two Family, Three Family, Four Family, Condo, Townhome, Mobile Home\n' +
                '- Construction Style: map to one of: Ranch, Colonial, Cape Cod, Bi-Level, Split Level, Contemporary, Victorian, Bungalow, Townhouse, Condo\n' +
                '- Exterior Walls: map to one of: Siding Vinyl, Siding Wood, Brick, Brick Veneer, Stucco, Stone, Cement Fiber, Concrete\n' +
                '- Foundation: map to one of: Slab, Crawl Space - Enclosed, Crawl Space - Open, Basement - Finished, Basement - Unfinished, Basement - Walkout\n' +
                '- Roof Type: map to one of: Architectural Shingles, Asphalt Shingles, Metal (Pitched), Tile (Clay), Tile (Concrete), Wood Shake, Slate, Flat\n' +
                '- Roof Shape: map to one of: Gable, Hip, Flat, Gambrel, Mansard, Shed\n' +
                '- Heating: map to one of: Gas - Forced Air, Gas - Hot Water, Electric, Oil - Forced Air, Heat Pump, Other\n' +
                '- Cooling: map to one of: Central Air, Window Units, None\n' +
                '- Garage: map type to one of: Attached, Detached, Built-in, Carport, None. Extract number of spaces as integer.\n' +
                '- Pool: extract Yes or No (any mention of pool or swimming pool = Yes)\n' +
                '- Sewer: map to one of: Public, Septic\n' +
                '- Water: map to one of: Public, Well\n' +
                '- Flooring: map to one of: Hardwood, Carpet, Tile, Laminate, Mixed\n' +
                '- Kitchen/Bath Quality: map to one of: Builder\'s Grade, Semi-Custom, Custom\n' +
                '- Parcel/Tax ID: extract exactly as shown\n' +
                '- Zoning: extract the zoning code exactly as shown\n' +
                '- Owner Name: extract full name of property owner if shown\n\n' +
                'CONFIDENCE SCORING:\n' +
                '- Score 1.0 if the value is explicitly stated on the document\n' +
                '- Score 0.7 if you inferred it from related data (e.g. calculated lot size from sq ft)\n' +
                '- Score 0.4 if it is a reasonable assumption based on property type or age\n' +
                '- Score 0 or omit if not determinable\n\n' +
                'Extract exact values as shown on the document. Use empty string if not found.\n' +
                'Return structured JSON matching the schema exactly.';

            const parts = [{ text: prompt }].concat(
                inlineData.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } }))
            );

            const gisSystemPrompt = 'You are an expert at reading county assessor and GIS property records. ' +
                'Extract structured property data from screenshots and PDFs of county assessor websites, tax records, and GIS maps. ' +
                'Return only JSON matching the schema. If data is not visible, return empty strings. ' +
                'Provide confidence scores (0-1) for each field.';

            let gisText;

            // Use AIProvider if configured (multimodal support for all providers)
            if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
                const result = await AIProvider.ask(gisSystemPrompt, prompt, {
                    temperature: 0.1, responseFormat: 'json', schema: gisSchema, parts
                });
                gisText = result.text;
            } else {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts }],
                            systemInstruction: { role: 'system', parts: [{ text: gisSystemPrompt }]},
                            generationConfig: { temperature: 0.1, response_mime_type: 'application/json', response_schema: gisSchema }
                        })
                    }
                );

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData?.error?.message || `Gemini API error (${res.status})`);
                }

                const data = await res.json();
                gisText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!gisText) throw new Error('No response from Gemini');
            }

            const parsed = JSON.parse(gisText);
            this.renderGISExtractionReview(parsed);

            if (status) status.textContent = '✅ Property data extracted! Review below and approve.';
        } catch (err) {
            console.error('[GIS Upload] Error:', err);
            if (status) status.textContent = '⚠️ GIS extraction failed: ' + err.message;
        }

        // Reset file input
        const input = document.getElementById('gisUploadInput');
        if (input) input.value = '';
    },

    renderGISExtractionReview(result) {
        const resultsDiv = document.getElementById('gisUploadResults');
        if (!resultsDiv) return;
        resultsDiv.innerHTML = '';

        const fields = result?.fields || {};
        const confidence = result?.confidence || {};
        const issues = result?.quality_issues || [];

        if (issues.length) {
            const warn = document.createElement('div');
            warn.className = 'hint';
            warn.textContent = '⚠️ ' + issues.join(' | ');
            resultsDiv.appendChild(warn);
        }

        const renderField = (id, label, value) => {
            if (!value) return; // Only show fields that have data
            const wrapper = document.createElement('div');
            wrapper.className = 'scan-field';

            const labelEl = document.createElement('label');
            labelEl.className = 'label';
            labelEl.textContent = label;

            const input = document.createElement('input');
            input.type = 'text';
            input.value = value || '';
            input.dataset.field = id;

            const conf = typeof confidence[id] === 'number' ? confidence[id] : null;
            if (conf !== null) {
                const pill = document.createElement('span');
                pill.className = 'confidence-pill ' + (conf < 0.6 ? 'confidence-low' : 'confidence-high');
                pill.textContent = `${Math.round(conf * 100)}%`;
                wrapper.appendChild(pill);
            }

            wrapper.appendChild(labelEl);
            wrapper.appendChild(input);
            resultsDiv.appendChild(wrapper);
        };

        const header = document.createElement('h3');
        header.textContent = '🏠 Extracted Property Data';
        header.style.cssText = 'margin: 8px 0; font-size: 15px;';
        resultsDiv.appendChild(header);

        renderField('yrBuilt', 'Year Built', fields.yrBuilt);
        renderField('sqFt', 'Square Footage', fields.sqFt);
        renderField('lotSize', 'Lot Size (acres)', fields.lotSize);
        renderField('dwellingType', 'Dwelling Type', fields.dwellingType);
        renderField('numStories', 'Stories', fields.numStories);
        renderField('bedrooms', 'Bedrooms', fields.bedrooms);
        renderField('fullBaths', 'Full Baths', fields.fullBaths);
        renderField('halfBaths', 'Half Baths', fields.halfBaths);
        renderField('constructionStyle', 'Construction', fields.constructionStyle);
        renderField('exteriorWalls', 'Exterior Walls', fields.exteriorWalls);
        renderField('foundation', 'Foundation', fields.foundation);
        renderField('roofType', 'Roof Type', fields.roofType);
        renderField('roofShape', 'Roof Shape', fields.roofShape);
        renderField('heatingType', 'Heating', fields.heatingType);
        renderField('cooling', 'Cooling', fields.cooling);
        renderField('garageType', 'Garage Type', fields.garageType);
        renderField('garageSpaces', 'Garage Spaces', fields.garageSpaces);
        renderField('numFireplaces', 'Fireplaces', fields.numFireplaces);
        renderField('sewer', 'Sewer', fields.sewer);
        renderField('waterSource', 'Water Source', fields.waterSource);
        renderField('pool', 'Pool', fields.pool);
        renderField('flooring', 'Flooring', fields.flooring);
        renderField('kitchenQuality', 'Kitchen Quality', fields.kitchenQuality);
        renderField('parcelNumber', 'Parcel / Tax ID', fields.parcelNumber);
        renderField('zoning', 'Zoning', fields.zoning);
        renderField('ownerName', 'Owner Name', fields.ownerName);

        // Action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'margin-top: 12px; display: flex; gap: 8px;';

        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn btn-primary';
        approveBtn.textContent = '✅ Apply to Form';
        approveBtn.onclick = () => {
            const inputs = resultsDiv.querySelectorAll('input[data-field]');
            let count = 0;
            inputs.forEach(inp => {
                if (inp.value) {
                    // Skip info-only fields
                    if (inp.dataset.field === 'parcelNumber' || inp.dataset.field === 'zoning' || inp.dataset.field === 'ownerName') return;
                    this.setFieldValue(inp.dataset.field, inp.value, { autoFilled: true, source: 'gis' });
                    count++;
                }
            });
            resultsDiv.innerHTML = '';
            const gisStatus = document.getElementById('gisUploadStatus');
            if (gisStatus) gisStatus.textContent = `✅ ${count} property field(s) applied!`;
            this.toast(`✅ ${count} property fields applied from GIS`);
            this.checkUpdates(); // Trigger progressive disclosure (e.g., updates card for older homes)
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn';
        cancelBtn.textContent = '❌ Cancel';
        cancelBtn.onclick = () => {
            resultsDiv.innerHTML = '';
            const gisStatus = document.getElementById('gisUploadStatus');
            if (gisStatus) { gisStatus.textContent = ''; gisStatus.classList.add('hidden'); }
        };

        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(cancelBtn);
        resultsDiv.appendChild(actionsDiv);

        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.style.marginTop = '6px';
        hint.textContent = '💡 Edit any fields above before applying. Parcel #, zoning, and owner name are shown for reference only.';
        resultsDiv.appendChild(hint);
    },

    clearInitialDriverLicenseScan() {
        this.initialDlScan = null;
        this._clearSection('initialDlPreview', 'initialDlResults', 'initialDlStatus', 'initialDlScanInput');
    },

    clearDocIntel() {
        this.docIntelFiles = [];
        this.docIntelResults = null;
        localStorage.removeItem(this.docIntelKey);
        this._clearSection('docIntelPreview', 'docIntelResults', 'docIntelStatus', 'docIntelInput');
    },

    async handleScanFiles(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        this.scanFiles = files;
        await this.renderScanPreview(files);
        await this.processScan();
    },

    async handleInitialDriverLicenseFile(file) {
        if (!file) return;
        const status = document.getElementById('initialDlStatus');
        if (status) {
            status.classList.remove('hidden');
            status.textContent = '⏳ Scanning driver license...';
        }

        const preview = document.getElementById('initialDlPreview');
        if (preview) {
            preview.innerHTML = '';
            const img = document.createElement('img');
            img.className = 'scan-thumb';
            img.src = URL.createObjectURL(file);
            img.onload = () => URL.revokeObjectURL(img.src);
            preview.appendChild(img);
        }

        const result = await this.processDriverLicenseImage(file);
        if (!result?.success) {
            const errorMsg = result?.error || 'Unable to read driver license';
            if (status) status.textContent = `⚠️ ${errorMsg}`;
            console.error('[DL Scan] Failed:', result);
            return;
        }

        this.initialDlScan = result;
        this.renderInitialDriverLicenseResults(result);

        if (status) {
            status.textContent = `✅ Scan complete (${result.confidence || 'N/A'}% confidence) - Review below`;
        }
    },

    renderInitialDriverLicenseResults(result) {
        const container = document.getElementById('initialDlResults');
        if (!container) return;
        container.innerHTML = '';

        const fields = result?.data || {};
        const confidence = result?.confidence || 0;

        const renderField = (id, label, value) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'scan-field';

            const labelEl = document.createElement('label');
            labelEl.className = 'label';
            labelEl.textContent = label;

            const input = document.createElement('input');
            input.type = 'text';
            input.value = value || '';
            input.dataset.field = id;

            wrapper.appendChild(labelEl);
            wrapper.appendChild(input);
            container.appendChild(wrapper);
        };

        // Render editable fields
        renderField('firstName', 'First Name', fields.firstName);
        renderField('lastName', 'Last Name', fields.lastName);
        renderField('dob', 'Date of Birth', fields.dob);
        renderField('gender', 'Gender (M/F)', fields.gender);
        renderField('licenseNumber', 'License Number', fields.licenseNumber);
        renderField('licenseState', 'License State', fields.licenseState);
        renderField('addressLine1', 'Street Address', fields.addressLine1);
        renderField('city', 'City', fields.city);
        renderField('state', 'State', fields.state);
        renderField('zip', 'ZIP', fields.zip);

        // Add confidence indicator
        if (confidence) {
            const confDiv = document.createElement('div');
            confDiv.className = 'hint';
            confDiv.textContent = `Overall Confidence: ${confidence}%`;
            container.appendChild(confDiv);
        }

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'scan-actions';
        actionsDiv.style.marginTop = '16px';

        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn btn-primary';
        approveBtn.textContent = '✅ Approve & Auto-Fill';
        approveBtn.onclick = () => this.applyInitialDriverLicense();

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn';
        cancelBtn.textContent = '❌ Cancel Scan';
        cancelBtn.onclick = () => this.clearInitialDriverLicenseScan();

        const editHint = document.createElement('div');
        editHint.className = 'hint';
        editHint.style.marginTop = '8px';
        editHint.textContent = '💡 Edit any fields above before approving, or cancel to start over.';

        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(cancelBtn);
        container.appendChild(actionsDiv);
        container.appendChild(editHint);
    },

    applyInitialDriverLicense() {
        const container = document.getElementById('initialDlResults');
        if (!container) return;

        // Get values from editable inputs
        const inputs = container.querySelectorAll('input[data-field]');
        const fields = {};
        inputs.forEach(input => {
            fields[input.dataset.field] = input.value;
        });

        let appliedCount = 0;
        const setIfEmpty = (id, value) => {
            if (!value) return;
            const el = document.getElementById(id);
            if (!el || el.value) return;
            el.value = value;
            this.save({ target: { id, value } });
            this.markAutoFilled(el, 'scan');
            appliedCount++;
        };

        // Normalize gender from DL scan (Male/Female → M/F)
        const normGender = (v) => {
            if (!v) return '';
            const g = String(v).trim().toLowerCase();
            if (g === 'male' || g === 'm') return 'M';
            if (g === 'female' || g === 'f') return 'F';
            if (g === 'x' || g === 'not specified') return 'X';
            return v;
        };
        const normalizedGender = normGender(fields.gender);

        setIfEmpty('firstName', fields.firstName);
        setIfEmpty('lastName', fields.lastName);
        setIfEmpty('dob', fields.dob);
        setIfEmpty('gender', normalizedGender);
        setIfEmpty('addrStreet', fields.addressLine1);
        setIfEmpty('addrCity', fields.city);
        setIfEmpty('addrState', fields.state);
        setIfEmpty('addrZip', fields.zip);

        if (this.drivers.length === 0) {
            this.drivers.push({
                id: `driver_${Date.now()}`,
                firstName: fields.firstName || '',
                lastName: fields.lastName || '',
                dob: fields.dob || '',
                gender: normalizedGender,
                maritalStatus: '',
                relationship: 'Self',
                occupation: '',
                education: '',
                dlStatus: (fields.licenseNumber) ? 'Valid' : '',
                dlNum: (fields.licenseNumber || '').toUpperCase(),
                dlState: (fields.licenseState || fields.state || 'WA').toUpperCase(),
                ageLicensed: '',
                isPrimaryApplicant: true,
                isCoApplicant: false,
                accidents: '',
                violations: '',
                studentGPA: ''
            });
        } else {
            const primary = this.drivers[0];
            if (primary) {
                if (!primary.firstName) primary.firstName = fields.firstName || '';
                if (!primary.lastName) primary.lastName = fields.lastName || '';
                if (!primary.dob) primary.dob = fields.dob || '';
                if (!primary.gender) primary.gender = normalizedGender;
                if (!primary.dlNum) primary.dlNum = (fields.licenseNumber || '').toUpperCase();
                if (!primary.dlState) primary.dlState = (fields.licenseState || fields.state || 'WA').toUpperCase();
                if (!primary.dlStatus && fields.licenseNumber) primary.dlStatus = 'Valid';
            }
        }

        // Clear the review UI after applying
        container.innerHTML = '';
        const status = document.getElementById('initialDlStatus');
        if (status) {
            status.textContent = `✅ ${appliedCount} field(s) applied to form`;
        }

        this.saveDriversVehicles();
        this.updateScanCoverage();
        this.toast('✅ Driver license data applied to form');
    },

    async handleDocIntelFiles(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        this.docIntelFiles = files;
        await this.renderDocIntelPreview(files);
    },

    async renderScanPreview(files) {
        const preview = document.getElementById('scanPreview');
        if (!preview) return;
        preview.innerHTML = '';

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                const img = document.createElement('img');
                img.src = url;
                img.className = 'scan-thumb';
                img.onload = () => URL.revokeObjectURL(url);
                preview.appendChild(img);
            } else {
                const chip = document.createElement('div');
                chip.className = 'hint';
                chip.textContent = `PDF: ${file.name}`;
                preview.appendChild(chip);
            }
        }
    },

    async renderDocIntelPreview(files) {
        const preview = document.getElementById('docIntelPreview');
        if (!preview) return;
        preview.innerHTML = '';

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                const img = document.createElement('img');
                img.src = url;
                img.className = 'scan-thumb';
                img.onload = () => URL.revokeObjectURL(url);
                preview.appendChild(img);
            } else {
                const chip = document.createElement('div');
                chip.className = 'hint';
                chip.textContent = `PDF: ${file.name}`;
                preview.appendChild(chip);
            }
        }
    },

    async optimizeImage(file) {
        console.log(`[Image Optimize] Processing ${file.type || 'unknown'}: ${(file.size / 1024).toFixed(1)}KB`);
        
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const canvas = document.createElement('canvas');
        
        // Resize to avoid 413 payload errors (same as driver license scan)
        // Policy docs can be much larger than licenses, use 1200px max
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = bitmap.width;
        let height = bitmap.height;
        
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);

        // Apply contrast enhancement for better OCR
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const contrast = 1.1;
        const intercept = 128 * (1 - contrast);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] * contrast + intercept;
            data[i + 1] = data[i + 1] * contrast + intercept;
            data[i + 2] = data[i + 2] * contrast + intercept;
        }

        ctx.putImageData(imageData, 0, 0);
        
        // Use 0.85 quality (better than driver license since docs need clarity)
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        
        if (blob) {
            const originalMB = (file.size / 1024 / 1024).toFixed(2);
            const finalMB = (blob.size / 1024 / 1024).toFixed(2);
            console.log(`[Image Optimize] ${originalMB}MB → ${finalMB}MB`);
            
            // If still too large after initial optimize, reduce further
            if (blob.size > 10000000) {
                console.log('[Image Optimize] Still large, reducing to 800px...');
                canvas.width = width * 0.67;
                canvas.height = height * 0.67;
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                
                const smallerBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
                if (smallerBlob) {
                    console.log(`[Image Optimize] Final: ${(smallerBlob.size / 1024).toFixed(1)}KB`);
                    bitmap.close();
                    canvas.width = 0;
                    canvas.height = 0;
                    return smallerBlob;
                }
            }
            bitmap.close();
            canvas.width = 0;
            canvas.height = 0;
            return blob;
        }
        
        bitmap.close();
        canvas.width = 0;
        canvas.height = 0;
        return file;
    },

    async fileToInlineData(file) {
        const reader = new FileReader();
        const blob = file.type.startsWith('image/') ? await this.optimizeImage(file) : file;

        return new Promise((resolve, reject) => {
            reader.onload = () => {
                const result = reader.result;
                const base64 = result.split(',')[1];
                
                // Check size to avoid 413 errors (base64 is ~33% larger than file)
                const estimatedSizeKB = (base64.length * 0.75 / 1024).toFixed(1);
                const estimatedSizeMB = (base64.length * 0.75 / 1024 / 1024).toFixed(2);
                
                if (base64.length * 0.75 > 20000000) {
                    console.error(`[File Convert] Too large: ${estimatedSizeMB}MB exceeds 20MB limit`);
                    reject(new Error(`File too large (${estimatedSizeMB}MB). Maximum is 20MB per file.`));
                    return;
                }
                
                console.log(`[File Convert] ${file.name}: ${estimatedSizeKB}KB`);
                
                resolve({
                    mimeType: blob.type || file.type || 'application/octet-stream',
                    data: base64
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    _getAltechRestorePrompt(text) {
        return `Below is text extracted from a client summary PDF exported by Altech Insurance Tools.
This is a structured agency form export — NOT a carrier policy document.
The text may be jumbled due to PDF multi-column layout extraction. Field labels appear in ALL CAPS near their values.

Extract ALL fields listed below. Return null for any field not present. Do NOT guess or infer values.
Dates → YYYY-MM-DD | Currency → plain number, no $ or commas | Gender → M or F | State → 2-letter code

=== SECTION: APPLICANT ===
"FULL NAME" → firstName (first word) + lastName (rest) | "PREFIX" → prefix | "SUFFIX" → suffix
"DATE OF BIRTH" → dob | "GENDER" → gender | "MARITAL STATUS" → maritalStatus
"PHONE" → phone | "EMAIL" → email | "EDUCATION" → education
"INDUSTRY" → industry | "OCCUPATION" → occupation

=== SECTION: CO-APPLICANT / SPOUSE ===
"FULL NAME" (in co-app block) → coFirstName + coLastName
"DATE OF BIRTH" (co-app) → coApplicantDob | "GENDER" (co-app) → coApplicantGender
"EMAIL" (co-app) → coApplicantEmail | "PHONE" (co-app) → coApplicantPhone
"RELATIONSHIP" → coApplicantRelationship | "OCCUPATION" (co-app) → coOccupation
"EDUCATION" (co-app) → coEducation | "INDUSTRY" (co-app) → coIndustry

=== SECTION: PROPERTY ADDRESS ===
"STREET ADDRESS" → address | "CITY" → city | "STATE" → state | "ZIP CODE" → zip
"COUNTY" → county | "YEARS AT ADDRESS" → yearsAtAddress

=== SECTION: PROPERTY DETAILS ===
"YEAR BUILT" → yrBuilt | "SQUARE FOOTAGE" → sqFt (number only, strip "sq ft" or commas)
"LOT SIZE" → lotSize | "DWELLING TYPE" → dwellingType | "DWELLING USAGE" → dwellingUsage
"OCCUPANCY" → occupancyType | "STORIES" → numStories | "OCCUPANTS" → numOccupants
"BEDROOMS" → bedrooms | "FULL BATHS" → fullBaths | "HALF BATHS" → halfBaths
"CONSTRUCTION" → constructionStyle | "EXTERIOR WALLS" → exteriorWalls | "FOUNDATION" → foundation
"GARAGE TYPE" → garageType | "GARAGE SPACES" → garageSpaces
"KITCHEN/BATH QUALITY" → kitchenQuality | "FLOORING" → flooring
"FIREPLACES" → numFireplaces | "PURCHASE DATE" → purchaseDate

=== SECTION: BUILDING SYSTEMS ===
"ROOF TYPE" → roofType | "ROOF SHAPE" → roofShape | "ROOF YEAR" → roofYr | "ROOF UPDATE TYPE" → roofUpdate
"HEATING TYPE" → heatingType | "HEATING UPDATED" → heatYr | "COOLING" → cooling
"PLUMBING UPDATED" → plumbYr | "ELECTRICAL UPDATED" → elecYr
"SEWER" → sewer | "WATER SOURCE" → waterSource

=== SECTION: RISK & PROTECTION ===
"BURGLAR ALARM" → burglarAlarm | "FIRE ALARM" → fireAlarm | "SMOKE DETECTOR" → smokeDetector
"SPRINKLERS" → sprinklers | "SWIMMING POOL" → pool | "TRAMPOLINE" → trampoline
"WOOD STOVE" → woodStove | "SECONDARY HEATING" → secondaryHeating
"DOGS" → dogInfo | "BUSINESS ON PROPERTY" → businessOnProperty
"FIRE STATION (MI)" → fireStationDist | "FIRE HYDRANT (FT)" → fireHydrantFeet
"TIDAL WATER (FT)" → tidalWaterDist | "PROTECTION CLASS" → protectionClass

=== SECTION: HOME COVERAGE ===
"POLICY TYPE" → homePolicyType
"DWELLING COVERAGE" → dwellingCoverage (number) | "PERSONAL PROPERTY" → homePersonalProperty (number)
"LOSS OF USE" → homeLossOfUse (number) | "PERSONAL LIABILITY" → personalLiability (number)
"MEDICAL PAYMENTS" → medicalPayments (number) | "DEDUCTIBLE (AOP)" → homeDeductible (number)
"WIND/HAIL DEDUCTIBLE" → windDeductible (number) | "MORTGAGEE / LIENHOLDER" → mortgagee

=== SECTION: HOME ENDORSEMENTS ===
"INCREASED REPLACEMENT COST" → increasedReplacementCost | "ORDINANCE OR LAW" → ordinanceOrLaw
"WATER BACKUP" → waterBackup | "LOSS ASSESSMENT" → lossAssessment
"ANIMAL LIABILITY" → animalLiability | "THEFT DEDUCTIBLE" → theftDeductible
"JEWELRY/VALUABLES LIMIT" → jewelryLimit | "CREDIT CARD COVERAGE" → creditCardCoverage
"MOLD DAMAGE" → moldDamage | "EQUIPMENT BREAKDOWN" → equipmentBreakdown | "SERVICE LINE" → serviceLine

=== SECTION: AUTO COVERAGE ===
"BODILY INJURY" → bodInjury | "PROPERTY DAMAGE" → propDamage
"UNINSURED MOTORIST" → umLimits | "UNDERINSURED MOTORIST" → uimLimits
"COMPREHENSIVE" → compDed (deductible number) | "COLLISION" → collDed (deductible number)
"MED PAY (AUTO)" → autoMedPay | "RENTAL REIMBURSEMENT" → rental | "TOWING/ROADSIDE" → towing

=== SECTION: PRIOR INSURANCE ===
"PRIOR CARRIER" → priorCarrier | "PRIOR CARRIER (HOME)" → homePriorCarrier
"PRIOR CARRIER (AUTO)" → autoPriorCarrier | "PRIOR EXPIRATION" → priorExpiration
"YEARS WITH CARRIER" → priorYears | "CONTINUOUS COVERAGE" → continuousCoverage

**CRITICAL — return these two fields as JSON-encoded array strings:**
altechVehiclesJson: JSON array of ALL vehicles from the VEHICLES section:
[ { year, make, model, vin, use, miles, primaryDriver, ownershipType, antiTheft, antiLockBrakes, passiveRestraints, telematics, tnc, carPool, carNew } ]
altechDriversJson: JSON array of ALL drivers from the DRIVERS section:
[ { firstName, lastName, dob, gender, maritalStatus, relationship, education, occupation, industry, dlNum, dlState, dlStatus, ageLicensed, sr22, fr44, goodDriver, matureDriver, licenseSusRev, driverEducation, studentGPA, accidents, violations } ]

The PDF uses a 4-column grid — labels and values may appear interleaved in extracted text. The uppercase label always corresponds to the value that immediately follows or appears nearby it in the same section.
This is trusted, complete agency data — extract every field you can find.

--- DOCUMENT TEXT ---
` + text.substring(0, 30000);
    },

    // Process already-extracted text through AI for structured field extraction (desktop drag-drop)
    async processScanFromText(text, fileName) {
        const status = document.getElementById('scanStatus');

        try {
            const isAltechPDF = text && text.includes('Altech Insurance Tools');
            const userPrompt = isAltechPDF ? this._getAltechRestorePrompt(text) :
                'Below is text extracted from an insurance policy document. Extract ALL available structured information from it.\n\n' +
                '**POLICYHOLDER/INSURED:** Prefix (Mr/Mrs/Ms/Dr), first name, last name, suffix (Jr/Sr/III), date of birth, gender (M/F), marital status, phone, email, education, occupation, industry\n' +
                '**CO-APPLICANT/SPOUSE:** First name, last name, date of birth, gender, email, phone, relationship (if listed)\n' +
                '**ADDRESS:** For home/property policies, extract the **property/risk location address** (the physical location of the insured dwelling) — NOT the insured\'s mailing address if the two differ. For auto policies, use the insured\'s mailing/garaging address. Never use the agent or agency address. Fields: street address, city, state (2-letter code), ZIP, county, years at address\n' +
                '**PROPERTY:** Dwelling usage (primary/secondary/seasonal), occupancy type (owner/renter/vacant), year built, square footage, dwelling type (single family, condo, townhouse, mobile home, etc.), ' +
                'stories, occupants, bedrooms, full baths, half baths, construction style, exterior walls (vinyl, brick, stucco, wood, etc.), foundation, ' +
                'garage type (attached, detached, carport, none), garage spaces, kitchen/bath quality, flooring, fireplaces, lot size (acres), purchase date, ' +
                'roof type, roof shape (gable, hip, flat, etc.), roof updated year, heating type (gas forced air, electric, oil, etc.), heating updated year, cooling type, ' +
                'plumbing updated year, electrical updated year, sewer type, water source, ' +
                'pool (yes/no/fenced/unfenced), trampoline (yes/no), wood stove (yes/no), dog info (breed if mentioned), business on property (yes/no)\n' +
                '**SAFETY & PROTECTION:** Burglar alarm, fire alarm, sprinklers, smoke detector, fire station distance (miles), fire hydrant distance (feet), protection class\n' +
                '**HOME COVERAGE:** Policy type (HO-3, HO-5, HO-4, HO-6, DP-1, DP-3), dwelling coverage amount, personal liability, medical payments, deductible, wind/hail deductible, mortgagee/lender name\n' +
                '**VEHICLES:** VIN number(s) and vehicle description (year/make/model). If multiple vehicles, put each extra one in additionalVehicles separated by semicolons, format: "YYYY Make Model VIN: XXXXX; YYYY Make Model VIN: XXXXX"\n' +
                '**AUTO COVERAGE:** Auto policy type, liability limits (e.g., 100/300/100), property damage limit, UM limits, UIM limits, comprehensive deductible, collision deductible, med pay (auto), rental reimbursement, towing/roadside, student GPA discount\n' +
                '**DRIVERS:** Additional drivers beyond primary insured in additionalDrivers separated by semicolons, format: "FirstName LastName DOB: YYYY-MM-DD; FirstName LastName DOB: YYYY-MM-DD"\n' +
                '**POLICY INFO:** Policy number, effective date, policy term (6 month/12 month/annual), prior carrier name, prior expiration date, prior policy term, prior liability limits, years with prior carrier, continuous coverage, accidents, violations. ' +
                'If separate home/auto carriers, use homePriorCarrier/homePriorExp/homePriorPolicyTerm/homePriorYears for home.\n' +
                '**ADDITIONAL:** Additional insureds, best contact time, referral source\n\n' +
                'IMPORTANT NOTES:\n' +
                '- Different carriers use different labels: "Named Insured", "Policyholder", "Insured", "Primary Insured" all mean the same thing\n' +
                '- Ignore agent/agency information — we only want the INSURED\'s info\n' +
                '- Coverage labels vary: "BI/PD", "Bodily Injury/Property Damage", "Liability Limits" all refer to liability coverage\n' +
                '- Look for the declarations page (dec page) which has the most complete information\n' +
                '- Normalize dates to YYYY-MM-DD format when possible\n' +
                '- Normalize currency to plain numbers (no $ or commas)\n' +
                '- If data is unclear or missing, note it in quality_issues\n\n' +
                '--- DOCUMENT TEXT ---\n' + text.substring(0, 30000);

            const scanSystemPrompt = this._getScanSystemPrompt();
            let raw;

            // Try AIProvider first (supports all providers for text-based extraction)
            if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
                try {
                    const schema = AIProvider.getProvider() === 'google' ? this._getScanSchema() : null;
                    const result = await AIProvider.ask(scanSystemPrompt, userPrompt, {
                        temperature: 0.1,
                        maxTokens: 8192,
                        responseFormat: 'json',
                        schema: schema
                    });
                    raw = result.text;
                    console.log('[ProcessScanFromText] AIProvider extraction successful (' + AIProvider.getProvider() + ')');
                } catch (e) {
                    console.warn('[ProcessScanFromText] AIProvider failed, trying legacy Gemini:', e);
                }
            }

            // Fallback: direct Gemini API
            if (!raw) {
                const apiKey = await this._getGeminiKey();
                if (!apiKey) {
                    if (status) status.textContent = '⚠️ No API key configured. Open account settings to add an AI key.';
                    return;
                }
                const schema = this._getScanSchema();
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                            systemInstruction: { role: 'system', parts: [{ text: scanSystemPrompt }]},
                            generationConfig: { temperature: 0.1, response_mime_type: 'application/json', response_schema: schema }
                        })
                    }
                );
                if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
                const data = await res.json();
                raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            }

            if (!raw) throw new Error('No extraction result returned');

            const result = (typeof AIProvider !== 'undefined' && AIProvider.extractJSON)
                ? AIProvider.extractJSON(raw)
                : JSON.parse(raw);
            if (!result) throw new Error('Failed to parse extraction result as JSON');
            this.extractedData = result;
            this.renderExtractionReview(result);
            if (status) status.textContent = `✅ ${fileName} — extraction complete. Review below.`;
            console.log('[ProcessScanFromText] Extraction successful');
        } catch (err) {
            console.error('[ProcessScanFromText] Error:', err);
            if (status) status.textContent = '⚠️ AI extraction failed: ' + err.message;
        }
    },

    // Extract all text from a PDF file client-side using PDF.js
    async _extractPdfText(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            pages.push(content.items.map(item => item.str).join(' '));
        }
        return pages.join('\n\n');
    },

    async processScan() {
        if (!this.scanFiles.length) return;

        const status = document.getElementById('scanStatus');
        if (status) {
            status.classList.remove('hidden');
            status.textContent = '⏳ Extracting policy data...';
        }

        try {
            // For PDF files, extract text client-side and use the text path.
            // This avoids Gemini 400 errors (PDF binary not supported) and
            // Vercel 413 errors (4.5MB platform body limit).
            const pdfFiles = this.scanFiles.filter(f => f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf'));
            if (pdfFiles.length && window.pdfjsLib) {
                if (status) status.textContent = '⏳ Reading PDF text...';
                const textParts = [];
                for (const f of pdfFiles) {
                    try {
                        textParts.push(await this._extractPdfText(f));
                    } catch (e) {
                        console.warn('[PolicyScan] PDF.js text extraction failed for', f.name, e);
                    }
                }
                const combinedText = textParts.join('\n\n---\n\n').trim();
                if (combinedText) {
                    const name = pdfFiles.map(f => f.name).join(', ');
                    return await this.processScanFromText(combinedText, name);
                }
                // If text extraction yielded nothing (scanned/image PDF), fall through to binary path
                if (status) status.textContent = '⏳ No text found in PDF — trying image path...';
            }

            const inlineData = [];
            for (const file of this.scanFiles) {
                inlineData.push(await this.fileToInlineData(file));
            }

            let result = null;

            // ── Build the shared prompt & parts ──
            const scanSystemPrompt = this._getScanSystemPrompt();
            const userPrompt =
                'Analyze these insurance policy document(s) and extract ALL available information:\n\n' +
                '**POLICYHOLDER/INSURED:** Prefix (Mr/Mrs/Ms/Dr), first name, last name, suffix (Jr/Sr/III), date of birth, gender (M/F), marital status, phone, email, education, occupation, industry\n' +
                '**CO-APPLICANT/SPOUSE:** First name, last name, date of birth, gender, email, phone, relationship (if listed)\n' +
                '**ADDRESS:** For home/property policies, extract the **property/risk location address** (the physical location of the insured dwelling) — NOT the insured\'s mailing address if the two differ. For auto policies, use the insured\'s mailing/garaging address. Never use the agent or agency address. Fields: street address, city, state (2-letter code), ZIP, county, years at address\n' +
                '**PROPERTY:** Dwelling usage (primary/secondary/seasonal), occupancy type (owner/renter/vacant), year built, square footage, dwelling type (single family, condo, townhouse, mobile home, etc.), ' +
                'stories, occupants, bedrooms, full baths, half baths, construction style, exterior walls (vinyl, brick, stucco, wood, etc.), foundation, ' +
                'garage type (attached, detached, carport, none), garage spaces, kitchen/bath quality, flooring, fireplaces, lot size (acres), purchase date, ' +
                'roof type, roof shape (gable, hip, flat, etc.), roof updated year, heating type (gas forced air, electric, oil, etc.), heating updated year, cooling type, ' +
                'plumbing updated year, electrical updated year, sewer type, water source, ' +
                'pool (yes/no/fenced/unfenced), trampoline (yes/no), wood stove (yes/no), dog info (breed if mentioned), business on property (yes/no)\n' +
                '**SAFETY & PROTECTION:** Burglar alarm, fire alarm, sprinklers, smoke detector, fire station distance (miles), fire hydrant distance (feet), protection class\n' +
                '**HOME COVERAGE:** Policy type (HO-3, HO-5, HO-4, HO-6, DP-1, DP-3), dwelling coverage amount, personal liability, medical payments, deductible, wind/hail deductible, mortgagee/lender name\n' +
                '**VEHICLES:** VIN number(s) and vehicle description (year/make/model). If multiple vehicles, put each extra one in additionalVehicles separated by semicolons, format: "YYYY Make Model VIN: XXXXX; YYYY Make Model VIN: XXXXX"\n' +
                '**AUTO COVERAGE:** Auto policy type, liability limits (e.g., 100/300/100), property damage limit, UM limits, UIM limits, comprehensive deductible, collision deductible, med pay (auto), rental reimbursement, towing/roadside, student GPA discount\n' +
                '**DRIVERS:** Additional drivers beyond primary insured in additionalDrivers separated by semicolons, format: "FirstName LastName DOB: YYYY-MM-DD; FirstName LastName DOB: YYYY-MM-DD"\n' +
                '**POLICY INFO:** Policy number, effective date, policy term (6 month/12 month/annual), prior carrier name, prior expiration date, prior policy term, prior liability limits, years with prior carrier, continuous coverage, accidents, violations. ' +
                'If separate home/auto carriers, use homePriorCarrier/homePriorExp/homePriorPolicyTerm/homePriorYears for home.\n' +
                '**ADDITIONAL:** Additional insureds, best contact time, referral source\n\n' +
                'IMPORTANT NOTES:\n' +
                '- Different carriers use different labels: "Named Insured", "Policyholder", "Insured", "Primary Insured" all mean the same thing\n' +
                '- Ignore agent/agency information — we only want the INSURED\'s info\n' +
                '- Coverage labels vary: "BI/PD", "Bodily Injury/Property Damage", "Liability Limits" all refer to liability coverage\n' +
                '- Look for the declarations page (dec page) which has the most complete information\n' +
                '- Multi-page policies: extract from ALL pages provided\n' +
                '- Normalize dates to YYYY-MM-DD format when possible\n' +
                '- Normalize currency to plain numbers (no $ or commas)\n' +
                '- If image quality is poor or data is unclear, note it in quality_issues\n\n' +
                'Return structured JSON with the extracted fields.';

            const parts = [{ text: userPrompt }].concat(
                inlineData.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } }))
            );

            // Try 1: AIProvider (supports vision/multimodal for all configured providers)
            if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
                try {
                    console.log('[PolicyScan] Trying AIProvider...');
                    const schema = this._getScanSchema();
                    const aiResult = await AIProvider.ask(scanSystemPrompt, userPrompt, {
                        temperature: 0.1, responseFormat: 'json', schema, parts
                    });
                    if (aiResult.text) {
                        result = AIProvider.extractJSON(aiResult.text);
                        console.log('[PolicyScan] AIProvider extraction successful');
                    }
                } catch (e) {
                    console.warn('[PolicyScan] AIProvider failed:', e);
                }
            }

            // Try 1b: Direct Gemini API fallback (when AIProvider not configured or non-Google)
            if (!result) {
                const apiKey = await this._getGeminiKey();
                if (apiKey) {
                    try {
                        console.log('[PolicyScan] Trying direct Gemini API...');
                        const schema = this._getScanSchema();

                        const geminiRes = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ role: 'user', parts }],
                                    systemInstruction: { role: 'system', parts: [{ text: scanSystemPrompt }]},
                                    generationConfig: {
                                        temperature: 0.1,
                                        response_mime_type: 'application/json',
                                        response_schema: schema
                                    }
                                })
                            }
                        );

                        if (geminiRes.ok) {
                            const geminiData = await geminiRes.json();
                            const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (raw) {
                                result = (typeof AIProvider !== 'undefined' && AIProvider.extractJSON) ? AIProvider.extractJSON(raw) : JSON.parse(raw);
                                console.log('[PolicyScan] Direct Gemini extraction successful');
                            }
                        } else {
                            console.warn('[PolicyScan] Gemini API returned', geminiRes.status);
                        }
                    } catch (e) {
                        console.warn('[PolicyScan] Direct Gemini failed:', e);
                    }
                }
            }

            // Try 2: Vercel server endpoint (fallback when deployed)
            if (!result) {
                console.log('[PolicyScan] Falling back to /api/policy-scan...');
                const response = await fetch('/api/policy-scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: inlineData, aiSettings: window.AIProvider?.getSettings() })
                });
                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err?.error || 'Unable to extract policy data');
                }
                result = await response.json();
            }

            this.extractedData = result;
            this.renderExtractionReview(result);

            if (status) {
                status.textContent = '✅ Extraction complete. Review below.';
            }
        } catch (err) {
            if (status) status.textContent = '⚠️ ' + err.message;
        }
    },

    async analyzeDocuments() {
        const files = this.docIntelFiles.length ? this.docIntelFiles : this.scanFiles;
        if (!files.length) {
            this.toast('⚠️ Upload documents first.');
            return;
        }

        const status = document.getElementById('docIntelStatus');
        if (status) {
            status.classList.remove('hidden');
            status.textContent = '⏳ Analyzing documents...';
        }

        try {
            const inlineData = [];
            for (const file of files) {
                inlineData.push(await this.fileToInlineData(file));
            }

            const response = await fetch('/api/vision-processor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'documentIntel', files: inlineData, aiSettings: window.AIProvider?.getSettings() })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.error || 'Unable to analyze documents');
            }

            const result = await response.json();
            this.docIntelResults = result;
            await this.saveDocIntelResults(result);
            this.renderDocIntelResults(result);

            if (status) {
                status.textContent = '✅ Document analysis complete.';
            }
        } catch (err) {
            if (status) status.textContent = '⚠️ ' + err.message;
        }
    },

    renderDocIntelResults(result) {
        const container = document.getElementById('docIntelResults');
        if (!container) return;
        container.innerHTML = '';

        if (!result) return;

        const warnings = this.getDocIntelWarnings(result);
        if (warnings.length) {
            const warn = document.createElement('div');
            warn.className = 'hint';
            warn.textContent = '⚠️ ' + warnings.join(' | ');
            container.appendChild(warn);
        }

        const summary = document.createElement('div');
        summary.className = 'hint';
        summary.textContent = result.summary || 'Document analysis complete.';
        container.appendChild(summary);

        const fields = result.fields || {};
        const fieldsCard = document.createElement('div');
        fieldsCard.className = 'scan-field';

        const fieldsTitle = document.createElement('label');
        fieldsTitle.className = 'label';
        fieldsTitle.textContent = 'Review Extracted Fields';
        fieldsCard.appendChild(fieldsTitle);

        const fieldList = document.createElement('div');
        fieldList.className = 'grid-2';

        const renderInput = (labelText, key, placeholder = '') => {
            const wrap = document.createElement('div');
            const label = document.createElement('label');
            label.className = 'label';
            label.textContent = labelText;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = fields[key] || '';
            input.placeholder = placeholder;
            input.oninput = (e) => this.updateDocIntelField(key, e.target.value);
            wrap.appendChild(label);
            wrap.appendChild(input);
            fieldList.appendChild(wrap);
        };

        renderInput('Owner Name', 'ownerName', 'John Doe');
        renderInput('Policy Number', 'policyNumber', 'ABC123');
        renderInput('Effective Date', 'effectiveDate', 'YYYY-MM-DD');
        renderInput('Expiration Date', 'expirationDate', 'YYYY-MM-DD');
        renderInput('Year Built', 'yearBuilt', '1999');
        renderInput('Assessed Value', 'assessedValue', '450000');
        renderInput('Mortgagee', 'mortgagee', 'Lender Name');
        renderInput('Address Line 1', 'addressLine1', '123 Main St');
        renderInput('City', 'city', 'Seattle');
        renderInput('State', 'state', 'WA');
        renderInput('Zip', 'zip', '98101');

        fieldsCard.appendChild(fieldList);
        container.appendChild(fieldsCard);

        const docs = result.documents || [];
        docs.forEach(doc => {
            const card = document.createElement('div');
            card.className = 'scan-field';

            const title = document.createElement('label');
            title.className = 'label';
            title.textContent = doc.title || doc.type || 'Document';

            const detail = document.createElement('div');
            detail.className = 'hint';
            detail.textContent = doc.details || doc.notes || 'No details extracted.';

            card.appendChild(title);
            card.appendChild(detail);
            container.appendChild(card);
        });
    },

    async updateDocIntelField(key, value) {
        if (!this.docIntelResults) return;
        if (!this.docIntelResults.fields) this.docIntelResults.fields = {};
        this.docIntelResults.fields[key] = value;
        await this.saveDocIntelResults(this.docIntelResults);
    },

    getDocIntelWarnings(result) {
        const warnings = [];
        const fields = result?.fields || {};
        if (fields.yearBuilt && this.data.yrBuilt) {
            const diff = Math.abs(parseInt(fields.yearBuilt, 10) - parseInt(this.data.yrBuilt, 10));
            if (!Number.isNaN(diff) && diff >= 2) {
                warnings.push(`Year built mismatch (${fields.yearBuilt} vs ${this.data.yrBuilt})`);
            }
        }
        if (!fields.ownerName && (fields.deedBook || fields.apn)) {
            warnings.push('Owner name missing from document extraction');
        }
        if (fields.assessedValue && !this.data.propertyValue) {
            warnings.push('Assessed value found — consider setting property value');
        }
        return warnings;
    },

    applyDocIntelToForm() {
        if (!this.docIntelResults) {
            this.toast('⚠️ Run document analysis first.');
            return;
        }
        const fields = this.docIntelResults.fields || {};

        const setIfEmpty = (id, value) => {
            if (!value) return;
            const el = document.getElementById(id);
            if (!el) return;
            if (!el.value) {
                el.value = value;
                this.data[id] = value;
                this.markAutoFilled(el, 'scan');
            }
        };

        setIfEmpty('yrBuilt', fields.yearBuilt);
        setIfEmpty('addrStreet', fields.addressLine1);
        setIfEmpty('addrCity', fields.city);
        setIfEmpty('addrState', fields.state);
        setIfEmpty('addrZip', fields.zip);
        setIfEmpty('mortgagee', fields.mortgagee);
        setIfEmpty('purchaseDate', fields.purchaseDate);

        if (fields.assessedValue && !this.data.propertyValue) {
            this.data.propertyValue = fields.assessedValue;
        }

        this.data.docIntel = {
            source: fields.source || 'Document Intelligence',
            yearBuilt: fields.yearBuilt || '',
            assessedValue: fields.assessedValue || '',
            ownerName: fields.ownerName || '',
            policyNumber: fields.policyNumber || '',
            effectiveDate: fields.effectiveDate || '',
            expirationDate: fields.expirationDate || '',
            mortgagee: fields.mortgagee || ''
        };

        this.save({ target: { id: 'docIntel', value: JSON.stringify(this.data.docIntel) } });
        this.updateScanCoverage();
        this.toast('✅ Document data applied');
    },

    async saveDocIntelResults(result) {
        if (!result) return;
        if (this.encryptionEnabled) {
            const encrypted = await CryptoHelper.encrypt(result);
            localStorage.setItem(this.docIntelKey, encrypted);
        } else {
            localStorage.setItem(this.docIntelKey, JSON.stringify(result));
        }
    },

    async loadDocIntelResults() {
        const stored = localStorage.getItem(this.docIntelKey);
        if (!stored) return;

        if (this.encryptionEnabled) {
            const decrypted = await CryptoHelper.decrypt(stored);
            if (decrypted) this.docIntelResults = decrypted;
        } else {
            try {
                this.docIntelResults = JSON.parse(stored);
            } catch (e) {
                console.warn('[loadDocIntelResults] Corrupt JSON:', e);
            }
        }

        if (this.docIntelResults) {
            this.renderDocIntelResults(this.docIntelResults);
            this.updateScanCoverage();
        }
    },

    updateScanCoverage() {
        const el = document.getElementById('scanCoverage');
        if (!el) return;

        const fields = [
            'firstName','lastName','dob','addrStreet','addrCity','addrState','addrZip',
            'email','phone','yrBuilt','sqFt','roofType','mortgagee'
        ];

        const filled = fields.filter(k => (this.data?.[k] || '').toString().trim().length > 0).length;
        const total = fields.length;
        const percent = Math.round((filled / total) * 100);

        el.textContent = `Scan coverage: ${filled}/${total} fields applied (${percent}%)`;
    },

    renderExtractionReview(result) {
        const results = document.getElementById('scanResults');
        if (!results) return;
        results.innerHTML = '';

        const fields = result?.fields || {};
        const confidence = result?.confidence || {};
        const issues = result?.quality_issues || [];

        if (issues.length) {
            const warn = document.createElement('div');
            warn.className = 'hint';
            warn.textContent = '⚠️ ' + issues.join(' | ');
            results.appendChild(warn);
        }

        // ── Merge mode toggle ──
        const mergeDiv = document.createElement('div');
        mergeDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; margin: 8px 0 12px; padding: 10px 12px; background: var(--bg-input); border-radius: 10px; border: 1px solid var(--border);';
        const mergeCheck = document.createElement('input');
        mergeCheck.type = 'checkbox';
        mergeCheck.id = 'scanMergeMode';
        mergeCheck.checked = true;
        mergeCheck.style.cssText = 'width: 18px; height: 18px; accent-color: var(--apple-blue);';
        const mergeLabel = document.createElement('label');
        mergeLabel.htmlFor = 'scanMergeMode';
        mergeLabel.style.cssText = 'font-size: 13px; color: var(--text); cursor: pointer; user-select: none;';
        mergeLabel.textContent = '🛡️ Protect existing data (only fill empty fields)';
        mergeDiv.appendChild(mergeCheck);
        mergeDiv.appendChild(mergeLabel);
        results.appendChild(mergeDiv);

        const renderField = (id, label, value) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'scan-field';

            const labelEl = document.createElement('label');
            labelEl.className = 'label';
            labelEl.textContent = label;

            const input = document.createElement('input');
            input.type = 'text';
            input.value = value || '';
            input.dataset.field = id;

            // Show current form value if it differs from extraction
            const currentValue = (this.data && this.data[id]) ? this.data[id].toString().trim() : '';
            const extractedValue = (value || '').toString().trim();

            if (currentValue && extractedValue && currentValue !== extractedValue) {
                const conflictBadge = document.createElement('span');
                conflictBadge.className = 'confidence-pill confidence-low';
                conflictBadge.textContent = `⚠️ Current: "${currentValue}"`;
                conflictBadge.title = `Form currently has "${currentValue}" — extraction found "${extractedValue}"`;
                wrapper.appendChild(conflictBadge);
            } else if (currentValue && !extractedValue) {
                const keepBadge = document.createElement('span');
                keepBadge.className = 'confidence-pill confidence-high';
                keepBadge.textContent = `✓ Keeping: "${currentValue}"`;
                keepBadge.title = `Extraction found nothing — keeping existing value`;
                wrapper.appendChild(keepBadge);
            }

            const conf = typeof confidence[id] === 'number' ? confidence[id] : null;
            if (conf !== null) {
                const pill = document.createElement('span');
                pill.className = 'confidence-pill ' + (conf < 0.6 ? 'confidence-low' : 'confidence-high');
                pill.textContent = `${Math.round(conf * 100)}% confidence`;
                wrapper.appendChild(pill);
            }

            wrapper.appendChild(labelEl);
            wrapper.appendChild(input);
            results.appendChild(wrapper);
        };

        renderField('prefix', 'Prefix', fields.prefix);
        renderField('firstName', 'First Name', fields.firstName);
        renderField('lastName', 'Last Name', fields.lastName);
        renderField('suffix', 'Suffix', fields.suffix);
        renderField('dob', 'Date of Birth', fields.dob);
        renderField('gender', 'Gender', fields.gender);
        renderField('maritalStatus', 'Marital Status', fields.maritalStatus);
        renderField('phone', 'Phone', fields.phone);
        renderField('email', 'Email', fields.email);
        renderField('education', 'Education', fields.education);
        renderField('occupation', 'Occupation', fields.occupation);
        renderField('industry', 'Industry', fields.industry);

        // Co-Applicant (only render if data found)
        if (fields.coFirstName || fields.coLastName) {
            const coHeader = document.createElement('h3');
            coHeader.textContent = '👥 Co-Applicant / Spouse';
            coHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
            results.appendChild(coHeader);
            renderField('coFirstName', 'Co-Applicant First Name', fields.coFirstName);
            renderField('coLastName', 'Co-Applicant Last Name', fields.coLastName);
            renderField('coDob', 'Co-Applicant DOB', fields.coDob);
            renderField('coGender', 'Co-Applicant Gender', fields.coGender);
            renderField('coEmail', 'Co-Applicant Email', fields.coEmail);
            renderField('coPhone', 'Co-Applicant Phone', fields.coPhone);
            renderField('coRelationship', 'Relationship', fields.coRelationship);
        }

        // Address
        const addrHeader = document.createElement('h3');
        addrHeader.textContent = '📍 Address';
        addrHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
        results.appendChild(addrHeader);
        renderField('addrStreet', 'Street Address', fields.addrStreet);
        renderField('addrCity', 'City', fields.addrCity);
        renderField('addrState', 'State', fields.addrState);
        renderField('addrZip', 'ZIP', fields.addrZip);
        renderField('county', 'County', fields.county);
        renderField('yearsAtAddress', 'Years at Address', fields.yearsAtAddress);

        // Property (only if data found)
        if (fields.yrBuilt || fields.sqFt || fields.dwellingType || fields.dwellingUsage || fields.occupancyType || fields.roofType || fields.exteriorWalls || fields.heatingType || fields.garageType || fields.lotSize || fields.pool || fields.trampoline || fields.dogInfo || fields.bedrooms || fields.fullBaths) {
            const propHeader = document.createElement('h3');
            propHeader.textContent = '🏠 Property';
            propHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
            results.appendChild(propHeader);
            renderField('dwellingUsage', 'Dwelling Use', fields.dwellingUsage);
            renderField('occupancyType', 'Occupancy Type', fields.occupancyType);
            renderField('yrBuilt', 'Year Built', fields.yrBuilt);
            renderField('sqFt', 'Square Footage', fields.sqFt);
            renderField('dwellingType', 'Dwelling Type', fields.dwellingType);
            renderField('numStories', 'Stories', fields.numStories);
            renderField('numOccupants', 'Occupants', fields.numOccupants);
            renderField('bedrooms', 'Bedrooms', fields.bedrooms);
            renderField('fullBaths', 'Full Baths', fields.fullBaths);
            renderField('halfBaths', 'Half Baths', fields.halfBaths);
            renderField('constructionStyle', 'Construction', fields.constructionStyle);
            renderField('exteriorWalls', 'Exterior Walls', fields.exteriorWalls);
            renderField('foundation', 'Foundation', fields.foundation);
            renderField('garageType', 'Garage Type', fields.garageType);
            renderField('garageSpaces', 'Garage Spaces', fields.garageSpaces);
            renderField('kitchenQuality', 'Kitchen/Bath Quality', fields.kitchenQuality);
            renderField('flooring', 'Flooring', fields.flooring);
            renderField('numFireplaces', 'Fireplaces', fields.numFireplaces);
            renderField('lotSize', 'Lot Size (acres)', fields.lotSize);
            renderField('purchaseDate', 'Purchase Date', fields.purchaseDate);
            renderField('roofType', 'Roof Type', fields.roofType);
            renderField('roofShape', 'Roof Shape', fields.roofShape);
            renderField('roofYr', 'Roof Updated', fields.roofYr);
            renderField('heatingType', 'Heating Type', fields.heatingType);
            renderField('heatYr', 'Heating Updated', fields.heatYr);
            renderField('cooling', 'Cooling', fields.cooling);
            renderField('plumbYr', 'Plumbing Updated', fields.plumbYr);
            renderField('elecYr', 'Electrical Updated', fields.elecYr);
            renderField('sewer', 'Sewer', fields.sewer);
            renderField('waterSource', 'Water Source', fields.waterSource);
            renderField('pool', 'Pool', fields.pool);
            renderField('trampoline', 'Trampoline', fields.trampoline);
            renderField('woodStove', 'Wood Stove', fields.woodStove);
            renderField('dogInfo', 'Dog Info', fields.dogInfo);
            renderField('businessOnProperty', 'Business on Property', fields.businessOnProperty);
        }

        // Safety & Protection (only if data found)
        if (fields.burglarAlarm || fields.fireAlarm || fields.sprinklers || fields.smokeDetector || fields.fireStationDist || fields.fireHydrantFeet || fields.protectionClass) {
            const safetyHeader = document.createElement('h3');
            safetyHeader.textContent = '🛡️ Safety & Protection';
            safetyHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
            results.appendChild(safetyHeader);
            renderField('burglarAlarm', 'Burglar Alarm', fields.burglarAlarm);
            renderField('fireAlarm', 'Fire Alarm', fields.fireAlarm);
            renderField('sprinklers', 'Sprinklers', fields.sprinklers);
            renderField('smokeDetector', 'Smoke Detector', fields.smokeDetector);
            renderField('fireStationDist', 'Fire Station (mi)', fields.fireStationDist);
            renderField('fireHydrantFeet', 'Fire Hydrant (ft)', fields.fireHydrantFeet);
            renderField('protectionClass', 'Protection Class', fields.protectionClass);
        }

        // Home Coverage (only if data found)
        if (fields.homePolicyType || fields.dwellingCoverage || fields.personalLiability || fields.medicalPayments || fields.homeDeductible) {
            const homeHeader = document.createElement('h3');
            homeHeader.textContent = '🏡 Home Coverage';
            homeHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
            results.appendChild(homeHeader);
            renderField('homePolicyType', 'Policy Type', fields.homePolicyType);
            renderField('dwellingCoverage', 'Dwelling Coverage', fields.dwellingCoverage);
            renderField('personalLiability', 'Personal Liability', fields.personalLiability);
            renderField('medicalPayments', 'Medical Payments', fields.medicalPayments);
            renderField('homeDeductible', 'Home Deductible', fields.homeDeductible);
            renderField('windDeductible', 'Wind/Hail Deductible', fields.windDeductible);
            renderField('mortgagee', 'Mortgagee / Lender', fields.mortgagee);
        }

        // Vehicles
        const vehHeader = document.createElement('h3');
        vehHeader.textContent = '🚗 Vehicles';
        vehHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
        results.appendChild(vehHeader);
        renderField('vin', 'VIN', fields.vin);
        renderField('vehDesc', 'Vehicle Description', fields.vehDesc);
        if (fields.additionalVehicles) renderField('additionalVehicles', 'Additional Vehicles', fields.additionalVehicles);

        // Auto Coverage (only if data found)
        if (fields.liabilityLimits || fields.pdLimit || fields.autoDeductible || fields.compDeductible) {
            const autoHeader = document.createElement('h3');
            autoHeader.textContent = '🚙 Auto Coverage';
            autoHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
            results.appendChild(autoHeader);
            renderField('autoPolicyType', 'Auto Policy Type', fields.autoPolicyType);
            renderField('liabilityLimits', 'Liability Limits', fields.liabilityLimits);
            renderField('pdLimit', 'Property Damage Limit', fields.pdLimit);
            renderField('umLimits', 'UM Limits', fields.umLimits);
            renderField('uimLimits', 'UIM Limits', fields.uimLimits);
            renderField('compDeductible', 'Comprehensive Ded.', fields.compDeductible);
            renderField('autoDeductible', 'Collision Ded.', fields.autoDeductible);
            renderField('medPayments', 'Med Pay (Auto)', fields.medPayments);
            renderField('rentalDeductible', 'Rental Reimburse.', fields.rentalDeductible);
            renderField('towingDeductible', 'Towing/Roadside', fields.towingDeductible);
            renderField('studentGPA', 'Student GPA', fields.studentGPA);
        }

        // Drivers (additional)
        if (fields.additionalDrivers) renderField('additionalDrivers', 'Additional Drivers', fields.additionalDrivers);

        // Altech-specific hidden inputs for rich JSON restore (not shown to user)
        ['altechDriversJson', 'altechVehiclesJson'].forEach(key => {
            if (fields[key]) {
                const inp = document.createElement('input');
                inp.type = 'hidden';
                inp.dataset.field = key;
                inp.value = fields[key];
                results.appendChild(inp);
            }
        });

        // Policy & Prior Insurance
        const polHeader = document.createElement('h3');
        polHeader.textContent = '📋 Policy & Prior Insurance';
        polHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
        results.appendChild(polHeader);
        renderField('policyNumber', 'Policy Number', fields.policyNumber);
        renderField('effectiveDate', 'Effective Date', fields.effectiveDate);
        renderField('policyTerm', 'Policy Term', fields.policyTerm);
        renderField('priorCarrier', 'Prior Carrier', fields.priorCarrier);
        renderField('priorExp', 'Prior Expiration', fields.priorExp);
        renderField('priorPolicyTerm', 'Prior Policy Term', fields.priorPolicyTerm);
        renderField('priorLiabilityLimits', 'Prior Liability Limits', fields.priorLiabilityLimits);
        renderField('priorYears', 'Years w/ Prior', fields.priorYears);
        renderField('continuousCoverage', 'Continuous Coverage', fields.continuousCoverage);
        renderField('accidents', 'Accidents', fields.accidents);
        renderField('violations', 'Violations', fields.violations);
        if (fields.homePriorCarrier) renderField('homePriorCarrier', 'Home Prior Carrier', fields.homePriorCarrier);
        if (fields.homePriorExp) renderField('homePriorExp', 'Home Prior Exp.', fields.homePriorExp);
        if (fields.homePriorPolicyTerm) renderField('homePriorPolicyTerm', 'Home Prior Term', fields.homePriorPolicyTerm);
        if (fields.homePriorYears) renderField('homePriorYears', 'Home Yrs w/ Prior', fields.homePriorYears);

        // Additional Info
        if (fields.additionalInsureds || fields.contactTime || fields.referralSource) {
            const addlHeader = document.createElement('h3');
            addlHeader.textContent = '📝 Additional Information';
            addlHeader.style.cssText = 'margin: 12px 0 6px; font-size: 14px; color: var(--text-secondary);';
            results.appendChild(addlHeader);
            if (fields.additionalInsureds) renderField('additionalInsureds', 'Additional Insureds', fields.additionalInsureds);
            if (fields.contactTime) renderField('contactTime', 'Best Contact Time', fields.contactTime);
            if (fields.referralSource) renderField('referralSource', 'Referral Source', fields.referralSource);
        }

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'scan-actions';
        actionsDiv.style.marginTop = '16px';

        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn btn-primary';
        approveBtn.textContent = '✅ Approve & Auto-Fill';
        approveBtn.onclick = () => this.applyExtractedData();

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn';
        cancelBtn.textContent = '❌ Cancel Scan';
        cancelBtn.onclick = () => this.clearScan();

        const editHint = document.createElement('div');
        editHint.className = 'hint';
        editHint.style.marginTop = '8px';
        editHint.textContent = '💡 Edit any fields above before approving, or cancel to start over.';

        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(cancelBtn);
        results.appendChild(actionsDiv);
        results.appendChild(editHint);
    },

    applyExtractedData() {
        const results = document.getElementById('scanResults');
        if (!results) return;
        const inputs = results.querySelectorAll('input[data-field]');
        const mergeMode = document.getElementById('scanMergeMode')?.checked ?? true;
        let appliedCount = 0;
        let skippedCount = 0;
        let emptyCount = 0;
        let hasCoApplicant = false;
        let additionalVehiclesText = '';
        let additionalDriversText = '';
        let altechDriversJson = '';
        let altechVehiclesJson = '';

        // ── Extraction debug log ──
        const log = [];
        console.group('[PolicyScan] 📋 Applying extracted data (merge=' + (mergeMode ? 'protect' : 'overwrite') + ')');

        // Gender normalization helper (AI may return Male/Female, form expects M/F)
        const _normGender = (v) => {
            if (!v) return '';
            const g = String(v).trim().toLowerCase();
            if (g === 'male' || g === 'm') return 'M';
            if (g === 'female' || g === 'f') return 'F';
            if (g === 'x' || g === 'not specified') return 'X';
            return v;
        };

        inputs.forEach((input) => {
            const field = input.dataset.field;
            let extractedValue = (input.value || '').trim();

            // Normalize gender before applying
            if (field === 'gender' || field === 'coGender') {
                extractedValue = _normGender(extractedValue);
                input.value = extractedValue;
            }

            const currentValue = (this.data && this.data[field]) ? this.data[field].toString().trim() : '';

            // Skip empty extracted values
            if (!extractedValue) {
                log.push({ field, action: 'skip-empty', extracted: '', current: currentValue });
                emptyCount++;
                return;
            }

            // Track co-applicant presence
            if (field === 'coFirstName' || field === 'coLastName') hasCoApplicant = true;

            // Capture additional vehicles/drivers text for parsing below
            if (field === 'additionalVehicles') { additionalVehiclesText = extractedValue; return; }
            if (field === 'additionalDrivers') { additionalDriversText = extractedValue; return; }
            if (field === 'altechDriversJson') { altechDriversJson = extractedValue; return; }
            if (field === 'altechVehiclesJson') { altechVehiclesJson = extractedValue; return; }

            // Smart merge: protect existing data if merge mode is on
            if (mergeMode && currentValue && currentValue !== extractedValue) {
                log.push({ field, action: 'skip-protected', extracted: extractedValue, current: currentValue });
                console.log(`  🛡️ PROTECTED "${field}": keeping "${currentValue}" (AI wanted "${extractedValue}")`);
                skippedCount++;
                return;
            }

            // Apply the value
            log.push({ field, action: 'applied', extracted: extractedValue, current: currentValue });
            if (currentValue && currentValue !== extractedValue) {
                console.log(`  ✏️ OVERWRITE "${field}": "${currentValue}" → "${extractedValue}"`);
            } else if (!currentValue) {
                console.log(`  ✅ FILL "${field}": "${extractedValue}"`);
            } else {
                console.log(`  ✓ SAME "${field}": "${extractedValue}"`);
            }

            this.setFieldValue(field, input.value, { autoFilled: true, source: 'scan' });
            appliedCount++;
        });

        console.log(`\n📊 Summary: ${appliedCount} applied, ${skippedCount} protected, ${emptyCount} empty`);
        console.groupEnd();
        
        // Auto-enable co-applicant section if co-applicant data found
        if (hasCoApplicant) {
            this.data.hasCoApplicant = 'yes';
            const coRadio = document.querySelector('input[name="hasCoApplicant"][value="yes"]');
            if (coRadio) { coRadio.checked = true; coRadio.dispatchEvent(new Event('change', { bubbles: true })); }
            this.restoreCoApplicantUI();
            this.restorePrimaryApplicantUI();
        }
        
        // Clear the review UI after applying — replace with extraction log
        results.innerHTML = '';
        const status = document.getElementById('scanStatus');
        if (status) {
            let statusMsg = `✅ ${appliedCount} field(s) applied`;
            if (skippedCount > 0) statusMsg += ` · ${skippedCount} protected`;
            if (emptyCount > 0) statusMsg += ` · ${emptyCount} empty`;
            status.textContent = statusMsg;
        }

        // ── Visible extraction log (collapsible) ──
        const logDetails = document.createElement('details');
        logDetails.style.cssText = 'margin-top: 8px; background: var(--bg-input); border-radius: 10px; padding: 8px 12px; border: 1px solid var(--border);';
        const logSummary = document.createElement('summary');
        logSummary.style.cssText = 'font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; user-select: none;';
        logSummary.textContent = `📋 Extraction Log (${log.length} fields)`;
        logDetails.appendChild(logSummary);
        const logList = document.createElement('div');
        logList.style.cssText = 'margin-top: 8px; font-size: 12px; font-family: monospace; max-height: 300px; overflow-y: auto;';
        const actionIcons = { 'applied': '✅', 'skip-protected': '🛡️', 'skip-empty': '⬜' };
        const actionColors = { 'applied': 'var(--success)', 'skip-protected': '#FF9500', 'skip-empty': 'var(--text-secondary)' };
        log.filter(e => e.action !== 'skip-empty').forEach(entry => {
            const row = document.createElement('div');
            row.style.cssText = `padding: 3px 0; border-bottom: 1px solid var(--border); color: ${actionColors[entry.action] || 'var(--text)'};`;
            if (entry.action === 'applied' && entry.current) {
                row.textContent = `${actionIcons[entry.action]} ${entry.field}: "${entry.current}" → "${entry.extracted}"`;
            } else if (entry.action === 'applied') {
                row.textContent = `${actionIcons[entry.action]} ${entry.field}: "${entry.extracted}"`;
            } else if (entry.action === 'skip-protected') {
                row.textContent = `${actionIcons[entry.action]} ${entry.field}: kept "${entry.current}" (AI: "${entry.extracted}")`;
            }
            logList.appendChild(row);
        });
        if (logList.children.length === 0) {
            const noEntries = document.createElement('div');
            noEntries.style.cssText = 'padding: 6px 0; color: var(--text-secondary);';
            noEntries.textContent = 'No notable actions (all fields were either applied or empty).';
            logList.appendChild(noEntries);
        }
        logDetails.appendChild(logList);
        results.appendChild(logDetails);
        
        // --- Sync scanned vehicle data into vehicles array ---
        // Helper: parse "YYYY Make Model" text into vehicle object
        const parseVehicleDesc = (desc) => {
            const m = (desc || '').match(/(\d{4})\s+(\S+)\s+(.*)/);
            return m ? { year: m[1], make: m[2], model: m[3].trim() } : {};
        };

        // Helper: extract VIN from a text chunk (17 alphanumeric, no I/O/Q)
        const extractVIN = (text) => {
            const m = (text || '').match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
            return m ? m[1].toUpperCase() : '';
        };

        // Build primary vehicle from vin/vehDesc fields
        if (this.data.vin || this.data.vehDesc) {
            const p = parseVehicleDesc(this.data.vehDesc);
            const primaryVeh = {
                id: `vehicle_${Date.now()}`,
                vin: this.data.vin || '',
                year: p.year || '', make: p.make || '', model: p.model || '',
                use: 'Commute', miles: '12000', primaryDriver: ''
            };
            if (!this.vehicles || this.vehicles.length === 0) {
                this.vehicles = [primaryVeh];
            } else {
                const v = this.vehicles[0];
                if (this.data.vin) v.vin = this.data.vin;
                if (p.year) { v.year = p.year; v.make = p.make; v.model = p.model; }
            }
        }

        // Parse additionalVehicles text into extra entries
        if (additionalVehiclesText) {
            // Split on semicolons, commas between entries, newlines, or "Vehicle N:" patterns
            const chunks = additionalVehiclesText.split(/[;\n]|,\s*(?=\d{4}\s)|(?:Vehicle\s*\d+\s*:\s*)/i).filter(s => s.trim());
            chunks.forEach((chunk, i) => {
                const vin = extractVIN(chunk);
                const descClean = chunk.replace(/VIN\s*[:=]?\s*[A-HJ-NPR-Z0-9]{17}/i, '').trim();
                const p = parseVehicleDesc(descClean);
                // Avoid duplicating a vehicle already in the list
                const isDupe = vin && this.vehicles.some(v => v.vin === vin);
                if (!isDupe && (vin || p.year)) {
                    if (!this.vehicles) this.vehicles = [];
                    this.vehicles.push({
                        id: `vehicle_${Date.now() + i + 1}`,
                        vin: vin, year: p.year || '', make: p.make || '', model: p.model || '',
                        use: 'Commute', miles: '12000', primaryDriver: ''
                    });
                }
            });
        }

        if (this.vehicles && this.vehicles.length > 0) {
            this.saveDriversVehicles();
            this.renderVehicles();
        }

        // --- Sync scanned driver data into drivers array ---
        if (this.data.firstName || this.data.lastName) {
            if (!this.drivers || this.drivers.length === 0) {
                this.drivers = [{
                    id: `driver_${Date.now()}`,
                    firstName: this.data.firstName || '',
                    lastName: this.data.lastName || '',
                    dob: this.data.dob || '',
                    gender: _normGender(this.data.gender),
                    maritalStatus: this.data.maritalStatus || '',
                    relationship: 'Self',
                    occupation: this.data.occupation || '',
                    education: this.data.education || '',
                    dlStatus: '',
                    dlNum: '',
                    dlState: this.data.addrState || 'WA',
                    ageLicensed: '',
                    isPrimaryApplicant: true,
                    isCoApplicant: false,
                    accidents: '',
                    violations: '',
                    studentGPA: ''
                }];
            }
        }

        // Parse additionalDrivers text into extra entries
        if (additionalDriversText) {
            const chunks = additionalDriversText.split(/[;\n]|(?:Driver\s*\d+\s*:\s*)/i).filter(s => s.trim());
            chunks.forEach((chunk, i) => {
                // Try to parse "FirstName LastName (DOB: ...)" or "FirstName LastName, DOB ..."
                const nameMatch = chunk.match(/^([A-Za-z'-]+)\s+([A-Za-z'-]+)/);
                if (nameMatch) {
                    const dobMatch = chunk.match(/\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/);
                    if (!this.drivers) this.drivers = [];
                    // Avoid duplicating by name
                    const isDupe = this.drivers.some(d =>
                        d.firstName.toLowerCase() === nameMatch[1].toLowerCase() &&
                        d.lastName.toLowerCase() === nameMatch[2].toLowerCase()
                    );
                    if (!isDupe) {
                        this.drivers.push({
                            id: `driver_${Date.now() + i + 1}`,
                            firstName: nameMatch[1],
                            lastName: nameMatch[2],
                            dob: dobMatch ? dobMatch[1] : '',
                            gender: '',
                            maritalStatus: '',
                            relationship: 'Other',
                            occupation: '',
                            education: '',
                            dlStatus: '',
                            dlNum: '',
                            dlState: this.data.addrState || 'WA',
                            ageLicensed: '',
                            isPrimaryApplicant: false,
                            isCoApplicant: false,
                            accidents: '',
                            violations: '',
                            studentGPA: ''
                        });
                    }
                }
            });
        }

        if (this.drivers && this.drivers.length > 0) {
            this.saveDriversVehicles();
            this.renderDrivers();
        }

        // Rich Altech JSON restore — overrides lossy text parsing when present
        if (altechVehiclesJson) {
            try {
                const vArr = JSON.parse(altechVehiclesJson);
                if (Array.isArray(vArr) && vArr.length > 0) {
                    this.vehicles = vArr.map((v, i) => ({
                        id: `vehicle_${Date.now() + i}`,
                        year: v.year || '', make: v.make || '', model: v.model || '', vin: v.vin || '',
                        use: v.use || 'Commute', miles: v.miles || '12000',
                        primaryDriver: v.primaryDriver || '',
                        ownershipType: v.ownershipType || '',
                        antiTheft: v.antiTheft || '', antiLockBrakes: v.antiLockBrakes || '',
                        passiveRestraints: v.passiveRestraints || '', telematics: v.telematics || '',
                        tnc: v.tnc || '', carPool: v.carPool || '', carNew: v.carNew || ''
                    }));
                    this.saveDriversVehicles(); this.renderVehicles();
                }
            } catch(e) { console.warn('[Scan] altechVehiclesJson parse error:', e); }
        }
        if (altechDriversJson) {
            try {
                const dArr = JSON.parse(altechDriversJson);
                if (Array.isArray(dArr) && dArr.length > 0) {
                    const _normG = g => { const s = (g||'').trim().toUpperCase(); return s === 'MALE' ? 'M' : s === 'FEMALE' ? 'F' : s || ''; };
                    this.drivers = dArr.map((d, i) => ({
                        id: `driver_${Date.now() + i}`,
                        firstName: d.firstName || '', lastName: d.lastName || '',
                        dob: d.dob || '', gender: _normG(d.gender),
                        maritalStatus: d.maritalStatus || '',
                        relationship: d.relationship || (i === 0 ? 'Self' : 'Other'),
                        education: d.education || '', occupation: d.occupation || '',
                        industry: d.industry || '', dlNum: d.dlNum || '',
                        dlState: d.dlState || this.data.addrState || this.data.state || 'WA',
                        dlStatus: d.dlStatus || '', ageLicensed: d.ageLicensed || '',
                        sr22: d.sr22 || '', fr44: d.fr44 || '',
                        goodDriver: d.goodDriver || '', matureDriver: d.matureDriver || '',
                        licenseSusRev: d.licenseSusRev || '', driverEducation: d.driverEducation || '',
                        studentGPA: d.studentGPA || '', accidents: d.accidents || '',
                        violations: d.violations || '',
                        isPrimaryApplicant: i === 0, isCoApplicant: false
                    }));
                    this.saveDriversVehicles(); this.renderDrivers();
                }
            } catch(e) { console.warn('[Scan] altechDriversJson parse error:', e); }
        }

        this.updateScanCoverage();
        const totalVeh = this.vehicles ? this.vehicles.length : 0;
        const totalDrv = this.drivers ? this.drivers.length : 0;
        let toastMsg = `✅ ${appliedCount} fields + ${totalVeh} vehicle(s) + ${totalDrv} driver(s) applied`;
        if (skippedCount > 0) toastMsg += ` (${skippedCount} protected)`;
        this.toast(toastMsg);
    },
});
