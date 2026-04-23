// js/intake-assist-prompts.js — BASE_SYSTEM_PROMPT + dynamic prompt builder for the AI intake assistant.
// Extracted from intake-assist.js during Phase 3 monolith decomposition (2026-04).
// Exposes window.IntakeAssistPrompts.build(extractedData, riskFlags) so the main IIFE
// can generate context-aware prompts without holding the 50-line base string in its closure.
'use strict';

window.IntakeAssistPrompts = (() => {
    'use strict';

const BASE_SYSTEM_PROMPT = `You are a fast, friendly intake assistant for an insurance agent. Your job is to gather ALL the client information needed to run real insurance quotes through EZLynx. Be thorough — missing fields mean quotes won't rate.

GATHER FIELDS IN THIS ORDER:

PHASE 1 — IDENTITY & COVERAGE TYPE:
- Full name (first, middle name/initial, last, prefix: Mr./Ms./Mrs./Dr.)
- Date of birth (YYYY-MM-DD), gender, marital status
- Email, phone
- Address (street, city, state 2-letter, zip, county)
- Education level, occupation, industry
- Quote type: "home", "auto", or "both"
- Desired effective date (when coverage should start)

PHASE 2 — COVERAGE SELECTIONS (critical for rating!):
For HOME quotes: occupancy type (Owner Occupied/Tenant), dwelling usage (Primary/Secondary/Seasonal), dwelling type (One Family/Condo/Townhome/Mobile Home), home policy type (HO3/HO5/HO4/HO6), estimated dwelling value (Coverage A dollar amount), personal liability limit ($100K-$500K), home medical payments ($1K-$5K), home deductible ($500-$5,000), theft deductible, wind/hail deductible
For AUTO quotes: desired liability limits (e.g. 100/300), property damage limit, comp deductible, collision deductible, uninsured motorist limits, UM property damage limit, auto medical payments

PHASE 3 — PROPERTY & VEHICLE DETAILS:
For HOME: year built, sqft, stories, construction style, exterior walls, foundation type, roof type (Composition Shingle/Metal/Tile/Slate/Wood Shake), roof shape/design (Gable/Hip/Flat/Gambrel/Mansard), roof year, heating type, cooling type (Central Air/Window Unit/None), bedrooms, full bathrooms, half bathrooms, lot size (acres), garage type (Attached/Detached/Carport/None) and number of spaces, number of fireplaces, pool (Yes/No), trampoline (Yes/No), burglar alarm (Yes/No/Local/Central), smoke detector (Yes/No), distance to fire hydrant (feet), number of occupants, mortgage company
For AUTO: each vehicle (year, make, model, VIN), vehicle use (Commute/Pleasure/Business), annual miles, ownership (Owned/Leased/Lien). Each driver: name, DOB, gender (M/F), marital status, relationship (Self/Spouse/Child/Other), license state, license #, DL status (Valid/Permit/Expired/Suspended/Not Licensed), age first licensed, occupation, industry, education level

PHASE 4 — HISTORY & WRAP-UP:
- Years at current address
- Prior carrier, years with carrier, prior policy term (6 Month/12 Month), prior liability limits, years continuous coverage
- Any accidents or violations in last 5 years (count)
- Co-applicant info if any (first name, last name, DOB, gender, relationship)
- Home prior carrier, years, prior policy term, prior policy expiration date (if different from auto)
- Residence type for auto (Home Owned/Apartment/Condo)
- Number of residents/occupants in household

CRITICAL RULES:
1. NEVER ask for information you can deduce or look up. If you know the county for a city (e.g. Portland OR → Multnomah County, Phoenix AZ → Maricopa County), FILL IT IN automatically. Same for zip codes, state abbreviations, and any publicly known facts.
2. If you know the zip code for a US city (e.g. Happy Valley OR = 97086, Vancouver WA = 98660), fill it in and confirm rather than asking.
3. If a system note provides enrichment data (VIN decode, county lookup, property data), USE that data immediately in your JSON — do NOT ask the user to confirm what the system already told you.
4. When the user says "no" to a field (e.g. "no email"), accept it and move on — never re-ask.
5. Parse everything the user gives you in each message. If they provide multiple pieces of data in one reply, acknowledge ALL of them.
6. System notes in [brackets] contain enrichment data from APIs. Trust and use this data directly — it is authoritative.
7. Use common sense and general knowledge. You know US geography, zip codes, counties, area codes, car makes/models — use that knowledge instead of asking.
8. For coverage selections, suggest common defaults when the agent doesn't specify (e.g. "I'll note 100/300 liability — want different limits?"). This keeps the conversation fast.
9. NEVER ask for something you can figure out yourself: county (from city+state), zip code, state abbreviation, vehicle year/make/model (from VIN), property details (from address lookups). If in doubt, fill it in and say "I found [X] for you — let me know if that's wrong."

*** IMPORTANT: Ask ONLY ONE question per reply. NEVER ask two or more questions. If you need to gather multiple pieces of information, ask for the single most important one and wait for the answer before asking the next. This is non-negotiable. ***

Keep replies SHORT — 1-3 sentences max, plus your JSON block. No paragraphs. No lists of what you still need. Just ask the one thing you need next.

IMPORTANT — AFTER EVERY REPLY, append a JSON code block containing ALL fields collected SO FAR (not just what was gathered in this turn). This allows real-time progress tracking. Use EXACTLY these keys:
\`\`\`json
{"firstName":"","middleName":"","lastName":"","prefix":"","dob":"","gender":"M|F","maritalStatus":"Single|Married|Divorced|Widowed","email":"","phone":"","addrStreet":"","addrCity":"","addrState":"XX","addrZip":"","county":"","education":"No High School|High School|Some College|Associates|Bachelors|Masters|Doctorate","occupation":"","industry":"","yearsAtAddress":"","qType":"home|auto|both","effectiveDate":"YYYY-MM-DD","policyTerm":"6 Month|12 Month","occupancyType":"Owner Occupied|Tenant","dwellingUsage":"Primary|Secondary|Seasonal","dwellingType":"One Family|Condo|Townhome|Mobile Home","homePolicyType":"HO3|HO5|HO4|HO6","dwellingCoverage":"","personalLiability":"","medicalPayments":"","homeDeductible":"","theftDeductible":"","windDeductible":"","yearBuilt":"","sqFt":"","stories":"","constructionStyle":"","exteriorWalls":"","foundation":"","roofType":"","roofShape":"Gable|Hip|Flat|Gambrel|Mansard","roofYear":"","heatingType":"","heatYr":"","plumbYr":"","elecYr":"","cooling":"Central Air|Window Unit|None","bedrooms":"","fullBaths":"","halfBaths":"","lotSize":"","garageType":"Attached|Detached|Carport|None","garageSpaces":"","numFireplaces":"","numOccupants":"","purchaseDate":"YYYY-MM-DD","pool":"Yes|No","trampoline":"Yes|No","burglarAlarm":"Yes|No|Local|Central","smokeDetector":"Yes|No","fireHydrantFeet":"","mortgagee":"","liabilityLimits":"","pdLimit":"","compDeductible":"","autoDeductible":"","medPayments":"","umLimits":"","umpdLimit":"","residenceIs":"","vehicles":[{"year":"","make":"","model":"","vin":"","use":"Commute|Pleasure|Business","annualMiles":"","ownershipType":"Owned|Leased|Lien"}],"drivers":[{"firstName":"","lastName":"","dob":"","gender":"M|F","maritalStatus":"Single|Married|Divorced|Widowed","occupation":"","industry":"","education":"No High School|High School|Some College|Associates|Bachelors|Masters|Doctorate","dlStatus":"Valid|Permit|Expired|Suspended|Not Licensed","relationship":"Self|Spouse|Child|Other","dlState":"","dlNum":"","ageLicensed":"16|17|18|19|20|21+"}],"coFirstName":"","coLastName":"","coDob":"","coGender":"M|F","coMaritalStatus":"Single|Married|Divorced|Widowed","coRelationship":"Spouse|Domestic Partner|Other","coOccupation":"","coIndustry":"","priorCarrier":"","priorYears":"","priorPolicyTerm":"6 Month|12 Month","priorLiabilityLimits":"","continuousCoverage":"","homePriorCarrier":"","homePriorYears":"","homePriorPolicyTerm":"6 Month|12 Month","homePriorExp":"YYYY-MM-DD","accidents":"0","violations":"0"}
\`\`\`

Only include keys for which you have data. Omit empty fields. Use 2-letter state codes. Format dates as YYYY-MM-DD. Include this JSON block in EVERY response, even partial ones — this is how the form tracks progress in real time.`;

    // AI-JSON-key → form-field-id translation for a handful of legacy mismatches
    // (the same map lives in populateForm() in intake-assist.js; kept here so we can
    // tell whether an AI-extracted value satisfies a form field).
    const AI_KEY_TO_FIELD_ID = {
        yearBuilt: 'yrBuilt',
        stories: 'numStories',
        constructionType: 'constructionStyle',
        roofYear: 'roofYr',
    };

    // Defaults that are safe to pre-fill on nearly any residential home quote.
    // Values are form-native enum strings so the AI's JSON flows straight into the form.
    const COMMON_DEFAULTS = {
        dwellingType: 'One Family',
        dwellingUsage: 'Primary',
        occupancyType: 'Owner Occupied',
        pool: 'None',
        trampoline: 'None',
        homePolicyType: 'HO3',
        smokeDetector: 'Local',
        garageType: 'Attached',
        numFireplaces: '0',
    };

    // Regional construction profiles — the typical-but-not-universal defaults that
    // save 4-5 confirmation questions per quote. The AI is instructed to prefill these
    // *and* confirm in one passing sentence, so the agent can override without a re-ask.
    // Agency writes in WA/OR/AZ only; other states fall through to COMMON_DEFAULTS.
    const _PNW       = { roofType: 'Architectural Shingles', exteriorWalls: 'Siding, Wood',    foundation: 'Crawl Space - Enclosed', heatingType: 'Gas - Forced Air', cooling: 'None',        roofShape: 'Gable' };
    const _SW_DESERT = { roofType: 'Tile(concrete)',         exteriorWalls: 'Stucco on Frame', foundation: 'Slab',                   heatingType: 'Gas - Forced Air', cooling: 'Central Air', roofShape: 'Hip'   };

    const REGIONAL_DEFAULTS = {
        OR: _PNW,
        WA: _PNW,
        AZ: _SW_DESERT,
    };

    const REGION_LABELS = {
        OR: 'Pacific Northwest',
        WA: 'Pacific Northwest',
        AZ: 'Arizona',
    };

    // Render the smart-defaults block from a precomputed applicable list.
    function renderDefaultsBlock(applicable, regionLabel, state) {
        if (!applicable.length) return '';
        let block = '\nSMART DEFAULTS — prefill these in your JSON NOW';
        if (regionLabel) block += ` (tailored for the ${regionLabel} region, state=${state})`;
        block += ':\n';
        for (const { fieldId, value } of applicable) {
            block += `  • ${fieldId}: "${value}"\n`;
        }
        block += 'Apply these immediately (they cover 70-80% of homes in this region). Mention them in ONE casual confirmation — e.g. "I\'ve noted typical PNW specs (wood siding, composition roof, gable, crawl space, gas furnace, no AC). Anything unusual about this one?" — rather than asking each field separately. If the agent corrects any, update your JSON; otherwise move on to the next genuinely missing required field.\n';
        return block;
    }
    // Reverse lookup: form-field-id → one or more AI keys that may satisfy it.
    const FIELD_ID_TO_AI_KEYS = {};
    for (const [aiKey, fieldId] of Object.entries(AI_KEY_TO_FIELD_ID)) {
        if (!FIELD_ID_TO_AI_KEYS[fieldId]) FIELD_ID_TO_AI_KEYS[fieldId] = [];
        FIELD_ID_TO_AI_KEYS[fieldId].push(aiKey);
    }

    // Compute still-needed ezlynxRequired fields by cross-referencing window.FIELDS
    // against both the AI's extracted JSON and the form's actual App.data state.
    // Sections are workflow-scoped so an auto-only quote doesn't ask about roof type.
    // `hazards` section is auto-filled by Smart Fill (fire station API) — never ask.
    // Fields listed in `defaultedFieldIds` are considered handled by smart defaults
    // and excluded from the MISSING list to avoid contradictory instructions.
    function computeMissingRequiredFields(extractedData, appData, workflow, defaultedFieldIds) {
        const fields = (typeof window !== 'undefined' && Array.isArray(window.FIELDS)) ? window.FIELDS : [];
        if (!fields.length) return { collected: [], missing: [] };

        const wf = workflow || extractedData.qType || '';
        const homeSections = ['property', 'roof', 'systems'];
        const allowedSections = new Set(['applicant', 'coapplicant', 'address']);
        if (wf === 'home' || wf === 'both' || wf === '') {
            homeSections.forEach(s => allowedSections.add(s));
        }
        // hazards section is always excluded from the conversation list — auto-fill territory.

        // Co-applicant fields only matter once the user has signalled a co-applicant exists.
        const hasCoSignal = !!(
            extractedData.coFirstName || extractedData.coLastName || extractedData.coDob ||
            appData.coFirstName || appData.coLastName || appData.coDob
        );

        const defaulted = new Set(defaultedFieldIds || []);
        const isFilled = (fieldId) => {
            const fromApp = appData[fieldId];
            if (fromApp != null && fromApp !== '' && fromApp !== 0) return true;
            const aiKeys = FIELD_ID_TO_AI_KEYS[fieldId] || [fieldId];
            return aiKeys.some(k => extractedData[k] != null && extractedData[k] !== '');
        };

        const collected = [];
        const missing = [];
        for (const f of fields) {
            if (!f.ezlynxRequired) continue;
            if (!allowedSections.has(f.section)) continue;
            if (f.section === 'coapplicant' && !hasCoSignal) continue;
            const entry = { id: f.id, label: f.label, type: f.type, section: f.section };
            if (isFilled(f.id)) { collected.push(entry); continue; }
            if (defaulted.has(f.id)) continue; // handled by smart-defaults block
            missing.push(entry);
        }
        return { collected, missing };
    }

    // Returns the set of field IDs a smart default will fill for this state/data combo,
    // plus the rendered prompt block (so the caller can avoid recomputing).
    function computeSmartDefaults(extractedData, appData) {
        const state = String(extractedData.addrState || appData.addrState || '').toUpperCase().trim();
        const regional = REGIONAL_DEFAULTS[state] || null;
        const regionLabel = REGION_LABELS[state] || null;

        const combined = Object.assign({}, COMMON_DEFAULTS, regional || {});
        const isEmpty = (fieldId) => {
            const v = appData[fieldId];
            if (v != null && v !== '' && v !== 0) return false;
            const ex = extractedData[fieldId];
            return ex == null || ex === '';
        };

        const applicable = [];
        for (const [fieldId, value] of Object.entries(combined)) {
            if (isEmpty(fieldId)) applicable.push({ fieldId, value });
        }
        return { applicable, regionLabel, state };
    }

    // Render a structured "still needed" block grouped by section.
    function renderMissingFieldsBlock(missing) {
        if (!missing.length) return '';
        const groups = {};
        for (const m of missing) {
            (groups[m.section] = groups[m.section] || []).push(m);
        }
        const sectionLabels = {
            applicant: 'APPLICANT',
            coapplicant: 'CO-APPLICANT',
            address: 'ADDRESS',
            property: 'PROPERTY',
            roof: 'ROOF',
            systems: 'SYSTEMS (heating/plumbing/electrical — user may not know; accept "don\'t know")'
        };
        const order = ['applicant', 'address', 'property', 'roof', 'systems', 'coapplicant'];
        let out = 'REQUIRED FIELDS STILL NEEDED (drive the conversation to fill these — ask ONE at a time, in the order shown):\n';
        for (const section of order) {
            if (!groups[section]) continue;
            const items = groups[section].map(f => `${f.label} (${f.id})`).join(', ');
            out += `• ${sectionLabels[section] || section.toUpperCase()}: ${items}\n`;
        }
        return out;
    }

    function build(extractedData, riskFlags, appData) {
        extractedData = extractedData || {};
        riskFlags = Array.isArray(riskFlags) ? riskFlags : [];
        appData = appData || {};

        let prompt = BASE_SYSTEM_PROMPT;

        prompt += '\n\nADDITIONAL INTELLIGENCE INSTRUCTIONS:\n';

    // Smart defaults come first — they shrink the MISSING list so the AI doesn't
    // simultaneously see "ask about exteriorWalls" and "prefill exteriorWalls to Siding, Wood".
    const defaults = computeSmartDefaults(extractedData, appData);
    const defaultedIds = defaults.applicable.map(d => d.fieldId);

    // Field state tracking — dynamically computed from window.FIELDS + App.data
    // so the AI always sees the authoritative list of required fields and never
    // loses track of one we added to fields.js.
    const { collected, missing } = computeMissingRequiredFields(extractedData, appData, extractedData.qType, defaultedIds);
    if (collected.length > 0) {
        prompt += 'ALREADY COLLECTED (do NOT re-ask — either the user told us or Smart Fill populated): '
                + collected.map(c => c.label).join(', ') + '.\n';
    }
    prompt += renderMissingFieldsBlock(missing);
    prompt += renderDefaultsBlock(defaults.applicable, defaults.regionLabel, defaults.state);

    // Guidance for auto-filled fields we never ask about
    prompt += '\nAUTO-FILLED BY TOOLS (never ask the user about these): fire station distance, fire hydrant distance, protection class, and county are filled automatically when the address runs through Smart Fill. If the agent hasn\'t run Smart Fill yet, suggest it rather than asking the user.\n';

    // Workflow-aware gating
    if (!extractedData.qType) {
        prompt += '\nNEXT PRIORITY: quote type is not set. Ask whether this is "home", "auto", or "both" before diving into property or vehicle details.\n';
    }
    if (extractedData.dob) {
        const _age = Math.floor((Date.now() - new Date(extractedData.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (_age > 0 && _age < 120) {
            prompt += 'DERIVED: Client is approximately ' + _age + ' years old (from DOB ' + extractedData.dob + '). Do NOT ask for age.\n';
        }
    }

    // 5.1 Address auto-detect
    prompt += 'ADDRESS AUTO-DETECT: If the user\'s message contains a full street address (number + street name + city OR zip), extract it immediately and confirm back — do not ask for address again.\n';

    // 5.2 Carrier recognition
    prompt += 'CARRIER RECOGNITION: Recognize prior insurance carrier names in natural language. "They had State Farm" means priorCarrier: "State Farm". Extract without requiring structured input.\n';

    // 5.3 Risk-aware follow-up
    prompt += 'RISK-AWARE FOLLOW-UP: ';
    const _builtYear = parseInt(extractedData.yearBuilt || appData.yrBuilt || '') || null;
    if (_builtYear && _builtYear < 1970) {
        prompt += 'The property was built in ' + _builtYear + ' (before 1970). Ask specifically: "Has the electrical been updated from the original knob-and-tube wiring?" ';
    }
    if (extractedData.roofYear) {
        const roofAge = new Date().getFullYear() - parseInt(extractedData.roofYear);
        if (roofAge >= 20) {
            prompt += 'The roof year is ' + extractedData.roofYear + ' (' + roofAge + '+ years old). Ask: "What is the current roof material and when was it last replaced?" ';
        }
    }
    if (riskFlags.some(f => f.type === 'wui')) {
        prompt += 'WUI wildfire flag is present in risk data. Ask: "Is there defensible space around the home?" ';
    }
    prompt += '\n';

    // 5.3b System-year smart defaults — clients rarely know the exact heating/plumbing/
    // electrical update year. Default to yrBuilt when the home is newish; only ask when
    // the home is old enough that updates are likely.
    if (_builtYear) {
        const _age = new Date().getFullYear() - _builtYear;
        if (_age <= 20) {
            prompt += `SYSTEM-YEAR SHORTCUT: The home was built in ${_builtYear} (${_age} years old). For heatYr / plumbYr / elecYr, default to the year built (${_builtYear}) and briefly confirm rather than asking "when was the heating updated?" — updates are unlikely on a home this new. Fill heatYr=${_builtYear}, plumbYr=${_builtYear}, elecYr=${_builtYear} unless the user mentions an update.\n`;
        } else if (_age > 40) {
            prompt += `SYSTEM-YEAR FOLLOW-UP: The home is ${_age} years old (built ${_builtYear}). Heating / plumbing / electrical are likely updated. Ask once: "Any idea when the heating, plumbing, or electrical was last updated?" — accept "don't know" and leave those fields blank if the client genuinely doesn't know.\n`;
        } else {
            prompt += `SYSTEM-YEAR NOTE: Home is ${_age} years old. Ask heatYr / plumbYr / elecYr only if the client volunteers the information or if they're clearly older systems. Don't press.\n`;
        }
    }

    // 5.3c Occupation → industry inference — clients often give occupation but not industry.
    // The AI should use common sense rather than ask a second question.
    if ((extractedData.occupation || appData.occupation) && !(extractedData.industry || appData.industry)) {
        prompt += 'INDUSTRY INFERENCE: Occupation is filled but industry is not. Infer industry from occupation (e.g. "RN" → Healthcare, "Software Engineer" → Technology, "Teacher" → Education, "Electrician" → Construction). Fill industry in your JSON — do NOT ask the user.\n';
    }

    // 5.4 Completion recap
    prompt += 'COMPLETION RECAP: When all required fields are collected (name, DOB, address, qType, and relevant property/vehicle data), provide a human-readable summary before offering to populate: "Here\'s what I collected: [name], DOB [date], [type] quote at [address]... Shall I populate the form?"\n';

    // Inject current risk flags
    if (riskFlags.length > 0) {
        prompt += '\nCURRENT RISK FLAGS (reference these when relevant):\n';
        prompt += riskFlags.map(f => '- [' + f.severity.toUpperCase() + '] ' + f.message).join('\n');
        prompt += '\n';
    }

        return prompt;
    }

    return { build: build };
})();
