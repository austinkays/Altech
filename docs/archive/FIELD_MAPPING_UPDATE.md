# HawkSoft Field Mapping Update

## What Changed

Previously, most form data was being dumped into `gen_sClientNotes` because we weren't using the proper HawkSoft field variables. This update maps form data to the correct HawkSoft fields.

## Now Properly Mapped to HawkSoft Fields

### Client Information (Standard Fields)
| Form Field | HawkSoft Variable | Example Value |
|------------|-------------------|---------------|
| First Name | `gen_sFirstName` | John |
| Last Name | `gen_sLastName` | Doe |
| Email | `gen_sEmail` | john@example.com |
| Phone | `gen_sCellPhone` + `gen_sPhone` | (305) 838-3092 |
| Address | `gen_sAddress1` | 408 nw 116th st |
| City | `gen_sCity` | vancouver |
| State | `gen_sState` | WA |
| Zip | `gen_sZip` | 98685 |

### Property Information (Home Fields - hpm_ prefix)
| Form Field | HawkSoft Variable | Example Value |
|------------|-------------------|---------------|
| Property Address | `gen_sGAddress` | 408 nw 116th st |
| Property City | `gen_sGCity` | vancouver |
| Property State | `gen_sGState` | WA |
| Property Zip | `gen_sGZip` | 98685 |
| Year Built | `gen_nYearBuilt` | 1992 |
| Square Feet | `hpm_lSqFootage` | 2000 |
| Stories | `hpm_sNumStories` | 2 |
| Bathrooms | `hpm_sNumBathrooms` | 2 |
| Construction | `gen_sConstruction` | Masonry |
| Exterior Walls | `hpm_sExteriorWalls` | Wood Siding |
| Foundation | `hpm_sFoundation` | Basement (Unfinished) |
| Roof Type | `hpm_sRoofType` | Wood Shake |
| Roof Updated | `hpm_nRoofUpdateYear` | 2020 |
| Heating Type | `hpm_sHeating` | Boiler (Steam/Water) |
| Heating Updated | `hpm_nHeatingUpdateYear` | 2010 |
| Electrical Updated | `hpm_nElectricalUpdateYear` | 2013 |
| Plumbing Updated | `hpm_nPlumbingUpdateYear` | 2012 |
| Protection Class | `gen_sProtectionClass` | 6 |
| Fire Station Distance | `hpm_nDistToFireStation` | 2 |
| Hydrant Distance | `hpm_nDistToHydrant` | 200 |
| Burglar Alarm | `gen_sBurgAlarm` | None |
| Fire Alarm | `gen_sFireAlarm` | Local |
| Sprinklers | `gen_sSprinkler` | Yes |
| Mortgagee | `gen_sLpName1` | Bank Name |
| Purchase Date | `hpm_dPurchaseDate` | 2020-01-15 |

### Vehicle Information (Auto Fields - veh_ prefix)
| Form Field | HawkSoft Variable | Example Value |
|------------|-------------------|---------------|
| VIN | `veh_sVIN[0]` | 5N1AT2MK4FC824170 |
| Vehicle Year | `veh_sYr[0]` | 2015 |
| Vehicle Make | `veh_sMake[0]` | NISSAN |
| Vehicle Model | `veh_sModel[0]` | Rogue |
| Usage | `veh_sUse[0]` | Commute |
| Annual Miles | `veh_lMileage[0]` | 15000 |
| Commute Distance | `veh_nCommuteMileage[0]` | 10 |
| Garaging Zip | `veh_sGaragingZip[0]` | 98685 |

### Driver Information (drv_ prefix)
| Form Field | HawkSoft Variable | Example Value |
|------------|-------------------|---------------|
| Driver First Name | `drv_sFirstName[0]` | John |
| Driver Last Name | `drv_sLastName[0]` | Doe |
| Date of Birth | `drv_tBirthDate[0]` | 1982-04-02 |
| Driver's License | `drv_sLicenseNum[0]` | WDLJKFHJKSLD |
| DL State | `drv_sLicensingState[0]` | WA |
| Principal Operator | `drv_bPrincipleOperator[0]` | Yes |

### Coverage Information
| Form Field | HawkSoft Variable | Example Value |
|------------|-------------------|---------------|
| Liability Limits | `gen_sBi` | 50/100 |
| Home Deductible | `gen_sDeduct` | 100 |
| Auto Deductible | `gen_sDeduct` | 200 |

## Still in Custom Misc Fields (gen_sClientMiscData[])

These fields don't have standard HawkSoft variables, so they're stored in custom misc data:

- Marital Status
- Occupation/Industry  
- Education Level
- Prior Carrier Info
- Accidents & Violations
- TCPA Consent
- Contact Time Preference
- Pool, Trampoline, Wood Stove, Dogs
- Kitchen Quality
- Dwelling Type/Usage
- Telematics & Ride Sharing preferences

## Client Notes Field

Now **simplified** and only contains:
```
Lead captured via Altech Field App. Quote Type: home. Contact: John Doe - john@example.com - (305) 838-3092
```

Instead of the massive dump of all data.

## How to Test

1. Fill out a lead in the app
2. Export to CMSMTF
3. Open the .cmsmtf file in a text editor
4. You should see fields like:
   ```
   gen_sFirstName = John
   gen_sEmail = john@example.com
   veh_sVIN[0] = 5N1AT2MK4FC824170
   veh_sYr[0] = 2015
   drv_sLicenseNum[0] = ABC123
   hpm_lSqFootage = 2000
   ```
5. Import to HawkSoft - data should populate correct fields automatically!

## Benefits

✅ **Cleaner imports** - HawkSoft recognizes and maps data automatically  
✅ **Less manual data entry** - Fields populate where they belong  
✅ **Shorter notes field** - Only essential summary info  
✅ **Better reporting** - Data in proper fields can be searched/filtered  
✅ **Auto-calculations work** - HawkSoft can use field data for quotes
