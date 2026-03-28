// js/app-export.js — Export engines (PDF, CMSMTF, Text/CSV)
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {
    async exportPDF() {
        const result = await this.buildPDF(this.data);
        this.downloadBlob(result.blob, result.filename);
        this.logExport('PDF', result.filename);
        this.toast('\u2714 PDF downloaded successfully');
    },

    exportText() {
        const result = this.buildText(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('Text', result.filename);
        this.toast('\u{1F4DD} Text summary downloaded');
    },

    async buildPDF(data) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            this.toast('PDF library not loaded — check your internet connection and reload', 'error');
            throw new Error('jsPDF library not available (window.jspdf is undefined)');
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
        // fields: array of [label, value] — empties auto-skipped
        // cols: how many label-value pairs per row (1, 2, or 3)
        const baseRowH = 5.2;
        const lineH    = 3.8;   // extra height per wrapped line

        const kvRow = (fields, cols = 2) => {
            const rows = [];
            const filtered = fields.filter(([,val]) => val && String(val).trim());
            for (let i = 0; i < filtered.length; i += cols) rows.push(filtered.slice(i, i+cols));
            const colW = cw / cols;
            const labelW = colW * 0.38;
            const maxW = colW - labelW - 4;

            rows.forEach((row, ri) => {
                // Pre-calculate how tall this row needs to be (find max wrapped lines)
                doc.setFontSize(8); doc.setFont(undefined,'bold');
                let maxLines = 1;
                const splitCache = row.map(([, value]) => {
                    const lines = doc.splitTextToSize(String(value), maxW);
                    if (lines.length > maxLines) maxLines = lines.length;
                    return lines;
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
                    doc.setFontSize(8); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
                    const lines = splitCache[ci];
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
            kvRow([
                ['Full Name',       `${data.coFirstName||''} ${data.coLastName||''}`.trim()],
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
                ['Electric Updated', v('elecYr')],
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

            // Risk items — only show when they represent actual risks
            const riskItems = [];
            const poolVal = v('pool');
            if (poolVal && poolVal.toLowerCase() !== 'no' && poolVal.toLowerCase() !== 'none') riskItems.push(['Swimming Pool', poolVal]);
            const trampVal = v('trampoline');
            if (trampVal && trampVal.toLowerCase() !== 'no' && trampVal.toLowerCase() !== 'none') riskItems.push(['Trampoline', trampVal]);
            const woodVal = v('woodStove');
            if (woodVal && woodVal.toLowerCase() !== 'none' && woodVal.toLowerCase() !== 'no') riskItems.push(['Wood Stove', woodVal]);
            const dogVal = v('dogInfo');
            if (dogVal && dogVal.toLowerCase() !== 'none' && dogVal.toLowerCase() !== 'no') riskItems.push(['Dogs', dogVal]);
            const bizVal = v('businessOnProperty');
            if (bizVal && bizVal.toLowerCase() !== 'no') riskItems.push(['Business on Property', bizVal]);
            if (riskItems.length) {
                subHeader('Risk Items');
                kvRow(riskItems, 3);
            }

            subHeader('Home Coverage');
            kvRow([
                ['Policy Type',       v('homePolicyType')],
                ['Dwelling (Cov A)',  fmtMoney(v('dwellingCoverage'))],
                ['Other Struct (B)',  fmtMoney(v('otherStructures'))],
                ['Personal Prop (C)', fmtMoney(v('homePersonalProperty'))],
                ['Loss of Use (D)',   fmtMoney(v('homeLossOfUse'))],
                ['Personal Liab.',    fmtMoney(v('personalLiability'))],
                ['Med Payments',      fmtMoney(v('medicalPayments'))],
                ['Deductible (AOP)',  fmtMoney(v('homeDeductible'))],
                ['Wind/Hail Ded.',    fmtMoney(v('windDeductible'))],
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
                ['Jewelry/Valuables', fmtMoney(v('jewelryLimit'))],
                ['Credit Card Cov.',  fmtMoney(v('creditCardCoverage'))],
                ['Mold Damage',       fmtMoney(v('moldDamage'))],
                ['Equip. Breakdown',  v('equipmentBreakdown')],
                ['Service Line',      v('serviceLine')],
                ['Earthquake',        v('earthquakeCoverage')],
                ['Earthquake Zone',   v('earthquakeZone')],
                ['Earthquake Ded.',   fmtMoney(v('earthquakeDeductible'))],
            ], 3);

            // Risk flags callout
            const flags = [];
            const roofAge = parseInt(v('roofYr')), curY = new Date().getFullYear();
            if (!isNaN(roofAge) && roofAge>1900 && (curY-roofAge)>=20) flags.push(`[!] Roof age ${curY-roofAge} yrs (updated ${roofAge})`);
            const yrB = parseInt(v('yrBuilt'));
            if (!isNaN(yrB) && yrB>1800 && yrB<1970) flags.push(`[!] Year built: ${yrB}`);
            if (poolVal && poolVal.toLowerCase()!=='no' && poolVal.toLowerCase()!=='none') flags.push('[!] Pool on property');
            if (trampVal && trampVal.toLowerCase()!=='no' && trampVal.toLowerCase()!=='none') flags.push('[!] Trampoline');
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
                            ...(d.sr22 && d.sr22!=='No' ? [['SR-22', d.sr22]] : []),
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

                    // Estimate card height: header (5.5) + rows * 4 + padding
                    const leftFields = [left.dob,left.gender,left.maritalStatus,left.education,left.occupation,left.dlNum,left.dlState].filter(Boolean).length;
                    const estH = 5.5 + Math.max(leftFields, 4) * 4 + 4;
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
                ['Commute Dist.',   v('commuteDist') ? v('commuteDist')+' mi' : ''],
                ['Ride Sharing',    v('rideSharing')],
                ['Telematics',      v('telematics')],
                ['Student GPA',     v('studentGPA')],
                ['Accidents',       v('accidents')],
                ['Violations',      v('violations')],
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
        }
        if (showAuto) {
            priorRows.push(['Auto Carrier',    v('priorCarrier')]);
            priorRows.push(['Auto Liability',  v('priorLiabilityLimits') ? v('priorLiabilityLimits') + ' (BI/PD)' : '']);
            priorRows.push(['Auto Term',       v('priorPolicyTerm')]);
            priorRows.push(['Auto Yrs',        v('priorYears')]);
            priorRows.push(['Auto Exp.',       fmtDate(v('priorExp'))]);
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

        const fileName = `Insurance_Application_${data.lastName||'Client'}_${new Date().toISOString().split('T')[0]}.pdf`;
        return { blob: doc.output('blob'), filename: fileName };
    },

    buildText(data) {
        const content = this.getNotesForData(data);
        const fileName = `Insurance_Application_${data.lastName || 'Client'}_${new Date().toISOString().split('T')[0]}.txt`;
        return { content, filename: fileName, mime: 'text/plain;charset=utf-8' };
    },

    exportCSV() {
        const result = this.buildCSV(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('CSV', result.filename);
        this.toast('\u{1F525} CSV Generated!');
    },

    buildCSV(data) {
        const h = this.getCSVHeaders();
        const flatNotes = this.getNotesForData(data).replace(/\n/g, ' | ');
        const driversSummary = (data.drivers || []).map((d, i) => {
            const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
            return `Driver ${i + 1}: ${name || 'Unknown'} (${d.occupation || 'N/A'})`;
        }).join(' | ');
        const row = [
            data.firstName, data.lastName, data.addrStreet, data.addrCity, data.addrState, data.addrZip,
            data.phone, data.email, data.dob, flatNotes, data.qType, driversSummary
        ].map(v => `"${v||''}"`).join(',');

        const csv = h.join(',') + "\n" + row;
        return { content: csv, filename: `Lead_${data.lastName || 'Export'}.csv`, mime: 'text/csv' };
    },

    getCSVHeaders() {
        return ["First Name","Last Name","Address Line 1","City","State Code","Zip Code","Mobile Phone","Email","Date of Birth","Notes","Quote Type","Drivers/Occupations"];
    },

    downloadCSVTemplate() {
        const headers = this.getCSVHeaders();
        const sample = [
            'Jane','Doe','123 Main St','Seattle','WA','98101','2065551212','jane@example.com','1985-05-12','Follow up','home','Driver 1: Jane Doe (Engineer)'
        ].map(v => `"${v}"`).join(',');
        const content = `${headers.join(',')}\n${sample}`;
        this.downloadFile(content, 'Altech_Batch_Template.csv', 'text/csv');
        this.toast('\u{1F4C4} CSV template downloaded');
    },

    openBatchImport() {
        const input = document.getElementById('batchCsvInput');
        if (!input) return;
        input.value = '';
        input.click();
    },

    async handleBatchImport(file) {
        if (!file) return;
        const text = await file.text();
        const parsed = this.parseCSV(text);
        if (!parsed || !parsed.rows.length) {
            this.toast('\u26A0\uFE0F CSV has no rows.');
            return;
        }

        const quotes = await this.getQuotes();
        const errors = [];
        let created = 0;

        parsed.rows.forEach((row, index) => {
            const data = this.mapCsvRowToData(parsed.headers, row);
            if (!data.addrStreet || !data.addrCity || !data.addrState) {
                errors.push(`Row ${index + 2}: Missing address fields`);
                return;
            }

            const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
            const title = this.getQuoteTitle(data);
            quotes.unshift({
                id,
                title,
                data,
                updatedAt: new Date().toISOString(),
                starred: false,
                isDuplicate: false
            });
            created += 1;
        });

        await this.saveQuotes(quotes);
        await this.renderQuoteList();

        if (created) {
            this.toast(`\u2705 Imported ${created} draft${created > 1 ? 's' : ''}`);
        }
        if (errors.length) {
            console.warn('Batch import warnings:', errors);
            this.toast('\u26A0\uFE0F Some rows were skipped.');
        }
    },

    parseCSV(text) {
        if (!text) return { headers: [], rows: [] };
        const rows = [];
        let cur = '';
        let row = [];
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const next = text[i + 1];

            if (ch === '"') {
                if (inQuotes && next === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (ch === ',' && !inQuotes) {
                row.push(cur);
                cur = '';
                continue;
            }

            if ((ch === '\n' || ch === '\r') && !inQuotes) {
                if (ch === '\r' && next === '\n') i++;
                row.push(cur);
                cur = '';
                if (row.some(cell => cell.trim().length)) {
                    rows.push(row);
                }
                row = [];
                continue;
            }

            cur += ch;
        }

        if (cur.length || row.length) {
            row.push(cur);
            if (row.some(cell => cell.trim().length)) {
                rows.push(row);
            }
        }

        const headers = (rows.shift() || []).map(h => h.trim());
        return { headers, rows };
    },

    mapCsvRowToData(headers, row) {
        const data = {};
        headers.forEach((header, i) => {
            const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
            const value = (row[i] || '').trim();

            const map = {
                firstname: 'firstName',
                lastname: 'lastName',
                addressline1: 'addrStreet',
                city: 'addrCity',
                statecode: 'addrState',
                zipcode: 'addrZip',
                mobilephone: 'phone',
                email: 'email',
                dateofbirth: 'dob',
                notes: 'importNotes',
                quotetype: 'qType'
            };

            const field = map[key];
            if (field) data[field] = value;
        });

        if (data.addrState) data.addrState = data.addrState.toUpperCase();
        if (data.qType) {
            const qt = data.qType.toLowerCase();
            if (['home','auto','both'].includes(qt)) data.qType = qt;
        }
        return data;
    },

    exportCMSMTF() {
        const result = this.buildCMSMTF(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('CMSMTF', result.filename);
        this.toast('\u{1F525} HawkSoft File Generated!');
    },

    buildCMSMTF(data) {
        // HawkSoft Tagged File Format: “fieldname = value” per line
        // Variable names from official HS6_Multico_Tagged_Field_Format templates
        const qType = data.qType || 'both';
        const includeHome = qType === 'home' || qType === 'both';
        const includeAuto = qType === 'auto' || qType === 'both';
        const drivers = this.drivers || [];
        const vehicles = this.vehicles || [];

        function _v(val) {
            if (val === null || val === undefined) return '';
            return String(val).trim();
        }
        function _line(key, val) {
            const v = _v(val);
            return v ? `${key} = ${v}` : '';
        }
        function _dateHS(val) {
            // HawkSoft expects MM/DD/YYYY
            if (!val) return '';
            const d = new Date(val);
            if (Number.isNaN(d.getTime())) return _v(val);
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            const yyyy = String(d.getUTCFullYear());
            return `${mm}/${dd}/${yyyy}`;
        }
        function _genderHS(val) {
            // drv_sSex accepts M or F per official template
            if (!val) return '';
            const v = _v(val).toUpperCase();
            if (v === 'M' || v === 'MALE') return 'M';
            if (v === 'F' || v === 'FEMALE') return 'F';
            return _v(val);
        }

        // Determine LOB code and policy type
        const lobCode = includeHome && includeAuto ? 'HOME' : includeHome ? 'HOME' : 'AUTOP';
        const policyType = includeHome ? 'HOME' : 'AUTO';
        const policyTitle = includeHome && includeAuto ? 'Home & Auto'
            : includeHome ? 'Homeowners' : 'Personal Auto';

        const lines = [];

        // ── Client Information (gen_*) ──
        lines.push(_line('gen_sCustType', 'Personal'));
        lines.push(_line('gen_sLastName', data.lastName));
        lines.push(_line('gen_sFirstName', data.firstName));
        lines.push(_line('gen_cInitial', (data.middleName || '').charAt(0)));
        lines.push(_line('gen_sAddress1', data.addrStreet));
        lines.push(_line('gen_sCity', data.addrCity));
        lines.push(_line('gen_sState', data.addrState));
        lines.push(_line('gen_sZip', data.addrZip));
        lines.push(_line('gen_sPhone', data.phone));
        lines.push(_line('gen_sCellPhone', data.phone));
        lines.push(_line('gen_sEmail', data.email));
        lines.push(_line('gen_sClientSource', data.referralSource));

        // ── Client Misc Data (unmapped personal fields → gen_sClientMiscData[x]) ──
        const misc = [];
        if (data.dob) misc.push(`DOB: ${_dateHS(data.dob)}`);
        if (data.gender) misc.push(`Gender: ${_genderHS(data.gender)}`);
        if (data.maritalStatus) misc.push(`Marital Status: ${data.maritalStatus}`);
        if (data.education) misc.push(`Education: ${data.education}`);
        if (data.industry) misc.push(`Industry: ${data.industry}`);
        if (data.occupation) misc.push(`Occupation: ${data.occupation}`);
        if (data.prefix) misc.push(`Prefix: ${data.prefix}`);
        if (data.suffix) misc.push(`Suffix: ${data.suffix}`);
        // Co-applicant info in misc if present
        if (data.hasCoApplicant === 'yes' && (data.coFirstName || data.coLastName)) {
            misc.push(`Co-Applicant: ${_v(data.coFirstName)} ${_v(data.coLastName)}`.trim());
            if (data.coDob) misc.push(`Co-App DOB: ${_dateHS(data.coDob)}`);
            if (data.coGender) misc.push(`Co-App Gender: ${_genderHS(data.coGender)}`);
            if (data.coRelationship) misc.push(`Co-App Relationship: ${data.coRelationship}`);
            if (data.coEmail) misc.push(`Co-App Email: ${data.coEmail}`);
            if (data.coPhone) misc.push(`Co-App Phone: ${data.coPhone}`);
            if (data.coOccupation) misc.push(`Co-App Occupation: ${data.coOccupation}`);
            if (data.coMaritalStatus) misc.push(`Co-App Marital: ${data.coMaritalStatus}`);
        }
        if (data.contactTime) misc.push(`Best Contact Time: ${data.contactTime}`);
        if (data.contactMethod) misc.push(`Contact Method: ${data.contactMethod}`);
        if (data.tcpaConsent) misc.push('TCPA Consent: Yes');
        if (data.creditCheckAuth) misc.push('Credit Check Authorized: Yes');
        // Prior insurance details not captured in direct fields
        if (data.continuousCoverage) misc.push(`Continuous Coverage: ${data.continuousCoverage}`);
        if (data.priorLiabilityLimits) misc.push(`Prior Liability Limits: ${data.priorLiabilityLimits}`);
        if (data.priorPolicyTerm) misc.push(`Prior Policy Term: ${data.priorPolicyTerm}`);
        if (data.priorExp) misc.push(`Prior Expiration: ${_dateHS(data.priorExp)}`);
        if (data.yearsAtAddress) misc.push(`Years at Address: ${data.yearsAtAddress}`);

        // Write misc data across three banks (0-9 each)
        for (let i = 0; i < misc.length && i < 10; i++) {
            lines.push(_line(`gen_sClientMiscData[${i}]`, misc[i]));
        }
        for (let i = 10; i < misc.length && i < 20; i++) {
            lines.push(_line(`gen_sClientMisc2Data[${i - 10}]`, misc[i]));
        }
        for (let i = 20; i < misc.length && i < 30; i++) {
            lines.push(_line(`gen_sClientMisc3Data[${i - 20}]`, misc[i]));
        }

        // ── Policy Information ──
        lines.push(_line('gen_sCMSPolicyType', policyType));
        lines.push(_line('gen_sApplicationType', 'Personal'));
        lines.push(_line('gen_sPolicyTitle', policyTitle));
        lines.push(_line('gen_sLOBCode', lobCode));
        lines.push(_line('gen_tEffectiveDate', data.effectiveDate ? _dateHS(data.effectiveDate) : '(today)'));
        lines.push(_line('gen_sLeadSource', data.referralSource));
        lines.push(_line('gen_nTerm', data.policyTerm));
        // gen_nClientStatus and gen_sStatus should be used exclusively (not both)
        lines.push(_line('gen_nClientStatus', 'Prospect'));

        // gen_sForm is required even if blank to distinguish Auto from Home
        if (includeHome) {
            lines.push(_line('gen_sForm', data.homePolicyType || 'HO3'));
        } else if (includeAuto) {
            lines.push(_line('gen_sForm', data.autoPolicyType || 'Standard'));
        }

        // ── Garaging / Property Address ──
        const gAddr = data.primaryHomeAddr || data.addrStreet;
        const gCity = data.primaryHomeCity || data.addrCity;
        const gState = data.primaryHomeState || data.addrState;
        const gZip = data.primaryHomeZip || data.addrZip;
        lines.push(_line('gen_sGAddress', gAddr));
        lines.push(_line('gen_sGCity', gCity));
        lines.push(_line('gen_sGState', gState));
        lines.push(_line('gen_sGZip', gZip));
        lines.push(_line('gen_sCounty', data.county));

        // ── Home/Property Fields (when quoting home) ──
        if (includeHome) {
            lines.push(_line('gen_sProtectionClass', data.protectionClass));
            lines.push(_line('gen_nYearBuilt', data.yrBuilt));
            lines.push(_line('gen_sConstruction', data.constructionStyle));
            lines.push(_line('gen_sBurgAlarm', data.burglarAlarm));
            lines.push(_line('gen_sFireAlarm', data.fireAlarm || data.smokeDetector));
            lines.push(_line('gen_sSprinkler', data.sprinklers));
            lines.push(_line('gen_bDeadBolt', data.deadbolt === 'Yes' ? 'Y' : ''));
            lines.push(_line('gen_bFireExtinguisher', data.fireExtinguisher === 'Yes' ? 'Y' : ''));

            // Coverage A-D
            lines.push(_line('gen_lCovA', data.dwellingCoverage));
            lines.push(_line('gen_lCovB', data.otherStructures));
            lines.push(_line('gen_lCovC', data.homePersonalProperty));
            lines.push(_line('gen_lCovD', data.homeLossOfUse));
            lines.push(_line('gen_sLiability', data.personalLiability));
            lines.push(_line('gen_sMedical', data.medicalPayments));
            lines.push(_line('gen_sDeduct', data.homeDeductible));

            // Endorsements
            lines.push(_line('gen_bEarthquake', data.earthquakeCoverage === 'Yes' ? 'Y' : ''));
            lines.push(_line('gen_sEQDeduct', data.earthquakeDeductible));
            lines.push(_line('gen_lOrdinanceOrLawIncr', data.ordinanceOrLaw));
            lines.push(_line('gen_lJewelry', data.jewelryLimit));
            lines.push(_line('gen_nAdditionalRes', data.increasedReplacementCost));

            // Multi-policy credit (home + auto bundle)
            if (includeAuto) {
                lines.push(_line('gen_bMultiPolicy', 'Y'));
            }

            // Mortgagee / Lienholder
            if (data.mortgagee) {
                lines.push(_line('gen_sLPType1', 'Mortgagee'));
                lines.push(_line('gen_sLpName1', data.mortgagee));
            }

            // Territory (use zip code)
            lines.push(_line('hpm_sTerritory', data.addrZip));
            if (data.earthquakeZone) {
                lines.push(_line('hpm_sEarthquakeZone', data.earthquakeZone));
            }
        }

        // ── Auto Coverage (when quoting auto) ──
        if (includeAuto) {
            lines.push(_line('gen_sBi', data.liabilityLimits));
            lines.push(_line('gen_sPd', data.pdLimit));
            lines.push(_line('gen_sUmBi', data.umLimits));
            lines.push(_line('gen_sUimBi', data.uimLimits));
            lines.push(_line('gen_sUmPd', data.umpdLimit));
            lines.push(_line('gen_sMedical', data.medPayments));
            lines.push(_line('gen_sTypeOfPolicy', data.autoPolicyType));

            // ── Vehicles (veh_*[index]) ──
            vehicles.forEach((veh, i) => {
                lines.push(_line(`veh_sYr[${i}]`, veh.year));
                lines.push(_line(`veh_sMake[${i}]`, veh.make));
                lines.push(_line(`veh_sModel[${i}]`, veh.model));
                lines.push(_line(`veh_sVIN[${i}]`, veh.vin));
                lines.push(_line(`veh_sUse[${i}]`, veh.use));
                lines.push(_line(`veh_lMileage[${i}]`, veh.miles));
                lines.push(_line(`veh_sComp[${i}]`, data.compDeductible));
                lines.push(_line(`veh_sColl[${i}]`, data.autoDeductible));
                lines.push(_line(`veh_sTowing[${i}]`, data.towingDeductible));
                lines.push(_line(`veh_sRentRemb[${i}]`, data.rentalDeductible));
                lines.push(_line(`veh_sGaragingZip[${i}]`, gZip));
                // Link to primary driver (1-based index)
                const driverIdx = drivers.findIndex(d => d.id === veh.primaryDriver);
                if (driverIdx >= 0) lines.push(_line(`veh_nDriver[${i}]`, driverIdx + 1));
            });

            // ── Drivers (drv_*[index]) ──
            drivers.forEach((drv, i) => {
                lines.push(_line(`drv_sFirstName[${i}]`, drv.firstName));
                lines.push(_line(`drv_sLastName[${i}]`, drv.lastName));
                lines.push(_line(`drv_tBirthDate[${i}]`, _dateHS(drv.dob)));
                lines.push(_line(`drv_sLicenseNum[${i}]`, drv.dlNum));
                lines.push(_line(`drv_sLicensingState[${i}]`, drv.dlState));
                lines.push(_line(`drv_sSex[${i}]`, _genderHS(drv.gender)));
                lines.push(_line(`drv_sMaritalStatus[${i}]`, drv.maritalStatus));
                lines.push(_line(`drv_sDriversOccupation[${i}]`, drv.occupation));
                lines.push(_line(`drv_sRelationship[${i}]`, drv.relationship));
                if (drv.isPrimaryApplicant) lines.push(_line(`drv_bPrincipleOperator[${i}]`, 'Yes'));
                if (drv.accidents) lines.push(_line(`drv_nPoints[${i}]`, drv.accidents));
                if (drv.studentGPA) lines.push(_line(`drv_bGoodStudent[${i}]`, 'Yes'));
            });
        }

        // ── Prior Insurance ──
        if (includeAuto && data.priorCarrier) {
            lines.push(_line('gen_sFSCNotes', `Prior Auto: ${data.priorCarrier}` +
                (data.priorYears ? `, ${data.priorYears} yrs` : '') +
                (data.priorExp ? `, exp ${_dateHS(data.priorExp)}` : '')));
        }
        if (includeHome && (data.homePriorCarrier || data.priorCarrier)) {
            const carrier = data.homePriorCarrier || data.priorCarrier;
            const years = data.homePriorYears || data.priorYears;
            const existing = lines.find(l => l.startsWith('gen_sFSCNotes'));
            if (existing) {
                const idx = lines.indexOf(existing);
                lines[idx] = existing + ` | Prior Home: ${carrier}` + (years ? `, ${years} yrs` : '');
            } else {
                lines.push(_line('gen_sFSCNotes', `Prior Home: ${carrier}` + (years ? `, ${years} yrs` : '')));
            }
        }

        // ── Comprehensive Client Notes ──
        const notesParts = [];
        notesParts.push(`Quote Type: ${policyTitle}`);
        if (data.dob) notesParts.push(`DOB: ${_dateHS(data.dob)}`);
        if (data.maritalStatus) notesParts.push(`Marital: ${data.maritalStatus}`);
        if (data.occupation) notesParts.push(`Occupation: ${data.occupation}`);

        if (includeHome) {
            const homeParts = [];
            if (data.dwellingType) homeParts.push(`Type: ${data.dwellingType}`);
            if (data.dwellingUsage) homeParts.push(`Usage: ${data.dwellingUsage}`);
            if (data.yrBuilt) homeParts.push(`Built: ${data.yrBuilt}`);
            if (data.sqFt) homeParts.push(`${data.sqFt} sqft`);
            if (data.numStories) homeParts.push(`${data.numStories} stories`);
            if (data.fullBaths) homeParts.push(`${data.fullBaths} baths`);
            if (data.exteriorWalls) homeParts.push(`Walls: ${data.exteriorWalls}`);
            if (data.foundation) homeParts.push(`Foundation: ${data.foundation}`);
            if (data.roofType) homeParts.push(`Roof: ${data.roofType}`);
            if (data.roofYr) homeParts.push(`Roof Yr: ${data.roofYr}`);
            if (data.roofShape) homeParts.push(`Roof Shape: ${data.roofShape}`);
            if (data.heatingType) homeParts.push(`Heat: ${data.heatingType}`);
            if (data.cooling) homeParts.push(`Cool: ${data.cooling}`);
            if (data.heatYr) homeParts.push(`Heat Yr: ${data.heatYr}`);
            if (data.plumbYr) homeParts.push(`Plumb Yr: ${data.plumbYr}`);
            if (data.elecYr) homeParts.push(`Elec Yr: ${data.elecYr}`);
            if (data.pool && data.pool !== 'None') homeParts.push(`Pool: ${data.pool}`);
            if (data.trampoline && data.trampoline !== 'No') homeParts.push(`Trampoline: ${data.trampoline}`);
            if (data.woodStove && data.woodStove !== 'None') homeParts.push(`Wood Stove: ${data.woodStove}`);
            if (data.dogInfo) homeParts.push(`Dogs: ${data.dogInfo}`);
            if (data.businessOnProperty && data.businessOnProperty !== 'No') homeParts.push(`Business on Property: ${data.businessOnProperty}`);
            if (data.windDeductible) homeParts.push(`Wind Ded: ${data.windDeductible}`);
            if (data.waterBackup && data.waterBackup !== 'No') homeParts.push(`Water Backup: ${data.waterBackup}`);
            if (data.animalLiability && data.animalLiability !== 'No') homeParts.push(`Animal Liability: ${data.animalLiability}`);
            if (data.equipmentBreakdown && data.equipmentBreakdown !== 'No') homeParts.push(`Equip Breakdown: ${data.equipmentBreakdown}`);
            if (data.serviceLine && data.serviceLine !== 'No') homeParts.push(`Service Line: ${data.serviceLine}`);
            if (data.garageType) homeParts.push(`Garage: ${data.garageType} (${data.garageSpaces || '?'} spaces)`);
            if (homeParts.length) notesParts.push(`HOME: ${homeParts.join(', ')}`);
        }

        if (includeAuto && vehicles.length) {
            notesParts.push(`VEHICLES: ${vehicles.map((v, i) => `${i + 1}) ${v.year || ''} ${v.make || ''} ${v.model || ''} VIN:${v.vin || 'N/A'}`).join('; ')}`);
        }
        if (data.additionalInsureds) notesParts.push(`Additional Insureds: ${data.additionalInsureds}`);
        if (data.pdfNotes) notesParts.push(`Notes: ${data.pdfNotes}`);

        lines.push(_line('gen_sClientNotes', notesParts.join(' | ')));

        // Filter empty lines and join
        const content = lines.filter(l => l).join('\n');

        return { content, filename: `Lead_${data.lastName || 'Export'}.cmsmtf`, mime: 'text/plain;charset=utf-8' };
    },

    // â”€â”€â”€ Shared Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Escape for safe HTML attribute/text content insertion
    _escapeAttr(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // Shared system prompt for policy scan extraction (used by processScan + processScanFromText)
    _getScanSystemPrompt() {
        return 'You are a senior insurance underwriter and document analyst with 20+ years experience reading policies from every major US carrier ' +
            '(State Farm, Allstate, Progressive, GEICO, Farmers, Safeco, Liberty Mutual, Nationwide, USAA, Erie, Travelers, Hartford, Auto-Owners, ' +
            'American Family, Encompass, MetLife, Kemper, Mercury, Bristol West, National General, Foremost, Stillwater, and many others). ' +
            'You have deep expertise in reading Declarations Pages (dec pages), policy jackets, renewal notices, endorsement pages, and binders. ' +
            'You understand that every carrier formats their documents differently — some use tables, some use flowing text, some use numbered sections. ' +
            'You know that the DECLARATIONS PAGE is the most data-rich page and typically contains: named insured, policy number, effective/expiration dates, ' +
            'coverages with limits, deductibles, vehicles with VINs, listed drivers, premium breakdowns, property address, and mortgagee/lienholder info. ' +
            'You can distinguish between AGENT/AGENCY information and INSURED/POLICYHOLDER information — these are different people. ' +
            'The insured is the customer; the agent is the seller. Only extract the INSURED\'s personal info. ' +
            'You understand that "Named Insured", "Policyholder", "Insured", "Primary Insured", and "First Named Insured" all refer to the same person. ' +
            'You know coverage terminology: "BI" = Bodily Injury, "PD" = Property Damage, "UM/UIM" = Uninsured/Underinsured Motorist, ' +
            '"Comp" = Comprehensive, "Coll" = Collision, "Med Pay" = Medical Payments, "PIP" = Personal Injury Protection. ' +
            'For limits shown as "100/300/100" you know this means $100k BI per person / $300k BI per accident / $100k PD. ' +
            'You recognize home policy types: HO-3 (standard homeowner), HO-5 (comprehensive), HO-4 (renter), HO-6 (condo), DP-1/DP-3 (dwelling/landlord). ' +
            'When reading multi-page documents, you extract data from ALL pages and merge/reconcile. If there are conflicts between pages, prefer the dec page. ' +
            'You handle poor quality scans, rotated pages, faxed documents, and partially obscured text by inferring from context when possible. ' +
            '\n\nCRITICAL FORMATTING RULES:\n' +
            '- Return ONLY valid JSON — no markdown fences, no commentary before or after the JSON.\n' +
            '- Use empty strings "" for any data not found. Never use null.\n' +
            '- Normalize ALL dates to YYYY-MM-DD format (e.g., "01/15/2024" → "2024-01-15").\n' +
            '- Normalize currency to plain numbers without $ or commas (e.g., "$1,250" → "1250").\n' +
            '- State abbreviations must be 2-letter codes (e.g., "Washington" → "WA").\n' +
            '- Confidence scores: 0.0 (not found/guessed) to 1.0 (clearly readable). Use 0.5-0.7 for inferred values.\n' +
            '- quality_issues array: list any blurry text, missing pages, ambiguous data, or low-confidence extractions.\n' +
            '\nEXAMPLE OUTPUT STRUCTURE:\n' +
            '{"fields":{"firstName":"John","lastName":"Smith","dob":"1985-03-15","addrStreet":"123 Main St","addrCity":"Seattle","addrState":"WA","addrZip":"98101",...},' +
            '"confidence":{"firstName":0.95,"lastName":0.95,"dob":0.8,...},"quality_issues":["Page 2 was partially cut off","Prior carrier name unclear"]}';
    },

    // Shared Gemini scan schema (used by processScan + processScanFromText)
    _getScanSchema() {
        const fieldProps = {
            // Applicant
            prefix: { type: 'string' }, firstName: { type: 'string' }, lastName: { type: 'string' }, suffix: { type: 'string' },
            dob: { type: 'string' }, gender: { type: 'string' }, maritalStatus: { type: 'string' },
            phone: { type: 'string' }, email: { type: 'string' },
            education: { type: 'string' }, occupation: { type: 'string' }, industry: { type: 'string' },
            // Co-Applicant
            coFirstName: { type: 'string' }, coLastName: { type: 'string' },
            coDob: { type: 'string' }, coGender: { type: 'string' }, coEmail: { type: 'string' }, coPhone: { type: 'string' }, coRelationship: { type: 'string' },
            // Address
            addrStreet: { type: 'string' }, addrCity: { type: 'string' },
            addrState: { type: 'string' }, addrZip: { type: 'string' },
            yearsAtAddress: { type: 'string' }, county: { type: 'string' },
            // Property
            dwellingUsage: { type: 'string' }, occupancyType: { type: 'string' },
            yrBuilt: { type: 'string' }, sqFt: { type: 'string' }, dwellingType: { type: 'string' },
            roofType: { type: 'string' }, roofShape: { type: 'string' }, roofYr: { type: 'string' },
            constructionStyle: { type: 'string' },
            numStories: { type: 'string' }, foundation: { type: 'string' },
            exteriorWalls: { type: 'string' }, heatingType: { type: 'string' },
            cooling: { type: 'string' }, heatYr: { type: 'string' },
            plumbYr: { type: 'string' }, elecYr: { type: 'string' },
            sewer: { type: 'string' }, waterSource: { type: 'string' },
            garageType: { type: 'string' }, garageSpaces: { type: 'string' }, lotSize: { type: 'string' },
            numOccupants: { type: 'string' }, bedrooms: { type: 'string' },
            fullBaths: { type: 'string' }, halfBaths: { type: 'string' },
            kitchenQuality: { type: 'string' }, flooring: { type: 'string' },
            numFireplaces: { type: 'string' }, purchaseDate: { type: 'string' },
            pool: { type: 'string' }, trampoline: { type: 'string' }, dogInfo: { type: 'string' },
            businessOnProperty: { type: 'string' }, woodStove: { type: 'string' },
            // Safety & Protection
            burglarAlarm: { type: 'string' }, fireAlarm: { type: 'string' },
            sprinklers: { type: 'string' }, smokeDetector: { type: 'string' },
            fireStationDist: { type: 'string' }, fireHydrantFeet: { type: 'string' }, protectionClass: { type: 'string' },
            // Home Coverage
            homePolicyType: { type: 'string' }, dwellingCoverage: { type: 'string' },
            personalLiability: { type: 'string' }, medicalPayments: { type: 'string' },
            homeDeductible: { type: 'string' }, windDeductible: { type: 'string' }, mortgagee: { type: 'string' },
            // Auto / Vehicles
            vin: { type: 'string' }, vehDesc: { type: 'string' },
            autoPolicyType: { type: 'string' },
            liabilityLimits: { type: 'string' }, pdLimit: { type: 'string' },
            umLimits: { type: 'string' }, uimLimits: { type: 'string' },
            compDeductible: { type: 'string' }, autoDeductible: { type: 'string' },
            medPayments: { type: 'string' },
            rentalDeductible: { type: 'string' }, towingDeductible: { type: 'string' },
            studentGPA: { type: 'string' },
            // Policy / Prior
            policyNumber: { type: 'string' },
            effectiveDate: { type: 'string' }, policyTerm: { type: 'string' },
            priorCarrier: { type: 'string' }, priorExp: { type: 'string' },
            priorPolicyTerm: { type: 'string' }, priorLiabilityLimits: { type: 'string' },
            priorYears: { type: 'string' }, continuousCoverage: { type: 'string' },
            homePriorCarrier: { type: 'string' }, homePriorExp: { type: 'string' },
            homePriorPolicyTerm: { type: 'string' }, homePriorYears: { type: 'string' },
            accidents: { type: 'string' }, violations: { type: 'string' },
            // Additional
            additionalInsureds: { type: 'string' },
            contactTime: { type: 'string' }, referralSource: { type: 'string' },
            additionalVehicles: { type: 'string' }, additionalDrivers: { type: 'string' },
        };
        const confProps = {};
        Object.keys(fieldProps).forEach(k => { confProps[k] = { type: 'number' }; });
        return {
            type: 'object',
            properties: {
                fields: { type: 'object', properties: fieldProps },
                confidence: { type: 'object', properties: confProps },
                quality_issues: { type: 'array', items: { type: 'string' } }
            },
            required: ['fields']
        };
    },
});
