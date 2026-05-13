// intake-v2-rentcast.js — Rentcast usage counter + overage modal for v2.
//
// Storage shape (Supabase user_blobs, doc_key `rentcastUsage`, plain JSON):
//   { count: number, periodDay: 1..28, periodStart: 'YYYY-MM-DD' }
//
// The audit log of approved overages lives in a parallel blob
// `rentcast_overage_log` (array of { ts, address, count, action }).
// v1's helpers (App._getRentcastCounter / _incrementRentcastCounter) use
// the same shape; if App is loaded we delegate to them so multi-tab
// counts stay consistent.
//
// v1 pain points fixed here:
//   - Hardcoded "$0.50 each" in the modal → reads live pricing from
//     IntakeV2MapsKey.getPricing() (which proxies /api/config?type=keys's
//     new `rentcastPricing` block).
//   - Counter incremented BEFORE the API call → moved to AFTER a real
//     success-with-Rentcast-source response. Failed lookups no longer
//     burn credits.
//   - Counter hidden in a settings panel → always-visible pill rendered
//     under the Smart Scan button by intake-v2-property.js.
//
// Public API:
//   IntakeV2Rentcast.getSnapshot()  → Promise<{ count, limit, remaining,
//                                              nextReset, isOver, pricing }>
//   IntakeV2Rentcast.confirmOverage(address) → Promise<boolean>
//      Opens the overage modal. Resolves true when the agent clicks
//      "Run anyway" (and records the approval in the audit log),
//      false on "Skip" or close.
//   IntakeV2Rentcast.recordCall(address)
//      Increments the counter. Fire-and-forget — UI updates on next
//      snapshot read.
//   IntakeV2Rentcast.subscribe(fn)
//      Subscribe to counter changes (for live pill updates).

'use strict';

(function () {

const DEFAULT_LIMIT = 50;

const _listeners = new Set();
function _emit() { _listeners.forEach(fn => { try { fn(); } catch (_) {} }); }
function subscribe(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }

// Reach into v1's App.* helpers when available so multi-tab edits don't
// fight. The helpers do exactly the right thing (pushBlob/pullBlob with
// the right shape + auto-reset on period boundary). If App isn't loaded
// (test environment), fall through to the inline implementation below.
function _hasAppHelpers() {
    return typeof window.App !== 'undefined'
        && typeof window.App._getRentcastCounter === 'function'
        && typeof window.App._incrementRentcastCounter === 'function';
}

// Inline period helpers — mirror App's so the test environment doesn't
// need the full property monolith loaded.
function _periodStart(periodDay) {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), periodDay);
    if (now >= thisMonth) return thisMonth;
    return new Date(now.getFullYear(), now.getMonth() - 1, periodDay);
}
function _nextReset(periodDay) {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), periodDay);
    if (now < thisMonth) return thisMonth;
    return new Date(now.getFullYear(), now.getMonth() + 1, periodDay);
}

async function _readBlob() {
    if (!window.Sync || typeof window.Sync.pullBlob !== 'function') return null;
    try {
        const blob = await window.Sync.pullBlob('rentcastUsage');
        if (!blob || !blob.ciphertext) return null;
        try { return JSON.parse(blob.ciphertext); } catch { return null; }
    } catch (_) { return null; }
}
async function _writeBlob(payload) {
    if (!window.Sync || typeof window.Sync.pushBlob !== 'function') return;
    try { await window.Sync.pushBlob('rentcastUsage', JSON.stringify(payload)); }
    catch (_) { /* best-effort metering */ }
}
async function _appendOverageLog(entry) {
    if (!window.Sync || typeof window.Sync.pullBlob !== 'function' || typeof window.Sync.pushBlob !== 'function') return;
    try {
        const blob = await window.Sync.pullBlob('rentcast_overage_log');
        let log = [];
        if (blob && blob.ciphertext) {
            try { const parsed = JSON.parse(blob.ciphertext); if (Array.isArray(parsed)) log = parsed; } catch (_) {}
        }
        log.push(entry);
        // Cap the log at the most recent 200 entries — protects against
        // an automation runaway from bloating the blob.
        if (log.length > 200) log = log.slice(-200);
        await window.Sync.pushBlob('rentcast_overage_log', JSON.stringify(log));
    } catch (_) {}
}

async function getSnapshot() {
    const pricing = (window.IntakeV2MapsKey && typeof window.IntakeV2MapsKey.getPricing === 'function')
        ? await window.IntakeV2MapsKey.getPricing()
        : null;
    const limit = (pricing && Number.isFinite(pricing.freeMonthlyLimit)) ? pricing.freeMonthlyLimit : DEFAULT_LIMIT;

    let count = 0;
    let periodDay = 1;
    let nextReset = _nextReset(1);
    if (_hasAppHelpers()) {
        try {
            const c = await window.App._getRentcastCounter();
            count = c.count || 0;
            periodDay = c.periodDay || 1;
            nextReset = c.nextReset || _nextReset(periodDay);
        } catch (_) {}
    } else {
        const d = await _readBlob();
        if (d) {
            count = d.count || 0;
            periodDay = d.periodDay || 1;
            const lastReset = _periodStart(periodDay);
            const lastResetStr = lastReset.toISOString().slice(0, 10);
            if (!d.periodStart || d.periodStart < lastResetStr) {
                count = 0;  // auto-reset on the next read after a period boundary
            }
            nextReset = _nextReset(periodDay);
        }
    }
    return {
        count,
        limit,
        remaining: Math.max(0, limit - count),
        nextReset,
        isOver: count >= limit,
        pricing,
    };
}

async function recordCall(address) {
    if (_hasAppHelpers()) {
        try { await window.App._incrementRentcastCounter(); } catch (_) {}
    } else {
        const d = (await _readBlob()) || { count: 0, periodDay: 1, periodStart: '' };
        const periodDay = d.periodDay || 1;
        const lastReset = _periodStart(periodDay);
        const lastResetStr = lastReset.toISOString().slice(0, 10);
        const isNewPeriod = !d.periodStart || d.periodStart < lastResetStr;
        const nextCount = isNewPeriod ? 1 : (Number(d.count || 0) + 1);
        const nextStart = isNewPeriod ? lastResetStr : d.periodStart;
        await _writeBlob({ count: nextCount, periodDay, periodStart: nextStart });
    }
    _emit();
}

// ── Overage modal ──────────────────────────────────────────────────────────

let _modalEl = null;
function _modal() {
    if (_modalEl) return _modalEl;
    const el = document.createElement('div');
    el.className = 'iv2-rentcast-overage-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Rentcast overage confirmation');
    el.hidden = true;
    el.innerHTML = `
        <div class="iv2-rentcast-overage-modal" role="document">
            <header class="iv2-rentcast-overage-head">
                <h3>You're over your free Rentcast lookups for this month</h3>
                <p class="iv2-rentcast-overage-sub"></p>
            </header>
            <div class="iv2-rentcast-overage-body">
                <p class="iv2-rentcast-overage-address"></p>
                <p class="iv2-rentcast-overage-explain">
                    "Skip" runs Smart Scan with County records + AI search only
                    (free). "Run anyway" hits Rentcast directly — the per-call
                    fee will appear on your next invoice.
                </p>
            </div>
            <footer class="iv2-rentcast-overage-foot">
                <button type="button" class="iv2-rentcast-cancel">Skip Rentcast</button>
                <button type="button" class="iv2-rentcast-approve">Run anyway</button>
            </footer>
        </div>
    `;
    document.body.appendChild(el);
    _modalEl = el;
    el.addEventListener('click', (e) => { if (e.target === el) _closeModal(false); });
    document.addEventListener('keydown', (e) => {
        if (!_modalEl || _modalEl.hidden) return;
        if (e.key === 'Escape') _closeModal(false);
    });
    return el;
}
let _pendingResolve = null;
function _closeModal(answer) {
    if (!_modalEl) return;
    _modalEl.hidden = true;
    if (_pendingResolve) { _pendingResolve(answer); _pendingResolve = null; }
}

async function confirmOverage(address) {
    const el = _modal();
    const snap = await getSnapshot();
    const subEl  = el.querySelector('.iv2-rentcast-overage-sub');
    const addrEl = el.querySelector('.iv2-rentcast-overage-address');
    const approveBtn = el.querySelector('.iv2-rentcast-approve');
    const cancelBtn  = el.querySelector('.iv2-rentcast-cancel');
    const priceStr = snap.pricing && Number.isFinite(snap.pricing.perCall)
        ? `$${snap.pricing.perCall.toFixed(2)} per lookup`
        : '~$0.50 per lookup';
    const overCount = Math.max(0, snap.count - snap.limit);
    subEl.textContent = overCount > 0
        ? `${overCount} call${overCount === 1 ? '' : 's'} over your ${snap.limit}-call free tier · ${priceStr}`
        : `You're at your ${snap.limit}-call free tier limit · ${priceStr} for additional lookups`;
    addrEl.textContent = address ? `Address: ${address}` : '';

    // Re-wire buttons per open (cloneNode/replaceChild) so the resolver
    // closes over the current pending promise without leaks.
    const newApprove = approveBtn.cloneNode(true);
    const newCancel  = cancelBtn.cloneNode(true);
    approveBtn.parentNode.replaceChild(newApprove, approveBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newApprove.addEventListener('click', () => {
        // Record the approval in the audit log BEFORE the API call —
        // proves the user opted in even if the call later fails or the
        // session ends.
        const uid = (window.Auth && window.Auth.uid) || null;
        _appendOverageLog({
            ts: new Date().toISOString(),
            address: address || '',
            count: snap.count,
            action: 'approved_overage',
            uid,
        }).catch(() => {});
        _closeModal(true);
    });
    newCancel.addEventListener('click', () => _closeModal(false));

    el.hidden = false;
    return new Promise(resolve => { _pendingResolve = resolve; });
}

window.IntakeV2Rentcast = { getSnapshot, confirmOverage, recordCall, subscribe };

})();
