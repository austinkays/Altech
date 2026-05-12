// js/vault-ui.js — End-to-end encryption UI flows (Phase 1c)
//
// Orchestrates four modals backed by CryptoHelper + VaultMeta:
//   1. Onboarding  — first-time setup: choose passphrase → generate recovery key → confirm
//   2. Unlock      — enter passphrase to unlock the vault (fires on session start if locked)
//   3. Change      — rotate passphrase (requires current)
//   4. Recovery    — paste recovery key → set a new passphrase
//
// The modal DOM lives in index.html under #vaultOnboardModal, #vaultUnlockModal,
// #vaultChangeModal, #vaultRecoverModal. This module only wires up the logic.

'use strict';

(function() {
    // PBKDF2 iterations for production. Kept as a constant here (not a magic
    // number sprinkled through the file).
    const ITER = 600000;

    // ─── DOM helpers ──────────────────────────────────────────────────────────
    function _q(sel) { return document.querySelector(sel); }

    function _setBusy(modalSel, busy) {
        const modal = _q(modalSel);
        if (!modal) return;
        modal.querySelectorAll('button, input').forEach(el => {
            if (busy) el.setAttribute('data-busy', '1');
            else el.removeAttribute('data-busy');
            el.disabled = !!busy;
        });
    }

    function _showModal(modalSel) {
        const modal = _q(modalSel);
        if (!modal) return;
        modal.classList.add('active');
        modal.style.display = 'flex';
        // Focus first input for keyboard usability.
        setTimeout(() => {
            const first = modal.querySelector('input:not([type="hidden"]):not([disabled])');
            if (first) first.focus();
        }, 50);
    }

    function _hideModal(modalSel) {
        const modal = _q(modalSel);
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
        modal.querySelectorAll('.vault-error').forEach(el => {
            el.textContent = '';
            el.style.display = 'none';
        });
        modal.querySelectorAll('input[type="password"], input[type="text"], textarea').forEach(el => {
            if (el.dataset.preserve !== '1') el.value = '';
        });
        modal.querySelectorAll('input[type="checkbox"]').forEach(el => el.checked = false);
        // Reset multi-step UI to first step.
        modal.querySelectorAll('[data-step]').forEach(el => {
            el.style.display = el.dataset.step === '1' ? 'block' : 'none';
        });
    }

    function _setError(modalSel, msg) {
        const el = _q(`${modalSel} .vault-error`);
        if (!el) return;
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
    }

    function _toast(msg, type) {
        if (typeof App !== 'undefined' && App.toast) App.toast(msg, 2500);
    }

    // ─── Shared helpers ───────────────────────────────────────────────────────
    function _downloadTextFile(filename, contents) {
        const blob = new Blob([contents], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    function _recoveryFileBody(recoveryDisplay) {
        return [
            'ALTECH TOOLKIT — RECOVERY KEY',
            '──────────────────────────────────────────────',
            '',
            recoveryDisplay,
            '',
            '──────────────────────────────────────────────',
            'This key is the ONLY way to recover your data if you',
            'forget your passphrase. There is no way for us to reset',
            'it. Store it in your password manager or a secure',
            'physical location.',
            '',
            `Generated: ${new Date().toISOString()}`,
            '',
        ].join('\n');
    }

    // ─── Flow state ───────────────────────────────────────────────────────────
    // Transient state shared across steps of a single modal flow.
    let _onboardState = null; // { vault, recoveryKey }

    // ─── 1. Onboarding ────────────────────────────────────────────────────────
    async function startOnboarding() {
        _onboardState = null;
        const modal = _q('#vaultOnboardModal');
        if (!modal) return;
        // Reset all steps
        modal.querySelectorAll('[data-step]').forEach(el => {
            el.style.display = el.dataset.step === '1' ? 'block' : 'none';
        });
        _showModal('#vaultOnboardModal');
    }

    async function handleOnboardStep1Submit(e) {
        if (e) e.preventDefault();
        _setError('#vaultOnboardModal', '');

        const pass1 = _q('#vaultOnboardPass1').value;
        const pass2 = _q('#vaultOnboardPass2').value;

        if (!pass1 || pass1.length < 8) {
            _setError('#vaultOnboardModal', 'Passphrase must be at least 8 characters.');
            return;
        }
        if (pass1 !== pass2) {
            _setError('#vaultOnboardModal', 'Passphrases don\'t match.');
            return;
        }

        _setBusy('#vaultOnboardModal', true);
        try {
            // Create vault: generates MK, wraps it under the passphrase KEK,
            // caches MK in memory.
            const vaultMeta = await CryptoHelper.createVault(pass1, ITER);

            // Generate and attach the recovery key immediately.
            const recovery = CryptoHelper.generateRecoveryKey();
            const recoveryMeta = await CryptoHelper.wrapWithRecoveryKey(recovery.bytes, ITER);

            _onboardState = {
                vault: { ...vaultMeta, ...recoveryMeta },
                recoveryKey: recovery.display,
            };

            // Show recovery key step.
            _q('#vaultOnboardModal [data-step="1"]').style.display = 'none';
            _q('#vaultOnboardModal [data-step="2"]').style.display = 'block';
            _q('#vaultOnboardRecoveryKey').textContent = recovery.display;
            // Hard-zero the passphrase inputs as soon as we're done with them.
            _q('#vaultOnboardPass1').value = '';
            _q('#vaultOnboardPass2').value = '';
        } catch (err) {
            console.error('[Vault] Onboarding step 1 failed:', err);
            _setError('#vaultOnboardModal', err.message || 'Unable to create vault.');
        } finally {
            _setBusy('#vaultOnboardModal', false);
        }
    }

    function downloadRecoveryKey() {
        if (!_onboardState || !_onboardState.recoveryKey) return;
        const filename = `altech-recovery-key-${new Date().toISOString().slice(0,10)}.txt`;
        _downloadTextFile(filename, _recoveryFileBody(_onboardState.recoveryKey));
    }

    async function handleOnboardStep2Submit(e) {
        if (e) e.preventDefault();
        _setError('#vaultOnboardModal', '');

        const confirmed = _q('#vaultOnboardSavedCheckbox').checked;
        if (!confirmed) {
            _setError('#vaultOnboardModal', 'Please confirm you saved the recovery key.');
            return;
        }
        if (!_onboardState) {
            _setError('#vaultOnboardModal', 'Flow state lost. Please restart.');
            return;
        }

        _setBusy('#vaultOnboardModal', true);
        try {
            // Persist the full vault meta (server blob) and flip the feature flag on.
            await VaultMeta.save(_onboardState.vault);
            CryptoHelper.enableV2();

            // Best-effort: wipe the recovery key from our local state now that
            // the user confirmed they saved it.
            _onboardState = null;

            _hideModal('#vaultOnboardModal');
            _toast('🔒 End-to-end encryption is on.', 'success');

            // Refresh UI that reflects the new state.
            if (typeof CloudSync !== 'undefined' && CloudSync.refreshUI) CloudSync.refreshUI();
            refreshSettingsRow();
        } catch (err) {
            console.error('[Vault] Onboarding step 2 failed:', err);
            _setError('#vaultOnboardModal', err.message || 'Unable to save vault.');
        } finally {
            _setBusy('#vaultOnboardModal', false);
        }
    }

    function cancelOnboarding() {
        // If we already created an in-memory MK, discard it — we never wrote
        // the meta, so there's nothing else to clean up.
        CryptoHelper.lock();
        _onboardState = null;
        _hideModal('#vaultOnboardModal');
    }

    // ─── 2. Unlock ────────────────────────────────────────────────────────────
    async function openUnlock() {
        _showModal('#vaultUnlockModal');
    }

    async function handleUnlockSubmit(e) {
        if (e) e.preventDefault();
        _setError('#vaultUnlockModal', '');

        const passphrase = _q('#vaultUnlockPass').value;
        if (!passphrase) return;

        _setBusy('#vaultUnlockModal', true);
        try {
            const meta = await VaultMeta.load();
            if (!meta) {
                _setError('#vaultUnlockModal', 'No vault exists on this device. Disable and re-enable encryption to set up a new one.');
                return;
            }
            const ok = await CryptoHelper.unlockVault(meta, passphrase);
            if (!ok) {
                _setError('#vaultUnlockModal', 'Wrong passphrase. Try again, or use your recovery key.');
                return;
            }
            _q('#vaultUnlockPass').value = '';
            _hideModal('#vaultUnlockModal');
            _toast('🔓 Vault unlocked', 'success');
            if (typeof CloudSync !== 'undefined' && CloudSync.refreshUI) CloudSync.refreshUI();
            // Drain any sensitive-key encryptions that were deferred at boot
            // because the vault was still locked. Best-effort — never blocks
            // the unlock flow on the result.
            try {
                if (typeof SecureStorage !== 'undefined' && SecureStorage.migrate) {
                    SecureStorage.migrate().catch(() => {});
                }
            } catch { /* ignore */ }
        } catch (err) {
            console.error('[Vault] Unlock failed:', err);
            _setError('#vaultUnlockModal', err.message || 'Unable to unlock.');
        } finally {
            _setBusy('#vaultUnlockModal', false);
        }
    }

    // ─── 3. Change passphrase ─────────────────────────────────────────────────
    async function openChange() {
        const meta = await VaultMeta.load();
        if (!meta) {
            _toast('No vault configured', 'error');
            return;
        }
        _showModal('#vaultChangeModal');
    }

    async function handleChangeSubmit(e) {
        if (e) e.preventDefault();
        _setError('#vaultChangeModal', '');

        const current = _q('#vaultChangeCurrent').value;
        const next1 = _q('#vaultChangeNew1').value;
        const next2 = _q('#vaultChangeNew2').value;

        if (!current) {
            _setError('#vaultChangeModal', 'Current passphrase is required.');
            return;
        }
        if (!next1 || next1.length < 8) {
            _setError('#vaultChangeModal', 'New passphrase must be at least 8 characters.');
            return;
        }
        if (next1 !== next2) {
            _setError('#vaultChangeModal', 'New passphrases don\'t match.');
            return;
        }
        if (next1 === current) {
            _setError('#vaultChangeModal', 'New passphrase must be different from the current one.');
            return;
        }

        _setBusy('#vaultChangeModal', true);
        try {
            const meta = await VaultMeta.load();
            const updated = await CryptoHelper.changePassphrase(meta, current, next1, ITER);
            if (!updated) {
                _setError('#vaultChangeModal', 'Current passphrase is wrong.');
                return;
            }
            await VaultMeta.save(updated);
            _hideModal('#vaultChangeModal');
            _toast('🔒 Passphrase changed', 'success');
        } catch (err) {
            console.error('[Vault] Change failed:', err);
            _setError('#vaultChangeModal', err.message || 'Unable to change passphrase.');
        } finally {
            _setBusy('#vaultChangeModal', false);
        }
    }

    // ─── 4. Recovery ──────────────────────────────────────────────────────────
    async function openRecovery() {
        // Reset both steps.
        const modal = _q('#vaultRecoverModal');
        if (!modal) return;
        modal.querySelectorAll('[data-step]').forEach(el => {
            el.style.display = el.dataset.step === '1' ? 'block' : 'none';
        });
        // Transition from the unlock modal if it's open.
        _hideModal('#vaultUnlockModal');
        _showModal('#vaultRecoverModal');
    }

    async function handleRecoverStep1Submit(e) {
        if (e) e.preventDefault();
        _setError('#vaultRecoverModal', '');

        const display = _q('#vaultRecoverKey').value.trim();
        if (!display) {
            _setError('#vaultRecoverModal', 'Paste your recovery key.');
            return;
        }

        _setBusy('#vaultRecoverModal', true);
        try {
            const meta = await VaultMeta.load();
            if (!meta || !meta.recoveryWrappedMKB64) {
                _setError('#vaultRecoverModal', 'No recovery key is configured for this vault.');
                return;
            }
            const ok = await CryptoHelper.unlockVaultWithRecoveryKey(meta, display);
            if (!ok) {
                _setError('#vaultRecoverModal', 'That recovery key doesn\'t unlock this vault. Check for typos.');
                return;
            }
            // Step 2: require a new passphrase.
            _q('#vaultRecoverModal [data-step="1"]').style.display = 'none';
            _q('#vaultRecoverModal [data-step="2"]').style.display = 'block';
            _q('#vaultRecoverKey').value = '';
            setTimeout(() => _q('#vaultRecoverNewPass1').focus(), 50);
        } catch (err) {
            console.error('[Vault] Recovery step 1 failed:', err);
            _setError('#vaultRecoverModal', err.message || 'Recovery failed.');
        } finally {
            _setBusy('#vaultRecoverModal', false);
        }
    }

    async function handleRecoverStep2Submit(e) {
        if (e) e.preventDefault();
        _setError('#vaultRecoverModal', '');

        const pass1 = _q('#vaultRecoverNewPass1').value;
        const pass2 = _q('#vaultRecoverNewPass2').value;

        if (!pass1 || pass1.length < 8) {
            _setError('#vaultRecoverModal', 'New passphrase must be at least 8 characters.');
            return;
        }
        if (pass1 !== pass2) {
            _setError('#vaultRecoverModal', 'New passphrases don\'t match.');
            return;
        }

        _setBusy('#vaultRecoverModal', true);
        try {
            const newMeta = await CryptoHelper.rewrapWithPassphrase(pass1, ITER);
            await VaultMeta.save(newMeta);
            _hideModal('#vaultRecoverModal');
            _toast('🔒 Passphrase reset. Vault unlocked.', 'success');
            if (typeof CloudSync !== 'undefined' && CloudSync.refreshUI) CloudSync.refreshUI();
        } catch (err) {
            console.error('[Vault] Recovery step 2 failed:', err);
            _setError('#vaultRecoverModal', err.message || 'Unable to save new passphrase.');
        } finally {
            _setBusy('#vaultRecoverModal', false);
        }
    }

    // ─── 5. Disable E2E ───────────────────────────────────────────────────────
    // For Phase 1c / local-stub persistence, disabling just flips the flag off
    // and wipes the local meta. When Phase 2 lands, this needs a proper
    // re-encrypt-under-legacy-key step OR a server-side blob deletion.
    async function disableE2E() {
        if (!confirm('Disable end-to-end encryption? Your data will revert to the device-bound encryption key.')) return;
        try {
            CryptoHelper.disableV2();
            CryptoHelper.lock();
            await VaultMeta.clear();
            _toast('End-to-end encryption disabled', 'info');
            refreshSettingsRow();
            if (typeof CloudSync !== 'undefined' && CloudSync.refreshUI) CloudSync.refreshUI();
        } catch (err) {
            console.error('[Vault] Disable failed:', err);
            _toast('Unable to disable encryption', 'error');
        }
    }

    // ─── Settings-row renderer ────────────────────────────────────────────────
    // Updates the E2E row in Account → Sync based on current v2 state.
    function refreshSettingsRow() {
        const row = _q('#vaultSettingsRow');
        if (!row) return;
        const enabled = CryptoHelper.isV2Enabled();
        const unlocked = CryptoHelper.isV2Unlocked();
        const statusEl = row.querySelector('.vault-status');
        const primaryBtn = row.querySelector('.vault-primary-btn');

        if (!enabled) {
            if (statusEl) statusEl.textContent = 'Off — client data is encrypted with a device-bound key';
            if (primaryBtn) {
                primaryBtn.textContent = 'Enable';
                primaryBtn.onclick = () => startOnboarding();
            }
            row.querySelectorAll('[data-e2e-on]').forEach(el => el.style.display = 'none');
        } else if (!unlocked) {
            if (statusEl) statusEl.textContent = 'On — locked (enter passphrase to use)';
            if (primaryBtn) {
                primaryBtn.textContent = 'Unlock';
                primaryBtn.onclick = () => openUnlock();
            }
            row.querySelectorAll('[data-e2e-on]').forEach(el => el.style.display = 'block');
        } else {
            if (statusEl) statusEl.textContent = 'On — unlocked. Your data is end-to-end encrypted.';
            if (primaryBtn) {
                primaryBtn.textContent = 'Lock';
                primaryBtn.onclick = () => { CryptoHelper.lock(); refreshSettingsRow(); _toast('🔒 Vault locked', 'info'); };
            }
            row.querySelectorAll('[data-e2e-on]').forEach(el => el.style.display = 'block');
        }
    }

    // ─── Session-start unlock check ───────────────────────────────────────────
    async function maybePromptUnlockOnLoad() {
        if (!CryptoHelper.isV2Enabled()) return;
        if (CryptoHelper.isV2Unlocked()) return;
        const exists = await VaultMeta.exists();
        if (!exists) return;
        openUnlock();
    }

    // ─── Public surface ───────────────────────────────────────────────────────
    window.VaultUI = {
        startOnboarding,
        handleOnboardStep1Submit,
        handleOnboardStep2Submit,
        downloadRecoveryKey,
        cancelOnboarding,
        openUnlock,
        handleUnlockSubmit,
        openChange,
        handleChangeSubmit,
        openRecovery,
        handleRecoverStep1Submit,
        handleRecoverStep2Submit,
        disableE2E,
        refreshSettingsRow,
        maybePromptUnlockOnLoad,
    };
})();
