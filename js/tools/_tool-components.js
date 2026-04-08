/**
 * _tool-components.js
 * Shared UI component factory for Agent Tools plugins.
 * Every tool in js/tools/ uses these instead of inline HTML templates.
 *
 * Depends on: window.Utils (escapeHTML, escapeAttr) — loaded before App
 * Exposes: window.ToolComponents
 */
window.ToolComponents = (() => {
    'use strict';

    /**
     * Renders a yes/no button-toggle question card.
     * @param {string} id - data-id attribute value used for event delegation
     * @param {string} label - Question text displayed above the buttons
     * @returns {string} HTML string
     */
    function yesNoToggle(id, label) {
        const safeId = Utils.escapeAttr(id);
        return `
            <div class="tc-question" data-id="${safeId}">
                <span class="tc-question-label">${Utils.escapeHTML(label)}</span>
                <div class="tc-toggle-group" role="group" aria-label="${Utils.escapeAttr(label)}">
                    <button class="tc-toggle-btn" data-id="${safeId}" data-value="yes" aria-pressed="false">Yes</button>
                    <button class="tc-toggle-btn" data-id="${safeId}" data-value="no"  aria-pressed="false">No</button>
                </div>
            </div>`;
    }

    /**
     * Renders a labeled `<select>` dropdown question card.
     * @param {string} id - data-id attribute value
     * @param {string} label - Question text displayed above the dropdown
     * @param {string[]} states - Array of option values (e.g. ['WA', 'OR'])
     * @returns {string} HTML string
     */
    function stateDropdown(id, label, states) {
        const safeId = Utils.escapeAttr(id);
        const opts = states.map(s =>
            `<option value="${Utils.escapeAttr(s)}">${Utils.escapeHTML(s)}</option>`
        ).join('');
        return `
            <div class="tc-question" data-id="${safeId}">
                <label class="tc-question-label" for="tc-select-${safeId}">${Utils.escapeHTML(label)}</label>
                <select class="tc-state-select" id="tc-select-${safeId}" data-id="${safeId}">
                    <option value="">— Select State —</option>
                    ${opts}
                </select>
            </div>`;
    }

    /**
     * Renders a carrier result card.
     * @param {Object}          params
     * @param {string}          params.name     - Carrier display name
     * @param {boolean}         params.disabled - If true, renders greyed-out disabled state
     * @param {string|null}     params.note     - Optional note shown beneath the badge
     * @returns {string} HTML string
     */
    function carrierCard({ name, disabled, note }) {
        const safeName = Utils.escapeHTML(name);
        const safeNote = note ? Utils.escapeHTML(note) : '';
        const cardClass  = disabled ? 'tc-carrier-disabled' : 'tc-carrier-ready';
        const badgeClass = disabled ? 'tc-badge-disabled'   : 'tc-badge-ready';
        const badgeText  = disabled ? 'Not Available'       : 'Ready to Quote';
        const noteHTML   = safeNote
            ? `<div class="tc-carrier-note${disabled ? ' tc-carrier-note-warning' : ''}">${safeNote}</div>`
            : '';
        return `
            <div class="tc-carrier-card ${cardClass}">
                <div class="tc-carrier-name">${safeName}</div>
                <div class="tc-badge ${badgeClass}">${badgeText}</div>
                ${noteHTML}
            </div>`;
    }

    /**
     * Renders a red hard-stop ineligibility alert.
     * @param {string} message - Alert text (user-facing)
     * @returns {string} HTML string
     */
    function hardStop(message) {
        return `
            <div class="tc-hard-stop" role="alert">
                <div class="tc-hard-stop-icon">🚫</div>
                <div class="tc-hard-stop-message">${Utils.escapeHTML(message)}</div>
            </div>`;
    }

    /**
     * Renders a labeled number input question card.
     * @param {string} id - data-id attribute value
     * @param {string} label - Question text
     * @param {Object} [opts] - { placeholder, min, max, step }
     * @returns {string} HTML string
     */
    function numberInput(id, label, opts) {
        opts = opts || {};
        const safeId = Utils.escapeAttr(id);
        const ph = opts.placeholder ? ` placeholder="${Utils.escapeAttr(opts.placeholder)}"` : '';
        const mn = opts.min != null ? ` min="${opts.min}"` : '';
        const mx = opts.max != null ? ` max="${opts.max}"` : '';
        const st = opts.step ? ` step="${opts.step}"` : '';
        return `
            <div class="tc-question" data-id="${safeId}">
                <label class="tc-question-label" for="tc-num-${safeId}">${Utils.escapeHTML(label)}</label>
                <input class="tc-number-input" id="tc-num-${safeId}" data-id="${safeId}"
                       type="number"${ph}${mn}${mx}${st}>
            </div>`;
    }

    /**
     * Renders a labeled text input question card.
     * @param {string} id - data-id attribute value
     * @param {string} label - Question text
     * @param {Object} [opts] - { placeholder }
     * @returns {string} HTML string
     */
    function textInput(id, label, opts) {
        opts = opts || {};
        const safeId = Utils.escapeAttr(id);
        const ph = opts.placeholder ? ` placeholder="${Utils.escapeAttr(opts.placeholder)}"` : '';
        return `
            <div class="tc-question" data-id="${safeId}">
                <label class="tc-question-label" for="tc-txt-${safeId}">${Utils.escapeHTML(label)}</label>
                <input class="tc-text-input" id="tc-txt-${safeId}" data-id="${safeId}"
                       type="text"${ph}>
            </div>`;
    }

    /**
     * Renders a generic labeled `<select>` dropdown question card.
     * @param {string} id - data-id attribute value
     * @param {string} label - Question text
     * @param {Array<{value:string,label:string}>} options - Selectable options
     * @param {Object} [opts] - { placeholder }
     * @returns {string} HTML string
     */
    function selectDropdown(id, label, options, opts) {
        opts = opts || {};
        const safeId = Utils.escapeAttr(id);
        const ph = opts.placeholder || '— Select —';
        const optionsHTML = options.map(o =>
            `<option value="${Utils.escapeAttr(o.value)}">${Utils.escapeHTML(o.label)}</option>`
        ).join('');
        return `
            <div class="tc-question" data-id="${safeId}">
                <label class="tc-question-label" for="tc-sel-${safeId}">${Utils.escapeHTML(label)}</label>
                <select class="tc-state-select" id="tc-sel-${safeId}" data-id="${safeId}">
                    <option value="">${Utils.escapeHTML(ph)}</option>
                    ${optionsHTML}
                </select>
            </div>`;
    }

    /**
     * Renders a carrier result card with enhanced status support.
     * Supports: ready, disqualified, pending, referOut
     * @param {Object} params
     * @param {string} params.name
     * @param {string} params.status - 'ready'|'disqualified'|'pending'|'referOut'
     * @param {string[]} [params.reasons] - Disqualification reasons
     * @param {string[]} [params.missingFields] - Fields still needed
     * @param {string|null} [params.note]
     * @returns {string} HTML string
     */
    function enhancedCarrierCard({ name, status, reasons, missingFields, note }) {
        const safeName = Utils.escapeHTML(name);
        const safeNote = note ? Utils.escapeHTML(note) : '';

        const statusConfig = {
            ready:        { cls: 'tc-carrier-ready',   badge: 'tc-badge-ready',    text: 'Ready to Quote' },
            disqualified: { cls: 'tc-carrier-disabled', badge: 'tc-badge-disabled', text: 'Not Eligible' },
            pending:      { cls: 'tc-carrier-pending',  badge: 'tc-badge-pending',  text: 'Needs More Info' },
            referOut:     { cls: 'tc-carrier-refer',    badge: 'tc-badge-refer',    text: 'Refer Out' },
        };
        const cfg = statusConfig[status] || statusConfig.pending;

        let detailHTML = '';
        if (status === 'disqualified' && reasons && reasons.length) {
            detailHTML = `<ul class="tc-carrier-reasons">${reasons.map(r =>
                `<li>${Utils.escapeHTML(r)}</li>`
            ).join('')}</ul>`;
        }
        if (status === 'pending' && missingFields && missingFields.length) {
            detailHTML = `<div class="tc-carrier-missing">Needs: ${missingFields.map(f =>
                Utils.escapeHTML(f)
            ).join(', ')}</div>`;
        }

        const noteHTML = safeNote
            ? `<div class="tc-carrier-note${status === 'disqualified' ? ' tc-carrier-note-warning' : ''}">${safeNote}</div>`
            : '';

        return `
            <div class="tc-carrier-card ${cfg.cls}">
                <div class="tc-carrier-name">${safeName}</div>
                <div class="tc-badge ${cfg.badge}">${cfg.text}</div>
                ${detailHTML}
                ${noteHTML}
            </div>`;
    }

    return { yesNoToggle, stateDropdown, carrierCard, hardStop,
             numberInput, textInput, selectDropdown, enhancedCarrierCard };
})();
