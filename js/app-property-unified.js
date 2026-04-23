// js/app-property-unified.js — Unified property data popup (ArcGIS + Zillow + FireStation + flood).
// Extracted from app-property.js during Phase 3 monolith decomposition (2026-04).
'use strict';

Object.assign(App, {
    showUnifiedDataPopup(arcgisData, zillowData, fireData, address, city, state, floodData, visualData) {
        // Merge data from all sources: ArcGIS (primary) → Zillow (fill gaps) → FireStation → Vision (fill remaining visual-only gaps)
        const merged = {};
        const sources = [];
        // fieldSources tracks the specific citation for each merged field (for tooltip display)
        const fieldSources = {};

        if (arcgisData && arcgisData.data) {
            Object.assign(merged, arcgisData.data);
            sources.push('County Records');
        }

        if (zillowData && zillowData.data) {
            const zd = zillowData.data;
            // Collect field-level source attributions from the API response
            const zSrc = zillowData.sources || {};
            // Detect data sources — may be composite (e.g. 'Rentcast + Redfin (Apify scrape)')
            const srcStr = zillowData.source || '';
            const srcParts = srcStr.split(' + ').map(s => s.trim()).filter(Boolean);
            for (const part of srcParts) {
                if (part === 'Rentcast') sources.push('Rentcast');
                else if (part.includes('Redfin')) sources.push('Redfin Scrape');
                else if (part.includes('Zillow')) sources.push('Zillow Scrape');
                else if (part.includes('Gemini') || part === 'AI Search' || part === 'Web Search') sources.push('Web Search');
                else sources.push(part);
            }
            // Deduplicate
            const seen = new Set();
            for (let i = sources.length - 1; i >= 0; i--) {
                if (seen.has(sources[i])) sources.splice(i, 1);
                else seen.add(sources[i]);
            }
            // Only fill gaps — don't overwrite ArcGIS data
            if ((!merged.heatingType || merged.heatingType === 'Unknown') && zd.heatingType) { merged.heatingType = zd.heatingType; if (zSrc.heatingType) fieldSources.heatingType = zSrc.heatingType; }
            if ((!merged.cooling || merged.cooling === 'Unknown') && zd.cooling) { merged.cooling = zd.cooling; if (zSrc.cooling) fieldSources.cooling = zSrc.cooling; }
            if ((!merged.roofType || merged.roofType === 'Unknown') && zd.roofType) { merged.roofType = zd.roofType; if (zSrc.roofType) fieldSources.roofType = zSrc.roofType; }
            if ((!merged.foundationType || merged.foundationType === 'Unknown') && zd.foundation) { merged.foundationType = zd.foundation; if (zSrc.foundation) fieldSources.foundationType = zSrc.foundation; }
            if ((!merged.constructionStyle || merged.constructionStyle === 'Unknown') && zd.constructionStyle) { merged.constructionStyle = zd.constructionStyle; if (zSrc.constructionStyle) fieldSources.constructionStyle = zSrc.constructionStyle; }
            if ((!merged.exteriorWalls || merged.exteriorWalls === 'Unknown') && zd.exteriorWalls) { merged.exteriorWalls = zd.exteriorWalls; if (zSrc.exteriorWalls) fieldSources.exteriorWalls = zSrc.exteriorWalls; }
            if ((!merged.yearBuilt || merged.yearBuilt === 0) && zd.yearBuilt) { merged.yearBuilt = zd.yearBuilt; if (zSrc.yearBuilt) fieldSources.yearBuilt = zSrc.yearBuilt; }
            // Prefer Zillow for stories — county assessors frequently mis-count split-levels, lofts, and half-stories
            if (zd.stories && zd.stories > 0) { merged.stories = zd.stories; if (zSrc.stories) fieldSources.stories = zSrc.stories; }
            if ((!merged.totalSqft || merged.totalSqft === 0) && zd.totalSqft) { merged.totalSqft = zd.totalSqft; if (zSrc.totalSqft) fieldSources.totalSqft = zSrc.totalSqft; }
            if ((!merged.bedrooms || merged.bedrooms === 0) && zd.bedrooms) { merged.bedrooms = zd.bedrooms; if (zSrc.bedrooms) fieldSources.bedrooms = zSrc.bedrooms; }
            if ((!merged.bathrooms || merged.bathrooms === 0) && zd.fullBaths) { merged.bathrooms = zd.fullBaths; if (zSrc.fullBaths) fieldSources.bathrooms = zSrc.fullBaths; }
            if ((!merged.garageSpaces || merged.garageSpaces === 0) && zd.garageSpaces) { merged.garageSpaces = zd.garageSpaces; if (zSrc.garageSpaces) fieldSources.garageSpaces = zSrc.garageSpaces; }
            if (zd.fireplace) merged.fireplace = zd.fireplace;
            if ((!merged.garageType || merged.garageType === 'Unknown' || merged.garageType === 'None') && zd.garageType) { merged.garageType = zd.garageType; if (zSrc.garageType) fieldSources.garageType = zSrc.garageType; }
            if (!merged.flooring && zd.flooring) { merged.flooring = zd.flooring; if (zSrc.flooring) fieldSources.flooring = zSrc.flooring; }
            if (!merged.numFireplaces && zd.numFireplaces) { merged.numFireplaces = zd.numFireplaces; if (zSrc.numFireplaces) fieldSources.numFireplaces = zSrc.numFireplaces; }
            if (!merged.sewer && zd.sewer) { merged.sewer = zd.sewer; if (zSrc.sewer) fieldSources.sewer = zSrc.sewer; }
            if (!merged.waterSource && zd.waterSource) { merged.waterSource = zd.waterSource; if (zSrc.waterSource) fieldSources.waterSource = zSrc.waterSource; }
            if (!merged.pool && zd.pool) { merged.pool = zd.pool; if (zSrc.pool) fieldSources.pool = zSrc.pool; }
            if (!merged.woodStove && zd.woodStove) { merged.woodStove = zd.woodStove; if (zSrc.woodStove) fieldSources.woodStove = zSrc.woodStove; }
            if (!merged.roofYr && zd.roofYr) { merged.roofYr = zd.roofYr; if (zSrc.roofYr) fieldSources.roofYr = zSrc.roofYr; }
            if (!merged.basementFinishPct && zd.basementFinishPct) { merged.basementFinishPct = zd.basementFinishPct; if (zSrc.basementFinishPct) fieldSources.basementFinishPct = zSrc.basementFinishPct; }
            if (!merged.lotSizeAcres && zd.lotSize) { merged.lotSizeAcres = Math.round(zd.lotSize / 43560 * 100) / 100; fieldSources.lotSizeAcres = zSrc.lotSize || 'Rentcast'; }
            if (!merged.architectureType && zd.architectureType) { merged.architectureType = zd.architectureType; if (zSrc.architectureType) fieldSources.architectureType = zSrc.architectureType; }
            if (!merged.fireplaceType && zd.fireplaceType) { merged.fireplaceType = zd.fireplaceType; if (zSrc.fireplaceType) fieldSources.fireplaceType = zSrc.fireplaceType; }
            if (!merged.hoaFee && zd.hoaFee) { merged.hoaFee = zd.hoaFee; if (zSrc.hoaFee) fieldSources.hoaFee = zSrc.hoaFee; }
            if (!merged.viewType && zd.viewType) { merged.viewType = zd.viewType; if (zSrc.viewType) fieldSources.viewType = zSrc.viewType; }
        }

        if (fireData) {
            sources.push('Fire Protection');
            merged.fireStationDist = fireData.fireStationDist;
            merged.fireStationName = fireData.fireStationName;
            merged.protectionClass = fireData.protectionClass;
        }

        if (floodData) {
            sources.push('FEMA Flood');
        }

        // ── Vision merge ──────────────────────────────────────────────────────
        // Gap-fill structural fields from AI vision. Only apply medium/high confidence values
        // to fields that other sources left blank or marked Unknown. Low-confidence vision
        // values stay visible on the Visual tab for manual review but do not enter `merged`.
        let visionMerged = [];
        if (visualData && visualData.data) {
            sources.push('AI Vision');
            const vd = visualData.data;
            const vc = vd.confidence || {};
            const unk = v => !v || v === 'unknown';
            const isEmpty = (fieldKey, sentinel) => {
                const v = merged[fieldKey];
                return v == null || v === '' || v === sentinel;
            };
            const canMerge = conf => conf === 'high' || conf === 'medium';

            if (!unk(vd.exterior_walls) && canMerge(vc.exterior_walls) && isEmpty('exteriorWalls', 'Unknown')) {
                merged.exteriorWalls = vd.exterior_walls;
                fieldSources.exteriorWalls = `AI Vision (${vc.exterior_walls})`;
                visionMerged.push('Exterior Walls');
            }
            if (!unk(vd.roof_shape) && canMerge(vc.roof_shape) && isEmpty('roofShape', null)) {
                merged.roofShape = vd.roof_shape;
                fieldSources.roofShape = `AI Vision (${vc.roof_shape})`;
                visionMerged.push('Roof Shape');
            }
            if (!unk(vd.roof_material) && canMerge(vc.roof_material) && isEmpty('roofType', 'Unknown')) {
                merged.roofType = vd.roof_material;
                fieldSources.roofType = `AI Vision (${vc.roof_material})`;
                visionMerged.push('Roof Type');
            }
            if (!unk(vd.stories) && canMerge(vc.stories) && (!merged.stories || merged.stories === 0)) {
                merged.stories = vd.stories;
                fieldSources.stories = `AI Vision (${vc.stories})`;
                visionMerged.push('Stories');
            }
            if (visionMerged.length) {
                console.log('[Vision] Gap-filled from vision:', visionMerged.join(', '));
            }
        }

        // Determine the property listings source name for this data set
        const zdSourceName = (zillowData && zillowData.source?.includes('Rentcast')) ? 'Rentcast' : 'AI Search';

        // Build modal
        const modal = document.createElement('div');
        modal.id = 'parcelDataModal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white; border-radius: 12px; padding: 24px;
            max-width: 600px; width: 95vw; max-height: 85vh; overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            font-family: system-ui, sans-serif;
        `;

        // Title
        const title = document.createElement('h2');
        title.textContent = `Property Data Found`;
        title.style.cssText = 'margin: 0 0 8px 0; color: #28a745;';
        content.appendChild(title);

        // Source badges
        const badgeRow = document.createElement('div');
        badgeRow.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;';
        const badgeColors = {
            'County Records': '#0066cc',
            'Rentcast': '#0d7a4e',
            'Web Search': '#6f42c1',
            'Fire Protection': '#dc3545',
            'FEMA Flood': '#1a6496',
            'Redfin Scrape': '#c73333',
            'Zillow Scrape': '#006aff',
            'AI Vision': '#8e44ad'
        };
        const badgeIcons = {
            'County Records': '🏛',
            'Rentcast': '📊',
            'Web Search': '🏠',
            'Fire Protection': '🚒',
            'FEMA Flood': '🌊',
            'Redfin Scrape': '🔍',
            'Zillow Scrape': '🔍',
            'AI Vision': '🛰️'
        };
        sources.forEach(src => {
            const badge = document.createElement('span');
            badge.style.cssText = `
                display: inline-flex; align-items: center; gap: 4px;
                padding: 3px 10px; border-radius: 12px;
                font-size: 11px; font-weight: 600; color: white;
                background: ${badgeColors[src] || '#666'};
            `;
            badge.textContent = `${badgeIcons[src] || ''} ${src}`;
            badgeRow.appendChild(badge);
        });
        content.appendChild(badgeRow);

        // Address line
        const addressLine = document.createElement('p');
        addressLine.style.cssText = 'color: #666; margin: 4px 0 12px 0; font-size: 13px;';
        addressLine.textContent = `${address}, ${city}, ${state}${merged.parcelId ? ' · Parcel: ' + merged.parcelId : ''}`;
        content.appendChild(addressLine);

        // ── Tab bar ──────────────────────────────────────────────────────────
        const tabDefs = [{ id: 'summary', label: '✦ Summary' }];
        if (arcgisData && arcgisData.data) tabDefs.push({ id: 'county', label: '🏛 County' });
        if (zillowData && zillowData.data) {
            const zSrc2 = zillowData.source || '';
            const tabIcon = zdSourceName === 'Rentcast' ? '📊 Rentcast'
                : zSrc2.includes('Apify') || zSrc2.includes('apify') ? '🔍 Listing Data'
                : '🏠 AI Search';
            tabDefs.push({ id: 'listings', label: tabIcon });
        }
        if (fireData) tabDefs.push({ id: 'fire', label: '🚒 Fire / PC' });
        if (visualData && visualData.data) tabDefs.push({ id: 'visual', label: '🛰️ Visual' });

        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display: flex; gap: 4px; border-bottom: 2px solid #e9ecef; margin-bottom: 14px;';

        const panels = {};

        function activateTab(tabId) {
            tabBar.querySelectorAll('[data-tab]').forEach(btn => {
                const active = btn.dataset.tab === tabId;
                btn.style.borderBottom = active ? '2px solid #28a745' : '2px solid transparent';
                btn.style.color = active ? '#28a745' : '#666';
                btn.style.fontWeight = active ? '700' : '400';
                btn.style.marginBottom = '-2px';
            });
            Object.entries(panels).forEach(([id, el]) => {
                el.style.display = id === tabId ? '' : 'none';
            });
        }

        tabDefs.forEach(({ id, label }) => {
            const btn = document.createElement('button');
            btn.dataset.tab = id;
            btn.textContent = label;
            btn.style.cssText = `
                background: none; border: none; border-bottom: 2px solid transparent;
                padding: 6px 14px; cursor: pointer; font-size: 13px;
                color: #666; margin-bottom: -2px; border-radius: 4px 4px 0 0;
                transition: color 0.15s;
            `;
            btn.onclick = () => activateTab(id);
            tabBar.appendChild(btn);

            const panel = document.createElement('div');
            panel.style.display = 'none';
            panels[id] = panel;
        });

        content.appendChild(tabBar);

        // Helper: build a 2-col grid of {label, value, source?} items
        function buildGrid(fieldList) {
            const g = document.createElement('div');
            g.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 4px 0;';
            const visible = fieldList.filter(f => f.value != null && f.value !== '' && f.value !== 'N/A');
            if (!visible.length) {
                const empty = document.createElement('p');
                empty.style.cssText = 'color: #999; font-size: 13px; grid-column: span 2;';
                empty.textContent = 'No data available for this source.';
                g.appendChild(empty);
                return { el: g, count: 0 };
            }
            visible.forEach(field => {
                const box = document.createElement('div');
                box.style.cssText = 'background: #f5f5f5; padding: 10px; border-radius: 6px;';
                if (field.source) { box.title = `Source: ${field.source}`; box.style.cursor = 'help'; }

                const lbl = document.createElement('div');
                lbl.style.cssText = 'font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 3px;';
                lbl.textContent = field.label;

                const val = document.createElement('div');
                val.style.cssText = 'font-size: 15px; font-weight: 600; color: #333;';
                val.textContent = field.value;

                box.appendChild(lbl);
                box.appendChild(val);

                if (field.source) {
                    const chip = document.createElement('div');
                    chip.style.cssText = 'font-size: 10px; color: #6f42c1; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
                    chip.textContent = `✓ ${field.source}`;
                    box.appendChild(chip);
                }

                g.appendChild(box);
            });
            return { el: g, count: visible.length };
        }

        // Helper: camelCase → Title Case
        function camelToLabel(key) {
            return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        }

        // Helper: flatten an object into buildGrid-compatible fields
        function rawToFields(obj, zSrcMap) {
            if (!obj || typeof obj !== 'object') return [];
            return Object.entries(obj)
                .filter(([, v]) => v != null && v !== '' && v !== 'Unknown')
                .map(([k, v]) => ({
                    label: camelToLabel(k),
                    value: typeof v === 'object' ? JSON.stringify(v) : String(v),
                    source: zSrcMap ? (zSrcMap[k] || null) : null
                }));
        }

        // ── Summary tab ───────────────────────────────────────────────────────
        const labelToMergedKey = {
            'Year Built': 'yearBuilt', 'Stories': 'stories', 'Total Sq Ft': 'totalSqft',
            'Bedrooms': 'bedrooms', 'Bathrooms': 'bathrooms', 'Garage Type': 'garageType',
            'Garage Spaces': 'garageSpaces', 'Foundation': 'foundationType', 'Roof Type': 'roofType',
            'Roof Year': 'roofYr', 'Heating': 'heatingType', 'Cooling': 'cooling',
            'Construction': 'constructionStyle', 'Exterior': 'exteriorWalls', 'Flooring': 'flooring',
            'Fireplaces': 'numFireplaces', 'Sewer': 'sewer', 'Water': 'waterSource',
            'Pool': 'pool', 'Wood Stove': 'woodStove',
            'Architecture': 'architectureType', 'Fireplace Type': 'fireplaceType',
            'HOA Fee': 'hoaFee', 'View': 'viewType',
        };

        const summaryFieldDefs = [
            { label: 'Year Built', value: merged.yearBuilt && merged.yearBuilt > 0 ? merged.yearBuilt : null },
            { label: 'Stories', value: merged.stories && merged.stories > 0 ? merged.stories : null },
            { label: 'Total Sq Ft', value: merged.totalSqft && merged.totalSqft > 0 ? merged.totalSqft.toLocaleString() : null },
            { label: 'Lot Size', value: merged.lotSizeAcres && merged.lotSizeAcres > 0 ? `${merged.lotSizeAcres.toFixed(2)} acres` : null },
            { label: 'Bedrooms', value: merged.bedrooms && merged.bedrooms > 0 ? merged.bedrooms : null },
            { label: 'Bathrooms', value: merged.bathrooms && merged.bathrooms > 0 ? merged.bathrooms : null },
            { label: 'Garage Type', value: merged.garageType || null },
            { label: 'Garage Spaces', value: merged.garageSpaces && merged.garageSpaces > 0 ? merged.garageSpaces : (merged.garageSqft && merged.garageSqft > 0 ? `${Math.round(merged.garageSqft / 180)} (est.)` : null) },
            { label: 'Foundation', value: merged.foundationType && merged.foundationType !== 'Unknown' ? merged.foundationType : null },
            { label: 'Roof Type', value: merged.roofType && merged.roofType !== 'Unknown' ? merged.roofType : null },
            { label: 'Roof Year', value: merged.roofYr || null },
            { label: 'Heating', value: merged.heatingType && merged.heatingType !== 'Unknown' ? merged.heatingType : null },
            { label: 'Cooling', value: merged.cooling || null },
            { label: 'Construction', value: merged.constructionStyle && merged.constructionStyle !== 'Unknown' ? merged.constructionStyle : null },
            { label: 'Exterior', value: merged.exteriorWalls || null },
            { label: 'Flooring', value: merged.flooring || null },
            { label: 'Fireplaces', value: merged.numFireplaces && merged.numFireplaces > 0 ? merged.numFireplaces : (merged.fireplace === 'Yes' ? 'Yes' : null) },
            { label: 'Sewer', value: merged.sewer || null },
            { label: 'Water', value: merged.waterSource || null },
            { label: 'Pool', value: merged.pool && merged.pool !== 'None' ? merged.pool : null },
            { label: 'Wood Stove', value: merged.woodStove && merged.woodStove !== 'None' ? merged.woodStove : null },
            { label: 'Land Use', value: merged.landUse || null },
            { label: 'Architecture', value: merged.architectureType || null },
            { label: 'Fireplace Type', value: merged.fireplaceType || null },
            { label: 'HOA Fee', value: merged.hoaFee ? `$${merged.hoaFee}/mo` : null },
            { label: 'View', value: merged.viewType || null },
        ];

        if (fireData) {
            const reliabilityBadge = fireData.stationReliability === 'volunteer' ? ' 🟡' :
                                     fireData.stationReliability === 'review' ? ' ⚠️' : '';
            summaryFieldDefs.push({ label: 'Fire Station', value: `${fireData.fireStationDist} mi — ${fireData.fireStationName || 'Nearest'}${reliabilityBadge}` });
            summaryFieldDefs.push({ label: 'Protection Class', value: fireData.protectionClass });
            if (fireData.reviewNote) summaryFieldDefs.push({ label: 'Station Note', value: fireData.reviewNote });
        }

        if (floodData) {
            summaryFieldDefs.push({ label: 'Flood Zone', value: floodData.floodZone || null });
            if (floodData.floodZoneSubtype) summaryFieldDefs.push({ label: 'Zone Subtype', value: floodData.floodZoneSubtype });
            if (floodData.baseFloodElevation != null) summaryFieldDefs.push({ label: 'Base Flood Elev.', value: `${floodData.baseFloodElevation} ft` });
        }

        // Attach per-field source citations for summary tab
        const summaryFields = summaryFieldDefs.map(f => {
            const mk = labelToMergedKey[f.label];
            return { ...f, source: mk ? (fieldSources[mk] || null) : null };
        });

        const { el: summaryGrid, count: summaryCount } = buildGrid(summaryFields);
        panels.summary.appendChild(summaryGrid);

        if (floodData) {
            const isHighRisk = floodData.sfha === true;
            const floodChip = document.createElement('div');
            floodChip.style.cssText = `
                display: inline-flex; align-items: center; gap: 6px;
                margin-top: 10px; padding: 8px 14px; border-radius: 20px;
                font-size: 12px; font-weight: 600;
                background: ${isHighRisk ? '#fff3f3' : '#f0fff4'};
                color: ${isHighRisk ? '#c0392b' : '#1a7a40'};
                border: 1.5px solid ${isHighRisk ? '#e74c3c' : '#27ae60'};
            `;
            floodChip.textContent = isHighRisk
                ? '⚠️ High Risk — flood insurance may be required'
                : '✓ Low/Moderate Risk';
            panels.summary.appendChild(floodChip);
        }

        // ── County tab ────────────────────────────────────────────────────────
        if (panels.county) {
            const desc = document.createElement('p');
            desc.style.cssText = 'font-size: 12px; color: #666; margin: 0 0 10px 0;';
            desc.textContent = 'Raw county assessor / ArcGIS parcel data.';
            panels.county.appendChild(desc);
            const { el: cGrid } = buildGrid(rawToFields(arcgisData && arcgisData.data, null));
            panels.county.appendChild(cGrid);
        }

        // ── Rentcast / AI Search tab ───────────────────────────────────────────
        if (panels.listings) {
            const desc = document.createElement('p');
            desc.style.cssText = 'font-size: 12px; color: #666; margin: 0 0 10px 0;';
            const zSrcStr = (zillowData && zillowData.source) || '';
            desc.textContent = zdSourceName === 'Rentcast'
                ? 'MLS / assessor records from Rentcast API. Fields with ✓ chips indicate individual field attribution.'
                : zSrcStr.includes('Apify') || zSrcStr.includes('apify')
                    ? 'Property data scraped from real estate listing pages via structured extraction.'
                    : 'Property characteristics extracted by Gemini AI from public listing data.';
            panels.listings.appendChild(desc);
            const zSrc = (zillowData && zillowData.sources) || {};
            const { el: zGrid } = buildGrid(rawToFields(zillowData && zillowData.data, zSrc));
            panels.listings.appendChild(zGrid);
        }

        // ── Fire / PC tab ──────────────────────────────────────────────────────
        if (panels.fire && fireData) {
            const stationType = fireData.stationReliability === 'volunteer' ? '🟡 Volunteer' :
                                fireData.stationReliability === 'review' ? '⚠️ Review' : '✅ Career';
            const fireFields = [
                { label: 'Station Name', value: fireData.fireStationName || 'Nearest Station' },
                { label: 'Distance', value: `${fireData.fireStationDist} mi` },
                { label: 'Protection Class', value: fireData.protectionClass },
                { label: 'Station Type', value: stationType },
            ];
            if (fireData.reviewNote) fireFields.push({ label: 'Note', value: fireData.reviewNote });
            const { el: fGrid } = buildGrid(fireFields);
            panels.fire.appendChild(fGrid);
        }

        // ── Visual tab ─────────────────────────────────────────────────────────
        // Images + AI-inferred structural fields with per-field confidence. Hazard
        // checkboxes write into `merged` so the shared "Use This Data" button applies them.
        if (panels.visual && visualData && visualData.data) {
            const vd = visualData.data;
            const vc = vd.confidence || {};

            const desc = document.createElement('p');
            desc.style.cssText = 'font-size: 12px; color: #666; margin: 0 0 10px 0;';
            desc.textContent = `Gemini vision analysis of satellite + Street View imagery. ${visionMerged.length ? 'Bold items were merged into Summary.' : 'No visual gap-fills — all structural fields already had data from other sources.'}`;
            panels.visual.appendChild(desc);

            // Images row
            if (visualData.satelliteImage || visualData.streetViewImage) {
                const imgRow = document.createElement('div');
                imgRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 14px;';
                const mk = (src, mime, label) => {
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'flex: 1;';
                    const h = document.createElement('p');
                    h.style.cssText = 'font-size: 11px; font-weight: 600; margin: 0 0 4px 0; color: #666;';
                    h.textContent = label;
                    const img = document.createElement('img');
                    img.src = `data:${mime};base64,${src}`;
                    img.style.cssText = 'width: 100%; height: auto; border-radius: 6px; border: 1px solid #e0e0e0; cursor: pointer;';
                    img.title = 'Click for fullscreen';
                    img.onclick = () => { if (this.viewSatelliteFullscreen) this.viewSatelliteFullscreen(img.src); };
                    wrap.appendChild(h);
                    wrap.appendChild(img);
                    return wrap;
                };
                if (visualData.satelliteImage) imgRow.appendChild(mk(visualData.satelliteImage, 'image/png', 'Satellite'));
                if (visualData.streetViewImage) imgRow.appendChild(mk(visualData.streetViewImage, 'image/jpeg', 'Street View'));
                panels.visual.appendChild(imgRow);
            }

            // Per-field confidence badges
            const confBadgeHtml = (conf, text) => {
                if (!conf) return text;
                const c = { high: '#d4edda/#155724', medium: '#fff3cd/#856404', low: '#f8d7da/#721c24' };
                const [bg, fg] = (c[conf] || c.low).split('/');
                return `${text} <span style="background:${bg}; color:${fg}; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; text-transform:uppercase; margin-left:6px;">${conf}</span>`;
            };

            const fieldBox = document.createElement('div');
            fieldBox.style.cssText = 'background: #f5f5f5; border-radius: 8px; padding: 12px; margin-bottom: 12px;';
            const fHeader = document.createElement('p');
            fHeader.style.cssText = 'font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #333;';
            fHeader.textContent = 'Inferred Structural Fields';
            fieldBox.appendChild(fHeader);

            const visualFields = [
                { id: 'exteriorWalls', label: '🧱 Exterior Walls', value: vd.exterior_walls, conf: vc.exterior_walls, merged: visionMerged.includes('Exterior Walls') },
                { id: 'roofType',      label: '🏠 Roof Type',     value: vd.roof_material, conf: vc.roof_material, merged: visionMerged.includes('Roof Type') },
                { id: 'roofShape',     label: '🏗️ Roof Shape',    value: vd.roof_shape,    conf: vc.roof_shape,    merged: visionMerged.includes('Roof Shape') },
                { id: 'numStories',    label: '📊 Stories',       value: vd.stories,       conf: vc.stories,       merged: visionMerged.includes('Stories') },
            ].filter(f => f.value && f.value !== 'unknown');

            if (visualFields.length === 0) {
                const empty = document.createElement('p');
                empty.style.cssText = 'font-size: 13px; color: #999; margin: 4px 0;';
                empty.textContent = 'No structural fields recognized in imagery.';
                fieldBox.appendChild(empty);
            } else {
                visualFields.forEach(f => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #e9ecef; font-size: 13px;';
                    const left = document.createElement('span');
                    left.style.fontWeight = f.merged ? '700' : '400';
                    left.innerHTML = `${f.label}${f.merged ? ' <span style="color:#28a745; font-size:11px;">• applied</span>' : ''}`;
                    const right = document.createElement('span');
                    right.style.fontWeight = '600';
                    right.innerHTML = confBadgeHtml(f.conf, Utils.escapeHTML(String(f.value)));
                    row.appendChild(left);
                    row.appendChild(right);
                    fieldBox.appendChild(row);
                });
            }

            if (vd.roof_condition_score != null) {
                const score = vd.roof_condition_score;
                const scoreColor = score >= 7 ? '#28a745' : score >= 4 ? '#f39c12' : '#dc3545';
                const scoreLabel = score >= 7 ? 'Good' : score >= 4 ? 'Fair' : 'Poor';
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 13px;';
                row.innerHTML = `<span>🔍 Roof Condition</span><span style="font-weight:600; color:${scoreColor};">${score}/10 (${scoreLabel})</span>`;
                fieldBox.appendChild(row);
            }

            panels.visual.appendChild(fieldBox);

            // Hazard checkboxes — these flow into `merged` so the Use button applies them.
            // Initial checked state reflects what the AI detected; user can correct.
            const hazardBox = document.createElement('div');
            hazardBox.style.cssText = 'background: #fef6e4; border-radius: 8px; padding: 12px; margin-bottom: 12px;';
            const hHeader = document.createElement('p');
            hHeader.style.cssText = 'font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #333;';
            hHeader.textContent = 'Hazard Findings (uncheck any that are wrong)';
            hazardBox.appendChild(hHeader);

            // onApply runs after applyParcelData and writes directly to form fields.
            // `applyParcelData` handles `pool` on its own, so merged.pool suffices; trampoline isn't covered there.
            const setField = (id, value) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (el.tagName === 'SELECT') {
                    const opts = Array.from(el.options).map(o => o.value);
                    if (!opts.includes(String(value))) return;
                }
                el.value = value;
                this.data[id] = value;
                this.markAutoFilled(el, 'vision');
            };
            const hazardDefs = [
                { id: 'vis_hz_pool',   label: '🏊 Pool',                          detected: vd.has_pool === true,                   onApply: (m) => { m.pool = 'In Ground'; } },
                { id: 'vis_hz_tramp',  label: '🎪 Trampoline',                     detected: vd.has_trampoline === true,             onApply: ()  => { setField('trampoline', 'Yes'); } },
                { id: 'vis_hz_tree',   label: '🌲 Tree overhanging roof',         detected: vd.tree_overhang_roof === true,         onApply: ()  => { /* noted — appears in Underwriter Notes */ } },
                { id: 'vis_hz_brush',  label: '🔥 Inadequate brush clearance',    detected: vd.brush_clearance_adequate === false,  onApply: ()  => { /* noted — appears in Underwriter Notes */ } },
            ];
            this._visionHazardApply = []; // collected by Use button
            hazardDefs.forEach(h => {
                const label = document.createElement('label');
                label.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; cursor: pointer;';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = h.id;
                cb.checked = h.detected;
                label.appendChild(cb);
                const text = document.createElement('span');
                text.textContent = `${h.label}${h.detected ? ' — detected' : ''}`;
                label.appendChild(text);
                hazardBox.appendChild(label);
                this._visionHazardApply.push({ cb, onApply: h.onApply });
            });
            panels.visual.appendChild(hazardBox);

            // Other hazards (freeform list)
            if (Array.isArray(vd.visible_hazards) && vd.visible_hazards.length) {
                const vh = document.createElement('div');
                vh.style.cssText = 'background: #fff; border-radius: 8px; padding: 10px; border: 1px solid #e0e0e0; margin-bottom: 12px;';
                vh.innerHTML = `<p style="font-size:11px; font-weight:600; color:#666; margin:0 0 4px 0;">OTHER OBSERVATIONS</p>
                    <ul style="margin:0; padding-left:18px; font-size:12px; color:#555;">${vd.visible_hazards.map(h => `<li>${Utils.escapeHTML(String(h))}</li>`).join('')}</ul>`;
                panels.visual.appendChild(vh);
            }

            // Underwriter notes
            if (vd.notes) {
                const nb = document.createElement('div');
                nb.style.cssText = 'background: #fff; border-radius: 8px; padding: 10px; border: 1px solid #e0e0e0; font-size: 12px; color: #555;';
                nb.innerHTML = `<p style="font-size:11px; font-weight:600; color:#666; margin:0 0 4px 0;">📝 UNDERWRITER NOTES</p><p style="margin:0;">${Utils.escapeHTML(vd.notes)}</p>`;
                panels.visual.appendChild(nb);
            }
        }

        // Add all panels to content
        Object.values(panels).forEach(p => content.appendChild(p));

        // Activate summary tab by default
        activateTab('summary');

        // summary count used for "Use This Data" button label
        const fieldsWithData = summaryFields.filter(f => f.value != null && f.value !== '' && f.value !== 'N/A');

        // Buttons
        const buttonBox = document.createElement('div');
        buttonBox.style.cssText = 'display: flex; gap: 12px; margin-top: 16px;';

        const useBtn = document.createElement('button');
        useBtn.textContent = `✓ Use This Data (${summaryCount} fields)`;
        useBtn.style.cssText = `
            flex: 1; padding: 12px; background: #28a745; color: white;
            border: none; border-radius: 6px; font-weight: 600;
            cursor: pointer; font-size: 14px;
        `;
        useBtn.onclick = () => {
            // Fold confirmed hazard checkboxes into `merged` before applying.
            // Checked = user confirmed AI detection; unchecked = user rejected it.
            if (this._visionHazardApply) {
                this._visionHazardApply.forEach(({ cb, onApply }) => {
                    if (cb && cb.checked) onApply(merged);
                });
                this._visionHazardApply = null;
            }
            this.applyParcelData(merged);
            if (zillowData && zillowData.data) {
                this.applyZillowSelects(zillowData.data);
            }
            if (fireData) {
                this.applyFireStationData(fireData);
            }
            // Smart Defaults — set standard HO3 assumptions unless data says otherwise
            if (!this.data.dwellingUsage) {
                this.data.dwellingUsage = 'Primary';
                const el = document.getElementById('dwellingUsage');
                if (el) {
                    el.value = 'Primary';
                    this.markAutoFilled(el, 'smart');
                }
            }
            if (!this.data.occupancyType) {
                this.data.occupancyType = 'Owner Occupied';
                const el = document.getElementById('occupancyType');
                if (el) {
                    el.value = 'Owner Occupied';
                    this.markAutoFilled(el, 'smart');
                }
            }
            this.closeParcelModal();
            this.save();
            const count = fieldsWithData.length;
            this.toast(`Applied ${count} field${count !== 1 ? 's' : ''} from ${sources.join(' + ')}`);
        };

        const skipBtn = document.createElement('button');
        skipBtn.textContent = '✗ Skip';
        skipBtn.style.cssText = `
            flex: 0 0 auto; padding: 12px 20px; background: #6c757d; color: white;
            border: none; border-radius: 6px; font-weight: 600;
            cursor: pointer; font-size: 14px;
        `;
        skipBtn.onclick = () => this.closeParcelModal();

        buttonBox.appendChild(useBtn);
        buttonBox.appendChild(skipBtn);
        content.appendChild(buttonBox);

        modal.appendChild(content);
        modal.onclick = (e) => {
            if (e.target === modal) this.closeParcelModal();
        };
        document.body.appendChild(modal);
    },

});
