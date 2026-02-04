# Quick Testing Reference Guide

**Print this page or bookmark it for easy reference during testing**

---

## Phase 1 Test Addresses (ArcGIS - Should Return 95% Confidence, <1 sec)

### Primary Test Case
```
📍 408 NW 116th St, Vancouver, WA 98660

Expected Results:
✅ Parcel ID: valid format (####-##-####)
✅ Year Built: 1985 (±2 years)
✅ Stories: 2
✅ Lot Size: 0.25 acres (±0.02)
✅ Sq Ft: 1,850 (±50)
✅ Confidence: 95%
✅ Speed: <1 second
✅ Success: Green checkmark in popup
```

### Secondary Test Cases
```
📍 1234 Evergreen Blvd, Vancouver, WA 98660
  └─ Same expectations as primary

📍 5678 Mountain View Drive, Camas, WA 98607
  └─ Year Built: 2012 (newer construction)
  └─ Lot Size: 0.55 acres (larger)

📍 2847 Wallingford Ave N, Seattle, WA 98103 (King County)
  └─ High-value property
  └─ Value: ~$750k
  └─ Good for Phase 5 testing too

📍 1524 NE 42nd Ave, Portland, OR 97213 (Multnomah)
  └─ Portland property
  └─ Year Built: 1974 (older)
  └─ Strong appreciation expected
```

---

## Phase 2 Fallback Test Addresses (Browser - 85% Confidence, 3-5 sec)

### When to Use These
**Phase 1 SHOULD FAIL** for these counties (they don't have ArcGIS APIs)
→ System should automatically fallback to Phase 2 (browser scraping)

### Test Addresses
```
📍 2341 Broadway, Everett, WA 98201 (Snohomish County)
  └─ Expected: Phase 2 triggers (Phase 1 fails)
  └─ Confidence: 85% (lower than Phase 1)
  └─ Speed: 3-5 seconds (slower than Phase 1)
  └─ Yellow warning: "85% confidence"

📍 1456 Capitol Way, Olympia, WA 98501 (Thurston County)
  └─ Fallback to Phase 2
  └─ State capital area

📍 892 Willamette Street, Eugene, OR 97401 (Lane County)
  └─ University town
  └─ Phase 2 fallback

📍 3215 Salem Avenue, Salem, OR 97301 (Marion County)
  └─ State capital (Oregon)
  └─ Phase 2 fallback

📍 4567 Desert View Road, Gilbert, AZ 85234 (Pinal County)
  └─ Out-of-state test
  └─ Phase 2 fallback
```

---

## Testing Workflow Checklist

### Before You Start
```bash
□ npm run dev        # Start dev server on localhost:8000
□ Open DevTools      # F12 for console
□ Clear localStorage # DevTools → Application → Clear
□ Reload page        # Fresh start
```

### Test Phase 1 (ArcGIS)
```
□ Enter: 408 NW 116th St, Vancouver, WA
□ Click: "Scan for Hazards"
□ Wait: <1 second
□ Verify: Popup shows 95% confidence
□ Verify: Year built is ~1985
□ Verify: Lot size is ~0.25 acres
□ Verify: No yellow warning (Phase 1 succeeded)
✅ Result: GREEN CHECKMARK
```

### Test Phase 2 Fallback
```
□ Clear form / reload
□ Enter: 2341 Broadway, Everett, WA
□ Click: "Scan for Hazards"
□ Watch: DevTools console for "Phase 1 failed, attempting Phase 2"
□ Wait: 3-5 seconds (slower than Phase 1)
□ Verify: Popup shows 85% confidence
□ Verify: Yellow warning visible
□ Verify: Data appears (but less precise)
✅ Result: YELLOW WARNING (expected)
```

### Test Fallback Chain
```
□ Same as Phase 2 test
□ Console should show: "Phase 1 failed"
                       "Attempting Phase 2"
                       "Phase 2 succeeded"
□ Verify: Data from Phase 2 used
```

### Test Phase 5 (Historical Analysis)
```
□ Enter: 2847 Wallingford Ave N, Seattle, WA
□ Click: "Scan for Hazards" (gets Phase 1 data)
□ Click: "Analyze History" (new button in Step 6)
□ Wait: 2-3 seconds
□ Verify: Value history popup shows
  □ Current value: ~$750k
  □ Value 5 years ago: ~$600k
  □ Appreciation: ~5% annually
  □ Confidence: 70-80%
✅ Result: Timeline with values shown
```

---

## Expected Confidence Levels

| Phase | Operation | Confidence | Color | Explanation |
|-------|-----------|-----------|-------|-------------|
| 1 | ArcGIS API | 95% | 🟢 Green | Official county data |
| 2 | Browser scrape | 85% | 🟡 Yellow | Scraped from websites |
| 3 | RAG standardize | 99% | 🟢 Green | Official + AI cleanup |
| 4 | Vision image | 90% | 🟡 Yellow | AI image analysis |
| 4 | Vision PDF | 85% | 🟡 Yellow | AI document extract |
| 5 | Value history | 75% | 🟡 Yellow | Market estimation |
| 5 | Insurance trends | 70% | 🟡 Yellow | Market estimation |

---

## Speed Benchmarks

| Phase | Operation | Target | Budget | Actual (Expected) |
|-------|-----------|--------|--------|-------------------|
| 1 | ArcGIS | <0.5s | 1s | 0.5-1s |
| 2 | Browser | <4s | 5s | 3-5s |
| 3 | RAG | <0.5s | 1s | 0.5-1s |
| 4 | Vision | <2s | 3s | 2-3s |
| 5 | History | <2s | 3s | 2-3s |
| | **Full workflow** | **<10s** | **15s** | 10-15s |

**Slow?** Check:
- Network speed (DevTools → Network tab)
- API rate limits (check console for 429 errors)
- System load (check Activity Monitor)

---

## Error Handling Tests

### Test 1: Invalid Address
```
Input: "123 Fake Street, Nowhere, ZZ"
Expected: Alert shows "Address not found"
          No API calls made
          Form stays open
✅ Pass: User sees clear error message
```

### Test 2: Missing Fields
```
Input: "408 NW 116th" (missing city)
Expected: Alert: "Please enter complete address"
          No API calls made
✅ Pass: Form validates before API call
```

### Test 3: API Timeout
```
Simulate: Unplug network
Expected: Phase 1 times out after 5s
          Falls back to Phase 2
          Or shows "Unable to retrieve data"
✅ Pass: Graceful error handling
```

---

## Console Commands (For Debugging)

```javascript
// View stored form data
JSON.parse(localStorage.getItem('altech_v6'))

// Check last API response
console.log(window.lastApiResponse)

// Simulate Phase 1 failure
window.skipPhase1 = true

// Simulate API timeout
window.debugMode = 'slow'

// View confidence scores
console.log(window.confidenceScores)

// View performance timings
console.log(window.performanceMetrics)
```

---

## Common Issues & Solutions

### Issue: Parcel data not appearing
```
❌ Problem: Click scan, nothing happens
✅ Solution: 
   1. Check console for errors (F12)
   2. Verify API key in .env file
   3. Try different address (test fixture address)
   4. Check if county is supported (see list below)
```

### Issue: Takes too long (>5 seconds)
```
❌ Problem: Waiting 10+ seconds
✅ Solution:
   1. Check internet speed
   2. Check if Phase 2 fallback triggered (should be 3-5s)
   3. Try Phase 1-only address
   4. Check browser DevTools performance tab
```

### Issue: Confidence showing as 0%
```
❌ Problem: Popup shows "0% confidence"
✅ Solution:
   1. This shouldn't happen - check for errors
   2. May indicate data parsing failure
   3. Clear localStorage and try again
   4. Check console for specific error
```

### Issue: "85% confidence" when expecting "95%"
```
❌ Problem: Phase 2 triggered instead of Phase 1
❌ Why: County not supported by Phase 1 (ArcGIS)
✅ Solution: This is expected behavior
   - Use Phase 1-supported address (Clark, King, Pierce, Multnomah)
   - Or expect Phase 2 fallback (Snohomish, Thurston, Lane, Marion, Pinal)
```

---

## Success Criteria Checklist

### Phase 1 Tests ✅
- [ ] Clark County returns 95% confidence
- [ ] King County returns 95% confidence  
- [ ] Pierce County returns 95% confidence
- [ ] Multnomah County returns 95% confidence
- [ ] All return <1 second
- [ ] Parcel IDs valid format
- [ ] Year built reasonable
- [ ] Lot size reasonable

### Phase 2 Tests ✅
- [ ] Snohomish County returns 85% confidence
- [ ] Thurston County returns 85% confidence
- [ ] Lane County returns 85% confidence
- [ ] Marion County returns 85% confidence
- [ ] Pinal County returns 85% confidence
- [ ] All return 3-5 seconds
- [ ] Yellow warning visible
- [ ] Data quality reasonable

### Integration Tests ✅
- [ ] Phase 1 → Phase 3 chain works
- [ ] Phase 1 fail → Phase 2 fallback works
- [ ] No data loss in chains
- [ ] Speed acceptable end-to-end
- [ ] Errors handled gracefully

### Phase 5 Tests ✅
- [ ] Value history calculates
- [ ] Insurance trends show
- [ ] Market comparison works
- [ ] Timeline generates
- [ ] All show 70-80% confidence

---

## Before/After Test Verification

### Before Each Test Session
```bash
□ npm run dev          # Fresh start
□ Clear localStorage   # DevTools → Storage → Clear All
□ Close other tabs     # Reduce interference
□ Check internet       # Ensure good connection
□ Open DevTools        # Console ready
```

### After Each Test Session
```bash
□ Copy test results to spreadsheet
□ Note any errors seen
□ Check console for warnings
□ Record performance times
□ Document any failures
□ Close DevTools
□ Commit test data
```

---

## Quick Reference Sheet

### Supported Counties (Phase 1 - ArcGIS)
```
✅ Clark County, WA
✅ King County, WA
✅ Pierce County, WA
✅ Multnomah County, OR
❌ Snohomish County, WA (Phase 2 fallback)
❌ Thurston County, WA (Phase 2 fallback)
❌ Lane County, OR (Phase 2 fallback)
❌ Marion County, OR (Phase 2 fallback)
❌ Pinal County, AZ (Phase 2 fallback)
```

### Confidence Levels (Color Coding)
```
🟢 95%+ = Official data (ArcGIS Phase 1)
🟢 99%  = Standardized official data (Phase 3)
🟡 85%  = Scraped/estimated data (Phase 2)
🟡 90%  = Vision processed (Phase 4)
🟡 75%  = Market data (Phase 5)
```

### Speed Expectations
```
⚡ <1 second = Phase 1 (ArcGIS) or Phase 3 (RAG)
⚡ 2-3 seconds = Phase 4 (Vision) or Phase 5 (History)
🔄 3-5 seconds = Phase 2 (Browser scrape)
🔄 5+ seconds = Full chain execution
```

---

**Print this → Tape it to your monitor during Phase 5.5 testing! 📌**

