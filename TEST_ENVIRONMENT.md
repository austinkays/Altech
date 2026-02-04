# 🧪 Altech Feature Test Environment

## Status: Running Diagnostics

### ✅ Automated Tests
- Jest unit tests: **PASSING** (12/12 tests)
- Code syntax: **NO ERRORS**
- Dependencies: **331 packages installed**

### 🔍 Features to Test (Manual)

#### Step 0: Policy Scan
- [ ] Upload photo
- [ ] Upload PDF
- [ ] AI extraction returns data
- [ ] Review modal shows extracted fields
- [ ] Apply to Form button works

#### Step 1: Personal Info
- [ ] Form fields save to localStorage
- [ ] Data persists on page reload
- [ ] First/Last name validation

#### Step 2: Coverage Type
- [ ] Home selection shows only home step (3)
- [ ] Auto selection shows only auto step (4)
- [ ] Both selection shows both
- [ ] Progress bar updates

#### Step 3: Property Details
- [ ] Address field works (with/without Google Places API)
- [ ] Smart Auto-Fill button functional
- [ ] Map previews load
- [ ] All property fields save

#### Step 4: Vehicle & Driver
- [ ] Add driver button works
- [ ] Add vehicle button works
- [ ] VIN decode working
- [ ] Remove buttons functional

#### Step 5: Risk Factors
- [ ] All dropdown selections save
- [ ] Textarea fields work
- [ ] Calculations work (e.g., system updates card appears for old homes)

#### Step 6: Export
- [ ] XML export generates valid file
- [ ] PDF export downloads
- [ ] ZIP export includes multiple files
- [ ] Quote library save/load works

### 📊 Key Integrations

| Feature | Status | Notes |
|---------|--------|-------|
| Policy Scan API | ? | Requires `GOOGLE_API_KEY` |
| Places API | ? | Requires `GOOGLE_PLACES_API_KEY` |
| VIN Decode (NHTSA) | ? | No API key needed, public |
| LocalStorage | ✅ | Working (tested) |
| Export Functions | ✅ | Code tests pass |
| Workflows | ✅ | Code tests pass |

---

## What Issues Are You Experiencing?

Please describe what's not working:
- Which step has problems?
- What error messages appear?
- Does it fail silently or crash?
- Can you see console errors (DevTools → Console)?

---

**Next Action:** Open browser console (F12) and tell me what errors appear when you try each feature.
