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

    return { yesNoToggle, stateDropdown, carrierCard, hardStop };
})();
