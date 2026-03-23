/**
 * broadform-data.js
 * Data and rule logic for the Carrier Eligibility tool (Broadform + Non-Owners).
 * PURE DATA LAYER — no DOM access, no side effects.
 *
 * Exposes: window.BroadformData
 */
window.BroadformData = (() => {
    'use strict';

    // ── Policy types ─────────────────────────────────────────────────────────
    const policyTypes = [
        { id: 'broadform', label: 'Broadform' },
        { id: 'nonowners', label: 'Non-Owners' },
    ];

    // ── Disqualifier reason messages ─────────────────────────────────────────
    const disqualifierMessages = {
        ownedAuto:     'Applicant has a vehicle in their name — broadform not eligible',
        regularAccess: 'Regular access to a household/borrowed vehicle — should be added to that policy instead',
    };

    // ── Question definitions ─────────────────────────────────────────────────
    const _sharedQuestions = [
        {
            id:     'state',
            type:   'stateDropdown',
            label:  'Select State',
            states: ['WA', 'OR'],
        },
        {
            id:    'ownedAuto',
            type:  'yesNoToggle',
            label: 'Is there a vehicle registered in the applicant\'s name?',
        },
        {
            id:    'regularAccess',
            type:  'yesNoToggle',
            label: 'Does the applicant live with family who has a car, or are they borrowing a friend\'s car long-term?',
        },
    ];

    const questionsByType = {
        broadform: _sharedQuestions,
        nonowners: _sharedQuestions,
    };

    // Backward-compat alias — tests assert BroadformData.questions.toHaveLength(3)
    const questions = questionsByType.broadform;

    // ── Carrier definitions (with per-policy-type, per-state rules) ──────────
    // Each stateRule:
    //   eligible:      true | false | 'referOut'
    //   disqualifiers: string[] — question IDs where answer=true disqualifies
    //   note:          string | undefined — shown on the carrier card
    const carriers = {
        progressive: {
            key:  'progressive',
            name: 'Progressive',
            policyRules: {
                broadform: {
                    stateRules: {
                        WA: { eligible: true, disqualifiers: ['ownedAuto', 'regularAccess'] },
                        OR: { eligible: true, disqualifiers: ['ownedAuto', 'regularAccess'] },
                    },
                },
                nonowners: {
                    stateRules: {
                        WA: { eligible: true },
                        OR: { eligible: true },
                    },
                },
            },
        },
        dairyland: {
            key:  'dairyland',
            name: 'Dairyland',
            policyRules: {
                broadform: {
                    stateRules: {
                        WA: {
                            eligible:      true,
                            disqualifiers: ['ownedAuto', 'regularAccess'],
                            note:          'WA Broadform eligible.',
                        },
                        OR: {
                            eligible: 'referOut',
                            note:     'Do not quote — Oregon Dairyland broadforms must be written directly through Dairyland — we cannot write this in-house.',
                        },
                    },
                },
                nonowners: {
                    stateRules: {
                        WA: { eligible: true },
                        OR: {
                            eligible: 'referOut',
                            note:     'Do not quote — Oregon Dairyland non-owners must be written directly through Dairyland.',
                        },
                    },
                },
            },
        },
    };

    // ── Rule engine ──────────────────────────────────────────────────────────

    /**
     * Evaluates carrier eligibility for the given policy type. Pure function.
     *
     * @param {string|null}  state         - 'WA', 'OR', or null
     * @param {boolean|null} ownedAuto     - true/false/null
     * @param {boolean|null} regularAccess - true/false/null
     * @param {string}       [policyType]  - 'broadform' (default) | 'nonowners'
     *
     * @returns {{ outcome: 'hard-stop', message: string }
     *         | { outcome: 'eligible', carriers: Array<{key,name,status,disabled,note}> }
     *         | null}
     */
    function evaluate(state, ownedAuto, regularAccess, policyType) {
        const type = policyType || 'broadform';

        // ── Broadform hard stop (state not required for this decision) ────────
        if (type === 'broadform' && (ownedAuto === true || regularAccess === true)) {
            return {
                outcome: 'hard-stop',
                message: 'Ineligible for Broadform: Applicant must be added as a driver to the vehicle owner\'s policy or needs a standard auto policy.',
            };
        }

        // ── Incomplete — wait for all answers ─────────────────────────────────
        if (state === null || ownedAuto === null || regularAccess === null) {
            return null;
        }

        // ── Per-carrier data-driven evaluation ────────────────────────────────
        const answers = { ownedAuto, regularAccess };
        const results = [];

        for (const carrier of Object.values(carriers)) {
            const policyRule = carrier.policyRules[type];
            if (!policyRule) continue;

            const rule = policyRule.stateRules[state];
            if (!rule) continue;  // carrier doesn't operate in this state under this policy type

            if (rule.eligible === 'referOut') {
                results.push({
                    key:      carrier.key,
                    name:     carrier.name,
                    status:   'referOut',
                    disabled: true,
                    note:     rule.note || null,
                });
                continue;
            }

            // Check disqualifiers
            const triggered = (rule.disqualifiers || []).find(id => answers[id] === true);
            if (triggered) {
                results.push({
                    key:      carrier.key,
                    name:     carrier.name,
                    status:   'ineligible',
                    disabled: true,
                    note:     disqualifierMessages[triggered] || null,
                });
                continue;
            }

            results.push({
                key:      carrier.key,
                name:     carrier.name,
                status:   'ready',
                disabled: false,
                note:     rule.note || null,
            });
        }

        if (results.length === 0) return null;

        return { outcome: 'eligible', carriers: results };
    }

    return { policyTypes, questionsByType, questions, carriers, rules: { evaluate }, disqualifierMessages };
})();
