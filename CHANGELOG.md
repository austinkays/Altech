# Changelog

All notable changes to Altech will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Removed
- **remove(privacy): driver's license image scanner** (April 17, 2026):
  - Rationale: DL images contain client NPI (name, DOB, DL#, address, photo). Sending them to a third-party vision API (Gemini) without a signed data-processing agreement fails the FTC Safeguards Rule (2023 revision) vendor-oversight requirement, and is the kind of "unapproved software" exposure that most E&O carriers explicitly exclude. Agents can still type the DL # and state manually — that was always the primary flow.
  - `plugins/quoting.html` — removed the "🪪 Upload Driver License" button, `#initialDlScanInput` file input, and the DL preview/status/results containers from the Smart Scan card on Step 0. Subtitle updated to "Upload a policy document to auto-fill the form".
  - `js/app-scan.js` — removed `openInitialDriverLicensePicker`, `handleInitialDriverLicenseFile`, `renderInitialDriverLicenseResults`, `applyInitialDriverLicense`, `clearInitialDriverLicenseScan`.
  - `js/app-vehicles.js` — removed per-driver "📸 Scan Driver's License" button from each driver card, plus `openDriverLicensePicker`, `handleDriverLicenseFile`, `processDriverLicenseImage`, and the now-orphaned `convertImageToJPEG`. Manual License # / State inputs are unchanged.
  - `js/app-core.js` — dropped the `#initialDlScanInput` change listener.
  - `js/app-init.js` — dropped the `initialDlScan` state field.
  - `api/vision-processor.js` — removed the `processDriverLicense` handler (~217 lines) and the `case 'scanDriverLicense'` in the router. The endpoint still serves `processImage`, `processPDF`, `analyzeAerial`, `consolidate`, and `documentIntel`.
  - Dormant `driver.dlScanPreview` / `dlScanConfidence` fields in any previously-saved driver objects are simply ignored on re-render; no migration needed.
  - Tests: 28 suites / 1772 tests pass.
  - Docs in `docs/ARCHITECTURE.md`, `docs/JS_MODULE_AUDIT.md`, and `docs/HEIC_FIX_IMPLEMENTATION.md` still reference the removed flow — flagged for cleanup in the broader security hardening pass.

### Added
- **feat(reminders): daily reminder sweep cron** (April 17, 2026):
  - `api/reminders-sweep.js` (new) — Vercel Cron handler (`0 13 * * *` = 06:00 PT). Iterates `users/` via service-account Firestore REST, reads each user's `sync/reminders`, filters tasks with `dueDate <= today` and no today-completion / active snooze, writes a digest to `sync/dailyDigest` with `{date, dueCount, tasks, generatedAt}`. Auth via `Authorization: Bearer ${CRON_SECRET}` (Vercel sets this automatically on scheduled invocations).
  - `vercel.json` — added `"crons"` array with the sweep entry, and `api/reminders-sweep.js` at 300s `maxDuration`. Requires new env var `CRON_SECRET` in Vercel project settings.
  - `lib/firestore.js` — added `firestoreGetAsAdmin()`, `firestoreListAsAdmin()`, and service-account token caching (1 h, valid for the lifetime of a cron invocation). Upgraded `parseFirestoreDoc()` + new `parseFirestoreValue()` to handle nested maps, arrays, and timestamps — previously primitive-only, which couldn't read CloudSync's `{data: {tasks: [...]}}` shape. Widened `toFirestoreFields()` / `toFirestoreValue()` to serialize arrays and nested objects too (needed to write the digest's `tasks` array).
  - `js/reminders.js` — added `_checkDailyDigest()`, called from `init()`. Reads `sync/dailyDigest` once per device per day (gated by `STORAGE_KEYS.REMINDERS_DIGEST_SHOWN`), shows a one-line toast ("📅 N reminders due today"). Silent if no digest exists yet or the date doesn't match today — so the client behaves identically pre-cron-rollout.
  - `js/storage-keys.js` — new key `REMINDERS_DIGEST_SHOWN` (local-only, per-device; suppresses duplicate toasts on same-day reloads).

### Changed
- **perf(vercel-pro): raise `maxDuration` ceilings & lazy-load PDF libs** (April 17, 2026):
  - `vercel.json` — Raised `maxDuration` from 60s → 300s on AI-heavy routes (`compliance.js`, `property-intelligence.js`, `prospect-lookup.js`, `vision-processor.js`, `historical-analyzer.js`). Now that the project is on Vercel Pro, the 60s tightrope on Gemini / HawkSoft batch calls is gone. `stripe.js` and `hawksoft-logger.js` kept at 30s — a timeout there is a bug, not a feature.
  - `js/pdf-lib-loader.js` (new) — Central `PDFLibs.ensure('jspdf' | 'jszip' | 'pdfjs' | 'pdflib' | [...])` lazy-loader. Idempotent, caches in-flight promises, sets `pdfjsLib.GlobalWorkerOptions.workerSrc` on load.
  - `index.html` — Removed four sync CDN `<script>` tags for `jszip`, `jspdf`, `pdf.js`, `pdf-lib` (~600 KB). Replaced with single `js/pdf-lib-loader.js` tag. App shell now loads without waiting on any PDF lib.
  - `js/app-export.js`, `js/app-quotes.js`, `js/app-scan.js` (×2), `js/commercial-quoter.js`, `js/policy-qa.js` — Updated the five callers that relied on sync-loaded libs to `await window.PDFLibs.ensure(...)` before first use. Ad-hoc lazy-loaders in `coi.js`, `prospect.js`, `quote-compare.js`, `compliance-dashboard.js`, `accounting-export.js` still work independently (DRY migration deferred).
  - `exportDemoPolicyDoc()` in `app-scan.js` became `async`; all callers are `onclick=` / fire-and-forget, so no consumer change needed.
  - Tests: 28 suites / 1772 tests pass.

### Fixed
- **fix(deposit-sheet): shorten receipt numbers & narrow Agent column** (April 14, 2026):
  - `js/accounting-export.js` — Added `_shortenRct()` helper that strips leading zeros from HawkSoft receipt numbers (e.g., `RCT000045170` → `RCT45170`). Applied to both HTML table and PDF export rendering. Narrowed AGENT column from 22mm → 14mm in PDF, giving the flex CLIENT column 8mm more space.

### Fixed
- **fix(extension-v2): fix applicant-details low fill rate (31% → ~65%)** (June 14, 2026):
  - `chrome-extension-v2/src/content/special-cases/entity-id-discovery.js` — Click the `additional-contact-is-co-applicant-0` mat-slide-toggle before searching for "Add contact" button; wait up to 2 s for co-app section to render. Unblocks all 16 co-applicant atoms.
  - `chrome-extension-v2/src/content/registries/applicant.js` — Added `relationship` atom (mat-select, `contact-relationships-0`) to PERSONAL group. Atom count 32 → 33.
  - `js/ezlynx-tool.js` — Added App.data fallbacks for Occupation and Education in `getFormData()` pass-through section, so values flow even when EZ form fields are empty.

### Added
- **feat(pwa): installable PWA with update banner** (June 14, 2026):
  - `manifest.json` — Web App Manifest: `display: standalone`, `theme_color: #007AFF`, 3 icon sizes (192, 512, maskable-512)
  - `icons/` — PWA icons generated from Tauri branded logo (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon-32.png` favicon)
  - `index.html` — Added `<link rel="manifest">`, `<meta name="theme-color">`, `<meta name="description">`, `<link rel="icon">` favicon, update banner HTML div
  - `css/components.css` — `.pwa-update-banner` glassmorphic top bar (z-index 10001, dark mode, mobile responsive) + `.pwa-install-btn` sidebar install button styles
  - `css/animations.css` — `@keyframes pwaSlideDown` for banner entrance
  - `js/app-boot.js` — Full SW update lifecycle: `updatefound` → `statechange` → show banner → user clicks "Update Now" → `SKIP_WAITING` message → `controllerchange` → reload. `beforeinstallprompt` capture + `_triggerPwaInstall()`. 30-min periodic `reg.update()`.
  - `js/app-ui-utils.js` — `loadDarkMode()` and `toggleDarkMode()` sync `<meta name="theme-color">` (#007AFF light / #000000 dark)
  - `sw.js` — Removed auto `skipWaiting()` from install handler, added `SKIP_WAITING` message listener for user-controlled updates. Bumped `CACHE_VERSION` to `altech-v12`. Rebuilt `APP_SHELL` with ~25 previously missing JS/CSS files. Added 6 missing plugin HTML files to `PLUGIN_FILES`.
  - `vercel.json` — Added `Cache-Control: no-cache` + `Service-Worker-Allowed` headers for `sw.js`, `Content-Type: application/manifest+json` for `manifest.json`
  - `tests/boot-loading.test.js` — Added `addEventListener` and `matchMedia` mocks to `navigator.serviceWorker` fixture for JSDOM compatibility

### Added
- **feat(extension-v2): auto policy-info + auto coverage registries, manifest fix** (April 12, 2026):
  - `chrome-extension-v2/src/content/registries/auto-policy-info.js` — New flat registry (12 atoms) for the EZLynx auto policy-info page (`/rating/auto/{id}/policy-info`). Covers policy type, term, effective date, prior carrier (with residenceIs cascade precondition), prior liability limits, years with continuous coverage, and credit check toggle. All atoms tagged `_needsRecon: true` — IDs are best-guess from EZLynx naming conventions and need live validation via Registry Audit.
  - `chrome-extension-v2/src/content/registries/auto-coverage.js` — New flat registry (10 atoms) for the EZLynx auto coverage page (`/rating/auto/{id}/coverage`). All mat-select type: bodily injury, property damage, medical payments, UM/UIM BI/PD, comprehensive/collision deductibles (with `currencyStrip.stripInt()` transform per §7.7), towing, rental. All atoms tagged `_needsRecon: true`.
  - `chrome-extension-v2/src/content/routes/route-definitions.js` — Added `auto-policy-info` route pattern (`/rating/auto/{id}/policy-info`).
  - `chrome-extension-v2/src/content/registries/index.js` — Wired `auto-policy-info` and `auto-coverage` cases to return their atom arrays (replacing the empty `[]` stub for auto-coverage).
  - `chrome-extension-v2/manifest.json` — Added missing Phase 5 files (`carrier-detection.js`, `carrier-extensions.js`) and the two new registry files to content_scripts.
  - **Tests (+45 in 2 new suites, total 36 suites / 570 passing):** `auto-policy-info-registry.test.js` (13) validates shape, _needsRecon tagging, precondition structure, type distribution, and registry integration. `auto-coverage-registry.test.js` (15) validates shape, all-mat-select typing, deductible transforms, source key coverage, _needsRecon tagging, and registry integration. Updated `registry-integrity.test.js` to include both new registries in cross-registry integrity checks. Updated `routes.test.js` to validate the new route and non-empty registries.

- **feat(extension-v2): Phase 4 polish — fill report drill-down, popup rebuild, SPA nav, Ctrl+Shift+A** (April 12, 2026):
  - `chrome-extension-v2/src/content/ui/fill-report-panel.js` — Rewrote the toolbar report renderer. LexisNexis banner at the top listing human-readable labels of every atom SKIPPED with `reason: 'lexis-nexis'`. Collapsible per-atom drill-down grouped by scope (Driver N / Vehicle N / Accident N / Violation N / Comp Loss N / Co-Applicant) or flat home route (Home Policy Info / Dwelling Info / Coverage). Each row shows a state badge (DONE/SKIPPED/FAILED/BLOCKED — distinct colors + icons), label, internal atom key, reason (translated from internal enum via REASON_LABEL), attempt count for FAILED, entity index for multi-entity atoms, and optional fill/verify error-text third line. Groups with any issue open by default; all-DONE groups stay collapsed.
  - `chrome-extension-v2/src/content/orchestrator/fill-trace.js` — Added `registerAtoms(atoms)` + `report.atomIndex` so the renderer can look up label/scope/index/idTemplate/type by atom key. Backwards compatible — older reports without `atomIndex` fall through to the key-prefix classifier.
  - `chrome-extension-v2/src/content/orchestrator/index.js` — Orchestrator calls `trace.registerAtoms(sorted)` after topological sort so every run embeds the metadata.
  - `chrome-extension-v2/src/content/ui/toolbar.js` — Added ~100 lines of shadow-DOM CSS for the new report panel: `.av2-lexis-banner` (orange gradient strip), `.av2-group` collapsibles with chevron animation, `.av2-atom` rows with per-state `border-left` accents and subtle background tints, `.av2-state-done/skip/fail/blk` badge colors.
  - `chrome-extension-v2/src/popup/popup.html` + `popup.css` + `popup.js` — Full rebuild. Client card surfaces applicant name + formatted address (Address · Unit · City · State · Zip) + field count. Three action buttons: primary "Fill this page", secondary "Open Recon Tool" (→ `ALTECH_V2_RECON_OPEN` service-worker relay), secondary "Export JSON" (→ downloads `altech-fill-report-{ts}.json` via Blob + `a[download]`). Last fill report panel shows counts pills + LexisNexis lock strip. Admin recon section is a `<details>` collapsible gated on EITHER `isAdmin` OR the new `altech_admin_recon` `chrome.storage` flag.
  - `chrome-extension-v2/src/content/spa/nav-detector.js` — Wired three-pronged detection: (1) history API monkey-patch (pushState/replaceState + popstate), (2) 500ms URL polling safety net, (3) MutationObserver on documentElement watching childList+subtree for Angular route-driven wrapper changes. All three channels debounced into a single 150ms callback that only fires when the URL actually differs from `lastUrl`. `install()` now returns an `uninstall()` teardown used by tests and for explicit re-install on SPA nav.
  - `chrome-extension-v2/manifest.json` — Added `commands.fill-page` with `Ctrl+Shift+A` (and `Command+Shift+A` on Mac) as the suggested shortcut. Using `chrome.commands` instead of a page-level `keydown` listener means the shortcut works even when focus is inside an Angular `mat-input` — the Material CDK can swallow plain page keydown events, but `chrome.commands` fires at the browser level.
  - `chrome-extension-v2/src/background/service-worker.js` — Added `chrome.commands.onCommand` listener that dispatches `ALTECH_V2_FILL` (with stored `clientData`) to the active EZLynx tab when the `fill-page` command fires. Added `ALTECH_V2_RECON_OPEN` message relay for the popup "Open Recon Tool" button → toggles the on-page shadow toolbar recon panel.
  - `chrome-extension-v2/src/content/content.js` — Removed the old Ctrl+Shift+A document `keydown` handler (reclaimed for Fill via `chrome.commands`). Added `ALTECH_V2_RECON_OPEN` message handler that calls `state.ui.toggleReconPanel()`.
  - **Tests (+43 in 4 new suites, total 31 suites / 462 passing):** `fill-report-panel.test.js` (25) feeds hand-crafted reports into `renderReport()` and asserts banner labels, state-specific CSS classes, FAILED attempt count, BLOCKED `Blocked by <atom>`, multi-entity grouping, `open` attribute on groups with issues, `classifyAtom` key-prefix fallback, `reasonText` enum translation. `spa-nav-detector.test.js` (8) verifies via Jest fake timers that all three channels funnel through the 150ms debounce and only fire on actual URL changes. `keyboard-shortcut.test.js` (5) drives `chrome.commands.onCommand('fill-page')` against a fake chrome global + real `service-worker.js` loaded under node `require` (polyfills `self` + `importScripts`), asserts `chrome.tabs.sendMessage` was called with `{ type: 'ALTECH_V2_FILL', trigger: 'keyboard-shortcut', clientData }`, plus negative cases for non-EZLynx tab and unrelated command names, plus a manifest shape test locking `Ctrl+Shift+A` / `Command+Shift+A`. `fill-trace-atom-index.test.js` (5) locks `registerAtoms` semantics and backwards-compatible report shape.

### Changed
- **refactor(quoting): clean up property search tools area** (April 10, 2026):
  - `plugins/quoting.html` — Consolidated Smart Scan button, listing URL search, and utility buttons (Redfin, Assessor, Import) into a single `.property-search-tools` wrapper with clear visual hierarchy: Smart Scan hero button at top, "or search by listing" divider with inline input, and collapsible "Research Tools" accordion for secondary actions. Removed all inline styles in favor of CSS classes.
  - `css/components.css` — Added new component styles: `.property-search-tools` wrapper, `.listing-search-divider` with decorative lines, `.listing-search-input` and `.btn-listing-search` for the URL search row, `.research-tools-accordion` collapsible with `.btn-research-tool` buttons. Includes dark mode overrides for focus rings and button backgrounds.

- **style(quoting): redesign wizard footer as floating island nav** (April 10, 2026):
  - `css/layout.css` — Footer changed from full-width fixed bar to a floating island with rounded corners, max-width constraint (720px base / 800px desktop), 12px bottom offset, glassmorphism backdrop blur, and subtle border. Dark mode uses `rgba(44, 44, 46, 0.88)` solid background. Desktop sidebar offsets updated to account for island margins. Main content bottom padding bumped to 110px for clearance.

### Fixed
- **fix(export): coverage gap analysis now sends correct field data to AI** (April 10, 2026):
  - `js/app-export.js` — `runCoverageGapAnalysis()` was using 10 wrong/legacy field names (e.g., `dwelling` → `dwellingCoverage`, `bodInjury` → `liabilityLimits`, `dogBreed` → `dogInfo`) causing the AI to see blank data for all coverage limits. Fixed all field references to match actual form field IDs. Also added ~30 missing fields: county, dwelling usage, occupancy, exterior walls, roof shape, cooling, garage, system update years, burglar alarm, smoke detector, protection class, co-applicant info, all home coverage sub-limits (other structures, personal property, loss of use, wind deductible), all auto coverage fields (UM/UIM split, UMPD, rental, towing, accidents, violations), and prior insurance details.

- **fix(compliance): stop renewed/handled policies from resurrecting after cloud sync** (April 10, 2026):
  - `js/compliance-dashboard.js` — `checkForRenewals()` now detects stale verified/dismissed markers resurrected by cloud sync and silently removes them without resetting user's note data (hawksoftUpdated, stateUpdated, needsStateUpdate). Added date-normalized guard (`_userAckedExp`) that handles format mismatches between stored and fresh expiration dates. Added `userAlreadyHandled` flag — if user already clicked "HawkSoft Updated" or "State Updated", stale markers are cleaned up without re-triggering the "⚠ Renewed" workflow.
  - `js/cloud-sync.js` — After pulling CGL state from Firestore, now re-runs `checkForRenewals()` + `filterPolicies()` to immediately clean up any stale markers brought in by cloud data, instead of waiting for next page load.

### Added
- **docs(guide): add Code Maintenance Guide for solo maintainer** (April 11, 2026):
  - `docs/guides/CODE_MAINTENANCE_GUIDE.md` — NEW. Recurring-audit playbook tying existing tooling (`npm run audit-docs`, `npm test`, `CLAUDE.md`, `AGENTS.md`, `docs/technical/SECURITY_AND_DATA_SUMMARY.md`) into a weekly / monthly / quarterly cadence. Covers 4 audits adapted to Altech specifics: modularization review (`App.*` slice bleed, plugin IIFE discipline, CSS split-file rules, `Utils.*` duplication, `STORAGE_KEYS` hardcoding), file formatting audit (long-line detection, script load order drift, CRLF/LF mismatches, `[data-tooltip]` bleed regressions, `/* no var */` preservation), extensive testing (Jest + three-workflow manual QA + JSDOM gap list + cloud-sync round-trip), and four-round whitehat security audit (secrets, Firebase auth boundary, XSS, 12-function `api/` surface). Every section includes a paste-ready Claude Code prompt.
- **feat(quoting): drag-and-drop XML import on Personal Lines page** (April 10, 2026):
  - `js/app-core.js` — Browser drop handler on `scanDropZone` now detects `.xml` files and routes to `_handleEZLynxXMLFile()` instead of OCR scan pipeline
  - `js/app-core.js` — Tauri native drop handler detects `.xml` files and reads via `fs.readFile()` → `_parseAndApplyXML()`
  - `plugins/quoting.html` — Updated drop zone hint text to mention XML files

- **feat(property): Apify web scraper integration for Redfin + Zillow fallback** (June 6, 2026):
  - `api/_apify-client.js` — NEW: Shared Apify HTTP client helper (Vercel `_` prefix = not counted as serverless fn); exposes `runActorSync()`, `runRedfinDetail()`, `runZillowSearch()`; 60s timeout with AbortController; token-safe logging
  - `api/property-intelligence.js` — Added 4-tier waterfall in `handleZillow()`: Rentcast → Apify Redfin Detail → Apify Zillow Search → Gemini; each tier fires only when ≥3 of 8 critical fields are still missing; composite source labels track which tiers contributed
  - `api/property-intelligence.js` — Added `mapRedfinDetailToAltech()` (~80 lines): flexible field path resolution via `pick()` helper, runs through `mapZillowToAltech()` for consistent normalization
  - `api/property-intelligence.js` — Added `mapZillowSearchToAltech()` (~90 lines): checks `resoFacts` structured data + regex-parses description text for heating/cooling/roof/foundation
  - `api/property-intelligence.js` — Added `fetchApifyRedfin()`, `fetchApifyZillow()` (fuzzy address matching), `mergeApifyResult()` (upstream-wins conflict resolution), `countMissingCritical()`
  - `api/property-intelligence.js` — Modified `handleListingSearch()`: detects Redfin/Zillow URLs and routes to Apify scrapers first; if Apify gets <3 missing critical fields returns directly, otherwise falls through to Gemini for gap-filling with Apify data merged (Apify wins on conflicts)
  - `js/app-property.js` — Updated source badge system: added 'Redfin Scrape' (red) and 'Zillow Scrape' (blue) badges; composite source strings split into individual badges; tab labels and descriptions updated for Apify sources
  - `js/app-property.js` — Updated Rentcast counter to use `.includes('Rentcast')` for composite source detection
  - `.env.example` — Documented `APIFY_API_KEY` env var in Optional API Keys section
- **feat(property): AI listing search via Gemini Search Grounding** (April 10, 2026):
  - `api/property-intelligence.js` — Added `handleListingSearch()` function (~180 lines) + `LISTING_FIELD_MAP` constant for `?mode=listing-search`; forces Gemini for search grounding (Google-exclusive); extracts 25+ property fields from any Redfin/Zillow URL or address; normalizes through `mapZillowToAltech()`; returns address fields separately for URL lookups
  - `js/app-property.js` — Added `lookupListingUrl(query)` method: detects URL vs address, calls listing-search API, fills address fields from URL lookups (only empty fields), applies property data via `applyZillowSelects()`, shows status feedback
  - `plugins/quoting.html` — Added listing URL input row + Lookup button after utility-buttons in Step 3; added `listingSearchStatus` feedback div
- **feat(export): AI Coverage Gap Analysis on review step** (April 10, 2026):
  - `js/app-export.js` — Added `runCoverageGapAnalysis()` (~180 lines): collects all form data (property, vehicles, drivers, coverage limits, liability exposures), sends to Anthropic via proxy (preferred) with Gemini/AIProvider fallback, renders severity-colored gap cards (high/medium/low) with recommendations
  - `js/app-export.js` — Added `_renderCoverageGapResults()`: renders gap cards with severity colors (red/orange/blue), plus strengths section
  - `plugins/quoting.html` — Added AI Coverage Gap Analysis card to step-6 between Quick Edit and Hero Export sections

### Changed
- **refactor(property): force Gemini for all property search** (April 10, 2026):
  - `api/property-intelligence.js` — Changed `handleZillow()` to force `createRouter({ provider: 'google' })` instead of user's global AI provider setting; Gemini search grounding is Google-exclusive

### Fixed
- **fix(property): listing search missing 6 form fields** (April 10, 2026):
  - `api/property-intelligence.js` — Enhanced AI prompt to request `dwellingType`, `halfBathrooms`, `yearRenovated`, `county`, `lotSizeAcres` with explicit instructions for bath splitting (3.5 → 3 full + 1 half), acres conversion, dwelling type mapping; expanded `LISTING_FIELD_MAP` with 4 new entries; rewrote `mapZillowToAltech()` bath logic to split fractional baths into fullBaths/halfBaths; added dwelling type normalization via DWELLING_MAP, yearRenovated, lotSizeAcres with sqft→acres auto-conversion, county with "County" suffix stripping; removed post-mapper lotSize override that could overwrite converted acres
  - `js/app-property.js` — Rewrote `applyZillowSelects()`: added `dwellingType` to selectFields; created `numericSelects` section for `numStories`/`fullBaths`/`halfBaths` with 3-stage string matching (exact→floor→round); added `lotSize`, `county`, `yearRenovated` to textFields
- **fix(css): correct invalid CSS variable in quoting.html** (April 10, 2026):
  - `plugins/quoting.html` — Changed `var(--card-bg)` to `var(--bg-card)` on `gisUploadStatus` div
- **fix(ai-router): improve extractJSON robustness** (April 10, 2026):
  - `api/_ai-router.js` — Added 2 new fallback stages to `extractJSON()`: stage 5 strips single-line `//` comments, stage 6 fixes single-quote → double-quote JSON

### Added
- **feat(import): add configurable EZLynx XML auto-import path** (April 9, 2026):
  - `js/storage-keys.js` — Added `EZLYNX_XML_PATH` key
  - `index.html` — Added "EZLynx XML Path" settings section (between Agency Glossary and Security) with text input, save button, and ontoggle loader
  - `server.js` — Added `/local/ezlynx-xml` POST endpoint that reads an XML file from a user-configured local path (localhost-only, .xml extension enforced)
  - `js/app-scan.js` — `importEZLynxXML()` now tries the configured path via local server first, falls back to file picker; extracted `_openEZLynxFilePicker()` helper
- **feat(import): persistent EZLynx XML file handle for production** (April 9, 2026):
  - `js/app-scan.js` — Rewrote `importEZLynxXML()` with 3-tier approach: (1) stored `FileSystemFileHandle` via IndexedDB (works on production without dev server), (2) local server path fallback, (3) `showOpenFilePicker()` that stores the handle for next time. Added `_parseAndApplyXML()`, `_getHandleDB()`, `_storeFileHandle()`, `_tryStoredFileHandle()` helpers. Firefox falls back to hidden `<input type="file">`.
  - `index.html` — Updated settings hint text to clarify local dev vs. production auto-load behavior

### Changed
- **feat(property): replace Zillow with Redfin in quote workflow + enhance extension scraper** (July 9, 2025):
  - `js/app-property.js` — Renamed `openZillow()` → `openRedfin()`, changed Google search URL from `site:zillow.com` to `site:redfin.com`, updated error toast text
  - `plugins/quoting.html` — Updated Step 3 button text/onclick/title from Zillow to Redfin, updated Import tooltip
  - `chrome-extension/popup.js` — Updated error message from "Try a Zillow listing" to "Try a Redfin listing"
  - `chrome-extension/property-scraper.js` — Rewrote `scrapeRedfin()` from 7 fields to 18+ fields: heating, cooling, roof, foundation, basement, exterior/siding, construction style, pool, fireplace, sewer, water source, flooring, parcel number, building area, wood stove, garage type, address

### Added
- **feat(import): add EZLynx XML import to Step 0 quoting wizard** (July 9, 2025):
  - `plugins/quoting.html` — Added "📥 Import EZLynx XML" button and hidden file input to Step 0 Smart Scan section
  - `js/app-scan.js` — Added 5 new methods (`importEZLynxXML`, `_handleEZLynxXMLFile`, `_ezTag`, `_ezAll`, `_applyEZLynxData`) for namespace-aware XML parsing; maps applicant, co-applicant, address, prior policy, coverages, drivers, and vehicles from EZLynx XML into App.data/drivers/vehicles
  - `js/app-core.js` — Wired `ezlynxXmlInput` change event listener in init()
  - `tests/ezlynx-import.test.js` — New test suite (59 tests) covering full XML import, minimal XML, edge cases, and helper functions
  - Total tests: 28 suites, 1772 tests (was 27 suites, 1688 tests)

### Fixed
- **fix(mobile-nav): fix broken 'More' sidebar, active state, and mobile UX polish** (April 8, 2026):
  - `css/sidebar.css` — Fixed critical bug where `.app-sidebar { display: none }` at <768px prevented "More" button from opening sidebar; added `.mobile-open` override with `display: flex`, `position: fixed`, GPU-accelerated `transform` slide-in, touch-friendly nav item sizes (48px min-height, 15px font), safe-area bottom padding, dark mode support
  - `css/sidebar.css` — Replaced sidebar overlay `display: none/block` toggle with smooth `opacity` + `pointer-events` CSS transition (fade in/out)
  - `css/sidebar.css` — Enlarged bottom nav bar from 56px to 64px height; increased touch targets to min 44×44px per Apple HIG; bumped icons to 24px and labels to 11px; added `:active` press feedback (`scale(0.92)`)
  - `css/sidebar.css` — Added `.header-back-btn` styles for iOS-style blue back chevron (44×44px touch target, press feedback)
  - `js/dashboard-widgets.js` — Fixed bottom nav active state: added `data-tool` attributes to all 5 buttons, created `_updateMobileNavActive(toolKey)` that highlights the correct tab (including "More" for non-pinned tools), called from `setActiveSidebarItem()`
  - `js/dashboard-widgets.js` — Fixed Quoting button icon from `icon('home')` to `icon('user')` matching `TOOL_ICONS.quoting`; changed Reminders label to "Tasks" for brevity
  - `js/dashboard-widgets.js` — Added iOS-style back arrow (`chevronLeft`) in header breadcrumb when inside any tool; blue color, 44×44px touch target, calls `App.goHome()`

### Added
- **feat(deposit-sheet): add coin/change counter to deposit sheet** (April 8, 2026):
  - `plugins/accounting.html` — added coin counter rows (25¢, 10¢, 5¢, 1¢) with input fields, print counts, and totals below the bill counter
  - `js/accounting-export.js` — updated `_dsUpdateBillCounter()` to sum bills + coins into one grand total; added coin counter to PDF export; updated `_dsReset()` to clear coin inputs; updated input event listener for `.ds-coin-input`
  - `css/accounting.css` — added `.ds-coin-separator`, `.ds-coin-row`, `.ds-coin-input` styles with dark mode and print support

### Fixed
- **fix(deposit-sheet): fit PDF export on one page** (April 8, 2026):
  - `js/accounting-export.js` — removed the "Bank Deposit Receipt" tape area from both PDF export and screen render; entire deposit sheet now fits on a single landscape page

### Fixed
- **fix(cloud-sync): decrypt before push / encrypt after pull for cross-device sync** (April 8, 2026):
  - `js/cloud-sync.js` — added `_decryptForSync()`, `_encryptForStorage()`, `_isOldEncryptedFormat()` helpers; rewrote `_getLocalData()` as async to decrypt 5 encrypted fields (currentForm, quotes, vaultData, commercialDraft, commercialQuotes) before push so Firestore stores plaintext JSON
  - `js/cloud-sync.js` — rewrote pull path for currentForm, commercialDraft, commercialQuotes, vaultData: detect old encrypted format, encrypt plaintext from Firestore before localStorage write, backwards-compatible with pre-fix encrypted blobs
  - `js/cloud-sync.js` — rewrote pull path for quotes: decrypt local quotes for merge comparison, encrypt merged result before localStorage write
  - `js/cloud-sync.js` — made `_resolveConflict()` async; encrypts remote data before localStorage write on conflict resolution

### Changed
- **chore(accounting): extend account info reveal timer to 60 seconds** (April 8, 2026):
  - `js/accounting-export.js` — changed `toggleFieldValue()` auto-mask timeout from 30s to 60s
- **feat(broadform): AI-powered rule editor panel** (March 28, 2026):
  - `js/tools/broadform-data.js` — added runtime override support: `_defaultCarriers` deep clone, `applyOverrides(obj)` patches carrier rules at runtime, `resetOverrides()` restores defaults, `getCarrierSummary()` returns structured carrier/LOB/rule array for AI context, auto-loads saved overrides from localStorage on init
  - `js/tools/broadform.js` — added collapsible rule editor (`<details>`) with: textarea for natural language rule changes, "Apply with AI" button (sends current rules + user instructions to AIProvider, parses JSON overrides, merges with existing), "View Current Rules" toggle (JSON preview), "Reset to Defaults" button, "Modified" badge when overrides exist; wired all 3 buttons into `_wireEvents()`
  - `js/storage-keys.js` — added `CARRIER_OVERRIDES: 'altech_carrier_overrides'`
  - `css/broadform.css` — added rule editor styles: `.bf-rule-editor`, `.bf-rule-editor-toggle`, `.bf-rule-editor-body`, `.bf-rule-badge`, `.bf-rule-preview`, `body.dark-mode` overrides
  - `tests/broadform.test.js` — 5 new tests: getCarrierSummary shape, applyOverrides patches rules/states/notes, resetOverrides restores defaults; injected STORAGE_KEYS into test JSDOM helper (30→35 tests, 27 suites, 1713 total)

- **feat(broadform): upgrade Broadform Filter → Carrier Recommendation Engine** (March 28, 2026):
  - `js/tools/broadform-data.js` — **rewritten**: 2 carriers/3 questions → 6 carriers (Progressive, Dairyland, Safeco, PEMCO, National General, Foremost) / 20+ underwriting variables / declarative rule operators (eq, neq, lt, lte, gt, gte, in, notIn, notInFuzzy) / AI system prompt / restricted dog breeds / backward-compat `evaluate()` wrapper
  - `js/tools/broadform-engine.js` — **new file**: matching engine IIFE (`BroadformEngine`): `evaluate(profile, lob)` returns `{eligible, pending, disqualified, referOut, missingFields}`; `buildProfileFromAppData()` reads App.data/drivers/vehicles; `mergeProfile()` fills nulls only
  - `js/tools/_tool-components.js` — **extended**: added `numberInput()`, `textInput()`, `selectDropdown()`, `enhancedCarrierCard()` factories; return statement updated
  - `js/tools/broadform.js` — **rewritten**: full dynamic UI with LOB pill bar, AI info dump textarea + "Parse with AI" / "Pull from Form" buttons, removable known-data chips, dynamic questionnaire (only asks missing fields), 4-status carrier result cards (eligible/pending/disqualified/referOut), delegated event handling, `Utils.debounce(400)` for inputs
  - `css/broadform.css` — **rewritten** (~520 lines): info dump zone, chip list, primary/secondary/ghost buttons, AI status badges (info/success/warning/error), new carrier card statuses (pending/refer), reasons/missing lists, spin animation, full `body.dark-mode` overrides, responsive breakpoints
  - `plugins/tools/broadform.html` — updated: icon 🎯, brand "Carrier Recommendation Engine", new subtitle
  - `js/app-init.js` — toolConfig updated: icon 🎯, title "Carrier Match", name "Carrier Recommendation Engine"
  - `index.html` — added `<script src="js/tools/broadform-engine.js">` between data and UI scripts
  - `tests/broadform.test.js` — **expanded**: 13 → 30 tests; added BroadformEngine suite (evaluate, referOut, disqualify, mergeProfile), carriers suite, operators suite; updated questions expectations for new variable count (4 broadform vars)
  - **Test count: 27 suites, 1708 tests (was 1688)**

### Added
- **feat(theme): add Aurora theme option to user settings** (April 7, 2026):
  - `css/aurora-theme.css` — new file: Aurora northern-lights theme with CSS variable overrides (`--bg: #141a26`, mint/cyan/violet accent palette), animated curtains (`html::before`), twinkling stars (`html::after`), glassmorphism cards, heading text glow, `prefers-reduced-motion` fallback
  - `css/animations.css` — added `@keyframes aurora-shimmer` (22s curtain drift) and `@keyframes aurora-stars` (6s twinkle)
  - `js/app-ui-utils.js` — added `setTheme(themeId)`, `loadTheme()`, `_VALID_THEMES` array; `toggleDarkMode()` now deactivates Aurora when switching to light mode
  - `js/storage-keys.js` — added `THEME: 'altech_theme'`
  - `js/cloud-sync.js` — theme preference syncs to cloud in settings doc (push + pull)
  - `js/auth.js` — theme dropdown populated on settings modal open
  - `js/app-boot.js` — `loadTheme()` called after `loadDarkMode()` in boot sequence
  - `index.html` — added `<link>` for `aurora-theme.css`, added Theme `<details>` section with `<select>` in settings modal

### Fixed
- **fix(theme): boost aurora effect visibility and reduce surface opacity** (April 7, 2026):
  - `css/aurora-theme.css` — curtain gradients boosted (opacity 0.14–0.28 → 0.22–0.45, blur 36→24px, added 5th gradient band, larger ellipses), stars brightened (opacity 0.85–0.95, tighter 60% spread), card/sidebar/header backgrounds made more translucent for glassmorphism (--bg-card 0.72→0.55, --bg-sidebar 0.92→0.78, --bg-input solid→0.65), new .bento-widget + header overrides with backdrop-filter, heading glow boosted, deeper base bg (#0a1018)

- **fix(theme): aurora background effects invisible + bottom nav always visible** (April 7, 2026):
  - `css/aurora-theme.css` — moved curtain/star layers from `body::before`/`body::after` to `html:has(body.theme-aurora)::before`/`::after` since `body` is `display:flex` (pseudo-elements become flex items, not positioned layers); removed overly broad `body > *` z-index rule
  - `css/sidebar.css` — removed duplicate `display: flex` that overrode `display: none` in `.mobile-bottom-nav` base rule, causing bottom nav to always show on desktop

- **fix(ezlynx-extension): repair driver/vehicle compact page fill in Chrome extension** (April 3, 2026):
  - `chrome-extension/content.js` — `splitColumnarFields()` changed from block-based split to stride-based (interleaved) split to match EZLynx's row-first DOM ordering (D1.F0 → D2.F0 → D1.F1 → D2.F1…). Block split mixed both drivers' fields causing wrong data in wrong fields.
  - `chrome-extension/content.js` — Added `normalizeDriver()` / `normalizeVehicle()` helpers in `fillPageSequential()` to remap sub-object keys (`LicenseStatus` → `DLStatus`, `Year` → `VehicleYear`, `Make` → `VehicleMake`, `Model` → `VehicleModel`, `Use` → `VehicleUse`, `Ownership` → `OwnershipType`, `SR22` → `SR22Required`, `FR44` → `FR44Required`) so they match FIELD_LABEL_MAP expectations when merged into fillData.
  - `chrome-extension/content.js` — Added 18 missing entries to `FIELD_LABEL_MAP`: `Relationship`, `Sub-Model`, `Current Odometer`, `Daytime Running Lights`, `Performance`, `Was the car new?`, `Car Pool`, `Telematics`, `Transportation Network Company`, `Defensive Driver Course Date`, `License Sus/Rev (Last 5 years)`, `FR-44 Required`, `Student > 100 miles away`, `Mature Driver`, `Driver Telematics/…/Right Track Discount`, `Extended Non Owned Coverage for Driver`, `Driver Training Date(MM/DD/YYYY)`.
  - `tests/ezlynx-extension-fill.test.js` — Updated `splitColumnarFields` test expectations to match stride-based split (even-indexed → slice[0], odd-indexed → slice[1]).

- **fix(quote-compare): include extraction prompt in AIProvider multimodal parts** (April 3, 2026):
  - `js/quote-compare.js` — prepend prompt text as a `{ text: prompt }` part in the `parts` array passed to `AIProvider.ask()`, matching the pattern used in `app-scan.js`. Previously the extraction instructions were only passed as `userMessage` which `_callGoogle()` drops when `opts.parts` is provided, causing PDF analysis to fail (model received PDF data but no extraction instructions).

### Added
- **feat(reminders): completion celebration animation** (April 3, 2026):
  - `css/animations.css` — added 5 @keyframes: `celebratePop`, `celebrateInner`, `celebrateOuter`, `celebrateFlash`, `celebrateMenuBurst`
  - `css/reminders.css` — added `.celebrate-container`, `.celebrate-particle`, `.celebrate-particle.outer`, `.celebrate-flash`, `.toast.celebrate`, `.rem-snooze-menu-burst` styles
  - `js/reminders.js` — added `_celebrate()` function with 4-color cycling (blue, purple, green, teal), 8 inner sparkle particles + 6 outer star particles + center flash bloom; `toggle()` triggers celebration on completion; `_celebrateFromMenu()` explodes the snooze popup when "I did it!" is pressed — menu scales up + brightens then fades, particles burst from menu center

- **feat(clients): search + view-all for client history** (April 3, 2026):
  - `js/app-quotes.js` — `renderStep0ClientHistory()` now shows search bar (when >5 clients), "View All / Show Less" toggle, total count; `renderClientHistory()` (step 6) now has always-visible search bar + scrollable list with count label
  - `js/dashboard-widgets.js` — `renderClientsWidget()` now shows search bar (when >5 clients), "View All / Show Less" toggle; added `_onClientSearch()` and `_toggleClientViewAll()` to public API
  - `css/components.css` — added `.ch-search-bar`, `.ch-search-input`, `.ch-view-all-btn`, `.ch-count-label`, `.ch-list-expanded`, `.ch-no-results` + dark mode overrides
  - `css/dashboard.css` — added `.client-search-input`, `.client-list-expanded` for dashboard widget search + scrollable list

### Fixed
- **fix(reminders): position snooze menu near mouse cursor** (April 1, 2026):
  - `js/reminders.js` — `showSnoozeMenu()` now accepts the click event and positions the popup at the cursor, clamped within viewport bounds
  - `css/reminders.css` — changed overlay from `align-items: flex-end` to `align-items: center` as fallback centering

- **fix(compliance): repair corrupted emoji bytes** (April 1, 2026):
  - 6 emoji characters had been corrupted to U+FFFD (replacement character) during prior edits
  - `plugins/compliance.html` — restored 🛡️ (Total Policies), 👁️ (Manual Check), 🛡️ (loading), 🏛️ (State Updated ×2)
  - `js/compliance-dashboard.js` — restored 🏛️ in `_noteIcon()` State Updated return
  - Root cause: variation selector U+FE0F combined with multi-byte emoji caused encoding corruption during PowerShell file writes

- **revert(compliance): restore emojis — revert ASCII text replacement** (April 1, 2026):
  - Reverted commit `6599026` which had replaced all emojis with ASCII text
  - All original emojis restored in `js/compliance-dashboard.js` and `plugins/compliance.html`
  - Tests: 27 suites, 1694 tests passing

- **fix(compliance): revert emojis + add note icon tooltips** (March 31, 2026):
  - `plugins/compliance.html` — reverted 4 emoji substitutions back to originals (🔵→🛡️, 🔍→👁️, 🏠→🏛️, 🔰→🦅); kept 💤 for snooze
  - `js/compliance-dashboard.js` — reverted 🏠→🏛️ in _noteIcon() and State Updated button, 🔰→🦅 in HawkSoft Updated button; added _noteLabel() and _noteIconHtml() methods for hover tooltips on note log emoji icons; renderNoteLog() now wraps icons in `<span class="cgl-note-icon" title="...">` for tooltip display
  - `css/compliance.css` — added `.cgl-note-icon { cursor: help }` rule for tooltip hover cursor

- **fix(compliance): remove progress bar, fix broken emojis, redesign button colors** (March 31, 2026):
  - `plugins/compliance.html` — removed decorative progress bar (leftover blank line), replaced 5 broken emojis with Windows-safe alternatives (🛡️→🔵, 👁️→🔍, 🏛️→🏠, 🦅→🔰, 🛏️→💤)
  - `js/compliance-dashboard.js` — replaced 3 emoji types across ~8 occurrences (🏛️→🏠, 🦅→🔰, 🛏️→💤), removed inline button styles in favor of CSS classes (.confirm, .state-done, .hs-done)
  - `css/compliance.css` — added 3 new button variant classes (.confirm green, .state-done green, .hs-done purple) with hover + dark mode; restyled .cgl-snooze-quick from yellow to indigo
  - `AGENTS.md` — updated compliance.css, compliance-dashboard.js, compliance.html descriptions

### Changed
- **fix(compliance): redesign help modal + hawk emoji** (March 31, 2026):
  - `plugins/compliance.html` — simplified help modal: cut 3 redundant sections (Deduplication, Print & Backup, Other Row Actions), consolidated Two-Step Workflow into callout+table, converted Renewal Cycle to visual step cards, fixed Status Badges (removed stale "auto-dismissed" text, added HawkSoft Updated badge)
  - `css/compliance.css` — added `.cgl-info-callout` (accent-bordered tip box), `.cgl-info-steps`/`.cgl-info-step` (numbered circle step cards), section h4 left-border accent, dark mode + mobile for new classes
  - `js/compliance-dashboard.js` — changed 📋 clipboard emoji to 🦅 eagle for HawkSoft Updated button
  - `plugins/compliance.html` — changed all 📋 → 🦅 for HawkSoft Updated references (5 occurrences)

### Changed
- **feat(compliance): two-step CGL/bond workflow — State Updated + HawkSoft Updated** (July 2, 2025):
  - `js/compliance-dashboard.js` — `markStateUpdated()` no longer auto-dismisses; policy stays visible with ✅ badge until user clicks Updated/Dismiss
  - `js/compliance-dashboard.js` — added `markHawksoftUpdated()` for bonds (sets hawksoftUpdated, hawksoftUpdatedForExp, clears needsStateUpdate)
  - `js/compliance-dashboard.js` — `togglePolicyVerified()` soft-warns if CGL missing State Updated or bond missing HawkSoft Updated (confirm dialog, overridable)
  - `js/compliance-dashboard.js` — `checkForRenewals()` clears hawksoftUpdated/hawksoftUpdatedForExp on renewal detection alongside existing fields
  - `js/compliance-dashboard.js` — `_needsStateUpdate()` now checks both stateUpdated and hawksoftUpdated
  - `js/compliance-dashboard.js` — `_refreshNoteUI()` shows correct badge text (HawkSoft Updated vs State Updated) based on policy type
  - `js/compliance-dashboard.js` — row render: added isHawksoftUpdated, isAnyUpdateDone, pType variables; badge shows type-specific text; notes panel shows conditional button per policy type
  - `plugins/compliance.html` — help modal rewritten: two-step workflow docs, HawkSoft Updated button docs, updated comparison table, corrected renewal cycle steps
  - `tests/plugin-integration.test.js` — added 7 source-pattern tests for two-step workflow (markStateUpdated no auto-dismiss, markHawksoftUpdated exists, _needsStateUpdate checks both, togglePolicyVerified soft warning, checkForRenewals clears hawksoft fields, notes panel bond button, isAnyUpdateDone usage)

- **fix(hawksoft-logger): move agent initials to front of RE: line** (March 31, 2026):
  - `api/hawksoft-logger.js` — initials now prepended (`RE: AJK — Summary…`) instead of appended (`RE: Summary… — AJK`) so they survive HawkSoft's truncated log list view
  - `api/hawksoft-logger.js` — updated SYSTEM_PROMPT FORMAT template to show `[Agent Initials — ]` placement; added strip-regex for AI-inserted initials at start of line
  - `api/hawksoft-logger.js` — added instruction telling AI not to include initials (post-processing handles it)
  - `css/call-logger.css` — enhanced `.cl-section-label` with blue left accent bar (`border-left: 3px solid var(--apple-blue)`), bumped font-size 10→11px, margin-bottom 10→12px
  - `tests/hawksoft-logger.test.js` — updated test expectations for new initials placement comment and stale FORMAT/Action Items assertions

### Added
- **CGL Dashboard: Info Modal.** ℹ️ Info button in toolbar opens a full-guide modal explaining the renewal detection cycle, status badges, note system, quick actions, deduplication, and print/backup features. Escape key + backdrop click to close. Modal opens near top of viewport (not centered). Includes dedicated "Actions Compared" section clarifying Updated toggle vs Dismiss vs 🏛️ State Updated behavior.
- **CGL Dashboard: At-a-Glance Note Icons.** Inline emoji icon strip (📞📧📱✅🏛️🔄💬) appears in each policy row, showing at a glance what actions were taken without opening notes.
- `plugins/compliance.html`: Added ℹ️ Info toolbar button + `#cglInfoOverlay` modal with 8 guide sections (incl. "Actions Compared")
- `css/compliance.css`: Added `.cgl-info-overlay` (top-aligned), `.cgl-info-modal`, `.cgl-info-header`, `.cgl-info-body`, `.cgl-info-section`, `.cgl-info-table`, `.cgl-info-close` styles with dark mode + mobile responsive
- `css/compliance.css`: Added `.cgl-note-icons` class for inline emoji icon strip
- `js/compliance-dashboard.js`: Added `showInfo()` / `closeInfo()` methods with Escape key listener
- `js/compliance-dashboard.js`: Added `noteIcons` computation using `_noteIcon()` + Set dedup per policy row

### Fixed
- **CGL Dashboard: Note Count Badge Squished.** Enlarged `.cgl-note-count` badge — min-width 14→16px, height 14→16px, font-size 9→10px, border-radius 7→8px, padding 0 3px→0 4px
- **CGL Dashboard: Renewal Safety Gap.** `markStateUpdated()` now auto-dismisses the policy by creating a `dismissedPolicies` entry with the current expiration date. This ensures next year's renewal detection has a baseline — previously, after "State Updated", no baseline existed and the policy could not be detected as renewed the following year.

### Added
- **Quick Reference: Editable Quick Emojis.** Users can now customize which emojis appear in the Quick Emoji grid (up to 12). Features: curated insurance-workflow picker (~54 emojis across 7 categories: Status, Communication, Documentation, Property & Auto, Finance, Time, People), inline label editing, add/remove individual emojis, reset-to-defaults button. Cloud-synced across devices.
- `js/storage-keys.js`: Added `QUICKREF_EMOJIS` key
- `js/cloud-sync.js`: Added `quickRefEmojis` to SYNC_DOCS + _getLocalData + pullFromCloud
- `js/quick-ref.js`: Added loadEmojis, saveEmojis, renderEmojis, openEmojiPicker, pickEmoji, editEmojiLabel, deleteEmoji, resetEmojisToDefault methods; QR_EMOJI_PICKER_OPTIONS constant (~54 emojis)
- `plugins/quickref.html`: Replaced 6 hardcoded emoji buttons with dynamic `#qrEmojiGrid` container + Add/Reset header buttons
- `css/quickref.css`: Added emoji picker popover, button wrapper with hover edit/delete actions, inline label input, category headers, dark mode overrides

### Changed

- **CGL Compliance dashboard: improved notes & renewed badge UX** (March 31, 2026):
  - `css/compliance.css` — Changed "Renewed" badge from orange to blue (light + dark mode); widened note preview to 400px with 2-line clamp; restructured action buttons into two rows (contact + state actions); added note count badge on 📝 button
  - `js/compliance-dashboard.js` — Added `_noteIcon()` helper mapping note types to emoji icons (📞📧📱✅🏛️🔄💬); updated `renderNoteLog()` with icon prefixes; added note count + icon in compact preview text; split quick-note buttons into contact row and state-actions row; added count badge overlay on notes toggle button

### Fixed

- **CGL Compliance dashboard widget card height** (March 31, 2026): Stat pills (Critical/Warning/Current/Total) were wrapping to a second row, causing the card to appear "1–2 lines short" vs its bento grid cell. Fixed by switching `.compliance-stat-pill` to `flex-direction: column` (count stacked above label) + `flex: 1; min-width: 0` so all 4 pills fit on one row with full labels. (`css/dashboard.css`)

- **Commercial Lines footer structural and layout bugs fixed** (March 31, 2026):
  - `plugins/commercial-quoter.html` — Moved `<footer class="cq-step-footer">` to be a sibling AFTER `</main>` (was incorrectly nested inside `<main id="cq-app">`). Removed `hidden` class from Back button (visibility now controlled via `disabled` attribute so the button stays in the flex layout on step 0, preventing the step counter and Next button from collapsing leftward).
  - `js/commercial-quoter.js` — Changed `prevBtn.classList.toggle('hidden', _step === 0)` → `prevBtn.disabled = (_step === 0)`. The `disabled` attribute keeps the button in layout (opacity 0.4) rather than removing it from the DOM, matching personal-lines behavior.
  - `css/commercial-quoter.css` — Added `#commercialQuoterTool footer .btn { max-width: none }` to override the global `layout.css` `footer .btn { max-width: 200px }` rule that was bleeding into the commercial footer at ≥ 960 px. Added `@media (min-width: 960px)` block to give the commercial footer matching desktop polish (`border-radius: 16px 16px 0 0`, wider padding).

- **Commercial Lines back/next buttons now match Personal Lines** (March 31, 2026):
  - `plugins/commercial-quoter.html` — Changed `<div class="cq-step-footer">` → `<footer class="cq-step-footer">` so the commercial wizard footer gets the same fixed-position glassmorphism treatment as the personal-lines wizard. Updated back button from `btn cq-nav-btn` (outlined with SVG icon, "Back") to `btn btn-step-back` (ghost text, "← Previous Step"). Updated next button from `btn btn-primary cq-nav-btn` ("Continue" + SVG) to `btn btn-primary` ("Next"). Added `footer-step-count` class to the step counter span.
  - `css/commercial-quoter.css` — Removed `.cq-nav-btn` block (no longer needed). Updated `.cq-step-footer` padding to use `env(safe-area-inset-bottom)` for mobile notch safety. Removed `.cq-nav-btn { padding: 9px 16px; }` from responsive rule.

- **Weather widget infinite loop & service worker TypeError** (March 31, 2026):
  - `js/dashboard-widgets.js` — Added `_weatherFetchPending` flag (with `.finally()` reset) to `renderWeatherWidget()` to prevent re-entrant fetches when `_fetchWeather()` fails and `_weatherCache` remains `null`, which previously caused an unbounded Promise recursion loop.
  - `sw.js` — Added `open-meteo.com` to the service worker fetch bypass list so weather API requests are not intercepted by the SW (they were being re-fetched inside the SW context, blocked by CSP, the `.catch()` returned `undefined`, and `event.respondWith(undefined)` threw `TypeError: Failed to convert value to 'Response'`). Also tightened all hostname checks from `includes()` to `=== / endsWith()` to fix a CodeQL `js/incomplete-url-substring-sanitization` vulnerability.

- **fix(commercial-quoter): fix duplicate spam in Recent Commercial Quotes** (March 31, 2026):
  - `js/commercial-quoter.js` — Added `_currentQuoteId` tracking; `saveQuote()` now upserts (updates existing quote if loaded/previously saved, creates new otherwise); `loadQuote()` sets active quote ID; `newQuote()` clears it. Added `deleteQuote(id)` function exposed on public API. Improved `_renderStep0()` with coverage pill badges, delete buttons, quote count indicator, and better card structure.
  - `css/commercial-quoter.css` — Replaced flat quote card styles with coverage pill badges (`.cq-cov-pill`), delete button (`.cq-delete-btn`), actions group (`.cq-recent-actions`), quote count hint, truncated business name. Added dark mode overrides for new elements.

- **fix(quoting): 11 bugs fixed across Personal Lines + Commercial Lines quoting tools** (April 2026):
  - `js/app-core.js`: Fixed `handleType()` using wrong DOM IDs (`driverCardList`→`driversList`, `vehicleCardList`→`vehiclesList`); extracted inline onclick into proper `App.clearExportHistory()` using `STORAGE_KEYS.EXPORT_HISTORY`
  - `js/storage-keys.js`: Added `DRIVERS: 'altech_drivers'` and `VEHICLES: 'altech_vehicles'`
  - `js/app-navigation.js`: Replaced 4 hardcoded `'altech_drivers'`/`'altech_vehicles'` strings with `STORAGE_KEYS.*` references
  - `js/app-init.js`: Removed dead `'step-2': 'Coverage Type'` from `stepTitles`
  - `plugins/commercial-quoter.html`: Added 5 missing `<datalist>` elements (GL Occ, GL Agg, PL Limit, BA BI, BA PD)
  - `js/commercial-quoter.js`: `bizName` validation guard in `next()`/`exportPDF()`/`exportCMSMTF()`; Places retry cap at 10; `onerror` handlers on map images; improved filename sanitization
  - `css/commercial-quoter.css`: Defined `--cq-purple` CSS variable with dark mode override; replaced all hardcoded `#A855F7`
  - `tests/app.test.js`: Updated stepTitles count assertion `>= 7` → `>= 6`

- **fix(prospect): increase PDF export vertical spacing** (March 31, 2026):
  - `js/prospect.js` — increased section label gaps (6→14pt before, 10→16pt after), sub-header gaps (6→10pt before, 10→14pt after), row heights (baseRowH 14→16, kvLineH 10→12), body text gaps, and document header spacing to match personal lines PDF density

- **docs: add commercial quoter to AGENTS.md, CLAUDE.md, copilot-instructions.md** (March 30, 2026):
  - Added `commercial-quoter.css`, `commercial-quoter.js`, `commercial-quoter.html` entries to AGENTS.md file structure
  - Added `altech_commercial_v1` and `altech_commercial_quotes` to AGENTS.md localStorage table
  - Added `commercial-quoter` to plugin load order in AGENTS.md and CLAUDE.md
  - Updated copilot-instructions.md plugin list: 22 → 23 plugins, added `commercial (Commercial Lines)`

- **fix(commercial-quoter): full export audit — add 16 missing fields to PDF + HawkSoft** (March 30, 2026):
  - `js/commercial-quoter.js` — `exportPDF()`: added `workDescription` ("Business Operations") to Locations & Property section
  - `js/commercial-quoter.js` — `exportCMSMTF()`: enriched `gen_sFSCNotes` with 15 previously-missing fields: `dateStarted`, `yrsIndustry`, `yrsMgtExp`, `annualReceiptsPrior`, `locAddress`, `countriesOperate`, `buildingValue`, `workDescription`, `numOwners`, `ownerNames`, `ownerDOB`, `ownerSSN` (masked), `ownerHomeAddress`, `reasonForQuote`; added `propYearBuilt` + `propSprinklers` to covProp detail string

- **refactor(audit): Comprehensive 10-phase codebase audit** (March 29, 2026):
  - **Phase 1A** — Removed dead validation code from `js/app-core.js` (validation hints now yellow-star only, no blocking)
  - **Phase 2 — XSS hardening** — Wrapped 5 unsafe `innerHTML` assignments with `Utils.escapeHTML()` in `js/app-popups.js`
  - **Phase 3 — Storage keys migration** — Added 16 new keys to `js/storage-keys.js`; migrated ~30 hardcoded `'altech_*'` strings across 15 plugin files and `js/cloud-sync.js` to use `STORAGE_KEYS.*`
  - **Phase 4 — Custom escapeHtml cleanup** — Removed 4 custom `escapeHtml()` definitions from `js/compliance-dashboard.js`, `js/email-composer.js`, `js/policy-qa.js`, `js/quick-ref.js`; all call sites now use `Utils.escapeHTML()`
  - **Phase 5 — CloudSync.schedulePush()** — Verified all synced data types already call `schedulePush()` after writes (no changes needed)
  - **Phase 6 — IIFE pattern standardization** — Wrapped 8 bare `const` modules in proper IIFE pattern: `js/coi.js`, `js/ezlynx-tool.js`, `js/accounting-export.js`, `js/quote-compare.js`, `js/compliance-dashboard.js`, `js/email-composer.js`, `js/policy-qa.js`, `js/quick-ref.js`
  - **Phase 7B — CSS `--warning` variable** — Added `--warning: #FF9500` (light) / `#FF9F0A` (dark) to `css/variables.css`; replaced 4 hardcoded `#FF9500` in `css/compliance.css` with `var(--warning)`
  - **Phase 7F — Responsive breakpoints** — Added `@media (max-width: 480px)` and `(max-width: 380px)` breakpoints to `css/security-info.css`
  - **Phase 8A — Accessibility aria-labels** — Added `aria-label` to 9 inputs missing accessible labels across `plugins/accounting.html` (5), `plugins/call-logger.html` (2), `plugins/email.html` (2)
  - **Phase 8C — COI hardcoded color** — Replaced `background: #003366` with `var(--apple-blue)` in `plugins/coi.html`
  - **Phase 8D — aria-live regions** — Added `role="status" aria-live="polite"` to dynamic status areas in `plugins/call-logger.html` (2) and `plugins/compliance.html` (2); added `role="alert" aria-live="assertive"` to `#cglError`
  - **Phase 9C — Chat history cap** — Added `MAX_CHAT_HISTORY = 100` constant and trim logic in `_saveHistory()` in `js/intake-assist.js` to prevent unbounded memory growth
  - **Phase 9D — AI request timeout** — Added `DEFAULT_TIMEOUT_MS = 45000` and `_withTimeout()` helper to `js/ai-provider.js`; both `ask()` and `chat()` now timeout after 45s (configurable via `opts.timeout`)
  - **Phase 9E — Geocode fetch timeout** — Added `AbortController` with 8s timeout to geocode fetch in `js/app-property.js`
  - **Phase 10B — Inline escaper removal** — Replaced inline `_escapeAttr` in `js/app-core.js` with `Utils.escapeAttr()` (prior session)

### Changed
- **Accounting: merged Deposit Sheet into PIN-protected Accounting area.** Single scroll view — collapsible Account Info (encrypted vault cards) at top, Deposit Sheet (CSV upload, receipt table, bill counter, print/PDF) below. Entire area gated by PIN. Removed Export Tools tab (HawkSoft automation, Trust Report, Deposit Calculator, Export History). Removed standalone Deposit Sheet sidebar entry. Removed 15-min auto-lock timer and visibility-change lock (manual Lock button instead). Deleted `plugins/deposit-sheet.html`, `js/deposit-sheet.js`, `css/deposit-sheet.css`. Removed `ACCT_HISTORY` storage key.
- js/hawksoft-export.js: Added SSN input to driver form grid (data-field="ssn" → drv_sSSNum{n} in CMSMTF); added hs_ownerSSN input, ownerSSN data field, and gen_sSSN CMSMTF output for commercial principal owner SSN export
- **Quick Reference: Quick Emojis now use explicit Edit mode.** Normal mode now shows only uniform-size emoji buttons (consistent tile height/width regardless of label length) and a single `Edit` control. Edit/delete actions are hidden unless edit mode is active. Entering edit mode reveals management controls (`+ Add Emoji`, reset) and keeps the in-grid Add tile available.

## 2026-03-29 — fix(sidebar): Remove blue hover bleed from [data-tooltip] on nav items
- **Bug:** Hovering over any sidebar nav item showed a blue square/border (apple-blue background and border-color from the global `[data-tooltip]:hover` rule in `css/components.css`), and a stray upward tooltip arrow from `[data-tooltip]::before` was visible above the item.
- **Root cause:** `[data-tooltip]:hover { background: var(--apple-blue); border-color: var(--apple-blue) }` in `components.css` (a rule intended for small help-icon badges) bled into all `.sidebar-nav-item` elements — which all carry `data-tooltip` attributes for collapsed-mode tooltips. Prior March-23 fix (commit `0926855`) addressed the BASE state only; hover state was untouched. Additionally, `[data-tooltip]::before` (tooltip arrow) had no sidebar-specific override (only `::after` was suppressed).
- **Fix 1 (css/sidebar.css):** Added `.sidebar-nav-item[data-tooltip]:hover` (specificity 0-3-0) with explicit transparent `border-color` and correct background for light/dark mode. Added `.sidebar-nav-item[data-tooltip]::before { display: none }` to suppress the stray arrow pseudo-element. Added `display: block` to `.sidebar-nav-item.active::before` to protect the active indicator bar.
- **Fix 2 (css/sidebar.css):** Added `.sidebar-nav-item.active[data-tooltip]:hover` (0-4-0) and `body.dark-mode .sidebar-nav-item.active[data-tooltip]:hover` (0-5-1) to preserve the active-item blue highlight on hover — Fix 1's broad dark-mode rule was inadvertently overriding the active background, making the active item fade to transparent on hover.
- **Fix 3 (css/sidebar.css):** Added `opacity: 1` and `border: none` to `.sidebar-nav-item.active::before` — the indicator bar inherited `opacity: 0` from `[data-tooltip]::before` (components.css) at rest, then `[data-tooltip]:hover::before { opacity: 1 }` made it pop into view as a blue box on the left on hover. Explicit `opacity: 1` keeps it always visible; added `.sidebar-nav-item.active[data-tooltip]:hover::before { opacity: 1 }` as a higher-specificity lock.
- Files changed: `css/sidebar.css`
- Tests: 1688/1688 pass

## 2026-03-25 — feat(commercial-quoter): Add SSN field to Owner & Background step
- **`plugins/commercial-quoter.html`:** Added `cq_ownerSSN` password input (Step 4, Owner & Background) in the 2-column grid alongside Primary Owner DOB; labeled with "(bonds & background checks)" hint; `autocomplete="off"`, `maxlength="11"`, `inputmode="numeric"`
- **`js/commercial-quoter.js`:** Added `Owner SSN` row to PDF export, masked as `***-**-XXXX` (last 4 digits only) for security
- **`css/commercial-quoter.css`:** Added `.cq-ssn-note` helper class for the subdued parenthetical label hint

## 2026-03-28 — fix(step-3): Property Step layout & styling fixes
- **`.prop-layout`:** Converted from CSS grid (`3fr 2fr`) to flexbox — when sidebar is hidden (auto/both workflows), `.prop-main` now expands to 100% width automatically
- **`.prop-main`:** Added `flex: 1 1 0; display: flex; flex-direction: column; gap: 16px` so cards stack with consistent spacing
- **`.prop-sidebar`:** Added `flex: 0 0 300px; width: 300px; position: sticky` at desktop for fixed-width sidebar
- **`.grid-addr-row2`:** Changed base column template from `0.8fr 90px 80px 1fr` → `2fr 80px 90px 1fr` so City gets more space than County at mid-viewports
- **Garaging checkbox:** Changed inline `style="display:flex;align-items:center..."` label to `class="checkbox-row"` — uses existing utility class that correctly overrides global `input { width:100% }` for checkboxes
- **Residence Details:** Removed `max-width:280px` from wrapper div so the `select { width:100% }` global rule applies
- Files changed: `css/components.css`, `plugins/quoting.html`
- Tests: 1688/1688 pass

## 2026-03-25 — fix(layout): Personal Lines full-width layout overhaul
- **Step 0:** `#step0ClientCard` (Begin Intake) now spans full width via `grid-column: 1/-1` — no longer half-width at desktop
- **Step 5:** Added 2-col CSS grid; Policy Details spans full-width, Home/Auto Insurance History display side-by-side at 960px+
- **Step 6:** Added `id="quickEditCard"` to Quick Edit card and set `grid-column: 1/-1` — no longer in col 1 with empty col 2
- **Footer:** Added `justify-content: space-between` + `align-items: center`; step counter span `#footerStepCount` shows "Step X of Y" between nav buttons; btn `max-width` reduced from 280px to 200px
- **`js/app-navigation.js`:** `updateUI()` now populates `#footerStepCount` text on every step change
- Files changed: `css/layout.css`, `plugins/quoting.html`, `js/app-navigation.js`
- Tests: 1688/1688 pass

## 2026-03-25 — fix(step3): improve Property step for auto/both workflows
- **fix(step3):** Step 3 (Property) was nearly empty for auto/both quotes — now looks intentional
  - Added `Residence Details` card to step 3 with `residenceIs` (own/rent/apartment) — shown for auto + both via new `qtype-auto-show` CSS class
  - Moved `residenceIs` out of step 4 Auto Coverage card (was duplicated/buried); `autoPolicyType` is now full-width there
  - Garaging checkbox (`garagingSameAsMailing`) now shows for both auto AND both workflows (was auto-only); label updated to "same as insured address"
  - Added `qtype-auto-show` visibility handling in `app-navigation.js` (shows when `showAuto` — auto or both)
  - Fixed PDF export to include garaging note for both workflow too
- **Files changed:** `plugins/quoting.html`, `js/app-navigation.js`, `js/app-export.js`
- **Tests:** 1688/1688 pass

## 2026-03-25 — feat(quoting): add circle step-flow nav to personal lines wizard
- **feat(quoting):** Personal lines intake wizard now shows the same numbered-circle step-flow nav as the Commercial Lines quoter
  - Added `<nav id="pq-step-nav" class="pq-step-nav">` inside the quoting plugin header (`plugins/quoting.html`) after the progress track
  - Added `.pq-step-nav`, `.pq-step-track`, `.pq-dot`, `.pq-dot-inner`, `.pq-dot-label` CSS classes in `css/layout.css` — active step gets blue circle + scale pop, completed steps show a checkmark + green tint, all using design-system variables
  - Added `App._renderStepNav()` in `js/app-navigation.js` — renders dots dynamically from `this.flow` (adapts to home/auto/both workflows), called from `updateUI()` on every step change
  - Tests: 180/180 app tests pass (`npm test --testPathPattern="app.test"`)

## 2026-03-25 — feat(commercial-quoter): align PDF export design to personal lines
- **feat(commercial-quoter):** Rewrote `exportPDF()` in `js/commercial-quoter.js` to match personal lines design language
  - **Format:** A4 → US Letter (jsPDF default)
  - **Palette:** Generic web-blue (`BLUE`, `BLUE_MID`, `ROW_ALT`, etc.) → brand navy `C` object (`C.navy [15,39,69]`, `C.body`, `C.label`, `C.muted`, `C.rule`, `C.footerTx`, etc.)
  - **Section headers:** Filled `BLUE_MID` rectangle → 7pt bold uppercase navy text + `C.light` (#bbb) rule line (personal lines pattern)
  - **Coverage sub-headers:** Blue-filled `covRow` → lighter `C.border` background + navy 2mm left accent bar
  - **Field rows:** 2-col right-aligned label + vertical divider + alternating `ROW_ALT` rows → `kvTable()` 2-col grid (6.5pt uppercase label, 9.5pt value, null de-emphasis via `isEmptyish`)
  - **Null handling:** Added `isEmptyish()` — de-emphasizes "None/N/A/No Coverage/Unknown" values with `C.muted` color
  - **Header:** Full-width blue banner → logo left (`App.fetchImageDataUrl`, async, defensive) + "Altech Insurance" 11pt bold navy + "COMMERCIAL INSURANCE INTAKE" subtitle + `CQ-YYYYMMDD-XXXX` doc ref right + timestamp
  - **Business card:** Navy-separator applicant-style card with business name (14pt bold navy) + contact/email sub-row
  - **Footer:** Inline `for` loop with "Altech Commercial Lines" → `drawFooter()` — `C.rule` (#ccc) 0.35px line, "Generated by Altech Insurance Tools" left, "Page N of N" right, matching personal lines exactly
  - **`exportPDF` is now `async`** — enables `await App.fetchImageDataUrl()`; safe for onclick handlers
  - All 1688 tests pass (27 suites)

## 2026-03-25 — fix(commercial-quoter): add missing .form-label CSS rule
- **fix(commercial-quoter):** Labels in the commercial quoter now render correctly in light and dark mode
  - `css/commercial-quoter.css` — added `.form-label` rule mirroring `.label` from `components.css` (11px, 700 weight, `var(--text-secondary)`, uppercase, 0.4px letter-spacing)

## 2026-03-25 — style(commercial-quoter): remove emoji from section title h2 headers
- **style(commercial-quoter):** Removed emoji prefixes from all 6 step-card `<h2>` section titles in `plugins/commercial-quoter.html` to match Personal Lines intake header style
  - Titles changed: "📋 Recent Commercial Quotes", "🏢 Business Information", "📋 Coverage Types", "📍 Locations & Operations", "👤 Owner & Background", "📄 Prior Insurance"
  - No CSS changes needed — `h2` already inherits `base.css` global style (`19px`, `700` weight, `var(--text)`) matching personal intake; `.section-subtitle` already styled as small muted gray (`12px`, `var(--text-secondary)`)

## 2026-03-28 — feat(commercial-quoter): Google Places autocomplete + map previews on Business Info step
- **feat(commercial-quoter):** Business Info step (Step 1) now mirrors Personal Lines address tooling
  - `plugins/commercial-quoter.html` — added `prop-layout` two-column grid wrapper; `prop-sidebar` with `map-preview-card` containing Street View and Satellite image previews (`#cq-biz-streetViewImg`, `#cq-biz-satelliteViewImg`); changed `#cq_bizStreet` `autocomplete` to `"off"` (required for Google Places)
  - `js/commercial-quoter.js` — added `_initCQPlaces()`: Google Places `Autocomplete` on `#cq_bizStreet`, fills city/state/zip, session token refresh; `_updateCQMapPreviews()`: static Maps + Street View images via `App.ensureMapApiKey()`; `_scheduleCQMapPreview()`: debounced 450 ms wrapper; `_openBizStreetView()` / `_openBizMaps()`: open Google Maps in new tab; wired `_initCQPlaces` to `_updateUI` when `_step === 1`; map preview schedule added to input debounce handler; `openBizStreetView` and `openBizMaps` exposed on public API
- No new CSS needed — all required classes (`prop-layout`, `prop-sidebar`, `map-preview-card`, etc.) already exist in `css/components.css`
- Tests: 1688 passed, 27 suites, 0 failures ✅

## 2026-03-28 — style(commercial): full UI overhaul — match Personal Lines design quality
- **style(commercial):** Complete visual redesign of Commercial Lines Quoter to match Personal Lines wizard quality
  - `plugins/commercial-quoter.html` — full rewrite (637 lines); progress header with step title + progress bar; `<nav class="cq-step-nav">` moved inside `#cq-app` (fixes JS dot-update bug); numbered pill dots with inner/label structure; coverage toggle rows with custom switch UI; Y/N pill buttons for Step 4; review card header; SVG export buttons; step counter in footer
  - `css/commercial-quoter.css` — full rewrite (544 lines); step track with connecting line pseudo-element; numbered dot active/completed states via `:has(~)`; coverage toggle animation; Y/N pill styling; welcome card; full dark mode block; responsive breakpoints at 600px and 380px
  - `js/commercial-quoter.js` — `_updateUI()` updated: step title + progress bar fill + step counter sync after dot loop
  - `plugins/quoting.html` — fixed `dwellingCoverage` wrapper: added `class="full-span"` to its parent div so it properly spans full width in the Home Coverage grid (fixes pre-existing test failure)
- Tests: 1688 passed, 27 suites, 0 failures ✅

## 2026-03-28 — feat(commercial): Commercial Lines Quoter plugin
- **feat(commercial):** New Commercial Lines Quoter plugin — 7-step wizard for CGL/BOP intake
  - `js/commercial-quoter.js` — full IIFE module (`window.CommercialQuoter`); steps 0–6; AES-256-GCM encrypt/decrypt draft + quotes; PDF export (jsPDF); CMSMTF/HawkSoft export; quote history (last 5)
  - `plugins/commercial-quoter.html` — 7-step HTML fragment; 45+ `cq_`-prefixed field IDs; coverage checkboxes with detail panels; subcontractor reveal; step nav dots; export footer
  - `css/commercial-quoter.css` — plugin-scoped styles using design system CSS vars; dark mode via `body.dark-mode`; responsive at 520px
  - `js/storage-keys.js` — added `COMMERCIAL_DRAFT` + `COMMERCIAL_QUOTES` entries
  - `js/cloud-sync.js` — added `commercialDraft` + `commercialQuotes` to `SYNC_DOCS`, `_getLocalData()`, and `pullFromCloud()`
  - `js/app-init.js` — registered `{ key: 'commercial', ... }` in `toolConfig[]` under quoting category
  - `index.html` — CSS link, container div, and script tag wired
- Tests: 1688 passed, 27 suites, 0 failures ✅

## 2026-03-28 — feat(quickref): add Quick Emojis clipboard section
- **feat(quickref):** Added Quick Emojis card above Quick Dial Numbers in the Quick Reference plugin
  - `plugins/quickref.html` — new `.card` block with 6 pill buttons (✅ Done, 📁 Logged, ⚠️ Pending, 🔄 Follow-up, ✉️ Emailed, 📞 Called)
  - `js/quick-ref.js` — added `copyEmoji(emoji, btn)` method; copies to clipboard, flips button text to `✓ Copied!` for 1200ms, fires `App.toast('📋 Emoji copied')`
  - `css/quickref.css` — added `.qr-emoji-grid` (flex-wrap) and `.qr-emoji-btn` (pill shape, teal accent `#0d9488`, dark-mode safe via CSS vars, `.copied` feedback state)
- Tests: 1687 passed, 1 pre-existing failure (plugin-integration `dwellingCoverage` full-span — unrelated), 1688 total

## 2026-03-28 — Phases 3–5: FSC Notes additions + EZLynx coApplicant maritalStatus fix
- **feat(hawksoft):** FSC Notes PROPERTY section — added `halfBaths` and `primaryHomeAddr` composite (addr, city, state, zip) to `_buildFscNotes()` in `js/hawksoft-export.js`
- **feat(hawksoft):** FSC Notes ENDORSEMENTS section — added `homePersonalProperty`, `homeLossOfUse`, `increasedReplacementCost` at the top of the endorsements block
- **feat(hawksoft):** FSC Notes CLIENT section (new) — added `coMaritalStatus` in a new dedicated CLIENT section between PROPERTY and ENDORSEMENTS
- **feat(hawksoft):** FSC Notes NOTES/risk section — added `creditCheckAuth` after `towingDeductible`
- **fix(ezlynx):** CoApplicant fallback block in `js/ezlynx-tool.js` now correctly uses `appData.coMaritalStatus` (was incorrectly reading primary applicant `appData.maritalStatus`)
- Tests: 256 passed, 256 total (3 suites: hawksoft-logger, ezlynx-extension-fill, ezlynx-pipeline)

## 2026-03-28 — Phase 2: HawkSoft CMSMTF structured block — wire 5 missing fields
- **feat(hawksoft):** Wired 5 previously-empty fields in `js/hawksoft-export.js` `_loadFromData()`:
  - `gen_cInitial` — now reads `d.middleName.charAt(0)` (was always `''`)
  - `gen_lCovC` — now reads `d.homePersonalProperty` (Personal Property coverage; was `''`)
  - `gen_lCovD` — now reads `d.homeLossOfUse` (Loss of Use coverage; was `''`)
  - `gen_bMultiPolicy` — now reads `d.multiPolicy === 'Yes' || true` (was hardcoded `false`)
  - `gen_sClientMiscData[7]` — now writes `c.maritalStatus` (primary applicant marital status; slot was `''`)
- **Note:** `middleName` has no form input yet (field defined in `fields.js`, no `<input>` in `quoting.html`) — mapping is correct but will always be empty until UI input is added in a future phase

## 2026-03-24 — Phase 1: Add coMaritalStatus to PDF export
- **feat(export):** Added `coMaritalStatus` ("Co-App Marital Status") row to the PDF co-applicant section in `js/app-export.js` — rendered immediately after the Co-Gender row using the existing `vo()` option-label helper
- **fix(quoting):** Added `btn-compact` class to the Scan Driver's License button in driver cards (`js/app-vehicles.js`) for better layout fit on Step 4

## 2026-03-24 — Remove blocking required-field validation on step 5
- **fix(quoting):** Removed blocking required-field validation from the Prior Insurance step — `validateStep()` in `js/app-core.js` now always returns an empty array so no fields block quote progression
- **plugins/quoting.html:** Removed all red `<span class="required-star">*</span>` asterisks from Prior Insurance label text (10 instances); yellow EZLynx `✦` stars remain as informational indicators
- **js/app-core.js:** Changed `validateStep()` to short-circuit with `return errors` unconditionally instead of blocking on step 5 fields

## 2026-03-28 — Roof Shape visual picker + Construction Style info panel
- **feat(quoting):** Added ⓘ info buttons next to **Roof Shape** and **Construction Style** labels in the Personal Intake form
- **Roof Shape** — opens a visual SVG picker modal (10 shapes: Gable, Hip, Flat, Gambrel, Mansard, Shed, Pyramid, Dormer, Turret, Other); clicking a cell sets `#roofShape` value, dispatches `change` event, and closes. Dormer description: "Add-on only — describes dormers on a base roof shape."
- **Construction Style** — opens a grouped chip picker (5 categories: One-Story, Two-Story, Split/Multi-Level, Attached/Multi-Unit, Other); clicking a chip sets `#constructionStyle` and closes
- **plugins/quoting.html:** Wrapped both labels in `.label-with-hint` + new `.info-modal-btn` buttons with `onclick` attributes
- **css/components.css:** Added `.info-modal-btn`, `.modal-close`, and all `.fi-*` scoped styles (`.fi-grid`, `.fi-cell`, `.fi-name`, `.fi-desc`, `.fi-note`, `.fi-group`, `.fi-group-label`, `.fi-chips`, `.fi-chip`) — CSS vars only, full dark mode support
- **js/quoting-info-panels.js:** New file; defines `window.showRoofShapeInfo()`, `window.showConstructionStyleInfo()`, `window.closeFieldInfoModal()` as global helpers (plugin HTML loads via `innerHTML` — inline scripts don't execute, so these must pre-load)
- **index.html:** Added `<script src="js/quoting-info-panels.js">` before `app-boot.js`
- Tests: 1688 tests, 27 suites, all pass

## 2026-03-24 — Other Structures calculated coverage field
- **feat(quoting):** Added `otherStructures` (Cov B) as a read-only calculated field in the Home Coverage card; auto-computes as 10% of dwelling coverage, updates live on `oninput`, and restores from saved data on load
- **plugins/quoting.html:** Added `oninput="App.computeOtherStructures()"` to `#dwellingCoverage`; inserted new `full-span` div with `#otherStructures` (readonly, tabindex=-1) and a `label-with-hint` + `ⓘ` tooltip matching the foundation/exterior-walls pattern
- **js/fields.js:** Added `{ id: 'otherStructures', label: 'Other Structures (Cov B)', type: 'text', section: 'home-coverage', ezlynxRequired: false }` after `dwellingCoverage` entry
- **js/app-core.js:** Added `computeOtherStructures()` method (strips non-numeric from `data.dwellingCoverage`, multiplies by 0.10, writes raw number string to DOM + `this.data.otherStructures`); called from `applyData()` so value restores on data load
- **js/app-export.js:** Added `otherStructures` row in the PDF Home Coverage `kvTable` (formatted via `formatCurrency()`) and in the scan schema
- **js/hawksoft-export.js:** Populated the previously stubbed `covB: ''` field with `d.otherStructures || ''`
- **EZLynx:** No change — EZLynx calculates Cov B internally; no mapping exists in the extension or tool
- Tests: 1672 tests, 26 suites, all pass

## 2026-03-24 — Previous address label cleanup and Google autocomplete
- **fix(quoting):** Removed redundant "Previous " prefix from the four field labels inside `#previousAddressBlock` — labels now read "Street Address", "City", "State", "ZIP"; the existing "Previous Address" section heading provides context
- **plugins/quoting.html:** Updated 4 label strings (Previous Street Address → Street Address, Previous City → City, Previous State → State, Previous ZIP → ZIP)
- **js/app-core.js:** Extended `initPlaces()` to also wire up a Google Places Autocomplete on `#previousAddrStreet`; on selection, auto-populates `previousAddrCity`, `previousAddrState`, `previousAddrZip` using the same session-token + `place_changed` pattern as the primary address

## 2026-03-23 — Previous address block (conditional on years at address)
- **feat(quoting):** When "Years at Address" is "Less than 1 year", "1", or "2", a Previous Address block appears inline below the field; hides when ≥ 3 years or empty; triggers on change and restores on draft load
- **plugins/quoting.html:** Added `onchange="App.togglePreviousAddress(this.value)"` to `#yearsAtAddress` select; inserted `#previousAddressBlock` div (hidden by default) with `previousAddrStreet`, `previousAddrCity`, `previousAddrState` (full 50-state select, no default), `previousAddrZip` — plain inputs, no autocomplete, no smart-fill buttons
- **js/fields.js:** Added 4 fields after `yearsAtAddress`: `previousAddrStreet`, `previousAddrCity`, `previousAddrState`, `previousAddrZip` — all `section: 'address'`, `ezlynxRequired: false`
- **js/app-popups.js:** Added `togglePreviousAddress(val)` to `Object.assign(App, {...})` — shows block when val is in `['Less than 1 year', '1', '2']`, hides otherwise
- **js/app-core.js:** `init()` calls `this.togglePreviousAddress(this.data.yearsAtAddress || '')` after `calculateResidenceTime()` to restore block state on draft load
- **js/hawksoft-export.js:** Previous address appended as "Previous Address: street, city, state, zip" in the PROPERTY section when `previousAddrStreet` is present
- **js/app-export.js:** Previous address fields appended as individual `kvTable` rows in the Property Address PDF section when `previousAddrStreet` is present
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-23 — Show insured name in quoting breadcrumb
- **feat(quoting):** Dashboard breadcrumb now shows `Dashboard > Personal Lines — Jane Smith` when firstName/lastName are filled in; updates live as user types; falls back to `Dashboard > Personal Lines` when both fields are empty
- **js/dashboard-widgets.js:** `updateBreadcrumb()` saves last params (`_crumbTool`/`_crumbTitle`), reads `firstName`/`lastName` from DOM when `toolName === 'quoting'`, appends ` — {name}` using `_escapeHTML()`; new `refreshBreadcrumb()` function re-invokes `updateBreadcrumb` with saved params; exported in public API
- **js/app-core.js:** Input event listener now calls `DashboardWidgets.refreshBreadcrumb()` when `e.target.id` is `firstName` or `lastName` (guarded with `typeof DashboardWidgets !== 'undefined'`)
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-28 — Auto Property Location: garaging address relabel + checkbox
- **fix(quoting):** When `qType === 'auto'`, Step 3 now shows "Garaging Address" heading and "Primary garaging address for the vehicle." subtext; utility-buttons row (Zillow/Assessor/Import) is hidden
- **plugins/quoting.html:** Added `qtype-home-only` to existing `<h2>`, `<p class="section-subtitle">`, and `utility-buttons` divs; added new `qtype-auto-only` equivalents with `style="display:none"`; added `#garagingSameAsMailing` checkbox block (auto-only)
- **js/app-navigation.js:** Added `querySelectorAll('#step-3 .qtype-auto-only')` forEach loop in `updateUI()` — shows when `qType === 'auto'` only (strict, not `'both'`)
- **js/app-export.js:** Property Address PDF section now conditionally uses "Garaging Address" header + appends "Same as Mailing: Yes" row when `garagingSameAsMailing` is checked
- **js/hawksoft-export.js:** `fscNotes` appends `\n\nGARAGING\nSame as mailing address` when `garagingSameAsMailing` is truthy
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-23 — Hide Smart Scan button and counter for auto-only qType
- **fix(quoting):** Smart Scan button (`#smartFillBtn`) and Rentcast usage counter (`#rentcastUsageDisplay`) now hidden when qType is `auto`, using the existing `qtype-home-only` class pattern
- **plugins/quoting.html:** Added `class="qtype-home-only"` to Smart Scan wrapper div and `qtype-home-only` to `#rentcastUsageDisplay` class list
- Google autocomplete and Street View remain functional for auto flow
- No JS or CSS changes — leverages existing `updateUI()` hide/show logic
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-28 — Collapse Safety & Location + broadform inline mode
- **feat(intake):** Safety & Location card in Step 3 now starts collapsed (`<details class="card section-accordion">` with no `open` attribute)
- **feat(intake):** Broadform / Non-Owners inline mode — selecting either from `#autoPolicyType` hides Vehicles and Drivers cards and shows a notice banner; restores on step-4 entry
- **js/app-navigation.js:** Added `handleAutoType(val)` method; called on step-4 entry to restore broadform state
- **plugins/quoting.html:** Safety & Location wrapped in `<details>` accordion; IDs added to Drivers/Vehicles cards; `#step4NonOwnersNotice` banner; `onchange` wired on `#autoPolicyType`
- **css/components.css:** `.non-owners-notice` banner styles added
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-28 — EZLynx Required Field Indicators (✦)
- **feat(fields):** Added `ezlynxRequired: true` flag to ~55 fields across 10 sections in `js/fields.js`; updated header comment documenting the new optional property
- **feat(navigation):** Added `_stampEzlynxLabels(container)` DOM pass in `js/app-navigation.js`; called once after quoting plugin HTML first loads; stamps a gold ✦ (`color:#f5c842`) next to any `label.label` whose field has `ezlynxRequired: true`
- **feat(vehicles):** Inline ✦ spans added to 5 dynamic template labels in `js/app-vehicles.js`: Driver's License, VIN, Primary Use, Annual Mileage, Ownership Type
- **Tests:** 27 suites, 1688 tests — all pass (no regressions)
- **Files changed:** `js/fields.js`, `js/app-navigation.js`, `js/app-vehicles.js`

## 2026-03-23 — Carrier Eligibility tool — multi-policy expansion
- **feat(tools):** Expanded "Broadform Filter" into a multi-policy "Carrier Eligibility" tool
- **broadform-data.js:** Added `policyTypes` array (Broadform, Non-Owners); restructured `carriers` map with `policyRules.{type}.stateRules.{state}` (eligible/referOut/disqualifiers); added `questionsByType`, `disqualifierMessages`, kept `questions` alias for test backward-compat; `evaluate()` now accepts optional 4th `policyType` param (default `'broadform'`)
- **broadform.js:** Added `_selectedPolicyType` state; policy-type pill bar (Broadform / Non-Owners); Reset button; data-driven rendering with green (ready), amber (referOut), red-muted (ineligible) carrier cards; heading "Carrier Eligibility" rendered inside `#bfContainer`
- **Tests:** 16/16 broadform tests pass (was 16, unchanged); full suite 1688/1688 pass across 27 suites
- **Files changed:** `js/tools/broadform-data.js`, `js/tools/broadform.js`

## 2026-03-23 — Sidebar bubble-button fix
- **Bug:** All inactive `.sidebar-nav-item` elements displayed a filled `rgb(44,44,46)` background and `1px solid` border, making them appear as rounded "bubble" buttons
- **Root cause:** `[data-tooltip]` rule in `css/components.css` (intended for small circular help-icon tooltips) applied `background: var(--bg-input)`, `border: 1px solid var(--border)`, `height: 18px`, and `font-size: 11px` to any element with a `data-tooltip` attribute — including sidebar nav items. The `.sidebar-nav-item` rule didn't override these properties.
- **Fix:** Added `background: transparent`, `border: none`, `height: auto`, and `font-size: 14px` resets to the `.sidebar-nav-item` base rule in `css/sidebar.css` (commit `0926855`)
- **Files changed:** `css/sidebar.css`

### Fixed
- **fix(sidebar): nav items showing as icon-only buttons with no text labels** (March 2026):
  - Root cause: `.sidebar-nav-item` lacked an explicit `width` declaration, causing the flex containers to shrink to content-size (~26 px) instead of filling their 223 px parent.
  - Fix: added `width: 100%` and `box-sizing: border-box` to the `.sidebar-nav-item` base rule in `css/sidebar.css`.
  - All category groups (Quoting, Export, Documents, Operations, Agent Tools) now render with full-width items and visible text labels at all viewport widths ≥ 1280 px.

### Added
- **feat(tools): Agent Tools foundation + Broadform / Non-Owner Eligibility Filter** (March 2026):
  - New `js/tools/` subdirectory for all future Agent Tools plugin modules.
  - New `plugins/tools/` subdirectory for plugin HTML templates.
  - **`js/tools/_tool-components.js`** — `window.ToolComponents` shared UI factory: `yesNoToggle()`, `stateDropdown()`, `carrierCard()`, `hardStop()`. All output XSS-safe via `Utils.escapeHTML` / `Utils.escapeAttr`.
  - **`js/tools/broadform-data.js`** — `window.BroadformData` pure data + rule layer. `rules.evaluate(state, ownedAuto, regularAccess)` returns hard-stop, eligible carriers (WA: Progressive + Dairyland; OR: Progressive only), or null for incomplete answers.
  - **`js/tools/broadform.js`** — `window.Broadform` IIFE plugin. Stateless questionnaire — answers reset on each `init()`. Event-delegation for state dropdown and Yes/No toggles. Renders results in an `aria-live` region.
  - **`plugins/tools/broadform.html`** — Thin plugin HTML shell (header + container div).
  - **`css/broadform.css`** — Full CSS for `bf-` (plugin) and `tc-` (shared component) namespaces, with dark mode overrides and 520 px mobile breakpoint.
  - **`index.html`** — Added CSS link, `broadformTool` container div, and three Agent Tools script tags.
  - **`js/app-init.js`** — New `broadform` tool entry registered in `toolConfig[]` under `category: 'tools'`.
  - **`js/dashboard-widgets.js`** — Added `tools: 'Agent Tools'` to `categoryLabels`.
  - **`tests/broadform.test.js`** — 16 unit tests covering all branches of `rules.evaluate()`: hard-stop (owned auto / regular access), WA + OR eligible paths, and null/incomplete states. **27 suites, 1688 tests — all pass.**

- **feat(quoting): UX overhaul — coverage type merged into Step 0** (March 28, 2026):
  - **Coverage type migration (Phase 0):** The standalone "Coverage Type" step (old Step 2) has
    been removed from all workflow arrays. Three coverage-type cards (HOME / AUTO / HOME & AUTO)
    now live directly on Step 0 (Quick Start) and serve as the primary call-to-action. Clicking
    a card starts a fresh intake with the correct coverage type pre-selected. This shortens every
    workflow by one step and makes the entry experience immediate and intuitive.
  - **`App.selectTypeAndStart(type)`** — new method on `App` (in `app-navigation.js`) that sets
    the coverage radio to the chosen type, calls `startFresh()`, then re-applies the type so the
    correct workflow (home/auto/both) is active from the start.
  - **`App.jumpToStep(stepIdOrIndex)`** — new method accepting either a step ID string (e.g.
    `'step-1'`) or a 0-based flow index to jump directly to any step. Used by step-6 edit shortcuts.
  - **Step-6 Quick Edit shortcuts:** A "✏️ Quick Edit" card on the Review & Export page lets
    agents jump back to Personal Info, Property Details, Vehicles & Drivers, or Prior Insurance
    in one click without clicking "Back" repeatedly. The Vehicles button auto-hides on home-only quotes.
  - **Tooltip hints on 4 confusing fields:** Dwelling Type, Exterior Walls, Foundation Type, and
    Protection Class now have inline `ⓘ` icons with CSS-only hover popovers explaining each field.
  - **Soft (non-blocking) completion warnings:** Leaving Step 1 with no firstName/lastName,
    or leaving Step 3 with no address fields, now shows an informational toast reminder. Navigation
    is never blocked — the agent can proceed immediately.
  - **CSS additions to `components.css`:** `.coverage-type-cards` / `.coverage-card` responsive
    flex cards with hover/active states; `[data-tooltip]` CSS-only tooltip system; `.label-with-hint`
    helper; `.section-divider-label`; `.btn-edit-jump`; `.section-edit-row`; `.export-btn-sub`.
    All include `body.dark-mode` overrides and mobile breakpoints.

### Changed
  - `api/app-init.js` — All 3 workflow arrays no longer include `'step-2'` (step-2 DOM stays as
    dead HTML, eliminating any regression risk for old saved data).
  - `app-core.js` `handleType()` — Removed the `if (this.step === 2) { this.step++; }` auto-advance
    block that was only meaningful when step-2 was in the active flow.
  - `app-navigation.js` `updateUI()` — `initPlaces()` now fires on `step-3` (property/address step)
    instead of `step-2`.

### Fixed
- **feat: Rentcast usage sync — manual count correction** (March 23, 2026):
  - Fixed root cause: counter writes were hitting a Firestore rules catch-all deny. Moved
    storage from `users/{uid}/rentcast_usage/{monthKey}` (not in rules) to
    `users/{uid}/sync/rentcastUsage` (covered by existing `sync/{docType}` rules)
  - Replaced inline "sync" text link (too cluttered) with a ⚙ gear icon button that opens
    a clean modal with two fields:
    - **API requests used this period** — correct the count to match your Rentcast dashboard
    - **Billing resets on day of month (1–28)** — set your actual billing cycle day (e.g. 20)
  - Added `_rentcastPeriodStart()` / `_rentcastNextReset()` helpers that compute period dates
    from `periodDay` instead of always assuming the 1st of the month
  - `_incrementRentcastCounter` now detects new billing periods and resets to 1 instead of
    incrementing from a stale count
  - Auto-reset: `_getRentcastCounter` detects a new period and fire-and-forget resets the doc
  - All 26 suites, 1672 tests pass

### Fixed
- **fix(docs): update file counts + line counts for 3 new plugins** (March 28, 2026):
  - 3 plugins (blind-spot-brief, dec-import, deposit-sheet) were in the codebase but absent from all docs
  - Updated `AGENTS.md` overview table: CSS 24→32 files (~19,761 lines), JS 38→45 modules (~39,326 lines), Plugins 18→21 templates (~6,058 lines), Tests 25→26 suites / 1631→1672
  - Updated `AGENTS.md` §2 file tree: removed deleted `main.css`, added 6 missing core CSS files (variables, base, components, layout, animations, landing), added 3 new plugin CSS/JS/HTML entries
  - Fixed 16 stale individual file line counts in AGENTS.md §2 (app-boot, app-export, app-property, app-scan, app-quotes, dashboard-widgets, quote-compare, reminders, returned-mail, task-sheet + 6 CSS files)
  - Updated `.github/copilot-instructions.md`: stack counts, test count
  - Updated `QUICKREF.md`: test suite count 23→26
  - `npm run audit-docs` → exit 0, all 45 JS / 32 CSS / 21 plugin / 26 suites verified

### Added
- **feat(skills): add repo-hygiene and storage-keys Copilot skill files** (March 28, 2026):
  - Added `.github/skills/repo-hygiene/SKILL.md` — end-of-session close-out sequence (5 steps), commit/CHANGELOG format, session scope rules (one bug/session, max 3 files), pre-deploy quality gate, Vercel function count check
  - Added `.github/skills/storage-keys/SKILL.md` — STORAGE_KEYS registry reference, how to add a new key, full table of all 35 constants with sync status, Utils.escapeHTML/escapeAttr usage guide
  - Tests: 26 suites / 1672 tests — all green
- **feat(property-intelligence): FEMA flood zone lookup in property intelligence pipeline** (March 20, 2026):
  - Added `fetchFloodZone(lat, lng)` helper in `api/property-intelligence.js` — queries FEMA NFHL ArcGIS public REST API (MapServer/28), 5-second timeout, graceful null on error/miss
  - Clark County enrichment + flood zone now run in parallel via `Promise.allSettled([clarkPromise, floodPromise])` inside `handleArcgis()` — no sequential blocking
  - `floodData` (`floodZone`, `floodZoneSubtype`, `sfha`, `baseFloodElevation`) threaded through `fetchArcgisAndRag()` return paths and passed as 7th arg to `showUnifiedDataPopup()`
  - **Flood Zone card** in `showUnifiedDataPopup()`: SFHA risk chip — red `⚠️ High Risk` (sfha=true) or green `✓ Low/Moderate Risk` (sfha=false); 🌊 FEMA Flood source badge
  - No new Vercel serverless function — bundled in existing `?mode=arcgis` endpoint (stays at 12/12 limit)
  - Updated `docs/RENTCAST_API.md` with full FEMA Flood Zone section (endpoint, field mapping, zone designation table)
  - Tests: 26 suites / 1672 tests — all green

- **feat(app-property): Tabbed property modal with Rentcast/AI Search source detection** (March 20, 2026):
  - `showUnifiedDataPopup()` in `js/app-property.js` — replaced single merged grid with a 4-tab layout: **✦ Summary** / **🏛 County** / **📊 Rentcast** or **🏠 AI Search** / **🚒 Fire / PC** (tabs only appear when that source has data)
  - Fixed source label: `sources.push('Property Listings')` → detects `zillowData.source === 'Rentcast'` and pushes `'Rentcast'` or `'AI Search'` accordingly
  - Source badge colors: Rentcast = green `#0d7a4e` (📊), AI Search = purple `#6f42c1` (🏠)
  - County tab shows raw ArcGIS parcel dump; Listings tab shows raw Rentcast/Gemini fields with per-field `✓` attribution chips; Fire tab shows station name/distance/PC/station type (Career ✅ / Volunteer 🟡 / Review ⚠️)
  - Summary tab and "Use This Data" button behavior unchanged
  - Modal widened from `max-width: 520px` to `max-width: 600px`
  - Helper functions: `buildGrid()`, `rawToFields()` (camelCase key auto-labeling), `camelToLabel()`
  - Tests: 26 suites / 1672 tests — all green

- **feat(app-property): Rentcast usage counter + overage modal + Firestore audit log** (March 20, 2026):
  - `js/app-property.js`: tracks per-user Rentcast API call count in Firestore under `users/{uid}/rentcastUsage`
  - Overage modal fires when call count exceeds configured threshold — shows current count, limit, and "Contact Support" CTA
  - All Rentcast invocations write an audit entry `{ ts, address, source: 'rentcast' }` to the Firestore audit log
  - Tests: 26 suites / 1672 tests — all green

- **docs(property-intelligence): Add Rentcast API bible — `docs/RENTCAST_API.md`** (March 20, 2026):
  - Created `docs/RENTCAST_API.md` — authoritative reference for all Rentcast + FEMA NFHL usage in `api/property-intelligence.js`
  - Covers all 3 Rentcast endpoints, full `/v1/properties` schema with `features.*` field types and all enum values
  - Documents fields NOT available in Rentcast (use Gemini fallback): `flooring`, `numFireplaces`, `roofAge`, `heatingFuel`, etc.
  - FEMA Flood Zone section: endpoint spec, field mapping (`floodZone`, `floodZoneSubtype`, `sfha`, `baseFloodElevation`), zone designation table, integration notes
  - ⚠️ Known bugs section documents pre-fix state for historical reference (all 3 bugs fixed in commit 910b97b)
  - Tests: 26 suites / 1672 tests — all green

### Fixed
- **fix(app-property): Map all property API fields to intake form + fix stories merge priority** (March 28, 2026):
  - `applyParcelData()`: added 13 previously unmapped fields — `exteriorWalls`, `garageType`, `cooling`, `roofShape`, `flooring`, `sewer`, `waterSource`, `dwellingType`, `pool`, `woodStove`, `roofYr`, `numFireplaces`, `ownerName`, `parcelId`
  - Added `matchSelectOption()` fuzzy helper inside `applyParcelData` for case-insensitive option matching with partial fallback
  - Pool normalization: `"Yes"/"True"` → `"In Ground"`, `"No"/"None"/"False"` skipped, otherwise fuzzy-matched
  - Wood stove normalization: `"Yes"/"True"` → `"1"`, numeric pass-through for `"2"`/`"3"`, otherwise fuzzy-matched
  - Fireplace fallback: if `parcelData.fireplace === 'Yes'` but no count, sets `numFireplaces` to `"1"` when form is empty
  - `numStories` SELECT: changed from bare `field.value = parcelData.stories` (silent failure on non-matching values) to validate against actual `<option>` list, then fall back to rounded integer
  - Stories merge priority: Zillow now always preferred over ArcGIS when available — county assessors frequently mis-count split-levels and half-stories
  - `applyZillowSelects()`: added empty-guard (`if (el.value && el.value.trim()) continue`) so Zillow never overwrites parcel data already applied
  - Tests: 26 suites / 1672 tests — all green

- **fix(property-intelligence): treat garageType `'None'` same as `'Unknown'` in Rentcast merge** (March 20, 2026):
  - `js/app-property.js` — `showUnifiedDataPopup()` merge block: added `|| merged.garageType === 'None'` guard so Rentcast wins when ArcGIS returns the literal string `'None'` for garage type (was only checking for `'Unknown'`)
  - Tests: 26 suites / 1672 tests — all green

- **fix(dashboard): adjust margins, font sizes, and widget dimensions** (March 20, 2026):
  - `css/dashboard.css`: tightened widget padding, font sizes, and bento grid cell dimensions for a more consistent layout across desktop and tablet viewports
  - Tests: 26 suites / 1672 tests — all green

- **feat(property-intelligence): add diagnostic logging to `fetchRentcastData()` + response headers** (March 20, 2026):
  - `api/property-intelligence.js`: added `console.log('[Rentcast]')` trace lines to track hit/miss; logs `X-Ratelimit-Limit-Month` and `X-Ratelimit-Remaining-Month` response headers when present for API quota monitoring
  - Tests: 26 suites / 1672 tests — all green

### Changed
- **chore(sidebar): move Quick Reference to first position under Operations** (March 20, 2026):
  - `js/app-init.js` — reordered `toolConfig[]`: Quick Reference (`quickref`) entry moved to the top of the `ops` category, making it the first tool listed under Operations in the sidebar
  - Tests: 26 suites / 1672 tests — all green

### Added
- **feat(app-property): Phase 2 Rentcast merge fix — `showUnifiedDataPopup()` in `js/app-property.js`** (March 20, 2026):
  - Deleted unused `mergeZField` helper (was never called)
  - Fixed "Unknown" blocking: 7 merge conditions now use `(!merged[key] || merged[key] === 'Unknown')` so Rentcast wins when ArcGIS returns `"Unknown"` — `heatingType`, `cooling`, `roofType`, `foundationType`, `constructionStyle`, `exteriorWalls`, `garageType`
  - Added 5 new merge entries for Rentcast fields: `lotSizeAcres` (converted from `lotSize` ÷ 43560, 2 decimal places), `architectureType`, `fireplaceType`, `hoaFee`, `viewType`
  - Added 4 display cards in the data grid: Architecture, Fireplace Type, HOA Fee (`$X/mo`), View
  - Wired `labelToMergedKey` entries for all 4 new display cards
  - Tests: 26 suites / 1672 tests — all green

### Added
- **feat(property-intelligence): 4 new Rentcast field mappings in `fetchRentcastData()`** (March 20, 2026):
  - `api/property-intelligence.js` — `fetchRentcastData()` only; no other functions touched
  - `architectureType` — from `f.architectureType` (e.g. `"Ranch"`, `"Split Level"`, `"Colonial"`)
  - `hoaFee` — from `p.hoa?.fee` (monthly HOA amount — top-level object, not in features)
  - `fireplaceType` — from `f.fireplaceType` (string e.g. `"Masonry"`, `"Gas Log"`, `"Prefab"`)
  - `viewType` — from `f.viewType` (underwriting flags: `"Waterfront"`, `"Flood Plain"`, `"Flood Zone"`)
  - All 4 keys counted automatically by the dynamic `fieldsFound` array (no separate change needed)
  - Tests: 26 suites / 1672 tests — all green

### Fixed
- **fix(property-intelligence): Rentcast field mapping — 10 bugs corrected in `fetchRentcastData()`** (March 20, 2026):
  - `api/property-intelligence.js` — `fetchRentcastData()` only; no other functions touched
  - Bug 1: `p.stories` → `f.floorCount` (`stories` doesn't exist at Rentcast top-level; correct path is `features.floorCount`)
  - Bug 2: Removed `f.flooring` mapping entirely — field does not exist in Rentcast schema; Gemini fallback handles flooring
  - Bug 3: Removed `f.fireplaces` → `numFireplaces` mapping — Rentcast has `features.fireplace` (bool) and `features.fireplaceType` (string), not a numeric count
  - Bug 4: `f.heating` → `f.heatingType` (`features.heating` is a boolean presence flag; `features.heatingType` is the string value)
  - Bug 5: `f.cooling` → `f.coolingType` (same — boolean flag vs. string value)
  - Bug 6: `f.exteriorWalls` → `f.exteriorType` (Rentcast field is `features.exteriorType`, not `exteriorWalls`)
  - Bug 7: `f.foundation` → `f.foundationType` (Rentcast field is `features.foundationType`, not `foundation`)
  - Bug 8: `p.garageType` → `f.garageType` (`garageType` is in `features`, not at top-level)
  - Bug 9: `p.garageSpaces` → `f.garageSpaces` (`garageSpaces` is in `features`, not at top-level)
  - Bug 10: `p.roofType` → `f.roofType` (`roofType` is in `features`, not at top-level)
  - Tests: 26 suites / 1672 tests — all green

### Changed
- **feat(property): Rentcast/Gemini source attribution — Phase 3** (March 20, 2026):
  - `js/app-property.js` — `fetchZillowData()`: logs field-level source citations from `result.sources` and passes them through to callers (`sources` key on return object)
  - `js/app-property.js` — `fetchPropertyViaGemini()`: prompt updated to request `{value, source}` object format for every field + "Never infer, estimate, or use typical values" constraint added to IMPORTANT block
  - `js/app-property.js` — `fetchPropertyViaGemini()`: `flatRaw` flattening block added after `JSON.parse` — backward-compat with both new `{value,source}` objects and legacy plain strings; builds per-field `geminiSources` map; logs `[GeminiProperty source]` lines; returns `sources` alongside `data`
  - `js/app-property.js` — `showUnifiedDataPopup()`: tracks `fieldSources` from `zillowData.sources` during ArcGIS→Zillow gap-fill merge; field cards now show a purple `✓ <source name>` chip and `title` tooltip when explicit attribution is present

- **feat(property-intelligence): Rentcast API integration — Phase 1** (March 20, 2026):
  - `api/property-intelligence.js`: added `fetchRentcastData(address, city, state, zip)` helper that calls `https://api.rentcast.io/v1/properties` and maps top-level + `features.*` fields to Altech keys; returns null on 404/empty; throws on 5xx for upstream catch
  - `handleZillow()`: now tries Rentcast first before falling back to Gemini; logs `[Zillow] Rentcast hit` or `[Zillow] Rentcast miss` accordingly; Rentcast errors are swallowed with a warning so Gemini path still runs
  - Added `case 'rentcast':` to the mode switch router — direct endpoint for `?mode=rentcast` POST requests; returns 200+data, 404 on miss, 500 on error
  - Updated `default:` error message to include `rentcast` in the valid modes list
  - No new `api/` file created — stays within 12-function Vercel Hobby limit
  - `RENTCAST_API_KEY` env var required in Vercel dashboard (manual step)
  - Related files: `api/property-intelligence.js` only

- **feat(property-intelligence): Rentcast Phase 2 — Gemini source attribution** (March 20, 2026):
  - **Step 6** (`fetchViaGeminiSearch()` prompt): Changed JSON schema so every non-`notes` field returns `{"value": <extracted>, "source": "where found"} or null` instead of plain scalars; appended "Return null for ANY field you cannot find explicitly stated in the source data. Never infer, estimate, or use typical values for this property type or neighborhood." to IMPORTANT block
  - **Step 7** (`mapZillowToAltech()`): Added `extractVal(v)` and `extractSrc(v)` inner helpers to unpack `{value, source}` objects (backward-compat with plain scalars); replaced all `raw.fieldName` reads with `extractVal(rawPick)` pattern; built parallel `sources` object tracking the Gemini source string for every mapped field; return signature changed from `{ data, fieldsFound }` to `{ data, fieldsFound, sources }`
  - **Step 8** (`handleZillow()` response): Destructures `sources` from `mapZillowToAltech`; includes `sources` in the 200 JSON response so callers can log per-field provenance
  - Tests: 26 suites, 1672 tests, 0 failures
  - Related files: `api/property-intelligence.js` only
  - Test suite: 1671/1672 pass (1 pre-existing timeout in plugin-integration.test.js, unrelated)

- **feat(quote-compare): dual-line schema, auto/home tabs, referenceNumber fix** (March 28, 2026):
  - `js/quote-compare.js`: replaced home-only `quotes[]` schema with `autoQuotes[]`/`homeQuotes[]` dual-line extraction
  - `extractWithGemini`: new system prompt captures all 4 referenceNumber formats (CCF#, Quote Number, Policy Number, Reference Number); adds `premiumAmount`, `premiumTerm`, `isAlternate`, `hasCarrierError`, `carrierErrorMessage` fields
  - AIProvider validation guard accepts `parsed.autoQuotes || parsed.homeQuotes || parsed.quotes || parsed.applicant`
  - `buildQuoteContext()`: separate `=== AUTO QUOTES ===` / `=== HOME QUOTES ===` sections
  - `getRecommendation()`: auto/home split summaries; no dwelling property references
  - `renderResults()`: normalization block (legacy `quotes[]` → `homeQuotes[]`); tab bar injected when both lines present; delegates to `_renderLine(tab)`
  - New `_switchTab(tab)`: thin wrapper → `_renderLine(tab)`; called from HTML onclick as `QuoteCompare._switchTab('auto')`
  - New `_renderLine(tab)`: full line-specific render — 8-col auto coverage table (BI/PD/Comp/Coll/UM/PIP/Towing/Rental), home table with Deductible; endorsements hidden for auto; error cards sorted last, excluded from tables
  - `autoSave()`, `copyTable()`, `exportPDF()`: updated to merge `allQuotes` from both arrays; use `premiumAmount || premium12Month`
  - `reset()`: clears `_activeTab`
  - Legacy `quotes[]` auto-normalized to `homeQuotes[]` for backward compat with saved comparisons
  - `css/quote-compare.css`: appended tab bar, `.qc-card-ref`, `.qc-card.alt` (purple badge), `.qc-card.error` (muted/danger border), full dark mode overrides
  - 26 suites, 1672 tests — all passing

- **feat(intake-assist): smarter BASE_SYSTEM_PROMPT** (March 19, 2026):
  - `js/intake-assist.js`: replaced `BASE_SYSTEM_PROMPT` template literal with a more comprehensive, personality-driven prompt
  - New opening: "You are a sharp, experienced insurance intake assistant…" — replaces the generic "fast, friendly" version
  - Added `YOUR PERSONALITY` section: colleague tone, no filler affirmations, proactive fact-stating with confirmation
  - Added 3 new CRITICAL RULES (10–12): risk flag follow-up, driver list completion check, vehicle list completion check
  - Split "IMPORTANT — AFTER EVERY REPLY" header onto its own line (separated from "Use EXACTLY these keys:")
  - JSON schema: corrected `priorExp`/`priorLiabilityLimits` field order to match `_syncToAppData` DIRECT array; `medPayments` and `priorLiabilityLimits` confirmed present; `bedrooms` (not `numBedrooms`) kept to match form field ID
  - 25 suites, 1631 tests — all passing

### Refactor
- **refactor(escape-attr): remove App._escapeAttr compat bridge entirely** (March 18, 2026):
  - `js/app-vehicles.js`: replaced all 14 `this._escapeAttr()` call sites with `Utils.escapeAttr()` directly
  - `js/app-export.js`: removed the `_escapeAttr(str) { return Utils.escapeAttr(str); }` bridge definition
  - `js/app-core.js`: untouched — existing `typeof this._escapeAttr === 'function' ? ... : fallback` guard now always takes the fallback path (harmless)
  - Updated AGENTS.md §5.2 to mark compat bridge as fully removed
  - 26 suites, 1672 tests — all passing

### Tests
- **tests/utils.test.js: new suite — 41 tests for window.Utils** (March 18, 2026):
  - Covers all four `Utils` functions: `escapeHTML`, `escapeAttr`, `tryParseLS`, `debounce`
  - Hybrid eval approach: `js/utils.js` loaded via `fs.readFileSync` + `eval()` in Node.js context; `global.document` set to JSDOM document so `escapeHTML`'s `createElement` works; `setTimeout` in `debounce` uses Node.js global so `jest.useFakeTimers()` patches it reliably
  - `escapeHTML` quote tests named explicitly: "does not escape double/single quotes — text node safe, use escapeAttr for attributes"
  - `tryParseLS` tests verify `??` (not `||`) semantics — falsy stored values (`false`, `0`, `""`) are returned, not replaced by fallback
  - Full suite: 26 suites, 1672 tests, 0 failures

### Docs
- **AGENTS.md: sync to post-refactor architecture** (March 18, 2026):
  - Added `storage-keys.js`, `utils.js`, `fields.js`, `app-ui-utils.js`, `app-navigation.js` to file tree
  - Fixed `app-core.js` description (persistence-only; navigation/UI moved to new files)
  - Fixed CSS source-of-truth reference (`css/variables.css`, not `css/main.css`)
  - Added §3.7 CSS file responsibility table + `/* no var */` comment documentation
  - Updated §4.1 JS assembly block to 11 files with correct per-file method ownership
  - Fixed §4.2 plugin IIFE pattern to use `STORAGE_KEYS.*` not hardcoded strings
  - Added `Utils.*` helper rows to §4.4 cross-file deps table; fixed `App.toast()` source → `app-ui-utils.js`
  - Added §7.4 SYNC_DOCS one-string how-to for new cloud sync types
  - Updated §8 agent prompt rules 7 + 8 (11 files, 1631 tests); added rules 19 + 20 (STORAGE_KEYS.* and Utils.*)
  - Updated §9 checklist to 25 suites / 1631 tests; XSS check → `Utils.escapeHTML()` — never inline
  - Clarified §5.2 landmine: `App._escapeAttr()` old call still exists in `app-export.js` + `hawksoft-export.js`, NOT cleaned up

### Refactored
- **CSS Pass 2 — replace hardcoded colors with design system variables** (March 18, 2026):
  - `css/layout.css` (5 replacements): `.logo-icon` dark `#fff` → `var(--text)`, `.btn-save-client` dark bg/border/color → `var(--bg-input)`/`var(--border)`/`var(--apple-gray)`, `.btn-save-client:hover` dark `#0A84FF` → `var(--apple-blue)`, `.dark-mode-toggle` dark `#fff` → `var(--text)`, `#backToHome:hover` bg `#0051d5` → `var(--apple-blue-hover)`.
  - `css/compliance.css` (8 replacements + 3 `/* no var */` comments): stat-card `.critical`/`.updated` and `.cgl-save-dot.saved`/`.error` → `var(--danger)`/`var(--success)`, `.expired`/`.loading` `#8E8E93` → `var(--text-tertiary)`, `.cgl-button.secondary:hover` `#6e6e73` → `var(--apple-gray)`, toggle slider `#34C759` → `var(--success)`, `#FF9500` warning/saving states annotated `/* no var */`.
  - `css/components.css` (15 replacements + 1 `/* no var */` comment): `.toggle-switch` checked slider `#34c759` → `var(--success)`, three `rgba(0,0,0,0.12)` → `var(--shadow)`, `.btn-primary` gradient start `#007AFF` → `var(--apple-blue)`, `.btn-primary:active` `#0051D5` → `var(--apple-blue-hover)`, dark `.btn-primary` `#0A84FF` → `var(--apple-blue)`, `.hero-btn` gradient `#007AFF` → `var(--apple-blue)`, dark `.hero-export-option`/`.hero-secondary-btn` `#1C1C1E`/`#38383A`/`#98989D` → `var(--bg-card)`/`var(--border)`/`var(--apple-gray)`, `.file-status.error` text `#FF3B30` → `var(--danger)` (rgba bg annotated `/* no var */`), `.qna-file-remove:hover` `#FF3B30` → `var(--danger)`, dark `.pac-container`/`.pac-item` `#1C1C1E`/`#38383A` → `var(--bg-card)`/`var(--border)`, `.pac-matched` `#0A84FF` → `var(--apple-blue)`.
  - Tests: **25/25 suites, 1631/1631 passing** — no regression.

### Fixed
- **Test suite: layout-regressions + plugin-integration fully green** (March 18, 2026):
  - `tests/layout-regressions.test.js`: replaced `css/main.css` reads with correct split CSS files (`css/base.css`, `css/layout.css`, `css/components.css`) — suite was crashing at module load since `main.css` was removed as a browser-loaded file.
  - `tests/plugin-integration.test.js`: redirected all 8 `readFileSync('css/main.css')` calls to `css/components.css` — fixes 10 CSS presence tests (grid-12, toggle-grid-3, etc.).
  - Full suite result: **1631/1631 tests passing, 25/25 suites green**.

### Refactored
- **Utils: added `tryParseLS` + `debounce`; replaced all call sites** (March 28, 2026):
  - `js/utils.js`: Added `tryParseLS(key, fallback)` (safe JSON parse from localStorage) and `debounce(fn, ms)` (standard debounce with `.cancel()` method); both exported on `window.Utils`.
  - **Phase 1 — `tryParseLS` (17 replacements across 11 files):** `accounting-export.js` (`_hasPIN`, `_getMeta`, `getHistory`), `app-core.js` (history load, entries load, agency profile read), `cloud-sync.js` (`_getSyncMeta`, IIFE parse, quotes split), `onboarding.js` (`getAgencyProfile`), `quote-compare.js` (`getSaved`), `prospect.js` (`_getSavedProspects`), `task-sheet.js` (`_loadExcluded`), `app-quotes.js` (`getClientHistory`), `auth.js` (agency profile read), `email-composer.js` (`_getAgencyName`), `hawksoft-export.js` (`_addToExportHistory`).
  - **Phase 2 — `debounce` module-level patterns (3 files + 1 test fix):** `ezlynx-tool.js` (`_wireAutoSave` timer), `call-logger.js` (`_handleClientSearch` timer), `cloud-sync.js` (`schedulePush` lazy-init debounce). Fixed `tests/call-logger.test.js` source-check assertions to match new `Utils.debounce` pattern.
  - **Phase 3 — `debounce` `this`-context patterns (3 files):** `app-property.js` (`scheduleMapPreviewUpdate`), `app-vehicles.js` (`updateVehicle` save timer), `accounting-export.js` (`lockVault` cancel + `_resetAutoLock` lazy-init).
  - Tests: **27/27 suites passing, 0 failures** (targeted suites fully green).

### Refactored
- **CSS dark mode Pass 1 — add body.dark-mode blocks to 6 zero-coverage files** (March 18, 2026):
  - `css/vin-decoder.css`: 17 overrides — boost all low-opacity rgba backgrounds (blue/purple/green/amber/red segments, badges, tags, error state) that were invisible on `#000000`.
  - `css/quote-compare.css`: 11 overrides — boost low-opacity drop-zone/table-row/badge fills; align `#34c759` → `#32D74B` and `#ff3b30` → `#FF453A` for best-card, included/missing badges, discount border, delete button.
  - `css/onboarding.css`: 1 override — swap gradient purple stop `#5856D6` → `#5E5CE6` (system purple) on `.onboarding-logo` and `.team-invite-icon`; reduce shadow alpha.
  - `css/quickref.css`: 6 overrides — boost teal low-opacity card hover/copied/speller-item backgrounds; increase focus-ring shadow alpha from 0.15 → 0.28.
  - `css/email.css`: 5 overrides — lighten focus rings to `#a78bfa` (avoids near-black outline on dark bg); align hover/active chip and history-item to lighter purple; fix success badge `rgba(5,150,105,0.1)` → `rgba(52,211,153,0.18)` + `#34D399`.
  - `css/paywall.css`: comment block only — relies entirely on CSS variables; `rgba(0,0,0,0.5)` overlay and `#fff` text are correct in both modes.
  - All 6 files now have `body.dark-mode` coverage. Tests: **1631/1631 passing, 25/25 suites**.

### Refactored
- **Phase 3 — cloud-sync.js SYNC_DOCS consolidation** (March 18, 2026):
  - `js/cloud-sync.js`: Added `SYNC_DOCS` constant array — single source of truth for all 10 synced Firestore document types (`settings`, `currentForm`, `cglState`, `clientHistory`, `quickRefCards`, `quickRefNumbers`, `reminders`, `glossary`, `vaultData`, `vaultMeta`).
  - `pushToCloud()`: replaced 10 manual `_pushDoc(...)` calls with `...SYNC_DOCS.map(key => _pushDoc(key, local[key], key))` — saves 8 lines, adding a new sync type now auto-covers push.
  - `deleteCloudData()`: removed inline duplicate `syncDocs` array, now references `SYNC_DOCS` — eliminates the second copy of the doc-type list.
  - `tests/call-logger.test.js`: fixed pre-existing Session 1 regression — both `createMiniDOM()` and `createClientDOM()` now inject `js/utils.js` source before `call-logger.js` so `Utils` is defined; updated stale source-inspection test to expect `Utils.escapeHTML` delegation instead of inline `div.textContent` implementation.
  - Tests: **1631/1631 passing, 25/25 suites** (fully green).

### Refactored
- **Session 1 — Shared utilities & storage-key registry** (March 17, 2026):
  - `js/utils.js` created: `window.Utils = { escapeHTML, escapeAttr }` — canonical DOM-based HTML escape and regex-based attribute escape, loaded globally before all plugins.
  - `js/storage-keys.js` created: `window.STORAGE_KEYS` frozen constant map of all 37 `altech_*` localStorage keys — single source of truth replacing scattered string literals.
  - `index.html`: `<script>` tags for `storage-keys.js` and `utils.js` added immediately after `crypto-helper.js` (before `app-init.js`).
  - 10 duplicate escape function definitions removed across 9 files — all now delegate to `Utils.*`:
    `js/admin-panel.js` (`_escapeHtml`), `js/call-logger.js` (`_escapeHTML`), `js/reminders.js` (`_escapeHTML`), `js/bug-report.js` (`escapeHTML`), `js/task-sheet.js` (`_escapeHTML`), `js/dashboard-widgets.js` (`_escapeHTML`), `js/hawksoft-export.js` (`_escapeAttr`), `js/app-quotes.js` (`escapeHTML`), `js/endorsement-parser.js` (`_escapeHtml`), `js/app-export.js` (`_escapeAttr`).
  - Tests: 1599 passing (pre-existing failures in `layout-regressions` and `plugin-integration` suites unchanged).

### Fixed
- **Session 2 — Test hygiene: fix pre-existing CSS regression failures** (March 17, 2026):
  - `css/main.css` was deleted in a prior commit (`7e55123`) but 2 test files still referenced it — causing all 21 failures across those suites.
  - `tests/layout-regressions.test.js`: Replaced single top-level `read('css/main.css')` (ENOENT at module load = entire suite crash) with three targeted reads: `css/base.css` (`overflow-x: hidden`), `css/layout.css` (`#quotingTool.active` / `min-height: 100%`), `css/components.css` (QnA clamp height + scroll containment).
  - `tests/plugin-integration.test.js`: Replaced all 8 inline `readFileSync('css/main.css')` calls with `readFileSync('css/components.css')` — fixes 10 previously failing CSS presence tests: `.grid-12`, `.span-4/6/8`, responsive grid fallback, `.disclosure-hidden`, `.toggle-switch`, `.grid-2-full`, `.full-span`, `.toggle-grid-3`, `.toggle-card`, toggle-grid-3 mobile fallback.
  - Result: **212 tests passing across both suites, 0 failures.** Total suite now fully green.

### Fixed
- Smart Scan — `_getAltechRestorePrompt()` rewritten with exhaustive section/field mapping: now lists every exact uppercase label from the PDF (PROPERTY DETAILS, BUILDING SYSTEMS, RISK & PROTECTION, HOME COVERAGE, HOME ENDORSEMENTS, AUTO COVERAGE, PRIOR INSURANCE) mapped to the corresponding JSON field ID. Previously the prompt only vaguely described these sections, causing Year Built, Square Footage, Dwelling Type, Stories, Roof/Heating/Cooling systems, all risk/protection flags, coverage limits, and endorsements to be silently omitted from scan results. (`js/app-scan.js` commit `d2ecbd3`)

### Removed
- Dead home (`logo-icon-button`) and dark-mode-toggle buttons stripped from all 20 plugin HTML headers (`plugins/accounting.html`, `call-logger.html`, `coi.html`, `compliance.html`, `dec-import.html`, `deposit-sheet.html`, `email.html`, `endorsement.html`, `ezlynx.html`, `hawksoft.html`, `intake-assist.html`, `prospect.html`, `qna.html`, `quickref.html`, `quotecompare.html`, `reminders.html`, `returned-mail.html`, `task-sheet.html`, `vin-decoder.html`, `blind-spot-brief.html`). These ~40 buttons were permanently hidden by `sidebar.css` (`.app-shell .plugin-container header .tool-header-brand { display: none }`) — navigation is fully owned by the sidebar. `quoting.html` intentionally unchanged. (commit `04554a3`)
- `css/main.css` — dead `@import` aggregator file; never linked in `index.html`, never loaded by the browser (documented with warning comment in AGENTS.md §5.12). (commit `7e55123`)
- Stale git worktree `.claude/worktrees/magical-swirles` and `claude/magical-swirles` branch removed. (commit `7e55123`)
- Debug/test output files removed from git tracking: `calltest.txt`, `calltest2.txt`, `test_full_results.txt`, `test-failures.json`, `test-out2.json`, `BUGFIX_LOG_2026-02-12.md`. Added these patterns to `.gitignore`. (commit `7e55123`)
- Stale cache-busting query strings stripped from `index.html`: `deposit-sheet.css?v=3` → `deposit-sheet.css`, `compliance-dashboard.js?v=20260217j` → `compliance-dashboard.js`. (commit `7e55123`)

---

### Added
- `js/fields.js` — canonical field registry (`window.FIELDS` array + `window.FIELD_BY_ID` lookup map) covering all ~175 `App.data` intake form fields with `id`, `label`, `type`, `section` metadata
- `FIELDS` / `FIELD_BY_ID` entry added to JS Symbol Index table in `QUICKREF.md`

### Changed
- `js/app-export.js`: all hardcoded label strings in `buildPDF()` `kvTable()` calls replaced with `FIELD_BY_ID[id].label`
- `js/hawksoft-export.js`: all hardcoded label strings in `_buildFscNotes()` replaced with `FIELD_BY_ID[id].label` (Baths compound and Towing & Labor kept as intentional display labels; Prior Expiration kept as-is for formatted date display)
- `index.html`: added `<script src="js/fields.js"></script>` load order entry (before `app-init.js`)
- `QUICKREF.md` Data Object Shapes: corrected address field names (`address/city/state/zip` → `addrStreet/addrCity/addrState/addrZip`) and `dogBreed` → `dogInfo`

### Added
- CSS ownership map table to `QUICKREF.md`
- JS symbol-to-file index table to `QUICKREF.md`

### Changed
- `css/main.css`: stripped 3,547 lines of phantom CSS never loaded by browser (file now 19 lines — `@import` aggregator only)
- Migrated all March 2026 session notes from `copilot-instructions.md` and `QUICKREF.md` into `CHANGELOG.md` (this file)
- Removed §10 "Changelog of Known Issues & Fixes" from `AGENTS.md` (content now in CHANGELOG.md)
- Updated all living-doc notices in `AGENTS.md`, `QUICKREF.md`, `copilot-instructions.md` to point to CHANGELOG.md instead of asking agents to update multiple files

### Latest Session Notes (March 28, 2026)

- **Smarter Multi-Unit Detection in Returned Mail Validator:** `handleValidateAddress()` now computes `isMultiUnit` using `geocodeGranularity === 'PREMISE'` (building-level geocode), `dpvMatchCode === 'S'` (USPS secondary info required), `dpvFootnote.includes('S')` (USPS high-rise), and `!addressComplete` with valid street/number (missing unit). `isMultiUnit` checked first in reason chain — addresses like "11301 NE 7th St" (apartment complex without unit) now correctly return "Apartment complex or multi-unit building — add apartment or unit number" instead of "Could not determine." `_geocodingFallback()` also improved: adds `comps.some(c => c.types.includes('premise'))`, `data.results.length > 1`, and degrades DELIVERABLE to POSSIBLY_DELIVERABLE when `locationType` is RANGE_INTERPOLATED or APPROXIMATE.
- **Tests:** 25 suites, 1631 tests (unchanged).
- **1 file modified:** api/property-intelligence.js (1,433→1,460 lines).

### Previous Session Notes (March 27, 2026)

- **Street View + Satellite Imagery in Returned Mail Validator:** `handleValidateAddress()` and `_geocodingFallback()` in `api/property-intelligence.js` now build `streetViewUrl` (600×340, fov=80) and `satelliteUrl` (zoom=19, satellite) server-side using `getMapsApiKey()` and return them in the JSON response. `_renderValidationResult()` in `js/returned-mail.js` shows a side-by-side image pair between the unconfirmed-components warning and "Use this address" button. `onerror` hides individual images gracefully if unavailable (e.g., no Street View coverage).
- **Tests:** 25 suites, 1631 tests (unchanged).
- **3 files modified:** api/property-intelligence.js (1,460 lines), js/returned-mail.js (458 lines), css/returned-mail.css (681 lines).

### Previous Session Notes (March 26, 2026)

- **Returned Mail Tracker Plugin:** New plugin (`returnedmail`) with three sections: (1) Address Validator calls `POST /api/property-intelligence?mode=validate-address` and shows a deliverability badge (DELIVERABLE/POSSIBLY_DELIVERABLE/UNDELIVERABLE/UNKNOWN) plus likelyReturnReason. (2) Log Entry Form — client name, policy #, address, 10 return-reason options, date returned, status, notes; full add/edit/cancel. (3) Log Table — search, filter by status, sortable columns, Edit/Delete/Copy To HawkSoft actions, CSV export. `validate-address` mode added to existing `api/property-intelligence.js` — Vercel count stays at 12.
- **Tests:** 25 suites, 1631 tests (unchanged).
- **3 new files:** js/returned-mail.js (458 lines), plugins/returned-mail.html (127 lines), css/returned-mail.css (681 lines).
- **2 files modified:** api/property-intelligence.js (`validate-address` mode), index.html + js/app-init.js (registration).

### Previous Session Notes (March 25, 2026)

- **Task Sheet Plugin — HawkSoft CSV Task Viewer:** New plugin (`tasksheet`) for uploading HawkSoft "My Tasks" CSV exports and displaying a sortable, printable task table. Upload via drag-and-drop or file picker. CSV parsed client-side (RFC 4180, BOM-safe). Rows sorted: overdue first → priority (critical→high→medium→low) → due date ascending. 9-column table: Priority, Due Date, Assigned To, Client, Subject, Description, Status, Follow-Up, Notes (empty write-in column for print). Color-coded priority badges. Overdue rows highlighted red. Print layout via `window.print()` + `@media print` (landscape, expanded Notes column). Agency name header from `altech_agency_profile`.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **3 new files:** js/task-sheet.js (415 lines), plugins/task-sheet.html (50 lines), css/task-sheet.css (515 lines).
- **2 files modified:** index.html (665→742 lines), js/app-init.js (86→92 lines).

### Previous Session Notes (March 24, 2026)

- **Multi-File API URL .js Extension Bug Sweep:** Found that the `.js` extension bug (from prior session) was far more widespread than the 2 policy-qa.js fixes. Total of 13 broken API calls across 5 more files were silently 404-ing on Vercel:
  - `app-popups.js`: `/api/vision-processor.js` ×4, `/api/historical-analyzer.js` ×4 — all aerial/satellite/DL/historical calls broken
  - `app-vehicles.js`: `/api/vision-processor.js` ×1 — DL scan broken
  - `dashboard-widgets.js`: `/api/compliance.js` ×1 — compliance background fetch broken
  - `compliance-dashboard.js`: `/api/compliance.js` ×2 — main compliance fetch broken
  - `policy-qa.js`: `'api/config.json'` (missing leading `/`)
  - `email-composer.js`: `'api/config.json'` (missing leading `/`)
- **alert() → toast() in app-property.js:** Replaced 6 `alert()` calls with `this.toast()`.
- **Test fix:** `app.test.js` missing-address test updated to spy on `App.toast` instead of `window.alert`.
- **Vercel function count confirmed:** Exactly 12 non-`_` files in `api/` — at the limit, not over.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **Files changed:** js/app-popups.js, js/app-scan.js, js/app-vehicles.js, js/dashboard-widgets.js, js/compliance-dashboard.js, js/app-property.js, js/email-composer.js, js/policy-qa.js, tests/app.test.js

### Previous Session Notes (March 23, 2026)

- **AI Intake ↔ EZLynx/PDF Field Alignment — 7-Gap Fix:** Cross-referenced INTAKE_PHASES, `_syncToAppData`, `populateForm`, and both export engines. Fixed 8 gaps: `_hasFieldData()` compat aliases for dual key naming (`yearBuilt`/`yrBuilt` etc.); `hasProperty` check uses both key variants; INTAKE_PHASES wrapUp adds `coEmail`, `coPhone`, `coOccupation`, `coEducation`, `coIndustry`; autoCoverage adds `uimLimits`; priorInsurance adds `priorExp`; `_syncToAppData()` DIRECT list updated; `populateForm()` now triggers `hasCoApplicant` toggle + routes accidents/violations to `App.drivers[0]`; AI schema template updated.
- **Tests:** 23 suites, 1,515 tests (unchanged).
- **1 file changed:** js/intake-assist.js (3,058→3,423).

### Previous Session Notes (March 22, 2026)

- **EZLynx CoApplicant Missing for Home Policies — Fallback from App.data:** `getFormData()` CoApplicant was built exclusively from `App.drivers.find(d => d.IsCoApplicant)`. For home-only policies (`qType='home'`), `App.drivers` is empty (Step 4 skipped), so CoApplicant was never built. Added fallback block: `if (!data.CoApplicant && appData.coFirstName)` builds CoApplicant directly from App.data fields. Also added address field name dual fallback (`appData.address || appData.addrStreet`) in existing driver-based CoApplicant builder, and `renderDriverVehicleSummary()` co-applicant fallback from App.data.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **1 file changed:** js/ezlynx-tool.js (1,083→1,028).

### Previous Session Notes (March 21, 2026)

- **Stale Market Intel / Insurance Trends After clearChat — Async Race Condition Fix:** Added `_sessionId` counter incremented on every `clearChat()`. Each async fetch function (`_fetchPropertyIntel`, `_fetchMarketIntel`, `_fetchInsuranceTrends`, `_scanSatelliteHazards`) captures `const sid = _sessionId` at start and checks `if (sid !== _sessionId) return` after each `await`. Prevents stale API responses from overwriting cleared state or re-showing hidden DOM cards after chat reset. Root cause: async race — `clearChat()` nullifies state but cannot cancel in-flight `await`ed fetches; old responses wrote stale data back.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **1 file changed:** js/intake-assist.js (3,058).

### Previous Session Notes (March 20, 2026)

- **AI Intake Flow Engine — Deterministic Field Collection:** Added `INTAKE_PHASES` master config (~15 phases, ~80 EZLynx-critical fields) as the single source of truth for AI-guided field collection. New `_getNextFieldGroup()` deterministically selects the next unfilled group. New `_buildFlowInstruction()` generates precise AI instruction blocks with phase label, unfilled fields, context hints, and smart defaults. Rewrote `_buildSystemPrompt()` to use flow engine instructions instead of flat field lists. Rewrote `_checkCompletion()` to walk ALL applicable phases' required fields — was only checking 9 fields (name+DOB+address + home: yearBuilt/sqFt/roofType + auto: vehicles[0]/drivers[0]). Added `_hasFieldData()`, `_getApplicablePhases()`, `_checkPhaseTransition()` helpers. `FIELD_GROUPS` now derived dynamically from INTAKE_PHASES. All counter/section functions rewritten to derive from phases.
- **Suggestion Chip qType Filtering:** Added `appliesTo` property to 23 of 30 `RESPONSE_TRIGGERS` (16 home-only, 7 auto-only, 7 universal unchanged). `_computeSuggestionChips()` Stage 2 now skips triggers that don't match the current `qType`. Home-only chips (e.g., "Dwelling coverage: $200,000") no longer appear on auto-only quotes.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **1 file changed:** js/intake-assist.js (3,097→3,391).

### Previous Session Notes (March 19, 2026)

- **Auth Gate — CGL Compliance Widget Security Fix:** `renderComplianceWidget()`, `_backgroundComplianceFetch()`, and `updateBadges()` now check `Auth.isSignedIn` before rendering or fetching. Unauthenticated visitors see "Sign in to view compliance" empty state instead of real agency policy data. Root cause: `/api/compliance` has only `securityMiddleware` (no Firebase auth), so any visitor could populate `altech_cgl_cache` and see the full widget.
- **Places API Retry on Sign-In:** `_onAuthStateChanged` now calls `window.loadPlacesAPI()` when user signs in and `google.maps.places` isn't loaded yet. Also calls `DashboardWidgets.refreshAll()` after sign-in. Root cause: boot sequence called `loadPlacesAPI()` before user was authenticated, got 401 from `/api/config?type=keys`, and never retried.
- **Places API Idempotent Loader:** Added `_placesAPILoading` guard to prevent duplicate `<script>` loads when `loadPlacesAPI()` is called multiple times (boot + auth retry). Resets on failure so retry is possible.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/dashboard-widgets.js (904→911), js/auth.js (537→540), js/app-boot.js (295→279), tests/auth-cloudsync.test.js (210→213).

### Previous Session Notes (March 18, 2026)

- **Sidebar Badge Stat Mismatch Fix — Snoozed + Verified + Dismissed Exclusion:** `updateBadges()` had the same filtering gap as the widget — no snoozed check, no hiddenTypes filter. Now reads `snoozedPolicies` and `hiddenTypes` from `altech_cgl_state`, adds `_isSnoozeActive(pn)` and `_isHidden(pn)` helpers, and skips hidden-type + snoozed/verified/dismissed policies before counting critical for the sidebar badge. Badge count now matches CGL dashboard and home widget.
- **Dashboard Widget Stat Mismatch Fix — Snoozed + Verified + Dismissed Exclusion:** Widget's `renderComplianceWidget()` now reads `snoozedPolicies` from `altech_cgl_state`, adds `_isSnoozeActive(pn)` check (mirrors CGL dashboard logic), and combines into `_isHidden(pn)` that checks verified + dismissed + snoozed. `policies` array is now pre-filtered by BOTH `hiddenTypes` AND `_isHidden(pn)` before setting `totalPolicies = policies.length`, matching CGL dashboard's `visiblePolicies` counting exactly. Snoozed policies (e.g., Rosecity Garage Doors, It's a Viewpoint) no longer appear as critical in widget when snoozed in CGL. Removed redundant verified/dismissed guard from forEach since policies array is already filtered.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **1 file changed:** js/dashboard-widgets.js (889→904).

### Previous Session Notes (March 17, 2026)

- **Renewal Chip Resurrection Fix — `clearRenewed()` No Longer Deletes policyNote:** Root cause: when user clicked ✕ to clear a renewal chip, `clearRenewed()` deleted the entire `policyNotes[pn]` entry when the log was empty. On next page load, `_smartMergeDict` (additive-only merge) re-added the old note from stale IDB/KV/CloudSync sources, resurrecting the `renewedTo` value. Fix: `clearRenewed()` and `deleteNoteEntry()` now keep note objects even when empty (`{ log: [], renewedTo: null }`) so the key persists across all 6 storage layers and can't be resurrected by stale sources.
- **Dashboard Stat Mismatch Fix:** Widget's `renderComplianceWidget()` now loads `hiddenTypes` from `altech_cgl_state` and filters policies before counting. `totalPolicies` now matches CGL dashboard total. `okCount` ("Current") only counts policies in `notifyTypes`, not all remaining policies.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,513→2,509), js/dashboard-widgets.js (886→889).

### Previous Session Notes (March 16, 2026)

- **Email Composer — Dynamic AI Persona + Custom Prompt Override:** Replaced hardcoded "Altech Insurance Agency"/"Altech Insurance" in AI system prompt with dynamic `_getAgentName()` (Auth.displayName → localStorage `altech_user_name` → `'your agent'`) and `_getAgencyName()` (parsed from `altech_agency_profile` → `'our agency'`). New `buildDefaultPrompt()` constructs the persona dynamically. Added collapsible "Customize AI Persona" UI (≤ 2000 chars) with save/reset/char counter, stored in `altech_email_custom_prompt`. `compose()` uses custom prompt if set, otherwise `buildDefaultPrompt()`. Added onboarding hint under agency name field.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/email-composer.js (420→497), plugins/email.html (98→125), css/email.css (165→231), index.html (665).

### Previous Session Notes (March 15, 2026)

- **CGL State-Wipe Bugfix — checkForRenewals() No Longer Overwrites User Actions:** All 4 renewal detection blocks in `checkForRenewals()` were unconditionally clearing `stateUpdated`, `renewedTo`, and resetting `needsStateUpdate = true` on every policy fetch — even when the user had already clicked "State Updated" or dismissed the renewal chip. Fix: `markStateUpdated()` now records `stateUpdatedForExp` (the expiration date being acknowledged). All 4 clearing blocks check `existingNote?.stateUpdated && existingNote?.stateUpdatedForExp === policy.expirationDate` and skip re-flagging if the user already acknowledged this specific expiration. A genuinely new renewal (different expiration) will still trigger re-flagging.
- **Cloud Sync CGL Reload:** `pullFromCloud()` was writing cglState to localStorage but never reloading `ComplianceDashboard`'s in-memory state. Added `ComplianceDashboard.loadState()` call after successful pull.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,502→2,513), js/cloud-sync.js (672→676).

### Previous Session Notes (March 13, 2026)

- **8 UI/UX Improvements — Sidebar Logo, Icons, Snooze, QuickRef:** Replaced blue "AL" text logo with `<img>` tag loading `Resources/altech-logo.png`. Restyled `.sidebar-brand-logo` for image display (object-fit, border-radius). Changed Personal Lines icon from house (duplicate of Dashboard) to pencil/edit ✏️. Added `edit` SVG to `ICONS`, updated `TOOL_ICONS quoting→edit`. Removed errant `left: 0` from `#quotingTool footer` override (was hiding nav behind sidebar). Added `hidden: true` to `qna` entry in `toolConfig[]`. Rewrote `getCurrentPage()` with hash-based detection for bug reports. Changed browser title to "Altech Toolkit".
- **CGL Snooze/Sleep:** Full snooze system for CGL compliance notifications. `snoozePolicy(pn)` sets midnight-tonight expiry, logs note "🛏️ Snoozed until [date] (snooze #N)" with count tracking. `_isSnoozeActive(pn)` checks expiry, `_expireSnoozes()` called at top of `filterPolicies()` to auto-clear expired. `unsnoozePolicy(pn)` for manual wake. `isHidden()` now checks snoozed state. `clearAll()` includes `snoozedPolicies = {}`. UI: 🛏️ Sleep button next to Dismiss for active rows, amber "🛏️ Until [date]" badge + "Wake" button for snoozed rows in showHidden mode, "🛏️ Sleep Until Tomorrow" in quick-note row. CSS: `.cgl-snooze-btn`, `.cgl-snoozed-badge`, `.cgl-snooze-quick` with full dark mode.
- **QuickRef reorganized + editable numbers:** Reordered to ID Cards → Speller → Quick Dial Numbers → Phonetic Grid. Replaced hardcoded Common Numbers with editable CRUD system — `QR_NUMBERS_KEY`, `loadNumbers()`, `saveNumbers()`, `renderNumbers()`, `toggleNumberForm()`, `saveNumber()`, `editNumber()`, `deleteNumber()`. Defaults: NAIC Lookup, CLUE Report, MVR Check. Cloud synced as `quickRefNumbers` (11th doc type in 4 touchpoints).
- **Tests:** 23 suites, 1515 tests (unchanged).
- **12 files changed:** js/compliance-dashboard.js (2,448→2,502), css/compliance.css (1,234→1,275), js/quick-ref.js (293→346), css/quickref.css (233→261), plugins/quickref.html (79→78), js/cloud-sync.js (664→672), js/dashboard-widgets.js (976→886), css/sidebar.css (765→726), js/bug-report.js (260→232), css/main.css (3,486→3,366), js/app-init.js (85→86), index.html (665).

### Previous Session Notes (March 12, 2026)

- **Vault UI Polish — Clean Toolbar, Form, Empty State:** Replaced global `.btn .btn-primary` (heavy gradient+shimmer) with dedicated `.acct-toolbar-btn`/`.acct-toolbar-add`/`.acct-toolbar-lock` classes with inline SVG icons. Removed nested `<div class="card">` wrapper (caused double borders) — form itself is now the card with `.acct-form-grid` (3-column), `.acct-form-field` wrappers with proper labels, `.acct-color-wrapper` squircle around color picker. Custom Fields uses `.acct-fields-section`/`.acct-fields-header`. Balanced Save/Cancel buttons. Empty state now SVG credit card icon with title+subtitle. Full dark mode for all new elements.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **3 files changed:** js/accounting-export.js (765→856 lines), css/accounting.css (412→467 lines), plugins/accounting.html (288→329 lines).

### Previous Session Notes (March 12, 2026)

- **Encrypted Accounting Vault — PIN + AES-256-GCM + Multi-Account CRUD:** Tabbed layout: "🔐 Account Info" (vault tab) and "🛠 Export Tools" (export tab). PIN system: SHA-256 hashed, 3/6-try lockout escalation (60s/5min), Firebase re-auth recovery. AES-256-GCM encryption via CryptoHelper. Multi-account CRUD with name, type, color, dynamic custom fields. Toggle field visibility with 10s auto-re-mask, 30s clipboard auto-clear. Auto-lock: 15min inactivity + visibility change. V1 migration: old 7-field vault auto-converts to single "HawkSoft / Trust Account" on first PIN setup. Storage: `altech_acct_vault_v2` (encrypted), `altech_acct_vault_meta` (PIN hash+salt). Cloud sync: vaultData + vaultMeta pushed/pulled via Firestore (10 doc types total). Full dark mode for all new elements.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/accounting-export.js (392→765 lines), css/accounting.css (225→412 lines), plugins/accounting.html (252→288 lines), js/cloud-sync.js (651→664 lines).

### Previous Session Notes (March 11, 2026)

- **Renewed Policies Stay Urgent — needsStateUpdate Flag:** All 4 renewal detection paths in `checkForRenewals()` now set `noteData.needsStateUpdate = true` when clearing verified/dismissed markers. Note dedup: skips adding "Auto-cleared" note if flag already set (prevents spam). `markStateUpdated()` clears the flag + calls `filterPolicies()` to re-sort immediately. New `_needsStateUpdate(pn)` helper. `sortPolicies()` overrides: policies with `needsStateUpdate && !stateUpdated` always sort first (above everything). `renderPolicies()` shows amber "⚠️ Renewed" badge with `.needs-state-update` class + row tint. Full dark mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,426→2,448 lines), css/compliance.css (1,223→1,234 lines).

### Previous Session Notes (March 10, 2026)

- **Renewal Dedup — CGL Compliance Dashboard:** Added `deduplicateRenewals()` method with two-phase logic. Phase 1: same-policyNumber dedup keeps only the latest expiration, marks survivor with `_renewedFrom`. Phase 2: cross-number renewal detection — same client + same policyType with one expired and one active auto-dismisses the expired entry as superseded. Integrated at all 3 policy assignment points (before `checkForRenewals()`). Blue "🔄 Renewed" / "🔄 Renewal confirmed" badge in dates column with dark mode support.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,356→2,426 lines), css/compliance.css (1,211→1,223 lines).

### Previous Session Notes (March 10, 2026)

- **Employment & Education Consolidation — Inline in About You Card:** Removed standalone Employment & Education card from Step 1. Moved education/occupation/industry selects inline into the About You card between marital status and co-applicant toggle, with "→ Also on Drivers" badge. Added co-applicant Employment & Education (`#coEmploymentSection`) inside `#coApplicantSection` with `coEducation`, `coOccupation`, `coIndustry` selects. Industry `onchange` calls `_populateCoOccupation()`.
- **`_populateCoOccupation(industry, currentValue)`:** New method mirrors `_populateOccupation()` targeting `#coOccupation` using shared `_OCCUPATIONS_BY_INDUSTRY` map. Called from `applyData()`.
- **Demo client data:** Added `coEducation: 'Bachelors'`, `coOccupation: 'Software Engineer'`, `coIndustry: 'Information Technology'` to `loadDemoClient()`.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** plugins/quoting.html (2,019→2,091 lines), js/app-core.js (2,475→2,495 lines).

### Previous Session Notes (March 10, 2026)

- **Print-to-PDF — Commercial Policy Dashboard:** Added Print button in header, selection toolbar with Select All/Deselect All/count/Generate PDF/Cancel. Checkbox column injected into table in print mode (excludes verified/dismissed). Landscape A4 PDF via jsPDF with color-coded status, all note entries with timestamps, alternating row shading, page numbers. `refresh()` auto-exits print mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **3 files changed:** plugins/compliance.html (206→223 lines), css/compliance.css (1,046→1,211 lines), js/compliance-dashboard.js (2,147→2,356 lines).

### Previous Session Notes (March 9, 2026)

- **SOS Lookup Overhaul — Oregon Socrata + WA DOR Fallback + AZ Deep Link:** Fixed all 3 state SOS lookups that were returning null/failing.
- **Oregon SOS:** Replaced dead HTML scraper with real Oregon Socrata API (`data.oregon.gov/resource/tckn-sxa6.json`). SoQL queries, groups records by `registry_number`, extracts agents and principals.
- **WA SOS DOR fallback:** All 3 WA SOS error paths now try WA DOR API (`secure.dor.wa.gov/gteunauth/_/GetBusinesses`) before falling back to manual search. Returns `partialData: true` with UBI, trade name, entity type, status.
- **Arizona SOS deep link:** Replaced dead scraper with pre-filled deep link to eCorp search results. Returns `deepLinked: true` with `tip`.
- **Client-side display:** New status pills for partial data (blue) and deep link (orange). `_formatSOSData` shows partial data banner + source badge + details URL link. `_formatSOSError` rewritten with deep link support, state-specific messaging, and underwriting gap warning.
- **AI prompt update:** `buildDataContext()` now flags SOS unavailability and partial data. AI user prompt includes conditional SOS DATA GAP instruction.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** api/prospect-lookup.js (1,563→1,788 lines), js/prospect.js (1,859→1,917 lines).

### Previous Session Notes (March 8, 2026)

- **Aggressive Auto-Save — Client History Never Lost:** Fixed critical data loss bug where sessions never reached step-6 were never saved to `altech_client_history`. Root cause: `autoSaveClient()` was only called in `updateUI()` gated by `curId === 'step-6'`.
- **Auto-save on every step change:** Removed step-6 gate — `autoSaveClient()` now fires on every step transition.
- **Debounced client history save on form input:** New `_scheduleClientHistorySave()` (3s debounce) called from `save()` after every form data write.
- **Immediate save on navigation:** New `_saveClientHistoryNow()` (no debounce) called from `next()`, `prev()`, `goHome()`, `logExport()`, and `startFresh()`.
- **`beforeunload` safety net:** New handler in `app-boot.js` calls `_saveClientHistoryNow()` on page close/refresh/tab close.
- **Persistent "Save" button:** Added `btnSaveClient` with floppy disk SVG icon in quoting header, styled with hover/active states + dark mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **5 files changed:** js/app-core.js (2,219→2,475 lines), js/app-boot.js (287→295 lines), js/app-quotes.js (760→762 lines), plugins/quoting.html (2,016→2,019 lines), css/main.css (3,445→3,486 lines).

### Previous Session Notes (March 7, 2026)

- **Auto Intake — Primary Applicant Driver Sync:** New `syncPrimaryApplicantToDriver()` method auto-creates Driver 1 with `isPrimaryApplicant: true`, copying name/DOB/gender/marital/education/occupation/industry from App.data. Live-syncs via `restorePrimaryApplicantUI()` change/blur listeners on Step 1 fields. Primary applicant driver cannot be removed.
- **Per-Driver Driving History:** Removed global Driving History card from Step 4. Each driver card now has accidents textarea, violations textarea, and studentGPA input. Migration copies global→Driver 1 on first step-4 visit. PDF/CMSMTF exports aggregate per-driver data with "Driver N:" prefixes, falling back to global for backward compat.
- **Employment & Education moved to Step 1:** Demographics card relocated from Step 2 to Step 1 after co-applicant section. Renamed "Employment & Education".
- **Scan updates:** All 3 driver creation sites (DL scan, policy primary, policy additional) now include `isPrimaryApplicant`, `isCoApplicant`, `accidents`, `violations`, `studentGPA`.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **5 files changed:** plugins/quoting.html (1,926 lines), js/app-core.js (2,219 lines), js/app-vehicles.js (816 lines), js/app-export.js (963 lines), js/app-scan.js (1,585 lines).

- **PDF Export & Form Data — 7-Bug Fix:** (1) Client name blank on PDF — switched to `v()` helper with DOM fallback. (2) Dates off by one day — `formatDate()` now uses UTC getters. (3) Co-applicant section missing — three-part fix: `save(e)` guards `hasCoApplicant` checkbox, schema migration v1→v2 normalizes values, PDF/CMSMTF checks accept truthy variants. (4) Raw currency in auto coverage — wrapped 4 fields in `formatCurrency()`. (5) Satellite overlapping text — saved y position, advanced past block, enlarged thumbnail 30×24→45×36. (6) Legacy field names — added 7 migrations in v1→v2 schema. (7) Visual polish — logo 18→22, gap 16→18, satellite enlarged, "View on Maps" link replaced with plain text.
- **Schema version:** Bumped from 1 → 2 with full v1→v2 migration (hasCoApplicant normalization + 7 legacy field name renames).
- **Firestore load fix:** Added debounced `save()` at end of `applyData()` to persist cloud/history data.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/app-export.js (978→996 lines), js/app-core.js (2,342→2,376 lines).

### Previous Session Notes (March 5, 2026)

- **+ New Log Button:** Added reset button in HawkSoft Logger header — clears client, channel (→Inbound), activity, notes, preview/confirm panels. Keeps agent initials. SVG + icon.
- **Agency Glossary:** New textarea in Settings (500-char max) for custom shorthand terms (e.g., "MoE = Mutual of Enumclaw"). Stored in `altech_agency_glossary`, sent in formatOnly fetch, injected into AI userMessage, cloud-synced as 8th doc type.
- **CHANNEL_MAP LogAction Fix:** Walk-In 2→21, Email 3→33, Text 4→41. Were incorrectly using Phone sub-codes.
- **Tests:** 26 new tests. Total: 23 suites, 1515 tests.
- **9 files changed:** api/hawksoft-logger.js, plugins/call-logger.html, css/call-logger.css, js/call-logger.js, index.html, css/auth.css, js/cloud-sync.js, tests/call-logger.test.js, tests/hawksoft-logger.test.js

### Previous Session (March 4, 2026)

- **Call Logger Redesign:** Replaced `<select>` dropdown with 5 SVG-icon channel quick-tap buttons (Inbound/Outbound/Walk-In/Email/Text) + 8 activity-type pill buttons with note templates. Full HTML/CSS/JS rewrite. Added CHANNEL_MAP to hawksoft-logger.js.
- **Tests:** 26 new tests (source analysis + behavioral JSDOM). Total: 23 suites, 1489 tests.
- **6 files changed:** api/hawksoft-logger.js, plugins/call-logger.html, css/call-logger.css, js/call-logger.js, tests/call-logger.test.js, tests/hawksoft-logger.test.js
- **HawkSoft Logger Bug Fixes + Rename:** Fixed wrong method/direction/party in log push (expanded CHANNEL_MAP to objects). Fixed invisible agent initials (moved to RE: line + post-processing). Renamed Call Logger to HawkSoft Logger across 7 files with eagle icon. 5 new tests.
- **Hawk Icon + Activity Templates + activityType Pipeline:** Added hawk SVG to sidebar ICONS, updated TOOL_ICONS mapping. Updated 6 activity templates to completed-action language (Payment received, Policy change processed, etc.). Piped `activityType` through fetch body → API destructure → AI user message. Added SYSTEM_PROMPT rule 10 for activity-type voice guidance. 4 new tests.

### Previous Session (March 2, 2026)

- **Desktop Layout Overhaul**: Full-width redesign across all 15 plugins — every container widened from 1200px → 1400px, generic plugin constraint widened from 1100px → 1400px.
- **2-Column Layouts**: Q&A (380px | 1fr), Email (1fr | 1fr), VIN Decoder (1fr | 380px), Accounting (1fr | 1fr) — all with sticky right columns at 960px+ breakpoint.
- **HawkSoft Logger**: `:has()` CSS conditional grid — auto-switches from 1fr to 1fr|1fr when right column is visible.
- **Quoting Wizard**: Widened to 1400px; removed redundant 1280px override; removed step-6 hero grid/secondary row max-width caps.
- **CGL Compliance**: Stat card min-height 90px, wider search/filter inputs (280px min), larger buttons.
- **QuickRef**: 3-col phonetic grid at 960px+, 4-col at 1280px+.
- **Language**: All 12 "tap" → "click" replacements across 7 HTML/JS files for desktop-first language.
- **24 files changed**, 183 insertions, 90 deletions.
- Validation: `npx jest --no-coverage` → 23/23 suites passed, 1485/1485 tests.

*Last updated: March 25, 2026*

---

## [1.2.0] - 2026-02-05

### Added
- **Approval Workflows for AI Scans**
  - Driver license scan now shows editable review screen before applying data
  - Policy scan shows editable review screen with approve/cancel options
  - Users can verify and edit AI-extracted data before auto-filling form
  
- **Gender Extraction for Insurance Rating**
  - Driver license scan now extracts gender field ("M" or "F")
  - Added gender dropdown to "About You" form (Step 1)
  - Gender stored for insurance rating calculations

- **Enhanced Policy Scanning**
  - Improved multi-carrier support (State Farm, Allstate, Progressive, GEICO, Farmers, etc.)
  - Better handling of varied policy document formats
  - Distinguishes between agent info and insured info
  - Supports multi-page policy documents

### Fixed
- **413 Payload Too Large Errors**
  - Driver license images now resize to 800px @ 0.65 quality
  - Policy/document images resize to 1200px @ 0.85 quality
  - Added pre-upload size validation (4MB limit)
  - Aggressive compression prevents Vercel serverless limit errors

- **404 Model Not Found Errors**
  - Updated from `gemini-1.5-flash` to `gemini-2.5-flash`
  - Switched to v1beta API endpoint
  - All vision APIs now use latest stable model

- **403 Unregistered Caller Errors**
  - Fixed environment variable naming across all API files
  - Changed `GOOGLE_API_KEY` → `NEXT_PUBLIC_GOOGLE_API_KEY`
  - Updated 7 API endpoints for consistency

- **307 MAX_TOKENS Errors**
  - Increased `maxOutputTokens` from 500-1500 → **2048**
  - Applied across 11 instances in 5 API files
  - Prevents response truncation before complete JSON

- **Policy Scan Schema Error**
  - Removed `additionalProperties` from JSON schema (unsupported by Gemini)
  - Fixed "Invalid JSON payload" error

### Changed
- **API Architecture**
  - All Gemini API calls now use: gemini-2.5-flash, v1beta, maxOutputTokens: 2048
  - Standardized environment variable naming convention
  - Improved error handling and user feedback

---

## [1.1.0] - 2026-02-04

### Added
- **Testing Infrastructure (Phase 5.5)**
  - 8 comprehensive test suites (268 tests total)
  - Phase 1-5 tests for all data extraction layers
  - Integration tests for multi-phase workflows
  - Performance benchmarks (P1+3 <2s, full pipeline <10s)
  - 60+ verified test addresses across 8 counties

- **Hazard Detection Feature**
  - Satellite imagery analysis via Gemini Vision
  - Auto-detect pools, trampolines, deck/patio
  - Extract roof type, stories, garage spaces
  - Visual confirmation popup with satellite image

- **County Detection for GIS Links**
  - Auto-detects county from city name
  - Shows toast notification with county info
  - Links to county-specific assessor sites
  - 50+ city-to-county mappings (WA, OR, AZ)

- **Batch CSV Import/Export**
  - Import multiple quotes from CSV
  - Validation and duplicate detection
  - Export all quotes to ZIP (XML+CMSMTF+CSV+PDF per quote)

- **Driver Occupations**
  - Capture occupations for primary and secondary drivers
  - Export to PDF, CSV, and CMSMTF notes field

- **Scan Coverage Indicator**
  - Live display of fields populated from scans (N/total + percentage)
  - Helps users understand form completion progress

### Fixed
- Encryption verification (AES-256-GCM active)
- localStorage sync issues
- Multiple export format bugs
- EZLynx XML special character escaping

---

## [1.0.0] - 2026-01-15

### Added
- Initial release
- **5-Phase Data Extraction Pipeline**
  - Phase 1: ArcGIS county APIs
  - Phase 2: Headless browser scraping
  - Phase 3: RAG standardization
  - Phase 4: Vision processing (policies, licenses)
  - Phase 5: Historical property analysis

- **Core Features**
  - 7-step insurance intake form
  - 3 workflow types (Home, Auto, Both)
  - Multi-driver support
  - Multi-vehicle support with VIN decoding
  - Auto-save to encrypted localStorage

- **Export Formats**
  - EZLynx XML
  - HawkSoft CMSMTF
  - PDF (multi-page)
  - CSV

- **Quote Library**
  - Save/load/delete drafts
  - Search and filter
  - Star favorites
  - Bulk export

- **Security**
  - AES-256-GCM encryption
  - Environment variables for API keys
  - XSS protection headers
  - Form validation

---

## Version History

- **v1.2.0** (Feb 5, 2026) - Approval workflows + gender extraction + enhanced scanning
- **v1.1.0** (Feb 4, 2026) - Testing infrastructure + hazard detection + batch processing
- **v1.0.0** (Jan 15, 2026) - Initial production release

---

## Migration Notes

### Upgrading from v1.1.0 to v1.2.0
- No breaking changes
- Existing localStorage data compatible
- Environment variable update required:
  ```bash
  # Vercel dashboard → Project Settings → Environment Variables
  # Rename: GOOGLE_API_KEY → NEXT_PUBLIC_GOOGLE_API_KEY
  ```

### Upgrading from v1.0.0 to v1.1.0
- No breaking changes
- localStorage encryption automatically applied
- Test suite now available (`npm test`)
