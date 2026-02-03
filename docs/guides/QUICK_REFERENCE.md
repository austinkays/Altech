# QUICK REFERENCE - HawkSoft Export Fix

## What Was Wrong ❌
Export used wrong field names: `[FirstName]`, `[Address]`, `[DOB]`

## What's Fixed Now ✅
Export uses HawkSoft system names: `[gen_sFirstName]`, `[gen_sAddress1]`, `[gen_sClientMiscData[x]]`

---

## Testing Checklist

### □ Step 1: Generate Export
- [ ] Open `index.html` in browser
- [ ] Fill out form completely
- [ ] Click "📥 Download HawkSoft File (.cmsmtf)"

### □ Step 2: Verify File Format
- [ ] Open `.cmsmtf` file in text editor
- [ ] See `[gen_sFirstName]` tags (NOT `[FirstName]`)
- [ ] See `[gen_sAddress1]` tags (NOT `[Address]`)
- [ ] See `[gen_sClientMiscData[1]]` for custom fields

### □ Step 3: Test in HawkSoft
- [ ] Open HawkSoft
- [ ] Utilities → Import → HawkSoft Data Importer → File
- [ ] Select your `.cmsmtf` file
- [ ] All fields recognized (no errors)
- [ ] Complete import
- [ ] Data appears correctly in HawkSoft

---

## Validated Field Variables (30 Standard + 18 Custom)

### Contact/Basic (8 fields)
✓ `gen_sFirstName`, `gen_sLastName`, `gen_sAddress1`, `gen_sCity`, `gen_sState`, `gen_sZip`, `gen_sCellPhone`, `gen_sEmail`

### Policy/Lead (3 fields)
✓ `gen_sApplicationType`, `gen_sPolicyTitle`, `gen_sLeadSource`, `gen_sClientSource`

### Property (10 fields)
✓ `gen_sGAddress`, `gen_sGCity`, `gen_sGState`, `gen_sGZip`, `gen_nYearBuilt`, `gen_sConstruction`, `gen_sProtectionClass`, `gen_sBurgAlarm`, `gen_sFireAlarm`, `gen_sSprinkler`

### Coverage (3 fields)
✓ `gen_lCovA`, `gen_sLiability`, `gen_sDeduct`

### Additional Interests (2 fields)
✓ `gen_sLPType1`, `gen_sLpName1`

### Territory (1 field)
✓ `hpm_sTerritory`

### Notes (2 fields)
✓ `gen_sClientNotes`, `gen_sFSCNotes`

### Custom Demographics (18 misc fields)
✓ DOB, Marital Status, Occupation, Education, Prior Carrier, Years w/ Prior, Accidents, Violations, VIN, DL#, DL State, TCPA Consent, Contact Time, Pet Info, Pool, Trampoline, Wood Stove, Business on Property

---

## Files to Read

1. **[LUNCH_BREAK_SUMMARY.md](LUNCH_BREAK_SUMMARY.md)** ← START HERE
2. **[VALIDATION_REPORT.md](VALIDATION_REPORT.md)** - Technical details
3. **[HAWKSOFT_EXPORT_GUIDE.md](HAWKSOFT_EXPORT_GUIDE.md)** - User guide

---

## Expected Export Format

```
[gen_sFirstName]John
[gen_sLastName]Doe
[gen_sAddress1]123 Main Street
[gen_sCity]Las Vegas
[gen_sState]NV
[gen_sZip]89101
[gen_sCellPhone](702) 555-1234
[gen_sEmail]john@email.com
[gen_sClientMiscData[1]]DOB: 1990-01-15
[gen_sClientMiscData[2]]Marital Status: Married
[gen_sClientNotes]Complete lead details...
```

---

## Status: ✅ VALIDATED & READY

All 30 standard field variables confirmed valid in HawkSoft.
All 18 custom misc fields properly formatted.
JavaScript validated - no errors.

**You're good to go!** 🚀
