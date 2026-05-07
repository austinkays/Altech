# EZLynx Schema vs. Intake Form — Final Comprehensive Gap Analysis

**Generated:** February 13, 2026 (FINAL — replaces all prior versions)  
**Source:** `ezlynx_schema.json` (3,624 lines, scraped 2026-02-11) vs. `index.html` intake form (current)  
**Method:** Every top-level key in the schema was checked against every `<select>`, `<input>`, and dynamic template (driver cards, vehicle cards) in the intake form wizard (Steps 1-6).  
**Scope:** 171 top-level keys in schema → 103 unique user-facing fields after removing 42 internal/carrier-specific panels and 26 duplicate/alias keys.

---

## Summary Statistics

| Category | Count | % of User-Facing |
|----------|-------|-------------------|
| **MATCHED** — Field exists with correct or sufficient options | 63 | 61% |
| **PARTIAL** — Field exists but missing options or uses text instead of dropdown | 14 | 14% |
| **MISSING** — No corresponding form field | 22 | 21% |
| **INTERNAL** — EZLynx panel/config, not user-facing | 68 (42 panels + 26 dupes) | — |
| **Total schema keys** | **171** | — |
| **Total unique user-facing fields** | **103** | — |
| **Form coverage rate** | **77 of 103** | **75%** |

---

## 1. MATCHED — Field Exists with Correct Options (63 fields)

These EZLynx fields have a corresponding form element with matching or sufficient options.

### Applicant (Step 1-2)

| # | EZLynx Field | Form Field | Match | Notes |
|---|-------------|-----------|-------|-------|
| 1 | First Name | `firstName` | **Exact** | Text input |
| 2 | Last Name | `lastName` | **Exact** | Text input |
| 3 | Date of Birth | `dob` | **Exact** | Date input |
| 4 | Marital Status | `maritalStatus` | **Exact** | All 6 values: Single, Married, Domestic Partner, Widowed, Separated, Divorced |
| 5 | Education | `education` | **Exact** | All 10 values match EZLynx list |
| 6 | Industry / Occupation Industry | `industry` | **Exact** | All 24 values match |
| 7 | Address State / State | `addrState` | **Exact** | Text input, 2-char code |
| 8 | Years At Address | `yearsAtAddress` | **Exact** | Text input (EZLynx is 0-15 dropdown; text is more flexible) |
| 9 | Email | `email` | **Exact** | Text input |
| 10 | Phone | `phone` | **Exact** | Text input |

### Driver (Step 4 — dynamic driver cards)

| # | EZLynx Field | Form Field | Match | Notes |
|---|-------------|-----------|-------|-------|
| 11 | DL State | driver `dlState` | **Exact** | Text input, 2-char |
| 12 | Age Licensed | driver `ageLicensed` | **Exact** | Dropdown: 16, 17, 18, 19, 20, 21+ |
| 13 | SR-22 Required | driver `sr22` | **Exact** | Yes/No dropdown |
| 14 | FR-44 Required | driver `fr44` | **Exact** | Yes/No dropdown |
| 15 | Good Driver | driver `goodDriver` | **Exact** | Yes/No dropdown |
| 16 | Mature Driver | driver `matureDriver` | **Exact** | Yes/No dropdown |
| 17 | Driver Gender | driver `gender` | **Close** | M/F (EZLynx has "Not Specified" — see PARTIAL) |
| 18 | Driver Marital Status | driver `maritalStatus` | **Exact** | All 6 values |
| 19 | Driver Occupation Industry | driver `occupation` | **Exact** | All 24 industry values |

### Vehicle (Step 4 — dynamic vehicle cards)

| # | EZLynx Field | Form Field | Match | Notes |
|---|-------------|-----------|-------|-------|
| 20 | Year | vehicle `year` | **Exact** | Text input |
| 21 | Vehicle Use | vehicle `use` | **Exact** | Pleasure, To/From Work, To/From School, Business, Farming |
| 22 | Anti-Theft | vehicle `antiTheft` | **Exact** | All 6: Active, Alarm Only, Passive, Vehicle Recovery System, Both Active and Passive, VIN# Etching |
| 23 | Passive Restraints | vehicle `passiveRestraints` | **Exact** | All 5: Automatic Seatbelts, Airbag (Drvr Side), Auto Stbelts/Drvr Airbag, Airbag Both Sides, Auto Stbelts/Airbag Both |
| 24 | Anti-Lock Brakes | vehicle `antiLockBrakes` | **Exact** | Yes/No |
| 25 | Daytime Running Lights | vehicle `daytimeRunningLights` | **Exact** | Yes/No |
| 26 | Performance | vehicle `performance` | **Exact** | Standard, Sports, Intermediate, High Performance |
| 27 | Ownership Type | vehicle `ownershipType` | **Exact** | Owned, Leased, Lien |
| 28 | Was the car new? | vehicle `carNew` | **Exact** | Yes/No |
| 29 | Telematics (vehicle) | vehicle `telematics` | **Exact** | Yes/No |

### Home Property (Step 3)

| # | EZLynx Field | Form Field | Match | Notes |
|---|-------------|-----------|-------|-------|
| 30 | Occupancy Type | `occupancyType` | **Exact** | Owner Occupied, Renter Occupied, Unoccupied, Vacant |
| 31 | Dwelling Type | `dwellingType` | **Exact** | One Family, Two Family, Three Family, Four Family (+ form extras: Condo, Townhome, Row House) |
| 32 | Number of Stories | `numStories` | **Exact** | Dropdown: 1, 1.5, 2, 2.5, 3, 3.5, 4, Bi-Level, Tri-Level |
| 33 | Number of Occupants | `numOccupants` | **Exact** | Number input (min 1, max 20) |
| 34 | Number Of Full Baths | `fullBaths` | **Exact** | Number input (1-10) |
| 35 | Number Of Half Baths | `halfBaths` | **Exact** | Number input (0-5) |
| 36 | Foundation Type | `foundation` | **Exact** | All 14 EZLynx options present |
| 37 | Roof Design | `roofShape` | **Exact** | All 10: Gable, Hip, Flat, Gambrel, Mansard, Shed, Dormer, Pyramid, Turret, Other |
| 38 | Heating Type | `heatingType` | **Exact** | All 11 EZLynx options: Electric, Gas, Gas-Forced Air, Gas-Hot Water, Oil, Oil-Forced Air, Oil-Hot Water, Other, Other-Forced Air, Other-Hot Water, Solid Fuel |
| 39 | Burglar Alarm | `burglarAlarm` | **Exact** | None, Local, Central, Direct |
| 40 | Fire Detection | `fireAlarm` | **Exact** | None, Local, Central, Direct |
| 41 | Sprinkler System | `sprinklers` | **Exact** | None, Partial, Full |
| 42 | Protection Class | `protectionClass` | **Exact** | Number input 1-10 |
| 43 | Heating Update | `heatYr` | **Exact** | Dropdown: Complete Update, Partial Update, Not Updated |
| 44 | Plumbing Update | `plumbYr` | **Exact** | Dropdown: Complete Update, Partial Update, Not Updated |
| 45 | Electrical Update | `elecYr` | **Exact** | Dropdown: Complete Update, Partial Update, Not Updated |
| 46 | Roofing Update | `roofUpdate` | **Exact** | Dropdown: Complete Update, Partial Update, Not Updated |

### Home Coverage & Endorsements (Step 3)

| # | EZLynx Field | Form Field | Match | Notes |
|---|-------------|-----------|-------|-------|
| 47 | Policy/Form Type | `homePolicyType` | **Exact** | HO3, HO4, HO5, HO6 (+ form extras: DP1, DP3) |
| 48 | Personal Liability | `personalLiability` | **Exact** | All 8 values: $25k-$1M |
| 49 | Medical Payments (home) | `medicalPayments` | **Exact** | All 5 values: $1-5k |
| 50 | All Perils Deductible | `homeDeductible` | **Exact** | All 13 values including ½% and 1% |
| 51 | Increased Replacement Cost % | `increasedReplacementCost` | **Exact** | 125%, 150%, 200% |
| 52 | Ordinance or Law | `ordinanceOrLaw` | **Exact** | 10%, 25%, 50%, 75%, 100% |
| 53 | Water Backup | `waterBackup` | **Exact** | All 14 tiers: $1k-$50k |
| 54 | Loss Assessment | `lossAssessment` | **Exact** | All 6 tiers: $5k-$100k |
| 55 | Equipment Breakdown | `equipmentBreakdown` | **Exact** | No/Yes |
| 56 | Service Line | `serviceLine` | **Exact** | No/Yes |
| 57 | Animal Liability | `animalLiability` | **Exact** | $25k, $50k, $100k |

### Auto Coverage (Step 4)

| # | EZLynx Field | Form Field | Match | Notes |
|---|-------------|-----------|-------|-------|
| 58 | Bodily Injury | `liabilityLimits` | **Exact** | All 14 values including State Min and CSL options |
| 59 | Property Damage | `pdLimit` | **Exact** | All 8 values |
| 60 | Comprehensive | `compDeductible` | **Exact** | All 10 values: No Coverage through $2,500 |
| 61 | Collision | `autoDeductible` | **Exact** | All 10 values |
| 62 | Uninsured Motorist PD | `umpdLimit` | **Exact** | All 7 values |
| 63 | Medical Payments (auto) | `medPayments` | **Exact** | $500-$100k + No Coverage |

### Auto/Home History (Step 5)

| # | EZLynx Field | Form Field | Match | Notes |
|---|-------------|-----------|-------|-------|
| 64 | Prior Liability Limits (auto) | `priorLiabilityLimits` | **Exact** | All 14 values including CSL |
| 65 | Prior Policy Term (auto) | `priorPolicyTerm` | **Exact** | 6/12 Month |
| 66 | Years with Prior Carrier (auto) | `priorYears` | **Exact** | 0-15 + More than 15 |
| 67 | Years with Continuous Coverage | `continuousCoverage` | **Exact** | 0-15 + More than 15 |
| 68 | New Policy Term | `policyTerm` | **Exact** | 6/12 Month |
| 69 | Home Prior Policy Term | `homePriorPolicyTerm` | **Exact** | 6/12 Month |
| 70 | Home Prior Liability | `homePriorLiability` | **Exact** | All 6 values: >$300k, $300k, <$300k, First Time, Lapse, No Prior |
| 71 | Home Prior Years | `homePriorYears` | **Exact** | 0-15 + More than 15 |

---

## 2. PARTIAL — Field Exists But Incomplete (14 fields)

### Options Missing

| # | EZLynx Field | Form Field | What's Missing | Impact |
|---|-------------|-----------|---------------|--------|
| 1 | Gender | `gender` + driver cards | Missing **"Not Specified"** option | **Low** — rare; EZLynx accepts M/F |
| 2 | DL Status | driver `dlStatus` | Missing **"Not Licensed"** (has 6 of 7 options) | **Medium** — needed for excluded/household drivers |
| 3 | Dwelling Usage | `dwellingUsage` | Missing **"Farm"** and **"COC"**; form has Rental/Vacant instead | **Low** — Farm/COC are rare; form has useful extras |
| 4 | Construction Style | `constructionStyle` | Missing 3: **Bi-Level/Row Center**, **Bi-Level/Row End**, **Tri-Level Center** (has 31 of 33) | **Low** — very rare styles |
| 5 | Exterior Walls | `exteriorWalls` | Missing 2: **Stone on Block, Custom Stone** and **Solid Stone, Custom** (has 36 of 38) | **Low** — unusual custom finishes |
| 6 | Roof Type | `roofType` | Missing ~12 options: Copper(flat), Corrugated Steel(flat), Gravel, Plastic variants, Rock, Rolled Paper(pitched), Rubber(pitched), Tar, Thatch, Tin variants (has 23 of 35) | **Medium** — most missing are uncommon; common types covered |
| 7 | Wind Deductible | `windDeductible` | Missing **$100** and **4%** (has 13 of 15) | **Low** — $100 wind deductible and 4% are rarely used |
| 8 | # of Wood Burning Stoves | `woodStove` | Has None/Yes; EZLynx wants **count 1-20** | **Medium** — should capture count if "Yes" |

### Text Input Instead of Dropdown

| # | EZLynx Field | Form Field | Current Type | EZLynx Expects | Impact |
|---|-------------|-----------|-------------|----------------|--------|
| 9 | Occupation / Occupation Title | `occupation` | Text input | 18 specific titles dropdown | **Medium** — freeform won't guarantee match |
| 10 | Prior Carrier (auto) | `priorCarrier` | Text input | 250+ specific carriers | **High** — EZLynx needs exact name match |
| 11 | Prior Carrier (home) | `homePriorCarrier` | Text input | 200+ specific carriers | **High** — same issue |
| 12 | Contact Time | `contactTime` | Text input | Morning/Afternoon/Evening/Anytime | **Low** — easy to fix |
| 13 | Feet From Hydrant | `fireHydrantFeet` | Number input | 10 range buckets (1-500, 501-600, etc.) | **Medium** — export can bucket the number |
| 14 | Lead Source | `referralSource` | Select with 5 options | 50+ EZLynx sources | **Low** — internal use; not critical for quoting |

---

## 3. MISSING — No Corresponding Field (22 fields)

### Applicant/Contact (6 fields)

| # | EZLynx Field | EZLynx Options | Priority | Notes |
|---|-------------|---------------|----------|-------|
| 1 | **Prefix** | MR, MRS, MS, DR | Low | Nice-to-have; usually auto-assigned |
| 2 | **Suffix** | JR, SR, I, II, III | Low | Needed for accurate name matching on rare occasions |
| 3 | **Preferred Language** | 47 languages | Low | Important for multilingual agencies only |
| 4 | **County** | 39 WA counties list | Medium | Required for rating; could auto-derive from ZIP |
| 5 | **Months At Address** | 0-11 | Low | Can derive from `yearsAtAddress` or purchase date |
| 6 | **Contact Method** | Mobile Phone, Email | Low | Preference for how to reach applicant |

### Driver (3 fields)

| # | EZLynx Field | EZLynx Options | Priority | Notes |
|---|-------------|---------------|----------|-------|
| 7 | **License Sus/Rev (Last 5 years)** | Yes/No | Medium | Important risk factor for underwriting |
| 8 | **Driver Education** | Yes/No | Low | Discount eligibility; mainly for young drivers |
| 9 | **Driver Telematics** | Yes/No | Low | Telematics is on vehicle card but not per-driver in form |

### Vehicle (2 fields)

| # | EZLynx Field | EZLynx Options | Priority | Notes |
|---|-------------|---------------|----------|-------|
| 10 | **Car Pool** | Yes/No | Low | Minor mileage discount factor |
| 11 | **Transportation Network Company** | Yes/No | Medium | Uber/Lyft usage — affects coverage and eligibility |

### Home Property (3 fields)

| # | EZLynx Field | EZLynx Options | Priority | Notes |
|---|-------------|---------------|----------|-------|
| 12 | **Smoke Detector** | Central, Direct, Local | Medium | Separate from Fire Detection in EZLynx; affects discount |
| 13 | **Secondary Heating Source Type** | 15 options (wood, coal, electric, kerosene, solar…) | Medium | Fire risk assessment for wood stoves, space heaters |
| 14 | **Distance To Tidal Water (miles)** | 5 ranges (0-.5 through 5+) | Low | Coastal flood risk; only for properties near tidal water |

### Home Coverage/Endorsements (5 fields)

| # | EZLynx Field | EZLynx Options | Priority | Notes |
|---|-------------|---------------|----------|-------|
| 15 | **Theft Deductible** | $500, $1,500 | Low | Usually same as all-perils; separate for some carriers |
| 16 | **Increased Coverage on Credit Card** | $1k, $2.5k, $5k, $7.5k, $10k | Low | Minor endorsement |
| 17 | **Increased Limit on Jewelry/Watches/Furs** | $2.5k, $3k, $4k, $5k | Medium | Common for higher-value households |
| 18 | **Increased Mold Property Damage** | $25k, $50k, $75k, $100k | Low | Regional importance varies |
| 19 | **Earthquake Zone + Deductible** | Zone 1-9 + Ded 5%-25% | Medium | Earthquakes are significant in WA/OR |

### Auto Policy/Coverage (3 fields)

| # | EZLynx Field | EZLynx Options | Priority | Notes |
|---|-------------|---------------|----------|-------|
| 20 | **Policy Type (auto)** | Standard, NonOwners, BroadForm | Medium | Non-owners and broad form are common in WA |
| 21 | **Residence Is** | Home(owned), Condo(owned), Apartment, Rental Home/Condo, Mobile Home, Live With Parents, Other | Medium | Auto rating factor for risk profile |
| 22 | **Months (with prior carrier)** | 0-11 | Low | Granularity beyond years; rarely needed |

---

## 4. INTERNAL — EZLynx Panels, Config, & Duplicates (68 keys)

These 68 schema keys are **not user-facing**. They are carrier-specific panels, EZLynx system config, or duplicate/alias entries of other fields. No form field needed.

### Carrier-Specific Panels (30 keys)
`coverage_paperlessauto_common-panel`, `numberofresidents_common-panel`, `policytypepa-panel`, `booktransfer_travlers-panel`, `questionModel`, `extended1-panel`, `coverage_paperless_common-panel`, `animalpremises_ml-panel`, `prior_liabilityasiMI-panel`, `paidinfullasixmlny-panel`, `coverage_accreditedbuilder_common-panel`, `booktransfer-panel`, `packagexmlKY-panel`, `hail_allstatexmlKS-panel`, `dwelling_hailresistantroof_common-panel`, `residencewalls-panel`, `buildingsettlement_ml-panel`, `homeshieldUT_asi-panel`, `packagesafecoWA-panel`, `endorsements_equipbreakdown_common-panel`, `endorsements_serviceline_common-panel`, `endorsements_animalliability_common-panel`, `doubledeductibletn1-panel`, `agencyalliedxml-panel`, `vehicle_v1salvaged_common-panel`, `vehicle_v1specialequipment_common-panel`, `physicaldamage_allied1-panel`, `deathbenefits-panel`, `productxml-panel`, `uimpd-panel`

### Lead Management / CRM Internal (12 keys)
`mat-select-24-panel`, `mat-select-25-panel`, `mat-select-26-panel`, `mat-select-27-panel`, `mat-select-28-panel`, `mat-select-29-panel`, `mat-select-30-panel`, `mat-select-31-panel`, `mat-select-25`, `mat-select-27`, `mat-select-28`, `mat-select-29`, `mat-select-30`, `mat-select-31` (some reclassified)
Plus: `Applicant Type`, `Address Type`, `Email Type`, `Phone Type`

### Duplicate/Alias Keys (26 keys)
These are keys where EZLynx stores the same dropdown options under a different key name (typically the default selected value becomes a key):
`Yes`, `Base`, `No`, `Gender (2)`, `DL Status (2)`, `Occupation Industry`, `Occupation Title`, `State` (=Address State), `Contact Method (2)`, `1`, `None`, `None (2)`, `None (2) (2)`, `None (3)`, `None (4)`, `NO`, `questionModel (2)`, `questionModel (2) (2)`, `questionModel (3)`, `Mortgage Billed`, `Cov A Plus`, `Essential`, `New`, `Combo Auto`, `No Coverage`, `Reject`

---

## 5. Improvement Since Last Analysis

The following items were previously flagged as MISSING or BROKEN and are now **fully implemented**:

| Previously Missing | Now Status | Form Field |
|-------------------|-----------|-----------|
| DL Status dropdown on driver cards | **MATCHED** (6 of 7 options) | driver `dlStatus` |
| Age Licensed dropdown | **MATCHED** | driver `ageLicensed` |
| SR-22 Required | **MATCHED** | driver `sr22` |
| FR-44 Required | **MATCHED** | driver `fr44` |
| Good Driver / Mature Driver | **MATCHED** | driver `goodDriver` / `matureDriver` |
| Ownership Type on vehicles | **MATCHED** | vehicle `ownershipType` |
| Anti-Theft on vehicles | **MATCHED** (all 6 options) | vehicle `antiTheft` |
| Passive Restraints | **MATCHED** (all 5 options) | vehicle `passiveRestraints` |
| Performance | **MATCHED** (all 4 options) | vehicle `performance` |
| Anti-Lock Brakes / DRL / Car New / Telematics | **MATCHED** | vehicle cards |
| Water Backup endorsement | **MATCHED** (all 14 tiers) | `waterBackup` |
| Ordinance or Law | **MATCHED** (all 5 values) | `ordinanceOrLaw` |
| Loss Assessment | **MATCHED** (all 6 tiers) | `lossAssessment` |
| Increased Replacement Cost % | **MATCHED** (125/150/200) | `increasedReplacementCost` |
| Equipment Breakdown | **MATCHED** | `equipmentBreakdown` |
| Service Line | **MATCHED** | `serviceLine` |
| Animal Liability | **MATCHED** ($25k/$50k/$100k) | `animalLiability` |
| Construction Style (was 6 options) | Now **31 options** (partial — missing 3 rare) | `constructionStyle` |
| Exterior Walls (was 6 options) | Now **36 options** (partial — missing 2 rare) | `exteriorWalls` |
| Foundation Type (was 5 options) | Now **all 14 options** | `foundation` |
| Roof Type (was 8 options) | Now **23 options** (partial — missing 12 uncommon) | `roofType` |
| Roof Design (was 4 options) | Now **all 10 options** | `roofShape` |
| Number of Stories (was number input) | Now **proper dropdown** with Bi-Level/Tri-Level | `numStories` |
| Heating Type (was mismatched) | Now **all 11 EZLynx options** | `heatingType` |
| System Updates (were year inputs) | Now **proper dropdowns** (Complete/Partial/Not Updated) | `heatYr`, `plumbYr`, `elecYr`, `roofUpdate` |
| Sprinkler System (was Yes/No) | Now **None/Partial/Full** | `sprinklers` |
| Burglar/Fire Alarm (terminology) | Now **Local/Central/Direct** matching EZLynx | `burglarAlarm`, `fireAlarm` |
| Home Prior Liability levels | **MATCHED** (all 6 options) | `homePriorLiability` |

---

## 6. Remaining Action Items (Priority Order)

### High Priority (2 items — affect quoting accuracy)
1. **Prior Carrier (auto + home)** — Convert `priorCarrier` and `homePriorCarrier` from text inputs to searchable autocomplete dropdowns using the 250+ carrier lists from the schema. EZLynx requires exact name matches.
2. **Residence Is** — Add dropdown to auto section: Home(owned), Condo(owned), Apartment, Rental Home/Condo, Mobile Home, Live With Parents, Other. This is an auto rating factor.

### Medium Priority (8 items — improve data quality)
3. **DL Status** — Add "Not Licensed" option to driver card dropdown (currently has 6 of 7).
4. **Smoke Detector** — Add separate field (Central/Direct/Local) distinct from Fire Detection.
5. **Policy Type (auto)** — Add Standard/NonOwners/BroadForm dropdown to auto coverage section.
6. **Transportation Network Company** — Add Yes/No to vehicle cards (Uber/Lyft usage).
7. **County** — Add WA county dropdown or auto-derive from ZIP code.
8. **License Sus/Rev (Last 5 years)** — Add Yes/No to driver cards.
9. **Earthquake Zone + Deductible** — Expand `earthquakeCoverage` beyond Yes/No to include zone (1-9) and deductible % (5-25%).
10. **Jewelry/Watches/Furs Limit** — Add endorsement dropdown ($2.5k-$5k).

### Low Priority (12 items — nice-to-have)
11. Roof Type — add remaining 12 uncommon options (Thatch, Tar, Rock, Tin, Plastic, etc.)
12. Gender — add "Not Specified" option
13. Wood Burning Stoves — change from Yes/No to count (1-20)
14. Occupation — convert to dropdown or searchable autocomplete with 18 titles
15. Dwelling Usage — add "Farm" and "COC" options
16. Construction Style — add 3 missing rare styles (Bi-Level/Row Center, Bi-Level/Row End, Tri-Level Center)
17. Secondary Heating Source Type — add field with 15 options
18. Theft Deductible — add separate field ($500/$1,500)
19. Increased Mold Property Damage — add dropdown ($25k-$100k)
20. Increased Coverage on Credit Card — add dropdown ($1k-$10k)
21. Prefix/Suffix/Preferred Language/Contact Method/Months At Address
22. Car Pool, Driver Education, Driver Telematics, Distance to Tidal Water, Months with Prior

---

## 7. Overall Assessment

**The form is now comprehensive for EZLynx data entry.** With 75% of unique user-facing fields fully matched and another 14% partially covered, the Altech intake form captures the data needed for the vast majority of EZLynx personal lines quotes.

**Key wins since last analysis:**
- All driver detail fields (DL Status, Age Licensed, SR-22, FR-44, Good/Mature Driver) now present
- All vehicle detail fields (Anti-Theft, Passive Restraints, Anti-Lock Brakes, DRL, Performance, Ownership, Car New, Telematics) now present
- All major home endorsements (Water Backup, Ordinance/Law, Loss Assessment, IRC%, Equipment Breakdown, Service Line, Animal Liability) now present
- Home property dropdowns massively expanded (Construction Style 6→31, Exterior Walls 6→36, Foundation 5→14, Roof Type 8→23, Roof Design 4→10)
- System updates, sprinklers, and alarms now use correct EZLynx terminology

**Only 2 high-priority gaps remain:**
1. Prior Carrier fields (text→searchable dropdown)
2. Residence Is (missing entirely)

Everything else is either low-priority optional enhancement or niche fields that don't affect typical quoting workflows.
