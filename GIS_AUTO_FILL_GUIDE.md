# GIS Auto-Fill Guide - Using County Data to Answer Form Questions

**Created:** February 5, 2026
**Status:** WORKING (with some limitations)
**Your Question:** "I want to figure out how to pull the GIS data to answer questions within our form"

---

## TL;DR - What You Have vs What You Want

### What Currently Works ✅
- **GIS data pulls automatically** when user enters an address
- **Shows popup** with property data (year built, sqft, stories, garage)
- **Auto-fills 5 fields** after user approval: Year Built, Stories, Garage Spaces, Lot Size, Square Feet
- **3-Phase Pipeline:** ArcGIS API → Headless Browser → RAG Interpretation via Gemini

### What's Limited ⚠️
- **Only 5 fields auto-filled** (out of 30+ property questions in your form)
- **Only 4 counties supported:** Clark WA, King WA, Pierce WA, Multnomah OR
- **User must manually enter:** Roof type, foundation, heating type, bathrooms, bedrooms, etc.

### What Your Research Document Says 💡
- **"Find the hidden REST APIs"** - Use browser DevTools to discover county map endpoints
- **"Avoid bot detection"** - Use direct API calls instead of scraping the UI
- **"RAG Pattern with Gemini"** - Have AI interpret inconsistent county data formats

**You're already doing all this!** Let me show you how to expand it.

---

## Current Implementation - How It Works

### The Workflow (User Perspective)

1. User enters address in Step 3 (Property Location)
2. User clicks **🪄 Smart Fill** button
3. App queries county GIS APIs in sequence:
   - **Phase 1:** Try ArcGIS REST API (official county data)
   - **Phase 2:** Try headless browser scraping (fallback)
   - **Phase 3:** Gemini interprets raw data
   - **Phase 4:** Vision processing (satellite hazard detection)
4. Popup shows property data with confidence score
5. User clicks "✓ Use This Data"
6. Form auto-fills with available data

### The Data Flow (Technical)

```
User Address → /api/arcgis-consumer.js → County ArcGIS API
                        ↓ (if fails)
            /api/headless-browser.js → County Website
                        ↓
            /api/rag-interpreter.js → Gemini 2.5 Flash → Standardized Data
                        ↓
            showParcelDataPopup() → User Approval → applyParcelData()
                        ↓
            Form Fields Auto-Filled ✅
```

---

## What Fields Get Auto-Filled (Currently)

**Location:** `index.html` lines 3759-3793 (`applyParcelData()` function)

### Currently Auto-Filled (5 fields):
1. **Year Built** → `yearBuilt` field
2. **Stories** → `numStories` field
3. **Garage Spaces** → `garageSpaces` field (calculated from garage sqft ÷ 180)
4. **Lot Size** → `lotSize` field (acres)
5. **Square Feet** → `squareFeet` field (total living area)

### Available But NOT Auto-Filled (from GIS):
- Parcel ID
- Owner Name
- Land Use Code
- Basement Sqft
- Main Floor Sqft
- Roof Type (only from Pierce County)
- Garage Type (only from Clark County)

### Form Questions That Need Manual Entry:
- ❌ Foundation Type (Slab, Crawl Space, Basement, etc.)
- ❌ Roof Type (Asphalt Shingle, Metal, Tile, etc.)
- ❌ Heating Type (Forced Air, Electric, Heat Pump)
- ❌ Bedrooms / Bathrooms
- ❌ Construction Style (Frame, Brick, etc.)
- ❌ Dwelling Usage (Primary, Secondary, Rental)
- ❌ Fire Protection (distance to fire station, hydrant, protection class)
- ❌ Alarms (burglar, fire, sprinklers)

---

## The Issues You're Hitting (Likely)

### Issue #1: Limited County Coverage
**Problem:** Only 4 counties configured
**Research Recommendation (Line 37):** "Use browser Developer Tools... toggle a map layer... identify the outgoing request to an ArcGIS Server"

**Solution:** Add more counties by discovering their APIs

**How to Find County APIs:**
1. Go to your county's GIS/property search site
2. Open browser DevTools (F12) → Network Tab → Clear traffic
3. Search for a property or toggle a map layer
4. Look for requests to URLs like:
   ```
   https://[county].arcgis.com/arcgis/rest/services/...
   https://gis.[county].gov/arcgis/rest/services/...
   ```
5. Copy the URL and add to `COUNTY_ARCGIS_CONFIG` in `/api/arcgis-consumer.js`

**Example (Adding Snohomish County, WA):**
```javascript
'Snohomish': {
  state: 'WA',
  baseUrl: 'https://gis.snoco.org/arcgis/rest/services/Parcels/MapServer',
  queryService: 0,
  fields: ['PARCEL_ID', 'YEAR_BUILT', 'SQFT', ...],
  searchField: 'PARCEL_ID'
}
```

### Issue #2: County Data Fields Don't Match Form Questions
**Problem:** Counties return "ROOF_COVER_TYPE: 3" but your form needs "Asphalt Shingle"

**Research Recommendation (Line 38):** "Use Gemini to 'write an API request'"

**Current Solution:** Phase 3 RAG pattern already does this, but only for standardization, not interpretation

**Better Solution:** Expand Phase 3 to map codes to descriptions

**Example Enhancement to `/api/rag-interpreter.js`:**
```javascript
// Current: Standardizes field names
// Enhanced: Interprets codes and maps to form options

const prompt = `
Interpret this property data and return JSON matching these exact form fields:
- foundationType: ["Slab", "Crawl Space", "Basement", "Pier", "Unknown"]
- roofType: ["Asphalt Shingle", "Metal", "Tile", "Shake", "Other"]
- heatingType: ["Forced Air Gas", "Electric", "Heat Pump", "Oil", "Other"]

Raw data: ${JSON.stringify(rawParcelData)}

Return only valid options. If uncertain, return "Unknown".
`;
```

### Issue #3: Missing Data in County Records
**Problem:** County has year built but not roof type

**Research Recommendation (Line 54):** "Use Gemini to read incoming PDFs and automatically update a central dashboard"

**Current Solution:** Phase 4 (Vision Processing) already exists for satellite hazard detection

**Better Solution:** Extend Phase 4 to extract more property details from satellite imagery

**Example Enhancement:**
```javascript
// In /api/smart-extract.js or /api/vision-processor.js
const prompt = `
Analyze this satellite image and identify:
1. Roof type (asphalt shingle, metal, tile, etc.)
2. Roof condition (new, aged, damaged)
3. Foundation visibility (slab, crawl space indicators)
4. Property features (pool, deck, outbuildings)
5. Lot coverage percentage
6. Tree coverage
7. Driveway/parking area size

For each item, provide:
- value: your best assessment
- confidence: 0-100%
- reasoning: brief explanation
`;
```

### Issue #4: Bot Detection / CAPTCHA
**Problem:** County sites block automated requests

**Research Recommendation (Lines 40-44):**
- "Rotating Residential Proxies"
- "Randomized Delays: 5–10 seconds"
- "Headless Browser Stealth: Undetected Chromedriver"

**Current Solution:** Phase 2 (`/api/headless-browser.js`) already uses Playwright with stealth mode

**If Still Getting Blocked:**
1. **Check User-Agent:** Make sure it's a real browser UA
2. **Add Delays:** `await page.waitForTimeout(Math.random() * 5000 + 5000);`
3. **Handle Cookies:** Accept cookie banners automatically
4. **Use Residential Proxies:** If site aggressively blocks data centers

---

## How to Expand Auto-Fill (Step-by-Step)

### Option A: Add More Counties (15 minutes per county)

**Steps:**
1. Find county GIS site
2. Use DevTools Network Tab to find ArcGIS endpoint
3. Add to `COUNTY_ARCGIS_CONFIG` in `/api/arcgis-consumer.js`
4. Test with sample address

**Example Counties to Add:**
- Snohomish County, WA
- Thurston County, WA
- Spokane County, WA
- Clackamas County, OR
- Maricopa County, AZ (if expanding beyond WA/OR)

### Option B: Map More Fields (30 minutes)

**Steps:**
1. Check what fields your county APIs return (look at `rawResponse` in popup)
2. Add mapping logic to `normalizeParcelData()` in `/api/arcgis-consumer.js`
3. Enhance `applyParcelData()` in `index.html` to fill more form fields

**Example - Adding Roof Type:**
```javascript
// In normalizeParcelData() (arcgis-consumer.js line 143):
roofType: attrs.ROOF_COVER_TYPE || attrs.ROOF_MATERIAL || 'Unknown',

// In applyParcelData() (index.html line 3759):
if (parcelData.roofType && parcelData.roofType !== 'Unknown') {
    // Map county code to form option
    const roofMapping = {
        '1': 'Asphalt Shingle',
        '2': 'Metal',
        '3': 'Tile',
        'ASPHALT': 'Asphalt Shingle',
        'COMP': 'Asphalt Shingle'
    };
    const mappedRoof = roofMapping[parcelData.roofType] || parcelData.roofType;
    document.getElementById('roofType').value = mappedRoof;
    this.data.roofType = mappedRoof;
}
```

### Option C: Use Gemini to Interpret More Intelligently (1 hour)

**Steps:**
1. Expand `/api/rag-interpreter.js` prompt
2. Add form field options to the prompt
3. Let Gemini map county codes to your dropdown values

**Enhanced Prompt:**
```javascript
const prompt = `
You are interpreting county property assessor data for an insurance application.

County Data:
${JSON.stringify(rawParcelData)}

Form Field Options:
- Foundation Type: ["Slab", "Crawl Space", "Basement", "Pier", "Unknown"]
- Roof Type: ["Asphalt Shingle", "Metal", "Tile", "Wood Shake", "Other", "Unknown"]
- Heating Type: ["Forced Air Gas", "Electric Baseboard", "Heat Pump", "Oil Furnace", "Radiant", "Other"]
- Construction Style: ["Frame", "Masonry", "Brick Veneer", "Stucco", "Log", "Other"]

Task:
1. Extract all available property information
2. Interpret any codes or abbreviations (e.g., "COMP" → "Asphalt Shingle")
3. Map values to the exact form options listed above
4. If uncertain, use "Unknown" or "Other"
5. Return ONLY valid JSON with these fields

Return JSON:
{
  "yearBuilt": number,
  "stories": number,
  "totalSqft": number,
  "foundationType": string (from options),
  "roofType": string (from options),
  "heatingType": string (from options),
  "constructionStyle": string (from options),
  "garageSpaces": number,
  "lotSizeAcres": number
}
`;
```

**Then update `applyParcelData()` to use the new fields:**
```javascript
if (parcelData.foundationType && parcelData.foundationType !== 'Unknown') {
    document.getElementById('foundation').value = parcelData.foundationType;
    this.data.foundation = parcelData.foundationType;
}

if (parcelData.heatingType && parcelData.heatingType !== 'Unknown') {
    document.getElementById('heatingType').value = parcelData.heatingType;
    this.data.heatingType = parcelData.heatingType;
}

// And so on...
```

### Option D: Use Vision AI for Missing Data (2 hours)

**Steps:**
1. Enhance `/api/smart-extract.js` or `/api/vision-processor.js`
2. Add detailed prompts for roof, foundation, property condition
3. Get satellite image from Google Maps Static API or similar
4. Let Gemini analyze and extract visual features

**Already working:** Hazard detection (pool, trampoline, deck)
**Can add:** Roof type, roof condition, foundation visibility, tree coverage, lot improvements

---

## Quick Win: Add 5 More Auto-Fill Fields (20 minutes)

Let's add the low-hanging fruit that county data usually has:

### Fields to Add:
1. **Bedrooms** (if available in county data)
2. **Bathrooms** (if available)
3. **Foundation Type** (if available)
4. **Heating Type** (if available)
5. **Roof Material** (if available from Pierce County)

**Implementation:**

**Step 1:** Check if your county APIs return these fields (look at raw response in popup)

**Step 2:** Add to `normalizeParcelData()` in `/api/arcgis-consumer.js`:
```javascript
bedrooms: parseInt(attrs.BEDROOMS || attrs.BEDS || 0) || 0,
bathrooms: parseFloat(attrs.BATHROOMS || attrs.BATHS || 0) || 0,
heatingType: attrs.HEATING_TYPE || attrs.HEAT_FUEL || 'Unknown',
foundationType: attrs.FOUNDATION_TYPE || attrs.BASEMENT_TYPE || 'Unknown',
```

**Step 3:** Add to `applyParcelData()` in `index.html` after line 3786:
```javascript
// Bedrooms
if (parcelData.bedrooms > 0) {
    document.getElementById('bedrooms').value = parcelData.bedrooms;
    this.data.bedrooms = parcelData.bedrooms;
}

// Bathrooms
if (parcelData.bathrooms > 0) {
    document.getElementById('bathrooms').value = parcelData.bathrooms;
    this.data.bathrooms = parcelData.bathrooms;
}

// Foundation
if (parcelData.foundationType && parcelData.foundationType !== 'Unknown') {
    document.getElementById('foundation').value = parcelData.foundationType;
    this.data.foundation = parcelData.foundationType;
}

// Heating
if (parcelData.heatingType && parcelData.heatingType !== 'Unknown') {
    document.getElementById('heatingType').value = parcelData.heatingType;
    this.data.heatingType = parcelData.heatingType;
}

// Roof Type
if (parcelData.roofType && parcelData.roofType !== 'Unknown') {
    document.getElementById('roofType').value = parcelData.roofType;
    this.data.roofType = parcelData.roofType;
}
```

**Step 4:** Add these fields to the popup display in `showParcelDataPopup()` at line 3672:
```javascript
const fields = [
    { label: 'Year Built', value: parcelData.yearBuilt || 'N/A' },
    { label: 'Lot Size', value: parcelData.lotSizeAcres > 0 ? `${parcelData.lotSizeAcres.toFixed(2)} acres` : 'N/A' },
    { label: 'Total Sq Ft', value: parcelData.totalSqft > 0 ? parcelData.totalSqft.toLocaleString() : 'N/A' },
    { label: 'Stories', value: parcelData.stories > 0 ? parcelData.stories : 'N/A' },
    { label: 'Garage Sq Ft', value: parcelData.garageSqft > 0 ? parcelData.garageSqft.toLocaleString() : 'N/A' },
    { label: 'Land Use', value: parcelData.landUse || 'N/A' },
    // NEW FIELDS:
    { label: 'Bedrooms', value: parcelData.bedrooms > 0 ? parcelData.bedrooms : 'N/A' },
    { label: 'Bathrooms', value: parcelData.bathrooms > 0 ? parcelData.bathrooms : 'N/A' },
    { label: 'Foundation', value: parcelData.foundationType || 'N/A' },
    { label: 'Heating', value: parcelData.heatingType || 'N/A' },
    { label: 'Roof Type', value: parcelData.roofType || 'N/A' }
];
```

---

## Troubleshooting Common Issues

### Issue: "No parcel found at location"
**Cause:** Address geocoding failed or parcel not in county database
**Solution:**
1. Check if address is in a supported county (Clark, King, Pierce, Multnomah)
2. Try manually entering lat/lng coordinates
3. Check if address exists in county GIS portal

### Issue: "Failed to retrieve property data"
**Cause:** API endpoint changed, network error, or bot detection
**Solution:**
1. Check browser console for specific error
2. Test `/api/arcgis-consumer.js` endpoint directly in browser
3. Verify `NEXT_PUBLIC_GOOGLE_API_KEY` environment variable is set
4. Check county API hasn't changed (test in DevTools)

### Issue: "Data shows in popup but doesn't auto-fill"
**Cause:** Field IDs don't match between popup and form
**Solution:**
1. Verify form field IDs in Step 3 (Property Details)
2. Check `applyParcelData()` function uses correct IDs
3. Look for console errors

### Issue: "Gemini interpretation fails (Phase 3)"
**Cause:** API key missing, rate limit, or malformed data
**Solution:**
1. Check `NEXT_PUBLIC_GOOGLE_API_KEY` is set
2. Verify API key has Gemini access enabled
3. Check `/api/rag-interpreter.js` for errors
4. Try with smaller data payload

---

## Research Document Key Takeaways

From "The Algorithmic Shield" document you uploaded:

### What You're Already Doing Right ✅
1. ✅ **"Finding the Endpoint"** (Line 37) - Your `/api/arcgis-consumer.js` uses REST APIs
2. ✅ **"Bypassing UI Blocks"** (Line 38) - Direct JSON from APIs
3. ✅ **"Headless Browser Stealth"** (Line 44) - Playwright in Phase 2
4. ✅ **"RAG Pattern"** (Lines 69-70) - Gemini interprets county data in Phase 3

### What You Can Add (From Research) 💡
1. **"Auth and Token Handling"** (Line 39) - Some counties need API keys
2. **"Rotating Residential Proxies"** (Line 42) - If getting blocked
3. **"Randomized Delays"** (Line 43) - 5-10 seconds between requests
4. **"Modular Design"** (Line 58) - Treat GIS as independent plugin

### Research Quote Perfectly Describing Your App:
> "The most reliable way to pull GIS data is not through web scraping, but by discovering the 'hidden' REST APIs that power the map interface." (Lines 36-37)

**That's exactly what you did!** Your Phase 1 queries official ArcGIS APIs, Phase 2 falls back to scraping, and Phase 3 standardizes with Gemini.

---

## Next Steps

### Short-Term (This Week):
1. ✅ Add 5 more auto-fill fields (bedrooms, bathrooms, foundation, heating, roof)
2. ⏳ Test with real addresses in all 4 supported counties
3. ⏳ Add 2-3 more counties (Snohomish, Thurston, Spokane)

### Medium-Term (This Month):
1. Enhance Phase 3 (RAG) to interpret more county codes
2. Expand Phase 4 (Vision) to analyze roofs, foundations from satellite
3. Add fire protection data (distance to fire station/hydrant from GIS)

### Long-Term (Next Quarter):
1. Support all WA/OR counties
2. Add CA, AZ, ID counties
3. Pull fire protection class from ISO public registry
4. Integrate FEMA flood zone data

---

## Code Files to Modify

| File | Current Lines | What to Change |
|------|---------------|----------------|
| `/api/arcgis-consumer.js` | 143-165 | Add more fields to `normalizeParcelData()` |
| `/api/rag-interpreter.js` | ~50-100 | Enhance prompt to map codes to form options |
| `index.html` line 3759 | `applyParcelData()` | Add auto-fill logic for new fields |
| `index.html` line 3672 | `showParcelDataPopup()` | Display new fields in popup |

---

## Summary

**You asked:** "I want to figure out how to pull the GIS data to answer questions within our form"

** Answer:** You're already pulling GIS data successfully! What you need is to:
1. **Map more fields** from county data to form questions
2. **Add more counties** by discovering their APIs with DevTools
3. **Use Gemini smarter** to interpret county codes
4. **Leverage satellite imagery** for visual property features

**The architecture is solid.** The research document validates your approach (ArcGIS API → Scraping fallback → RAG interpretation). Now it's just about expanding coverage and field mappings.

Want me to implement Option C (Gemini-enhanced auto-fill) for you right now?
