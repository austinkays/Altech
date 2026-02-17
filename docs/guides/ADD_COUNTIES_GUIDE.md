# Adding More Counties to GIS Auto-Fill (Option B)

**Created:** February 5, 2026
**Difficulty:** Medium (15-30 minutes per county)
**Required:** Basic browser DevTools knowledge

---

## Quick Reference

**Currently Supported:** Clark WA, King WA, Pierce WA, Multnomah OR
**Next Priority:** Snohomish WA, Thurston WA, Spokane WA, Clackamas OR

---

## Step-by-Step Process

### Step 1: Find the County's GIS Site (5 minutes)

**Google Search Pattern:**
```
"[County Name] GIS property search"
"[County Name] parcel viewer"
"[County Name] property appraiser"
```

**Examples:**
- Snoh

omish County: `https://gis.snoco.org/maps/property-information`
- Thurston County: `https://apps.thurston.wa.gov/propertysearch/`
- Spokane County: `https://cp.spokanecounty.org/scout/`

**What to Look For:**
- Interactive map with parcel boundaries
- Property search by address
- Assessor/tax information display

---

### Step 2: Use DevTools to Find the API (10 minutes)

This is the **key technique** from your research document (lines 37-39).

**Instructions:**

1. **Open the county GIS site** in Chrome/Edge
2. **Open DevTools:** Press `F12` or right-click → Inspect
3. **Go to Network tab** in DevTools
4. **Clear existing traffic:** Click the "Clear" button (🚫 icon)
5. **Trigger a data request:**
   - Search for a property by address, OR
   - Click on a parcel on the map, OR
   - Toggle a map layer (parcels, flood zones, zoning)
6. **Watch the Network tab** for new requests
7. **Look for these patterns:**
   - URLs containing `/arcgis/rest/services/`
   - URLs containing `/MapServer/` or `/FeatureServer/`
   - Requests returning JSON data (not HTML)
   - Response size 1-50 KB (parcel data)

**Screenshot Example:**
```
Name: query?where=...&f=json
Type: xhr
Size: 12.3 KB
Domain: gis.snoco.org
Status: 200
```

8. **Right-click the request → Copy → Copy URL**

**Example URLs Found:**
```
Clark County:
https://arcgis.clark.wa.gov/arcgis/rest/services/Assessor/Parcels/MapServer/0/query

King County:
https://gis.kingcounty.gov/arcgis/rest/services/iMap_external/Parcels/MapServer/0/query

Snohomish (NEW):
https://gis.snoco.org/arcgis/rest/services/Landbase/Parcels/MapServer/0/query
```

---

### Step 3: Test the API Endpoint (5 minutes)

**Open the URL in a new tab** and look for:

✅ **Good signs:**
- JSON response with property data
- Fields like `PARCEL_ID`, `YEAR_BUILT`, `OWNER_NAME`, `SQFT`, etc.
- Service description if you remove `/query` from URL
- No authentication required (or simple token in URL)

❌ **Bad signs:**
- HTML login page
- 403 Forbidden error
- CAPTCHA challenge
- Requires POST request with complex auth

**Testing Query:**

If the API works, you can test a specific parcel by modifying the URL:

```
Original URL:
https://gis.snoco.org/arcgis/rest/services/Landbase/Parcels/MapServer/0/query?where=1=1&f=json

Test with address (use geocode lat/lng):
https://gis.snoco.org/arcgis/rest/services/Landbase/Parcels/MapServer/0/query?
  geometry={"x":-122.2025,"y":47.9073,"spatialReference":{"wkid":4326}}
  &geometryType=esriGeometryPoint
  &spatialRel=esriSpatialRelIntersects
  &outFields=*
  &f=json
```

**Tip:** Use the "Pretty Print" browser extension to read JSON responses easily.

---

### Step 4: Identify Field Names (10 minutes)

Look at the JSON response and find these critical fields:

| Data Needed | Common Field Names | Example Values |
|-------------|-------------------|----------------|
| Parcel ID | `PARCEL_ID`, `PARCEL_NUMBER`, `ACCOUNT_NUMBER`, `APN` | "123456789" |
| Year Built | `YEAR_BUILT`, `YR_BUILT`, `YRBUILT` | 1985 |
| Square Feet | `SQFT`, `TOTAL_SQFT`, `LIVING_AREA`, `BLDG_SQFT` | 1850 |
| Stories | `STORIES`, `NUM_STORIES`, `STORY_HEIGHT` | 2 |
| Lot Size | `LOT_SIZE`, `ACREAGE`, `ACRES` | 0.25 |
| Bedrooms | `BEDROOMS`, `BEDS`, `NUM_BEDS` | 3 |
| Bathrooms | `BATHROOMS`, `BATHS`, `BATH_TOTAL` | 2.5 |
| Garage | `GARAGE_SQFT`, `GARAGE_SPACES`, `GARAGE_TYPE` | 400 or "Attached" |
| Foundation | `FOUNDATION`, `FOUNDATION_TYPE`, `BSMT_TYPE` | "Basement" |
| Roof | `ROOF_TYPE`, `ROOF_MATERIAL`, `ROOF_COVER` | "ASPH" or "Composition" |
| Heating | `HEATING`, `HEAT_FUEL`, `HEATING_TYPE` | "FRC" or "Forced Air" |

**Pro Tip:** Counties use different codes. That's why we enhanced Gemini (Option C) to interpret them!

---

### Step 5: Add to Configuration File (5 minutes)

**File:** `/workspaces/Altech/api/arcgis-consumer.js`
**Location:** Lines 22-51 (`COUNTY_ARCGIS_CONFIG` object)

**Template:**

```javascript
'[CountyName]': {
  state: '[STATE]',
  baseUrl: 'https://[COUNTY_GIS_URL]/arcgis/rest/services/[PATH]/MapServer',
  queryService: 0,  // Usually 0, sometimes 1 or 2
  fields: [
    'OBJECTID',
    'PARCEL_NUMBER',  // ← Use actual field names from Step 4
    'YEAR_BUILT',
    'SQFT',
    'BEDROOMS',
    'BATHROOMS',
    'GARAGE_SQFT',
    'STORIES',
    'ROOF_TYPE',
    'FOUNDATION',
    'HEATING_TYPE'
    // Add all available fields
  ],
  searchField: 'PARCEL_NUMBER'  // Primary identifier field
}
```

**Real Example (Snohomish County):**

```javascript
'Snohomish': {
  state: 'WA',
  baseUrl: 'https://gis.snoco.org/arcgis/rest/services/Landbase/Parcels/MapServer',
  queryService: 0,
  fields: [
    'OBJECTID',
    'PARCEL_ID',
    'OWNER_NAME',
    'SITE_ADDR',
    'YEAR_BUILT',
    'BLDG_SQFT',
    'BEDROOMS',
    'BATHS',
    'GARAGE',
    'STORIES',
    'ROOF_TYPE',
    'FOUNDATION'
  ],
  searchField: 'PARCEL_ID'
}
```

**Add after line 50** in `/api/arcgis-consumer.js`.

---

### Step 6: Update County Detection (2 minutes)

**File:** `/workspaces/Altech/index.html`
**Function:** `getCountyFromCity()` (around line 5100-5150)

**Add your county mapping:**

```javascript
getCountyFromCity(city, state) {
    city = (city || '').toLowerCase().trim();
    state = (state || '').toUpperCase().trim();

    if (state === 'WA') {
        // Existing counties
        if (city.includes('vancouver') || city.includes('camas')) return 'Clark';
        if (city.includes('seattle') || city.includes('bellevue')) return 'King';
        if (city.includes('tacoma') || city.includes('lakewood')) return 'Pierce';

        // NEW COUNTY:
        if (city.includes('everett') || city.includes('lynnwood') ||
            city.includes('marysville') || city.includes('edmonds')) {
            return 'Snohomish';
        }

        if (city.includes('olympia') || city.includes('lacey') ||
            city.includes('tumwater')) {
            return 'Thurston';
        }

        if (city.includes('spokane')) {
            return 'Spokane';
        }
    }

    if (state === 'OR') {
        if (city.includes('portland') && !city.includes('clackamas')) return 'Multnomah';

        // NEW COUNTY:
        if (city.includes('oregon city') || city.includes('west linn') ||
            city.includes('lake oswego') || city.includes('milwaukie')) {
            return 'Clackamas';
        }
    }

    return null;  // County not supported
}
```

**Test Cities for Each County:**

| County | Test Cities |
|--------|-------------|
| Snohomish WA | Everett, Lynnwood, Marysville, Edmonds, Mukilteo |
| Thurston WA | Olympia, Lacey, Tumwater |
| Spokane WA | Spokane, Spokane Valley |
| Clackamas OR | Oregon City, West Linn, Lake Oswego, Milwaukie |

---

### Step 7: Test the Integration (5 minutes)

1. **Open your app** in browser
2. **Go to Step 3** (Property Details)
3. **Enter a test address** in the new county:
   ```
   Street: 123 Main St
   City: Everett
   State: WA
   Zip: 98201
   ```
4. **Click 🪄 Smart Fill** button
5. **Watch browser console** for:
   - ✅ "Querying official county records..."
   - ✅ Phase 1 success with parcel data
   - ✅ Phase 3 RAG interpretation
   - ✅ Popup appears with property data

**If it fails:**
- Check browser console for specific error
- Verify API URL is correct
- Test API endpoint directly in browser
- Check field names match exactly

---

## Common Issues & Solutions

### Issue: "County not configured for API access"

**Cause:** County name not in `COUNTY_ARCGIS_CONFIG`
**Solution:** Add county to config file (Step 5)

---

### Issue: "No parcel found at location"

**Causes:**
1. Geocoding failed (address not found by Google)
2. Lat/lng doesn't intersect any parcel
3. Wrong `queryService` layer index

**Solutions:**
1. Test address in Google Maps first
2. Verify parcel exists in county GIS site
3. Try `queryService: 1` or `2` instead of `0`
4. Check if API uses different geometry type

---

### Issue: "HTTP 403 Forbidden"

**Cause:** County requires authentication or IP whitelist
**Solution:** Look for public API key instructions on county site, or use Phase 2 (headless browser fallback)

---

### Issue: "Fields return null or undefined"

**Cause:** Field names don't match county's actual field names
**Solution:**
1. Check JSON response for exact field names (case-sensitive!)
2. Update `fields` array in config
3. County may use `null` for missing data

---

### Issue: "Data shows but doesn't auto-fill form"

**Cause:** Field IDs in `applyParcelData()` don't match form
**Solution:**
1. Check HTML for field IDs (e.g., `<input id="yrBuilt">`)
2. Verify field IDs in `applyParcelData()` function
3. Check browser console for errors

---

## Priority Counties to Add

### Washington State:
1. **Snohomish** - Everett, Lynnwood (high population)
2. **Thurston** - Olympia, Lacey (state capital)
3. **Spokane** - Spokane, Spokane Valley (eastern WA)
4. **Whatcom** - Bellingham (northern border)
5. **Yakima** - Yakima, Selah (central WA)

### Oregon:
1. **Clackamas** - Portland suburbs
2. **Washington** - Beaverton, Hillsboro
3. **Lane** - Eugene, Springfield
4. **Marion** - Salem (state capital)
5. **Deschutes** - Bend (growing market)

### Expansion States:
1. **California** - Start with San Diego, LA, Bay Area counties
2. **Arizona** - Maricopa (Phoenix), Pima (Tucson)
3. **Idaho** - Ada (Boise), Kootenai (Coeur d'Alene)
4. **Nevada** - Clark (Las Vegas), Washoe (Reno)

---

## Advanced: ArcGIS REST API Tips

### Finding the Service Layer Index

Some counties have multiple layers in one service:
- Layer 0: Parcels
- Layer 1: Buildings
- Layer 2: Zoning

**How to find the right layer:**

1. Visit base URL without `/query`:
   ```
   https://gis.snoco.org/arcgis/rest/services/Landbase/Parcels/MapServer
   ```
2. Look for "Layers:" section
3. Click each layer number to see fields
4. Use the layer with parcel/property data

### Handling Token-Based Authentication

If the API requires a token (shows in URL as `?token=abc123`):

**Option 1: Public Token**
- Check if county offers public API access
- Register for developer key
- Add to `.env` as `COUNTY_API_KEY_[COUNTYNAME]`

**Option 2: Session Token**
- Extract from Network tab during normal use
- Valid for limited time (hours/days)
- Not reliable for production

**Option 3: Fall back to Phase 2**
- Let headless browser handle authentication
- Slower but more reliable

---

## Testing Checklist

After adding a new county:

- [ ] API endpoint responds with JSON
- [ ] Parcel data includes year built, sqft, stories
- [ ] Test with 3+ different addresses in that county
- [ ] Popup displays all available fields correctly
- [ ] Auto-fill applies data to form fields
- [ ] Gemini interprets county codes correctly (Phase 3)
- [ ] Error handling works for invalid addresses
- [ ] Performance is <2 seconds for Phase 1

---

## Documentation Template

When you add a county, document it:

```markdown
### [County Name], [State]

**Added:** [Date]
**Status:** ✅ Working
**Coverage:** [List major cities]

**API Details:**
- Base URL: `https://...`
- Service Layer: 0
- Available Fields: [list]
- Special Notes: [any quirks]

**Test Address:**
```
123 Example St
City Name, ST 12345
```

**Known Limitations:**
- Missing bedrooms/bathrooms data
- Roof type uses numeric codes (1=asphalt, 2=metal, etc.)
```

---

## Next Steps

1. **Start with Snohomish County** (easiest, similar to King)
2. **Add 2-3 counties per session** (don't overwhelm)
3. **Test thoroughly** before moving to next county
4. **Document quirks** for future reference

---

## Getting Help

If you get stuck:

1. **Check sample APIs** in existing config for patterns
2. **Test endpoint manually** in browser/Postman
3. **Look for county API documentation** (rare but helpful)
4. **Ask Gemini** to help interpret unusual response formats

---

## Success Criteria

You've successfully added a county when:

✅ User enters address in that county
✅ Click "Smart Fill" → Shows "Querying official county records"
✅ Popup appears with 10+ property fields
✅ Click "Use This Data" → Auto-fills form
✅ Exported data includes county information

**You're done!** Repeat for next county.

---

**Author:** Claude Code
**Based On:** "The Algorithmic Shield" research document (lines 36-39)
**Tested With:** Clark, King, Pierce, Multnomah counties
