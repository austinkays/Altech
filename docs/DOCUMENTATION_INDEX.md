# Altech Documentation Index

**Last Updated:** February 13, 2026

---

## Quick Start

| Path | For | Description |
|------|-----|-------------|
| [README.md](../README.md) | Everyone | Project overview & quick start |
| [.github/copilot-instructions.md](../.github/copilot-instructions.md) | AI Agents | Coding patterns & architecture |
| [CHANGELOG.md](../CHANGELOG.md) | Everyone | Version history |

---

## Guides (`docs/guides/`)

### Setup & Deployment
| File | Topic |
|------|-------|
| [QUICKSTART.md](guides/QUICKSTART.md) | Local dev setup |
| [ENVIRONMENT_SETUP.md](guides/ENVIRONMENT_SETUP.md) | API keys & env vars |
| [DEPLOYMENT.md](guides/DEPLOYMENT.md) | Deploy to Vercel |
| [PRODUCTION_DEPLOYMENT.md](guides/PRODUCTION_DEPLOYMENT.md) | Pre-deploy checklist |
| [LAUNCH_CHECKLIST.md](guides/LAUNCH_CHECKLIST.md) | Launch readiness |
| [VERCEL_SENDGRID_SETUP.md](guides/VERCEL_SENDGRID_SETUP.md) | Email API setup |
| [PLACES_API_SETUP.md](guides/PLACES_API_SETUP.md) | Google Places config |

### Features
| File | Topic |
|------|-------|
| [HAZARD_DETECTION_QUICK_START.md](guides/HAZARD_DETECTION_QUICK_START.md) | Satellite hazard scanning |
| [HAZARD_DETECTION_GUIDE.md](guides/HAZARD_DETECTION_GUIDE.md) | Full hazard detection docs |
| [HAZARD_DETECTION_VISUAL_GUIDE.md](guides/HAZARD_DETECTION_VISUAL_GUIDE.md) | Step-by-step with diagrams |
| [CGL_COMPLIANCE_DASHBOARD_GUIDE.md](guides/CGL_COMPLIANCE_DASHBOARD_GUIDE.md) | CGL compliance dashboard |
| [CGL_COMPLIANCE_QUICK_REFERENCE.md](guides/CGL_COMPLIANCE_QUICK_REFERENCE.md) | CGL quick reference |
| [GIS_AUTO_FILL_GUIDE.md](guides/GIS_AUTO_FILL_GUIDE.md) | GIS auto-fill |
| [GIS_TESTING_GUIDE.md](guides/GIS_TESTING_GUIDE.md) | GIS testing |
| [ADD_COUNTIES_GUIDE.md](guides/ADD_COUNTIES_GUIDE.md) | Adding new county APIs |
| [SOCRATA_SETUP.md](guides/SOCRATA_SETUP.md) | Socrata data setup |
| [QAS_QUICK_START.md](guides/QAS_QUICK_START.md) | Q&A system quick start |

### Exports
| File | Topic |
|------|-------|
| [HAWKSOFT_QUICK_START.md](guides/HAWKSOFT_QUICK_START.md) | HawkSoft CMSMTF export |
| [HAWKSOFT_SAFE_INTEGRATION_GUIDE.md](guides/HAWKSOFT_SAFE_INTEGRATION_GUIDE.md) | Safe HawkSoft integration |
| [HAWKSOFT_EXPORT_GUIDE.md](guides/HAWKSOFT_EXPORT_GUIDE.md) | Full HawkSoft guide |
| [EZLYNX_XML_EXPORT_GUIDE.md](guides/EZLYNX_XML_EXPORT_GUIDE.md) | EZLynx XML export |
| [EMAIL_EXPORT_QUICK_START.md](guides/EMAIL_EXPORT_QUICK_START.md) | Email export |

### Other
| File | Topic |
|------|-------|
| [CONTRIBUTING.md](guides/CONTRIBUTING.md) | Contribution guidelines |
| [QUICK_REFERENCE.md](guides/QUICK_REFERENCE.md) | API & method reference |
| [TAURI_QNA_BRIDGE.md](guides/TAURI_QNA_BRIDGE.md) | Tauri desktop bridge |
| [UPDATE_TOKEN.md](guides/UPDATE_TOKEN.md) | Token update process |

---

## Technical Docs (`docs/technical/`)

| File | Topic |
|------|-------|
| [MASTER_REFERENCE.md](technical/MASTER_REFERENCE.md) | Complete technical reference |
| [WORKFLOW_ARCHITECTURE.md](technical/WORKFLOW_ARCHITECTURE.md) | Workflow system design |
| [SECURITY_AND_DATA_SUMMARY.md](technical/SECURITY_AND_DATA_SUMMARY.md) | Encryption & data handling |
| [CGL_COMPLIANCE_INTEGRATION.md](technical/CGL_COMPLIANCE_INTEGRATION.md) | CGL compliance architecture |
| [HAWKSOFT_INTEGRATION_STATUS.md](technical/HAWKSOFT_INTEGRATION_STATUS.md) | HawkSoft integration status |
| [HAWKSOFT_API_ANALYSIS.md](technical/HAWKSOFT_API_ANALYSIS.md) | HawkSoft API research |
| [EZLYNX_INTEGRATION_OPTIONS.md](technical/EZLYNX_INTEGRATION_OPTIONS.md) | EZLynx integration options |
| [EZLYNX_RESEARCH.md](technical/EZLYNX_RESEARCH.md) | EZLynx API research |
| [PROSPECT_INVESTIGATOR_SUMMARY.md](technical/PROSPECT_INVESTIGATOR_SUMMARY.md) | Prospect lookup system |
| [BOT_BLOCKER_SOLUTIONS.md](technical/BOT_BLOCKER_SOLUTIONS.md) | Bot blocking strategies |
| [QAS_COMPLETE_GUIDE.md](technical/QAS_COMPLETE_GUIDE.md) | Q&A system architecture |

---

## Implementation Docs (`docs/`)

| File | Topic |
|------|-------|
| [PHASE_1_IMPLEMENTATION.md](PHASE_1_IMPLEMENTATION.md) | ArcGIS county APIs |
| [PHASE_2_IMPLEMENTATION.md](PHASE_2_IMPLEMENTATION.md) | Headless browser fallback |
| [PHASE_3_IMPLEMENTATION.md](PHASE_3_IMPLEMENTATION.md) | RAG standardization |
| [PHASE_4_IMPLEMENTATION.md](PHASE_4_IMPLEMENTATION.md) | Vision processing |
| [PHASE_5_IMPLEMENTATION.md](PHASE_5_IMPLEMENTATION.md) | Historical analysis |
| [PHASE_5_5_SUMMARY.md](PHASE_5_5_SUMMARY.md) | Phase 5.5 summary |
| [GIS_ENHANCEMENT_ROADMAP.md](GIS_ENHANCEMENT_ROADMAP.md) | GIS roadmap |
| [FORM_STRUCTURE_UPDATE.md](FORM_STRUCTURE_UPDATE.md) | Form structure changes |
| [HEIC_FIX_IMPLEMENTATION.md](HEIC_FIX_IMPLEMENTATION.md) | HEIC image fix |
| [ERROR_CODES.md](ERROR_CODES.md) | Error code reference |
| [ROADMAP.md](ROADMAP.md) | Product roadmap |
| [STRATEGIC_ROADMAP.md](STRATEGIC_ROADMAP.md) | Strategic roadmap |

---

## Testing

```bash
npm test               # Run all 646 tests (13 suites)
npm run test:watch     # TDD mode
npm run test:coverage  # Coverage report
```

| File | Coverage |
|------|----------|
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | Complete testing reference |
| [TESTING_QUICK_REFERENCE.md](TESTING_QUICK_REFERENCE.md) | Quick command reference |
| [TESTING_INDEX.md](TESTING_INDEX.md) | Test suite organization |
| [PHASE_5_5_TESTING_ROADMAP.md](PHASE_5_5_TESTING_ROADMAP.md) | Testing roadmap |

---

## Plugin Files (`js/`)

| File | Plugin |
|------|--------|
| `crypto-helper.js` | AES-256-GCM encryption + safeSave |
| `coi.js` | Certificate of Insurance generator |
| `prospect.js` | Prospect Investigator lookup |
| `compliance-dashboard.js` | CGL Compliance Dashboard |
| `policy-qa.js` | Policy Q&A system |
| `email-composer.js` | Email Composer |
| `quick-ref.js` | Quick Reference + NATO phonetic |
| `accounting-export.js` | Accounting Export |
| `ezlynx-tool.js` | EZLynx Quoter |
| `quote-compare.js` | Quote Compare + AI recommendations |
| `data-backup.js` | Data Backup + keyboard shortcuts |
| `hawksoft-integration.js` | HawkSoft CRM integration |

---

## Archive (`docs/archive/`)

Session logs, old implementation docs, and historical references. See [docs/archive/](archive/) for full listing.

---

## File Structure

```
Altech/
├── index.html                 ← Main app (HTML + CSS + core JS)
├── server.js                  ← Dev server (port 8000)
├── package.json               ← Dependencies & scripts
├── jest.config.cjs            ← Test config
├── vercel.json                ← Vercel deployment config
├── README.md                  ← Project overview
├── CHANGELOG.md               ← Version history
├── LICENSE                    ← MIT license
│
├── js/                        ← Extracted plugin modules (12 files)
├── api/                       ← Serverless API functions
├── tests/                     ← Jest test suites (13 suites, 646 tests)
├── scripts/                   ← Build/utility scripts
├── python_backend/            ← Python export engines
├── Resources/                 ← Sample files & references
├── src-tauri/                 ← Tauri desktop wrapper
│
└── docs/                      ← All documentation
    ├── DOCUMENTATION_INDEX.md ← You are here
    ├── guides/                ← How-to guides (27 files)
    ├── technical/             ← Architecture docs (11 files)
    └── archive/               ← Historical docs & session logs
```
