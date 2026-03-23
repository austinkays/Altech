/**
 * broadform-data.js
 * Data and rule logic for the Broadform / Non-Owner Eligibility Filter.
 * PURE DATA LAYER — no DOM access, no side effects.
 * Update carrier guidelines by editing the `carriers` map and rules.evaluate().
 *
 * Exposes: window.BroadformData
 */
window.BroadformData = (() => {
    'use strict';

    // ── Question definitions ─────────────────────────────────────────────────
    // Each entry drives a rendered question in the UI via ToolComponents.
    const questions = [
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

    // ── Carrier definitions ──────────────────────────────────────────────────
    const carriers = {
        progressive: { key: 'progressive', name: 'Progressive' },
        dairyland:   { key: 'dairyland',   name: 'Dairyland' },
    };

    // ── Rule engine ──────────────────────────────────────────────────────────

    /**
     * Evaluates Broadform eligibility.  Pure function — no side effects.
     *
     * @param {string|null}  state         - 'WA', 'OR', or null (not yet selected)
     * @param {boolean|null} ownedAuto     - true/false/null (not yet answered)
     * @param {boolean|null} regularAccess - true/false/null (not yet answered)
     *
     * @returns {{ outcome: 'hard-stop', message: string }
     *         | { outcome: 'eligible', carriers: Array<{key,name,status,disabled,note}> }
     *         | null}  null means "not enough info to determine eligibility yet"
     */
    function evaluate(state, ownedAuto, regularAccess) {
        // ── Hard stop (checked first — state not required for this decision) ──
        if (ownedAuto === true || regularAccess === true) {
            return {
                outcome: 'hard-stop',
                message: 'Ineligible for Broadform: Applicant must be added as a driver to the vehicle owner\'s policy or needs a standard auto policy.',
            };
        }

        // ── Incomplete — wait for all answers before showing eligibility ──
        if (state === null || ownedAuto === null || regularAccess === null) {
            return null;
        }

        // ── WA: both questions answered No ───────────────────────────────────
        if (state === 'WA') {
            return {
                outcome: 'eligible',
                carriers: [
                    {
                        key:      'progressive',
                        name:     carriers.progressive.name,
                        status:   'ready',
                        disabled: false,
                        note:     null,
                    },
                    {
                        key:      'dairyland',
                        name:     carriers.dairyland.name,
                        status:   'ready',
                        disabled: false,
                        note:     'WA Broadform eligible.',
                    },
                ],
            };
        }

        // ── OR: both questions answered No ───────────────────────────────────
        if (state === 'OR') {
            return {
                outcome: 'eligible',
                carriers: [
                    {
                        key:      'progressive',
                        name:     carriers.progressive.name,
                        status:   'ready',
                        disabled: false,
                        note:     null,
                    },
                    {
                        key:      'dairyland',
                        name:     carriers.dairyland.name,
                        status:   'disabled',
                        disabled: true,
                        note:     'Do not quote. Customer must call Dairyland directly for OR Broadform.',
                    },
                ],
            };
        }

        // Unknown state value — treat as incomplete
        return null;
    }

    return { questions, carriers, rules: { evaluate } };
})();
