// intake-v2-property.js — Home/property card renderer.
//
// Uses IntakeV2EntityCard.renderEntityCard for the standard card shell, then
// adds an "Address + autofill" header so the agent can paste a Zillow URL or
// type an address and have Rentcast + ArcGIS prefill the property fields.
//
// Each home card carries a short "address" field above the standard field
// grid. Subsequent fields (yrBuilt, sqFt, …) are driven by the collection
// schema in intake-v2-fields.js.

'use strict';

(function () {

const esc     = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

function addressHeader(home) {
    return `
        <div class="iv2-field-grid" style="margin-bottom:8px">
            <div class="iv2-field" data-field-wrap="homes#${escAttr(home.id)}.address" style="grid-column: span 2;">
                <label for="iv2-home-address-${escAttr(home.id)}">Property Address</label>
                <input type="text" id="iv2-home-address-${escAttr(home.id)}" data-collection="homes" data-item-id="${escAttr(home.id)}" data-field-path="address" value="${escAttr(home.address || '')}" placeholder="123 Main St, Anytown, WA 98101">
                <span class="iv2-field-defer-badge" style="display:none">deferred</span>
            </div>
            <div class="iv2-field" style="align-self:end">
                <button type="button" class="iv2-icon-btn" data-rentcast-prefill="${escAttr(home.id)}" title="Pull property details from Rentcast">⚡ Autofill from address</button>
            </div>
        </div>`;
}

function renderHomes() {
    const root = document.querySelector('[data-render="homes"]');
    if (!root) return;
    const homes = window.IntakeV2.data.homes || [];
    if (!homes.length) {
        root.innerHTML = '';
        return;
    }
    const cards = homes.map(h => {
        return window.IntakeV2EntityCard.renderEntityCard('homes', h, {
            title: h.address || 'New Home',
            hideOperatorPicker: true,
            extraBodyHTML: '', // address rendered as header instead
        }).replace('<div class="iv2-field-grid">', addressHeader(h) + '<div class="iv2-field-grid">');
    }).join('');
    root.innerHTML = `<h4 style="margin:6px 0; color:var(--text-secondary); font-size:12px; text-transform:uppercase; letter-spacing:0.05em;">Homes (${homes.length})</h4>${cards}`;
    window.IntakeV2EntityCard.wireCardActions(root, 'homes');

    // Wire prefill buttons
    root.querySelectorAll('[data-rentcast-prefill]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-rentcast-prefill');
            tryPrefill(id);
        });
    });
}

async function tryPrefill(homeId) {
    const home = window.IntakeV2.getItem('homes', homeId);
    if (!home || !home.address) {
        if (window.App && window.App.toast) window.App.toast('Enter the property address first', { type: 'info' });
        return;
    }
    // Use existing App.rentcastLookup if available — it returns a unified result.
    if (window.App && typeof window.App.rentcastLookup === 'function') {
        try {
            if (window.App.toast) window.App.toast('Looking up property…', { type: 'info', duration: 1500 });
            const data = await window.App.rentcastLookup(home.address);
            if (data) applyPrefill(home, data);
        } catch (err) {
            if (window.App && window.App.toast) window.App.toast('Property lookup failed', { type: 'error' });
            // eslint-disable-next-line no-console
            console.warn('rentcastLookup failed:', err);
        }
    } else if (window.App && window.App.toast) {
        window.App.toast('Property lookup not available — fill manually', { type: 'info' });
    }
}

function applyPrefill(home, data) {
    const map = {
        yearBuilt: 'yrBuilt',
        squareFootage: 'sqFt',
        lotSize: 'lotSize',
        propertyType: 'dwellingType',
        bedrooms: 'bedrooms',
        bathrooms: 'fullBaths',
        county: null, // handled separately if present
    };
    Object.entries(map).forEach(([from, to]) => {
        if (data[from] != null && data[from] !== '' && to) {
            window.IntakeV2._setByPath(home, to, data[from]);
        }
    });
    window.IntakeV2.save();
    window.IntakeV2.requestRerender();
    if (window.App && window.App.toast) window.App.toast('Property details filled', { type: 'success' });
}

window.IntakeV2.onBoot(function () {
    this.registerRenderer('homes', renderHomes);
    renderHomes();
});

})();
