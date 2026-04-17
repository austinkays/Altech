// js/app-vehicles.js — Multi-driver and multi-vehicle management
// Extracted from index.html during Phase 2 monolith decomposition
'use strict';

Object.assign(App, {
    addDriver() {
        const id = `driver_${Date.now()}`;
        const driver = {
            id,
            firstName: '',
            lastName: '',
            dob: '',
            dlNum: '',
            dlState: 'WA',
            relationship: 'Self',
            isCoApplicant: false,
            isPrimaryApplicant: false,
            accidents: '',
            violations: '',
            studentGPA: ''
        };
        this.drivers.push(driver);
        this.renderDrivers();
        this.renderVehicles();
        this.saveDriversVehicles().catch(e => console.error("[vehicles] save failed:", e));
    },

    removeDriver(id) {
        const driver = this.drivers.find(d => d.id === id);
        // Prevent removing the synced primary applicant driver
        if (driver && driver.isPrimaryApplicant) {
            if (typeof this.toast === 'function') this.toast('Primary applicant driver cannot be removed.', 'error');
            return;
        }
        // If removing a synced co-applicant driver, uncheck the co-applicant toggle
        if (driver && driver.isCoApplicant) {
            const cb = document.getElementById('hasCoApplicant');
            const section = document.getElementById('coApplicantSection');
            if (cb) cb.checked = false;
            if (section) section.classList.remove('visible');
            this.data.hasCoApplicant = '';
            this.save({});
        }
        this.drivers = this.drivers.filter(d => d.id !== id);
        this.renderDrivers();
        this.renderVehicles();
        this.saveDriversVehicles().catch(e => console.error("[vehicles] save failed:", e));
    },

    updateDriver(id, field, value) {
        const driver = this.drivers.find(d => d.id === id);
        if (driver) {
            // Prevent manual overwrite of synced co-applicant locked fields
            const LOCKED_FIELDS = ['firstName', 'lastName', 'dob', 'gender', 'relationship', 'maritalStatus', 'occupation', 'education'];
            if ((driver.isCoApplicant || driver.isPrimaryApplicant) && LOCKED_FIELDS.includes(field)) return;
            // Normalize license # and state to uppercase
            if (field === 'dlNum' || field === 'dlState') value = (value || '').toUpperCase();
            driver[field] = value;
            // Re-render vehicle dropdowns when driver name changes
            if (field === 'firstName' || field === 'lastName') this.renderVehicles();
            this.saveDriversVehicles().catch(e => console.error("[vehicles] save failed:", e));
        }
    },

    renderDrivers() {
        const container = document.getElementById('driversList');
        if (!container) return;
        
        if (this.drivers.length === 0) {
            container.innerHTML = '<div class="hint">No drivers added yet. Click "+ Add Driver" below to get started.</div>';
            return;
        }
        
        container.innerHTML = this.drivers.map((driver, index) => {
            const isPrimary = index === 0;
            const isSynced = driver.isCoApplicant === true || driver.isPrimaryApplicant === true;
            const lockedAttr = isSynced ? 'readonly style="opacity:0.6;cursor:not-allowed;"' : '';
            const lockedSelAttr = isSynced ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : '';
            const syncedBadge = driver.isCoApplicant ? '<span style="background:var(--apple-blue);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:8px;">🔗 Synced from Co-Applicant</span>'
                : (driver.isPrimaryApplicant ? '<span style="background:var(--success);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:8px;">👤 Primary Applicant</span>' : '');
            const relationshipLabel = driver.relationship
                ? (driver.relationship === 'Self' && isPrimary ? '• Self' : (driver.relationship !== 'Self' ? `• ${driver.relationship}` : ''))
                : '';

            return `
            <div class="driver-vehicle-card">
                <div class="driver-vehicle-header">
                    <h3>Driver ${index + 1} ${relationshipLabel}${syncedBadge}</h3>
                    <button class="remove-btn" onclick="App.removeDriver('${driver.id}')" title="Remove driver">×</button>
                </div>
                
                <div class="grid-2">
                    <div>
                        <label class="label">First Name</label>
                        <input type="text" value="${Utils.escapeAttr(driver.firstName || '')}" 
                            onchange="App.updateDriver('${driver.id}', 'firstName', this.value)" 
                            placeholder="First name" ${lockedAttr}>
                    </div>
                    <div>
                        <label class="label">Last Name</label>
                        <input type="text" value="${Utils.escapeAttr(driver.lastName || '')}" 
                            onchange="App.updateDriver('${driver.id}', 'lastName', this.value)" 
                            placeholder="Last name" ${lockedAttr}>
                    </div>
                </div>
                
                <div class="grid-2">
                    <div>
                        <label class="label">Date of Birth</label>
                        <input type="date" value="${driver.dob || ''}" 
                            onchange="App.updateDriver('${driver.id}', 'dob', this.value)" ${lockedAttr}>
                    </div>
                    <div>
                        <label class="label">Relationship</label>
                        <select onchange="App.updateDriver('${driver.id}', 'relationship', this.value)" ${lockedSelAttr}>
                            ${isPrimary ? `<option value="Self" ${driver.relationship === 'Self' ? 'selected' : ''}>Self (Primary)</option>` : ''}
                            <option value="Spouse" ${driver.relationship === 'Spouse' ? 'selected' : ''}>Spouse / Partner</option>
                            <option value="Child" ${driver.relationship === 'Child' ? 'selected' : ''}>Child</option>
                            <option value="Parent" ${driver.relationship === 'Parent' ? 'selected' : ''}>Parent</option>
                            <option value="Other" ${driver.relationship === 'Other' ? 'selected' : ''}>Other Household Member</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">Gender</label>
                        <select onchange="App.updateDriver('${driver.id}', 'gender', this.value)" ${lockedSelAttr}>
                            <option value="">Select...</option>
                            <option value="M" ${driver.gender === 'M' ? 'selected' : ''}>Male</option>
                            <option value="F" ${driver.gender === 'F' ? 'selected' : ''}>Female</option>
                            <option value="X" ${driver.gender === 'X' ? 'selected' : ''}>Not Specified</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Marital Status</label>
                        <select onchange="App.updateDriver('${driver.id}', 'maritalStatus', this.value)">
                            <option value="" ${!driver.maritalStatus ? 'selected' : ''}>Select...</option>
                            <option value="Single" ${driver.maritalStatus === 'Single' ? 'selected' : ''}>Single</option>
                            <option value="Married" ${driver.maritalStatus === 'Married' ? 'selected' : ''}>Married</option>
                            <option value="Domestic Partner" ${driver.maritalStatus === 'Domestic Partner' ? 'selected' : ''}>Domestic Partner</option>
                            <option value="Widowed" ${driver.maritalStatus === 'Widowed' ? 'selected' : ''}>Widowed</option>
                            <option value="Separated" ${driver.maritalStatus === 'Separated' ? 'selected' : ''}>Separated</option>
                            <option value="Divorced" ${driver.maritalStatus === 'Divorced' ? 'selected' : ''}>Divorced</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">Occupation Industry</label>
                        <select onchange="App.updateDriver('${driver.id}', 'occupation', this.value)">
                            <option value="" ${!driver.occupation ? 'selected' : ''}>Select...</option>
                            <option value="Homemaker/House person" ${driver.occupation === 'Homemaker/House person' ? 'selected' : ''}>Homemaker / House Person</option>
                            <option value="Retired" ${driver.occupation === 'Retired' ? 'selected' : ''}>Retired</option>
                            <option value="Disabled" ${driver.occupation === 'Disabled' ? 'selected' : ''}>Disabled</option>
                            <option value="Unemployed" ${driver.occupation === 'Unemployed' ? 'selected' : ''}>Unemployed</option>
                            <option value="Student" ${driver.occupation === 'Student' ? 'selected' : ''}>Student</option>
                            <option value="Agriculture/Forestry/Fishing" ${driver.occupation === 'Agriculture/Forestry/Fishing' ? 'selected' : ''}>Agriculture / Forestry / Fishing</option>
                            <option value="Art/Design/Media" ${driver.occupation === 'Art/Design/Media' ? 'selected' : ''}>Art / Design / Media</option>
                            <option value="Banking/Finance/Real Estate" ${driver.occupation === 'Banking/Finance/Real Estate' ? 'selected' : ''}>Banking / Finance / Real Estate</option>
                            <option value="Business/Sales/Office" ${driver.occupation === 'Business/Sales/Office' ? 'selected' : ''}>Business / Sales / Office</option>
                            <option value="Construction/Energy Trades" ${driver.occupation === 'Construction/Energy Trades' ? 'selected' : ''}>Construction / Energy Trades</option>
                            <option value="Education/Library" ${driver.occupation === 'Education/Library' ? 'selected' : ''}>Education / Library</option>
                            <option value="Engineer/Architect/Science/Math" ${driver.occupation === 'Engineer/Architect/Science/Math' ? 'selected' : ''}>Engineer / Architect / Science / Math</option>
                            <option value="Government/Military" ${driver.occupation === 'Government/Military' ? 'selected' : ''}>Government / Military</option>
                            <option value="Information Technology" ${driver.occupation === 'Information Technology' ? 'selected' : ''}>Information Technology</option>
                            <option value="Insurance" ${driver.occupation === 'Insurance' ? 'selected' : ''}>Insurance</option>
                            <option value="Legal/Law Enforcement/Security" ${driver.occupation === 'Legal/Law Enforcement/Security' ? 'selected' : ''}>Legal / Law Enforcement / Security</option>
                            <option value="Maintenance/Repair/Housekeeping" ${driver.occupation === 'Maintenance/Repair/Housekeeping' ? 'selected' : ''}>Maintenance / Repair / Housekeeping</option>
                            <option value="Manufacturing/Production" ${driver.occupation === 'Manufacturing/Production' ? 'selected' : ''}>Manufacturing / Production</option>
                            <option value="Medical/Social Services/Religion" ${driver.occupation === 'Medical/Social Services/Religion' ? 'selected' : ''}>Medical / Social Services / Religion</option>
                            <option value="Personal Care/Service" ${driver.occupation === 'Personal Care/Service' ? 'selected' : ''}>Personal Care / Service</option>
                            <option value="Restaurant/Hotel Services" ${driver.occupation === 'Restaurant/Hotel Services' ? 'selected' : ''}>Restaurant / Hotel Services</option>
                            <option value="Sports/Recreation" ${driver.occupation === 'Sports/Recreation' ? 'selected' : ''}>Sports / Recreation</option>
                            <option value="Travel/Transportation/Warehousing" ${driver.occupation === 'Travel/Transportation/Warehousing' ? 'selected' : ''}>Travel / Transportation / Warehousing</option>
                            <option value="Other" ${driver.occupation === 'Other' ? 'selected' : ''}>Other</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Education</label>
                        <select onchange="App.updateDriver('${driver.id}', 'education', this.value)">
                            <option value="" ${!driver.education ? 'selected' : ''}>Select...</option>
                            <option value="No High School" ${driver.education === 'No High School' ? 'selected' : ''}>No High School Diploma</option>
                            <option value="High School" ${driver.education === 'High School' ? 'selected' : ''}>High School Diploma</option>
                            <option value="Some College" ${driver.education === 'Some College' ? 'selected' : ''}>Some College</option>
                            <option value="Associates" ${driver.education === 'Associates' ? 'selected' : ''}>Associate's Degree</option>
                            <option value="Bachelors" ${driver.education === 'Bachelors' ? 'selected' : ''}>Bachelor's Degree</option>
                            <option value="Masters" ${driver.education === 'Masters' ? 'selected' : ''}>Master's Degree</option>
                            <option value="Doctorate" ${driver.education === 'Doctorate' ? 'selected' : ''}>Doctorate</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">DL Status</label>
                        <select onchange="App.updateDriver('${driver.id}', 'dlStatus', this.value)">
                            <option value="" ${!driver.dlStatus ? 'selected' : ''}>Select...</option>
                            <option value="Valid" ${driver.dlStatus === 'Valid' ? 'selected' : ''}>Valid</option>
                            <option value="Permit" ${driver.dlStatus === 'Permit' ? 'selected' : ''}>Permit</option>
                            <option value="Expired" ${driver.dlStatus === 'Expired' ? 'selected' : ''}>Expired</option>
                            <option value="Suspended" ${driver.dlStatus === 'Suspended' ? 'selected' : ''}>Suspended</option>
                            <option value="Cancelled" ${driver.dlStatus === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                            <option value="Not Licensed" ${driver.dlStatus === 'Not Licensed' ? 'selected' : ''}>Not Licensed</option>
                            <option value="Permanently Revoked" ${driver.dlStatus === 'Permanently Revoked' ? 'selected' : ''}>Permanently Revoked</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Age Licensed</label>
                        <select onchange="App.updateDriver('${driver.id}', 'ageLicensed', this.value)">
                            <option value="" ${!driver.ageLicensed ? 'selected' : ''}>Select...</option>
                            <option value="16" ${driver.ageLicensed === '16' ? 'selected' : ''}>16</option>
                            <option value="17" ${driver.ageLicensed === '17' ? 'selected' : ''}>17</option>
                            <option value="18" ${driver.ageLicensed === '18' ? 'selected' : ''}>18</option>
                            <option value="19" ${driver.ageLicensed === '19' ? 'selected' : ''}>19</option>
                            <option value="20" ${driver.ageLicensed === '20' ? 'selected' : ''}>20</option>
                            <option value="21+" ${driver.ageLicensed === '21+' ? 'selected' : ''}>21+</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">SR-22 Required</label>
                        <select onchange="App.updateDriver('${driver.id}', 'sr22', this.value)">
                            <option value="No" ${driver.sr22 !== 'Yes' ? 'selected' : ''}>No</option>
                            <option value="Yes" ${driver.sr22 === 'Yes' ? 'selected' : ''}>Yes</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">FR-44 Required</label>
                        <select onchange="App.updateDriver('${driver.id}', 'fr44', this.value)">
                            <option value="No" ${driver.fr44 !== 'Yes' ? 'selected' : ''}>No</option>
                            <option value="Yes" ${driver.fr44 === 'Yes' ? 'selected' : ''}>Yes</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">Good Driver</label>
                        <select onchange="App.updateDriver('${driver.id}', 'goodDriver', this.value)">
                            <option value="" ${!driver.goodDriver ? 'selected' : ''}>Select...</option>
                            <option value="Yes" ${driver.goodDriver === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${driver.goodDriver === 'No' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Mature Driver</label>
                        <select onchange="App.updateDriver('${driver.id}', 'matureDriver', this.value)">
                            <option value="" ${!driver.matureDriver ? 'selected' : ''}>Select...</option>
                            <option value="Yes" ${driver.matureDriver === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${driver.matureDriver === 'No' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">License Sus/Rev (Last 5 yrs)</label>
                        <select onchange="App.updateDriver('${driver.id}', 'licenseSusRev', this.value)">
                            <option value="No" ${driver.licenseSusRev !== 'Yes' ? 'selected' : ''}>No</option>
                            <option value="Yes" ${driver.licenseSusRev === 'Yes' ? 'selected' : ''}>Yes</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Driver Education</label>
                        <select onchange="App.updateDriver('${driver.id}', 'driverEducation', this.value)">
                            <option value="No" ${driver.driverEducation !== 'Yes' ? 'selected' : ''}>No</option>
                            <option value="Yes" ${driver.driverEducation === 'Yes' ? 'selected' : ''}>Yes</option>
                        </select>
                    </div>
                </div>

                <label class="label">Driver's License <span class="ez-req" title="Required for EZLynx rating" style="color:#f5c842;margin-left:3px;font-size:0.85em;">✦</span></label>
                <div class="grid-2">
                    <input type="text" value="${Utils.escapeAttr(driver.dlNum || '')}" 
                        onchange="App.updateDriver('${driver.id}', 'dlNum', this.value)" 
                        style="text-transform:uppercase;font-family:monospace" 
                        placeholder="License #">
                    <select onchange="App.updateDriver('${driver.id}', 'dlState', this.value)">
                        ${['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(s =>
                            `<option value="${s}" ${(driver.dlState || 'WA') === s ? 'selected' : ''}>${s}</option>`
                        ).join('')}
                    </select>
                </div>

                <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
                    <h4 style="margin:0 0 8px;font-size:14px;font-weight:600;">Driving History</h4>
                    <label class="label">Accidents (Last 5 Years)</label>
                    <textarea rows="2" placeholder="Date, description, claim amount"
                        onchange="App.updateDriver('${driver.id}', 'accidents', this.value)">${Utils.escapeAttr(driver.accidents || '')}</textarea>

                    <label class="label">Violations / Tickets (Last 3 Years)</label>
                    <textarea rows="2" placeholder="Date, type of violation"
                        onchange="App.updateDriver('${driver.id}', 'violations', this.value)">${Utils.escapeAttr(driver.violations || '')}</textarea>

                    <div class="grid-2">
                        <div>
                            <label class="label">Student GPA (if applicable)</label>
                            <input type="text" value="${Utils.escapeAttr(driver.studentGPA || '')}" 
                                onchange="App.updateDriver('${driver.id}', 'studentGPA', this.value)" 
                                placeholder="3.5">
                        </div>
                        <div></div>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    },

    addVehicle() {
        const id = `vehicle_${Date.now()}`;
        const vehicle = {
            id,
            vin: '',
            year: '',
            make: '',
            model: '',
            use: 'Commute',
            miles: '12000',
            primaryDriver: ''
        };
        this.vehicles.push(vehicle);
        this.renderVehicles();
        this.saveDriversVehicles().catch(e => console.error("[vehicles] save failed:", e));
    },

    removeVehicle(id) {
        this.vehicles = this.vehicles.filter(v => v.id !== id);
        this.renderVehicles();
        this.saveDriversVehicles().catch(e => console.error("[vehicles] save failed:", e));
    },

    updateVehicle(id, field, value) {
        const vehicle = this.vehicles.find(v => v.id === id);
        if (vehicle) {
            vehicle[field] = value;
            if (!this._debouncedVehicleSave) this._debouncedVehicleSave = Utils.debounce(() => this.saveDriversVehicles(), 300);
            this._debouncedVehicleSave();
        }
    },

    async decodeVehicleVin(id, vin) {
        const vehicle = this.vehicles.find(v => v.id === id);
        if (!vehicle) return;

        const vinUpper = (vin || '').toUpperCase().trim();
        vehicle.vin = vinUpper;

        const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
        if (!vinUpper) {
            this.renderVehicles();
            return;
        }

        if (!vinRegex.test(vinUpper)) {
            if (typeof this.toast === 'function') {
                this.toast('Invalid VIN format (17 chars, no I/O/Q).');
            }
            this.renderVehicles();
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vinUpper}?format=json`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!r.ok) {
                throw new Error(`VIN decode failed: ${r.status}`);
            }

            const d = await r.json();
            const r1 = d && d.Results && d.Results[0];
            if (!r1) {
                throw new Error('No vehicle data found for VIN');
            }

            vehicle.year = r1.ModelYear || '';
            vehicle.make = r1.Make || '';
            vehicle.model = r1.Model || '';

            this.renderVehicles();
            this.saveDriversVehicles();
        } catch (e) {
            clearTimeout(timeoutId);
            if (typeof this.toast === 'function') {
                this.toast(e && e.name === 'AbortError'
                    ? 'VIN decode timed out. Enter details manually.'
                    : 'VIN decode failed. Enter details manually.');
            }
            console.error('VIN decode error:', e);
        }
    },

    renderVehicles() {
        const container = document.getElementById('vehiclesList');
        if (!container) return;
        
        if (this.vehicles.length === 0) {
            container.innerHTML = '<div class="hint">No vehicles added yet. Click "+ Add Vehicle" below to get started.</div>';
            return;
        }
        
        container.innerHTML = this.vehicles.map((vehicle, index) => {
        const driverOptions = this.drivers.map(d => 
            `<option value="${d.id}" ${vehicle.primaryDriver === d.id ? 'selected' : ''}>${Utils.escapeAttr(d.firstName)} ${Utils.escapeAttr(d.lastName)}</option>`
        ).join('');
        return `
            <div class="driver-vehicle-card">
                <div class="driver-vehicle-header">
                    <h3>Vehicle ${index + 1} ${vehicle.year && vehicle.make ? `— ${Utils.escapeAttr(vehicle.year)} ${Utils.escapeAttr(vehicle.make)}` : ''}</h3>
                    <button class="remove-btn" onclick="App.removeVehicle('${vehicle.id}')" title="Remove vehicle">×</button>
                </div>
                
                <label class="label">VIN (optional) - Auto-fills year/make/model <span class="ez-req" title="Required for EZLynx rating" style="color:#f5c842;margin-left:3px;font-size:0.85em;">✦</span></label>
                <input type="text" maxlength="17" value="${Utils.escapeAttr(vehicle.vin || '')}" 
                    onchange="App.decodeVehicleVin('${vehicle.id}', this.value)" 
                    style="text-transform:uppercase;font-family:monospace" 
                    placeholder="1HG...">
                <div class="hint" style="margin-top:6px;">No VIN? Leave blank and fill Year/Make/Model below.</div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                    <div>
                        <label class="label">Year</label>
                        <input type="text" inputmode="numeric" maxlength="4" value="${Utils.escapeAttr(vehicle.year || '')}" 
                            oninput="App.updateVehicle('${vehicle.id}', 'year', this.value)"
                            onchange="App.updateVehicle('${vehicle.id}', 'year', this.value)" 
                            placeholder="2020" style="min-width:0;">
                    </div>
                    <div>
                        <label class="label">Make</label>
                        <input type="text" value="${Utils.escapeAttr(vehicle.make || '')}" 
                            oninput="App.updateVehicle('${vehicle.id}', 'make', this.value)"
                            onchange="App.updateVehicle('${vehicle.id}', 'make', this.value)" 
                            placeholder="Honda">
                    </div>
                    <div>
                        <label class="label">Model</label>
                        <input type="text" value="${Utils.escapeAttr(vehicle.model || '')}" 
                            oninput="App.updateVehicle('${vehicle.id}', 'model', this.value)"
                            onchange="App.updateVehicle('${vehicle.id}', 'model', this.value)" 
                            placeholder="Civic">
                    </div>
                </div>
                
                <div class="grid-2">
                    <div>
                        <label class="label">Primary Use <span class="ez-req" title="Required for EZLynx rating" style="color:#f5c842;margin-left:3px;font-size:0.85em;">✦</span></label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'use', this.value)">
                            <option value="Pleasure" ${vehicle.use === 'Pleasure' ? 'selected' : ''}>Pleasure</option>
                            <option value="Commute" ${vehicle.use === 'Commute' ? 'selected' : ''}>To/From Work</option>
                            <option value="To/From School" ${vehicle.use === 'To/From School' ? 'selected' : ''}>To/From School</option>
                            <option value="Business" ${vehicle.use === 'Business' ? 'selected' : ''}>Business</option>
                            <option value="Farming" ${vehicle.use === 'Farming' ? 'selected' : ''}>Farming</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Annual Mileage <span class="ez-req" title="Required for EZLynx rating" style="color:#f5c842;margin-left:3px;font-size:0.85em;">✦</span></label>
                        <input type="number" value="${vehicle.miles || '12000'}" 
                            onchange="App.updateVehicle('${vehicle.id}', 'miles', this.value)" 
                            placeholder="12000">
                    </div>
                </div>
                
                <div class="grid-2">
                    <div>
                        <label class="label">Ownership Type <span class="ez-req" title="Required for EZLynx rating" style="color:#f5c842;margin-left:3px;font-size:0.85em;">✦</span></label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'ownershipType', this.value)">
                            <option value="" ${!vehicle.ownershipType ? 'selected' : ''}>Select...</option>
                            <option value="Owned" ${vehicle.ownershipType === 'Owned' ? 'selected' : ''}>Owned</option>
                            <option value="Leased" ${vehicle.ownershipType === 'Leased' ? 'selected' : ''}>Leased</option>
                            <option value="Lien" ${vehicle.ownershipType === 'Lien' ? 'selected' : ''}>Lien</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Performance</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'performance', this.value)">
                            <option value="" ${!vehicle.performance ? 'selected' : ''}>Select...</option>
                            <option value="Standard" ${vehicle.performance === 'Standard' ? 'selected' : ''}>Standard</option>
                            <option value="Sports" ${vehicle.performance === 'Sports' ? 'selected' : ''}>Sports</option>
                            <option value="Intermediate" ${vehicle.performance === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                            <option value="High Performance" ${vehicle.performance === 'High Performance' ? 'selected' : ''}>High Performance</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">Anti-Theft</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'antiTheft', this.value)">
                            <option value="" ${!vehicle.antiTheft ? 'selected' : ''}>None</option>
                            <option value="Active" ${vehicle.antiTheft === 'Active' ? 'selected' : ''}>Active</option>
                            <option value="Alarm Only" ${vehicle.antiTheft === 'Alarm Only' ? 'selected' : ''}>Alarm Only</option>
                            <option value="Passive" ${vehicle.antiTheft === 'Passive' ? 'selected' : ''}>Passive</option>
                            <option value="Vehicle Recovery System" ${vehicle.antiTheft === 'Vehicle Recovery System' ? 'selected' : ''}>Vehicle Recovery System</option>
                            <option value="Both Active and Passive" ${vehicle.antiTheft === 'Both Active and Passive' ? 'selected' : ''}>Both Active and Passive</option>
                            <option value="VIN# Etching" ${vehicle.antiTheft === 'VIN# Etching' ? 'selected' : ''}>VIN# Etching</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Passive Restraints</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'passiveRestraints', this.value)">
                            <option value="" ${!vehicle.passiveRestraints ? 'selected' : ''}>Select...</option>
                            <option value="Automatic Seatbelts" ${vehicle.passiveRestraints === 'Automatic Seatbelts' ? 'selected' : ''}>Automatic Seatbelts</option>
                            <option value="Airbag (Drvr Side)" ${vehicle.passiveRestraints === 'Airbag (Drvr Side)' ? 'selected' : ''}>Airbag (Driver Side)</option>
                            <option value="Auto Stbelts/Drvr Airbag" ${vehicle.passiveRestraints === 'Auto Stbelts/Drvr Airbag' ? 'selected' : ''}>Auto Seatbelts / Driver Airbag</option>
                            <option value="Airbag Both Sides" ${vehicle.passiveRestraints === 'Airbag Both Sides' ? 'selected' : ''}>Airbag Both Sides</option>
                            <option value="Auto Stbelts/Airbag Both" ${vehicle.passiveRestraints === 'Auto Stbelts/Airbag Both' ? 'selected' : ''}>Auto Seatbelts / Airbag Both</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">Anti-Lock Brakes</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'antiLockBrakes', this.value)">
                            <option value="" ${!vehicle.antiLockBrakes ? 'selected' : ''}>Select...</option>
                            <option value="Yes" ${vehicle.antiLockBrakes === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${vehicle.antiLockBrakes === 'No' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Daytime Running Lights</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'daytimeRunningLights', this.value)">
                            <option value="" ${!vehicle.daytimeRunningLights ? 'selected' : ''}>Select...</option>
                            <option value="Yes" ${vehicle.daytimeRunningLights === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${vehicle.daytimeRunningLights === 'No' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">Was the Car New?</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'carNew', this.value)">
                            <option value="" ${!vehicle.carNew ? 'selected' : ''}>Select...</option>
                            <option value="Yes" ${vehicle.carNew === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${vehicle.carNew === 'No' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Telematics</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'telematics', this.value)">
                            <option value="" ${!vehicle.telematics ? 'selected' : ''}>Select...</option>
                            <option value="Yes" ${vehicle.telematics === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${vehicle.telematics === 'No' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2">
                    <div>
                        <label class="label">Car Pool</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'carPool', this.value)">
                            <option value="" ${!vehicle.carPool ? 'selected' : ''}>Select...</option>
                            <option value="Yes" ${vehicle.carPool === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${vehicle.carPool === 'No' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                    <div>
                        <label class="label">Rideshare (TNC)</label>
                        <select onchange="App.updateVehicle('${vehicle.id}', 'tnc', this.value)">
                            <option value="" ${!vehicle.tnc ? 'selected' : ''}>Select...</option>
                            <option value="Yes" ${vehicle.tnc === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${vehicle.tnc === 'No' ? 'selected' : ''}>No</option>
                        </select>
                    </div>
                </div>
                
                <label class="label">Primary Driver</label>
                <select onchange="App.updateVehicle('${vehicle.id}', 'primaryDriver', this.value)">
                    <option value="">Select driver...</option>
                    ${driverOptions}
                </select>
            </div>
        `}).join('');
    },

    async saveDriversVehicles() {
        this.data.drivers = this.drivers;
        this.data.vehicles = this.vehicles;

        // Encrypt and save
        if (this.encryptionEnabled) {
            const encrypted = await CryptoHelper.encrypt(this.data);
            safeSave(this.storageKey, encrypted);
        } else {
            safeSave(this.storageKey, JSON.stringify(this.data));
        }
        // Queue cloud sync so driver/vehicle edits propagate across devices
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            try { CloudSync.schedulePush(); } catch (e) { /* ok */ }
        }
    },

    async loadDriversVehicles() {
        if (this.data.drivers && Array.isArray(this.data.drivers)) {
            this.drivers = this.data.drivers;
        } else {
            // Migrate old single driver/vehicle to new format
            if (this.data.dlNum || this.data.vin) {
                this.drivers = [{
                    id: `driver_${Date.now()}`,
                    firstName: this.data.firstName || '',
                    lastName: this.data.lastName || '',
                    dob: this.data.dob || '',
                    dlNum: this.data.dlNum || '',
                    dlState: this.data.dlState || 'WA',
                    relationship: 'Self'
                }];
            }
        }

        if (this.data.vehicles && Array.isArray(this.data.vehicles)) {
            this.vehicles = this.data.vehicles;
        } else {
            // Migrate old single vehicle
            if (this.data.vin || this.data.vehDesc) {
                const parts = (this.data.vehDesc || '').match(/(\d{4})\s+(.+?)\s+(.+)/);
                this.vehicles = [{
                    id: `vehicle_${Date.now()}`,
                    vin: this.data.vin || '',
                    year: parts ? parts[1] : '',
                    make: parts ? parts[2] : '',
                    model: parts ? parts[3] : '',
                    use: this.data.use || 'Commute',
                    miles: this.data.miles || '12000',
                    primaryDriver: ''
                }];
            }
        }
        
        this.renderDrivers();
        this.renderVehicles();
    }
});
