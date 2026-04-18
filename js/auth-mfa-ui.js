/**
 * js/auth-mfa-ui.js — Phase 3 TOTP enrollment modal driver.
 *
 * Dormant unless SYNC_BACKEND=supabase. Drives the #mfaEnrollOverlay modal
 * defined in index.html — renders the QR code from SupabaseAuth.enrollTOTP(),
 * handles the 6-digit verify form, and enforces the soft/hard dismiss policy.
 *
 * Soft mode: user may dismiss once with "Set up later". We bump
 * user_metadata.mfa_dismiss_count on each dismiss; after the threshold (3)
 * or 14 days since first prompt, SupabaseAuth flips to "hard" and this
 * module hides the close buttons entirely.
 */

'use strict';

window.AuthMFAUI = (() => {
    let _factorId = null;
    let _mode = 'soft'; // 'soft' | 'hard'

    function _overlay() { return document.getElementById('mfaEnrollOverlay'); }
    function _close()   { return document.getElementById('mfaEnrollClose'); }
    function _dismissBtn() { return document.getElementById('mfaEnrollDismiss'); }
    function _error()   { return _overlay() && _overlay().querySelector('.auth-error'); }

    function _showError(msg) {
        const el = _error();
        if (!el) return;
        el.textContent = msg || '';
        el.style.display = msg ? 'block' : 'none';
    }

    function _setButtonsForMode(hard) {
        const close = _close();
        const dismiss = _dismissBtn();
        if (close) close.style.display = hard ? 'none' : '';
        if (dismiss) dismiss.style.display = hard ? 'none' : '';
    }

    async function openEnroll({ hard = false } = {}) {
        if (typeof SupabaseAuth === 'undefined') return;
        const el = _overlay();
        if (!el) return;

        _mode = hard ? 'hard' : 'soft';
        _setButtonsForMode(hard);
        _showError('');

        let enroll;
        try {
            enroll = await SupabaseAuth.enrollTOTP();
        } catch (e) {
            _showError(e && e.message ? e.message : 'Could not start TOTP enrollment.');
            el.style.display = 'flex';
            return;
        }

        _factorId = enroll.factorId;
        const qrEl = document.getElementById('mfaEnrollQR');
        const secretEl = document.getElementById('mfaEnrollSecret');
        if (qrEl) {
            // Supabase returns a data URL for `qr_code` (SVG). Rendering it in
            // an <img> keeps styling consistent across browsers vs. inline SVG.
            qrEl.innerHTML = enroll.qrCode
                ? `<img alt="Scan with your authenticator app" src="${enroll.qrCode}" style="max-width:220px;border:1px solid var(--border);border-radius:8px;background:#fff;padding:8px">`
                : '<p style="color:var(--text-secondary);font-size:12px">QR unavailable — use the manual code below.</p>';
        }
        if (secretEl) secretEl.value = enroll.secret || '';

        el.style.display = 'flex';
        el.classList.add('active');
    }

    function closeEnroll() {
        const el = _overlay();
        if (!el) return;
        el.style.display = 'none';
        el.classList.remove('active');
    }

    async function handleVerifySubmit(e) {
        if (e && e.preventDefault) e.preventDefault();
        _showError('');
        const codeEl = document.getElementById('mfaEnrollCode');
        const code = codeEl ? String(codeEl.value || '').trim() : '';
        if (!/^\d{6}$/.test(code)) { _showError('Enter the 6-digit code from your authenticator.'); return; }
        if (!_factorId) { _showError('Enrollment expired — please reopen the dialog.'); return; }

        try {
            await SupabaseAuth.verifyTOTP(_factorId, code);
            closeEnroll();
            if (typeof App !== 'undefined' && App.toast) App.toast('Two-factor authentication enabled', 2500);
            // Close the login modal now that MFA is satisfied.
            if (typeof Auth !== 'undefined' && Auth.closeModal) Auth.closeModal();
            // Kick off a sync sweep now that schedulePush is no longer blocked.
            if (window.Sync && typeof window.Sync.schedulePush === 'function') window.Sync.schedulePush();
        } catch (err) {
            _showError(err && err.message ? err.message : 'Incorrect code. Try again.');
        }
    }

    async function dismissEnroll() {
        if (_mode === 'hard') return; // Button is hidden but be defensive.
        try { await SupabaseAuth.recordMfaDismiss(); } catch { /* best-effort */ }
        closeEnroll();
        if (typeof Auth !== 'undefined' && Auth.closeModal) Auth.closeModal();
    }

    return {
        openEnroll,
        closeEnroll,
        dismissEnroll,
        handleVerifySubmit,
    };
})();
