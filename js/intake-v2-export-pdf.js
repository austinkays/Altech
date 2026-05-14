// intake-v2-export-pdf.js — Branded multi-product PDF builder for Intake v2.
//
// Replaces the plain text dump that used to live in intake-v2-export.js. This
// builder produces a polished "Personal Insurance Application Summary" with
// branded header, document reference, accent strips, sectioned card layout,
// per-asset cards (homes/autos/boats/RVs), and page footer.
//
// Design goals:
//   - Toner-friendly grayscale palette so the printed PDF is readable
//     without color cartridges. Accents are dark gray (#3C3C3C), not vibrant.
//   - Per-section headers with thin rule + small-caps label, matching v1's
//     layout language so producers don't have to context-switch.
//   - Card-based per-asset layout with vertical accent strip on the left.
//   - Feature-detected color/fill calls (setFillColor, rect, addImage) so
//     the JSDOM test mock (intake-v2.test.js:413-427) which only stubs the
//     text-emitting API doesn't choke on chrome calls.
//   - All four products covered: home, auto, boat, RV. Boat/RV layout
//     intentionally preserves the test sentinels: "Yamaha", "YAM12345678X",
//     "Jayco", "Class fifthWheel".

'use strict';

(function () {

    // ─── Feature detection ──────────────────────────────────────────────────
    // jsPDF in production has setFillColor/rect/setGState/getNumberOfPages/
    // setPage/addImage. The JSDOM test mock does not. Guard each chrome call
    // so the test gets a text-only PDF (still satisfies sentinel assertions)
    // while production gets the full branded look.
    function has(doc, method) {
        return doc && typeof doc[method] === 'function';
    }

    // Toner-friendly palette
    const PALETTE = {
        INK:    [30, 30, 30],
        MID:    [80, 80, 80],
        LIGHT:  [165, 165, 165],
        RULE:   [190, 190, 190],
        FILL:   [232, 232, 232],
        ACCENT: [60, 60, 60],
        WHITE:  [255, 255, 255],
        // Three named greys for the coverage ratio bar — distinct enough to
        // survive a B&W laser printer. Severity uses the same trio so the
        // visual language is consistent: dark = highest weight.
        GREY_DARK: [70, 70, 70],
        GREY_MID:  [130, 130, 130],
        GREY_LITE: [180, 180, 180],
        POSITIVE:  [90, 90, 90],
    };

    function fmtDate(val) {
        if (!val) return '';
        const s = String(val);
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
        const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdy) return `${mdy[1].padStart(2,'0')}/${mdy[2].padStart(2,'0')}/${mdy[3]}`;
        return s;
    }
    function fmtMoney(val) {
        if (val === null || val === undefined || val === '') return '';
        const s = String(val).trim();
        if (s.endsWith('%')) return s;
        const n = parseFloat(s.replace(/[$,\s]/g, ''));
        if (isNaN(n)) return s;
        return '$' + n.toLocaleString('en-US');
    }
    function fmtDateTime(d) {
        if (!(d instanceof Date)) d = new Date(d);
        if (isNaN(d)) return '';
        let h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, '0');
        const ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${fmtDate(d.toISOString().split('T')[0])} ${h}:${m} ${ap}`;
    }
    function docRef() {
        const now = new Date();
        const stamp = `${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
        const rand = String(Math.floor(Math.random()*9000) + 1000);
        return `IV2-${now.getFullYear()}-${stamp}-${rand}`;
    }

    async function fetchLogo() {
        if (window.App && typeof window.App.fetchImageDataUrl === 'function') {
            try { return await window.App.fetchImageDataUrl('Resources/altech-logo.png'); } catch (_) { return null; }
        }
        return null;
    }

    async function fetchMaps(address) {
        if (!address) return null;
        if (window.App && typeof window.App.getMapImages === 'function') {
            try { return await window.App.getMapImages(address); } catch (_) { return null; }
        }
        return null;
    }

    // ─── Compute phase: pure functions that derive the snapshot model ────────
    //
    // The snapshot page (page 1) reads from a single `model` object built up
    // front so every visual primitive can be allocated a deterministic height
    // budget. This keeps the snapshot guaranteed to fit on one letter page.

    // Severity weight used by the severity box for the density-bar count
    const SEVERITY_WEIGHT = { high: 4, med: 3, low: 2, pos: 1 };

    // Aggressive-dog breed list (best-effort — agent confirms during call)
    const AGG_DOGS = [
        'pitbull', 'pit bull', 'rottweiler', 'doberman', 'german shepherd',
        'akita', 'wolf hybrid', 'chow', 'mastiff', 'staffordshire',
    ];

    // Lightweight age helper (timezone-safe). Mirrors intake-v2-core's
    // `_ageFromDob` so the PDF still works if that helper isn't on window.
    function _ageFromDobLocal(dob) {
        if (window.IntakeV2 && typeof window.IntakeV2._ageFromDob === 'function') {
            return window.IntakeV2._ageFromDob(dob);
        }
        if (!dob || typeof dob !== 'string') return 0;
        const parts = dob.split('-');
        if (parts.length !== 3) return 0;
        const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
        if (!Number.isFinite(y)) return 0;
        const now = new Date();
        let age = now.getFullYear() - y;
        if ((now.getMonth() + 1) < m || ((now.getMonth() + 1) === m && now.getDate() < d)) age--;
        return age;
    }

    // Strip HTML for talk-track output. Talk-track HTML is already sanitized
    // by Utils.escapeHTML in the source, so a simple tag-strip + entity decode
    // is sufficient. We also take only the first sentence so a paragraph-style
    // rule doesn't blow out the checklist line height.
    function htmlToPlain(html) {
        if (!html) return '';
        const stripped = String(html)
            .replace(/<br\s*\/?>/gi, '. ')
            .replace(/<\/p>/gi, '. ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
        // First sentence (stop at first period, exclamation, question mark
        // followed by a space or end). Many talk-track entries are a single
        // short sentence already, so this is mostly a defensive cap.
        const m = stripped.match(/^[^.!?]+[.!?]?/);
        return (m ? m[0] : stripped).trim();
    }

    function computeRiskMarkers(v2) {
        const out = [];
        const operators = Array.isArray(v2.operators) ? v2.operators : [];
        const homes = Array.isArray(v2.homes) ? v2.homes : [];
        const autos = Array.isArray(v2.autos) ? v2.autos : [];
        const boats = Array.isArray(v2.boats) ? v2.boats : [];
        const rvs = Array.isArray(v2.rvs) ? v2.rvs : [];
        const pi = v2.priorInsurance || {};
        const hist = v2.history || {};
        const opName = op => [op.firstName, op.lastName].filter(Boolean).join(' ') || 'Operator';

        // ── High ──
        operators.forEach(op => {
            if (op.sr22Required)       out.push({ severity: 'high', text: `SR-22 / FR-44 required (${opName(op)})` });
            if (op.licenseSuspended5y) out.push({ severity: 'high', text: `License suspended in last 5 yrs (${opName(op)})` });
        });
        homes.forEach((h, i) => {
            const isVacant = (h.occupancyType || '').toLowerCase().includes('vacant');
            if (isVacant && h.hazards && h.hazards.businessOnPremises) {
                out.push({ severity: 'high', text: `Home #${i+1}: vacant + business activity` });
            } else if (isVacant) {
                out.push({ severity: 'high', text: `Home #${i+1}: vacant property` });
            }
        });
        if (pi.continuous === 'No' && (autos.length || homes.length)) {
            out.push({ severity: 'high', text: 'Lapsed prior coverage' });
        }

        // ── Med ──
        homes.forEach((h, i) => {
            const roofYr = parseInt(h.roof && h.roof.yr, 10);
            const yrB = parseInt(h.yrBuilt, 10);
            const nowYr = new Date().getFullYear();
            if (Number.isFinite(roofYr) && roofYr > 1900 && (nowYr - roofYr) >= 20) {
                out.push({ severity: 'med', text: `Home #${i+1}: roof ${nowYr - roofYr} yrs old` });
            }
            if (Number.isFinite(yrB) && yrB > 1800 && yrB < 1970 && !roofYr) {
                out.push({ severity: 'med', text: `Home #${i+1}: pre-1970 build, roof age unknown` });
            }
            const hz = h.hazards || {};
            if (hz.pool)       out.push({ severity: 'med', text: `Home #${i+1}: pool — confirm fenced/locked` });
            if (hz.trampoline) out.push({ severity: 'med', text: `Home #${i+1}: trampoline on premises` });
            if (hz.dogs) {
                const dogText = String(hz.dogs).toLowerCase();
                if (AGG_DOGS.some(b => dogText.includes(b))) {
                    out.push({ severity: 'med', text: `Home #${i+1}: dog (${hz.dogs.slice(0, 30)})` });
                }
            }
        });
        boats.forEach((b, i) => {
            const age = b.year ? (new Date().getFullYear() - parseInt(b.year, 10)) : null;
            if (age !== null && age > 30 && parseFloat(b.marketValue) > 30000) {
                out.push({ severity: 'med', text: `Boat #${i+1}: ${age} yrs old, $${b.marketValue}` });
            }
            if ((b.hullMaterial || '').toLowerCase() === 'wood' && age !== null && age > 5) {
                out.push({ severity: 'med', text: `Boat #${i+1}: wood hull, ${age} yrs` });
            }
        });
        rvs.forEach((r, i) => {
            if (r.fullTimer) out.push({ severity: 'med', text: `RV #${i+1}: full-timer (rate-impacting)` });
        });
        operators.forEach(op => {
            const age = _ageFromDobLocal(op.dob);
            if (age && age < 25 && age > 14) {
                out.push({ severity: 'med', text: `Young driver (${opName(op)}, ${age})` });
            }
        });
        const lossCount = (hist.losses || []).length;
        const violationCount = (hist.violations || []).length;
        if (lossCount > 0)      out.push({ severity: 'med', text: `${lossCount} loss${lossCount > 1 ? 'es' : ''} in 35 mo` });
        if (violationCount > 0) out.push({ severity: 'med', text: `${violationCount} violation${violationCount > 1 ? 's' : ''} in 35 mo` });

        // ── Low ──
        homes.forEach((h, i) => {
            if (h.hazards && h.hazards.woodStove) {
                out.push({ severity: 'low', text: `Home #${i+1}: wood stove — installation date?` });
            }
        });
        operators.forEach(op => {
            const age = _ageFromDobLocal(op.dob);
            if (age >= 65 && age <= 110) {
                out.push({ severity: 'low', text: `Mature driver (${opName(op)}, ${age})` });
            }
        });

        // ── Positive ──
        if (hist.hasCleanHistory) out.push({ severity: 'pos', text: 'Clean record — 35 mo' });
        if ((v2.discounts && v2.discounts.homeowner) && homes.length && autos.length) {
            out.push({ severity: 'pos', text: 'Multi-policy eligible (home + auto)' });
        }

        // Sort high → med → low → pos, preserving definition order within tier.
        const tierRank = { high: 0, med: 1, low: 2, pos: 3 };
        out.sort((a, b) => tierRank[a.severity] - tierRank[b.severity]);
        return out.slice(0, 6);
    }

    function computeActionItems(v2, riskMarkers) {
        const seen = new Set();
        const push = (item) => {
            const key = (item.text || '').toLowerCase().replace(/\s+/g, ' ').trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            out.push(item);
        };
        const out = [];

        // 1. Deferred fields — explicit agent commitments come first.
        const deferred = Array.isArray(v2.deferred) ? v2.deferred : [];
        const labelFor = (window.IntakeV2 && window.IntakeV2._defer && typeof window.IntakeV2._defer.labelForPath === 'function')
            ? window.IntakeV2._defer.labelForPath
            : (p) => String(p || '');
        deferred.forEach(p => push({ source: 'deferred', text: labelFor(p), path: p }));

        // 2. Derived prompts from risk markers (most actionable).
        (riskMarkers || []).forEach(rm => {
            if (rm.severity === 'pos') return;
            if (/pool — confirm fenced/.test(rm.text)) push({ source: 'derived', text: 'Confirm pool fencing/locking' });
            else if (/vacant \+ business/.test(rm.text)) push({ source: 'derived', text: 'Verify business activity & occupancy frequency' });
            else if (/Lapsed prior coverage/i.test(rm.text)) push({ source: 'derived', text: 'Document reason for prior coverage lapse' });
            else if (/wood stove — installation/.test(rm.text)) push({ source: 'derived', text: 'Get wood-stove installation date' });
            else if (/roof \d+ yrs old/.test(rm.text)) push({ source: 'derived', text: `Confirm ${rm.text.split(':')[1].trim()} — replacement planned?` });
            else if (/pre-1970 build/i.test(rm.text))    push({ source: 'derived', text: 'Confirm roof + electrical update years' });
            else if (/wood hull/i.test(rm.text))         push({ source: 'derived', text: 'Marine survey for wood-hull boat (Safeco/Travelers)' });
        });

        // 3. Talk-track rule output — softer cross-sell + compliance prompts.
        if (window.IntakeV2TalkTrack && typeof window.IntakeV2TalkTrack.computeSuggestions === 'function') {
            try {
                const ttOut = window.IntakeV2TalkTrack.computeSuggestions(v2) || [];
                ttOut.forEach(s => {
                    const plain = htmlToPlain(s.html);
                    if (plain) push({ source: 'talktrack', text: plain, id: s.id });
                });
            } catch (_) { /* talktrack rule failure shouldn't block the PDF */ }
        }

        return out;
    }

    function buildSnapshotModel(v2) {
        const homes = Array.isArray(v2.homes) ? v2.homes : [];
        const autos = Array.isArray(v2.autos) ? v2.autos : [];
        const boats = Array.isArray(v2.boats) ? v2.boats : [];
        const rvs = Array.isArray(v2.rvs) ? v2.rvs : [];
        const operators = Array.isArray(v2.operators) ? v2.operators : [];

        // Carrier fit — wrap IntakeV2Bindability.computeBindability for the snapshot.
        const carrierFit = [];
        let bindReady = [];
        if (window.IntakeV2Bindability && typeof window.IntakeV2Bindability.computeBindability === 'function') {
            try {
                const b = window.IntakeV2Bindability.computeBindability({ data: v2 });
                const order = (window.IntakeV2Bindability.CARRIERS) || ['progressive', 'foremost', 'travelers', 'safeco'];
                order.forEach(key => {
                    const entry = b[key];
                    if (!entry) return;
                    const cell = {
                        key,
                        label: entry.label || key,
                        ok: !!entry.ok,
                        missingCount: Array.isArray(entry.missing) ? entry.missing.length : 0,
                        topMiss: (Array.isArray(entry.missing) && entry.missing[0] && entry.missing[0].label) || '',
                    };
                    carrierFit.push(cell);
                    if (cell.ok) bindReady.push(cell.label);
                });
            } catch (_) { /* fall through to empty carrierFit */ }
        }

        // Coverage ratios for the first home — Cov A is the 100% baseline,
        // B/C/D are computed as fractions. Skip the bar entirely if there's
        // no home or Cov A is missing/zero (the snapshot renders a greyed
        // "No homeowner coverage on file" line in that case).
        let coverageRatios = null;
        if (homes.length) {
            const h0 = homes[0];
            const cov = h0.coverages || {};
            const A = parseFloat(String(cov.dwellingA).replace(/[$,\s]/g, ''));
            if (Number.isFinite(A) && A > 0) {
                const seg = (key) => {
                    const v = parseFloat(String(cov[key]).replace(/[$,\s]/g, ''));
                    return Number.isFinite(v) && v > 0 ? v : 0;
                };
                coverageRatios = {
                    dwellingA: A,
                    segments: [
                        { key: 'B', label: 'Cov B', amount: seg('otherStructuresB'), ratio: seg('otherStructuresB') / A },
                        { key: 'C', label: 'Cov C', amount: seg('personalPropertyC'), ratio: seg('personalPropertyC') / A },
                        { key: 'D', label: 'Cov D', amount: seg('lossOfUseD'), ratio: seg('lossOfUseD') / A },
                    ],
                    sidebar: [
                        { label: 'Liability (E)', value: cov.liabilityE },
                        { label: 'Med Pay (F)',   value: cov.medPayF },
                        { label: 'Deductible',    value: cov.deductible },
                    ],
                };
            }
        }

        // Product counts and chip labels (drives the keystat row).
        const qChips = [];
        if (homes.length) qChips.push(`${homes.length}H`);
        if (autos.length) qChips.push(`${autos.length}A`);
        if (boats.length) qChips.push(`${boats.length}B`);
        if (rvs.length)   qChips.push(`${rvs.length}RV`);

        const riskMarkers = computeRiskMarkers(v2);
        const actionItems = computeActionItems(v2, riskMarkers);

        return {
            carrierFit,
            riskMarkers,
            coverageRatios,
            actionItems,
            qChips,
            productCounts: {
                homes: homes.length,
                autos: autos.length,
                boats: boats.length,
                rvs: rvs.length,
                operators: operators.length,
            },
            bindReady,
            // Surfaces useful keystat numbers without re-derivation in the snapshot
            yearsAtAddress: (v2.address && v2.address.yearsAt) || '',
            continuous: (v2.priorInsurance && v2.priorInsurance.continuous) || '',
            primaryName: operators[0] ? `${operators[0].firstName || ''} ${operators[0].lastName || ''}`.trim() : '',
        };
    }

    // ─── Main builder ────────────────────────────────────────────────────────
    async function buildIntakeV2PDF(v2) {
        v2 = v2 || (window.IntakeV2 && window.IntakeV2.data) || {};
        if (!window.PDFLibs || typeof window.PDFLibs.ensure !== 'function') {
            throw new Error('PDFLibs not available');
        }
        await window.PDFLibs.ensure('jspdf');
        const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPDFCtor) throw new Error('jsPDF not loaded');

        const doc = new jsPDFCtor({ unit: 'pt', format: 'letter' });
        const PAGE_W = doc.internal.pageSize.getWidth();
        const PAGE_H = doc.internal.pageSize.getHeight();
        const MG = 40;          // margin
        const CW = PAGE_W - MG * 2;
        let y = MG;

        const a = v2.applicant || {};
        const addr = v2.address || {};
        const homes = Array.isArray(v2.homes) ? v2.homes : [];
        const autos = Array.isArray(v2.autos) ? v2.autos : [];
        const boats = Array.isArray(v2.boats) ? v2.boats : [];
        const rvs = Array.isArray(v2.rvs) ? v2.rvs : [];
        const operators = Array.isArray(v2.operators) ? v2.operators : [];

        const clientName = [a.prefix, a.firstName, a.middleName, a.lastName, a.suffix].filter(Boolean).join(' ') || 'Client';
        const fullAddress = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
        const ref = docRef();

        // Determine quote-type label from non-empty product arrays
        const qChips = [];
        if (homes.length) qChips.push(`${homes.length} Home${homes.length > 1 ? 's' : ''}`);
        if (autos.length) qChips.push(`${autos.length} Auto${autos.length > 1 ? 's' : ''}`);
        if (boats.length) qChips.push(`${boats.length} Boat${boats.length > 1 ? 's' : ''}`);
        if (rvs.length)   qChips.push(`${rvs.length} RV${rvs.length > 1 ? 's' : ''}`);
        const qLabel = qChips.join(' · ') || 'Personal Lines Quote';

        // Pre-fetch logo + maps (best-effort, both can return null)
        const [logoImg, mapImages] = await Promise.all([
            fetchLogo(),
            fetchMaps(fullAddress),
        ]);

        // Compute the snapshot model once — every page-1 primitive reads from
        // this object so we can allocate deterministic heights.
        const model = buildSnapshotModel(v2);

        // ─── Layout helpers ──────────────────────────────────────────────────
        function setColor(method, rgb) {
            if (has(doc, method)) doc[method](rgb[0], rgb[1], rgb[2]);
        }
        function fillRect(x, yy, w, h) {
            if (has(doc, 'rect')) doc.rect(x, yy, w, h, 'F');
        }
        function strokeRect(x, yy, w, h) {
            if (has(doc, 'rect')) doc.rect(x, yy, w, h, 'S');
        }
        function need(h) {
            if (y + h > PAGE_H - 30) {
                doc.addPage();
                y = MG;
            }
        }
        function sectionLabel(title) {
            need(18);
            y += 6;
            setColor('setDrawColor', PALETTE.RULE);
            doc.setLineWidth(0.5);
            doc.line(MG, y, PAGE_W - MG, y);
            doc.setFontSize(8); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.MID);
            doc.text(title.toUpperCase(), MG, y + 7);
            doc.setFont('helvetica', 'normal');
            setColor('setTextColor', PALETTE.INK);
            y += 14;
        }
        function subHeader(title) {
            need(14);
            y += 2;
            doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.INK);
            doc.text(title, MG, y + 4);
            setColor('setDrawColor', PALETTE.LIGHT);
            doc.setLineWidth(0.3);
            const labelW = (has(doc, 'getTextWidth') ? doc.getTextWidth(title) : title.length * 4);
            doc.line(MG + labelW + 6, y + 3, PAGE_W - MG, y + 3);
            doc.setFont('helvetica', 'normal');
            y += 12;
        }
        // 2-column key/value row. fields = [[label, value], ...]. Skips blanks.
        function kvRow(fields, cols) {
            cols = cols || 2;
            const filled = fields.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false);
            if (!filled.length) return;
            const colW = CW / cols;
            const labelW = colW * 0.42;
            const valueW = colW - labelW - 6;
            const baseRowH = 13;
            const lineH = 11;

            const rows = [];
            for (let i = 0; i < filled.length; i += cols) rows.push(filled.slice(i, i + cols));

            rows.forEach((row, ri) => {
                doc.setFontSize(9);
                let maxLines = 1;
                const cache = row.map(([, value]) => {
                    const str = String(value);
                    const lines = has(doc, 'splitTextToSize') ? doc.splitTextToSize(str, valueW) : [str];
                    if (lines.length > maxLines) maxLines = lines.length;
                    return lines;
                });
                const rowH = baseRowH + (maxLines - 1) * lineH;
                need(rowH + 2);

                // Alternate row fill
                if (ri % 2 === 1 && has(doc, 'setFillColor')) {
                    setColor('setFillColor', PALETTE.FILL);
                    fillRect(MG, y - 1, CW, rowH + 1);
                }

                row.forEach(([label], ci) => {
                    const x = MG + ci * colW;
                    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text(String(label).toUpperCase(), x + 2, y + 6);

                    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.INK);
                    cache[ci].forEach((line, li) => {
                        doc.text(line, x + labelW, y + 6 + li * lineH);
                    });
                });
                doc.setFont('helvetica', 'normal');
                y += rowH;
            });
            y += 4;
        }
        // Per-asset card with accent strip + title + 2-col grid
        function assetCard(title, fields) {
            const filled = fields.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false);
            // Estimate card height: 18 (header) + filled count * 14 (rows) + 8 (padding)
            const estimatedH = 18 + Math.ceil(filled.length / 2) * 14 + 8;
            need(estimatedH);
            const cardY = y;

            // Card header strip
            setColor('setFillColor', PALETTE.FILL);
            fillRect(MG, cardY, CW, 16);
            setColor('setFillColor', PALETTE.ACCENT);
            fillRect(MG, cardY, 3, 16);
            doc.setFontSize(10); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.INK);
            doc.text(title, MG + 8, cardY + 11);
            doc.setFont('helvetica', 'normal');
            y = cardY + 18;

            if (filled.length) kvRow(filled, 2);
            else y += 2;

            y += 2;
        }

        // ─── Snapshot visual primitives ──────────────────────────────────────
        // Each primitive accepts an explicit (x, yy, w, …) and returns the
        // consumed height so the snapshot composer can drive a deterministic
        // grid. Each begins with a feature-detection branch so the JSDOM test
        // mock (which lacks `rect`, `setFillColor`, `addImage`, etc.) still
        // gets a clean text-only output without throwing.

        // Tiny check / X icon drawn from two `line()` strokes — jsPDF in test
        // mode supports `line` but not `circle`, so we never call `circle`.
        function drawCheck(cx, cy, size) {
            const s = size || 6;
            doc.setLineWidth(1.2);
            doc.line(cx - s/2, cy + 0.5, cx - s/6, cy + s/2);
            doc.line(cx - s/6, cy + s/2, cx + s/2, cy - s/2);
            doc.setLineWidth(0.4);
        }
        function drawX(cx, cy, size) {
            const s = size || 6;
            doc.setLineWidth(1.2);
            doc.line(cx - s/2, cy - s/2, cx + s/2, cy + s/2);
            doc.line(cx - s/2, cy + s/2, cx + s/2, cy - s/2);
            doc.setLineWidth(0.4);
        }

        // keystatRow — 4–5 KPI cells separated by thin vertical rules.
        // stats = [{label, value}, …]
        function keystatRow(stats, x, yy, w) {
            const ROW_H = 22;
            if (!stats.length) return 0;
            // Text-only fallback path
            if (!has(doc, 'rect')) {
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                doc.text(stats.map(s => `${s.label}: ${s.value || '—'}`).join(' · '), x, yy + 10);
                return ROW_H;
            }
            setColor('setFillColor', PALETTE.FILL);
            fillRect(x, yy, w, ROW_H);
            setColor('setDrawColor', PALETTE.LIGHT);
            doc.setLineWidth(0.3);
            strokeRect(x, yy, w, ROW_H);
            const cellW = w / stats.length;
            stats.forEach((s, i) => {
                const cx = x + i * cellW;
                if (i > 0) {
                    setColor('setDrawColor', PALETTE.LIGHT);
                    doc.line(cx, yy + 4, cx, yy + ROW_H - 4);
                }
                doc.setFontSize(6); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.MID);
                doc.text(String(s.label || '').toUpperCase(), cx + 6, yy + 8);
                doc.setFontSize(10); doc.setFont('helvetica', 'bold');
                setColor('setTextColor', PALETTE.INK);
                doc.text(String(s.value || '—'), cx + 6, yy + 18);
            });
            doc.setFont('helvetica', 'normal');
            return ROW_H;
        }

        // statusGrid — 2×2 carrier-fit matrix. items = [{label, ok, missingCount, topMiss}]
        function statusGrid(items, x, yy, w) {
            if (!items.length) return 0;
            const CELL_H = 38;
            const cols = 2;
            const rows = Math.ceil(items.length / cols);
            const totalH = rows * CELL_H;
            // Text-only fallback path
            if (!has(doc, 'rect')) {
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                items.forEach((it, i) => {
                    const status = it.ok ? 'BINDABLE' : `${it.missingCount} missing${it.topMiss ? ' · ' + it.topMiss : ''}`;
                    doc.text(`${it.label}: ${it.ok ? '✓' : '✗'} ${status}`, x, yy + 12 + i * 11);
                });
                return Math.max(totalH, items.length * 11 + 4);
            }
            const cellW = w / cols;
            items.forEach((it, i) => {
                const cx = x + (i % cols) * cellW;
                const cy = yy + Math.floor(i / cols) * CELL_H;

                // Cell background — OK cells get FILL tint so the eye picks them up
                if (it.ok) {
                    setColor('setFillColor', PALETTE.FILL);
                    fillRect(cx, cy, cellW, CELL_H);
                    // 3pt accent strip on the left
                    setColor('setFillColor', PALETTE.ACCENT);
                    fillRect(cx, cy, 3, CELL_H);
                }
                // Border (always)
                setColor('setDrawColor', PALETTE.LIGHT);
                doc.setLineWidth(0.4);
                strokeRect(cx, cy, cellW, CELL_H);

                // Carrier label
                doc.setFontSize(11); doc.setFont('helvetica', 'bold');
                setColor('setTextColor', PALETTE.INK);
                doc.text(String(it.label || ''), cx + 8, cy + 13);

                // Status icon — check (ok) or X (missing) at right edge
                const iconCx = cx + cellW - 14;
                const iconCy = cy + 12;
                setColor('setDrawColor', PALETTE.INK);
                if (it.ok) drawCheck(iconCx, iconCy, 9);
                else       drawX(iconCx, iconCy, 9);

                // Status line
                doc.setFontSize(8); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.MID);
                const status = it.ok ? 'Bindable' : `${it.missingCount} missing${it.topMiss ? ' · ' + it.topMiss : ''}`;
                const wrapped = has(doc, 'splitTextToSize') ? doc.splitTextToSize(status, cellW - 16) : [status];
                wrapped.slice(0, 2).forEach((line, li) => {
                    doc.text(line, cx + 8, cy + 24 + li * 9);
                });
            });
            doc.setFont('helvetica', 'normal');
            doc.setLineWidth(0.3);
            return totalH;
        }

        // pillChip — single chip drawn as a plain rect. Returns width consumed.
        function pillChip(label, px, py, opts) {
            const PAD_X = 5, PAD_Y = 3;
            const HEIGHT = 13;
            doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
            const text = String(label || '');
            const tw = has(doc, 'getTextWidth') ? doc.getTextWidth(text) : text.length * 4.2;
            const chipW = tw + PAD_X * 2;
            if (!has(doc, 'rect')) {
                setColor('setTextColor', PALETTE.INK);
                doc.text(`[${text}]`, px + PAD_X, py + HEIGHT - PAD_Y);
                return chipW + 4;
            }
            if (opts && opts.filled) {
                setColor('setFillColor', PALETTE.FILL);
                fillRect(px, py, chipW, HEIGHT);
            }
            setColor('setDrawColor', PALETTE.LIGHT);
            doc.setLineWidth(0.4);
            strokeRect(px, py, chipW, HEIGHT);
            setColor('setTextColor', PALETTE.INK);
            doc.text(text, px + PAD_X, py + HEIGHT - PAD_Y - 1);
            return chipW + 4;
        }

        // pillRow — flows pills onto multiple lines. Returns total height.
        function pillRow(labels, x, yy, maxW, opts) {
            const items = (labels || []).filter(Boolean);
            if (!items.length) return 0;
            // Text-only fallback path uses a single line
            if (!has(doc, 'rect')) {
                doc.setFontSize(8); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                doc.text(items.map(l => `[${l}]`).join(' '), x, yy + 8);
                return 14;
            }
            const ROW_H = 16;
            let px = x;
            let py = yy;
            items.forEach((label) => {
                doc.setFontSize(7.5);
                const tw = has(doc, 'getTextWidth') ? doc.getTextWidth(String(label)) : String(label).length * 4.2;
                const chipW = tw + 14; // approx pill width incl padding + margin
                if (px + chipW > x + maxW) {
                    px = x;
                    py += ROW_H;
                }
                px += pillChip(label, px, py, opts || { filled: true });
            });
            return (py - yy) + ROW_H;
        }

        // severityBox — bordered callout. items = [{severity, text}]
        function severityBox(title, items, x, yy, w) {
            const HEADER_H = 14;
            const ROW_H = 14;
            const items4 = (items || []).slice(0, 5);
            const totalH = HEADER_H + Math.max(items4.length, 1) * ROW_H + 4;
            // Text-only fallback path
            if (!has(doc, 'rect')) {
                doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                setColor('setTextColor', PALETTE.INK);
                doc.text(title, x, yy + 9);
                doc.setFont('helvetica', 'normal');
                if (!items4.length) {
                    doc.setFontSize(9);
                    setColor('setTextColor', PALETTE.MID);
                    doc.text('No flagged risks', x, yy + HEADER_H + 12);
                } else {
                    items4.forEach((it, i) => {
                        doc.setFontSize(8.5);
                        setColor('setTextColor', PALETTE.INK);
                        doc.text(`[${it.severity.toUpperCase()}] ${it.text}`, x, yy + HEADER_H + 10 + i * 11);
                    });
                }
                return totalH;
            }
            // Outer border
            setColor('setDrawColor', PALETTE.LIGHT);
            doc.setLineWidth(0.4);
            strokeRect(x, yy, w, totalH);
            // Header strip
            setColor('setFillColor', PALETTE.FILL);
            fillRect(x, yy, w, HEADER_H);
            setColor('setFillColor', PALETTE.ACCENT);
            fillRect(x, yy, 3, HEADER_H);
            doc.setFontSize(8); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.MID);
            doc.text(title.toUpperCase(), x + 8, yy + HEADER_H - 4);

            // Items
            if (!items4.length) {
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.MID);
                doc.text('No flagged risks', x + 8, yy + HEADER_H + 10);
                return totalH;
            }
            doc.setFontSize(9); doc.setFont('helvetica', 'normal');
            items4.forEach((it, i) => {
                const ry = yy + HEADER_H + i * ROW_H + 4;
                // 4-cell density indicator: filled cells = severity weight
                const weight = SEVERITY_WEIGHT[it.severity] || 0;
                const isPositive = it.severity === 'pos';
                const cellSize = 3.5;
                const gap = 1.5;
                const indicatorX = x + 8;
                const indicatorY = ry + 2;
                for (let c = 0; c < 4; c++) {
                    if (isPositive) {
                        // Positive markers get an outline-only set and a check icon overlaid in the first cell
                        setColor('setDrawColor', PALETTE.LIGHT);
                        doc.setLineWidth(0.3);
                        strokeRect(indicatorX + c * (cellSize + gap), indicatorY, cellSize, cellSize * 1.7);
                    } else {
                        const filled = c < weight;
                        if (filled) {
                            // Greyscale density encodes severity: high = dark, low = lite
                            const shade = it.severity === 'high' ? PALETTE.GREY_DARK
                                : it.severity === 'med' ? PALETTE.GREY_MID
                                : PALETTE.GREY_LITE;
                            setColor('setFillColor', shade);
                            fillRect(indicatorX + c * (cellSize + gap), indicatorY, cellSize, cellSize * 1.7);
                        } else {
                            setColor('setDrawColor', PALETTE.LIGHT);
                            doc.setLineWidth(0.3);
                            strokeRect(indicatorX + c * (cellSize + gap), indicatorY, cellSize, cellSize * 1.7);
                        }
                    }
                }
                if (isPositive) {
                    setColor('setDrawColor', PALETTE.POSITIVE);
                    drawCheck(indicatorX + cellSize / 2, indicatorY + cellSize, cellSize * 1.5);
                }
                // Text
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                const textX = indicatorX + 4 * (cellSize + gap) + 6;
                doc.text(String(it.text || ''), textX, ry + 9);
            });
            doc.setLineWidth(0.3);
            return totalH;
        }

        // ratioBar — horizontal stacked bar representing Cov A's allocation.
        // model = { dwellingA, segments: [{label, amount, ratio}], sidebar: [{label, value}] }
        function ratioBar(model, x, yy, w) {
            const TITLE_H = 12;
            const BAR_H = 16;
            const LABEL_H = 12;
            const TOTAL = TITLE_H + BAR_H + LABEL_H + 4;
            if (!model) {
                if (!has(doc, 'rect')) {
                    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text('No homeowner coverage on file', x, yy + 12);
                    return 18;
                }
                setColor('setDrawColor', PALETTE.LIGHT);
                doc.setLineWidth(0.3);
                strokeRect(x, yy, w, 28);
                doc.setFontSize(9); doc.setFont('helvetica', 'italic');
                setColor('setTextColor', PALETTE.MID);
                doc.text('No homeowner coverage on file', x + 8, yy + 18);
                doc.setFont('helvetica', 'normal');
                return 32;
            }
            // Text-only fallback
            if (!has(doc, 'rect')) {
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                const segText = model.segments.filter(s => s.amount > 0).map(s => `${s.label} $${Math.round(s.amount).toLocaleString()}`).join(' · ');
                doc.text(`Cov A $${Math.round(model.dwellingA).toLocaleString()}  ·  ${segText}`, x, yy + 10);
                if (model.sidebar) {
                    const sb = model.sidebar.filter(s => s.value).map(s => `${s.label} ${s.value}`).join(' · ');
                    if (sb) doc.text(sb, x, yy + 22);
                }
                return TOTAL;
            }

            // Title row
            doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.INK);
            doc.text(`Cov A · $${Math.round(model.dwellingA).toLocaleString()}`, x, yy + 9);

            // Sidebar (right column with E/F/Deductible)
            const sidebarW = 140;
            const barW = w - sidebarW - 12;
            const barX = x;
            const barY = yy + TITLE_H + 2;

            // Bar baseline (light grey background so empty segments still register)
            setColor('setFillColor', PALETTE.FILL);
            fillRect(barX, barY, barW, BAR_H);
            setColor('setDrawColor', PALETTE.LIGHT);
            doc.setLineWidth(0.3);
            strokeRect(barX, barY, barW, BAR_H);

            // Stacked segments
            let cursorX = barX;
            const palettes = [PALETTE.GREY_DARK, PALETTE.GREY_MID, PALETTE.GREY_LITE];
            model.segments.forEach((seg, idx) => {
                const ratio = Math.min(Math.max(seg.ratio || 0, 0), 1);
                if (ratio <= 0) return;
                const segW = ratio * barW;
                setColor('setFillColor', palettes[idx % palettes.length]);
                fillRect(cursorX, barY, segW, BAR_H);
                // Inline label if wide enough (>40pt)
                if (segW > 40) {
                    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.WHITE);
                    doc.text(`${seg.label} ${Math.round(ratio * 100)}%`, cursorX + 4, barY + 10);
                }
                cursorX += segW;
            });

            // Hang $amount labels under each segment
            cursorX = barX;
            model.segments.forEach((seg, idx) => {
                const ratio = Math.min(Math.max(seg.ratio || 0, 0), 1);
                if (ratio <= 0) return;
                const segW = ratio * barW;
                doc.setFontSize(7); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.MID);
                const amountStr = `$${Math.round(seg.amount).toLocaleString()}`;
                doc.text(amountStr, cursorX + 2, barY + BAR_H + 8);
                cursorX += segW;
            });

            // Sidebar — E/F/deductible as compact text block
            if (model.sidebar) {
                const sbX = x + barW + 12;
                let sbY = yy + TITLE_H + 2;
                model.sidebar.forEach(s => {
                    if (!s.value) return;
                    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text(String(s.label).toUpperCase(), sbX, sbY + 4);
                    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.INK);
                    doc.text(`${fmtMoney(s.value) || s.value}`, sbX + 60, sbY + 4);
                    sbY += 10;
                });
            }

            doc.setFont('helvetica', 'normal');
            return TOTAL;
        }

        // timelineStrip — horizontal axis with markers + numbered legend.
        // events = [{date, type, operatorId, severity?}]
        function timelineStrip(events, startDate, endDate, x, yy, w) {
            const HEADER_H = 12;
            const AXIS_H = 22;
            const events9 = (events || []).filter(e => e.date).slice(0, 12);
            if (!events9.length) {
                if (!has(doc, 'rect')) {
                    doc.setFontSize(9); doc.setFont('helvetica', 'italic');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text('Clean record — no events in 35 mo', x, yy + 12);
                    doc.setFont('helvetica', 'normal');
                    return 16;
                }
                setColor('setDrawColor', PALETTE.LIGHT);
                doc.setLineWidth(0.3);
                doc.line(x, yy + 14, x + w, yy + 14);
                doc.setFontSize(9); doc.setFont('helvetica', 'italic');
                setColor('setTextColor', PALETTE.MID);
                doc.text('Clean record — no events in 35 mo', x + 4, yy + 12);
                doc.setFont('helvetica', 'normal');
                return 24;
            }
            const start = startDate.getTime();
            const end = endDate.getTime();
            const span = Math.max(1, end - start);

            // Text-only fallback emits a flat numbered legend
            if (!has(doc, 'rect')) {
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                events9.forEach((e, i) => {
                    doc.text(`${i + 1}. ${fmtDate(e.date)} · ${e.type || ''}${e.operatorName ? ' (' + e.operatorName + ')' : ''}`, x, yy + 10 + i * 11);
                });
                return events9.length * 11 + 4;
            }

            // Title row
            doc.setFontSize(8); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.MID);
            doc.text(`LAST 35 MONTHS · ${events9.length} EVENT${events9.length === 1 ? '' : 'S'}`, x, yy + 9);

            // Axis
            const axisY = yy + HEADER_H + 12;
            setColor('setDrawColor', PALETTE.LIGHT);
            doc.setLineWidth(0.4);
            doc.line(x, axisY, x + w, axisY);

            // Tick marks at year boundaries
            const startYear = startDate.getFullYear();
            const endYear = endDate.getFullYear();
            for (let yr = startYear; yr <= endYear; yr++) {
                const tickDate = new Date(yr, 0, 1).getTime();
                if (tickDate < start || tickDate > end) continue;
                const tickX = x + ((tickDate - start) / span) * w;
                doc.line(tickX, axisY - 2, tickX, axisY + 2);
                doc.setFontSize(6); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.MID);
                doc.text(String(yr), tickX - 6, axisY + 9);
            }

            // Event markers
            events9.forEach((e, i) => {
                const evDate = new Date(e.date).getTime();
                if (!Number.isFinite(evDate)) return;
                const ratio = Math.min(1, Math.max(0, (evDate - start) / span));
                const mx = x + ratio * w;
                const my = axisY - 5;
                // Marker: filled rect, shade by severity (default = dark)
                const shade = e.severity === 'low' ? PALETTE.GREY_LITE
                    : e.severity === 'med' ? PALETTE.GREY_MID
                    : PALETTE.GREY_DARK;
                setColor('setFillColor', shade);
                fillRect(mx - 2, my - 8, 4, 8);
                // Number label above marker
                doc.setFontSize(6); doc.setFont('helvetica', 'bold');
                setColor('setTextColor', PALETTE.INK);
                doc.text(String(i + 1), mx - 1.5, my - 10);
            });

            // Numbered legend below
            const legendY = axisY + 14;
            const legendCols = 2;
            events9.forEach((e, i) => {
                const col = i % legendCols;
                const row = Math.floor(i / legendCols);
                const lx = x + col * (w / legendCols);
                const ly = legendY + row * 10;
                doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                const parts = [String(i + 1) + '.', fmtDate(e.date), e.type];
                if (e.operatorName) parts.push(`(${e.operatorName})`);
                doc.text(parts.filter(Boolean).join(' '), lx, ly);
            });

            const legendH = Math.ceil(events9.length / legendCols) * 10;
            doc.setLineWidth(0.3);
            return HEADER_H + AXIS_H + legendH + 6;
        }

        // checklist — checkbox + label rows, optional source tag.
        // items = [{text, source, path?}], max default 5
        function checklist(items, x, yy, w, max) {
            const maxItems = max || 5;
            const items5 = (items || []).slice(0, maxItems);
            if (!items5.length) {
                doc.setFontSize(9); doc.setFont('helvetica', 'italic');
                setColor('setTextColor', PALETTE.MID);
                doc.text('No outstanding action items', x, yy + 11);
                doc.setFont('helvetica', 'normal');
                return 16;
            }
            // Text-only fallback uses a numbered list
            if (!has(doc, 'rect')) {
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                items5.forEach((it, i) => {
                    const tag = it.source === 'deferred' ? ' [DEFER]'
                        : it.source === 'talktrack' ? ' [RULE]'
                        : '';
                    doc.text(`${i + 1}. ${it.text}${tag}`, x, yy + 11 + i * 12);
                });
                return items5.length * 12 + 4;
            }

            const ROW_H = 14;
            const BOX = 8;
            items5.forEach((it, i) => {
                const ry = yy + i * ROW_H + 4;
                // Checkbox
                setColor('setDrawColor', PALETTE.INK);
                doc.setLineWidth(0.6);
                strokeRect(x, ry, BOX, BOX);
                // Text — wrap to leave room for source tag on the right
                const tagText = it.source === 'deferred' ? 'DEFER'
                    : it.source === 'talktrack' ? 'RULE'
                    : '';
                doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
                const tagW = tagText && has(doc, 'getTextWidth') ? doc.getTextWidth(tagText) + 4 : 36;
                const textMaxW = w - BOX - 12 - tagW;
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                const lines = has(doc, 'splitTextToSize') ? doc.splitTextToSize(String(it.text || ''), textMaxW) : [String(it.text || '')];
                doc.text(lines[0], x + BOX + 6, ry + 7);
                // Source tag (right-aligned)
                if (tagText && has(doc, 'getTextWidth')) {
                    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
                    setColor('setTextColor', PALETTE.MID);
                    const tw = doc.getTextWidth(tagText);
                    doc.text(tagText, x + w - tw, ry + 7);
                } else if (tagText) {
                    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text(tagText, x + w - 36, ry + 7);
                }
            });
            doc.setLineWidth(0.3);
            doc.setFont('helvetica', 'normal');
            return items5.length * ROW_H + 4;
        }

        // operatorAssignmentGrid — rows=operators, cols=assets. Cell=P/A/blank.
        // assets = [{key, label}] (e.g. ['A1 Camry','A2 CR-V','B1 Yamaha'])
        // assignments = Map<operatorId, Map<assetKey, 'P'|'A'>>
        function operatorAssignmentGrid(operators, assets, assignments, x, yy, w) {
            if (!operators.length || !assets.length) return 0;
            const HEADER_H = 16;
            const ROW_H = 14;
            const NAME_W = 130;
            const colW = (w - NAME_W) / assets.length;
            const totalH = HEADER_H + operators.length * ROW_H + 4;
            if (!has(doc, 'rect')) {
                doc.setFontSize(9); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                operators.forEach((op, i) => {
                    const name = `${op.firstName || ''} ${op.lastName || ''}`.trim() || 'Operator';
                    const cells = assets.map(a => {
                        const v = assignments.get(op.id) && assignments.get(op.id).get(a.key);
                        return `${a.label}:${v || '–'}`;
                    });
                    doc.text(`${name}  ${cells.join('  ')}`, x, yy + 10 + i * 11);
                });
                return totalH;
            }
            // Header row
            setColor('setFillColor', PALETTE.FILL);
            fillRect(x, yy, w, HEADER_H);
            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.MID);
            doc.text('OPERATOR', x + 4, yy + 11);
            assets.forEach((a, i) => {
                const cx = x + NAME_W + i * colW;
                const trunc = a.label.length > 9 ? a.label.slice(0, 9) : a.label;
                doc.text(trunc, cx + 4, yy + 11);
            });
            // Body rows
            doc.setFont('helvetica', 'normal');
            operators.forEach((op, ri) => {
                const ry = yy + HEADER_H + ri * ROW_H;
                if (ri % 2 === 1) {
                    setColor('setFillColor', PALETTE.FILL);
                    fillRect(x, ry, w, ROW_H);
                }
                // Operator name
                doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                setColor('setTextColor', PALETTE.INK);
                const name = `${op.firstName || ''} ${op.lastName || ''}`.trim() || 'Operator';
                doc.text(name, x + 4, ry + 10);
                // Cells
                assets.forEach((a, ci) => {
                    const cx = x + NAME_W + ci * colW;
                    const v = assignments.get(op.id) && assignments.get(op.id).get(a.key);
                    if (v === 'P') {
                        setColor('setFillColor', PALETTE.ACCENT);
                        fillRect(cx + 4, ry + 3, 14, 8);
                        doc.setFontSize(7); doc.setFont('helvetica', 'bold');
                        setColor('setTextColor', PALETTE.WHITE);
                        doc.text('P', cx + 9, ry + 9);
                    } else if (v === 'A') {
                        setColor('setDrawColor', PALETTE.INK);
                        doc.setLineWidth(0.6);
                        strokeRect(cx + 4, ry + 3, 14, 8);
                        doc.setFontSize(7); doc.setFont('helvetica', 'bold');
                        setColor('setTextColor', PALETTE.INK);
                        doc.text('A', cx + 9, ry + 9);
                    }
                });
                doc.setFont('helvetica', 'normal');
            });
            // Border
            setColor('setDrawColor', PALETTE.LIGHT);
            doc.setLineWidth(0.4);
            strokeRect(x, yy, w, totalH - 4);
            doc.setLineWidth(0.3);
            return totalH;
        }

        // ════════════════════════════════════════════════════════════════════
        //  ① DOCUMENT HEADER
        // ════════════════════════════════════════════════════════════════════
        // Top accent bar
        setColor('setFillColor', PALETTE.ACCENT);
        fillRect(MG, MG - 8, CW, 3);

        // Logo + agency name on left, doc ref on right
        const logoH = 28;
        const logoW = 28;
        if (logoImg && logoImg.dataUrl && has(doc, 'addImage')) {
            try { doc.addImage(logoImg.dataUrl, logoImg.format, MG, y, logoW, logoH); } catch (_) {}
        }
        const txtX = MG + (logoImg && logoImg.dataUrl ? logoW + 8 : 0);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        setColor('setTextColor', PALETTE.INK);
        doc.text('Altech Insurance', txtX, y + 14);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        setColor('setTextColor', PALETTE.MID);
        doc.text('Personal Insurance Application Summary', txtX, y + 24);

        // Right-aligned doc ref + timestamp
        if (has(doc, 'getTextWidth')) {
            const refW1 = doc.getTextWidth(ref);
            const refW2 = doc.getTextWidth(fmtDateTime(new Date()));
            doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
            setColor('setTextColor', PALETTE.MID);
            doc.text(ref, PAGE_W - MG - refW1, y + 12);
            doc.text(fmtDateTime(new Date()), PAGE_W - MG - refW2, y + 22);
        } else {
            doc.text(ref, MG, y + 12);
            doc.text(fmtDateTime(new Date()), MG, y + 22);
        }
        y += logoH + 4;

        // Rule under header
        setColor('setDrawColor', PALETTE.LIGHT);
        doc.setLineWidth(0.5);
        doc.line(MG, y, PAGE_W - MG, y);
        y += 6;

        // ════════════════════════════════════════════════════════════════════
        //  ② HERO CARD — client name, address, products, optional street view
        // ════════════════════════════════════════════════════════════════════
        const photoW = (mapImages && mapImages.streetView && mapImages.streetView.dataUrl && has(doc, 'addImage')) ? 110 : 0;
        const cardX = MG + (photoW > 0 ? photoW + 8 : 0);
        const cardW = CW - (photoW > 0 ? photoW + 8 : 0);
        const heroH = 76;

        // Street View photo (lightened for toner-friendly print)
        if (photoW > 0) {
            try {
                doc.addImage(mapImages.streetView.dataUrl, mapImages.streetView.format, MG, y, photoW, heroH);
                if (has(doc, 'setGState')) {
                    doc.setGState(new doc.GState({ opacity: 0.45 }));
                    setColor('setFillColor', PALETTE.WHITE);
                    fillRect(MG, y, photoW, heroH);
                    doc.setGState(new doc.GState({ opacity: 1 }));
                }
                setColor('setDrawColor', PALETTE.LIGHT);
                doc.setLineWidth(0.3);
                strokeRect(MG, y, photoW, heroH);
                doc.setFontSize(7); setColor('setTextColor', PALETTE.MID);
                doc.text('Street View', MG + 4, y + heroH - 4);
            } catch (_) { /* image failed — skip */ }
        }

        // Hero card body
        setColor('setFillColor', PALETTE.FILL);
        fillRect(cardX, y, cardW, heroH);
        setColor('setFillColor', PALETTE.ACCENT);
        fillRect(cardX, y, 4, heroH);
        setColor('setDrawColor', PALETTE.LIGHT);
        doc.setLineWidth(0.3);
        strokeRect(cardX, y, cardW, heroH);

        // Client name (big)
        doc.setFontSize(18); doc.setFont('helvetica', 'bold');
        setColor('setTextColor', PALETTE.INK);
        doc.text(clientName, cardX + 12, y + 18);

        // Quote-type chips (small, right-aligned)
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        setColor('setTextColor', PALETTE.MID);
        if (has(doc, 'getTextWidth')) {
            const qW = doc.getTextWidth(qLabel);
            doc.text(qLabel, PAGE_W - MG - 6 - qW, y + 18);
        }

        // Address (medium)
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        setColor('setTextColor', PALETTE.INK);
        const addrLines = has(doc, 'splitTextToSize') ? doc.splitTextToSize(fullAddress || '—', cardW - 18) : [fullAddress || '—'];
        doc.text(addrLines[0], cardX + 12, y + 32);

        // Thin rule
        setColor('setDrawColor', PALETTE.LIGHT);
        doc.setLineWidth(0.3);
        doc.line(cardX + 12, y + 40, cardX + cardW - 6, y + 40);

        // Phone / email row
        const contactParts = [];
        if (a.phone) contactParts.push(a.phone);
        if (a.email) contactParts.push(a.email);
        doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
        setColor('setTextColor', PALETTE.INK);
        doc.text(contactParts.join('   |   ') || '—', cardX + 12, y + 52);

        // Bindability summary
        if (window.IntakeV2Bindability) {
            try {
                const b = window.IntakeV2Bindability.computeBindability({ data: v2 });
                if (b) {
                    const ready = Object.entries(b).filter(([, x]) => x.ok).map(([, x]) => x.label);
                    const text = ready.length ? `Ready: ${ready.join(', ')}` : 'No carriers ready yet';
                    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text(text, cardX + 12, y + 65);
                }
            } catch (_) { /* swallow */ }
        }

        // Satellite mini-map at bottom-right of hero card
        if (mapImages && mapImages.satellite && mapImages.satellite.dataUrl && has(doc, 'addImage')) {
            try {
                const satW = 36, satH = 26;
                const satX = PAGE_W - MG - satW - 6;
                const satY = y + heroH - satH - 6;
                doc.addImage(mapImages.satellite.dataUrl, mapImages.satellite.format, satX, satY, satW, satH);
                if (has(doc, 'setGState')) {
                    doc.setGState(new doc.GState({ opacity: 0.35 }));
                    setColor('setFillColor', PALETTE.WHITE);
                    fillRect(satX, satY, satW, satH);
                    doc.setGState(new doc.GState({ opacity: 1 }));
                }
                setColor('setDrawColor', PALETTE.LIGHT);
                doc.setLineWidth(0.3);
                strokeRect(satX, satY, satW, satH);
            } catch (_) { /* image failed */ }
        }

        y += heroH + 12;

        // Make sure the test mock sees the products even without chrome
        if (!has(doc, 'rect')) {
            // Plain text fallback for the hero card content so tests still
            // pick up the client name + address in the captured text stream.
            doc.text(clientName, MG, y);
            y += 14;
            doc.text(qLabel, MG, y);
            y += 14;
            if (fullAddress) { doc.text(fullAddress, MG, y); y += 14; }
        }

        // ════════════════════════════════════════════════════════════════════
        //  ② SNAPSHOT (page 1 only — single-page underwriting summary)
        // ════════════════════════════════════════════════════════════════════
        // Page 1 is a fixed-height composition of visual primitives reading
        // from `model`. After this block we force `addPage()` so the detail
        // phase starts on page 2 — guarantees the snapshot is always exactly
        // one page, even if a future change adds rows.

        // Keystat row — 4 compact KPI cells
        const keystatItems = [
            { label: 'Operators',     value: String(model.productCounts.operators || 0) },
            { label: 'Yrs at Addr',   value: model.yearsAtAddress ? String(model.yearsAtAddress) : '—' },
            { label: 'Continuous',    value: model.continuous || '—' },
            { label: 'Lines',         value: model.qChips.join(' · ') || '—' },
        ];
        y += keystatRow(keystatItems, MG, y, CW);
        y += 8;

        // Carrier fit grid
        if (model.carrierFit.length) {
            sectionLabel('Carrier Fit');
            y += statusGrid(model.carrierFit, MG, y, CW);
            y += 8;
        }

        // Risk flags
        sectionLabel('Risk Flags');
        y += severityBox('Risk flags · ranked', model.riskMarkers, MG, y, CW);
        y += 8;

        // Coverage at a glance — home #1 only
        sectionLabel('Coverage at a Glance');
        y += ratioBar(model.coverageRatios, MG, y, CW);
        y += 8;

        // Action items — top 5 only on page 1
        sectionLabel('Action Items');
        y += checklist(model.actionItems, MG, y, CW, 5);
        if (model.actionItems.length > 5) {
            doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
            setColor('setTextColor', PALETTE.MID);
            doc.text(`+ ${model.actionItems.length - 5} more in the appendix`, MG, y + 4);
            doc.setFont('helvetica', 'normal');
            y += 12;
        }

        // Force the detail phase onto page 2. Even if the snapshot phase
        // bailed early on every primitive (text-only mock), the addPage call
        // is guaranteed by jsPDF's mock surface — see test stub at
        // tests/intake-v2.test.js:413.
        doc.addPage();
        y = MG;

        // ════════════════════════════════════════════════════════════════════
        //  ③ APPLICANT INFO
        // ════════════════════════════════════════════════════════════════════
        sectionLabel('Applicant');
        kvRow([
            ['Full Name',     clientName],
            ['Date of Birth', fmtDate(a.dob)],
            ['Gender',        a.gender],
            ['Marital',       a.maritalStatus],
            ['Phone',         a.phone],
            ['Email',         a.email],
            ['Occupation',    a.occupation],
            ['Industry',      a.industry],
            ['Employer',      a.employerName],
            ['Yrs Employed',  a.yearsEmployed],
            ['Education',     a.education],
            ['SSN',           a.ssn ? '••••' + String(a.ssn).slice(-4) : ''],
        ], 3);

        if (v2.coApplicant && v2.coApplicant.present) {
            const c = v2.coApplicant;
            subHeader('Co-Applicant');
            kvRow([
                ['Full Name',     [c.prefix, c.firstName, c.lastName, c.suffix].filter(Boolean).join(' ')],
                ['Relationship', c.relationship],
                ['Date of Birth', fmtDate(c.dob)],
                ['Gender',        c.gender],
                ['Marital',       c.maritalStatus],
                ['Phone',         c.phone],
                ['Email',         c.email],
                ['Occupation',    c.occupation],
                ['Industry',      c.industry],
                ['Education',     c.education],
            ], 3);
        }

        // ════════════════════════════════════════════════════════════════════
        //  ④ ADDRESS
        // ════════════════════════════════════════════════════════════════════
        sectionLabel('Address');
        kvRow([
            ['Mailing',          fullAddress],
            ['County',           addr.county],
            ['Years at Address', addr.yearsAt],
        ], 2);
        if (addr.previous && (addr.previous.street || addr.previous.city)) {
            subHeader('Previous Address');
            kvRow([
                ['Street', addr.previous.street],
                ['City',   addr.previous.city],
                ['State',  addr.previous.state],
                ['ZIP',    addr.previous.zip],
            ], 3);
        }

        // ════════════════════════════════════════════════════════════════════
        //  ⑤ OPERATORS (drivers)
        // ════════════════════════════════════════════════════════════════════
        if (operators.length) {
            sectionLabel(`Operators (${operators.length})`);
            operators.forEach((op, i) => {
                const dl = op.dl || {};
                const name = `#${i + 1}  ${[op.firstName, op.lastName].filter(Boolean).join(' ') || 'Operator'}`;
                const flags = [];
                if (op.isPrimaryApplicant) flags.push('Primary');
                if (op.isCoApplicant)      flags.push('Co-Applicant');
                if (op.sr22Required)       flags.push('SR-22 / FR-44');
                if (op.licenseSuspended5y) flags.push('Suspended 5y');
                if (op.goodStudent)        flags.push('Good Student');
                if (op.distantStudent)     flags.push('Distant Student');
                if (op.matureDriver)       flags.push('Mature');
                if (op.defensiveDriving)   flags.push('DDC');
                assetCard(name + (flags.length ? '   ·   ' + flags.join(' · ') : ''), [
                    ['DOB',          fmtDate(op.dob)],
                    ['Relationship', op.relationship],
                    ['Gender',       op.gender],
                    ['Marital',      op.maritalStatus],
                    ['Occupation',   op.occupation],
                    ['Education',    op.education],
                    ['DL Number',    dl.num],
                    ['DL State',     dl.state],
                    ['DL Status',    dl.status],
                    ['Yrs Auto',     dl.yearsAuto],
                    ['Yrs Boat',     dl.yearsBoat],
                    ['Yrs RV',       dl.yearsRV],
                    ['Age Licensed', dl.ageLicensed],
                    ['DDC Date',     fmtDate(op.defensiveDrivingAt)],
                    ['MVR Status',   op.mvrStatus],
                ]);
            });

            // ── Operator-asset assignment matrix (compact cross-reference) ─
            // Builds a Map<operatorId, Map<assetKey, 'P'|'A'>> from all
            // primary/additional operator links across autos, boats, and RVs.
            const assignments = new Map();
            const assetCols = [];
            const addAsset = (prefix, idx, item) => {
                const key = `${prefix}${idx + 1}`;
                const labelParts = [key, item.year, item.make].filter(Boolean);
                assetCols.push({ key, label: labelParts.join(' ') });
                const setRole = (opId, role) => {
                    if (!opId) return;
                    if (!assignments.has(opId)) assignments.set(opId, new Map());
                    const m = assignments.get(opId);
                    // Primary wins over Additional if both are set somehow
                    if (!m.has(key) || m.get(key) === 'A') m.set(key, role);
                };
                setRole(item.primaryOperatorId, 'P');
                (item.additionalOperatorIds || []).forEach(opId => setRole(opId, 'A'));
            };
            autos.forEach((a, i) => addAsset('A', i, a));
            boats.forEach((b, i) => addAsset('B', i, b));
            rvs.forEach((r, i)   => addAsset('R', i, r));
            if (assetCols.length) {
                sectionLabel('Operator Assignments');
                y += operatorAssignmentGrid(operators, assetCols, assignments, MG, y, CW);
                y += 6;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  ⑥ HOMES
        // ════════════════════════════════════════════════════════════════════
        if (homes.length) {
            sectionLabel(`Homes (${homes.length})`);
            homes.forEach((h, i) => {
                const hz = h.hazards || {};
                const sys = h.systems || {};
                const roof = h.roof || {};
                const cov = h.coverages || {};
                const end = h.endorsements || {};
                const mort = h.mortgageCompany || {};
                // Endorsements + hazard flags are kept as arrays so they can
                // render as pillRow chips after the home's main kv grid.
                const endorsementsListArr = [
                    end.waterBackup && 'Water Backup',
                    end.equipmentBreakdown && 'Equipment Breakdown',
                    end.serviceLine && 'Service Line',
                    end.scheduledProperty && 'Scheduled Property',
                    end.ordinanceLaw && 'Ordinance/Law',
                    end.identityTheft && 'Identity Theft',
                ].filter(Boolean);
                const hazardFlagsArr = [
                    hz.pool && 'Pool',
                    hz.trampoline && 'Trampoline',
                    hz.woodStove && 'Wood/Pellet Stove',
                    hz.businessOnPremises && 'Business on Premises',
                ].filter(Boolean);

                const title = `Home #${i + 1}` + (h.address ? `  ·  ${h.address}` : '');
                assetCard(title, [
                    ['Year Built',         h.yrBuilt],
                    ['Square Feet',        h.sqFt],
                    ['Lot Size',           h.lotSize],
                    ['Dwelling Type',      h.dwellingType],
                    ['Dwelling Use',       h.dwellingUsage],
                    ['Occupancy',          h.occupancyType],
                    ['Stories',            h.numStories],
                    ['Occupants',          h.numOccupants],
                    ['Bedrooms',           h.bedrooms],
                    ['Full Baths',         h.fullBaths],
                    ['Half Baths',         h.halfBaths],
                    ['Construction',       h.construction],
                    ['Exterior',           h.exterior],
                    ['Foundation',         h.foundation],
                    ['Garage',             [h.garage && h.garage.type, h.garage && h.garage.spaces && `${h.garage.spaces} sp`].filter(Boolean).join(' · ')],
                    ['Roof',               [roof.type, roof.shape, roof.yr && `yr ${roof.yr}`].filter(Boolean).join(' · ')],
                    ['Heating',            sys.heatingType],
                    ['Cooling',            sys.coolingType],
                    ['Plumbing Yr',        sys.plumbingYr],
                    ['Electrical Yr',      sys.electricalYr],
                    ['Protection Class',   hz.protectionClass],
                    ['Fire Station',       hz.fireStationDist && `${hz.fireStationDist} mi`],
                    ['Hydrant',            hz.fireHydrantFeet && `${hz.fireHydrantFeet} ft`],
                    ['Alarms',             hz.alarms],
                    ['Dogs',               hz.dogs],
                    ['Purchase Date',      fmtDate(h.purchaseDate)],
                    ['Cov A — Dwelling',   fmtMoney(cov.dwellingA)],
                    ['Cov B — Other',      fmtMoney(cov.otherStructuresB)],
                    ['Cov C — Personal',   fmtMoney(cov.personalPropertyC)],
                    ['Cov D — Loss of Use',fmtMoney(cov.lossOfUseD)],
                    ['Cov E — Liability',  fmtMoney(cov.liabilityE)],
                    ['Cov F — Med Pay',    fmtMoney(cov.medPayF)],
                    ['AOP Deductible',     fmtMoney(cov.deductible)],
                    ['Wind/Hail Ded',      cov.windHailDeductible],
                    ['Settlement',         cov.replacementType],
                    ['Mortgagee',          mort.name],
                    ['Loan #',             mort.loanNumber],
                    ['Mort Address',       mort.address],
                ]);

                // Hazards + endorsements rendered as pill rows below the card
                // body so the agent's eye can scan them as discrete badges
                // rather than parsing a comma-separated text run.
                if (hazardFlagsArr.length) {
                    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text('HAZARDS', MG + 2, y + 4);
                    y += 8;
                    y += pillRow(hazardFlagsArr, MG + 2, y, CW - 4, { filled: true });
                    y += 4;
                }
                if (endorsementsListArr.length) {
                    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text('ENDORSEMENTS', MG + 2, y + 4);
                    y += 8;
                    y += pillRow(endorsementsListArr, MG + 2, y, CW - 4, { filled: true });
                    y += 4;
                }
                if (h.notes) {
                    doc.setFontSize(8.5); doc.setFont('helvetica', 'italic');
                    setColor('setTextColor', PALETTE.MID);
                    const noteLines = has(doc, 'splitTextToSize') ? doc.splitTextToSize(String(h.notes), CW - 8) : [String(h.notes)];
                    noteLines.forEach(line => { need(11); doc.text(line, MG + 4, y + 4); y += 11; });
                    doc.setFont('helvetica', 'normal');
                    y += 4;
                }
            });
        }

        // ════════════════════════════════════════════════════════════════════
        //  ⑦ AUTOS
        // ════════════════════════════════════════════════════════════════════
        if (autos.length) {
            sectionLabel(`Autos (${autos.length})`);
            autos.forEach((v, i) => {
                const primary = operators.find(o => o.id === v.primaryOperatorId);
                const adds = (v.additionalOperatorIds || []).map(id => operators.find(o => o.id === id))
                    .filter(Boolean)
                    .map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim())
                    .join(', ');
                const lh = v.lienHolder || {};
                const cov = v.coverages || {};
                const title = `Auto #${i + 1}  ·  ${[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}`;
                assetCard(title, [
                    ['VIN',           v.vin],
                    ['License Plate', [v.licensePlate, v.plateState].filter(Boolean).join(' / ')],
                    ['Garaging ZIP',  v.garagingZip],
                    ['Use',           v.useType],
                    ['Annual Miles',  v.annualMiles],
                    ['One-Way Miles', v.oneWayMiles],
                    ['Days/Week',     v.daysPerWeek],
                    ['Ownership',     v.ownership],
                    ['Anti-Theft',    v.antiTheftDevice],
                    ['Purchase Date', fmtDate(v.purchaseDate)],
                    ['Original Owner',v.originalOwner ? 'Yes' : ''],
                    ['Damage',        v.existingDamage && v.existingDamage !== 'None' ? v.existingDamage : ''],
                    ['Primary Driver', primary ? `${primary.firstName || ''} ${primary.lastName || ''}`.trim() : ''],
                    ['Additional',    adds],
                    ['Liability',     cov.liab],
                    ['Coll Ded',      cov.collDed],
                    ['Comp Ded',      cov.compDed],
                    ['UM/UIM',        cov.umuim],
                    ['Med Pay',       cov.medpay],
                    ['Towing',        cov.towingDed],
                    ['Rental',        cov.rentalDed],
                    ['Lien Holder',   lh.name],
                    ['Loan/Lease #',  lh.loanNumber],
                    ['Lien Address',  lh.address],
                ]);
            });
        }

        // ════════════════════════════════════════════════════════════════════
        //  ⑧ BOATS / PWC
        // ════════════════════════════════════════════════════════════════════
        if (boats.length) {
            sectionLabel(`Boats / PWC (${boats.length})`);
            boats.forEach((b, i) => {
                const primary = operators.find(o => o.id === b.primaryOperatorId);
                const adds = (b.additionalOperatorIds || []).map(id => operators.find(o => o.id === id))
                    .filter(Boolean)
                    .map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim())
                    .join(', ');
                const cov = b.coverages || {};
                const lh = b.lienHolder || {};
                const usage = [
                    b.usage && b.usage.pleasure && 'Pleasure',
                    b.usage && b.usage.rental && 'Rented',
                    b.usage && b.usage.charter && 'Charter',
                    b.usage && b.usage.commercial && 'Commercial',
                ].filter(Boolean).join(', ');
                const docs = [
                    b.docs && b.docs.billOfSale && 'Bill of sale',
                    b.docs && b.docs.dealerAppraisal && 'Dealer appraisal',
                    b.docs && b.docs.photos && 'Photos',
                    b.docs && b.docs.marineSurvey && 'Marine survey',
                ].filter(Boolean).join(', ');
                const trailer = b.trailer ? [b.trailer.year, b.trailer.make,
                    b.trailer.capacityLbs && `${b.trailer.capacityLbs} lbs`,
                    b.trailer.axles && `${b.trailer.axles} axles`].filter(Boolean).join(' · ') : '';
                const title = `${b.kind === 'pwc' ? 'PWC' : 'Boat'} #${i + 1}  ·  ${[b.year, b.make, b.model].filter(Boolean).join(' ') || 'Boat'}`;
                assetCard(title, [
                    ['Length (ft)',     b.length],
                    ['HIN',             b.hin],
                    ['Hull Material',   b.hullMaterial],
                    ['Hull Design',     b.hullDesign],
                    ['Propulsion',      b.propulsion],
                    ['Engines',         b.engineCount],
                    ['Total HP',        b.totalHP],
                    ['Max Speed',       b.maxSpeed && `${b.maxSpeed} mph`],
                    ['Mooring ZIP',     b.mooringZip],
                    ['Waters',          b.navigationWaters],
                    ['Lay-Up Months',   b.layUpMonths],
                    ['Market Value',    fmtMoney(b.marketValue)],
                    ['Purchase Price',  fmtMoney(b.purchasePrice)],
                    ['Add\'l Equipment',fmtMoney(b.addlEquipmentValue)],
                    ['Modifications',   b.modifications],
                    ['Trailer',         trailer],
                    ['Trailer Value',   fmtMoney(b.trailer && b.trailer.value)],
                    ['Docs on File',    docs],
                    ['Usage',           usage],
                    ['Primary',         primary ? `${primary.firstName || ''} ${primary.lastName || ''}`.trim() : ''],
                    ['Additional',      adds],
                    ['Hull Settlement', cov.hullValueType],
                    ['Liability',       fmtMoney(cov.liabilityLimit)],
                    ['Deductible',      fmtMoney(cov.deductible)],
                    ['Med Pay',         fmtMoney(cov.medPay)],
                    ['Uninsured Boater',fmtMoney(cov.umBoater)],
                    ['Fuel Spill',      cov.fuelSpillIncluded ? 'Yes' : ''],
                    ['Personal Effects',fmtMoney(cov.personalEffects)],
                    ['Lien Holder',     lh.name],
                    ['Loan #',          lh.loanNumber],
                    ['Lien Address',    lh.address],
                ]);
            });
        }

        // ════════════════════════════════════════════════════════════════════
        //  ⑨ RVs
        // ════════════════════════════════════════════════════════════════════
        if (rvs.length) {
            sectionLabel(`RVs (${rvs.length})`);
            rvs.forEach((r, i) => {
                const primary = operators.find(o => o.id === r.primaryOperatorId);
                const adds = (r.additionalOperatorIds || []).map(id => operators.find(o => o.id === id))
                    .filter(Boolean)
                    .map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim())
                    .join(', ');
                const cov = r.coverages || {};
                const lh = r.lienHolder || {};
                const flags = [];
                if (r.fullTimer)        flags.push('Full-timer');
                if (r.stationary)       flags.push('Stationary');
                if (r.rentalCharter)    flags.push('Rented/Chartered');
                if (r.totalLossReplacementRequested) flags.push('Total Loss Replacement');
                const title = `RV #${i + 1}  ·  ${[r.year, r.make, r.model].filter(Boolean).join(' ') || 'RV'}  ·  Class ${r.class || '?'}`;
                assetCard(title + (flags.length ? '   ·   ' + flags.join(' · ') : ''), [
                    ['VIN',             r.vin],
                    ['Length (ft)',     r.length],
                    ['Garaging ZIP',    r.garagingZip],
                    ['Market Value',    fmtMoney(r.marketValue)],
                    ['Purchase Price',  fmtMoney(r.purchasePrice)],
                    ['Add\'l Equipment',fmtMoney(r.addlEquipmentValue)],
                    ['Primary',         primary ? `${primary.firstName || ''} ${primary.lastName || ''}`.trim() : ''],
                    ['Additional',      adds],
                    ['Comp Ded',        fmtMoney(cov.compDeductible)],
                    ['Coll Ded',        fmtMoney(cov.collDeductible)],
                    ['Liability',       cov.liabilityLimit],
                    ['Vacation Liab',   cov.vacationLiability ? 'Yes' : ''],
                    ['UM/UIM',          cov.umuim],
                    ['Med Pay',         fmtMoney(cov.medPay)],
                    ['Personal Effects',fmtMoney(cov.personalEffects)],
                    ['Awning Damage',   cov.awningDamage ? 'Yes' : ''],
                    ['Emergency Exp',   cov.emergencyExpense ? 'Yes' : ''],
                    ['Lien Holder',     lh.name],
                    ['Loan #',          lh.loanNumber],
                    ['Lien Address',    lh.address],
                ]);
            });
        }

        // ════════════════════════════════════════════════════════════════════
        //  ⑩ PRIOR INSURANCE + DISCOUNTS + AFFINITY
        // ════════════════════════════════════════════════════════════════════
        sectionLabel('Prior Insurance, Discounts, Affinity');
        const pi = v2.priorInsurance || {};
        const dc = v2.discounts || {};
        const priorRows = [];
        if (pi.continuous)         priorRows.push(['Continuous Cov.', pi.continuous]);
        if (pi.continuousMonths)   priorRows.push(['Continuous Mo.', pi.continuousMonths]);
        ['home', 'auto', 'boat', 'rv'].forEach(line => {
            const p = pi[line] || {};
            if (p.carrier || p.exp) {
                priorRows.push([`Prior ${line[0].toUpperCase()}${line.slice(1)}`,
                    [p.carrier, p.exp && `exp ${fmtDate(p.exp)}`, p.limits].filter(Boolean).join(' · ')]);
            }
        });
        if (priorRows.length) kvRow(priorRows, 2);

        const discList = [];
        if (dc.homeowner)                          discList.push('Homeowner');
        if (dc.safetyCourse && dc.safetyCourse.auto) discList.push('Defensive Driver');
        if (dc.safetyCourse && dc.safetyCourse.boat) discList.push('Boater Safety');
        if (dc.safetyCourse && dc.safetyCourse.rv)   discList.push('RV Safety');
        const affList = [];
        if (dc.affinity && dc.affinity.usaa)     affList.push('USAA');
        if (dc.affinity && dc.affinity.hog)      affList.push('HOG');
        if (dc.affinity && dc.affinity.uscgAux)  affList.push('USCG Aux');
        if (dc.affinity && dc.affinity.usps)     affList.push('USPS');
        if (discList.length || affList.length) {
            kvRow([
                ['Discounts', discList.join(', ')],
                ['Affinity',  affList.join(', ')],
            ], 1);
        }

        // ════════════════════════════════════════════════════════════════════
        //  ⑪ HISTORY
        // ════════════════════════════════════════════════════════════════════
        sectionLabel('Loss & Violation History (35 mo)');
        const hist = v2.history || {};
        if (hist.hasCleanHistory) {
            kvRow([['Status', 'Clean record (all operators)']], 1);
        } else {
            // Merge losses + violations into a single chronological event
            // stream with operator names resolved up front, then visualize
            // via timelineStrip. The flat-list fallback still emits inside
            // timelineStrip when `rect` is unavailable, so the JSDOM mock
            // gets readable text rows.
            const events = [];
            (hist.losses || []).forEach(L => {
                const op = operators.find(o => o.id === L.operatorId);
                events.push({
                    date: L.date,
                    type: L.type + (L.amount ? ` ($${L.amount})` : '') + (L.asset ? ` · ${L.asset}` : ''),
                    operatorName: op ? `${op.firstName || ''} ${op.lastName || ''}`.trim() : '',
                    severity: 'med',
                });
            });
            (hist.violations || []).forEach(V => {
                const op = operators.find(o => o.id === V.operatorId);
                events.push({
                    date: V.date,
                    type: V.type,
                    operatorName: op ? `${op.firstName || ''} ${op.lastName || ''}`.trim() : '',
                    severity: 'low',
                });
            });
            events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 35, 1);
            y += timelineStrip(events, start, now, MG, y, CW);
            y += 4;
        }

        // ════════════════════════════════════════════════════════════════════
        //  ⑫ PRODUCER ACTION ITEMS (full list — snapshot truncates to 5)
        // ════════════════════════════════════════════════════════════════════
        // The snapshot on page 1 caps at 5 items. This appendix surfaces the
        // complete merged list (deferred + derived + talk-track) for the
        // agent's follow-up reference. Reuses the same `model.actionItems`
        // computed at the top of the builder so the two views never drift.
        if (model.actionItems && model.actionItems.length) {
            sectionLabel(`Producer Action Items — Full List (${model.actionItems.length})`);
            y += checklist(model.actionItems, MG, y, CW, model.actionItems.length);
        }
        if (v2.notes && v2.notes.freeText) {
            sectionLabel('Agent Notes');
            doc.setFontSize(10); doc.setFont('helvetica', 'normal');
            setColor('setTextColor', PALETTE.INK);
            const lines = has(doc, 'splitTextToSize') ? doc.splitTextToSize(String(v2.notes.freeText), CW) : [String(v2.notes.freeText)];
            for (const line of lines) {
                need(13);
                doc.text(line, MG, y + 4);
                y += 12;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        //  PAGE FOOTER ON EVERY PAGE
        // ════════════════════════════════════════════════════════════════════
        if (has(doc, 'getNumberOfPages') && has(doc, 'setPage')) {
            try {
                const total = doc.internal.getNumberOfPages();
                for (let i = 1; i <= total; i++) {
                    doc.setPage(i);
                    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
                    setColor('setTextColor', PALETTE.MID);
                    setColor('setDrawColor', PALETTE.RULE);
                    doc.setLineWidth(0.3);
                    doc.line(MG, PAGE_H - 22, PAGE_W - MG, PAGE_H - 22);
                    doc.text('Altech Insurance · Personal Intake', MG, PAGE_H - 12);
                    // Page 1 is the underwriting Snapshot; pages 2+ are the
                    // dense detail dossier. Calling out "Snapshot" on the
                    // footer makes it easy for an agent flipping back-and-
                    // forth in a printed packet to know which view they're
                    // looking at.
                    const pageText = i === 1
                        ? `Snapshot · Page 1 of ${total}`
                        : `Page ${i} of ${total}`;
                    const pageTextW = has(doc, 'getTextWidth') ? doc.getTextWidth(pageText) : 0;
                    doc.text(pageText, (PAGE_W - pageTextW) / 2, PAGE_H - 12);
                    const tsText = `${ref}  ·  ${fmtDateTime(new Date())}`;
                    const tsW = has(doc, 'getTextWidth') ? doc.getTextWidth(tsText) : 0;
                    doc.text(tsText, PAGE_W - MG - tsW, PAGE_H - 12);
                }
            } catch (_) { /* paginated footer is non-critical */ }
        }

        return doc;
    }

    function pdfFilename(v2) {
        v2 = v2 || (window.IntakeV2 && window.IntakeV2.data) || {};
        const a = v2.applicant || {};
        const name = [a.firstName, a.lastName].filter(Boolean).join('_') || 'IntakeV2';
        const date = new Date().toISOString().slice(0, 10);
        return `${name}_intake_${date}.pdf`;
    }

    window.IntakeV2PDFBuilder = { buildIntakeV2PDF, pdfFilename };

})();
