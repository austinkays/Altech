// COI - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

// COI Generator Object
const COI = {
    // Default agency information (from Altech Insurance Agency)
    agencyDefaults: {
        name: 'Altech Insurance Agency',
        phone: '(360) 573-3080',
        fax: '(360) 573-7750',
        email: 'austin@altechinsurance.com',
        address: '7813 NE 13th Ave',
        city: 'Vancouver',
        state: 'WA',
        zip: '98665'
    },

    init() {
        const setValue = (id, value) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = value;
            if (window.App && App.markAutoFilled) {
                App.markAutoFilled(el, 'coi');
            }
        };
        // Auto-fill agency information
        setValue('coiProducerName', this.agencyDefaults.name);
        setValue('coiProducerPhone', this.agencyDefaults.phone);
        setValue('coiProducerFax', this.agencyDefaults.fax);
        setValue('coiProducerEmail', this.agencyDefaults.email);
        setValue('coiProducerAddress', this.agencyDefaults.address);
        setValue('coiProducerCity', this.agencyDefaults.city);
        setValue('coiProducerState', this.agencyDefaults.state);
        setValue('coiProducerZip', this.agencyDefaults.zip);

        // Set today's date
        const today = new Date().toISOString().split('T')[0];
        setValue('coiDate', today);

        // Generate certificate number (format: 00017905-0 5)
        const certNumber = this.generateCertNumber();
        setValue('coiCertNumber', certNumber);

        // Set revision to 0 by default
        setValue('coiRevNumber', '0');

        // Try to load any saved draft
        this.load();

        console.log('COI Generator initialized with agency defaults');
    },

    generateCertNumber() {
        // Generate certificate number in format: 00017905-0 5
        // First 8 digits are sequential, last 2 are random/revision identifiers
        const timestamp = Date.now().toString().slice(-8);
        const suffix = Math.floor(Math.random() * 10);
        const revision = Math.floor(Math.random() * 10);
        return `${timestamp}-${suffix} ${revision}`;
    },

    printCOI() {
        window.print();
    },

    // Collect all form data
    getData() {
        const val = (id) => {
            const el = document.getElementById(id);
            return el ? el.value || '' : '';
        };
        const chk = (id) => {
            const el = document.getElementById(id);
            return el ? el.checked : false;
        };

        return {
            date: val('coiDate'),
            certNumber: val('coiCertNumber'),
            revNumber: val('coiRevNumber'),
            producer: {
                name: val('coiProducerName'),
                phone: val('coiProducerPhone'),
                fax: val('coiProducerFax'),
                email: val('coiProducerEmail'),
                address: val('coiProducerAddress'),
                city: val('coiProducerCity'),
                state: val('coiProducerState'),
                zip: val('coiProducerZip')
            },
            insured: {
                name: val('coiInsuredName'),
                address: val('coiInsuredAddress'),
                city: val('coiInsuredCity'),
                state: val('coiInsuredState'),
                zip: val('coiInsuredZip')
            },
            insurers: {
                a: { name: val('coiInsurerA'), naic: val('coiInsurerANaic') },
                b: { name: val('coiInsurerB'), naic: val('coiInsurerBNaic') },
                c: { name: val('coiInsurerC'), naic: val('coiInsurerCNaic') },
                d: { name: val('coiInsurerD'), naic: val('coiInsurerDNaic') },
                e: { name: val('coiInsurerE'), naic: val('coiInsurerENaic') },
                f: { name: val('coiInsurerF'), naic: val('coiInsurerFNaic') }
            },
            gl: {
                insurerLetter: val('coiGlLetter') || 'A',
                policy: val('coiGlPolicy'),
                effective: val('coiGlEffective'),
                expiration: val('coiGlExpiration'),
                occurrence: val('coiGlOccurrence'),
                rented: val('coiGlRented'),
                med: val('coiGlMed'),
                personal: val('coiGlPersonal'),
                aggregate: val('coiGlAggregate'),
                products: val('coiGlProducts'),
                claimsMade: chk('coiGlClaimsMade'),
                occur: chk('coiGlOccur'),
                addl: chk('coiGlAddl'),
                subr: chk('coiGlSubr')
            },
            auto: {
                insurerLetter: val('coiAutoLetter') || 'B',
                policy: val('coiAutoPolicy'),
                effective: val('coiAutoEffective'),
                expiration: val('coiAutoExpiration'),
                csl: val('coiAutoCsl'),
                bodyPerson: val('coiAutoBodyPerson'),
                bodyAccident: val('coiAutoBodyAccident'),
                prop: val('coiAutoProp'),
                anyAuto: chk('coiAutoAny'),
                owned: chk('coiAutoOwned'),
                scheduled: chk('coiAutoScheduled'),
                hired: chk('coiAutoHired'),
                nonOwned: chk('coiAutoNonOwned'),
                addl: chk('coiAutoAddl'),
                subr: chk('coiAutoSubr')
            },
            umbrella: {
                insurerLetter: val('coiUmbLetter') || 'D',
                policy: val('coiUmbrellaPolicy'),
                effective: val('coiUmbrellaEffective'),
                expiration: val('coiUmbrellaExpiration'),
                occurrence: val('coiUmbrellaOccurrence'),
                aggregate: val('coiUmbrellaAggregate'),
                ded: val('coiUmbDed'),
                ret: val('coiUmbRet'),
                claimsMade: chk('coiUmbClaims'),
                occur: chk('coiUmbOccur'),
                addl: chk('coiUmbAddl'),
                subr: chk('coiUmbSubr')
            },
            wc: {
                insurerLetter: val('coiWcLetter') || 'C',
                policy: val('coiWcPolicy'),
                effective: val('coiWcEffective'),
                expiration: val('coiWcExpiration'),
                accident: val('coiWcAccident'),
                employee: val('coiWcEmployee'),
                disease: val('coiWcDisease'),
                excl: chk('coiWcExcl'),
                subr: chk('coiWcSubr')
            },
            holder: {
                name: val('coiHolderName'),
                address: val('coiHolderAddress'),
                city: val('coiHolderCity'),
                state: val('coiHolderState'),
                zip: val('coiHolderZip')
            },
            description: val('coiDescription'),
            authorizedRep: val('coiProducerName')
        };
    },

    // ── ACORD 25 PDF Field Mapping (matches Python backend field names) ──
    _formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
        } catch (e) { /* ignore */ }
        return dateStr;
    },

    _buildFieldMap(data) {
        const fields = {};
        const s = (key, def = '') => { const v = data[key]; return v ? String(v) : def; };
        const n = (section, key, def = '') => {
            const sec = data[section];
            if (sec && typeof sec === 'object') { const v = sec[key]; return v ? String(v) : def; }
            return def;
        };
        const fd = (v) => this._formatDate(v);

        // Certificate Info
        fields['Form_CompletionDate_A[0]'] = fd(s('date'));
        fields['CertificateOfInsurance_CertificateNumberIdentifier_A[0]'] = s('certNumber');
        fields['CertificateOfInsurance_RevisionNumberIdentifier_A[0]'] = s('revNumber');

        // Producer
        fields['Producer_FullName_A[0]'] = n('producer', 'name');
        fields['Producer_MailingAddress_LineOne_A[0]'] = n('producer', 'address');
        fields['Producer_MailingAddress_CityName_A[0]'] = n('producer', 'city');
        fields['Producer_MailingAddress_StateOrProvinceCode_A[0]'] = n('producer', 'state');
        fields['Producer_MailingAddress_PostalCode_A[0]'] = n('producer', 'zip');
        fields['Producer_ContactPerson_FullName_A[0]'] = n('producer', 'contactName', n('producer', 'name'));
        fields['Producer_ContactPerson_PhoneNumber_A[0]'] = n('producer', 'phone');
        fields['Producer_FaxNumber_A[0]'] = n('producer', 'fax');
        fields['Producer_ContactPerson_EmailAddress_A[0]'] = n('producer', 'email');

        // Insured
        fields['NamedInsured_FullName_A[0]'] = n('insured', 'name');
        fields['NamedInsured_MailingAddress_LineOne_A[0]'] = n('insured', 'address');
        fields['NamedInsured_MailingAddress_CityName_A[0]'] = n('insured', 'city');
        fields['NamedInsured_MailingAddress_StateOrProvinceCode_A[0]'] = n('insured', 'state');
        fields['NamedInsured_MailingAddress_PostalCode_A[0]'] = n('insured', 'zip');

        // Insurers A-F
        const insurers = data.insurers || {};
        ['a', 'b', 'c', 'd', 'e', 'f'].forEach(letter => {
            const ins = insurers[letter];
            if (ins && typeof ins === 'object') {
                if (ins.name) fields[`Insurer_FullName_${letter.toUpperCase()}[0]`] = ins.name;
                if (ins.naic) fields[`Insurer_NAICCode_${letter.toUpperCase()}[0]`] = ins.naic;
            }
        });

        // General Liability
        const gl = data.gl || {};
        if (typeof gl === 'object') {
            fields['GeneralLiability_InsurerLetterCode_A[0]'] = gl.insurerLetter || 'A';
            fields['Policy_GeneralLiability_PolicyNumberIdentifier_A[0]'] = gl.policy || '';
            fields['Policy_GeneralLiability_EffectiveDate_A[0]'] = fd(gl.effective);
            fields['Policy_GeneralLiability_ExpirationDate_A[0]'] = fd(gl.expiration);
            fields['GeneralLiability_EachOccurrence_LimitAmount_A[0]'] = gl.occurrence || '';
            fields['GeneralLiability_FireDamageRentedPremises_EachOccurrenceLimitAmount_A[0]'] = gl.rented || '';
            fields['GeneralLiability_MedicalExpense_EachPersonLimitAmount_A[0]'] = gl.med || '';
            fields['GeneralLiability_PersonalAndAdvertisingInjury_LimitAmount_A[0]'] = gl.personal || '';
            fields['GeneralLiability_GeneralAggregate_LimitAmount_A[0]'] = gl.aggregate || '';
            fields['GeneralLiability_ProductsAndCompletedOperations_AggregateLimitAmount_A[0]'] = gl.products || '';
            if (gl.addl) fields['CertificateOfInsurance_GeneralLiability_AdditionalInsuredCode_A[0]'] = 'X';
            if (gl.subr) fields['Policy_GeneralLiability_SubrogationWaivedCode_A[0]'] = 'X';
        }

        // Auto Liability
        const auto = data.auto || {};
        if (typeof auto === 'object') {
            fields['Vehicle_InsurerLetterCode_A[0]'] = auto.insurerLetter || 'B';
            fields['Policy_AutomobileLiability_PolicyNumberIdentifier_A[0]'] = auto.policy || '';
            fields['Policy_AutomobileLiability_EffectiveDate_A[0]'] = fd(auto.effective);
            fields['Policy_AutomobileLiability_ExpirationDate_A[0]'] = fd(auto.expiration);
            fields['Vehicle_CombinedSingleLimit_EachAccidentAmount_A[0]'] = auto.csl || '';
            fields['Vehicle_BodilyInjury_PerPersonLimitAmount_A[0]'] = auto.bodyPerson || '';
            fields['Vehicle_BodilyInjury_PerAccidentLimitAmount_A[0]'] = auto.bodyAccident || '';
            fields['Vehicle_PropertyDamage_PerAccidentLimitAmount_A[0]'] = auto.prop || '';
            if (auto.addl) fields['CertificateOfInsurance_AutomobileLiability_AdditionalInsuredCode_A[0]'] = 'X';
            if (auto.subr) fields['Policy_AutomobileLiability_SubrogationWaivedCode_A[0]'] = 'X';
        }

        // Umbrella / Excess Liability
        const umb = data.umbrella || {};
        if (typeof umb === 'object') {
            fields['ExcessUmbrella_InsurerLetterCode_A[0]'] = umb.insurerLetter || 'D';
            fields['Policy_ExcessLiability_PolicyNumberIdentifier_A[0]'] = umb.policy || '';
            fields['Policy_ExcessLiability_EffectiveDate_A[0]'] = fd(umb.effective);
            fields['Policy_ExcessLiability_ExpirationDate_A[0]'] = fd(umb.expiration);
            fields['ExcessUmbrella_Umbrella_EachOccurrenceAmount_A[0]'] = umb.occurrence || '';
            fields['ExcessUmbrella_Umbrella_AggregateAmount_A[0]'] = umb.aggregate || '';
            fields['ExcessUmbrella_Umbrella_DeductibleOrRetentionAmount_A[0]'] = umb.ded || '';
            if (umb.addl) fields['CertificateOfInsurance_ExcessLiability_AdditionalInsuredCode_A[0]'] = 'X';
            if (umb.subr) fields['Policy_ExcessLiability_SubrogationWaivedCode_A[0]'] = 'X';
        }

        // Workers Compensation
        const wc = data.wc || {};
        if (typeof wc === 'object') {
            fields['WorkersCompensationEmployersLiability_InsurerLetterCode_A[0]'] = wc.insurerLetter || 'C';
            fields['Policy_WorkersCompensationAndEmployersLiability_PolicyNumberIdentifier_A[0]'] = wc.policy || '';
            fields['Policy_WorkersCompensationAndEmployersLiability_EffectiveDate_A[0]'] = fd(wc.effective);
            fields['Policy_WorkersCompensationAndEmployersLiability_ExpirationDate_A[0]'] = fd(wc.expiration);
            fields['WorkersCompensationEmployersLiability_EmployersLiability_EachAccidentLimitAmount_A[0]'] = wc.accident || '';
            fields['WorkersCompensationEmployersLiability_EmployersLiability_DiseaseEachEmployeeLimitAmount_A[0]'] = wc.employee || wc.disease || '';
            fields['WorkersCompensationEmployersLiability_EmployersLiability_DiseasePolicyLimitAmount_A[0]'] = wc.diseasePolicyLimit || wc.disease || '';
            if (wc.excl) fields['WorkersCompensationEmployersLiability_AnyPersonsExcludedIndicator_A[0]'] = 'Y';
            if (wc.subr) fields['Policy_WorkersCompensation_SubrogationWaivedCode_A[0]'] = 'X';
        }

        // Description of Operations
        fields['CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A[0]'] = s('description');

        // Certificate Holder
        const holder = data.holder || {};
        if (typeof holder === 'object') {
            fields['CertificateHolder_FullName_A[0]'] = holder.name || '';
            fields['CertificateHolder_MailingAddress_LineOne_A[0]'] = holder.address || '';
            fields['CertificateHolder_MailingAddress_CityName_A[0]'] = holder.city || '';
            fields['CertificateHolder_MailingAddress_StateOrProvinceCode_A[0]'] = holder.state || '';
            fields['CertificateHolder_MailingAddress_PostalCode_A[0]'] = holder.zip || '';
        }

        // Authorized Representative
        fields['Producer_AuthorizedRepresentative_Signature_A[0]'] = s('authorizedRep', n('producer', 'name'));

        // Remove empty values
        Object.keys(fields).forEach(k => { if (!fields[k]) delete fields[k]; });
        return fields;
    },

    // Export ACORD 25 PDF (generated via jsPDF — no template dependency)
    async exportPDF() {
        const data = this.getData();
        const insuredName = data.insured?.name || 'Certificate';

        try {
            const btn = document.querySelector('[onclick="COI.exportPDF()"]');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

            // Ensure jsPDF is loaded (lazy-load from CDN if missing)
            if (!window.jspdf && !window.jsPDF) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error('Failed to load PDF library. Check your internet connection.'));
                    document.head.appendChild(s);
                });
            }
            const jsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
            if (!jsPDFConstructor) throw new Error('PDF library not available. Please refresh the page.');

            const doc = new jsPDFConstructor({ unit: 'pt', format: 'letter' }); // 612 x 792
            const W = 612, H = 792;
            const M = 18; // margin
            let y = M;

            // ── Colors ──
            const DARK = [0, 0, 0];
            const GRAY = [100, 100, 100];
            const LIGHT_GRAY = [200, 200, 200];
            const HEADER_BG = [0, 51, 102]; // #003366
            const WHITE = [255, 255, 255];

            const setColor = (c) => doc.setTextColor(...c);
            const setDraw = (c) => doc.setDrawColor(...c);
            const setFill = (c) => doc.setFillColor(...c);

            // Helper: draw labeled field (label above, value below)
            const field = (x, yPos, w, label, value) => {
                setColor(GRAY);
                doc.setFontSize(6);
                doc.text(label, x + 2, yPos + 7);
                setColor(DARK);
                doc.setFontSize(8);
                doc.text(String(value || ''), x + 2, yPos + 16, { maxWidth: w - 4 });
                setDraw(LIGHT_GRAY);
                doc.rect(x, yPos, w, 20);
            };

            // Helper: section header bar
            const sectionHeader = (yPos, title) => {
                setFill(HEADER_BG);
                doc.rect(M, yPos, W - 2 * M, 14, 'F');
                setColor(WHITE);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.text(title, M + 4, yPos + 10);
                doc.setFont('helvetica', 'normal');
                setColor(DARK);
                return yPos + 14;
            };

            // Helper: checkbox indicator
            const chkMark = (x, yPos, label, checked) => {
                doc.setFontSize(7);
                setDraw(DARK);
                doc.rect(x, yPos, 7, 7);
                if (checked) {
                    doc.setFont('helvetica', 'bold');
                    doc.text('X', x + 1.5, yPos + 6);
                    doc.setFont('helvetica', 'normal');
                }
                setColor(DARK);
                doc.text(label, x + 10, yPos + 6);
            };

            const fd = (v) => this._formatDate(v);
            const cw = W - 2 * M; // content width

            // ═══════════════════════════════════════════════
            // HEADER
            // ═══════════════════════════════════════════════
            setFill(HEADER_BG);
            doc.rect(M, y, cw, 28, 'F');
            setColor(WHITE);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('CERTIFICATE OF LIABILITY INSURANCE', M + 4, y + 12);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text('ACORD 25 FORMAT', M + 4, y + 22);

            // Date / Cert # / Rev # in header right
            doc.setFontSize(7);
            doc.text(`DATE: ${fd(data.date)}`, W - M - 160, y + 10);
            doc.text(`CERTIFICATE NUMBER: ${data.certNumber || ''}`, W - M - 160, y + 18);
            doc.text(`REVISION: ${data.revNumber || '0'}`, W - M - 60, y + 18);
            setColor(DARK);
            y += 30;

            doc.setFontSize(6);
            setColor(GRAY);
            doc.text('THIS CERTIFICATE IS ISSUED AS A MATTER OF INFORMATION ONLY AND CONFERS NO RIGHTS UPON THE CERTIFICATE HOLDER.', M, y + 7, { maxWidth: cw });
            doc.text('THIS CERTIFICATE DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER THE COVERAGE AFFORDED BY THE POLICIES BELOW.', M, y + 13, { maxWidth: cw });
            doc.text('THIS CERTIFICATE OF INSURANCE DOES NOT CONSTITUTE A CONTRACT BETWEEN THE ISSUING INSURER(S), AUTHORIZED REPRESENTATIVE OR PRODUCER, AND THE CERTIFICATE HOLDER.', M, y + 19, { maxWidth: cw });
            setColor(DARK);
            y += 23;

            // ═══════════════════════════════════════════════
            // PRODUCER / INSURED (side by side)
            // ═══════════════════════════════════════════════
            y = sectionHeader(y, 'PRODUCER');
            const prodY = y;
            const halfW = (cw - 4) / 2;
            const p = data.producer || {};
            const ins = data.insured || {};

            // Producer box (left)
            setDraw(LIGHT_GRAY);
            doc.rect(M, y, halfW, 60);
            doc.setFontSize(8);
            doc.text(p.name || '', M + 3, y + 10);
            doc.text(p.address || '', M + 3, y + 19);
            doc.text(`${p.city || ''}, ${p.state || ''} ${p.zip || ''}`.trim(), M + 3, y + 28);
            doc.setFontSize(7);
            setColor(GRAY);
            doc.text('PHONE:', M + 3, y + 40); setColor(DARK); doc.text(p.phone || '', M + 35, y + 40);
            setColor(GRAY);
            doc.text('FAX:', M + halfW / 2, y + 40); setColor(DARK); doc.text(p.fax || '', M + halfW / 2 + 22, y + 40);
            setColor(GRAY);
            doc.text('E-MAIL:', M + 3, y + 49); setColor(DARK); doc.text(p.email || '', M + 35, y + 49);

            // Insured box (right)
            const rx = M + halfW + 4;
            setFill(HEADER_BG);
            doc.rect(rx, prodY - 14, halfW, 14, 'F');
            setColor(WHITE);
            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text('INSURED', rx + 4, prodY - 4);
            doc.setFont('helvetica', 'normal');
            setColor(DARK);

            setDraw(LIGHT_GRAY);
            doc.rect(rx, y, halfW, 60);
            doc.setFontSize(8);
            doc.text(ins.name || '', rx + 3, y + 10);
            doc.text(ins.address || '', rx + 3, y + 19);
            doc.text(`${ins.city || ''}, ${ins.state || ''} ${ins.zip || ''}`.trim(), rx + 3, y + 28);

            y += 62;

            // ═══════════════════════════════════════════════
            // INSURERS AFFORDING COVERAGE
            // ═══════════════════════════════════════════════
            y = sectionHeader(y, 'INSURERS AFFORDING COVERAGE                                                                                                                                   NAIC #');
            const insurers = data.insurers || {};
            ['a', 'b', 'c', 'd', 'e', 'f'].forEach(letter => {
                const i = insurers[letter] || {};
                if (!i.name && !i.naic) return;
                setDraw(LIGHT_GRAY);
                doc.rect(M, y, cw, 12);
                doc.setFontSize(7); setColor(GRAY);
                doc.text(`INSURER ${letter.toUpperCase()}:`, M + 3, y + 9);
                setColor(DARK); doc.setFontSize(8);
                doc.text(i.name || '', M + 55, y + 9);
                doc.text(i.naic || '', W - M - 50, y + 9);
                y += 12;
            });

            // ═══════════════════════════════════════════════
            // COVERAGES
            // ═══════════════════════════════════════════════
            y = sectionHeader(y, 'COVERAGES        CERTIFICATE NUMBER: ' + (data.certNumber || '') + '        REVISION NUMBER: ' + (data.revNumber || '0'));
            doc.setFontSize(5.5);
            setColor(GRAY);
            doc.text('THIS IS TO CERTIFY THAT THE POLICIES OF INSURANCE LISTED BELOW HAVE BEEN ISSUED TO THE INSURED NAMED ABOVE FOR THE POLICY PERIOD INDICATED.', M, y + 7, { maxWidth: cw });
            setColor(DARK);
            y += 11;

            // Column headers
            const colX = { type: M, ltr: M + 120, pol: M + 140, eff: M + 260, exp: M + 310, limits: M + 360 };
            setDraw(LIGHT_GRAY);
            doc.rect(M, y, cw, 12);
            doc.setFontSize(6); setColor(GRAY);
            doc.text('TYPE OF INSURANCE', colX.type + 3, y + 9);
            doc.text('INSR\nLTR', colX.ltr, y + 5);
            doc.text('POLICY NUMBER', colX.pol + 3, y + 9);
            doc.text('EFF\n(MM/DD/YYYY)', colX.eff, y + 5);
            doc.text('EXP\n(MM/DD/YYYY)', colX.exp, y + 5);
            doc.text('LIMITS', colX.limits + 3, y + 9);
            setColor(DARK);
            y += 12;

            // ── General Liability Row ──
            const gl = data.gl || {};
            const glH = 55;
            setDraw(LIGHT_GRAY);
            doc.rect(M, y, cw, glH);
            // Vertical dividers
            [colX.ltr, colX.pol, colX.eff, colX.exp, colX.limits].forEach(x => {
                doc.line(x, y, x, y + glH);
            });

            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text('COMMERCIAL GENERAL LIABILITY', colX.type + 3, y + 9);
            doc.setFont('helvetica', 'normal');
            chkMark(colX.type + 5, y + 13, 'CLAIMS-MADE', gl.claimsMade);
            chkMark(colX.type + 70, y + 13, 'OCCUR', gl.occur);
            chkMark(colX.type + 5, y + 25, 'ADDL INSD', gl.addl);
            chkMark(colX.type + 70, y + 25, 'SUBR WVD', gl.subr);

            doc.setFontSize(7);
            doc.text(gl.insurerLetter || '', colX.ltr + 5, y + 9);
            doc.text(gl.policy || '', colX.pol + 3, y + 9, { maxWidth: 115 });
            doc.text(fd(gl.effective), colX.eff + 2, y + 9);
            doc.text(fd(gl.expiration), colX.exp + 2, y + 9);

            // Limits column
            doc.setFontSize(6);
            let ly = y + 4;
            const limRow = (label, val) => { setColor(GRAY); doc.text(label, colX.limits + 3, ly + 5); setColor(DARK); doc.text(val || '', W - M - 3, ly + 5, { align: 'right' }); ly += 9; };
            limRow('EACH OCCURRENCE', gl.occurrence);
            limRow('DAMAGE TO RENTED PREMISES', gl.rented);
            limRow('MED EXP (Any one person)', gl.med);
            limRow('PERSONAL & ADV INJURY', gl.personal);
            limRow('GENERAL AGGREGATE', gl.aggregate);
            limRow('PRODUCTS - COMP/OP AGG', gl.products);
            y += glH;

            // ── Auto Liability Row ──
            const auto = data.auto || {};
            const autoH = 50;
            setDraw(LIGHT_GRAY);
            doc.rect(M, y, cw, autoH);
            [colX.ltr, colX.pol, colX.eff, colX.exp, colX.limits].forEach(x => doc.line(x, y, x, y + autoH));

            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text('AUTOMOBILE LIABILITY', colX.type + 3, y + 9);
            doc.setFont('helvetica', 'normal');
            chkMark(colX.type + 5, y + 13, 'ANY AUTO', auto.anyAuto);
            chkMark(colX.type + 5, y + 23, 'OWNED AUTOS', auto.owned);
            chkMark(colX.type + 70, y + 23, 'SCHEDULED', auto.scheduled);
            chkMark(colX.type + 5, y + 33, 'HIRED AUTOS', auto.hired);
            chkMark(colX.type + 70, y + 33, 'NON-OWNED', auto.nonOwned);

            doc.setFontSize(7);
            doc.text(auto.insurerLetter || '', colX.ltr + 5, y + 9);
            doc.text(auto.policy || '', colX.pol + 3, y + 9, { maxWidth: 115 });
            doc.text(fd(auto.effective), colX.eff + 2, y + 9);
            doc.text(fd(auto.expiration), colX.exp + 2, y + 9);

            doc.setFontSize(6); ly = y + 4;
            limRow('COMBINED SINGLE LIMIT', auto.csl);
            limRow('BODILY INJURY (Per person)', auto.bodyPerson);
            limRow('BODILY INJURY (Per accident)', auto.bodyAccident);
            limRow('PROPERTY DAMAGE', auto.prop);
            y += autoH;

            // ── Umbrella / Excess Row ──
            const umb = data.umbrella || {};
            const umbH = 35;
            setDraw(LIGHT_GRAY);
            doc.rect(M, y, cw, umbH);
            [colX.ltr, colX.pol, colX.eff, colX.exp, colX.limits].forEach(x => doc.line(x, y, x, y + umbH));

            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text('UMBRELLA LIAB / EXCESS LIAB', colX.type + 3, y + 9);
            doc.setFont('helvetica', 'normal');
            chkMark(colX.type + 5, y + 13, 'OCCUR', umb.occur);
            chkMark(colX.type + 50, y + 13, 'CLAIMS-MADE', umb.claimsMade);
            chkMark(colX.type + 5, y + 23, 'ADDL INSD', umb.addl);
            chkMark(colX.type + 70, y + 23, 'SUBR WVD', umb.subr);

            doc.setFontSize(7);
            doc.text(umb.insurerLetter || '', colX.ltr + 5, y + 9);
            doc.text(umb.policy || '', colX.pol + 3, y + 9, { maxWidth: 115 });
            doc.text(fd(umb.effective), colX.eff + 2, y + 9);
            doc.text(fd(umb.expiration), colX.exp + 2, y + 9);

            doc.setFontSize(6); ly = y + 4;
            limRow('EACH OCCURRENCE', umb.occurrence);
            limRow('AGGREGATE', umb.aggregate);
            limRow('DED / RETENTION', umb.ded || umb.ret);
            y += umbH;

            // ── Workers Comp Row ──
            const wc = data.wc || {};
            const wcH = 35;
            setDraw(LIGHT_GRAY);
            doc.rect(M, y, cw, wcH);
            [colX.ltr, colX.pol, colX.eff, colX.exp, colX.limits].forEach(x => doc.line(x, y, x, y + wcH));

            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text("WORKERS COMPENSATION\nAND EMPLOYERS' LIABILITY", colX.type + 3, y + 9);
            doc.setFont('helvetica', 'normal');
            chkMark(colX.type + 5, y + 23, 'EXCL', wc.excl);
            chkMark(colX.type + 40, y + 23, 'SUBR WVD', wc.subr);

            doc.setFontSize(7);
            doc.text(wc.insurerLetter || '', colX.ltr + 5, y + 9);
            doc.text(wc.policy || '', colX.pol + 3, y + 9, { maxWidth: 115 });
            doc.text(fd(wc.effective), colX.eff + 2, y + 9);
            doc.text(fd(wc.expiration), colX.exp + 2, y + 9);

            doc.setFontSize(6); ly = y + 4;
            limRow('E.L. EACH ACCIDENT', wc.accident);
            limRow('E.L. DISEASE - EA EMPLOYEE', wc.employee);
            limRow('E.L. DISEASE - POLICY LIMIT', wc.diseasePolicyLimit || wc.disease);
            y += wcH;

            // ═══════════════════════════════════════════════
            // DESCRIPTION OF OPERATIONS
            // ═══════════════════════════════════════════════
            y = sectionHeader(y, 'DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES (ACORD 101, Additional Remarks Schedule, may be attached if more space is required)');
            setDraw(LIGHT_GRAY);
            const descH = 50;
            doc.rect(M, y, cw, descH);
            doc.setFontSize(7); setColor(DARK);
            doc.text(data.description || '', M + 3, y + 9, { maxWidth: cw - 6 });
            y += descH;

            // ═══════════════════════════════════════════════
            // CERTIFICATE HOLDER
            // ═══════════════════════════════════════════════
            y = sectionHeader(y, 'CERTIFICATE HOLDER                                                                                                              CANCELLATION');
            const holder = data.holder || {};
            const holderH = 55;
            const holderW = halfW;
            setDraw(LIGHT_GRAY);
            doc.rect(M, y, holderW, holderH);
            doc.rect(M + holderW, y, cw - holderW, holderH);
            doc.setFontSize(8);
            doc.text(holder.name || '', M + 3, y + 12);
            doc.text(holder.address || '', M + 3, y + 22);
            doc.text(`${holder.city || ''}, ${holder.state || ''} ${holder.zip || ''}`.trim(), M + 3, y + 32);

            // Cancellation text (right side)
            doc.setFontSize(6); setColor(GRAY);
            doc.text('SHOULD ANY OF THE ABOVE DESCRIBED POLICIES BE CANCELLED BEFORE THE\nEXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE\nWITH THE POLICY PROVISIONS.', M + holderW + 3, y + 10, { maxWidth: cw - holderW - 6 });

            // Authorized rep
            setColor(GRAY); doc.setFontSize(6);
            doc.text('AUTHORIZED REPRESENTATIVE', M + holderW + 3, y + 35);
            setColor(DARK); doc.setFontSize(8);
            doc.text(data.authorizedRep || '', M + holderW + 3, y + 46);
            y += holderH;

            // ═══════════════════════════════════════════════
            // FOOTER
            // ═══════════════════════════════════════════════
            doc.setFontSize(5); setColor(GRAY);
            doc.text('ACORD 25 (2016/03)    Generated by Altech Insurance Agency    © 1988-2026 ACORD CORPORATION. All rights reserved.', M, H - 10);
            doc.text('The ACORD name and logo are registered marks of ACORD', W - M - 180, H - 10);

            // ── Download ──
            doc.save(`COI-${insuredName.replace(/[^a-zA-Z0-9 ]/g, '')}.pdf`);
            console.log('[COI] ACORD 25 PDF generated successfully (jsPDF)');

            if (btn) {
                btn.textContent = '✅ Downloaded!';
                setTimeout(() => { btn.textContent = '📥 Export ACORD 25 PDF'; btn.disabled = false; }, 2000);
            }
        } catch (err) {
            console.error('[COI] Export failed:', err);
            alert('COI Export failed: ' + err.message);
            const btn = document.querySelector('[onclick="COI.exportPDF()"]');
            if (btn) {
                btn.textContent = '📥 Export ACORD 25 PDF';
                btn.disabled = false;
            }
        }
    },

    // Save to localStorage
    save() {
        try {
            const data = this.getData();
            localStorage.setItem('altech_coi_draft', JSON.stringify(data));
            console.log('COI draft saved');
        } catch (e) {
            console.error('[COI.save] Storage error:', e);
        }
    },

    // Load from localStorage
    load() {
        const saved = localStorage.getItem('altech_coi_draft');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                // Populate form fields from saved data
                const setField = (id, value) => {
                    const el = document.getElementById(id);
                    if (el && value !== undefined && value !== null) el.value = value;
                };
                // Producer
                if (data.producer) {
                    setField('coiProducerName', data.producer.name);
                    setField('coiProducerPhone', data.producer.phone);
                    setField('coiProducerFax', data.producer.fax);
                    setField('coiProducerEmail', data.producer.email);
                    setField('coiProducerAddress', data.producer.address);
                    setField('coiProducerCity', data.producer.city);
                    setField('coiProducerState', data.producer.state);
                    setField('coiProducerZip', data.producer.zip);
                }
                // Insured
                if (data.insured) {
                    setField('coiInsuredName', data.insured.name);
                    setField('coiInsuredAddress', data.insured.address);
                    setField('coiInsuredCity', data.insured.city);
                    setField('coiInsuredState', data.insured.state);
                    setField('coiInsuredZip', data.insured.zip);
                }
                // Insurers
                if (data.insurers) {
                    ['a', 'b', 'c', 'd'].forEach(letter => {
                        if (data.insurers[letter]) {
                            setField(`coiInsurer${letter.toUpperCase()}`, data.insurers[letter].name);
                            setField(`coiInsurer${letter.toUpperCase()}Naic`, data.insurers[letter].naic);
                        }
                    });
                }
                // GL
                if (data.gl) {
                    setField('coiGlPolicy', data.gl.policy);
                    setField('coiGlEffective', data.gl.effective);
                    setField('coiGlExpiration', data.gl.expiration);
                    setField('coiGlOccurrence', data.gl.occurrence);
                    setField('coiGlAggregate', data.gl.aggregate);
                }
                // Auto
                if (data.auto) {
                    setField('coiAutoPolicy', data.auto.policy);
                    setField('coiAutoEffective', data.auto.effective);
                    setField('coiAutoExpiration', data.auto.expiration);
                    setField('coiAutoCsl', data.auto.csl);
                    setField('coiAutoType', data.auto.type);
                }
                // Umbrella
                if (data.umbrella) {
                    setField('coiUmbrellaPolicy', data.umbrella.policy);
                    setField('coiUmbrellaEffective', data.umbrella.effective);
                    setField('coiUmbrellaExpiration', data.umbrella.expiration);
                    setField('coiUmbrellaOccurrence', data.umbrella.occurrence);
                    setField('coiUmbrellaAggregate', data.umbrella.aggregate);
                }
                // WC
                if (data.wc) {
                    setField('coiWcPolicy', data.wc.policy);
                    setField('coiWcEffective', data.wc.effective);
                    setField('coiWcExpiration', data.wc.expiration);
                    setField('coiWcAccident', data.wc.accident);
                    setField('coiWcDisease', data.wc.disease);
                }
                // Holder
                if (data.holder) {
                    setField('coiHolderName', data.holder.name);
                    setField('coiHolderAddress', data.holder.address);
                    setField('coiHolderCity', data.holder.city);
                    setField('coiHolderState', data.holder.state);
                    setField('coiHolderZip', data.holder.zip);
                }
                // Extra fields
                setField('coiDescription', data.description);
                setField('coiAdditionalInsured', data.additionalInsured);
                setField('coiEndorsements', data.endorsements);
                setField('coiWaiver', data.waiver);
                console.log('COI draft loaded and populated');
            } catch (e) {
                console.warn('[COI.load] Corrupt JSON:', e);
            }
        }
    }
};

window.COI = COI;
