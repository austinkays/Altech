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

    /**
     * Reads the Rentcast usage doc from users/{uid}/sync/rentcastUsage.
     * Returns { count, periodDay, nextReset } — count is auto-zeroed if a new period has started.
     */
    async _getRentcastCounter() {
        const fallback = { count: 0, periodDay: 1, nextReset: this._rentcastNextReset(1) };
        try {
            const uid = typeof Auth !== 'undefined' ? Auth.uid : null;
            const db  = typeof FirebaseConfig !== 'undefined' ? FirebaseConfig.db : null;
            if (!uid || !db) return fallback;
            const docRef = db.collection('users').doc(uid).collection('sync').doc('rentcastUsage');
            const snap = await docRef.get();
            if (!snap.exists) return fallback;
            const d = snap.data();
            const periodDay    = d.periodDay || 1;
            const periodStart  = d.periodStart || '';
            const nextReset    = this._rentcastNextReset(periodDay);
            const lastReset    = this._rentcastPeriodStart(periodDay);
            const lastResetStr = lastReset.toISOString().slice(0, 10);
            // If stored periodStart is older than the last computed reset → new cycle
            if (periodStart < lastResetStr) {
                // Auto-reset: write the new period asynchronously (fire-and-forget)
                docRef.set({ count: 0, periodDay, periodStart: lastResetStr }, { merge: true })
                    .catch(err => console.warn('[RentcastCounter] Auto-reset write failed:', err.message));
                return { count: 0, periodDay, nextReset };
            }
            return { count: d.count || 0, periodDay, nextReset };
        } catch (e) {
            console.warn('[RentcastCounter] Failed to read counter:', e.message);
            return fallback;
        }
    },

    /**
     * Increments the usage counter by 1. If a new billing period has started since the
     * last write, resets to 1 instead of incrementing.
     */
    async _incrementRentcastCounter() {
        try {
            const uid = typeof Auth !== 'undefined' ? Auth.uid : null;
            const db  = typeof FirebaseConfig !== 'undefined' ? FirebaseConfig.db : null;
            if (!uid || !db) return;
            const docRef = db.collection('users').doc(uid).collection('sync').doc('rentcastUsage');
            const snap = await docRef.get();
            const d = snap.exists ? snap.data() : {};
            const periodDay   = d.periodDay || 1;
            const lastReset   = this._rentcastPeriodStart(periodDay);
            const lastResetStr = lastReset.toISOString().slice(0, 10);
            const isNewPeriod = !d.periodStart || d.periodStart < lastResetStr;
            if (isNewPeriod) {
                await docRef.set({ count: 1, periodDay, periodStart: lastResetStr }, { merge: true });
            } else {
                await docRef.set({ count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
            }
        } catch (e) {
            console.warn('[RentcastCounter] Failed to increment:', e.message);
        }
    },

    /**
     * Saves a specific count and/or periodDay to Firestore.
     * Used by the settings modal to correct the count to match the real Rentcast dashboard.
     */
    async _setRentcastCounter(count, periodDay) {
        try {
            const uid = typeof Auth !== 'undefined' ? Auth.uid : null;
            const db  = typeof FirebaseConfig !== 'undefined' ? FirebaseConfig.db : null;
            if (!uid || !db) { this.toast('Sign in to save Rentcast settings', 'error'); return false; }
            const lastReset    = this._rentcastPeriodStart(periodDay);
            const lastResetStr = lastReset.toISOString().slice(0, 10);
            await db.collection('users').doc(uid).collection('sync').doc('rentcastUsage')
                .set({ count, periodDay, periodStart: lastResetStr }, { merge: true });
            return true;
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
     * Writes a permanent consent record to Firestore when user approves an overage lookup.
     * No-op in test environments. These records must never be deleted.
     */
    async _logRentcastOverage(address, currentCount) {
        try {
            const uid = typeof Auth !== 'undefined' ? Auth.uid : null;
            const db = typeof FirebaseConfig !== 'undefined' ? FirebaseConfig.db : null;
            if (!uid || !db) return;
            const timestamp = new Date().toISOString();
            const docId = timestamp.replace(/[:.]/g, '-');
            const email = (typeof firebase !== 'undefined' && firebase.auth().currentUser?.email) || 'unknown';
            await db.collection('users').doc(uid)
                .collection('rentcast_overage_log').doc(docId)
                .set({
                    timestamp,
                    address,
                    monthlyCount: currentCount,
                    approvedBy: email,
                    action: 'approved_overage'
                });
        } catch (e) {
            console.warn('[RentcastCounter] Failed to log overage:', e.message);
        }
    },

    /**
     * Called when the property step (step-3) becomes visible.
     * Reads current month counter from Firestore and populates the display.
     */
});
