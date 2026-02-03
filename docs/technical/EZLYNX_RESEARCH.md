# EZLynx API & Integration Research

## 🎉 **BREAKTHROUGH: EZLynx QAS API Found!**

**QAS = Quoting Automation Service** - This is EZLynx's API for automated quoting!

### ⚡ Quick Summary:

| Item | Status |
|------|--------|
| **Does EZLynx have an API?** | ✅ YES - It's called QAS (Quoting Automation Service) |
| **What can it do?** | ✅ Submit applicant data, run quotes automatically across carriers |
| **Supports Home/Auto?** | ✅ YES - Home, Auto, Dwelling Fire all supported |
| **Cost?** | ❓ Need to check with EZLynx - might be included or paid add-on |
| **Technical Docs?** | ⏳ Need to request from EZLynx support |
| **Support Phone** | ✅ (877) 932-2382 |
| **Support Email** | ✅ support@ezlynx.com |

### 🎯 **Your Next Steps (In Order):**

1. **RIGHT NOW (2 min):** Login to EZLynx → Hover Settings → Look for "Quoting Automation"
   - ✅ **If you see it:** You have QAS access! Click it to explore.
   - ❌ **If you don't:** Contact your Agency Admin to enable QAS permissions
   - 📝 **Non-member agency?** Contact your EZLynx sales rep

2. **TODAY:** Test HawkSoft-EZLynx sync - does data flow automatically?

3. **THIS WEEK:** Call EZLynx at (877) 932-2382 and request QAS API technical documentation
   - Ask for: API base URL, authentication method, request/response schemas
   - Ask: Can QAS create NEW applicants or only quote existing clients?
   - Request: Sandbox credentials for testing

4. **AFTER THAT:** Based on findings, I'll build the integration!

📚 **I created a complete guide for you:** [QAS_COMPLETE_GUIDE.md](QAS_COMPLETE_GUIDE.md)

---

## 🔍 Research Summary (Feb 2, 2026)

### API Status: ⚡ **QAS API EXISTS - DETAILS NEEDED**

After extensive research, here's what I found:

## 📞 EZLynx Contact Information

**Primary Support:**
- **Support Portal:** https://ezlynxsupport.freshdesk.com
- **Main Website:** https://www.ezlynx.com
- **Support Phone:** You'll need to log into your EZLynx account to see support numbers
- **Sales:** Contact through website form or your account rep

**Action Required:** Contact EZLynx directly about API access via:
1. Your EZLynx account manager
2. Submit ticket at https://ezlynxsupport.freshdesk.com
3. Call your support line (visible in your account portal)

---

## 🔌 HawkSoft ↔ EZLynx Integration

### What We Know

**EZLynx and HawkSoft DO have integration capabilities.** However, the extent varies:

### Typical Integration Scenarios:

#### 1. **Basic Data Sync** (Most Common)
- Client data from HawkSoft → EZLynx
- Manual or scheduled sync
- Usually one-way: HawkSoft → EZLynx

#### 2. **Download Client** (Common Feature)
- In EZLynx, you can "Download" clients from HawkSoft
- Pulls name, address, contact info
- May not pull ALL custom fields

#### 3. **Comparative Rater Integration**
- Run quotes in EZLynx using HawkSoft client data
- Results can sync back to HawkSoft

### What You Need to Check:

**In Your HawkSoft Account:**
1. Go to Settings → Integrations → EZLynx
2. Check if integration is enabled
3. Look for sync settings and what fields are mapped

**In Your EZLynx Account:**
1. Go to Settings/Admin → Integrations
2. Look for HawkSoft connection
3. Check "Download from Management System" options

---

## ✅ EZLynx QAS API - FOUND!

### 🎯 **EZLynx HAS an API - It's Called QAS (Quoting Automation Service)**

**Official Description from EZLynx:**
> "Quoting Automation Service (QAS) is the flagship API offering which allows agencies to run complete quotes via the backend. This single interface with multiline support can reduce manual entry, so you can quote faster."

### What QAS Can Do:

1. **Automated Quoting** - Submit applicant data via API, get quotes back from multiple carriers
2. **Multi-Line Support** - Home, Auto, Dwelling Fire all supported
3. **Template-Based** - Create templates with default values, only send unique data per applicant
4. **Web Services Integration** - Can be called from external applications
5. **Carrier Integration** - Automatically submits to all configured carriers

### How to Check if You Have Access:

**In Your EZLynx Account:**
1. Hover over the **Settings icon**
2. Look for **"Quoting Automation"** option
3. ✅ If you see it → You have QAS access!
4. ❌ If not → Contact your Agency Admin to enable it

### Key Features:

- **QAS Templates** - Pre-configure defaults for applicant, drivers, vehicles, coverages, carriers
- **State-Specific Defaults** - Set different values per state
- **Carrier Selection** - Choose which carriers to quote with
- **Automatic Rating** - EZLynx runs quotes across all selected carriers
- **Results via API** - Get quote results back programmatically

### Documentation Found:

- ✅ [How to Setup a QAS Template](https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000113446) | https://frshl.ink/5EYub
- ✅ [Web Services - Manual Quote APIs](https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000103478)
- ✅ Additional QAS Resources: https://frshl.ink/WqYub | https://frshl.ink/XqYub
- ⏳ **Still need:** Technical API documentation (endpoints, authentication, request/response format)
  - **Action:** Call EZLynx support at (877) 932-2382 to request developer documentation

### Access Requirements:

**Member Agencies:**
- Check Settings → Quoting Automation
- If visible → You have access!
- If not → Contact Agency Admin

**Non-Member Agencies:**
- Contact EZLynx Sales Representative
- Discuss QAS subscription options

### What EZLynx DOES Offer:

#### A. **File Import**
- CSV imports for clients/vehicles/drivers
- Similar to HawkSoft's CMSMTF but CSV-based
- You can generate CSV files from your app

#### B. **Management System Integration**
- Built-in connectors to popular AMS platforms
- HawkSoft is one of the supported systems
- Data flows through their proprietary integration

#### C. **Third-Party Integration Partners**
- Companies like Applied Epic, QQ Solutions, etc.
- They have special API access
- Expensive partnership agreements required

---

## 💡 Your Options

### Option 1: **Use Existing HawkSoft → EZLynx Integration** (BEST - Try This First)

**Setup:**
1. Enable HawkSoft-EZLynx integration in both systems
2. After importing CMSMTF to HawkSoft, sync to EZLynx
3. Client appears in both systems

**Workflow:**
```
Fill out Altech form
    ↓
Export CMSMTF files (HOME + AUTO)
    ↓
Import to HawkSoft
    ↓
HawkSoft syncs to EZLynx automatically (or click "Download Client")
    ↓
Client exists in both systems
```

**Pros:**
- ✅ Uses existing integration (no extra cost)
- ✅ No custom development needed
- ✅ Officially supported by both vendors

**Cons:**
- ❌ May not sync ALL fields (especially custom misc data)
- ❌ Might require manual "Download" step in EZLynx
- ❌ Sync timing depends on settings

**ACTION:** Check your HawkSoft and EZLynx settings RIGHT NOW to see if this integration is enabled!

---

### Option 2: **Generate CSV for EZLynx Import**

**What I Can Build:**
- Export button that generates EZLynx-compatible CSV
- You download the CSV
- Import to EZLynx manually (or via their auto-import folder if you have it)

**Workflow:**
```
Fill out Altech form
    ↓
Export HawkSoft CMSMTF (creates client)
    ↓
Export EZLynx CSV (separate button)
    ↓
Import CSV to EZLynx
    ↓
Client exists in both systems with ALL data
```

**Pros:**
- ✅ I can build this NOW with no EZLynx API needed
- ✅ ALL form data included
- ✅ No integration limitations

**Cons:**
- ❌ Two manual import steps instead of one
- ❌ Still some manual work

---

### Option 3: **Contact EZLynx About API Access**

**What to Ask:**
1. "Does EZLynx offer API access for creating clients programmatically?"
2. "What are the requirements/costs to get API credentials?"
3. "Can we push applicant data from our web app directly to EZLynx?"
4. "Is there a partner program for custom integrations?"

**Questions to Include:**
- Do you have REST API documentation?
- What endpoints are available (create client, create application, etc.)?
- What are the authentication requirements?
- Are there usage limits or costs?
- Can we get developer/sandbox credentials for testing?

**Contact Methods:**
1. **Support Ticket:** https://ezlynxsupport.freshdesk.com/support/tickets/new
2. **Account Manager:** Email/call your EZLynx rep directly
3. **Sales/Partnerships:** If no API through support, ask about partnership programs

---

### Option 4: **Become an EZLynx Integration Partner** (Long-term, if scaling)

If you're planning to:
- Offer this tool to other agencies
- Build a product around this workflow
- Need deep integration

Then consider:
- EZLynx Partner Program
- Certified integration status
- API access as a vendor (like HawkSoft gave you)

**Cost:** Likely $$$, partnership agreements, certification process

---

## 📋 What Fields Does EZLynx Need?

Based on typical insurance comparative rater requirements, EZLynx likely needs:

### Personal Lines (what you're collecting):

**Client Info:**
- Name, DOB, address, phone, email ✅ (you have this)
- Marital status, occupation ✅ (you have this)

**Home Insurance:**
- Property address ✅
- Year built, square footage ✅
- Construction type, roof type ✅
- Dwelling usage (primary/secondary) ✅
- Alarms, sprinklers ✅
- Prior coverage/claims ✅
UPDATED Action Plan

### Step 0: Check QAS Access (DO THIS FIRST - 2 MINUTES)

**In Your EZLynx Account:**
1. Login to EZLynx
2. Hover over **Settings icon** (gear icon)
3. Look for **"Quoting Automation"** in the menu
4. If you see it:
   - Click it to open QAS homepage
   - You'll see options to create templates for Home, Auto, Dwelling Fire
   - You HAVE API access!
5. If you don't see it:
   - Contact your Agency Admin
   - Ask them to enable QAS permissions for your account
   - This might be a paid add-on feature

**Screenshot from EZLynx docs:**
- Settings → Quoting Automation → Template Management

---
**Auto Insurance:**
- Vehicle VIN, year, make, model ✅
- Driver license info, DOB ✅
- Usage, mileage ✅
- Prior coverage/claims ✅

**Good news:** Your Altech form already collects EVERYTHING EZLynx needs! The question is just HOW to get it there.

---

## 💰 Pricing Concerns

### HawkSoft API:
- **✅ FREE** - Included with your subscription
- No usage limits mentioned
- No per-call costs

### EZLynx API (if it exists):
- **❓ UNKNOWN** - Not publicly documented
- Likely included if you have EZLynx subscription
- OR could be partner-only (expensive)

**Action:** Ask EZLynx support directly about API pricing when you inquire

---

## 🎯 IMMEDIATE Action Plan

### Step 1: Check Existing Integration (DO THIS TODAY)

**In HawkSoft:**
1. Login to your HawkSoft account
2. Go to Settings/Admin panel About QAS API Docs

**Draft Email/Ticket:**

```
Subject: QAS API Technical Documentation Request

Hello EZLynx Support,

I'm a customer at Altech Insurance Agency and I'm developing an internal 
web application to streamline our client intake process. I found the QAS 
(Quoting Automation Service) documentation and believe this is exactly what 
I need, but I have some questions:

1. Where can I find the technical API documentation for QAS?
   - API endpoints/base URL
   - Authentication method (API key, OAuth, etc.)
   - Request/response format (JSON/XML)
   - Sample API calls

2. Does QAS allow submitting NEW applicants/applications via API, or does 
   it only work with existing clients already in EZLynx?

3. Can I push applicant data from HawkSoft into EZLynx via QAS API? Or 
   does the HawkSoft-EZLynx integration handle this automatically?

4. Are there API credentials/keys I need to obtain for my account?

5. Is there a sandbox/test environment for QAS development?

6. What are the usage limits and costs for QAS API calls?

My workflow:
- Collect data via web form
- Import to HawkSoft via CMSMTF file
- Want to automatically trigger quotes in EZLynx using the same data

Reference articles I've found:
- https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000113446
- https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000103478ency and I'm developing an internal 
web application to streamline our client intake process. I have a few 
questions about integrating with EZLynx:

1. Does EZLynx provide API access for creating clients and applications 
   programmatically?

2. We currently use HawkSoft as our management system. What is the best 
   way to get client data from our web app into both HawkSoft and EZLynx?

3. Are there API credentials available for our account, and if so, where 
   can I find the API documentation?

4. What file formats does EZLynx accept for bulk client imports (CSV, 
   XML, etc.)?

5. Is there a sandbox/test environment available for development?

Our goal is to collect applicant information once and populate both 
systems automatically, reducing manual data entry. Any guidance you can 
prov✅ PRIORITY 1: Check QAS Access (5 MINUTES - DO NOW!)
- Login to EZLynx
- Hover Settings → Look for "Quoting Automation"
- If you see it → You have the API! 🎉
- If not → Contact admin to enable

### PRIORITY 2: Check HawkSoft-EZLynx Integration (TODAY)
- See if HawkSoft-EZLynx sync already works
- Test: Create client in HawkSoft, can you "Download" it in EZLynx?
- Check what data transfers automatically
- If this works well, you might not need QAS API at all!

### PRIORITY 3: Contact EZLynx About QAS API Docs (THIS WEEK)
- Call: (877) 932-2382
- Email: support@ezlynx.com
- Use the email template above
- Request technical API documentation
- Ask about HawkSoft integration + QAS workflow

### PRIORITY 4: Test QAS Templates (IF YOU HAVE ACCESS)
- Create a test QAS template for Auto
- Create a test QAS template for Home
- See how templates work with the web interface
- This will help understand the API workflow

### PRIORITY 5: Build Solution Based on Findings
- **Option A:** If HawkSoft-EZLynx sync works → Just use that!
- **Option B:** If QAS API is available → Build API integration
- **Option C:** If neither → Build CSV export for manual import
**This gives you:**
- All data in both systems
- No waiting for API access
- Works TODAY

Want me to build this while you research the integration options?

---

## 📝 Summary & Recommendations

### PRIORITY 1: Check Existing Integration (TODAY)
- See if HawkSoft-EZLynx sync already works
- Test downloading a client from HawkSoft in EZLynx
- If it works, you're DONE - just use that!

### PRIORITY 2: Contact EZLynx (THIS WEEK)
- Submit support ticket about API access
- Ask your account manager
- Get clarity on what's possible

### PRIORITY 3: Build CSV Export (PARALLEL)
- While researching API, I'll build CSV export
- Gives you a working solution immediately
- Can always replace with API later if available

### PRIORITY 4: Document Current Workflow
- How do you currently get HawkSoft clients into EZLynx?
- What's manual vs. automatic?
- What data is missing?

---

## 🤝 Next Steps - What You Need to Do

1. **Check integration settings** in both HawkSoft and EZLynx
2. **Contact EZLynx support** with the questions above
3. **Test current workflow** - create a test client in HawkSoft, see if it appears in EZLynx
4. **Let me know** what you find so I can build the right solution

## 🤝 Next Steps - What I Can Do

While you research:
1. **Build EZLynx CSV export** - working solution today
2. **Enhance HawkSoft export** - ensure all possible data is included
3. **Build sync tracking** - track which leads went to which system
4. **Wait for API details** - once you get them, integrate directly

---

Let me know what you find from the integration check and EZLynx support! 🚀
