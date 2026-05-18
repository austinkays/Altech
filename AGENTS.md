# AGENTS.md — Altech Field Lead: AI Agent Onboarding Guide

> **Last updated:** May 15, 2026
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
| **CSS** | 51 files in `css/` (~26,392 lines total) |
| **JS** | 108 modules in `js/` (~64,092 lines total) |
| **Plugins** | 19 HTML templates in `plugins/` (~6,785 lines total, + `tools/broadform.html`) |
| **APIs** | 13 routable serverless functions + ~22 `_`-prefixed helpers in `api/` (~8,600 lines total) |
| **Auth** | **Supabase Auth** (email/password + MFA, Supabase JS v2) — Firebase fully removed in the Phase D cleanup, May 2026 |
| **Database** | **Supabase Postgres** — `public.user_blobs` (KV), `public.user_quotes` (one row/draft), `public.user_crypto_meta` (vault meta); row-level security on every table |
| **Encryption** | AES-256-GCM via Web Crypto API (`CryptoHelper`) + AAD row-binding envelopes (see §6.4/§6.5) |
| **Local server** | `server.js` (Node.js ESM, ~680 lines) |
| **Deploy** | Vercel Pro (serverless functions + static) |
| **Desktop** | Tauri v2 (optional, `src-tauri/`) |
| **Tests** | Jest + JSDOM, 66 suites, ~2,480 tests |
| **Package** | ESM (`"type": "module"` in package.json) |
| **Author** | Austin Kays |
| **License** | MIT |
| **Repo** | `github.com/austinkays/Altech` |

### Quick Commands

```bash
npm run dev           # Local dev server (server.js on port 8000)
npm test              # All 66 suites, ~2,480 tests
npx jest --no-coverage  # Faster (skip coverage)
npm run audit-docs      # Check this doc for drift (run after every session)
```

### Key URLs

| Environment | URL |
|-------------|-----|
| Production | `https://altech.agency` |
| Vercel dashboard | Vercel project `altech-field-lead` |
| Supabase dashboard | Supabase project (auth + Postgres + RLS) |

---

## 2. File Structure

```
/
├── index.html                  # SPA shell (~742 lines) — CSS links, DOM skeleton, script tags (authoritative load order)
├── server.js                   # Local dev server (~680 lines) — static + API proxy + local endpoints
├── vercel.json                 # Vercel config — function timeouts, rewrites, security headers, CSP
├── package.json                # ESM, scripts, deps (ioredis, pdf-lib, stripe), devDeps
├── jest.config.cjs             # Test config — node env, tests/ dir, coverage from index.html + api/ + lib/
├── db/migrations/              # Supabase SQL migrations (0003 agency sharing, 0004 KDF meta, 0005 RLS audit)
├── sw.js                       # Service worker — CACHE_VERSION auto-bumped by .githooks/pre-commit
│
│  ⚠️ This tree is a high-level map only. The authoritative, module-by-module
│  breakdown lives in CLAUDE.md (kept current); run `npm run audit-docs` for
│  exact file/line counts. Firebase was fully removed in the Phase D cleanup
│  (May 2026) — Supabase is the sole auth + sync backend.
│
├── css/                        # 51 stylesheets (~26,392 lines) — see CLAUDE.md "CSS Architecture"
│   ├── variables.css           # :root tokens + body.dark-mode overrides ONLY (the only place theme vars live)
│   ├── base.css / layout.css   # Reset/typography; app shell, sidebar, plugin container
│   ├── components-*.css        # Split component families: cards, inputs, buttons, forms, modals,
│   │                           #   toasts, loading, misc, acord ([data-tooltip] popovers live here),
│   │                           #   pwa, quote-library. (css/components.css was deleted — never recreate it.)
│   ├── animations.css          # All @keyframes — never define @keyframes in a plugin CSS file
│   ├── compliance-*.css        # main / print-dark / responsive (split from compliance.css, 2026-04)
│   ├── intake-assist-*.css     # chat / sidebar / features / polish
│   ├── dashboard.css           # Bento grid + Today widget (~1,373 lines)
│   ├── reminders.css           # Task reminders (~1,422 lines)
│   ├── auth.css                # Auth modal + tabbed settings + Agency Glossary textarea (~1,153 lines)
│   ├── intake-v2.css           # Intake v2 wizard (~1,913 lines)
│   ├── vault.css / broadform.css  # Vault UI; Carrier Match (in-dev)
│   └── (plugin-scoped CSS)     # call-logger, task-sheet, returned-mail, accounting, ezlynx,
│                               #   vin-decoder, quickref, commercial-quoter, etc. — standalone
│
├── js/                         # 106 modules (~63,800 lines) — see CLAUDE.md "JS Module Architecture"
│   │  ★ Core App — assembled via Object.assign into global `App` (app-init → … → app-boot LAST)
│   │     app-init, app-ui-utils, app-navigation, app-validation, app-core, app-places,
│   │     app-carriers, app-applicant, app-ai-settings, app-scan(+doc-intel),
│   │     app-property(+maps/parcel/unified/rentcast), app-vehicles, app-popups(+history),
│   │     app-export(+pdf/csv/cmsmtf/coverage-gap/carrier-fit/acord-xml/picker), app-quotes, app-boot
│   │  ★ Globals (load before App): crypto-helper, crypto-aad, storage-keys, utils, fields,
│   │     pdf-lib-loader
│   │  ★ Shared services: ai-provider, activity-log, command-palette, dashboard-widgets,
│   │     phonetic-speller
│   │  ★ Backend / auth / sync (Supabase-only): supabase-config → supabase-sync →
│   │     supabase-auth → auth-mfa-ui → auth.js (legacy Auth.* facade) → sync-facade
│   │     (window.Sync / window.AuthFacade); vault-meta, vault-ui, secure-storage,
│   │     biometric-unlock, idle-lock, data-backup
│   │  ★ Intake v2 family (~30 modules): intake-v2-core/init/fields/layout/coverage/
│   │     operators/autos/rvs/boats/history/review/defer/keyboard/places/property(+maps)/
│   │     rentcast/smart-fill/talktrack/bindability/formatters/export(+pdf/ezlynx/cmsmtf/map)
│   │  ★ Plugin modules (one window.ModuleName each): compliance-dashboard (~3,436),
│   │     intake-assist (~3,000), prospect, hawksoft-export(+renderers), reminders(+popover),
│   │     commercial-quoter, accounting-export, call-logger, ezlynx-tool(+desktop),
│   │     quote-compare, dec-import, endorsement-parser, vin-decoder, task-sheet,
│   │     returned-mail, email-composer, quick-ref, onboarding, paywall, quoting-info-panels,
│   │     compliance-idb, intake-assist-prompts, prospect-formatters
│   │  (Deleted in Phase D: firebase-config, cloud-sync, migration-ui, migration-backup,
│   │   coi, policy-qa, admin-panel, hawksoft-integration, blind-spot-brief, deposit-sheet.)
│
├── plugins/                    # 19 HTML fragments (~6,785 lines) + tools/broadform.html
│   │  quoting (★ wizard ~2,546), ezlynx (~1,069), commercial-quoter (~695),
│   │  compliance, prospect, accounting, intake-assist, intake-v2, call-logger,
│   │  vin-decoder, reminders, quotecompare, email, endorsement, quickref,
│   │  task-sheet, returned-mail, hawksoft (JS renders body), dec-import,
│   │  tools/broadform (in-dev "Carrier Match")
│   │  (coi.html, qna.html, blind-spot-brief.html, deposit-sheet.html deleted in Phase D.)
│
├── api/                        # ~14 serverless endpoints + many `_`-prefixed helpers (~8,500 lines). Project is on Vercel Pro (April 2026) — ceiling is ~1000 functions, no longer a constraint.
│   ├── _ai-router.js           # ★ Shared: multi-provider AI router (NOT an endpoint)
│   ├── _apify-client.js        # ★ Shared: Apify web scraper client — Redfin Detail + Zillow Search actors (NOT an endpoint)
│   ├── config.js               # Public config (Supabase URL + anon key), API keys, phonetics, bug reports
│   ├── admin-supabase.js       # Supabase admin (user management) — replaced the deleted Firebase admin.js
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
│   └── *.test.js               # 66 suites, ~2,480 tests (Jest + JSDOM)
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

Defined in `css/theme-professional.css` — a permanently dark OLED-black theme. Overrides the same variables as `body.dark-mode` but with slightly different values (e.g., `--text: #F5F5F7`, `--success: #30D158`). NOTE: not in `_VALID_THEMES` and not wired to the Theme dropdown (dead/unreachable CSS — left in place, not currently selectable).

#### Light Theme (`body.theme-light`)

Defined in `css/theme-light.css` — a clean cool white/blue theme (Apple-blue accent, soft off-white bg, white cards). The **inverse of Aurora**: selecting it forces dark mode OFF (`App.setTheme('light')` removes `body.dark-mode`, persists `DARK_MODE='false'`); toggling dark mode back on deactivates it (→ `default`). Exists because the base `:root` light palette is warm cream, not the cool white/blue agency-software look. In `_VALID_THEMES` (`'default'|'aurora'|'light'`) and selectable via the Settings → Preferences Theme dropdown.

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

**Authoritative source: `index.html` (grep `<script src=`).** CLAUDE.md "Script Load Order"
mirrors it in full. The invariants that matter:

```
CDN: supabase-js  (jszip / jspdf / pdf.js / pdf-lib are LAZY-loaded via
                    window.PDFLibs.ensure(...) — NOT eager <script> tags)

Globals first (must precede App):
  pdf-lib-loader, crypto-helper, storage-keys, utils, fields

App core (Object.assign order): app-init → app-ui-utils → app-navigation →
  app-validation → app-core → app-places → app-carriers → app-applicant →
  app-ai-settings → app-scan(+doc-intel) → app-property(+maps/parcel/
  unified/rentcast) → app-vehicles → app-popups(+history) →
  app-export(+pdf/csv/coverage-gap/carrier-fit/cmsmtf) → app-quotes

Shared services: ai-provider, activity-log, command-palette, dashboard-widgets

Plugin IIFEs (order-independent among themselves)

Backend / auth / sync (ORDER MATTERS):
  data-backup,
  supabase-config → supabase-sync → supabase-auth → auth-mfa-ui →
  auth.js (Supabase-only Auth.* facade) → sync-facade (window.Sync /
  window.AuthFacade), vault-meta, vault-ui, paywall, onboarding

Last:
  app-boot.js   ← ★ MUST BE LAST — runs App.boot()
```

⚠️ Firebase compat SDKs and `firebase-config.js` / `cloud-sync.js` were
**removed** (Phase D, May 2026). There is no Firebase `<script>` tag.

### 4.4 Cross-File Dependencies

| Method | Defined In | Called From |
|--------|-----------|------------|
| `App.toast()` | app-ui-utils.js | Almost every module |
| `App.save()` | app-core.js | app-scan, app-property, app-vehicles, app-popups, intake-assist |
| `App.data` | app-init.js | Every module that reads form data |
| `App.drivers` / `App.vehicles` | app-init.js | vehicles, ezlynx, hawksoft, intake-assist, export |
| `App._escapeAttr()` | app-export.js | app-quotes.js (guarded with fallback) |
| `window.Sync.schedulePush()` | sync-facade.js → supabase-sync.js | quick-ref, reminders, compliance, prospect, onboarding (call after any write to a synced key) |
| `Auth.apiFetch()` | auth.js (Supabase-only facade) | Most plugins that call APIs |
| `Auth.user` / `Auth.uid` / `Auth.whenSignedIn()` | auth.js | ~40 plugins; use `whenSignedIn(ms)` (not `ready()`) when you need a real signed-in user |
| `CryptoHelper.encrypt/decrypt` | crypto-helper.js | app-core, app-quotes, app-vehicles, app-scan, supabase-sync, email-composer |
| `AIProvider.ask/chat` | ai-provider.js | intake-assist, email-composer, quote-compare, coverage-gap |
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

### 5.6 Supabase JS v2 (Firebase fully removed)

Firebase was deleted in the Phase D cleanup (May 2026). Supabase is the **sole**
auth + sync backend. All backend calls go through `window.Supabase.client.auth.*`
/ `.from(...)` (Supabase JS v2). Plugins must NOT call `SupabaseSync.*` /
`SupabaseAuth.*` directly — route through the facades: `window.Sync.*`,
`window.AuthFacade.*`, and the legacy `Auth.*` surface (`js/auth.js`). Any doc
or code still referencing `firebase.*`, `CloudSync`, `firebase-config.js`, or
`cloud-sync.js` is stale — those files are gone.

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

### 6.1 Database Authorization — Supabase RLS

Firestore is gone. Authorization is enforced by **Postgres row-level security**
on every public table, gated on `auth.uid() = user_id`. See **§6.5 Supabase RLS
Model** for the per-table policy matrix, the self-checking audit migration
(`db/migrations/0005_rls_audit.sql`), and the live `scripts/verify-rls.mjs`
cross-user probe. When you add a new public table you MUST add it to
`expected_tables[]` in `0005` or the audit refuses to apply.

### 6.2 API Security

All serverless functions use one of two middleware patterns:
- **`securityMiddleware`** — Basic security checks (CORS, method validation, origin check)
- **`requireAuth`** — Supabase JWT verification (validates the bearer access token, extracts the user id)

API functions that require authentication: `config?type=keys`, `kv-store`, `stripe`, `admin-supabase`, `anthropic-proxy`, `prospect-lookup?type=ai-analysis`

API functions with security middleware only (no auth): `policy-scan`, `vision-processor`, `property-intelligence`, `compliance`, `historical-analyzer`

### 6.3 Content Security Policy

Defined in `vercel.json` headers:
- `script-src: 'self' 'unsafe-inline'` + CDNjs, Google Maps, Supabase
- `connect-src: 'self'` + Google APIs, Supabase (`*.supabase.co`)
- `frame-ancestors: 'none'`
- `form-action: 'self'`

### 6.4 Encryption at Rest

Client-side AES-256-GCM encryption for sensitive localStorage data. **See §4.5** for the full key-derivation model — this section covers what's encrypted where.

| Surface | Cipher | Key source | Notes |
|---|---|---|---|
| localStorage (v1, default) | AES-256-GCM | PBKDF2(deviceFingerprint, salt) | Device-bound; user can't lose access by forgetting a passphrase. |
| localStorage (v2 active) | AES-256-GCM | Argon2id(passphrase) → KEK → unwraps MK; HKDF derives data key when `kdfTree='hkdf-v1'` | Per-user E2E. Server never sees MK. |
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

### 6.6 Migration Safety Net (historical — complete)

The Firebase→Supabase migration is **done**. Phase D (May 2026) removed Firebase
entirely: `js/cloud-sync.js`, `js/migration-ui.js`, `js/migration-backup.js`,
and the legacy `api/admin.js` were deleted. There is no migration pipeline,
`MigrationBackup`, `MigrationUI`, or dry-run flag in the codebase anymore.

`STORAGE_KEYS.SYNC_BACKEND` (`altech_sync_backend`) survives only as a **dead
flag** — kept so a cleanup path can detect a user who once flipped it to
`'firebase'` and clear it. Safe to ignore in new code; never write it.

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
| `altech_activity_log` | ActivityLog ring buffer (cap 100, coalesced) | ❌ | ❌ **local-only by design** | ActivityLog |
| `altech_sync_backend` | Dead flag (Firebase removed) — never write; cleanup-only | ❌ | ❌ | — |
| `gemini_api_key` | User's Gemini key | ❌ | ❌ | Multiple plugins |

> **`storage-keys.js` is the single source of truth** (~62 frozen keys). This
> table is a sample — never hardcode key strings; always use `STORAGE_KEYS.*`.
> Never sync `*_SALT` / `*_RECOVERY` / `ACTIVITY_LOG`. The `altech_migration_*`
> / `altech_pre_migration_backup` / `altech_sync_meta` keys were retired with
> the Firebase removal.

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

### 7.4 Cloud Sync Storage (Supabase)

Backed by Postgres tables (not Firestore):

- **`public.user_blobs`** — key-value, keyed by `(user_id, doc_key)`. One row per synced doc.
- **`public.user_quotes`** — one row per draft, keyed by `id`.
- **`public.user_crypto_meta`** — vault metadata (salt, wrapped MK, KDF params).

Ciphertext on the wire is an AAD-bound `{v:2, iv, ct}` envelope (`encryptForRow` / `decryptForRow`, see §6.4) — the server cannot move ciphertext between rows/users. RLS gates every row on `auth.uid() = user_id`.

### How to add a new synced data type

Add one entry to `DOC_LOCAL_KEYS` near the top of `js/supabase-sync.js`:

```javascript
// js/supabase-sync.js
const DOC_LOCAL_KEYS = Object.freeze({
    currentForm: STORAGE_KEYS.FORM,
    cglState:    STORAGE_KEYS.CGL_STATE,
    // …existing entries…
    yourNewType: STORAGE_KEYS.YOUR_NEW_KEY,   // add here
});
```

That's it. Push and delete operations pick it up automatically — no other changes required. After writing to the synced localStorage key, call `window.Sync.schedulePush()` (debounced 3 s).

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
5. After localStorage writes on synced data, call window.Sync.schedulePush()
6. JS modules use IIFE pattern: window.Module = (() => { return { init, ... }; })()
7. App is built via Object.assign(App, {...}) across 11 files (incl. app-ui-utils.js, app-navigation.js) — app-boot.js loads LAST
8. Test with: npm test (~2,480 tests, 66 suites, all must pass)
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

- [ ] **All tests pass:** `npm test` → 66 suites, ~2,480 tests, 0 failures
- [ ] **No lint/build errors:** `get_errors()` returns clean
- [ ] **CSS variables are valid:** No `--card`, `--surface`, `--accent`, `--muted`, `--text-primary`, `--input-bg`, `--border-color`
- [ ] **Dark mode tested:** Toggle dark mode, check new/modified UI elements
- [ ] **Three workflows tested:** Set `qType` to `home`, `auto`, `both` — step through each
- [ ] **Three exports tested:** Export as PDF, CMSMTF, and XML (if applicable) — check all fields populate
- [ ] **Mobile tested:** Resize to 375px width, check no horizontal overflow
- [ ] **Encryption intact:** `App.save()` → check `altech_v6` in localStorage is encrypted JSON, not plaintext
- [ ] **Cloud sync:** Sign in, make a change, verify `window.Sync.schedulePush()` fires (3s debounce)
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
| `SUPABASE_URL` | ✅ | Supabase project URL (served to client via `/api/config`) |
| `SUPABASE_ANON_KEY` | ✅ | Supabase publishable/anon key (client auth + RLS-gated reads) |
| `REDIS_URL` | ✅ | KV store + compliance cache |
| `HAWKSOFT_CLIENT_ID` | ✅ | HawkSoft API |
| `HAWKSOFT_CLIENT_SECRET` | ✅ | HawkSoft API |
| `HAWKSOFT_AGENCY_ID` | ✅ | HawkSoft API |
| `STRIPE_SECRET_KEY` | ⚠️ | Stripe billing (beta) |
| `STRIPE_PRICE_ID` | ⚠️ | Stripe billing (beta) |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ | Stripe webhooks (beta) |
| `APP_URL` | ⚠️ | Stripe redirect URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ | Server-side admin + Stripe webhook → Postgres (bypasses RLS — server only) |
| `GITHUB_ISSUES_TOKEN` | ⚠️ | Bug report → GitHub Issues |
| `GITHUB_REPO_OWNER` | ⚠️ | Bug report target repo |
| `GITHUB_REPO_NAME` | ⚠️ | Bug report target repo |
| `SOCRATA_APP_TOKEN` | ⚠️ | WA L&I / OR CCB lookups |
| `SAM_GOV_API_KEY` | ⚠️ | SAM.gov federal lookups |
| `APIFY_API_KEY` | ⚠️ | Apify web scraping (Redfin/Zillow fallback for property data) |

---
