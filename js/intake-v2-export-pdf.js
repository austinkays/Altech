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
            const mv = parseFloat(b.marketValue);
            if (age !== null && age > 30 && Number.isFinite(mv) && mv > 30000) {
                out.push({ severity: 'med', text: `Boat #${i+1}: ${age} yrs old, $${Math.round(mv).toLocaleString()}` });
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
                    // Single-letter labels (B/C/D) so they fit inside narrow
                    // segments. The "Cov A · $X" header above already names
                    // the coverages; agents read "Cov A" once, then can
                    // pattern-match B/C/D below.
                    segments: [
                        { key: 'B', label: 'B', amount: seg('otherStructuresB'), ratio: seg('otherStructuresB') / A },
                        { key: 'C', label: 'C', amount: seg('personalPropertyC'), ratio: seg('personalPropertyC') / A },
                        { key: 'D', label: 'D', amount: seg('lossOfUseD'), ratio: seg('lossOfUseD') / A },
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
    //
    // opts.layout:
    //   - 'summary'    (default) — the underwriting snapshot + dense detail
    //                  cards used as v2's primary export since PR #110.
    //   - 'factfinder' — a transcription-oriented layout whose section order
    //                  mirrors the EZLynx Personal Lines screen flow
    //                  (js/ezlynx-tool.js formFields[] lines 59-86). Agents
    //                  read top-to-bottom while filling EZLynx / HawkSoft.
    //
    // Both layouts share the header, hero card, compute helpers, visual
    // primitives, and footer. Only the body phase changes.
    async function buildIntakeV2PDF(v2, opts) {
        opts = opts || {};
        const layout = (opts.layout === 'factfinder') ? 'factfinder' : 'summary';
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
            // 3-col mode uses long EZLynx labels ("UM PROPERTY DAMAGE",
            // "CREDIT CHECK AUTH") that need more room than 2-col labels.
            // Trade 6 extra points of label width for slightly tighter values.
            const labelW = colW * (cols >= 3 ? 0.48 : 0.42);
            const valueW = colW - labelW - 6;
            const baseRowH = 13;
            const lineH = 11;
            const BASE_VAL_PT = 9;
            const MIN_VAL_PT = 6.5;

            // Pre-flight each value: when it's a single uninterruptible token
            // (e.g. an email "name@gmail.com" — no spaces) wider than the cell,
            // jsPDF's splitTextToSize will hack-split it mid-character, which
            // is exactly the "austinkays@gmail.co / m" wrap producers were
            // seeing. Auto-shrink the font for that cell down to a floor;
            // only split as a last resort.
            function fitValueCell(str) {
                const text = String(str);
                if (!has(doc, 'getStringUnitWidth')) {
                    return { lines: [text], pt: BASE_VAL_PT };
                }
                const hasSpace = /\s/.test(text.trim());
                const measure = (pt) => doc.getStringUnitWidth(text) * pt;
                // If it fits at base size, take the fast path.
                if (measure(BASE_VAL_PT) <= valueW) return { lines: [text], pt: BASE_VAL_PT };
                // Single-token long value: shrink to fit one line.
                if (!hasSpace) {
                    for (let pt = BASE_VAL_PT - 0.5; pt >= MIN_VAL_PT; pt -= 0.5) {
                        if (measure(pt) <= valueW) return { lines: [text], pt };
                    }
                    // Still too wide even at floor — fall through to split.
                }
                doc.setFontSize(BASE_VAL_PT);
                const split = has(doc, 'splitTextToSize') ? doc.splitTextToSize(text, valueW) : [text];
                return { lines: split, pt: BASE_VAL_PT };
            }

            const rows = [];
            for (let i = 0; i < filled.length; i += cols) rows.push(filled.slice(i, i + cols));

            rows.forEach((row, ri) => {
                doc.setFontSize(BASE_VAL_PT);
                let maxLines = 1;
                const cache = row.map(([, value]) => {
                    const fit = fitValueCell(value);
                    if (fit.lines.length > maxLines) maxLines = fit.lines.length;
                    return fit;
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
                    // Label font shrinks at higher column counts so long
                    // EZLynx-style labels like "CREDIT CHECK AUTH" or "UIM
                    // BODILY INJURY" fit inside the label column without
                    // overlapping the value text.
                    const labelFontSize = cols >= 3 ? 6.5 : 7.5;
                    doc.setFontSize(labelFontSize); doc.setFont('helvetica', 'normal');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text(String(label).toUpperCase(), x + 2, y + 7);

                    const fit = cache[ci];
                    doc.setFontSize(fit.pt); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.INK);
                    fit.lines.forEach((line, li) => {
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
                // Inline label tiered by segment width so even tiny "Cov B at
                // 5%" segments get a visible letter. Without this, agents see
                // a mystery dark bar and have to infer which Cov is which.
                //   >=56pt → "B 10%" full
                //   >=24pt → "B"     letter only
                //   else   → "B"     in small font, centered vertically
                if (segW >= 56) {
                    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.WHITE);
                    doc.text(`${seg.label} ${Math.round(ratio * 100)}%`, cursorX + 4, barY + 10);
                } else if (segW >= 24) {
                    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.WHITE);
                    doc.text(`${seg.label}`, cursorX + 4, barY + 10);
                } else if (segW >= 10) {
                    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.WHITE);
                    doc.text(`${seg.label}`, cursorX + 2, barY + 10);
                }
                cursorX += segW;
            });

            // Hang $amount labels under each segment, center-aligned to the
            // segment middle. Skip segments narrower than ~22pt where the
            // amount can't fit without overlapping the next segment's amount.
            cursorX = barX;
            model.segments.forEach((seg, idx) => {
                const ratio = Math.min(Math.max(seg.ratio || 0, 0), 1);
                if (ratio <= 0) return;
                const segW = ratio * barW;
                doc.setFontSize(7); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.MID);
                const amountStr = `$${Math.round(seg.amount).toLocaleString()}`;
                const amountW = has(doc, 'getTextWidth') ? doc.getTextWidth(amountStr) : amountStr.length * 3.6;
                // For narrow segments fall back to abbreviated thousands form
                // ($21k) so we still surface the dollar size without crashing
                // into the next segment's label.
                const tooNarrow = segW < amountW + 6;
                const display = tooNarrow ? `$${Math.round(seg.amount / 1000)}k` : amountStr;
                const displayW = tooNarrow
                    ? (has(doc, 'getTextWidth') ? doc.getTextWidth(display) : display.length * 3.6)
                    : amountW;
                const tx = cursorX + Math.max(2, (segW - displayW) / 2);
                doc.text(display, tx, barY + BAR_H + 8);
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
            // Truncate header labels to whatever fits the column at 7pt bold.
            // Old hardcoded 9-char cap turned "A1 2019 Toyota" into "A1 2019 T"
            // even when the cell had room for the whole label.
            const cellTextW = colW - 8;
            assets.forEach((a, i) => {
                const cx = x + NAME_W + i * colW;
                let label = a.label;
                if (has(doc, 'getTextWidth')) {
                    while (label.length > 3 && doc.getTextWidth(label) > cellTextW) {
                        label = label.slice(0, -1);
                    }
                } else if (label.length > 18) {
                    label = label.slice(0, 18);
                }
                doc.text(label, cx + 4, yy + 11);
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

        // sectionBand — used by the fact-finder body. A full-width filled
        // band carrying "§N · TITLE" so each section boundary reads as a
        // distinct beat for the agent transcribing into EZLynx/HawkSoft.
        // Returns consumed height (22pt by default).
        function sectionBand(num, title, x, yy, w) {
            const BAND_H = 20;
            if (!has(doc, 'rect')) {
                // Text-only fallback: section label as a short line of text.
                doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                setColor('setTextColor', PALETTE.INK);
                doc.text(`§${num} ${title.toUpperCase()}`, x, yy + 12);
                doc.setFont('helvetica', 'normal');
                return BAND_H;
            }
            setColor('setFillColor', PALETTE.FILL);
            fillRect(x, yy, w, BAND_H);
            // Accent strip — 3pt dark bar on the left edge for emphasis
            setColor('setFillColor', PALETTE.ACCENT);
            fillRect(x, yy, 3, BAND_H);
            // Bottom rule under the band so the eye sees a clean break
            setColor('setDrawColor', PALETTE.LIGHT);
            doc.setLineWidth(0.4);
            doc.line(x, yy + BAND_H, x + w, yy + BAND_H);

            // Section number, then title in bold caps
            doc.setFontSize(8); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.MID);
            doc.text(`§${num}`, x + 10, yy + 13);
            doc.setFontSize(10);
            setColor('setTextColor', PALETTE.INK);
            doc.text(String(title || '').toUpperCase(), x + 32, yy + 13);
            doc.setFont('helvetica', 'normal');
            doc.setLineWidth(0.3);
            return BAND_H;
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

        // Body branches on layout. Summary mode keeps the existing snapshot
        // + dense detail dossier. Fact-finder mode renders a compressed cover
        // then sections §1-§18 in EZLynx Personal Lines app order (see
        // js/ezlynx-tool.js formFields[]). Footer (below the branch) runs in
        // both modes.
        if (layout === 'summary') {

        // ════════════════════════════════════════════════════════════════════
        //  ② SNAPSHOT — keystat row + carrier fit
        // ════════════════════════════════════════════════════════════════════
        // The dense risk / coverage / action-items panels were dropped: they
        // either restated information the agent already has (positives as
        // "severity", a single-Cov-A bar at 100%) or were stale by export time
        // (talk-track suggestions belong in the live intake rail). What stays
        // is the at-a-glance carrier fit grid; the detail dossier follows on
        // the same page if there's headroom, otherwise next page.

        // Keystat row — 4 compact KPI cells
        const keystatItems = [
            { label: 'Operators',     value: String(model.productCounts.operators || 0) },
            { label: 'Yrs at Addr',   value: model.yearsAtAddress ? String(model.yearsAtAddress) : '—' },
            { label: 'Continuous',    value: model.continuous || '—' },
            { label: 'Lines',         value: model.qChips.join(' · ') || '—' },
        ];
        y += keystatRow(keystatItems, MG, y, CW);
        y += 8;

        // Carrier fit grid — the only "judgement" block on the snapshot. Risk
        // flags / coverage ratio / action items were dropped here: positives
        // shown as "severity" reads as noise, a single-Cov-A bar at 100% adds
        // no information, and the talk-track action-items belong in the live
        // intake rail, not a static PDF. The flow continues straight into the
        // detail dossier on the same page when there's headroom.
        if (model.carrierFit.length) {
            sectionLabel('Carrier Fit');
            y += statusGrid(model.carrierFit, MG, y, CW);
            y += 10;
        }

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
        //  ⑫ FOLLOW-UP — deferred fields only ("Ask Later" agent commitments)
        // ════════════════════════════════════════════════════════════════════
        // Talk-track suggestions ("confirm name pronunciation", "ask about
        // Harley Owners Group", etc.) are designed for the live intake rail,
        // not a static PDF — they're stale by the time the agent reads this.
        // The same is true for derived risk prompts (those repeat the risk
        // marker text). Only explicit deferred-by-agent commitments earn space
        // in the export.
        const deferredFollowUps = (model.actionItems || []).filter(it => it.source === 'deferred');
        if (deferredFollowUps.length) {
            sectionLabel(`Follow-up Items (${deferredFollowUps.length})`);
            y += checklist(deferredFollowUps, MG, y, CW, deferredFollowUps.length);
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

        }   // ← end of `if (layout === 'summary')` body branch

        // ════════════════════════════════════════════════════════════════════
        //  FACT FINDER BODY — sections §1-§18 in EZLynx app order
        // ════════════════════════════════════════════════════════════════════
        // Source of truth for section + field order: js/ezlynx-tool.js
        // `formFields[]` (lines 59-86). Field labels mirror that array's
        // `keyMap` so an agent transcribing into EZLynx pattern-matches the
        // PDF text to the EZLynx field label without a mental translation.
        //
        // HawkSoft CMSMTF has no canonical UI screen order (most fields land
        // in `gen_sClientMiscData[*]` catch-alls), so we organize by EZLynx
        // primary and the HawkSoft agent still gets a sensible top-to-bottom
        // read.
        if (layout === 'factfinder') {
            const ff_homes = homes;
            const ff_autos = autos;
            const ff_boats = boats;
            const ff_rvs = rvs;
            const ff_operators = operators;
            const ff_co = v2.coApplicant || {};
            const ff_household = v2.household || {};
            const ff_pi = v2.priorInsurance || {};
            const ff_dc = v2.discounts || {};
            const ff_hist = v2.history || {};

            // ── Compressed page-1 COVER — carrier-fit only ─────────────────
            // The hero card already drew above. Snapshot's risk-flags / action-
            // items cover blocks were dropped (positives-as-severity is noise
            // and talk-track suggestions are stale by export time); fact-finder
            // mirrors that decision. Carrier fit stays because it tells the
            // agent at-a-glance which carrier to start with.

            // Carrier-fit grid (same 2x2 as summary, smaller height budget)
            if (model.carrierFit.length) {
                sectionLabel('Carrier Fit');
                y += statusGrid(model.carrierFit, MG, y, CW);
                y += 6;
            }

            // Instruction strip
            need(28);
            setColor('setFillColor', PALETTE.FILL);
            fillRect(MG, y, CW, 22);
            setColor('setFillColor', PALETTE.ACCENT);
            fillRect(MG, y, 3, 22);
            doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            setColor('setTextColor', PALETTE.INK);
            doc.text('FACT FINDER', MG + 10, y + 9);
            doc.setFontSize(8); doc.setFont('helvetica', 'normal');
            setColor('setTextColor', PALETTE.MID);
            doc.text('Numbered sections below mirror the EZLynx Personal Lines screen order — read top to bottom while filling.', MG + 10, y + 18);
            y += 26;

            // Force the body to begin on page 2
            doc.addPage();
            y = MG;

            // ── Section helpers ────────────────────────────────────────────
            let sectionCounter = 0;
            function ffSection(title) {
                sectionCounter += 1;
                need(28);
                y += sectionBand(sectionCounter, title, MG, y, CW);
                y += 6;
            }

            // Render a key/value grid but only include rows with values.
            // Wraps the existing kvRow with a "drop empties" pre-filter so
            // the fact-finder block-height stays predictable.
            function ffRow(fields, cols) {
                const filled = fields.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false);
                if (!filled.length) return;
                kvRow(filled, cols || 2);
            }

            // ── §1 APPLICANT ──────────────────────────────────────────────
            ffSection('Applicant');
            const ffPrimaryDriver = ff_operators.find(o => o.isPrimaryApplicant) || ff_operators[0];
            ffRow([
                ['Prefix',          a.prefix],
                ['First Name',      a.firstName],
                ['Middle',          a.middleName],
                ['Last Name',       a.lastName],
                ['Suffix',          a.suffix],
                ['Date of Birth',   fmtDate(a.dob)],
                ['Gender',          a.gender],
                ['Marital Status',  a.maritalStatus],
                ['Phone',           a.phone],
                ['Email',           a.email],
                ['Education',       a.education],
                ['Industry',        a.industry],
                ['Occupation',      a.occupation],
                ['Employer',        a.employerName],
                ['Yrs Employed',    a.yearsEmployed],
                ['SSN',             a.ssn ? '••• •• ' + String(a.ssn).slice(-4) : ''],
                ['License Number',  ffPrimaryDriver && ffPrimaryDriver.dl && ffPrimaryDriver.dl.num],
                ['DL State',        ffPrimaryDriver && ffPrimaryDriver.dl && ffPrimaryDriver.dl.state],
            ], 3);

            // ── §2 CO-APPLICANT ───────────────────────────────────────────
            if (ff_co.present || ff_co.firstName || ff_co.lastName) {
                ffSection('Co-Applicant');
                ffRow([
                    ['Relationship',   ff_co.relationship],
                    ['Prefix',         ff_co.prefix],
                    ['First Name',     ff_co.firstName],
                    ['Last Name',      ff_co.lastName],
                    ['Suffix',         ff_co.suffix],
                    ['Date of Birth',  fmtDate(ff_co.dob)],
                    ['Gender',         ff_co.gender],
                    ['Marital Status', ff_co.maritalStatus],
                    ['Phone',          ff_co.phone],
                    ['Email',          ff_co.email],
                    ['Education',      ff_co.education],
                    ['Industry',       ff_co.industry],
                    ['Occupation',     ff_co.occupation],
                ], 3);
            }

            // ── §3 ADDRESS ────────────────────────────────────────────────
            ffSection('Address');
            ffRow([
                ['Street',           addr.street],
                ['City',             addr.city],
                ['State',            addr.state],
                ['Zip',              addr.zip],
                ['County',           addr.county],
                ['Years at Address', addr.yearsAt],
            ], 3);
            const ff_prev = addr.previous || {};
            if (ff_prev.street || ff_prev.city) {
                doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                setColor('setTextColor', PALETTE.MID);
                doc.text('PREVIOUS ADDRESS', MG, y + 8);
                y += 12;
                ffRow([
                    ['Street', ff_prev.street],
                    ['City',   ff_prev.city],
                    ['State',  ff_prev.state],
                    ['Zip',    ff_prev.zip],
                ], 3);
            }

            // ── §4 HOUSEHOLD ──────────────────────────────────────────────
            ffSection('Household');
            ffRow([
                ['TCPA Consent',         ff_household.tcpaConsent ? 'Yes' : 'No'],
                ['Credit Check Auth',    ff_household.creditCheckAuth ? 'Yes' : 'No'],
                ['Preferred Contact',    ff_household.contactMethod],
                ['Best Time to Call',    ff_household.contactTime],
                ['Referral Source',      ff_household.referralSource],
                ['Homeownership',        ff_household.homeownership],
            ], 3);

            // ── §5 AUTO POLICY ────────────────────────────────────────────
            if (ff_autos.length) {
                ffSection('Auto Policy');
                const ff_paut = ff_pi.auto || {};
                ffRow([
                    ['Policy Term',           '6 Month'],
                    ['Effective Date',        fmtDate(ff_paut.exp || '')],
                    ['Prior Carrier',         ff_paut.carrier],
                    ['Prior Policy Term',     ff_paut.years || ''],
                    ['Prior Years w/ Carrier',ff_paut.years],
                    ['Prior Months',          ff_paut.months],
                    ['Continuous Coverage',   ff_pi.continuous],
                    ['Continuous Months',     ff_pi.continuousMonths],
                    ['Prior Expiration',      fmtDate(ff_paut.exp)],
                    ['Prior Liability Limits',ff_paut.limits],
                ], 3);
            }

            // ── §6 AUTO COVERAGE ──────────────────────────────────────────
            if (ff_autos.length) {
                ffSection('Auto Coverage');
                // Pull general from first auto's coverages — EZLynx treats most
                // limits as policy-wide with per-vehicle deductibles.
                const c0 = (ff_autos[0] && ff_autos[0].coverages) || {};
                const liab = String(c0.liab || '');
                const bipd = liab.match(/^(\d+\/\d+)\/(\d+)$/);
                const bi = bipd ? bipd[1] : liab;
                // BI per-person/per-accident is the split-limits shorthand
                // ("100/300"). PD is the third segment in thousands, so
                // "100" → "$100,000" rendered. Send EZLynx the raw dollar
                // amount it expects in the Property Damage dropdown.
                const pdK = bipd ? parseInt(bipd[2], 10) : null;
                const pdFmt = (pdK && Number.isFinite(pdK)) ? '$' + (pdK * 1000).toLocaleString() : '';
                const isWA = (addr.state || '').toUpperCase() === 'WA';
                ffRow([
                    ['Bodily Injury',       bi],
                    ['Property Damage',     pdFmt],
                    ['UM Bodily Injury',    c0.umuim],
                    ['UM Property Damage',  pdFmt],
                    ['UIM Bodily Injury',   c0.umuim],
                    ['Med Payments Auto',   fmtMoney(c0.medpay)],
                    ['Multi-Car',           ff_autos.length > 1 ? 'Yes' : ''],
                    ['Multi-Policy',        ff_homes.length ? 'Yes' : ''],
                    ['WA-PIP (state)',      isWA ? '$10,000' : ''],
                ], 3);
            }

            // ── §7 RESIDENCE ──────────────────────────────────────────────
            ffSection('Residence');
            ffRow([
                ['Num Residents', String(ff_operators.length || '')],
                ['Residence Is',  ff_household.homeownership || (ff_homes.length ? 'Own home' : '')],
            ], 2);

            // ── §8 DRIVERS ────────────────────────────────────────────────
            if (ff_operators.length) {
                ffSection('Drivers');
                ff_operators.forEach((op, i) => {
                    const dl = op.dl || {};
                    // Per-operator violations/losses count
                    const myViolations = (ff_hist.violations || []).filter(V => V.operatorId === op.id).length;
                    const myLosses = (ff_hist.losses || []).filter(L => L.operatorId === op.id).length;
                    // Date Licensed derived from DOB + yearsAuto
                    let dateLicensed = '';
                    if (op.dob && dl.yearsAuto) {
                        const m = String(op.dob).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                        const yrs = parseInt(dl.yearsAuto, 10);
                        if (m && Number.isFinite(yrs) && yrs > 0 && yrs < 100) {
                            const licYr = new Date().getFullYear() - yrs;
                            dateLicensed = `${m[2]}/${m[3]}/${licYr}`;
                        }
                    }
                    const name = `Driver #${i + 1}  ·  ${[op.firstName, op.lastName].filter(Boolean).join(' ') || 'Operator'}`;
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
                        ['First Name',     op.firstName],
                        ['Last Name',      op.lastName],
                        ['Date of Birth',  fmtDate(op.dob)],
                        ['Gender',         op.gender],
                        ['Marital Status', op.maritalStatus],
                        ['License Number', dl.num],
                        ['DL State',       dl.state],
                        ['DL Status',      dl.status],
                        ['Date Licensed',  dateLicensed],
                        ['Age Licensed',   dl.ageLicensed],
                        ['Relationship',   op.relationship],
                        ['Occupation',     op.occupation],
                        ['Industry',       op.industry],
                        ['Education',      op.education],
                        ['DDC Date',       fmtDate(op.defensiveDrivingAt)],
                        ['MVR Status',     op.mvrStatus],
                        ['Accidents',      myLosses || ''],
                        ['Violations',     myViolations || ''],
                    ]);
                });
            }

            // ── §9 VEHICLES ───────────────────────────────────────────────
            if (ff_autos.length) {
                ffSection('Vehicles');
                ff_autos.forEach((v, i) => {
                    const primary = ff_operators.find(o => o.id === v.primaryOperatorId);
                    const adds = (v.additionalOperatorIds || []).map(id => ff_operators.find(o => o.id === id))
                        .filter(Boolean)
                        .map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim())
                        .join(', ');
                    const lh = v.lienHolder || {};
                    const cov = v.coverages || {};
                    const title = `Vehicle #${i + 1}  ·  ${[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}`;
                    assetCard(title, [
                        ['Year',           v.year],
                        ['Make',           v.make],
                        ['Model',          v.model],
                        ['VIN',            v.vin],
                        ['License Plate',  v.licensePlate],
                        ['Plate State',    v.plateState],
                        ['Garaging Zip',   v.garagingZip],
                        ['Vehicle Use',    v.useType],
                        ['Annual Miles',   v.annualMiles],
                        ['One-Way Miles',  v.oneWayMiles],
                        ['Days/Week',      v.daysPerWeek],
                        ['Ownership Type', v.ownership],
                        ['Anti-Theft',     v.antiTheftDevice],
                        ['Purchase Date',  fmtDate(v.purchaseDate)],
                        ['Original Owner', v.originalOwner ? 'Yes' : ''],
                        ['Existing Damage',v.existingDamage && v.existingDamage !== 'None' ? v.existingDamage : ''],
                        ['Primary Driver', primary ? `${primary.firstName || ''} ${primary.lastName || ''}`.trim() : ''],
                        ['Additional',     adds],
                        ['Comprehensive',  cov.compDed],
                        ['Collision',      cov.collDed],
                        ['Towing',         cov.towingDed],
                        ['Rental Reimb',   cov.rentalDed],
                        ['Lien Holder',    lh.name],
                        ['Lien Address',   lh.address],
                        ['Loan / Lease #', lh.loanNumber],
                    ]);
                });
            }

            // ── §10 HOME DWELLING ─────────────────────────────────────────
            if (ff_homes.length) {
                ffSection('Home Dwelling');
                ff_homes.forEach((h, i) => {
                    const hz = h.hazards || {};
                    const sys = h.systems || {};
                    const roof = h.roof || {};
                    const title = `Home #${i + 1}` + (h.address ? `  ·  ${h.address}` : '');
                    assetCard(title, [
                        ['Year Built',         h.yrBuilt],
                        ['Dwelling Type',      h.dwellingType],
                        ['Dwelling Use',       h.dwellingUsage],
                        ['Occupancy Type',     h.occupancyType],
                        ['Stories',            h.numStories],
                        ['Construction',       h.construction],
                        ['Exterior Walls',     h.exterior],
                        ['Foundation Type',    h.foundation],
                        ['Sq Ft',              h.sqFt],
                        ['Lot Size',           h.lotSize],
                        ['Bedrooms',           h.bedrooms],
                        ['Num Full Baths',     h.fullBaths],
                        ['Num Half Baths',     h.halfBaths],
                        ['Num Occupants',      h.numOccupants],
                        ['Roof Type',          roof.type],
                        ['Roof Design',        roof.shape],
                        ['Roof Year',          roof.yr],
                        ['Heating Type',       sys.heatingType],
                        ['Cooling',            sys.coolingType],
                        ['Plumbing Yr',        sys.plumbingYr],
                        ['Electrical Yr',      sys.electricalYr],
                        ['Garage Type',        h.garage && h.garage.type],
                        ['Garage Spaces',      h.garage && h.garage.spaces],
                        ['Burglar Alarm',      hz.alarms],
                        ['Fire Detection',     hz.alarms === 'Central Station' ? 'Central' : hz.alarms],
                        ['Protection Class',   hz.protectionClass],
                        ['Feet from Hydrant',  hz.fireHydrantFeet],
                        ['Fire Station Dist',  hz.fireStationDist && `${hz.fireStationDist} mi`],
                        ['Pool',               hz.pool ? 'Yes' : 'No'],
                        ['Trampoline',         hz.trampoline ? 'Yes' : 'No'],
                        ['Wood/Pellet Stove',  hz.woodStove ? 'Yes' : 'No'],
                        ['Business On Prem',   hz.businessOnPremises ? 'Yes' : 'No'],
                        ['Dogs',               hz.dogs],
                        ['Purchase Date',      fmtDate(h.purchaseDate)],
                    ]);
                });
            }

            // ── §11 HOME COVERAGE ─────────────────────────────────────────
            if (ff_homes.length) {
                ffSection('Home Coverage');
                const ff_phome = ff_pi.home || {};
                ff_homes.forEach((h, i) => {
                    const cov = h.coverages || {};
                    const dwelling = (h.dwellingType || '').toLowerCase();
                    const policyType = dwelling.includes('condo') ? 'HO6'
                        : (h.occupancyType || '').toLowerCase().includes('tenant') ? 'HO4'
                        : 'HO3';
                    assetCard(`Home #${i + 1} Coverage`, [
                        ['Home Policy Type',          policyType],
                        ['Prior Home Carrier',        ff_phome.carrier],
                        ['Prior Policy Term',         ff_phome.years ? `${ff_phome.years} yrs` : ''],
                        ['Prior Years',               ff_phome.years],
                        ['Prior Expiration',          fmtDate(ff_phome.exp)],
                        ['Dwelling Coverage (A)',     fmtMoney(cov.dwellingA)],
                        ['Other Structures (B)',      fmtMoney(cov.otherStructuresB)],
                        ['Home Personal Property (C)',fmtMoney(cov.personalPropertyC)],
                        ['Home Loss of Use (D)',      fmtMoney(cov.lossOfUseD)],
                        ['Personal Liability (E)',    fmtMoney(cov.liabilityE)],
                        ['Medical Payments (F)',      fmtMoney(cov.medPayF)],
                        ['All Perils Deductible',     fmtMoney(cov.deductible)],
                        ['Wind Deductible',           cov.windHailDeductible],
                        ['Theft Deductible',          ''],
                        ['Settlement Type',           cov.replacementType],
                    ]);
                });
            }

            // ── §12 HOME ENDORSEMENTS (pill row) ─────────────────────────
            if (ff_homes.length) {
                const allEndorsements = [];
                ff_homes.forEach((h, i) => {
                    const end = h.endorsements || {};
                    const active = [];
                    if (end.waterBackup)        active.push('Water Backup');
                    if (end.equipmentBreakdown) active.push('Equipment Breakdown');
                    if (end.serviceLine)        active.push('Service Line');
                    if (end.scheduledProperty)  active.push('Scheduled Property');
                    if (end.ordinanceLaw)       active.push('Ordinance/Law');
                    if (end.identityTheft)      active.push('Identity Theft');
                    if (active.length) allEndorsements.push({ home: i + 1, active });
                });
                if (allEndorsements.length) {
                    ffSection('Home Endorsements');
                    allEndorsements.forEach(e => {
                        doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                        setColor('setTextColor', PALETTE.MID);
                        doc.text(`HOME #${e.home}`, MG + 2, y + 8);
                        y += 12;
                        y += pillRow(e.active, MG + 2, y, CW - 4, { filled: true });
                        y += 6;
                    });
                }
            }

            // ── §13 MORTGAGEE / LIEN HOLDERS ─────────────────────────────
            const ff_holders = [];
            ff_homes.forEach((h, i) => {
                const m = h.mortgageCompany || {};
                if (m.name) ff_holders.push({ type: 'Mortgagee', tag: `Home #${i + 1}`, name: m.name, address: m.address, loan: m.loanNumber });
            });
            ff_autos.forEach((a, i) => {
                const l = a.lienHolder || {};
                if (l.name) ff_holders.push({ type: 'Lien Payee', tag: `Auto #${i + 1}`, name: l.name, address: l.address, loan: l.loanNumber });
            });
            ff_boats.forEach((b, i) => {
                const l = b.lienHolder || {};
                if (l.name) ff_holders.push({ type: 'Lien Payee', tag: `Boat #${i + 1}`, name: l.name, address: l.address, loan: l.loanNumber });
            });
            ff_rvs.forEach((r, i) => {
                const l = r.lienHolder || {};
                if (l.name) ff_holders.push({ type: 'Lien Payee', tag: `RV #${i + 1}`, name: l.name, address: l.address, loan: l.loanNumber });
            });
            if (ff_holders.length) {
                ffSection('Mortgagee / Lien Holders');
                ff_holders.forEach(h => {
                    ffRow([
                        ['Type',     h.type],
                        ['Asset',    h.tag],
                        ['Name',     h.name],
                        ['Address',  h.address],
                        ['Loan #',   h.loan],
                    ], 3);
                });
            }

            // ── §14 BOATS & RVs ──────────────────────────────────────────
            if (ff_boats.length || ff_rvs.length) {
                ffSection('Boats & RVs');
                ff_boats.forEach((b, i) => {
                    const cov = b.coverages || {};
                    const lh = b.lienHolder || {};
                    const title = `${b.kind === 'pwc' ? 'PWC' : 'Boat'} #${i + 1}  ·  ${[b.year, b.make, b.model].filter(Boolean).join(' ') || 'Boat'}`;
                    assetCard(title, [
                        ['Year',          b.year],
                        ['Make',          b.make],
                        ['Model',         b.model],
                        ['Length',        b.length],
                        ['HIN',           b.hin],
                        ['Hull Material', b.hullMaterial],
                        ['Hull Design',   b.hullDesign],
                        ['Propulsion',    b.propulsion],
                        ['Engines',       b.engineCount],
                        ['Total HP',      b.totalHP],
                        ['Mooring ZIP',   b.mooringZip],
                        ['Waters',        b.navigationWaters],
                        ['Lay-Up Months', b.layUpMonths],
                        ['Market Value',  fmtMoney(b.marketValue)],
                        ['Hull Settlement', cov.hullValueType],
                        ['Liability',     fmtMoney(cov.liabilityLimit)],
                        ['Deductible',    fmtMoney(cov.deductible)],
                        ['Med Pay',       fmtMoney(cov.medPay)],
                        ['Unins. Boater', fmtMoney(cov.umBoater)],
                        ['Fuel Spill',    cov.fuelSpillIncluded ? 'Yes' : 'No'],
                        ['Lien Holder',   lh.name],
                        ['Loan #',        lh.loanNumber],
                    ]);
                });
                ff_rvs.forEach((r, i) => {
                    const cov = r.coverages || {};
                    const lh = r.lienHolder || {};
                    const flags = [];
                    if (r.fullTimer)        flags.push('Full-timer');
                    if (r.stationary)       flags.push('Stationary');
                    if (r.rentalCharter)    flags.push('Rental/Charter');
                    if (r.totalLossReplacementRequested) flags.push('Total Loss Replacement');
                    const title = `RV #${i + 1}  ·  ${[r.year, r.make, r.model].filter(Boolean).join(' ') || 'RV'}  ·  Class ${r.class || '?'}`;
                    assetCard(title + (flags.length ? '   ·   ' + flags.join(' · ') : ''), [
                        ['Year',          r.year],
                        ['Make',          r.make],
                        ['Model',         r.model],
                        ['Length',        r.length],
                        ['VIN',           r.vin],
                        ['Garaging Zip',  r.garagingZip],
                        ['Market Value',  fmtMoney(r.marketValue)],
                        ['Comp Ded',      fmtMoney(cov.compDeductible)],
                        ['Coll Ded',      fmtMoney(cov.collDeductible)],
                        ['Liability',     cov.liabilityLimit],
                        ['Vacation Liab', cov.vacationLiability ? 'Yes' : ''],
                        ['UM/UIM',        cov.umuim],
                        ['Med Pay',       fmtMoney(cov.medPay)],
                        ['Pers. Effects', fmtMoney(cov.personalEffects)],
                        ['Awning Damage', cov.awningDamage ? 'Yes' : ''],
                        ['Lien Holder',   lh.name],
                        ['Loan #',        lh.loanNumber],
                    ]);
                });
            }

            // ── §15 HISTORY ──────────────────────────────────────────────
            ffSection('Loss & Violation History (35 mo)');
            if (ff_hist.hasCleanHistory) {
                doc.setFontSize(9); doc.setFont('helvetica', 'italic');
                setColor('setTextColor', PALETTE.MID);
                doc.text('Clean record (all operators)', MG + 2, y + 10);
                doc.setFont('helvetica', 'normal');
                y += 16;
            } else if ((ff_hist.losses || []).length || (ff_hist.violations || []).length) {
                const events = [];
                (ff_hist.losses || []).forEach(L => {
                    const op = ff_operators.find(o => o.id === L.operatorId);
                    events.push({
                        date: L.date,
                        type: L.type + (L.amount ? ` ($${L.amount})` : '') + (L.asset ? ` · ${L.asset}` : ''),
                        operatorName: op ? `${op.firstName || ''} ${op.lastName || ''}`.trim() : '',
                        severity: 'med',
                    });
                });
                (ff_hist.violations || []).forEach(V => {
                    const op = ff_operators.find(o => o.id === V.operatorId);
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
                y += 6;
            } else {
                doc.setFontSize(9); doc.setFont('helvetica', 'italic');
                setColor('setTextColor', PALETTE.MID);
                doc.text('No incidents reported yet', MG + 2, y + 10);
                doc.setFont('helvetica', 'normal');
                y += 16;
            }

            // ── §16 DISCOUNTS & AFFINITY ─────────────────────────────────
            const ff_discList = [];
            if (ff_dc.homeowner)                            ff_discList.push('Homeowner');
            if (ff_dc.safetyCourse && ff_dc.safetyCourse.auto) ff_discList.push('Defensive Driver');
            if (ff_dc.safetyCourse && ff_dc.safetyCourse.boat) ff_discList.push('Boater Safety');
            if (ff_dc.safetyCourse && ff_dc.safetyCourse.rv)   ff_discList.push('RV Safety');
            const ff_affList = [];
            if (ff_dc.affinity && ff_dc.affinity.usaa)     ff_affList.push('USAA');
            if (ff_dc.affinity && ff_dc.affinity.hog)      ff_affList.push('HOG');
            if (ff_dc.affinity && ff_dc.affinity.uscgAux)  ff_affList.push('USCG Aux');
            if (ff_dc.affinity && ff_dc.affinity.usps)     ff_affList.push('USPS');
            if (ff_discList.length || ff_affList.length) {
                ffSection('Discounts & Affinity');
                if (ff_discList.length) {
                    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text('DISCOUNTS', MG + 2, y + 8);
                    y += 12;
                    y += pillRow(ff_discList, MG + 2, y, CW - 4, { filled: true });
                    y += 6;
                }
                if (ff_affList.length) {
                    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                    setColor('setTextColor', PALETTE.MID);
                    doc.text('AFFINITY GROUPS', MG + 2, y + 8);
                    y += 12;
                    y += pillRow(ff_affList, MG + 2, y, CW - 4, { filled: true });
                    y += 6;
                }
            }

            // ── §17 FOLLOW-UP — deferred fields only ─────────────────────
            // Same rationale as the summary: talk-track and derived-from-risk
            // items belong in the live intake rail. Only explicit agent "ask
            // later" commitments earn space.
            const ff_deferred = (model.actionItems || []).filter(it => it.source === 'deferred');
            if (ff_deferred.length) {
                ffSection(`Follow-up Items (${ff_deferred.length})`);
                y += checklist(ff_deferred, MG, y, CW, ff_deferred.length);
                y += 4;
            }

            // ── §18 AGENT NOTES ──────────────────────────────────────────
            if (v2.notes && v2.notes.freeText) {
                ffSection('Agent Notes');
                doc.setFontSize(10); doc.setFont('helvetica', 'normal');
                setColor('setTextColor', PALETTE.INK);
                const lines = has(doc, 'splitTextToSize') ? doc.splitTextToSize(String(v2.notes.freeText), CW) : [String(v2.notes.freeText)];
                for (const line of lines) {
                    need(13);
                    doc.text(line, MG, y + 4);
                    y += 12;
                }
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
                        ? `${layout === 'factfinder' ? 'Cover' : 'Snapshot'} · Page 1 of ${total}`
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
