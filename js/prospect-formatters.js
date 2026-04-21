// js/prospect-formatters.js — HTML formatters for prospect investigation results.
// Extracted from prospect.js during Phase 3 monolith decomposition (2026-04).
// Loaded BEFORE prospect.js so the plugin IIFE can reference window.ProspectFormatters.
'use strict';

window.ProspectFormatters = (() => {
    'use strict';

    // Minimal duplicates of helpers that also exist in prospect.js — kept private
    // here so formatters have no inbound dependencies and can be used standalone.
    function _esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function _statusColor(status) {
        if (!status) return 'inherit';
        const s = status.toLowerCase();
        if (s.includes('active') || s === 'a') return 'var(--success)';
        if (s.includes('expired') || s.includes('inactive') || s.includes('delinquent')) return 'var(--danger)';
        return 'orange';
    }

    function _formatOwners(owners) {
        if (!owners || !owners.length) return '';
        return owners.map(o => typeof o === 'string' ? o : o.name).filter(Boolean).join(', ');
    }

    function _formatLIData(liData) {
        const c = liData.contractor || liData;
        const classifications = c.classifications || [];
        const owners = _formatOwners(c.owners);

        return `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
                <div><strong>License #:</strong> ${_esc(c.licenseNumber || 'N/A')}</div>
                <div><strong>Status:</strong> <span style="color: ${_statusColor(c.status)};">${_esc(c.status || 'Unknown')}</span></div>
                <div><strong>Business Name:</strong> ${_esc(c.businessName || 'N/A')}</div>
                <div><strong>UBI:</strong> ${_esc(c.ubi || c.ccbNumber || 'N/A')}</div>
                <div style="grid-column: 1/-1;"><strong>License Type:</strong> ${_esc(c.licenseType || 'General Contractor')}</div>
                ${classifications.length ? `<div style="grid-column: 1/-1;"><strong>Classifications:</strong> ${_esc(classifications.join(', '))}</div>` : ''}
                ${owners ? `<div style="grid-column: 1/-1;"><strong>Owners/Principals:</strong> ${_esc(owners)}</div>` : ''}
                <div><strong>Expiration:</strong> ${_esc(c.expirationDate || 'N/A')}</div>
                <div><strong>Registration:</strong> ${_esc(c.registrationDate || 'N/A')}</div>
                ${c.bondAmount ? `<div><strong>Bond:</strong> ${_esc(c.bondAmount)}</div>` : ''}
                ${c.bondCompany ? `<div><strong>Bond Co:</strong> ${_esc(c.bondCompany)}</div>` : ''}
                ${c.insuranceCompany ? `<div><strong>Insurance Co:</strong> ${_esc(c.insuranceCompany)}</div>` : ''}
                ${c.insuranceAmount ? `<div><strong>Insurance Amt:</strong> ${_esc(c.insuranceAmount)}</div>` : ''}
                ${c.rmi ? `<div style="grid-column: 1/-1;"><strong>RMI:</strong> ${_esc(c.rmi)}</div>` : ''}
                ${c.phone ? `<div><strong>Phone:</strong> ${_esc(c.phone)}</div>` : ''}
                ${c.address ? `<div style="grid-column: 1/-1;"><strong>Address:</strong> ${_esc([c.address.street, c.address.city, c.address.state, c.address.zip].filter(Boolean).join(', '))}</div>` : ''}
            </div>
            ${c.violations?.length ? `
                <div style="margin-top: 16px; padding: 12px; background: rgba(255,149,0,0.08); border-radius: 8px; border-left: 4px solid #FF9500;">
                    <strong>\u26A0\uFE0F Violations:</strong>
                    <ul style="margin: 8px 0 0 20px;">${c.violations.map(v => '<li>' + _esc(v) + '</li>').join('')}</ul>
                </div>` : ''}`;
    }

    function _formatSOSData(sosData) {
        const e = sosData.entity || sosData;
        const governors = e.governors || e.officers || [];
        const partialBanner = e.partialData ? `
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;margin-bottom:14px;background:rgba(0,122,255,0.06);border:1px solid rgba(0,122,255,0.15);border-radius:10px;">
                <span style="font-size:16px;">\u2139\uFE0F</span>
                <span style="font-size:12px;color:var(--apple-blue);font-weight:500;">Partial data from ${_esc(e.dataSource || 'alternate source')} \u2014 SOS direct lookup was unavailable. Entity type, registered agent, and formation details may be incomplete.</span>
            </div>` : '';
        const sourceBadge = e.dataSource && !e.partialData ? `
            <div style="margin-top:12px;font-size:11px;color:var(--text-tertiary);">Source: ${_esc(e.dataSource)}</div>` : '';

        return `
            ${partialBanner}
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
                <div><strong>UBI/Entity #:</strong> ${_esc(e.ubi || 'N/A')}</div>
                <div><strong>Entity Type:</strong> ${_esc(e.entityType || 'N/A')}</div>
                <div><strong>Status:</strong> <span style="color: ${_statusColor(e.status)};">${_esc(e.status || 'Unknown')}</span></div>
                <div><strong>Formation:</strong> ${_esc(e.formationDate || 'N/A')}</div>
                <div><strong>Jurisdiction:</strong> ${_esc(e.jurisdiction || 'N/A')}</div>
                ${e.businessActivity ? `<div style="grid-column: 1/-1;"><strong>Activity:</strong> ${_esc(e.businessActivity)}</div>` : ''}
                ${e.registeredAgent?.name ? `<div style="grid-column: 1/-1;"><strong>Registered Agent:</strong> ${_esc(e.registeredAgent.name)}</div>` : ''}
                ${e.principalOffice?.street ? `<div style="grid-column: 1/-1;"><strong>Principal Office:</strong> ${_esc([e.principalOffice.street, e.principalOffice.city, e.principalOffice.state, e.principalOffice.zip].filter(Boolean).join(', '))}</div>` : ''}
            </div>
            ${governors.length ? `
                <div style="margin-top: 16px; padding: 12px; background: rgba(0,122,255,0.04); border-radius: 8px;">
                    <strong>\uD83D\uDC65 Governors/Officers:</strong>
                    <ul style="margin: 8px 0 0 20px;">
                        ${governors.map(g => '<li><strong>' + _esc(g.name || 'Unknown') + '</strong> \u2014 ' + _esc(g.title || 'Governor') + (g.appointmentDate ? ' (' + _esc(g.appointmentDate) + ')' : '') + '</li>').join('')}
                    </ul>
                </div>` : ''}
            ${e.detailsUrl ? `<a href="${_esc(e.detailsUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;font-size:12px;color:var(--apple-blue);text-decoration:none;font-weight:500;">View full record \u2197</a>` : ''}
            ${sourceBadge}`;
    }

    function _formatOSHAData(oshaData) {
        return `
            <div style="color: var(--danger); font-weight: bold; margin-bottom: 12px;">
                \u26A0\uFE0F ${oshaData.inspections.length} OSHA inspection(s) found
            </div>
            ${oshaData.inspections.map(insp => {
                const violations = insp.violations || [];
                const seriousCount = violations.filter(v => v.violationType === 'Serious').length;
                const totalPenalty = violations.reduce((sum, v) => sum + (v.currentPenalty || 0), 0);
                return `
                    <div style="border-left: 3px solid var(--danger); padding-left: 12px; margin-bottom: 16px;">
                        <div style="font-weight: bold;">${_esc(insp.inspectionDate || 'N/A')} \u2014 ${_esc(insp.inspectionType || 'Unknown')}</div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
                            Violations: ${violations.length} (${seriousCount} serious)
                        </div>
                        ${totalPenalty > 0 ? '<div style="font-size: 13px; margin-top: 4px;">Penalty: $' + totalPenalty.toLocaleString() + '</div>' : ''}
                        ${insp.naicsCode ? '<div style="font-size: 12px; margin-top: 4px; color: var(--text-secondary);">NAICS: ' + _esc(insp.naicsCode) + ' ' + _esc(insp.naicsDescription || '') + '</div>' : ''}
                    </div>`;
            }).join('')}`;
    }

    function _formatSAMData(samData) {
        if (!samData.entities?.length) return '<p style="color: var(--text-secondary);">No federal registrations found</p>';

        return samData.entities.map(e => `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; margin-bottom: 16px;">
                <div><strong>Legal Name:</strong> ${_esc(e.legalBusinessName || 'N/A')}</div>
                ${e.dbaName ? '<div><strong>DBA:</strong> ' + _esc(e.dbaName) + '</div>' : '<div></div>'}
                <div><strong>UEI:</strong> ${_esc(e.ueiSAM || 'N/A')}</div>
                <div><strong>CAGE Code:</strong> ${_esc(e.cageCode || 'N/A')}</div>
                <div><strong>Entity Type:</strong> ${_esc(e.entityType || 'N/A')}</div>
                <div><strong>Structure:</strong> ${_esc(e.entityStructure || 'N/A')}</div>
                <div><strong>Status:</strong> <span style="color: ${_statusColor(e.registrationStatus)};">${_esc(e.registrationStatus || 'Unknown')}</span></div>
                <div><strong>Expiration:</strong> ${_esc(e.expirationDate || 'N/A')}</div>
                ${e.naicsCodes?.length ? '<div style="grid-column: 1/-1;"><strong>NAICS:</strong> ' + e.naicsCodes.map(n => _esc(n.code) + (n.isPrimary ? ' \u2605' : '')).join(', ') + '</div>' : ''}
                ${e.address ? '<div style="grid-column: 1/-1;"><strong>Address:</strong> ' + _esc([e.address.street, e.address.city, e.address.state, e.address.zip].filter(Boolean).join(', ')) + '</div>' : ''}
            </div>
        `).join('');
    }

    function _formatPlacesData(placesData) {
        const p = placesData.profile;
        if (!p) return '<p style="color: var(--text-secondary);">No Google Business profile found</p>';

        const typeBadges = (p.types || []).map(t =>
            `<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,122,255,0.06);color:var(--apple-blue);font-weight:500;">${_esc(t.replace(/_/g, ' '))}</span>`
        ).join(' ');

        const reviewsHtml = (p.reviews || []).map(r => `
            <div style="padding:10px 14px;background:var(--bg-input);border-radius:10px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <strong style="font-size:13px;">${_esc(r.author)}</strong>
                    <span style="color:#FBBC04;font-size:12px;">${'\u2605'.repeat(r.rating || 0)}</span>
                    <span style="font-size:11px;color:var(--text-secondary);margin-left:auto;">${_esc(r.time)}</span>
                </div>
                <div style="font-size:13px;line-height:1.6;color:var(--text-secondary);">${_esc(r.text)}</div>
            </div>
        `).join('');

        return `
            ${p.businessStatus ? `<div style="font-size:13px;margin-bottom:10px;"><strong>Status:</strong> <span style="color:${p.businessStatus === 'OPERATIONAL' ? 'var(--success)' : 'var(--danger)'};">${_esc(p.businessStatus.replace(/_/g, ' '))}</span></div>` : ''}
            ${typeBadges ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">${typeBadges}</div>` : ''}
            ${p.hours?.length ? `
                <details style="margin-bottom:12px;cursor:pointer;">
                    <summary style="font-weight:600;font-size:13px;color:var(--text);">
                        \uD83D\uDD54 Business Hours ${p.isOpen === true ? '<span style="color:var(--success);font-size:12px;font-weight:500;margin-left:6px;">Open now</span>' : p.isOpen === false ? '<span style="color:var(--danger);font-size:12px;font-weight:500;margin-left:6px;">Closed</span>' : ''}
                    </summary>
                    <div style="margin-top:8px;padding:10px 14px;background:var(--bg-input);border-radius:10px;font-size:13px;line-height:1.8;">
                        ${p.hours.map(h => _esc(h)).join('<br>')}
                    </div>
                </details>` : ''}
            ${reviewsHtml ? `
                <div>
                    <div style="font-weight:600;font-size:13px;margin-bottom:8px;">\uD83D\uDCAC Recent Reviews</div>
                    ${reviewsHtml}
                </div>` : ''}
        `;
    }

    function _formatSourceError(srcData, state, type) {
        const errorMsg = srcData?.error || srcData?.reason || 'Data source unavailable';
        const isError = !!srcData?.error;
        let manualLink = '';

        if (type === 'contractor') {
            if (state === 'WA') manualLink = '<a href="https://secure.lni.wa.gov/verify/" target="_blank" class="btn-secondary" style="display:inline-block;margin-top:12px;padding:8px 16px;text-decoration:none;">\uD83D\uDD0D Manual L&I Search</a>';
            else if (state === 'OR') manualLink = '<a href="https://search.ccb.state.or.us/search/" target="_blank" class="btn-secondary" style="display:inline-block;margin-top:12px;padding:8px 16px;text-decoration:none;">\uD83D\uDD0D Manual OR CCB Search</a>';
        } else if (type === 'osha') {
            manualLink = '<a href="https://www.osha.gov/pls/imis/establishment.html" target="_blank" class="btn-secondary" style="display:inline-block;margin-top:12px;padding:8px 16px;text-decoration:none;">\uD83D\uDD0D Manual OSHA Search</a>';
        }

        return `
            <div style="padding: 12px 16px; background: ${isError ? 'rgba(255,59,48,0.06)' : 'rgba(255,149,0,0.06)'}; border-left: 4px solid ${isError ? '#FF3B30' : '#FF9500'}; border-radius: 4px;">
                <p style="color: var(--text-secondary); margin: 0;">${isError ? '\u26A0\uFE0F ' : ''}${_esc(errorMsg)}</p>
            </div>
            ${manualLink}`;
    }

    function _formatSOSError(data) {
        const sosLinks = {
            'WA': { url: 'https://ccfs.sos.wa.gov/#/BusinessSearch', label: 'WA Secretary of State', tip: 'Complete the captcha, then search for the business name. Results load instantly after verification.' },
            'OR': { url: 'https://sos.oregon.gov/business/pages/find.aspx', label: 'OR Secretary of State', tip: 'Enter the business name or registry number.' },
            'AZ': { url: 'https://ecorp.azcc.gov/BusinessSearch', label: 'AZ Corporation Commission', tip: 'Search by entity name to find filing details.' }
        };
        const isDeepLinked = data.sos?.deepLinked;
        const searchUrl = data.sos?.searchUrl;
        const sosLink = sosLinks[data.state];
        const searchTerm = data.sos?.searchTerm || data.businessName || '';
        const manualSearch = data.sos?.manualSearch;
        const tip = data.sos?.tip || sosLink?.tip || '';

        if ((manualSearch || data.sos?.error) && (searchUrl || sosLink)) {
            const linkUrl = searchUrl || sosLink.url;
            const linkLabel = isDeepLinked ? 'View ' + _esc(sosLink?.label || data.state + ' SOS') + ' Results' : 'Open ' + _esc(sosLink?.label || data.state + ' SOS');

            // Icon and header vary by type
            const icon = isDeepLinked ? '\uD83D\uDD17' : '\uD83D\uDD10';
            const heading = isDeepLinked
                ? 'Manual lookup required'
                : 'This site requires verification';
            const description = isDeepLinked
                ? 'The ' + _esc(data.state) + ' Corporation Commission requires browser access. The link below opens search results for this business directly.'
                : 'The ' + _esc(data.state) + ' Secretary of State uses a captcha. Click the checkbox on their page and results load instantly.';

            return `
                <div style="padding: 16px 20px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px;">
                    <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px;">
                        <div style="font-size: 28px; flex-shrink: 0;">${icon}</div>
                        <div>
                            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${heading}</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">${description}</div>
                        </div>
                    </div>
                    ${!isDeepLinked ? `
                    <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 14px;">
                        <span style="color: var(--text-secondary); font-size: 13px; white-space: nowrap;">Search for:</span>
                        <code style="flex: 1; font-size: 13px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${_esc(searchTerm)}</code>
                        <button onclick="navigator.clipboard.writeText('${searchTerm.replace(/'/g, "\\'")}')" style="flex-shrink:0;padding:4px 10px;font-size:12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--apple-blue);cursor:pointer;font-weight:600;">Copy</button>
                    </div>` : ''}
                    <a href="${_esc(linkUrl)}" target="_blank" rel="noopener noreferrer"
                       style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 16px;background:var(--apple-blue);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
                        ${linkLabel} \u2197
                    </a>
                    ${tip ? `
                    <div style="margin-top: 10px; padding: 10px 14px; background: rgba(0,122,255,0.04); border-radius: 8px; font-size: 12px; color: var(--text-secondary);">
                        \uD83D\uDCA1 ${_esc(tip)}
                    </div>` : ''}
                    <div style="margin-top: 12px; padding: 10px 14px; background: rgba(255,149,0,0.06); border: 1px solid rgba(255,149,0,0.12); border-radius: 8px; font-size: 12px; color: var(--text-secondary);">
                        <strong>\u26A0\uFE0F Underwriting gap:</strong> Entity type, formation date, registered agent, and officers are unknown. Verify these manually before binding.
                    </div>
                    <button onclick="ProspectInvestigator.pasteSOSData()"
                        style="margin-top:12px;width:100%;padding:12px 16px;background:var(--bg-card);color:var(--text);border:1.5px dashed var(--border);border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                        \uD83D\uDCCB Paste SOS Data
                    </button>
                </div>`;
        }

        const errorMsg = data.sos?.error || 'No business entity records found';
        return `
            <div style="padding: 12px 16px; background: rgba(255,149,0,0.06); border-left: 4px solid #FF9500; border-radius: 4px;">
                <p style="color: var(--text-secondary); margin: 0;">\u26A0\uFE0F ${_esc(errorMsg)}</p>
            </div>
            ${sosLink ? '<a href="' + sosLink.url + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:10px 18px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;text-decoration:none;color:var(--apple-blue);font-weight:600;font-size:13px;">\uD83D\uDD0D Search ' + _esc(sosLink.label) + '</a>' : ''}
            <button onclick="ProspectInvestigator.pasteSOSData()"
                style="margin-top:12px;width:100%;padding:12px 16px;background:var(--bg-card);color:var(--text);border:1.5px dashed var(--border);border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                \uD83D\uDCCB Paste SOS Data
            </button>`;
    }

    function _formatRiskClassification(data) {
        const liOk = data.li && data.li.available !== false && !data.li.error;
        const sosOk = data.sos && data.sos.available !== false && !data.sos.error;
        const oshaOk = data.osha && data.osha.available !== false && !data.osha.error;
        const sourcesAvailable = [liOk, sosOk, oshaOk].filter(Boolean).length;

        if (sourcesAvailable === 0) {
            return `
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 48px; color: #FF9500;">\u26A0\uFE0F</div>
                    <div>
                        <div style="font-size: 24px; font-weight: bold; color: #FF9500;">Insufficient Data</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">All data sources failed \u2014 use investigation links below for manual review</div>
                    </div>
                </div>`;
        }

        let score = 0;
        const factors = [];
        const warnings = [];

        if (sourcesAvailable < 3) warnings.push('Only ' + sourcesAvailable + '/3 data sources responded');

        // Contractor
        const c = data.li?.contractor || {};
        if (liOk) {
            if (c.violations?.length) { score += 20; factors.push(c.violations.length + ' L&I violation(s)'); }
            if (c.status && !c.status.toLowerCase().includes('active')) { score += 15; factors.push('License status: ' + c.status); }
            if (c.expirationDate) {
                const days = (new Date(c.expirationDate) - new Date()) / 86400000;
                if (days < 0) { score += 20; factors.push('License expired'); }
                else if (days < 90) { score += 5; factors.push('License expires in ' + Math.round(days) + ' days'); }
            }
        }

        // OSHA
        if (oshaOk && data.osha.inspections?.length) {
            const n = data.osha.inspections.length;
            score += Math.min(n * 8, 30);
            factors.push(n + ' OSHA inspection(s)');
            const s = data.osha.summary || {};
            if (s.seriousViolations > 0) { score += s.seriousViolations * 5; factors.push(s.seriousViolations + ' serious violation(s)'); }
            if (s.willfulViolations > 0) { score += s.willfulViolations * 15; factors.push(s.willfulViolations + ' willful violation(s)'); }
            if (s.totalPenalties > 10000) { score += 10; factors.push('$' + s.totalPenalties.toLocaleString() + ' in penalties'); }
        }

        // Entity
        const e = data.sos?.entity || {};
        if (sosOk) {
            if (e.status && !e.status.toLowerCase().includes('active')) { score += 30; factors.push('Entity status: ' + e.status); }
            if (e.formationDate) {
                const years = (new Date() - new Date(e.formationDate)) / (365.25 * 86400000);
                if (years < 2) { score += 10; factors.push('Business formed ' + years.toFixed(1) + ' years ago'); }
            }
        }

        score = Math.min(score, 100);
        const level = score === 0 ? 'Low' : score < 25 ? 'Low-Moderate' : score < 50 ? 'Moderate' : score < 75 ? 'High' : 'Critical';
        const color = score === 0 ? 'green' : score < 25 ? '#34C759' : score < 50 ? 'orange' : '#FF3B30';
        const icon = score < 25 ? '\u2713' : score < 50 ? '\u26A0\uFE0F' : '\uD83D\uDEA8';

        const actions = {
            'Low': 'Standard underwriting. Request declarations and loss runs.',
            'Low-Moderate': 'Standard process \u2014 verify license and insurance currency.',
            'Moderate': 'Enhanced review. Request detailed loss history and safety documentation.',
            'High': 'Thorough underwriting required. Consider declination or risk mitigation requirements.',
            'Critical': 'Significant concerns. Recommend declination unless risk can be substantially mitigated.'
        };

        return `
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <div style="font-size: 48px; color: ${color};">${icon}</div>
                <div>
                    <div style="font-size: 24px; font-weight: bold; color: ${color};">${level} Risk</div>
                    <div style="font-size: 13px; color: var(--text-secondary);">Score: ${score}/100 \u00B7 ${sourcesAvailable}/3 sources</div>
                </div>
            </div>
            ${warnings.length ? '<div style="margin-bottom: 12px; padding: 10px 14px; background: rgba(255,149,0,0.06); border-radius: 8px;">' + warnings.map(w => '<div style="font-size: 12px; color: #FF9500;">\u26A0 ' + _esc(w) + '</div>').join('') + '</div>' : ''}
            ${factors.length ? '<div><strong>Risk Factors:</strong><ul style="margin: 8px 0 0 20px;">' + factors.map(f => '<li>' + _esc(f) + '</li>').join('') + '</ul></div>' : '<p style="color: var(--success);">No significant risk factors identified</p>'}
            <div style="margin-top: 16px; padding: 12px; background: rgba(0,122,255,0.04); border-radius: 8px; font-size: 12px;">
                <strong>Suggested Action:</strong> ${actions[level] || 'Review findings.'}
            </div>`;
    }

    function _formatInvestigationLinks(data) {
        const { businessName, ubi, city, state } = data;
        const links = [];

        if (state === 'WA' && ubi) {
            links.push({ icon: '\uD83D\uDD28', title: 'WA L&I License', url: 'https://secure.lni.wa.gov/verify/Detail.aspx?UBI=' + encodeURIComponent(ubi), color: '#0066cc' });
        }
        if (state === 'OR') {
            links.push({ icon: '\uD83D\uDCCB', title: 'OR CCB Search', url: 'https://search.ccb.state.or.us/search/', color: '#28a745' });
        }

        const sosLinks = { 'WA': { url: 'https://ccfs.sos.wa.gov/#/Home/Search', title: 'WA SOS' }, 'OR': { url: 'https://sos.oregon.gov/business/pages/find.aspx', title: 'OR SOS' }, 'AZ': { url: 'https://ecorp.azcc.gov/BusinessSearch', title: 'AZ Corp Commission' } };
        if (sosLinks[state]) links.push({ icon: '\uD83D\uDCCB', title: sosLinks[state].title, url: sosLinks[state].url, color: '#28a745' });

        links.push({ icon: '\u26A0\uFE0F', title: 'OSHA Enforcement', url: 'https://www.osha.gov/pls/imis/establishment.html', color: '#dc3545' });
        links.push({ icon: '\uD83C\uDFDB\uFE0F', title: 'SAM.gov Entity Search', url: 'https://sam.gov/search/?q=' + encodeURIComponent(businessName) + '&sort=-relevance', color: '#6f42c1' });

        if (state === 'WA' && city?.toLowerCase().match(/vancouver|clark/)) {
            links.push({ icon: '\uD83C\uDFE0', title: 'Clark County Property', url: 'https://www.clark.wa.gov/treasurer/property-tax-search', color: '#6f42c1' });
        }

        return '<div style="display: grid; gap: 10px;">' +
            links.map(l => `
                <a href="${l.url}" target="_blank" rel="noopener noreferrer"
                   style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 10px; text-decoration: none; color: inherit;">
                    <div style="font-size: 24px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--bg-card); flex-shrink: 0;">${l.icon}</div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: var(--apple-blue); font-size: 13px;">${_esc(l.title)} <span style="opacity: 0.5;">\u2197</span></div>
                    </div>
                </a>
            `).join('') + '</div>';
    }

    return {
        formatLIData: _formatLIData,
        formatSOSData: _formatSOSData,
        formatOSHAData: _formatOSHAData,
        formatSAMData: _formatSAMData,
        formatPlacesData: _formatPlacesData,
        formatSourceError: _formatSourceError,
        formatSOSError: _formatSOSError,
        formatRiskClassification: _formatRiskClassification,
        formatInvestigationLinks: _formatInvestigationLinks,
    };
})();
