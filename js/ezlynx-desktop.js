// js/ezlynx-desktop.js — Desktop-only "Auto-fill EZLYNX" runner.
//
// Loaded on every page but only ACTIVE when window.__TAURI__ is defined.
// The button is also hidden by CSS when App.isDesktop is false (set in
// app-core.js), so this module is a no-op on web/Vercel deployments.
//
// Flow on click:
//   1. Build client JSON via App.exportClientJsonForFiller()
//   2. Open the progress modal
//   3. Subscribe to "ezlynx-progress" Tauri events
//   4. Invoke the run_ezlynx_filler Rust command (passes JSON, gets summary)
//   5. Stream stdout lines into the modal as they arrive
//   6. On completion: show success/error, save audit entry to STORAGE_KEYS.EZLYNX_FILLER_LAST_RUN
//
// Modal markup is created on demand and lives in <body> as a singleton.
'use strict';

window.EzlynxDesktop = (() => {
    'use strict';

    const MODAL_ID = 'ezlynxDesktopModal';
    let isRunning = false;

    function tauri() {
        // Tauri 2.x exposes core APIs at window.__TAURI__.core (invoke) and
        // window.__TAURI__.event (listen). withGlobalTauri:true in tauri.conf.json
        // ensures these are present without an import.
        const t = window.__TAURI__;
        if (!t || !t.core || !t.event) return null;
        return { invoke: t.core.invoke, listen: t.event.listen };
    }

    function isDesktop() {
        return !!(window.App && window.App.isDesktop) || !!(window.__TAURI__ || window.__TAURI_IPC__);
    }

    function ensureModal() {
        let m = document.getElementById(MODAL_ID);
        if (m) return m;
        m = document.createElement('div');
        m.id = MODAL_ID;
        m.className = 'ezlynx-desktop-modal hidden';
        m.innerHTML = `
            <div class="ezlynx-desktop-modal__backdrop"></div>
            <div class="ezlynx-desktop-modal__panel" role="dialog" aria-labelledby="ezlynxDesktopTitle" aria-modal="true">
                <header class="ezlynx-desktop-modal__header">
                    <h3 id="ezlynxDesktopTitle">Auto-fill EZLYNX</h3>
                    <span class="ezlynx-desktop-modal__status" id="ezlynxDesktopStatus">Starting…</span>
                </header>
                <pre class="ezlynx-desktop-modal__log" id="ezlynxDesktopLog"></pre>
                <footer class="ezlynx-desktop-modal__footer">
                    <span class="ezlynx-desktop-modal__hint" id="ezlynxDesktopHint"></span>
                    <button class="ezlynx-desktop-modal__copy" id="ezlynxDesktopCopy" title="Copy log to clipboard">📋 Copy log</button>
                    <button class="ezlynx-desktop-modal__close" id="ezlynxDesktopClose">Close</button>
                </footer>
            </div>
        `;
        document.body.appendChild(m);
        // Close is ALWAYS enabled. Closing the modal while a fill is in
        // progress just hides the UI — Python keeps running in the
        // background until it exits naturally (Chromium close, completion,
        // or Task Manager kill). This avoids the frozen-modal trap if
        // Python hangs or never emits.
        m.querySelector('#ezlynxDesktopClose').addEventListener('click', () => {
            m.classList.add('hidden');
        });
        // Copy log to clipboard. navigator.clipboard.writeText is the
        // modern API; fall back to the legacy execCommand path for any
        // edge case where it's blocked.
        m.querySelector('#ezlynxDesktopCopy').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const log = document.getElementById('ezlynxDesktopLog');
            const text = log ? log.textContent : '';
            if (!text) return;
            const original = btn.textContent;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                btn.textContent = '✓ Copied';
                btn.classList.add('is-copied');
                setTimeout(() => {
                    btn.textContent = original;
                    btn.classList.remove('is-copied');
                }, 1500);
            } catch (err) {
                btn.textContent = '✗ Failed';
                setTimeout(() => { btn.textContent = original; }, 1500);
            }
        });
        m.querySelector('.ezlynx-desktop-modal__backdrop').addEventListener('click', () => {
            // Backdrop click only when not running — protects against
            // accidental dismissal mid-fill.
            if (!isRunning) m.classList.add('hidden');
        });
        // Escape key dismisses regardless of state — the user explicitly
        // pressed it, that's intent enough.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !m.classList.contains('hidden')) {
                m.classList.add('hidden');
            }
        });
        return m;
    }

    function setStatus(text, kind) {
        const el = document.getElementById('ezlynxDesktopStatus');
        if (!el) return;
        el.textContent = text;
        el.dataset.kind = kind || '';
    }

    function appendLog(line) {
        const el = document.getElementById('ezlynxDesktopLog');
        if (!el) return;
        el.textContent += (el.textContent ? '\n' : '') + line;
        el.scrollTop = el.scrollHeight;
    }

    function setCloseLabel(text) {
        const btn = document.getElementById('ezlynxDesktopClose');
        if (btn) btn.textContent = text;
    }
    function setHint(text) {
        const el = document.getElementById('ezlynxDesktopHint');
        if (el) el.textContent = text || '';
    }

    function recordRun(outcome, summary) {
        try {
            const key = window.STORAGE_KEYS && window.STORAGE_KEYS.EZLYNX_FILLER_LAST_RUN;
            if (!key) return;
            localStorage.setItem(key, JSON.stringify({
                ts: new Date().toISOString(),
                outcome: outcome,           // 'success' | 'error' | 'cancelled'
                summary: (summary || '').slice(0, 500),
            }));
        } catch (_) { /* best-effort audit */ }
    }

    async function run() {
        if (isRunning) {
            (window.App && App.toast && App.toast('Filler is already running')) || alert('Filler is already running');
            return;
        }
        const t = tauri();
        if (!isDesktop() || !t) {
            const msg = 'Auto-fill EZLYNX is only available in the desktop app. Open Altech via the PolicyPilot app.';
            (window.App && App.toast && App.toast(msg)) || alert(msg);
            return;
        }
        if (!window.App || typeof App.exportClientJsonForFiller !== 'function') {
            alert('exportClientJsonForFiller is missing — App may not be fully loaded yet.');
            return;
        }

        const clientJson = JSON.stringify(App.exportClientJsonForFiller(), null, 2);

        const modal = ensureModal();
        modal.classList.remove('hidden');
        document.getElementById('ezlynxDesktopLog').textContent = '';
        setStatus('Starting Chromium…', 'running');
        setCloseLabel('Hide'); setHint('Python keeps running if you hide the modal.');
        isRunning = true;

        // Subscribe to progress events BEFORE invoking, so we don't miss the
        // first line. Tauri's listen returns an unlisten() function.
        let unlisten = null;
        try {
            unlisten = await t.listen('ezlynx-progress', (e) => {
                if (e && typeof e.payload === 'string') appendLog(e.payload);
            });
        } catch (err) {
            appendLog(`[!] Failed to subscribe to progress events: ${err}`);
        }

        try {
            const summary = await t.invoke('run_ezlynx_filler', { clientJson });
            setStatus('Done', 'success');
            appendLog('');
            appendLog(`✅ ${summary}`);
            recordRun('success', summary);
            // Auto-close after a few seconds on success — the Chromium tab
            // is the actual focus now, and the user shouldn't have to hunt
            // for the close button. Countdown is visible on the close
            // button; clicking it (or anywhere else dismissing) cancels.
            const modalEl = document.getElementById(MODAL_ID);
            const btn = document.getElementById('ezlynxDesktopClose');
            let secondsLeft = 4;
            const cancelTimer = () => {
                clearInterval(timer);
                if (btn) btn.textContent = 'Close';
            };
            const timer = setInterval(() => {
                secondsLeft -= 1;
                if (modalEl && modalEl.classList.contains('hidden')) {
                    cancelTimer();
                    return;
                }
                if (secondsLeft <= 0) {
                    cancelTimer();
                    if (modalEl) modalEl.classList.add('hidden');
                } else if (btn) {
                    btn.textContent = `Close (${secondsLeft})`;
                }
            }, 1000);
            // Hovering the panel cancels auto-close so a user reading the
            // log doesn't get yanked away. Click on Close still closes
            // immediately.
            const panelEl = modalEl ? modalEl.querySelector('.ezlynx-desktop-modal__panel') : null;
            if (panelEl) {
                panelEl.addEventListener('mouseenter', cancelTimer, { once: true });
            }
        } catch (err) {
            const text = (err && err.toString) ? err.toString() : String(err);
            setStatus('Failed', 'error');
            appendLog('');
            appendLog(`❌ ${text}`);
            recordRun('error', text);
        } finally {
            try { if (unlisten) unlisten(); } catch (_) {}
            isRunning = false;
            setCloseLabel('Close'); setHint('');
        }
    }

    // Button visibility is pure CSS: .ezlynx-auto-fill-btn { display: none }
    // and body.tauri-desktop .ezlynx-auto-fill-btn { display: flex }. No JS
    // hookup needed — the button reveals itself in the desktop app.

    return { run };
})();
