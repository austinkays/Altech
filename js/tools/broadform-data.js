/**
 * broadform-data.js
 * Carrier knowledge base + underwriting rule definitions for the Carrier
 * Recommendation Engine (formerly "Broadform Filter").
 *
 * PURE DATA LAYER — no DOM access, no side effects, no AI calls.
 * This file defines:
 *   - Lines of business (broadform, nonowners, home, auto)
 *   - Underwriting variable definitions with UI question metadata
 *   - Carrier rules using declarative operators
 *   - ClientProfile schema for the matching engine
 *
 * Depends on: nothing
 * Exposes:  window.BroadformData
 */
window.BroadformData = (() => {
    'use strict';

    // ── Lines of Business ────────────────────────────────────────────────────
    const linesOfBusiness = [
        { id: 'home',      label: 'Home' },
        { id: 'auto',      label: 'Auto' },
        { id: 'broadform', label: 'Broadform' },
        { id: 'nonowners', label: 'Non-Owners' },
    ];

    // Backward-compat aliases
    const policyTypes = linesOfBusiness;

    // ── Supported States ─────────────────────────────────────────────────────
    const supportedStates = ['WA', 'OR', 'ID'];

    // ── Underwriting Variables ───────────────────────────────────────────────
    // Each variable has: id (= ClientProfile key), label (question text),
    // type (UI widget), appliesTo (which LOBs need it), and optional config.
    //
    // The matching engine iterates carrier rules and uses this list to decide
    // which missing fields to surface in the dynamic questionnaire.
    const underwritingVariables = [
        // ─ Universal ─
        {
            id: 'state', label: 'State', type: 'stateDropdown',
            states: supportedStates, appliesTo: ['home', 'auto', 'broadform', 'nonowners'],
            appDataKey: 'addrState',
        },

        // ─ Broadform / Non-Owners ─
        {
            id: 'ownedAuto', label: 'Is there a vehicle registered in the applicant\'s name?',
            type: 'yesNoToggle', appliesTo: ['broadform', 'nonowners'],
        },
        {
            id: 'regularAccess', label: 'Does the applicant live with family who has a car, or are they borrowing a friend\'s car long-term?',
            type: 'yesNoToggle', appliesTo: ['broadform', 'nonowners'],
        },

        // ─ Home ─
        {
            id: 'roofAge', label: 'Roof age (years)', type: 'number',
            min: 0, max: 100, unit: 'years', appliesTo: ['home'],
            appDataKey: 'roofYr', transform: 'yearsToCurrent',
        },
        {
            id: 'roofType', label: 'Roof material', type: 'select',
            options: ['Composition / Asphalt Shingle', 'Metal', 'Tile', 'Wood Shake', 'Slate', 'Flat / Built-Up', 'Other'],
            appliesTo: ['home'], appDataKey: 'roofType',
        },
        {
            id: 'yearBuilt', label: 'Year built', type: 'number',
            min: 1800, max: 2030, appliesTo: ['home'], appDataKey: 'yrBuilt',
        },
        {
            id: 'dwellingType', label: 'Dwelling type', type: 'select',
            options: ['Single Family', 'Condo / Townhouse', 'Manufactured / Mobile', 'Duplex', 'Triplex', 'Fourplex', 'Other'],
            appliesTo: ['home'], appDataKey: 'dwellingType',
        },
        {
            id: 'hasPool', label: 'Pool on property?', type: 'yesNoToggle',
            appliesTo: ['home'], appDataKey: 'pool', transform: 'yesNoToBool',
        },
        {
            id: 'hasTrampoline', label: 'Trampoline on property?', type: 'yesNoToggle',
            appliesTo: ['home'], appDataKey: 'trampoline', transform: 'yesNoToBool',
        },
        {
            id: 'hasWoodStove', label: 'Wood-burning stove or fireplace insert?', type: 'yesNoToggle',
            appliesTo: ['home'], appDataKey: 'woodStove', transform: 'yesNoToBool',
        },
        {
            id: 'dogBreed', label: 'Dog breed (if any)', type: 'text',
            placeholder: 'e.g. Labrador, Pit Bull, None', appliesTo: ['home'],
            appDataKey: 'dogInfo',
        },
        {
            id: 'protectionClass', label: 'Protection class (1–10)', type: 'number',
            min: 1, max: 10, appliesTo: ['home'], appDataKey: 'protectionClass',
        },
        {
            id: 'priorInsurance', label: 'Has prior home insurance?', type: 'yesNoToggle',
            appliesTo: ['home'], appDataKey: 'homePriorCarrier', transform: 'existsToBool',
        },

        // ─ Auto ─
        {
            id: 'vehicleAge', label: 'Oldest vehicle age (years)', type: 'number',
            min: 0, max: 100, unit: 'years', appliesTo: ['auto'],
            appDataKey: '_vehicles', transform: 'oldestVehicleAge',
        },
        {
            id: 'driverAge', label: 'Youngest driver age', type: 'number',
            min: 15, max: 120, unit: 'years', appliesTo: ['auto'],
            appDataKey: '_drivers', transform: 'youngestDriverAge',
        },
        {
            id: 'numViolations', label: 'Number of violations in last 3 years', type: 'number',
            min: 0, max: 20, appliesTo: ['auto'],
        },
        {
            id: 'hasDUI', label: 'Any DUI/DWI in last 5 years?', type: 'yesNoToggle',
            appliesTo: ['auto'],
        },
        {
            id: 'hasSR22', label: 'SR-22 filing required?', type: 'yesNoToggle',
            appliesTo: ['auto', 'broadform', 'nonowners'],
        },
    ];

    // Index by id for fast lookup
    const variableById = {};
    underwritingVariables.forEach(v => { variableById[v.id] = v; });

    // Backward-compat: old question arrays
    const _broadformQs = underwritingVariables.filter(v => v.appliesTo.includes('broadform'));
    const questionsByType = {
        broadform: _broadformQs,
        nonowners: underwritingVariables.filter(v => v.appliesTo.includes('nonowners')),
        home:      underwritingVariables.filter(v => v.appliesTo.includes('home')),
        auto:      underwritingVariables.filter(v => v.appliesTo.includes('auto')),
    };
    const questions = _broadformQs;

    // ── Restricted Dog Breeds ────────────────────────────────────────────────
    const restrictedDogBreeds = [
        'Pit Bull', 'Pit Bull Terrier', 'American Pit Bull',
        'Staffordshire Terrier', 'American Staffordshire',
        'Rottweiler', 'Doberman', 'Doberman Pinscher',
        'German Shepherd', 'Chow Chow', 'Akita',
        'Wolf Hybrid', 'Wolfdog', 'Presa Canario',
        'Cane Corso', 'Alaskan Malamute',
    ];

    // ── Rule Operators ───────────────────────────────────────────────────────
    // Each operator takes (profileValue, ruleValue) and returns true if PASSES.
    const operators = {
        eq:    (a, b) => a === b,
        neq:   (a, b) => a !== b,
        lt:    (a, b) => Number(a) < Number(b),
        lte:   (a, b) => Number(a) <= Number(b),
        gt:    (a, b) => Number(a) > Number(b),
        gte:   (a, b) => Number(a) >= Number(b),
        in:    (a, b) => Array.isArray(b) && b.some(v => String(v).toLowerCase() === String(a).toLowerCase()),
        notIn: (a, b) => !Array.isArray(b) || !b.some(v => String(v).toLowerCase() === String(a).toLowerCase()),
        notInFuzzy: (a, b) => {
            if (!a || !Array.isArray(b)) return true;
            const haystack = String(a).toLowerCase();
            return !b.some(v => haystack.includes(String(v).toLowerCase()));
        },
    };

    // ── Carrier Definitions ──────────────────────────────────────────────────
    // Each carrier has lines-of-business entries with per-state availability
    // and declarative underwriting rules. Rule operators are defined above.
    //
    // Rule format: { field, op, value, reason }
    //   - field: matches a ClientProfile key (= underwritingVariables id)
    //   - op:    operator key from `operators` above
    //   - value: comparison value
    //   - reason: human-readable disqualification message
    const carriers = [
        // ── Progressive ──────────────────────────────────────────────────────
        {
            key: 'progressive', name: 'Progressive',
            lines: {
                broadform: {
                    states: ['WA', 'OR'],
                    rules: [
                        { field: 'ownedAuto',     op: 'eq', value: false, reason: 'Cannot own a vehicle for broadform coverage' },
                        { field: 'regularAccess', op: 'eq', value: false, reason: 'Cannot have regular access to a household vehicle' },
                    ],
                },
                nonowners: {
                    states: ['WA', 'OR'],
                    rules: [
                        { field: 'ownedAuto', op: 'eq', value: false, reason: 'Cannot own a vehicle for non-owner coverage' },
                    ],
                },
                home: {
                    states: ['WA', 'OR', 'ID'],
                    rules: [
                        { field: 'roofAge',         op: 'lte', value: 30,  reason: 'Roof must be 30 years old or newer' },
                        { field: 'protectionClass', op: 'lte', value: 8,   reason: 'Protection class must be 8 or lower' },
                        { field: 'dogBreed',        op: 'notInFuzzy', value: restrictedDogBreeds, reason: 'Restricted dog breed — excluded from underwriting' },
                        { field: 'yearBuilt',       op: 'gte', value: 1940, reason: 'Home must be built 1940 or later' },
                    ],
                },
                auto: {
                    states: ['WA', 'OR', 'ID'],
                    rules: [
                        { field: 'hasDUI',        op: 'eq',  value: false, reason: 'No DUI/DWI in last 5 years' },
                        { field: 'numViolations', op: 'lte', value: 3,     reason: 'Max 3 violations in last 3 years' },
                    ],
                },
            },
        },

        // ── Dairyland ────────────────────────────────────────────────────────
        {
            key: 'dairyland', name: 'Dairyland',
            lines: {
                broadform: {
                    states: ['WA'],
                    note: 'WA Broadform eligible — competitive rates for non-owner drivers',
                    referOut: { OR: 'Do not quote — Oregon Dairyland broadforms must be written directly through Dairyland.' },
                    rules: [
                        { field: 'ownedAuto',     op: 'eq', value: false, reason: 'Cannot own a vehicle for broadform coverage' },
                        { field: 'regularAccess', op: 'eq', value: false, reason: 'Cannot have regular access to a household vehicle' },
                    ],
                },
                nonowners: {
                    states: ['WA'],
                    referOut: { OR: 'Do not quote — Oregon Dairyland non-owners must be written directly through Dairyland.' },
                    rules: [
                        { field: 'ownedAuto', op: 'eq', value: false, reason: 'Cannot own a vehicle for non-owner coverage' },
                    ],
                },
                auto: {
                    states: ['WA', 'OR'],
                    rules: [
                        { field: 'hasDUI',        op: 'eq',  value: false, reason: 'No DUI/DWI — Dairyland does not write DUI risks' },
                        { field: 'numViolations', op: 'lte', value: 5,     reason: 'Max 5 violations in last 3 years' },
                    ],
                },
            },
        },

        // ── Safeco ───────────────────────────────────────────────────────────
        {
            key: 'safeco', name: 'Safeco',
            lines: {
                home: {
                    states: ['WA', 'OR', 'ID'],
                    rules: [
                        { field: 'roofAge',         op: 'lte', value: 20,  reason: 'Roof must be 20 years old or newer' },
                        { field: 'roofType',        op: 'notIn', value: ['Wood Shake'], reason: 'Wood shake roofs not accepted' },
                        { field: 'protectionClass', op: 'lte', value: 7,   reason: 'Protection class must be 7 or lower' },
                        { field: 'dogBreed',        op: 'notInFuzzy', value: restrictedDogBreeds, reason: 'Restricted dog breed' },
                        { field: 'yearBuilt',       op: 'gte', value: 1950, reason: 'Home must be built 1950 or later' },
                        { field: 'hasTrampoline',   op: 'eq',  value: false, reason: 'Trampolines excluded from Safeco HO' },
                    ],
                },
                auto: {
                    states: ['WA', 'OR', 'ID'],
                    rules: [
                        { field: 'hasDUI',        op: 'eq',  value: false,  reason: 'No DUI/DWI — preferred auto only' },
                        { field: 'numViolations', op: 'lte', value: 2,      reason: 'Max 2 violations in last 3 years' },
                        { field: 'vehicleAge',    op: 'lte', value: 25,     reason: 'Vehicle must be 25 years old or newer' },
                        { field: 'driverAge',     op: 'gte', value: 19,     reason: 'Driver must be 19 or older' },
                    ],
                },
            },
        },

        // ── PEMCO ────────────────────────────────────────────────────────────
        {
            key: 'pemco', name: 'PEMCO',
            lines: {
                home: {
                    states: ['WA'],
                    rules: [
                        { field: 'roofAge',         op: 'lte', value: 25,   reason: 'Roof must be 25 years old or newer' },
                        { field: 'protectionClass', op: 'lte', value: 8,    reason: 'Protection class must be 8 or lower' },
                        { field: 'dogBreed',        op: 'notInFuzzy', value: restrictedDogBreeds, reason: 'Restricted dog breed' },
                        { field: 'priorInsurance',  op: 'eq', value: true,  reason: 'Must have prior home insurance' },
                    ],
                },
                auto: {
                    states: ['WA'],
                    rules: [
                        { field: 'hasDUI',        op: 'eq',  value: false, reason: 'No DUI/DWI in last 5 years' },
                        { field: 'numViolations', op: 'lte', value: 2,     reason: 'Max 2 violations in last 3 years' },
                        { field: 'driverAge',     op: 'gte', value: 16,    reason: 'Driver must be 16 or older' },
                    ],
                },
            },
        },

        // ── National General ─────────────────────────────────────────────────
        {
            key: 'nationalgeneral', name: 'National General',
            lines: {
                auto: {
                    states: ['WA', 'OR', 'ID'],
                    rules: [
                        { field: 'numViolations', op: 'lte', value: 6, reason: 'Max 6 violations in last 3 years' },
                    ],
                    note: 'High-risk auto — accepts DUI and SR-22',
                },
                broadform: {
                    states: ['WA'],
                    rules: [
                        { field: 'ownedAuto',     op: 'eq', value: false, reason: 'Cannot own a vehicle for broadform' },
                        { field: 'regularAccess', op: 'eq', value: false, reason: 'Cannot have regular access to a vehicle' },
                    ],
                },
            },
        },

        // ── Foremost ─────────────────────────────────────────────────────────
        {
            key: 'foremost', name: 'Foremost',
            lines: {
                home: {
                    states: ['WA', 'OR', 'ID'],
                    rules: [
                        { field: 'roofAge',       op: 'lte', value: 25, reason: 'Roof must be 25 years old or newer' },
                        { field: 'dogBreed',      op: 'notInFuzzy', value: restrictedDogBreeds, reason: 'Restricted dog breed' },
                    ],
                    note: 'Accepts manufactured / mobile homes',
                },
            },
        },
    ];

    // Index carriers by key
    const carrierByKey = {};
    carriers.forEach(c => { carrierByKey[c.key] = c; });

    // ── AI System Prompt for Info Dump Parsing ───────────────────────────────
    const aiSystemPrompt = `You are an insurance underwriting data extractor. Given raw client notes, extract ONLY the fields you can confidently identify. Return strict JSON with no commentary.

Fields to extract (use these exact keys):
- "state": 2-letter US state code (e.g. "WA", "OR", "ID")
- "roofAge": number of years since roof was last replaced (integer)
- "roofType": one of "Composition / Asphalt Shingle", "Metal", "Tile", "Wood Shake", "Slate", "Flat / Built-Up", "Other"
- "yearBuilt": 4-digit year the home was built
- "dwellingType": one of "Single Family", "Condo / Townhouse", "Manufactured / Mobile", "Duplex", "Triplex", "Fourplex", "Other"
- "hasPool": boolean — true if property has a pool
- "hasTrampoline": boolean — true if property has a trampoline
- "hasWoodStove": boolean — true if there is a wood stove or fireplace insert
- "dogBreed": string — breed name, or "None" if no dog
- "protectionClass": integer 1-10 (fire protection class)
- "priorInsurance": boolean — true if they have current/recent home insurance
- "vehicleAge": number — age of the oldest vehicle in years
- "driverAge": number — age of the youngest driver
- "numViolations": integer — total moving violations in last 3 years
- "hasDUI": boolean — any DUI/DWI in last 5 years
- "hasSR22": boolean — SR-22 filing required
- "ownedAuto": boolean — applicant has a vehicle titled in their name
- "regularAccess": boolean — regular access to a household member's vehicle

RULES:
1. Omit any field you cannot confidently determine from the text.
2. Return ONLY a JSON object — no markdown, no explanation.
3. For boolean fields, use true/false (not "yes"/"no").
4. For "state", only return a value if a US state is mentioned.
5. If the notes mention a roof replaced "5 years ago", return "roofAge": 5.
6. If notes mention "no dogs" or "no pets", return "dogBreed": "None".

Example input: "Client in Tacoma WA, roof replaced 2019, has a lab mix, no pool, protection class 4"
Example output: {"state":"WA","roofAge":${new Date().getFullYear() - 2019},"dogBreed":"Labrador Mix","hasPool":false,"protectionClass":4}`;

    // ── Legacy evaluate() wrapper for backward compat ────────────────────────
    // Tests and old code may call BroadformData.rules.evaluate(state, owned, access, policyType)
    function evaluate(state, ownedAuto, regularAccess, policyType) {
        const type = policyType || 'broadform';
        if (type === 'broadform' && (ownedAuto === true || regularAccess === true)) {
            return {
                outcome: 'hard-stop',
                message: 'Ineligible for Broadform: Applicant must be added as a driver to the vehicle owner\'s policy or needs a standard auto policy.',
            };
        }
        if (state === null || ownedAuto === null || regularAccess === null) return null;

        const answers = { ownedAuto, regularAccess };
        const results = [];
        for (const carrier of carriers) {
            const lineData = carrier.lines[type];
            if (!lineData) continue;
            if (!lineData.states.includes(state)) {
                if (lineData.referOut && lineData.referOut[state]) {
                    results.push({ key: carrier.key, name: carrier.name, status: 'referOut', disabled: true, note: lineData.referOut[state] });
                }
                continue;
            }
            const triggered = (lineData.rules || []).find(r => {
                if (r.field === 'ownedAuto' || r.field === 'regularAccess') {
                    return answers[r.field] === true && r.value === false;
                }
                return false;
            });
            if (triggered) {
                results.push({ key: carrier.key, name: carrier.name, status: 'ineligible', disabled: true, note: triggered.reason });
                continue;
            }
            results.push({ key: carrier.key, name: carrier.name, status: 'ready', disabled: false, note: lineData.note || null });
        }
        if (results.length === 0) return null;
        return { outcome: 'eligible', carriers: results };
    }

    // ── Disqualifier messages (backward compat) ──────────────────────────────
    const disqualifierMessages = {
        ownedAuto:     'Applicant has a vehicle in their name — broadform not eligible',
        regularAccess: 'Regular access to a household/borrowed vehicle — should be added to that policy instead',
    };

    return {
        linesOfBusiness,
        policyTypes,
        supportedStates,
        underwritingVariables,
        variableById,
        restrictedDogBreeds,
        operators,
        carriers,
        carrierByKey,
        aiSystemPrompt,
        questionsByType,
        questions,
        disqualifierMessages,
        rules: { evaluate },
    };
})();
