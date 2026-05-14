# Altech Toolkit — Agent Reference

> **Cold-start guide.** For deep dives see `AGENTS.md` — read only the sections relevant to your task.

## Project

Vanilla HTML/CSS/JS SPA. No build step, no framework. Vercel deploy (push `main`). **Supabase is the sole auth + sync backend as of May 2026** — Firebase was fully removed in the Phase D cleanup. Encryption + row-level security via Supabase RLS + AES-GCM AAD envelopes.

```bash
npm run dev               # node server.js — port 8000 (override with PORT env)
npm test                  # ~62 suites, ~2362 tests (Jest + JSDOM)
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
| `window.ActivityLog` | `js/activity-log.js` | Local-only ring buffer (cap 100) of save/sync/export/AI/error events. API: `add({type,area,message,ok,detail})`, `list()`, `lastStatus()`, `subscribe(fn)`, `openPanel()`, `clear()`. Header status pill flips red on `ok:false`. **Never synced.** |
| `window.CommandPalette` | `js/command-palette.js` | Cmd/Ctrl+K palette. API: `open()`, `close()`, `toggle()`, `register({id,label,hint,icon,run})`. Built-ins: New quote, Add reminder, Phonetic speller, Today view, Open activity log, Toggle dark mode, Go to dashboard, Export files. Auto-includes every `App.toolConfig` tool + last ~30 clients from `CLIENT_HISTORY`. |
| `window.PhoneticSpeller` | `js/phonetic-speller.js` | APCO alphabet popup. `open(seed?)` — pre-fills with any text (name, email, VIN). Globally accessible via Cmd+K. |

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
CDN libraries (supabase-js — jszip/jspdf/pdf.js/pdf-lib are lazy-loaded on demand)
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
  ai-provider.js, activity-log.js, command-palette.js, dashboard-widgets.js

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
  supabase-config.js → supabase-sync.js → supabase-auth.js → auth-mfa-ui.js
    → auth.js (Supabase-only `Auth.*` facade) → sync-facade.js (`window.Sync` / `window.AuthFacade`),
  vault-meta.js, vault-ui.js,
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
| `SYNC_BACKEND` | `altech_sync_backend` | Dead flag (Firebase removed May 2026). Safe to ignore — kept only so removal scripts can tell users who flipped to `'firebase'` that they need to clear it. |
| `ACTIVITY_LOG` | `altech_activity_log` | `ActivityLog` ring buffer (cap 100 entries). **Local-only — never synced** (would bloat sync without benefit and would leak per-device activity to other devices). |

---

## Sync Backend (Supabase only)

Firebase was removed in the Phase D cleanup (May 2026). Supabase is the sole auth + sync backend. The facade pattern stays in place so future backend swaps don't touch 40+ plugin call sites:

| Use | Notes |
|-----|-------|
| `window.Sync.xxx` | Routes to `SupabaseSync.*`. Some methods (e.g. `pushToCloud`) map to `SupabaseSync.pushAllBlobs` for backward-compat with legacy CloudSync callers. |
| `window.AuthFacade.xxx` | Routes to `SupabaseAuth.*`. |
| `Auth.xxx` | `js/auth.js` is a thin Supabase-only facade — preserves the legacy `Auth.user`/`Auth.uid`/`Auth.apiFetch` API surface that ~40 plugins read directly. |

### Supabase sync (`js/supabase-sync.js`, `SupabaseSync`)

Backed by Postgres tables `public.user_blobs` (key-value, keyed by `(user_id, doc_key)`) and `public.user_quotes` (one row per draft, keyed by `id`). Vault metadata lives in `public.user_crypto_meta`. Auth via `js/supabase-auth.js`. MFA UI in `js/auth-mfa-ui.js`. Per-user E2E key (`E2E_CRYPTO_V2`) is passphrase-derived; salt + wrapped MK + KDF parameters are stored on `user_crypto_meta` and routed through [js/vault-meta.js](js/vault-meta.js). Never sync `ENCRYPTION_SALT`, `PASSPHRASE_SALT`, or `*_RECOVERY` keys.

All synced doc keys live in `DOC_LOCAL_KEYS` at the top of `supabase-sync.js`:

```javascript
const DOC_LOCAL_KEYS = Object.freeze({
    currentForm:      STORAGE_KEYS.FORM,
    cglState:         STORAGE_KEYS.CGL_STATE,
    clientHistory:    STORAGE_KEYS.CLIENT_HISTORY,
    quickRefCards:    STORAGE_KEYS.QUICKREF_CARDS,
    quickRefNumbers:  STORAGE_KEYS.QUICKREF_NUMBERS,
    quickRefEmojis:   STORAGE_KEYS.QUICKREF_EMOJIS,
    reminders:        STORAGE_KEYS.REMINDERS,
    glossary:         STORAGE_KEYS.AGENCY_GLOSSARY,
    vaultData:        STORAGE_KEYS.ACCT_VAULT,
    vaultMeta:        STORAGE_KEYS.ACCT_VAULT_META,
    commercialDraft:  STORAGE_KEYS.COMMERCIAL_DRAFT,
    commercialQuotes: STORAGE_KEYS.COMMERCIAL_QUOTES,
    carrierOverrides: STORAGE_KEYS.CARRIER_OVERRIDES,
    intakeV2Draft:    STORAGE_KEYS.INTAKE_V2,
    intakeV2Quotes:   STORAGE_KEYS.INTAKE_V2_QUOTES,
    agencyDefaults:   STORAGE_KEYS.AGENCY_DEFAULTS,
});
```

**To add a new sync type:** add one entry to `DOC_LOCAL_KEYS`. The `_pushAllBlobs` sweep + `restoreFromCloud()` pull pick it up automatically.

**After any write to a synced key:** call `window.Sync.schedulePush()` (debounced 3 s).

## E2E Crypto — four hardened layers (Phases A–D, May 2026)

The v2 vault (`STORAGE_KEYS.E2E_CRYPTO_V2='1'`) goes deeper than just AES-GCM. New code touching crypto MUST understand which layer it sits in:

| Layer | Where | What it does | Backward compat |
|---|---|---|---|
| **A. KDF** | [js/crypto-helper.js](js/crypto-helper.js) | New vaults derive the KEK with **Argon2id** (lazy-loaded `hash-wasm` from CDN, m=64MiB t=3 p=1). Legacy vaults stay on **PBKDF2-600k**. Dispatched via `_deriveKEKAuto` reading `passphraseKdf` / `recoveryKdf` from vault meta — null fields ⇒ legacy PBKDF2. | Old vaults unlock unchanged; rewraps upgrade KDF to Argon2id without re-encrypting data (MK stays the same). |
| **A. HKDF tree** | [js/crypto-helper.js](js/crypto-helper.js) | New vaults set `kdfTree: 'hkdf-v1'`. MK becomes a master *seed*; the AES data key is `HKDF-SHA256(MK, info='altech.data.v1')`. Future subkeys (`altech.blind.v1`, `altech.agency.v1`) use distinct info strings — leak of one role can't be replayed against another. | Vaults without `kdfTree` use MK directly as the data key. Promoting a vault from "no tree" → `hkdf-v1` would require re-encrypting all data, so it never auto-upgrades. |
| **A. AAD builder** | [js/crypto-aad.js](js/crypto-aad.js) | `CryptoAAD.buildAAD({ table, rowId, userId, envelopeVersion })` — single source of truth for AAD bytes. **CI lint** ([scripts/lint-aad.mjs](scripts/lint-aad.mjs), runs as `pretest`) fails the build if any file outside `crypto-aad.js`/`crypto-helper.js` passes `additionalData:` directly. | n/a — additive primitive. |
| **B. AAD envelope** | [js/crypto-helper.js](js/crypto-helper.js), [js/supabase-sync.js](js/supabase-sync.js) | `encryptForRow(data, identity)` → JSON envelope `{v:2, iv, ct}` with AAD bound to `(table, rowId, userId)`. `decryptForRow` handles both v=2 envelopes AND legacy base64 ciphertexts. `pushBlob`/`pushQuote` accept an optional `identity` and transparently re-wrap the localStorage value into a v=2 envelope before pushing — server can no longer move ciphertexts between rows or relabel them. **Side effect**: plaintext-stored docs (`CGL_STATE`, `REMINDERS`) now also become AAD-bound ciphertext on the wire. | When v2 is locked or wrapping fails, legacy ciphertext passes through untouched (fail-open, never corrupt a row). Pull side still returns raw — caller routes through `decryptForRow` to handle either shape. |
| **C. VaultMeta router** | [js/vault-meta.js](js/vault-meta.js) | When Supabase is reachable + signed in, vault meta reads/writes `public.user_crypto_meta`; otherwise localStorage-only. **Save writes local FIRST** (never blocks on network) and mirrors to Supabase best-effort. **Load prefers server** with local cache as offline fallback. Field mapping is centralized in `JS_TO_DB`/`DB_TO_JS` — adding a new vault-meta field is one line. | API contract unchanged. |
| **D. RLS** | [db/migrations/0005_rls_audit.sql](db/migrations/0005_rls_audit.sql), [scripts/verify-rls.mjs](scripts/verify-rls.mjs) | (1) Self-checking SQL audit: refuses to apply if any public table lacks RLS or any policy. (2) Operator script that anon-connects to a live Supabase project and asserts cross-user reads return 0 rows / writes are rejected. | n/a |

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
npm test                          # ~62 suites, ~2362 tests under tests/ (Jest + JSDOM)
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

Current count: **13 routable functions + ~22 `_` helpers** in `api/`. Routable endpoints: `admin-supabase`, `anthropic-proxy`, `compliance`, `config`, `hawksoft-logger`, `historical-analyzer`, `kv-store`, `policy-scan`, `property-intelligence`, `prospect-lookup`, `reminders-sweep` (cron), `stripe`, `vision-processor`. (Legacy `admin.js` was deleted in Phase D — Firebase removal — and never replaced.)

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

## Reliability features (May 2026)

| Feature | Where | What it does |
|---|---|---|
| **Toast queue** | `js/app-ui-utils.js` `App.toast()` | Toasts queue + dedupe (collapses identical consecutive messages) instead of clobbering each other. Errors default to 3500 ms (vs 2500 ms). `App.toast(msg, { type, duration, dedupe }, useHtml)` signature; legacy `toast(msg, duration, useHtml)` still works. |
| **AI error decoder** | `js/ai-provider.js` `_decodeApiError()` | Every AI HTTP error (Gemini/Anthropic/OpenAI/OpenRouter, ask + chat paths) maps `401/403/404/408/413/429/500/502/503/504` to a fix-pointing message. Unknown statuses fall back to upstream message. |
| **ActivityLog** | `js/activity-log.js` | See Global Singletons. Hooked into `App.save`, `App.logExport`, `SupabaseSync._pushAllBlobs`, `Reminders._save`, `ComplianceDashboard.saveState`, `App._parkCiphertextForRecovery`. |
| **Header status pill** | `js/dashboard-widgets.js` `_renderSyncStatusButton()` | "Activity ●" pill in the header. Green = last event ok, red = last error, gray = no activity. Click opens `ActivityLog.openPanel()`. |
| **Today widget** | `js/dashboard-widgets.js` `renderTodayWidget()` | Bento-grid card at the top with three sections: overdue/due-today reminders, policies expiring in the next 14 days, last 5 ActivityLog events. Each section "View all →" links to the source plugin. Live-updates on `ActivityLog.subscribe`. |
| **Page reload on auth change** | `js/auth.js` `_scheduleAuthReload(reason)` | After a real sign-in / sign-out (`.login`, `.logout`, `.signup` if a session was created, or ambient SDK events like multi-tab sign-out and session expiry), the page reloads after a 600 ms delay so locked-vault data disappears and freshly restored cloud blobs appear without a manual F5. Three guards: `_authReloadScheduled` (idempotent), `_suppressAuthReload` (one-shot for MFA enrollment), `_hadSignedInUser` (gates ambient sign-out detection so cold-load-no-session can't self-reload). |
| **Forced sign-in gate** | `js/app-boot.js` `_authGate` block + [Auth gate section below](#auth-gate--reload-flow) | Cold-load races `Auth.whenSignedIn(2000)` against a 2 s budget. If no user resolves, `body.auth-gated` pins the existing `#authModal` as a forced sign-in screen and boot early-returns — `renderLandingTools`, `Onboarding.init`, `VaultUI.maybePromptUnlockOnLoad`, `Reminders.init`, `DashboardWidgets.init`, the hash router are all skipped. |

(Push-side sync conflict UI + MigrationBackup were Phase-D-era Firebase artifacts; both were removed when `js/cloud-sync.js` and `js/migration-backup.js` were deleted.)

**Add a new ActivityLog hook in 3 lines:**

```js
if (window.ActivityLog) {
    window.ActivityLog.add({
        type: 'save', area: 'my-feature', ok: true,
        message: 'My thing saved',
    });
}
```

Types: `save | sync | export | import | ai | error`. Always feature-detect — ActivityLog isn't loaded in some test paths.

---

## Auth gate + reload flow

When the page loads with no signed-in user, [js/app-boot.js](js/app-boot.js) shows ONLY the sign-in modal — no dashboard chrome leaks through. When the user signs in or out, the page reloads so the UI rebuilds cleanly with the new auth state. The full flow:

```
window.onload
 └─ body.auth-resolving          (CSS hides everything but #toast, shows centered spinner)
 └─ Auth.whenSignedIn(2000)      (2 s race vs Auth.ready()'s 15 s safety timeout — too long for a gate)
    │
    ├─ user resolved             → remove auth-resolving, continue boot:
    │                              renderLandingTools, Onboarding.init, VaultUI.maybePromptUnlockOnLoad,
    │                              Reminders, DashboardWidgets.init, hash router, safety net
    │
    └─ null after 2 s            → body.auth-gated; Auth.showModal({forced:true, view:'login'|'reset'})
                                   then `return` — every downstream init is skipped
```

| Body class | When | What it hides |
|---|---|---|
| `auth-resolving` | between page load and the `whenSignedIn(2000)` settle | Everything via `body.auth-resolving > *:not(#toast):not(script):not(noscript)`; CSS spinner shown via `::before`/`::after` |
| `auth-gated` | no user resolved (forced gate) OR ambient sign-out before PR #106 reload fires | Everything except `#authModal` and `#toast`; modal close button hidden via `body.auth-gated #authModal .auth-close { display: none }` |

**`Auth.showModal({ forced, view })`** — extended signature. `forced: true` adds `body.auth-gated` and makes `Auth.closeModal()` a no-op until the class is cleared. `view: 'login' | 'signup' | 'reset' | 'account'` overrides the default branching (used for the `?type=recovery` deeplink so the user lands on the reset form).

**`Auth.closeModal()`** — bails early when `body.auth-gated` is present. The X button is hidden by CSS but any stray call from a plugin / keyboard handler / MFA success path is also a no-op.

**Hotkey opt-outs:** the Cmd+S / Esc-go-home handlers in `app-boot.js` live inside `window.onload` and never wire because of the gate's early return. Cmd+K is registered separately by [js/command-palette.js](js/command-palette.js) at DOMContentLoaded — `_onGlobalKeydown` checks `body.auth-gated` and returns early.

**Onboarding wizard** runs ONLY after the gate confirms a signed-in user. Brand-new visitors hit the sign-in screen first; after a fresh signup, PR #106's reload re-enters with a session, the wizard fires once (gated by its own `STORAGE_KEY` flag), then the dashboard.

**Password-reset deeplink** (Supabase email-recovery URL with `?type=recovery`): the gate stays up but the modal opens at the `reset` view directly. Same modal, different view, still locked.

**Reload-on-auth-change** ([js/auth.js](js/auth.js) `_scheduleAuthReload`):

```js
function _scheduleAuthReload(reason) {
    if (_authReloadScheduled) return;                // idempotent
    if (_suppressAuthReload) { _suppressAuthReload = false; return; }  // MFA escape hatch
    _authReloadScheduled = true;
    setTimeout(() => window.location.reload(), 600); // delay so toast / modal-close paints
}
```

Called from `.login` / `.logout` / `.signup` (only when a session was created — email-verification flow has no session, no reload), and from `_onAuthStateChanged` when transitioning user→null with `_hadSignedInUser=true` (catches multi-tab sign-out, session expiry, admin `is_blocked`). MFA enrollment sets `_suppressAuthReload = true` so the SDK's SIGNED_IN event doesn't reload through the open enrollment modal.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Toggle command palette |
| `Cmd/Ctrl + /` | Open command palette pre-filled to "Add reminder" |
| `↑ / ↓` | Move palette selection |
| `Enter` | Run selected command |
| `Esc` | Close palette / activity panel / open modals |

**Register a custom command** (from any plugin or the console):

```js
CommandPalette.register({
    id: 'my-plugin:do-thing',
    label: 'My plugin — do the thing',
    hint: 'Action · what it does',
    icon: '⚡',
    run: () => { /* ... */ },
});
```

Registrations are idempotent on `id` (re-registering replaces). The palette automatically includes every entry in `App.toolConfig` + the last ~30 clients from `CLIENT_HISTORY`.

---

## Intake v2 PDF — Summary vs. Fact Finder

Intake v2 ships **two PDF layouts** through a single builder. The orchestrator (`js/intake-v2-export.js`) exposes them as `IntakeV2.exportPDFSummary()` (default — the legacy `IntakeV2.exportPDF()` aliases to this) and `IntakeV2.exportPDFFactFinder()`. Both call `IntakeV2PDFBuilder.buildIntakeV2PDF(data, { layout })` with `layout: 'summary' | 'factfinder'`. They share the header, hero card, footer, compute helpers, and all visual primitives — only the body branches.

- **Summary** — underwriting snapshot on page 1 (carrier-fit grid, severity-density risk callouts, coverage A/B/C/D ratio bar, top-5 action items checklist) + dense detail dossier on pages 2+. The agent reads this when triaging a quote.
- **Fact Finder** — compressed page-1 cover + numbered sections §1–§N in **EZLynx Personal Lines screen order** for top-to-bottom transcription. The agent reads this while filling EZLynx (or manually creating a HawkSoft client). Section order is anchored to `js/ezlynx-tool.js` `formFields[]` (lines 59-86); field labels mirror `keyMap` so the agent pattern-matches PDF text to the EZLynx field label without translation.

**Source of truth for fact-finder section order**: `js/ezlynx-tool.js` `formFields[]`. When EZLynx reorders a screen, update `formFields[]` AND the section sequence in `buildIntakeV2PDF` (`layout === 'factfinder'` branch).

**Filename convention**: `${first}_${last}_intake_${date}_summary.pdf` vs `..._factfinder.pdf` so agents can keep both side-by-side without overwriting.

**Visual primitives** (all toner-friendly greyscale, all feature-detected via `has(doc, 'rect')` for JSDOM mock fallback): `statusGrid` (2×2 carrier-fit), `severityBox` (density-bar risk markers), `ratioBar` (Cov A baseline + B/C/D segments with single-letter labels for narrow segs), `pillChip`/`pillRow`, `timelineStrip` (35-month history), `checklist`, `operatorAssignmentGrid` (summary only), `sectionBand` (numbered fact-finder section header), `keystatRow`. All live in `js/intake-v2-export-pdf.js` and can be reused for future v2 exports.

**Empty-state behavior**: sections without data are skipped entirely (no orphan headers). Section numbering renumbers sequentially as drawn — auto-only quotes show §1–§13, full bundles can reach §18. The cover instruction strip says "Numbered sections below mirror the EZLynx Personal Lines screen order" rather than naming a fixed range.

---

## Plugins (`plugins/*.html`)

Lazy-loaded HTML fragments injected into a container `<div>` by `App.navigateTo(key)`. Tool registry lives in `App.toolConfig[]` (`js/app-init.js`) — adding a tool requires both an entry there and a matching plugin HTML file + IIFE in `js/`.

Current plugins: `quoting.html` (Personal Intake — wraps the wizard steps), `commercial-quoter.html`, `quotecompare.html`, `ezlynx.html`, `hawksoft.html`, `dec-import.html`, `task-sheet.html`, `compliance.html`, `reminders.html`, `call-logger.html`, `returned-mail.html`, `quickref.html`, `endorsement.html`, `email.html`, `prospect.html`, `accounting.html`, `vin-decoder.html`, `intake-assist.html`, `tools/broadform.html` (in-development "Carrier Match").

The `phonetic-speller` is a popup helper (no plugin HTML) — invoked from headers/inputs via `PhoneticSpeller.open(seed?)`.

---

## Compliance Plugin Storage

`js/compliance-dashboard.js` writes to `STORAGE_KEYS.CGL_STATE` (cloud-synced via `cglState`). Heavy state (parsed policy rows from HawkSoft uploads) is offloaded to IndexedDB through `js/compliance-idb.js` to keep the synced doc small. The `clientCompliance` annotation dict tracks WA L&I / OR CCB classification per HawkSoft `clientNumber` and reuses `_smartMergeDict` for safe multi-device merges.

**Two private helpers live at the top of `js/compliance-dashboard.js`:**

- `escJsAttr(s)` — dual-escape (JS-string layer + HTML-attr layer) for any value interpolated into `onclick="X('${escJsAttr(v)}')"`. Don't use `Utils.escapeAttr` directly here — that only handles the HTML layer; an apostrophe in a policy number would still break out of the JS string. The `pn` binding in `renderTable` routes through this helper; use the same pattern for any new interpolation.
- `_safeLSWrite(key, value)` — quota-tolerant `localStorage.setItem`. Surfaces a one-time toast on `QuotaExceededError` instead of silently swallowing. IndexedDB is the master source of truth for CGL state, so a quota miss just loses the fast cache. Replace every `localStorage.setItem(STORAGE_KEY, ...)` for user state with this helper; cache-only writes (`CGL_CACHE_KEY`) can stay silent.

**Vercel KV cache** (`api/kv-store.js`, allowed keys `cgl_state` / `cgl_cache` / `email_drafts` / `export_history`): the compliance dashboard's `_loadFromKV(key)` calls `GET /api/kv-store?key=...`. **Cache miss now returns `200 + null` body** (not 404 — that produced unconditional DevTools red-error logs even though the JS handled it gracefully). Real errors still return 4xx/5xx: 400 = invalid key, 401 = unauthenticated, 501 = `REDIS_URL` not set, 500 = Redis error. `_checkKV` reads `res.status !== 501 && res.status !== 401`, so the `200`/`null` change doesn't affect availability detection.

---

## Key Conventions

- **Vanilla JS only** — no React, Vue, Svelte, or any framework
- **No ES modules in plugins** — plain `<script>` tags; use IIFE pattern
- **No build step** — edit files, reload browser
- **Supabase JS v2** for all auth + sync — `window.Supabase.client.auth.*` / `from(...)` patterns
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
| Call `CloudSync.xxx` directly in new code | `CloudSync` is gone. Use `window.Sync.xxx` (routes to `SupabaseSync`) |
| Cloud-sync a key without adding it to `SYNC_DOCS` | Add the doc name once — push/delete pick it up |
| Sync `ENCRYPTION_SALT` / `PASSPHRASE_SALT` / `*_RECOVERY` | Local-only, never |
| Use `var(--accent)` or `var(--muted)` | Use `var(--apple-blue)` or `var(--text-secondary)` |
| Recreate `css/main.css` | It was removed — edit the split file where the selector lives |
| Load `app-boot.js` before plugins | It must always be the last `<script>` tag |
| Remove a `/* no var */` comment if you encounter one | Leave it — it marks tokenization work still to be done |
| Reference step-2 in workflows | It was removed — flows go 0 → 1 → 3 → … |
| Pass a string to `App.toast` as the 2nd arg (`toast('hi', 'success')`) | The 2nd arg is `duration` or `{ type, duration, dedupe }`. Use `App.toast('hi', { type: 'success' })`. The string-arg shape silently ignores the type. |
| Add a new `onclick="..."` to a CGL render with raw `policyNumber` interpolation | Use `data-cgl-action` delegation OR route the value through `escJsAttr()` (defined at the top of `js/compliance-dashboard.js`) — the broken legacy `replace(/'/g, "\\\\'")` was a 4-backslash typo that produced `\\'` not `\'`. |
| Hardcode `CACHE_VERSION = 'altech-v17'` in `sw.js` | Let the `.githooks/pre-commit` hook bump it automatically via `scripts/bump-sw-version.mjs`. Running `node scripts/bump-sw-version.mjs --dry-run` shows what it'd do. |
| Sync `ACTIVITY_LOG` to Supabase | It's local-only by design — would bloat sync and leak per-device activity to other devices. Don't add it to `DOC_LOCAL_KEYS`. |
| Skip an `ActivityLog.add` hook on a new save / sync / export site | The header status pill + Today widget + Recent column all depend on it. Three lines (feature-detected) is the cost of a green/red dot in the header that surfaces failures the user would otherwise miss. |
| Call `Auth.ready()` and assume a non-null user on slow networks | `ready()` can resolve with `null` via the 15s safety timeout. Use `await Auth.whenSignedIn(timeoutMs)` for code that needs an actual signed-in user (e.g. cloud-pull bootstrap). |
| Use `localStorage.setItem(STORAGE_KEY, ...)` for CGL state | Use `this._safeLSWrite(STORAGE_KEY, ...)` (defined in `js/compliance-dashboard.js`) — surfaces a one-time toast on `QuotaExceededError` instead of silently swallowing. |
| Call `window.location.reload()` directly after sign-in / sign-out | Use `_scheduleAuthReload(reason)` (defined at the top of `js/auth.js`). It's idempotent (`_authReloadScheduled`), MFA-safe (`_suppressAuthReload`), and delays 600 ms so the toast + modal-close paint first. |
| Call `Auth.showModal()` with no args from boot intending a forced gate | Use `Auth.showModal({ forced: true })`. Plain `showModal()` lets the user dismiss the modal (X button visible, `closeModal()` runs), defeating the gate. `forced: true` adds `body.auth-gated` which CSS-hides the X and makes `closeModal()` a no-op. |
| Return `404 { error: 'Key not found' }` from a Redis cache miss in `api/kv-store.js` | Return `200 + null` body. The 404 was semantically correct but unconditionally logged as a red error in Chrome DevTools' console — confused users who thought the app was broken. Real failures (invalid key, unauthenticated, Redis not configured, Redis error) still return 4xx/5xx. |
| Run `Onboarding.init()` outside the post-gate signed-in branch in `app-boot.js` | The wizard captures name/agency — meaningless without a session. It must live AFTER `_authGate`'s early return so it only fires when a real user is signed in. Brand-new visitors see the sign-in screen first; after a fresh signup the reload from PR #106 puts them in the signed-in branch and the wizard runs once. |
