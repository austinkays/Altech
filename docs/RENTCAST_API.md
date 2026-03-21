# Rentcast API Bible — Agent Reference

> **Authoritative reference** for all Rentcast API usage in `api/property-intelligence.js`.  
> Last updated: March 2026. Based on official Rentcast documentation.

---

## Available Endpoints

| Endpoint | Method | Purpose | Currently used |
|----------|--------|---------|---------------|
| `/v1/properties` | GET | Property records, structural data, features | ✅ Yes — `fetchRentcastData()` |
| `/v1/properties/{id}` | GET | Single property by Rentcast ID | ❌ Not yet |
| `/v1/avm/value` | GET | Market value estimate + sale comps | ❌ Not yet — planned |
| `/v1/avm/rent/long-term` | GET | Rent estimate + rental comps | ❌ Not needed |

**Auth:** All requests require header `X-Api-Key: process.env.RENTCAST_API_KEY`  
**Base URL:** `https://api.rentcast.io`  
**Vercel env var:** `RENTCAST_API_KEY`

---

## ⚠️ KNOWN BUGS IN CURRENT IMPLEMENTATION

> Fix these before adding new Rentcast features.

### Bug 1 — Wrong field name for stories/floor count (CRITICAL)
**File:** `api/property-intelligence.js` → `fetchRentcastData()`  
**Problem:** Code reads `prop.features?.stories` — **this field does not exist in Rentcast's schema**  
**Correct field:** `features.floorCount` (number — above-ground floors)

```javascript
// ❌ WRONG — field doesn't exist, always returns null
stories: prop.features?.stories ?? null

// ✅ CORRECT
stories: prop.features?.floorCount ?? null
```

### Bug 2 — `flooring` field doesn't exist in Rentcast
**Problem:** Rentcast has no `flooring` field at all. Any mapping to it returns null.  
**Action:** Remove from Rentcast mapping. Gemini fallback handles flooring.

### Bug 3 — `numFireplaces` mapped to wrong field
**Problem:** Rentcast has `features.fireplace` (boolean) and `features.fireplaceType` (string like "Masonry") — no numeric count field.  
**Action:** Map `features.fireplace` → boolean presence only, or omit. Cannot get a number count from Rentcast.

---

## Endpoint 1 — Property Records (`/v1/properties`)

### Request

```javascript
// Node.js fetch pattern
const address = `${streetAddress}, ${city}, ${state}, ${zip}`;
const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}&limit=1`;
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    'X-Api-Key': process.env.RENTCAST_API_KEY
  }
};
const res = await fetch(url, options);
const data = await res.json(); // returns array
const prop = data[0]; // first result
```

### Address Format Rules
- **Always use:** `Street, City, State, Zip` as a single `address` parameter
- **Case-sensitive** — `city` and `state` params are case-sensitive if used separately
- **State:** 2-character abbreviation (e.g. `WA`, `TX`, `CA`)
- **Zip:** Always include — improves match rate significantly
- **A miss (empty array) means the property isn't in Rentcast's database** — not a format error

### Query Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| `address` | string | Full address `Street, City, State, Zip` — primary lookup method |
| `city` | string | Case-sensitive |
| `state` | string | 2-char abbreviation, case-sensitive |
| `zipCode` | string | 5-digit |
| `latitude` + `longitude` | float | Alternative to address for area search |
| `radius` | float | Miles, max 100 — use with lat/lng for area search |
| `propertyType` | enum | `Single Family`, `Condo`, `Townhouse`, `Manufactured`, `Multi-Family`, `Apartment`, `Land` |
| `limit` | int | 1–500, defaults to 50 — **always set to 1 for single property lookup** |
| `offset` | int | Pagination offset, defaults to 0 |

### Response — Top-Level Fields

| Field | Type | Altech mapped key | Status |
|-------|------|-------------------|--------|
| `id` | string | — | Rentcast property ID, address-derived |
| `formattedAddress` | string | — | |
| `addressLine1` | string | — | |
| `city` / `state` / `zipCode` | string | — | |
| `county` | string | — | |
| `latitude` / `longitude` | number | — | |
| `propertyType` | string | — | e.g. `Single Family` |
| `bedrooms` | number | `bedrooms` | ✅ mapped |
| `bathrooms` | number | `fullBaths` | ✅ mapped (renamed) |
| `squareFootage` | number | `totalSqft` | ✅ mapped (renamed) |
| `lotSize` | number | `lotSize` | ✅ mapped (sq ft) |
| `yearBuilt` | number | `yearBuilt` | ✅ mapped |
| `assessorID` | string | — | APN/parcel number from county |
| `lastSaleDate` | date-time | — | ISO 8601 |
| `lastSalePrice` | number | — | |
| `ownerOccupied` | boolean | — | |

### Response — `features` Object (Complete Schema)

> ⚠️ Boolean fields (cooling, fireplace, garage, heating, pool) are **presence flags only** — always use the corresponding `Type` field for the actual string value.

| Field | Type | Altech mapped key | Notes |
|-------|------|-------------------|-------|
| `features.architectureType` | string | `architectureType` | ✅ mapped |
| `features.cooling` | boolean | — | Presence flag only |
| `features.coolingType` | string | `cooling` | ✅ mapped. e.g. `"Central"` |
| `features.exteriorType` | string | `exteriorWalls` | ✅ mapped (renamed) |
| `features.fireplace` | boolean | — | Presence flag only |
| `features.fireplaceType` | string | `fireplaceType` | ✅ mapped. e.g. `"Masonry"`, `"Gas Log"` |
| `features.floorCount` | number | `stories` | ✅ **USE THIS for stories** (Bug 1 fix) |
| `features.foundationType` | string | `foundationType` | ✅ mapped |
| `features.garage` | boolean | — | Presence flag only |
| `features.garageSpaces` | number | `garageSpaces` | ✅ mapped |
| `features.garageType` | string | `garageType` | ✅ mapped |
| `features.heating` | boolean | — | Presence flag only |
| `features.heatingType` | string | `heatingType` | ✅ mapped |
| `features.pool` | boolean | `pool` | ✅ mapped → `true="Yes"`, `false="No"` |
| `features.poolType` | string | — | Not mapped |
| `features.roofType` | string | `roofType` | ✅ mapped |
| `features.roomCount` | number | — | Total interior rooms |
| `features.unitCount` | number | — | Units in building |
| `features.viewType` | string | `viewType` | ✅ mapped. Watch for `"Waterfront"`, `"Flood Plain"` |
| ~~`features.flooring`~~ | — | — | ❌ DOES NOT EXIST in Rentcast (Bug 2) |
| ~~`features.stories`~~ | — | — | ❌ DOES NOT EXIST in Rentcast (Bug 1) |

### Response — Other Nested Objects

| Object | Contents | Use case |
|--------|----------|----------|
| `hoa.fee` | Monthly HOA amount | ✅ mapped → `hoaFee` |
| `taxAssessments[YYYY]` | `year`, `value`, `land`, `improvements` | Not currently used |
| `propertyTaxes[YYYY]` | `year`, `total` | Not currently used |
| `history[YYYY-MM-DD]` | `event`, `date`, `price` | Sale history — not currently used |
| `owner.names` | Array of owner name strings | Not currently used |
| `owner.type` | `"Individual"` or `"Organization"` | Not currently used |
| `owner.mailingAddress` | Full address object | Not currently used |

---

## Endpoint 2 — Property Record by ID (`/v1/properties/{id}`)

```javascript
// ID format is address-derived, case-sensitive
const id = '408-NW-116th-St,-Vancouver,-WA-98685';
const url = `https://api.rentcast.io/v1/properties/${encodeURIComponent(id)}`;
```

**Notes:**
- Returns single object (not array)
- Same schema as `/v1/properties` response
- ID must be obtained from a prior `/v1/properties` address search — cannot use APN/parcel number
- Not currently implemented — would require caching Rentcast IDs from address lookups

---

## Endpoint 3 — Value Estimate (`/v1/avm/value`) — NOT YET IMPLEMENTED

### Purpose
Returns current market value (AVM) + comparable sale listings for a property. Useful for building a **market value / replacement cost context display** in the intake form.

### Request

```javascript
const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`;
// Optional params for better accuracy:
// &propertyType=Single+Family
// &bedrooms=3&bathrooms=2&squareFootage=1344
// &compCount=15  (5–25, default 15)
// &maxRadius=5   (miles)
// &daysOld=270   (max age of comps)
```

### Query Parameters

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `address` | string | required | `Street, City, State, Zip` |
| `latitude` + `longitude` | float | alt to address | Cannot use with `lookupSubjectAttributes` |
| `propertyType` | enum | auto-lookup | Same values as `/v1/properties` |
| `bedrooms` | float | auto-lookup | Override if known |
| `bathrooms` | float | auto-lookup | Supports fractions |
| `squareFootage` | float | auto-lookup | Total living area sq ft |
| `maxRadius` | float | internal default | Max distance to comps in miles |
| `daysOld` | int | internal default | Max age of comp listings |
| `compCount` | int | 15 | Number of comps to use (5–25) |
| `lookupSubjectAttributes` | boolean | true | Auto-looks up property type/beds/baths from address |

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `price` | number | Estimated market value |
| `priceRangeLow` | number | Low end of estimate range |
| `priceRangeHigh` | number | High end of estimate range |
| `subjectProperty` | object | Property details used for AVM |
| `comparables` | array | Sale comps sorted by `correlation` descending |

### Comparable Fields

| Field | Type | Description |
|-------|------|-------------|
| `price` | number | Listed sale price |
| `status` | string | `"Active"` or `"Inactive"` |
| `distance` | number | Miles from subject property |
| `correlation` | number | Similarity ratio 0–1 (1 = identical) |
| `daysOld` | number | Days since last seen on market |
| `daysOnMarket` | number | Total days listing was active |
| `listingType` | string | e.g. `"Standard"` |

### AVM Accuracy Tips
- Pass `bedrooms`, `bathrooms`, `squareFootage` if already known — improves comp matching significantly
- `lookupSubjectAttributes=true` (default) works when using `address` parameter
- For Portland/Vancouver WA market: try `maxRadius=5`, `daysOld=270`, `compCount=15`
- If "not enough comps" error: gradually increase `maxRadius` or `daysOld`
- AVM = **market value**, not replacement/rebuild cost — these differ and both matter for homeowners insurance

### Insurance Use Case
- Display estimated market value alongside dwelling coverage amount
- Show comparable sales so agent can sanity-check Coverage A recommendations
- Note to user: rebuild cost typically differs from market value — use market value as a reference, not as the coverage amount

---

## Feature Field Enum Values (Complete)

### `features.architectureType`
`1.5 Story`, `2+ Story`, `A-Frame`, `Apartment`, `Bi-Level`, `Bungalow`, `Cabin`, `Cape Cod`, `Chalet`, `Colonial`, `Colonial Revival`, `Condo`, `Condominium`, `Contemporary`, `Conventional`, `Cottage`, `Custom`, `Dome`, `Duplex`, `English`, `European`, `Farm House`, `French Provincial`, `Gambrel`, `Georgian`, `High Rise`, `Historical`, `Log Cabin`, `Low Rise`, `Mansion`, `Manufactured`, `Mediterranean`, `Mid Rise`, `Mobile Home`, `Modern`, `Modular`, `Multi-family`, `Multi-Unit Building`, `Old Style`, `Other`, `Prefab`, `Quadruplex`, `Raised Ranch`, `Rambler`, `Ranch`, `Ranch House`, `Row End or Row Middle`, `Rustic`, `Single Story`, `Southwestern`, `Spanish`, `Split Entry`, `Split Foyer`, `Split Level`, `Townhouse`, `Traditional`, `Triplex`, `Tudor`, `Two Family`, `Under Construction`, `Victorian`

### `features.coolingType`
`Central`, `Chilled Water`, `Commercial`, `Evaporative`, `Fan Cooling`, `Geo-Thermal`, `Other`, `Package`, `Partial`, `Refrigeration`, `Solar`, `Split System`, `Ventilation`, `Wall`, `Window`

### `features.exteriorType`
`Adobe`, `Aluminum`, `Aluminum Lap`, `Aluminum Siding`, `Asbestos Shingle`, `Asphalt Shingle`, `Baked Enamel`, `Block`, `Board & Batten`, `Brick`, `Brick Veneer`, `Cinder Block`, `Combination`, `Composition`, `Concrete`, `Concrete Block`, `Frame`, `Frame Brick`, `Frame Siding`, `Glass`, `Log`, `Marble`, `Marblecrete`, `Masonite`, `Masonry`, `Metal`, `Metal Siding`, `Other`, `Plywood`, `Precast Concrete Panel`, `Rock`, `Shake`, `Shingle`, `Shingle Siding`, `Siding`, `Single Wall`, `Steel Panel`, `Stone`, `Stone Veneer`, `Stucco`, `Tile`, `Veneer`, `Vinyl`, `Vinyl Siding`, `Wood`, `Wood Frame`, `Wood Shingle`, `Wood Siding`

### `features.fireplaceType`
`1 Story`, `1 Story Brick Chimney`, `2 Story`, `2 Story Brick Chimney`, `Backed`, `Flue Only`, `Gas Log`, `Masonry`, `Metal`, `Other`, `Prefab`, `Single`, `Stacked`, `Stacked Stone`, `Steel`

### `features.foundationType`
`Block`, `Block with Runner`, `Brick`, `Concrete`, `Concrete Block`, `Crawl`, `Crossed Walls`, `Footing`, `Girder`, `Masonry`, `Mat`, `Mud Sill`, `Other`, `Pier`, `Pile`, `Post & Beam`, `Raft`, `Raised`, `Retaining Wall`, `Slab`, `Stone`, `Wood`

### `features.garageType`
`Attached`, `Basement`, `Built-in`, `Carport`, `Covered`, `Detached`, `Garage`, `Mixed`, `Offsite`, `Open`, `Other`, `Parking Lot`, `Parking Structure`, `Paved`, `Surfaced`, `Underground`

### `features.heatingType`
`Baseboard`, `Central`, `Coal`, `Convection`, `Electric`, `Floor`, `Floor Furnace`, `Forced Air`, `Forced Air Gas`, `Furnace`, `Gas`, `Gravity`, `Heat Pump`, `Hot Air`, `Hot Water`, `Oil`, `Other`, `Package`, `Partial`, `Propane`, `Radiant`, `Solar`, `Space`, `Steam`, `Stove`, `Vent`, `Wall`, `Warm Air`, `Zone`

### `features.poolType`
`Above-Ground Pool`, `Commercial Pool`, `Community Pool`, `Concrete`, `Enclosed Pool`, `Fiberglass`, `Gunite`, `Heated Pool`, `Hot Tub`, `In-Ground Pool`, `In-Ground Vinyl Pool`, `Indoor Pool`, `Municipal`, `Other`, `Plastic`, `Plastic Lined`, `Plastic w/ Vinyl Lining`, `Pool and Hot Tub`, `Public`, `Reinforced Concrete`, `Spa`, `Vinyl`

### `features.roofType`
`Aluminum`, `Asbestos`, `Asphalt`, `Asphalt Shingle`, `Built-up`, `Cedar Shake`, `Clay Tile`, `Composition Shingle`, `Concrete`, `Concrete Tile`, `Fiberglass`, `Galvanized`, `Gambrel`, `Gravel`, `Metal`, `Other`, `Rock`, `Roll Composition`, `Roll Paper`, `Roll Tar & Gravel`, `Shake`, `Shingle`, `Slate`, `Slate Tile`, `Steel`, `Tar & Gravel`, `Tile`, `Wood`, `Wood Shake`, `Wood Shingle`

### `features.viewType`
`Airport`, `Average`, `Beach`, `Canal`, `City`, `Corner`, `Creek`, `Cul-de-sac`, `Excellent`, `Fair`, `Fairway`, `Flood Plain`, `Flood Zone`, `Freeway`, `Golf Course`, `Good`, `High Traffic Area`, `Lake`, `Major Street`, `Mountain`, `Ocean`, `Other`, `Park`, `Pond`, `River`, `School`, `Thoroughfare`, `Water`, `Waterfront`

---

## Search Query Syntax

### Single Property (primary use case)
```
GET /v1/properties?address=408%20NW%20116th%20St%2C%20Vancouver%2C%20WA%2C%2098685
```

### Multiple Values (pipe-separated)
```
propertyType=Condo|Townhouse
bedrooms=2|3
```

### Numeric Ranges (colon-separated, * for open-ended)
```
bedrooms=1:3          → 1 to 3 bedrooms
squareFootage=1000:*  → 1000+ sq ft
yearBuilt=2000:*      → built 2000 or later
saleDateRange=*:270   → sold within last 270 days
```

---

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 401 | Auth error — invalid or missing `X-Api-Key` |
| 404 | Property not found |

---

## Fields NOT Available in Rentcast (use Gemini fallback)

These fields cannot be obtained from Rentcast and must come from Gemini or ArcGIS:

- `flooring` — not in Rentcast schema
- `numFireplaces` — Rentcast has boolean + type string, not a count
- `roofAge` / `roofMaterial` distinction — only `roofType` available
- `heatingFuel` — not in schema
- `waterHeater` — not in schema
- `dwellingType` / `constructionType` — not in schema
- Fire protection class / distance to station — ArcGIS only
- Parcel/APN geometry data — ArcGIS only (Rentcast has `assessorID` string but not parcel geometry)

---

## FEMA Flood Zone (NFHL ArcGIS)

> **No API key required.** Public FEMA endpoint, bundled into the `?mode=arcgis` response as `floodData`.

### Endpoint

```
GET https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query
  ?geometry={lng},{lat}
  &geometryType=esriGeometryPoint
  &inSR=4326
  &spatialRel=esriSpatialRelIntersects
  &outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE
  &returnGeometry=false
  &f=json
```

Coordinates are sourced from the ArcGIS parcel result (`parcelData.latitude` / `parcelData.longitude`) — no separate geocoding step.

### Response Field Mapping

| FEMA Field | Altech Field | Type | Notes |
|-----------|-------------|------|-------|
| `FLD_ZONE` | `floodZone` | `string` | e.g. `"AE"`, `"X"`, `"VE"` |
| `ZONE_SUBTY` | `floodZoneSubtype` | `string\|null` | e.g. `"0.2 PCT ANNUAL CHANCE FLOOD HAZARD"` |
| `SFHA_TF` | `sfha` | `boolean` | `"T"` → `true` (high risk, flood insurance typically required), `"F"` → `false` |
| `STATIC_BFE` | `baseFloodElevation` | `number\|null` | Base Flood Elevation in feet; `null` if not available |

### Integration Notes

- Called inside `fetchFloodZone(lat, lng)` in `api/property-intelligence.js`
- Runs in parallel with Clark County enrichment via `Promise.allSettled` in `handleArcgis()`
- **5-second timeout** enforced via `AbortController` — returns `null` and continues on timeout
- Result is attached to the `?mode=arcgis` response as `result.floodData`
- Client (`js/app-property.js → fetchArcgisAndRag()`) threads `floodData` through to `showUnifiedDataPopup()`
- UI: Flood Zone fields appear in the Summary tab grid; SFHA risk chip shown below the grid
  - `sfha === true` → red `⚠️ High Risk — flood insurance may be required`
  - `sfha === false` → green `✓ Low/Moderate Risk`
  - No flood data returned → card/chip absent (silent fallback)

### Common Zone Designations

| Zone | SFHA | Description |
|------|:----:|-------------|
| `A`, `AE`, `AH`, `AO` | ✅ Yes | High risk — 1% annual flood chance |
| `VE`, `V` | ✅ Yes | High risk + wave action (coastal) |
| `X` (shaded) | ❌ No | Moderate risk — 0.2% annual chance |
| `X` (unshaded) | ❌ No | Minimal risk — outside 500-yr floodplain |
| `D` | ❌ No | Undetermined risk |
