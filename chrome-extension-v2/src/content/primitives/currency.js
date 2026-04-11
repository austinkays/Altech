/**
 * Altech EZLynx V2 — Currency fill primitive
 *
 * Strips `$` and commas from the raw value, then delegates to the text
 * primitive. EZLynx reformats to `$X,XXX` on blur automatically.
 */
(function (global) {
    'use strict';

    const getText = () => {
        if (typeof module !== 'undefined' && module.exports) return require('./text').fillText;
        return global.AltechV2.primitives.text.fillText;
    };

    const getStrip = () => {
        if (typeof module !== 'undefined' && module.exports) return require('../transforms/currency-strip').strip;
        return global.AltechV2.transforms.currencyStrip.strip;
    };

    function fillCurrency(el, value) {
        const stripped = getStrip()(value);
        return getText()(el, stripped);
    }

    const api = { fillCurrency };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.primitives.currency = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
