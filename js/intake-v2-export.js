// intake-v2-export.js — PDF intake summary + CMSMTF/EZLynx wrappers.
//
// PDF is the primary export for v2 (covers all four products including boats
// and RVs). The CMSMTF and EZLynx XML exports work for home/auto only by
// translating v2 nested data to the legacy flat shape and calling the
// existing App.buildCMSMTF / App.buildEZLynxXML / App.buildEZLynxHomeXML
// functions. The legacy builders read this.drivers / this.vehicles / this.data
// off the App object, so we temporarily swap those in and restore in a finally.

'use strict';

(function () {

const esc = (s) => String(s ?? '');

// ─── PDF intake summary ────────────────────────────────────────────────────
async function buildIntakeV2PDF(data) {
    data = data || window.IntakeV2.data;
    if (!window.PDFLibs || typeof window.PDFLibs.ensure !== 'function') {
        throw new Error('PDFLibs not available');
    }
    await window.PDFLibs.ensure('jspdf');
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF not loaded');
    const doc = new jsPDFCtor({ unit: 'pt', format: 'letter' });

    const MARGIN_X = 40;
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    let y = 50;

    function ensureSpace(needed) {
        if (y + needed > PAGE_H - 40) { doc.addPage(); y = 50; }
    }
    function header(text) {
        ensureSpace(28);
        doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 20, 20);
        doc.text(text, MARGIN_X, y);
        y += 6;
        doc.setDrawColor(180).setLineWidth(0.5);
        doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
        y += 14;
        doc.setFontSize(10).setTextColor(40, 40, 40).setFont('helvetica', 'normal');
    }
    function row(label, value) {
        if (value == null || value === '' || value === false) return;
        const s = String(value);
        ensureSpace(16);
        doc.setFont('helvetica', 'bold').text(label + ':', MARGIN_X, y);
        doc.setFont('helvetica', 'normal').text(s, MARGIN_X + 130, y);
        y += 14;
    }
    function block(title, kvPairs) {
        const filled = kvPairs.filter(([, v]) => v != null && v !== '' && v !== false);
        if (!filled.length) return;
        ensureSpace(18 + filled.length * 14);
        doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(60, 60, 60).text(title, MARGIN_X, y);
        y += 14;
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(20, 20, 20);
        filled.forEach(([k, v]) => row(k, v));
        y += 4;
    }

    // ── Page header ────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(0, 0, 0);
    doc.text('Personal Intake Summary', MARGIN_X, y); y += 22;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(120, 120, 120);
    doc.text(`Generated ${new Date().toLocaleString()}`, MARGIN_X, y); y += 16;

    // ── Quote Summary ──────────────────────────────────────────────────────
    header('Quote Summary');
    const products = [];
    if (data.homes.length) products.push(`${data.homes.length} Home${data.homes.length>1?'s':''}`);
    if (data.autos.length) products.push(`${data.autos.length} Auto${data.autos.length>1?'s':''}`);
    if (data.boats.length) products.push(`${data.boats.length} Boat${data.boats.length>1?'s':''}`);
    if (data.rvs.length)   products.push(`${data.rvs.length} RV${data.rvs.length>1?'s':''}`);
    row('Products', products.join(' · ') || '—');
    if (window.IntakeV2Bindability) {
        const b = window.IntakeV2Bindability.computeBindability({ data });
        if (b) {
            const ready = Object.entries(b).filter(([, v]) => v.ok).map(([k, v]) => v.label);
            row('Carrier-fit', ready.length ? `Ready: ${ready.join(', ')}` : 'No carriers ready yet');
        }
    }

    // ── Applicant ──────────────────────────────────────────────────────────
    header('Applicant');
    const a = data.applicant;
    block('Primary applicant', [
        ['Name',       [a.prefix, a.firstName, a.middleName, a.lastName, a.suffix].filter(Boolean).join(' ')],
        ['DOB',        a.dob],
        ['Gender',     a.gender],
        ['Marital',    a.maritalStatus],
        ['Phone',      a.phone],
        ['Email',      a.email],
        ['Occupation', a.occupation],
        ['Industry',   a.industry],
        ['Education',  a.education],
    ]);
    if (data.coApplicant.present) {
        const c = data.coApplicant;
        block('Co-Applicant', [
            ['Name',         [c.prefix, c.firstName, c.lastName, c.suffix].filter(Boolean).join(' ')],
            ['Relationship', c.relationship],
            ['DOB',          c.dob],
            ['Gender',       c.gender],
            ['Marital',      c.maritalStatus],
            ['Phone',        c.phone],
            ['Email',        c.email],
            ['Occupation',   c.occupation],
        ]);
    }

    // ── Address ────────────────────────────────────────────────────────────
    header('Address');
    const ad = data.address;
    row('Mailing', [ad.street, ad.city, ad.state, ad.zip].filter(Boolean).join(', '));
    if (ad.county)    row('County', ad.county);
    if (ad.yearsAt)   row('Years at address', ad.yearsAt);
    if (ad.previous && ad.previous.street) row('Previous', [ad.previous.street, ad.previous.city, ad.previous.state, ad.previous.zip].filter(Boolean).join(', '));

    // ── Operators ──────────────────────────────────────────────────────────
    header(`Operators (${data.operators.length})`);
    data.operators.forEach((op, i) => {
        block(`#${i+1}  ${op.firstName || ''} ${op.lastName || ''}`.trim() || 'Operator', [
            ['DOB',           op.dob],
            ['DL',            [op.dl && op.dl.num, op.dl && op.dl.state].filter(Boolean).join(' / ')],
            ['Status',        op.dl && op.dl.status],
            ['Relationship',  op.relationship],
            ['Yrs Auto',      op.dl && op.dl.yearsAuto],
            ['Yrs Boat',      op.dl && op.dl.yearsBoat],
            ['Yrs RV',        op.dl && op.dl.yearsRV],
            ['Occupation',    op.occupation],
            ['Marital',       op.maritalStatus],
            ['Role',          op.isPrimaryApplicant ? 'Primary applicant' : (op.isCoApplicant ? 'Co-applicant' : '')],
        ]);
    });

    // ── Homes ──────────────────────────────────────────────────────────────
    if (data.homes.length) {
        header(`Homes (${data.homes.length})`);
        data.homes.forEach((h, i) => {
            block(`#${i+1}  ${h.address || 'Home'}`, [
                ['Year built',     h.yrBuilt],
                ['Square feet',    h.sqFt],
                ['Lot size',       h.lotSize],
                ['Dwelling type',  h.dwellingType],
                ['Usage',          h.dwellingUsage],
                ['Occupancy',      h.occupancyType],
                ['Stories',        h.numStories],
                ['Occupants',      h.numOccupants],
                ['Bedrooms',       h.bedrooms],
                ['Baths',          [h.fullBaths, h.halfBaths].filter(Boolean).join(' / ')],
                ['Construction',   h.construction],
                ['Exterior',       h.exterior],
                ['Foundation',     h.foundation],
                ['Garage',         [h.garage && h.garage.type, h.garage && h.garage.spaces].filter(Boolean).join(' · ')],
                ['Roof',           [h.roof && h.roof.type, h.roof && h.roof.shape, h.roof && h.roof.yr].filter(Boolean).join(' · ')],
                ['Heating',        h.systems && h.systems.heatingType],
                ['Cooling',        h.systems && h.systems.coolingType],
                ['Plumbing yr',    h.systems && h.systems.plumbingYr],
                ['Electrical yr',  h.systems && h.systems.electricalYr],
                ['Protection class', h.hazards && h.hazards.protectionClass],
                ['Fire station',   h.hazards && h.hazards.fireStationDist],
                ['Hydrant feet',   h.hazards && h.hazards.fireHydrantFeet],
                ['Alarms',         h.hazards && h.hazards.alarms],
            ]);
        });
    }

    // ── Autos ──────────────────────────────────────────────────────────────
    if (data.autos.length) {
        header(`Autos (${data.autos.length})`);
        data.autos.forEach((v, i) => {
            const primary = (data.operators || []).find(o => o.id === v.primaryOperatorId);
            const adds = (v.additionalOperatorIds || []).map(id => (data.operators || []).find(o => o.id === id)).filter(Boolean).map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim()).join(', ');
            block(`#${i+1}  ${[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Auto'}`, [
                ['VIN',         v.vin],
                ['Garaging ZIP',v.garagingZip],
                ['Use',         v.useType],
                ['Annual mi',   v.annualMiles],
                ['Ownership',   v.ownership],
                ['Primary',     primary ? `${primary.firstName || ''} ${primary.lastName || ''}`.trim() : ''],
                ['Additional',  adds],
                ['Liability',   v.coverages && v.coverages.liab],
                ['Coll ded',    v.coverages && v.coverages.collDed],
                ['Comp ded',    v.coverages && v.coverages.compDed],
                ['UM/UIM',      v.coverages && v.coverages.umuim],
                ['Med pay',     v.coverages && v.coverages.medpay],
            ]);
        });
    }

    // ── Boats ──────────────────────────────────────────────────────────────
    if (data.boats.length) {
        header(`Boats / PWC (${data.boats.length})`);
        data.boats.forEach((b, i) => {
            const primary = (data.operators || []).find(o => o.id === b.primaryOperatorId);
            const adds = (b.additionalOperatorIds || []).map(id => (data.operators || []).find(o => o.id === id)).filter(Boolean).map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim()).join(', ');
            block(`#${i+1}  ${[b.year, b.make, b.model].filter(Boolean).join(' ') || 'Boat'} (${b.kind || 'boat'})`, [
                ['Length (ft)',     b.length],
                ['HIN',             b.hin],
                ['Hull material',   b.hullMaterial],
                ['Hull design',     b.hullDesign],
                ['Propulsion',      b.propulsion],
                ['Engines',         b.engineCount],
                ['Total HP',        b.totalHP],
                ['Max speed (mph)', b.maxSpeed],
                ['Modifications',   b.modifications],
                ['Mooring ZIP',     b.mooringZip],
                ['Waters',          b.navigationWaters],
                ['Lay-up',          b.layUpMonths],
                ['Market value',    b.marketValue],
                ['Purchase price',  b.purchasePrice],
                ['Addl equipment',  b.addlEquipmentValue],
                ['Trailer',         b.trailer && [b.trailer.year, b.trailer.make, b.trailer.capacityLbs ? b.trailer.capacityLbs + ' lbs' : '', b.trailer.axles ? b.trailer.axles + ' axles' : ''].filter(Boolean).join(' · ')],
                ['Trailer value',   b.trailer && b.trailer.value],
                ['Docs on file',    [b.docs && b.docs.billOfSale && 'Bill of sale', b.docs && b.docs.dealerAppraisal && 'Dealer appraisal', b.docs && b.docs.photos && 'Photos', b.docs && b.docs.marineSurvey && 'Marine survey'].filter(Boolean).join(', ')],
                ['Usage',           [b.usage && b.usage.pleasure && 'Pleasure', b.usage && b.usage.rental && 'Rental', b.usage && b.usage.charter && 'Charter', b.usage && b.usage.commercial && 'Commercial'].filter(Boolean).join(', ')],
                ['Primary',         primary ? `${primary.firstName || ''} ${primary.lastName || ''}`.trim() : ''],
                ['Additional',      adds],
            ]);
        });
    }

    // ── RVs ────────────────────────────────────────────────────────────────
    if (data.rvs.length) {
        header(`RVs (${data.rvs.length})`);
        data.rvs.forEach((r, i) => {
            const primary = (data.operators || []).find(o => o.id === r.primaryOperatorId);
            const adds = (r.additionalOperatorIds || []).map(id => (data.operators || []).find(o => o.id === id)).filter(Boolean).map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim()).join(', ');
            block(`#${i+1}  ${[r.year, r.make, r.model].filter(Boolean).join(' ') || 'RV'} · Class ${r.class || '?'}`, [
                ['VIN',             r.vin],
                ['Length (ft)',     r.length],
                ['Garaging ZIP',    r.garagingZip],
                ['Full-timer',      r.fullTimer ? 'Yes' : ''],
                ['Stationary',      r.stationary ? 'Yes' : ''],
                ['Rented/chartered',r.rentalCharter ? 'Yes' : ''],
                ['Market value',    r.marketValue],
                ['Purchase price',  r.purchasePrice],
                ['Addl equipment',  r.addlEquipmentValue],
                ['Total Loss Replacement', r.totalLossReplacementRequested ? 'Requested' : ''],
                ['Primary',         primary ? `${primary.firstName || ''} ${primary.lastName || ''}`.trim() : ''],
                ['Additional',      adds],
            ]);
        });
    }

    // ── Prior Insurance + Discounts ────────────────────────────────────────
    header('Prior Insurance, Discounts, Affinity');
    const pi = data.priorInsurance;
    row('Continuous coverage', pi.continuous);
    row('Continuous months',   pi.continuousMonths);
    ['home','auto','boat','rv'].forEach(line => {
        const p = pi[line];
        if (p && (p.carrier || p.exp)) row(`Prior ${line}`, [p.carrier, p.exp ? `exp ${p.exp}` : '', p.limits].filter(Boolean).join(' · '));
    });
    const dc = data.discounts;
    const discList = [];
    if (dc.homeowner) discList.push('Homeowner');
    if (dc.safetyCourse && dc.safetyCourse.auto) discList.push('Defensive driver');
    if (dc.safetyCourse && dc.safetyCourse.boat) discList.push('Boater safety');
    if (dc.safetyCourse && dc.safetyCourse.rv) discList.push('RV safety');
    row('Discounts', discList.join(', '));
    const affList = [];
    if (dc.affinity && dc.affinity.usaa) affList.push('USAA');
    if (dc.affinity && dc.affinity.hog) affList.push('HOG');
    if (dc.affinity && dc.affinity.uscgAux) affList.push('USCG Aux');
    if (dc.affinity && dc.affinity.usps) affList.push('US Power Squadron');
    row('Affinity', affList.join(', '));

    // ── History ────────────────────────────────────────────────────────────
    header('Loss & Violation History (35 mo)');
    if (data.history.hasCleanHistory) {
        row('Status', 'Clean record (all operators)');
    } else {
        (data.history.losses || []).forEach((L, i) => {
            const op = (data.operators || []).find(o => o.id === L.operatorId);
            row(`Loss #${i+1}`, [L.date, L.type, L.amount ? `$${L.amount}` : '', op ? `${op.firstName || ''} ${op.lastName || ''}`.trim() : '', L.asset].filter(Boolean).join(' · '));
        });
        (data.history.violations || []).forEach((V, i) => {
            const op = (data.operators || []).find(o => o.id === V.operatorId);
            row(`Violation #${i+1}`, [V.date, V.type, op ? `${op.firstName || ''} ${op.lastName || ''}`.trim() : ''].filter(Boolean).join(' · '));
        });
        if (!(data.history.losses || []).length && !(data.history.violations || []).length) {
            row('Status', 'No incidents reported yet');
        }
    }

    // ── Follow-up (deferred) ───────────────────────────────────────────────
    if ((data.deferred || []).length) {
        header(`Follow-up (${data.deferred.length})`);
        const labels = data.deferred.map(p => window.IntakeV2._defer ? window.IntakeV2._defer.labelForPath(p) : p);
        labels.forEach((l, i) => row(`${i+1}.`, l));
    }

    // ── Notes ──────────────────────────────────────────────────────────────
    if (data.notes && data.notes.freeText) {
        header('Agent Notes');
        doc.setFont('helvetica', 'normal').setFontSize(10);
        const split = doc.splitTextToSize(String(data.notes.freeText), PAGE_W - 2 * MARGIN_X);
        ensureSpace(split.length * 12 + 6);
        doc.text(split, MARGIN_X, y);
        y += split.length * 12;
    }

    return doc;
}

async function exportPDF() {
    try {
        const doc = await buildIntakeV2PDF(window.IntakeV2.data);
        const name = pdfFilename(window.IntakeV2.data);
        doc.save(name);
        if (window.App && window.App.logExport) window.App.logExport('Intake v2 PDF', name);
        if (window.ActivityLog) window.ActivityLog.add({ type: 'export', area: 'intake-v2', ok: true, message: 'PDF intake summary downloaded' });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('exportPDF failed:', err);
        if (window.App && window.App.toast) window.App.toast('PDF export failed: ' + (err && err.message || err), { type: 'error' });
    }
}

function pdfFilename(data) {
    const name = [data.applicant.firstName, data.applicant.lastName].filter(Boolean).join('_') || 'IntakeV2';
    const date = new Date().toISOString().slice(0, 10);
    return `${name}_intake_${date}.pdf`;
}

// ─── CMSMTF / EZLynx XML wrappers (home + auto only) ──────────────────────
function withLegacyShape(fn) {
    if (!window.App || typeof window.App.buildCMSMTF !== 'function') {
        throw new Error('Legacy App exporters not loaded');
    }
    const { data, drivers, vehicles } = window.IntakeV2ExportMap.toLegacyShape(window.IntakeV2.data);
    const sd = window.App.data, sdr = window.App.drivers, sv = window.App.vehicles;
    try {
        window.App.data     = data;
        window.App.drivers  = drivers;
        window.App.vehicles = vehicles;
        return fn(window.App);
    } finally {
        window.App.data     = sd;
        window.App.drivers  = sdr;
        window.App.vehicles = sv;
    }
}

function exportCMSMTF() {
    try {
        // Mirror the EZLynx guard: HawkSoft CMSMTF supports Home / Auto only.
        const d = window.IntakeV2.data;
        const hasHome = Array.isArray(d.homes) && d.homes.length > 0;
        const hasAuto = Array.isArray(d.autos) && d.autos.length > 0;
        if (!hasHome && !hasAuto) {
            if (window.App && window.App.toast) {
                window.App.toast('HawkSoft CMSMTF supports Home / Auto only — add at least one to use this export', { type: 'info', duration: 4000 });
            }
            return;
        }
        const result = withLegacyShape((App) => App.buildCMSMTF(App.data));
        if (window.App && typeof window.App.downloadFile === 'function') {
            window.App.downloadFile(result.content, result.filename, result.mime);
        }
        if (window.App && window.App.logExport) window.App.logExport('CMSMTF (from Intake v2)', result.filename);
        if (window.ActivityLog) window.ActivityLog.add({ type: 'export', area: 'intake-v2', ok: true, message: 'HawkSoft CMSMTF generated' });
        if (window.App && window.App.toast) window.App.toast('HawkSoft file generated', { type: 'success' });
    } catch (err) {
        if (window.App && window.App.toast) window.App.toast('CMSMTF export failed: ' + (err && err.message || err), { type: 'error' });
    }
}

function exportEZLynxXML() {
    try {
        // Refuse if there's nothing to export — the review-section button is
        // already disabled in this case, but CommandPalette + programmatic
        // callers bypass that check. Avoids emitting an empty home XML for a
        // boat- or RV-only quote.
        const d = window.IntakeV2.data;
        const hasHome = Array.isArray(d.homes) && d.homes.length > 0;
        const hasAuto = Array.isArray(d.autos) && d.autos.length > 0;
        if (!hasHome && !hasAuto) {
            if (window.App && window.App.toast) {
                window.App.toast('EZLynx XML supports Home / Auto only — add at least one to use this export', { type: 'info', duration: 4000 });
            }
            return;
        }
        // App.buildEZLynxXML returns { content, filename, mime } for the auto line.
        // App.buildEZLynxHomeXML returns the same shape for the home line.
        // We download whichever lines are populated.
        const results = withLegacyShape((App) => {
            const out = [];
            if (hasAuto && typeof App.buildEZLynxXML === 'function')      out.push(App.buildEZLynxXML());
            if (hasHome && typeof App.buildEZLynxHomeXML === 'function')  out.push(App.buildEZLynxHomeXML());
            if (!out.length) throw new Error('No EZLynx builder available on App');
            return out;
        });
        if (!results || !results.length) return;
        for (const r of results) {
            if (window.App && typeof window.App.downloadFile === 'function') {
                window.App.downloadFile(r.content, r.filename || 'ezlynx.xml', r.mime || 'application/xml');
            }
        }
        if (window.App && window.App.logExport) window.App.logExport('EZLynx XML (from Intake v2)', results.map(r => r.filename).join(', '));
        if (window.ActivityLog) window.ActivityLog.add({ type: 'export', area: 'intake-v2', ok: true, message: `EZLynx XML generated (${results.length} file${results.length > 1 ? 's' : ''})` });
        if (window.App && window.App.toast) window.App.toast(`EZLynx XML generated (${results.length} file${results.length > 1 ? 's' : ''})`, { type: 'success' });
    } catch (err) {
        if (window.App && window.App.toast) window.App.toast('EZLynx export failed: ' + (err && err.message || err), { type: 'error' });
    }
}

// Save current draft as a v2 quote in the quote library.
//
// CryptoHelper.encrypt / decrypt return Promises (AES-GCM via crypto.subtle).
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
                // Don't clobber an unreadable library — surface to the user.
                if (window.App && window.App.toast) {
                    window.App.toast('Existing quote library could not be read — refusing to overwrite', { type: 'error' });
                }
                if (window.ActivityLog) {
                    window.ActivityLog.add({ type: 'error', area: 'intake-v2', ok: false,
                        message: 'Quote library decrypt failed; save aborted',
                        detail: String(err && err.message || err) });
                }
                return;
            }
        }
        const snapshot = JSON.parse(JSON.stringify(window.IntakeV2.data));
        snapshot.meta = snapshot.meta || {};
        snapshot.meta.savedAt = new Date().toISOString();
        if (!snapshot.meta.quoteId) snapshot.meta.quoteId = window.IntakeV2._newId('iv2-quote');
        // Replace existing entry with same quoteId, else push
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

window.IntakeV2.exportPDF      = exportPDF;
window.IntakeV2.exportCMSMTF   = exportCMSMTF;
window.IntakeV2.exportEZLynxXML = exportEZLynxXML;
window.IntakeV2.saveAsQuote    = saveAsQuote;
window.IntakeV2.buildIntakeV2PDF = buildIntakeV2PDF;

// Register CommandPalette entries once on boot
window.IntakeV2.onBoot(function () {
    if (!window.CommandPalette || typeof window.CommandPalette.register !== 'function') return;
    window.CommandPalette.register({ id: 'intakev2.export.pdf',     label: 'Intake v2 — Export PDF',          icon: '📄', run: () => window.IntakeV2.exportPDF() });
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
