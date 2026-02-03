# Altech Insurance Workflow - Complete System Design

## 🎯 Goal: One Form, Two Systems, Zero Re-Entry

**Current Problem:**
- Collect data in Altech web form
- Manually re-enter into HawkSoft (client management)
- Manually re-enter into EZLynx (quoting)
- Time consuming, error-prone

**Desired State:**
- Fill form once
- Data flows automatically to both systems
- Quotes run automatically in EZLynx

---

## 📊 Solution Architecture (Based on QAS API)

### Workflow Diagram:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ALTECH WEB APPLICATION                      │
│                    (Your Current Form)                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  User fills out intake form:                             │  │
│  │  • Personal Info (name, DOB, address)                    │  │
│  │  • Home Details (year built, sqft, construction)         │  │
│  │  • Auto Details (vehicles, drivers, VINs)                │  │
│  │  • Coverage Preferences                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Click "Submit" Button                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND PROCESSING                           │
│                  (What we need to build)                        │
│                                                                 │
│  Form data splits into TWO parallel API calls:                 │
│                                                                 │
│  ┌──────────────────────┐      ┌──────────────────────┐        │
│  │   PATH A: HawkSoft   │      │   PATH B: EZLynx     │        │
│  │                      │      │                      │        │
│  │ Generate CMSMTF      │      │ Format QAS API       │        │
│  │ files (HOME + AUTO)  │      │ request JSON         │        │
│  │                      │      │                      │        │
│  │ Download to user     │      │ Call QAS endpoint    │        │
│  │ (or auto-import      │      │ with template ID +   │        │
│  │  if possible)        │      │ applicant data       │        │
│  └──────────────────────┘      └──────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
          ↓                                  ↓
┌──────────────────────┐          ┌──────────────────────┐
│     HAWKSOFT         │          │      EZLYNX          │
│                      │          │                      │
│ • Import CMSMTF      │          │ • QAS receives       │
│ • Client created     │          │   request            │
│ • All data stored    │          │ • Creates applicant  │
│ • Custom fields      │          │   (or uses existing) │
│   populated          │          │ • Applies template   │
│ • Vehicles/drivers   │          │   defaults           │
│   added              │          │ • Submits to         │
│                      │          │   carriers           │
│                      │          │ • Returns quotes     │
└──────────────────────┘          └──────────────────────┘
          ↓                                  ↓
┌──────────────────────┐          ┌──────────────────────┐
│  OPTIONAL: Sync      │          │  AGENT VIEWS         │
│                      │          │  QUOTES IN EZLYNX    │
│  If HawkSoft-EZLynx  │          │                      │
│  integration exists, │          │  • Compare carriers  │
│  client data syncs   │          │  • Select best quote │
│  automatically       │          │  • Bind policy       │
└──────────────────────┘          └──────────────────────┘
```

---

## 🔄 Three Possible Architectures

### Architecture A: Direct API Integration (IDEAL)

**Requirements:**
- ✅ You have QAS API access
- ✅ QAS API can create NEW applicants
- ✅ API documentation available

**Flow:**
```
Altech Form → Backend Server → Parallel API Calls:
                                 ├─> HawkSoft (CMSMTF or API)
                                 └─> EZLynx QAS API

Result: Client in HawkSoft + Quotes in EZLynx simultaneously
```

**Pros:**
- ⚡ Fastest - no waiting for sync
- 🎯 Most control - customize per system
- ✅ Fully automated

**Build Time:** ~2-3 days once we have API docs

---

### Architecture B: HawkSoft Sync + QAS Trigger (GOOD)

**Requirements:**
- ✅ HawkSoft-EZLynx integration working
- ✅ QAS API can quote existing clients
- ❌ QAS cannot create new applicants (only quote)

**Flow:**
```
Altech Form → HawkSoft CMSMTF Import → Client Created
                                         ↓
                          HawkSoft syncs to EZLynx (automatic)
                                         ↓
                          QAS API references existing client ID
                                         ↓
                          Quotes run in EZLynx
```

**Pros:**
- ✅ Single source of truth (HawkSoft)
- ✅ Simpler API call (just trigger quote)
- ✅ Leverages existing integration

**Cons:**
- ⏱️ Slower - must wait for sync (minutes to hours?)

**Build Time:** ~1-2 days once we have API docs + sync tested

---

### Architecture C: Template Only (FALLBACK)

**Requirements:**
- ✅ QAS Templates available
- ❌ No QAS API access OR
- ❌ Non-member agency OR
- ❌ API too complex/expensive

**Flow:**
```
Altech Form → HawkSoft CMSMTF Import → Client Created
                                         ↓
                          Agent manually downloads client to EZLynx
                                         ↓
                          Agent selects QAS template and clicks "Quote"
                                         ↓
                          Quotes run automatically
```

**Pros:**
- ✅ Still faster than manual entry
- ✅ Templates pre-fill carrier questions
- ✅ No API development needed

**Cons:**
- ❌ Still requires manual steps

**Build Time:** ~0 (already working with current CMSMTF export!)

---

## 🎓 QAS Template Strategy

### Template Design Philosophy:

**Create templates for common scenarios:**

1. **Template: TX-Auto-Standard**
   - State: Texas
   - Coverage: 100/300/100 (most common)
   - Carriers: Progressive, Travelers, State Farm, Allstate
   - Use for: Standard auto quotes in Texas

2. **Template: TX-Auto-High-Value**
   - State: Texas
   - Coverage: 250/500/250 (higher limits)
   - Carriers: Chubb, AIG, Pure (luxury carriers)
   - Use for: High net worth clients

3. **Template: TX-Home-Standard**
   - State: Texas
   - Dwelling Coverage: Based on square footage calculation
   - Carriers: All homeowners carriers
   - Use for: Standard homeowners

4. **Template: OK-Auto-Standard**
   - State: Oklahoma
   - Coverage: Oklahoma-specific requirements
   - Carriers: Regional + national carriers
   - Use for: Oklahoma auto quotes

**In your web form, add:**
```javascript
// Template selection logic
function selectQASTemplate(formData) {
  const state = formData.propertyState || formData.garageState;
  const quoteType = formData.quoteType; // 'auto', 'home', 'both'
  const highValue = formData.homeValue > 500000 || formData.vehicleCount > 4;
  
  if (quoteType === 'auto') {
    if (state === 'TX') {
      return highValue ? 'TX-Auto-High-Value' : 'TX-Auto-Standard';
    } else if (state === 'OK') {
      return 'OK-Auto-Standard';
    }
  } else if (quoteType === 'home') {
    return `${state}-Home-Standard`;
  }
  
  return 'Default-Template';
}
```

---

## 📋 Data Mapping

### What Goes Where:

| Data Field | HawkSoft CMSMTF | EZLynx QAS API | Notes |
|------------|----------------|----------------|-------|
| **Name** | `gen_sFirstName`, `gen_sLastName` | `applicant.firstName`, `applicant.lastName` | Both systems |
| **DOB** | `gen_lDOB` | `applicant.dateOfBirth` | Format: YYYYMMDD (HawkSoft) vs YYYY-MM-DD (likely QAS) |
| **Address** | `gen_sAddress`, `gen_sCity`, `gen_sState` | `applicant.address.*` | Both systems |
| **Phone** | `gen_sHomePhone`, `gen_sWorkPhone` | `applicant.phoneNumber` | Both systems |
| **Email** | `gen_sEmail` | `applicant.email` | Both systems |
| **Home Year Built** | `gen_nYearBuilt` | Template default or override | HawkSoft standard field |
| **Home Sq Footage** | `gen_sClientMiscData[0]` | Template default or override | HawkSoft custom field |
| **Vehicle VIN** | `veh_sVIN[0]` | `vehicles[0].vin` | Both systems |
| **Vehicle Year** | `veh_sYr[0]` | `vehicles[0].year` | Both systems |
| **Vehicle Make** | `veh_sMake[0]` | `vehicles[0].make` | Both systems |
| **Driver License** | `drv_sLicenseNum[0]` | `drivers[0].licenseNumber` | Both systems |
| **Driver DOB** | `drv_lDOB[0]` | `drivers[0].dateOfBirth` | Both systems |
| **Prior Coverage** | `gen_sPrevCarrier`, `gen_lPrevExpDate` | Template answer | HawkSoft = detail, QAS = template |
| **Coverage Limits** | `gen_sDecuct` (typo in HawkSoft) | Template defines | QAS template has all limits |

**Key Insight:** QAS API payload is MUCH smaller because templates handle most fields!

---

## 🔨 Implementation Plan

### Phase 1: Research & Validation (THIS WEEK)

**Your Tasks:**
- [x] Confirm QAS exists (DONE - it does!)
- [ ] Check if you have QAS access in EZLynx
- [ ] Test HawkSoft-EZLynx integration
- [ ] Call EZLynx support for API docs
- [ ] Document findings

**My Tasks:**
- [x] Research EZLynx documentation (DONE)
- [x] Create architecture diagrams (DONE)
- [x] Define data mapping (DONE)
- [ ] Review API docs once you get them

---

### Phase 2: QAS Template Creation (AFTER API DOCS)

**Your Tasks in EZLynx:**
1. Create QAS templates for each state/scenario
2. Configure default values
3. Select carriers
4. Answer carrier-specific questions
5. Publish templates
6. Note template names/IDs for API calls

**Estimated Time:** 2-3 hours (one-time setup)

---

### Phase 3: API Integration Development (ME)

**I will build:**

1. **QAS API Client** (`/api/qas-client.js`)
   ```javascript
   class EZLynxQASClient {
     constructor(apiKey, baseUrl) { ... }
     async submitQuote(templateId, applicantData) { ... }
     async getQuoteResults(quoteId) { ... }
     async getQuoteStatus(quoteId) { ... }
   }
   ```

2. **Form Integration** (`/index.html` updates)
   ```javascript
   async function exportToEZLynx() {
     // Get form data
     const formData = getFormData();
     
     // Select appropriate template
     const templateId = selectQASTemplate(formData);
     
     // Format for QAS API
     const qasPayload = formatForQAS(formData, templateId);
     
     // Call API
     const result = await qasClient.submitQuote(templateId, qasPayload);
     
     // Show result to user
     displayQuoteStatus(result);
   }
   ```

3. **Unified Export Button**
   ```html
   <button onclick="exportBoth()">
     Export to HawkSoft & Run EZLynx Quotes
   </button>
   ```

**Estimated Time:** 2-3 days

---

### Phase 4: Testing & Refinement

**Test Cases:**
1. Home only quote
2. Auto only quote
3. Home + Auto quote (both)
4. Multiple vehicles
5. Multiple drivers
6. Different states
7. Error handling (invalid data)

**Estimated Time:** 1-2 days

---

### Phase 5: Production Deployment

**Checklist:**
- [ ] Move from sandbox to production API credentials
- [ ] Set up error logging
- [ ] Monitor API usage/costs
- [ ] Train agents on new workflow
- [ ] Document troubleshooting

**Estimated Time:** 1 day

---

## 💰 Cost Considerations

### Potential Costs:

1. **EZLynx QAS Subscription**
   - Might be included in your EZLynx plan
   - OR might be paid add-on
   - OR might be per-API-call pricing
   - **Ask EZLynx support!**

2. **API Usage Limits**
   - How many calls per month?
   - Overage charges?
   - **Ask EZLynx support!**

3. **Development Time**
   - If you want me to build: ~5-7 days total
   - If you hire external dev: $5k-$15k estimate

4. **Hosting** (if we need a backend server)
   - Currently your app is static HTML (free on Netlify)
   - If we need backend for API calls: ~$5-20/month

---

## 🎯 Success Metrics

**Measure your ROI:**

### Before Automation:
- Time per lead: ~10-15 minutes
- Manual entry into HawkSoft: ~5 minutes
- Manual entry into EZLynx: ~5 minutes
- Running quotes: ~2 minutes
- **Total:** ~12 minutes per lead

### After Automation:
- Fill web form: ~8 minutes
- Auto-export to HawkSoft: ~10 seconds
- Auto-quote in EZLynx: ~10 seconds
- **Total:** ~8 minutes per lead

**Time Saved:** ~4 minutes per lead

**If you process:**
- 10 leads/day = 40 min/day saved = 160 hours/year
- 25 leads/day = 100 min/day saved = 400 hours/year
- 50 leads/day = 200 min/day saved = 800 hours/year

**Plus:**
- ✅ Fewer data entry errors
- ✅ Faster quote turnaround = happier customers
- ✅ More time for actual sales conversations

---

## 📞 Next Steps Summary

### You Do (This Week):
1. ✅ Check Settings → Quoting Automation (2 min)
2. ✅ Test HawkSoft-EZLynx sync (10 min)
3. ✅ Call EZLynx: (877) 932-2382 (30 min)
   - Request QAS API technical documentation
   - Ask about costs and limits
   - Request sandbox credentials
4. ✅ Report findings to me

### I Do (After You Report):
1. ✅ Review API documentation
2. ✅ Design exact integration approach
3. ✅ Build QAS API client
4. ✅ Integrate with your web form
5. ✅ Test and deploy

---

## 📚 All Documentation Created:

- **[EZLYNX_RESEARCH.md](EZLYNX_RESEARCH.md)** - Complete research findings
- **[QAS_QUICK_START.md](QAS_QUICK_START.md)** - Quick action checklist
- **[QAS_COMPLETE_GUIDE.md](QAS_COMPLETE_GUIDE.md)** - Comprehensive QAS guide
- **[WORKFLOW_ARCHITECTURE.md](WORKFLOW_ARCHITECTURE.md)** - This file - system design

---

**Status:** ⏳ Ready to build once you confirm API access and provide documentation

**Last Updated:** February 2, 2026
