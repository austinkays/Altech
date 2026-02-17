# Intake Form Bug Fix Log — February 12, 2026

## Problem
The insurance intake form shows all steps on one page instead of segmenting them. Clicking "Next" does nothing — user is stuck on Quick Start (step-0).

## What the User Sees
- Opens `#quoting` → Quick Start (step-0) is visible
- Step 1 "About You" was also showing simultaneously (fixed partially)
- All property sections (Property Views, Home Basics, Construction Details, etc.) were visible at same time
- Clicking "Next" button does nothing — can't advance to step 1

## Root Causes Found

### Bug 1: step-3 closing `</div>` was premature (FIXED)
- **Location:** ~Line 2153 (original), inside step-3's Property Location card
- **What happened:** An extra `</div>` closed step-3 after just the first card. All subsequent property cards (Property Views, Home Basics, Construction, Roof, Systems, Safety, Risk, Coverage) floated outside any step div.
- **Fix applied:** Removed the premature `</div>`. Verified with div depth analysis — step-3 now wraps all property cards correctly (depth=1 throughout, closing at depth=0 before step-4).
- **Status:** ✅ FIXED and verified

### Bug 2: QuoteCompare syntax error (FIXED)
- **Location:** ~Line 20042
- **What happened:** Template literal had extra backtick: `` `;` `` instead of `` `; ``
- **Fix applied:** Removed extra backtick
- **Status:** ✅ FIXED

### Bug 3: `this.initialized` never set to true (FIXED)
- **Location:** End of `App.init()` method (~line 3340)
- **What happened:** `init()` never set `this.initialized = true`, so `navigateTo('quoting')` would re-run init every time
- **Fix applied:** Added `this.initialized = true;` at end of init()
- **Status:** ✅ FIXED

### Bug 4: `navigateTo` didn't await async `init()` (PARTIALLY FIXED — NOT WORKING)
- **Location:** `navigateTo()` method (~line 11497)
- **What happened:** `init()` is async (uses `await this.load()` which does AES-GCM decryption). But `navigateTo` called `entry.init()` without `await`. So:
  1. Container becomes visible immediately (display: block)
  2. `init()` fires but hasn't completed
  3. `this.flow` is still `[]` (empty array, initialized as `flow: []`)
  4. User clicks Next → `this.step < this.flow.length - 1` → `0 < -1` → false → nothing happens
- **Fix applied:** Made `navigateTo` async, changed `entry.init()` to `await entry.init()`, made quoting init return `async () => { if (!this.initialized) await this.init(); }`
- **Status:** ⚠️ APPLIED BUT USER SAYS IT'S STILL NOT WORKING

### Bug 5: step-1 missing `hidden` class (FIXED but may contribute)
- **Location:** Line 1882 `<div id="step-1" class="step">`
- **What happened:** step-0 and step-1 both lacked `hidden` in static HTML, so both showed before JS ran
- **Fix applied:** Changed to `class="step hidden"`
- **Status:** ✅ FIXED

## Layout Changes Applied (may need review)
- Name fields restructured: pronunciation buttons moved inside input fields using `.input-with-action` wrapper
- Email/Phone/DOB/Gender reorganized into consistent grid-2 rows
- Step-3 Property Location: Street+City on row 1, State+Zip on row 2 (all grid-2)
- New CSS class `.input-with-action` added for inline action buttons

## What HASN'T Been Tried Yet

### Theory 1: Encryption breaks init silently
- `init()` calls `await this.load()` → `CryptoHelper.decrypt()` → `crypto.subtle.encrypt/decrypt`
- `crypto.subtle` requires **secure context** (HTTPS or localhost)
- If running on `http://localhost:8000`, it should work. But if there's a port/protocol issue...
- **Test:** Add `console.log` statements before/after each await in init() to find where it hangs
- **Test:** Temporarily disable encryption: change `encryptionEnabled: true` to `false` at ~line 3080

### Theory 2: init() throws and swallows the error
- `navigateTo` calls `await entry.init()` but has no try/catch
- If init throws, the error goes to console but Next button still won't work
- **Test:** Wrap `await entry.init()` in try/catch with console.error
- **Test:** Open browser DevTools Console — look for red errors

### Theory 3: The `window.onload` handler isn't waiting properly
- `window.onload` at ~line 12480 calls `App.navigateTo(hashTool)` without await
- Since navigateTo is now async, this becomes fire-and-forget
- **Fix to try:** Make onload handler async: `window.onload = async () => { ... await App.navigateTo(...) }`

### Theory 4: Multiple navigateTo calls race
- `window.onload` fires → calls navigateTo('quoting')
- Then `hashchange` listener fires → calls navigateTo again
- Two async inits could race and leave flow in bad state
- **Fix to try:** Add a `this._initPromise` pattern to deduplicate

### Theory 5: `handleType()` in `applyData()` runs before flow is visible
- `load()` → `applyData()` → `handleType()` → `updateUI()` runs during init
- `updateUI()` calls `document.getElementById(curId).classList.remove('hidden')` 
- But if the quotingTool container isn't display:block yet (navigateTo sets it), step elements exist but parent is hidden
- When container becomes visible, the last updateUI state should still be correct
- **Unlikely** but worth checking

### Theory 6: Check browser console for actual error
- The most direct approach: open DevTools, go to Console tab, reload page with #quoting
- Look for any red error messages — these will tell you exactly what's failing
- **This should be the FIRST thing to try next session**

## Key Code Locations (line numbers approximate, may shift ±20 lines)
- `App` object definition: ~line 3076
- `App.init()`: ~line 3122
- `App.load()`: ~line 5044
- `App.applyData()`: ~line 5068
- `App.handleType()`: ~line 4904
- `App.updateUI()`: ~line 4918
- `App.next()`: ~line 4979
- `App.navigateTo()`: ~line 11497
- `window.onload`: ~line 12480
- `CryptoHelper`: ~line 2938
- `encryptionEnabled`: ~line 3080
- Step HTML: step-0 ~line 1868, step-1 ~line 1882, step-2 ~line 2035, step-3 ~line 2125
- `.hidden` CSS: ~line 188
- `.plugin-container` CSS: ~line 1495
- Workflows: ~line 3094
- Footer buttons: ~line 2900

## Quick Debug Script (paste in browser console)
```javascript
// Check current state
console.log('flow:', App.flow);
console.log('step:', App.step);
console.log('initialized:', App.initialized);
console.log('data keys:', Object.keys(App.data).length);

// Manual init test
App.init().then(() => {
    console.log('init completed');
    console.log('flow after init:', App.flow);
}).catch(e => console.error('init failed:', e));
```

## Files Modified
- `index.html` — all changes in this single file
- `.hintrc` — webhint config (no changes this session)
- `.vscode/settings.json` — editor config (no changes this session)

## Test Status
- 646 tests, 13 suites — ALL PASSING after changes
- Tests use JSDOM which doesn't have crypto.subtle, so they may not catch encryption-related bugs
