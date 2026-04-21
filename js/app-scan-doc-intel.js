// js/app-scan-doc-intel.js — Document intelligence (analyze, render, apply, persist)
// Extracted from app-scan.js during Phase 3 monolith decomposition (2026-04)
'use strict';

Object.assign(App, {
    async analyzeDocuments() {
        const files = this.docIntelFiles.length ? this.docIntelFiles : this.scanFiles;
        if (!files.length) {
            this.toast('⚠️ Upload documents first.');
            return;
        }

        const status = document.getElementById('docIntelStatus');
        if (status) {
            status.classList.remove('hidden');
            status.textContent = '⏳ Analyzing documents...';
        }

        try {
            const inlineData = [];
            for (const file of files) {
                inlineData.push(await this.fileToInlineData(file));
            }

            const response = await fetch('/api/vision-processor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'documentIntel', files: inlineData, aiSettings: window.AIProvider?.getSettings() })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.error || 'Unable to analyze documents');
            }

            const result = await response.json();
            this.docIntelResults = result;
            await this.saveDocIntelResults(result);
            this.renderDocIntelResults(result);

            if (status) {
                status.textContent = '✅ Document analysis complete.';
            }
        } catch (err) {
            if (status) status.textContent = '⚠️ ' + err.message;
        }
    },

    renderDocIntelResults(result) {
        const container = document.getElementById('docIntelResults');
        if (!container) return;
        container.innerHTML = '';

        if (!result) return;

        const warnings = this.getDocIntelWarnings(result);
        if (warnings.length) {
            const warn = document.createElement('div');
            warn.className = 'hint';
            warn.textContent = '⚠️ ' + warnings.join(' | ');
            container.appendChild(warn);
        }

        const summary = document.createElement('div');
        summary.className = 'hint';
        summary.textContent = result.summary || 'Document analysis complete.';
        container.appendChild(summary);

        const fields = result.fields || {};
        const fieldsCard = document.createElement('div');
        fieldsCard.className = 'scan-field';

        const fieldsTitle = document.createElement('label');
        fieldsTitle.className = 'label';
        fieldsTitle.textContent = 'Review Extracted Fields';
        fieldsCard.appendChild(fieldsTitle);

        const fieldList = document.createElement('div');
        fieldList.className = 'grid-2';

        const renderInput = (labelText, key, placeholder = '') => {
            const wrap = document.createElement('div');
            const label = document.createElement('label');
            label.className = 'label';
            label.textContent = labelText;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = fields[key] || '';
            input.placeholder = placeholder;
            input.oninput = (e) => this.updateDocIntelField(key, e.target.value);
            wrap.appendChild(label);
            wrap.appendChild(input);
            fieldList.appendChild(wrap);
        };

        renderInput('Owner Name', 'ownerName', 'John Doe');
        renderInput('Policy Number', 'policyNumber', 'ABC123');
        renderInput('Effective Date', 'effectiveDate', 'YYYY-MM-DD');
        renderInput('Expiration Date', 'expirationDate', 'YYYY-MM-DD');
        renderInput('Year Built', 'yearBuilt', '1999');
        renderInput('Assessed Value', 'assessedValue', '450000');
        renderInput('Mortgagee', 'mortgagee', 'Lender Name');
        renderInput('Address Line 1', 'addressLine1', '123 Main St');
        renderInput('City', 'city', 'Seattle');
        renderInput('State', 'state', 'WA');
        renderInput('Zip', 'zip', '98101');

        fieldsCard.appendChild(fieldList);
        container.appendChild(fieldsCard);

        const docs = result.documents || [];
        docs.forEach(doc => {
            const card = document.createElement('div');
            card.className = 'scan-field';

            const title = document.createElement('label');
            title.className = 'label';
            title.textContent = doc.title || doc.type || 'Document';

            const detail = document.createElement('div');
            detail.className = 'hint';
            detail.textContent = doc.details || doc.notes || 'No details extracted.';

            card.appendChild(title);
            card.appendChild(detail);
            container.appendChild(card);
        });
    },

    async updateDocIntelField(key, value) {
        if (!this.docIntelResults) return;
        if (!this.docIntelResults.fields) this.docIntelResults.fields = {};
        this.docIntelResults.fields[key] = value;
        await this.saveDocIntelResults(this.docIntelResults);
    },

    getDocIntelWarnings(result) {
        const warnings = [];
        const fields = result?.fields || {};
        if (fields.yearBuilt && this.data.yrBuilt) {
            const diff = Math.abs(parseInt(fields.yearBuilt, 10) - parseInt(this.data.yrBuilt, 10));
            if (!Number.isNaN(diff) && diff >= 2) {
                warnings.push(`Year built mismatch (${fields.yearBuilt} vs ${this.data.yrBuilt})`);
            }
        }
        if (!fields.ownerName && (fields.deedBook || fields.apn)) {
            warnings.push('Owner name missing from document extraction');
        }
        if (fields.assessedValue && !this.data.propertyValue) {
            warnings.push('Assessed value found — consider setting property value');
        }
        return warnings;
    },

    applyDocIntelToForm() {
        if (!this.docIntelResults) {
            this.toast('⚠️ Run document analysis first.');
            return;
        }
        const fields = this.docIntelResults.fields || {};

        const setIfEmpty = (id, value) => {
            if (!value) return;
            const el = document.getElementById(id);
            if (!el) return;
            if (!el.value) {
                el.value = value;
                this.data[id] = value;
                this.markAutoFilled(el, 'scan');
            }
        };

        setIfEmpty('yrBuilt', fields.yearBuilt);
        setIfEmpty('addrStreet', fields.addressLine1);
        setIfEmpty('addrCity', fields.city);
        setIfEmpty('addrState', fields.state);
        setIfEmpty('addrZip', fields.zip);
        setIfEmpty('mortgagee', fields.mortgagee);
        setIfEmpty('purchaseDate', fields.purchaseDate);

        if (fields.assessedValue && !this.data.propertyValue) {
            this.data.propertyValue = fields.assessedValue;
        }

        this.data.docIntel = {
            source: fields.source || 'Document Intelligence',
            yearBuilt: fields.yearBuilt || '',
            assessedValue: fields.assessedValue || '',
            ownerName: fields.ownerName || '',
            policyNumber: fields.policyNumber || '',
            effectiveDate: fields.effectiveDate || '',
            expirationDate: fields.expirationDate || '',
            mortgagee: fields.mortgagee || ''
        };

        this.save({ target: { id: 'docIntel', value: JSON.stringify(this.data.docIntel) } });
        this.updateScanCoverage();
        this.toast('✅ Document data applied');
    },

    async saveDocIntelResults(result) {
        if (!result) return;
        if (this.encryptionEnabled) {
            const encrypted = await CryptoHelper.encrypt(result);
            localStorage.setItem(this.docIntelKey, encrypted);
        } else {
            localStorage.setItem(this.docIntelKey, JSON.stringify(result));
        }
    },

    async loadDocIntelResults() {
        const stored = localStorage.getItem(this.docIntelKey);
        if (!stored) return;

        if (this.encryptionEnabled) {
            const decrypted = await CryptoHelper.decrypt(stored);
            if (decrypted) this.docIntelResults = decrypted;
        } else {
            try {
                this.docIntelResults = JSON.parse(stored);
            } catch (e) {
                console.warn('[loadDocIntelResults] Corrupt JSON:', e);
            }
        }

        if (this.docIntelResults) {
            this.renderDocIntelResults(this.docIntelResults);
            this.updateScanCoverage();
        }
    },
});
