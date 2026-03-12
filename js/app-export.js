// js/app-export.js — Export engines (PDF, CMSMTF, Text/CSV)
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {
    async exportPDF() {
        const result = await this.buildPDF(this.data);
        this.downloadBlob(result.blob, result.filename);
        this.logExport('PDF', result.filename);
        this.toast('\u2713 PDF downloaded successfully');
    },

    exportText() {
        const result = this.buildText(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('Text', result.filename);
        this.toast('📝 Text summary downloaded');
    },

    async buildPDF(data) {
        // Lazy-load jsPDF if not already available (network hiccup, etc.)
        if (!window.jspdf || !window.jspdf.jsPDF) {
            const cdnUrls = [
                'lib/jspdf.umd.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
            ];
            for (const url of cdnUrls) {
                if (window.jspdf && window.jspdf.jsPDF) break;
                try {
                    await new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = url;
                        s.onload = () => resolve();
                        s.onerror = () => reject(new Error('CDN unreachable'));
                        document.head.appendChild(s);
                    });
                } catch (_) { /* try next */ }
            }
        }
        // Normalise uppercase window.jsPDF (older builds)
        if (!window.jspdf && window.jsPDF) window.jspdf = { jsPDF: window.jsPDF };
        if (!window.jspdf || !window.jspdf.jsPDF) {
            this.toast('PDF library not loaded — check your internet connection and reload', 'error');
            throw new Error('jsPDF library not available (window.jspdf is undefined)');
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        let pageNum = 1;

        // Helper: get value from data, falling back to the current DOM
        // element value. This ensures fields with HTML default values
        // (e.g. numStories="1", bedrooms="3") appear even if the user
        // never manually changed them.
        const v = (key) => {
            if (data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== '') {
                return String(data[key]);
            }
            const el = document.getElementById(key);
            if (el) {
                const val = el.type === 'checkbox' ? (el.checked ? 'Yes' : '') : (el.value || '');
                return val.trim();
            }
            return '';
        };

        // ─── Color palette ───────────────────────────────────────────
        const C = {
            navy:     [15, 39, 69],       // #0f2745 — brand navy
            dark:     [26, 26, 26],       // #1a1a1a — body text
            body:     [17, 17, 17],       // #111    — value text
            mid:      [85, 85, 85],       // #555    — address
            label:    [153, 153, 153],    // #999    — field labels
            muted:    [187, 187, 187],    // #bbb    — de-emphasized values + footer
            light:    [221, 227, 235],    // #dde3eb — borders
            rule:     [238, 238, 238],    // #eee    — footer rule
            cardBg:   [247, 249, 252],    // #f7f9fc — applicant card bg
            tint:     [242, 245, 249],    // #f2f5f9 — perceptible at print resolution
            white:    [255, 255, 255],
        };

        // ─── Null-value detection ────────────────────────────────────
        // Returns true for values that should be visually de-emphasized
        const isEmptyish = (val) => {
            if (!val && val !== 0) return true;
            const s = String(val).trim();
            return /^(none|not updated|n\/a|no coverage|unknown)$/i.test(s);
        };

        const formatDate = (value) => {
            if (!value) return '';
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return value;
            // Use UTC getters — ISO date strings parse as midnight UTC;
            // local getters shift the date backward in US timezones (off-by-one)
            return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
        };
        const formatCurrency = (v) => {
            if (!v) return '';
            const num = parseFloat(String(v).replace(/[$,\s]/g, ''));
            if (isNaN(num)) return v;
            return '$' + num.toLocaleString('en-US');
        };
        const formatRental = (val) => {
            if (!val || val === 'No Coverage') return val || '';
            const parts = val.split('/');
            if (parts.length === 2 && !isNaN(parseInt(parts[0])) && !isNaN(parseInt(parts[1]))) {
                return `$${parts[0]}/day, $${parseInt(parts[1]).toLocaleString()} max`;
            }
            if (/^\d+/.test(val)) return '$' + val;
            return val;
        };
        const formatPrefix = (val) => ({ MR: 'Mr.', MRS: 'Mrs.', MS: 'Ms.', DR: 'Dr.' }[val] || val || '');
        const formatSuffix = (val) => ({ JR: 'Jr.', SR: 'Sr.' }[val] || val || '');
        const formatDeductible = (val) => {
            if (!val) return '';
            const s = String(val).trim();
            if (/%/.test(s) || /same as all perils/i.test(s)) return s;
            return formatCurrency(s);
        };
        const formatPhone = (val) => {
            if (!val) return '';
            const digits = String(val).replace(/\D/g, '');
            if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
            if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
            return val;
        };
        const formatDateTime = (value) => {
            const d = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(d.getTime())) return '';
            let hours = d.getHours();
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${formatDate(d)} ${hours}:${minutes} ${ampm}`;
        };

        // ─── Layout constants ────────────────────────────────────────
        // jsPDF default unit is mm; letter = 215.9 × 279.4 mm
        // @page margin: 0.55in top, 0.6in sides, 0.5in bottom = ~14mm/15.2mm/12.7mm
        const margin = 15.2; // 0.6in side margins
        const contentW = pageW - margin * 2;
        let y = 0;

        // ─── Section tint counter (alternates per rendered section) ──
        let sectionIndex = 0;

        // ─── Helpers ─────────────────────────────────────────────────
        const checkPage = (needed = 18) => {
            if (y + needed > pageH - 16) {
                doc.addPage();
                pageNum++;
                y = 14;
                return true;
            }
            return false;
        };

        // Footer — “Generated by...” left, “Page X of Y” right
        // Uses actual page count so it works for 2, 3, or 4-page docs
        const drawFooter = () => {
            const total = doc.internal.getNumberOfPages();
            for (let i = 1; i <= total; i++) {
                doc.setPage(i);
                doc.setDrawColor(...C.rule);
                doc.setLineWidth(0.3);
                doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
                doc.setFontSize(6.5);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(...C.muted);
                doc.text('Generated by Altech Insurance Tools', margin, pageH - 7);
                doc.text(`Page ${i} of ${total}`, pageW - margin, pageH - 7, { align: 'right' });
            }
        };

        // Section header — label left, thin rule fills remaining width (flexbox-style)
        // 7pt bold uppercase #0f2745 | rule: 1px #dde3eb
        // Returns tinted=true if this section should have the alternating tint background
        const sectionHeader = (title) => {
            checkPage(16);
            // No top y-advance here — outgoing kvTable provides 1mm trailing gap
            const labelText = title.toUpperCase();
            doc.setFontSize(7);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...C.navy);
            doc.text(labelText, margin, y + 5.5);
            const labelW = doc.getTextWidth(labelText);
            doc.setDrawColor(...C.light);
            doc.setLineWidth(0.4);
            doc.line(margin + labelW + 2.8, y + 4, pageW - margin, y + 4);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...C.dark);
            y += 7; // label height + 4px margin-below (reduced from 8)
            const tinted = (sectionIndex % 2 === 0); // even index = tinted
            sectionIndex++;
            return tinted;
        };

        // Key-value grid — stacked label/value, alternating section tint support
        // Label: 6.5pt uppercase #999 | Value: 9.5pt medium #111
        // De-emphasizes null-ish values: #bbb italic
        const kvTable = (fields, cols = 3, tinted = false) => {
            const filtered = fields.filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '');
            if (!filtered.length) return;
            const colW = contentW / cols;
            // Cell: 3pt label + 1pt gap + 10pt value + 9pt padding-bottom ≈ 13mm
            const cellH = 13;
            const colGap = 2.8; // column-gap: 8px ≈ 2.8mm
            const usableColW = colW - colGap;
            let col = 0;

            // If only one field will be orphaned in the last row of a multi-col grid,
            // span it across the remaining columns visually
            const spanLast = filtered.length % cols === 1 && cols > 1;

            // Tint background rect for this section if odd-indexed
            // Drawn once per row, not per cell, to avoid overlap
            let rowStartY = y;

            filtered.forEach(([label, value], i) => {
                if (col === 0) {
                    checkPage(cellH + 2);
                    rowStartY = y;
                    if (tinted) {
                        doc.setFillColor(...C.tint);
                        // Width of tint block; height set per-row after layout
                        // We draw it with a fixed height and accept minor imprecision
                        doc.roundedRect(margin - 2, y - 1, contentW + 4, cellH + 1, 1, 1, 'F');
                    }
                }
                const cellX = margin + col * colW;
                const cellY = y;

                // Label — 6.5pt uppercase #999
                doc.setFontSize(6.5);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(...C.label);
                doc.text(label.toUpperCase(), cellX, cellY + 3);

                // Value — 9.5pt medium weight
                const deEmphasize = isEmptyish(value);
                doc.setFontSize(9.5);
                doc.setFont(undefined, deEmphasize ? 'italic' : 'normal');
                doc.setTextColor(...(deEmphasize ? C.muted : C.body));
                const isLastItem = (i === filtered.length - 1);
                const effectiveMaxW = (spanLast && isLastItem) ? usableColW * 2 + colGap : usableColW;
                const valLines = doc.splitTextToSize(String(value), effectiveMaxW);
                doc.text(valLines[0] || '', cellX, cellY + 8.5);
                if (valLines[1]) doc.text(valLines[1], cellX, cellY + 12.5);

                col++;
                if (col >= cols) {
                    col = 0;
                    y += cellH + (valLines[1] ? 4 : 0);
                }
            });
            if (col > 0) {
                // Terminal partial row: spanLast item uses reduced height (4px pb instead of 9px)
                y += spanLast ? cellH - 3 : cellH;
            }
            doc.setFont(undefined, 'normal');
            y += 1; // minimal trailing gap — section header provides its own top margin
        };

        // Single-column detail table for drivers / vehicles
        // Header row: 8pt bold navy + rule | Sub-rows: 7.5pt, label #999, value #111
        const detailTable = (fields) => {
            const filtered = fields.filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '');
            if (!filtered.length) return;
            const rowH = 5.8;
            const labelW = 50;

            filtered.forEach(([label, value], i) => {
                checkPage(rowH + 2);
                const isHeader = !label.startsWith('  ');

                if (isHeader) {
                    if (i > 0) y += 2;
                    doc.setDrawColor(...C.light);
                    doc.setLineWidth(0.4);
                    doc.line(margin, y, margin + contentW, y);
                    doc.setFontSize(8);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(...C.navy);
                    doc.text(label, margin, y + 4.5);
                    doc.setFontSize(8);
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(...C.body);
                    doc.text(String(value), margin + labelW, y + 4.5);
                } else {
                    doc.setFontSize(7.5);
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(...C.label);
                    doc.text(label.trim(), margin + 4, y + 4);
                    const deEmphasize = isEmptyish(value);
                    doc.setTextColor(...(deEmphasize ? C.muted : C.body));
                    doc.setFont(undefined, deEmphasize ? 'italic' : 'normal');
                    doc.text(String(value), margin + labelW, y + 4);
                    doc.setFont(undefined, 'normal');
                }
                y += rowH;
            });
            doc.setDrawColor(...C.light);
            doc.setLineWidth(0.3);
            doc.line(margin, y, margin + contentW, y);
            y += 4;
        };

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  PAGE 1: HEADER
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const address = this.getFullAddress(data);
        const [mapImages, logoImg] = await Promise.all([
            this.getMapImages(address),
            this.fetchImageDataUrl('Resources/altech-logo.png')
        ]);
        const prefix = formatPrefix(v('prefix'));
        const suffix = formatSuffix(v('suffix'));
        const nameParts = [prefix, v('firstName'), v('middleName'), v('lastName'), suffix].filter(Boolean);
        const clientName = nameParts.join(' ') || 'Client';

        y = 11;

        // ── Document header ──────────────────────────────────────────
        // Left: logo + agency name + subtitle | Right: doc ref + timestamp
        const logoH = 11; // ~40px at 96dpi
        const logoW = logoH; // assume square-ish logo
        let headerTextX = margin;
        if (logoImg?.dataUrl) {
            doc.addImage(logoImg.dataUrl, logoImg.format, margin, y - 1, logoW, logoH);
            headerTextX = margin + logoW + 3.5;
        }
        // Agency name — 9pt semibold #0f2745
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...C.navy);
        doc.text('Altech Insurance', headerTextX, y + 4);
        // Subtitle — 6.5pt uppercase #888 letter-spaced
        doc.setFontSize(6.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...C.label);
        doc.text('INSURANCE APPLICATION SUMMARY', headerTextX, y + 9);

        // Doc ref — 8pt medium #0f2745 | Timestamp — 7pt #aaa
        const docRef = `APP-${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...C.navy);
        doc.text(docRef, pageW - margin, y + 4, { align: 'right' });
        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(170, 170, 170); // #aaa
        doc.text(formatDateTime(new Date()), pageW - margin, y + 9, { align: 'right' });

        y += Math.max(logoH + 1, 12);

        // 2px solid #0f2745 separator under header
        doc.setDrawColor(...C.navy);
        doc.setLineWidth(0.7);
        doc.line(margin, y, pageW - margin, y);
        y += 5;

        // ── Applicant card ───────────────────────────────────────────
        // Full-width, background #f7f9fc, border 1px #dde3eb, border-radius 4px
        // Left edge accent: 3px solid #0f2745
        const satW = 32, satH = 25;
        const hasSat = !!(mapImages?.satellite?.dataUrl);
        const cardPadX = 5, cardPadY = 3.5;
        const cardInnerW = hasSat ? contentW - satW - cardPadX - 4 : contentW - cardPadX * 2;
        const cardH = Math.max(32, hasSat ? satH + cardPadY * 2 : 0);

        // Card background fill
        doc.setFillColor(...C.cardBg);
        doc.roundedRect(margin, y, contentW, cardH, 1.4, 1.4, 'F');
        // Card border
        doc.setDrawColor(...C.light);
        doc.setLineWidth(0.4);
        doc.roundedRect(margin, y, contentW, cardH, 1.4, 1.4, 'S');
        // Left accent bar — 3px navy
        doc.setFillColor(...C.navy);
        doc.roundedRect(margin, y, 1, cardH, 0.5, 0.5, 'F');

        // Applicant name — 16pt bold #0f2745
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...C.navy);
        doc.text(clientName, margin + cardPadX, y + cardPadY + 8);

        // Address line — 9pt #555, policy type badge(s) inline
        // Build badge labels from quote type
        const qt = (data.qType || '').toLowerCase();
        const homePT = v('homePolicyType');
        const badges = [];
        if (qt === 'auto') {
            badges.push('AUTO');
        } else if (qt === 'both') {
            badges.push(homePT || 'HOME');
            badges.push('AUTO');
        } else if (homePT) {
            badges.push(homePT);
        }

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...C.mid);
        const addrText = address || '';
        const addrTextW = doc.getTextWidth(addrText);
        const addrY = y + cardPadY + 16;
        doc.text(addrText, margin + cardPadX, addrY);

        // Inline badge(s) after address • separator
        let badgeX = margin + cardPadX + addrTextW;
        if (badges.length) {
            // Dot separator
            doc.setFontSize(9);
            doc.setTextColor(...C.mid);
            doc.text('  \u2022  ', badgeX, addrY);
            badgeX += doc.getTextWidth('  \u2022  ');
            badges.forEach((badgeLabel, bi) => {
                // Badge background — navy pill
                const bText = badgeLabel;
                doc.setFontSize(7);
                doc.setFont(undefined, 'bold');
                const bW = doc.getTextWidth(bText) + 3.6;
                const bH = 4.2;
                doc.setFillColor(...C.navy);
                doc.roundedRect(badgeX, addrY - 3.5, bW, bH, 0.7, 0.7, 'F');
                doc.setTextColor(...C.white);
                doc.text(bText, badgeX + 1.8, addrY - 0.5);
                badgeX += bW + 1.5; // 4px gap between badges
                doc.setFont(undefined, 'normal');
            });
        }

        // Phone — 8.5pt #777
        doc.setFontSize(8.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(119, 119, 119); // #777
        doc.text(formatPhone(v('phone')), margin + cardPadX, y + cardPadY + 24);

        // Satellite — right side inside card, border 1px #ccc, border-radius 2px
        if (hasSat) {
            const satX = margin + contentW - satW - cardPadX;
            const satY = y + (cardH - satH) / 2;
            doc.addImage(mapImages.satellite.dataUrl, mapImages.satellite.format, satX, satY, satW, satH);
            doc.setDrawColor(204, 204, 204); // #ccc
            doc.setLineWidth(0.3);
            doc.roundedRect(satX, satY, satW, satH, 0.7, 0.7, 'S');
            // "Satellite View" caption — 6pt #aaa right-aligned
            doc.setFontSize(6);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(170, 170, 170);
            doc.text('Satellite View', satX + satW, satY + satH + 3, { align: 'right' });
        }

        y += cardH + 6;
        doc.setTextColor(...C.dark);

        //  DATA SECTIONS
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const quoteType = (data.qType || '').toLowerCase();
        const showHome = quoteType === 'home' || quoteType === 'both' || !quoteType;
        const showAuto = quoteType === 'auto' || quoteType === 'both' || !quoteType;
        const drivers = (data.drivers && data.drivers.length) ? data.drivers : (this.drivers || []);
        const vehicles = (data.vehicles && data.vehicles.length) ? data.vehicles : (this.vehicles || []);

        // ── Applicant ────────────────────────────────────────────────
        { const t = sectionHeader('Applicant');
        kvTable([
            ['Full Name', clientName],
            ['Middle Name', v('middleName')],
            ['Date of Birth', formatDate(v('dob'))],
            ['Gender', v('gender') === 'M' ? 'Male' : v('gender') === 'F' ? 'Female' : v('gender')],
            ['Marital Status', v('maritalStatus')],
            ['Phone', formatPhone(v('phone'))],
            ['Email', v('email')],
            ['Education', v('education')],
            ['Industry', v('industry')],
            ['Occupation', v('occupation')],
            ['Quote Type', quoteType === 'home' ? 'Home Only' : quoteType === 'auto' ? 'Auto Only' : quoteType === 'both' ? 'Home & Auto' : quoteType],
            ['Pronunciation', this.getNamePronunciation(data)],
        ], 3, t); }

        // ── Co-Applicant (if provided) ───────────────────────────────
        const hasCoApp = data.hasCoApplicant === 'yes' || data.hasCoApplicant === true || data.hasCoApplicant === 'on';
        if (hasCoApp && (v('coFirstName') || v('coLastName'))) {
            const t = sectionHeader('Co-Applicant / Spouse');
            kvTable([
                ['Full Name', `${v('coFirstName')} ${v('coLastName')}`.trim()],
                ['Date of Birth', formatDate(v('coDob'))],
                ['Gender', v('coGender') === 'M' ? 'Male' : v('coGender') === 'F' ? 'Female' : v('coGender')],
                ['Email', v('coEmail')],
                ['Phone', formatPhone(v('coPhone'))],
                ['Relationship', v('coRelationship')],
                ['Occupation', v('coOccupation')],
                ['Education', v('coEducation')],
                ['Industry', v('coIndustry')],
            ], 3, t);
        }

        // ── Property Address ─────────────────────────────────────────
        { const t = sectionHeader('Property Address');
        kvTable([
            ['Street Address', v('addrStreet')],
            ['City', v('addrCity')],
            ['State', v('addrState')],
            ['ZIP Code', v('addrZip')],
            ['County', v('county') || this.getCountyFromCity(data.addrCity, data.addrState) || ''],
            ['Years at Address', v('yearsAtAddress')],
        ], 3, t); }

        if (showHome) {
            // ── Property Details ─────────────────────────────────────
            { const t = sectionHeader('Property Details');
            kvTable([
                ['Year Built', v('yrBuilt')],
                ['Square Footage', v('sqFt') ? Number(v('sqFt')).toLocaleString() + ' sq ft' : ''],
                ['Lot Size', v('lotSize') ? v('lotSize') + ' acres' : ''],
                ['Dwelling Type', v('dwellingType')],
                ['Dwelling Use', v('dwellingUsage')],
                ['Occupancy', v('occupancyType')],
                ['Stories', v('numStories')],
                ['Occupants', v('numOccupants')],
                ['Bedrooms', v('bedrooms')],
                ['Full Baths', v('fullBaths')],
                ['Half Baths', v('halfBaths')],
                ['Construction', v('constructionStyle')],
                ['Exterior Walls', v('exteriorWalls')],
                ['Foundation', v('foundation')],
                ['Garage Type', v('garageType')],
                ['Garage Spaces', v('garageSpaces')],
                ['Kitchen/Bath Quality', v('kitchenQuality')],
                ['Flooring', v('flooring')],
                ['Fireplaces', v('numFireplaces')],
                ['Purchase Date', formatDate(v('purchaseDate'))],
            ], 4, t); }

            // ── Building Systems ─────────────────────────────────────
            checkPage(30); // ensure header + at least first data row stay together
            { const t = sectionHeader('Building Systems');
            kvTable([
                ['Roof Type', v('roofType')],
                ['Roof Shape', v('roofShape')],
                ['Roof Updated', v('roofYr')],
                ['Heating Type', v('heatingType')],
                ['Heating Updated', v('heatYr')],
                ['Cooling', v('cooling')],
                ['Plumbing Updated', v('plumbYr')],
                ['Electrical Updated', v('elecYr')],
                ['Sewer', v('sewer')],
                ['Water Source', v('waterSource')],
            ], 4, t); }

            // ── Risk & Protection ────────────────────────────────────
            { const t = sectionHeader('Risk & Protection');
            kvTable([
                ['Burglar Alarm', v('burglarAlarm')],
                ['Fire Alarm', v('fireAlarm')],
                ['Smoke Detector', v('smokeDetector')],
                ['Sprinklers', v('sprinklers')],
                ['Swimming Pool', v('pool') || 'No'],
                ['Trampoline', v('trampoline') || 'No'],
                ['Wood Stove', v('woodStove') && v('woodStove') !== 'None' ? v('woodStove') : 'None'],
                ['Secondary Heating', v('secondaryHeating')],
                ['Dog on Premises', data.dogInfo || 'None'],
                ['Business on Property', data.businessOnProperty || 'No'],
                ['Fire Station (mi)', v('fireStationDist')],
                ['Fire Hydrant (ft)', v('fireHydrantFeet')],
                ['Tidal Water (ft)', v('tidalWaterDist')],
                ['Protection Class', v('protectionClass')],
            ], 4, t); }

            // ── Home Coverage ────────────────────────────────────────
            { const t = sectionHeader('Home Coverage');
            kvTable([
                ['Policy Type', v('homePolicyType')],
                ['Dwelling Coverage', formatCurrency(v('dwellingCoverage'))],
                ['Personal Liability', formatCurrency(v('personalLiability'))],
                ['Medical Payments', formatCurrency(v('medicalPayments'))],
                ['Deductible', formatDeductible(v('homeDeductible'))],
                ['Wind/Hail Ded.', formatDeductible(v('windDeductible'))],
                ['Mortgagee', v('mortgagee')],
                ['Increased Repl. Cost', v('increasedReplacementCost')],
                ['Ordinance or Law', v('ordinanceOrLaw')],
                ['Water Backup', v('waterBackup')],
                ['Loss Assessment', formatCurrency(v('lossAssessment'))],
                ['Equipment Breakdown', v('equipmentBreakdown')],
                ['Service Line', v('serviceLine')],
                ['Animal Liability', formatCurrency(v('animalLiability'))],
                ['Earthquake Coverage', v('earthquakeCoverage')],
                ...(v('theftDeductible') ? [['Theft Deductible', v('theftDeductible')]] : []),
                ...(v('jewelryLimit') ? [['Jewelry Limit', v('jewelryLimit')]] : []),
                ...(v('creditCardCoverage') ? [['Credit Card Coverage', v('creditCardCoverage')]] : []),
                ...(v('moldDamage') ? [['Mold Damage', v('moldDamage')]] : []),
                ...(v('earthquakeCoverage') === 'Yes' && v('earthquakeZone') ? [['EQ Zone', v('earthquakeZone')]] : []),
                ...(v('earthquakeCoverage') === 'Yes' && v('earthquakeDeductible') ? [['EQ Deductible', v('earthquakeDeductible')]] : []),
            ], 2, t); }
        }

        if (showAuto) {
            // ── Drivers ──────────────────────────────────────────────
            if (drivers.length) {
                sectionHeader('Drivers');
                const driverRows = drivers.map((d, i) => {
                    const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
                    return [
                        [`Driver ${i + 1}`, name || 'Unknown'],
                        ['  Date of Birth', formatDate(d.dob || '')],
                        ['  Gender', d.gender === 'M' ? 'Male' : d.gender === 'F' ? 'Female' : (d.gender || '')],
                        ['  Marital Status', d.maritalStatus || ''],
                        ['  Relationship', d.relationship || ''],
                        ['  Education', d.education || ''],
                        ['  Occupation', d.occupation || ''],
                        ['  License #', (d.dlNum || '').toUpperCase()],
                        ['  License State', (d.dlState || '').toUpperCase()],
                        ['  Industry', d.industry || ''],
                        ['  DL Status', d.dlStatus || ''],
                        ['  Age Licensed', d.ageLicensed || ''],
                        ['  SR-22', d.sr22 || ''],
                        ['  FR-44', d.fr44 || ''],
                        ['  Good Driver', d.goodDriver || ''],
                        ['  Mature Driver', d.matureDriver || ''],
                        ['  License Susp/Rev', d.licenseSusRev || ''],
                        ['  Driver Education', d.driverEducation || ''],
                        ['  Accidents', d.accidents || ''],
                        ['  Violations', d.violations || ''],
                        ['  Student GPA', d.studentGPA || ''],
                    ];
                }).flat();
                detailTable(driverRows);
            }

            // ── Vehicles ─────────────────────────────────────────────
            if (vehicles.length) {
                sectionHeader('Vehicles');
                const vehicleRows = vehicles.map((v, i) => {
                    const vehDesc = [v.year, v.make, v.model].filter(Boolean).join(' ');
                    const driverDisplay = this.resolveDriverName(v.primaryDriver, drivers);
                    return [
                        [`Vehicle ${i + 1}`, vehDesc || 'Unknown'],
                        ['  VIN', v.vin || ''],
                        ['  Usage', v.use || ''],
                        ['  Annual Miles', v.miles ? Number(v.miles).toLocaleString() : ''],
                        ['  Primary Driver', driverDisplay],
                        ['  Ownership', v.ownershipType || ''],
                        ['  Anti-Theft', v.antiTheft || ''],
                        ['  Anti-Lock Brakes', v.antiLockBrakes || ''],
                        ['  Passive Restraints', v.passiveRestraints || ''],
                        ['  Telematics', v.telematics || ''],
                        ['  TNC (Rideshare)', v.tnc || ''],
                        ['  Carpool', v.carPool || ''],
                        ['  New Vehicle', v.carNew || ''],
                    ];
                }).flat();
                detailTable(vehicleRows);
            }

            // Legacy single-vehicle (if no multi-vehicle data)
            if (!vehicles.length && (data.vehDesc || data.vin)) {
                const t = sectionHeader('Vehicle');
                kvTable([
                    ['Vehicle', data.vehDesc || ''],
                    ['VIN', data.vin || ''],
                    ['Usage', data.use || ''],
                    ['Annual Miles', data.miles || ''],
                ], 3, t);
            }

            // ── Auto Coverage ────────────────────────────────────────
            { const t = sectionHeader('Auto Coverage');
            kvTable([
                ['Auto Policy Type', v('autoPolicyType')],
                ['Residence Is', v('residenceIs')],
                ['Liability Limits', v('liabilityLimits')],
                ['Property Damage', formatCurrency(v('pdLimit'))],
                ['Med Pay (Auto)', formatCurrency(v('medPayments'))],
                ['UM Limits', v('umLimits')],
                ['UIM Limits', v('uimLimits')],
                ['UMPD Limit', formatCurrency(v('umpdLimit'))],
                ['Comprehensive Ded.', formatDeductible(v('compDeductible'))],
                ['Collision Ded.', formatDeductible(v('autoDeductible'))],
                ['Rental Reimburse.', formatRental(v('rentalDeductible'))],
                ['Towing/Roadside', formatCurrency(v('towingDeductible'))],
                ['Student GPA', v('studentGPA')],
            ], 2, t); }
        }

        // ── Policy & Prior Insurance ─────────────────────────────────
        { const t = sectionHeader('Policy & Prior Insurance');
        const pdfPriorRows = [
            ['Policy Term', v('policyTerm')],
            ['Effective Date', formatDate(v('effectiveDate'))],
        ];
        if (showHome) {
            const hCarrier = v('homePriorCarrier') || v('priorCarrier');
            pdfPriorRows.push(
                ['Home Prior Carrier', hCarrier],
                ['Home Prior Term', v('homePriorPolicyTerm') || v('priorPolicyTerm')],
                ['Home Yrs w/ Prior', v('homePriorYears') || v('priorYears')],
                ['Home Prior Exp.', formatDate(v('homePriorExp') || v('priorExp'))],
                ['Home Prior Liability', v('homePriorLiability')]
            );
        }
        if (showAuto) {
            pdfPriorRows.push(
                ['Auto Prior Carrier', v('priorCarrier')],
                ['Auto Prior Term', v('priorPolicyTerm')],
                ['Auto Yrs w/ Prior', v('priorYears')],
                ['Auto Prior Exp.', formatDate(v('priorExp'))],
                ['Prior Auto Limits', v('priorLiabilityLimits')]
            );
        }
        pdfPriorRows.push(
            ['Continuous Coverage', v('continuousCoverage')]
        );
        // Additional contact/referral info appended to policy section (no separate header needed)
        if (v('additionalInsureds')) pdfPriorRows.push(['Additional Insureds', v('additionalInsureds')]);
        if (v('contactTime')) pdfPriorRows.push(['Best Contact Time', v('contactTime')]);
        if (v('contactMethod')) pdfPriorRows.push(['Contact Method', v('contactMethod')]);
        if (v('referralSource')) pdfPriorRows.push(['Referral Source', v('referralSource')]);
        pdfPriorRows.push(['TCPA Consent', data.tcpaConsent ? 'Yes' : 'No']);
        // Per-driver accidents / violations (fallback to global for backward compat)
        const allAccidents = drivers.map((d, i) => d.accidents ? `Driver ${i+1}: ${d.accidents}` : '').filter(Boolean).join('; ') || v('accidents');
        const allViolations = drivers.map((d, i) => d.violations ? `Driver ${i+1}: ${d.violations}` : '').filter(Boolean).join('; ') || v('violations');
        if (allAccidents) pdfPriorRows.push(['Accidents', allAccidents]);
        if (allViolations) pdfPriorRows.push(['Violations', allViolations]);
        kvTable(pdfPriorRows, 2, t); }

        // â”€â”€â”€ Footer on every page â”€â”€â”€
        drawFooter();

        const fileName = `Insurance_Application_${data.lastName || 'Client'}_${new Date().toISOString().split('T')[0]}.pdf`;
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
        this.toast('📥 CSV Generated!');
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
        this.toast('📄 CSV template downloaded');
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
            this.toast('⚠️ CSV has no rows.');
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
            this.toast(`✅ Imported ${created} draft${created > 1 ? 's' : ''}`);
        }
        if (errors.length) {
            console.warn('Batch import warnings:', errors);
            this.toast('⚠️ Some rows were skipped.');
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
        if (typeof HawkSoftExport !== 'undefined' && typeof HawkSoftExport.open === 'function') {
            // Navigate to HawkSoft export plugin
            this.navigateTo('hawksoft');
            this.toast('\uD83D\uDCC2 Opening HawkSoft Export \u2014 review and click Export when ready');
        } else {
            this.toast('\u26A0\uFE0F HawkSoft module not loaded', 'error');
        }
    },

    buildCMSMTF(data) {
        console.warn('[DEPRECATED] App.buildCMSMTF() uses a non-standard bracket-tag format. Use HawkSoftExport module for proper HawkSoft 6 key=value CMSMTF generation.');
        const qType = data.qType || 'both';
        const includeHome = qType === 'home' || qType === 'both';
        const includeAuto = qType === 'auto' || qType === 'both';
        const drivers = this.drivers || [];
        
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
            { tag: 'GENDER', value: data.gender === 'M' ? 'Male' : data.gender === 'F' ? 'Female' : (data.gender || '') },
            { tag: 'MARITAL_STATUS', value: data.maritalStatus },
            { tag: 'EDUCATION', value: data.education },
            { tag: 'OCCUPATION', value: data.occupation },
            { tag: 'INDUSTRY', value: data.industry },
        ];

        // â”€â”€ Co-Applicant â”€â”€
        const cmsmtfHasCoApp = data.hasCoApplicant === 'yes' || data.hasCoApplicant === true || data.hasCoApplicant === 'on';
        if (cmsmtfHasCoApp && (data.coFirstName || data.coLastName)) {
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
                { tag: 'C4', value: drivers.map((d, i) => d.accidents ? `Driver ${i+1}: ${d.accidents}` : '').filter(Boolean).join('; ') || data.accidents },
                { tag: 'C5', value: drivers.map((d, i) => d.violations ? `Driver ${i+1}: ${d.violations}` : '').filter(Boolean).join('; ') || data.violations },
                { tag: 'C6', value: data.miles },
                { tag: 'C7', value: data.commuteDist },
                { tag: 'C8', value: data.rideSharing },
                { tag: 'C9', value: data.telematics },
                { tag: 'C10', value: drivers.map(d => d.studentGPA).filter(Boolean)[0] || data.studentGPA },
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
