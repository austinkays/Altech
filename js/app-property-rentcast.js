// js/app-property-rentcast.js — Rentcast per-user usage counter + overage modal + audit log.
// Extracted from app-property.js during Phase 3 monolith decomposition (2026-04).
'use strict';

Object.assign(App, {
    _rentcastPeriodStart(periodDay) {
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), periodDay);
        if (now >= thisMonth) return thisMonth;
        return new Date(now.getFullYear(), now.getMonth() - 1, periodDay);
    },

    /** Computes the next billing period reset date for a given day-of-month. */
    _rentcastNextReset(periodDay) {
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), periodDay);
        if (now < thisMonth) return thisMonth;
        return new Date(now.getFullYear(), now.getMonth() + 1, periodDay);
    },

    // Phase D: Rentcast usage now lives in Supabase user_blobs under doc_key
    // 'rentcastUsage'. The blob is plain JSON (not encrypted) — it's
    // operational metering data, not PII, and we want it readable for
    // overage diagnostics. Shape: `{ count, periodDay, periodStart }`.

    async _readRentcastBlob() {
        if (typeof window.Sync === 'undefined' || typeof window.Sync.pullBlob !== 'function') return null;
        try {
            const blob = await window.Sync.pullBlob('rentcastUsage');
            if (!blob || !blob.ciphertext) return null;
            try { return JSON.parse(blob.ciphertext); } catch { return null; }
        } catch (e) {
            console.warn('[RentcastCounter] pullBlob failed:', e && e.message);
            return null;
        }
    },

    async _writeRentcastBlob(payload) {
        if (typeof window.Sync === 'undefined' || typeof window.Sync.pushBlob !== 'function') return false;
        try {
            const res = await window.Sync.pushBlob('rentcastUsage', JSON.stringify(payload));
            return !!(res && res.ok);
        } catch (e) {
            console.warn('[RentcastCounter] pushBlob failed:', e && e.message);
            return false;
        }
    },

    /**
     * Reads the Rentcast usage blob. Returns { count, periodDay, nextReset } —
     * count is auto-zeroed if a new period has started since the last write.
     */
    async _getRentcastCounter() {
        const fallback = { count: 0, periodDay: 1, nextReset: this._rentcastNextReset(1) };
        try {
            const uid = typeof Auth !== 'undefined' ? Auth.uid : null;
            if (!uid) return fallback;
            const d = await this._readRentcastBlob();
            if (!d) return fallback;
            const periodDay    = d.periodDay || 1;
            const periodStart  = d.periodStart || '';
            const nextReset    = this._rentcastNextReset(periodDay);
            const lastReset    = this._rentcastPeriodStart(periodDay);
            const lastResetStr = lastReset.toISOString().slice(0, 10);
            // If stored periodStart is older than the last computed reset → new cycle.
            if (periodStart < lastResetStr) {
                // Auto-reset: write the new period asynchronously (fire-and-forget).
                this._writeRentcastBlob({ count: 0, periodDay, periodStart: lastResetStr })
                    .catch(err => console.warn('[RentcastCounter] Auto-reset write failed:', err && err.message));
                return { count: 0, periodDay, nextReset };
            }
            return { count: d.count || 0, periodDay, nextReset };
        } catch (e) {
            console.warn('[RentcastCounter] Failed to read counter:', e.message);
            return fallback;
        }
    },

    /**
     * Increments the usage counter by 1. If a new billing period has started
     * since the last write, resets to 1 instead of incrementing.
     *
     * Phase D: previously used a Firestore atomic increment. Single-device
     * users see no behavioral change. Multi-device race is unlikely (a single
     * Rentcast call from each of two devices in the same millisecond) and
     * worst case is one undercount that the next read auto-reconciles via
     * the periodStart check.
     */
    async _incrementRentcastCounter() {
        try {
            const uid = typeof Auth !== 'undefined' ? Auth.uid : null;
            if (!uid) return;
            const d = (await this._readRentcastBlob()) || {};
            const periodDay    = d.periodDay || 1;
            const lastReset    = this._rentcastPeriodStart(periodDay);
            const lastResetStr = lastReset.toISOString().slice(0, 10);
            const isNewPeriod  = !d.periodStart || d.periodStart < lastResetStr;
            const nextCount    = isNewPeriod ? 1 : (Number(d.count || 0) + 1);
            const nextStart    = isNewPeriod ? lastResetStr : d.periodStart;
            await this._writeRentcastBlob({ count: nextCount, periodDay, periodStart: nextStart });
        } catch (e) {
            console.warn('[RentcastCounter] Failed to increment:', e.message);
        }
    },

    /**
     * Saves a specific count and/or periodDay. Used by the settings modal to
     * correct the count to match the real Rentcast dashboard.
     */
    async _setRentcastCounter(count, periodDay) {
        try {
            const uid = typeof Auth !== 'undefined' ? Auth.uid : null;
            if (!uid) { this.toast('Sign in to save Rentcast settings', 'error'); return false; }
            const lastReset    = this._rentcastPeriodStart(periodDay);
            const lastResetStr = lastReset.toISOString().slice(0, 10);
            const ok = await this._writeRentcastBlob({ count, periodDay, periodStart: lastResetStr });
            if (!ok) {
                this.toast('Failed to save Rentcast settings', 'error');
            }
            return ok;
        } catch (e) {
            console.warn('[RentcastCounter] Failed to set counter:', e.message);
            this.toast('Failed to save Rentcast settings', 'error');
            return false;
        }
    },

    /**
     * Updates the #rentcastUsageDisplay element.
     * Shows remaining calls + next reset date with a subtle gear icon for settings.
     */
    _updateRentcastDisplay(count, periodDay) {
        const el = document.getElementById('rentcastUsageDisplay');
        if (!el) return;
        const nextReset   = this._rentcastNextReset(periodDay || 1);
        const resetLabel  = nextReset.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        const remaining   = Math.max(0, 50 - count);
        const gearBtn =
            `<button onclick="App._openRentcastSettings()" ` +
            `style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);` +
            `font-size:13px;padding:0 0 0 5px;vertical-align:middle;line-height:1;" ` +
            `title="Rentcast settings">⚙</button>`;
        if (count < 50) {
            el.innerHTML =
                `<span>${remaining} of 50 lookups remaining${gearBtn}</span><br>` +
                `<span style="color:var(--text-tertiary)">Resets ${resetLabel}</span>`;
        } else {
            const over = count - 50;
            el.innerHTML =
                `<span class="rentcast-over">0 remaining (${over > 0 ? over + ' over limit' : 'limit reached'})${gearBtn}</span><br>` +
                `<span style="color:var(--text-tertiary)">Resets ${resetLabel}</span>`;
        }
    },

    /**
     * Opens a modal that lets the user correct their Rentcast API count and billing reset day.
     */
    async _openRentcastSettings() {
        const { count: currentCount, periodDay: currentDay } = await this._getRentcastCounter();

        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
            'background:rgba(0,0,0,0.55)', 'display:flex', 'align-items:center',
            'justify-content:center', 'z-index:10001'
        ].join(';');

        const box = document.createElement('div');
        box.style.cssText = [
            'background:var(--bg-card)', 'border:1px solid var(--border)',
            'border-radius:14px', 'padding:24px 28px', 'max-width:340px', 'width:90%',
            'box-shadow:0 8px 40px var(--shadow)', 'font-family:system-ui,sans-serif'
        ].join(';');

        box.innerHTML = `
            <h3 style="margin:0 0 16px 0;color:var(--text);font-size:15px;font-weight:600;">
                Rentcast Usage Settings
            </h3>
            <label style="display:block;margin-bottom:14px;">
                <span style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:5px;">
                    API requests used this period
                </span>
                <input id="_rc_count" type="number" min="0" max="999" value="${currentCount}"
                    style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;
                    border:1px solid var(--border);background:var(--bg-input);color:var(--text);
                    font-size:14px;">
            </label>
            <label style="display:block;margin-bottom:20px;">
                <span style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:5px;">
                    Billing resets on day of month (1–28)
                </span>
                <input id="_rc_day" type="number" min="1" max="28" value="${currentDay}"
                    style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;
                    border:1px solid var(--border);background:var(--bg-input);color:var(--text);
                    font-size:14px;">
            </label>
            <div style="display:flex;gap:10px;">
                <button id="_rc_save"
                    style="flex:1;padding:10px;background:var(--apple-blue);color:#fff;border:none;
                    border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">
                    Save
                </button>
                <button id="_rc_cancel"
                    style="flex:1;padding:10px;background:var(--bg-input);color:var(--text);
                    border:1px solid var(--border);border-radius:8px;font-weight:600;
                    cursor:pointer;font-size:13px;">
                    Cancel
                </button>
            </div>`;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        box.querySelector('#_rc_cancel').onclick = () => overlay.remove();

        box.querySelector('#_rc_save').onclick = async () => {
            const rawCount = parseInt(box.querySelector('#_rc_count').value, 10);
            const rawDay   = parseInt(box.querySelector('#_rc_day').value, 10);
            if (isNaN(rawCount) || rawCount < 0 || rawCount > 999) {
                this.toast('Enter a valid request count (0–999)', 'error'); return;
            }
            if (isNaN(rawDay) || rawDay < 1 || rawDay > 28) {
                this.toast('Reset day must be between 1 and 28', 'error'); return;
            }
            const ok = await this._setRentcastCounter(rawCount, rawDay);
            if (ok) {
                overlay.remove();
                this._updateRentcastDisplay(rawCount, rawDay);
                this.toast('Rentcast settings saved', 'success');
            }
        };

        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    },

    /**
     * Shows a non-blocking overage confirmation modal.
     * Returns a Promise that resolves to 'proceed' or 'skip'.
     */
    _showRentcastOverageModal(currentCount) {
        return new Promise(resolve => {
            const over = currentCount - 50;
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
                'background:rgba(0,0,0,0.6)', 'display:flex', 'align-items:center',
                'justify-content:center', 'z-index:10001'
            ].join(';');

            const box = document.createElement('div');
            box.style.cssText = [
                'background:var(--bg-card)', 'border:1px solid var(--border)',
                'border-radius:14px', 'padding:24px 28px', 'max-width:400px', 'width:90%',
                'box-shadow:0 8px 40px var(--shadow)', 'font-family:system-ui,sans-serif'
            ].join(';');

            const title = document.createElement('h3');
            title.textContent = '⚠️ Rentcast Limit Reached';
            title.style.cssText = 'margin:0 0 12px 0;color:var(--danger);font-size:16px;';

            const msg = document.createElement('p');
            msg.textContent = `You've used all 50 free Rentcast lookups this month${over > 0 ? ' (' + over + ' over limit)' : ''}. Additional lookups cost ~$0.50 each. Run anyway or skip Rentcast and use AI only?`;
            msg.style.cssText = 'margin:0 0 20px 0;color:var(--text);font-size:14px;line-height:1.5;';

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:10px;';

            const proceedBtn = document.createElement('button');
            proceedBtn.textContent = 'Run anyway (+$0.50)';
            proceedBtn.style.cssText = [
                'flex:1', 'padding:10px', 'background:var(--apple-blue)', 'color:#fff',
                'border:none', 'border-radius:8px', 'font-weight:600', 'cursor:pointer',
                'font-size:13px'
            ].join(';');
            proceedBtn.onclick = () => { overlay.remove(); resolve('proceed'); };

            const skipBtn = document.createElement('button');
            skipBtn.textContent = 'Use Web Search only';
            skipBtn.style.cssText = [
                'flex:1', 'padding:10px', 'background:var(--bg-input)', 'color:var(--text)',
                'border:1px solid var(--border)', 'border-radius:8px', 'font-weight:600',
                'cursor:pointer', 'font-size:13px'
            ].join(';');
            skipBtn.onclick = () => { overlay.remove(); resolve('skip'); };

            btnRow.appendChild(proceedBtn);
            btnRow.appendChild(skipBtn);
            box.appendChild(title);
            box.appendChild(msg);
            box.appendChild(btnRow);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
        });
    },

    /**
     * Writes a permanent consent record when user approves an overage lookup.
     * Phase D: previously a Firestore subcollection at
     * users/{uid}/rentcast_overage_log/{docId}. Now appended to a single
     * Supabase blob `rentcast_overage_log` whose payload is an array of
     * consent entries. Worst case for a multi-device race is one append
     * being clobbered — acceptable for an overage audit trail since the
     * user has to click "approve" interactively (no high-throughput
     * concurrent writes).
     */
    async _logRentcastOverage(address, currentCount) {
        try {
            const uid = typeof Auth !== 'undefined' ? Auth.uid : null;
            if (!uid) return;
            if (typeof window.Sync === 'undefined' || typeof window.Sync.pushBlob !== 'function') return;
            const timestamp = new Date().toISOString();
            const email = (typeof Auth !== 'undefined' && Auth.email) || 'unknown';
            const entry = {
                timestamp,
                address,
                monthlyCount: currentCount,
                approvedBy: email,
                action: 'approved_overage',
            };
            let existing = [];
            try {
                const blob = await window.Sync.pullBlob('rentcast_overage_log');
                if (blob && blob.ciphertext) {
                    const parsed = JSON.parse(blob.ciphertext);
                    if (Array.isArray(parsed)) existing = parsed;
                }
            } catch { /* first write — existing stays empty */ }
            existing.push(entry);
            await window.Sync.pushBlob('rentcast_overage_log', JSON.stringify(existing));
        } catch (e) {
            console.warn('[RentcastCounter] Failed to log overage:', e.message);
        }
    },

    /**
     * Called when the property step (step-3) becomes visible.
     * Reads current month counter from Firestore and populates the display.
     */
});
