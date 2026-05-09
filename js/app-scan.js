// js/app-scan.js — AI scanning, policy extraction, document intelligence
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {
    openScanPicker() {
        const input = document.getElementById('policyScanInput');
        if (input) input.click();
    },

    async exportDemoPolicyDoc() {
        try {
            await window.PDFLibs.ensure('jspdf');
        } catch (e) {
            this.toast('⚠️ PDF library failed to load.');
            return;
        }
        const jsPDF = window.jspdf && window.jspdf.jsPDF;
        if (!jsPDF) {
            this.toast('⚠️ PDF library not available.');
            return;
        }

        const demo = {
            firstName: 'Sample',
            lastName: 'Client',
            dob: '1988-05-12',
            phone: '(555) 555-0199',
            email: 'demo@example.com',
            addrStreet: '123 Sample St',
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
        if (status) { status.classList.remove('hidden'); status.textContent = '⏳ Analyzing GIS document…'; }
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

            // Fallback: direct Gemini API. No response_schema — the field-key
            // allowlist is enforced via the system prompt because a 200-property
            // schema trips Gemini's "too many states for serving" constraint.
            if (!raw) {
                const apiKey = await this._getGeminiKey();
                if (!apiKey) {
                    if (status) status.textContent = '⚠️ Open Settings to configure Smart features.';
                    return;
                }
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                            systemInstruction: { role: 'system', parts: [{ text: scanSystemPrompt }]},
                            generationConfig: { temperature: 0.1, response_mime_type: 'application/json' }
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
            if (status) status.textContent = '⚠️ Extraction failed: ' + err.message;
        }
    },

    // Extract all text from a PDF file client-side using PDF.js
    async _extractPdfText(file) {
        await window.PDFLibs.ensure('pdfjs');
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

            // Try 1b: Direct Gemini API fallback (when AIProvider not configured or non-Google).
            // No response_schema — see comment on the text-only path above.
            if (!result) {
                const apiKey = await this._getGeminiKey();
                if (apiKey) {
                    try {
                        console.log('[PolicyScan] Trying direct Gemini API...');

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
                                        response_mime_type: 'application/json'
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
                        (d.firstName || '').toLowerCase() === nameMatch[1].toLowerCase() &&
                        (d.lastName || '').toLowerCase() === nameMatch[2].toLowerCase()
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

    // ── EZLynx XML Import ──────────────────────────────────────────────────

    importEZLynxXML() {
        // 1. Try stored file handle (File System Access API — works on production)
        this._tryStoredFileHandle()
            .then(xmlText => {
                if (xmlText) {
                    this._parseAndApplyXML(xmlText);
                    return;
                }
                // 2. Try local dev server path
                const savedPath = localStorage.getItem(STORAGE_KEYS.EZLYNX_XML_PATH);
                if (savedPath) {
                    return fetch('/local/ezlynx-xml', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath: savedPath })
                    }).then(resp => {
                        if (!resp.ok) throw new Error('local server unavailable');
                        return resp.text();
                    }).then(text => this._parseAndApplyXML(text));
                }
                throw new Error('no stored handle or path');
            })
            .catch(() => {
                // 3. Fall back to file picker (and store handle for next time)
                this._openEZLynxFilePicker();
            });
    },

    _parseAndApplyXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        if (xmlDoc.querySelector('parsererror')) {
            this.toast('Invalid XML file', 'error');
            return;
        }
        this._applyEZLynxData(xmlDoc);
    },

    // ── File System Access API: persistent file handle via IndexedDB ───────

    _getHandleDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('altech_file_handles', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('handles');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async _storeFileHandle(handle) {
        try {
            const db = await this._getHandleDB();
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'ezlynx_xml');
            await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
            db.close();
        } catch (e) { console.warn('[EZLynx] Could not store handle:', e); }
    },

    async _tryStoredFileHandle() {
        try {
            const db = await this._getHandleDB();
            const tx = db.transaction('handles', 'readonly');
            const handle = await new Promise((res, rej) => {
                const req = tx.objectStore('handles').get('ezlynx_xml');
                req.onsuccess = () => res(req.result);
                req.onerror = rej;
            });
            db.close();
            if (!handle) return null;
            // Re-request permission if needed (browser may prompt once per session)
            if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') {
                if ((await handle.requestPermission({ mode: 'read' })) !== 'granted') return null;
            }
            const file = await handle.getFile();
            return await file.text();
        } catch (e) {
            console.warn('[EZLynx] Stored handle unavailable:', e.message);
            return null;
        }
    },

    _openEZLynxFilePicker() {
        // Prefer showOpenFilePicker (stores handle for future auto-load)
        if (typeof showOpenFilePicker === 'function') {
            showOpenFilePicker({
                types: [{ description: 'XML files', accept: { 'text/xml': ['.xml'] } }],
                multiple: false
            }).then(async ([handle]) => {
                await this._storeFileHandle(handle);
                const file = await handle.getFile();
                const text = await file.text();
                this._parseAndApplyXML(text);
                this.toast('File remembered — next import will load automatically', 'success');
            }).catch(err => {
                if (err.name !== 'AbortError') console.warn('[EZLynx] Picker error:', err);
            });
            return;
        }
        // Fallback for browsers without File System Access API
        const input = document.getElementById('ezlynxXmlInput');
        if (!input) return;
        input.value = '';
        input.click();
    },

    _handleEZLynxXMLFile(file) {
        if (!file || !file.name.toLowerCase().endsWith('.xml')) {
            this.toast('Please select an XML file', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    this.toast('Invalid XML file', 'error');
                    return;
                }
                this._applyEZLynxData(xmlDoc);
            } catch (err) {
                console.error('[EZLynx Import] Parse error:', err);
                this.toast('Failed to parse XML: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    },

    _ezTag(parent, tagName) {
        if (!parent) return '';
        // Try namespace-aware first, then local name fallback
        const els = parent.getElementsByTagNameNS('*', tagName);
        if (els.length) return (els[0].textContent || '').trim();
        const local = parent.getElementsByTagName(tagName);
        if (local.length) return (local[0].textContent || '').trim();
        return '';
    },

    _ezAll(parent, tagName) {
        if (!parent) return [];
        const els = parent.getElementsByTagNameNS('*', tagName);
        if (els.length) return Array.from(els);
        return Array.from(parent.getElementsByTagName(tagName));
    },

    _applyEZLynxData(xmlDoc) {
        let fieldCount = 0;
        const set = (id, val) => {
            if (val === undefined || val === null || val === '') return;
            this.data[id] = val;
            const el = document.getElementById(id);
            if (el) el.value = val;
            fieldCount++;
        };

        // ── Detect schema (EZAUTO vs EZHOME) ────────────────────
        const root = xmlDoc.documentElement;
        const rootName = root ? (root.localName || root.tagName || '') : '';
        const isHome = rootName === 'EZHOME';
        const isAuto = rootName === 'EZAUTO';

        const mapGender = (g) => {
            if (!g) return '';
            const lc = g.toLowerCase();
            if (lc === 'female') return 'F';
            if (lc === 'male') return 'M';
            return g;
        };

        // Strip commas from coverage/cost values: "387,660" → "387660"
        const stripCommas = (v) => (v == null ? '' : String(v).replace(/,/g, ''));

        // ── Applicants ────────────────────────────────
        const applicants = this._ezAll(xmlDoc, 'Applicant');
        let primary = null;
        let coApp = null;
        for (const app of applicants) {
            const type = this._ezTag(app, 'ApplicantType');
            if (type === 'Applicant') primary = app;
            else if (type === 'CoApplicant') coApp = app;
        }

        // Primary applicant
        if (primary) {
            const info = this._ezAll(primary, 'PersonalInfo')[0];
            const name = info ? this._ezAll(info, 'Name')[0] : null;
            if (name) {
                set('firstName', this._ezTag(name, 'FirstName'));
                set('middleName', this._ezTag(name, 'MiddleName'));
                set('lastName', this._ezTag(name, 'LastName'));
            }
            if (info) {
                set('dob', this._ezTag(info, 'DOB'));
                set('gender', mapGender(this._ezTag(info, 'Gender')));
                set('maritalStatus', this._ezTag(info, 'MaritalStatus'));
            }
            const addr = this._ezAll(primary, 'Address')[0];
            if (addr) {
                set('email', this._ezTag(addr, 'Email'));
                const phones = this._ezAll(addr, 'Phone');
                if (phones.length) set('phone', this._ezTag(phones[0], 'PhoneNumber'));
                // Fallback address (used by EZHOME — no GarageLocation block)
                const addr1 = this._ezAll(addr, 'Addr1')[0];
                if (addr1) {
                    const num = this._ezTag(addr1, 'StreetNumber');
                    const nm = this._ezTag(addr1, 'StreetName');
                    const street = [num, nm].filter(Boolean).join(' ');
                    if (street && !this.data.addrStreet) set('addrStreet', street);
                }
                if (!this.data.addrCity)  set('addrCity',  this._ezTag(addr, 'City'));
                if (!this.data.addrState) set('addrState', this._ezTag(addr, 'StateCode'));
                if (!this.data.addrZip)   set('addrZip',   this._ezTag(addr, 'Zip5'));
                if (!this.data.county)    set('county',    this._ezTag(addr, 'County'));
            }
        }

        // Co-applicant — read whatever's in the block (often partial from HawkSoft)
        if (coApp) {
            const info = this._ezAll(coApp, 'PersonalInfo')[0];
            const name = info ? this._ezAll(info, 'Name')[0] : null;
            if (name) {
                set('coFirstName', this._ezTag(name, 'FirstName'));
                set('coMiddleName', this._ezTag(name, 'MiddleName'));
                set('coLastName', this._ezTag(name, 'LastName'));
            }
            if (info) {
                set('coDob', this._ezTag(info, 'DOB'));
                set('coGender', mapGender(this._ezTag(info, 'Gender')));
                set('coMaritalStatus', this._ezTag(info, 'MaritalStatus'));
                const rel = this._ezTag(info, 'Relation');
                if (rel === 'Spouse') set('coRelationship', 'Spouse');
                else if (rel) set('coRelationship', rel);
            }
            const addr = this._ezAll(coApp, 'Address')[0];
            if (addr) {
                set('coEmail', this._ezTag(addr, 'Email'));
                const phones = this._ezAll(addr, 'Phone');
                if (phones.length) set('coPhone', this._ezTag(phones[0], 'PhoneNumber'));
            }
        }

        // ── Address (from GarageLocation — physical address for rating) ──
        const garage = this._ezAll(xmlDoc, 'GarageLocation')[0];
        if (garage) {
            const gAddr = this._ezAll(garage, 'Address')[0] || garage;
            const addr1 = this._ezAll(gAddr, 'Addr1')[0];
            if (addr1) {
                const num = this._ezTag(addr1, 'StreetNumber');
                const name = this._ezTag(addr1, 'StreetName');
                const street = [num, name].filter(Boolean).join(' ');
                if (street) set('addrStreet', street);
            }
            set('addrCity', this._ezTag(gAddr, 'City'));
            set('addrState', this._ezTag(gAddr, 'StateCode'));
            set('addrZip', this._ezTag(gAddr, 'Zip5'));
            set('county', this._ezTag(gAddr, 'County'));
        }

        // ── Address (from AltDwelling — EZHOME's location block) ──
        const altDwelling = this._ezAll(xmlDoc, 'AltDwelling')[0];
        if (altDwelling) {
            const aAddr = this._ezAll(altDwelling, 'Address')[0] || altDwelling;
            const addr1 = this._ezAll(aAddr, 'Addr1')[0];
            if (addr1 && !this.data.addrStreet) {
                const num = this._ezTag(addr1, 'StreetNumber');
                const name = this._ezTag(addr1, 'StreetName');
                const street = [num, name].filter(Boolean).join(' ');
                if (street) set('addrStreet', street);
            }
            if (!this.data.addrCity)  set('addrCity',  this._ezTag(aAddr, 'City'));
            if (!this.data.addrState) set('addrState', this._ezTag(aAddr, 'StateCode'));
            if (!this.data.addrZip)   set('addrZip',   this._ezTag(aAddr, 'Zip5'));
            if (!this.data.county)    set('county',    this._ezTag(aAddr, 'County'));
        }

        // ── Prior Policy ──────────────────────────────
        const prior = this._ezAll(xmlDoc, 'PriorPolicyInfo')[0];
        if (prior) {
            const carrier = this._ezTag(prior, 'PriorCarrier');
            const term    = this._ezTag(prior, 'PriorPolicyTerm');
            const exp     = this._ezTag(prior, 'Expiration');
            const yrs     = this._ezAll(prior, 'YearsWithPriorCarrier')[0];
            const yrsVal  = yrs ? this._ezTag(yrs, 'Years') : '';
            // Route to home-prefixed fields when EZHOME, auto fields when EZAUTO
            if (isHome) {
                set('homePriorCarrier', carrier);
                set('homePriorPolicyTerm', term);
                set('homePriorExp', exp);
                set('homePriorYears', yrsVal);
            } else {
                set('priorCarrier', carrier);
                set('priorPolicyTerm', term);
                set('priorExp', exp);
                set('priorYears', yrsVal);
            }
        }

        // ── PolicyInfo (effective date, term for new policy) ──
        const policyInfo = this._ezAll(xmlDoc, 'PolicyInfo')[0];
        if (policyInfo) {
            const term = this._ezTag(policyInfo, 'PolicyTerm');
            const eff  = this._ezTag(policyInfo, 'Effective');
            if (isHome) {
                set('homePolicyTerm', term);
                set('homeEffectiveDate', eff);
            } else {
                set('policyTerm', term);
                set('effectiveDate', eff);
            }
        }

        // ── Auto Coverages ─────────────────────────────────
        const gen = this._ezAll(xmlDoc, 'GeneralCoverage')[0];
        if (gen) {
            set('liabilityLimits', this._ezTag(gen, 'BI'));
            set('pdLimit', this._ezTag(gen, 'PD'));
            set('medPayments', this._ezTag(gen, 'MP'));
            set('umLimits', this._ezTag(gen, 'UM'));
            set('uimLimits', this._ezTag(gen, 'UIM'));
            const multi = this._ezTag(gen, 'Multicar');
            if (multi) set('multiPolicy', /yes/i.test(multi) ? 'yes' : 'no');
        }
        // Per-vehicle coverages — use first vehicle's values for global fields
        const vehCovs = this._ezAll(xmlDoc, 'VehicleCoverage');
        if (vehCovs.length) {
            const vc = vehCovs[0];
            set('compDeductible', this._ezTag(vc, 'OtherCollisionDeductible'));
            set('autoDeductible', this._ezTag(vc, 'CollisionDeductible'));
            set('towingDeductible', this._ezTag(vc, 'TowingDeductible'));
            set('rentalDeductible', this._ezTag(vc, 'RentalDeductible'));
        }
        // State-specific (WA)
        const waCov = this._ezAll(xmlDoc, 'WA-Coverages')[0];
        if (waCov) {
            set('umpdLimit', this._ezTag(waCov, 'WA-UMPD'));
            const pip = this._ezTag(waCov, 'WA-PIP');
            // WA-PIP "No Coverage" is meaningful; map to medPayments-style field
            if (pip) this.data.waPip = pip;
        }

        // ── Drivers ───────────────────────────────────
        const xmlDrivers = this._ezAll(xmlDoc, 'Driver');
        const driverIdMap = {}; // XML id → internal id
        const newDrivers = [];
        xmlDrivers.forEach((d, i) => {
            const xmlId = d.getAttribute('id');
            const id = `driver_${Date.now() + i}`;
            if (xmlId) driverIdMap[xmlId] = id;

            const nameEl = this._ezAll(d, 'Name')[0];
            const rel = this._ezTag(d, 'Relation');

            // Violations: structured list (used by exporter) + summary string
            const violationEls = this._ezAll(d, 'Violation');
            const violationList = violationEls.map(v => ({
                date: this._ezTag(v, 'Date'),
                description: this._ezTag(v, 'Description'),
            })).filter(v => v.date || v.description);
            const violationsSummary = violationList
                .map(v => [v.date, v.description].filter(Boolean).join(' '))
                .filter(Boolean)
                .join('; ');

            // Accidents: same shape, free-text summary only (App stores as string)
            const accidentEls = this._ezAll(d, 'Accident');
            const accidentList = accidentEls.map(a => ({
                date: this._ezTag(a, 'Date'),
                description: this._ezTag(a, 'Description'),
                bi: this._ezTag(a, 'BI'),
                pd: this._ezTag(a, 'PD'),
            })).filter(a => a.date || a.description);
            const accidentsSummary = accidentList
                .map(a => [a.date, a.description].filter(Boolean).join(' '))
                .filter(Boolean)
                .join('; ');

            newDrivers.push({
                id,
                firstName: nameEl ? this._ezTag(nameEl, 'FirstName') : '',
                middleName: nameEl ? this._ezTag(nameEl, 'MiddleName') : '',
                lastName: nameEl ? this._ezTag(nameEl, 'LastName') : '',
                dob: this._ezTag(d, 'DOB'),
                dlNum: this._ezTag(d, 'DLNumber'),
                dlState: this._ezTag(d, 'DLState') || 'WA',
                relationship: rel === 'Insured' ? 'Self' : (rel || ''),
                isCoApplicant: rel === 'Spouse',
                isPrimaryApplicant: i === 0,
                accidents: accidentsSummary,
                accidentList,
                violations: violationsSummary,
                violationList,
                studentGPA: '',
                gender: mapGender(this._ezTag(d, 'Gender')),
                maritalStatus: this._ezTag(d, 'MaritalStatus'),
                principalVehicle: this._ezTag(d, 'PrincipalVehicle'),
                _xmlId: xmlId,
            });
        });

        // Backfill default 'Other' relationship for non-primary drivers that
        // have no Relation tag — preserves the old default while leaving the
        // gap visible to the review modal (see _hasImportGaps below).
        newDrivers.forEach((drv, i) => {
            if (i > 0 && !drv.relationship) drv.relationship = 'Other';
        });

        // ── Vehicles ──────────────────────────────────
        const xmlVehicles = this._ezAll(xmlDoc, 'Vehicle');
        const xmlVehicleUses = this._ezAll(xmlDoc, 'VehicleUse');
        const xmlAssignments = this._ezAll(xmlDoc, 'VehicleAssignment');
        const newVehicles = [];
        xmlVehicles.forEach((v, i) => {
            const xmlId = v.getAttribute('id');
            const id = `vehicle_${Date.now() + i}`;

            // Find matching VehicleUse
            let use = 'Pleasure';
            let annualMiles = '';
            let oneWayMiles = '';
            for (const vu of xmlVehicleUses) {
                if (vu.getAttribute('id') === xmlId) {
                    use = this._ezTag(vu, 'Useage') || this._ezTag(vu, 'Usage') || 'Pleasure';
                    annualMiles = this._ezTag(vu, 'AnnualMiles');
                    oneWayMiles = this._ezTag(vu, 'OneWayMiles');
                    break;
                }
            }

            // Find assigned driver — VehicleAssignment may have empty
            // <DriverAssignment/> (HawkSoft commonly emits this). When that
            // happens we leave primaryDriver blank and surface it in the
            // review modal.
            let primaryDriver = '';
            for (const va of xmlAssignments) {
                if (va.getAttribute('id') === xmlId) {
                    const da = this._ezAll(va, 'DriverAssignment')[0];
                    if (da) {
                        const driverXmlId = da.getAttribute('id');
                        if (driverXmlId) primaryDriver = driverIdMap[driverXmlId] || '';
                    }
                    break;
                }
            }
            // Fallback: if a Driver had <PrincipalVehicle> matching this vehicle,
            // use that driver as the primary (HawkSoft sometimes emits the
            // assignment from the driver side instead).
            if (!primaryDriver && xmlId) {
                const match = newDrivers.find(d => d.principalVehicle === xmlId);
                if (match) primaryDriver = match.id;
            }

            newVehicles.push({
                id,
                vin: this._ezTag(v, 'Vin'),
                year: this._ezTag(v, 'Year'),
                make: this._ezTag(v, 'Make'),
                model: this._ezTag(v, 'Model'),
                use,
                miles: annualMiles || '12000',
                oneWayMiles,
                antiTheft: this._ezTag(v, 'Anti-Theft'),
                passiveRestraints: this._ezTag(v, 'PassiveRestraints'),
                primaryDriver,
                _xmlId: xmlId,
            });
        });

        // ── EZHOME RatingInfo / ReplacementCost / Endorsements ──
        if (isHome) {
            const ratingInfo = this._ezAll(xmlDoc, 'RatingInfo')[0];
            if (ratingInfo) {
                set('yrBuilt',           this._ezTag(ratingInfo, 'YearBuilt'));
                set('dwellingType',      this._ezTag(ratingInfo, 'Dwelling'));
                set('dwellingUsage',     this._ezTag(ratingInfo, 'DwellingUse'));
                set('protectionClass',   this._ezTag(ratingInfo, 'ProtectionClassType'));
                set('numStories',        this._ezTag(ratingInfo, 'NumberOfStories'));
                set('constructionStyle', this._ezTag(ratingInfo, 'Construction'));
                set('roofType',          this._ezTag(ratingInfo, 'Roof'));
                set('heatingType',       this._ezTag(ratingInfo, 'HeatingType'));
                set('sqFt',              this._ezTag(ratingInfo, 'SquareFootage'));
                const pool = this._ezTag(ratingInfo, 'SwimmingPool');
                if (pool) set('pool', /yes/i.test(pool) ? 'Yes' : 'No');
                // DistanceToFireHydrant: HawkSoft emits range like "601-1000".
                // Field stores raw feet; use the upper bound as a best-guess.
                const fhRange = this._ezTag(ratingInfo, 'DistanceToFireHydrant');
                if (fhRange) {
                    const m = fhRange.match(/(\d+)\D+(\d+)/);
                    if (m) set('fireHydrantFeet', m[2]);
                    else if (/^\d+\+?$/.test(fhRange)) set('fireHydrantFeet', fhRange.replace('+', ''));
                }
            }

            const replacementCost = this._ezAll(xmlDoc, 'ReplacementCost')[0];
            if (replacementCost) {
                set('dwellingCoverage',     stripCommas(this._ezTag(replacementCost, 'Dwelling')));
                set('otherStructures',      stripCommas(this._ezTag(replacementCost, 'OtherStructures')));
                set('homePersonalProperty', stripCommas(this._ezTag(replacementCost, 'PersonalProperty')));
                set('homeLossOfUse',        stripCommas(this._ezTag(replacementCost, 'LossOfUse')));
            }

            const endorsements = this._ezAll(xmlDoc, 'Endorsements')[0];
            if (endorsements) {
                const eq = this._ezAll(endorsements, 'Earthquake')[0];
                if (eq) {
                    const eqVal = this._ezTag(eq, 'Earthquake');
                    if (eqVal) set('earthquakeCoverage', /yes/i.test(eqVal) ? 'Yes' : 'No');
                }
                const rcDwelling = this._ezAll(endorsements, 'ReplacementCostDwelling')[0];
                if (rcDwelling) {
                    const v = this._ezTag(rcDwelling, 'ReplacementCostDwelling');
                    if (v) set('increasedReplacementCost', v);
                }
            }
        }

        // ── Cross-reference reconciliation ──────────────────────
        // HawkSoft frequently leaves the CoApplicant block half-filled (just
        // FirstName/LastName) but emits a Driver block with the full DOB /
        // gender / DL. Match by first name (most reliable since spouses
        // sometimes carry maiden last names in the driver list) and backfill.
        if (this.data.coFirstName && newDrivers.length) {
            const coFirst = String(this.data.coFirstName).trim().toLowerCase();
            const coDob = this.data.coDob;
            const matchedDriver = newDrivers.find((drv, i) => {
                if (i === 0) return false; // never match primary
                if (!drv.firstName) return false;
                if (drv.firstName.trim().toLowerCase() !== coFirst) return false;
                // If we already have coDob, prefer DOB-equal match
                if (coDob && drv.dob) return drv.dob === coDob;
                return true;
            });
            if (matchedDriver) {
                if (!this.data.coDob && matchedDriver.dob) set('coDob', matchedDriver.dob);
                if (!this.data.coGender && matchedDriver.gender) set('coGender', matchedDriver.gender);
                if (!this.data.coMaritalStatus && matchedDriver.maritalStatus) {
                    set('coMaritalStatus', matchedDriver.maritalStatus);
                }
                // Tag this driver as the co-applicant so render shows the
                // correct "Co-App" badge and the export pipeline can link them.
                matchedDriver.isCoApplicant = true;
                if (!matchedDriver.relationship || matchedDriver.relationship === 'Other') {
                    matchedDriver.relationship = this.data.coRelationship === 'Domestic Partner'
                        ? 'Spouse'  // driver-relationship dropdown doesn't include "Domestic Partner"
                        : 'Spouse';
                }
            }
        }

        // ── Apply drivers & vehicles ──────────────────
        if (newDrivers.length) this.drivers = newDrivers;
        if (newVehicles.length) this.vehicles = newVehicles;

        // ── qType detection ─────────────────────────────────────
        // Detect from root element + existing data so importing EZAUTO then
        // EZHOME (or vice versa) into the same client merges to qType=both.
        const hasAutoData = (this.drivers && this.drivers.length) || (this.vehicles && this.vehicles.length)
            || this.data.liabilityLimits || this.data.priorCarrier;
        const hasHomeData = this.data.yrBuilt || this.data.dwellingCoverage || this.data.dwellingType;
        let nextQType = this.data.qType || '';
        if (isHome && hasAutoData) nextQType = 'both';
        else if (isAuto && hasHomeData) nextQType = 'both';
        else if (isHome) nextQType = 'home';
        else if (isAuto) nextQType = 'auto';
        if (nextQType) {
            const radio = document.querySelector(`input[name="qType"][value="${nextQType}"]`);
            if (radio) {
                radio.checked = true;
                if (typeof this.handleType === 'function') this.handleType();
            } else {
                // No DOM (test env) — set directly.
                this.data.qType = nextQType;
            }
        }

        // ── Build import-gap manifest ──────────────────────────
        const gaps = this._buildImportGaps({ isAuto, isHome });

        // ── Persist ───────────────────────────────────
        this.save();
        if (newDrivers.length || newVehicles.length) {
            this.saveDriversVehicles();
            if (typeof this.renderDrivers === 'function') this.renderDrivers();
            if (typeof this.renderVehicles === 'function') this.renderVehicles();
        }

        const driverWord = `${newDrivers.length} driver${newDrivers.length === 1 ? '' : 's'}`;
        const vehicleWord = `${newVehicles.length} vehicle${newVehicles.length === 1 ? '' : 's'}`;
        this.toast(`✅ Imported ${fieldCount} fields + ${driverWord} + ${vehicleWord} from EZLynx XML`);

        // ── Open review modal if anything needs confirmation ──
        if (this._hasImportGaps(gaps) && typeof document !== 'undefined' && document.body) {
            this._showImportReviewModal(gaps);
        } else if (typeof document !== 'undefined' && document.body) {
            this._markEzlynxRequiredGaps();
        }
    },

    // Build a manifest of post-import items that need user confirmation.
    // Driven by what HawkSoft *consistently* leaves out — relationships,
    // vehicle assignments, and a marital sanity check when applicant is
    // marked Single but a CoApplicant is present.
    _buildImportGaps({ isAuto, isHome }) {
        const gaps = {
            relationships: [],
            maritalSanity: false,
            vehicleAssignments: [],
            vehicleFacts: [],
            ezlynxRequired: [],
        };

        // Driver relationships: every non-primary driver that's still 'Other'
        // (i.e. Relation tag was missing in the XML and we couldn't match by
        // co-applicant name) goes in the list.
        (this.drivers || []).forEach((drv, i) => {
            if (i === 0) return; // primary is always Self
            if (!drv.relationship || drv.relationship === 'Other') {
                gaps.relationships.push({ id: drv.id, name: `${drv.firstName || ''} ${drv.lastName || ''}`.trim(), suggested: this._suggestDriverRelationship(drv, i) });
            }
        });

        // Marital sanity: Applicant marked Single but a CoApplicant exists
        if (this.data.coFirstName && (this.data.maritalStatus === 'Single' || !this.data.maritalStatus)) {
            gaps.maritalSanity = true;
        }

        // Vehicle assignments: any vehicle without primaryDriver set
        (this.vehicles || []).forEach(v => {
            if (!v.primaryDriver) gaps.vehicleAssignments.push({ id: v.id, label: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() });
        });

        // Vehicle facts: only flag when *no* annual miles were imported (the
        // 12000 default is intentional but worth confirming).
        (this.vehicles || []).forEach(v => {
            const importedMiles = v.miles && v.miles !== '12000';
            if (!importedMiles) {
                gaps.vehicleFacts.push({
                    id: v.id,
                    label: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
                    miles: v.miles || '12000',
                    use: v.use || 'Pleasure',
                });
            }
        });

        // EZLynx-required field gaps — purely informational, surfaced as a
        // checklist in the modal (and as inline badges on the form).
        const FIELDS = (typeof window !== 'undefined' && window.FIELDS) || [];
        FIELDS.filter(f => f.ezlynxRequired).forEach(f => {
            if (!this.data[f.storageKey]) {
                gaps.ezlynxRequired.push({ id: f.id, label: f.label, section: f.section });
            }
        });

        return gaps;
    },

    _hasImportGaps(gaps) {
        return (
            (gaps.relationships && gaps.relationships.length) ||
            gaps.maritalSanity ||
            (gaps.vehicleAssignments && gaps.vehicleAssignments.length) ||
            (gaps.vehicleFacts && gaps.vehicleFacts.length)
        );
    },

    // Heuristic: name shared with applicant → Spouse if older, Child if much
    // younger. Otherwise Other. Conservative — we only auto-suggest, never
    // auto-apply. Producer confirms in the modal.
    _suggestDriverRelationship(drv, idx) {
        const appLast = (this.data.lastName || '').trim().toLowerCase();
        const drvLast = (drv.lastName || '').trim().toLowerCase();
        const sharesLast = appLast && drvLast && appLast === drvLast;
        const appDob = this.data.dob;
        const drvDob = drv.dob;
        if (appDob && drvDob) {
            const ageDelta = (new Date(appDob) - new Date(drvDob)) / (1000 * 60 * 60 * 24 * 365.25);
            if (sharesLast && ageDelta > 15) return 'Child';
            if (sharesLast && ageDelta < -15) return 'Parent';
            if (sharesLast && Math.abs(ageDelta) <= 15) return 'Spouse';
        }
        return 'Other';
    },

    // ── Post-import review modal ────────────────────────────
    // One pass to fill in what HawkSoft consistently omits. Sectioned, not
    // a wizard — producer can skip ('Looks good') if everything's right.
    _showImportReviewModal(gaps) {
        const escAttr = (window.Utils && Utils.escapeAttr) || (s => String(s == null ? '' : s).replace(/"/g, '&quot;'));
        const escHtml = (window.Utils && Utils.escapeHTML) || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

        const sections = [];

        // Section: relationships
        if (gaps.relationships.length) {
            const rows = gaps.relationships.map(r => `
                <div class="ez-review-row" data-driver-id="${escAttr(r.id)}">
                    <div class="ez-review-label">${escHtml(r.name) || '(unnamed driver)'}</div>
                    <select class="ez-review-rel" data-driver-id="${escAttr(r.id)}">
                        <option value="Spouse" ${r.suggested === 'Spouse' ? 'selected' : ''}>Spouse / Partner</option>
                        <option value="Child" ${r.suggested === 'Child' ? 'selected' : ''}>Child</option>
                        <option value="Parent" ${r.suggested === 'Parent' ? 'selected' : ''}>Parent</option>
                        <option value="Other" ${r.suggested === 'Other' ? 'selected' : ''}>Other Household Member</option>
                    </select>
                </div>`).join('');
            sections.push(`
                <section class="ez-review-section">
                    <h3>Household roles</h3>
                    <p class="ez-review-hint">HawkSoft doesn't include relationships for additional drivers. Confirm who's who:</p>
                    ${rows}
                </section>`);
        }

        // Section: marital sanity
        if (gaps.maritalSanity) {
            sections.push(`
                <section class="ez-review-section">
                    <h3>Marital status</h3>
                    <p class="ez-review-hint">Applicant is marked <strong>Single</strong> but a co-applicant is on file. EZLynx pairs spouses by marital status.</p>
                    <label class="ez-review-toggle">
                        <input type="checkbox" id="ezReviewMarital" checked>
                        Update both to <strong>Married</strong>
                    </label>
                </section>`);
        }

        // Section: vehicle assignments
        if (gaps.vehicleAssignments.length) {
            const driverOpts = (this.drivers || []).map((d, i) => {
                const label = `${d.firstName || ''} ${d.lastName || ''}`.trim() || `Driver ${i + 1}`;
                return `<option value="${escAttr(d.id)}">${escHtml(label)}</option>`;
            }).join('');
            const rows = gaps.vehicleAssignments.map(v => `
                <div class="ez-review-row" data-vehicle-id="${escAttr(v.id)}">
                    <div class="ez-review-label">${escHtml(v.label) || 'Vehicle'}</div>
                    <select class="ez-review-veh-driver" data-vehicle-id="${escAttr(v.id)}">
                        <option value="">— Pick driver —</option>
                        ${driverOpts}
                    </select>
                </div>`).join('');
            sections.push(`
                <section class="ez-review-section">
                    <h3>Vehicle assignments</h3>
                    <p class="ez-review-hint">HawkSoft sends empty driver assignments. Pick the primary driver for each vehicle:</p>
                    ${rows}
                </section>`);
        }

        // Section: vehicle facts
        if (gaps.vehicleFacts.length) {
            const useOpts = ['Pleasure', 'Commute', 'Business', 'Farm'].map(u => `<option value="${u}">${u}</option>`).join('');
            const rows = gaps.vehicleFacts.map(v => `
                <div class="ez-review-row ez-review-row-facts" data-vehicle-id="${escAttr(v.id)}">
                    <div class="ez-review-label">${escHtml(v.label) || 'Vehicle'}</div>
                    <div class="ez-review-veh-facts">
                        <input type="number" class="ez-review-miles" data-vehicle-id="${escAttr(v.id)}" value="${escAttr(v.miles)}" min="0" step="500" placeholder="Annual miles">
                        <select class="ez-review-use" data-vehicle-id="${escAttr(v.id)}">${useOpts.replace(`value="${v.use}"`, `value="${v.use}" selected`)}</select>
                    </div>
                </div>`).join('');
            sections.push(`
                <section class="ez-review-section">
                    <h3>Annual mileage &amp; use</h3>
                    <p class="ez-review-hint">Confirm or adjust — defaults to 12,000 / Pleasure.</p>
                    ${rows}
                </section>`);
        }

        // Section: EZLynx-required gaps (informational, no inputs — just a checklist)
        if (gaps.ezlynxRequired.length) {
            const items = gaps.ezlynxRequired.slice(0, 12).map(g => `
                <li><span class="ez-review-gap-label">${escHtml(g.label)}</span> <span class="ez-review-gap-section">${escHtml(g.section)}</span></li>`).join('');
            const more = gaps.ezlynxRequired.length > 12 ? `<li class="ez-review-gap-more">…and ${gaps.ezlynxRequired.length - 12} more</li>` : '';
            sections.push(`
                <section class="ez-review-section">
                    <h3>Still needed for EZLynx</h3>
                    <p class="ez-review-hint">These required fields are blank — fill them in the intake steps before exporting.</p>
                    <ul class="ez-review-gap-list">${items}${more}</ul>
                </section>`);
        }

        if (!sections.length) return; // nothing to show

        const modalHTML = `
            <div class="modal-overlay ez-review-overlay" id="ezImportReviewModal">
                <div class="modal-content ez-review-content">
                    <div class="modal-header">
                        <h2>📋 Complete the picture</h2>
                        <button class="modal-close" type="button" onclick="App._closeImportReviewModal()">✕</button>
                    </div>
                    <div class="modal-body ez-review-body">
                        <p class="ez-review-intro">HawkSoft sent us most of the data. A few things need your eyes before this client is EZLynx-ready.</p>
                        ${sections.join('')}
                    </div>
                    <div class="modal-footer ez-review-footer">
                        <button class="btn-secondary" type="button" onclick="App._closeImportReviewModal()">Skip — I'll fix later</button>
                        <button class="btn-primary" type="button" onclick="App._applyImportReviewModal()">✅ Apply &amp; continue</button>
                    </div>
                </div>
            </div>`;

        const existing = document.getElementById('ezImportReviewModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        setTimeout(() => {
            const m = document.getElementById('ezImportReviewModal');
            if (m) m.classList.add('active');
        }, 10);
    },

    _closeImportReviewModal() {
        const m = document.getElementById('ezImportReviewModal');
        if (m) m.remove();
        if (typeof this._markEzlynxRequiredGaps === 'function') this._markEzlynxRequiredGaps();
    },

    _applyImportReviewModal() {
        const modal = document.getElementById('ezImportReviewModal');
        if (!modal) return;

        // Apply driver relationships
        modal.querySelectorAll('.ez-review-rel').forEach(sel => {
            const drvId = sel.getAttribute('data-driver-id');
            const drv = (this.drivers || []).find(d => d.id === drvId);
            if (drv) {
                drv.relationship = sel.value;
                if (sel.value === 'Spouse') drv.isCoApplicant = true;
            }
        });

        // Apply marital sanity check
        const maritalCb = modal.querySelector('#ezReviewMarital');
        if (maritalCb && maritalCb.checked) {
            this.data.maritalStatus = 'Married';
            const ms = document.getElementById('maritalStatus');
            if (ms) ms.value = 'Married';
            if (this.data.coFirstName) {
                this.data.coMaritalStatus = 'Married';
                const coMs = document.getElementById('coMaritalStatus');
                if (coMs) coMs.value = 'Married';
            }
        }

        // Apply vehicle assignments
        modal.querySelectorAll('.ez-review-veh-driver').forEach(sel => {
            const vehId = sel.getAttribute('data-vehicle-id');
            const veh = (this.vehicles || []).find(v => v.id === vehId);
            if (veh && sel.value) veh.primaryDriver = sel.value;
        });

        // Apply vehicle facts (miles + use)
        modal.querySelectorAll('.ez-review-miles').forEach(inp => {
            const vehId = inp.getAttribute('data-vehicle-id');
            const veh = (this.vehicles || []).find(v => v.id === vehId);
            if (veh && inp.value) veh.miles = String(inp.value).trim();
        });
        modal.querySelectorAll('.ez-review-use').forEach(sel => {
            const vehId = sel.getAttribute('data-vehicle-id');
            const veh = (this.vehicles || []).find(v => v.id === vehId);
            if (veh && sel.value) veh.use = sel.value;
        });

        // Persist + re-render
        if (typeof this.save === 'function') this.save();
        if (typeof this.saveDriversVehicles === 'function') this.saveDriversVehicles();
        if (typeof this.renderDrivers === 'function') this.renderDrivers();
        if (typeof this.renderVehicles === 'function') this.renderVehicles();

        modal.remove();
        if (typeof this.toast === 'function') this.toast('✅ Updated from review');
        if (typeof this._markEzlynxRequiredGaps === 'function') this._markEzlynxRequiredGaps();
    },

    // Inline "needs review" badges on intake form labels for ezlynxRequired
    // fields that the import didn't fill. Stamped once per import; idempotent.
    //
    // quoting.html labels mostly omit `for=` attributes — fields are visually
    // associated by DOM nesting rather than id reference. Mirror the
    // parent-walk used by _stampEzlynxLabels (js/app-navigation.js) so badges
    // actually attach to the right label, including the .label-with-hint and
    // double-wrapper variants.
    _markEzlynxRequiredGaps() {
        if (typeof document === 'undefined' || !document.body) return;
        // Clear any prior badges
        document.querySelectorAll('.ez-needs-review-badge').forEach(b => b.remove());
        const FIELDS = (typeof window !== 'undefined' && window.FIELDS) || [];
        FIELDS.filter(f => f.ezlynxRequired).forEach(f => {
            if (this.data[f.storageKey]) return;
            const el = document.getElementById(f.id);
            if (!el) return;
            const label = this._findFieldLabel(el);
            if (!label || label.querySelector('.ez-needs-review-badge')) return;
            const badge = document.createElement('span');
            badge.className = 'ez-needs-review-badge';
            badge.textContent = 'needs review';
            badge.title = 'EZLynx requires this field — please fill it in';
            label.appendChild(badge);
        });
    },

    // Find the visible <label.label> for an input, walking parents the same
    // way _stampEzlynxLabels does. Returns the label element or null.
    _findFieldLabel(el) {
        if (!el) return null;
        // Direct association first (the few fields that do use `for=`)
        if (el.id) {
            const direct = document.querySelector(`label[for="${el.id}"]`);
            if (direct) return direct;
        }
        const p = el.parentElement;
        return p?.querySelector(':scope > label.label')
            || p?.querySelector(':scope > .label-with-hint > label.label')
            || p?.parentElement?.querySelector(':scope > label.label')
            || p?.parentElement?.querySelector(':scope > .label-with-hint > label.label')
            || null;
    },
});
