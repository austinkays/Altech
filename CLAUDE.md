# CLAUDE.md — Altech Field Lead

This file provides essential context for Claude Code sessions in this repository.

## Project Overview

**Altech Field Lead** is a mobile-first insurance intake and agency platform — a single-page application (SPA) for independent insurance agents to:
- Scan insurance documents and driver licenses with AI vision extraction
- Collect personal/property/vehicle data via a 7-step wizard
- Generate quotes and export to HawkSoft (CMSMTF), EZLynx (XML), PDF, CSV, and ZIP
- Track compliance requirements (COI, CGL, bonds)
- Research prospects and manage client data

**Production URL:** https://altech-app.vercel.app
**Stack:** Vanilla HTML/CSS/JS + Vercel serverless functions + Firebase Auth/Firestore + Gemini AI

---

## Development Commands

```bash
# Local development (runs on port 3000)
npm run dev          # or: node server.js

# Testing
npm test                          # All 20 test suites (~1,432 tests)
npm run test:watch               # TDD mode
npm run test:coverage            # Generate HTML coverage report
npx jest --no-coverage           # Faster (skip coverage)
npx jest tests/app.test.js       # Core tests only

# Deployment
npm run deploy:vercel            # Deploy to production (Vercel)

# Docs audit (check for drift in line counts, test counts, module descriptions)
npm run audit-docs
```

**No build step required.** Edit any JS/CSS/HTML file → reload browser → see changes.

---

## Architecture

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `js/` | 35 application modules (~28K lines) |
| `css/` | 21 stylesheets (~14K lines) |
| `api/` | 14 Vercel serverless functions |
| `plugins/` | 15 plugin HTML templates |
| `tests/` | 20 Jest test suites |
| `docs/` | Developer and user guides |
| `lib/` | Shared utilities for API endpoints |

### Module Assembly Pattern

All JS modules follow this pattern — no frameworks, no build tooling:

```javascript
// Each module:
window.ModuleName = (() => {
  return { init, render, method1 };
})();

// Core app assembled at boot:
Object.assign(App, AppCore, AppExport, AppScan, AppProperty, AppVehicles, ...);
```

### Critical Load Order (33 modules, strict sequence)

1. `crypto-helper.js` — **MUST be first** (all encryption depends on it)
2. `app-init.js` → `app-quotes.js` — Core app assembly (1–9)
3. `ai-provider.js`, `dashboard-widgets.js` (10–11)
4. Plugin modules (12–25, order independent)
5. `firebase-config.js` (27) → `auth.js` (28) → `cloud-sync.js` (30) — **Must be in this sequence**
6. `app-boot.js` — **MUST be last** (33)

---

## High-Risk Files

Do not modify these without thorough testing:

| File | Risk | Why |
|------|------|-----|
| `js/app-core.js` (2,125 lines) | 🔴 CRITICAL | Form persistence, field ID → storage key mapping, encryption |
| `js/crypto-helper.js` (170 lines) | 🔴 CRITICAL | AES-256-GCM encryption for all user data |
| `js/cloud-sync.js` (~1,400 lines) | 🔴 CRITICAL | 7-document Firestore bidirectional sync, conflict resolution |
| `js/app-export.js` (894 lines) | 🟡 HIGH | Three export engines (PDF, CMSMTF, XML); field escaping rules |
| `js/app-scan.js` (1,569 lines) | 🟡 HIGH | AI vision processing pipeline |
| `css/main.css` (3,416 lines) | 🟡 HIGH | All `:root` CSS variables + dark mode; changing breaks all themes |

---

## Data Patterns

### App State

All form data lives in a flat `App.data` object, persisted to localStorage under key `altech_v6` (AES-256-GCM encrypted).

```javascript
App.data = {
  insuredName: '',
  insuredDOB: '',
  // ... all form fields flat
};

App.data.drivers = [];   // Array of driver objects
App.data.vehicles = [];  // Array of vehicle objects
App.data.quotes = [];    // Via app-quotes.js
```

### LocalStorage Keys

| Key | Contents |
|-----|---------|
| `altech_v6` | All form data (encrypted) |
| `altech_v6_quotes` | Quote library |
| `altech_dark_mode` | `"true"` / `"false"` |
| `altech_cgl_state` | CGL compliance tracking |
| `altech_client_history` | Search history |
| `altech_reminders` | Weekly reminders |

### Cloud Sync (Firestore)

7 document types are synced per-user:
`formData`, `quotes`, `cglState`, `clientHistory`, `reminders`, `quickRefCards`, `callLogs`

Last-write-wins with client-side conflict detection. Auth must load before cloud-sync.

---

## Three Workflows

The app supports three intake workflows — always test all three when touching form logic:

| Workflow | Trigger | Skip Logic |
|----------|---------|-----------|
| **Home only** | `appType = 'home'` | Skips vehicle/driver steps |
| **Auto only** | `appType = 'auto'` | Skips property fields |
| **Both (combo)** | `appType = 'both'` | Full 7-step wizard |

---

## Three Export Engines

Test all three when touching export code:

| Engine | Output | Key File |
|--------|--------|---------|
| **PDF** | Client-ready summary | `js/app-export.js` |
| **CMSMTF** | HawkSoft import format | `js/hawksoft-export.js` |
| **XML** | EZLynx ACORD XML | `js/app-export.js` + `js/ezlynx-tool.js` |

---

## AI Integration

Multi-provider abstraction via `js/ai-provider.js` — default is Gemini:

```javascript
// Default provider: Gemini (GOOGLE_API_KEY)
// Fallbacks: OpenRouter, OpenAI, Anthropic
const response = await AIProvider.complete(prompt, options);
```

API endpoints proxy requests and handle provider routing:
- `api/_ai-router.js` — Request routing + multiplexing
- `api/policy-scan.js` — Gemini Vision for document scanning
- `api/vision-processor.js` — DL scan + satellite imagery analysis

---

## Environment Variables

Copy `.env.example` to `.env` before local development. Key variables:

```
GOOGLE_API_KEY          # Gemini AI + Places + Maps
FIREBASE_API_KEY        # Firebase client SDK
FIREBASE_SERVICE_ACCOUNT_KEY  # Firebase Admin SDK (JSON)
HAWKSOFT_CLIENT_ID      # HawkSoft OAuth
HAWKSOFT_CLIENT_SECRET
KV_REST_API_URL         # Vercel Redis KV
KV_REST_API_TOKEN
STRIPE_SECRET_KEY       # Subscriptions
```

---

## Testing Patterns

```bash
# Run specific test suites
npx jest tests/app.test.js              # Core form + export (1,300+ tests)
npx jest tests/ezlynx-pipeline.test.js # Export pipeline
npx jest tests/integration.test.js     # Multi-phase workflows
npx jest tests/api-compliance.test.js  # API endpoint tests
```

Test environment: **Node.js + JSDOM** (not a real browser).

Mock pattern for localStorage in tests — see `tests/setup.js`.

Key things to test after changes:
1. Form field → localStorage save/load round-trip
2. All 3 workflows (home / auto / both)
3. All 3 export formats (PDF / CMSMTF / XML)
4. Cloud sync (mock Firebase in tests)

---

## Living Documentation

These three files must stay in sync — run `npm run audit-docs` to check for drift:

- `AGENTS.md` — Comprehensive AI agent guide (66 KB, line counts, module descriptions)
- `README.md` — Main user/developer documentation
- `QUICKREF.md` — One-page quick reference cheatsheet

After completing significant work, update any of these files that are now out of date.

---

## Git & Deployment

- **Default branch:** `main` — pushing triggers auto-deploy to Vercel (~2–3 min)
- **Feature branches:** `claude/<description>-<session-id>` format for Claude sessions
- **CI:** No CI pipeline — tests run locally before commit

```bash
# Check before pushing
npm test
npm run audit-docs
```

---

## Common Pitfalls

- **Never change `app-core.js` storage keys** — existing user data will break
- **Never change module load order** in `index.html` without checking dependency graph
- **`main.css` `:root` variables** — used everywhere; changing a variable name breaks all themes
- **API endpoints use Node.js ESM** (`"type": "module"` in package.json) — no `require()`
- **Encryption is always on** for localStorage — never write raw sensitive data
- **Cloud sync conflict resolution** is last-write-wins — be careful with batch updates
