Before doing anything in this project, read AGENTS.md in the project 
root in full. It is the source of truth for all architecture, conventions, 
known bugs, and rules. Do not write any code until you have read it.

> **⚠️ LIVING DOCS:** After every work session, update AGENTS.md, this file, and QUICKREF.md with any changes you made — line counts, test counts, module descriptions, feature lists, and the `Last updated` date. Run `npm run audit-docs` to check for drift.

> **⚠️ WORKFLOW RULES (MANDATORY):**
> 1. **Always keep changes.** Every file edit you make must be kept automatically. Never leave changes pending user confirmation.
> 2. **Always commit & push when finishing a task.** After completing any task (feature, bugfix, refactor, doc update), stage all changed files, commit with a clear message, and `git push` to the remote. Do not wait for the user to ask.

# Altech - AI Coding Agent Instructions

## Quick Start

**Altech** = desktop-first insurance intake wizard. Scan policy → AI extracts data → user corrects form → save drafts → export to HawkSoft (.cmsmtf) + EZLynx (.xml) + PDF. No build step — edit HTML/CSS/JS → reload → see changes.

**Stack:** Vanilla JS SPA (`index.html` ~665 lines), 21 CSS files in `css/` (~16,108 lines), 35 JS modules in `js/` (~33,025 lines), 15 plugin HTML files in `plugins/` (~5,530 lines), 12 serverless APIs in `api/` (~6,307 lines). Firebase Auth + Firestore for cloud sync. Deployed to Vercel.

> **Full documentation:** See [AGENTS.md](../AGENTS.md) (985 lines) and [QUICKREF.md](../QUICKREF.md) for complete architecture reference.

```bash
npm run dev          # Local server
npm test             # 23 test suites, 1515 tests (Jest + JSDOM)
npx jest --no-coverage  # Faster (skip coverage)
```

---

## Architecture: Plugin System (Config-Driven)

Tools are registered in `toolConfig` array in `js/app-init.js`. Each entry has: `key`, `icon`, `color`, `title`, `containerId`, `initModule`, `htmlFile`, `category`, optional `badge`/`hidden`.

**Categories:** `quoting` | `export` | `docs` | `ops`

**Current plugins (15):** quoting (Personal Lines), intake (AI Intake), qna (Policy Q&A), quotecompare, ezlynx, hawksoft, coi (hidden), compliance (CGL), reminders, prospect, email, accounting, quickref, vindecoder, calllogger (HawkSoft Logger).

**Adding a new plugin requires 5 files/edits:**
1. `js/your-plugin.js` — IIFE module on `window.YourModule` (see `js/reminders.js` for pattern)
2. `plugins/your-plugin.html` — Plugin UI (see `plugins/compliance.html` for CGL pattern)
3. `css/your-plugin.css` — Styles using theme variables
4. `index.html` — Add `<div id="yourTool" class="plugin-container">`, add `<link>` + `<script>` tags
5. `js/app-init.js` — Add to `toolConfig[]`; `js/cloud-sync.js` — If synced: add to `_getLocalData()`, `pushToCloud()`, `pullFromCloud()`, `deleteCloudData()`

**Plugin loading:** `navigateTo(key)` lazy-fetches `htmlFile` into the container div, then calls `window[initModule].init()`. Plugin HTML is fetched once and cached via `dataset.loaded`.

**JS module pattern** (all plugins follow this):
```javascript
window.YourModule = (() => {
    'use strict';
    const STORAGE_KEY = 'altech_your_key';
    // ... private state and functions ...
    return { init, render, /* public API */ };
})();
```

---

## CSS Variables (CRITICAL — Use These Exact Names)

**Never use** `--card`, `--accent`, `--muted` — they don't exist. The actual variables are defined in `css/main.css` `:root` (24 variables) + `body.dark-mode` (19 overrides):

| Variable | Light | Dark | Common Mistake |
|----------|-------|------|----------------|
| `--bg` | `#FAF7F4` | `#000000` | — |
| `--bg-card` | `rgba(255,255,255,0.85)` | `#1C1C1E` | ~~`--card`~~ |
| `--bg-input` | `#F5F0EC` | `#2C2C2E` | — |
| `--text` | `#1a1a1e` | `#FFFFFF` | ~~`--text-primary`~~ |
| `--text-secondary` | `#7A6E65` | `#98989D` | ~~`--muted`~~ |
| `--text-tertiary` | `#A89888` | `#8E8E93` | — |
| `--border` | `#E5DAD0` | `#38383A` | ~~`--border-color`~~ |
| `--apple-blue` | `#007AFF` | `#0A84FF` | ~~`--accent`~~ |
| `--success` | `#34C759` | `#32D74B` | — |
| `--danger` | `#FF3B30` | `#FF453A` | — |

For dark mode overrides, prefer solid colors (`#1C1C1E`) over low-opacity rgba (`rgba(255,255,255,0.05)`) — low opacity is invisible on `#000` backgrounds.

**Dark mode selector:** `body.dark-mode .your-class` (NOT `[data-theme="dark"]`)

---

## Cloud Sync (Firebase)

**Project:** `altech-app-5f3d0` | **Auth:** Email/Password | **DB:** Firestore

**Firestore path:** `users/{uid}/sync/{docType}` + `users/{uid}/quotes/{id}`

**Synced data (11 types):** settings, currentForm (`altech_v6`), cglState, clientHistory, quickRefCards, quickRefNumbers, reminders, quotes, glossary, vaultData, vaultMeta.

When adding sync for a new data type, update 4 places in `js/cloud-sync.js`:
- `_getLocalData()` — add `yourKey: tryParse('altech_your_key')`
- `pushToCloud()` — add `_pushDoc(...)` to Promise.all
- `pullFromCloud()` — add pull + UI refresh
- `deleteCloudData()` — add to `syncDocs` array

**Trigger sync:** Call `CloudSync.schedulePush()` after saving to localStorage (debounced 3s).

---

## Form ↔ Storage Sync (Core Pattern)

Every `<input id="fieldName">` auto-syncs to `App.data.fieldName` via `localStorage.altech_v6`.

**⚠️ CRITICAL:** Field `id` = storage key. Renaming an `id` breaks persistence for existing users.

---

## Three Export Engines

| Format | Target | Validation | Escaping |
|--------|--------|------------|----------|
| CMSMTF | HawkSoft CRM | None required | Plain text `key = value` |
| XML | EZLynx | firstName, lastName, state (2 chars), DOB (YYYY-MM-DD) | `escapeXML()` required |
| PDF | Client summary | None | jsPDF library |

**When adding a form field:** decide which exports include it.

---

## Three Workflows (Test All on Step Changes)

- `workflows.home`: Steps 0,1,2,3,5,6 (property only — skip vehicles)
- `workflows.auto`: Steps 0,1,2,4,5,6 (auto only — skip property)
- `workflows.both`: Steps 0,1,2,3,4,5,6 (all)

---

## Key localStorage Keys

| Key | Module | Synced to Cloud |
|-----|--------|:-:|
| `altech_v6` | App (form data, encrypted) | ✅ |
| `altech_v6_quotes` | App (drafts, encrypted) | ✅ |
| `altech_cgl_state` | ComplianceDashboard | ✅ |
| `altech_quickref_cards` | QuickRef | ✅ |
| `altech_quickref_numbers` | QuickRef | ✅ |
| `altech_reminders` | Reminders | ✅ |
| `altech_client_history` | App | ✅ |
| `altech_dark_mode` | App (settings) | ✅ |
| `altech_coi_draft` | COI | ❌ |
| `altech_email_drafts` | EmailComposer (encrypted) | ❌ |
| `altech_acct_vault` | AccountingExport | ❌ |
| `altech_agency_glossary` | CallLogger / Settings | ✅ |

---

## Testing

```bash
npm test                    # All 23 suites, 1515 tests
npx jest --no-coverage      # Faster (skip coverage)
npx jest tests/app.test.js  # Single suite
```

Tests load `index.html` into JSDOM: `new JSDOM(html, { runScripts: 'dangerously' })`. Mock localStorage in test setup.

---

## DO ✅ / DON'T ❌

**DO:** Use exact CSS variable names (`--bg-card` not `--card`) · Keep field IDs stable · Test all 3 workflows when changing steps · Test all 3 export types · Use `|| ''` fallbacks in exports · Call `CloudSync.schedulePush()` after localStorage writes · Always use `App.save()` for form data writes · Update AGENTS.md + copilot-instructions.md + QUICKREF.md after every work session

**DON'T:** Change `altech_v6` storage key without migration · Use rgba with opacity < 0.1 for dark mode backgrounds · Hardcode API keys · Skip `escapeXML()` for XML output · Use `var(--accent)` or `var(--muted)` (they don't exist) · Write to `altech_v6` directly (bypasses encryption) · Add a new file to `api/` without checking the serverless function count (see below)

---

## ⚠️ Vercel Hobby Plan — 12 Serverless Function Limit (CRITICAL)

Vercel's Hobby plan allows **max 12 Serverless Functions** per deployment. Exceeding this causes the **entire deployment to fail** — ALL API endpoints return 404, not just the new one.

**Current count: 12 functions (AT THE LIMIT).** To add a new endpoint:
1. **Consolidate** into an existing function using `?mode=` or `?type=` query-param routing
2. **Convert** an existing function to a helper by prefixing with `_` (e.g., `_helper.js`)

Files prefixed with `_` in `api/` are NOT counted as serverless functions. Current helpers: `_ai-router.js`, `_rag-interpreter.js`.

**Before adding any file to `api/`:** `ls api/ | grep -v '^_' | wc -l` — must be ≤ 12.

---

## Environment Variables (Vercel)

- `GOOGLE_API_KEY` — Gemini AI (scanning, vision, analysis)
- `PLACES_API_KEY` / `GOOGLE_PLACES_API_KEY` — Google Places/Maps
- `FIREBASE_*` — Firebase client config (6 vars)
- `REDIS_URL` — KV store + compliance cache
- `HAWKSOFT_CLIENT_ID` / `HAWKSOFT_CLIENT_SECRET` / `HAWKSOFT_AGENCY_ID` — HawkSoft API

### Latest Session Notes (March 13, 2026)

- **8 UI/UX Improvements — Sidebar Logo, Icons, Snooze, QuickRef:** Replaced blue "AL" text logo with `<img>` tag loading `Resources/altech-logo.png`. Restyled `.sidebar-brand-logo` for image display (object-fit, border-radius). Changed Personal Lines icon from house (duplicate of Dashboard) to pencil/edit ✏️. Added `edit` SVG to `ICONS`, updated `TOOL_ICONS quoting→edit`. Removed errant `left: 0` from `#quotingTool footer` override (was hiding nav behind sidebar). Added `hidden: true` to `qna` entry in `toolConfig[]`. Rewrote `getCurrentPage()` with hash-based detection for bug reports. Changed browser title to "Altech Toolkit".
- **CGL Snooze/Sleep:** Full snooze system for CGL compliance notifications. `snoozePolicy(pn)` sets midnight-tonight expiry, logs note "🛏️ Snoozed until [date] (snooze #N)" with count tracking. `_isSnoozeActive(pn)` checks expiry, `_expireSnoozes()` called at top of `filterPolicies()` to auto-clear expired. `unsnoozePolicy(pn)` for manual wake. `isHidden()` now checks snoozed state. `clearAll()` includes `snoozedPolicies = {}`. UI: 🛏️ Sleep button next to Dismiss for active rows, amber "🛏️ Until [date]" badge + "Wake" button for snoozed rows in showHidden mode, "🛏️ Sleep Until Tomorrow" in quick-note row. CSS: `.cgl-snooze-btn`, `.cgl-snoozed-badge`, `.cgl-snooze-quick` with full dark mode.
- **QuickRef reorganized + editable numbers:** Reordered to ID Cards → Speller → Quick Dial Numbers → Phonetic Grid. Replaced hardcoded Common Numbers with editable CRUD system — `QR_NUMBERS_KEY`, `loadNumbers()`, `saveNumbers()`, `renderNumbers()`, `toggleNumberForm()`, `saveNumber()`, `editNumber()`, `deleteNumber()`. Defaults: NAIC Lookup, CLUE Report, MVR Check. Cloud synced as `quickRefNumbers` (11th doc type in 4 touchpoints).
- **Tests:** 23 suites, 1515 tests (unchanged).
- **12 files changed:** js/compliance-dashboard.js (2,448→2,502), css/compliance.css (1,234→1,275), js/quick-ref.js (293→346), css/quickref.css (233→261), plugins/quickref.html (79→78), js/cloud-sync.js (664→672), js/dashboard-widgets.js (976→886), css/sidebar.css (765→726), js/bug-report.js (260→232), css/main.css (3,486→3,366), js/app-init.js (85→86), index.html (665).

### Previous Session Notes (March 12, 2026)

- **Vault UI Polish — Clean Toolbar, Form, Empty State:** Replaced global `.btn .btn-primary` (heavy gradient+shimmer) with dedicated `.acct-toolbar-btn`/`.acct-toolbar-add`/`.acct-toolbar-lock` classes with inline SVG icons. Removed nested `<div class="card">` wrapper (caused double borders) — form itself is now the card with `.acct-form-grid` (3-column), `.acct-form-field` wrappers with proper labels, `.acct-color-wrapper` squircle around color picker. Custom Fields uses `.acct-fields-section`/`.acct-fields-header`. Balanced Save/Cancel buttons. Empty state now SVG credit card icon with title+subtitle. Full dark mode for all new elements.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **3 files changed:** js/accounting-export.js (765→856 lines), css/accounting.css (412→467 lines), plugins/accounting.html (288→329 lines).

### Previous Session Notes (March 12, 2026)

- **Encrypted Accounting Vault — PIN + AES-256-GCM + Multi-Account CRUD:** Tabbed layout: "🔐 Account Info" (vault tab) and "🛠 Export Tools" (export tab). PIN system: SHA-256 hashed, 3/6-try lockout escalation (60s/5min), Firebase re-auth recovery. AES-256-GCM encryption via CryptoHelper. Multi-account CRUD with name, type, color, dynamic custom fields. Toggle field visibility with 10s auto-re-mask, 30s clipboard auto-clear. Auto-lock: 15min inactivity + visibility change. V1 migration: old 7-field vault auto-converts to single "HawkSoft / Trust Account" on first PIN setup. Storage: `altech_acct_vault_v2` (encrypted), `altech_acct_vault_meta` (PIN hash+salt). Cloud sync: vaultData + vaultMeta pushed/pulled via Firestore (10 doc types total). Full dark mode for all new elements.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/accounting-export.js (392→765 lines), css/accounting.css (225→412 lines), plugins/accounting.html (252→288 lines), js/cloud-sync.js (651→664 lines).

### Previous Session Notes (March 11, 2026)

- **Renewed Policies Stay Urgent — needsStateUpdate Flag:** All 4 renewal detection paths in `checkForRenewals()` now set `noteData.needsStateUpdate = true` when clearing verified/dismissed markers. Note dedup: skips adding "Auto-cleared" note if flag already set (prevents spam). `markStateUpdated()` clears the flag + calls `filterPolicies()` to re-sort immediately. New `_needsStateUpdate(pn)` helper. `sortPolicies()` overrides: policies with `needsStateUpdate && !stateUpdated` always sort first (above everything). `renderPolicies()` shows amber "⚠️ Renewed" badge with `.needs-state-update` class + row tint. Full dark mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,426→2,448 lines), css/compliance.css (1,223→1,234 lines).

### Previous Session Notes (March 10, 2026)

- **Renewal Dedup — CGL Compliance Dashboard:** Added `deduplicateRenewals()` method with two-phase logic. Phase 1: same-policyNumber dedup keeps only the latest expiration, marks survivor with `_renewedFrom`. Phase 2: cross-number renewal detection — same client + same policyType with one expired and one active auto-dismisses the expired entry as superseded. Integrated at all 3 policy assignment points (before `checkForRenewals()`). Blue "🔄 Renewed" / "🔄 Renewal confirmed" badge in dates column with dark mode support.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,356→2,426 lines), css/compliance.css (1,211→1,223 lines).

### Previous Session Notes (March 10, 2026)

- **Employment & Education Consolidation — Inline in About You Card:** Removed standalone Employment & Education card from Step 1. Moved education/occupation/industry selects inline into the About You card between marital status and co-applicant toggle, with "→ Also on Drivers" badge. Added co-applicant Employment & Education (`#coEmploymentSection`) inside `#coApplicantSection` with `coEducation`, `coOccupation`, `coIndustry` selects. Industry `onchange` calls `_populateCoOccupation()`.
- **`_populateCoOccupation(industry, currentValue)`:** New method mirrors `_populateOccupation()` targeting `#coOccupation` using shared `_OCCUPATIONS_BY_INDUSTRY` map. Called from `applyData()`.
- **Demo client data:** Added `coEducation: 'Bachelors'`, `coOccupation: 'Software Engineer'`, `coIndustry: 'Information Technology'` to `loadDemoClient()`.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** plugins/quoting.html (2,019→2,091 lines), js/app-core.js (2,475→2,495 lines).

### Previous Session Notes (March 10, 2026)

- **Print-to-PDF — Commercial Policy Dashboard:** Added Print button in header, selection toolbar with Select All/Deselect All/count/Generate PDF/Cancel. Checkbox column injected into table in print mode (excludes verified/dismissed). Landscape A4 PDF via jsPDF with color-coded status, all note entries with timestamps, alternating row shading, page numbers. `refresh()` auto-exits print mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **3 files changed:** plugins/compliance.html (206→223 lines), css/compliance.css (1,046→1,211 lines), js/compliance-dashboard.js (2,147→2,356 lines).

### Previous Session Notes (March 9, 2026)

- **SOS Lookup Overhaul — Oregon Socrata + WA DOR Fallback + AZ Deep Link:** Fixed all 3 state SOS lookups that were returning null/failing.
- **Oregon SOS:** Replaced dead HTML scraper with real Oregon Socrata API (`data.oregon.gov/resource/tckn-sxa6.json`). SoQL queries, groups records by `registry_number`, extracts agents and principals.
- **WA SOS DOR fallback:** All 3 WA SOS error paths now try WA DOR API (`secure.dor.wa.gov/gteunauth/_/GetBusinesses`) before falling back to manual search. Returns `partialData: true` with UBI, trade name, entity type, status.
- **Arizona SOS deep link:** Replaced dead scraper with pre-filled deep link to eCorp search results. Returns `deepLinked: true` with `tip`.
- **Client-side display:** New status pills for partial data (blue) and deep link (orange). `_formatSOSData` shows partial data banner + source badge + details URL link. `_formatSOSError` rewritten with deep link support, state-specific messaging, and underwriting gap warning.
- **AI prompt update:** `buildDataContext()` now flags SOS unavailability and partial data. AI user prompt includes conditional SOS DATA GAP instruction.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** api/prospect-lookup.js (1,563→1,788 lines), js/prospect.js (1,859→1,917 lines).

### Previous Session Notes (March 8, 2026)

- **Aggressive Auto-Save — Client History Never Lost:** Fixed critical data loss bug where sessions never reached step-6 were never saved to `altech_client_history`. Root cause: `autoSaveClient()` was only called in `updateUI()` gated by `curId === 'step-6'`.
- **Auto-save on every step change:** Removed step-6 gate — `autoSaveClient()` now fires on every step transition.
- **Debounced client history save on form input:** New `_scheduleClientHistorySave()` (3s debounce) called from `save()` after every form data write.
- **Immediate save on navigation:** New `_saveClientHistoryNow()` (no debounce) called from `next()`, `prev()`, `goHome()`, `logExport()`, and `startFresh()`.
- **`beforeunload` safety net:** New handler in `app-boot.js` calls `_saveClientHistoryNow()` on page close/refresh/tab close.
- **Persistent "Save" button:** Added `btnSaveClient` with floppy disk SVG icon in quoting header, styled with hover/active states + dark mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **5 files changed:** js/app-core.js (2,219→2,475 lines), js/app-boot.js (287→295 lines), js/app-quotes.js (760→762 lines), plugins/quoting.html (2,016→2,019 lines), css/main.css (3,445→3,486 lines).

### Previous Session Notes (March 7, 2026)

- **Auto Intake — Primary Applicant Driver Sync:** New `syncPrimaryApplicantToDriver()` method auto-creates Driver 1 with `isPrimaryApplicant: true`, copying name/DOB/gender/marital/education/occupation/industry from App.data. Live-syncs via `restorePrimaryApplicantUI()` change/blur listeners on Step 1 fields. Primary applicant driver cannot be removed.
- **Per-Driver Driving History:** Removed global Driving History card from Step 4. Each driver card now has accidents textarea, violations textarea, and studentGPA input. Migration copies global→Driver 1 on first step-4 visit. PDF/CMSMTF exports aggregate per-driver data with "Driver N:" prefixes, falling back to global for backward compat.
- **Employment & Education moved to Step 1:** Demographics card relocated from Step 2 to Step 1 after co-applicant section. Renamed "Employment & Education".
- **Scan updates:** All 3 driver creation sites (DL scan, policy primary, policy additional) now include `isPrimaryApplicant`, `isCoApplicant`, `accidents`, `violations`, `studentGPA`.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **5 files changed:** plugins/quoting.html (1,926 lines), js/app-core.js (2,219 lines), js/app-vehicles.js (816 lines), js/app-export.js (963 lines), js/app-scan.js (1,585 lines).

- **PDF Export & Form Data — 7-Bug Fix:** (1) Client name blank on PDF — switched to `v()` helper with DOM fallback. (2) Dates off by one day — `formatDate()` now uses UTC getters. (3) Co-applicant section missing — three-part fix: `save(e)` guards `hasCoApplicant` checkbox, schema migration v1→v2 normalizes values, PDF/CMSMTF checks accept truthy variants. (4) Raw currency in auto coverage — wrapped 4 fields in `formatCurrency()`. (5) Satellite overlapping text — saved y position, advanced past block, enlarged thumbnail 30×24→45×36. (6) Legacy field names — added 7 migrations in v1→v2 schema. (7) Visual polish — logo 18→22, gap 16→18, satellite enlarged, "View on Maps" link replaced with plain text.
- **Schema version:** Bumped from 1 → 2 with full v1→v2 migration (hasCoApplicant normalization + 7 legacy field name renames).
- **Firestore load fix:** Added debounced `save()` at end of `applyData()` to persist cloud/history data.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/app-export.js (978→996 lines), js/app-core.js (2,342→2,376 lines).

### Previous Session Notes (March 5, 2026)

- **+ New Log Button:** Added reset button in HawkSoft Logger header — clears client, channel (→Inbound), activity, notes, preview/confirm panels. Keeps agent initials. SVG + icon.
- **Agency Glossary:** New textarea in Settings (500-char max) for custom shorthand terms (e.g., "MoE = Mutual of Enumclaw"). Stored in `altech_agency_glossary`, sent in formatOnly fetch, injected into AI userMessage, cloud-synced as 8th doc type.
- **CHANNEL_MAP LogAction Fix:** Walk-In 2→21, Email 3→33, Text 4→41. Were incorrectly using Phone sub-codes.
- **Tests:** 26 new tests. Total: 23 suites, 1515 tests.
- **9 files changed:** api/hawksoft-logger.js, plugins/call-logger.html, css/call-logger.css, js/call-logger.js, index.html, css/auth.css, js/cloud-sync.js, tests/call-logger.test.js, tests/hawksoft-logger.test.js

### Previous Session (March 4, 2026)

- **Call Logger Redesign:** Replaced `<select>` dropdown with 5 SVG-icon channel quick-tap buttons (Inbound/Outbound/Walk-In/Email/Text) + 8 activity-type pill buttons with note templates. Full HTML/CSS/JS rewrite. Added CHANNEL_MAP to hawksoft-logger.js.
- **Tests:** 26 new tests (source analysis + behavioral JSDOM). Total: 23 suites, 1489 tests.
- **6 files changed:** api/hawksoft-logger.js, plugins/call-logger.html, css/call-logger.css, js/call-logger.js, tests/call-logger.test.js, tests/hawksoft-logger.test.js
- **HawkSoft Logger Bug Fixes + Rename:** Fixed wrong method/direction/party in log push (expanded CHANNEL_MAP to objects). Fixed invisible agent initials (moved to RE: line + post-processing). Renamed Call Logger to HawkSoft Logger across 7 files with eagle icon. 5 new tests.
- **Hawk Icon + Activity Templates + activityType Pipeline:** Added hawk SVG to sidebar ICONS, updated TOOL_ICONS mapping. Updated 6 activity templates to completed-action language (Payment received, Policy change processed, etc.). Piped `activityType` through fetch body → API destructure → AI user message. Added SYSTEM_PROMPT rule 10 for activity-type voice guidance. 4 new tests.

### Previous Session (March 2, 2026)

- **Desktop Layout Overhaul**: Full-width redesign across all 15 plugins — every container widened from 1200px → 1400px, generic plugin constraint widened from 1100px → 1400px.
- **2-Column Layouts**: Q&A (380px | 1fr), Email (1fr | 1fr), VIN Decoder (1fr | 380px), Accounting (1fr | 1fr) — all with sticky right columns at 960px+ breakpoint.
- **HawkSoft Logger**: `:has()` CSS conditional grid — auto-switches from 1fr to 1fr|1fr when right column is visible.
- **Quoting Wizard**: Widened to 1400px; removed redundant 1280px override; removed step-6 hero grid/secondary row max-width caps.
- **CGL Compliance**: Stat card min-height 90px, wider search/filter inputs (280px min), larger buttons.
- **QuickRef**: 3-col phonetic grid at 960px+, 4-col at 1280px+.
- **Language**: All 12 "tap" → "click" replacements across 7 HTML/JS files for desktop-first language.
- **24 files changed**, 183 insertions, 90 deletions.
- Validation: `npx jest --no-coverage` → 23/23 suites passed, 1485/1485 tests.

*Last updated: March 13, 2026*
