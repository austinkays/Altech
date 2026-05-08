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

        // Show the passkey option iff the browser supports WebAuthn AND the
        // SDK exposes the new mfa.webauthn API. Failing either, hide both
        // the passkey card and the divider so the layout collapses cleanly
        // back to TOTP-only.
        const passkeySupported = (typeof SupabaseAuth.passkeySupported === 'function')
            && SupabaseAuth.passkeySupported()
            && (() => {
                try {
                    const c = window.Supabase && window.Supabase.client;
                    return !!(c && c.auth && c.auth.mfa && c.auth.mfa.webauthn
                        && typeof c.auth.mfa.webauthn.register === 'function');
                } catch { return false; }
            })();
        const passkeyOption = document.getElementById('mfaPasskeyOption');
        const passkeyDivider = document.getElementById('mfaPasskeyDivider');
        if (passkeyOption) passkeyOption.style.display = passkeySupported ? '' : 'none';
        if (passkeyDivider) passkeyDivider.style.display = passkeySupported ? '' : 'none';

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
            qrEl.innerHTML = '<p style="color:var(--text-secondary);font-size:12px">Generating QR…</p>';
            await _renderQrInto(qrEl, enroll);
        }
        if (secretEl) secretEl.value = enroll.secret || '';

        el.style.display = 'flex';
        el.classList.add('active');
    }

    /**
     * Triggered by the "Enable passkey" button in the enrollment overlay.
     * Calls SupabaseAuth.enrollPasskey which fires the browser's native
     * authenticator UI (Face ID / Touch ID / Windows Hello / hardware key).
     * Disables the button while in flight to avoid double-firing.
     */
    async function handlePasskeyEnroll() {
        if (typeof SupabaseAuth === 'undefined' || typeof SupabaseAuth.enrollPasskey !== 'function') {
            _showError('Passkeys are not available — refresh the page and try again.');
            return;
        }
        const btn = document.getElementById('mfaPasskeyEnrollBtn');
        const prevLabel = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Waiting for your device…'; }
        _showError('');
        try {
            await SupabaseAuth.enrollPasskey();
            closeEnroll();
            if (typeof App !== 'undefined' && App.toast) App.toast('Passkey enabled — sign-in is now one tap', 3000);
            if (typeof Auth !== 'undefined' && Auth.closeModal) Auth.closeModal();
            if (window.Sync && typeof window.Sync.schedulePush === 'function') window.Sync.schedulePush();
        } catch (e) {
            // Common cancellations: NotAllowedError (user dismissed prompt),
            // AbortError (timeout), InvalidStateError (already enrolled). Map
            // these to a non-alarming message and let the user try again.
            const name = (e && e.name) || '';
            const msg = (e && e.message) || 'Passkey setup failed.';
            if (name === 'NotAllowedError' || name === 'AbortError') {
                _showError('Passkey prompt was cancelled. Try again or use an authenticator app instead.');
            } else if (name === 'InvalidStateError') {
                _showError('A passkey is already registered for this device.');
            } else {
                _showError(msg);
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = prevLabel || 'Enable passkey'; }
        }
    }

    /**
     * Render the TOTP QR into `host`, dispatching across the three response
     * shapes Supabase has returned over the years:
     *   1. Raw SVG XML in `qr_code` (current supabase-js v2)
     *   2. Data URL in `qr_code` (older supabase-js)
     *   3. Only `uri` (otpauth://) — generate a QR client-side from a CDN lib
     * On any failure, shows otpauth URI as a clickable link so phones with
     * Authy/Google Authenticator/1Password etc. can still pair via tap.
     */
    async function _renderQrInto(host, enroll) {
        const qr = enroll && enroll.qrCode;
        const uri = enroll && enroll.uri;

        // Shape 1: raw SVG returned inline.
        if (typeof qr === 'string' && qr.trim().startsWith('<svg')) {
            host.innerHTML = `<div style="background:#fff;padding:10px;border-radius:8px;border:1px solid var(--border);display:inline-block;max-width:220px">${qr}</div>`;
            return;
        }
        // Shape 2: data URL (data:image/svg+xml;…) or http(s) URL.
        if (typeof qr === 'string' && /^(data:|https?:)/i.test(qr)) {
            host.innerHTML = `<img alt="Scan with your authenticator app" src="${qr}" style="max-width:220px;border:1px solid var(--border);border-radius:8px;background:#fff;padding:8px">`;
            return;
        }
        // Shape 3: only an otpauth URI — render via a CDN QR library.
        if (typeof uri === 'string' && uri.startsWith('otpauth://')) {
            try {
                await _ensureQrLib();
                const canvas = document.createElement('canvas');
                canvas.style.cssText = 'background:#fff;padding:10px;border-radius:8px;border:1px solid var(--border);max-width:220px';
                host.innerHTML = '';
                host.appendChild(canvas);
                await window.QRCode.toCanvas(canvas, uri, { width: 200, margin: 1 });
                return;
            } catch (e) {
                console.warn('[AuthMFAUI] Client-side QR render failed:', e && e.message);
                // Fall through to URI link.
            }
        }
        // Last resort: show the otpauth URI as a clickable link (phone OS
        // intercepts and opens the user's authenticator app).
        if (typeof uri === 'string' && uri.startsWith('otpauth://')) {
            host.innerHTML = `
                <p style="color:var(--text-secondary);font-size:12px;margin:0 0 8px">QR unavailable. On your phone, tap this link:</p>
                <a href="${uri}" style="word-break:break-all;font-family:monospace;font-size:11px;color:var(--apple-blue)">${uri}</a>
                <p style="color:var(--text-secondary);font-size:11px;margin:8px 0 0">Or enter the manual code below into your authenticator app.</p>`;
            return;
        }
        // No QR, no URI — manual entry only.
        host.innerHTML = '<p style="color:var(--text-secondary);font-size:12px">QR unavailable — enter the manual code below into your authenticator app (e.g. Authy, Google Authenticator, 1Password).</p>';
    }

    let _qrLibPromise = null;
    function _ensureQrLib() {
        if (window.QRCode && typeof window.QRCode.toCanvas === 'function') return Promise.resolve();
        if (_qrLibPromise) return _qrLibPromise;
        _qrLibPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => { _qrLibPromise = null; reject(new Error('Failed to load QR library from CDN')); };
            document.head.appendChild(s);
        });
        return _qrLibPromise;
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
        handlePasskeyEnroll,
    };
})();
