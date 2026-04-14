/**
 * Altech EZLynx V2 — Co-applicant entity ID discovery (§7.6)
 *
 * The co-applicant section on /details is an inline mat-expansion-panel.
 * Its form field ids follow the pattern `contact-{field}-{entityId}` where
 * `entityId` is a server-assigned opaque numeric string (e.g. "71455028")
 * that the extension cannot know in advance.
 *
 * Discovery flow:
 *   1. Snapshot all existing `contact-first-name-*` id suffixes.
 *   2. Click the "Add contact" button.
 *   3. Poll (up to 5 s) for a new `contact-first-name-{id}` to appear.
 *   4. Return the new entity ID suffix, or null on timeout / error.
 *
 * The orchestrator stores the result in session state and passes it as
 * ctx.entityId when executing co-applicant-scoped atoms.
 */
(function (global) {
    'use strict';

    function getPollPredicate() {
        if (typeof module !== 'undefined' && module.exports) {
            return require('../waits/poll-predicate').pollPredicate;
        }
        return global.AltechV2.waits.pollPredicate;
    }

    /**
     * @returns {Promise<string|null>}  entity ID string, or null if discovery fails
     */
    async function discoverCoApplicantEntityId() {
        const pollPredicate = getPollPredicate();

        // 0. Activate the co-applicant toggle if it exists and is OFF.
        //    The mat-slide-toggle with id 'additional-contact-is-co-applicant-0'
        //    gates the entire co-applicant section — the "Add contact" button
        //    only appears after the toggle is ON.
        const toggle = document.getElementById('additional-contact-is-co-applicant-0');
        if (toggle) {
            const wrapper = toggle.closest('mat-slide-toggle');
            const isChecked = wrapper
                ? wrapper.classList.contains('mat-mdc-slide-toggle-checked')
                : toggle.checked;
            if (!isChecked) {
                // Click the label/wrapper (Angular needs the gesture on the component).
                const clickTarget = wrapper || toggle;
                try { clickTarget.click(); } catch (_) { /* best-effort */ }

                // Wait up to 2 s for the "Add contact" section to render.
                await pollPredicate(
                    () => {
                        const btns = Array.from(document.querySelectorAll('button'));
                        return btns.some((b) => /add\s+contact/i.test(b.textContent || ''));
                    },
                    { timeoutMs: 2000, intervalMs: 100 }
                );
            }
        }

        // 1. Snapshot existing contact-first-name-* id suffixes.
        const existing = new Set(
            Array.from(document.querySelectorAll('[id^="contact-first-name-"]'))
                .map((el) => el.id.replace('contact-first-name-', ''))
        );

        // 2. Find and click the "Add contact" button.
        const buttons = Array.from(document.querySelectorAll('button'));
        const addBtn = buttons.find((b) => /add\s+contact/i.test(b.textContent || ''));
        if (!addBtn) return null;

        try { addBtn.click(); } catch (_) { return null; }

        // 3. Poll for a new contact-first-name-{id} to appear (up to 5 s).
        const found = await pollPredicate(
            () => {
                const els = document.querySelectorAll('[id^="contact-first-name-"]');
                return Array.from(els).some(
                    (el) => !existing.has(el.id.replace('contact-first-name-', ''))
                );
            },
            { timeoutMs: 5000, intervalMs: 100 }
        );

        if (!found) return null;

        // 4. Extract the new entity ID from the first matching element.
        const newEl = Array.from(document.querySelectorAll('[id^="contact-first-name-"]'))
            .find((el) => !existing.has(el.id.replace('contact-first-name-', '')));
        return newEl ? newEl.id.replace('contact-first-name-', '') : null;
    }

    const api = { discoverCoApplicantEntityId };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.specialCases = global.AltechV2.specialCases || {};
        global.AltechV2.specialCases.discoverCoApplicantEntityId = discoverCoApplicantEntityId;
    }
})(typeof window !== 'undefined' ? window : globalThis);
