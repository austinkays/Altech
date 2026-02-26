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

**Stack:** Vanilla JS SPA (`index.html` ~702 lines), 20 CSS files in `css/` (~13,300 lines), 34 JS modules in `js/` (~27,200 lines), 14 plugin HTML files in `plugins/`, 13 serverless APIs in `api/`. Firebase Auth + Firestore for cloud sync. Deployed to Vercel.

> **Full documentation:** See [AGENTS.md](../AGENTS.md) (869 lines) and [QUICKREF.md](../QUICKREF.md) for complete architecture reference.

```bash
npm run dev          # Local server
npm test             # 18 test suites, 1164+ tests (Jest + JSDOM)
npx jest --no-coverage  # Faster (skip coverage)
```

---

## Architecture: Plugin System (Config-Driven)

Tools are registered in `toolConfig` array in `js/app-init.js`. Each entry has: `key`, `icon`, `color`, `title`, `containerId`, `initModule`, `htmlFile`, `category`, optional `badge`/`hidden`.

**Categories:** `quoting` | `export` | `docs` | `ops`

**Current plugins (14):** quoting (Personal Lines), intake (AI Intake), qna (Policy Q&A), quotecompare, ezlynx, hawksoft, coi (hidden), compliance (CGL), reminders, prospect, email, accounting, quickref, vindecoder.

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

**Synced data (7 types):** settings, currentForm (`altech_v6`), cglState, clientHistory, quickRefCards, reminders, quotes.

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
| `altech_reminders` | Reminders | ✅ |
| `altech_client_history` | App | ✅ |
| `altech_dark_mode` | App (settings) | ✅ |
| `altech_coi_draft` | COI | ❌ |
| `altech_email_drafts` | EmailComposer (encrypted) | ❌ |
| `altech_acct_vault` | AccountingExport | ❌ |

---

## Testing

```bash
npm test                    # All 18 suites, 1164+ tests
npx jest --no-coverage      # Faster (skip coverage)
npx jest tests/app.test.js  # Single suite
```

Tests load `index.html` into JSDOM: `new JSDOM(html, { runScripts: 'dangerously' })`. Mock localStorage in test setup.

---

## DO ✅ / DON'T ❌

**DO:** Use exact CSS variable names (`--bg-card` not `--card`) · Keep field IDs stable · Test all 3 workflows when changing steps · Test all 3 export types · Use `|| ''` fallbacks in exports · Call `CloudSync.schedulePush()` after localStorage writes · Always use `App.save()` for form data writes · Update AGENTS.md + copilot-instructions.md + QUICKREF.md after every work session

**DON'T:** Change `altech_v6` storage key without migration · Use rgba with opacity < 0.1 for dark mode backgrounds · Hardcode API keys · Skip `escapeXML()` for XML output · Use `var(--accent)` or `var(--muted)` (they don't exist) · Write to `altech_v6` directly (bypasses encryption)

---

## Environment Variables (Vercel)

- `GOOGLE_API_KEY` — Gemini AI (scanning, vision, analysis)
- `PLACES_API_KEY` / `GOOGLE_PLACES_API_KEY` — Google Places/Maps
- `FIREBASE_*` — Firebase client config (6 vars)
- `REDIS_URL` — KV store + compliance cache
- `HAWKSOFT_CLIENT_ID` / `HAWKSOFT_CLIENT_SECRET` / `HAWKSOFT_AGENCY_ID` — HawkSoft API

*Last updated: February 27, 2026*
