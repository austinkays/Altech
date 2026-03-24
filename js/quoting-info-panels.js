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

})();
