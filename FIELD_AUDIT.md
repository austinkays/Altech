# Altech Toolkit — Field Audit & Gap Analysis

> Generated: 2026-03-10 | Audited files: `js/ezlynx-tool.js`, `js/hawksoft-export.js`, `js/app-core.js`, `js/app-export.js`, `js/app-vehicles.js`

---

## 1. Master Field Inventory

Legend: ✅ = present/mapped | ❌ = missing/not mapped | ⚠️ = partial or manual | — = N/A

### Primary Applicant

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Prefix | `prefix` | ✅ | ✅ `ezPrefix` → `Prefix` (pass-through) | ⚠️ no gen_ field | ✅ | Pass-through in EZLynx; no HawkSoft client prefix field |
| First Name | `firstName` | ✅ | ✅ `ezFirstName` → `gen_sFirstName` | ✅ `gen_sFirstName` | ✅ | |
| Middle Name | `middleName` | ✅ | ✅ `ezMiddleName` → `MiddleName` | ✅ `gen_cInitial` (initial only) | ✅ | HawkSoft takes only first initial |
| Last Name | `lastName` | ✅ | ✅ `ezLastName` → `gen_sLastName` | ✅ `gen_sLastName` | ✅ | |
| Suffix | `suffix` | ✅ | ✅ `ezSuffix` → `Suffix` (pass-through) | ⚠️ no gen_ field | ✅ | Pass-through in EZLynx; no HawkSoft client suffix field |
| Date of Birth | `dob` | ✅ | ✅ `ezDOB` → `DOB` | ✅ client DOB not explicitly mapped but driver DOB is | ✅ | EZLynx reformats via `_fmtDateForEZ()` |
| Gender | `gender` | ✅ | ✅ `ezGender` → `Gender` | ✅ `drv_sSex1` | ✅ | M/F → Male/Female in EZLynx & PDF |
| Marital Status | `maritalStatus` | ✅ | ✅ `ezMaritalStatus` → `MaritalStatus` | ✅ `drv_sMaritalStatus1` | ✅ | |
| Phonetic First | `_docIntelPhoneticFirstName` | ✅ (scan) | ❌ | ❌ | ❌ | Scan metadata only; never exported |
| Phonetic Last | `_docIntelPhoneticLastName` | ✅ (scan) | ❌ | ❌ | ❌ | Scan metadata only; never exported |
| SSN | *(not collected)* | ❌ | ❌ | ❌ `drv_sSSNum` (blank) | ❌ | Intentionally omitted for security |

### Contact Information

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Email | `email` | ✅ | ✅ `ezEmail` → `Email` | ✅ `gen_sEmail` | ✅ | |
| Phone | `phone` | ✅ | ✅ `ezPhone` → `Phone` | ✅ `gen_sPhone` | ✅ | |
| Cell Phone | *(not separate)* | ❌ | ❌ | ✅ `gen_sCellPhone` | ❌ | HawkSoft has separate cell; we collect only one phone |
| Work Phone | *(not collected)* | ❌ | ❌ | ✅ `gen_sWorkPhone` | ❌ | Not collected at all |
| Work Email | *(not collected)* | ❌ | ❌ | ✅ `gen_sEmailWork` | ❌ | Not collected at all |
| Street Address | `addrStreet` | ✅ | ✅ `ezAddress` → `Address` | ✅ `gen_sAddress1` | ✅ | |
| City | `addrCity` | ✅ | ✅ `ezCity` → `City` | ✅ `gen_sCity` | ✅ | |
| State | `addrState` | ✅ | ✅ `ezState` → `State` | ✅ `gen_sState` | ✅ | |
| ZIP Code | `addrZip` | ✅ | ✅ `ezZip` → `Zip` | ✅ `gen_sZip` | ✅ | Stripped to 5 digits |
| County | `county` | ✅ (auto) | ✅ `ezCounty` → `County` | ✅ `gen_sCounty` | ✅ | Auto-derived from City/State |
| Years at Address | `yearsAtAddress` | ✅ | ✅ `ezYearsAtAddress` → `YearsAtAddress` | ⚠️ not in gen_ fields | ✅ | Missing from HawkSoft CMSMTF |
| Months at Address | `monthsAtAddress` | ✅ | ✅ → `MonthsAtAddress` (pass-through) | ❌ | ❌ | Not in HawkSoft or PDF |

### Employment & Education

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Education Level | `education` | ✅ | ✅ `ezEducation` → `Education` | ✅ `drv_sEducation1` | ✅ | |
| Occupation | `occupation` | ✅ | ✅ `ezOccupation` → `Occupation` | ✅ `drv_sDriversOccupation1` | ✅ | |
| Industry | `industry` | ✅ | ✅ `ezIndustry` → `Industry` | ✅ `drv_sIndustry1` | ✅ | |
| Occupation Years | *(not collected)* | ❌ | ✅ `OccupationYears` in co-app object | ❌ | ❌ | EZLynx co-app object has it; not collected |

### Co-Applicant

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Co-App First Name | `coFirstName` | ✅ | ✅ → CoApplicant.FirstName | ⚠️ no dedicated block | ✅ | |
| Co-App Last Name | `coLastName` | ✅ | ✅ → CoApplicant.LastName | ⚠️ no dedicated block | ✅ | |
| Co-App Middle Name | *(not collected)* | ❌ | ✅ → CoApplicant.MiddleName (from appData) | ❌ | ❌ | Uses primary applicant's middleName |
| Co-App DOB | `coDob` | ✅ | ✅ → CoApplicant.DOB | ❌ | ✅ | |
| Co-App Gender | `coGender` | ✅ | ✅ → CoApplicant.Gender | ❌ | ✅ | |
| Co-App Relationship | `coRelationship` | ✅ | ✅ → CoApplicant.Relationship | ❌ | ✅ | |
| Co-App Email | `coEmail` | ✅ | ✅ → CoApplicant.Email | ❌ | ✅ | |
| Co-App Phone | `coPhone` | ✅ | ✅ → CoApplicant.Phone | ❌ | ✅ | |
| Co-App Education | `coEducation` | ✅ | ✅ → CoApplicant.Education | ❌ | ✅ | |
| Co-App Occupation | `coOccupation` | ✅ | ✅ → CoApplicant.Occupation | ❌ | ✅ | |
| Co-App Industry | `coIndustry` | ✅ | ✅ → CoApplicant.Industry | ❌ | ✅ | |
| Co-App Suffix | *(not collected)* | ❌ | ✅ → CoApplicant.Suffix (uses primary suffix) | ❌ | ❌ | Bug: always copies primary applicant's suffix |
| Co-App Prefix | *(not collected)* | ❌ | ❌ | ❌ | ❌ | Not collected for co-applicant |
| Co-App SSN | *(not collected)* | ❌ | ❌ | ❌ | ❌ | Intentionally omitted |

### Property — Physical Characteristics

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Street Address | `addrStreet` | ✅ | ✅ | ✅ `gen_sAddress1` | ✅ | Shared with primary applicant |
| City | `addrCity` | ✅ | ✅ | ✅ `gen_sCity` | ✅ | |
| State | `addrState` | ✅ | ✅ | ✅ `gen_sState` | ✅ | |
| ZIP | `addrZip` | ✅ | ✅ | ✅ `gen_sZip` | ✅ | |
| County | `county` | ✅ | ✅ | ✅ `gen_sCounty` | ✅ | |
| Dwelling Usage | `dwellingUsage` | ✅ | ✅ `ezDwellingUsage` | ❌ | ✅ | Not in HawkSoft CMSMTF |
| Occupancy Type | `occupancyType` | ✅ | ✅ `ezOccupancyType` | ✅ `gen_sOccupancyType` | ✅ | |
| Dwelling Type | `dwellingType` | ✅ | ✅ `ezDwellingType` | ❌ | ✅ | Not in HawkSoft CMSMTF |
| Stories | `numStories` | ✅ | ✅ `ezNumStories` | ❌ | ✅ | |
| Bedrooms | `bedrooms` | ✅ | ✅ `ezBedrooms` | ❌ | ✅ | |
| Full Bathrooms | `fullBaths` | ✅ | ✅ `ezNumFullBaths` | ❌ | ✅ | |
| Half Bathrooms | `halfBaths` | ✅ | ✅ `ezNumHalfBaths` | ❌ | ❌ | Not in HawkSoft or PDF |
| Square Footage | `sqFt` | ✅ | ✅ `ezSqFt` | ❌ | ✅ | |
| Year Built | `yrBuilt` | ✅ | ✅ `ezYearBuilt` | ✅ `gen_nYearBuilt` | ✅ | |
| Lot Size | `lotSize` | ✅ | ✅ `ezLotSize` | ❌ | ✅ | |
| Occupants | `numOccupants` | ✅ | ✅ `ezNumOccupants` | ✅ `gen_nAdditionalRes` | ✅ | HawkSoft maps to additionalRes |
| Purchase Date | `purchaseDate` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Years at Address | `yearsAtAddress` | ✅ | ✅ `ezYearsAtAddress` | ❌ | ✅ | |
| Construction Style | `constructionStyle` | ✅ | ✅ `ezConstructionStyle` | ✅ `gen_sConstruction` | ✅ | |
| Exterior Walls | `exteriorWalls` | ✅ | ✅ `ezExteriorWalls` | ❌ | ✅ | Not in HawkSoft CMSMTF |
| Foundation Type | `foundation` | ✅ | ✅ `ezFoundationType` | ❌ | ✅ | App.data key is `foundation` |
| Kitchen/Bath Quality | `kitchenQuality` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Garage Type | `garageType` | ✅ | ✅ `ezGarageType` | ❌ | ✅ | |
| Garage Spaces | `garageSpaces` | ✅ | ✅ `ezGarageSpaces` | ❌ | ✅ | |
| Roof Type | `roofType` | ✅ | ✅ `ezRoofType` | ❌ | ✅ | |
| Roof Shape | `roofShape` | ✅ | ✅ `ezRoofDesign` | ❌ | ✅ | |
| Roof Year Updated | `roofYr` | ✅ | ✅ `ezRoofYear` | ❌ | ✅ | |
| Heating Type | `heatingType` | ✅ | ✅ `ezHeatingType` | ❌ | ✅ | |
| Heating Updated | `heatYr` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Cooling | `cooling` | ✅ | ✅ `ezCooling` | ❌ | ✅ | |
| Plumbing Updated | `plumbYr` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Electrical Updated | `elecYr` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Secondary Heating (toggle) | `secondaryHeating` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Sewer | `sewer` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Water Source | `waterSource` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Flooring | `flooring` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Fireplaces | `numFireplaces` | ✅ | ✅ `ezNumFireplaces` | ❌ | ✅ | |

### Property — Safety & Risk Features

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Burglar Alarm | `burglarAlarm` | ✅ | ✅ `ezBurglarAlarm` | ✅ `gen_sBurgAlarm` | ✅ | |
| Fire/Smoke Detection | `fireAlarm` | ✅ | ✅ `ezFireDetection` | ✅ `gen_sFireAlarm` | ✅ | |
| Smoke Detector | `smokeDetector` | ✅ | ✅ `ezSmokeDetector` | ✅ `gen_sSmokeDetector` | ✅ | |
| Sprinklers | `sprinklers` | ✅ | ✅ `ezSprinklerSystem` | ✅ `gen_sSprinkler` | ✅ | |
| Distance to Fire Station | `fireStationDist` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Feet to Fire Hydrant | `fireHydrantFeet` | ✅ | ✅ `ezFeetFromHydrant` | ❌ | ✅ | Key discrepancy: form uses `fireHydrantFeet`, PDF uses `fireHydrantFeet`, EZLynx uses `feetFromHydrant` |
| Protection Class | `protectionClass` | ✅ | ✅ `ezProtectionClass` | ✅ `gen_sProtectionClass` | ✅ | |
| Deadbolt | *(not collected)* | ❌ | ❌ | ✅ `gen_bDeadBolt` | ❌ | HawkSoft field exists; we don't collect |
| Fire Extinguisher | *(not collected)* | ❌ | ❌ | ✅ `gen_bFireExtinguisher` | ❌ | HawkSoft field exists; we don't collect |
| Swimming Pool | `pool` | ✅ | ✅ `ezPool` | ❌ | ✅ | |
| Trampoline | `trampoline` | ✅ | ✅ `ezTrampoline` | ❌ | ✅ | |
| Wood Stove | `woodStove` | ✅ | ✅ (pass-through: sent if !== 'No') | ❌ | ✅ | |
| Tidal Water Distance | `tidalWaterDist` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Dogs/Pets | `dogInfo` | ✅ | ✅ (pass-through: sent as 'Yes' boolean) | ❌ | ✅ | EZLynx only gets boolean 'Yes'; loses breed detail |
| Business on Property | `businessOnProperty` | ✅ | ✅ (pass-through: sent as 'Yes' boolean) | ❌ | ✅ | Same boolean-only issue |

### Home Coverage

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Policy Type (HO3/HO5/etc.) | `homePolicyType` | ✅ | ✅ `ezHomePolicyType` | ⚠️ `gen_sForm` (manual) | ✅ | |
| Dwelling Coverage (Cov A) | `dwellingCoverage` | ✅ | ✅ `ezDwellingCoverage` | ✅ `gen_lCovA` | ✅ | |
| Other Structures (Cov B) | *(not collected)* | ❌ | ❌ | ✅ `gen_lCovB` | ❌ | HawkSoft exports it; we don't collect |
| Personal Property (Cov C) | *(not collected)* | ❌ | ❌ | ✅ `gen_lCovC` | ❌ | HawkSoft exports it; we don't collect |
| Loss of Use (Cov D) | *(not collected)* | ❌ | ❌ | ✅ `gen_lCovD` | ❌ | HawkSoft exports it; we don't collect |
| Personal Liability | `personalLiability` | ✅ | ✅ `ezHomePersonalLiability` | ✅ `gen_sLiability` | ✅ | |
| Medical Payments | `medicalPayments` | ✅ | ✅ `ezHomeMedicalPayments` | ✅ `gen_sMedical` | ✅ | |
| All Perils Deductible | `homeDeductible` / `allPerilsDeductible` | ✅ | ✅ `ezAllPerilsDeductible` | ✅ `gen_sDecuct` | ✅ | Two key names in use; `allPerilsDeductible` in EZLynx, `homeDeductible` in PDF |
| Wind/Hail Deductible | `windDeductible` | ✅ | ✅ `ezWindDeductible` | ✅ `gen_sWindHailDeductible` | ✅ | |
| Theft Deductible | `theftDeductible` | ✅ | ✅ `ezTheftDeductible` | ❌ | ✅ | Not in HawkSoft |
| Mortgagee | `mortgagee` | ✅ | ✅ `ezMortgagee` | ✅ `gen_sLpName1` + address fields | ✅ | HawkSoft splits into name + full address; we only collect name |
| Contents Replacement | *(not collected)* | ❌ | ❌ | ✅ `gen_cContentsReplacement` | ❌ | |
| Home Replacement | *(not collected)* | ❌ | ❌ | ✅ `gen_bHomeReplacement` | ❌ | |

### Home Endorsements

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Increased Replacement Cost | `increasedReplacementCost` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Ordinance or Law % | `ordinanceOrLaw` | ✅ | ✅ (pass-through) | ✅ `gen_lOrdinanceOrLawIncr` | ✅ | |
| Water Backup | `waterBackup` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Loss Assessment | `lossAssessment` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Animal Liability | `animalLiability` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Jewelry/Watches/Furs Limit | `jewelryLimit` | ✅ | ✅ (pass-through) | ✅ `gen_lJewelry` (jewelry only) | ✅ | HawkSoft also has `gen_lFurs`, `gen_lGuns`, `gen_lCameras`, etc.; we only map jewelry |
| Credit Card Coverage | `creditCardCoverage` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Mold Damage | `moldDamage` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Equipment Breakdown | `equipmentBreakdown` | ✅ | ✅ (pass-through, if 'Yes') | ❌ | ✅ | |
| Service Line | `serviceLine` | ✅ | ✅ (pass-through, if 'Yes') | ❌ | ✅ | |
| Earthquake Coverage | `earthquakeCoverage` | ✅ | ✅ (pass-through, if 'Yes') | ✅ `gen_bEarthquake` | ✅ | |
| Earthquake Zone | `earthquakeZone` | ✅ | ✅ (pass-through, conditional) | ⚠️ `gen_sEQDeduct` only | ✅ | HawkSoft gets deductible; zone not in CMSMTF |
| Earthquake Deductible | `earthquakeDeductible` | ✅ | ✅ (pass-through, conditional) | ✅ `gen_sEQDeduct` | ✅ | |
| Multi-Policy | *(not collected)* | ❌ | ❌ | ✅ `gen_bMultiPolicy` | ❌ | |
| Furs Limit | *(not separate)* | ❌ | ❌ | ✅ `gen_lFurs` | ❌ | Bundled in jewelryLimit |
| Stamps/Coins/Fine Art/etc. | *(not collected)* | ❌ | ❌ | ✅ multiple `gen_l*` | ❌ | Specialty items; HawkSoft supports them |
| Golf Equipment | *(not collected)* | ❌ | ❌ | ✅ `gen_lGolfEquip` | ❌ | |
| EQ Masonry Veneer | *(not collected)* | ❌ | ❌ | ✅ `gen_bEQMasonryVeneer` | ❌ | |

### Prior Home Insurance

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Home Prior Carrier | `homePriorCarrier` | ✅ | ✅ `ezHomePriorCarrier` | ⚠️ `gen_sCompany` (policy block) | ✅ | |
| Home Prior Policy Term | `homePriorPolicyTerm` | ✅ | ✅ `ezHomePriorPolicyTerm` | ❌ | ✅ | |
| Home Prior Liability | `homePriorLiability` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Home Years w/ Prior | `homePriorYears` | ✅ | ✅ `ezHomePriorYears` | ❌ | ✅ | |
| Home Prior Expiration | `homePriorExp` | ✅ | ✅ `ezHomePriorExp` | ❌ | ✅ | |

### Auto Coverage

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Auto Policy Type | `autoPolicyType` | ✅ | ✅ (pass-through) | ✅ `gen_sTypeOfPolicy` | ✅ | |
| Bodily Injury Limits | `liabilityLimits` | ✅ | ✅ `ezBodilyInjury` | ✅ `gen_sBi` | ✅ | |
| Property Damage Limit | `pdLimit` | ✅ | ✅ `ezPropertyDamage` | ✅ `gen_sPd` | ✅ | |
| UM Limits | `umLimits` | ✅ | ❌ not in ez form fields (only UMPD) | ✅ `gen_sUmBi` | ✅ | UM BI not mapped to EZLynx |
| UIM Limits | `uimLimits` | ✅ | ✅ (pass-through as `UIM`) | ✅ `gen_sUimBi` | ✅ | Pass-through in EZLynx |
| UMPD Limit | `umpdLimit` | ✅ | ✅ (pass-through as `UMPD_PD`) | ✅ `gen_sUmPd` / `veh_sUmpd` | ✅ | EZLynx has `ezUMPD` but it seems to map differently |
| Comprehensive Ded. | `compDeductible` | ✅ | ✅ `ezComprehensive` | ✅ `veh_sComp` (per vehicle) | ✅ | |
| Collision Ded. | `autoDeductible` | ✅ | ✅ `ezCollision` | ✅ `veh_sColl` (per vehicle) | ✅ | |
| Medical Payments | `medPayments` | ✅ | ✅ `ezMedPaymentsAuto` | ✅ `gen_sMedical` | ✅ | |
| UM PD | `umpdLimit` | ✅ | ✅ `ezUMPD` | ✅ `veh_sUmpd` | ✅ | |
| UIM PD | *(not in form)* | ❌ | ❌ | ✅ `veh_sUimpd` | ❌ | HawkSoft has UIM PD per vehicle; we don't collect |
| Rental Reimbursement | `rentalDeductible` | ✅ | ✅ (pass-through) | ✅ `veh_sRentRemb` | ✅ | |
| Towing & Labor | `towingDeductible` | ✅ | ✅ (pass-through) | ✅ `veh_sTowing` | ✅ | |
| Residence Is | `residenceIs` | ✅ | ✅ `ezResidenceIs` | ❌ | ✅ | |
| PIP | *(not collected)* | ❌ | ❌ | ✅ `gen_sPip` | ❌ | PIP not in form at all |
| PIP Deductible | *(not collected)* | ❌ | ❌ | ✅ `gen_sPipDeduct` | ❌ | |
| Number of Residents | `numResidents` | ✅ | ✅ `ezNumResidents` | ❌ | ❌ | Not in PDF either |

### Prior Auto Insurance

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Prior Auto Carrier | `priorCarrier` | ✅ | ✅ `ezPriorCarrier` | ✅ `gen_sCompany` | ✅ | |
| Same-as-Home Carrier | `sameAsHomeCarrier` | ✅ | ⚠️ logic only | ⚠️ logic only | ❌ | UI convenience only; not exported as a field |
| Prior Auto Policy Term | `priorPolicyTerm` | ✅ | ✅ `ezPriorPolicyTerm` | ❌ | ✅ | |
| Prior Yrs w/ Carrier | `priorYears` | ✅ | ✅ `ezPriorYearsWithCarrier` | ❌ | ✅ | |
| Prior Auto Liability Limits | `priorLiabilityLimits` | ✅ | ✅ `ezPriorLiabilityLimits` | ❌ | ✅ | |
| Years Continuous Coverage | `continuousCoverage` | ✅ | ✅ `ezYearsContinuousCoverage` | ❌ | ✅ | |
| Prior Auto Expiration | `priorExp` | ✅ | ✅ (pass-through) | ❌ | ✅ | |

### Policy Details

| Field Label | `App.data` Key | In Form? | EZLynx (`ez*`) | HawkSoft CMSMTF | In PDF? | Notes |
|---|---|---|---|---|---|---|
| Policy Term | `policyTerm` | ✅ | ✅ `ezPolicyTerm` | ✅ `gen_nTerm` | ✅ | |
| Effective Date | `effectiveDate` | ✅ | ✅ `ezEffectiveDate` | ✅ `gen_tEffectiveDate` | ✅ | |
| Additional Insureds | `additionalInsureds` | ✅ | ✅ (pass-through) | ❌ | ✅ | Not exported to HawkSoft |
| Best Time to Contact | `contactTime` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Preferred Contact Method | `contactMethod` | ✅ | ✅ (pass-through) | ❌ | ✅ | |
| Lead/Referral Source | `referralSource` | ✅ | ✅ (pass-through as `LeadSource`) | ✅ `gen_sLeadSource` | ✅ | |
| TCPA Consent | `tcpaConsent` | ✅ | ❌ | ❌ | ✅ | Collected but not exported anywhere |
| Producer | *(not collected)* | ❌ | ❌ | ✅ `gen_sProducer` | ❌ | Manual in HawkSoft export UI |
| Agency ID | *(not collected)* | ❌ | ❌ | ✅ `gen_sAgencyID` | ❌ | Manual in HawkSoft export UI |
| Policy Number | *(not collected)* | ❌ | ❌ | ✅ `gen_sPolicyNumber` | ❌ | Manual in HawkSoft export UI |
| Total Premium | *(not collected)* | ❌ | ❌ | ✅ `gen_dTotal` | ❌ | Manual in HawkSoft export UI |
| Filing/Policy/Broker Fees | *(not collected)* | ❌ | ❌ | ✅ multiple fee fields | ❌ | Manual in HawkSoft export UI |

### Drivers (Per-Driver Fields)

| Field Label | Driver Object Key | In Form? | EZLynx Driver Object | HawkSoft `drv_*` | In PDF? | Notes |
|---|---|---|---|---|---|---|
| First Name | `firstName` | ✅ | ✅ `FirstName` | ✅ `drv_sFirstName` | ✅ | |
| Last Name | `lastName` | ✅ | ✅ `LastName` | ✅ `drv_sLastName` | ✅ | |
| Middle Initial | *(not collected)* | ❌ | ❌ | ✅ `drv_cInitial` | ❌ | Not collected per driver |
| Date of Birth | `dob` | ✅ | ✅ `DOB` | ✅ `drv_tBirthDate` | ✅ | |
| Gender | `gender` | ✅ | ✅ `Gender` (M→Male, F→Female) | ✅ `drv_sSex` | ✅ | |
| Marital Status | `maritalStatus` | ✅ | ✅ `MaritalStatus` | ✅ `drv_sMaritalStatus` | ✅ | |
| Relationship | `relationship` | ✅ | ✅ `Relationship` | ✅ `drv_sRelationship` | ✅ | |
| Occupation | `occupation` | ✅ | ✅ `Occupation` | ✅ `drv_sDriversOccupation` | ✅ | |
| Industry | `industry` | ✅ | ✅ (via appData for primary) | ✅ `drv_sIndustry` | ✅ | |
| Education | `education` | ✅ | ✅ `Education` | ✅ `drv_sEducation` | ✅ | |
| Driver License # | `dlNum` | ✅ | ✅ `LicenseNumber` | ✅ `drv_sLicenseNum` | ✅ | Stored UPPERCASE |
| DL State | `dlState` | ✅ | ✅ `DLState` | ✅ `drv_sLicensingState` | ✅ | Default WA |
| DL Status | `dlStatus` | ✅ | ✅ `LicenseStatus` | ✅ `drv_sDLStatus` | ✅ | |
| Age Licensed | `ageLicensed` | ✅ | ✅ `AgeLicensed` | ✅ `drv_nAgeLicensed` | ✅ | |
| SR-22 Required | `sr22` | ✅ | ✅ `SR22` | ✅ `drv_bFiling` + `drv_sFilingState` | ✅ | |
| SR-22 State | *(not collected)* | ❌ | ❌ | ✅ `drv_sFilingState` | ❌ | |
| SR-22 Reason | *(not collected)* | ❌ | ❌ | ✅ `drv_sFilingReason` | ❌ | |
| FR-44 Required | `fr44` | ✅ | ✅ `FR44` | ❌ | ✅ | HawkSoft has no FR-44 field |
| Good Driver | `goodDriver` | ✅ | ✅ `GoodDriver` | ✅ `drv_bGoodStudent` | ✅ | ⚠️ HawkSoft maps to goodStudent — may be wrong field |
| Mature Driver | `matureDriver` | ✅ | ✅ `MatureDriver` | ❌ | ✅ | Not in HawkSoft |
| Driver Education | `driverEducation` | ✅ | ✅ `DriverEducation` | ✅ `drv_bDriverTraining` | ✅ | |
| Defensive Driver | *(not collected)* | ❌ | ❌ | ✅ `drv_bDefDrvr` | ❌ | HawkSoft field; we don't collect |
| License Susp/Rev | `licenseSusRev` | ✅ | ✅ `LicenseSusRev` | ❌ | ✅ | Not in HawkSoft |
| Accidents (# last 5 yrs) | `accidents` | ✅ | ✅ `Accidents` | ⚠️ `drv_nPoints` | ✅ | HawkSoft stores points not accident count |
| Violations/Tickets | `violations` | ✅ | ✅ (in data object) | ⚠️ `drv_nPoints` | ✅ | Same points field |
| Student GPA | `studentGPA` | ✅ | ✅ (pass-through) | ✅ `drv_bGoodStudent` (boolean) | ✅ | GPA lost — HawkSoft only has a boolean |
| SSN | *(not collected)* | ❌ | ❌ `SSN: ''` | ✅ `drv_sSSNum` (blank) | ❌ | Intentional omission |
| Principal Operator | *(not collected)* | ❌ | ❌ | ✅ `drv_bPrincipleOperator` | ❌ | |
| Only Operator | *(not collected)* | ❌ | ❌ | ✅ `drv_bOnlyOperator` | ❌ | |
| Non-Driver | *(not collected)* | ❌ | ❌ | ✅ `drv_bNonDriver` | ❌ | |
| Excluded | *(not collected)* | ❌ | ❌ | ✅ `drv_bExcluded` | ❌ | |
| Date Licensed | *(not collected)* | ❌ | ❌ | ✅ `drv_tDateLicensed` | ❌ | |
| Hired Date | *(not collected)* | ❌ | ❌ | ✅ `drv_tHiredDate` | ❌ | Commercial only |
| CDL Date | *(not collected)* | ❌ | ❌ | ✅ `drv_tDateOfCDL` | ❌ | Commercial only |
| Points | *(not collected)* | ❌ | ❌ | ✅ `drv_nPoints` | ❌ | |

### Vehicles (Per-Vehicle Fields)

| Field Label | Vehicle Object Key | In Form? | EZLynx Vehicle Object | HawkSoft `veh_*` | In PDF? | Notes |
|---|---|---|---|---|---|---|
| VIN | `vin` | ✅ | ✅ `VIN` | ✅ `veh_sVIN` | ✅ | UPPERCASE |
| Year | `year` | ✅ | ✅ `Year` | ✅ `veh_sYr` | ✅ | |
| Make | `make` | ✅ | ✅ `Make` | ✅ `veh_sMake` (UPPERCASE) | ✅ | |
| Model | `model` | ✅ | ✅ `Model` | ✅ `veh_sModel` | ✅ | |
| Primary Use | `use` | ✅ | ✅ `Use` | ✅ `veh_sUse` | ✅ | |
| Annual Mileage | `annualMiles` | ✅ | ✅ `AnnualMiles` | ✅ `veh_lMileage` | ✅ | |
| Ownership | `ownership` | ✅ | ✅ `Ownership` | ❌ | ❌ | Not in HawkSoft or PDF |
| Performance | *(not collected in vehicle obj)* | ✅ (form) | ✅ `Performance` | ❌ | ❌ | Collected in EZLynx form but not in App.vehicles[] |
| Anti-Theft | *(not in vehicle obj)* | ✅ (form) | ✅ `AntiTheft` | ❌ | ❌ | Collected in EZLynx form; missing from App.vehicles[] |
| Passive Restraints | *(not in vehicle obj)* | ✅ (form) | ✅ `PassiveRestraints` | ❌ | ❌ | |
| Anti-Lock Brakes | *(not in vehicle obj)* | ✅ (form) | ✅ `AntiLockBrakes` | ❌ | ❌ | |
| Daytime Running Lights | *(not in vehicle obj)* | ✅ (form) | ✅ `DaytimeRunningLights` | ❌ | ❌ | |
| Was Car New | *(not in vehicle obj)* | ✅ (form) | ✅ `NewVehicle` | ❌ | ❌ | |
| Telematics | `telematics` (?) | ✅ | ✅ `Telematics` | ❌ | ❌ | |
| Car Pool | *(not in vehicle obj)* | ✅ (form) | ✅ `CarPool` | ❌ | ❌ | |
| Rideshare (TNC) | *(not in vehicle obj)* | ✅ (form) | ✅ `TNC` | ❌ | ❌ | |
| Primary Driver | `primaryDriver` | ✅ | ✅ `PrimaryDriver` | ✅ `veh_nDriver` | ❌ | |
| Garaging ZIP | `garageZip` | ✅ | ✅ `GaragingZip` | ✅ `veh_sGaragingZip` | ❌ | |
| Garaging Address | *(not collected)* | ❌ | ✅ `GaragingAddress` | ✅ `gen_sGAddress` | ❌ | |
| Garaging City | *(not collected)* | ❌ | ✅ `GaragingCity` | ✅ `gen_sGCity` | ❌ | |
| Garaging State | *(not collected)* | ❌ | ✅ `GaragingState` | ✅ `gen_sGState` | ❌ | |
| Comp Deductible | *(per policy)* | ✅ | ✅ `ezComprehensive` | ✅ `veh_sComp` | ✅ | Set per policy, applied per vehicle |
| Coll Deductible | *(per policy)* | ✅ | ✅ `ezCollision` | ✅ `veh_sColl` | ✅ | |
| Towing | `towingDeductible` | ✅ | ✅ (pass-through) | ✅ `veh_sTowing` | ✅ | |
| Rental | `rentalDeductible` | ✅ | ✅ (pass-through) | ✅ `veh_sRentRemb` | ✅ | |
| Loss Payee | *(not collected)* | ❌ | ❌ | ✅ `veh_bLossPayee` + name/addr | ❌ | |
| Additional Interest | *(not collected)* | ❌ | ❌ | ✅ `veh_bAdditionalInterest` | ❌ | |
| Vehicle Type | *(not collected)* | ❌ | ❌ | ✅ `veh_sVehicleType` | ❌ | |
| 4WD | *(not collected)* | ❌ | ❌ | ✅ `veh_bFourWD` | ❌ | |
| GVW | *(not collected)* | ❌ | ❌ | ✅ `veh_nGVW` | ❌ | |
| Symbol | *(not collected)* | ❌ | ❌ | ✅ `veh_sSymb` | ❌ | Rating symbol; not intake data |
| Commute Mileage | `commuteMiles` (?) | ✅ | ✅ `CommuteMileage`? | ✅ `veh_nCommuteMileage` | ❌ | |

---

## 2. Quoting Form — All Fields by Step

### Step 1: Policy Scan (Smart Scan / DocIntel)
| Field | Input Type | Notes |
|---|---|---|
| Smart Scan upload | File (image/PDF) | DocIntel API; populates form fields |
| Driver License upload | File (image) | DocIntel API; populates driver fields |

### Step 2: Coverage Type
| Field | Input Type | Options |
|---|---|---|
| Coverage Type | Radio / Card select | Home, Auto, Home & Auto |

### Step 3: Client Info (`step-1`)
**Primary Applicant:**
| Field | Input Type | Element Key |
|---|---|---|
| Prefix | Select | Mr., Mrs., Ms., Dr., Rev., Prof., |
| First Name | Text | `firstName` |
| Middle Name | Text | `middleName` |
| Last Name | Text | `lastName` |
| Suffix | Select | Jr., Sr., II, III, IV, Esq. |
| Date of Birth | Date | `dob` |
| Gender | Select/Radio | Male, Female, Non-Binary |
| Marital Status | Select | Single, Married, Divorced, Widowed, Separated |
| Email | Email | `email` |
| Phone | Tel | `phone` |
| Phonetic First Name | Text | `_docIntelPhoneticFirstName` |
| Phonetic Last Name | Text | `_docIntelPhoneticLastName` |
| Education Level | Select | No HS Diploma, HS Diploma/GED, Some College, Associate's, Bachelor's, Master's, Doctorate, Professional |
| Occupation | Text | `occupation` |
| Industry | Select | ~20 industry categories |

**Co-Applicant (toggled):**
| Field | Input Type | Element Key |
|---|---|---|
| Co-App First Name | Text | `coFirstName` |
| Co-App Last Name | Text | `coLastName` |
| Co-App DOB | Date | `coDob` |
| Co-App Gender | Select | Male, Female, Non-Binary |
| Co-App Email | Email | `coEmail` |
| Co-App Phone | Tel | `coPhone` |
| Relationship | Select | Spouse, Parent, Child, Sibling, Other |
| Co-App Education | Select | Same as primary |
| Co-App Occupation | Text | `coOccupation` |
| Co-App Industry | Select | `coIndustry` |

### Step 4: Property (`step-3`)
**Property Address:**
| Field | Input Type | Notes |
|---|---|---|
| Street | Text | `addrStreet` |
| City | Text | `addrCity` |
| State | Select | `addrState` |
| ZIP | Text | `addrZip` |
| County | Text (auto) | `county` — auto-derived |

**Dwelling Details:**
| Field | Options |
|---|---|
| Dwelling Usage | Primary, Secondary, Seasonal, Tenant Occupied, Vacant |
| Occupancy Type | Owner, Tenant, Renter |
| Dwelling Type | Single Family, Condo, Townhouse, Mobile Home, Multi-Family |
| Stories | 1, 1.5, 2, 2.5, 3, 4+ |
| Bedrooms | 1–8+ |
| Full Bathrooms | 1–7+ |
| Half Bathrooms | 0–4+ |
| Square Footage | Number |
| Year Built | Number |
| Lot Size | Number (acres) |
| Occupants | Number |
| Purchase Date | Date |
| Years at Address | Number |
| Construction Style | Wood Frame, Brick Veneer, Brick/Stone, Log, Other |
| Exterior Walls | Vinyl Siding, Wood Siding, Brick, Stucco, Other |
| Foundation Type | Slab, Crawl Space, Basement, Pier, Other |
| Kitchen/Bath Quality | Basic, Standard, Semi-Custom, Custom |
| Garage Type | None, Attached, Detached, Carport |
| Garage Spaces | 0–4+ |
| Roof Type | Asphalt Shingle, Metal, Tile, Wood Shake, Other |
| Roof Shape | Gable, Hip, Flat, Other |
| Roof Year Updated | Number |
| Heating Type | Gas, Electric, Oil, Heat Pump, Other |
| Heating Year Updated | Number |
| Cooling | Central, Window, None |
| Plumbing Year Updated | Number |
| Electrical Year Updated | Number |
| Secondary Heating (toggle) | Yes/No |
| Secondary Heating Type | Wood, Gas, Electric, Other |
| Sewer | Public, Septic, Other |
| Water Source | Public, Well, Other |
| Flooring | Hardwood, Carpet, Tile, Laminate, Mixed |
| Fireplaces | 0–5+ |
| Distance to Fire Station | Miles |
| Feet to Fire Hydrant | Feet |
| Protection Class | 1–13 |

**Safety Features:**
| Field | Type |
|---|---|
| Burglar Alarm | Select (None, Local, Central, Phone) |
| Fire/Smoke Detection | Select |
| Sprinklers | Select |
| Smoke Detector | Select |
| Pool | Select (Yes/No) |
| Trampoline | Select (Yes/No) |
| Wood Stove | Select |
| Tidal Water Distance | Feet |
| Dogs/Pets | Text / breed info |
| Business on Property | Yes/No |

**Home Coverage:**
| Field | Options/Type |
|---|---|
| Policy Type | HO3, HO5, HO6, HO4, DP1, DP3 |
| Dwelling Coverage (Cov A) | Dollar amount |
| Personal Liability | Dollar amount |
| Medical Payments | Dollar amount |
| All Perils Deductible | Dollar/% |
| Wind/Hail Deductible | Dollar/% |
| Mortgagee | Text |
| Increased Replacement Cost % | % |
| Ordinance or Law % | % |
| Water Backup | Yes/Dollar |
| Loss Assessment | Dollar |
| Animal Liability | Dollar |
| Theft Deductible | Dollar |
| Jewelry/Watches/Furs Limit | Dollar |
| Credit Card Coverage | Dollar |
| Mold Damage | Dollar |
| Equipment Breakdown | Yes/No |
| Service Line | Yes/No |
| Earthquake (toggle) | Yes/No |
| Earthquake Zone | Text |
| Earthquake Deductible | Dollar/% |

### Step 5: Drivers & Vehicles (`step-4`)
**Per Driver:**
| Field | Options/Type |
|---|---|
| First Name | Text |
| Last Name | Text |
| Date of Birth | Date |
| Relationship | Self, Spouse, Child, Parent, Sibling, Other |
| Gender | Male, Female |
| Marital Status | Single, Married, Divorced, Widowed |
| Occupation | Text |
| Industry | Select |
| Education | Select |
| DL Status | Valid, Permit, Expired, Suspended, Cancelled, Not Licensed, Permanently Revoked |
| Age Licensed | Number |
| SR-22 Required | Yes/No |
| FR-44 Required | Yes/No |
| Good Driver | Yes/No |
| Mature Driver | Yes/No |
| License Suspended/Revoked | Yes/No |
| Driver Education | Yes/No |
| Driver's License # | Text |
| Accidents (last 5 yrs) | Number/Text |
| Violations/Tickets (last 3 yrs) | Number/Text |
| Student GPA | Number |

**Per Vehicle:**
| Field | Options/Type |
|---|---|
| VIN | Text (optional, decoded via NHTSA) |
| Year | Number |
| Make | Text |
| Model | Text |
| Primary Use | Pleasure, To-From Work, School, Business, Farming |
| Annual Mileage | Number |
| Ownership | Owned, Leased, Lien |
| Performance | Standard, Sports, Intermediate, High |
| Anti-Theft | Yes/No/Type |
| Passive Restraints | Yes/No |
| Anti-Lock Brakes | Yes/No |
| Daytime Running Lights | Yes/No |
| Was Car New | Yes/No |
| Telematics | Yes/No |
| Car Pool | Yes/No |
| Rideshare (TNC) | Yes/No |
| Primary Driver | Select (driver list) |
| Garaging ZIP | Text |

**Auto Coverage:**
| Field | Options/Type |
|---|---|
| Auto Policy Type | Standard, Non-Owners, Broad Form |
| Residence Is | Own, Rent, Other |
| BI Limits | Select (e.g., 50/100, 100/300, 250/500) |
| PD Limit | Dollar |
| UM | Select |
| UIM | Select |
| Comprehensive Deductible | Select |
| Collision Deductible | Select |
| Medical Payments | Dollar |
| UM Property Damage | Dollar |
| Rental Reimbursement | Dollar/Day |
| Towing & Labor | Dollar |

### Step 6: Policy Details (`step-5`)
| Field | Type/Options |
|---|---|
| Requested Policy Term | 6 Month, 12 Month |
| Effective Date | Date |
| Prior Home Carrier | Select (299-carrier list) |
| Home Prior Policy Term | Select |
| Home Prior Liability Level | Select |
| Home Years with Prior Carrier | Number |
| Home Prior Policy Expiration | Date |
| Prior Auto Carrier | Select (same 299-carrier list) |
| Same-as-Home-Carrier | Checkbox |
| Prior Auto Policy Term | Select |
| Prior Auto Liability Limits | Select |
| Auto Years with Prior Carrier | Number |
| Years with Continuous Coverage | Number/Select |
| Prior Auto Expiration | Date |
| Additional Insured Parties | Textarea |
| Best Time to Contact | Select |
| Preferred Contact Method | Select (Phone, Email, Text) |
| Lead/Referral Source | Select |
| TCPA Consent | Checkbox |

### Step 7: Export
| Option | Description |
|---|---|
| EZLynx | Sends data to EZLynx Chrome extension |
| HawkSoft | Generates `.CMSMTF` file download |
| PDF | Generates client summary PDF |

---

## 3. EZLynx Mapping

### Field-to-Field Mapping Summary

| Form Field | App.data Key | EZLynx Form ID | EZLynx Output Key | Transformation |
|---|---|---|---|---|
| First Name | `firstName` | `ezFirstName` | `FirstName` | None |
| Last Name | `lastName` | `ezLastName` | `LastName` | None |
| Middle Name | `middleName` | `ezMiddleName` | `MiddleName` | None |
| Date of Birth | `dob` | `ezDOB` | `DOB` | `_fmtDateForEZ()` |
| Gender | `gender` | `ezGender` | `Gender` | M→Male, F→Female |
| Marital Status | `maritalStatus` | `ezMaritalStatus` | `MaritalStatus` | None |
| Email | `email` | `ezEmail` | `Email` | None |
| Phone | `phone` | `ezPhone` | `Phone` | None |
| Street | `addrStreet` | `ezAddress` | `Address` | None |
| City | `addrCity` | `ezCity` | `City` | None |
| State | `addrState` | `ezState` | `State` | None |
| ZIP | `addrZip` | `ezZip` | `Zip` | Strip to 5 digits |
| County | `county` | `ezCounty` | `County` | Auto-derived |
| Years at Address | `yearsAtAddress` | `ezYearsAtAddress` | `YearsAtAddress` | None |
| Education | `education` | `ezEducation` | `Education` | None |
| Occupation | `occupation` | `ezOccupation` | `Occupation` | None |
| Industry | `industry` | `ezIndustry` | `Industry` | None |
| Policy Term | `policyTerm` | `ezPolicyTerm` | `PolicyTerm` | None |
| Prior Carrier | `priorCarrier` | `ezPriorCarrier` | `PriorCarrier` | None |
| Prior Policy Term | `priorPolicyTerm` | `ezPriorPolicyTerm` | `PriorPolicyTerm` | None |
| Prior Yrs w/ Carrier | `priorYears` | `ezPriorYearsWithCarrier` | `PriorYearsWithCarrier` | None |
| Effective Date | `effectiveDate` | `ezEffectiveDate` | `EffectiveDate` | None |
| BI Limits | `liabilityLimits` | `ezBodilyInjury` | `BodilyInjury` | None |
| PD Limit | `pdLimit` | `ezPropertyDamage` | `PropertyDamage` | None |
| Comprehensive Ded. | `compDeductible` | `ezComprehensive` | `Comprehensive` | None |
| Collision Ded. | `autoDeductible` | `ezCollision` | `Collision` | None |
| Med Pay (Auto) | `medPayments` | `ezMedPaymentsAuto` | `MedPaymentsAuto` | None |
| UMPD | `umpdLimit` | `ezUMPD` | `UMPD` | None |
| Prior Liability | `priorLiabilityLimits` | `ezPriorLiabilityLimits` | `PriorLiabilityLimits` | None |
| Continuous Coverage | `continuousCoverage` | `ezYearsContinuousCoverage` | `YearsContinuousCoverage` | None |
| Num Residents | `numResidents` | `ezNumResidents` | `NumResidents` | None |
| Residence Is | `residenceIs` | `ezResidenceIs` | `ResidenceIs` | None |
| DL State | `dlState` | `ezDLState` | `DLState` | None |
| Age Licensed | `ageLicensed` | `ezAgeLicensed` | `AgeLicensed` | None |
| VIN | `vin` (vehicle) | `ezVIN` | `VIN` | None |
| Vehicle Year | `year` (vehicle) | `ezVehicleYear` | `VehicleYear` | None |
| Vehicle Make | `make` (vehicle) | `ezVehicleMake` | `VehicleMake` | None |
| Vehicle Model | `model` (vehicle) | `ezVehicleModel` | `VehicleModel` | None |
| Vehicle Use | `use` (vehicle) | `ezVehicleUse` | `VehicleUse` | None |
| Annual Miles | `annualMiles` (vehicle) | `ezAnnualMiles` | `AnnualMiles` | None |
| Ownership Type | `ownership` (vehicle) | `ezOwnershipType` | `OwnershipType` | None |
| Dwelling Usage | `dwellingUsage` | `ezDwellingUsage` | `DwellingUsage` | None |
| Occupancy Type | `occupancyType` | `ezOccupancyType` | `OccupancyType` | None |
| Dwelling Type | `dwellingType` | `ezDwellingType` | `DwellingType` | None |
| Stories | `numStories` | `ezNumStories` | `NumStories` | None |
| Construction | `constructionStyle` | `ezConstructionStyle` | `ConstructionStyle` | None |
| Exterior Walls | `exteriorWalls` | `ezExteriorWalls` | `ExteriorWalls` | None |
| Foundation | `foundation` | `ezFoundationType` | `FoundationType` | None |
| Roof Type | `roofType` | `ezRoofType` | `RoofType` | None |
| Roof Shape | `roofShape` | `ezRoofDesign` | `RoofDesign` | None |
| Roof Year | `roofYr` | `ezRoofYear` | `RoofYear` | None |
| Heating Type | `heatingType` | `ezHeatingType` | `HeatingType` | None |
| Cooling | `cooling` | `ezCooling` | `Cooling` | None |
| Burglar Alarm | `burglarAlarm` | `ezBurglarAlarm` | `BurglarAlarm` | None |
| Fire Detection | `fireAlarm` | `ezFireDetection` | `FireDetection` | None |
| Sprinkler | `sprinklers` | `ezSprinklerSystem` | `SprinklerSystem` | None |
| Protection Class | `protectionClass` | `ezProtectionClass` | `ProtectionClass` | None |
| Sq Ft | `sqFt` | `ezSqFt` | `SqFt` | None |
| Year Built | `yrBuilt` | `ezYearBuilt` | `YearBuilt` | None |
| Lot Size | `lotSize` | `ezLotSize` | `LotSize` | None |
| Bedrooms | `bedrooms` | `ezBedrooms` | `Bedrooms` | None |
| Smoke Detector | `smokeDetector` | `ezSmokeDetector` | `SmokeDetector` | None |
| Feet to Hydrant | `fireHydrantFeet` | `ezFeetFromHydrant` | `FeetFromHydrant` | None |
| Full Baths | `fullBaths` | `ezNumFullBaths` | `NumFullBaths` | None |
| Half Baths | `halfBaths` | `ezNumHalfBaths` | `NumHalfBaths` | None |
| Occupants | `numOccupants` | `ezNumOccupants` | `NumOccupants` | None |
| Garage Type | `garageType` | `ezGarageType` | `GarageType` | None |
| Garage Spaces | `garageSpaces` | `ezGarageSpaces` | `GarageSpaces` | None |
| Fireplaces | `numFireplaces` | `ezNumFireplaces` | `NumFireplaces` | None |
| Pool | `pool` | `ezPool` | `Pool` | None |
| Trampoline | `trampoline` | `ezTrampoline` | `Trampoline` | None |
| Home Policy Type | `homePolicyType` | `ezHomePolicyType` | `HomePolicyType` | None |
| Home Prior Carrier | `homePriorCarrier` | `ezHomePriorCarrier` | `HomePriorCarrier` | None |
| Home Prior Term | `homePriorPolicyTerm` | `ezHomePriorPolicyTerm` | `HomePriorPolicyTerm` | None |
| Home Prior Years | `homePriorYears` | `ezHomePriorYears` | `HomePriorYears` | None |
| Home Prior Exp. | `homePriorExp` | `ezHomePriorExp` | `HomePriorExp` | None |
| Dwelling Coverage | `dwellingCoverage` | `ezDwellingCoverage` | `DwellingCoverage` | None |
| Liability | `personalLiability` | `ezHomePersonalLiability` | `HomePersonalLiability` | None |
| Med Pay (Home) | `medicalPayments` | `ezHomeMedicalPayments` | `HomeMedicalPayments` | None |
| All Perils Ded. | `allPerilsDeductible` / `homeDeductible` | `ezAllPerilsDeductible` | `AllPerilsDeductible` | None |
| Theft Ded. | `theftDeductible` | `ezTheftDeductible` | `TheftDeductible` | None |
| Wind Ded. | `windDeductible` | `ezWindDeductible` | `WindDeductible` | None |
| Mortgagee | `mortgagee` | `ezMortgagee` | `Mortgagee` | None |

### Pass-Through Fields (Collected in Form, NOT Auto-Filled on EZLynx Page, Bundled in Payload)

These fields are included in the JSON payload sent to the extension but are NOT auto-filled into the EZLynx web form — they're available for manual reference:

| Field | App.data Key | Pass-Through Key |
|---|---|---|
| Prefix | `prefix` | `Prefix` |
| Suffix | `suffix` | `Suffix` |
| Auto Policy Type | `autoPolicyType` | `AutoPolicyType` |
| UIM Limits | `uimLimits` | `UIM` |
| UMPD Limit | `umpdLimit` | `UMPD_PD` |
| Rental Reimbursement | `rentalDeductible` | `RentalReimbursement` |
| Towing & Labor | `towingDeductible` | `TowingLabor` |
| Student GPA | `studentGPA` | `StudentGPA` |
| Prior Expiration | `priorExp` | `PriorExpiration` |
| Purchase Date | `purchaseDate` | `PurchaseDate` |
| Secondary Heating | `secondaryHeating` | `SecondaryHeating` |
| Kitchen Quality | `kitchenQuality` | `KitchenQuality` |
| Sewer | `sewer` | `Sewer` |
| Water Source | `waterSource` | `WaterSource` |
| Flooring | `flooring` | `Flooring` |
| Fire Station Dist. | `fireStationDist` | `FireStationDist` |
| Tidal Water Dist. | `tidalWaterDist` | `TidalWaterDist` |
| Heating Update Year | `heatYr` | `HeatingUpdateYear` |
| Plumbing Update Year | `plumbYr` | `PlumbingUpdateYear` |
| Electrical Update Year | `elecYr` | `ElectricalUpdateYear` |
| Roof Update Year | `roofYr` | `RoofUpdateYear` |
| Wood Stove | `woodStove` | `WoodStove` |
| Dogs on Premises | `dogInfo` | `DogOnPremises` (boolean only) |
| Business on Premises | `businessOnProperty` | `BusinessOnPremises` (boolean only) |
| Increased Repl. Cost | `increasedReplacementCost` | `IncreasedReplacementCost` |
| Ordinance or Law | `ordinanceOrLaw` | `OrdinanceOrLaw` |
| Water Backup | `waterBackup` | `WaterBackup` |
| Loss Assessment | `lossAssessment` | `LossAssessment` |
| Animal Liability | `animalLiability` | `AnimalLiability` |
| Jewelry Limit | `jewelryLimit` | `JewelryLimit` |
| Credit Card Coverage | `creditCardCoverage` | `CreditCardCoverage` |
| Mold Damage | `moldDamage` | `MoldDamage` |
| Equipment Breakdown | `equipmentBreakdown` | `EquipmentBreakdown` |
| Service Line | `serviceLine` | `ServiceLine` |
| Earthquake Coverage | `earthquakeCoverage` | `EarthquakeCoverage` |
| Earthquake Zone | `earthquakeZone` | `EarthquakeZone` |
| Earthquake Deductible | `earthquakeDeductible` | `EarthquakeDeductible` |
| Home Prior Liability | `homePriorLiability` | `HomePriorLiability` |
| Contact Time | `contactTime` | `ContactTime` |
| Contact Method | `contactMethod` | `ContactMethod` |
| Lead Source | `referralSource` | `LeadSource` |
| Additional Insureds | `additionalInsureds` | `AdditionalInsureds` |

### Form Fields with NO EZLynx Mapping (Lost Data)
- TCPA Consent (`tcpaConsent`) — never sent
- Phonetic pronunciation fields — internal scan metadata only
- Dog breed detail — reduced to boolean 'Yes'
- Business-on-property detail — reduced to boolean 'Yes'
- UM BI (`umLimits`) — separate from UMPD; not in the ez* form fields
- Cell phone / Work phone — not collected
- Co-applicant prefix/suffix — not collected
- Months at address — pass-through only (not auto-filled)

---

## 4. HawkSoft Export Mapping

### Client Block Mappings

| App.data Key | HawkSoft CMSMTF Field | Notes |
|---|---|---|
| `firstName` | `gen_sFirstName` | |
| `lastName` | `gen_sLastName` | |
| `middleName` | `gen_cInitial` | First initial only |
| `addrStreet` | `gen_sAddress1` | |
| `addrCity` | `gen_sCity` | |
| `addrState` | `gen_sState` | |
| `addrZip` | `gen_sZip` | |
| `phone` | `gen_sPhone` | |
| `email` | `gen_sEmail` | |
| `referralSource` | `gen_sLeadSource` | |
| *DOB — not in gen_ block* | ❌ | Primary applicant DOB not in client block |
| *Prefix/Suffix* | ❌ | No HawkSoft client prefix/suffix fields |
| *Cell/Work Phone* | `gen_sCellPhone` / `gen_sWorkPhone` | Not collected |
| *Work Email* | `gen_sEmailWork` | Not collected |
| *County* | `gen_sCounty` | Auto-derived |

### Policy Block Mappings (Mostly Manual in Export UI)

| App.data Key | HawkSoft CMSMTF Field | Notes |
|---|---|---|
| `effectiveDate` | `gen_tEffectiveDate` | |
| `policyTerm` | `gen_nTerm` | |
| `referralSource` | `gen_sLeadSource` | |
| *(manual)* | `gen_sCompany` | Carrier name; manual entry |
| *(manual)* | `gen_sProducer` | Agent; manual entry |
| *(manual)* | `gen_sPolicyNumber` | Manual entry |
| *(manual)* | `gen_dTotal` | Premium; manual entry |
| *(manual)* | `gen_sAgencyID` | Manual entry |

### Auto Coverage Block

| App.data Key | HawkSoft CMSMTF Field | Notes |
|---|---|---|
| `liabilityLimits` | `gen_sBi` | |
| `pdLimit` | `gen_sPd` | |
| `umLimits` | `gen_sUmBi` | |
| `uimLimits` | `gen_sUimBi` | |
| `umpdLimit` | `gen_sUmPd` / `veh_sUmpd` | Duplicated at policy and vehicle level |
| *UIM PD* | `gen_sUimPd` | Not collected in form |
| `medPayments` | `gen_sMedical` | |
| `autoPolicyType` | `gen_sTypeOfPolicy` | |
| *PIP* | `gen_sPip` | Not collected |
| *PIP Deductible* | `gen_sPipDeduct` | Not collected |

### Home Coverage Block

| App.data Key | HawkSoft CMSMTF Field | Notes |
|---|---|---|
| `yrBuilt` | `gen_nYearBuilt` | |
| `constructionStyle` | `gen_sConstruction` | |
| `burglarAlarm` | `gen_sBurgAlarm` | |
| `fireAlarm` | `gen_sFireAlarm` | |
| `sprinklers` | `gen_sSprinkler` | |
| `smokeDetector` | `gen_sSmokeDetector` | |
| `protectionClass` | `gen_sProtectionClass` | |
| `numOccupants` | `gen_nAdditionalRes` | Mapped to "additional residents" |
| `occupancyType` | `gen_sOccupancyType` | |
| `windDeductible` | `gen_sWindHailDeductible` | |
| `dwellingCoverage` | `gen_lCovA` | |
| *(not collected)* | `gen_lCovB` | Other Structures |
| *(not collected)* | `gen_lCovC` | Personal Property |
| *(not collected)* | `gen_lCovD` | Loss of Use |
| `personalLiability` | `gen_sLiability` | |
| `medicalPayments` | `gen_sMedical` | |
| `homeDeductible` / `allPerilsDeductible` | `gen_sDecuct` | Note: HawkSoft has typo in field name |
| `earthquakeCoverage` | `gen_bEarthquake` | |
| `earthquakeDeductible` | `gen_sEQDeduct` | |
| `ordinanceOrLaw` | `gen_lOrdinanceOrLawIncr` | |
| `mortgagee` | `gen_sLpName1` | Only name; address not collected |
| `jewelryLimit` | `gen_lJewelry` | |
| *(not collected)* | `gen_bDeadBolt` | |
| *(not collected)* | `gen_bFireExtinguisher` | |
| *(not collected)* | `gen_bHomeReplacement` | |
| *(not collected)* | `gen_cContentsReplacement` | |
| *(not collected)* | `gen_bMultiPolicy` | |
| *(not collected)* | `gen_bEQMasonryVeneer` | |
| *(not collected)* | `gen_lFurs`, `gen_lGuns`, `gen_lCameras`, etc. | Specialty items |

### Form Fields NOT Exported to HawkSoft

| Field | App.data Key | Notes |
|---|---|---|
| Prefix / Suffix | `prefix`, `suffix` | No HawkSoft client-level fields |
| Phonetic Names | `_docIntelPhoneticFirst/Last` | Internal only |
| Dwelling Usage | `dwellingUsage` | Not in home block |
| Dwelling Type | `dwellingType` | Not in home block |
| Stories | `numStories` | Not in home block |
| Bedrooms | `bedrooms` | Not in home block |
| Full/Half Baths | `fullBaths`, `halfBaths` | Not in home block |
| Square Footage | `sqFt` | Not in home block |
| Lot Size | `lotSize` | Not in home block |
| Exterior Walls | `exteriorWalls` | Not in home block |
| Foundation | `foundation` | Not in home block |
| Kitchen Quality | `kitchenQuality` | Not in home block |
| Garage Type/Spaces | `garageType`, `garageSpaces` | Not in home block |
| Roof Type/Shape/Year | `roofType`, `roofShape`, `roofYr` | Not in home block |
| Heating Type/Year | `heatingType`, `heatYr` | Not in home block |
| Cooling | `cooling` | Not in home block |
| Plumbing/Elec Year | `plumbYr`, `elecYr` | Not in home block |
| Secondary Heating | `secondaryHeating` | Not in home block |
| Sewer / Water Source | `sewer`, `waterSource` | Not in home block |
| Flooring | `flooring` | Not in home block |
| Fireplaces | `numFireplaces` | Not in home block |
| Fire Station Dist. | `fireStationDist` | Not in home block |
| Feet to Hydrant | `fireHydrantFeet` | Not in home block |
| Tidal Water Dist. | `tidalWaterDist` | Not in home block |
| Pool | `pool` | Not in home block |
| Trampoline | `trampoline` | Not in home block |
| Wood Stove | `woodStove` | Not in home block |
| Dogs/Pets | `dogInfo` | Not in home block |
| Business on Property | `businessOnProperty` | Not in home block |
| Water Backup | `waterBackup` | Not in home block |
| Loss Assessment | `lossAssessment` | Not in home block |
| Animal Liability | `animalLiability` | Not in home block |
| Theft Deductible | `theftDeductible` | Not in home block |
| Credit Card Coverage | `creditCardCoverage` | Not in home block |
| Mold Damage | `moldDamage` | Not in home block |
| Equipment Breakdown | `equipmentBreakdown` | Not in home block |
| Service Line | `serviceLine` | Not in home block |
| Increased Repl. Cost | `increasedReplacementCost` | Not in home block |
| Home Policy Type | `homePolicyType` | Not in home block |
| Home Prior Carrier | `homePriorCarrier` | Not in home block |
| Home Prior Term | `homePriorPolicyTerm` | Not in home block |
| Home Prior Liability | `homePriorLiability` | Not in home block |
| Home Prior Years | `homePriorYears` | Not in home block |
| Home Prior Expiration | `homePriorExp` | Not in home block |
| Purchase Date | `purchaseDate` | Not in home block |
| Years at Address | `yearsAtAddress` | Not in any block |
| Additional Insureds | `additionalInsureds` | Not in any block |
| Contact Time / Method | `contactTime`, `contactMethod` | Not in any block |
| TCPA Consent | `tcpaConsent` | Not exported anywhere |
| FR-44 | `fr44` (driver) | No HawkSoft FR-44 field |
| Mature Driver | `matureDriver` (driver) | No HawkSoft field |
| License Susp/Rev | `licenseSusRev` (driver) | No HawkSoft field |
| Student GPA | `studentGPA` (driver) | GPA lost; HawkSoft uses boolean Good Student |
| Prior Auto Term | `priorPolicyTerm` | Not in policy block |
| Prior Auto Yrs | `priorYears` | Not in policy block |
| Prior Auto Limits | `priorLiabilityLimits` | Not in policy block |
| Continuous Coverage | `continuousCoverage` | Not in policy block |
| Prior Auto Expiration | `priorExp` | Not in policy block |

### HawkSoft Fields That Require Manual Entry
(Fields that exist in the CMSMTF spec but we don't auto-populate from form data)

| HawkSoft Field | CMSMTF Key | Action Required |
|---|---|---|
| Carrier/Company | `gen_sCompany` | Manual entry in export UI |
| Policy Number | `gen_sPolicyNumber` | Manual entry |
| Producer/Agent | `gen_sProducer` | Manual entry |
| Total Premium | `gen_dTotal` | Manual entry |
| Agency ID | `gen_sAgencyID` | Manual entry |
| Policy Office | `gen_lPolicyOffice` | Manual entry |
| Filing Fee | `gen_dFilingFee` | Manual entry |
| Policy Fee | `gen_dPolicyFee` | Manual entry |
| Broker Fee | `gen_dBrokerFee` | Manual entry |
| Program | `gen_sProgram` | Manual entry |
| FSC Notes | `gen_sFSCNotes` | Manual entry |
| Lienholder Address | `gen_sLpAddress1` through `gen_sLpZip1` | We only collect name |
| Cov B / C / D | `gen_lCovB/C/D` | Not collected in form |
| Deadbolt | `gen_bDeadBolt` | Not collected in form |
| Fire Extinguisher | `gen_bFireExtinguisher` | Not collected in form |
| SR-22 State | `drv_sFilingState` | Not collected in form |
| SR-22 Reason | `drv_sFilingReason` | Not collected in form |
| Defensive Driver | `drv_bDefDrvr` | Not collected in form |
| Excluded Driver | `drv_bExcluded` | Not collected in form |
| Principal Operator | `drv_bPrincipleOperator` | Not collected in form |
| Only Operator | `drv_bOnlyOperator` | Not collected in form |
| Non-Driver | `drv_bNonDriver` | Not collected in form |
| Date Licensed | `drv_tDateLicensed` | Not collected in form |
| Loss Payee | `veh_bLossPayee` + addr | Not collected in form |
| Additional Interest | `veh_bAdditionalInterest` | Not collected in form |
| Vehicle Type | `veh_sVehicleType` | Not collected in form |
| 4WD | `veh_bFourWD` | Not collected in form |

---

## 5. PDF Export Field List

The PDF (`buildPDF()` in `app-export.js`) includes:

### Applicant Section
- Full Name (with prefix/suffix)
- Middle Name
- Date of Birth
- Gender
- Marital Status
- Phone
- Email
- Education
- Industry
- Occupation

### Co-Applicant Section (if present)
- Full Name
- Date of Birth
- Gender
- Email
- Phone
- Relationship
- Occupation
- Education
- Industry

### Contact / Address
- Street Address
- City, State, ZIP
- County
- Years at Address

### Property (if home/both)
- Year Built, Square Footage, Lot Size
- Dwelling Type, Dwelling Use, Occupancy
- Stories, Occupants, Bedrooms, Full Baths, Half Baths
- Construction, Exterior Walls, Foundation
- Garage Type, Garage Spaces
- Kitchen/Bath Quality, Flooring, Fireplaces
- Purchase Date
- Roof Type, Shape, Year Updated
- Heating Type & Year, Cooling
- Plumbing & Electrical Year Updated
- Sewer, Water Source
- Safety: Burglar Alarm, Fire Alarm, Smoke Detector, Sprinklers, Pool, Trampoline, Wood Stove, Secondary Heating
- Dog on Premises, Business on Property
- Fire Station (mi), Fire Hydrant (ft), Tidal Water (ft), Protection Class

### Home Coverage (if home/both)
- Policy Type
- Dwelling Coverage, Personal Liability, Medical Payments
- Deductible, Wind/Hail Ded., Mortgagee
- Increased Repl. Cost, Ordinance or Law, Water Backup, Loss Assessment
- Equipment Breakdown, Service Line, Animal Liability, Earthquake Coverage
- Theft Deductible, Jewelry Limit, Credit Card Coverage, Mold Damage
- EQ Zone, EQ Deductible (if earthquake)

### Drivers Section (per driver)
- Full Name, DOB, Gender, Marital Status
- Relationship, Education, Occupation
- License #, License State, Industry
- DL Status, Age Licensed
- SR-22, FR-44, Good Driver, Mature Driver
- License Susp/Rev, Driver Education
- Accidents, Violations, Student GPA

### Vehicles Section (per vehicle)
- VIN, Year, Make, Model
- Usage, Annual Miles, Ownership

### Auto Coverage (if auto/both)
- Auto Policy Type, Residence Is
- Liability Limits, Property Damage
- Med Pay (Auto), UM Limits, UIM Limits, UMPD Limit
- Comprehensive Ded., Collision Ded.
- Rental Reimbursement, Towing/Roadside
- Student GPA

### Policy Details
- Policy Term, Effective Date
- Home Prior Carrier, Prior Term, Yrs w/ Prior, Prior Exp., Prior Liability
- Auto Prior Carrier, Prior Term, Yrs w/ Prior, Prior Exp., Prior Limits
- Continuous Coverage

### Additional Info
- Accidents (all drivers)
- Violations (all drivers)
- Additional Insureds
- Best Contact Time, Contact Method, Referral Source
- TCPA Consent

### Fields in Form NOT in PDF
- Phonetic pronunciation fields
- `numResidents` (number of residents)
- `monthsAtAddress`
- `sameAsHomeCarrier` (UI only)
- DocIntel internal metadata fields

---

## 6. Gap Analysis Summary

### Critical Gaps — Data Collected but Silently Lost

| Field | Where Collected | Where Lost | Severity |
|---|---|---|---|
| TCPA Consent | Form Step 6 | Not in EZLynx, HawkSoft, or Text export | 🔴 High — legal/compliance field |
| Dog Breed Detail | Form as text (`dogInfo`) | EZLynx gets boolean 'Yes' only; no breed | 🟡 Medium — underwriting detail lost |
| Business-on-Property Detail | Form as text | EZLynx gets boolean 'Yes' only | 🟡 Medium — underwriting detail lost |
| Home Cov B/C/D (Other Structures / Personal Property / Loss of Use) | Not collected at all | HawkSoft has fields; EZLynx needs them | 🔴 High — major coverage data gap |
| UM BI (`umLimits`) | Form Auto Coverage | Not in any `ez*` form-fill | 🔴 High — coverage limit not auto-filled |
| UIM PD | Not collected | HawkSoft has `veh_sUimpd` | 🟡 Medium |
| Lienholder / Mortgagee Full Address | Only name collected | HawkSoft needs full address block | 🟡 Medium |
| Cell Phone / Work Phone | Not collected | HawkSoft `gen_sCellPhone` unused | 🟡 Medium |
| SR-22 State + Reason | Not collected | HawkSoft `drv_sFilingState` / `drv_sFilingReason` unused | 🟡 Medium |
| Student GPA (numeric) | Form collects number | HawkSoft reduces to boolean | 🟢 Low |
| Co-app Prefix/Suffix | Not collected | EZLynx uses primary's suffix (bug) | 🟡 Medium |
| Months at Address | Collected | Not in HawkSoft or PDF | 🟢 Low |
| FR-44 | Collected | No HawkSoft field (OK — not supported) | 🟢 Informational |
| Phonetic Names | Collected | Not exported anywhere | 🟢 Low — internal agency use only |

### EZLynx Gaps — Form Fields Not Auto-Filled on EZLynx Page

All "pass-through" fields listed in Section 3 above go into the payload but are not auto-filled on the EZLynx new applicant form. Key ones that EZLynx DOES support but we don't auto-fill:

| Field | Impact |
|---|---|
| Rental Reimbursement | Must be manually entered in EZLynx |
| Towing & Labor | Must be manually entered |
| UIM Limits | Must be manually entered |
| Water Backup, Loss Assessment, Animal Liability, Jewelry, etc. | All endorsements need manual entry |
| Ordinance or Law %, Increased Replacement Cost | Need manual entry |
| Home Prior Liability | Need manual entry |
| Auto Policy Type | Need manual entry |

### HawkSoft Gaps — Fields HawkSoft Can Accept But We Don't Send

| HawkSoft Field | Gap Type |
|---|---|
| `gen_lCovB`, `gen_lCovC`, `gen_lCovD` | Not collected in form |
| `gen_bDeadBolt`, `gen_bFireExtinguisher` | Not collected in form |
| `gen_bMultiPolicy` | Not collected in form |
| `gen_bHomeReplacement`, `gen_cContentsReplacement` | Not collected in form |
| `gen_bEQMasonryVeneer` | Not collected in form |
| `gen_sPip`, `gen_sPipDeduct` | PIP not in form at all |
| `veh_sVehicleType`, `veh_bFourWD`, `veh_nGVW` | Not collected |
| `veh_bLossPayee` + address fields | Not collected |
| `drv_bExcluded`, `drv_bPrincipleOperator`, `drv_bOnlyOperator`, `drv_bNonDriver` | Not collected |
| `drv_bDefDrvr` | Not collected |
| `drv_tDateLicensed`, `drv_tHiredDate`, `drv_tDateOfCDL` | Not collected |
| `drv_sFilingState`, `drv_sFilingReason` | Not collected |
| `gen_sCellPhone`, `gen_sWorkPhone`, `gen_sEmailWork` | Not collected |
| `gen_sLpAddress1` through `gen_sLpZip1` | Only mortgagee name collected |

### Form Gaps — Data EZLynx or HawkSoft Needs That We Don't Collect

| Missing Field | System That Needs It | Suggested Action |
|---|---|---|
| Coverage B (Other Structures) | EZLynx + HawkSoft | Add to Home Coverage step |
| Coverage C (Personal Property) | EZLynx + HawkSoft | Add to Home Coverage step |
| Coverage D (Loss of Use) | EZLynx + HawkSoft | Add to Home Coverage step |
| PIP / PIP Deductible | HawkSoft (state-specific) | Add conditional field (FL, MI, NJ, NY, PA, KY, KS, ND, UT, MN, HI) |
| SR-22 State | HawkSoft | Add field next to SR-22 checkbox |
| SR-22 Reason | HawkSoft | Add select next to SR-22 checkbox |
| Deadbolt | HawkSoft | Add to home safety section |
| Fire Extinguisher | HawkSoft | Add to home safety section |
| Defensive Driver | HawkSoft | Add to driver fields |
| Co-applicant Prefix | EZLynx | Add to co-app section |
| Cell Phone (separate) | HawkSoft | Add to contact info |
| Work Phone | HawkSoft | Add to contact info (optional) |
| UIM PD | HawkSoft | Add to auto coverage |
| Mortgagee full address | HawkSoft | Expand mortgagee field to include address |

### Consistency Issues — Same Concept Named Differently

| Concept | Form Key | EZLynx Key | HawkSoft Key | PDF Label |
|---|---|---|---|---|
| Home deductible | `homeDeductible` / `allPerilsDeductible` | `ezAllPerilsDeductible` | `gen_sDecuct` | `Deductible` |
| Fire hydrant distance | `fireHydrantFeet` | `ezFeetFromHydrant` | *(not mapped)* | `Fire Hydrant (ft)` |
| Sprinklers | `sprinklers` | `ezSprinklerSystem` | `gen_sSprinkler` | `Sprinklers` |
| Fire alarm | `fireAlarm` | `ezFireDetection` | `gen_sFireAlarm` | `Fire Alarm` |
| Good Driver vs. Good Student | `goodDriver` (driver) | `GoodDriver` | `drv_bGoodStudent` | `Good Driver` |
| UM (BI) | `umLimits` | *(no ez* fill)* | `gen_sUmBi` | `UM Limits` |
| Foundation | `foundation` | `ezFoundationType` | *(not in home block)* | `Foundation` |
| Vehicle comp ded | `compDeductible` | `ezComprehensive` | `veh_sComp` | `Comprehensive Ded.` |
| Vehicle coll ded | `autoDeductible` | `ezCollision` | `veh_sColl` | `Collision Ded.` |
| Lease/Lien | `ownership` (vehicle) | `Ownership` | *(not in HawkSoft)* | *(not in PDF)* |

---

## 7. Recommended Additions / Fixes

### High Priority

| Gap | Recommendation |
|---|---|
| **TCPA Consent not exported** | Add to HawkSoft `gen_sClientNotes` (append) and to the EZLynx pass-through auto-fill if there's an applicable field. At minimum, include in Text/CSV export. |
| **Coverage B/C/D not collected** | Add three optional fields to the Home Coverage step under dwelling coverage. Auto-calculate C as 50% of A if left blank (industry default). |
| **UM BI not auto-filled in EZLynx** | Add `umLimits` → `ezUMBI` mapping to the EZLynx form-fill section (it has a field; we just don't fill it). |
| **Mortgagee address incomplete** | Expand mortgagee input to include address, city, state, ZIP (collapsible). Map to `gen_sLpAddress1` through `gen_sLpZip1` in HawkSoft. |
| **Dog/Business detail lost in EZLynx** | Instead of passing only a boolean, pass the text value so the extension can put it in a notes or description field. |

### Medium Priority

| Gap | Recommendation |
|---|---|
| **SR-22 State and Reason** | Add SR-22 State (select) and SR-22 Reason (select: DUI, Accident, etc.) next to the SR-22 toggle in driver form. Map to `drv_sFilingState` / `drv_sFilingReason`. |
| **Deadbolt and Fire Extinguisher** | Add two Yes/No toggles to the home safety section. Map to `gen_bDeadBolt` / `gen_bFireExtinguisher`. |
| **Cell phone (separate from main)** | Add optional Cell Phone field to contact section. Map to `gen_sCellPhone`. |
| **Defensive Driver flag** | Add checkbox in driver section. Map to `drv_bDefDrvr`. |
| **UIM PD coverage** | Add UIM PD limit field to auto coverage. Map to `gen_sUimPd` and `veh_sUimpd`. |
| **Co-app Prefix** | Add prefix select to co-applicant section. Fix co-app suffix bug (currently copies primary's suffix). |
| **`allPerilsDeductible` vs `homeDeductible` key conflict** | Pick one key; `allPerilsDeductible` matches EZLynx label; update PDF and HawkSoft references to use the same key. |
| **`fireHydrantFeet` vs `feetFromHydrant` discrepancy** | Standardize to `feetFromHydrant` in `App.data` to match EZLynx key. |

### Low Priority / Informational

| Gap | Recommendation |
|---|---|
| **HawkSoft Cov B/C/D manual fields** | Already managed in HawkSoft UI post-import; not urgent. |
| **PIP / PIP Deductible** | Add conditional PIP section visible only for PIP states. Map to `gen_sPip` / `gen_sPipDeduct`. |
| **Vehicle type / 4WD / GVW** | Consider adding for commercial auto; skip for personal lines. |
| **Loss payee per vehicle** | Add optional Loss Payee toggle + name/address per vehicle card for financed vehicles. |
| **Months at Address in PDF** | Add to address section if `yearsAtAddress` < 1. |
| **Good Driver vs. Good Student mapping** | HawkSoft's `drv_bGoodStudent` is semantically wrong for Good Driver. Consider mapping `goodDriver` → `drv_bPrincipleOperator` or add a comment field instead. |
| **Principal/Only/Non-Driver flags** | Add for HawkSoft completeness if agency needs them for commercial lines. |
| **Phonetic pronunciation** | Consider including in PDF for agency reference (client-facing communication). |
| **`numResidents` not in PDF** | Add to auto coverage or address section in PDF. |

---

*End of audit. This document should be updated when new fields are added to the form, EZLynx tool, or HawkSoft export.*
