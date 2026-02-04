# 🏗️ GIS Data Retrieval Architecture - Enhancement Roadmap

## Current State (MVP - Working ✓)
- **County Detection**: 123 cities → correct county assessor sites
- **GIS Links**: Direct URLs to county assessor homepages
- **User Flow**: Click button → Open county GIS page → Manual search

## Proposed Enhancement Phases

---

## Phase 1: API Consumption (Recommended Next Step)

### Problem with Current Approach
- County websites require manual property search
- User must navigate county-specific UI
- No structured data returned to app

### Solution: ArcGIS REST API Integration

Most county assessors use **ArcGIS Server** backend. The front-end maps are powered by REST endpoints.

#### Implementation Pattern:

```javascript
/**
 * Phase 1: Direct ArcGIS REST API consumption
 * No web scraping, just JSON queries
 */
async getPropertyDataViaAPI(address, county) {
    // Example: Clark County, WA uses ArcGIS
    const arcgisUrl = `https://gis.clark.wa.gov/arcgis/rest/services/Maps/ParcelViewer/MapServer/find`;
    
    const response = await fetch(arcgisUrl, {
        method: 'POST',
        body: new URLSearchParams({
            'searchText': address,
            'f': 'json',
            'layers': '0' // Parcel layer
        })
    });
    
    const data = await response.json();
    // Returns: { results: [{ attributes: { PARCEL_ID, OWNER, VALUE, ... } }] }
    
    // Now pass structured data to Gemini (RAG pattern)
    return {
        parcelId: data.results[0].attributes.PARCEL_ID,
        owner: data.results[0].attributes.OWNER,
        assessedValue: data.results[0].attributes.ASSESSED_VALUE,
        // ... structured data
    };
}
```

#### Benefits:
- ✅ Structured JSON instead of HTML scraping
- ✅ 100% reliable (official data source)
- ✅ Fast (<500ms response times)
- ✅ Won't break if county redesigns website
- ✅ Can be cached (reduces API calls)

#### County-Specific Endpoints to Research:
```
Washington:
- Clark: gis.clark.wa.gov/arcgis/rest/services/
- King: gis.kingcounty.gov/arcgis/rest/services/
- Pierce: gis.piercecountywa.gov/arcgis/rest/services/

Oregon:
- Multnomah: gis.multco.us/arcgis/rest/services/
- Washington County: gis.oregonmetro.gov/arcgis/rest/services/

Arizona:
- Maricopa: gis.maricopa.gov/arcgis/rest/services/
- Pima: gis.pima.gov/arcgis/rest/services/
```

---

## Phase 2: Headless Browser Intermediary (Fallback)

### Problem
Some counties don't expose REST APIs or have:
- Login walls
- Complex search forms
- Disclaimer pages requiring clicks
- Session-based authentication

### Solution: Playwright/Puppeteer Worker

Build a serverless "Retrieval Worker" function that:
1. Navigates the county GIS site headlessly
2. Handles disclaimers and login flows
3. Searches for property
4. Extracts clean data
5. Returns JSON to main app

#### Implementation Pattern:

```javascript
/**
 * Phase 2: Headless browser for complex GIS sites
 * Handles disclaimer pages, complex forms, etc.
 */
async retrievePropertyDataHeadless(address, county) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Navigate to county GIS
    await page.goto(`https://${county.gisUrl}`);
    
    // Handle disclaimer (if present)
    const disclaimerBtn = await page.$('[data-testid="agree-button"]');
    if (disclaimerBtn) await disclaimerBtn.click();
    
    // Fill search form
    await page.fill('input[placeholder="Address or Parcel ID"]', address);
    await page.press('input', 'Enter');
    
    // Wait for results
    await page.waitForSelector('[data-testid="property-result"]');
    
    // Extract clean data
    const propertyData = await page.evaluate(() => {
        const result = document.querySelector('[data-testid="property-result"]');
        return {
            parcelId: result.querySelector('.parcel-id').textContent,
            owner: result.querySelector('.owner-name').textContent,
            value: result.querySelector('.assessed-value').textContent,
            // ... other fields
        };
    });
    
    await browser.close();
    return propertyData;
}
```

#### When to Use:
- County doesn't have public REST API
- Website requires authentication
- Interactive forms are necessary
- As fallback if Phase 1 API fails

#### Infrastructure:
- Run on Vercel Serverless Functions (2GB memory)
- Cache results in Redis (24-hour TTL)
- Timeout: 30 seconds max
- Fallback: Return "manual search" link if timeout

---

## Phase 3: RAG Pattern (Retrieval-Augmented Generation)

### Current Flow (Not Ideal)
```
User Address → Open County Site → User Reads Data → User Enters into Form
```

### Proposed Flow (RAG)
```
User Address → Backend Fetches Raw Data → Gemini Interprets → Auto-Fill Form
```

#### Implementation Pattern:

```javascript
/**
 * Phase 3: RAG - Retrieve data, then have Gemini interpret it
 * Gemini never searches—it only understands what we give it
 */
async getPropertyInsightsViaRAG(address, county) {
    // STEP 1: Fetch raw data (via API or headless browser)
    const rawData = await fetchPropertyData(address, county);
    
    // STEP 2: Build RAG prompt with the RAW DATA
    const ragPrompt = `
You are a property assessment expert. I have fetched raw data from the county assessor.
Analyze this data and extract insights for a home insurance quote.

RAW DATA FROM COUNTY ASSESSOR:
${JSON.stringify(rawData, null, 2)}

QUESTIONS TO ANSWER:
1. What is the property structure type (single-family, condo, etc.)?
2. How many stories?
3. What year was it built?
4. Approximate square footage?
5. Roof type (if visible in data)?
6. Any flagged issues (flood zone, fire zone, etc.)?

Return as JSON for form auto-fill.
    `;
    
    // STEP 3: Send RAW DATA + PROMPT to Gemini
    const response = await geminiAPI.generateContent({
        contents: [{
            role: 'user',
            parts: [{ text: ragPrompt }]
        }]
    });
    
    // STEP 4: Parse and auto-fill form
    const insights = JSON.parse(response.text());
    return {
        structure: insights.structure_type,
        stories: insights.stories,
        yearBuilt: insights.year_built,
        roofType: insights.roof_type,
        // ... auto-fill form fields
    };
}
```

#### Benefits:
- ✅ **Eliminates hallucinations**: Gemini sees "the truth" (real county data)
- ✅ **Zero manual entry**: User just clicks "Apply"
- ✅ **Faster processing**: No UI navigation, pure data interpretation
- ✅ **Audit trail**: Can log exactly what data Gemini saw
- ✅ **Compliance**: Data comes from official source

---

## Phase 4: Multimodal Processing (PDF/Image Analysis)

### Problem
Many counties provide property summaries as PDFs or complex image-based tables that are hard to parse programmatically.

### Solution: Gemini Multimodal API

```javascript
/**
 * Phase 4: Multimodal - Gemini reads PDFs and screenshots
 * Better at parsing complex tax tables than code-based scrapers
 */
async analyzePropertyPDFMultimodal(pdfUrl, county) {
    // STEP 1: Download property summary PDF
    const pdfBuffer = await fetch(pdfUrl).then(r => r.arrayBuffer());
    
    // STEP 2: Convert PDF to image (first page)
    const pdfImage = await convertPdfToImage(pdfBuffer, { page: 1 });
    
    // STEP 3: Send image directly to Gemini
    const response = await geminiAPI.generateContent({
        contents: [{
            role: 'user',
            parts: [
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: Buffer.from(pdfImage).toString('base64')
                    }
                },
                {
                    text: `
Analyze this property summary document and extract:
1. Parcel ID
2. Owner name
3. Property address
4. Land area (sq ft)
5. Building area (sq ft)
6. Year built
7. Structure type
8. Number of stories
9. Roof material
10. Any special assessments or flags

Return as JSON.
                    `
                }
            ]
        }]
    });
    
    return JSON.parse(response.text());
}
```

#### Use Cases:
- Counties that generate Property Account Summaries as PDFs
- Complex tax records with images/tables
- Survey maps and plat documents
- Historical property data

#### Benefits:
- ✅ Gemini's vision is better at reading tables than code parsing
- ✅ Handles handwritten notes, scans, OCR errors
- ✅ Works with any document format
- ✅ Can process multiple pages

---

## Implementation Roadmap

### Phase 1: API Consumption (PRIORITY)
**Timeline**: 2-3 weeks
**Effort**: Medium
**Impact**: High

```javascript
TODO:
[ ] Research ArcGIS REST endpoints for top 10 counties
[ ] Build generic ArcGIS query function
[ ] Test with Clark County (WA), King County (WA), Multnomah (OR)
[ ] Cache results in Redis (optional)
[ ] Add error handling and fallbacks
[ ] Unit tests for each county endpoint
```

### Phase 2: Headless Browser (FALLBACK)
**Timeline**: 2 weeks
**Effort**: Medium
**Impact**: Medium

```javascript
TODO:
[ ] Set up Playwright in Vercel environment
[ ] Create reusable browser automation patterns
[ ] Identify counties that need headless approach
[ ] Handle session management
[ ] Implement timeout/fallback logic
```

### Phase 3: RAG Pattern (INTEGRATION)
**Timeline**: 1 week
**Effort**: Low
**Impact**: High

```javascript
TODO:
[ ] Refactor smartAutoFill() to use RAG pattern
[ ] Create RAG prompt templates for each county data format
[ ] Test Gemini interpretation accuracy
[ ] Add confidence scores to results
[ ] Build user confirmation UI for edge cases
```

### Phase 4: Multimodal (ENHANCEMENT)
**Timeline**: 1-2 weeks
**Effort**: Low
**Impact**: Medium

```javascript
TODO:
[ ] Integrate pdf2image library
[ ] Build multimodal Gemini prompts
[ ] Test with sample PDFs from each county
[ ] Implement fallback to text extraction
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   USER INPUT (Address)                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Detect County/State  │  ← Current State ✓
         └───────────┬───────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   ┌─────────┐          ┌──────────────┐
   │ Phase 1 │          │   Phase 2    │
   │API Call │          │  Headless    │
   │(JSON)   │          │   Browser    │
   └────┬────┘          └───────┬──────┘
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Phase 3: RAG        │
         │  Gemini Interprets   │
         │  Structured Data     │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Raw Insights JSON   │
         │  (structured data)   │
         └──────────┬───────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   ┌─────────┐        ┌──────────────┐
   │ Auto-Fill│        │Phase 4: PDF  │
   │Form      │        │Multimodal    │
   └──────────┘        └──────────────┘
```

---

## Technical Stack Recommendations

### Phase 1 & 2
```
- Language: JavaScript (Vercel Serverless)
- HTTP Client: node-fetch or axios
- Browser Automation: playwright or puppeteer
- Caching: Redis (Upstash on Vercel)
- Timeout: 30 seconds max per function
```

### Phase 3 & 4
```
- AI Model: Google Gemini API (already in use)
- PDF Processing: pdfjs-dist or pdf-parse
- Image Processing: sharp (lightweight)
- Validation: zod (schema validation for API responses)
```

---

## Risk Mitigation

### API Rate Limiting
```javascript
// Implement exponential backoff
const fetchWithRetry = async (url, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fetch(url);
        } catch (e) {
            if (i < maxRetries - 1) {
                await sleep(1000 * Math.pow(2, i)); // 1s, 2s, 4s
            } else throw e;
        }
    }
};
```

### Fallback Chain
```
Phase 1 API → Phase 2 Headless → Manual Link → User Alert
```

### Data Validation
```javascript
// Always validate county data before sending to Gemini
const validatePropertyData = (data) => {
    const schema = z.object({
        parcelId: z.string(),
        owner: z.string(),
        address: z.string(),
        // ... other required fields
    });
    return schema.parse(data);
};
```

---

## Expected Improvements

| Metric | Current | Phase 1 | Phase 3 (Full) |
|--------|---------|---------|----------------|
| User Steps | 4-5 clicks | 2 clicks | 1 click (auto-fill) |
| Data Accuracy | ~80% (manual) | ~95% (API) | 99% (API + RAG) |
| Time to Complete | 3-5 min | 30 seconds | 5 seconds |
| Cost per Query | Free | ~$0.001 | ~$0.01 |
| Reliability | UI-dependent | Highly Reliable | Mission Critical |

---

## Success Metrics

✅ **Phase 1 Success**: 80%+ of top counties have REST API coverage  
✅ **Phase 2 Success**: Fallback browser works for remaining 20%  
✅ **Phase 3 Success**: 95%+ form auto-fill accuracy  
✅ **Phase 4 Success**: PDF analysis reduces manual entry by 50%  

---

## Next Steps

1. **Start with Phase 1**: Research ArcGIS endpoints for top 10 counties
2. **Build API consumer**: Generic function to query ArcGIS servers
3. **Test and validate**: Ensure data accuracy across counties
4. **Integrate with current flow**: Add as enhancement to existing GIS button
5. **Plan Phase 2**: Design headless browser patterns for complex cases

---

**Document Version**: 1.0  
**Last Updated**: February 4, 2026  
**Status**: Strategic Roadmap (Not yet implemented)  
**Priority**: Medium-High (Future enhancement phase)
