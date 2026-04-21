// js/app-property-parcel.js — Parcel data popup (showParcelDataPopup + close handler).
// Extracted from app-property.js during Phase 3 monolith decomposition (2026-04).
'use strict';

Object.assign(App, {
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

});
