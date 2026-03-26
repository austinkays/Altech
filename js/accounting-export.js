// AccountingExport — PIN-protected vault + Deposit Sheet
// Storage: altech_acct_vault_v2 (encrypted), altech_acct_vault_meta (PIN hash+salt)
// All sensitive data encrypted with AES-256-GCM via CryptoHelper, per-user via Firestore.

const AccountingExport = {
    initialized: false,

    // ── Vault State ──
    _VAULT_KEY: 'altech_acct_vault_v2',
    _META_KEY: 'altech_acct_vault_meta',
    _OLD_VAULT_KEY: 'altech_acct_vault',
    _unlocked: false,
    _vaultData: null, // { accounts: [...] }
    _failedAttempts: 0,
    _lockoutUntil: 0,
    _editingIdx: -1,

    // ── Deposit Sheet State ──
    _dsRows: [],
    _dsFilename: '',

    // ── Deposit Sheet Constants ──
    _KEEP_COLS: [
        'item #', 'item date', 'cust id', 'name', 'line item', 'payee',
        'invoiced', 'tendered', 'credit used', 'change',
        'disbursement', 'non-fiduciary', 'memo', 'teller', 'pay method'
    ],
    _METHOD_LABELS: {
        'check': 'Check', 'cash': 'Cash', 'credit card': 'Credit Card',
        'ach': 'ACH', 'eft': 'EFT', 'money order': 'Money Order',
        'agency sweep': 'Agency Sweep', 'online payment': 'Online Payment'
    },
    _MONEY_COLS: new Set([
        'invoiced', 'tendered', 'credit used', 'change',
        'disbursement', 'non-fiduciary'
    ]),

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this._migrateV1();
        this._resolveVaultScreen();
        this._wireDepositEvents();
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
        this._dsReset();
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

    // ═══════════════════════════════════════════
    //  SECTION TOGGLE
    // ═══════════════════════════════════════════

    toggleSection(section) {
        const bodyId = section === 'info' ? 'acctInfoBody' : 'acctDepositBody';
        const chevronId = section === 'info' ? 'acctInfoChevron' : 'acctDepositChevron';
        const body = document.getElementById(bodyId);
        const chevron = document.getElementById(chevronId);
        if (!body) return;
        const collapsed = body.classList.toggle('collapsed');
        if (chevron) chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
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
            if (localStorage.getItem(this._VAULT_KEY)) {
                localStorage.removeItem(this._OLD_VAULT_KEY);
                return;
            }
            const data = JSON.parse(old);
            if (!data || typeof data !== 'object') return;
            const fields = [];
            if (data.vaultHsUser) fields.push({ label: 'HawkSoft Username', value: data.vaultHsUser });
            if (data.vaultHsPass) fields.push({ label: 'HawkSoft Password', value: data.vaultHsPass });
            if (data.vaultBankName) fields.push({ label: 'Bank Name', value: data.vaultBankName });
            if (data.vaultAcctNum) fields.push({ label: 'Account Number', value: data.vaultAcctNum });
            if (data.vaultRouting) fields.push({ label: 'Routing Number', value: data.vaultRouting });
            if (data.vaultAcctType) fields.push({ label: 'Account Type', value: data.vaultAcctType });
            if (data.vaultNotes) fields.push({ label: 'Notes', value: data.vaultNotes });
            if (fields.length) {
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
        // Expand info section if collapsed
        const body = document.getElementById('acctInfoBody');
        if (body && body.classList.contains('collapsed')) this.toggleSection('info');
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

        // Update badge
        const badge = document.getElementById('acctCountBadge');
        if (badge) badge.textContent = this._vaultData.accounts.length;

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
        }).catch(() => {
            App.toast('Copy failed — click the value to reveal and copy manually', 'error');
        });
    },

    // ═══════════════════════════════════════════
    //  DEPOSIT SHEET
    // ═══════════════════════════════════════════

    _wireDepositEvents() {
        const dropZone  = document.getElementById('ds-drop-zone');
        const fileInput = document.getElementById('ds-file-input');
        const printBtn  = document.getElementById('ds-print-btn');
        const clearBtn  = document.getElementById('ds-clear-btn');

        if (dropZone) {
            dropZone.addEventListener('click', () => fileInput && fileInput.click());
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('ds-drop-active');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('ds-drop-active');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('ds-drop-active');
                const files = e.dataTransfer && e.dataTransfer.files;
                if (files && files[0]) this._dsHandleFile(files[0]);
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files[0]) this._dsHandleFile(fileInput.files[0]);
                fileInput.value = '';
            });
        }

        if (printBtn) {
            printBtn.addEventListener('click', () => window.print());
        }

        const pdfBtn = document.getElementById('ds-pdf-btn');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', () => this._dsExportPDF());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this._dsReset());
        }

        // Bill counter inputs
        document.addEventListener('input', (e) => {
            if (e.target && e.target.classList.contains('ds-bill-input')) {
                this._dsUpdateBillCounter();
            }
        });

        // Checkbox handling — select all & individual row checks
        document.addEventListener('change', (e) => {
            if (e.target && e.target.classList.contains('ds-check-all')) {
                const table = e.target.closest('.ds-table');
                if (table) {
                    table.querySelectorAll('.ds-row-check').forEach(cb => { cb.checked = e.target.checked; });
                }
                this._dsUpdateVerifiedCount();
            }
            if (e.target && e.target.classList.contains('ds-row-check')) {
                const table = e.target.closest('.ds-table');
                if (table) {
                    const all = table.querySelectorAll('.ds-row-check');
                    const checked = table.querySelectorAll('.ds-row-check:checked');
                    const selectAll = table.querySelector('.ds-check-all');
                    if (selectAll) selectAll.checked = all.length === checked.length;
                }
                this._dsUpdateVerifiedCount();
            }
        });
    },

    // ── File handling ──

    _dsHandleFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            this._dsShowError('Please upload a .csv file exported from HawkSoft.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this._dsParseAndRender(e.target.result, file.name);
            } catch (err) {
                this._dsShowError('Could not parse CSV: ' + err.message);
            }
        };
        reader.readAsText(file);
    },

    _dsParseCSV(text) {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const result = [];
        for (const line of lines) {
            if (!line.trim()) continue;
            const row = [];
            let inQuote = false;
            let cell = '';
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
                    else inQuote = !inQuote;
                } else if (ch === ',' && !inQuote) {
                    row.push(cell.trim());
                    cell = '';
                } else {
                    cell += ch;
                }
            }
            row.push(cell.trim());
            result.push(row);
        }
        return result;
    },

    _dsParseAndRender(text, filename) {
        this._dsHideError();
        const raw = this._dsParseCSV(text);
        if (!raw.length) { this._dsShowError('CSV appears to be empty.'); return; }

        const headers = raw[0].map(h => h.toLowerCase().trim());
        const itemTypeIdx = headers.indexOf('item type');
        if (itemTypeIdx === -1) {
            this._dsShowError('This doesn\'t look like a HawkSoft accounting export — "Item Type" column not found.');
            return;
        }

        const colMap = {};
        for (const col of this._KEEP_COLS) {
            const idx = headers.indexOf(col);
            if (idx !== -1) colMap[col] = idx;
        }

        const rows = [];
        for (let i = 1; i < raw.length; i++) {
            const row = raw[i];
            if (!row.length || row.every(c => !c)) continue;
            const itemType = itemTypeIdx !== -1 ? (row[itemTypeIdx] || '').toLowerCase().trim() : '';
            if (itemType !== 'receipt') continue;

            const obj = {};
            for (const [col, idx] of Object.entries(colMap)) {
                obj[col] = (row[idx] || '').trim();
            }
            rows.push(obj);
        }

        if (!rows.length) {
            this._dsShowError('No Receipt rows found. Make sure this is a HawkSoft "To Be Exported Items" CSV.');
            return;
        }

        this._dsRows = rows;
        this._dsRenderAll(filename);
    },

    // ── Render ──

    _dsRenderAll(filename) {
        this._dsFilename = filename || '';
        const dropZone  = document.getElementById('ds-drop-zone');
        const printBtn  = document.getElementById('ds-print-btn');
        const pdfBtn    = document.getElementById('ds-pdf-btn');
        const clearBtn  = document.getElementById('ds-clear-btn');
        const meta      = document.getElementById('ds-meta');
        const output    = document.getElementById('ds-output');
        const billBlock = document.getElementById('ds-bill-counter');

        if (dropZone) dropZone.style.display = 'none';
        if (printBtn) printBtn.style.display = 'inline-flex';
        if (pdfBtn)   pdfBtn.style.display = 'inline-flex';
        if (clearBtn) clearBtn.style.display = 'inline-flex';
        if (meta)     meta.style.display = 'block';

        // Group by pay method
        const groups = {};
        for (const row of this._dsRows) {
            const method = (row['pay method'] || 'Other').trim();
            if (!groups[method]) groups[method] = [];
            groups[method].push(row);
        }

        const methodOrder = (m) => {
            const l = m.toLowerCase();
            if (l === 'check') return '0';
            if (l === 'cash')  return '1';
            return '2' + l;
        };
        const sortedMethods = Object.keys(groups).sort((a, b) =>
            methodOrder(a).localeCompare(methodOrder(b))
        );

        // Totals
        const totals = { invoiced: 0, tendered: 0, disbursement: 0, 'non-fiduciary': 0 };
        for (const row of this._dsRows) {
            for (const key of Object.keys(totals)) {
                totals[key] += this._dsParseMoney(row[key]);
            }
        }

        const tellers = [...new Set(this._dsRows.map(r => (r['teller'] || '').trim()).filter(Boolean))];
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        meta.innerHTML = `
            <div class="ds-meta-row">
                <span class="ds-meta-title">Deposit Sheet</span>
                <span class="ds-meta-date">${dateStr}</span>
            </div>
            <div class="ds-meta-row ds-meta-sub-row">
                <span class="ds-meta-agency">Altech Insurance Agency</span>
                <span class="ds-meta-count">${this._dsRows.length} receipt${this._dsRows.length !== 1 ? 's' : ''} · <span id="ds-verified-count" class="ds-verified-count">0/${this._dsRows.length} verified</span></span>
            </div>
            <div class="ds-meta-totals">
                <div class="ds-meta-total-item">
                    <span class="ds-meta-total-label">Invoiced</span>
                    <span class="ds-meta-total-val">${this._dsFmt(totals.invoiced)}</span>
                </div>
                <div class="ds-meta-total-item">
                    <span class="ds-meta-total-label">Tendered</span>
                    <span class="ds-meta-total-val ds-meta-total-highlight">${this._dsFmt(totals.tendered)}</span>
                </div>
                <div class="ds-meta-total-item">
                    <span class="ds-meta-total-label">Disbursement</span>
                    <span class="ds-meta-total-val">${this._dsFmt(totals.disbursement)}</span>
                </div>
                <div class="ds-meta-total-item">
                    <span class="ds-meta-total-label">Non-Fiduciary</span>
                    <span class="ds-meta-total-val">${this._dsFmt(totals['non-fiduciary'])}</span>
                </div>
            </div>
            ${tellers.length ? `<div class="ds-meta-tellers">
                <span class="ds-meta-total-label">Tendered by</span>
                <span class="ds-meta-teller-list">${tellers.map(t => this.escHtml(t)).join(' · ')}</span>
            </div>` : ''}
        `;

        // Show bill counter if cash exists
        const hasCash = sortedMethods.some(m => m.toLowerCase() === 'cash');
        if (billBlock) billBlock.style.display = hasCash ? 'block' : 'none';

        // Render tables
        let html = '';
        for (const method of sortedMethods) {
            const rows = groups[method];
            const label = this._METHOD_LABELS[method.toLowerCase()] || method;
            const methodTotal = rows.reduce((s, r) => s + this._dsParseMoney(r['tendered']), 0);

            html += `<div class="ds-group">`;
            html += `<div class="ds-group-header">
                <span class="ds-group-label">${this.escHtml(label)}</span>
                <span class="ds-group-total">${this._dsFmt(methodTotal)}</span>
            </div>`;
            html += this._dsRenderTable(rows);
            html += `</div>`;
        }

        html += `<div class="ds-receipt-tape">
            <div class="ds-receipt-tape-label">Bank Deposit Receipt</div>
            <div class="ds-receipt-tape-area">
                <span class="ds-receipt-tape-hint no-print">Tape bank receipt here after printing</span>
            </div>
        </div>`;

        output.innerHTML = html;
    },

    _dsRenderTable(rows) {
        const rawCols = this._KEEP_COLS.filter(c => c !== 'pay method' && c !== 'teller' && rows.some(r => r[c]));
        const visibleCols = rawCols.filter(c => {
            if (this._MONEY_COLS.has(c)) return rows.some(r => this._dsParseMoney(r[c]) !== 0);
            return true;
        });

        const mergeDate = visibleCols.includes('item #') && visibleCols.includes('item date');
        const mergeId   = visibleCols.includes('name')   && visibleCols.includes('cust id');
        const columns = visibleCols.filter(c => {
            if (c === 'item date' && mergeDate) return false;
            if (c === 'cust id'   && mergeId)   return false;
            return true;
        });

        const colLabels = {
            'item #': mergeDate ? 'Receipt' : 'Rcpt #', 'item date': 'Date',
            'cust id': 'ID', 'name': 'Client', 'line item': 'Line Item',
            'payee': 'Payee', 'invoiced': 'Invoiced', 'tendered': 'Tendered',
            'credit used': 'Cr. Used', 'change': 'Change', 'disbursement': 'Disb.',
            'non-fiduciary': 'Non-Fid.', 'memo': 'Memo', 'teller': 'Agent'
        };

        let html = `<table class="ds-table"><thead><tr>`;
        html += `<th class="ds-check-col no-print"><input type="checkbox" class="ds-check-all" title="Select all"></th>`;
        for (const col of columns) {
            const cls = this._MONEY_COLS.has(col) ? ' class="ds-th-money"' : '';
            html += `<th${cls}>${colLabels[col] || col}</th>`;
        }
        html += `</tr></thead><tbody>`;

        for (const row of rows) {
            html += `<tr>`;
            html += `<td class="ds-check-col no-print"><input type="checkbox" class="ds-row-check"></td>`;
            for (const col of columns) {
                if (this._MONEY_COLS.has(col)) {
                    const num = this._dsParseMoney(row[col]);
                    const cls = num === 0 ? ' class="ds-td-money ds-money-zero"' : ' class="ds-td-money"';
                    html += `<td${cls}>${num === 0 ? '\u2014' : this._dsFmt(num)}</td>`;
                } else if (col === 'item #' && mergeDate) {
                    const n = this.escHtml(row['item #'] || '');
                    const d = this.escHtml(row['item date'] || '');
                    html += `<td class="ds-td-receipt">${n}${d ? '<span class="ds-receipt-date">' + d + '</span>' : ''}</td>`;
                } else if (col === 'name') {
                    const nm = this.escHtml(row['name'] || '');
                    const id = mergeId ? this.escHtml(row['cust id'] || '') : '';
                    const teller = this.escHtml(row['teller'] || '');
                    html += `<td class="ds-td-client">${nm}${id ? '<span class="ds-client-id">#' + id + '</span>' : ''}${teller ? '<span class="ds-client-teller">' + teller + '</span>' : ''}</td>`;
                } else if (col === 'memo') {
                    html += `<td class="ds-td-memo">${this.escHtml(row[col] || '')}</td>`;
                } else {
                    html += `<td>${this.escHtml(row[col] || '')}</td>`;
                }
            }
            html += `</tr>`;
        }

        html += `</tbody><tfoot><tr class="ds-subtotal-row">`;
        html += `<td class="ds-check-col no-print"></td>`;
        for (const col of columns) {
            if (this._MONEY_COLS.has(col)) {
                const v = rows.reduce((s, r) => s + this._dsParseMoney(r[col]), 0);
                html += `<td class="ds-td-money ds-subtotal-val">${v === 0 ? '\u2014' : this._dsFmt(v)}</td>`;
            } else if (col === 'name') {
                html += `<td class="ds-subtotal-label">Subtotal</td>`;
            } else {
                html += `<td></td>`;
            }
        }
        html += `</tr></tfoot></table>`;
        return html;
    },

    // ── Bill counter ──

    _dsUpdateBillCounter() {
        const inputs = document.querySelectorAll('input.ds-bill-input');
        let grand = 0;
        inputs.forEach(input => {
            const denom = parseInt(input.dataset.denom, 10);
            const count = parseInt(input.value, 10) || 0;
            const total = denom * count;
            grand += total;
            const el = document.getElementById(`ds-bill-${denom}`);
            if (el) el.textContent = count > 0 ? this._dsFmt(total) : '—';
            const countEl = document.getElementById(`ds-bill-count-${denom}`);
            if (countEl) countEl.textContent = count;
        });
        const grandEl = document.getElementById('ds-bill-counted');
        if (grandEl) grandEl.textContent = this._dsFmt(grand);
    },

    _dsUpdateVerifiedCount() {
        const total = document.querySelectorAll('.ds-row-check').length;
        const checked = document.querySelectorAll('.ds-row-check:checked').length;
        const el = document.getElementById('ds-verified-count');
        if (el) {
            el.textContent = checked + '/' + total + ' verified';
            el.classList.toggle('ds-all-verified', checked === total && total > 0);
        }
    },

    // ── Helpers ──

    _dsParseMoney(str) {
        if (!str) return 0;
        const n = parseFloat(str.replace(/[$,]/g, ''));
        return isNaN(n) ? 0 : n;
    },

    _dsFmt(n) {
        return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    },

    _dsShowError(msg) {
        const el = document.getElementById('ds-error');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    },

    _dsHideError() {
        const el = document.getElementById('ds-error');
        if (el) el.style.display = 'none';
    },

    _dsReset() {
        this._dsRows = [];
        this._dsFilename = '';
        const dropZone  = document.getElementById('ds-drop-zone');
        const printBtn  = document.getElementById('ds-print-btn');
        const pdfBtn    = document.getElementById('ds-pdf-btn');
        const clearBtn  = document.getElementById('ds-clear-btn');
        const meta      = document.getElementById('ds-meta');
        const output    = document.getElementById('ds-output');
        const billBlock = document.getElementById('ds-bill-counter');

        if (dropZone)  { dropZone.style.display = ''; }
        if (printBtn)  printBtn.style.display = 'none';
        if (pdfBtn)    pdfBtn.style.display = 'none';
        if (clearBtn)  clearBtn.style.display = 'none';
        if (meta)      { meta.style.display = 'none'; meta.innerHTML = ''; }
        if (output)    output.innerHTML = '';
        if (billBlock) billBlock.style.display = 'none';

        document.querySelectorAll('input.ds-bill-input').forEach(i => { i.value = 0; });
        this._dsUpdateBillCounter();
        this._dsHideError();
    },

    // ── PDF Export ──

    async _dsExportPDF() {
        if (!this._dsRows.length) return;

        if (typeof window.jspdf === 'undefined') {
            try {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'lib/jspdf.umd.min.js';
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            } catch {
                App.toast('Failed to load PDF library', 'error');
                return;
            }
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const mg = 10;
        const cw = pageW - mg * 2;
        let y = mg;

        const INK   = [30, 30, 30];
        const MID   = [80, 80, 80];
        const LIGHT = [170, 170, 170];
        const FILL  = [242, 242, 242];
        const HFILL = [230, 230, 230];

        const addPage = () => { doc.addPage(); y = mg; };
        const need = (h) => { if (y + h > pageH - 14) { addPage(); return true; } return false; };

        // Header
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.setTextColor(...INK);
        doc.text('Deposit Sheet', mg, y + 5);
        doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(...MID);
        doc.text(dateStr, pageW - mg, y + 5, { align: 'right' });
        y += 7;

        doc.setFontSize(8);
        doc.text('Altech Insurance Agency', mg, y + 3);
        const tellers = [...new Set(this._dsRows.map(r => (r['teller'] || '').trim()).filter(Boolean))];
        if (tellers.length) doc.text('Tendered by: ' + tellers.join(', '), mg + 50, y + 3);
        doc.text(this._dsRows.length + ' receipt' + (this._dsRows.length !== 1 ? 's' : ''), pageW - mg, y + 3, { align: 'right' });
        y += 6;

        // Summary totals bar
        const totals = { invoiced: 0, tendered: 0, disbursement: 0, 'non-fiduciary': 0 };
        for (const row of this._dsRows) {
            for (const key of Object.keys(totals)) totals[key] += this._dsParseMoney(row[key]);
        }

        doc.setFillColor(...FILL);
        doc.rect(mg, y, cw, 7, 'F');
        doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...MID);
        const summaryItems = [
            ['Invoiced', this._dsFmt(totals.invoiced)], ['Tendered', this._dsFmt(totals.tendered)],
            ['Disbursement', this._dsFmt(totals.disbursement)], ['Non-Fiduciary', this._dsFmt(totals['non-fiduciary'])]
        ];
        let sx = mg + 3;
        for (const [label, val] of summaryItems) {
            doc.setFont(undefined, 'normal'); doc.setTextColor(...MID);
            doc.text(label + ':', sx, y + 4.5);
            const lw = doc.getTextWidth(label + ': ');
            doc.setFont(undefined, 'bold'); doc.setTextColor(...INK);
            doc.text(val, sx + lw, y + 4.5);
            sx += lw + doc.getTextWidth(val) + 12;
        }
        y += 10;

        // Group by pay method
        const groups = {};
        for (const row of this._dsRows) {
            const method = (row['pay method'] || 'Other').trim();
            if (!groups[method]) groups[method] = [];
            groups[method].push(row);
        }
        const methodOrder = (m) => { const l = m.toLowerCase(); if (l === 'check') return '0'; if (l === 'cash') return '1'; return '2' + l; };
        const sortedMethods = Object.keys(groups).sort((a, b) => methodOrder(a).localeCompare(methodOrder(b)));

        // Column definitions
        const hasDisb = this._dsRows.some(r => this._dsParseMoney(r['disbursement']) !== 0);
        const hasNonFid = this._dsRows.some(r => this._dsParseMoney(r['non-fiduciary']) !== 0);
        const hasCrUsed = this._dsRows.some(r => this._dsParseMoney(r['credit used']) !== 0);
        const hasChange = this._dsRows.some(r => this._dsParseMoney(r['change']) !== 0);
        const hasMemo = this._dsRows.some(r => (r['memo'] || '').trim());

        const cols = [];
        cols.push({ key: 'item #', label: 'Rcpt', width: 14, align: 'left' });
        cols.push({ key: 'item date', label: 'Date', width: 18, align: 'left' });
        cols.push({ key: 'name', label: 'Client', width: 0, align: 'left' });
        cols.push({ key: 'teller', label: 'Agent', width: 22, align: 'left' });
        cols.push({ key: 'invoiced', label: 'Invoiced', width: 22, align: 'right', money: true });
        cols.push({ key: 'tendered', label: 'Tendered', width: 22, align: 'right', money: true });
        if (hasCrUsed) cols.push({ key: 'credit used', label: 'Cr. Used', width: 18, align: 'right', money: true });
        if (hasChange) cols.push({ key: 'change', label: 'Change', width: 18, align: 'right', money: true });
        if (hasDisb) cols.push({ key: 'disbursement', label: 'Disb.', width: 20, align: 'right', money: true });
        if (hasNonFid) cols.push({ key: 'non-fiduciary', label: 'Non-Fid.', width: 20, align: 'right', money: true });
        if (hasMemo) cols.push({ key: 'memo', label: 'Memo', width: 35, align: 'left' });

        const fixedW = cols.reduce((s, c) => s + (c.key === 'name' ? 0 : c.width), 0);
        const nameCol = cols.find(c => c.key === 'name');
        if (nameCol) nameCol.width = Math.max(30, cw - fixedW);

        const rowH = 5.5;
        const headerH = 6;

        const _drawTableHeader = () => {
            doc.setFillColor(...HFILL);
            doc.rect(mg, y, cw, headerH, 'F');
            doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...MID);
            let cx = mg + 1.5;
            for (const col of cols) {
                if (col.align === 'right') doc.text(col.label, cx + col.width - 1.5, y + 4, { align: 'right' });
                else doc.text(col.label, cx, y + 4);
                cx += col.width;
            }
            y += headerH;
        };

        const _drawRow = (row, isAlt) => {
            if (isAlt) { doc.setFillColor(248, 248, 248); doc.rect(mg, y, cw, rowH, 'F'); }
            doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
            let cx = mg + 1.5;
            for (const col of cols) {
                if (col.money) {
                    const v = this._dsParseMoney(row[col.key]);
                    doc.setTextColor(v === 0 ? 170 : 30, v === 0 ? 170 : 30, v === 0 ? 170 : 30);
                    doc.text(v === 0 ? '\u2014' : this._dsFmt(v), cx + col.width - 1.5, y + 3.8, { align: 'right' });
                } else if (col.key === 'name') {
                    doc.setTextColor(...INK);
                    const nm = (row['name'] || '').trim();
                    const id = (row['cust id'] || '').trim();
                    doc.text((nm + (id ? '  #' + id : '')).substring(0, 45), cx, y + 3.8);
                } else if (col.key === 'memo') {
                    doc.setTextColor(...MID); doc.setFontSize(6.5);
                    doc.text((row['memo'] || '').trim().substring(0, 50), cx, y + 3.8);
                    doc.setFontSize(7.5);
                } else {
                    doc.setTextColor(...INK);
                    doc.text(String(row[col.key] || '').trim().substring(0, 30), cx, y + 3.8);
                }
                cx += col.width;
            }
            y += rowH;
        };

        // Render groups
        for (const method of sortedMethods) {
            const gRows = groups[method];
            const label = this._METHOD_LABELS[method.toLowerCase()] || method;
            const methodTotal = gRows.reduce((s, r) => s + this._dsParseMoney(r['tendered']), 0);

            need(headerH + rowH * 3 + 6);

            doc.setFillColor(60, 60, 60); doc.rect(mg, y, cw, 5.5, 'F');
            doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
            doc.text(label.toUpperCase(), mg + 2, y + 3.8);
            doc.text(this._dsFmt(methodTotal), pageW - mg - 2, y + 3.8, { align: 'right' });
            y += 6.5;

            _drawTableHeader();

            for (let i = 0; i < gRows.length; i++) {
                if (need(rowH + 6)) {
                    doc.setFillColor(60, 60, 60); doc.rect(mg, y, cw, 5.5, 'F');
                    doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
                    doc.text(label.toUpperCase() + ' (cont.)', mg + 2, y + 3.8);
                    y += 6.5;
                    _drawTableHeader();
                }
                _drawRow(gRows[i], i % 2 === 1);
            }

            // Subtotal
            doc.setDrawColor(...LIGHT); doc.line(mg, y, pageW - mg, y); y += 0.5;
            doc.setFillColor(...FILL); doc.rect(mg, y, cw, rowH, 'F');
            doc.setFontSize(7); doc.setFont(undefined, 'bold');
            let cx = mg + 1.5;
            for (const col of cols) {
                if (col.money) {
                    const v = gRows.reduce((s, r) => s + this._dsParseMoney(r[col.key]), 0);
                    doc.setTextColor(...INK);
                    doc.text(v === 0 ? '\u2014' : this._dsFmt(v), cx + col.width - 1.5, y + 3.8, { align: 'right' });
                } else if (col.key === 'name') {
                    doc.setTextColor(...MID); doc.setFontSize(6);
                    doc.text('SUBTOTAL', cx, y + 3.8); doc.setFontSize(7);
                }
                cx += col.width;
            }
            y += rowH + 4;
        }

        // Bill counter
        const billInputs = document.querySelectorAll('input.ds-bill-input');
        let billTotal = 0;
        const bills = [];
        billInputs.forEach(input => {
            const denom = parseInt(input.dataset.denom, 10);
            const count = parseInt(input.value, 10) || 0;
            if (count > 0) { bills.push({ denom, count, total: denom * count }); billTotal += denom * count; }
        });

        if (bills.length) {
            need(20 + bills.length * 4);
            doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...MID);
            doc.text('CASH COUNTER', mg, y + 3); y += 5;
            doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
            for (const b of bills) {
                doc.setTextColor(...INK); doc.text('$' + b.denom, mg + 2, y + 3);
                doc.setTextColor(...MID); doc.text('\u00d7 ' + b.count, mg + 16, y + 3);
                doc.setTextColor(...INK); doc.text('= ' + this._dsFmt(b.total), mg + 30, y + 3);
                y += 4;
            }
            doc.setFont(undefined, 'bold'); doc.setDrawColor(...LIGHT);
            doc.line(mg, y, mg + 50, y); y += 1;
            doc.text('Counted: ' + this._dsFmt(billTotal), mg + 2, y + 3.5); y += 8;
        }

        // Receipt tape area
        need(140);
        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
        const tapeW = 127, tapeH = 102;
        doc.rect(mg, y, tapeW, tapeH);
        doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...MID);
        doc.text('BANK DEPOSIT RECEIPT', mg + 2, y + 4);
        doc.setFontSize(6); doc.setFont(undefined, 'normal'); doc.setTextColor(...LIGHT);
        doc.text('Tape receipt here', mg + tapeW / 2, y + tapeH / 2, { align: 'center' });

        const fname = 'Deposit_Sheet_' + new Date().toISOString().slice(0, 10) + '.pdf';
        doc.save(fname);
        App.toast('\u2714 PDF downloaded');
    },

    // ═══════════════════════════════════════════
    //  SHARED UTILITIES
    // ═══════════════════════════════════════════

    escHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML.replace(/"/g, '&quot;');
    }
};

window.AccountingExport = AccountingExport;
