// utils.js — Shared helper utilities available on window.Utils.
// Load order: must come before all plugin modules (loaded right after fields.js in index.html).
// These are pure functions with no side effects and no external dependencies.

/* eslint-disable */
window.Utils = (() => {
    'use strict';

    /**
     * Escape a string for safe insertion into HTML text content.
     * Uses the browser's own DOM serializer so all special characters
     * (including multi-byte and emoji) are handled correctly.
     *
     * @param {*} str
     * @returns {string}
     */
    function escapeHTML(str) {
        if (str == null) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Escape a string for safe insertion into an HTML/XML attribute value.
     * Escapes &, <, >, ", and ' (single-quote → &#39;).
     * Use this when building attribute strings like attr="${escapeAttr(val)}".
     *
     * @param {*} str
     * @returns {string}
     */
    function escapeAttr(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    return { escapeHTML, escapeAttr };
})();
