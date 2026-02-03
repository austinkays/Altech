# EZLynx QAS API - Complete Guide

## 🎯 Summary: What We Know

**Quoting Automation Service (QAS)** is EZLynx's flagship API that allows agencies to run complete quotes programmatically.

### ✅ Confirmed Capabilities:
- ✅ **Multiline Support** - Home, Auto, Dwelling Fire
- ✅ **Backend Quote Automation** - Submit data, get quotes back
- ✅ **Template-Based** - Pre-configure defaults to reduce data sent per request
- ✅ **Carrier Integration** - Automatically quotes across selected carriers
- ✅ **Reduces Manual Entry** - API handles data population

---

## 🔐 Access Requirements

### For Member Agencies:
1. **Check if you have access:**
   - Login to EZLynx
   - Hover over **Settings icon**
   - Look for **"Quoting Automation"** option
   
2. **If you see "Quoting Automation":**
   - ✅ You have QAS access!
   - Click to access QAS homepage
   - You can create and manage templates
   - You can use the API

3. **If you DON'T see it:**
   - Contact your **Agency Admin**
   - Request QAS permissions
   - May require enabling QAS feature (could be paid add-on)

### For Non-Member Agencies:
- Contact your **EZLynx Sales Representative**
- Discuss QAS API options
- Likely requires specific subscription level

---

## 📚 Official Documentation

### Primary Resources:
1. **QAS Template Setup:** https://frshl.ink/5EYub
   - How to create QAS templates
   - State selection
   - Setting default values
   - Carrier selection
   - Publishing templates

2. **Additional Documentation:** 
   - https://frshl.ink/WqYub
   - https://frshl.ink/XqYub

### Support Contact:
- **Phone:** (877) 932-2382
- **Email:** support@ezlynx.com
- **Portal:** https://ezlynxsupport.freshdesk.com

---

## 🛠️ How QAS Works

### 1. **Template Creation (One-Time Setup)**

**In EZLynx Web Interface:**
- Navigate to Settings → Quoting Automation
- Create templates for each line of business (Home, Auto, etc.)
- Configure:
  - **State Selection** - Which states this template applies to
  - **Default Values** - Pre-fill common values (occupancy, coverage limits, etc.)
  - **Carrier Selection** - Which carriers to quote with
  - **Carrier-Specific Defaults** - Answer carrier-specific questions
- **Publish** the template to make it active

**Template Benefits:**
- You only send unique data per applicant via API
- Template provides all the defaults
- Reduces API payload size
- Faster development

### 2. **API Integration (What We Need to Build)**

**Typical Workflow:**
```
1. User fills out Altech web form
   ↓
2. JavaScript sends data to backend/API endpoint
   ↓
3. Backend calls EZLynx QAS API with:
   - Template name/ID
   - Applicant unique data (name, DOB, address, etc.)
   - Vehicle/driver details
   - Any overrides to template defaults
   ↓
4. EZLynx QAS receives request
   ↓
5. EZLynx combines your data + template defaults
   ↓
6. EZLynx submits quotes to selected carriers
   ↓
7. EZLynx returns quote results via API
   ↓
8. Your app displays results or stores in database
```

### 3. **What We Still Need from EZLynx:**

To actually build this, we need the technical API documentation:

**Required Information:**
- [ ] **API Base URL** - Example: `https://api.ezlynx.com/qas/v1/`
- [ ] **Authentication Method** - API Key? OAuth? HTTP Basic?
- [ ] **API Credentials** - How to obtain/generate keys for your account
- [ ] **Request Format** - JSON? XML? SOAP?
- [ ] **Endpoints:**
  - [ ] Submit quote request
  - [ ] Check quote status
  - [ ] Retrieve quote results
  - [ ] Create/update applicant (if supported)
- [ ] **Request Schema** - What fields to send and their format
- [ ] **Response Schema** - What comes back and how to parse it
- [ ] **Error Codes** - How to handle failures
- [ ] **Rate Limits** - How many API calls allowed per minute/hour
- [ ] **Sandbox Environment** - Test credentials for development

---

## 🎯 Integration Strategy

### Option 1: HawkSoft → EZLynx Sync + QAS (RECOMMENDED)

**If HawkSoft-EZLynx integration exists:**

```
User fills Altech form
    ↓
Export CMSMTF → Import to HawkSoft (creates client)
    ↓
HawkSoft automatically syncs client to EZLynx
    ↓
Call QAS API referencing the synced client
    ↓
QAS runs quotes using client data + template defaults
    ↓
Quotes appear in EZLynx
```

**Pros:**
- ✅ Leverages existing HawkSoft-EZLynx integration
- ✅ Client exists in both systems
- ✅ Single source of truth (HawkSoft)
- ✅ API only needs to trigger quotes, not create client

**Questions to Answer:**
1. Does your HawkSoft-EZLynx integration work?
2. Can you "Download" clients from HawkSoft in EZLynx?
3. Does QAS API work with existing clients or only new applications?

---

### Option 2: Direct QAS API from Web App

**If no HawkSoft-EZLynx sync or if QAS can create new applicants:**

```
User fills Altech form
    ↓
Backend calls TWO APIs in parallel:
    1. HawkSoft API (log note with data) OR CMSMTF import
    2. EZLynx QAS API (create applicant + run quotes)
    ↓
Data enters both systems simultaneously
```

**Pros:**
- ✅ Faster - don't wait for sync
- ✅ Complete control over data sent to each system
- ✅ Can customize per system's needs

**Cons:**
- ❌ Maintain data in two places
- ❌ More complex error handling

---

### Option 3: QAS Templates Only (If No API Access to Runtime)

**If you can create templates but can't call API programmatically:**

```
User fills Altech form
    ↓
Export CMSMTF → Import to HawkSoft
    ↓
Manually "Download" client to EZLynx
    ↓
Manually select QAS template and run quote
```

**Pros:**
- ✅ Uses QAS benefits (templates, carrier defaults)
- ✅ Still faster than manual entry

**Cons:**
- ❌ Manual steps required
- ❌ Doesn't achieve full automation goal

---

## 📋 Action Plan

### ✅ Step 1: Verify Access (YOU - 2 minutes)

**Do this RIGHT NOW:**
1. Login to your EZLynx account
2. Hover over Settings icon
3. Look for "Quoting Automation"

**Report back:**
- [ ] I see "Quoting Automation" → I have access!
- [ ] I don't see it → Need to request access

---

### ✅ Step 2: Test HawkSoft-EZLynx Integration (YOU - 10 minutes)

**In HawkSoft:**
- Check Settings for EZLynx integration
- Is it enabled?

**In EZLynx:**
- Can you "Download" a client from HawkSoft?
- What data transfers?

**Report back:**
- [ ] Integration works - data syncs
- [ ] Integration exists but limited data
- [ ] No integration found

---

### ✅ Step 3: Contact EZLynx Support (YOU - 30 minutes)

**Call:** (877) 932-2382

**Script:**
> "Hi, I'm a developer at Altech Insurance Agency. I see we have access to QAS (Quoting Automation Service) and I want to integrate it with our custom intake web application. I need the technical API documentation:
> 
> 1. What is the API base URL and authentication method?
> 2. Where can I find the request/response schema documentation?
> 3. How do I obtain API credentials for our account?
> 4. Does QAS API work with existing clients in EZLynx, or can it create new applicants?
> 5. Is there a sandbox environment for testing?
> 6. Are there any usage limits or costs per API call?
> 
> Our use case: We collect insurance leads via a web form, import them to HawkSoft via CMSMTF, and want to automatically trigger quotes in EZLynx using QAS API."

**Document their answers:**
- API base URL: ________________
- Authentication: ________________
- Documentation link: ________________
- API credentials location: ________________
- Can create applicants: YES / NO
- Sandbox available: YES / NO
- Costs: ________________
- Technical contact: ________________

---

### ✅ Step 4: I Build the Integration (ME - After you get API docs)

**Once you provide the API documentation, I will:**

1. **Create QAS API Client** (JavaScript/Node.js or Python)
   - Authentication handling
   - Request formatting
   - Response parsing
   - Error handling

2. **Add QAS Export to Web Form**
   - New "Export to EZLynx" button OR
   - Automatic API call after HawkSoft export
   - Map form data to QAS API format

3. **Build Template Manager** (Optional)
   - UI to select which QAS template to use
   - Store template preferences per agent

4. **Testing & Validation**
   - Test with sample data
   - Verify quotes appear in EZLynx
   - Handle errors gracefully

---

## 🎓 QAS Template Examples

### Example Auto Template Configuration:

**State Selection:**
- ✅ Texas
- ✅ Oklahoma
- ✅ Kansas

**Driver Defaults:**
- Marital Status: Married (most common, can override)
- Education Level: Bachelors
- Occupation: Employed
- Prior Insurance: Yes

**Vehicle Defaults:**
- Usage: Commute
- Annual Mileage: 12,000
- Ownership: Owned

**Coverage Defaults (Texas):**
- Bodily Injury: 100/300
- Property Damage: 100
- Uninsured Motorist: 100/300
- Comprehensive Deductible: $500
- Collision Deductible: $500

**Carrier Selection:**
- ✅ Progressive
- ✅ Travelers
- ✅ State Farm
- ✅ Allstate

**Result:**
When you call QAS API with just:
- Driver name, DOB, license
- Vehicle VIN, year, make, model
- Address

QAS automatically applies all the above defaults and quotes with all 4 carriers!

---

## 💡 Key Insights

### What Makes QAS Powerful:

1. **Reduce API Payload Size**
   - Don't send 100+ fields per request
   - Just send what's unique to each applicant
   - Template handles the rest

2. **Maintain Control**
   - Update defaults in EZLynx web interface (no code changes)
   - Different templates for different use cases
   - State-specific configurations

3. **Carrier Management**
   - Select which carriers to quote
   - Pre-answer carrier-specific questions
   - Update carrier list without changing API calls

4. **Speed**
   - One API call quotes multiple carriers
   - Parallel carrier submissions
   - Results available quickly

---

## ⚠️ Important Notes

### QAS vs. Manual Quote API

From the documentation, EZLynx has at least TWO types of APIs:

1. **QAS API** - Automated quoting with carrier submissions
2. **Manual Quote API** - Add quotes to EZLynx that you obtained elsewhere

**We want QAS API** - the one that actually runs quotes.

### Member vs. Non-Member

- **Member Agencies** - Can self-service create templates
- **Non-Member Agencies** - Need to contact sales

If you're non-member and see "Quoting Automation" option, you might have API access!

### Permissions

Even member agencies need specific **user permissions** to:
- View Quoting Automation settings
- Create/edit templates
- Make API calls

Work with your Agency Admin if you don't see the option.

---

## 🚀 Next Steps Summary

**You need to:**
1. ✅ Check if you see "Quoting Automation" in EZLynx Settings
2. ✅ Test HawkSoft-EZLynx integration (does client data sync?)
3. ✅ Call EZLynx at (877) 932-2382 and request technical API documentation
4. ✅ Report back what you find

**Then I will:**
1. ✅ Build QAS API client
2. ✅ Integrate with your web form
3. ✅ Test end-to-end workflow
4. ✅ Deploy automated solution

---

## 📞 Support Resources

- **EZLynx Support Phone:** (877) 932-2382
- **EZLynx Support Email:** support@ezlynx.com
- **EZLynx Support Portal:** https://ezlynxsupport.freshdesk.com
- **QAS Template Guide:** https://frshl.ink/5EYub
- **Additional Docs:** https://frshl.ink/WqYub | https://frshl.ink/XqYub

---

**Last Updated:** February 2, 2026  
**Status:** ⏳ Waiting on API technical documentation from EZLynx support
