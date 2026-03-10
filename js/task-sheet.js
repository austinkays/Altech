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
        'overdue', 'on log', 'on attachment', 'created date', 'category',
        'task title', 'due date', 'priority', 'client',
        'carrier', 'status', 'assignee', 'created by', 'client id',
        'last updated date', 'policy expiration date', 'policy effective date', 'policy status date'
    ];

    let _rows        = [];
    let _showAll     = false;
    let _dedupedMode = false;
    let _teamMode    = false; // true when CSV has multi-agent Assignee data

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
        const dropZone    = document.getElementById('ts-drop-zone');
        const fileInput   = document.getElementById('ts-file-input');
        const addDropZone = document.getElementById('ts-add-drop-zone');
        const addInput    = document.getElementById('ts-add-file-input');
        const printBtn    = document.getElementById('ts-print-btn');
        const clearBtn    = document.getElementById('ts-clear-btn');

        // Primary drop zone
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
                const files = e.dataTransfer && e.dataTransfer.files;
                if (files && files.length >= 2) {
                    _handleTwoFiles(files[0], files[1]);
                } else if (files && files[0]) {
                    _handleFile(files[0]);
                }
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files.length >= 2) {
                    _handleTwoFiles(fileInput.files[0], fileInput.files[1]);
                } else if (fileInput.files && fileInput.files[0]) {
                    _handleFile(fileInput.files[0]);
                }
                fileInput.value = '';
            });
        }

        // Secondary "add another CSV" drop zone (shown after first load)
        if (addDropZone) {
            addDropZone.addEventListener('click', () => addInput && addInput.click());
            addDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                addDropZone.classList.add('ts-drop-active');
            });
            addDropZone.addEventListener('dragleave', () => {
                addDropZone.classList.remove('ts-drop-active');
            });
            addDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                addDropZone.classList.remove('ts-drop-active');
                const file = e.dataTransfer && e.dataTransfer.files[0];
                if (file) _handleMergeFile(file);
            });
        }

        if (addInput) {
            addInput.addEventListener('change', () => {
                if (addInput.files && addInput.files[0]) {
                    _handleMergeFile(addInput.files[0]);
                    addInput.value = '';
                }
            });
        }

        const showAllBtn = document.getElementById('ts-show-all-btn');
        const dedupeBtn  = document.getElementById('ts-dedupe-btn');

        if (printBtn) {
            printBtn.addEventListener('click', () => window.print());
        }

        if (showAllBtn) showAllBtn.addEventListener('click', _toggleShowAll);
        if (dedupeBtn)  dedupeBtn.addEventListener('click', _toggleDedupe);

        if (clearBtn) {
            clearBtn.addEventListener('click', _clearTable);
        }
    }

    /* ═══════════════════════════════════════════════════
       FILE HANDLING
       ═══════════════════════════════════════════════════ */

    function _handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            _showError('Please upload a .csv file exported from HawkSoft.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const rows = _parseCSV(e.target.result);
                if (rows.length === 0) {
                    _showError('No task rows found in this CSV. Make sure this is a HawkSoft export.');
                    return;
                }
                _rows = rows;
                _mergeAndRender();
            } catch (err) {
                _showError('Failed to parse CSV: ' + err.message);
            }
        };
        reader.onerror = () => _showError('Could not read file.');
        reader.readAsText(file);
    }

    /** Reads a second CSV, merges with existing rows, dedupes, and re-renders. */
    function _handleMergeFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            _showError('Please upload a .csv file exported from HawkSoft.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const newRows = _parseCSV(e.target.result);
                if (newRows.length === 0) {
                    _showError('No task rows found in the second CSV.');
                    return;
                }
                _rows = _dedupeByIdentity([..._rows, ...newRows]);
                _mergeAndRender();
                // Hide the secondary drop zone — both files loaded
                const addEl = document.getElementById('ts-add-drop-zone');
                if (addEl) addEl.style.display = 'none';
            } catch (err) {
                _showError('Failed to parse second CSV: ' + err.message);
            }
        };
        reader.onerror = () => _showError('Could not read file.');
        reader.readAsText(file);
    }

    /** When two files are dropped simultaneously, read both then merge. */
    function _handleTwoFiles(fileA, fileB) {
        const readFile = (f) => new Promise((resolve, reject) => {
            if (!f.name.toLowerCase().endsWith('.csv')) {
                reject(new Error('Please upload .csv files exported from HawkSoft.'));
                return;
            }
            const r = new FileReader();
            r.onload = (e) => resolve(e.target.result);
            r.onerror = () => reject(new Error('Could not read file.'));
            r.readAsText(f);
        });

        Promise.all([readFile(fileA), readFile(fileB)])
            .then(([textA, textB]) => {
                const rowsA = _parseCSV(textA);
                const rowsB = _parseCSV(textB);
                const combined = _dedupeByIdentity([...rowsA, ...rowsB]);
                if (combined.length === 0) {
                    _showError('No task rows found in these CSV files.');
                    return;
                }
                _rows = combined;
                _mergeAndRender();
                // Hide secondary drop — both files already loaded
                const addEl = document.getElementById('ts-add-drop-zone');
                if (addEl) addEl.style.display = 'none';
            })
            .catch(err => _showError(err.message));
    }

    /**
     * Deduplicate rows by identity: same clientId + normalized taskTitle + dueDate.
     * Rows from the overdue export and due-today export often overlap exactly.
     * Prefers the row where overdue=true (keep the more urgent copy).
     */
    function _dedupeByIdentity(rows) {
        const seen = new Map();
        rows.forEach(row => {
            const key = (row.clientId || '') + '|' + row.task.toLowerCase().trim() + '|' + row.dueDate.toLowerCase().trim();
            if (!seen.has(key)) {
                seen.set(key, row);
            } else if (row.overdue && !seen.get(key).overdue) {
                seen.set(key, row); // prefer overdue copy
            }
        });
        return [...seen.values()];
    }

    /**
     * Expand rows where assignee contains semicolons (e.g. "KSN - Kathleen; AJK - Austin")
     * into one row per assignee so each agent sees their own tasks.
     */
    function _expandMultiAssignee(rows) {
        const expanded = [];
        rows.forEach(row => {
            if (row.assignee && row.assignee.includes(';')) {
                row.assignee.split(';').forEach(a => {
                    expanded.push(Object.assign({}, row, { assignee: a.trim() }));
                });
            } else {
                expanded.push(row);
            }
        });
        return expanded;
    }

    /* ═══════════════════════════════════════════════════
       AGENT FILTER — persistent exclusion list
       ═══════════════════════════════════════════════════ */

    const PROFILE_KEY = 'altech_agency_profile';

    function _loadExcluded() {
        try {
            const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
            return Array.isArray(p.taskSheetExcludedAgents) ? p.taskSheetExcludedAgents : [];
        } catch { return []; }
    }

    function _saveExcluded(excluded) {
        try {
            const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
            p.taskSheetExcludedAgents = excluded;
            localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
            if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) CloudSync.schedulePush();
        } catch { /* ignore */ }
    }

    /**
     * Render the agent filter chip bar.
     * allAgents: sorted array of all agent keys found in the data.
     * excluded: array of agent keys currently excluded.
     * onToggle: called with the new excluded array whenever a chip is clicked.
     */
    function _renderAgentFilter(allAgents, excluded, onToggle) {
        const bar = document.getElementById('ts-agent-filter');
        if (!bar) return;

        let html = '<span class="ts-filter-label">Print:</span>';
        allAgents.forEach(agent => {
            const isOn = !excluded.includes(agent);
            const displayName = agent.replace(/^[A-Z]{2,4}\s*-\s*/, '').trim().split(' ')[0];
            const cls = 'ts-agent-chip' + (isOn ? ' ts-agent-chip-on' : '');
            html += '<button class="' + cls + '" data-agent="' + _escapeHTML(agent) + '">' + _escapeHTML(displayName) + '</button>';
        });
        bar.innerHTML = html;
        bar.style.display = '';

        bar.querySelectorAll('.ts-agent-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const agent = btn.dataset.agent;
                const current = _loadExcluded();
                const next = current.includes(agent)
                    ? current.filter(a => a !== agent)   // was excluded → include
                    : [...current, agent];                // was included → exclude
                _saveExcluded(next);
                onToggle(next);
            });
        });
    }

    /** Sort, detect team mode, and render. Called after any file load or merge. */
    function _mergeAndRender() {
        const errEl      = document.getElementById('ts-error');
        const metaEl     = document.getElementById('ts-meta');
        const filterEl   = document.getElementById('ts-agent-filter');
        const outEl      = document.getElementById('ts-output');
        const dropEl     = document.getElementById('ts-drop-zone');
        const addDropEl  = document.getElementById('ts-add-drop-zone');
        const printBtn   = document.getElementById('ts-print-btn');
        const clearBtn   = document.getElementById('ts-clear-btn');
        const showAllBtn = document.getElementById('ts-show-all-btn');
        const dedupeBtn  = document.getElementById('ts-dedupe-btn');

        if (errEl)    errEl.style.display = 'none';
        if (metaEl)   metaEl.style.display = 'none';
        if (filterEl) filterEl.style.display = 'none';
        if (outEl)    outEl.innerHTML = '';

        const rows = _expandMultiAssignee(_rows);
        _sortRows(rows);

        // Detect team mode: CSV has Assignee column with multiple distinct agents
        const allAgents = [...new Set(rows.map(r => r.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        _teamMode = allAgents.length > 1;

        if (_teamMode) {
            const excluded = _loadExcluded();
            const visibleRows = rows.filter(r => !r.assignee || !excluded.includes(r.assignee));
            _renderTeamTables(visibleRows);

            // Render agent filter chips; re-render on toggle
            const onToggle = (newExcluded) => {
                const filtered = rows.filter(r => !r.assignee || !newExcluded.includes(r.assignee));
                _renderTeamTables(filtered);
                _renderAgentFilter(allAgents, newExcluded, onToggle);
            };
            _renderAgentFilter(allAgents, excluded, onToggle);
        } else {
            _renderTable(rows);

            // Show meta bar (single-agent mode)
            const overdueCount = rows.filter(r => r.overdue).length;
            if (metaEl) {
                const pageTitle  = _getPageTitle();
                const agencyName = _getAgencyName();
                const now = new Date();
                const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                const countStr = rows.length + ' task' + (rows.length !== 1 ? 's' : '');
                const overdueStr = overdueCount > 0
                    ? ' &nbsp;&middot;&nbsp; <span class="ts-meta-overdue">' + overdueCount + ' overdue</span>'
                    : '';
                metaEl.innerHTML =
                    '<div class="ts-meta-row">' +
                        '<span class="ts-meta-title">' + _escapeHTML(pageTitle) + '</span>' +
                        '<span class="ts-meta-date">' + _escapeHTML(dateStr) + '</span>' +
                    '</div>' +
                    '<div class="ts-meta-row ts-meta-sub-row">' +
                        '<span class="ts-meta-agency">' + _escapeHTML(agencyName) + '</span>' +
                        '<span class="ts-meta-count">' + countStr + overdueStr + '</span>' +
                    '</div>';
                metaEl.style.display = '';
            }
        }

        // Toggle visibility
        if (dropEl)    dropEl.style.display = 'none';
        if (printBtn)  printBtn.style.display = '';
        if (showAllBtn) { showAllBtn.style.display = _teamMode ? 'none' : ''; }
        if (dedupeBtn)  { dedupeBtn.style.display = _teamMode ? 'none' : ''; }
        if (clearBtn)  clearBtn.style.display = '';

        // Show secondary drop zone so they can add the second CSV
        // (_handleMergeFile and _handleTwoFiles hide it once merged)
        if (addDropEl) addDropEl.style.display = '';
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
                overdue:       get('overdue') !== '',
                category:      get('category'),
                task:          taskTitle,
                dueDate:       get('due date'),
                priority:      get('priority'),
                client:        get('client'),
                carrier:       get('carrier'),
                status:        get('status'),
                policyExpDate: get('policy expiration date'),
                policyEffDate: get('policy effective date'),
                assignedTo:    get('created by'),
                assignee:      get('assignee'),
                clientId:      get('client id')
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
            // 1. Due Date ascending (empty dates sort last)
            const da = _parseDate(a.dueDate);
            const db = _parseDate(b.dueDate);
            if (da && db && da - db !== 0) return da - db;
            if (da && !db) return -1;
            if (!da && db) return 1;

            // 2. Priority ascending (1-Critical first, empty last)
            const pa = PRIORITY_ORDER[a.priority.toLowerCase()] ?? 99;
            const pb = PRIORITY_ORDER[b.priority.toLowerCase()] ?? 99;
            if (pa !== pb) return pa - pb;

            // 3. Overdue flag (overdue first within same tier)
            if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;

            // 4. Client name A-Z
            const ca = _displayClient(a.client).trim();
            const cb = _displayClient(b.client).trim();
            return ca.localeCompare(cb);
        });
    }

    /* ═══════════════════════════════════════════════════
       DISPLAY MODE TOGGLES
       ═══════════════════════════════════════════════════ */

    function _getDisplayRows() {
        return _dedupedMode ? _dedupeRows([..._rows]) : [..._rows];
    }

    function _dedupeRows(rows) {
        // Rows are already sorted — first occurrence per task title is most urgent
        const seen = new Map(); // normalized title → index in result
        const result = [];
        rows.forEach(row => {
            const key = row.task.toLowerCase().trim();
            if (seen.has(key)) {
                result[seen.get(key)]._dupeCount++;
            } else {
                const clone = Object.assign({}, row, { _dupeCount: 0 });
                seen.set(key, result.length);
                result.push(clone);
            }
        });
        return result;
    }

    function _toggleShowAll() {
        _showAll = !_showAll;
        const outEl = document.getElementById('ts-output');
        if (outEl) outEl.classList.toggle('ts-show-all-rows', _showAll);
        const btn = document.getElementById('ts-show-all-btn');
        if (btn) {
            btn.classList.toggle('ts-header-btn-active', _showAll);
            btn.textContent = _showAll ? 'Top 20 Only' : 'Print All';
        }
    }

    function _toggleDedupe() {
        _dedupedMode = !_dedupedMode;
        const btn = document.getElementById('ts-dedupe-btn');
        if (btn) btn.classList.toggle('ts-header-btn-active', _dedupedMode);
        _renderTable(_getDisplayRows());
    }

    /* ═══════════════════════════════════════════════════
       RENDERING
       ═══════════════════════════════════════════════════ */

    function _renderTable(rows) {
        const outEl = document.getElementById('ts-output');
        if (!outEl) return;
        outEl.innerHTML = _buildTableHTML(rows);
    }

    function _buildTableHTML(rows) {
        // Notes column is always rendered — CSV data fills it if present,
        // otherwise it stays blank for agents to write on during print.
        const hasCsvNotes = rows.some(r => r.notes && r.notes.trim());

        // 8 columns: ✓ | Priority | Due Date | Client | Task | Carrier | Policy Dates | Agent Notes
        let html = '<table class="ts-table">' +
            '<colgroup>' +
            '<col class="ts-col-check">' +
            '<col style="width:6%">' +
            '<col style="width:8%">' +
            '<col style="width:13%">' +
            '<col style="width:20%">' +
            '<col style="width:8%">' +
            '<col style="width:9%">' +
            '<col style="width:32%">' +
            '</colgroup>';

        html += '<thead><tr>' +
            '<th class="ts-col-check" title="Mark task done"></th>' +
            '<th>Priority</th>' +
            '<th>Due Date</th>' +
            '<th>Client</th>' +
            '<th>Task</th>' +
            '<th>Carrier</th>' +
            '<th>Policy Dates</th>' +
            '<th class="ts-col-notes">Agent Notes</th>' +
        '</tr></thead><tbody>';

        rows.forEach(row => {
            const rowClass = row.overdue ? ' class="ts-row-overdue"' : '';
            html += '<tr' + rowClass + '>';

            html += '<td class="ts-cell-check"><input type="checkbox" class="ts-task-check" aria-label="Mark task done"></td>';
            html += '<td class="ts-cell-priority">' + _renderPriorityBadge(row.priority) + '</td>';

            const dateDisplay = _escapeHTML(_formatDate(row.dueDate));
            const overdueMarker = row.overdue ? ' <span class="ts-overdue-inline" title="Overdue">⚠</span>' : '';
            html += '<td class="ts-cell-date">' + dateDisplay + overdueMarker + '</td>';

            html += '<td class="ts-cell-client">' + _escapeHTML(_displayClient(row.client)) + '</td>';

            let taskText = _escapeHTML(_truncate(row.task, 70));
            if (row._dupeCount) taskText += ' <span class="ts-dedupe-count">+' + row._dupeCount + ' more</span>';
            html += '<td class="ts-cell-task">' + taskText + '</td>';

            html += '<td class="ts-cell-carrier">' + _escapeHTML(_truncate(row.carrier, 22)) + '</td>';
            html += '<td class="ts-cell-policy-dates">' + _renderPolicyDates(row) + '</td>';

            const notesText = hasCsvNotes && row.notes ? _escapeHTML(row.notes) : '';
            html += '<td class="ts-cell-notes"><div class="ts-notes-edit" contenteditable="true" spellcheck="false" data-placeholder="write here">' + notesText + '</div></td>';

            html += '</tr>';
        });

        html += '</tbody></table>';
        return html;
    }

    function _renderTeamTables(rows) {
        const outEl = document.getElementById('ts-output');
        if (!outEl) return;

        const agencyName = _getAgencyName();
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        // Group by assignee, preserving sort order within each group
        const groups = new Map();
        rows.forEach(row => {
            const key = row.assignee || 'Unassigned';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        });

        // Sort assignee names alphabetically so pages are predictable
        const sortedAgents = [...groups.keys()].sort((a, b) => a.localeCompare(b));

        let html = '';
        sortedAgents.forEach((agent, idx) => {
            const agentRows = groups.get(agent);
            const overdueCount = agentRows.filter(r => r.overdue).length;
            const countStr = agentRows.length + ' task' + (agentRows.length !== 1 ? 's' : '');
            const overdueStr = overdueCount > 0
                ? ' &nbsp;&middot;&nbsp; <span class="ts-meta-overdue">' + overdueCount + ' overdue</span>'
                : '';

            // Strip code prefix like "HRS - " to get just the name
            const displayName = agent.replace(/^[A-Z]{2,4}\s*-\s*/, '').trim();
            const pageTitle = displayName
                ? displayName + (displayName.endsWith('s') ? '\u2019 Tasks' : '\u2019s Tasks')
                : 'Tasks';

            const sectionClass = idx === 0 ? 'ts-agent-section' : 'ts-agent-section ts-agent-section-break';

            html += '<div class="' + sectionClass + '">';

            // Per-agent meta header
            html +=
                '<div class="ts-meta ts-meta-print">' +
                    '<div class="ts-meta-row">' +
                        '<span class="ts-meta-title">' + _escapeHTML(pageTitle) + '</span>' +
                        '<span class="ts-meta-date">' + _escapeHTML(dateStr) + '</span>' +
                    '</div>' +
                    '<div class="ts-meta-row ts-meta-sub-row">' +
                        '<span class="ts-meta-agency">' + _escapeHTML(agencyName) + '</span>' +
                        '<span class="ts-meta-count">' + countStr + overdueStr + '</span>' +
                    '</div>' +
                '</div>';

            html += _buildTableHTML(agentRows);
            html += '</div>';
        });

        outEl.innerHTML = html;
    }

    function _renderPolicyDates(row) {
        const eff = row.policyEffDate ? '<span class="ts-policy-label">Eff:</span> ' + _escapeHTML(row.policyEffDate) : '';
        const exp = row.policyExpDate ? '<span class="ts-policy-label">Exp:</span> ' + _escapeHTML(row.policyExpDate) : '';
        if (eff && exp) return eff + '<br>' + exp;
        if (exp) return exp;
        if (eff) return eff;
        return '';
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

    /**
     * Clean client name for display:
     * 1. Strip trailing HawkSoft numeric ID:  "Adams, Marsha C (11278)" → "Adams, Marsha C"
     * 2. Strip DBA suffix:  "Hardie Boys LLC DBA:Hardie Roofing" → "Hardie Boys LLC"
     * 3. Truncate at 28 chars so long names don't wrap and stretch row height on print
     */
    function _displayClient(val) {
        if (!val) return '';
        let clean = val.replace(/\s*\(\d+\)\s*$/, '');       // strip (ID)
        clean = clean.replace(/\s+DBA:.*$/i, '').trim();     // strip DBA:...
        clean = clean.replace(/\s+DBA\s+.*$/i, '').trim();   // strip DBA ...
        return clean.length > 28 ? clean.slice(0, 27) + '…' : clean;
    }

    /** Truncate a string to maxLen chars, appending ellipsis if needed */
    function _truncate(str, maxLen) {
        if (!str || str.length <= maxLen) return str;
        return str.slice(0, maxLen - 1) + '…';
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
        // If no 4-digit year (e.g. "Mar 9" from "Today, Mar 9"), append current year
        const withYear = /\d{4}/.test(cleaned) ? cleaned : cleaned + ' ' + new Date().getFullYear();
        const d = new Date(withYear);
        return isNaN(d.getTime()) ? null : d;
    }

    /* ═══════════════════════════════════════════════════
       UTILITIES
       ═══════════════════════════════════════════════════ */

    /**
     * Returns a personalized title: "Austin's Tasks"
     * Falls back to agency name, then generic fallback.
     */
    function _getPageTitle() {
        try {
            // Auth display name (Firebase — most authoritative)
            if (typeof Auth !== 'undefined' && Auth.displayName) {
                const first = Auth.displayName.trim().split(' ')[0];
                if (first) return first + (first.endsWith('s') ? '\u2019 Tasks' : '\u2019s Tasks');
            }
            // Onboarding name stored in localStorage
            const userName = localStorage.getItem('altech_user_name');
            if (userName && userName.trim()) {
                const first = userName.trim().split(' ')[0];
                if (first) return first + (first.endsWith('s') ? '\u2019 Tasks' : '\u2019s Tasks');
            }
        } catch (e) { /* ignore */ }
        return 'My Tasks';
    }

    /** Agency name for the sub-line. */
    function _getAgencyName() {
        try {
            const profile = localStorage.getItem('altech_agency_profile');
            if (profile) {
                const parsed = JSON.parse(profile);
                if (parsed && parsed.agencyName) return parsed.agencyName;
            }
        } catch (e) { /* ignore */ }
        return 'Altech Insurance Agency';
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
        const outEl      = document.getElementById('ts-output');
        const metaEl     = document.getElementById('ts-meta');
        const filterEl   = document.getElementById('ts-agent-filter');
        const dropEl     = document.getElementById('ts-drop-zone');
        const addDropEl  = document.getElementById('ts-add-drop-zone');
        const errEl      = document.getElementById('ts-error');
        const printBtn   = document.getElementById('ts-print-btn');
        const clearBtn   = document.getElementById('ts-clear-btn');
        const showAllBtn = document.getElementById('ts-show-all-btn');
        const dedupeBtn  = document.getElementById('ts-dedupe-btn');

        _rows        = [];
        _showAll     = false;
        _dedupedMode = false;
        _teamMode    = false;

        if (outEl)      { outEl.innerHTML = ''; outEl.classList.remove('ts-show-all-rows'); }
        if (metaEl)     { metaEl.innerHTML = ''; metaEl.style.display = 'none'; }
        if (filterEl)   { filterEl.innerHTML = ''; filterEl.style.display = 'none'; }
        if (errEl)      errEl.style.display = 'none';
        if (dropEl)     dropEl.style.display = '';
        if (addDropEl)  addDropEl.style.display = 'none';
        if (printBtn)   printBtn.style.display = 'none';
        if (showAllBtn) { showAllBtn.style.display = 'none'; showAllBtn.classList.remove('ts-header-btn-active'); showAllBtn.textContent = 'Print All'; }
        if (dedupeBtn)  { dedupeBtn.style.display = 'none'; dedupeBtn.classList.remove('ts-header-btn-active'); }
        if (clearBtn)   clearBtn.style.display = 'none';
    }

    /* ═══════════════════════════════════════════════════
       PUBLIC API
       ═══════════════════════════════════════════════════ */

    return { init, render };
})();
