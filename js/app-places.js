// js/app-places.js — Google Places Autocomplete wiring + Gemini key resolver.
// Extracted from app-core.js during Phase 3 monolith decomposition (2026-04).
'use strict';

Object.assign(App, {
    async _getGeminiKey() {
        // Check AIProvider for any configured key (supports all providers)
        if (typeof AIProvider !== 'undefined' && AIProvider.isConfigured()) {
            // For Google provider, return the key directly for legacy callers
            if (AIProvider.getProvider() === 'google') {
                return AIProvider.getApiKey();
            }
            // For non-Google providers, callers should use AIProvider.ask() instead
            // but still return any available Google key as fallback
        }
        if (this._geminiApiKey) return this._geminiApiKey;
        const saved = localStorage.getItem('gemini_api_key');
        if (saved) { this._geminiApiKey = saved; return saved; }
        try {
            const res = await (typeof Auth !== 'undefined' ? Auth.apiFetch('/api/config?type=keys') : fetch('/api/config?type=keys'));
            if (res.ok) {
                const data = await res.json();
                if (data.geminiKey) { this._geminiApiKey = data.geminiKey; return data.geminiKey; }
            }
        } catch (_) {}
        return null;
    },

    initPlaces() {
        if (this._placesInitialized) return;
        const streetInput = document.getElementById('addrStreet');
        if (!streetInput || !window.google?.maps?.places) return;
        this._placesInitialized = true;

        let sessionToken = new google.maps.places.AutocompleteSessionToken();
        const autocomplete = new google.maps.places.Autocomplete(streetInput, {
            types: ['address'],
            componentRestrictions: { country: 'us' },
            fields: ['address_components', 'formatted_address'],
            sessionToken
        });

        const refreshSessionToken = () => {
            sessionToken = new google.maps.places.AutocompleteSessionToken();
            autocomplete.setOptions({ sessionToken });
        };

        streetInput.addEventListener('focus', () => refreshSessionToken());

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place || !place.address_components) {
                this.toast('⚠️ Address not found. Try a different entry.');
                return;
            }

            const parts = {
                street_number: '',
                route: '',
                locality: '',
                postal_town: '',
                administrative_area_level_1: '',
                administrative_area_level_2: '',
                postal_code: ''
            };

            place.address_components.forEach((component) => {
                const type = component.types?.[0];
                if (type && Object.prototype.hasOwnProperty.call(parts, type)) {
                    parts[type] = component.short_name || component.long_name || '';
                }
            });

            const street = [parts.street_number, parts.route].filter(Boolean).join(' ').trim();
            const city = parts.locality || parts.postal_town || '';
            const state = parts.administrative_area_level_1 || '';
            const zip = parts.postal_code || '';
            // County: Google returns "Clark County" — strip " County" suffix for EZLynx
            let county = parts.administrative_area_level_2 || '';
            county = county.replace(/\s*County$/i, '').trim();

            this.setFieldValue('addrStreet', street || place.formatted_address || '', { autoFilled: true, source: 'places' });
            this.setFieldValue('addrCity', city, { autoFilled: true, source: 'places' });
            this.setFieldValue('addrState', state, { autoFilled: true, source: 'places' });
            this.setFieldValue('addrZip', zip, { autoFilled: true, source: 'places' });
            if (county) {
                this.setFieldValue('county', county, { autoFilled: true, source: 'places' });
            }

            if (typeof this.scheduleMapPreviewUpdate === 'function') this.scheduleMapPreviewUpdate();

            refreshSessionToken();
        });

        // Previous address autocomplete
        const prevStreetInput = document.getElementById('previousAddrStreet');
        if (prevStreetInput) {
            let prevSessionToken = new google.maps.places.AutocompleteSessionToken();
            const prevAutocomplete = new google.maps.places.Autocomplete(prevStreetInput, {
                types: ['address'],
                componentRestrictions: { country: 'us' },
                fields: ['address_components', 'formatted_address'],
                sessionToken: prevSessionToken
            });

            const refreshPrevToken = () => {
                prevSessionToken = new google.maps.places.AutocompleteSessionToken();
                prevAutocomplete.setOptions({ sessionToken: prevSessionToken });
            };

            prevStreetInput.addEventListener('focus', () => refreshPrevToken());

            prevAutocomplete.addListener('place_changed', () => {
                const place = prevAutocomplete.getPlace();
                if (!place || !place.address_components) return;

                const parts = {
                    street_number: '',
                    route: '',
                    locality: '',
                    postal_town: '',
                    administrative_area_level_1: '',
                    postal_code: ''
                };

                place.address_components.forEach((component) => {
                    const type = component.types?.[0];
                    if (type && Object.prototype.hasOwnProperty.call(parts, type)) {
                        parts[type] = component.short_name || component.long_name || '';
                    }
                });

                const street = [parts.street_number, parts.route].filter(Boolean).join(' ').trim();
                const city = parts.locality || parts.postal_town || '';
                const state = parts.administrative_area_level_1 || '';
                const zip = parts.postal_code || '';

                this.setFieldValue('previousAddrStreet', street || place.formatted_address || '', { autoFilled: true, source: 'places' });
                this.setFieldValue('previousAddrCity', city, { autoFilled: true, source: 'places' });
                this.setFieldValue('previousAddrState', state, { autoFilled: true, source: 'places' });
                this.setFieldValue('previousAddrZip', zip, { autoFilled: true, source: 'places' });

                refreshPrevToken();
            });
        }
    },
});
