/**
 * Altech EZLynx V2 — Recon: Page Inventory (§11.4.1)
 *
 * Walks every visible form field on the current page and emits a structured
 * JSON document matching the format used in the plan's field registries.
 * Output is suitable for building a new atom registry from scratch or for
 * detecting what EZLynx changed after a UI update.
 *
 * Output shape:
 *   {
 *     route, timestamp, url,
 *     fields: [{ order, label, id, tag, type, required, disabled, scope }],
 *     scopeContainers: ['additional-driver-fields (3 instances)', ...],
 *     cascadesDetected: [{ parent, child }],
 *   }
 *
 * "Visible" means the element and all its ancestors are not display:none or
 * visibility:hidden. We do NOT filter on opacity or z-index since EZLynx
 * sometimes uses opacity animations.
 */
(function (global) {
    'use strict';

    // Tags + input types we care about.
    const FORM_TAGS = ['INPUT', 'SELECT', 'TEXTAREA', 'MAT-SELECT', 'MAT-SLIDE-TOGGLE', 'MAT-RADIO-GROUP'];

    // Custom element scope wrappers to detect.
    const SCOPE_SELECTORS = [
        'additional-driver-fields',
        'vehicle-fields',
        'mat-expansion-panel',
    ];

    /** Safely escape a CSS id selector value (falls back for environments without CSS.escape). */
    function escapeCssId(id) {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(id);
        return id.replace(/[^\w-]/g, '\\$&');
    }

    /** Return the best human-readable label for a form element. */
    function extractLabel(el) {
        // 1. Explicit <label for="...">
        if (el.id) {
            const lbl = document.querySelector(`label[for="${escapeCssId(el.id)}"]`);
            if (lbl) return lbl.textContent.trim();
        }
        // 2. Wrapping <label>
        const parentLabel = el.closest('label');
        if (parentLabel) return parentLabel.textContent.trim().replace(/\s+/g, ' ');
        // 3. Nearest mat-label or mat-form-field label (Angular Material)
        const matField = el.closest('mat-form-field');
        if (matField) {
            const matLabel = matField.querySelector('mat-label, label');
            if (matLabel) return matLabel.textContent.trim();
        }
        // 4. aria-label / placeholder as last resort
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
        if (el.placeholder) return el.placeholder;
        return '';
    }

    /** True if the element and all its ancestors are actually visible. */
    function isVisible(el) {
        try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (el.parentElement) return isVisible(el.parentElement);
            return true;
        } catch (_) { return true; }
    }

    /** Return the closest scope container name (e.g. 'additional-driver-fields') for an element, or null. */
    function detectScope(el) {
        for (const sel of SCOPE_SELECTORS) {
            if (el.closest(sel)) return sel;
        }
        return null;
    }

    /**
     * Scan for potential cascade relationships:
     * Walk all disabled inputs. If there is an ancestor mat-form-field whose
     * sibling form group contains a mat-select (or input) with ng-valid, record
     * the ng-valid owner as a potential parent and the disabled field as the child.
     */
    function detectCascades(fields) {
        const cascades = [];
        const disabledFields = fields.filter((f) => f.disabled && f.id);
        const enabledFields = fields.filter((f) => !f.disabled && f.id);
        if (disabledFields.length === 0 || enabledFields.length === 0) return cascades;

        for (const child of disabledFields) {
            const childEl = child.id ? document.getElementById(child.id) : null;
            if (!childEl) continue;
            // Look for a mat-form-field ancestor and scan siblings for ng-valid
            const childFormField = childEl.closest('mat-form-field');
            if (!childFormField) continue;
            const parentGroup = childFormField.parentElement;
            if (!parentGroup) continue;
            const sibs = parentGroup.querySelectorAll('mat-form-field');
            for (const sib of sibs) {
                if (sib === childFormField) continue;
                const sibInput = sib.querySelector('input.ng-valid, mat-select.ng-valid, select.ng-valid');
                if (sibInput && sibInput.id) {
                    cascades.push({ parent: sibInput.id, child: child.id });
                    break;
                }
            }
        }
        return cascades;
    }

    /**
     * @param {string} routeKey   Current route key (from router)
     * @returns {object}          Inventory report
     */
    function runPageInventory(routeKey) {
        const fields = [];
        let order = 0;

        // Collect all form-like elements
        const allEls = document.querySelectorAll(FORM_TAGS.join(', '));
        for (const el of allEls) {
            if (!isVisible(el)) continue;
            // Skip hidden inputs
            if (el.type === 'hidden') continue;
            const label = extractLabel(el);
            const scope = detectScope(el);
            fields.push({
                order: order++,
                label,
                id: el.id || null,
                tag: el.tagName,
                type: el.type || el.tagName.toLowerCase(),
                required: el.required || el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
                disabled: el.disabled || el.hasAttribute('disabled'),
                scope,
            });
        }

        // Scope containers summary
        const scopeContainers = [];
        for (const sel of SCOPE_SELECTORS) {
            const nodes = document.querySelectorAll(sel);
            if (nodes.length > 0) {
                scopeContainers.push(`${sel} (${nodes.length} instance${nodes.length !== 1 ? 's' : ''})`);
            }
        }

        const cascadesDetected = detectCascades(fields);

        return {
            route: routeKey || window.location.pathname,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            fields,
            scopeContainers,
            cascadesDetected,
        };
    }

    const api = { runPageInventory };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        global.AltechV2.recon.pageInventory = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
