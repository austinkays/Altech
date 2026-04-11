/**
 * Altech EZLynx V2 — Dice coefficient similarity
 *
 * Used by the mat-select primitive as the *final* matching fallback after
 * exact and case-insensitive-exact fail. V2 raises the threshold to 0.7
 * (vs v1's 0.4) so only reasonably-close matches pass — mat-options with
 * known-safe option lists in the registry are where this fallback is
 * actually safe to use.
 */
(function (global) {
    'use strict';

    /**
     * Returns the Sørensen–Dice coefficient over bigrams in range [0, 1].
     */
    function diceSimilarity(a, b) {
        if (a == null || b == null) return 0;
        const sa = String(a).toLowerCase();
        const sb = String(b).toLowerCase();
        if (sa === sb) return 1;
        if (sa.length < 2 || sb.length < 2) return 0;

        const bigramCount = (s) => {
            const map = new Map();
            for (let i = 0; i < s.length - 1; i++) {
                const bg = s.slice(i, i + 2);
                map.set(bg, (map.get(bg) || 0) + 1);
            }
            return map;
        };

        const aMap = bigramCount(sa);
        const bMap = bigramCount(sb);
        let intersection = 0;
        for (const [bg, count] of aMap) {
            const other = bMap.get(bg) || 0;
            intersection += Math.min(count, other);
        }
        const total = (sa.length - 1) + (sb.length - 1);
        if (total === 0) return 0;
        return (2 * intersection) / total;
    }

    /**
     * Given a target string and an array of candidate strings, return the
     * best match above the threshold, or null if nothing qualifies.
     * @returns {{index: number, value: string, score: number} | null}
     */
    function bestMatch(target, candidates, threshold) {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;
        const th = typeof threshold === 'number' ? threshold : 0.7;
        let best = { index: -1, value: null, score: -1 };
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            const score = diceSimilarity(target, c);
            if (score > best.score) best = { index: i, value: c, score };
        }
        return best.score >= th ? best : null;
    }

    const api = { diceSimilarity, bestMatch };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.locator = global.AltechV2.locator || {};
        global.AltechV2.locator.dice = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
