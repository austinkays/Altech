/**
 * Altech EZLynx V2 — Fill report panel renderer (Phase 4)
 *
 * Renders a FillTrace report as a DocumentFragment for the toolbar or popup.
 *
 * Per plan §5.3 + §7.3, the rendering has three layers:
 *
 *   1. **LexisNexis banner** — a prominent "X fields locked by LexisNexis"
 *      strip at the top listing the human-readable labels of every atom
 *      that SKIPPED with reason `lexis-nexis`. Users need to know which
 *      fields to manually unlock or re-enter. Labels are safe to show
 *      (non-PII).
 *
 *   2. **Summary counts** — DONE / SKIPPED / FAILED / BLOCKED pills.
 *
 *   3. **Per-atom drill-down table** — collapsible, grouped by route
 *      section (applicant / co-applicant / driver-N / vehicle-N /
 *      incident sub-type / home-*). Every atom row shows:
 *        - state icon + badge (distinct color per state)
 *        - label + atom key (muted)
 *        - reason / error detail
 *        - attempt count (for FAILED only)
 *        - entity index for multi-entity atoms
 *
 * Only finalized terminal transitions are rendered — intermediate
 * LOCATE/PRECHECK/FILL/VERIFY log lines are filtered out.
 *
 * Atom metadata (label, scope, _index) is read from `report.atomIndex`
 * which the orchestrator populates via `trace.registerAtoms(sorted)`
 * before the run loop starts. For backwards compatibility (older traces
 * without an atomIndex) the renderer falls back to the atom key.
 */
(function (global) {
    'use strict';

    const TERMINAL = new Set(['DONE', 'SKIPPED', 'FAILED', 'BLOCKED']);

    const STATE_META = {
        DONE:    { icon: '✅', label: 'Done',    cls: 'av2-state-done' },
        SKIPPED: { icon: '⏭',  label: 'Skipped', cls: 'av2-state-skip' },
        FAILED:  { icon: '❌', label: 'Failed',  cls: 'av2-state-fail' },
        BLOCKED: { icon: '🚫', label: 'Blocked', cls: 'av2-state-blk'  },
    };

    // Human-readable mapping for common internal reason strings. Anything
    // not listed is rendered verbatim.
    const REASON_LABEL = {
        'lexis-nexis':         'Locked by LexisNexis',
        'disabled':            'Field disabled',
        'empty-source':        'No source value',
        'already-filled':      'Already filled',
        'not-found':           'Element not found',
        'locate-exception':    'Locate error',
        'transform-exception': 'Transform error',
        'fill-exception':      'Fill error',
        'mat-error':           'Material error state',
        'verify-failed':       'Verification failed',
        'no-fill-result':      'Fill returned no result',
        'unknown-type':        'Unknown primitive type',
        'unknown-verify-mode': 'Unknown verify mode',
        'custom-failed':       'Custom verify failed',
        'custom-exception':    'Custom verify error',
        'executor-exception':  'Executor error',
    };

    function h(tag, attrs, children) {
        const el = document.createElement(tag);
        if (attrs) for (const k in attrs) {
            if (k === 'class') el.className = attrs[k];
            else if (k === 'text') el.textContent = attrs[k];
            else if (k === 'html') el.innerHTML = attrs[k];
            else el.setAttribute(k, attrs[k]);
        }
        if (Array.isArray(children)) children.forEach((c) => { if (c) el.appendChild(c); });
        return el;
    }

    /**
     * Derive the grouping section for an atom row.
     * Multi-entity atoms carry an `_index` meta + a key prefixed by the
     * short entity prefix (`d0_`, `v1_`, `acc0_`, `vio0_`, `cl0_`). Flat
     * registries have no prefix; we bucket them by route.
     */
    function classifyAtom(atomKey, meta, routeKey) {
        if (meta && meta.scope) {
            switch (meta.scope) {
                case 'driver':
                    return { group: `driver-${meta.index != null ? meta.index : 0}`,
                             label: `Driver ${(meta.index != null ? meta.index : 0) + 1}` };
                case 'vehicle':
                    return { group: `vehicle-${meta.index != null ? meta.index : 0}`,
                             label: `Vehicle ${(meta.index != null ? meta.index : 0) + 1}` };
                case 'accident':
                    return { group: `accident-${meta.index != null ? meta.index : 0}`,
                             label: `Accident ${(meta.index != null ? meta.index : 0) + 1}` };
                case 'violation':
                    return { group: `violation-${meta.index != null ? meta.index : 0}`,
                             label: `Violation ${(meta.index != null ? meta.index : 0) + 1}` };
                case 'compLoss':
                    return { group: `compLoss-${meta.index != null ? meta.index : 0}`,
                             label: `Comp Loss ${(meta.index != null ? meta.index : 0) + 1}` };
                case 'coApplicant':
                    return { group: 'coApplicant', label: 'Co-Applicant' };
            }
        }
        // Fallback: parse key prefix for traces with no atomIndex.
        const m = /^(d|v|acc|vio|cl)(\d+)_/.exec(atomKey || '');
        if (m) {
            const [, p, n] = m;
            const i = Number(n);
            if (p === 'd')   return { group: `driver-${i}`,    label: `Driver ${i + 1}` };
            if (p === 'v')   return { group: `vehicle-${i}`,   label: `Vehicle ${i + 1}` };
            if (p === 'acc') return { group: `accident-${i}`,  label: `Accident ${i + 1}` };
            if (p === 'vio') return { group: `violation-${i}`, label: `Violation ${i + 1}` };
            if (p === 'cl')  return { group: `compLoss-${i}`,  label: `Comp Loss ${i + 1}` };
        }
        // Flat route — classify by route key.
        if (routeKey === 'home-policy-info')   return { group: 'home-policy-info',   label: 'Home Policy Info' };
        if (routeKey === 'home-dwelling-info') return { group: 'home-dwelling-info', label: 'Home Dwelling Info' };
        if (routeKey === 'home-coverage')      return { group: 'home-coverage',      label: 'Home Coverage' };
        if (routeKey === 'applicant-details')  return { group: 'applicant',          label: 'Applicant' };
        return { group: 'other', label: 'Other' };
    }

    function getAtomLabel(key, atomIndex) {
        if (atomIndex && atomIndex[key] && atomIndex[key].label) return atomIndex[key].label;
        return key;
    }

    function reasonText(detail) {
        if (!detail) return null;
        const raw = detail.reason || detail.blockedBy;
        if (!raw) return null;
        if (detail.blockedBy) return 'Blocked by ' + detail.blockedBy;
        return REASON_LABEL[raw] || raw;
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

        const meta = report.meta || {};
        const routeKey = meta.routeKey || 'unknown';
        const atomIndex = report.atomIndex || {};

        // NO_REGISTRY fast path — registry not loaded for this route.
        const noReg = report.entries && report.entries.some((e) => e.state === 'NO_REGISTRY');
        frag.appendChild(h('div', { class: 'av2-route' }, [
            h('span', { class: 'av2-label', text: 'Route:' }),
            h('span', { class: 'av2-val', text: routeKey }),
        ]));
        if (noReg) {
            frag.appendChild(h('div', { class: 'av2-note', text: 'No registry for this route — pending Phase 1' }));
            return frag;
        }

        // Filter to terminal-state entries only.
        const terminalEntries = (report.entries || []).filter((e) => TERMINAL.has(e.state));

        // ── LexisNexis banner (Phase 4 §7.3) ────────────────────────
        const lexisEntries = terminalEntries.filter((e) =>
            e.state === 'SKIPPED' && e.detail && e.detail.reason === 'lexis-nexis'
        );
        if (lexisEntries.length > 0) {
            const labels = lexisEntries.map((e) => getAtomLabel(e.atom, atomIndex));
            const banner = h('div', { class: 'av2-lexis-banner' });
            banner.appendChild(h('div', { class: 'av2-lexis-head' }, [
                h('span', { class: 'av2-lexis-icon', text: '🔒' }),
                h('span', { class: 'av2-lexis-title',
                    text: `${lexisEntries.length} field${lexisEntries.length === 1 ? '' : 's'} locked by LexisNexis` }),
            ]));
            banner.appendChild(h('div', { class: 'av2-lexis-body',
                text: labels.join(' · ') }));
            banner.appendChild(h('div', { class: 'av2-lexis-hint',
                text: 'Unlock manually on EZLynx or re-enter after dismissing the prefill.' }));
            frag.appendChild(banner);
        }

        // ── Summary counts ──────────────────────────────────────────
        const c = report.counts || { DONE: 0, SKIPPED: 0, FAILED: 0, BLOCKED: 0 };
        frag.appendChild(h('div', { class: 'av2-counts' }, [
            h('span', { class: 'av2-pill av2-done', text: '✅ ' + c.DONE + ' done' }),
            h('span', { class: 'av2-pill av2-skip', text: '⏭ ' + c.SKIPPED + ' skip' }),
            h('span', { class: 'av2-pill av2-fail', text: '❌ ' + c.FAILED + ' fail' }),
            h('span', { class: 'av2-pill av2-blk',  text: '🚫 ' + c.BLOCKED + ' block' }),
        ]));

        if (terminalEntries.length === 0) {
            frag.appendChild(h('div', { class: 'av2-note', text: 'No atoms ran.' }));
            frag.appendChild(h('div', { class: 'av2-dur', text: 'Duration: ' + report.durationMs + ' ms' }));
            return frag;
        }

        // ── Per-atom drill-down table, grouped by section ────────────
        const groups = new Map(); // groupKey → { label, rows: [] }
        const groupOrder = [];
        for (const e of terminalEntries) {
            const atomMeta = atomIndex[e.atom];
            const { group, label } = classifyAtom(e.atom, atomMeta, routeKey);
            if (!groups.has(group)) {
                groups.set(group, { label, rows: [] });
                groupOrder.push(group);
            }
            groups.get(group).rows.push({ entry: e, atomMeta });
        }

        const wrap = h('div', { class: 'av2-groups' });
        for (const g of groupOrder) {
            const { label, rows } = groups.get(g);
            const gdiv = renderGroup(label, rows, atomIndex);
            wrap.appendChild(gdiv);
        }
        frag.appendChild(wrap);

        frag.appendChild(h('div', { class: 'av2-dur', text: 'Duration: ' + report.durationMs + ' ms' }));
        return frag;
    }

    function renderGroup(groupLabel, rows, atomIndex) {
        const counts = { DONE: 0, SKIPPED: 0, FAILED: 0, BLOCKED: 0 };
        rows.forEach((r) => { if (counts[r.entry.state] != null) counts[r.entry.state]++; });

        // Group opens by default only when there are non-DONE rows; all-DONE
        // groups are collapsed so the user sees the problems first.
        const hasIssues = counts.FAILED > 0 || counts.SKIPPED > 0 || counts.BLOCKED > 0;

        const details = h('details', { class: 'av2-group' });
        if (hasIssues) details.setAttribute('open', 'open');

        const summary = h('summary', { class: 'av2-group-summary' });
        summary.appendChild(h('span', { class: 'av2-group-title', text: groupLabel }));
        summary.appendChild(h('span', { class: 'av2-group-counts' }, [
            counts.DONE    > 0 ? h('span', { class: 'av2-mini av2-done', text: '✅ ' + counts.DONE })    : null,
            counts.SKIPPED > 0 ? h('span', { class: 'av2-mini av2-skip', text: '⏭ ' + counts.SKIPPED }) : null,
            counts.FAILED  > 0 ? h('span', { class: 'av2-mini av2-fail', text: '❌ ' + counts.FAILED })  : null,
            counts.BLOCKED > 0 ? h('span', { class: 'av2-mini av2-blk',  text: '🚫 ' + counts.BLOCKED }) : null,
        ]));
        details.appendChild(summary);

        const table = h('ul', { class: 'av2-atom-list' });
        // Sort rows: FAILED → BLOCKED → SKIPPED → DONE, then by label.
        const order = { FAILED: 0, BLOCKED: 1, SKIPPED: 2, DONE: 3 };
        const sorted = rows.slice().sort((a, b) => {
            const ao = order[a.entry.state] ?? 9;
            const bo = order[b.entry.state] ?? 9;
            if (ao !== bo) return ao - bo;
            return getAtomLabel(a.entry.atom, atomIndex).localeCompare(getAtomLabel(b.entry.atom, atomIndex));
        });
        for (const r of sorted) {
            table.appendChild(renderAtomRow(r.entry, r.atomMeta, atomIndex));
        }
        details.appendChild(table);
        return details;
    }

    function renderAtomRow(entry, atomMeta, atomIndex) {
        const state = entry.state;
        const stateMeta = STATE_META[state] || STATE_META.FAILED;
        const detail = entry.detail || {};
        const label = getAtomLabel(entry.atom, atomIndex);

        const row = h('li', { class: 'av2-atom av2-' + state.toLowerCase() });

        // State badge
        row.appendChild(h('span', { class: 'av2-badge ' + stateMeta.cls,
            title: stateMeta.label, text: stateMeta.icon }));

        // Label + key + meta lines
        const body = h('div', { class: 'av2-atom-body' });
        const head = h('div', { class: 'av2-atom-head' }, [
            h('span', { class: 'av2-atom-label', text: label }),
            (label !== entry.atom) ? h('span', { class: 'av2-atom-key', text: entry.atom }) : null,
        ]);
        body.appendChild(head);

        // Second line: state text + reason + attempts + entity index
        const bits = [];
        bits.push(stateMeta.label);
        const r = reasonText(detail);
        if (r) bits.push(r);
        if (state === 'FAILED' && detail.attempts != null) {
            bits.push(`${detail.attempts} attempt${detail.attempts === 1 ? '' : 's'}`);
        }
        if (atomMeta && atomMeta.scope && atomMeta.index != null) {
            bits.push(`${atomMeta.scope} #${atomMeta.index + 1}`);
        }
        body.appendChild(h('div', { class: 'av2-atom-meta', text: bits.join(' · ') }));

        // Optional third line: fill/verify extra detail (errorText, error message)
        const extraBits = [];
        if (detail.fill && detail.fill.reason && detail.fill.reason !== detail.reason) {
            extraBits.push('fill: ' + detail.fill.reason);
        }
        if (detail.verify && detail.verify.reason && detail.verify.reason !== detail.reason) {
            extraBits.push('verify: ' + detail.verify.reason);
        }
        if (detail.errorText) extraBits.push('“' + detail.errorText + '”');
        if (detail.error)     extraBits.push(String(detail.error));
        if (extraBits.length > 0) {
            body.appendChild(h('div', { class: 'av2-atom-extra', text: extraBits.join(' · ') }));
        }

        row.appendChild(body);
        return row;
    }

    const api = { renderReport, classifyAtom, reasonText, STATE_META };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.ui = global.AltechV2.ui || {};
        global.AltechV2.ui.renderReport = renderReport;
        global.AltechV2.ui.reportHelpers = { classifyAtom, reasonText, STATE_META };
    }
})(typeof window !== 'undefined' ? window : globalThis);
