// intake-v2-keyboard.js — Keyboard-first interactions for the v2 workspace.
//
// Shortcuts (only active when focus is inside #intakeV2Tool):
//   N           Quick-add (context-aware): operator if focus is in #iv2-household,
//                                          auto if in #iv2-properties (default),
//                                          home/auto/boat/rv based on focused card.
//   J / K       Next / previous section
//   ? (Shift+/) Show shortcut help overlay
//   Alt+L       Defer the focused field (adds to follow-up list)
//   Alt+1..6    Jump to section 1..6
//   ⌘K          Falls through to the existing CommandPalette
//   Esc         Close help overlay, mini-form popovers
//   Enter       In a text input: move to next iv2 field (unless textarea)

'use strict';

(function () {

const SECTION_IDS = ['iv2-quick','iv2-household','iv2-properties','iv2-coverage','iv2-history','iv2-review'];

function isInsideV2(el) {
    return !!(el && el.closest && el.closest('#intakeV2Tool'));
}
function isTypingInForm(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function focusedSectionId() {
    const sec = document.activeElement && document.activeElement.closest('section.iv2-section, details.iv2-section');
    if (sec && sec.id) return sec.id;
    return null;
}

function focusedCollection() {
    const card = document.activeElement && document.activeElement.closest('[data-card-of]');
    return card ? card.getAttribute('data-card-of') : null;
}

function jumpSection(idx) {
    const id = SECTION_IDS[idx];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'DETAILS' && !el.open) el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('#iv2JumpList button.is-current').forEach(b => b.classList.remove('is-current'));
    const btn = document.querySelector(`#iv2JumpList button[data-jump="${id}"]`);
    if (btn) btn.classList.add('is-current');
    // Focus the first input within the section for keyboard continuation
    setTimeout(() => {
        const first = el.querySelector('input, select, textarea, button');
        if (first) first.focus();
    }, 250);
}

function relJump(delta) {
    const cur = focusedSectionId();
    const idx = SECTION_IDS.indexOf(cur);
    const next = Math.max(0, Math.min(SECTION_IDS.length - 1, (idx < 0 ? 0 : idx) + delta));
    jumpSection(next);
}

function contextAdd() {
    const sec = focusedSectionId();
    const focusedColl = focusedCollection();
    let collKey = 'operators';
    if (focusedColl) collKey = focusedColl;
    else if (sec === 'iv2-properties') collKey = 'autos'; // most common
    else if (sec === 'iv2-household')  collKey = 'operators';
    else if (sec === 'iv2-coverage' || sec === 'iv2-history' || sec === 'iv2-review') collKey = 'autos';
    const item = window.IntakeV2.addItem(collKey, {});
    setTimeout(() => {
        const first = document.querySelector(`[data-card-of="${collKey}"][data-item-id="${item.id}"] input, [data-card-of="${collKey}"][data-item-id="${item.id}"] select`);
        if (first) first.focus();
    }, 50);
}

function deferFocused() {
    const el = document.activeElement;
    if (!el) return;
    if (!window.IntakeV2._defer) return;
    let path = null;
    if (el.id && window.FieldMapV2) path = window.FieldMapV2.pathForElement(el);
    if (!path) {
        const wrap = el.closest('[data-field-wrap]');
        if (wrap) path = wrap.getAttribute('data-field-wrap');
    }
    if (path) window.IntakeV2._defer.toggle(path);
}

function showHelp() {
    let overlay = document.getElementById('iv2HelpOverlay');
    if (overlay) { overlay.remove(); return; }
    overlay = document.createElement('div');
    overlay.id = 'iv2HelpOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:200; display:flex; align-items:center; justify-content:center;';
    overlay.innerHTML = `
        <div style="background:var(--bg-card); color:var(--text); border:1px solid var(--border); border-radius:14px; padding:24px; min-width:380px; max-width:520px; box-shadow:0 10px 30px rgba(0,0,0,0.3);">
            <h3 style="margin-top:0">Intake v2 — Keyboard Shortcuts</h3>
            <table style="width:100%; font-size:13px; border-collapse:collapse;">
                <tr><td style="padding:4px 8px;"><kbd>N</kbd></td><td>Add (context-aware: operator / auto / boat / RV)</td></tr>
                <tr><td style="padding:4px 8px;"><kbd>J</kbd> / <kbd>K</kbd></td><td>Next / previous section</td></tr>
                <tr><td style="padding:4px 8px;"><kbd>Alt+L</kbd></td><td>Defer focused field — adds to follow-up list, ignored by bindability</td></tr>
                <tr><td style="padding:4px 8px;"><kbd>Alt+1</kbd>–<kbd>6</kbd></td><td>Jump to section (Quick / Household / Properties / Coverage / History / Review)</td></tr>
                <tr><td style="padding:4px 8px;"><kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd></td><td>Open command palette</td></tr>
                <tr><td style="padding:4px 8px;"><kbd>?</kbd></td><td>Show / hide this help</td></tr>
                <tr><td style="padding:4px 8px;"><kbd>Esc</kbd></td><td>Close popovers / mini-forms / this help</td></tr>
            </table>
            <p style="font-size:12px; color:var(--text-secondary); margin-top:12px;">Quick mode hides non-bindable fields. Tab through quick mode to capture the minimum for a bindable quote, switch to Full for post-call cleanup.</p>
            <div style="text-align:right; margin-top:12px;"><button type="button" class="iv2-add-btn" id="iv2HelpClose">Got it</button></div>
        </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#iv2HelpClose').addEventListener('click', close);
}

function onKey(e) {
    // Always close help on Escape
    if (e.key === 'Escape') {
        const o = document.getElementById('iv2HelpOverlay');
        if (o) { o.remove(); e.preventDefault(); return; }
        const mini = document.querySelector('.iv2-mini-form.is-open');
        if (mini) { mini.classList.remove('is-open'); mini.remove(); e.preventDefault(); return; }
    }

    // All other shortcuts require focus inside v2 OR an active v2 tool
    const v2Visible = document.getElementById('intakeV2Tool') && document.getElementById('intakeV2Tool').classList.contains('active');
    if (!isInsideV2(e.target) && !v2Visible) return;

    // Alt+L always works (even inside an input)
    if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        deferFocused();
        return;
    }
    // Alt+1..6 jumps section
    if (e.altKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        jumpSection(Number(e.key) - 1);
        return;
    }

    // The rest are letter/punct shortcuts — skip if user is typing in a form
    if (isTypingInForm(e.target)) return;

    if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); showHelp(); return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); contextAdd(); return; }
    if (e.key === 'j' || e.key === 'J') { e.preventDefault(); relJump(+1); return; }
    if (e.key === 'k' || e.key === 'K') { e.preventDefault(); relJump(-1); return; }
}

window.IntakeV2.onBoot(function () {
    document.addEventListener('keydown', onKey);
    this._keyboard = { jumpSection, contextAdd, deferFocused, showHelp };
});

})();
