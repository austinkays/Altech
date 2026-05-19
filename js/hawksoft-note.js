// js/hawksoft-note.js — HawkSoft note HTML-dialect builder + API error type.
//
// Pure module (args + global `Utils` only — no `this`, DOM mutation, network,
// or storage). It converts a structured intermediate representation (IR) into
// the *exact* HTML dialect HawkSoft's contentEditable accepts, so that if
// HawkSoft ever changes its format only this one function changes.
//
// FOUNDATION-FIRST — intentionally NOT wired into the live logger. The
// sanctioned partner-API path (api/hawksoft-logger.js) sends a PLAIN-TEXT
// `note`; HawkSoft renders that path as plain text, so injecting this HTML
// there would regress it. This builder is for the future internal-API path
// ("Path B") and is verified here in isolation. See docs/HAWKSOFT_API.md.
'use strict';

(() => {
    'use strict';

    // Only these URL schemes may appear in a rendered <a href>. Everything
    // else (javascript:, data:, vbscript:, file:, relative, …) degrades to
    // inert escaped text — content is never silently dropped.
    const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:'];

    // ── Escaping ────────────────────────────────────────────────────────
    // Non-string inputs coerce to '' (not String()) so an object never leaks
    // as "[object Object]" and a number never becomes unintended text.
    function _esc(s) {
        return (typeof s === 'string') ? Utils.escapeHTML(s) : '';
    }

    // ── Color: validate → round → clamp 0..255 ──────────────────────────
    // Any non-finite component drops the whole color (no partial rgb()).
    function _rgb(color) {
        if (!Array.isArray(color) || color.length !== 3) return null;
        const out = [];
        for (const c of color) {
            const n = Number(c);
            if (!Number.isFinite(n)) return null;
            out.push(Math.max(0, Math.min(255, Math.round(n))));
        }
        return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
    }

    // Combined single-span style string, deterministic property order.
    // Built only from literal property names + a validated rgb() — no part
    // of it is ever attacker-controllable.
    function _styleFromTextRun(run) {
        const decls = [];
        if (run.bold === true) decls.push('font-weight: bold;');
        if (run.italic === true) decls.push('font-style: italic;');
        if (run.underline === true) decls.push('text-decoration-line: underline;');
        const rgb = _rgb(run.color);
        if (rgb) decls.push(`color: ${rgb};`);
        return decls.join(' ');
    }

    // ── Link href safety ────────────────────────────────────────────────
    // Strip ASCII control chars (defeats `java\tscript:` obfuscation) + trim,
    // require an explicit allow-listed scheme, return the cleaned string
    // (caller attribute-escapes it). null ⇒ caller degrades to plain text.
    function _safeHref(href) {
        if (typeof href !== 'string') return null;
        const cleaned = href.replace(/[\x00-\x1F\x7F]/g, '').trim();
        if (cleaned === '') return null;
        const m = cleaned.match(/^([a-z][a-z0-9+.\-]*):/i);
        if (!m) return null;
        if (ALLOWED_SCHEMES.indexOf(m[1].toLowerCase() + ':') === -1) return null;
        return cleaned;
    }

    // ── Runs ────────────────────────────────────────────────────────────
    function _renderText(run) {
        const text = _esc(typeof run.text === 'string' ? run.text : '');
        const style = _styleFromTextRun(run);
        return style ? `<span style="${style}">${text}</span>` : text;
    }

    function _renderLink(run) {
        const rawText = typeof run.text === 'string' ? run.text : '';
        const cleaned = _safeHref(run.href);
        if (cleaned === null) return _esc(rawText); // inert, never an <a>
        const label = rawText !== '' ? _esc(rawText) : _esc(cleaned);
        return `<a target="_blank" href="${Utils.escapeAttr(cleaned)}">${label}</a>`;
    }

    function _renderRun(run) {
        if (!run || typeof run !== 'object') return '';
        if (run.type === 'link') return _renderLink(run);
        if (run.type === 'text') return _renderText(run);
        return ''; // unknown / missing type → skip (no text fall-through)
    }

    function _renderRuns(runs) {
        if (!Array.isArray(runs)) return '';
        return runs.map(_renderRun).join('');
    }

    // ── Blocks ──────────────────────────────────────────────────────────
    function _renderParagraph(block) {
        const runs = Array.isArray(block.runs) ? block.runs : [];
        return `<div>${_renderRuns(runs)}</div>`;
    }

    function _renderList(block, tag) {
        const items = Array.isArray(block.items) ? block.items : [];
        if (items.length === 0) return ''; // empty <ul>/<ol> is editor noise
        const lis = items
            .map(item => `<li>${_renderRuns(Array.isArray(item) ? item : [])}</li>`)
            .join('');
        return `<${tag}>${lis}</${tag}>`;
    }

    function _renderBlock(block) {
        if (!block || typeof block !== 'object') return '';
        switch (block.type) {
            case 'paragraph': return _renderParagraph(block);
            case 'bullet':    return _renderList(block, 'ul');
            case 'numbered':  return _renderList(block, 'ol');
            case 'break':     return '<div><br></div>';
            default:          return ''; // unknown block type → skip
        }
    }

    /**
     * Build a HawkSoft-compatible HTML note from a structured IR.
     *
     * @param {Array} content NoteBlock[] — see docs/HAWKSOFT_API.md
     * @returns {string} HawkSoft-dialect HTML ('' for any non-array input)
     */
    function buildHawkSoftNote(content) {
        if (!Array.isArray(content)) return '';
        return content.map(_renderBlock).join('');
    }

    // ── API error type (path-agnostic) ──────────────────────────────────
    class HawkSoftAPIError extends Error {
        constructor(status, body) {
            super(`HawkSoft API error ${status}`);
            this.name = 'HawkSoftAPIError';
            this.status = status;
            this.body = body;
        }
        get isAuthError()   { return this.status === 401 || this.status === 403; }
        get isNotFound()    { return this.status === 404; }
        get isServerError() { return typeof this.status === 'number' && this.status >= 500; }
    }

    const api = Object.freeze({ buildHawkSoftNote, HawkSoftAPIError });

    if (typeof window !== 'undefined') window.HawkSoftNote = api;
    if (typeof globalThis !== 'undefined') globalThis.HawkSoftNote = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = { HawkSoftNote: api };
})();
