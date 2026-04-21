// js/app-export-coverage-gap.js — AI-powered coverage gap analysis
// Extracted from app-export.js during Phase 4 monolith decomposition
'use strict';

Object.assign(App, {
    async runCoverageGapAnalysis() {
        const btn = document.getElementById('coverageGapBtn');
        const resultsDiv = document.getElementById('coverageGapResults');
        if (!resultsDiv) return;

        // Collect form data summary
        const d = this.data || {};
        const drivers = this.drivers || [];
        const vehicles = this.vehicles || [];

        const hasProperty = d.qType === 'home' || d.qType === 'both';
        const hasAuto = d.qType === 'auto' || d.qType === 'both';

        // Build context string for AI
        const lines = [];
        lines.push(`Insurance Type: ${d.qType || 'unknown'}`);
        lines.push(`State: ${d.addrState || 'unknown'}`);

        // ── Applicant ──
        if (d.firstName || d.lastName) lines.push(`Applicant: ${d.firstName || ''} ${d.lastName || ''}`);
        if (d.dob) lines.push(`DOB: ${d.dob}`);
        if (d.gender) lines.push(`Gender: ${d.gender}`);
        if (d.maritalStatus) lines.push(`Marital Status: ${d.maritalStatus}`);
        if (d.occupation) lines.push(`Occupation: ${d.occupation}`);
        if (d.education) lines.push(`Education: ${d.education}`);

        // ── Co-Applicant ──
        if (d.coFirstName || d.coLastName) {
            lines.push(`Co-Applicant: ${d.coFirstName || ''} ${d.coLastName || ''}`);
            if (d.coDob) lines.push(`Co-App DOB: ${d.coDob}`);
            if (d.coRelationship) lines.push(`Relationship: ${d.coRelationship}`);
            if (d.coOccupation) lines.push(`Co-App Occupation: ${d.coOccupation}`);
        }

        if (hasProperty) {
            lines.push('--- PROPERTY ---');
            if (d.addrStreet) lines.push(`Address: ${d.addrStreet}, ${d.addrCity || ''}, ${d.addrState || ''} ${d.addrZip || ''}`);
            if (d.county) lines.push(`County: ${d.county}`);
            if (d.dwellingType) lines.push(`Dwelling Type: ${d.dwellingType}`);
            if (d.dwellingUsage) lines.push(`Dwelling Usage: ${d.dwellingUsage}`);
            if (d.occupancyType) lines.push(`Occupancy: ${d.occupancyType}`);
            if (d.yrBuilt) lines.push(`Year Built: ${d.yrBuilt}`);
            if (d.sqFt) lines.push(`Sq Ft: ${d.sqFt}`);
            if (d.lotSize) lines.push(`Lot Size: ${d.lotSize}`);
            if (d.numStories) lines.push(`Stories: ${d.numStories}`);
            if (d.bedrooms) lines.push(`Bedrooms: ${d.bedrooms}`);
            if (d.fullBaths) lines.push(`Full Baths: ${d.fullBaths}`);
            if (d.halfBaths) lines.push(`Half Baths: ${d.halfBaths}`);
            if (d.constructionStyle) lines.push(`Construction: ${d.constructionStyle}`);
            if (d.exteriorWalls) lines.push(`Exterior Walls: ${d.exteriorWalls}`);
            if (d.foundation) lines.push(`Foundation: ${d.foundation}`);
            if (d.garageType) lines.push(`Garage: ${d.garageType}${d.garageSpaces ? ` (${d.garageSpaces} spaces)` : ''}`);
            if (d.roofType) lines.push(`Roof Type: ${d.roofType}`);
            if (d.roofShape) lines.push(`Roof Shape: ${d.roofShape}`);
            if (d.roofYr) lines.push(`Roof Year: ${d.roofYr}`);
            if (d.heatingType) lines.push(`Heating: ${d.heatingType}${d.heatYr ? ` (updated ${d.heatYr})` : ''}`);
            if (d.cooling) lines.push(`Cooling: ${d.cooling}`);
            if (d.plumbYr) lines.push(`Plumbing Updated: ${d.plumbYr}`);
            if (d.elecYr) lines.push(`Electrical Updated: ${d.elecYr}`);
            if (d.sewer) lines.push(`Sewer: ${d.sewer}`);
            if (d.waterSource) lines.push(`Water Source: ${d.waterSource}`);
            // Hazards & safety
            if (d.pool && d.pool !== 'None') lines.push(`Pool: ${d.pool}`);
            if (d.woodStove && d.woodStove !== 'None') lines.push(`Wood Stove: ${d.woodStove}`);
            if (d.dogInfo) lines.push(`Dogs: ${d.dogInfo}`);
            if (d.trampoline) lines.push(`Trampoline: ${d.trampoline}`);
            if (d.fireAlarm) lines.push(`Fire Alarm: ${d.fireAlarm}`);
            if (d.burglarAlarm) lines.push(`Burglar Alarm: ${d.burglarAlarm}`);
            if (d.smokeDetector) lines.push(`Smoke Detector: ${d.smokeDetector}`);
            if (d.sprinklers) lines.push(`Sprinklers: ${d.sprinklers}`);
            if (d.protectionClass) lines.push(`Protection Class: ${d.protectionClass}`);
            // Home coverage limits
            if (d.homePolicyType) lines.push(`Home Policy Type: ${d.homePolicyType}`);
            if (d.dwellingCoverage) lines.push(`Dwelling Coverage: $${d.dwellingCoverage}`);
            if (d.otherStructures) lines.push(`Other Structures (Cov B): $${d.otherStructures}`);
            if (d.homePersonalProperty) lines.push(`Personal Property: $${d.homePersonalProperty}`);
            if (d.homeLossOfUse) lines.push(`Loss of Use: $${d.homeLossOfUse}`);
            if (d.personalLiability) lines.push(`Personal Liability: $${d.personalLiability}`);
            if (d.medicalPayments) lines.push(`Medical Payments: $${d.medicalPayments}`);
            if (d.homeDeductible) lines.push(`AOP Deductible: $${d.homeDeductible}`);
            if (d.windDeductible) lines.push(`Wind/Hail Deductible: $${d.windDeductible}`);
            if (d.mortgagee) lines.push(`Mortgagee: ${d.mortgagee}`);
        }

        if (hasAuto) {
            lines.push('--- AUTO ---');
            if (d.autoPolicyType) lines.push(`Auto Policy Type: ${d.autoPolicyType}`);
            vehicles.forEach((v, i) => {
                lines.push(`Vehicle ${i + 1}: ${v.year || ''} ${v.make || ''} ${v.model || ''} (${v.use || 'unknown use'})`);
            });
            drivers.forEach((drv, i) => {
                lines.push(`Driver ${i + 1}: ${drv.firstName || ''} ${drv.lastName || ''}, age ${drv.age || '?'}, ${drv.gender || '?'}, license state: ${drv.licenseState || '?'}`);
            });
            if (d.liabilityLimits) lines.push(`BI Limits: ${d.liabilityLimits}`);
            if (d.pdLimit) lines.push(`PD Limit: $${d.pdLimit}`);
            if (d.umLimits) lines.push(`UM Limits: ${d.umLimits}`);
            if (d.uimLimits) lines.push(`UIM Limits: ${d.uimLimits}`);
            if (d.umpdLimit) lines.push(`UMPD Limit: $${d.umpdLimit}`);
            if (d.compDeductible) lines.push(`Comp Deductible: $${d.compDeductible}`);
            if (d.autoDeductible) lines.push(`Collision Deductible: $${d.autoDeductible}`);
            if (d.medPayments) lines.push(`Med Pay (Auto): $${d.medPayments}`);
            if (d.rentalDeductible) lines.push(`Rental Reimbursement: ${d.rentalDeductible}`);
            if (d.towingDeductible) lines.push(`Towing/Roadside: ${d.towingDeductible}`);
            if (d.accidents) lines.push(`Accidents: ${d.accidents}`);
            if (d.violations) lines.push(`Violations: ${d.violations}`);
        }

        // ── Prior Insurance ──
        if (d.priorCarrier) lines.push(`Prior Carrier: ${d.priorCarrier}`);
        if (d.priorYears) lines.push(`Prior Insurance Years: ${d.priorYears}`);
        if (d.priorLiabilityLimits) lines.push(`Prior Liability Limits: ${d.priorLiabilityLimits}`);
        if (d.priorExp) lines.push(`Prior Policy Expiration: ${d.priorExp}`);
        if (d.continuousCoverage) lines.push(`Continuous Coverage: ${d.continuousCoverage}`);
        if (d.effectiveDate) lines.push(`Effective Date: ${d.effectiveDate}`);
        if (d.policyTerm) lines.push(`Policy Term: ${d.policyTerm}`);

        const clientSummary = lines.join('\n');

        // Show loading
        if (btn) { btn.disabled = true; btn.textContent = '🔄 Analyzing…'; }
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';

        const systemPrompt = `You are a senior insurance underwriter and coverage advisor. Analyze the client data and identify coverage gaps, underinsurance risks, and recommendations. Be specific and actionable — reference the actual data provided.

Return ONLY valid JSON with this structure:
{
  "gaps": [
    {
      "severity": "high" | "medium" | "low",
      "title": "Short gap title",
      "detail": "2-3 sentence explanation of the gap and its risk",
      "recommendation": "Specific action to fix this gap"
    }
  ],
  "strengths": ["Brief strength 1", "Brief strength 2"],
  "overall": "2-3 sentence overall assessment"
}

Focus on:
- Missing coverages for the property/vehicle type (e.g., flood for coastal, earthquake for seismic zones)
- Underinsured scenarios (dwelling below replacement cost, low liability limits)
- Liability exposures (pool, trampoline, dog breed, wood stove)
- Auto coverage gaps (low BI limits, missing UM/UIM, rental gap)
- State-specific requirements (${d.addrState || d.state || 'unknown state'})
- Discount opportunities (security systems, bundling, etc.)`;

        const userMessage = `Analyze this client's insurance coverage for gaps and risks:\n\n${clientSummary}`;

        try {
            // Try Anthropic first (deeper reasoning), fall back to Gemini
            let responseText = '';
            const aiSettings = typeof AIProvider !== 'undefined' ? AIProvider.getSettings() : {};

            if (aiSettings.provider === 'anthropic' && aiSettings.apiKey && aiSettings.apiKey.startsWith('sk-ant-')) {
                // Use Anthropic via proxy
                const resp = await (typeof Auth !== 'undefined' && Auth.apiFetch
                    ? Auth.apiFetch('/api/anthropic-proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            apiKey: aiSettings.apiKey,
                            model: aiSettings.model || 'claude-sonnet-4-20250514',
                            system: systemPrompt,
                            messages: [{ role: 'user', content: userMessage }],
                            max_tokens: 4096,
                            temperature: 0.3,
                        })
                    })
                    : fetch('/api/anthropic-proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            apiKey: aiSettings.apiKey,
                            model: aiSettings.model || 'claude-sonnet-4-20250514',
                            system: systemPrompt,
                            messages: [{ role: 'user', content: userMessage }],
                            max_tokens: 4096,
                            temperature: 0.3,
                        })
                    }));
                const data = await resp.json();
                if (data.content) {
                    for (const block of data.content) {
                        if (block.type === 'text') responseText += block.text;
                    }
                }
            } else {
                // Fall back to Gemini (or whatever provider is configured)
                const resp = await fetch('/api/property-intelligence?mode=listing-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: '__coverage_gap_analysis__' })
                }).catch(() => null);

                // Actually use the AI provider directly for coverage analysis
                if (typeof AIProvider !== 'undefined') {
                    const result = await AIProvider.ask(systemPrompt, userMessage, { temperature: 0.3, maxTokens: 4096 });
                    responseText = result?.text || result || '';
                }
            }

            if (!responseText) {
                throw new Error('No response from AI. Check your AI provider settings.');
            }

            // Parse JSON from response
            let parsed;
            try {
                // Try direct parse
                parsed = JSON.parse(responseText.trim());
            } catch {
                // Strip markdown fences
                const cleaned = responseText.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
                try {
                    parsed = JSON.parse(cleaned);
                } catch {
                    // Try to find JSON object
                    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
                }
            }

            if (!parsed || !parsed.gaps) {
                throw new Error('Could not parse coverage analysis results.');
            }

            // Render results
            this._renderCoverageGapResults(parsed, resultsDiv);
            this.toast(`✅ Found ${parsed.gaps.length} coverage insights`, 'success');

        } catch (err) {
            console.error('[CoverageGap]', err);
            this.toast(`❌ ${err.message || 'Coverage analysis failed'}`, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Analyze Coverage Gaps'; }
        }
    },

    _renderCoverageGapResults(parsed, container) {
        container.style.display = 'block';
        const severityColors = { high: 'var(--danger)', medium: '#FF9500', low: 'var(--apple-blue)' };
        const severityIcons = { high: '🔴', medium: '🟡', low: '🔵' };

        let html = '';

        // Overall assessment
        if (parsed.overall) {
            html += `<div style="padding:12px; background:var(--bg-input); border-radius:8px; margin-bottom:12px; font-size:13px; color:var(--text);">${Utils.escapeHTML(parsed.overall)}</div>`;
        }

        // Gaps
        if (parsed.gaps && parsed.gaps.length) {
            html += '<div style="margin-bottom:12px;">';
            for (const gap of parsed.gaps) {
                const icon = severityIcons[gap.severity] || '⚪';
                const color = severityColors[gap.severity] || 'var(--text-secondary)';
                html += `<div style="padding:10px; border-left:3px solid ${color}; background:var(--bg-card); border-radius:6px; margin-bottom:8px;">`;
                html += `<div style="font-weight:600; font-size:13px; color:var(--text);">${icon} ${Utils.escapeHTML(gap.title)}</div>`;
                html += `<div style="font-size:12px; color:var(--text-secondary); margin:4px 0;">${Utils.escapeHTML(gap.detail)}</div>`;
                html += `<div style="font-size:12px; color:var(--apple-blue); font-weight:500;">💡 ${Utils.escapeHTML(gap.recommendation)}</div>`;
                html += '</div>';
            }
            html += '</div>';
        }

        // Strengths
        if (parsed.strengths && parsed.strengths.length) {
            html += '<div style="padding:10px; background:var(--bg-input); border-radius:6px;">';
            html += '<div style="font-weight:600; font-size:13px; color:var(--success); margin-bottom:4px;">✅ Strengths</div>';
            for (const s of parsed.strengths) {
                html += `<div style="font-size:12px; color:var(--text-secondary); margin:2px 0;">• ${Utils.escapeHTML(s)}</div>`;
            }
            html += '</div>';
        }

        container.innerHTML = html;
    },
});
