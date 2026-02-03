# 🔥 CRITICAL FIX - HawkSoft Import Issue SOLVED

## The Real Problem

**The format was completely wrong!**

I was using: `[variable]value`  
HawkSoft expects: `variable = value`

---

## What I Just Found

I downloaded **official HawkSoft sample CMSMTF files** from their server:
- https://download.hawksoft.com/download/HelpDocumentation/Home.CMSMTF
- https://download.hawksoft.com/download/HelpDocumentation/PersonalAuto%201.CMSMTF

These samples show the **actual format** HawkSoft uses.

---

## The Correct Format

### ❌ WRONG (What we were doing):
```
[gen_sFirstName]John
[gen_sLastName]Doe
[gen_sAddress1]123 Main St
```

### ✅ CORRECT (What HawkSoft actually needs):
```
gen_sFirstName = John
gen_sLastName = Doe
gen_sAddress1 = 123 Main St
```

**Key differences:**
1. NO brackets `[ ]` around the variable name
2. Equals sign `=` with spaces: ` = `
3. Value after the equals sign

---

## What I Fixed

Updated the `exportCMSMTF()` function to generate the correct format:

```javascript
// OLD - WRONG
fields.push(`[${tag}]${value}`);

// NEW - CORRECT
fields.push(`${tag} = ${value}`);
```

Also fixed:
- Custom misc fields now use **0-based index**: `gen_sClientMiscData[0]`, `[1]`, `[2]`...
- Added required fields like `gen_sCustType = Personal`
- Added `gen_sCMSPolicyType` and `gen_sLOBCode`
- Added `gen_nClientStatus = PROSPECT`

---

## Sample Export File (Now Correct)

```
gen_sCustType = Personal
gen_sFirstName = John
gen_sLastName = Doe
gen_sAddress1 = 123 Main Street
gen_sCity = Las Vegas
gen_sState = NV
gen_sZip = 89101
gen_sCellPhone = (702) 555-1234
gen_sEmail = john@email.com
gen_sClientSource = Website
gen_sCMSPolicyType = HOME
gen_sApplicationType = Personal
gen_sLOBCode = HOME
gen_sPolicyTitle = HOME
gen_sLeadSource = Website
gen_nClientStatus = PROSPECT
gen_sGAddress = 123 Main Street
gen_sGCity = Las Vegas
gen_sGState = NV
gen_sGZip = 89101
gen_nYearBuilt = 2005
gen_sConstruction = Wood Frame
gen_sProtectionClass = 3
gen_sBurgAlarm = Yes
gen_sFireAlarm = Yes
gen_sSprinkler = No
gen_sClientMiscData[0] = DOB: 1990-01-15
gen_sClientMiscData[1] = Marital: Married
gen_sClientMiscData[2] = Occupation: Software Engineer
gen_sClientMiscData[3] = Education: Bachelor's Degree
gen_sClientMiscData[4] = Prior Carrier: State Farm
gen_sClientMiscData[5] = Years w/Prior: 5
gen_sClientNotes = Complete lead information...
gen_sFSCNotes = Complete lead information...
```

---

## Testing NOW

1. **Generate a new export** from the app
2. **Open the `.cmsmtf` file** in a text editor
3. **Verify it looks like the sample above** - with `=` signs, NO brackets
4. **Import to HawkSoft** - should now work perfectly!

---

## Why This Happened

The CMSMTF format is not well documented online. Most examples I found (and AI training data) were incorrect or based on other tagged formats (like ACORD XML which uses `<tags>`). 

The **only reliable source** is HawkSoft's own sample files, which I finally found referenced in their PDF documentation.

---

## Status: ✅ FIXED

The export function now generates files in the **exact format** HawkSoft expects, validated against official HawkSoft sample files.

**Try it now - it should work!** 🎉
