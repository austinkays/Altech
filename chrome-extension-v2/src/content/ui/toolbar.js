/**
 * Altech EZLynx V2 — Shadow-DOM floating toolbar
 *
 * Three display states per plan §6.3 of the module breakdown:
 *   - Idle   : "Fill this page" button
 *   - Running: progress indicator
 *   - Report : summary + per-atom drill-down
 *
 * Built in shadow DOM to isolate styles from EZLynx's Material theme.
 */
(function (global) {
    'use strict';

    const HOST_ID = 'altech-v2-toolbar-host';

    const CSS = `
:host { all: initial; }
.root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    color: #f5f5f7;
    background: #1c1c1e;
    border: 1px solid #3a3a3c;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    width: 280px;
    max-height: 70vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid #3a3a3c;
    cursor: move;
}
.brand { font-weight: 600; }
.v2tag {
    background: #0a84ff;
    color: #fff;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    margin-left: 4px;
}
.body { padding: 10px 12px; overflow: auto; }
.route { color: #9a9aa1; font-size: 11px; margin-bottom: 8px; }
.btn {
    display: block; width: 100%;
    padding: 9px 12px;
    background: #0a84ff; color: #fff; border: none;
    border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer;
}
.btn:disabled { background: #3a3a3c; color: #9a9aa1; cursor: not-allowed; }
.av2-route { display: flex; gap: 6px; margin-bottom: 6px; font-size: 11px; color: #9a9aa1; }
.av2-note { padding: 6px 8px; background: #2c2c2e; border-radius: 6px; font-size: 11px; color: #ff9f0a; margin: 6px 0; }
.av2-empty { color: #9a9aa1; font-size: 11px; }
.av2-counts { display: flex; gap: 6px; margin: 8px 0; }
.av2-pill { padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,0.07); font-size: 11px; }
.av2-done { color: #30d158; }
.av2-skip { color: #ff9f0a; }
.av2-fail { color: #ff453a; }
.av2-blk  { color: #bf5af2; }
.av2-issues { list-style: none; padding: 0; margin: 6px 0 0; font-size: 11px; max-height: 180px; overflow: auto; }
.av2-issue { padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.av2-dur { color: #9a9aa1; font-size: 10px; margin-top: 6px; }
.progress { font-size: 11px; color: #9a9aa1; margin-top: 6px; }
`;

    function mount(options) {
        const opts = options || {};
        let host = document.getElementById(HOST_ID);
        if (host) host.remove();

        host = document.createElement('div');
        host.id = HOST_ID;
        document.body.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = CSS;
        shadow.appendChild(style);

        const root = document.createElement('div');
        root.className = 'root';
        root.innerHTML = `
            <div class="hdr">
                <span class="brand">Altech <span class="v2tag">V2</span></span>
                <span class="route" id="route">—</span>
            </div>
            <div class="body">
                <button class="btn" id="fillBtn">Fill this page</button>
                <div class="progress" id="progress"></div>
                <div id="reportHost"></div>
            </div>
        `;
        shadow.appendChild(root);

        const $ = (id) => shadow.getElementById(id);
        const ui = {
            setRoute(routeKey) { $('route').textContent = routeKey || '—'; },
            setState(state) {
                const btn = $('fillBtn');
                const prog = $('progress');
                if (state === 'running') {
                    btn.disabled = true;
                    btn.textContent = 'Running…';
                    prog.textContent = '';
                } else {
                    btn.disabled = false;
                    btn.textContent = 'Fill this page';
                }
            },
            setProgress(i, total, atomKey) {
                $('progress').textContent = `Filling ${i} / ${total} — ${atomKey || ''}`;
            },
            showReport(report) {
                const host = $('reportHost');
                host.innerHTML = '';
                const renderFn = (typeof module !== 'undefined' && module.exports)
                    ? require('./fill-report-panel').renderReport
                    : (global.AltechV2 && global.AltechV2.ui && global.AltechV2.ui.renderReport);
                if (renderFn) host.appendChild(renderFn(report));
            },
            onFillClick(handler) { $('fillBtn').addEventListener('click', handler); },
            unmount() { try { host.remove(); } catch (_) {} },
        };
        if (typeof opts.onMounted === 'function') opts.onMounted(ui);
        return ui;
    }

    const api = { mount };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.ui.toolbar = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
