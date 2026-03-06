# QUICKREF.md — Altech Field Lead: Agent Quick Reference

> One-page cheatsheet. For full docs see [AGENTS.md](AGENTS.md).
>
> **⚠️ LIVING DOC:** Update this file, AGENTS.md, and `.github/copilot-instructions.md` after every work session. Run `npm run audit-docs` to check for drift.

---

## CSS Variables — Do / Don't

| ❌ NEVER USE | ✅ USE INSTEAD | Where Defined |
|-------------|---------------|---------------|
| `--card` | `--bg-card` | main.css `:root` |
| `--card-bg` | `--bg-card` | main.css `:root` |
| `--surface` | `--bg-card` | main.css `:root` |
| `--accent` | `--apple-blue` | main.css `:root` |
| `--muted` | `--text-secondary` | main.css `:root` |
| `--text-primary` | `--text` | main.css `:root` |
| `--input-bg` | `--bg-input` | main.css `:root` |
| `--border-color` | `--border` | main.css `:root` |
| `--border-light` | `--border` | main.css `:root` |

### Complete Variable List

| Variable | Light | Dark |
|----------|-------|------|
| `--bg` | `#FAF7F4` | `#000000` |
| `--bg-card` | `rgba(255,255,255,0.85)` | `#1C1C1E` |
| `--bg-input` | `#F5F0EC` | `#2C2C2E` |
| `--text` | `#1a1a1e` | `#FFFFFF` |
| `--text-secondary` | `#7A6E65` | `#98989D` |
| `--text-tertiary` | `#A89888` | `#8E8E93` |
| `--border` | `#E5DAD0` | `#38383A` |
| `--border-subtle` | `rgba(200,170,140,0.15)` | `#2C2C2E` |
| `--shadow` | `rgba(0,0,0,0.12)` | `rgba(0,0,0,0.4)` |
| `--apple-blue` | `#007AFF` | `#0A84FF` |
| `--apple-blue-hover` | `#0051D5` | `#409CFF` |
| `--apple-gray` | `#6e6e73` | `#98989D` |
| `--success` | `#34C759` | `#32D74B` |
| `--danger` | `#FF3B30` | `#FF453A` |
| `--bg-sidebar` | `rgba(255,252,248,0.80)` | `#1C1C1E` |
| `--bg-widget-hover` | `rgba(255,248,240,0.95)` | `#2C2C2E` |
| `--sidebar-active` | `rgba(255,180,80,0.12)` | `rgba(10,132,255,0.25)` |
| `--accent-gradient` | `linear-gradient(135deg,#FF9F43,#FF6B6B)` | `linear-gradient(135deg,#0A84FF,#5E5CE6)` |
| `--accent-gradient-text` | `linear-gradient(135deg,#D4743C,#C44E4E)` | `linear-gradient(135deg,#0A84FF,#5E5CE6)` |
| `--transition-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | *(same)* |
| `--transition-smooth` | `cubic-bezier(0.4,0,0.2,1)` | *(same)* |
| `--sidebar-width` | `240px` | *(same)* |
| `--sidebar-collapsed-width` | `64px` | *(same)* |
| `--header-height` | `56px` | *(same)* |

**Dark mode selector:** `body.dark-mode .your-class` (NOT `[data-theme="dark"]`)

**Dark mode colors:** Prefer solid (`#1C1C1E`) over low-opacity rgba — low opacity is invisible on `#000000`

---

## JavaScript Rules

| Rule | Detail |
|------|--------|
| **App assembly** | `Object.assign(App, {...})` across 9 files. `app-init.js` first, `app-boot.js` last. |
| **Module pattern** | `window.Module = (() => { return { init, render }; })()` |
| **Save form data** | Always use `App.save()` — never write to `altech_v6` directly |
| **After localStorage** | Call `CloudSync.schedulePush()` for synced keys |
| **Field IDs = keys** | `<input id="foo">` → `App.data.foo`. Never rename without migration. |
| **Escape HTML** | Use `escapeHTML()` / `escHtml()` for user/AI content before DOM insertion |
| **Escape XML** | Use `escapeXML()` for any EZLynx XML output |
| **No `alert()`** | Use `App.toast(msg, 'error'\|'success')` |
| **Canvas cleanup** | Set `canvas.width = 0; canvas.height = 0;` after use. Call `bitmap.close()`. |
| **Firebase SDK** | Compat mode: `firebase.auth()`, `firebase.firestore()` — NOT modular imports |

---

## Data Object Shapes

### `App.data` (flat key-value, stored in `altech_v6`)

```
firstName, lastName, dob, gender, email, phone, maritalStatus
coApplicantFirst, coApplicantLast, coApplicantDob, coApplicantGender,
  coApplicantEmail, coApplicantPhone, coApplicantRelationship
address, city, state, zip, county
dwellingType, dwellingUsage, occupancy, yrBuilt, sqFt, numStories,
  numBathrooms, constructionType, exteriorWalls, foundation, roofType,
  roofShape, heatingType, coolingType, garageSpaces, pool, trampoline,
  dogBreed, woodStove, fireAlarm, sprinklers, protectionClass
qType (home|auto|both), dwelling, liability, deductibleAOP, deductibleWind,
  bodInjury, propDamage, umUim, compDed, collDed, medPay, rental, towing
priorCarrier, priorYears, priorLapse
```

### Quote Draft

```javascript
{ id, data: {...}, drivers: [...], vehicles: [...], createdAt, updatedAt }
```

### `App.drivers[]`

```javascript
{ driverFirst, driverLast, driverDob, driverGender, dlNumber, dlState, dlStatus }
```

### `App.vehicles[]`

```javascript
{ vin, vYear, vMake, vModel, vUse, annualMiles, commuteDistance }
```

---

## Field ID → Storage Key Mappings (Critical Fields)

| HTML ID | App.data Key | Export Tag (CMSMTF) | Notes |
|---------|-------------|---------------------|-------|
| `firstName` | `firstName` | `NAM` (combined) | Combined with lastName |
| `lastName` | `lastName` | `NAM` (combined) | |
| `dob` | `dob` | `DOB` | YYYY-MM-DD format |
| `address` | `address` | `ADD` | |
| `city` | `city` | `CTY` | |
| `state` | `state` | `STA` | 2-char code |
| `zip` | `zip` | `ZIP` | |
| `yrBuilt` | `yrBuilt` | `YEAR_BUILT` | Previously misnamed `yearBuilt` in vision |
| `sqFt` | `sqFt` | `SQ_FT` | Previously misnamed `totalSqft` in vision |
| `garageSpaces` | `garageSpaces` | (property tag) | Previously misnamed `numGarages` in vision |
| `qType` | `qType` | — | `home` / `auto` / `both` — drives workflow |

---

## Module Load Order

```
1.  crypto-helper.js        ← CryptoHelper
2.  app-init.js             ← window.App = { state }
3.  app-core.js             ← App.save/load/updateUI/navigateTo
4.  app-scan.js             ← App.processScan
5.  app-property.js         ← App.smartAutoFill
6.  app-vehicles.js         ← App.renderDrivers/renderVehicles
7.  app-popups.js           ← App.processImage/detectHazards
8.  app-export.js           ← App.exportPDF/exportCMSMTF (defines _escapeAttr)
9.  app-quotes.js           ← App.saveAsQuote/loadQuote
10. ai-provider.js          ← window.AIProvider
11. dashboard-widgets.js    ← window.DashboardWidgets
12–25. Plugin modules       ← (order independent among themselves)
26. bug-report.js
27. firebase-config.js      ← Must precede auth.js
28. auth.js                 ← Must precede cloud-sync.js
29. admin-panel.js
30. cloud-sync.js           ← Must follow auth.js
31. paywall.js
32. onboarding.js
33. app-boot.js             ← ★ LAST — runs App.boot()
```

---

## Highest-Risk Files

| File | Risk | Why |
|------|------|-----|
| `js/app-core.js` | 🔴 | Save/load/encryption, form persistence, null-pointer-prone DOM queries |
| `js/app-export.js` | 🔴 | Three export engines, cross-file `_escapeAttr`, field mapping correctness |
| `js/app-popups.js` | 🔴 | AI vision processing, XSS surface, field name mapping must match form IDs |
| `js/cloud-sync.js` | 🔴 | 7 doc types, conflict resolution, Firestore writes — data loss if broken |
| `js/crypto-helper.js` | 🔴 | Encryption for all user data — any bug → data loss or plaintext leak |
| `js/app-boot.js` | 🟡 | Boot sequence — if it fails, entire app doesn't load |
| `js/auth.js` | 🟡 | Authentication + `apiFetch()` used by most plugins |
| `css/main.css` | 🟡 | ~3,366 lines, :root variable source of truth, 100+ dark mode selectors, desktop layout overhaul |
| `plugins/quoting.html` | 🟡 | 2,019 lines, all form field IDs — renaming breaks persistence |
| `js/compliance-dashboard.js` | 🟡 | 2,513 lines, 6-layer persistence, complex merge logic, needsStateUpdate flag, snooze/sleep system |

---

## Three Workflows (Test ALL on Step Changes)

| Type | Steps | Skip |
|------|-------|------|
| `home` | 0 → 1 → 2 → 3 → 5 → 6 | Step 4 (vehicles) |
| `auto` | 0 → 1 → 2 → 4 → 5 → 6 | Step 3 (property) |
| `both` | 0 → 1 → 2 → 3 → 4 → 5 → 6 | — |

---

## Three Export Engines (Test ALL on Field Changes)

| Format | API | Validation | Escaping | Target |
|--------|-----|-----------|----------|--------|
| PDF | jsPDF | None | N/A | Client summary |
| CMSMTF | N/A | None | Plain text `[TAG]value` | HawkSoft import |
| XML | N/A | firstName, lastName, state (2-char), DOB (YYYY-MM-DD) | `escapeXML()` | EZLynx |

---

## Cloud-Synced Data Types (11)

| docType | localStorage Key | UI Refresh After Pull |
|---------|-----------------|----------------------|
| `settings` | `altech_dark_mode` | `App.loadDarkMode()` |
| `currentForm` | `altech_v6` | `App.load()` |
| `cglState` | `altech_cgl_state` | *(localStorage only)* |
| `clientHistory` | `altech_client_history` | *(localStorage only)* |
| `quickRefCards` | `altech_quickref_cards` | `QuickRef.renderCards()` |
| `quickRefNumbers` | `altech_quickref_numbers` | `QuickRef.renderNumbers()` |
| `reminders` | `altech_reminders` | `Reminders.render()` |
| `quotes` | `altech_v6_quotes` | `App.renderQuotesList()` |
| `glossary` | `altech_agency_glossary` | Updates textarea if visible |
| `vaultData` | `altech_acct_vault_v2` | *(encrypted string, stored as-is)* |
| `vaultMeta` | `altech_acct_vault_meta` | *(PIN hash+salt JSON)* |

**Adding a new synced type requires 4 edits in `cloud-sync.js`:** `_getLocalData()`, `pushToCloud()`, `pullFromCloud()`, `deleteCloudData()`

---

## Quick Commands

```bash
npm run dev              # Local server (port 3000)
npm test                 # All 23 suites, 1515 tests
npx jest --no-coverage   # Faster
npx jest tests/app.test.js  # Single suite
npm run deploy:vercel    # Production deploy
```

---

## Session Notes (March 13, 2026)

- **8 UI/UX Improvements — Full Session:**
  1. **Sidebar logo:** Replaced blue "AL" text with `<img>` of `Resources/altech-logo.png`. Restyled `.sidebar-brand-logo` for image display.
  2. **Personal Lines icon:** Changed from house (duplicate of Dashboard) to pencil/edit ✏️ SVG. Updated `toolConfig` icon + `TOOL_ICONS` mapping.
  3. **Footer behind sidebar:** Removed errant `left: 0` from `#quotingTool footer` override in main.css.
  4. **Policy Q&A hidden:** Added `hidden: true` to toolConfig entry — invisible to users until finished.
  5. **Bug report page detection:** Rewrote `getCurrentPage()` with hash-based detection + title/step fallbacks.
  6. **Browser title:** Changed `<title>` from "Altech Field Lead" to "Altech Toolkit".
  7. **CGL Snooze/Sleep:** Full snooze system — `snoozePolicy(pn)` sets midnight-tonight expiry, logs note with count, auto-expires in `filterPolicies()`. UI: 🛏️ Sleep button next to Dismiss, amber snoozed badge + Wake button in showHidden mode, "Sleep Until Tomorrow" in quick-note row. `_isSnoozeActive()`, `_expireSnoozes()`, `unsnoozePolicy()` methods.
  8. **QuickRef reorganized:** Reordered to ID Cards → Speller → Quick Dial Numbers → Phonetic Grid. Replaced hardcoded Common Numbers with editable CRUD system (add/edit/delete with defaults: NAIC, CLUE, MVR). Cloud synced as `quickRefNumbers` (11th doc type).
- **Tests:** 23 suites, 1515 tests (unchanged).
- **12 files changed:** js/compliance-dashboard.js (2,448→2,502), css/compliance.css (1,234→1,275), js/quick-ref.js (293→346), css/quickref.css (233→261), plugins/quickref.html (79→78), js/cloud-sync.js (664→672), js/dashboard-widgets.js (976→886), css/sidebar.css (765→726), js/bug-report.js (260→232), css/main.css (3,486→3,366), js/app-init.js (85→86), index.html (665).

### Email Composer — Dynamic AI Persona + Custom Prompt Override (March 16, 2026)

- **Dynamic AI persona:** Replaced hardcoded "Altech Insurance Agency"/"Altech Insurance" in AI system prompt with `_getAgentName()` (Auth.displayName → localStorage name → fallback) and `_getAgencyName()` (parsed from `altech_agency_profile` → fallback). New `buildDefaultPrompt()` constructs persona dynamically.
- **Custom prompt override:** Collapsible "🎭 Customize AI Persona" UI section with textarea (≤ 2000 chars), save/reset, char counter. Stored in `altech_email_custom_prompt`. `compose()` uses custom prompt if set, otherwise `buildDefaultPrompt()`.
- **Onboarding hint:** Hint text under agency name field: "Used in the Email Composer AI persona & sign-off".
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/email-composer.js (420→497), plugins/email.html (98→125), css/email.css (165→231), index.html (665).

### CGL State-Wipe Bugfix (March 15, 2026)

- **checkForRenewals() no longer overwrites user actions:** All 4 renewal detection blocks were unconditionally clearing `stateUpdated`/`renewedTo` and resetting `needsStateUpdate = true` every fetch. Fix: `markStateUpdated()` records `stateUpdatedForExp` (the specific expiration acknowledged). All 4 blocks skip re-flagging if user already acknowledged that exact expiration. Genuinely new renewals (different exp) still trigger re-flagging.
- **Cloud sync CGL reload:** `pullFromCloud()` now calls `ComplianceDashboard.loadState()` after writing cglState to localStorage.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,502→2,513), js/cloud-sync.js (672→676).

### Previous Session (March 12, 2026)

- **Encrypted Accounting Vault:** PIN + AES-256-GCM + multi-account CRUD. Tabbed layout (Account Info / Export Tools). PIN lockout escalation (3/6 tries), Firebase re-auth recovery. Cloud sync: vaultData + vaultMeta (10 doc types total).
- **Vault UI Polish:** Replaced heavy gradient toolbar buttons with dedicated ghost/solid classes + inline SVG icons. Removed double-border form nesting. 3-column form grid with proper labels. Color picker squircle. SVG empty state. Full dark mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4+3 files changed:** js/accounting-export.js (392→856 lines), css/accounting.css (225→467 lines), plugins/accounting.html (252→329 lines), js/cloud-sync.js (651→664 lines).

### Previous Session (March 5, 2026)

- **+ New Log Button:** Added reset button in HawkSoft Logger header — clears client, channel (→Inbound), activity, notes, preview/confirm panels. Keeps agent initials. SVG + icon.
- **Agency Glossary:** New textarea in Settings (500-char max) for custom shorthand terms (e.g., "MoE = Mutual of Enumclaw"). Stored in `altech_agency_glossary`, sent in formatOnly fetch, injected into AI userMessage, cloud-synced as 8th doc type.
- **CHANNEL_MAP LogAction Fix:** Walk-In 2→21, Email 3→33, Text 4→41. Were incorrectly using Phone sub-codes.
- **Tests:** 26 new tests. Total: 23 suites, 1515 tests.
- **9 files changed:** api/hawksoft-logger.js, plugins/call-logger.html, css/call-logger.css, js/call-logger.js, index.html, css/auth.css, js/cloud-sync.js, tests/call-logger.test.js, tests/hawksoft-logger.test.js

### Previous Session (March 4, 2026)

- **Call Logger Redesign:** Replaced `<select>` dropdown with 5 SVG-icon channel quick-tap buttons (Inbound/Outbound/Walk-In/Email/Text) + 8 activity-type pill buttons with note templates. Full HTML/CSS/JS rewrite. Added CHANNEL_MAP to hawksoft-logger.js.
- **HawkSoft Logger Bug Fixes + Rename:** Fixed wrong method/direction/party in log push. Fixed invisible agent initials. Renamed Call Logger to HawkSoft Logger across 7 files.

### Previous Session (March 3, 2026)

- Fixed narrow-width viewport collapse/black-screen behavior by hardening shell and plugin flex containment.
- Desktop Layout Overhaul: Widened all 15 plugin containers from 1200px→1400px. Added 2-column desktop grids for Q&A, Email, VIN Decoder, and Accounting. 24 files changed.
- Verification: `npx jest --no-coverage` → 23/23 suites passed, 1515/1515 tests.

### Auth Gate + Places API Retry (March 19, 2026)

- **CGL Compliance widget auth gate:** `renderComplianceWidget()`, `_backgroundComplianceFetch()`, and `updateBadges()` now check `Auth.isSignedIn` before rendering or fetching. Unauthenticated visitors see empty state.
- **Places API retry on sign-in:** `_onAuthStateChanged` retries `loadPlacesAPI()` when user signs in and `google.maps.places` isn't loaded. Added idempotency guard (`_placesAPILoading`) to prevent duplicate `<script>` loads.
- **Dashboard refresh on sign-in:** `_onAuthStateChanged` calls `DashboardWidgets.refreshAll()` after sign-in.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/dashboard-widgets.js (904→911), js/auth.js (537→540), js/app-boot.js (295→279), tests/auth-cloudsync.test.js (210→213).

*Last updated: March 19, 2026*
