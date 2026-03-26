/**
 * Deposit Sheet — HawkSoft "To Be Exported" CSV Viewer
 * Parses HawkSoft accounting export CSV, strips Invoice rows,
 * renders a clean printable deposit sheet grouped by pay method,
 * with a cash bill counter for physical deposit prep.
 * Ephemeral display-only — no persistence, no cloud sync.
 */
window.DepositSheetModule = (() => {
    'use strict';

    /* ── Columns to keep (lowercase CSV header match) ────── */
    const KEEP_COLS = [
        'item #',
        'item date',
        'cust id',
        'name',
        'line item',
        'payee',
        'invoiced',
        'tendered',
        'credit used',
        'change',
        'disbursement',
        'non-fiduciary',
        'memo',
        'teller',       // transaction agent (who processed the receipt)
        'pay method'
    ];

    /* ── Pay method display labels ──────────────────────── */
    const METHOD_LABELS = {
        'check':          'Check',
        'cash':           'Cash',
        'credit card':    'Credit Card',
        'ach':            'ACH',
        'eft':            'EFT',
        'money order':    'Money Order',
        'agency sweep':   'Agency Sweep',
        'online payment': 'Online Payment'
    };

    /* ── Money columns (right-align + format) ───────────── */
    const MONEY_COLS = new Set([
        'invoiced', 'tendered', 'credit used', 'change',
        'disbursement', 'non-fiduciary'
    ]);

    let _rows = [];

    /* ═══════════════════════════════════════════════════════
       PUBLIC
       ═══════════════════════════════════════════════════════ */

    function init() {
        _wireEvents();
    }

    function render() { /* no-op */ }

    /* ═══════════════════════════════════════════════════════
       EVENT WIRING
       ═══════════════════════════════════════════════════════ */

    function _wireEvents() {
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
                if (files && files[0]) _handleFile(files[0]);
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files[0]) _handleFile(fileInput.files[0]);
                fileInput.value = '';
            });
        }

        if (printBtn) {
            printBtn.addEventListener('click', () => window.print());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', _reset);
        }

        // Bill counter inputs
        document.addEventListener('input', (e) => {
            if (e.target && e.target.classList.contains('ds-bill-input')) {
                _updateBillCounter();
            }
        });

        // Checkbox handling — select all & individual row checks
        document.addEventListener('change', (e) => {
            if (e.target && e.target.classList.contains('ds-check-all')) {
                const table = e.target.closest('.ds-table');
                if (table) {
                    table.querySelectorAll('.ds-row-check').forEach(cb => { cb.checked = e.target.checked; });
                }
                _updateVerifiedCount();
            }
            if (e.target && e.target.classList.contains('ds-row-check')) {
                const table = e.target.closest('.ds-table');
                if (table) {
                    const all = table.querySelectorAll('.ds-row-check');
                    const checked = table.querySelectorAll('.ds-row-check:checked');
                    const selectAll = table.querySelector('.ds-check-all');
                    if (selectAll) selectAll.checked = all.length === checked.length;
                }
                _updateVerifiedCount();
            }
        });
    }

    /* ═══════════════════════════════════════════════════════
       FILE HANDLING
       ═══════════════════════════════════════════════════════ */

    function _handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            _showError('Please upload a .csv file exported from HawkSoft.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                _parseAndRender(e.target.result, file.name);
            } catch (err) {
                _showError('Could not parse CSV: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    function _parseCSV(text) {
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
    }

    function _parseAndRender(text, filename) {
        _hideError();
        const raw = _parseCSV(text);
        if (!raw.length) { _showError('CSV appears to be empty.'); return; }

        const headers = raw[0].map(h => h.toLowerCase().trim());

        // Detect required columns
        const itemTypeIdx = headers.indexOf('item type');
        if (itemTypeIdx === -1) {
            _showError('This doesn\'t look like a HawkSoft accounting export — "Item Type" column not found.');
            return;
        }

        // Build column index map for kept columns
        const colMap = {}; // col label → index
        for (const col of KEEP_COLS) {
            const idx = headers.indexOf(col);
            if (idx !== -1) colMap[col] = idx;
        }

        // Parse rows — Receipts only
        const rows = [];
        for (let i = 1; i < raw.length; i++) {
            const row = raw[i];
            if (!row.length || row.every(c => !c)) continue;
            const itemType = itemTypeIdx !== -1 ? (row[itemTypeIdx] || '').toLowerCase().trim() : '';
            if (itemType !== 'receipt') continue; // drop invoices

            const obj = {};
            for (const [col, idx] of Object.entries(colMap)) {
                obj[col] = (row[idx] || '').trim();
            }
            rows.push(obj);
        }

        if (!rows.length) {
            _showError('No Receipt rows found. Make sure this is a HawkSoft "To Be Exported Items" CSV.');
            return;
        }

        _rows = rows;
        _renderAll(filename);
    }

    /* ═══════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════ */

    function _renderAll(filename) {
        const dropZone  = document.getElementById('ds-drop-zone');
        const printBtn  = document.getElementById('ds-print-btn');
        const clearBtn  = document.getElementById('ds-clear-btn');
        const meta      = document.getElementById('ds-meta');
        const output    = document.getElementById('ds-output');
        const billBlock = document.getElementById('ds-bill-counter');

        if (dropZone) dropZone.style.display = 'none';
        if (printBtn) printBtn.style.display = 'inline-flex';
        if (clearBtn) clearBtn.style.display = 'inline-flex';
        if (meta)     meta.style.display = 'block';

        // Group by pay method
        const groups = {};
        for (const row of _rows) {
            const method = (row['pay method'] || 'Other').trim();
            if (!groups[method]) groups[method] = [];
            groups[method].push(row);
        }

        // Sort methods: Check first, Cash second, rest alphabetical
        const methodOrder = (m) => {
            const l = m.toLowerCase();
            if (l === 'check') return '0';
            if (l === 'cash')  return '1';
            return '2' + l;
        };
        const sortedMethods = Object.keys(groups).sort((a, b) =>
            methodOrder(a).localeCompare(methodOrder(b))
        );

        // Totals across all rows
        const totals = { invoiced: 0, tendered: 0, disbursement: 0, 'non-fiduciary': 0 };
        for (const row of _rows) {
            for (const key of Object.keys(totals)) {
                totals[key] += _parseMoney(row[key]);
            }
        }

        // Meta bar
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        meta.innerHTML = `
            <div class="ds-meta-row">
                <span class="ds-meta-title">Deposit Sheet</span>
                <span class="ds-meta-date">${dateStr}</span>
            </div>
            <div class="ds-meta-row ds-meta-sub-row">
                <span class="ds-meta-agency">Altech Insurance Agency</span>
                <span class="ds-meta-count">${_rows.length} receipt${_rows.length !== 1 ? 's' : ''} · <span id="ds-verified-count" class="ds-verified-count">0/${_rows.length} verified</span></span>
            </div>
            <div class="ds-meta-totals">
                <div class="ds-meta-total-item">
                    <span class="ds-meta-total-label">Invoiced</span>
                    <span class="ds-meta-total-val">${_fmt(totals.invoiced)}</span>
                </div>
                <div class="ds-meta-total-item">
                    <span class="ds-meta-total-label">Tendered</span>
                    <span class="ds-meta-total-val">${_fmt(totals.tendered)}</span>
                </div>
                <div class="ds-meta-total-item">
                    <span class="ds-meta-total-label">Disbursement</span>
                    <span class="ds-meta-total-val">${_fmt(totals.disbursement)}</span>
                </div>
                <div class="ds-meta-total-item">
                    <span class="ds-meta-total-label">Non-Fiduciary</span>
                    <span class="ds-meta-total-val">${_fmt(totals['non-fiduciary'])}</span>
                </div>
            </div>
        `;

        // Show bill counter if cash exists
        const hasCash = sortedMethods.some(m => m.toLowerCase() === 'cash');
        if (billBlock) billBlock.style.display = hasCash ? 'block' : 'none';

        // Render tables
        let html = '';
        for (const method of sortedMethods) {
            const rows = groups[method];
            const label = METHOD_LABELS[method.toLowerCase()] || method;
            const methodTotal = rows.reduce((s, r) => s + _parseMoney(r['tendered']), 0);

            html += `<div class="ds-group">`;
            html += `<div class="ds-group-header">
                <span class="ds-group-label">${_esc(label)}</span>
                <span class="ds-group-total">${_fmt(methodTotal)}</span>
            </div>`;
            html += _renderTable(rows);
            html += `</div>`;
        }

        output.innerHTML = html;
    }

    function _renderTable(rows) {
        const rawCols = KEEP_COLS.filter(c => c !== 'pay method' && rows.some(r => r[c]));

        // Hide money columns where every row is zero
        const visibleCols = rawCols.filter(c => {
            if (MONEY_COLS.has(c)) return rows.some(r => _parseMoney(r[c]) !== 0);
            return true;
        });

        // Merge columns for a more compact layout
        const mergeDate = visibleCols.includes('item #') && visibleCols.includes('item date');
        const mergeId   = visibleCols.includes('name')   && visibleCols.includes('cust id');
        const columns = visibleCols.filter(c => {
            if (c === 'item date' && mergeDate) return false;
            if (c === 'cust id'   && mergeId)   return false;
            return true;
        });

        const colLabels = {
            'item #':        mergeDate ? 'Receipt' : 'Rcpt #',
            'item date':     'Date',
            'cust id':       'ID',
            'name':          'Client',
            'line item':     'Line Item',
            'payee':         'Payee',
            'invoiced':      'Invoiced',
            'tendered':      'Tendered',
            'credit used':   'Cr. Used',
            'change':        'Change',
            'disbursement':  'Disb.',
            'non-fiduciary': 'Non-Fid.',
            'memo':          'Memo',
            'agent name':    'Agent',
            'teller':        'Agent'
        };

        let html = `<table class="ds-table">`;

        // Header
        html += `<thead><tr>`;
        html += `<th class="ds-check-col no-print"><input type="checkbox" class="ds-check-all" title="Select all"></th>`;
        for (const col of columns) {
            const cls = MONEY_COLS.has(col) ? ' class="ds-th-money"' : '';
            html += `<th${cls}>${colLabels[col] || col}</th>`;
        }
        html += `</tr></thead>`;

        // Body
        html += `<tbody>`;
        for (const row of rows) {
            html += `<tr>`;
            html += `<td class="ds-check-col no-print"><input type="checkbox" class="ds-row-check"></td>`;
            for (const col of columns) {
                if (MONEY_COLS.has(col)) {
                    const num = _parseMoney(row[col]);
                    const cls = num === 0 ? ' class="ds-td-money ds-money-zero"' : ' class="ds-td-money"';
                    html += `<td${cls}>${num === 0 ? '\u2014' : _fmt(num)}</td>`;
                } else if (col === 'item #' && mergeDate) {
                    const n = _esc(row['item #'] || '');
                    const d = _esc(row['item date'] || '');
                    html += `<td class="ds-td-receipt">${n}${d ? '<span class="ds-receipt-date">' + d + '</span>' : ''}</td>`;
                } else if (col === 'name') {
                    const nm = _esc(row['name'] || '');
                    const id = mergeId ? _esc(row['cust id'] || '') : '';
                    html += `<td class="ds-td-client">${nm}${id ? '<span class="ds-client-id">#' + id + '</span>' : ''}</td>`;
                } else if (col === 'memo') {
                    html += `<td class="ds-td-memo">${_esc(row[col] || '')}</td>`;
                } else {
                    html += `<td>${_esc(row[col] || '')}</td>`;
                }
            }
            html += `</tr>`;
        }
        html += `</tbody>`;

        // Per-group subtotal row
        html += `<tfoot><tr class="ds-subtotal-row">`;
        html += `<td class="ds-check-col no-print"></td>`;
        for (const col of columns) {
            if (MONEY_COLS.has(col)) {
                const v = rows.reduce((s, r) => s + _parseMoney(r[col]), 0);
                html += `<td class="ds-td-money ds-subtotal-val">${v === 0 ? '\u2014' : _fmt(v)}</td>`;
            } else if (col === 'name') {
                html += `<td class="ds-subtotal-label">Subtotal</td>`;
            } else {
                html += `<td></td>`;
            }
        }
        html += `</tr></tfoot>`;

        html += `</table>`;
        return html;
    }

    /* ═══════════════════════════════════════════════════════
       BILL COUNTER
       ═══════════════════════════════════════════════════════ */

    function _updateBillCounter() {
        const inputs = document.querySelectorAll('input.ds-bill-input');
        let grand = 0;
        inputs.forEach(input => {
            const denom = parseInt(input.dataset.denom, 10);
            const count = parseInt(input.value, 10) || 0;
            const total = denom * count;
            grand += total;
            const el = document.getElementById(`ds-bill-${denom}`);
            if (el) el.textContent = count > 0 ? _fmt(total) : '—';
            const countEl = document.getElementById(`ds-bill-count-${denom}`);
            if (countEl) countEl.textContent = count;
        });
        const grandEl = document.getElementById('ds-bill-counted');
        if (grandEl) grandEl.textContent = _fmt(grand);
    }

    function _updateVerifiedCount() {
        const total = document.querySelectorAll('.ds-row-check').length;
        const checked = document.querySelectorAll('.ds-row-check:checked').length;
        const el = document.getElementById('ds-verified-count');
        if (el) {
            el.textContent = checked + '/' + total + ' verified';
            el.classList.toggle('ds-all-verified', checked === total && total > 0);
        }
    }

    /* ═══════════════════════════════════════════════════════
       HELPERS
       ═══════════════════════════════════════════════════════ */

    function _parseMoney(str) {
        if (!str) return 0;
        const n = parseFloat(str.replace(/[$,]/g, ''));
        return isNaN(n) ? 0 : n;
    }

    function _fmt(n) {
        return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }

    function _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _showError(msg) {
        const el = document.getElementById('ds-error');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    function _hideError() {
        const el = document.getElementById('ds-error');
        if (el) el.style.display = 'none';
    }

    function _reset() {
        _rows = [];
        const dropZone  = document.getElementById('ds-drop-zone');
        const printBtn  = document.getElementById('ds-print-btn');
        const clearBtn  = document.getElementById('ds-clear-btn');
        const meta      = document.getElementById('ds-meta');
        const output    = document.getElementById('ds-output');
        const billBlock = document.getElementById('ds-bill-counter');

        if (dropZone)  { dropZone.style.display = ''; }
        if (printBtn)  printBtn.style.display = 'none';
        if (clearBtn)  clearBtn.style.display = 'none';
        if (meta)      { meta.style.display = 'none'; meta.innerHTML = ''; }
        if (output)    output.innerHTML = '';
        if (billBlock) billBlock.style.display = 'none';

        // Reset bill inputs
        document.querySelectorAll('input.ds-bill-input').forEach(i => { i.value = 0; });
        _updateBillCounter();
        _hideError();
    }

    return { init, render };
})();
