/**
 * Altech EZLynx V2 — Fill report panel renderer
 *
 * Turns a FillTrace report into a DocumentFragment for the toolbar panel.
 * Per plan §5.3, shows counts (DONE/SKIPPED/FAILED/BLOCKED) and per-atom
 * drill-downs for the failed/skipped entries.
 */
(function (global) {
    'use strict';

    function h(tag, attrs, children) {
        const el = document.createElement(tag);
        if (attrs) for (const k in attrs) {
            if (k === 'class') el.className = attrs[k];
            else if (k === 'text') el.textContent = attrs[k];
            else el.setAttribute(k, attrs[k]);
        }
        if (Array.isArray(children)) children.forEach((c) => { if (c) el.appendChild(c); });
        return el;
    }

    /**
     * @param {object} report  fill-trace.toReport() output
     * @returns {DocumentFragment}
     */
    function renderReport(report) {
        const frag = document.createDocumentFragment();
        if (!report) {
            frag.appendChild(h('div', { class: 'av2-empty', text: 'No report yet.' }));
            return frag;
        }

        // Route label + no-registry hint
        const meta = report.meta || {};
        const noReg = report.entries && report.entries.some((e) => e.state === 'NO_REGISTRY');
        frag.appendChild(h('div', { class: 'av2-route' }, [
            h('span', { class: 'av2-label', text: 'Route:' }),
            h('span', { class: 'av2-val', text: meta.routeKey || 'unknown' }),
        ]));

        if (noReg) {
            frag.appendChild(h('div', { class: 'av2-note', text: 'No registry for this route — pending Phase 1' }));
            return frag;
        }

        const c = report.counts || { DONE: 0, SKIPPED: 0, FAILED: 0, BLOCKED: 0 };
        const counts = h('div', { class: 'av2-counts' }, [
            h('span', { class: 'av2-pill av2-done', text: '✅ ' + c.DONE }),
            h('span', { class: 'av2-pill av2-skip', text: '⏭ ' + c.SKIPPED }),
            h('span', { class: 'av2-pill av2-fail', text: '❌ ' + c.FAILED }),
            h('span', { class: 'av2-pill av2-blk',  text: '🚫 ' + c.BLOCKED }),
        ]);
        frag.appendChild(counts);

        // Per-atom lines for non-DONE entries.
        const problematic = (report.entries || []).filter((e) =>
            e.state === 'FAILED' || e.state === 'SKIPPED' || e.state === 'BLOCKED'
        );
        if (problematic.length > 0) {
            const list = h('ul', { class: 'av2-issues' });
            problematic.forEach((e) => {
                const reason = e.detail && e.detail.reason ? (' — ' + e.detail.reason) : '';
                list.appendChild(h('li', {
                    class: 'av2-issue av2-' + e.state.toLowerCase(),
                    text: '[' + e.state + '] ' + e.atom + reason,
                }));
            });
            frag.appendChild(list);
        } else {
            frag.appendChild(h('div', { class: 'av2-note', text: 'All atoms reached DONE.' }));
        }

        frag.appendChild(h('div', { class: 'av2-dur', text: 'Duration: ' + report.durationMs + ' ms' }));
        return frag;
    }

    const api = { renderReport };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.ui = global.AltechV2.ui || {};
        global.AltechV2.ui.renderReport = renderReport;
    }
})(typeof window !== 'undefined' ? window : globalThis);
