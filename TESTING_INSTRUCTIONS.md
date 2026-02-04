# Testing Instructions - Quick Start Guide
**Last Updated:** February 4, 2026

## 🚀 Quick Test Commands

```bash
# 1. Install dependencies (if not already done)
npm install

# 2. Run automated tests
npm test

# 3. Run tests in watch mode (for development)
npm run test:watch

# 4. Generate test coverage report
npm run test:coverage

# 5. Start local development server
npm run dev
# Then open: http://localhost:8000
```

---

## ✅ What's Already Been Validated

### Automated Validation (Completed)
- ✅ All 7 form steps present in HTML (`step-0` through `step-6`)
- ✅ Workflow configurations correct (home/auto/both)
- ✅ stepTitles object properly configured
- ✅ handleType() function correctly wired to radio buttons
- ✅ No syntax errors in code
- ✅ 331 npm packages installed, 0 vulnerabilities
- ✅ All required files present
- ✅ Google Places API graceful degradation implemented
- ✅ Email functionality removed from UI

---

## 🧪 Tests to Run Now

### 1. Run Automated Unit Tests

```bash
npm test
```

**Expected Output:**
```
 PASS  tests/app.test.js
  Data Validation
    ✓ normalizeDate returns correct ISO date
    ✓ DOB rejects future dates
    ✓ State code validation accepts valid codes
    ✓ State code validation rejects invalid codes
  
  LocalStorage Operations
    ✓ saves form data to localStorage
    ✓ loads form data from localStorage
  
  Export Format Validation
    ✓ escapeXML handles special characters
  
  Address Parsing
    ✓ parseAddress extracts street number and name
    ✓ parseAddress handles missing street number
  
  Vehicle Parsing
    ✓ parseVehicleDescription extracts year, make, model

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

---

### 2. Browser Testing - Three Workflows

Open http://localhost:8000 in your browser and test each workflow:

#### **Workflow A: Home Insurance Only**
1. ✅ Load page → Should see Step 0 (Policy Scan)
2. ✅ Click "Skip Scan" → Should advance to Step 1
3. ✅ Fill Step 1: Personal info (name, email, phone, DOB)
4. ✅ Click "Next" → Should see Step 2 (Coverage Type)
5. ✅ Select "HOME INSURANCE" radio button
6. ✅ **VERIFY:** Should auto-advance to Step 3 (Property Details)
7. ✅ Fill Step 3: Property information
8. ✅ Click "Next" → Should advance to Step 5 (Risk Factors)
9. ✅ **VERIFY:** Step 4 (Vehicle) was skipped
10. ✅ Fill Step 5: Risk factors
11. ✅ Click "Next" → Should reach Step 6 (Review & Export)

**Expected Path:** 0 → 1 → 2 → 3 → 5 → 6 (total 6 steps)

---

#### **Workflow B: Auto Insurance Only**
1. ✅ Click "Start New Quote" button
2. ✅ Click "Skip Scan" → Should advance to Step 1
3. ✅ Fill Step 1: Personal info
4. ✅ Click "Next" → Should see Step 2 (Coverage Type)
5. ✅ Select "AUTO INSURANCE" radio button
6. ✅ **VERIFY:** Should auto-advance to Step 4 (Vehicle & Driver)
7. ✅ **VERIFY:** Step 3 (Property) was skipped
8. ✅ Fill Step 4: Vehicle info (VIN, driver's license)
9. ✅ Click "Next" → Should advance to Step 5 (Risk Factors)
10. ✅ Fill Step 5: Risk factors
11. ✅ Click "Next" → Should reach Step 6 (Review & Export)

**Expected Path:** 0 → 1 → 2 → 4 → 5 → 6 (total 6 steps)

---

#### **Workflow C: Bundle (Home + Auto)**
1. ✅ Click "Start New Quote" button
2. ✅ Click "Skip Scan" → Should advance to Step 1
3. ✅ Fill Step 1: Personal info
4. ✅ Click "Next" → Should see Step 2 (Coverage Type)
5. ✅ Select "BOTH (BUNDLE)" radio button
6. ✅ **VERIFY:** Should auto-advance to Step 3 (Property Details)
7. ✅ Fill Step 3: Property information
8. ✅ Click "Next" → Should advance to Step 4 (Vehicle & Driver)
9. ✅ Fill Step 4: Vehicle information
10. ✅ Click "Next" → Should advance to Step 5 (Risk Factors)
11. ✅ Fill Step 5: Risk factors
12. ✅ Click "Next" → Should reach Step 6 (Review & Export)

**Expected Path:** 0 → 1 → 2 → 3 → 4 → 5 → 6 (total 7 steps)

---

### 3. Feature Testing

#### **Policy Scan (AI Extraction)**
⚠️ **Requires:** `GOOGLE_API_KEY` environment variable set

```bash
# Test with sample policy document
1. Step 0: Click "Choose File" or use camera
2. Upload a policy document (PDF or image)
3. Verify: "Processing..." appears
4. Verify: Extracted data populates form fields
5. Check DevTools console for any errors
```

---

#### **Address Autocomplete**
✅ **Works with or without API key**

```bash
# Test with Google Places API (optional)
1. Step 3: Focus on "Street Address" field
2. Type: "123 Main St"
3. If API configured: Dropdown suggestions appear
4. If API not configured: Works as normal text input
5. Verify: Field NEVER locks up or turns grey
```

---

#### **LocalStorage Persistence**
```bash
1. Fill form partially (e.g., Steps 1-3)
2. Open DevTools → Application tab → LocalStorage
3. Find key: "altech_v6"
4. Verify: Contains your form data in JSON format
5. Refresh page (F5)
6. Verify: All fields restore correctly
7. Verify: Form returns to same step
```

---

#### **Quote Library**
```bash
1. Complete any workflow (reach Step 6)
2. Click "Save to Quote Library"
3. Verify: Quote appears in list below
4. Fill new quote with different data
5. Click "Save to Quote Library" again
6. Verify: Second quote appears in list
7. Click "Load" on first quote
8. Verify: Form populates with first quote's data
```

---

#### **Export Functions**
```bash
1. Complete form (any workflow)
2. Step 6: Select a saved quote checkbox
3. Test each export button:

   a) Export CMSMTF:
      - Click button
      - Verify: Downloads "Lead_[LastName].cmsmtf"
      - Open file in text editor
      - Verify: Contains "gen_sFirstName = [value]" format
   
   b) Export XML:
      - Click button  
      - Verify: Downloads "[FirstName]_[LastName].xml"
      - Open in text editor or browser
      - Verify: Valid XML structure with <EZAUTO> root
   
   c) Export PDF:
      - Click button
      - Verify: Downloads "Quote_[LastName].pdf"
      - Open PDF
      - Verify: Contains all form data formatted nicely
   
   d) Export ZIP:
      - Select multiple quotes (check 2-3 boxes)
      - Click "Export Selected as ZIP"
      - Verify: Downloads "Quotes_[Date].zip"
      - Extract ZIP
      - Verify: Contains all 3 file types for each quote
```

---

## 🐛 Known Issues to Watch For

### ❌ Issues That Should Be Fixed:
- ❌ Address field locks up → **FIXED** (graceful degradation)
- ❌ Email button present → **FIXED** (removed from UI)
- ❌ Poor form flow → **FIXED** (restructured to 7 steps)

### ⚠️ Current Limitations (Expected):
- ⚠️ LocalStorage only (data doesn't sync across devices)
- ⚠️ Single driver/vehicle per quote
- ⚠️ No email export (UI removed, backend exists but disabled)
- ⚠️ Policy scan requires GOOGLE_API_KEY

---

## 📊 What to Look For

### ✅ Success Indicators:
- All 7 steps appear in correct order
- Workflows correctly skip steps based on coverage type
- Data persists after page refresh
- All export buttons work and download files
- No console errors (check DevTools → Console tab)
- Forms respond quickly, no freezing
- "Auto-Saved ✓" indicator appears after typing

### ❌ Red Flags (Report These):
- Steps appear out of order
- Form freezes or becomes unresponsive
- Address field turns grey and stops working
- Data lost after page refresh
- Export buttons don't download files
- Console shows JavaScript errors
- Workflow doesn't skip correct steps

---

## 🔍 Debugging Tips

### If Form Doesn't Work:
```bash
# Open DevTools (F12), check Console for errors
# Common issues:

1. "App is not defined" → JavaScript not loaded
2. "fetch failed" → API endpoint not responding
3. "localStorage is null" → Browser privacy settings

# Check Network tab for failed requests
# Check Application tab → LocalStorage for data
```

### If Tests Fail:
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- app.test.js

# Check test output for exact error messages
# Common issues:
# - JSDOM not installed → Run npm install
# - File not found → Check paths in test file
```

---

## 📋 Final Checklist

Before marking testing complete:

- [ ] `npm test` passes with 0 failures
- [ ] Home workflow tested and working (6 steps)
- [ ] Auto workflow tested and working (6 steps)
- [ ] Bundle workflow tested and working (7 steps)
- [ ] Data persists after page refresh
- [ ] All 4 export formats work (CMSMTF, XML, PDF, ZIP)
- [ ] Quote library saves and loads correctly
- [ ] Address field works (with or without Places API)
- [ ] No console errors during testing
- [ ] Policy scan tested (if API key available)

---

## 🚀 After Testing Passes

1. **Commit Changes:**
   ```bash
   git add .
   git commit -m "Restructure form to 7 steps, add tests, fix bugs"
   git push origin main
   ```

2. **Deploy to Vercel:**
   ```bash
   npm run deploy:vercel
   ```

3. **Configure Environment Variables in Vercel Dashboard:**
   - `GOOGLE_API_KEY` (required for policy scan)
   - `GOOGLE_PLACES_API_KEY` (optional for address autocomplete)

4. **Test Production Deployment:**
   - Visit your Vercel URL
   - Run through all 3 workflows
   - Verify APIs work in production

---

## 📞 Need Help?

**Test Results Needed:**
- Did `npm test` pass? (Yes/No)
- Which workflows were tested? (Home/Auto/Both)
- Any errors in console? (Screenshot if possible)
- Did exports download correctly? (Yes/No)

**Common Questions:**
- Q: "npm test fails with module not found" → Run `npm install` first
- Q: "Policy scan doesn't work" → Check if GOOGLE_API_KEY is set
- Q: "Address field has no suggestions" → Expected if GOOGLE_PLACES_API_KEY not set
- Q: "Can't find email button" → Correct! It was removed

---

*Testing Guide Generated: February 4, 2026*
*For Altech Insurance Lead Capture v1.0*
