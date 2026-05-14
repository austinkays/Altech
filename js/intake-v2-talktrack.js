// intake-v2-talktrack.js — Conversation prompts that surface in the right rail.
//
// Declarative rule table — runs after each save (intake-v2-core schedulePush).
// Each rule has:
//   - when(data, ctx)  → boolean: should we suggest this right now?
//   - render(data, ctx) → HTML to show in the talk-track panel
//   - id              : dedupe key
//
// No AI — scripted suggestions only. Adding a new prompt is one entry.
//
// Render output is HTML (already escaped via Utils.escapeHTML). Renderers
// should keep prompts short and quotable so the agent can paraphrase.

'use strict';

(function () {

const esc = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s)) : String(s);

function quote(text) { return `<div class="iv2-talk-quote">"${esc(text)}"</div>`; }

// Each rule now carries a `tags` array describing which section / card the
// prompt is relevant to. `computeSuggestions()` reads a `ctx.scope` and
// promotes rules whose tags include the current scope so the agent sees
// task-relevant prompts at the top — pre-fix, an agent typing in the Auto
// card saw boat-specific or affinity prompts ahead of the auto-specific
// ones, which read as generic / out-of-context noise.
//
// Tag vocabulary:
//   global    — always relevant regardless of focus (TCPA, history, etc.)
//   quick     — Quick Start / applicant info
//   household — Household & Operators section
//   home      — Home product card
//   auto      — Auto product card
//   boat      — Boat product card
//   rv        — RV product card
//   coverage  — Coverage / Prior Insurance section
//   history   — Loss & Violation History section
const RULES = [
    // ── Opening — applicant intake ────────────────────────────────────────
    {
        id: 'name-spell',
        tags: ['quick', 'global'],
        when: (d) => d.applicant.firstName && !d.applicant._phoneticChecked,
        render: () => `Confirm name pronunciation. ${quote("Just to make sure I have this right, is it spelled like…")}`,
    },
    {
        id: 'tcpa-consent',
        tags: ['quick', 'household', 'global'],
        when: (d) => d.applicant.phone && !d.household.tcpaConsent,
        render: () => `Capture TCPA consent. ${quote("Do you consent to receive calls and texts about this quote?")}`,
    },
    {
        id: 'credit-pull',
        tags: ['quick', 'global'],
        when: (d) => d.applicant.dob && !d.household.creditCheckAuth && !d.applicant.ssn,
        render: () => `Get permission for the credit pull (improves rate). ${quote("To get you the best rate, can I pull a soft insurance score?")}`,
    },

    // ── Operator pool ─────────────────────────────────────────────────────
    {
        id: 'household-others',
        tags: ['household'],
        when: (d) => d.operators.length === 1 && (d.autos.length > 0 || d.boats.length > 0 || d.rvs.length > 0),
        render: () => `Ask about other household drivers/operators. ${quote("Who else in the household drives these vehicles, even occasionally?")}`,
    },
    {
        id: 'teen-driver',
        tags: ['household', 'auto'],
        when: (d) => d.operators.some(op => {
            if (!op.dob) return false;
            const age = ageFromDob(op.dob);
            return age > 0 && age < 25;
        }) && !d.discounts.safetyCourse.auto,
        render: () => `Young driver detected — ask about defensive-driver course or good-student discount.`,
    },

    // ── Boat-specific prompts ─────────────────────────────────────────────
    {
        id: 'boat-safety-course',
        tags: ['boat'],
        when: (d) => d.boats.length > 0 && !d.discounts.safetyCourse.boat,
        render: () => `Ask about boater safety course. ${quote("Have you completed a USCG-approved boater safety course? It often saves 5-10%.")}`,
    },
    {
        id: 'boat-marine-survey',
        tags: ['boat'],
        when: (d) => d.boats.some(b => {
            const age = b.year ? (new Date().getFullYear() - Number(b.year)) : 0;
            return (age > 15 && Number(b.length) > 30) || (b.hullMaterial === 'Wood' && age > 5);
        }),
        render: () => `Safeco requires a marine survey for this boat (older or wood hull). Note in follow-up.`,
    },
    {
        id: 'boat-photos-old',
        tags: ['boat'],
        // The two `some()`s used to be separate, which let the rule fire when
        // boat A was old/valuable AND boat B was missing photos — wrong target.
        // Both conditions must hold for the SAME boat.
        when: (d) => d.boats.some(b => {
            const age = b.year ? (new Date().getFullYear() - Number(b.year)) : 0;
            return age > 30
                && Number(b.marketValue) > 30000
                && !(b.docs && b.docs.photos);
        }),
        render: () => `Travelers requires bilge / running gear / engine / exterior photos for boats > 30 yrs valued > $30k.`,
    },
    {
        id: 'boat-hin-defer',
        tags: ['boat'],
        when: (d) => d.boats.length > 0
                  && d.boats.some(b => !b.hin)
                  && !(d.deferred || []).some(p => /^boats#.+\.hin$/.test(p)),
        render: () => `If the client doesn't have the HIN handy, press <kbd>Alt+L</kbd> in the HIN field to defer — won't block the quote.`,
    },

    // ── RV-specific prompts ───────────────────────────────────────────────
    {
        id: 'rv-fulltimer',
        tags: ['rv'],
        // Old check `!('fullTimer' in r)` literally never fired — the default
        // RV always has `fullTimer: false`, so `in` is always true. Now fires
        // when an RV is partially-filled (year present) but the agent hasn't
        // checked the full-timer box. Retires once `fullTimer === true` OR
        // once the agent has finished entering the RV (year + length both set
        // and full-timer = false, meaning they answered "no" implicitly).
        when: (d) => d.rvs.some(r => r.year && !r.length && !r.fullTimer),
        render: () => `Ask about full-time use. ${quote("Do you live in this RV full-time, even part of the year?")} — drives rate significantly.`,
    },
    {
        id: 'rv-tlr',
        tags: ['rv'],
        when: (d) => d.rvs.some(r => {
            const age = r.year ? (new Date().getFullYear() - Number(r.year)) : 99;
            return age <= 1 && !r.totalLossReplacementRequested;
        }),
        render: () => `New RV detected — offer Total Loss Replacement (covers full purchase price including tax/fees in first 5 yrs).`,
    },

    // ── Home prompts ──────────────────────────────────────────────────────
    {
        id: 'home-roof-old',
        tags: ['home'],
        when: (d) => d.homes.some(h => h.roof && h.roof.yr && (new Date().getFullYear() - Number(h.roof.yr)) > 20),
        render: () => `Roof is > 20 yrs old — may face higher deductible or carrier restrictions. Confirm condition.`,
    },
    {
        id: 'home-multipolicy',
        tags: ['home', 'auto'],
        when: (d) => d.homes.length > 0 && d.autos.length > 0 && !d.discounts.homeowner,
        render: () => `Home + Auto qualifies for multi-policy discount across all four carriers.`,
    },

    // ── Affinity / discount cross-sells ───────────────────────────────────
    {
        id: 'usaa-eligibility',
        tags: ['household', 'auto', 'global'],
        when: (d) => !d.discounts.affinity.usaa
            && (/military|veteran|navy|army|marine|air force|coast guard/i.test([d.applicant.occupation, d.applicant.industry].join(' '))),
        render: () => `Military connection detected — ask about USAA eligibility.`,
    },
    {
        id: 'uscg-aux-boat',
        tags: ['boat'],
        when: (d) => d.boats.length > 0 && !d.discounts.affinity.uscgAux,
        render: () => `Ask about US Coast Guard Auxiliary membership — discount on boat coverage.`,
    },
    {
        id: 'usps-boat',
        tags: ['boat'],
        when: (d) => d.boats.length > 0 && !d.discounts.affinity.usps,
        render: () => `Ask about US Power Squadron membership — discount on boat coverage.`,
    },
    {
        id: 'hog-rv',
        tags: ['rv'],
        when: (d) => d.rvs.length > 0 && !d.discounts.affinity.hog,
        render: () => `Ask about Harley Owners Group / similar membership if applicable.`,
    },

    // ── History prompts ───────────────────────────────────────────────────
    {
        id: 'history-default',
        tags: ['history', 'global'],
        when: (d) => d.operators.length > 0 && !d.history.hasCleanHistory && d.history.losses.length === 0 && d.history.violations.length === 0,
        render: () => `Ask the standard history question. ${quote("In the last 3 years, has anyone listed had a ticket, accident, or claim?")}<br><br>If no → toggle "No incidents in 35 months" in the History section.`,
    },

    // ── Prior insurance ───────────────────────────────────────────────────
    {
        id: 'continuous-coverage',
        tags: ['coverage', 'global'],
        when: (d) => (d.autos.length > 0 || d.homes.length > 0) && !d.priorInsurance.continuous,
        render: () => `Confirm continuous coverage. ${quote("Have you had insurance continuously for the last 12 months?")}`,
    },
];

function ageFromDob(dob) {
    // Delegate to the timezone-safe helper in intake-v2-core.js. The local
    // implementation had the same UTC-midnight bug as operators.js#ageOf —
    // could return the wrong age in negative-UTC locales on edge dates.
    if (window.IntakeV2 && typeof window.IntakeV2._ageFromDob === 'function') {
        return window.IntakeV2._ageFromDob(dob);
    }
    return 0;
}

function computeSuggestions(data, ctx) {
    const focused = (ctx && typeof ctx.scope === 'string') ? ctx.scope : null;
    const out = [];
    let order = 0;
    for (const rule of RULES) {
        try {
            if (!rule.when(data)) continue;
            const html = rule.render(data);
            // Only push if render returned actual content — otherwise the
            // talk-track panel ends up interpolating `${null}` / `${undefined}`
            // as the literal strings "null" / "undefined".
            if (typeof html !== 'string' || !html.length) continue;
            const tags = Array.isArray(rule.tags) ? rule.tags : [];
            // Priority: 2 — matches the agent's current section/card
            //           1 — global / no scope (always relevant)
            //           0 — for a different section
            // (tags-less rules are treated as 'global' for backward compat
            // with any rule that hasn't been tagged yet.)
            let priority;
            if (focused && tags.includes(focused)) priority = 2;
            else if (!tags.length || tags.includes('global')) priority = 1;
            else priority = 0;
            out.push({ id: rule.id, html, _priority: priority, _order: order++ });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('TalkTrack rule failed:', rule.id, err);
        }
    }
    // Stable-sort by priority desc, then by declaration order asc so the
    // top of the panel always shows the prompts most relevant to where
    // the agent is focused right now.
    out.sort((a, b) => (b._priority - a._priority) || (a._order - b._order));
    // Strip the sort keys so consumers see the same shape as before.
    return out.map(({ id, html }) => ({ id, html }));
}

window.IntakeV2TalkTrack = {
    RULES,
    computeSuggestions,
    ageFromDob,
};

})();
