# HawkSoft Export Configuration Guide

## Validated Against HawkSoft's Official CMSMTF Sample Files

This document explains how the Altech app exports lead data to HawkSoft using **verified, validated field mappings**.

## Key Format: Tagged File Format

**CRITICAL:** The `.cmsmtf` format uses HawkSoft's "Tagged file format" (similar to an INI file):

```
fieldname = value
```

Each line is `variable_name = value` (space-equals-space). No brackets.

- WRONG: `[FirstName]John` or `[gen_sFirstName]John`
- CORRECT: `gen_sFirstName = John`

Variable names are case-sensitive and must match HawkSoft's exact system variable names.

---

## Export Methods

### 1. **CMSMTF Format** (Recommended)

- **File Type:** `.cmsmtf` (Plain text with HawkSoft system variables)
- **Use Case:** Direct import into HawkSoft for creating new prospects
- **How to Import:** Double-click the `.cmsmtf` file (HawkSoft registers the extension) or go to **Utilities > Import > HawkSoft Data Importer > File**

#### Format Structure (from official sample files)
```
gen_sCustType = Personal
gen_sLastName = Doe
gen_sFirstName = John
gen_sAddress1 = 123 Main St
gen_sCity = Las Vegas
gen_sState = NV
gen_sZip = 89101
gen_sCellPhone = (702) 555-1234
gen_sEmail = john@email.com
gen_sClientSource = Website
gen_sClientMiscData[0] = DOB: 01/15/1990
gen_sClientMiscData[1] = Marital: Married
gen_sCMSPolicyType = HOME
gen_sApplicationType = Personal
gen_sLOBCode = HOME
gen_nClientStatus = PROSPECT
gen_sGAddress = 123 Main St
gen_sGCity = Las Vegas
gen_sGState = NV
gen_sGZip = 89101
gen_sCounty = Clark
gen_nYearBuilt = 2005
gen_sConstruction = Wood Frame
gen_sProtectionClass = 3
gen_sBurgAlarm = Central
gen_sFireAlarm = Smoke Detector
gen_lCovA = 350000
gen_sLiability = 300000
gen_sClientNotes = Complete notes with all details...
```

#### Client Fields
| Field | Variable | Purpose |
|-------|----------|---------|
| Customer Type | `gen_sCustType` | "Personal" for personal lines |
| Last Name | `gen_sLastName` | Primary contact last name |
| First Name | `gen_sFirstName` | Primary contact first name |
| Middle Initial | `gen_cInitial` | Middle initial (single char) |
| Address | `gen_sAddress1` | Street address |
| City | `gen_sCity` | City |
| State | `gen_sState` | State code (2-letter) |
| Zip | `gen_sZip` | Zip code |
| Phone | `gen_sPhone` | Home/main phone |
| Cell Phone | `gen_sCellPhone` | Mobile phone number |
| Email | `gen_sEmail` | Email address |
| Work Email | `gen_sEmailWork` | Work email |
| Client Source | `gen_sClientSource` | How client was sourced (referral source) |
| Client Office | `gen_lClientOffice` | Office number (integer) |

#### Policy Fields
| Field | Variable | Purpose |
|-------|----------|---------|
| Policy Type | `gen_sCMSPolicyType` | HOME or AUTO |
| Application Type | `gen_sApplicationType` | "Personal" |
| Policy Title | `gen_sPolicyTitle` | Display title |
| LOB Code | `gen_sLOBCode` | HOME, AUTOP, CGL, etc. |
| Policy Number | `gen_sPolicyNumber` | Policy number |
| Policy Form | `gen_sForm` | HO3, DP1, Standard, etc. |
| Effective Date | `gen_tEffectiveDate` | MM/DD/YYYY or "(today)" |
| Expiration Date | `gen_tExpirationDate` | MM/DD/YYYY |
| Term | `gen_nTerm` | Term in months (6, 12) |
| Client Status | `gen_nClientStatus` | "PROSPECT" for new leads |
| Status | `gen_sStatus` | "Active" |
| Lead Source | `gen_sLeadSource` | Lead/referral source |
| Producer | `gen_sProducer` | Producer code |
| Program | `gen_sProgram` | Program name |

#### Property / Garaging Fields
| Field | Variable | Purpose |
|-------|----------|---------|
| Garaging Address | `gen_sGAddress` | Property/garaging street |
| Garaging City | `gen_sGCity` | Property city |
| Garaging State | `gen_sGState` | Property state |
| Garaging Zip | `gen_sGZip` | Property zip |
| County | `gen_sCounty` | County name |
| Year Built | `gen_nYearBuilt` | Year property was built |
| Construction | `gen_sConstruction` | Brick, Frame, etc. |
| Protection Class | `gen_sProtectionClass` | Fire protection class (1-10) |
| Burglar Alarm | `gen_sBurgAlarm` | Central, Local, None |
| Fire Alarm | `gen_sFireAlarm` | Smoke Detector, Central, etc. |
| Sprinkler | `gen_sSprinkler` | Full, Partial, None |
| Deadbolt | `gen_bDeadBold` | Y/N (note: HawkSoft's typo, not "Deadbolt") |
| Fire Extinguisher | `gen_bFireExtinguisher` | Y/N |

#### Home Coverage Fields
| Field | Variable | Purpose |
|-------|----------|---------|
| Dwelling (Cov A) | `gen_lCovA` | Dwelling coverage amount |
| Other Structures (Cov B) | `gen_lCovB` | Other structures amount |
| Personal Property (Cov C) | `gen_lCovC` | Personal property amount |
| Loss of Use (Cov D) | `gen_lCovD` | Loss of use amount |
| Liability | `gen_sLiability` | Liability limit |
| Medical | `gen_sMedical` | Medical payments |
| Deductible | `gen_sDecuct` | Deductible (note: HawkSoft's typo) |
| Additional Residence | `gen_nAdditionalRes` | Increased replacement cost |
| Earthquake | `gen_bEarthquake` | Y/N |
| EQ Deductible | `gen_sEQDeduct` | Earthquake deductible |
| Ordinance/Law | `gen_lOrdinanceOrLawIncr` | Ordinance/law increase |
| Jewelry | `gen_lJewelry` | Scheduled jewelry limit |
| Home Replacement | `gen_bHomeReplacement` | Y/N |

#### Mortgagee / Lienholder Fields
| Field | Variable | Purpose |
|-------|----------|---------|
| AI Type 1 | `gen_sLPType1` | "Mortgagee", "AD", etc. |
| AI Name 1 | `gen_sLpName1` | Mortgagee/lender name |
| AI Name Line 2 | `gen_sLPName1Line2` | Second line of name |
| AI Address 1 | `gen_sLpAddress1` | Lender address |
| AI City 1 | `gen_sLpCity1` | Lender city |
| AI State 1 | `gen_sLpState1` | Lender state |
| AI Zip 1 | `gen_sLpZip1` | Lender zip |
| Loan Number 1 | `gen_sLpLoanNumber1` | Loan/account number |

#### Auto Coverage Fields
| Field | Variable | Purpose |
|-------|----------|---------|
| BI Limits | `gen_sBi` | Bodily injury (e.g., "25/50") |
| PD Limit | `gen_sPd` | Property damage |
| UM BI | `gen_sUmBi` | Uninsured motorist BI |
| UIM BI | `gen_sUimBi` | Underinsured motorist BI |
| UM PD | `gen_sUmPd` | Uninsured motorist PD |
| UIM PD | `gen_sUimPd` | Underinsured motorist PD |
| PIP | `gen_sPip` | Personal injury protection |
| PIP Deductible | `gen_sPipDeduct` | PIP deductible |
| Medical | `gen_sMedical` | Medical payments |
| Policy Type | `gen_sTypeOfPolicy` | Regular, Broad, etc. |

#### Vehicle Fields (indexed: `[0]`, `[1]`, etc.)
| Field | Variable | Purpose |
|-------|----------|---------|
| Year | `veh_sYr[i]` | Vehicle year |
| Make | `veh_sMake[i]` | Vehicle make |
| Model | `veh_sModel[i]` | Vehicle model |
| VIN | `veh_sVIN[i]` | Vehicle identification number |
| Use | `veh_sUse[i]` | Pleasure, Commute, Business |
| Mileage | `veh_lMileage[i]` | Annual mileage |
| Commute Miles | `veh_nCommuteMileage[i]` | One-way commute distance |
| Comp Ded. | `veh_sComp[i]` | Comprehensive deductible |
| Coll Ded. | `veh_sColl[i]` | Collision deductible |
| Towing | `veh_sTowing[i]` | Towing/roadside (Yes/No) |
| Rental | `veh_sRentRemb[i]` | Rental reimbursement |
| Vehicle Type | `veh_sVehicleType[i]` | Sedan, SUV, Truck, etc. |
| Garaging Zip | `veh_sGaragingZip[i]` | Vehicle garaging zip |
| Assigned Driver | `veh_nDriver[i]` | Driver number (1-based) |

#### Driver Fields (indexed: `[0]`, `[1]`, etc.)
| Field | Variable | Purpose |
|-------|----------|---------|
| First Name | `drv_sFirstName[i]` | Driver first name |
| Last Name | `drv_sLastName[i]` | Driver last name |
| Middle Initial | `drv_cInitial[i]` | Middle initial |
| Birth Date | `drv_tBirthDate[i]` | MM/DD/YYYY |
| License Number | `drv_sLicenseNum[i]` | Driver license number |
| License State | `drv_sLicensingState[i]` | Licensing state (2-letter) |
| Sex | `drv_sSex[i]` | Male / Female |
| Marital Status | `drv_sMaritalStatus[i]` | Single, Married, etc. |
| Occupation | `drv_sDriversOccupation[i]` | Driver's occupation |
| Relationship | `drv_sRelationship[i]` | Insured, Spouse, Child, etc. |
| Points | `drv_nPoints[i]` | Points on record |
| Date Licensed | `drv_tDateLicensed[i]` | MM/DD/YYYY |
| Good Student | `drv_bGoodStudent[i]` | Yes/No |
| Driver Training | `drv_bDriverTraining[i]` | Yes/No |
| Defensive Driver | `drv_bDefDrvr[i]` | Yes/No |
| Excluded | `drv_bExcluded[i]` | Yes/No |
| Principal Operator | `drv_bPrincipleOperator[i]` | Yes/No |
| Filing (SR22) | `drv_bFiling[i]` | Y/N |

#### Custom Misc Fields
HawkSoft provides three banks of 10 custom fields each (30 total):
```
gen_sClientMiscData[0] = DOB: 01/15/1990
gen_sClientMiscData[1] = Marital Status: Married
gen_sClientMiscData[2] = Occupation: Software Engineer
...
gen_sClientMiscData[9] = (10th field)
gen_sClientMisc2Data[0] = (11th field)
...
gen_sClientMisc2Data[9] = (20th field)
gen_sClientMisc3Data[0] = (21st field)
...
gen_sClientMisc3Data[9] = (30th field)
```

#### Notes Fields
| Field | Variable | Purpose |
|-------|----------|---------|
| Client Notes | `gen_sClientNotes` | General notes about client |
| FSC Notes | `gen_sFSCNotes` | Prior insurance / detailed notes |

#### Premium Fields (hpm_*)
| Field | Variable | Purpose |
|-------|----------|---------|
| Territory | `hpm_sTerritory` | Territory code (typically zip) |
| Earthquake Zone | `hpm_sEarthquakeZone` | EQ zone code |

---

### 2. **HawkSoft CSV Format**

- **File Type:** `.csv` (Comma-separated values)
- **Use Case:** For multi-lead imports with field mapping in HawkSoft Data Importer
- **Format:** Standard CSV with recognized column headers

---

### 3. **Generic CSV Export**

- **File Type:** `.csv` (Standard comma-separated values)
- **Use Case:** For EZLynx or other CRM systems
- **Format:** Basic contact fields only

---

## Field Mapping: Intake Form to HawkSoft

The `buildCMSMTF()` function in `js/app-export.js` maps intake form fields to HawkSoft variables:

| Intake Field (`App.data.*`) | HawkSoft Variable | Notes |
|-----|-----|-----|
| `firstName` | `gen_sFirstName` | Direct |
| `lastName` | `gen_sLastName` | Direct |
| `addrStreet` | `gen_sAddress1` | Direct |
| `addrCity` | `gen_sCity` | Direct |
| `addrState` | `gen_sState` | Direct |
| `addrZip` | `gen_sZip` | Direct |
| `phone` | `gen_sCellPhone` / `gen_sPhone` | Both populated |
| `email` | `gen_sEmail` | Direct |
| `dob` | `gen_sClientMiscData[0]` | No direct HS field |
| `gender` | `gen_sClientMiscData[1]` | No direct HS field |
| `maritalStatus` | `gen_sClientMiscData[2]` | No direct HS field |
| `education` | `gen_sClientMiscData[3]` | No direct HS field |
| `industry` | `gen_sClientMiscData[4]` | No direct HS field |
| `occupation` | `gen_sClientMiscData[5]` | No direct HS field |
| `yrBuilt` | `gen_nYearBuilt` | Direct (home) |
| `constructionStyle` | `gen_sConstruction` | Direct (home) |
| `protectionClass` | `gen_sProtectionClass` | Direct (home) |
| `burglarAlarm` | `gen_sBurgAlarm` | Direct (home) |
| `fireAlarm` | `gen_sFireAlarm` | Direct (home) |
| `sprinklers` | `gen_sSprinkler` | Direct (home) |
| `dwellingCoverage` | `gen_lCovA` | Direct (home) |
| `personalLiability` | `gen_sLiability` | Direct (home) |
| `homeDeductible` | `gen_sDecuct` | Direct (home) |
| `mortgagee` | `gen_sLpName1` | With `gen_sLPType1 = Mortgagee` |
| `liabilityLimits` | `gen_sBi` | Direct (auto) |
| `pdLimit` | `gen_sPd` | Direct (auto) |
| `umLimits` | `gen_sUmBi` | Direct (auto) |
| `uimLimits` | `gen_sUimBi` | Direct (auto) |
| `App.vehicles[]` | `veh_s*[i]` | Per-vehicle indexed |
| `App.drivers[]` | `drv_s*[i]` | Per-driver indexed |

Fields without direct HawkSoft variables (DOB, gender, marital status, education, industry, occupation, co-applicant info, prior insurance details, contact preferences) are stored in `gen_sClientMiscData[x]` custom fields.

All field data is also captured in `gen_sClientNotes` as a comprehensive fallback.

---

## Testing & Troubleshooting

### To Test:
1. Fill out the intake form completely
2. Go to Review & Export step
3. Click the HawkSoft export button
4. **Open the `.cmsmtf` file in a text editor and verify:**
   - Format is `variable = value` (no brackets)
   - Variables use `gen_s*`, `gen_l*`, `gen_n*`, `veh_s*`, `drv_s*` prefixes
   - Dates are `MM/DD/YYYY` format
   - Empty fields are omitted
5. In HawkSoft: double-click the `.cmsmtf` file or use Data Importer

### Expected Behavior:
- File downloads as `Lead_[LastName].cmsmtf`
- HawkSoft Importer launches automatically when file is opened
- All mapped fields populate into the correct HawkSoft fields
- Custom data appears in Client Misc fields
- Notes contain comprehensive details as fallback

### Troubleshooting:

**Fields not appearing:** Verify variable names match exactly (case-sensitive). Compare against the sample files.

**"Unrecognized field" errors:** Check for typos in variable names. Use `gen_sClientMiscData[x]` for custom data.

**Date issues:** HawkSoft expects `MM/DD/YYYY` format. The export converts ISO dates automatically.

**Missing vehicles/drivers:** Ensure drivers and vehicles are added in Step 4 of the intake form. The export reads from `App.drivers[]` and `App.vehicles[]` arrays.

---

## Reference Files

Official HawkSoft template and sample files:

- `HS6_Multico_Tagged_Field_Format_-_Home.xls` - Home insurance variables
- `HS6_Multico_Tagged_Field_Format_-_Auto.xls` - Auto insurance variables
- `HS6_Multico_Tagged_Field_Format_-_Commercial.xls` - Commercial variables
- `Home.CMSMTF` - Sample home policy import file
- `PersonalAuto 1.CMSMTF` - Sample auto policy import file
- `CommercialCGL.CMSMTF` - Sample commercial policy import file
- `Generic_Website Integration.pdf` - HawkSoft data import documentation

---

**Last Updated:** March 27, 2026
**Status:** Rewritten to match official HawkSoft CMSMTF sample file format
**Validated against:** Home.CMSMTF, PersonalAuto 1.CMSMTF, CommercialCGL.CMSMTF sample files
