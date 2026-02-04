# Altech Intake App: Future Development Roadmap

This document outlines the phased implementation plan to upgrade the "Altech Field Lead" application (https://altechintake.vercel.app/) from a data-entry form into an intelligent insurance intake tool.

## Phase 1: The "Data Pipeline" (Solving the GIS Block)
**Objective:** Decouple the data fetching from the client-side browser to fix scraping failures and CORS errors.

### 1. Create a Serverless API Endpoint
Instead of the frontend trying to scrape GIS sites directly (which gets blocked), move this logic to a Vercel Serverless Function (Python or Node.js).
* **Endpoint:** `POST /api/fetch-property-data`
* **Input:** `{ address: "123 Main St, Vancouver, WA", zip: "98685" }`
* **Action:**
    * Standardize address (e.g., "Street" -> "St").
    * **Primary Strategy:** Query the county's **ArcGIS REST API** directly (e.g., Clark County GIS) for structured JSON.
    * **Fallback Strategy:** Use a headless browser (Playwright) running in the serverless function to load the search page and extract data if the API is closed.
* **Output:** Returns a clean JSON object:
    ```json
    {
      "year_built": 2005,
      "sq_ft": 2450,
      "roof_type": "Composite",
      "zoning": "R1-7.5"
    }
    ```

---

## Phase 2: The "Magic Fill" (Frontend Integration)
**Objective:** Reduce agent data entry time by 50% using the data from Phase 1.

### 1. "Auto-Fill" Button Implementation
* **Location:** In the **"Property Location"** step, next to the Address field.
* **UI Component:** A button labeled `✨ Auto-Fill Property Details`.
* **Behavior:**
    * When clicked, it calls the `fetch-property-data` endpoint.
    * **Action:** Automatically populates the following fields in the later steps:
        * **Home Basics:** Dwelling Type, Number of Stories, Sq Ft, Year Built.
        * **Construction Details:** Foundation Type (if available), Exterior Walls.
        * **Roof Information:** Roof Type (if available).

### 2. "Permit Audit" Logic
* **Feature:** Cross-reference "Effective Year Built" vs. "Actual Year Built."
* **Logic:** If the GIS data shows a "Remodel Year" or recent permit, populate the **"System Updates"** section (Electrical, Plumbing, Heating) automatically with that year.

---

## Phase 3: The "Underwriter Assistant" (Risk Logic)
**Objective:** Catch automatic declinations *before* the application is submitted to the carrier.

### 1. Roof Age Warning System
* **Logic:** A real-time check runs when the "Roof" section is filled.
    * *Condition:* `(Current Year - Year Built > 20)` AND `(Roof Update Year is Empty)`.
* **UI Feedback:** Display a yellow warning banner:
    > "⚠️ **Underwriting Alert:** Roof is 20+ years old. Carriers may require a Roof Certification or photos showing no granular loss."

### 2. Hazard Overlay (Wildfire/Flood)
* **Integration:** Use the GIS "Layer" data during the Phase 1 fetch.
* **UI Feedback:** If the property falls in a specific zone (e.g., "WUI - Wildland Urban Interface"):
    * Flag the **"Risk Factors"** section.
    * Prompt the user: *"Property is in a High Fire Zone. Did you confirm brush clearance?"*

---

## Phase 4: The "Speed Tools" (AI Vision)
**Objective:** Eliminate typos and speed up the tedious "Drivers" section.

### 1. Driver's License Scanner
* **Feature:** Similar to the current "Scan Policy" tool.
* **Tech Stack:** Gemini 1.5 Flash (faster/cheaper) or Pro.
* **Action:**
    * User snaps a photo of the DL.
    * AI extracts: `First Name`, `Last Name`, `DOB`, `License Number`, `Address`.
* **Benefit:** Eliminates 90% of typos in 16-digit license numbers.

### 2. "Smart" Hazard Detection (Satellite)
* **Refinement:** Improve the existing "Scan for Hazards" feature.
* **Action:** Pass the Google Maps Static Image (Satellite view) to Gemini 1.5 Pro with the prompt:
    * *"Analyze this satellite image. Identify if there is a swimming pool, trampoline, or detached structure. Return JSON."*
* **Auto-Select:** Automatically checks the boxes in the **"Risk Factors"** section based on the AI's findings.