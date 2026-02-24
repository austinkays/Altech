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
        this._initEzOccupationDropdown();
        this._restoreClientBanner();
        this._detectExtension();
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

        // ── Pass-through fields from App.data not in the EZ form ──
        const appData = (typeof App !== 'undefined' && App.data) ? App.data : {};

        // Personal extras
        if (appData.prefix) data.Prefix = appData.prefix;
        if (appData.suffix) data.Suffix = appData.suffix;

        // Auto policy extras
        if (appData.autoPolicyType) data.AutoPolicyType = appData.autoPolicyType;
        if (appData.umpdLimit) data.UMPD_PD = appData.umpdLimit;
        if (appData.uimLimits) data.UIM = appData.uimLimits;
        if (appData.rentalDeductible) data.RentalReimbursement = appData.rentalDeductible;
        if (appData.towingDeductible) data.TowingLabor = appData.towingDeductible;
        if (appData.studentGPA) data.StudentGPA = appData.studentGPA;
        if (appData.priorExp) data.PriorExpiration = this._fmtDateForEZ(appData.priorExp);

        // Home property extras
        if (appData.purchaseDate) data.PurchaseDate = this._fmtDateForEZ(appData.purchaseDate);
        if (appData.secondaryHeating) data.SecondaryHeating = appData.secondaryHeating;
        if (appData.kitchenQuality) data.KitchenQuality = appData.kitchenQuality;
        if (appData.sewer) data.Sewer = appData.sewer;
        if (appData.waterSource) data.WaterSource = appData.waterSource;
        if (appData.flooring) data.Flooring = appData.flooring;
        if (appData.fireStationDist) data.FireStationDist = appData.fireStationDist;
        if (appData.tidalWaterDist) data.TidalWaterDist = appData.tidalWaterDist;
        if (appData.heatYr) data.HeatingUpdateYear = appData.heatYr;
        if (appData.plumbYr) data.PlumbingUpdateYear = appData.plumbYr;
        if (appData.elecYr) data.ElectricalUpdateYear = appData.elecYr;
        if (appData.roofUpdate) data.RoofUpdateYear = appData.roofUpdate;

        // Home hazards / toggles (extension uses Yes/No toggles for these)
        if (appData.woodStove && appData.woodStove !== 'No') data.WoodStove = appData.woodStove;
        if (appData.dogInfo) data.DogOnPremises = 'Yes';
        if (appData.businessOnProperty) data.BusinessOnPremises = 'Yes';

        // Home coverage endorsements
        if (appData.increasedReplacementCost) data.IncreasedReplacementCost = appData.increasedReplacementCost;
        if (appData.ordinanceOrLaw) data.OrdinanceOrLaw = appData.ordinanceOrLaw;
        if (appData.waterBackup) data.WaterBackup = appData.waterBackup;
        if (appData.lossAssessment) data.LossAssessment = appData.lossAssessment;
        if (appData.animalLiability) data.AnimalLiability = appData.animalLiability;
        if (appData.jewelryLimit) data.JewelryLimit = appData.jewelryLimit;
        if (appData.creditCardCoverage) data.CreditCardCoverage = appData.creditCardCoverage;
        if (appData.moldDamage) data.MoldDamage = appData.moldDamage;
        if (appData.equipmentBreakdown === 'Yes') data.EquipmentBreakdown = 'Yes';
        if (appData.serviceLine === 'Yes') data.ServiceLine = 'Yes';
        if (appData.earthquakeCoverage === 'Yes') {
            data.EarthquakeCoverage = 'Yes';
            if (appData.earthquakeZone) data.EarthquakeZone = appData.earthquakeZone;
            if (appData.earthquakeDeductible) data.EarthquakeDeductible = appData.earthquakeDeductible;
        }

        // Prior insurance extras
        if (appData.homePriorLiability) data.HomePriorLiability = appData.homePriorLiability;

        // Contact preferences
        if (appData.contactTime) data.ContactTime = appData.contactTime;
        if (appData.contactMethod) data.ContactMethod = appData.contactMethod;
        if (appData.referralSource) data.LeadSource = appData.referralSource;

        // Additional info
        if (appData.additionalInsureds) data.AdditionalInsureds = appData.additionalInsureds;

        // Append multi-driver array from App.drivers
        if (typeof App !== 'undefined' && Array.isArray(App.drivers) && App.drivers.length > 0) {
            data.Drivers = App.drivers.map(d => ({
                FirstName: d.firstName || '',
                LastName: d.lastName || '',
                DOB: d.dob ? this._fmtDateForEZ(d.dob) : '',
                Gender: d.gender === 'M' ? 'Male' : d.gender === 'F' ? 'Female' : (d.gender || ''),
                MaritalStatus: d.maritalStatus || '',
                Relationship: d.relationship || '',
                Occupation: d.occupation || '',
                Education: d.education || '',
                LicenseNumber: d.dlNum || '',
                DLState: d.dlState || '',
                AgeLicensed: d.ageLicensed || '',
                LicenseStatus: d.dlStatus || '',
                SR22: d.sr22 || '',
                FR44: d.fr44 || '',
                GoodDriver: d.goodDriver || '',
                MatureDriver: d.matureDriver || '',
                DriverEducation: d.driverEducation || '',
                LicenseSusRev: d.licenseSusRev || '',
                IsCoApplicant: d.isCoApplicant || false
            }));

            // Build top-level CoApplicant object for extension co-app injection
            const coAppDriver = data.Drivers.find(d => d.IsCoApplicant);
            if (coAppDriver) {
                data.CoApplicant = {
                    FirstName: coAppDriver.FirstName,
                    LastName: coAppDriver.LastName,
                    DOB: coAppDriver.DOB,
                    Gender: coAppDriver.Gender,
                    MaritalStatus: coAppDriver.MaritalStatus,
                    Relationship: coAppDriver.Relationship,
                    Email: appData.coEmail || '',
                    Phone: appData.coPhone || '',
                    Suffix: appData.suffix || '',
                    SSN: '',
                };
            }
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
                Ownership: v.ownershipType || '',
                Performance: v.performance || '',
                AntiTheft: v.antiTheft || '',
                PassiveRestraints: v.passiveRestraints || '',
                AntiLockBrakes: v.antiLockBrakes || '',
                DaytimeRunningLights: v.daytimeRunningLights || '',
                NewVehicle: v.carNew || '',
                Telematics: v.telematics || '',
                CarPool: v.carPool || '',
                TNC: v.tnc || '',
                PrimaryDriver: v.primaryDriver || '',
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
        // Set Industry BEFORE Occupation so dynamic dropdown populates
        this.setField('ezIndustry', 'Insurance');
        const demoIndustrySel = document.getElementById('ezIndustry');
        if (demoIndustrySel) demoIndustrySel.dispatchEvent(new Event('change'));
        this.setField('ezOccupation', 'Agent/Broker');
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
        this.setField('ezUMPD', '100000');
        this.setField('ezPriorLiabilityLimits', '50/100');
        this.setField('ezYearsContinuousCoverage', '5');
        this.setField('ezNumResidents', '2');
        this.setField('ezResidenceIs', 'Home (owned)');
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
        // Set Industry BEFORE Occupation so the dynamic dropdown populates
        this.setField('ezIndustry', d.industry || '');
        // Trigger change event so _initEzOccupationDropdown repopulates options
        const industrySel = document.getElementById('ezIndustry');
        if (industrySel) industrySel.dispatchEvent(new Event('change'));
        this.setField('ezOccupation', d.occupation || '');
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
        this.setField('ezUMPD', d.umpdLimit || '');
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
        this.setField('ezOwnershipType', veh.ownershipType || '');

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
            // Include isAdmin flag — bridge stores it for popup to auto-unlock admin tools
            const isAdmin = typeof Auth !== 'undefined' && Auth.isAdmin === true;
            window.postMessage({ type: 'ALTECH_CLIENT_DATA', clientData, isAdmin }, '*');
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
    },

    // ── Extension Detection ──
    _detectExtension() {
        const isConnected = document.documentElement.hasAttribute('data-altech-extension');
        // Also check if user previously confirmed installation
        const userConfirmed = localStorage.getItem('altech_ezlynx_ext_confirmed') === 'true';
        this._updateExtensionUI(isConnected || userConfirmed, isConnected);
    },

    _updateExtensionUI(installed, liveDetected) {
        const connectedEl = document.getElementById('ezStatusConnected');
        const notConnectedEl = document.getElementById('ezStatusNotConnected');
        const detailsEl = document.getElementById('ezInstallDetails');
        const statusBar = document.getElementById('ezStatusBar');

        if (!statusBar) return;

        if (installed) {
            // Show connected banner, completely hide install guide
            if (connectedEl) connectedEl.style.display = 'flex';
            if (notConnectedEl) notConnectedEl.style.display = 'none';
            if (detailsEl) detailsEl.style.display = 'none';
            statusBar.classList.add('connected');
            statusBar.classList.remove('not-connected');
        } else {
            // Show not-connected state, show install guide
            if (connectedEl) connectedEl.style.display = 'none';
            if (notConnectedEl) notConnectedEl.style.display = 'flex';
            if (detailsEl) detailsEl.style.display = 'block';
            statusBar.classList.remove('connected');
            statusBar.classList.add('not-connected');
        }
    },

    confirmExtensionInstalled() {
        // Re-check live detection
        const liveDetected = document.documentElement.hasAttribute('data-altech-extension');
        if (liveDetected) {
            localStorage.setItem('altech_ezlynx_ext_confirmed', 'true');
            this._updateExtensionUI(true, true);
            App.toast('✅ Extension connected! You\'re all set.');
        } else {
            // Not detected yet — tell user to refresh
            App.toast('⚠️ Extension not detected — try refreshing the page after installing');
        }
    },

    // ── Dynamic EZ Occupation Dropdown ──
    _initEzOccupationDropdown() {
        const industrySel = document.getElementById('ezIndustry');
        const occupationSel = document.getElementById('ezOccupation');
        if (!industrySel || !occupationSel) return;

        // Reuse the occupation mapping from App (if available) or use a local copy
        const getOccupations = (industry) => {
            if (typeof App !== 'undefined' && App._OCCUPATIONS_BY_INDUSTRY) {
                return App._OCCUPATIONS_BY_INDUSTRY[industry] || [];
            }
            return [];
        };

        const populate = () => {
            const industry = industrySel.value;
            const currentVal = occupationSel.value;
            const titles = getOccupations(industry);
            let html = '<option value="">—</option>';
            titles.forEach(t => {
                const sel = (t === currentVal) ? ' selected' : '';
                html += `<option value="${t}"${sel}>${t}</option>`;
            });
            if (currentVal && !titles.includes(currentVal)) {
                html += `<option value="${currentVal}" selected>${currentVal}</option>`;
            }
            occupationSel.innerHTML = html;
        };

        industrySel.addEventListener('change', populate);
        // Initial population from current form state
        populate();
    }
};

window.EZLynxTool = EZLynxTool;
