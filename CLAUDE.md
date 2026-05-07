# Altech Toolkit — Agent Reference

> **Cold-start guide.** For deep dives see `AGENTS.md` — read only the sections relevant to your task.

## Project

Vanilla HTML/CSS/JS SPA. No build step, no framework. Vercel deploy (push `main`). Firebase compat for auth + Firestore (Supabase migration in progress — see "Sync Backend" below).

```bash
npm run dev               # node server.js — port 8000 (override with PORT env)
npm test                  # 33 test suites
npx jest --no-coverage    # faster
```

---

## JS Module Architecture

### Global Singletons (loaded before `App`)

| Global | File | Exposes |
|--------|------|---------|
| `CryptoHelper` | `js/crypto-helper.js` | AES-256-GCM encrypt/decrypt |
| `window.STORAGE_KEYS` | `js/storage-keys.js` | Frozen map of ~62 localStorage keys |
| `window.Utils` | `js/utils.js` | `escapeHTML`, `escapeAttr`, `tryParseLS`, `debounce` |
| `window.FIELDS` / `window.FIELD_BY_ID` | `js/fields.js` | ~160 intake form field definitions with id/label/type/section |

### App Assembly — `Object.assign` Pattern

`window.App` is created in `app-init.js` then extended across many `app-*.js` files via `Object.assign(App, { ... })`. Each file adds its own slice; all share the same object.

| File | Owns |
|------|------|
| `app-init.js` | `App` creation, `App.data`, `App.workflows`, `App.toolConfig[]`, `App.stepTitles` |
| `app-ui-utils.js` | `App.toast()`, `App.toggleDarkMode()`, `App.loadDarkMode()`, `App.formatDateDisplay()`, `App.copyToClipboard()` |
| `app-navigation.js` | `App.updateUI()`, `App.navigateTo()`, step progression, hash routing |
| `app-validation.js` | Field-level validation helpers used by core/save flow |
| `app-core.js` | `App.save()`, `App.load()`, form field persistence, schema migration, encryption |
| `app-places.js` | Google Places autocomplete wiring |
| `app-carriers.js` | Carrier rules / overrides used by export + carrier-fit |
| `app-applicant.js` | Applicant/co-applicant rendering & state |
| `app-ai-settings.js` | AI provider key UI + persistence (Gemini/Anthropic) |
| `app-scan.js` | `App.processScan()`, OCR, Gemini AI (image-scan pipeline only) |
| `app-scan-doc-intel.js` | Document intelligence: `analyzeDocuments`, `renderDocIntelResults`, `applyDocIntelToForm`, `saveDocIntelResults`, `loadDocIntelResults` |
| `app-property.js` | `App.smartAutoFill()` orchestration |
| `app-property-maps.js` | Static Maps + Street View previews |
| `app-property-parcel.js` | ArcGIS parcel/PC/fire-station handling |
| `app-property-rentcast.js` | Rentcast lookup + per-user usage counter |
| `app-property-unified.js` | Merge layer for Rentcast + Gemini + ArcGIS results |
| `app-vehicles.js` | `App.renderDrivers()`, `App.renderVehicles()`, DL scan |
| `app-popups.js` | `App.processImage()`, hazard detection, vision results, data preview modal |
| `app-popups-history.js` | Property history / insurance trends / market comparison / timeline popups |
| `app-export.js` | Export entry points + UI wiring |
| `app-export-pdf.js` | `App.exportPDF()` |
| `app-export-csv.js` | Text / CSV export |
| `app-export-coverage-gap.js` | Coverage-gap analysis (Gemini-driven) |
| `app-export-carrier-fit.js` | Carrier-fit recommendation export |
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

Authoritative source: `index.html` (search `<script src=`). Summary:

```
CDN libraries (firebase-compat + supabase-js — jszip/jspdf/pdf.js/pdf-lib are lazy-loaded on demand)
  ↓ synchronous <script> tags:
Globals first (must precede App):
  pdf-lib-loader.js, crypto-helper.js, storage-keys.js, utils.js, fields.js

App core (Object.assign extends App in order):
  app-init.js → app-ui-utils.js → app-navigation.js → app-validation.js → app-core.js
  → app-places.js → app-carriers.js → app-applicant.js → app-ai-settings.js
  → app-scan.js → app-scan-doc-intel.js
  → app-property.js → app-property-maps.js → app-property-parcel.js
    → app-property-unified.js → app-property-rentcast.js
  → app-vehicles.js → app-popups.js → app-popups-history.js
  → app-export.js → app-export-pdf.js → app-export-csv.js
    → app-export-coverage-gap.js → app-export-carrier-fit.js → app-export-cmsmtf.js
  → app-quotes.js

Shared services:
  ai-provider.js, dashboard-widgets.js

Plugin IIFEs (in load order):
  prospect-formatters.js, prospect.js, quick-ref.js, accounting-export.js,
  compliance-idb.js, compliance-dashboard.js, ezlynx-tool.js, quote-compare.js,
  intake-assist-prompts.js, intake-assist.js, email-composer.js, reminders.js,
  hawksoft-renderers.js, hawksoft-export.js, vin-decoder.js, phonetic-speller.js,
  call-logger.js, endorsement-parser.js, task-sheet.js, returned-mail.js,
  dec-import.js, tools/_tool-components.js + tools/broadform-*.js,
  commercial-quoter.js

Backend / auth / sync (order matters):
  data-backup.js, bug-report.js,
  firebase-config.js → auth.js → admin-panel.js → cloud-sync.js,
  supabase-config.js → supabase-sync.js → supabase-auth.js → auth-mfa-ui.js
    → sync-facade.js (window.Sync / window.AuthFacade router),
  vault-meta.js, vault-ui.js, migration-ui.js,
  paywall.js, onboarding.js, quoting-info-panels.js

Last:
  app-boot.js     ← ★ MUST BE LAST — runs App.boot()
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
| `ENCRYPTION_SALT` | `altech_encryption_salt` | PBKDF2 salt for legacy v1 device key — never sync |
| `PASSPHRASE_SALT` | `altech_passphrase_salt` | Per-device cache of v2 passphrase salt — never sync |
| `E2E_CRYPTO_V2` | `altech_e2e_crypto_v2` | Feature flag: `'1'` = v2 vault active |
| `VAULT_LOCAL_META` | `altech_vault_meta_local` | Vault meta cache (also offline fallback for the Supabase router) |
| `SYNC_BACKEND` | `altech_sync_backend` | `'firebase'` (default) \| `'supabase'` |
| `MIGRATION_ENABLED` | `altech_migration_enabled` | `'1'` = show migration modal (admin/dev only during rollout) |
| `MIGRATION_STATE` | `altech_migration_state` | Resume-on-crash state for the Phase 4 pipeline |
| `MIGRATION_DRY_RUN` | `altech_migration_dry_run` | `'1'` = Session 2 pipeline copies but doesn't flip backend |
| `PRE_MIGRATION_BACKUP` | `altech_pre_migration_backup` | Snapshot taken before Session 2 runs; 30-day TTL, auto-clean |

---

## Sync Backend (Firebase ↔ Supabase migration)

The app is mid-migration from Firebase (Firestore + Firebase Auth) to Supabase. **Both stacks ship in production**; the active backend is selected by `localStorage[STORAGE_KEYS.SYNC_BACKEND]` (`'firebase'` default | `'supabase'`).

Prefer the facade in new code:

| Use | Not |
|-----|-----|
| `window.Sync.xxx` | `CloudSync.xxx` |
| `window.AuthFacade.xxx` | `Auth.xxx` |

The facade (`js/sync-facade.js`) routes calls to either `CloudSync` (Firebase) or `SupabaseSync` (Supabase). Existing direct call sites still work — Phase 4 migrates them as the per-user migration modal flips users over (`MIGRATION_ENABLED` / `MIGRATION_STATE` flags).

### Firebase sync (`js/cloud-sync.js`, `CloudSync`)

All synced Firestore doc types live in one array (~line 42):

```javascript
const SYNC_DOCS = [
    'settings', 'currentForm', 'cglState', 'clientHistory',
    'quickRefCards', 'quickRefNumbers', 'quickRefEmojis', 'reminders', 'glossary',
    'vaultData', 'vaultMeta',
    'commercialDraft', 'commercialQuotes',
    'carrierOverrides',
];
```

**To add a new sync type:** add one string to `SYNC_DOCS`. Push and delete pick it up automatically — no other changes required.

**After any write to a synced key:** call `CloudSync.schedulePush()` (debounced 3 s) — or `window.Sync.schedulePush()` to stay backend-agnostic.

**Firestore paths:** `users/{uid}/sync/{docType}` | quotes: `users/{uid}/quotes/{id}`

### Supabase sync (`js/supabase-sync.js`, `SupabaseSync`)

Mirrors `CloudSync`'s API. Backed by Postgres tables `public.user_blobs` (key-value, keyed by `(user_id, doc_key)`) and `public.user_quotes` (one row per draft, keyed by `id`). Vault metadata lives in `public.user_crypto_meta`. Auth via `js/supabase-auth.js`. MFA UI in `js/auth-mfa-ui.js`. Per-user E2E key (`E2E_CRYPTO_V2`) is passphrase-derived; salt + wrapped MK + KDF parameters are stored on `user_crypto_meta` and routed through [js/vault-meta.js](js/vault-meta.js) (router with localStorage offline cache). Never sync `ENCRYPTION_SALT`, `PASSPHRASE_SALT`, or `*_RECOVERY` keys.

## E2E Crypto — four hardened layers (Phases A–D, May 2026)

The v2 vault (`STORAGE_KEYS.E2E_CRYPTO_V2='1'`) goes deeper than just AES-GCM. New code touching crypto MUST understand which layer it sits in:

| Layer | Where | What it does | Backward compat |
|---|---|---|---|
| **A. KDF** | [js/crypto-helper.js](js/crypto-helper.js) | New vaults derive the KEK with **Argon2id** (lazy-loaded `hash-wasm` from CDN, m=64MiB t=3 p=1). Legacy vaults stay on **PBKDF2-600k**. Dispatched via `_deriveKEKAuto` reading `passphraseKdf` / `recoveryKdf` from vault meta — null fields ⇒ legacy PBKDF2. | Old vaults unlock unchanged; rewraps upgrade KDF to Argon2id without re-encrypting data (MK stays the same). |
| **A. HKDF tree** | [js/crypto-helper.js](js/crypto-helper.js) | New vaults set `kdfTree: 'hkdf-v1'`. MK becomes a master *seed*; the AES data key is `HKDF-SHA256(MK, info='altech.data.v1')`. Future subkeys (`altech.blind.v1`, `altech.agency.v1`) use distinct info strings — leak of one role can't be replayed against another. | Vaults without `kdfTree` use MK directly as the data key. Promoting a vault from "no tree" → `hkdf-v1` would require re-encrypting all data, so it never auto-upgrades. |
| **A. AAD builder** | [js/crypto-aad.js](js/crypto-aad.js) | `CryptoAAD.buildAAD({ table, rowId, userId, envelopeVersion })` — single source of truth for AAD bytes. **CI lint** ([scripts/lint-aad.mjs](scripts/lint-aad.mjs), runs as `pretest`) fails the build if any file outside `crypto-aad.js`/`crypto-helper.js` passes `additionalData:` directly. | n/a — additive primitive. |
| **B. AAD envelope** | [js/crypto-helper.js](js/crypto-helper.js), [js/supabase-sync.js](js/supabase-sync.js) | `encryptForRow(data, identity)` → JSON envelope `{v:2, iv, ct}` with AAD bound to `(table, rowId, userId)`. `decryptForRow` handles both v=2 envelopes AND legacy base64 ciphertexts. `pushBlob`/`pushQuote` accept an optional `identity` and transparently re-wrap the localStorage value into a v=2 envelope before pushing — server can no longer move ciphertexts between rows or relabel them. **Side effect**: plaintext-stored docs (`CGL_STATE`, `REMINDERS`) now also become AAD-bound ciphertext on the wire. | When v2 is locked or wrapping fails, legacy ciphertext passes through untouched (fail-open, never corrupt a row). Pull side still returns raw — caller routes through `decryptForRow` to handle either shape. |
| **C. VaultMeta router** | [js/vault-meta.js](js/vault-meta.js) | When `SYNC_BACKEND='supabase'` + signed in, vault meta reads/writes `public.user_crypto_meta`; otherwise localStorage-only. **Save writes local FIRST** (never blocks on network) and mirrors to Supabase best-effort. **Load prefers server** with local cache as offline fallback. Field mapping is centralized in `JS_TO_DB`/`DB_TO_JS` — adding a new vault-meta field is one line. | API contract unchanged; existing `vault-ui.js` call sites needed no edits. |
| **D. RLS + safety net** | [db/migrations/0005_rls_audit.sql](db/migrations/0005_rls_audit.sql), [scripts/verify-rls.mjs](scripts/verify-rls.mjs), [js/migration-backup.js](js/migration-backup.js) | (1) Self-checking SQL audit: refuses to apply if any public table lacks RLS or any policy. (2) Operator script that anon-connects to a live Supabase project and asserts cross-user reads return 0 rows / writes are rejected. (3) `MigrationBackup.snapshot()` captures every `altech_*` localStorage key (excluding `MIGRATION_*`/`SYNC_BACKEND`/`DEVICE_ID`) before Session 2 of `migration-ui.js` runs; `restore()` puts the device back exactly as it was on hard failure. 30-day TTL with auto-clean. (4) `MIGRATION_DRY_RUN` flag for "verify but don't flip backend." | Not yet wired — Session 2 of migration-ui.js will call `MigrationBackup.snapshot()` at top of pipeline and honor `isDryRun()`. |

**Cipher envelope dispatch**: `decryptForRow(envelopeOrLegacy, identity)` is the entry point that handles both shapes. Use it for any pull from `user_blobs`/`user_quotes`. For local-only `CryptoHelper.encrypt()`/`decrypt()` (no row identity), nothing changed — those still produce/consume the legacy base64 string.

**KDF-aware vault meta fields** (added by [db/migrations/0004_kdf_metadata.sql](db/migrations/0004_kdf_metadata.sql)): `passphrase_kdf`, `passphrase_kdf_params jsonb`, `recovery_kdf`, `recovery_kdf_params jsonb`, `kdf_tree`. All NULL-default → existing records keep working.

**RLS-protected tables**: `user_blobs`, `user_quotes`, `user_crypto_meta`, `audit_log`, plus the agency-sharing surface from `0003` (`agencies`, `agency_members`, `agency_key_wraps`, `agency_blobs`). When adding a new public table, also add it to `expected_tables[]` in `0005_rls_audit.sql` or the audit migration refuses to apply.

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

- **`css/main.css` is gone** — the old aggregator was deleted. If something references it (a stale doc, a test, an `@import`), update the reference to the actual split file.
- **Dark mode selector:** `body.dark-mode .class` (not `[data-theme="dark"]`)
- **Default is dark:** `loadDarkMode()` defaults to dark when no preference is stored
- **Valid variables:** `--bg-card`, `--text`, `--apple-blue`, `--text-secondary`, `--bg-input`, `--border`
- **Invalid (don't exist):** `--card`, `--surface`, `--accent`, `--muted`, `--text-primary`, `--input-bg`, `--border-color`
- **Prefer solid colors** (`#1C1C1E`) over low-opacity rgba for dark mode backgrounds
- **`/* no var */` comments** mark hardcoded colors still needing a design token — if you see one, leave it intact (it's a TODO marker for a follow-up tokenization pass). As of April 2026 there are zero remaining in `css/`; if any reappear, search `/* no var */` to find them.

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

Defined in `js/app-init.js` `App.workflows`. Steps are non-contiguous IDs — step-2 was removed during the intake redesign.

| Workflow | Steps | Skips |
|----------|-------|-------|
| `home` | 0 → 1 → 3 → 5 → 6 | Step 4 (vehicles) |
| `auto` | 0 → 1 → 3 → 4 → 5 → 6 | — |
| `both` | 0 → 1 → 3 → 4 → 5 → 6 | — |

Test all three workflows when changing step logic or conditions.

---

## Testing

```bash
npm test                          # 33 test suites under tests/ (Jest + JSDOM)
npx jest --no-coverage            # faster
npx jest tests/app.test.js        # single suite
npm run test:ext                  # chrome-extension-v2 suite (separate jest config)
```

- **JSDOM limitations:** no `crypto.subtle`, no `ImageBitmap`, no `showOpenFilePicker`, no `IntersectionObserver`
- **Utils injection:** test helper functions that create mini DOMs must inject `js/utils.js` source before any plugin that calls `Utils.*`
- **CSS tests:** read `css/base.css` / `css/layout.css`, or use `tests/helpers/css-loader.js` (`readComponentsCss()`, `readComplianceCss()`, `readIntakeAssistCss()`) to aggregate the split shards — **never** `css/main.css` (deleted) and **never** the old `css/components.css` / `css/compliance.css` / `css/intake-assist.css` (split in 2026-04)

---

## Search Tools

`grep_search` and `file_search` are unreliable on this project — `js/`, `plugins/`, `api/`, and `css/` are excluded from VS Code's search index via `settings.json`.

Always shell out for string searches. Linux/macOS:

```bash
grep -n "firstName"     js/fields.js
grep -rn "bedroom"      plugins/
grep -rn "ezlynxRequired" js/
```

Windows / PowerShell:

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

Current count: **14 routable functions + ~21 `_` helpers** in `api/`. Routable endpoints: `admin`, `admin-supabase`, `anthropic-proxy`, `compliance`, `config`, `hawksoft-logger`, `historical-analyzer`, `kv-store`, `policy-scan`, `property-intelligence`, `prospect-lookup`, `reminders-sweep` (cron), `stripe`, `vision-processor`.

When adding new `api/` behavior:
- Prefer a new file for new logical endpoints — clearer logs, per-endpoint `maxDuration`, independent error budgets.
- `?mode=` / `?action=` routing in existing files (`stripe.js`, `config.js`, `property-intelligence.js`, `prospect-lookup.js`) is *historical* from Hobby days. Don't add new modes just to avoid a new file — a new file is fine now. Existing mode routes can stay until there's a reason to split.
- `_`-prefixed files remain helpers (not routed, not counted). Property-pipeline helpers live in `api/_property-*.js`; prospect-pipeline helpers in `api/_prospect-*.js`; AI router in `api/_ai-router.js`; Apify client in `api/_apify-client.js`.

---

## Property Intelligence Pipeline (`api/property-intelligence.js`)

The `?mode=zillow` (Rentcast/Gemini) and `?mode=arcgis` (ArcGIS + FEMA) flows use 4 data sources:

| Step | Source | Handler | Notes |
|------|--------|---------|-------|
| 1 | **Rentcast** | `fetchRentcastData()` | `/v1/properties` — structural features, HOA, architecture. Null on 404/miss. |
| 2 | **Gemini AI** | `fetchViaGeminiSearch()` | Fallback when Rentcast misses. Returns `{value, source}` per field. |
| 3 | **ArcGIS / Clark County** | `handleArcgis()` | Parcel geometry, PC, fire stations. Runs parallel with FEMA. |
| 4 | **FEMA NFHL** | `fetchFloodZone()` | Public flood zone API (no key). 5-second timeout. Attached to ArcGIS response as `floodData`. |

**`js/app-property-rentcast.js` Rentcast usage counter:** tracks per-user call count in Firestore at `users/{uid}/sync/rentcastUsage`. Overage modal fires when count exceeds limit; approved overages write a permanent record to `users/{uid}/rentcast_overage_log/{ts}`. The counter UI binding (`#rentcastUsageDisplay`) lives in `js/app-property.js`.

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

### AI Coverage Gap Analysis (`js/app-export-coverage-gap.js`)

Step 6 (Review & Export) includes a "Coverage Gap Analysis" card that sends current form data to Gemini for personalized insurance recommendations.

| Function | What |
|----------|------|
| `runCoverageGapAnalysis()` | Builds prompt from `App.data` + `App.drivers` + `App.vehicles`, calls `/api/property-intelligence?mode=coverage-gap` |
| `_renderCoverageGapResults()` | Renders AI markdown response into styled HTML cards in `#coverageGapResults` |

The analysis uses the existing `property-intelligence.js` endpoint with `?mode=coverage-gap` routing.

---

## Plugins (`plugins/*.html`)

Lazy-loaded HTML fragments injected into a container `<div>` by `App.navigateTo(key)`. Tool registry lives in `App.toolConfig[]` (`js/app-init.js`) — adding a tool requires both an entry there and a matching plugin HTML file + IIFE in `js/`.

Current plugins: `quoting.html` (Personal Intake — wraps the wizard steps), `commercial-quoter.html`, `quotecompare.html`, `ezlynx.html`, `hawksoft.html`, `dec-import.html`, `task-sheet.html`, `compliance.html`, `reminders.html`, `call-logger.html`, `returned-mail.html`, `quickref.html`, `endorsement.html`, `email.html`, `prospect.html`, `accounting.html`, `vin-decoder.html`, `intake-assist.html`, `tools/broadform.html` (in-development "Carrier Match").

The `phonetic-speller` is a popup helper (no plugin HTML) — invoked from headers/inputs via `PhoneticSpeller.open(seed?)`.

---

## Compliance Plugin Storage

`js/compliance-dashboard.js` writes to `STORAGE_KEYS.CGL_STATE` (cloud-synced via `cglState`). Heavy state (parsed policy rows from HawkSoft uploads) is offloaded to IndexedDB through `js/compliance-idb.js` to keep the synced doc small. The `clientCompliance` annotation dict tracks WA L&I / OR CCB classification per HawkSoft `clientNumber` and reuses `_smartMergeDict` for safe multi-device merges.

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
| Call `CloudSync.xxx` directly in new code | Call `window.Sync.xxx` (routes to Firebase or Supabase) |
| Cloud-sync a key without adding it to `SYNC_DOCS` | Add the doc name once — push/delete pick it up |
| Sync `ENCRYPTION_SALT` / `PASSPHRASE_SALT` / `*_RECOVERY` | Local-only, never |
| Use `var(--accent)` or `var(--muted)` | Use `var(--apple-blue)` or `var(--text-secondary)` |
| Recreate `css/main.css` | It was removed — edit the split file where the selector lives |
| Load `app-boot.js` before plugins | It must always be the last `<script>` tag |
| Remove a `/* no var */` comment if you encounter one | Leave it — it marks tokenization work still to be done |
| Reference step-2 in workflows | It was removed — flows go 0 → 1 → 3 → … |
