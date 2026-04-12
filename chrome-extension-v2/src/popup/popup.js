/**
 * Altech EZLynx Filler V2 — Popup (Phase 4 rebuild)
 *
 * Rebuilt in Phase 4 to expose:
 *   1. Client card — applicant name + address + field count, sourced
 *      from chrome.storage.local.clientData (populated by the altech
 *      bridge via postMessage from the Altech web app).
 *   2. Current route card — URL pattern match against the active tab.
 *   3. Three action buttons:
 *        - "Fill this page" → posts ALTECH_V2_FILL_REQUEST to service worker
 *        - "Open Recon Tool" → opens shadow toolbar recon panel via
 *          ALTECH_V2_RECON_OPEN message (toolbar auto-expands the panel)
 *        - "Export JSON" → downloads the last fill report as a JSON file
 *   4. Last fill report summary + LexisNexis lock strip.
 *   5. Admin Recon Tools section — collapsible, visible when either
 *      `altech_admin_recon` OR legacy `isAdmin` is set in chrome.storage.
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const els = {
        clientName: $('clientName'),
        clientAddr: $('clientAddr'),
        clientMeta: $('clientMeta'),
        routeName: $('routeName'),
        routeMeta: $('routeMeta'),
        fillBtn: $('fillBtn'),
        reconToolBtn: $('reconToolBtn'),
        exportBtn: $('exportBtn'),
        fillHint: $('fillHint'),
        reportCard: $('reportCard'),
        reportCounts: $('reportCounts'),
        lexisStrip: $('lexisStrip'),
        reconSection: $('reconSection'),
        reconStatus: $('reconStatus'),
    };

    let state = {
        clientData: null,
        tabUrl: null,
        routeKey: null,
        lastReport: null,
    };

    // ── Detect the current EZLynx route key from the active tab URL ──
    function detectRoute(url) {
        if (!url || !/ezlynx\.com/.test(url)) return null;
        if (/\/details/.test(url)) return 'applicant-details';
        if (/\/drivers-compact/.test(url)) return 'drivers-compact';
        if (/\/vehicles-compact/.test(url)) return 'vehicles-compact';
        if (/\/incidents/.test(url)) return 'incidents';
        if (/\/rating\/home\/[^/]+\/policy-info/.test(url)) return 'home-policy-info';
        if (/\/rating\/home\/[^/]+\/dwelling-info/.test(url)) return 'home-dwelling-info';
        if (/\/rating\/home\/[^/]+\/coverage/.test(url)) return 'home-coverage';
        if (/\/rating\/auto\/[^/]+\/coverage/.test(url)) return 'auto-coverage';
        return 'unknown';
    }

    function buildAddress(cd) {
        if (!cd) return '';
        const parts = [cd.Address, cd.AddressUnit, cd.City, cd.State, cd.Zip].filter(
            (v) => v != null && String(v).trim().length > 0
        );
        return parts.join(' · ');
    }

    function renderClient() {
        const cd = state.clientData;
        if (!cd) {
            els.clientName.textContent = 'No client loaded';
            els.clientAddr.textContent = '';
            els.clientMeta.textContent = 'Open the Altech app and click “Send to Extension”';
            return;
        }
        const name = [cd.FirstName, cd.LastName].filter(Boolean).join(' ') || 'Unnamed client';
        const count = Object.values(cd).filter((v) => v != null && String(v).trim().length > 0).length;
        els.clientName.textContent = name;
        els.clientAddr.textContent = buildAddress(cd);
        els.clientMeta.textContent = count + ' fields loaded';
    }

    function renderRoute() {
        if (!state.tabUrl) {
            els.routeName.textContent = '—';
            els.routeMeta.textContent = 'Open an EZLynx page to detect the route';
            return;
        }
        if (!/ezlynx\.com/.test(state.tabUrl)) {
            els.routeName.textContent = 'Not on EZLynx';
            els.routeMeta.textContent = state.tabUrl.slice(0, 50);
            return;
        }
        els.routeName.textContent = state.routeKey || 'unknown';
        els.routeMeta.textContent = state.routeKey === 'unknown'
            ? 'Route not yet mapped'
            : 'Ready — click Fill';
    }

    function renderButton() {
        const onEzlynx = /ezlynx\.com/.test(state.tabUrl || '');
        const ready = !!(state.clientData && onEzlynx);
        els.fillBtn.disabled = !ready;
        els.reconToolBtn.disabled = !onEzlynx;
        els.exportBtn.disabled = !state.lastReport;
        els.fillHint.textContent = !state.clientData
            ? 'Waiting for client data…'
            : !onEzlynx
            ? 'Open an EZLynx tab to enable Fill'
            : 'Slow but accurate — one atom at a time';
    }

    function renderReport(report) {
        state.lastReport = report || null;
        if (!report) {
            els.reportCard.hidden = true;
            els.lexisStrip.hidden = true;
            els.exportBtn.disabled = true;
            return;
        }
        els.reportCard.hidden = false;
        els.exportBtn.disabled = false;
        const counts = report.counts || { DONE: 0, SKIPPED: 0, FAILED: 0, BLOCKED: 0 };
        els.reportCounts.innerHTML = `
            <span class="pill done">✅ ${counts.DONE}</span>
            <span class="pill skip">⏭ ${counts.SKIPPED}</span>
            <span class="pill fail">❌ ${counts.FAILED}</span>
            <span class="pill blk">🚫 ${counts.BLOCKED}</span>
        `;

        // LexisNexis strip (if any atoms were locked)
        const entries = report.entries || [];
        const atomIndex = report.atomIndex || {};
        const lexisLabels = entries
            .filter((e) => e.state === 'SKIPPED' && e.detail && e.detail.reason === 'lexis-nexis')
            .map((e) => (atomIndex[e.atom] && atomIndex[e.atom].label) || e.atom);
        if (lexisLabels.length > 0) {
            els.lexisStrip.innerHTML =
                `🔒 <strong>${lexisLabels.length} field${lexisLabels.length === 1 ? '' : 's'} locked by LexisNexis:</strong> ` +
                escapeHtml(lexisLabels.join(', '));
            els.lexisStrip.hidden = false;
        } else {
            els.lexisStrip.hidden = true;
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function load() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        state.tabUrl = tab && tab.url ? tab.url : null;
        state.routeKey = detectRoute(state.tabUrl);

        const stored = await chrome.storage.local.get([
            'clientData', 'lastFillReport', 'isAdmin', 'altech_admin_recon',
        ]);
        state.clientData = stored.clientData || null;

        renderClient();
        renderRoute();
        renderButton();
        renderReport(stored.lastFillReport);

        // Show admin Recon Tools when either flag is set.
        if ((stored.isAdmin || stored.altech_admin_recon) && els.reconSection) {
            els.reconSection.hidden = false;
        }
    }

    // ── Export: download last fill report as JSON ─────────────
    function exportReportJson() {
        if (!state.lastReport) return;
        const blob = new Blob([JSON.stringify(state.lastReport, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const a = document.createElement('a');
        a.href = url;
        a.download = `altech-fill-report-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Release the object URL shortly after the download starts.
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 1500);
    }

    // ── Recon feature buttons in the admin panel ──────────────
    document.querySelectorAll('.recon-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const feature = btn.dataset.feature;
            if (!feature) return;
            document.querySelectorAll('.recon-btn').forEach((b) => { b.disabled = true; });
            if (els.reconStatus) els.reconStatus.textContent = `Running ${feature}…`;
            try {
                const res = await chrome.runtime.sendMessage({
                    type: 'ALTECH_V2_RECON_REQUEST',
                    feature,
                });
                if (res && res.ok) {
                    if (els.reconStatus) els.reconStatus.textContent = `✅ ${feature} complete — copied to clipboard`;
                } else {
                    if (els.reconStatus) els.reconStatus.textContent = `❌ ${feature}: ${(res && res.error) || 'failed'}`;
                }
            } catch (e) {
                if (els.reconStatus) els.reconStatus.textContent = `❌ Error: ${e.message}`;
            } finally {
                document.querySelectorAll('.recon-btn').forEach((b) => { b.disabled = false; });
            }
        });
    });

    // ── "Open Recon Tool" secondary button → opens on-page panel ──
    els.reconToolBtn.addEventListener('click', async () => {
        if (els.reconToolBtn.disabled) return;
        try {
            await chrome.runtime.sendMessage({ type: 'ALTECH_V2_RECON_OPEN' });
        } catch (_) { /* ignore */ }
        window.close();
    });

    // ── Export JSON ─────────────────────────────────────────
    els.exportBtn.addEventListener('click', () => {
        if (els.exportBtn.disabled) return;
        exportReportJson();
    });

    // ── Fill this page ─────────────────────────────────────
    els.fillBtn.addEventListener('click', async () => {
        if (els.fillBtn.disabled) return;
        els.fillBtn.disabled = true;
        els.fillHint.textContent = 'Dispatching fill request…';
        try {
            const res = await chrome.runtime.sendMessage({
                type: 'ALTECH_V2_FILL_REQUEST',
                clientData: state.clientData,
            });
            if (res && res.ok) {
                els.fillHint.textContent = 'Orchestrator running — see toolbar on page';
                // Poll stored report once (service worker persists it via ALTECH_V2_REPORT)
                setTimeout(async () => {
                    const { lastFillReport } = await chrome.storage.local.get('lastFillReport');
                    renderReport(lastFillReport);
                    els.fillBtn.disabled = false;
                    els.fillHint.textContent = 'Slow but accurate — one atom at a time';
                }, 800);
            } else {
                els.fillHint.textContent = (res && res.error) || 'Fill request failed';
                els.fillBtn.disabled = false;
            }
        } catch (e) {
            els.fillHint.textContent = 'Error: ' + e.message;
            els.fillBtn.disabled = false;
        }
    });

    // ── Live updates from chrome.storage ──────────────────────
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.clientData) {
            state.clientData = changes.clientData.newValue || null;
            renderClient();
            renderButton();
        }
        if (changes.lastFillReport) {
            renderReport(changes.lastFillReport.newValue);
        }
        if (changes.isAdmin || changes.altech_admin_recon) {
            const isAdmin = (changes.isAdmin && changes.isAdmin.newValue);
            const reconFlag = (changes.altech_admin_recon && changes.altech_admin_recon.newValue);
            if ((isAdmin || reconFlag) && els.reconSection) {
                els.reconSection.hidden = false;
            }
        }
    });

    load();
})();
