# Altech - AI Coding Agent Instructions

## Quick Start for AI Agents

**Altech** = mobile-first insurance lead wizard. Scan policy → AI extracts data → user corrects form → save drafts → export to HawkSoft (.cmsmtf) + EZLynx (.xml). Single HTML file (~2917 lines), no build step, tests via Jest + JSDOM.

**Core Principle:** Everything in `index.html` with **no build step**—edit → reload → see changes immediately. Form data auto-saves to `localStorage.altech_v6` (browser-only, no backend sync yet).

**Three Export Engines (All Must Work):**
1. **CMSMTF** → HawkSoft CRM import (~40 field mappings)
2. **XML** → EZLynx quoting platform (strict validation: requires firstName, lastName, state, DOB)
3. **PDF** → Client-facing summary

**Three Workflows (Test All When Changing Steps):**
- `workflows.home`: property-only flow (skip Step 4: vehicles)
- `workflows.auto`: auto-only flow (skip Step 3: property)
- `workflows.both`: all 7 steps (home + auto)

---

## The Five Critical Patterns

### 1. **Form ↔ Storage Bidirectional Sync** (Foundation)
Every `<input id="fieldName">` auto-syncs to `App.data.fieldName`:
```javascript
// SAVE: Form → Storage (triggered by input/change events)
App.save(e) {
    this.data[e.target.id] = e.target.value;  // ID is the storage key
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
}

// LOAD: Storage → Form (called on init or when loading a draft)
App.load() {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) this.data = JSON.parse(stored);
    Object.keys(this.data).forEach(k => {
        const el = document.getElementById(k);
        if (el) el.value = this.data[k];
    });
}
```

**⚠️ CRITICAL:** Field `id` attributes are storage keys. Renaming an `id` breaks persistence for existing users' saved data. Use stable IDs.

### 2. **Dynamic Workflows (Home/Auto/Both)** (The "Big Picture")
The `qType` radio button (Step 2) determines which steps are visible:
```javascript
workflows: {
  home: ['step-0', 'step-1', 'step-2', 'step-3', 'step-5', 'step-6'],    // No vehicles
  auto: ['step-0', 'step-1', 'step-2', 'step-4', 'step-5', 'step-6'],    // No property
  both: ['step-0', 'step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6']  // All
}

// When user selects qType:
App.handleType() {
    const t = document.querySelector('input[name="qType"]:checked').value;
    this.flow = this.workflows[t];  // Set correct sequence
    // Update UI + progress bar
    this.updateUI();
}
```

**Rule:** Step 3 = property, Step 4 = vehicles. When you change workflow arrays, **test all 3 qTypes** before committing.

### 3. **Three Export Engines (All Must Work)** (Design Constraint)
One form data object powers three completely different formats:

**CMSMTF** (HawkSoft):
- Format: `gen_sFirstName = John` (plain text, `=` separator, no escaping needed)
- Custom fields: `L1-L10` (property), `C1-C10` (auto), `R1-R10` (admin)
- Mapping reference: [docs/archive/FIELD_MAPPING_UPDATE.md](../docs/archive/FIELD_MAPPING_UPDATE.md)

**XML** (EZLynx):
- Strict validation: requires `firstName`, `lastName`, `state` (2 chars), `dob` (YYYY-MM-DD)
- **Must escape special chars:** `escapeXML("O'Brien & Co.")` → `"O&apos;Brien &amp; Co."`
- Complex parsing: street address split into number + name, vehicles parsed from text
- Namespace critical: `xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200"`

**PDF** (client):
- jsPDF library generates summary table
- Downloads as `Quote_${lastName}.pdf`

**When adding a form field:** Decide—include in all 3 exports or specific ones? Plan before coding.

### 4. **Auto-Save Toast Pattern** (UX Signal)
Every input change shows "✓ Saved" (top-right, 1.5s fade):
```javascript
App.save(e);  // User types → saves immediately
// Shows: showSaveIndicator() → setTimeout(() => fade after 1.5s)
```
Users feel safe; data persists even if browser closes.

### 5. **Quote Library (Multi-Draft System)** (Advanced Feature)
Users save/load/export multiple drafts:
- **Storage:** `localStorage.altech_v6_quotes` (array of quote objects)
- **Quote object:** `{ id, timestamp, name: "${firstName} ${lastName}", data, qType }`
- **Core methods:** `saveQuote()`, `loadQuote()`, `renderQuotesList()`, `exportSelectedZip()`
- **Scenario:** User fills form → "Save Draft" (Step 6) → can load later to resume

---

## Development Workflow

### Local Dev (No Build Step)
```bash
npm run dev  # or: python3 -m http.server 8000
# Edit index.html → reload browser → see changes immediately
# Form data persists in: DevTools → Application → LocalStorage → altech_v6
```

### Testing (Jest + JSDOM)
```bash
npm test              # Run unit tests
npm run test:watch   # TDD mode
npm run test:coverage # Coverage report
```

**Test file:** [tests/app.test.js](../tests/app.test.js) — loads `index.html` into JSDOM, mocks localStorage, verifies export logic.

**Before Deployment Checklist:**
- [ ] `npm test` passes all tests
- [ ] Export XML with special chars ("O'Brien & Co.") → open file → no bare `&` characters
- [ ] Test **all 3 workflows**: home-only, auto-only, both → verify correct steps visible
- [ ] Export with missing required fields (name/state/DOB for XML) → verify alert appears
- [ ] Save 2+ drafts → export ZIP → verify file structure
- [ ] Clear storage, reload → fields blank ✓
- [ ] Fill form, close tab, reopen → data restored from localStorage ✓
- [ ] Mobile test (DevTools) → touch targets ≥48px, no overflow

### Deploy to Vercel
```bash
vercel --prod  # Requires vercel.json + environment variables
```

**Required Environment Variables:**
- `GOOGLE_API_KEY` — policy scanning via Gemini
- `GOOGLE_PLACES_API_KEY` — address autocomplete (optional; form works without it)
- `SENDGRID_API_KEY` — email export (currently disabled from UI)

See [docs/guides/ENVIRONMENT_SETUP.md](../docs/guides/ENVIRONMENT_SETUP.md).

---

## Common Tasks & Patterns

| Task | Location | Pattern |
|------|----------|---------|
| **Add form field** | `index.html` step div | `<input id="fieldName">` auto-syncs via save/load |
| **Add to exports** | `exportCMSMTF()`, `exportXML()`, `exportPDF()` (~L2200–2600) | Include in each; validate required fields |
| **Change workflow order** | [index.html](../index.html) | Edit `workflows` object; test all 3 qTypes |
| **Add validation** | Export methods | `if (!this.data.field) { alert(...); return; }` |
| **Modify styling** | [index.html](../index.html) | Use CSS variables (`:root`), no hardcoded colors |
| **Debug data** | DevTools console | `JSON.parse(localStorage.getItem('altech_v6'))` |
| **Field mapping (CMSMTF)** | [docs/archive/FIELD_MAPPING_UPDATE.md](../docs/archive/FIELD_MAPPING_UPDATE.md) | Maps field → HawkSoft variable |

---

## Critical XML/CMSMTF Export Logic

### XML Data Parsing Functions (Copy These Patterns)

**XML Character Escaping** (required for all XML):
```javascript
const escapeXML = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
};
// Test: escapeXML("O'Brien & Co.") → "O&apos;Brien &amp; Co."
```

**Date Normalization** (EZLynx requires YYYY-MM-DD):
```javascript
const normalizeDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  if (year < 1900 || year > new Date().getUTCFullYear()) return '';
  return d.toISOString().split('T')[0];  // "1990-05-15"
};
```

**Street Address Parsing** (EZLynx expects street number separate):
```javascript
const streetRaw = "408 nw 116th st";
const match = streetRaw.match(/^(\d+)\s+(.*)$/);
const streetNumber = match?.[1] || '';  // "408"
const streetName = match?.[2] || '';    // "nw 116th st"
```

---

## DO ✅ & DON'T ❌

### ✅ DO:
1. **Preserve workflow arrays** — Changes to `workflows` object affect all 3 qTypes
2. **Test all three export types** — One form, three use cases; all must work
3. **Use CSS variables** — Reference `:root` colors, never hardcode (#007AFF)
4. **Keep field IDs stable** — IDs are storage keys; renaming breaks persistence
5. **Validate before export** — Show alerts for missing required fields (name, state, DOB for XML)
6. **Plan new fields** — Decide: include in all 3 exports or specific ones? Before coding.

### ❌ DON'T:
1. **Change `altech_v6` storage key** — Never increment without migration code
2. **Move form fields between steps** — Breaks save/load; IDs tied to storage
3. **Assume optional fields** — Use `this.data.field || ''` fallbacks in all exports
4. **Parse user input as JSON** — Always treat as strings; robustness first
5. **Use `[gen_sFirstName]` in CMSMTF** — Format is `gen_sFirstName = `, not brackets
6. **Hardcode API keys** — Always use Vercel environment variables
7. **Skip testing workflows** — Easy to break auto-only or both flows

---

## Constraints & Known Limitations

1. **LocalStorage only** — Single browser, no cross-device sync. Production needs backend.
2. **Single driver/vehicle** — Multi-vehicle quotes require multiple drafts.
3. **Single applicant** — No co-applicant support.
4. **EZLynx XML strict** — Rejects if name/state/DOB missing; user must backtrack.
5. **VIN API rate limits** — NHTSA ~1 req/sec; debounce input recommended.
6. **Google Places optional** — If API fails, address field works as text input.

---

## Troubleshooting Checklist

**EZLynx XML Import Fails?**
- [ ] Check for unescaped `&` in XML (should be `&amp;`)
- [ ] Namespace must be `xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200"`
- [ ] DOB format must be YYYY-MM-DD (not "02/19/1957")
- [ ] firstName, lastName, state required (if missing, alert before download)
- [ ] Street number must be extracted ("408 nw st" → streetNumber="408")
- [ ] State must be 2 uppercase letters ("WA" not "wa" or "WAS")

**HawkSoft CMSMTF Import Fails?**
- [ ] Verify field variable names (`gen_sFirstName = John`, not `[gen_sFirstName]`)
- [ ] Custom fields L1-L10, C1-C10, R1-R10 must exist in HawkSoft
- [ ] No escaping needed in CMSMTF (plain text key=value)

**Form Data Lost?**
- [ ] DevTools → Application → LocalStorage → verify `altech_v6` key exists
- [ ] Fill form, close tab, reopen → data should restore ✓
- [ ] Clear storage test: Clear → reload → fields blank ✓

**Google Places API field locked up?**
- [ ] Check browser console for errors
- [ ] Verify `GOOGLE_PLACES_API_KEY` is set in Vercel env vars
- [ ] Form works without Places API; address field becomes normal text input

---

## API Endpoints

| Endpoint | Method | Purpose | Env Var | Status |
|----------|--------|---------|---------|--------|
| `/api/policy-scan.js` | POST | AI policy scanning (Google Gemini) | `GOOGLE_API_KEY` | ✅ Active |
| `/api/places-config.js` | GET | Address autocomplete config | `GOOGLE_PLACES_API_KEY` | ✅ Active (optional) |
| `/api/send-quotes.js` | POST | Email ZIP via SendGrid | `SENDGRID_API_KEY` | ⚠️ Disabled (UI removed) |

---

## Full Documentation Reference

For exhaustive architecture details, multi-vehicle enhancements, field mappings, and future enhancements, see:
**[.github/copilot-instructions-clean.md](copilot-instructions-clean.md)** (comprehensive walkthrough)

This file focuses on the essentials for immediate productivity. The clean version has detailed XML structure, CMSMTF mapping tables, and enhancement roadmap.

---

**Next Steps for New Agents:**
1. Review the three workflow types in `App.workflows`
2. Understand form ↔ storage sync pattern
3. Run `npm test` to verify your changes don't break exports
4. Test all 3 workflows if you change step logic
5. Debug data: `JSON.parse(localStorage.getItem('altech_v6'))`

*Last updated: February 4, 2026 | Focus: Essential patterns for AI agents to be productive immediately*
