// js/app-popups.js — Popup/modal modules (hazard, vision, history analysis, data preview)
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {
    calculateResidenceTime() {
        const dateStr = this.data.purchaseDate;
        const display = document.getElementById('residenceTimeDisplay');
        if (!display) return;
        if (!dateStr) { display.textContent = ''; return; }
        const purchase = new Date(dateStr);
        const now = new Date();
        const diffMs = now - purchase;
        if (diffMs < 0) { display.textContent = '(future date)'; return; }
        const years = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
        const months = Math.floor((diffMs / (30.44 * 24 * 60 * 60 * 1000)) % 12);
        if (years > 0) {
            display.textContent = `(~${years} yr${years !== 1 ? 's' : ''}, ${months} mo at residence)`;
        } else {
            display.textContent = `(${months} month${months !== 1 ? 's' : ''} at residence)`;
        }
        this.data.yearsAtResidence = years;
    },

    async enrichFireStation(address, city, state) {
        const zip = this.data.addrZip || '';
        console.log(`[FireStation] Enrichment starting: ${address}, ${city}, ${state} ${zip}`);
        try {
            const resp = await fetch('/api/property-intelligence?mode=firestation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, city, state, zip })
            });
            if (!resp.ok) {
                console.warn(`[FireStation] API returned HTTP ${resp.status}`);
                return;
            }
            const result = await resp.json();
            console.log('[FireStation] API response:', JSON.stringify(result).substring(0, 500));
            if (!result.success) {
                console.warn('[FireStation] No data:', result.error);
                return;
            }

            const applied = [];

            if (result.fireStationDist != null) {
                const el = document.getElementById('fireStationDist');
                if (el) {
                    el.value = result.fireStationDist;
                    this.data.fireStationDist = String(result.fireStationDist);
                    this.markAutoFilled(el, 'fire');
                    applied.push(`${result.fireStationDist} mi to ${result.fireStationName || 'fire station'}`);
                }
            }

            if (result.protectionClass != null) {
                const el = document.getElementById('protectionClass');
                if (el) {
                    el.value = result.protectionClass;
                    this.data.protectionClass = String(result.protectionClass);
                    this.markAutoFilled(el, 'fire');
                    applied.push(`Protection Class ${result.protectionClass}`);
                }
            }

            if (applied.length > 0) {
                this.save();
                this.toast(`🚒 ${applied.join(' · ')}`, 5000);
                console.log(`[FireStation] Applied: ${applied.join(', ')}`);
            }
        } catch (e) {
            console.warn('[FireStation] Enrichment failed (non-fatal):', e.message);
        }
    },

    showHazardDetectionPopup(detections, satelliteImage, address, streetViewImage) {
        // Normalize new Gemini Vision response format (roof_material, has_pool, etc.)
        // to the internal field names used by the popup and apply logic
        const d = detections || {};
        const hazards = {
            pool: d.has_pool === true || d.pool === 'yes',
            poolFenced: d.pool_fenced === true || null,
            trampoline: d.has_trampoline === true || d.trampoline === 'yes',
            deck: d.deck_or_patio === true || d.deck === 'yes',
            roofType: d.roof_material && d.roof_material !== 'unknown' ? d.roof_material : (d.roofType && d.roofType !== 'unknown' ? d.roofType : null),
            roofShape: d.roof_shape && d.roof_shape !== 'unknown' ? d.roof_shape : (d.roofShape && d.roofShape !== 'unknown' ? d.roofShape : null),
            roofConditionScore: d.roof_condition_score || null,
            numStories: d.stories || (d.numStories && d.numStories !== 'unknown' ? d.numStories : null),
            garageSpaces: d.garage_doors || (d.garageSpaces && d.garageSpaces !== 'unknown' ? d.garageSpaces : null),
            visibleHazards: d.visible_hazards || [],
            treeOverhang: d.tree_overhang_roof,
            brushClearance: d.brush_clearance_adequate,
            notes: d.notes || '',
        };
        
        // Count detected hazards
        const hazardCount = [hazards.pool, hazards.trampoline, hazards.deck].filter(Boolean).length;
        
        // Create elegant popup
        const modalHTML = `
            <div class="modal-overlay" id="hazardDetectionModal">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h2>🛡️ Property Analysis Complete</h2>
                        <p style="font-size: 13px; color: var(--text-secondary); margin: 8px 0 0 0;">
                            ${address}
                        </p>
                    </div>
                    
                    <div class="modal-body">
                        ${satelliteImage || streetViewImage ? `
                            <div style="margin-bottom: 20px; display: flex; gap: 8px;">
                                ${satelliteImage ? `
                                    <div style="flex: 1;">
                                        <p style="font-size: 11px; font-weight: 600; margin: 0 0 6px 0;">Satellite</p>
                                        <img
                                            src="data:image/png;base64,${satelliteImage}"
                                            style="width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--border); cursor: pointer;"
                                            onclick="App.viewSatelliteFullscreen(this.src)"
                                            title="Click to view fullscreen"
                                        >
                                    </div>
                                ` : ''}
                                ${streetViewImage ? `
                                    <div style="flex: 1;">
                                        <p style="font-size: 11px; font-weight: 600; margin: 0 0 6px 0;">Street View</p>
                                        <img
                                            src="data:image/jpeg;base64,${streetViewImage}"
                                            style="width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--border); cursor: pointer;"
                                            onclick="App.viewSatelliteFullscreen(this.src)"
                                            title="Click to view fullscreen"
                                        >
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                        
                        <div style="background: var(--bg-secondary); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                            <p style="font-size: 12px; font-weight: 600; margin: 0 0 12px 0; color: var(--text);">Hazards Detected ${hazardCount > 0 ? `(${hazardCount})` : ''}</p>
                            
                            <div style="display: grid; gap: 8px;">
                                <label class="checkbox-row is-prominent">
                                    <input type="checkbox" id="hazard_pool" ${hazards.pool ? 'checked' : ''}>
                                    <span>🏊 Pool ${hazards.pool ? '✓ Detected' : '(Not detected)'}${hazards.pool && hazards.poolFenced === true ? ' (fenced)' : hazards.pool && hazards.poolFenced === false ? ' ⚠️ no visible fence' : ''}</span>
                                </label>
                                <label class="checkbox-row is-prominent">
                                    <input type="checkbox" id="hazard_trampoline" ${hazards.trampoline ? 'checked' : ''}>
                                    <span>🎪 Trampoline ${hazards.trampoline ? '✓ Detected' : '(Not detected)'}</span>
                                </label>
                                <label class="checkbox-row is-prominent">
                                    <input type="checkbox" id="hazard_deck" ${hazards.deck ? 'checked' : ''}>
                                    <span>🛋️ Deck/Patio ${hazards.deck ? '✓ Detected' : '(Not detected)'}</span>
                                </label>
                                ${hazards.treeOverhang === true ? `
                                    <div style="display: flex; align-items: center; gap: 6px; padding: 6px 8px; background: #fff3cd; border-radius: 6px;">
                                        <span>🌲</span>
                                        <span style="font-size: 13px; color: #856404;">Tree branches overhanging roof</span>
                                    </div>
                                ` : ''}
                                ${hazards.visibleHazards && hazards.visibleHazards.length > 0 ? `
                                    <div style="padding: 8px; background: #f8d7da; border-radius: 6px;">
                                        <p style="font-size: 11px; font-weight: 600; margin: 0 0 4px 0; color: #721c24;">⚠️ Visible Hazards</p>
                                        <ul style="margin: 0; padding: 0 0 0 16px; font-size: 12px; color: #721c24;">
                                            ${hazards.visibleHazards.map(h => `<li>${h}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        
                        <div style="background: var(--bg-secondary); border-radius: 12px; padding: 16px;">
                            <p style="font-size: 12px; font-weight: 600; margin: 0 0 12px 0; color: var(--text);">Property Details</p>
                            
                            <div style="display: grid; gap: 8px;">
                                ${hazards.numStories ? `
                                    <div style="display: flex; justify-content: space-between;">
                                        <span style="font-size: 14px;">📊 Stories:</span>
                                        <span style="font-size: 14px; font-weight: 600;">${hazards.numStories}</span>
                                    </div>
                                ` : ''}
                                ${hazards.roofType ? `
                                    <div style="display: flex; justify-content: space-between;">
                                        <span style="font-size: 14px;">🏠 Roof Material:</span>
                                        <span style="font-size: 14px; font-weight: 600;">${String(hazards.roofType).replace(/_/g, ' ')}</span>
                                    </div>
                                ` : ''}
                                ${hazards.roofShape ? `
                                    <div style="display: flex; justify-content: space-between;">
                                        <span style="font-size: 14px;">🏗️ Roof Shape:</span>
                                        <span style="font-size: 14px; font-weight: 600;">${hazards.roofShape}</span>
                                    </div>
                                ` : ''}
                                ${hazards.roofConditionScore ? `
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-size: 14px;">🔍 Roof Condition:</span>
                                        <span style="font-size: 14px; font-weight: 600; color: ${hazards.roofConditionScore >= 7 ? '#28a745' : hazards.roofConditionScore >= 4 ? '#ffc107' : '#dc3545'};">${hazards.roofConditionScore}/10 ${hazards.roofConditionScore >= 7 ? '(Good)' : hazards.roofConditionScore >= 4 ? '(Fair)' : '(Poor)'}</span>
                                    </div>
                                ` : ''}
                                ${hazards.garageSpaces ? `
                                    <div style="display: flex; justify-content: space-between;">
                                        <span style="font-size: 14px;">🚗 Garage Doors:</span>
                                        <span style="font-size: 14px; font-weight: 600;">${hazards.garageSpaces}</span>
                                    </div>
                                ` : ''}
                                ${hazards.notes ? `
                                    <div style="margin-top: 8px; padding: 8px; background: var(--bg); border-radius: 6px;">
                                        <p style="font-size: 11px; font-weight: 600; margin: 0 0 4px 0; color: var(--text-secondary);">📝 Underwriter Notes</p>
                                        <p style="font-size: 12px; margin: 0; color: var(--text);">${hazards.notes}</p>
                                    </div>
                                ` : ''}
                                ${!hazards.numStories && !hazards.roofType && !hazards.roofShape && !hazards.garageSpaces ? `
                                    <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">No additional details detected in satellite image.</p>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="App.closeHazardModal()">Cancel</button>
                        <button class="btn-primary" onclick="App.applyHazardDetections()">✅ Apply to Form</button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if present
        const existing = document.getElementById('hazardDetectionModal');
        if (existing) existing.remove();
        
        // Add to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Show modal
        setTimeout(() => {
            document.getElementById('hazardDetectionModal').classList.add('active');
        }, 10);
        
        // Store for later use
        this.detectedHazards = hazards;
    },

    closeHazardModal() {
        const modal = document.getElementById('hazardDetectionModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    },

    applyHazardDetections() {
        // Get user-confirmed hazards from checkboxes
        const pool = document.getElementById('hazard_pool')?.checked || false;
        const trampoline = document.getElementById('hazard_trampoline')?.checked || false;
        const deck = document.getElementById('hazard_deck')?.checked || false;
        const applied = [];

        // Apply hazards to form
        if (pool) {
            this.data.pool = 'In Ground';
            const poolEl = document.getElementById('pool');
            if (poolEl) {
                poolEl.value = 'In Ground';
                this.markAutoFilled(poolEl, 'hazard');
            }
            applied.push('Pool');
        }

        if (trampoline) {
            this.data.trampoline = 'Yes';
            const trampolineEl = document.getElementById('trampoline');
            if (trampolineEl) {
                trampolineEl.value = 'Yes';
                this.markAutoFilled(trampolineEl, 'hazard');
            }
            applied.push('Trampoline');
        }

        if (deck) {
            applied.push('Deck/Patio (noted)');
        }

        // Apply property details from detectedHazards
        const h = this.detectedHazards || {};

        if (h.roofShape) {
            const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            const val = capitalize(h.roofShape);
            const el = document.getElementById('roofShape');
            if (el) {
                const options = Array.from(el.options).map(o => o.value);
                if (options.includes(val)) {
                    el.value = val;
                    this.data.roofShape = val;
                    this.markAutoFilled(el, 'hazard');
                    applied.push('Roof Shape: ' + val);
                }
            }
        }

        if (h.roofType) {
            const roofMap = {
                'asphalt': 'Asphalt/Composite Shingle',
                'composition_shingle': 'Asphalt/Composite Shingle',
                'architectural_shingle': 'Asphalt/Composite Shingle',
                'metal': 'Metal',
                'tile': 'Clay Tile',
                'clay_tile': 'Clay Tile',
                'concrete_tile': 'Concrete Tile',
                'flat': 'Tar & Gravel',
                'flat_membrane': 'Tar & Gravel',
                'wood_shake': 'Wood Shake/Shingle',
                'slate': 'Slate',
            };
            const mapped = roofMap[h.roofType.toLowerCase()] || roofMap[h.roofType.toLowerCase().replace(/_/g, ' ')] || null;
            if (mapped) {
                const el = document.getElementById('roofType');
                if (el) {
                    const options = Array.from(el.options).map(o => o.value);
                    if (options.includes(mapped)) {
                        el.value = mapped;
                        this.data.roofType = mapped;
                        this.markAutoFilled(el, 'hazard');
                        applied.push('Roof Type: ' + mapped);
                    }
                }
            }
        }

        if (h.numStories) {
            const val = parseInt(String(h.numStories).replace('+', ''));
            if (val > 0 && val <= 5) {
                const el = document.getElementById('numStories');
                if (el) {
                    el.value = val;
                    this.data.numStories = val;
                    this.markAutoFilled(el, 'hazard');
                    applied.push('Stories: ' + val);
                }
            }
        }

        // Save to localStorage
        this.save({ target: { id: 'pool', value: this.data.pool || '' } });

        // Show confirmation
        this.toast(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'No detections applied', 4000);

        // Close modal
        this.closeHazardModal();
    },

    // Phase 4: Vision Processing Methods
    
    async processVisionImage(imageFile) {
        /**
         * Process a property image (roof, foundation, exterior, etc.)
         * Sends base64-encoded image to vision-processor.js
         */
        if (!imageFile) return null;
        
        const reader = new FileReader();
        return new Promise((resolve) => {
            reader.onload = async (e) => {
                const base64Data = e.target.result.split(',')[1];
                
                try {
                    const response = await fetch('/api/vision-processor.js', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'processImage',
                            base64Data: base64Data,
                            mimeType: imageFile.type || 'image/jpeg',
                            imageType: 'property',
                            county: this.getCountyFromCity(this.data.addrCity, this.data.addrState)
                        })
                    });
                    
                    const result = await response.json();
                    resolve(result);
                } catch (error) {
                    console.error('Vision image processing error:', error);
                    resolve({ success: false, error: error.message });
                }
            };
            reader.readAsDataURL(imageFile);
        });
    },

    async processVisionPDF(pdfFile, documentType = 'tax_summary') {
        /**
         * Process a property document PDF (tax summary, assessment, etc.)
         * Sends base64-encoded PDF to vision-processor.js
         */
        if (!pdfFile) return null;
        
        const reader = new FileReader();
        return new Promise((resolve) => {
            reader.onload = async (e) => {
                const base64Data = e.target.result.split(',')[1];
                
                try {
                    const response = await fetch('/api/vision-processor.js', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'processPDF',
                            base64Data: base64Data,
                            documentType: documentType,
                            county: this.getCountyFromCity(this.data.addrCity, this.data.addrState)
                        })
                    });
                    
                    const result = await response.json();
                    resolve(result);
                } catch (error) {
                    console.error('Vision PDF processing error:', error);
                    resolve({ success: false, error: error.message });
                }
            };
            reader.readAsDataURL(pdfFile);
        });
    },

    async analyzeAerialImage(lat, lng) {
        /**
         * Analyze satellite/aerial image for hazard assessment
         * Uses Google Satellite imagery for flood, wildfire, wind hazards
         */
        if (!lat || !lng) return null;
        
        try {
            // Get satellite image first (using existing Google Maps API)
            const mapsKey = this._geminiApiKey || localStorage.getItem('gemini_api_key') || '';
            const imageUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=18&size=640x640&maptype=satellite&key=${mapsKey}`;
            
            // Fetch image and convert to base64
            const imageResponse = await fetch(imageUrl);
            const blob = await imageResponse.blob();
            const reader = new FileReader();
            
            return new Promise((resolve) => {
                reader.onload = async (e) => {
                    const base64Data = e.target.result.split(',')[1];
                    
                    try {
                        const response = await fetch('/api/vision-processor.js', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'analyzeAerial',
                                base64Data: base64Data,
                                lat: lat,
                                lng: lng,
                                county: this.getCountyFromCity(this.data.addrCity, this.data.addrState)
                            })
                        });
                        
                        const result = await response.json();
                        resolve(result);
                    } catch (error) {
                        console.error('Aerial analysis error:', error);
                        resolve({ success: false, error: error.message, hazards: [] });
                    }
                };
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Aerial image retrieval error:', error);
            return { success: false, error: error.message, hazards: [] };
        }
    },

    async consolidateVisionData(visionResults) {
        /**
         * Consolidate results from multiple vision processing calls
         * Returns standardized property data
         */
        if (!visionResults) return null;
        
        try {
            const response = await fetch('/api/vision-processor.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'consolidate',
                    visionResults: visionResults
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Vision data consolidation error:', error);
            return null;
        }
    },

    showVisionResultsPopup(visionData, imageType) {
        /**
         * Display vision processing results in popup
         * Allows user to confirm and apply extracted data
         */
        if (!visionData || !visionData.success) {
            alert('❌ Vision processing failed. Please try again.');
            return;
        }
        
        const modal = document.createElement('div');
        modal.id = 'visionResultsModal';
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            font-family: system-ui, sans-serif;
        `;
        
        const title = document.createElement('h2');
        title.textContent = `👁️ Vision Analysis Results (${imageType})`;
        title.style.cssText = 'margin: 0 0 16px 0; color: #007AFF;';
        
        const dataDiv = document.createElement('div');
        dataDiv.style.cssText = 'background: #f5f5f5; border-radius: 8px; padding: 16px; margin-bottom: 16px;';
        
        let dataHTML = '<p style="margin: 0; font-size: 14px;">';
        const rawData = visionData.rawData || {};
        
        for (const [key, value] of Object.entries(rawData)) {
            if (value && value !== 'N/A' && value !== '') {
                dataHTML += `<strong>${key}:</strong> ${value}<br>`;
            }
        }
        
        dataHTML += '</p>';
        dataDiv.innerHTML = dataHTML;
        
        const confirmDiv = document.createElement('div');
        confirmDiv.style.cssText = 'display: flex; gap: 8px; margin-top: 16px;';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            flex: 1;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background: white;
            color: #333;
            cursor: pointer;
            font-weight: 500;
        `;
        cancelBtn.onclick = () => modal.remove();
        
        const applyBtn = document.createElement('button');
        applyBtn.textContent = '✅ Apply Data';
        applyBtn.style.cssText = `
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: #007AFF;
            color: white;
            cursor: pointer;
            font-weight: 500;
        `;
        applyBtn.onclick = () => {
            this.applyVisionData(rawData);
            modal.remove();
        };
        
        confirmDiv.appendChild(cancelBtn);
        confirmDiv.appendChild(applyBtn);
        
        content.appendChild(title);
        content.appendChild(dataDiv);
        content.appendChild(confirmDiv);
        modal.appendChild(content);
        document.body.appendChild(modal);
    },

    applyVisionData(data) {
        /**
         * Apply vision-extracted data to form fields
         */
        const fieldMappings = {
            'year_built': 'yearBuilt',
            'yearBuilt': 'yearBuilt',
            'roof_type': 'roofType',
            'roofType': 'roofType',
            'stories': 'numStories',
            'garage_spaces': 'numGarages',
            'garageSpaces': 'numGarages',
            'lot_size': 'lotSize',
            'lotSize': 'lotSize',
            'total_sqft': 'totalSqft',
            'totalSqft': 'totalSqft'
        };
        
        for (const [visionKey, formKey] of Object.entries(fieldMappings)) {
            if (data[visionKey]) {
                const formElement = document.getElementById(formKey);
                if (formElement) {
                    formElement.value = data[visionKey];
                    this.data[formKey] = data[visionKey];
                    this.markAutoFilled(formElement, 'vision');
                    this.save({ target: { id: formKey, value: data[visionKey] } });
                }
            }
        }
        
        alert(`✅ Applied vision data to form`);
    },

    // Phase 5: Historical Data & Comparative Analysis Methods

    async analyzePropertyHistory() {
        /**
         * Analyze property value history and market trends
         * Called from Step 6 or property research section
         */
        const address = this.data.addrStreet || '';
        const city = this.data.addrCity || '';
        const state = this.data.addrState || '';
        const yearBuilt = this.data.yearBuilt || null;
        const county = this.getCountyFromCity(city, state);
        
        if (!address || !city || !state) {
            alert('Please enter a complete address first.');
            return;
        }
        
        try {
            // Show loading state
            const btn = document.getElementById('analyzeHistoryBtn');
            const originalText = btn ? btn.innerHTML : 'Analyzing...';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '📊 Analyzing property history...';
            }
            
            // Call Phase 5: Value history analysis
            const response = await fetch('/api/historical-analyzer.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'analyzeValues',
                    address: address,
                    city: city,
                    state: state,
                    county: county,
                    yearBuilt: yearBuilt ? parseInt(yearBuilt) : null
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showHistoryAnalysisPopup(result.data, address, city, state);
            } else {
                alert(`❌ History analysis failed: ${result.error || 'Unknown error'}`);
            }
            
            // Reset button
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Property history analysis error:', error);
            alert('❌ Failed to analyze property history.');
            const btn = document.getElementById('analyzeHistoryBtn');
            if (btn) btn.disabled = false;
        }
    },

    async analyzeInsuranceTrends() {
        /**
         * Analyze historical insurance rates and trends
         */
        const city = this.data.addrCity || '';
        const state = this.data.addrState || '';
        const county = this.getCountyFromCity(city, state);
        
        if (!county || !state) {
            alert('Please enter a complete address first.');
            return;
        }
        
        try {
            const btn = document.getElementById('analyzeInsuranceBtn');
            const originalText = btn ? btn.innerHTML : 'Analyzing...';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '📈 Analyzing insurance trends...';
            }
            
            const response = await fetch('/api/historical-analyzer.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'analyzeInsurance',
                    city: city,
                    state: state,
                    county: county,
                    riskLevel: 'all'
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showInsuranceAnalysisPopup(result.data, county, state);
            } else {
                alert(`❌ Insurance analysis failed: ${result.error || 'Unknown error'}`);
            }
            
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Insurance analysis error:', error);
            alert('❌ Failed to analyze insurance trends.');
            const btn = document.getElementById('analyzeInsuranceBtn');
            if (btn) btn.disabled = false;
        }
    },

    async compareToMarket() {
        /**
         * Compare property to market baseline and comparables
         */
        const city = this.data.addrCity || '';
        const state = this.data.addrState || '';
        const county = this.getCountyFromCity(city, state);
        const yearBuilt = this.data.yearBuilt || null;
        // Estimate property value if not provided
        const propertyValue = parseInt(this.data.propertyValue) || 500000;
        const sqft = parseInt(this.data.totalSqft) || null;
        
        if (!city || !state) {
            alert('Please enter a complete address first.');
            return;
        }
        
        try {
            const btn = document.getElementById('compareMarketBtn');
            const originalText = btn ? btn.innerHTML : 'Comparing...';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '🔍 Comparing to market...';
            }
            
            const response = await fetch('/api/historical-analyzer.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'compareMarket',
                    city: city,
                    state: state,
                    county: county,
                    propertyValue: propertyValue,
                    yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
                    sqft: sqft
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showMarketComparisonPopup(result.data, city, state);
            } else {
                alert(`❌ Market comparison failed: ${result.error || 'Unknown error'}`);
            }
            
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Market comparison error:', error);
            alert('❌ Failed to compare to market.');
            const btn = document.getElementById('compareMarketBtn');
            if (btn) btn.disabled = false;
        }
    },

    async generatePropertyTimeline() {
        /**
         * Generate comprehensive property timeline report
         */
        const address = this.data.addrStreet || '';
        const city = this.data.addrCity || '';
        const state = this.data.addrState || '';
        const county = this.getCountyFromCity(city, state);
        const yearBuilt = this.data.yearBuilt || null;
        const propertyValue = parseInt(this.data.propertyValue) || 500000;
        const sqft = parseInt(this.data.totalSqft) || null;
        
        if (!address || !city || !state) {
            alert('Please enter a complete address first.');
            return;
        }
        
        try {
            const btn = document.getElementById('timelineBtn');
            const originalText = btn ? btn.innerHTML : 'Generating...';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '📅 Generating timeline...';
            }
            
            const response = await fetch('/api/historical-analyzer.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generateTimeline',
                    address: address,
                    city: city,
                    state: state,
                    county: county,
                    yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
                    propertyValue: propertyValue,
                    sqft: sqft
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showTimelinePopup(result.data, address, city, state);
            } else {
                alert(`❌ Timeline generation failed: ${result.error || 'Unknown error'}`);
            }
            
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Timeline generation error:', error);
            alert('❌ Failed to generate timeline.');
            const btn = document.getElementById('timelineBtn');
            if (btn) btn.disabled = false;
        }
    },

    showHistoryAnalysisPopup(data, address, city, state) {
        /**
         * Display property value history analysis
         */
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 600px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            font-family: system-ui, sans-serif;
        `;
        
        const title = document.createElement('h2');
        title.textContent = '📊 Property Value History';
        title.style.cssText = 'margin: 0 0 16px 0; color: #28a745;';
        
        const addressLine = document.createElement('p');
        addressLine.style.cssText = 'color: #666; margin: 0 0 24px 0; font-size: 14px;';
        addressLine.textContent = `${address}, ${city}, ${state}`;
        
        const historyDiv = document.createElement('div');
        historyDiv.style.cssText = 'margin-bottom: 24px;';
        
        if (data.valueHistory) {
            let historyHTML = '<p style="font-weight: 600; margin-bottom: 12px;">Estimated Values Over Time:</p>';
            historyHTML += '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
            historyHTML += '<tr style="background: #f5f5f5;"><th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Time Period</th><th style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">Est. Value</th></tr>';
            
            if (data.valueHistory.tenYearsAgo) {
                historyHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">10 years ago</td><td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee;">$${data.valueHistory.tenYearsAgo.estimatedValue?.toLocaleString()}</td></tr>`;
            }
            if (data.valueHistory.fiveYearsAgo) {
                historyHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">5 years ago</td><td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee;">$${data.valueHistory.fiveYearsAgo.estimatedValue?.toLocaleString()}</td></tr>`;
            }
            if (data.valueHistory.current) {
                historyHTML += `<tr><td style="padding: 8px; font-weight: 600; background: #fff3cd;">Current</td><td style="text-align: right; padding: 8px; font-weight: 600; background: #fff3cd;">$${data.valueHistory.current.estimatedValue?.toLocaleString()}</td></tr>`;
            }
            
            historyHTML += '</table>';
            historyDiv.innerHTML = historyHTML;
        }
        
        if (data.appreciationRate) {
            const rateDiv = document.createElement('div');
            rateDiv.style.cssText = 'background: #e8f5e9; border-radius: 8px; padding: 16px; margin-bottom: 16px;';
            rateDiv.innerHTML = `
                <p style="margin: 0 0 8px 0; font-weight: 600;">Appreciation Rate</p>
                <p style="margin: 0; font-size: 14px;">Annual Average: <strong>${(data.appreciationRate.annualAverage * 100).toFixed(1)}%</strong></p>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #666;">${data.appreciationRate.comparison}</p>
            `;
            content.appendChild(rateDiv);
        }
        
        if (data.currentTrend) {
            const trendDiv = document.createElement('div');
            trendDiv.style.cssText = 'background: #e3f2fd; border-radius: 8px; padding: 16px; margin-bottom: 16px;';
            trendDiv.innerHTML = `
                <p style="margin: 0 0 8px 0; font-weight: 600;">Current Market Trend</p>
                <p style="margin: 0; font-size: 14px;">${data.currentTrend}</p>
            `;
            content.appendChild(trendDiv);
        }
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✓ Close';
        closeBtn.style.cssText = `
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: #007AFF;
            color: white;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
        `;
        closeBtn.onclick = () => modal.remove();
        
        content.appendChild(addressLine);
        content.appendChild(historyDiv);
        content.appendChild(closeBtn);
        modal.appendChild(content);
        document.body.appendChild(modal);
    },

    showInsuranceAnalysisPopup(data, county, state) {
        /**
         * Display insurance analysis and trends
         */
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 600px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            font-family: system-ui, sans-serif;
        `;
        
        const title = document.createElement('h2');
        title.textContent = '📈 Insurance Trends Analysis';
        title.style.cssText = 'margin: 0 0 8px 0; color: #ff9800;';
        
        const subtitle = document.createElement('p');
        subtitle.textContent = `${county} County, ${state}`;
        subtitle.style.cssText = 'margin: 0 0 24px 0; color: #666; font-size: 14px;';
        
        if (data.homeownersInsurance) {
            const insuranceDiv = document.createElement('div');
            insuranceDiv.style.cssText = 'background: #fff3e0; border-radius: 8px; padding: 16px; margin-bottom: 16px;';
            insuranceDiv.innerHTML = `
                <p style="margin: 0 0 8px 0; font-weight: 600;">Homeowners Insurance Trend</p>
                <p style="margin: 0; font-size: 14px;"><strong>${data.homeownersInsurance.trend}</strong></p>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #666;">Causes: ${data.homeownersInsurance.causes?.join(', ') || 'Multiple factors'}</p>
            `;
            content.appendChild(insuranceDiv);
        }
        
        if (data.ratePrediction) {
            const predictionDiv = document.createElement('div');
            predictionDiv.style.cssText = 'background: #f3e5f5; border-radius: 8px; padding: 16px; margin-bottom: 16px;';
            predictionDiv.innerHTML = `
                <p style="margin: 0 0 8px 0; font-weight: 600;">Rate Prediction (Next 3 Years)</p>
                <p style="margin: 0; font-size: 14px;"><strong>${data.ratePrediction.nextThreeYears}</strong></p>
                <p style="margin: 8px 0 0 0; font-size: 13px; font-weight: 600;">Mitigation:</p>
                <ul style="margin: 4px 0 0 0; padding-left: 20px; font-size: 13px;">
                    ${data.ratePrediction.mitigation?.map(m => `<li>${m}</li>`).join('') || '<li>Consult with insurance agent</li>'}
                </ul>
            `;
            content.appendChild(predictionDiv);
        }
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✓ Close';
        closeBtn.style.cssText = `
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: #007AFF;
            color: white;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            margin-top: 16px;
        `;
        closeBtn.onclick = () => modal.remove();
        
        content.appendChild(title);
        content.appendChild(subtitle);
        content.appendChild(closeBtn);
        modal.appendChild(content);
        document.body.appendChild(modal);
    },

    showMarketComparisonPopup(data, city, state) {
        /**
         * Display market comparison and positioning
         */
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 600px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            font-family: system-ui, sans-serif;
        `;
        
        const title = document.createElement('h2');
        title.textContent = '🔍 Market Comparison';
        title.style.cssText = 'margin: 0 0 8px 0; color: #1976d2;';
        
        const subtitle = document.createElement('p');
        subtitle.textContent = `${city}, ${state}`;
        subtitle.style.cssText = 'margin: 0 0 24px 0; color: #666; font-size: 14px;';
        
        if (data.valuationAssessment) {
            const assessmentDiv = document.createElement('div');
            assessmentDiv.style.cssText = 'background: #e8f5e9; border-radius: 8px; padding: 16px; margin-bottom: 16px;';
            assessmentDiv.innerHTML = `
                <p style="margin: 0 0 8px 0; font-weight: 600;">Valuation Assessment</p>
                <p style="margin: 0; font-size: 14px;"><strong>Price/SqFt: $${data.valuationAssessment.pricePerSqft}</strong> (Market Avg: $${data.valuationAssessment.marketAverage})</p>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #666;">${data.valuationAssessment.assessment}</p>
            `;
            content.appendChild(assessmentDiv);
        }
        
        if (data.neighborhoodPositioning) {
            const positionDiv = document.createElement('div');
            positionDiv.style.cssText = 'background: #e3f2fd; border-radius: 8px; padding: 16px; margin-bottom: 16px;';
            positionDiv.innerHTML = `
                <p style="margin: 0 0 8px 0; font-weight: 600;">Neighborhood Positioning</p>
                <p style="margin: 0; font-size: 14px;"><strong>Similar Properties:</strong> $${data.neighborhoodPositioning.similar?.range || 'N/A'}</p>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #666;"><strong>Trend:</strong> ${data.neighborhoodPositioning.trend}</p>
            `;
            content.appendChild(positionDiv);
        }
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✓ Close';
        closeBtn.style.cssText = `
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: #007AFF;
            color: white;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            margin-top: 16px;
        `;
        closeBtn.onclick = () => modal.remove();
        
        content.appendChild(title);
        content.appendChild(subtitle);
        content.appendChild(closeBtn);
        modal.appendChild(content);
        document.body.appendChild(modal);
    },

    showTimelinePopup(data, address, city, state) {
        /**
         * Display property timeline report
         */
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 700px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            font-family: system-ui, sans-serif;
        `;
        
        const title = document.createElement('h2');
        title.textContent = '📅 Property Timeline Report';
        title.style.cssText = 'margin: 0 0 16px 0; color: #9c27b0;';
        
        const addressLine = document.createElement('p');
        addressLine.style.cssText = 'color: #666; margin: 0 0 24px 0; font-size: 14px;';
        addressLine.textContent = `${address}, ${city}, ${state}`;
        
        if (data.timeline && Array.isArray(data.timeline)) {
            let timelineHTML = '';
            data.timeline.forEach((item, idx) => {
                timelineHTML += `
                    <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
                        <p style="margin: 0 0 4px 0; font-weight: 600; color: #333;">🕐 ${item.year}</p>
                        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 500;">${item.event}</p>
                        <p style="margin: 0 0 4px 0; font-size: 13px; color: #666;">${item.context}</p>
                        <p style="margin: 0; font-size: 13px; color: #1976d2;"><strong>Relevance:</strong> ${item.relevance}</p>
                    </div>
                `;
            });
            content.innerHTML += timelineHTML;
        }
        
        if (data.valueProjection) {
            const projectionDiv = document.createElement('div');
            projectionDiv.style.cssText = 'background: #f5f5f5; border-radius: 8px; padding: 16px; margin-bottom: 16px;';
            projectionDiv.innerHTML = `
                <p style="margin: 0 0 12px 0; font-weight: 600;">Value Projections</p>
                <table style="width: 100%; font-size: 13px;">
                    <tr><td>Current:</td><td style="text-align: right;"><strong>$${data.valueProjection.current?.toLocaleString()}</strong></td></tr>
                    <tr><td>5 Years:</td><td style="text-align: right;">$${data.valueProjection.fiveYears?.toLocaleString()}</td></tr>
                    <tr><td>10 Years:</td><td style="text-align: right;">$${data.valueProjection.tenYears?.toLocaleString()}</td></tr>
                </table>
            `;
            content.appendChild(projectionDiv);
        }
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✓ Close';
        closeBtn.style.cssText = `
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: #007AFF;
            color: white;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            margin-top: 16px;
        `;
        closeBtn.onclick = () => modal.remove();
        
        content.appendChild(title);
        content.appendChild(addressLine);
        content.appendChild(closeBtn);
        modal.appendChild(content);
        document.body.appendChild(modal);
    },

    showDataPreview(data, sources, conflicts = {}, satelliteImage = null, address = '') {
        // Create modal HTML
        const modalHTML = `
            <div class="modal-overlay" id="dataPreviewModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>📋 Review Extracted Data</h2>
                        <p style="font-size: 13px; color: var(--text-secondary); margin: 8px 0 0 0;">
                            Review and edit before applying to form
                        </p>
                    </div>
                    <div class="modal-body" id="dataPreviewBody">
                        ${satelliteImage ? this.renderSatelliteSection(satelliteImage, address) : ''}
                        ${this.renderDataItems(data, conflicts)}
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="App.closeDataPreview()">Cancel</button>
                        <button class="btn-primary" onclick="App.applyPreviewData()">✅ Apply Selected Data</button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if present
        const existing = document.getElementById('dataPreviewModal');
        if (existing) existing.remove();
        
        // Add to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Show modal
        setTimeout(() => {
            document.getElementById('dataPreviewModal').classList.add('active');
        }, 10);
        
        // Store data for later use
        this.previewData = data;
        this.previewConflicts = conflicts;
        this.previewAddress = address;
    },

    renderSatelliteSection(satelliteImage, address) {
        const googleMapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}`;
        const googleEarthUrl = `https://earth.google.com/web/search/${encodeURIComponent(address)}`;
        
        return `
            <div class="satellite-section">
                <p style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: var(--text);">🛰️ Satellite View</p>
                <img 
                    src="data:image/png;base64,${satelliteImage}" 
                    class="satellite-thumbnail" 
                    onclick="App.viewSatelliteFullscreen(this.src)"
                    title="Click to view fullscreen"
                >
                <p class="satellite-label">Tap to view fullscreen</p>
                <div class="satellite-links">
                    <a href="${googleMapsUrl}" target="_blank">📍 Google Maps</a>
                    <a href="${googleEarthUrl}" target="_blank">🌍 Google Earth</a>
                </div>
            </div>
        `;
    },

    viewSatelliteFullscreen(imageSrc) {
        const modal = `
            <div class="modal-overlay" id="fullscreenImageModal" style="display: flex;">
                <div style="position: relative; max-width: 90%; max-height: 90%; display: flex; align-items: center; justify-content: center;">
                    <img src="${imageSrc}" style="max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                    <button onclick="document.getElementById('fullscreenImageModal').remove()" 
                            style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer;">
                        ✕
                    </button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modal);
        document.getElementById('fullscreenImageModal').classList.add('active');
    },

    renderDataItems(data, conflicts) {
        const fieldLabels = {
            yrBuilt: 'Year Built',
            sqFt: 'Square Footage',
            numStories: 'Number of Stories',
            fullBaths: 'Full Bathrooms',
            dwellingType: 'Dwelling Type',
            dwellingUsage: 'Dwelling Usage',
            constructionStyle: 'Construction Style',
            exteriorWalls: 'Exterior Walls',
            roofType: 'Roof Type',
            roofYr: 'Roof Year',
            roofShape: 'Roof Shape',
            heatingType: 'Heating Type',
            foundation: 'Foundation Type',
            pool: 'Pool',
            trampoline: 'Trampoline',
            fireplace: 'Fireplace',
            garageSpaces: 'Garage Spaces',
            lotSize: 'Lot Size'
        };
        
        let html = '';
        
        for (const [key, label] of Object.entries(fieldLabels)) {
            const value = data[key];
            const conflict = conflicts?.[key];
            
            if (!value && !conflict) continue;
            
            const hasConflict = conflict && conflict.length > 1;
            
            html += `
                <div class="data-item ${hasConflict ? 'conflict' : ''}">
                    <div class="data-item-header">
                        <span class="data-item-label">${label}</span>
                        ${hasConflict ? '<span class="conflict-badge">⚠️ Conflict</span>' : ''}
                    </div>
                    <div class="data-value-group">
            `;
            
            if (hasConflict) {
                // Show all conflicting values with radio buttons
                conflict.forEach((option, idx) => {
                    const checked = idx === 0 ? 'checked' : '';
                    html += `
                        <div class="data-value-option">
                            <input type="radio" name="field_${key}" value="${option.value}" id="${key}_${idx}" ${checked}>
                            <label for="${key}_${idx}">${option.value}</label>
                            <span class="source-tag">${option.source}</span>
                        </div>
                    `;
                });
                // Add manual edit option
                html += `
                    <div class="data-value-option">
                        <input type="radio" name="field_${key}" value="custom" id="${key}_custom">
                        <input type="text" id="${key}_custom_value" placeholder="Enter custom value" 
                               onclick="document.getElementById('${key}_custom').checked = true">
                    </div>
                `;
            } else {
                // Single value - show as editable input
                const source = data[key + '_source'] || 'Smart';
                html += `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="text" class="data-value" id="field_${key}" value="${value}">
                        <span class="data-source">${source}</span>
                    </div>
                `;
            }
            
            html += `
                    </div>
                </div>
            `;
        }
        
        return html || '<p style="text-align: center; color: var(--text-secondary);">No data extracted</p>';
    },

    closeDataPreview() {
        const modal = document.getElementById('dataPreviewModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    },

    applyPreviewData() {
        const fieldsUpdated = [];
        
        // Get all data items
        const dataItems = document.querySelectorAll('.data-item');
        
        dataItems.forEach(item => {
            const label = item.querySelector('.data-item-label').textContent;
            const isConflict = item.classList.contains('conflict');
            
            if (isConflict) {
                // Get selected radio button value
                const radios = item.querySelectorAll('input[type="radio"]');
                const selected = Array.from(radios).find(r => r.checked);
                
                if (selected) {
                    const fieldKey = selected.name.replace('field_', '');
                    let value;
                    
                    if (selected.value === 'custom') {
                        value = document.getElementById(fieldKey + '_custom_value').value;
                    } else {
                        value = selected.value;
                    }
                    
                    if (value) {
                        this.setFieldValue(fieldKey, value);
                        fieldsUpdated.push(label);
                    }
                }
            } else {
                // Get input value directly
                const input = item.querySelector('.data-value');
                if (input && input.value) {
                    const fieldKey = input.id.replace('field_', '');
                    this.setFieldValue(fieldKey, input.value);
                    fieldsUpdated.push(label);
                }
            }
        });
        
        this.closeDataPreview();
        
        if (fieldsUpdated.length > 0) {
            alert(`✅ Applied ${fieldsUpdated.length} fields!\n\n${fieldsUpdated.join('\n')}`);
            this.updateScanCoverage();
        }
    },

});
