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
    //
    // `spans` maps each path to a 12-column span on desktop — the
    // "About the Applicant" name row gets the audited Prefix(1) /
    // First(3) / Middle(2) / Last(3) / Suffix(1) / DOB(2) shape, and
    // each address field claims a sensible chunk. Fields outside the
    // span map fall back to the default 12-col-wide row.
    const coFullPaths = ['coApplicant.relationship','coApplicant.firstName','coApplicant.lastName','coApplicant.dob','coApplicant.gender','coApplicant.maritalStatus','coApplicant.phone','coApplicant.email','coApplicant.occupation','coApplicant.industry','coApplicant.education'];
    const SPANS = {
        // Name row
        'applicant.prefix': 1, 'applicant.firstName': 3, 'applicant.middleName': 2,
        'applicant.lastName': 3, 'applicant.suffix': 1, 'applicant.dob': 2,
        // SSN + ID block (full mode)
        'applicant.ssn': 3, 'applicant.gender': 3, 'applicant.maritalStatus': 3,
        // Contact
        'applicant.phone': 4, 'applicant.email': 4,
        // Occupation / Industry / Education + the new employer fields fill
        // the row instead of leaving 4 empty cols.
        'applicant.occupation': 4, 'applicant.industry': 4, 'applicant.education': 4,
        'applicant.employerName': 6, 'applicant.yearsEmployed': 2,
        // Co-applicant block
        'coApplicant.present': 12,
        'coApplicant.relationship': 3, 'coApplicant.firstName': 3,
        'coApplicant.lastName': 3, 'coApplicant.dob': 3,
        // Address
        'address.street': 6, 'address.city': 3, 'address.state': 2, 'address.zip': 1,
        'address.county': 3, 'address.yearsAt': 2,
        'address.previous.street': 6, 'address.previous.city': 3,
        'address.previous.state': 2, 'address.previous.zip': 1,
    };
    const clusters = [
        { title: 'About the Applicant',    paths: ['applicant.prefix','applicant.firstName','applicant.middleName','applicant.lastName','applicant.suffix','applicant.dob','applicant.ssn','applicant.gender','applicant.maritalStatus','applicant.phone','applicant.email','applicant.occupation','applicant.industry','applicant.education','applicant.employerName','applicant.yearsEmployed'] },
        { title: 'Co-Applicant',           paths: ['coApplicant.present', ...(coPresent ? coFullPaths : [])] },
        { title: 'Mailing Address',        paths: ['address.street','address.city','address.state','address.zip','address.county','address.yearsAt','address.previous.street','address.previous.city','address.previous.state','address.previous.zip'] },
        { title: 'Household Preferences',  paths: ['household.homeownership','household.contactMethod','household.contactTime','household.referralSource','household.tcpaConsent','household.creditCheckAuth'] },
    ];

    root.innerHTML = clusters.map(cluster => {
        const items = cluster.paths.map(p => fields.find(f => f.path === p)).filter(Boolean);
        const grid  = items.map(f => renderScalarField(f, SPANS[f.path])).join('');
        return `
            <div class="iv2-field-cluster">
                <h4 style="margin:8px 0 6px; font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">${esc(cluster.title)}</h4>
                <div class="iv2-field-grid-12">${grid}</div>
            </div>`;
    }).join('');
}

// Inset speller button — wraps a text/email input in `.iv2-input-wrap` and
// stamps a small phonetic-trigger button inside the right edge of the
// input. Driven by `field.speller`: 'general' | 'vin' | 'dl' | 'plate' |
// 'email'. The wrapper + extra right-padding live in
// css/phonetic-speller.css (`.iv2-input-wrap` + `.iv2-speller-btn`). Click
// delegation in `_wireSpellerDelegation` (below) reads `data-speller-mode`
// off the button to drive PhoneticSpeller.open's mode argument.
function spellerInsetButton(mode) {
    const m = String(mode || 'general');
    return `<button type="button" class="iv2-speller-btn" data-speller-mode="${escAttr(m)}" tabindex="-1" aria-label="Phonetic speller (Alt+P)" title="Phonetic speller (Alt+P)">🔤</button>`;
}

function renderScalarField(f, span) {
    const fullClass = f.mode === 'full' ? ' iv2-full-only' : '';
    // Span is the 12-column width on desktop. Default to 12 (full row)
    // when the caller didn't specify — keeps fields visible even if a
    // future cluster forgets to provide a SPANS entry.
    const spanAttr = ` data-span="${escAttr(String(span || 12))}"`;
    let control;
    if (f.type === 'select') {
        // Options come in two shapes:
        //   1. plain strings — `value` and label are the same
        //   2. [value, label] tuples — the state list uses this so the
        //      stored USPS code stays "AL" while the user reads "Alabama (AL)"
        const opts = (f.options || []).map(opt => {
            const [value, label] = Array.isArray(opt) ? opt : [opt, opt];
            return `<option value="${escAttr(value)}">${esc(label || '—')}</option>`;
        }).join('');
        control = `<select id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}">${opts}</select>`;
    } else if (f.type === 'checkbox') {
        // Yes/no field. `kind: 'switch'` flips to the toggle-pill style
        // used for headline questions like "Co-Applicant?"; otherwise
        // emit the standard square checkbox row. Both wrap a real
        // <input type="checkbox"> so intake-v2-core's save/load
        // (`if (el.type === 'checkbox')`) keeps working unchanged.
        const rowClass = f.kind === 'switch' ? 'iv2-switch-row' : 'iv2-checkbox-row';
        return `<div class="iv2-field${fullClass}"${spanAttr} data-field-wrap="${escAttr(f.path)}"><label class="${rowClass}" for="${escAttr(f.id)}"><input type="checkbox" id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}"> <span>${esc(f.label)}</span></label><span class="iv2-field-defer-badge" style="display:none">deferred</span></div>`;
    } else if (f.type === 'textarea') {
        control = `<textarea id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}" rows="3"></textarea>`;
    } else {
        const input = `<input type="${escAttr(f.type)}" id="${escAttr(f.id)}" data-iv2-path="${escAttr(f.path)}">`;
        control = f.speller
            ? `<div class="iv2-input-wrap">${input}${spellerInsetButton(f.speller)}</div>`
            : input;
    }
    return `<div class="iv2-field${fullClass}"${spanAttr} data-field-wrap="${escAttr(f.path)}">
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

    // Save status pill — accurate message per failure mode. The old text
    // claimed "Save failed — retrying" but no retry mechanism existed.
    const status = document.getElementById('iv2SaveStatus');
    if (status) {
        if (window.IntakeV2._lastSaveLocked) {
            status.textContent = 'Vault locked — unlock to save';
            status.className = 'iv2-save-status is-error';
            status.title = 'Your encrypted vault is locked. Saves are refused until you enter your passphrase. Click the vault icon in the top right to unlock.';
        } else if (window.IntakeV2._lastSaveOk === false) {
            status.textContent = 'Save failed';
            status.className = 'iv2-save-status is-error';
            status.title = 'Most recent save failed — the next keystroke will retry. Check console for details.';
        } else {
            status.textContent = 'Saved';
            status.className   = 'iv2-save-status';
            status.title = '';
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

// Delegated click + keyboard handlers for every inset speller button
// stamped by `spellerInsetButton()`. Wires once at boot. The button has
// `data-speller-mode` (general | vin | dl | plate | email); the sibling
// `<input>` is the field we read from + write back to. PhoneticSpeller's
// `onCommit` callback fires when the user clicks "Apply" in the modal.
function wireSpellerDelegation() {
    if (wireSpellerDelegation._wired) return;
    wireSpellerDelegation._wired = true;

    const MODE_HINTS = Object.freeze({
        vin:    '17 alphanumeric characters. VINs never use I, O, or Q — those are 1, 0, and 0.',
        dl:     'DL formats vary by state. Read each character with its APCO word for confirmation.',
        plate:  'Letters and digits, uppercase only. Spaces and dashes are dropped.',
        email:  'Reads "@" as "at" and "." as "dot" so the client doesn\'t miss them on a call.',
        general:'',
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('.iv2-speller-btn');
        if (!btn) return;
        if (!btn.closest('#intakeV2Tool')) return;
        const wrap = btn.closest('.iv2-input-wrap');
        const input = wrap && wrap.querySelector('input');
        if (!input) return;
        if (typeof window.PhoneticSpeller === 'undefined') return;
        const mode = btn.getAttribute('data-speller-mode') || 'general';
        const hint = MODE_HINTS[mode] || '';
        window.PhoneticSpeller.open({
            seed: input.value,
            mode,
            hint,
            onCommit: (val) => {
                if (input.value === val) return;
                input.value = val;
                // Re-fire `input` so IntakeV2.core's save handler picks
                // the change up — without this the sanitized VIN /
                // plate would only land on disk after another keystroke.
                input.dispatchEvent(new Event('input', { bubbles: true }));
            },
        });
    });

    // Alt+P shortcut — opens the speller for whichever input the agent
    // is focused on, as long as that input is inside an .iv2-input-wrap
    // (i.e. the field already opted into spelling via `speller: '…'`).
    // Plain Alt+P on a non-speller field is a no-op so the keystroke
    // stays consistent across the form.
    document.addEventListener('keydown', (e) => {
        if (!e.altKey || e.key.toLowerCase() !== 'p') return;
        const el = document.activeElement;
        if (!el || el.tagName !== 'INPUT') return;
        if (!el.closest('#intakeV2Tool')) return;
        const wrap = el.closest('.iv2-input-wrap');
        if (!wrap) return;
        const btn = wrap.querySelector('.iv2-speller-btn');
        if (btn) {
            e.preventDefault();
            btn.click();
        }
    });
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
    wireSpellerDelegation();
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
        // Re-apply deferred-field styling — innerHTML replacement above wipes
        // any data-deferred attrs / badge visibility. Without this, expanding
        // the co-applicant cluster on a quote with deferred co-app fields
        // would lose the yellow border + badge until the next defer event.
        if (window.IntakeV2._defer) window.IntakeV2._defer.render();
    });

    this._layout = { renderTopbarStatus, renderJumpBadges, renderTalkTrack, renderLastEntries, setMode, toggleRails };

    // Initial bindability paint
    if (window.IntakeV2Bindability) {
        this.bindability = window.IntakeV2Bindability.computeBindability({ data: this.data });
        renderTopbarStatus();
    }
});

})();
