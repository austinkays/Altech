// intake-v2-export.js — Native v2 export orchestrator (PDF / CMSMTF / EZLynx).
//
// As of May 2026 the three structured exports are NATIVE to v2:
//   - PDF             → js/intake-v2-export-pdf.js
//   - CMSMTF          → js/intake-v2-export-cmsmtf.js
//   - EZLynx EZAUTO   → js/intake-v2-export-ezlynx.js
//   - EZLynx EZHOME   → js/intake-v2-export-ezlynx.js
//
// The legacy bridge (intake-v2-export-map.js → App.buildCMSMTF / App.build-
// EZLynx{,Home}XML) is retained only for `fromLegacyShape` (importing a v1
// quote into v2). The export side is no longer routed through it because the
// bridge silently dropped multi-home data, per-asset lien holders, SR-22
// filings, license-status flags, mortgagee address/loan number, vehicle
// telematics/TNC/anti-lock/anti-theft, driver-level industry/occupation,
// CreditCheckAuth, YearsWithContinuousCoverage, and — critically for EZHOME —
// the actual deductible value inside <DeductibeInfo/>.
//
// Boats and RVs continue to be PDF-only: HawkSoft personal-lines CMSMTF and
// EZLynx V200 EZAUTO/EZHOME have no native boat/RV schema. The PDF carries
// every product type.

'use strict';

(function () {

// ─── PDF orchestrator ─────────────────────────────────────────────────────
// Two layouts ship side-by-side:
//   - 'summary'    — underwriting snapshot + dense detail dossier (default,
//                    matches existing UI muscle memory).
//   - 'factfinder' — EZLynx Personal Lines app-order layout for agents who
//                    are actively transcribing into a carrier rater.
async function exportPDF(opts) {
    opts = opts || {};
    const layout = (opts.layout === 'factfinder') ? 'factfinder' : 'summary';
    try {
        if (!window.IntakeV2PDFBuilder) throw new Error('IntakeV2PDFBuilder not loaded');
        const doc = await window.IntakeV2PDFBuilder.buildIntakeV2PDF(window.IntakeV2.data, { layout });
        const suffix = layout === 'factfinder' ? 'factfinder' : 'summary';
        const baseName = window.IntakeV2PDFBuilder.pdfFilename(window.IntakeV2.data);
        // Inject the layout suffix into the filename before `.pdf` so the
        // agent can keep summary + fact-finder side-by-side without
        // overwriting.
        const name = baseName.replace(/\.pdf$/i, `_${suffix}.pdf`);
        doc.save(name);
        if (window.App && window.App.logExport) {
            window.App.logExport(`Intake v2 PDF (${layout})`, name);
        }
        if (window.ActivityLog) window.ActivityLog.add({
            type: 'export', area: 'intake-v2', ok: true,
            message: layout === 'factfinder'
                ? 'PDF fact finder downloaded'
                : 'PDF intake summary downloaded',
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('exportPDF failed:', err);
        if (window.App && window.App.toast) {
            window.App.toast('PDF export failed: ' + (err && err.message || err), { type: 'error' });
        }
    }
}

async function exportPDFSummary()    { return exportPDF({ layout: 'summary' }); }
async function exportPDFFactFinder() { return exportPDF({ layout: 'factfinder' }); }

// Public alias for tests + CommandPalette
async function buildIntakeV2PDF(data, opts) {
    if (!window.IntakeV2PDFBuilder) throw new Error('IntakeV2PDFBuilder not loaded');
    return window.IntakeV2PDFBuilder.buildIntakeV2PDF(data, opts);
}

// ─── CMSMTF orchestrator (native) ─────────────────────────────────────────
function exportCMSMTF() {
    try {
        const d = window.IntakeV2.data || {};
        const hasHome = Array.isArray(d.homes) && d.homes.length > 0;
        const hasAuto = Array.isArray(d.autos) && d.autos.length > 0;
        if (!hasHome && !hasAuto) {
            if (window.App && window.App.toast) {
                window.App.toast('HawkSoft CMSMTF supports Home / Auto only — add at least one to use this export', { type: 'info', duration: 4000 });
            }
            return;
        }
        if (!window.IntakeV2CMSMTF) throw new Error('IntakeV2CMSMTF builder not loaded');
        const result = window.IntakeV2CMSMTF.buildIntakeV2CMSMTF(d);
        if (window.App && typeof window.App.downloadFile === 'function') {
            window.App.downloadFile(result.content, result.filename, result.mime);
        }
        if (window.App && window.App.logExport) window.App.logExport('CMSMTF (Intake v2)', result.filename);
        if (window.ActivityLog) window.ActivityLog.add({
            type: 'export', area: 'intake-v2', ok: true,
            message: 'HawkSoft CMSMTF generated',
        });
        if (window.App && window.App.toast) {
            window.App.toast('HawkSoft file generated', { type: 'success' });
        }
    } catch (err) {
        if (window.App && window.App.toast) {
            window.App.toast('CMSMTF export failed: ' + (err && err.message || err), { type: 'error' });
        }
        if (window.ActivityLog) window.ActivityLog.add({
            type: 'error', area: 'intake-v2', ok: false,
            message: 'CMSMTF export failed',
            detail: String(err && err.message || err),
        });
    }
}

// ─── EZLynx XML orchestrator (native) ─────────────────────────────────────
function exportEZLynxXML() {
    try {
        const d = window.IntakeV2.data || {};
        const hasHome = Array.isArray(d.homes) && d.homes.length > 0;
        const hasAuto = Array.isArray(d.autos) && d.autos.length > 0;
        if (!hasHome && !hasAuto) {
            if (window.App && window.App.toast) {
                window.App.toast('EZLynx XML supports Home / Auto only — add at least one to use this export', { type: 'info', duration: 4000 });
            }
            return;
        }
        if (!window.IntakeV2EZLynxXML) throw new Error('IntakeV2EZLynxXML builders not loaded');

        const downloads = [];
        if (hasAuto) downloads.push(window.IntakeV2EZLynxXML.buildIntakeV2EZAutoXML(d));
        if (hasHome) downloads.push(window.IntakeV2EZLynxXML.buildIntakeV2EZHomeXML(d));

        if (window.App && typeof window.App.downloadFile === 'function') {
            for (const r of downloads) {
                window.App.downloadFile(r.content, r.filename || 'ezlynx.xml', r.mime || 'application/xml');
            }
        }
        if (window.App && window.App.logExport) {
            window.App.logExport(`EZLynx XML (Intake v2)`, downloads.map(r => r.filename).join(', '));
        }
        if (window.ActivityLog) window.ActivityLog.add({
            type: 'export', area: 'intake-v2', ok: true,
            message: `EZLynx XML generated (${downloads.length} file${downloads.length > 1 ? 's' : ''})`,
        });
        if (window.App && window.App.toast) {
            window.App.toast(`EZLynx XML generated (${downloads.length} file${downloads.length > 1 ? 's' : ''})`, { type: 'success' });
        }
    } catch (err) {
        if (window.App && window.App.toast) {
            window.App.toast('EZLynx export failed: ' + (err && err.message || err), { type: 'error' });
        }
        if (window.ActivityLog) window.ActivityLog.add({
            type: 'error', area: 'intake-v2', ok: false,
            message: 'EZLynx export failed',
            detail: String(err && err.message || err),
        });
    }
}

// ─── Save as quote (unchanged) ────────────────────────────────────────────
// CryptoHelper.encrypt/decrypt return Promises (AES-GCM via crypto.subtle).
// Earlier this function called them synchronously and then JSON.parse'd the
// Promise, which threw and silently reset the list to [] — corrupting every
// previously-saved quote on every save. Now properly async with await.
async function saveAsQuote() {
    try {
        const key = window.STORAGE_KEYS && window.STORAGE_KEYS.INTAKE_V2_QUOTES;
        if (!key) return;
        const existingRaw = localStorage.getItem(key);
        let list = [];
        if (existingRaw) {
            try {
                let plain = existingRaw;
                if (window.CryptoHelper && typeof window.CryptoHelper.decrypt === 'function') {
                    const r = window.CryptoHelper.decrypt(existingRaw);
                    plain = (r && typeof r.then === 'function') ? await r : r;
                }
                if (plain) {
                    const parsed = typeof plain === 'string' ? JSON.parse(plain) : plain;
                    if (Array.isArray(parsed)) list = parsed;
                }
            } catch (err) {
                if (window.App && window.App.toast) {
                    window.App.toast('Existing quote library could not be read — refusing to overwrite', { type: 'error' });
                }
                if (window.ActivityLog) {
                    window.ActivityLog.add({
                        type: 'error', area: 'intake-v2', ok: false,
                        message: 'Quote library decrypt failed; save aborted',
                        detail: String(err && err.message || err),
                    });
                }
                return;
            }
        }
        const snapshot = JSON.parse(JSON.stringify(window.IntakeV2.data));
        snapshot.meta = snapshot.meta || {};
        snapshot.meta.savedAt = new Date().toISOString();
        if (!snapshot.meta.quoteId) snapshot.meta.quoteId = window.IntakeV2._newId('iv2-quote');
        list = list.filter(q => q.meta && q.meta.quoteId !== snapshot.meta.quoteId);
        list.unshift(snapshot);
        const payload = JSON.stringify(list);
        let stored = payload;
        if (window.CryptoHelper && typeof window.CryptoHelper.encrypt === 'function') {
            try {
                const r = window.CryptoHelper.encrypt(payload);
                const out = (r && typeof r.then === 'function') ? await r : r;
                if (typeof out === 'string' && out.length) stored = out;
            } catch (_) { /* fall back to plaintext */ }
        }
        localStorage.setItem(key, stored);
        if (window.Sync && typeof window.Sync.schedulePush === 'function') window.Sync.schedulePush();
        if (window.App && window.App.toast) window.App.toast('Quote saved to library', { type: 'success' });
        if (window.ActivityLog) window.ActivityLog.add({ type: 'save', area: 'intake-v2', ok: true, message: 'Quote saved to library' });
    } catch (err) {
        if (window.App && window.App.toast) window.App.toast('Save quote failed: ' + (err && err.message || err), { type: 'error' });
        if (window.ActivityLog) window.ActivityLog.add({ type: 'error', area: 'intake-v2', ok: false, message: 'Save quote failed', detail: String(err && err.message || err) });
    }
}

window.IntakeV2.exportPDF             = exportPDF;
window.IntakeV2.exportPDFSummary      = exportPDFSummary;
window.IntakeV2.exportPDFFactFinder   = exportPDFFactFinder;
window.IntakeV2.exportCMSMTF     = exportCMSMTF;
window.IntakeV2.exportEZLynxXML  = exportEZLynxXML;
window.IntakeV2.saveAsQuote      = saveAsQuote;
window.IntakeV2.buildIntakeV2PDF = buildIntakeV2PDF;

// Register CommandPalette entries once on boot
window.IntakeV2.onBoot(function () {
    if (!window.CommandPalette || typeof window.CommandPalette.register !== 'function') return;
    window.CommandPalette.register({ id: 'intakev2.export.pdf',             label: 'Intake v2 — Export PDF Summary',     icon: '📄', run: () => window.IntakeV2.exportPDFSummary() });
    window.CommandPalette.register({ id: 'intakev2.export.pdf-factfinder',  label: 'Intake v2 — Export PDF Fact Finder', icon: '📋', run: () => window.IntakeV2.exportPDFFactFinder() });
    window.CommandPalette.register({ id: 'intakev2.export.cmsmtf',  label: 'Intake v2 — Export HawkSoft (home/auto)', icon: '📤', run: () => window.IntakeV2.exportCMSMTF() });
    window.CommandPalette.register({ id: 'intakev2.export.ezlynx',  label: 'Intake v2 — Export EZLynx XML (home/auto)', icon: '⚡', run: () => window.IntakeV2.exportEZLynxXML() });
    window.CommandPalette.register({ id: 'intakev2.save-as-quote',  label: 'Intake v2 — Save as quote', icon: '💾', run: () => window.IntakeV2.saveAsQuote() });
    window.CommandPalette.register({ id: 'intakev2.add.operator',   label: 'Intake v2 — Add operator',  icon: '👤', run: () => window.IntakeV2.addItem('operators', {}) });
    window.CommandPalette.register({ id: 'intakev2.add.home',       label: 'Intake v2 — Add home',      icon: '🏠', run: () => window.IntakeV2.addItem('homes', {}) });
    window.CommandPalette.register({ id: 'intakev2.add.auto',       label: 'Intake v2 — Add auto',      icon: '🚗', run: () => window.IntakeV2.addItem('autos', {}) });
    window.CommandPalette.register({ id: 'intakev2.add.boat',       label: 'Intake v2 — Add boat/PWC',  icon: '⛵', run: () => window.IntakeV2.addItem('boats', {}) });
    window.CommandPalette.register({ id: 'intakev2.add.rv',         label: 'Intake v2 — Add RV',        icon: '🚐', run: () => window.IntakeV2.addItem('rvs', {}) });
    window.CommandPalette.register({ id: 'intakev2.toggle.mode',    label: 'Intake v2 — Toggle Quick / Full mode', icon: '⏺', run: () => {
        if (window.IntakeV2._layout) window.IntakeV2._layout.setMode(window.IntakeV2.mode === 'quick' ? 'full' : 'quick');
    }});
});

})();
