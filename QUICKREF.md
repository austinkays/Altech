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
| `css/main.css` | 🟡 | ~3,400 lines, :root variable source of truth, 100+ dark mode selectors, desktop layout overhaul |
| `plugins/quoting.html` | 🟡 | 2,026 lines, all form field IDs — renaming breaks persistence |
| `js/compliance-dashboard.js` | 🟡 | 1,881 lines, 6-layer persistence, complex merge logic |

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

## Cloud-Synced Data Types (7)

| docType | localStorage Key | UI Refresh After Pull |
|---------|-----------------|----------------------|
| `settings` | `altech_dark_mode` | `App.loadDarkMode()` |
| `currentForm` | `altech_v6` | `App.load()` |
| `cglState` | `altech_cgl_state` | *(localStorage only)* |
| `clientHistory` | `altech_client_history` | *(localStorage only)* |
| `quickRefCards` | `altech_quickref_cards` | `QuickRef.renderCards()` |
| `reminders` | `altech_reminders` | `Reminders.render()` |
| `quotes` | `altech_v6_quotes` | `App.renderQuotesList()` |

**Adding a new synced type requires 4 edits in `cloud-sync.js`:** `_getLocalData()`, `pushToCloud()`, `pullFromCloud()`, `deleteCloudData()`

---

## Quick Commands

```bash
npm run dev              # Local server (port 3000)
npm test                 # All 23 suites, 1455 tests
npx jest --no-coverage   # Faster
npx jest tests/app.test.js  # Single suite
npm run deploy:vercel    # Production deploy
```

---

## Session Notes (March 1, 2026)

- Fixed narrow-width viewport collapse/black-screen behavior by hardening shell and plugin flex containment in `css/main.css`, `css/sidebar.css`, and `css/intake-assist.css`.
- Fixed chat/content downward growth and clipping by adding `min-height: 0` nested flex guards plus responsive `clamp()` heights for Q&A and Quote Compare in `css/main.css` and `css/quote-compare.css`.
- Added three reliability suites: `tests/auth-cloudsync.test.js`, `tests/boot-loading.test.js`, and `tests/layout-regressions.test.js`.
- Verification: `npx jest --no-coverage` → 23/23 suites passed, 1455/1455 tests.

*Last updated: March 1, 2026*
