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

    // Export filled ACORD 25 PDF via server API
    async exportPDF() {
        const data = this.getData();
        const insuredName = data.insured?.name || 'Certificate';

        try {
            const btn = document.querySelector('[onclick="COI.exportPDF()"]');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳ Generating...';
            }

            const response = await fetch('/api/generate-coi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(err.error || err.detail || `Server error ${response.status}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `COI-${insuredName.replace(/[^a-zA-Z0-9 ]/g, '')}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('[COI] ACORD 25 PDF exported successfully');

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
