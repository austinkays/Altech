# HawkSoft CMSMTF Field Audit - COMPLETE ✅

## Critical Issues Found & Fixed

### Problem
We were using **many field names that don't exist in HawkSoft's CMSMTF format**. These non-existent fields were:
- `hpm_lSqFootage`
- `hpm_sRoofType`
- `hpm_nRoofUpdateYear`
- `hpm_sHeating`
- `hpm_nHeatingUpdateYear`
- `hpm_nElectricalUpdateYear`
- `hpm_nPlumbingUpdateYear`
- `hpm_sFoundation`
- `hpm_sExteriorWalls`
- `hpm_sNumStories`
- `hpm_sNumBathrooms`
- `hpm_nDistToFireStation`
- `hpm_nDistToHydrant`
- `hpm_dPurchaseDate`
- `hpm_sTerritory` (for auto - doesn't exist)
- `gen_sDeduct` (correct is `gen_sDecuct` - yes, HawkSoft has a typo!)

### Solution
**All property detail fields now go into `gen_sClientMiscData[]` custom fields** where they belong.

## Verified Field Mappings (From Official HawkSoft Samples)

### ✅ Client Information (CORRECT)
```
gen_sCustType = Personal
gen_sFirstName = John
gen_sLastName = Doe
gen_sAddress1 = 123 Main St
gen_sCity = Las Vegas
gen_sState = NV
gen_sZip = 89101
gen_sPhone = (702) 555-1234
gen_sCellPhone = (702) 555-1234
gen_sEmail = john@example.com
gen_sClientSource = Website
```

### ✅ Policy Information (CORRECT)
```
gen_sCMSPolicyType = HOME (or AUTO)
gen_sApplicationType = Personal
gen_sLOBCode = HOME (or AUTO)
gen_sPolicyTitle = HOME
gen_sLeadSource = Website
gen_nClientStatus = PROSPECT
```

### ✅ Home Property Fields (ONLY These Exist)
```
gen_sGAddress = 123 Main St
gen_sGCity = Las Vegas  
gen_sGState = NV
gen_sGZip = 89101
gen_nYearBuilt = 2000
gen_sConstruction = Brick
gen_sProtectionClass = 5
gen_sBurgAlarm = Central
gen_sFireAlarm = Smoke Detector
gen_sSprinkler = Partial
gen_sLiability = 300/100
gen_sDecuct = 1000 (NOTE: HawkSoft has typo "Decuct" not "Deduct")
gen_sLpName1 = Bank Name (mortgagee)
```

### ✅ Vehicle Fields (CORRECT)
```
veh_sVIN[0] = 1HGBH41JXMN109186
veh_sYr[0] = 2015
veh_sMake[0] = NISSAN
veh_sModel[0] = Rogue
veh_sUse[0] = Commute
veh_lMileage[0] = 15000
veh_nCommuteMileage[0] = 25
veh_sGaragingZip[0] = 89101
```

### ✅ Driver Fields (CORRECT)
```
drv_sFirstName[0] = John
drv_sLastName[0] = Doe
drv_tBirthDate[0] = 01/15/1985
drv_sLicenseNum[0] = A1234567
drv_sLicensingState[0] = NV
drv_bPrincipleOperator[0] = Yes
```

### ✅ Coverage Fields (CORRECT)
```
gen_sBi = 50/100 (liability)
```

### 📦 Custom Misc Data (All Property Details)
These fields **don't have dedicated HawkSoft variables**, so they go in `gen_sClientMiscData[]`:

```
gen_sClientMiscData[0] = Square Feet: 2000
gen_sClientMiscData[1] = Roof Type: Composition Shingle
gen_sClientMiscData[2] = Roof Updated: 2018
gen_sClientMiscData[3] = Heating: Forced Air
gen_sClientMiscData[4] = Heating Updated: 2015
gen_sClientMiscData[5] = Cooling: Central AC
gen_sClientMiscData[6] = Electrical Updated: 2010
gen_sClientMiscData[7] = Plumbing Updated: 2012
gen_sClientMiscData[8] = Foundation: Slab
gen_sClientMiscData[9] = Exterior Walls: Stucco
gen_sClientMiscData[10] = Roof Shape: Gable
gen_sClientMiscData[11] = Stories: 2
gen_sClientMiscData[12] = Bathrooms: 2.5
gen_sClientMiscData[13] = Fire Station: 3 mi
gen_sClientMiscData[14] = Hydrant: 150 ft
gen_sClientMiscData[15] = Purchase Date: 2015-06-01
gen_sClientMiscData[16] = Dwelling: Single Family
gen_sClientMiscData[17] = Usage: Primary
gen_sClientMiscData[18] = Kitchen: Semi-Custom
gen_sClientMiscData[19] = Pool: Above Ground
gen_sClientMiscData[20] = Trampoline: Yes - With Net Enclosure
gen_sClientMiscData[21] = Wood Stove: No
gen_sClientMiscData[22] = Pet: Yes
gen_sClientMiscData[23] = Business: No
gen_sClientMiscData[24] = Marital: Married
gen_sClientMiscData[25] = Occupation: Engineer
gen_sClientMiscData[26] = Education: Bachelor's Degree
gen_sClientMiscData[27] = Prior Carrier: Progressive
gen_sClientMiscData[28] = Years w/Prior: 3
gen_sClientMiscData[29] = Prior Expiration: 2025-12-31
```

## What Was Fixed

1. **Removed 15+ invalid hpm_ fields** that don't exist
2. **Fixed home deductible** - changed from `gen_sDeduct` to `gen_sDecuct` (HawkSoft's typo!)
3. **Moved ALL property details** to misc data fields
4. **Removed hpm_sTerritory** (doesn't exist for auto)
5. **Changed auto deductible** to misc field
6. **Kept ONLY verified fields** from official samples

## Testing Checklist

When you generate a .cmsmtf file, it should contain:

✅ **Standard fields** with values in dedicated variables  
✅ **Property details** in `gen_sClientMiscData[0]` through `[29]`  
✅ **Vehicle/driver** data in array notation `veh_sVIN[0]`, `drv_sFirstName[0]`  
✅ **Format** as `variable = value` (with spaces)  
❌ **NO** `hpm_lSqFootage` or similar non-existent fields  
❌ **NO** `gen_sDeduct` (should be `gen_sDecuct` for home)

## Key Insight

**HawkSoft CMSMTF format has very limited standard fields.** Most property details MUST go in custom misc data arrays. The official samples only show:
- Basic client/policy info
- Coverage amounts (hpm_d* for premiums)
- Limited property fields (year built, construction, alarms)
- Vehicle/driver arrays
- Misc data arrays (up to 30 items each in 3 arrays: ClientMiscData, ClientMisc2Data, ClientMisc3Data)

This is why the data was dumping into notes - we were using non-existent field names that HawkSoft couldn't recognize!
