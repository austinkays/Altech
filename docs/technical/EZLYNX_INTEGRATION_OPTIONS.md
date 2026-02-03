# EZLynx Integration Options Analysis

**Date:** February 3, 2026  
**Purpose:** Determine best path for Altech → HawkSoft → EZLynx workflow

---

## Current Status

✅ **Working:** Altech App → HawkSoft (via CMSMTF export)  
⏳ **Pending:** HawkSoft → EZLynx (need to determine best method)

---

## Option 1: Build XML Export in Altech App ⭐ RECOMMENDED

### Pros
- **Complete control** over data mapping
- **Skip HawkSoft export step** - go directly to EZLynx
- **Faster workflow** for field agents
- **All data captured** - nothing lost in translation
- **Industry standard** - ACORD XML is universally accepted

### Cons
- Requires XML schema implementation
- Need to handle ACORD XML format specifications
- More complex than CSV export

### Data We Collect (Ready for XML)

#### Personal Information
- ✅ First Name, Last Name
- ✅ Email, Phone
- ✅ Date of Birth
- ✅ Marital Status
- ✅ Education Level
- ✅ Driver's License Number & State

#### Property Details
- ✅ Street Address, City, State, Zip
- ✅ Year Built
- ✅ Square Footage
- ✅ Stories
- ✅ Bedrooms, Bathrooms
- ✅ Roof Type & Material
- ✅ Foundation Type
- ✅ Construction Type
- ✅ Heating/Cooling
- ✅ Electrical/Plumbing updates
- ✅ Kitchen/Bath Quality

#### Coverage & Safety
- ✅ Dwelling Coverage Amount
- ✅ Home Deductible
- ✅ Auto Deductible
- ✅ Liability Limits
- ✅ Fire Station Distance
- ✅ Fire Hydrant Distance
- ✅ Protection Class
- ✅ Burglar Alarm
- ✅ Fire Alarm
- ✅ Sprinklers

#### Auto Information
- ✅ Vehicle Description
- ✅ VIN (with auto-decode)
- ✅ Usage
- ✅ Annual Miles
- ✅ Commute Distance
- ✅ Ride Sharing
- ✅ Telematics preference

#### Risk Factors
- ✅ Pool, Trampoline, Wood Stove
- ✅ Dog on Property
- ✅ Business on Property

#### Insurance History
- ✅ Prior Carrier
- ✅ Prior Years
- ✅ Prior Expiration Date
- ✅ Accidents
- ✅ Violations
- ✅ Student GPA

#### Financial
- ✅ Mortgagee
- ✅ Additional Insureds
- ✅ Purchase Date

---

## Option 2: Use HawkSoft as Bridge

### Workflow
1. Altech App → Export CMSMTF → Import to HawkSoft
2. HawkSoft → Export XML/PDF → Import to EZLynx

### Investigation Needed
🔍 **Questions for HawkSoft Support:**
1. Can HawkSoft export individual clients as ACORD XML?
2. Can HawkSoft export individual clients as PDF for EZLynx import?
3. What format does HawkSoft use when exporting for EZLynx?
4. Is there a bulk export option for multiple clients?

### Pros
- Leverage HawkSoft's existing export functionality
- Let HawkSoft handle ACORD compliance
- Two separate systems maintained (HawkSoft for management, EZLynx for quoting)

### Cons
- **Extra manual step** - not fully automated
- Relies on HawkSoft export capabilities (unknown)
- Field agent has to remember to export from HawkSoft
- Data may not transfer completely

---

## EZLynx Import Applicant Requirements

### What We Know
- **Format:** PDF or XML only
- **Standard:** ACORD XML or EZLynx XML format
- **Management Systems Supported:** HawkSoft is in the dropdown
- **Frequency:** One applicant at a time
- **Duplicate Detection:** By Last Name + Address + Zip
- **Lines of Business:** Auto, Home (personal lines only)

### What XML Can Include (Per EZLynx Docs)
- Applicant & Co-Applicant information
- Contact details
- Property information
- Vehicle information
- Driver information
- Coverage details
- Quote preferences

---

## ACORD XML Standards

### What is ACORD?
- **Association for Cooperative Operations Research and Development**
- Insurance industry's standard for data exchange
- Used by all major insurance software systems
- Comprehensive schema for personal lines insurance

### ACORD XML Benefits
- Industry standard = maximum compatibility
- Designed specifically for insurance data
- Includes ALL personal lines fields
- Support for:
  - Multiple drivers
  - Multiple vehicles
  - Home & auto combined
  - Prior insurance history
  - Loss history
  - Risk factors
  - Coverage preferences

### NOT Limiting - ACORD XML is More Comprehensive Than CMSMTF
CMSMTF is HawkSoft's proprietary format. ACORD XML is the insurance industry standard and includes:
- ✅ All fields in CMSMTF
- ✅ Additional standardized fields
- ✅ Support for multiple LOBs
- ✅ Carrier-agnostic data structure

---

## Recommended Implementation: Build XML Export

### Why This is Best
1. **Fastest workflow** - Altech → EZLynx directly
2. **Complete data transfer** - nothing lost
3. **Future-proof** - ACORD XML works with ANY system
4. **Field agent efficiency** - one click to export
5. **No dependency** on HawkSoft export capabilities

### Implementation Steps
1. Research ACORD AL3 (Auto) and HO3 (Home) XML schemas
2. Build XML generator function in Altech app
3. Map all collected fields to ACORD XML elements
4. Add "Export for EZLynx (XML)" button
5. Test import into EZLynx

### ACORD XML Schema Resources
- **ACORD AL3:** Auto personal lines schema
- **ACORD HO3:** Homeowners personal lines schema
- Both schemas available at: https://www.acord.org/standards/xml-standards

### Sample ACORD XML Structure
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ACORD>
  <SignonRq>
    <SignonPswd>
      <CustId>AltechIntake</CustId>
    </SignonPswd>
  </SignonRq>
  <InsuranceSvcRq>
    <RqUID>unique-request-id</RqUID>
    <PersonalAutoPolicyQuoteInqRq>
      <InsuredOrPrincipal>
        <GeneralPartyInfo>
          <NameInfo>
            <PersonName>
              <GivenName>John</GivenName>
              <Surname>Smith</Surname>
            </PersonName>
            <TaxIdentity>
              <TaxIdTypeCd>SSN</TaxIdTypeCd>
            </TaxIdentity>
          </NameInfo>
          <Addr>
            <Addr1>123 Main St</Addr1>
            <City>Houston</City>
            <StateProvCd>TX</StateProvCd>
            <PostalCode>77001</PostalCode>
          </Addr>
          <Communications>
            <PhoneInfo>
              <PhoneNumber>5551234567</PhoneNumber>
            </PhoneInfo>
            <EmailInfo>
              <EmailAddr>john@example.com</EmailAddr>
            </EmailInfo>
          </Communications>
        </GeneralPartyInfo>
      </InsuredOrPrincipal>
      <CommlAutoLineBusiness>
        <PersAutoInfo>
          <Vehicle>
            <VIN>1HGCM82633A123456</VIN>
            <Model>
              <Manufacturer>Honda</Manufacturer>
              <ModelName>Accord</ModelName>
              <ModelYear>2023</ModelYear>
            </Model>
          </Vehicle>
        </PersAutoInfo>
      </CommlAutoLineBusiness>
    </PersonalAutoPolicyQuoteInqRq>
  </InsuranceSvcRq>
</ACORD>
```

---

## Next Steps

### Option A: Build XML Export (Recommended)
1. ✅ Confirm EZLynx accepts ACORD XML (confirmed - they do)
2. 🔄 Download ACORD AL3/HO3 schemas
3. 🔄 Build XML generator in index.html
4. 🔄 Test import into EZLynx
5. 🔄 Add export button to UI

### Option B: Investigate HawkSoft Export
1. 🔄 Contact HawkSoft support
2. 🔄 Ask about XML/PDF export for EZLynx
3. 🔄 Test export → import workflow
4. 🔄 Document manual steps required

---

## Questions for You

1. **How important is automation?** 
   - Full automation = build XML export
   - OK with manual step = use HawkSoft bridge

2. **What's the typical workflow?**
   - Field agent collects data → immediate quote needed = XML export
   - Field agent collects data → quote next day = HawkSoft bridge OK

3. **Volume?**
   - High volume (many leads/day) = automation critical
   - Low volume (few leads/week) = manual step acceptable

---

## Recommendation

**Build XML export in Altech app** because:
1. You've already done the hard work collecting comprehensive data
2. ACORD XML is the industry standard - works everywhere
3. Eliminates manual export step from HawkSoft
4. Future-proof for other integrations
5. XML is NOT limiting - it's MORE comprehensive than CMSMTF

**Final workflow would be:**
- Field agent collects data in Altech app
- Click "Export to HawkSoft" → Creates CMSMTF → Client in HawkSoft
- Click "Export to EZLynx" → Creates ACORD XML → Import into EZLynx for quoting
- All done in seconds, no manual steps

