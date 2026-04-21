// js/app-carriers.js — Carrier autocomplete + same-carrier toggle + prior-years validation.
// Extracted from app-core.js during Phase 3 monolith decomposition (2026-04).
'use strict';

Object.assign(App, {
    // === CARRIER AUTOCOMPLETE ===
    _carrierListCache: null,

    getCarrierList() {
        if (this._carrierListCache) return this._carrierListCache;
        const dl = document.getElementById('carrierList');
        if (!dl) return [];
        this._carrierListCache = Array.from(dl.options).map(o => o.value).filter(Boolean);
        return this._carrierListCache;
    },

    initCarrierAutocomplete() {
        const carriers = this.getCarrierList();
        const optionsHTML = '<option value="">Select carrier...</option>' +
            carriers.map(c => {
                const esc = c.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
                return `<option value="${esc}">${esc}</option>`;
            }).join('');
        ['homePriorCarrier', 'priorCarrier'].forEach(id => {
            const el = document.getElementById(id);
            if (!el || el.tagName !== 'SELECT') return;
            el.innerHTML = optionsHTML;
            // Restore saved value
            if (this.data[id]) el.value = this.data[id];
        });
    },

    handleSameCarrier() {
        const qType = document.querySelector('input[name="qType"]:checked')?.value || 'both';
        if (qType === 'auto') {
            const cb2 = document.getElementById('sameAsHomeCarrier');
            if (cb2) cb2.checked = false;
            this.toast?.('No home carrier on file — this is an auto-only quote.', 'info');
            return;
        }
        const cb = document.getElementById('sameAsHomeCarrier');
        const autoInput = document.getElementById('priorCarrier');
        const homeInput = document.getElementById('homePriorCarrier');
        if (!cb || !autoInput || !homeInput) return;
        if (cb.checked) {
            autoInput.value = homeInput.value || '';
            autoInput.disabled = true;
            autoInput.style.opacity = '0.6';
            autoInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            autoInput.disabled = false;
            autoInput.style.opacity = '';
        }
        this.data.sameAsHomeCarrier = cb.checked;
    },

    validatePriorYearsCoverage() {
        const yearsEl = document.getElementById('priorYears');
        const covEl = document.getElementById('continuousCoverage');
        if (!yearsEl || !covEl) return;
        const yrsVal = yearsEl.value;
        const covVal = covEl.value;
        if (!yrsVal || !covVal) return;
        const yrs = yrsVal === 'More than 15' ? 16 : parseInt(yrsVal, 10);
        const cov = covVal === 'More than 15' ? 16 : parseInt(covVal, 10);
        if (isNaN(yrs) || isNaN(cov)) return;
        if (yrs >= 5 && cov < yrs) {
            // Auto-correct: continuous coverage should be at least as high as years with carrier
            const targetVal = yrs > 15 ? 'More than 15' : String(yrs);
            const opt = covEl.querySelector(`option[value="${targetVal}"]`);
            if (opt) {
                covEl.value = targetVal;
                covEl.dispatchEvent(new Event('change', { bubbles: true }));
                this.toast(`\u2139\ufe0f Continuous coverage updated to match ${yrsVal} years with carrier`);
            }
        }
    },
});
