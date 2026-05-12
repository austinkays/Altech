// intake-v2-layout.js — Workspace chrome: top bar, left-rail anchors,
// right-rail talk track / follow-ups / last entries, mode toggle, rails toggle.
//
// Renders the static skeleton from plugins/intake-v2.html on init, then
// re-renders the dynamic widgets after each save (called from core._afterSave).
//
// Renders the "Quick Start" section (applicant + co-applicant + address)
// because those scalar fields are the most-touched on a call and benefit
// from a single tight grid layout. Other sections (operators, products,
// coverage, history, review) own their own DOM.

'use strict';

(function () {

const esc      = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');
const escAttr  = (s) => (window.Utils && window.Utils.escapeAttr) ? window.Utils.escapeAttr(String(s ?? '')) : String(s ?? '').replace(/"/g, '&quot;');

const SECTION_ORDER = ['iv2-quick','iv2-household','iv2-properties','iv2-coverage','iv2-history','iv2-review'];

function renderQuickSection() {
    const root = document.querySelector('#iv2-quick [data-render="quick"]');
    if (!root) return;
    const fields = window.IntakeV2Fields && window.IntakeV2Fields.scalar;
    if (!fields) return;

    const coPresent = !!(window.IntakeV2.data && window.IntakeV2.data.coApplicant && window.IntakeV2.data.coApplicant.present);

    // Group "quick" section fields by their natural cluster. The Co-Applicant
    // cluster always renders its toggle; the rest of its fields only render
    // when the toggle is on so the form doesn't show empty co-app inputs.
    const coFullPaths = ['coApplicant.relationship','coApplicant.firstName','coApplicant.lastName','coApplicant.dob','coApplicant.gender','coApplicant.maritalStatus','coApplicant.phone','coApplicant.email','coApplicant.occupation','coApplicant.industry','coApplicant.education'];
    const clusters = [
        { title: 'About the Applicant',    paths: ['applicant.prefix','applicant.firstName','applicant.middleName','applicant.lastName','applicant.suffix','applicant.dob','applicant.ssn','applicant.gender','applicant.maritalStatus','applicant.phone','applicant.email','applicant.occupation','applicant.industry','applicant.education'] },
        { title: 'Co-Applicant',           paths: ['coApplicant.present', ...(coPresent ? coFullPaths : [])] },
        { title: 'Mailing Address',        paths: ['address.street','address.city','address.state','address.zip','address.county','address.yearsAt','address.previous.street','address.previous.city','address.previous.state','address.previous.zip'] },
        { title: 'Household Preferences',  paths: ['household.homeownership','household.contactMethod','household.contactTime','household.referralSource','household.tcpaConsent','household.creditCheckAuth'] },
    ];

    root.innerHTML = clusters.map(cluster => {
        const items = cluster.paths.map(p => fields.find(f => f.path === p)).filter(Boolean);
        const grid  = items.map(renderScalarField).join('');
        return `
            <div class="iv2-field-cluster">
                <h4 style="margin:8px 0 6px; font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">${esc(cluster.title)}</h4>
                <div class="iv2-field-grid">${grid}</div>
            </div>`;
    }).join('');
}

function renderScalarField(f) {
    const fullClass = f.mode === 'full' ? ' iv2-full-only' : '';
    let control;
    if (f.type === 'select') {
        const opts = (f.options || []).map(opt => `<option value="${escAttr(opt)}">${esc(opt || '—')}</option>`).join('');
        control = `<select id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}">${opts}</select>`;
    } else if (f.type === 'checkbox') {
        return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(f.path)}"><label style="flex-direction:row; align-items:center; gap:6px;"><input type="checkbox" id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}"> ${esc(f.label)}</label><span class="iv2-field-defer-badge" style="display:none">deferred</span></div>`;
    } else if (f.type === 'textarea') {
        control = `<textarea id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}" rows="3"></textarea>`;
    } else {
        control = `<input type="${escAttr(f.type)}" id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}">`;
    }
    return `<div class="iv2-field${fullClass}" data-field-wrap="${escAttr(f.path)}">
        <label for="${escAttr(f.id)}">${esc(f.label)}</label>
        ${control}
        <span class="iv2-field-defer-badge" style="display:none">deferred</span>
    </div>`;
}

function renderTopbarStatus() {
    const bind = window.IntakeV2.bindability;
    const root = document.getElementById('iv2BindabilityIndicator');
    if (!root || !bind) return;
    for (const carrierEl of root.querySelectorAll('.iv2-carrier')) {
        const carrier = carrierEl.getAttribute('data-carrier');
        const info = bind[carrier];
        if (!info) continue;
        carrierEl.classList.toggle('is-ok', !!info.ok);
        carrierEl.classList.toggle('is-miss', !info.ok);
        carrierEl.title = info.ok
            ? `${info.label}: ready to quote`
            : `${info.label}: missing ${info.missing.length} field(s)\n` + info.missing.slice(0, 6).map(m => '• ' + m.label + (m.itemLabel ? ` — ${m.itemLabel}` : '')).join('\n') + (info.missing.length > 6 ? `\n…and ${info.missing.length - 6} more` : '');
    }

    // Save status pill
    const status = document.getElementById('iv2SaveStatus');
    if (status) {
        if (window.IntakeV2._lastSaveOk === false) {
            status.textContent = 'Save failed — retrying';
            status.className = 'iv2-save-status is-error';
        } else {
            status.textContent = 'Saved';
            status.className   = 'iv2-save-status';
        }
    }
}

function renderJumpBadges() {
    const ops    = (window.IntakeV2.data.operators || []).length;
    const prodCount = ['homes','autos','boats','rvs'].reduce((n, k) => n + ((window.IntakeV2.data[k] || []).length), 0);
    const followups = (window.IntakeV2.data.deferred || []).length;

    document.querySelectorAll('[data-count="operators"]').forEach(el => el.textContent = String(ops));
    document.querySelectorAll('[data-count="operators-label"]').forEach(el => el.textContent = `${ops} ${ops === 1 ? 'person' : 'people'}`);
    document.querySelectorAll('[data-count="products"]').forEach(el => el.textContent = String(prodCount));
    document.querySelectorAll('[data-count="products-label"]').forEach(el => {
        if (prodCount === 0) el.textContent = 'Nothing added yet';
        else {
            const bits = [];
            const d = window.IntakeV2.data;
            if (d.homes.length) bits.push(`${d.homes.length} home${d.homes.length>1?'s':''}`);
            if (d.autos.length) bits.push(`${d.autos.length} auto${d.autos.length>1?'s':''}`);
            if (d.boats.length) bits.push(`${d.boats.length} boat${d.boats.length>1?'s':''}`);
            if (d.rvs.length)   bits.push(`${d.rvs.length} RV${d.rvs.length>1?'s':''}`);
            el.textContent = bits.join(' · ');
        }
    });
    const fc = document.getElementById('iv2FollowupCount');
    if (fc) fc.textContent = String(followups);
    const fc2 = document.getElementById('iv2FollowupCount2');
    if (fc2) fc2.textContent = String(followups);
}

function renderTalkTrack() {
    const root = document.getElementById('iv2TalkTrack');
    if (!root || !window.IntakeV2TalkTrack) return;
    const suggestions = window.IntakeV2TalkTrack.computeSuggestions(window.IntakeV2.data);
    if (!suggestions.length) {
        root.innerHTML = `<em style="color:var(--text-secondary)">No prompts right now. Suggestions appear as the conversation progresses.</em>`;
        return;
    }
    root.innerHTML = suggestions.slice(0, 3).map(s => `<div class="iv2-talk-item" data-talk-id="${escAttr(s.id)}">${s.html}</div>`).join('<hr style="border:none; border-top:1px solid var(--border); margin:8px 0">');
}

function renderLastEntries() {
    const root = document.getElementById('iv2LastEntries');
    if (!root) return;
    const entries = window.IntakeV2.lastEntries || [];
    if (!entries.length) {
        root.innerHTML = `<div style="color:var(--text-secondary); font-style:italic">No entries yet.</div>`;
        return;
    }
    root.innerHTML = entries.map(e => {
        const t = new Date(e.at);
        const ts = t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0') + ':' + t.getSeconds().toString().padStart(2, '0');
        const val = e.value === '' ? '(cleared)' : (typeof e.value === 'boolean' ? (e.value ? '✓' : '☐') : String(e.value));
        return `<div class="iv2-le"><span class="iv2-le-time">${esc(ts)}</span><span class="iv2-le-path">${esc(e.path)}</span><span>= ${esc(val)}</span></div>`;
    }).join('');
}

function wireTopbarHandlers() {
    // Mode toggle
    document.querySelectorAll('[data-mode-set]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode-set');
            setMode(mode);
        });
    });
    // Rails toggle
    const railsBtn = document.getElementById('iv2RailsToggle');
    if (railsBtn) railsBtn.addEventListener('click', toggleRails);

    // Jump list
    document.querySelectorAll('[data-jump]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-jump');
            const el = document.getElementById(target);
            if (el) {
                if (el.tagName === 'DETAILS' && !el.open) el.open = true;
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                document.querySelectorAll('#iv2JumpList button.is-current').forEach(b => b.classList.remove('is-current'));
                btn.classList.add('is-current');
            }
        });
    });

    // Product add buttons
    document.querySelectorAll('[data-add]').forEach(btn => {
        btn.addEventListener('click', () => {
            const which = btn.getAttribute('data-add');
            const map = { home: 'homes', auto: 'autos', boat: 'boats', rv: 'rvs' };
            const collKey = map[which];
            if (!collKey) return;
            const item = window.IntakeV2.addItem(collKey, {});
            // Focus the new card's first input after render
            setTimeout(() => {
                const first = document.querySelector(`[data-card-of="${collKey}"][data-item-id="${item.id}"] input, [data-card-of="${collKey}"][data-item-id="${item.id}"] select`);
                if (first) first.focus();
            }, 50);
        });
    });

    // FAB
    const fab = document.getElementById('iv2FabAdd');
    if (fab) fab.addEventListener('click', () => {
        // Context-aware: if focus is inside a section, add to that collection.
        const active = document.activeElement;
        let collKey = 'operators';
        if (active) {
            const card = active.closest('[data-card-of]');
            if (card) collKey = card.getAttribute('data-card-of');
            else {
                const sec = active.closest('section.iv2-section');
                if (sec) {
                    if (sec.id === 'iv2-properties') collKey = 'autos'; // default: most common
                    if (sec.id === 'iv2-household')  collKey = 'operators';
                }
            }
        }
        const item = window.IntakeV2.addItem(collKey, {});
        setTimeout(() => {
            const first = document.querySelector(`[data-card-of="${collKey}"][data-item-id="${item.id}"] input, [data-card-of="${collKey}"][data-item-id="${item.id}"] select`);
            if (first) first.focus();
        }, 50);
    });

    // Help button
    const help = document.getElementById('iv2HelpBtn');
    if (help) help.addEventListener('click', () => {
        if (window.IntakeV2._keyboard && typeof window.IntakeV2._keyboard.showHelp === 'function') {
            window.IntakeV2._keyboard.showHelp();
        } else if (window.App && typeof window.App.toast === 'function') {
            window.App.toast('Shortcuts: N=add · Alt+L=defer · Alt+1-6=jump · J/K=section nav · ⌘K=palette', { type: 'info', duration: 6000 });
        }
    });
}

function setMode(mode) {
    if (mode !== 'quick' && mode !== 'full') mode = 'quick';
    window.IntakeV2.mode = mode;
    const root = document.getElementById('iv2Root');
    if (root) root.dataset.mode = mode;
    document.querySelectorAll('[data-mode-set]').forEach(b => b.classList.toggle('is-active', b.getAttribute('data-mode-set') === mode));
    try { localStorage.setItem(window.IntakeV2.MODE_KEY, mode); } catch (_) {}
    if (window.IntakeV2.data && window.IntakeV2.data.meta) {
        window.IntakeV2.data.meta.mode = mode;
        window.IntakeV2.scheduleSave();
    }
}

function toggleRails() {
    const root = document.getElementById('iv2Root');
    if (!root) return;
    const current = root.dataset.rails || 'expanded';
    const next = current === 'expanded' ? 'collapsed' : 'expanded';
    root.dataset.rails = next;
    root.classList.toggle('iv2-collapsed-rails', next === 'collapsed');
    try { localStorage.setItem(window.IntakeV2.RAILS_KEY, next); } catch (_) {}
}

// Boot hook
window.IntakeV2.onBoot(function () {
    // Restore mode + rails preferences
    try {
        const savedMode  = localStorage.getItem(this.MODE_KEY);
        const savedRails = localStorage.getItem(this.RAILS_KEY);
        if (savedMode === 'quick' || savedMode === 'full') setMode(savedMode); else setMode(this.mode || 'quick');
        if (savedRails === 'collapsed') toggleRails();
    } catch (_) { setMode(this.mode || 'quick'); }

    renderQuickSection();
    wireTopbarHandlers();
    renderJumpBadges();
    renderTopbarStatus();
    renderTalkTrack();
    renderLastEntries();

    // Apply DOM values after the quick section is rendered
    this.applyData();

    // Register so requestRerender('layout') refreshes the section
    this.registerRenderer('layout', () => {
        renderQuickSection();
        // restore values into the freshly-rendered inputs
        for (const f of window.IntakeV2Fields.scalar) {
            const el = document.getElementById(f.id);
            if (!el) continue;
            const v = window.IntakeV2._getByPath(this.data, f.path);
            if (el.type === 'checkbox') el.checked = !!v;
            else el.value = v == null ? '' : String(v);
        }
        renderJumpBadges();
    });

    this._layout = { renderTopbarStatus, renderJumpBadges, renderTalkTrack, renderLastEntries, setMode, toggleRails };

    // Initial bindability paint
    if (window.IntakeV2Bindability) {
        this.bindability = window.IntakeV2Bindability.computeBindability({ data: this.data });
        renderTopbarStatus();
    }
});

})();
