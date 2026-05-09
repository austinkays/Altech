// js/app-export-carrier-fit.js — Carrier eligibility surfaces on Step 6
// Thin wrapper: builds a ClientProfile from App.data / drivers / vehicles,
// calls BroadformEngine for each applicable line of business, and renders
// eligibility verdicts. Rule data + matching engine live in js/tools/
// broadform-{data,engine}.js and are already cloud-synced via the
// `carrierOverrides` doc in SYNC_DOCS.
'use strict';

Object.assign(App, {
    /**
     * Render the Carrier Fit card on Step 6. Idempotent — called on every
     * step-6 entry. No-op if BroadformEngine or the container are unavailable.
     */
    renderCarrierFit() {
        const container = document.getElementById('carrierFitResults');
        if (!container) return;

        if (typeof window.BroadformEngine === 'undefined' || typeof window.BroadformData === 'undefined') {
            container.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">Carrier rule engine not loaded.</div>';
            return;
        }

        const d = this.data || {};
        const lobs = this._carrierFitLobsForQuote();
        if (!lobs.length) {
            container.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">Select a coverage type on Step 0 to see eligible carriers.</div>';
            return;
        }

        const profile = window.BroadformEngine.buildProfileFromAppData();
        const supported = window.BroadformData.supportedStates || [];
        const state = (d.addrState || '').toUpperCase();

        // If state is set but not in the supported list, the engine returns
        // nothing useful — surface a hint instead of an empty card.
        if (state && supported.length && !supported.includes(state)) {
            container.innerHTML = `<div style="font-size:13px;color:var(--text-secondary);padding:8px 0;">Carrier rules currently cover ${supported.join(', ')}. No carriers evaluated for <strong>${Utils.escapeHTML(state)}</strong>. <a href="#carrier-match" onclick="App.navigateTo('broadform');return false;" style="color:var(--apple-blue);">Add ${Utils.escapeHTML(state)} rules in Carrier Match →</a></div>`;
            return;
        }

        const sections = lobs.map(lob => {
            const result = window.BroadformEngine.evaluate(profile, lob);
            return this._renderCarrierFitSection(lob, result);
        }).filter(Boolean).join('');

        container.innerHTML = sections || '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">No carriers evaluated.</div>';
    },

    /** Determine which LOBs apply to the current quote. */
    _carrierFitLobsForQuote() {
        const d = this.data || {};
        const qType = d.qType;
        const lobs = [];
        if (qType === 'home' || qType === 'both') lobs.push('home');
        if (qType === 'auto' || qType === 'both') {
            const ap = d.autoPolicyType;
            if (ap === 'NonOwners') lobs.push('nonowners');
            else if (ap === 'BroadForm') lobs.push('broadform');
            else lobs.push('auto');
        }
        return lobs;
    },

    /** Render one LOB block (e.g. Home or Auto). Returns HTML string. */
    _renderCarrierFitSection(lob, result) {
        const lobLabels = { home: 'Home', auto: 'Auto', broadform: 'Broadform', nonowners: 'Non-Owners' };
        const label = lobLabels[lob] || lob;

        const counts = {
            eligible: result.eligible.length,
            pending: result.pending.length,
            disqualified: result.disqualified.length,
            referOut: result.referOut.length,
        };
        const total = counts.eligible + counts.pending + counts.disqualified + counts.referOut;
        if (total === 0) {
            return `<div style="margin-bottom:14px;">
                <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:6px;">${Utils.escapeHTML(label)}</div>
                <div style="font-size:12px;color:var(--text-secondary);">No carrier rules defined for this line yet.</div>
            </div>`;
        }

        const rows = []
            .concat(result.eligible.map(c => this._renderCarrierRow(c, 'eligible')))
            .concat(result.pending.map(c => this._renderCarrierRow(c, 'pending')))
            .concat(result.disqualified.map(c => this._renderCarrierRow(c, 'disqualified')))
            .concat(result.referOut.map(c => this._renderCarrierRow(c, 'referOut')))
            .join('');

        const missingHint = (result.missingFields && result.missingFields.length)
            ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Missing fields that could narrow results: ${result.missingFields.map(f => Utils.escapeHTML(f.label || f.id)).join(', ')}.</div>`
            : '';

        return `<div style="margin-bottom:14px;">
            <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <span>${Utils.escapeHTML(label)}</span>
                <span style="font-size:11px;font-weight:500;color:var(--text-secondary);">${counts.eligible} eligible · ${counts.pending} pending · ${counts.disqualified} out</span>
            </div>
            ${rows}
            ${missingHint}
        </div>`;
    },

    /** Render one carrier row with verdict pill + optional reasons. */
    _renderCarrierRow(carrier, status) {
        const styles = {
            eligible:     { color: 'var(--success)',    label: 'Eligible',     icon: '✓' },
            pending:      { color: 'var(--apple-blue)', label: 'Pending',      icon: '…' },
            disqualified: { color: 'var(--danger)',     label: 'Ineligible',   icon: '✕' },
            referOut:     { color: 'var(--text-secondary)', label: 'Refer out', icon: '→' },
        };
        const s = styles[status] || styles.pending;

        let detail = '';
        if (status === 'disqualified' && carrier.reasons && carrier.reasons.length) {
            detail = `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${carrier.reasons.map(r => Utils.escapeHTML(r)).join('; ')}</div>`;
        } else if (status === 'referOut' && carrier.note) {
            detail = `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${Utils.escapeHTML(carrier.note)}</div>`;
        } else if (status === 'pending' && carrier.missingFields && carrier.missingFields.length) {
            detail = `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Needs: ${carrier.missingFields.map(f => Utils.escapeHTML(f)).join(', ')}</div>`;
        } else if (carrier.note) {
            detail = `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${Utils.escapeHTML(carrier.note)}</div>`;
        }

        return `<div style="padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-left:3px solid ${s.color};border-radius:6px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);">
                <span style="color:${s.color};font-weight:700;width:16px;text-align:center;">${s.icon}</span>
                <span style="font-weight:500;flex:1;">${Utils.escapeHTML(carrier.name || carrier.key)}</span>
                <span style="font-size:11px;color:${s.color};font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">${s.label}</span>
            </div>
            ${detail}
        </div>`;
    },
});
