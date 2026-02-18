# 🏠 Altech — AI Insurance Agency Toolkit

**Mobile-first insurance agency platform** — personal lines intake, AI document scanning, CGL compliance tracking, COI generation, prospect research, and multi-format exports to HawkSoft + EZLynx.

**Status:** ✅ **Production** — [altech-app.vercel.app](https://altech-app.vercel.app)  
**Tests:** 205 passing (core) · 14 test suites  
**Code:** ~18,000 lines (index.html) · 13 API endpoints · 12 JS modules  
**Stack:** Vanilla JS SPA · Vercel Serverless · Redis KV · Gemini AI · Tauri (desktop)

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

No build step — edit `index.html` → reload → see changes.

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
| Tool | Description |
|------|-------------|
| **Policy Q&A** | Chat with AI about uploaded policies |
| **Quote Compare** | Side-by-side carrier quote comparison |
| **COI Generator** | Certificate of Insurance (ACORD 25) |
| **CGL Compliance** | Track GL/bond expirations via HawkSoft API + Redis cache |
| **Prospect Investigator** | Research prospects via public records |
| **Email Composer** | Draft client emails with templates |
| **Accounting Export** | Trust accounting & commission tracking |
| **Quick Reference** | Insurance terms & coverage guides |
| **EZLynx Quoter** | Direct EZLynx integration (hidden) |

### 💾 Quote Library
- Save/load/delete draft quotes with search & filter
- Star favorites · CSV batch import · ZIP bulk export
- Quick Start page shows recent drafts for one-tap resume
- Duplicate detection warnings

---

## 📊 Project Metrics

| Metric | Value |
|--------|-------|
| Main App | ~18,000 lines (`index.html`) |
| JS Modules | 12 (in `js/`) |
| API Endpoints | 13 serverless functions |
| Test Suites | 14 |
| Core Tests | 205 passing (`app.test.js`) |
| Git Commits | 277 |
| Deploy | Vercel (Hobby) + Redis KV |

---

## 📦 Project Structure

```
Altech/
├── index.html                 # Single-page app (~18,000 lines)
├── server.js                  # Local dev server (maps /api/* routes)
├── package.json               # "type": "module"
├── jest.config.cjs            # Jest + JSDOM test config
├── vercel.json                # Deploy config + security headers
├── api/                       # 13 Vercel serverless functions
│   ├── policy-scan.js         #   Gemini Vision policy extraction
│   ├── vision-processor.js    #   DL scan + satellite analysis
│   ├── compliance.js          #   HawkSoft CGL tracking + Redis cache
│   ├── generate-coi.js        #   ACORD 25 COI generation
│   ├── property-intelligence.js  # Property data aggregation
│   ├── prospect-lookup.js     #   Public records search
│   ├── document-intel.js      #   Azure Document Intelligence
│   ├── rag-interpreter.js     #   RAG field standardization
│   ├── historical-analyzer.js #   10+ year property history
│   ├── places-config.js       #   Google Places + Gemini config
│   ├── name-phonetics.js      #   Fuzzy name matching
│   ├── kv-store.js            #   Redis KV store (cgl_cache, etc.)
│   └── _security.js           #   Rate limiting, CORS, headers
├── js/                        # 12 plugin modules
│   ├── compliance-dashboard.js #  CGL Compliance UI
│   ├── coi.js                 #   COI Generator UI
│   ├── quote-compare.js       #   Quote Compare UI
│   ├── prospect.js            #   Prospect Investigator UI
│   ├── email-composer.js      #   Email Composer UI
│   ├── accounting-export.js   #   Accounting Export UI
│   ├── policy-qa.js           #   Policy Q&A UI
│   ├── quick-ref.js           #   Quick Reference UI
│   ├── ezlynx-tool.js        #   EZLynx Quoter UI
│   ├── hawksoft-integration.js #  HawkSoft sync
│   ├── data-backup.js         #   Backup/restore
│   └── crypto-helper.js       #   AES-256-GCM encryption
├── tests/                     # 14 test suites
│   ├── app.test.js            #   Core form + exports (205 tests)
│   ├── phase1-5.test.js       #   Data extraction phases
│   ├── api-*.test.js          #   API endpoint tests
│   ├── integration.test.js    #   Multi-phase workflows
│   ├── performance.test.js    #   Benchmarks
│   └── server.test.js         #   Local server tests
├── src-tauri/                 # Tauri desktop wrapper (in progress)
├── python_backend/            # Python utilities (ACORD filling, etc.)
├── docs/                      # 27 guides + 11 technical docs
│   ├── guides/                #   Setup, deployment, feature guides
│   ├── technical/             #   Architecture, integrations
│   └── archive/               #   Historical logs
└── Resources/                 # Sample data, field mappings
```

---

## 🧪 Testing

```bash
npm test                         # All 14 suites
npx jest tests/app.test.js       # Core tests (205)
npm run test:watch               # TDD mode
npm run test:coverage            # Coverage report
```

**Test suites:** `app` · `phase1` · `phase2` · `phase3` · `phase4` · `phase5` · `integration` · `performance` · `server` · `api-compliance` · `api-property` · `api-prospect` · `api-security` · `plugin-integration`

**What's tested:**
- Form ↔ localStorage sync (bidirectional)
- All export formats (XML, CMSMTF, PDF)
- XML special character escaping
- Date normalization
- Quote library CRUD
- All 5 data extraction phases
- API security + rate limiting
- Performance benchmarks (P1+P3 <2s)

---

## 🚀 Deployment

### Vercel (Production)

Auto-deploys on push to `main`. Hosted at [altech-app.vercel.app](https://altech-app.vercel.app).

**Required environment variables** (Vercel Dashboard → Settings → Environment Variables):

| Variable | Purpose | Required |
|----------|---------|----------|
| `GOOGLE_API_KEY` | Gemini AI (policy scan, Q&A) | Yes |
| `GOOGLE_PLACES_API_KEY` | Address autocomplete | Optional |
| `HAWKSOFT_CLIENT_ID` | CGL Compliance dashboard | For CGL |
| `HAWKSOFT_CLIENT_SECRET` | HawkSoft API auth | For CGL |
| `HAWKSOFT_AGENCY_ID` | Agency identifier | For CGL |
| `KV_REST_API_URL` | Vercel Redis KV | For CGL cache |
| `KV_REST_API_TOKEN` | Redis auth | For CGL cache |

### Local Development

```bash
node server.js   # http://localhost:3000
```

The local server maps API routes to `./api/*.js` files. Create a `.env` file for API keys locally.

---

## 🔐 Security

- Encrypted localStorage (AES-256-GCM via `crypto-helper.js`)
- All API keys in environment variables (never client-side)
- Security headers: X-Frame-Options DENY, X-Content-Type-Options, XSS-Protection
- Rate limiting on all API endpoints (100 req/min per IP)
- CORS restricted to allowed origins
- No PII logged to console
- Form validation before all exports

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

**Built for insurance agents** · *Last updated: February 17, 2026*
