# Task Sheet — Architecture & Developer Reference

> Last updated: March 2026
> Feature status: Production-ready
> Files: `plugins/task-sheet.html`, `js/task-sheet.js`, `css/task-sheet.css`

---

## Overview

The Task Sheet is a zero-persistence, client-side tool that converts HawkSoft CSV task exports into printable desk sheets. It supports both single-agent ("My Tasks") and full-team ("Total Overdue" / "Total Due Today") exports, and renders one landscape-formatted page per agent suitable for physical printing.

No data is sent to a server. Everything runs in the browser. The only persistent state is the agent exclusion list, which is saved to `localStorage` (and synced to Firestore via `CloudSync`).

---

## File Responsibilities

### `plugins/task-sheet.html`
The HTML shell. Contains only structure — no logic.

| Element ID | Purpose |
|---|---|
| `#ts-drop-zone` | Primary file drop/click target |
| `#ts-file-input` | Hidden `<input type="file" multiple>` |
| `#ts-add-drop-zone` | Secondary drop zone (shown after first CSV loads) |
| `#ts-add-file-input` | Hidden input for the secondary drop |
| `#ts-agent-filter` | Agent chip bar (team mode only, hidden from print) |
| `#ts-meta` | Single-agent header bar (name, date, counts) |
| `#ts-output` | Table output container |
| `#ts-print-btn` | Triggers `window.print()` |
| `#ts-show-all-btn` | Toggles 20-row cap off (single-agent mode only) |
| `#ts-dedupe-btn` | Collapses repeated task titles (single-agent mode only) |
| `#ts-clear-btn` | Resets everything, returns to drop zone |

---

### `js/task-sheet.js`
All logic. An IIFE that exposes `{ init, render }` as `window.TaskSheetModule`.

#### Module-level state

```js
let _rows        = [];     // Parsed rows from the current CSV(s)
let _showAll     = false;  // Whether the 20-row cap is lifted (single-agent)
let _dedupedMode = false;  // Whether task deduplication is active
let _teamMode    = false;  // True when Assignee column has 2+ distinct agents
```

#### Key constants

```js
PRIORITY_ORDER   // Sort weight map: '1-critical' → 0, '2-high' → 1, etc.
EXPECTED_HEADERS // All column names the parser looks for (case-insensitive)
PROFILE_KEY      // 'altech_agency_profile' — localStorage key for agent exclusions
```

#### Function map

| Function | What it does |
|---|---|
| `init()` | Wires all DOM events. Called once by the app shell. |
| `_wireEvents()` | Attaches listeners to both drop zones, file inputs, and all buttons. |
| `_handleFile(file)` | Reads a single CSV, replaces `_rows`, calls `_mergeAndRender()`. |
| `_handleMergeFile(file)` | Reads a second CSV, merges with `_rows`, dedupes, re-renders. Hides secondary drop zone. |
| `_handleTwoFiles(fileA, fileB)` | Reads both files in parallel via `Promise.all`, merges + dedupes, re-renders. |
| `_parseCSV(text)` | Strips BOM, parses header row, maps column indices, returns array of row objects. |
| `_splitCSVLine(line)` | RFC-compliant CSV splitter — handles quoted fields with embedded commas. |
| `_dedupeByIdentity(rows)` | Removes exact-duplicate tasks (same `clientId + task + dueDate`). Prefers `overdue=true` copy. |
| `_expandMultiAssignee(rows)` | Splits `"KSN - Kathleen; AJK - Austin"` into one row per agent. |
| `_sortRows(rows)` | Sorts by: due date asc → priority asc → overdue first → client name A-Z. |
| `_mergeAndRender()` | Main render orchestrator. Detects team vs single mode, calls appropriate render fn, shows/hides UI. |
| `_renderTable(rows)` | Single-agent render — writes one table to `#ts-output`. |
| `_buildTableHTML(rows)` | Shared table builder used by both single and team renderers. |
| `_renderTeamTables(rows)` | Team render — groups by assignee, slices to 15, renders one `.ts-agent-section` div per agent. |
| `_renderAgentFilter(allAgents, excluded, onToggle)` | Renders the chip bar and wires toggle clicks. Stateless — called fresh on every toggle. |
| `_loadExcluded()` | Reads `taskSheetExcludedAgents` array from `altech_agency_profile` in localStorage. |
| `_saveExcluded(excluded)` | Writes exclusion list back to localStorage and triggers `CloudSync.schedulePush()`. |
| `_toggleShowAll()` | Flips `_showAll`, adds/removes `.ts-show-all-rows` class on `#ts-output`. |
| `_toggleDedupe()` | Flips `_dedupedMode`, re-renders with `_dedupeRows()` applied. |
| `_dedupeRows(rows)` | Collapses repeated task titles, keeping the most urgent occurrence. Adds `_dupeCount` badge. |
| `_getDisplayRows()` | Returns dedupe-filtered rows if in dedupe mode, else the raw rows. |
| `_renderPriorityBadge(priority)` | Returns `<span>` with appropriate priority CSS class. |
| `_renderPolicyDates(row)` | Returns formatted Eff/Exp date lines. |
| `_displayClient(val)` | Strips HawkSoft `(ID)` suffix, DBA suffix, truncates to 28 chars. |
| `_displayPriority(val)` | Strips numeric prefix: `"2-High"` → `"High"`. |
| `_formatDate(val)` | Strips `"Today, "` prefix from date strings. |
| `_parseDate(val)` | Parses date string to `Date` object for sorting. Appends current year if no year present. |
| `_truncate(str, maxLen)` | Clips string with `…` if over limit. |
| `_getPageTitle()` | Returns `"[FirstName]'s Tasks"` from Firebase Auth or localStorage, with correct possessive. |
| `_getAgencyName()` | Returns agency name from `altech_agency_profile` in localStorage. |
| `_escapeHTML(str)` | Escapes `& < > "` for safe innerHTML injection. |
| `_showError(msg)` | Shows `#ts-error` with the given message. |
| `_clearTable()` | Full reset — clears all state, hides all UI, shows the drop zone. |

#### Row object shape

Each parsed row has these fields:

```js
{
  overdue:       Boolean,  // Overdue column non-empty
  category:      String,
  task:          String,   // Task Title column
  dueDate:       String,   // Due Date raw string (may include "Today, ")
  priority:      String,   // e.g. "2-High"
  client:        String,   // Full client string with (ID) — display uses _displayClient()
  carrier:       String,
  status:        String,
  policyExpDate: String,
  policyEffDate: String,
  assignedTo:    String,   // Created By column
  assignee:      String,   // Assignee column — may contain semicolons for multi-agent tasks
  clientId:      String,   // Client ID column — used for deduplication key
  // Set by _dedupeRows() only:
  _dupeCount:    Number    // How many duplicate tasks were collapsed
}
```

---

### `css/task-sheet.css`

Organized into clearly commented sections. All print rules live inside `@media print { }`.

#### Section index

| Section | Line range (approx) | Notes |
|---|---|---|
| Container | 1–12 | `.ts-container` max-width and padding |
| Header buttons | 13–75 | `.ts-header-btn` variants + active state |
| Agent filter chips | 120–178 | `.ts-agent-filter`, `.ts-agent-chip`, dark mode |
| Secondary drop zone | 180–221 | `.ts-add-drop-zone` — inline pill, hidden on print |
| Error | 223–238 | `.ts-error` — red callout |
| Meta bar | 239–300 | `.ts-meta`, `.ts-meta-row`, title/date/count spans |
| Table (screen) | 300–470 | `.ts-table`, column cells, checkboxes, notes, overdue, priority badges, dark mode |
| **Print styles** | 465–774 | Full `@media print` block — see below |
| Overflow notice | 776–806 | `.ts-overflow-notice` — amber on screen, ruled line on print |
| Team mode sections | 808–857 | `.ts-agent-section`, page breaks, screen dividers |
| Responsive | 859–795 | Mobile overflow and padding tweaks |

#### Print styles — key decisions

| Rule | Why |
|---|---|
| `@page { size: letter landscape; margin: 0.4in 0.35in 0.35in; }` | Standard office printer landscape |
| White header, bold bottom rule | No toner fill on the header row |
| `td { padding: 11px 6px; vertical-align: middle; }` | Spreads 15 rows across the full page height |
| `ts-cell-date` nowrap | Keeps date + ⚠ on one line; prevents double-height rows |
| `.ts-overdue-inline { display: inline !important; }` | Forces ⚠ to stay inline with the date |
| Priority badges: outline only, no fill | Toner-friendly |
| Overdue rows: left border `3pt solid #000`, white background | Visible flag without ink-heavy shading |
| `.ts-cell-notes` ruled lines | `repeating-linear-gradient` at 18px intervals, offset by padding |
| `.ts-agent-section { page-break-after: always; break-after: page; }` | Forces new page after each agent |
| `.ts-agent-section-last` overrides to `auto` | Prevents a blank trailing page after the final agent |

---

## Team Mode — How It Works

**Detection:** After parsing, if the `Assignee` column contains 2+ distinct values, `_teamMode = true`.

**Multi-CSV merge flow:**
1. User drops/selects one CSV → `_handleFile()` → stored in `_rows`
2. Secondary drop zone appears
3. User drops second CSV → `_handleMergeFile()` → `_dedupeByIdentity([..._rows, ...newRows])` → stored in `_rows`
4. OR: User drops both CSVs at once → `_handleTwoFiles()` → same merge + dedupe

**Deduplication key:** `clientId + "|" + task.toLowerCase() + "|" + dueDate.toLowerCase()`
If a duplicate is found, the `overdue=true` copy is preferred.

**Multi-assignee expansion:** Rows with `"KSN - Kathleen Worland; AJK - Austin Kays"` in Assignee are split into two separate rows before grouping, so both agents see the task on their sheet.

**Per-agent rendering:**
- Rows are grouped by assignee key (the raw string after semicolon-splitting)
- Groups are sorted alphabetically by assignee name
- Each group is sliced to `slice(0, 15)` before rendering (hard single-page cap)
- If `allAgentRows.length > 15`, a `ts-overflow-notice` div is appended below the table

**Agent filter:**
- `_loadExcluded()` reads `altech_agency_profile.taskSheetExcludedAgents` from localStorage
- Excluded agents are filtered out of `visibleRows` before `_renderTeamTables()` is called
- Toggling a chip calls `_saveExcluded()` → writes to localStorage → `CloudSync.schedulePush()`
- The chip bar is re-rendered fresh on every toggle (stateless pattern)

---

## Possessive name handling

Both `_getPageTitle()` (single-agent) and the agent display name in `_renderTeamTables()` use:

```js
name + (name.endsWith('s') ? '\u2019 Tasks' : '\u2019s Tasks')
// "Austin Kays" → "Austin Kays' Tasks"
// "Hollie Sherlock" → "Hollie Sherlock's Tasks"
```

---

## CloudSync integration

The agent exclusion list is the only data this plugin persists. It piggybacks on the existing `altech_agency_profile` localStorage key to avoid creating a new Firestore document path. The push is triggered via `CloudSync.schedulePush()` which debounces and batches with other pending changes.

---

## Known edge cases & design decisions

| Situation | Behavior |
|---|---|
| Agent has 0 tasks after filtering | Section is not rendered (filtered out before `_renderTeamTables`) |
| Task with no Assignee in team CSV | Grouped under `"Unassigned"` key |
| `Today, Mar 10` date format | `_formatDate()` strips `"Today, "` for display; `_parseDate()` appends current year for sort |
| Two identical tasks from different exports | Deduped by identity key; overdue copy wins |
| Semicolon in Assignee with whitespace | Split on `;` and `.trim()`'d — handles `"KSN; AJK"` and `"KSN ; AJK"` |
| Last agent section | Gets `.ts-agent-section-last` class → `page-break-after: auto` to prevent blank trailing page |
| Print All / Dedupe buttons | Hidden in team mode (irrelevant — each agent is already capped at 15 and shown fully) |

---

## Adding a new column to the output table

1. Add the HawkSoft column name (lowercase) to `EXPECTED_HEADERS` in `task-sheet.js`
2. Add `fieldName: get('column name')` to the row push object in `_parseCSV()`
3. Add a `<col style="width:X%">` entry in `_buildTableHTML()` — adjust other widths so they sum correctly (the check col is fixed at `38px`, rest must total `~96%`)
4. Add `<th>Column Header</th>` to the thead
5. Add the `<td>` cell in the `rows.forEach` block
6. Add any print-specific CSS to `task-sheet.css` inside `@media print`

---

## Changing the row cap

The cap is set in one place in `_renderTeamTables()`:

```js
const agentRows = allAgentRows.slice(0, 15);
```

Change `15` to adjust. The CSS rule `@media print { .ts-table tbody tr:nth-child(n+21) { display: none } }` is for **single-agent** mode only (controlled by the Print All toggle). They are independent.

---

## CSS syntax note

There is a known harmless typo in `.ts-header-btn`:

```css
.ts-header-btn {
    display: inline-flex;h   /* ← trailing 'h' — browsers ignore it gracefully */
```

This was introduced by a Claude Code Chrome extension edit. It does not affect rendering.
