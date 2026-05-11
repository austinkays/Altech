// js/app-export-cmsmtf.js — HawkSoft CMSMTF export (tagged-field format)
// Extracted from app-export.js during Phase 3 monolith decomposition (2026-04)
'use strict';

Object.assign(App, {
    exportCMSMTF() {
        const result = this.buildCMSMTF(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('CMSMTF', result.filename);
        this.toast('\u{1F525} HawkSoft File Generated!');
    },

    buildCMSMTF(data) {
        // HawkSoft Tagged File Format: “fieldname = value” per line
        // Variable names from official HS6_Multico_Tagged_Field_Format templates
        const qType = data.qType || 'both';
        const includeHome = qType === 'home' || qType === 'both';
        const includeAuto = qType === 'auto' || qType === 'both';
        const drivers = this.drivers || [];
        const vehicles = this.vehicles || [];

        function _v(val) {
            if (val === null || val === undefined) return '';
            return String(val).trim();
        }
        function _line(key, val) {
            const v = _v(val);
            return v ? `${key} = ${v}` : '';
        }
        function _dateHS(val) {
            // HawkSoft expects MM/DD/YYYY
            if (!val) return '';
            const d = new Date(val);
            if (Number.isNaN(d.getTime())) return _v(val);
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            const yyyy = String(d.getUTCFullYear());
            return `${mm}/${dd}/${yyyy}`;
        }
        function _genderHS(val) {
            // drv_sSex accepts M or F per official template
            if (!val) return '';
            const v = _v(val).toUpperCase();
            if (v === 'M' || v === 'MALE') return 'M';
            if (v === 'F' || v === 'FEMALE') return 'F';
            return _v(val);
        }

        // Determine LOB code and policy type
        const lobCode = includeHome && includeAuto ? 'HOME' : includeHome ? 'HOME' : 'AUTOP';
        const policyType = includeHome ? 'HOME' : 'AUTO';
        const policyTitle = includeHome && includeAuto ? 'Home & Auto'
            : includeHome ? 'Homeowners' : 'Personal Auto';

        const lines = [];

        // ── Client Information (gen_*) ──
        lines.push(_line('gen_sCustType', 'Personal'));
        lines.push(_line('gen_sLastName', data.lastName));
        lines.push(_line('gen_sFirstName', data.firstName));
        lines.push(_line('gen_cInitial', (data.middleName || '').charAt(0)));
        lines.push(_line('gen_sAddress1', data.addrStreet));
        lines.push(_line('gen_sCity', data.addrCity));
        lines.push(_line('gen_sState', data.addrState));
        lines.push(_line('gen_sZip', data.addrZip));
        lines.push(_line('gen_sPhone', data.phone));
        lines.push(_line('gen_sCellPhone', data.phone));
        lines.push(_line('gen_sEmail', data.email));
        lines.push(_line('gen_sClientSource', data.referralSource));

        // ── Client Misc Data (unmapped personal fields → gen_sClientMiscData[x]) ──
        const misc = [];
        if (data.dob) misc.push(`DOB: ${_dateHS(data.dob)}`);
        if (data.gender) misc.push(`Gender: ${_genderHS(data.gender)}`);
        if (data.maritalStatus) misc.push(`Marital Status: ${data.maritalStatus}`);
        if (data.education) misc.push(`Education: ${data.education}`);
        if (data.industry) misc.push(`Industry: ${data.industry}`);
        if (data.occupation) misc.push(`Occupation: ${data.occupation}`);
        if (data.prefix) misc.push(`Prefix: ${data.prefix}`);
        if (data.suffix) misc.push(`Suffix: ${data.suffix}`);
        // Co-applicant info in misc if present
        if (data.hasCoApplicant === 'yes' && (data.coFirstName || data.coLastName)) {
            const _coNameParts = [data.coPrefix, data.coFirstName, data.coLastName, data.coSuffix].map(_v).filter(Boolean);
            misc.push(`Co-Applicant: ${_coNameParts.join(' ')}`);
            if (data.coPrefix) misc.push(`Co-App Prefix: ${data.coPrefix}`);
            if (data.coSuffix) misc.push(`Co-App Suffix: ${data.coSuffix}`);
            if (data.coDob) misc.push(`Co-App DOB: ${_dateHS(data.coDob)}`);
            if (data.coGender) misc.push(`Co-App Gender: ${_genderHS(data.coGender)}`);
            if (data.coRelationship) misc.push(`Co-App Relationship: ${data.coRelationship}`);
            if (data.coEmail) misc.push(`Co-App Email: ${data.coEmail}`);
            if (data.coPhone) misc.push(`Co-App Phone: ${data.coPhone}`);
            if (data.coOccupation) misc.push(`Co-App Occupation: ${data.coOccupation}`);
            if (data.coMaritalStatus) misc.push(`Co-App Marital: ${data.coMaritalStatus}`);
        }
        if (data.contactTime) misc.push(`Best Contact Time: ${data.contactTime}`);
        if (data.contactMethod) misc.push(`Contact Method: ${data.contactMethod}`);
        if (data.tcpaConsent) misc.push('TCPA Consent: Yes');
        if (data.creditCheckAuth) misc.push('Credit Check Authorized: Yes');
        // Prior insurance details not captured in direct fields
        if (data.continuousCoverage) misc.push(`Continuous Coverage: ${data.continuousCoverage}`);
        if (data.priorLiabilityLimits) misc.push(`Prior Liability Limits: ${data.priorLiabilityLimits}`);
        if (data.priorPolicyTerm) misc.push(`Prior Policy Term: ${data.priorPolicyTerm}`);
        if (data.priorExp) misc.push(`Prior Expiration: ${_dateHS(data.priorExp)}`);
        if (data.yearsAtAddress) misc.push(`Years at Address: ${data.yearsAtAddress}`);

        // Write misc data across three banks (0-9 each)
        for (let i = 0; i < misc.length && i < 10; i++) {
            lines.push(_line(`gen_sClientMiscData[${i}]`, misc[i]));
        }
        for (let i = 10; i < misc.length && i < 20; i++) {
            lines.push(_line(`gen_sClientMisc2Data[${i - 10}]`, misc[i]));
        }
        for (let i = 20; i < misc.length && i < 30; i++) {
            lines.push(_line(`gen_sClientMisc3Data[${i - 20}]`, misc[i]));
        }

        // ── Policy Information ──
        lines.push(_line('gen_sCMSPolicyType', policyType));
        lines.push(_line('gen_sApplicationType', 'Personal'));
        lines.push(_line('gen_sPolicyTitle', policyTitle));
        lines.push(_line('gen_sLOBCode', lobCode));
        lines.push(_line('gen_tEffectiveDate', data.effectiveDate ? _dateHS(data.effectiveDate) : '(today)'));
        lines.push(_line('gen_sLeadSource', data.referralSource));
        lines.push(_line('gen_nTerm', data.policyTerm));
        // gen_nClientStatus and gen_sStatus should be used exclusively (not both)
        lines.push(_line('gen_nClientStatus', 'Prospect'));

        // gen_sForm is required even if blank to distinguish Auto from Home
        if (includeHome) {
            lines.push(_line('gen_sForm', data.homePolicyType || 'HO3'));
        } else if (includeAuto) {
            lines.push(_line('gen_sForm', data.autoPolicyType || 'Standard'));
        }

        // ── Garaging / Property Address ──
        const gAddr = data.primaryHomeAddr || data.addrStreet;
        const gCity = data.primaryHomeCity || data.addrCity;
        const gState = data.primaryHomeState || data.addrState;
        const gZip = data.primaryHomeZip || data.addrZip;
        lines.push(_line('gen_sGAddress', gAddr));
        lines.push(_line('gen_sGCity', gCity));
        lines.push(_line('gen_sGState', gState));
        lines.push(_line('gen_sGZip', gZip));
        lines.push(_line('gen_sCounty', data.county));

        // ── Home/Property Fields (when quoting home) ──
        if (includeHome) {
            lines.push(_line('gen_sProtectionClass', data.protectionClass));
            lines.push(_line('gen_nYearBuilt', data.yrBuilt));
            lines.push(_line('gen_sConstruction', data.constructionStyle));
            lines.push(_line('gen_sBurgAlarm', data.burglarAlarm));
            lines.push(_line('gen_sFireAlarm', data.fireAlarm || data.smokeDetector));
            lines.push(_line('gen_sSprinkler', data.sprinklers));
            lines.push(_line('gen_bDeadBolt', data.deadbolt === 'Yes' ? 'Y' : ''));
            lines.push(_line('gen_bFireExtinguisher', data.fireExtinguisher === 'Yes' ? 'Y' : ''));

            // Coverage A-D
            lines.push(_line('gen_lCovA', data.dwellingCoverage));
            lines.push(_line('gen_lCovB', data.otherStructures));
            lines.push(_line('gen_lCovC', data.homePersonalProperty));
            lines.push(_line('gen_lCovD', data.homeLossOfUse));
            lines.push(_line('gen_sLiability', data.personalLiability));
            lines.push(_line('gen_sMedical', data.medicalPayments));
            lines.push(_line('gen_sDeduct', data.homeDeductible));

            // Endorsements
            lines.push(_line('gen_bEarthquake', data.earthquakeCoverage === 'Yes' ? 'Y' : ''));
            lines.push(_line('gen_sEQDeduct', data.earthquakeDeductible));
            lines.push(_line('gen_lOrdinanceOrLawIncr', data.ordinanceOrLaw));
            lines.push(_line('gen_lJewelry', data.jewelryLimit));
            lines.push(_line('gen_nAdditionalRes', data.increasedReplacementCost));

            // Multi-policy credit (home + auto bundle)
            if (includeAuto) {
                lines.push(_line('gen_bMultiPolicy', 'Y'));
            }

            // Mortgagee / Lienholder
            if (data.mortgagee) {
                lines.push(_line('gen_sLPType1', 'Mortgagee'));
                lines.push(_line('gen_sLpName1', data.mortgagee));
            }

            // Territory (use zip code)
            lines.push(_line('hpm_sTerritory', data.addrZip));
            if (data.earthquakeZone) {
                lines.push(_line('hpm_sEarthquakeZone', data.earthquakeZone));
            }
        }

        // ── Auto Coverage (when quoting auto) ──
        if (includeAuto) {
            lines.push(_line('gen_sBi', data.liabilityLimits));
            lines.push(_line('gen_sPd', data.pdLimit));
            lines.push(_line('gen_sUmBi', data.umLimits));
            lines.push(_line('gen_sUimBi', data.uimLimits));
            lines.push(_line('gen_sUmPd', data.umpdLimit));
            lines.push(_line('gen_sMedical', data.medPayments));
            lines.push(_line('gen_sTypeOfPolicy', data.autoPolicyType));

            // ── Vehicles (veh_*[index]) ──
            vehicles.forEach((veh, i) => {
                lines.push(_line(`veh_sYr[${i}]`, veh.year));
                lines.push(_line(`veh_sMake[${i}]`, veh.make));
                lines.push(_line(`veh_sModel[${i}]`, veh.model));
                lines.push(_line(`veh_sVIN[${i}]`, veh.vin));
                lines.push(_line(`veh_sUse[${i}]`, veh.use));
                lines.push(_line(`veh_lMileage[${i}]`, veh.miles));
                lines.push(_line(`veh_sComp[${i}]`, data.compDeductible));
                lines.push(_line(`veh_sColl[${i}]`, data.autoDeductible));
                lines.push(_line(`veh_sTowing[${i}]`, data.towingDeductible));
                lines.push(_line(`veh_sRentRemb[${i}]`, data.rentalDeductible));
                lines.push(_line(`veh_sGaragingZip[${i}]`, gZip));
                // Link to primary driver (1-based index)
                const driverIdx = drivers.findIndex(d => d.id === veh.primaryDriver);
                if (driverIdx >= 0) lines.push(_line(`veh_nDriver[${i}]`, driverIdx + 1));
            });

            // ── Drivers (drv_*[index]) ──
            drivers.forEach((drv, i) => {
                lines.push(_line(`drv_sFirstName[${i}]`, drv.firstName));
                lines.push(_line(`drv_sLastName[${i}]`, drv.lastName));
                lines.push(_line(`drv_tBirthDate[${i}]`, _dateHS(drv.dob)));
                lines.push(_line(`drv_sLicenseNum[${i}]`, drv.dlNum));
                lines.push(_line(`drv_sLicensingState[${i}]`, drv.dlState));
                lines.push(_line(`drv_sSex[${i}]`, _genderHS(drv.gender)));
                lines.push(_line(`drv_sMaritalStatus[${i}]`, drv.maritalStatus));
                lines.push(_line(`drv_sDriversOccupation[${i}]`, drv.occupation));
                lines.push(_line(`drv_sRelationship[${i}]`, drv.relationship));
                if (drv.isPrimaryApplicant) lines.push(_line(`drv_bPrincipleOperator[${i}]`, 'Yes'));
                if (drv.accidents) lines.push(_line(`drv_nPoints[${i}]`, drv.accidents));
                if (drv.studentGPA) lines.push(_line(`drv_bGoodStudent[${i}]`, 'Yes'));
            });
        }

        // ── Prior Insurance ──
        if (includeAuto && data.priorCarrier) {
            lines.push(_line('gen_sFSCNotes', `Prior Auto: ${data.priorCarrier}` +
                (data.priorYears ? `, ${data.priorYears} yrs` : '') +
                (data.priorExp ? `, exp ${_dateHS(data.priorExp)}` : '')));
        }
        if (includeHome && (data.homePriorCarrier || data.priorCarrier)) {
            const carrier = data.homePriorCarrier || data.priorCarrier;
            const years = data.homePriorYears || data.priorYears;
            const existing = lines.find(l => l.startsWith('gen_sFSCNotes'));
            if (existing) {
                const idx = lines.indexOf(existing);
                lines[idx] = existing + ` | Prior Home: ${carrier}` + (years ? `, ${years} yrs` : '');
            } else {
                lines.push(_line('gen_sFSCNotes', `Prior Home: ${carrier}` + (years ? `, ${years} yrs` : '')));
            }
        }

        // ── Comprehensive Client Notes ──
        const notesParts = [];
        notesParts.push(`Quote Type: ${policyTitle}`);
        if (data.dob) notesParts.push(`DOB: ${_dateHS(data.dob)}`);
        if (data.maritalStatus) notesParts.push(`Marital: ${data.maritalStatus}`);
        if (data.occupation) notesParts.push(`Occupation: ${data.occupation}`);

        if (includeHome) {
            const homeParts = [];
            if (data.dwellingType) homeParts.push(`Type: ${data.dwellingType}`);
            if (data.dwellingUsage) homeParts.push(`Usage: ${data.dwellingUsage}`);
            if (data.yrBuilt) homeParts.push(`Built: ${data.yrBuilt}`);
            if (data.sqFt) homeParts.push(`${data.sqFt} sqft`);
            if (data.numStories) homeParts.push(`${data.numStories} stories`);
            if (data.fullBaths) homeParts.push(`${data.fullBaths} baths`);
            if (data.exteriorWalls) homeParts.push(`Walls: ${data.exteriorWalls}`);
            if (data.foundation) homeParts.push(`Foundation: ${data.foundation}`);
            if (data.roofType) homeParts.push(`Roof: ${data.roofType}`);
            if (data.roofYr) homeParts.push(`Roof Yr: ${data.roofYr}`);
            if (data.roofShape) homeParts.push(`Roof Shape: ${data.roofShape}`);
            if (data.heatingType) homeParts.push(`Heat: ${data.heatingType}`);
            if (data.cooling) homeParts.push(`Cool: ${data.cooling}`);
            if (data.heatYr) homeParts.push(`Heat Yr: ${data.heatYr}`);
            if (data.plumbYr) homeParts.push(`Plumb Yr: ${data.plumbYr}`);
            if (data.elecYr) homeParts.push(`Elec Yr: ${data.elecYr}`);
            if (data.pool && data.pool !== 'None') homeParts.push(`Pool: ${data.pool}`);
            if (data.trampoline && data.trampoline !== 'No') homeParts.push(`Trampoline: ${data.trampoline}`);
            if (data.woodStove && data.woodStove !== 'None') homeParts.push(`Wood Stove: ${data.woodStove}`);
            if (data.dogInfo) homeParts.push(`Dogs: ${data.dogInfo}`);
            if (data.businessOnProperty && data.businessOnProperty !== 'No') homeParts.push(`Business on Property: ${data.businessOnProperty}`);
            if (data.windDeductible) homeParts.push(`Wind Ded: ${data.windDeductible}`);
            if (data.waterBackup && data.waterBackup !== 'No') homeParts.push(`Water Backup: ${data.waterBackup}`);
            if (data.animalLiability && data.animalLiability !== 'No') homeParts.push(`Animal Liability: ${data.animalLiability}`);
            if (data.equipmentBreakdown && data.equipmentBreakdown !== 'No') homeParts.push(`Equip Breakdown: ${data.equipmentBreakdown}`);
            if (data.serviceLine && data.serviceLine !== 'No') homeParts.push(`Service Line: ${data.serviceLine}`);
            if (data.garageType) homeParts.push(`Garage: ${data.garageType} (${data.garageSpaces || '?'} spaces)`);
            if (homeParts.length) notesParts.push(`HOME: ${homeParts.join(', ')}`);
        }

        if (includeAuto && vehicles.length) {
            notesParts.push(`VEHICLES: ${vehicles.map((v, i) => `${i + 1}) ${v.year || ''} ${v.make || ''} ${v.model || ''} VIN:${v.vin || 'N/A'}`).join('; ')}`);
        }
        if (data.additionalInsureds) notesParts.push(`Additional Insureds: ${data.additionalInsureds}`);
        if (data.pdfNotes) notesParts.push(`Notes: ${data.pdfNotes}`);

        // HawkSoft caps the client-notes field — long log dumps from a session
        // can blow past it and corrupt the import. 2KB is the documented limit;
        // truncate with an ellipsis marker so the producer notices.
        const NOTES_CAP = 2048;
        let notes = notesParts.join(' | ');
        if (notes.length > NOTES_CAP) notes = notes.slice(0, NOTES_CAP - 1) + '…';
        lines.push(_line('gen_sClientNotes', notes));

        // Filter empty lines and join with CRLF — HawkSoft's tagged-file
        // importer expects DOS line endings; LF-only files silently fail
        // on the first line break.
        const content = lines.filter(l => l).join('\r\n');

        const safeName = App._safeFileNamePart(data.lastName, 'Export');
        return { content, filename: `Lead_${safeName}.cmsmtf`, mime: 'text/plain;charset=utf-8' };
    },
});
