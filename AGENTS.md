# AGENTS.md â€” Altech Field Lead: AI Agent Onboarding Guide

> **Last updated:** March 10, 2026
> **For:** AI coding agents working on this codebase
> **Version:** Comprehensive â€” read this before making ANY changes
>
> **âš ï¸ LIVING DOCUMENT:** This file, `.github/copilot-instructions.md`, and `QUICKREF.md` must be updated at the end of every work session. When you change code, update the docs to match â€” line counts, test counts, module descriptions, feature lists, and the `Last updated` date. Run `npm run audit-docs` to check for drift.

---

## 1. App Overview

**Altech Field Lead** is a desktop-first insurance intake wizard for independent insurance agents. The core workflow: scan a policy document â†’ AI extracts data â†’ agent corrects the form â†’ save drafts â†’ export to HawkSoft (`.cmsmtf`), EZLynx (browser extension bridge), or PDF.

| Attribute | Value |
|-----------|-------|
| **Stack** | Vanilla HTML/CSS/JS SPA â€” no build step, no framework |
| **Entry point** | `index.html` (~702 lines) |
| **CSS** | 21 files in `css/` (~14,100 lines total) |
| **JS** | 35 modules in `js/` (~28,120 lines total) |
| **Plugins** | 15 HTML templates in `plugins/` (~4,960 lines total) |
| **APIs** | 12 serverless functions + 2 helpers in `api/` (~6,210 lines total) |
| **Auth** | Firebase Auth (email/password, compat SDK v10.12.0) |
| **Database** | Firestore (`users/{uid}/sync/{docType}`, `users/{uid}/quotes/{id}`) |
| **Encryption** | AES-256-GCM via Web Crypto API (`CryptoHelper`) |
| **Local server** | `server.js` (Node.js ESM, 680 lines) |
| **Deploy** | Vercel (serverless functions + static) |
| **Desktop** | Tauri v2 (optional, `src-tauri/`) |
| **Tests** | Jest + JSDOM, 20 suites, 1432 tests |
| **Package** | ESM (`"type": "module"` in package.json) |
| **Author** | Austin Kays |
| **License** | MIT |
| **Repo** | `github.com/austinkays/Altech` |

### Quick Commands

```bash
npm run dev           # Local dev server (server.js on port 3000)
npm test              # All 20 test suites, 1432 tests
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
â”œâ”€â”€ index.html                  # SPA shell (702 lines) â€” CSS links, DOM skeleton, script tags
â”œâ”€â”€ server.js                   # Local dev server (677 lines) â€” static + API proxy + local endpoints
â”œâ”€â”€ vercel.json                 # Vercel config â€” function timeouts, rewrites, security headers, CSP
â”œâ”€â”€ package.json                # ESM, scripts, 3 deps (ioredis, pdf-lib, stripe), 4 devDeps
â”œâ”€â”€ jest.config.cjs             # Test config â€” node env, tests/ dir, coverage from index.html + api/ + lib/
â”œâ”€â”€ firebase.json               # Firebase hosting config
â”œâ”€â”€ firestore.rules             # Security rules (99 lines) â€” owner-only, admin guards, size limits
â”œâ”€â”€ sw.js                       # Service worker
â”‚
â”œâ”€â”€ css/                        # 20 stylesheets (~13,300 lines)
â”‚   â”œâ”€â”€ main.css                # â˜… Core styles + :root variables + desktop overhaul (3,416 lines) â€” THE source of truth
â”‚   â”œâ”€â”€ theme-professional.css  # Dark pro theme, body.theme-pro overrides (350 lines)
â”‚   â”œâ”€â”€ sidebar.css             # Desktop/tablet/mobile sidebar layouts (758 lines)
â”‚   â”œâ”€â”€ dashboard.css           # Bento grid dashboard widgets (1,026 lines)
â”‚   â”œâ”€â”€ call-logger.css         # Call logger plugin + desktop two-column layout + glassmorphism UI + status bar + client autocomplete + policy selector + HawkSoft deep links (900 lines)
â”‚   â”œâ”€â”€ compliance.css          # CGL compliance dashboard (1,046 lines)
â”‚   â”œâ”€â”€ auth.css                # Auth modal + settings (973 lines)
â”‚   â”œâ”€â”€ reminders.css           # Task reminders (1,120 lines)
â”‚   â”œâ”€â”€ intake-assist.css       # AI intake professional UI â€” enhanced cards, gradient bubbles, dark mode elevation, wide-screen scaling (1,339 lines)
â”‚   â”œâ”€â”€ ezlynx.css              # EZLynx export â€” standalone dark palette (590 lines)
â”‚   â”œâ”€â”€ vin-decoder.css         # VIN decoder (600 lines)
â”‚   â”œâ”€â”€ hawksoft.css            # HawkSoft export (555 lines)
â”‚   â”œâ”€â”€ quote-compare.css       # Quote comparison tool (460 lines)
â”‚   â”œâ”€â”€ onboarding.css          # First-run wizard (411 lines)
â”‚   â”œâ”€â”€ admin.css               # Admin panel (300 lines)
â”‚   â”œâ”€â”€ bug-report.css          # Bug reporter (227 lines)
â”‚   â”œâ”€â”€ quickref.css            # Quick reference â€” teal accent (233 lines)
â”‚   â”œâ”€â”€ security-info.css       # Security modal (217 lines)
â”‚   â”œâ”€â”€ accounting.css          # Accounting export (225 lines)
â”‚   â”œâ”€â”€ email.css               # Email composer â€” purple accent (165 lines)
â”‚   â””â”€â”€ paywall.css             # Paywall modal (131 lines)
â”‚
â”œâ”€â”€ js/                         # 35 modules (~28,120 lines)
â”‚   â”‚
â”‚   â”‚  â˜… Core App (assembled via Object.assign into global `App`)
â”‚   â”œâ”€â”€ app-init.js             # State init, toolConfig[], workflows (85 lines)
â”‚   â”œâ”€â”€ app-core.js             # Form handling, save/load, updateUI, navigation (2,125 lines)
â”‚   â”œâ”€â”€ app-scan.js             # Policy document scanning, OCR, Gemini AI (1,569 lines)
â”‚   â”œâ”€â”€ app-property.js         # Property analysis, maps, assessor data (1,585 lines)
â”‚   â”œâ”€â”€ app-vehicles.js         # Vehicle/driver management, DL scanning (788 lines)
â”‚   â”œâ”€â”€ app-popups.js           # Vision processing, hazard detection, popups (1,405 lines)
â”‚   â”œâ”€â”€ app-export.js           # PDF/CMSMTF/CSV/Text exports, scan schema (894 lines)
â”‚   â”œâ”€â”€ app-quotes.js           # Quote/draft management (694 lines)
â”‚   â”œâ”€â”€ app-boot.js             # Boot sequence, error boundaries, keyboard shortcuts (265 lines)
â”‚   â”‚
â”‚   â”‚  â˜… Infrastructure
â”‚   â”œâ”€â”€ crypto-helper.js        # AES-256-GCM encrypt/decrypt, UUID generation
â”‚   â”œâ”€â”€ firebase-config.js      # Firebase app init (fetches config from /api/config)
â”‚   â”œâ”€â”€ auth.js                 # Firebase auth (login/signup/reset/account), apiFetch()
â”‚   â”œâ”€â”€ cloud-sync.js           # Firestore sync (7 doc types, conflict resolution, 642 lines)
â”‚   â”œâ”€â”€ ai-provider.js          # Multi-provider AI abstraction (Google/OpenRouter/OpenAI/Anthropic)
â”‚   â”œâ”€â”€ dashboard-widgets.js    # Bento grid, sidebar render, mobile nav, breadcrumbs (968 lines)
â”‚   â”‚
â”‚   â”‚  â˜… Plugin Modules (IIFE or const pattern, each on window.ModuleName)
â”‚   â”œâ”€â”€ coi.js                  # ACORD 25 COI PDF generator (716 lines)
â”‚   â”œâ”€â”€ compliance-dashboard.js # CGL compliance tracker, 6-layer persistence (1,881 lines)
â”‚   â”œâ”€â”€ email-composer.js       # AI email polisher, encrypted drafts (359 lines)
â”‚   â”œâ”€â”€ ezlynx-tool.js          # EZLynx rater export, Chrome extension bridge (972 lines)
â”‚   â”œâ”€â”€ hawksoft-export.js       # HawkSoft .CMSMTF generator, full CRUD UI (1,600 lines)
â”‚   â”œâ”€â”€ intake-assist.js         # AI conversational intake, maps, progress ring (2,771 lines)
â”‚   â”œâ”€â”€ policy-qa.js             # Policy document Q&A chat, carrier detection (914 lines)
â”‚   â”œâ”€â”€ prospect.js              # Commercial prospect investigation, risk scoring (1,646 lines)
â”‚   â”œâ”€â”€ quick-ref.js             # NATO phonetic + agent ID cards (261 lines)
â”‚   â”œâ”€â”€ quote-compare.js         # Quote comparison + AI recommendation (788 lines)
â”‚   â”œâ”€â”€ reminders.js             # Task reminders, PST timezone, snooze/defer, weekly summary (773 lines)
â”‚   â”œâ”€â”€ vin-decoder.js           # VIN decoder with NHTSA API (702 lines)
â”‚   â”œâ”€â”€ accounting-export.js     # Trust deposit calculator, HawkSoft receipts (337 lines)
â”‚   â”œâ”€â”€ call-logger.js           # Call note formatter + HawkSoft logger, two-step preview/confirm, clientâ†’policy autocomplete, HawkSoft deep links, personal lines + prospect support, status bar + manual refresh, hawksoftPolicyId pipeline (833 lines)
â”‚   â”‚
â”‚   â”‚  â˜… Support Modules
â”‚   â”œâ”€â”€ onboarding.js            # 4-step first-run wizard, invite codes (369 lines)
â”‚   â”œâ”€â”€ paywall.js               # Stripe paywall (beta, disabled) (199 lines)
â”‚   â”œâ”€â”€ admin-panel.js           # User management admin panel (203 lines)
â”‚   â”œâ”€â”€ bug-report.js            # GitHub Issue bug reporter (223 lines)
â”‚   â”œâ”€â”€ data-backup.js           # Import/export all data + keyboard shortcuts (121 lines)
â”‚   â””â”€â”€ hawksoft-integration.js  # HawkSoft REST API client (230 lines)
â”‚
â”œâ”€â”€ plugins/                    # 14 HTML templates (loaded dynamically)
â”‚   â”œâ”€â”€ quoting.html            # â˜… Main intake wizard â€” 7 steps, 2,026 lines
â”‚   â”œâ”€â”€ ezlynx.html             # EZLynx rater form â€” 80+ fields, 1,077 lines
â”‚   â”œâ”€â”€ coi.html                # ACORD 25 COI form (418 lines)
â”‚   â”œâ”€â”€ prospect.html           # Commercial investigation UI (333 lines)
â”‚   â”œâ”€â”€ accounting.html         # Accounting/deposit tools (252 lines)
â”‚   â”œâ”€â”€ compliance.html         # CGL dashboard (206 lines)
â”‚   â”œâ”€â”€ vin-decoder.html        # VIN decoder (141 lines)
â”‚   â”œâ”€â”€ reminders.html          # Task manager (144 lines)
â”‚   â”œâ”€â”€ intake-assist.html      # AI chat two-pane (152 lines)
â”‚   â”œâ”€â”€ quotecompare.html       # Quote comparison (117 lines)
â”‚   â”œâ”€â”€ email.html              # Email composer (98 lines)
â”‚   â”œâ”€â”€ qna.html                # Policy Q&A chat (95 lines)
â”‚   â”œâ”€â”€ quickref.html           # Quick reference cards (79 lines)
â”‚   â”œâ”€â”€ call-logger.html        # Call logger + standard header + desktop two-column grid + status bar + client autocomplete (104 lines)
â”‚   â””â”€â”€ hawksoft.html           # HawkSoft export (21 lines â€” JS renders body)
â”‚
â”œâ”€â”€ api/                        # 12 serverless functions + 2 helpers (~6,210 lines) âš ï¸ Hobby plan MAX = 12 functions
â”‚   â”œâ”€â”€ _ai-router.js           # â˜… Shared: multi-provider AI router (NOT an endpoint)
â”‚   â”œâ”€â”€ config.js               # Firebase config, API keys, phonetics, bug reports
â”‚   â”œâ”€â”€ policy-scan.js          # OCR document extraction via Gemini (260 lines)
â”‚   â”œâ”€â”€ vision-processor.js     # Image/PDF analysis, DL scanning, aerial analysis (880 lines)
â”‚   â”œâ”€â”€ property-intelligence.js # ArcGIS parcels, satellite AI, fire stations (1,247 lines)
â”‚   â”œâ”€â”€ prospect-lookup.js      # Multi-source business investigation (1,563 lines)
â”‚   â”œâ”€â”€ compliance.js           # HawkSoft API CGL policy fetcher + Redis cache + allClientsList + hawksoftPolicyId (478 lines)
â”‚   â”œâ”€â”€ historical-analyzer.js  # AI property value/insurance trend analysis
â”‚   â”œâ”€â”€ _rag-interpreter.js     # County assessor data â†’ insurance fields (helper, routed via property-intelligence)
â”‚   â”œâ”€â”€ kv-store.js             # Per-user Redis KV store
â”‚   â”œâ”€â”€ stripe.js               # Stripe checkout, portal, webhooks
â”‚   â”œâ”€â”€ admin.js                # User management (admin only)
â”‚   â”œâ”€â”€ anthropic-proxy.js      # CORS proxy for Anthropic API
â”‚   â””â”€â”€ hawksoft-logger.js      # AI call note formatter + HawkSoft log push, two-step support, policy-level logging (253 lines)
â”‚
â”œâ”€â”€ chrome-extension/           # EZLynx bridge Chrome extension
â”‚   â”œâ”€â”€ manifest.json
â”‚   â”œâ”€â”€ popup.html / popup.js
â”‚   â”œâ”€â”€ content.js / background.js
â”‚   â”œâ”€â”€ altech-bridge.js
â”‚   â”œâ”€â”€ property-scraper.js
â”‚   â””â”€â”€ defaultSchema.js
â”‚
â”œâ”€â”€ tests/                      # Jest test suites
â”‚   â”œâ”€â”€ setup.js                # Test env setup (mock fetch, suppress crypto errors)
â”‚   â””â”€â”€ *.test.js               # 20 test files, 1432 tests
â”‚
â”œâ”€â”€ lib/                        # Shared server-side utilities
â”œâ”€â”€ scripts/                    # Build/utility scripts
â”œâ”€â”€ src-tauri/                  # Tauri desktop app (Rust)
â”œâ”€â”€ python_backend/             # Python automation (Playwright HawkSoft, trust reports)
â”œâ”€â”€ Resources/                  # Static assets
â””â”€â”€ docs/                       # Architecture docs, roadmaps, guides
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

Defined in `css/theme-professional.css` â€” a permanently dark OLED-black theme. Overrides the same variables as `body.dark-mode` but with slightly different values (e.g., `--text: #F5F5F7`, `--success: #30D158`).

### 3.2 Variable Naming â€” CRITICAL RULES

**These variable names DO NOT EXIST and MUST NEVER be used:**

| âŒ Wrong | âœ… Correct |
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
- `main.css` uses `.dark-mode .carrier-ac-list` etc. (missing `body` prefix) â€” works due to specificity but is inconsistent
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

These CSS files have zero `body.dark-mode` overrides: `vin-decoder.css`, `quote-compare.css`, `onboarding.css`, `quickref.css`, `accounting.css`, `email.css`, `paywall.css`. They rely entirely on CSS variables (which auto-switch), but any hardcoded colors in these files won't adapt to dark mode.

### 3.6 Off-System Color Palettes

Some plugins use their own hardcoded color palettes instead of the design system:
- **ezlynx.css** â€” Standalone dark glassmorphism with slate/sky (`#64748b`, `#94a3b8`, `#38bdf8`)
- **quickref.css** â€” Teal accent (`#0d9488`, `#0f766e`)
- **email.css** â€” Purple accent (`#7c3aed`, `#6d28d9`)
- **compliance.css** â€” Mixed slate/blue for type badges

---

## 4. JavaScript Architecture

### 4.1 Global `App` Object â€” Assembly Pattern

The core app state lives on `window.App`. It is built incrementally across 9 files via `Object.assign(App, { ... })`:

```
app-init.js      â†’  App = { data, step, flow, storageKey, ... }
app-core.js      â†’  Object.assign(App, { save, load, updateUI, navigateTo, ... })
app-scan.js      â†’  Object.assign(App, { processScan, openScanPicker, ... })
app-property.js  â†’  Object.assign(App, { smartAutoFill, openPropertyRecords, ... })
app-vehicles.js  â†’  Object.assign(App, { renderDrivers, renderVehicles, scanDL, ... })
app-popups.js    â†’  Object.assign(App, { processImage, analyzeAerial, detectHazards, ... })
app-export.js    â†’  Object.assign(App, { exportPDF, exportText, exportCMSMTF, ... })
app-quotes.js    â†’  Object.assign(App, { saveAsQuote, loadQuote, renderQuotesList, ... })
app-boot.js      â†’  Object.assign(App, { boot })  +  calls App.boot()
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
  1. crypto-helper.js        â† CryptoHelper (used by many)
  2. app-init.js             â† Creates window.App
  3. app-core.js             â† App.save(), App.load(), App.updateUI()
  4. app-scan.js             â† App.processScan()
  5. app-property.js         â† App.smartAutoFill()
  6. app-vehicles.js         â† App.renderDrivers()
  7. app-popups.js           â† App.processImage()
  8. app-export.js           â† App.exportPDF(), App.exportCMSMTF()
  9. app-quotes.js           â† App.saveAsQuote()

Standalone Modules (order-independent):
  10. ai-provider.js         â† window.AIProvider
  11. dashboard-widgets.js   â† window.DashboardWidgets

Plugin Modules (order-independent among themselves):
  12-25. coi, prospect, quick-ref, accounting-export, compliance-dashboard,
         ezlynx-tool, quote-compare, intake-assist, email-composer, policy-qa,
         reminders, hawksoft-export, vin-decoder, data-backup

Support Modules (load after plugins):
  26. bug-report.js
  27. firebase-config.js     â† Must precede auth.js
  28. auth.js                â† Must precede cloud-sync.js
  29. admin-panel.js
  30. cloud-sync.js
  31. paywall.js
  32. onboarding.js
  33. app-boot.js            â† â˜… MUST BE LAST â€” runs boot()
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
- **âš ï¸ JSDOM lacks `crypto.subtle`** â€” tests suppress encryption errors; encrypted fields return `null` in test environments

### 4.6 Three Workflows

| Workflow | Steps | Skip |
|----------|-------|------|
| `home` | 0 â†’ 1 â†’ 2 â†’ 3 â†’ 5 â†’ 6 | Step 4 (vehicles) |
| `auto` | 0 â†’ 1 â†’ 2 â†’ 4 â†’ 5 â†’ 6 | Step 3 (property) |
| `both` | 0 â†’ 1 â†’ 2 â†’ 3 â†’ 4 â†’ 5 â†’ 6 | Nothing |

Steps: 0=Policy Scan, 1=Applicant Info, 2=Address, 3=Property Details, 4=Vehicles & Drivers, 5=Coverage, 6=Review & Export

### 4.7 Navigation System

`App.navigateTo(toolKey)` handles all navigation:
1. `toolKey === 'dashboard'` â†’ show dashboard, hide plugins
2. `toolKey === 'quoting'` â†’ show quoting wizard at current step
3. Other keys â†’ find tool in `toolConfig[]`, lazy-load HTML, call `init()`

URL hash routing: `#tool/toolKey` â†’ `navigateTo(toolKey)`. Back button support via `popstate`.

---

## 5. Known Landmines & Historical Bugs

### 5.1 Field ID = Storage Key (CRITICAL)

Every `<input id="fieldName">` in `plugins/quoting.html` auto-syncs to `App.data.fieldName`. **Renaming an `id` attribute breaks data persistence for all existing users.** If a field must be renamed, you need a migration in `App.load()` that copies old key â†’ new key.

### 5.2 Cross-File Function Dependencies

`App._escapeAttr()` is defined in `app-export.js` but called from `app-quotes.js`. If `app-export.js` hasn't loaded yet (or fails to load), `app-quotes.js` crashes. This is now guarded with a fallback, but the pattern is fragile.

### 5.3 Encryption Bypass Risk

`App.setFieldValue(id, value)` used to write directly to localStorage via `safeSave()`, bypassing `CryptoHelper`. This was fixed â€” it now calls `this.save()` â€” but watch for any new code that writes to `altech_v6` directly instead of going through `App.save()`.

### 5.4 Canvas/ImageBitmap Memory Leaks

`app-scan.js` and `app-vehicles.js` create canvases and ImageBitmaps for image processing. These must be explicitly cleaned up (`canvas.width = 0; canvas.height = 0; bitmap.close()`) or they leak GPU memory on mobile devices.

### 5.5 Save Race Condition

`App.save()` is debounced and protected with a `_saving` lock and `saveToken` sequence number. Any new code that saves must go through `App.save()` â€” never write to the storage key directly.

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

- 7 CSS files have no dark mode overrides at all (see Â§3.5)
- 3 CSS files use legacy `.dark-mode` instead of `body.dark-mode` (see Â§3.3)
- 4 plugins use their own hardcoded color palettes (see Â§3.6)

### 5.10 Vercel Hobby Plan â€” 12 Serverless Function Limit (CRITICAL)

**Vercel's Hobby plan allows a maximum of 12 Serverless Functions per deployment.** Exceeding this causes the entire deployment to fail with "No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan" â€” which means ALL API endpoints return 404 in production, not just the new one.

**Current count: 12 functions (at the limit).** Any new API endpoint MUST either:
1. **Consolidate into an existing function** using query-parameter routing (e.g., `?mode=newFeature` or `?type=newFeature`)
2. **Convert an existing function to a helper** by prefixing with `_` (e.g., `_helper.js`) and importing it from another function

**Files prefixed with `_` in `api/` are Vercel helpers** â€” they are NOT counted as serverless functions and NOT deployed as endpoints. Currently: `_ai-router.js` (shared AI router) and `_rag-interpreter.js` (routed via `property-intelligence.js?mode=rag-interpret`).

**Before adding any new file to `api/`:** Count non-`_` files: `ls api/ | grep -v '^_' | wc -l` â€” must be â‰¤ 12.

### 5.11 HawkSoft REST API Integration Gotchas (CRITICAL)

The Call Logger pushes log notes to HawkSoft via `api/hawksoft-logger.js`. Several API quirks were discovered through live debugging (March 2026):

| Gotcha | Wrong | Correct |
|--------|-------|---------|
| **Log endpoint URL** | `/clients/{id}/logNotes` | `/client/{id}/log` (singular, different path) |
| **Channel field name** | `"action": 1` | `"channel": 1` â€” API returns "Invalid Channel" if wrong |
| **Phone channel codes** | `29` / `30` (don't exist) | `1` = Phone To Insured, `5` = Phone From Insured |
| **clientNumber type** | Numeric (from API) | Must call `String()` before `.trim()` â€” crashes otherwise |
| **Policy-level logging** | Omit `policyId` | Include `policyId` (HawkSoft internal GUID) in body to link log to specific policy |
| **Required body fields** | `{ note, action }` | `{ refId: "UUID", ts: "ISO-timestamp", channel: <number>, note: "text" }` |

**âš ï¸ `docs/technical/HAWKSOFT_API_ANALYSIS.md` endpoint #7 is WRONG** â€” it says `"action": 29` but the real API expects `"channel"`. The receipts endpoint (#9) correctly shows `"channel"`.

**Data pipeline for `hawksoftPolicyId`:**
`api/compliance.js` (extracts `policy.id` from HawkSoft API) â†’ cached in `allPolicies[]` â†’ `js/call-logger.js` (threads through `_selectedPolicy` â†’ format request â†’ `_pendingLog` â†’ confirm request) â†’ `api/hawksoft-logger.js` (includes as `policyId` in HawkSoft body when present).

---

## 6. Security Rules & Authentication

### 6.1 Firestore Rules

```
users/{userId}           â†’ owner CRUD, admin can read + set isAdmin/isBlocked
users/{userId}/sync/{docType} â†’ owner CRUD (except subscription â€” read-only)
users/{userId}/quotes/{quoteId} â†’ owner CRUD, 1MB size limit
/{everything-else}       â†’ deny all
```

**Guard functions:** `isAuthenticated()`, `isOwner(userId)`, `hasOnlyAllowedFields(allowedFields)`, `isReasonableSize()` (< 1MB), `isPaidSubscriber(userId)`

**Admin fields:** `isAdmin` and `isBlocked` on `users/{userId}` doc â€” can only be set by admins, never by the user themselves.

### 6.2 API Security

All serverless functions use one of two middleware patterns:
- **`securityMiddleware`** â€” Basic security checks (CORS, method validation, origin check)
- **`requireAuth`** â€” Firebase token verification + UID extraction

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
| `altech_v6` | Form data (all fields) | âœ… | âœ… | App (core) |
| `altech_v6_quotes` | Saved quote drafts | âœ… | âœ… | App (quotes) |
| `altech_v6_docintel` | Document intel results | âŒ | âŒ | App |
| `altech_cgl_state` | CGL annotations | âŒ | âœ… | ComplianceDashboard |
| `altech_cgl_cache` | CGL policy cache | âŒ | âŒ | ComplianceDashboard |
| `altech_quickref_cards` | Quick ref cards | âŒ | âœ… | QuickRef |
| `altech_reminders` | Task reminders | âŒ | âœ… | Reminders |
| `altech_client_history` | Client history | âŒ | âœ… | App |
| `altech_dark_mode` | Dark mode pref | âŒ | âœ… | App (settings) |
| `altech_coi_draft` | COI form draft | âŒ | âŒ | COI |
| `altech_email_drafts` | Email drafts | âœ… | âŒ | EmailComposer |
| `altech_acct_vault` | Accounting passwords | âŒ | âŒ | AccountingExport |
| `altech_acct_history` | Accounting export history | âŒ | âŒ | AccountingExport |
| `altech_saved_prospects` | Saved prospect reports | âŒ | âŒ | ProspectInvestigator |
| `altech_vin_history` | VIN decode history (max 20) | âŒ | âŒ | VinDecoder |
| `altech_v6_qna` | Q&A chat state | âŒ | âŒ | PolicyQA |
| `altech_v6_quote_comparisons` | Quote comparisons (max 20) | âŒ | âŒ | QuoteCompare |
| `altech_intake_assist` | Intake chat state | âŒ | âŒ | IntakeAssist |
| `altech_hawksoft_settings` | HawkSoft export prefs | âŒ | âŒ | HawkSoftExport |
| `altech_hawksoft_history` | HawkSoft export history | âŒ | âŒ | HawkSoftExport |
| `altech_ezlynx_formdata` | EZLynx form data | âŒ | âŒ | EZLynxTool |
| `altech_ezlynx_incidents` | EZLynx incidents | âŒ | âŒ | EZLynxTool |
| `altech_onboarded` | Onboarding complete flag | âŒ | âŒ | Onboarding |
| `altech_user_name` | User's name | âŒ | âŒ | Onboarding |
| `altech_agency_profile` | Agency profile | âŒ | âŒ | Onboarding |
| `altech_encryption_salt` | PBKDF2 salt | âŒ | âŒ | CryptoHelper |
| `altech_sync_meta` | Sync metadata | âŒ | âŒ | CloudSync |
| `gemini_api_key` | User's Gemini key | âŒ | âŒ | Multiple plugins |

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
3. Field IDs are storage keys â€” NEVER rename an input id without a migration
4. All form writes go through App.save() â€” never write to altech_v6 directly
5. After localStorage writes on synced data, call CloudSync.schedulePush()
6. JS modules use IIFE pattern: window.Module = (() => { return { init, ... }; })()
7. App is built via Object.assign(App, {...}) across 9 files â€” app-boot.js loads LAST
8. Test with: npm test (1432 tests, all must pass)
9. No build step â€” edit files, reload browser
10. For dark mode backgrounds, prefer solid colors (#1C1C1E) over low-opacity rgba
11. AFTER completing all work, update AGENTS.md, .github/copilot-instructions.md, and
    QUICKREF.md â€” line counts, test counts, descriptions, date. Run: npm run audit-docs
12. ALWAYS keep changes â€” never leave edits pending user confirmation
13. ALWAYS commit & push when finishing a task â€” stage all files, commit, git push
14. Vercel Hobby plan: MAX 12 serverless functions. Never add a new api/ file without
    checking the count. Use ?mode= routing or _ prefix helpers to consolidate. See Â§5.10
```

---

## 9. Pre-Deploy Checklist

### Before Every Deploy

- [ ] **All tests pass:** `npm test` â†’ 20 suites, 1432 tests, 0 failures
- [ ] **No lint/build errors:** `get_errors()` returns clean
- [ ] **CSS variables are valid:** No `--card`, `--surface`, `--accent`, `--muted`, `--text-primary`, `--input-bg`, `--border-color`
- [ ] **Dark mode tested:** Toggle dark mode, check new/modified UI elements
- [ ] **Three workflows tested:** Set `qType` to `home`, `auto`, `both` â€” step through each
- [ ] **Three exports tested:** Export as PDF, CMSMTF, and XML (if applicable) â€” check all fields populate
- [ ] **Mobile tested:** Resize to 375px width, check no horizontal overflow
- [ ] **Encryption intact:** `App.save()` â†’ check `altech_v6` in localStorage is encrypted JSON, not plaintext
- [ ] **Cloud sync:** Sign in, make a change, verify `CloudSync.schedulePush()` fires (3s debounce)
- [ ] **Field IDs unchanged:** No input `id` attributes were renamed without migration code
- [ ] **No hardcoded API keys:** Search for API key strings â€” they should be in env vars only
- [ ] **XSS check:** Any user/AI-generated content displayed in HTML uses `escapeHTML()` or equivalent
- [ ] **Memory check:** Open DevTools Memory tab, run scan/analyze flow, verify no canvas/ImageBitmap leaks
- [ ] **Serverless function count â‰¤ 12:** Count non-`_` files in `api/` â€” Vercel Hobby plan max is 12. If over, consolidate via `?mode=` routing or `_` prefix helper pattern (see Â§5.10)
- [ ] **Docs updated:** Run `npm run audit-docs` â€” fix any stale line counts, test counts, or descriptions in AGENTS.md, .github/copilot-instructions.md, and QUICKREF.md. Update the `Last updated` date.

### Vercel Environment Variables Required

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `GOOGLE_API_KEY` | âœ… | Gemini AI (scanning, vision, analysis) |
| `PLACES_API_KEY` or `GOOGLE_PLACES_API_KEY` | âœ… | Google Places/Maps |
| `FIREBASE_API_KEY` | âœ… | Firebase client config |
| `FIREBASE_AUTH_DOMAIN` | âœ… | Firebase auth |
| `FIREBASE_PROJECT_ID` | âœ… | Firebase/Firestore |
| `FIREBASE_STORAGE_BUCKET` | âœ… | Firebase storage |
| `FIREBASE_MESSAGING_SENDER_ID` | âœ… | Firebase messaging |
| `FIREBASE_APP_ID` | âœ… | Firebase app |
| `REDIS_URL` | âœ… | KV store + compliance cache |
| `HAWKSOFT_CLIENT_ID` | âœ… | HawkSoft API |
| `HAWKSOFT_CLIENT_SECRET` | âœ… | HawkSoft API |
| `HAWKSOFT_AGENCY_ID` | âœ… | HawkSoft API |
| `STRIPE_SECRET_KEY` | âš ï¸ | Stripe billing (beta) |
| `STRIPE_PRICE_ID` | âš ï¸ | Stripe billing (beta) |
| `STRIPE_WEBHOOK_SECRET` | âš ï¸ | Stripe webhooks (beta) |
| `APP_URL` | âš ï¸ | Stripe redirect URL |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | âš ï¸ | Stripe webhook â†’ Firestore |
| `GITHUB_ISSUES_TOKEN` | âš ï¸ | Bug report â†’ GitHub Issues |
| `GITHUB_REPO_OWNER` | âš ï¸ | Bug report target repo |
| `GITHUB_REPO_NAME` | âš ï¸ | Bug report target repo |
| `SOCRATA_APP_TOKEN` | âš ï¸ | WA L&I / OR CCB lookups |
| `SAM_GOV_API_KEY` | âš ï¸ | SAM.gov federal lookups |

---

## 10. Changelog of Known Issues & Fixes

### Dashboard Layout Overhaul (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 37 | Layout | dashboard.css, index.html | Compliance widget promoted to 2-row hero (6colÃ—2row) matching Reminders |
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
| 1 | CRITICAL | app-popups.js | Vision data field mappings corrected: `numGarages`â†’`garageSpaces`, `yearBuilt`â†’`yrBuilt`, `totalSqft`â†’`sqFt` |
| 2 | CRITICAL | app-popups.js | XSS in hazard detection â€” AI response HTML now escaped before DOM insertion |
| 3 | CRITICAL | app-property.js | `btoa(String.fromCharCode(...bytes))` stack overflow on large images â€” now chunked |
| 4 | CRITICAL | app-core.js | Null check for `user.email.split('@')` â€” crashes if email is null |
| 5 | CRITICAL | accounting-export.js | Added `&quot;` escaping to `escHtml()` â€” attribute injection vulnerability |
| 6 | HIGH | app-boot.js | Cmd+S toast fires only when save actually called (was showing even on no-op) |
| 7 | HIGH | app-boot.js | Enter key no longer overrides focused buttons (hijacked button clicks) |
| 8 | HIGH | app-core.js | Null checks on `stepTitle`, `progressBar`, `btnBack`, `btnNext` (crash on missing DOM) |
| 9 | HIGH | app-core.js | Null check on `phone` element in updateUI (crash if element missing) |
| 10 | HIGH | app-core.js | `setFieldValue()` now calls `this.save()` â€” was bypassing encryption |
| 11 | HIGH | app-quotes.js | Fixed `q.qType`/`q.timestamp` â†’ `q.data?.qType`/`q.updatedAt` (wrong property paths) |
| 12 | HIGH | auth.js | Removed duplicate `getIdToken()` and `apiFetch()` methods |
| 13 | MEDIUM | app-scan.js | Canvas + ImageBitmap memory leak cleanup |
| 14 | MEDIUM | app-vehicles.js | Canvas memory leak cleanup |
| 15 | MEDIUM | app-core.js | Save race condition â€” added `_saving` lock + `saveToken` sequence |
| 16 | MEDIUM | app-core.js | `loadExportHistory()` cross-file dependency guard for `_escapeAttr` |
| 17 | MEDIUM | app-quotes.js | `showDuplicateWarning()` uses `escapeHTML` instead of cross-file `_escapeAttr` |
| 18 | MEDIUM | app-quotes.js | Removed duplicate `_escapeHTML` method |
| 19 | MEDIUM | app-popups.js | 15 `alert()` calls â†’ `this.toast()` |
| 20 | MEDIUM | app-popups.js | 3 FileReader Promises got `onerror` handlers (were silently hanging) |
| 21 | LOW | data-backup.js | Fixed `\\n` double-escaped newline in string literal |

### Scanner Audit Fixes (February 2026)

| # | Severity | File | Fix Description |
|---|----------|------|------------------|
| 22 | CRITICAL | app-scan.js | Gender normalization in `applyExtractedData()` â€” AI returns "Male"/"Female", form needs "M"/"F" |
| 23 | HIGH | app-scan.js | Primary driver from scan now includes all fields: gender, maritalStatus, occupation, education, dlStatus, ageLicensed |
| 24 | HIGH | app-scan.js | Additional drivers from text parsing now include all fields (were missing gender, maritalStatus, etc.) |
| 25 | MEDIUM | app-scan.js | Gender normalization in `applyInitialDriverLicense()` â€” DL scan gender now normalized |
| 26 | MEDIUM | app-scan.js | DL scan driver creation now includes maritalStatus, education, dlStatus, ageLicensed |
| 27 | LOW | app-scan.js | Canvas cleanup on `optimizeImage()` fallback path â€” canvas.width/height zeroed when blob is null |
| 28 | MEDIUM | policy-scan.js | Server API schema synced with client `_getScanSchema()` â€” added ~40 missing fields |
| 29 | MEDIUM | policy-scan.js | Server system prompt updated with CRITICAL FORMATTING RULES section + gender M/F instruction |
| 30 | MEDIUM | policy-scan.js | Server user prompt expanded with safety/protection, claims/violations, additional field categories |

### Login innerHTML Null Guard Fixes (February 2026)

| # | Severity | File | Fix Description |
|---|----------|------|-----------------|
| 31 | CRITICAL | cloud-sync.js | `App.load()` called without `await` in `pullFromCloud()` â€” errors became unhandled rejections. Now properly awaited so errors are caught by outer try-catch |
| 32 | HIGH | app-core.js | `document.getElementById('mainContainer').scrollTo(0,0)` in `updateUI()` â€” null crash when quoting plugin not loaded. Now null-guarded |
| 33 | HIGH | app-core.js | Encrypted load path (`CryptoHelper.decrypt` + `applyData`) had no try-catch â€” errors propagated as unhandled rejections. Now wrapped in try-catch |
| 34 | MEDIUM | app-boot.js | Enhanced `unhandledrejection` handler to log `e.reason?.stack` instead of just `e.reason` for better debugging |
| 35 | MEDIUM | compliance-dashboard.js | Added null guards to `cglLastFetch`, loading/error/tableContainer, `cglTableBody`, `cglHiddenCount`, `cglFilteredCount`, `cglTotalCount` innerHTML assignments |
| 36 | MEDIUM | email-composer.js | Added null guards to `emailComposeBtn`, `emailOutputCard`, `emailOutputText` innerHTML/textContent in `compose()` and its catch/finally blocks |

### CSS Fixes Applied (February 2026 Audit)

| Scope | Files | Fix |
|-------|-------|-----|
| Wrong variable names | main.css (11), auth.css (3), quickref.css (8), email.css (6), compliance.css (1) | All corrected to valid `--bg-card`, `--text`, `--bg-input`, `--border` |
| Dark mode selectors | security-info.css (4 selectors) | `[data-theme="dark"]` â†’ `body.dark-mode` |
| Missing focus states | email.css, quickref.css, onboarding.css, compliance.css, bug-report.css | Added `:focus-visible` outlines/box-shadows |
| AI Intake UI overhaul | intake-assist.css | Professional redesign: pill-shaped chips with colored tints, 1px card borders with subtle shadows, transparent card headers, circular send/upload buttons, focus glow rings, tighter layout padding, full dark mode coverage |
| AI Intake UI rework (Phase 2) | intake-assist.css, intake-assist.html | Enhanced cards (layered shadows, gradient header accents), gradient user message bubbles, spring animations, refined input area (gradient send button, enhanced focus glow), sidebar surface hierarchy (#0A0A0Aâ†’#1C1C1Eâ†’#2C2C2E), card-based empty state with pulsing icon, custom scrollbars, desktop wide-screen breakpoints (1280px/1440px), comprehensive dark mode elevation for ~30 selectors, mobile dark mode full-bleed |
| Desktop-first layout overhaul | main.css (+350 lines), reminders.css, hawksoft.css, accounting.css, email.css, quickref.css, vin-decoder.css, quote-compare.css, compliance.css | Quoting wizard: centered max-width container (960â†’1080â†’1200px), multi-column step layouts (steps 0/4/6), constrained footer, denser form grids, scan actions horizontal, wider modals. All plugins: desktop padding/spacing/grid enhancements. Generic `plugin-container > main/header` constraint at 1100px. Prospect content cap at 1000px. Footer sidebar-aware offset. |
| Mobile dark mode visibility | main.css, dashboard.css, sidebar.css | Cards/widgets: border opacity 6%â†’10-12%, depth shadows added. Mobile `<767px`: `.app-content` bg `#0D0D0D` (lifts off pure black), header/bottom-nav solid bg + visible borders, widget accent stripes 50%â†’70% opacity, ambient orbs boosted, bento grid gap tightened to 12px. Footer border made visible in dark mode. |
| Call Logger UI redesign | call-logger.css, call-logger.html | Glassmorphism cards (backdrop-filter blur+saturate), hero "how-it-works" 3-step strip with gradient icons, form sections with SVG icon headers, side-by-side grid for client name + call type, gradient submit/confirm buttons, spring animations, comprehensive dark mode with solid surfaces |
| Theme-pro select chevron fix | theme-professional.css | `background:` â†’ `background-color:` on `body.theme-pro input/select/textarea` â€” shorthand was overriding `background-image` SVG chevrons in Call Logger select |
| Call Logger on-demand policy pre-fetch | call-logger.js, call-logger.css | Call Logger now independently fetches policies from compliance API if cache is empty â€” no need to visit Compliance Dashboard first. Shows subtle "Loading client listâ€¦" hint while fetching. Tries disk cache â†’ API â†’ stores in `altech_cgl_cache` localStorage |
| Call Logger status bar + refresh | call-logger.html, call-logger.css, call-logger.js | Replaced hero 3-step icon strip with professional client sync status bar. Shows live loading state (pulsing blue dot + "Checking local cacheâ€¦" / "Syncing clients from HawkSoftâ€¦"), success state (green dot + "X clients loaded"), and error state (red dot + message). Added "Refresh" button with spinning icon animation for manual retry. Full dark mode + responsive support. |
| Call Logger â€” remove AI branding + enhance confirm UX | call-logger.html, call-logger.js, call-logger.css, call-logger.test.js | Removed all user-facing "AI" references (header, placeholder, comments). Restructured confirm section with labeled summary rows (Client, Policy, Call Type) and a "Confirm Before Logging" header + review notice. Button icon changed from âœ¨ to ðŸ”. |
| Call Logger â€” desktop layout overhaul | call-logger.html, call-logger.css, call-logger.test.js | Replaced non-standard `plugin-header` with standard `header-top` / `tool-header-brand` pattern (home button, dark mode toggle, gradient title). Widened container from 860px to 1200px. Added two-column desktop grid (form left, preview/confirm right with sticky positioning) at 960px+ breakpoint. Added 1280px wide-screen enhancements. Header now matches Compliance, Reminders, and all other plugins. |

### Cache Pipeline Fix â€” Personal Lines Now Appear in Call Logger (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 45 | CRITICAL | api/compliance.js | KV (Redis) cache validity now requires `allPolicies?.length > 0` â€” stale server-side cache without personal lines forces re-fetch from HawkSoft |
| 46 | CRITICAL | js/compliance-dashboard.js | `_loadFromAnyCache()` all 4 sources (disk, IDB, localStorage, KV) now require both `policies` AND `allPolicies` â€” stale cache without personal lines is rejected |
| 47 | CRITICAL | js/compliance-dashboard.js | `loadFromCache()` (IDB â†’ localStorage â†’ disk fallback) also requires `allPolicies` |
| 48 | HIGH | js/call-logger.js | Disk cache path in `_ensurePoliciesLoaded()` now only accepts data with `allPolicies` â€” CGL-only disk cache falls through to API instead of promoting stale data |
| 49 | HIGH | js/call-logger.js | Disk cache status bar now counts unique client names (not raw policy count) for consistency |
| 50 | MEDIUM | tests/ | Added 9 new source-level tests across api-compliance, call-logger, and plugin-integration test files verifying cache requires allPolicies |

**Root cause:** The multi-tier cache system (IndexedDB â†’ localStorage â†’ disk â†’ Vercel KV) validated cache entries by checking only `policies?.length > 0`. Cache written before the `allPolicies` feature (which includes personal lines) was treated as valid, promoted across all tiers, and served to the Call Logger. Users saw only ~3080 commercial clients with zero personal profiles. Fix forces all tiers to re-fetch when `allPolicies` is absent.

### Prospect/Policy-Less Client Support â€” All HawkSoft Clients in Call Logger (March 2026)

| # | Scope | Files | Description |
|---|-------|-------|-------------|
| 51 | CRITICAL | api/compliance.js | Added `allClientsList` array â€” built from ALL `allClients` (every HawkSoft client regardless of policy status, including pure prospects). Each entry: `{ clientNumber, clientName }` using same name resolution chain. Included in API response and metadata. |
| 52 | HIGH | js/call-logger.js | `_getClients()` now merges `allClientsList` as Source 2 â€” prospect/policy-less clients added to dropdown with `policies: []` and `hawksoftId` |
| 53 | HIGH | js/call-logger.js | `_handleFormat()` clientNumber fallback: `_selectedPolicy.hawksoftId â†’ _selectedClient.hawksoftId â†’ ''` for prospect clients |
| 54 | MEDIUM | js/call-logger.js | Confirm section shows "No active policies" badge for policy-less clients; HawkSoft link still shown using hawksoftId |
| 55 | MEDIUM | js/call-logger.js | `_countClients(data)` helper prefers `allClientsList` count over `allPolicies`-derived count in all 4 status bar update locations |
| 56 | MEDIUM | tests/ | Added 10 new tests (7 call-logger + 3 api-compliance) verifying allClientsList integration, prospect merging, deduplication, backward compat |

**Root cause:** The `allPolicies` pipeline in `api/compliance.js` has 3 filters that exclude prospect/policy-less clients: (1) skip clients with zero policies, (2) skip prospect-status policies, (3) skip expired >1yr policies. Many HawkSoft clients â€” especially "Prospect Customer (Personal)" entries â€” have no active policies and were invisible in the Call Logger. Fix adds a parallel `allClientsList` array that includes ALL clients from HawkSoft, merged into the Call Logger dropdown alongside policy-bearing clients.

### HawkSoft Log Push â€” Call Logger to HawkSoft Integration Fixes (March 2026)

| # | Severity | Files | Fix Description | Commit |
|---|----------|-------|-----------------|--------|
| 57 | CRITICAL | api/hawksoft-logger.js, js/call-logger.js | `.trim()` crash â€” HawkSoft returns numeric `clientNumber`, must call `String()` before `.trim()`. Added coercion in 5 locations. | `ace3004` |
| 58 | HIGH | api/hawksoft-logger.js | `formatOnly` response was missing `clientNumber` field â€” client couldn't display it in confirm section. Added to response + surfaced `hawksoftError` in toast. | `228641e` |
| 59 | CRITICAL | api/hawksoft-logger.js | 404 error â€” endpoint URL was `/clients/{id}/logNotes` (wrong). Changed to `/client/{id}/log` (singular, different path). Added `refId` (UUID) and `ts` (ISO timestamp) to request body. | `002781f` |
| 60 | HIGH | api/hawksoft-logger.js | "Invalid Channel" 400 error â€” action codes `29`/`30` don't exist for phone calls. Changed to `1` (Phone To Insured) and `5` (Phone From Insured). | `4481e38` |
| 61 | MEDIUM | api/hawksoft-logger.js, js/call-logger.js | Added comprehensive diagnostic logging to both push paths (server) and failure handler (client) for live debugging. | `1f2a807` |
| 62 | CRITICAL | api/hawksoft-logger.js | Still getting "Invalid Channel" â€” JSON field name was `action` but HawkSoft expects `channel`. Renamed in both push paths. | `15e781f` |
| 63 | HIGH | api/compliance.js, js/call-logger.js, api/hawksoft-logger.js | Log appeared at client level, not under specific policy. Root cause: not sending `policyId` (HawkSoft internal GUID). Threaded `hawksoftPolicyId` through entire pipeline: compliance.js â†’ call-logger.js â†’ hawksoft-logger.js â†’ HawkSoft request body. | `3b77e92` |

**Root cause chain:** Seven iterative fixes required because (1) HawkSoft API documentation in our codebase was incorrect (`action` vs `channel`, wrong URL path, wrong action codes), (2) HawkSoft returns numeric types where strings were expected, and (3) policy-level logging requires an internal GUID (`policyId`) that wasn't being passed through the data pipeline.

### Known Issues NOT Fixed (Intentional / Cosmetic)

- `theme-professional.css` uses low-opacity rgba on dark backgrounds (cosmetic preference)
- `theme-professional.css` `background-color` fix applied for selects â€” other input types unaffected
- `ezlynx.css` top half uses hardcoded glassmorphism palette (design choice, bottom half uses variables)
- 7 CSS files lack dark mode overrides (relies on variable auto-switching)
- 3 CSS files use `.dark-mode` without `body` prefix (works due to specificity)

---

## Appendix A: Plugin System â€” Adding a New Plugin

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
{ key: 'yourplugin', icon: 'ðŸ”§', color: 'icon-blue', title: 'Your Plugin',
  name: 'Your Plugin', containerId: 'yourPluginTool', initModule: 'YourPlugin',
  htmlFile: 'plugins/your-plugin.html', category: 'ops' }
```

### Step 5: Add Cloud Sync (if needed)

In `js/cloud-sync.js`:
- `_getLocalData()` â†’ add `yourData: tryParse('altech_your_key')`
- `pushToCloud()` â†’ add `_pushDoc(...)` to Promise.all
- `pullFromCloud()` â†’ add pull + UI refresh
- `deleteCloudData()` â†’ add to `syncDocs` array

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
| `/api/property-intelligence?mode=rag-interpret` | POST | Security | Assessor data â†’ form fields |
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
â”œâ”€â”€ setup.js                    # Jest env: mock fetch, suppress crypto errors
â”œâ”€â”€ ai-router.test.js           # AI router multi-provider logic
â”œâ”€â”€ api-compliance.test.js      # Compliance API (HawkSoft CGL)
â”œâ”€â”€ api-property.test.js        # Property intelligence API
â”œâ”€â”€ api-prospect.test.js        # Prospect lookup API
â”œâ”€â”€ api-security.test.js        # API security middleware
â”œâ”€â”€ app.test.js                 # Core App object + form handling
â”œâ”€â”€ ezlynx-pipeline.test.js    # EZLynx export pipeline
â”œâ”€â”€ intake-assist.test.js       # Intake assist module tests
â”œâ”€â”€ integration.test.js         # Cross-module integration
â”œâ”€â”€ performance.test.js         # Performance benchmarks
â”œâ”€â”€ phase1.test.js              # Phase 1 feature tests
â”œâ”€â”€ phase2.test.js              # Phase 2 feature tests
â”œâ”€â”€ phase3.test.js              # Phase 3 feature tests
â”œâ”€â”€ phase4.test.js              # Phase 4 feature tests
â”œâ”€â”€ phase5.test.js              # Phase 5 feature tests
â”œâ”€â”€ plugin-integration.test.js  # Plugin system integration
â”œâ”€â”€ prospect-client.test.js     # Prospect client-side module
â”œâ”€â”€ server.test.js              # Local dev server (server.js)
â”œâ”€â”€ hawksoft-logger.test.js     # HawkSoft Logger API (67 tests, channel field, policyId)
â””â”€â”€ call-logger.test.js         # Call Logger client module (152 tests, hawksoftPolicyId pipeline)
```

Tests load `index.html` into JSDOM: `new JSDOM(html, { runScripts: 'dangerously' })`. The test setup file mocks `fetch`, silences console noise, and suppresses expected `crypto.subtle` errors.
