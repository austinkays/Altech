# EZLynx QAS - Quick Start Checklist

## ✅ What You Need to Do RIGHT NOW

### 1. Check if You Have QAS Access (2 minutes)

**Steps:**
1. Login to your EZLynx account
2. Look for the **Settings** icon (gear icon, usually top-right)
3. **Hover** over the Settings icon (don't click yet)
4. Look at the dropdown menu that appears
5. Do you see **"Quoting Automation"** as an option?

**If YES:**
- 🎉 **You have QAS access!**
- Click "Quoting Automation" to see the QAS homepage
- You'll see available lines of business (Home, Auto, Dwelling Fire)
- Take a screenshot and send it to me
- **This means you can use the API!**

**If NO:**
- You need to enable QAS
- Contact your **Agency Admin** (whoever manages your EZLynx account)
- Ask them: "Can you please enable Quoting Automation Service (QAS) for my account?"
- This might be a paid add-on - ask about pricing if needed

---

### 2. Test HawkSoft-EZLynx Integration (10 minutes)

**Goal:** See if data flows automatically between systems

**Test A - In HawkSoft:**
1. Go to Settings/Admin
2. Look for "Integrations" or "Third-Party Systems" or "EZLynx"
3. Is there an EZLynx integration setting?
4. Is it enabled/connected?
5. What fields are mapped to sync?
6. Take screenshots

**Test B - In EZLynx:**
1. Go to Settings/Admin
2. Look for "Management System Integration" or "Download Client"
3. Is HawkSoft listed/connected?
4. Take screenshots

**Test C - Try Downloading a Client:**
1. Create or use an existing client in HawkSoft
2. In EZLynx, try to "Download" that client from HawkSoft
3. Does it work? 
4. What data transfers successfully?
5. What data is missing?

**Report back:**
- Integration enabled? Yes/No
- Can download clients? Yes/No
- What data transfers: Name, address, vehicles, drivers, etc.?
- What's missing?

---

### 3. Call EZLynx Support (15-30 minutes)

**Phone:** (877) 932-2382  
**Email:** support@ezlynx.com

**What to Say:**

> "Hi, I'm developing a custom web application to collect insurance leads, and I'm interested in using the QAS (Quoting Automation Service) API to automatically submit quotes. I have a few questions:
> 
> 1. Where can I find the technical API documentation for QAS - endpoints, authentication, request format?
> 2. Can QAS submit brand new applicants, or does it only quote existing clients?
> 3. How does QAS work with our HawkSoft integration?
> 4. What are the API credentials I need?
> 5. Are there usage limits or additional costs for QAS API calls?
> 6. Is there a sandbox environment for testing?"

**Take Notes:**
- API documentation location: _______________
- Authentication method: _______________
- Can create new applicants: YES / NO
- API credentials needed: _______________
- Costs: _______________
- Sandbox available: YES / NO
- Technical contact person: _______________

---

## 📋 Information to Gather

### From EZLynx Account:

- [ ] Do I have QAS access?
- [ ] Can I create QAS templates?
- [ ] What carriers are configured in my account?
- [ ] Is HawkSoft integration enabled?
- [ ] Can I download clients from HawkSoft?

### From EZLynx Support:

- [ ] QAS API documentation URL
- [ ] API base URL/endpoint
- [ ] Authentication method (API key, OAuth, etc.)
- [ ] Request format (JSON, XML, etc.)
- [ ] Can API create new applicants?
- [ ] Usage limits
- [ ] Pricing/costs
- [ ] Sandbox credentials

### From Testing:

- [ ] Does HawkSoft sync to EZLynx automatically?
- [ ] What data transfers successfully?
- [ ] What data doesn't transfer?
- [ ] How long does sync take?
- [ ] Is sync automatic or manual?

---

## 🎯 Possible Workflows (Based on What You Find)

### Workflow A: HawkSoft Sync + QAS API (BEST)

**If:** HawkSoft-EZLynx integration works AND you have QAS API access

```
User fills out Altech form
    ↓
Export CMSMTF → Import to HawkSoft
    ↓
HawkSoft automatically syncs client to EZLynx
    ↓
Call QAS API to run quotes using synced client data
    ↓
Quotes appear in EZLynx automatically
```

**Pros:**
- ✅ Fully automated
- ✅ Uses official integrations
- ✅ No manual steps

---

### Workflow B: Direct QAS API (GOOD)

**If:** You have QAS API access but HawkSoft sync doesn't work well

```
User fills out Altech form
    ↓
Export CMSMTF → Import to HawkSoft (creates client)
    ↓
Call QAS API directly from web app with same data
    ↓
QAS creates applicant in EZLynx + runs quotes
    ↓
Quotes appear in EZLynx
```

**Pros:**
- ✅ Direct control
- ✅ Can customize exactly what data goes to EZLynx
- ✅ Don't rely on HawkSoft sync timing

---

### Workflow C: Manual Download (OK)

**If:** HawkSoft-EZLynx integration exists but no QAS API access

```
User fills out Altech form
    ↓
Export CMSMTF → Import to HawkSoft
    ↓
Manually "Download Client" from HawkSoft in EZLynx
    ↓
Manually run quote in EZLynx
```

**Pros:**
- ✅ Works with existing tools
- ❌ Manual steps still required

---

### Workflow D: CSV Import (FALLBACK)

**If:** No HawkSoft sync, no QAS API access

```
User fills out Altech form
    ↓
Export CMSMTF → Import to HawkSoft
    ↓
Export EZLynx CSV from form
    ↓
Import CSV to EZLynx manually
```

**Pros:**
- ✅ I can build this NOW
- ❌ Two manual import steps

---

## 📞 Questions to Ask Me After You Investigate

Once you've checked your EZLynx account and called support, let me know:

1. **Do you have QAS access?** (Can you see "Quoting Automation" in Settings?)
2. **What did EZLynx support say?** (API docs, costs, capabilities)
3. **Does HawkSoft-EZLynx sync work?** (Can you download clients?)
4. **Which workflow should we build?** (A, B, C, or D above)

Then I'll build the solution! 🚀

---

## 📚 Useful Links

- **QAS Template Setup Guide:** https://ezlynxsupport.freshdesk.com/support/solutions/articles/8000113446
- **EZLynx Support Portal:** https://ezlynxsupport.freshdesk.com
- **Support Phone:** (877) 932-2382
- **Support Email:** support@ezlynx.com

---

**Last Updated:** February 2, 2026
