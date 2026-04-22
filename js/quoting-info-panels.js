// js/quoting-info-panels.js
// Info / picker modals for Roof Shape and Construction Style.
// Loaded as a global script in index.html — plugin HTML cannot execute inline scripts
// (plugins are injected via innerHTML after page load).

(function () {
    'use strict';

    /* ── Shared close helper ─────────────────────────────────────────────── */
    window.closeFieldInfoModal = function (id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('active');
        setTimeout(function () { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 300);
    };

    /* ── Roof Shape visual picker ────────────────────────────────────────── */
    window.showRoofShapeInfo = function () {
        var id = 'fieldInfoModalRoofShape';
        var existing = document.getElementById(id);
        if (existing) existing.parentNode.removeChild(existing);

        var currentVal = (document.getElementById('roofShape') || {}).value || '';

        var shapes = [
            {
                value: 'Gable',
                name: 'Gable',
                desc: 'Most common. Simple drainage, easy to build. Some wind vulnerability at gable ends.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5,38 5,22 30,6 55,22 55,38"/><line x1="5" y1="38" x2="55" y2="38"/><line x1="5" y1="22" x2="55" y2="22"/></svg>'
            },
            {
                value: 'Hip',
                name: 'Hip',
                desc: 'Wind-resistant. Often earns a credit in wind-prone states. More expensive to build.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5,38 12,20 30,8 48,20 55,38"/><line x1="12" y1="20" x2="48" y2="20"/></svg>'
            },
            {
                value: 'Flat',
                name: 'Flat',
                desc: 'Common on commercial or modern builds. Higher leak risk. May affect rates.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="18" width="50" height="20" rx="1"/><line x1="7" y1="18" x2="53" y2="16"/></svg>'
            },
            {
                value: 'Gambrel',
                name: 'Gambrel',
                desc: 'Barn or Dutch Colonial style. Upper floor living space beneath upper slopes.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5,38 5,24 15,14 45,14 55,24 55,38"/><line x1="5" y1="38" x2="55" y2="38"/><polyline points="15,14 30,6 45,14"/></svg>'
            },
            {
                value: 'Mansard',
                name: 'Mansard',
                desc: 'Victorian / French architecture. Top floor is livable. Flat top requires maintenance.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5,38 8,18 20,12 40,12 52,18 55,38"/><line x1="5" y1="38" x2="55" y2="38"/><line x1="20" y1="12" x2="40" y2="12"/></svg>'
            },
            {
                value: 'Shed',
                name: 'Shed',
                desc: 'Common on additions, modern homes, or porches. Single-pitch, simple drainage.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5,38 5,8 55,20 55,38"/></svg>'
            },
            {
                value: 'Pyramid',
                name: 'Pyramid',
                desc: 'Very wind-resistant. No ridge line. Often seen on smaller structures.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5,38 30,6 55,38"/><line x1="5" y1="38" x2="55" y2="38"/><line x1="30" y1="6" x2="44" y2="26"/><line x1="44" y1="26" x2="55" y2="38"/></svg>'
            },
            {
                value: 'Dormer',
                name: 'Dormer',
                desc: 'Add-on only — describes dormers on a base roof shape.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5,38 5,24 30,8 55,24 55,38"/><line x1="5" y1="38" x2="55" y2="38"/><polyline points="18,22 18,14 27,9 35,13 35,22"/></svg>'
            },
            {
                value: 'Turret',
                name: 'Turret',
                desc: 'Round or polygonal tower element. Common in Victorian or Queen Anne styles.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="36" x2="18" y2="20"/><line x1="42" y1="36" x2="42" y2="20"/><path d="M18,20 Q18,16 30,16 Q42,16 42,20"/><polyline points="18,20 30,6 42,20"/><path d="M18,36 Q18,40 30,40 Q42,40 42,36"/></svg>'
            },
            {
                value: 'Other',
                name: 'Other',
                desc: 'Non-standard or mixed roof style. Use if no other shape applies.',
                svg: '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="30" cy="20" r="13"/><path d="M25,15 Q25,10 30,10 Q36,10 36,16 Q36,20 30,22"/><circle cx="30" cy="28" r="1.5" fill="currentColor" stroke="none"/></svg>'
            }
        ];

        var cells = shapes.map(function (s) {
            var isSel = s.value === currentVal;
            return '<div class="fi-cell' + (isSel ? ' selected' : '') + '" data-val="' + s.value + '" tabindex="0" role="button" aria-pressed="' + isSel + '">' +
                s.svg +
                '<div class="fi-name">' + s.name + '</div>' +
                '<div class="fi-desc">' + s.desc + '</div>' +
                '</div>';
        }).join('');

        var html =
            '<div class="modal-overlay" id="' + id + '">' +
                '<div class="modal-content" style="max-width:620px;width:93vw">' +
                    '<div class="modal-header">' +
                        '<h3 class="modal-title" style="font-size:1.05rem">Roof Shape</h3>' +
                        '<button class="modal-close" onclick="closeFieldInfoModal(\'' + id + '\')" aria-label="Close">✕</button>' +
                    '</div>' +
                    '<div class="modal-body" style="padding:16px">' +
                        '<p style="font-size:12px;color:var(--text-secondary);margin:0 0 14px">Click a shape to select it and close.</p>' +
                        '<div class="fi-grid">' + cells + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var overlay = document.getElementById(id);
        setTimeout(function () { overlay.classList.add('active'); }, 10);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) { closeFieldInfoModal(id); return; }

            var cell = e.target.closest('.fi-cell');
            if (!cell) return;
            var val = cell.getAttribute('data-val');
            if (!val) return;
            var sel = document.getElementById('roofShape');
            if (sel) {
                sel.value = val;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            closeFieldInfoModal(id);
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeFieldInfoModal(id);
            if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('fi-cell')) {
                e.preventDefault();
                e.target.click();
            }
        });
    };

    /* ── Construction Style picker ───────────────────────────────────────── */
    window.showConstructionStyleInfo = function () {
        var id = 'fieldInfoModalConstructionStyle';
        var existing = document.getElementById(id);
        if (existing) existing.parentNode.removeChild(existing);

        var currentVal = (document.getElementById('constructionStyle') || {}).value || '';

        var groups = [
            { label: 'One-Story',             desc: 'Single floor, all living space on the ground level. Easiest to insure \u2014 no stair/fall risk, simpler roof.',                                                                  values: ['Ranch', 'Rambler', 'Bungalow', 'Cottage'] },
            { label: 'Two-Story',             desc: 'Two full floors stacked vertically. Standard construction. Upper floors add replacement cost.',                                                                                      values: ['Colonial', 'Victorian', 'Ornate Victorian', 'Queen Anne', 'Federal Colonial', 'Contemporary', 'Mediterranean', 'Southwest Adobe'] },
            { label: 'Split / Multi-Level',   desc: 'Floors are offset by half-flights of stairs. Cape Cod has a finished upper half-story under a sloped roof.',                                                                        values: ['Bi-Level', 'Split Level', 'Split Foyer', 'Tri-Level', 'Raised Ranch', 'Cape Cod'] },
            { label: 'Attached / Multi-Unit', desc: 'Shares one or more walls with adjacent units. Coverage applies only to the individual unit \u2014 not shared walls or common areas.',                                             values: ['Townhouse', 'Townhouse Center', 'Townhouse End', 'Rowhouse', 'Rowhouse Center', 'Rowhouse End', 'Condo', 'Coop', 'Apartment'] },
            { label: 'Other',                 desc: "Generic, unusual, or non-standard structures. 'Substandard' typically indicates below-code construction and may affect insurability.",                                             values: ['Dwelling', 'Backsplit', 'Substandard'] }
        ];

        var groupsHtml = groups.map(function (g) {
            var chips = g.values.map(function (v) {
                var isSel = v === currentVal;
                return '<span class="fi-chip' + (isSel ? ' selected' : '') + '" data-val="' + v + '" tabindex="0" role="button" aria-pressed="' + isSel + '">' + v + '</span>';
            }).join('');
            return '<div class="fi-group"><div class="fi-group-label">' + g.label + '</div><p class="fi-group-desc">' + g.desc + '</p><div class="fi-chips">' + chips + '</div></div>';
        }).join('');

        var html =
            '<div class="modal-overlay" id="' + id + '">' +
                '<div class="modal-content" style="max-width:500px;width:93vw">' +
                    '<div class="modal-header">' +
                        '<h3 class="modal-title" style="font-size:1.05rem">Construction Style</h3>' +
                        '<button class="modal-close" onclick="closeFieldInfoModal(\'' + id + '\')" aria-label="Close">✕</button>' +
                    '</div>' +
                    '<div class="modal-body" style="padding:16px">' +
                        '<p class="fi-note" style="margin-bottom:16px">Construction Style is the architectural form of the home — not the building materials (that\'s Exterior Walls + Construction Type).</p>' +
                        '<p style="font-size:12px;color:var(--text-secondary);margin:0 0 14px">Click a style to select it and close.</p>' +
                        groupsHtml +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var overlay = document.getElementById(id);
        setTimeout(function () { overlay.classList.add('active'); }, 10);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) { closeFieldInfoModal(id); return; }

            var chip = e.target.closest('.fi-chip');
            if (!chip) return;
            var val = chip.getAttribute('data-val');
            if (!val) return;
            var sel = document.getElementById('constructionStyle');
            if (sel) {
                sel.value = val;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            closeFieldInfoModal(id);
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeFieldInfoModal(id);
            if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('fi-chip')) {
                e.preventDefault();
                e.target.click();
            }
        });
    };

    /* ── Shared picker modal factory ─────────────────────────────────────── */
    // Reusable picker: renders a grid of {value, name, desc, svg} cells,
    // selecting any cell sets the target dropdown and closes the modal.
    // Used by showRoofTypeInfo / showExteriorWallsInfo below — future
    // reference panels can call this directly.
    function _createPickerModal(cfg) {
        var id = cfg.id;
        var existing = document.getElementById(id);
        if (existing) existing.parentNode.removeChild(existing);

        var targetEl = document.getElementById(cfg.targetFieldId);
        var currentVal = (targetEl && targetEl.value) || '';

        var cells = cfg.options.map(function (o) {
            var isSel = o.value === currentVal;
            return '<div class="fi-cell' + (isSel ? ' selected' : '') + '" data-val="' + o.value + '" tabindex="0" role="button" aria-pressed="' + isSel + '">' +
                o.svg +
                '<div class="fi-name">' + o.name + '</div>' +
                '<div class="fi-desc">' + o.desc + '</div>' +
                '</div>';
        }).join('');

        var html =
            '<div class="modal-overlay" id="' + id + '">' +
                '<div class="modal-content" style="max-width:760px;width:94vw;max-height:86vh;display:flex;flex-direction:column">' +
                    '<div class="modal-header">' +
                        '<h3 class="modal-title" style="font-size:1.05rem">' + cfg.title + '</h3>' +
                        '<button class="modal-close" onclick="closeFieldInfoModal(\'' + id + '\')" aria-label="Close">✕</button>' +
                    '</div>' +
                    '<div class="modal-body" style="padding:16px;overflow-y:auto">' +
                        '<p style="font-size:12px;color:var(--text-secondary);margin:0 0 14px">' + cfg.subtitle + '</p>' +
                        '<div class="fi-grid">' + cells + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var overlay = document.getElementById(id);
        setTimeout(function () { overlay.classList.add('active'); }, 10);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) { closeFieldInfoModal(id); return; }
            var cell = e.target.closest('.fi-cell');
            if (!cell) return;
            var val = cell.getAttribute('data-val');
            if (!val) return;
            var sel = document.getElementById(cfg.targetFieldId);
            if (sel) {
                sel.value = val;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            closeFieldInfoModal(id);
        });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeFieldInfoModal(id);
            if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('fi-cell')) {
                e.preventDefault();
                e.target.click();
            }
        });
    }

    /* ── Roof Type visual reference ──────────────────────────────────────── */
    // Covers the most common roof materials. Descriptions encode the
    // underwriting signal (hail resistance, leak risk, carrier preferences).
    // Uncommon options in the dropdown (Asbestos, Thatch, etc.) aren't
    // shown — agent can still pick them directly from the <select>.
    window.showRoofTypeInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalRoofType',
            targetFieldId: 'roofType',
            title: 'Roof Material',
            subtitle: 'Click a material to select it. Hover text shows underwriting notes.',
            options: [
                { value: 'Architectural Shingles', name: 'Architectural Shingles',
                  desc: 'Double-thick composition shingles with shadow lines. Most common on modern builds. Preferred tier at most carriers.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><rect x="2" y="12" width="56" height="26" fill="rgba(0,0,0,0.06)"/><line x1="2" y1="20" x2="58" y2="20"/><line x1="2" y1="28" x2="58" y2="28"/><line x1="2" y1="36" x2="58" y2="36"/><line x1="10" y1="12" x2="10" y2="20"/><line x1="22" y1="12" x2="22" y2="20"/><line x1="34" y1="12" x2="34" y2="20"/><line x1="46" y1="12" x2="46" y2="20"/><line x1="6" y1="20" x2="6" y2="28"/><line x1="18" y1="20" x2="18" y2="28"/><line x1="30" y1="20" x2="30" y2="28"/><line x1="42" y1="20" x2="42" y2="28"/><line x1="54" y1="20" x2="54" y2="28"/></svg>' },
                { value: 'Asphalt Shingles', name: 'Asphalt Shingles',
                  desc: 'Standard composition shingles — felt/fiberglass saturated with asphalt. Most common older material.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="14" width="56" height="24" fill="rgba(0,0,0,0.05)"/><line x1="2" y1="22" x2="58" y2="22"/><line x1="2" y1="30" x2="58" y2="30"/><line x1="2" y1="38" x2="58" y2="38"/><line x1="14" y1="14" x2="14" y2="22"/><line x1="28" y1="14" x2="28" y2="22"/><line x1="42" y1="14" x2="42" y2="22"/><line x1="8" y1="22" x2="8" y2="30"/><line x1="22" y1="22" x2="22" y2="30"/><line x1="36" y1="22" x2="36" y2="30"/><line x1="50" y1="22" x2="50" y2="30"/></svg>' },
                { value: 'Metal(pitched)', name: 'Metal (Pitched)',
                  desc: 'Standing-seam or corrugated steel/aluminum on a pitched roof. Hail resistant, often earns a credit.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><polygon points="5,36 5,16 30,6 55,16 55,36" fill="rgba(0,0,0,0.05)"/><line x1="12" y1="11" x2="12" y2="36"/><line x1="20" y1="7.5" x2="20" y2="36"/><line x1="30" y1="6" x2="30" y2="36"/><line x1="40" y1="7.5" x2="40" y2="36"/><line x1="48" y1="11" x2="48" y2="36"/></svg>' },
                { value: 'Metal(flat)', name: 'Metal (Flat)',
                  desc: 'Flat/low-slope metal roof. Modern or commercial look.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="5" y="16" width="50" height="20" fill="rgba(0,0,0,0.05)"/><line x1="12" y1="16" x2="12" y2="36"/><line x1="20" y1="16" x2="20" y2="36"/><line x1="28" y1="16" x2="28" y2="36"/><line x1="36" y1="16" x2="36" y2="36"/><line x1="44" y1="16" x2="44" y2="36"/></svg>' },
                { value: 'Tile(clay)', name: 'Tile (Clay)',
                  desc: 'S-shaped or barrel-shaped clay tile. Common in the Southwest/Mediterranean styles. Heavy — check structure.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="M4 18 q4 -6 8 0 q4 6 8 0 q4 -6 8 0 q4 6 8 0 q4 -6 8 0 q4 6 8 0" fill="rgba(200,80,40,0.15)"/><path d="M4 26 q4 -6 8 0 q4 6 8 0 q4 -6 8 0 q4 6 8 0 q4 -6 8 0 q4 6 8 0" fill="rgba(200,80,40,0.15)"/><path d="M4 34 q4 -6 8 0 q4 6 8 0 q4 -6 8 0 q4 6 8 0 q4 -6 8 0 q4 6 8 0" fill="rgba(200,80,40,0.15)"/></svg>' },
                { value: 'Tile(concrete)', name: 'Tile (Concrete)',
                  desc: 'Flat or curved concrete shingle tile. Durable, heavier than clay.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="15" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="14" y="15" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="25" y="15" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="36" y="15" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="47" y="15" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="3" y="23" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="14" y="23" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="25" y="23" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="36" y="23" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="47" y="23" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="3" y="31" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="14" y="31" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="25" y="31" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="36" y="31" width="10" height="7" fill="rgba(120,120,120,0.2)"/><rect x="47" y="31" width="10" height="7" fill="rgba(120,120,120,0.2)"/></svg>' },
                { value: 'Wood Shake', name: 'Wood Shake',
                  desc: 'Split wood shakes — rough, jagged edges. Fire-rated only in treated form; some carriers decline.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="M3 18 l3 2 l4 -2 l3 3 l4 -2 l3 2 l4 -3 l3 2 l4 -2 l3 3 l4 -2 l3 2 l4 -2 l3 3 l4 -1 l3 2" fill="rgba(140,80,40,0.15)"/><path d="M3 27 l3 2 l4 -2 l3 3 l4 -2 l3 2 l4 -3 l3 2 l4 -2 l3 3 l4 -2 l3 2 l4 -2 l3 3 l4 -1 l3 2" fill="rgba(140,80,40,0.15)"/></svg>' },
                { value: 'Wood Shingles', name: 'Wood Shingles',
                  desc: 'Tapered wood shingles, smoother than shake. Same fire concern as shake.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="14" width="56" height="24" fill="rgba(140,100,60,0.12)"/><line x1="2" y1="22" x2="58" y2="22"/><line x1="2" y1="30" x2="58" y2="30"/><line x1="2" y1="38" x2="58" y2="38"/><line x1="8" y1="14" x2="8" y2="22"/><line x1="16" y1="14" x2="16" y2="22"/><line x1="24" y1="14" x2="24" y2="22"/><line x1="32" y1="14" x2="32" y2="22"/><line x1="40" y1="14" x2="40" y2="22"/><line x1="48" y1="14" x2="48" y2="22"/><line x1="12" y1="22" x2="12" y2="30"/><line x1="20" y1="22" x2="20" y2="30"/><line x1="28" y1="22" x2="28" y2="30"/><line x1="36" y1="22" x2="36" y2="30"/><line x1="44" y1="22" x2="44" y2="30"/><line x1="52" y1="22" x2="52" y2="30"/></svg>' },
                { value: 'Slate', name: 'Slate',
                  desc: 'Natural stone tiles. Very durable, heavy, expensive. Usually on higher-value homes.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="12" width="56" height="26" fill="rgba(60,70,85,0.18)"/><line x1="2" y1="20" x2="58" y2="20"/><line x1="2" y1="28" x2="58" y2="28"/><line x1="2" y1="36" x2="58" y2="36"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="24" y1="12" x2="24" y2="20"/><line x1="36" y1="12" x2="36" y2="20"/><line x1="48" y1="12" x2="48" y2="20"/><line x1="8" y1="20" x2="8" y2="28"/><line x1="20" y1="20" x2="20" y2="28"/><line x1="32" y1="20" x2="32" y2="28"/><line x1="44" y1="20" x2="44" y2="28"/><line x1="56" y1="20" x2="56" y2="28"/></svg>' },
                { value: 'Tar And Gravel', name: 'Tar & Gravel',
                  desc: 'Built-up layers of felt + coal tar + gravel topping. Flat/low-slope roofs. Higher leak risk.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="4" y="18" width="52" height="20" fill="rgba(60,60,60,0.2)"/><circle cx="10" cy="24" r="1" fill="currentColor"/><circle cx="16" cy="28" r="1" fill="currentColor"/><circle cx="22" cy="22" r="1" fill="currentColor"/><circle cx="28" cy="27" r="1" fill="currentColor"/><circle cx="34" cy="23" r="1" fill="currentColor"/><circle cx="40" cy="28" r="1" fill="currentColor"/><circle cx="46" cy="24" r="1" fill="currentColor"/><circle cx="50" cy="30" r="1" fill="currentColor"/><circle cx="14" cy="33" r="1" fill="currentColor"/><circle cx="26" cy="34" r="1" fill="currentColor"/><circle cx="38" cy="33" r="1" fill="currentColor"/><circle cx="48" cy="34" r="1" fill="currentColor"/></svg>' },
                { value: 'Rubber Flat', name: 'Rubber (Flat)',
                  desc: 'Single-ply rubberized membrane on flat roofs. Vulcanized seams.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="4" y="18" width="52" height="20" fill="rgba(30,30,30,0.2)"/><line x1="4" y1="28" x2="56" y2="28" stroke-dasharray="2 1"/></svg>' },
                { value: 'Solar', name: 'Solar',
                  desc: 'Solar shingle or integrated PV roof. Carrier may ask for installation docs.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="6" y="14" width="16" height="10" fill="rgba(30,80,180,0.25)"/><rect x="24" y="14" width="16" height="10" fill="rgba(30,80,180,0.25)"/><rect x="42" y="14" width="12" height="10" fill="rgba(30,80,180,0.25)"/><rect x="6" y="26" width="16" height="10" fill="rgba(30,80,180,0.25)"/><rect x="24" y="26" width="16" height="10" fill="rgba(30,80,180,0.25)"/><rect x="42" y="26" width="12" height="10" fill="rgba(30,80,180,0.25)"/></svg>' },
                { value: 'Copper(pitched)', name: 'Copper',
                  desc: 'Interlocking copper sheets. Premium material, develops green patina over time.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><polygon points="5,36 5,14 30,6 55,14 55,36" fill="rgba(180,100,60,0.2)"/><line x1="15" y1="10" x2="15" y2="36"/><line x1="30" y1="6" x2="30" y2="36"/><line x1="45" y1="10" x2="45" y2="36"/></svg>' },
                { value: 'Other', name: 'Other',
                  desc: 'Material not listed here (thatch, foam, asbestos, mineral fiber, etc.). Pick directly in the dropdown.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="30" cy="20" r="11"/><path d="M25,16 Q25,11 30,11 Q36,11 36,17 Q36,21 30,22"/><circle cx="30" cy="28" r="1.5" fill="currentColor" stroke="none"/></svg>' },
            ]
        });
    };

    /* ── Exterior Walls visual reference ────────────────────────────────── */
    window.showExteriorWallsInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalExteriorWalls',
            targetFieldId: 'exteriorWalls',
            title: 'Exterior Wall Material',
            subtitle: 'Click a material to select it. Hover text shows underwriting notes.',
            options: [
                { value: 'Siding, Wood', name: 'Wood Siding',
                  desc: 'Natural wood planks on frame. Fire/rot considerations. Premium on older homes.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(180,130,80,0.15)"/><line x1="2" y1="12" x2="58" y2="12"/><line x1="2" y1="18" x2="58" y2="18"/><line x1="2" y1="24" x2="58" y2="24"/><line x1="2" y1="30" x2="58" y2="30"/><line x1="2" y1="36" x2="58" y2="36"/></svg>' },
                { value: 'Siding, Vinyl', name: 'Vinyl Siding',
                  desc: 'PVC lap siding over frame. Low maintenance, dominant on newer homes.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(230,230,230,0.2)"/><line x1="2" y1="13" x2="58" y2="13"/><line x1="2" y1="20" x2="58" y2="20"/><line x1="2" y1="27" x2="58" y2="27"/><line x1="2" y1="34" x2="58" y2="34"/></svg>' },
                { value: 'Siding, Aluminum', name: 'Aluminum Siding',
                  desc: 'Aluminum or steel siding over frame. Common on homes built 1960s–80s.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(180,190,200,0.25)"/><line x1="2" y1="12" x2="58" y2="12"/><line x1="2" y1="18" x2="58" y2="18"/><line x1="2" y1="24" x2="58" y2="24"/><line x1="2" y1="30" x2="58" y2="30"/><line x1="2" y1="36" x2="58" y2="36"/></svg>' },
                { value: 'Siding, Cement Fiber/Clapboard', name: 'Cement Fiber',
                  desc: 'Hardie board / James Hardie style. Cement + cellulose composite. Fire resistant, preferred by many carriers.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(210,210,220,0.2)"/><line x1="2" y1="14" x2="58" y2="14"/><line x1="2" y1="22" x2="58" y2="22"/><line x1="2" y1="30" x2="58" y2="30"/><line x1="2" y1="38" x2="58" y2="38"/></svg>' },
                { value: 'Siding, Hardboard', name: 'Hardboard Siding',
                  desc: 'Masonite-style hardboard lap siding. Moisture issues common — carrier may ask for inspection.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(160,120,80,0.15)"/><line x1="2" y1="15" x2="58" y2="15"/><line x1="2" y1="23" x2="58" y2="23"/><line x1="2" y1="31" x2="58" y2="31"/><line x1="2" y1="38" x2="58" y2="38"/></svg>' },
                { value: 'Siding, T-111', name: 'T-111 Plywood',
                  desc: 'Plywood panels with vertical grooves. Budget builds, outbuildings. Carriers may rate up or decline.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(200,150,100,0.15)"/><line x1="10" y1="6" x2="10" y2="38"/><line x1="18" y1="6" x2="18" y2="38"/><line x1="26" y1="6" x2="26" y2="38"/><line x1="34" y1="6" x2="34" y2="38"/><line x1="42" y1="6" x2="42" y2="38"/><line x1="50" y1="6" x2="50" y2="38"/></svg>' },
                { value: 'Shakes, Wood', name: 'Wood Shakes',
                  desc: 'Split wood shingles on exterior walls. Rough texture, fire-rated only when treated.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(140,80,40,0.12)"/><path d="M2 14 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2"/><path d="M2 22 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2"/><path d="M2 30 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2 l4 -1 l4 2"/></svg>' },
                { value: 'Siding, Logs', name: 'Log Siding',
                  desc: 'Half-log siding on frame — looks like solid log but is ornamentation.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(150,100,60,0.15)"/><ellipse cx="30" cy="11" rx="28" ry="3"/><ellipse cx="30" cy="19" rx="28" ry="3"/><ellipse cx="30" cy="27" rx="28" ry="3"/><ellipse cx="30" cy="35" rx="28" ry="3"/></svg>' },
                { value: 'Solid Log', name: 'Solid Log',
                  desc: 'Stacked solid logs providing structural support (not siding). Very different rating.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(130,90,50,0.2)"/><ellipse cx="30" cy="13" rx="28" ry="4"/><ellipse cx="30" cy="22" rx="28" ry="4"/><ellipse cx="30" cy="31" rx="28" ry="4"/></svg>' },
                { value: 'Brick, Veneer', name: 'Brick Veneer',
                  desc: 'Brick applied to exterior frame — ornamental, frame provides structure. Most "brick" homes are veneer.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="0.9" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(150,60,40,0.2)"/><line x1="2" y1="12" x2="58" y2="12"/><line x1="2" y1="18" x2="58" y2="18"/><line x1="2" y1="24" x2="58" y2="24"/><line x1="2" y1="30" x2="58" y2="30"/><line x1="2" y1="36" x2="58" y2="36"/><line x1="14" y1="6" x2="14" y2="12"/><line x1="30" y1="6" x2="30" y2="12"/><line x1="46" y1="6" x2="46" y2="12"/><line x1="8" y1="12" x2="8" y2="18"/><line x1="24" y1="12" x2="24" y2="18"/><line x1="40" y1="12" x2="40" y2="18"/><line x1="14" y1="18" x2="14" y2="24"/><line x1="30" y1="18" x2="30" y2="24"/><line x1="46" y1="18" x2="46" y2="24"/></svg>' },
                { value: 'Brick, Solid/Brick on Masonry', name: 'Solid Brick',
                  desc: 'Brick provides structural support (no frame behind). Rare — most "brick" is veneer. Very fire-resistant.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(170,70,45,0.28)"/><line x1="2" y1="12" x2="58" y2="12"/><line x1="2" y1="18" x2="58" y2="18"/><line x1="2" y1="24" x2="58" y2="24"/><line x1="2" y1="30" x2="58" y2="30"/><line x1="2" y1="36" x2="58" y2="36"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="28" y1="6" x2="28" y2="12"/><line x1="44" y1="6" x2="44" y2="12"/><line x1="6" y1="12" x2="6" y2="18"/><line x1="22" y1="12" x2="22" y2="18"/><line x1="38" y1="12" x2="38" y2="18"/><line x1="54" y1="12" x2="54" y2="18"/></svg>' },
                { value: 'Stone on Frame', name: 'Stone on Frame',
                  desc: 'Stone/granite/fieldstone applied to frame — ornamentation only, frame supports the structure.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(140,130,120,0.22)"/><path d="M4 12 l6 -1 l5 3 l7 -2 l8 2 l6 -1 l7 2 l9 -1 l4 1"/><path d="M3 20 l8 1 l6 -2 l5 2 l8 -1 l7 2 l5 -1 l10 1 l4 -1"/><path d="M4 28 l5 -2 l8 1 l6 2 l9 -2 l5 2 l7 -1 l8 1 l5 1"/><path d="M3 35 l7 1 l6 -1 l8 2 l5 -1 l8 1 l6 -1 l9 1 l4 -1"/></svg>' },
                { value: 'Stone on Masonry', name: 'Stone on Masonry',
                  desc: 'Rough-shaped stone mortared to masonry substructure. Structural mass.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(120,110,100,0.28)"/><path d="M5 11 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0"/><path d="M5 18 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0"/><path d="M5 25 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0"/><path d="M5 32 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0"/></svg>' },
                { value: 'Stucco on Frame', name: 'Stucco on Frame',
                  desc: 'Cement plaster on metal lath over wood frame. Common in the West/Southwest.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="0.8" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(230,220,200,0.3)"/><circle cx="10" cy="12" r="0.8" fill="currentColor"/><circle cx="20" cy="18" r="0.8" fill="currentColor"/><circle cx="30" cy="10" r="0.8" fill="currentColor"/><circle cx="40" cy="22" r="0.8" fill="currentColor"/><circle cx="50" cy="14" r="0.8" fill="currentColor"/><circle cx="15" cy="28" r="0.8" fill="currentColor"/><circle cx="35" cy="32" r="0.8" fill="currentColor"/><circle cx="45" cy="30" r="0.8" fill="currentColor"/><circle cx="25" cy="35" r="0.8" fill="currentColor"/></svg>' },
                { value: 'Stucco, Synthetic EIFS', name: 'EIFS (Synthetic Stucco)',
                  desc: 'Foam insulation + mesh + synthetic stucco coat. Known moisture issues, often declined or rated up.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 1" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(240,235,220,0.3)"/><rect x="2" y="6" width="56" height="32" stroke-dasharray="0"/><line x1="10" y1="6" x2="10" y2="38" stroke-dasharray="1 2"/><line x1="20" y1="6" x2="20" y2="38" stroke-dasharray="1 2"/><line x1="30" y1="6" x2="30" y2="38" stroke-dasharray="1 2"/><line x1="40" y1="6" x2="40" y2="38" stroke-dasharray="1 2"/><line x1="50" y1="6" x2="50" y2="38" stroke-dasharray="1 2"/></svg>' },
                { value: 'Concrete Block', name: 'Concrete Block',
                  desc: 'Solid concrete or CMU/ICF walls. Fire and wind resistant.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="2" y="6" width="56" height="32" fill="rgba(190,195,200,0.25)"/><line x1="2" y1="16" x2="58" y2="16"/><line x1="2" y1="26" x2="58" y2="26"/><line x1="2" y1="36" x2="58" y2="36"/><line x1="16" y1="6" x2="16" y2="16"/><line x1="32" y1="6" x2="32" y2="16"/><line x1="48" y1="6" x2="48" y2="16"/><line x1="8" y1="16" x2="8" y2="26"/><line x1="24" y1="16" x2="24" y2="26"/><line x1="40" y1="16" x2="40" y2="26"/><line x1="56" y1="16" x2="56" y2="26"/></svg>' },
                { value: 'Other', name: 'Other',
                  desc: 'Material not listed here (adobe, cinder block, poured concrete, etc.). Pick directly in the dropdown.',
                  svg: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="30" cy="20" r="11"/><path d="M25,16 Q25,11 30,11 Q36,11 36,17 Q36,21 30,22"/><circle cx="30" cy="28" r="1.5" fill="currentColor" stroke="none"/></svg>' },
            ]
        });
    };

})();
