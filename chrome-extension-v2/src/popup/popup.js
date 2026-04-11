/**
 * Altech EZLynx Filler V2 — Popup
 *
 * Shows the loaded client, the current EZLynx route (detected via
 * chrome.tabs.query), the last fill report, and exposes a "Fill this page"
 * button that dispatches ALTECH_V2_FILL_REQUEST to the background service
 * worker.
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const els = {
        clientName: $('clientName'),
        clientMeta: $('clientMeta'),
        routeName: $('routeName'),
        routeMeta: $('routeMeta'),
        fillBtn: $('fillBtn'),
        fillHint: $('fillHint'),
        reportCard: $('reportCard'),
        reportCounts: $('reportCounts'),
    };

    let state = {
        clientData: null,
        tabUrl: null,
        routeKey: null,
    };

    // ── Detect the current EZLynx route key from the active tab URL ──
    // Duplicates a subset of content/routes/router.js so the popup can read
    // the same routing without injecting a content script.
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

    function renderClient() {
        const cd = state.clientData;
        if (!cd) {
            els.clientName.textContent = 'No client loaded';
            els.clientMeta.textContent = 'Open the Altech app and click “Send to Extension”';
            return;
        }
        const name = [cd.FirstName, cd.LastName].filter(Boolean).join(' ') || 'Unnamed client';
        const count = Object.values(cd).filter((v) => v != null && String(v).trim().length > 0).length;
        els.clientName.textContent = name;
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
        const ok = state.clientData && /ezlynx\.com/.test(state.tabUrl || '');
        els.fillBtn.disabled = !ok;
        els.fillHint.textContent = !state.clientData
            ? 'Waiting for client data…'
            : !/ezlynx\.com/.test(state.tabUrl || '')
            ? 'Open an EZLynx tab to enable Fill'
            : 'Slow but accurate — one atom at a time';
    }

    function renderReport(report) {
        if (!report) {
            els.reportCard.hidden = true;
            return;
        }
        els.reportCard.hidden = false;
        const counts = report.counts || { DONE: 0, SKIPPED: 0, FAILED: 0, BLOCKED: 0 };
        els.reportCounts.innerHTML = `
            <span class="pill done">✅ ${counts.DONE}</span>
            <span class="pill skip">⏭ ${counts.SKIPPED}</span>
            <span class="pill fail">❌ ${counts.FAILED}</span>
            <span class="pill blk">🚫 ${counts.BLOCKED}</span>
        `;
    }

    async function load() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        state.tabUrl = tab?.url || null;
        state.routeKey = detectRoute(state.tabUrl);

        const stored = await chrome.storage.local.get(['clientData', 'lastFillReport']);
        state.clientData = stored.clientData || null;

        renderClient();
        renderRoute();
        renderButton();
        renderReport(stored.lastFillReport);
    }

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
                // Poll stored report once
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
    });

    load();
})();
