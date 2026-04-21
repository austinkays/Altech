// js/app-validation.js — Step-level required-field validation for the quoting wizard.
// Extracted from app-core.js during Phase 3 monolith decomposition (2026-04).
'use strict';

// Provides step-level required-field validation for the quoting wizard.
// Called by App.next() before advancing to the next step.
const Validation = {
    /**
     * Validate required fields for a given step number.
     * Returns an array of { field, message } objects — empty = valid.
     */
    validateStep(/* step */) {
        // Validation is informational only — yellow ✦ stars hint at missing fields
        // but never block step progression. Returns empty array (no blocking errors).
        return [];
    },

    /**
     * Insert a validation error message below the given field element.
     * Highlights the field border red.
     */
    showError(fieldId, message) {
        const el = document.getElementById(fieldId);
        if (!el) return;
        el.style.borderColor = 'var(--danger, #ff3b30)';

        const err = document.createElement('span');
        err.className = 'validation-error';
        err.textContent = message;
        el.insertAdjacentElement('afterend', err);
    },
};
