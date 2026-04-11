/**
 * Altech EZLynx V2 — Scoped locator
 *
 * Resolves an atom's element inside a specific wrapper component (e.g.
 * `additional-driver-fields[N]`) so driver-0 atoms cannot touch driver-1
 * DOM. Delegates scope lookup to scope-resolvers.js.
 */
(function (global) {
    'use strict';

    const getLocator = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                scopeResolvers: require('./scope-resolvers'),
                findById: require('./find-by-id'),
            };
        }
        return {
            scopeResolvers: global.AltechV2.locator.scopeResolvers,
            findById: global.AltechV2.locator.findById,
        };
    };

    /**
     * @param {object} atom  { idTemplate, scope, fallbackSelectors? }
     * @param {object} ctx   { index?, entityId?, entityMap? }
     * @returns {Element|null}
     */
    function findScoped(atom, ctx) {
        const { scopeResolvers, findById } = getLocator();
        const scopeKey = atom.scope || null;

        // Non-multi-entity: fall through to plain id lookup.
        if (!scopeKey) {
            const byId = findById.findById(atom.idTemplate, ctx);
            if (byId) return byId;
            return tryFallbacks(atom, document);
        }

        // Figure out what index/entityId to use for the scope resolver.
        const indexOrId = scopeKey === 'coApplicant'
            ? (ctx && ctx.entityId)
            : (ctx && ctx.index);
        const root = scopeResolvers.resolveScope(scopeKey, indexOrId);
        if (!root) return null;

        // Resolve the id with placeholders substituted.
        const resolvedId = findById.resolveId(atom.idTemplate, ctx);
        if (!resolvedId) return tryFallbacks(atom, root);

        // Scoped lookup first — even for id-based queries, we use the wrapper
        // so a stray matching id outside the scope is ignored.
        // Note: getElementById is document-level only, so use querySelector
        // with an id escape. CSS.escape is available in MV3 content script.
        const safe = (typeof CSS !== 'undefined' && CSS.escape)
            ? CSS.escape(resolvedId)
            : resolvedId.replace(/[^\w-]/g, '\\$&');
        const el = (root === document)
            ? document.getElementById(resolvedId)
            : root.querySelector('#' + safe);
        if (el) return el;
        return tryFallbacks(atom, root);
    }

    function tryFallbacks(atom, root) {
        if (!Array.isArray(atom.fallbackSelectors)) return null;
        for (const sel of atom.fallbackSelectors) {
            try {
                const el = (root || document).querySelector(sel);
                if (el) return el;
            } catch (_) { /* bad selector, skip */ }
        }
        return null;
    }

    const api = { findScoped };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.locator.findScoped = findScoped;
    }
})(typeof window !== 'undefined' ? window : globalThis);
