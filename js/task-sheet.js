/**
 * Task Sheet — HawkSoft CSV Task Export Viewer
 * Parses a HawkSoft "My Tasks" CSV export and renders a printable task table.
 * Ephemeral display-only — no persistence, no cloud sync.
 */
window.TaskSheetModule = (() => {
    'use strict';

    /* ── Priority sort order ─────────────────────────── */
    const PRIORITY_ORDER = {
        '1-critical': 0,
        '2-high':     1,
        '3-medium':   2,
        '4-low':      3
    };

    /* ── Expected CSV columns from HawkSoft ──────────── */
    const EXPECTED_HEADERS = [
        'overdue', 'on log', 'on attachment', 'category',
        'task title', 'due date', 'priority', 'client',
        'carrier', 'status', 'created by'
    ];

    let _rows = [];

    /* ═══════════════════════════════════════════════════
       PUBLIC
       ═══════════════════════════════════════════════════ */

    function init() {
        _wireEvents();
    }

    function render() { /* no-op — rendering is driven by CSV upload */ }

    /* ═══════════════════════════════════════════════════
       EVENT WIRING
       ═══════════════════════════════════════════════════ */

    function _wireEvents() {
        const dropZone  = document.getElementById('ts-drop-zone');
        const fileInput = document.getElementById('ts-file-input');
        const printBtn  = document.getElementById('ts-print-btn');
        const clearBtn  = document.getElementById('ts-clear-btn');

        if (dropZone) {
            dropZone.addEventListener('click', () => fileInput && fileInput.click());
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('ts-drop-active');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('ts-drop-active');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('ts-drop-active');
                const file = e.dataTransfer && e.dataTransfer.files[0];
                if (file) _handleFile(file);
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files[0]) {
                    _handleFile(fileInput.files[0]);
                    fileInput.value = '';
                }
            });
        }

        if (printBtn) {
            printBtn.addEventListener('click', () => window.print());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', _clearTable);
        }
    }

    /* ═══════════════════════════════════════════════════
       FILE HANDLING
       ═══════════════════════════════════════════════════ */

    function _handleFile(file) {
        const errEl   = document.getElementById('ts-error');
        const metaEl  = document.getElementById('ts-meta');
        const outEl   = document.getElementById('ts-output');
        const dropEl  = document.getElementById('ts-drop-zone');
        const printBtn = document.getElementById('ts-print-btn');
        const clearBtn = document.getElementById('ts-clear-btn');

        // Reset
        if (errEl)  errEl.style.display = 'none';
        if (metaEl) metaEl.style.display = 'none';
        if (outEl)  outEl.innerHTML = '';

        // Validate type
        if (!file.name.toLowerCase().endsWith('.csv')) {
            _showError('Please upload a .csv file exported from HawkSoft.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                _rows = _parseCSV(text);

                if (_rows.length === 0) {
                    _showError('No task rows found in this CSV. Make sure this is a HawkSoft "My Tasks" export.');
                    return;
                }

                _sortRows(_rows);
                _renderTable(_rows);

                // Show meta bar
                const overdueCount = _rows.filter(r => r.overdue).length;
                if (metaEl) {
                    const agencyName = _getAgencyName();
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    metaEl.innerHTML =
                        '<div class="ts-meta-row">' +
                            '<span class="ts-meta-agency">' + _escapeHTML(agencyName) + '</span>' +
                            '<span class="ts-meta-date">' + _escapeHTML(dateStr) + '</span>' +
                        '</div>' +
                        '<div class="ts-meta-row">' +
                            '<span class="ts-meta-count">' + _rows.length + ' task' + (_rows.length !== 1 ? 's' : '') + '</span>' +
                            (overdueCount > 0
                                ? '<span class="ts-meta-overdue">' + overdueCount + ' overdue</span>'
                                : '<span class="ts-meta-clear">All current</span>') +
                        '</div>';
                    metaEl.style.display = '';
                }

                // Toggle visibility
                if (dropEl) dropEl.style.display = 'none';
                if (printBtn) printBtn.style.display = '';
                if (clearBtn) clearBtn.style.display = '';

            } catch (err) {
                _showError('Failed to parse CSV: ' + err.message);
            }
        };
        reader.onerror = () => _showError('Could not read file.');
        reader.readAsText(file);
    }

    /* ═══════════════════════════════════════════════════
       CSV PARSING
       ═══════════════════════════════════════════════════ */

    function _parseCSV(text) {
        // Strip UTF-8 BOM
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        const lines = text.split(/\r?\n/);
        if (lines.length < 2) return [];

        // Parse header row
        const headerCells = _splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());

        // Build column index map
        const colIdx = {};
        EXPECTED_HEADERS.forEach(h => {
            const idx = headerCells.indexOf(h);
            if (idx !== -1) colIdx[h] = idx;
        });

        // Must have at least "task title" to be valid
        if (colIdx['task title'] === undefined) return [];

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const cells = _splitCSVLine(line);
            const get = (key) => {
                const idx = colIdx[key];
                return idx !== undefined && idx < cells.length ? cells[idx].trim() : '';
            };

            const taskTitle = get('task title');
            if (!taskTitle) continue;

            rows.push({
                overdue:   get('overdue').toLowerCase() === 'yes',
                category:  get('category'),
                task:      taskTitle,
                dueDate:   get('due date'),
                priority:  get('priority'),
                client:    get('client'),
                carrier:   get('carrier'),
                assignedTo: get('created by')
            });
        }
        return rows;
    }

    /**
     * RFC-compliant CSV line splitter — handles quoted fields with embedded commas/newlines.
     */
    function _splitCSVLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < line.length && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    fields.push(current);
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        fields.push(current);
        return fields;
    }

    /* ═══════════════════════════════════════════════════
       SORTING
       ═══════════════════════════════════════════════════ */

    function _sortRows(rows) {
        rows.sort((a, b) => {
            // 1. Overdue first
            if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;

            // 2. Priority (lower number = higher priority)
            const pa = PRIORITY_ORDER[a.priority.toLowerCase()] ?? 99;
            const pb = PRIORITY_ORDER[b.priority.toLowerCase()] ?? 99;
            if (pa !== pb) return pa - pb;

            // 3. Due Date ascending
            const da = _parseDate(a.dueDate);
            const db = _parseDate(b.dueDate);
            if (da && db) return da - db;
            if (da) return -1;
            if (db) return 1;

            return 0;
        });
    }

    /* ═══════════════════════════════════════════════════
       RENDERING
       ═══════════════════════════════════════════════════ */

    function _renderTable(rows) {
        const outEl = document.getElementById('ts-output');
        if (!outEl) return;

        let html = '<table class="ts-table">';
        html += '<thead><tr>' +
            '<th class="ts-col-flag">!</th>' +
            '<th>Due Date</th>' +
            '<th>Priority</th>' +
            '<th>Client</th>' +
            '<th>Carrier</th>' +
            '<th>Category</th>' +
            '<th>Task</th>' +
            '<th>Assigned</th>' +
            '<th class="ts-col-notes">Notes</th>' +
        '</tr></thead><tbody>';

        rows.forEach(row => {
            const rowClass = row.overdue ? ' class="ts-row-overdue"' : '';
            html += '<tr' + rowClass + '>';

            // Overdue flag
            html += '<td class="ts-cell-flag">' + (row.overdue ? '<span class="ts-overdue-icon" title="Overdue">⚠️</span>' : '') + '</td>';

            // Due Date
            html += '<td class="ts-cell-date">' + _escapeHTML(_formatDate(row.dueDate)) + '</td>';

            // Priority badge
            html += '<td class="ts-cell-priority">' + _renderPriorityBadge(row.priority) + '</td>';

            // Client (strip trailing ID)
            html += '<td class="ts-cell-client">' + _escapeHTML(_displayClient(row.client)) + '</td>';

            // Carrier
            html += '<td class="ts-cell-carrier">' + _escapeHTML(row.carrier) + '</td>';

            // Category
            html += '<td class="ts-cell-category">' + _escapeHTML(row.category) + '</td>';

            // Task
            html += '<td class="ts-cell-task">' + _escapeHTML(row.task) + '</td>';

            // Assigned To
            html += '<td class="ts-cell-assigned">' + _escapeHTML(row.assignedTo) + '</td>';

            // Notes (empty write-in column)
            html += '<td class="ts-cell-notes"></td>';

            html += '</tr>';
        });

        html += '</tbody></table>';
        outEl.innerHTML = html;
    }

    function _renderPriorityBadge(priority) {
        if (!priority) return '';
        const display = _displayPriority(priority);
        const key = priority.toLowerCase();
        let cls = 'ts-priority-badge';

        if (key.includes('critical')) cls += ' ts-priority-critical';
        else if (key.includes('high'))  cls += ' ts-priority-high';
        else if (key.includes('medium')) cls += ' ts-priority-medium';
        else if (key.includes('low'))   cls += ' ts-priority-low';

        return '<span class="' + cls + '">' + _escapeHTML(display) + '</span>';
    }

    /* ═══════════════════════════════════════════════════
       DISPLAY TRANSFORMS
       ═══════════════════════════════════════════════════ */

    /** Strip numeric prefix: "2-High" → "High" */
    function _displayPriority(val) {
        return val.replace(/^\d+-/, '');
    }

    /** Strip trailing HawkSoft client ID: "Adams, Marsha C (11278)" → "Adams, Marsha C" */
    function _displayClient(val) {
        return val.replace(/\s*\(\d+\)\s*$/, '');
    }

    /** Strip "Today, " prefix from dates */
    function _formatDate(val) {
        if (!val) return '';
        return val.replace(/^Today,\s*/i, '');
    }

    /** Parse a date string, stripping "Today, " prefix first */
    function _parseDate(val) {
        if (!val) return null;
        const cleaned = val.replace(/^Today,\s*/i, '');
        const d = new Date(cleaned);
        return isNaN(d.getTime()) ? null : d;
    }

    /* ═══════════════════════════════════════════════════
       UTILITIES
       ═══════════════════════════════════════════════════ */

    function _getAgencyName() {
        try {
            const profile = localStorage.getItem('altech_agency_profile');
            if (profile) {
                const parsed = JSON.parse(profile);
                if (parsed && parsed.agencyName) return parsed.agencyName;
            }
        } catch (e) { /* ignore */ }
        return 'Agency Task Sheet';
    }

    function _escapeHTML(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _showError(msg) {
        const errEl = document.getElementById('ts-error');
        if (errEl) {
            errEl.textContent = msg;
            errEl.style.display = '';
        }
    }

    function _clearTable() {
        const outEl   = document.getElementById('ts-output');
        const metaEl  = document.getElementById('ts-meta');
        const dropEl  = document.getElementById('ts-drop-zone');
        const errEl   = document.getElementById('ts-error');
        const printBtn = document.getElementById('ts-print-btn');
        const clearBtn = document.getElementById('ts-clear-btn');

        _rows = [];
        if (outEl)   outEl.innerHTML = '';
        if (metaEl)  { metaEl.innerHTML = ''; metaEl.style.display = 'none'; }
        if (errEl)   errEl.style.display = 'none';
        if (dropEl)  dropEl.style.display = '';
        if (printBtn) printBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
    }

    /* ═══════════════════════════════════════════════════
       PUBLIC API
       ═══════════════════════════════════════════════════ */

    return { init, render };
})();
