/**
 * Altech EZLynx V2 — Carrier detection (Phase 5)
 *
 * Lightweight detector that reads which insurance carriers are selected
 * on the current EZLynx rating page. EZLynx presents carrier selection
 * as a set of mat-checkboxes or mat-slide-toggles inside the rating
 * setup sidebar / header area. Each carrier panel typically carries an
 * identifiable class or label text.
 *
 * The detector returns a normalized Set of lowercase carrier tags that
 * the registry loader can query when deciding whether to include
 * carrier-specific atoms. Tags are short canonical names:
 *   'allstate', 'asi', 'allied', 'ml', 'safeco', 'progressive', etc.
 *
 * Detection strategies (tried in order):
 *   1. `mat-checkbox` / `mat-slide-toggle` elements inside a carrier
 *      selection panel — read the label text, normalize to a tag.
 *   2. Carrier-specific DOM ids that only exist when a carrier is
 *      active (e.g. elements whose id contains `allstatexml`,
 *      `asixml`, `allied_`, etc.).
 *   3. Fallback: returns an empty Set (no carrier-specific atoms load,
 *      which is safe — core atoms still fill everything they can).
 *
 * The result is intentionally cached per call — no mutation observers.
 * The orchestrator calls detectActiveCarriers() once at the start of
 * a fill run, and the same set is used for the entire run.
 */
(function (global) {
    'use strict';

    /**
     * Canonical carrier names derived from EZLynx label text.
     * Keys are lowercase substrings found in label/panel text;
     * values are the normalized tag used in carrier-extensions.js.
     */
    const CARRIER_LABEL_MAP = {
        'allstate':     'allstate',
        'asi':          'asi',
        'allied':       'allied',
        'modern legacy': 'ml',
        'safeco':       'safeco',
        'progressive':  'progressive',
        'travelers':    'travelers',
        'hartford':     'hartford',
        'nationwide':   'nationwide',
        'kemper':       'kemper',
        'mercury':      'mercury',
        'state auto':   'stateauto',
        'auto-owners':  'autoowners',
        'foremost':     'foremost',
        'bristol west': 'bristolwest',
    };

    /**
     * DOM id substrings that imply a specific carrier is active.
     * If any element on the page has an id containing the substring,
     * the corresponding carrier is considered active.
     */
    const CARRIER_ID_MARKERS = [
        { substring: 'allstatexml', carrier: 'allstate' },
        { substring: 'asixml',      carrier: 'asi' },
        { substring: 'allied_',     carrier: 'allied' },
        { substring: '_ml',         carrier: 'ml' },
    ];

    /**
     * Normalize a raw label string to a carrier tag.
     * @param {string} text  Raw label text from the DOM.
     * @returns {string|null}  Carrier tag or null if unrecognized.
     */
    function labelToCarrier(text) {
        if (!text) return null;
        const lower = text.toLowerCase().trim();
        for (const [substring, tag] of Object.entries(CARRIER_LABEL_MAP)) {
            if (lower.includes(substring)) return tag;
        }
        return null;
    }

    /**
     * Strategy 1: Read checked carrier checkboxes / toggles.
     * EZLynx rating setup pages render carrier selection as
     * `mat-checkbox.mat-checkbox-checked` or
     * `mat-slide-toggle.mat-slide-toggle-checked` inside a carrier
     * selection panel.
     */
    function detectFromCheckboxes() {
        const carriers = new Set();
        const selectors = [
            'mat-checkbox.mat-checkbox-checked',
            'mat-checkbox.mat-mdc-checkbox-checked',
            'mat-slide-toggle.mat-slide-toggle-checked',
            'mat-slide-toggle.mat-mdc-slide-toggle-checked',
        ];
        for (const sel of selectors) {
            let els;
            try { els = document.querySelectorAll(sel); } catch (_) { continue; }
            for (const el of els) {
                const label = (el.textContent || '').trim();
                const tag = labelToCarrier(label);
                if (tag) carriers.add(tag);
            }
        }
        return carriers;
    }

    /**
     * Strategy 2: Detect carrier-specific element ids already on the page.
     * Carrier-specific fields (e.g. `hail_allstatexmlKS`) only render
     * when that carrier is selected, so their mere presence implies the
     * carrier is active.
     */
    function detectFromDomIds() {
        const carriers = new Set();
        const allEls = document.querySelectorAll('[id]');
        for (const el of allEls) {
            const id = el.id.toLowerCase();
            for (const marker of CARRIER_ID_MARKERS) {
                if (id.includes(marker.substring)) {
                    carriers.add(marker.carrier);
                }
            }
        }
        return carriers;
    }

    /**
     * Detect which carriers are currently selected/active on the page.
     *
     * @returns {Set<string>}  Set of normalized carrier tags (lowercase).
     *                         Always includes 'common' so common atoms
     *                         load unconditionally.
     */
    function detectActiveCarriers() {
        const carriers = new Set(['common']);

        // Strategy 1: checkbox/toggle labels
        const fromCheckboxes = detectFromCheckboxes();
        for (const c of fromCheckboxes) carriers.add(c);

        // Strategy 2: carrier-specific DOM ids
        const fromIds = detectFromDomIds();
        for (const c of fromIds) carriers.add(c);

        return carriers;
    }

    const api = {
        detectActiveCarriers,
        labelToCarrier,
        // Exposed for tests
        CARRIER_LABEL_MAP,
        CARRIER_ID_MARKERS,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.specialCases = global.AltechV2.specialCases || {};
        global.AltechV2.specialCases.carrierDetection = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
