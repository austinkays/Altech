// js/app-property.js — Property research, GIS intelligence, map utilities, parcel popups
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {

    // ── Block 1: Map/address utilities (originally ~L4825-4953) ──

    getFullAddress(data = this.data) {
        const parts = [data.addrStreet, data.addrCity, data.addrState, data.addrZip].filter(Boolean);
        return parts.join(', ').trim();
    },

    getMapUrls(address) {
        if (!address || !this.mapApiKey) return null;
        const encoded = encodeURIComponent(address);
        const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${encoded}&fov=80&pitch=0&key=${this.mapApiKey}`;
        const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encoded}&zoom=19&size=640x360&maptype=satellite&key=${this.mapApiKey}`;
        return { streetViewUrl, satelliteUrl };
    },

    async updateMapPreviews() {
        const hint = document.getElementById('mapPreviewHint');
        const streetImg = document.getElementById('streetViewImg');
        const satImg = document.getElementById('satelliteViewImg');
        if (!streetImg || !satImg) return;

        streetImg.onclick = () => this.openStreetView();
        satImg.onclick = () => this.openGoogleMaps();

        const address = this.getFullAddress();
        if (!address) {
            if (hint) hint.textContent = 'Enter an address to load previews.';
            streetImg.removeAttribute('src');
            satImg.removeAttribute('src');
            return;
        }

        const apiKey = await this.ensureMapApiKey();
        if (!apiKey) {
            if (hint) hint.textContent = 'Map previews unavailable (API key not configured).';
            return;
        }

        const cached = this.mapPreviewCache[address];
        if (cached) {
            streetImg.src = cached.streetViewUrl;
            satImg.src = cached.satelliteUrl;
            if (hint) hint.textContent = ' '; 
            return;
        }

        const urls = this.getMapUrls(address);
        if (!urls) return;

        this.mapPreviewCache[address] = urls;
        streetImg.src = urls.streetViewUrl;
        satImg.src = urls.satelliteUrl;
        if (hint) hint.textContent = ' ';
    },

    scheduleMapPreviewUpdate() {
        clearTimeout(this.mapPreviewTimer);
        this.mapPreviewTimer = setTimeout(() => this.updateMapPreviews(), 450);
    },

    openGoogleMaps() {
        const address = this.getFullAddress();
        if (!address) return;
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
    },

    openGoogleEarth() {
        const address = this.getFullAddress();
        if (!address) return;
        window.open(`https://earth.google.com/web/search/${encodeURIComponent(address)}`, '_blank');
    },

    async openStreetView() {
        const address = this.getFullAddress();
        if (!address) return;

        try {
            const apiKey = await this.ensureMapApiKey();
            if (apiKey) {
                const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
                const res = await fetch(geocodeUrl);
                if (res.ok) {
                    const data = await res.json();
                    const loc = data?.results?.[0]?.geometry?.location;
                    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                        window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.lat},${loc.lng}`, '_blank');
                        return;
                    }
                }
            }
        } catch (e) {}

        window.open(`https://www.google.com/maps/@?api=1&map_action=pano&query=${encodeURIComponent(address)}`, '_blank');
    },

    async fetchImageDataUrl(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const base64 = btoa(String.fromCharCode(...bytes));
            const contentType = res.headers.get('content-type') || 'image/jpeg';
            const format = contentType.includes('png') ? 'PNG' : 'JPEG';
            return { dataUrl: `data:${contentType};base64,${base64}`, format };
        } catch (e) {
            return null;
        }
    },

    async getMapImages(address) {
        const apiKey = await this.ensureMapApiKey();
        if (!apiKey || !address) return null;
        const urls = this.getMapUrls(address);
        if (!urls) return null;

        const cacheKey = `${address}::data`;
        if (this.mapPreviewCache[cacheKey]) return this.mapPreviewCache[cacheKey];

        const [street, sat] = await Promise.all([
            this.fetchImageDataUrl(urls.streetViewUrl),
            this.fetchImageDataUrl(urls.satelliteUrl)
        ]);

        const result = {
            streetView: street,
            satellite: sat
        };
        this.mapPreviewCache[cacheKey] = result;
        return result;
    },

    // ── Block 2: Property research + parcel/unified popups (originally ~L5766-7023) ──

    openZillow() {
        const a = `${this.data.addrStreet || ''} ${this.data.addrCity || ''} ${this.data.addrState || ''} ${this.data.addrZip || ''}`.trim();
        if (!a) { alert('Please enter an address first.'); return; }
        // Google search for Zillow listing — clicking through from Google bypasses Zillow's CAPTCHA
        window.open(`https://www.google.com/search?q=${encodeURIComponent(a + ' zillow')}`, '_blank');
    },

    // ── Import Property Data from Chrome Extension ──
    // Reads clipboard JSON from extension's "Copy for Altech" button
    async importPropertyFromExtension() {
        let text = '';
        try {
            text = await navigator.clipboard.readText();
        } catch (e) {
            // Clipboard API failed — show prompt
            text = prompt('Paste the property data from the extension (Ctrl+V):');
        }

        if (!text || !text.trim()) {
            this.toast('⚠️ Clipboard is empty. In the extension, click "📋 Copy for Altech" first.');
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            this.toast('⚠️ Clipboard doesn\'t contain valid property data JSON.');
            return;
        }

        // Validate it's from our extension
        if (!parsed._altech_property || !parsed.data) {
            this.toast('⚠️ Not property data. Use the extension\'s "📋 Copy for Altech" button.');
            return;
        }

        const data = parsed.data;
        let filled = 0;

        // Map scraped field keys to Altech form IDs
        const fieldMap = {
            yrBuilt: 'yrBuilt',
            sqFt: 'sqFt',
            lotSize: 'lotSize',
            bedrooms: 'bedrooms',
            fullBaths: 'fullBaths',
            halfBaths: 'halfBaths',
            numStories: 'numStories',
            numOccupants: 'numOccupants',
            constructionStyle: 'constructionStyle',
            exteriorWalls: 'exteriorWalls',
            foundation: 'foundation',
            garageType: 'garageType',
            garageSpaces: 'garageSpaces',
            roofType: 'roofType',
            roofShape: 'roofShape',
            roofYr: 'roofYr',
            heatingType: 'heatingType',
            heatYr: 'heatYr',
            cooling: 'cooling',
            plumbYr: 'plumbYr',
            elecYr: 'elecYr',
            flooring: 'flooring',
            numFireplaces: 'numFireplaces',
            pool: 'pool',
            woodStove: 'woodStove',
            sewer: 'sewer',
            waterSource: 'waterSource',
            dwellingType: 'dwellingType',
            dwellingUsage: 'dwellingUsage',
            occupancyType: 'occupancyType',
            kitchenQuality: 'kitchenQuality',
            purchaseDate: 'purchaseDate',
            assessedValue: 'propertyValue',
            ownerName: 'ownerName',
            parcelId: 'parcelId',
        };

        for (const [srcKey, formId] of Object.entries(fieldMap)) {
            const value = data[srcKey];
            if (!value) continue;

            const el = document.getElementById(formId);
            if (!el) continue;

            // Only fill if field is currently empty (don't overwrite user edits)
            if (el.value && el.value.trim()) continue;

            // For <select> elements, try to match the value to an option
            if (el.tagName === 'SELECT') {
                const options = Array.from(el.options);
                const exact = options.find(o => o.value.toLowerCase() === String(value).toLowerCase());
                const partial = options.find(o =>
                    o.value.toLowerCase().includes(String(value).toLowerCase()) ||
                    String(value).toLowerCase().includes(o.value.toLowerCase())
                );
                const match = exact || partial;
                if (match) {
                    el.value = match.value;
                    this.data[formId] = match.value;
                    this.markAutoFilled?.(el, 'extension');
                    filled++;
                }
            } else {
                el.value = String(value);
                this.data[formId] = String(value);
                this.markAutoFilled?.(el, 'extension');
                filled++;
            }
        }

        // Save all changes
        this.save({ target: { id: '_bulk', value: '' } });

        const source = parsed._source || 'unknown';
        const addr = parsed.address || '';
        this.toast(`✅ Imported ${filled} property fields from ${source}${addr ? ` (${addr})` : ''}`);
    },

    openPropertyRecords() {
        const address = this.data.addrStreet || '';
        const city = this.data.addrCity || '';
        const state = (this.data.addrState || '').toUpperCase();
        const zip = this.data.addrZip || '';
        const fullAddr = `${address} ${city} ${state} ${zip}`.trim();
        if (!address || !city || !state) {
            alert('Please enter a complete address (street, city, and state) first.');
            return;
        }
        // Copy address to clipboard so user can paste into assessor search
        navigator.clipboard.writeText(fullAddr).then(() => {
            this.toast('📋 Address copied — paste into the assessor search');
        }).catch(() => {});

        const cityLower = city.toLowerCase().trim();

        // County GIS direct links by state → city
        const gisUrls = {
            'WA': {
                'vancouver': 'https://gis.clark.wa.gov/gishome/property/', 'camas': 'https://gis.clark.wa.gov/gishome/property/', 'battle ground': 'https://gis.clark.wa.gov/gishome/property/', 'ridgefield': 'https://gis.clark.wa.gov/gishome/property/', 'la center': 'https://gis.clark.wa.gov/gishome/property/', 'washougal': 'https://gis.clark.wa.gov/gishome/property/',
                'seattle': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'bellevue': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'redmond': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'kent': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'renton': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'federal way': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'kirkland': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'auburn': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'sammamish': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx', 'bothell': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
                'tacoma': 'https://atip.piercecountywa.gov/app/parcel-search', 'lakewood': 'https://atip.piercecountywa.gov/app/parcel-search', 'puyallup': 'https://atip.piercecountywa.gov/app/parcel-search', 'bonney lake': 'https://atip.piercecountywa.gov/app/parcel-search', 'university place': 'https://atip.piercecountywa.gov/app/parcel-search',
                'everett': 'https://www.snoco.org/proptax/default.aspx', 'marysville': 'https://www.snoco.org/proptax/default.aspx', 'lynnwood': 'https://www.snoco.org/proptax/default.aspx', 'edmonds': 'https://www.snoco.org/proptax/default.aspx', 'mountlake terrace': 'https://www.snoco.org/proptax/default.aspx',
                'spokane': 'https://mapgis.spokanecounty.org/SCGIS2/Parcel/', 'spokane valley': 'https://mapgis.spokanecounty.org/SCGIS2/Parcel/',
                'bremerton': 'https://psearch.kitsap.gov/psearch/', 'silverdale': 'https://psearch.kitsap.gov/psearch/', 'poulsbo': 'https://psearch.kitsap.gov/psearch/',
                'olympia': 'https://taxlot.co.thurston.wa.us/', 'lacey': 'https://taxlot.co.thurston.wa.us/', 'tumwater': 'https://taxlot.co.thurston.wa.us/',
                'bellingham': 'https://www.whatcomcounty.us/1476/Online-Property-Search',
                'yakima': 'https://www.co.yakima.wa.us/497/Property-Information-Public-Inquiry',
                'longview': 'https://cowlitzassessor.us/', 'kelso': 'https://cowlitzassessor.us/',
            },
            'OR': {
                'portland': 'https://www.portlandmaps.com/', 'gresham': 'https://www.portlandmaps.com/', 'troutdale': 'https://www.portlandmaps.com/', 'wood village': 'https://www.portlandmaps.com/', 'fairview': 'https://www.portlandmaps.com/',
                'beaverton': 'https://www.washingtoncountyor.gov/at/property-information', 'hillsboro': 'https://www.washingtoncountyor.gov/at/property-information', 'tigard': 'https://www.washingtoncountyor.gov/at/property-information', 'tualatin': 'https://www.washingtoncountyor.gov/at/property-information', 'lake oswego': 'https://www.washingtoncountyor.gov/at/property-information', 'west linn': 'https://www.washingtoncountyor.gov/at/property-information', 'sherwood': 'https://www.washingtoncountyor.gov/at/property-information', 'forest grove': 'https://www.washingtoncountyor.gov/at/property-information', 'cornelius': 'https://www.washingtoncountyor.gov/at/property-information',
                'oregon city': 'https://ascendweb.clackamas.us/', 'milwaukie': 'https://ascendweb.clackamas.us/', 'happy valley': 'https://ascendweb.clackamas.us/', 'wilsonville': 'https://ascendweb.clackamas.us/', 'canby': 'https://ascendweb.clackamas.us/', 'sandy': 'https://ascendweb.clackamas.us/', 'estacada': 'https://ascendweb.clackamas.us/',
                'eugene': 'https://apps.lanecounty.org/PropertyAccountInformation/', 'springfield': 'https://apps.lanecounty.org/PropertyAccountInformation/', 'cottage grove': 'https://apps.lanecounty.org/PropertyAccountInformation/', 'creswell': 'https://apps.lanecounty.org/PropertyAccountInformation/', 'veneta': 'https://apps.lanecounty.org/PropertyAccountInformation/',
                'salem': 'https://mcasr.co.marion.or.us/', 'keizer': 'https://mcasr.co.marion.or.us/', 'woodburn': 'https://mcasr.co.marion.or.us/', 'silverton': 'https://mcasr.co.marion.or.us/',
                'bend': 'https://dial.deschutes.org/', 'redmond': 'https://dial.deschutes.org/', 'sisters': 'https://dial.deschutes.org/', 'la pine': 'https://dial.deschutes.org/',
                'medford': 'http://pdo.jacksoncountyor.gov/pdo', 'ashland': 'http://pdo.jacksoncountyor.gov/pdo', 'central point': 'http://pdo.jacksoncountyor.gov/pdo', 'phoenix': 'http://pdo.jacksoncountyor.gov/pdo', 'talent': 'http://pdo.jacksoncountyor.gov/pdo',
                'albany': 'https://www.linncountyassessor.com/', 'lebanon': 'https://www.linncountyassessor.com/', 'sweet home': 'https://www.linncountyassessor.com/',
                'roseburg': 'https://apps.co.douglas.or.us/onlineservices/PropertyViewer/', 'sutherlin': 'https://apps.co.douglas.or.us/onlineservices/PropertyViewer/', 'winston': 'https://apps.co.douglas.or.us/onlineservices/PropertyViewer/',
            },
            'AZ': {
                'phoenix': 'https://mcassessor.maricopa.gov/', 'mesa': 'https://mcassessor.maricopa.gov/', 'chandler': 'https://mcassessor.maricopa.gov/', 'scottsdale': 'https://mcassessor.maricopa.gov/', 'glendale': 'https://mcassessor.maricopa.gov/', 'tempe': 'https://mcassessor.maricopa.gov/', 'peoria': 'https://mcassessor.maricopa.gov/', 'surprise': 'https://mcassessor.maricopa.gov/', 'gilbert': 'https://mcassessor.maricopa.gov/', 'avondale': 'https://mcassessor.maricopa.gov/', 'goodyear': 'https://mcassessor.maricopa.gov/', 'buckeye': 'https://mcassessor.maricopa.gov/', 'el mirage': 'https://mcassessor.maricopa.gov/', 'queen creek': 'https://mcassessor.maricopa.gov/', 'cave creek': 'https://mcassessor.maricopa.gov/', 'fountain hills': 'https://mcassessor.maricopa.gov/', 'paradise valley': 'https://mcassessor.maricopa.gov/',
                'tucson': 'https://www.asr.pima.gov/assessor/', 'oro valley': 'https://www.asr.pima.gov/assessor/', 'marana': 'https://www.asr.pima.gov/assessor/', 'sahuarita': 'https://www.asr.pima.gov/assessor/',
                'casa grande': 'https://gis.pinalcountyaz.gov/parcelviewer/', 'apache junction': 'https://gis.pinalcountyaz.gov/parcelviewer/', 'coolidge': 'https://gis.pinalcountyaz.gov/parcelviewer/', 'eloy': 'https://gis.pinalcountyaz.gov/parcelviewer/', 'florence': 'https://gis.pinalcountyaz.gov/parcelviewer/', 'maricopa': 'https://gis.pinalcountyaz.gov/parcelviewer/',
                'prescott': 'https://gis.yavapaiaz.gov/v4/', 'prescott valley': 'https://gis.yavapaiaz.gov/v4/', 'chino valley': 'https://gis.yavapaiaz.gov/v4/', 'cottonwood': 'https://gis.yavapaiaz.gov/v4/', 'sedona': 'https://gis.yavapaiaz.gov/v4/',
                'flagstaff': 'https://www.coconino.az.gov/119/Assessor', 'williams': 'https://www.coconino.az.gov/119/Assessor',
                'lake havasu city': 'https://www.mohave.gov/departments/assessor/assessor-search/', 'kingman': 'https://www.mohave.gov/departments/assessor/assessor-search/', 'bullhead city': 'https://www.mohave.gov/departments/assessor/assessor-search/',
                'yuma': 'https://www.yumacountyaz.gov/government/assessor', 'san luis': 'https://www.yumacountyaz.gov/government/assessor', 'somerton': 'https://www.yumacountyaz.gov/government/assessor',
            }
        };

        // Try direct county GIS link
        const stateUrls = gisUrls[state];
        if (stateUrls && stateUrls[cityLower]) {
            const county = this.getCountyFromCity(city, state);
            this.toast(`📋 Address copied — opening ${county ? county + ' County' : city} assessor`);
            window.open(stateUrls[cityLower], '_blank');
            return;
        }

        // Fallback: open state assessor directory so user can find their county
        const stateDirectories = {
            'WA': 'https://www.dor.wa.gov/find-taxes-rates/property-tax/county-assessors',
            'OR': 'https://www.oregon.gov/dor/forms/pages/county-assessor.aspx',
            'AZ': 'https://azdor.gov/property-appraisal/county-assessors-information',
        };
        if (stateDirectories[state]) {
            const county = this.getCountyFromCity(city, state);
            this.toast(`📋 Address copied — find ${county ? county + ' County' : 'your county'} on the directory`);
            window.open(stateDirectories[state], '_blank');
        } else {
            // Unknown state — Google for their county assessor
            this.toast('📋 Address copied — searching for county assessor');
            window.open(`https://www.google.com/search?q=${encodeURIComponent(city)}+${encodeURIComponent(state)}+county+assessor+property+search`, '_blank');
        }
    },

    copyAddress() {
        const address = this.data.addrStreet || '';
        const city = this.data.addrCity || '';
        const state = this.data.addrState || '';
        const zip = this.data.addrZip || '';
        const fullAddr = `${address} ${city} ${state} ${zip}`.trim();
        if (!fullAddr) { this.toast('⚠️ Enter an address first'); return; }
        navigator.clipboard.writeText(fullAddr).then(() => {
            this.toast('📋 Address copied to clipboard');
        }).catch(() => {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = fullAddr;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            this.toast('📋 Address copied to clipboard');
        });
    },

    openPropertyResearch() {
        const address = this.data.addrStreet || '';
        const city = this.data.addrCity || '';
        const state = this.data.addrState || '';
        const zip = this.data.addrZip || '';
        
        if (!address || !city || !state) {
            alert('Please enter a complete address (street, city, and state) first.');
            return;
        }
        
        // Open research tools in new tabs/windows
        const addr = `${address} ${city} ${state} ${zip}`.trim();
        const zillowUrl = `https://www.google.com/search?q=site:zillow.com+${encodeURIComponent(addr)}&btnI`;
        window.open(zillowUrl, 'zillow');
        
        // Also trigger GIS if available
        setTimeout(() => this.openGIS(), 500);
    },

    async smartAutoFill() {
        const address = this.data.addrStreet || '';
        const city = this.data.addrCity || '';
        const state = this.data.addrState || '';
        const zip = this.data.addrZip || '';

        if (!address || !city || !state) {
            alert('Please enter a complete address (street, city, and state) first.');
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

        try {
            btn.disabled = true;
            btn.innerHTML = '🔄 Gathering property data from all sources...';

            // Fire ALL enrichment sources in parallel
            const [arcgisResult, zillowResult, fireStationResult] = await Promise.allSettled([
                this.fetchArcgisAndRag(address, city, state, county),
                this.fetchZillowData(address, city, state, zip),
                this.fetchFireStationData(address, city, state, zip)
            ]);

            let arcgisData = arcgisResult.status === 'fulfilled' ? arcgisResult.value : null;
            let zillowData = zillowResult.status === 'fulfilled' ? zillowResult.value : null;
            const fireData = fireStationResult.status === 'fulfilled' ? fireStationResult.value : null;

            console.log('[SmartFill] Results:', {
                arcgis: arcgisData ? arcgisData.source : 'none',
                zillow: zillowData ? zillowData.source : 'none',
                fire: fireData ? 'ok' : 'none'
            });

            // If no property details (only fire data), try direct Gemini property search
            if (!arcgisData && !zillowData) {
                btn.innerHTML = '🔄 Searching property records via AI...';
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

            // If we have any structured data, show unified popup
            if (arcgisData || zillowData || fireData) {
                btn.innerHTML = originalText;
                btn.disabled = false;
                this.showUnifiedDataPopup(arcgisData, zillowData, fireData, address, city, state);
                return;
            }

            // FALLBACK: No structured data — try satellite imagery
            btn.innerHTML = '🔄 Analyzing satellite imagery...';

            const hazardResponse = await fetch('/api/property-intelligence?mode=satellite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, city, state, zip })
            });

            if (!hazardResponse.ok) {
                throw new Error('Failed to analyze property');
            }

            const result = await hazardResponse.json();

            if (!result.success) {
                throw new Error(result.error || 'Analysis failed');
            }

            btn.innerHTML = originalText;
            btn.disabled = false;

            const fullAddress = `${address}, ${city}, ${state} ${zip || ''}`.trim();
            this.showHazardDetectionPopup(result.data, result.satelliteImage, fullAddress, result.streetViewImage);

        } catch (error) {
            console.error('Smart auto-fill error:', error);
            btn.innerHTML = '❌ Failed';
            alert('Failed to retrieve property data.\n\nTry:\n- Manually entering details\n- Using Zillow or GIS lookup\n- Checking County property records');

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

            // Try RAG interpretation
            const ragResponse = await fetch('/api/rag-interpreter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawParcelData: arcgisData.parcelData, county })
            });
            if (ragResponse.ok) {
                const ragData = await ragResponse.json();
                if (ragData.success && ragData.parcelData) {
                    return { data: ragData.parcelData, source: 'arcgis-rag', confidence: 0.99 };
                }
            }
            // RAG failed, return raw ArcGIS data
            const result = { data: arcgisData.parcelData, source: 'arcgis-raw', confidence: 0.95 };
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
                body: JSON.stringify({ address, city, state, zip })
            });
            if (!resp.ok) return null;
            const result = await resp.json();
            if (!result.success || !result.data) {
                console.warn('[Zillow] No data:', result.error);
                return null;
            }
            return { data: result.data, source: result.source, zillowUrl: result.zillowUrl };
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

    // Direct Gemini property lookup fallback (no server needed)
    async fetchPropertyViaGemini(address, city, state, zip) {
        const key = await this._getGeminiKey();
        if (!key) return null;

        const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
        console.log('[GeminiProperty] Searching for:', fullAddress);

        const prompt = `Find detailed property/home facts for this specific address: ${fullAddress}

Search real estate listings, public records, and property databases for this exact property. I need EVERY available construction and feature detail for insurance underwriting.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "heating": "heating system type (e.g. Forced Air, Baseboard, Heat Pump, Boiler, Radiant, Electric)",
  "cooling": "cooling system type (e.g. Central Air, Window Units, None)",
  "roofType": "roof material (e.g. Composition, Asphalt Shingle, Metal, Tile, Wood Shake, Slate)",
  "roofYearUpdated": year_number_or_null,
  "foundation": "foundation type (e.g. Crawl Space, Slab, Basement, Pier, Daylight Basement)",
  "basementFinishPct": percentage_number_or_null,
  "construction": "construction type (e.g. Wood Frame, Masonry, Brick, Stucco, Log)",
  "exterior": "exterior wall material (e.g. Vinyl Siding, Wood Siding, Brick, Stucco, Fiber Cement, Hardie, Stone)",
  "garageType": "Attached or Detached or Built-in or Carport or None",
  "garageSpaces": number_or_null,
  "bedrooms": number_or_null,
  "bathrooms": number_or_null,
  "yearBuilt": number_or_null,
  "stories": number_or_null,
  "livingArea": square_feet_number_or_null,
  "flooring": "primary flooring (e.g. Hardwood, Carpet, Tile, Laminate, Mixed)",
  "fireplaces": number_or_null,
  "sewer": "Public or Septic or null",
  "waterSource": "Public or Well or null",
  "pool": "Yes or No or null",
  "woodStove": "Yes or No or null",
  "notes": "source of data and confidence level"
}

IMPORTANT: Use null for any field you cannot find. Only include data for THIS SPECIFIC address.`;

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
            const nonNullKeys = Object.keys(raw).filter(k => raw[k] != null && k !== 'notes');
            if (nonNullKeys.length < 2) return null;

            console.log(`[GeminiProperty] Found ${nonNullKeys.length} fields: ${nonNullKeys.join(', ')}`);

            // Map to the format showUnifiedDataPopup expects (same as Zillow data shape)
            const data = {};
            if (raw.heating) data.heatingType = raw.heating;
            if (raw.cooling) data.cooling = raw.cooling;
            if (raw.roofType) data.roofType = raw.roofType;
            if (raw.foundation) data.foundation = raw.foundation;
            if (raw.construction) data.constructionStyle = raw.construction;
            if (raw.exterior) data.exteriorWalls = raw.exterior;
            if (raw.garageSpaces != null) data.garageSpaces = raw.garageSpaces;
            if (raw.garageType) data.garageType = raw.garageType;
            if (raw.bedrooms != null) data.bedrooms = raw.bedrooms;
            if (raw.bathrooms != null) data.fullBaths = raw.bathrooms;
            if (raw.yearBuilt != null) { data.yearBuilt = raw.yearBuilt; data.yrBuilt = raw.yearBuilt; }
            if (raw.stories != null) { data.stories = raw.stories; }
            if (raw.livingArea != null) { data.totalSqft = raw.livingArea; }
            if (raw.fireplaces != null) data.numFireplaces = raw.fireplaces;
            if (raw.roofYearUpdated != null) data.roofYr = raw.roofYearUpdated;
            if (raw.basementFinishPct != null) data.basementFinishPct = raw.basementFinishPct;
            if (raw.flooring) data.flooring = raw.flooring;
            if (raw.sewer) data.sewer = raw.sewer;
            if (raw.waterSource) data.waterSource = raw.waterSource;
            if (raw.pool) data.pool = raw.pool;
            if (raw.woodStove) data.woodStove = raw.woodStove;

            return { data, source: 'gemini-direct' };
        } catch (err) {
            console.warn('[GeminiProperty] Error:', err.message);
            return null;
        }
    },

    getGISUrlForCounty(city, state) {
        // Returns the GIS URL for browser fallback (from existing openGIS() method)
        // This allows Phase 2 to access the same county websites
        const countyMappings = {
            'WA': {
                'Vancouver': 'https://gis.clark.wa.gov/gishome/property/',
                'Seattle': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
                'Tacoma': 'https://atip.piercecountywa.gov/app/parcel-search',
                'Spokane': 'https://mapgis.spokanecounty.org/SCGIS2/Parcel/'
            },
            'OR': {
                'Portland': 'https://ggis.multco.us/',
                'Salem': 'https://www.marionco.us/assessor/',
                'Eugene': 'https://www.lanecountygov.org/'
            },
            'AZ': {
                'Phoenix': 'https://gis.maricopa.gov/',
                'Tucson': 'https://www.pimacountyassessor.com/'
            }
        };
        
        const stateMap = countyMappings[state];
        return stateMap ? stateMap[city] || '' : '';
    },

    showParcelDataPopup(parcelData, address, city, state, confidence = 1.0, dataSource = 'unknown') {
        // Display official county parcel data in confirmation popup
        // confidence: 1.0 = ArcGIS API, 0.99 = RAG interpreted, 0.85 = browser scraping
        // dataSource: 'phase1-arcgis', 'phase2-browser', or 'phase3-rag'
        
        const modal = document.createElement('div');
        modal.id = 'parcelDataModal';
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
        
        // Determine title and styling based on confidence/data source
        let titleText = '✓ Official County Parcel Data Found';
        let titleColor = '#28a745';
        let warningText = null;
        
        if (confidence === 0.99) {
            titleText = '✓ Property Data Verified & Standardized';
            titleColor = '#28a745';
            warningText = 'Data has been verified and standardized for accuracy (99% confidence).';
        } else if (confidence === 0.95) {
            titleText = '✓ Official County Parcel Data Found';
            titleColor = '#28a745';
        } else if (confidence < 0.95) {
            titleText = '✓ Extracted County Data (Browser)';
            titleColor = '#ffc107';
            warningText = '⚠ Data extracted from county website (' + Math.round(confidence * 100) + '% confidence). Please review before submitting.';
        }
        
        const title = document.createElement('h2');
        title.textContent = titleText;
        title.style.cssText = `margin: 0 0 16px 0; color: ${titleColor};`;
        
        const addressLine = document.createElement('p');
        addressLine.style.cssText = 'color: #666; margin: 8px 0; font-size: 14px;';
        addressLine.textContent = `${address}, ${city}, ${state} • Parcel: ${parcelData.parcelId}`;
        
        content.appendChild(title);
        content.appendChild(addressLine);
        
        // Add appropriate warning/confirmation banner
        if (warningText) {
            const banner = document.createElement('p');
            const bannerBgColor = confidence === 0.99 ? '#d4edda' : '#fff3cd';
            const bannerBorderColor = confidence === 0.99 ? '#28a745' : '#ffc107';
            const bannerTextColor = confidence === 0.99 ? '#155724' : '#856404';
            banner.style.cssText = `background: ${bannerBgColor}; border-left: 4px solid ${bannerBorderColor}; padding: 8px 12px; margin: 12px 0; font-size: 12px; color: ${bannerTextColor}; border-radius: 3px;`;
            banner.textContent = warningText;
            content.appendChild(banner);
        }
        
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0;';
        
        const fields = [
            { label: 'Year Built', value: parcelData.yearBuilt || 'N/A' },
            { label: 'Stories', value: parcelData.stories > 0 ? parcelData.stories : 'N/A' },
            { label: 'Total Sq Ft', value: parcelData.totalSqft > 0 ? parcelData.totalSqft.toLocaleString() : 'N/A' },
            { label: 'Lot Size', value: parcelData.lotSizeAcres > 0 ? `${parcelData.lotSizeAcres.toFixed(2)} acres` : 'N/A' },
            { label: 'Bedrooms', value: parcelData.bedrooms > 0 ? parcelData.bedrooms : 'N/A' },
            { label: 'Bathrooms', value: parcelData.bathrooms > 0 ? parcelData.bathrooms : 'N/A' },
            { label: 'Garage Spaces', value: parcelData.garageSpaces > 0 ? parcelData.garageSpaces : (parcelData.garageSqft > 0 ? `${Math.round(parcelData.garageSqft / 180)} (est.)` : 'N/A') },
            { label: 'Foundation', value: parcelData.foundationType || 'N/A' },
            { label: 'Roof Type', value: parcelData.roofType || 'N/A' },
            { label: 'Heating Type', value: parcelData.heatingType || 'N/A' },
            { label: 'Construction', value: parcelData.constructionStyle || 'N/A' },
            { label: 'Land Use', value: parcelData.landUse || 'N/A' }
        ];
        
        fields.forEach(field => {
            const box = document.createElement('div');
            box.style.cssText = 'background: #f5f5f5; padding: 12px; border-radius: 6px;';
            
            const label = document.createElement('div');
            label.style.cssText = 'font-size: 12px; color: #999; text-transform: uppercase; margin-bottom: 4px;';
            label.textContent = field.label;
            
            const value = document.createElement('div');
            value.style.cssText = 'font-size: 16px; font-weight: 600; color: #333;';
            value.textContent = field.value;
            
            box.appendChild(label);
            box.appendChild(value);
            grid.appendChild(box);
        });
        
        const buttonBox = document.createElement('div');
        buttonBox.style.cssText = 'display: flex; gap: 12px; margin-top: 20px;';
        
        const useBtn = document.createElement('button');
        useBtn.textContent = '✓ Use This Data';
        useBtn.style.cssText = `
            flex: 1;
            padding: 12px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
        `;
        useBtn.onclick = () => {
            this.applyParcelData(parcelData);
            this.closeParcelModal();
            // Fire enrichments in background (non-blocking)
            this.enrichWithZillow(address, city, state);
            this.enrichFireStation(address, city, state);
        };
        
        const skipBtn = document.createElement('button');
        skipBtn.textContent = '✗ Skip';
        skipBtn.style.cssText = `
            flex: 1;
            padding: 12px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
        `;
        skipBtn.onclick = () => this.closeParcelModal();
        
        buttonBox.appendChild(useBtn);
        buttonBox.appendChild(skipBtn);
        
        content.appendChild(title);
        content.appendChild(addressLine);
        content.appendChild(grid);
        content.appendChild(buttonBox);
        modal.appendChild(content);
        
        modal.onclick = (e) => {
            if (e.target === modal) this.closeParcelModal();
        };
        
        document.body.appendChild(modal);
    },

    closeParcelModal() {
        const modal = document.getElementById('parcelDataModal');
        if (modal) {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.3s ease';
            setTimeout(() => modal.remove(), 300);
        }
    },

    showUnifiedDataPopup(arcgisData, zillowData, fireData, address, city, state) {
        // Merge data from all sources: ArcGIS (primary) → Zillow (fill gaps) → FireStation
        const merged = {};
        const sources = [];

        if (arcgisData && arcgisData.data) {
            Object.assign(merged, arcgisData.data);
            sources.push('County Records');
        }

        if (zillowData && zillowData.data) {
            const zd = zillowData.data;
            sources.push('Property Listings');
            // Only fill gaps — don't overwrite ArcGIS data
            if (!merged.heatingType && zd.heatingType) merged.heatingType = zd.heatingType;
            if (!merged.cooling && zd.cooling) merged.cooling = zd.cooling;
            if (!merged.roofType && zd.roofType) merged.roofType = zd.roofType;
            if (!merged.foundationType && zd.foundation) merged.foundationType = zd.foundation;
            if (!merged.constructionStyle && zd.constructionStyle) merged.constructionStyle = zd.constructionStyle;
            if (!merged.exteriorWalls && zd.exteriorWalls) merged.exteriorWalls = zd.exteriorWalls;
            if ((!merged.yearBuilt || merged.yearBuilt === 0) && zd.yearBuilt) merged.yearBuilt = zd.yearBuilt;
            if ((!merged.stories || merged.stories === 0) && zd.stories) merged.stories = zd.stories;
            if ((!merged.totalSqft || merged.totalSqft === 0) && zd.totalSqft) merged.totalSqft = zd.totalSqft;
            if ((!merged.bedrooms || merged.bedrooms === 0) && zd.bedrooms) merged.bedrooms = zd.bedrooms;
            if ((!merged.bathrooms || merged.bathrooms === 0) && zd.fullBaths) merged.bathrooms = zd.fullBaths;
            if ((!merged.garageSpaces || merged.garageSpaces === 0) && zd.garageSpaces) merged.garageSpaces = zd.garageSpaces;
            if (zd.fireplace) merged.fireplace = zd.fireplace;
            if (!merged.garageType && zd.garageType) merged.garageType = zd.garageType;
            if (!merged.flooring && zd.flooring) merged.flooring = zd.flooring;
            if (!merged.numFireplaces && zd.numFireplaces) merged.numFireplaces = zd.numFireplaces;
            if (!merged.sewer && zd.sewer) merged.sewer = zd.sewer;
            if (!merged.waterSource && zd.waterSource) merged.waterSource = zd.waterSource;
            if (!merged.pool && zd.pool) merged.pool = zd.pool;
            if (!merged.woodStove && zd.woodStove) merged.woodStove = zd.woodStove;
            if (!merged.roofYr && zd.roofYr) merged.roofYr = zd.roofYr;
            if (!merged.basementFinishPct && zd.basementFinishPct) merged.basementFinishPct = zd.basementFinishPct;
        }

        if (fireData) {
            sources.push('Fire Protection');
            merged.fireStationDist = fireData.fireStationDist;
            merged.fireStationName = fireData.fireStationName;
            merged.protectionClass = fireData.protectionClass;
        }

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
            max-width: 520px; max-height: 85vh; overflow-y: auto;
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
        const badgeColors = { 'County Records': '#0066cc', 'Property Listings': '#6f42c1', 'Fire Protection': '#dc3545' };
        const badgeIcons = { 'County Records': '🏛', 'Property Listings': '🏠', 'Fire Protection': '🚒' };
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

        // Data grid
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0;';

        const fields = [
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
        ];

        // Add fire station fields if available
        if (fireData) {
            const reliabilityBadge = fireData.stationReliability === 'volunteer' ? ' 🟡' :
                                     fireData.stationReliability === 'review' ? ' ⚠️' : '';
            fields.push({ label: 'Fire Station', value: `${fireData.fireStationDist} mi — ${fireData.fireStationName || 'Nearest'}${reliabilityBadge}` });
            fields.push({ label: 'Protection Class', value: fireData.protectionClass });
            if (fireData.reviewNote) {
                fields.push({ label: 'Station Note', value: fireData.reviewNote });
            }
        }

        // Only show fields that have data
        const fieldsWithData = fields.filter(f => f.value != null && f.value !== '' && f.value !== 'N/A');

        fieldsWithData.forEach(field => {
            const box = document.createElement('div');
            box.style.cssText = 'background: #f5f5f5; padding: 10px; border-radius: 6px;';

            const label = document.createElement('div');
            label.style.cssText = 'font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 3px;';
            label.textContent = field.label;

            const value = document.createElement('div');
            value.style.cssText = 'font-size: 15px; font-weight: 600; color: #333;';
            value.textContent = field.value;

            box.appendChild(label);
            box.appendChild(value);
            grid.appendChild(box);
        });

        content.appendChild(grid);

        // Buttons
        const buttonBox = document.createElement('div');
        buttonBox.style.cssText = 'display: flex; gap: 12px; margin-top: 16px;';

        const useBtn = document.createElement('button');
        useBtn.textContent = `✓ Use This Data (${fieldsWithData.length} fields)`;
        useBtn.style.cssText = `
            flex: 1; padding: 12px; background: #28a745; color: white;
            border: none; border-radius: 6px; font-weight: 600;
            cursor: pointer; font-size: 14px;
        `;
        useBtn.onclick = () => {
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

    // Apply Zillow select-field values (dropdown fields that need option matching)
    applyZillowSelects(zd) {
        const selectFields = ['heatingType', 'cooling', 'roofType', 'foundation', 'constructionStyle', 'exteriorWalls', 'garageType', 'sewer', 'waterSource', 'flooring', 'pool', 'woodStove'];
        for (const fid of selectFields) {
            if (!zd[fid]) continue;
            const el = document.getElementById(fid);
            if (!el) continue;
            const opts = Array.from(el.options).map(o => o.value);
            if (opts.includes(zd[fid])) {
                el.value = zd[fid];
                this.data[fid] = zd[fid];
                this.markAutoFilled(el, 'zillow');
            }
        }
        // Text/number fields from Zillow
        const textFields = {
            yrBuilt: zd.yrBuilt,
            bedrooms: zd.bedrooms,
            fullBaths: zd.fullBaths,
            garageSpaces: zd.garageSpaces,
            numStories: zd.stories,
            sqFt: zd.totalSqft,
            numFireplaces: zd.numFireplaces,
            roofYr: zd.roofYr
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
                field.value = parcelData.stories;
                this.data.numStories = parcelData.stories;
                this.markAutoFilled(field, 'parcel');
                fieldsApplied++;
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
                body: JSON.stringify({ address, city, state, zip })
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
            alert('Please enter a complete address (street, city, and state) first.');
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

});
