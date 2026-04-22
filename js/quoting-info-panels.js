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

    /* ── Heating Type reference ──────────────────────────────────────────
       Definitions adapted from Liberty Mutual's underwriting quick-help.
       SVG icons are stylized abstractions:
         - flame        → fuel-based (gas / oil / propane / solid)
         - flow lines   → forced-air distribution
         - wave + fins  → hot-water / baseboard / radiator
         - zigzag bolt  → electric
    */
    window.showHeatingTypeInfo = function () {
        var FLAME = '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M30 8 q-7 6 -7 14 q0 8 7 12 q7 -4 7 -12 q0 -7 -3 -11 q-1 3 -4 1 q0 -4 0 -4 z" fill="rgba(255,140,40,0.18)"/></svg>';
        var FORCED_AIR = '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="6" y="14" width="14" height="12" fill="rgba(255,140,40,0.15)"/><path d="M22 16 q8 -4 14 0 M22 20 q8 -4 16 0 M22 24 q8 -4 14 0" /><path d="M44 16 l6 0 M44 20 l8 0 M44 24 l6 0"/></svg>';
        var HOT_WATER = '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="10" width="30" height="20" fill="rgba(80,160,220,0.15)"/><line x1="14" y1="10" x2="14" y2="30"/><line x1="20" y1="10" x2="20" y2="30"/><line x1="26" y1="10" x2="26" y2="30"/><line x1="32" y1="10" x2="32" y2="30"/><path d="M42 18 q3 -3 6 0 q3 3 6 0"/><path d="M42 24 q3 -3 6 0 q3 3 6 0"/></svg>';
        var RADIANT = '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="30" x2="56" y2="30"/><path d="M6 26 q3 -3 6 0 q3 3 6 0 q3 -3 6 0 q3 3 6 0 q3 -3 6 0 q3 3 6 0 q3 -3 6 0"/><path d="M6 22 q3 -3 6 0 q3 3 6 0 q3 -3 6 0 q3 3 6 0 q3 -3 6 0 q3 3 6 0 q3 -3 6 0" opacity="0.6"/><path d="M6 18 q3 -3 6 0 q3 3 6 0 q3 -3 6 0 q3 3 6 0 q3 -3 6 0 q3 3 6 0 q3 -3 6 0" opacity="0.35"/></svg>';
        var ELECTRIC = '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M32 6 L22 22 L30 22 L26 34 L38 18 L30 18 Z" fill="rgba(255,220,0,0.2)"/></svg>';
        var STOVE = '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="16" y="14" width="22" height="20" fill="rgba(120,80,60,0.2)"/><rect x="20" y="18" width="14" height="10" fill="rgba(255,140,40,0.3)"/><line x1="38" y1="14" x2="46" y2="10"/><line x1="46" y1="10" x2="46" y2="4"/></svg>';

        _createPickerModal({
            id: 'fieldInfoModalHeatingType',
            targetFieldId: 'heatingType',
            title: 'Heating Type',
            subtitle: 'Select the heating system found in the dwelling. Definitions adapted from carrier underwriting guides.',
            options: [
                { value: 'Gas - Forced Air', name: 'Gas — Forced Air', svg: FORCED_AIR,
                  desc: 'A forced-air system using natural gas, designed to distribute heat throughout the dwelling via ducts.' },
                { value: 'Gas - Hot Water', name: 'Gas — Hot Water', svg: HOT_WATER,
                  desc: 'A hot-water (boiler) system using natural gas, distributing heat through radiators or baseboards.' },
                { value: 'Gas', name: 'Gas (Other)', svg: FLAME,
                  desc: 'A non-forced-air gas system — e.g. wall-mounted gas heater or space heater. Rate may vary by room count.' },
                { value: 'Electric', name: 'Electric', svg: ELECTRIC,
                  desc: 'Forced-air or baseboard electric heat. No combustion, no flue. Often pairs with heat pump for cooling.' },
                { value: 'Oil - Forced Air', name: 'Oil — Forced Air', svg: FORCED_AIR,
                  desc: 'A forced-air system using fuel oil. Distributed through ducts. Check for oil tank location + age.' },
                { value: 'Oil - Hot Water', name: 'Oil — Hot Water', svg: HOT_WATER,
                  desc: 'A hot-water system using fuel oil. Distributed through radiators. Often seen in older Northeast homes.' },
                { value: 'Oil', name: 'Oil (Other)', svg: FLAME,
                  desc: 'A non-forced-air oil system — space heaters or wall-mounted oil units.' },
                { value: 'Other - Forced Air', name: 'Propane / Other — Forced Air', svg: FORCED_AIR,
                  desc: 'A forced-air system using propane or a non-standard fuel. Common in rural areas without natural-gas lines.' },
                { value: 'Other - Hot Water', name: 'Propane / Other — Hot Water', svg: HOT_WATER,
                  desc: 'A hot-water/boiler system using propane or another non-standard fuel. Includes hot-water baseboard variants.' },
                { value: 'Solid Fuel', name: 'Solid Fuel / Wood Stove', svg: STOVE,
                  desc: 'Wood, pellet, or coal stove / wood furnace as the primary heat source. Carriers often require secondary heat + inspection (creosote, chimney, clearances).' },
                { value: 'Other', name: 'Other', svg: FLAME,
                  desc: 'In-wall furnaces, radiant floor, space heaters used as sole source, or anything not listed. Note specifics in the additional-info field.' },
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

    /* ── Shared icon vocabulary for the remaining reference modals ─────── */
    var ICON = {
        pipe: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="4" y="16" width="52" height="8" rx="4" fill="rgba(120,140,180,0.2)"/><line x1="14" y1="16" x2="14" y2="24"/><line x1="30" y1="16" x2="30" y2="24"/><line x1="46" y1="16" x2="46" y2="24"/></svg>',
        pipeFlex: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 20 q6 -8 12 0 q6 8 12 0 q6 -8 12 0 q6 8 12 0" fill="none"/><path d="M4 24 q6 -8 12 0 q6 8 12 0 q6 -8 12 0 q6 8 12 0" fill="none" opacity="0.5"/></svg>',
        pipeAged: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="4" y="16" width="52" height="8" rx="4" fill="rgba(120,80,40,0.25)" stroke-dasharray="2 2"/><circle cx="18" cy="20" r="1" fill="currentColor"/><circle cx="34" cy="20" r="1" fill="currentColor"/><circle cx="46" cy="20" r="1" fill="currentColor"/></svg>',
        panel: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><rect x="14" y="6" width="32" height="28" rx="2" fill="rgba(80,80,100,0.15)"/><line x1="18" y1="12" x2="28" y2="12"/><line x1="32" y1="12" x2="42" y2="12"/><line x1="18" y1="18" x2="28" y2="18"/><line x1="32" y1="18" x2="42" y2="18"/><line x1="18" y1="24" x2="28" y2="24"/><line x1="32" y1="24" x2="42" y2="24"/><line x1="18" y1="30" x2="28" y2="30"/><line x1="32" y1="30" x2="42" y2="30"/></svg>',
        panelDanger: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><rect x="14" y="6" width="32" height="28" rx="2" fill="rgba(230,80,60,0.18)"/><line x1="18" y1="12" x2="28" y2="12"/><line x1="32" y1="12" x2="42" y2="12"/><line x1="18" y1="18" x2="28" y2="18"/><line x1="32" y1="18" x2="42" y2="18"/><path d="M30 22 l-4 6 l8 0 z" fill="rgba(230,80,60,0.5)" stroke="none"/><line x1="30" y1="24" x2="30" y2="26"/><circle cx="30" cy="28" r="0.6" fill="currentColor"/></svg>',
        fuseBox: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><rect x="14" y="6" width="32" height="28" rx="2" fill="rgba(140,110,80,0.18)"/><circle cx="22" cy="14" r="3"/><circle cx="38" cy="14" r="3"/><circle cx="22" cy="26" r="3"/><circle cx="38" cy="26" r="3"/></svg>',
        gauge: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M10 32 a20 20 0 0 1 40 0" fill="rgba(80,80,100,0.1)"/><line x1="14" y1="32" x2="17" y2="28"/><line x1="30" y1="14" x2="30" y2="18"/><line x1="46" y1="32" x2="43" y2="28"/><line x1="30" y1="32" x2="38" y2="22"/><circle cx="30" cy="32" r="1.5" fill="currentColor"/></svg>',
        tank: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="22" y="8" width="16" height="26" rx="3" fill="rgba(180,180,200,0.2)"/><line x1="22" y1="14" x2="38" y2="14"/><circle cx="30" cy="22" r="2" fill="rgba(255,140,40,0.3)" stroke="none"/><line x1="26" y1="34" x2="26" y2="36"/><line x1="34" y1="34" x2="34" y2="36"/></svg>',
        tankWarn: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="22" y="8" width="16" height="26" rx="3" fill="rgba(230,80,60,0.18)"/><line x1="22" y1="14" x2="38" y2="14"/><circle cx="30" cy="22" r="2" fill="rgba(255,140,40,0.3)" stroke="none"/><line x1="4" y1="36" x2="56" y2="36"/><path d="M8 36 l3 -2 l3 2 M16 36 l3 -2 l3 2 M24 36 l3 -2 l3 2" opacity="0.5"/></svg>',
        slab: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="4" y="26" width="52" height="8" fill="rgba(140,140,140,0.25)"/><polyline points="4,26 10,18 50,18 56,26"/><line x1="4" y1="34" x2="56" y2="34"/></svg>',
        crawl: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="4" y="24" width="52" height="6" fill="rgba(140,140,140,0.2)"/><rect x="4" y="30" width="52" height="6" fill="rgba(100,100,100,0.3)"/><polyline points="4,24 10,16 50,16 56,24"/></svg>',
        basement: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="4" y="22" width="52" height="4" fill="rgba(140,140,140,0.2)"/><rect x="4" y="26" width="52" height="12" fill="rgba(80,80,100,0.3)"/><polyline points="4,22 10,14 50,14 56,22"/><line x1="20" y1="30" x2="24" y2="30"/><line x1="36" y1="30" x2="40" y2="30"/></svg>',
        piers: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="4" y="18" width="52" height="6" fill="rgba(140,140,140,0.2)"/><polyline points="4,18 10,10 50,10 56,18"/><rect x="10" y="24" width="4" height="12" fill="rgba(100,100,100,0.3)"/><rect x="28" y="24" width="4" height="12" fill="rgba(100,100,100,0.3)"/><rect x="46" y="24" width="4" height="12" fill="rgba(100,100,100,0.3)"/><line x1="4" y1="36" x2="56" y2="36"/></svg>',
        fan: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="30" cy="20" r="12" fill="rgba(80,160,220,0.15)"/><path d="M30 20 q -6 -8 -10 -6 q -4 2 -2 8" /><path d="M30 20 q 10 -2 12 2 q 2 4 -4 6" /><path d="M30 20 q -4 10 -8 10 q -4 0 -4 -8" /><circle cx="30" cy="20" r="2" fill="currentColor" stroke="none"/></svg>',
        windowAC: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="16" y="10" width="28" height="20" rx="2" fill="rgba(80,160,220,0.2)"/><line x1="20" y1="14" x2="40" y2="14"/><line x1="20" y1="18" x2="40" y2="18"/><line x1="20" y1="22" x2="40" y2="22"/><line x1="20" y1="26" x2="40" y2="26"/></svg>',
        noAC: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="30" cy="20" r="12" opacity="0.3"/><line x1="20" y1="12" x2="40" y2="28"/></svg>',
        house: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="30,6 8,22 8,36 52,36 52,22" fill="rgba(100,160,100,0.15)"/><rect x="25" y="26" width="10" height="10"/><line x1="16" y1="24" x2="20" y2="24"/><line x1="40" y1="24" x2="44" y2="24"/></svg>',
        twoHouse: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="30,6 4,22 4,36 56,36 56,22" fill="rgba(100,160,100,0.15)"/><line x1="30" y1="6" x2="30" y2="36"/><rect x="16" y="28" width="6" height="8"/><rect x="38" y="28" width="6" height="8"/></svg>',
        condo: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><rect x="14" y="6" width="32" height="30" fill="rgba(100,140,200,0.15)"/><line x1="20" y1="12" x2="24" y2="12"/><line x1="28" y1="12" x2="32" y2="12"/><line x1="36" y1="12" x2="40" y2="12"/><line x1="20" y1="18" x2="24" y2="18"/><line x1="28" y1="18" x2="32" y2="18"/><line x1="36" y1="18" x2="40" y2="18"/><line x1="20" y1="24" x2="24" y2="24"/><line x1="28" y1="24" x2="32" y2="24"/><line x1="36" y1="24" x2="40" y2="24"/><line x1="20" y1="30" x2="24" y2="30"/><line x1="28" y1="30" x2="32" y2="30"/><line x1="36" y1="30" x2="40" y2="30"/></svg>',
        townhouse: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="10,16 18,10 26,16 26,36 10,36" fill="rgba(130,100,80,0.15)"/><polygon points="26,16 34,10 42,16 42,36 26,36" fill="rgba(130,100,80,0.2)"/><polygon points="42,16 50,10 58,16 58,36 42,36" fill="rgba(130,100,80,0.15)"/><rect x="15" y="28" width="5" height="8"/><rect x="31" y="28" width="5" height="8"/><rect x="47" y="28" width="5" height="8"/></svg>',
        sewer: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="4" y="18" width="52" height="8" rx="4" fill="rgba(120,140,180,0.2)"/><circle cx="14" cy="22" r="2" fill="currentColor" stroke="none"/><path d="M4 30 l52 0 M4 34 l52 0" opacity="0.4"/></svg>',
        septic: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><ellipse cx="30" cy="14" rx="16" ry="4" fill="rgba(120,140,100,0.2)"/><path d="M14 14 l0 18 a16 4 0 0 0 32 0 l0 -18" fill="rgba(120,140,100,0.2)"/><line x1="4" y1="8" x2="14" y2="14"/></svg>',
        well: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="30" cy="28" r="10" fill="rgba(80,160,220,0.2)"/><rect x="22" y="6" width="16" height="6" fill="rgba(140,100,60,0.2)"/><line x1="22" y1="12" x2="18" y2="18"/><line x1="38" y1="12" x2="42" y2="18"/><line x1="18" y1="18" x2="42" y2="18"/></svg>',
        faucet: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="20" y="10" width="20" height="4" fill="rgba(80,160,220,0.2)"/><rect x="28" y="14" width="4" height="8"/><path d="M22 22 l16 0 l-2 8 l-12 0 z" fill="rgba(80,160,220,0.2)"/></svg>',
        garageAttached: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="18,10 32,6 46,10 46,36 18,36" fill="rgba(100,160,100,0.1)"/><rect x="22" y="20" width="20" height="16" fill="rgba(140,140,140,0.2)"/><line x1="22" y1="25" x2="42" y2="25"/><line x1="22" y1="30" x2="42" y2="30"/></svg>',
        garageDetached: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6,18 14,12 22,18 22,36 6,36" fill="rgba(100,160,100,0.1)"/><polygon points="32,14 44,8 56,14 56,36 32,36" fill="rgba(140,140,140,0.2)"/><line x1="35" y1="22" x2="53" y2="22"/><line x1="35" y1="28" x2="53" y2="28"/></svg>',
        carport: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6,16 30,8 54,16" fill="rgba(140,140,140,0.15)"/><line x1="10" y1="16" x2="10" y2="36"/><line x1="50" y1="16" x2="50" y2="36"/><rect x="20" y="24" width="20" height="10" fill="rgba(80,100,140,0.2)" stroke="none"/></svg>',
        stove: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="18" y="14" width="22" height="20" fill="rgba(120,80,60,0.2)"/><rect x="22" y="18" width="14" height="10" fill="rgba(255,140,40,0.3)"/><line x1="40" y1="14" x2="48" y2="10"/><line x1="48" y1="10" x2="48" y2="4"/></svg>',
        solar: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><rect x="12" y="14" width="36" height="18" fill="rgba(30,80,180,0.2)" transform="skewX(-10)"/><line x1="14" y1="20" x2="50" y2="20"/><line x1="14" y1="26" x2="50" y2="26"/></svg>',
        none: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="30" cy="20" r="12" opacity="0.3"/><line x1="22" y1="12" x2="38" y2="28"/></svg>',
        other: '<svg viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="30" cy="20" r="11"/><path d="M25,16 Q25,11 30,11 Q36,11 36,17 Q36,21 30,22"/><circle cx="30" cy="28" r="1.5" fill="currentColor" stroke="none"/></svg>',
    };

    /* ── Plumbing Material reference ─────────────────────────────────────
       Polybutylene (1978–1995) is the big decline flag — gray flexible
       plastic that fails catastrophically with chlorine exposure. */
    window.showPlumbingMaterialInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalPlumbingMaterial',
            targetFieldId: 'plumbingMaterial',
            title: 'Plumbing Material',
            subtitle: 'Supply-line material. Polybutylene is the big decline flag.',
            options: [
                { value: 'Copper', name: 'Copper', svg: ICON.pipe,
                  desc: 'Rigid copper supply lines. Durable, premium tier. 50+ year life. Green patina is normal.' },
                { value: 'PEX', name: 'PEX', svg: ICON.pipeFlex,
                  desc: 'Cross-linked polyethylene — flexible plastic (red/blue/white). Dominant on new builds since ~2005. Preferred at most carriers.' },
                { value: 'CPVC', name: 'CPVC', svg: ICON.pipe,
                  desc: 'Chlorinated PVC — rigid off-white/cream plastic. Common in Southern states. No decline concern.' },
                { value: 'PVC', name: 'PVC', svg: ICON.pipe,
                  desc: 'Polyvinyl chloride — rigid white plastic. Typically drain lines, not supply. If reported as supply, verify.' },
                { value: 'Galvanized Steel', name: 'Galvanized Steel', svg: ICON.pipeAged,
                  desc: 'Pre-1960s. Corrodes from the inside, reduces flow and leeches iron into water. Some carriers require replacement quote.' },
                { value: 'Polybutylene', name: 'Polybutylene ⚠️', svg: ICON.pipeAged,
                  desc: 'DECLINE FLAG. Gray flexible plastic installed 1978–1995. Reacts with chlorine and fails catastrophically. Most carriers decline; some require full replacement before binding.' },
                { value: 'Cast Iron', name: 'Cast Iron', svg: ICON.pipeAged,
                  desc: 'Typically drain/waste/vent, not supply. Older homes. Heavy, eventually cracks.' },
                { value: 'Mixed', name: 'Mixed', svg: ICON.pipe,
                  desc: 'Combination of materials (e.g. copper supply + PEX remodel). Note the mix in additional info.' },
                { value: 'Unknown', name: 'Unknown', svg: ICON.other,
                  desc: 'Client doesn\'t know, inspection pending. Flag for follow-up.' },
            ]
        });
    };

    /* ── Electrical Panel reference ──────────────────────────────────────
       The FPE / Zinsco recall is the #1 decline flag in this category. */
    window.showElectricalPanelInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalElectricalPanel',
            targetFieldId: 'electricalPanel',
            title: 'Electrical Panel',
            subtitle: 'Federal Pacific and Zinsco panels are recalled — most carriers decline.',
            options: [
                { value: 'Standard Breaker', name: 'Standard Breaker', svg: ICON.panel,
                  desc: 'Modern circuit-breaker panel (Square D, Siemens, Eaton, GE). Preferred. No concern.' },
                { value: 'Federal Pacific (FPE)', name: 'Federal Pacific / FPE ⚠️', svg: ICON.panelDanger,
                  desc: 'DECLINE FLAG. "Stab-Lok" breakers fail to trip. Recalled decades ago, still in homes 1950–80s. Almost every carrier declines until replaced.' },
                { value: 'Zinsco', name: 'Zinsco ⚠️', svg: ICON.panelDanger,
                  desc: 'DECLINE FLAG. Aluminum bus bars corrode and arc. Also sold as Sylvania-Zinsco. Same treatment as FPE — most carriers decline.' },
                { value: 'Pushmatic', name: 'Pushmatic', svg: ICON.fuseBox,
                  desc: 'Push-button breakers (Bulldog). Obsolete but not banned — some carriers accept, others want inspection. Verify before binding.' },
                { value: 'Fuse Box', name: 'Fuse Box', svg: ICON.fuseBox,
                  desc: 'Pre-breaker screw-in fuse panel. Almost always 60-amp service. Carriers typically require upgrade to breakers + 100+ amp.' },
                { value: 'Other', name: 'Other', svg: ICON.other,
                  desc: 'Not listed. Note manufacturer/model in additional info; underwriter may request photo.' },
            ]
        });
    };

    /* ── Electrical Amperage reference ───────────────────────────────── */
    window.showElectricalAmpsInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalElectricalAmps',
            targetFieldId: 'electricalAmps',
            title: 'Electrical Amperage',
            subtitle: 'Main service capacity. 60-amp is often declined; 100+ is modern standard.',
            options: [
                { value: '60 Amp', name: '60 Amp ⚠️', svg: ICON.gauge,
                  desc: 'Pre-1960 service. Not enough capacity for modern appliances. Often paired with a fuse box. Most carriers decline or require upgrade.' },
                { value: '100 Amp', name: '100 Amp', svg: ICON.gauge,
                  desc: 'Minimum modern service. Fine for small homes without central AC, EV chargers, or electric heat. Acceptable to most carriers.' },
                { value: '150 Amp', name: '150 Amp', svg: ICON.gauge,
                  desc: 'Common on mid-size homes built 1970s–90s. No concerns.' },
                { value: '200 Amp', name: '200 Amp', svg: ICON.gauge,
                  desc: 'Standard on new construction. Handles central AC, electric range, EV charger. Preferred tier.' },
                { value: '400 Amp', name: '400 Amp', svg: ICON.gauge,
                  desc: 'Large or high-end homes. Multiple subpanels. Often paired with detached structures or heated pools.' },
                { value: 'Unknown', name: 'Unknown', svg: ICON.other,
                  desc: 'Client doesn\'t know. Check the main breaker on the panel — the number stamped on it is the amperage.' },
            ]
        });
    };

    /* ── Water Heater Location reference ─────────────────────────────── */
    window.showWaterHeaterLocationInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalWaterHeaterLocation',
            targetFieldId: 'waterHeaterLocation',
            title: 'Water Heater Location',
            subtitle: 'Attic placement is the underwriting concern — leaks destroy ceilings below.',
            options: [
                { value: 'Basement', name: 'Basement', svg: ICON.tank,
                  desc: 'Ideal location. Any leak drains down, floor drain or sump catches it. No concern.' },
                { value: 'Garage', name: 'Garage', svg: ICON.tank,
                  desc: 'Common in newer homes. Fine — concrete floor handles any leak. Gas heaters must be 18" off the ground (code).' },
                { value: 'Closet', name: 'Closet', svg: ICON.tank,
                  desc: 'Typical in smaller homes and condos. Verify drip pan + drain line present if leak occurs.' },
                { value: 'Attic', name: 'Attic ⚠️', svg: ICON.tankWarn,
                  desc: 'CARRIER CONCERN. Leaks drop through ceiling into living space — frequent total-loss interior damage. Some carriers rate up, some decline unless pan + drain are verified.' },
                { value: 'Crawl Space', name: 'Crawl Space', svg: ICON.tank,
                  desc: 'Access can be tight. Leaks stay contained but service is harder. Verify pan + drain.' },
                { value: 'Utility Room', name: 'Utility Room', svg: ICON.tank,
                  desc: 'Dedicated mechanical room. Ideal — plumbing built for it, drain typically present.' },
                { value: 'Other', name: 'Other', svg: ICON.other,
                  desc: 'Anywhere else (tankless wall-mount, outdoor enclosure). Note specifics in additional info.' },
            ]
        });
    };

    /* ── Foundation reference ─────────────────────────────────────────── */
    window.showFoundationInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalFoundation',
            targetFieldId: 'foundation',
            title: 'Foundation',
            subtitle: 'How the home is supported. Affects earthquake, flood, and water-damage rating.',
            options: [
                { value: 'Slab', name: 'Slab', svg: ICON.slab,
                  desc: 'Poured concrete directly on the ground. No space beneath. Common in warm climates. No basement coverage needed.' },
                { value: 'Crawl Space - Enclosed', name: 'Crawl Space — Enclosed', svg: ICON.crawl,
                  desc: 'Sealed crawl space, typically vented. Small clearance under the floor. Protects plumbing from freezing.' },
                { value: 'Crawl Space - Open', name: 'Crawl Space — Open', svg: ICON.crawl,
                  desc: 'Open-sided crawl (piers + skirt). Exposed to wind/weather. More freeze-risk for plumbing.' },
                { value: 'Basement - Finished', name: 'Basement — Finished', svg: ICON.basement,
                  desc: 'Full livable basement. Adds to total square footage for insurance purposes (clarify with carrier). Check sump pump + water-backup coverage.' },
                { value: 'Basement - Partially Finished', name: 'Basement — Partially Finished', svg: ICON.basement,
                  desc: 'Partly livable, partly mechanical. Standard treatment. Note finished % in additional info.' },
                { value: 'Basement - Unfinished', name: 'Basement — Unfinished', svg: ICON.basement,
                  desc: 'Concrete floors/walls, mechanical only. Still flood/water-backup risk — recommend the endorsement.' },
                { value: 'Basement - Walkout', name: 'Basement — Walkout', svg: ICON.basement,
                  desc: 'Basement with exterior door at grade (hillside construction). Flood risk varies — check elevation.' },
                { value: 'Daylight Basement - Finished', name: 'Daylight Basement — Finished', svg: ICON.basement,
                  desc: 'Basement with windows above grade because of sloped lot. Treated as finished basement.' },
                { value: 'Daylight Basement - Unfinished', name: 'Daylight Basement — Unfinished', svg: ICON.basement,
                  desc: 'Same geometry, no interior finish.' },
                { value: 'Hillside Foundation', name: 'Hillside Foundation', svg: ICON.piers,
                  desc: 'Mixed stepped foundation following a slope. Often part slab, part walkout. Verify drainage + earthquake retrofit on older construction.' },
                { value: 'Piers', name: 'Piers', svg: ICON.piers,
                  desc: 'Concrete columns supporting the floor system. Common in coastal/flood zones or where soil heaves.' },
                { value: 'Pilings/stilts', name: 'Pilings / Stilts', svg: ICON.piers,
                  desc: 'Deep driven piles — coastal/flood construction. Flood zone + wind exposure both elevated; check elevation certificate.' },
                { value: 'Other', name: 'Other', svg: ICON.other,
                  desc: 'Not listed. Note type in additional info.' },
            ]
        });
    };

    /* ── Cooling reference ─────────────────────────────────────────────── */
    window.showCoolingInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalCooling',
            targetFieldId: 'cooling',
            title: 'Cooling System',
            subtitle: 'Central vs. window vs. none — affects replacement-cost calc.',
            options: [
                { value: 'Central Air', name: 'Central Air', svg: ICON.fan,
                  desc: 'Whole-house AC using ductwork — typically shares air handler with heat. Increases replacement cost vs. no AC.' },
                { value: 'Window Units', name: 'Window Units', svg: ICON.windowAC,
                  desc: 'Individual room AC units. Contents, not structure — not part of dwelling replacement cost.' },
                { value: 'None', name: 'None', svg: ICON.noAC,
                  desc: 'No AC. Common in the Pacific Northwest and mild coastal climates. Perfectly acceptable.' },
            ]
        });
    };

    /* ── Dwelling Type reference ──────────────────────────────────────── */
    window.showDwellingTypeInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalDwellingType',
            targetFieldId: 'dwellingType',
            title: 'Dwelling Type',
            subtitle: 'The structure form. Drives the rating tier and which carriers will quote.',
            options: [
                { value: 'One Family', name: 'One Family', svg: ICON.house,
                  desc: 'Single-family detached home. Standard residential rating. Most carriers quote.' },
                { value: 'Two Family', name: 'Two Family (Duplex)', svg: ICON.twoHouse,
                  desc: 'Duplex — two dwelling units in one structure. Owner-occupied vs. full rental affects rating significantly.' },
                { value: 'Three Family', name: 'Three Family (Triplex)', svg: ICON.twoHouse,
                  desc: 'Triplex. Many personal carriers decline — may need a DP-3 (rental dwelling) or commercial product.' },
                { value: 'Four Family', name: 'Four Family (Fourplex)', svg: ICON.twoHouse,
                  desc: 'Fourplex. Usually written as commercial/multi-family, not personal lines.' },
                { value: 'Condo', name: 'Condo', svg: ICON.condo,
                  desc: 'Owner of an individual unit in a building; HOA covers exterior/common. Needs HO-6 policy — different coverage structure than HO-3.' },
                { value: 'Townhome', name: 'Townhome', svg: ICON.townhouse,
                  desc: 'Attached unit with shared walls, individually deeded lot. Usually HO-3 with walls-in adjustments. Check HOA master policy.' },
                { value: 'Row House', name: 'Row House', svg: ICON.townhouse,
                  desc: 'Older urban attached housing, typically brick. Similar underwriting to townhome — verify party-wall responsibility.' },
            ]
        });
    };

    /* ── Sewer reference ───────────────────────────────────────────────── */
    window.showSewerInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalSewer',
            targetFieldId: 'sewer',
            title: 'Sewer',
            subtitle: 'Where waste water goes. Septic drives a different coverage conversation (service line, backup).',
            options: [
                { value: 'Public', name: 'Public Sewer', svg: ICON.sewer,
                  desc: 'Municipal sewer line. Service Line endorsement still valuable — protects the pipe from the house to the street.' },
                { value: 'Septic', name: 'Septic System', svg: ICON.septic,
                  desc: 'On-site septic tank + drain field. No municipal service line, but the tank/field itself can fail. Note age + last pumping in additional info.' },
            ]
        });
    };

    /* ── Water Source reference ────────────────────────────────────────── */
    window.showWaterSourceInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalWaterSource',
            targetFieldId: 'waterSource',
            title: 'Water Source',
            subtitle: 'Where the house gets its water. Well homes need the pump/lines covered.',
            options: [
                { value: 'Public', name: 'Public Water', svg: ICON.faucet,
                  desc: 'Municipal water supply. Service Line endorsement covers the pipe between the main and the house.' },
                { value: 'Well', name: 'Well', svg: ICON.well,
                  desc: 'Private well — pump, pressure tank, lines. Well-pump failure can be expensive; Equipment Breakdown endorsement is highly recommended.' },
            ]
        });
    };

    /* ── Garage Type reference ─────────────────────────────────────────── */
    window.showGarageTypeInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalGarageType',
            targetFieldId: 'garageType',
            title: 'Garage Type',
            subtitle: 'Attached vs. detached changes how damage gets paid (Coverage A vs. B).',
            options: [
                { value: 'Attached', name: 'Attached Garage', svg: ICON.garageAttached,
                  desc: 'Shares a wall with the dwelling. Covered under Coverage A (dwelling) — same replacement cost basis.' },
                { value: 'Detached', name: 'Detached Garage', svg: ICON.garageDetached,
                  desc: 'Separate structure. Covered under Coverage B (other structures) — typically 10% of Cov A by default. Increase if the garage is high-value.' },
                { value: 'Built-in', name: 'Built-in Garage', svg: ICON.garageAttached,
                  desc: 'Integrated into the main structure (often under living space). Treated like attached — Coverage A.' },
                { value: 'Carport', name: 'Carport', svg: ICON.carport,
                  desc: 'Open roof, no walls. May be Coverage A if attached, Coverage B if freestanding.' },
                { value: 'None', name: 'None', svg: ICON.none,
                  desc: 'No garage. Vehicles park outside or on street.' },
            ]
        });
    };

    /* ── Secondary Heating reference ──────────────────────────────────── */
    window.showSecondaryHeatingInfo = function () {
        _createPickerModal({
            id: 'fieldInfoModalSecondaryHeating',
            targetFieldId: 'secondaryHeating',
            title: 'Secondary Heating Source',
            subtitle: 'Non-primary heat. Non-professional installs + portable heaters are the concerns.',
            options: [
                { value: 'Wood Professionally Installed', name: 'Wood — Pro Installed', svg: ICON.stove,
                  desc: 'Permitted install with proper clearances, flue, hearth. Usually acceptable to carriers; may require photo + inspection certificate.' },
                { value: 'Wood Non-Professionally Installed', name: 'Wood — DIY / Non-Pro ⚠️', svg: ICON.stove,
                  desc: 'CONCERN. No permit or unknown install quality. Many carriers decline or require a WETT/professional inspection before binding.' },
                { value: 'Coal Professionally Installed', name: 'Coal — Pro Installed', svg: ICON.stove,
                  desc: 'Permitted coal stove. Same underwriting lens as pro-installed wood. Less common outside Appalachia.' },
                { value: 'Coal Non-Professionally Installed', name: 'Coal — DIY / Non-Pro ⚠️', svg: ICON.stove,
                  desc: 'Same concern as non-pro wood. Inspection typically required.' },
                { value: 'Electric', name: 'Electric Permanent', svg: ICON.fan,
                  desc: 'Permanently wired electric baseboard, radiant panel, or heat pump supplement. No fire risk.' },
                { value: 'Electric Portable Heater', name: 'Electric Portable ⚠️', svg: ICON.windowAC,
                  desc: 'CONCERN if used as sole source of heat in a room. Many residential fires start here. Note in additional info.' },
                { value: 'Kerosene', name: 'Kerosene', svg: ICON.stove,
                  desc: 'Vented kerosene heater. Acceptable if vented properly. Document tank location.' },
                { value: 'Kerosene Portable Heater', name: 'Kerosene Portable ⚠️', svg: ICON.stove,
                  desc: 'CONCERN. Unvented portable kerosene — carbon monoxide + fire risk. Often declined.' },
                { value: 'Liquid Propane', name: 'Liquid Propane', svg: ICON.other,
                  desc: 'Permanent LP-fueled supplemental heat. Note tank location (above-ground vs. buried).' },
                { value: 'Liquid Propane Portable Heater', name: 'LP Portable ⚠️', svg: ICON.other,
                  desc: 'CONCERN. Portable propane — fuel storage + carbon monoxide risk. Often declined.' },
                { value: 'Natural Gas', name: 'Natural Gas', svg: ICON.other,
                  desc: 'Permanent natural-gas supplemental unit. Acceptable.' },
                { value: 'Oil', name: 'Oil', svg: ICON.other,
                  desc: 'Permanent oil-fired supplemental unit. Check tank age + location.' },
                { value: 'Solar Professionally Installed', name: 'Solar — Pro Installed', svg: ICON.solar,
                  desc: 'Solar thermal / radiant backup. No fire risk. Often a credit.' },
                { value: 'Solar Non-Professionally Installed', name: 'Solar — DIY ⚠️', svg: ICON.solar,
                  desc: 'CONCERN. Non-permitted install — carrier may require an electrical inspection before binding.' },
                { value: 'Other', name: 'Other', svg: ICON.other,
                  desc: 'Not listed (pellet stove without primary heat, pellet insert, etc.). Note specifics in additional info.' },
            ]
        });
    };

})();
