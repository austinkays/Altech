// intake-v2-rvs.js — RV card renderer.
//
// Reuses IntakeV2EntityCard for the standard shell. RV-specific touches:
//   - Class chip selector at the top (A / B / C / Travel Trailer / Fifth-Wheel /
//     Toy Hauler / Pop-Up / Bus Conversion) — quicker than scrolling a dropdown
//   - "Full-timer" + "Stationary year-round" + "Rented or chartered" badges
//   - Inline note when Total Loss Replacement applies (new RV, under 1 yr)

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

const RV_CLASSES = [
    { value: 'A',              label: 'Class A' },
    { value: 'B',              label: 'Class B' },
    { value: 'C',              label: 'Class C' },
    { value: 'travelTrailer',  label: 'Travel Trailer' },
    { value: 'fifthWheel',     label: '5th Wheel' },
    { value: 'toyHauler',      label: 'Toy Hauler' },
    { value: 'popUp',          label: 'Pop-Up' },
    { value: 'busConversion',  label: 'Bus Conversion' },
];

function classChips(rv) {
    return `<div class="iv2-chip-row" style="margin-bottom:8px">
        ${RV_CLASSES.map(c => `<button type="button" class="iv2-chip ${rv.class === c.value ? 'is-selected' : ''}" data-rv-class="${escAttr(c.value)}" data-rv-id="${escAttr(rv.id)}">${esc(c.label)}</button>`).join('')}
    </div>`;
}

function extraRvBody(rv) {
    const year = Number(rv.year);
    const age = year ? (new Date().getFullYear() - year) : 99;
    if (age <= 1 && !rv.totalLossReplacementRequested) {
        return `<div style="margin-top:8px; padding:8px 10px; border-radius:8px; background:rgba(0,122,255,0.06); border-left:3px solid var(--apple-blue); font-size:12px;">
            <strong>Tip:</strong> New RV — offer Total Loss Replacement (covers full purchase price including tax/fees in first 5 yrs).
        </div>`;
    }
    return '';
}

function renderRvs() {
    const root = document.querySelector('[data-render="rvs"]');
    if (!root) return;
    const rvs = window.IntakeV2.data.rvs || [];
    if (!rvs.length) {
        root.innerHTML = '';
        return;
    }
    const cards = rvs.map(r => {
        const card = window.IntakeV2EntityCard.renderEntityCard('rvs', r, {
            extraBodyHTML: extraRvBody(r),
        });
        // Inject the chip row right before the field grid
        return card.replace('<div class="iv2-field-grid">', classChips(r) + '<div class="iv2-field-grid">');
    }).join('');
    root.innerHTML = `<h4 style="margin:6px 0; color:var(--text-secondary); font-size:12px; text-transform:uppercase; letter-spacing:0.05em;">RVs (${rvs.length})</h4>${cards}`;
    window.IntakeV2EntityCard.wireCardActions(root, 'rvs');

    // Class chip handlers
    root.querySelectorAll('[data-rv-class]').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.getAttribute('data-rv-id');
            const cls = chip.getAttribute('data-rv-class');
            const rv = window.IntakeV2.getItem('rvs', id);
            if (!rv) return;
            rv.class = cls;
            window.IntakeV2.save();
            window.IntakeV2.requestRerender('rvs');
        });
    });
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('rvs', renderRvs);
    renderRvs();
});

})();
