# 🚀 Complete Feature Testing Guide

## How to Test Everything

### Step 1: Setup
1. Open app in browser: `http://localhost:8000`
2. Open DevTools console: Press `F12` → click "Console" tab
3. Copy entire contents of `/workspaces/Altech/test-suite.js`
4. Paste into console and press Enter
5. Look at the results (should see ✅ and ❌ marks)

### Step 2: Manual Testing Walkthrough

#### ✅ Test: Basic Navigation
```
Expected: 
- You should be on Step 0 (Policy Scan) initially
- Click "Next" → Step 1 (Personal Info)
- Click "Next" → Step 2 (Coverage Type)
- Click "Back" → Step 1 again
- Progress bar at top should change

If fails: Step elements not rendering, navigation broken
```

#### ✅ Test: Data Persistence
```
1. On Step 1, fill in:
   - First Name: "John"
   - Last Name: "Doe"
   - Email: "john@example.com"

2. Click Next (to advance)

3. Click Back (to return)

4. Check: firstName, lastName, email should still be filled

In DevTools Console:
localStorage.getItem('altech_v6')

Should show:
{"firstName":"John","lastName":"Doe","email":"john@example.com",...}

If fails: Form data not saving to localStorage, save/load broken
```

#### ✅ Test: Coverage Type Workflow
```
1. Step 2: Select "HOME"
2. Click Next → Should skip to Step 3 (Property Details)
3. Step 5 should have property-specific options
4. Go back, change to "AUTO" 
5. Should now skip property, go to Step 4 (Vehicle/Driver)
6. Change to "BOTH"
7. Should show ALL steps

If fails: Workflow selection not working, step visibility broken
```

#### ✅ Test: Address Field
```
1. Step 3: Enter "123 Main St, Vancouver, WA 98685"
2. Should autocomplete OR work as plain text
3. Try filling addresses in format: "street"
4. Click "Zillow" or "Maps" buttons (should open external links)

If fails: Address field locked up, Google Places API issue
```

#### ✅ Test: Map Previews
```
1. Step 3: Enter address
2. Scroll down to "Property Views" section
3. Should see "Street View" and "Satellite View" images loading
4. Click buttons under each to open Maps/Earth

If fails: Google Maps Static API not configured OR address parsing broken
```

#### ✅ Test: Form Validation
```
1. Go to Step 6 (Export)
2. Try to export XML **without** filling required fields:
   - firstName
   - lastName
   - state (addrState)
   - DOB (dob)

Should see: Alert ⚠️ "First and last name are required"

Then fill those fields and try again - export should work.

If fails: Validation not preventing invalid exports
```

#### ✅ Test: XML Export
```
1. Fill all required fields (firstName, lastName, state, dob)
2. Step 6: Click "Download EZLynx XML File"
3. File should download as "Quote_Doe.xml"
4. Open in text editor (not browser!)
5. Check:
   - Valid XML syntax (no bare "&" characters)
   - Namespace: xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200"
   - Contains your name inside <FirstName> tags

If fails: XML export broken, escaping not working
```

#### ✅ Test: PDF Export
```
1. Step 6: Click "Download PDF Summary"
2. Should download as "Quote_Doe.pdf"
3. Open PDF - should show formatted form data

If fails: PDF generation not working (jsPDF issue)
```

#### ✅ Test: Quote Library
```
1. Fill out form partially or completely
2. Step 6: Click "Save Draft" (in "More Options" section)
3. Enter name: "Test Quote 1"
4. Should appear in quote list below
5. Click Load → should populate form with saved data
6. Click Delete → should remove from list
7. Click "Download ZIP (Selected)" → should create ZIP with exports

If fails: LocalStorage quote library broken
```

#### ✅ Test: Dynamic Field Visibility
```
1. Step 1: Enter yrBuilt = "1950" (old house)
2. Should show "System Updates" card with additional fields
3. Change yrBuilt to "2020" (new house)
4. Card should disappear

If fails: Dynamic field visibility not working
```

#### ✅ Test: Add Driver/Vehicle (if Auto selected)
```
1. Step 2: Select "AUTO" or "BOTH"
2. Step 4: Click "Add Driver"
3. Should show driver form with: dlNum, dlState
4. Click "Add Vehicle"
5. Should show vehicle form with: VIN, vehDesc
6. Try entering a valid VIN (17 chars) → should decode
7. Try removing with X button

If fails: Driver/vehicle form management broken
```

---

## Quick Status Check (60 seconds)

Run this in console:
```javascript
// Copy entire test-suite.js contents, paste into console
```

Should show:
- ✅ 20+ tests passed
- ❌ Any failures listed

---

## If Things are Broken

### Common Issues & Fixes

**Problem: Can't navigate (Next/Back buttons don't work)**
- Check: Is `App.next()` throwing an error in console?
- Check: Are step elements (step-0, step-1, etc.) in the HTML?
- Fix: Reload page, clear localStorage, try again

**Problem: Data disappears after reload**
- Check: Is localStorage enabled? (Settings → Privacy → Allow local storage)
- Check: Is app trying to save? (Should see "✓ Saved" toast)
- Fix: Make sure you're not in Private/Incognito mode

**Problem: Exports don't download**
- Check: Browser console for errors
- Check: Are JSZip and jsPDF libraries loaded?
- Check: Pop-up blockers enabled?
- Fix: Disable popup blocker for localhost

**Problem: Address field doesn't autocomplete**
- Check: Is `GOOGLE_PLACES_API_KEY` set? (Optional - field still works without it)
- Check: Are you seeing console warnings about Places API?
- Fix: This is OK - form still works as plain text field

**Problem: XML export shows empty values**
- Check: Did you fill in the fields?
- Check: Are required fields filled? (firstName, lastName, state, dob)
- Check: Does XML have the correct namespace?
- Fix: Run validation, fill all required fields

---

## Getting Help

When reporting issues, include:
1. **Which step** is broken
2. **What you tried** to do
3. **What happened** (error message, nothing happened, etc.)
4. **Browser console errors** (F12 → Console → take screenshot)
5. **Screenshots** if helpful

---

**Let me know which features are broken and I'll fix them!** 🔧
