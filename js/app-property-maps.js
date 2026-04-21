// js/app-property-maps.js — Address/maps/Street View/Redfin + Chrome extension bridge + listing URL lookup.
// Extracted from app-property.js during Phase 3 monolith decomposition (2026-04).
'use strict';

Object.assign(App, {
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

        if (typeof this.ensureMapApiKey !== 'function') return;
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

    async ensureMapApiKey() {
        if (this.mapApiKey) return this.mapApiKey;
        // Check if the Places loader already cached the key
        if (window.__CACHED_MAP_API_KEY__) {
            this.mapApiKey = window.__CACHED_MAP_API_KEY__;
            return this.mapApiKey;
        }
        try {
            const res = await (typeof Auth !== 'undefined' && Auth.apiFetch
                ? Auth.apiFetch('/api/config?type=keys')
                : fetch('/api/config?type=keys'));
            if (res.ok) {
                const data = await res.json();
                if (data.apiKey) {
                    this.mapApiKey = data.apiKey;
                    return data.apiKey;
                }
            }
        } catch (e) {
            console.warn('[Maps] Could not fetch API key:', e.message);
        }
        return null;
    },

    scheduleMapPreviewUpdate() {
        if (!this._debouncedMapPreview) this._debouncedMapPreview = Utils.debounce(() => this.updateMapPreviews(), 450);
        this._debouncedMapPreview();
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
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(geocodeUrl, { signal: controller.signal });
                clearTimeout(timer);
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
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
            }
            const base64 = btoa(binary);
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

    openRedfin() {
        const a = `${this.data.addrStreet || ''} ${this.data.addrCity || ''} ${this.data.addrState || ''} ${this.data.addrZip || ''}`.trim();
        if (!a) { this.toast('Please enter an address first.', 'error'); return; }
        // Google search for Redfin listing — clicking through from Google lands directly on the property page
        window.open(`https://www.google.com/search?q=${encodeURIComponent(a + ' redfin')}`, '_blank');
    },

    // ── Listing Search — Gemini Search Grounding for URL or Address ──
    // Accepts a Redfin/Zillow/Realtor URL or plain address, uses AI to extract property details.
    async lookupListingUrl(query) {
        if (!query || typeof query !== 'string' || !query.trim()) {
            this.toast('Paste a listing URL or type an address.', 'error');
            return;
        }
        const trimmed = query.trim();
        const isUrl = /^https?:\/\//i.test(trimmed);
        const label = isUrl ? 'listing' : 'address';

        // Show loading state
        const statusEl = document.getElementById('listingSearchStatus');
        if (statusEl) {
            statusEl.textContent = `Searching ${label}…`;
            statusEl.style.display = '';
        }
        this.toast(`🔍 Searching ${label}…`, 'info');

        try {
            const resp = await fetch('/api/property-intelligence?mode=listing-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: trimmed }),
            });
            const result = await resp.json();

            if (!result.success) {
                this.toast(`⚠️ ${result.error || 'No property data found.'}`, 'error');
                if (statusEl) statusEl.style.display = 'none';
                return;
            }

            const data = result.data || {};
            const addressFields = result.addressFields || {};
            const count = result.fieldsFound?.length || Object.keys(data).length;

            // If URL search returned address fields we don't have yet, fill them
            if (isUrl && addressFields.address) {
                const addrMap = { addrStreet: addressFields.address, addrCity: addressFields.city, addrState: addressFields.state, addrZip: addressFields.zip };
                for (const [fid, val] of Object.entries(addrMap)) {
                    if (!val) continue;
                    const el = document.getElementById(fid);
                    if (!el || (el.value && el.value.trim())) continue;
                    el.value = val;
                    this.data[fid] = val;
                    this.markAutoFilled?.(el, 'listing');
                }
            }

            // Apply extracted property data using existing Zillow-style applier
            this.applyZillowSelects(data);

            this.toast(`✅ Found ${count} property details from ${label}!`, 'success');
            if (statusEl) {
                statusEl.textContent = `✓ ${count} fields from ${result.source || 'Web Search'}`;
                setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
            }

            this.save();
        } catch (err) {
            console.error('[lookupListingUrl]', err);
            this.toast('❌ Listing search failed. Try again.', 'error');
            if (statusEl) statusEl.style.display = 'none';
        }
    },

    // ── Import Property Data from Chrome Extension ──
    // Tries the extension bridge first (REQUEST_PROPERTY_DATA → PROPERTY_DATA_RESPONSE),
    // then falls back to reading clipboard JSON from "📋 Copy for Altech".
    async importPropertyFromExtension() {
        // If extension is installed, ask it for stored property data directly.
        const hasExtension = document.documentElement.getAttribute('data-altech-extension') === 'true';
        if (hasExtension) {
            const fromExtension = await this._requestPropertyFromExtension();
            if (fromExtension) {
                this.autoFillPropertyData(fromExtension);
                return;
            }
        }

        // Fallback: read clipboard JSON
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

        // Use shared auto-fill function
        this.autoFillPropertyData(parsed);
    },

    // ── Request stored property data from the extension bridge ──
    // Posts REQUEST_PROPERTY_DATA to the bridge content script; waits up to 2s.
    _requestPropertyFromExtension() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(null);
            }, 2000);

            function handler(event) {
                if (event.source !== window) return;
                if (event.data?.type === 'PROPERTY_DATA_RESPONSE') {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    resolve(event.data.propertyData || null);
                }
            }

            window.addEventListener('message', handler);
            window.postMessage({ type: 'REQUEST_PROPERTY_DATA' }, '*');
        });
    },

        // ── Auto-fill property data (shared by clipboard and postMessage) ──
        autoFillPropertyData(propertyData) {
            if (!propertyData || !propertyData.data) {
                this.toast('⚠️ Invalid property data received', 'error');
                return;
            }

            const data = propertyData.data;
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

            const source = propertyData._source || 'extension';
            const addr = propertyData.address || '';
            this.toast(`✅ Auto-filled ${filled} property fields from ${source}${addr ? ` (${addr})` : ''}!`);
        },

        // ── Initialize postMessage listener for Chrome extension direct messaging ──
        initPropertyExtensionListener() {
            if (this._propertyListenerInitialized) return;
            this._propertyListenerInitialized = true;

            window.addEventListener('message', (event) => {
                // Only accept messages from same window (forwarded by altech-bridge.js)
                if (event.source !== window) return;

                const msg = event.data;
                if (msg.type === 'ALTECH_PROPERTY_DATA') {
                    console.log('[Property Form] Received property data from extension:', msg.propertyData?.fieldCount, 'fields');
                    this.autoFillPropertyData(msg.propertyData);
                }
            });

            console.log('[Property Form] Extension postMessage listener initialized');
        },


    openPropertyRecords() {
        const address = this.data.addrStreet || '';
        const city = this.data.addrCity || '';
        const state = (this.data.addrState || '').toUpperCase();
        const zip = this.data.addrZip || '';
        const fullAddr = `${address} ${city} ${state} ${zip}`.trim();
        if (!address || !city || !state) {
            this.toast('Please enter a complete address (street, city, and state) first.', 'error');
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
            this.toast('Please enter a complete address (street, city, and state) first.', 'error');
            return;
        }
        
        // Open research tools in new tabs/windows
        const addr = `${address} ${city} ${state} ${zip}`.trim();
        const redfinUrl = `https://www.google.com/search?q=site:redfin.com+${encodeURIComponent(addr)}&btnI`;
        window.open(redfinUrl, 'redfin');
        
        // Also trigger GIS if available
        setTimeout(() => this.openGIS(), 500);
    },

});
