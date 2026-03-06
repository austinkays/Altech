# AGENTS.md — Altech Field Lead: AI Agent Onboarding Guide

> **Last updated:** March 17, 2026
> **For:** AI coding agents working on this codebase
> **Version:** Comprehensive — read this before making ANY changes
>
> **⚠️ LIVING DOCUMENT:** This file, `.github/copilot-instructions.md`, and `QUICKREF.md` must be updated at the end of every work session. When you change code, update the docs to match — line counts, test counts, module descriptions, feature lists, and the `Last updated` date. Run `npm run audit-docs` to check for drift.

---

## 1. App Overview

**Altech Field Lead** is a desktop-first insurance intake wizard for independent insurance agents. The core workflow: scan a policy document → AI extracts data → agent corrects the form → save drafts → export to HawkSoft (`.cmsmtf`), EZLynx (browser extension bridge), or PDF.

| Attribute | Value |
|-----------|-------|
| **Stack** | Vanilla HTML/CSS/JS SPA — no build step, no framework |
| **Entry point** | `index.html` (~665 lines) |
| **CSS** | 21 files in `css/` (~16,108 lines total) |
| **JS** | 35 modules in `js/` (~33,025 lines total) |
| **Plugins** | 15 HTML templates in `plugins/` (~5,530 lines total) |
| **APIs** | 12 serverless functions + 2 helpers in `api/` (~6,307 lines total) |
| **Auth** | Firebase Auth (email/password, compat SDK v10.12.0) |
| **Database** | Firestore (`users/{uid}/sync/{docType}`, `users/{uid}/quotes/{id}`) |
| **Encryption** | AES-256-GCM via Web Crypto API (`CryptoHelper`) |
| **Local server** | `server.js` (Node.js ESM, 680 lines) |
| **Deploy** | Vercel (serverless functions + static) |
| **Desktop** | Tauri v2 (optional, `src-tauri/`) |
| **Tests** | Jest + JSDOM, 23 suites, 1515 tests |
| **Package** | ESM (`"type": "module"` in package.json) |
| **Author** | Austin Kays |
| **License** | MIT |
| **Repo** | `github.com/austinkays/Altech` |

### Quick Commands

```bash
npm run dev           # Local dev server (server.js on port 3000)
npm test              # All 23 test suites, 1485 tests
npx jest --no-coverage  # Faster (skip coverage)
npm run deploy:vercel   # Production deploy
```

### Key URLs

| Environment | URL |
|-------------|-----|
| Production | `https://altech.agency` |
| Vercel dashboard | Vercel project `altech-field-lead` |
| Firebase console | Project `altech-app-5f3d0` |

---

## 2. File Structure

```
/
├── index.html                  # SPA shell (665 lines) — CSS links, DOM skeleton, script tags
├── server.js                   # Local dev server (677 lines) — static + API proxy + local endpoints
├── vercel.json                 # Vercel config — function timeouts, rewrites, security headers, CSP
├── package.json                # ESM, scripts, 3 deps (ioredis, pdf-lib, stripe), 4 devDeps
├── jest.config.cjs             # Test config — node env, tests/ dir, coverage from index.html + api/ + lib/
├── firebase.json               # Firebase hosting config
├── firestore.rules             # Security rules (99 lines) — owner-only, admin guards, size limits
├── sw.js                       # Service worker
│
├── css/                        # 21 stylesheets (~16,108 lines)
│   ├── main.css                # ★ Core styles + :root variables + desktop overhaul + Save button (3,366 lines) — THE source of truth
│   ├── theme-professional.css  # Dark pro theme, body.theme-pro overrides (350 lines)
│   ├── sidebar.css             # Desktop/tablet/mobile sidebar layouts + img logo (726 lines)
│   ├── dashboard.css           # Bento grid dashboard widgets (1,026 lines)
│   ├── call-logger.css         # HawkSoft Logger plugin + desktop two-column layout + 5-channel/8-activity quick-tap buttons + status bar + client autocomplete + policy selector + HawkSoft deep links + New Log button (1,202 lines)
│   ├── compliance.css          # CGL compliance dashboard + print-to-PDF toolbar + renewal dedup badge + needs-state-update badge + snooze styles (1,275 lines)
│   ├── auth.css                # Auth modal + settings + Agency Glossary textarea (1,009 lines)
│   ├── reminders.css           # Task reminders (1,120 lines)
│   ├── intake-assist.css       # AI intake professional UI — enhanced cards, gradient bubbles, dark mode elevation, wide-screen scaling (1,525 lines)
│   ├── ezlynx.css              # EZLynx export — standalone dark palette (590 lines)
│   ├── vin-decoder.css         # VIN decoder (600 lines)
│   ├── hawksoft.css            # HawkSoft export (555 lines)
│   ├── quote-compare.css       # Quote comparison tool (462 lines)
│   ├── onboarding.css          # First-run wizard (411 lines)
│   ├── admin.css               # Admin panel (300 lines)
│   ├── bug-report.css          # Bug reporter (227 lines)
│   ├── quickref.css            # Quick reference — teal accent + editable number rows (261 lines)
│   ├── security-info.css       # Security modal (217 lines)
│   ├── accounting.css          # Accounting vault + export — tab bar, PIN gate, polished form/toolbar, card grid, dark mode (467 lines)
│   ├── email.css               # Email composer — purple accent + custom prompt styles (231 lines)
│   └── paywall.css             # Paywall modal (131 lines)
│
├── js/                         # 35 modules (~33,025 lines)
│   │
│   │  ★ Core App (assembled via Object.assign into global `App`)
│   ├── app-init.js             # State init, toolConfig[], workflows (86 lines)
│   ├── app-core.js             # Form handling, save/load, updateUI, navigation, schema migration, syncPrimaryApplicantToDriver, _populateCoOccupation, aggressive auto-save (2,495 lines)
│   ├── app-scan.js             # Policy document scanning, OCR, Gemini AI (1,585 lines)
│   ├── app-property.js         # Property analysis, maps, assessor data (1,728 lines)
│   ├── app-vehicles.js         # Vehicle/driver management, DL scanning, per-driver incidents (816 lines)
│   ├── app-popups.js           # Vision processing, hazard detection, popups (1,447 lines)
│   ├── app-export.js           # PDF/CMSMTF/CSV/Text exports, per-driver history aggregation, scan schema (963 lines)
│   ├── app-quotes.js           # Quote/draft management, client history auto-save (762 lines)
│   ├── app-boot.js             # Boot sequence, error boundaries, keyboard shortcuts, beforeunload safety net (295 lines)
│   │
│   │  ★ Infrastructure
│   ├── crypto-helper.js        # AES-256-GCM encrypt/decrypt, UUID generation
│   ├── firebase-config.js      # Firebase app init (fetches config from /api/config)
│   ├── auth.js                 # Firebase auth (login/signup/reset/account), apiFetch()
│   ├── cloud-sync.js           # Firestore sync (11 doc types incl. glossary + vault + quickRefNumbers, conflict resolution, 676 lines)
│   ├── ai-provider.js          # Multi-provider AI abstraction (Google/OpenRouter/OpenAI/Anthropic)
│   ├── dashboard-widgets.js    # Bento grid, sidebar render, mobile nav, breadcrumbs, edit SVG (889 lines)
│   │
│   │  ★ Plugin Modules (IIFE or const pattern, each on window.ModuleName)
│   ├── coi.js                  # ACORD 25 COI PDF generator (789 lines)
│   ├── compliance-dashboard.js # CGL compliance tracker, 6-layer persistence, print-to-PDF, renewal dedup, needsStateUpdate, snooze/sleep (2,509 lines)
│   ├── email-composer.js       # AI email polisher, encrypted drafts, dynamic persona + custom prompt override (497 lines)
│   ├── ezlynx-tool.js          # EZLynx rater export, Chrome extension bridge (1,062 lines)
│   ├── hawksoft-export.js       # HawkSoft .CMSMTF generator, full CRUD UI (1,704 lines)
│   ├── intake-assist.js         # AI conversational intake, maps, progress ring (3,097 lines)
│   ├── policy-qa.js             # Policy document Q&A chat, carrier detection (1,037 lines)
│   ├── prospect.js              # Commercial prospect investigation, risk scoring (1,917 lines)
│   ├── quick-ref.js             # NATO phonetic + agent ID cards + editable quick dial numbers (346 lines)
│   ├── quote-compare.js         # Quote comparison + AI recommendation (889 lines)
│   ├── reminders.js             # Task reminders, PST timezone, snooze/defer, weekly summary (914 lines)
│   ├── vin-decoder.js           # VIN decoder with NHTSA API (785 lines)
│   ├── accounting-export.js     # Encrypted vault (AES-256-GCM, PIN, multi-account CRUD) + trust deposit calculator (856 lines)
│   ├── call-logger.js          # HawkSoft Logger � two-step preview/confirm, 5-channel quick-tap, 8 activity-type buttons with templates, + New Log reset, Agency Glossary, client→policy autocomplete, HawkSoft deep links, personal lines + prospect support, status bar + manual refresh, hawksoftPolicyId pipeline (1,185 lines)
│   │
│   │  ★ Support Modules
│   ├── onboarding.js            # 4-step first-run wizard, invite codes (413 lines)
│   ├── paywall.js               # Stripe paywall (beta, disabled) (229 lines)
│   ├── admin-panel.js           # User management admin panel (246 lines)
│   ├── bug-report.js            # GitHub Issue bug reporter, hash-based page detection (232 lines)
│   ├── data-backup.js           # Import/export all data + keyboard shortcuts (121 lines)
│   └── hawksoft-integration.js  # HawkSoft REST API client (261 lines)
│
├── plugins/                    # 15 HTML templates (~5,530 lines, loaded dynamically)
│   ├── quoting.html            # ★ Main intake wizard — 7 steps, Employment & Education inline in About You card, 2,091 lines
│   ├── ezlynx.html             # EZLynx rater form — 80+ fields, 1,077 lines
│   ├── coi.html                # ACORD 25 COI form (418 lines)
│   ├── prospect.html           # Commercial investigation UI (333 lines)
│   ├── accounting.html         # Accounting vault + export — tabbed layout, PIN screens, polished form/toolbar, account cards (329 lines)
│   ├── compliance.html         # CGL dashboard + print toolbar (223 lines)
│   ├── vin-decoder.html        # VIN decoder (141 lines)
│   ├── reminders.html          # Task manager (144 lines)
│   ├── intake-assist.html      # AI chat two-pane (152 lines)
│   ├── quotecompare.html       # Quote comparison (117 lines)
│   ├── email.html              # Email composer + custom AI persona section (125 lines)
│   ├── qna.html                # Policy Q&A chat (95 lines)
│   ├── quickref.html           # Quick reference — ID cards, speller, editable numbers, phonetic grid (78 lines)
│   ├── call-logger.html        # HawkSoft Logger + standard header + desktop two-column grid + 5 channel buttons + 8 activity buttons + status bar + client autocomplete + New Log button (135 lines)
│   └── hawksoft.html           # HawkSoft export (21 lines — JS renders body)
│
├── api/                        # 12 serverless functions + 2 helpers (~6,210 lines) ⚠️ Hobby plan MAX = 12 functions
│   ├── _ai-router.js           # ★ Shared: multi-provider AI router (NOT an endpoint)
│   ├── config.js               # Firebase config, API keys, phonetics, bug reports
│   ├── policy-scan.js          # OCR document extraction via Gemini (260 lines)
│   ├── vision-processor.js     # Image/PDF analysis, DL scanning, aerial analysis (880 lines)
│   ├── property-intelligence.js # ArcGIS parcels, satellite AI, fire stations (1,247 lines)
│   ├── prospect-lookup.js      # Multi-source business investigation (1,788 lines)
│   ├── compliance.js           # HawkSoft API CGL policy fetcher + Redis cache + allClientsList + hawksoftPolicyId (478 lines)
│   ├── historical-analyzer.js  # AI property value/insurance trend analysis
│   ├── _rag-interpreter.js     # County assessor data → insurance fields (helper, routed via property-intelligence)
│   ├── kv-store.js             # Per-user Redis KV store
│   ├── stripe.js               # Stripe checkout, portal, webhooks
│   ├── admin.js                # User management (admin only)
│   ├── anthropic-proxy.js      # CORS proxy for Anthropic API
│   └── hawksoft-logger.js      # AI call note formatter + HawkSoft log push, CHANNEL_MAP (5 types with correct HawkSoft LogAction codes), two-step support, policy-level logging, initials post-processing, activityType voice guidance, Agency Glossary injection (291 lines)
│
├── chrome-extension/           # EZLynx bridge Chrome extension
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── content.js / background.js
│   ├── altech-bridge.js
│   ├── property-scraper.js
│   └── defaultSchema.js
│
├── tests/                      # Jest test suites
│   ├── setup.js                # Test env setup (mock fetch, suppress crypto errors)
│   └── *.test.js               # 23 test files, 1455 tests
│
├── lib/                        # Shared server-side utilities
├── scripts/                    # Build/utility scripts
├── src-tauri/                  # Tauri desktop app (Rust)
├── python_backend/             # Python automation (Playwright HawkSoft, trust reports)
├── Resources/                  # Static assets
└── docs/                       # Architecture docs, roadmaps, guides
```

---

## 3. CSS Architecture

### 3.1 Design System Variables

All CSS variables are defined in `css/main.css`. There are **24 variables in `:root`** and **19 overrides in `body.dark-mode`**.

#### `:root` (Light Mode)

| Variable | Value | Usage |
|----------|-------|-------|
| `--apple-blue` | `#007AFF` | Primary action color |
| `--apple-blue-hover` | `#0051D5` | Hover state |
| `--apple-gray` | `#6e6e73` | Muted UI |
| `--success` | `#34C759` | Success states |
| `--danger` | `#FF3B30` | Error/danger states |
| `--bg` | `#FAF7F4` | Page background |
| `--bg-card` | `rgba(255, 255, 255, 0.85)` | Card surfaces |
| `--bg-input` | `#F5F0EC` | Form inputs |
| `--text` | `#1a1a1e` | Primary text |
| `--text-secondary` | `#7A6E65` | Secondary text |
| `--text-tertiary` | `#A89888` | Tertiary/hint text |
| `--border` | `#E5DAD0` | Borders |
| `--border-subtle` | `rgba(200, 170, 140, 0.15)` | Subtle dividers |
| `--shadow` | `rgba(0, 0, 0, 0.12)` | Box shadows |
| `--transition-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Spring easing |
| `--transition-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | Smooth easing |
| `--sidebar-width` | `240px` | Desktop sidebar |
| `--sidebar-collapsed-width` | `64px` | Collapsed sidebar |
| `--header-height` | `56px` | App header |
| `--bg-sidebar` | `rgba(255, 252, 248, 0.80)` | Sidebar background |
| `--bg-widget-hover` | `rgba(255, 248, 240, 0.95)` | Widget hover |
| `--sidebar-active` | `rgba(255, 180, 80, 0.12)` | Active sidebar item |
| `--accent-gradient` | `linear-gradient(135deg, #FF9F43, #FF6B6B)` | Brand gradient |
| `--accent-gradient-text` | `linear-gradient(135deg, #D4743C, #C44E4E)` | Text gradient |

#### `body.dark-mode` Overrides

| Variable | Dark Value |
|----------|------------|
| `--apple-blue` | `#0A84FF` |
| `--apple-blue-hover` | `#409CFF` |
| `--apple-gray` | `#98989D` |
| `--success` | `#32D74B` |
| `--danger` | `#FF453A` |
| `--bg` | `#000000` |
| `--bg-card` | `#1C1C1E` |
| `--bg-input` | `#2C2C2E` |
| `--text` | `#FFFFFF` |
| `--text-secondary` | `#98989D` |
| `--text-tertiary` | `#8E8E93` |
| `--border` | `#38383A` |
| `--border-subtle` | `#2C2C2E` |
| `--shadow` | `rgba(0, 0, 0, 0.4)` |
| `--bg-sidebar` | `#1C1C1E` |
| `--bg-widget-hover` | `#2C2C2E` |
| `--sidebar-active` | `rgba(10, 132, 255, 0.25)` |
| `--accent-gradient` | `linear-gradient(135deg, #0A84FF, #5E5CE6)` |
| `--accent-gradient-text` | `linear-gradient(135deg, #0A84FF, #5E5CE6)` |

#### Professional Theme (`body.theme-pro`)

Defined in `css/theme-professional.css` — a permanently dark OLED-black theme. Overrides the same variables as `body.dark-mode` but with slightly different values (e.g., `--text: #F5F5F7`, `--success: #30D158`).

### 3.2 Variable Naming — CRITICAL RULES

**These variable names DO NOT EXIST and MUST NEVER be used:**

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| `--card` | `--bg-card` |
| `--card-bg` | `--bg-card` |
| `--surface` | `--bg-card` |
| `--accent` | `--apple-blue` |
| `--muted` | `--text-secondary` |
| `--text-primary` | `--text` |
| `--input-bg` | `--bg-input` |
| `--border-color` | `--border` |
| `--border-light` | `--border` |

### 3.3 Dark Mode Selector Pattern

The **correct** dark mode selector is `body.dark-mode .your-class`.

**Known legacy bugs (still present in codebase):**
- `main.css` uses `.dark-mode .carrier-ac-list` etc. (missing `body` prefix) — works due to specificity but is inconsistent
- `ezlynx.css` uses `.dark-mode .ez-toolbar-btn.send-hero`
- `hawksoft.css` uses `.dark-mode .hs-client-picker`

### 3.4 Responsive Breakpoints

| Breakpoint | Semantic Meaning |
|------------|-----------------|
| `max-width: 380px` | Very small phones |
| `max-width: 480px` | Small phones |
| `max-width: 500px` | Plugin compact |
| `max-width: 520px` | Wizard compact |
| `max-width: 600px` | Tablet narrow |
| `max-width: 720px` | Tablet |
| `max-width: 767px` | Mobile (sidebar collapse) |
| `min-width: 768px` | Tablet+ |
| `min-width: 960px` | Desktop narrow |
| `min-width: 1024px` | Desktop |
| `min-width: 1280px` | Wide desktop |

### 3.5 Files Missing Dark Mode (Known Gaps)

These CSS files have zero `body.dark-mode` overrides: `vin-decoder.css`, `quote-compare.css`, `onboarding.css`, `quickref.css`, `email.css`, `paywall.css`. They rely entirely on CSS variables (which auto-switch), but any hardcoded colors in these files won't adapt to dark mode.

### 3.6 Off-System Color Palettes

Some plugins use their own hardcoded color palettes instead of the design system:
- **ezlynx.css** — Standalone dark glassmorphism with slate/sky (`#64748b`, `#94a3b8`, `#38bdf8`)
- **quickref.css** — Teal accent (`#0d9488`, `#0f766e`)
- **email.css** — Purple accent (`#7c3aed`, `#6d28d9`)
- **compliance.css** — Mixed slate/blue for type badges

---

## 4. JavaScript Architecture

### 4.1 Global `App` Object — Assembly Pattern

The core app state lives on `window.App`. It is built incrementally across 9 files via `Object.assign(App, { ... })`:

```
app-init.js      →  App = { data, step, flow, storageKey, ... }
app-core.js      →  Object.assign(App, { save, load, updateUI, navigateTo, ... })
app-scan.js      →  Object.assign(App, { processScan, openScanPicker, ... })
app-property.js  →  Object.assign(App, { smartAutoFill, openPropertyRecords, ... })
app-vehicles.js  →  Object.assign(App, { renderDrivers, renderVehicles, scanDL, ... })
app-popups.js    →  Object.assign(App, { processImage, analyzeAerial, detectHazards, ... })
app-export.js    →  Object.assign(App, { exportPDF, exportText, exportCMSMTF, ... })
app-quotes.js    →  Object.assign(App, { saveAsQuote, loadQuote, renderQuotesList, ... })
app-boot.js      →  Object.assign(App, { boot })  +  calls App.boot()
```

**Script load order matters.** `app-init.js` must load first (creates `window.App`), `app-boot.js` must load last (runs boot sequence). The order of everything in between doesn't matter as long as they all load before `app-boot.js`.

### 4.2 Plugin Module Pattern

Every plugin follows the same IIFE pattern:

```javascript
window.ModuleName = (() => {
    'use strict';
    const STORAGE_KEY = 'altech_some_key';
    // ... private state and functions ...
    return { init, render, /* public API */ };
})();
```

Plugins are lazy-loaded: `navigateTo(key)` fetches the plugin's `htmlFile` into its container div, then calls `window[initModule].init()`. The HTML is fetched once and cached via `container.dataset.loaded`.

### 4.3 Script Load Order (from index.html)

```
CDN Libraries (defer):
  firebase-app-compat.js
  firebase-auth-compat.js
  firebase-firestore-compat.js
  jszip.min.js
  jspdf.umd.min.js
  pdf.min.js (+ inline worker config)
  pdf-lib.min.js

Core App (order-dependent):
  1. crypto-helper.js        ← CryptoHelper (used by many)
  2. app-init.js             ← Creates window.App
  3. app-core.js             ← App.save(), App.load(), App.updateUI()
  4. app-scan.js             ← App.processScan()
  5. app-property.js         ← App.smartAutoFill()
  6. app-vehicles.js         ← App.renderDrivers()
  7. app-popups.js           ← App.processImage()
  8. app-export.js           ← App.exportPDF(), App.exportCMSMTF()
  9. app-quotes.js           ← App.saveAsQuote()

Standalone Modules (order-independent):
  10. ai-provider.js         ← window.AIProvider
  11. dashboard-widgets.js   ← window.DashboardWidgets

Plugin Modules (order-independent among themselves):
  12-25. coi, prospect, quick-ref, accounting-export, compliance-dashboard,
         ezlynx-tool, quote-compare, intake-assist, email-composer, policy-qa,
         reminders, hawksoft-export, vin-decoder, data-backup

Support Modules (load after plugins):
  26. bug-report.js
  27. firebase-config.js     ← Must precede auth.js
  28. auth.js                ← Must precede cloud-sync.js
  29. admin-panel.js
  30. cloud-sync.js
  31. paywall.js
  32. onboarding.js
  33. app-boot.js            ← ★ MUST BE LAST — runs boot()
```

### 4.4 Cross-File Dependencies

| Method | Defined In | Called From |
|--------|-----------|------------|
| `App.toast()` | app-core.js | Almost every module |
| `App.save()` | app-core.js | app-scan, app-property, app-vehicles, app-popups, intake-assist |
| `App.data` | app-init.js | Every module that reads form data |
| `App.drivers` / `App.vehicles` | app-init.js | vehicles, ezlynx, hawksoft, intake-assist, export |
| `App._escapeAttr()` | app-export.js | app-quotes.js (guarded with fallback) |
| `CloudSync.schedulePush()` | cloud-sync.js | quick-ref, reminders, compliance, prospect, onboarding |
| `Auth.apiFetch()` | auth.js | Most plugins that call APIs |
| `Auth.isSignedIn` | auth.js | cloud-sync, paywall, admin |
| `CryptoHelper.encrypt/decrypt` | crypto-helper.js | app-core, app-quotes, app-vehicles, app-scan, cloud-sync, email-composer |
| `AIProvider.ask/chat` | ai-provider.js | intake-assist, email-composer, policy-qa, quote-compare |

### 4.5 Encryption Flow

`CryptoHelper` (in `js/crypto-helper.js`) provides AES-256-GCM encryption using the Web Crypto API.

- **Key derivation:** PBKDF2 from a per-device salt stored in `localStorage.altech_encryption_salt`
- **Encrypted data format:** JSON string `{ iv, salt, data }` (all base64-encoded)
- **What's encrypted:** `altech_v6` (form data), `altech_v6_quotes` (drafts), email drafts, scan data, driver/vehicle lists
- **⚠️ JSDOM lacks `crypto.subtle`** — tests suppress encryption errors; encrypted fields return `null` in test environments

### 4.6 Three Workflows

| Workflow | Steps | Skip |
|----------|-------|------|
| `home` | 0 → 1 → 2 → 3 → 5 → 6 | Step 4 (vehicles) |
| `auto` | 0 → 1 → 2 → 4 → 5 → 6 | Step 3 (property) |
| `both` | 0 → 1 → 2 → 3 → 4 → 5 → 6 | Nothing |

Steps: 0=Policy Scan, 1=Applicant Info, 2=Address, 3=Property Details, 4=Vehicles & Drivers, 5=Coverage, 6=Review & Export

### 4.7 Navigation System

`App.navigateTo(toolKey)` handles all navigation:
1. `toolKey === 'dashboard'` → show dashboard, hide plugins
2. `toolKey === 'quoting'` → show quoting wizard at current step
3. Other keys → find tool in `toolConfig[]`, lazy-load HTML, call `init()`

URL hash routing: `#tool/toolKey` → `navigateTo(toolKey)`. Back button support via `popstate`.

---

## 5. Known Landmines & Historical Bugs

### 5.1 Field ID = Storage Key (CRITICAL)

Every `<input id="fieldName">` in `plugins/quoting.html` auto-syncs to `App.data.fieldName`. **Renaming an `id` attribute breaks data persistence for all existing users.** If a field must be renamed, you need a migration in `App.load()` that copies old key → new key.

### 5.2 Cross-File Function Dependencies

`App._escapeAttr()` is defined in `app-export.js` but called from `app-quotes.js`. If `app-export.js` hasn't loaded yet (or fails to load), `app-quotes.js` crashes. This is now guarded with a fallback, but the pattern is fragile.

### 5.3 Encryption Bypass Risk

`App.setFieldValue(id, value)` used to write directly to localStorage via `safeSave()`, bypassing `CryptoHelper`. This was fixed — it now calls `this.save()` — but watch for any new code that writes to `altech_v6` directly instead of going through `App.save()`.

### 5.4 Canvas/ImageBitmap Memory Leaks

`app-scan.js` and `app-vehicles.js` create canvases and ImageBitmaps for image processing. These must be explicitly cleaned up (`canvas.width = 0; canvas.height = 0; bitmap.close()`) or they leak GPU memory on mobile devices.

### 5.5 Save Race Condition

`App.save()` is debounced and protected with a `_saving` lock and `saveToken` sequence number. Any new code that saves must go through `App.save()` — never write to the storage key directly.

### 5.6 Firebase Compat SDK

The app uses Firebase compat SDK (`firebase-app-compat.js`), NOT the modular SDK. All Firebase calls use the `firebase.` namespace pattern (e.g., `firebase.auth()`, `firebase.firestore()`), not `import { getAuth }` style.

### 5.7 `alert()` Usage

Most `alert()` calls in `app-popups.js` were converted to `this.toast()`, but `alert()` still exists in some older code paths. New code should always use `App.toast(message, 'error'|'success')`.

### 5.8 JSDOM Test Limitations

Tests run in JSDOM, which lacks:
- `crypto.subtle` (encryption returns null)
- `ImageBitmap` / `OffscreenCanvas`
- `showOpenFilePicker()` / File System Access API
- `IntersectionObserver` (mocked in some tests)
- `navigator.clipboard`

### 5.9 Stale CSS Issues Still Present

- 7 CSS files have no dark mode overrides at all (see §3.5)
- 3 CSS files use legacy `.dark-mode` instead of `body.dark-mode` (see §3.3)
- 4 plugins use their own hardcoded color palettes (see §3.6)

### 5.10 Vercel Hobby Plan — 12 Serverless Function Limit (CRITICAL)

**Vercel's Hobby plan allows a maximum of 12 Serverless Functions per deployment.** Exceeding this causes the entire deployment to fail with "No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan" — which means ALL API endpoints return 404 in production, not just the new one.

**Current count: 12 functions (at the limit).** Any new API endpoint MUST either:
1. **Consolidate into an existing function** using query-parameter routing (e.g., `?mode=newFeature` or `?type=newFeature`)
2. **Convert an existing function to a helper** by prefixing with `_` (e.g., `_helper.js`) and importing it from another function

**Files prefixed with `_` in `api/` are Vercel helpers** — they are NOT counted as serverless functions and NOT deployed as endpoints. Currently: `_ai-router.js` (shared AI router) and `_rag-interpreter.js` (routed via `property-intelligence.js?mode=rag-interpret`).

**Before adding any new file to `api/`:** Count non-`_` files: `ls api/ | grep -v '^_' | wc -l` — must be ≤ 12.

### 5.11 HawkSoft REST API Integration Gotchas (CRITICAL)

The HawkSoft Logger pushes log notes to HawkSoft via `api/hawksoft-logger.js`. Several API quirks were discovered through live debugging (March 2026):

| Gotcha | Wrong | Correct |
|--------|-------|---------|
| **Log endpoint URL** | `/clients/{id}/logNotes` | `/client/{id}/log` (singular, different path) |
| **Channel field name** | `"action": 1` | `"channel": 1` — API returns "Invalid Channel" if wrong |
| **Phone channel codes** | `29` / `30` (don't exist) | `1` = Phone To Insured, `5` = Phone From Insured |
| **Walk-In/Email/Text codes** | `2` / `3` / `4` (were Phone To Carrier/Staff/3rd Party) | `21` = Walk In To Insured, `33` = Email To Insured, `41` = Text To Insured (LogAction groups of 8: Phone 1-8, Mail 9-16, Walk In 17-24, Online 25-32, Email 33-40, Text 41-48, Chat 49-56) |
| **clientNumber type** | Numeric (from API) | Must call `String()` before `.trim()` — crashes otherwise |
| **Policy-level logging** | Omit `policyId` | Include `policyId` (HawkSoft internal GUID) in body to link log to specific policy |
| **Required body fields** | `{ note, action }` | `{ refId: "UUID", ts: "ISO-timestamp", channel: <number>, note: "text" }` |

**⚠️ `docs/technical/HAWKSOFT_API_ANALYSIS.md` endpoint #7 is WRONG** — it says `"action": 29` but the real API expects `"channel"`. The receipts endpoint (#9) correctly shows `"channel"`.

**Data pipeline for `hawksoftPolicyId`:**
`api/compliance.js` (extracts `policy.id` from HawkSoft API) → cached in `allPolicies[]` → `js/call-logger.js` (threads through `_selectedPolicy` → format request → `_pendingLog` → confirm request) → `api/hawksoft-logger.js` (includes as `policyId` in HawkSoft body when present).

---

## 6. Security Rules & Authentication

### 6.1 Firestore Rules

```
users/{userId}           → owner CRUD, admin can read + set isAdmin/isBlocked
users/{userId}/sync/{docType} → owner CRUD (except subscription — read-only)
users/{userId}/quotes/{quoteId} → owner CRUD, 1MB size limit
/{everything-else}       → deny all
```

**Guard functions:** `isAuthenticated()`, `isOwner(userId)`, `hasOnlyAllowedFields(allowedFields)`, `isReasonableSize()` (< 1MB), `isPaidSubscriber(userId)`

**Admin fields:** `isAdmin` and `isBlocked` on `users/{userId}` doc — can only be set by admins, never by the user themselves.

### 6.2 API Security

All serverless functions use one of two middleware patterns:
- **`securityMiddleware`** — Basic security checks (CORS, method validation, origin check)
- **`requireAuth`** — Firebase token verification + UID extraction

API functions that require authentication: `config?type=keys`, `kv-store`, `stripe`, `admin`, `anthropic-proxy`, `prospect-lookup?type=ai-analysis`

API functions with security middleware only (no auth): `policy-scan`, `vision-processor`, `property-intelligence`, `compliance`, `historical-analyzer`

### 6.3 Content Security Policy

Defined in `vercel.json` headers:
- `script-src: 'self' 'unsafe-inline'` + Firebase, CDNjs, Google Maps
- `connect-src: 'self'` + Google APIs, Firebase
- `frame-ancestors: 'none'`
- `form-action: 'self'`

### 6.4 Encryption at Rest

Client-side AES-256-GCM encryption for sensitive localStorage data. Per-device key derived from PBKDF2 salt. Data is decrypted on read and re-encrypted on write. Cloud sync pushes encrypted data to Firestore.

---

## 7. Data Shapes & Storage

### 7.1 localStorage Keys

| Key | What | Encrypted | Cloud Synced | Module |
|-----|------|:---------:|:------------:|--------|
| `altech_v6` | Form data (all fields) | ✅ | ✅ | App (core) |
| `altech_v6_quotes` | Saved quote drafts | ✅ | ✅ | App (quotes) |
| `altech_v6_docintel` | Document intel results | ❌ | ❌ | App |
| `altech_cgl_state` | CGL annotations | ❌ | ✅ | ComplianceDashboard |
| `altech_cgl_cache` | CGL policy cache | ❌ | ❌ | ComplianceDashboard |
| `altech_quickref_cards` | Quick ref cards | ❌ | ✅ | QuickRef |
| `altech_quickref_numbers` | Quick dial numbers | ❌ | ✅ | QuickRef |
| `altech_reminders` | Task reminders | ❌ | ✅ | Reminders |
| `altech_client_history` | Client history | ❌ | ✅ | App |
| `altech_dark_mode` | Dark mode pref | ❌ | ✅ | App (settings) |
| `altech_coi_draft` | COI form draft | ❌ | ❌ | COI |
| `altech_email_drafts` | Email drafts | ✅ | ❌ | EmailComposer |
| `altech_email_custom_prompt` | Custom AI persona prompt | ❌ | ❌ | EmailComposer |
| `altech_acct_vault_v2` | Encrypted vault (AES-256-GCM) | ✅ | ✅ | AccountingExport |
| `altech_acct_vault_meta` | PIN hash + salt | ❌ | ✅ | AccountingExport |
| `altech_acct_history` | Accounting export history | ❌ | ❌ | AccountingExport |
| `altech_saved_prospects` | Saved prospect reports | ❌ | ❌ | ProspectInvestigator |
| `altech_vin_history` | VIN decode history (max 20) | ❌ | ❌ | VinDecoder |
| `altech_v6_qna` | Q&A chat state | ❌ | ❌ | PolicyQA |
| `altech_v6_quote_comparisons` | Quote comparisons (max 20) | ❌ | ❌ | QuoteCompare |
| `altech_intake_assist` | Intake chat state | ❌ | ❌ | IntakeAssist |
| `altech_hawksoft_settings` | HawkSoft export prefs | ❌ | ❌ | HawkSoftExport |
| `altech_hawksoft_history` | HawkSoft export history | ❌ | ❌ | HawkSoftExport |
| `altech_ezlynx_formdata` | EZLynx form data | ❌ | ❌ | EZLynxTool |
| `altech_ezlynx_incidents` | EZLynx incidents | ❌ | ❌ | EZLynxTool |
| `altech_onboarded` | Onboarding complete flag | ❌ | ❌ | Onboarding |
| `altech_user_name` | User's name | ❌ | ❌ | Onboarding |
| `altech_agency_profile` | Agency profile | ❌ | ❌ | Onboarding |
| `altech_agency_glossary` | Agency shorthand glossary (max 500 chars) | ? | ? | CallLogger / Settings |
| `altech_encryption_salt` | PBKDF2 salt | ❌ | ❌ | CryptoHelper |
| `altech_sync_meta` | Sync metadata | ❌ | ❌ | CloudSync |
| `gemini_api_key` | User's Gemini key | ❌ | ❌ | Multiple plugins |

### 7.2 Form Data Shape (`altech_v6`)

The form data object (`App.data`) is a flat key-value map. Field keys match HTML `id` attributes in `plugins/quoting.html`. Key fields include:

**Applicant:** `firstName`, `lastName`, `dob`, `gender`, `email`, `phone`, `maritalStatus`, `coApplicantFirst`, `coApplicantLast`, `coApplicantDob`, `coApplicantGender`, `coApplicantEmail`, `coApplicantPhone`, `coApplicantRelationship`

**Address:** `address`, `city`, `state`, `zip`, `county`

**Property:** `dwellingType`, `dwellingUsage`, `occupancy`, `yrBuilt`, `sqFt`, `numStories`, `numBathrooms`, `constructionType`, `exteriorWalls`, `foundation`, `roofType`, `roofShape`, `heatingType`, `coolingType`, `garageSpaces`, `pool`, `trampoline`, `dogBreed`, `woodStove`, `fireAlarm`, `sprinklers`, `protectionClass`

**Coverage:** `qType` (home/auto/both), `dwelling`, `liability`, `deductibleAOP`, `deductibleWind`, `bodInjury`, `propDamage`, `umUim`, `compDed`, `collDed`, `medPay`, `rental`, `towing`

**Policy:** `priorCarrier`, `priorYears`, `priorLapse`

### 7.3 Quote Draft Shape

```javascript
{
  id: "uuid-string",
  data: { /* copy of App.data */ },
  drivers: [ /* copy of App.drivers */ ],
  vehicles: [ /* copy of App.vehicles */ ],
  createdAt: "ISO-timestamp",
  updatedAt: "ISO-timestamp"
}
```

### 7.4 Cloud Sync Document Structure

Firestore path: `users/{uid}/sync/{docType}`

Each sync doc contains: `{ data: <serialized>, updatedAt: Timestamp, deviceId: "string" }`

Quotes use a subcollection: `users/{uid}/quotes/{quoteId}` with full quote data as fields.

---

## 8. Standard Agent Prompt

When starting work on this codebase, include this context in your system prompt:

```
You are working on Altech Field Lead, a vanilla JS SPA for insurance agents.

KEY RULES:
1. CSS variables: Use --bg-card (not --card/--surface), --text (not --text-primary),
   --apple-blue (not --accent), --text-secondary (not --muted), --bg-input (not --input-bg),
   --border (not --border-color/--border-light). Check css/main.css :root for truth.
2. Dark mode: Use `body.dark-mode .class` selector (not [data-theme="dark"])
3. Field IDs are storage keys — NEVER rename an input id without a migration
4. All form writes go through App.save() — never write to altech_v6 directly
5. After localStorage writes on synced data, call CloudSync.schedulePush()
6. JS modules use IIFE pattern: window.Module = (() => { return { init, ... }; })()
7. App is built via Object.assign(App, {...}) across 9 files — app-boot.js loads LAST
8. Test with: npm test (1455 tests, all must pass)
9. No build step — edit files, reload browser
10. For dark mode backgrounds, prefer solid colors (#1C1C1E) over low-opacity rgba
11. AFTER completing all work, update AGENTS.md, .github/copilot-instructions.md, and
    QUICKREF.md — line counts, test counts, descriptions, date. Run: npm run audit-docs
12. ALWAYS keep changes — never leave edits pending user confirmation
13. ALWAYS commit & push when finishing a task — stage all files, commit, git push
14. Vercel Hobby plan: MAX 12 serverless functions. Never add a new api/ file without
    checking the count. Use ?mode= routing or _ prefix helpers to consolidate. See §5.10
```

---

## 9. Pre-Deploy Checklist

### Before Every Deploy

- [ ] **All tests pass:** `npm test` → 23 suites, 1455 tests, 0 failures
- [ ] **No lint/build errors:** `get_errors()` returns clean
- [ ] **CSS variables are valid:** No `--card`, `--surface`, `--accent`, `--muted`, `--text-primary`, `--input-bg`, `--border-color`
- [ ] **Dark mode tested:** Toggle dark mode, check new/modified UI elements
- [ ] **Three workflows tested:** Set `qType` to `home`, `auto`, `both` — step through each
- [ ] **Three exports tested:** Export as PDF, CMSMTF, and XML (if applicable) — check all fields populate
- [ ] **Mobile tested:** Resize to 375px width, check no horizontal overflow
- [ ] **Encryption intact:** `App.save()` → check `altech_v6` in localStorage is encrypted JSON, not plaintext
- [ ] **Cloud sync:** Sign in, make a change, verify `CloudSync.schedulePush()` fires (3s debounce)
- [ ] **Field IDs unchanged:** No input `id` attributes were renamed without migration code
- [ ] **No hardcoded API keys:** Search for API key strings — they should be in env vars only
- [ ] **XSS check:** Any user/AI-generated content displayed in HTML uses `escapeHTML()` or equivalent
- [ ] **Memory check:** Open DevTools Memory tab, run scan/analyze flow, verify no canvas/ImageBitmap leaks
- [ ] **Serverless function count ≤ 12:** Count non-`_` files in `api/` — Vercel Hobby plan max is 12. If over, consolidate via `?mode=` routing or `_` prefix helper pattern (see §5.10)
- [ ] **Docs updated:** Run `npm run audit-docs` — fix any stale line counts, test counts, or descriptions in AGENTS.md, .github/copilot-instructions.md, and QUICKREF.md. Update the `Last updated` date.

### Vercel Environment Variables Required

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `GOOGLE_API_KEY` | ✅ | Gemini AI (scanning, vision, analysis) |
| `PLACES_API_KEY` or `GOOGLE_PLACES_API_KEY` | ✅ | Google Places/Maps |
| `FIREBASE_API_KEY` | ✅ | Firebase client config |
| `FIREBASE_AUTH_DOMAIN` | ✅ | Firebase auth |
| `FIREBASE_PROJECT_ID` | ✅ | Firebase/Firestore |
| `FIREBASE_STORAGE_BUCKET` | ✅ | Firebase storage |
| `FIREBASE_MESSAGING_SENDER_ID` | ✅ | Firebase messaging |
| `FIREBASE_APP_ID` | ✅ | Firebase app |
| `REDIS_URL` | ✅ | KV store + compliance cache |
| `HAWKSOFT_CLIENT_ID` | ✅ | HawkSoft API |
| `HAWKSOFT_CLIENT_SECRET` | ✅ | HawkSoft API |
| `HAWKSOFT_AGENCY_ID` | ✅ | HawkSoft API |
| `STRIPE_SECRET_KEY` | ⚠️ | Stripe billing (beta) |
| `STRIPE_PRICE_ID` | ⚠️ | Stripe billing (beta) |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ | Stripe webhooks (beta) |
| `APP_URL` | ⚠️ | Stripe redirect URL |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | ⚠️ | Stripe webhook → Firestore |
| `GITHUB_ISSUES_TOKEN` | ⚠️ | Bug report → GitHub Issues |
| `GITHUB_REPO_OWNER` | ⚠️ | Bug report target repo |
| `GITHUB_REPO_NAME` | ⚠️ | Bug report target repo |
| `SOCRATA_APP_TOKEN` | ⚠️ | WA L&I / OR CCB lookups |
| `SAM_GOV_API_KEY` | ⚠️ | SAM.gov federal lookups |

---

## 10. Changelog of Known Issues & Fixes

### Dashboard Layout Overhaul (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 37 | Layout | dashboard.css, index.html | Compliance widget promoted to 2-row hero (6col×2row) matching Reminders |
| 38 | Layout | dashboard.css, index.html | Recent Clients widget expanded to 6col (was 3col, renamed from widget-drafts) |
| 39 | Layout | dashboard.css | Quick Actions expanded to 6col with 6-button grid (added EZLynx + HawkSoft) |
| 40 | Feature | dashboard-widgets.js | Compliance stat pills: Critical/Warning/Current/Total counts at a glance |
| 41 | Feature | dashboard-widgets.js | Compliance shows 10 policies (was 6), with expiration dates, "View all" link |
| 42 | Feature | dashboard-widgets.js | Compliance empty/all-clear states: helpful messages when no data or all current |
| 43 | Feature | dashboard-widgets.js | Recent Clients shows 5 clients (was 3) with total count badge |
| 44 | Feature | dashboard-widgets.js, dashboard.css | Client count badge, widget-empty-sub text, compliance-policy-more link styling |

### Bugs Fixed (February 2026 Audit)

| # | Severity | File | Fix Description |
|---|----------|------|-----------------|
| 1 | CRITICAL | app-popups.js | Vision data field mappings corrected: `numGarages`→`garageSpaces`, `yearBuilt`→`yrBuilt`, `totalSqft`→`sqFt` |
| 2 | CRITICAL | app-popups.js | XSS in hazard detection — AI response HTML now escaped before DOM insertion |
| 3 | CRITICAL | app-property.js | `btoa(String.fromCharCode(...bytes))` stack overflow on large images — now chunked |
| 4 | CRITICAL | app-core.js | Null check for `user.email.split('@')` — crashes if email is null |
| 5 | CRITICAL | accounting-export.js | Added `&quot;` escaping to `escHtml()` — attribute injection vulnerability |
| 6 | HIGH | app-boot.js | Cmd+S toast fires only when save actually called (was showing even on no-op) |
| 7 | HIGH | app-boot.js | Enter key no longer overrides focused buttons (hijacked button clicks) |
| 8 | HIGH | app-core.js | Null checks on `stepTitle`, `progressBar`, `btnBack`, `btnNext` (crash on missing DOM) |
| 9 | HIGH | app-core.js | Null check on `phone` element in updateUI (crash if element missing) |
| 10 | HIGH | app-core.js | `setFieldValue()` now calls `this.save()` — was bypassing encryption |
| 11 | HIGH | app-quotes.js | Fixed `q.qType`/`q.timestamp` → `q.data?.qType`/`q.updatedAt` (wrong property paths) |
| 12 | HIGH | auth.js | Removed duplicate `getIdToken()` and `apiFetch()` methods |
| 13 | MEDIUM | app-scan.js | Canvas + ImageBitmap memory leak cleanup |
| 14 | MEDIUM | app-vehicles.js | Canvas memory leak cleanup |
| 15 | MEDIUM | app-core.js | Save race condition — added `_saving` lock + `saveToken` sequence |
| 16 | MEDIUM | app-core.js | `loadExportHistory()` cross-file dependency guard for `_escapeAttr` |
| 17 | MEDIUM | app-quotes.js | `showDuplicateWarning()` uses `escapeHTML` instead of cross-file `_escapeAttr` |
| 18 | MEDIUM | app-quotes.js | Removed duplicate `_escapeHTML` method |
| 19 | MEDIUM | app-popups.js | 15 `alert()` calls → `this.toast()` |
| 20 | MEDIUM | app-popups.js | 3 FileReader Promises got `onerror` handlers (were silently hanging) |
| 21 | LOW | data-backup.js | Fixed `\\n` double-escaped newline in string literal |

### Scanner Audit Fixes (February 2026)

| # | Severity | File | Fix Description |
|---|----------|------|------------------|
| 22 | CRITICAL | app-scan.js | Gender normalization in `applyExtractedData()` — AI returns "Male"/"Female", form needs "M"/"F" |
| 23 | HIGH | app-scan.js | Primary driver from scan now includes all fields: gender, maritalStatus, occupation, education, dlStatus, ageLicensed |
| 24 | HIGH | app-scan.js | Additional drivers from text parsing now include all fields (were missing gender, maritalStatus, etc.) |
| 25 | MEDIUM | app-scan.js | Gender normalization in `applyInitialDriverLicense()` — DL scan gender now normalized |
| 26 | MEDIUM | app-scan.js | DL scan driver creation now includes maritalStatus, education, dlStatus, ageLicensed |
| 27 | LOW | app-scan.js | Canvas cleanup on `optimizeImage()` fallback path — canvas.width/height zeroed when blob is null |
| 28 | MEDIUM | policy-scan.js | Server API schema synced with client `_getScanSchema()` — added ~40 missing fields |
| 29 | MEDIUM | policy-scan.js | Server system prompt updated with CRITICAL FORMATTING RULES section + gender M/F instruction |
| 30 | MEDIUM | policy-scan.js | Server user prompt expanded with safety/protection, claims/violations, additional field categories |

### Login innerHTML Null Guard Fixes (February 2026)

| # | Severity | File | Fix Description |
|---|----------|------|-----------------|
| 31 | CRITICAL | cloud-sync.js | `App.load()` called without `await` in `pullFromCloud()` — errors became unhandled rejections. Now properly awaited so errors are caught by outer try-catch |
| 32 | HIGH | app-core.js | `document.getElementById('mainContainer').scrollTo(0,0)` in `updateUI()` — null crash when quoting plugin not loaded. Now null-guarded |
| 33 | HIGH | app-core.js | Encrypted load path (`CryptoHelper.decrypt` + `applyData`) had no try-catch — errors propagated as unhandled rejections. Now wrapped in try-catch |
| 34 | MEDIUM | app-boot.js | Enhanced `unhandledrejection` handler to log `e.reason?.stack` instead of just `e.reason` for better debugging |
| 35 | MEDIUM | compliance-dashboard.js | Added null guards to `cglLastFetch`, loading/error/tableContainer, `cglTableBody`, `cglHiddenCount`, `cglFilteredCount`, `cglTotalCount` innerHTML assignments |
| 36 | MEDIUM | email-composer.js | Added null guards to `emailComposeBtn`, `emailOutputCard`, `emailOutputText` innerHTML/textContent in `compose()` and its catch/finally blocks |

### CSS Fixes Applied (February 2026 Audit)

| Scope | Files | Fix |
|-------|-------|-----|
| Wrong variable names | main.css (11), auth.css (3), quickref.css (8), email.css (6), compliance.css (1) | All corrected to valid `--bg-card`, `--text`, `--bg-input`, `--border` |
| Dark mode selectors | security-info.css (4 selectors) | `[data-theme="dark"]` → `body.dark-mode` |
| Missing focus states | email.css, quickref.css, onboarding.css, compliance.css, bug-report.css | Added `:focus-visible` outlines/box-shadows |
| AI Intake UI overhaul | intake-assist.css | Professional redesign: pill-shaped chips with colored tints, 1px card borders with subtle shadows, transparent card headers, circular send/upload buttons, focus glow rings, tighter layout padding, full dark mode coverage |
| AI Intake UI rework (Phase 2) | intake-assist.css, intake-assist.html | Enhanced cards (layered shadows, gradient header accents), gradient user message bubbles, spring animations, refined input area (gradient send button, enhanced focus glow), sidebar surface hierarchy (#0A0A0A→#1C1C1E→#2C2C2E), card-based empty state with pulsing icon, custom scrollbars, desktop wide-screen breakpoints (1280px/1440px), comprehensive dark mode elevation for ~30 selectors, mobile dark mode full-bleed |
| Desktop-first layout overhaul | main.css (+350 lines), reminders.css, hawksoft.css, accounting.css, email.css, quickref.css, vin-decoder.css, quote-compare.css, compliance.css | Quoting wizard: centered max-width container (960→1080→1200px), multi-column step layouts (steps 0/4/6), constrained footer, denser form grids, scan actions horizontal, wider modals. All plugins: desktop padding/spacing/grid enhancements. Generic `plugin-container > main/header` constraint at 1100px. Prospect content cap at 1000px. Footer sidebar-aware offset. |
| Viewport/scroll containment fixes | sidebar.css, intake-assist.css, main.css, quote-compare.css | Fixed narrow-width black-screen/layout collapse by stabilizing shell background + flex height chain (`app-main ? app-content ? plugin-viewport ? plugin-container`), replaced rigid chat heights with responsive clamps, and added `min-height: 0` on nested flex scroll regions so chat/content scrolls internally instead of growing downward and clipping. |
| Mobile dark mode visibility | main.css, dashboard.css, sidebar.css | Cards/widgets: border opacity 6%→10-12%, depth shadows added. Mobile `<767px`: `.app-content` bg `#0D0D0D` (lifts off pure black), header/bottom-nav solid bg + visible borders, widget accent stripes 50%→70% opacity, ambient orbs boosted, bento grid gap tightened to 12px. Footer border made visible in dark mode. |
| Call Logger UI redesign | call-logger.css, call-logger.html | Glassmorphism cards (backdrop-filter blur+saturate), hero "how-it-works" 3-step strip with gradient icons, form sections with SVG icon headers, side-by-side grid for client name + call type, gradient submit/confirm buttons, spring animations, comprehensive dark mode with solid surfaces |
| Theme-pro select chevron fix | theme-professional.css | `background:` → `background-color:` on `body.theme-pro input/select/textarea` — shorthand was overriding `background-image` SVG chevrons in Call Logger select |
| Call Logger on-demand policy pre-fetch | call-logger.js, call-logger.css | Call Logger now independently fetches policies from compliance API if cache is empty — no need to visit Compliance Dashboard first. Shows subtle "Loading client list…" hint while fetching. Tries disk cache → API → stores in `altech_cgl_cache` localStorage |
| Call Logger status bar + refresh | call-logger.html, call-logger.css, call-logger.js | Replaced hero 3-step icon strip with professional client sync status bar. Shows live loading state (pulsing blue dot + "Checking local cache…" / "Syncing clients from HawkSoft…"), success state (green dot + "X clients loaded"), and error state (red dot + message). Added "Refresh" button with spinning icon animation for manual retry. Full dark mode + responsive support. |
| Call Logger — remove AI branding + enhance confirm UX | call-logger.html, call-logger.js, call-logger.css, call-logger.test.js | Removed all user-facing "AI" references (header, placeholder, comments). Restructured confirm section with labeled summary rows (Client, Policy, Call Type) and a "Confirm Before Logging" header + review notice. Button icon changed from ✨ to 🔍. |
| Call Logger — desktop layout overhaul | call-logger.html, call-logger.css, call-logger.test.js | Replaced non-standard `plugin-header` with standard `header-top` / `tool-header-brand` pattern (home button, dark mode toggle, gradient title). Widened container from 860px to 1200px. Added two-column desktop grid (form left, preview/confirm right with sticky positioning) at 960px+ breakpoint. Added 1280px wide-screen enhancements. Header now matches Compliance, Reminders, and all other plugins. |

### Cache Pipeline Fix — Personal Lines Now Appear in Call Logger (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 45 | CRITICAL | api/compliance.js | KV (Redis) cache validity now requires `allPolicies?.length > 0` — stale server-side cache without personal lines forces re-fetch from HawkSoft |
| 46 | CRITICAL | js/compliance-dashboard.js | `_loadFromAnyCache()` all 4 sources (disk, IDB, localStorage, KV) now require both `policies` AND `allPolicies` — stale cache without personal lines is rejected |
| 47 | CRITICAL | js/compliance-dashboard.js | `loadFromCache()` (IDB → localStorage → disk fallback) also requires `allPolicies` |
| 48 | HIGH | js/call-logger.js | Disk cache path in `_ensurePoliciesLoaded()` now only accepts data with `allPolicies` — CGL-only disk cache falls through to API instead of promoting stale data |
| 49 | HIGH | js/call-logger.js | Disk cache status bar now counts unique client names (not raw policy count) for consistency |
| 50 | MEDIUM | tests/ | Added 9 new source-level tests across api-compliance, call-logger, and plugin-integration test files verifying cache requires allPolicies |

**Root cause:** The multi-tier cache system (IndexedDB → localStorage → disk → Vercel KV) validated cache entries by checking only `policies?.length > 0`. Cache written before the `allPolicies` feature (which includes personal lines) was treated as valid, promoted across all tiers, and served to the Call Logger. Users saw only ~3080 commercial clients with zero personal profiles. Fix forces all tiers to re-fetch when `allPolicies` is absent.

### Prospect/Policy-Less Client Support — All HawkSoft Clients in Call Logger (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 51 | CRITICAL | api/compliance.js | Added `allClientsList` array — built from ALL `allClients` (every HawkSoft client regardless of policy status, including pure prospects). Each entry: `{ clientNumber, clientName }` using same name resolution chain. Included in API response and metadata. |
| 52 | HIGH | js/call-logger.js | `_getClients()` now merges `allClientsList` as Source 2 — prospect/policy-less clients added to dropdown with `policies: []` and `hawksoftId` |
| 53 | HIGH | js/call-logger.js | `_handleFormat()` clientNumber fallback: `_selectedPolicy.hawksoftId → _selectedClient.hawksoftId → ''` for prospect clients |
| 54 | MEDIUM | js/call-logger.js | Confirm section shows "No active policies" badge for policy-less clients; HawkSoft link still shown using hawksoftId |
| 55 | MEDIUM | js/call-logger.js | `_countClients(data)` helper prefers `allClientsList` count over `allPolicies`-derived count in all 4 status bar update locations |
| 56 | MEDIUM | tests/ | Added 10 new tests (7 call-logger + 3 api-compliance) verifying allClientsList integration, prospect merging, deduplication, backward compat |

**Root cause:** The `allPolicies` pipeline in `api/compliance.js` has 3 filters that exclude prospect/policy-less clients: (1) skip clients with zero policies, (2) skip prospect-status policies, (3) skip expired >1yr policies. Many HawkSoft clients — especially "Prospect Customer (Personal)" entries — have no active policies and were invisible in the Call Logger. Fix adds a parallel `allClientsList` array that includes ALL clients from HawkSoft, merged into the Call Logger dropdown alongside policy-bearing clients.

### HawkSoft Log Push — Call Logger to HawkSoft Integration Fixes (March 2026)

| # | Severity | Files | Fix Description | Commit |
|---|----------|-------|-----------------|--------|
| 57 | CRITICAL | api/hawksoft-logger.js, js/call-logger.js | `.trim()` crash — HawkSoft returns numeric `clientNumber`, must call `String()` before `.trim()`. Added coercion in 5 locations. | `ace3004` |
| 58 | HIGH | api/hawksoft-logger.js | `formatOnly` response was missing `clientNumber` field — client couldn't display it in confirm section. Added to response + surfaced `hawksoftError` in toast. | `228641e` |
| 59 | CRITICAL | api/hawksoft-logger.js | 404 error — endpoint URL was `/clients/{id}/logNotes` (wrong). Changed to `/client/{id}/log` (singular, different path). Added `refId` (UUID) and `ts` (ISO timestamp) to request body. | `002781f` |
| 60 | HIGH | api/hawksoft-logger.js | "Invalid Channel" 400 error — action codes `29`/`30` don't exist for phone calls. Changed to `1` (Phone To Insured) and `5` (Phone From Insured). | `4481e38` |
| 61 | MEDIUM | api/hawksoft-logger.js, js/call-logger.js | Added comprehensive diagnostic logging to both push paths (server) and failure handler (client) for live debugging. | `1f2a807` |
| 62 | CRITICAL | api/hawksoft-logger.js | Still getting "Invalid Channel" — JSON field name was `action` but HawkSoft expects `channel`. Renamed in both push paths. | `15e781f` |
| 63 | HIGH | api/compliance.js, js/call-logger.js, api/hawksoft-logger.js | Log appeared at client level, not under specific policy. Root cause: not sending `policyId` (HawkSoft internal GUID). Threaded `hawksoftPolicyId` through entire pipeline: compliance.js → call-logger.js → hawksoft-logger.js → HawkSoft request body. | `3b77e92` |
| 64 | HIGH | css/sidebar.css, css/intake-assist.css, css/main.css, css/quote-compare.css, tests/layout-regressions.test.js, tests/boot-loading.test.js, tests/auth-cloudsync.test.js | Hardened app-shell viewport containment (`overflow-x: hidden`, `min-width: 0`, `min-height: 0` flex chain), switched Q&A/Quote Compare chat panes to responsive `clamp()` heights, and added regression/reliability tests for layout, boot-loading fallback, and Auth/CloudSync behavior. | `working tree` |

**Root cause chain:** Seven iterative fixes required because (1) HawkSoft API documentation in our codebase was incorrect (`action` vs `channel`, wrong URL path, wrong action codes), (2) HawkSoft returns numeric types where strings were expected, and (3) policy-level logging requires an internal GUID (`policyId`) that wasn't being passed through the data pipeline.

### Known Issues NOT Fixed (Intentional / Cosmetic)

- `theme-professional.css` uses low-opacity rgba on dark backgrounds (cosmetic preference)
- `theme-professional.css` `background-color` fix applied for selects — other input types unaffected
- `ezlynx.css` top half uses hardcoded glassmorphism palette (design choice, bottom half uses variables)
- 7 CSS files lack dark mode overrides (relies on variable auto-switching)
- 3 CSS files use `.dark-mode` without `body` prefix (works due to specificity)
### Desktop Layout Overhaul �" Full-Width Redesign (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 65 | GLOBAL | css/main.css | Plugin container generic constraint widened from 1100px �' 1400px (`plugin-container > main/header`) |
| 66 | GLOBAL | css/main.css | Quoting wizard main/header/footer widened from 960px �' 1400px at 960px+; removed redundant 1280px override |
| 67 | GLOBAL | css/main.css | Ultra-wide 1600px+ cap changed from `max-width: 100%` �' `1400px` for consistent constraint |
| 68 | GLOBAL | css/main.css | Step-6 export grid caps removed (`.hero-export-grid` 600px, `.hero-secondary-row` 400px) |
| 69 | GLOBAL | css/main.css | Prospect container widened from 1000px �' 1400px |
| 70 | GLOBAL | 7 HTML/JS files | All 12 "tap" �' "click" replacements for desktop-first language (prospect, quotecompare, qna, quoting ×2, ezlynx ×2, reminders, prospect.js, app-popups, index.html ×2) |
| 71 | 2-COL | plugins/qna.html, css/main.css | Q&A: 2-column desktop layout (`380px \| 1fr` grid), sticky right chat column, `.qna-desktop-layout` wrapper |
| 72 | WIDEN | css/quote-compare.css | Quote Compare container widened from 1100px �' 1400px |
| 73 | 2-COL | plugins/email.html, css/email.css | Email: 2-column desktop layout (`1fr \| 1fr` grid), sticky right column, `.email-desktop-layout` wrapper; removed 900px desktop shrink |
| 74 | 2-COL | plugins/vin-decoder.html, css/vin-decoder.css | VIN Decoder: 2-column desktop layout (`1fr \| 380px` grid), sticky right history column, `.vin-desktop-layout` wrapper; widened from 1200px �' 1400px |
| 75 | FIX | css/call-logger.css | Call Logger: widened from 1200px �' 1400px + `:has()` CSS conditional grid (single column when right col hidden, 2-column when visible) |
| 76 | 2-COL | plugins/accounting.html, css/accounting.css | Accounting: 2-column desktop layout (`1fr \| 1fr` grid), left=workflows, right=history+calculator; widened from 1200px �' 1400px; removed `.acct-steps` 700px and `.acct-filename-row` 600px inner caps |
| 77 | POLISH | css/compliance.css | CGL: stat card `min-height: 90px` for consistent card height; wider search/filter inputs (280px min); larger buttons (12px/24px padding) |
| 78 | WIDEN+GRID | css/quickref.css | QuickRef: widened from 1200px �' 1400px; 3-col phonetic grid at 960px+, 4-col at 1280px+ |
| 79 | WIDEN | css/ezlynx.css | EZLynx container widened from 1200px �' 1400px |
| 80 | WIDEN | css/hawksoft.css | HawkSoft body widened from 1200px �' 1400px |
| 81 | WIDEN | css/reminders.css | Reminders container widened from 1200px �' 1400px |
### Call Logger Redesign �" Channel & Activity Quick-Tap System (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 82 | CRITICAL | api/hawksoft-logger.js | Added `CHANNEL_MAP` object mapping 5 channel types (Inbound/Outbound/Walk-In/Email/Text) to HawkSoft channel codes (5/1/2/3/4). Replaced ternary `'Outbound' ? 1 : 5` with `CHANNEL_MAP[cleanCallType] \|\| 5` in both format-only and push paths. |
| 83 | CRITICAL | plugins/call-logger.html | Full HTML rewrite: replaced `<select id="clCallType">` with 5 SVG-icon channel quick-tap buttons (`clChannelGroup`), added 8 activity-type pill buttons with `data-template` attributes (`clActivityGroup`), inline agent initials field, span-based submit button with arrow/spinner states, plain-text confirm/cancel buttons, clipboard SVG copy button |
| 84 | CRITICAL | css/call-logger.css | Full CSS rewrite (~1,164 lines): `.cl-channel-group`/`.cl-channel-btn`/`.cl-channel-selected` for 5-button horizontal strip, `.cl-activity-group`/`.cl-activity-btn`/`.cl-activity-selected` for 8-button pill grid, `.cl-btn-text`/`.cl-btn-arrow`/`.cl-btn-spinner`/`.cl-loading` for submit button states, `.cl-initials-inline`/`.cl-input-initials` for inline initials, comprehensive `body.dark-mode` overrides for all new classes |
| 85 | HIGH | js/call-logger.js | Added `_selectedChannel`/`_selectedActivityType`/`_lastTemplate` private state + 4 new functions: `_handleChannelSelect()` (updates selection + saves), `_applyChannelUI()` (restores selection from storage), `_handleActivitySelect()` (toggle + template insertion with cursor placement), `_applyActivityUI()` (restores activity state). Updated `_load()` to restore channel/activity from localStorage. Updated `_save()` to persist `channelType`/`activityType`. Updated `_handleFormat()` �" channel icons map, `cl-loading` class toggle, confirm info shows Channel/Activity rows. Updated `_wireEvents()` with event delegation for channel/activity groups. Added public exports: `_handleChannelSelect`, `_handleActivitySelect`, `getSelectedChannel`, `getSelectedActivityType`. |
| 86 | MEDIUM | tests/call-logger.test.js | Updated 179 tests: replaced `clCallType` select references with channel button group, updated `createMiniDOM`/`createClientDOM` HTML builders, added ~20 source analysis tests (state tracking, handler functions, channel icons map, confirm labels, persistence, event delegation, return exports) + ~6 behavioral JSDOM tests (channel selection, activity selection, activity deselect toggle, channel/activity group wiring). |
| 87 | MEDIUM | tests/hawksoft-logger.test.js | Updated CHANNEL_MAP assertions: replaced ternary checks with `CHANNEL_MAP` object tests verifying all 5 channel type mappings. |

**8 activity types with note templates:** Coverage Q, Claim, Payment, Policy Change, New Quote, Renewal, Certificate, Other �" each inserts a structured template into the notes textarea with cursor positioned at first blank.

### HawkSoft Logger � Bug Fixes + Rename (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 88 | CRITICAL | api/hawksoft-logger.js | **Bug fix: wrong method/direction/party** � expanded `CHANNEL_MAP` from flat `callType ? number` to `callType ? { channel, method, direction, party }` objects. Both `logBody` constructions now include `method`, `direction`, `party` fields so HawkSoft displays correct call metadata. Added `DEFAULT_CHANNEL` fallback. |
| 89 | HIGH | api/hawksoft-logger.js | **Bug fix: initials invisible** � Updated `SYSTEM_PROMPT` FORMAT to put agent initials on the RE: subject line (line 1) instead of direction line (line 2). Added deterministic post-processing regex that ensures initials appear on RE: line regardless of AI compliance. |
| 90 | HIGH | 7 files | **Rename: Call Logger ? HawkSoft Logger** � Updated title/name in `toolConfig` (app-init.js), plugin header (call-logger.html), sidebar emoji ( ? ), quick action label, console.warn prefixes, index.html comment, test assertion. Internal `key: 'calllogger'` unchanged. |
| 91 | MEDIUM | tests/hawksoft-logger.test.js | Updated CHANNEL_MAP tests for new object shape + added logBody field tests, DEFAULT_CHANNEL test, initials post-processing tests, SYSTEM_PROMPT FORMAT test. 5 new test blocks. |

### HawkSoft Logger � Hawk Icon + Activity Templates + activityType Pipeline (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 92 | MEDIUM | js/dashboard-widgets.js | Added `hawk` SVG icon to `ICONS` object. Changed `TOOL_ICONS` mapping from `calllogger: 'phone'` to `calllogger: 'hawk'`. |
| 93 | MEDIUM | plugins/call-logger.html | Updated 6 activity note templates to completed-action language: Payment inquiry ? received, Policy Change request ? processed, Renewal discussion ? processed, Certificate request ? issued, New Quote adds premium line, Coverage Q `Action:` ? `Action taken:`. |
| 94 | HIGH | js/call-logger.js, api/hawksoft-logger.js | **activityType pipeline:** `_selectedActivityType` now sent in formatOnly fetch body ? destructured in API handler ? injected into AI user message as `Activity: {type}` line ? new SYSTEM_PROMPT rule 10 provides voice/tense guidance per activity type. |
| 95 | MEDIUM | api/hawksoft-logger.js | SYSTEM_PROMPT rule 10: activity-type voice guidance � Payment/Policy Change/Renewal/Certificate use past tense (completed), Coverage Q/New Quote may be in-progress, Claim writes as reported/filed. |
| 96 | LOW | tests/ | 4 new tests: activityType destructured from req.body, activityType in user message, conditional include, SYSTEM_PROMPT voice guidance. Total: 23 suites, 1489 tests. |

### HawkSoft Logger � + New Log Button, Agency Glossary, Channel Code Fix (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 97 | CRITICAL | api/hawksoft-logger.js | **CHANNEL_MAP LogAction codes fixed:** Walk-In 2?21, Email 3?33, Text 4?41. These were incorrectly using Phone sub-codes (To Carrier/Staff/3rd Party). Now use correct HawkSoft LogAction enum groups (Walk In 17-24, Email 33-40, Text 41-48). Walk-In method changed "In Person"?"Walk In", Email+Text direction changed "From"?"To". |
| 98 | HIGH | plugins/call-logger.html, css/call-logger.css, js/call-logger.js | **+ New Log button:** Reset button in header clears client, channel (?Inbound), activity, notes, preview/confirm panels. Keeps agent initials. SVG + icon with "New Log" label. |
| 99 | HIGH | index.html, css/auth.css, js/call-logger.js, api/hawksoft-logger.js, js/cloud-sync.js | **Agency Glossary:** Textarea in Settings (500-char max) for custom shorthand terms (e.g., "MoE = Mutual of Enumclaw"). Stored in `altech_agency_glossary`, sent in formatOnly fetch body, injected into AI userMessage (not system prompt), cloud-synced as 8th doc type. |
| 100 | MEDIUM | tests/ | 26 new tests across hawksoft-logger.test.js and call-logger.test.js: CHANNEL_MAP LogAction codes (7), Agency Glossary API (4), + New Log reset (9+3), glossary fetch (2), + New Log button HTML (1). Total: 23 suites, 1515 tests. |

### PDF Export & Form Data � 7-Bug Fix (March 2026)

| # | Severity | Files | Fix Description |
|---|----------|-------|-----------------|
| 101 | CRITICAL | js/app-export.js | **Client name blank on PDF:** `data.firstName` was empty when data stored via DOM only. Changed to `v('firstName')` / `v('lastName')` which fall back to `getElementById()`. |
| 102 | HIGH | js/app-export.js | **Dates off by one day:** `formatDate()` used local-timezone `getMonth()`/`getDate()`/`getFullYear()`. Switched to `getUTCMonth()`/`getUTCDate()`/`getUTCFullYear()` to prevent midnight-UTC shift. |
| 103 | CRITICAL | js/app-export.js, js/app-core.js | **Co-applicant section missing on PDF:** Three-part fix � (1) `save(e)` early-returns for `hasCoApplicant` checkbox to prevent delegated handler from overwriting `toggleCoApplicant()`'s `'yes'` string with boolean `true`; (2) schema migration v1?v2 normalizes existing `hasCoApplicant` values (`true`?`'yes'`, `false`/`'no'`?`''`, `'on'`?`'yes'`); (3) PDF/CMSMTF checks now accept `=== 'yes' \|\| === true \|\| === 'on'`. All `data.coXxx` fields changed to `v('coXxx')`. |
| 104 | MEDIUM | js/app-export.js | **Raw currency numbers in auto coverage PDF:** `pdLimit`, `umpdLimit`, `rentalDeductible`, `towingDeductible` now wrapped in `formatCurrency()`. |
| 105 | HIGH | js/app-export.js | **Satellite thumbnail overlapping text:** Saved `satY` before drawing, advanced `y = Math.max(y, satY + satH + 8)` after, enlarged thumbnail from 30�24 to 45�36, replaced blue "View on Maps" hyperlink with plain "Satellite View" text label. |
| 106 | MEDIUM | js/app-core.js | **Legacy field names lost on migration:** Added 7 field-name migrations in v1?v2 schema migration: `address`?`addrStreet`, `city`?`addrCity`, `state`?`addrState`, `zip`?`addrZip`, `bodInjury`?`liabilityLimits`, `propDamage`?`pdLimit`, `collDed`?`autoDeductible`. |
| 107 | LOW | js/app-export.js | **PDF visual polish:** Logo size 18?22, gap between name strip and satellite 16?18, satellite thumbnail 30�24?45�36. |
| 108 | MEDIUM | js/app-core.js | **Firestore load not persisted:** Added debounced `save()` call at end of `applyData()` so full form state is captured after cloud/history load. Schema version bumped from 1 to 2. |

### Auto Intake � Primary Applicant Driver Sync + Per-Driver History (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 109 | CRITICAL | js/app-core.js | **`syncPrimaryApplicantToDriver()`:** New method auto-creates/updates Driver 1 with `isPrimaryApplicant: true`, copying firstName, lastName, dob, gender, maritalStatus, education, occupation, industry from `App.data`. Mirrors existing co-applicant sync pattern. Called on step-4 landing. |
| 110 | HIGH | js/app-core.js | **`restorePrimaryApplicantUI()`:** Attaches change/blur listeners on Step 1 fields (firstName, lastName, dob, gender, maritalStatus, education, occupation, industry) so edits live-sync to Driver 1. Idempotent via `dataset.primarySyncBound`. |
| 111 | HIGH | js/app-vehicles.js | **Per-driver driving history UI:** Each driver card now has accidents textarea, violations textarea, and studentGPA input at bottom. All wired to `updateDriver()`. |
| 112 | HIGH | js/app-vehicles.js | **Primary applicant removal guard:** `removeDriver()` blocks removal of drivers with `isPrimaryApplicant: true` and shows toast warning. |
| 113 | HIGH | js/app-vehicles.js | **Extended locked fields:** `updateDriver()` LOCKED_FIELDS check now also blocks `isPrimaryApplicant` drivers (was only `isCoApplicant`). Badge: green "Primary Applicant" vs blue synced co-applicant. |
| 114 | HIGH | plugins/quoting.html | **Employment & Education moved to Step 1:** Demographics card (education, occupation, industry) relocated from Step 2 to Step 1 after co-applicant section. Renamed "Employment & Education". |
| 115 | HIGH | plugins/quoting.html | **Global Driving History removed from Step 4:** Removed global accidents/violations/studentGPA card. Per-driver fields rendered dynamically in JS driver cards. |
| 116 | MEDIUM | js/app-core.js | **Global-to-per-driver migration:** On first step-4 visit, copies `data.accidents`/`data.violations`/`data.studentGPA` to Driver 1 if Driver 1's fields are empty. |
| 117 | MEDIUM | js/app-export.js | **PDF/CMSMTF per-driver aggregation:** Exports now aggregate per-driver accidents/violations/studentGPA with "Driver N:" prefixes, falling back to global `data.*` for backward compatibility. |
| 118 | MEDIUM | js/app-scan.js | **Scan driver fields:** All 3 driver creation sites (DL scan, policy scan primary, policy scan additional) now include `isPrimaryApplicant`, `isCoApplicant`, `accidents`, `violations`, `studentGPA`. |

### Aggressive Auto-Save — Client History Never Lost (March 2026)

| # | Severity | Files | Fix Description |
|---|----------|-------|-----------------|
| 119 | CRITICAL | js/app-core.js | **Auto-save on every step change:** Removed step-6 gate on `autoSaveClient()` in `updateUI()` — now fires on every step transition, not just the export page. Root cause of data loss: sessions that never reached step-6 were never saved to `altech_client_history`. |
| 120 | CRITICAL | js/app-core.js | **Debounced client history save on form input:** Added `_scheduleClientHistorySave()` (3s debounce) called from `save()` after every form data write. Separate from the 500ms form-data debounce. Ensures meaningful field changes are captured even without step navigation. |
| 121 | HIGH | js/app-core.js | **Immediate save on navigation:** `_saveClientHistoryNow()` (no debounce) called from `next()`, `prev()`, `goHome()`, and `logExport()`. Cancels any pending debounced save and runs `autoSaveClient()` synchronously. |
| 122 | HIGH | js/app-boot.js | **`beforeunload` safety net:** Added `window.addEventListener('beforeunload', ...)` that calls `_saveClientHistoryNow()`. Best-effort — ensures client history is saved even on page close/refresh/tab close. |
| 123 | HIGH | js/app-quotes.js | **Save before `startFresh()`:** `startFresh()` now calls `_saveClientHistoryNow()` before wiping form data, preserving the current session in client history. |
| 124 | MEDIUM | plugins/quoting.html, css/main.css | **Persistent "Save" button in header:** Added `btnSaveClient` button with floppy disk SVG icon in `.header-right` next to the existing save indicator. Calls `_saveClientHistoryNow()` + shows toast. Styled with hover/active states, full dark mode support. |

**Root cause:** `autoSaveClient()` (the proper upsert-by-name+address function) existed and worked correctly but was only called once — in `updateUI()` gated by `curId === 'step-6'`. Users who entered data but never reached the export page had zero entries in `altech_client_history`. Evidence: completed PDF export for "Melissa Moore" in `altech_export_history` with zero corresponding `altech_client_history` entry.

**5 files changed:** js/app-core.js (2,219→2,475 lines), js/app-boot.js (287→295 lines), js/app-quotes.js (760→762 lines), plugins/quoting.html (2,016→2,019 lines), css/main.css (3,445→3,486 lines).

### Print-to-PDF — Commercial Policy Dashboard (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 133 | HIGH | plugins/compliance.html | Added 🖨 Print button in header toolbar alongside Backup/Options/Refresh. Added hidden print selection toolbar with Select All/Deselect All, count badge, Generate PDF, and Cancel buttons. |
| 134 | HIGH | css/compliance.css | Added `.cgl-print-toolbar`, `.cgl-print-checkbox`, `.cgl-print-selected`, `.cgl-print-generate`, `.cgl-print-cancel` styles with full dark mode overrides. |
| 135 | CRITICAL | js/compliance-dashboard.js | Added `_printMode` and `_selectedForPrint` state. `togglePrintMode()` enters/exits selection mode. `renderPolicies()` injects checkbox column (thead + tbody) when active, excludes verified/dismissed policies. Dynamic colspan for empty/note/show-more rows. |
| 136 | CRITICAL | js/compliance-dashboard.js | `generatePrintPDF()` — landscape A4 PDF with jsPDF. Columns: Status (color-coded), Type, Client Name, Policy#, Expiration, Carrier, Notes (all entries with timestamps). Alternating row shading, page breaks, page numbers, date+counts header. |
| 137 | MEDIUM | js/compliance-dashboard.js | `togglePrintSelect(pn)` / `togglePrintSelectAll()` for individual/bulk selection. `updatePrintCount()` enables/disables Generate button. `refresh()` auto-exits print mode. |

**3 files changed:** plugins/compliance.html (206→223 lines), css/compliance.css (1,046→1,211 lines), js/compliance-dashboard.js (2,147→2,356 lines). Tests: 23 suites, 1,515 tests (unchanged).

### Employment & Education Consolidation — Inline in About You Card (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 138 | CRITICAL | plugins/quoting.html | **Standalone Employment & Education card removed.** Moved into About You card as inline section between marital status and co-applicant toggle. "→ Also on Drivers" badge indicates sync with Step 4 driver fields. |
| 139 | HIGH | plugins/quoting.html | **Co-applicant Employment & Education added.** New `#coEmploymentSection` inside `#coApplicantSection` with `coEducation`, `coOccupation`, `coIndustry` selects. Industry `onchange` calls `_populateCoOccupation()`. |
| 140 | HIGH | js/app-core.js | **`_populateCoOccupation(industry, currentValue)`:** Mirrors `_populateOccupation()` targeting `#coOccupation` using shared `_OCCUPATIONS_BY_INDUSTRY` map. Called from `applyData()`. |
| 141 | MEDIUM | js/app-core.js | **Demo client data:** Added `coEducation: 'Bachelors'`, `coOccupation: 'Software Engineer'`, `coIndustry: 'Information Technology'` to `loadDemoClient()`. |

**2 files changed:** plugins/quoting.html (2,019→2,091 lines), js/app-core.js (2,475→2,495 lines). Tests: 23 suites, 1,515 tests (unchanged).

### Renewal Dedup — CGL Compliance Dashboard (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 142 | CRITICAL | js/compliance-dashboard.js | **`deduplicateRenewals()` — Phase 1: Same-policyNumber dedup.** Groups `this.policies` by `policyNumber`. When multiple entries exist for the same policy number (old term + renewed term), keeps only the entry with the latest `expirationDate`. Marks survivor with `_renewedFrom` for badge display. |
| 143 | HIGH | js/compliance-dashboard.js | **Phase 2: Cross-number renewal detection.** For same `clientNumber` + same `policyType`, if both an expired policy (daysUntilExpiration < 0) and an active policy (daysUntilExpiration >= 0) exist, auto-dismisses the expired policy with "Superseded by [activePolicyNumber]" note. Marks active policy with `_renewalDetected` and `_supersedes`. |
| 144 | HIGH | js/compliance-dashboard.js | **Integration at 3 policy assignment points.** `deduplicateRenewals()` called before `checkForRenewals()` in `_showCachedData()`, fresh fetch success handler, and safe-load/fallback handler. |
| 145 | MEDIUM | js/compliance-dashboard.js, css/compliance.css | **"🔄 Renewed" / "🔄 Renewal confirmed" badge** in `renderPolicies()` dates column. Blue pill badge (`.cgl-auto-renewed-badge`) with tooltip showing old expiration or superseded policy number. Full dark mode support. |

**2 files changed:** js/compliance-dashboard.js (2,356→2,426 lines), css/compliance.css (1,211→1,223 lines). Tests: 23 suites, 1,515 tests (unchanged).

### Renewed Policies Stay Urgent — needsStateUpdate Flag (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 146 | CRITICAL | js/compliance-dashboard.js | **`needsStateUpdate` flag in `checkForRenewals()`.** All 4 renewal detection paths now set `noteData.needsStateUpdate = true` when clearing verified/dismissed markers. Note dedup: skips adding "Auto-cleared" note if flag already set (prevents spam on repeated loads). Marker clearing remains idempotent. |
| 147 | HIGH | js/compliance-dashboard.js | **`markStateUpdated()` clears flag.** Adds `data.needsStateUpdate = false` when user clicks "State Updated". Also now calls `filterPolicies()` to re-sort immediately (policy drops from top of list). |
| 148 | HIGH | js/compliance-dashboard.js | **`sortPolicies()` override.** New `_needsStateUpdate(pn)` helper. Policies with `needsStateUpdate && !stateUpdated` always sort first (above everything), regardless of sort field or direction. Among themselves, they follow normal sort order. |
| 149 | HIGH | js/compliance-dashboard.js | **`renderPolicies()` amber badge.** Policies needing state update get `⚠️ Renewed` badge (class `needs-state-update`) instead of normal status label. Row gets `cgl-needs-state-row` class for subtle amber tint. |
| 150 | MEDIUM | css/compliance.css | **`.cgl-status-badge.needs-state-update`** amber palette (warm orange `#9a3412` / `#fff7ed`) with glow shadow. `.cgl-needs-state-row` subtle amber background. Full dark mode overrides (`#fb923c` text, `rgba(234,88,12,0.15)` bg). |

**2 files changed:** js/compliance-dashboard.js (2,426→2,448 lines), css/compliance.css (1,223→1,234 lines). Tests: 23 suites, 1,515 tests (unchanged).

### SOS Lookup Overhaul — Oregon Socrata + WA DOR Fallback + AZ Deep Link (March 2026)

| # | Severity | Files | Fix Description |
|---|----------|-------|-----------------|
| 125 | CRITICAL | api/prospect-lookup.js | **Oregon SOS rewritten:** Replaced dead HTML scraper with real Oregon Socrata API (`data.oregon.gov/resource/tckn-sxa6.json`). SoQL queries, groups records by `registry_number`, extracts agents (REGISTERED AGENT) and principals (AUTHORIZED REPRESENTATIVE), handles multi-entity results. Returns `dataSource: 'Oregon Socrata API (data.oregon.gov)'`. |
| 126 | CRITICAL | api/prospect-lookup.js | **WA SOS DOR fallback:** All 3 WA SOS error paths (Turnstile-blocked, JSON parse error, fetch error) now call `tryWADORLookup(businessName, ubi)` before falling back to manual search. WA DOR API at `secure.dor.wa.gov/gteunauth/_/GetBusinesses` returns UBI, trade name, entity type, status. Also fetches L&I principals if UBI found. Returns `partialData: true`, `dataSource: 'WA Department of Revenue'`. |
| 127 | CRITICAL | api/prospect-lookup.js | **Arizona SOS deep link:** Replaced dead scraper with immediate deep link to eCorp search results (`ecorp.azcc.gov/BusinessSearch/BusinessSearchResults?searchTerm=ENCODED_NAME`). Returns `deepLinked: true`, `tip` explaining what to look for. |
| 128 | HIGH | api/prospect-lookup.js | **SOS wrapper metadata forwarding:** Updated SOS handler wrapper to conditionally forward `deepLinked` and `tip` fields from scraper results. Added `STATE_SOS_ENDPOINTS.manualUrl` for all 3 states. |
| 129 | HIGH | api/prospect-lookup.js | **AI prompt SOS gap flagging:** `buildDataContext()` now handles `sos.manualSearch` (unavailable) and `sos.entity.partialData` (partial data from alternate source) with explicit underwriting gap warnings. AI user prompt includes conditional `⚠️ SECRETARY OF STATE DATA GAP` instruction when SOS entity data is missing. |
| 130 | HIGH | js/prospect.js | **Status pill:** New states for `partialData` (blue ℹ️ "Partial data") and `deepLinked` (orange "Manual lookup ↗") alongside existing active/inactive/manual/error pills. |
| 131 | HIGH | js/prospect.js | **`_formatSOSData` partial data banner:** Blue info box showing data source, explaining partial data limitations, and source badge at bottom. Added `detailsUrl` clickable link support (e.g., Oregon's `business_details` URL). |
| 132 | HIGH | js/prospect.js | **`_formatSOSError` rewritten:** Deep link support for AZ (🔗 icon, direct results link, no copy-search box), captcha messaging for WA, `tip` display, and underwriting gap warning box listing missing data points (entity type, formation date, registered agent, officers). State-specific icons and headings. |

**2 files changed:** api/prospect-lookup.js (1,563→1,788 lines), js/prospect.js (1,859→1,917 lines). Tests: 23 suites, 1,515 tests (unchanged).

### Encrypted Accounting Vault — PIN + AES-256-GCM + Multi-Account CRUD (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 151 | CRITICAL | plugins/accounting.html | **Tabbed layout:** New tab bar with "🔐 Account Info" (vault tab) and "🛠 Export Tools" (export tab). Vault tab has 4 screens: PIN Setup, PIN Unlock, PIN Recovery, Unlocked Content. Export tab wraps all original content (receipts, trust report, history, deposit calculator). Old collapsible vault card removed. |
| 152 | CRITICAL | js/accounting-export.js | **Full rewrite with encrypted vault system.** PIN system: SHA-256 hashed, 3/6-try lockout escalation (60s/5min), Firebase re-auth recovery. AES-256-GCM encryption via CryptoHelper. Multi-account CRUD with name, type (checking/savings/credit/debit/other), color, dynamic custom fields. Toggle field visibility with 10s auto-re-mask, 30s clipboard auto-clear. Auto-lock: 15min inactivity + visibility change. V1 migration: old 7-field JSON auto-converts to single "HawkSoft / Trust Account" on first PIN setup. Storage: `altech_acct_vault_v2` (encrypted), `altech_acct_vault_meta` (PIN hash+salt). Preserved: deposit calculator, export history, report generation. |
| 153 | HIGH | css/accounting.css | **New CSS for vault UI.** Tab bar, PIN gate screens (setup/lock/recovery), vault toolbar, inline add/edit form with dynamic field rows, account card grid with masked/unmasked field values, copy buttons, empty state. Full `body.dark-mode` overrides for all new elements. Desktop 2-column grid for cards. |
| 154 | HIGH | js/cloud-sync.js | **Cloud sync for vault (10 doc types).** Added `vaultData` (raw encrypted string) and `vaultMeta` (PIN hash+salt JSON) to all 4 touchpoints: `_getLocalData()`, `pushToCloud()`, `pullFromCloud()`, `deleteCloudData()`. Vault data stored as-is (encrypted string, not parsed). |

**4 files changed:** js/accounting-export.js (392→765 lines), css/accounting.css (225→412 lines), plugins/accounting.html (252→288 lines), js/cloud-sync.js (651→664 lines). Tests: 23 suites, 1,515 tests (unchanged).

### Vault UI Polish — Clean Toolbar, Form, Empty State (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 155 | HIGH | plugins/accounting.html | **Toolbar buttons:** Replaced global `.btn .btn-primary` (heavy gradient+shimmer) with dedicated `.acct-toolbar-btn`/`.acct-toolbar-add`/`.acct-toolbar-lock` classes with inline SVG icons. **Form restructure:** Removed nested `<div class="card">` wrapper (caused double borders), form itself is now the card. Replaced inline styles with `.acct-form-grid` (3-column: 2fr 1fr auto), `.acct-form-field` wrappers with proper `<label>` elements, `.acct-color-wrapper` squircle around native color picker. Custom Fields section uses `.acct-fields-section`/`.acct-fields-header`. Save/Cancel balanced with `.acct-add-save-btn`/`.acct-add-cancel-btn`. **Empty state:** Plain `<p>` replaced with `<div class="acct-empty-state">` containing SVG credit card icon. |
| 156 | HIGH | css/accounting.css | **Full vault section CSS rewrite.** Toolbar: ghost outlined buttons, solid blue Add button with SVG `stroke:#fff`, transitions. Form: `overflow:hidden` card with subtle shadow, 3-column grid, `.acct-form-field` with 6px gap labels, color picker `::-webkit-color-swatch` with rounded corners, fields section separated by `border-top`, balanced action buttons (solid save, outlined cancel). Empty state: centered flex with 0.5 opacity icon. **Dark mode:** All new classes covered — toolbar (#1C1C1E bg, #38383A border), Add button (#0A84FF), form shadow (rgba(0,0,0,0.3)), fields section border, color picker (#2C2C2E bg). |
| 157 | MEDIUM | js/accounting-export.js | **Empty state HTML updated** in `_renderCards()`: `<p class="acct-empty-msg">` → `<div class="acct-empty-state">` with SVG credit card icon, title, and subtitle. |

**3 files changed:** js/accounting-export.js (765→856 lines), css/accounting.css (412→467 lines), plugins/accounting.html (288→329 lines). Tests: 23 suites, 1,515 tests (unchanged).

### 8 UI/UX Improvements — Sidebar Logo, Icons, Snooze, QuickRef (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 158 | HIGH | js/dashboard-widgets.js, css/sidebar.css | **Sidebar logo:** Replaced blue "AL" text logo with `<img>` tag loading `Resources/altech-logo.png`. Restyled `.sidebar-brand-logo` for image display (object-fit, border-radius). |
| 159 | MEDIUM | js/app-init.js, js/dashboard-widgets.js | **Personal Lines icon:** Changed from house (duplicate of Dashboard) to pencil/edit ✏️. Added `edit` SVG to `ICONS`, updated `TOOL_ICONS quoting→edit`, changed `toolConfig` icon to `✏️`. |
| 160 | MEDIUM | css/main.css | **Footer behind sidebar:** Removed errant `left: 0` from `#quotingTool footer` override that was hiding navigation buttons behind the sidebar. |
| 161 | LOW | js/app-init.js | **Policy Q&A hidden:** Added `hidden: true` to `qna` entry in `toolConfig[]` — invisible to users until feature is finished. |
| 162 | MEDIUM | js/bug-report.js | **Bug report page detection:** Rewrote `getCurrentPage()` with hash-based detection (maps `#tool/toolKey` → tool title), falling back to step title and document title. No longer always reports "Landing Page". |
| 163 | LOW | index.html | **Browser title:** Changed `<title>` from "Altech Field Lead" to "Altech Toolkit". |
| 164 | CRITICAL | js/compliance-dashboard.js, css/compliance.css | **CGL Snooze/Sleep:** Full snooze system for CGL compliance notifications. `snoozePolicy(pn)` sets midnight-tonight expiry, logs note "🛏️ Snoozed until [date] (snooze #N)" with count tracking. `_isSnoozeActive(pn)` checks expiry, `_expireSnoozes()` called at top of `filterPolicies()` to auto-clear expired. `unsnoozePolicy(pn)` for manual wake. `isHidden()` now checks snoozed state. `clearAll()` includes `snoozedPolicies = {}`. UI: 🛏️ Sleep button next to Dismiss for active rows, amber "🛏️ Until [date]" badge + "Wake" button for snoozed rows in showHidden mode, "🛏️ Sleep Until Tomorrow" in quick-note row. CSS: `.cgl-snooze-btn`, `.cgl-snoozed-badge`, `.cgl-snooze-quick` with full dark mode. |
| 165 | HIGH | plugins/quickref.html, js/quick-ref.js, css/quickref.css, js/cloud-sync.js | **QuickRef reorganized + editable numbers:** Reordered to ID Cards → Speller → Quick Dial Numbers → Phonetic Grid. Replaced hardcoded Common Numbers with editable CRUD system — `QR_NUMBERS_KEY`, `loadNumbers()`, `saveNumbers()`, `renderNumbers()`, `toggleNumberForm()`, `saveNumber()`, `editNumber()`, `deleteNumber()`. Defaults: NAIC Lookup, CLUE Report, MVR Check. Cloud synced as `quickRefNumbers` (11th doc type in 4 touchpoints). |

**12 files changed:** js/compliance-dashboard.js (2,448→2,502), css/compliance.css (1,234→1,275), js/quick-ref.js (293→346), css/quickref.css (233→261), plugins/quickref.html (79→78), js/cloud-sync.js (664→672), js/dashboard-widgets.js (976→886), css/sidebar.css (765→726), js/bug-report.js (260→232), css/main.css (3,486→3,366), js/app-init.js (85→86), index.html (665). Tests: 23 suites, 1,515 tests (unchanged).

### Email Composer — Dynamic AI Persona + Custom Prompt Override (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 169 | CRITICAL | js/email-composer.js | **Dynamic AI persona:** Replaced hardcoded "Altech Insurance Agency"/"Altech Insurance" in AI system prompt with `_getAgentName()` (Auth.displayName → localStorage name → fallback) and `_getAgencyName()` (parsed from `altech_agency_profile` → fallback). New `buildDefaultPrompt()` constructs persona dynamically. |
| 170 | HIGH | js/email-composer.js | **Custom prompt override:** `_initCustomPrompt()`, `_saveCustomPrompt()`, `_resetCustomPrompt()`, `_updateCharCount()` methods. Stored in `altech_email_custom_prompt` (max 2000 chars). `compose()` reads custom prompt, falls back to `buildDefaultPrompt()`. |
| 171 | MEDIUM | plugins/email.html | **Collapsible UI section:** `<details class="email-custom-prompt-section">` with summary "🎭 Customize AI Persona", textarea, char counter, Reset/Save buttons. Placed between tone chips and draft textarea. |
| 172 | MEDIUM | css/email.css | **Custom prompt styling:** `.email-custom-prompt-section`, `.email-custom-prompt-body`, `.email-custom-prompt-textarea`, `.email-custom-prompt-footer`, `.email-custom-prompt-count`, `.email-btn-sm` with `.over-limit` danger state. |
| 173 | LOW | index.html | **Onboarding hint:** Added hint text under `#onboardingAgencyName` input: "Used in the Email Composer AI persona & sign-off". |

**4 files changed:** js/email-composer.js (420→497 lines), plugins/email.html (98→125 lines), css/email.css (165→231 lines), index.html (665). Tests: 23 suites, 1,515 tests (unchanged).

### CGL State-Wipe Bugfix — checkForRenewals() No Longer Overwrites User Actions (March 2026)

| # | Severity | Files | Fix Description |
|---|----------|-------|------------------|
| 166 | CRITICAL | js/compliance-dashboard.js | **`checkForRenewals()` state-wipe fix:** All 4 renewal detection blocks were unconditionally clearing `stateUpdated`, `renewedTo`, and resetting `needsStateUpdate = true` on every policy fetch — even when the user had already clicked "State Updated" or dismissed the renewal chip. Root cause: the `alreadyFlagged` guard only prevented duplicate notes, not the state clearing. Fix: each block now checks `existingNote?.stateUpdated && existingNote?.stateUpdatedForExp === policy.expirationDate` and skips re-flagging if the user already acknowledged this specific expiration date. |
| 167 | HIGH | js/compliance-dashboard.js | **`markStateUpdated()` records `stateUpdatedForExp`:** Now looks up the policy's current expiration date and saves it as `data.stateUpdatedForExp`. This allows `checkForRenewals()` to distinguish between "same renewal already handled" vs "genuinely new renewal with different expiration." |
| 168 | HIGH | js/cloud-sync.js | **Cloud sync CGL reload:** `pullFromCloud()` was writing cglState to localStorage but never reloading `ComplianceDashboard`'s in-memory state. Added `ComplianceDashboard.loadState()` call after successful pull, matching the pattern used by QuickRef and other synced modules. |

**Root cause cycle (Rosecity Garage Doors):** User clicks "State Updated" → sets `stateUpdated` timestamp + `needsStateUpdate = false` → next fetch cycle → `checkForRenewals()` detects exp date diff > 30 days → `alreadyFlagged` evaluates to `false` (because `needsStateUpdate` is now `false` and `stateUpdated` is set) → unconditionally wipes `stateUpdated = null`, `needsStateUpdate = true` → user sees "⚠️ Renewed" again. Fix breaks this cycle by recording which expiration was acknowledged.

**Root cause cycle (It's a Viewpoint):** User clears `renewedTo` chip → saves → next fetch cycle → `checkForRenewals()` runs the same unconditional clearing block → resets `renewedTo = null` (no-op here) BUT also wipes `stateUpdated` → cloud sync may restore stale state without reloading in-memory data → chip reappears. Fix: same `stateUpdatedForExp` guard prevents the entire clearing block from running.

**2 files changed:** js/compliance-dashboard.js (2,502→2,513 lines), js/cloud-sync.js (672→676 lines). Tests: 23 suites, 1,515 tests (unchanged).

### Renewal Chip Resurrection + Dashboard Stat Mismatch (March 2026)

| # | Severity | Files | Fix Description |
|---|----------|-------|------------------|
| 174 | CRITICAL | js/compliance-dashboard.js | **`clearRenewed()` no longer deletes policyNote:** Was deleting entire note when `log.length === 0 && !stateUpdated`, which allowed stale IDB/KV/CloudSync sources to resurrect the old `renewedTo` value during `_smartMergeDict` init merge (additive-only merge re-adds deleted keys from slower async sources). Now keeps note as `{ log: [], renewedTo: null }` so the key persists across all 6 storage layers. |
| 175 | HIGH | js/compliance-dashboard.js | **`deleteNoteEntry()` same fix:** Same deletion pattern removed — notes are kept even when log empties after deleting individual entries. Prevents stale resurrection from async sources. |
| 176 | HIGH | js/dashboard-widgets.js | **Dashboard widget respects `hiddenTypes`:** `renderComplianceWidget()` now loads `hiddenTypes` from `altech_cgl_state` and filters policies before counting. `totalPolicies` now matches CGL dashboard total. `okCount` ("Current") now only counts policies in `notifyTypes`, not all remaining policies. |

**Root cause of chip resurrection:** `clearRenewed()` → delete `this.policyNotes[pn]` → `saveState()` writes empty set to localStorage (sync), IDB (async), KV (2s debounce), CloudSync (3s debounce) → next `init()` → `_smartMergeDict` merges 5 sources → IDB/KV still have old note with `renewedTo: '0000000000'` → key doesn't exist in target → re-added → chip reappears.

**Root cause of dashboard mismatch:** Widget counted `policies.length` (ALL 431 types), CGL dashboard filtered by `hiddenTypes` (excluded Auto + Umbrella = 410 visible). Widget's `okCount` incremented for ALL non-critical/non-warning policies regardless of type; CGL dashboard only counts policies in `notifyTypes`.

**2 files changed:** js/compliance-dashboard.js (2,513→2,509 lines), js/dashboard-widgets.js (886→889 lines). Tests: 23 suites, 1,515 tests (unchanged).

---

## Appendix A: Plugin System — Adding a New Plugin

### Step 1: Create JS Module

```javascript
// js/your-plugin.js
window.YourPlugin = (() => {
    'use strict';
    const STORAGE_KEY = 'altech_your_key';

    function init() {
        _load();
        _wireEvents();
        render();
    }

    function render() { /* build UI */ }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) { /* parse and restore state */ }
        } catch (e) { console.warn('Load failed:', e); }
    }

    function _save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (typeof CloudSync !== 'undefined') CloudSync.schedulePush();
    }

    return { init, render };
})();
```

### Step 2: Create Plugin HTML

```html
<!-- plugins/your-plugin.html -->
<header class="plugin-header">
    <h2>Your Plugin</h2>
</header>
<div class="your-plugin-container">
    <!-- Your UI here -->
</div>
```

### Step 3: Create CSS

```css
/* css/your-plugin.css */
.your-plugin-container {
    padding: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text);
}

body.dark-mode .your-plugin-container {
    /* Only needed for hardcoded colors */
}
```

### Step 4: Register in index.html

1. Add `<link rel="stylesheet" href="css/your-plugin.css">` to `<head>`
2. Add `<script src="js/your-plugin.js"></script>` before `app-boot.js`
3. Add `<div id="yourPluginTool" class="plugin-container"></div>` inside `#pluginViewport`
4. Add entry to `toolConfig[]` in `js/app-init.js`:

```javascript
{ key: 'yourplugin', icon: '🔧', color: 'icon-blue', title: 'Your Plugin',
  name: 'Your Plugin', containerId: 'yourPluginTool', initModule: 'YourPlugin',
  htmlFile: 'plugins/your-plugin.html', category: 'ops' }
```

### Step 5: Add Cloud Sync (if needed)

In `js/cloud-sync.js`:
- `_getLocalData()` → add `yourData: tryParse('altech_your_key')`
- `pushToCloud()` → add `_pushDoc(...)` to Promise.all
- `pullFromCloud()` → add pull + UI refresh
- `deleteCloudData()` → add to `syncDocs` array

---

## Appendix B: API Endpoint Reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/config?type=firebase` | GET | None | Firebase client config |
| `/api/config?type=keys` | GET | Firebase | API keys (Places) |
| `/api/config?type=phonetics` | POST | Rate-limit | Name pronunciation |
| `/api/config?type=bugreport` | POST | Firebase | Create GitHub Issue |
| `/api/policy-scan` | POST | Security | OCR extract from policy docs |
| `/api/vision-processor` | POST | Security | Image/PDF/DL analysis |
| `/api/property-intelligence?mode=arcgis` | POST | Security | County parcel data |
| `/api/property-intelligence?mode=satellite` | POST | Security | AI satellite analysis |
| `/api/property-intelligence?mode=zillow` | POST | Security | Zillow/property search |
| `/api/property-intelligence?mode=firestation` | POST | Security | Nearest fire station |
| `/api/prospect-lookup?type=li` | POST | Security | WA L&I lookup |
| `/api/prospect-lookup?type=sos` | POST | Security | Secretary of State |
| `/api/prospect-lookup?type=or-ccb` | POST | Security | Oregon CCB |
| `/api/prospect-lookup?type=osha` | POST | Security | OSHA inspections |
| `/api/prospect-lookup?type=sam` | POST | Security | SAM.gov federal |
| `/api/prospect-lookup?type=places` | POST | Security | Google Places |
| `/api/prospect-lookup?type=ai-analysis` | POST | Firebase | AI risk assessment |
| `/api/compliance` | GET | Security | HawkSoft CGL policies |
| `/api/historical-analyzer` | POST | Security | Property value analysis |
| `/api/property-intelligence?mode=rag-interpret` | POST | Security | Assessor data → form fields |
| `/api/kv-store` | GET/POST/DELETE | Firebase | Per-user Redis KV |
| `/api/stripe?action=checkout` | POST | Firebase | Stripe checkout |
| `/api/stripe?action=portal` | POST | Firebase | Customer portal |
| `/api/stripe?action=webhook` | POST | Stripe sig | Webhook handler |
| `/api/admin?action=list` | GET | Admin | List users |
| `/api/admin?action=update` | POST | Admin | Update user role |
| `/api/anthropic-proxy` | POST | Firebase | Anthropic CORS proxy |
| `/api/hawksoft-logger` | POST | Security | Call note formatter + HawkSoft log push |

---

## Appendix C: Test Structure

```bash
tests/
├── setup.js                    # Jest env: mock fetch, suppress crypto errors
├── ai-router.test.js           # AI router multi-provider logic
├── api-compliance.test.js      # Compliance API (HawkSoft CGL)
├── api-property.test.js        # Property intelligence API
├── api-prospect.test.js        # Prospect lookup API
├── api-security.test.js        # API security middleware
├── app.test.js                 # Core App object + form handling
├── auth-cloudsync.test.js      # Auth login + CloudSync reliability tests
├── boot-loading.test.js        # First-load boot + Places loader resilience tests
├── ezlynx-pipeline.test.js    # EZLynx export pipeline
├── intake-assist.test.js       # Intake assist module tests
├── integration.test.js         # Cross-module integration
├── layout-regressions.test.js  # CSS shell/chat layout regression guardrails
├── performance.test.js         # Performance benchmarks
├── phase1.test.js              # Phase 1 feature tests
├── phase2.test.js              # Phase 2 feature tests
├── phase3.test.js              # Phase 3 feature tests
├── phase4.test.js              # Phase 4 feature tests
├── phase5.test.js              # Phase 5 feature tests
├── plugin-integration.test.js  # Plugin system integration
├── prospect-client.test.js     # Prospect client-side module
├── server.test.js              # Local dev server (server.js)
├── hawksoft-logger.test.js     # HawkSoft Logger API (89 tests, CHANNEL_MAP LogAction codes, policyId, activityType, glossary)
└── call-logger.test.js         # Call Logger client module (194 tests, channel/activity buttons, hawksoftPolicyId pipeline, activityType fetch, + New Log reset, glossary)
```

Tests load `index.html` into JSDOM: `new JSDOM(html, { runScripts: 'dangerously' })`. The test setup file mocks `fetch`, silences console noise, and suppresses expected `crypto.subtle` errors.
