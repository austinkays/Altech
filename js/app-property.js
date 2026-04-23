// js/app-property.js — Property research, GIS intelligence, map utilities, parcel popups
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {

    // ── Block 1: Map/address utilities (originally ~L4825-4953) ──

    async smartAutoFill() {
        const address = this.data.addrStreet || '';
        const city = this.data.addrCity || '';
        const state = this.data.addrState || '';
        const zip = this.data.addrZip || '';

        if (!address || !city || !state) {
            this.toast('Please enter a complete address (street, city, and state) first.', 'error');
            return;
        }

        const btn = document.getElementById('smartFillBtn');
        const originalText = btn.innerHTML;
        const county = this.getCountyFromCity(city, state);

        // Auto-fill county if we can resolve it and it's not already set
        if (county) {
            const countyEl = document.getElementById('county');
            if (countyEl && !countyEl.value) {
                countyEl.value = county;
                this.data.county = county;
                localStorage.setItem(this.storageKey, JSON.stringify(this.data));
                console.log('[SmartScan] Auto-filled county:', county);
            }
        }

        // ── Rentcast usage check ──────────────────────────────────
        const { count: _rentcastCount, periodDay: _rentcastPeriodDay } = await this._getRentcastCounter();
        this._updateRentcastDisplay(_rentcastCount, _rentcastPeriodDay);
        let _skipRentcast = false;
        if (_rentcastCount >= 50) {
            const _choice = await this._showRentcastOverageModal(_rentcastCount);
            if (_choice === 'skip') {
                _skipRentcast = true;
            } else {
                await this._logRentcastOverage(
                    `${address}, ${city}, ${state} ${zip}`.trim(),
                    _rentcastCount
                );
            }
        }

        try {
            btn.disabled = true;
            btn.innerHTML = '🔄 Gathering property data from all sources...';

            // Fire ALL enrichment sources in parallel, including satellite/Street View vision.
            // Vision fills gaps that Rentcast/ArcGIS miss (notably exteriorWalls + roofShape).
            const [arcgisResult, zillowResult, fireStationResult, visualResult] = await Promise.allSettled([
                this.fetchArcgisAndRag(address, city, state, county),
                _skipRentcast ? Promise.resolve(null) : this.fetchZillowData(address, city, state, zip),
                this.fetchFireStationData(address, city, state, zip),
                this.fetchVisualData(address, city, state, zip)
            ]);

            let arcgisData = arcgisResult.status === 'fulfilled' ? arcgisResult.value : null;
            let zillowData = zillowResult.status === 'fulfilled' ? zillowResult.value : null;
            const fireData = fireStationResult.status === 'fulfilled' ? fireStationResult.value : null;
            const visualData = visualResult.status === 'fulfilled' ? visualResult.value : null;

            // Increment counter and update display on confirmed Rentcast hit
            if (zillowData?.source?.includes('Rentcast')) {
                await this._incrementRentcastCounter();
                const { count: _newCount, periodDay: _newPeriodDay } = await this._getRentcastCounter();
                this._updateRentcastDisplay(_newCount, _newPeriodDay);
            }

            const floodData = arcgisData?.floodData || null;

            console.log('[SmartFill] Results:', {
                arcgis: arcgisData ? arcgisData.source : 'none',
                zillow: zillowData ? zillowData.source : 'none',
                fire: fireData ? 'ok' : 'none',
                flood: floodData ? floodData.floodZone : 'none',
                vision: visualData ? (visualData.data ? 'ok' : 'empty') : 'none'
            });

            // If no property details (only fire data), try direct Gemini property search
            if (!arcgisData && !zillowData) {
                btn.innerHTML = '🔄 Searching property records…';
                try {
                    const geminiProperty = await this.fetchPropertyViaGemini(address, city, state, zip);
                    if (geminiProperty) {
                        zillowData = geminiProperty; // Slot into zillow position for unified popup
                        console.log('[SmartFill] Gemini direct property search found data');
                    }
                } catch (e) {
                    console.warn('[SmartFill] Gemini direct search failed:', e.message);
                }
            }

            // If we have any structured data OR vision data, show unified popup
            if (arcgisData || zillowData || fireData || visualData) {
                btn.innerHTML = originalText;
                btn.disabled = false;
                this.showUnifiedDataPopup(arcgisData, zillowData, fireData, address, city, state, floodData, visualData);
                return;
            }

            // No data from ANY source — give the user an actionable error
            throw new Error('No property data found across parcel, listings, and visual sources.');

        } catch (error) {
            console.error('Smart auto-fill error:', error);
            btn.innerHTML = '❌ Failed';
            this.toast('Failed to retrieve property data. Try manually entering details or using Redfin lookup.', 'error');

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 3000);
        }
    },

    // Helper: ArcGIS + RAG pipeline (internal sequential dependency)
    async fetchArcgisAndRag(address, city, state, county) {
        try {
            const arcgisResponse = await fetch('/api/property-intelligence?mode=arcgis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, city, state, county })
            });
            if (!arcgisResponse.ok) return null;
            const arcgisData = await arcgisResponse.json();
            if (!arcgisData.success || !arcgisData.parcelData) {
                console.warn('[ArcGIS] No parcel data:', arcgisData.error || 'Unknown error');
                return null;
            }

            const floodData = arcgisData.floodData || null;

            // Try RAG interpretation
            const ragResponse = await fetch('/api/property-intelligence?mode=rag-interpret', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawParcelData: arcgisData.parcelData, county, aiSettings: window.AIProvider?.getSettings() })
            });
            if (ragResponse.ok) {
                const ragData = await ragResponse.json();
                if (ragData.success && ragData.parcelData) {
                    return { data: ragData.parcelData, source: 'arcgis-rag', confidence: 0.99, floodData };
                }
            }
            // RAG failed, return raw ArcGIS data
            const result = { data: arcgisData.parcelData, source: 'arcgis-raw', confidence: 0.95, floodData };
            // If Clark County enrichment happened, note it
            if (arcgisData.enrichedBy === 'clark-factsheet') {
                result.source = 'arcgis+clark-factsheet';
                result.factSheetFields = arcgisData.factSheetFields;
                console.log(`[ArcGIS] Clark County enriched with: ${arcgisData.factSheetFields?.join(', ')}`);
            }
            return result;
        } catch (e) {
            console.warn('[ArcGIS+RAG] Error:', e.message);
            return null;
        }
    },

    // Helper: Zillow/Gemini property data
    async fetchZillowData(address, city, state, zip) {
        try {
            const resp = await fetch('/api/property-intelligence?mode=zillow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, city, state, zip, aiSettings: window.AIProvider?.getSettings() })
            });
            if (!resp.ok) return null;
            const result = await resp.json();
            if (!result.success || !result.data) {
                console.warn('[Zillow] No data:', result.error);
                return null;
            }
            // Step 9 — log field-level source attribution when present
            if (result.sources) {
                Object.entries(result.sources).forEach(([field, src]) => {
                    if (src) console.log(`[Zillow source] ${field}: ${src}`);
                });
            }
            return { data: result.data, source: result.source, zillowUrl: result.zillowUrl, sources: result.sources || null };
        } catch (e) {
            console.warn('[Zillow] Error:', e.message);
            return null;
        }
    },

    // Helper: Fire station distance
    async fetchFireStationData(address, city, state, zip) {
        try {
            const resp = await fetch('/api/property-intelligence?mode=firestation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, city, state, zip })
            });
            if (!resp.ok) return null;
            const result = await resp.json();
            if (!result.success) {
                console.warn('[FireStation] No data:', result.error);
                return null;
            }
            return {
                fireStationDist: result.fireStationDist,
                fireStationName: result.fireStationName,
                protectionClass: result.protectionClass,
                stationReliability: result.stationReliability || 'responding',
                reviewNote: result.reviewNote || null
            };
        } catch (e) {
            console.warn('[FireStation] Error:', e.message);
            return null;
        }
    },

    // Satellite + Street View vision — extracts structural fields Rentcast misses
    // (exteriorWalls, roofShape) plus hazards (pool, trampoline, tree overhang).
    // Returns null on failure so Promise.allSettled doesn't poison the other sources.
    async fetchVisualData(address, city, state, zip) {
        try {
            const resp = await fetch('/api/property-intelligence?mode=satellite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, city, state, zip, aiSettings: window.AIProvider?.getSettings() })
            });
            if (!resp.ok) return null;
            const result = await resp.json();
            if (!result.success || !result.data) return null;
            return {
                data: result.data,
                satelliteImage: result.satelliteImage || null,
                streetViewImage: result.streetViewImage || null,
                provider: result.aiProvider || 'Gemini'
            };
        } catch (e) {
            console.warn('[Vision] Error:', e.message);
            return null;
        }
    },

    // Direct Gemini property lookup fallback (no server needed)
    async fetchPropertyViaGemini(address, city, state, zip) {
        const key = await this._getGeminiKey();
        if (!key) return null;

        const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
        console.log('[GeminiProperty] Searching for:', fullAddress);

        const prompt = `Find detailed property/home facts for this specific address: ${fullAddress}

Search real estate listings, public records, and property databases for this exact property. I need EVERY available construction and feature detail for insurance underwriting.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure. For each field, return an object with "value" (the data) and "source" (the specific page/listing/record where you found it), or null if not found:
{
  "heating": {"value": "heating system type (e.g. Forced Air, Baseboard, Heat Pump, Boiler, Radiant, Electric)", "source": "e.g. Zillow Facts & Features"} or null,
  "cooling": {"value": "cooling system type (e.g. Central Air, Window Units, None)", "source": "source name"} or null,
  "roofType": {"value": "roof material (e.g. Composition, Asphalt Shingle, Metal, Tile, Wood Shake, Slate)", "source": "source name"} or null,
  "roofYearUpdated": {"value": year_number, "source": "source name"} or null,
  "foundation": {"value": "foundation type (e.g. Crawl Space, Slab, Basement, Pier, Daylight Basement)", "source": "source name"} or null,
  "basementFinishPct": {"value": percentage_number, "source": "source name"} or null,
  "construction": {"value": "construction type (e.g. Wood Frame, Masonry, Brick, Stucco, Log)", "source": "source name"} or null,
  "exterior": {"value": "exterior wall material (e.g. Vinyl Siding, Wood Siding, Brick, Stucco, Fiber Cement, Hardie, Stone)", "source": "source name"} or null,
  "garageType": {"value": "Attached or Detached or Built-in or Carport or None", "source": "source name"} or null,
  "garageSpaces": {"value": number, "source": "source name"} or null,
  "bedrooms": {"value": number, "source": "source name"} or null,
  "bathrooms": {"value": number, "source": "source name"} or null,
  "yearBuilt": {"value": number, "source": "source name"} or null,
  "stories": {"value": number, "source": "source name"} or null,
  "livingArea": {"value": square_feet_number, "source": "source name"} or null,
  "flooring": {"value": "primary flooring (e.g. Hardwood, Carpet, Tile, Laminate, Mixed)", "source": "source name"} or null,
  "fireplaces": {"value": number, "source": "source name"} or null,
  "sewer": {"value": "Public or Septic", "source": "source name"} or null,
  "waterSource": {"value": "Public or Well", "source": "source name"} or null,
  "pool": {"value": "Yes or No", "source": "source name"} or null,
  "woodStove": {"value": "Yes or No", "source": "source name"} or null,
  "notes": "summary of sources used"
}

IMPORTANT: Return null for ANY field you cannot find explicitly stated in the source data. Never infer, estimate, or use typical values for this property type or neighborhood. Only include data for THIS SPECIFIC address.`;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
                {
                    signal: controller.signal,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        tools: [{ google_search: {} }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
                    })
                }
            );
            clearTimeout(timeout);

            if (!res.ok) {
                console.warn('[GeminiProperty] API error:', res.status);
                return null;
            }

            const result = await res.json();
            const allParts = result?.candidates?.[0]?.content?.parts || [];
            const text = allParts.map(p => p.text || '').filter(Boolean).join('');

            if (!text) return null;

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;

            const raw = JSON.parse(jsonMatch[0]);

            // Step 11 — flatten {value, source} objects; backward-compat with plain values
            const flatRaw = {};
            const geminiSources = {};
            for (const [k, v] of Object.entries(raw)) {
                if (v !== null && v !== undefined && typeof v === 'object' && 'value' in v) {
                    if (v.source) console.log(`[GeminiProperty source] ${k}: ${v.source}`);
                    flatRaw[k] = v.value;
                    if (v.source) geminiSources[k] = v.source;
                } else {
                    flatRaw[k] = v;
                }
            }

            const nonNullKeys = Object.keys(flatRaw).filter(k => flatRaw[k] != null && k !== 'notes');
            if (nonNullKeys.length < 2) return null;

            console.log(`[GeminiProperty] Found ${nonNullKeys.length} fields: ${nonNullKeys.join(', ')}`);

            // Map to the format showUnifiedDataPopup expects (same as Zillow data shape)
            const data = {};
            const sources = {};
            function mapSrc(rawKey, mappedKey) { if (geminiSources[rawKey]) sources[mappedKey] = geminiSources[rawKey]; }
            if (flatRaw.heating) { data.heatingType = flatRaw.heating; mapSrc('heating', 'heatingType'); }
            if (flatRaw.cooling) { data.cooling = flatRaw.cooling; mapSrc('cooling', 'cooling'); }
            if (flatRaw.roofType) { data.roofType = flatRaw.roofType; mapSrc('roofType', 'roofType'); }
            if (flatRaw.foundation) { data.foundation = flatRaw.foundation; mapSrc('foundation', 'foundation'); }
            if (flatRaw.construction) { data.constructionStyle = flatRaw.construction; mapSrc('construction', 'constructionStyle'); }
            if (flatRaw.exterior) { data.exteriorWalls = flatRaw.exterior; mapSrc('exterior', 'exteriorWalls'); }
            if (flatRaw.garageSpaces != null) { data.garageSpaces = flatRaw.garageSpaces; mapSrc('garageSpaces', 'garageSpaces'); }
            if (flatRaw.garageType) { data.garageType = flatRaw.garageType; mapSrc('garageType', 'garageType'); }
            if (flatRaw.bedrooms != null) { data.bedrooms = flatRaw.bedrooms; mapSrc('bedrooms', 'bedrooms'); }
            if (flatRaw.bathrooms != null) { data.fullBaths = flatRaw.bathrooms; mapSrc('bathrooms', 'fullBaths'); }
            if (flatRaw.yearBuilt != null) { data.yearBuilt = flatRaw.yearBuilt; data.yrBuilt = flatRaw.yearBuilt; mapSrc('yearBuilt', 'yearBuilt'); }
            if (flatRaw.stories != null) { data.stories = flatRaw.stories; mapSrc('stories', 'stories'); }
            if (flatRaw.livingArea != null) { data.totalSqft = flatRaw.livingArea; mapSrc('livingArea', 'totalSqft'); }
            if (flatRaw.fireplaces != null) { data.numFireplaces = flatRaw.fireplaces; mapSrc('fireplaces', 'numFireplaces'); }
            if (flatRaw.roofYearUpdated != null) { data.roofYr = flatRaw.roofYearUpdated; mapSrc('roofYearUpdated', 'roofYr'); }
            if (flatRaw.basementFinishPct != null) { data.basementFinishPct = flatRaw.basementFinishPct; mapSrc('basementFinishPct', 'basementFinishPct'); }
            if (flatRaw.flooring) { data.flooring = flatRaw.flooring; mapSrc('flooring', 'flooring'); }
            if (flatRaw.sewer) { data.sewer = flatRaw.sewer; mapSrc('sewer', 'sewer'); }
            if (flatRaw.waterSource) { data.waterSource = flatRaw.waterSource; mapSrc('waterSource', 'waterSource'); }
            if (flatRaw.pool) { data.pool = flatRaw.pool; mapSrc('pool', 'pool'); }
            if (flatRaw.woodStove) { data.woodStove = flatRaw.woodStove; mapSrc('woodStove', 'woodStove'); }

            return { data, source: 'gemini-direct', sources: Object.keys(sources).length > 0 ? sources : null };
        } catch (err) {
            console.warn('[GeminiProperty] Error:', err.message);
            return null;
        }
    },

    // Apply Zillow select-field values (dropdown fields that need option matching)
    applyZillowSelects(zd) {
        const selectFields = ['heatingType', 'cooling', 'roofType', 'foundation', 'constructionStyle', 'exteriorWalls', 'garageType', 'sewer', 'waterSource', 'flooring', 'pool', 'woodStove', 'dwellingType'];
        for (const fid of selectFields) {
            if (!zd[fid]) continue;
            const el = document.getElementById(fid);
            if (!el) continue;
            // Only fill if currently empty — don't overwrite parcel data already applied
            if (el.value && el.value.trim()) continue;
            const opts = Array.from(el.options).map(o => o.value);
            if (opts.includes(zd[fid])) {
                el.value = zd[fid];
                this.data[fid] = zd[fid];
                this.markAutoFilled(el, 'zillow');
            }
        }
        // Numeric select fields — need to match option values as strings
        const numericSelects = {
            numStories: zd.stories,
            fullBaths: zd.fullBaths,
            halfBaths: zd.halfBaths,
        };
        for (const [fid, val] of Object.entries(numericSelects)) {
            if (val == null) continue;
            const el = document.getElementById(fid);
            if (!el) continue;
            if (el.value && el.value.trim() && el.value !== '0') continue;
            // Try exact string match, then integer string
            const candidates = [String(val), String(Math.floor(val)), String(Math.round(val))];
            const opts = Array.from(el.options).map(o => o.value);
            const match = candidates.find(c => opts.includes(c));
            if (match) {
                el.value = match;
                this.data[fid] = match;
                this.markAutoFilled(el, 'zillow');
            }
        }
        // Text/number fields from Zillow
        const textFields = {
            yrBuilt: zd.yrBuilt,
            bedrooms: zd.bedrooms,
            garageSpaces: zd.garageSpaces,
            sqFt: zd.totalSqft,
            numFireplaces: zd.numFireplaces,
            roofYr: zd.roofYr,
            lotSize: zd.lotSize,
            county: zd.county,
            yearRenovated: zd.yearRenovated,
        };
        for (const [fid, val] of Object.entries(textFields)) {
            if (val == null) continue;
            const el = document.getElementById(fid);
            if (!el) continue;
            // Only fill if currently empty
            if (el.value && el.value !== '0' && el.value !== '') continue;
            el.value = val;
            this.data[fid] = String(val);
            this.markAutoFilled(el, 'zillow');
        }
    },

    // Apply fire station distance and protection class
    applyFireStationData(fireData) {
        if (fireData.fireStationDist != null) {
            const el = document.getElementById('fireStationDist');
            if (el) {
                el.value = fireData.fireStationDist;
                this.data.fireStationDist = String(fireData.fireStationDist);
                this.markAutoFilled(el, 'fire');
            }
        }
        if (fireData.protectionClass != null) {
            const el = document.getElementById('protectionClass');
            if (el) {
                el.value = fireData.protectionClass;
                this.data.protectionClass = String(fireData.protectionClass);
                this.markAutoFilled(el, 'fire');
            }
        }
    },

    applyParcelData(parcelData) {
        // Auto-fill form fields from official county parcel data
        let fieldsApplied = 0;

        // Basic property info
        if (parcelData.yearBuilt && parcelData.yearBuilt > 0) {
            const field = document.getElementById('yrBuilt');
            if (field) {
                field.value = parcelData.yearBuilt;
                this.data.yrBuilt = parcelData.yearBuilt;
                this.markAutoFilled(field, 'parcel');
                fieldsApplied++;
            }
        }

        if (parcelData.stories && parcelData.stories > 0) {
            const field = document.getElementById('numStories');
            if (field) {
                // Try float directly first (handles "1", "1.5", "2", etc.)
                const storiesStr = String(parseFloat(parcelData.stories));
                field.value = storiesStr;
                // Verify the value was accepted by the select; if empty, try integer fallback
                if (!field.value) {
                    field.value = String(Math.round(parseFloat(parcelData.stories)));
                }
                if (field.value) {
                    this.data.numStories = field.value;
                    this.markAutoFilled(field, 'parcel');
                    fieldsApplied++;
                }
            }
        }

        if (parcelData.totalSqft && parcelData.totalSqft > 0) {
            const field = document.getElementById('sqFt');
            if (field) {
                field.value = parcelData.totalSqft;
                this.data.sqFt = parcelData.totalSqft;
                this.markAutoFilled(field, 'parcel');
                fieldsApplied++;
            }
        }

        if (parcelData.lotSizeAcres && parcelData.lotSizeAcres > 0) {
            const field = document.getElementById('lotSize');
            if (field) {
                field.value = parcelData.lotSizeAcres.toFixed(2);
                this.data.lotSize = parcelData.lotSizeAcres.toFixed(2);
                this.markAutoFilled(field, 'parcel');
                fieldsApplied++;
            }
        }

        // Garage info
        if (parcelData.garageSpaces && parcelData.garageSpaces > 0) {
            const field = document.getElementById('garageSpaces');
            if (field) {
                field.value = parcelData.garageSpaces;
                this.data.garageSpaces = parcelData.garageSpaces;
                this.markAutoFilled(field, 'parcel');
                fieldsApplied++;
            }
        } else if (parcelData.garageSqft && parcelData.garageSqft > 0) {
            // Estimate garage spaces (1 space ≈ 180 sq ft)
            const garageSpaces = Math.round(parcelData.garageSqft / 180);
            const field = document.getElementById('garageSpaces');
            if (field) {
                field.value = garageSpaces;
                this.data.garageSpaces = garageSpaces;
                this.markAutoFilled(field, 'parcel');
                fieldsApplied++;
            }
        }

        // NEW: Bedrooms
        if (parcelData.bedrooms && parcelData.bedrooms > 0) {
            const field = document.getElementById('bedrooms');
            if (field) {
                field.value = parcelData.bedrooms;
                this.data.bedrooms = parcelData.bedrooms;
                this.markAutoFilled(field, 'parcel');
                fieldsApplied++;
            }
        }

        // NEW: Bathrooms
        if (parcelData.bathrooms && parcelData.bathrooms > 0) {
            const field = document.getElementById('fullBaths');
            if (field) {
                // Split into full and half baths (e.g., 2.5 → 2 full, 1 half)
                const fullBaths = Math.floor(parcelData.bathrooms);
                const halfBaths = (parcelData.bathrooms % 1) >= 0.5 ? 1 : 0;
                field.value = fullBaths;
                this.data.fullBaths = fullBaths;
                this.markAutoFilled(field, 'parcel');
                fieldsApplied++;

                const halfField = document.getElementById('halfBaths');
                if (halfField && halfBaths > 0) {
                    halfField.value = halfBaths;
                    this.data.halfBaths = halfBaths;
                    this.markAutoFilled(halfField, 'parcel');
                }
            }
        }

        // NEW: Foundation Type
        if (parcelData.foundationType && parcelData.foundationType !== 'Unknown') {
            const field = document.getElementById('foundation');
            if (field) {
                // Try to match to existing select options
                const options = Array.from(field.options).map(opt => opt.value);
                if (options.includes(parcelData.foundationType)) {
                    field.value = parcelData.foundationType;
                    this.data.foundation = parcelData.foundationType;
                    this.markAutoFilled(field, 'parcel');
                    fieldsApplied++;
                }
            }
        }

        // NEW: Roof Type
        if (parcelData.roofType && parcelData.roofType !== 'Unknown') {
            const field = document.getElementById('roofType');
            if (field) {
                const options = Array.from(field.options).map(opt => opt.value);
                if (options.includes(parcelData.roofType)) {
                    field.value = parcelData.roofType;
                    this.data.roofType = parcelData.roofType;
                    this.markAutoFilled(field, 'parcel');
                    fieldsApplied++;
                }
            }
        }

        // NEW: Heating Type
        if (parcelData.heatingType && parcelData.heatingType !== 'Unknown') {
            const field = document.getElementById('heatingType');
            if (field) {
                const options = Array.from(field.options).map(opt => opt.value);
                if (options.includes(parcelData.heatingType)) {
                    field.value = parcelData.heatingType;
                    this.data.heatingType = parcelData.heatingType;
                    this.markAutoFilled(field, 'parcel');
                    fieldsApplied++;
                }
            }
        }

        // NEW: Construction Style
        if (parcelData.constructionStyle && parcelData.constructionStyle !== 'Unknown') {
            const field = document.getElementById('constructionStyle');
            if (field) {
                const options = Array.from(field.options).map(opt => opt.value);
                if (options.includes(parcelData.constructionStyle)) {
                    field.value = parcelData.constructionStyle;
                    this.data.constructionStyle = parcelData.constructionStyle;
                    this.markAutoFilled(field, 'parcel');
                    fieldsApplied++;
                }
            }
        }

        // Helper: fuzzy-match a value against a <select>'s options (exact, then partial)
        const matchSelectOption = (selectEl, rawValue) => {
            const valLower = String(rawValue).toLowerCase().trim();
            const opts = Array.from(selectEl.options);
            return opts.find(o => o.value.toLowerCase() === valLower) ||
                   opts.find(o => o.value.toLowerCase().includes(valLower) || valLower.includes(o.value.toLowerCase()));
        };

        // Remaining select fields with fuzzy matching
        const additionalSelectFields = [
            { key: 'exteriorWalls', formId: 'exteriorWalls', sentinel: 'Unknown' },
            { key: 'garageType',    formId: 'garageType',    sentinel: 'Unknown' },
            { key: 'cooling',       formId: 'cooling',       sentinel: null },
            { key: 'roofShape',     formId: 'roofShape',     sentinel: null },
            { key: 'flooring',      formId: 'flooring',      sentinel: null },
            { key: 'sewer',         formId: 'sewer',         sentinel: null },
            { key: 'waterSource',   formId: 'waterSource',   sentinel: null },
            { key: 'dwellingType',  formId: 'dwellingType',  sentinel: null },
        ];
        for (const { key, formId, sentinel } of additionalSelectFields) {
            const raw = parcelData[key];
            if (!raw || raw === sentinel) continue;
            const el = document.getElementById(formId);
            if (!el) continue;
            const match = matchSelectOption(el, raw);
            if (match) {
                el.value = match.value;
                this.data[formId] = match.value;
                this.markAutoFilled(el, 'parcel');
                fieldsApplied++;
            }
        }

        // Pool — normalize Yes/No to form values
        if (parcelData.pool && parcelData.pool !== 'None') {
            const el = document.getElementById('pool');
            if (el) {
                const raw = String(parcelData.pool).toLowerCase();
                let poolVal = null;
                if (raw === 'yes' || raw === 'true' || raw === '1') {
                    poolVal = 'In Ground'; // Most common, agent should verify
                } else if (raw === 'no' || raw === 'false' || raw === '0' || raw === 'none') {
                    // skip — no pool
                } else {
                    // Try direct fuzzy match (e.g. "above ground", "in ground")
                    const match = matchSelectOption(el, parcelData.pool);
                    if (match) poolVal = match.value;
                }
                if (poolVal) {
                    el.value = poolVal;
                    this.data.pool = poolVal;
                    this.markAutoFilled(el, 'parcel');
                    fieldsApplied++;
                }
            }
        }

        // Wood Stove — normalize Yes/No to form values (count)
        if (parcelData.woodStove && parcelData.woodStove !== 'None') {
            const el = document.getElementById('woodStove');
            if (el) {
                const raw = String(parcelData.woodStove).toLowerCase();
                let stoveVal = null;
                if (raw === 'yes' || raw === 'true' || raw === '1') {
                    stoveVal = '1';
                } else if (raw === 'no' || raw === 'false' || raw === '0' || raw === 'none') {
                    // skip
                } else if (/^[23]$/.test(raw)) {
                    stoveVal = raw; // direct numeric match
                } else {
                    const match = matchSelectOption(el, parcelData.woodStove);
                    if (match) stoveVal = match.value;
                }
                if (stoveVal) {
                    el.value = stoveVal;
                    this.data.woodStove = stoveVal;
                    this.markAutoFilled(el, 'parcel');
                    fieldsApplied++;
                }
            }
        }

        // Roof year
        if (parcelData.roofYr) {
            const el = document.getElementById('roofYr');
            if (el) {
                el.value = parcelData.roofYr;
                this.data.roofYr = String(parcelData.roofYr);
                this.markAutoFilled(el, 'parcel');
                fieldsApplied++;
            }
        }

        // Fireplace count
        if (parcelData.numFireplaces != null && String(parcelData.numFireplaces) !== '') {
            const el = document.getElementById('numFireplaces');
            if (el) {
                const countVal = String(Math.min(Number(parcelData.numFireplaces), 5));
                const opts = Array.from(el.options).map(o => o.value);
                if (opts.includes(countVal)) {
                    el.value = countVal;
                    this.data.numFireplaces = countVal;
                    this.markAutoFilled(el, 'parcel');
                    fieldsApplied++;
                }
            }
        } else if (parcelData.fireplace === 'Yes') {
            // Fallback: if we only know there IS a fireplace but not how many, record 1
            const el = document.getElementById('numFireplaces');
            if (el && (!el.value || el.value === '0')) {
                el.value = '1';
                this.data.numFireplaces = '1';
                this.markAutoFilled(el, 'parcel');
                fieldsApplied++;
            }
        }

        // Owner name (text input — only fill if currently empty)
        if (parcelData.ownerName) {
            const el = document.getElementById('ownerName');
            if (el && !el.value) {
                el.value = parcelData.ownerName;
                this.data.ownerName = parcelData.ownerName;
                this.markAutoFilled(el, 'parcel');
                fieldsApplied++;
            }
        }

        // Parcel ID (text input — only fill if currently empty)
        if (parcelData.parcelId) {
            const el = document.getElementById('parcelId');
            if (el && !el.value) {
                el.value = parcelData.parcelId;
                this.data.parcelId = parcelData.parcelId;
                this.markAutoFilled(el, 'parcel');
                fieldsApplied++;
            }
        }

        // Save changes
        this.save();

        // Show success toast with count
        this.toast(`✅ Auto-filled ${fieldsApplied} field${fieldsApplied !== 1 ? 's' : ''} from county data`);
    },

    async enrichWithZillow(address, city, state) {
        const zip = this.data.addrZip || '';
        console.log(`[Zillow] Enrichment starting: ${address}, ${city}, ${state} ${zip}`);
        try {
            const resp = await fetch('/api/property-intelligence?mode=zillow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, city, state, zip, aiSettings: window.AIProvider?.getSettings() })
            });
            if (!resp.ok) {
                console.warn(`[Zillow] API returned HTTP ${resp.status}`);
                return;
            }
            const result = await resp.json();
            console.log('[Zillow] API response:', JSON.stringify(result).substring(0, 500));
            if (!result.success || !result.data) {
                console.warn('[Zillow] No data:', result.error, result.diagnostics);
                // Show Zillow link if we got the zpid from autocomplete
                if (result.zillowUrl) {
                    this.toast(`Zillow blocks server access. <a href="${result.zillowUrl}" target="_blank" style="color:var(--primary);text-decoration:underline;">View on Zillow</a> to check details manually.`, 8000, true);
                }
                return;
            }

            const zd = result.data;
            const applied = [];

            const labels = {
                heatingType: 'Heating', cooling: 'Cooling', roofType: 'Roof',
                foundation: 'Foundation', constructionStyle: 'Construction',
                exteriorWalls: 'Exterior', garageSpaces: 'Garage',
                bedrooms: 'Bedrooms', fullBaths: 'Bathrooms',
                yrBuilt: 'Year Built', numStories: 'Stories', sqFt: 'Sq Ft'
            };

            const selectFields = ['heatingType', 'cooling', 'roofType', 'foundation', 'constructionStyle', 'exteriorWalls'];
            for (const fid of selectFields) {
                if (!zd[fid]) { console.log(`[Zillow] Select ${fid}: no data`); continue; }
                const el = document.getElementById(fid);
                if (!el) { console.log(`[Zillow] Select ${fid}: no element`); continue; }
                const opts = Array.from(el.options).map(o => o.value);
                if (opts.includes(zd[fid])) {
                    el.value = zd[fid];
                    this.data[fid] = zd[fid];
                    this.markAutoFilled(el, 'zillow');
                    applied.push(labels[fid] || fid);
                } else {
                    console.log(`[Zillow] Select ${fid}: value "${zd[fid]}" not in options:`, opts);
                }
            }

            // Map API field names to form field IDs
            const textFields = {
                yrBuilt: zd.yrBuilt,
                bedrooms: zd.bedrooms,
                fullBaths: zd.fullBaths,
                garageSpaces: zd.garageSpaces,
                numStories: zd.stories,
                sqFt: zd.totalSqft
            };
            for (const [fid, val] of Object.entries(textFields)) {
                if (val == null) continue;
                const el = document.getElementById(fid);
                if (!el) continue;
                el.value = val;
                this.data[fid] = String(val);
                this.markAutoFilled(el, 'zillow');
                applied.push(labels[fid] || fid);
            }

            if (applied.length > 0) {
                this.save();
                this.toast(`🏠 Property data found (${result.source}): ${applied.join(', ')}`, 6000);
                console.log(`[Zillow] Enriched ${applied.length} fields via ${result.source}:`, applied);
            } else {
                console.log('[Zillow] Data received but no fields matched form options:', zd);
            }
        } catch (e) {
            console.warn('[Zillow] Enrichment failed (non-fatal):', e.message);
        }
    },

    // ── Block 3: GIS/County lookup (originally ~L8455-8748) ──

    getCountyFromCity(city, state) {
        // Map city to county for display and reference
        // Normalize city to lowercase for lookup
        const cityLower = (city || '').toLowerCase().trim();

        const cityToCounty = {
            'WA': {
                'vancouver': 'Clark', 'camas': 'Clark', 'battle ground': 'Clark', 'ridgefield': 'Clark', 'la center': 'Clark', 'washougal': 'Clark',
                'seattle': 'King', 'bellevue': 'King', 'redmond': 'King', 'kent': 'King', 'renton': 'King', 'federal way': 'King', 'kirkland': 'King', 'auburn': 'King', 'sammamish': 'King', 'bothell': 'King',
                'tacoma': 'Pierce', 'lakewood': 'Pierce', 'puyallup': 'Pierce', 'bonney lake': 'Pierce', 'university place': 'Pierce',
                'everett': 'Snohomish', 'marysville': 'Snohomish', 'lynnwood': 'Snohomish', 'edmonds': 'Snohomish', 'mountlake terrace': 'Snohomish',
                'spokane': 'Spokane', 'spokane valley': 'Spokane',
                'bremerton': 'Kitsap', 'silverdale': 'Kitsap', 'poulsbo': 'Kitsap',
                'olympia': 'Thurston', 'lacey': 'Thurston', 'tumwater': 'Thurston',
                'bellingham': 'Whatcom',
                'yakima': 'Yakima',
                'longview': 'Cowlitz', 'kelso': 'Cowlitz',
            },
            'OR': {
                'portland': 'Multnomah', 'gresham': 'Multnomah', 'troutdale': 'Multnomah', 'wood village': 'Multnomah', 'fairview': 'Multnomah',
                'beaverton': 'Washington', 'hillsboro': 'Washington', 'tigard': 'Washington', 'tualatin': 'Washington', 'lake oswego': 'Washington', 'west linn': 'Washington', 'sherwood': 'Washington', 'forest grove': 'Washington', 'cornelius': 'Washington',
                'oregon city': 'Clackamas', 'milwaukie': 'Clackamas', 'happy valley': 'Clackamas', 'wilsonville': 'Clackamas', 'canby': 'Clackamas', 'sandy': 'Clackamas', 'estacada': 'Clackamas',
                'eugene': 'Lane', 'springfield': 'Lane', 'cottage grove': 'Lane', 'creswell': 'Lane', 'veneta': 'Lane',
                'salem': 'Marion', 'keizer': 'Marion', 'woodburn': 'Marion', 'silverton': 'Marion',
                'bend': 'Deschutes', 'redmond': 'Deschutes', 'sisters': 'Deschutes', 'la pine': 'Deschutes',
                'medford': 'Jackson', 'ashland': 'Jackson', 'central point': 'Jackson', 'phoenix': 'Jackson', 'talent': 'Jackson',
                'albany': 'Linn', 'lebanon': 'Linn', 'sweet home': 'Linn',
                'roseburg': 'Douglas', 'sutherlin': 'Douglas', 'winston': 'Douglas',
            },
            'AZ': {
                'phoenix': 'Maricopa', 'mesa': 'Maricopa', 'chandler': 'Maricopa', 'scottsdale': 'Maricopa', 'glendale': 'Maricopa', 'tempe': 'Maricopa', 'peoria': 'Maricopa', 'surprise': 'Maricopa', 'gilbert': 'Maricopa', 'avondale': 'Maricopa', 'goodyear': 'Maricopa', 'buckeye': 'Maricopa', 'el mirage': 'Maricopa', 'queen creek': 'Maricopa', 'cave creek': 'Maricopa', 'fountain hills': 'Maricopa', 'paradise valley': 'Maricopa',
                'tucson': 'Pima', 'oro valley': 'Pima', 'marana': 'Pima', 'sahuarita': 'Pima',
                'casa grande': 'Pinal', 'apache junction': 'Pinal', 'coolidge': 'Pinal', 'eloy': 'Pinal', 'florence': 'Pinal', 'maricopa': 'Pinal',
                'prescott': 'Yavapai', 'prescott valley': 'Yavapai', 'chino valley': 'Yavapai', 'cottonwood': 'Yavapai', 'sedona': 'Yavapai',
                'flagstaff': 'Coconino', 'williams': 'Coconino',
                'lake havasu city': 'Mohave', 'kingman': 'Mohave', 'bullhead city': 'Mohave',
                'yuma': 'Yuma', 'san luis': 'Yuma', 'somerton': 'Yuma',
            }
        };

        if (cityToCounty[state] && cityToCounty[state][cityLower]) {
            return cityToCounty[state][cityLower];
        }
        return null;
    },

    openGIS() {
        const address = this.data.addrStreet || '';
        const city = (this.data.addrCity || '').toLowerCase();
        const state = (this.data.addrState || '').toUpperCase();
        const zip = this.data.addrZip || '';
        
        if (!address || !city || !state) {
            this.toast('Please enter a complete address (street, city, and state) first.', 'error');
            return;
        }
        
        // Washington State County GIS mapping
        const waCountyGIS = {
            // Clark County - Property Information Center
            'vancouver': 'https://gis.clark.wa.gov/gishome/property/',
            'camas': 'https://gis.clark.wa.gov/gishome/property/',
            'battle ground': 'https://gis.clark.wa.gov/gishome/property/',
            'ridgefield': 'https://gis.clark.wa.gov/gishome/property/',
            'la center': 'https://gis.clark.wa.gov/gishome/property/',
            'washougal': 'https://gis.clark.wa.gov/gishome/property/',
            
            // King County
            'seattle': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'bellevue': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'redmond': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'kent': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'renton': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'federal way': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'kirkland': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'auburn': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'sammamish': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            'bothell': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
            
            // Pierce County
            'tacoma': 'https://atip.piercecountywa.gov/app/parcel-search',
            'lakewood': 'https://atip.piercecountywa.gov/app/parcel-search',
            'puyallup': 'https://atip.piercecountywa.gov/app/parcel-search',
            'bonney lake': 'https://atip.piercecountywa.gov/app/parcel-search',
            'university place': 'https://atip.piercecountywa.gov/app/parcel-search',
            
            // Snohomish County
            'everett': 'https://www.snoco.org/proptax/default.aspx',
            'marysville': 'https://www.snoco.org/proptax/default.aspx',
            'lynnwood': 'https://www.snoco.org/proptax/default.aspx',
            'edmonds': 'https://www.snoco.org/proptax/default.aspx',
            'mountlake terrace': 'https://www.snoco.org/proptax/default.aspx',
            
            // Spokane County
            'spokane': 'https://mapgis.spokanecounty.org/SCGIS2/Parcel/',
            'spokane valley': 'https://mapgis.spokanecounty.org/SCGIS2/Parcel/',
            
            // Kitsap County
            'bremerton': 'https://psearch.kitsap.gov/psearch/',
            'silverdale': 'https://psearch.kitsap.gov/psearch/',
            'poulsbo': 'https://psearch.kitsap.gov/psearch/',
            
            // Thurston County
            'olympia': 'https://taxlot.co.thurston.wa.us/',
            'lacey': 'https://taxlot.co.thurston.wa.us/',
            'tumwater': 'https://taxlot.co.thurston.wa.us/',
            
            // Whatcom County
            'bellingham': 'https://www.whatcomcounty.us/1476/Online-Property-Search',
            
            // Yakima County
            'yakima': 'https://www.co.yakima.wa.us/497/Property-Information-Public-Inquiry',
            
            // Cowlitz County
            'longview': 'https://cowlitzassessor.us/',
            'kelso': 'https://cowlitzassessor.us/',
        };
        
        // Oregon County GIS mapping
        const orCountyGIS = {
            // Multnomah County
            'portland': 'https://www.portlandmaps.com/',
            'gresham': 'https://www.portlandmaps.com/',
            'troutdale': 'https://www.portlandmaps.com/',
            'wood village': 'https://www.portlandmaps.com/',
            'fairview': 'https://www.portlandmaps.com/',
            
            // Washington County
            'beaverton': 'https://www.washingtoncountyor.gov/at/property-information',
            'hillsboro': 'https://www.washingtoncountyor.gov/at/property-information',
            'tigard': 'https://www.washingtoncountyor.gov/at/property-information',
            'tualatin': 'https://www.washingtoncountyor.gov/at/property-information',
            'lake oswego': 'https://www.washingtoncountyor.gov/at/property-information',
            'west linn': 'https://www.washingtoncountyor.gov/at/property-information',
            'sherwood': 'https://www.washingtoncountyor.gov/at/property-information',
            'forest grove': 'https://www.washingtoncountyor.gov/at/property-information',
            'cornelius': 'https://www.washingtoncountyor.gov/at/property-information',
            
            // Clackamas County
            'oregon city': 'https://ascendweb.clackamas.us/',
            'milwaukie': 'https://ascendweb.clackamas.us/',
            'happy valley': 'https://ascendweb.clackamas.us/',
            'wilsonville': 'https://ascendweb.clackamas.us/',
            'canby': 'https://ascendweb.clackamas.us/',
            'sandy': 'https://ascendweb.clackamas.us/',
            'estacada': 'https://ascendweb.clackamas.us/',
            
            // Lane County
            'eugene': 'https://apps.lanecounty.org/PropertyAccountInformation/',
            'springfield': 'https://apps.lanecounty.org/PropertyAccountInformation/',
            'cottage grove': 'https://apps.lanecounty.org/PropertyAccountInformation/',
            'creswell': 'https://apps.lanecounty.org/PropertyAccountInformation/',
            'veneta': 'https://apps.lanecounty.org/PropertyAccountInformation/',
            
            // Marion County
            'salem': 'https://mcasr.co.marion.or.us/',
            'keizer': 'https://mcasr.co.marion.or.us/',
            'woodburn': 'https://mcasr.co.marion.or.us/',
            'silverton': 'https://mcasr.co.marion.or.us/',
            
            // Deschutes County
            'bend': 'https://dial.deschutes.org/',
            'redmond': 'https://dial.deschutes.org/',
            'sisters': 'https://dial.deschutes.org/',
            'la pine': 'https://dial.deschutes.org/',
            
            // Jackson County
            'medford': 'http://pdo.jacksoncountyor.gov/pdo',
            'ashland': 'http://pdo.jacksoncountyor.gov/pdo',
            'central point': 'http://pdo.jacksoncountyor.gov/pdo',
            'phoenix': 'http://pdo.jacksoncountyor.gov/pdo',
            'talent': 'http://pdo.jacksoncountyor.gov/pdo',
            
            // Linn County
            'albany': 'https://www.linncountyassessor.com/',
            'lebanon': 'https://www.linncountyassessor.com/',
            'sweet home': 'https://www.linncountyassessor.com/',
            
            // Douglas County
            'roseburg': 'https://apps.co.douglas.or.us/onlineservices/PropertyViewer/',
            'sutherlin': 'https://apps.co.douglas.or.us/onlineservices/PropertyViewer/',
            'winston': 'https://apps.co.douglas.or.us/onlineservices/PropertyViewer/',
        };
        
        // Arizona County GIS mapping
        const azCountyGIS = {
            // Maricopa County
            'phoenix': 'https://mcassessor.maricopa.gov/',
            'mesa': 'https://mcassessor.maricopa.gov/',
            'chandler': 'https://mcassessor.maricopa.gov/',
            'scottsdale': 'https://mcassessor.maricopa.gov/',
            'glendale': 'https://mcassessor.maricopa.gov/',
            'tempe': 'https://mcassessor.maricopa.gov/',
            'peoria': 'https://mcassessor.maricopa.gov/',
            'surprise': 'https://mcassessor.maricopa.gov/',
            'gilbert': 'https://mcassessor.maricopa.gov/',
            'avondale': 'https://mcassessor.maricopa.gov/',
            'goodyear': 'https://mcassessor.maricopa.gov/',
            'buckeye': 'https://mcassessor.maricopa.gov/',
            'el mirage': 'https://mcassessor.maricopa.gov/',
            'queen creek': 'https://mcassessor.maricopa.gov/',
            'cave creek': 'https://mcassessor.maricopa.gov/',
            'fountain hills': 'https://mcassessor.maricopa.gov/',
            'paradise valley': 'https://mcassessor.maricopa.gov/',
            
            // Pima County
            'tucson': 'https://www.asr.pima.gov/assessor/',
            'oro valley': 'https://www.asr.pima.gov/assessor/',
            'marana': 'https://www.asr.pima.gov/assessor/',
            'sahuarita': 'https://www.asr.pima.gov/assessor/',
            
            // Pinal County
            'casa grande': 'https://gis.pinalcountyaz.gov/parcelviewer/',
            'apache junction': 'https://gis.pinalcountyaz.gov/parcelviewer/',
            'coolidge': 'https://gis.pinalcountyaz.gov/parcelviewer/',
            'eloy': 'https://gis.pinalcountyaz.gov/parcelviewer/',
            'florence': 'https://gis.pinalcountyaz.gov/parcelviewer/',
            'maricopa': 'https://gis.pinalcountyaz.gov/parcelviewer/',
            
            // Yavapai County
            'prescott': 'https://gis.yavapaiaz.gov/v4/',
            'prescott valley': 'https://gis.yavapaiaz.gov/v4/',
            'chino valley': 'https://gis.yavapaiaz.gov/v4/',
            'cottonwood': 'https://gis.yavapaiaz.gov/v4/',
            'sedona': 'https://gis.yavapaiaz.gov/v4/',
            
            // Coconino County
            'flagstaff': 'https://www.coconino.az.gov/119/Assessor',
            'williams': 'https://www.coconino.az.gov/119/Assessor',
            
            // Mohave County
            'lake havasu city': 'https://www.mohave.gov/departments/assessor/assessor-search/',
            'kingman': 'https://www.mohave.gov/departments/assessor/assessor-search/',
            'bullhead city': 'https://www.mohave.gov/departments/assessor/assessor-search/',
            
            // Yuma County
            'yuma': 'https://www.yumacountyaz.gov/government/assessor',
            'san luis': 'https://www.yumacountyaz.gov/government/assessor',
            'somerton': 'https://www.yumacountyaz.gov/government/assessor',
        };

        // Normalize city to lowercase for lookup (user might type "Portland" but key is "portland")
        const cityLower = (city || '').toLowerCase().trim();

        // Check if we have a direct GIS link for this city
        if (state === 'WA' && waCountyGIS[cityLower]) {
            window.open(waCountyGIS[cityLower], '_blank');
            return;
        }

        if (state === 'OR' && orCountyGIS[cityLower]) {
            // Portland Maps doesn't support URL-based search, just open homepage
            // User can enter address in the search box at top of page
            window.open(orCountyGIS[cityLower], '_blank');
            return;
        }

        if (state === 'AZ' && azCountyGIS[cityLower]) {
            window.open(azCountyGIS[cityLower], '_blank');
            return;
        }
        
        // Detect county and show it to user
        const county = this.getCountyFromCity(city, state);
        
        // Fallback: Try to open general county assessor search
        const searchAddress = encodeURIComponent(`${address} ${city} ${state} ${zip}`);
        let message = '';
        
        if (county) {
            message = `📍 County Detected: ${county} County, ${state}\n\nOpening county assessor search...`;
            console.log(`County detected: ${county} County, ${state}`);
        } else {
            message = `📍 City/County: ${city}, ${state}\n\nOpening general assessor search...`;
        }
        
        // Show notification
        const toast = document.createElement('div');
        toast.textContent = message.split('\n')[0];
        toast.style.cssText = 'position:fixed;top:80px;right:20px;background:#007AFF;color:white;padding:12px 20px;border-radius:8px;font-size:14px;z-index:9999;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
        
        if (state === 'WA') {
            window.open(`https://www.dor.wa.gov/find-taxes-rates/property-tax/county-assessors`, '_blank');
        } else if (state === 'OR') {
            window.open(`https://www.oregon.gov/dor/forms/pages/county-assessor.aspx`, '_blank');
        } else if (state === 'AZ') {
            window.open(`https://azdor.gov/property-appraisal/county-assessors-information`, '_blank');
        } else {
            // Generic Google search for county GIS
            window.open(`https://www.google.com/search?q=${city}+${state}+county+gis+assessor+property+search`, '_blank');
        }
    },

    // ── Rentcast Usage Counter ────────────────────────────────────────────────
    // Data lives in users/{uid}/sync/rentcastUsage (covered by existing Firestore rules).
    // Schema: { count: number, periodDay: number (1–28), periodStart: "YYYY-MM-DD" }
    // periodDay = day of month the billing cycle resets (default 1).
    // periodStart = ISO date of the most recent reset.

    /** Computes the most recent billing period start date for a given day-of-month. */
    async initPropertyStepUI() {
        const el = document.getElementById('rentcastUsageDisplay');
        if (!el) return;
        try {
            const { count, periodDay } = await this._getRentcastCounter();
            this._updateRentcastDisplay(count, periodDay);
        } catch (e) {
            // Silently fail — display remains empty until next Smart Scan click
        }
    },

});
