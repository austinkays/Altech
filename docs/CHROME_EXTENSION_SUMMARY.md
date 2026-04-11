# Altech EZLynx Chrome Extension — Comprehensive Summary

> **Purpose:** Full reference for planning an overhaul of the Chrome Extension.
> **Generated:** March 2026 | **Extension Version:** 0.7.2

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Inventory](#2-file-inventory)
3. [Architecture & Data Flow](#3-architecture--data-flow)
4. [manifest.json — Extension Configuration](#4-manifestjson)
5. [altech-bridge.js — Web App ↔ Extension Bridge](#5-altech-bridgejs)
6. [background.js — Service Worker](#6-backgroundjs)
7. [popup.html / popup.js — Extension Popup UI](#7-popuphtml--popupjs)
8. [content.js — Core Form Fill Engine (5,396 lines)](#8-contentjs--core-form-fill-engine)
   - 8.1 [Configuration & Fill Trace Logging](#81-configuration--fill-trace-logging)
   - 8.2 [Abbreviation Expansion System](#82-abbreviation-expansion-system)
   - 8.3 [Field Mapping Tables](#83-field-mapping-tables)
   - 8.4 [Utility Functions](#84-utility-functions)
   - 8.5 [Toggle Filling System](#85-toggle-filling-system)
   - 8.6 [Fill Primitives](#86-fill-primitives)
   - 8.7 [Floating Toolbar (Shadow DOM)](#87-floating-toolbar-shadow-dom)
   - 8.8 [Fill Orchestration — fillPage()](#88-fill-orchestration--fillpage)
   - 8.9 [Multi-Driver / Multi-Vehicle Fill](#89-multi-driver--multi-vehicle-fill)
   - 8.10 [Incident Fill System](#810-incident-fill-system)
   - 8.11 [SPA Navigation Detection](#811-spa-navigation-detection)
   - 8.12 [Page Scraper — scrapePage() (6-Phase)](#812-page-scraper--scrapepage-6-phase)
   - 8.13 [Route Registry & Positional Fill (§13–§15)](#813-route-registry--positional-fill-1315)
   - 8.14 [Message Handling & Init](#814-message-handling--init)
9. [property-scraper.js — Property Data Extraction](#9-property-scraperjs)
10. [defaultSchema.js — Built-in Dropdown Options](#10-defaultschemajs)
11. [Complete Field Inventory](#11-complete-field-inventory)
12. [Data Shapes & Key Mappings](#12-data-shapes--key-mappings)
13. [Known Limitations & Pain Points](#13-known-limitations--pain-points)
14. [Schema System (3-Layer Merge)](#14-schema-system-3-layer-merge)
15. [Angular Material Handling Patterns](#15-angular-material-handling-patterns)
16. [Overhaul Considerations](#16-overhaul-considerations)

---

## 1. Overview

The **Altech EZLynx Filler** is a Manifest V3 Chrome Extension that auto-fills insurance forms on the EZLynx rating platform (`*.ezlynx.com`) with client data from the Altech web app. It also scrapes property data from real estate and GIS websites and scrapes EZLynx form options to build a schema for fuzzy matching.

### Core Capabilities

| Capability | Description |
|-----------|-------------|
| **Form Fill** | Fills applicant, auto (vehicles/drivers/incidents), and home (dwelling/coverage/policy) forms |
| **Co-Applicant** | Clicks "Add contact", toggles co-applicant switch, fills sub-form, clicks "Done" |
| **Multi-Entity** | Fills multiple drivers, vehicles, and incidents (accidents, violations, comp losses) |
| **Property Scraping** | Scrapes 28 property fields from Zillow, Redfin, GIS/assessor sites, and generic pages |
| **EZLynx Scraping** | Scrapes all form field options from EZLynx pages to build a live schema |
| **Fuzzy Matching** | Uses Dice coefficient similarity to match dropdown values against scraped options |
| **Schema Sync** | 3-layer schema merging: built-in defaults → remote Vercel schema → local scrapes |
| **Floating Toolbar** | Shadow DOM isolated toolbar on EZLynx pages for quick Fill/Report/Close actions |
| **Positional Fill** | Route-aware strategy using DOM field order + known field sequence per page |
| **Manual Paste** | Fallback textarea for pasting JSON client data when the bridge isn't available |

---

## 2. File Inventory

| File | Lines | Size | Purpose |
|------|------:|------|---------|
| `manifest.json` | ~40 | 1.1 KB | Extension config — permissions, content scripts, service worker |
| `altech-bridge.js` | ~120 | 4.4 KB | Lightweight bridge injected into Altech web app pages |
| `background.js` | ~340 | 10.5 KB | Service worker — message relay, schema management, script injection |
| `popup.html` | ~380 | 14.6 KB | Extension popup UI — dark/light mode, client card, actions |
| `popup.js` | ~750 | 27.7 KB | Popup logic — data loading, fill commands, property scraping, admin tools |
| `content.js` | 5,396 | 265.9 KB | **Core engine** — form filling, page scraping, toolbar, SPA detection |
| `property-scraper.js` | 671 | 28.5 KB | Property data extraction from real estate/GIS websites |
| `defaultSchema.js` | 3,069 | 51 KB | Built-in dropdown option schema (198 dropdown fields) |
| **Total** | **~10,764** | **~403 KB** | |

---

## 3. Architecture & Data Flow

### Fill Flow (Happy Path)

```
Altech Web App                Chrome Extension               EZLynx
─────────────                 ────────────────               ──────
User clicks "Send to EZLynx"
      │
      ├──postMessage──→ altech-bridge.js
      │                       │
      │                 chrome.storage.local.set({clientData})
      │                       │
      │                 background.js (relay)
      │                       │
      │                 content.js receives fillPage msg
      │                       │
      │                 §15 fillPageSequential()
      │                   ├── matchRoute() → ROUTE_TABLE
      │                   ├── harvestFormFields()
      │                   ├── positional fill (DOM order matching)
      │                   └── fallback to fillPage() (named selectors)
      │                         ├── fillToggles (TOGGLE_MAP)
      │                         ├── fillText (BASE/AUTO/HOME_TEXT_FIELDS)
      │                         ├── fillDropdowns (fuzzy match via schema)
      │                         ├── Co-Applicant injection
      │                         ├── Multi-driver/vehicle fill
      │                         └── Incident fill
      │                                              │
      │                                        Filled forms
```

### Scrape Flow

```
EZLynx page                   content.js                    Popup/Storage
───────────                    ──────────                    ─────────────
scrapePage() triggered
      │
      ├── Phase 1: Text inputs, checkboxes, radios, toggles
      ├── Phase 2: Native <select> dropdowns
      ├── Phase 3: Angular Material dropdowns (open → scrape → close)
      ├── Phase 3c: Industry→Occupation dependent cascade
      ├── Phase 3d: CASCADE_DEFS (6 parent→child relationships)
      ├── Phase 4: Deep Scrape (expand hidden toggles)
      ├── Phase 5: Prior Address Reveal (set low YearsAtAddress)
      └── Phase 6: Button Expansion (Co-Applicant panel)
              │
              └──→ Merged into schemaData → chrome.storage.local
```

### Property Scrape Flow

```
User clicks "Grab Property"
      │
      ├── popup.js → background.js
      │         │
      │   chrome.scripting.executeScript(property-scraper.js)
      │         │
      │   IIFE runs on active tab:
      │     ├── detectSiteType() → zillow/redfin/gis/generic
      │     ├── Site-specific scraper (regex on pageText)
      │     ├── Generic strategies: tables, DLs, key-value, text lines
      │     └── ArcGIS popup panel scrape
      │         │
      │   Returns { siteType, data, fieldsFound, fieldCount }
      │         │
      └── popup.js displays results + stores in chrome.storage.local
```

---

## 4. manifest.json

```json
{
  "manifest_version": 3,
  "name": "Altech EZLynx Filler",
  "version": "0.7.2",
  "permissions": ["activeTab", "tabs", "storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": ["*://*.ezlynx.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "*://altech-app.vercel.app/*",
        "*://altech.agency/*",
        "*://localhost:3000/*"
      ],
      "js": ["altech-bridge.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [{
    "resources": ["defaultSchema.js"],
    "matches": ["<all_urls>"]
  }]
}
```

**Key points:**
- `<all_urls>` host permission enables property scraping on any website
- `content.js` only auto-injects on `*.ezlynx.com`
- `altech-bridge.js` auto-injects on Altech domains + localhost
- `defaultSchema.js` is web-accessible for import by other scripts

---

## 5. altech-bridge.js

**Role:** Lightweight content script injected on Altech web app pages. Listens for `postMessage` events from the app and relays data to `chrome.storage.local`.

### Message Types Handled

| Message Type | Action |
|-------------|--------|
| `ALTECH_CLIENT_DATA` | Stores `clientData` in `chrome.storage.local` |
| `ALTECH_ADMIN_UPDATE` | Stores `isAdmin` boolean |
| `REQUEST_PROPERTY_DATA` | Reads `propertyData` from storage, posts back to page |

### Handshake

On injection, sends `ALTECH_BRIDGE_READY` postMessage to the page so the Altech web app knows the extension is installed. The web app uses this to show/hide the "Send to EZLynx" button.

### Data Shape Stored

```javascript
chrome.storage.local.set({
  clientData: {
    FirstName, LastName, DOB, Gender, MaritalStatus,
    Address, City, State, Zip, County,
    // ... all applicant + property + auto + home fields
    CoApplicant: { FirstName, LastName, ... },
    Drivers: [{ FirstName, LastName, DOB, ... }],
    Vehicles: [{ VIN, Year, Make, Model, ... }],
    Incidents: [{ Type, Date, Description, ... }],
  },
  isAdmin: true/false
});
```

---

## 6. background.js

**Role:** Service worker handling message relay, schema management, and script injection.

### Schema Management

On startup, fetches the remote schema from `https://altech.agency/ezlynx_schema.json` and performs a 3-layer merge:

```
DEFAULT_SCHEMA (built-in, 198 fields)
     ↓ merged with
Remote schema (Vercel-hosted, synced periodically)
     ↓ merged with
Local scrapes (user's own scrape results from EZLynx)
     ↓
Final merged schema → chrome.storage.local.schemaData
```

### Message Handlers

| Message Type | Action |
|-------------|--------|
| `fillPage` | Ensures content.js is injected, sends fill command |
| `getPageInfo` | Forwards to content.js, returns page detection result |
| `scrapePage` | Forwards to content.js, merges results into schema |
| `scrapeProperty` | Injects `property-scraper.js` into active tab via `chrome.scripting.executeScript` |
| `getPropertyData` | Returns stored `propertyData` from `chrome.storage.local` |

### ensureContentScript()

Programmatically injects `content.js` into EZLynx tabs if not already present. Uses `chrome.tabs.sendMessage` with a `ping` to detect if the script is loaded; if no response, injects via `chrome.scripting.executeScript`.

### Default Settings

```javascript
{
  autoShowToolbar: true,
  fillDelay: 150,
  dropdownWait: 800
}
```

---

## 7. popup.html / popup.js

### UI Sections

| Section | Description |
|---------|-------------|
| **Header** | Extension name, version, settings gear, dark/light toggle |
| **Client Card** | Shows loaded client name, or "No client" prompt |
| **Page Detection** | Detects current EZLynx page type, shows mapped fields |
| **Manual Paste** | Textarea fallback for pasting JSON client data |
| **Action Buttons** | Fill, Re-fill, Clear, Grab Property, Paste |
| **Admin Zone** | (Admin only) Scrape current page, schema stats, export schema |
| **Property Results** | Displays scraped property data fields |
| **Status Bar** | Shows operation progress and results |
| **Footer** | Version number |

### Page Detection Map

popup.js maps URL patterns to page types and their expected fields:

| Page Type | URL Pattern | Key Fields |
|-----------|-------------|------------|
| `applicant` | `/details` | Name, DOB, Gender, Address, DL, Education, Industry |
| `auto-policy` | `/rating/auto/*/policy` | Prior Carrier, Years, Effective Date |
| `auto-driver` | `/rating/auto/*/drivers` | Name, DOB, DL, Occupation, Discounts |
| `auto-vehicle` | `/rating/auto/*/vehicles` | VIN, Year, Make, Model, Use, Miles |
| `auto-coverage` | `/rating/auto/*/coverage` | BI, PD, UM/UIM, Comp, Coll, MedPay |
| `auto-incident` | `/rating/auto/*/incidents` | Type, Date, Description, Amount |
| `home-dwelling` | `/rating/home/*/dwelling` | Structure, Roof, Foundation, Heating |
| `home-coverage` | `/rating/home/*/coverage` | Dwelling, Liability, Deductibles |
| `lead-info` | `/lead` | Contact info fields |

### Admin Features

When `isAdmin === true` in storage, the popup shows:
- **Scrape button** — triggers `scrapePage()` on the active EZLynx tab
- **Schema stats** — shows total fields tracked, options per field, last update
- **Export Schema** — downloads `ezlynx_schema.json` with all scraped options

---

## 8. content.js — Core Form Fill Engine

The single largest file (5,396 lines / 266 KB). Contains everything needed to fill EZLynx forms and scrape their options.

### 8.1 Configuration & Fill Trace Logging

**Constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `FILL_DELAY` | 400 ms | Delay between individual fill operations |
| `DROPDOWN_WAIT` | 1200 ms | Wait time after opening a dropdown overlay |
| `RETRY_WAIT` | 2000 ms | Wait before retrying failed dropdowns |

**Fill Trace:** Structured logging system with emoji badges for tracking fill operations:

| Badge | Meaning |
|-------|---------|
| ✅ | Successfully filled |
| ⬜ | Skipped (empty value or duplicate) |
| 🔄 | Retrying |
| 🔁 | Retry succeeded |
| ⚠️ | Failed |
| ℹ️ | Info/status update |

Each fill operation is logged with field name, value attempted, and result. The fill trace is displayed in the toolbar's injection report panel.

### 8.2 Abbreviation Expansion System

A massive expansion lookup (`ABBREV_MAP` + `CONTEXT_ABBREVS`) that normalizes short codes to the full strings EZLynx expects. The `expand(value, fieldKey)` function applies context-aware expansion.

**Example expansions:**

| Category | Sample Input | Expanded Output |
|----------|-------------|-----------------|
| Gender | `M` | `Male` |
| Gender | `F` | `Female` |
| Marital | `S` | `Single` |
| Marital | `M` | `Married` |
| States | `WA` | `WA` (no expansion needed for selects) |
| Education | `HS` | `High School` |
| Education | `BA` | `Bachelors` |
| Suffixes | `Jr` | `Jr.` |
| Vehicle Use | `P` | `Pleasure` |
| Vehicle Use | `C` | `Commute` |
| Dwelling Type | `SF` | `Single Family` |
| Occupancy | `O` | `Owner` |
| Foundation | `S` | `Slab` |
| Foundation | `C` | `Crawl Space` |
| Ext. Walls | `V` | `Vinyl Siding` |
| Roof Type | `C` | `Composition Shingle` |
| Roof Shape | `G` | `Gable` |
| Construction | `F` | `Frame` |
| Heating | `FA` | `Forced Air` |
| Alarms | `C` | `Central` |
| Pool | `IG` | `In Ground` |
| Pool | `AG` | `Above Ground` |
| Policy Type | `HO3` | `HO-3 (Special)` |

**Context-aware:** The same abbreviation can expand differently based on `fieldKey`. For example, `M` → `Male` for Gender but `M` → `Married` for Marital Status.

### 8.3 Field Mapping Tables

Three tiers of CSS selector arrays map Altech field keys to EZLynx DOM elements.

#### BASE_TEXT_FIELDS (12 fields — shared across all page types)

| Altech Key | EZLynx Selectors (excerpt) |
|-----------|---------------------------|
| `FirstName` | `#applicant-first-name`, `input[formcontrolname="firstName"]` |
| `LastName` | `#applicant-last-name`, `input[formcontrolname="lastName"]` |
| `DOB` | `#applicant-date-of-birth`, `input[formcontrolname="dateOfBirth"]` |
| `Address` | `#applicant-primary-address-line1`, `input[formcontrolname="addressLine1"]` |
| `City` | `#applicant-primary-address-city`, `input[formcontrolname="city"]` |
| `Zip` | `#applicant-primary-address-zip`, `input[formcontrolname="postalCode"]` |
| `MiddleInitial` | `input[formcontrolname="middleName"]` |
| `SSN` | `input[formcontrolname="socialSecurityNumber"]` |
| `DLNumber` | `input[formcontrolname="driversLicenseNumber"]` |
| `Email` | `input[formcontrolname*="email"][formcontrolname*="address" i]` |
| `Phone` | `input[formcontrolname*="phone"][formcontrolname*="number" i]` |
| `MaidenName` | `input[formcontrolname="maidenName"]` |

#### AUTO_TEXT_FIELDS (6 fields)

| Altech Key | Target |
|-----------|--------|
| `VIN` | `input[formcontrolname="vin"]` |
| `VehicleYear` | `input[formcontrolname="year"]` |
| `AnnualMiles` | `input[formcontrolname="annualMilesDriven"]` |
| `CurrentOdometer` | `input[formcontrolname="currentOdometer"]` |
| `CostNew` | `input[formcontrolname="costNewOriginal"]` |
| `PurchaseDate` | `input[formcontrolname="purchaseDate"]` |

#### HOME_TEXT_FIELDS (12+ fields)

| Altech Key | Target |
|-----------|--------|
| `SqFt` | `input[formcontrolname="squareFootage"]` |
| `YearBuilt` | `input[formcontrolname="yearBuilt"]` |
| `PurchasePrice` | `input[formcontrolname="purchasePrice"]` |
| `DwellingCoverage` | `input[formcontrolname*="dwelling" i]` near "Dwelling" label |
| `FeetFromHydrant` | `input[formcontrolname="feetFromHydrant"]` |
| `DistanceFireStation` | `input[formcontrolname="distanceFromFireStation"]` |
| `DistanceTidalWater` | `input[formcontrolname="distanceToTidalWater"]` |
| + more | Coverage amounts, prior policy fields, update years |

#### BASE_DROPDOWN_LABELS (21+ fields found by label text)

Includes: Prefix, Suffix, Gender, Marital Status, State, County, Education, Industry, Occupation, DL Status, DL State, Address Type, Years At Address, Months At Address, Phone Type, Email Type, Contact Method, Contact Time, Preferred Language, Applicant Type, Lead Source

#### AUTO_DROPDOWN_LABELS (29+ fields)

Includes: Vehicle Make, Vehicle Model, Sub-Model, Vehicle Use, Ownership Type, Passive Restraints, Anti-Lock Brakes, Anti-Theft, Performance, Daytime Running Lights, Telematics, Age Licensed, Rated Driver, SR-22 Required, FR-44 Required, Good Student, Good Driver, Driver Education, Mature Driver, Relationship, and all incident-related selects.

#### HOME_DROPDOWN_LABELS (35+ fields)

Includes: Dwelling Type, Dwelling Usage, Occupancy Type, Number of Stories, Construction Style, Exterior Walls, Foundation Type, Roof Type, Roof Design, Heating Type, Heating Source Type, Fire Detection, Sprinkler System, Smoke Detector, Burglar Alarm, Dead Bolt, Protection Class, # Wood Burning Stoves, Number of Full/Half Baths, Number of Occupants, Plus all coverage dropdowns (deductibles, liability limits, etc.) and update year fields.

### 8.4 Utility Functions

| Function | Purpose |
|----------|---------|
| `similarity(a, b)` | Dice coefficient bigram similarity (0–1 scale). Used for fuzzy matching dropdown options. |
| `bestMatch(target, options)` | Returns best-matching option from array using `similarity()`. Cutoff: 0.4. |
| `expand(value, fieldKey)` | Context-aware abbreviation expansion. |
| `isVisible(el)` | Checks `offsetParent`, `display`, `visibility`, `aria-hidden`. |
| `wait(ms)` | Promise-based delay. |
| `waitForElement(selector, timeout)` | Polls for element appearance (default 5s timeout). |
| `dismissOverlay()` | Clicks away from CDK overlay backdrops to close open dropdowns. |
| `setInputValue(el, value)` | Angular-compatible value setter — sets `el.value`, dispatches `input`, `change`, `blur` events + Angular's `ngModelChange`. |
| `findLabelFor(el)` | Multi-strategy label finder: `label[for]`, parent `<label>`, closest `.mat-form-field` container, `aria-label`, `placeholder`. |

### 8.5 Toggle Filling System

**TOGGLE_MAP** defines 17 boolean toggle fields:

| Altech Key | EZLynx Label Text |
|-----------|-------------------|
| `Pool` | "Is there a swimming pool on the premises?" |
| `Dogs` | "Are dogs on the premises?" |
| `Trampoline` | "Trampoline" |
| `BusinessOnPremises` | "Is there a business or daycare on the premises?" |
| `CreditCheckAuth` | "Credit Check and Other Underwriting Reports Authorized" |
| `QuoteAsPackage` | "Quote as Package" |
| `PriorDamage` | "Prior Damage Present" |
| `AlternateGarage` | "Alternate Garage" |
| `UsedForDelivery` | "Used For Delivery" |
| `WithinFireDistrict` | "Within Fire District" |
| `InsideCityLimits` | "Inside City Limits" |
| `NonSmoker` | "Non Smoker" |
| `RetireesCredit` | "Retirees Credit" |
| `MatureDiscount` | "Mature Discount" |
| `RetirementCommunity` | "Retirement Community" |
| `GatedCommunity` | "Gated Community" |
| `MannedSecurity` | "Manned Security" |

**`findToggleByLabel(labelText)`** handles 4 Angular Material toggle types:
1. `mat-slide-toggle` — clicks the toggle element
2. `mat-checkbox` — clicks the checkbox element
3. `mat-radio-button` — finds "Yes" radio option and clicks it
4. Native `<input type="checkbox">` — sets `.checked` property

### 8.6 Fill Primitives

| Function | Handles | Strategy |
|----------|---------|----------|
| `fillText(selectors[], value)` | Text inputs | Iterates selectors, calls `setInputValue()` on first visible match |
| `fillTextByLabel(label, value)` | Text inputs (by label) | Finds input near label text, calls `setInputValue()` |
| `fillNativeSelect(selectors[], value)` | `<select>` dropdowns | Sets `.value` on first match, dispatches `change` event |
| `fillCustomDropdown(selectors[], value, fieldKey)` | Angular `mat-select` | Opens CDK overlay, waits for options, fuzzy-matches using schema, clicks best match |
| `fillScopedText(container, selectors[], value)` | Scoped text (e.g., Co-Applicant modal) | Same as fillText but within a container |
| `fillScopedDropdown(container, selectors[], value, key)` | Scoped dropdowns | Same as fillCustomDropdown but within a container |
| `fillMatSelectById(selector, value, key)` | Mat-select by exact selector | Direct selector-based fill |
| `fillMatSelectByEl(el, value, key)` | Mat-select by DOM reference | For positional fill engine |
| `fillElementPositional(el, value, label)` | Any element (positional) | Routes to correct primitive based on tag name |

#### fillCustomDropdown Detail (the most complex primitive)

1. Clicks the `mat-select` trigger to open the CDK overlay panel
2. Waits up to `DROPDOWN_WAIT` (1200ms) for `mat-option` elements to appear
3. Collects all visible option texts
4. Tries exact match first, then case-insensitive match
5. Falls back to `bestMatch()` (Dice coefficient fuzzy match, cutoff 0.4)
6. If schema has pre-scraped options for this field, matches against those too
7. Clicks the winning `mat-option` element
8. Calls `dismissOverlay()` to close the panel

### 8.7 Floating Toolbar (Shadow DOM)

Injected into EZLynx pages as a fixed-position floating toolbar isolated inside a Shadow DOM to prevent CSS conflicts with EZLynx's styles.

**Features:**
- Draggable (mousedown/mousemove/mouseup handlers)
- Fill button — triggers `fillPageSequential()` with stored `clientData`
- Report button — toggles fill trace panel showing all operations
- Close button — removes toolbar from page
- Client name display — updates via `chrome.storage.onChanged` listener
- Status text — shows progress during fill operations

**Auto-show:** Only auto-shows on `/web/account/create/personal` (new applicant page). On other pages, appears after a fill is triggered from the popup.

**Injection report panel:** Expandable section showing every fill operation with emoji badges, field names, attempted values, and success/failure status.

### 8.8 Fill Orchestration — fillPage()

The legacy fill function (now also used as fallback by `fillPageSequential()`). Executes fills in a specific order to handle dependencies.

#### Fill Order

1. **Toggles FIRST** — Fills all TOGGLE_MAP fields (some reveal hidden sections)
2. **Text fields** — BASE_TEXT_FIELDS + contextual (AUTO/HOME)_TEXT_FIELDS
3. **Dropdowns** — With priority ordering:
   - **State** (first — many other fields depend on it)
   - **Industry** (second — Occupation depends on it)
   - **Occupation** (third — must wait for Industry)
   - **County** (fourth — depends on State)
   - All remaining dropdowns

#### Smart Pre-Processing

Before filling, `fillPage()` performs:
- **ZIP truncation:** Strips ZIP to 5 digits (removes +4 suffix)
- **Fuzzy pre-matching:** For each dropdown, compares the intended value against the schema's scraped options using `bestMatch()`. If the fuzzy match succeeds, uses the matched option text instead of the raw value (prevents "No match" failures).
- **Duplicate detection:** Uses `_filledSig` Map to track `fieldKey + value` pairs and skip already-filled fields (prevents double-fills on re-trigger).

#### Retry Logic

After the initial fill pass, waits `RETRY_WAIT` (2000ms) and retries all failed dropdowns. This handles cases where:
- Angular was still loading options when the first attempt ran
- A dependent cascade hadn't completed yet
- The CDK overlay was blocked by another overlay

#### Co-Applicant Injection

If `clientData.CoApplicant` exists:
1. Clicks the "Add contact" button
2. Waits for the contact panel/modal to appear
3. Finds and clicks the Co-Applicant toggle (`#additional-contact-is-co-applicant-0-button` or label text fallback)
4. Fills all Co-Applicant text fields using `§4b` exact CSS ID selectors
5. Fills Co-Applicant dropdown fields (Gender, Marital, Suffix, Prefix, etc.)
6. Handles Industry→Occupation dependency (fills Industry, waits, then fills Occupation)
7. Clicks the "Done" button to save the contact

**§4b Co-Applicant ID Selectors (exact):**

| Field | Selector |
|-------|----------|
| First Name | `#contact-first-name-0` |
| Last Name | `#contact-last-name-0` |
| DOB | `#contact-date-of-birth-0` |
| Address | `#contact-address-0-line1` |
| City | `#contact-address-0-city` |
| Zip | `#contact-address-0-postalCode` |
| SSN | `#contact-ssn-0` |
| DL# | `#contact-drivers-license-number-0` |
| Email | `#contact-email-address-0-0` |
| Phone | `#contact-phone-number-0-0` |
| Middle | `#contact-middle-name-0` |
| Maiden | `#contact-maiden-name-0` |
| Nickname | `#contact-nick-name-0` |

#### ADDRESS_INHERITED_FIELDS

Three fields are shared between applicant and co-applicant when they share an address:
- County
- Years At Address
- Months At Address

These are skipped during co-applicant fill when the co-applicant has the same address as the primary applicant.

### 8.9 Multi-Driver / Multi-Vehicle Fill

#### clickAddButton(textPattern)

Generic utility that finds and clicks a button matching a text pattern (e.g., "Add Driver", "Add Vehicle"). Uses regex matching against button text content.

#### fillDriverFields(driverData, index)

Maps driver data to EZLynx fields for a single driver:

| Altech Key | EZLynx Field |
|-----------|-------------|
| `FirstName` | First Name |
| `LastName` | Last Name |
| `DOB` | Date of Birth |
| `Gender` | Gender |
| `MaritalStatus` | Marital Status |
| `DLNumber` | DL# |
| `DLState` | DL State |
| `DLStatus` | DL Status |
| `Occupation` | Occupation Title |
| `Industry` | Occupation Industry |
| `AgeLicensed` | Age Licensed |
| `Relationship` | Relationship |
| SR-22/FR-44 Required | Toggle/select fields |
| Good Student/Driver | Toggle/select fields |
| Mature Driver | Toggle/select |

#### fillVehicleFields(vehicleData, index)

Maps vehicle data to EZLynx fields:

| Altech Key | EZLynx Field |
|-----------|-------------|
| `VIN` | VIN |
| `Year` | Year |
| `Make` | Make |
| `Model` | Model |
| `SubModel` | Sub-Model |
| `VehicleUse` | Vehicle Use |
| `AnnualMiles` | Annual Miles |
| `CurrentOdometer` | Current Odometer |
| `OwnershipType` | Ownership Type |
| `PurchaseDate` | Purchase Date |
| `CostNew` | Cost New Value |

#### fillMultiDrivers() / fillMultiVehicles()

Iterates the `Drivers[]` / `Vehicles[]` arrays. For the first entry, fills directly. For subsequent entries, calls `clickAddButton()` to add a new row, waits for Angular to render the new fields, then fills.

### 8.10 Incident Fill System

Three incident types with separate field naming patterns:

#### Accident Fields (per incident `i`)

| Field | Selector Pattern |
|-------|-----------------|
| Date | `accidentDate-{i}` |
| Description | `accidentDescription-{i}` |
| Amount | `accidentAmount-{i}` |
| At Fault | `accidentAtFault-{i}` |
| BI Paid | `accidentBIPaid-{i}` |
| PD Paid | `accidentPDPaid-{i}` |

#### Violation Fields (per incident `i`)

| Field | Selector Pattern |
|-------|-----------------|
| Date | `violationDate-{i}` |
| Description | `violationDescription-{i}` |
| State | `violationState-{i}` |
| Conviction Date | `violationConviction-{i}` |
| Speed Over | `violationSpeedOver-{i}` |

#### Comprehensive Loss Fields (per incident `i`)

| Field | Selector Pattern |
|-------|-----------------|
| Date of Loss | `compLoss-dateOfLoss-{i}` |
| Description | `compLoss-description-{i}` |
| Amount | `compLoss-amount-{i}` |
| Deductible Waived | `compLoss-deductibleWaived-{i}` |

#### fillMultiIncidents()

1. Separates `Incidents[]` array by `Type` field (Accident, Violation, CompLoss)
2. Fills each section separately using the appropriate field naming pattern
3. Clicks "Add" buttons as needed for multiple incidents within each type
4. Uses `fillById()` helper with partial ID fallback for resilient element targeting

### 8.11 SPA Navigation Detection

EZLynx is an Angular SPA — traditional page load events don't fire during navigation. content.js uses four detection methods running in parallel:

| Method | Mechanism |
|--------|-----------|
| **URL Polling** | `setInterval` every 1 second, compares `location.href` to last known URL |
| **popstate/hashchange** | Standard history event listeners |
| **MutationObserver** | Observes `<body>` for child list changes (Angular component swaps) |
| **History Monkey-Patch** | Overrides `history.pushState` and `history.replaceState` to intercept Angular Router navigation |

**`onPageChange()`** fires when any method detects a URL change:
- Auto-shows the floating toolbar on `/web/account/create/personal`
- Re-injects toolbar if Angular removed it from the DOM
- Logs the new page detection result

### 8.12 Page Scraper — scrapePage() (6-Phase)

The most complex function in the extension (~2,000 lines). Scrapes all form field options from the current EZLynx page to build a comprehensive schema. Only available to admin users.

#### Phase 1: Basic Fields

Scrapes all visible form elements:
- **Text inputs:** Records `formcontrolname`, `id`, `name`, `placeholder`, label
- **Checkboxes / Radios:** Records current state and label
- **mat-checkbox:** Angular Material checkboxes with label text
- **mat-slide-toggle:** Angular Material toggles with label text

#### Phase 2: Native `<select>` Dropdowns

For each visible `<select>` element:
1. Records the label (via `findLabelFor()`)
2. Iterates all `<option>` children
3. Stores as `{ label: [option1, option2, ...] }`

#### Phase 3: Angular Material Dropdowns

For each visible `mat-select` element:
1. Clicks to open the CDK overlay panel
2. Waits for `mat-option` elements to appear
3. Scrapes all option texts
4. Closes the dropdown (clicks backdrop + `dismissOverlay()`)
5. Stores as `{ label: [option1, option2, ...] }`

**Priority targets:** Key dropdowns (Gender, State, County, Industry) are force-opened even if they appear disabled or collapsed.

**Helper functions:**
- `nukeOverlays()` — force-removes stale CDK overlay containers
- `closeDropdown()` — multi-strategy dropdown close (Escape keypress → backdrop click → body click)

#### Phase 3c: Industry→Occupation Dependent Cascade

The most intricate scraping sequence. Occupation dropdown is disabled until Industry is selected.

**Strategy:**
1. Find the Industry dropdown element using 5+ fallback strategies:
   - `mat-select[formcontrolname="industry"]`
   - `findLabelFor()` matching "Industry"
   - Broad label text search across all `mat-form-field` containers
   - `aria-label` attribute search
   - `placeholder` text search
   - Wrapper `<label>` search
   - `findDropdownByLabel('Industry')` utility
   - `DROPDOWN_SELECT_MAP.Industry` fallback
2. Open Industry, scrape its options
3. Set Industry to `"Retired"` (this unlocks the most Occupation options)
4. Wait for Occupation to become enabled
5. Find and open Occupation dropdown
6. Scrape all Occupation options
7. Restore Industry to blank/original value

#### Phase 3d: CASCADE_DEFS System

A generic parent→child cascade engine for scraping dependent dropdown pairs. Defines 6 cascade relationships:

| Parent | Trigger Value | Child | Purpose |
|--------|--------------|-------|---------|
| Garage Type | "Attached" | Garage Spaces | Spaces only appear when type is set |
| Dwelling Type | "Single Family" | Number of Stories | Stories depend on dwelling type |
| Dwelling Type | "Single Family" | Construction Style | Style depends on dwelling type |
| Roof Type | "Asphalt/Fiberglass Shingles" | Roof Design | Design depends on roof material |
| Industry | "Retired" | Occupation | Safety net (backup for Phase 3c) |
| Vehicle Year | "2020" | Vehicle Make | Make list depends on year |

**Cascade execution:**
1. Find parent dropdown (by `formcontrolname`, label, or `findDropdownByLabel()`)
2. Open, fill with trigger value, close
3. Wait for child to become enabled
4. Open child, scrape all options
5. Restore parent to blank/original

**Deduplication:** Uses `cascadeParentsFilled` Set to prevent re-scraping the same parent when multiple children depend on it.

#### Phase 4: Deep Scrape

Expands hidden form sections by toggling inactive controls:
1. Finds all `mat-slide-toggle` in OFF state, clicks each ON
2. Finds all `mat-checkbox` in unchecked state, checks each
3. Finds all `mat-radio-button` "Yes" options not currently selected
4. After each toggle, scrapes any newly revealed fields
5. **Restores** all toggles to their original state after scraping

Uses a snapshot/diff approach: takes a snapshot of known fields before toggling, scrapes after, and only records the new fields.

#### Phase 5: Prior Address Reveal

Some address fields only appear when `Years At Address` is low:
1. Finds `YearsAtAddress` element (handles `<input>`, `mat-select`, or native `<select>`)
2. Sets it to a low value (`"1"`)
3. Waits for Angular to reveal prior address fields
4. Scrapes the new fields
5. Restores `YearsAtAddress` to its original value

#### Phase 6: Button Expansion (Co-Applicant)

Scrapes the Co-Applicant sub-form:
1. Clicks the "Add contact" button
2. Waits for the contact panel/modal to appear
3. Activates the Co-Applicant toggle (by ID `#additional-contact-is-co-applicant-0-button` or text fallback)
4. Runs a **Mini-Cascade** for Co-Applicant Industry→Occupation
5. Scrapes all new fields in the expanded panel
6. **Cleans up:** Finds the delete/remove button, clicks it, handles the confirmation dialog ("Are you sure?" → click "Yes"/"OK"/"Confirm")

### 8.13 Route Registry & Positional Fill (§13–§15)

A newer, more reliable fill strategy that supplements the named-selector approach.

#### ROUTE_TABLE (§13)

Maps URL patterns to page definitions with ordered field sequences:

| Route Pattern | Page Name | Field Count |
|--------------|-----------|:-----------:|
| `/details` | Applicant Info | 44 |
| `/details#co-applicant` | Co-Applicant Modal | 34 |
| `/rating/auto/*/vehicles-compact` | Auto Vehicles | 24 |
| `/rating/auto/*/drivers-compact` | Auto Drivers | 26 |
| `/rating/home/*/rating` | Home Rating Setup | 4 |
| `/rating/home/*/policy-info` | Home Policy Info | 17 |
| `/rating/home/*/dwelling-info` | Home Dwelling Info | 47 |
| `/rating/home/*/coverage` | Home Coverage | 15 |

Each route has `fieldsInOrder[]` — an array of label strings in the exact DOM top-to-bottom order (verified against live EZLynx screenshots).

#### FIELD_LABEL_MAP (§15)

Maps EZLynx label text → Altech client data key. ~80 mappings covering all page types:

**Applicant:** Prefix, First Name, Middle Initial, Last Name, Suffix, Gender, DOB, Marital Status, SSN, DL#, DL Status, DL State, Education, Industry, Occupation, Address, City, State, County, Zip, Email, Phone, etc.

**Auto Vehicle:** VIN, Year, Make, Model, Sub-Model, Annual Miles, Odometer, Vehicle Use, Ownership, Purchase Date, Anti-Lock Brakes, Anti-Theft, Passive Restraints, etc.

**Auto Driver:** Occupation Industry, Occupation Title, Age Licensed, Rated Driver, Defensive Driver Date, SR-22, FR-44, Good Student/Driver, Mature Driver, Telematics, etc.

**Home Policy:** Prior Carrier, Expiration Date, Prior Premium, Years with Prior Carrier, Effective Date, Credit Check Auth, etc.

**Home Dwelling:** Dwelling Usage, Dwelling Type, Occupancy, Square Footage, Year Built, Construction Style, Exterior Walls, Foundation, Roof Type/Design, Heating, Full/Half Baths, Protection Class, Update Years, etc.

**Home Coverage:** Dwelling, Personal Liability, Medical Payments, All Perils Deductible, Wind Deductible, Theft Deductible, Personal Property, Loss of Use, Replacement Cost, Mortgagees, etc.

#### POSITIONAL_OVERRIDES

Handles duplicate label text within a single route (e.g., four "Year Updated" fields on the dwelling page):

| Route + Index | Maps To |
|--------------|---------|
| `/rating/home/*/policy-info::3` | `HomePriorMonths` |
| `/rating/home/*/policy-info::5` | `HomeContinuousMonths` |
| `/rating/home/*/dwelling-info::33` | `HeatingUpdateYear` |
| `/rating/home/*/dwelling-info::35` | `ElectricalUpdateYear` |
| `/rating/home/*/dwelling-info::37` | `PlumbingUpdateYear` |
| `/rating/home/*/dwelling-info::39` | `RoofingUpdateYear` |

#### DOM Field Harvester (§14)

**`harvestFormFields(container)`** — Collects visible form elements in DOM order:
- Inputs (excluding hidden, submit, button, checkbox, radio)
- `<select>` elements
- `<textarea>` elements
- `mat-select` elements
- Deduplicates (mat-select children may appear twice)
- Filters by `isVisible()`

**`splitColumnarFields(elements, columnCount)`** — Handles multi-entity pages (2-driver, 2-vehicle) where DOM order is interleaved row-first:
```
Driver1.Field0 → Driver2.Field0 → Driver1.Field1 → Driver2.Field1 …
```
Uses stride-based splitting: element `i` goes to column `i % N`.

#### fillPageSequential() — Primary Fill Entry Point (§15)

1. **Route detection:** `matchRoute(location.href)` against ROUTE_TABLE
2. **Co-applicant scope:** If route is `/details#co-applicant`, uses `clientData.CoApplicant` as fill data and scopes DOM harvesting to `mat-dialog-container` or `[role="dialog"]`
3. **Harvest DOM elements:** `harvestFormFields()` within the scoped root
4. **Threshold check:** Require ≥ max(50%, 3) of expected fields. If below, wait 2s and re-harvest. If still below, fall back to `fillPage()`
5. **Column detection:** For `drivers-compact` / `vehicles-compact` routes, detect column count by counting label hits for the first field, then split fields via `splitColumnarFields()`
6. **Normalize sub-objects:** `normalizeVehicle()` / `normalizeDriver()` remap alternate key names (e.g., `v.Year` → `v.VehicleYear`)
7. **Primary positional fill:** Build `(label, el, index)` pairs, resolve values via `FIELD_LABEL_MAP` + `POSITIONAL_OVERRIDES`, fill each element
8. **Second column fill:** If 2-column layout and second entity data exists, fill column 2
9. **Tail fill:** If DOM has fewer elements than route spec, run `fillPage()` for remainder (skipped for `/details` to avoid co-applicant double-fill)
10. **Applicant wrap-up:** For `/details`, always delegate to `fillPage()` for named-selector pass + co-applicant injection

### 8.14 Message Handling & Init

#### Chrome Message Listeners

| Message Type | Handler |
|-------------|---------|
| `ping` | Responds `{ ok: true }` (presence check) |
| `fillPage` | Calls `fillPageSequential(msg.clientData)`, updates toolbar with results |
| `getPageInfo` | Returns `{ page: detectPage(), url: location.href }` |
| `scrapePage` | Calls `scrapePage()`, returns results async |

#### Storage Change Listener

Watches `chrome.storage.onChanged` for `clientData` changes and updates the toolbar's client name display.

#### Init Guard

Uses `window.__altechFillerLoaded` to prevent double-injection. Auto-shows toolbar only on `/web/account/create/personal` (new applicant creation page), with a 1.5s delay for Angular to render.

---

## 9. property-scraper.js

An IIFE (Immediately Invoked Function Expression) that runs on any web page to extract property data. Injected via `chrome.scripting.executeScript` from background.js.

### Site Detection

`detectSiteType()` returns one of 7 types:

| Site Type | Detection Pattern |
|-----------|------------------|
| `zillow` | hostname includes "zillow" |
| `redfin` | hostname includes "redfin" |
| `realtor` | hostname includes "realtor.com" |
| `trulia` | hostname includes "trulia" |
| `gis` | hostname/URL matches: arcgis, parcelviewer, /assessor, /parcel, beacon.schneidercorp |
| `generic` | Default fallback |

### Field Pattern Map (28 Property Fields)

| Field | Regex Triggers (excerpt) |
|-------|------------------------|
| `yrBuilt` | year built, yr built, built in |
| `sqFt` | sq ft, square feet, living area, building area |
| `lotSize` | lot size, lot area, acreage, land area |
| `bedrooms` | bedroom, bed, br |
| `fullBaths` | full bath, bathroom |
| `halfBaths` | half bath, partial bath |
| `numStories` | stories, story, levels, floors |
| `roofType` | roof type, roof material, roofing |
| `roofShape` | roof shape, roof design, roof style |
| `foundation` | foundation, basement |
| `exteriorWalls` | exterior wall, siding, exterior material |
| `constructionStyle` | construction, building type, property sub type |
| `heatingType` | heating, heat type, heat source |
| `cooling` | cooling, air conditioning, AC, HVAC |
| `garageType` | garage type, parking type |
| `garageSpaces` | garage spaces, parking spaces, car garage |
| `pool` | pool |
| `numFireplaces` | fireplace |
| `sewer` | sewer |
| `waterSource` | water source, water supply |
| `flooring` | flooring, floor type, floor material |
| `assessedValue` | assessed value, tax value, total assessment |
| `ownerName` | owner name, property owner |
| `parcelId` | parcel, APN, PIN, tax lot |
| `purchaseDate` | purchase date, sale date, transfer date |
| `address` | property address, site address, location |
| `city` | city, municipality |
| `state` | state, province |
| `zip` | zip, postal code |
| `woodStove` | wood stove, wood burning |

### Value Cleaning (`cleanValue()`)

| Field Type | Cleaning Action |
|-----------|----------------|
| `yrBuilt` | Extracts 4-digit year (1700–2099) |
| `sqFt`, `assessedValue` | Removes commas, dollar signs, non-numeric chars |
| `lotSize` | If > 100, assumes sqft and converts to acres (÷ 43560) |
| `pool` | Normalizes to "Yes" / "No" |
| `woodStove` | Normalizes to "Yes" / "No" |
| `sewer` | Normalizes to "Public" / "Septic" |
| `waterSource` | Normalizes to "Public" / "Well" |
| All fields | Caps at 120 characters |

### Extraction Strategies (5 Generic + 2 Site-Specific)

| Strategy | Approach |
|----------|----------|
| **A: scanTables()** | Scans all `<table>` rows for label/value pairs in `<th>`/`<td>` cells |
| **B: scanDefinitionLists()** | Scans `<dl>` lists for `<dt>` label → `<dd>` value pairs |
| **C: scanKeyValueElements()** | Scans `span, div, p, label, strong, b` etc. for adjacent label→value patterns |
| **D: scanTextLines()** | Regex scan of entire page text for "Label: Value" colon-separated lines |
| **E: scanArcGISPopup()** | Specialized scraper for ArcGIS popup/info panels (11 selectors) |
| **Zillow: scrapeZillow()** | Regex-based extraction from Zillow page text (beds, baths, sqft, lot, features, etc.) |
| **Redfin: scrapeRedfin()** | Similar regex extraction tuned for Redfin's text layout |

### Execution Flow

1. Site-specific scraper runs first (highest confidence) → `data`
2. All generic strategies run in sequence, merging new finds only (won't overwrite)
3. For GIS sites, ArcGIS popup scan runs first among generic strategies
4. Address fallback: Extract from page title if not found elsewhere
5. Filter out empty values
6. Return structured result

### Return Shape

```javascript
{
  _source: 'altech-property-scraper',
  siteType: 'zillow' | 'redfin' | 'gis' | 'generic' | ...,
  url: 'https://...',
  pageTitle: 'document.title',
  address: '123 Main St, City, ST',
  timestamp: '2026-03-28T...',
  data: { yrBuilt: '2005', sqFt: '1800', ... },
  fieldsFound: ['yrBuilt', 'sqFt', ...],  // excludes address/city/state/zip
  fieldCount: 12
}
```

---

## 10. defaultSchema.js

A 3,069-line JS file containing a single `DEFAULT_SCHEMA` object — the built-in baseline dropdown option schema that ships with the extension.

### Structure

```javascript
const DEFAULT_SCHEMA = {
  "Field Label": ["Option 1", "Option 2", "Option 3", ...],
  "Another Field": ["Value A", "Value B", ...],
  // ...198 fields total
};
```

### Coverage

**198 dropdown fields** covering:

| Category | Example Fields |
|---------|---------------|
| **Applicant** | Address State, Address Type, Contact Method, Contact Time, DL State, DL Status, Education, Email Type, Gender, Industry, Lead source, Marital Status, Months At Address, Occupation, Phone Type, Preferred Language, Prefix, Suffix, Years At Address |
| **Auto Vehicle** | Anti-Lock Brakes, Anti-Theft, Car Pool, Daytime Running Lights, Ownership Type, Passive Restraints, Performance, Telematics, Vehicle Use, Was the car new?, Year |
| **Auto Driver** | Age Licensed, Driver Education, FR-44 Required, Good Driver, Good Student, License Sus/Rev, Mature Driver, Occupation Industry, Occupation Title, Rated Driver, SR-22 Required |
| **Auto Coverage** | Bodily Injury, Collision, Comprehensive, Medical Payments, Property Damage, Uninsured Motorist |
| **Home Policy** | Policy Type, Policy/Form Type, Prior Carrier, Quote as Package |
| **Home Dwelling** | Burglar Alarm, Construction Style, Dead Bolt, Distance To Tidal Water, Dwelling Type, Dwelling Usage, Electrical Update, Exterior Walls, Feet From Hydrant, Fire Detection, Foundation Type, Heating Type, Heating Update, Number of Full/Half Baths, Number of Occupants, Number of Stories, Occupancy Type, Plumbing Update, Protection class, Roof Design, Roof Type, Roofing Update, Smoke Detector, Sprinkler System, # of Wood Burning Stoves |
| **Home Coverage** | All Perils Deductible, Loss Assessment, Medical Payments, Personal Liability, Theft Deductible, Water Backup, Wind Deductible |
| **Duplicate variants** | `applicant-gender`, `driver-0-gender`, `contact-gender-0` etc. (same options under formcontrolname-based keys) |

### Purpose in Schema Merge

The schema serves as the first layer in the 3-layer merge:
1. `DEFAULT_SCHEMA` (this file) — baseline
2. Remote schema from `https://altech.agency/ezlynx_schema.json` — updated periodically
3. Local scrapes — user's own scrape results

The merged schema is stored in `chrome.storage.local.schemaData` and used by `fillCustomDropdown()` for fuzzy matching.

---

## 11. Complete Field Inventory

### Fields That Can Be FILLED (by content.js)

#### Applicant Fields (~30)

| Field | Type | Method |
|-------|------|--------|
| First Name | Text | Named selector + Positional |
| Middle Initial | Text | Named selector + Positional |
| Last Name | Text | Named selector + Positional |
| Maiden Name | Text | Named selector + Positional |
| Nickname | Text | Positional only |
| DOB | Text | Named selector + Positional |
| SSN | Text | Named selector + Positional |
| Email | Text | Named selector + Positional |
| Phone | Text | Named selector + Positional |
| DL# | Text | Named selector + Positional |
| Address | Text | Named selector + Positional |
| Unit | Text | Positional only |
| Address Line 2 | Text | Positional only |
| City | Text | Named selector + Positional |
| Zip | Text | Named selector + Positional |
| Prefix | Dropdown | Named selector + Positional |
| Suffix | Dropdown | Named selector + Positional |
| Gender | Dropdown | Named selector + Positional |
| Marital Status | Dropdown | Named selector + Positional |
| State | Dropdown | Named selector + Positional |
| County | Dropdown | Named selector + Positional |
| Education | Dropdown | Named selector + Positional |
| Industry | Dropdown | Named selector + Positional |
| Occupation | Dropdown | Named selector + Positional |
| DL Status | Dropdown | Named selector + Positional |
| DL State | Dropdown | Named selector + Positional |
| Address Type | Dropdown | Named selector |
| Years At Address | Dropdown | Named selector |
| Months At Address | Dropdown | Named selector |
| Phone Type | Dropdown | Positional |
| Email Type | Dropdown | Positional |
| Contact Method | Dropdown | Positional |
| Contact Time | Dropdown | Positional |
| Preferred Language | Dropdown | Positional |
| Applicant Type | Dropdown | Positional |
| Lead Source | Dropdown | Positional |

#### Co-Applicant Fields (~25)

Same as applicant but using `contact-*-0` ID selectors + scoped container.

#### Auto Vehicle Fields (~24)

| Field | Type |
|-------|------|
| VIN | Text |
| Year | Text/Dropdown |
| Make | Dropdown |
| Model | Dropdown |
| Sub-Model | Dropdown |
| Purchase Date | Text |
| Annual Miles | Text |
| Current Odometer | Text |
| Cost New Value | Text |
| Vehicle Use | Dropdown |
| Ownership Type | Dropdown |
| Passive Restraints | Dropdown |
| Anti-Lock Brakes | Dropdown |
| Daytime Running Lights | Dropdown |
| Anti-Theft | Dropdown |
| Performance | Dropdown |
| Was the car new? | Toggle/Dropdown |
| Car Pool | Toggle/Dropdown |
| Telematics | Dropdown |
| Transportation Network Company | Dropdown |
| Prior Damage Present | Toggle |
| Alternate Garage | Toggle |
| Used For Delivery | Toggle |
| Double Deductible | Toggle |

#### Auto Driver Fields (~26)

| Field | Type |
|-------|------|
| First/Last Name | Text |
| DOB | Text |
| Gender, Marital Status | Dropdown |
| Relationship | Dropdown |
| SSN | Text |
| Occupation Industry | Dropdown |
| Occupation Title | Dropdown |
| DL Status | Dropdown |
| Age Licensed | Dropdown |
| DL# | Text |
| DL State | Dropdown |
| Rated Driver | Dropdown |
| Defensive Driver Course Date | Text |
| License Sus/Rev | Dropdown |
| SR-22 Required, FR-44 Required | Dropdown |
| Good Student, Good Driver | Dropdown |
| Student > 100 miles away | Toggle |
| Driver Education, Mature Driver | Dropdown |
| Driver Telematics | Dropdown |
| Extended Non Owned Coverage | Toggle |
| Driver Training Date | Text |

#### Home Dwelling Fields (~47)

| Field | Type |
|-------|------|
| Dwelling Type | Dropdown |
| Dwelling Usage | Dropdown |
| Occupancy Type | Dropdown |
| Number of Stories | Dropdown |
| Square Footage | Text |
| Year Built | Text |
| Construction Style | Dropdown |
| Exterior Walls | Dropdown |
| Foundation Type | Dropdown |
| Roof Type | Dropdown |
| Roof Design | Dropdown |
| Heating Type, Heating Source Type | Dropdown |
| Fire Detection, Sprinkler System | Dropdown |
| Smoke Detector, Burglar Alarm, Dead Bolt | Dropdown |
| # Wood Burning Stoves | Dropdown |
| Number of Full/Half Baths | Dropdown |
| Number of Occupants | Dropdown |
| Protection Class | Dropdown |
| Purchase Price, Purchase Date | Text |
| Distance From Fire Station | Text |
| Distance To Tidal Water | Text |
| Feet From Hydrant | Text |
| 4× Update fields (Heating/Electrical/Plumbing/Roof) | Dropdown |
| 4× Year Updated fields | Dropdown |
| Various discount toggles (NonSmoker, Retiree, Mature, etc.) | Toggle |

#### Home Coverage Fields (~15)

| Field | Type |
|-------|------|
| Dwelling (coverage amount) | Text |
| Personal Liability | Dropdown |
| Medical Payments | Dropdown |
| Personal Property | Text |
| Loss Of Use | Text |
| All Perils Deductible | Dropdown |
| Wind Deductible | Dropdown |
| Theft Deductible | Dropdown |
| Est. Replacement Cost | Text |
| First–Third Mortgagee | Text |
| Cosigner | Text |

#### Home Policy Fields (~17)

| Field | Type |
|-------|------|
| Prior Carrier | Dropdown |
| Expiration Date | Text |
| Prior Policy Premium | Text |
| Years with Prior Carrier | Dropdown |
| Years with Continuous Coverage | Dropdown |
| Home construction? | Toggle |
| Effective Date | Text |
| Pool, Dogs, Trampoline | Toggle |
| Business/Daycare on premises | Toggle |
| # of Employees | Text |
| Quote as Package | Toggle |
| Credit Check Auth | Toggle |
| Months (×2, prior + continuous) | Dropdown |

### Fields That Can Be SCRAPED (by property-scraper.js)

28 property fields from real estate / GIS websites (see §9 for full list).

---

## 12. Data Shapes & Key Mappings

### Client Data Shape (from Altech → Extension)

```javascript
{
  // ── Applicant ──
  FirstName: "John",
  LastName: "Smith",
  MiddleInitial: "A",
  MaidenName: "",
  DOB: "01/15/1985",
  Gender: "Male",          // or "M" → expanded
  MaritalStatus: "Married", // or "M" → expanded
  SSN: "123-45-6789",
  Email: "john@example.com",
  Phone: "360-555-1234",
  DLNumber: "SMITH*123AB",
  DLState: "WA",
  DLStatus: "Active",
  Education: "Bachelors",
  Industry: "Technology",
  Occupation: "Software Engineer",
  
  // ── Address ──
  Address: "123 Main St",
  City: "Vancouver",
  State: "WA",
  Zip: "98661",
  County: "Clark",
  
  // ── Co-Applicant ──
  CoApplicant: {
    FirstName: "Jane",
    LastName: "Smith",
    DOB: "03/22/1987",
    Gender: "Female",
    MaritalStatus: "Married",
    Relationship: "Spouse",
    Industry: "Healthcare",
    Occupation: "Nurse",
    // ... same fields as applicant
  },
  
  // ── Drivers (array) ──
  Drivers: [
    {
      FirstName: "John",
      LastName: "Smith",
      DOB: "01/15/1985",
      Gender: "Male",
      MaritalStatus: "Married",
      DLNumber: "SMITH*123AB",
      DLState: "WA",
      DLStatus: "Active",
      AgeLicensed: "16",
      Industry: "Technology",
      Occupation: "Software Engineer",
      Relationship: "Insured",
      // ... discounts, education, etc.
    },
    // ... more drivers
  ],
  
  // ── Vehicles (array) ──
  Vehicles: [
    {
      VIN: "1HGBH41JXMN109186",
      Year: "2021",
      Make: "Honda",
      Model: "Civic",
      SubModel: "LX",
      VehicleUse: "Commute",
      AnnualMiles: "12000",
      CurrentOdometer: "45000",
      OwnershipType: "Own",
      PurchaseDate: "06/15/2021",
      CostNew: "25000",
      // ... safety features
    },
    // ... more vehicles
  ],
  
  // ── Incidents (array) ──
  Incidents: [
    {
      Type: "Accident",      // or "Violation" or "CompLoss"
      Date: "03/15/2023",
      Description: "Rear-end collision",
      AtFault: "Yes",
      BIPaid: "5000",
      PDPaid: "3000",
    },
    // ... more incidents
  ],
  
  // ── Home/Property ──
  DwellingType: "Single Family",
  DwellingUsage: "Primary",
  OccupancyType: "Owner",
  SqFt: "1800",
  YearBuilt: "2005",
  ConstructionStyle: "Frame",
  ExteriorWalls: "Vinyl Siding",
  FoundationType: "Crawl Space",
  RoofType: "Composition Shingle",
  RoofDesign: "Gable",
  HeatingType: "Forced Air",
  NumberOfStories: "1",
  FullBaths: "2",
  HalfBaths: "1",
  ProtectionClass: "4",
  Pool: "No",
  
  // ── Coverage ──
  DwellingCoverage: "350000",
  PersonalLiability: "300000",
  AllPerilsDeductible: "1000",
  // ... more coverage fields
  
  // ── Prior policy ──
  HomePriorCarrier: "State Farm",
  HomePriorYears: "5",
  EffectiveDate: "04/01/2026",
}
```

### Altech → EZLynx Key Mapping (Full FIELD_LABEL_MAP)

The complete mapping from EZLynx label text to Altech client data property names. This is the definitive lookup used by the positional fill engine:

| EZLynx Label | Altech Key |
|-------------|-----------|
| First Name | FirstName |
| Last Name | LastName |
| Middle Initial | MiddleInitial |
| Maiden Name | MaidenName |
| Nickname | Nickname |
| DOB | DOB |
| SSN | SSN |
| DL# | DLNumber |
| DL Status | DLStatus |
| DL State | DLState |
| Gender | Gender |
| Marital Status | MaritalStatus |
| Education | Education |
| Industry | Industry |
| Occupation | Occupation |
| Address | Address |
| Unit | Unit |
| Address Line 2 | AddressLine2 |
| City | City |
| State | State |
| County | County |
| Postal Code | Zip |
| Years At Address | YearsAtAddress |
| Months At Address | MonthsAtAddress |
| Email Address | Email |
| Phone Number | Phone |
| Prefix | Prefix |
| Suffix | Suffix |
| Relationship | Relationship |
| VIN | VIN |
| Year | VehicleYear |
| Make | VehicleMake |
| Model | VehicleModel |
| Sub-Model | SubModel |
| Annual Miles | AnnualMiles |
| Current Odometer | CurrentOdometer |
| Vehicle Use | VehicleUse |
| Ownership Type | OwnershipType |
| Purchase Date | PurchaseDate |
| Cost New Value | CostNew |
| Occupation Industry | Industry |
| Occupation Title | Occupation |
| Age Licensed | AgeLicensed |
| Rated Driver | RatedDriver |
| Prior Carrier | HomePriorCarrier |
| Years with Prior Carrier | HomePriorYears |
| Years with Continuous Coverage | YearsContinuousCoverage |
| Effective Date (New Policy) | EffectiveDate |
| Rating State | State |
| Dwelling Usage | DwellingUsage |
| Dwelling Type | DwellingType |
| Occupancy Type | OccupancyType |
| Square Footage | SqFt |
| Year Built | YearBuilt |
| Purchase Price | PurchasePrice |
| Protection class | ProtectionClass |
| Feet From Hydrant | FeetFromHydrant |
| Dwelling (coverage) | DwellingCoverage |
| Personal Liability | HomePersonalLiability |
| Medical Payments | HomeMedicalPayments |
| All Perils Deductible | AllPerilsDeductible |
| Wind Deductible | WindDeductible |
| Theft Deductible | TheftDeductible |
| Personal Property | HomePersonalProperty |
| Loss Of Use | HomeLossOfUse |
| Est. Replacement. Cost | EstReplacementCost |
| First mortgagee | Mortgagee |

---

## 13. Known Limitations & Pain Points

### Fundamental Limitations

| Limitation | Impact | Details |
|-----------|--------|---------|
| **Angular timing** | Fill failures | EZLynx uses Angular Material with lazy-loaded components. Fields may not be in the DOM when the fill starts. Mitigated by waits and retries, but still fragile. |
| **CDK overlay collisions** | Dropdown fill failures | Only one CDK overlay can be open at a time. If a stale overlay exists, new dropdown opens fail silently. `nukeOverlays()` helps but is a hack. |
| **Dependent dropdowns** | Occupation fails without Industry | Occupation is disabled until Industry is set. The fill order (Industry→wait→Occupation) is hardcoded but timing-sensitive. |
| **No sub-model cascade** | Vehicle sub-model rarely fills | Sub-Model options depend on Year+Make+Model all being set. The cascade wait is often insufficient. |
| **Side-by-side columns** | Multi-entity fill fragility | 2-driver/2-vehicle pages interleave fields in DOM order. The stride-based splitter assumes consistent column counts. |
| **Selector brittleness** | Any EZLynx redesign breaks fills | Named selectors target specific `formcontrolname`, `id`, and CSS class patterns that EZLynx can change at any time. |
| **Fuzzy match false positives** | Wrong option selected | Dice coefficient at 0.4 cutoff occasionally matches the wrong dropdown option, especially for similar values. |
| **Co-Applicant cleanup** | Scraper cleanup can fail | Phase 6 cleanup (deleting the test co-applicant) relies on finding a delete button and handling a confirmation dialog — if the dialog structure changes, stale test data remains. |
| **Prior Address reveal** | Timing-dependent | Setting YearsAtAddress to "1" must wait for Angular's conditional rendering — if the wait is too short, prior address fields aren't scraped. |

### Missing / Incomplete Fills

| Missing Field | Reason |
|--------------|--------|
| Account Name | Not in FIELD_LABEL_MAP |
| Assigned Producer | Not in FIELD_LABEL_MAP |
| CSR | Not in FIELD_LABEL_MAP |
| Customer Since | Not in FIELD_LABEL_MAP |
| Deceased | Not in FIELD_LABEL_MAP |
| Applicant Type | In ROUTE_TABLE but not mapped to Altech data |
| Prior Employer in Years | In ROUTE_TABLE but not mapped |
| Bridge email address | Toggle — not in TOGGLE_MAP |
| # of Other Interests | Home coverage — not mapped |
| Home Rating carriers | Not auto-fillable (carrier selection UI) |
| Auto incidents page | Partially supported (fill by ID pattern only) |
| Replacement cost calculator | Not automated |
| Non-standard pages | Flood, umbrella, BOP, inland marine — no support |

### Edge Cases & Bugs

| Issue | Description |
|-------|-------------|
| **Double injection** | `__altechFillerLoaded` guard prevents double-init, but history monkey-patch may fire duplicate events |
| **Re-fill creates duplicates** | `_filledSig` dedup only works within a single fill session — re-triggering fill doesn't know what was already set |
| **Stale client data** | Extension uses `chrome.storage.local` which persists across sessions — old client data can accidentally fill a new quote |
| **Schema staleness** | If remote schema fetch fails, `DEFAULT_SCHEMA` may have outdated options |
| **Property scrape on non-property pages** | "Grab Property" works on any tab — scraping a non-property page returns garbage data |
| **GIS sites are highly variable** | County assessor sites have wildly different DOM structures — generic strategies miss many fields |

### Performance Concerns

| Concern | Detail |
|---------|--------|
| **Scrape time** | Full 6-phase scrape can take 30-60 seconds due to sequential dropdown opens and cascade waits |
| **Fill time** | Complex pages (dwelling-info with 47 fields) can take 15-30 seconds |
| **CDK overlay cleanup** | `nukeOverlays()` force-removes DOM elements which can cause Angular errors in console |
| **Memory** | 266KB content.js loaded on every EZLynx page, including pages that don't need filling |

---

## 14. Schema System (3-Layer Merge)

### Layer 1: defaultSchema.js (built-in)

- 198 dropdown fields with pre-scraped option lists
- Ships with the extension, auto-generated from live scrapes
- Updated manually by exporting after a scrape session
- Includes duplicates: `"Gender"` and `"applicant-gender"` both have `["Male", "Female", "X"]`

### Layer 2: Remote Schema (Vercel)

- Fetched from `https://altech.agency/ezlynx_schema.json` on service worker startup
- Same format as `DEFAULT_SCHEMA`
- Updated when an admin exports schema from the extension popup
- Merged on top of Layer 1 (new options added, no removals)

### Layer 3: Local Scrapes

- User's own `scrapePage()` results stored in `chrome.storage.local.schemaData`
- Highest priority — always wins in merge conflicts
- Can capture new fields or options that Layers 1-2 don't have

### Merge Logic

```javascript
// background.js merge (simplified)
finalSchema = {};
merge(finalSchema, DEFAULT_SCHEMA);        // Layer 1
merge(finalSchema, remoteSchema);           // Layer 2
merge(finalSchema, localScrapes);           // Layer 3
// merge() only adds — never removes options
chrome.storage.local.set({ schemaData: finalSchema });
```

### Schema Usage

`fillCustomDropdown()` in content.js:
1. Opens the dropdown overlay
2. Collects visible `mat-option` texts
3. Tries exact match against visible options
4. Falls back to `bestMatch()` against visible options
5. If schema has options for this field, also tries fuzzy match against schema options
6. Selects the best overall match

---

## 15. Angular Material Handling Patterns

EZLynx uses Angular Material (Material Design) components throughout. The extension must handle each differently:

### mat-select (Dropdowns)

- **Open:** Click the `mat-select` element → CDK overlay panel appears
- **Wait:** `mat-option` elements load asynchronously (up to 1200ms)
- **Select:** Click the target `mat-option`
- **Close:** Overlay auto-closes on selection; manual close via backdrop click if needed
- **Quirk:** Only one overlay can be open at a time. Stale overlays block new opens.

### mat-slide-toggle

- **Detection:** `.mat-slide-toggle` class or `mat-slide-toggle` tag
- **State check:** `.mat-checked` class or `aria-checked` attribute
- **Toggle:** Click the element (no value assignment needed)
- **Quirk:** Some toggles reveal hidden fields when toggled ON

### mat-checkbox

- **Detection:** `mat-checkbox` tag
- **State check:** `.mat-checkbox-checked` class
- **Toggle:** Click the element
- **Quirk:** Must check state before clicking — clicking always toggles

### mat-radio-button

- **Detection:** `mat-radio-button` tag
- **State check:** `.mat-radio-checked` class
- **Select:** Find option with matching label text, click it
- **Quirk:** For Yes/No questions, must find the "Yes" option specifically

### Input fields in Angular

- **Setting value:** Must set `el.value` THEN dispatch events:
  ```javascript
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  ```
- **Quirk:** Without event dispatch, Angular's form model doesn't register the change

### CDK Overlays

- **Appear as:** `.cdk-overlay-container` → `.cdk-overlay-pane` → dropdown panel
- **Backdrop:** `.cdk-overlay-backdrop` — click to close
- **Stale overlays:** Must be force-removed via `nukeOverlays()` before opening new dropdowns
- **Z-index battles:** Some overlays appear behind the floating toolbar

---

## 16. Overhaul Considerations

### Architecture Issues to Address

1. **Single monolithic content.js** (5,396 lines) — should be split into focused modules:
   - Fill engine (primitives + orchestration)
   - Scrape engine (all 6 phases)
   - Route registry + positional fill
   - Toolbar UI
   - SPA navigation
   - Abbreviation/expansion data

2. **Two fill strategies running in parallel** — `fillPageSequential()` (positional) and `fillPage()` (named selector) are interleaved. The positional strategy falls back to the named strategy, which means maintaining both. Consider unifying.

3. **Hardcoded timing** — `FILL_DELAY`, `DROPDOWN_WAIT`, `RETRY_WAIT` are fixed constants. Should adapt to actual page load speed (e.g., wait for specific Angular lifecycle events).

4. **Schema maintenance burden** — The 3-layer schema system requires manual scraping. Could be automated with a scheduled scrape or derived from EZLynx's API if available.

5. **Fuzzy matching quality** — Dice coefficient is decent but not optimal. Consider using Levenshtein distance or a more sophisticated matching algorithm with per-field tuning.

### Data Flow Improvements

1. **No bidirectional sync** — Data flows one way (Altech → EZLynx). Consider scraping filled EZLynx data back into Altech for verification.

2. **No fill verification** — After filling, no check that the correct values actually landed. A post-fill scrape + diff would catch errors.

3. **No incremental fill** — Re-triggering fill starts from scratch. Should detect already-filled fields and skip them (beyond the simple `_filledSig` dedup).

### Page Coverage Gaps

- No support for: Flood insurance, Umbrella, BOP, Inland Marine, Commercial lines
- Auto incident pages have basic support but are fragile
- Rating/carrier selection is not automated
- Endorsement pages not supported

### Security Considerations

- `<all_urls>` host permission is overly broad — could be restricted to specific domains
- `clientData` in `chrome.storage.local` includes SSN, DL#, DOB — sensitive PII at rest
- No data expiration — old client data persists until manually cleared
- Property scraper can run on any page — should validate the target URL

### Testing Gaps

- No automated tests for the extension itself
- No integration tests against live/mock EZLynx pages
- Schema merge logic is untested
- Fuzzy matching edge cases are untested
- SPA navigation detection reliability is unverified

---

*End of summary. This document covers all 8 source files (10,764 lines total) of the Altech EZLynx Chrome Extension v0.7.2.*
