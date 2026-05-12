// intake-v2-defer.js — "Ask Later" follow-up system.
//
// Press Alt+L (or click the defer badge) on any field to mark it deferred.
// Deferred fields:
//   - Stay editable in the form
//   - Are ignored by the bindability engine (no longer "missing" a carrier)
//   - Show a yellow border and "deferred" badge
//   - Appear in the right-rail follow-up list with click-to-jump
//   - Surface in the PDF appendix so the client receives the same list
//
// Storage: window.IntakeV2.data.deferred = [pathString, ...]

'use strict';

(function () {

const esc = (s) => (window.Utils && window.Utils.escapeHTML) ? window.Utils.escapeHTML(String(s ?? '')) : String(s ?? '');

function labelForPath(path) {
    if (!path) return path;
    // Scalar?
    if (window.IntakeV2Fields) {
        for (const f of window.IntakeV2Fields.scalar) if (f.path === path) return f.label;
    }
    // Collection — path is `coll#id.field.sub`
    if (path.indexOf('#') !== -1) {
        const [coll, rest] = path.split('#');
        const dot = rest.indexOf('.');
        const itemId = rest.slice(0, dot);
        const fieldPath = rest.slice(dot + 1);
        const collDef = window.IntakeV2Fields && window.IntakeV2Fields.collections[coll];
        const fdef = collDef && collDef.fields.find(f => f.path === fieldPath);
        const item = (window.IntakeV2.data[coll] || []).find(x => x.id === itemId);
        const itemLabel = item && window.IntakeV2Bindability
            ? `${coll.slice(0, -1)} · ${(item.firstName || item.year || item.address || itemId)}`
            : coll;
        return `${fdef ? fdef.label : fieldPath}  (${itemLabel})`;
    }
    return path;
}

function isDeferred(path) {
    return Array.isArray(window.IntakeV2.data.deferred) && window.IntakeV2.data.deferred.includes(path);
}

function toggle(path) {
    if (!path) return;
    const list = window.IntakeV2.data.deferred = window.IntakeV2.data.deferred || [];
    const i = list.indexOf(path);
    if (i === -1) {
        list.push(path);
        if (window.App && window.App.toast) window.App.toast(`Deferred: ${labelForPath(path)}`, { type: 'info', duration: 2400 });
    } else {
        list.splice(i, 1);
        if (window.App && window.App.toast) window.App.toast(`Restored: ${labelForPath(path)}`, { type: 'info', duration: 2000 });
    }
    window.IntakeV2.save();
    render();
}

function jumpToPath(path) {
    if (!path) return;
    // Try scalar first
    if (path.indexOf('#') === -1) {
        const id = window.FieldMapV2 && window.FieldMapV2.idForPath(path);
        if (id) {
            const el = document.getElementById(id);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); return; }
        }
    } else {
        // collection field — the renderer marks each input with data-collection / data-item-id / data-field-path
        const [coll, rest] = path.split('#');
        const dot = rest.indexOf('.');
        const itemId = rest.slice(0, dot);
        const fieldPath = rest.slice(dot + 1);
        const el = document.querySelector(`[data-collection="${coll}"][data-item-id="${itemId}"][data-field-path="${fieldPath}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    }
}

function render() {
    const list = window.IntakeV2.data.deferred || [];

    // Field-level badges
    document.querySelectorAll('[data-field-wrap]').forEach(wrap => {
        const path = wrap.getAttribute('data-field-wrap');
        const def = list.includes(path);
        wrap.setAttribute('data-deferred', def ? 'true' : 'false');
        const badge = wrap.querySelector('.iv2-field-defer-badge');
        if (badge) badge.style.display = def ? 'inline-block' : 'none';
    });
    document.querySelectorAll('[data-collection][data-item-id][data-field-path]').forEach(el => {
        const path = `${el.getAttribute('data-collection')}#${el.getAttribute('data-item-id')}.${el.getAttribute('data-field-path')}`;
        const def = list.includes(path);
        const wrap = el.closest('.iv2-field');
        if (wrap) {
            wrap.setAttribute('data-deferred', def ? 'true' : 'false');
            const badge = wrap.querySelector('.iv2-field-defer-badge');
            if (badge) badge.style.display = def ? 'inline-block' : 'none';
        }
    });

    // Right-rail list
    const listEl = document.getElementById('iv2FollowupList');
    if (listEl) {
        if (!list.length) {
            listEl.innerHTML = `<li class="iv2-followup-empty">Nothing deferred yet. Press <kbd style="font-size:10px">Alt+L</kbd> on any field to add it here.</li>`;
        } else {
            listEl.innerHTML = list.map(p =>
                `<li data-followup-path="${esc(p)}" title="Jump to field"><span style="color:#C58800">●</span> ${esc(labelForPath(p))} <button type="button" class="iv2-icon-btn" data-followup-clear="${esc(p)}" style="margin-left:auto" title="Restore">×</button></li>`
            ).join('');
            listEl.querySelectorAll('li[data-followup-path]').forEach(li => {
                li.addEventListener('click', (e) => {
                    if (e.target.matches('[data-followup-clear]')) return;
                    jumpToPath(li.getAttribute('data-followup-path'));
                });
            });
            listEl.querySelectorAll('[data-followup-clear]').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(btn.getAttribute('data-followup-clear')); });
            });
        }
    }

    // Header counts
    if (window.IntakeV2._layout && typeof window.IntakeV2._layout.renderJumpBadges === 'function') {
        window.IntakeV2._layout.renderJumpBadges();
    }
}

window.IntakeV2.onBoot(function () {
    this._defer = { toggle, isDeferred, render, jumpToPath, labelForPath };
    render();
});

})();
