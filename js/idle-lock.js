// IdleLock — auto-lock the v2 vault after a period of inactivity.
//
// Why
//   E&O cyber insurance underwriters and most agency security audits expect
//   "session controls on unattended workstations" — i.e., the app must not
//   leave decrypted client NPI accessible if the user walks away from the
//   keyboard for an extended period. This module implements that control.
//
// What it does
//   1. Listens for user-activity events (mousemove, keydown, touchstart,
//      click, scroll, visibilitychange).
//   2. Resets an inactivity timer on every event. When the timer reaches
//      `timeoutMs` (default 15 min), it fires the lock action.
//   3. Lock action: calls CryptoHelper.lock() to clear the in-memory v2 key
//      so any subsequent encrypt/decrypt fails with CRYPTO_LOCKED. The
//      on-disk SecureStorage / vault data is already ciphertext, so the
//      keystore being cleared instantly stops new reads from succeeding.
//   4. Surfaces a passphrase prompt via VaultUI.promptUnlock so the user
//      can re-enter and resume work.
//
// Configuration
//   localStorage[STORAGE_KEYS.IDLE_TIMEOUT_MS] — int, defaults to
//   15 * 60 * 1000 (15 min). Set to 0 to disable. Per-user, synced with
//   the rest of preferences.
//
// Non-goals
//   • Locking the App as a whole (closing tabs, signing out, navigating
//     away). This module only locks the *cryptographic vault*. Plugin UI
//     stays visible; the user just can't decrypt new data until they
//     re-enter the passphrase.
//   • Locking when the page is just hidden briefly (alt-tab). We use
//     visibilitychange only to STOP the timer (since events stop firing
//     while hidden) and re-arm it on focus.

window.IdleLock = (() => {
    'use strict';

    const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];

    let _timeoutMs = DEFAULT_TIMEOUT_MS;
    let _timer = null;
    let _running = false;
    let _onLockCallbacks = [];

    function _getConfiguredTimeoutMs() {
        try {
            const raw = (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.IDLE_TIMEOUT_MS)
                ? localStorage.getItem(STORAGE_KEYS.IDLE_TIMEOUT_MS)
                : null;
            if (raw == null) return DEFAULT_TIMEOUT_MS;
            const n = parseInt(raw, 10);
            if (!Number.isFinite(n) || n < 0) return DEFAULT_TIMEOUT_MS;
            return n;
        } catch { return DEFAULT_TIMEOUT_MS; }
    }

    function _lockNow() {
        try {
            if (typeof CryptoHelper !== 'undefined' && CryptoHelper.lock) {
                CryptoHelper.lock();
            }
        } catch (e) {
            console.warn('[IdleLock] CryptoHelper.lock threw:', (e && e.message) || e);
        }
        if (window.ActivityLog) {
            window.ActivityLog.add({
                type: 'sync', area: 'idle-lock', ok: true,
                message: `Vault auto-locked after ${Math.round(_timeoutMs / 60000)} min inactivity`,
            });
        }
        for (const cb of _onLockCallbacks) {
            try { cb(); } catch (e) { console.warn('[IdleLock] onLock callback threw:', e); }
        }
        // Surface a re-unlock prompt to the user. VaultUI may not be loaded
        // in test environments — feature-detect.
        try {
            if (typeof VaultUI !== 'undefined' && VaultUI.promptUnlock) {
                VaultUI.promptUnlock({ reason: 'idle-timeout' });
            } else if (typeof App !== 'undefined' && App.toast) {
                App.toast('Vault locked — please re-enter passphrase to continue.', { type: 'info', duration: 5000 });
            }
        } catch (e) { /* ignore — best-effort UI */ }
        // Important: do NOT set _running = false here. After lock fires the
        // user typically types their passphrase to unlock — those keystrokes
        // are activity events that should reset a fresh timer. If _running
        // were false, _resetTimer would early-return and the vault would
        // never auto-lock again in this session (P0 bug fixed May 11 2026).
        // The previous setTimeout has already fired, so the timer slot is
        // free; the next activity event sets a new one via _resetTimer.
        _timer = null;
    }

    function _resetTimer() {
        if (!_running) return;
        if (_timer) clearTimeout(_timer);
        if (_timeoutMs > 0) {
            _timer = setTimeout(_lockNow, _timeoutMs);
        }
    }

    function _onActivity() {
        _resetTimer();
    }

    function _onVisibilityChange() {
        // Pause when hidden (events stop firing anyway), resume on visible.
        if (document.visibilityState === 'hidden') {
            if (_timer) { clearTimeout(_timer); _timer = null; }
        } else if (document.visibilityState === 'visible') {
            _resetTimer();
        }
    }

    function init() {
        _timeoutMs = _getConfiguredTimeoutMs();
        if (_timeoutMs === 0) return; // disabled by config
        if (_running) return;
        _running = true;
        for (const evt of ACTIVITY_EVENTS) {
            window.addEventListener(evt, _onActivity, { passive: true });
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', _onVisibilityChange);
        }
        _resetTimer();
    }

    function stop() {
        _running = false;
        if (_timer) { clearTimeout(_timer); _timer = null; }
        for (const evt of ACTIVITY_EVENTS) {
            try { window.removeEventListener(evt, _onActivity); } catch {}
        }
        try { document.removeEventListener('visibilitychange', _onVisibilityChange); } catch {}
    }

    function lockNow() { _lockNow(); }

    function onLock(cb) {
        if (typeof cb === 'function') _onLockCallbacks.push(cb);
    }

    function setTimeoutMs(ms) {
        _timeoutMs = Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_TIMEOUT_MS;
        try {
            if (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.IDLE_TIMEOUT_MS) {
                localStorage.setItem(STORAGE_KEYS.IDLE_TIMEOUT_MS, String(_timeoutMs));
            }
        } catch {}
        _resetTimer();
    }

    function getTimeoutMs() { return _timeoutMs; }
    function isRunning() { return _running; }

    return Object.freeze({
        init, stop, lockNow, onLock, setTimeoutMs, getTimeoutMs, isRunning,
        DEFAULT_TIMEOUT_MS,
    });
})();
