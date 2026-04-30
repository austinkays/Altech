/**
 * Altech EZLynx Filler v3 — content script
 *
 * Runs in-page on app.ezlynx.com. Reads client data from chrome.storage.local
 * (populated by altech-bridge.js when the producer clicks "Send to Extension"
 * in the Altech web app). Fills Angular Material form fields by talking to
 * the page's own JS context — synthetic clicks bubble through Material's
 * zone-aware listeners properly, sidestepping the entire mdc-notched-outline
 * z-order trap that the Playwright filler fought for weeks.
 *
 * Strategy (V1's, validated across multiple Altech rounds):
 *   1. dismiss any stuck CDK overlay
 *   2. click the mat-select trigger (single click — no force, no chevron)
 *   3. wait DROPDOWN_WAIT (1200ms) for options to render
 *   4. find best match in overlay options (exact → fuzzy)
 *   5. click the matching option element
 *   6. dismiss CDK overlay
 *
 * The 5-strategy click ladder, force=True, focus race, backdrop-click
 * cleanup, bail-fast — all the complexity from the Python filler isn't
 * needed because we're not driving Angular from outside, we're inside it.
 */
(function () {
    'use strict';

    const VERSION = '3.0.0';
    console.log(`[Altech v3] Loaded v${VERSION} on ${location.href}`);

    // ── Timing constants (V1's proven values) ────────────────────────
    const DROPDOWN_WAIT = 1200;   // ms after click before reading options
    const FILL_DELAY    = 250;    // ms between successful fills
    const TEXT_DELAY    = 100;    // ms between text fills
    const DISMISS_WAIT  = 200;    // ms after Escape to let CDK clean up

    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    function isVisible(el) {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    }

    // ── CDK overlay cleanup (V1's pattern) ──────────────────────────
    // Always dismiss BEFORE opening a new dropdown — prevents zombie state.
    async function dismissOverlay() {
        const cdkHost = document.querySelector('.cdk-overlay-container');
        if (cdkHost) {
            cdkHost.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape', bubbles: true, cancelable: true
            }));
        }
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', bubbles: true
        }));
        await wait(DISMISS_WAIT);
    }

    // ── Native value-setter (V1's setInputValue) ─────────────────────
    // Bypasses Angular's reactive form setters by writing through the
    // HTMLInputElement.prototype.value descriptor, then firing input/
    // change events so Angular's listeners pick up the change.
    function setInputValue(el, value) {
        el.focus();
        el.dispatchEvent(new Event('focus', { bubbles: true }));

        const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        if (nativeSetter) {
            nativeSetter.call(el, '');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            nativeSetter.call(el, value);
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
    }

    // ── Bigram similarity for fuzzy option matching ─────────────────
    function similarity(a, b) {
        a = (a || '').toLowerCase();
        b = (b || '').toLowerCase();
        if (a === b) return 1.0;
        if (a.length < 2 || b.length < 2) return 0;
        const bg = s => {
            const m = new Map();
            for (let i = 0; i < s.length - 1; i++) {
                const k = s.slice(i, i + 2);
                m.set(k, (m.get(k) || 0) + 1);
            }
            return m;
        };
        const aB = bg(a), bB = bg(b);
        let inter = 0;
        for (const [k, v] of aB) inter += Math.min(v, bB.get(k) || 0);
        const total = a.length - 1 + b.length - 1;
        return total > 0 ? (2 * inter) / total : 0;
    }
    function bestMatch(target, candidates, cutoff = 0.4) {
        let best = null, bestScore = 0;
        for (const c of candidates) {
            const s = similarity(target, c);
            if (s > bestScore) { bestScore = s; best = c; }
        }
        const tl = (target || '').toLowerCase();
        for (const c of candidates) {
            const cl = c.toLowerCase();
            if (cl.includes(tl) || tl.includes(cl)) {
                const s = Math.max(similarity(target, c), 0.6);
                if (s > bestScore) { bestScore = s; best = c; }
            }
        }
        return bestScore >= cutoff ? { text: best, score: bestScore } : null;
    }

    // ── Find a dropdown by ID or label-walk ──────────────────────────
    function findDropdownByLabel(labelPatterns) {
        if (!labelPatterns || !labelPatterns.length) return null;
        const labels = document.querySelectorAll(
            'label, legend, mat-label, .mat-form-field-label, [class*="label"]'
        );
        for (const lbl of labels) {
            const text = (lbl.textContent || '').replace(/[*:]/g, '').trim().toLowerCase();
            if (!text || text.length > 60) continue;
            for (const pat of labelPatterns) {
                const p = pat.toLowerCase();
                if (text === p || text.includes(p)) {
                    // Found a label — find sibling/contained mat-select
                    const container = lbl.closest('mat-form-field, .mat-form-field, fieldset, [class*="form-field"]') || lbl.parentElement;
                    if (container) {
                        const dd = container.querySelector('mat-select, [role="listbox"], [role="combobox"]');
                        if (dd && isVisible(dd)) return dd;
                    }
                }
            }
        }
        return null;
    }

    // ── Fill a single dropdown (V1's openAndPick flow) ───────────────
    async function fillDropdown(fieldKey, value, prioritySelector, labelPatterns) {
        if (!value || !String(value).trim()) return { ok: false, reason: 'empty-value' };
        const target = String(value).trim();
        const expanded = window.EZLYNX_MAPS.expand(target);

        // 1. Resolve dropdown element
        let ddEl = null;
        let via = '';
        if (prioritySelector) {
            ddEl = document.querySelector(prioritySelector);
            if (ddEl && isVisible(ddEl)) via = 'priority-id';
            else ddEl = null;
        }
        if (!ddEl && labelPatterns) {
            ddEl = findDropdownByLabel(labelPatterns);
            if (ddEl) via = 'label-walk';
        }
        if (!ddEl) return { ok: false, reason: 'element-not-found' };

        // 2. Dismiss any stuck overlay
        await dismissOverlay();

        // 3. Click the trigger — single click, no force
        try { ddEl.click(); }
        catch (e) { return { ok: false, reason: `click-failed: ${e.message}` }; }
        await wait(DROPDOWN_WAIT);

        // 4. Find options across multiple selector patterns
        const overlaySels = [
            '.cdk-overlay-container mat-option',
            '.cdk-overlay-container [role="option"]',
            '[role="listbox"] [role="option"]',
            '.mat-select-panel mat-option',
            '.cdk-overlay-pane mat-option',
            '[class*="overlay"] [role="option"]',
        ];
        let optionEls = [];
        for (const osel of overlaySels) {
            const els = document.querySelectorAll(osel);
            if (els.length > 0) { optionEls = Array.from(els); break; }
        }
        if (!optionEls.length) {
            await dismissOverlay();
            return { ok: false, reason: 'no-options-in-overlay', via };
        }

        const optionTexts = optionEls
            .map(el => (el.textContent || '').trim())
            .filter(t => t && !['', 'select', 'select one', '--select--'].includes(t.toLowerCase()));

        // 5. Best match (exact then fuzzy)
        let bestOpt = null;
        for (const attempt of [target, expanded]) {
            for (const ot of optionTexts) {
                if (ot.toLowerCase() === attempt.toLowerCase()) { bestOpt = ot; break; }
            }
            if (bestOpt) break;
        }
        if (!bestOpt) {
            const m = bestMatch(expanded, optionTexts) || bestMatch(target, optionTexts);
            if (m) bestOpt = m.text;
        }

        // 6. Click the matching option
        if (bestOpt) {
            for (const el of optionEls) {
                if ((el.textContent || '').trim() === bestOpt) {
                    el.click();
                    await wait(FILL_DELAY);
                    await dismissOverlay();
                    return { ok: true, matched: bestOpt, via, options: optionTexts.length };
                }
            }
        }
        await dismissOverlay();
        return {
            ok: false, reason: 'no-match', via,
            options: optionTexts.slice(0, 8),
        };
    }

    // ── Fill a single text input ─────────────────────────────────────
    function fillText(fieldKey, value, selectors) {
        if (!value || !String(value).trim()) return { ok: false, reason: 'empty-value' };
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (el && isVisible(el)) {
                    setInputValue(el, String(value).trim());
                    return { ok: true };
                }
            } catch (_) { continue; }
        }
        return { ok: false, reason: 'element-not-found' };
    }

    // ── Main fill orchestrator ───────────────────────────────────────
    async function runFill(clientData, log) {
        const url = location.href;
        const subpage = window.EZLYNX_MAPS.detectSubpage(url);
        const ids = window.EZLYNX_MAPS.SUBPAGE_FIELD_IDS[subpage] || {};
        const textFields = window.EZLYNX_MAPS.SUBPAGE_TEXT_FIELDS[subpage] || {};

        log(`[v3] Subpage: ${subpage || 'unknown'} (${Object.keys(ids).length} dropdowns, ${Object.keys(textFields).length} text fields)`);

        let okCount = 0, failCount = 0;
        const failures = [];

        // ── Text fields first ────────────────────────────────────────
        for (const [key, selectors] of Object.entries(textFields)) {
            const value = clientData[key];
            if (!value) continue;
            const r = fillText(key, value, selectors);
            if (r.ok) {
                log(`  [v] ${key}: ${value}`);
                okCount++;
                await wait(TEXT_DELAY);
            } else {
                log(`  [x] ${key}: ${value} — ${r.reason}`);
                failCount++;
                failures.push({ field: key, value, reason: r.reason });
            }
        }

        // ── Dropdowns (allowlist scoped to subpage) ──────────────────
        for (const [key, prioritySelector] of Object.entries(ids)) {
            const value = clientData[key];
            if (!value) continue;
            const labelPatterns = window.EZLYNX_MAPS.LABEL_PATTERNS[key] || [key.replace(/([A-Z])/g, ' $1').trim().toLowerCase()];
            const r = await fillDropdown(key, value, prioritySelector, labelPatterns);
            if (r.ok) {
                log(`  [v] ${key}: ${value} → ${r.matched} (via ${r.via})`);
                okCount++;
            } else {
                log(`  [x] ${key}: ${value} — ${r.reason}${r.via ? ' (via ' + r.via + ')' : ''}`);
                failCount++;
                failures.push({ field: key, value, reason: r.reason, options: r.options });
            }
        }

        log(`\n[v3] Done. ${okCount} filled, ${failCount} failed.`);
        return { okCount, failCount, failures, subpage };
    }

    // ── Floating toolbar (in-page) ───────────────────────────────────
    let toolbar = null, logPanel = null, runBtn = null;
    function buildToolbar() {
        if (toolbar) return toolbar;
        toolbar = document.createElement('div');
        toolbar.id = '_altech_v3_toolbar';
        toolbar.style.cssText = `
            position:fixed; top:8px; left:50%; transform:translateX(-50%);
            z-index:2147483647;
            background:rgba(22,33,62,0.96); color:#fff;
            padding:8px 14px; border-radius:12px;
            box-shadow:0 4px 24px rgba(0,0,0,0.4);
            font-family:-apple-system,BlinkMacSystemFont,sans-serif; font-size:12px;
            display:flex; align-items:center; gap:10px;
            border:1px solid rgba(255,255,255,0.12);
            user-select:none;
        `.replace(/\s+/g, ' ');
        toolbar.innerHTML = `
            <span style="font-weight:700">Altech v3</span>
            <button id="_altech_v3_fill" style="background:#007AFF;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Fill this page</button>
            <button id="_altech_v3_log" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;">📋 Log</button>
            <button id="_altech_v3_close" style="background:#ff3b30;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;">×</button>
            <span id="_altech_v3_status" style="color:rgba(255,255,255,0.7);font-size:10px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
        `;
        document.body.appendChild(toolbar);

        logPanel = document.createElement('pre');
        logPanel.id = '_altech_v3_logpanel';
        logPanel.style.cssText = `
            position:fixed; top:60px; left:50%; transform:translateX(-50%);
            z-index:2147483646;
            background:rgba(0,0,0,0.92); color:#fff;
            padding:12px; border-radius:8px;
            font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11px;
            max-width:720px; max-height:60vh; min-width:480px;
            overflow:auto; white-space:pre-wrap; word-break:break-word;
            display:none; border:1px solid rgba(255,255,255,0.1);
        `.replace(/\s+/g, ' ');
        document.body.appendChild(logPanel);

        runBtn = document.getElementById('_altech_v3_fill');
        runBtn.addEventListener('click', onFillClick);
        document.getElementById('_altech_v3_log').addEventListener('click', () => {
            logPanel.style.display = logPanel.style.display === 'none' ? 'block' : 'none';
        });
        document.getElementById('_altech_v3_close').addEventListener('click', () => {
            toolbar.remove(); logPanel.remove();
            toolbar = null; logPanel = null;
        });
        return toolbar;
    }

    function setStatus(msg) {
        const el = document.getElementById('_altech_v3_status');
        if (el) el.textContent = msg;
    }
    function appendLog(line) {
        if (!logPanel) return;
        logPanel.textContent += (logPanel.textContent ? '\n' : '') + line;
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    async function onFillClick() {
        if (!runBtn) return;
        runBtn.disabled = true;
        runBtn.textContent = 'Filling…';
        setStatus('Loading client data…');

        let clientData;
        try {
            const stored = await chrome.storage.local.get('clientData');
            clientData = stored.clientData;
        } catch (e) {
            setStatus(`Error: ${e.message}`);
            runBtn.disabled = false; runBtn.textContent = 'Fill this page';
            return;
        }

        if (!clientData || typeof clientData !== 'object') {
            setStatus('No client data — open Altech, click "Send to Extension"');
            runBtn.disabled = false; runBtn.textContent = 'Fill this page';
            return;
        }

        if (logPanel) logPanel.textContent = '';
        appendLog(`[v3] Starting fill — client: ${clientData.FirstName || ''} ${clientData.LastName || ''}`);

        const result = await runFill(clientData, appendLog);
        setStatus(`Done — ${result.okCount} filled, ${result.failCount} failed.`);
        runBtn.disabled = false; runBtn.textContent = 'Fill again';
        if (result.failCount > 0) logPanel.style.display = 'block';
    }

    // ── Boot ─────────────────────────────────────────────────────────
    function boot() {
        if (document.body) {
            buildToolbar();
        } else {
            setTimeout(boot, 200);
        }
    }

    // Re-inject toolbar on SPA navigation (EZLynx is Angular SPA)
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (!document.getElementById('_altech_v3_toolbar')) buildToolbar();
        }
    }, 1500);

    boot();
})();
