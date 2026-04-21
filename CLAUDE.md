# Altech Toolkit — Agent Reference

> **Cold-start guide.** For deep dives see `AGENTS.md` — read only the sections relevant to your task.

## Project

Vanilla HTML/CSS/JS SPA. No build step, no framework. Vercel deploy (push `main`). Firebase compat for auth + Firestore.

```bash
npm run dev               # port 3000
npm test                  # 28 suites, 1772 tests
npx jest --no-coverage    # faster
```

---

## JS Module Architecture

### Global Singletons (loaded before `App`)

| Global | File | Exposes |
|--------|------|---------|
| `CryptoHelper` | `js/crypto-helper.js` | AES-256-GCM encrypt/decrypt |
| `window.STORAGE_KEYS` | `js/storage-keys.js` | Frozen map of all 53 localStorage keys |
| `window.Utils` | `js/utils.js` | `escapeHTML`, `escapeAttr`, `tryParseLS`, `debounce` |
| `window.FIELDS` / `window.FIELD_BY_ID` | `js/fields.js` | ~175 intake form field definitions with id/label/type/section |

### App Assembly — `Object.assign` Pattern

`window.App` is created in `app-init.js` then extended across 8 files via `Object.assign(App, { ... })`. Each file adds its own slice; all share the same object.

| File | Owns |
|------|------|
| `app-init.js` | `App` creation, `App.data`, `App.workflows`, `App.toolConfig[]`, `App.stepTitles` |
| `app-ui-utils.js` | `App.toast()`, `App.toggleDarkMode()`, `App.loadDarkMode()`, `App.formatDateDisplay()`, `App.copyToClipboard()` |
| `app-navigation.js` | `App.updateUI()`, `App.navigateTo()`, step progression, hash routing |
| `app-core.js` | `App.save()`, `App.load()`, form field persistence, schema migration, encryption |
| `app-scan.js` | `App.processScan()`, OCR, Gemini AI (image-scan pipeline only) |
| `app-scan-doc-intel.js` | Document intelligence: `analyzeDocuments`, `renderDocIntelResults`, `applyDocIntelToForm`, `saveDocIntelResults`, `loadDocIntelResults` |
| `app-property.js` | `App.smartAutoFill()`, Maps, assessor data |
| `app-vehicles.js` | `App.renderDrivers()`, `App.renderVehicles()`, DL scan |
| `app-popups.js` | `App.processImage()`, hazard detection, vision results, data preview modal |
| `app-popups-history.js` | Property history / insurance trends / market comparison / timeline popups |
| `app-export.js` | `App.exportPDF()`, text/CSV export, coverage-gap analysis |
| `app-export-cmsmtf.js` | `App.exportCMSMTF()`, `buildCMSMTF()` — HawkSoft tagged-file export |
| `app-quotes.js` | `App.saveAsQuote()`, `App.loadQuote()` |
| `app-boot.js` | `App.boot()` — SW, hash router, keyboard shortcuts — **must load last** |

### Plugin IIFE Pattern

Every plugin (not part of App core) uses:

```javascript
window.ModuleName = (() => {
    'use strict';
    const STORAGE_KEY = STORAGE_KEYS.YOUR_KEY;
    // private state
    return { init, render /*, public API */ };
})();
```

Plugins are lazy-loaded: `App.navigateTo(key)` fetches `htmlFile`, injects into the container div, calls `window[initModule].init()`. HTML is fetched once and cached via `container.dataset.loaded`.

---

## Script Load Order

```
CDN libraries (firebase-compat only — jszip/jspdf/pdf.js/pdf-lib are lazy-loaded on demand)
  ↓ synchronous <script> tags:
1.  crypto-helper.js       → CryptoHelper
2.  storage-keys.js        → window.STORAGE_KEYS   ← before App
3.  utils.js               → window.Utils           ← before App
4.  fields.js              → window.FIELDS, window.FIELD_BY_ID
5.  pdf-lib-loader.js      → window.PDFLibs.ensure(...) — on-demand PDF CDN loader

6.  app-init.js            → window.App (state only)
7.  app-ui-utils.js        → App += toast, dark mode, clipboard
8.  app-navigation.js      → App += updateUI, navigateTo
9.  app-core.js            → App += save, load
10. app-scan.js            → App += processScan
    app-scan-doc-intel.js  → App += analyzeDocuments, renderDocIntelResults (sibling, same IIFE scope)
11. app-property.js        → App += smartAutoFill
12. app-vehicles.js        → App += renderDrivers/Vehicles
13. app-popups.js          → App += processImage
14. app-export.js          → App += exportPDF, exportCMSMTF
15. app-quotes.js          → App += saveAsQuote

16. ai-provider.js         → window.AIProvider
17. dashboard-widgets.js   → window.DashboardWidgets

18–38. Plugin IIFEs (coi, prospect, quick-ref, accounting-export,
       compliance-dashboard, ezlynx-tool, quote-compare, intake-assist,
       email-composer, policy-qa, reminders, hawksoft-export, vin-decoder,
       call-logger, endorsement-parser, task-sheet, returned-mail,
       deposit-sheet, dec-import, blind-spot-brief, commercial-quoter)

39. data-backup.js, bug-report.js
40. firebase-config.js     ← must precede auth.js
41. auth.js                ← must precede cloud-sync.js
42. admin-panel.js
43. cloud-sync.js          → CloudSync
44. paywall.js, onboarding.js
45. app-boot.js            ← ★ MUST BE LAST — runs App.boot()
```

**PDF libs are lazy-loaded.** Before using `jsPDF`, `JSZip`, `pdfjsLib`, or `PDFLib`, call `await window.PDFLibs.ensure('jspdf' | 'jszip' | 'pdfjs' | 'pdflib' | [...])`. The loader is idempotent and caches in-flight promises.

---

## Shared Utilities (`window.Utils`)

| Function | Signature | Use when |
|----------|-----------|----------|
| `escapeHTML` | `(str) → string` | Inserting user/AI data into HTML text nodes |
| `escapeAttr` | `(str) → string` | Building `attr="${val}"` strings in templates |
| `tryParseLS` | `(key, fallback) → any` | Reading any localStorage value that might be JSON |
| `debounce` | `(fn, ms) → fn` | Delaying saves, search inputs; returned fn has `.cancel()` |

**Never define these inline in plugins** — always delegate to `Utils.*`.

---

## Storage Keys (`window.STORAGE_KEYS`)

`STORAGE_KEYS` is a **frozen** global — the single source of truth for all `altech_*` strings. **Never hardcode key strings in modules.**

```javascript
// ✅ correct
Utils.tryParseLS(STORAGE_KEYS.REMINDERS, []);
localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(data));

// ❌ wrong
JSON.parse(localStorage.getItem('altech_reminders'));
```

Key entries (see `js/storage-keys.js` for full list):

| Constant | Value | Notes |
|----------|-------|-------|
| `FORM` | `altech_v6` | `App.data` — encrypted, cloud-synced |
| `QUOTES` | `altech_v6_quotes` | Drafts — encrypted, cloud-synced |
| `CGL_STATE` | `altech_cgl_state` | Cloud-synced |
| `REMINDERS` | `altech_reminders` | Cloud-synced |
| `DARK_MODE` | `altech_dark_mode` | Cloud-synced via settings doc |
| `ENCRYPTION_SALT` | `altech_encryption_salt` | Never sync to cloud |

---

## Cloud Sync Pattern

`js/cloud-sync.js` exposes `CloudSync`. All synced Firestore doc types live in one array:

```javascript
// js/cloud-sync.js ~line 27
const SYNC_DOCS = [
    'settings', 'currentForm', 'cglState', 'clientHistory',
    'quickRefCards', 'quickRefNumbers', 'reminders', 'glossary',
    'vaultData', 'vaultMeta',
];
```

**To add a new sync type:** add one string to `SYNC_DOCS`. Push and delete pick it up automatically — no other changes required.

**After any write to a synced key:** call `CloudSync.schedulePush()` (debounced 3 s).

**Firestore paths:** `users/{uid}/sync/{docType}` | quotes: `users/{uid}/quotes/{id}`

---

## CSS Architecture

### Load Order in `index.html`

```html
<link href="css/variables.css">              <!-- :root vars + body.dark-mode overrides ONLY -->
<link href="css/base.css">                    <!-- reset, body, typography -->
<link href="css/layout.css">                  <!-- shell, sidebar, header, plugin container -->
<link href="css/components-cards.css">        <!-- cards, quote cards, driver/vehicle, export, maps -->
<link href="css/components-inputs.css">       <!-- input types, field styles -->
<link href="css/components-quote-library.css"><!-- quote library search -->
<link href="css/components-buttons.css">      <!-- primary + utility buttons, producer toggle -->
<link href="css/components-forms.css">        <!-- form enhancements, radio cards, validation, consent, Places autocomplete -->
<link href="css/components-modals.css">       <!-- data preview modal, JS-generated modal dark mode -->
<link href="css/components-toasts.css">       <!-- toast notifications -->
<link href="css/components-loading.css">      <!-- standardized loading states, skeleton placeholders -->
<link href="css/components-misc.css">         <!-- co-applicant, scan drop zone, debug UI, demo link, dark-mode badges -->
<link href="css/components-acord.css">        <!-- ACORD 25 form styles + print -->
<link href="css/components-pwa.css">          <!-- PWA update banner + install button -->
<link href="css/landing.css">                 <!-- bento grid, tool-row -->
<link href="css/animations.css">              <!-- all @keyframes -->
<!-- plugin CSS files follow -->
```

### File Responsibilities

| File | Edit for |
|------|----------|
| `variables.css` | CSS custom properties, `body.dark-mode` variable overrides — **only** |
| `base.css` | Global reset, body, typography |
| `layout.css` | App shell, sidebar dimensions, plugin container |
| `components-*.css` | Shared UI components — each file holds one component family (cards, inputs, buttons, modals, toasts, forms, loading, acord, pwa, misc, quote-library). `components.css` no longer exists. |
| `animations.css` | All `@keyframes` — never define them in plugin CSS |
| `compliance-main.css` / `compliance-print-dark.css` / `compliance-responsive.css` | Compliance plugin styles split by concern (main table/dashboard, print + dark mode, desktop/mobile responsive) |
| `intake-assist-chat.css` / `intake-assist-sidebar.css` / `intake-assist-features.css` / `intake-assist-polish.css` | Intake assistant styles split by pane (chat, sidebar, feature cards, polish/responsive/dark) |
| `[plugin].css` | Other plugin-scoped styles — standalone, do not touch in global refactors |

### Critical Rules

- **Never edit `css/main.css`** — dead `@import` aggregator, not linked in `index.html`, has zero effect
- **Dark mode selector:** `body.dark-mode .class` (not `[data-theme="dark"]`)
- **Default is dark:** `loadDarkMode()` defaults to dark when no preference is stored
- **Valid variables:** `--bg-card`, `--text`, `--apple-blue`, `--text-secondary`, `--bg-input`, `--border`
- **Invalid (don't exist):** `--card`, `--surface`, `--accent`, `--muted`, `--text-primary`, `--input-bg`, `--border-color`
- **Prefer solid colors** (`#1C1C1E`) over low-opacity rgba for dark mode backgrounds
- **`/* no var */` comments** mark hardcoded colors still needing a design token — leave them intact, do not remove. Currently in the split compliance files (3× `#FF9500` warning/saving states) and the split components files (1× low-opacity rgba background). Search `/* no var */` to find all instances.

### `[data-tooltip]` Bleed — Full Property Matrix (CRITICAL)

The `[data-tooltip]` hover-popover rule set (currently in `css/components-acord.css` — grep `[data-tooltip]` across the `components-*.css` shards to confirm) bleeds **six** properties onto any element carrying a `data-tooltip` attribute. Sidebar nav items all carry it for collapsed-mode tooltips. Any new element that gets `data-tooltip` must explicitly reset every property it doesn't want:

| Property | Bleeds via | Value | If `::before` is NOT a tooltip arrow |
|----------|-----------|-------|---------------------------------------|
| `background` | `[data-tooltip]` | `var(--bg-input)` | reset to `transparent` |
| `border` | `[data-tooltip]` | `1px solid var(--border)` | reset to `none` |
| `height` | `[data-tooltip]` | `18px` | reset to `auto` |
| `font-size` | `[data-tooltip]` | `11px` | reset to correct value |
| `::before opacity` | `[data-tooltip]::before` + `:hover` | `0` → `1` on hover | set `opacity: 1` always to prevent pop-in |
| `::before border` | `[data-tooltip]::before` | `6px solid transparent` | reset to `none` |

**The `::before` opacity bleed is the most subtle.** If an element draws a custom `::before` (e.g., the active indicator bar), it inherits `opacity: 0` at rest — making it invisible — then `[data-tooltip]:hover::before { opacity: 1 }` fires on hover, causing it to suddenly appear as an unexpected element. Always add `opacity: 1; border: none` to custom `::before` pseudo-elements on any element that also has `data-tooltip`.

---

## Three Workflows

| Workflow | Steps | Skips |
|----------|-------|-------|
| `home` | 0→1→2→3→5→6 | Step 4 (vehicles) |
| `auto` | 0→1→2→3→4→5→6 | — |
| `both` | 0→1→2→3→4→5→6 | — |

Test all three workflows when changing step logic or conditions.

---

## Testing

```bash
npm test                          # 27 suites, 1688 tests
npx jest --no-coverage            # faster
npx jest tests/app.test.js        # single suite
```

- **JSDOM limitations:** no `crypto.subtle`, no `ImageBitmap`, no `showOpenFilePicker`, no `IntersectionObserver`
- **Utils injection:** test helper functions that create mini DOMs must inject `js/utils.js` source before any plugin that calls `Utils.*`
- **CSS tests:** read `css/base.css` / `css/layout.css`, or use `tests/helpers/css-loader.js` (`readComponentsCss()`, `readComplianceCss()`, `readIntakeAssistCss()`) to aggregate the split shards — **never** `css/main.css` (deleted) and **never** the old `css/components.css` / `css/compliance.css` / `css/intake-assist.css` (split in 2026-04)

---

## Search Tools

`grep_search` and `file_search` are unreliable on this project — `js/`, `plugins/`, `api/`, and `css/` are excluded from VS Code's search index via `settings.json`.

Always use `run_in_terminal` with PowerShell `Select-String` for string searches:

```powershell
Select-String -Path "js/fields.js" -Pattern "firstName"
Select-String -Path "plugins/*.html" -Pattern "bedroom"
Select-String -Path "js/*.js" -Pattern "ezlynxRequired"
```

Never fall back to `grep_search` for source files. Start with terminal.

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

## Vercel API Limits

Project is on **Vercel Pro** (as of April 2026). Practical limits:
- **Function count**: up to ~1000 (was 12 on Hobby — no longer a constraint).
- **`maxDuration`**: 300s default, configurable up to 800s with Fluid Compute.
- **Crons**: unlimited daily invocations (was 2/day on Hobby).

Current count: **13 serverless functions + 3 `_` helpers** (reminders-sweep.js added April 2026).

When adding new `api/` behavior:
- Prefer a new file for new logical endpoints — clearer logs, per-endpoint `maxDuration`, independent error budgets.
- `?mode=` / `?action=` routing in existing files (`stripe.js`, `config.js`, `property-intelligence.js`) is *historical* from Hobby days. Don't add new modes just to avoid a new file — a new file is fine now. Existing mode routes can stay until there's a reason to split.
- `_`-prefixed files remain helpers (not routed, not counted).

---

## Property Intelligence Pipeline (`api/property-intelligence.js`)

The `?mode=zillow` (Rentcast/Gemini) and `?mode=arcgis` (ArcGIS + FEMA) flows use 4 data sources:

| Step | Source | Handler | Notes |
|------|--------|---------|-------|
| 1 | **Rentcast** | `fetchRentcastData()` | `/v1/properties` — structural features, HOA, architecture. Null on 404/miss. |
| 2 | **Gemini AI** | `fetchViaGeminiSearch()` | Fallback when Rentcast misses. Returns `{value, source}` per field. |
| 3 | **ArcGIS / Clark County** | `handleArcgis()` | Parcel geometry, PC, fire stations. Runs parallel with FEMA. |
| 4 | **FEMA NFHL** | `fetchFloodZone()` | Public flood zone API (no key). 5-second timeout. Attached to ArcGIS response as `floodData`. |

**`js/app-property.js` Rentcast usage counter:** tracks per-user call count in Firestore (`users/{uid}/rentcastUsage`). Overage modal fires when count exceeds limit. All Rentcast calls write `{ ts, address, source: 'rentcast' }` to audit log.

**Authoritative ref:** `docs/RENTCAST_API.md` — read this first before touching any Rentcast or FEMA code. Covers full field schema, enum values, and fields that do NOT exist in Rentcast (use Gemini fallback).

### Listing Search Pipeline (`?mode=listing-search`)

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

### AI Coverage Gap Analysis (`js/app-export.js`)

Step 6 (Review & Export) includes a "Coverage Gap Analysis" card that sends current form data to Gemini for personalized insurance recommendations.

| Function | What |
|----------|------|
| `runCoverageGapAnalysis()` | Builds prompt from `App.data` + `App.drivers` + `App.vehicles`, calls `/api/property-intelligence?mode=coverage-gap` |
| `_renderCoverageGapResults()` | Renders AI markdown response into styled HTML cards in `#coverageGapResults` |

The analysis uses the existing `property-intelligence.js` endpoint with `?mode=coverage-gap` routing.

---

## Key Conventions

- **Vanilla JS only** — no React, Vue, Svelte, or any framework
- **No ES modules in plugins** — plain `<script>` tags; use IIFE pattern
- **No build step** — edit files, reload browser
- **Firebase compat mode** — `firebase.auth()`, `firebase.firestore()` (not modular imports)
- **`@keyframes` in `animations.css` only** — never in plugin CSS files
- **Field IDs are storage keys** — never rename an `<input id="...">` without a migration in `App.load()`
- **All form writes via `App.save()`** — never write to `STORAGE_KEYS.FORM` directly
- **After any work session:** add an entry to `CHANGELOG.md`, run `npm run audit-docs`

## What NOT To Do

| ❌ | ✅ |
|----|-----|
| Hardcode `'altech_reminders'` | Use `STORAGE_KEYS.REMINDERS` |
| Define `escapeHTML` in a plugin | Call `Utils.escapeHTML()` |
| Write `localStorage.setItem('altech_v6', ...)` | Call `App.save()` |
| Add a new `api/` file without checking count | Count with `(ls api/ \| grep -v '^_' \| wc -l)` — max 12 |
| Use `var(--accent)` or `var(--muted)` | Use `var(--apple-blue)` or `var(--text-secondary)` |
| Edit `css/main.css` | Edit the split file where the selector lives |
| Load `app-boot.js` before plugins | It must always be the last `<script>` tag |
| Remove a `/* no var */` comment | Leave it — it marks work still to be done |
