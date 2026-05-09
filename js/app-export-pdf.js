// js/app-export-pdf.js — PDF export engine
// Extracted from app-export.js during Phase 4 monolith decomposition
'use strict';

Object.assign(App, {
    async exportPDF() {
        const result = await this.buildPDF(this.data);
        this.downloadBlob(result.blob, result.filename);
        this.logExport('PDF', result.filename);
        this.toast('\u2714 PDF downloaded successfully');
    },

    async buildPDF(data) {
        try {
            await window.PDFLibs.ensure('jspdf');
        } catch (e) {
            this.toast('PDF library failed to load — check your internet connection', { type: 'error', duration: 4000 });
            throw e;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageW  = doc.internal.pageSize.getWidth();   // 210mm
        const pageH  = doc.internal.pageSize.getHeight();  // 297mm
        const mg     = 12;   // margin
        const cw     = pageW - mg * 2;  // content width ~186mm

        // ── Toner-friendly palette (print-optimized) ─────────────────────
        const INK   = [30, 30, 30];      // near-black text
        const MID   = [80, 80, 80];      // grey labels / secondary text — must print solid
        const LIGHT = [165, 165, 165];   // borders
        const RULE  = [190, 190, 190];   // light dividers
        const FILL  = [232, 232, 232];   // alt-row fill
        const WHITE = [255, 255, 255];
        const ACCENT= [60, 60, 60];      // dark accent for header bar

        // ── Utility helpers ──────────────────────────────────────────────
        let y = mg;

        const addPage = () => { doc.addPage(); y = mg; };
        const need = (h) => { if (y + h > pageH - 22) addPage(); };

        const v = (key) => {
            if (data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== '')
                return String(data[key]);
            const el = document.getElementById(key);
            if (el) return (el.type === 'checkbox' ? (el.checked ? 'Yes' : '') : (el.value || '')).trim();
            return '';
        };

        const fmtPhone = (val) => App._fmtPhoneVal ? App._fmtPhoneVal(val) : val;

        const fmtDate = (val) => {
            if (!val) return '';
            const d = new Date(val);
            if (isNaN(d)) return val;
            return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
        };
        const fmtMoney = (val) => {
            if (!val) return '';
            const s = String(val).trim();
            // Preserve percentage values (e.g. "2%", "25%")
            if (s.endsWith('%')) return s;
            const n = parseFloat(s.replace(/[$,\s]/g,''));
            if (isNaN(n)) return val;
            return '$' + n.toLocaleString('en-US');
        };
        const fmtDateTime = (d) => {
            if (!(d instanceof Date)) d = new Date(d);
            if (isNaN(d)) return '';
            let h = d.getHours(), m = String(d.getMinutes()).padStart(2,'0');
            const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
            return `${fmtDate(d)} ${h}:${m} ${ap}`;
        };

        const drivers  = (data.drivers  && data.drivers.length)  ? data.drivers  : (this.drivers  || []);
        const vehicles = (data.vehicles && data.vehicles.length) ? data.vehicles : (this.vehicles || []);
        const qType    = (data.qType || '').toLowerCase();
        const showHome = qType === 'home' || qType === 'both' || !qType;
        const showAuto = qType === 'auto' || qType === 'both' || !qType;

        const prefix  = v('prefix');
        const suffix  = v('suffix');
        const nameParts = [prefix, data.firstName||'', data.lastName||'', suffix].filter(Boolean);
        const clientName = nameParts.join(' ') || 'Client';
        const address = this.getFullAddress(data);
        const addrLine = [v('addrCity'), v('addrState'), v('addrZip')].filter(Boolean).join(', ');
        const qLabel  = qType==='home'?'Home Only': qType==='auto'?'Auto Only': qType==='both'?'Home & Auto':'Quote';
        const docRef  = `APP-${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`;

        // ── Fetch assets ─────────────────────────────────────────────────
        const [mapImages, logoImg] = await Promise.all([
            this.getMapImages(address),
            this.fetchImageDataUrl('Resources/altech-logo.png')
        ]);

        // ════════════════════════════════════════════════════════════════
        //  PAGE HEADER (drawn on every new page via footer loop)
        // ════════════════════════════════════════════════════════════════
        const drawPageFooter = () => {
            const total = doc.internal.getNumberOfPages();
            for (let i = 1; i <= total; i++) {
                doc.setPage(i);
                doc.setFontSize(6.5); doc.setFont(undefined,'normal');
                doc.setTextColor(...MID);
                doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
                doc.line(mg, pageH-14, pageW-mg, pageH-14);
                doc.text('Altech Insurance Tools', mg, pageH-9);
                doc.text(`Page ${i} of ${total}`, pageW/2, pageH-9, {align:'center'});
                doc.text(fmtDateTime(new Date()), pageW-mg, pageH-9, {align:'right'});
            }
        };

        // ─── Section label (thin rule + small caps label) ────────────────
        const sectionLabel = (title) => {
            need(10);
            y += 4;
            doc.setDrawColor(...RULE); doc.setLineWidth(0.4);
            doc.line(mg, y, pageW-mg, y);
            doc.setFontSize(6.5); doc.setFont(undefined,'bold');
            doc.setTextColor(...MID);
            doc.text(title.toUpperCase(), mg, y+4.5);
            doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
            y += 8;
        };

        // ─── Sub-header (small caps, no fill, just bold text + underline) ─
        const subHeader = (title) => {
            need(9);
            y += 2;
            doc.setFontSize(7); doc.setFont(undefined,'bold');
            doc.setTextColor(...INK);
            doc.text(title.toUpperCase(), mg, y+4);
            doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
            doc.line(mg, y+5.5, pageW-mg, y+5.5);
            doc.setFont(undefined,'normal');
            y += 8;
        };

        // ─── 2-col key-value table (label left, value right, side by side) ─
        // fields: array of [label, value] — every field renders; blanks print as an em-dash
        // in MID grey so the PDF template is uniform across clients (home/auto/both) and
        // missing data reads as "didn't capture" at a glance rather than "field absent".
        // cols: how many label-value pairs per row (1, 2, or 3)
        const baseRowH = 5.2;
        const lineH    = 3.8;   // extra height per wrapped line
        const DASH     = '—';  // em dash — placeholder for missing values

        const kvRow = (fields, cols = 2) => {
            const rows = [];
            for (let i = 0; i < fields.length; i += cols) rows.push(fields.slice(i, i+cols));
            const colW = cw / cols;
            const labelW = colW * 0.38;
            const maxW = colW - labelW - 4;

            rows.forEach((row, ri) => {
                // Pre-calculate how tall this row needs to be (find max wrapped lines)
                doc.setFontSize(8); doc.setFont(undefined,'bold');
                let maxLines = 1;
                const splitCache = row.map(([, value]) => {
                    const isBlank = value == null || String(value).trim() === '';
                    const str = isBlank ? DASH : String(value);
                    const lines = doc.splitTextToSize(str, maxW);
                    if (lines.length > maxLines) maxLines = lines.length;
                    return { lines, isBlank };
                });
                const rowH = baseRowH + (maxLines - 1) * lineH;

                need(rowH + 1);
                if (ri % 2 === 1) {
                    doc.setFillColor(...FILL);
                    doc.rect(mg, y-0.5, cw, rowH+0.5, 'F');
                }
                row.forEach(([label], ci) => {
                    const x = mg + ci * colW;
                    doc.setFontSize(6); doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
                    doc.text(String(label), x+1, y+3);
                    doc.setFontSize(8);
                    const { lines, isBlank } = splitCache[ci];
                    // Blanks render in MID grey + normal weight so they recede visually;
                    // real values stay INK + bold so they stand out on the printed page.
                    if (isBlank) {
                        doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
                    } else {
                        doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
                    }
                    lines.forEach((line, li) => {
                        doc.text(line, x + labelW, y + 3 + li * lineH);
                    });
                });
                y += rowH;
            });
            y += 0.5;
        };

        // ─── Inline driver/vehicle card ───────────────────────────────────
        // Two cards side by side or full width
        const personCard = (title, fields) => {
            need(6 + fields.filter(([,v])=>v).length * 4.5);
            const filt = fields.filter(([,val]) => val && String(val).trim());
            if (!filt.length) return;
            // Header row
            doc.setFillColor(...FILL);
            doc.rect(mg, y, cw, 6, 'F');
            doc.setFillColor(...ACCENT);
            doc.rect(mg, y, 2, 6, 'F');
            doc.setFontSize(7.5); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
            doc.text(title, mg+5, y+4.2);
            doc.setFont(undefined,'normal');
            y += 7;
            // Fields in 2 cols
            kvRow(filt, 2);
        };

        // ════════════════════════════════════════════════════════════════
        //  ① DOCUMENT HEADER
        // ════════════════════════════════════════════════════════════════
        y = mg;

        // Thin accent bar at top — inset to margin so it prints reliably
        doc.setFillColor(...ACCENT);
        doc.rect(mg, mg-4, cw, 1.5, 'F');
        y = mg + 1;

        // Logo + agency name on left, doc ref on right
        const logoH = 10;
        if (logoImg?.dataUrl) {
            doc.addImage(logoImg.dataUrl, logoImg.format, mg, y, logoH, logoH);
        }
        const txtX = mg + (logoImg?.dataUrl ? logoH + 3 : 0);
        doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
        doc.text('Altech Insurance', txtX, y+5);
        doc.setFontSize(6.5); doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
        doc.text('Insurance Application Summary', txtX, y+9);
        doc.setFontSize(6.5); doc.setTextColor(...MID);
        doc.text(docRef, pageW-mg, y+4, {align:'right'});
        doc.text(fmtDateTime(new Date()), pageW-mg, y+8.5, {align:'right'});
        y += logoH + 2;

        // Thin rule
        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
        doc.line(mg, y, pageW-mg, y);
        y += 2;

        // ════════════════════════════════════════════════════════════════
        //  ② PROPERTY PHOTO + CLIENT SUMMARY CARD (side by side)
        // ════════════════════════════════════════════════════════════════
        const photoW = mapImages?.streetView?.dataUrl ? 44 : 0;
        const cardX  = mg + (photoW > 0 ? photoW + 4 : 0);
        const cardW  = cw - (photoW > 0 ? photoW + 4 : 0);
        const blockH = 28;

        // Street view photo (left side, lightened)
        if (mapImages?.streetView?.dataUrl) {
            doc.addImage(mapImages.streetView.dataUrl, mapImages.streetView.format, mg, y, photoW, blockH);
            // White wash overlay to save toner
            doc.setGState(new doc.GState({opacity: 0.5}));
            doc.setFillColor(...WHITE);
            doc.rect(mg, y, photoW, blockH, 'F');
            doc.setGState(new doc.GState({opacity: 1}));
            doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
            doc.rect(mg, y, photoW, blockH, 'S');
            // Label overlay
            doc.setFontSize(6); doc.setTextColor(...MID);
            doc.text('Street View', mg+2, y+blockH-2);
        }

        // Client summary card (right side or full width)
        doc.setFillColor(...FILL);
        doc.rect(cardX, y, cardW, blockH, 'F');
        doc.setFillColor(...ACCENT);
        doc.rect(cardX, y, 3, blockH, 'F');
        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
        doc.rect(cardX, y, cardW, blockH, 'S');

        // Client name + quote type
        doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
        doc.text(clientName, cardX+5, y+6);
        doc.setFontSize(7); doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
        doc.text(qLabel, pageW-mg-2, y+6, {align:'right'});

        // Address
        doc.setFontSize(7.5); doc.setTextColor(...INK);
        doc.text(address || addrLine, cardX+5, y+11);

        // Thin rule
        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
        doc.line(cardX+4, y+13.5, pageW-mg-2, y+13.5);

        // Phone + Email inline
        const contactParts = [];
        if (v('phone')) contactParts.push(fmtPhone(v('phone')));
        if (v('email')) contactParts.push(v('email'));
        doc.setFontSize(7.5); doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
        doc.text(contactParts.join('   |   '), cardX+5, y+19);

        // Satellite mini-map (bottom-right corner of card)
        if (mapImages?.satellite?.dataUrl) {
            const satW = 14, satH = 10;
            const satX2 = pageW - mg - satW - 2;
            const satY2 = y + blockH - satH - 2;
            doc.addImage(mapImages.satellite.dataUrl, mapImages.satellite.format, satX2, satY2, satW, satH);
            doc.setGState(new doc.GState({opacity: 0.35}));
            doc.setFillColor(...WHITE);
            doc.rect(satX2, satY2, satW, satH, 'F');
            doc.setGState(new doc.GState({opacity: 1}));
            doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
            doc.rect(satX2, satY2, satW, satH, 'S');
        }

        y += blockH + 3;

        // ════════════════════════════════════════════════════════════════
        //  ③ PERSONAL INFORMATION
        // ════════════════════════════════════════════════════════════════
        sectionLabel('Client Information');

        // Applicant row — name/contact/personal info, 3 cols for density
        kvRow([
            ['Full Name',       clientName],
            ['Date of Birth',   fmtDate(v('dob'))],
            ['Gender',          v('gender')==='M'?'Male': v('gender')==='F'?'Female': v('gender')],
            ['Marital Status',  v('maritalStatus')],
            ['Phone',           fmtPhone(v('phone'))],
            ['Email',           v('email')],
            ['Education',       v('education')],
            ['Occupation',      v('occupation')],
            ['Industry',        v('industry')],
            ['Yrs at Address',  v('yearsAtAddress')],
            ['County',          this.getCountyFromCity(data.addrCity, data.addrState) || ''],
            ['Residence Is',    v('residenceIs')],
        ], 3);

        // Previous address — show only if present
        const prevAddr = [v('previousAddrStreet'), v('previousAddrCity'), v('previousAddrState'), v('previousAddrZip')].filter(Boolean).join(', ');
        if (prevAddr) {
            need(6);
            doc.setFontSize(6.5); doc.setFont(undefined,'bold'); doc.setTextColor(...MID);
            doc.text('PREVIOUS ADDRESS', mg, y+3.5);
            const prevLabelW = doc.getTextWidth('PREVIOUS ADDRESS');
            doc.setDrawColor(...RULE); doc.setLineWidth(0.25);
            doc.line(mg + prevLabelW + 3, y+3, pageW-mg, y+3);
            doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
            y += 5;
            kvRow([
                ['Street',  v('previousAddrStreet')],
                ['City',    v('previousAddrCity')],
                ['State',   v('previousAddrState')],
                ['ZIP',     v('previousAddrZip')],
            ], 3);
        }

        // Primary home address — show only if different from insured location
        const priHomeAddr = [v('primaryHomeAddr'), v('primaryHomeCity'), v('primaryHomeState'), v('primaryHomeZip')].filter(Boolean).join(', ');
        const insuredAddr = [v('addrStreet'), v('addrCity'), v('addrState'), v('addrZip')].filter(Boolean).join(', ');
        if (priHomeAddr && priHomeAddr !== insuredAddr) {
            need(6);
            doc.setFontSize(6.5); doc.setFont(undefined,'bold'); doc.setTextColor(...MID);
            doc.text('PRIMARY HOME ADDRESS', mg, y+3.5);
            const priLabelW = doc.getTextWidth('PRIMARY HOME ADDRESS');
            doc.setDrawColor(...RULE); doc.setLineWidth(0.25);
            doc.line(mg + priLabelW + 3, y+3, pageW-mg, y+3);
            doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
            y += 5;
            kvRow([
                ['Street',  v('primaryHomeAddr')],
                ['City',    v('primaryHomeCity')],
                ['State',   v('primaryHomeState')],
                ['ZIP',     v('primaryHomeZip')],
            ], 3);
        }

        // Co-applicant — compact, no separate subHeader
        if (data.hasCoApplicant === 'yes' && (data.coFirstName || data.coLastName)) {
            // Thin label row to separate
            need(6);
            doc.setFontSize(6.5); doc.setFont(undefined,'bold'); doc.setTextColor(...MID);
            doc.text('CO-APPLICANT', mg, y+3.5);
            const coLabelW = doc.getTextWidth('CO-APPLICANT');
            doc.setDrawColor(...RULE); doc.setLineWidth(0.25);
            doc.line(mg + coLabelW + 3, y+3, pageW-mg, y+3);
            doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
            y += 5;
            const coNameParts = [v('coPrefix'), data.coFirstName||'', data.coLastName||'', v('coSuffix')].filter(Boolean);
            kvRow([
                ['Full Name',       coNameParts.join(' ')],
                ['Date of Birth',   fmtDate(v('coDob'))],
                ['Gender',          v('coGender')==='M'?'Male': v('coGender')==='F'?'Female': v('coGender')],
                ['Marital Status',  v('coMaritalStatus')],
                ['Relationship',    v('coRelationship')],
                ['Phone',           fmtPhone(v('coPhone'))],
                ['Email',           v('coEmail')],
                ['Occupation',      v('coOccupation')],
                ['Education',       v('coEducation')],
                ['Industry',        v('coIndustry')],
            ], 3);
        }

        // ════════════════════════════════════════════════════════════════
        //  ④ HOME INSURANCE
        // ════════════════════════════════════════════════════════════════
        if (showHome) {
            sectionLabel('Home Insurance');

            subHeader('Property Details');
            kvRow([
                ['Year Built',      v('yrBuilt')],
                ['Sq Footage',      v('sqFt') ? Number(v('sqFt')).toLocaleString()+' sq ft' : ''],
                ['Dwelling Type',   v('dwellingType')],
                ['Dwelling Use',    v('dwellingUsage')],
                ['Occupancy',       v('occupancyType')],
                ['Stories',         v('numStories')],
                ['Occupants',       v('numOccupants')],
                ['Bedrooms',        v('bedrooms')],
                ['Full Baths',      v('fullBaths')],
                ['Half Baths',      v('halfBaths')],
                ['Construction',    v('constructionStyle')],
                ['Exterior Walls',  v('exteriorWalls')],
                ['Foundation',      v('foundation')],
                ['Garage',          v('garageType') + (v('garageSpaces') ? ` (${v('garageSpaces')})` : '')],
                ['Lot Size',        v('lotSize') ? v('lotSize')+' acres' : ''],
                ['Purchase Date',   fmtDate(v('purchaseDate'))],
                ['Kitchen Quality', v('kitchenQuality')],
                ['Flooring',        v('flooring')],
                ['Fireplaces',      v('numFireplaces')],
            ], 3);

            subHeader('Building Systems');
            kvRow([
                ['Roof Type',        v('roofType')],
                ['Roof Shape',       v('roofShape')],
                ['Roof Updated',     v('roofYr')],
                ['Roof Update Type', v('roofUpdate')],
                ['Heating',          v('heatingType')],
                ['Heat Updated',     v('heatYr')],
                ['Cooling',          v('cooling')],
                ['Plumbing Updated', v('plumbYr')],
                ['Plumbing Material',v('plumbingMaterial')],
                ['Electric Updated', v('elecYr')],
                ['Electrical Panel', v('electricalPanel')],
                ['Amperage',         v('electricalAmps')],
                ['Water Heater Age', v('waterHeaterAge') ? v('waterHeaterAge')+' yrs' : ''],
                ['Water Heater Loc', v('waterHeaterLocation')],
                ['Sewer',            v('sewer')],
                ['Water Source',     v('waterSource')],
            ], 3);

            subHeader('Safety & Protection');
            kvRow([
                ['Burglar Alarm',   v('burglarAlarm')],
                ['Fire Alarm',      v('fireAlarm')],
                ['Smoke Detector',  v('smokeDetector')],
                ['Sprinklers',      v('sprinklers')],
                ['Secondary Heat',  v('secondaryHeating')],
                ['Fire Station',    v('fireStationDist') ? v('fireStationDist')+' mi' : ''],
                ['Fire Hydrant',    v('fireHydrantFeet') ? v('fireHydrantFeet')+' ft' : ''],
                ['Tidal Water',     v('tidalWaterDist') ? v('tidalWaterDist')+' ft' : ''],
                ['Protection Class',v('protectionClass')],
            ], 3);

            // Risk items — always show all risks so the agent's "None" answer is documented.
            // Empty/"No"/legacy blanks default to "None" for a consistent printed record.
            const _riskDisplay = (val) => {
                if (!val) return 'None';
                const lc = String(val).trim().toLowerCase();
                return (lc === '' || lc === 'no' || lc === 'none') ? 'None' : val;
            };
            const poolVal  = v('pool');
            const trampVal = v('trampoline');
            const livestockVal = v('farmingLivestock');
            const woodVal  = v('woodStove');
            const dogVal   = v('dogInfo');
            const bizVal   = v('businessOnProperty');
            subHeader('Risk Items');
            kvRow([
                ['Swimming Pool',        _riskDisplay(poolVal)],
                ['Trampoline',           _riskDisplay(trampVal)],
                ['Farm/Livestock',       _riskDisplay(livestockVal)],
                ['Wood Stove',           _riskDisplay(woodVal)],
                ['Dogs',                 _riskDisplay(dogVal)],
                ['Business on Property', _riskDisplay(bizVal)],
            ], 3);

            // Home Coverage — organized: Policy + Coverages A/B/C/D + Deductibles + EQ + Flood + Scheduled Items + Mortgagee
            // Match the on-screen section order so agent and client see the same flow.
            subHeader('Home Coverage — Coverages');
            kvRow([
                ['Policy Type',       v('homePolicyType')],
                ['Dwelling (Cov A)',  fmtMoney(v('dwellingCoverage'))],
                ['Other Struct (B)',  fmtMoney(v('otherStructures'))],
                ['Personal Prop (C)', fmtMoney(v('homePersonalProperty'))],
                ['Loss of Use (D)',   fmtMoney(v('homeLossOfUse'))],
                ['Personal Liab.',    fmtMoney(v('personalLiability'))],
                ['Med Payments',      fmtMoney(v('medicalPayments'))],
            ], 3);

            subHeader('Home Coverage — Deductibles');
            kvRow([
                ['All Perils (AOP)',  fmtMoney(v('homeDeductible'))],
                ['Wind / Hail',       fmtMoney(v('windDeductible'))],
            ], 3);

            subHeader('Home Coverage — Earthquake / Flood / Scheduled Items');
            kvRow([
                ['Earthquake',        v('earthquakeCoverage')],
                ['Earthquake Zone',   v('earthquakeZone')],
                ['Earthquake Ded.',   v('earthquakeDeductible')],
                ['Flood',             v('floodCoverage')],
                ['Flood Building',    fmtMoney(v('floodBuildingLimit'))],
                ['Flood Contents',    fmtMoney(v('floodContentsLimit'))],
                ['Flood Ded.',        fmtMoney(v('floodDeductible'))],
                ['Jewelry/Valuables', fmtMoney(v('jewelryLimit'))],
                ['Other Scheduled',   v('scheduledItems')],
                ['Mortgagee',         v('mortgagee')],
            ], 3);

            subHeader('Endorsements');
            const fmtPct = (val) => { if (!val) return ''; const s = String(val).trim(); return s.endsWith('%') ? s : s + '%'; };
            kvRow([
                ['Incr. Repl. Cost',  v('increasedReplacementCost') ? fmtPct(v('increasedReplacementCost')) : ''],
                ['Ordinance/Law',     v('ordinanceOrLaw') ? fmtPct(v('ordinanceOrLaw')) : ''],
                ['Water Backup',      fmtMoney(v('waterBackup'))],
                ['Loss Assessment',   fmtMoney(v('lossAssessment'))],
                ['Animal Liability',  fmtMoney(v('animalLiability'))],
                ['Theft Deductible',  fmtMoney(v('theftDeductible'))],
                ['Credit Card Cov.',  fmtMoney(v('creditCardCoverage'))],
                ['Mold Damage',       fmtMoney(v('moldDamage'))],
                ['Equip. Breakdown',  v('equipmentBreakdown')],
                ['Service Line',      v('serviceLine')],
            ], 3);

            // Risk flags callout
            const flags = [];
            const roofAge = parseInt(v('roofYr')), curY = new Date().getFullYear();
            if (!isNaN(roofAge) && roofAge>1900 && (curY-roofAge)>=20) flags.push(`[!] Roof age ${curY-roofAge} yrs (updated ${roofAge})`);
            const yrB = parseInt(v('yrBuilt'));
            if (!isNaN(yrB) && yrB>1800 && yrB<1970) flags.push(`[!] Year built: ${yrB}`);
            if (poolVal && poolVal.toLowerCase()!=='no' && poolVal.toLowerCase()!=='none') flags.push('[!] Pool on property');
            if (trampVal && trampVal.toLowerCase()!=='no' && trampVal.toLowerCase()!=='none') flags.push('[!] Trampoline');
            if (livestockVal && livestockVal.toLowerCase() === 'yes') flags.push('[!] Farm animals / livestock on property');
            if (woodVal && woodVal.toLowerCase()!=='none' && woodVal.toLowerCase()!=='no') flags.push(`[!] Wood stove: ${woodVal}`);
            if (!isNaN(parseFloat(v('fireStationDist'))) && parseFloat(v('fireStationDist'))>5) flags.push(`[!] Fire station ${v('fireStationDist')} mi`);
            if (flags.length) {
                subHeader('Risk Flags');
                doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
                flags.forEach(f => { need(5); doc.setFontSize(8); doc.text(f, mg+2, y+3.5); y += 5; });
                y += 3;
            }
        }

        // ════════════════════════════════════════════════════════════════
        //  ⑤ AUTO INSURANCE
        // ════════════════════════════════════════════════════════════════
        if (showAuto) {
            sectionLabel('Auto Insurance');

            // Drivers — 2 per row side by side
            if (drivers.length) {
                subHeader('Drivers');
                // Group into pairs
                for (let di = 0; di < drivers.length; di += 2) {
                    const left  = drivers[di];
                    const right = drivers[di+1];
                    const pairW = right ? (cw/2 - 2) : cw;

                    const drawDriverCard = (d, offsetX, cardWid) => {
                        const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Driver';
                        const cy = y;
                        // Card header
                        doc.setFillColor(...FILL);
                        doc.rect(offsetX, cy, cardWid, 4.5, 'F');
                        doc.setFillColor(...ACCENT); doc.rect(offsetX, cy, 2, 4.5, 'F');
                        doc.setFontSize(7); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
                        doc.text(name, offsetX+4, cy+3.2);
                        doc.setFontSize(6); doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
                        doc.text(d.relationship||'', offsetX+cardWid-2, cy+3.2, {align:'right'});
                        doc.setFont(undefined,'normal'); doc.setTextColor(...INK);

                        const dFields = [
                            ['DOB',         fmtDate(d.dob||'')],
                            ['Gender',      d.gender==='M'?'Male':d.gender==='F'?'Female':(d.gender||'')],
                            ['Marital',     d.maritalStatus||''],
                            ['Education',   d.education||''],
                            ['Occupation',  d.occupation||''],
                            ['License #',   (d.dlNum||'').toUpperCase()],
                            ['Lic. State',  (d.dlState||'').toUpperCase()],
                            ['Age Licensed',d.ageLicensed||''],
                            ['Good Driver', d.goodDriver||''],
                            ['Accidents',   d.accidents||''],
                            ['Violations',  d.violations||''],
                            ['Student GPA', d.studentGPA||''],
                            ...(d.sr22 && d.sr22!=='No' ? [['SR-22', d.sr22]] : []),
                            ...(d.fr44 && d.fr44!=='No' ? [['FR-44', d.fr44]] : []),
                            ...(d.licenseSusRev && d.licenseSusRev!=='No' ? [['Sus/Rev', d.licenseSusRev]] : []),
                            ...(d.matureDriver && d.matureDriver!=='No' ? [['Mature Driver', d.matureDriver]] : []),
                            ...(d.driverEducation && d.driverEducation!=='No' ? [['Driver Ed.', d.driverEducation]] : []),
                        ].filter(([,val])=>val);

                        const rowH = 4.0, labW = cardWid*0.38;
                        let ry = cy + 5.5;
                        dFields.forEach(([lbl,val],i) => {
                            if (i%2===1) {
                                doc.setFillColor(...FILL);
                                doc.rect(offsetX, ry-0.5, cardWid, rowH, 'F');
                            }
                            doc.setFontSize(6); doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
                            doc.text(lbl, offsetX+2, ry+2.8);
                            doc.setFontSize(8); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
                            doc.text(val, offsetX+labW, ry+2.8);
                            ry += rowH;
                        });
                        return ry - cy + 1.5;
                    };

                    // Estimate card height: header (5.5) + rows * 4 + padding.
                    // Count all fields the card can render so page-break math stays correct.
                    const _countDrv = (d) => [
                        d.dob, d.gender, d.maritalStatus, d.education, d.occupation,
                        d.dlNum, d.dlState, d.ageLicensed, d.goodDriver,
                        d.accidents, d.violations, d.studentGPA,
                        d.sr22 && d.sr22!=='No' ? d.sr22 : '',
                        d.fr44 && d.fr44!=='No' ? d.fr44 : '',
                        d.licenseSusRev && d.licenseSusRev!=='No' ? d.licenseSusRev : '',
                        d.matureDriver && d.matureDriver!=='No' ? d.matureDriver : '',
                        d.driverEducation && d.driverEducation!=='No' ? d.driverEducation : '',
                    ].filter(Boolean).length;
                    const rowCount = Math.max(_countDrv(left), right ? _countDrv(right) : 0, 4);
                    const estH = 5.5 + rowCount * 4 + 4;
                    need(estH);

                    const startY = y;
                    const leftH  = drawDriverCard(left, mg, pairW);
                    if (right) {
                        y = startY;  // reset y so right card starts at same position
                        const rightH = drawDriverCard(right, mg + cw/2 + 2, pairW);
                        y = startY + Math.max(leftH, rightH);
                    } else {
                        y = startY + leftH;
                    }
                    y += 2;
                }
            }

            // Vehicles — 2 per row
            if (vehicles.length) {
                subHeader('Vehicles');
                for (let vi = 0; vi < vehicles.length; vi += 2) {
                    const left  = vehicles[vi];
                    const right = vehicles[vi+1];
                    const pairW = right ? (cw/2 - 2) : cw;

                    const drawVehicleCard = (veh, offsetX, cardWid) => {
                        const desc = [veh.year, veh.make, veh.model].filter(Boolean).join(' ') || 'Vehicle';
                        const driverName = this.resolveDriverName(veh.primaryDriver, drivers);
                        const cy = y;
                        doc.setFillColor(...FILL);
                        doc.rect(offsetX, cy, cardWid, 4.5, 'F');
                        doc.setFillColor(...ACCENT); doc.rect(offsetX, cy, 2, 4.5, 'F');
                        doc.setFontSize(7); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
                        doc.text(desc, offsetX+4, cy+3.2);
                        doc.setFont(undefined,'normal');

                        const vFields = [
                            ['VIN',           veh.vin||''],
                            ['Primary Driver', driverName],
                            ['Usage',          veh.use||''],
                            ['Annual Miles',   veh.miles ? Number(veh.miles).toLocaleString() : ''],
                            ['Ownership',      veh.ownershipType||''],
                            ['Anti-Theft',     veh.antiTheft||''],
                            ['Restraints',     veh.passiveRestraints||''],
                            ['ABS',            veh.antiLockBrakes||''],
                            ...(veh.telematics && veh.telematics!=='No' ? [['Telematics', veh.telematics]] : []),
                            ...(veh.tnc && veh.tnc!=='No' ? [['Rideshare (TNC)', veh.tnc]] : []),
                        ].filter(([,val])=>val);

                        const rowH=4.0, labW=cardWid*0.38;
                        let ry=cy+5.5;
                        vFields.forEach(([lbl,val],i)=>{
                            if(i%2===1){doc.setFillColor(...FILL);doc.rect(offsetX,ry-0.5,cardWid,rowH,'F');}
                            doc.setFontSize(6);doc.setFont(undefined,'normal');doc.setTextColor(...MID);
                            doc.text(lbl,offsetX+2,ry+2.8);
                            doc.setFontSize(8);doc.setFont(undefined,'bold');doc.setTextColor(...INK);
                            doc.text(val,offsetX+labW,ry+2.8);
                            ry+=rowH;
                        });
                        return ry-cy+1.5;
                    };

                    // Estimate vehicle card height: header + up to 10 fields + padding
                    need(5.5 + 10 * 4 + 4);

                    const vStartY = y;
                    const leftH = drawVehicleCard(left, mg, pairW);
                    if (right) {
                        y = vStartY;  // reset y so right card starts at same position
                        const rightH = drawVehicleCard(right, mg + cw/2 + 2, pairW);
                        y = vStartY + Math.max(leftH, rightH);
                    } else { y = vStartY + leftH; }
                    y += 2;
                }
            }

            subHeader('Auto Coverage');
            kvRow([
                ['Policy Type',     v('autoPolicyType')],
                ['Liability',       v('liabilityLimits')],
                ['Prop. Damage',    fmtMoney(v('pdLimit'))],
                ['Med Pay',         fmtMoney(v('medPayments'))],
                ['UM Limits',       v('umLimits')],
                ['UIM Limits',      v('uimLimits')],
                ['UMPD Limit',      fmtMoney(v('umpdLimit'))],
                ['Comp Ded.',       fmtMoney(v('compDeductible'))],
                ['Collision Ded.',  fmtMoney(v('autoDeductible'))],
                ['Rental',          v('rentalDeductible') ? '$' + v('rentalDeductible').replace('/', '/day — $') + ' max' : ''],
                ['Towing',          fmtMoney(v('towingDeductible'))],
            ], 3);
        }

        // ════════════════════════════════════════════════════════════════
        //  ⑥ POLICY & PRIOR INSURANCE
        // ════════════════════════════════════════════════════════════════
        sectionLabel('Policy & Prior Insurance');

        subHeader('Policy Details');
        kvRow([
            ['Policy Term',   v('policyTerm')],
            ['Effective Date',fmtDate(v('effectiveDate'))],
            ['Multi-Policy',  v('multiPolicy')],
            ['Cont. Coverage',v('continuousCoverage')],
        ], 2);

        // Prior insurance — combined into one table, labelled by line
        const priorRows = [];
        if (showHome) {
            priorRows.push(['Home Carrier',    v('homePriorCarrier') || v('priorCarrier')]);
            priorRows.push(['Home Liability',  v('homePriorLiability')]);
            priorRows.push(['Home Term',       v('homePriorPolicyTerm') || v('priorPolicyTerm')]);
            priorRows.push(['Home Yrs',        v('homePriorYears') || v('priorYears')]);
            priorRows.push(['Home Exp.',       fmtDate(v('homePriorExp') || v('priorExp'))]);
            priorRows.push(['Home Status',     v('homePriorPolicyStatus')]);
        }
        if (showAuto) {
            priorRows.push(['Auto Carrier',    v('priorCarrier')]);
            priorRows.push(['Auto Liability',  v('priorLiabilityLimits') ? v('priorLiabilityLimits') + ' (BI/PD)' : '']);
            priorRows.push(['Auto Term',       v('priorPolicyTerm')]);
            priorRows.push(['Auto Yrs',        v('priorYears')]);
            priorRows.push(['Auto Exp.',       fmtDate(v('priorExp'))]);
            priorRows.push(['Auto Status',     v('priorPolicyStatus')]);
        }
        if (priorRows.length) {
            subHeader('Prior Insurance');
            kvRow(priorRows, 3);
        }

        // ════════════════════════════════════════════════════════════════
        //  ⑦ ADDITIONAL INFORMATION
        // ════════════════════════════════════════════════════════════════
        sectionLabel('Additional Information');
        kvRow([
            ['Additional Insureds', v('additionalInsureds')],
            ['Credit Check Auth',   data.creditCheckAuth ? 'Yes — Authorized' : 'No'],
            ['TCPA Consent',        data.tcpaConsent ? 'Yes — Consented' : 'No'],
            ['Contact Method',      v('contactMethod')],
            ['Best Contact Time',   v('contactTime')],
            ['Referral Source',     v('referralSource')],
        ], 2);

        // Notes
        const notes = v('pdfNotes');
        if (notes) {
            subHeader('Notes');
            need(12);
            doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
            const noteLines = doc.splitTextToSize(notes, cw-4);
            noteLines.forEach(line => { need(5); doc.text(line, mg+2, y+3.5); y+=4.5; });
            y+=2;
        }

        // ════════════════════════════════════════════════════════════════
        //  FOOTER ON ALL PAGES
        // ════════════════════════════════════════════════════════════════
        drawPageFooter();

        const fileName = `Insurance_Application_${this._safeFileNamePart(data.lastName, 'Client')}_${new Date().toISOString().split('T')[0]}.pdf`;
        // doc.output('blob') can throw OutOfMemory on very large PDFs (50+ drivers/
        // vehicles or huge note bodies). Surface a user-visible message rather than
        // letting the unhandled exception crash the session.
        let blob;
        try {
            blob = doc.output('blob');
        } catch (err) {
            console.error('[ExportPDF] blob output failed:', err);
            if (typeof this.toast === 'function') {
                this.toast('PDF too large to render — try removing some drivers/vehicles or shortening notes.', { type: 'error', duration: 6000 });
            }
            throw err;
        }
        return { blob, filename: fileName };
    },
});
