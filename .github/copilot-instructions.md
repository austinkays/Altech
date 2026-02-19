# Altech - AI Coding Agent Instructions

## Quick Start

**Altech** = mobile-first insurance intake wizard. Scan policy → AI extracts data → user corrects form → save drafts → export to HawkSoft (.cmsmtf) + EZLynx (.xml) + PDF. No build step — edit HTML/CSS/JS → reload → see changes.

**Stack:** Vanilla JS SPA (`index.html` ~12,300 lines), 9 CSS files in `css/`, 16 JS modules in `js/`, 10 plugin HTML files in `plugins/`, serverless APIs in `api/`. Firebase Auth + Firestore for cloud sync. Deployed to Vercel.

```bash
npm run dev          # Local server
npm test             # 14 test suites, 881+ tests (Jest + JSDOM)
npm run test:watch   # TDD mode
```

---

## Architecture: Plugin System (Config-Driven)

Tools are registered in `toolConfig` array (~line 2235 of index.html). Each entry has: `key`, `icon`, `color`, `title`, `containerId`, `initModule`, `htmlFile`, `category`, optional `badge`/`hidden`.

**Categories:** `quoting` | `docs` | `ops` | `ref`

**Current plugins (12):** quoting (Personal Lines), qna (Policy Q&A), quotecompare, coi, compliance (CGL), reminders, prospect, email, accounting, quickref, ezlynx (hidden).

**Adding a new plugin requires 5 files/edits:**
1. `js/your-plugin.js` — IIFE module on `window.YourModule` (see `js/reminders.js` for pattern)
2. `plugins/your-plugin.html` — Plugin UI (see `plugins/compliance.html` for CGL pattern)
3. `css/your-plugin.css` — Styles using theme variables
4. `index.html` — Add to `toolConfig[]`, add `<div id="yourTool" class="plugin-container">`, add `<link>` + `<script>` tags
5. `js/cloud-sync.js` — If synced: add to `_getLocalData()`, `pushToCloud()`, `pullFromCloud()`, `deleteCloudData()` syncDocs array

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

**Never use** `--card`, `--accent`, `--muted` — they don't exist. The actual variables:

| Variable | Light | Dark | Common Mistake |
|----------|-------|------|----------------|
| `--bg` | `#E8EDF5` | `#000000` | — |
| `--bg-card` | `rgba(255,255,255,0.92)` | `#1C1C1E` | ~~`--card`~~ |
| `--bg-input` | `#EDF0F8` | `#2C2C2E` | — |
| `--text` | `#1a1a1e` | `#FFFFFF` | — |
| `--text-secondary` | `#556070` | `#98989D` | ~~`--muted`~~ |
| `--border` | `#BEC5D4` | `#38383A` | — |
| `--apple-blue` | `#007AFF` | `#0A84FF` | ~~`--accent`~~ |
| `--success` | `#34C759` | `#32D74B` | — |
| `--danger` | `#FF3B30` | `#FF453A` | — |

For dark mode overrides, prefer solid colors (`#1C1C1E`) over low-opacity rgba (`rgba(255,255,255,0.05)`) — low opacity is invisible on `#000` backgrounds.

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
| `altech_v6` | App (form data) | ✅ |
| `altech_v6_quotes` | App (drafts) | ✅ |
| `altech_cgl_state` | ComplianceDashboard | ✅ |
| `altech_quickref_cards` | QuickRef | ✅ |
| `altech_reminders` | Reminders | ✅ |
| `altech_client_history` | App | ✅ |
| `altech_dark_mode` | App (settings) | ✅ |
| `altech_coi_draft` | COI | ❌ |
| `altech_email_drafts` | EmailComposer | ❌ |
| `altech_acct_vault` | AccountingExport | ❌ |

---

## Testing

```bash
npm test                    # All 14 suites
npx jest --no-coverage      # Faster (skip coverage)
npx jest tests/app.test.js  # Single suite
```

Tests load `index.html` into JSDOM: `new JSDOM(html, { runScripts: 'dangerously' })`. Mock localStorage in test setup.

---

## DO ✅ / DON'T ❌

**DO:** Use exact CSS variable names (`--bg-card` not `--card`) · Keep field IDs stable · Test all 3 workflows when changing steps · Test all 3 export types · Use `|| ''` fallbacks in exports · Call `CloudSync.schedulePush()` after localStorage writes

**DON'T:** Change `altech_v6` storage key without migration · Use rgba with opacity < 0.1 for dark mode backgrounds · Hardcode API keys · Skip `escapeXML()` for XML output · Use `var(--accent)` or `var(--muted)` (they don't exist)

---

## Environment Variables (Vercel)

- `GOOGLE_API_KEY` — Gemini policy scanning
- `GOOGLE_PLACES_API_KEY` — Address autocomplete (optional)
- `SENDGRID_API_KEY` — Email export (UI disabled)

*Last updated: February 18, 2026*
