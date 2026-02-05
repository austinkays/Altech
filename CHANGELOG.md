# Changelog

All notable changes to Altech will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Nothing yet

---

## [1.2.0] - 2026-02-05

### Added
- **Approval Workflows for AI Scans**
  - Driver license scan now shows editable review screen before applying data
  - Policy scan shows editable review screen with approve/cancel options
  - Users can verify and edit AI-extracted data before auto-filling form
  
- **Gender Extraction for Insurance Rating**
  - Driver license scan now extracts gender field ("M" or "F")
  - Added gender dropdown to "About You" form (Step 1)
  - Gender stored for insurance rating calculations

- **Enhanced Policy Scanning**
  - Improved multi-carrier support (State Farm, Allstate, Progressive, GEICO, Farmers, etc.)
  - Better handling of varied policy document formats
  - Distinguishes between agent info and insured info
  - Supports multi-page policy documents

### Fixed
- **413 Payload Too Large Errors**
  - Driver license images now resize to 800px @ 0.65 quality
  - Policy/document images resize to 1200px @ 0.85 quality
  - Added pre-upload size validation (4MB limit)
  - Aggressive compression prevents Vercel serverless limit errors

- **404 Model Not Found Errors**
  - Updated from `gemini-1.5-flash` to `gemini-2.5-flash`
  - Switched to v1beta API endpoint
  - All vision APIs now use latest stable model

- **403 Unregistered Caller Errors**
  - Fixed environment variable naming across all API files
  - Changed `GOOGLE_API_KEY` → `NEXT_PUBLIC_GOOGLE_API_KEY`
  - Updated 7 API endpoints for consistency

- **307 MAX_TOKENS Errors**
  - Increased `maxOutputTokens` from 500-1500 → **2048**
  - Applied across 11 instances in 5 API files
  - Prevents response truncation before complete JSON

- **Policy Scan Schema Error**
  - Removed `additionalProperties` from JSON schema (unsupported by Gemini)
  - Fixed "Invalid JSON payload" error

### Changed
- **API Architecture**
  - All Gemini API calls now use: gemini-2.5-flash, v1beta, maxOutputTokens: 2048
  - Standardized environment variable naming convention
  - Improved error handling and user feedback

---

## [1.1.0] - 2026-02-04

### Added
- **Testing Infrastructure (Phase 5.5)**
  - 8 comprehensive test suites (268 tests total)
  - Phase 1-5 tests for all data extraction layers
  - Integration tests for multi-phase workflows
  - Performance benchmarks (P1+3 <2s, full pipeline <10s)
  - 60+ verified test addresses across 8 counties

- **Hazard Detection Feature**
  - Satellite imagery analysis via Gemini Vision
  - Auto-detect pools, trampolines, deck/patio
  - Extract roof type, stories, garage spaces
  - Visual confirmation popup with satellite image

- **County Detection for GIS Links**
  - Auto-detects county from city name
  - Shows toast notification with county info
  - Links to county-specific assessor sites
  - 50+ city-to-county mappings (WA, OR, AZ)

- **Batch CSV Import/Export**
  - Import multiple quotes from CSV
  - Validation and duplicate detection
  - Export all quotes to ZIP (XML+CMSMTF+CSV+PDF per quote)

- **Driver Occupations**
  - Capture occupations for primary and secondary drivers
  - Export to PDF, CSV, and CMSMTF notes field

- **Scan Coverage Indicator**
  - Live display of fields populated from scans (N/total + percentage)
  - Helps users understand form completion progress

### Fixed
- Encryption verification (AES-256-GCM active)
- localStorage sync issues
- Multiple export format bugs
- EZLynx XML special character escaping

---

## [1.0.0] - 2026-01-15

### Added
- Initial release
- **5-Phase Data Extraction Pipeline**
  - Phase 1: ArcGIS county APIs
  - Phase 2: Headless browser scraping
  - Phase 3: RAG standardization
  - Phase 4: Vision processing (policies, licenses)
  - Phase 5: Historical property analysis

- **Core Features**
  - 7-step insurance intake form
  - 3 workflow types (Home, Auto, Both)
  - Multi-driver support
  - Multi-vehicle support with VIN decoding
  - Auto-save to encrypted localStorage

- **Export Formats**
  - EZLynx XML
  - HawkSoft CMSMTF
  - PDF (multi-page)
  - CSV

- **Quote Library**
  - Save/load/delete drafts
  - Search and filter
  - Star favorites
  - Bulk export

- **Security**
  - AES-256-GCM encryption
  - Environment variables for API keys
  - XSS protection headers
  - Form validation

---

## Version History

- **v1.2.0** (Feb 5, 2026) - Approval workflows + gender extraction + enhanced scanning
- **v1.1.0** (Feb 4, 2026) - Testing infrastructure + hazard detection + batch processing
- **v1.0.0** (Jan 15, 2026) - Initial production release

---

## Migration Notes

### Upgrading from v1.1.0 to v1.2.0
- No breaking changes
- Existing localStorage data compatible
- Environment variable update required:
  ```bash
  # Vercel dashboard → Project Settings → Environment Variables
  # Rename: GOOGLE_API_KEY → NEXT_PUBLIC_GOOGLE_API_KEY
  ```

### Upgrading from v1.0.0 to v1.1.0
- No breaking changes
- localStorage encryption automatically applied
- Test suite now available (`npm test`)
