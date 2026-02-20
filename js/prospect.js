// ProspectInvestigator - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

// Prospect Investigator Object
        const ProspectInvestigator = {
            currentData: null,

            init() {
                // Set default state to WA
                const stateEl = document.getElementById('prospectState');
                if (stateEl) {
                    stateEl.value = 'WA';
                }
                console.log('Prospect Investigator initialized');
            },

            async search() {
                const businessName = document.getElementById('prospectBusinessName').value.trim();
                const ubi = document.getElementById('prospectUBI').value.trim();
                const city = document.getElementById('prospectCity').value.trim();
                const state = document.getElementById('prospectState').value;

                if (!businessName) {
                    alert('Please enter a business name to search');
                    return;
                }

                // Show loading, hide results
                document.getElementById('prospectLoading').style.display = 'block';
                document.getElementById('prospectResults').style.display = 'none';

                try {
                    // Run all searches in parallel
                    const [liData, sosData, oshaData] = await Promise.all([
                        this.searchLI(businessName, ubi, state),
                        this.searchSOS(businessName, ubi, state),
                        this.searchOSHA(businessName, city, state)
                    ]);

                    // Check if either source returned multiple results — let user pick
                    const liMultiple = liData && liData.multipleResults && liData.results;
                    const sosMultiple = sosData && sosData.multipleResults && sosData.results;

                    if (liMultiple || sosMultiple) {
                        // Merge results from both sources, dedup by UBI
                        const seen = new Set();
                        const combined = [];

                        // SOS results first (legal entity data)
                        if (sosMultiple) {
                            for (const r of sosData.results) {
                                const key = (r.ubi || r.businessName).toUpperCase();
                                if (!seen.has(key)) {
                                    seen.add(key);
                                    combined.push({ ...r, _source: 'SOS' });
                                }
                            }
                        }
                        // Then L&I results
                        if (liMultiple) {
                            for (const r of liData.results) {
                                const key = (r.ubi || r.businessName).toUpperCase();
                                if (!seen.has(key)) {
                                    seen.add(key);
                                    combined.push({
                                        businessName: r.businessName,
                                        ubi: r.ubi,
                                        entityType: r.licenseType || 'Contractor',
                                        status: r.status,
                                        city: r.city,
                                        formationDate: '',
                                        licenseNumber: r.licenseNumber,
                                        expirationDate: r.expirationDate,
                                        _source: 'L&I'
                                    });
                                }
                            }
                        }

                        this.showBusinessSelection(combined, businessName, city, state);
                        return;
                    }

                    // Store combined data
                    this.currentData = {
                        businessName,
                        ubi,
                        city,
                        state,
                        li: liData,
                        sos: sosData,
                        osha: oshaData,
                        timestamp: new Date().toISOString()
                    };

                    // Display results
                    this.displayResults();

                } catch (error) {
                    console.error('Search error:', error);
                    alert('Error searching business records. Please try again.');
                } finally {
                    document.getElementById('prospectLoading').style.display = 'none';
                }
            },

            // Show mult multiple business selection options§
            showBusinessSelection(results, businessName, city, state) {
                document.getElementById('prospectLoading').style.display = 'none';
                document.getElementById('prospectResults').style.display = 'block';

                // Hide other sections
                document.getElementById('liContractorInfo').innerHTML = '';
                document.getElementById('oshaViolations').innerHTML = '';
                document.getElementById('riskScore').innerHTML = '';
                document.getElementById('generateCOIBtn').style.display = 'none';

                // Show selection UI in the SOS section
                document.getElementById('sosBusinessInfo').innerHTML = `
                    <div style="background: rgba(0, 122, 255, 0.05); border-left: 4px solid var(--apple-blue); padding: 16px; border-radius: 4px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 12px 0;">📋 Multiple businesses found — select one:</h3>
                        <p style="margin: 0; color: var(--text-secondary);">Found ${results.length} businesses matching "${businessName}". Tap to view full details.</p>
                    </div>
                    <div style="display: grid; gap: 12px;">
                        ${results.map((business, index) => `
                            <div class="business-option" onclick="ProspectInvestigator.selectBusiness('${(business.ubi || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\")}', '${(city || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\")}', '${(state || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\")}')"
                                 style="padding: 16px; border: 2px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s; background: var(--bg-card);"
                                 onmouseover="this.style.borderColor='var(--apple-blue)'; this.style.boxShadow='0 2px 8px rgba(0,122,255,0.15)'"
                                 onmouseout="this.style.borderColor='var(--border)'; this.style.boxShadow='none'">
                                <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                            <h4 style="margin: 0; color: var(--apple-blue); font-size: 16px;">${business.businessName}</h4>
                                            ${business._source ? `<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${business._source === 'L&I' ? 'rgba(52,199,89,0.15)' : 'rgba(0,122,255,0.1)'}; color: ${business._source === 'L&I' ? 'var(--success)' : 'var(--apple-blue)'}; font-weight: 600;">${business._source}</span>` : ''}
                                        </div>
                                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px; font-size: 13px; color: var(--text-secondary);">
                                            ${business.ubi ? `<div><strong>UBI:</strong> ${business.ubi}</div>` : ''}
                                            ${business.licenseNumber ? `<div><strong>License:</strong> ${business.licenseNumber}</div>` : ''}
                                            <div><strong>Type:</strong> ${business.entityType || 'Unknown'}</div>
                                            ${business.city ? `<div><strong>City:</strong> ${business.city}</div>` : ''}
                                            <div><strong>Status:</strong> <span style="color: ${(business.status || '').toLowerCase().includes('active') ? 'var(--success)' : 'orange'};">${business.status || 'Unknown'}</span></div>
                                            ${business.expirationDate ? `<div><strong>Expires:</strong> ${business.expirationDate}</div>` : ''}
                                            ${business.formationDate ? `<div><strong>Formation:</strong> ${business.formationDate.split('T')[0]}</div>` : ''}
                                        </div>
                                    </div>
                                    <div style="padding: 8px 16px; background: var(--apple-blue); color: white; border-radius: 6px; font-size: 13px; font-weight: 600; white-space: nowrap;">
                                        Select →
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>`;

                // Show businessSummary with count
                document.getElementById('businessSummary').innerHTML = `
                    <div style="display: grid; grid-template-columns: 1f 1fr; gap: 16px; font-size: 14px;">
                        <div><strong>Search Term:</strong> ${businessName}</div>
                        <div><strong>Results Found:</strong> ${results.length} businesses</div>
                        <div><strong>Location:</strong> ${city ? city + ', ' : ''}${state}</div>
                        <div><strong>Status:</strong> Awaiting selection</div>
                    </div>
                `;
            },

            // Handle business selection
            async selectBusiness(ubi, city, state) {
                console.log(`[Selection] User selected UBI: ${ubi}`);

                // Show loading
                document.getElementById('prospectLoading').style.display = 'block';

                try {
                    // Re-run search with specific UBI
                    const [liData, sosData, oshaData] = await Promise.all([
                        this.searchLI('', ubi, state),
                        this.searchSOS('', ubi, state),
                        this.searchOSHA('', city, state)
                    ]);

                    // Store combined data
                    this.currentData = {
                        businessName: sosData.entity?.businessName || liData.contractor?.businessName || 'Selected Business',
                        ubi,
                        city: sosData.entity?.principalOffice?.city || liData.contractor?.address?.city || city,
                        state,
                        li: liData,
                        sos: sosData,
                        osha: oshaData,
                        timestamp: new Date().toISOString()
                    };

                    // Display full results
                    this.displayResults();

                } catch (error) {
                    console.error('Selection error:', error);
                    alert('Error loading business details. Please try again.');
                } finally {
                    document.getElementById('prospectLoading').style.display = 'none';
                }
            },

            async searchLI(businessName, ubi, state) {
                // Handle contractor licensing based on state
                if (state === 'WA') {
                    // Washington L&I
                    try {
                        const response = await fetch(`/api/prospect-lookup?type=li&name=${encodeURIComponent(businessName)}&ubi=${encodeURIComponent(ubi)}`);
                        const data = await response.json();
                        return data;
                    } catch (error) {
                        console.error('L&I search error:', error);
                        return { error: 'Failed to search L&I records', available: false };
                    }
                } else if (state === 'OR') {
                    // Oregon CCB
                    try {
                        const response = await fetch(`/api/prospect-lookup?type=or-ccb&name=${encodeURIComponent(businessName)}&license=${encodeURIComponent(ubi)}`);
                        const data = await response.json();
                        return data;
                    } catch (error) {
                        console.error('OR CCB search error:', error);
                        return { error: 'Failed to search OR CCB records', available: false };
                    }
                } else {
                    return { available: false, reason: 'Contractor licensing data only available for WA and OR states' };
                }
            },

            async searchSOS(businessName, ubi, state) {
                try {
                    // Call consolidated prospect lookup API with type=sos
                    const response = await fetch(`/api/prospect-lookup?type=sos&name=${encodeURIComponent(businessName)}&ubi=${encodeURIComponent(ubi)}&state=${state}`);
                    const data = await response.json();

                    // Check if multiple results were returned
                    if (data.entity && data.entity.multipleResults) {
                        return {
                            ...data,
                            multipleResults: true,
                            results: data.entity.results,
                            count: data.entity.count
                        };
                    }

                    return data;
                } catch (error) {
                    console.error('SOS search error:', error);
                    return { error: 'Failed to search Secretary of State records', available: false };
                }
            },

            async searchOSHA(businessName, city, state) {
                try {
                    // Call consolidated prospect lookup API with type=osha
                    const response = await fetch(`/api/prospect-lookup?type=osha&name=${encodeURIComponent(businessName)}&city=${encodeURIComponent(city)}&state=${state}`);
                    const data = await response.json();
                    return data;
                } catch (error) {
                    console.error('OSHA search error:', error);
                    return { error: 'Failed to search OSHA records', available: false };
                }
            },

            displayResults() {
                const data = this.currentData;

                // Track which sources actually returned data vs errored
                const liOk = data.li && data.li.available !== false && !data.li.error;
                const sosOk = data.sos && data.sos.available !== false && !data.sos.error;
                const oshaOk = data.osha && data.osha.available !== false && !data.osha.error;

                // Data source status banner
                const sourceStatuses = [
                    { name: 'L&I / Contractor', ok: liOk, source: data.li?.source || 'Contractor Registry', error: data.li?.error },
                    { name: 'Secretary of State', ok: sosOk, source: data.sos?.source || 'SOS Business Search', error: data.sos?.error },
                    { name: 'OSHA', ok: oshaOk, source: data.osha?.source || 'OSHA Database', error: data.osha?.error }
                ];
                const failedSources = sourceStatuses.filter(s => !s.ok);

                // Business Summary
                let summaryHtml = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 14px;">
                        <div><strong>Business Name:</strong> ${data.businessName}</div>
                        <div><strong>UBI:</strong> ${data.ubi || 'Not provided'}</div>
                        <div><strong>Location:</strong> ${data.city ? data.city + ', ' : ''}${data.state}</div>
                        <div><strong>Report Date:</strong> ${new Date(data.timestamp).toLocaleDateString()}</div>
                    </div>
                `;

                // Show source status
                if (failedSources.length > 0) {
                    summaryHtml += `
                        <div style="margin-top: 16px; padding: 12px 16px; background: rgba(255, 149, 0, 0.08); border: 1px solid rgba(255, 149, 0, 0.3); border-radius: 8px;">
                            <div style="font-weight: 600; color: #FF9500; margin-bottom: 8px;">⚠️ Some data sources were unavailable</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">
                                ${failedSources.map(s => `<div style="margin: 4px 0;">• <strong>${s.name}:</strong> ${s.error || 'API unreachable — use manual investigation links below'}</div>`).join('')}
                            </div>
                        </div>
                    `;
                }

                // Source confidence
                const okCount = sourceStatuses.filter(s => s.ok).length;
                summaryHtml += `
                    <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
                        ${sourceStatuses.map(s => `
                            <span style="font-size: 11px; padding: 3px 10px; border-radius: 12px;
                                         background: ${s.ok ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)'};
                                         color: ${s.ok ? '#34C759' : '#FF3B30'}; font-weight: 600;">
                                ${s.ok ? '✓' : '✗'} ${s.name}
                            </span>
                        `).join('')}
                    </div>
                `;

                document.getElementById('businessSummary').innerHTML = summaryHtml;

                // L&I Contractor Info
                if (liOk && data.li.contractor) {
                    document.getElementById('liContractorInfo').innerHTML = this.formatLIData(data.li);
                } else {
                    // Get UBI from SOS data for manual search link
                    const ubi = (data.sos?.entity && data.sos.entity.ubi) || (data.sos?.ubi) || data.ubi || '';
                    const errorMsg = data.li?.error || data.li?.reason || 'No L&I contractor license found';
                    const isError = !!data.li?.error;

                    let manualSearchHtml = '';
                    if (data.state === 'WA') {
                        manualSearchHtml = `
                            <a href="https://secure.lni.wa.gov/verify/" target="_blank" class="btn-secondary"
                               style="display: inline-block; margin-top: 12px; padding: 8px 16px; text-decoration: none;">
                                🔍 Manual L&I Search
                            </a>`;
                    } else if (data.state === 'OR') {
                        manualSearchHtml = `
                            <a href="https://search.ccb.state.or.us/search/" target="_blank" class="btn-secondary"
                               style="display: inline-block; margin-top: 12px; padding: 8px 16px; text-decoration: none;">
                                🔍 Manual OR CCB Search
                            </a>`;
                    }

                    document.getElementById('liContractorInfo').innerHTML = `
                        <div style="padding: 12px 16px; background: ${isError ? 'rgba(255, 59, 48, 0.06)' : 'rgba(255, 149, 0, 0.06)'}; border-left: 4px solid ${isError ? '#FF3B30' : '#FF9500'}; border-radius: 4px;">
                            <p style="color: var(--text-secondary); margin: 0;">${isError ? '⚠️ ' : ''}${errorMsg}</p>
                        </div>
                        ${manualSearchHtml}
                    `;
                }

                // Secretary of State
                if (sosOk && data.sos.entity) {
                    document.getElementById('sosBusinessInfo').innerHTML = this.formatSOSData(data.sos);
                } else {
                    const manualSearchData = data.sos?.manualSearch;
                    const sosLinks = {
                        'WA': { url: 'https://ccfs.sos.wa.gov/#/BusinessSearch', label: 'WA Secretary of State', tip: 'Complete the captcha, then search for the business name. Results show entity type, status, UBI, and registered agent.' },
                        'OR': { url: 'https://sos.oregon.gov/business/pages/find.aspx', label: 'OR Secretary of State', tip: 'Enter the business name or registry number to find entity details.' },
                        'AZ': { url: 'https://ecorp.azcc.gov/BusinessSearch', label: 'AZ Corporation Commission', tip: 'Search by entity name to find filing details and status.' }
                    };
                    const sosLink = sosLinks[data.state];
                    const searchTerm = data.businessName || '';

                    if (manualSearchData || (data.sos?.error && sosLink)) {
                        // Captcha-blocked or error with known SOS link — show helpful panel
                        document.getElementById('sosBusinessInfo').innerHTML = `
                            <div style="padding: 16px 20px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px;">
                                <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px;">
                                    <div style="font-size: 28px; flex-shrink: 0;">🔐</div>
                                    <div>
                                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">This site requires a quick verification</div>
                                        <div style="font-size: 13px; color: var(--text-secondary);">The ${data.state} Secretary of State website uses a captcha. Just click the checkbox on their page and the results load instantly.</div>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 14px;">
                                    <span style="color: var(--text-secondary); font-size: 13px; white-space: nowrap;">Search for:</span>
                                    <code style="flex: 1; font-size: 13px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${searchTerm}</code>
                                    <button onclick="navigator.clipboard.writeText('${searchTerm.replace(/'/g, "\\'")}')"
                                            style="flex-shrink: 0; padding: 4px 10px; font-size: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-input); color: var(--apple-blue); cursor: pointer; font-weight: 600;">Copy</button>
                                </div>
                                ${sosLink ? `
                                    <a href="${sosLink.url}" target="_blank" rel="noopener noreferrer"
                                       style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px 16px; background: var(--apple-blue); color: #fff; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px; transition: opacity 0.2s;"
                                       onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                                        Open ${sosLink.label} ↗
                                    </a>
                                    <div style="margin-top: 10px; padding: 10px 14px; background: rgba(0, 122, 255, 0.04); border-radius: 8px; font-size: 12px; color: var(--text-secondary);">
                                        💡 ${sosLink.tip}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    } else {
                        const errorMsg = data.sos?.error || 'No business entity records found';
                        document.getElementById('sosBusinessInfo').innerHTML = `
                            <div style="padding: 12px 16px; background: rgba(255, 149, 0, 0.06); border-left: 4px solid #FF9500; border-radius: 4px;">
                                <p style="color: var(--text-secondary); margin: 0;">⚠️ ${errorMsg}</p>
                            </div>
                            ${sosLink ? `
                                <a href="${sosLink.url}" target="_blank" rel="noopener noreferrer"
                                   style="display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; padding: 10px 18px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 10px; text-decoration: none; color: var(--apple-blue); font-weight: 600; font-size: 13px;">
                                    🔍 Search ${sosLink.label}
                                </a>` : ''}
                        `;
                    }
                }

                // OSHA Violations
                if (oshaOk && data.osha.inspections && data.osha.inspections.length > 0) {
                    document.getElementById('oshaViolations').innerHTML = this.formatOSHAData(data.osha);
                } else if (!oshaOk) {
                    document.getElementById('oshaViolations').innerHTML = `
                        <div style="padding: 12px 16px; background: rgba(255, 59, 48, 0.06); border-left: 4px solid #FF3B30; border-radius: 4px;">
                            <p style="color: var(--text-secondary); margin: 0;">⚠️ ${data.osha?.error || 'OSHA database unavailable'}</p>
                        </div>
                        <a href="https://www.osha.gov/pls/imis/establishment.html" target="_blank" class="btn-secondary"
                           style="display: inline-block; margin-top: 12px; padding: 8px 16px; text-decoration: none;">
                            🔍 Manual OSHA Search
                        </a>
                    `;
                } else {
                    document.getElementById('oshaViolations').innerHTML = `
                        <p style="color: green;">✓ No OSHA violations found in public records</p>
                    `;
                }

                // Risk Classification
                document.getElementById('riskClassification').innerHTML = this.formatRiskClassification(data);

                // Investigation Links
                document.getElementById('investigationLinks').innerHTML = this.formatInvestigationLinks(data);

                // Show results and COI button
                document.getElementById('prospectResults').style.display = 'block';
                document.getElementById('generateCOIBtn').style.display = 'inline-block';
            },

            formatLIData(liData) {
                // Format L&I contractor license data
                const contractor = liData.contractor || liData;
                const classifications = contractor.classifications || [contractor.licenseType] || [];
                const owners = contractor.owners || [];

                return `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
                        <div><strong>License Number:</strong> ${contractor.licenseNumber || 'N/A'}</div>
                        <div><strong>Status:</strong> <span style="color: ${contractor.status?.toLowerCase().includes('active') ? 'green' : 'orange'};">${contractor.status || 'Unknown'}</span></div>
                        <div><strong>Business Name:</strong> ${contractor.businessName || 'N/A'}</div>
                        <div><strong>UBI:</strong> ${contractor.ubi || contractor.ccbNumber || 'N/A'}</div>
                        <div style="grid-column: 1 / -1;"><strong>License Type:</strong> ${contractor.licenseType || 'General Contractor'}</div>
                        ${classifications.length > 0 ? `<div style="grid-column: 1 / -1;"><strong>Classifications:</strong> ${classifications.join(', ')}</div>` : ''}
                        ${owners.length > 0 ? `<div style="grid-column: 1 / -1;"><strong>Owners/Principals:</strong> ${owners.join(', ')}</div>` : ''}
                        <div><strong>Expiration:</strong> ${contractor.expirationDate || 'N/A'}</div>
                        <div><strong>Registration Date:</strong> ${contractor.registrationDate || 'N/A'}</div>
                        ${contractor.bondAmount ? `<div><strong>Bond Amount:</strong> ${contractor.bondAmount}</div>` : ''}
                        ${contractor.bondCompany ? `<div><strong>Bond Company:</strong> ${contractor.bondCompany}</div>` : ''}
                        ${contractor.insuranceCompany ? `<div><strong>Insurance Company:</strong> ${contractor.insuranceCompany}</div>` : ''}
                        ${contractor.insuranceAmount ? `<div><strong>Insurance Amount:</strong> ${contractor.insuranceAmount}</div>` : ''}
                        ${contractor.rmi ? `<div style="grid-column: 1 / -1;"><strong>Responsible Managing Individual:</strong> ${contractor.rmi}</div>` : ''}
                        ${contractor.phone ? `<div><strong>Phone:</strong> ${contractor.phone}</div>` : ''}
                        ${contractor.address ? `<div style="grid-column: 1 / -1;"><strong>Address:</strong> ${contractor.address.street ? contractor.address.street + ', ' : ''}${contractor.address.city || ''} ${contractor.address.state || ''} ${contractor.address.zip || ''}</div>` : ''}
                    </div>
                    ${contractor.violations && contractor.violations.length > 0 ? `
                        <div style="margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 4px;">
                            <strong>⚠️ Violations:</strong>
                            <ul style="margin: 8px 0 0 20px;">
                                ${contractor.violations.map(v => `<li>${v}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                `;
            },

            formatSOSData(sosData) {
                // Format Secretary of State business entity data
                const entity = sosData.entity || sosData;
                return `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
                        <div><strong>UBI/Entity Number:</strong> ${entity.ubi || 'N/A'}</div>
                        <div><strong>Business Name:</strong> ${entity.businessName || 'N/A'}</div>
                        <div><strong>Entity Type:</strong> ${entity.entityType || 'N/A'}</div>
                        <div><strong>Status:</strong> <span style="color: ${entity.status?.toLowerCase().includes('active') ? 'green' : 'orange'};">${entity.status || 'Unknown'}</span></div>
                        <div><strong>Formation Date:</strong> ${entity.formationDate || 'N/A'}</div>
                        <div><strong>Jurisdiction:</strong> ${entity.jurisdiction || 'N/A'}</div>
                        ${entity.businessActivity ? `<div style="grid-column: 1 / -1;"><strong>Business Activity:</strong> ${entity.businessActivity}</div>` : ''}
                        ${entity.registeredAgent?.name ? `<div style="grid-column: 1 / -1;"><strong>Registered Agent:</strong> ${entity.registeredAgent.name}</div>` : ''}
                        ${entity.principalOffice?.street ? `<div style="grid-column: 1 / -1;"><strong>Principal Office:</strong> ${entity.principalOffice.street}, ${entity.principalOffice.city || ''} ${entity.principalOffice.state || ''} ${entity.principalOffice.zip || ''}</div>` : ''}
                    </div>
                    ${entity.governors && entity.governors.length > 0 ? `
                        <div style="margin-top: 16px; padding: 12px; background: rgba(0, 122, 255, 0.05); border-radius: 8px;">
                            <strong>📋 Governors/Owners:</strong>
                            <ul style="margin: 8px 0 0 20px;">
                                ${entity.governors.map(g => `<li><strong>${g.name || 'Unknown'}</strong> - ${g.title || 'Governor'}${g.appointmentDate ? ` (Appointed: ${g.appointmentDate})` : ''}</li>`).join('')}
                            </ul>
                        </div>
                    ` : entity.officers && entity.officers.length > 0 ? `
                        <div style="margin-top: 16px;">
                            <strong>Officers/Owners:</strong>
                            <ul style="margin: 8px 0 0 20px;">
                                ${entity.officers.map(o => `<li>${o.name || 'Unknown'} - ${o.title || 'Officer'}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                `;
            },

            formatOSHAData(oshaData) {
                // Format OSHA inspection history
                return `
                    <div style="color: orange; font-weight: bold; margin-bottom: 12px;">
                        ⚠️ ${oshaData.inspections.length} OSHA inspection(s) found
                    </div>
                    ${oshaData.inspections.map(inspection => {
                        const violations = inspection.violations || [];
                        const seriousCount = violations.filter(v => v.violationType === 'Serious').length;
                        const totalPenalty = violations.reduce((sum, v) => sum + (v.currentPenalty || 0), 0);

                        return `
                            <div style="border-left: 3px solid orange; padding-left: 12px; margin-bottom: 16px;">
                                <div style="font-weight: bold;">${inspection.inspectionDate || 'N/A'} - ${inspection.inspectionType || 'Unknown'}</div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
                                    Violations: ${violations.length} (${seriousCount} serious)
                                </div>
                                ${totalPenalty > 0 ? `<div style="font-size: 13px; margin-top: 4px;">Penalty: $${totalPenalty.toLocaleString()}</div>` : ''}
                            </div>
                        `;
                    }).join('')}
                `;
            },

            formatRiskClassification(data) {
                // Calculate risk score based on available data
                let riskScore = 0;
                let factors = [];
                let warnings = [];

                // Track data availability
                const liOk = data.li && data.li.available !== false && !data.li.error;
                const sosOk = data.sos && data.sos.available !== false && !data.sos.error;
                const oshaOk = data.osha && data.osha.available !== false && !data.osha.error;
                const sourcesAvailable = [liOk, sosOk, oshaOk].filter(Boolean).length;

                if (sourcesAvailable === 0) {
                    return `
                        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                            <div style="font-size: 48px; color: #FF9500;">⚠️</div>
                            <div>
                                <div style="font-size: 24px; font-weight: bold; color: #FF9500;">Insufficient Data</div>
                                <div style="font-size: 13px; color: var(--text-secondary);">All data sources failed — use investigation links below for manual review</div>
                            </div>
                        </div>
                        <div style="margin-top: 16px; padding: 12px; background: rgba(255, 149, 0, 0.06); border-radius: 8px; font-size: 12px;">
                            <strong>Suggested Action:</strong> Conduct manual investigation using the links below. Verify contractor licensing, business entity status, and OSHA history directly.
                        </div>
                    `;
                }

                if (sourcesAvailable < 3) {
                    warnings.push(`Only ${sourcesAvailable}/3 data sources responded — risk assessment may be incomplete`);
                }

                // Check L&I / contractor licensing
                const contractor = data.li?.contractor || data.li || {};
                if (liOk) {
                    if (contractor.violations && contractor.violations.length > 0) {
                        riskScore += 20;
                        factors.push(`${contractor.violations.length} L&I violation(s) on record`);
                    }
                    if (contractor.status && !contractor.status.toLowerCase().includes('active')) {
                        riskScore += 15;
                        factors.push(`Contractor license status: ${contractor.status}`);
                    }
                    if (contractor.expirationDate) {
                        const expDate = new Date(contractor.expirationDate);
                        const now = new Date();
                        const daysUntilExpiry = (expDate - now) / (1000 * 60 * 60 * 24);
                        if (daysUntilExpiry < 0) {
                            riskScore += 20;
                            factors.push('Contractor license is expired');
                        } else if (daysUntilExpiry < 90) {
                            riskScore += 5;
                            factors.push(`Contractor license expires in ${Math.round(daysUntilExpiry)} days`);
                        }
                    }
                } else {
                    warnings.push('Contractor licensing data unavailable');
                }

                // Check OSHA inspections
                if (oshaOk) {
                    if (data.osha.inspections && data.osha.inspections.length > 0) {
                        const inspCount = data.osha.inspections.length;
                        const seriousViolations = data.osha.summary?.seriousViolations || 0;
                        const willfulViolations = data.osha.summary?.willfulViolations || 0;
                        const totalPenalties = data.osha.summary?.totalPenalties || 0;

                        riskScore += Math.min(inspCount * 8, 30);
                        factors.push(`${inspCount} OSHA inspection(s)`);

                        if (seriousViolations > 0) {
                            riskScore += seriousViolations * 5;
                            factors.push(`${seriousViolations} serious violation(s)`);
                        }
                        if (willfulViolations > 0) {
                            riskScore += willfulViolations * 15;
                            factors.push(`${willfulViolations} willful violation(s)`);
                        }
                        if (totalPenalties > 10000) {
                            riskScore += 10;
                            factors.push(`$${totalPenalties.toLocaleString()} in OSHA penalties`);
                        }
                    }
                } else {
                    warnings.push('OSHA inspection data unavailable');
                }

                // Check business entity status
                const entity = data.sos?.entity || data.sos || {};
                if (sosOk) {
                    if (entity.status && !entity.status.toLowerCase().includes('active')) {
                        riskScore += 30;
                        factors.push(`Business entity status: ${entity.status}`);
                    }
                    if (entity.formationDate) {
                        const formed = new Date(entity.formationDate);
                        const yearsInBusiness = (new Date() - formed) / (1000 * 60 * 60 * 24 * 365);
                        if (yearsInBusiness < 2) {
                            riskScore += 10;
                            factors.push(`Business formed ${yearsInBusiness.toFixed(1)} years ago (newer business)`);
                        }
                    }
                } else {
                    warnings.push('Business entity data unavailable');
                }

                // Cap at 100
                riskScore = Math.min(riskScore, 100);

                const riskLevel = riskScore === 0 ? 'Low' : riskScore < 25 ? 'Low-Moderate' : riskScore < 50 ? 'Moderate' : riskScore < 75 ? 'High' : 'Critical';
                const riskColor = riskScore === 0 ? 'green' : riskScore < 25 ? '#34C759' : riskScore < 50 ? 'orange' : riskScore < 75 ? '#FF3B30' : '#cc0000';
                const riskIcon = riskScore < 25 ? '✓' : riskScore < 50 ? '⚠️' : '🚨';

                return `
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                        <div style="font-size: 48px; color: ${riskColor};">
                            ${riskIcon}
                        </div>
                        <div>
                            <div style="font-size: 24px; font-weight: bold; color: ${riskColor};">${riskLevel} Risk</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">Score: ${riskScore}/100 · ${sourcesAvailable}/3 sources checked</div>
                        </div>
                    </div>
                    ${warnings.length > 0 ? `
                        <div style="margin-bottom: 16px; padding: 10px 14px; background: rgba(255, 149, 0, 0.06); border-radius: 8px;">
                            ${warnings.map(w => `<div style="font-size: 12px; color: #FF9500; margin: 2px 0;">⚠ ${w}</div>`).join('')}
                        </div>
                    ` : ''}
                    ${factors.length > 0 ? `
                        <div style="margin-top: 8px;">
                            <strong>Risk Factors:</strong>
                            <ul style="margin: 8px 0 0 20px;">
                                ${factors.map(f => `<li>${f}</li>`).join('')}
                            </ul>
                        </div>
                    ` : '<p style="color: green;">No significant risk factors identified from available data</p>'}
                    <div style="margin-top: 16px; padding: 12px; background: rgba(0, 122, 255, 0.04); border-radius: 8px; font-size: 12px;">
                        <strong>Suggested Action:</strong> ${this.getSuggestedAction(riskLevel)}
                    </div>
                `;
            },

            getSuggestedAction(riskLevel) {
                switch (riskLevel) {
                    case 'Low':
                        return 'Standard underwriting process. Request current insurance declarations and loss runs.';
                    case 'Low-Moderate':
                        return 'Standard process with attention to flagged items. Verify license and insurance currency.';
                    case 'Moderate':
                        return 'Enhanced review recommended. Request detailed loss history, safety program documentation, and consider higher premiums or coverage restrictions.';
                    case 'High':
                        return 'Thorough underwriting required. Consider declination or require extensive risk mitigation measures before binding coverage.';
                    case 'Critical':
                        return 'Significant concerns identified. Recommend declination unless risk can be substantially mitigated. Document all findings.';
                    default:
                        return 'Review available information and proceed accordingly.';
                }
            },

            formatInvestigationLinks(data) {
                const { businessName, ubi, city, state } = data;
                const links = [];

                // WA L&I Verify Profile (if WA and has UBI)
                if (state === 'WA' && ubi) {
                    links.push({
                        icon: '🔨',
                        title: 'WA L&I License Details',
                        description: 'Full contractor profile with bond, license, and violations',
                        url: `https://secure.lni.wa.gov/verify/Detail.aspx?UBI=${encodeURIComponent(ubi)}`,
                        color: '#0066cc'
                    });
                }

                // Secretary of State Business Records
                const sosLinks = {
                    'WA': {
                        url: 'https://ccfs.sos.wa.gov/#/Home/Search',
                        title: 'WA SOS Business Search'
                    },
                    'OR': {
                        url: 'https://sos.oregon.gov/business/pages/find.aspx',
                        title: 'OR SOS Business Search'
                    },
                    'AZ': {
                        url: 'https://ecorp.azcc.gov/BusinessSearch',
                        title: 'AZ Corporation Commission Search'
                    }
                };

                if (sosLinks[state]) {
                    links.push({
                        icon: '📋',
                        title: sosLinks[state].title,
                        description: `Search for ${businessName} in${state} business registry`,
                        url: sosLinks[state].url,
                        color: '#28a745'
                    });
                }

                // OSHA Direct Search
                links.push({
                    icon: '⚠️',
                    title: 'OSHA Enforcement Database',
                    description: 'Search federal workplace safety violations and inspections',
                    url: `https://www.osha.gov/pls/imis/establishment.html`,
                    color: '#dc3545'
                });

                // Clark County Property Search (if WA and near Vancouver)
                if (state === 'WA' && (city && (city.toLowerCase().includes('vancouver') || city.toLowerCase().includes('clark')))) {
                    links.push({
                        icon: '🏠',
                        title: 'Clark County Property Records',
                        description: 'Search building details, square footage, and construction type',
                        url: 'https://www.clark.wa.gov/treasurer/property-tax-search',
                        color: '#6f42c1'
                    });
                }

                // Generate HTML
                return `
                    <div style="display: grid; gap: 10px;">
                        ${links.map(link => `
                            <a href="${link.url}" target="_blank" rel="noopener noreferrer"
                               style="display: flex; align-items: center; gap: 12px; padding: 12px 14px;
                                      background: var(--bg-input); border: 1px solid var(--border); border-radius: 10px;
                                      text-decoration: none; color: inherit; transition: all 0.2s;">
                                <div style="font-size: 24px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--bg-card); flex-shrink: 0;">${link.icon}</div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 600; color: var(--apple-blue); font-size: 13px;">
                                        ${link.title} <span style="opacity: 0.5;">↗</span>
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${link.description}
                                    </div>
                                </div>
                            </a>
                        `).join('')}
                    </div>
                `;
            },

            copyToQuote() {
                if (!this.currentData) {
                    alert('Please run a search first');
                    return;
                }

                const data = this.currentData;

                // Format data for quoting workflow
                // TODO: Customize this format based on actual commercial quoting needs
                const quoteData = `
COMMERCIAL PROSPECT INVESTIGATION
Generated: ${new Date(data.timestamp).toLocaleDateString()}

BUSINESS INFORMATION:
Business Name: ${data.businessName}
UBI: ${data.ubi || 'N/A'}
Location: ${data.city || 'N/A'}, ${data.state}

L&I LICENSE:
${data.li.contractor ? `
License #: ${data.li.contractor.licenseNumber || 'N/A'}
Status: ${data.li.contractor.status || 'N/A'}
Type: ${data.li.contractor.licenseType || 'N/A'}
Expiration: ${data.li.contractor.expirationDate || 'N/A'}
${data.li.contractor.owners && data.li.contractor.owners.length > 0 ? `Owners: ${data.li.contractor.owners.join(', ')}` : ''}
` : 'Not Available'}

BUSINESS ENTITY:
${data.sos.entity ? ` Entity Type: ${data.sos.entity.entityType || 'N/A'}
Status: ${data.sos.entity.status || 'N/A'}
Formation Date: ${data.sos.entity.formationDate || 'N/A'}
` : 'Not Available'}

OSHA HISTORY:
${data.osha.summary ? `
Total Inspections: ${data.osha.summary.totalInspections || 0}
Serious Violations: ${data.osha.summary.seriousViolations || 0}
Total Penalties: $${(data.osha.summary.totalPenalties || 0).toLocaleString()}
` : 'No violations found'}

---
This data is ready to paste into your quoting system.
                `.trim();

                // Copy to clipboard
                navigator.clipboard.writeText(quoteData).then(() => {
                    alert('✅ Investigation data copied to clipboard!\n\nYou can now paste this into your quoting system.');
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    alert('Failed to copy to clipboard');
                });
            },

            exportReport() {
                if (!this.currentData) {
                    alert('Please run a search first');
                    return;
                }

                // For now, print the report
                // TODO: Generate PDF with formatted report
                window.print();
            },

            // Producer Info — derived from signed-in Firebase user
            getProducerInfo() {
                const user = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
                if (user) {
                    const fullName = user.displayName || user.email.split('@')[0];
                    const firstName = fullName.split(' ')[0];
                    const initial = fullName.split(' ').length > 1 ? fullName.split(' ').slice(-1)[0][0] : '';
                    return {
                        name: initial ? `${firstName} ${initial}` : firstName,
                        fullName: fullName,
                        email: user.email || '',
                        phone: '(360) 573-3080'
                    };
                }
                // Fallback when not signed in
                return {
                    name: 'Agent',
                    fullName: 'Agent',
                    email: '',
                    phone: '(360) 573-3080'
                };
            },

            async generateCOI() {
                if (!this.currentData) {
                    alert('Please run a search first to generate a COI');
                    return;
                }

                const producer = this.getProducerInfo();
                const contractor = this.currentData.li.contractor || this.currentData.li;
                const entity = this.currentData.sos.entity || this.currentData.sos;

                // Extract governors for COI description
                const governors = entity.governors || [];
                const governorNames = governors.map(g => g.name).join(', ');
                const governorText = governorNames ? `. Governors/Owners: ${governorNames}` : '';

                // Prepare COI data
                const coiData = {
                    producerName: 'Altech Insurance Agency',
                    contactName: producer.name,
                    phone: producer.phone,
                    email: producer.email,
                    certificateDate: new Date().toLocaleDateString('en-US'),
                    insuredName: contractor.businessName || entity.businessName || this.currentData.businessName,
                    insuredAddress1: contractor.address?.street || entity.principalOffice?.street || '',
                    insuredAddress2: `${contractor.address?.city || entity.principalOffice?.city || ''}, ${contractor.address?.state || entity.principalOffice?.state || ''} ${contractor.address?.zip || entity.principalOffice?.zip || ''}`.trim(),
                    descriptionOfOperations: `General Contracting - ${contractor.licenseType || 'Construction Services'}${governorText}`,
                    authorizedRepresentative: producer.fullName,
                    // Certificate holder will be left blank for manual entry
                    certificateHolder: {
                        name: '',
                        address1: '',
                        address2: ''
                    }
                };

                console.log('[COI Generator] Sending data to API:', coiData);

                try {
                    // Call the COI generation API
                    const response = await fetch('/api/generate-coi', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(coiData)
                    });

                    if (!response.ok) {
                        throw new Error(`API returned ${response.status}`);
                    }

                    // Get the PDF blob
                    const blob = await response.blob();

                    // Create download link
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `COI-${coiData.insuredName.replace(/\s+/g, '-')}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);

                    console.log('[COI Generator] PDF downloaded successfully');

                } catch (error) {
                    console.error('[COI Generator] Error:', error);
                    alert('Failed to generate COI. Please try again.');
                }
            }
        };

        window.ProspectInvestigator = ProspectInvestigator;
