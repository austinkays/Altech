# Altech EZLynx Filler — V2 Architecture Plan

> **Status:** Draft — pending review. No code written yet.
> **Created:** 2026-04-10
> **Supersedes:** `docs/CHROME_EXTENSION_SUMMARY.md` (v0.7.2 analysis)
> **Grounded in:** 5 live EZLynx reconnaissance sessions (Apr 2026)

---

## 0. TL;DR

The current extension fights Angular's reactive forms by impersonating DOM writes. It paints values into `.value` but never reaches `FormControl` — which is why "it works on the first page or two and then is useless." The fix is architectural, not a patch: rebuild from scratch around a verified, Angular-aware fill strategy.

**Three findings from recon make the new architecture possible:**

1. **`document.execCommand('insertText')` reaches Angular's FormControl natively.** Input class transitions from `ng-pristine ng-invalid` → `ng-dirty ng-valid` on every fill. This is the universal text fill strategy for every `<input>` and `<textarea>` on EZLynx.
2. **EZLynx uses stable `id` attributes with three distinct conventions** (`applicant-{field}`, `driver-{N}-{field}`, `{field}-{N}`, plus legacy `textD1DLNumber` exceptions). A hand-curated field registry, not a computed one, is the only reliable selector strategy.
3. **Multi-entity pages scope to wrapper components** (`additional-driver-fields[N]`, `vehicle-fields[N]`, `mat-expansion-panel` for co-applicant). Container scoping eliminates driver-1/driver-2 cross-contamination by construction.

**Everything else falls out of these three decisions.** No more fuzzy matching against visible dropdown options as the primary strategy. No more hardcoded 400ms/1200ms/2000ms delays. No more parallel fill-then-retry-then-pray loops. Each field becomes an atom with explicit preconditions, a fill primitive, a post-fill verification against `ng-valid`, and deterministic retry.

---

## 1. Why This Rewrite Exists

### 1.1 The root cause (not the symptoms)

The current extension's `setInputValue()` primitive does this:

```js
el.value = value;
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
el.dispatchEvent(new Event('blur', { bubbles: true }));
```

This approach has been broken since Angular 16+ tightened its reactive forms integration. **The DOM `.value` and Angular's `FormControl` are decoupled.** The events dispatch, but Angular's `ControlValueAccessor` directive does not treat a synthetic `input` event the same as a real keystroke-originated `InputEvent`. The FormControl never updates. Which means:

- Validation classes (`ng-valid` / `ng-invalid`) never transition
- Dependent fields gated on a FormControl value (VIN lookup button, Occupation after Industry, Years at Address triggering prior address fields) never unlock
- Form submission sends the LexisNexis/prefill value, not what the extension wrote
- `mat-datepicker` rejects the value silently because it expects a `Date` via its input adapter
- No post-fill verification because no validation signal ever propagates

The extension compensates for the symptoms with retries, fuzzy matching, hardcoded timeouts, and two parallel fill engines. None of it addresses the root cause. **V2 addresses the root cause and deletes the compensation.**

### 1.2 The proof (Session 4A-micro)

```js
// Before fill
const el = document.querySelector('#VIN-0');
const btn = document.querySelector('#vin-lookup-btn-0');
// el: ng-pristine ng-invalid | btn: disabled

el.focus();
el.select();
document.execCommand('delete', false);
el.focus();
document.execCommand('insertText', false, '1HGCM82633A004352');

// After fill
// el: ng-touched ng-dirty ng-valid
// btn: disabled=false, mat-mdc-button-disabled class removed
// → Angular's FormControl saw the change through its normal pipeline
```

This is the behavior the entire V2 architecture depends on. If it ever stops working, the whole plan needs revision.

---

## 2. What Recon Established

| Topic | Status |
|---|---|
| Angular direct access (`window.ng.getComponent`) | ❌ Stripped from production build |
| Angular testability (`getAllAngularTestabilities`) | ⚠️ Exists but `whenStable()` hangs — unusable |
| `execCommand('insertText')` reaches FormControl | ✅ Confirmed via `ng-valid` transition |
| Applicant page field map (45 fields) | ✅ Full id inventory |
| Drivers-compact field map (25 fields per driver) | ✅ Full inventory + "Add Driver" DOM diff |
| Vehicles-compact field map (21 fields per vehicle) | ✅ Full inventory + VIN decoder behavior |
| Incidents — 3 types × per-type field lists | ✅ Full inventory |
| Co-applicant entity ID discovery | ✅ Pattern confirmed (`contact-{field}-{entityId}`) |
| Home policy-info (18 core + carrier fields) | ✅ Full inventory |
| Home dwelling-info (54 fields) | ✅ Full inventory |
| Home coverage (19 fields) | ✅ Full inventory + currency format confirmed |
| Google Places autocomplete behavior | ✅ `.pac-container` dismiss strategy |
| LexisNexis field lock ("Disabled by LexisNexis") | ✅ New edge case — first-class handling |
| Currency input format (`350000` → `$350,000` auto) | ✅ Raw digits via `execCommand` |
| Deductible option text (`1000`, `1%`, not `$1,000`) | ✅ Transform normalize before match |
| Pool/Dog/Trampoline dynamic sub-field reveal | ✅ Two-stage fill pattern required |
| DOB date picker on fresh non-locked applicant | ⏳ Not yet tested — blocked by LexisNexis on every test applicant |
| Drivers `#extended1` field label | ⏳ Unknown — discover during implementation |
| Auto coverage/policy pages | ⏳ Not reconned — flat single-entity, discover during implementation |

The two remaining ⏳ items are leaf-level details that cannot change the architecture. Everything structural is known.

---

## 3. Architecture Overview

### 3.1 The one-line thesis

> **Every field is an atom. Atoms know how to fill themselves, verify themselves, and retry themselves. The orchestrator runs atoms sequentially, one at a time, never faster than Angular can keep up.**

### 3.2 High-level data flow

```
Altech Web App
    │
    │  postMessage(ALTECH_CLIENT_DATA)
    ↓
altech-bridge.js  ──→  chrome.storage.local { clientData }
                                │
                                │  (user clicks Fill in popup or toolbar)
                                ↓
                        background service worker
                                │
                                │  sendMessage(fillPage)
                                ↓
                        content/content.js
                                │
                                ↓
                        Router.detectRoute(location.href)
                                │
                                ↓
                        RegistryLoader.load(routeKey)
                                │
                                ↓
                        Orchestrator.run(atoms, clientData)
                                │
                   ┌────────────┴─────────────┐
                   │  for each atom, sequentially:
                   │    1. Locate element
                   │    2. Precheck (disabled? locked?)
                   │    3. Wait for preconditions
                   │    4. Fill (type-specific primitive)
                   │    5. Post-fill actions (dismiss popups, click lookup)
                   │    6. Verify (ng-valid, error text)
                   │    7. Retry on fail, up to N times
                   │    8. Log result to FillTrace
                   └────────────┬─────────────┘
                                │
                                ↓
                        FillTrace → Toolbar report panel
```

### 3.3 Non-negotiable principles

| # | Principle | Why |
|---|---|---|
| 1 | **One fill strategy per field type, always.** Text via execCommand, mat-select via overlay click, toggles via click-if-state-differs. | Kills the named-selector vs positional dual-engine mess. |
| 2 | **Sequential, not parallel.** One atom fires, completes verification, then the next. | Eliminates CDK overlay collisions and cascade races by construction. |
| 3 | **Verification is mandatory.** Every atom reads back its result before advancing. | Silent failures are the worst class of bug; we refuse to have them. |
| 4 | **Container scoping is mandatory for multi-entity.** Driver 2 atoms cannot touch driver 1's DOM. Period. | Multi-entity is the user's worst pain; container scoping fixes it by construction. |
| 5 | **No hardcoded delays.** Every wait is a predicate with a timeout. | "Slow but accurate" is the user's explicit preference. |
| 6 | **Registries are static and hand-curated.** No id computation from field names. | EZLynx's three+ id conventions make computation unreliable. |
| 7 | **Route-scoped atom loading.** The orchestrator only knows about atoms for the current route. | Kills cross-route collisions (e.g., comp loss `Amount-0` colliding with some other page's `Amount-0`). |
| 8 | **No fallback chain to v1.** If an atom fails, it fails — log it loudly, move on, finish the rest of the page. | The current extension's "fall back to the old engine" is why debugging is impossible. |

---

## 4. The Atom Model

### 4.1 Formal atom spec

```js
{
  // ── Identity ─────────────────────────────
  key: 'firstName',                    // unique within the registry
  source: 'FirstName',                 // path in clientData (supports dot notation: 'CoApplicant.FirstName')
  label: 'First Name',                 // human-readable, for logging only

  // ── Locator ──────────────────────────────
  idTemplate: 'applicant-first-name',  // literal id, or with {N} / {entityId} placeholders
  scope: null,                         // null | 'driver' | 'vehicle' | 'coApplicant' | 'accident' | 'violation' | 'compLoss'
  fallbackSelectors: [],               // optional extra selectors if the id changes

  // ── Type + fill strategy ─────────────────
  type: 'text',                        // text | date | number | currency | mat-select | mat-toggle | mat-radio | phone | ssn

  // ── Behavior flags ───────────────────────
  required: true,                      // for logging; we fill required fields first
  skipIfDisabled: true,                // el.disabled → log SKIPPED, move on
  skipIfLexisNexisLocked: true,        // text says "Disabled by LexisNexis" → SKIPPED
  skipIfAlreadyFilled: false,          // if current value matches target → SKIPPED (for VIN decoder cascade)
  skipIfEqualsDefault: false,          // if value matches EZLynx's default → SKIPPED (e.g., Driver on incidents defaults to Driver 1)

  // ── Transforms ───────────────────────────
  valueTransform: null,                // fn(raw) → fillable string (e.g., '$1,000' → '1000' for deductibles)
  abbreviationExpand: true,            // apply ABBREV_MAP (M → Male, HS → High School)

  // ── Preconditions ────────────────────────
  preconditions: [                     // other atoms that must have reached DONE before this fires
    { atom: 'industry', state: 'DONE' },
  ],

  // ── Post-fill actions ────────────────────
  postFill: [                          // run after fill, before verify
    { action: 'dismissPacContainer' },           // after Address
    { action: 'clickVinLookup' },                // after VIN
    { action: 'waitForFieldsToLoad', count: 8 }, // after VIN button click
  ],

  // ── Verification ─────────────────────────
  verify: 'ng-valid',                  // 'ng-valid' | 'valueMatches' | 'custom'
  verifyCustom: null,                  // fn(el, expected) → bool

  // ── Retry ────────────────────────────────
  maxRetries: 3,
  retryDelayMs: 500,                   // delay between retries, not between fills
}
```

### 4.2 Atom state machine

```
   ┌────────┐
   │ IDLE   │
   └───┬────┘
       │ orchestrator.next()
       ↓
   ┌────────────────┐
   │ LOCATE         │──not found (3s timeout)──┐
   └───────┬────────┘                          │
           │ found                             │
           ↓                                   │
   ┌────────────────┐                          │
   │ PRECHECK       │──disabled/locked──→ SKIPPED
   └───────┬────────┘                          │
           │ ready                             │
           ↓                                   │
   ┌────────────────────┐                      │
   │ WAIT_PRECONDITIONS │  (block until        │
   └───────┬────────────┘   dependent atoms    │
           │                 reach DONE)       │
           ↓                                   │
   ┌────────┐                                  │
   │ FILL   │  (type-specific primitive)       │
   └───┬────┘                                  │
       │                                       │
       ↓                                       │
   ┌──────────┐                                │
   │ POST_FILL│                                │
   └────┬─────┘                                │
        │                                      │
        ↓                                      │
   ┌────────┐                                  │
   │ VERIFY │                                  │
   └───┬────┘                                  │
       │                                       │
    ┌──┴──┐                                    │
  pass   fail                                  │
    │     │                                    │
    ↓     ↓                                    │
  DONE   ┌─────────┐                           │
         │ RETRY?  │──no──→ FAILED ←───────────┘
         └────┬────┘
              │ yes
              ↓
           LOCATE (with retryDelayMs)
```

Every atom terminates in exactly one of four states: **DONE**, **SKIPPED**, **FAILED**, or **BLOCKED** (precondition atom failed — this atom never ran).

### 4.3 Fill primitives (one per type)

| Type | Primitive |
|---|---|
| `text`, `date`, `number` | Focus → select → `execCommand('delete')` → focus → `execCommand('insertText', value)` → blur |
| `currency` | Same as `text`, but `valueTransform` strips `$` and commas first; EZLynx reformats on blur |
| `mat-select` | Click trigger → poll for `.mat-mdc-option` elements → find best match → click option → poll for overlay closed |
| `mat-toggle` | Read current state (`.mat-mdc-slide-toggle-checked` class) → click only if state differs from target |
| `mat-radio` | Find `.mat-mdc-radio-button` whose label matches target → click |
| `phone`, `ssn` | Same as `text`; no masking logic needed (EZLynx handles input masks) |

Note: `mat-select` is the only primitive that still uses fuzzy matching against visible options, but narrowly:
1. Exact match first (after abbreviation expansion and value transform)
2. Case-insensitive exact match second
3. Dice similarity ≥ 0.7 (stricter than current v1's 0.4) as a last resort, and only for dropdowns where we have a known-safe option list in the registry

---

## 5. Orchestrator Design

### 5.1 Execution order within a route

1. **Load atom list for current route** (from registry)
2. **Build dependency graph** from `preconditions`
3. **Topological sort** → linear execution order where all dependencies precede their dependents
4. **Execute atoms sequentially** one-at-a-time
5. **After each atom reaches DONE**, resolve any atoms that were BLOCKED waiting on it, mark them ready
6. **Log every transition** to FillTrace

### 5.2 Retry policy

- Default: 3 retries with 500ms delay
- On retry, the atom re-LOCATES the element (the DOM may have re-rendered)
- After max retries, state → FAILED, orchestrator continues with next atom
- FAILED does not abort the fill — one bad field doesn't block the other 46

### 5.3 Fill report (UX)

After a full orchestrator run, the toolbar shows a structured report:

```
Applicant Details — 45 atoms
  ✅ DONE:     38  (84%)
  ⏭  SKIPPED:  3   (DOB locked by LexisNexis, Nickname empty, Lead Source empty)
  ❌ FAILED:   2   (Prior Employer In Years — timeout, Applicant Type — no match)
  🚫 BLOCKED:  2   (Occupation — blocked by Industry FAILED)
```

Expandable per-atom details show the element selector, the attempted value, the transform result, the verifier output, and the retry count. This replaces the current extension's emoji-badge fill trace with something the user can actually debug from.

---

## 6. Field Registries — Per-Page Atom Lists

Registries are plain JS modules that export an array of atom specs. Organized one file per route. Below are the concrete registries grounded in recon data.

### 6.1 Applicant `/details` — 45 atoms

Key groups (full id list in `registries/applicant.js` at build time):

**Personal (12):** `applicant-prefix`, `applicant-first-name`, `applicant-middle-name`, `applicant-last-name`, `applicant-name-suffix`, `applicant-gender`, `applicant-date-of-birth`, `applicant-marital-status`, `applicant-social-security-number`, `applicant-maiden-name`, `applicant-nickname`, `applicant-drivers-license-number`

**DL & Work (7):** `applicant-drivers-license-status`, `applicant-drivers-license-state`, `applicant-education`, `applicant-industry`, `applicant-occupation` (precondition: `applicant-industry` DONE), `applicant-occupation-years` (precondition: `applicant-occupation` DONE), `applicant-prior-employer-in-years`

**Meta (7):** `applicant-type`, `applicant-customer-since`, `applicant-account-name`, `input-assigned-to`, `input-csr`, `applicant-lead-channel`, `preferred-language`

**Address (11):** `applicant-rating-state`, `applicant-primaryaddress-postalcode` ⚠️ *(legacy id — note inconsistent naming)*, `applicant-primary-address-applicantAddressType`, `applicant-primary-address-address1` (postFill: `dismissPacContainer`), `applicant-primary-address-addressUnit`, `applicant-primary-address-address2`, `applicant-primary-address-addressCity`, `applicant-primary-address-addressState`, `applicant-primary-address-addressCounty` (precondition: `applicant-primary-address-addressState` DONE), `applicant-primary-address-postalCode`, `applicant-primary-address-postalCodeSuffix`, `applicant-primary-address-yearsAtAddress`, `applicant-primary-address-monthsAtAddress`

**Contact (6):** `Mobile_PhoneType-type`, `Mobile_PhoneType-applicant-phone-0-personal-number`, `applicant-email-0-type`, `applicant-email-0-email-address`, `applicant-preferred-contact-method`, `applicant-preferred-contact-time`

All fields have `skipIfLexisNexisLocked: true` — LexisNexis prefill is common on the applicant page.

### 6.2 Drivers `/rating/auto/{id}/drivers-compact` — ~25 atoms per driver

Scoped to `querySelectorAll('additional-driver-fields')[N]`. Every atom has `scope: 'driver'`.

Id templates: `driver-{N}-first-name`, `driver-{N}-last-name`, `driver-{N}-dob` (skipIfDisabled — pulled from applicant), `driver-{N}-gender`, `driver-{N}-maritalStatus`, `driver-{N}-relationship`, `driver-{N}-socialSecurityNumber`, `driver-{N}-occupationIndustry`, `driver-{N}-occupationTitle` (precondition: `driver-{N}-occupationIndustry` DONE), `driver-{N}-driversLicenseStatus`, `driver-{N}-ageLicensed`, **`textD{N+1}DLNumber`** ⚠️ *(legacy — driver 0 = D1, driver 1 = D2)*, **`drpD{N+1}DLState`** ⚠️, `driver-{N}-ratedDriver`, `driver-{N}-defensiveDriverCourseDate`, `driver-{N}-hasLicenseBeenSuspendedRecently`, `driver-{N}-isSR22Required`, `driver-{N}-isFR44Required`, `driver-{N}-isGoodStudent`, `driver-{N}-isStudentFarAway`, `driver-{N}-hasTakenDriversEducation`, `driver-{N}-matureDriver`, `driver-{N}-isGoodDriver`, `extended1` *(required, label TBD at implementation time)*, `driver_d1telematics_common` *(label TBD)*.

**"Add Driver" flow:**
1. Orchestrator iterates `clientData.Drivers[]`
2. For driver 0, scope to `additional-driver-fields[0]` and run atoms
3. For driver 1+, first click `button:has-text("Add Driver")` in the pre-existing UI
4. Poll for `additional-driver-fields[N]` to exist (with N-1 previously existing)
5. Scope to the new container and run atoms

### 6.3 Vehicles `/rating/auto/{id}/vehicles-compact` — ~21 atoms per vehicle

Scoped to `querySelectorAll('vehicle-fields')[N]`. Every atom has `scope: 'vehicle'`.

**Special: VIN decoder short-circuit.**

```js
// First atom — VIN with postFill clickVinLookup
{ key: 'vin', idTemplate: 'VIN-{N}', type: 'text', source: 'VIN',
  postFill: [
    { action: 'clickVinLookup' },              // clicks #vin-lookup-btn-{N}
    { action: 'waitForDecodeComplete' },       // polls until selected-year-{N} has a value OR 10s timeout
  ] }

// Atoms for Year/Make/Model/SubModel/PurchaseDate/PassiveRestraints/AntiLockBrakes/CostNewValue
// all carry: skipIfAlreadyFilled: true
// → after VIN decode, they already have values, so the atoms become SKIPPED automatically
```

Remaining non-decoded atoms fill normally: `selected-use-{N}`, `annual-miles-{N}`, `selected-restraint-{N}` (if not already), `antilock-brakes-{N}` (if not already), `daytime-runningLights-{N}`, `selected-antiTheft-{N}`, `transportation-network-coverage-{N}`, etc.

**Cost New Value exception:** id is `textV1CostNew` (legacy), not `cost-new-{N}`. Hand-curated in registry.

### 6.4 Incidents `/rating/auto/{id}/incidents` — variable, no wrapper scoping

Incidents have **no wrapper component**. Atoms query by id directly. Route-scoped atom loading prevents collisions.

**Flow:**
1. For each `clientData.Incidents[]` entry, check `Type` field
2. Click the matching `#add-accident-btn`, `#add-violation-btn`, or `#add-comp-loss-btn`
3. Poll for new atom ids to appear (e.g., after adding the 2nd accident, `accidentDate-1` must exist)
4. Fill atoms for that instance

**Per-type registries:**

*Accident (8 atoms × N):* `accidentDate-{N}`, `accident-driver-{N}` (skipIfEqualsDefault — auto-fills to Driver 1), `accidentDescription-{N}`, `pdAmount-{N}`, `biAmount-{N}`, `collisionAmount-{N}`, `mpAmount-{N}`, `accident-vehicleInvolved-{N}`

*Violation (3 atoms × N):* `violationDate-{N}`, `violation-driver-{N}`, `violationDescription-{N}`

*Comp Loss (5 atoms × N):* `compLoss-dateOfLoss-{N}`, `compLoss-driver-{N}`, `compLoss-lossDescription-{N}`, **`Amount-{N}`** ⚠️ *(legacy — no `compLoss-` prefix)*, `compLoss-vehicleInvolved-{N}`

### 6.5 Co-Applicant (inline expansion panel on `/details`)

**Ships with applicant page in Phase 1** — lives on the same `/details` route, so building them together is cheaper than splitting into two phases.

Not a `mat-dialog-container`. Inline `mat-expansion-panel` with atoms scoped to it.

**Entity ID discovery flow:**
1. Snapshot existing `contact-first-name-*` ids before clicking Add contact
2. Click `Add contact` button
3. Enable co-applicant toggle
4. Poll until a new `contact-first-name-{entityId}` appears where `entityId` is not in the snapshot
5. Extract the new entity ID
6. Execute atoms with ids built from the discovered entity ID: `contact-first-name-{entityId}`, `contact-last-name-{entityId}`, etc.

**Atom shape:**
```js
{ key: 'firstName', idTemplate: 'contact-first-name-{entityId}', scope: 'coApplicant', ... }
```

The orchestrator substitutes `{entityId}` at execution time from a session-scoped lookup populated during entity discovery.

### 6.6 Home Policy Info `/rating/home/{id}/policy-info` — 18 core atoms

`priorCarrier`, `priorPolicyExpirationDate`, `priorPolicyPremium`, `yearsWithPriorCarrier`, `monthsWithPriorCarrier`, `yearsWithContinuousCoverage`, `monthsWithContinuousCoverage`, `creditCheckAuthorized`, `package`, `effectiveDateNewPolicy`, `propertyInsurance`, `homeUnderConstruction`, `trampoline`, `businessOrDaycareOnPremises`, `numberOfEmployees`, `swimmingPoolOnPremises`, `dogInfo`

All flat ids (no index, no scope). Toggles are independent — no cascades. Carrier-specific fields (`coverage_paperless_common`, `animalpremises_ml`, etc.) loaded into a separate optional atom list, only if clientData has matching keys.

### 6.7 Home Dwelling Info `/rating/home/{id}/dwelling-info` — 49 core atoms

Full flat registry: `dwellingUsage`, `dwellingOccupancy`, `dwellingType`, `numberOfOccupants`, `numberOfStories`, `squareFootage`, `year-built`, `constructionStyle`, `roofType`, `foundationType`, `roofDesign`, `exteriorWalls`, `numberOfFullBaths`, `numberOfHalfBaths`, `numberOfWoodBurningStoves`, `heatingType`, `secondaryHeatingSourceType`, `burglarAlarmType`, `dead-bolt`, `fireDetectionType`, `sprinklerSystemType`, `smokeDetectorTypes`, `purchasePrice`, `purchaseDate`, `distanceFromFireStation`, `feetFromHydrant`, `distanceToTidalWater`, `protectionClass`, `noOfUnitsInFireDivision` (skipIfDisabled — conditionally disabled), `insideCityLimits`, `withinFireDistrict`, `heatingUpdate`, `yearUpdatedHeating`, `electricalUpdate`, `yearUpdatedElectrical`, `plumbingUpdate`, `yearUpdatedPlumbing`, `roofingUpdate`, `yearUpdatedRoofing`, `multiPolicyDiscount`, `nonSmoker`, `retireesCredit`, `matureDiscount`, `retirementCommunity`, `visibleToNeighbor`, `mannedSecurity`, `limitedAccessCommunity`, `gatedCommunity`.

**Zero cascade preconditions** — verified by recon. The old extension assumed Dwelling Type → Stories and Roof Type → Roof Design; neither is real.

### 6.8 Home Coverage `/rating/home/{id}/coverage` — 19 atoms

`dwelling` (currency), `estReplacementCost` (currency), `other-structure` (mat-select, options include `1%`, `10%`, etc.), `personal-property` (mat-select), `loss-of-use` (mat-select), `loss-of-use-amount` (currency), `personalLiability` (mat-select, raw-number options), `medicalPayments` (mat-select), `allPerilsDeductible` (mat-select, raw-number options), `theftDeductible`, `windDeductible`, `firstMortgagee` (toggle → dynamic reveal), `secondMortgagee`, `thirdMortgagee`, `cosigner`, `equityLineOfCredit`, `numberOfOtherInterests`.

**Currency transform:** strips `$` and commas before execCommand insertText. EZLynx auto-formats on blur.

**Deductible transform:** strips `$` and commas from the target value so matching `"1000"` against the mat-option text `"1000"` works without a fuzzy fallback.

---

## 7. Special Cases

### 7.1 VIN decoder

See §6.3. VIN atom has a `postFill: clickVinLookup` action that clicks `#vin-lookup-btn-{N}` and polls for Year/Make/Model to populate. Dependent atoms (Year, Make, Model, SubModel, PurchaseDate, PassiveRestraints, AntiLockBrakes, CostNewValue) all have `skipIfAlreadyFilled: true`. If decode succeeds, they SKIP automatically. If it fails, they fill normally from clientData.

### 7.2 Google Places autocomplete on Address Line 1

Address1 atom has `postFill: dismissPacContainer` which runs:
```js
document.querySelector('.pac-container')?.remove();
```

This eliminates the suggestion panel before the next atom fires, so no subsequent click is intercepted. City/State/Zip/County are all independent atoms filled after Address1 — the autocomplete's "helpful" auto-fill chain is deliberately not used.

### 7.3 LexisNexis lock

**New edge case from Session 5.** When EZLynx's LexisNexis integration pre-fills an applicant, some fields (DOB, potentially others) are locked with `disabled="true"` and a visual indicator reading "Disabled by LexisNexis." Our extension cannot unlock these without user intervention.

**Handling:**
- `skipIfLexisNexisLocked: true` on every atom by default
- Precheck runs: `el.disabled === true && <nearby text contains "LexisNexis">` → state = SKIPPED with reason `"LexisNexis lock"`
- Fill report shows these prominently so the user knows they need to unlock or re-enter manually

### 7.4 Disabled fields (non-LexisNexis)

Some fields are legitimately disabled:
- Driver `dob` — pulled from applicant
- Dwelling `noOfUnitsInFireDivision` — conditionally disabled
- Occupation `applicant-occupation-years` until Occupation filled

Atoms default to `skipIfDisabled: true`. State = SKIPPED with reason `"disabled"`. No retry.

### 7.5 Dynamic reveal (Pool/Dog/Trampoline, Mortgagees)

When a toggle on the policy-info page goes ON, sub-fields are **newly added to the DOM** (not hidden-then-shown). Same for First/Second/Third Mortgagee on the coverage page.

**Two-stage atom group:**
```js
// Parent atom
{ key: 'swimmingPoolOnPremises', type: 'mat-toggle', idTemplate: 'swimmingPoolOnPremises',
  postFill: [{ action: 'waitForChildAtomsReady', children: ['poolType', 'poolFenced'] }] }

// Child atoms (only defined if clientData has values for them)
{ key: 'poolType', idTemplate: 'poolType', preconditions: [{ atom: 'swimmingPoolOnPremises', state: 'DONE' }], ... }
```

The orchestrator's `waitForChildAtomsReady` polls until the child id exists in the DOM (up to 3s), then releases the child atoms from BLOCKED state.

### 7.6 Entity ID discovery (Co-Applicant)

See §6.5. Session-scoped entity map:
```js
const entityMap = new Map();
// After discovery:
entityMap.set('coApplicant', '71455028');
// Atoms resolve {entityId} from the map at LOCATE time
```

### 7.7 Mat-select option matching (deductibles, raw-number options)

`valueTransform` normalizes before comparison:

```js
// Deductible atom
valueTransform: (v) => String(v).replace(/[$,]/g, '').trim()
// clientData.AllPerilsDeductible = "$1,000" → transform → "1000" → matches mat-option text "1000"
```

This is the single most important lesson from Session 5: **deductible options are raw numbers, not formatted dollars**. The old extension's fuzzy matcher at 0.4 similarity made this work ~70% of the time by accident. The V2 approach makes it work 100% of the time by design.

---

## 8. Module Breakdown

```
chrome-extension-v2/
├── manifest.json                         # v3, narrowed host permissions
├── src/
│   ├── background/
│   │   ├── service-worker.js             # message relay, script injection
│   │   └── storage.js                    # chrome.storage.local wrappers
│   │
│   ├── content/
│   │   ├── content.js                    # entry point, loaded on *.ezlynx.com
│   │   │
│   │   ├── orchestrator/
│   │   │   ├── index.js                  # main run loop
│   │   │   ├── atom-executor.js          # per-atom state machine
│   │   │   ├── dependency-graph.js       # topological sort of preconditions
│   │   │   └── fill-trace.js             # structured logging
│   │   │
│   │   ├── primitives/
│   │   │   ├── text.js                   # execCommand insertText
│   │   │   ├── date.js                   # text + date validation hook
│   │   │   ├── currency.js               # strip formatting + text
│   │   │   ├── number.js                 # coerce + text
│   │   │   ├── mat-select.js             # click → wait → match → click
│   │   │   ├── mat-toggle.js             # click-if-state-differs
│   │   │   └── mat-radio.js              # label-match → click
│   │   │
│   │   ├── locator/
│   │   │   ├── find-by-id.js             # direct id lookup (unscoped)
│   │   │   ├── find-scoped.js            # scope-then-id lookup
│   │   │   └── scope-resolvers.js        # { driver, vehicle, coApplicant, accident, violation, compLoss }
│   │   │
│   │   ├── verifier/
│   │   │   ├── ng-valid.js               # class-based verification
│   │   │   ├── value-matches.js          # DOM value equality
│   │   │   └── error-text.js             # extract mat-error text
│   │   │
│   │   ├── waits/
│   │   │   ├── poll-predicate.js         # generic polling primitive
│   │   │   ├── wait-element.js           # wait for element to exist
│   │   │   ├── wait-enabled.js           # wait for field to become enabled
│   │   │   ├── wait-options-loaded.js    # wait for mat-option elements
│   │   │   ├── wait-decode-complete.js   # VIN-specific
│   │   │   └── wait-child-atoms-ready.js # dynamic reveal
│   │   │
│   │   ├── routes/
│   │   │   ├── router.js                 # URL pattern → route key
│   │   │   └── route-definitions.js      # route table
│   │   │
│   │   ├── registries/
│   │   │   ├── applicant.js              # §6.1
│   │   │   ├── drivers.js                # §6.2
│   │   │   ├── vehicles.js               # §6.3
│   │   │   ├── incidents.js              # §6.4 (three sub-lists)
│   │   │   ├── co-applicant.js           # §6.5
│   │   │   ├── home-policy-info.js       # §6.6
│   │   │   ├── home-dwelling-info.js     # §6.7
│   │   │   ├── home-coverage.js          # §6.8
│   │   │   └── carrier-specific.js       # optional extensions
│   │   │
│   │   ├── special-cases/
│   │   │   ├── vin-decoder.js            # VIN postFill actions
│   │   │   ├── google-places.js          # dismissPacContainer
│   │   │   ├── lexis-nexis-lock.js       # detection helper
│   │   │   ├── entity-id-discovery.js    # co-applicant entity ID
│   │   │   ├── add-entity.js             # "Add Driver/Vehicle/Incident" generic handler
│   │   │   └── dynamic-reveal.js         # toggle-then-wait pattern
│   │   │
│   │   ├── transforms/
│   │   │   ├── abbreviations.js          # M → Male, HS → High School, etc.
│   │   │   ├── currency-strip.js         # $1,000 → 1000
│   │   │   └── phone-format.js           # normalize phone
│   │   │
│   │   ├── ui/
│   │   │   ├── toolbar.js                # shadow DOM floating toolbar
│   │   │   ├── toolbar.css
│   │   │   └── fill-report-panel.js      # structured result display
│   │   │
│   │   ├── recon/                        # admin-only diagnostic tool, §11
│   │   │   ├── index.js                  # entry point, admin gate, keyboard shortcut
│   │   │   ├── features/
│   │   │   │   ├── page-inventory.js     # dump all form fields to JSON
│   │   │   │   ├── registry-audit.js     # validate atoms against live page
│   │   │   │   ├── dry-run.js            # simulate fill without modifying DOM
│   │   │   │   ├── issue-capture.js      # snapshot diagnostic state on bug report
│   │   │   │   ├── cascade-test.js       # verify parent/child dependencies
│   │   │   │   └── diff-registry.js      # compare registry vs page
│   │   │   ├── redaction/
│   │   │   │   └── pii-redactor.js       # scrub PII before serialization
│   │   │   ├── output/
│   │   │   │   ├── to-clipboard.js       # navigator.clipboard
│   │   │   │   ├── to-file.js            # download as .json
│   │   │   │   ├── to-firestore.js       # users/{uid}/reconReports/{ts}
│   │   │   │   └── to-markdown.js        # human-readable rendering
│   │   │   └── ui/
│   │   │       ├── recon-panel.js        # 6-button panel (toolbar + popup)
│   │   │       └── recon-panel.css
│   │   │
│   │   └── spa/
│   │       └── nav-detector.js           # URL change detection (history + polling)
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   │
│   └── altech-bridge/
│       └── bridge.js                     # Altech postMessage → chrome.storage
│
└── test/
    ├── fixtures/                         # recorded EZLynx DOM snapshots
    │   ├── applicant-details.html
    │   ├── drivers-compact-2drivers.html
    │   ├── vehicles-compact-2vehicles.html
    │   ├── incidents-with-all-types.html
    │   ├── home-dwelling-info.html
    │   └── home-coverage.html
    └── unit/
        ├── primitives.test.js
        ├── locator.test.js
        ├── verifier.test.js
        ├── transforms.test.js
        ├── dependency-graph.test.js
        └── registries.test.js            # registry integrity (no duplicate keys, valid type enum, etc.)
```

**Total: ~35 source files averaging ~80 lines each = ~2,800 lines** vs. the current 5,396-line monolith. More files, dramatically less total code, each file has one clear job.

---

## 9. Timing Strategy

Replace every hardcoded delay with a predicate poll:

```js
// poll-predicate.js
async function pollPredicate(predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}
```

**Usage across the extension:**

| Scenario | Predicate |
|---|---|
| Wait for field to become enabled | `() => !document.querySelector(id).disabled` |
| Wait for mat-options to load after opening a select | `() => document.querySelectorAll('.mat-mdc-option').length > 0` |
| Wait for VIN decode to complete | `() => document.querySelector('#selected-year-{N}')?.textContent.trim().length > 0` |
| Wait for new driver to be added | `() => document.querySelectorAll('additional-driver-fields').length === expectedCount` |
| Wait for dynamic reveal (Pool sub-fields) | `() => document.querySelector('#poolType') !== null` |
| Wait for ng-valid after fill | `() => el.classList.contains('ng-valid') && !el.classList.contains('ng-invalid')` |

**Default timeout is 5 seconds per predicate.** Long enough for Angular + HTTP to complete. Short enough to fail fast on real problems. Individual atoms can override.

**`whenStable()` is not used** — it hangs on EZLynx due to a long-running zone task. Confirmed Session 2.

---

## 10. Verification Strategy

Every atom verifies before advancing. Four verification modes:

| Mode | Check | Used for |
|---|---|---|
| `ng-valid` | Element has `.ng-valid` class and not `.ng-invalid` | All text, date, number, currency inputs |
| `valueMatches` | DOM `.value` equals expected (after transform) | Phone, SSN (masked inputs where ng-valid is ambiguous) |
| `optionSelected` | Mat-select trigger text includes expected | All mat-selects |
| `toggleState` | `.mat-mdc-slide-toggle-checked` class presence matches expected | Toggles |

**Additionally**, every verify also reads `mat-error` text under the field. If error text is present, the atom is considered failed regardless of class state (covers server-side validation errors that Angular surfaces after fill).

**No positional verification** (current extension checks DOM values by position) — that assumes DOM order is stable, which it often isn't after dynamic reveals.

---

## 11. Built-in Recon Tool

Ships with the extension as a first-class subsystem. Replaces Claude-in-Chrome recon sessions for all future development, bug diagnosis, and EZLynx-change detection. Admin-only. Available from three trigger surfaces. Built in Phase 1 so every subsequent phase can use it.

### 11.1 Rationale

Every recon session so far has followed the same mechanical pattern: walk the DOM of an EZLynx page, emit a structured field inventory, report cascades and dynamic reveals. The extension is already on the page with full DOM access and knows the full atom registry — it should be doing this itself.

Building this in Phase 1 pays for itself immediately:

- Every subsequent phase uses it to verify new registries against live pages (no more burning external recon calls)
- Production bugs become one-click diagnostic captures instead of multi-turn conversations
- EZLynx can change at any time; Registry Audit tells us the instant it does
- The user retains permanent diagnostic capability without needing to open Claude-in-Chrome or this conversation

### 11.2 Access model

- Gated behind `chrome.storage.local.isAdmin === true` (matches existing v0.7.2 pattern)
- Non-admin users see no recon UI at all — the feature is invisible to them
- Admin status is set by the Altech web app at sign-in time via the existing `ALTECH_ADMIN_UPDATE` bridge message

### 11.3 Triggers (all three, redundant)

| Surface | Detail |
|---|---|
| **Floating toolbar button** | 🔍 "Recon" icon next to the Fill button. Opens an inline panel with the 6 feature buttons. |
| **Popup button** | "Recon Tools" section in the extension popup, admin-only, expanded view with inline results. |
| **Keyboard shortcut** | `Ctrl+Shift+A` (configurable) — opens the toolbar recon panel even if the toolbar is hidden. |

### 11.4 The six features

#### 11.4.1 Page Inventory

Walks every visible form field on the current page and emits a structured table matching the format used in this plan's field registries:

```js
{
  route: '/rating/auto/{id}/drivers-compact',
  timestamp: '2026-04-10T14:32:00Z',
  fields: [
    { order: 0, label: 'First Name', id: 'driver-0-first-name', tag: 'INPUT',
      required: true, disabled: false, scope: 'additional-driver-fields[0]' },
    // ...
  ],
  scopeContainers: ['additional-driver-fields (3 instances)'],
  cascadesDetected: [{ parent: 'driver-0-occupationIndustry', child: 'driver-0-occupationTitle' }],
}
```

**Output:** C3 — copy to clipboard + download as JSON file. User picks at capture time.

**Use case:** Adding a new page to the registry, or re-mapping a page after EZLynx changes, without burning external recon.

#### 11.4.2 Registry Audit

For the current route, iterates every atom in its registry and checks against the live DOM:

| Status | Meaning |
|---|---|
| ✅ Resolved | Element exists, not disabled, not locked |
| ⏭ Conditionally skipped | Exists but disabled or LexisNexis-locked (expected) |
| ⚠️ Newly disabled | Exists but disabled when the registry expected it enabled |
| ❌ Missing | Atom's `idTemplate` does not resolve to any element |
| 🆕 Unknown field | Page has a labeled field that matches no atom in the registry |

**Output:** C3 — clipboard + file.

**Use case:** After any EZLynx change rumor; before every release; after each new phase's registry is written.

#### 11.4.3 Dry Run

Simulates a full fill pass without actually filling. For each atom:

1. Locate the element
2. Run precheck (disabled/locked)
3. Apply value transform and abbreviation expansion
4. Report: "would fill `driver-0-first-name` with 'John' via execCommand text primitive, verify via ng-valid"

No DOM is modified. Atoms with failed preconditions or missing elements are reported as they would be in a real run.

**Output:** C3 — clipboard + file, formatted as a markdown report for readability.

**Use case:** Verifying a new registry entry before running a real fill; diagnosing why a specific atom skips.

#### 11.4.4 Issue Capture

The "something's wrong — capture it" button. One click snapshots:

- Route key + URL + page title
- Registry atom list for the current route
- For every atom: locator result, element classes (`ng-valid`/`ng-invalid`/`ng-touched`/etc.), `disabled`/`readonly` state, current `value` (redacted for PII fields), any nearby `mat-error` text
- Fill trace from the most recent orchestrator run (if any)
- `clientData` keys present (values redacted — we log only which keys were provided, never their content)
- SHA256 hash of `document.body.outerHTML` (for detecting EZLynx DOM changes between captures)
- Browser + Chrome version + extension version

**Output:** C5 — copy to clipboard **AND** write to Firestore at `users/{uid}/reconReports/{timestamp}`.

**PII handling:** Values for atoms whose source key matches `/^(SSN|DOB|DLNumber|Phone|Email|MaidenName)$/` are replaced with `"[REDACTED]"` in the output. The raw DOM is NOT captured — only per-atom diagnostic state. Reports are safe to share in a conversation.

**Use case:** Production bug diagnosis. User clicks Report, pastes the clipboard JSON into our next conversation; I diagnose from the data without needing live site access. Firestore persistence gives us a searchable history of production issues.

#### 11.4.5 Cascade Test

For known parent→child relationships (encoded in registry metadata as `declaredCascades: [{ parent, trigger, child }]`), runs a temporary live test:

1. Record the child's current disabled state
2. Set parent to its "unlock trigger" value (e.g., Industry = "Retired" for Occupation)
3. Wait for child to become enabled (up to 5s)
4. Report pass/fail
5. Restore parent to its original value

**Output:** C3 — clipboard + file.

**Use case:** Periodic health check; verifying a cascade still exists after an EZLynx update.

**Safety:** Only runs on routes explicitly marked `cascadeTestable: true` in the route definition. Never runs on pages where setting and reverting a field could trigger unintended side effects (form submission, autosave, etc.).

#### 11.4.6 Diff Registry vs Page

Compares the current route's registry against every labeled form field present in the live DOM:

- Fields in registry AND on page → ✅ tracked
- Fields in registry BUT NOT on page → ❌ registry stale (id changed or field removed)
- Fields on page BUT NOT in registry → 🆕 new fields EZLynx added that we don't fill

**Output:** C3 — clipboard + file.

**Use case:** Quarterly audit; after observing any UI change in EZLynx; before claiming a phase is "complete."

### 11.5 What it replaces

- **All future Claude-in-Chrome recon sessions** — Page Inventory and Diff Registry cover the mechanical work entirely. Future EZLynx additions or changes are self-diagnosed.
- **Half of §12 (Testing Strategy)** — Registry Audit automates what the "manual validation protocol" used to require clicking through page-by-page.
- **Bug report ambiguity** — Issue Capture gives us structured JSON instead of "it didn't work."

### 11.6 What it does NOT do

- It does not modify `clientData` — all features are read-only against user data
- It does not run fills in real mode — only Dry Run (which never touches the DOM) and Cascade Test (which touches it temporarily and reverts)
- It does not scrape dropdown options at scale (that was v0.7.2's Schema Scrape — it's gone, we don't need it because atoms verify via `ng-valid` not against a scraped option list)
- It does not fetch remote schemas or make external network calls except for Firestore writes in Issue Capture

---

## 12. Testing Strategy

Chrome extensions against a live external site are hard to test. The strategy has three layers:

### 11.1 Unit tests (Jest, jsdom)

- Pure functions only: transforms, dependency graph, value matching, abbreviation expansion
- Registry integrity: no duplicate keys, valid type enum, preconditions reference real atoms, no cycles
- ~200 tests, run in under 2 seconds

### 11.2 Fixture tests (recorded DOM snapshots)

- Capture `<body>` HTML from each EZLynx page during recon sessions
- Store as static HTML fixtures in `test/fixtures/`
- Load into jsdom, instantiate the orchestrator, run atoms against the fixture
- Assert: atoms reach DONE / SKIPPED / FAILED as expected
- Covers: locator resolves correctly, scope-based queries work, primitive fill methods produce expected state transitions
- ~50 fixture tests, run in under 10 seconds

Fixtures are deliberately small — enough to prove the mechanics, not a full regression suite. They cannot catch timing or Angular-reactive-form bugs (jsdom doesn't run Angular).

### 11.3 Manual validation protocol (live EZLynx)

- A scripted sequence of test cases the user runs against real EZLynx before a release
- Checklist form: "Fill applicant, verify all 38 expected DONE atoms match report"
- Includes multi-entity cases (2 drivers, 2 vehicles, 1 of each incident type)
- Includes LexisNexis-locked applicant case
- Documented in `test/manual-validation.md`

Not automated. Angular + production site + no test-mode API means this is the realistic ceiling.

---

## 13. Build Phases

**Real EZLynx flow order:** `/details` (applicant + co-applicant inline) → user picks auto OR home → rating sub-pages. The build phases mirror this.

Each phase is independently testable and shippable. At the end of each phase, the user runs the built-in Registry Audit (§11.4.2) + manual validation for that phase's pages before we advance.

### Phase 1 — Foundation + `/details` + Recon Tool

The biggest phase; it sets up the entire architecture and ships the single page users hit first.

**Foundation:**
- `manifest.json`, background service worker, altech-bridge
- Orchestrator + atom-executor + dependency-graph + fill-trace
- All fill primitives (text, date, currency, number, mat-select, mat-toggle, mat-radio)
- Locator + scope resolvers (driver, vehicle, co-applicant, incident scopes defined but only co-applicant exercised this phase)
- Verifier (ng-valid + error text extraction)
- Wait primitives (poll-predicate, wait-element, wait-enabled, wait-options-loaded, wait-child-atoms-ready)
- Transforms (abbreviations, currency-strip, phone-format)
- Router + route definitions
- Basic shadow-DOM toolbar UI + fill report panel

**Applicant/Co-applicant page (§6.1 + §6.5):**
- Applicant registry (45 atoms)
- Co-applicant registry with entity ID discovery (§7.6)
- Dynamic reveal handling for the co-applicant expansion panel
- Google Places dismiss (§7.2)
- LexisNexis lock detection + skip (§7.3)

**Built-in Recon Tool (§11):**
- All 6 features (Page Inventory, Registry Audit, Dry Run, Issue Capture, Cascade Test, Diff Registry)
- Admin gate via `chrome.storage.local.isAdmin`
- All three triggers (toolbar button, popup button, `Ctrl+Shift+A` keyboard shortcut)
- PII redactor
- Firestore write for Issue Capture

**Unit tests** for orchestrator, primitives, locator, verifier, transforms, dependency graph, registry integrity.

**Manual validation:**
- Fresh applicant page start-to-finish: ≥ 95% DONE rate
- Applicant + co-applicant with entity ID correctly resolved
- Recon Tool: Page Inventory captures `/details` identically to our Session 1 recon output
- Recon Tool: Registry Audit reports all 45 applicant atoms + all co-applicant atoms as ✅ Resolved

### Phase 2 — Auto rating flow

- Drivers-compact registry (§6.2) — 25 atoms per driver, container scoped to `additional-driver-fields[N]`, legacy `textD{N+1}DLNumber` / `drpD{N+1}DLState` exceptions
- Vehicles-compact registry (§6.3) — 21 atoms per vehicle, container scoped to `vehicle-fields[N]`, VIN decoder short-circuit (§7.1), legacy `textV1CostNew` exception
- Incidents registry (§6.4) — three sub-registries (accident/violation/comp loss), direct-id queries (no container), route-scoped atom loading to prevent `Amount-{N}` collisions
- Auto coverage page — brief recon via Recon Tool's Page Inventory, then registry built
- `add-entity.js` generic "Add Driver/Vehicle/Incident" button handler

**Manual validation:**
- Full auto quote with 2 drivers + 2 vehicles + 1 accident + 1 violation + 1 comp loss
- ≥ 95% DONE rate across all auto pages
- Zero cross-contamination between driver 0 and driver 1 atoms (verified by Dry Run against live page)

### Phase 3 — Home rating flow

- Home policy-info registry (§6.6) — 18 core atoms
- Home dwelling-info registry (§6.7) — 49 core atoms, explicit `yearUpdated{Heating,Electrical,Plumbing,Roofing}` ids, zero cascade preconditions
- Home coverage registry (§6.8) — 19 atoms, currency and deductible value transforms
- Home `/rating` setup page — carrier selection toggles (basic support, no cascades)
- Dynamic reveal for Pool/Dog/Trampoline on policy-info; First/Second/Third Mortgagee on coverage (§7.5)

**Manual validation:**
- Full home quote ≥ 95% DONE rate
- Deductible mat-selects match raw-number option texts correctly (no `$1,000` vs `1000` failures)
- Currency inputs display as `$XXX,XXX` after fill

### Phase 4 — Polish

- Fill report panel expanded with per-atom drill-down details
- LexisNexis lock detection UX: prominent "X fields locked" banner in report
- Error recovery: FAILED atoms are surfaced distinctly from SKIPPED
- Popup UI (dark mode, client card, action buttons, admin recon section)
- SPA nav detector (history monkey-patch + URL polling + MutationObserver)
- `Ctrl+Shift+A` keyboard shortcut wired globally

**Manual validation:**
- Full end-to-end quote: applicant → co-applicant → auto drivers → vehicles → incidents → home policy → dwelling → coverage
- Recon Tool's Issue Capture button tested against a deliberately-broken registry entry

### Phase 5 — Carrier-specific extensions

- Optional per-carrier atom extensions (`coverage_paperless_common`, `packagexmlKY`, `hail_allstatexmlKS`, `prior_liabilityasiMI`, `paidinfullasixmlny`, `coverage_accreditedbuilder_common`, `booktransfer`, `animalpremises_ml`, `allied_coolingyear`, `dwelling_hailresistantroof_common`, `residencewalls`)
- Loaded conditionally based on `clientData` keys present
- Registry Audit validates them only when the owning carrier is selected

**Manual validation:**
- Quotes against 2–3 specific carriers that use these fields
- Recon Tool reports carrier-specific atoms as ⏭ Conditionally skipped when the matching carrier isn't selected

---

## 14. What We're Deliberately NOT Doing

| Decision | Reasoning |
|---|---|
| **No record-and-replay** | Killed during brainstorming — doesn't handle branching |
| **No AI-based field matching** | Static registries are more reliable and faster |
| **No `window.ng.getComponent` integration** | Confirmed dead — production build strips it |
| **No `whenStable()` integration** | Confirmed dead — hangs indefinitely |
| **No property scraper changes** | User has other tools; `property-scraper.js` stays as-is |
| **No schema sync (remote + local + default merge)** | Static registries replace the 3-layer schema entirely. No remote fetch needed. No user scraping needed. No `defaultSchema.js` (3069 lines). |
| **No parallel fill passes** | One atom at a time, always |
| **No fallback chain to v1** | V2 is a clean break. If an atom fails, it's logged and the run continues. We do not fall back to named-selector fills. |
| **No positional fill engine** | Static id registries make this unnecessary |
| **No abbreviation expansion in mat-selects beyond the core set** | Small curated list (Gender M→Male, Marital M→Married, Education HS→High School, etc.) — anything else is caught by `valueTransform` per-atom |
| **No CDK overlay force-cleanup (`nukeOverlays`)** | Sequential atom execution means only one overlay is ever open at a time. No stale overlays to nuke. |
| **No "Hide Prefilled Answers" toggle interaction** | It's a UI affordance for humans; the extension ignores it |
| **No re-fill deduplication beyond the orchestrator's per-run state** | Re-triggering fill on a partially-filled page re-runs all atoms; `skipIfAlreadyFilled` handles idempotency |

---

## 15. Open Questions (to resolve during implementation)

| # | Question | How to resolve | Risk if wrong |
|---|---|---|---|
| 1 | Does `execCommand('insertText')` produce `ng-valid` on a fresh non-LexisNexis-locked DOB? | First time a non-locked DOB is encountered during Phase 1 validation — fall back to date strategy C (character-by-character keyboard events) if needed | Low — just swap date primitive |
| 2 | What is `#extended1` and `#driver_d1telematics_common` on the drivers page? | Read label during Phase 2 validation, add to registry | Low |
| 3 | Is the auto coverage page a flat registry like applicant? | Brief recon when we get to it in Phase 2 | Low — follow applicant pattern |
| 4 | What fields reveal under Pool / Dog / Trampoline / Business toggles? | Recon + add child atoms during Phase 4 | Low — dynamic reveal pattern already designed |
| 5 | What fields reveal under First/Second/Third Mortgagee toggles on home coverage? | Same as above | Low |
| 6 | What is the exact "Add Driver" button selector? (We know the text, not the id.) | Inspect during Phase 2 — likely a class or button:has-text pattern | Low |
| 7 | Are there carriers where specific fields are mandatory? (Affects atom `required` flags.) | Discover empirically during Phase 6 | Low |
| 8 | Does the SPA nav detector need to handle the service worker unload case? | Test during Phase 5 | Low |
| 9 | How do we detect and report LexisNexis lock cleanly? | Check for nearby text containing "LexisNexis" — but the selector is TBD | Low — fallback: treat as normal `disabled` skip |

All items are implementation-time details. **None are architectural.**

---

## 16. Success Criteria

V2 ships to production (replaces v0.7.2) when:

1. ✅ Applicant + Co-applicant page: 95%+ DONE rate across 10 test applicants (including co-applicant entity ID discovery)
2. ✅ Drivers page (2 drivers): 95%+ DONE rate, zero cross-contamination between drivers
3. ✅ Vehicles page (2 vehicles): 95%+ DONE rate, VIN decoder correctly short-circuits Year/Make/Model
4. ✅ Incidents page (1 of each type): 95%+ DONE rate
5. ✅ Home policy-info + dwelling-info + coverage: 95%+ DONE rate
6. ✅ Zero SILENT failures — every non-DONE atom is reported with a clear reason
7. ✅ Fill time: ≤ 90 seconds per page (slow-but-accurate, not fast-but-wrong)
8. ✅ LexisNexis-locked fields reported distinctly, user knows to handle manually
9. ✅ Total content script bundle ≤ 150KB (vs. current 266KB)
10. ✅ **Recon Tool functional:** Page Inventory, Registry Audit, Dry Run, Issue Capture, Cascade Test, Diff Registry all working against live EZLynx pages
11. ✅ **Recon Tool triggers:** toolbar button, popup button, and `Ctrl+Shift+A` keyboard shortcut all reach the same panel
12. ✅ **Recon Tool admin gate:** non-admin users see zero recon UI; admin users see full panel
13. ✅ **Issue Capture persistence:** Firestore writes succeed at `users/{uid}/reconReports/{timestamp}`, PII fields are redacted in output

---

## 17. Review Checklist

Before any code is written, the user reviews this plan and confirms or pushes back on:

- [ ] Architecture (sections 3–5) is the right approach
- [ ] Field registries (section 6) match the user's understanding of each page
- [ ] Special cases (section 7) cover all known quirks
- [ ] Module breakdown (section 8) is the right file structure
- [ ] Built-in Recon Tool (section 11) features + access model + triggers are correct
- [ ] Build phases (section 13) are the right sequence to ship value
- [ ] Success criteria (section 16) are the right bar
- [ ] Nothing in "what we're NOT doing" (section 14) should actually be in scope
- [ ] Any items in "open questions" (section 15) should be resolved before coding, not during

Once the user signs off, work proceeds with Phase 1.

---

*End of plan.*
