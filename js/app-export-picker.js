// js/app-export-picker.js — Unified "Export Files…" picker modal
//
// One modal that combines:
//   1. Readiness check — every blank ezlynxRequired field surfaces with a
//      jump-to-step link, so the producer can fix before exporting.
//   2. Format checkboxes — producer picks which file types to download.
//      No zip; each checked format triggers its own download via the
//      existing exporter so the file naming + audit log stay consistent.
//
// Replaces two of the per-format buttons in step-6 (PDF + EZLynx XML)
// with a single "📦 Export Files…" entry. The plugin-launch buttons
// (EZLynx tool, EZLynx Auto-fill desktop, HawkSoft tool) stay separate
// because they don't produce direct file downloads.
//
// Designed for a desktop-only workflow — no mobile-specific concerns.
'use strict';

Object.assign(App, {
    // Available file-export formats. Keep `id` stable — it's used for
    // localStorage of last-selected formats and for the contract test.
    _exportPickerFormats() {
        const qType = (this.data && this.data.qType) || 'both';
        const includeAuto = qType === 'auto' || qType === 'both';
        const includeHome = qType === 'home' || qType === 'both';
        return [
            { id: 'pdf',   label: 'Client PDF',           hint: 'Full intake summary for filing or email', enabled: true,  fn: () => this.exportPDF() },
            { id: 'ezxml', label: 'EZLynx XML',           hint: 'Auto + Home schema; drop into EZLynx Import Applicant', enabled: includeAuto || includeHome, fn: () => this.exportEZLynxXML() },
            { id: 'fsc',   label: 'HawkSoft Tagged File', hint: '.CMSMTF for HawkSoft client import',      enabled: true,  fn: () => this.exportCMSMTF() },
            { id: 'text',  label: 'Text Summary',         hint: 'Plain-text recap; useful for email body', enabled: true,  fn: () => this.exportText() },
        ];
    },

    // Compute the readiness panel — every ezlynxRequired field that's
    // blank in App.data, grouped by section so producers see context.
    // Returns { gaps: [{id,label,section,stepId}], total }.
    _buildExportReadiness() {
        const FIELDS = (typeof window !== 'undefined' && window.FIELDS) || [];
        const data = this.data || {};
        const SECTION_TO_STEP = {
            applicant:        'step-1',
            coapplicant:      'step-1',
            address:          'step-3',
            property:         'step-3',
            roof:             'step-3',
            systems:          'step-3',
            hazards:          'step-3',
            'home-coverage':  'step-3',
            'home-endorsements': 'step-3',
            'auto-coverage':  'step-4',
            'prior-insurance': 'step-5',
            notes:            'step-6',
        };
        const gaps = [];
        FIELDS.forEach(f => {
            if (!f.ezlynxRequired) return;
            if (data[f.storageKey]) return;
            gaps.push({
                id: f.id,
                label: f.label,
                section: f.section,
                stepId: SECTION_TO_STEP[f.section] || 'step-1',
            });
        });
        return { gaps, total: gaps.length };
    },

    openExportPicker() {
        if (typeof document === 'undefined' || !document.body) return;
        const escAttr = (window.Utils && Utils.escapeAttr) || (s => String(s == null ? '' : s).replace(/"/g, '&quot;'));
        const escHtml = (window.Utils && Utils.escapeHTML) || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

        const formats = this._exportPickerFormats();
        const readiness = this._buildExportReadiness();

        // Restore last-selected formats so producers don't re-click on
        // every export. Default: all enabled formats checked.
        let lastChecked = [];
        try {
            const raw = localStorage.getItem((window.STORAGE_KEYS && window.STORAGE_KEYS.EXPORT_PICKER_LAST) || 'altech_export_picker_last');
            if (raw) lastChecked = JSON.parse(raw);
        } catch (_) { /* fall through to defaults */ }
        if (!Array.isArray(lastChecked) || !lastChecked.length) {
            lastChecked = formats.filter(f => f.enabled).map(f => f.id);
        }

        // Group gaps by step for visual scanning
        const gapsByStep = readiness.gaps.reduce((acc, g) => {
            (acc[g.stepId] = acc[g.stepId] || []).push(g);
            return acc;
        }, {});
        const STEP_LABEL = {
            'step-1': '👤 Personal & Co-Applicant',
            'step-3': '🏠 Property & Address',
            'step-4': '🚗 Drivers & Vehicles',
            'step-5': '📋 Prior Insurance',
            'step-6': '📝 Notes',
        };

        const readinessHTML = readiness.total === 0
            ? `<div class="ez-picker-ready ez-picker-ready--ok">
                  <span class="ez-picker-ready__icon">✓</span>
                  <span>All EZLynx-required fields are filled — ready to export.</span>
               </div>`
            : `<div class="ez-picker-ready ez-picker-ready--gaps">
                  <div class="ez-picker-ready__head">
                    <span class="ez-picker-ready__icon">!</span>
                    <span><strong>${readiness.total}</strong> required field${readiness.total === 1 ? '' : 's'} blank.
                          You can still export — fix later if needed.</span>
                  </div>
                  ${Object.keys(gapsByStep).map(stepId => {
                      const items = gapsByStep[stepId];
                      const list = items.map(g =>
                          `<li><a href="#" data-jump-step="${escAttr(stepId)}" data-focus-id="${escAttr(g.id)}">${escHtml(g.label)}</a></li>`
                      ).join('');
                      return `<div class="ez-picker-ready__group">
                                <div class="ez-picker-ready__group-head">${escHtml(STEP_LABEL[stepId] || stepId)}</div>
                                <ul class="ez-picker-ready__list">${list}</ul>
                              </div>`;
                  }).join('')}
               </div>`;

        const formatsHTML = formats.map(f => {
            const checked = lastChecked.includes(f.id) && f.enabled ? 'checked' : '';
            const disabled = f.enabled ? '' : 'disabled';
            const dimClass = f.enabled ? '' : 'is-disabled';
            return `<label class="ez-picker-format ${dimClass}">
                       <input type="checkbox" class="ez-picker-format__cb" value="${escAttr(f.id)}" ${checked} ${disabled}>
                       <div class="ez-picker-format__body">
                         <div class="ez-picker-format__label">${escHtml(f.label)}</div>
                         <div class="ez-picker-format__hint">${escHtml(f.hint)}</div>
                       </div>
                    </label>`;
        }).join('');

        const modalHTML = `
            <div class="modal-overlay ez-picker-overlay" id="ezExportPickerModal">
                <div class="modal-content ez-picker-content">
                    <div class="modal-header">
                        <h2>📦 Export Files</h2>
                        <button class="modal-close" type="button" onclick="App._closeExportPicker()" aria-label="Close">✕</button>
                    </div>
                    <div class="modal-body ez-picker-body">
                        ${readinessHTML}
                        <div class="ez-picker-formats-head">Pick which files to download:</div>
                        <div class="ez-picker-formats">${formatsHTML}</div>
                    </div>
                    <div class="modal-footer ez-picker-footer">
                        <button class="btn-secondary" type="button" onclick="App._closeExportPicker()">Cancel</button>
                        <button class="btn-primary" type="button" onclick="App._runSelectedExports()">⬇ Download Selected</button>
                    </div>
                </div>
            </div>`;

        const existing = document.getElementById('ezExportPickerModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        setTimeout(() => {
            const m = document.getElementById('ezExportPickerModal');
            if (m) m.classList.add('active');
        }, 10);

        // Wire jump-to-step links
        const modal = document.getElementById('ezExportPickerModal');
        if (modal) {
            modal.querySelectorAll('a[data-jump-step]').forEach(a => {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    const step = a.getAttribute('data-jump-step');
                    const focusId = a.getAttribute('data-focus-id');
                    this._closeExportPicker();
                    if (typeof this.jumpToStep === 'function') this.jumpToStep(step);
                    if (focusId) {
                        setTimeout(() => {
                            const el = document.getElementById(focusId);
                            if (el && typeof el.focus === 'function') el.focus();
                            if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }, 100);
                    }
                });
            });
        }
    },

    _closeExportPicker() {
        const m = document.getElementById('ezExportPickerModal');
        if (m) m.remove();
    },

    _runSelectedExports() {
        const modal = document.getElementById('ezExportPickerModal');
        if (!modal) return;
        const checked = Array.from(modal.querySelectorAll('.ez-picker-format__cb'))
            .filter(cb => cb.checked && !cb.disabled)
            .map(cb => cb.value);
        if (!checked.length) {
            if (typeof this.toast === 'function') this.toast('Pick at least one format to download', { type: 'error' });
            return;
        }

        // Persist last selection
        try {
            const key = (window.STORAGE_KEYS && window.STORAGE_KEYS.EXPORT_PICKER_LAST) || 'altech_export_picker_last';
            localStorage.setItem(key, JSON.stringify(checked));
        } catch (_) { /* best-effort */ }

        const formats = this._exportPickerFormats();
        const byId = Object.fromEntries(formats.map(f => [f.id, f]));
        const ran = [];

        // Fire each checked exporter. Some are async (PDF), some sync;
        // we don't await — fire-and-forget keeps the modal snappy.
        for (const id of checked) {
            const f = byId[id];
            if (!f || !f.enabled) continue;
            try {
                Promise.resolve(f.fn()).catch(err => {
                    console.error('[ExportPicker] export failed:', f.label, err);
                    if (typeof this.toast === 'function') this.toast(`${f.label} export failed`, { type: 'error' });
                });
                ran.push(f.label);
            } catch (err) {
                console.error('[ExportPicker] export threw synchronously:', f.label, err);
            }
        }

        this._closeExportPicker();
        if (typeof this.toast === 'function' && ran.length) {
            this.toast(`Exporting ${ran.length} file${ran.length === 1 ? '' : 's'}…`);
        }
    },
});
