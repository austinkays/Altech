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

                    // Check if SOS returned multiple results
                    if (sosData.multipleResults) {
                        this.showBusinessSelection(sosData.results, businessName, city, state);
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
                        <h3 style="margin: 0 0 12px 0;">📋 Multiple businesses found - Select one:</h3>
                        <p style="margin: 0; color: var(--text-secondary);">Found ${results.length} businesses matching "${businessName}". Click to view full details.</p>
                    </div>
                    <div style="display: grid; gap: 12px;">
                        ${results.map((business, index) => `
                            <div class="business-option" onclick="ProspectInvestigator.selectBusiness('${(business.ubi || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\")}', '${(city || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\")}', '${(state || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\")}')"
                                 style="padding: 16px; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                                 onmouseover="this.style.borderColor='var(--apple-blue)'; this.style.background='rgba(0,122,255,0.03)'"
                                 onmouseout="this.style.borderColor='#e0e0e0'; this.style.background='white'">
                                <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start;">
                                    <div>
                                        <h4 style="margin: 0 0 8px 0; color: var(--apple-blue); font-size: 16px;">${business.businessName}</h4>
                                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; font-size: 13px; color: var(--text-secondary);">
                                            <div><strong>UBI:</strong> ${business.ubi}</div>
                                            <div><strong>Type:</strong> ${business.entityType}</div>
                                            ${business.city ? `<div><strong>City:</strong> ${business.city}</div>` : ''}
                                            <div><strong>Status:</strong> <span style="color: ${business.status.toLowerCase().includes('active') ? 'green' : 'orange'};">${business.status}</span></div>
                                            ${business.formationDate ? `<div><strong>Formation:</strong> ${business.formationDate.split('T')[0]}</div>` : ''}
                                        </div>
                                    </div>
                                    <div style="padding: 8px 16px; background: var(--apple-blue); color: white; border-radius: 6px; font-size: 13px; font-weight: 600;">
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
                        businessName: sosData.entity?.businessName || 'Selected Business',
                        ubi,
                        city,
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

                // Business Summary
                document.getElementById('businessSummary').innerHTML = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 14px;">
                        <div><strong>Business Name:</strong> ${data.businessName}</div>
                        <div><strong>UBI:</strong> ${data.ubi || 'Not provided'}</div>
                        <div><strong>Location:</strong> ${data.city ? data.city + ', ' : ''}${data.state}</div>
                        <div><strong>Report Date:</strong> ${new Date(data.timestamp).toLocaleDateString()}</div>
                    </div>
                `;

                // L&I Contractor Info
                if (data.li.available) {
                    document.getElementById('liContractorInfo').innerHTML = this.formatLIData(data.li);
                } else {
                    // Get UBI from SOS data for manual search link
                    const ubi = (data.sos.entity && data.sos.entity.ubi) || (data.sos.ubi) || data.ubi || '';
                    const manualSearchLink = ubi ? `
                        <a href="https://secure.lni.wa.gov/verify/Detail.aspx?UBI=${ubi}"
                           target="_blank"
                           class="btn-secondary"
                           style="display: inline-block; margin-top: 12px; padding: 8px 16px; text-decoration: none;">
                            🔍 Manual L&I Search
                        </a>
                    ` : '';

                    document.getElementById('liContractorInfo').innerHTML = `
                        <p style="color: var(--text-secondary); font-style: italic;">${data.li.reason || 'No L&I contractor license found'}</p>
                        ${manualSearchLink}
                    `;
                }

                // Secretary of State
                if (data.sos.available) {
                    document.getElementById('sosBusinessInfo').innerHTML = this.formatSOSData(data.sos);
                } else {
                    document.getElementById('sosBusinessInfo').innerHTML = `
                        <p style="color: var(--text-secondary); font-style: italic;">No business entity records found</p>
                    `;
                }

                // OSHA Violations
                if (data.osha.inspections && data.osha.inspections.length > 0) {
                    document.getElementById('oshaViolations').innerHTML = this.formatOSHAData(data.osha);
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

                // Check L&I violations (nested under contractor)
                const contractor = data.li.contractor || data.li;
                if (contractor.violations && contractor.violations.length > 0) {
                    riskScore += 20;
                    factors.push('L&I violations on record');
                }

                // Check OSHA inspections
                if (data.osha.inspections && data.osha.inspections.length > 0) {
                    riskScore += data.osha.inspections.length * 10;
                    factors.push(`${data.osha.inspections.length} OSHA inspection(s)`);
                }

                // Check business entity status (nested under entity)
                const entity = data.sos.entity || data.sos;
                if (entity.status && !entity.status.toLowerCase().includes('active')) {
                    riskScore += 30;
                    factors.push('Business entity not in active status');
                }

                const riskLevel = riskScore === 0 ? 'Low' : riskScore < 30 ? 'Moderate' : 'High';
                const riskColor = riskLevel === 'Low' ? 'green' : riskLevel === 'Moderate' ? 'orange' : 'red';

                return `
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                        <div style="font-size: 48px; color: ${riskColor};">
                            ${riskLevel === 'Low' ? '✓' : riskLevel === 'Moderate' ? '⚠️' : '🚨'}
                        </div>
                        <div>
                            <div style="font-size: 24px; font-weight: bold; color: ${riskColor};">${riskLevel} Risk</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">Risk Score: ${riskScore}/100</div>
                        </div>
                    </div>
                    ${factors.length > 0 ? `
                        <div style="margin-top: 16px;">
                            <strong>Risk Factors:</strong>
                            <ul style="margin: 8px 0 0 20px;">
                                ${factors.map(f => `<li>${f}</li>`).join('')}
                            </ul>
                        </div>
                    ` : '<p style="color: green;">No significant risk factors identified</p>'}
                    <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 4px; font-size: 12px;">
                        <strong>Suggested Action:</strong> ${this.getSuggestedAction(riskLevel)}
                    </div>
                `;
            },

            getSuggestedAction(riskLevel) {
                switch (riskLevel) {
                    case 'Low':
                        return 'Standard underwriting process. Request current insurance declarations and loss runs.';
                    case 'Moderate':
                        return 'Enhanced review recommended. Request detailed loss history, safety program documentation, and consider higher premiums or coverage restrictions.';
                    case 'High':
                        return 'Thorough underwriting required. Consider declination or require extensive risk mitigation measures before binding coverage.';
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
                    <div style="display: grid; gap: 12px;">
                        ${links.map(link => `
                            <a href="${link.url}" target="_blank" rel="noopener noreferrer"
                               style="display: flex; align-items: center; gap: 12px; padding: 12px;
                                      background: white; border: 1px solid #dee2e6; border-radius: 6px;
                                      text-decoration: none; color: inherit; transition: all 0.2s;"
                               onmouseover="this.style.borderColor='${link.color}'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';"
                               onmouseout="this.style.borderColor='#dee2e6'; this.style.boxShadow='none';">
                                <div style="font-size: 32px;">${link.icon}</div>
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; color: ${link.color}; margin-bottom: 2px;">
                                        ${link.title} →
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">
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

            // Producer Selection
            currentProducer: 'austin', // Default to Austin

            setProducer(producer) {
                this.currentProducer = producer;

                // Update toggle button styling
                document.getElementById('producerAustin').classList.toggle('active', producer === 'austin');
                document.getElementById('producerNeil').classList.toggle('active', producer === 'neil');

                console.log(`Producer set to: ${producer === 'austin' ? 'Austin AK' : 'Neil W'}`);
            },

            getProducerInfo() {
                return this.currentProducer === 'austin' ? {
                    name: 'Austin AK',
                    fullName: 'Austin Kay',
                    email: 'austin@altechinsurance.com',
                    phone: '(360) 573-3080'
                } : {
                    name: 'Neil W',
                    fullName: 'Neil Wiebenga',
                    email: 'neil@altechinsurance.com',
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
