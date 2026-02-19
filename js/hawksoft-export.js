/**
 * HawkSoft CMSMTF Export Module
 * ==============================
 * Generates proper HawkSoft 6 .CMSMTF tagged files for client/policy import.
 * Supports multi-select: Auto, Home, and Commercial — each exports its own file.
 *
 * Pre-fills from intake form (App.data, App.drivers, App.vehicles) and
 * lets user edit/add HawkSoft-specific fields before export.
 *
 * CMSMTF format:  key = value  (one per line, Windows CRLF endings)
 */
window.HawkSoftExport = (() => {
    'use strict';

    const SETTINGS_KEY = 'altech_hawksoft_settings';
    let _settings = {};
    let _exportData = {};
    let _selectedTypes = { auto: false, home: false, commercial: false };

    // ── Helpers ──────────────────────────────────────────────
    function _val(v) {
        if (v === null || v === undefined) return '';
        return String(v).trim();
    }

    function _line(key, value) {
        return `${key} = ${_val(value)}`;
    }

    function _loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) _settings = JSON.parse(raw);
        } catch (e) { /* ignore */ }
    }

    function _saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings));
    }

    // Format date to MM/DD/YYYY for HawkSoft
    function _fmtDate(v) {
        if (!v) return '';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[2]}/${m[3]}/${m[1]}`;
        return v;
    }

    // Today's date as MM/DD/YYYY
    function _todayFormatted() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    }

    // Calculate expiration date from effective + term months
    function _calcExpiration(effStr, termMonths) {
        if (!effStr || !termMonths) return '';
        const m = effStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return '';
        const dt = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
        dt.setMonth(dt.getMonth() + parseInt(termMonths));
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        return `${mm}/${dd}/${dt.getFullYear()}`;
    }

    // Format DOB to MM/DD/YY for driver block
    function _fmtDobShort(v) {
        if (!v) return '';
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
        return v;
    }

    // ── Build structured FSC notes ──────────────────────────
    function _buildFscNotes(d) {
        const sections = [];

        // Property Details
        const prop = [];
        if (d.dwellingType) prop.push(`Dwelling Type: ${d.dwellingType}`);
        if (d.dwellingUsage) prop.push(`Usage: ${d.dwellingUsage}`);
        if (d.occupancyType) prop.push(`Occupancy: ${d.occupancyType}`);
        if (d.sqFt) prop.push(`Sq Ft: ${d.sqFt}`);
        if (d.numStories) prop.push(`Stories: ${d.numStories}`);
        if (d.bedrooms) prop.push(`Bedrooms: ${d.bedrooms}`);
        if (d.fullBaths || d.halfBaths) prop.push(`Baths: ${d.fullBaths || 0} full / ${d.halfBaths || 0} half`);
        if (d.constructionStyle) prop.push(`Style: ${d.constructionStyle}`);
        if (d.foundation) prop.push(`Foundation: ${d.foundation}`);
        if (d.roofType) prop.push(`Roof: ${d.roofType}`);
        if (d.roofShape) prop.push(`Roof Shape: ${d.roofShape}`);
        if (d.roofYr) prop.push(`Roof Year: ${d.roofYr}`);
        if (d.heatingType) prop.push(`Heating: ${d.heatingType}`);
        if (d.cooling) prop.push(`Cooling: ${d.cooling}`);
        if (d.heatYr) prop.push(`Heating Updated: ${d.heatYr}`);
        if (d.plumbYr) prop.push(`Plumbing Updated: ${d.plumbYr}`);
        if (d.elecYr) prop.push(`Electrical Updated: ${d.elecYr}`);
        if (d.garageType) prop.push(`Garage: ${d.garageType}${d.garageSpaces ? ' (' + d.garageSpaces + ' spaces)' : ''}`);
        if (d.lotSize) prop.push(`Lot Size: ${d.lotSize}`);
        if (d.pool) prop.push(`Pool: ${d.pool}`);
        if (d.dogInfo) prop.push(`Dogs: ${d.dogInfo}`);
        if (d.trampoline && d.trampoline !== 'No') prop.push(`Trampoline: ${d.trampoline}`);
        if (d.woodStove && d.woodStove !== 'No') prop.push(`Wood Stove: ${d.woodStove}`);
        if (d.businessOnProperty && d.businessOnProperty !== 'No') prop.push(`Business on Property: ${d.businessOnProperty}`);
        if (d.smokeDetector) prop.push(`Smoke Detector: ${d.smokeDetector}`);
        if (d.kitchenQuality) prop.push(`Kitchen Quality: ${d.kitchenQuality}`);
        if (d.purchaseDate) prop.push(`Purchase Date: ${d.purchaseDate}`);
        if (d.yearsAtAddress) prop.push(`Years at Address: ${d.yearsAtAddress}`);
        if (d.numOccupants) prop.push(`Occupants: ${d.numOccupants}`);
        if (d.windDeductible) prop.push(`Wind Deductible: ${d.windDeductible}`);
        if (prop.length) sections.push('PROPERTY\n' + prop.join('\n'));

        // Home Endorsements
        const endorse = [];
        if (d.waterBackup && d.waterBackup !== 'No') endorse.push(`Water Backup: ${d.waterBackup}`);
        if (d.lossAssessment) endorse.push(`Loss Assessment: ${d.lossAssessment}`);
        if (d.animalLiability && d.animalLiability !== 'No') endorse.push(`Animal Liability: ${d.animalLiability}`);
        if (d.equipmentBreakdown && d.equipmentBreakdown !== 'No') endorse.push(`Equipment Breakdown: Yes`);
        if (d.serviceLine && d.serviceLine !== 'No') endorse.push(`Service Line: Yes`);
        if (d.creditCardCoverage) endorse.push(`Credit Card Coverage: ${d.creditCardCoverage}`);
        if (d.moldDamage) endorse.push(`Mold Damage: ${d.moldDamage}`);
        if (d.theftDeductible) endorse.push(`Theft Deductible: ${d.theftDeductible}`);
        if (d.additionalInsureds) endorse.push(`Additional Insureds: ${d.additionalInsureds}`);
        if (endorse.length) sections.push('ENDORSEMENTS\n' + endorse.join('\n'));

        // Insurance History
        const hist = [];
        if (d.priorCarrier) hist.push(`Prior Carrier: ${d.priorCarrier}`);
        if (d.priorYears) hist.push(`Years with Prior: ${d.priorYears}`);
        if (d.priorPolicyTerm) hist.push(`Prior Term: ${d.priorPolicyTerm}`);
        if (d.priorLiabilityLimits) hist.push(`Prior BI Limits: ${d.priorLiabilityLimits}`);
        if (d.priorExp) hist.push(`Prior Expiration: ${_fmtDate(d.priorExp)}`);
        if (d.continuousCoverage) hist.push(`Continuous Coverage: ${d.continuousCoverage}`);
        if (d.homePriorCarrier) hist.push(`Home Prior Carrier: ${d.homePriorCarrier}`);
        if (d.homePriorYears) hist.push(`Home Prior Years: ${d.homePriorYears}`);
        if (hist.length) sections.push('INSURANCE HISTORY\n' + hist.join('\n'));

        // Risk / Other
        const risk = [];
        if (d.accidents) risk.push(`Accidents: ${d.accidents}`);
        if (d.violations) risk.push(`Violations: ${d.violations}`);
        if (d.studentGPA) risk.push(`Student GPA: ${d.studentGPA}`);
        if (d.residenceIs) risk.push(`Residence: ${d.residenceIs}`);
        if (d.contactTime) risk.push(`Best Contact Time: ${d.contactTime}`);
        if (d.contactMethod) risk.push(`Contact Method: ${d.contactMethod}`);
        if (d.tcpaConsent) risk.push(`TCPA Consent: ${d.tcpaConsent}`);
        if (risk.length) sections.push('NOTES\n' + risk.join('\n'));

        return sections.join('\n\n');
    }

    // ── Load from Intake Form ──────────────────────────────
    function _loadFromIntake() {
        const d = (typeof App !== 'undefined' && App.data) ? App.data : {};
        const drivers = (typeof App !== 'undefined' && App.drivers) ? App.drivers : [];
        const vehicles = (typeof App !== 'undefined' && App.vehicles) ? App.vehicles : [];

        // Pre-select types based on intake form
        const qType = d.qType || 'auto';
        if (qType === 'home') {
            _selectedTypes = { auto: false, home: true, commercial: false };
        } else if (qType === 'both') {
            _selectedTypes = { auto: true, home: true, commercial: false };
        } else {
            _selectedTypes = { auto: true, home: false, commercial: false };
        }

        const fscNotes = _buildFscNotes(d);

        // Determine policy form from intake
        let policyForm = '';
        if (d.homePolicyType) policyForm = d.homePolicyType;
        else if (qType === 'auto') policyForm = 'PAP';

        // Determine policy title
        let policyTitle = '';
        if (qType === 'home') policyTitle = 'Homeowners';
        else if (qType === 'auto') policyTitle = 'Personal Auto';
        else if (qType === 'both') policyTitle = 'Home + Auto';

        // Resolve comp/coll deductibles for vehicles
        const globalComp = d.compDeductible || '';
        const globalColl = d.autoDeductible || '';
        const globalTowing = d.towingDeductible && d.towingDeductible !== 'No Coverage' ? 'Yes' : 'No';
        const globalRental = d.rentalDeductible && d.rentalDeductible !== 'No Coverage' ? 'Yes' : 'No';

        _exportData = {
            // Client block
            client: {
                custType: 'Personal',
                lastName: d.lastName || '',
                firstName: d.firstName || '',
                middleInitial: '',
                address1: d.addrStreet || '',
                city: d.addrCity || '',
                state: d.addrState || '',
                zip: d.addrZip || '',
                phone: '',
                cellPhone: d.phone || '',
                workPhone: '',
                email: d.email || '',
                emailWork: '',
                clientSource: d.referralSource || '',
                clientNotes: '',
                clientOffice: _settings.clientOffice || '1',
                dob: d.dob || '',
                gender: d.gender || '',
                education: d.education || '',
                occupation: d.occupation || '',
                industry: d.industry || '',
                prefix: d.prefix || '',
                suffix: d.suffix || '',
                coFirstName: d.coFirstName || '',
                coLastName: d.coLastName || '',
                coDob: d.coDob || '',
                coGender: d.coGender || '',
                coEmail: d.coEmail || '',
                coPhone: d.coPhone || '',
                coRelationship: d.coRelationship || '',
                county: d.county || '',
            },
            // Policy block
            policy: {
                company: '',
                policyNumber: '',
                policyTitle: policyTitle,
                policyForm: policyForm,
                effectiveDate: _fmtDate(d.effectiveDate) || _todayFormatted(),
                expirationDate: '',
                productionDate: _todayFormatted(),
                term: d.policyTerm === '12 Month' ? '12' : d.policyTerm === '6 Month' ? '6' : '',
                totalPremium: '',
                status: 'New',
                clientStatus: 'PROSPECT',
                leadSource: d.referralSource || '',
                producer: _settings.producer || '',
                agencyId: _settings.agencyId || '',
                policyOffice: _settings.policyOffice || '1',
                program: '',
                fscNotes: fscNotes,
                filingFee: '',
                policyFee: '',
                brokerFee: '',
                garagingAddress: d.addrStreet || '',
                garagingCity: d.addrCity || '',
                garagingState: d.addrState || '',
                garagingZip: d.addrZip || '',
                county: d.county || '',
            },
            // Auto-specific
            auto: {
                bi: d.liabilityLimits || '',
                pd: d.pdLimit || '',
                umBi: d.umLimits || '',
                uimBi: d.uimLimits || '',
                umPd: d.umpdLimit || '',
                uimPd: '',
                pip: '',
                pipDeduct: '',
                medical: d.medPayments || '',
                typeOfPolicy: d.autoPolicyType || '',
            },
            // Home-specific
            home: {
                protectionClass: d.protectionClass || '',
                yearBuilt: d.yrBuilt || '',
                construction: d.exteriorWalls || '',
                burgAlarm: d.burglarAlarm || '',
                fireAlarm: d.fireAlarm || '',
                sprinkler: d.sprinklers || '',
                deadbolt: d.deadbolt === 'Yes' || d.deadbolt === true,
                fireExtinguisher: d.fireExtinguisher === 'Yes' || d.fireExtinguisher === true,
                county: d.county || '',
                additionalRes: '',
                covA: d.dwellingCoverage || '',
                covB: '',
                covC: '',
                covD: '',
                contentsReplacement: '',
                homeReplacement: d.increasedReplacementCost === 'Yes' || d.increasedReplacementCost === true,
                liability: d.personalLiability || '',
                medical: d.medicalPayments || '',
                deductible: d.homeDeductible || '',
                earthquake: d.earthquakeCoverage === 'Yes' ? true : false,
                eqDeduct: d.earthquakeDeductible || '',
                eqZone: d.earthquakeZone || '',
                eqMasonryVeneer: false,
                ordinanceLawIncr: d.ordinanceOrLaw || '',
                multiPolicy: false,
                lienholderName: d.mortgagee || '',
                lienholderAddress: '',
                lienholderCity: '',
                lienholderState: '',
                lienholderZip: '',
                lienholderLoanNum: '',
                lienholderType: 'ML',
                jewelry: d.jewelryLimit || '',
                furs: '', guns: '', cameras: '', coins: '',
                stamps: '', silverware: '', fineArt: '',
                golfEquip: '', musicalInst: '', electronics: '',
            },
            // Commercial-specific
            commercial: {
                businessName: '',
                dbaName: '',
                fein: '',
                businessLicense: '',
                naics: '',
                website: '',
                businessType: '',
                lobCode: 'CGL',
                coverages: [
                    { name: 'General Liability', limits: '$1,000,000 / $2,000,000', deductible: '$0' },
                    { name: 'Products / Completed Ops', limits: '$1,000,000', deductible: '$0' },
                ],
            },
            // Drivers
            drivers: drivers.map(drv => ({
                lastName: drv.lastName || '',
                firstName: drv.firstName || '',
                middleInitial: '',
                birthDate: _fmtDobShort(drv.dob) || '',
                points: '',
                licenseState: (drv.dlState || '').toUpperCase(),
                licenseNumber: (drv.dlNum || '').toUpperCase(),
                excluded: 'No',
                principalOperator: 'No',
                onlyOperator: 'No',
                nonDriver: 'No',
                occupation: drv.occupation || '',
                sex: (drv.gender === 'M' || drv.gender === 'Male') ? 'Male' :
                     (drv.gender === 'F' || drv.gender === 'Female') ? 'Female' : '',
                maritalStatus: drv.maritalStatus || '',
                sr22Filing: (drv.sr22 === 'Yes' || drv.sr22 === true || drv.fr44 === 'Yes' || drv.fr44 === true) ? 'Y' : '',
                sr22State: (drv.sr22 === 'Yes' || drv.sr22 === true) ? (drv.dlState || '').toUpperCase() :
                           (drv.fr44 === 'Yes' || drv.fr44 === true) ? (drv.dlState || '').toUpperCase() : '',
                sr22Reason: drv.fr44 === 'Yes' || drv.fr44 === true ? 'FR-44' : '',
                dateLicensed: '',
                hiredDate: '',
                cdlDate: '',
                goodStudent: drv.goodDriver === 'Yes' ? 'Yes' : 'No',
                driverTraining: drv.driverEducation === 'Yes' ? 'Yes' : 'No',
                defensiveDriver: drv.matureDriver === 'Yes' ? 'Yes' : 'No',
                ssn: '',
                relationship: drv.relationship || 'Insured',
            })),
            // Vehicles
            vehicles: vehicles.map((veh) => {
                let assignedDriver = '';
                if (veh.primaryDriver && drivers.length) {
                    const dIdx = drivers.findIndex(dr => dr.id === veh.primaryDriver);
                    if (dIdx >= 0) assignedDriver = String(dIdx);
                }
                return {
                    make: (veh.make || '').toUpperCase(),
                    model: veh.model || '',
                    year: veh.year || '',
                    vin: (veh.vin || '').toUpperCase(),
                    symbol: '', territory: '', addonEquip: '',
                    assignedDriver: assignedDriver,
                    use: veh.use || '',
                    commuteMileage: '',
                    annualMileage: veh.miles || '',
                    gvw: '',
                    towing: globalTowing,
                    rental: globalRental,
                    vehicleType: '',
                    fourWd: 'No',
                    comp: globalComp || 'None',
                    coll: globalColl || 'None',
                    umpd: '', uimpd: '',
                    garagingZip: d.addrZip || '',
                    lossPayee: veh.ownershipType === 'Leased' || veh.ownershipType === 'Lien' ? 'Yes' : 'No',
                    additionalInterest: 'No',
                    lossPayeeName: '', lossPayeeAddress: '', lossPayeeAddr2: '',
                    lossPayeeCity: '', lossPayeeState: '', lossPayeeZip: '',
                };
            }),
        };

        // Fallback driver from insured
        if (_exportData.drivers.length === 0 && (d.firstName || d.lastName)) {
            _exportData.drivers.push({
                lastName: d.lastName || '',
                firstName: d.firstName || '',
                middleInitial: '',
                birthDate: _fmtDobShort(d.dob) || '',
                points: '',
                licenseState: d.addrState || '',
                licenseNumber: '',
                excluded: 'No',
                principalOperator: 'Yes',
                onlyOperator: 'No',
                nonDriver: 'No',
                occupation: d.occupation || '',
                sex: (d.gender === 'M') ? 'Male' : (d.gender === 'F') ? 'Female' : '',
                maritalStatus: d.maritalStatus || '',
                sr22Filing: '', sr22State: '', sr22Reason: '',
                dateLicensed: '', hiredDate: '', cdlDate: '',
                goodStudent: 'No', driverTraining: 'No', defensiveDriver: 'No',
                ssn: '', relationship: 'Insured',
            });
        }
    }

    // ── Generate CMSMTF for a specific policy type ──────────
    function _generateCMSMTF(forType) {
        const lines = [];
        const c = _exportData.client;
        const p = _exportData.policy;
        const isCommercial = forType === 'commercial';
        const includeAuto = forType === 'auto';
        const includeHome = forType === 'home';

        // ── Client Block ──
        lines.push(_line('gen_bBusinessType', isCommercial ? (_exportData.commercial.businessType || 'L') : ''));
        lines.push(_line('gen_sCustType', isCommercial ? 'Commercial' : c.custType));
        lines.push(_line('gen_sBusinessName', isCommercial ? _exportData.commercial.businessName : ''));
        lines.push(_line('gen_sDBAName', isCommercial ? _exportData.commercial.dbaName : ''));
        lines.push(_line('gen_sLastName', c.lastName));
        lines.push(_line('gen_sFirstName', c.firstName));
        lines.push(_line('gen_cInitial', c.middleInitial));
        lines.push(_line('gen_sAddress1', c.address1));
        lines.push(_line('gen_sCity', c.city));
        lines.push(_line('gen_sState', c.state));
        lines.push(_line('gen_sZip', c.zip));
        lines.push(_line('gen_sFEIN', isCommercial ? _exportData.commercial.fein : ''));
        lines.push(_line('gen_sBusinessLicense', isCommercial ? _exportData.commercial.businessLicense : ''));
        lines.push(_line('gen_sClientSource', c.clientSource));
        lines.push(_line('gen_sClientNotes', c.clientNotes));
        lines.push(_line('gen_sNAICS', isCommercial ? _exportData.commercial.naics : ''));
        lines.push(_line('gen_sWebsite', isCommercial ? _exportData.commercial.website : ''));
        lines.push(_line('gen_sPhone', c.phone));
        lines.push(_line('gen_sWorkPhone', c.workPhone));
        lines.push(_line('gen_sFax', ''));
        lines.push(_line('gen_sPager', ''));
        lines.push(_line('gen_sCellPhone', c.cellPhone));
        lines.push(_line('gen_sMsgPhone', ''));
        lines.push(_line('gen_sEmail', c.email));
        lines.push(_line('gen_sEmailWork', c.emailWork));
        lines.push(_line('gen_lClientOffice', c.clientOffice));

        // Client Misc Data Set 1: DOB, prefix, suffix, gender, education, occupation, industry
        const miscData1 = [
            c.dob, c.prefix, c.suffix, c.gender,
            c.education, c.occupation, c.industry,
            '', '', ''
        ];
        for (let i = 0; i < 10; i++) {
            lines.push(_line(`gen_sClientMiscData[${i}]`, miscData1[i] || ''));
        }

        // Client Misc Data Set 2: Co-Applicant
        const miscData2 = [
            c.coFirstName, c.coLastName, c.coDob, c.coGender,
            c.coEmail, c.coPhone, c.coRelationship,
            '', '', ''
        ];
        for (let i = 0; i < 10; i++) {
            lines.push(_line(`gen_sClientMisc2Data[${i}]`, miscData2[i] || ''));
        }

        // Client Misc Data Set 3: unused
        for (let i = 0; i < 10; i++) {
            lines.push(_line(`gen_sClientMisc3Data[${i}]`, ''));
        }

        // ── Policy Meta Block ──
        let policyType, lobCode, applicationType;
        if (isCommercial) {
            policyType = 'ENHANCED';
            lobCode = _exportData.commercial.lobCode || 'CGL';
            applicationType = 'Commercial';
        } else if (includeHome) {
            policyType = 'HOME';
            lobCode = 'HOME';
            applicationType = 'Personal';
        } else {
            policyType = 'AUTO';
            lobCode = 'AUTOP';
            applicationType = 'Personal';
        }

        lines.push(_line('gen_sAgencyID', p.agencyId));
        lines.push(_line('gen_sCMSPolicyType', policyType));
        lines.push(_line('gen_sApplicationType', applicationType));
        lines.push(_line('gen_sCompany', p.company));
        lines.push(_line('gen_lPolicyOffice', p.policyOffice));
        lines.push(_line('gen_sPolicyTitle', p.policyTitle));
        lines.push(_line('gen_sForm', p.policyForm));
        lines.push(_line('gen_sLOBCode', lobCode));
        lines.push(_line('gen_sPolicyNumber', p.policyNumber));
        lines.push(_line('gen_tProductionDate', p.productionDate));
        lines.push(_line('gen_tExpirationDate', p.expirationDate));
        lines.push(_line('gen_tEffectiveDate', p.effectiveDate));
        lines.push(_line('gen_sLeadSource', p.leadSource));
        lines.push(_line('gen_dTotal', p.totalPremium));
        lines.push(_line('gen_nTerm', p.term));
        lines.push(_line('gen_nClientStatus', p.clientStatus));
        lines.push(_line('gen_sStatus', p.status));
        lines.push(_line('gen_sFSCNotes', p.fscNotes));
        lines.push(_line('gen_dFilingFee', p.filingFee));
        lines.push(_line('gen_dPolicyFee', p.policyFee));
        lines.push(_line('gen_dBrokerFee', p.brokerFee));
        lines.push(_line('gen_sProducer', p.producer));
        lines.push(_line('gen_sProgram', p.program));
        lines.push(_line('gen_sGAddress', p.garagingAddress));
        lines.push(_line('gen_sGCity', p.garagingCity));
        lines.push(_line('gen_sGState', p.garagingState));
        lines.push(_line('gen_sGZip', p.garagingZip));
        lines.push(_line('gen_sCounty', p.county));

        // ── Auto-Specific Block ──
        if (includeAuto) {
            const a = _exportData.auto;
            lines.push(_line('gen_sBi', a.bi));
            lines.push(_line('gen_sPd', a.pd));
            lines.push(_line('gen_sUmBi', a.umBi));
            lines.push(_line('gen_sUimBi', a.uimBi));
            lines.push(_line('gen_sUmPd', a.umPd));
            lines.push(_line('gen_sUimPd', a.uimPd));
            lines.push(_line('gen_sPipDeduct', a.pipDeduct));
            lines.push(_line('gen_sPip', a.pip));
            lines.push(_line('gen_sMedical', a.medical));
            lines.push(_line('gen_sTypeOfPolicy', a.typeOfPolicy));

            // Vehicles
            _exportData.vehicles.forEach((v, i) => {
                const idx = `[${i}]`;
                lines.push(_line(`veh_sMake${idx}`, v.make));
                lines.push(_line(`veh_sModel${idx}`, v.model));
                lines.push(_line(`veh_sYr${idx}`, v.year));
                lines.push(_line(`veh_sSymb${idx}`, v.symbol));
                lines.push(_line(`veh_sTerr${idx}`, v.territory));
                lines.push(_line(`veh_lAddonEquip${idx}`, v.addonEquip));
                lines.push(_line(`veh_nDriver${idx}`, v.assignedDriver));
                lines.push(_line(`veh_sUse${idx}`, v.use));
                lines.push(_line(`veh_nCommuteMileage${idx}`, v.commuteMileage));
                lines.push(_line(`veh_lMileage${idx}`, v.annualMileage));
                lines.push(_line(`veh_nGVW${idx}`, v.gvw));
                lines.push(_line(`veh_sTowing${idx}`, v.towing));
                lines.push(_line(`veh_sRentRemb${idx}`, v.rental));
                lines.push(_line(`veh_sVehicleType${idx}`, v.vehicleType));
                lines.push(_line(`veh_bFourWD${idx}`, v.fourWd));
                lines.push(_line(`veh_sComp${idx}`, v.comp));
                lines.push(_line(`veh_sColl${idx}`, v.coll));
                lines.push(_line(`veh_sUmpd${idx}`, v.umpd));
                lines.push(_line(`veh_bUmpd${idx}`, v.umpd ? 'Yes' : 'No'));
                lines.push(_line(`veh_sUimpd${idx}`, v.uimpd));
                lines.push(_line(`veh_bUimpd${idx}`, v.uimpd ? 'Yes' : 'No'));
                lines.push(_line(`veh_sVIN${idx}`, v.vin));
                lines.push(_line(`veh_sGaragingZip${idx}`, v.garagingZip));
                lines.push(_line(`veh_bLossPayee${idx}`, v.lossPayee));
                lines.push(_line(`veh_bAdditionalInterest${idx}`, v.additionalInterest));
                lines.push(_line(`veh_sLossPayeeName${idx}`, v.lossPayeeName));
                lines.push(_line(`veh_sLossPayeeAddress${idx}`, v.lossPayeeAddress));
                lines.push(_line(`veh_sLossPayeeAddr2${idx}`, v.lossPayeeAddr2));
                lines.push(_line(`veh_sLossPayeeCity${idx}`, v.lossPayeeCity));
                lines.push(_line(`veh_sLossPayeeState${idx}`, v.lossPayeeState));
                lines.push(_line(`veh_sLossPayeeZip${idx}`, v.lossPayeeZip));
                // Premium placeholders
                const prmFields = [
                    'sClass','dBi','dPd','dUmBi','dUmPd','dUimBi','dUimPd',
                    'dMedical','dPip','dAddOnEquip','dCarLoanProtection',
                    'dLienholderDed','dComp','dColl','dTowing','dRentRemb'
                ];
                prmFields.forEach(f => lines.push(_line(`prm_${f}${idx}`, '')));
            });

            // Drivers
            _exportData.drivers.forEach((d, i) => {
                const idx = `[${i}]`;
                lines.push(_line(`drv_sLastName${idx}`, d.lastName));
                lines.push(_line(`drv_sFirstName${idx}`, d.firstName));
                lines.push(_line(`drv_cInitial${idx}`, d.middleInitial));
                lines.push(_line(`drv_tBirthDate${idx}`, d.birthDate));
                lines.push(_line(`drv_nPoints${idx}`, d.points));
                lines.push(_line(`drv_sLicensingState${idx}`, d.licenseState));
                lines.push(_line(`drv_sLicenseNum${idx}`, d.licenseNumber));
                lines.push(_line(`drv_bExcluded${idx}`, d.excluded));
                lines.push(_line(`drv_bPrincipleOperator${idx}`, d.principalOperator));
                lines.push(_line(`drv_bOnlyOperator${idx}`, d.onlyOperator));
                lines.push(_line(`drv_bNonDriver${idx}`, d.nonDriver));
                lines.push(_line(`drv_sDriversOccupation${idx}`, d.occupation));
                lines.push(_line(`drv_sSex${idx}`, d.sex));
                lines.push(_line(`drv_sMaritalStatus${idx}`, d.maritalStatus));
                lines.push(_line(`drv_bFiling${idx}`, d.sr22Filing));
                lines.push(_line(`drv_sFilingState${idx}`, d.sr22State));
                lines.push(_line(`drv_sFilingReason${idx}`, d.sr22Reason));
                lines.push(_line(`drv_tDateLicensed${idx}`, d.dateLicensed));
                lines.push(_line(`drv_tHiredDate${idx}`, d.hiredDate));
                lines.push(_line(`drv_tDateOfCDL${idx}`, d.cdlDate));
                lines.push(_line(`drv_bGoodStudent${idx}`, d.goodStudent));
                lines.push(_line(`drv_bDriverTraining${idx}`, d.driverTraining));
                lines.push(_line(`drv_bDefDrvr${idx}`, d.defensiveDriver));
                lines.push(_line(`drv_sSSNum${idx}`, d.ssn));
                lines.push(_line(`drv_sRelationship${idx}`, d.relationship));
            });
        }

        // ── Home-Specific Block ──
        if (includeHome) {
            const h = _exportData.home;
            lines.push(_line('gen_nAdditionalRes', h.additionalRes));
            lines.push(_line('gen_sCounty', h.county));
            lines.push(_line('gen_sProtectionClass', h.protectionClass));
            lines.push(_line('gen_nYearBuilt', h.yearBuilt));
            lines.push(_line('gen_sConstruction', h.construction));
            lines.push(_line('gen_sBurgAlarm', h.burgAlarm));
            lines.push(_line('gen_sFireAlarm', h.fireAlarm));

            if (h.lienholderName) {
                lines.push(_line('gen_sLPType1', h.lienholderType));
                lines.push(_line('gen_sLpName1', h.lienholderName));
                lines.push(_line('gen_sLPName1Line2', ''));
                lines.push(_line('gen_sLpAddress1', h.lienholderAddress));
                lines.push(_line('gen_sLpCity1', h.lienholderCity));
                lines.push(_line('gen_sLpState1', h.lienholderState));
                lines.push(_line('gen_sLpZip1', h.lienholderZip));
                lines.push(_line('gen_sLpLoanNumber1', h.lienholderLoanNum));
            }

            lines.push(_line('gen_bDeadBolt', h.deadbolt ? 'Y' : ''));
            lines.push(_line('gen_bFireExtinguisher', h.fireExtinguisher ? 'Y' : ''));
            lines.push(_line('gen_sSprinkler', h.sprinkler));

            // Scheduled personal property
            const sppFields = ['Jewelry','Furs','Guns','Cameras','Coins','Stamps','Silverware','FineArt','GolfEquip','MusicalInst','Electronics'];
            sppFields.forEach(f => {
                const key = f.charAt(0).toLowerCase() + f.slice(1);
                lines.push(_line(`gen_l${f}`, h[key] || ''));
            });

            // Coverages
            lines.push(_line('gen_bHomeReplacement', h.homeReplacement ? 'Y' : ''));
            lines.push(_line('gen_lCovA', h.covA));
            lines.push(_line('gen_lCovB', h.covB));
            lines.push(_line('gen_lCovC', h.covC));
            lines.push(_line('gen_lCovD', h.covD));
            lines.push(_line('gen_cContentsReplacement', h.contentsReplacement ? 'Y' : ''));
            lines.push(_line('gen_sLiability', h.liability));
            lines.push(_line('gen_sMedical', h.medical));
            lines.push(_line('gen_sDecuct', h.deductible));
            lines.push(_line('gen_bEarthquake', h.earthquake ? 'Y' : ''));
            lines.push(_line('gen_sEQDeduct', h.eqDeduct));
            lines.push(_line('gen_bEQMasonryVeneer', h.eqMasonryVeneer ? 'Y' : ''));
            lines.push(_line('gen_lOrdinanceOrLawIncr', h.ordinanceLawIncr));
            lines.push(_line('gen_bMultiPolicy', h.multiPolicy ? 'Y' : ''));

            // Home premium block (blank placeholders)
            const hpmFields = [
                'sTerritory', 'sEarthquakeZone', 'sPremiumGroup',
                'dDwelling', 'dOtherStructures', 'dPersonalProp', 'dLossOfUse',
                'dLiability', 'dMedical', 'dAdditionalRes', 'dHomeReplacement',
                'dWatercraft', 'dEarthquake', 'dDeductible', 'dJewelry', 'dFurs',
                'dGuns', 'dCameras', 'dCoins', 'dStamps', 'dSilverware', 'dFineArt',
                'dGolfEquip', 'dMusicalInst', 'dElectronics', 'dNewHomeCredit',
                'dProtectiveDeviceCr', 'dMultiPolicyCredit', 'dRenewalCredit',
                'dSPPSurcharge', 'dOrdinanceOrLaw', 'dSpecialCovA'
            ];
            hpmFields.forEach(f => {
                let val = '';
                if (f === 'sEarthquakeZone') val = h.eqZone;
                lines.push(_line(`hpm_${f}`, val));
            });
        }

        // ── Commercial-Specific Block ──
        if (isCommercial) {
            const cm = _exportData.commercial;
            cm.coverages.forEach((cov, i) => {
                lines.push(_line(`gen_Coverage[${i}]`, cov.name));
                lines.push(_line(`gen_CoverageLimits[${i}]`, cov.limits));
                lines.push(_line(`gen_CoverageDeds[${i}]`, cov.deductible));
            });
        }

        return lines.join('\r\n') + '\r\n';
    }

    // ── Read form values back into _exportData ──────────────
    function _readForm() {
        const el = (id) => {
            const e = document.getElementById(id);
            return e ? e.value : '';
        };
        const chk = (id) => {
            const e = document.getElementById(id);
            return e ? e.checked : false;
        };

        // Read selected export types from checkboxes
        _selectedTypes.auto = chk('hs_typeAuto');
        _selectedTypes.home = chk('hs_typeHome');
        _selectedTypes.commercial = chk('hs_typeCommercial');

        // Client
        _exportData.client.lastName = el('hs_lastName');
        _exportData.client.firstName = el('hs_firstName');
        _exportData.client.middleInitial = el('hs_middleInitial');
        _exportData.client.address1 = el('hs_address1');
        _exportData.client.city = el('hs_city');
        _exportData.client.state = el('hs_state');
        _exportData.client.zip = el('hs_zip');
        _exportData.client.phone = el('hs_phone');
        _exportData.client.cellPhone = el('hs_cellPhone');
        _exportData.client.workPhone = el('hs_workPhone');
        _exportData.client.email = el('hs_email');
        _exportData.client.emailWork = el('hs_emailWork');
        _exportData.client.clientSource = el('hs_clientSource');
        _exportData.client.clientNotes = el('hs_clientNotes');
        _exportData.client.county = el('hs_clientCounty');

        // Policy
        _exportData.policy.company = el('hs_company');
        _exportData.policy.policyNumber = el('hs_policyNumber');
        _exportData.policy.policyTitle = el('hs_policyTitle');
        _exportData.policy.policyForm = el('hs_policyForm');
        _exportData.policy.program = el('hs_program');
        _exportData.policy.effectiveDate = el('hs_effectiveDate');
        _exportData.policy.expirationDate = el('hs_expirationDate');
        _exportData.policy.productionDate = el('hs_productionDate');
        _exportData.policy.term = el('hs_term');
        _exportData.policy.totalPremium = el('hs_totalPremium');
        _exportData.policy.status = el('hs_status');
        _exportData.policy.clientStatus = el('hs_clientStatus');
        _exportData.policy.leadSource = el('hs_leadSource');
        _exportData.policy.producer = el('hs_producer');
        _exportData.policy.agencyId = el('hs_agencyId');
        _exportData.policy.policyOffice = el('hs_policyOffice');
        _exportData.policy.filingFee = el('hs_filingFee');
        _exportData.policy.policyFee = el('hs_policyFee');
        _exportData.policy.brokerFee = el('hs_brokerFee');
        _exportData.policy.garagingAddress = el('hs_garagingAddress');
        _exportData.policy.garagingCity = el('hs_garagingCity');
        _exportData.policy.garagingState = el('hs_garagingState');
        _exportData.policy.garagingZip = el('hs_garagingZip');
        _exportData.policy.county = el('hs_county');

        // Auto
        if (_selectedTypes.auto) {
            _exportData.auto.bi = el('hs_bi');
            _exportData.auto.pd = el('hs_pd');
            _exportData.auto.umBi = el('hs_umBi');
            _exportData.auto.uimBi = el('hs_uimBi');
            _exportData.auto.umPd = el('hs_umPd');
            _exportData.auto.medical = el('hs_autoMedical');
            _exportData.auto.pip = el('hs_pip');

            // Read vehicle rows
            const vehContainer = document.getElementById('hs_vehicleList');
            if (vehContainer) {
                const rows = vehContainer.querySelectorAll('.hs-vehicle-row');
                _exportData.vehicles = Array.from(rows).map(row => ({
                    make: (row.querySelector('[data-field="make"]')?.value || '').toUpperCase(),
                    model: row.querySelector('[data-field="model"]')?.value || '',
                    year: row.querySelector('[data-field="year"]')?.value || '',
                    vin: (row.querySelector('[data-field="vin"]')?.value || '').toUpperCase(),
                    use: row.querySelector('[data-field="use"]')?.value || '',
                    annualMileage: row.querySelector('[data-field="annualMileage"]')?.value || '',
                    vehicleType: row.querySelector('[data-field="vehicleType"]')?.value || '',
                    comp: row.querySelector('[data-field="comp"]')?.value || 'None',
                    coll: row.querySelector('[data-field="coll"]')?.value || 'None',
                    towing: row.querySelector('[data-field="towing"]')?.value || 'No',
                    rental: row.querySelector('[data-field="rental"]')?.value || 'No',
                    fourWd: row.querySelector('[data-field="fourWd"]')?.value || 'No',
                    garagingZip: row.querySelector('[data-field="garagingZip"]')?.value || '',
                    lossPayee: row.querySelector('[data-field="lossPayee"]')?.value || 'No',
                    lossPayeeName: row.querySelector('[data-field="lossPayeeName"]')?.value || '',
                    lossPayeeAddress: row.querySelector('[data-field="lossPayeeAddress"]')?.value || '',
                    lossPayeeCity: row.querySelector('[data-field="lossPayeeCity"]')?.value || '',
                    lossPayeeState: row.querySelector('[data-field="lossPayeeState"]')?.value || '',
                    lossPayeeZip: row.querySelector('[data-field="lossPayeeZip"]')?.value || '',
                    symbol: '', territory: '', addonEquip: '', assignedDriver: '',
                    commuteMileage: '', gvw: '', umpd: '', uimpd: '',
                    additionalInterest: 'No', lossPayeeAddr2: '',
                }));
            }

            // Read driver rows
            const drvContainer = document.getElementById('hs_driverList');
            if (drvContainer) {
                const rows = drvContainer.querySelectorAll('.hs-driver-row');
                _exportData.drivers = Array.from(rows).map(row => ({
                    lastName: row.querySelector('[data-field="lastName"]')?.value || '',
                    firstName: row.querySelector('[data-field="firstName"]')?.value || '',
                    middleInitial: row.querySelector('[data-field="middleInitial"]')?.value || '',
                    birthDate: row.querySelector('[data-field="birthDate"]')?.value || '',
                    licenseState: (row.querySelector('[data-field="licenseState"]')?.value || '').toUpperCase(),
                    licenseNumber: (row.querySelector('[data-field="licenseNumber"]')?.value || '').toUpperCase(),
                    sex: row.querySelector('[data-field="sex"]')?.value || '',
                    maritalStatus: row.querySelector('[data-field="maritalStatus"]')?.value || '',
                    occupation: row.querySelector('[data-field="occupation"]')?.value || '',
                    relationship: row.querySelector('[data-field="relationship"]')?.value || 'Insured',
                    principalOperator: row.querySelector('[data-field="principalOperator"]')?.value || 'No',
                    sr22Filing: row.querySelector('[data-field="sr22Filing"]')?.value || '',
                    sr22State: (row.querySelector('[data-field="sr22State"]')?.value || '').toUpperCase(),
                    goodStudent: row.querySelector('[data-field="goodStudent"]')?.value || 'No',
                    driverTraining: row.querySelector('[data-field="driverTraining"]')?.value || 'No',
                    defensiveDriver: row.querySelector('[data-field="defensiveDriver"]')?.value || 'No',
                    points: '', excluded: 'No', onlyOperator: 'No',
                    nonDriver: 'No', sr22Reason: '', dateLicensed: '',
                    hiredDate: '', cdlDate: '', ssn: '',
                }));
            }
        }

        // Home
        if (_selectedTypes.home) {
            _exportData.home.protectionClass = el('hs_protectionClass');
            _exportData.home.yearBuilt = el('hs_yearBuilt');
            _exportData.home.construction = el('hs_construction');
            _exportData.home.burgAlarm = el('hs_burgAlarm');
            _exportData.home.fireAlarm = el('hs_fireAlarm');
            _exportData.home.sprinkler = el('hs_sprinkler');
            _exportData.home.county = el('hs_homeCounty');
            _exportData.home.covA = el('hs_covA');
            _exportData.home.covB = el('hs_covB');
            _exportData.home.covC = el('hs_covC');
            _exportData.home.covD = el('hs_covD');
            _exportData.home.liability = el('hs_homeLiability');
            _exportData.home.medical = el('hs_homeMedical');
            _exportData.home.deductible = el('hs_homeDeductible');
            _exportData.home.earthquake = chk('hs_earthquake');
            _exportData.home.eqDeduct = el('hs_eqDeduct');
            _exportData.home.eqZone = el('hs_eqZone');
            _exportData.home.multiPolicy = chk('hs_multiPolicy');
            _exportData.home.homeReplacement = chk('hs_homeReplacement');
            _exportData.home.contentsReplacement = chk('hs_contentsReplacement');
            _exportData.home.ordinanceLawIncr = el('hs_ordinanceLaw');
            _exportData.home.deadbolt = chk('hs_deadbolt');
            _exportData.home.fireExtinguisher = chk('hs_fireExtinguisher');
            _exportData.home.lienholderName = el('hs_lienholderName');
            _exportData.home.lienholderAddress = el('hs_lienholderAddress');
            _exportData.home.lienholderCity = el('hs_lienholderCity');
            _exportData.home.lienholderState = el('hs_lienholderState');
            _exportData.home.lienholderZip = el('hs_lienholderZip');
            _exportData.home.lienholderLoanNum = el('hs_lienholderLoanNum');
            _exportData.home.jewelry = el('hs_jewelry');
        }

        // Commercial
        if (_selectedTypes.commercial) {
            _exportData.commercial.businessName = el('hs_businessName');
            _exportData.commercial.dbaName = el('hs_dbaName');
            _exportData.commercial.fein = el('hs_fein');
            _exportData.commercial.businessLicense = el('hs_businessLicense');
            _exportData.commercial.naics = el('hs_naics');
            _exportData.commercial.website = el('hs_website');
            _exportData.commercial.businessType = el('hs_businessType');
            _exportData.commercial.lobCode = el('hs_lobCode');

            // Read coverage rows
            const covContainer = document.getElementById('hs_coverageList');
            if (covContainer) {
                const rows = covContainer.querySelectorAll('.hs-coverage-row');
                _exportData.commercial.coverages = Array.from(rows).map(row => ({
                    name: row.querySelector('[data-field="covName"]')?.value || '',
                    limits: row.querySelector('[data-field="covLimits"]')?.value || '',
                    deductible: row.querySelector('[data-field="covDeductible"]')?.value || '',
                }));
            }
        }

        // Save agency settings
        _settings.agencyId = _exportData.policy.agencyId;
        _settings.producer = _exportData.policy.producer;
        _settings.policyOffice = _exportData.policy.policyOffice;
        _settings.clientOffice = _exportData.client.clientOffice;
        _saveSettings();
    }

    // ── Export as .CMSMTF file download(s) ──────────────────
    function _doExport() {
        _readForm();

        if (!_exportData.client.lastName && !_exportData.client.firstName) {
            _showToast('Client name is required for export', 'error');
            return;
        }

        const types = Object.keys(_selectedTypes).filter(t => _selectedTypes[t]);
        if (types.length === 0) {
            _showToast('Select at least one export type (Auto, Home, or Commercial)', 'error');
            return;
        }

        const lastName = _exportData.client.lastName || 'Client';
        const firstName = _exportData.client.firstName || '';
        const baseName = `${lastName}${firstName ? '_' + firstName : ''}`;

        types.forEach((type, i) => {
            const content = _generateCMSMTF(type);
            const label = type.charAt(0).toUpperCase() + type.slice(1);
            const filename = types.length === 1
                ? `${baseName}_HawkSoft.CMSMTF`
                : `${baseName}_HawkSoft_${label}.CMSMTF`;

            // Stagger downloads slightly so browser doesn't block them
            setTimeout(() => {
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                _addToExportHistory(filename);
            }, i * 300);
        });

        const label = types.length === 1
            ? types[0].charAt(0).toUpperCase() + types[0].slice(1)
            : types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' + ');
        _showToast(`Exported ${label} (${types.length} file${types.length > 1 ? 's' : ''})`, 'success');
    }

    // ── Preview CMSMTF content ──────────────────────────────
    function _doPreview() {
        _readForm();
        const types = Object.keys(_selectedTypes).filter(t => _selectedTypes[t]);
        if (types.length === 0) {
            _showToast('Select at least one export type to preview', 'error');
            return;
        }

        const previews = types.map(type => {
            const label = type.toUpperCase();
            const content = _generateCMSMTF(type);
            return `── ${label} ──────────────────────────────\n${content}`;
        });

        const previewEl = document.getElementById('hs_preview');
        const previewContent = document.getElementById('hs_previewContent');
        if (previewEl && previewContent) {
            previewContent.textContent = previews.join('\n\n');
            previewEl.style.display = previewEl.style.display === 'none' ? 'block' : 'none';
        }
    }

    // ── Export history ───────────────────────────────────────
    function _addToExportHistory(filename) {
        try {
            const history = JSON.parse(localStorage.getItem('altech_hawksoft_history') || '[]');
            history.unshift({ filename, date: new Date().toISOString() });
            if (history.length > 20) history.length = 20;
            localStorage.setItem('altech_hawksoft_history', JSON.stringify(history));
        } catch (e) { /* ignore */ }
    }

    // ── Toast notifications ─────────────────────────────────
    function _showToast(message, type) {
        const container = document.getElementById('hs_toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `hs-toast hs-toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('hs-toast-show'); }, 10);
        setTimeout(() => {
            toast.classList.remove('hs-toast-show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
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

    // ── Render the full plugin UI ───────────────────────────
    function render() {
        const container = document.getElementById('hs_body');
        if (!container) return;

        const hasFormData = typeof App !== 'undefined' && App.data && (App.data.firstName || App.data.lastName);
        const showAuto = _selectedTypes.auto;
        const showHome = _selectedTypes.home;
        const showCommercial = _selectedTypes.commercial;
        const c = _exportData.client;
        const p = _exportData.policy;
        const a = _exportData.auto;
        const h = _exportData.home;
        const cm = _exportData.commercial;

        const filledClient = [c.firstName, c.lastName, c.address1, c.city, c.state, c.zip, c.phone, c.email].filter(Boolean).length;
        const filledPolicy = [p.company, p.policyNumber, p.effectiveDate, p.term].filter(Boolean).length;
        const selectedCount = [showAuto, showHome, showCommercial].filter(Boolean).length;

        container.innerHTML = `
        <div id="hs_toastContainer" class="hs-toast-container"></div>

        <!-- Source Banner -->
        <div class="hs-source-banner ${hasFormData ? 'hs-source-active' : ''}">
            <div class="hs-source-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div class="hs-source-text">
                ${hasFormData
                    ? `<strong>Pre-filled from intake form</strong><br><span class="hs-source-detail">${filledClient}/8 client fields &bull; ${_exportData.vehicles.length} vehicle(s) &bull; ${_exportData.drivers.length} driver(s)</span>`
                    : `<strong>No intake data found</strong><br><span class="hs-source-detail">Fill in the intake form first, or enter data manually below</span>`
                }
            </div>
        </div>

        <!-- Export Type Selector (Multi-Select Checkboxes) -->
        <div class="hs-section">
            <div class="hs-section-header" onclick="HawkSoftExport.toggleSection(this)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span>Export Types</span>
                <span class="hs-badge">${selectedCount} selected</span>
                <svg class="hs-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="hs-section-body">
                <p class="hs-hint-text">Select one or more — each generates a separate .CMSMTF file for HawkSoft import.</p>
                <div class="hs-checkbox-group">
                    <label class="hs-checkbox-card ${showAuto ? 'hs-checkbox-active' : ''}">
                        <input type="checkbox" id="hs_typeAuto" ${showAuto ? 'checked' : ''} onchange="HawkSoftExport.toggleExportType()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.28V16h3"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>
                        <span>Auto</span>
                    </label>
                    <label class="hs-checkbox-card ${showHome ? 'hs-checkbox-active' : ''}">
                        <input type="checkbox" id="hs_typeHome" ${showHome ? 'checked' : ''} onchange="HawkSoftExport.toggleExportType()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        <span>Home</span>
                    </label>
                    <label class="hs-checkbox-card ${showCommercial ? 'hs-checkbox-active' : ''}">
                        <input type="checkbox" id="hs_typeCommercial" ${showCommercial ? 'checked' : ''} onchange="HawkSoftExport.toggleExportType()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        <span>Commercial</span>
                    </label>
                </div>
            </div>
        </div>

        <!-- Client Information -->
        <div class="hs-section">
            <div class="hs-section-header" onclick="HawkSoftExport.toggleSection(this)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>Client Information</span>
                <span class="hs-badge">${filledClient}/8</span>
                <svg class="hs-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="hs-section-body">
                <div class="hs-form-grid">
                    <div class="hs-field"><label>First Name</label><input id="hs_firstName" value="${_val(c.firstName)}"></div>
                    <div class="hs-field"><label>Last Name</label><input id="hs_lastName" value="${_val(c.lastName)}"></div>
                    <div class="hs-field"><label>MI</label><input id="hs_middleInitial" value="${_val(c.middleInitial)}" maxlength="1"></div>
                    <div class="hs-field hs-field-wide"><label>Address</label><input id="hs_address1" value="${_val(c.address1)}"></div>
                    <div class="hs-field"><label>City</label><input id="hs_city" value="${_val(c.city)}"></div>
                    <div class="hs-field"><label>State</label><input id="hs_state" value="${_val(c.state)}" maxlength="2"></div>
                    <div class="hs-field"><label>ZIP</label><input id="hs_zip" value="${_val(c.zip)}"></div>
                    <div class="hs-field"><label>County</label><input id="hs_clientCounty" value="${_val(c.county)}"></div>
                    <div class="hs-field"><label>Phone</label><input id="hs_phone" value="${_val(c.phone)}" type="tel"></div>
                    <div class="hs-field"><label>Cell Phone</label><input id="hs_cellPhone" value="${_val(c.cellPhone)}" type="tel"></div>
                    <div class="hs-field"><label>Work Phone</label><input id="hs_workPhone" value="${_val(c.workPhone)}" type="tel"></div>
                    <div class="hs-field"><label>Email</label><input id="hs_email" type="email" value="${_val(c.email)}"></div>
                    <div class="hs-field"><label>Work Email</label><input id="hs_emailWork" type="email" value="${_val(c.emailWork)}"></div>
                    <div class="hs-field"><label>Client Source</label>
                        <select id="hs_clientSource">
                            <option value="">—</option>
                            <option value="Website" ${c.clientSource === 'Website' ? 'selected' : ''}>Website</option>
                            <option value="Call In" ${c.clientSource === 'Call In' ? 'selected' : ''}>Call In</option>
                            <option value="Referral" ${c.clientSource === 'Referral' ? 'selected' : ''}>Referral</option>
                            <option value="Social Media" ${c.clientSource === 'Social Media' ? 'selected' : ''}>Social Media</option>
                            <option value="Yellow Pages" ${c.clientSource === 'Yellow Pages' ? 'selected' : ''}>Yellow Pages</option>
                            <option value="Walk In" ${c.clientSource === 'Walk In' ? 'selected' : ''}>Walk In</option>
                        </select>
                    </div>
                    <div class="hs-field hs-field-wide"><label>Client Notes</label><textarea id="hs_clientNotes" rows="3" placeholder="Notes visible in HawkSoft client record">${_val(c.clientNotes)}</textarea></div>
                </div>
            </div>
        </div>

        <!-- Policy Details -->
        <div class="hs-section">
            <div class="hs-section-header" onclick="HawkSoftExport.toggleSection(this)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Policy Details</span>
                <span class="hs-badge">${filledPolicy}/4</span>
                <svg class="hs-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="hs-section-body">
                <div class="hs-form-grid">
                    <div class="hs-field"><label>Carrier / Company</label><input id="hs_company" value="${_val(p.company)}" placeholder="e.g. Safeco"></div>
                    <div class="hs-field"><label>Policy Number</label><input id="hs_policyNumber" value="${_val(p.policyNumber)}"></div>
                    <div class="hs-field"><label>Policy Title</label>
                        <select id="hs_policyTitle">
                            <option value="" ${!p.policyTitle ? 'selected' : ''}>—</option>
                            <option value="Personal Auto" ${p.policyTitle === 'Personal Auto' ? 'selected' : ''}>Personal Auto</option>
                            <option value="Homeowners" ${p.policyTitle === 'Homeowners' ? 'selected' : ''}>Homeowners</option>
                            <option value="Home + Auto" ${p.policyTitle === 'Home + Auto' ? 'selected' : ''}>Home + Auto</option>
                            <option value="Renters" ${p.policyTitle === 'Renters' ? 'selected' : ''}>Renters</option>
                            <option value="Condo" ${p.policyTitle === 'Condo' ? 'selected' : ''}>Condo</option>
                            <option value="Personal" ${p.policyTitle === 'Personal' ? 'selected' : ''}>Personal</option>
                            <option value="Commercial" ${p.policyTitle === 'Commercial' ? 'selected' : ''}>Commercial</option>
                        </select>
                    </div>
                    <div class="hs-field"><label>Policy Form</label><input id="hs_policyForm" value="${_val(p.policyForm)}" placeholder="HO3, PAP, DP1, etc."></div>
                    <div class="hs-field"><label>Program</label><input id="hs_program" value="${_val(p.program)}" placeholder="Optional"></div>
                    <div class="hs-field"><label>Effective Date</label><input id="hs_effectiveDate" value="${_val(p.effectiveDate)}" placeholder="MM/DD/YYYY" onchange="HawkSoftExport.updateExpiration()"></div>
                    <div class="hs-field"><label>Term (months)</label>
                        <select id="hs_term" onchange="HawkSoftExport.updateExpiration()">
                            <option value="">—</option>
                            <option value="1" ${p.term === '1' ? 'selected' : ''}>1</option>
                            <option value="3" ${p.term === '3' ? 'selected' : ''}>3</option>
                            <option value="6" ${p.term === '6' ? 'selected' : ''}>6</option>
                            <option value="12" ${p.term === '12' ? 'selected' : ''}>12</option>
                        </select>
                    </div>
                    <div class="hs-field"><label>Expiration Date</label><input id="hs_expirationDate" value="${_val(p.expirationDate || _calcExpiration(p.effectiveDate, p.term))}" placeholder="Auto-calculated"></div>
                    <div class="hs-field"><label>Production Date</label><input id="hs_productionDate" value="${_val(p.productionDate)}" placeholder="MM/DD/YYYY"></div>
                    <div class="hs-field"><label>Status</label>
                        <select id="hs_status">
                            <option value="New" ${p.status === 'New' ? 'selected' : ''}>New</option>
                            <option value="Prospect" ${p.status === 'Prospect' ? 'selected' : ''}>Prospect</option>
                            <option value="Active" ${p.status === 'Active' ? 'selected' : ''}>Active</option>
                            <option value="Renewal" ${p.status === 'Renewal' ? 'selected' : ''}>Renewal</option>
                            <option value="Quote" ${p.status === 'Quote' ? 'selected' : ''}>Quote</option>
                        </select>
                    </div>
                    <div class="hs-field"><label>Total Premium</label><input id="hs_totalPremium" value="${_val(p.totalPremium)}" placeholder="$"></div>
                    <div class="hs-field"><label>Client Status</label>
                        <select id="hs_clientStatus">
                            <option value="PROSPECT" ${p.clientStatus === 'PROSPECT' ? 'selected' : ''}>Prospect</option>
                            <option value="New Client" ${p.clientStatus === 'New Client' ? 'selected' : ''}>New Client</option>
                            <option value="Existing Client" ${p.clientStatus === 'Existing Client' ? 'selected' : ''}>Existing Client</option>
                            <option value="Cancelled" ${p.clientStatus === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>
                    <div class="hs-field"><label>Lead Source</label><input id="hs_leadSource" value="${_val(p.leadSource)}"></div>
                    <div class="hs-field"><label>Filing Fee</label><input id="hs_filingFee" value="${_val(p.filingFee)}" placeholder="$"></div>
                    <div class="hs-field"><label>Policy Fee</label><input id="hs_policyFee" value="${_val(p.policyFee)}" placeholder="$"></div>
                    <div class="hs-field"><label>Broker Fee</label><input id="hs_brokerFee" value="${_val(p.brokerFee)}" placeholder="$"></div>
                </div>
                <div class="hs-subsection">
                    <h4>Agency Settings <span class="hs-hint">(saved for reuse)</span></h4>
                    <div class="hs-form-grid">
                        <div class="hs-field"><label>Agency ID</label><input id="hs_agencyId" value="${_val(p.agencyId)}" placeholder="e.g. 65177"></div>
                        <div class="hs-field"><label>Producer Code</label><input id="hs_producer" value="${_val(p.producer)}" placeholder="e.g. BBB" maxlength="3"></div>
                        <div class="hs-field"><label>Policy Office</label><input id="hs_policyOffice" value="${_val(p.policyOffice)}" placeholder="1"></div>
                    </div>
                </div>
                <div class="hs-subsection">
                    <h4>Garaging / Mailing Address</h4>
                    <div class="hs-form-grid">
                        <div class="hs-field hs-field-wide"><label>Address</label><input id="hs_garagingAddress" value="${_val(p.garagingAddress)}"></div>
                        <div class="hs-field"><label>City</label><input id="hs_garagingCity" value="${_val(p.garagingCity)}"></div>
                        <div class="hs-field"><label>State</label><input id="hs_garagingState" value="${_val(p.garagingState)}" maxlength="2"></div>
                        <div class="hs-field"><label>ZIP</label><input id="hs_garagingZip" value="${_val(p.garagingZip)}"></div>
                        <div class="hs-field"><label>County</label><input id="hs_county" value="${_val(p.county)}"></div>
                    </div>
                </div>
                <p class="hs-hint-text" style="margin-top:12px">
                    <strong>Set manually in HawkSoft after import:</strong> CSR, Client Since, At Address Since, Writing Carrier/NAIC, Agent Code, Account #, Billing Type, Payment Plan
                </p>
            </div>
        </div>

        <!-- Auto Coverage -->
        <div class="hs-section ${showAuto ? '' : 'hs-hidden'}" id="hs_autoSection">
            <div class="hs-section-header" onclick="HawkSoftExport.toggleSection(this)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.28V16h3"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>
                <span>Auto Coverage</span>
                <svg class="hs-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="hs-section-body">
                <div class="hs-form-grid">
                    <div class="hs-field"><label>BI Limits</label><input id="hs_bi" value="${_val(a.bi)}" placeholder="25/50"></div>
                    <div class="hs-field"><label>PD Limit</label><input id="hs_pd" value="${_val(a.pd)}" placeholder="25"></div>
                    <div class="hs-field"><label>UM-BI</label><input id="hs_umBi" value="${_val(a.umBi)}"></div>
                    <div class="hs-field"><label>UIM-BI</label><input id="hs_uimBi" value="${_val(a.uimBi)}"></div>
                    <div class="hs-field"><label>UM-PD</label><input id="hs_umPd" value="${_val(a.umPd)}"></div>
                    <div class="hs-field"><label>Medical</label><input id="hs_autoMedical" value="${_val(a.medical)}"></div>
                    <div class="hs-field"><label>PIP</label><input id="hs_pip" value="${_val(a.pip)}"></div>
                </div>
                <div class="hs-subsection">
                    <div class="hs-subsection-header">
                        <h4>Vehicles (${_exportData.vehicles.length})</h4>
                        <button type="button" class="hs-btn hs-btn-small" onclick="HawkSoftExport.addVehicle()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            Add Vehicle
                        </button>
                    </div>
                    <div id="hs_vehicleList">
                        ${_exportData.vehicles.map((v, i) => _vehicleRowHTML(v, i)).join('')}
                    </div>
                </div>
                <div class="hs-subsection">
                    <div class="hs-subsection-header">
                        <h4>Drivers (${_exportData.drivers.length})</h4>
                        <button type="button" class="hs-btn hs-btn-small" onclick="HawkSoftExport.addDriver()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            Add Driver
                        </button>
                    </div>
                    <div id="hs_driverList">
                        ${_exportData.drivers.map((d, i) => _driverRowHTML(d, i)).join('')}
                    </div>
                </div>
            </div>
        </div>

        <!-- Home Coverage -->
        <div class="hs-section ${showHome ? '' : 'hs-hidden'}" id="hs_homeSection">
            <div class="hs-section-header" onclick="HawkSoftExport.toggleSection(this)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <span>Home / Property</span>
                <svg class="hs-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="hs-section-body">
                <div class="hs-form-grid">
                    <div class="hs-field"><label>Year Built</label><input id="hs_yearBuilt" value="${_val(h.yearBuilt)}"></div>
                    <div class="hs-field"><label>Construction</label><input id="hs_construction" value="${_val(h.construction)}" placeholder="Brick, Frame, etc."></div>
                    <div class="hs-field"><label>Protection Class</label><input id="hs_protectionClass" value="${_val(h.protectionClass)}" placeholder="1-10"></div>
                    <div class="hs-field"><label>County</label><input id="hs_homeCounty" value="${_val(h.county)}"></div>
                    <div class="hs-field"><label>Burglar Alarm</label>
                        <select id="hs_burgAlarm">
                            <option value="">None</option>
                            <option value="Local" ${h.burgAlarm === 'Local' ? 'selected' : ''}>Local</option>
                            <option value="Central" ${h.burgAlarm === 'Central' ? 'selected' : ''}>Central</option>
                            <option value="Direct" ${h.burgAlarm === 'Direct' ? 'selected' : ''}>Direct</option>
                        </select>
                    </div>
                    <div class="hs-field"><label>Fire Alarm</label>
                        <select id="hs_fireAlarm">
                            <option value="">None</option>
                            <option value="Smoke Detector" ${h.fireAlarm === 'Smoke Detector' ? 'selected' : ''}>Smoke Detector</option>
                            <option value="Local" ${h.fireAlarm === 'Local' ? 'selected' : ''}>Local</option>
                            <option value="Central" ${h.fireAlarm === 'Central' ? 'selected' : ''}>Central</option>
                            <option value="Direct" ${h.fireAlarm === 'Direct' ? 'selected' : ''}>Direct</option>
                        </select>
                    </div>
                    <div class="hs-field"><label>Sprinkler</label>
                        <select id="hs_sprinkler">
                            <option value="">None</option>
                            <option value="Partial" ${h.sprinkler === 'Partial' ? 'selected' : ''}>Partial</option>
                            <option value="Full" ${h.sprinkler === 'Full' ? 'selected' : ''}>Full</option>
                        </select>
                    </div>
                </div>

                <div class="hs-subsection">
                    <h4>Coverages</h4>
                    <div class="hs-form-grid">
                        <div class="hs-field"><label>Cov A (Dwelling)</label><input id="hs_covA" value="${_val(h.covA)}" placeholder="$"></div>
                        <div class="hs-field"><label>Cov B (Other Struct.)</label><input id="hs_covB" value="${_val(h.covB)}" placeholder="$"></div>
                        <div class="hs-field"><label>Cov C (Personal Prop.)</label><input id="hs_covC" value="${_val(h.covC)}" placeholder="$"></div>
                        <div class="hs-field"><label>Cov D (Loss of Use)</label><input id="hs_covD" value="${_val(h.covD)}" placeholder="$"></div>
                        <div class="hs-field"><label>Liability</label><input id="hs_homeLiability" value="${_val(h.liability)}" placeholder="$"></div>
                        <div class="hs-field"><label>Medical</label><input id="hs_homeMedical" value="${_val(h.medical)}"></div>
                        <div class="hs-field"><label>Deductible</label><input id="hs_homeDeductible" value="${_val(h.deductible)}"></div>
                        <div class="hs-field"><label>Ordinance/Law</label><input id="hs_ordinanceLaw" value="${_val(h.ordinanceLawIncr)}"></div>
                    </div>
                </div>

                <div class="hs-subsection">
                    <h4>Protective Devices & Options</h4>
                    <div class="hs-toggle-grid">
                        <label class="hs-toggle"><input type="checkbox" id="hs_deadbolt" ${h.deadbolt ? 'checked' : ''}><span>Deadbolt</span></label>
                        <label class="hs-toggle"><input type="checkbox" id="hs_fireExtinguisher" ${h.fireExtinguisher ? 'checked' : ''}><span>Fire Extinguisher</span></label>
                        <label class="hs-toggle"><input type="checkbox" id="hs_homeReplacement" ${h.homeReplacement ? 'checked' : ''}><span>Home Replacement</span></label>
                        <label class="hs-toggle"><input type="checkbox" id="hs_contentsReplacement" ${h.contentsReplacement ? 'checked' : ''}><span>Contents Replacement</span></label>
                        <label class="hs-toggle"><input type="checkbox" id="hs_earthquake" ${h.earthquake ? 'checked' : ''}><span>Earthquake</span></label>
                        <label class="hs-toggle"><input type="checkbox" id="hs_multiPolicy" ${h.multiPolicy ? 'checked' : ''}><span>Multi-Policy</span></label>
                    </div>
                    <div class="hs-form-grid" style="margin-top:12px">
                        <div class="hs-field"><label>EQ Deductible</label><input id="hs_eqDeduct" value="${_val(h.eqDeduct)}"></div>
                        <div class="hs-field"><label>EQ Zone</label><input id="hs_eqZone" value="${_val(h.eqZone)}"></div>
                    </div>
                </div>

                <div class="hs-subsection">
                    <h4>Lienholder / Mortgagee</h4>
                    <div class="hs-form-grid">
                        <div class="hs-field hs-field-wide"><label>Name</label><input id="hs_lienholderName" value="${_val(h.lienholderName)}"></div>
                        <div class="hs-field hs-field-wide"><label>Address</label><input id="hs_lienholderAddress" value="${_val(h.lienholderAddress)}"></div>
                        <div class="hs-field"><label>City</label><input id="hs_lienholderCity" value="${_val(h.lienholderCity)}"></div>
                        <div class="hs-field"><label>State</label><input id="hs_lienholderState" value="${_val(h.lienholderState)}" maxlength="2"></div>
                        <div class="hs-field"><label>ZIP</label><input id="hs_lienholderZip" value="${_val(h.lienholderZip)}"></div>
                        <div class="hs-field"><label>Loan #</label><input id="hs_lienholderLoanNum" value="${_val(h.lienholderLoanNum)}"></div>
                    </div>
                </div>

                <div class="hs-subsection">
                    <h4>Scheduled Personal Property</h4>
                    <div class="hs-form-grid">
                        <div class="hs-field"><label>Jewelry</label><input id="hs_jewelry" value="${_val(h.jewelry)}" placeholder="$"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Commercial / CGL -->
        <div class="hs-section ${showCommercial ? '' : 'hs-hidden'}" id="hs_commercialSection">
            <div class="hs-section-header" onclick="HawkSoftExport.toggleSection(this)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                <span>Commercial / CGL</span>
                <svg class="hs-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="hs-section-body">
                <div class="hs-form-grid">
                    <div class="hs-field hs-field-wide"><label>Business Name</label><input id="hs_businessName" value="${_val(cm.businessName)}" placeholder="e.g. Brown Insurance Services LLC"></div>
                    <div class="hs-field"><label>DBA Name</label><input id="hs_dbaName" value="${_val(cm.dbaName)}"></div>
                    <div class="hs-field"><label>Entity Type</label>
                        <select id="hs_businessType">
                            <option value="">—</option>
                            <option value="L" ${cm.businessType === 'L' ? 'selected' : ''}>LLC</option>
                            <option value="C" ${cm.businessType === 'C' ? 'selected' : ''}>Corporation</option>
                            <option value="S" ${cm.businessType === 'S' ? 'selected' : ''}>S-Corp</option>
                            <option value="P" ${cm.businessType === 'P' ? 'selected' : ''}>Partnership</option>
                            <option value="I" ${cm.businessType === 'I' ? 'selected' : ''}>Sole Proprietor</option>
                        </select>
                    </div>
                    <div class="hs-field"><label>FEIN</label><input id="hs_fein" value="${_val(cm.fein)}" placeholder="XX-XXXXXXX"></div>
                    <div class="hs-field"><label>Business License</label><input id="hs_businessLicense" value="${_val(cm.businessLicense)}"></div>
                    <div class="hs-field"><label>NAICS Code</label><input id="hs_naics" value="${_val(cm.naics)}" placeholder="e.g. 524210"></div>
                    <div class="hs-field"><label>Website</label><input id="hs_website" value="${_val(cm.website)}" placeholder="https://"></div>
                    <div class="hs-field"><label>LOB Code</label>
                        <select id="hs_lobCode">
                            <option value="CGL" ${cm.lobCode === 'CGL' ? 'selected' : ''}>CGL</option>
                            <option value="BOP" ${cm.lobCode === 'BOP' ? 'selected' : ''}>BOP</option>
                            <option value="WC" ${cm.lobCode === 'WC' ? 'selected' : ''}>Workers Comp</option>
                            <option value="CA" ${cm.lobCode === 'CA' ? 'selected' : ''}>Commercial Auto</option>
                            <option value="CPP" ${cm.lobCode === 'CPP' ? 'selected' : ''}>Commercial Package</option>
                            <option value="IM" ${cm.lobCode === 'IM' ? 'selected' : ''}>Inland Marine</option>
                            <option value="UMBR" ${cm.lobCode === 'UMBR' ? 'selected' : ''}>Umbrella</option>
                            <option value="PL" ${cm.lobCode === 'PL' ? 'selected' : ''}>Professional Liability</option>
                            <option value="EPLI" ${cm.lobCode === 'EPLI' ? 'selected' : ''}>EPLI</option>
                            <option value="CYBER" ${cm.lobCode === 'CYBER' ? 'selected' : ''}>Cyber</option>
                        </select>
                    </div>
                </div>

                <div class="hs-subsection">
                    <div class="hs-subsection-header">
                        <h4>Coverages (${cm.coverages.length})</h4>
                        <button type="button" class="hs-btn hs-btn-small" onclick="HawkSoftExport.addCoverage()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            Add Coverage
                        </button>
                    </div>
                    <div id="hs_coverageList">
                        ${cm.coverages.map((cov, i) => _coverageRowHTML(cov, i)).join('')}
                    </div>
                </div>
            </div>
        </div>

        <!-- Preview & Export -->
        <div class="hs-export-bar">
            <button type="button" class="hs-btn hs-btn-secondary" onclick="HawkSoftExport.preview()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview
            </button>
            <button type="button" class="hs-btn hs-btn-primary" onclick="HawkSoftExport.export()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export .CMSMTF${selectedCount > 1 ? ` (${selectedCount} files)` : ''}
            </button>
        </div>

        <!-- Preview Output -->
        <div id="hs_preview" class="hs-preview" style="display:none">
            <div class="hs-preview-header">
                <span>CMSMTF Preview</span>
                <button type="button" class="hs-btn-icon" onclick="HawkSoftExport.copyPreview()" title="Copy to clipboard">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
            </div>
            <pre id="hs_previewContent"></pre>
        </div>
        `;
    }

    // ── Section toggle ──────────────────────────────────────
    function toggleSection(headerEl) {
        const section = headerEl.parentElement;
        section.classList.toggle('hs-collapsed');
    }

    // ── Export type checkbox change ──────────────────────────
    function toggleExportType() {
        _readForm();
        // Re-render to show/hide sections & update button label
        render();
    }

    // ── Add / remove vehicles ───────────────────────────────
    function addVehicle() {
        _readForm();
        _exportData.vehicles.push({
            make: '', model: '', year: '', vin: '', use: '',
            annualMileage: '', vehicleType: '', comp: 'None', coll: 'None',
            towing: 'No', rental: 'No', fourWd: 'No',
            garagingZip: _exportData.policy.garagingZip || '',
            lossPayee: 'No', lossPayeeName: '', lossPayeeAddress: '',
            lossPayeeCity: '', lossPayeeState: '', lossPayeeZip: '',
            symbol: '', territory: '', addonEquip: '', assignedDriver: '',
            commuteMileage: '', gvw: '', umpd: '', uimpd: '',
            additionalInterest: 'No', lossPayeeAddr2: '',
        });
        render();
    }

    function removeVehicle(index) {
        _readForm();
        _exportData.vehicles.splice(index, 1);
        render();
    }

    // ── Add / remove drivers ────────────────────────────────
    function addDriver() {
        _readForm();
        _exportData.drivers.push({
            firstName: '', lastName: '', middleInitial: '', birthDate: '',
            licenseState: '', licenseNumber: '', sex: '', maritalStatus: '',
            occupation: '', relationship: 'Insured', principalOperator: 'No',
            sr22Filing: '', sr22State: '', goodStudent: 'No',
            driverTraining: 'No', defensiveDriver: 'No',
            points: '', excluded: 'No', onlyOperator: 'No', nonDriver: 'No',
            sr22Reason: '', dateLicensed: '', hiredDate: '', cdlDate: '', ssn: '',
        });
        render();
    }

    function removeDriver(index) {
        _readForm();
        _exportData.drivers.splice(index, 1);
        render();
    }

    // ── Add / remove commercial coverages ───────────────────
    function addCoverage() {
        _readForm();
        _exportData.commercial.coverages.push({
            name: '', limits: '', deductible: '',
        });
        render();
    }

    function removeCoverage(index) {
        _readForm();
        _exportData.commercial.coverages.splice(index, 1);
        render();
    }

    // ── Preview & copy ──────────────────────────────────────
    function preview() { _doPreview(); }

    // ── Auto-calc expiration from effective + term ────────
    function updateExpiration() {
        const effEl = document.getElementById('hs_effectiveDate');
        const termEl = document.getElementById('hs_term');
        const expEl = document.getElementById('hs_expirationDate');
        if (effEl && termEl && expEl) {
            const calc = _calcExpiration(effEl.value, termEl.value);
            if (calc) expEl.value = calc;
        }
    }

    function copyPreview() {
        const content = document.getElementById('hs_previewContent');
        if (content) {
            navigator.clipboard.writeText(content.textContent).then(() => {
                _showToast('Copied to clipboard', 'success');
            }).catch(() => {
                _showToast('Copy failed', 'error');
            });
        }
    }

    // ── Public API ──────────────────────────────────────────
    function init() {
        _loadSettings();
        _loadFromIntake();
        render();
    }

    return {
        init,
        render,
        export: _doExport,
        preview,
        copyPreview,
        toggleSection,
        toggleExportType,
        updateExpiration,
        addVehicle,
        removeVehicle,
        addDriver,
        removeDriver,
        addCoverage,
        removeCoverage,
    };
})();
