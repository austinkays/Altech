# Altech - AI Coding Agent Instructions

## Project Overview
**Altech** is a mobile-first insurance lead capture wizard built as a single-page HTML application. It collects comprehensive intake data (personal, property, auto, risk factors) and exports to multiple insurance systems: HawkSoft (CRM) and EZLynx (quoting platform).

**Core Value Proposition:** One form, three export options → no manual re-entry into downstream systems.

## Architecture at a Glance

### The Stack
- **Frontend**: Single self-contained `ProspectApp.html` (1229 lines) - vanilla JavaScript, no build step
- **Storage**: LocalStorage only (browser-based, key `altech_v6`)
- **Styling**: CSS3 with Apple design system (SF Pro font, iOS-style components)
- **Deployment**: Static hosting (Netlify/Vercel/GitHub Pages)

### Data Flow: Form → Multiple Exports
```
User Form Input (6 visual steps, 1 logical flow)
    ↓
LocalStorage Auto-Save (on every input change)
    ↓
Three Export Engines:
  1. CMSMTF (.cmsmtf) → HawkSoft import
  2. XML (EZLynx format) → EZLynx quoting
  3. CSV → EZLynx Sales Center
```

### Critical Concept: Multi-Step Wizard with Dynamic Flows
The app has **4 visual steps** but **3 dynamic workflows**:
- `workflows.home`: Step 1 (client) → Step 2 (property) → Step 3 (risk) → Step 4 (export)
- `workflows.auto`: Step 1 → Step 3 (auto skips property) → Step 4
- `workflows.both`: All 4 steps

The `qType` radio button (in Step 1) triggers `App.handleType()` which:
1. Sets `this.flow` to the appropriate workflow array
2. Shows/hides Step 2 and auto-specific cards
3. Resets UI if user changes type mid-form

## Code Structure & Key Objects

### Main App Object (`const App = {}`)
Located at [ProspectApp.html#L676](ProspectApp.html#L676). Core methods:

| Method | Purpose | Side Effects |
|--------|---------|--------------|
| `init()` | Initializes app, loads saved data, sets up event listeners | Sets up auto-save on every input |
| `load()` / `save()` | Manage `localStorage.altech_v6` | Auto-save indicator appears for 1.5s |
| `handleType()` | Changes workflow based on `qType` radio selection | Updates UI, may hide/show Step 2 & 3 |
| `updateUI()` | Renders current step, updates progress bar, manages buttons | Scrolls main to top |
| `next()` / `prev()` | Navigate wizard | Validates nothing; only checks flow bounds |
| `decodeVin()` | Async VIN decode via NHTSA API | Auto-fills `vehDesc` |
| `getNotes()` | Formats all data as structured text | Used by all exports |
| `exportCMSMTF()` | Generates HawkSoft CMSMTF file with 40+ field mappings | Downloads as `Lead_${lastName}.cmsmtf` |
| `exportXML()` | Generates EZLynx XML (ACORD-like format) | Requires firstName, lastName, state, DOB |
| `exportCSV()` | Generates 10-column CSV for EZLynx Sales Center | Flattens notes to single line |
| `reset()` | Clears localStorage and reloads page | No undo! |

### Key Data Fields (~70 form inputs)

**Step 1 (Client Info):**
- Personal: `firstName`, `lastName`, `email`, `phone`, `dob`
- Demographics: `maritalStatus`, `education`, `industry`
- Coverage type: `qType` (home/auto/both)

**Step 2 (Property):** Auto-hidden if `qType !== 'home'` && `qType !== 'both'`
- Address: `addrStreet`, `addrCity`, `addrState`, `addrZip`
- Property details: `yrBuilt`, `sqFt`, `numStories`, `fullBaths`, `dwellingType`, `dwellingUsage`
- Construction: `constructionStyle`, `exteriorWalls`, `foundation`, `roofType`, `roofYr`, `roofShape`
- Systems: `heatingType`, `heatYr`, `cooling`, `plumbYr`, `elecYr`
- Safety: `fireStationDist`, `fireHydrantFeet`, `protectionClass`, `burglarAlarm`, `fireAlarm`, `sprinklers`

**Step 3 (Risk & Auto):** Risk fields always shown; auto fields hidden if `qType === 'home'`
- Risk: `pool`, `trampoline`, `woodStove`, `dogInfo`, `businessOnProperty`
- Auto: `vin`, `vehDesc`, `dlNum`, `dlState`, `use`, `miles`, `commuteDist`, `rideSharing`, `telematics`
- History: `liabilityLimits`, `homeDeductible`, `autoDeductible`, `priorCarrier`, `priorYears`, `priorExp`, `accidents`, `violations`, `studentGPA`
- Other: `mortgagee`, `additionalInsureds`, `contactTime`, `referralSource`, `tcpaConsent`

## Export System Deep Dive

### CMSMTF Format (HawkSoft)
**File:** [ProspectApp.html#L926](ProspectApp.html#L926-L1018)

HawkSoft expects **tagged format** with system variable names and `=` operator:
```
gen_sFirstName = John
gen_sLastName = Doe
gen_sAddress1 = 123 Main St
L1 = 2020  (custom field: roof year)
C1 = 50/100  (custom field: liability limits)
```

**Mapping Strategy:** 
- Standard fields: `gen_s*` (string), `gen_n*` (numeric)
- Property-specific: `hpm_*` prefix (hidden from form, but field variables exist)
- Custom fields: `L1-L10` (liability/property), `C1-C10` (auto/claims), `R1-R10` (admin)
- Fallback: `gen_sClientNotes` for unmapped data

**Validation in code:** See [FIELD_MAPPING_UPDATE.md](FIELD_MAPPING_UPDATE.md) for complete field→variable mapping.

### XML Export (EZLynx) - DETAILED ARCHITECTURE
**File:** [ProspectApp.html#L1020](ProspectApp.html#L1020-L1207)

Generates EZLynx-compatible XML with ACORD-like structure. **Critical validation before export:**
- `firstName` & `lastName` (present & non-empty)
- `addrState` (exactly 2 letters, uppercase)
- `dob` (valid ISO 8601 date YYYY-MM-DD)

#### XML Structure Breakdown

**Root Element:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
```
The namespace is **critical** - EZLynx XML parser requires this exact xmlns.

**Address/Street Parsing (Complex Logic):**
```javascript
// Input: "408 nw 116th st"
// Parsed into:
const streetRaw = "408 nw 116th st";
const streetMatch = streetRaw.match(/^(\d+)\s+(.*)$/);
const streetNumber = "408";   // First digits
const streetName = "nw 116th st";  // Everything after space
```
Maps to EZLynx:
```xml
<Addr1>
  <StreetNumber>408</StreetNumber>
  <StreetName>nw 116th st</StreetName>
</Addr1>
```

**Vehicle Parsing (VIN Not Always Available):**
```javascript
// Attempts to parse vehDesc like "2015 NISSAN Rogue"
const parseVehicle = (desc) => {
  const match = desc?.match(/(\d{4})\s+([A-Z]+)\s+(.+)/i);
  return {
    year: match?.[1] || '',     // 2015
    make: match?.[2] || '',     // NISSAN
    model: match?.[3]?.trim() || ''  // Rogue
  };
};
```

**Key Sections Generated:**
1. **Applicant Block** - Primary insured (required)
2. **PriorPolicyInfo** - Only if prior carrier data present (conditional)
3. **Drivers Block** - Creates driver id="1" with primary insured info
4. **Vehicles Block** - Creates vehicle id="1" if VIN or vehDesc present
5. **VehiclesUse Block** - Annual mileage for each vehicle
6. **Coverages Block** - BI limits and deductibles (optional)

**Date Normalization Function:**
```javascript
const normalizeDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  if (year < 1900 || year > currentYear) return '';
  return d.toISOString().split('T')[0];  // Returns YYYY-MM-DD
};
```

**XML Character Escaping (Essential for Data Integrity):**
```javascript
const escapeXML = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};
```
Example: "Johnson & Sons, Inc." becomes "Johnson &amp; Sons, Inc."

#### Comparison with Sample EZLynx XML
The [Resources/HawkSoft Export to EZLynx SAMPLE.xml](Resources/HawkSoft Export to EZLynx SAMPLE.xml) shows the complete structure Altech aspires to generate:
- Multiple applicants (Applicant + CoApplicant) - *Altech currently single applicant only*
- Multiple drivers with violation tracking - *Altech supports 1 driver currently*
- Multiple vehicles with detailed coverage - *Altech supports 1 vehicle currently*
- StateSpecificCoverage blocks (e.g., WA-Coverages) - *Not yet implemented*
- VehicleAssignments (driver-to-vehicle mapping) - *Not yet implemented*

**Future Enhancement:** Expand to support multiple drivers/vehicles with proper id mapping.

### CSV Export
**File:** [ProspectApp.html#L904](ProspectApp.html#L904-L923)

Simple 10-column format: First, Last, Address, City, State, Zip, Phone, Email, DOB, Notes (flattened with `|` separators).

## UI/UX Patterns & Conventions

### Apple Design System
- **Font:** SF Pro via system fonts fallback
- **Colors:** CSS variables in `:root` (--apple-blue: #007AFF, --success: #34C759, etc.)
- **Components:** Cards (border + shadow), radio grids (3-column, checked = blue + tint background)
- **Mobile:** Safe areas via `env(safe-area-inset-*)`, no zoom on focus
- **Interactions:** Tap ripple disabled (`-webkit-tap-highlight-color: transparent`)

### Header/Footer Fixed Layout
- Header: Fixed top, safe-area padding, progress bar
- Footer: Fixed bottom with back/next buttons, safe-area padding
- Main: Flex growth with overflow auto, large bottom padding to avoid overlap

### Auto-Save UX
- Every input/select/textarea change triggers `App.save(event)`
- Save indicator (✓ Saved) appears top-right for 1.5s then fades
- Data persists even if browser/tab closes

### Progressive Disclosure
- Certain steps hidden by default (`step-2` if auto-only flow, auto cards if home-only)
- Kept in DOM but marked with `.hidden` class for quick reveal
- Example: Auto insurance cards in Step 3 toggle visibility via `App.handleType()`

## Development Workflows

### Local Development
```bash
npm run dev  # Starts http://localhost:8000 via npx serve
# OR
python3 -m http.server 8000
```

### Testing
- **No build step required** - edit HTML and refresh
- **Storage testing:** Open DevTools → Application → LocalStorage → http://localhost:8000 → inspect `altech_v6`
- **Export testing:** Fill form, hit export button, verify download
- **VIN decode:** Fill VIN field, check console for NHTSA API calls

### Deployment
See [README.md](../README.md#-deployment) for Netlify/Vercel/GitHub Pages commands.

## Troubleshooting Guide

### ❌ EZLynx XML Import Failures

**Problem: "Invalid XML" or import fails silently**

**Causes & Solutions:**
1. **Malformed XML structure**
   - Check for unescaped special characters: `&`, `<`, `>`, `"`, `'`
   - Solution: `escapeXML()` function handles this, verify it's called on all user input
   - Test: Open downloaded XML in text editor, search for bare `&` not followed by `amp;`

2. **Namespace mismatch**
   - Check: Root element must be `<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">`
   - Wrong: `xmlns="http://www.ezlynx.com/XMLSchema/Auto/V100"` or missing entirely
   - Solution: Verify xmlns attribute in `exportXML()` line ~1055

3. **Invalid DOB format**
   - EZLynx expects YYYY-MM-DD format strictly
   - Wrong: "02/19/1957" or "1957-02-19T00:00:00Z"
   - Right: "1957-02-19"
   - Test: In DevTools console: `new Date("1957-02-19").toISOString().split('T')[0]` should return "1957-02-19"
   - If user enters date as MM/DD/YYYY, browser's `<input type="date">` converts to YYYY-MM-DD

4. **Empty required fields**
   - firstName, lastName, state, DOB are **mandatory**
   - App validates before generating XML and shows toast error
   - Check: If user sees "⚠️ First and last name are required" - they must go back and fill Step 1

**Problem: "Address rejected" or address fields not populated**

**Causes:**
1. **Street number not parsed correctly**
   - Input: "408 nw 116th st" → splits into number="408", name="nw 116th st" ✅
   - Input: "nw 116th st" (no number) → number="", name="nw 116th st" (EZLynx may reject)
   - Solution: Require street number in form validation or prompt user to enter "123 Main St" not "Main St"

2. **State code case or length**
   - EZLynx strict: StateCode must be EXACTLY 2 uppercase letters
   - Wrong: "wa", "Wa", "WAS"
   - Right: "WA"
   - Code handles this: `state.toUpperCase()` and regex `/^[A-Z]{2}$/`

3. **Zip code format issues**
   - EZLynx accepts Zip5 (5 digits) without Zip4
   - Altech doesn't parse Zip+4, only passes `addrZip` directly
   - If user enters "98685-2003", EZLynx may reject (depends on parser)
   - Solution: Strip Zip4 on input: `addrZip.replace(/-.*/, '')`

**Problem: Vehicle data not recognized**

**Causes:**
1. **VIN invalid format**
   - VIN must be exactly 17 characters
   - Code requires: `this.data.vin && this.data.vin.length === 17`
   - If VIN empty or <17 chars, still generates XML but `<Vin>` element empty
   - EZLynx may reject empty VIN if `<UseVinLookup>Yes</UseVinLookup>` present

2. **Vehicle description parsing fails**
   - Expected format: "2015 NISSAN Rogue"
   - Regex: `/(\d{4})\s+([A-Z]+)\s+(.+)/i`
   - Fails on: "2015-nissan-rogue" (hyphens), "2015 nissan" (missing model), "Nissan Rogue 2015" (wrong order)
   - Solution: Document form as "Year Make Model" with autocomplete from VIN decode

3. **Annual mileage not transferred**
   - EZLynx needs mileage in `<AnnualMiles>` tag
   - Only generated if `this.data.miles` populated
   - Check: Is field `id="miles"` properly mapped in `load()` and `save()`?

**Problem: "Liability/Coverage information missing"**

**Causes:**
1. **Liability Limits field empty**
   - User must select from dropdown (e.g., "50/100")
   - EZLynx expects format like "100/300" → parsed as BI limit
   - Current code: `<BI>${escapeXML(this.data.liabilityLimits)}</BI>`
   - No parsing of "100/300" into separate BI/PD limits

2. **Deductible not in expected format**
   - User enters "$500" or "500"
   - Code passes as-is: `<CollisionDeductible>500</CollisionDeductible>`
   - EZLynx may expect numeric only
   - Solution: Strip "$" and non-digits: `autoDeductible.replace(/\D/g, '')`

### ❌ CMSMTF Export Failures

**Problem: "HawkSoft doesn't recognize fields"**

**Causes:**
1. **Field variable names incorrect**
   - CRITICAL: HawkSoft uses `gen_sFirstName`, not `FirstName` or `[FirstName]`
   - Altech currently generates correct format: `gen_sFirstName = John` (not wrapped in brackets)
   - If error: verify exportCMSMTF() uses correct variable names
   - Reference: See [FIELD_MAPPING_UPDATE.md](FIELD_MAPPING_UPDATE.md) for all 30+ verified variables

2. **Custom field indices wrong**
   - L1-L10, C1-C10, R1-R10 are HawkSoft-defined custom fields
   - If admin hasn't created these fields in HawkSoft, import fails silently
   - Solution: In HawkSoft, Utilities → Custom Fields → verify L1-L10 exist

**Problem: "Some data missing after import"**

**Causes:**
1. **Fields exist in notes but not in dedicated fields**
   - Data dumped to `gen_sClientNotes` as fallback won't auto-populate form fields
   - Intended: structured fields populate HawkSoft fields, notes provide backup
   - HawkSoft agents must copy from notes if field not auto-populated

2. **Special characters corrupting the file**
   - If user enters "Joe's Auto & Home" in field, becomes "Joe&apos;s Auto &amp; Home"
   - escapeXML() handles this correctly for XML
   - CMSMTF format doesn't require escaping (plain text key=value)
   - Solution: Verify CMSMTF export doesn't need escapeXML() calls

### ❌ LocalStorage/Data Issues

**Problem: "Data lost when switching devices"**

**Solution: By Design**
- Altech uses `localStorage.altech_v6` (browser-only, single device)
- Data doesn't sync to cloud - intentional trade-off for privacy
- Production version needs backend + authentication for sync
- Workaround: Export to file, import to new device (manual)

**Problem: "Can't load saved data"**

**Causes:**
1. **LocalStorage disabled or full**
   - Browser privacy settings may block storage
   - Solution: Check DevTools → Application → LocalStorage → verify `altech_v6` key exists

2. **Key changed (version bump)**
   - If you change key from `altech_v6` to `altech_v7`, old data unreachable
   - Solution: Never increment key without migration code

**Problem: "Form fields not auto-populating from storage"**

**Causes:**
1. **Field ID mismatch**
   - `save()` uses element `id` as key: `this.data[k] = e.target.value`
   - `load()` tries to find element by that id: `document.getElementById(k)`
   - If field renamed without updating storage key, data orphaned
   - Solution: Keep field `id` attributes stable; refactor storage key if needed

### ✅ Testing Checklist

**Before Deployment:**
- [ ] Fill all required fields (firstName, lastName, state, DOB) and export XML
- [ ] Verify XML opens in browser or text editor without errors
- [ ] Test special characters: "O'Brien & Co." → check escapeXML()
- [ ] Try address with no number: "Main St" → should parse gracefully
- [ ] VIN with 17 chars → should appear in XML; <17 chars → should handle missing
- [ ] Date of birth with invalid date (e.g., 02/30/1990) → should show validation error
- [ ] CMSMTF export → open in text editor, verify `gen_sFirstName = ` format (not wrapped)
- [ ] CSV export → open in Excel, verify no line breaks in Notes column
- [ ] Switch qType (home→auto→both) → verify UI shows/hides correct steps
- [ ] LocalStorage: Open DevTools, fill form, check `altech_v6` key populated
- [ ] Reload page → all fields should restore from storage
- [ ] Clear storage → all fields should blank

### 🔍 Debugging in DevTools

**View current form data:**
```javascript
// In DevTools console:
JSON.parse(localStorage.getItem('altech_v6'))
```

**Test date parsing:**
```javascript
const d = new Date("1957-02-19");
d.toISOString().split('T')[0]  // "1957-02-19"
```

**Test XML escaping:**
```javascript
const escapeXML = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');
escapeXML("O'Brien & Co.")  // "O&apos;Brien &amp; Co."
```

**Test street parsing:**
```javascript
const streetRaw = "408 nw 116th st";
const streetMatch = streetRaw.match(/^(\d+)\s+(.*)$/);
console.log(streetMatch?.[1], streetMatch?.[2]);  // "408", "nw 116th st"
```



### ✅ DO:
1. **Preserve workflow logic** - Don't hardcode step order; use `this.flow` array
2. **Test all three export types** - One form serves three use cases
3. **Validate required fields in export** - CMSMTF less strict than XML (which needs name, state, DOB)
4. **Use CSS variables** - Don't hardcode colors; leverage `:root` variables
5. **Maintain LocalStorage key consistency** - Always use `altech_v6`; incrementing version breaks existing user data
6. **Keep form self-contained** - No external JS libraries; all logic in one HTML file

### ❌ DON'T:
1. **Add new form fields without planning all three exports** - CMSMTF, XML, and CSV must all adapt
2. **Change workflow arrays without testing all three qTypes** - Easy to break home-only or auto-only flows
3. **Move existing fields to different step positions** - LocalStorage keys are field IDs; renaming breaks persistence
4. **Assume fields are always present** - Use optional chaining or fallback to empty string in exports
5. **Parse user input as JSON** - Stay with plain strings for robustness

## Common Tasks & Code Locations

| Task | File & Line |
|------|-------------|
| Add new form field | [ProspectApp.html](ProspectApp.html#L138-L650) - find appropriate `<div class="card">`, add `<input id="newField">` |
| Add new export destination | Create new `export*()` method in App object, add button to Step 4 |
| Change workflow steps | Modify `workflows` object ([ProspectApp.html#L682](ProspectApp.html#L682)) |
| Update styling | Edit `:root` CSS variables and component selectors ([ProspectApp.html#L12](ProspectApp.html#L12-L120)) |
| Fix field mapping | See [FIELD_MAPPING_UPDATE.md](FIELD_MAPPING_UPDATE.md) for current variable names |
| Test HawkSoft export | Download CMSMTF, import via HawkSoft → Utilities → Import → HawkSoft Data Importer |
| Test EZLynx export | Download XML, import via EZLynx → Applicants → Import → HawkSoft |

## Constraints & Known Limitations

1. **LocalStorage only** - No backend sync. Clearing browser storage = lost data. Production would need backend.
2. **Single-user** - No authentication or multi-user support.
3. **NHTSA VIN decode has rate limits** - Multiple rapid VIN lookups may fail.
4. **EZLynx XML validation strict** - Will reject if name/state/DOB missing; user must backtrack to fix.
5. **No email validation** - Form accepts any string in email field (intentional for lead capture).
6. **Responsive, not adaptive** - Single layout for all screen sizes; future work could add tablet optimizations.

## Next Version Roadmap & Recommendations

### 🎯 High-Impact Improvements (Priority 1)

**1. Multiple Driver/Vehicle Support**
- **Current:** Single driver, single vehicle only
- **Issue:** Families with multiple vehicles/drivers must be entered one-at-a-time or manually added to exports
- **Recommended Solution:**
  - Add dynamic form sections: "Add Another Vehicle" / "Add Another Driver" buttons
  - Each vehicle gets `id="vin_1"`, `id="vin_2"`, etc.
  - Export to all three formats (CMSMTF, XML, CSV) with proper indexing
  - Time estimate: 3-4 days
  - Files affected: ProspectApp.html (form UI + export functions)

**2. Backend API Layer for EZLynx QAS Integration**
- **Current:** Client-side only; no direct QAS API calls possible
- **Issue:** Users must manually import exports; no automatic quote submission
- **Recommended Architecture:**
  ```
  Altech (client) → Node.js/Python backend → EZLynx QAS API → Quotes back to user
  ```
- **Suggested Stack:**
  - Backend: Node.js (Express) or Python (Flask)
  - Deployment: Heroku, Vercel Functions, or AWS Lambda
  - Credentials: Store API keys in environment variables (never in HTML)
  - Response: Return quote links or results back to frontend
- **Time estimate:** 4-5 days
- **Reference:** [WORKFLOW_ARCHITECTURE.md](../WORKFLOW_ARCHITECTURE.md) and [QAS_QUICK_START.md](../QAS_QUICK_START.md)

**3. Fix XML Export for Full EZLynx Compatibility**
- **Current Issues Observed:**
  - Single applicant only (no co-applicant support)
  - Missing StateSpecificCoverage block (WA-Coverages, etc.) required by some states
  - No VehicleAssignments mapping drivers to vehicles
  - Liability limits not parsed into BI/PD/UM/UIM separate fields
- **Fix Strategy:**
  - Compare generated XML against sample: [Resources/HawkSoft Export to EZLynx SAMPLE.xml](Resources/HawkSoft Export to EZLynx SAMPLE.xml)
  - Parse "100/300" into BI=100000, PD=300000, UM=100000, UIM=300000
  - Add state-specific coverage blocks for WA, OR, CA (most common)
  - Generate VehicleAssignments with driver-to-vehicle mappings
- **Time estimate:** 2-3 days
- **Files affected:** ProspectApp.html exportXML() method

### 🔒 Security & Reliability Improvements (Priority 2)

**1. Data Encryption in LocalStorage**
- **Current:** Plain text in localStorage (anyone with browser access sees everything)
- **Recommended:** Use TweetNaCl.js or libsodium.js for AES-256 encryption
- **Time estimate:** 1-2 days
- **Risk:** High - PII being stored unencrypted

**2. Form Validation & Error Recovery**
- **Current:** Minimal validation; no field hints or inline errors
- **Recommended:**
  - Email format validation
  - Phone number validation (exact format)
  - Date of birth validation (no future dates, reasonable age range)
  - State code validation (only 50 US states + territories)
  - Zip code validation (5 digits)
  - Required field indicators
- **Time estimate:** 2-3 days
- **UX Impact:** Higher form completion rate

**3. Rate Limiting on VIN Decode (NHTSA API)**
- **Current:** No rate limiting; rapid VIN changes could trigger API blocks
- **Issue:** NHTSA API has ~1 req/second limit; form users might trigger multiple rapidly
- **Recommended:** 
  - Debounce VIN input (wait 500ms after typing stops before API call)
  - Show "Decoding..." UI feedback
  - Cache results: `{ vin: '...', result: '2015 NISSAN Rogue' }`
- **Time estimate:** 1 day

### 📱 UX/Feature Enhancements (Priority 3)

**1. Co-Applicant Support**
- **Current:** Single applicant only
- **Issue:** Married couples both need to be in system
- **Solution:** Add optional "Co-Applicant" toggle, duplicate Step 1 fields
- **Time estimate:** 2 days

**2. Progress Sync with Backend**
- **Current:** Data only in browser; if user closes tab mid-form, progress saved locally
- **Issue:** Can't resume on different device
- **Recommended:** 
  - Add optional login (email + magic link)
  - Sync localStorage to backend on interval
  - Allow resume from any device
  - Audit trail for compliance
- **Time estimate:** 5-7 days
- **Requires:** Backend API

**3. PDF Export Option**
- **Current:** Three export formats (CMSMTF, XML, CSV)
- **Recommended:** Add PDF summary for customer review/signature
- **Library:** jsPDF or pdfkit.js
- **Time estimate:** 2-3 days

**4. Mobile Improvements**
- **Current:** Responsive design, but still form-heavy on mobile
- **Issues:**
  - Long scrolling on mobile
  - Keyboard covers input fields
  - Small touch targets
- **Recommended:**
  - Progressive loading: show only visible section, lazy-load below fold
  - Larger buttons (min 48px hit target per Apple HIG)
  - Floating labels (reduce field height)
  - Voice input for address/notes (Web Speech API)
- **Time estimate:** 3-4 days

### 🧪 Testing & Quality (Priority 4)

**1. Automated Test Suite**
- **Current:** Manual testing only
- **Recommended:**
  - Jest for unit tests (export logic, date parsing, XML escaping)
  - Cypress for E2E tests (fill form → export → verify XML valid)
  - Example: Verify escapeXML("O'Brien & Co.") → "O&apos;Brien &amp; Co."
- **Time estimate:** 3-5 days
- **Files:** Create `/tests/` directory with `.test.js` files

**2. EZLynx XML Validator**
- **Current:** No validation before download
- **Recommended:** 
  - Add pre-download validation using XML schema
  - Check for common issues (empty required fields, bad formatting)
  - Show warnings: "Street number not detected - EZLynx may reject address"
- **Library:** xpath or xmldom
- **Time estimate:** 2-3 days

**3. HawkSoft CMSMTF Validator**
- **Current:** Generate and download; no verification
- **Recommended:**
  - Validate field variable names against master list
  - Check for duplicate custom field assignments
  - Warn if L1-L10 not set up in HawkSoft
- **Time estimate:** 1-2 days

### 📊 Analytics & Monitoring (Priority 5)

**1. Form Completion Analytics**
- **Current:** No visibility into where users drop off
- **Recommended:** 
  - Track: Steps completed, time per step, abandonment point
  - Use: Google Analytics 4 or Plausible (privacy-focused)
  - No PII tracked - just aggregated behavior
- **Time estimate:** 1-2 days

**2. Export Success Tracking**
- **Current:** No feedback on export success post-download
- **Recommended:**
  - Track: Which export types users choose, frequency, errors
  - Helps identify if XML issues are user-side or app-side
- **Time estimate:** 1 day

---

## Summary: What's Been Built vs. What's Needed

| Feature | Status | Notes |
|---------|--------|-------|
| Form capture (client info) | ✅ Complete | 70 fields across 4 steps |
| Dynamic workflows (home/auto/both) | ✅ Complete | Tested all three qType flows |
| HawkSoft CMSMTF export | ✅ Complete | 30+ field variables mapped |
| EZLynx XML export | ⚠️ Partial | Single applicant/vehicle only; missing state-specific coverage |
| EZLynx CSV export | ✅ Complete | 10-column format working |
| LocalStorage persistence | ✅ Complete | Auto-save on every input change |
| VIN decode (NHTSA) | ✅ Complete | Auto-populates year/make/model |
| Mobile UI | ✅ Complete | iOS-style design with safe areas |
| Multiple drivers/vehicles | ❌ Not built | Major gap for family quotes |
| Backend API integration | ❌ Not built | Needed for QAS automation & cross-device sync |
| Form validation | ⚠️ Minimal | Only DOB/name/state required for XML |
| Data encryption | ❌ Not built | Privacy concern for PII storage |
| PDF export | ❌ Not built | Customer deliverable feature |
| Testing/CI | ❌ Not built | Manual testing only |

---

*Last updated: February 3, 2026*
