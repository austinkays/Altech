/**
 * Altech EZLynx V2 — Unscoped id locator
 *
 * For flat registries (applicant, home pages, incidents) that don't need
 * a wrapper component. Resolves an atom's idTemplate — substituting
 * {N} / {entityId} placeholders — against document.getElementById.
 */
(function (global) {
    'use strict';

    /**
     * Substitute {N} / {entityId} placeholders from a context object.
     */
    function resolveId(idTemplate, ctx) {
        if (!idTemplate) return '';
        let out = String(idTemplate);
        if (ctx) {
            if (ctx.index != null) out = out.replace(/\{N\}/g, String(ctx.index));
            if (ctx.entityId != null) out = out.replace(/\{entityId\}/g, String(ctx.entityId));
        }
        return out;
    }

    function findById(idTemplate, ctx) {
        const id = resolveId(idTemplate, ctx);
        if (!id) return null;
        return document.getElementById(id);
    }

    const api = { findById, resolveId };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.locator.findById = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
