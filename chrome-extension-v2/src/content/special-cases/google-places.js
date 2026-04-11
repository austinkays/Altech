/**
 * Altech EZLynx V2 — Google Places autocomplete dismiss (§7.2)
 *
 * EZLynx's Address Line 1 field triggers Google Places autocomplete. When
 * the extension fills the field via execCommand('insertText'), Places shows
 * a suggestion panel (.pac-container) that intercepts the next click.
 *
 * The postFill action 'dismissPacContainer' removes it before the next atom
 * fires, so city / state / county fill unobstructed.
 *
 * The autocomplete's "helpful" auto-fill chain is deliberately NOT used.
 * City, State, ZIP, and County are all independent atoms filled explicitly.
 */
(function (global) {
    'use strict';

    /**
     * Remove the Google Places suggestion panel if present.
     * No-op if the panel is not in the DOM.
     */
    function dismissPacContainer() {
        const pac = document.querySelector('.pac-container');
        if (pac) pac.remove();
    }

    const api = { dismissPacContainer };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.specialCases = global.AltechV2.specialCases || {};
        global.AltechV2.specialCases.dismissPacContainer = dismissPacContainer;
    }
})(typeof window !== 'undefined' ? window : globalThis);
