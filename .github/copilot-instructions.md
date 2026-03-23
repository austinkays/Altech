Before doing anything in this project, read AGENTS.md in the project 
root in full. It is the source of truth for all architecture, conventions, 
known bugs, and rules. Do not write any code until you have read it.

> **⚠️ LIVING DOCS:** After every work session, add an entry to `CHANGELOG.md` with what changed. Run `npm run audit-docs` to check for drift.

> **⚠️ WORKFLOW RULES (MANDATORY):**
> 1. **Always keep changes.** Every file edit you make must be kept automatically. Never leave changes pending user confirmation.
> 2. **Always commit & push when finishing a task.** After completing any task (feature, bugfix, refactor, doc update), stage all changed files, commit with a clear message, and `git push` to the remote. Do not wait for the user to ask.

# Altech - AI Coding Agent Instructions

## Quick Start

**Altech** = desktop-first insurance intake wizard. Scan policy → AI extracts data → user corrects form → save drafts → export to HawkSoft (.cmsmtf) + EZLynx (.xml) + PDF. No build step — edit HTML/CSS/JS → reload → see changes.

**Stack:** Vanilla JS SPA (`index.html` ~742 lines), 32 CSS files in `css/` (~19,761 lines), 45 JS modules in `js/` (~39,326 lines), 21 plugin HTML files in `plugins/` (~6,058 lines), 12 serverless APIs in `api/` (~6,307 lines). Firebase Auth + Firestore for cloud sync. Deployed to Vercel.

> **Full documentation:** See [AGENTS.md](../AGENTS.md) and [QUICKREF.md](../QUICKREF.md) for complete architecture reference.

```bash
npm run dev          # Local server
npm test             # 26 test suites, 1672 tests (Jest + JSDOM)
npx jest --no-coverage  # Faster (skip coverage)
```

---

## Architecture: Plugin System (Config-Driven)

Tools are registered in `toolConfig` array in `js/app-init.js`. Each entry has: `key`, `icon`, `color`, `title`, `containerId`, `initModule`, `htmlFile`, `category`, optional `badge`/`hidden`.

**Categories:** `quoting` | `export` | `docs` | `ops`

**Current plugins (22):** quoting (Personal Lines), intake (AI Intake), qna (Policy Q&A), quotecompare, ezlynx, hawksoft, coi (hidden), compliance (CGL), reminders, prospect, email, accounting, quickref, vindecoder, calllogger (HawkSoft Logger), tasksheet (Task Sheet), endorsement (Endorsement Parser), returnedmail (Returned Mail Tracker), blindspot (Blind Spot Brief), decimport (Dec Page Importer), depositsheet (Deposit Sheet), broadform (Broadform Eligibility).

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
    const STORAGE_KEY = STORAGE_KEYS.YOUR_KEY;  // ✅ use STORAGE_KEYS — never hardcode 'altech_...'
    // ... private state and functions ...
    return { init, render, /* public API */ };
})();
```

**Shared tool components (`js/tools/`):** Stateless tools use a `js/tools/` subdirectory. Files prefixed with `_` in this folder (e.g., `_tool-components.js`) are shared component factories exposed on `window.ToolComponents`. Tool modules (e.g., `broadform.js`) live alongside them and depend on `window.ToolComponents`. Stateless tools skip localStorage entirely.

---

## CSS Variables (CRITICAL — Use These Exact Names)

**Never use** `--card`, `--accent`, `--muted` — they don't exist. The actual variables are defined in `css/variables.css` `:root` (24 variables) + `body.dark-mode` (19 overrides). ⚠️ Never edit `css/main.css` — it is a dead `@import` aggregator not linked in `index.html` and never loaded by the browser:

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

When adding sync for a new data type, **add one string to `SYNC_DOCS[]`** near the top of `js/cloud-sync.js` — push and delete pick it up automatically. No other changes required.

```javascript
// js/cloud-sync.js ~line 27
const SYNC_DOCS = [
    'settings', 'currentForm', 'cglState', 'clientHistory',
    'quickRefCards', 'quickRefNumbers', 'reminders', 'glossary',
    'vaultData', 'vaultMeta',
    'yourNewType',  // ← add here
];
```

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
| `altech_email_custom_prompt` | EmailComposer (custom AI persona) | ❌ |
| `altech_acct_vault` | AccountingExport | ❌ |
| `altech_agency_glossary` | CallLogger / Settings | ✅ |

---

## Testing

```bash
npm test                    # All 26 suites, 1672 tests
npx jest --no-coverage      # Faster (skip coverage)
npx jest tests/app.test.js  # Single suite
```

Tests load `index.html` into JSDOM: `new JSDOM(html, { runScripts: 'dangerously' })`. Mock localStorage in test setup.

---

## DO ✅ / DON'T ❌

**DO:** Use exact CSS variable names (`--bg-card` not `--card`) · Keep field IDs stable · Test all 3 workflows when changing steps · Test all 3 export types · Use `|| ''` fallbacks in exports · Call `CloudSync.schedulePush()` after localStorage writes · Always use `App.save()` for form data writes · Use `STORAGE_KEYS.*` for all localStorage key strings · Use `Utils.escapeHTML()`, `Utils.escapeAttr()`, `Utils.tryParseLS()`, `Utils.debounce()` — never redefine inline · Update AGENTS.md + copilot-instructions.md + QUICKREF.md after every work session

**DON'T:** Change `altech_v6` storage key without migration · Use rgba with opacity < 0.1 for dark mode backgrounds · Hardcode API keys · Skip `escapeXML()` for XML output · Use `var(--accent)` or `var(--muted)` (they don't exist) · Write to `altech_v6` directly (bypasses encryption) · Add a new file to `api/` without checking the serverless function count (see below) · Hardcode `'altech_*'` strings in modules (use `STORAGE_KEYS.*`)

---

## Agent File-Reading Discipline

- **Grep first, read targeted lines.** Use terminal `Select-String` to find exact line numbers, then read only those ranges. Never open a full file blindly.
- **One bug per session.** Don't trace callers or related functions unless the fix explicitly requires it.
- **Run `git log --oneline -10` before any bugfix.** If it was already committed, stop — don't re-fix it.
- **3-file blocker rule.** If locating the problem requires reading more than 3 files, stop and report what's blocking you.

---

## Editing HTML Files

Never use regex for multi-line replacements in `.html` files — line ending mismatches (CRLF/LF) cause silent no-matches.

Always use PowerShell `.Contains()` + `.Replace()` with explicit line endings:

```powershell
$file = "path/to/file.html"
$content = Get-Content $file -Raw -Encoding UTF8
$old = 'exact string line 1' + "`r`n" + 'exact string line 2'
$new = 'replacement line 1' + "`r`n" + 'replacement line 2'
if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    Set-Content $file -Value $content -Encoding UTF8 -NoNewline
    Write-Host "Replaced"
} else {
    Write-Host "No match — check indentation or line endings"
}
```

If `.Contains()` also fails, check indentation and whitespace exactly — copy the target string directly from a terminal read, do not type it by hand.

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
