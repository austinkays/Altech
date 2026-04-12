/**
 * Altech EZLynx V2 — Shadow-DOM floating toolbar
 *
 * Three display states per plan §6.3 of the module breakdown:
 *   - Idle   : "Fill this page" button
 *   - Running: progress indicator
 *   - Report : summary + per-atom drill-down
 *
 * Admin-only: the 🔍 Recon button is shown only when isAdmin is set in
 * chrome.storage.local. Clicking it toggles the inline Recon panel with
 * the 6 feature buttons.
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
    width: 300px;
    max-height: 80vh;
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
.hdr-left { display: flex; align-items: center; gap: 6px; }
.brand { font-weight: 600; }
.v2tag {
    background: #0a84ff;
    color: #fff;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    margin-left: 4px;
}
.recon-btn {
    background: none; border: 1px solid #3a3a3c; border-radius: 6px;
    color: #f5f5f7; font-size: 14px; cursor: pointer;
    padding: 2px 6px; line-height: 1.4;
    display: none; /* shown only for admin */
}
.recon-btn:hover { background: #2c2c2e; }
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
.av2-counts { display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap; }
.av2-pill { padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,0.07); font-size: 11px; }
.av2-done { color: #30d158; }
.av2-skip { color: #ff9f0a; }
.av2-fail { color: #ff453a; }
.av2-blk  { color: #bf5af2; }
.av2-dur { color: #9a9aa1; font-size: 10px; margin-top: 6px; }

/* ── LexisNexis banner (§7.3) ───────────────────────────── */
.av2-lexis-banner {
    margin: 6px 0 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(255,159,10,0.18) 0%, rgba(255,159,10,0.08) 100%);
    border: 1px solid rgba(255,159,10,0.45);
}
.av2-lexis-head { display: flex; align-items: center; gap: 6px; }
.av2-lexis-icon { font-size: 13px; }
.av2-lexis-title { font-weight: 600; color: #ffb84d; font-size: 12px; }
.av2-lexis-body {
    margin-top: 4px; font-size: 11px; color: #f5f5f7; line-height: 1.35;
    word-break: break-word;
}
.av2-lexis-hint { margin-top: 4px; font-size: 10px; color: #9a9aa1; font-style: italic; }

/* ── Grouped per-atom drill-down ────────────────────────── */
.av2-groups { margin-top: 6px; max-height: 280px; overflow: auto; }
.av2-group {
    border: 1px solid #3a3a3c;
    border-radius: 6px;
    background: #242426;
    margin-bottom: 6px;
    overflow: hidden;
}
.av2-group[open] { background: #1e1e20; }
.av2-group-summary {
    cursor: pointer;
    list-style: none;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
}
.av2-group-summary::-webkit-details-marker { display: none; }
.av2-group-summary::before {
    content: '▸';
    display: inline-block;
    font-size: 9px;
    color: #9a9aa1;
    margin-right: 4px;
    transition: transform 120ms ease;
}
.av2-group[open] .av2-group-summary::before { transform: rotate(90deg); }
.av2-group-title { font-weight: 600; color: #f5f5f7; flex: 1; }
.av2-group-counts { display: flex; gap: 4px; }
.av2-mini {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 8px;
    background: rgba(255,255,255,0.06);
}

.av2-atom-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border-top: 1px solid #3a3a3c;
}
.av2-atom {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 11px;
}
.av2-atom:last-child { border-bottom: none; }
.av2-atom.av2-failed  { background: rgba(255,69,58,0.08);  border-left: 2px solid #ff453a; }
.av2-atom.av2-blocked { background: rgba(191,90,242,0.06); border-left: 2px solid #bf5af2; }
.av2-atom.av2-skipped { background: rgba(255,159,10,0.06); border-left: 2px solid #ff9f0a; }
.av2-atom.av2-done    { background: rgba(48,209,88,0.04);  border-left: 2px solid rgba(48,209,88,0.6); }
.av2-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px; height: 18px;
    border-radius: 4px;
    font-size: 11px;
    flex-shrink: 0;
}
.av2-state-done { background: rgba(48,209,88,0.15); }
.av2-state-skip { background: rgba(255,159,10,0.15); }
.av2-state-fail { background: rgba(255,69,58,0.18); }
.av2-state-blk  { background: rgba(191,90,242,0.15); }
.av2-atom-body { flex: 1; min-width: 0; }
.av2-atom-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.av2-atom-label { font-weight: 600; color: #f5f5f7; }
.av2-atom-key { color: #6a6a70; font-size: 10px; font-family: ui-monospace, Menlo, monospace; }
.av2-atom-meta { color: #9a9aa1; font-size: 10px; margin-top: 2px; }
.av2-atom-extra { color: #9a9aa1; font-size: 10px; margin-top: 2px; font-style: italic; word-break: break-word; }
.progress { font-size: 11px; color: #9a9aa1; margin-top: 6px; }
/* Recon panel */
.recon-panel { display: none; margin-top: 10px; border-top: 1px solid #3a3a3c; padding-top: 10px; }
.recon-panel.open { display: block; }
.recon-label { font-size: 10px; color: #9a9aa1; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.recon-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 4px; margin-bottom: 8px;
}
.rbtn {
    padding: 6px 8px; background: #2c2c2e; border: 1px solid #3a3a3c;
    border-radius: 6px; color: #f5f5f7; font-size: 11px;
    cursor: pointer; text-align: left; line-height: 1.3;
}
.rbtn:hover { background: #3a3a3c; }
.rbtn:disabled { opacity: 0.5; cursor: not-allowed; }
.recon-status { font-size: 11px; color: #9a9aa1; margin-top: 4px; min-height: 16px; }
.recon-output {
    margin-top: 8px; background: #111; border: 1px solid #3a3a3c;
    border-radius: 6px; padding: 8px; font-size: 10px; color: #30d158;
    font-family: monospace; max-height: 200px; overflow: auto;
    white-space: pre-wrap; word-break: break-all; display: none;
}
`;

    const FEATURES = [
        { key: 'page-inventory',  label: '📋 Page Inventory' },
        { key: 'registry-audit',  label: '🔍 Registry Audit' },
        { key: 'dry-run',         label: '🧪 Dry Run' },
        { key: 'issue-capture',   label: '📸 Issue Capture' },
        { key: 'cascade-test',    label: '⛓ Cascade Test' },
        { key: 'diff-registry',   label: '↔ Diff Registry' },
    ];

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

        const reconButtons = FEATURES.map((f) =>
            `<button class="rbtn" data-feature="${f.key}">${f.label}</button>`
        ).join('');

        const root = document.createElement('div');
        root.className = 'root';
        root.innerHTML = `
            <div class="hdr">
                <span class="hdr-left">
                    <span class="brand">Altech <span class="v2tag">V2</span></span>
                </span>
                <span style="display:flex;align-items:center;gap:6px;">
                    <span class="route" id="route">—</span>
                    <button class="recon-btn" id="reconBtn" title="Recon Tools (admin)">🔍</button>
                </span>
            </div>
            <div class="body">
                <button class="btn" id="fillBtn">Fill this page</button>
                <div class="progress" id="progress"></div>
                <div id="reportHost"></div>
                <div class="recon-panel" id="reconPanel">
                    <div class="recon-label">Recon Tools</div>
                    <div class="recon-grid">${reconButtons}</div>
                    <div class="recon-status" id="reconStatus"></div>
                    <pre class="recon-output" id="reconOutput"></pre>
                </div>
            </div>
        `;
        shadow.appendChild(root);

        const $ = (id) => shadow.getElementById(id);

        // Admin gate — show recon button only if isAdmin
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['isAdmin'], (data) => {
                    if (data && data.isAdmin) {
                        $('reconBtn').style.display = 'block';
                    }
                });
            }
        } catch (_) { /* non-critical */ }

        // Recon panel toggle
        $('reconBtn').addEventListener('click', () => {
            const panel = $('reconPanel');
            const isOpen = panel.classList.contains('open');
            panel.classList.toggle('open', !isOpen);
        });

        // Recon feature buttons
        shadow.querySelectorAll('.rbtn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const feature = btn.dataset.feature;
                const status = $('reconStatus');
                const output = $('reconOutput');
                shadow.querySelectorAll('.rbtn').forEach((b) => { b.disabled = true; });
                status.textContent = `Running ${feature}…`;
                output.style.display = 'none';
                try {
                    if (typeof chrome !== 'undefined' && chrome.runtime) {
                        const resp = await new Promise((res) => {
                            chrome.runtime.sendMessage(
                                { type: 'ALTECH_V2_RECON_REQUEST', feature },
                                (r) => res(r)
                            );
                        });
                        if (resp && resp.ok) {
                            status.textContent = `✅ ${feature} complete — copied to clipboard`;
                            // Show a brief summary in the output box if available
                            if (resp.summary) {
                                output.textContent = JSON.stringify(resp.summary, null, 2);
                                output.style.display = 'block';
                            }
                        } else {
                            status.textContent = `❌ ${feature} failed: ${resp && resp.error || 'unknown'}`;
                        }
                    }
                } catch (e) {
                    status.textContent = `❌ Error: ${e.message}`;
                } finally {
                    shadow.querySelectorAll('.rbtn').forEach((b) => { b.disabled = false; });
                }
            });
        });

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
                const reportHost = $('reportHost');
                reportHost.innerHTML = '';
                const renderFn = (typeof module !== 'undefined' && module.exports)
                    ? require('./fill-report-panel').renderReport
                    : (global.AltechV2 && global.AltechV2.ui && global.AltechV2.ui.renderReport);
                if (renderFn) reportHost.appendChild(renderFn(report));
            },
            onFillClick(handler) { $('fillBtn').addEventListener('click', handler); },
            toggleReconPanel() {
                const panel = $('reconPanel');
                panel.classList.toggle('open');
                // Ensure recon btn is visible when invoked by keyboard shortcut
                $('reconBtn').style.display = 'block';
            },
            unmount() { try { host.remove(); } catch (_) {} },
        };
        // ── Drag support ──────────────────────────────────────────
        const hdr = shadow.querySelector('.hdr');
        let dragging = false, dx = 0, dy = 0;
        hdr.addEventListener('mousedown', (e) => {
            if (e.target.closest('.recon-btn')) return; // don't drag on recon btn click
            dragging = true;
            const rect = host.getBoundingClientRect();
            dx = e.clientX - rect.left;
            dy = e.clientY - rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            host.style.left = (e.clientX - dx) + 'px';
            host.style.top = (e.clientY - dy) + 'px';
            host.style.right = 'auto';
            host.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => { dragging = false; });

        if (typeof opts.onMounted === 'function') opts.onMounted(ui);
        return ui;
    }

    const api = { mount };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.ui.toolbar = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
