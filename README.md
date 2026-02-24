# 🏠 Altech — AI Insurance Agency Toolkit

**Mobile-first insurance agency platform** — personal lines intake, AI document scanning, Firebase auth & cloud sync, CGL compliance tracking, COI generation, prospect research, and multi-format exports to HawkSoft + EZLynx.

**Status:** ✅ **Production** — [altech-app.vercel.app](https://altech-app.vercel.app)  
**Tests:** 966 passing · 15 test suites  
**Code:** ~2,909 lines (index.html) · 12 API endpoints · 30 JS modules  
**Stack:** Vanilla JS SPA · Vercel Serverless · Firebase Auth + Firestore · Redis KV · Multi-provider AI · Stripe · Tauri (desktop)

---

## 🚀 Quick Start

```bash
# Local development
node server.js          # → http://localhost:3000

# Run tests
npm test                # All test suites
npx jest tests/app.test.js --no-coverage  # Core tests only

# Deploy (auto-deploys on push to main)
git push origin main    # → altech-app.vercel.app
```

No build step — the app is composed of `index.html` + modular JS files in `js/`. Edit any module → reload → see changes.

---

## ✨ Platform Overview

Altech started as a personal lines intake form and has grown into a multi-tool agency platform with a plugin architecture. The landing page shows tool cards organized by category.

### 🏠 Personal Lines Intake (Core)
- **7-step wizard:** Quick Start → About You → Quote Type → Property → Vehicles → History → Review & Export
- **3 workflow types:** Home-only · Auto-only · Home & Auto (bundle)
- **AI document scanning:** Policy photos + driver licenses → Gemini Vision → editable review → auto-fill
- **Smart Scan:** ArcGIS county assessor APIs → auto-fill property data (year built, sqft, roof, etc.)
- **Multi-driver/vehicle** with VIN decoding via NHTSA API
- **Auto-save** to `localStorage` on every keystroke

### 📤 Export Engines
| Format | Target | Notes |
|--------|--------|-------|
| **CMSMTF** | HawkSoft CRM | ~40 field mappings, custom L/C/R fields |
| **XML** | EZLynx quoting | ACORD-style, strict validation (name/state/DOB required) |
| **PDF** | Client summary | Multi-page with coverage tables |
| **CSV** | Spreadsheet | All fields, flat format |
| **ZIP** | Bulk export | All formats per quote, batch processing |

### 🔌 Plugin Tools

**Quoting**
| Tool | Description |
|------|-------------|
| **Personal Lines** | Core intake wizard (no plugin — this is the main app) |
| **Policy Q&A** | Chat with AI about uploaded policies |
| **Quote Compare** | Side-by-side carrier quote comparison |

**Export**
| Tool | Description |
|------|-------------|
| **EZLynx Export** | Direct EZLynx XML export |
| **HawkSoft Export** | Dedicated HawkSoft CMSMTF export tool *(new)* |

**Docs**
| Tool | Description |
|------|-------------|
| **COI Generator** | Certificate of Insurance (ACORD 25) |
| **CGL & Bonds** | Track GL/bond expirations via HawkSoft API + Redis cache |
| **Reminders** | Weekly task & reminder tracker *(new)* |

**Ops**
| Tool | Description |
|------|-------------|
| **Prospect Intel** | Research prospects via public records |
| **Email Composer** | Draft client emails with templates |
| **Accounting** | Trust accounting & commission tracking |
| **Quick Reference** | Insurance terms & coverage guides |
| **VIN Decoder** | Standalone VIN lookup with APCO phonetic readback *(new)* |

### 💾 Quote Library
- Save/load/delete draft quotes with search & filter
- Star favorites · CSV batch import · ZIP bulk export
- Quick Start page shows recent drafts for one-tap resume
- Duplicate detection warnings

---

## 🔐 Authentication & Cloud Sync

Authentication and cloud sync are powered by **Firebase Authentication** and **Cloud Firestore**.

### Firebase Authentication
- **Email + password** sign-up/login with email verification
- **User profiles** stored in Firestore (display name, role, subscription status)
- **Admin roles** — grant/revoke admin, block/unblock users from the admin panel
- **Onboarding flow** — first-run welcome wizard with access code verification
- Auth state exposed via `Auth.onAuthStateChange()` for all modules to subscribe

### Cloud Sync (Firestore)
Bidirectional sync between `localStorage` and Firestore. Each authenticated user gets their own document namespace:

```
users/{uid}/
  sync/settings      → { darkMode, deviceId, lastSync }
  sync/currentForm   → { data: {...}, updatedAt, deviceId }
  sync/cglState      → { data: {...}, updatedAt, deviceId }
  sync/clientHistory → { data: [...], updatedAt, deviceId }
  sync/quickRefCards → { data: [...], updatedAt, deviceId }
  quotes/{quoteId}   → { ...quote, updatedAt, deviceId }
```

**Conflict strategy:** "Keep both" — if remote `updatedAt` > local `lastSync`, a conflict copy is created for manual review. Writes are debounced 3 seconds to minimize Firestore calls.

### Admin Panel
A dedicated admin UI (`js/admin-panel.js`) lets admin users search accounts by email, grant/revoke admin roles, and block/unblock users. All admin operations route through `api/admin.js` with server-side role verification.

---

## 🤖 Multi-Provider AI

AI calls are routed through a unified abstraction layer (`js/ai-provider.js`) instead of being hardcoded to a single model.

| Provider | Models | Notes |
|----------|--------|-------|
| **Google Gemini** | `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro` | Default provider |
| **OpenRouter** | 100+ models (GPT-4o, Claude 3.5, Llama 3, etc.) | User-supplied key |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini` | User-supplied key |
| **Anthropic** | `claude-3-5-sonnet`, `claude-3-haiku` | Via `api/anthropic-proxy.js` (CORS workaround) |

Users can configure their preferred provider and model in **Settings**. Configuration is stored in `localStorage` under `altech_ai_settings`.

---

## 📊 Project Metrics

| Metric | Value |
|--------|-------|
| Main App | ~2,909 lines (`index.html`) |
| JS Modules | 30 (in `js/`) |
| API Endpoints | 12 serverless functions |
| Test Suites | 15 |
| Tests Passing | 966 |
| Deploy | Vercel + Firebase + Redis KV |

---

## 📦 Project Structure

```
Altech/
├── index.html                     # SPA shell (~2,909 lines — logic in js/ modules)
├── server.js                      # Local dev server (maps /api/* routes)
├── package.json                   # "type": "module"
├── jest.config.cjs                # Jest + JSDOM test config
├── vercel.json                    # Deploy config + security headers
├── firestore.rules                # Firestore security rules
├── firebase.json                  # Firebase project config
├── api/                           # 12 Vercel serverless functions
│   ├── policy-scan.js             #   Gemini Vision policy extraction
│   ├── vision-processor.js        #   DL scan + satellite analysis
│   ├── compliance.js              #   HawkSoft CGL tracking + Redis cache
│   ├── property-intelligence.js   #   Property data aggregation
│   ├── prospect-lookup.js         #   Public records search
│   ├── rag-interpreter.js         #   RAG field standardization
│   ├── historical-analyzer.js     #   10+ year property history
│   ├── kv-store.js                #   Redis KV store (cgl_cache, etc.)
│   ├── config.js                  #   Firebase config, API keys, phonetics, bug reports
│   ├── admin.js                   #   User management (admin only)
│   ├── anthropic-proxy.js         #   Anthropic API proxy (CORS workaround)
│   └── stripe.js                  #   Stripe subscription management
├── js/                            # 30 modules (refactored from monolithic index.html)
│   │
│   │  ── App Core ──────────────────────────────────────────────
│   ├── app-core.js                #   Global state, step navigation, init
│   ├── app-export.js              #   XML/CMSMTF/PDF/CSV/ZIP export engines
│   ├── app-property.js            #   Property step + GIS smart scan
│   ├── app-popups.js              #   Modal dialogs and overlay utilities
│   ├── app-scan.js                #   AI document scan (DL + policy)
│   ├── app-quotes.js              #   Quote library (save/load/search)
│   ├── app-vehicles.js            #   Vehicles step + VIN decode (in-form)
│   │
│   │  ── Auth & Infrastructure ─────────────────────────────────
│   ├── auth.js                    #   Firebase email+password auth, admin roles
│   ├── cloud-sync.js              #   Bidirectional localStorage ↔ Firestore sync
│   ├── firebase-config.js         #   Firebase SDK initialization
│   ├── ai-provider.js             #   Unified AI (Gemini/OpenRouter/OpenAI/Anthropic)
│   ├── crypto-helper.js           #   AES-256-GCM encryption for localStorage
│   │
│   │  ── UI/UX ─────────────────────────────────────────────────
│   ├── onboarding.js              #   First-run welcome flow + access code verification
│   ├── paywall.js                 #   Stripe subscription paywall (beta)
│   ├── admin-panel.js             #   Admin user management UI
│   ├── bug-report.js              #   In-app bug reporting → GitHub Issues
│   │
│   │  ── Plugin Modules ────────────────────────────────────────
│   ├── compliance-dashboard.js    #   CGL & Bonds UI
│   ├── coi.js                     #   COI Generator (ACORD 25)
│   ├── quote-compare.js           #   Side-by-side carrier quote comparison
│   ├── prospect.js                #   Prospect Intel UI
│   ├── email-composer.js          #   Email Composer UI
│   ├── accounting-export.js       #   Accounting & commission tracking
│   ├── policy-qa.js               #   Policy Q&A chat UI
│   ├── quick-ref.js               #   Quick Reference UI
│   ├── ezlynx-tool.js             #   EZLynx Quoter UI
│   ├── hawksoft-integration.js    #   HawkSoft sync utilities
│   ├── hawksoft-export.js         #   Dedicated HawkSoft CMSMTF export tool
│   ├── reminders.js               #   Weekly task & reminder tracker
│   ├── vin-decoder.js             #   Standalone VIN lookup + phonetic readback
│   └── data-backup.js             #   Backup/restore (export/import all data)
├── css/                           # Per-module stylesheets
├── tests/                         # 15 test suites (966 passing)
│   ├── app.test.js                #   Core form + exports
│   ├── phase1-5.test.js           #   Data extraction phases
│   ├── api-*.test.js              #   API endpoint tests
│   ├── integration.test.js        #   Multi-phase workflows
│   ├── performance.test.js        #   Benchmarks
│   ├── ezlynx-pipeline.test.js    #   Full EZLynx export pipeline
│   └── server.test.js             #   Local server tests
├── chrome-extension/              # EZLynx Chrome extension
├── src-tauri/                     # Tauri desktop wrapper (in progress)
├── python_backend/                # Python utilities (ACORD filling, etc.)
├── docs/                          # 27 guides + 11 technical docs
│   ├── guides/                    #   Setup, deployment, feature guides
│   ├── technical/                 #   Architecture, integrations
│   └── archive/                   #   Historical logs
└── Resources/                     # Sample data, field mappings
```

---

## 🧪 Testing

```bash
npm test                         # All 15 suites (966 tests)
npx jest tests/app.test.js       # Core tests only
npm run test:watch               # TDD mode
npm run test:coverage            # Coverage report
```

**Test suites:** `app` · `phase1` · `phase2` · `phase3` · `phase4` · `phase5` · `integration` · `performance` · `server` · `api-compliance` · `api-property` · `api-prospect` · `api-security` · `plugin-integration` · `ezlynx-pipeline`

**What's tested:**
- Form ↔ localStorage sync (bidirectional)
- All export formats (XML, CMSMTF, PDF)
- XML special character escaping
- Date normalization
- Quote library CRUD
- All 5 data extraction phases
- API security + rate limiting
- Performance benchmarks (P1+P3 <2s)
- Full EZLynx export pipeline
- Cross-plugin integration

---

## 🚀 Deployment

### Vercel (Production)

Auto-deploys on push to `main`. Hosted at [altech-app.vercel.app](https://altech-app.vercel.app).

**Required environment variables** (Vercel Dashboard → Settings → Environment Variables):

**Core**
| Variable | Purpose | Required |
|----------|---------|----------|
| `GOOGLE_API_KEY` | Gemini AI (policy scan, Q&A, phonetics) | Yes |
| `PLACES_API_KEY` | Address autocomplete | Optional |
| `HAWKSOFT_CLIENT_ID` | CGL Compliance dashboard | For CGL |
| `HAWKSOFT_CLIENT_SECRET` | HawkSoft API auth | For CGL |
| `HAWKSOFT_AGENCY_ID` | Agency identifier | For CGL |
| `KV_REST_API_URL` | Vercel Redis KV | For CGL cache |
| `KV_REST_API_TOKEN` | Redis auth | For CGL cache |

**Firebase (Required for Auth & Cloud Sync)**
| Variable | Purpose | Required |
|----------|---------|----------|
| `FIREBASE_API_KEY` | Firebase Web API Key (server-side token verification) | For Auth |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain | For Auth |
| `FIREBASE_PROJECT_ID` | Firestore project ID | For Auth |
| `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | For Auth |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | For Auth |
| `FIREBASE_APP_ID` | Firebase app ID | For Auth |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Base64-encoded service account JSON | For Stripe webhook |

**Stripe (Optional — for subscription billing)**
| Variable | Purpose | Required |
|----------|---------|----------|
| `STRIPE_SECRET_KEY` | Stripe secret key | For billing |
| `STRIPE_PRICE_ID` | Pro plan price ID | For billing |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | For billing |
| `APP_URL` | Base URL for redirect after checkout | For billing |

**Other**
| Variable | Purpose | Required |
|----------|---------|----------|
| `GITHUB_ISSUES_TOKEN` | GitHub PAT (Issues write scope) for in-app bug reports | Optional |

### Local Development

```bash
node server.js   # http://localhost:3000
```

The local server maps API routes to `./api/*.js` files. Create a `.env` file for API keys locally.

---

## 🔐 Security

- Encrypted localStorage (AES-256-GCM via `crypto-helper.js`)
- All API keys in environment variables (never client-side)
- Firebase ID token verification on all authenticated API routes
- Security headers: X-Frame-Options DENY, X-Content-Type-Options, XSS-Protection
- Rate limiting on all API endpoints (100 req/min per IP)
- CORS restricted to allowed origins
- No PII logged to console
- Form validation before all exports
- Firestore security rules enforce per-user data isolation (`firestore.rules`)

---

## 🌍 Browser Support

✅ Chrome/Edge | ✅ Firefox | ✅ Safari | ✅ Mobile (iOS/Android)

---

## 🐛 Troubleshooting

**Policy scan not working?**  
→ Check `GOOGLE_API_KEY` in Vercel settings. Verify quota in Google Cloud Console.

**Smart Scan returns no data?**  
→ County may not have ArcGIS API. Currently supports Clark, King, Pierce (WA), Multnomah (OR).

**EZLynx XML import fails?**  
→ Verify firstName, lastName, state (2 chars), DOB (YYYY-MM-DD) are filled. Check for unescaped `&` (should be `&amp;`).

**CGL Compliance dashboard not loading?**  
→ HawkSoft API needs ~30-60s. The compliance function has `maxDuration: 60s` configured. Results are cached in Redis for 15 minutes.

**Form data lost?**  
→ Data persists in localStorage under key `altech_v6`. Check: DevTools → Application → Local Storage.

**Login/signup not working?**  
→ Verify all six `FIREBASE_*` environment variables are set in Vercel. Confirm Email/Password authentication is enabled in the Firebase Console (Authentication → Sign-in method).

**Cloud sync not saving?**  
→ Confirm Firestore is enabled in your Firebase project and the security rules have been deployed: `firebase deploy --only firestore:rules`.

**Anthropic/Claude not responding?**  
→ The `api/anthropic-proxy.js` endpoint proxies your user-supplied Anthropic API key server-side to work around CORS. Set your key in Settings → AI Provider.

---

## 📚 Documentation

- [docs/guides/ENVIRONMENT_SETUP.md](docs/guides/ENVIRONMENT_SETUP.md) — API key setup
- [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md) — Deployment guide
- [docs/guides/EZLYNX_XML_EXPORT_GUIDE.md](docs/guides/EZLYNX_XML_EXPORT_GUIDE.md) — XML format details
- [docs/guides/HAWKSOFT_EXPORT_GUIDE.md](docs/guides/HAWKSOFT_EXPORT_GUIDE.md) — CMSMTF format details
- [docs/guides/CGL_COMPLIANCE_DASHBOARD_GUIDE.md](docs/guides/CGL_COMPLIANCE_DASHBOARD_GUIDE.md) — CGL tracking
- [docs/technical/WORKFLOW_ARCHITECTURE.md](docs/technical/WORKFLOW_ARCHITECTURE.md) — 7-step form design
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — AI agent development guide
- [CHANGELOG.md](CHANGELOG.md) — Version history

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Edit `index.html` directly — no build step
3. Test: `npm test`
4. Test all 3 workflows if changing step logic (home/auto/both)
5. Commit & push — Vercel auto-deploys

---

## 📄 License

MIT — See [LICENSE](LICENSE).

---

**Built for insurance agents** · *Last updated: February 24, 2026*
