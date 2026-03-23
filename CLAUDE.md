# Altech Toolkit — Agent Reference

> **Cold-start guide.** For deep dives see `AGENTS.md` — read only the sections relevant to your task.

## Project

Vanilla HTML/CSS/JS SPA. No build step, no framework. Vercel deploy (push `main`). Firebase compat for auth + Firestore.

```bash
npm run dev               # port 3000
npm test                  # 26 suites, 1672 tests
npx jest --no-coverage    # faster
```

---

## JS Module Architecture

### Global Singletons (loaded before `App`)

| Global | File | Exposes |
|--------|------|---------|
| `CryptoHelper` | `js/crypto-helper.js` | AES-256-GCM encrypt/decrypt |
| `window.STORAGE_KEYS` | `js/storage-keys.js` | Frozen map of all 37 `altech_*` localStorage keys |
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
| `app-scan.js` | `App.processScan()`, OCR, Gemini AI |
| `app-property.js` | `App.smartAutoFill()`, Maps, assessor data |
| `app-vehicles.js` | `App.renderDrivers()`, `App.renderVehicles()`, DL scan |
| `app-popups.js` | `App.processImage()`, hazard detection |
| `app-export.js` | `App.exportPDF()`, `App.exportCMSMTF()` |
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
CDN libraries (firebase-compat, jszip, jspdf, pdf.js, pdf-lib)
  ↓ synchronous <script> tags:
1.  crypto-helper.js       → CryptoHelper
2.  storage-keys.js        → window.STORAGE_KEYS   ← before App
3.  utils.js               → window.Utils           ← before App
4.  fields.js              → window.FIELDS, window.FIELD_BY_ID

5.  app-init.js            → window.App (state only)
6.  app-ui-utils.js        → App += toast, dark mode, clipboard
7.  app-navigation.js      → App += updateUI, navigateTo
8.  app-core.js            → App += save, load
9.  app-scan.js            → App += processScan
10. app-property.js        → App += smartAutoFill
11. app-vehicles.js        → App += renderDrivers/Vehicles
12. app-popups.js          → App += processImage
13. app-export.js          → App += exportPDF, exportCMSMTF
14. app-quotes.js          → App += saveAsQuote

15. ai-provider.js         → window.AIProvider
16. dashboard-widgets.js   → window.DashboardWidgets

17–36. Plugin IIFEs (coi, prospect, quick-ref, accounting-export,
       compliance-dashboard, ezlynx-tool, quote-compare, intake-assist,
       email-composer, policy-qa, reminders, hawksoft-export, vin-decoder,
       call-logger, endorsement-parser, task-sheet, returned-mail,
       deposit-sheet, dec-import, blind-spot-brief)

37. data-backup.js, bug-report.js
38. firebase-config.js     ← must precede auth.js
39. auth.js                ← must precede cloud-sync.js
40. admin-panel.js
41. cloud-sync.js          → CloudSync
42. paywall.js, onboarding.js
43. app-boot.js            ← ★ MUST BE LAST — runs App.boot()
```

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
<link href="css/variables.css">   <!-- :root vars + body.dark-mode overrides ONLY -->
<link href="css/base.css">        <!-- reset, body, typography -->
<link href="css/layout.css">      <!-- shell, sidebar, header, plugin container -->
<link href="css/components.css">  <!-- buttons, inputs, cards, modals, toasts -->
<link href="css/landing.css">     <!-- bento grid, tool-row -->
<link href="css/animations.css">  <!-- all @keyframes -->
<!-- plugin CSS files follow -->
```

### File Responsibilities

| File | Edit for |
|------|----------|
| `variables.css` | CSS custom properties, `body.dark-mode` variable overrides — **only** |
| `base.css` | Global reset, body, typography |
| `layout.css` | App shell, sidebar dimensions, plugin container |
| `components.css` | Shared UI components (cards, buttons, modals, toasts) |
| `animations.css` | All `@keyframes` — never define them in plugin CSS |
| `[plugin].css` | Styles scoped to one plugin — standalone, do not touch in global refactors |

### Critical Rules

- **Never edit `css/main.css`** — dead `@import` aggregator, not linked in `index.html`, has zero effect
- **Dark mode selector:** `body.dark-mode .class` (not `[data-theme="dark"]`)
- **Default is dark:** `loadDarkMode()` defaults to dark when no preference is stored
- **Valid variables:** `--bg-card`, `--text`, `--apple-blue`, `--text-secondary`, `--bg-input`, `--border`
- **Invalid (don't exist):** `--card`, `--surface`, `--accent`, `--muted`, `--text-primary`, `--input-bg`, `--border-color`
- **Prefer solid colors** (`#1C1C1E`) over low-opacity rgba for dark mode backgrounds
- **`/* no var */` comments** mark hardcoded colors still needing a design token — leave them intact, do not remove. Currently in `css/compliance.css` (3× `#FF9500` warning/saving states) and `css/components.css` (2×: 1 low-opacity rgba background, 1 `#ff9500` orange on `.btn-import`). Search `/* no var */` to find all instances.

---

## Three Workflows

Coverage type selection (HOME / AUTO / HOME & AUTO) is embedded in step 1. Step 2 DOM element is kept as an empty placeholder for stability but is not part of any workflow.

| Workflow | Steps | Skips |
|----------|-------|-------|
| `home` | 0→1→3→5→6 | Steps 2 and 4 |
| `auto` | 0→1→3→4→5→6 | Step 2 |
| `both` | 0→1→3→4→5→6 | Step 2 |

Test all three workflows when changing step logic or conditions.

---

## Testing

```bash
npm test                          # 26 suites, 1672 tests
npx jest --no-coverage            # faster
npx jest tests/app.test.js        # single suite
```

- **JSDOM limitations:** no `crypto.subtle`, no `ImageBitmap`, no `showOpenFilePicker`, no `IntersectionObserver`
- **Utils injection:** test helper functions that create mini DOMs must inject `js/utils.js` source before any plugin that calls `Utils.*`
- **CSS tests:** read `css/base.css` / `css/layout.css` / `css/components.css` — **never** `css/main.css` (deleted)

---

## Vercel API Limit

Hobby plan max: **12 serverless functions**. Current count: **12 (at the limit)**.

Before adding any file to `api/`: count non-`_` files — must stay ≤ 12.

To add new API behavior: use `?mode=` or `?type=` routing inside an existing function, or prefix the file with `_` (helper, not counted).

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
| Add inline `style="..."` to HTML or JS templates | Define a CSS class in `components.css` or the relevant plugin CSS |
| Use `style="opacity:0.6;cursor:not-allowed;"` on locked fields | Add class `locked-field` |
| Use `style="font-size:Xpx !important"` to override input sizing | Add a scoped CSS class — never use `!important` in HTML |
