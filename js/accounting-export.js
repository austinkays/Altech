// AccountingExport - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

const AccountingExport = {
    initialized: false,
    currentFile: null,
    pollTimer: null,

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.renderHistory();
        this.loadVault();
    },

    // ── Account Info Vault ──
    vaultKeys: ['vaultHsUser','vaultHsPass','vaultBankName','vaultAcctNum','vaultRouting','vaultAcctType','vaultNotes'],
    vaultStorageKey: 'altech_acct_vault',

    toggleVault() {
        const toggle = document.getElementById('acctVaultToggle');
        const body = document.getElementById('acctVaultBody');
        if (!toggle || !body) return;
        const isOpen = toggle.classList.toggle('open');
        body.classList.toggle('open', isOpen);
    },

    togglePw(fieldId, btn) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        const show = field.type === 'password';
        field.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
    },

    saveVault() {
        const data = {};
        this.vaultKeys.forEach(k => {
            const el = document.getElementById(k);
            if (el) data[k] = el.value;
        });
        try {
            localStorage.setItem(this.vaultStorageKey, JSON.stringify(data));
        } catch (e) { /* quota */ }
    },

    loadVault() {
        try {
            const raw = localStorage.getItem(this.vaultStorageKey);
            if (!raw) return;
            const data = JSON.parse(raw);
            this.vaultKeys.forEach(k => {
                const el = document.getElementById(k);
                if (el && data[k]) el.value = data[k];
            });
        } catch (e) { /* corrupt */ }
    },

    // ── Deposit Calculator ──
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

    _isLocalServer() {
        return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    },

    async launch() {
        if (!this._isLocalServer()) {
            App.toast('⚠️ HawkSoft Export requires the local desktop app (node server.js)');
            return;
        }

        const btn = document.getElementById('acctLaunchBtn');
        const statusBox = document.getElementById('acctStatusBox');
        const checkBtn = document.getElementById('acctCheckBtn');
        const outputFile = (document.getElementById('acctOutputFile')?.value || 'hawksoft_receipts.csv').trim();

        if (!outputFile) {
            App.toast('⚠️ Enter an output filename');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Launching...';
        statusBox.textContent = '🔄 Starting export process...';
        this.setStep(1, 'active');

        // Pull credentials from vault if available
        const vaultUser = document.getElementById('vaultHsUser')?.value?.trim() || '';
        const vaultPass = document.getElementById('vaultHsPass')?.value || '';

        try {
            const res = await fetch('/local/hawksoft-export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ output: outputFile, username: vaultUser, password: vaultPass })
            });
            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to launch export');
            }

            this.currentFile = data.outputFile;
            const loginMsg = vaultUser
                ? '✅ Browser launched with auto-login!\n\n' +
                  '👉 If 2FA is required, complete it in the browser, then press Enter in the terminal.\n\n' +
                  'The script will auto-filter receipts and download the CSV.'
                : '✅ Browser launched! Check your taskbar for the Chromium window.\n\n' +
                  '👉 Log in to HawkSoft, then press Enter in the terminal window.\n\n' +
                  'The script will auto-filter receipts and download the CSV.';
            statusBox.textContent = loginMsg;
            this.setStep(1, 'done');
            this.setStep(2, 'active');

            btn.textContent = '✅ Launched';
            checkBtn.style.display = '';

            // Start polling for the output file
            this.startPolling(data.outputFile);

            // Log to history
            this.addHistory(outputFile, 'running');
            App.toast('🚀 Browser launched — check your taskbar');

        } catch (err) {
            statusBox.textContent = '❌ Error: ' + err.message;
            this.setStep(1, '');
            App.toast('❌ ' + err.message);
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
            // Stop polling after 10 minutes
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
                App.toast('⏳ Still in progress...');
            }
        } catch (e) {
            App.toast('⚠️ Could not check status');
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

        // Update history
        this.updateHistory(file, 'success');
        App.toast('✅ Export complete — ' + file);
    },

    setStep(num, state) {
        const el = document.getElementById('acctStep' + num);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (state) el.classList.add(state);
    },

    // ── History ──

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem('altech_acct_history') || '[]');
        } catch { return []; }
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
        return d.innerHTML;
    },

    async generateReport() {
        const btn = document.getElementById('acctReportBtn');
        const status = document.getElementById('acctReportStatus');
        const log = document.getElementById('acctReportLog');
        const inputFile = (document.getElementById('acctReportInput')?.value || 'hawksoft_receipts.csv').trim();
        const outputFile = (document.getElementById('acctReportOutput')?.value || 'Trust_Deposit_Report.xlsx').trim();

        if (!inputFile || !outputFile) {
            App.toast('⚠️ Enter both input and output filenames');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Generating...';
        status.textContent = '';
        log.textContent = '🔄 Running Trust Accountant...';

        if (!this._isLocalServer()) {
            App.toast('⚠️ Trust Report requires the local desktop app (node server.js)');
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
            App.toast('📊 Trust report generated — ' + data.output);

            this.addHistory(data.output, 'success');

        } catch (err) {
            log.textContent = '❌ Error: ' + err.message;
            status.textContent = '❌ Failed';
            status.style.color = '#ff3b30';
            App.toast('❌ ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '📊 Generate Report';
        }
    }
};

window.AccountingExport = AccountingExport;
