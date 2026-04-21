// js/app-export.js — Export orchestration (exportText, buildText) + shared scan prompts
// Slimmed during Phase 4: exportPDF/buildPDF → app-export-pdf.js,
// CSV/batch-import → app-export-csv.js, coverage-gap analysis → app-export-coverage-gap.js.
// CMSMTF (HawkSoft tagged-file) export already lives in app-export-cmsmtf.js (Phase 3).
'use strict';

Object.assign(App, {
    exportText() {
        const result = this.buildText(this.data);
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('Text', result.filename);
        this.toast('\u{1F4DD} Text summary downloaded');
    },

    buildText(data) {
        const content = this.getNotesForData(data);
        const fileName = `Insurance_Application_${data.lastName || 'Client'}_${new Date().toISOString().split('T')[0]}.txt`;
        return { content, filename: fileName, mime: 'text/plain;charset=utf-8' };
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
            '"confidence":{"firstName":0.95,"lastName":0.95,"dob":0.8,...},"quality_issues":["Page 2 was partially cut off","Prior carrier name unclear"]}';
    },

    // Shared Gemini scan schema (used by processScan + processScanFromText)
    _getScanSchema() {
        const fieldProps = {
            // Applicant
            prefix: { type: 'string' }, firstName: { type: 'string' }, lastName: { type: 'string' }, suffix: { type: 'string' },
            dob: { type: 'string' }, gender: { type: 'string' }, maritalStatus: { type: 'string' },
            phone: { type: 'string' }, email: { type: 'string' },
            education: { type: 'string' }, occupation: { type: 'string' }, industry: { type: 'string' },
            // Co-Applicant
            coFirstName: { type: 'string' }, coLastName: { type: 'string' },
            coDob: { type: 'string' }, coGender: { type: 'string' }, coEmail: { type: 'string' }, coPhone: { type: 'string' }, coRelationship: { type: 'string' },
            // Address
            addrStreet: { type: 'string' }, addrCity: { type: 'string' },
            addrState: { type: 'string' }, addrZip: { type: 'string' },
            yearsAtAddress: { type: 'string' }, county: { type: 'string' },
            // Property
            dwellingUsage: { type: 'string' }, occupancyType: { type: 'string' },
            yrBuilt: { type: 'string' }, sqFt: { type: 'string' }, dwellingType: { type: 'string' },
            roofType: { type: 'string' }, roofShape: { type: 'string' }, roofYr: { type: 'string' },
            constructionStyle: { type: 'string' },
            numStories: { type: 'string' }, foundation: { type: 'string' },
            exteriorWalls: { type: 'string' }, heatingType: { type: 'string' },
            cooling: { type: 'string' }, heatYr: { type: 'string' },
            plumbYr: { type: 'string' }, elecYr: { type: 'string' },
            sewer: { type: 'string' }, waterSource: { type: 'string' },
            garageType: { type: 'string' }, garageSpaces: { type: 'string' }, lotSize: { type: 'string' },
            numOccupants: { type: 'string' }, bedrooms: { type: 'string' },
            fullBaths: { type: 'string' }, halfBaths: { type: 'string' },
            kitchenQuality: { type: 'string' }, flooring: { type: 'string' },
            numFireplaces: { type: 'string' }, purchaseDate: { type: 'string' },
            pool: { type: 'string' }, trampoline: { type: 'string' }, dogInfo: { type: 'string' },
            businessOnProperty: { type: 'string' }, woodStove: { type: 'string' },
            // Safety & Protection
            burglarAlarm: { type: 'string' }, fireAlarm: { type: 'string' },
            sprinklers: { type: 'string' }, smokeDetector: { type: 'string' },
            fireStationDist: { type: 'string' }, fireHydrantFeet: { type: 'string' }, protectionClass: { type: 'string' },
            // Home Coverage
            homePolicyType: { type: 'string' }, dwellingCoverage: { type: 'string' },
            personalLiability: { type: 'string' }, medicalPayments: { type: 'string' },
            homeDeductible: { type: 'string' }, windDeductible: { type: 'string' }, mortgagee: { type: 'string' },
            // Auto / Vehicles
            vin: { type: 'string' }, vehDesc: { type: 'string' },
            autoPolicyType: { type: 'string' },
            liabilityLimits: { type: 'string' }, pdLimit: { type: 'string' },
            umLimits: { type: 'string' }, uimLimits: { type: 'string' },
            compDeductible: { type: 'string' }, autoDeductible: { type: 'string' },
            medPayments: { type: 'string' },
            rentalDeductible: { type: 'string' }, towingDeductible: { type: 'string' },
            studentGPA: { type: 'string' },
            // Policy / Prior
            policyNumber: { type: 'string' },
            effectiveDate: { type: 'string' }, policyTerm: { type: 'string' },
            priorCarrier: { type: 'string' }, priorExp: { type: 'string' },
            priorPolicyTerm: { type: 'string' }, priorLiabilityLimits: { type: 'string' },
            priorYears: { type: 'string' }, continuousCoverage: { type: 'string' },
            homePriorCarrier: { type: 'string' }, homePriorExp: { type: 'string' },
            homePriorPolicyTerm: { type: 'string' }, homePriorYears: { type: 'string' },
            accidents: { type: 'string' }, violations: { type: 'string' },
            // Additional
            additionalInsureds: { type: 'string' },
            contactTime: { type: 'string' }, referralSource: { type: 'string' },
            additionalVehicles: { type: 'string' }, additionalDrivers: { type: 'string' },
        };
        const confProps = {};
        Object.keys(fieldProps).forEach(k => { confProps[k] = { type: 'number' }; });
        return {
            type: 'object',
            properties: {
                fields: { type: 'object', properties: fieldProps },
                confidence: { type: 'object', properties: confProps },
                quality_issues: { type: 'array', items: { type: 'string' } }
            },
            required: ['fields']
        };
    },
});
