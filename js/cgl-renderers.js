// js/cgl-renderers.js — Pure HTML builders for the CGL dashboard's badge/note layer.
//
// Second cut of the compliance-dashboard.js monolith decomposition (May 2026),
// continuing the js/cgl-utils.js extraction and mirroring the
// hawksoft-export.js → hawksoft-renderers.js precedent. These three builders
// were render-shaped but each had a single `this` dependency (the client
// compliance record / the note data); threading that value in as an argument
// makes them PURE — args + globals (CglUtil/Utils) only, no `this`, DOM,
// storage, or network. onclick handlers stay as `ComplianceDashboard.*`
// string literals (resolved globally at click time — no import needed).
//
// Loaded BEFORE js/compliance-dashboard.js (after cgl-utils.js) so the plugin
// IIFE can reference window.CglRenderers.

'use strict';

window.CglRenderers = (() => {
    'use strict';

    // WA L&I / OR CCB reporting badges. `c` = the client's compliance record
    // (ComplianceDashboard.getClientCompliance(clientNumber)) or null.
    function liCcbBadges(policy, c) {
        if (!CglUtil._isLICCBApplicableType(policy)) return '';
        const cn = CglUtil.escJsAttr(policy.clientNumber || '');
        const exp = policy.expirationDate || '';
        if (!c || !c.classification || c.classification === 'unverified') {
            return `<span class="cgl-li-badge unverified" onclick="ComplianceDashboard.reverifyClient('${cn}')" title="Verify against WA L&amp;I and OR CCB">❓ Verify</span>`;
        }
        if (c.classification === 'exempt') return '';
        const html = [];
        if (c.classification === 'wa-contractor' || c.classification === 'wa-or-contractor') {
            const reported = c.waReportedForExp && c.waReportedForExp === exp;
            if (reported) {
                const date = c.waReportedAt ? new Date(c.waReportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                html.push(`<span class="cgl-li-badge reported" onclick="ComplianceDashboard.clearReportedWA('${cn}')" title="Reported to WA L&amp;I${date ? ' on ' + date : ''}. Click to clear.">✅ WA L&amp;I${date ? ' · ' + date : ''}</span>`);
            } else {
                html.push(`<span class="cgl-li-badge needs-report" onclick="ComplianceDashboard.markReportedToWA('${cn}', '${CglUtil.escJsAttr(exp)}')" title="Mark as reported to lni.wa.gov for current expiration">🛠️ WA L&amp;I</span>`);
            }
        }
        if (c.classification === 'or-contractor' || c.classification === 'wa-or-contractor') {
            const reported = c.orReportedForExp && c.orReportedForExp === exp;
            if (reported) {
                const date = c.orReportedAt ? new Date(c.orReportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                html.push(`<span class="cgl-ccb-badge reported" onclick="ComplianceDashboard.clearReportedOR('${cn}')" title="Reported to OR CCB${date ? ' on ' + date : ''}. Click to clear.">✅ OR CCB${date ? ' · ' + date : ''}</span>`);
            } else {
                html.push(`<span class="cgl-ccb-badge needs-report" onclick="ComplianceDashboard.markReportedToOR('${cn}', '${CglUtil.escJsAttr(exp)}')" title="Mark as reported to ccb.state.or.us for current expiration">🛠️ OR CCB</span>`);
            }
        }
        return html.join(' ');
    }

    // Classification override controls (used inside the note editor row).
    // `c` = the client's compliance record or null/undefined.
    function classificationOverride(policy, c) {
        if (!CglUtil._isLICCBApplicableType(policy)) return '';
        c = c || {};
        const cn = CglUtil.escJsAttr(policy.clientNumber || '');
        const cls = c.classification || 'unverified';
        const src = c.classificationSource || 'auto';
        const opt = (val, label) => `<button class="cgl-class-btn ${cls === val ? 'active' : ''}" onclick="ComplianceDashboard.setClientClassification('${cn}', '${val}')">${label}</button>`;
        const sourceLabel = src === 'manual' ? 'manual override' : (cls === 'unverified' ? 'unverified' : 'auto-detected');
        return `
            <div class="cgl-classification-row">
                <span class="cgl-classification-label" title="Determines whether this client appears in the WA L&amp;I / OR CCB reporting queue">🏷️ L&amp;I/CCB:</span>
                ${opt('wa-contractor', 'WA L&amp;I')}
                ${opt('or-contractor', 'OR CCB')}
                ${opt('wa-or-contractor', 'Both')}
                ${opt('exempt', 'Exempt')}
                <button class="cgl-class-reverify" onclick="ComplianceDashboard.reverifyClient('${cn}')" title="Re-run automatic verification against L&amp;I and CCB registries">🔄 Re-verify</button>
                <span class="cgl-classification-source">${sourceLabel}</span>
            </div>
        `;
    }

    // Note-history log. `data` = ComplianceDashboard.getNoteData(policyNumber)
    // (or null); `policyNumber` is still needed for the delete-entry onclick.
    function noteLog(policyNumber, data) {
        if (!data || !data.log || data.log.length === 0) return '';
        return data.log.slice().reverse().map((entry, revIdx) => {
            const origIdx = data.log.length - 1 - revIdx;
            const iconHtml = CglUtil._noteIconHtml(entry.text);
            return `
            <div class="cgl-note-entry">
                <span class="cgl-note-entry-text">${iconHtml}${Utils.escapeHTML(entry.text)}</span>
                <span class="cgl-note-entry-time">${CglUtil.formatNoteTime(entry.at)}</span>
                <button class="cgl-note-delete-btn" onclick="ComplianceDashboard.deleteNoteEntry('${CglUtil.escJsAttr(policyNumber)}',${origIdx})" title="Delete this note">&times;</button>
            </div>
        `;
        }).join('');
    }

    return { liCcbBadges, classificationOverride, noteLog };
})();
