# IMMEDIATE TESTING GUIDE

## The Issue Was THE FORMAT!

I was using `[variable]value` but HawkSoft needs `variable = value`

**This is now FIXED!**

---

## Quick Test (2 minutes)

### Step 1: Generate Export
1. Open `index.html` in your browser
2. Fill out at least these fields:
   - First Name: John
   - Last Name: Doe
   - Phone: (702) 555-1234
   - Email: john@test.com
   - Address: 123 Main St
   - City: Las Vegas
   - State: NV
   - Zip: 89101
3. Go to Step 4
4. Click "📥 Download HawkSoft File (.cmsmtf)"

### Step 2: Verify File Format
Open the downloaded `.cmsmtf` file in Notepad/TextEdit.

**Should see THIS (CORRECT):**
```
gen_sCustType = Personal
gen_sFirstName = John
gen_sLastName = Doe
gen_sAddress1 = 123 Main St
gen_sCity = Las Vegas
gen_sState = NV
gen_sZip = 89101
```

**Should NOT see this (WRONG):**
```
[gen_sFirstName]John
[gen_sLastName]Doe
```

### Step 3: Import to HawkSoft
1. Open HawkSoft
2. Go to **Utilities → Import → HawkSoft Data Importer → File**
3. Select your `.cmsmtf` file
4. **HawkSoft should now recognize and import the data!**

---

## What Changed

| Before (Wrong) | After (Correct) |
|----------------|-----------------|
| `[gen_sFirstName]John` | `gen_sFirstName = John` |
| `[gen_sCity]Las Vegas` | `gen_sCity = Las Vegas` |
| `gen_sClientMiscData[1]` | `gen_sClientMiscData[0]` (0-indexed) |

---

## If It Still Doesn't Work

1. **Check the file** - open it and make sure you see `=` signs
2. **Copy a sample line** from the file and paste it here - I'll verify it
3. **Check HawkSoft version** - make sure you're using HawkSoft 6+
4. **Check import method** - use "File" import, not "Web Service"

---

## Expected Result

✅ File downloads as `Lead_Doe.cmsmtf`  
✅ File contains lines like `gen_sFirstName = John`  
✅ HawkSoft recognizes all fields  
✅ Data imports successfully  

---

**The fix is deployed - try it now!**
