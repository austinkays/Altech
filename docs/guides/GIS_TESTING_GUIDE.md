# GIS Auto-Fill Testing Guide

**Created:** February 5, 2026
**Purpose:** Verify hybrid GIS system works with real addresses
**Test Addresses:** 30 properties across WA, OR, AZ

---

## Test File

**Location:** `/workspaces/Altech/test-addresses.csv`
**Contains:** 30 real addresses with expected data sources

---

## How to Test

### Method 1: Manual Testing in Your App

**Steps:**
1. Open your deployed app (or run locally)
2. Navigate to **Step 3: Property Details**
3. For each test address:
   - Enter Street Address
   - Enter City
   - Select State
   - Enter Zip Code
4. Click **🪄 Smart Fill** button
5. Wait for popup with property data
6. Verify results (see checklist below)

---

### Method 2: Automated Testing Script

Create a test script to batch test all addresses:

```html
<!-- Add this to index.html or create separate test.html -->
<script>
async function testGISAddresses() {
    const testAddresses = [
        { state: 'WA', address: '2202 NE 154th Ave', city: 'Vancouver', zip: '98684', county: 'Clark', expectedSource: 'Individual' },
        { state: 'WA', address: '529 W 25th St', city: 'Vancouver', zip: '98660', county: 'Clark', expectedSource: 'Individual' },
        // ... add all 30 addresses
    ];

    const results = [];

    for (const addr of testAddresses) {
        try {
            const fullAddress = `${addr.address}, ${addr.city}, ${addr.state} ${addr.zip}`;
            console.log(`Testing: ${fullAddress}`);

            // Call your GIS API
            const response = await fetch(`/api/arcgis-consumer?address=${encodeURIComponent(addr.address)}&city=${addr.city}&state=${addr.state}&county=${addr.county}`);
            const data = await response.json();

            results.push({
                address: fullAddress,
                county: addr.county,
                success: data.success,
                source: data.source || 'Individual County API',
                parcelId: data.parcelData?.parcelId || 'N/A',
                yearBuilt: data.parcelData?.yearBuilt || 0,
                totalSqft: data.parcelData?.totalSqft || 0,
                bedrooms: data.parcelData?.bedrooms || 0,
                bathrooms: data.parcelData?.bathrooms || 0,
                expectedSource: addr.expectedSource,
                match: data.success ? '✅' : '❌'
            });

            // Add delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            results.push({
                address: `${addr.address}, ${addr.city}`,
                county: addr.county,
                success: false,
                error: error.message,
                match: '❌'
            });
        }
    }

    // Log results
    console.table(results);

    // Calculate success rate
    const successCount = results.filter(r => r.success).length;
    const successRate = (successCount / results.length * 100).toFixed(1);

    console.log(`\n📊 Test Results:`);
    console.log(`Total Addresses: ${results.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${results.length - successCount}`);
    console.log(`Success Rate: ${successRate}%`);

    return results;
}

// Run tests
testGISAddresses().then(results => {
    // Export results to JSON
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gis-test-results.json';
    a.click();
});
</script>
```

---

## Verification Checklist

For each address, verify:

### ✅ Basic Functionality
- [ ] Address geocodes successfully (lat/lng returned)
- [ ] Parcel found at location
- [ ] No HTTP errors (403, 500, etc.)
- [ ] Response time < 5 seconds

### ✅ Data Quality
- [ ] Parcel ID returned (not "N/A")
- [ ] Year Built > 1800 (if available)
- [ ] Total Sqft > 0 (if available)
- [ ] County name correct

### ✅ Source Attribution
- [ ] **Clark County (WA)**: Should use "Individual County API"
- [ ] **Multnomah County (OR)**: Should use "Individual County API"
- [ ] **Maricopa County (AZ)**: Should use "Arizona Counties (State Aggregator)"

### ✅ Rich Data (Individual Counties Only)
- [ ] **Clark County**: Garage Type available
- [ ] **Multnomah County**: Stories available
- [ ] **Snohomish County** (if tested): Bedrooms, Bathrooms, Foundation, Roof Type available

### ✅ RAG Interpretation (Phase 3)
- [ ] County codes translated (e.g., "COMP" → "Asphalt Shingle")
- [ ] Values match form dropdown options
- [ ] interpretation_notes field populated

---

## Expected Results by County

### Clark County, WA (10 addresses)
**API:** `https://arcgis.clark.wa.gov/arcgis/rest/services/Assessor/Parcels/MapServer`
**Data Source:** Individual County API
**Rich Data:** Garage Type, Basement Area, Main Floor Area
**Expected Fields:**
- ✅ Parcel ID
- ✅ Year Built
- ✅ Total Sqft
- ✅ Lot Size (acres)
- ✅ Garage Type
- ⚠️ Bedrooms: Not available
- ⚠️ Bathrooms: Not available

### Multnomah County, OR (10 addresses)
**API:** `https://ggis.multco.us/arcgis/rest/services/public/Assessor/MapServer`
**Data Source:** Individual County API
**Rich Data:** Stories, Total Living Area
**Expected Fields:**
- ✅ Parcel ID (Account Number)
- ✅ Year Built
- ✅ Total Living Area (sqft)
- ✅ Lot Size (acres)
- ✅ Stories
- ⚠️ Bedrooms: Not available
- ⚠️ Bathrooms: Not available

### Maricopa County, AZ (10 addresses)
**API:** `https://azgeo.az.gov/arcgis/rest/services/asld/Counties/MapServer`
**Data Source:** Arizona Counties (State Aggregator)
**Expected Fields:**
- ✅ Parcel ID (may be limited)
- ⚠️ Year Built: May not be available from state aggregator
- ⚠️ Total Sqft: May not be available
- ⚠️ Bedrooms: Not available
- ⚠️ Bathrooms: Not available

**Note:** State aggregators have less detailed data. If Arizona results are sparse, consider adding Maricopa County individual API later.

---

## Common Issues & Solutions

### Issue: "County not configured for API access"
**Cause:** County name not mapped correctly
**Solution:** Check `getCountyFromCity()` function in index.html
**Fix:** Add city-to-county mapping

### Issue: "No parcel found at location"
**Causes:**
1. Geocoding returned wrong coordinates
2. Parcel boundaries don't match exact address point
3. Rural area with large parcels

**Solutions:**
1. Verify address in Google Maps
2. Check county GIS portal manually
3. Try Phase 2 (headless browser fallback)

### Issue: "HTTP 403 Forbidden"
**Cause:** County API requires authentication or blocks automated requests
**Solution:** Use Phase 2 fallback or find alternative API endpoint

### Issue: Missing detailed data (bedrooms, bathrooms)
**Cause:** State aggregators have limited fields
**Solution:** This is expected. Rich data only available from individual county APIs (Snohomish, Pierce)

### Issue: County codes not interpreted (e.g., "COMP" instead of "Asphalt Shingle")
**Cause:** Phase 3 RAG interpreter not running
**Solution:** Check Gemini API key in environment variables

---

## Manual Verification

For spot-checking, use these county GIS portals:

### Clark County, WA
**URL:** https://gisapps.clark.wa.gov/applications/propertyinformation/
**How to Use:**
1. Enter address
2. Click parcel on map
3. Compare Parcel ID, Year Built, Sqft with your app

### Multnomah County, OR
**URL:** https://multco.us/assessment-taxation/search-property-information
**How to Use:**
1. Search by address
2. View property details
3. Compare Account Number, Year Built, Living Area

### Maricopa County, AZ
**URL:** https://mcassessor.maricopa.gov/
**How to Use:**
1. Search by address
2. View parcel details
3. Note: State aggregator may have less detail than county assessor site

---

## Success Criteria

**Minimum Acceptable:**
- 80% of addresses return data successfully
- All Clark County addresses use Individual API
- All Multnomah County addresses use Individual API
- All Maricopa County addresses use State Aggregator

**Excellent:**
- 90%+ success rate
- Rich data (bedrooms, bathrooms) from Snohomish County
- RAG interpreter correctly maps all county codes
- Response times < 3 seconds

---

## Test Results Template

```
📊 GIS Auto-Fill Test Results
Date: [DATE]
Tested By: [NAME]

Washington State (Clark County):
- Total Addresses: 10
- Successful: __/10
- Data Source: Individual County API
- Average Fields Returned: __
- Notes: ___________

Oregon (Multnomah County):
- Total Addresses: 10
- Successful: __/10
- Data Source: Individual County API
- Average Fields Returned: __
- Notes: ___________

Arizona (Maricopa County):
- Total Addresses: 10
- Successful: __/10
- Data Source: State Aggregator
- Average Fields Returned: __
- Notes: ___________

Overall Success Rate: __%
Average Response Time: __ seconds
Issues Encountered: ___________
```

---

## Next Steps After Testing

**If Success Rate > 90%:**
- ✅ System is production-ready
- Add California state aggregator next
- Consider adding more individual county APIs for rich data

**If Success Rate 70-90%:**
- Investigate failed addresses
- Check for rate limiting issues
- Verify geocoding accuracy

**If Success Rate < 70%:**
- Review API endpoint configurations
- Check for authentication requirements
- Consider Phase 2 (headless browser) for problematic counties

---

## Additional Test Scenarios

### Test 1: State Aggregator Fallback (Thurston County, WA)
```
Address: 1456 Capitol Way, Olympia, WA 98501
County: Thurston (not individually configured)
Expected: Falls back to Washington State Parcels aggregator
```

### Test 2: Individual API Priority (Snohomish County, WA)
```
Address: 2901 Oakes Ave, Everett, WA 98201
County: Snohomish (individually configured)
Expected: Uses Snohomish individual API with bedrooms/bathrooms
```

### Test 3: State Aggregator Only (Clackamas County, OR)
```
Address: 320 Warner Milne Rd, Oregon City, OR 97045
County: Clackamas (not individually configured)
Expected: Uses Oregon ORMAP Tax Lots aggregator
```

---

**Questions or Issues?**

If you encounter problems during testing:
1. Check browser console for error messages
2. Verify API keys are set in environment variables
3. Test API endpoints directly in browser/Postman
4. Review commit logs for recent changes

**Happy Testing!** 🚀
