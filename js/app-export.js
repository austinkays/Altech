// js/app-export.js — Export engines (PDF, CMSMTF, Text/CSV)
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {
    async exportPDF() {
        const result = await this.buildPDF(this.data);
        this.downloadBlob(result.blob, result.filename);
        this.logExport('PDF', result.filename);
        this.toast('âœ“ PDF downloaded successfully');
    },

    exportText() {
        const result = this.buildText(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('Text', result.filename);
        this.toast('ðŸ“ Text summary downloaded');
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

        // ── Minimal toner-friendly palette ──────────────────────────────
        const INK   = [30, 30, 30];      // near-black text
        const MID   = [120, 120, 120];   // grey labels / secondary text
        const LIGHT = [200, 200, 200];   // borders
        const RULE  = [230, 230, 230];   // very light dividers
        const FILL  = [245, 245, 245];   // barely-there header fill
        const WHITE = [255, 255, 255];
        const ACCENT= [80, 80, 80];      // dark accent for header bar

        // ── Utility helpers ──────────────────────────────────────────────
        let y = mg;

        const addPage = () => { doc.addPage(); y = mg; };
        const need = (h) => { if (y + h > pageH - 16) addPage(); };

        const v = (key) => {
            if (data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== '')
                return String(data[key]);
            const el = document.getElementById(key);
            if (el) return (el.type === 'checkbox' ? (el.checked ? 'Yes' : '') : (el.value || '')).trim();
            return '';
        };

        const fmtDate = (val) => {
            if (!val) return '';
            const d = new Date(val);
            if (isNaN(d)) return val;
            return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
        };
        const fmtMoney = (val) => {
            if (!val) return '';
            const n = parseFloat(String(val).replace(/[$,\s]/g,''));
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
                doc.line(mg, pageH-12, pageW-mg, pageH-12);
                doc.text('Altech Insurance Tools', mg, pageH-8);
                doc.text(`Page ${i} of ${total}`, pageW/2, pageH-8, {align:'center'});
                doc.text(fmtDateTime(new Date()), pageW-mg, pageH-8, {align:'right'});
            }
        };

        // ─── Section label (thin rule + small caps label) ────────────────
        const sectionLabel = (title) => {
            need(10);
            y += 3;
            doc.setDrawColor(...RULE); doc.setLineWidth(0.4);
            doc.line(mg, y, pageW-mg, y);
            doc.setFontSize(6.5); doc.setFont(undefined,'bold');
            doc.setTextColor(...MID);
            doc.text(title.toUpperCase(), mg, y+4.5);
            doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
            y += 7;
        };

        // ─── Sub-header (small caps, no fill, just bold text + underline) ─
        const subHeader = (title) => {
            need(8);
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
        const kvRow = (fields, cols = 2) => {
            const rows = [];
            const filtered = fields.filter(([,val]) => val && String(val).trim());
            for (let i = 0; i < filtered.length; i += cols) rows.push(filtered.slice(i, i+cols));
            const rowH = 4.8;
            rows.forEach((row, ri) => {
                need(rowH + 1);
                if (ri % 2 === 1) {
                    doc.setFillColor(...FILL);
                    doc.rect(mg, y-0.5, cw, rowH+0.5, 'F');
                }
                const colW = cw / cols;
                row.forEach(([label, value], ci) => {
                    const x = mg + ci * colW;
                    const labelW = colW * 0.38;
                    doc.setFontSize(7); doc.setFont(undefined,'bold'); doc.setTextColor(...MID);
                    doc.text(String(label), x+1, y+3.4);
                    doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
                    const valStr = String(value);
                    const maxW = colW - labelW - 4;
                    const lines = doc.splitTextToSize(valStr, maxW);
                    doc.text(lines[0], x + labelW, y+3.4);
                });
                y += rowH;
            });
            y += 2;
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

        // Thin accent bar at top
        doc.setFillColor(...ACCENT);
        doc.rect(0, 0, pageW, 1.5, 'F');
        y = 6;

        // Logo + agency name on left, doc ref on right
        const logoH = 14;
        if (logoImg?.dataUrl) {
            doc.addImage(logoImg.dataUrl, logoImg.format, mg, y, logoH, logoH);
        }
        const txtX = mg + (logoImg?.dataUrl ? logoH + 3 : 0);
        doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
        doc.text('Altech Insurance', txtX, y+6);
        doc.setFontSize(7.5); doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
        doc.text('Insurance Application Summary', txtX, y+11);
        doc.setFontSize(7); doc.setTextColor(...MID);
        doc.text(docRef, pageW-mg, y+4, {align:'right'});
        doc.text(fmtDateTime(new Date()), pageW-mg, y+9, {align:'right'});
        y += logoH + 4;

        // Thin rule
        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
        doc.line(mg, y, pageW-mg, y);
        y += 4;

        // ════════════════════════════════════════════════════════════════
        //  ② PROPERTY PHOTO + CLIENT SUMMARY CARD (side by side)
        // ════════════════════════════════════════════════════════════════
        const photoW = mapImages?.streetView?.dataUrl ? 72 : 0;
        const cardX  = mg + (photoW > 0 ? photoW + 4 : 0);
        const cardW  = cw - (photoW > 0 ? photoW + 4 : 0);
        const blockH = 38;

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
        doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
        doc.text(clientName, cardX+6, y+8);
        doc.setFontSize(7.5); doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
        doc.text(qLabel, pageW-mg-2, y+8, {align:'right'});

        // Address
        doc.setFontSize(8); doc.setTextColor(...INK);
        doc.text(address || addrLine, cardX+6, y+14);

        // Thin rule
        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
        doc.line(cardX+4, y+17, pageW-mg-2, y+17);

        // Key stats row
        const stats = [];
        if (v('dob')) stats.push(['DOB', fmtDate(v('dob'))]);
        if (v('phone')) stats.push(['Phone', v('phone')]);
        if (v('email')) stats.push(['Email', v('email')]);
        const statColW = cardW / Math.max(stats.length, 1);
        stats.forEach(([lbl, val], i) => {
            const sx = cardX + 6 + i * statColW;
            doc.setFontSize(6.5); doc.setFont(undefined,'bold'); doc.setTextColor(...MID);
            doc.text(lbl, sx, y+22);
            doc.setFontSize(7.5); doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
            doc.text(val, sx, y+27);
        });

        // Second rule
        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
        doc.line(cardX+4, y+29, pageW-mg-2, y+29);

        // Coverage highlights
        const hi = [];
        if (showHome && v('dwellingCoverage')) hi.push(`Dwelling ${fmtMoney(v('dwellingCoverage'))}`);
        if (showHome && v('homeDeductible'))   hi.push(`Ded. ${fmtMoney(v('homeDeductible'))}`);
        if (showAuto && v('liabilityLimits'))  hi.push(`Liability ${v('liabilityLimits')}`);
        if (showAuto && vehicles.length)       hi.push(`${vehicles.length} Vehicle${vehicles.length>1?'s':''}`);
        if (showAuto && drivers.length)        hi.push(`${drivers.length} Driver${drivers.length>1?'s':''}`);
        if (v('effectiveDate'))                hi.push(`Eff. ${fmtDate(v('effectiveDate'))}`);
        doc.setFontSize(7); doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
        if (hi.length) {
            const hiStr = hi.join('   ·   ');
            doc.text(hiStr, cardX+6, y+35, {maxWidth: cardW-10});
        }

        // Satellite mini-map (bottom-right corner of card)
        if (mapImages?.satellite?.dataUrl) {
            const satW = 18, satH = 14;
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

        y += blockH + 5;

        // ════════════════════════════════════════════════════════════════
        //  ③ PERSONAL INFORMATION
        // ════════════════════════════════════════════════════════════════
        sectionLabel('Client Information');

        subHeader('Applicant');
        kvRow([
            ['Full Name',       clientName],
            ['Date of Birth',   fmtDate(v('dob'))],
            ['Gender',          v('gender')==='M'?'Male': v('gender')==='F'?'Female': v('gender')],
            ['Marital Status',  v('maritalStatus')],
            ['Phone',           v('phone')],
            ['Email',           v('email')],
            ['Education',       v('education')],
            ['Industry',        v('industry')],
            ['Occupation',      v('occupation')],
            ['Yrs at Address',  v('yearsAtAddress')],
        ], 2);

        // Co-applicant
        if (data.hasCoApplicant === 'yes' && (data.coFirstName || data.coLastName)) {
            subHeader('Co-Applicant');
            kvRow([
                ['Full Name',       `${data.coFirstName||''} ${data.coLastName||''}`.trim()],
                ['Date of Birth',   fmtDate(v('coDob'))],
                ['Gender',          v('coGender')==='M'?'Male': v('coGender')==='F'?'Female': v('coGender')],
                ['Marital Status',  v('coMaritalStatus')],
                ['Relationship',    v('coRelationship')],
                ['Phone',           v('coPhone')],
                ['Email',           v('coEmail')],
            ], 2);
        }

        subHeader('Property Address');
        kvRow([
            ['Street',          v('addrStreet')],
            ['City',            v('addrCity')],
            ['State',           v('addrState')],
            ['ZIP',             v('addrZip')],
            ['County',          this.getCountyFromCity(data.addrCity, data.addrState) || ''],
            ['Residence Is',    v('residenceIs')],
        ], 3);

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
                ['Heating',          v('heatingType')],
                ['Heat Updated',     v('heatYr')],
                ['Cooling',          v('cooling')],
                ['Plumbing Updated', v('plumbYr')],
                ['Electric Updated', v('elecYr')],
                ['Sewer',            v('sewer')],
                ['Water Source',     v('waterSource')],
            ], 3);

            subHeader('Risk & Protection');
            kvRow([
                ['Burglar Alarm',   v('burglarAlarm')],
                ['Fire Alarm',      v('fireAlarm')],
                ['Smoke Detector',  v('smokeDetector')],
                ['Sprinklers',      v('sprinklers')],
                ['Pool',            v('pool')||'No'],
                ['Trampoline',      v('trampoline')||'No'],
                ['Wood Stove',      v('woodStove')||'None'],
                ['Dog on Premises', v('dogInfo')||'None'],
                ['Business on Prop',v('businessOnProperty')||'No'],
                ['Secondary Heat',  v('secondaryHeating')],
                ['Fire Station',    v('fireStationDist') ? v('fireStationDist')+' mi' : ''],
                ['Fire Hydrant',    v('fireHydrantFeet') ? v('fireHydrantFeet')+' ft' : ''],
                ['Tidal Water',     v('tidalWaterDist') ? v('tidalWaterDist')+' ft' : ''],
                ['Protection Class',v('protectionClass')],
            ], 3);

            subHeader('Home Coverage');
            kvRow([
                ['Policy Type',     v('homePolicyType')],
                ['Dwelling',        fmtMoney(v('dwellingCoverage'))],
                ['Personal Liab.',  fmtMoney(v('personalLiability'))],
                ['Med Payments',    fmtMoney(v('medicalPayments'))],
                ['Deductible',      fmtMoney(v('homeDeductible'))],
                ['Wind/Hail Ded.',  fmtMoney(v('windDeductible'))],
                ['Mortgagee',       v('mortgagee')],
                ['Incr. Repl. Cost',v('increasedReplacementCost')],
                ['Ordinance/Law',   v('ordinanceOrLaw')],
                ['Water Backup',    v('waterBackup')],
                ['Equip. Breakdn',  v('equipmentBreakdown')],
                ['Service Line',    v('serviceLine')],
                ['Animal Liab.',    fmtMoney(v('animalLiability'))],
                ['Earthquake',      v('earthquakeCoverage')],
            ], 3);

            // Risk flags callout
            const flags = [];
            const roofAge = parseInt(v('roofYr')), curY = new Date().getFullYear();
            if (!isNaN(roofAge) && roofAge>1900 && (curY-roofAge)>=20) flags.push(`[!] Roof age ${curY-roofAge} yrs (updated ${roofAge})`);
            const yrB = parseInt(v('yrBuilt'));
            if (!isNaN(yrB) && yrB>1800 && yrB<1970) flags.push(`[!] Year built: ${yrB}`);
            if (v('pool') && v('pool').toLowerCase()!=='no') flags.push('[!] Pool on property');
            if (v('trampoline') && v('trampoline').toLowerCase()!=='no') flags.push('[!] Trampoline');
            if (v('woodStove') && v('woodStove').toLowerCase()!=='none') flags.push(`[!] Wood stove: ${v('woodStove')}`);
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
                        doc.rect(offsetX, cy, cardWid, 5.5, 'F');
                        doc.setFillColor(...ACCENT); doc.rect(offsetX, cy, 2, 5.5, 'F');
                        doc.setFontSize(7.5); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
                        doc.text(name, offsetX+4, cy+3.9);
                        doc.setFontSize(6.5); doc.setFont(undefined,'normal'); doc.setTextColor(...MID);
                        doc.text(d.relationship||'', offsetX+cardWid-2, cy+3.9, {align:'right'});
                        doc.setFont(undefined,'normal'); doc.setTextColor(...INK);

                        const dFields = [
                            ['DOB',         fmtDate(d.dob||'')],
                            ['Gender',      d.gender==='M'?'Male':d.gender==='F'?'Female':(d.gender||'')],
                            ['Marital',     d.maritalStatus||''],
                            ['Education',   d.education||''],
                            ['Occupation',  d.occupation||''],
                            ['License #',   (d.dlNum||'').toUpperCase()],
                            ['Lic. State',  (d.dlState||'').toUpperCase()],
                            ...(d.sr22 && d.sr22!=='No' ? [['SR-22', d.sr22]] : []),
                        ].filter(([,val])=>val);

                        const rowH = 4.5, labW = cardWid*0.38;
                        let ry = cy + 6.5;
                        dFields.forEach(([lbl,val],i) => {
                            if (i%2===1) {
                                doc.setFillColor(...FILL);
                                doc.rect(offsetX, ry-0.5, cardWid, rowH, 'F');
                            }
                            doc.setFontSize(7); doc.setFont(undefined,'bold'); doc.setTextColor(...MID);
                            doc.text(lbl, offsetX+2, ry+3);
                            doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
                            doc.text(val, offsetX+labW, ry+3);
                            ry += rowH;
                        });
                        return ry - cy + 3;
                    };

                    const startY = y;
                    const leftH  = drawDriverCard(left, mg, pairW);
                    if (right) {
                        y = startY;  // reset y so right card starts at same position
                        const rightH = drawDriverCard(right, mg + cw/2 + 2, pairW);
                        y = startY + Math.max(leftH, rightH);
                    } else {
                        y = startY + leftH;
                    }
                    y += 3;
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
                        doc.rect(offsetX, cy, cardWid, 5.5, 'F');
                        doc.setFillColor(...ACCENT); doc.rect(offsetX, cy, 2, 5.5, 'F');
                        doc.setFontSize(7.5); doc.setFont(undefined,'bold'); doc.setTextColor(...INK);
                        doc.text(desc, offsetX+4, cy+3.9);
                        doc.setFont(undefined,'normal');

                        const vFields = [
                            ['VIN',           veh.vin||''],
                            ['Primary Driver', driverName],
                            ['Usage',          veh.use||''],
                            ['Annual Miles',   veh.miles ? Number(veh.miles).toLocaleString() : ''],
                        ].filter(([,val])=>val);

                        const rowH=4.5, labW=cardWid*0.38;
                        let ry=cy+6.5;
                        vFields.forEach(([lbl,val],i)=>{
                            if(i%2===1){doc.setFillColor(...FILL);doc.rect(offsetX,ry-0.5,cardWid,rowH,'F');}
                            doc.setFontSize(7);doc.setFont(undefined,'bold');doc.setTextColor(...MID);
                            doc.text(lbl,offsetX+2,ry+3);
                            doc.setFontSize(8);doc.setFont(undefined,'normal');doc.setTextColor(...INK);
                            doc.text(val,offsetX+labW,ry+3);
                            ry+=rowH;
                        });
                        return ry-cy+3;
                    };

                    const vStartY = y;
                    const leftH = drawVehicleCard(left, mg, pairW);
                    if (right) {
                        y = vStartY;  // reset y so right card starts at same position
                        const rightH = drawVehicleCard(right, mg + cw/2 + 2, pairW);
                        y = vStartY + Math.max(leftH, rightH);
                    } else { y = vStartY + leftH; }
                    y += 3;
                }
            }

            subHeader('Auto Coverage');
            kvRow([
                ['Policy Type',     v('autoPolicyType')],
                ['Liability',       v('liabilityLimits')],
                ['Prop. Damage',    v('pdLimit')],
                ['Med Pay',         fmtMoney(v('medPayments'))],
                ['UM Limits',       v('umLimits')],
                ['UIM Limits',      v('uimLimits')],
                ['UMPD Limit',      v('umpdLimit')],
                ['Comp Ded.',       fmtMoney(v('compDeductible'))],
                ['Collision Ded.',  fmtMoney(v('autoDeductible'))],
                ['Rental',          v('rentalDeductible')],
                ['Towing',          v('towingDeductible')],
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

        if (showHome) {
            subHeader('Home Prior Insurance');
            kvRow([
                ['Prior Carrier',   v('homePriorCarrier') || v('priorCarrier')],
                ['Prior Liability', v('homePriorLiability')],
                ['Prior Term',      v('homePriorPolicyTerm') || v('priorPolicyTerm')],
                ['Yrs w/ Prior',    v('homePriorYears') || v('priorYears')],
                ['Prior Exp.',      fmtDate(v('homePriorExp') || v('priorExp'))],
            ], 3);
        }
        if (showAuto) {
            subHeader('Auto Prior Insurance');
            kvRow([
                ['Prior Carrier',   v('priorCarrier')],
                ['Prior Liability', v('priorLiabilityLimits')],
                ['Prior Term',      v('priorPolicyTerm')],
                ['Yrs w/ Prior',    v('priorYears')],
                ['Prior Exp.',      fmtDate(v('priorExp'))],
            ], 3);
        }

        // ════════════════════════════════════════════════════════════════
        //  ⑦ ADDITIONAL INFORMATION
        // ════════════════════════════════════════════════════════════════
        sectionLabel('Additional Information');
        kvRow([
            ['Additional Insureds', v('additionalInsureds')],
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
            doc.setFontSize(8.5); doc.setFont(undefined,'normal'); doc.setTextColor(...INK);
            const noteLines = doc.splitTextToSize(notes, cw-4);
            noteLines.forEach(line => { need(5.5); doc.text(line, mg+2, y+4); y+=5; });
            y+=3;
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
        this.toast('ðŸ“¥ CSV Generated!');
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
        this.toast('ðŸ“„ CSV template downloaded');
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
            this.toast('âš ï¸ CSV has no rows.');
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
            this.toast(`âœ… Imported ${created} draft${created > 1 ? 's' : ''}`);
        }
        if (errors.length) {
            console.warn('Batch import warnings:', errors);
            this.toast('âš ï¸ Some rows were skipped.');
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
        this.toast('ðŸ“¥ HawkSoft File Generated!');
    },

    buildCMSMTF(data) {
        const qType = data.qType || 'both';
        const includeHome = qType === 'home' || qType === 'both';
        const includeAuto = qType === 'auto' || qType === 'both';
        
        const fields = [
            // â”€â”€ Core Contact â”€â”€
            { tag: 'NAM', value: `${data.firstName || ''} ${data.lastName || ''}`.trim() },
            { tag: 'ADD', value: data.addrStreet },
            { tag: 'CTY', value: data.addrCity },
            { tag: 'STA', value: data.addrState },
            { tag: 'ZIP', value: data.addrZip },
            { tag: 'PHN', value: data.phone ? data.phone.replace(/\D/g, '') : '' },
            { tag: 'EML', value: data.email },
            { tag: 'DOB', value: this.formatDateDisplay(data.dob) },
            { tag: 'MARITAL_STATUS', value: data.maritalStatus },
            { tag: 'EDUCATION', value: data.education },
            { tag: 'INDUSTRY', value: data.industry },
        ];

        // â”€â”€ Co-Applicant â”€â”€
        if (data.hasCoApplicant === 'yes' && (data.coFirstName || data.coLastName)) {
            fields.push(
                { tag: 'CO_NAM', value: `${data.coFirstName || ''} ${data.coLastName || ''}`.trim() },
                { tag: 'CO_DOB', value: this.formatDateDisplay(data.coDob) },
                { tag: 'CO_GENDER', value: data.coGender },
                { tag: 'CO_EML', value: data.coEmail },
                { tag: 'CO_PHN', value: data.coPhone ? data.coPhone.replace(/\D/g, '') : '' },
                { tag: 'CO_REL', value: data.coRelationship }
            );
        }

        // â”€â”€ Home/Property (only when quoting home) â”€â”€
        if (includeHome) {
            fields.push(
                { tag: 'L1', value: data.roofYr },
                { tag: 'L2', value: data.roofType },
                { tag: 'L3', value: data.heatingType },
                { tag: 'L4', value: data.heatYr },
                { tag: 'L5', value: data.plumbYr },
                { tag: 'L6', value: data.elecYr },
                { tag: 'L7', value: data.pool },
                { tag: 'L8', value: data.dogInfo },
                { tag: 'L9', value: data.kitchenQuality },
                { tag: 'L10', value: data.burglarAlarm },
                { tag: 'DWELLING_TYPE', value: data.dwellingType },
                { tag: 'DWELLING_USAGE', value: data.dwellingUsage },
                { tag: 'YEAR_BUILT', value: data.yrBuilt },
                { tag: 'SQ_FT', value: data.sqFt },
                { tag: 'STORIES', value: data.numStories },
                { tag: 'BATHROOMS', value: data.fullBaths },
                { tag: 'CONSTRUCTION', value: data.constructionStyle },
                { tag: 'EXTERIOR_WALLS', value: data.exteriorWalls },
                { tag: 'FOUNDATION', value: data.foundation },
                { tag: 'ROOF_SHAPE', value: data.roofShape },
                { tag: 'COOLING', value: data.cooling },
                { tag: 'FIRE_ALARM', value: data.fireAlarm },
                { tag: 'SPRINKLERS', value: data.sprinklers },
                { tag: 'PROTECTION_CLASS', value: data.protectionClass },
                { tag: 'R2', value: data.trampoline },
                { tag: 'R3', value: data.woodStove },
                { tag: 'R4', value: data.businessOnProperty },
                { tag: 'R5', value: this.formatDateDisplay(data.purchaseDate) },
                { tag: 'R6', value: data.mortgagee }
            );
        }

        // â”€â”€ Auto/Vehicle (only when quoting auto) â”€â”€
        if (includeAuto) {
            fields.push(
                { tag: 'C1', value: data.liabilityLimits },
                { tag: 'C4', value: data.accidents },
                { tag: 'C5', value: data.violations },
                { tag: 'C6', value: data.miles },
                { tag: 'C7', value: data.commuteDist },
                { tag: 'C8', value: data.rideSharing },
                { tag: 'C9', value: data.telematics },
                { tag: 'C10', value: data.studentGPA },
                { tag: 'VIN', value: data.vin },
                { tag: 'VEH', value: data.vehDesc },
                { tag: 'DL_NUM', value: (data.dlNum || '').toUpperCase() },
                { tag: 'DL_STATE', value: data.dlState },
                { tag: 'VEHICLE_USE', value: data.use }
            );
        }

        // â”€â”€ Prior Insurance (split by line of business) â”€â”€
        if (includeAuto) {
            fields.push(
                { tag: 'C2', value: data.priorCarrier },
                { tag: 'C3', value: data.priorYears }
            );
        }
        if (includeHome) {
            fields.push(
                { tag: 'L_PRIOR_CARRIER', value: data.homePriorCarrier || data.priorCarrier },
                { tag: 'L_PRIOR_YEARS', value: data.homePriorYears || data.priorYears }
            );
        }

        // â”€â”€ Shared fields â”€â”€
        fields.push(
            { tag: 'R1', value: includeHome && includeAuto
                ? `Home: ${data.homeDeductible || ''} / Auto: ${data.autoDeductible || ''}`
                : includeHome ? data.homeDeductible : data.autoDeductible },
            { tag: 'R7', value: data.additionalInsureds },
            { tag: 'R8', value: data.contactTime },
            { tag: 'R9', value: data.referralSource },
            { tag: 'R10', value: data.tcpaConsent ? 'Yes - Consented' : 'No' }
        );

        const content = fields
            .filter(f => f.value && f.value.toString().trim() !== '')
            .map(f => `[${f.tag}]${f.value}`)
            .join('\n');

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
