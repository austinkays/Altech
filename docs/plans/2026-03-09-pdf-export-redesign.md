# PDF Export Redesign — Design Document
**Date:** 2026-03-09
**File:** `js/app-export.js` → `buildPDF()`
**Library:** jsPDF (existing, no new dependencies)

---

## Context

The PDF export is an **internal agent record** — not client-facing. Agents print in greyscale. The goal is to preserve every field currently in the PDF while improving visual hierarchy, scannability, and fixing a silent data-truncation bug.

---

## Problems With the Current PDF

1. **Silent truncation bug** — `kvTable()` calls `doc.splitTextToSize()` but only renders `valLines[0]`. Long values (mortgagee names, additional insureds, etc.) are silently cut off.
2. **No at-a-glance summary** — Agent must flip through pages to find key numbers.
3. **Flat visual hierarchy** — All section headers look identical; no grouping between Personal / Home / Auto / Policy blocks.
4. **Density waste** — Property Details (20 fields) and Building Systems (10 fields) use 2-column layout; 3-column would fit them on significantly fewer pages.
5. **Small font** — 7–8pt label text is hard to read on greyscale prints.
6. **No risk flag callout** — Risk items (old roof, pool, WUI) buried in Risk & Protection section.

---

## Design Decisions

### Greyscale-first
No color dependencies. Hierarchy achieved via:
- **Fill density**: 0% (white) → 8% (row stripe) → 18% (subsection accent) → 40% (group divider) → 88% (summary card)
- **Border weight**: 0.2pt (row lines) → 0.5pt (section bottom) → 1.5pt (group left rule)
- **Font weight**: 60%-grey 8pt bold label → black 9pt normal value

### Summary Card (new — top of page 1)
A dark-fill rectangle with white text. Shows the most-needed fields at a glance without replacing any detail sections:

```
JOHN SMITH — HOME & AUTO                    APP-2026-0309-4821
DOB: 05/12/1978  ·  Portland, OR 97086      03/09/2026 2:14 PM

Dwelling $350,000  |  Liability 100/300  |  2 Vehicles  |  1 Driver
Eff. 04/01/2026    |  Prior: State Farm  |  Accidents: 0
```

Fields in summary card:
- Client name + quote type badge
- DOB + full address
- Dwelling coverage, liability limits (auto), vehicle count, driver count
- Effective date, prior carrier, accidents/violations count

### Section Grouping (4 visual groups)
Each group is separated by a full-width rule with a 40%-grey group label bar:

```
▓▓▓▓  PERSONAL INFORMATION  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  Applicant
  Co-Applicant (conditional)
  Property Address

▓▓▓▓  HOME  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  Property Details          Building Systems
  Risk & Protection         Home Coverage

▓▓▓▓  AUTO  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  Drivers (detail cards)
  Vehicles (detail cards)
  Auto Coverage

▓▓▓▓  POLICY & HISTORY  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  Policy & Prior Insurance
  Additional Information
```

Group bars: `fillColor(65, 65, 65)`, white text, 6.5pt, uppercase, full page width.

Section headers within a group: `fillColor(220, 220, 220)`, dark text, 8pt bold. Slightly smaller than current to create visual hierarchy between group and section.

### Column Layout Per Section

| Section | Layout | Reason |
|---|---|---|
| Applicant | 2-col | Standard density |
| Co-Applicant | 2-col | Standard density |
| Property Address | 2-col | Standard density |
| **Property Details** | **3-col** | 20 fields, mostly short values |
| **Building Systems** | **3-col** | 10 fields, year values |
| Risk & Protection | 2-col | Yes/No values |
| Home Coverage | 2-col | Some long field names |
| Drivers | Detail cards | One card per driver |
| Vehicles | Detail cards | One card per vehicle |
| Auto Coverage | 2-col | Standard density |
| Policy & Prior | 2-col | Standard density |
| Additional Info | 2-col | Standard density |

### Truncation Fix
Replace in `kvTable()`:
```js
// BEFORE (truncates)
doc.text(valLines[0] || '', valX, cellY + 3.5);

// AFTER (wraps, row expands)
const lineH = 4;
valLines.slice(0, 3).forEach((line, li) => {
    doc.text(line, valX, cellY + 3.5 + li * lineH);
});
// row height = max(rowH, valLines.length * lineH)
```
Cap at 3 lines to prevent runaway rows. Values beyond 3 lines are rare in practice (only free-text fields like additional insureds).

### Risk Flag Callout (conditional)
Rendered between summary card and first group, only when risk fields have noteworthy values:
- Roof age ≥ 20 years
- Year built < 1970
- Pool = Yes
- Trampoline = Yes
- Wood stove present
- Fire station distance > 5 miles

Rendered as a bordered box (1pt border, 6% fill, ⚠ Unicode prefix per item).

### Driver & Vehicle Cards
Each driver/vehicle gets a card with a 18%-grey header row ("Driver 1 — Jane Smith") and indented detail rows below. Multiple cards flow vertically. Same as today's `detailTable()` but with:
- Slightly larger header text (9.5pt)
- Better indent (12pt left margin for sub-rows)
- License # and state on same row

### Typography
| Element | Current | New |
|---|---|---|
| Label | 8pt bold, mid-grey | 8pt bold, 55%-grey |
| Value | 8pt normal, dark | 9pt normal, black |
| Section header | 8pt bold, white on blue | 8pt bold, dark on 22%-grey |
| Group bar | n/a | 7pt bold, white on 65%-grey |
| Summary card | n/a | 10–11pt bold, white on 88%-grey |
| Footer | 7pt | 6.5pt |

### Footer
Unchanged: Page X of Y centered, timestamp right, "Generated by Altech Insurance Tools" left.

---

## Field Inventory (all preserved)

**Applicant:** Full Name, DOB, Gender, Marital Status, Phone, Email, Education, Industry, Occupation, Quote Type, Pronunciation
**Co-Applicant:** Full Name, DOB, Gender, Email, Phone, Relationship
**Property Address:** Street, City, State, ZIP, County, Years at Address
**Property Details:** Year Built, Sq Ft, Lot Size, Dwelling Type, Dwelling Use, Occupancy, Stories, Occupants, Bedrooms, Full Baths, Half Baths, Construction, Exterior Walls, Foundation, Garage Type, Garage Spaces, Kitchen/Bath Quality, Flooring, Fireplaces, Purchase Date
**Building Systems:** Roof Type, Roof Shape, Roof Updated, Heating Type, Heating Updated, Cooling, Plumbing Updated, Electrical Updated, Sewer, Water Source
**Risk & Protection:** Burglar Alarm, Fire Alarm, Smoke Detector, Sprinklers, Pool, Trampoline, Wood Stove, Secondary Heating, Dog on Premises, Business on Property, Fire Station (mi), Fire Hydrant (ft), Tidal Water (ft), Protection Class
**Home Coverage:** Policy Type, Dwelling Coverage, Personal Liability, Medical Payments, Deductible, Wind/Hail Ded, Mortgagee, Increased Repl. Cost, Ordinance or Law, Water Backup, Loss Assessment, Equipment Breakdown, Service Line, Animal Liability, Earthquake Coverage
**Drivers (per driver):** Name, DOB, Gender, Marital Status, Relationship, Education, Occupation, License #, License State
**Vehicles (per vehicle):** Year/Make/Model, VIN, Usage, Annual Miles, Primary Driver
**Auto Coverage:** Policy Type, Residence Is, Liability Limits, Property Damage, Med Pay, UM Limits, UIM Limits, UMPD Limit, Comp Ded, Collision Ded, Rental Reimburse, Towing/Roadside, Student GPA
**Policy & Prior:** Policy Term, Effective Date, Home Prior Carrier/Term/Years/Exp, Auto Prior Carrier/Term/Years/Exp, Continuous Coverage, Accidents, Violations
**Additional Info:** Additional Insureds, Best Contact Time, Contact Method, Referral Source, TCPA Consent

---

## What Changes in Code

All changes are in `buildPDF()` inside `js/app-export.js`:

1. **Remove** color palette entries that won't print (`brand: [0,102,204]`, `brandLt`, `accent`, `warn`) — replace with greyscale equivalents
2. **Add** `groupBar()` helper — draws the 65%-grey full-width group divider
3. **Modify** `sectionHeader()` — 22%-grey fill, dark text (removes blue)
4. **Modify** `kvTable()` — fix truncation, support `cols=3`, expand row height for wrapped values
5. **Add** `summaryCard()` — draws the dark top card
6. **Add** `riskCallout()` — draws conditional risk flags box
7. **Reorder** sections to match the 4-group layout
8. **Update** `detailTable()` — improved driver/vehicle card styling

No new dependencies. No changes to data flow, field mapping, or export trigger.
