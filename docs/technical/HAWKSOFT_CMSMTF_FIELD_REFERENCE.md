# HawkSoft CMSMTF Field Reference

> **Source:** Official HS6_Multico_Tagged_Field_Format templates (Home, Auto, Commercial)
> **Format:** `fieldname = value` (one per line, space-equals-space)
> **Saved:** March 27, 2026

---

## Client Fields (shared across all LOBs)

| Variable | Description | Values/Notes |
|----------|-------------|-------------|
| `gen_bBusinessType` | Type of Business | Char: C=Corp, D=Individual, F=Family Trust, J=JV, L=LLC, N=NFP, P=Partnership, S=Sub-S |
| `gen_sCustType` | Customer Type | Commercial, Life, Donotmarket, Personal, Crosssell |
| `gen_sBusinessName` | Business Name | Max 60 chars |
| `gen_sDBAName` | DBA Name | Max 60 chars |
| `gen_sLastName` | Last Name | |
| `gen_sFirstName` | First Name | |
| `gen_cInitial` | Middle Name/Initial | |
| `gen_sAddress1` | Address | |
| `gen_sCity` | City | |
| `gen_sState` | State | |
| `gen_sZip` | Zip | |
| `gen_sFEIN` | Business FEIN | Max 9 chars |
| `gen_sBusinessLicense` | Business License | Max 30 chars |
| `gen_sClientSource` | Customer Source | Max 14 chars. Examples: Phone Book, Newspaper, Radio |
| `gen_sClientNotes` | Free form notes | Max 30,000 chars |
| `gen_sNAICS` | NAICS number | Max 6 chars |
| `gen_sWebsite` | Business Website | Max 128 chars |
| `gen_sPhone` | Home Phone | (###)###-#### |
| `gen_sWorkPhone` | Work Phone | (###)###-####x#### |
| `gen_sFax` | Fax | (###)###-####x#### |
| `gen_sPager` | Pager | |
| `gen_sCellPhone` | Cell Phone | |
| `gen_sMsgPhone` | Msg Phone | |
| `gen_sEmail` | Email | |
| `gen_sEmailWork` | Work Email | |
| `gen_lClientOffice` | Office | Number (Agency # from Multi-Company Setup) |
| `gen_sClientMiscData[0-9]` | Misc Data (Left) | Max 40 chars each, 10 slots |
| `gen_sClientMisc2Data[0-9]` | Misc Data (Center) | Max 40 chars each, 10 slots |
| `gen_sClientMisc3Data[0-9]` | Misc Data (Right) | Max 40 chars each, 10 slots |
| `gen_nClientStatus` | Client Status | New Client, Existing Client, Prospect, Cancelled |
| `gen_sAgencyID` | Agency ID | AlphaNumeric, max 20 chars |

---

## Policy Fields (shared across all LOBs)

| Variable | Description | Values/Notes |
|----------|-------------|-------------|
| `gen_sApplicationType` | Application Type | Personal, Commercial, Agriculture, Life, Health, Surety Bond, Other, Employee Benefits |
| `gen_sCMSPolicyType` | CMS Policy Type | NONE, AUTO, HOME, ENHANCED |
| `gen_sCompany` | Company Name | |
| `gen_lPolicyOffice` | Policy Office | Number (Agency #) |
| `gen_sPolicyTitle` | Policy Title | |
| `gen_sForm` | LOB Form | Required (even if blank) to distinguish Auto from Home |
| `gen_sLOBCode` | LOB Code | Any ACORD Standard LOB Codes (HOME, AUTOP, CGL, etc.) |
| `gen_sPolicyNumber` | Policy Number | |
| `gen_tProductionDate` | Policy Inception | mm/dd/yyyy, mm-dd-yyyy, or (today) |
| `gen_tExpirationDate` | Expiration Date | mm/dd/yyyy, mm-dd-yyyy, or (today) |
| `gen_tEffectiveDate` | Effective Date | mm/dd/yyyy, mm-dd-yyyy, or (today) |
| `gen_sLeadSource` | Source | |
| `gen_dTotal` | Total Premium | Number |
| `gen_nTerm` | Term | 1, 3, 6, 12 (months) |
| `gen_sStatus` | Policy Status | New, Renewal, Canc Pend, Canc-IReq, Canc-NPay, Canc-U/W, Canc-NSF, Canceled, DFile, Rewrite, Prospect, Active, Reinstate, NonRenew, Purge, Void, Agent, Quote, Refused, Replaced |
| `gen_sFSCNotes` | Notes | Creates a log note in the policy |
| `gen_dFilingFee` | SR22 Fee | Number |
| `gen_dPolicyFee` | Policy Fee | Number |
| `gen_dBrokerFee` | Broker Fee | Number |
| `gen_sProducer` | Agent 1 | 3-letter identifier |
| `gen_sProgram` | Program | |

---

## Garaging / Physical Address (shared)

| Variable | Description |
|----------|-------------|
| `gen_sGAddress` | Garaging/Physical Address |
| `gen_sGCity` | Garaging/Physical City |
| `gen_sGState` | Garaging/Physical State |
| `gen_sGZip` | Garaging/Physical Zip |
| `gen_sCounty` | County |

---

## Auto Policy Fields

| Variable | Description | Values/Notes |
|----------|-------------|-------------|
| `gen_sBi` | Bodily Injury Coverage | |
| `gen_sPd` | Property Damage Coverage | |
| `gen_sUmBi` | Uninsured BI Coverage | |
| `gen_sUimBi` | Underinsured BI Coverage | |
| `gen_sUmPd` | Uninsured PD Coverage | |
| `gen_sUimPd` | Underinsured PD Coverage | |
| `gen_sPipDeduct` | PIP Deductible | |
| `gen_sPip` | PIP | |
| `gen_sMedical` | Medical | |
| `gen_sTypeOfPolicy` | Type of Policy | Regular, Named Driver, Broad |

---

## Vehicle Fields (indexed `[x]` starting at 0)

| Variable | Description | Values/Notes |
|----------|-------------|-------------|
| `veh_sMake[x]` | Make | |
| `veh_sModel[x]` | Model | |
| `veh_sYr[x]` | Year | |
| `veh_sSymb[x]` | Symbol | |
| `veh_sTerr[x]` | Territory | |
| `veh_lAddOnEquip[x]` | Additional Equipment | |
| `veh_nDriver[x]` | Assigned Driver | Driver number (1-based) |
| `veh_sUse[x]` | Use | |
| `veh_nCommuteMileage[x]` | Commute Mileage | |
| `veh_lMileage[x]` | Annual Miles | |
| `veh_nGVW[x]` | GVW | Number, for commercial |
| `veh_sTowing[x]` | Towing | Add/Update coverage, sets limits |
| `veh_sRentRemb[x]` | Rental | Add/Update coverage, sets limits |
| `veh_sVehicleType[x]` | Type | Coupe, Sedan, Hatchback, Stationwagon, Utility, Van, Pickup, etc. |
| `veh_bFourWD[x]` | Four WD | Yes, No |
| `veh_sComp[x]` | Comp Deductible | |
| `veh_sColl[x]` | Collision Deductible | |
| `veh_sUmPd[x]` | Uninsured PD (limit) | |
| `veh_bUmPd[x]` | Uninsured PD (Y/N) | Yes, No |
| `veh_sUimPd[x]` | Underinsured PD (limit) | |
| `veh_bUimPd[x]` | Underinsured PD (Y/N) | Yes, No |
| `veh_sVIN[x]` | VIN | |
| `veh_sGaragingZip[x]` | Garaging Zip | |
| `veh_bLossPayee[x]` | Loss Payee | Yes, No |
| `veh_bAdditionalInterest[x]` | Additional Interest | Yes, No |
| `veh_sLossPayeeName[x]` | Loss Payee Name | |
| `veh_sLossPayeeAddress[x]` | Loss Payee Address | |
| `veh_sLossPayeeAddr2[x]` | Loss Payee Address 2 | |
| `veh_sLossPayeeCity[x]` | Loss Payee City | |
| `veh_sLossPayeeState[x]` | Loss Payee State | |
| `veh_sLossPayeeZip[x]` | Loss Payee Zip | |

---

## Vehicle Premium Fields (indexed `[x]`)

| Variable | Description |
|----------|-------------|
| `prm_sClass[x]` | Driver Class |
| `prm_dBi[x]` | BI Premium |
| `prm_dPd[x]` | PD Premium |
| `prm_dUmBi[x]` | UM BI Premium |
| `prm_dUmPd[x]` | UM PD Premium |
| `prm_dUimBi[x]` | UIM BI Premium |
| `prm_dUimPd[x]` | UIM PD Premium |
| `prm_dMedical[x]` | Medical Premium |
| `prm_dPip[x]` | PIP Premium |
| `prm_dAddOnEquip[x]` | Add-On Equip Premium |
| `prm_dCarLoanProtection[x]` | Car Loan Protection |
| `prm_dLienholderDed[x]` | Lienholder Ded Premium |
| `prm_dComp[x]` | Comp Premium |
| `prm_dColl[x]` | Coll Premium |
| `prm_dTowing[x]` | Towing Premium |
| `prm_dRentRemb[x]` | Rental Premium |

---

## Driver Fields (indexed `[x]` starting at 0)

| Variable | Description | Values/Notes |
|----------|-------------|-------------|
| `drv_sLastName[x]` | Last Name | |
| `drv_sFirstName[x]` | First Name | |
| `drv_cInitial[x]` | Middle Name | |
| `drv_tBirthDate[x]` | Date of Birth | Date |
| `drv_nPoints[x]` | Points | |
| `drv_sLicensingState[x]` | License State | |
| `drv_sLicenseNum[x]` | License Number | |
| `drv_bExcluded[x]` | Excluded | Yes, No |
| `drv_bPrincipleOperator[x]` | Principal Driver | Yes, No |
| `drv_bOnlyOperator[x]` | Only Operator | Yes, No |
| `drv_bNonDriver[x]` | Non Driver | Yes, No |
| `drv_sDriversOccupation[x]` | Occupation | |
| `drv_sSex[x]` | Gender | M, F |
| `drv_sMaritalStatus[x]` | Marital Status | Single, Married, Divorced, Separated, Widowed |
| `drv_bFiling[x]` | SR22 Filing | Y, N |
| `drv_sFilingState[x]` | SR22 Filing State | |
| `drv_sFilingReason[x]` | SR22 Filing Reason | |
| `drv_tDateLicensed[x]` | Date Licensed | Date |
| `drv_tHiredDate[x]` | Hired Date | Date |
| `drv_tDateOfCDL[x]` | Date of CDL | Date |
| `drv_bGoodStudent[x]` | Good Student | Yes, No |
| `drv_bDriverTraining[x]` | Driver Training | Yes, No |
| `drv_bDefDrvr[x]` | Defensive Driver | Yes, No |
| `drv_sSSNum[x]` | SSN | ###-##-#### |
| `drv_sRelationship[x]` | Relationship | Insured, Spouse, Parent, Child, Sibling, Employee, Relative, Sig Other, Other, EMC |

---

## Home Policy Fields (Home-only, not in Auto)

| Variable | Description | Values/Notes |
|----------|-------------|-------------|
| `gen_nAdditionalRes` | Additional Residence Coverage | Number (limits) |
| `gen_sProtectionClass` | Protection Class | 1-10, 8a, 8b, 9a, 9b |
| `gen_nYearBuilt` | Year Built | |
| `gen_sConstruction` | Construction Type | List of valid values |
| `gen_sBurgAlarm` | Burglar Alarm | None, Local, Policy Station, Central, Operation ID |
| `gen_sFireAlarm` | Fire Alarm | None, Smoke Detector, Local, Fire Station, Central |
| `gen_sSprinkler` | Sprinkler | None, All Areas, Partial |
| `gen_bDeadBolt` | Dead Bolt | Y or N |
| `gen_bFireExtinguisher` | Fire Extinguisher | Y or N |
| `gen_bHomeReplacement` | Home Replacement | Y or N |
| `gen_lCovA` | Dwelling (Cov A) | |
| `gen_lCovB` | Other Structures (Cov B) | |
| `gen_lCovC` | Personal Property (Cov C) | |
| `gen_lCovD` | Loss of Use (Cov D) | |
| `gen_cContentsReplacement` | Contents Replacement | Y or N |
| `gen_sLiability` | Liability | |
| `gen_sMedical` | Medical | |
| `gen_sDeduct` | Deductible | |
| `gen_bEarthquake` | Earthquake Indicator | Y or N |
| `gen_sEQDeduct` | Earthquake Deductible | |
| `gen_bEQMasonryVeneer` | EQ Masonry Veneer | Y or N |
| `gen_lOrdinanceOrLawIncr` | Ordinance or Law | |
| `gen_bMultiPolicy` | Multi-Policy Credit | Y or N |

### Mortgagee / Additional Interests (up to 2)

| Variable | Description |
|----------|-------------|
| `gen_sLPType1` | 1st AI Type (Mortgagee, AD, etc.) |
| `gen_sLpName1` | 1st AI Name |
| `gen_sLPName1Line2` | 1st AI Name Line 2 |
| `gen_sLpAddress1` | 1st AI Address |
| `gen_sLpCity1` | 1st AI City |
| `gen_sLpState1` | 1st AI State |
| `gen_sLpZip1` | 1st AI Zip |
| `gen_sLpLoanNumber1` | 1st AI Loan Number |
| `gen_sLPType2` | 2nd AI Type |
| `gen_sLpName2` | 2nd AI Name |
| `gen_sLPName2Line2` | 2nd AI Name Line 2 |
| `gen_sLpAddress2` | 2nd AI Address |
| `gen_sLpCity2` | 2nd AI City |
| `gen_sLpState2` | 2nd AI State |
| `gen_sLpZip2` | 2nd AI Zip |
| `gen_sLpLoanNumber2` | 2nd AI Loan Number |

### Scheduled Personal Property Limits

| Variable | Description |
|----------|-------------|
| `gen_lJewelry` | Jewelry |
| `gen_lFurs` | Furs |
| `gen_lGuns` | Guns |
| `gen_lCameras` | Cameras |
| `gen_lCoins` | Coins |
| `gen_lStamps` | Stamps |
| `gen_lSilverware` | Silverware |
| `gen_lFineArt` | Fine Art |
| `gen_lGolfEquip` | Golf Equipment |
| `gen_lMusicalInst` | Musical Instruments |
| `gen_lElectronics` | Electronics |

### Watercraft (up to 2)

| Variable | Description |
|----------|-------------|
| `gen_sBoatType1` | 1st Boat Type |
| `gen_nHorsePower1` | 1st Boat HP |
| `gen_nSpeed1` | 1st Boat Speed |
| `gen_nLength1` | 1st Boat Length |
| `gen_sBoatType2` | 2nd Boat Type |
| `gen_nHorsePower2` | 2nd Boat HP |
| `gen_nSpeed2` | 2nd Boat Speed |
| `gen_nLength2` | 2nd Boat Length |

### Home Premium Fields (hpm_*)

| Variable | Description |
|----------|-------------|
| `hpm_sTerritory` | Territory |
| `hpm_sEarthquakeZone` | Earthquake Zone |
| `hpm_sPremiumGroup` | Premium Group |
| `hpm_dDwelling` | Dwelling Premium |
| `hpm_dOtherStructures` | Other Structures Premium |
| `hpm_dPersonalProp` | Personal Property Premium |
| `hpm_dLossOfUse` | Loss of Use Premium |
| `hpm_dLiability` | Liability Premium |
| `hpm_dMedical` | Medical Premium |
| `hpm_dAdditionalRes` | Additional Residence Premium |
| `hpm_dHomeReplacement` | Home Replacement Premium |
| `hpm_dWatercraft` | Watercraft Premium |
| `hpm_dEarthquake` | Earthquake Premium |
| `hpm_dDeductible` | Deductible Adjustment |
| `hpm_dJewelry` | Jewelry Premium |
| `hpm_dFurs` | Furs Premium |
| `hpm_dGuns` | Guns Premium |
| `hpm_dCameras` | Cameras Premium |
| `hpm_dCoins` | Coins Premium |
| `hpm_dStamps` | Stamps Premium |
| `hpm_dSilverware` | Silverware Premium |
| `hpm_dFineArt` | Fine Art Premium |
| `hpm_dGolfEquip` | Golf Equipment Premium |
| `hpm_dMusicalInst` | Musical Instruments Premium |
| `hpm_dElectronics` | Electronics Premium |
| `hpm_dNewHomeCredit` | New Home Credit |
| `hpm_dProtectiveDeviceCr` | Protective Device Credit |
| `hpm_dMultiPolicyCredit` | Multi-Policy Credit |
| `hpm_dRenewalCredit` | Renewal Credit |
| `hpm_dSPPSurcharge` | SPP Surcharge |
| `hpm_dOrdinanceOrLaw` | Ordinance/Law Premium |
| `hpm_dSpecialCovA` | Unit Owners Special Premium |

---

## Commercial Policy Fields (Enhanced/CGL-only)

| Variable | Description | Values/Notes |
|----------|-------------|-------------|
| `gen_Coverage[x]` | Coverage Description | Indexed starting at 0 |
| `gen_CoverageLimits[x]` | Coverage Limits | Indexed starting at 0 |
| `gen_CoverageDeds[x]` | Coverage Deductibles | Indexed starting at 0 |

Commercial uses `gen_sCMSPolicyType = ENHANCED` and the same client/policy fields as Auto/Home.

---

## Key Notes

1. **Format:** `fieldname = value` (NOT `[tag]value`)
2. **Dates:** `mm/dd/yyyy`, `mm-dd-yyyy`, or `(today)`
3. **Booleans:** `Y` or `N` for `gen_b*` fields; `Yes` or `No` for `drv_b*` and `veh_b*` fields
4. **Indexing:** Vehicle/Driver/Premium arrays are 0-based (`[0]`, `[1]`, etc.)
5. **Driver numbers:** `veh_nDriver[x]` is 1-based (driver 1, 2, etc.)
6. **gen_sForm:** Required even if blank for Home policies (distinguishes Auto from Home)
7. **gen_nClientStatus vs gen_sStatus:** Use exclusively (one or the other, not both)
8. **gen_sDeduct:** Correct spelling per official template. HawkSoft's own Home sample file has a typo `gen_sDecuct` — do NOT copy that.
9. **gen_bDeadBolt:** Correct spelling per official template. HawkSoft's own Home sample file has a typo `gen_bDeadBold` — do NOT copy that.
10. **drv_sSex:** Accepts `M` or `F` (not "Male"/"Female")
