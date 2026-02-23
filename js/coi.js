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

    // Export filled ACORD 25 PDF (client-side via pdf-lib)
    async exportPDF() {
        const data = this.getData();
        const insuredName = data.insured?.name || 'Certificate';

        try {
            const btn = document.querySelector('[onclick="COI.exportPDF()"]');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳ Generating...';
            }

            // Ensure pdf-lib is loaded (lazy-load from CDN if missing)
            if (!window.PDFLib) {
                console.warn('[COI] pdf-lib not found, attempting dynamic load...');
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error('Failed to load PDF library from CDN. Check your internet connection and try again.'));
                    document.head.appendChild(script);
                });
                if (!window.PDFLib) {
                    throw new Error('PDF library failed to initialize. Please refresh the page and try again.');
                }
                console.log('[COI] pdf-lib loaded dynamically');
            }

            // Fetch the ACORD 25 fillable template
            const templateUrl = '/Resources/ACORD%2025%20fillable.pdf';
            const templateResponse = await fetch(templateUrl);
            if (!templateResponse.ok) {
                throw new Error(`Could not load ACORD 25 template (HTTP ${templateResponse.status}). Contact support.`);
            }
            const templateBytes = await templateResponse.arrayBuffer();

            // Load the PDF with pdf-lib
            const { PDFDocument, PDFName, PDFString } = PDFLib;
            const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

            // Build field map from form data
            const fieldMap = this._buildFieldMap(data);
            let filledCount = 0;

            // Strategy 1: Try pdf-lib's high-level form API
            try {
                const form = pdfDoc.getForm();
                const allFields = form.getFields();

                // Build lookup by leaf name (last segment after dots) and full name
                const fieldLookup = {};
                allFields.forEach(field => {
                    const fullName = field.getName();
                    const leaf = fullName.includes('.') ? fullName.split('.').pop() : fullName;
                    fieldLookup[leaf] = field;
                    fieldLookup[fullName] = field;
                });

                for (const [fieldName, value] of Object.entries(fieldMap)) {
                    const field = fieldLookup[fieldName];
                    if (!field) continue;
                    try {
                        if (typeof field.setText === 'function') {
                            field.setText(String(value));
                            filledCount++;
                        } else if (typeof field.check === 'function') {
                            if (value === 'X' || value === 'Y' || value === true) {
                                field.check();
                                filledCount++;
                            }
                        }
                    } catch (e) {
                        console.warn('[COI] Could not fill field via form API:', fieldName, e.message);
                    }
                }

                console.log(`[COI] Form API filled ${filledCount}/${Object.keys(fieldMap).length} fields`);
            } catch (formErr) {
                console.warn('[COI] Form API unavailable:', formErr.message);
            }

            // Strategy 2: If form API filled nothing, try raw annotation manipulation
            if (filledCount === 0) {
                console.log('[COI] Falling back to raw annotation fill...');
                const pages = pdfDoc.getPages();
                for (const page of pages) {
                    const annots = page.node.lookup(PDFName.of('Annots'));
                    if (!annots) continue;
                    const annotsArray = annots.asArray ? annots.asArray() : (annots.array || []);
                    for (const annotRef of annotsArray) {
                        const annot = annotRef.asMap ? annotRef : (typeof pdfDoc.context.lookup === 'function' ? pdfDoc.context.lookup(annotRef) : null);
                        if (!annot) continue;
                        const tObj = annot.get ? annot.get(PDFName.of('T')) : null;
                        if (!tObj) continue;
                        const leafName = typeof tObj.decodeText === 'function' ? tObj.decodeText() : String(tObj);
                        if (fieldMap[leafName]) {
                            annot.set(PDFName.of('V'), PDFString.of(fieldMap[leafName]));
                            filledCount++;
                        }
                    }
                }
                console.log(`[COI] Raw annotation fill: ${filledCount} fields`);
            }

            // Save and trigger download
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `COI-${insuredName.replace(/[^a-zA-Z0-9 ]/g, '')}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`[COI] ACORD 25 PDF exported successfully (${filledCount} fields filled, client-side)`);

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
