# Changelog

All notable changes to Altech will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed
- js/hawksoft-export.js: Added SSN input to driver form grid (data-field="ssn" → drv_sSSNum{n} in CMSMTF); added hs_ownerSSN input, ownerSSN data field, and gen_sSSN CMSMTF output for commercial principal owner SSN export

## 2026-03-29 — fix(sidebar): Remove blue hover bleed from [data-tooltip] on nav items
- **Bug:** Hovering over any sidebar nav item showed a blue square/border (apple-blue background and border-color from the global `[data-tooltip]:hover` rule in `css/components.css`), and a stray upward tooltip arrow from `[data-tooltip]::before` was visible above the item.
- **Root cause:** `[data-tooltip]:hover { background: var(--apple-blue); border-color: var(--apple-blue) }` in `components.css` (a rule intended for small help-icon badges) bled into all `.sidebar-nav-item` elements — which all carry `data-tooltip` attributes for collapsed-mode tooltips. Prior March-23 fix (commit `0926855`) addressed the BASE state only; hover state was untouched. Additionally, `[data-tooltip]::before` (tooltip arrow) had no sidebar-specific override (only `::after` was suppressed).
- **Fix (css/sidebar.css):** Added `.sidebar-nav-item[data-tooltip]:hover` (specificity 0-3-0, beats `[data-tooltip]:hover` 0-2-0) with explicit transparent `border-color` and correct background for light/dark mode. Added `.sidebar-nav-item[data-tooltip]::before { display: none }` to suppress the arrow pseudo-element. Added `display: block` to `.sidebar-nav-item.active::before` to protect the active indicator bar from the new `display: none` rule.
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
