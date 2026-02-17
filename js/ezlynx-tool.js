// EZLynxTool - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

const EZLynxTool = {
    initialized: false,
    schemaCollapsed: false,

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.checkSchema();
        this.loadLogin();
        this.loadFormData();
        this._wireAutoSave();
    },

    // ── Quick Login ──
    loginStorageKey: 'altech_ezlynx_login',
    formStorageKey: 'altech_ezlynx_formdata',

    saveLogin() {
        const u = document.getElementById('ezLoginUser');
        const p = document.getElementById('ezLoginPass');
        try {
            localStorage.setItem(this.loginStorageKey, JSON.stringify({
                user: u ? u.value : '',
                pass: p ? p.value : ''
            }));
        } catch (e) { /* quota */ }
    },

    // Hardcoded defaults — always restored even after cache clear
    _defaultLogin: { user: 'austinkays', pass: 'PLT5PtX&Yh2dyUzW&%Un^6' },

    loadLogin() {
        const u = document.getElementById('ezLoginUser');
        const p = document.getElementById('ezLoginPass');
        // Try localStorage first, fall back to hardcoded defaults
        try {
            const raw = localStorage.getItem(this.loginStorageKey);
            if (raw) {
                const d = JSON.parse(raw);
                if (u && d.user) u.value = d.user;
                if (p && d.pass) p.value = d.pass;
                return;
            }
        } catch (e) { /* corrupt */ }
        // Fallback: hardcoded defaults
        if (u) u.value = this._defaultLogin.user;
        if (p) p.value = this._defaultLogin.pass;
    },

    toggleLoginPw() {
        const f = document.getElementById('ezLoginPass');
        const b = document.getElementById('ezLoginPwToggle');
        if (!f) return;
        const show = f.type === 'password';
        f.type = show ? 'text' : 'password';
        if (b) b.textContent = show ? '🙈' : '👁';
    },

    copyPassword() {
        const f = document.getElementById('ezLoginPass');
        const pw = f ? f.value : '';
        if (!pw) { App.toast('⚠️ No password saved'); return; }
        navigator.clipboard.writeText(pw).then(() => {
            const btn = document.getElementById('ezCopyPwBtn');
            if (btn) {
                btn.textContent = '✅ Copied!';
                setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
            }
            App.toast('📋 Password copied to clipboard');
        }).catch(() => App.toast('❌ Clipboard access denied'));
    },

    // ── Schema collapse/expand ──
    toggleSchema() {
        const card = document.getElementById('ezSchemaCard');
        if (!card) return;
        // <details> element: toggle its open attribute
        if (card.tagName === 'DETAILS') {
            card.open = !card.open;
            this.schemaCollapsed = !card.open;
        } else {
            // Legacy fallback
            this.schemaCollapsed = !this.schemaCollapsed;
            const body = document.getElementById('ezSchemaBody');
            const chevron = document.getElementById('ezSchemaChevron');
            if (body) body.style.display = this.schemaCollapsed ? 'none' : '';
            if (chevron) chevron.textContent = this.schemaCollapsed ? '▶' : '▼';
        }
    },

    collapseSchema() {
        const card = document.getElementById('ezSchemaCard');
        if (card && card.tagName === 'DETAILS') { card.open = false; this.schemaCollapsed = true; }
        else if (!this.schemaCollapsed) this.toggleSchema();
    },

    expandSchema() {
        const card = document.getElementById('ezSchemaCard');
        if (card && card.tagName === 'DETAILS') { card.open = true; this.schemaCollapsed = false; }
        else if (this.schemaCollapsed) this.toggleSchema();
    },

    // ── Schema Status ──
    async checkSchema() {
        const dot = document.getElementById('ezSchemaDot');
        const label = document.getElementById('ezSchemaLabel');
        const sub = document.getElementById('ezSchemaSub');
        const quickInfo = document.getElementById('ezSchemaQuickInfo');
        const pagesDiv = document.getElementById('ezSchemaPages');

        // Helper to render schema data into the UI
        const renderSchema = (data) => {
            dot.className = 'ez-schema-dot found';
            const timeStr = data.lastModified
                ? new Date(data.lastModified).toLocaleDateString() + ' ' + new Date(data.lastModified).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
                : 'unknown';

            const pages = data.pages || {};
            const pageKeys = Object.keys(pages);
            let pageHtml = '';
            if (pageKeys.length > 0) {
                label.textContent = `Schema loaded — ${data.dropdownCount} dropdowns from ${pageKeys.length} page(s)`;
                pageHtml = '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">';
                pageKeys.forEach(pk => {
                    const p = pages[pk];
                    const pLabel = p.label || pk.split('/').pop() || pk;
                    const ddCount = (p.dropdowns || []).length;
                    pageHtml += `<span style="background:var(--bg-secondary, #e9ecef); color:var(--text-primary, #333); padding:3px 10px; border-radius:12px; font-size:11px; font-weight:500;">` +
                        `${pLabel} <span style="opacity:0.6">(${ddCount})</span></span>`;
                });
                pageHtml += '</div>';
                quickInfo.textContent = `${data.dropdownCount} dropdowns, ${pageKeys.length} pages`;
            } else {
                label.textContent = `Schema loaded — ${data.dropdownCount} dropdowns`;
                quickInfo.textContent = `${data.dropdownCount} dropdowns`;
            }
            sub.textContent = `Last updated: ${timeStr}`;
            pagesDiv.innerHTML = pageHtml;
            this.collapseSchema();
        };

        // Try 1: local server endpoint (full metadata)
        try {
            const res = await fetch('/local/ezlynx-schema');
            const data = await res.json();
            if (data.exists) {
                renderSchema(data);
                return;
            }
        } catch (e) {
            // Server not running — try static fallback
        }

        // Try 2: static JSON file (works without local server but needs some HTTP server)
        try {
            const res = await fetch('/ezlynx_schema.json');
            if (res.ok) {
                const raw = await res.json();
                const allKeys = Object.keys(raw).filter(k => !k.startsWith('_'));
                const pages = raw._pages || {};
                renderSchema({
                    exists: true,
                    dropdownCount: allKeys.length,
                    lastModified: null,
                    pages
                });
                return;
            }
        } catch (e) {
            // Static file not accessible either
        }

        // Try 3: Tauri filesystem API (desktop app — no HTTP server needed)
        try {
            if (window.__TAURI__) {
                const { readTextFile, BaseDirectory } = window.__TAURI__.fs || window.__TAURI__.plugin?.fs || {};
                if (readTextFile) {
                    const text = await readTextFile('ezlynx_schema.json', { dir: BaseDirectory.AppData || undefined });
                    const raw = JSON.parse(text);
                    const allKeys = Object.keys(raw).filter(k => !k.startsWith('_'));
                    const pages = raw._pages || {};
                    renderSchema({
                        exists: true,
                        dropdownCount: allKeys.length,
                        lastModified: null,
                        pages
                    });
                    return;
                }
            }
        } catch (e) {
            // Tauri not available or file not found
        }

        // Neither method worked
        dot.className = 'ez-schema-dot missing';
        label.textContent = 'No schema found';
        sub.textContent = 'Run the scraper to capture EZLynx dropdown options, or start the local server (node server.js).';
        quickInfo.textContent = 'Not configured';
        pagesDiv.innerHTML = '';
        this.expandSchema();
    },

    async refreshSchema() {
        // Expand the card so user can see the log
        this.expandSchema();
        const log = document.getElementById('ezSchemaLog');
        log.textContent = '🔄 Launching schema scraper...\nA browser window will open — log in and navigate to the New Applicant form.';
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocal) {
            log.textContent = '⚠️ Schema scraper requires the local desktop app (node server.js).\nUse the Chrome Extension import instead.';
            App.toast('⚠️ Scraper requires local server');
            return;
        }

        try {
            const res = await fetch('/local/ezlynx-schema', { method: 'POST' });
            const data = await res.json();
            if (data.ok) {
                log.textContent = '✅ Scraper launched!\n\n' +
                    '1. Log in to EZLynx in the Chromium window\n' +
                    '2. Navigate to any form page — it auto-scrapes!\n' +
                    '3. Just click through pages — each one saves automatically\n' +
                    '4. Already-scraped pages are skipped (click Scrape to force)\n' +
                    '5. Click "Save & Close" when done\n\n' +
                    'Auto-saves after each page — safe to close anytime.';
                App.toast('🔄 Schema scraper launched — check your taskbar');
                // Poll for schema file to appear/update
                this.pollSchema();
            } else {
                throw new Error(data.error || 'Failed to launch');
            }
        } catch (e) {
            log.textContent = '❌ Error: ' + e.message;
            App.toast('❌ ' + e.message);
        }
    },

    pollSchema() {
        let attempts = 0;
        const timer = setInterval(async () => {
            attempts++;
            await this.checkSchema();
            const dot = document.getElementById('ezSchemaDot');
            if (dot.classList.contains('found') || attempts > 60) {
                clearInterval(timer);
                if (dot.classList.contains('found')) {
                    const log = document.getElementById('ezSchemaLog');
                    log.textContent += '\n\n✅ Schema file detected!';
                }
            }
        }, 5000);
    },

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
        return data;
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
        this.saveFormData();
        App.toast('🧪 Demo data loaded (all sections)');
    },

    loadFromIntake() {
        // Pull from main App.data + drivers[0] + vehicles[0]
        const d = (typeof App !== 'undefined' && App.data) ? App.data : {};
        const drv = (typeof App !== 'undefined' && Array.isArray(App.drivers) && App.drivers[0]) ? App.drivers[0] : {};
        const veh = (typeof App !== 'undefined' && Array.isArray(App.vehicles) && App.vehicles[0]) ? App.vehicles[0] : {};
        // Helper: convert YYYY-MM-DD → MM/DD/YYYY for EZLynx
        const fmtDate = (v) => {
            if (!v) return '';
            const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            return m ? `${m[2]}/${m[3]}/${m[1]}` : v;
        };

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
        this.setField('ezZip', d.addrZip || '');
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
        if (d.policyTerm || d.priorCarrier || d.liabilityLimits)
            document.getElementById('ezAutoSection')?.setAttribute('open', '');
        if (veh.vin || veh.year || drv.dlNum)
            document.getElementById('ezDriverSection')?.setAttribute('open', '');
        if (d.dwellingUsage || d.constructionStyle || d.roofType)
            document.getElementById('ezHomeSection')?.setAttribute('open', '');
        if (d.homePolicyType || d.dwellingCoverage || d.personalLiability || d.homePriorCarrier)
            document.getElementById('ezHomeCovSection')?.setAttribute('open', '');

        const extraEl = document.getElementById('ezExtraLoaded');
        if (extraEl && filled > 16) {
            extraEl.style.display = 'block';
            document.getElementById('ezExtraCount').textContent = filled - 16;
        }
        this.saveFormData();
        App.toast('📥 Loaded ' + filled + ' fields from intake form');
    },

    clearForm() {
        this.formFields.forEach(id => this.setField(id, ''));
        try { localStorage.removeItem(this.formStorageKey); } catch (e) { /* ignore */ }
        App.toast('🗑 Form cleared');
    },

    // ── Launch Filler ──
    async launch() {
        const btn = document.getElementById('ezLaunchBtn');
        const status = document.getElementById('ezFillStatus');
        const clientData = this.getFormData();

        if (!clientData.FirstName && !clientData.LastName) {
            App.toast('⚠️ Enter at least a first or last name');
            return;
        }

        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocal) {
            App.toast('⚠️ EZLynx Auto-Fill requires the local desktop app (node server.js)');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Launching...';
        status.textContent = '🔄 Preparing client data and launching browser...';

        try {
            const res = await fetch('/local/ezlynx-fill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientData })
            });
            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to launch filler');
            }

            status.textContent = '✅ EZLynx filler launched!\n\n' +
                '1. Check your taskbar for the Chromium window\n' +
                '2. Log in to EZLynx manually\n' +
                '3. Navigate to the New Applicant form\n' +
                '4. The script will auto-fill fields automatically\n\n' +
                'The script will auto-fill text fields and fuzzy-match dropdowns.\n' +
                `Filling: ${clientData.FirstName || ''} ${clientData.LastName || ''}`;

            btn.textContent = '⚡ Running...';
            App.toast('⚡ EZLynx filler launched — check your taskbar');

            // Re-enable after a delay (the script runs async)
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = '🚀 Auto-Fill EZLynx';
            }, 10000);

        } catch (err) {
            status.textContent = '❌ Error: ' + err.message;
            App.toast('❌ ' + err.message);
            btn.disabled = false;
            btn.textContent = '🚀 Auto-Fill EZLynx';
        }
    },

    // ── Copy for Chrome Extension ──
    async copyForExtension() {
        const clientData = this.getFormData();
        const fieldCount = Object.values(clientData).filter(v => v && String(v).trim()).length;

        if (fieldCount === 0) {
            App.toast('⚠️ No data to copy — fill the form first');
            return;
        }

        const payload = JSON.stringify({
            _altech_extension: true,
            clientData,
            timestamp: new Date().toISOString(),
            source: 'altech-ezlynx-tool'
        }, null, 2);

        try {
            await navigator.clipboard.writeText(payload);
            App.toast(`📤 Copied ${fieldCount} fields for ${clientData.FirstName || ''} ${clientData.LastName || ''} — paste in the Chrome extension`);
        } catch (e) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = payload;
            ta.style.cssText = 'position:fixed;top:-9999px;';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            App.toast(`📤 Copied ${fieldCount} fields — paste in the Chrome extension`);
        }
    },

    // ── Import scraped schema from Chrome Extension (file picker → auto-save) ──
    async importScrapedSchema() {
        try {
            // Create a hidden file input to pick JSON files
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json,application/json';
            fileInput.multiple = true;
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);

            const files = await new Promise((resolve) => {
                fileInput.addEventListener('change', () => {
                    resolve(Array.from(fileInput.files));
                    document.body.removeChild(fileInput);
                });
                fileInput.addEventListener('cancel', () => {
                    resolve([]);
                    document.body.removeChild(fileInput);
                });
                fileInput.click();
            });

            if (!files || files.length === 0) {
                App.toast('ℹ️ No file selected.');
                return;
            }

            // Load existing schema
            let existing = {};
            try {
                const resp = await fetch('/ezlynx_schema.json');
                if (resp.ok) existing = await resp.json();
            } catch (e) { /* no existing schema */ }

            let totalNewFields = 0;
            let totalUpdatedFields = 0;
            let filesProcessed = 0;

            for (const file of files) {
                const text = await file.text();
                let data;
                try { data = JSON.parse(text); } catch (e) {
                    App.toast(`⚠️ ${file.name} is not valid JSON — skipped.`);
                    continue;
                }

                // Accept full scrape export ({schema:{...}}) or raw schema object
                const schema = data?.schema || data;
                if (!schema || typeof schema !== 'object') {
                    App.toast(`⚠️ ${file.name} has invalid format — skipped.`);
                    continue;
                }

                for (const [key, options] of Object.entries(schema)) {
                    if (!Array.isArray(options) || options.length === 0) continue;
                    if (!existing[key]) {
                        existing[key] = options;
                        totalNewFields++;
                    } else {
                        const existingSet = new Set(existing[key].map(o => o.toLowerCase()));
                        let added = 0;
                        for (const opt of options) {
                            if (!existingSet.has(opt.toLowerCase())) {
                                existing[key].push(opt);
                                added++;
                            }
                        }
                        if (added > 0) totalUpdatedFields++;
                    }
                }
                filesProcessed++;
            }

            if (filesProcessed === 0) {
                App.toast('⚠️ No valid scrape files were processed.');
                return;
            }

            const mergedJSON = JSON.stringify(existing, null, 2);

            // Try to save directly to ezlynx_schema.json via local server
            let saved = false;
            try {
                const saveResp = await fetch('/local/ezlynx-schema-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: mergedJSON
                });
                if (saveResp.ok) saved = true;
            } catch (e) { /* server not running */ }

            // Fallback: Tauri filesystem
            if (!saved && window.__TAURI__) {
                try {
                    const { writeTextFile, BaseDirectory } = window.__TAURI__.fs || window.__TAURI__.plugin?.fs || {};
                    if (writeTextFile) {
                        await writeTextFile('ezlynx_schema.json', mergedJSON, { dir: BaseDirectory.AppData || undefined });
                        saved = true;
                    }
                } catch (e) { /* Tauri not available */ }
            }

            if (saved) {
                App.toast(`✅ Schema updated: ${totalNewFields} new fields, ${totalUpdatedFields} updated from ${filesProcessed} file(s).`);
                // Refresh the schema status card so user sees the new data
                this.checkSchema();
            } else {
                // Last resort: download merged file (no server or Tauri available)
                const blob = new Blob([mergedJSON], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'ezlynx_schema.json';
                a.click();
                URL.revokeObjectURL(url);
                App.toast(`✅ Merged ${filesProcessed} file(s): ${totalNewFields} new, ${totalUpdatedFields} updated — file downloaded. Replace ezlynx_schema.json in project root.`);
            }
        } catch (err) {
            App.toast('⚠️ ' + err.message);
        }
    }
};

window.EZLynxTool = EZLynxTool;
