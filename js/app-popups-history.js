// js/app-popups-history.js — Property history & market analysis popups
// Extracted from app-popups.js during Phase 3 monolith decomposition (2026-04)
'use strict';

Object.assign(App, {
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
            this.toast('Please enter a complete address first.');
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
            const response = await fetch('/api/historical-analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'analyzeValues',
                    address: address,
                    city: city,
                    state: state,
                    county: county,
                    yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
                    aiSettings: window.AIProvider?.getSettings()
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showHistoryAnalysisPopup(result.data, address, city, state);
            } else {
                this.toast(`❌ History analysis failed: ${result.error || 'Unknown error'}`);
            }
            
            // Reset button
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Property history analysis error:', error);
            this.toast('❌ Failed to analyze property history.');
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
            this.toast('Please enter a complete address first.');
            return;
        }
        
        try {
            const btn = document.getElementById('analyzeInsuranceBtn');
            const originalText = btn ? btn.innerHTML : 'Analyzing...';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '📈 Analyzing insurance trends...';
            }
            
            const response = await fetch('/api/historical-analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'analyzeInsurance',
                    city: city,
                    state: state,
                    county: county,
                    riskLevel: 'all',
                    aiSettings: window.AIProvider?.getSettings()
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showInsuranceAnalysisPopup(result.data, county, state);
            } else {
                this.toast(`❌ Insurance analysis failed: ${result.error || 'Unknown error'}`);
            }
            
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Insurance analysis error:', error);
            this.toast('❌ Failed to analyze insurance trends.');
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
            this.toast('Please enter a complete address first.');
            return;
        }
        
        try {
            const btn = document.getElementById('compareMarketBtn');
            const originalText = btn ? btn.innerHTML : 'Comparing...';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '🔍 Comparing to market...';
            }
            
            const response = await fetch('/api/historical-analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'compareMarket',
                    city: city,
                    state: state,
                    county: county,
                    propertyValue: propertyValue,
                    yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
                    sqft: sqft,
                    aiSettings: window.AIProvider?.getSettings()
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showMarketComparisonPopup(result.data, city, state);
            } else {
                this.toast(`❌ Market comparison failed: ${result.error || 'Unknown error'}`);
            }
            
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Market comparison error:', error);
            this.toast('❌ Failed to compare to market.');
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
            this.toast('Please enter a complete address first.');
            return;
        }
        
        try {
            const btn = document.getElementById('timelineBtn');
            const originalText = btn ? btn.innerHTML : 'Generating...';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '📅 Generating timeline...';
            }
            
            const response = await fetch('/api/historical-analyzer', {
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
                    sqft: sqft,
                    aiSettings: window.AIProvider?.getSettings()
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showTimelinePopup(result.data, address, city, state);
            } else {
                this.toast(`❌ Timeline generation failed: ${result.error || 'Unknown error'}`);
            }
            
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Timeline generation error:', error);
            this.toast('❌ Failed to generate timeline.');
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
});
