/**
 * Prospect Investigator — Commercial Business Intelligence
 * 
 * One-click investigation across public records + AI-powered risk analysis.
 * Data sources: WA L&I, OR CCB, Secretary of State (WA/OR/AZ), OSHA, SAM.gov
 * AI analysis: Gemini generates underwriting narrative, coverage recommendations,
 *              GL classification, and competitive intelligence.
 */

const ProspectInvestigator = (() => {
    'use strict';

    let currentData = null;
    let aiAnalysis = null;

    // ── Public API ──────────────────────────────────────────────

    function init() {
        const stateEl = document.getElementById('prospectState');
        if (stateEl && !stateEl.value) stateEl.value = 'WA';
        console.log('[Prospect] Initialized');
    }

    /** Main one-click investigation — runs all searches + AI analysis */
    async function search() {
        const businessName = document.getElementById('prospectBusinessName')?.value.trim();
        const ubi = document.getElementById('prospectUBI')?.value.trim();
        const city = document.getElementById('prospectCity')?.value.trim();
        const state = document.getElementById('prospectState')?.value || 'WA';

        if (!businessName) {
            _toast('Please enter a business name to search');
            return;
        }

        _showLoading('Searching public records...', 'Querying L&I, Secretary of State, OSHA, and SAM.gov');
        _hideResults();

        try {
            // Phase 1: Run all data-source searches in parallel
            const [liData, sosData, oshaData, samData] = await Promise.all([
                _searchLI(businessName, ubi, state),
                _searchSOS(businessName, ubi, state),
                _searchOSHA(businessName, city, state),
                _searchSAM(businessName, state)
            ]);

            // Check if either L&I or SOS returned multiple results — let user pick
            const liMultiple = liData?.multipleResults && liData.results;
            const sosMultiple = sosData?.multipleResults && sosData.results;

            if (liMultiple || sosMultiple) {
                _showBusinessSelection(
                    _mergeMultipleResults(liMultiple ? liData.results : [], sosMultiple ? sosData.results : []),
                    businessName, city, state
                );
                return;
            }

            // Store combined data
            currentData = {
                businessName,
                ubi,
                city,
                state,
                li: liData,
                sos: sosData,
                osha: oshaData,
                sam: samData,
                timestamp: new Date().toISOString()
            };

            // Phase 2: Display raw results immediately
            _displayResults();

            // Phase 3: Run AI analysis in background
            _runAIAnalysis();

        } catch (error) {
            console.error('[Prospect] Search error:', error);
            _toast('Error searching business records. Please try again.');
        } finally {
            _hideLoading();
        }
    }

    /** Handle business selection from multi-result list */
    async function selectBusiness(ubi, city, state) {
        _showLoading('Loading business details...', 'Fetching full records for selected entity');

        try {
            const [liData, sosData, oshaData, samData] = await Promise.all([
                _searchLI('', ubi, state),
                _searchSOS('', ubi, state),
                _searchOSHA('', city, state),
                _searchSAM('', state)
            ]);

            currentData = {
                businessName: sosData?.entity?.businessName || liData?.contractor?.businessName || 'Selected Business',
                ubi,
                city: sosData?.entity?.principalOffice?.city || liData?.contractor?.address?.city || city,
                state,
                li: liData,
                sos: sosData,
                osha: oshaData,
                sam: samData,
                timestamp: new Date().toISOString()
            };

            _displayResults();
            _runAIAnalysis();

        } catch (error) {
            console.error('[Prospect] Selection error:', error);
            _toast('Error loading business details. Please try again.');
        } finally {
            _hideLoading();
        }
    }

    /** Copy investigation data to clipboard */
    function copyToQuote() {
        if (!currentData) { _toast('Run a search first'); return; }

        const d = currentData;
        const c = d.li?.contractor || {};
        const e = d.sos?.entity || {};
        const ai = aiAnalysis;

        let text = `COMMERCIAL PROSPECT INVESTIGATION
Generated: ${new Date(d.timestamp).toLocaleDateString()}
${'─'.repeat(50)}

BUSINESS: ${d.businessName}
UBI: ${d.ubi || 'N/A'}
Location: ${d.city || 'N/A'}, ${d.state}

CONTRACTOR LICENSE:
  License #: ${c.licenseNumber || 'N/A'}
  Status: ${c.status || 'N/A'}
  Type: ${c.licenseType || 'N/A'}
  Expiration: ${c.expirationDate || 'N/A'}
  Owners: ${_formatOwners(c.owners) || 'N/A'}

BUSINESS ENTITY:
  Type: ${e.entityType || 'N/A'}
  Status: ${e.status || 'N/A'}
  Formation: ${e.formationDate || 'N/A'}

OSHA:
  Inspections: ${d.osha?.summary?.totalInspections || 0}
  Serious Violations: ${d.osha?.summary?.seriousViolations || 0}
  Penalties: $${(d.osha?.summary?.totalPenalties || 0).toLocaleString()}`;

        if (ai) {
            text += `\n\nAI UNDERWRITING ANALYSIS:
${ai.executiveSummary || ''}

RECOMMENDED COVERAGES:
${ai.recommendedCoverages || 'N/A'}

GL CLASSIFICATION:
${ai.glClassification || 'N/A'}

UNDERWRITING NOTES:
${ai.underwritingNotes || 'N/A'}`;
        }

        navigator.clipboard.writeText(text).then(() => {
            _toast('Investigation copied to clipboard');
        }).catch(() => _toast('Failed to copy'));
    }

    function exportReport() {
        if (!currentData) { _toast('Run a search first'); return; }

        // Try jsPDF first, fall back to window.print()
        if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
            window.print();
            return;
        }

        try {
            const { jsPDF } = window.jspdf || jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
            const d = currentData;
            const ai = aiAnalysis;
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 50;
            const usable = pageW - margin * 2;
            let y = margin;

            // ── Helpers ──
            function checkPage(needed) {
                if (y + needed > pageH - 60) {
                    doc.addPage();
                    y = margin;
                    return true;
                }
                return false;
            }

            function heading(text, size, color) {
                checkPage(30);
                doc.setFontSize(size || 14);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...(color || [0, 0, 0]));
                doc.text(text, margin, y);
                y += size ? size + 4 : 18;
            }

            function hr() {
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, y, pageW - margin, y);
                y += 10;
            }

            function body(text, opts = {}) {
                if (!text) return;
                doc.setFontSize(opts.size || 10);
                doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
                doc.setTextColor(opts.color?.[0] || 60, opts.color?.[1] || 60, opts.color?.[2] || 60);
                const lines = doc.splitTextToSize(String(text), usable - (opts.indent || 0));
                for (const line of lines) {
                    checkPage(14);
                    doc.text(line, margin + (opts.indent || 0), y);
                    y += 13;
                }
            }

            function labelValue(label, value) {
                if (!value || value === 'N/A') return;
                checkPage(16);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(80, 80, 80);
                doc.text(label + ':', margin + 8, y);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(40, 40, 40);
                doc.text(String(value), margin + 8 + doc.getTextWidth(label + ':  '), y);
                y += 14;
            }

            // ── Title ──
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('Prospect Investigation Report', margin, y);
            y += 14;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(120, 120, 120);
            doc.text(`${d.businessName} · ${d.state} · ${new Date(d.timestamp).toLocaleDateString()}`, margin, y);
            y += 8;
            hr();

            // ── Business Summary ──
            heading('Business Summary');
            labelValue('Business Name', d.businessName);
            labelValue('UBI', d.ubi);
            labelValue('Location', (d.city ? d.city + ', ' : '') + d.state);
            labelValue('Report Date', new Date(d.timestamp).toLocaleDateString());
            y += 6;

            // ── AI Analysis ──
            if (ai) {
                hr();
                heading('AI Underwriting Analysis', 14, [168, 85, 247]);
                y += 2;

                if (ai.executiveSummary) {
                    heading('Executive Summary', 11, [0, 122, 255]);
                    body(ai.executiveSummary);
                    y += 6;
                }

                if (ai.businessProfile) {
                    heading('Business Profile', 11);
                    body(ai.businessProfile);
                    y += 6;
                }

                if (ai.riskAssessment) {
                    heading('Risk Assessment', 11, [220, 80, 40]);
                    body(ai.riskAssessment);
                    y += 6;
                }

                if (ai.redFlags) {
                    heading('Red Flags & Concerns', 11, [255, 59, 48]);
                    body(ai.redFlags);
                    y += 6;
                }

                if (ai.glClassification) {
                    heading('GL Classification', 11);
                    body(ai.glClassification, { bold: true });
                    y += 4;
                }

                if (ai.naicsAnalysis) {
                    heading('NAICS / Industry', 11);
                    body(ai.naicsAnalysis);
                    y += 4;
                }

                if (ai.recommendedCoverages) {
                    heading('Recommended Coverages', 11, [52, 199, 89]);
                    body(ai.recommendedCoverages);
                    y += 6;
                }

                if (ai.underwritingNotes) {
                    heading('Underwriting Notes', 11);
                    body(ai.underwritingNotes);
                    y += 6;
                }

                if (ai.competitiveIntel) {
                    heading('Competitive Intel & Strategy', 11, [88, 86, 214]);
                    body(ai.competitiveIntel);
                    y += 6;
                }
            }

            // ── Contractor License ──
            const c = d.li?.contractor;
            if (c) {
                hr();
                heading('Contractor License');
                labelValue('License #', c.licenseNumber);
                labelValue('Status', c.status);
                labelValue('Business Name', c.businessName);
                labelValue('License Type', c.licenseType);
                labelValue('Classifications', (c.classifications || []).join(', '));
                labelValue('Owners', _formatOwners(c.owners));
                labelValue('Expiration', c.expirationDate);
                labelValue('Registration', c.registrationDate);
                labelValue('Bond', c.bondAmount);
                labelValue('Bond Company', c.bondCompany);
                labelValue('Insurance Co', c.insuranceCompany);
                labelValue('Insurance Amt', c.insuranceAmount);
                if (c.address) labelValue('Address', [c.address.street, c.address.city, c.address.state, c.address.zip].filter(Boolean).join(', '));
                if (c.violations?.length) {
                    y += 4;
                    body('Violations: ' + c.violations.join('; '), { color: [200, 60, 40] });
                }
                y += 6;
            }

            // ── Business Entity ──
            const e = d.sos?.entity;
            if (e) {
                hr();
                heading('Business Entity Records');
                labelValue('UBI/Entity #', e.ubi);
                labelValue('Entity Type', e.entityType);
                labelValue('Status', e.status);
                labelValue('Formation', e.formationDate);
                labelValue('Jurisdiction', e.jurisdiction);
                labelValue('Business Activity', e.businessActivity);
                if (e.registeredAgent?.name) labelValue('Registered Agent', e.registeredAgent.name);
                const govs = e.governors || e.officers || [];
                if (govs.length) labelValue('Officers', govs.map(g => `${g.name} (${g.title || 'Governor'})`).join(', '));
                y += 6;
            }

            // ── OSHA ──
            if (d.osha?.inspections?.length) {
                hr();
                heading('OSHA Inspection History');
                const s = d.osha.summary || {};
                labelValue('Total Inspections', s.totalInspections);
                labelValue('Serious Violations', s.seriousViolations);
                labelValue('Willful Violations', s.willfulViolations);
                labelValue('Total Penalties', '$' + (s.totalPenalties || 0).toLocaleString());
                y += 6;
            } else {
                hr();
                heading('OSHA Inspection History');
                body('No OSHA violations found in public records.', { color: [52, 199, 89] });
                y += 6;
            }

            // ── SAM.gov ──
            if (d.sam?.available && d.sam.entities?.length) {
                hr();
                heading('SAM.gov Federal Registration');
                const se = d.sam.entities[0];
                labelValue('Legal Name', se.legalBusinessName);
                labelValue('UEI', se.ueiSAM);
                labelValue('CAGE Code', se.cageCode);
                labelValue('Entity Type', se.entityType);
                labelValue('Structure', se.entityStructure);
                labelValue('Status', se.registrationStatus);
                if (se.naicsCodes?.length) labelValue('NAICS', se.naicsCodes.map(n => n.code + (n.isPrimary ? ' (primary)' : '')).join(', '));
                y += 6;
            }

            // ── Footer on every page ──
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(160, 160, 160);
                doc.text(`Altech · altech.agency · Confidential`, margin, pageH - 30);
                doc.text(`Page ${i} of ${totalPages}`, pageW - margin - 60, pageH - 30);
            }

            const filename = `Prospect_${d.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
            doc.save(filename);
            _toast('PDF exported: ' + filename);

        } catch (err) {
            console.error('[Prospect] PDF export error:', err);
            // Fallback to browser print
            window.print();
        }
    }

    // ── Data Source Fetchers ────────────────────────────────────

    async function _searchLI(businessName, ubi, state) {
        try {
            const type = state === 'OR' ? 'or-ccb' : 'li';
            const paramKey = state === 'OR' ? 'license' : 'ubi';
            const res = await fetch(`/api/prospect-lookup?type=${type}&name=${encodeURIComponent(businessName)}&${paramKey}=${encodeURIComponent(ubi || '')}`);
            return await res.json();
        } catch (e) {
            console.error('[Prospect] L&I error:', e);
            return { error: 'Failed to search contractor records', available: false };
        }
    }

    async function _searchSOS(businessName, ubi, state) {
        try {
            const res = await fetch(`/api/prospect-lookup?type=sos&name=${encodeURIComponent(businessName)}&ubi=${encodeURIComponent(ubi || '')}&state=${state}`);
            const data = await res.json();
            if (data.entity?.multipleResults) {
                return { ...data, multipleResults: true, results: data.entity.results, count: data.entity.count };
            }
            return data;
        } catch (e) {
            console.error('[Prospect] SOS error:', e);
            return { error: 'Failed to search Secretary of State records', available: false };
        }
    }

    async function _searchOSHA(businessName, city, state) {
        try {
            const res = await fetch(`/api/prospect-lookup?type=osha&name=${encodeURIComponent(businessName)}&city=${encodeURIComponent(city || '')}&state=${state}`);
            return await res.json();
        } catch (e) {
            console.error('[Prospect] OSHA error:', e);
            return { error: 'Failed to search OSHA records', available: false };
        }
    }

    async function _searchSAM(businessName, state) {
        try {
            const res = await fetch(`/api/prospect-lookup?type=sam&name=${encodeURIComponent(businessName)}&state=${state}`);
            return await res.json();
        } catch (e) {
            console.error('[Prospect] SAM error:', e);
            return { available: false, entities: [] };
        }
    }

    // ── AI Analysis ─────────────────────────────────────────────

    async function _runAIAnalysis() {
        const aiEl = document.getElementById('aiAnalysisContent');
        if (!aiEl || !currentData) return;

        aiEl.innerHTML = `
            <div style="text-align: center; padding: 32px;">
                <div class="ai-pulse" style="font-size: 36px; margin-bottom: 12px;">🧠</div>
                <div style="font-weight: 600; margin-bottom: 4px;">Researching Business...</div>
                <div style="font-size: 13px; color: var(--text-secondary);">Gemini is searching the web and analyzing public records to build your underwriting intelligence report</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; opacity: 0.6;">This typically takes 10–20 seconds</div>
            </div>`;

        // Show the section
        const aiSection = document.getElementById('aiAnalysisSection');
        if (aiSection) aiSection.style.display = 'block';

        try {
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch) ? Auth.apiFetch.bind(Auth) : fetch;
            const res = await fetchFn('/api/prospect-lookup?type=ai-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    businessName: currentData.businessName,
                    state: currentData.state,
                    li: currentData.li,
                    sos: currentData.sos,
                    osha: currentData.osha,
                    sam: currentData.sam
                })
            });

            const data = await res.json();

            if (!data.success || !data.analysis) {
                aiEl.innerHTML = `
                    <div style="padding: 16px; background: rgba(255,149,0,0.06); border-left: 4px solid #FF9500; border-radius: 4px;">
                        <p style="margin: 0; color: var(--text-secondary);">\u26A0\uFE0F AI analysis unavailable: ${_esc(data.error || 'Sign in to enable AI analysis')}</p>
                    </div>`;
                return;
            }

            aiAnalysis = data.analysis;
            _renderAIAnalysis(data.analysis, data.groundedSearch);

        } catch (error) {
            console.error('[Prospect] AI analysis error:', error);
            aiEl.innerHTML = `
                <div style="padding: 16px; background: rgba(255,149,0,0.06); border-left: 4px solid #FF9500; border-radius: 4px;">
                    <p style="margin: 0; color: var(--text-secondary);">\u26A0\uFE0F AI analysis unavailable \u2014 check your connection and try again</p>
                </div>`;
        }
    }

    function _renderAIAnalysis(a, grounded) {
        const el = document.getElementById('aiAnalysisContent');
        if (!el) return;

        /** Convert a long text string into formatted HTML — detects bullet-like patterns */
        function _formatAIText(text) {
            if (!text) return '';
            // Split on common list separators: numbered lists, dashes, bullets, newlines with capital letters
            const lines = text.split(/(?:\n|(?<=\.)\s+(?=\d+\.|[-•]\s|[A-Z]))/g).map(l => l.trim()).filter(Boolean);
            if (lines.length > 1) {
                return '<ul style="margin:0;padding-left:20px;">' +
                    lines.map(l => '<li style="margin-bottom:6px;line-height:1.6;">' + _esc(l.replace(/^[-•\d]+[.)]\s*/, '')) + '</li>').join('') +
                    '</ul>';
            }
            return '<p style="margin:0;line-height:1.7;">' + _esc(text) + '</p>';
        }

        /** Build a content block with icon, title, optional accent color, and formatted body */
        function _block(icon, title, text, opts = {}) {
            if (!text) return '';
            const bg = opts.bg || 'transparent';
            const borderColor = opts.border || 'transparent';
            const titleColor = opts.titleColor || 'inherit';
            const padded = bg !== 'transparent' || borderColor !== 'transparent';
            return `
                <div class="ai-content-block" style="${padded ? `padding:16px;border-radius:12px;background:${bg};border:1px solid ${borderColor};` : ''}">
                    <h4 style="color:${titleColor};">
                        <span style="font-size:18px;">${icon}</span> ${title}
                    </h4>
                    ${_formatAIText(text)}
                </div>`;
        }

        el.innerHTML = `
            ${_block('\uD83D\uDCCB', 'Executive Summary', a.executiveSummary, { bg: 'rgba(0,122,255,0.04)', border: 'rgba(0,122,255,0.12)', titleColor: 'var(--apple-blue)' })}

            ${_block(_riskIcon(a.riskAssessment), 'Risk Assessment', a.riskAssessment)}

            ${_block('\uD83D\uDEA9', 'Red Flags & Concerns', a.redFlags, { bg: 'rgba(255,59,48,0.04)', border: 'rgba(255,59,48,0.12)', titleColor: 'var(--danger)' })}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                ${a.glClassification ? `
                <div class="ai-content-block" style="padding:14px;background:var(--bg-input);border-radius:10px;margin-bottom:0;">
                    <h4><span style="font-size:16px;">\uD83C\uDFF7\uFE0F</span> GL Classification</h4>
                    <p style="margin:0;font-size:13px;line-height:1.5;font-weight:600;">${_esc(a.glClassification)}</p>
                </div>` : '<div></div>'}
                ${a.naicsAnalysis ? `
                <div class="ai-content-block" style="padding:14px;background:var(--bg-input);border-radius:10px;margin-bottom:0;">
                    <h4><span style="font-size:16px;">\uD83D\uDCCA</span> NAICS / Industry</h4>
                    ${_formatAIText(a.naicsAnalysis)}
                </div>` : '<div></div>'}
            </div>

            ${_block('\uD83D\uDEE1\uFE0F', 'Recommended Coverages', a.recommendedCoverages, { bg: 'rgba(52,199,89,0.04)', border: 'rgba(52,199,89,0.12)', titleColor: 'var(--success)' })}

            ${_block('\uD83C\uDFE2', 'Business Profile', a.businessProfile)}

            ${_block('\uD83D\uDCDD', 'Underwriting Notes', a.underwritingNotes, { bg: 'var(--bg-input)', border: 'var(--border)' })}

            ${_block('\uD83D\uDCA1', 'Competitive Intel & Strategy', a.competitiveIntel, { bg: 'rgba(88,86,214,0.04)', border: 'rgba(88,86,214,0.12)', titleColor: '#5856D6' })}

            <div style="text-align:right;font-size:11px;color:var(--text-secondary);opacity:0.6;margin-top:8px;">
                Powered by Gemini AI${grounded ? ' + Google Search' : ''} \u00B7 ${new Date().toLocaleTimeString()}
            </div>
        `;
    }

    // ── Results Display ─────────────────────────────────────────

    function _displayResults() {
        const data = currentData;
        if (!data) return;

        const liOk = data.li && data.li.available !== false && !data.li.error;
        const sosOk = data.sos && data.sos.available !== false && !data.sos.error;
        const oshaOk = data.osha && data.osha.available !== false && !data.osha.error;
        const samOk = data.sam && data.sam.available && data.sam.entities?.length > 0;

        // Source status badges
        const sources = [
            { name: 'L&I', ok: liOk },
            { name: 'SOS', ok: sosOk },
            { name: 'OSHA', ok: oshaOk },
            { name: 'SAM.gov', ok: samOk }
        ];
        const okCount = sources.filter(s => s.ok).length;

        // Business Summary
        _setHtml('businessSummary', `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
                <div><strong>Business Name:</strong> ${_esc(data.businessName)}</div>
                <div><strong>UBI:</strong> ${_esc(data.ubi || 'Not provided')}</div>
                <div><strong>Location:</strong> ${_esc(data.city ? data.city + ', ' : '')}${_esc(data.state)}</div>
                <div><strong>Report Date:</strong> ${new Date(data.timestamp).toLocaleDateString()}</div>
            </div>
            <div style="margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap;">
                ${sources.map(s => `
                    <span style="font-size: 11px; padding: 3px 10px; border-radius: 12px;
                                 background: ${s.ok ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)'};
                                 color: ${s.ok ? '#34C759' : '#FF3B30'}; font-weight: 600;">
                        ${s.ok ? '\u2713' : '\u2717'} ${s.name}
                    </span>
                `).join('')}
                <span style="font-size: 11px; padding: 3px 10px; border-radius: 12px; background: rgba(0,122,255,0.08); color: var(--apple-blue); font-weight: 600;">
                    ${okCount}/${sources.length} sources
                </span>
                <span style="font-size: 11px; padding: 3px 10px; border-radius: 12px; background: rgba(168,85,247,0.1); color: #A855F7; font-weight: 600;">
                    \uD83E\uDDE0 Gemini AI
                </span>
            </div>
        `);

        // L&I Contractor Info
        if (liOk && data.li.contractor) {
            _setHtml('liContractorInfo', _formatLIData(data.li));
        } else {
            _setHtml('liContractorInfo', _formatSourceError(data.li, data.state, 'contractor'));
        }

        // Secretary of State
        if (sosOk && data.sos.entity) {
            _setHtml('sosBusinessInfo', _formatSOSData(data.sos));
        } else {
            _setHtml('sosBusinessInfo', _formatSOSError(data));
        }

        // OSHA
        if (oshaOk && data.osha.inspections?.length > 0) {
            _setHtml('oshaViolations', _formatOSHAData(data.osha));
        } else if (!oshaOk) {
            _setHtml('oshaViolations', _formatSourceError(data.osha, data.state, 'osha'));
        } else {
            _setHtml('oshaViolations', '<p style="color: var(--success);">\u2713 No OSHA violations found in public records</p>');
        }

        // SAM.gov
        const samEl = document.getElementById('samGovInfo');
        const samSection = document.getElementById('samGovSection');
        if (samEl) {
            if (samOk) {
                if (samSection) samSection.style.display = 'block';
                samEl.innerHTML = _formatSAMData(data.sam);
            } else if (data.sam?.note) {
                if (samSection) samSection.style.display = 'block';
                samEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">\u2139\uFE0F ' + _esc(data.sam.note) + '</p>';
            } else {
                if (samSection) samSection.style.display = 'none';
            }
        }

        // Risk Classification (algorithmic)
        _setHtml('riskClassification', _formatRiskClassification(data));

        // Investigation Links
        _setHtml('investigationLinks', _formatInvestigationLinks(data));

        // Show results
        const resultsEl = document.getElementById('prospectResults');
        if (resultsEl) resultsEl.style.display = 'block';
    }

    // ── Format Helpers ──────────────────────────────────────────

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

        return `
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
                </div>` : ''}`;
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
            'WA': { url: 'https://ccfs.sos.wa.gov/#/BusinessSearch', label: 'WA Secretary of State', tip: 'Complete the captcha, then search for the business name.' },
            'OR': { url: 'https://sos.oregon.gov/business/pages/find.aspx', label: 'OR Secretary of State', tip: 'Enter the business name or registry number.' },
            'AZ': { url: 'https://ecorp.azcc.gov/BusinessSearch', label: 'AZ Corporation Commission', tip: 'Search by entity name to find filing details.' }
        };
        const sosLink = sosLinks[data.state];
        const searchTerm = data.businessName || '';
        const manualSearch = data.sos?.manualSearch;

        if ((manualSearch || data.sos?.error) && sosLink) {
            return `
                <div style="padding: 16px 20px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px;">
                    <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px;">
                        <div style="font-size: 28px; flex-shrink: 0;">\uD83D\uDD10</div>
                        <div>
                            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">This site requires verification</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">The ${_esc(data.state)} Secretary of State uses a captcha. Click the checkbox on their page and results load instantly.</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 14px;">
                        <span style="color: var(--text-secondary); font-size: 13px; white-space: nowrap;">Search for:</span>
                        <code style="flex: 1; font-size: 13px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${_esc(searchTerm)}</code>
                        <button onclick="navigator.clipboard.writeText('${searchTerm.replace(/'/g, "\\'")}')" style="flex-shrink:0;padding:4px 10px;font-size:12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--apple-blue);cursor:pointer;font-weight:600;">Copy</button>
                    </div>
                    <a href="${sosLink.url}" target="_blank" rel="noopener noreferrer"
                       style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 16px;background:var(--apple-blue);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
                        Open ${_esc(sosLink.label)} \u2197
                    </a>
                    <div style="margin-top: 10px; padding: 10px 14px; background: rgba(0,122,255,0.04); border-radius: 8px; font-size: 12px; color: var(--text-secondary);">
                        \uD83D\uDCA1 ${_esc(sosLink.tip)}
                    </div>
                </div>`;
        }

        const errorMsg = data.sos?.error || 'No business entity records found';
        return `
            <div style="padding: 12px 16px; background: rgba(255,149,0,0.06); border-left: 4px solid #FF9500; border-radius: 4px;">
                <p style="color: var(--text-secondary); margin: 0;">\u26A0\uFE0F ${_esc(errorMsg)}</p>
            </div>
            ${sosLink ? '<a href="' + sosLink.url + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:10px 18px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;text-decoration:none;color:var(--apple-blue);font-weight:600;font-size:13px;">\uD83D\uDD0D Search ' + _esc(sosLink.label) + '</a>' : ''}`;
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

    // ── Multi-result Selection ──────────────────────────────────

    function _mergeMultipleResults(liResults, sosResults) {
        const seen = new Set();
        const combined = [];

        for (const r of sosResults) {
            const key = (r.ubi || r.businessName).toUpperCase();
            if (!seen.has(key)) { seen.add(key); combined.push({ ...r, _source: 'SOS' }); }
        }
        for (const r of liResults) {
            const key = (r.ubi || r.businessName).toUpperCase();
            if (!seen.has(key)) {
                seen.add(key);
                combined.push({
                    businessName: r.businessName, ubi: r.ubi, entityType: r.licenseType || 'Contractor',
                    status: r.status, city: r.city, formationDate: '', licenseNumber: r.licenseNumber,
                    expirationDate: r.expirationDate, _source: 'L&I'
                });
            }
        }
        return combined;
    }

    function _showBusinessSelection(results, businessName, city, state) {
        _hideLoading();
        const resultsEl = document.getElementById('prospectResults');
        if (resultsEl) resultsEl.style.display = 'block';

        // Hide other sections
        _setHtml('liContractorInfo', '');
        _setHtml('oshaViolations', '');
        _setHtml('riskClassification', '');

        // Show selection UI
        _setHtml('sosBusinessInfo', `
            <div style="background: rgba(0,122,255,0.05); border-left: 4px solid var(--apple-blue); padding: 16px; border-radius: 4px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 12px 0;">\uD83D\uDCCB Multiple businesses found \u2014 select one:</h3>
                <p style="margin: 0; color: var(--text-secondary);">Found ${results.length} businesses matching "${_esc(businessName)}"</p>
            </div>
            <div style="display: grid; gap: 12px;">
                ${results.map(b => `
                    <div onclick="ProspectInvestigator.selectBusiness('${(b.ubi || '').replace(/'/g, "\\'")}', '${(city || '').replace(/'/g, "\\'")}', '${(state || '').replace(/'/g, "\\'")}');"
                         style="padding: 16px; border: 2px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s; background: var(--bg-card);"
                         onmouseover="this.style.borderColor='var(--apple-blue)'" onmouseout="this.style.borderColor='var(--border)'">
                        <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <h4 style="margin: 0; color: var(--apple-blue); font-size: 16px;">${_esc(b.businessName)}</h4>
                                    ${b._source ? '<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ' + (b._source === 'L&I' ? 'rgba(52,199,89,0.15)' : 'rgba(0,122,255,0.1)') + '; color: ' + (b._source === 'L&I' ? 'var(--success)' : 'var(--apple-blue)') + '; font-weight: 600;">' + _esc(b._source) + '</span>' : ''}
                                </div>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 6px; font-size: 13px; color: var(--text-secondary);">
                                    ${b.ubi ? '<div><strong>UBI:</strong> ' + _esc(b.ubi) + '</div>' : ''}
                                    ${b.licenseNumber ? '<div><strong>License:</strong> ' + _esc(b.licenseNumber) + '</div>' : ''}
                                    <div><strong>Type:</strong> ${_esc(b.entityType || 'Unknown')}</div>
                                    ${b.city ? '<div><strong>City:</strong> ' + _esc(b.city) + '</div>' : ''}
                                    <div><strong>Status:</strong> <span style="color: ${_statusColor(b.status)};">${_esc(b.status || 'Unknown')}</span></div>
                                </div>
                            </div>
                            <div style="padding: 8px 16px; background: var(--apple-blue); color: white; border-radius: 6px; font-size: 13px; font-weight: 600;">Select \u2192</div>
                        </div>
                    </div>
                `).join('')}
            </div>`);

        _setHtml('businessSummary', `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 14px;">
                <div><strong>Search Term:</strong> ${_esc(businessName)}</div>
                <div><strong>Results:</strong> ${results.length} businesses</div>
                <div><strong>Location:</strong> ${_esc(city ? city + ', ' : '')}${_esc(state)}</div>
                <div><strong>Status:</strong> Awaiting selection</div>
            </div>`);
    }

    // ── Utilities ────────────────────────────────────────────────

    function _showLoading(title, subtitle) {
        const el = document.getElementById('prospectLoading');
        if (!el) return;
        el.style.display = 'block';
        el.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="ai-pulse" style="font-size: 48px; margin-bottom: 16px;">\u23F3</div>
                <h3>${_esc(title || 'Investigating...')}</h3>
                <p style="color: var(--text-secondary);">${_esc(subtitle || '')}</p>
            </div>`;
    }

    function _hideLoading() {
        const el = document.getElementById('prospectLoading');
        if (el) el.style.display = 'none';
    }

    function _hideResults() {
        const el = document.getElementById('prospectResults');
        if (el) el.style.display = 'none';
        const aiEl = document.getElementById('aiAnalysisSection');
        if (aiEl) aiEl.style.display = 'none';
        aiAnalysis = null;
    }

    function _setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

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

    function _riskIcon(text) {
        if (!text) return '\uD83D\uDCCA';
        const t = text.toUpperCase();
        if (t.includes('CRITICAL') || t.includes('HIGH')) return '\uD83D\uDEA8';
        if (t.includes('ELEVATED') || t.includes('MODERATE')) return '\u26A0\uFE0F';
        return '\u2705';
    }

    function _formatOwners(owners) {
        if (!owners || !owners.length) return '';
        return owners.map(o => typeof o === 'string' ? o : o.name).filter(Boolean).join(', ');
    }

    function _toast(msg) {
        if (typeof App !== 'undefined' && App.toast) App.toast(msg);
        else alert(msg);
    }

    // ── Expose Public API ───────────────────────────────────────

    return {
        init,
        search,
        selectBusiness,
        copyToQuote,
        exportReport,
        get currentData() { return currentData; },
        get aiAnalysis() { return aiAnalysis; }
    };
})();

window.ProspectInvestigator = ProspectInvestigator;
