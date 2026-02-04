# Altech - AI Coding Agent Instructions

## Project Overview
**Altech** is a mobile-first insurance lead capture wizard built as a single-page HTML application (~2917 lines) with serverless backend. It collects comprehensive intake data (personal, property, auto, risk factors) with **AI-powered policy document scanning** and exports to multiple insurance systems: HawkSoft (CRM) and EZLynx (quoting platform).

**Core Value Proposition:** Scan existing policies → AI extracts data → user corrects/fills form → save multiple drafts → batch export to downstream systems → no manual re-entry by agents.

**Key Insight:** Everything is in `index.html` with no build step. Changes are immediate in development. Tests use Jest + JSDOM to simulate browser environment.

## Architecture at a Glance

### The Stack
- **Frontend**: Single self-contained `index.html` (~2100 lines) - vanilla JavaScript, no build step
- **Backend**: Vercel serverless functions (`/api/*.js`) - Node.js for email & AI scanning
- **Storage**: LocalStorage with dual keys:
  - `altech_v6`: Current form data
  - `altech_v6_quotes`: Quote library (multiple saved drafts)
- **Styling**: CSS3 with Apple design system (SF Pro font, iOS-style components)
- **Dependencies**: JSZip (batch exports), jsPDF (PDF generation), Google Places API (address autocomplete)
- **Deployment**: Vercel (static + serverless functions)

### Data Flow: Scan/Form → Quote Library → Multiple Export/Email Options
```
┌─────────────────────────────────────────────────────┐
│ STEP 0: Policy Scan (Optional)                     │
│ Upload photos/PDFs → Google Gemini AI extraction   │
│         OR skip to manual entry                     │
└─────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ STEPS 1-5: Form Input (7 visual steps total)       │
│ Step 1: Personal Info (contact + demographics)     │
│ Step 2: Coverage Type (home/auto/both)             │
│ Step 3: Property Details (if home/both)            │
│ Step 4: Vehicle & Driver Info (if auto/both)       │
│ Step 5: Risk Factors & Additional Info (all)       │
│ LocalStorage Auto-Save (on every input change)     │
└─────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ STEP 6: Quote Library & Export Hub                 │
│ • Save multiple drafts (quote library)              │
│ • Select drafts for batch operations                │
│ • Export: XML, CMSMTF, PDF (individual or ZIP)     │
│ • Reset & start new draft                           │
└─────────────────────────────────────────────────────┘
                     ↓
         Three Export Engines:
  1. CMSMTF (.cmsmtf) → HawkSoft import
  2. XML (EZLynx format) → EZLynx quoting
  3. PDF (client-facing summary)
  
  Plus: ZIP batching for multiple drafts
```

### Critical Concept: Multi-Step Wizard with Dynamic Flows
The app has **7 visual steps** with **3 dynamic workflows** (Step 0 is optional scan):
- `workflows.home`: Step 0 (scan) → Step 1 (personal) → Step 2 (coverage select) → Step 3 (property) → Step 5 (risk/history) → Step 6 (export)
- `workflows.auto`: Step 0 → Step 1 → Step 2 → Step 4 (vehicle/driver) → Step 5 → Step 6
- `workflows.both`: All 7 steps

The `qType` radio button (in Step 2) triggers `App.handleType()` which:
1. Sets `this.flow` to the appropriate workflow array
2. Determines which steps to show (Step 3 for home, Step 4 for auto, both for bundle)
3. Updates UI and auto-advances to next step

## Code Structure & Key Objects

### Main App Object (`const App = {}`)
**Located at [index.html#L1136](index.html#L1136)** with properties:
- `data`: Form fields object (70+ keys like `firstName`, `lastName`, `vin`, etc.)
- `step`: Current step index (0-6)
- `flow`: Array of step names for current workflow (dynamically set by `handleType()`)
- `storageKey`: `'altech_v6'` (never change - breaks existing user data)
- `quotesKey`: `'altech_v6_quotes'` (stores array of draft objects)
- `scanFiles`: Temporary storage for policy images before upload
- `extractedData`: Parsed data from AI scan before applying to form

**Critical Workflows Property:**
```javascript
workflows: {
  home: ['step-0', 'step-1', 'step-2', 'step-3', 'step-5', 'step-6'],    // No vehicle section
  auto: ['step-0', 'step-1', 'step-2', 'step-4', 'step-5', 'step-6'],    // No property section
  both: ['step-0', 'step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6']  // All steps
}
```
**Note:** Step 3 = property details, Step 4 = vehicle/driver info. When user selects "home", step-4 never runs.

### Core App Methods

| Method | Purpose | Key Details |
|--------|---------|-------------|
| `init()` | Bootstrap: load storage, init UI, set up event listeners | Calls `load()`, `handleType()`, `renderQuoteList()`; sets up auto-save on all inputs via `addEventListener('input')` |
| `load()` / `save()` | Persist/restore `localStorage.altech_v6` | `load()`: parses JSON and populates form fields by `id`; `save()`: triggered by input event, shows "✓ Saved" toast for 1.5s |
| `updateUI()` | Render current step, update progress bar, enable/disable nav buttons | Called after `next()`/`prev()`, scrolls main to top, shows correct step div (others hidden) |
| `next()` / `prev()` | Navigate wizard | Only checks flow bounds; **no validation** - user can advance with empty fields (by design) |
| `handleType()` | Change workflow on `qType` radio selection | Sets `this.flow`, calls `updateUI()`, may skip to next step if current step hidden in new flow |
| `decodeVin()` | Async VIN → NHTSA API → auto-fills `vehDesc` | No error handling; fails silently if API down. Debounce recommended. |
| `getNotes()` | Format all data as human-readable text | Used by all three export methods as fallback/reference |
| `exportCMSMTF()` | Generate HawkSoft file with 40+ field mappings | Downloads as `Lead_${lastName}.cmsmtf`; uses `gen_s*`, custom fields `L1-L10`, `C1-C10` |
| `exportXML()` | Generate EZLynx XML (ACORD-like) | **Validates**: firstName, lastName, state, DOB required; throws alert if missing |
| `exportPDF()` | Client-facing PDF summary via jsPDF | Downloads as `Quote_${lastName}.pdf`; contains contact + coverage summary |
| `saveQuote()` | Save current form to quote library | Stores snapshot in `altech_v6_quotes`, calls `renderQuoteList()` to refresh UI |
| `renderQuoteList()` | Render quote library table with load/delete checkboxes | Called on init and after every save/delete; enables batch operations |
| `loadQuote(id)` | Restore quote by timestamp id | Calls `load()` to populate form, calls `updateUI()` |
| `startNewDraft()` | Clear current form, keep library intact | Preserves `altech_v6_quotes`, only clears `altech_v6` |
| `exportSelectedZip()` | Batch export selected quotes as ZIP | User selects via checkboxes, downloads as `Quotes_${timestamp}.zip` using JSZip |
| `clearAllDrafts()` | **Destructive:** Delete entire quote library | Requires confirmation; no undo |
| `reset()` | **Destructive:** Clear all storage, reload page | Requires confirmation; no undo |
| `openScanPicker()` | Open file picker for policy images/PDFs | Accepts: `.jpg`, `.png`, `.pdf`; stores in `scanFiles` array |
| `handleScanFiles()` | Process uploaded policy files | Calls `/api/policy-scan.js` with FormData; on success, calls `applyExtractedData()` |
| `applyExtractedData()` | Apply AI-extracted data to form | Populates only populated fields; preserves existing form data (doesn't overwrite) |
| `initPlaces()` | Initialize Google Places autocomplete (optional) | Gracefully fails if API unavailable; form still works without it |

### Serverless API Endpoints (`/api/*.js`)

| Endpoint | Method | Purpose | Environment Vars | Status |
|----------|--------|---------|------------------|--------|
| `/api/policy-scan.js` | POST | AI extraction from policy documents via Google Gemini | `GOOGLE_API_KEY` | ✅ Active |
| `/api/places-config.js` | GET | Returns Google Places API key for autocomplete | `GOOGLE_PLACES_API_KEY` | ✅ Active (optional - form works without it) |
| `/api/send-quotes.js` | POST | Emails ZIP file to agent via SendGrid | `SENDGRID_API_KEY` | ⚠️ Disabled (UI removed) |

**Critical:** All API keys stored as Vercel environment variables, never hardcoded. See [docs/guides/ENVIRONMENT_SETUP.md](docs/guides/ENVIRONMENT_SETUP.md) for configuration instructions.

### Critical Implementation Patterns

**Form Field Synchronization:** The app uses a **bidirectional sync** pattern with element IDs as keys:
```javascript
// SAVE: Form → Storage (triggered on every input/change event)
save(e) {
    this.data[e.target.id] = e.target.value;  // Key = element id
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
}

// LOAD: Storage → Form (called on init or when loading quote)
load() {
    const s = localStorage.getItem(this.storageKey);
    if (s) this.data = JSON.parse(s);
    Object.keys(this.data).forEach(k => {
        const el = document.getElementById(k);
        if (el) el.value = this.data[k];  // Must use element ID
    });
}
```
**Critical Rule:** Every form `<input id="fieldName">` automatically syncs to `App.data.fieldName`. Renaming IDs breaks persistence.

**Workflow Selection Logic:** When user selects coverage type (home/auto/both):
```javascript
handleType() {
    const t = document.querySelector('input[name="qType"]:checked').value;
    this.flow = this.workflows[t];  // Set correct step sequence
    // If current step not in new flow, auto-advance
    const idx = this.flow.indexOf(`step-${this.step}`);
    if (idx === -1) this.step = 0;
    this.updateUI();
}
```
Each workflow is a **custom array of step names**; changing order requires testing all three paths.

**Export Validation Pattern:** All export functions validate before generating file:
```javascript
exportXML() {
    // Required fields for XML
    if (!this.data.firstName || !this.data.lastName) {
        alert('First and last name are required');  // User must backtrack
        return;
    }
    if (!this.data.addrState || this.data.addrState.length !== 2) {
        alert('Valid 2-letter state code required');
        return;
    }
    // ... generate and download
}
```
CMSMTF is more lenient; XML is strict (EZLynx parser requirements).

## Development Workflows

### Local Development
```bash
npm run dev  # Starts http://localhost:8000 via npx serve
# OR
python3 -m http.server 8000

# App auto-reloads on file save (no build step)
# Form data persists in DevTools → Application → LocalStorage
```

### Testing
```bash
npm test              # Run all Jest tests with JSDOM
npm run test:watch   # Watch mode for TDD workflow
npm run test:coverage # Generate coverage report
```
**Test Setup:** [tests/app.test.js](tests/app.test.js) loads `index.html` into JSDOM and mocks localStorage. Tests verify export logic, date parsing, XML escaping.

### Testing Checklist Before Deployment
- [ ] Run `npm test` - all tests pass
- [ ] Fill form with special chars ("O'Brien & Co."), export XML, verify in text editor (no unescaped `&`)
- [ ] Test all three workflow types: home-only, auto-only, both
  - Verify Step 3 hidden in auto-only, Step 4 hidden in home-only
  - Verify progress bar % matches workflow length
- [ ] Fill with required fields (firstName, lastName, state, DOB), export XML, verify validates
- [ ] Export with missing fields, verify alert appears before download
- [ ] Save multiple quotes, select some, export ZIP, verify file structure
- [ ] Clear storage, reload page, verify all fields blank
- [ ] Fill form, close tab, reopen, verify data persists (check DevTools → LocalStorage)
- [ ] Test on mobile (DevTools device emulation) - verify touch targets, no overflow

### Deployment
```bash
vercel --prod  # Deploy to Vercel (requires vercel.json + environment vars)
# OR
git push origin main  # If GitHub Pages configured (see README.md)
```
Before first deployment: **Set Vercel environment variables** - see [docs/guides/ENVIRONMENT_SETUP.md](docs/guides/ENVIRONMENT_SETUP.md).

## Common Tasks & Code Locations

| Task | Location | Pattern |
|------|----------|---------|
| **Add new form field** | `index.html` step divs | `<input id="fieldName" ...>` - auto-syncs to `App.data.fieldName` via `save()`/`load()` |
| **Add field to export** | `index.html` export methods (~L2318, ~L2396) | Include in all three: `exportCMSMTF()`, `exportXML()`, `exportPDF()` |
| **Change workflow order** | [index.html#L1145](index.html#L1145) | Edit `workflows.home/auto/both` arrays; test all three paths |
| **Add validation** | `index.html` export methods | Add check before download: `if (!this.data.field) { alert(...); return; }` |
| **Modify styling** | [index.html#L12-L120](index.html#L12-L120) | Edit `:root` CSS variables (colors, spacing) - no hardcoded values |
| **Add new export destination** | `index.html` method around L2600+ | Create new `export*()` method, add button to Step 6 |
| **Fix field mapping** | [docs/archive/FIELD_MAPPING_UPDATE.md](docs/archive/FIELD_MAPPING_UPDATE.md) | Reference for CMSMTF `gen_s*` variable names |
| **Test HawkSoft export** | Local or Vercel | Download `.cmsmtf`, import via HawkSoft → Utilities → Import |
| **Test EZLynx export** | Local or Vercel | Download `.xml`, import via EZLynx → Applicants → Import |
| **Configure API keys** | Vercel dashboard | Set env vars: `GOOGLE_API_KEY`, `GOOGLE_PLACES_API_KEY` |
| **Add new serverless function** | Create `/api/new-function.js` | Export default handler, add to `vercel.json` builds if needed |
| **Debug in browser** | DevTools console | `JSON.parse(localStorage.getItem('altech_v6'))` shows all form data |

## Critical DO's & DON'Ts

### ✅ DO:
1. **Preserve workflow arrays** - Don't hardcode step order; use `this.flow` array
2. **Test all three export types** - One form serves home/auto/both; all three must work
3. **Validate required fields before export** - CMSMTF lenient; XML strict (needs name, state, DOB)
4. **Use CSS variables** - Don't hardcode colors; leverage `:root` variables
5. **Maintain `altech_v6` key** - Never increment version; breaks existing user data
6. **Keep form self-contained** - No external JS libraries; all logic in one HTML file
7. **Check field ID before renaming** - IDs are storage keys; renaming breaks persistence

### ❌ DON'T:
1. **Add new form fields without planning all three exports** - CMSMTF, XML, PDF must all adapt
2. **Change workflow arrays without testing all three qTypes** - Easy to break home-only or auto-only flows
3. **Move existing fields to different steps** - LocalStorage keys are field IDs; renaming breaks persistence
4. **Assume fields are always present** - Use optional chaining or fallback to empty string in exports
5. **Parse user input as JSON** - Stay with plain strings for robustness
6. **Use bracket notation in CMSMTF** - Format is `gen_sFirstName = John`, not `[gen_sFirstName]`
7. **Hardcode API keys** - Always use Vercel environment variables

## Constraints & Known Limitations

1. **LocalStorage only** - No backend sync. Clearing browser storage = lost data. Production needs backend.
2. **Single-user** - No authentication or multi-user support.
3. **NHTSA VIN decode has rate limits** - Multiple rapid VIN lookups may fail; debounce recommended.
4. **EZLynx XML validation strict** - Will reject if name/state/DOB missing; user must backtrack to fix.
5. **No email validation** - Form accepts any string in email field (intentional for lead capture).
6. **Responsive, not adaptive** - Single layout for all screen sizes; future work could add tablet optimizations.
7. **Single driver/vehicle per quote** - Multi-vehicle families need multiple quotes or manual additions.
8. **Google Places API optional** - If API fails to load, address field works as normal text input (no autocomplete).
9. **Email functionality disabled** - UI removed; `/api/send-quotes.js` exists but not accessible from frontend.
10. **API keys in Vercel env vars** - Backend functions require proper environment configuration before deployment.

## Next Steps for New Agents

1. **First task always:** Review the three workflow types and understand which fields appear in each flow
2. **Before editing:** Check if your change affects storage (field IDs), exports (all three), or workflows
3. **After editing:** Run `npm test` and test the specific workflow affected (home-only, auto-only, or both)
4. **For new exports:** Verify CMSMTF, XML, and PDF all handle your new field (or exclude it intentionally)
5. **Debug pattern:** DevTools → Application → LocalStorage shows the current state of `altech_v6` and `altech_v6_quotes`

---

## Future Enhancement Opportunities

**High-Impact (P1):**
- **Multiple Drivers/Vehicles:** Expand from single to multiple with proper export indexing
- **Backend Sync:** Add optional login & cloud persistence for cross-device resume
- **XML Improvements:** Add co-applicant, state-specific coverage, vehicle assignments

**Medium-Impact (P2):**
- **Form Validation:** Email, phone, state code, zip format validation with inline hints
- **Data Encryption:** AES-256 encryption for PII in localStorage
- **VIN Debouncing:** Rate-limit NHTSA API calls, cache results

---

*Last updated: February 4, 2026 | Comprehensive AI instructions for Altech development*
