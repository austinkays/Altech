// js/hawksoft-renderers.js — Vehicle/Driver/Coverage row HTML builders for HawkSoft plugin.
// Extracted from hawksoft-export.js during Phase 3 monolith decomposition (2026-04).
// Loaded BEFORE hawksoft-export.js so the plugin IIFE can reference window.HawkSoftRenderers.
'use strict';

window.HawkSoftRenderers = (() => {
    'use strict';

    // Tiny helper duplicated from the main IIFE so this module stands alone.
    function _val(v) {
        if (v === null || v === undefined) return '';
        return String(v).trim();
    }

    // ── Build vehicle row HTML ──────────────────────────────
    function _vehicleRowHTML(v, index) {
        return `
        <div class="hs-vehicle-row hs-card" data-index="${index}">
            <div class="hs-card-header">
                <span class="hs-card-number">${index + 1}</span>
                <span class="hs-card-title">${v.year || ''} ${v.make || ''} ${v.model || ''}</span>
                <button type="button" class="hs-btn-icon hs-btn-remove" onclick="HawkSoftExport.removeVehicle(${index})" title="Remove vehicle">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="hs-form-grid">
                <div class="hs-field"><label>Year</label><input type="text" data-field="year" value="${_val(v.year)}" maxlength="4"></div>
                <div class="hs-field"><label>Make</label><input type="text" data-field="make" value="${_val(v.make)}"></div>
                <div class="hs-field"><label>Model</label><input type="text" data-field="model" value="${_val(v.model)}"></div>
                <div class="hs-field hs-field-wide"><label>VIN</label><input type="text" data-field="vin" value="${_val(v.vin)}" maxlength="17" style="text-transform:uppercase;font-family:monospace"></div>
                <div class="hs-field"><label>Use</label>
                    <select data-field="use">
                        <option value="">—</option>
                        <option value="Pleasure" ${v.use === 'Pleasure' ? 'selected' : ''}>Pleasure</option>
                        <option value="Work" ${v.use === 'Work' ? 'selected' : ''}>Work</option>
                        <option value="Business" ${v.use === 'Business' ? 'selected' : ''}>Business</option>
                        <option value="Farm" ${v.use === 'Farm' ? 'selected' : ''}>Farm</option>
                        <option value="OT" ${v.use === 'OT' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <div class="hs-field"><label>Annual Miles</label><input type="text" data-field="annualMileage" value="${_val(v.annualMileage)}"></div>
                <div class="hs-field"><label>Vehicle Type</label><input type="text" data-field="vehicleType" value="${_val(v.vehicleType)}" placeholder="SUV, Sedan, etc."></div>
                <div class="hs-field"><label>Comp Ded.</label>
                    <select data-field="comp">
                        <option value="None" ${v.comp === 'None' ? 'selected' : ''}>None</option>
                        <option value="100" ${v.comp === '100' ? 'selected' : ''}>$100</option>
                        <option value="250" ${v.comp === '250' ? 'selected' : ''}>$250</option>
                        <option value="500" ${v.comp === '500' ? 'selected' : ''}>$500</option>
                        <option value="1000" ${v.comp === '1000' ? 'selected' : ''}>$1,000</option>
                        <option value="2500" ${v.comp === '2500' ? 'selected' : ''}>$2,500</option>
                    </select>
                </div>
                <div class="hs-field"><label>Coll Ded.</label>
                    <select data-field="coll">
                        <option value="None" ${v.coll === 'None' ? 'selected' : ''}>None</option>
                        <option value="100" ${v.coll === '100' ? 'selected' : ''}>$100</option>
                        <option value="250" ${v.coll === '250' ? 'selected' : ''}>$250</option>
                        <option value="500" ${v.coll === '500' ? 'selected' : ''}>$500</option>
                        <option value="1000" ${v.coll === '1000' ? 'selected' : ''}>$1,000</option>
                        <option value="2500" ${v.coll === '2500' ? 'selected' : ''}>$2,500</option>
                    </select>
                </div>
                <div class="hs-field"><label>Towing</label>
                    <select data-field="towing"><option value="No">No</option><option value="Yes" ${v.towing === 'Yes' ? 'selected' : ''}>Yes</option></select>
                </div>
                <div class="hs-field"><label>Rental</label>
                    <select data-field="rental"><option value="No">No</option><option value="Yes" ${v.rental === 'Yes' ? 'selected' : ''}>Yes</option></select>
                </div>
                <div class="hs-field"><label>4WD</label>
                    <select data-field="fourWd"><option value="No">No</option><option value="Yes" ${v.fourWd === 'Yes' ? 'selected' : ''}>Yes</option></select>
                </div>
                <div class="hs-field"><label>Garaging ZIP</label><input type="text" data-field="garagingZip" value="${_val(v.garagingZip)}" maxlength="10"></div>
                <div class="hs-field"><label>Loss Payee</label>
                    <select data-field="lossPayee"><option value="No">No</option><option value="Yes" ${v.lossPayee === 'Yes' || v.lossPayee === true ? 'selected' : ''}>Yes</option></select>
                </div>
                <div class="hs-field hs-field-wide"><label>Loss Payee Name</label><input type="text" data-field="lossPayeeName" value="${_val(v.lossPayeeName)}"></div>
                <div class="hs-field hs-field-wide"><label>Loss Payee Address</label><input type="text" data-field="lossPayeeAddress" value="${_val(v.lossPayeeAddress)}"></div>
                <div class="hs-field"><label>LP City</label><input type="text" data-field="lossPayeeCity" value="${_val(v.lossPayeeCity)}"></div>
                <div class="hs-field"><label>LP State</label><input type="text" data-field="lossPayeeState" value="${_val(v.lossPayeeState)}" maxlength="2"></div>
                <div class="hs-field"><label>LP ZIP</label><input type="text" data-field="lossPayeeZip" value="${_val(v.lossPayeeZip)}" maxlength="10"></div>
            </div>
        </div>`;
    }

    // ── Build driver row HTML ───────────────────────────────
    function _driverRowHTML(d, index) {
        return `
        <div class="hs-driver-row hs-card" data-index="${index}">
            <div class="hs-card-header">
                <span class="hs-card-number">${index + 1}</span>
                <span class="hs-card-title">${d.firstName || ''} ${d.lastName || ''}</span>
                <button type="button" class="hs-btn-icon hs-btn-remove" onclick="HawkSoftExport.removeDriver(${index})" title="Remove driver">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="hs-form-grid">
                <div class="hs-field"><label>First Name</label><input type="text" data-field="firstName" value="${_val(d.firstName)}"></div>
                <div class="hs-field"><label>Last Name</label><input type="text" data-field="lastName" value="${_val(d.lastName)}"></div>
                <div class="hs-field"><label>MI</label><input type="text" data-field="middleInitial" value="${_val(d.middleInitial)}" maxlength="1"></div>
                <div class="hs-field"><label>DOB</label><input type="text" data-field="birthDate" value="${_val(d.birthDate)}" placeholder="MM/DD/YY"></div>
                <div class="hs-field"><label>Sex</label>
                    <select data-field="sex">
                        <option value="">—</option>
                        <option value="Male" ${d.sex === 'Male' ? 'selected' : ''}>Male</option>
                        <option value="Female" ${d.sex === 'Female' ? 'selected' : ''}>Female</option>
                    </select>
                </div>
                <div class="hs-field"><label>Marital Status</label>
                    <select data-field="maritalStatus">
                        <option value="">—</option>
                        <option value="Single" ${d.maritalStatus === 'Single' ? 'selected' : ''}>Single</option>
                        <option value="Married" ${d.maritalStatus === 'Married' ? 'selected' : ''}>Married</option>
                        <option value="Divorced" ${d.maritalStatus === 'Divorced' ? 'selected' : ''}>Divorced</option>
                        <option value="Widowed" ${d.maritalStatus === 'Widowed' ? 'selected' : ''}>Widowed</option>
                        <option value="Separated" ${d.maritalStatus === 'Separated' ? 'selected' : ''}>Separated</option>
                        <option value="Domestic Partner" ${d.maritalStatus === 'Domestic Partner' ? 'selected' : ''}>Domestic Partner</option>
                    </select>
                </div>
                <div class="hs-field"><label>License #</label><input type="text" data-field="licenseNumber" value="${_val(d.licenseNumber)}" style="text-transform:uppercase"></div>
                <div class="hs-field"><label>License State</label><input type="text" data-field="licenseState" value="${_val(d.licenseState)}" maxlength="2" style="text-transform:uppercase"></div>
                <div class="hs-field"><label>Occupation</label><input type="text" data-field="occupation" value="${_val(d.occupation)}"></div>
                <div class="hs-field"><label>Relationship</label>
                    <select data-field="relationship">
                        <option value="Insured" ${d.relationship === 'Insured' ? 'selected' : ''}>Insured</option>
                        <option value="Spouse" ${d.relationship === 'Spouse' ? 'selected' : ''}>Spouse</option>
                        <option value="Child" ${d.relationship === 'Child' ? 'selected' : ''}>Child</option>
                        <option value="Parent" ${d.relationship === 'Parent' ? 'selected' : ''}>Parent</option>
                        <option value="Employee" ${d.relationship === 'Employee' ? 'selected' : ''}>Employee</option>
                        <option value="Other" ${d.relationship === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <div class="hs-field"><label>Principal Op.</label>
                    <select data-field="principalOperator"><option value="No">No</option><option value="Yes" ${d.principalOperator === 'Yes' ? 'selected' : ''}>Yes</option></select>
                </div>
                <div class="hs-field"><label>SR-22</label>
                    <select data-field="sr22Filing"><option value="">No</option><option value="Y" ${d.sr22Filing === 'Y' ? 'selected' : ''}>Yes</option></select>
                </div>
                <div class="hs-field"><label>SSN</label><input type="text" data-field="ssn" value="${_val(d.ssn)}" placeholder="XXX-XX-XXXX" maxlength="11" autocomplete="off" spellcheck="false" inputmode="numeric" oninput="var v=this.value.replace(/\D/g,'').slice(0,9);this.value=v.length>5?v.slice(0,3)+'-'+v.slice(3,5)+'-'+v.slice(5):v.length>3?v.slice(0,3)+'-'+v.slice(3):v"></div>
                <div class="hs-field"><label>Filing State</label><input type="text" data-field="sr22State" value="${_val(d.sr22State)}" maxlength="2" style="text-transform:uppercase"></div>
                <div class="hs-field"><label>Good Student</label>
                    <select data-field="goodStudent"><option value="No">No</option><option value="Yes" ${d.goodStudent === 'Yes' ? 'selected' : ''}>Yes</option></select>
                </div>
                <div class="hs-field"><label>Driver Training</label>
                    <select data-field="driverTraining"><option value="No">No</option><option value="Yes" ${d.driverTraining === 'Yes' ? 'selected' : ''}>Yes</option></select>
                </div>
                <div class="hs-field"><label>Defensive Drv</label>
                    <select data-field="defensiveDriver"><option value="No">No</option><option value="Yes" ${d.defensiveDriver === 'Yes' ? 'selected' : ''}>Yes</option></select>
                </div>
            </div>
        </div>`;
    }

    // ── Build commercial coverage row HTML ──────────────────
    function _coverageRowHTML(cov, index) {
        return `
        <div class="hs-coverage-row hs-card" data-index="${index}">
            <div class="hs-card-header">
                <span class="hs-card-number">${index + 1}</span>
                <span class="hs-card-title">${cov.name || 'Coverage'}</span>
                <button type="button" class="hs-btn-icon hs-btn-remove" onclick="HawkSoftExport.removeCoverage(${index})" title="Remove coverage">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="hs-form-grid">
                <div class="hs-field hs-field-wide"><label>Coverage Name</label><input type="text" data-field="covName" value="${_val(cov.name)}" placeholder="e.g. General Liability"></div>
                <div class="hs-field"><label>Limits</label><input type="text" data-field="covLimits" value="${_val(cov.limits)}" placeholder="$1,000,000 / $2,000,000"></div>
                <div class="hs-field"><label>Deductible</label><input type="text" data-field="covDeductible" value="${_val(cov.deductible)}" placeholder="$0"></div>
            </div>
        </div>`;
    }

    return {
        vehicleRow: _vehicleRowHTML,
        driverRow: _driverRowHTML,
        coverageRow: _coverageRowHTML,
    };
})();
