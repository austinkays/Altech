// js/cgl-utils.js — Pure formatters, parsers, and HTML micro-builders for the CGL dashboard.
//
// Extracted from js/compliance-dashboard.js during the monolith decomposition
// pass (May 2026), mirroring the hawksoft-export.js → hawksoft-renderers.js
// precedent. Every function here is PURE: it derives its result only from its
// arguments (plus the global Utils helper) — no `this`, no module state, no
// DOM, no network, no storage. That is what makes the extraction safe.
//
// Loaded BEFORE js/compliance-dashboard.js so the plugin IIFE can reference
// window.CglUtil. Names match the originals so the move was a mechanical
// `this.x()` → `CglUtil.x()` receiver swap (no behavior change).

'use strict';

window.CglUtil = (() => {
    'use strict';

    // Dual-escape (JS-string layer + HTML-attr layer) for any value
    // interpolated into onclick="X('${escJsAttr(v)}')". The JS layer must run
    // first; the HTML layer never touches backslashes so the order is safe.
    function escJsAttr(s) {
        if (s == null) return '';
        const js = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return Utils.escapeAttr(js);
    }

    function _hasAnnotationData(obj) {
        if (!obj) return false;
        return (Object.keys(obj.verifiedPolicies || {}).length > 0)
            || (Object.keys(obj.dismissedPolicies || {}).length > 0)
            || (Object.keys(obj.policyNotes || {}).length > 0)
            || (Object.keys(obj.clientCompliance || {}).length > 0);
    }

    // target keys win on conflicts, source fills gaps
    function _smartMergeDict(target, source) {
        const merged = { ...target };
        for (const key of Object.keys(source || {})) {
            if (!(key in merged)) {
                merged[key] = source[key];
            }
        }
        return merged;
    }

    // Migrate old single-text note format to log array format
    function _migrateNote(noteData) {
        if (!noteData) return null;
        // Already migrated
        if (noteData.log && Array.isArray(noteData.log)) return noteData;
        // Old format: { text, updatedAt }
        if (noteData.text) {
            return {
                log: [{ text: noteData.text, at: noteData.updatedAt || new Date().toISOString() }],
                renewedTo: noteData.renewedTo || null
            };
        }
        return null;
    }

    function formatNoteTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return diffMin + 'm ago';
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h ago';
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return diffDay + 'd ago';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function _noteIcon(text) {
        if (!text) return '💬';
        const t = text.toLowerCase();
        if (t === 'notified insured') return '📞';
        if (t === 'emailed insured') return '📧';
        if (t === 'left voicemail') return '📱';
        if (t === 'renewal term confirmed') return '✅';
        if (t === 'state website updated') return '🏛️';
        if (t.startsWith('auto-cleared')) return '🔄';
        if (t.startsWith('renewed')) return '🔄';
        if (text.startsWith('💤')) return '';
        return '💬';
    }

    function _noteLabel(text) {
        if (!text) return 'Note';
        const t = text.toLowerCase();
        if (t === 'notified insured') return 'Notified Insured';
        if (t === 'emailed insured') return 'Emailed Insured';
        if (t === 'left voicemail') return 'Left Voicemail';
        if (t === 'renewal term confirmed') return 'Renewal Confirmed';
        if (t === 'state website updated') return 'State Updated';
        if (t.startsWith('auto-cleared')) return 'Auto-Cleared';
        if (t.startsWith('renewed')) return 'Renewed';
        return 'Note';
    }

    function _noteIconHtml(text) {
        const icon = _noteIcon(text);
        if (!icon) return '';
        const label = _noteLabel(text);
        return `<span class="cgl-note-icon" title="${Utils.escapeAttr(label)}">${icon}</span> `;
    }

    // Policy types that may require state contractor licensing reports
    function _isLICCBApplicableType(policy) {
        const t = policy.policyType || 'cgl';
        return t === 'cgl' || t === 'pkg' || t === 'bop' || t === 'commercial';
    }

    function _summarizeLILookup(result) {
        if (!result) return null;
        if (result.contractor) {
            const c = result.contractor;
            return { license: c.licenseNumber || '', status: c.status || '', businessName: c.businessName || '' };
        }
        if (result.multipleResults && Array.isArray(result.results) && result.results.length) {
            const r = result.results[0];
            return { license: r.licenseNumber || '', status: r.status || '', businessName: r.businessName || '', multiple: true, count: result.count };
        }
        return null;
    }

    function _summarizeCCBLookup(result) {
        if (!result) return null;
        if (result.contractor) {
            const c = result.contractor;
            return { number: c.ccbNumber || c.licenseNumber || '', status: c.status || '', businessName: c.businessName || '' };
        }
        if (result.multipleResults && Array.isArray(result.results) && result.results.length) {
            const r = result.results[0];
            return { number: r.licenseNumber || '', status: r.status || '', businessName: r.businessName || '', multiple: true, count: result.count };
        }
        return null;
    }

    function _scrubUndefined(obj) {
        if (obj === undefined) return null;
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(v => _scrubUndefined(v));
        const out = {};
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (v === undefined) continue;
            if (k === '') continue; // skip empty field names
            out[k] = _scrubUndefined(v);
        }
        return out;
    }

    function getStatusLabel(daysUntilExpiration) {
        if (daysUntilExpiration < 0) return `Expired ${Math.abs(daysUntilExpiration)} days ago`;
        if (daysUntilExpiration === 0) return 'Expired today';
        if (daysUntilExpiration === 1) return 'Expires tomorrow';
        return `${daysUntilExpiration} days`;
    }

    // Build a clickable HawkSoft link for a client name.
    // Desktop: hs:// protocol → HawkSoft desktop app
    // Mobile:  Agent Portal web URL
    function clientLink(policy) {
        const name = Utils.escapeHTML(policy.clientName);
        const hsId = policy.hawksoftId || policy.clientNumber;
        if (!hsId) return `<span style="font-weight:600;">${name}</span>`;

        const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
        const href = isMobile
            ? `https://agents.hawksoft.app/client/${encodeURIComponent(hsId)}`
            : `hs://${encodeURIComponent(hsId)}`;
        const title = isMobile ? 'Open in HawkSoft Agent Portal' : 'Open in HawkSoft';
        return `<a href="${href}" class="cgl-client-link" title="${title}" target="_blank" rel="noopener">${name}</a>`;
    }

    function _typeLabel(type) {
        const labels = {
            cgl: 'CGL', bond: 'Bond', auto: 'Auto', wc: 'WC',
            pkg: 'Pkg', umbrella: 'Umbrella', im: 'Inland Marine',
            property: 'Property', epli: 'EPLI', do: 'D&O',
            eo: 'E&O', cyber: 'Cyber', crime: 'Crime',
            liquor: 'Liquor', garage: 'Garage', pollution: 'Pollution',
            bop: 'BOP', commercial: 'Comm'
        };
        return labels[type] || type.toUpperCase();
    }

    return {
        escJsAttr,
        _hasAnnotationData,
        _smartMergeDict,
        _migrateNote,
        formatNoteTime,
        _noteIcon,
        _noteLabel,
        _noteIconHtml,
        _isLICCBApplicableType,
        _summarizeLILookup,
        _summarizeCCBLookup,
        _scrubUndefined,
        getStatusLabel,
        clientLink,
        _typeLabel,
    };
})();
