// EZLynxTool - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

const EZLynxTool = {
    initialized: false,

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.loadFormData();
        this._loadIncidents();
        this.renderIncidents();
        this._wireAutoSave();
        this._restoreClientBanner();
    },

    formStorageKey: 'altech_ezlynx_formdata',

    // ── Form Data Persistence ──
    saveFormData() {
        try {
            const data = {};
            this.formFields.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.value) data[id] = el.value;
            });
            localStorage.setItem(this.formStorageKey, JSON.stringify(data));
        } catch (e) { /* quota */ }
    },

    loadFormData() {
        try {
            const raw = localStorage.getItem(this.formStorageKey);
            if (!raw) return;
            const data = JSON.parse(raw);
            Object.keys(data).forEach(id => {
                this.setField(id, data[id]);
            });
        } catch (e) { /* corrupt */ }
    },

    _wireAutoSave() {
        let timer;
        const save = () => {
            clearTimeout(timer);
            timer = setTimeout(() => this.saveFormData(), 300);
        };
        this.formFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', save);
                el.addEventListener('change', save);
            }
        });
    },

    // ── Form helpers ──
    formFields: ['ezFirstName','ezLastName','ezMiddleName','ezDOB','ezGender',
        'ezMaritalStatus','ezEmail','ezPhone','ezAddress','ezCity','ezState',
        'ezZip','ezCounty','ezYearsAtAddress','ezEducation','ezOccupation','ezIndustry','ezLicenseNumber',
        // Auto Policy & Coverage
        'ezPolicyTerm','ezPriorCarrier','ezPriorPolicyTerm','ezPriorYearsWithCarrier',
        'ezEffectiveDate','ezBodilyInjury','ezPropertyDamage','ezComprehensive',
        'ezCollision','ezMedPaymentsAuto','ezUMPD','ezPriorLiabilityLimits',
        'ezYearsContinuousCoverage','ezNumResidents','ezResidenceIs',
        'ezAccidents','ezViolations',
        // Driver & Vehicle
        'ezDLState','ezAgeLicensed','ezVIN','ezVehicleYear','ezVehicleMake',
        'ezVehicleModel','ezVehicleUse','ezAnnualMiles','ezOwnershipType',
        // Home Dwelling
        'ezDwellingUsage','ezOccupancyType','ezDwellingType','ezNumStories',
        'ezConstructionStyle','ezExteriorWalls','ezFoundationType','ezRoofType',
        'ezRoofDesign','ezRoofYear','ezHeatingType','ezCooling',
        'ezBurglarAlarm','ezFireDetection','ezSprinklerSystem','ezProtectionClass',
        'ezSqFt','ezYearBuilt','ezLotSize','ezBedrooms',
        'ezSmokeDetector','ezFeetFromHydrant','ezNumFullBaths','ezNumHalfBaths',
        'ezNumOccupants','ezGarageType','ezGarageSpaces','ezNumFireplaces',
        'ezPool','ezTrampoline',
        // Home Coverage
        'ezHomePolicyType','ezHomePriorCarrier','ezHomePriorPolicyTerm',
        'ezHomePriorYears','ezHomePriorExp',
        'ezDwellingCoverage','ezHomePersonalLiability','ezHomeMedicalPayments',
        'ezAllPerilsDeductible','ezTheftDeductible','ezWindDeductible','ezMortgagee'],

    getFormData() {
        const data = {};
        const keyMap = {
            ezFirstName: 'FirstName', ezLastName: 'LastName', ezMiddleName: 'MiddleName',
            ezDOB: 'DOB', ezGender: 'Gender', ezMaritalStatus: 'MaritalStatus',
            ezEmail: 'Email', ezPhone: 'Phone', ezAddress: 'Address',
            ezCity: 'City', ezState: 'State', ezZip: 'Zip',
            ezCounty: 'County', ezYearsAtAddress: 'YearsAtAddress',
            ezEducation: 'Education', ezOccupation: 'Occupation',
            ezIndustry: 'Industry', ezLicenseNumber: 'LicenseNumber',
            // Auto Policy
            ezPolicyTerm: 'PolicyTerm', ezPriorCarrier: 'PriorCarrier',
            ezPriorPolicyTerm: 'PriorPolicyTerm', ezPriorYearsWithCarrier: 'PriorYearsWithCarrier',
            ezEffectiveDate: 'EffectiveDate', ezBodilyInjury: 'BodilyInjury',
            ezPropertyDamage: 'PropertyDamage', ezComprehensive: 'Comprehensive',
            ezCollision: 'Collision', ezMedPaymentsAuto: 'MedPaymentsAuto',
            ezUMPD: 'UMPD', ezPriorLiabilityLimits: 'PriorLiabilityLimits',
            ezYearsContinuousCoverage: 'YearsContinuousCoverage',
            ezNumResidents: 'NumResidents', ezResidenceIs: 'ResidenceIs',
            ezAccidents: 'Accidents', ezViolations: 'Violations',
            // Driver & Vehicle
            ezDLState: 'DLState', ezAgeLicensed: 'AgeLicensed',
            ezVIN: 'VIN', ezVehicleYear: 'VehicleYear', ezVehicleMake: 'VehicleMake',
            ezVehicleModel: 'VehicleModel', ezVehicleUse: 'VehicleUse',
            ezAnnualMiles: 'AnnualMiles', ezOwnershipType: 'OwnershipType',
            // Home Dwelling
            ezDwellingUsage: 'DwellingUsage', ezOccupancyType: 'OccupancyType',
            ezDwellingType: 'DwellingType', ezNumStories: 'NumStories',
            ezConstructionStyle: 'ConstructionStyle', ezExteriorWalls: 'ExteriorWalls',
            ezFoundationType: 'FoundationType', ezRoofType: 'RoofType',
            ezRoofDesign: 'RoofDesign', ezRoofYear: 'RoofYear', ezHeatingType: 'HeatingType',
            ezCooling: 'Cooling',
            ezBurglarAlarm: 'BurglarAlarm', ezFireDetection: 'FireDetection',
            ezSprinklerSystem: 'SprinklerSystem', ezProtectionClass: 'ProtectionClass',
            ezSqFt: 'SqFt', ezYearBuilt: 'YearBuilt', ezLotSize: 'LotSize',
            ezBedrooms: 'Bedrooms',
            ezSmokeDetector: 'SmokeDetector', ezFeetFromHydrant: 'FeetFromHydrant',
            ezNumFullBaths: 'NumFullBaths', ezNumHalfBaths: 'NumHalfBaths',
            ezNumOccupants: 'NumOccupants',
            ezGarageType: 'GarageType', ezGarageSpaces: 'GarageSpaces',
            ezNumFireplaces: 'NumFireplaces',
            ezPool: 'Pool', ezTrampoline: 'Trampoline',
            // Home Coverage
            ezHomePolicyType: 'HomePolicyType', ezHomePriorCarrier: 'HomePriorCarrier',
            ezHomePriorPolicyTerm: 'HomePriorPolicyTerm',
            ezHomePriorYears: 'HomePriorYears', ezHomePriorExp: 'HomePriorExp',
            ezDwellingCoverage: 'DwellingCoverage',
            ezHomePersonalLiability: 'HomePersonalLiability',
            ezHomeMedicalPayments: 'HomeMedicalPayments',
            ezAllPerilsDeductible: 'AllPerilsDeductible',
            ezTheftDeductible: 'TheftDeductible', ezWindDeductible: 'WindDeductible',
            ezMortgagee: 'Mortgagee'
        };
        this.formFields.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value.trim()) {
                data[keyMap[id] || id] = el.value.trim();
            }
        });
        // Auto-derive County from City + State if available
        if (data.City && data.State && typeof App !== 'undefined' && App.getCountyFromCity) {
            const county = App.getCountyFromCity(data.City, data.State.toUpperCase());
            if (county) data.County = county;
        }

        // Truncate ZIP to 5 digits for Chrome extension
        if (data.Zip) data.Zip = String(data.Zip).replace(/[^0-9]/g, '').slice(0, 5);

        // Append multi-driver array from App.drivers
        if (typeof App !== 'undefined' && Array.isArray(App.drivers) && App.drivers.length > 0) {
            data.Drivers = App.drivers.map(d => ({
                FirstName: d.firstName || '',
                LastName: d.lastName || '',
                DOB: d.dob ? this._fmtDateForEZ(d.dob) : '',
                Gender: d.gender === 'M' ? 'Male' : d.gender === 'F' ? 'Female' : (d.gender || ''),
                MaritalStatus: d.maritalStatus || '',
                Relationship: d.relationship || '',
                Occupation: d.occupationIndustry || '',
                Education: d.education || '',
                LicenseNumber: d.dlNum || '',
                DLState: d.dlState || '',
                AgeLicensed: d.ageLicensed || '',
                LicenseStatus: d.dlStatus || '',
                SR22: d.sr22 || '',
                GoodDriver: d.goodDriver || '',
                IsCoApplicant: d.isCoApplicant || false
            }));
        }

        // Append multi-vehicle array from App.vehicles
        if (typeof App !== 'undefined' && Array.isArray(App.vehicles) && App.vehicles.length > 0) {
            data.Vehicles = App.vehicles.map(v => ({
                VIN: v.vin || '',
                Year: v.year || '',
                Make: v.make || '',
                Model: v.model || '',
                Use: v.use || '',
                AnnualMiles: v.miles || '',
                Ownership: v.ownership || '',
                GaragingAddress: v.garagingAddr || '',
                GaragingCity: v.garagingCity || '',
                GaragingState: v.garagingState || '',
                GaragingZip: v.garagingZip ? String(v.garagingZip).replace(/[^0-9]/g, '').slice(0, 5) : ''
            }));
        }

        // Append incidents (violations, accidents, claims) — smart skip: omit if empty
        if (this.incidents && this.incidents.length > 0) {
            data.Incidents = this.incidents.map(i => ({
                Type: i.type || 'violation',
                Subtype: i.subtype || '',
                Date: i.date || '',
                Description: i.description || '',
                Amount: i.amount || ''
            }));
        }

        return data;
    },

    /** Convert YYYY-MM-DD → MM/DD/YYYY for EZLynx */
    _fmtDateForEZ(v) {
        if (!v) return '';
        const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${m[2]}/${m[3]}/${m[1]}` : v;
    },

    setField(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    },

    loadDemo() {
        // Personal
        this.setField('ezFirstName', 'Austin');
        this.setField('ezLastName', 'Kays');
        this.setField('ezMiddleName', '');
        this.setField('ezDOB', '01/15/1990');
        this.setField('ezGender', 'Male');
        this.setField('ezMaritalStatus', 'Single');
        this.setField('ezEmail', 'austin@example.com');
        this.setField('ezPhone', '3605551234');
        this.setField('ezAddress', '123 Main St');
        this.setField('ezCity', 'Vancouver');
        this.setField('ezState', 'WA');
        this.setField('ezZip', '98686');
        this.setField('ezCounty', 'Clark');
        this.setField('ezYearsAtAddress', '5');
        this.setField('ezEducation', 'Bachelors');
        this.setField('ezOccupation', 'Insurance Agent');
        this.setField('ezIndustry', 'Insurance');
        this.setField('ezLicenseNumber', 'KAYSAB123XY');
        // Auto Policy
        this.setField('ezPolicyTerm', '12 Month');
        this.setField('ezEffectiveDate', '03/01/2026');
        this.setField('ezPriorCarrier', 'State Farm');
        this.setField('ezPriorPolicyTerm', '6 Month');
        this.setField('ezPriorYearsWithCarrier', '3');
        this.setField('ezBodilyInjury', '100/300');
        this.setField('ezPropertyDamage', '100000');
        this.setField('ezComprehensive', '500');
        this.setField('ezCollision', '500');
        this.setField('ezMedPaymentsAuto', '5000');
        this.setField('ezUMPD', '100/300');
        this.setField('ezPriorLiabilityLimits', '50/100');
        this.setField('ezYearsContinuousCoverage', '5');
        this.setField('ezNumResidents', '2');
        this.setField('ezResidenceIs', 'Own Home');
        this.setField('ezAccidents', '0');
        this.setField('ezViolations', '0');
        // Driver & Vehicle
        this.setField('ezDLState', 'WA');
        this.setField('ezAgeLicensed', '16');
        this.setField('ezVIN', '');
        this.setField('ezVehicleYear', '2022');
        this.setField('ezVehicleMake', 'Honda');
        this.setField('ezVehicleModel', 'Civic');
        this.setField('ezVehicleUse', 'Pleasure');
        this.setField('ezAnnualMiles', '12000');
        this.setField('ezOwnershipType', 'Owned');
        // Home Dwelling
        this.setField('ezDwellingUsage', 'Primary');
        this.setField('ezOccupancyType', 'Owner Occupied');
        this.setField('ezDwellingType', 'One Family');
        this.setField('ezNumStories', '2');
        this.setField('ezConstructionStyle', 'Ranch');
        this.setField('ezExteriorWalls', 'Siding, Vinyl');
        this.setField('ezFoundationType', 'Crawl Space - Enclosed');
        this.setField('ezRoofType', 'Architectural Shingles');
        this.setField('ezRoofDesign', 'Gable');
        this.setField('ezRoofYear', '2015');
        this.setField('ezHeatingType', 'Gas - Forced Air');
        this.setField('ezCooling', 'Central Air');
        this.setField('ezBurglarAlarm', 'None');
        this.setField('ezFireDetection', 'Local');
        this.setField('ezSprinklerSystem', 'None');
        this.setField('ezProtectionClass', '4');
        this.setField('ezSqFt', '1800');
        this.setField('ezYearBuilt', '1995');
        this.setField('ezLotSize', '0.25');
        this.setField('ezBedrooms', '3');
        this.setField('ezSmokeDetector', 'Local');
        this.setField('ezFeetFromHydrant', '1-500');
        this.setField('ezNumFullBaths', '2');
        this.setField('ezNumHalfBaths', '1');
        this.setField('ezNumOccupants', '3');
        this.setField('ezGarageType', 'Attached');
        this.setField('ezGarageSpaces', '2');
        this.setField('ezNumFireplaces', '1');
        this.setField('ezPool', 'No');
        this.setField('ezTrampoline', 'No');
        // Home Coverage
        this.setField('ezHomePolicyType', 'HO3');
        this.setField('ezHomePriorCarrier', 'Safeco');
        this.setField('ezHomePriorPolicyTerm', '12 Month');
        this.setField('ezHomePriorYears', '4');
        this.setField('ezHomePriorExp', '03/01/2026');
        this.setField('ezDwellingCoverage', '350000');
        this.setField('ezHomePersonalLiability', '300000');
        this.setField('ezHomeMedicalPayments', '5000');
        this.setField('ezAllPerilsDeductible', '1000');
        this.setField('ezTheftDeductible', '1000');
        this.setField('ezWindDeductible', '1000');
        this.setField('ezMortgagee', 'US Bank');
        // Open sections to show data
        document.getElementById('ezAutoSection')?.setAttribute('open', '');
        document.getElementById('ezDriverSection')?.setAttribute('open', '');
        document.getElementById('ezHomeSection')?.setAttribute('open', '');
        document.getElementById('ezHomeCovSection')?.setAttribute('open', '');
        this.saveFormData();        this._updateClientBanner('Austin Kays', 'Demo data \u2022 All sections');        App.toast('🧪 Demo data loaded (all sections)');
    },

    // ── Client Picker ──
    async showClientPicker() {
        const picker = document.getElementById('ezClientPicker');
        const list = document.getElementById('ezPickerList');
        if (!picker || !list) return;

        // Build list of available clients
        let html = '';

        // 1) Current intake form (always available if App.data has a name)
        const d = (typeof App !== 'undefined' && App.data) ? App.data : {};
        const currentName = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (currentName) {
            const type = (d.qType || '').toUpperCase() || 'QUOTE';
            html += `<div class="ez-picker-item ez-picker-current" onclick="EZLynxTool.loadClient('intake')">
                <div class="ez-picker-avatar">${(d.firstName || '?')[0].toUpperCase()}</div>
                <div class="ez-picker-info">
                    <span class="ez-picker-name">${this._escHTML(currentName)}</span>
                    <span class="ez-picker-detail">Current form \u2022 ${type}</span>
                </div>
                <span class="ez-picker-badge current">Current</span>
            </div>`;
        }

        // 2) Saved quotes/drafts
        try {
            const quotes = (typeof App !== 'undefined' && App.getQuotes) ? await App.getQuotes() : [];
            if (quotes.length > 0) {
                quotes.forEach(q => {
                    if (!q || !q.data) return;
                    const qName = [q.data.firstName, q.data.lastName].filter(Boolean).join(' ') || 'Unnamed';
                    const qType = (q.data.qType || '').toUpperCase() || 'QUOTE';
                    const updated = q.updatedAt ? new Date(q.updatedAt).toLocaleDateString() : '';
                    const initial = (q.data.firstName || q.data.lastName || '?')[0].toUpperCase();
                    const starred = q.starred ? ' \u2b50' : '';
                    html += `<div class="ez-picker-item" onclick="EZLynxTool.loadClient('quote','${this._escHTML(q.id)}')">
                        <div class="ez-picker-avatar">${initial}</div>
                        <div class="ez-picker-info">
                            <span class="ez-picker-name">${this._escHTML(qName)}${starred}</span>
                            <span class="ez-picker-detail">${qType} \u2022 ${updated}</span>
                        </div>
                    </div>`;
                });
            }
        } catch (e) { /* quotes not available */ }

        if (!html) {
            html = '<div class="ez-picker-empty">No saved clients yet \u2014 fill the intake form first</div>';
        }

        list.innerHTML = html;
        picker.style.display = 'block';
    },

    hideClientPicker() {
        const picker = document.getElementById('ezClientPicker');
        if (picker) picker.style.display = 'none';
    },

    async loadClient(source, id) {
        this.hideClientPicker();
        if (source === 'intake') {
            this.loadFromIntake();
            return;
        }
        if (source === 'quote' && id) {
            try {
                const quotes = (typeof App !== 'undefined' && App.getQuotes) ? await App.getQuotes() : [];
                const quote = quotes.find(q => q.id === id);
                if (quote && quote.data) {
                    // Temporarily replace App.data to reuse loadFromIntake logic
                    const origData = (typeof App !== 'undefined') ? App.data : null;
                    if (typeof App !== 'undefined') App.data = quote.data;
                    this.loadFromIntake();
                    if (typeof App !== 'undefined' && origData) App.data = origData;
                    return;
                }
            } catch (e) { /* fallback */ }
            App.toast('\u26a0\ufe0f Could not load that client');
        }
    },

    _updateClientBanner(name, meta) {
        const nameEl = document.getElementById('ezClientName');
        const metaEl = document.getElementById('ezClientMeta');
        const avatarEl = document.getElementById('ezClientAvatar');
        const banner = document.getElementById('ezClientBanner');
        if (nameEl) nameEl.textContent = name || 'No Client Loaded';
        if (metaEl) metaEl.textContent = meta || '';
        if (avatarEl) avatarEl.textContent = name ? name[0].toUpperCase() : '?';
        if (banner) banner.classList.toggle('loaded', !!name);
    },

    _escHTML(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    loadFromIntake() {
        // Pull from main App.data + drivers[0] + vehicles[0]
        const d = (typeof App !== 'undefined' && App.data) ? App.data : {};
        const drv = (typeof App !== 'undefined' && Array.isArray(App.drivers) && App.drivers[0]) ? App.drivers[0] : {};
        const veh = (typeof App !== 'undefined' && Array.isArray(App.vehicles) && App.vehicles[0]) ? App.vehicles[0] : {};
        const fmtDate = (v) => this._fmtDateForEZ(v);

        // Personal
        this.setField('ezFirstName', d.firstName || '');
        this.setField('ezLastName', d.lastName || '');
        this.setField('ezMiddleName', d.middleName || '');
        this.setField('ezDOB', fmtDate(d.dob));
        // Map gender code to full word for EZLynx dropdowns
        const genderVal = d.gender === 'M' ? 'Male' : d.gender === 'F' ? 'Female' : (d.gender || '');
        this.setField('ezGender', genderVal);
        this.setField('ezMaritalStatus', d.maritalStatus || '');
        this.setField('ezEmail', d.email || '');
        this.setField('ezPhone', d.phone || '');
        this.setField('ezAddress', d.addrStreet || '');
        this.setField('ezCity', d.addrCity || '');
        this.setField('ezState', d.addrState || '');
        // Truncate ZIP to 5 digits
        const zip5 = (d.addrZip || '').replace(/[^0-9]/g, '').slice(0, 5);
        this.setField('ezZip', zip5);
        // County: derive from intake field or auto-derive from city+state
        let county = d.county || '';
        if (!county && d.addrCity && d.addrState && typeof App !== 'undefined' && App.getCountyFromCity) {
            county = App.getCountyFromCity(d.addrCity, (d.addrState || '').toUpperCase()) || '';
        }
        this.setField('ezCounty', county);
        this.setField('ezYearsAtAddress', d.yearsAtAddress || '');
        this.setField('ezEducation', d.education || '');
        this.setField('ezOccupation', d.occupation || '');
        this.setField('ezIndustry', d.industry || '');
        this.setField('ezLicenseNumber', drv.dlNum || '');

        // Auto Policy & Coverage (from auto prior insurance fields)
        this.setField('ezPolicyTerm', d.policyTerm || '');
        this.setField('ezEffectiveDate', fmtDate(d.effectiveDate));
        this.setField('ezPriorCarrier', d.priorCarrier || '');
        this.setField('ezPriorPolicyTerm', d.priorPolicyTerm || '');
        this.setField('ezPriorYearsWithCarrier', d.priorYears || '');
        this.setField('ezBodilyInjury', d.liabilityLimits || '');
        this.setField('ezPropertyDamage', d.pdLimit || '');
        this.setField('ezComprehensive', d.compDeductible || '');
        this.setField('ezCollision', d.autoDeductible || '');
        this.setField('ezMedPaymentsAuto', d.medPayments || '');
        this.setField('ezUMPD', d.umLimits || d.uimLimits || '');
        this.setField('ezPriorLiabilityLimits', d.priorLiabilityLimits || '');
        this.setField('ezYearsContinuousCoverage', d.continuousCoverage || '');
        this.setField('ezNumResidents', d.numOccupants || '');
        this.setField('ezResidenceIs', d.residenceIs || '');
        this.setField('ezAccidents', d.accidents || '');
        this.setField('ezViolations', d.violations || '');

        // Driver (from first driver or fallback to App.data)
        this.setField('ezDLState', drv.dlState || d.addrState || '');
        this.setField('ezAgeLicensed', drv.ageLicensed || '');
        this.setField('ezVIN', veh.vin || '');
        this.setField('ezVehicleYear', veh.year || '');
        this.setField('ezVehicleMake', veh.make || '');
        this.setField('ezVehicleModel', veh.model || '');
        this.setField('ezVehicleUse', veh.use || '');
        this.setField('ezAnnualMiles', veh.miles || '');
        this.setField('ezOwnershipType', veh.ownership || '');

        // Home Dwelling
        this.setField('ezDwellingUsage', d.dwellingUsage || '');
        this.setField('ezOccupancyType', d.occupancyType || '');
        this.setField('ezDwellingType', d.dwellingType || '');
        this.setField('ezNumStories', d.numStories || '');
        this.setField('ezConstructionStyle', d.constructionStyle || '');
        this.setField('ezExteriorWalls', d.exteriorWalls || '');
        this.setField('ezFoundationType', d.foundation || '');
        this.setField('ezRoofType', d.roofType || '');
        this.setField('ezRoofDesign', d.roofShape || '');
        this.setField('ezRoofYear', d.roofYr || '');
        this.setField('ezHeatingType', d.heatingType || '');
        this.setField('ezCooling', d.cooling || '');
        this.setField('ezBurglarAlarm', d.burglarAlarm || '');
        this.setField('ezFireDetection', d.fireAlarm || '');
        this.setField('ezSprinklerSystem', d.sprinklers || '');
        this.setField('ezProtectionClass', d.protectionClass || '');
        this.setField('ezSqFt', d.sqFt || '');
        this.setField('ezYearBuilt', d.yrBuilt || '');
        this.setField('ezLotSize', d.lotSize || '');
        this.setField('ezBedrooms', d.bedrooms || '');
        this.setField('ezSmokeDetector', d.smokeDetector || '');
        this.setField('ezFeetFromHydrant', d.fireHydrantFeet || '');
        this.setField('ezNumFullBaths', d.fullBaths || '');
        this.setField('ezNumHalfBaths', d.halfBaths || '');
        this.setField('ezNumOccupants', d.numOccupants || '');
        this.setField('ezGarageType', d.garageType || '');
        this.setField('ezGarageSpaces', d.garageSpaces || '');
        this.setField('ezNumFireplaces', d.numFireplaces || '');
        this.setField('ezPool', d.pool || '');
        this.setField('ezTrampoline', d.trampoline || '');

        // Home Coverage (from home prior insurance fields)
        this.setField('ezHomePolicyType', d.homePolicyType || '');
        this.setField('ezHomePriorCarrier', d.homePriorCarrier || '');
        this.setField('ezHomePriorPolicyTerm', d.homePriorPolicyTerm || '');
        this.setField('ezHomePriorYears', d.homePriorYears || '');
        this.setField('ezHomePriorExp', fmtDate(d.homePriorExp));
        this.setField('ezDwellingCoverage', d.dwellingCoverage || '');
        this.setField('ezHomePersonalLiability', d.personalLiability || '');
        this.setField('ezHomeMedicalPayments', d.medicalPayments || '');
        this.setField('ezAllPerilsDeductible', d.homeDeductible || '');
        this.setField('ezTheftDeductible', d.theftDeductible || '');
        this.setField('ezWindDeductible', d.windDeductible || '');
        this.setField('ezMortgagee', d.mortgagee || '');

        // Count populated fields & auto-expand sections with data
        let filled = 0;
        this.formFields.forEach(id => {
            if (document.getElementById(id)?.value) filled++;
        });
        // Load incidents from App.data if present (from AI scan or manual entry)
        if (Array.isArray(d.incidents) && d.incidents.length > 0) {
            this.incidents = d.incidents.map(i => ({
                id: Date.now() + Math.random(),
                type: i.type || 'violation',
                subtype: i.subtype || '',
                date: i.date || '',
                description: i.description || '',
                amount: i.amount || ''
            }));
            this._saveIncidents();
            this.renderIncidents();
            this._syncIncidentCounts();
        }

        if (d.policyTerm || d.priorCarrier || d.liabilityLimits)
            document.getElementById('ezAutoSection')?.setAttribute('open', '');
        if (veh.vin || veh.year || drv.dlNum)
            document.getElementById('ezDriverSection')?.setAttribute('open', '');
        if (d.dwellingUsage || d.constructionStyle || d.roofType)
            document.getElementById('ezHomeSection')?.setAttribute('open', '');
        if (d.homePolicyType || d.dwellingCoverage || d.personalLiability || d.homePriorCarrier)
            document.getElementById('ezHomeCovSection')?.setAttribute('open', '');
        if (this.incidents.length > 0)
            document.getElementById('ezIncidentsSection')?.setAttribute('open', '');

        const extraEl = document.getElementById('ezExtraLoaded');
        if (extraEl && filled > 16) {
            extraEl.style.display = 'block';
            document.getElementById('ezExtraCount').textContent = filled - 16;
        }
        this.saveFormData();
        this.renderDriverVehicleSummary();
        const clientName = [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unknown';
        const lineType = (d.qType || 'quote').toUpperCase();
        this._updateClientBanner(clientName, `${filled} fields loaded \u2022 ${lineType}`);
        App.toast('\ud83d\udce5 Loaded ' + filled + ' fields from intake form');
    },

    renderDriverVehicleSummary() {
        const wrapper = document.getElementById('ezDVSummary');
        const content = document.getElementById('ezDVSummaryContent');
        if (!wrapper || !content) return;

        const drivers = (typeof App !== 'undefined' && Array.isArray(App.drivers)) ? App.drivers : [];
        const vehicles = (typeof App !== 'undefined' && Array.isArray(App.vehicles)) ? App.vehicles : [];

        // Only show additional drivers (index > 0) and additional vehicles (index > 0)
        const extraDrivers = drivers.slice(1);
        const extraVehicles = vehicles.slice(1);
        const coApplicant = drivers.find(d => d.isCoApplicant);

        if (!extraDrivers.length && !extraVehicles.length && !coApplicant) {
            wrapper.style.display = 'none';
            return;
        }

        let html = '';

        // Co-applicant badge
        if (coApplicant) {
            const name = [coApplicant.firstName, coApplicant.lastName].filter(Boolean).join(' ') || 'Unnamed';
            html += `<div class="ez-dv-card ez-dv-coapplicant">
                <div class="ez-dv-badge">Co-Applicant</div>
                <strong>${this._escHTML(name)}</strong>`;
            if (coApplicant.dob) html += ` <span class="ez-dv-detail">DOB: ${this._escHTML(coApplicant.dob)}</span>`;
            if (coApplicant.relationship) html += ` <span class="ez-dv-detail">${this._escHTML(coApplicant.relationship)}</span>`;
            html += `</div>`;
        }

        // Additional drivers
        if (extraDrivers.length) {
            html += `<div class="ez-dv-group-label">\uD83D\uDE97 Additional Drivers (${extraDrivers.length})</div>`;
            extraDrivers.forEach((drv, i) => {
                const name = [drv.firstName, drv.lastName].filter(Boolean).join(' ') || `Driver ${i + 2}`;
                const details = [
                    drv.dob ? `DOB: ${drv.dob}` : '',
                    drv.relationship || '',
                    drv.dlState ? `DL: ${drv.dlState}` : '',
                    drv.gender === 'M' ? 'Male' : drv.gender === 'F' ? 'Female' : ''
                ].filter(Boolean).join(' \u2022 ');
                html += `<div class="ez-dv-card">
                    <strong>${this._escHTML(name)}</strong>${drv.isCoApplicant ? ' <span class="ez-dv-badge">Co-App</span>' : ''}
                    ${details ? `<div class="ez-dv-detail">${this._escHTML(details)}</div>` : ''}
                </div>`;
            });
        }

        // Additional vehicles
        if (extraVehicles.length) {
            html += `<div class="ez-dv-group-label">\uD83D\uDE9A Additional Vehicles (${extraVehicles.length})</div>`;
            extraVehicles.forEach((veh, i) => {
                const label = [veh.year, veh.make, veh.model].filter(Boolean).join(' ') || `Vehicle ${i + 2}`;
                const details = [
                    veh.vin ? `VIN: ${veh.vin}` : '',
                    veh.use || '',
                    veh.miles ? `${veh.miles} mi/yr` : '',
                    veh.ownership || ''
                ].filter(Boolean).join(' \u2022 ');
                html += `<div class="ez-dv-card">
                    <strong>${this._escHTML(label)}</strong>
                    ${details ? `<div class="ez-dv-detail">${this._escHTML(details)}</div>` : ''}
                </div>`;
            });
        }

        content.innerHTML = html;
        wrapper.style.display = 'block';
    },

    clearForm() {
        this.formFields.forEach(id => this.setField(id, ''));
        this.incidents = [];
        this._saveIncidents();
        this.renderIncidents();
        const dvWrapper = document.getElementById('ezDVSummary');
        if (dvWrapper) dvWrapper.style.display = 'none';
        try { localStorage.removeItem(this.formStorageKey); } catch (e) { /* ignore */ }
        this._updateClientBanner('', 'Tap "Select Client" to load from saved intake data');
        App.toast('🗑 Form cleared');
    },

    // ── Send to Chrome Extension ──
    async copyForExtension() {
        try {
            const clientData = this.getFormData();
            const fieldCount = Object.values(clientData).filter(v => v && String(v).trim()).length;

            if (fieldCount === 0) {
                App.toast('⚠️ No data to send — fill the form first');
                return;
            }

            const btn = document.getElementById('ezSendToExtBtn');
            const origText = btn ? btn.textContent : '';
            if (btn) { btn.textContent = '⏳ Sending...'; btn.disabled = true; }

            const clientName = [clientData.FirstName, clientData.LastName].filter(Boolean).join(' ') || 'client';

            // Always try bridge (direct to extension storage) — fire and forget
            const extensionDetected = document.documentElement.hasAttribute('data-altech-extension');
            let bridgeOk = false;
            if (extensionDetected) {
                try {
                    await this._sendViaBridge(clientData);
                    bridgeOk = true;
                } catch (e) {
                    console.warn('[EZLynx] Bridge send failed:', e.message);
                }
            }

            // Also always copy to clipboard as backup
            await this._clipboardCopy(clientData);

            if (bridgeOk) {
                App.toast(`✅ Sent ${fieldCount} fields for ${clientName} — go to EZLynx and click Fill`);
            } else if (extensionDetected) {
                App.toast(`📋 Copied ${fieldCount} fields — open extension popup and paste`);
            } else {
                App.toast(`📋 Copied ${fieldCount} fields — install the extension, then paste`);
            }

            if (btn) { btn.textContent = bridgeOk ? '✅ Sent!' : '📋 Copied!'; setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000); }
        } catch (err) {
            console.error('[EZLynx] copyForExtension error:', err);
            App.toast('❌ Failed to send: ' + (err.message || 'unknown error'));
            const btn = document.getElementById('ezSendToExtBtn');
            if (btn) { btn.disabled = false; btn.textContent = '📤 Send to Extension'; }
        }
    },

    _sendViaBridge(clientData) {
        return new Promise((resolve, reject) => {
            const handler = (event) => {
                if (!event.data || event.data.type !== 'ALTECH_EXTENSION_ACK') return;
                window.removeEventListener('message', handler);
                clearTimeout(timeout);
                event.data.success ? resolve() : reject(new Error(event.data.error || 'Bridge error'));
            };
            window.addEventListener('message', handler);
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('Bridge timeout — extension may not be responding'));
            }, 2000);
            window.postMessage({ type: 'ALTECH_CLIENT_DATA', clientData }, '*');
        });
    },

    async _clipboardCopy(clientData) {
        const payload = JSON.stringify({ _altech_extension: true, clientData, timestamp: new Date().toISOString(), source: 'altech-ezlynx-tool' }, null, 2);
        try {
            await navigator.clipboard.writeText(payload);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = payload;
            ta.style.cssText = 'position:fixed;top:-9999px;';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
    },

    _restoreClientBanner() {
        // If form has saved data, update the banner to show loaded client
        try {
            const raw = localStorage.getItem(this.formStorageKey);
            if (!raw) return;
            const data = JSON.parse(raw);
            const name = [data.ezFirstName, data.ezLastName].filter(Boolean).join(' ');
            if (name) {
                const fieldCount = Object.values(data).filter(v => v && String(v).trim()).length;
                this._updateClientBanner(name, `${fieldCount} fields saved`);
            }
        } catch (e) { /* corrupt */ }
    },

    // ═══════════════════════════════════════════════════════════
    // ── Incidents (Violations, Accidents, Claims) ──
    // ═══════════════════════════════════════════════════════════
    incidentsKey: 'altech_ezlynx_incidents',
    incidents: [],

    _loadIncidents() {
        try {
            const raw = localStorage.getItem(this.incidentsKey);
            this.incidents = raw ? JSON.parse(raw) : [];
        } catch (e) { this.incidents = []; }
    },

    _saveIncidents() {
        try {
            localStorage.setItem(this.incidentsKey, JSON.stringify(this.incidents));
        } catch (e) { /* quota */ }
        this._updateIncidentCount();
    },

    _updateIncidentCount() {
        const el = document.getElementById('ezIncidentCount');
        if (el) el.textContent = this.incidents.length > 0 ? `(${this.incidents.length})` : '';
    },

    addIncident(type) {
        this.incidents.push({
            id: Date.now(),
            type: type || 'violation', // violation | accident | claim
            subtype: '',  // e.g. "Speeding", "At-Fault", "Comprehensive"
            date: '',
            description: '',
            amount: ''    // For claims only
        });
        this._saveIncidents();
        this.renderIncidents();
        document.getElementById('ezIncidentsSection')?.setAttribute('open', '');
    },

    removeIncident(id) {
        this.incidents = this.incidents.filter(i => i.id !== id);
        this._saveIncidents();
        this.renderIncidents();
        // Auto-update the accident/violation counts based on remaining incidents
        this._syncIncidentCounts();
    },

    _syncIncidentCounts() {
        const accCount = this.incidents.filter(i => i.type === 'accident').length;
        const violCount = this.incidents.filter(i => i.type === 'violation').length;
        const accEl = document.getElementById('ezAccidents');
        const violEl = document.getElementById('ezViolations');
        if (accEl && (accEl.value === '' || !isNaN(parseInt(accEl.value)))) {
            accEl.value = String(accCount);
        }
        if (violEl && (violEl.value === '' || !isNaN(parseInt(violEl.value)))) {
            violEl.value = String(violCount);
        }
    },

    updateIncident(id, field, value) {
        const incident = this.incidents.find(i => i.id === id);
        if (incident) {
            incident[field] = value;
            this._saveIncidents();
        }
    },

    renderIncidents() {
        const container = document.getElementById('ezIncidentList');
        if (!container) return;

        if (this.incidents.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:12px; font-size:12px; color:#64748b; opacity:0.7;">No incidents — client has a clean record ✨</div>';
            return;
        }

        const typeEmoji = { violation: '🚦', accident: '💥', claim: '📋' };
        const typeLabel = { violation: 'Violation', accident: 'Accident', claim: 'Claim' };
        const subtypeOptions = {
            violation: ['Speeding', 'Running Red Light', 'Running Stop Sign', 'Careless Driving', 'Reckless Driving', 'DUI/DWI', 'Driving Without License', 'Failure to Yield', 'Improper Lane Change', 'Cell Phone/Texting', 'Suspended License', 'No Insurance', 'Other'],
            accident: ['At-Fault', 'Not-At-Fault', 'At-Fault with Injury', 'Not-At-Fault with Injury', 'Hit and Run', 'Single Vehicle', 'Other'],
            claim: ['Comprehensive', 'Collision', 'Bodily Injury', 'Property Damage', 'Uninsured Motorist', 'Medical Payments', 'Glass', 'Towing', 'Rental', 'Other']
        };

        let html = '';
        this.incidents.forEach((inc, idx) => {
            const emoji = typeEmoji[inc.type] || '⚠️';
            const label = typeLabel[inc.type] || inc.type;
            const opts = subtypeOptions[inc.type] || [];
            const optionsHtml = opts.map(o =>
                `<option value="${this._escHTML(o)}" ${inc.subtype === o ? 'selected' : ''}>${this._escHTML(o)}</option>`
            ).join('');
            const showAmount = inc.type === 'claim';

            html += `<div class="ez-incident-card" style="background:var(--bg-input, #2C2C2E); border:1px solid var(--border, #38383A); border-radius:10px; padding:10px 12px; margin-bottom:8px; position:relative;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <span style="font-size:13px; font-weight:600;">${emoji} ${label} #${idx + 1}</span>
                    <button onclick="EZLynxTool.removeIncident(${inc.id})" style="background:none; border:none; color:#FF453A; font-size:16px; cursor:pointer; padding:2px 6px;" title="Remove">✕</button>
                </div>
                <div class="ez-form-grid">
                    <div class="ez-form-field">
                        <label>Type</label>
                        <select onchange="EZLynxTool.updateIncident(${inc.id},'subtype',this.value)">
                            <option value="">— Select —</option>
                            ${optionsHtml}
                        </select>
                    </div>
                    <div class="ez-form-field">
                        <label>Date</label>
                        <input type="text" placeholder="MM/DD/YYYY" value="${this._escHTML(inc.date)}" onchange="EZLynxTool.updateIncident(${inc.id},'date',this.value)">
                    </div>
                    ${showAmount ? `<div class="ez-form-field">
                        <label>Amount ($)</label>
                        <input type="text" placeholder="5000" value="${this._escHTML(inc.amount)}" onchange="EZLynxTool.updateIncident(${inc.id},'amount',this.value)">
                    </div>` : ''}
                    <div class="ez-form-field ${showAmount ? '' : 'ez-form-full'}">
                        <label>Description</label>
                        <input type="text" placeholder="Brief description (optional)" value="${this._escHTML(inc.description)}" onchange="EZLynxTool.updateIncident(${inc.id},'description',this.value)">
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }
};

window.EZLynxTool = EZLynxTool;
