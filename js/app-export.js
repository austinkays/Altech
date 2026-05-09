// js/app-export.js — Export orchestration (exportText, buildText) + shared scan prompts
// Slimmed during Phase 4: exportPDF/buildPDF → app-export-pdf.js,
// CSV/batch-import → app-export-csv.js, coverage-gap analysis → app-export-coverage-gap.js.
// CMSMTF (HawkSoft tagged-file) export already lives in app-export-cmsmtf.js (Phase 3).
'use strict';

Object.assign(App, {
    /**
     * Sanitize a string for safe inclusion in a download filename.
     * Strips Windows reserved characters (< > : " | ? * \ /) plus control bytes,
     * collapses whitespace, and trims trailing dots/spaces (Windows rejects them).
     * Falls back to `fallback` if the result is empty.
     */
    _safeFileNamePart(value, fallback = 'Client') {
        const cleaned = String(value == null ? '' : value)
            .replace(/[<>:"|?*\\/]/g, '_')                       // path / reserved
            .replace(/[\u0000-\u001f]/g, '')             // strip control bytes
            .replace(/\s+/g, ' ')
            .replace(/^[\s.]+|[\s.]+$/g, '')              // no leading/trailing dot or space
            .slice(0, 80);                                 // keep filenames sane
        return cleaned || fallback;
    },

    exportText() {
        const result = this.buildText(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('Text', result.filename);
        this.toast('\u{1F4DD} Text summary downloaded');
    },

    buildText(data) {
        const content = this.getNotesForData(data);
        const fileName = `Insurance_Application_${this._safeFileNamePart(data.lastName, 'Client')}_${new Date().toISOString().split('T')[0]}.txt`;
        return { content, filename: fileName, mime: 'text/plain;charset=utf-8' };
    },

    // Build the client JSON the desktop EZLynx filler (python_backend/
    // ezlynx_filler.py) expects. Maps Altech field IDs to the filler's
    // TEXT_FIELD_MAP / dropdown-label keys. The filler handles abbreviation
    // expansion (M→Male, WA→Washington, etc.) so we send raw form values
    // — don't pre-expand them here.
    //
    // Returns a plain object suitable for JSON.stringify. Empty values are
    // included so the filler can skip them via its own `if (!value) continue`
    // gate; that keeps the wire format predictable.
    exportClientJsonForFiller() {
        const d = this.data || {};
        const drivers = Array.isArray(this.drivers) ? this.drivers : [];

        // First driver supplies LicenseNumber + DLState for the applicant page.
        // Per-driver fills happen on EZLynx's drivers page — out of scope for
        // the applicant smoke test, can be added later.
        const driver0 = drivers[0] || {};

        // Date conversion: Altech stores DOB as YYYY-MM-DD (HTML date input
        // native format). EZLynx's date inputs validate against MM/DD/YYYY
        // and silently reject mismatched formats — Playwright .fill() puts
        // the raw string in but Angular Material reverts on blur, leaving
        // any prior value stuck in the field. Convert here so the wire
        // format is what EZLynx actually accepts.
        const toMDY = (iso) => {
            if (!iso) return '';
            const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
        };

        const out = {
            // ── Identity ─────────────────────────────────────────
            FirstName:      d.firstName || '',
            LastName:       d.lastName || '',
            MiddleName:     d.middleName || '',
            DOB:            toMDY(d.dob),
            Email:          d.email || '',
            Phone:          d.phone || '',

            // ── Address ──────────────────────────────────────────
            Address:        d.addrStreet || '',
            City:           d.addrCity || '',
            State:          d.addrState || '',
            County:         d.county || '',
            Zip:            d.addrZip || '',

            // ── Demographics ─────────────────────────────────────
            Gender:         d.gender || '',
            MaritalStatus:  d.maritalStatus || '',
            Education:      d.education || '',
            Occupation:     d.occupation || '',
            Industry:       d.industry || '',
            Prefix:         d.prefix || '',
            Suffix:         d.suffix || '',

            // ── License (from primary driver) ────────────────────
            LicenseNumber:  driver0.dlNum || '',
            DLState:        driver0.dlState || '',
            DLStatus:       driver0.dlStatus || '',

            // ── Drivers Page Phase 1: primary driver only ────────
            // EZLynx's Drivers page populates driver-0 from the
            // applicant info automatically (FirstName/DOB/Gender etc),
            // but these driver-specific fields don't exist on the
            // applicant page and need to flow through here.
            //
            // Multi-driver support (driver-1+) is Phase 2 — needs an
            // "Add Driver" button-click loop in the Python filler that
            // doesn't exist yet. For now the script will fill driver-0
            // from these flat keys and emit a warning if more drivers
            // exist in the array.
            AgeLicensed:      driver0.ageLicensed || '',
            GoodDriver:       driver0.goodDriver || '',
            MatureDriver:     driver0.matureDriver || '',
            // licenseSusRev → LicenseSuspended is a deliberate rename:
            // EZLynx's label is "License Suspended/Revoked" and the
            // Python filler's existing AUTO_DROPDOWN_LABELS uses the
            // shorter "LicenseSuspended" key.
            LicenseSuspended: driver0.licenseSusRev || '',
            // sr22/fr44 store as "Yes"/"No"; filler key uses the
            // ${form}Required suffix matching the EZLynx label.
            SR22Required:     driver0.sr22 || '',
            FR44Required:     driver0.fr44 || '',
            DriverEducation:  driver0.driverEducation || '',
            // Relationship: "Self" for primary, "Spouse"/"Child"/etc.
            // for additional drivers when Phase 2 lands.
            Relationship:     driver0.relationship || '',

            // ── Tenure ───────────────────────────────────────────
            // Altech's intake doesn't collect this yet; once it does,
            // App.data.yearsAtAddress flows straight through.
            YearsAtAddress: d.yearsAtAddress || '',
            MonthsAtAddress: d.monthsAtAddress || '',

            // ── Previous Address ─────────────────────────────────
            // EZLynx renders this section conditionally (often hidden
            // until tenure is short). The Python filler's is_visible
            // check skips fields when the section isn't expanded, so
            // sending values is always safe. If a user's tenure makes
            // EZLynx surface the section, these flow through.
            PreviousAddress: d.previousAddrStreet || '',
            PreviousCity:    d.previousAddrCity || '',
            PreviousState:   d.previousAddrState || '',
            PreviousZip:     d.previousAddrZip || '',

            // ── Auto Policy Info (only relevant on /rating/auto/ pages) ──
            // Filler skips empty values gracefully, so it's safe to
            // include these even when a client isn't being quoted on
            // auto. The Python filler's get_active_dropdowns() loads
            // AUTO_DROPDOWN_LABELS only when the URL path matches.
            EffectiveDate:           toMDY(d.effectiveDate),
            PolicyTerm:              d.policyTerm || '',
            AutoPolicyType:          d.autoPolicyType || '',
            ResidenceIs:             d.residenceIs || '',
            PriorCarrier:            d.priorCarrier || '',
            PriorPolicyTerm:         d.priorPolicyTerm || '',
            PriorYearsWithCarrier:   d.priorYears || '',
            YearsContinuousCoverage: d.continuousCoverage || '',
            // Altech stores creditCheckAuth as a checkbox (boolean).
            // EZLynx expects a Yes/No selection. Convert here so the
            // wire format is what EZLynx accepts.
            CreditCheckAuth:         d.creditCheckAuth === true || d.creditCheckAuth === 'Yes' ? 'Yes'
                                     : d.creditCheckAuth === false || d.creditCheckAuth === 'No' ? 'No'
                                     : (d.creditCheckAuth || ''),
            // Coverage limits — Altech stores BI as a "100/300" combined
            // string in liabilityLimits, PD separately in pdLimit. EZLynx
            // splits them into Bodily Injury and Property Damage dropdowns.
            BodilyInjury:            d.liabilityLimits || '',
            PropertyDamage:          d.pdLimit || '',
            MedPaymentsAuto:         d.medPayments || '',
            UM:                      d.umLimits || '',
            UIM:                     d.uimLimits || '',
            UMPD:                    d.umpdLimit || '',
            Comprehensive:           d.compDeductible || '',
            Collision:               d.autoDeductible || '',
            Towing:                  d.towingDeductible || '',
            RentalReimbursement:     d.rentalDeductible || '',
            StudentGPA:              d.studentGPA || '',

            // ── Auto Tenure / Continuous Coverage ─────────────────
            PriorAutoExpiration:     toMDY(d.priorExp),
            ContinuousMonths:        d.continuousMonths || '',
            PriorMonths:             d.priorMonths || '',
            PriorLiabilityLimits:    d.priorLiabilityLimits || '',
            PriorPolicyStatus:       d.priorPolicyStatus || '',

            // ── Quote-type / Bundle ───────────────────────────────
            // multiPolicy is auto-set by handleType() to 'yes' when both
            // auto and home are quoted. Filler uses this for the EZLynx
            // package-discount checkbox.
            QuoteType:    d.qType || '',
            MultiPolicy:  d.multiPolicy || '',

            // ── Home / Dwelling ───────────────────────────────────
            // EZLynx home rating pages need this block. The filler
            // skips empties (so it's safe to send for auto-only quotes)
            // but when a full HawkSoft-imported client is being exported
            // back to EZLynx, every one of these flows into a labeled
            // field on /rating/home/.
            YearBuilt:           d.yrBuilt || '',
            SquareFootage:       d.sqFt || '',
            DwellingType:        d.dwellingType || '',
            DwellingUsage:       d.dwellingUsage || '',
            OccupancyType:       d.occupancyType || '',
            NumStories:          d.numStories || '',
            NumOccupants:        d.numOccupants || '',
            Bedrooms:            d.bedrooms || '',
            FullBaths:           d.fullBaths || '',
            HalfBaths:           d.halfBaths || '',
            ConstructionStyle:   d.constructionStyle || '',
            ExteriorWalls:       d.exteriorWalls || '',
            Foundation:          d.foundation || '',
            GarageType:          d.garageType || '',
            GarageSpaces:        d.garageSpaces || '',
            RoofType:            d.roofType || '',
            RoofShape:           d.roofShape || '',
            RoofYear:            d.roofYr || '',
            HeatingType:         d.heatingType || '',
            HeatingYear:         d.heatYr || '',
            PlumbingYear:        d.plumbYr || '',
            ElectricalYear:      d.elecYr || '',
            Cooling:             d.cooling || '',
            ProtectionClass:     d.protectionClass || '',
            FireHydrantFeet:     d.fireHydrantFeet || '',
            FireStationDist:     d.fireStationDist || '',
            Pool:                d.pool || '',
            DwellingCoverage:        d.dwellingCoverage || '',
            OtherStructures:         d.otherStructures || '',
            HomePersonalProperty:    d.homePersonalProperty || '',
            HomeLossOfUse:           d.homeLossOfUse || '',
            PersonalLiability:       d.personalLiability || '',
            MedicalPayments:         d.medicalPayments || '',
            HomeDeductible:          d.homeDeductible || '',
            WindDeductible:          d.windDeductible || '',
            EarthquakeCoverage:      d.earthquakeCoverage || '',
            EarthquakeDeductible:    d.earthquakeDeductible || '',
            FloodCoverage:           d.floodCoverage || '',
            HomePolicyType:          d.homePolicyType || '',
            HomeEffectiveDate:       toMDY(d.homeEffectiveDate),
            HomePolicyTerm:          d.homePolicyTerm || '',
            HomePriorCarrier:        d.homePriorCarrier || '',
            HomePriorPolicyTerm:     d.homePriorPolicyTerm || '',
            HomePriorYears:          d.homePriorYears || '',
            HomePriorExp:            toMDY(d.homePriorExp),
            HomePriorLiability:      d.homePriorLiability || '',
            IncreasedReplacementCost: d.increasedReplacementCost || '',
            Mortgagee:               d.mortgagee || '',
            PurchaseDate:            toMDY(d.purchaseDate),

            // ── Co-Applicant ──────────────────────────────────────
            // Populated for couples/spouses imported from HawkSoft. The
            // filler maps these to EZLynx's CoApplicant page; absent
            // values mean the page stays untouched.
            CoFirstName:        d.coFirstName || '',
            CoMiddleName:       d.coMiddleName || '',
            CoLastName:         d.coLastName || '',
            CoPrefix:           d.coPrefix || '',
            CoSuffix:           d.coSuffix || '',
            CoDOB:              toMDY(d.coDob),
            CoGender:           d.coGender || '',
            CoMaritalStatus:    d.coMaritalStatus || '',
            CoRelationship:     d.coRelationship || '',
            CoEmail:            d.coEmail || '',
            CoPhone:            d.coPhone || '',
            CoEducation:        d.coEducation || '',
            CoOccupation:       d.coOccupation || '',
            CoIndustry:         d.coIndustry || '',
        };

        // ── Drivers array — all drivers, not just driver0 ─────────
        // The filler iterates this when EZLynx's Drivers page accepts
        // multi-driver entries. Driver0 fields above remain for back-
        // compat with the Phase-1 single-driver filler.
        out.Drivers = drivers.map(drv => ({
            FirstName:        drv.firstName || '',
            MiddleName:       drv.middleName || '',
            LastName:         drv.lastName || '',
            DOB:              toMDY(drv.dob),
            Gender:           drv.gender || '',
            MaritalStatus:    drv.maritalStatus || '',
            Relationship:     drv.relationship || '',
            Occupation:       drv.occupation || '',
            Education:        drv.education || '',
            Industry:         drv.industry || '',
            LicenseNumber:    drv.dlNum || '',
            DLState:          drv.dlState || '',
            DLStatus:         drv.dlStatus || '',
            AgeLicensed:      drv.ageLicensed || '',
            GoodDriver:       drv.goodDriver || '',
            MatureDriver:     drv.matureDriver || '',
            DriverEducation:  drv.driverEducation || '',
            LicenseSuspended: drv.licenseSusRev || '',
            SR22Required:     drv.sr22 || '',
            FR44Required:     drv.fr44 || '',
            StudentGPA:       drv.studentGPA || '',
            Accidents:        drv.accidents || '',
            Violations:       drv.violations || '',
            IsCoApplicant:    !!drv.isCoApplicant,
            IsPrimaryApplicant: !!drv.isPrimaryApplicant,
        }));

        // ── Vehicles array — all vehicles with use + assignment ───
        const vehicles = Array.isArray(this.vehicles) ? this.vehicles : [];
        out.Vehicles = vehicles.map(v => ({
            VIN:              v.vin || '',
            Year:             v.year || '',
            Make:             v.make || '',
            Model:            v.model || '',
            Use:              v.use || '',
            AnnualMiles:      v.miles || v.annualMiles || '',
            OneWayMiles:      v.oneWayMiles || '',
            Ownership:        v.ownershipType || '',
            AntiTheft:        v.antiTheft || '',
            PassiveRestraints: v.passiveRestraints || '',
            PrimaryDriver:    v.primaryDriver || '',
        }));

        return out;
    },

    // Shared system prompt for policy scan extraction (used by processScan + processScanFromText)
    _getScanSystemPrompt() {
        return 'You are a senior insurance underwriter and document analyst with 20+ years experience reading policies from every major US carrier ' +
            '(State Farm, Allstate, Progressive, GEICO, Farmers, Safeco, Liberty Mutual, Nationwide, USAA, Erie, Travelers, Hartford, Auto-Owners, ' +
            'American Family, Encompass, MetLife, Kemper, Mercury, Bristol West, National General, Foremost, Stillwater, and many others). ' +
            'You have deep expertise in reading Declarations Pages (dec pages), policy jackets, renewal notices, endorsement pages, and binders. ' +
            'You understand that every carrier formats their documents differently — some use tables, some use flowing text, some use numbered sections. ' +
            'You know that the DECLARATIONS PAGE is the most data-rich page and typically contains: named insured, policy number, effective/expiration dates, ' +
            'coverages with limits, deductibles, vehicles with VINs, listed drivers, premium breakdowns, property address, and mortgagee/lienholder info. ' +
            'You can distinguish between AGENT/AGENCY information and INSURED/POLICYHOLDER information — these are different people. ' +
            'The insured is the customer; the agent is the seller. Only extract the INSURED\'s personal info. ' +
            'You understand that "Named Insured", "Policyholder", "Insured", "Primary Insured", and "First Named Insured" all refer to the same person. ' +
            'You know coverage terminology: "BI" = Bodily Injury, "PD" = Property Damage, "UM/UIM" = Uninsured/Underinsured Motorist, ' +
            '"Comp" = Comprehensive, "Coll" = Collision, "Med Pay" = Medical Payments, "PIP" = Personal Injury Protection. ' +
            'For limits shown as "100/300/100" you know this means $100k BI per person / $300k BI per accident / $100k PD. ' +
            'You recognize home policy types: HO-3 (standard homeowner), HO-5 (comprehensive), HO-4 (renter), HO-6 (condo), DP-1/DP-3 (dwelling/landlord). ' +
            'When reading multi-page documents, you extract data from ALL pages and merge/reconcile. If there are conflicts between pages, prefer the dec page. ' +
            'You handle poor quality scans, rotated pages, faxed documents, and partially obscured text by inferring from context when possible. ' +
            '\n\nCRITICAL FORMATTING RULES:\n' +
            '- Return ONLY valid JSON — no markdown fences, no commentary before or after the JSON.\n' +
            '- Use empty strings "" for any data not found. Never use null.\n' +
            '- Normalize ALL dates to YYYY-MM-DD format (e.g., "01/15/2024" → "2024-01-15").\n' +
            '- Normalize currency to plain numbers without $ or commas (e.g., "$1,250" → "1250").\n' +
            '- State abbreviations must be 2-letter codes (e.g., "Washington" → "WA").\n' +
            '- Confidence scores: 0.0 (not found/guessed) to 1.0 (clearly readable). Use 0.5-0.7 for inferred values.\n' +
            '- quality_issues array: list any blurry text, missing pages, ambiguous data, or low-confidence extractions.\n' +
            '\nEXAMPLE OUTPUT STRUCTURE:\n' +
            '{"fields":{"firstName":"John","lastName":"Smith","dob":"1985-03-15","addrStreet":"123 Main St","addrCity":"Seattle","addrState":"WA","addrZip":"98101",...},' +
            '"confidence":{"firstName":0.95,"lastName":0.95,"dob":0.8,...},"quality_issues":["Page 2 was partially cut off","Prior carrier name unclear"]}\n\n' +
            'ALLOWED FIELD KEYS (use ONLY these keys inside "fields" and "confidence" — do not invent new keys, do not abbreviate, match casing exactly):\n' +
            this._getScanFieldKeys().join(', ');
    },

    // Allowlist of field keys the model is expected to populate. Injected into
    // the system prompt instead of being sent as a Gemini response_schema —
    // a schema with this many properties (×2 for confidence) trips Gemini's
    // "too many states for serving" constraint. Must stay in sync with the
    // server-side FIELD_KEYS list in api/policy-scan.js and the consumer
    // categorizers in js/intake-assist.js / js/app-scan.js.
    _getScanFieldKeys() {
        return [
            // Applicant
            'prefix','firstName','lastName','suffix','dob','gender','maritalStatus','phone','email','education','occupation','industry',
            // Co-Applicant
            'coFirstName','coLastName','coDob','coGender','coEmail','coPhone','coRelationship',
            // Address
            'addrStreet','addrCity','addrState','addrZip','yearsAtAddress','county',
            // Property
            'dwellingUsage','occupancyType','yrBuilt','sqFt','dwellingType','roofType','roofShape','roofYr','constructionStyle',
            'numStories','foundation','exteriorWalls','heatingType','cooling','heatYr','plumbYr','elecYr','sewer','waterSource',
            'garageType','garageSpaces','lotSize','numOccupants','bedrooms','fullBaths','halfBaths','kitchenQuality','flooring',
            'numFireplaces','purchaseDate','pool','trampoline','farmingLivestock','dogInfo','businessOnProperty','woodStove',
            // Safety & Protection
            'burglarAlarm','fireAlarm','sprinklers','smokeDetector','fireStationDist','fireHydrantFeet','protectionClass',
            // Home Coverage
            'homePolicyType','dwellingCoverage','personalLiability','medicalPayments','homeDeductible','windDeductible','mortgagee',
            'earthquakeCoverage','earthquakeZone','earthquakeDeductible','floodCoverage','floodBuildingLimit','floodContentsLimit','floodDeductible',
            'jewelryLimit','scheduledItems',
            // Auto / Vehicles
            'vin','vehDesc','autoPolicyType','liabilityLimits','pdLimit','umLimits','uimLimits','compDeductible','autoDeductible',
            'medPayments','rentalDeductible','towingDeductible','studentGPA',
            // Policy / Prior
            'policyNumber','effectiveDate','policyTerm','priorCarrier','priorExp','priorPolicyTerm','priorLiabilityLimits',
            'priorYears','continuousCoverage','homePriorCarrier','homePriorExp','homePriorPolicyTerm','homePriorYears',
            'accidents','violations',
            // Additional
            'additionalInsureds','contactTime','referralSource','additionalVehicles','additionalDrivers',
        ];
    },

    // Returns null so direct Gemini callers + AIProvider skip response_schema.
    // The field-key allowlist is enforced via the system prompt instead — see
    // _getScanFieldKeys() / _getScanSystemPrompt(). Kept as a stub so existing
    // call sites in app-scan.js don't have to change.
    _getScanSchema() {
        return null;
    },
});
