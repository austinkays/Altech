// AccountingExport — Encrypted vault + Playwright export tools
// Storage: altech_acct_vault_v2 (encrypted), altech_acct_vault_meta (PIN hash+salt)

const AccountingExport = {
    initialized: false,
    currentFile: null,
    pollTimer: null,

    // ── Vault State ──
    _VAULT_KEY: 'altech_acct_vault_v2',
    _META_KEY: 'altech_acct_vault_meta',
    _OLD_VAULT_KEY: 'altech_acct_vault',
    _unlocked: false,
    _vaultData: null, // { accounts: [...] }
    _autoLockTimer: null,
    _AUTO_LOCK_MS: 15 * 60 * 1000, // 15 minutes
    _failedAttempts: 0,
    _lockoutUntil: 0,
    _clipboardTimers: [],
    _CLIPBOARD_CLEAR_MS: 30000,
    _editingIdx: -1,

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this._migrateV1();
        this._resolveVaultScreen();
        this.renderHistory();
        this._wireAutoLock();
    },

    // ═══════════════════════════════════════════
    //  TAB SWITCHING
    // ═══════════════════════════════════════════

    switchTab(tab) {
        document.querySelectorAll('.acct-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.querySelectorAll('.acct-tab-content').forEach(c => c.classList.toggle('active', c.dataset.tab === tab));
    },

    // ═══════════════════════════════════════════
    //  PIN SYSTEM
    // ═══════════════════════════════════════════

    _hasPIN() {
        const meta = Utils.tryParseLS(this._META_KEY, null);
        return !!(meta && meta.pinHash && meta.pinSalt);
    },

    _getMeta() {
        return Utils.tryParseLS(this._META_KEY, null);
    },

    async _hashPIN(pin, salt) {
        const enc = new TextEncoder();
        const data = enc.encode(pin + salt);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    _generateSalt() {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async setupPIN() {
        const pin = document.getElementById('acctPinNew')?.value || '';
        const confirm = document.getElementById('acctPinConfirm')?.value || '';
        if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
            App.toast('PIN must be 4–6 digits', 'error');
            return;
        }
        if (pin !== confirm) {
            App.toast('PINs do not match', 'error');
            return;
        }
        const salt = this._generateSalt();
        const hash = await this._hashPIN(pin, salt);
        const meta = { pinHash: hash, pinSalt: salt };
        localStorage.setItem(this._META_KEY, JSON.stringify(meta));
        if (typeof CloudSync !== 'undefined') CloudSync.schedulePush();

        // Initialize empty vault if none exists
        if (!localStorage.getItem(this._VAULT_KEY)) {
            await this._saveVault({ accounts: [] });
        }

        this._unlocked = true;
        this._failedAttempts = 0;
        this._vaultData = await this._loadVault();
        this._showScreen('content');
        this._renderCards();
        this._resetAutoLock();
        App.toast('PIN set successfully', 'success');
    },

    async unlockVault() {
        // Check lockout
        if (Date.now() < this._lockoutUntil) {
            const secs = Math.ceil((this._lockoutUntil - Date.now()) / 1000);
            App.toast(`Locked out. Try again in ${secs}s`, 'error');
            return;
        }
        const pin = document.getElementById('acctPinEntry')?.value || '';
        if (!pin) return;
        const meta = this._getMeta();
        if (!meta) return;
        const hash = await this._hashPIN(pin, meta.pinSalt);
        if (hash !== meta.pinHash) {
            this._failedAttempts++;
            const input = document.getElementById('acctPinEntry');
            if (input) input.value = '';
            if (this._failedAttempts >= 6) {
                this._lockoutUntil = Date.now() + 5 * 60 * 1000;
                this._showLockout(5 * 60);
                App.toast('Too many attempts — locked for 5 minutes', 'error');
            } else if (this._failedAttempts >= 3) {
                this._lockoutUntil = Date.now() + 60 * 1000;
                this._showLockout(60);
                App.toast('Too many attempts — locked for 60 seconds', 'error');
            } else {
                App.toast('Wrong PIN', 'error');
            }
            return;
        }
        // Success
        this._failedAttempts = 0;
        this._unlocked = true;
        this._vaultData = await this._loadVault();
        if (!this._vaultData) this._vaultData = { accounts: [] };
        this._showScreen('content');
        this._renderCards();
        this._resetAutoLock();
    },

    _showLockout(totalSecs) {
        const el = document.getElementById('acctPinLockout');
        const btn = document.getElementById('acctPinUnlockBtn');
        if (!el) return;
        if (btn) btn.disabled = true;
        el.style.display = '';
        let remaining = totalSecs;
        const tick = () => {
            if (remaining <= 0) {
                el.style.display = 'none';
                if (btn) btn.disabled = false;
                return;
            }
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            el.textContent = `⏱ Try again in ${m > 0 ? m + 'm ' : ''}${s}s`;
            remaining--;
            setTimeout(tick, 1000);
        };
        tick();
    },

    lockVault() {
        this._unlocked = false;
        this._vaultData = null;
        this._editingIdx = -1;
        this._debouncedLock?.cancel();
        this._clearAllClipboardTimers();
        this._showScreen('lock');
        const input = document.getElementById('acctPinEntry');
        if (input) input.value = '';
    },

    async forgotPIN() {
        if (typeof Auth === 'undefined' || !Auth.isSignedIn) {
            App.toast('Sign in to your Altech account first to reset your PIN', 'error');
            return;
        }
        this._showScreen('recovery');
    },

    async verifyRecovery() {
        const pw = document.getElementById('acctRecoveryPassword')?.value || '';
        if (!pw) { App.toast('Enter your password', 'error'); return; }
        try {
            const user = firebase.auth().currentUser;
            if (!user || !user.email) throw new Error('Not signed in');
            const cred = firebase.auth.EmailAuthProvider.credential(user.email, pw);
            await user.reauthenticateWithCredential(cred);
            // Re-auth success — clear PIN so user can set a new one
            localStorage.removeItem(this._META_KEY);
            if (typeof CloudSync !== 'undefined') CloudSync.schedulePush();
            this._failedAttempts = 0;
            this._lockoutUntil = 0;
            App.toast('Identity verified — set a new PIN', 'success');
            this._showScreen('setup');
        } catch (e) {
            App.toast('Incorrect password', 'error');
        }
    },

    _resolveVaultScreen() {
        if (!this._hasPIN()) {
            this._showScreen('setup');
        } else if (this._unlocked) {
            this._showScreen('content');
            this._renderCards();
        } else {
            this._showScreen('lock');
        }
    },

    _showScreen(which) {
        const screens = { setup: 'acctPinSetup', lock: 'acctPinLock', recovery: 'acctPinRecovery', content: 'acctVaultContent' };
        Object.values(screens).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const target = document.getElementById(screens[which]);
        if (target) target.style.display = '';
    },

    // ── Auto-lock ──

    _wireAutoLock() {
        const reset = () => this._resetAutoLock();
        document.addEventListener('click', reset, { passive: true });
        document.addEventListener('input', reset, { passive: true });
        document.addEventListener('scroll', reset, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this._unlocked) this.lockVault();
        });
    },

    _resetAutoLock() {
        if (!this._debouncedLock) this._debouncedLock = Utils.debounce(() => this.lockVault(), this._AUTO_LOCK_MS);
        if (!this._unlocked) { this._debouncedLock.cancel(); return; }
        this._debouncedLock();
    },

    // ═══════════════════════════════════════════
    //  ENCRYPTED VAULT CRUD
    // ═══════════════════════════════════════════

    async _saveVault(data) {
        try {
            if (typeof CryptoHelper !== 'undefined' && CryptoHelper.encrypt) {
                const encrypted = await CryptoHelper.encrypt(data);
                localStorage.setItem(this._VAULT_KEY, encrypted);
            } else {
                localStorage.setItem(this._VAULT_KEY, JSON.stringify(data));
            }
            if (typeof CloudSync !== 'undefined') CloudSync.schedulePush();
        } catch (e) {
            console.warn('[AccountingExport] saveVault error:', e);
        }
    },

    async _loadVault() {
        try {
            const raw = localStorage.getItem(this._VAULT_KEY);
            if (!raw) return { accounts: [] };
            if (typeof CryptoHelper !== 'undefined' && CryptoHelper.decrypt) {
                const data = await CryptoHelper.decrypt(raw);
                if (data && typeof data === 'object') return data;
            }
            // Fallback: try parse as plain JSON (shouldn't happen in production)
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : { accounts: [] };
        } catch (e) {
            console.warn('[AccountingExport] loadVault error:', e);
            return { accounts: [] };
        }
    },

    // ── Migration from v1 (plain text) ──

    _migrateV1() {
        try {
            const old = localStorage.getItem(this._OLD_VAULT_KEY);
            if (!old) return;
            // Only migrate if v2 doesn't exist yet
            if (localStorage.getItem(this._VAULT_KEY)) {
                localStorage.removeItem(this._OLD_VAULT_KEY);
                return;
            }
            const data = JSON.parse(old);
            if (!data || typeof data !== 'object') return;
            // Build a single account from the old 7 fields
            const fields = [];
            if (data.vaultHsUser) fields.push({ label: 'HawkSoft Username', value: data.vaultHsUser });
            if (data.vaultHsPass) fields.push({ label: 'HawkSoft Password', value: data.vaultHsPass });
            if (data.vaultBankName) fields.push({ label: 'Bank Name', value: data.vaultBankName });
            if (data.vaultAcctNum) fields.push({ label: 'Account Number', value: data.vaultAcctNum });
            if (data.vaultRouting) fields.push({ label: 'Routing Number', value: data.vaultRouting });
            if (data.vaultAcctType) fields.push({ label: 'Account Type', value: data.vaultAcctType });
            if (data.vaultNotes) fields.push({ label: 'Notes', value: data.vaultNotes });
            if (fields.length) {
                // Store migration data in memory — will be encrypted once PIN is set
                this._pendingMigration = {
                    accounts: [{
                        id: 'acct-migrated',
                        name: 'HawkSoft / Trust Account',
                        type: 'checking',
                        color: '#0052cc',
                        fields: fields,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }]
                };
            }
            localStorage.removeItem(this._OLD_VAULT_KEY);
        } catch (e) {
            console.warn('[AccountingExport] v1 migration error:', e);
        }
    },

    // ── Account Card CRUD ──

    toggleAddForm() {
        const form = document.getElementById('acctAddForm');
        if (!form) return;
        const isActive = form.classList.toggle('active');
        if (!isActive) {
            this._editingIdx = -1;
            this._clearAddForm();
        }
    },

    _clearAddForm() {
        const name = document.getElementById('acctAddName');
        const type = document.getElementById('acctAddType');
        const color = document.getElementById('acctAddColor');
        const title = document.getElementById('acctAddFormTitle');
        const fields = document.getElementById('acctAddFieldsList');
        if (name) name.value = '';
        if (type) type.value = 'checking';
        if (color) color.value = '#0052cc';
        if (title) title.textContent = 'Add New Account';
        if (fields) fields.innerHTML = `<div class="acct-add-field-row">
            <input type="text" placeholder="Label (e.g. Account #)" data-role="label">
            <input type="text" placeholder="Value" data-role="value">
            <button class="acct-field-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
        </div>`;
    },

    addFieldRow() {
        const list = document.getElementById('acctAddFieldsList');
        if (!list) return;
        const row = document.createElement('div');
        row.className = 'acct-add-field-row';
        row.innerHTML = `<input type="text" placeholder="Label" data-role="label">
            <input type="text" placeholder="Value" data-role="value">
            <button class="acct-field-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>`;
        list.appendChild(row);
    },

    async saveAccount() {
        if (!this._unlocked || !this._vaultData) return;
        const name = (document.getElementById('acctAddName')?.value || '').trim();
        const type = document.getElementById('acctAddType')?.value || 'other';
        const color = document.getElementById('acctAddColor')?.value || '#0052cc';
        if (!name) { App.toast('Enter an account name', 'error'); return; }

        const rows = document.querySelectorAll('#acctAddFieldsList .acct-add-field-row');
        const fields = [];
        rows.forEach(row => {
            const label = (row.querySelector('[data-role="label"]')?.value || '').trim();
            const value = (row.querySelector('[data-role="value"]')?.value || '').trim();
            if (label || value) fields.push({ label, value });
        });
        if (!fields.length) { App.toast('Add at least one field', 'error'); return; }

        const now = new Date().toISOString();
        if (this._editingIdx >= 0 && this._editingIdx < this._vaultData.accounts.length) {
            const acct = this._vaultData.accounts[this._editingIdx];
            acct.name = name;
            acct.type = type;
            acct.color = color;
            acct.fields = fields;
            acct.updatedAt = now;
        } else {
            this._vaultData.accounts.push({
                id: 'acct-' + Date.now(),
                name, type, color, fields,
                createdAt: now,
                updatedAt: now
            });
        }
        await this._saveVault(this._vaultData);
        this._editingIdx = -1;
        this.toggleAddForm();
        this._renderCards();
        this._resetAutoLock();
        App.toast(this._editingIdx >= 0 ? 'Account updated' : 'Account saved', 'success');
    },

    editAccount(idx) {
        if (!this._unlocked || !this._vaultData) return;
        const acct = this._vaultData.accounts[idx];
        if (!acct) return;
        this._editingIdx = idx;
        const form = document.getElementById('acctAddForm');
        const title = document.getElementById('acctAddFormTitle');
        const nameEl = document.getElementById('acctAddName');
        const typeEl = document.getElementById('acctAddType');
        const colorEl = document.getElementById('acctAddColor');
        const fields = document.getElementById('acctAddFieldsList');
        if (title) title.textContent = 'Edit Account';
        if (nameEl) nameEl.value = acct.name || '';
        if (typeEl) typeEl.value = acct.type || 'other';
        if (colorEl) colorEl.value = acct.color || '#0052cc';
        if (fields) {
            fields.innerHTML = acct.fields.map(f =>
                `<div class="acct-add-field-row">
                    <input type="text" data-role="label" value="${this.escHtml(f.label)}">
                    <input type="text" data-role="value" value="${this.escHtml(f.value)}">
                    <button class="acct-field-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
                </div>`
            ).join('');
        }
        if (form && !form.classList.contains('active')) form.classList.add('active');
        form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    async deleteAccount(idx) {
        if (!this._unlocked || !this._vaultData) return;
        const acct = this._vaultData.accounts[idx];
        if (!acct) return;
        if (!confirm(`Delete "${acct.name}"? This cannot be undone.`)) return;
        this._vaultData.accounts.splice(idx, 1);
        await this._saveVault(this._vaultData);
        this._renderCards();
        App.toast('Account deleted', 'success');
    },

    // ── Card Rendering ──

    _renderCards() {
        const grid = document.getElementById('acctCardsGrid');
        if (!grid || !this._vaultData) return;

        // Apply pending migration
        if (this._pendingMigration) {
            this._vaultData.accounts = this._pendingMigration.accounts.concat(this._vaultData.accounts);
            this._pendingMigration = null;
            this._saveVault(this._vaultData);
        }

        const accounts = this._vaultData.accounts;
        if (!accounts.length) {
            grid.innerHTML = '<div class="acct-empty-state"><div class="acct-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div><p>No accounts yet</p><span>Click "Add Account" to store your first card or bank info.</span></div>';
            return;
        }
        grid.innerHTML = accounts.map((acct, i) => {
            const typeLabels = { checking: 'Checking', savings: 'Savings', credit: 'Credit Card', debit: 'Debit Card', other: 'Other' };
            const typeLabel = typeLabels[acct.type] || acct.type;
            const fieldsHtml = (acct.fields || []).map(f => {
                const masked = '••••••••';
                return `<div class="acct-card-field">
                    <span class="acct-card-field-label">${this.escHtml(f.label)}</span>
                    <span class="acct-card-field-value" data-raw="${this.escHtml(f.value)}" data-masked="true" onclick="AccountingExport.toggleFieldValue(this)">
                        ${masked}
                    </span>
                    <button class="acct-card-copy" onclick="AccountingExport.copyField(this, event)" title="Copy">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                </div>`;
            }).join('');
            return `<div class="acct-card" style="border-top: 3px solid ${this.escHtml(acct.color || '#0052cc')}">
                <div class="acct-card-header">
                    <div>
                        <div class="acct-card-name">${this.escHtml(acct.name)}</div>
                        <div class="acct-card-type">${typeLabel}</div>
                    </div>
                    <div class="acct-card-actions">
                        <button onclick="AccountingExport.editAccount(${i})" title="Edit">✏️</button>
                        <button onclick="AccountingExport.deleteAccount(${i})" title="Delete">✕</button>
                    </div>
                </div>
                <div class="acct-card-fields">${fieldsHtml}</div>
            </div>`;
        }).join('');
    },

    toggleFieldValue(el) {
        if (!el) return;
        const raw = el.getAttribute('data-raw') || '';
        const isMasked = el.getAttribute('data-masked') === 'true';
        if (isMasked) {
            el.textContent = raw;
            el.setAttribute('data-masked', 'false');
            // Auto-re-mask after 10 seconds
            setTimeout(() => {
                if (el.getAttribute('data-masked') === 'false') {
                    el.textContent = '••••••••';
                    el.setAttribute('data-masked', 'true');
                }
            }, 10000);
        } else {
            el.textContent = '••••••••';
            el.setAttribute('data-masked', 'true');
        }
    },

    copyField(btn, event) {
        if (event) event.stopPropagation();
        const field = btn?.parentElement;
        const valueEl = field?.querySelector('.acct-card-field-value');
        const raw = valueEl?.getAttribute('data-raw') || '';
        if (!raw) return;
        navigator.clipboard.writeText(raw).then(() => {
            btn.innerHTML = '<span style="font-size:12px;">✓</span>';
            setTimeout(() => {
                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
            }, 1200);
            // Auto-clear clipboard after 30 seconds
            const timer = setTimeout(() => {
                navigator.clipboard.writeText('').catch(() => {});
            }, this._CLIPBOARD_CLEAR_MS);
            this._clipboardTimers.push(timer);
        }).catch(() => {
            App.toast('Copy failed — click the value to reveal and copy manually', 'error');
        });
    },

    _clearAllClipboardTimers() {
        this._clipboardTimers.forEach(t => clearTimeout(t));
        this._clipboardTimers = [];
    },

    // ═══════════════════════════════════════════
    //  DEPOSIT CALCULATOR
    // ═══════════════════════════════════════════

    depDenoms: [100, 50, 20, 10, 5, 1],
    depChecks: [],

    calcDeposit() {
        let cashTotal = 0;
        this.depDenoms.forEach(d => {
            const count = parseInt(document.getElementById('depC' + d)?.value) || 0;
            const sub = count * d;
            const subEl = document.getElementById('depS' + d);
            if (subEl) subEl.textContent = '$' + sub.toFixed(2);
            cashTotal += sub;
        });
        const coins = parseFloat(document.getElementById('depCoins')?.value) || 0;
        cashTotal += coins;

        let checkTotal = 0;
        this.depChecks.forEach(c => { checkTotal += c.amount; });

        const subCash = document.getElementById('depSubCash');
        const subChecks = document.getElementById('depSubChecks');
        const grand = document.getElementById('depGrandTotal');
        if (subCash) subCash.querySelector('span:last-child').textContent = '$' + cashTotal.toFixed(2);
        if (subChecks) subChecks.querySelector('span:last-child').textContent = '$' + checkTotal.toFixed(2);
        if (grand) grand.textContent = '$' + (cashTotal + checkTotal).toFixed(2);
    },

    addCheck() {
        this.depChecks.push({ id: Date.now(), amount: 0, memo: '' });
        this.renderChecks();
    },

    removeCheck(id) {
        this.depChecks = this.depChecks.filter(c => c.id !== id);
        this.renderChecks();
        this.calcDeposit();
    },

    updateCheck(id, field, value) {
        const c = this.depChecks.find(c => c.id === id);
        if (!c) return;
        if (field === 'amount') c.amount = parseFloat(value) || 0;
        else c.memo = value;
        this.calcDeposit();
    },

    renderChecks() {
        const container = document.getElementById('depChecksContainer');
        if (!container) return;
        if (!this.depChecks.length) {
            container.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);margin:4px 0;">No checks added.</p>';
            return;
        }
        container.innerHTML = this.depChecks.map((c, i) =>
            `<div class="dep-calc-check-row">
                <input type="text" placeholder="Check #${i + 1} memo" value="${this.escHtml(c.memo)}" oninput="AccountingExport.updateCheck(${c.id},'memo',this.value)" style="flex:1.2;">
                <input type="number" placeholder="0.00" step="0.01" min="0" value="${c.amount || ''}" oninput="AccountingExport.updateCheck(${c.id},'amount',this.value)" style="width:100px;text-align:right;">
                <button type="button" class="dep-remove-check" onclick="AccountingExport.removeCheck(${c.id})" title="Remove">✕</button>
            </div>`
        ).join('');
    },

    clearCalc() {
        this.depDenoms.forEach(d => {
            const el = document.getElementById('depC' + d);
            if (el) el.value = 0;
        });
        const coins = document.getElementById('depCoins');
        if (coins) coins.value = 0;
        this.depChecks = [];
        this.renderChecks();
        this.calcDeposit();
    },

    // ═══════════════════════════════════════════
    //  HAWKSOFT EXPORT
    // ═══════════════════════════════════════════

    _isLocalServer() {
        return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    },

    async launch() {
        if (!this._isLocalServer()) {
            App.toast('HawkSoft Export requires the local desktop app (node server.js)', 'error');
            return;
        }

        const btn = document.getElementById('acctLaunchBtn');
        const statusBox = document.getElementById('acctStatusBox');
        const checkBtn = document.getElementById('acctCheckBtn');
        const outputFile = (document.getElementById('acctOutputFile')?.value || 'hawksoft_receipts.csv').trim();

        if (!outputFile) {
            App.toast('Enter an output filename', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Launching...';
        statusBox.textContent = '🔄 Starting export process...';
        this.setStep(1, 'active');

        try {
            const res = await fetch('/local/hawksoft-export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ output: outputFile })
            });
            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to launch export');
            }

            this.currentFile = data.outputFile;
            statusBox.textContent = '✅ Browser launched! Check your taskbar for the Chromium window.\n\n' +
                  '👉 Log in to HawkSoft, then press Enter in the terminal window.\n\n' +
                  'The script will auto-filter receipts and download the CSV.';
            this.setStep(1, 'done');
            this.setStep(2, 'active');

            btn.textContent = '✅ Launched';
            checkBtn.style.display = '';

            this.startPolling(data.outputFile);
            this.addHistory(outputFile, 'running');
            App.toast('Browser launched — check your taskbar', 'success');

        } catch (err) {
            statusBox.textContent = '❌ Error: ' + err.message;
            this.setStep(1, '');
            App.toast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = '🚀 Launch Export';
        }
    },

    startPolling(file) {
        if (this.pollTimer) clearInterval(this.pollTimer);
        let checks = 0;
        this.pollTimer = setInterval(async () => {
            checks++;
            try {
                const res = await fetch(`/local/hawksoft-export/status?file=${encodeURIComponent(file)}`);
                const data = await res.json();
                if (data.exists && data.size > 0) {
                    clearInterval(this.pollTimer);
                    this.pollTimer = null;
                    this.onComplete(file, data.size);
                }
            } catch (e) { /* ignore polling errors */ }
            if (checks > 120) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
        }, 5000);
    },

    async checkStatus() {
        if (!this.currentFile) return;
        try {
            const res = await fetch(`/local/hawksoft-export/status?file=${encodeURIComponent(this.currentFile)}`);
            const data = await res.json();
            const statusBox = document.getElementById('acctStatusBox');
            if (data.exists && data.size > 0) {
                this.onComplete(this.currentFile, data.size);
            } else {
                statusBox.textContent += '\n🔍 File not ready yet — the script may still be waiting for your login.';
                App.toast('Still in progress...');
            }
        } catch (e) {
            App.toast('Could not check status', 'error');
        }
    },

    onComplete(file, size) {
        const statusBox = document.getElementById('acctStatusBox');
        const btn = document.getElementById('acctLaunchBtn');
        const checkBtn = document.getElementById('acctCheckBtn');
        const kb = (size / 1024).toFixed(1);

        this.setStep(2, 'done');
        this.setStep(3, 'done');
        this.setStep(4, 'done');

        statusBox.textContent = `✅ Export complete!\n\n📄 File: ${file}\n📊 Size: ${kb} KB\n\nThe CSV has been saved to your Altech project folder.`;

        btn.disabled = false;
        btn.textContent = '🚀 Launch Export';
        checkBtn.style.display = 'none';

        this.updateHistory(file, 'success');
        App.toast('Export complete — ' + file, 'success');
    },

    setStep(num, state) {
        const el = document.getElementById('acctStep' + num);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (state) el.classList.add(state);
    },

    // ── History ──

    getHistory() {
        return Utils.tryParseLS('altech_acct_history', []);
    },

    saveHistory(history) {
        try {
            localStorage.setItem('altech_acct_history', JSON.stringify(history.slice(0, 50)));
        } catch (e) { /* quota */ }
    },

    addHistory(file, status) {
        const history = this.getHistory();
        history.unshift({ file, status, ts: new Date().toISOString() });
        this.saveHistory(history);
        this.renderHistory();
    },

    updateHistory(file, status) {
        const history = this.getHistory();
        const entry = history.find(h => h.file === file && h.status === 'running');
        if (entry) {
            entry.status = status;
            entry.completedAt = new Date().toISOString();
        }
        this.saveHistory(history);
        this.renderHistory();
    },

    renderHistory() {
        const el = document.getElementById('acctHistory');
        if (!el) return;
        const history = this.getHistory();
        if (!history.length) {
            el.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);">No exports yet.</p>';
            return;
        }
        el.innerHTML = history.slice(0, 20).map(h => {
            const d = new Date(h.ts);
            const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const badge = h.status === 'success' ? '<span class="acct-badge success">✓ Done</span>'
                : h.status === 'running' ? '<span class="acct-badge running">⏳ Running</span>'
                : '<span class="acct-badge error">✗ Error</span>';
            return `<div class="acct-history-item">
                <div>
                    <div style="font-weight:600;">${this.escHtml(h.file)}</div>
                    <div style="font-size:11px;color:var(--text-secondary);">${dateStr}</div>
                </div>
                ${badge}
            </div>`;
        }).join('');
    },

    escHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML.replace(/"/g, '&quot;');
    },

    async generateReport() {
        const btn = document.getElementById('acctReportBtn');
        const status = document.getElementById('acctReportStatus');
        const log = document.getElementById('acctReportLog');
        const inputFile = (document.getElementById('acctReportInput')?.value || 'hawksoft_receipts.csv').trim();
        const outputFile = (document.getElementById('acctReportOutput')?.value || 'Trust_Deposit_Report.xlsx').trim();

        if (!inputFile || !outputFile) {
            App.toast('Enter both input and output filenames', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Generating...';
        status.textContent = '';
        log.textContent = '🔄 Running Trust Accountant...';

        if (!this._isLocalServer()) {
            App.toast('Trust Report requires the local desktop app (node server.js)', 'error');
            btn.disabled = false;
            btn.textContent = '📊 Generate Report';
            return;
        }

        try {
            const res = await fetch('/local/trust-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: inputFile, output: outputFile })
            });
            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Report generation failed');
            }

            const kb = (data.size / 1024).toFixed(1);
            log.textContent = `✅ Report generated!\n\n📄 File: ${data.output}\n📊 Size: ${kb} KB\n\n${data.log || ''}`;
            status.textContent = '✅ Done';
            status.style.color = '#34c759';
            App.toast('Trust report generated — ' + data.output, 'success');

            this.addHistory(data.output, 'success');

        } catch (err) {
            log.textContent = '❌ Error: ' + err.message;
            status.textContent = '❌ Failed';
            status.style.color = '#ff3b30';
            App.toast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '📊 Generate Report';
        }
    }
};

window.AccountingExport = AccountingExport;
