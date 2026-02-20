# Altech — Complete Technical Architecture Reference

> **Audience:** Senior development team  
> **Generated from:** Full source code audit of ~29,000 lines across 45+ files  
> **App version:** v2.18.1 | **Last updated:** February 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Architecture Overview](#4-architecture-overview)
5. [index.html — The Monolith (12,490 lines)](#5-indexhtml--the-monolith-12490-lines)
   - 5.1 [HTML Structure (Lines 1–2310)](#51-html-structure-lines-12310)
   - 5.2 [App Object & Core State (Lines 2311–2600)](#52-app-object--core-state-lines-23112600)
   - 5.3 [Initialization & Event System (Lines 2600–3200)](#53-initialization--event-system-lines-26003200)
   - 5.4 [AI/ML Document Processing (Lines 3200–3800)](#54-aiml-document-processing-lines-32003800)
   - 5.5 [SmartAutoFill Pipeline (Lines 5500–7000)](#55-smartautofill-pipeline-lines-55007000)
   - 5.6 [Vision, Hazard & Historical Analysis (Lines 7000–7800)](#56-vision-hazard--historical-analysis-lines-70007800)
   - 5.7 [Seven-Step Wizard & Validation (Lines 3800–5500)](#57-seven-step-wizard--validation-lines-38005500)
   - 5.8 [Export Engines (Lines 9500–11500)](#58-export-engines-lines-950011500)
   - 5.9 [Quote Library (Lines 11800–12200)](#59-quote-library-lines-1180012200)
   - 5.10 [Client History (Lines 11500–11800)](#510-client-history-lines-1150011800)
   - 5.11 [Plugin System & Navigation (Lines 12200–12400)](#511-plugin-system--navigation-lines-1220012400)
   - 5.12 [Landing Page & Boot Sequence (Lines 12300–12490)](#512-landing-page--boot-sequence-lines-1230012490)
6. [JS Infrastructure Modules (5 files, ~1,556 lines)](#6-js-infrastructure-modules-5-files-1556-lines)
   - 6.1 [crypto-helper.js](#61-crypto-helperjs-130-lines)
   - 6.2 [firebase-config.js](#62-firebase-configjs-96-lines)
   - 6.3 [auth.js](#63-authjs-348-lines)
   - 6.4 [cloud-sync.js](#64-cloud-syncjs-725-lines)
   - 6.5 [onboarding.js](#65-onboardingjs-257-lines)
7. [JS Plugin Modules (14 files, ~10,358 lines)](#7-js-plugin-modules-14-files-10358-lines)
8. [API Serverless Functions (13 files, ~4,667 lines)](#8-api-serverless-functions-13-files-4667-lines)
9. [CSS Architecture (12 files, ~6,500 lines)](#9-css-architecture-12-files-6500-lines)
10. [Data Model & Persistence](#10-data-model--persistence)
11. [Cloud Sync Architecture](#11-cloud-sync-architecture)
12. [Security Analysis](#12-security-analysis)
13. [Key Data Flows](#13-key-data-flows)
14. [Known Weaknesses & Technical Debt](#14-known-weaknesses--technical-debt)
15. [Strategic Recommendations](#15-strategic-recommendations)

---

## 1. Executive Summary

Altech is a **mobile-first, no-build Vanilla JS single-page application** purpose-built for insurance agency field intake. An agent scans a policy document (photo, PDF, or typed), the app uses Google Gemini AI to extract 50+ structured fields, the user corrects via a 7-step wizard, then exports to three industry formats: **HawkSoft** (.cmsmtf), **EZLynx** (.xml), and **PDF**.

The app runs as:
- **Primary:** Static SPA on Vercel (index.html + 13 serverless API functions)
- **Optional:** Tauri desktop wrapper (rebrands to "PolicyPilot", native drag-drop, Python backend)
- **Optional:** Chrome Extension companion ("Copy for Altech" clipboard integration)

There is **no framework, no build step, no transpilation.** Edit HTML/CSS/JS → reload → see changes. The entire UI is a single `index.html` file at **12,490 lines**, with behavior split across **14 JS plugin modules**, **5 infrastructure JS modules**, and **13 serverless API functions**. Firebase provides auth (email/password) and Firestore for bidirectional cloud sync with conflict resolution.

### Key Numbers

| Metric | Value |
|--------|-------|
| `index.html` | 12,490 lines |
| JS plugin modules | 14 files, ~10,358 lines |
| JS infrastructure modules | 5 files, ~1,556 lines |
| API serverless functions | 13 files, ~4,667 lines |
| CSS files | 12 files, ~6,500 lines |
| Test suites | 14 suites, 881+ tests (Jest + JSDOM) |
| Total codebase (audited) | ~29,071 lines |
| Plugins | 13 registered (1 hidden) |
| Export formats | 6 (PDF, CMSMTF, XML Auto, XML Home, CSV, Text) + ZIP bundles |
| AI models used | Gemini 2.5-flash (primary), Gemini 2.0-flash (historical) |
| External APIs | 10+ (Google, ArcGIS, NHTSA, Socrata, HawkSoft, Firebase, Redis) |

---

## 2. Technology Stack

### Frontend (No Build Step)

| Technology | Role | Version/Details |
|------------|------|-----------------|
| Vanilla JS (ES6+) | All application logic | IIFE module pattern on `window.*` |
| Single HTML file | All UI + inline JS | 12,490 lines |
| CSS Custom Properties | Theming (light/dark) | 12 files, Apple-inspired design |
| Firebase Auth SDK | Email/password auth | Compat v10.12.0 (CDN) |
| Firebase Firestore SDK | Cloud sync | Compat v10.12.0 (CDN), offline persistence |
| jsPDF | PDF export | v2.5.1 (CDN) |
| JSZip | ZIP bundle export | v3.10.1 (CDN) |
| pdf.js | Client-side PDF parsing | v3.11.174 (CDN) |
| Google Places API | Address autocomplete | Loaded dynamically with session tokens |
| Google Maps Static API | Street View + satellite images | Zoom 18, 600×400 |

### Backend (Vercel Serverless)

| Technology | Role | Details |
|------------|------|---------|
| Node.js | Serverless runtime | Vercel functions in `api/` |
| Google Generative AI SDK | Gemini AI calls | `@google/generative-ai` (policy scan, vision, RAG, etc.) |
| Google AI SDK | Alternate Gemini client | `@ai-sdk/google` + `ai` (historical analyzer) |
| ioredis | Redis Cloud client | CGL cache, KV store |
| pdf-lib | Server-side PDF manipulation | COI generation |
| Python (subprocess) | ACORD 25 PDF fill | `python_backend/fill_acord25.py` |

### Infrastructure

| Service | Role | Details |
|---------|------|---------|
| Vercel | Hosting + serverless | Static deploy + `api/` functions, up to 60s timeout |
| Firebase (altech-app-5f3d0) | Auth + database | Email/password auth, Firestore with offline persistence |
| Redis Cloud | Caching + KV | CGL compliance cache (15-min TTL), generic KV store |
| Google Cloud | AI + Maps | Gemini API, Places, Static Maps, Geocoding |
| ArcGIS REST | County parcel data | 7 WA/OR county configs + 3 state aggregators |
| NHTSA vPIC | VIN decoding | Free federal API, 8s timeout |
| Socrata Open Data | Public records | WA L&I contractors, OR CCB contractors |

### Optional Platforms

| Platform | Role | Detection |
|----------|------|-----------|
| Tauri v2 | Desktop wrapper | `window.__TAURI__` — rebrands to "PolicyPilot" |
| Chrome Extension | Clipboard integration | Reads `_altech_property` from clipboard JSON |
| Python Backend | ACORD 25 PDF fill | Subprocess via `generate-coi.js` |

### Dev Tools

| Tool | Role |
|------|------|
| Jest + JSDOM | Testing (14 suites, 881+ tests) |
| Node.js `server.js` | Local dev server (678 lines, Vercel-compatible mock) |
| Vercel CLI | `vercel dev` alternative |
| `@tauri-apps/cli` v2.10.0 | Desktop builds |

---

## 3. Directory Structure

```
Altech/
├── index.html              # 12,490-line SPA monolith (ALL UI + core JS)
├── server.js               # 678-line local dev server (Vercel-compatible)
├── vercel.json             # Vercel config: rewrites, headers, function timeouts
├── package.json            # npm scripts, dependencies (ioredis, pdf-lib, jest, tauri)
├── jest.config.cjs         # Jest configuration
├── .env / .env.example     # Environment variables
├── Altech.bat              # Windows launch script
├── ezlynx_schema.json      # EZLynx form schema reference
├── sample_client_data.json  # Sample data for testing
│
├── api/                    # 13 Vercel serverless functions
│   ├── _security.js        # Shared security middleware (rate limiting, sanitization)
│   ├── policy-scan.js      # Gemini 2.5 Flash document OCR
│   ├── vision-processor.js # 5-action Gemini vision pipeline (804 lines)
│   ├── document-intel.js   # Lightweight doc analyzer
│   ├── property-intelligence.js  # LARGEST API (1,294 lines) — ArcGIS, satellite, Zillow, fire station
│   ├── rag-interpreter.js  # RAG: raw parcel data → insurance form values
│   ├── historical-analyzer.js  # Property value/insurance history (4 actions)
│   ├── compliance.js       # HawkSoft CGL compliance fetcher (772 lines, 60s timeout)
│   ├── generate-coi.js     # ACORD 25 PDF via Python subprocess
│   ├── kv-store.js         # Redis Cloud CRUD (allowlisted keys)
│   ├── name-phonetics.js   # Name pronunciation via Gemini
│   ├── places-config.js    # Returns API keys to frontend
│   └── prospect-lookup.js  # Public records search (1,037 lines)
│
├── js/                     # 19 JS modules
│   ├── crypto-helper.js    # AES-256-GCM encryption (Web Crypto API)
│   ├── firebase-config.js  # Firebase initialization
│   ├── auth.js             # Firebase Auth modal + flows
│   ├── cloud-sync.js       # Bidirectional Firestore sync (725 lines)
│   ├── onboarding.js       # 3-step welcome flow + access code gate
│   ├── policy-qa.js        # Policy document Q&A chat (Gemini)
│   ├── compliance-dashboard.js  # CGL compliance tracker (2,107 lines)
│   ├── hawksoft-export.js  # HawkSoft CMSMTF file builder (1,704 lines)
│   ├── hawksoft-integration.js  # HawkSoft API client (read-only)
│   ├── ezlynx-tool.js     # EZLynx rating integration (989 lines)
│   ├── quote-compare.js   # Quote comparison with AI advisor
│   ├── reminders.js        # Task/reminder system
│   ├── quick-ref.js        # Phonetic alphabet + carrier codes
│   ├── accounting-export.js # HawkSoft accounting + trust calculator
│   ├── coi.js              # Certificate of Insurance generator
│   ├── email-composer.js   # AI email writer (Gemini streaming)
│   ├── prospect.js         # Business prospect investigator (935 lines)
│   ├── vin-decoder.js      # VIN decoder + APCO phonetics (777 lines)
│   └── data-backup.js      # Full backup/restore + keyboard shortcuts
│
├── plugins/                # 12 plugin HTML files (loaded lazily)
│   ├── quoting.html        # Personal lines intake UI
│   ├── policy-qa.html      # Policy Q&A interface
│   ├── quote-compare.html  # Quote comparison UI
│   ├── coi.html            # COI generator form
│   ├── compliance.html     # CGL dashboard UI
│   ├── reminders.html      # Reminders interface
│   ├── prospect.html       # Prospect investigator UI
│   ├── email.html          # Email composer UI
│   ├── accounting.html     # Accounting export UI
│   ├── quickref.html       # Quick reference cards
│   ├── ezlynx.html        # EZLynx tool UI
│   └── hawksoft.html       # HawkSoft export UI
│
├── css/                    # 12 CSS files
│   ├── main.css            # 2,781 lines — core theme, layout, forms, wizard
│   ├── compliance.css      # CGL dashboard styles
│   ├── auth.css            # Auth modal styles
│   ├── onboarding.css      # Onboarding overlay styles
│   ├── reminders.css       # Reminders UI styles
│   ├── vin-decoder.css     # VIN decoder styles
│   ├── quote-compare.css   # Quote comparison styles
│   ├── hawksoft.css        # HawkSoft export styles
│   ├── ezlynx.css         # EZLynx tool styles
│   ├── email.css           # Email composer styles
│   ├── accounting.css      # Accounting export styles
│   └── quickref.css        # Quick reference card styles
│
├── tests/                  # 14 Jest test suites (881+ tests)
├── docs/                   # Documentation
├── scripts/                # Build scripts (Tauri dist)
├── Resources/              # Static assets
├── chrome-extension/       # Chrome "Copy for Altech" extension
├── python_backend/         # ACORD 25 PDF fill script
├── src-tauri/              # Tauri v2 desktop wrapper config
└── .github/                # Copilot instructions, workflows
```

---

## 4. Architecture Overview

### 4.1 Application Model

```
┌──────────────────────────────────────────────────────────┐
│                       CLIENT (Browser)                    │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              index.html (12,490 lines)               │ │
│  │                                                     │ │
│  │  App Object ← 7-Step Wizard ← Event Delegation     │ │
│  │       │                                             │ │
│  │       ├── AI Pipeline (Scan → Extract → Review)     │ │
│  │       ├── SmartAutoFill (ArcGIS + Zillow + Fire)    │ │
│  │       ├── Export (PDF, CMSMTF, XML, CSV, Text, ZIP) │ │
│  │       ├── Quote Library (encrypted localStorage)     │ │
│  │       └── Client History (50-entry cap)             │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │           Plugin System (13 tools)                   │ │
│  │  Lazy-loaded HTML from plugins/ → init via window.*  │ │
│  │  Hash router: #toolName → navigateTo(key)           │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  Infrastructure: CryptoHelper │ FirebaseConfig │ Auth    │
│                  CloudSync │ Onboarding                  │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
             ▼                             ▼
   ┌─────────────────┐          ┌──────────────────┐
   │  Vercel APIs     │          │  Firebase         │
   │  13 serverless   │          │  Auth + Firestore │
   │  functions       │          │  (altech-app-     │
   │  (Node.js)       │          │   5f3d0)          │
   └────────┬────────┘          └──────────────────┘
            │
    ┌───────┼───────────┬──────────────┐
    │       │           │              │
    ▼       ▼           ▼              ▼
 Gemini   ArcGIS    Redis Cloud    External
 2.5/2.0  REST      (ioredis)      APIs
 Flash    (7 counties)             (NHTSA,
                                    Socrata,
                                    Google Maps,
                                    HawkSoft)
```

### 4.2 Plugin System

Plugins are registered in the `toolConfig[]` array (~line 2235 of index.html). Each entry is a config object:

```javascript
{
    key: 'pluginName',         // URL hash + container ID base
    icon: '📋',                // Emoji icon for landing page
    color: 'blue',             // CSS icon color class
    title: 'Plugin Title',     // Display name
    containerId: 'pluginTool', // DOM container ID
    initModule: 'PluginModule',// window[initModule].init() called on load
    htmlFile: 'plugins/x.html',// Lazy-fetched HTML
    category: 'quoting',       // quoting | docs | ops | ref
    badge: null,               // Optional badge function
    hidden: false              // Hidden from landing page
}
```

**13 Registered Plugins:**

| Key | Module | Category | Description |
|-----|--------|----------|-------------|
| `quoting` | `App` | quoting | Personal lines intake wizard (the core 7-step form) |
| `qna` | `PolicyQA` | quoting | Policy document Q&A with Gemini AI chat |
| `quotecompare` | `QuoteCompare` | quoting | Upload EZLynx quote PDFs → AI comparison + advisor |
| `coi` | `COIModule` | docs | ACORD 25 Certificate of Insurance generator |
| `compliance` | `ComplianceDashboard` | docs | CGL commercial compliance tracker |
| `reminders` | `RemindersModule` | ops | Task/reminder system with recurring schedules |
| `prospect` | `ProspectModule` | ops | Business prospect investigation (WA/OR/AZ) |
| `email` | `EmailComposer` | ops | AI email composer with Gemini streaming |
| `accounting` | `AccountingExport` | ops | HawkSoft accounting export + trust calculator |
| `quickref` | `QuickRef` | ref | APCO phonetics + carrier code cards |
| `hawksoft` | `HawkSoftExport` | docs | HawkSoft CMSMTF file builder |
| `vindecoder` | `VinDecoder` | ref | VIN decoder with APCO phonetic reading |
| `ezlynx` | `EZLynxTool` | hidden | EZLynx schema tool (hidden from landing) |

**Plugin Loading Flow:**
1. User clicks tool on landing page → `openTool(key)` → `navigateTo(key)`
2. `navigateTo()` finds config in `toolConfig[]`, hides all other containers
3. First visit: fetch `htmlFile` via `fetch()`, inject into container div, set `dataset.loaded`
4. Call `window[initModule].init()` to initialize the module
5. Update `location.hash` to `#key` for deep-linking
6. Subsequent visits: skip fetch (HTML cached in DOM), re-call `.init()`

### 4.3 Module Pattern

All JS modules follow an IIFE pattern exposing a public API on `window`:

```javascript
window.ModuleName = (() => {
    'use strict';
    const STORAGE_KEY = 'altech_module_key';
    // ... private state, functions, DOM manipulation ...
    return { init, render, /* public API */ };
})();
```

There is **no ES module import/export** on the client side. All inter-module communication happens through `window.*` globals. Script loading order at the bottom of `index.html` determines availability.

---

## 5. index.html — The Monolith (12,490 lines)

The entire application UI and core logic lives in a single HTML file. This section documents every major system within it.

### 5.1 HTML Structure (Lines 1–2310)

#### Head Section (Lines 1–50)
- 12 CSS `<link>` tags (main.css + 11 plugin-specific stylesheets)
- Firebase SDK v10.12.0 (compat) — `firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js`
- Meta viewport for mobile-first rendering
- Apple-touch-icon, favicon, theme-color meta tags

#### Onboarding Overlay (Lines ~50–150)
A full-screen 3-step modal:
1. **Step 1:** Welcome splash with branding
2. **Step 2:** Name collection for personalized greeting
3. **Step 3:** Access code gate — validates against `ALTECH-2026`, `ALTECH2026`, `WELCOME2026`

#### Landing Page Dashboard (Lines ~150–300)
- Header pill with brand name + greeting (Firebase display name → onboarding name → "Sign in" prompt)
- `<div id="toolsGrid">` — config-driven bento grid populated by `renderLandingTools()`
- Dark mode toggle, auth button

#### 7-Step Wizard Forms (Lines ~300–2100)

| Step | ID | Title | Key Fields |
|------|----|-------|------------|
| 0 | `step0` | Quick Start | Client history list, recent drafts, scan upload (photo/PDF/multi-file) |
| 1 | `step1` | Client Info | First/last name, DOB, SSN, phone, email, address (Places autocomplete), co-applicant toggle, pronunciation button |
| 2 | `step2` | Coverage Type | Segmented control: Home Only / Auto Only / Both → sets `App.data.coverageType` and switches workflow |
| 3 | `step3` | Property Details | 60+ dropdowns (construction, dwelling, structure, roof, foundation, heating types), year built, sqft, stories, garage, pool, dogs, trampoline, business, mortgagee, protective devices, smartAutoFill button, Chrome Extension import, property records links |
| 4 | `step4` | Vehicles & Drivers | Dynamic add/remove for drivers (24 occupations, 7 education levels, 7 DL statuses, SR-22/FR-44, DL scan) and vehicles (VIN auto-decode, 5 use types, 4 performance, telematics, rideshare) |
| 5 | `step5` | Insurance History | Prior carrier (250+ carrier datalist), policy number, expiration, years insured, prior liability limits |
| 6 | `step6` | Review & Export | Read-only summary, 8 export buttons (PDF, CMSMTF, XML Auto, XML Home, Both XML, CSV, Text, Batch Import), export history table |

#### CDN Scripts (Lines ~2100–2200)
- jsPDF 2.5.1
- JSZip 3.10.1
- pdf.js 3.11.174

#### Google Places Loader (Lines ~2200–2230)
Self-executing IIFE that:
1. Creates a `<script>` tag for Google Maps JS API with `libraries=places`
2. Sets `loading=async` for non-blocking load
3. Resolves `window._placesReady` promise when loaded
4. No-ops gracefully if API key is missing

### 5.2 App Object & Core State (Lines 2311–2600)

The `App` object is the global application state container:

```javascript
const App = {
    data: {},                // All form field values — auto-synced to localStorage
    step: 0,                 // Current wizard step index
    currentWorkflow: 'home', // 'home' | 'auto' | 'both'
    storageKey: 'altech_v6', // localStorage key for form data
    encryptionEnabled: true, // AES-256-GCM encryption on/off
    quotesKey: 'altech_v6_quotes', // localStorage key for quote library
    drivers: [],             // Array of driver objects
    vehicles: [],            // Array of vehicle objects
    selectedQuoteIds: new Set(), // Multi-select for bulk export
    // ... methods below
};
```

#### Workflow Definitions

```javascript
workflows: {
    home: [0, 1, 2, 3, 5, 6],    // Skip step 4 (vehicles)
    auto: [0, 1, 2, 4, 5, 6],    // Skip step 3 (property)
    both: [0, 1, 2, 3, 4, 5, 6], // All steps
}
```

When the user selects a coverage type in Step 2, `handleType(type)` updates `currentWorkflow` and recalculates which steps are shown.

#### Tool Configuration Array (~Line 2235)

`toolConfig` is the single source of truth for all plugins. Each entry has:
- `key` — Used as URL hash, DOM lookup prefix
- `icon` — Emoji displayed on landing page
- `color` — Maps to CSS class `icon-{color}` (blue, emerald, amber, orange, indigo, rose, violet, teal, muted)
- `title` / `subtitle` — Display text
- `containerId` — ID of the `<div class="plugin-container">` in the DOM
- `initModule` — Name of the `window.*` module to call `.init()` on
- `htmlFile` — Path to lazy-loaded HTML (e.g., `plugins/compliance.html`)
- `category` — One of `quoting`, `docs`, `ops`, `ref`
- `badge` — Optional function returning badge HTML (e.g., CGL alert count)
- `hidden` — If true, omitted from landing page grid

### 5.3 Initialization & Event System (Lines 2600–3200)

#### App.init()

Called on page load. Performs in order:
1. **Dark mode** — reads `localStorage.altech_dark_mode`, applies `body.dark-mode` class
2. **Tauri detection** — checks `window.__TAURI__`, rebrands title/header to "PolicyPilot", initializes native drag-drop listeners
3. **Data load** — `App.load()` reads encrypted JSON from `localStorage.altech_v6`
4. **Gemini key resolution** — `_getGeminiKey()` cascading lookup: Tauri env → `window.GEMINI_API_KEY` → fetch `/api/places-config` → hardcoded fallback
5. **Desktop drag-drop** — if Tauri, registers file drop listeners for PDF/image/CSV/CMSMTF
6. **Event delegation** — single `change` listener on `document` for all `<input>`, `<select>`, `<textarea>`:
   - Captures field `id` → stores in `App.data[id]`
   - Debounced `App.save()` at 500ms
   - Special handling: VIN fields trigger `decodeVin()`, phone fields trigger `fmtPhone()`
7. **Carrier autocomplete** — autocomplete on the prior carrier field from a 250+ carrier datalist
8. **Field validation** — email, phone, ZIP format validation with visual feedback
9. **Phone formatting** — live `(XXX) XXX-XXXX` formatting on keyup
10. **Segmented controls** — iOS-style toggle binding for coverage type
11. **iOS toggles** — checkbox styling for all `.toggle-switch` elements
12. **Progressive disclosure** — conditional field visibility (e.g., pool → fence question)
13. **Map preview listeners** — debounced 450ms address change → Street View + satellite preview
14. **Places autocomplete** — Google Places Autocomplete on address field with session token management

#### Auto-Save Mechanism

Every form field change triggers:
```
Field change → event delegation → App.data[id] = value → debounced App.save() (500ms)
```

`App.save()` uses a **token-based dedup** system:
1. Increments a save token
2. After 500ms debounce, checks if token matches (no newer save pending)
3. Serializes `App.data` to JSON
4. If `encryptionEnabled`, encrypts via `CryptoHelper.encrypt()`
5. Calls `CryptoHelper.safeSave()` with QuotaExceededError fallback
6. Triggers `CloudSync.schedulePush()` (3s debounced)

#### _getGeminiKey() Resolution Chain

```
1. window.__TAURI__ → Tauri invoke('get_env', {name:'GOOGLE_API_KEY'})
2. window.GEMINI_API_KEY (set externally)
3. fetch('/api/places-config') → response.GOOGLE_API_KEY
4. Hardcoded fallback key (development only)
```

### 5.4 AI/ML Document Processing (Lines 3200–3800)

Altech has a multi-stage AI pipeline for extracting insurance data from documents.

#### Stage 1: Document Upload (Step 0)

Users can upload via:
- **Camera capture** (mobile) — `<input type="file" accept="image/*" capture="environment">`
- **File picker** — PDF or image files
- **Multi-file upload** — up to 5 files processed in parallel
- **Drag-and-drop** — Tauri native or browser-based
- **Doc Intelligence** — secondary upload for supplementary documents

#### Stage 2: Policy Scan (`processScan` / `processScanFromText`)

Two code paths:

**Browser path (`processScan`):**
1. Attempts direct Gemini API call with image/PDF data
2. Falls back to `/api/policy-scan.js` serverless function
3. Uses `_getScanSchema()` — a ~120-field structured output schema organized by category (personal, coApplicant, property, auto, coverage, priorInsurance, additional)
4. Gemini extracts fields with confidence scores (0.0–1.0)

**Tauri path (`processScanFromText`):**
1. Receives text from Tauri's native file reader
2. Sends to Gemini with an "underwriter persona" system prompt
3. Temperature 0.1 for deterministic extraction
4. Same structured schema

#### Stage 3: Extraction Review UI

After AI extraction:
1. Results displayed in a review modal with **confidence pills** (green ≥0.8, yellow 0.5–0.8, red <0.5)
2. Each field is editable before applying
3. **Mismatch warnings** — if Doc Intelligence results conflict with primary scan, highlighted in yellow
4. User can accept/reject individual fields

#### Stage 4: Apply to Form (`applyExtractedData`)

- Maps extracted fields to `App.data.*` form fields
- Handles compound fields: semicolon-delimited vehicles/drivers parsed into `App.drivers[]` / `App.vehicles[]`
- Triggers VIN decode for any extracted VIN
- Updates UI via `App.updateUI()`

#### Driver's License Scanning

Separate from policy scan — uses vision pipeline:
1. User captures DL image (per-driver, with image compression 800px max, 0.7 quality for Vercel 4.5MB limit)
2. Sends to `/api/vision-processor.js` with action `scanDriverLicense`
3. Returns: name, DOB, DL number, address, gender, restrictions, endorsements
4. Shows editable preview with live field mapping
5. Apply button writes to specific driver in `App.drivers[]`

### 5.5 SmartAutoFill Pipeline (Lines 5500–7000)

**`smartAutoFill()`** is the most complex client-side function. Given an address, it fetches property data from up to 5 sources in parallel, then presents a unified merge dialog.

#### Source Priority

```
Promise.allSettled([
    fetchArcgisAndRag(address),     // County parcel data + RAG interpretation
    fetchZillowData(address),        // Gemini Search Grounding for property facts
    fetchFireStationData(address)    // Google Places nearest fire station
])
↓ (if all fail)
fetchPropertyViaGemini(address)     // Gemini with Google Search tool
↓ (if still fails)
analyzeAerial(address)              // Satellite imagery analysis
```

#### Source 1: ArcGIS + RAG

1. **County Detection** — `getCountyFromCity(city)` maps 200+ cities across WA/OR/AZ to counties
2. **ArcGIS Query** — hits county-specific REST endpoints:
   - Clark County (WA) — assessor parcel layer + fact sheet HTML scrape
   - King County (WA) — parcel viewer
   - Pierce County (WA) — assessor API
   - Multnomah County (OR) — tax lot API
   - Snohomish, Spokane, Washington County — respective parcel APIs
3. **RAG Interpretation** — raw parcel JSON sent to `/api/rag-interpreter.js` → Gemini standardizes county-specific codes (e.g., "WD FR" → "Wood Frame") into insurance-form values
4. Returns structured property data with source attribution

#### Source 2: Zillow via Gemini Search Grounding

1. Sends address to `/api/property-intelligence.js?mode=zillow`
2. Server calls Gemini with `tools: [{ google_search: {} }]` — Search Grounding
3. Gemini searches the web (primarily Zillow) and returns property details
4. Server normalizes values using extensive mapping tables (heating: 16→6 types, roofing: 20→8 types, etc.)
5. Returns structured data with "zillow" source tag

#### Source 3: Fire Station Distance

1. Geocodes address via Google Geocoding API
2. Google Places Nearby Search for fire stations within 10 miles
3. Calculates distance to nearest station
4. Estimates ISO protection class (1-10) from distance
5. Returns fire protection data

#### Source 4 Fallback: Gemini Property Lookup

If all three fail, uses Gemini with Google Search tool to look up the property directly:
```json
{ "tools": [{ "google_search": {} }] }
```
Returns best-effort property data from web search.

#### Source 5 Fallback: Satellite Imagery

Last resort — fetches satellite image of address, sends to Gemini vision for estimation of property characteristics from aerial view.

#### Unified Data Popup

`showUnifiedDataPopup()` merges all sources with precedence: **ArcGIS > Zillow > Fire Station > Gemini > Satellite**. Each value shows a colored badge indicating its source. User can accept/reject individual values before applying.

#### Field Mapping (`applyParcelData`)

Extracted values map to form fields:
- `yearBuilt` → `yearBuilt`
- `stories` → `stories`
- `sqft` → `sqft`
- `lotSize` → `lotSize`
- `garageSpaces` — estimated from sqft ÷ 180 ("2-car" from 400sqft)
- `bedrooms`, `bathrooms` → split from "3/2" format
- `foundation`, `roofType`, `heatingType`, `constructionStyle` → normalized to dropdown values

### 5.6 Vision, Hazard & Historical Analysis (Lines 7000–7800)

#### Hazard Detection (`showHazardDetectionPopup`)

1. Fetches both **satellite** (zoom 18) and **Street View** images of the property
2. Sends both to `/api/vision-processor.js` with action `analyzeAerial`
3. Gemini vision analyzes for:
   - **Pool** presence and whether fenced
   - **Trampoline** detection
   - **Deck/patio** condition
   - **Tree overhang** near roof
   - **Roof condition** rating 1-10
   - **General hazards** (debris, construction, drainage issues)
4. Results shown in a visual panel with risk indicators

#### Historical Analysis

Four modes via `/api/historical-analyzer.js`:
1. **analyzeValues** — property value trends over time
2. **analyzeInsurance** — insurance cost/claim history
3. **compareMarket** — market comparison against comparable properties
4. **generateTimeline** — chronological property event timeline

Uses `@ai-sdk/google` with `gemini-2.0-flash-001` at temperature 0.3.

#### Name Pronunciation

For client communication — fetches phonetic spelling of client names:
1. Client-side: calls `/api/name-phonetics.js` (the ONLY rate-limited endpoint)
2. Gemini generates APCO-phonetic-style pronunciation
3. Fallback: direct Gemini call if server fails
4. Result shown next to client name on PDF export

### 5.7 Seven-Step Wizard & Validation (Lines 3800–5500)

#### Navigation

- `next()` — validates current step, advances to next step in current workflow
- `prev()` — moves to previous step in workflow
- `App.updateUI()` — shows/hides step containers based on `App.step`
- Arrow key navigation via `data-backup.js` keyboard shortcuts

#### Validation Gate

Before advancing from any step, validation checks:
- **Step 1:** First name, last name required
- **Step 3:** At least basic property fields
- **Step 4:** At least one driver with name
- **Step 5:** Optional (no hard validation)
- All validations show toast messages on failure

#### Driver Management (Step 4)

- `addDriver()` — adds a driver object to `App.drivers[]`, renders new driver card
- `removeDriver(index)` — removes with confirmation
- `updateDriver(index, field, value)` — updates specific driver field, debounced 300ms save
- `renderDrivers()` — regenerates all driver cards with:
  - 24 occupation options (with "Other" free text)
  - 7 education levels (No High School → Doctorate)
  - 7 DL status options (Valid, Expired, Suspended, etc.)
  - SR-22 / FR-44 filing checkboxes
  - Per-driver DL scan button (camera → AI extraction → apply)

#### Vehicle Management (Step 4)

- `addVehicle()` / `removeVehicle(index)` / `updateVehicle(index, field, value)`
- `renderVehicles()` — generates vehicle cards with:
  - VIN field with auto-decode trigger (NHTSA API, 8s timeout)
  - Year/Make/Model/Trim auto-populated from VIN
  - 5 use types: Pleasure, Commute, Business, Farm, Artisan
  - 4 performance levels
  - 7 anti-theft options
  - 5 restraint options
  - Telematics enrollment checkbox
  - Rideshare (TNC) checkbox

#### Chrome Extension Import (Step 3)

```
User clicks "Import from Extension" → reads clipboard →
validates JSON has `_altech_property` flag → maps 30+ fields →
applies to form
```

Expected clipboard JSON format:
```json
{
    "_altech_property": true,
    "yearBuilt": "1985",
    "squareFeet": "2100",
    "stories": "2",
    // ... 30+ fields
}
```

#### Property Records Links

`openPropertyRecords(city, state)` contains a **massive hardcoded database** of county GIS URLs:
- **Washington:** 10 counties, 50+ cities
- **Oregon:** 9 counties, 30+ cities
- **Arizona:** 7 counties, 30+ cities
- Each with state-level directory fallback

Opens the correct county assessor/GIS portal for the client's city.

### 5.8 Export Engines (Lines 9500–11500)

Altech has **6 export formats** plus ZIP bundling.

#### 5.8.1 PDF Export (`buildPDF`)

The largest single function — builds a professional multi-page PDF using jsPDF:

**Design System:**
- Brand blue: `#0066CC`
- Section headers: blue rounded rectangles
- Key-value tables: 2-column striped layout
- Auto-pagination with branded footer on every page

**Helper Functions:**
- `v(id)` — gets value from `App.data[id]` with DOM fallback
- `sectionHeader(title)` — renders blue header bar
- `kvTable(pairs)` — renders 2-column table with alternation
- Auto page-break detection (checks remaining space before each section)

**Sections (in order):**
1. **Cover** — accent bar, logo area, document reference number, date, Street View banner image, satellite thumbnail
2. **Applicant** — 11 fields including pronunciation guide
3. **Co-Applicant** — 6 fields (conditional)
4. **Property Address** — 6 fields including county
5. **Property Details** — 20 fields (construction, dwelling, structure, roof, etc.)
6. **Building Systems** — 10 fields (heating, electrical, plumbing updates)
7. **Risk & Protection** — 14 fields (pool, dogs, trampoline, fire station, etc.)
8. **Home Coverage** — 15 fields (dwelling, liability, medical, deductible, credits)
9. **Drivers** — 9 fields per driver, dynamically repeated
10. **Vehicles** — 5 fields per vehicle, dynamically repeated
11. **Auto Coverage** — 13 fields (BI/PD/UM/UIM/Comp/Collision/etc.)
12. **Policy & Prior Insurance** — 8 fields
13. **Additional Information** — notes, business use details
14. **Footer** on every page: "Generated by Altech v2.18.1 | Confidential"

**Filename**: `{LastName}_{FirstName}_Intake_{YYYY-MM-DD}.pdf`

#### 5.8.2 HawkSoft CMSMTF Export (`buildCMSMTF`)

Tagged text format for HawkSoft 6 CRM import. Each line: `TAG = VALUE`

**Sections:**
- **Core Contact** (11 tags): FirstName, LastName, DateOfBirth, SSN, Email, PhoneHome, CellPhone, etc.
- **Co-Applicant** (6 tags): Conditional on co-applicant data
- **Home/Property** (29 tags): Conditional on `coverageType` including home. Tags like `HomeYearBuilt`, `HomeConstruction`, `HomeSqFt`, `HomePool`, etc.
- **Auto/Vehicle** (13 tags per vehicle): VehicleYear, VehicleMake, VehicleModel, VehicleVIN, etc.
- **Prior Insurance**: Split by LOB (home vs auto)
- **Shared** (4 tags): Notes, AgentName, SubmissionDate, Source

**Filename**: `{LastName}_{FirstName}_HawkSoft.cmsmtf`

#### 5.8.3 EZLynx Auto XML (`buildXML`)

Generates XML conforming to **EZAUTO V200** schema:

```xml
<?xml version="1.0" encoding="utf-8"?>
<EZAUTO>
    <Version>V200</Version>
    <Applicant>...</Applicant>
    <CoApplicant>...</CoApplicant>
    <PriorPolicyInfo>...</PriorPolicyInfo>
    <PolicyInfo>...</PolicyInfo>
    <ResidenceInfo>...</ResidenceInfo>
    <Drivers>...</Drivers>
    <Vehicles>...</Vehicles>
    <VehiclesUse>...</VehiclesUse>
    <Coverages>
        <PolicyCoverage>...</PolicyCoverage>
        <VehicleCoverage>...</VehicleCoverage>
        <StateSpecificCoverage>...</StateSpecificCoverage>
    </Coverages>
    <VehicleAssignments>...</VehicleAssignments>
</EZAUTO>
```

**Validation** before export: firstName, lastName, state (2 chars), DOB (YYYY-MM-DD format). All values run through `_escapeXML()`.

**State-specific:** WA gets UMPD and PIP nodes in `StateSpecificCoverage`.

**VehicleAssignments:** Maps primary driver to each vehicle using sequential IDs.

#### 5.8.4 EZLynx Home XML (`buildHomeXML`)

Generates XML conforming to **EZHOME V200** schema — the most complex export:

**Value Mapping Functions (8):**
- `mapConstruction()` — 8 types (Frame, Masonry, etc.)
- `mapDwelling()` — 6 types (One Family, Condo, etc.)
- `mapStructure()` — 8 types (Dwelling, Row House, etc.)
- `mapRoof()` — 8 types (Asphalt Shingle, Tile, etc.)
- `mapFoundation()` — 5 types (Slab, Basement, etc.)
- `mapHeating()` — 6 types (Forced Air, Heat Pump, etc.)
- `mapDwellingUse()` — 5 types (Primary, Secondary, etc.)
- `mapOccupancy()` — 3 types (Owner, Tenant, Vacant)
- `mapIndustry()` — 19 types (with employment status exclusion for Retired/Unemployed/Student)
- `updateStatus()` — system update year categories

**RatingInfo section (42+ fields):**
- Fire protection: hydrant distance, city limits, station distance, protection class
- Structure: stories, construction, year built, square footage, units
- Risk: pool, dogs, heating system, trampoline, business use
- 4 system update pairs: roof, electrical, plumbing, heating (each with year category)
- Purchase date, mortgagee, foundation, roof design

**ReplacementCost section:**
- Dwelling value, other structures, personal property, loss of use
- Liability limit, medical payments
- Deductible, rating credits (7 types: new home, mature homeowner, multi-policy, claim-free, etc.)

**ExtendedInfo blocks (WA-specific):**
Hardcoded carrier configurations for Washington state:
- `ICQ|CARRIERS` — carrier IDs (1029, 835, 1157, 388, 429)
- `ICQ|CROSSREF` — cross-reference codes (Progressive, Safeco, etc.)
- `ICQ|NAME_VALUE_PAIRS` — agent codes per carrier (0057, 013575, 0cfj97)
- `ICQ|CARRIERSTAB` — carrier-to-field mappings

#### 5.8.5 CSV Export (`buildCSV`)

Flattened CSV with:
- All form fields as columns
- Notes text flattened into a single cell
- Driver summary column (comma-separated names)
- Headers from `getCSVHeaders()` ~40 columns

#### 5.8.6 Text Export (`buildText`)

Wrapper around `getNotesForData()` — generates structured plain text:
```
══════ CLIENT PROFILE ══════
Name: John Smith
DOB: 1985-03-15
...
══════ DWELLING SPECIFICATIONS ══════
Year Built: 1978
Construction: Wood Frame
...
══════ DRIVERS & VEHICLES ══════
Driver 1: John Smith — License: WDL123456
...
```

#### 5.8.7 ZIP Bundle Export

- **Both XML** — `exportBothXML()`: uses JSZip to bundle Auto + Home XML files, downloads as `{name}_EZLynx_Bundle.zip`
- **Quote Library ZIP** — `exportSelectedZip()` / `exportAllZip()`: exports multiple quotes with all format types per quote

#### 5.8.8 CSV Batch Import

- `downloadCSVTemplate()` — downloads a sample CSV with correct headers
- `openBatchImport()` — file picker for CSV upload
- `handleBatchImport(file)` — parses CSV via custom `parseCSV()` (handles quoted fields, escaped double-quotes, newlines within quotes), maps each row via `mapCsvRowToData()`, creates a draft quote per row
- Each imported row becomes a draft in the Quote Library

### 5.9 Quote Library (Lines 11800–12200)

A full draft management system with encryption:

#### Core Operations
- **Save** — `saveQuote()` with duplicate detection (matching address warns before overwriting)
- **Load** — `loadQuote(id)` restores full form state including drivers/vehicles
- **Delete** — `deleteQuote(id)` with confirmation
- **Rename** — `renameQuote(id)` with prompt
- **Duplicate** — `duplicateQuote(id)` clones but clears personal info (name, SSN, DOB)
- **Star** — `toggleQuoteStar(id)` for favorites

#### Auto-Save
`autoSaveCurrentQuote()` saves the current form state as a draft. Called periodically and on navigation events.

#### Duplicate Detection
`saveQuote()` checks if any existing quote has the same address. If found, shows a Promise-based modal:
- **Overwrite** — replaces existing
- **Save as New** — creates separate entry
- **Cancel** — aborts

#### Storage
- Key: `localStorage.altech_v6_quotes`
- Encrypted via `CryptoHelper.encrypt()` before storage
- Decrypted on load with JSON fallback for unencrypted legacy data
- Synced to Firestore at `users/{uid}/quotes/{quoteId}`

#### UI
- `renderQuoteList()` — searchable list with star/checkbox/stats badges
- `renderQuickStartDrafts()` — recent drafts on Step 0
- `filterQuotes(query)` — text search across quote titles/addresses
- `getQuoteStats()` — returns counts with colored badges (total, starred, recent)
- `selectAllQuotes()` / `clearQuoteSelection()` — bulk selection for ZIP export

#### Bulk Export
- `exportSelectedZip()` — exports checked quotes as ZIP with all formats per quote
- `exportAllZip()` — exports entire library

### 5.10 Client History (Lines 11500–11800)

Separate from Quote Library — stores client metadata (not full form data):

- `saveClient()` — stores `{name, address, phone, email, timestamp}`
- `autoSaveClient()` — deduplicates by name+address combination, caps at 50 entries (FIFO)
- `loadClientFromHistory(index)` — restores basic client info to form
- `deleteClientFromHistory(index)` — with CloudSync push
- `renderStep0ClientHistory()` — shows recent clients on Step 0
- Storage: `localStorage.altech_client_history` (synced to Firestore)

### 5.11 Plugin System & Navigation (Lines 12200–12400)

#### Hash Router

```javascript
// On page load and hashchange:
window.addEventListener('hashchange', () => {
    const key = location.hash.slice(1);
    if (key) navigateTo(key);
    else goHome();
});
```

Deep-linking: `https://altech.app/#compliance` opens CGL dashboard directly.

#### navigateTo(key)

1. Find tool config from `toolConfig[]` by key
2. Hide landing page, hide all other plugin containers
3. Show target container, update breadcrumb
4. If first visit (`!container.dataset.loaded`):
   - `fetch(config.htmlFile)` — loads HTML from `plugins/` directory
   - Injects into container via `innerHTML`
   - Sets `container.dataset.loaded = 'true'`
   - Retry logic: if fetch fails, retries once after 1s
5. Call `window[config.initModule].init()`
6. Update `location.hash = '#' + key`
7. Update back button visibility

#### Breadcrumb System

- `updateBreadcrumb()` — updates `.breadcrumb` element with current tool title
- `observePluginVisibility()` — MutationObserver watches all plugin containers, updates breadcrumb when visibility changes

#### Back Navigation

- Back button calls `goHome()` — hides all plugin containers, shows landing page
- Updates greeting, CGL badge, URL hash

### 5.12 Landing Page & Boot Sequence (Lines 12300–12490)

#### Landing Page Rendering

`renderLandingTools()`:
1. Reads `toolConfig[]`, filters out `hidden` entries
2. Groups by `category` (quoting → docs → ops → ref)
3. Renders each as a "bento grid" card with icon, title, subtitle, optional badge
4. Each card gets `onclick="openTool('key')"`

#### updateLandingGreeting()

Greeting priority:
1. Firebase user display name → "Welcome back, {name}"
2. Onboarding stored name → "Welcome back, {name}"
3. No auth → "Sign in to sync your data"

#### updateCGLBadge()

Reads CGL cache from localStorage, counts policies expiring:
- **Critical** (≤14 days): red badge
- **Warning** (15-30 days): amber badge
- Applied to the compliance tool card on landing page

#### window.onload Boot Sequence

```javascript
window.onload = async () => {
    1. Apply dark mode from localStorage
    2. Wait for Firebase SDK ready
    3. Initialize Auth (sets up onAuthStateChanged listener)
    4. Render landing page tools
    5. Update greeting text
    6. Update CGL badge
    7. Check/show onboarding if first visit
    8. Initialize reminders (check due alerts)
    9. Set up plugin visibility observer
    10. Handle initial hash route (if URL has #tool)
    11. Set up hashchange listener for SPA routing
};
```

#### Plugin Container Divs (Lines ~12350–12450)

13 empty `<div>` elements with `class="plugin-container"` and unique IDs (e.g., `quotingTool`, `qnaTool`, `complianceTool`). These are populated on first navigation via `fetch()`.

Exception: `prospect.js` and `coi.js` are loaded inside the `quotingTool` div area since they're tightly coupled to the quoting workflow.

#### Script Loading Order (Bottom of Body)

```html
<!-- Plugin modules (order matters for dependencies) -->
<script src="js/coi.js"></script>
<script src="js/prospect.js"></script>
<script src="js/quick-ref.js"></script>
<script src="js/accounting-export.js"></script>
<script src="js/compliance-dashboard.js"></script>
<script src="js/ezlynx-tool.js"></script>
<script src="js/quote-compare.js"></script>
<script src="js/email-composer.js"></script>
<script src="js/policy-qa.js"></script>
<script src="js/reminders.js"></script>
<script src="js/hawksoft-export.js"></script>
<script src="js/vin-decoder.js"></script>
<script src="js/data-backup.js"></script>

<!-- Infrastructure (must load after plugins) -->
<script src="js/firebase-config.js"></script>
<script src="js/auth.js"></script>
<script src="js/cloud-sync.js"></script>
<script src="js/onboarding.js"></script>
```

Infrastructure loads last because `cloud-sync.js` needs plugin modules to be available for pulling/refreshing their data.

---

## 6. JS Infrastructure Modules (5 files, ~1,556 lines)

### 6.1 crypto-helper.js (130 lines)

**Purpose:** AES-256-GCM encryption for localStorage data at rest.

**Algorithm:**
- **Encryption:** AES-256-GCM via Web Crypto API
- **Key Derivation:** PBKDF2 with 100,000 iterations, SHA-256
- **IV:** Random 12-byte initialization vector per encryption
- **Salt:** Random 256-bit value stored permanently in `localStorage.altech_crypto_salt`

**Device Fingerprint:**
The encryption key is derived from a "device fingerprint" — but this is actually just a random 256-bit salt generated once and stored in localStorage. This means:
- Encryption is stable across browser updates (persists in localStorage)
- Data is NOT portable between browsers/devices (different salt per browser)
- If localStorage is cleared, encrypted data becomes unrecoverable

**Exports:**
```javascript
window.CryptoHelper = {
    encrypt(plaintext),        // → base64 string
    decrypt(ciphertext),       // → plaintext string
    safeSave(key, value),      // localStorage.setItem with QuotaExceededError handling
    isEncrypted(value),        // Heuristic: is it base64 and not valid JSON?
};
```

**`safeSave(key, value)`:** Wraps `localStorage.setItem()`. On `QuotaExceededError`:
1. Logs warning
2. Triggers `CloudSync.schedulePush()` to offload data to Firestore
3. Returns false (caller can handle)

**Backwards Compatibility:** `decrypt()` tries AES-GCM first, falls back to `JSON.parse()` for pre-encryption legacy data.

### 6.2 firebase-config.js (96 lines)

**Purpose:** Initialize Firebase app, auth, and Firestore.

**Config (hardcoded):**
```javascript
{
    apiKey: "AIzaSy...",
    authDomain: "altech-app-5f3d0.firebaseapp.com",
    projectId: "altech-app-5f3d0",
    storageBucket: "altech-app-5f3d0.firebasestorage.app",
    messagingSenderId: "508093...",
    appId: "1:508093...:web:..."
}
```

**Initialization:**
1. `firebase.initializeApp(config)` — compat SDK
2. `firebase.auth()` — assigned to local `auth`
3. `firebase.firestore()` with `enablePersistence({ synchronizeTabs: true })` — offline-first with multi-tab sync
4. Persistence errors caught silently (browser may not support IndexedDB)

**Exports:**
```javascript
window.FirebaseConfig = {
    get app(),
    get auth(),
    get db(),
    get isReady(),      // true after init
    get sdkLoaded(),    // true if firebase global exists
};
```

### 6.3 auth.js (348 lines)

**Purpose:** Firebase Authentication with modal UI.

**Auth Methods:**
- `signup(email, password, name)` → `firebase.auth().createUserWithEmailAndPassword()` → `updateProfile({displayName})`
- `login(email, password)` → `firebase.auth().signInWithEmailAndPassword()`
- `logout()` → `firebase.auth().signOut()`
- `resetPassword(email)` → `firebase.auth().sendPasswordResetEmail()`
- `updateName(name)` → `currentUser.updateProfile({displayName})`

**Modal Views (4):**
1. **Login** — email + password form
2. **Signup** — email + password + name form
3. **Reset** — email form for password reset
4. **Account** — display name, email, change name, logout, delete cloud data

**Auth State Change:**
```javascript
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        CloudSync.pullFromCloud();  // Download all synced data
        updateLandingGreeting();    // Update "Welcome back, {name}"
    }
});
```

**Error Handling:**
Friendly messages for Firebase error codes:
- `auth/email-already-in-use` → "This email is already registered"
- `auth/weak-password` → "Password should be at least 6 characters"
- `auth/user-not-found` → "No account found with this email"
- `auth/wrong-password` → "Incorrect password"
- Plus 6 more codes

### 6.4 cloud-sync.js (725 lines)

**Purpose:** Bidirectional sync between localStorage and Firestore with conflict resolution.

**Firestore Data Model:**
```
users/{uid}/
├── sync/
│   ├── settings          # Dark mode, preferences
│   ├── currentForm       # altech_v6 form data
│   ├── cglState          # CGL compliance state
│   ├── clientHistory     # Client history array
│   ├── quickRefCards     # Quick reference custom cards
│   └── reminders         # Reminders data
└── quotes/
    ├── {quoteId1}        # Individual quote documents
    ├── {quoteId2}
    └── ...
```

**Sync Metadata:**
Each document tracks:
```javascript
{
    data: { ... },              // The actual data
    lastModified: timestamp,    // ISO string
    deviceId: "uuid",           // Unique per browser
    version: 1                  // Increment on update
}
```

**Device ID:** Generated once via `crypto.randomUUID()`, stored in `localStorage.altech_device_id`.

**Push Flow (`pushToCloud`):**
1. Triggered by `schedulePush()` — debounced 3 seconds
2. Reads all synced data from localStorage via `_getLocalData()`
3. For each data type, calls `_pushDoc(uid, docType, data)`:
   - Reads existing Firestore doc
   - If remote is newer AND from different device → conflict (see below)
   - Otherwise, writes with updated metadata
4. Uses `Promise.allSettled()` for fault tolerance (one failure doesn't block others)

**Pull Flow (`pullFromCloud`):**
1. Called on login, manual sync, and auth state change
2. Reads all Firestore docs
3. For each, compares timestamps with local version
4. If remote is newer, updates localStorage
5. Calls module-specific refresh (e.g., `ComplianceDashboard.render()`, `RemindersModule.render()`)
6. Updates UI (greeting, form data, etc.)

**Conflict Resolution:**
Strategy: **"Keep both"** with user dialog
1. Detects: remote `lastModified` > local `lastModified` AND remote `deviceId` ≠ local `deviceId`
2. Creates a conflict copy: `{docType}_conflict_{timestamp}`
3. Shows modal dialog: "Changes were made on another device. Keep local / Keep remote / Keep both?"
4. User resolves per-document

**Delete Cloud Data:**
`deleteCloudData()` — deletes all Firestore documents for the user, called from Account settings.

### 6.5 onboarding.js (257 lines)

**Purpose:** First-run welcome experience with access code gate.

**3-Step Flow:**
1. **Welcome** — branding splash, "Get Started" button
2. **Your Name** — text input saved to `localStorage.altech_onboarding_name` for greeting personalization
3. **Access Code** — validates against hardcoded codes:
   - `ALTECH-2026`
   - `ALTECH2026`
   - `WELCOME2026`
   - Case-insensitive comparison
   - On success: sets `localStorage.altech_onboarded = 'true'`, hides overlay

**Completion:** Sets `altech_onboarded` flag. Subsequent visits skip overlay entirely.

**Share/Invite Modal:**
Post-onboarding, provides a share URL with copy-to-clipboard functionality.

---

## 7. JS Plugin Modules (14 files, ~10,358 lines)

### 7.1 policy-qa.js (1,006 lines)

**Plugin:** Policy Q&A  
**Module:** `window.PolicyQA`  
**Storage:** `altech_v6_qna`

AI-powered document Q&A system:
- Drag-and-drop PDF/image upload
- Extracts text from documents (PDF via pdf.js, images via Gemini vision)
- Chat interface with Gemini AI
- Responses include **citations** (page/section references) and **confidence scores**
- Offline keyword fallback when API unavailable
- Auto-detects carrier from document content
- Chat history export (text/JSON)

### 7.2 compliance-dashboard.js (2,107 lines)

**Plugin:** CGL Compliance Dashboard  
**Module:** `window.ComplianceDashboard`  
**Storage:** `altech_cgl_state`, `altech_cgl_cache`, IndexedDB `altech_cgl`

The most complex plugin. Tracks commercial general liability (CGL) policy compliance across an agency's book of business:
- **Multi-tier persistence**: disk → localStorage → IndexedDB → Vercel KV (Redis) → Firebase
- **Smart merge**: reconciles data from all tiers, newest wins
- Fetches client/policy data from HawkSoft API via `/api/compliance.js`
- **Policy type classification**: CGL, Bond, Auto, WC, Umbrella, BOP, Professional Liability, Cyber, EPLI
- HawkSoft deep-linking via `hs://` protocol
- Expiration alerts with badge counts (critical ≤14 days, warning 15-30 days)
- Manual overrides and annotations (stored in KV)
- Batch refresh with parallel processing

### 7.3 hawksoft-export.js (1,704 lines)

**Plugin:** HawkSoft Export Tool  
**Module:** `window.HawkSoftExport`  
**Storage:** `altech_hawksoft_settings`

Generates `.CMSMTF` files (HawkSoft 6 import format) with a rich configuration UI:
- Three policy types: Auto, Home, Commercial
- Per-vehicle and per-driver sections
- Coverage detail arrays
- FSC (File Status Code) notes generation
- Customizable tag mapping
- Preview before download

### 7.4 hawksoft-integration.js (226 lines)

**Module:** `window.HawkSoftIntegration` (class)

Read-only HawkSoft CMS API integration:
- Client search/lookup by name or ID
- Log note append (with dry-run preview before actual write)
- **Safety-first design**: no delete, no policy modification, no overwrite
- Auth: Basic Auth with credentials from environment
- API endpoint: configurable (defaults to HawkSoft cloud URL)

### 7.5 ezlynx-tool.js (989 lines)

**Plugin:** EZLynx Rating Tool  
**Module:** `window.EZLynxTool`  
**Storage:** `altech_ezlynx_login`, `altech_ezlynx_formdata`

Integration with EZLynx rating platform:
- 80+ form fields matching EZLynx's interface
- **Schema scraper**: imports field definitions from `ezlynx_schema.json` or Chrome Extension JSON
- **Auto-fill methods**:
  1. Puppeteer automation (fills fields in EZLynx's web UI)
  2. Chrome Extension clipboard (copies JSON for extension to paste)
- Login credential storage (encrypted)
- Field-by-field mapping with validation

### 7.6 quote-compare.js (842 lines)

**Plugin:** Quote Comparison  
**Module:** `window.QuoteCompare`  
**Storage:** `altech_v6_quote_comparisons`

Upload EZLynx quote result PDFs → AI-powered comparison:
- Drag-drop multiple carrier quote PDFs
- Gemini extracts: carrier name, premiums, coverages, deductibles, discounts
- **Side-by-side comparison table** with highlighting (best/worst values)
- **AI recommendation** with reasoning
- **Interactive Chat Advisor** ("Altech Quote Advisor") for follow-up questions
- Export: PDF summary, TSV spreadsheet

### 7.7 reminders.js (505 lines)

**Plugin:** Reminders  
**Module:** `window.RemindersModule`  
**Storage:** `altech_reminders`

Task and reminder management:
- **Recurrence**: Daily, Weekly, Biweekly, Monthly, Once
- **Status**: Not Started, In Progress, Complete, Overdue
- **Priorities**: Low, Medium, High, Urgent
- **Categories**: Follow-up, Renewal, Document, Payment, Other
- Search and filter by any attribute
- Alert toasts for overdue items (throttled to every 4 hours)
- Badge count on landing page
- Cloud synced via Firestore

### 7.8 quick-ref.js (267 lines)

**Plugin:** Quick Reference  
**Module:** `window.QuickRef`  
**Storage:** `altech_quickref_cards`

Two reference tools:
1. **APCO Phonetic Alphabet Grid** — interactive speller (type text → spells out "Alpha, Bravo, ...")
2. **Carrier Code Cards** — quick reference for:
   - Progressive (agent code, NAIC, etc.)
   - Safeco
   - Travelers
   - Mutual of Enumclaw
   - Custom cards (add/edit/delete)
- Click-to-copy any value
- Cloud synced

### 7.9 accounting-export.js (310 lines)

**Plugin:** Accounting Export  
**Module:** `window.AccountingExport`  
**Storage:** `altech_acct_vault`, `altech_acct_history`

Two tools:
1. **HawkSoft Accounting/Receipt Export** — generates transaction records, with optional Puppeteer automation to pull from HawkSoft's accounting module
2. **Trust Deposit Calculator** — cash denomination counter:
   - Input: count of each bill/coin denomination
   - Output: total sum with breakdown
   - Useful for counting cash payments in field

### 7.10 coi.js (309 lines)

**Plugin:** Certificate of Insurance  
**Module:** `window.COIModule`  
**Storage:** `altech_coi_draft`

Generates ACORD 25 Certificates of Insurance:
- Pre-fills agency defaults (name, address, phone, email)
- Certificate holder, insured party, policy details
- Sends to `/api/generate-coi.js` → Python subprocess (`fill_acord25.py`) fills ACORD 25 PDF template
- Downloads completed PDF
- Draft auto-saved to localStorage

### 7.11 email-composer.js (339 lines)

**Plugin:** Email Composer  
**Module:** `window.EmailComposer`  
**Storage:** `altech_email_drafts` (encrypted via CryptoHelper)

AI-powered email writing:
- **5 Tones**: Professional, Friendly, Formal, Casual, Urgent
- **5+ Context Presets**: Quote follow-up, Policy renewal, Claim update, Welcome letter, Custom
- **Gemini streaming**: text appears character-by-character as generated
- Recipient/subject/body fields
- Copy to clipboard or open in default email client (`mailto:`)
- Drafts encrypted at rest

### 7.12 prospect.js (935 lines)

**Plugin:** Prospect Investigator  
**Module:** `window.ProspectModule`

Commercial prospect research tool:
- **Parallel lookups** (via `/api/prospect-lookup.js`):
  1. **WA L&I** — Socrata API for Washington contractor licenses
  2. **OR CCB** — Socrata API for Oregon contractor licenses
  3. **Secretary of State** — WA API + OR/AZ stubs for business registration
  4. **OSHA** — DOL enforcement/violations history
- **Risk classification scoring** (0-100 based on violations, complaints, insurance lapses)
- Deep links to source agency pages
- **Copy-to-quote** — transfers prospect data to intake form
- **COI generation** — triggers COI module with prospect data

### 7.13 vin-decoder.js (777 lines)

**Plugin:** VIN Decoder  
**Module:** `window.VinDecoder`  
**Storage:** `altech_vin_history`

Two-layer VIN decoding:
1. **Offline decode**: Full 17-position parse:
   - Positions 1-3: WMI (World Manufacturer Identifier) — hardcoded database of ~100 manufacturers
   - Position 9: Check digit validation (mod 11 algorithm)
   - Position 10: Model year decode (1980-2039 cycle)
   - Positions 12-17: Serial number
2. **NHTSA API enrichment**: `vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/`
   - Returns: Make, Model, Trim, Body Type, Engine, Fuel Type, GVWR, Plant
   - 8-second timeout, graceful degradation to offline-only on failure

**APCO Phonetic Reading**: Spells VIN character-by-character using APCO phonetics (useful for phone communication).

**Color-coded breakdown**: Visual display with each VIN position colored and labeled.

### 7.14 data-backup.js (107 lines)

**Module:** `window.DataBackup`

Two responsibilities:

1. **Full Backup/Restore**:
   - `backup()` — serializes all `altech_*` and `cgl_*` localStorage keys into a JSON file
   - `restore(file)` — reads JSON file, writes all keys back to localStorage
   - Useful for device migration or recovery

2. **Global Keyboard Shortcuts**:
   - `Ctrl+O` — open file (triggers scan upload)
   - `Ctrl+Enter` — send Q&A message
   - `←/→ Arrow` — navigate wizard steps
   - `Ctrl+S` — prevent browser save dialog (data auto-saves)
   - `Escape` — close active modal/panel

---

## 8. API Serverless Functions (13 files, ~4,667 lines)

All functions live in `api/` and deploy as Vercel serverless functions (Node.js runtime).

### 8.1 _security.js (107 lines)

**Shared middleware module** — NOT a route itself.

```javascript
function securityMiddleware(handler, options = {}) {
    return async (req, res) => {
        // Rate limiting, headers, CORS, then call handler
    };
}
```

**Features:**
- **Rate limiting**: IP-based, 20 requests/minute default (configurable)
- **Security headers**: HSTS, CSP, X-Frame-Options DENY, X-XSS-Protection, X-Content-Type-Options nosniff
- **CORS**: Allow-Origin based on request origin
- **Utilities**: `sanitizeInput(str)`, `validateEmail(str)`, `validatePhone(str)`

> **⚠️ CRITICAL FINDING:** Only `name-phonetics.js` uses this middleware. The other 12 API endpoints have NO rate limiting, NO security headers, and NO input sanitization from this module.

### 8.2 policy-scan.js (195 lines)

**Route:** `POST /api/policy-scan`  
**Model:** Gemini 2.5 Flash

Accepts multi-file insurance document uploads (base64 images/PDFs):
- Processes up to 5 files in a single request
- Uses `_getScanSchema()` response schema (~120 field definitions)
- Returns structured data with per-field confidence scores (0.0–1.0)
- System prompt: "insurance underwriter persona"
- Temperature: 0.1 (deterministic)

### 8.3 vision-processor.js (804 lines)

**Route:** `POST /api/vision-processor`  
**Model:** Gemini 2.5 Flash (vision)

Five actions, each with distinct prompts and schemas:

| Action | Input | Output |
|--------|-------|--------|
| `processImage` | Property exterior photo | Construction type, stories, garage, roof, siding |
| `processPDF` | Tax/assessment PDF | Assessed value, tax amount, legal description |
| `analyzeAerial` | Satellite + Street View | Pool, fence, trampoline, roof condition (1-10), hazards |
| `scanDriverLicense` | DL photo | Name, DOB, DL#, address, gender, restrictions |
| `consolidate` | Multiple results | Merged best-confidence values |

Error codes: 301-399 range for vision-specific errors.

### 8.4 document-intel.js (95 lines)

**Route:** `POST /api/document-intel`  
**Model:** Gemini 2.5 Flash

Lightweight document analyzer for supplementary docs (not policy declarations). Returns document type classification and extracted key values. Graceful degradation: returns empty result if API key missing.

### 8.5 property-intelligence.js (1,294 lines)

**Route:** `POST /api/property-intelligence`  
**LARGEST API FILE**

Four modes:

#### Mode: `arcgis`
- **7 county configurations** (each with unique REST URL, layer ID, field mappings):
  - Clark County (WA) — includes fact sheet HTML scraping
  - King County (WA)
  - Pierce County (WA)
  - Multnomah County (OR)
  - Snohomish County (WA)
  - Spokane County (WA)
  - Washington County (OR)
- **3 state aggregators**: WA DNR, OR ORMAP, AZ ADOT
- Queries by address, returns raw parcel data

#### Mode: `satellite`
- Google Maps Static API: satellite image at zoom 18, 600×400
- Google Street View: same address
- Sends both to Gemini vision for property analysis
- Returns: estimated construction, stories, garage, roof, lot size

#### Mode: `zillow`
- Gemini with `tools: [{ google_search: {} }]` (Search Grounding)
- Searches web for property details
- Extensive server-side normalization tables:
  - Heating: 16 raw values → 6 normalized
  - Cooling: 8 values → 4 normalized
  - Roofing: 20 values → 8 normalized
  - Foundation: 10 values → 5 normalized
  - Construction: 12 values → 8 normalized
  - Exterior: 15 values → 6 normalized

#### Mode: `firestation`
- Geocode address → lat/lng
- Google Places Nearby Search for fire stations within 16km
- Returns: nearest station name, distance, estimated ISO protection class

### 8.6 rag-interpreter.js (344 lines)

**Route:** `POST /api/rag-interpreter`  
**Model:** Gemini 2.5 Flash

RAG (Retrieval-Augmented Generation) pattern:
1. Receives raw parcel data from ArcGIS (county-specific field names and codes)
2. Sends to Gemini with schema-guided prompt
3. Gemini normalizes county codes to insurance form values (e.g., `"WD FR"` → `"Wood Frame"`)
4. Claims 99% confidence on standardized outputs
5. Validates output structure before returning

### 8.7 historical-analyzer.js (696 lines)

**Route:** `POST /api/historical-analyzer`  
**Model:** `gemini-2.0-flash-001` via `@ai-sdk/google` + `ai` SDK  
**Temperature:** 0.3

Four actions:

| Action | Purpose |
|--------|---------|
| `analyzeValues` | Property value trends over time (appreciation, market cycles) |
| `analyzeInsurance` | Insurance cost and claim history analysis |
| `compareMarket` | Comparison against similar properties in area |
| `generateTimeline` | Chronological property event timeline |

Returns structured markdown with data tables.

### 8.8 compliance.js (772 lines)

**Route:** `GET /api/compliance`  
**External:** HawkSoft API + Redis Cloud  
**Timeout:** 60 seconds (Vercel config)

Fetches commercial policies from HawkSoft CMS:
1. Authenticates with HawkSoft API (Basic Auth)
2. Fetches all clients with policies expiring in last 3 years
3. **Parallel batching**: 50 clients per batch, 10 concurrent requests
4. Classifies policy types: CGL, Bond, Auto, WC, Umbrella, BOP, Professional Liability, Cyber, EPLI
5. Flags non-syncing carriers
6. **Redis cache**: 15-minute TTL, stored by agency ID
7. Returns structured JSON with policy summaries and expiration alerts

### 8.9 generate-coi.js (100 lines)

**Route:** `POST /api/generate-coi`

Generates ACORD 25 Certificate of Insurance via Python:
1. Receives certificate data (holder, insured, policies, etc.)
2. Writes temp JSON data file
3. Spawns Python subprocess: `python fill_acord25.py <data.json> <output.pdf>`
4. Python script fills ACORD 25 PDF template using pdf-lib
5. Returns filled PDF as base64
6. 30-second subprocess timeout

### 8.10 kv-store.js (120 lines)

**Route:** `GET/POST/DELETE /api/kv-store`  
**Backend:** Redis Cloud (ioredis)

Generic key-value CRUD with safety constraints:
- **Allowlisted keys only**: `cgl_state`, `cgl_cache`, `email_drafts`, `export_history`
- **1MB size limit** per value
- **501 fallback**: returns 501 if Redis connection fails (allows client to fallback to localStorage)
- GET: `?key=cgl_state` → returns value
- POST: `{ key, value }` → stores
- DELETE: `?key=cgl_state` → removes

### 8.11 name-phonetics.js (89 lines)

**Route:** `POST /api/name-phonetics`  
**Model:** Gemini  
**⚠️ ONLY endpoint using `securityMiddleware`**

Generates phonetic pronunciation guides for client names:
- Input: `{ firstName, lastName }`
- Output: `{ firstName: "JON-uh-thun", lastName: "SMITH" }` (phonetic spelling)
- Uses Gemini `response_schema` for structured output
- Protected by rate limiting (20/min) and security headers

### 8.12 places-config.js (14 lines)

**Route:** `GET /api/places-config`

Shortest API file. Returns environment API keys to frontend:
```json
{
    "PLACES_API_KEY": "...",
    "GOOGLE_API_KEY": "..."
}
```

> **⚠️ Security note:** No authentication required. API keys exposed to anyone who hits this endpoint.

### 8.13 prospect-lookup.js (1,037 lines)

**Route:** `GET /api/prospect-lookup`

Four lookup types via `?type=` parameter:

| Type | Source | Data |
|------|--------|------|
| `li` | WA Socrata (data.wa.gov) | Contractor licenses, violations, UBI |
| `or-ccb` | OR Socrata (data.oregon.gov) | Oregon contractor CCB licenses |
| `sos` | WA SOS API + OR/AZ stubs | Business registration, officers, status |
| `osha` | DOL (enforcement.dol.gov) | OSHA violations, inspections, penalties |

**Notable:** Handles Cloudflare Turnstile CAPTCHA blocks gracefully (returns error message suggesting direct site visit).

---

## 9. CSS Architecture (12 files, ~6,500 lines)

### 9.1 Theme System

All styling uses CSS Custom Properties defined in `main.css`:

```css
:root {
    --apple-blue: #007AFF;
    --apple-blue-hover: #0051D5;
    --apple-gray: #6e6e73;
    --success: #34C759;
    --danger: #FF3B30;
    --bg: #FBF8F5;
    --bg-card: rgba(255, 255, 255, 0.90);
    --bg-input: #F5F0EC;
    --text: #1a1a1e;
    --text-secondary: #7A6E65;
    --border: #E8DDD4;
    --shadow: rgba(0, 0, 0, 0.12);
}

body.dark-mode {
    --apple-blue: #0A84FF;
    --bg: #000000;
    --bg-card: #1C1C1E;
    --bg-input: #2C2C2E;
    --text: #FFFFFF;
    --text-secondary: #98989D;
    --border: #38383A;
    /* ... */
}
```

**Critical:** The following variable names do NOT exist in the codebase:
- ~~`--card`~~ → use `--bg-card`
- ~~`--accent`~~ → use `--apple-blue`
- ~~`--muted`~~ → use `--text-secondary`

### 9.2 Design Language

- **Apple-inspired**: San Francisco font stack, rounded corners, blur/saturate glass effects
- **Dark mode**: Neon glow effects on tool icons (9 color classes with `box-shadow` glow)
- **Light mode**: "Golden hour" warm ambient theme
- **Responsive**: mobile-first breakpoints, touch targets ≥44px
- **Glassmorphism**: `backdrop-filter: blur(24px) saturate(1.6)` on cards/panels

### 9.3 File Responsibilities

| File | Lines | Purpose |
|------|-------|---------|
| `main.css` | 2,781 | Core theme, layout, wizard steps, forms, buttons, toast, landing page |
| `compliance.css` | ~400 | CGL dashboard table, badges, status indicators |
| `auth.css` | ~200 | Auth modal, form inputs, view transitions |
| `onboarding.css` | ~250 | Onboarding overlay, step animations |
| `reminders.css` | ~300 | Reminder cards, priority colors, recurrence badges |
| `vin-decoder.css` | ~350 | VIN breakdown grid, character coloring |
| `quote-compare.css` | ~300 | Comparison table, best/worst highlighting |
| `hawksoft.css` | ~250 | Tag builder, preview panel |
| `ezlynx.css` | ~250 | Form field mapping, schema viewer |
| `email.css` | ~200 | Composer layout, streaming text animation |
| `accounting.css` | ~200 | Calculator grid, denomination inputs |
| `quickref.css` | ~200 | Phonetic grid, carrier cards |

---

## 10. Data Model & Persistence

### 10.1 localStorage Keys

| Key | Owner | Encrypted | Cloud Synced | Description |
|-----|-------|:---------:|:------------:|-------------|
| `altech_v6` | App (index.html) | ✅ | ✅ | All form field values (the main intake data) |
| `altech_v6_quotes` | App (index.html) | ✅ | ✅ | Quote library (array of drafts) |
| `altech_cgl_state` | ComplianceDashboard | ❌ | ✅ | CGL compliance state |
| `altech_cgl_cache` | ComplianceDashboard | ❌ | ❌ | CGL API response cache |
| `altech_quickref_cards` | QuickRef | ❌ | ✅ | Custom carrier code cards |
| `altech_reminders` | RemindersModule | ❌ | ✅ | Reminders data |
| `altech_client_history` | App (index.html) | ❌ | ✅ | Client history array (50-entry cap) |
| `altech_dark_mode` | App (index.html) | ❌ | ✅ | Dark mode preference |
| `altech_coi_draft` | COIModule | ❌ | ❌ | COI form draft |
| `altech_email_drafts` | EmailComposer | ✅ | ❌ | Email drafts |
| `altech_acct_vault` | AccountingExport | ❌ | ❌ | Accounting data |
| `altech_acct_history` | AccountingExport | ❌ | ❌ | Accounting export log |
| `altech_ezlynx_login` | EZLynxTool | ❌ | ❌ | EZLynx credentials |
| `altech_ezlynx_formdata` | EZLynxTool | ❌ | ❌ | EZLynx form data |
| `altech_hawksoft_settings` | HawkSoftExport | ❌ | ❌ | HawkSoft export preferences |
| `altech_vin_history` | VinDecoder | ❌ | ❌ | VIN decode history |
| `altech_v6_qna` | PolicyQA | ❌ | ❌ | Q&A chat history |
| `altech_v6_quote_comparisons` | QuoteCompare | ❌ | ❌ | Quote comparison data |
| `altech_onboarding_name` | Onboarding | ❌ | ❌ | User's name from onboarding |
| `altech_onboarded` | Onboarding | ❌ | ❌ | Boolean flag: onboarding complete |
| `altech_crypto_salt` | CryptoHelper | ❌ | ❌ | 256-bit encryption salt |
| `altech_device_id` | CloudSync | ❌ | ❌ | UUID device identifier |

### 10.2 IndexedDB

Used only by `compliance-dashboard.js`:
- Database: `altech_cgl`
- Store: CGL compliance data
- Purpose: Additional persistence tier beyond localStorage (survives more clear scenarios)

### 10.3 Form Field ↔ Storage Binding

**Every `<input id="fieldName">` auto-syncs to `App.data.fieldName`** via the event delegation system. The field's `id` attribute IS the storage key.

> **⚠️ CRITICAL:** Renaming a field's `id` attribute breaks data persistence for all existing users. If a name change is needed, add a migration in `App.load()` that maps old key → new key.

### 10.4 Data Format

`App.data` is a flat key-value object:
```javascript
{
    firstName: "John",
    lastName: "Smith",
    dateOfBirth: "1985-03-15",
    ssn: "123-45-6789",
    address: "123 Main St",
    city: "Portland",
    state: "OR",
    zip: "97201",
    coverageType: "both",
    yearBuilt: "1978",
    constructionType: "frame",
    // ... 100+ more fields
}
```

Drivers and vehicles are stored separately in `App.drivers[]` and `App.vehicles[]`, serialized alongside `App.data` in the main storage key.

---

## 11. Cloud Sync Architecture

### 11.1 Sync Flow Diagram

```
User Action (e.g., form edit)
    │
    ▼
localStorage.setItem('altech_v6', encrypted_data)
    │
    ▼
CloudSync.schedulePush()        ←── 3-second debounce
    │
    (3 seconds later)
    ▼
CloudSync.pushToCloud()
    │
    ├── For each data type (settings, currentForm, cglState, ...)
    │       │
    │       ▼
    │   _pushDoc(uid, docType, localData)
    │       │
    │       ├── Read Firestore doc
    │       ├── Compare timestamps + deviceId
    │       │       │
    │       │       ├── No conflict → Write to Firestore
    │       │       └── Conflict detected → Create conflict copy + dialog
    │       │
    │       └── Write: { data, lastModified, deviceId, version }
    │
    └── Promise.allSettled() (fault-tolerant)
```

### 11.2 Conflict Detection Logic

```
IF remote.lastModified > local.lastModified
   AND remote.deviceId ≠ local.deviceId
THEN → CONFLICT
```

Resolution options:
1. **Keep Local** — overwrite remote with local data
2. **Keep Remote** — overwrite local with remote data
3. **Keep Both** — save conflict copy with `_conflict_` suffix

### 11.3 Adding a New Synced Data Type

When adding cloud sync for a new localStorage key, update 4 places in `cloud-sync.js`:

1. **`_getLocalData()`** — add `yourKey: tryParse('altech_your_key')`
2. **`pushToCloud()`** — add `_pushDoc(uid, 'yourDocType', localData.yourKey)` to Promise.all
3. **`pullFromCloud()`** — add pull logic + appropriate UI refresh call
4. **`deleteCloudData()`** — add `'yourDocType'` to the `syncDocs` array

---

## 12. Security Analysis

### 12.1 Strengths

| Area | Implementation |
|------|---------------|
| Data at rest | AES-256-GCM encryption for form data and quotes in localStorage |
| Key derivation | PBKDF2 with 100K iterations (industry standard) |
| Auth | Firebase Authentication (managed service, no custom password storage) |
| Firestore rules | Per-user data isolation at `users/{uid}/` path |
| Input sanitization | `_security.js` provides `sanitizeInput()` utility |
| CORS | Handled at Vercel level |
| Client-side XSS | `escapeHTML()` utility, `_escapeXML()` for exports |

### 12.2 Vulnerabilities & Concerns

| Issue | Severity | Details |
|-------|----------|---------|
| **12/13 APIs unprotected** | 🔴 HIGH | Only `name-phonetics.js` uses `securityMiddleware`. All other endpoints have no rate limiting. An attacker could abuse `policy-scan.js`, `vision-processor.js`, etc. burning through Gemini API quota. |
| **API keys in frontend** | 🔴 HIGH | `places-config.js` returns API keys to any unauthenticated request. Firebase config is hardcoded in `firebase-config.js`. While Firebase keys are designed to be public (security is in Firestore rules), the Gemini key returned by `places-config.js` is a backend secret. |
| **Hardcoded fallback API key** | 🟡 MEDIUM | `_getGeminiKey()` has a hardcoded fallback key in index.html source. |
| **Encryption key not portable** | 🟡 MEDIUM | Encryption salt is per-browser localStorage. Cross-device sync sends encrypted data that the other device can't decrypt. Cloud sync should either sync the decrypted version or sync the salt. |
| **Access codes are client-side** | 🟡 MEDIUM | Onboarding access codes (`ALTECH-2026`, etc.) are visible in source. This is a "soft gate," not real security. |
| **No CSRF protection** | 🟡 MEDIUM | API endpoints accept POST requests without CSRF tokens. Mitigated by same-origin policy for most cases. |
| **Carrier config hardcoded** | 🟢 LOW | WA-specific agent codes and carrier IDs in buildHomeXML() ExtendedInfo. If these change, requires code update. |
| **HawkSoft credentials** | 🟢 LOW | Stored in environment variables, accessed only server-side. Properly handled. |

### 12.3 Recommendations

1. **Apply security middleware to all API routes** — wrap every handler in `securityMiddleware()` with appropriate rate limits
2. **Move Gemini key resolution server-side** — never return it from `places-config.js`; have all Gemini calls go through server-side API endpoints
3. **Add Firebase Auth verification to API endpoints** — verify Firebase ID token on server-side for any user-specific operations
4. **Sync decrypted data to Firestore** — or implement key exchange. Currently, encrypted data from one device is garbage on another
5. **Implement CORS allowlist** — instead of reflecting origin, lock to specific domains

---

## 13. Key Data Flows

### 13.1 Policy Scan → Form Fill

```
Photo/PDF Upload
    │
    ▼
processScan() ──→ Direct Gemini API call
    │                    │
    │                    ├── Success → parse response
    │                    └── Failure ──→ /api/policy-scan.js (server fallback)
    │
    ▼
Extraction Review Modal (confidence pills, edit fields)
    │
    ▼
applyExtractedData() ──→ App.data[field] = value (for each field)
    │                 ──→ Parse semicolon-delimited drivers/vehicles
    │                 ──→ Trigger VIN decode for extracted VINs
    │
    ▼
App.save() ──→ encrypt ──→ localStorage ──→ CloudSync.schedulePush()
```

### 13.2 SmartAutoFill Pipeline

```
User clicks "Smart Auto-Fill" on Step 3
    │
    ▼
smartAutoFill(address)
    │
    ├──→ fetchArcgisAndRag()     ──→ /api/property-intelligence?mode=arcgis
    │    (parallel)                     ──→ /api/rag-interpreter (normalize)
    │
    ├──→ fetchZillowData()       ──→ /api/property-intelligence?mode=zillow
    │    (parallel)                     (Gemini Search Grounding)
    │
    └──→ fetchFireStationData()  ──→ /api/property-intelligence?mode=firestation
         (parallel)                     (Google Places → ISO class)
    │
    ▼
Promise.allSettled() → merge results (ArcGIS > Zillow > Fire > fallbacks)
    │
    ▼
showUnifiedDataPopup() → color-coded source badges → user accept/reject
    │
    ▼
applyParcelData() → App.data[field] = value → App.save()
```

### 13.3 Export Flow

```
User clicks export button on Step 6
    │
    ├──→ PDF:    buildPDF()     → jsPDF → downloadBlob()
    ├──→ CMSMTF: buildCMSMTF()  → tagged text → downloadFile()
    ├──→ XML:    buildXML()      → EZAUTO V200 → downloadFile()
    ├──→ HomeXML: buildHomeXML() → EZHOME V200 → downloadFile()
    ├──→ Both:   exportBothXML() → JSZip bundle → downloadBlob()
    ├──→ CSV:    buildCSV()      → CSV text → downloadFile()
    └──→ Text:   buildText()     → notes → downloadFile()
    │
    ▼
logExport(type, filename) → localStorage + optional server log
```

### 13.4 Plugin Navigation

```
User clicks tool on landing page
    │
    ▼
openTool(key) → navigateTo(key)
    │
    ├── Hide landing page
    ├── Hide all plugin containers
    ├── Show target container
    │
    ├── First visit?
    │   ├── YES → fetch(plugins/tool.html) → inject innerHTML → dataset.loaded = true
    │   └── NO  → (skip fetch, HTML cached in DOM)
    │
    ├── window[config.initModule].init()
    ├── location.hash = '#' + key
    └── Update breadcrumb + back button
```

---

## 14. Known Weaknesses & Technical Debt

### 14.1 Architectural Issues

| Issue | Impact | Location |
|-------|--------|----------|
| **12,490-line monolith** | Extremely difficult to maintain, review, or test in isolation. Even simple changes risk merge conflicts. | `index.html` |
| **No module system** | All JS communicates via `window.*` globals. No dependency graph, no tree-shaking, no lazy-loading of JS (only HTML is lazy-loaded). | All JS files |
| **No build step** | No minification, no bundling, no dead code elimination. Every byte ships to the client. | Architecture |
| **Duplicated GIS database** | City→county mapping appears in both `openPropertyRecords()` and `getCountyFromCity()`. GIS URLs duplicated between `openPropertyRecords()` and `openGIS()`. | index.html (~lines 5900–6800, 7600–7800) |
| **Hardcoded carrier configs** | WA-specific agent codes, carrier IDs, and ExtendedInfo blocks hardcoded in `buildHomeXML()`. Not configurable without code changes. | index.html (~lines 10800–11200) |
| **Single-region assumption** | Much of SmartAutoFill, property records, and GIS is hardcoded for WA/OR/AZ. Expanding to other states requires significant code additions. | Multiple files |

### 14.2 Performance Concerns

| Issue | Impact |
|-------|--------|
| **All CSS loads upfront** | 12 CSS files loaded in `<head>`, even if plugin is never visited |
| **All JS loads upfront** | 19 JS files loaded at page bottom, even if plugin is never used |
| **No service worker** | Despite being mobile-first, no offline caching strategy (Firestore offline persistence helps but doesn't cover static assets) |
| **Large inline data** | 250+ carrier list in HTML datalist, city→county mappings, GIS URL databases — all inline in HTML |
| **Image compression client-side** | DL photos compressed to 800px → 600px with 0.7 quality for Vercel's 4.5MB body limit. This is a workaround, not a solution. |

### 14.3 Testing Gaps

| Area | Status |
|------|--------|
| Unit tests (form logic, validation) | ✅ 881+ tests across 14 suites |
| API endpoint tests | ❌ No server-side tests |
| Integration tests (scan→fill→export) | ❌ None |
| E2E tests (browser automation) | ❌ None |
| Plugin tests | ⚠️ Partial (some covered in Jest/JSDOM) |
| Cloud sync tests | ❌ None (requires Firestore mock) |

### 14.4 Code Quality Issues

| Issue | Details |
|-------|---------|
| **Inconsistent error handling** | Some functions silently catch, others throw, others return null |
| **Magic numbers** | Debounce timings (300ms, 450ms, 500ms, 3000ms), caps (50 clients, 5 files), image dimensions scattered throughout |
| **Mixed async patterns** | Mix of callbacks, Promises, async/await, and `.then()` chains |
| **No TypeScript** | No type safety, no IDE autocompletion for data shapes |
| **No linting** | No ESLint configuration found |

---

## 15. Strategic Recommendations

### 15.1 High Priority (Security & Stability)

1. **Secure all API endpoints** — Apply `securityMiddleware()` to every API route. Add per-endpoint rate limits (e.g., `policy-scan`: 5/min, `vision-processor`: 10/min, etc.).

2. **Remove client-side API key exposure** — Eliminate `places-config.js` returning Gemini key. Route all AI calls through server-side endpoints. Remove hardcoded fallback key from index.html.

3. **Add Firebase Auth to APIs** — Verify Firebase ID tokens on server-side for user-specific endpoints. This prevents unauthorized API access.

4. **Fix cross-device encryption** — Either sync decrypted data to Firestore, or implement salt sync. Currently, synced encrypted data is unreadable on other devices.

### 15.2 Medium Priority (Maintainability)

5. **Extract index.html into modules** — Break the 12,490-line file into separate concerns:
   - `js/app-core.js` — App object, state, save/load
   - `js/wizard.js` — Step navigation, validation
   - `js/ai-pipeline.js` — All AI/scan/extraction logic
   - `js/smart-autofill.js` — SmartAutoFill pipeline
   - `js/exports.js` — All 6 export engines
   - `js/quote-library.js` — Quote management
   - `js/client-history.js` — Client history
   This would reduce index.html to ~2,000 lines (HTML only).

6. **DRY the GIS databases** — Extract city→county mappings and GIS URLs into a single `js/geo-data.js` module shared by `openPropertyRecords()`, `getCountyFromCity()`, and `openGIS()`.

7. **Add ESLint + Prettier** — Enforce consistent code style. The codebase mixes quote styles, semicolon usage, and spacing.

8. **Add TypeScript (gradual)** — Start with JSDoc type annotations on the App object and export functions. Consider `.d.ts` declaration files.

### 15.3 Low Priority (Enhancement)

9. **Add Service Worker** — Cache static assets for true offline support. The app is already mobile-first but has no offline asset strategy.

10. **Lazy-load JS modules** — Currently all 19 JS files load on page open. Use dynamic `import()` (if moving to ES modules) or conditional `<script>` injection (matching the plugin HTML pattern).

11. **Add API endpoint tests** — Use supertest or similar to test serverless functions. Mock Gemini responses for deterministic tests.

12. **Make carrier configs data-driven** — Move WA-specific agent codes, carrier IDs, and ExtendedInfo from hardcoded `buildHomeXML()` into a configurable JSON file or admin UI.

13. **Add E2E tests** — Playwright or Cypress tests for critical flows: scan→fill→export, plugin navigation, cloud sync.

---

## Appendix A: Environment Variables

| Variable | Used By | Required |
|----------|---------|----------|
| `GOOGLE_API_KEY` | Gemini AI calls (policy scan, vision, RAG, etc.) | ✅ |
| `GOOGLE_PLACES_API_KEY` | Google Places autocomplete | Optional |
| `SENDGRID_API_KEY` | Email export (UI currently disabled) | Optional |
| `HAWKSOFT_API_URL` | HawkSoft CMS API base URL | For compliance |
| `HAWKSOFT_USERNAME` | HawkSoft Basic Auth | For compliance |
| `HAWKSOFT_PASSWORD` | HawkSoft Basic Auth | For compliance |
| `REDIS_URL` | Redis Cloud connection string | For KV/compliance |
| `FIREBASE_*` | Hardcoded in firebase-config.js (not env-driven) | N/A |

## Appendix B: Useful Commands

```bash
# Development
npm run dev              # Start local server (node server.js)
npm run dev:vercel       # Start with Vercel dev runtime

# Testing
npm test                 # All 14 suites (881+ tests)
npm run test:watch       # TDD watch mode
npx jest --no-coverage   # Faster (skip coverage report)
npx jest tests/app.test.js  # Single suite

# Deployment
npm run deploy:vercel    # Deploy to Vercel production

# Desktop (Tauri)
npm run tauri:dev        # Tauri development mode
npm run tauri:build      # Build desktop executable
```

## Appendix C: Adding a New Plugin (Checklist)

1. **`js/your-plugin.js`** — IIFE module on `window.YourModule`:
   ```javascript
   window.YourModule = (() => {
       'use strict';
       const STORAGE_KEY = 'altech_your_key';
       function init() { /* ... */ }
       function render() { /* ... */ }
       return { init, render };
   })();
   ```

2. **`plugins/your-plugin.html`** — Plugin UI markup

3. **`css/your-plugin.css`** — Styles using theme variables (`--bg-card`, `--apple-blue`, etc.)

4. **`index.html`** — Three additions:
   - Add `<link rel="stylesheet" href="css/your-plugin.css">` to `<head>`
   - Add to `toolConfig[]` array:
     ```javascript
     { key: 'yourplugin', icon: '🔧', color: 'blue', title: 'Your Plugin',
       containerId: 'yourpluginTool', initModule: 'YourModule',
       htmlFile: 'plugins/your-plugin.html', category: 'ops' }
     ```
   - Add `<div id="yourpluginTool" class="plugin-container"></div>` to the container area
   - Add `<script src="js/your-plugin.js"></script>` to the script loading section

5. **`js/cloud-sync.js`** — If synced, update 4 methods:
   - `_getLocalData()` → add key
   - `pushToCloud()` → add `_pushDoc()` call
   - `pullFromCloud()` → add pull + UI refresh
   - `deleteCloudData()` → add to `syncDocs` array

---

*This document was generated from a complete audit of the Altech codebase (~29,000 lines across 45+ files). For questions or corrections, reference the specific file and line numbers cited throughout.*
