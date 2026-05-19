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
    let _discoveredCandidates = [];
    let _lastGapNotes = [];
    const STORAGE_KEY = STORAGE_KEYS.SAVED_PROSPECTS;

    // ── Public API ──────────────────────────────────────────────

    function init() {
        const stateEl = document.getElementById('prospectState');
        if (stateEl && !stateEl.value) stateEl.value = 'WA';
        _renderSavedList();
        console.log('[Prospect] Initialized');
    }

    /** Phase 1: Discovery — find candidate businesses, let user pick the right one */
    async function search() {
        const businessName = document.getElementById('prospectBusinessName')?.value.trim();
        const ubi = document.getElementById('prospectUBI')?.value.trim();
        const city = document.getElementById('prospectCity')?.value.trim();
        const state = document.getElementById('prospectState')?.value || 'WA';

        if (!businessName) {
            _toast('Please enter a business name to search');
            return;
        }

        _showLoading('Finding matching businesses...', 'Searching L&I, Secretary of State, and Google');
        _hideResults();

        try {
            // Phase 1: Quick discovery — L&I, SOS, DOR (WA, broad/non-contractor)
            // and Places (discover mode), all in parallel.
            const [liData, sosData, placesData, dorData] = await Promise.all([
                _searchLI(businessName, ubi, state),
                _searchSOS(businessName, ubi, state),
                _searchPlacesDiscover(businessName, city, state),
                _searchDOR(businessName, ubi, state)
            ]);

            const sources = { li: liData, sos: sosData, places: placesData, dor: dorData };
            const candidates = ProspectFormatters.collectCandidates(sources, businessName, state, city);
            _discoveredCandidates = candidates;
            _lastGapNotes = ProspectFormatters.sourceGapNotes({ ...sources, state });

            if (candidates.length === 0) {
                // No record match anywhere — don't dead-end. The AI dossier
                // (Google Search grounded) can research almost any business by
                // name + city + state, so fall straight through to it. Await
                // so search()'s finally doesn't yank investigateManual's loader.
                _toast('No public-records match — running AI research…');
                await investigateManual();
                return;
            }

            // Always show selection UI so user can verify the right business
            _showBusinessSelection(candidates, businessName, city, state);

        } catch (error) {
            console.error('[Prospect] Search error:', error);
            _toast('Error searching business records. Please try again.');
        } finally {
            _hideLoading();
        }
    }

    /** Phase 2: Deep investigation on confirmed business */
    async function selectBusiness(index) {
        const candidate = _discoveredCandidates[index];
        if (!candidate) return;

        const name = candidate.businessName || '';
        const ubi = candidate.ubi || '';
        const city = candidate.city || '';
        const state = candidate.state || document.getElementById('prospectState')?.value || 'WA';
        const placeId = candidate.placeId || '';

        _showLoading('Running Full Investigation...', `Querying all databases for ${name}`);

        try {
            // Phase 2: Run ALL 5 data sources with confirmed business info
            const [liData, sosData, oshaData, samData, placesData] = await Promise.all([
                _searchLI(name, ubi, state),
                _searchSOS(name, ubi, state),
                _searchOSHA(name, city, state),
                _searchSAM(name, state),
                _searchPlaces(name, city, state, placeId)
            ]);

            // Discard Google Places data if it returned a business in a different state
            _validatePlacesState(placesData, state);

            // Store combined data
            currentData = {
                businessName: name,
                ubi,
                city: sosData?.entity?.principalOffice?.city || liData?.contractor?.address?.city || city,
                state,
                li: liData,
                sos: sosData,
                osha: oshaData,
                sam: samData,
                places: placesData,
                timestamp: new Date().toISOString()
            };
            currentData.displayName = _resolveDisplayName(currentData);

            _displayResults();
            _finishInvestigation();

        } catch (error) {
            console.error('[Prospect] Investigation error:', error);
            _toast('Error loading business details. Please try again.');
        } finally {
            _hideLoading();
        }
    }

    /** Skip selection — investigate with original search terms */
    async function investigateManual() {
        const businessName = document.getElementById('prospectBusinessName')?.value.trim();
        const ubi = document.getElementById('prospectUBI')?.value.trim();
        const city = document.getElementById('prospectCity')?.value.trim();
        const state = document.getElementById('prospectState')?.value || 'WA';

        _showLoading('Running Full Investigation...', `Searching all databases for "${businessName}"`);

        try {
            const [liData, sosData, oshaData, samData, placesData] = await Promise.all([
                _searchLI(businessName, ubi, state),
                _searchSOS(businessName, ubi, state),
                _searchOSHA(businessName, city, state),
                _searchSAM(businessName, state),
                _searchPlaces(businessName, city, state)
            ]);

            // Discard Google Places data if it returned a business in a different state
            _validatePlacesState(placesData, state);

            currentData = {
                businessName,
                ubi,
                city,
                state,
                li: liData,
                sos: sosData,
                osha: oshaData,
                sam: samData,
                places: placesData,
                timestamp: new Date().toISOString()
            };
            currentData.displayName = _resolveDisplayName(currentData);

            _displayResults();
            _finishInvestigation();

        } catch (error) {
            console.error('[Prospect] Manual investigation error:', error);
            _toast('Error searching business records. Please try again.');
        } finally {
            _hideLoading();
        }
    }

    /**
     * After source data loads: if SOS failed, prompt user to paste SOS data
     * before running AI analysis. If SOS succeeded, run AI immediately.
     */
    function _finishInvestigation() {
        const sosOk = currentData.sos && currentData.sos.available !== false && !currentData.sos.error && currentData.sos.entity;
        if (sosOk) {
            // SOS data is available — run AI immediately
            _runAIAnalysis();
            return;
        }

        // SOS failed — show paste prompt before AI
        _showSOSPastePrompt();
    }

    /** Show inline SOS paste prompt with skip option — includes SOS link + search term */
    function _showSOSPastePrompt() {
        const aiEl = document.getElementById('aiAnalysisContent');
        const aiSection = document.getElementById('aiAnalysisSection');
        if (!aiEl || !aiSection) { _runAIAnalysis(); return; }

        const state = currentData.state || 'WA';
        const sosLinks = {
            'WA': { url: 'https://ccfs.sos.wa.gov/#/BusinessSearch', label: 'WA Secretary of State' },
            'OR': { url: 'https://sos.oregon.gov/business/pages/find.aspx', label: 'OR Secretary of State' },
            'AZ': { url: 'https://ecorp.azcc.gov/BusinessSearch', label: 'AZ Corporation Commission' }
        };
        const sosLink = sosLinks[state] || sosLinks['WA'];
        const searchUrl = currentData.sos?.searchUrl || sosLink.url;
        const searchTerm = currentData.ubi || currentData.businessName || '';

        aiSection.style.display = 'block';
        aiEl.innerHTML = `
            <div style="padding:24px 20px;">
                <div style="text-align:center;margin-bottom:20px;">
                    <div style="font-size:36px;margin-bottom:12px;">\uD83D\uDD10</div>
                    <div style="font-weight:700;font-size:16px;margin-bottom:6px;">Secretary of State data is missing</div>
                    <p style="font-size:13px;color:var(--text-secondary);margin:0;max-width:440px;margin-left:auto;margin-right:auto;">
                        The SOS website blocked our lookup. Grab the data for a more complete analysis, or skip to run with what we have.
                    </p>
                </div>

                <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
                    <div style="font-weight:600;font-size:13px;margin-bottom:10px;">\uD83D\uDCA1 Quick steps:</div>
                    <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
                        1. Click the link below to open ${_esc(sosLink.label)}<br>
                        2. Search for <strong style="color:var(--text);">${_esc(searchTerm)}</strong>
                        <button onclick="navigator.clipboard.writeText('${searchTerm.replace(/'/g, "\\'")}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" style="margin-left:6px;padding:2px 10px;font-size:11px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--apple-blue);cursor:pointer;font-weight:600;">Copy</button><br>
                        3. Select All (Ctrl+A) on the results page, Copy (Ctrl+C)<br>
                        4. Come back here and click <strong style="color:var(--text);">Paste SOS Data</strong>
                    </div>
                </div>

                <a href="${_esc(searchUrl)}" target="_blank" rel="noopener noreferrer"
                    style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 16px;background:var(--apple-blue);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;margin-bottom:12px;">
                    Open ${_esc(sosLink.label)} \u2197
                </a>

                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button onclick="ProspectInvestigator.pasteSOSData(true)"
                        style="flex:1;padding:12px 24px;background:var(--bg-card);color:var(--text);border:1.5px dashed var(--border);border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                        \uD83D\uDCCB Paste SOS Data
                    </button>
                    <button onclick="ProspectInvestigator._skipSOSAndRunAI()"
                        style="padding:12px 24px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border);border-radius:10px;font-weight:500;font-size:13px;cursor:pointer;">
                        Skip \u2014 Run AI Without SOS
                    </button>
                </div>
            </div>`;
    }

    function _skipSOSAndRunAI() {
        _runAIAnalysis();
    }

    /** Copy investigation data to clipboard */
    function copyToQuote() {
        if (!currentData) { _toast('Run a search first'); return; }

        const d = currentData;
        const c = d.li?.contractor || {};
        const e = d.sos?.entity || {};
        const ai = aiAnalysis;
        const gp = d.places?.profile;

        let text = `COMMERCIAL PROSPECT INVESTIGATION
Generated: ${new Date(d.timestamp).toLocaleDateString()}
${'─'.repeat(50)}

BUSINESS: ${d.displayName || d.businessName}
UBI: ${d.ubi || 'N/A'}
Location: ${d.city || 'N/A'}, ${d.state}`;

        if (gp) {
            text += `\n\nGOOGLE BUSINESS PROFILE:
  Phone: ${gp.phone || 'N/A'}
  Website: ${gp.website || 'N/A'}
  Address: ${gp.address || 'N/A'}
  Rating: ${gp.rating ? gp.rating + '/5 (' + (gp.totalReviews || 0) + ' reviews)' : 'N/A'}
  Status: ${gp.businessStatus ? gp.businessStatus.replace(/_/g, ' ') : 'N/A'}
  Categories: ${gp.types?.length ? gp.types.map(t => t.replace(/_/g, ' ')).join(', ') : 'N/A'}`;
        }

        text += `\n
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

            if (ai.businessHistory) text += `\n\nBUSINESS HISTORY:\n${ai.businessHistory}`;
            if (ai.keyPersonnel) text += `\n\nKEY PERSONNEL:\n${ai.keyPersonnel}`;
            if (ai.serviceArea) text += `\n\nSERVICE AREA:\n${ai.serviceArea}`;
            if (ai.buildingInfo) text += `\n\nBUILDING & PREMISES:\n${ai.buildingInfo}`;
            if (ai.website) text += `\n\nWEBSITE: ${ai.website}`;
            if (ai.socialMedia) text += `\n\nSOCIAL MEDIA:\n${ai.socialMedia}`;
            if (ai.riskAssessment) text += `\n\nRISK ASSESSMENT:\n${ai.riskAssessment}`;
            if (ai.competitiveIntel) text += `\n\nCOMPETITIVE INTEL:\n${ai.competitiveIntel}`;
        }

        navigator.clipboard.writeText(text).then(() => {
            _toast('Investigation copied to clipboard');
        }).catch(() => _toast('Failed to copy'));
    }

    async function exportReport() {
        if (!currentData) { _toast('Run a search first'); return; }

        // Lazy-load jsPDF from CDN if missing
        if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
            try {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error('CDN unreachable'));
                    document.head.appendChild(s);
                });
            } catch (_) { /* check below */ }
        }
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
            const mg = 50;
            const cw = pageW - mg * 2;
            let y = mg;

            // ── Toner-friendly palette (matches personal lines app-export.js) ──
            const INK   = [30, 30, 30];
            const MID   = [80, 80, 80];
            const LIGHT = [165, 165, 165];
            const RULE  = [190, 190, 190];
            const FILL  = [232, 232, 232];
            const ACCENT = [60, 60, 60];

            // ── Utility helpers ──
            const addPage = () => { doc.addPage(); y = mg; };
            const need = (h) => { if (y + h > pageH - 50) addPage(); };

            const fmtDateTime = (dt) => {
                const d2 = dt instanceof Date ? dt : new Date(dt);
                if (isNaN(d2)) return '';
                let h = d2.getHours(), m = String(d2.getMinutes()).padStart(2, '0');
                const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
                return `${d2.getMonth()+1}/${d2.getDate()}/${d2.getFullYear()} ${h}:${m} ${ap}`;
            };

            // ── Section label (thin rule + ALL-CAPS, matching personal lines) ──
            const sectionLabel = (title) => {
                need(50); // reserve enough for header + at least a few lines of content
                y += 14;
                doc.setDrawColor(...RULE); doc.setLineWidth(0.4);
                doc.line(mg, y, pageW - mg, y);
                doc.setFontSize(7); doc.setFont('helvetica', 'bold');
                doc.setTextColor(...MID);
                doc.text(title.toUpperCase(), mg, y + 5);
                doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
                y += 16;
            };

            // ── Sub-header (bold text + light underline) ──
            // Reserves 40pt to avoid orphaning the header at page bottom
            const subHeader = (title) => {
                need(40);
                y += 10;
                doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                doc.setTextColor(...INK);
                doc.text(title, mg, y);
                doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
                doc.line(mg, y + 3, pageW - mg, y + 3);
                doc.setFont('helvetica', 'normal');
                y += 14;
            };

            // ── 2-col key-value table with alternating fill ──
            const baseRowH = 16;
            const kvLineH = 12;

            const kvRow = (fields, cols) => {
                cols = cols || 2;
                const filtered = fields.filter(f => f[1] && String(f[1]).trim() && String(f[1]).trim() !== 'N/A');
                if (!filtered.length) return;
                const rows = [];
                for (let i = 0; i < filtered.length; i += cols) rows.push(filtered.slice(i, i + cols));
                const colW = cw / cols;
                const labelW = colW * 0.35;
                const maxW = colW - labelW - 6;

                rows.forEach((row, ri) => {
                    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                    let maxLines = 1;
                    const splitCache = row.map(f => {
                        const lines = doc.splitTextToSize(String(f[1]), maxW);
                        if (lines.length > maxLines) maxLines = lines.length;
                        return lines;
                    });
                    const rowH = baseRowH + (maxLines - 1) * kvLineH;
                    need(rowH + 1);
                    if (ri % 2 === 1) {
                        doc.setFillColor(...FILL);
                        doc.rect(mg, y - 1, cw, rowH, 'F');
                    }
                    row.forEach((f, ci) => {
                        const x = mg + ci * colW;
                        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MID);
                        doc.text(String(f[0]), x + 2, y + 4);
                        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK);
                        const lines = splitCache[ci];
                        lines.forEach((line, li) => { doc.text(line, x + labelW, y + 4 + li * kvLineH); });
                    });
                    y += rowH;
                });
                y += 4;
            };

            // ── Body text with bullet/number detection ──
            const body = (text, opts) => {
                if (!text) return;
                opts = opts || {};
                const sz = opts.size || 9;
                const bld = opts.bold || false;
                const clr = opts.color || INK;
                const indent = opts.indent || 0;
                const lineH = sz + 3;
                const rawText = String(text);
                let lines = rawText.split(/\n/);
                if (lines.length === 1 && rawText.length > 120) {
                    const split = rawText.split(/(?=\s*[-•]\s+(?=[A-Z*]))/);
                    if (split.length > 1) lines = split;
                }
                let lastWasList = false;

                for (const rawLine of lines) {
                    const trimmed = rawLine.trim();
                    if (!trimmed) { y += 6; lastWasList = false; continue; }
                    const clean = trimmed.replace(/\*\*(.+?)\*\*/g, '$1');
                    const bulletMatch = clean.match(/^[-•*]\s+(.+)/);
                    const numMatch = clean.match(/^(\d+)[.)]\s*(.+)/);

                    if (bulletMatch) {
                        need(14);
                        doc.setFontSize(sz); doc.setFont('helvetica', 'normal'); doc.setTextColor(...clr);
                        doc.text('\u2022', mg + indent + 6, y);
                        const textIndent = indent + 16;
                        const labelPat = bulletMatch[1].match(/^([^:]{1,40}):\s*(.+)/);
                        if (labelPat) {
                            doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK);
                            const lbl = labelPat[1] + ': ';
                            doc.text(lbl, mg + textIndent, y);
                            const lblW = doc.getTextWidth(lbl);
                            doc.setFont('helvetica', 'normal'); doc.setTextColor(...clr);
                            const rest = doc.splitTextToSize(labelPat[2], cw - textIndent - lblW);
                            if (rest.length > 0) {
                                doc.text(rest[0], mg + textIndent + lblW, y); y += lineH;
                                for (let i = 1; i < rest.length; i++) { need(12); doc.text(rest[i], mg + textIndent, y); y += lineH; }
                            } else { y += lineH; }
                        } else {
                            const wrapped = doc.splitTextToSize(bulletMatch[1], cw - textIndent);
                            for (let i = 0; i < wrapped.length; i++) { if (i > 0) need(12); doc.text(wrapped[i], mg + textIndent, y); y += lineH; }
                        }
                        lastWasList = true;
                    } else if (numMatch) {
                        need(14);
                        doc.setFontSize(sz); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK);
                        doc.text(numMatch[1] + '.', mg + indent + 6, y);
                        doc.setFont('helvetica', 'normal'); doc.setTextColor(...clr);
                        const textIndent = indent + 18;
                        const wrapped = doc.splitTextToSize(clean.replace(/^\d+[.)]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1'), cw - textIndent);
                        for (let i = 0; i < wrapped.length; i++) { if (i > 0) need(12); doc.text(wrapped[i], mg + textIndent, y); y += lineH; }
                        lastWasList = true;
                    } else {
                        if (lastWasList) y += 5;
                        doc.setFontSize(sz); doc.setFont('helvetica', bld ? 'bold' : 'normal'); doc.setTextColor(...clr);
                        const wrapped = doc.splitTextToSize(clean, cw - indent);
                        for (const wl of wrapped) { need(12); doc.text(wl, mg + indent, y); y += lineH; }
                        lastWasList = false;
                    }
                }
                y += 4;
            };

            // ════════════════════════════════════════════════════════════
            //  ① DOCUMENT HEADER
            // ════════════════════════════════════════════════════════════

            // Top accent bar
            doc.setFillColor(...ACCENT);
            doc.rect(mg, mg - 6, cw, 2, 'F');
            y = mg + 4;

            // Title + business name
            doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK);
            doc.text('Prospect Investigation Report', mg, y);
            y += 18;
            doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MID);
            doc.text((d.displayName || d.businessName) + ' \u00b7 ' + d.state + ' \u00b7 ' + new Date(d.timestamp).toLocaleDateString(), mg, y);
            y += 10;

            // Risk rating badge (text-only, toner-safe)
            const riskRating = ai?.riskRating || '';
            if (riskRating) {
                doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACCENT);
                doc.text('RISK: ' + riskRating.toUpperCase(), pageW - mg, y, { align: 'right' });
            }
            y += 8;

            // ── Data Sources Status Row ──
            const liOk = d.li && d.li.available !== false && !d.li.error && d.li.contractor;
            const sosOk = d.sos && d.sos.available !== false && !d.sos.error && d.sos.entity;
            const oshaOk = d.osha && d.osha.available !== false && !d.osha.error;
            const samOk = d.sam && d.sam.available && d.sam.entities?.length > 0;
            const placesOk = d.places && d.places.available && d.places.profile;
            const srcCount = [liOk, sosOk, oshaOk, samOk, placesOk].filter(Boolean).length;

            doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MID);
            const srcLine = [
                (liOk ? '[Y]' : '[N]') + ' L&I',
                (sosOk ? '[Y]' : '[N]') + ' SOS',
                (oshaOk ? '[Y]' : '[N]') + ' OSHA',
                (samOk ? '[Y]' : '[N]') + ' SAM',
                (placesOk ? '[Y]' : '[N]') + ' Google',
            ].join('    ') + '    (' + srcCount + '/5 sources)';
            doc.text(srcLine, mg, y);
            y += 12;

            // ════════════════════════════════════════════════════════════
            //  ② BUSINESS OVERVIEW (kvRow table)
            // ════════════════════════════════════════════════════════════
            sectionLabel('Business Overview');

            const gp = d.places?.profile;
            const _c = d.li?.contractor || {};
            const _e = d.sos?.entity || {};
            const bestPhone = gp?.phone || _c.phone || '';
            // Strip AI editorial notes from URL (e.g. "(Note: This website is...")
            const rawWebsite = gp?.website || ai?.website || '';
            const bestWebsite = rawWebsite.replace(/\s*\(Note:.*$/i, '').trim();
            const bestAddress = gp?.address || (_c.address ? [_c.address.street, _c.address.city, _c.address.state, _c.address.zip].filter(Boolean).join(', ') : '') || (_e.principalOffice ? [_e.principalOffice.street, _e.principalOffice.city, _e.principalOffice.state, _e.principalOffice.zip].filter(Boolean).join(', ') : '');

            const overviewFields = [
                ['Location', (d.city ? d.city + ', ' : '') + d.state],
                ['Phone', bestPhone],
                ['UBI', d.ubi],
                ['Website', bestWebsite],
                ['Address', bestAddress],
                ['Google Rating', gp?.rating ? gp.rating + '/5 (' + (gp.totalReviews || 0) + ' reviews)' : ''],
                ['Categories', gp?.types?.length ? gp.types.map(t => t.replace(/_/g, ' ')).join(', ') : ''],
                ['Status', gp?.businessStatus ? gp.businessStatus.replace(/_/g, ' ') : ''],
                ['Report Date', new Date(d.timestamp).toLocaleDateString()],
                ['Est. Employees', ai?.estimatedEmployees || ''],
                ['Est. Revenue', ai?.estimatedRevenue || ''],
                ['Years in Business', ai?.yearsInBusiness ? String(ai.yearsInBusiness) : ''],
            ];
            kvRow(overviewFields, 2);

            // ════════════════════════════════════════════════════════════
            //  ③ EXECUTIVE SUMMARY (boxed)
            // ════════════════════════════════════════════════════════════
            if (ai?.executiveSummary) {
                const summaryText = String(ai.executiveSummary).replace(/\*\*(.+?)\*\*/g, '$1');
                const summaryLines = doc.splitTextToSize(summaryText, cw - 24);
                const boxH = summaryLines.length * 12 + 20;
                need(boxH + 8);
                doc.setFillColor(245, 245, 245);
                doc.setDrawColor(...LIGHT);
                doc.setLineWidth(0.5);
                doc.roundedRect(mg, y, cw, boxH, 3, 3, 'FD');
                // Accent bar left
                doc.setFillColor(...ACCENT);
                doc.rect(mg, y, 3, boxH, 'F');
                doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MID);
                doc.text('EXECUTIVE SUMMARY', mg + 10, y + 10);
                y += 18;
                doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
                for (const sl of summaryLines) { doc.text(sl, mg + 10, y); y += 12; }
                y += 12;
            }

            // ════════════════════════════════════════════════════════════
            //  ④ RISK & COVERAGE
            // ════════════════════════════════════════════════════════════
            if (ai && (ai.riskAssessment || ai.redFlags || ai.recommendedCoverages || ai.glClassification || ai.naicsAnalysis)) {
                sectionLabel('Risk & Coverage');

                if (ai.riskAssessment) { subHeader('Risk Assessment'); body(ai.riskAssessment); }
                if (ai.redFlags) { subHeader('Red Flags & Concerns'); body(ai.redFlags); }

                if (ai.glClassification) {
                    subHeader('GL Classification');
                    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK);
                    const glClean = String(ai.glClassification).replace(/\*\*(.+?)\*\*/g, '$1');
                    const glLines = doc.splitTextToSize(glClean, cw);
                    for (const gl of glLines) { need(14); doc.text(gl, mg, y); y += 13; }
                    y += 6;
                }

                if (ai.naicsAnalysis) { subHeader('NAICS / Industry'); body(ai.naicsAnalysis); }

                if (ai.recommendedCoverages) {
                    subHeader('Recommended Coverages');
                    // Try to parse structured "Coverage: Limit (reason)" lines into kvRow
                    const covLines = String(ai.recommendedCoverages).split('\n').map(l => l.trim().replace(/^[-•*]\s+/, '')).filter(Boolean);
                    const covPairs = [];
                    for (const line of covLines) {
                        const m = line.replace(/\*\*(.+?)\*\*/g, '$1').match(/^([^:]{2,50}):\s*(.+)/);
                        if (m) covPairs.push([m[1].trim(), m[2].trim()]);
                    }
                    if (covPairs.length >= 3) {
                        // Structured table
                        kvRow(covPairs, 1);
                    } else {
                        // Fallback to bullet rendering
                        body(ai.recommendedCoverages);
                    }
                }
            }

            // ════════════════════════════════════════════════════════════
            //  ⑤ BUSINESS INTELLIGENCE
            // ════════════════════════════════════════════════════════════
            if (ai && (ai.businessProfile || ai.businessHistory || ai.keyPersonnel || ai.serviceArea || ai.buildingInfo)) {
                sectionLabel('Business Intelligence');

                if (ai.businessProfile) { subHeader('Business Profile'); body(ai.businessProfile); }
                if (ai.businessHistory) { subHeader('Business History'); body(ai.businessHistory); }

                if (ai.keyPersonnel) {
                    subHeader('Key Personnel');
                    // Try structured "Name (Title) — notes" format as kvRow
                    const pLines = String(ai.keyPersonnel).split('\n').map(l => l.trim().replace(/^[-•*]\s+/, '')).filter(Boolean);
                    const pPairs = [];
                    for (const line of pLines) {
                        const clean = line.replace(/\*\*(.+?)\*\*/g, '$1');
                        const m = clean.match(/^([^(—\-]+)\s*[(\-—]+\s*(.+)/);
                        if (m) pPairs.push([m[1].trim(), m[2].replace(/\)\s*[—\-]\s*/, ' \u2014 ').replace(/\)$/, '').trim()]);
                    }
                    if (pPairs.length >= 2) {
                        kvRow(pPairs, 1);
                    } else {
                        body(ai.keyPersonnel);
                    }
                }

                if (ai.serviceArea) { subHeader('Service Area & Territory'); body(ai.serviceArea); }
                if (ai.buildingInfo) { subHeader('Building & Premises'); body(ai.buildingInfo); }
            }

            // ════════════════════════════════════════════════════════════
            //  ⑥ STRATEGY & NOTES
            // ════════════════════════════════════════════════════════════
            if (ai && (ai.underwritingNotes || ai.competitiveIntel || ai.website || ai.socialMedia)) {
                sectionLabel('Strategy & Notes');

                if (ai.underwritingNotes) { subHeader('Underwriting Notes'); body(ai.underwritingNotes); }
                if (ai.competitiveIntel) { subHeader('Competitive Intel & Strategy'); body(ai.competitiveIntel); }

                if (ai.website || ai.socialMedia) {
                    subHeader('Online Presence');
                    // Parse structured "Platform: URL" lines into kvRow
                    const onlineLines = [];
                    if (ai.website && ai.website !== 'No website found') onlineLines.push(['Website', ai.website]);
                    if (ai.socialMedia) {
                        const smLines = String(ai.socialMedia).split('\n').map(l => l.trim()).filter(Boolean);
                        for (const line of smLines) {
                            const clean = line.replace(/^[-•*]\s+/, '').replace(/;$/, '').trim();
                            const m = clean.match(/^([^:]{2,30}):\s*(.+)/);
                            if (m) onlineLines.push([m[1].trim(), m[2].trim()]);
                            else if (clean) onlineLines.push(['', clean]);
                        }
                    }
                    if (onlineLines.length >= 2) {
                        kvRow(onlineLines, 1);
                    } else {
                        if (ai.website) body('Website: ' + ai.website);
                        if (ai.socialMedia) body(ai.socialMedia);
                    }
                }
            }

            // ════════════════════════════════════════════════════════════
            //  ⑦ SOURCE RECORDS
            // ════════════════════════════════════════════════════════════

            // Contractor License
            const c = d.li?.contractor;
            if (c) {
                sectionLabel('Contractor License');
                kvRow([
                    ['License #', c.licenseNumber], ['Status', c.status],
                    ['License Type', c.licenseType], ['Expiration', c.expirationDate],
                    ['Classifications', (c.classifications || []).join(', ')], ['Registration', c.registrationDate],
                    ['Owners', _formatOwners(c.owners)], ['Bond', c.bondAmount],
                    ['Bond Company', c.bondCompany], ['Insurance Co', c.insuranceCompany],
                    ['Insurance Amt', c.insuranceAmount],
                    ['Address', c.address ? [c.address.street, c.address.city, c.address.state, c.address.zip].filter(Boolean).join(', ') : ''],
                ], 2);
                if (c.violations?.length) {
                    body('Violations: ' + c.violations.join('; '), { color: [180, 40, 30] });
                }
            }

            // Business Entity
            const e = d.sos?.entity;
            if (e) {
                sectionLabel('Business Entity Records');
                const govs = e.governors || e.officers || [];
                kvRow([
                    ['UBI/Entity #', e.ubi], ['Entity Type', e.entityType],
                    ['Status', e.status], ['Formation', e.formationDate ? new Date(e.formationDate).toLocaleDateString() : ''],
                    ['Jurisdiction', e.jurisdiction], ['Business Activity', e.businessActivity],
                    ['Registered Agent', e.registeredAgent?.name || ''],
                    ['Officers', govs.length ? govs.map(g => g.name + ' (' + (g.title || 'Governor') + ')').join(', ') : ''],
                ], 2);
            }

            // OSHA
            sectionLabel('OSHA Inspection History');
            if (d.osha?.inspections?.length) {
                const s = d.osha.summary || {};
                kvRow([
                    ['Total Inspections', String(s.totalInspections || 0)], ['Serious Violations', String(s.seriousViolations || 0)],
                    ['Willful Violations', String(s.willfulViolations || 0)], ['Total Penalties', '$' + (s.totalPenalties || 0).toLocaleString()],
                ], 2);
            } else {
                doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MID);
                doc.text('No OSHA violations found in public records.', mg, y + 2);
                y += 16;
            }

            // SAM.gov
            if (d.sam?.available && d.sam.entities?.length) {
                sectionLabel('SAM.gov Federal Registration');
                const se = d.sam.entities[0];
                kvRow([
                    ['Legal Name', se.legalBusinessName], ['UEI', se.ueiSAM],
                    ['CAGE Code', se.cageCode], ['Entity Type', se.entityType],
                    ['Structure', se.entityStructure], ['Status', se.registrationStatus],
                    ['NAICS', se.naicsCodes?.length ? se.naicsCodes.map(n => n.code + (n.isPrimary ? ' (primary)' : '')).join(', ') : ''],
                ], 2);
            }

            // ════════════════════════════════════════════════════════════
            //  FOOTER (every page — matches personal lines format)
            // ════════════════════════════════════════════════════════════
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
                doc.line(mg, pageH - 40, pageW - mg, pageH - 40);
                doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MID);
                doc.text('Altech Insurance Tools', mg, pageH - 32);
                doc.text('Page ' + i + ' of ' + totalPages, pageW / 2, pageH - 32, { align: 'center' });
                doc.text(fmtDateTime(new Date()), pageW - mg, pageH - 32, { align: 'right' });
            }

            const filename = 'Prospect_' + (d.displayName || d.businessName).replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
            doc.save(filename);
            _toast('PDF exported: ' + filename);

        } catch (err) {
            console.error('[Prospect] PDF export error:', err);
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

    async function _searchPlaces(businessName, city, state, placeId) {
        try {
            let url = `/api/prospect-lookup?type=places&name=${encodeURIComponent(businessName)}&city=${encodeURIComponent(city || '')}&state=${state}`;
            if (placeId) url += `&placeId=${encodeURIComponent(placeId)}`;
            const res = await fetch(url);
            return await res.json();
        } catch (e) {
            console.error('[Prospect] Places error:', e);
            return { available: false };
        }
    }

    /** WA Department of Revenue — broad non-contractor entity source (Phase 1) */
    async function _searchDOR(businessName, ubi, state) {
        if (state !== 'WA') return { available: false, note: 'Washington-only' };
        try {
            const res = await fetch(`/api/prospect-lookup?type=dor&name=${encodeURIComponent(businessName)}&ubi=${encodeURIComponent(ubi || '')}&state=${state}`);
            return await res.json();
        } catch (e) {
            console.error('[Prospect] DOR error:', e);
            return { available: false };
        }
    }

    /** Discovery mode: return multiple Places candidates (Phase 1) */
    async function _searchPlacesDiscover(businessName, city, state) {
        try {
            const res = await fetch(`/api/prospect-lookup?type=places&discover=true&name=${encodeURIComponent(businessName)}&city=${encodeURIComponent(city || '')}&state=${state}`);
            return await res.json();
        } catch (e) {
            console.error('[Prospect] Places discover error:', e);
            return { available: false };
        }
    }

    // ── AI Analysis ─────────────────────────────────────────────

    async function _runAIAnalysis() {
        const aiEl = document.getElementById('aiAnalysisContent');
        if (!aiEl || !currentData) return;

        // Rotating status messages
        const statusMsgs = [
            'Searching the web for business intel...',
            'Analyzing public records and filings...',
            'Evaluating risk factors and compliance...',
            'Building coverage recommendations...',
            'Researching competitors and market position...',
            'Compiling underwriting intelligence report...',
            'Cross-referencing data sources...',
            'Finalizing risk assessment...',
        ];

        aiEl.innerHTML = `
            <div style="text-align: center; padding: 32px;">
                <div class="ai-pulse" style="font-size: 36px; margin-bottom: 12px;">\uD83E\uDDE0</div>
                <div style="font-weight: 600; margin-bottom: 4px;">Researching Business...</div>
                <div id="aiStatusMsg" style="font-size: 13px; color: var(--text-secondary); transition: opacity 0.3s ease;">${statusMsgs[0]}</div>
            </div>`;

        // Rotate status messages every 3.5s
        let msgIdx = 0;
        const statusEl = () => document.getElementById('aiStatusMsg');
        const statusInterval = setInterval(() => {
            msgIdx = (msgIdx + 1) % statusMsgs.length;
            const el = statusEl();
            if (!el) { clearInterval(statusInterval); return; }
            el.style.opacity = '0';
            setTimeout(() => {
                if (statusEl()) { el.textContent = statusMsgs[msgIdx]; el.style.opacity = '1'; }
            }, 300);
        }, 3500);

        // Show the section
        const aiSection = document.getElementById('aiAnalysisSection');
        if (aiSection) aiSection.style.display = 'block';

        try {
            const fetchFn = (typeof Auth !== 'undefined' && Auth.apiFetch) ? Auth.apiFetch.bind(Auth) : fetch;
            const res = await fetchFn('/api/prospect-lookup?type=ai-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    businessName: currentData.displayName || currentData.businessName,
                    state: currentData.state,
                    city: currentData.city,
                    li: currentData.li,
                    sos: currentData.sos,
                    osha: currentData.osha,
                    sam: currentData.sam,
                    places: currentData.places,
                    aiSettings: window.AIProvider?.getSettings()
                })
            });

            const data = await res.json();

            if (!data.success || !data.analysis) {
                clearInterval(statusInterval);
                aiEl.innerHTML = `
                    <div style="padding: 16px; background: rgba(255,149,0,0.06); border-left: 4px solid #FF9500; border-radius: 4px;">
                        <p style="margin: 0; color: var(--text-secondary);">\u26A0\uFE0F Analysis unavailable: ${_esc(data.error || 'Sign in to enable analysis')}</p>
                    </div>`;
                return;
            }

            clearInterval(statusInterval);
            aiAnalysis = data.analysis;
            _renderAIAnalysis(data.analysis, data.groundedSearch);

        } catch (error) {
            clearInterval(statusInterval);
            console.error('[Prospect] AI analysis error:', error);
            aiEl.innerHTML = `
                <div style="padding: 16px; background: rgba(255,149,0,0.06); border-left: 4px solid #FF9500; border-radius: 4px;">
                    <p style="margin: 0; color: var(--text-secondary);">\u26A0\uFE0F Analysis unavailable \u2014 check your connection and try again</p>
                </div>`;
        }
    }

    function _renderAIAnalysis(a, grounded) {
        const el = document.getElementById('aiAnalysisContent');
        if (!el) return;

        const sub = document.getElementById('aiAnalysisSub');
        if (sub) sub.textContent = 'Risk intelligence with web research';

        function _formatAIText(text) {
            if (!text) return '';
            const lines = text.split(/(?:\n|(?<=\.)\s+(?=\d+\.|[-•]\s|[A-Z]))/g).map(l => l.trim()).filter(Boolean);
            if (lines.length > 1) {
                return '<ul style="margin:0;padding-left:20px;">' +
                    lines.map(l => '<li style="margin-bottom:6px;line-height:1.6;">' + _esc(l.replace(/^[-•\d]+[.)]\s*/, '')) + '</li>').join('') +
                    '</ul>';
            }
            return '<p style="margin:0;line-height:1.7;">' + _esc(text) + '</p>';
        }

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

        // Count items for group badges
        const riskItems = [a.riskAssessment, a.redFlags, a.recommendedCoverages].filter(Boolean).length;
        const bizItems = [a.businessProfile, a.businessHistory, a.keyPersonnel, a.serviceArea, a.buildingInfo, (a.website || a.socialMedia) ? 'x' : ''].filter(Boolean).length;
        const stratItems = [a.underwritingNotes, a.competitiveIntel].filter(Boolean).length;

        const onlineBlock = (a.website || a.socialMedia) ? `
            <div class="ai-content-block" style="padding:16px;border-radius:12px;background:rgba(88,86,214,0.03);border:1px solid rgba(88,86,214,0.08);">
                <h4><span style="font-size:18px;">\uD83C\uDF10</span> Online Presence</h4>
                ${a.website ? '<p style="margin:0 0 8px 0;line-height:1.7;"><strong>Website:</strong> <a href="' + _esc(a.website.startsWith('http') ? a.website : 'https://' + a.website) + '" target="_blank" rel="noopener" style="color:var(--apple-blue);text-decoration:none;">' + _esc(a.website) + ' \u2197</a></p>' : ''}
                ${a.socialMedia ? _formatAIText(a.socialMedia) : ''}
            </div>` : '';

        el.innerHTML = `
            ${_block('\uD83D\uDCCB', 'Executive Summary', a.executiveSummary, { bg: 'rgba(0,122,255,0.04)', border: 'rgba(0,122,255,0.12)', titleColor: 'var(--apple-blue)' })}

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

            ${riskItems ? `
            <details class="ai-group" open>
                <summary>\uD83D\uDEE1\uFE0F Risk & Coverage <span class="group-count">${riskItems}</span></summary>
                <div class="ai-group-body">
                    ${_block(_riskIcon(a.riskAssessment), 'Risk Assessment', a.riskAssessment)}
                    ${_block('\uD83D\uDEA9', 'Red Flags & Concerns', a.redFlags, { bg: 'rgba(255,59,48,0.04)', border: 'rgba(255,59,48,0.12)', titleColor: 'var(--danger)' })}
                    ${_block('\uD83D\uDEE1\uFE0F', 'Recommended Coverages', a.recommendedCoverages, { bg: 'rgba(52,199,89,0.04)', border: 'rgba(52,199,89,0.12)', titleColor: 'var(--success)' })}
                </div>
            </details>` : ''}

            ${bizItems ? `
            <details class="ai-group">
                <summary>\uD83C\uDFE2 Business Intelligence <span class="group-count">${bizItems}</span></summary>
                <div class="ai-group-body">
                    ${_block('\uD83C\uDFE2', 'Business Profile', a.businessProfile)}
                    ${a.businessHistory ? _block('\uD83D\uDCDC', 'Business History', a.businessHistory) : ''}
                    ${a.keyPersonnel ? _block('\uD83D\uDC65', 'Key Personnel', a.keyPersonnel) : ''}
                    ${a.serviceArea ? _block('\uD83D\uDDFA\uFE0F', 'Service Area & Territory', a.serviceArea) : ''}
                    ${a.buildingInfo ? _block('\uD83C\uDFD7\uFE0F', 'Building & Premises', a.buildingInfo) : ''}
                    ${onlineBlock}
                </div>
            </details>` : ''}

            ${stratItems ? `
            <details class="ai-group">
                <summary>\uD83D\uDCA1 Strategy & Notes <span class="group-count">${stratItems}</span></summary>
                <div class="ai-group-body">
                    ${_block('\uD83D\uDCDD', 'Underwriting Notes', a.underwritingNotes)}
                    ${_block('\uD83D\uDCA1', 'Competitive Intel & Strategy', a.competitiveIntel, { bg: 'rgba(88,86,214,0.04)', border: 'rgba(88,86,214,0.12)', titleColor: '#5856D6' })}
                </div>
            </details>` : ''}

            <div style="text-align:right;font-size:11px;color:var(--text-secondary);opacity:0.6;margin-top:8px;">
                ${grounded ? 'Grounded with web search \u00B7 ' : ''}${new Date().toLocaleTimeString()}
            </div>
        `;
    }

    // ── Results Display ─────────────────────────────────────────

    function _displayResults() {
        const data = currentData;
        if (!data) return;

        // Restore cards that were hidden during the selection phase
        for (const id of ['riskScoreCard', 'sourceRecordsCard', 'investigationLinksCard', 'exportActionsCard']) {
            const card = document.getElementById(id);
            if (card) card.style.display = '';
        }

        const liOk = data.li && data.li.available !== false && !data.li.error;
        const sosOk = data.sos && data.sos.available !== false && !data.sos.error;
        const oshaOk = data.osha && data.osha.available !== false && !data.osha.error;
        const samOk = data.sam && data.sam.available && data.sam.entities?.length > 0;
        const placesOk = data.places && data.places.available && data.places.profile;

        // Source status badges
        const sources = [
            { name: 'L&I', ok: liOk },
            { name: 'SOS', ok: sosOk },
            { name: 'OSHA', ok: oshaOk },
            { name: 'SAM.gov', ok: samOk },
            { name: 'Google', ok: placesOk }
        ];
        const okCount = sources.filter(s => s.ok).length;

        // ── Business Overview (consolidated from all sources) ──
        const p = placesOk ? data.places.profile : null;
        const c = data.li?.contractor || {};
        const e = data.sos?.entity || {};
        const phone = p?.phone || c.phone || '';
        const website = p?.website || '';
        // Prefer L&I / SOS addresses (state-specific databases) over Google Places
        const liAddress = c.address ? [c.address.street, c.address.city, c.address.state, c.address.zip].filter(Boolean).join(', ') : '';
        const sosAddress = e.principalOffice ? [e.principalOffice.street, e.principalOffice.city, e.principalOffice.state, e.principalOffice.zip].filter(Boolean).join(', ') : '';
        const address = liAddress || sosAddress || p?.address || '';

        _setHtml('businessSummary', `
            <div style="margin-bottom: 12px;">
                <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">${_esc(data.displayName || data.businessName)}</div>
                ${address ? `<div style="color: var(--text-secondary); font-size: 13px; margin-bottom: 6px;">\uD83D\uDCCD ${_esc(address)}</div>` : `<div style="color: var(--text-secondary); font-size: 13px; margin-bottom: 6px;">\uD83D\uDCCD ${_esc(data.city ? data.city + ', ' : '')}${_esc(data.state)}</div>`}
                <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px;">
                    ${phone ? `<a href="tel:${_esc(phone)}" style="color:var(--apple-blue);text-decoration:none;">\uD83D\uDCDE ${_esc(phone)}</a>` : ''}
                    ${website ? `<a href="${_esc(website)}" target="_blank" rel="noopener" style="color:var(--apple-blue);text-decoration:none;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;">\uD83C\uDF10 ${_esc(website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : ''}
                    ${data.ubi ? `<span style="color:var(--text-secondary);">UBI: ${_esc(data.ubi)}</span>` : ''}
                </div>
            </div>
            ${p?.rating ? `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-input);border-radius:10px;margin-bottom:12px;">
                <div style="font-size:24px;font-weight:700;color:#FBBC04;">${p.rating}</div>
                <div>
                    <div style="font-size:14px;color:#FBBC04;">${'\u2605'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))}</div>
                    <div style="font-size:12px;color:var(--text-secondary);">${(p.totalReviews || 0).toLocaleString()} Google reviews</div>
                </div>
                ${p.googleMapsUrl ? `<a href="${_esc(p.googleMapsUrl)}" target="_blank" rel="noopener" style="margin-left:auto;font-size:12px;color:var(--apple-blue);text-decoration:none;">View on Maps \u2197</a>` : ''}
            </div>` : ''}
            <div id="prospectSourceBadges" style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${_renderSourceBadges()}
            </div>
        `);

        // ── Source Record Status Pills ──
        _setStatusPill('liStatusPill', liOk && c.status ? c.status : 'Not found',
            liOk && c.status?.toLowerCase().includes('active') ? 'green' : (!liOk ? 'gray' : 'red'));

        _setStatusPill('sosStatusPill',
            sosOk && e.status ? (e.dataSource ? '\u2139\uFE0F ' : '') + (e.entityType ? e.entityType + ' \u00B7 ' : '') + e.status : (data.sos?.deepLinked ? 'Manual lookup \u2197' : data.sos?.manualSearch ? 'Manual search' : 'Not found'),
            sosOk && e.status?.toLowerCase().includes('active') ? (e.partialData ? 'blue' : 'green') : (data.sos?.deepLinked ? 'orange' : data.sos?.manualSearch ? 'orange' : (!sosOk ? 'gray' : 'red')));

        _setStatusPill('oshaStatusPill',
            oshaOk && data.osha.inspections?.length > 0 ? data.osha.inspections.length + ' inspection' + (data.osha.inspections.length > 1 ? 's' : '') : '\u2713 No violations',
            oshaOk && data.osha.inspections?.length > 0 ? 'red' : 'green');

        // Google accordion
        const googleSection = document.getElementById('googleProfileSection');
        if (placesOk && googleSection) {
            googleSection.style.display = '';
            _setStatusPill('googleStatusPill',
                (p?.rating ? p.rating + '\u2605 \u00B7 ' : '') + (p?.totalReviews || 0) + ' reviews', 'gold');
            const placesEl = document.getElementById('googleProfileInfo');
            if (placesEl) placesEl.innerHTML = ProspectFormatters.formatPlacesData(data.places);
        } else if (googleSection) {
            googleSection.style.display = 'none';
        }

        // SAM.gov accordion
        const samSection = document.getElementById('samGovSection');
        const samEl = document.getElementById('samGovInfo');
        if (samOk && samSection) {
            samSection.style.display = '';
            _setStatusPill('samStatusPill', 'Registered', 'purple');
            if (samEl) samEl.innerHTML = ProspectFormatters.formatSAMData(data.sam);
        } else if (data.sam?.note && samSection) {
            samSection.style.display = '';
            _setStatusPill('samStatusPill', 'Info available', 'blue');
            if (samEl) samEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">\u2139\uFE0F ' + _esc(data.sam.note) + '</p>';
        } else if (samSection) {
            samSection.style.display = 'none';
        }

        // ── Populate source record bodies ──
        if (liOk && data.li.contractor) {
            _setHtml('liContractorInfo', ProspectFormatters.formatLIData(data.li));
        } else {
            _setHtml('liContractorInfo', ProspectFormatters.formatSourceError(data.li, data.state, 'contractor'));
        }

        if (sosOk && data.sos.entity) {
            _setHtml('sosBusinessInfo', ProspectFormatters.formatSOSData(data.sos));
        } else {
            _setHtml('sosBusinessInfo', ProspectFormatters.formatSOSError(data));
        }

        if (oshaOk && data.osha.inspections?.length > 0) {
            _setHtml('oshaViolations', ProspectFormatters.formatOSHAData(data.osha));
        } else if (!oshaOk) {
            _setHtml('oshaViolations', ProspectFormatters.formatSourceError(data.osha, data.state, 'osha'));
        } else {
            _setHtml('oshaViolations', '<p style="color: var(--success);">\u2713 No OSHA violations found in public records</p>');
        }

        // Risk Classification (algorithmic)
        _setHtml('riskClassification', ProspectFormatters.formatRiskClassification(data));

        // Investigation Links
        _setHtml('investigationLinks', ProspectFormatters.formatInvestigationLinks(data));

        // Show results
        const resultsEl = document.getElementById('prospectResults');
        if (resultsEl) resultsEl.style.display = 'block';
    }

    /** Render source status badges — extracted so it can be refreshed after SOS paste */
    function _renderSourceBadges() {
        const data = currentData;
        if (!data) return '';
        const liOk = data.li && data.li.available !== false && !data.li.error;
        const sosOk = data.sos && data.sos.available !== false && !data.sos.error && data.sos.entity;
        const oshaOk = data.osha && data.osha.available !== false && !data.osha.error;
        const samOk = data.sam && data.sam.available && data.sam.entities?.length > 0;
        const placesOk = data.places && data.places.available && data.places.profile;
        const sources = [
            { name: 'L&I', ok: liOk }, { name: 'SOS', ok: sosOk },
            { name: 'OSHA', ok: oshaOk }, { name: 'SAM.gov', ok: samOk },
            { name: 'Google', ok: placesOk }
        ];
        const okCount = sources.filter(s => s.ok).length;
        return sources.map(s =>
            '<span style="font-size:11px;padding:3px 10px;border-radius:12px;background:' +
            (s.ok ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)') + ';color:' +
            (s.ok ? '#34C759' : '#FF3B30') + ';font-weight:600;">' +
            (s.ok ? '\u2713' : '\u2717') + ' ' + s.name + '</span>'
        ).join('') +
        '<span style="font-size:11px;padding:3px 10px;border-radius:12px;background:rgba(0,122,255,0.08);color:var(--apple-blue);font-weight:600;">' +
            okCount + '/' + sources.length + ' sources</span>' +
        '<span style="font-size:11px;padding:3px 10px;border-radius:12px;background:rgba(168,85,247,0.1);color:#A855F7;font-weight:600;">' +
            '\uD83D\uDCCA Analysis</span>';
    }

    // ── Format Helpers live in prospect-formatters.js (window.ProspectFormatters) ──

    // ── Multi-result Selection ──────────────────────────────────

    // Candidate collection + dedupe + source-gap notes now live in
    // js/prospect-formatters.js (window.ProspectFormatters) — pure, size-
    // ceilinged out of this file. Use ProspectFormatters.collectCandidates({
    // li, sos, places, dor }, name, state, city) / .sourceGapNotes(...).

    function _showBusinessSelection(candidates, businessName, city, state) {
        _hideLoading();
        const resultsEl = document.getElementById('prospectResults');
        if (resultsEl) resultsEl.style.display = 'block';

        // Hide all deep-investigation cards — only show Business Overview with selection UI
        _setHtml('liContractorInfo', '');
        _setHtml('oshaViolations', '');
        _setHtml('riskClassification', '');
        _setHtml('sosBusinessInfo', '');
        const aiSection = document.getElementById('aiAnalysisSection');
        if (aiSection) aiSection.style.display = 'none';
        // Hide lower cards during selection
        for (const id of ['riskScoreCard', 'sourceRecordsCard', 'investigationLinksCard', 'exportActionsCard']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }

        const stateNames = { WA: 'Washington', OR: 'Oregon', AZ: 'Arizona', CA: 'California', ID: 'Idaho', NV: 'Nevada' };
        const matchCount = candidates.filter(c => c.stateMatch).length;
        const mismatchCount = candidates.length - matchCount;

        // Render selection UI directly in businessSummary (first visible card)
        _setHtml('businessSummary', `
            <div style="background: rgba(0,122,255,0.05); border-left: 4px solid var(--apple-blue); padding: 16px; border-radius: 4px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 8px 0;">\uD83D\uDD0E Select the right business to investigate</h3>
                <p style="margin: 0; color: var(--text-secondary); font-size: 13px;">
                    Found ${candidates.length} result${candidates.length !== 1 ? 's' : ''} for "${_esc(businessName)}"
                    ${mismatchCount > 0 ? ` \u2014 <span style="color: var(--danger);">${mismatchCount} outside ${_esc(stateNames[state] || state)}</span>` : ''}
                </p>
            </div>
            ${ProspectFormatters.gapNoteBanner(_lastGapNotes)}
            <div style="display: grid; gap: 12px;">
                ${candidates.map((b, i) => {
                    const isWrongState = !b.stateMatch;
                    const borderColor = isWrongState ? 'rgba(255,149,0,0.4)' : 'var(--border)';
                    const bgExtra = isWrongState ? 'background: rgba(255,149,0,0.03);' : '';
                    const sourceBadges = (b.sources || [b.source]).map(s => {
                        const colors = { 'L&I': { bg: 'rgba(52,199,89,0.15)', fg: 'var(--success)' },
                                          'SOS': { bg: 'rgba(0,122,255,0.1)', fg: 'var(--apple-blue)' },
                                          'DOR': { bg: 'rgba(88,86,214,0.14)', fg: '#5856D6' },
                                          'Google': { bg: 'rgba(251,188,4,0.15)', fg: '#B8860B' } };
                        const c = colors[s] || { bg: 'rgba(0,0,0,0.05)', fg: 'var(--text-secondary)' };
                        return `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${c.bg};color:${c.fg};font-weight:600;">${_esc(s)}</span>`;
                    }).join(' ');

                    const location = b.address || (b.city ? `${b.city}, ${b.state || state}` : (b.state || state));

                    return `
                    <div onclick="ProspectInvestigator.selectBusiness(${i});"
                         style="padding: 16px; border: 2px solid ${borderColor}; border-radius: 8px; cursor: pointer; transition: all 0.2s; ${bgExtra}"
                         onmouseover="this.style.borderColor='var(--apple-blue)'" onmouseout="this.style.borderColor='${borderColor}'">
                        ${isWrongState ? '<div style="font-size:11px;color:#FF9500;font-weight:600;margin-bottom:8px;">\u26A0\uFE0F Different state than search</div>' : ''}
                        <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
                                    <h4 style="margin: 0; color: var(--apple-blue); font-size: 16px;">${_esc(b.businessName)}</h4>
                                    ${sourceBadges}
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;">
                                    \uD83D\uDCCD ${_esc(location)}
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--text-secondary);">
                                    ${b.ubi ? '<span><strong>UBI:</strong> ' + _esc(b.ubi) + '</span>' : ''}
                                    ${b.licenseNumber ? '<span><strong>License:</strong> ' + _esc(b.licenseNumber) + '</span>' : ''}
                                    ${b.entityType ? '<span><strong>Type:</strong> ' + _esc(b.entityType) + '</span>' : ''}
                                    ${b.status ? '<span><strong>Status:</strong> <span style="color:' + _statusColor(b.status) + ';">' + _esc(b.status) + '</span></span>' : ''}
                                    ${b.rating ? '<span>\u2B50 ' + b.rating + (b.totalReviews ? ' (' + b.totalReviews + ')' : '') + '</span>' : ''}
                                </div>
                            </div>
                            <div style="padding: 8px 16px; background: var(--apple-blue); color: white; border-radius: 6px; font-size: 13px; font-weight: 600; white-space: nowrap;">Investigate \u2192</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div style="margin-top: 16px; text-align: center;">
                <button onclick="ProspectInvestigator.investigateManual();"
                    style="background: none; border: 1px solid var(--border); color: var(--text-secondary); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">
                    None of these \u2014 search with original name anyway
                </button>
            </div>`);
    }

    // ── Utilities ────────────────────────────────────────────────

    function _setStatusPill(id, text, color) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        const colors = {
            green: { bg: 'rgba(52,199,89,0.1)', fg: '#34C759' },
            red: { bg: 'rgba(255,59,48,0.1)', fg: '#FF3B30' },
            orange: { bg: 'rgba(255,149,0,0.1)', fg: '#FF9500' },
            gray: { bg: 'rgba(0,0,0,0.05)', fg: 'var(--text-secondary)' },
            gold: { bg: 'rgba(251,188,4,0.12)', fg: '#B8860B' },
            purple: { bg: 'rgba(88,86,214,0.1)', fg: '#5856D6' },
            blue: { bg: 'rgba(0,122,255,0.08)', fg: 'var(--apple-blue)' }
        };
        const c = colors[color] || colors.gray;
        el.style.cssText = `font-size:11px;padding:2px 10px;border-radius:10px;font-weight:500;white-space:nowrap;background:${c.bg};color:${c.fg};`;
    }

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
        // Restore any cards hidden during selection phase
        for (const id of ['riskScoreCard', 'sourceRecordsCard', 'investigationLinksCard', 'exportActionsCard']) {
            const card = document.getElementById(id);
            if (card) card.style.display = '';
        }
    }

    function _setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    /** Pick the best display name: Google Places > SOS > L&I > user input.
     *  Government DBs often return ALL CAPS — smart-case those. */
    function _resolveDisplayName(data) {
        const placesName = data.places?.profile?.name;
        const sosName = data.sos?.entity?.businessName;
        const liName = data.li?.contractor?.businessName;
        const userInput = data.businessName;
        // Prefer sources in order: Google (publicly-facing), user input, SOS, L&I
        // Google Places almost always has the correct public casing
        if (placesName) return placesName;
        // Government records are often ALL CAPS — detect and title-case
        if (sosName && sosName !== sosName.toUpperCase()) return sosName;
        if (liName && liName !== liName.toUpperCase()) return liName;
        // If user typed something with mixed case, trust it
        if (userInput && userInput !== userInput.toLowerCase()) return userInput;
        // Government ALL-CAPS → smart title case
        const capsName = sosName || liName;
        if (capsName) return _smartTitleCase(capsName);
        // Last resort: title-case the user input
        return userInput ? _smartTitleCase(userInput) : 'Unknown Business';
    }

    /** Title-case with awareness of common business suffixes */
    function _smartTitleCase(str) {
        if (!str) return '';
        const lowercase = new Set(['of', 'the', 'and', 'in', 'at', 'for', 'to', 'a', 'an', 'on', 'by', 'or']);
        const uppercase = new Set(['LLC', 'INC', 'DBA', 'LLP', 'PLLC', 'PC', 'PA', 'LP', 'NW', 'NE', 'SW', 'SE', 'II', 'III', 'IV']);
        return str.split(/\s+/).map((word, i) => {
            const upper = word.toUpperCase();
            if (uppercase.has(upper)) return upper;
            if (i > 0 && lowercase.has(word.toLowerCase())) return word.toLowerCase();
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    }

    function _esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    /** Extract 2-letter state code from a formatted address string */
    function _extractStateFromAddress(address) {
        if (!address) return '';
        const m = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
        if (m) return m[1];
        const parts = address.split(',').map(s => s.trim());
        for (const p of parts) {
            const sm = p.match(/^([A-Z]{2})\s+\d{5}/);
            if (sm) return sm[1];
        }
        return '';
    }

    /** If Places returned an address in a different state, discard it */
    function _validatePlacesState(placesData, expectedState) {
        if (!placesData?.available || !placesData?.profile?.address || !expectedState) return;
        const placesState = _extractStateFromAddress(placesData.profile.address);
        if (placesState && placesState !== expectedState) {
            console.warn(`[Prospect] Places returned ${placesState} but expected ${expectedState} — discarding Google Places data`);
            placesData.available = false;
            placesData._stateMismatch = true;
        }
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

    // ── Save / Load / Delete Prospects ──────────────────────────

    function _getSavedProspects() {
        return Utils.tryParseLS(STORAGE_KEY, []);
    }

    function _setSavedProspects(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) CloudSync.schedulePush();
    }

    function saveProspect() {
        if (!currentData) { _toast('Run a search first'); return; }
        const saved = _getSavedProspects();
        const id = currentData.timestamp || new Date().toISOString();
        // Check for duplicate by timestamp
        const existingIdx = saved.findIndex(s => s.id === id);
        const entry = {
            id,
            displayName: currentData.displayName || currentData.businessName,
            businessName: currentData.businessName,
            state: currentData.state,
            city: currentData.city || '',
            ubi: currentData.ubi || '',
            savedAt: new Date().toISOString(),
            data: currentData,
            aiAnalysis: aiAnalysis || null
        };
        if (existingIdx >= 0) {
            saved[existingIdx] = entry;
        } else {
            saved.unshift(entry);
        }
        _setSavedProspects(saved);
        _renderSavedList();
        _toast(`${entry.displayName} saved`);
    }

    function loadProspect(id) {
        const saved = _getSavedProspects();
        const entry = saved.find(s => s.id === id);
        if (!entry) { _toast('Saved prospect not found'); return; }
        currentData = entry.data;
        aiAnalysis = entry.aiAnalysis || null;
        _displayResults();
        if (aiAnalysis) {
            _renderAIAnalysis(aiAnalysis);
            const aiSection = document.getElementById('aiAnalysisSection');
            if (aiSection) aiSection.style.display = 'block';
        } else {
            // Run fresh AI analysis if none was saved
            _runAIAnalysis();
        }
        // Scroll to results
        const resultsEl = document.getElementById('prospectResults');
        if (resultsEl) resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        _toast(`Loaded ${entry.displayName}`);
    }

    function deleteProspect(id) {
        const saved = _getSavedProspects();
        const entry = saved.find(s => s.id === id);
        const name = entry?.displayName || 'Prospect';
        const updated = saved.filter(s => s.id !== id);
        _setSavedProspects(updated);
        _renderSavedList();
        _toast(`${name} deleted`);
    }

    function _renderSavedList() {
        const container = document.getElementById('savedProspectsList');
        if (!container) return;

        const saved = _getSavedProspects();
        if (!saved.length) {
            container.innerHTML = `
                <p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 16px 0;">
                    No saved prospects yet. Run an investigation and click Save.
                </p>`;
            return;
        }

        container.innerHTML = saved.map(s => {
            const date = new Date(s.savedAt).toLocaleDateString();
            const hasAI = s.aiAnalysis ? '<span style="font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(168,85,247,0.1);color:#A855F7;font-weight:600;margin-left:6px;">AI</span>' : '';
            return `
                <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer;"
                     onclick="ProspectInvestigator.loadProspect('${_esc(s.id)}')">
                    <div style="font-size:22px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:rgba(0,122,255,0.08);border-radius:10px;flex-shrink:0;">🏢</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(s.displayName)}${hasAI}</div>
                        <div style="font-size:12px;color:var(--text-secondary);">${_esc(s.state)}${s.city ? ' \u00B7 ' + _esc(s.city) : ''} \u00B7 ${date}</div>
                    </div>
                    <button onclick="event.stopPropagation(); ProspectInvestigator.deleteProspect('${_esc(s.id)}');"
                            style="background:none;border:none;color:var(--danger);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:8px;"
                            title="Delete saved prospect">&times;</button>
                </div>`;
        }).join('');
    }

    // ── Quoter Bridge ─────────────────────────────────────────────

    /** Return structured data ready for CommercialQuoter consumption */
    function getQuoterData() {
        if (!currentData) return null;
        const d = currentData;
        const c = d.li?.contractor || {};
        const e = d.sos?.entity || {};
        const gp = d.places?.profile;
        const ai = aiAnalysis;

        // Best address: prefer Google Places (formatted), then L&I, then SOS
        let addr = null;
        if (gp?.address) {
            addr = _parseAddress(gp.address);
        } else if (c.address) {
            addr = { street: c.address.street || '', city: c.address.city || '', state: c.address.state || d.state || '', zip: c.address.zip || '' };
        } else if (e.principalOffice) {
            const po = e.principalOffice;
            addr = { street: po.street || '', city: po.city || '', state: po.state || d.state || '', zip: po.zip || '' };
        }

        return {
            bizName: d.displayName || d.businessName || '',
            bizPhone: gp?.phone || c.phone || '',
            bizStreet: addr?.street || '',
            bizCity: addr?.city || d.city || '',
            bizState: addr?.state || d.state || '',
            bizZip: addr?.zip || '',
            bizWebsite: gp?.website || ai?.website || '',
            dateStarted: e.formationDate || '',
            ownerNames: _formatOwners(c.owners),
            // AI-derived fields (prefixed with _ to distinguish)
            _aiGLClass: ai?.glClassification || '',
            _aiRecommendedCovs: ai?.recommendedCoverages || '',
            _aiNAICS: ai?.naicsAnalysis || '',
            _aiRiskNote: ai?.riskAssessment || '',
            _aiRedFlags: ai?.redFlags || '',
            _aiExecutiveSummary: ai?.executiveSummary || '',
            // Source metadata for intel sidebar
            _sourceData: {
                li: d.li,
                sos: d.sos,
                osha: d.osha,
                sam: d.sam,
                places: d.places,
            },
            _timestamp: d.timestamp,
        };
    }

    /** Parse a formatted address string like "123 Main St, Portland, OR 97201" */
    function _parseAddress(addr) {
        if (!addr) return null;
        const parts = addr.split(',').map(s => s.trim());
        if (parts.length < 2) return { street: addr, city: '', state: '', zip: '' };
        const street = parts[0];
        const city = parts.length >= 3 ? parts[1] : '';
        // Last part usually "OR 97201" or "OR 97201, USA"
        const lastPart = parts.length >= 3 ? parts[2] : parts[1];
        const stateZip = lastPart.replace(/,?\s*USA?\s*$/i, '').trim();
        const m = stateZip.match(/^([A-Z]{2})\s+(\d{5}(-\d{4})?)$/);
        return {
            street,
            city,
            state: m ? m[1] : (stateZip.length === 2 ? stateZip : ''),
            zip: m ? m[2] : '',
        };
    }

    /** Save data to transfer key and navigate to commercial quoter */
    function sendToQuoter() {
        const data = getQuoterData();
        if (!data) { _toast('Run a search first'); return; }
        localStorage.setItem(STORAGE_KEYS.PROSPECT_TO_QUOTER, JSON.stringify(data));
        if (typeof App !== 'undefined' && App.navigateTo) {
            App.navigateTo('commercial');
        }
        _toast('Sending to Commercial Quoter...');
    }

    // ── SOS Paste Integration ────────────────────────────────────

    /** Parse WA CCFS / OR SOS pasted text into structured entity data */
    function _parseSOSPaste(text) {
        if (!text || text.length < 30) return null;

        // CCFS select-all copies as "Label:ValueLabel:Value" on same line
        // or "Label:\nVALUE" across lines. Handle both formats.

        // Known CCFS field labels (ordered by specificity to avoid partial matches)
        const LABELS = [
            'Principal Office Street Address', 'Principal Office Mailing Address',
            'Formation/ Registration Date', 'Formation/Registration Date',
            'Registered Agent Name', 'Nature of Business', 'Period of Duration',
            'Business Status', 'Business Name', 'Business Type',
            'Expiration Date', 'Inactive Date', 'UBI Number',
            'Street Address', 'Mailing Address', 'Jurisdiction',
        ];

        // Build regex that splits on any known label followed by colon
        // This handles "Business Name:NW ENDEAVORSBusiness Type:WA PROFIT CORP"
        const fields = {};
        const labelPattern = LABELS.map(l => l.replace(/[/]/g, '\\/')).join('|');
        const splitter = new RegExp('(' + labelPattern + ')\\s*:', 'gi');

        // Find all label positions
        const matches = [];
        let m;
        while ((m = splitter.exec(text)) !== null) {
            matches.push({ label: m[1].toLowerCase().trim(), idx: m.index, end: m.index + m[0].length });
        }

        // Also find section headers to use as stop boundaries
        const sectionHeaders = /\n\s*(Registered Agent Information|Governors|Business Information|Filing History|Name History)\s*\n/gi;
        const stopPositions = [];
        let sh;
        while ((sh = sectionHeaders.exec(text)) !== null) stopPositions.push(sh.index);

        // Extract value between each label and the next label or section header
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].end;
            let end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
            // Also stop at section headers that fall between this label and the next
            for (const sp of stopPositions) {
                if (sp > start && sp < end) { end = sp; break; }
            }
            const val = text.substring(start, end).replace(/\n/g, ' ').trim();
            if (val && !fields[matches[i].label]) {
                fields[matches[i].label] = val;
            }
        }

        const businessName = fields['business name'] || '';
        const ubi = (fields['ubi number'] || '').replace(/\s+/g, '');
        const entityType = fields['business type'] || '';
        const status = fields['business status'] || '';
        const formationDate = fields['formation/ registration date'] || fields['formation/registration date'] || '';
        const expiration = fields['expiration date'] || '';
        const jurisdiction = fields['jurisdiction'] || '';
        const natureOfBusiness = fields['nature of business'] || '';
        const duration = fields['period of duration'] || '';

        // Principal Office address
        const principalAddr = fields['principal office street address'] || '';
        const parsedAddr = _parseAddress(principalAddr.replace(/,?\s*UNITED STATES\s*$/i, ''));

        // Registered Agent
        const agentName = fields['registered agent name'] || '';
        const agentAddr = fields['street address'] || '';

        // Governors — parse tab-separated or multi-space table
        const governors = [];
        const govMatch = text.match(/Governors\s*\n?\s*Title[\t\s]+Governors\s*Type[\t\s]+Entity\s*Name[\t\s]+First\s*Name[\t\s]+Last\s*Name\s*\n([\s\S]*?)(?:\n\s*\n|$)/i);
        if (govMatch) {
            const govLines = govMatch[1].split('\n');
            for (const line of govLines) {
                const parts = line.trim().split(/\t+/);
                // Tab-separated: GOVERNOR\tINDIVIDUAL\t\tRANDALL\tENGLISH
                if (parts.length >= 4 && /^(GOVERNOR|OFFICER|DIRECTOR|PRESIDENT|SECRETARY|TREASURER|MEMBER|MANAGER)/i.test(parts[0])) {
                    const title = parts[0];
                    const firstName = parts[parts.length - 2] || '';
                    const lastName = parts[parts.length - 1] || '';
                    if (firstName && lastName) {
                        governors.push({ title, name: firstName + ' ' + lastName });
                    }
                } else {
                    // Multi-space separated fallback
                    const spaceParts = line.trim().split(/\s{2,}/);
                    if (spaceParts.length >= 3 && /^(GOVERNOR|OFFICER|DIRECTOR|PRESIDENT|SECRETARY|TREASURER|MEMBER|MANAGER)/i.test(spaceParts[0])) {
                        const title = spaceParts[0];
                        const firstName = spaceParts[spaceParts.length - 2] || '';
                        const lastName = spaceParts[spaceParts.length - 1] || '';
                        if (firstName && lastName) {
                            governors.push({ title, name: firstName + ' ' + lastName });
                        }
                    }
                }
            }
        }

        if (!businessName && !ubi && !entityType) return null;

        return {
            available: true,
            entity: {
                businessName,
                ubi,
                entityType,
                status,
                formationDate,
                expirationDate: expiration,
                jurisdiction,
                businessActivity: natureOfBusiness,
                duration,
                registeredAgent: agentName ? { name: agentName, address: agentAddr.replace(/,?\s*UNITED STATES\s*$/i, '') } : null,
                principalOffice: parsedAddr || null,
                governors,
                dataSource: 'Manual paste (SOS website)',
            }
        };
    }

    /** Show paste modal, parse SOS data, merge into currentData, re-render */
    /** @param {boolean} runAIAfter — if true, triggers AI analysis after successful paste */
    function pasteSOSData(runAIAfter) {
        if (!currentData) { _toast('Run a search first'); return; }

        // Create modal
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.innerHTML = `
            <div style="background:var(--bg-card);border-radius:16px;padding:24px;max-width:540px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 8px;font-size:18px;">Paste SOS Data</h3>
                <p style="margin:0 0 16px;font-size:13px;color:var(--text-secondary);">
                    Go to the SOS website, select all (Ctrl+A), copy (Ctrl+C), then paste below.${runAIAfter ? ' Analysis will run after applying.' : ''}
                </p>
                <textarea id="sosPasteInput" style="width:100%;height:200px;padding:12px;font-size:12px;font-family:monospace;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-input);color:var(--text);resize:vertical;" placeholder="Paste the full page text from the Secretary of State website here..."></textarea>
                <div style="display:flex;gap:10px;margin-top:16px;">
                    <button id="sosPasteApply" style="flex:1;padding:12px;background:var(--apple-blue);color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;">
                        Apply SOS Data${runAIAfter ? ' & Analyze' : ''}
                    </button>
                    <button onclick="this.closest('div[style*=fixed]').remove()${runAIAfter ? ';ProspectInvestigator._skipSOSAndRunAI()' : ''}" style="padding:12px 20px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:10px;font-weight:500;font-size:14px;cursor:pointer;">
                        ${runAIAfter ? 'Skip \u2014 Run AI Without SOS' : 'Cancel'}
                    </button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        // Focus the textarea
        setTimeout(() => document.getElementById('sosPasteInput')?.focus(), 100);

        // Apply button handler
        document.getElementById('sosPasteApply').onclick = () => {
            const text = document.getElementById('sosPasteInput')?.value || '';
            const parsed = _parseSOSPaste(text);
            if (!parsed || !parsed.entity) {
                _toast('Could not parse SOS data. Make sure you copied the full page.');
                return;
            }

            // Merge into currentData
            currentData.sos = parsed;
            // Update the SOS section display
            const sosEl = document.getElementById('sosBusinessInfo');
            if (sosEl) sosEl.innerHTML = ProspectFormatters.formatSOSData(parsed);
            // Update status pill
            _setStatusPill('sosStatusPill',
                (parsed.entity.entityType ? parsed.entity.entityType + ' \u00B7 ' : '') + (parsed.entity.status || 'Active'),
                parsed.entity.status?.toUpperCase() === 'ACTIVE' ? 'green' : 'orange');
            // Open the SOS accordion
            const sosSection = document.getElementById('sosSection');
            if (sosSection) sosSection.open = true;
            // Refresh source badges in Business Overview
            const badgesEl = document.getElementById('prospectSourceBadges');
            if (badgesEl) badgesEl.innerHTML = _renderSourceBadges();

            overlay.remove();
            _toast('\u2713 SOS data applied — ' + (parsed.entity.entityType || 'entity') + ' \u00B7 ' + (parsed.entity.status || ''));

            // Run AI analysis with the now-complete data
            if (runAIAfter) _runAIAnalysis();
        };
    }

    // ── Expose Public API ───────────────────────────────────────

    return {
        init,
        search,
        selectBusiness,
        investigateManual,
        copyToQuote,
        sendToQuoter,
        getQuoterData,
        exportReport,
        saveProspect,
        loadProspect,
        deleteProspect,
        pasteSOSData,
        _skipSOSAndRunAI,
        get currentData() { return currentData; },
        get aiAnalysis() { return aiAnalysis; }
    };
})();

window.ProspectInvestigator = ProspectInvestigator;
