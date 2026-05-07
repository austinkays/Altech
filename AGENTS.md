# AGENTS.md — Altech Field Lead: AI Agent Onboarding Guide

> **Last updated:** April 17, 2026
> **For:** AI coding agents working on this codebase
> **Version:** Comprehensive — read this before making ANY changes
>
> **⚠️ LIVING DOCUMENT:** Add an entry to `CHANGELOG.md` at the end of every work session with what changed. Run `npm run audit-docs` to check for drift.

---

## 1. App Overview

**Altech Field Lead** is a desktop-first insurance intake wizard for independent insurance agents. The core workflow: scan a policy document → AI extracts data → agent corrects the form → save drafts → export to HawkSoft (`.cmsmtf`), EZLynx (browser extension bridge), or PDF.

| Attribute | Value |
|-----------|-------|
| **Stack** | Vanilla HTML/CSS/JS SPA — no build step, no framework |
| **Entry point** | `index.html` (~742 lines) |
| **CSS** | 34 files in `css/` (~22,946 lines total) |
| **JS** | 51 modules in `js/` (~43,480 lines total) |
| **Plugins** | 18 HTML templates in `plugins/` (~6,335 lines total) |
| **APIs** | 13 serverless functions + 3 helpers in `api/` (~8,592 lines total) |
| **Auth** | Firebase Auth (email/password, compat SDK v10.12.0) |
| **Database** | Firestore (`users/{uid}/sync/{docType}`, `users/{uid}/quotes/{id}`) |
| **Encryption** | AES-256-GCM via Web Crypto API (`CryptoHelper`) |
| **Local server** | `server.js` (Node.js ESM, 680 lines) |
| **Deploy** | Vercel (serverless functions + static) |
| **Desktop** | Tauri v2 (optional, `src-tauri/`) |
| **Tests** | Jest + JSDOM, 31 suites, 1797 tests |
| **Package** | ESM (`"type": "module"` in package.json) |
| **Author** | Austin Kays |
| **License** | MIT |
| **Repo** | `github.com/austinkays/Altech` |

### Quick Commands

```bash
npm run dev           # Local dev server (server.js on port 3000)
npm test              # All 31 suites, 1797 tests
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
├── css/                        # 34 stylesheets (~22,946 lines)
│   ├── variables.css           # :root CSS custom properties + body.dark-mode overrides (all theme tokens)
│   ├── base.css                # Reset, body, typography, scrollbars
│   ├── components-cards.css    # Cards, quote cards, driver/vehicle, export cards, map previews (split from components.css, 2026-04)
│   ├── components-inputs.css   # Form input styles (split)
│   ├── components-quote-library.css # Quote library search (split)
│   ├── components-buttons.css  # Buttons + utility buttons + producer toggle (split)
│   ├── components-forms.css    # Form enhancements, radio cards, validation, consent, Places autocomplete (split)
│   ├── components-modals.css   # Data preview modal + dark-mode modal overrides (split)
│   ├── components-toasts.css   # Toast notifications (split)
│   ├── components-loading.css  # Standardized loading + skeleton placeholders (split)
│   ├── components-misc.css     # Co-applicant, scan drop zone, debug UI, demo link, dark-mode badges (split)
│   ├── components-acord.css    # ACORD 25 form styles + print + [data-tooltip] hover popovers (split)
│   ├── components-pwa.css      # PWA update banner + install button (split)
│   ├── layout.css              # Header, sidebar, plugin container, media queries
│   ├── animations.css          # All @keyframes — never define @keyframes in plugin CSS
│   ├── landing.css             # Landing / bento grid / tool-row styles
│   ├── theme-professional.css  # Dark pro theme, body.theme-pro overrides (350 lines)
│   ├── sidebar.css             # Desktop/tablet/mobile sidebar layouts + img logo (866 lines)
│   ├── dashboard.css           # Bento grid dashboard widgets (1,244 lines)
│   ├── call-logger.css         # HawkSoft Logger plugin + desktop two-column layout + 5-channel/8-activity quick-tap buttons + status bar + client autocomplete + policy selector + HawkSoft deep links + New Log button (934 lines)
│   ├── compliance-main.css     # CGL dashboard core — table, badges, save indicator, fetch progress, notes panel (split from compliance.css, 2026-04)
│   ├── compliance-print-dark.css # Print mode + CGL dark mode overrides + badges (split)
│   ├── compliance-responsive.css # Desktop enhancements, mobile stat-card stacking, callouts, step cards (split)
│   ├── auth.css                # Auth modal + settings + Agency Glossary textarea (1,009 lines)
│   ├── reminders.css           # Task reminders (1,169 lines)
│   ├── intake-assist-chat.css  # Split layout, mobile tab bar, chat pane, message bubbles, suggestion chips, input row
│   ├── intake-assist-sidebar.css # Sidebar header, collapsible data sections, map + vehicle cards
│   ├── intake-assist-features.css # Responsive, legacy compat, document upload, copy, inline edit, hazard badges, market/trends cards
│   ├── intake-assist-polish.css # Focus visible, reduced motion, drag-drop overlay, desktop scaling, scrollbar, dark-mode polish
│   ├── ezlynx.css              # EZLynx export — standalone dark palette (590 lines)
│   ├── vin-decoder.css         # VIN decoder (646 lines)
│   ├── hawksoft.css            # HawkSoft export (555 lines)
│   ├── quote-compare.css       # Quote comparison tool (556 lines)
│   ├── onboarding.css          # First-run wizard (411 lines)
│   ├── admin.css               # Admin panel (300 lines)
│   ├── bug-report.css          # Bug reporter (227 lines)
│   ├── quickref.css            # Quick reference — teal accent + editable number rows (677 lines)
│   ├── security-info.css       # Security modal (217 lines)
│   ├── accounting.css          # Accounting vault + export — tab bar, PIN gate, polished form/toolbar, card grid, dark mode, coin counter (778 lines)
│   ├── email.css               # Email composer — purple accent + custom prompt styles (256 lines)
│   ├── endorsement-parser.css  # Endorsement parser — paste view, cards, dark utilitarian styling (455 lines)
│   ├── task-sheet.css           # Task Sheet — HawkSoft CSV task viewer, priority badges, overdue rows, print layout (981 lines)
│   ├── returned-mail.css        # Returned Mail Tracker — deliverability badges, status badges, responsive form+table, print styles, full dark mode, Street View + satellite map images (799 lines)
│   ├── paywall.css             # Paywall modal (131 lines)
│   ├── blind-spot-brief.css    # Blind Spot Brief plugin (294 lines)
│   ├── commercial-quoter.css   # Commercial Lines quoter — 7-step wizard, dark mode, responsive (743 lines)
│   ├── dec-import.css          # Dec Page Importer plugin (354 lines)
│   ├── deposit-sheet.css       # Deposit Sheet plugin (662 lines)
│   └── aurora-theme.css        # Aurora northern-lights theme — variable overrides, html::before/::after animated layers, glassmorphism (138 lines)
│
├── js/                         # 51 modules (~43,480 lines)
│   │
│   │  ★ Core App (assembled via Object.assign into global `App`)
│   ├── app-init.js             # State init, toolConfig[], workflows, stepTitles (6 entries: step-0,1,3,4,5,6 — step-2 removed as dead code)
│   ├── app-ui-utils.js         # App.toast(), App.toggleDarkMode(), App.loadDarkMode(), App.formatDateDisplay(), App.copyToClipboard()
│   ├── app-navigation.js       # App.updateUI(), App.navigateTo(), step progression, hash routing
│   ├── app-core.js             # save/load, form field persistence, schema migration, encryption, clearExportHistory() — persistence-only (updateUI/navigateTo → app-navigation.js; toast/dark-mode → app-ui-utils.js)
│   ├── app-scan.js             # Policy document scanning, OCR, Gemini AI (2,153 lines)
│   ├── app-property.js         # Property analysis, maps, assessor data, Redfin integration, listing URL lookup (2,621 lines)
│   ├── app-vehicles.js         # Vehicle/driver management, DL scanning, per-driver incidents (645 lines)
│   ├── app-popups.js           # Vision processing, hazard detection, popups (1,447 lines)
│   ├── app-export.js           # PDF/CMSMTF/CSV/Text exports, per-driver history aggregation, scan schema, AI coverage gap analysis (1,618 lines)
│   ├── app-quotes.js           # Quote/draft management, client history auto-save, search + view-all (927 lines)
│   ├── app-boot.js             # Boot sequence, error boundaries, keyboard shortcuts, beforeunload safety net, Places API idempotent loader (365 lines)
│   │
│   │  ★ Infrastructure
│   ├── crypto-helper.js        # AES-256-GCM encrypt/decrypt, UUID generation
│   ├── storage-keys.js         # window.STORAGE_KEYS — frozen map of all 53 localStorage key strings (single source of truth — never hardcode keys)
│   ├── utils.js                # window.Utils: escapeHTML, escapeAttr, tryParseLS, debounce — never define these inline in plugins
│   ├── fields.js               # window.FIELDS / window.FIELD_BY_ID — ~175 intake form field definitions with id/label/type/section
│   ├── pdf-lib-loader.js       # window.PDFLibs.ensure('jspdf'|'jszip'|'pdfjs'|'pdflib'|[...]) — lazy-loads ~600 KB of PDF CDN libs on demand (58 lines)
│   ├── firebase-config.js      # Firebase app init (fetches config from /api/config)
│   ├── auth.js                 # Firebase auth (login/signup/reset/account), apiFetch()
│   ├── cloud-sync.js           # Firestore sync (11 doc types incl. glossary + vault + quickRefNumbers, conflict resolution, 676 lines)
│   ├── ai-provider.js          # Multi-provider AI abstraction (Google/OpenRouter/OpenAI/Anthropic)
│   ├── dashboard-widgets.js    # Bento grid, sidebar render, mobile nav, breadcrumbs, edit SVG, auth-gated CGL widget, client search (1,418 lines)
│   │
│   │  ★ Plugin Modules (IIFE or const pattern, each on window.ModuleName)
│   ├── coi.js                  # ACORD 25 COI PDF generator (789 lines)
│   ├── compliance-dashboard.js # CGL compliance tracker, 6-layer persistence, print-to-PDF, renewal dedup, needsStateUpdate, snooze/sleep, emoji note icons (Windows-safe: 🏠🔰💤), note-count badge, two-step workflow (State Updated / HawkSoft Updated), CSS-class-based button colors (no inline styles), note icon tooltips via _noteIconHtml() (2,930 lines)
│   ├── email-composer.js       # AI email polisher, encrypted drafts, dynamic persona + custom prompt override (497 lines)
│   ├── endorsement-parser.js   # AI-powered endorsement email parser, extracts structured data from carrier change requests (805 lines)
│   ├── ezlynx-tool.js          # EZLynx rater export, Chrome extension bridge (1,119 lines)
│   ├── hawksoft-export.js       # HawkSoft .CMSMTF generator, full CRUD UI, lossless vehicle+driver rebuild, per-driver FSC incidents, Client Office field (1,770 lines)
│   ├── intake-assist.js         # AI conversational intake, INTAKE_PHASES flow engine, qType-aware chips, maps, progress ring (3,112 lines)
│   ├── policy-qa.js             # Policy document Q&A chat, carrier detection (1,005 lines)
│   ├── prospect.js              # Commercial prospect investigation, risk scoring (2,318 lines)
│   ├── quick-ref.js             # NATO phonetic + agent ID cards + editable quick dial numbers (758 lines)
│   ├── quote-compare.js         # Quote comparison + AI recommendation (1,098 lines)
│   ├── reminders.js             # Task reminders, PST timezone, snooze/defer, weekly summary, daily digest toast from /api/reminders-sweep cron (1,138 lines)
│   ├── vin-decoder.js           # VIN decoder with NHTSA API (785 lines)
│   ├── accounting-export.js     # Encrypted vault (AES-256-GCM, PIN, multi-account CRUD) + trust deposit calculator + coin counter (1,305 lines)
│   ├── call-logger.js          # HawkSoft Logger — two-step preview/confirm, 5-channel quick-tap, 8 activity-type buttons with templates, + New Log reset, Agency Glossary, client→policy autocomplete, HawkSoft deep links, personal lines + prospect support, status bar + manual refresh, hawksoftPolicyId pipeline (1,233 lines)
│   ├── task-sheet.js            # HawkSoft CSV task viewer — upload, parse, sort (overdue→priority→date), 9-col table, print-friendly layout (838 lines)
│   ├── returned-mail.js         # Returned Mail Tracker — address validator (Google API), Street View + satellite imagery, log CRUD, HawkSoft copy output, CSV export (575 lines)
│   ├── blind-spot-brief.js      # Blind Spot Brief — coverage gap analyzer (374 lines)
│   ├── commercial-quoter.js     # Commercial Lines — 7-step intake wizard, 73 fields, PDF + CMSMTF export; bizName required-field validation; Places retry capped at 10; map image onerror handlers; filename sanitization (1,335 lines)
│   ├── dec-import.js            # Dec Page Importer — PDF/image → form-fill pipeline (734 lines)
│   ├── deposit-sheet.js         # Deposit Sheet — trust deposit calculator + CSV export (499 lines)
│   │
│   │  ★ Support Modules
│   ├── onboarding.js            # 4-step first-run wizard, invite codes (413 lines)
│   ├── paywall.js               # Stripe paywall (beta, disabled) (229 lines)
│   ├── admin-panel.js           # User management admin panel (281 lines)
│   ├── bug-report.js            # GitHub Issue bug reporter, hash-based page detection (269 lines)
│   ├── data-backup.js           # Import/export all data + keyboard shortcuts (121 lines)
│   └── hawksoft-integration.js  # HawkSoft REST API client (261 lines)
│
├── plugins/                    # 22 HTML templates (~6,778 lines, loaded dynamically)
│   ├── quoting.html            # ★ Main intake wizard — 7 steps, Employment & Education inline in About You card, 2,091 lines
│   ├── ezlynx.html             # EZLynx rater form — 80+ fields, 1,077 lines
│   ├── coi.html                # ACORD 25 COI form (418 lines)
│   ├── prospect.html           # Commercial investigation UI (333 lines)
│   ├── accounting.html         # Accounting vault + export — tabbed layout, PIN screens, polished form/toolbar, account cards, coin counter (292 lines)
│   ├── compliance.html         # CGL dashboard + print toolbar + two-step workflow help (no progress bar) (298 lines)
│   ├── vin-decoder.html        # VIN decoder (141 lines)
│   ├── reminders.html          # Task manager (144 lines)
│   ├── intake-assist.html      # AI chat two-pane (152 lines)
│   ├── quotecompare.html       # Quote comparison (117 lines)
│   ├── email.html              # Email composer + custom AI persona section (125 lines)
│   ├── endorsement.html        # Endorsement parser — paste area, parsed cards display (54 lines)
│   ├── qna.html                # Policy Q&A chat (95 lines)
│   ├── quickref.html           # Quick reference — ID cards, speller, editable numbers, phonetic grid (140 lines)
│   ├── call-logger.html        # HawkSoft Logger + standard header + desktop two-column grid + 5 channel buttons + 8 activity buttons + status bar + client autocomplete + New Log button (160 lines)
│   ├── task-sheet.html          # Task Sheet — drop zone, meta bar, table output, print/clear buttons (50 lines)
│   ├── returned-mail.html       # Returned Mail Tracker — address validator, log form, table + actions (127 lines)
│   ├── hawksoft.html           # HawkSoft export (21 lines — JS renders body)
│   ├── blind-spot-brief.html    # Blind Spot Brief UI (32 lines)
│   ├── commercial-quoter.html   # Commercial Lines wizard — 7 steps, 73 fields (696 lines)
│   ├── dec-import.html          # Dec Page Importer UI (131 lines)
│   └── deposit-sheet.html       # Deposit Sheet UI (108 lines)
│
├── api/                        # ~14 serverless endpoints + many `_`-prefixed helpers (~8,500 lines). Project is on Vercel Pro (April 2026) — ceiling is ~1000 functions, no longer a constraint.
│   ├── _ai-router.js           # ★ Shared: multi-provider AI router (NOT an endpoint)
│   ├── _apify-client.js        # ★ Shared: Apify web scraper client — Redfin Detail + Zillow Search actors (NOT an endpoint)
│   ├── config.js               # Firebase config, API keys, phonetics, bug reports
│   ├── policy-scan.js          # OCR document extraction via Gemini (260 lines)
│   ├── vision-processor.js     # Image/PDF analysis, DL scanning, aerial analysis (880 lines)
│   ├── property-intelligence.js # Thin router (~77 lines) — dispatches ?mode=arcgis|satellite|zillow|listing-search|rentcast|firestation|rag-interpret|validate-address to _property-*.js helpers
│   ├── _property-arcgis.js     # County ArcGIS parcel queries + Clark fact sheet + FEMA flood (helper)
│   ├── _property-flood.js      # FEMA NFHL flood zone lookup (5s timeout)
│   ├── _property-mapping.js    # Fuzzy enum maps + mapZillowToAltech shared normalizer
│   ├── _property-rentcast.js   # Rentcast /v1/properties lookup
│   ├── _property-apify.js      # Apify Redfin Detail + Zillow Search mappers
│   ├── _property-zillow.js     # Tiered cascade (Rentcast → Apify → Gemini) for ?mode=zillow
│   ├── _property-satellite.js  # Google Static Maps + Street View + AI vision (?mode=satellite)
│   ├── _property-firestation.js # Google Places fire station + protection class (?mode=firestation)
│   ├── _property-listing.js    # URL/address → Apify + Gemini search grounding (?mode=listing-search)
│   ├── _property-address-validate.js # Google Address Validation + geocoding fallback
│   ├── _property-shared.js     # getGoogleApiKey + getMapsApiKey env readers
│   ├── prospect-lookup.js      # Thin router (~68 lines) — dispatches ?type=li|sos|or-ccb|osha|sam|places|ai-analysis to _prospect-*.js helpers
│   ├── _prospect-li.js         # WA L&I Contractor Registry + principal names (Socrata m8qx-ubtq + 4xk5-x9j6)
│   ├── _prospect-or-ccb.js     # Oregon CCB active licenses (Socrata g77e-6bhs)
│   ├── _prospect-sos.js        # SOS lookups — WA CCFS + DOR fallback, OR Socrata, AZ manual-search deep link
│   ├── _prospect-osha.js       # DOL OSHA inspection + violation API
│   ├── _prospect-sam.js        # SAM.gov Entity Management API v3
│   ├── _prospect-places.js     # Google Places text/discover/details + state/city extraction
│   ├── _prospect-ai-analysis.js # Commercial underwriting AI dossier + buildDataContext
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
│   ├── content.js              # Form-fill content script (5304 lines) ⚠️ Never read in full — always grep for line numbers first
│   │   ├── §1–§10.5            # Config, abbreviations, field maps, fill primitives,
│   │   │                       #   toolbar, fill orchestration, SPA nav, page scraper
│   │   ├── §13 Route Registry  # ROUTE_TABLE (8 routes), routeToRegex(), matchRoute()
│   │   ├── §14 DOM Harvester   # harvestFormFields(), splitColumnarFields()
│   │   └── §15 Positional Fill # FIELD_LABEL_MAP, POSITIONAL_OVERRIDES,
│   │                           #   fillMatSelectByEl(), fillElementPositional(),
│   │                           #   fillPageSequential() — primary fill entry point
│   ├── background.js
│   ├── altech-bridge.js
│   ├── property-scraper.js     # Redfin property scraper — extracts 18+ fields (heating, cooling, roof, foundation, pool, etc.)
│   └── defaultSchema.js
│
├── tests/                      # Jest test suites
│   ├── setup.js                # Test env setup (mock fetch, suppress crypto errors)
│   ├── ezlynx-extension-fill.test.js  # §13–§15 route registry + positional fill engine
│   └── *.test.js               # 24 test files, 1455+ tests
│
├── lib/                        # Shared server-side utilities
├── scripts/                    # Build/utility scripts
├── src-tauri/                  # Tauri desktop app (Rust)
├── python_backend/             # Python automation (Playwright HawkSoft, trust reports)
├── Resources/                  # Static assets
├── docs/                       # Architecture docs, roadmaps, guides
│   ├── RENTCAST_API.md         # ★ Authoritative Rentcast + FEMA flood zone reference — read before touching property-intelligence.js
│   └── ...                     # ARCHITECTURE.md, DOCUMENTATION_INDEX.md, technical/, guides/, etc.
```

---

## 3. CSS Architecture

### 3.1 Design System Variables

All CSS variables are defined in `css/variables.css`. There are **24 variables in `:root`** and **19 overrides in `body.dark-mode`**.

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

### 3.7 CSS File Responsibilities

| File | Edit for |
|------|----------|
| `variables.css` | CSS custom properties, `body.dark-mode` variable overrides — **only** |
| `base.css` | Global reset, body, typography |
| `layout.css` | App shell, sidebar dimensions, plugin container |
| `components.css` | Shared UI components (cards, buttons, modals, toasts) |
| `animations.css` | All `@keyframes` — **never define `@keyframes` in a plugin CSS file** |
| `[plugin].css` | Styles scoped to one plugin — standalone, do not touch in global refactors |

**How to find the right file:** `grep_search` the class/property across `css/` — the match that also appears in `index.html`'s `<link>` tags is the one to edit.

**`/* no var */` comments** mark hardcoded colors that still need a design token. Leave them intact — do not remove. Currently: `css/compliance.css` (3× `#FF9500` warning/saving states) and `css/components.css` (1× low-opacity rgba background). Run `grep -r "/* no var */" css/` to find all instances.

---

## 4. JavaScript Architecture

### 4.1 Global `App` Object — Assembly Pattern

The core app state lives on `window.App`. It is built incrementally across 9 files via `Object.assign(App, { ... })`:

```
app-init.js       →  App = { data, step, flow, storageKey, toolConfig[], stepTitles }
app-ui-utils.js   →  Object.assign(App, { toast, toggleDarkMode, loadDarkMode, formatDateDisplay, copyToClipboard })
app-navigation.js →  Object.assign(App, { updateUI, navigateTo, ... })
app-core.js       →  Object.assign(App, { save, load, ... })
app-scan.js       →  Object.assign(App, { processScan, openScanPicker, ... })
app-property.js   →  Object.assign(App, { smartAutoFill, openPropertyRecords, ... })
app-vehicles.js   →  Object.assign(App, { renderDrivers, renderVehicles, scanDL, ... })
app-popups.js     →  Object.assign(App, { processImage, analyzeAerial, detectHazards, ... })
app-export.js     →  Object.assign(App, { exportPDF, exportText, exportCMSMTF, ... })
app-quotes.js     →  Object.assign(App, { saveAsQuote, loadQuote, renderQuotesList, ... })
app-boot.js       →  Object.assign(App, { boot })  +  calls App.boot()
```

**Script load order matters.** `app-init.js` must load first (creates `window.App`), `app-boot.js` must load last (runs boot sequence). Among the core assembly files, the order above is required: `app-ui-utils.js` before `app-navigation.js` before `app-core.js`. Plugin modules loading after `app-core.js` are order-independent among themselves.

### 4.2 Plugin Module Pattern

Every plugin follows the same IIFE pattern:

```javascript
window.ModuleName = (() => {
    'use strict';
    const STORAGE_KEY = STORAGE_KEYS.YOUR_KEY;  // ✅ use STORAGE_KEYS — never hardcode
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
  2. storage-keys.js         ← window.STORAGE_KEYS  ✟ must precede App
  3. utils.js                ← window.Utils          ✟ must precede App
  4. fields.js               ← window.FIELDS / window.FIELD_BY_ID
  5. app-init.js             ← Creates window.App
  6. app-ui-utils.js         ← App.toast(), App.toggleDarkMode()
  7. app-navigation.js       ← App.updateUI(), App.navigateTo()
  8. app-core.js             ← App.save(), App.load()
  9. app-scan.js             ← App.processScan()
 10. app-property.js         ← App.smartAutoFill()
 11. app-vehicles.js         ← App.renderDrivers()
 12. app-popups.js           ← App.processImage()
 13. app-export.js           ← App.exportPDF(), App.exportCMSMTF()
 14. app-quotes.js           ← App.saveAsQuote()

Standalone Modules (order-independent):
  15. ai-provider.js         ← window.AIProvider
  16. dashboard-widgets.js   ← window.DashboardWidgets

Plugin Modules (order-independent among themselves):
  17–37. coi, prospect, quick-ref, accounting-export, compliance-dashboard,
         ezlynx-tool, quote-compare, intake-assist, email-composer, policy-qa,
         reminders, hawksoft-export, vin-decoder, commercial-quoter, data-backup

Support Modules (load after plugins):
  37. bug-report.js
  38. firebase-config.js     ← Must precede auth.js
  39. auth.js                ← Must precede cloud-sync.js
  40. admin-panel.js
  41. cloud-sync.js
  42. paywall.js
  43. onboarding.js
  44. app-boot.js            ← ★ MUST BE LAST — runs boot()
```

### 4.4 Cross-File Dependencies

| Method | Defined In | Called From |
|--------|-----------|------------|
| `App.toast()` | app-ui-utils.js | Almost every module |
| `App.save()` | app-core.js | app-scan, app-property, app-vehicles, app-popups, intake-assist |
| `App.data` | app-init.js | Every module that reads form data |
| `App.drivers` / `App.vehicles` | app-init.js | vehicles, ezlynx, hawksoft, intake-assist, export |
| `App._escapeAttr()` | app-export.js | app-quotes.js (guarded with fallback) |
| `CloudSync.schedulePush()` | cloud-sync.js | quick-ref, reminders, compliance, prospect, onboarding |
| `Auth.apiFetch()` | auth.js | Most plugins that call APIs |
| `Auth.isSignedIn` | auth.js | cloud-sync, paywall, admin |
| `CryptoHelper.encrypt/decrypt` | crypto-helper.js | app-core, app-quotes, app-vehicles, app-scan, cloud-sync, email-composer |
| `AIProvider.ask/chat` | ai-provider.js | intake-assist, email-composer, policy-qa, quote-compare |
| `Utils.escapeHTML(str)` | utils.js | Any plugin rendering user/AI data into HTML |
| `Utils.escapeAttr(str)` | utils.js | Any plugin building HTML attribute strings |
| `Utils.tryParseLS(key, fallback)` | utils.js | Any plugin reading localStorage JSON |
| `Utils.debounce(fn, ms)` | utils.js | Any plugin debouncing saves or input events |

### 4.5 Encryption Flow

`CryptoHelper` ([js/crypto-helper.js](js/crypto-helper.js)) provides AES-256-GCM encryption via Web Crypto API. Two key-derivation paths run in parallel during the Path B migration:

**v1 — legacy device-bound (default for users not yet migrated)**
- KDF: PBKDF2-SHA256 of a per-device fingerprint, 100k iterations, salt at `STORAGE_KEYS.ENCRYPTION_SALT`
- No user secret required; key is derivable from the device alone
- Used to encrypt `altech_v6` (form data), `altech_v6_quotes`, `altech_acct_vault_v2`, `altech_email_drafts`, `altech_commercial_v1`, `altech_commercial_quotes`

**v2 — passphrase-derived MK + wrapping (`STORAGE_KEYS.E2E_CRYPTO_V2='1'`)**
- Random 32-byte MK generated per user (the actual data key, never stored in plaintext)
- MK wrapped twice on the server side: once under a **passphrase-derived KEK**, once under a **recovery-key-derived KEK**. Server holds only the wrapped blobs.
- Server never sees MK, passphrase, or recovery key — true zero-knowledge.

**v2 hardened layers (Phase A–D, May 2026)**

| Layer | What changed | Backward compat |
|---|---|---|
| **Argon2id KDF** | New vaults use Argon2id (m=64MiB, t=3, p=1, lazy-loaded `hash-wasm` from CDN). Legacy vaults stay on PBKDF2-600k. Dispatched via `_deriveKEKAuto` reading `passphraseKdf`/`recoveryKdf` from vault meta. | Legacy vaults unlock unchanged; rewrap on passphrase change auto-upgrades to Argon2id (MK stays the same → no data re-encryption). |
| **HKDF subkey tree** | `kdfTree: 'hkdf-v1'` flag → MK becomes a master *seed*, AES data key is `HKDF-SHA256(MK, info='altech.data.v1')`. Future subkeys (`altech.blind.v1`, `altech.agency.v1`) use distinct info strings — leak of one role can't be replayed against another. | Vaults without `kdfTree` use MK directly. Promoting "no tree" → `hkdf-v1` would require re-encrypting all data, so it never auto-upgrades. |
| **AAD on Supabase rows** | `encryptForRow(data, identity)` → JSON envelope `{v:2, iv, ct}` with AAD bound to `(table, rowId, userId)`. `pushBlob`/`pushQuote` transparently re-wrap the localStorage value before push. Server can't move ciphertexts between rows or relabel them. | `decryptForRow(envelopeOrLegacy, identity)` handles both shapes. When v2 is locked, push falls back to legacy ciphertext (fail-open). Local-only `encrypt()`/`decrypt()` unchanged. |

**AAD construction is centralized** in [js/crypto-aad.js](js/crypto-aad.js) (`CryptoAAD.buildAAD`). [scripts/lint-aad.mjs](scripts/lint-aad.mjs) runs as `pretest` and fails the build if any file outside `crypto-aad.js`/`crypto-helper.js` passes `additionalData:` directly. Drift in AAD construction would silently break decryption — single source of truth + CI guard.

**Encrypted payload formats:**
- v1 + legacy v2: `base64( iv(12 bytes) || AES-256-GCM(payload) )` — opaque base64 string
- v2 row-bound (Supabase only): JSON `{ "v": 2, "iv": "<b64>", "ct": "<b64>" }`

**Vault metadata**: stored locally at `STORAGE_KEYS.VAULT_LOCAL_META` and (when `SYNC_BACKEND='supabase'`) on Supabase `public.user_crypto_meta`. Routed through [js/vault-meta.js](js/vault-meta.js) — single API surface, automatic local-cache fallback for offline unlock. Field mapping (camelCase JS ↔ snake_case DB) is centralized in `JS_TO_DB`/`DB_TO_JS`.

**⚠️ JSDOM lacks `crypto.subtle`** — `tests/setup.js` suppresses the noise, and crypto-touching tests use Node's `webcrypto` + a deterministic Argon2id mock at `globalThis.hashwasm`. See [tests/crypto-helper-v2.test.js](tests/crypto-helper-v2.test.js) for the pattern.

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

`App._escapeAttr()` compat bridge has been **fully removed** (March 2026). All call sites in `app-vehicles.js` now use `Utils.escapeAttr()` directly, and the bridge definition in `app-export.js` has been deleted.

- `hawksoft-export.js`: migrated to `Utils.escapeAttr()` (March 2026) ✅
- `app-quotes.js`: no longer references `App._escapeAttr` ✅
- `app-vehicles.js`: all 14 `this._escapeAttr()` calls replaced with `Utils.escapeAttr()` (March 2026) ✅
- `app-export.js`: bridge definition removed (March 2026) ✅

**All new code must use `Utils.escapeAttr()` directly.** `App._escapeAttr` no longer exists.

Note: `app-core.js` line 1507 contains a `typeof this._escapeAttr === 'function' ? ... : fallback` guard that now always takes the fallback path (an inline escaper). This is harmless and is left in place per convention (do not touch unrelated files).

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

### 5.13 `[data-tooltip]` Rule Bleeds into Nav Items (CRITICAL)

`css/components.css` contains a global `[data-tooltip]` rule intended for small circular help-icon badges. That rule sets:

```css
[data-tooltip] {
    background: var(--bg-input);
    border: 1px solid var(--border);
    height: 18px;
    font-size: 11px;
    /* ... and more */
}
```

**Any element that carries a `data-tooltip` attribute inherits these styles unless it explicitly resets them.** Sidebar nav items use `data-tooltip` for collapsed-mode tooltip text. Without resets in `.sidebar-nav-item`, every inactive item gets a filled `--bg-input` background and border, making them look like "bubble buttons."

**Fix applied (March 2026, commit `0926855`):** The `.sidebar-nav-item` base rule in `css/sidebar.css` now explicitly resets these properties:

```css
.sidebar-nav-item {
    /* ... existing properties ... */
    background: transparent;
    border: none;
    height: auto;
    font-size: 14px;
}
```

**Additional bleed sources from `[data-tooltip]` in `components.css`** (all affect `::before` pseudo-elements):

```css
[data-tooltip]::before {
    opacity: 0;                    /* ← hides ::before at rest */
    border: 6px solid transparent; /* ← tooltip arrow shape */
}
[data-tooltip]:hover::before {
    opacity: 1;                    /* ← makes ::before visible on hover */
}
```

The active indicator bar on `.sidebar-nav-item.active` is drawn via `::before`. Without explicit overrides, it **inherits `opacity: 0` at rest** (invisible bar) and **`opacity: 1` on hover** (bar pops in suddenly as a "blue box on the left"). It also inherits `border: 6px solid transparent` which distorts the bar shape.

**Fix applied (March 2026, commit `21098a8`):** `.sidebar-nav-item.active::before` now explicitly sets `opacity: 1` and `border: none`. A compound rule `.sidebar-nav-item.active[data-tooltip]:hover::before { opacity: 1 }` locks the opacity so no hover rule can reset it.

**Rule for new elements:** Whenever you add a `data-tooltip` attribute to any non-icon element (buttons, nav items, list rows, etc.), confirm the element's CSS rule resets ALL of the following — otherwise the global `[data-tooltip]` badge styles will bleed through:

| Property | `[data-tooltip]` value | Override needed |
|----------|------------------------|-----------------|
| `background` | `var(--bg-input)` | `background: transparent` |
| `border` | `1px solid var(--border)` | `border: none` |
| `height` | `18px` | `height: auto` |
| `font-size` | `11px` | `font-size: <correct value>` |
| `::before opacity` | `0` (hidden) / `1` on hover | `opacity: 1` if the `::before` should be visible |
| `::before border` | `6px solid transparent` | `border: none` if `::before` is not a tooltip arrow |

### 5.10 Vercel Hobby Plan — 12 Serverless Function Limit (CRITICAL)

**Vercel's Hobby plan allows a maximum of 12 Serverless Functions per deployment.** Exceeding this causes the entire deployment to fail with "No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan" — which means ALL API endpoints return 404 in production, not just the new one.

**Current count: 12 functions (at the limit).** Any new API endpoint MUST either:
1. **Consolidate into an existing function** using query-parameter routing (e.g., `?mode=newFeature` or `?type=newFeature`)
2. **Convert an existing function to a helper** by prefixing with `_` (e.g., `_helper.js`) and importing it from another function

**Files prefixed with `_` in `api/` are Vercel helpers** — they are NOT counted as serverless functions and NOT deployed as endpoints. Currently: `_ai-router.js` (shared AI router), `_apify-client.js` (Redfin/Zillow scraper client), and `_rag-interpreter.js` (routed via `property-intelligence.js?mode=rag-interpret`).

**Before adding any new file to `api/`:** Count non-`_` files: `ls api/ | grep -v '^_' | wc -l` — must be ≤ 12.

### 5.12 css/main.css Is Never Loaded by the Browser (CRITICAL)

`css/main.css` is an `@import` aggregator — it is **not linked in `index.html`** and is never
served to the browser. Editing it has **zero effect in production**. It exists only as a dev
convenience for editors that follow `@import` chains.

| ✅ Edit this file | For what |
|------------------|----------|
| `css/variables.css` | CSS custom properties / `:root` |
| `css/base.css` | Scrollbars, body, typography |
| `css/layout.css` | Sidebar, header, shell layout |
| `css/components.css` | Buttons, cards, inputs |
| `css/dashboard.css` | Dashboard & bento widgets |
| `css/[plugin].css` | Per-plugin styles |

**How to find the right file:** `grep_search` the class/property across `css/` — the match
that also appears in `index.html`'s `<link>` tags is the one to edit.

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

### 5.14 Listing Search Pipeline (`?mode=listing-search`)

Accepts a Redfin/Zillow URL → Gemini Search Grounding extracts property data → maps to Altech form fields.

| Step | Where | What |
|------|-------|------|
| 1 | `js/app-property.js` → `lookupListingUrl()` | Client sends URL via `Auth.apiFetch('/api/property-intelligence?mode=listing-search')` |
| 2 | `api/property-intelligence.js` → `handleListingSearch()` | Calls `askWithSearch()` (Gemini + `google_search` tool) with a structured JSON prompt |
| 3 | `api/_ai-router.js` → `extractJSON()` | Extracts JSON from Gemini's markdown-wrapped response (3-stage: regex → relaxed → AI) |
| 4 | `api/property-intelligence.js` → `mapZillowToAltech()` | Maps Gemini field names → Altech form field IDs (see LISTING_FIELD_MAP) |
| 5 | `js/app-property.js` → `applyZillowSelects()` | Fills `<select>` dropdowns and text inputs with mapped values |

**Key behaviors in `mapZillowToAltech()`:**
- **Bath splitting:** `bathrooms: 3.5` → `fullBaths: 3`, `halfBaths: 1` (floor + modulo check)
- **Lot size:** `lotSizeAcres` field; values > 100 assumed sqft, auto-converted to acres (÷ 43560)
- **Dwelling type:** DWELLING_MAP normalizes AI text → form select values (`"single family"` → `"One Family"`)
- **County:** Strips trailing " County" suffix (e.g., `"Clark County"` → `"Clark"`)

**`applyZillowSelects()` handles three field types:**
1. **selectFields** — string-matched dropdowns (`heatingType`, `coolingType`, `dwellingType`, etc.)
2. **numericSelects** — numeric dropdowns with fallback matching (`numStories`, `fullBaths`, `halfBaths`) — tries exact string, then `Math.floor`, then `Math.round`
3. **textFields** — plain text inputs (`yrBuilt`, `bedrooms`, `sqFt`, `lotSize`, `county`, `yearRenovated`, etc.)

### 5.15 AI Coverage Gap Analysis (`js/app-export.js`)

Step 6 (Review & Export) includes a "Coverage Gap Analysis" card that sends current form data to Gemini for personalized insurance recommendations.

| Function | What |
|----------|------|
| `runCoverageGapAnalysis()` | Builds prompt from `App.data` + `App.drivers` + `App.vehicles`, calls `/api/property-intelligence?mode=coverage-gap` |
| `_renderCoverageGapResults()` | Renders AI markdown response into styled HTML cards in `#coverageGapResults` |

The analysis uses the existing `property-intelligence.js` endpoint with `?mode=coverage-gap` routing.

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

Client-side AES-256-GCM encryption for sensitive localStorage data. **See §4.5** for the full key-derivation model — this section covers what's encrypted where.

| Surface | Cipher | Key source | Notes |
|---|---|---|---|
| localStorage (v1, default) | AES-256-GCM | PBKDF2(deviceFingerprint, salt) | Device-bound; user can't lose access by forgetting a passphrase. |
| localStorage (v2 active) | AES-256-GCM | Argon2id(passphrase) → KEK → unwraps MK; HKDF derives data key when `kdfTree='hkdf-v1'` | Per-user E2E. Server never sees MK. |
| Firestore (Firebase backend) | TLS in transit + Google-managed at rest | n/a | Plaintext to Google; the migration moves users off this. |
| Supabase `user_blobs` / `user_quotes` (legacy) | TLS + opaque ciphertext | App-side AES-GCM under v1 or v2 | Server holds opaque base64. |
| Supabase `user_blobs` / `user_quotes` (Phase B+) | AAD-bound v=2 envelope | `encryptForRow(data, {table, rowId, userId})` | Auth tag binds row identity — server can't move ciphertexts between rows or users. |

**Vault metadata** (passphrase salt, wrapped MK, KDF params) lives at `STORAGE_KEYS.VAULT_LOCAL_META` and on Supabase `public.user_crypto_meta` — see [js/vault-meta.js](js/vault-meta.js) router. All Phase A KDF additions land in [db/migrations/0004_kdf_metadata.sql](db/migrations/0004_kdf_metadata.sql).

### 6.5 Supabase RLS Model

All public tables holding user data have RLS enabled, with policies gating every operation on `auth.uid() = user_id`:

| Table | Policy summary |
|---|---|
| `user_blobs` | Owner-only SELECT/INSERT/UPDATE/DELETE; `with check (auth.uid() = user_id)` on every write. |
| `user_quotes` | Same — `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`. |
| `user_crypto_meta` | Same. |
| `audit_log` | Owner-only SELECT + INSERT (own user_id); **no UPDATE/DELETE policy** → append-only. |
| `agencies`, `agency_members`, `agency_key_wraps`, `agency_blobs` (Phase 2.5 schema, app code TBD) | Membership-gated via two `SECURITY DEFINER` helpers (`is_agency_member`, `is_agency_admin`) — both granted only to `authenticated`, never to `PUBLIC`. |

**RLS audit ([db/migrations/0005_rls_audit.sql](db/migrations/0005_rls_audit.sql))**: self-checking SQL — refuses to apply if any public table is missing from the inventory, lacks RLS, or has zero policies. Also enforces the `SECURITY DEFINER` allowlist. **When adding a new public table, add it to `expected_tables[]` in `0005`** or the audit will fail on next apply.

**Live verification ([scripts/verify-rls.mjs](scripts/verify-rls.mjs))**: operator script that anon-connects to a live Supabase project and asserts cross-user reads return 0 rows / writes are rejected. Run manually with `SUPABASE_URL` + `SUPABASE_ANON_KEY` env vars; not in CI.

### 6.6 Migration Safety Net

Phase 4 of the Firebase→Supabase rollout (Session 2 of [js/migration-ui.js](js/migration-ui.js), still pending) will be wrapped by:

- **`MigrationBackup.snapshot()`** ([js/migration-backup.js](js/migration-backup.js)) — captures every `altech_*` localStorage key (excluding `MIGRATION_*`/`SYNC_BACKEND`/`DEVICE_ID`/`SYNC_META_SUPABASE`) before the pipeline begins. `restore()` puts the device back exactly as it was on hard failure. 30-day TTL with auto-clean on next `load()`.
- **`MIGRATION_DRY_RUN` flag** — when set, the pipeline copies + verifies but doesn't flip `SYNC_BACKEND`. Lets an admin verify Supabase decryption before committing the per-user switch. Read via `MigrationUI.isDryRun()`.

Neither is wired into production code yet — the Session 1 stub in `migration-ui.js` doesn't touch user data. Session 2 must call `snapshot()` at the top of the pipeline, honor `isDryRun()` before the backend flip, and call `restore()` on hard failure. See [js/migration-ui.js:90-103](js/migration-ui.js#L90-L103) for the contract.

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
| `altech_commercial_v1` | Commercial lines form draft | ✅ | ✅ | CommercialQuoter |
| `altech_commercial_quotes` | Commercial saved quotes | ✅ | ✅ | CommercialQuoter |
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
| `altech_encryption_salt` | PBKDF2 salt for legacy v1 device key | ❌ | ❌ | CryptoHelper |
| `altech_passphrase_salt` | Per-device cache of v2 passphrase salt | ❌ | ❌ | CryptoHelper |
| `altech_e2e_crypto_v2` | Feature flag: `'1'` = v2 vault active | ❌ | ❌ | CryptoHelper |
| `altech_vault_meta_local` | Vault meta (offline cache + local fallback for the Supabase router) | ❌ | ❌ | VaultMeta |
| `altech_sync_meta` | Sync metadata | ❌ | ❌ | CloudSync |
| `altech_sync_backend` | `'firebase'` (default) \| `'supabase'` | ❌ | ❌ | SyncFacade |
| `altech_migration_enabled` | `'1'` = show migration modal (admin/dev only) | ❌ | ❌ | MigrationUI |
| `altech_migration_state` | Resume-on-crash state for the Phase 4 pipeline | ❌ | ❌ | MigrationUI |
| `altech_migration_dry_run` | `'1'` = Session 2 copies but doesn't flip backend | ❌ | ❌ | MigrationUI |
| `altech_pre_migration_backup` | Snapshot before Session 2 runs; 30-day TTL | partial¹ | ❌ | MigrationBackup |
| `gemini_api_key` | User's Gemini key | ❌ | ❌ | Multiple plugins |

¹ The backup record is JSON metadata wrapping verbatim copies of other localStorage values. Captured values that were already encrypted (e.g., `altech_v6`) stay encrypted; plaintext-stored values stay plaintext. The wrapper itself isn't re-encrypted.

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

### How to add a new synced data type

Add one string to the `SYNC_DOCS` array near the top of `js/cloud-sync.js`:

```javascript
// js/cloud-sync.js ~line 27
const SYNC_DOCS = [
    'settings', 'currentForm', 'cglState', 'clientHistory',
    'quickRefCards', 'quickRefNumbers', 'reminders', 'glossary',
    'vaultData', 'vaultMeta',
    'yourNewType',   // ← add here
];
```

That's it. Push and delete operations pick it up automatically — no other changes required. After writing to the synced localStorage key, call `CloudSync.schedulePush()` (debounced 3 s).

---

## 8. Search Tools

`grep_search` and `file_search` are unreliable on this project — `js/`, `plugins/`, `api/`, and `css/` are excluded from VS Code's search index via `settings.json`.

Always use `run_in_terminal` with PowerShell `Select-String` for string searches:

```powershell
Select-String -Path "js/fields.js" -Pattern "firstName"
Select-String -Path "plugins/*.html" -Pattern "bedroom"
Select-String -Path "js/*.js" -Pattern "ezlynxRequired"
```

Never fall back to `grep_search` for source files. Start with terminal.

---

## 9. Editing HTML Files

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

## 10. Standard Agent Prompt

When starting work on this codebase, include this context in your system prompt:

```
You are working on Altech Field Lead, a vanilla JS SPA for insurance agents.

KEY RULES:
1. CSS variables: Use --bg-card (not --card/--surface), --text (not --text-primary),
   --apple-blue (not --accent), --text-secondary (not --muted), --bg-input (not --input-bg),
   --border (not --border-color/--border-light). Check css/variables.css :root for truth.
   ⚠️ NEVER edit css/main.css — it is a dead @import aggregator not loaded by index.html (see §5.12).
2. Dark mode: Use `body.dark-mode .class` selector (not [data-theme="dark"])
3. Field IDs are storage keys — NEVER rename an input id without a migration
4. All form writes go through App.save() — never write to altech_v6 directly
5. After localStorage writes on synced data, call CloudSync.schedulePush()
6. JS modules use IIFE pattern: window.Module = (() => { return { init, ... }; })()
7. App is built via Object.assign(App, {...}) across 11 files (incl. app-ui-utils.js, app-navigation.js) — app-boot.js loads LAST
8. Test with: npm test (1797 tests, 31 suites, all must pass)
9. No build step — edit files, reload browser
10. For dark mode backgrounds, prefer solid colors (#1C1C1E) over low-opacity rgba
11. AFTER completing all work, add an entry to CHANGELOG.md with what changed (files, test counts, date). Run: npm run audit-docs
12. ALWAYS keep changes — never leave edits pending user confirmation
13. ALWAYS commit & push when finishing a task — stage all files, commit, git push
14. Vercel Hobby plan: MAX 12 serverless functions. Never add a new api/ file without
    checking the count. Use ?mode= routing or _ prefix helpers to consolidate. See §5.10
15. FILE READING — grep/search for exact line numbers before opening any file.
    Never read a full file. Read only the specific line ranges needed.
    Max 50 lines per read unless you explicitly justify more.
    After the first grep returns results, read only those line ranges.
    Do not search again unless the first results were empty.
    Do not trace callers, dependencies, or related functions unless
    the fix explicitly requires it. Fix the thing, commit, stop.
16. SESSION SCOPE — fix one bug per session. Do not read files unrelated to
    the current task. Do not re-read files already in context this session.
17. BLOCKER RULE — if a fix requires reading more than 3 files to locate the
    problem, stop and report what's blocking you instead of continuing to read.
18. BEFORE ANY BUG FIX — run `git log --oneline -10` first. If the fix
    was already committed in a recent session, report that and stop.
    Do not re-investigate or re-fix already committed work.
19. Use STORAGE_KEYS.* for all altech_* localStorage key strings — never hardcode 'altech_...' strings in modules. window.STORAGE_KEYS is the single source of truth.
20. Use Utils.escapeHTML(), Utils.escapeAttr(), Utils.tryParseLS(), Utils.debounce() — never define these inline in plugins. window.Utils is loaded before App.
21. Read docs/RENTCAST_API.md before making ANY changes to api/property-intelligence.js Rentcast or FEMA integration — it is the authoritative endpoint spec, field schema, and known-missing-field list.
```

---

## 11. Pre-Deploy Checklist

### Before Every Deploy

- [ ] **All tests pass:** `npm test` → 31 suites, 1797 tests, 0 failures
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
- [ ] **XSS check:** Any user/AI-generated content displayed in HTML uses `Utils.escapeHTML()` — never define inline in plugins
- [ ] **Memory check:** Open DevTools Memory tab, run scan/analyze flow, verify no canvas/ImageBitmap leaks
- [ ] **Serverless function count ≤ 12:** Count non-`_` files in `api/` — Vercel Hobby plan max is 12. If over, consolidate via `?mode=` routing or `_` prefix helper pattern (see §5.10)
- [ ] **Docs updated:** Add an entry to `CHANGELOG.md` with what changed. Run `npm run audit-docs` to check for drift.

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
| `APIFY_API_KEY` | ⚠️ | Apify web scraping (Redfin/Zillow fallback for property data) |

---
