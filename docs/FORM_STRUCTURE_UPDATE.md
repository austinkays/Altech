# Form Structure Update - Better Flow

## New 7-Step Structure

The form has been reorganized for a more intuitive experience with clear separation between personal info, home, and auto sections.

### Step 0: Policy Scan (Optional)
- Upload photos/PDFs of existing policies
- AI extracts data to pre-fill form
- Can skip entirely and fill manually

### Step 1: Personal Information
**Content:** Contact details and demographics only
- Name, email, phone, date of birth
- Marital status
- Education level
- Industry/occupation

**Why separate?** Basic personal info should be collected first, before asking about coverage needs.

---

### Step 2: Coverage Type Selection
**Content:** What would you like to insure?
- 🏠 HOME - Property insurance
- 🚗 AUTO - Vehicle insurance
- 🎯 BOTH - Home + Auto bundle

**Why separate?** This decision determines which subsequent steps are shown. Making it its own step makes the flow clearer and allows for automatic navigation.

---

### Step 3: Property Details (Home/Both only)
**Content:** Everything about the property
- Address with Google Places autocomplete
- Property details (year built, sq ft, stories, etc.)
- Construction details (exterior walls, roof, foundation)
- Systems (heating, cooling, plumbing, electrical)
- Safety features (fire station distance, alarms, sprinklers)

**Workflow:**
- Shown if user selects "HOME" or "BOTH"
- Skipped if user selects "AUTO" only

---

### Step 4: Vehicle & Driver Info (Auto/Both only)
**Content:** Driver and vehicle details
- **Driver Information Card:**
  - Driver's license number and state
- **Vehicle Information Card:**
  - VIN (with auto-decode)
  - Vehicle description
  - Primary use, annual mileage
  - Commute distance
  - Ride sharing participation
  - Telematics willingness

**Workflow:**
- Shown if user selects "AUTO" or "BOTH"
- Skipped if user selects "HOME" only

---

### Step 5: Risk Factors & Additional Info (Always shown)
**Content:** Universal information needed for all policies
- **Risk Factors Card:**
  - Swimming pool
  - Trampoline
  - Wood burning stove
  - Dogs/pets
  - Business on property
  
- **Insurance History Card:**
  - Current liability limits
  - Home and auto deductibles
  - Prior carrier and years with them
  - Prior policy expiration
  - Accidents (last 5 years)
  - Violations (last 3 years)
  - Student GPA (if applicable)
  
- **Additional Information Card:**
  - Mortgagee/lienholder
  - Additional insured parties
  - Best time to contact
  - Referral source
  - TCPA consent checkbox

**Why always shown?** Risk factors and insurance history are relevant regardless of coverage type.

---

### Step 6: Review & Export (Always shown)
**Content:** Export options and quote library
- Download EZLynx XML
- Download PDF Summary
- Quote Library (save multiple drafts)
- Batch export selected quotes as ZIP
- Clear all data and start new

---

## Workflow Paths

### Home Only (6 steps)
```
Step 0 (optional) → Step 1 → Step 2 → Step 3 → Step 5 → Step 6
   Scan          Personal  Coverage  Property  Risk/Info  Export
```

### Auto Only (6 steps)
```
Step 0 (optional) → Step 1 → Step 2 → Step 4 → Step 5 → Step 6
   Scan          Personal  Coverage  Vehicle  Risk/Info  Export
```

### Both (7 steps - all steps)
```
Step 0 (optional) → Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6
   Scan          Personal  Coverage  Property  Vehicle  Risk/Info  Export
```

---

## Key Improvements

### ✅ Better Organization
- Personal info separate from coverage selection
- Home and auto completely separated (no more mixed cards)
- Risk factors in dedicated step (applies to all)

### ✅ Clearer Labels
- Each step has descriptive title in progress bar
- Card headers clearly indicate content type
- Subtitles explain purpose

### ✅ Logical Progression
1. Who you are
2. What you need
3. Property details (if applicable)
4. Vehicle details (if applicable)
5. Risk & history (everyone)
6. Review & export

### ✅ Reduced Confusion
- No more "why am I seeing auto fields when I selected home?"
- Coverage type selection happens early and determines flow
- Each step focused on one topic

---

## Technical Changes

### Updated Code Sections

**Workflows (index.html ~line 787):**
```javascript
workflows: {
    home: ['step-0', 'step-1', 'step-2', 'step-3', 'step-5', 'step-6'],
    auto: ['step-0', 'step-1', 'step-2', 'step-4', 'step-5', 'step-6'],
    both: ['step-0', 'step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6']
}
```

**Step Titles (index.html ~line 793):**
```javascript
stepTitles: {
    'step-0': 'Policy Scan',
    'step-1': 'Personal Information',
    'step-2': 'Coverage Type',
    'step-3': 'Property Details',
    'step-4': 'Vehicle & Driver Info',
    'step-5': 'Risk Factors & Additional Info',
    'step-6': 'Review & Export'
}
```

### Removed Duplicate Content
- Step 4 no longer has duplicate risk factors (pool, trampoline, etc.)
- Insurance history now only in Step 5
- Additional information now only in Step 5

---

## User Experience Impact

**Before (4 steps - confusing):**
- Step 1: Everything mixed together (personal + coverage type)
- Step 2: Property (sometimes hidden)
- Step 3: Risk + Auto + History + Additional Info (huge, confusing)
- Step 4: Export

**After (7 steps - intuitive):**
- Step 0: Optional scan
- Step 1: Just personal info
- Step 2: Choose coverage type
- Step 3: Property (if applicable)
- Step 4: Vehicle (if applicable)
- Step 5: Risk & history (everyone)
- Step 6: Export

**Result:** Each step is focused, shorter, and makes sense in the context of the overall flow.

---

*Updated: February 4, 2026*
