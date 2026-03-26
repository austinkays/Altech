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
    let _filename = '';

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

        const pdfBtn = document.getElementById('ds-pdf-btn');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', _exportPDF);
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
        _filename = filename || '';
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

        // Unique tellers
        const tellers = [...new Set(_rows.map(r => (r['teller'] || '').trim()).filter(Boolean))];

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
                    <span class="ds-meta-total-val ds-meta-total-highlight">${_fmt(totals.tendered)}</span>
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
            ${tellers.length ? `<div class="ds-meta-tellers">
                <span class="ds-meta-total-label">Tendered by</span>
                <span class="ds-meta-teller-list">${tellers.map(t => _esc(t)).join(' · ')}</span>
            </div>` : ''}
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

        // Receipt tape area — blank space for taping bank deposit slip
        html += `<div class="ds-receipt-tape">
            <div class="ds-receipt-tape-label">Bank Deposit Receipt</div>
            <div class="ds-receipt-tape-area">
                <span class="ds-receipt-tape-hint no-print">Tape bank receipt here after printing</span>
            </div>
        </div>`;

        output.innerHTML = html;
    }

    function _renderTable(rows) {
        // Hide pay method (group key) and teller (merged into client cell)
        const rawCols = KEEP_COLS.filter(c => c !== 'pay method' && c !== 'teller' && rows.some(r => r[c]));

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
                    const teller = _esc(row['teller'] || '');
                    html += `<td class="ds-td-client">${nm}${id ? '<span class="ds-client-id">#' + id + '</span>' : ''}${teller ? '<span class="ds-client-teller">' + teller + '</span>' : ''}</td>`;
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
        _filename = '';
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

        // Reset bill inputs
        document.querySelectorAll('input.ds-bill-input').forEach(i => { i.value = 0; });
        _updateBillCounter();
        _hideError();
    }

    /* ═══════════════════════════════════════════════════════
       PDF EXPORT
       ═══════════════════════════════════════════════════════ */

    async function _exportPDF() {
        if (!_rows.length) return;

        // Lazy-load jsPDF
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
                if (typeof App !== 'undefined' && App.toast) App.toast('Failed to load PDF library', 'error');
                return;
            }
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
        const pageW = doc.internal.pageSize.getWidth();   // 279.4mm
        const pageH = doc.internal.pageSize.getHeight();  // 215.9mm
        const mg = 10;
        const cw = pageW - mg * 2;
        let y = mg;

        // ── Toner-friendly palette ─────────────────────────
        const INK   = [30, 30, 30];
        const MID   = [80, 80, 80];
        const LIGHT = [170, 170, 170];
        const RULE  = [200, 200, 200];
        const FILL  = [242, 242, 242];
        const HFILL = [230, 230, 230];

        const addPage = () => { doc.addPage(); y = mg; };
        const need = (h) => { if (y + h > pageH - 14) { addPage(); return true; } return false; };

        // ── Header ─────────────────────────────────────────
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...INK);
        doc.text('Deposit Sheet', mg, y + 5);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...MID);
        doc.text(dateStr, pageW - mg, y + 5, { align: 'right' });
        y += 7;

        doc.setFontSize(8);
        doc.text('Altech Insurance Agency', mg, y + 3);

        // Teller names
        const tellers = [...new Set(_rows.map(r => (r['teller'] || '').trim()).filter(Boolean))];
        if (tellers.length) {
            doc.text('Tendered by: ' + tellers.join(', '), mg + 50, y + 3);
        }

        doc.text(_rows.length + ' receipt' + (_rows.length !== 1 ? 's' : ''), pageW - mg, y + 3, { align: 'right' });
        y += 6;

        // Summary totals bar
        const totals = { invoiced: 0, tendered: 0, disbursement: 0, 'non-fiduciary': 0 };
        for (const row of _rows) {
            for (const key of Object.keys(totals)) {
                totals[key] += _parseMoney(row[key]);
            }
        }

        doc.setFillColor(...FILL);
        doc.rect(mg, y, cw, 7, 'F');
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...MID);
        const summaryItems = [
            ['Invoiced', _fmt(totals.invoiced)],
            ['Tendered', _fmt(totals.tendered)],
            ['Disbursement', _fmt(totals.disbursement)],
            ['Non-Fiduciary', _fmt(totals['non-fiduciary'])]
        ];
        let sx = mg + 3;
        for (const [label, val] of summaryItems) {
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...MID);
            doc.text(label + ':', sx, y + 4.5);
            const lw = doc.getTextWidth(label + ': ');
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...INK);
            doc.text(val, sx + lw, y + 4.5);
            sx += lw + doc.getTextWidth(val) + 12;
        }
        y += 10;

        // ── Group by pay method ────────────────────────────
        const groups = {};
        for (const row of _rows) {
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

        // ── Column definitions ─────────────────────────────
        // Decide which money columns have data
        const hasDisb = _rows.some(r => _parseMoney(r['disbursement']) !== 0);
        const hasNonFid = _rows.some(r => _parseMoney(r['non-fiduciary']) !== 0);
        const hasCrUsed = _rows.some(r => _parseMoney(r['credit used']) !== 0);
        const hasChange = _rows.some(r => _parseMoney(r['change']) !== 0);
        const hasMemo = _rows.some(r => (r['memo'] || '').trim());

        const cols = [];
        cols.push({ key: 'item #',     label: 'Rcpt',      width: 14,  align: 'left' });
        cols.push({ key: 'item date',  label: 'Date',      width: 18,  align: 'left' });
        cols.push({ key: 'name',       label: 'Client',    width: 0,   align: 'left' });  // flex
        cols.push({ key: 'teller',     label: 'Agent',     width: 22,  align: 'left' });
        cols.push({ key: 'invoiced',   label: 'Invoiced',  width: 22,  align: 'right', money: true });
        cols.push({ key: 'tendered',   label: 'Tendered',  width: 22,  align: 'right', money: true });
        if (hasCrUsed)  cols.push({ key: 'credit used',   label: 'Cr. Used',  width: 18, align: 'right', money: true });
        if (hasChange)  cols.push({ key: 'change',        label: 'Change',    width: 18, align: 'right', money: true });
        if (hasDisb)    cols.push({ key: 'disbursement',   label: 'Disb.',     width: 20, align: 'right', money: true });
        if (hasNonFid)  cols.push({ key: 'non-fiduciary',  label: 'Non-Fid.',  width: 20, align: 'right', money: true });
        if (hasMemo)    cols.push({ key: 'memo',           label: 'Memo',      width: 35, align: 'left' });

        // Compute flex column (client name) width
        const fixedW = cols.reduce((s, c) => s + (c.key === 'name' ? 0 : c.width), 0);
        const nameCol = cols.find(c => c.key === 'name');
        if (nameCol) nameCol.width = Math.max(30, cw - fixedW);

        const rowH = 5.5;
        const headerH = 6;

        function _drawTableHeader() {
            doc.setFillColor(...HFILL);
            doc.rect(mg, y, cw, headerH, 'F');
            doc.setFontSize(6.5);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...MID);
            let cx = mg + 1.5;
            for (const col of cols) {
                if (col.align === 'right') {
                    doc.text(col.label, cx + col.width - 1.5, y + 4, { align: 'right' });
                } else {
                    doc.text(col.label, cx, y + 4);
                }
                cx += col.width;
            }
            y += headerH;
        }

        function _drawRow(row, isAlt) {
            if (isAlt) {
                doc.setFillColor(248, 248, 248);
                doc.rect(mg, y, cw, rowH, 'F');
            }
            doc.setFontSize(7.5);
            doc.setFont(undefined, 'normal');
            let cx = mg + 1.5;
            for (const col of cols) {
                if (col.money) {
                    const v = _parseMoney(row[col.key]);
                    doc.setTextColor(v === 0 ? 170 : 30, v === 0 ? 170 : 30, v === 0 ? 170 : 30);
                    const txt = v === 0 ? '\u2014' : _fmt(v);
                    doc.text(txt, cx + col.width - 1.5, y + 3.8, { align: 'right' });
                } else if (col.key === 'name') {
                    doc.setTextColor(...INK);
                    const nm = (row['name'] || '').trim();
                    const id = (row['cust id'] || '').trim();
                    const label = nm + (id ? '  #' + id : '');
                    doc.text(label.substring(0, 45), cx, y + 3.8);
                } else if (col.key === 'memo') {
                    doc.setTextColor(...MID);
                    doc.setFontSize(6.5);
                    const memo = (row['memo'] || '').trim();
                    doc.text(memo.substring(0, 50), cx, y + 3.8);
                    doc.setFontSize(7.5);
                } else {
                    doc.setTextColor(...INK);
                    doc.text(String(row[col.key] || '').trim().substring(0, 30), cx, y + 3.8);
                }
                cx += col.width;
            }
            y += rowH;
        }

        // ── Render groups ──────────────────────────────────
        for (const method of sortedMethods) {
            const gRows = groups[method];
            const label = METHOD_LABELS[method.toLowerCase()] || method;
            const methodTotal = gRows.reduce((s, r) => s + _parseMoney(r['tendered']), 0);

            // Need space for header + at least 2 rows + subtotal
            need(headerH + rowH * 3 + 6);

            // Group header bar
            doc.setFillColor(60, 60, 60);
            doc.rect(mg, y, cw, 5.5, 'F');
            doc.setFontSize(7);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(label.toUpperCase(), mg + 2, y + 3.8);
            doc.text(_fmt(methodTotal), pageW - mg - 2, y + 3.8, { align: 'right' });
            y += 6.5;

            // Table header
            _drawTableHeader();

            // Rows
            for (let i = 0; i < gRows.length; i++) {
                if (need(rowH + 6)) {
                    // Reprint group header on new page
                    doc.setFillColor(60, 60, 60);
                    doc.rect(mg, y, cw, 5.5, 'F');
                    doc.setFontSize(7);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(255, 255, 255);
                    doc.text(label.toUpperCase() + ' (cont.)', mg + 2, y + 3.8);
                    y += 6.5;
                    _drawTableHeader();
                }
                _drawRow(gRows[i], i % 2 === 1);
            }

            // Subtotal row
            doc.setDrawColor(...LIGHT);
            doc.line(mg, y, pageW - mg, y);
            y += 0.5;
            doc.setFillColor(...FILL);
            doc.rect(mg, y, cw, rowH, 'F');
            doc.setFontSize(7);
            doc.setFont(undefined, 'bold');
            let cx = mg + 1.5;
            for (const col of cols) {
                if (col.money) {
                    const v = gRows.reduce((s, r) => s + _parseMoney(r[col.key]), 0);
                    doc.setTextColor(...INK);
                    doc.text(v === 0 ? '\u2014' : _fmt(v), cx + col.width - 1.5, y + 3.8, { align: 'right' });
                } else if (col.key === 'name') {
                    doc.setTextColor(...MID);
                    doc.setFontSize(6);
                    doc.text('SUBTOTAL', cx, y + 3.8);
                    doc.setFontSize(7);
                }
                cx += col.width;
            }
            y += rowH + 4;
        }

        // ── Bill counter (if cash) ─────────────────────────
        const billInputs = document.querySelectorAll('input.ds-bill-input');
        let billTotal = 0;
        const bills = [];
        billInputs.forEach(input => {
            const denom = parseInt(input.dataset.denom, 10);
            const count = parseInt(input.value, 10) || 0;
            if (count > 0) {
                bills.push({ denom, count, total: denom * count });
                billTotal += denom * count;
            }
        });

        if (bills.length) {
            need(20 + bills.length * 4);
            doc.setFontSize(7);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...MID);
            doc.text('CASH COUNTER', mg, y + 3);
            y += 5;
            doc.setFont(undefined, 'normal');
            doc.setFontSize(7.5);
            for (const b of bills) {
                doc.setTextColor(...INK);
                doc.text('$' + b.denom, mg + 2, y + 3);
                doc.setTextColor(...MID);
                doc.text('\u00d7 ' + b.count, mg + 16, y + 3);
                doc.setTextColor(...INK);
                doc.text('= ' + _fmt(b.total), mg + 30, y + 3);
                y += 4;
            }
            doc.setFont(undefined, 'bold');
            doc.setDrawColor(...LIGHT);
            doc.line(mg, y, mg + 50, y);
            y += 1;
            doc.text('Counted: ' + _fmt(billTotal), mg + 2, y + 3.5);
            y += 8;
        }

        // ── Receipt tape area (blank box ~4"x5" ≈ 102×127mm) ──
        need(140);
        doc.setDrawColor(...LIGHT);
        doc.setLineWidth(0.3);
        const tapeW = 127;  // ~5 inches
        const tapeH = 102;  // ~4 inches
        const tapeX = mg;
        doc.rect(tapeX, y, tapeW, tapeH);
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...MID);
        doc.text('BANK DEPOSIT RECEIPT', tapeX + 2, y + 4);
        doc.setFontSize(6);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...LIGHT);
        doc.text('Tape receipt here', tapeX + tapeW / 2, y + tapeH / 2, { align: 'center' });

        // ── Save ───────────────────────────────────────────
        const fname = 'Deposit_Sheet_' + new Date().toISOString().slice(0, 10) + '.pdf';
        doc.save(fname);
        if (typeof App !== 'undefined' && App.toast) App.toast('\u2714 PDF downloaded');
    }

    return { init, render };
})();
