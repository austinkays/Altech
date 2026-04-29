# Altech EZLYNX Chrome Extension (V1)

This is the **V1** auto-filler. As of April 2026 it is the **fallback** option while the desktop Tauri + Playwright filler (`python_backend/ezlynx_filler.py`) is being wired up. V1 is faster and simpler than V2 (which has been archived) — it works well on client/policy pages and is decent on home pages. The driver/vehicle multi-entity pages are its weak spot.

## Sideload (5 minutes)

1. **Get the packaged zip:** `altech-ezlynx-extension.zip` lives at the repo root. Or use this `chrome-extension/` directory directly.
2. Open Chrome → `chrome://extensions`
3. Toggle **Developer mode** ON (top right)
4. Click **Load unpacked**
5. Select the `chrome-extension/` directory (or unzip `altech-ezlynx-extension.zip` first and select that folder)
6. Pin the extension to the toolbar (puzzle icon → pin)

## Use

1. Sign in to Altech in one tab. Load a client.
2. Open EZLYNX in another tab and navigate to the page you want to fill.
3. Click the Altech extension icon → **Fill this page**.

## What works well

- Applicant / client info pages
- Auto policy info, home policy info
- Coverage pages
- Home dwelling info (most fields)

## Known weak spots

- **Multi-driver / multi-vehicle pages.** The "Add Driver" / "Add Vehicle" button detection is fragile across EZLYNX UI changes. First entity usually fills; subsequent ones may not.
- Page-detection is URL-based (`detectPage()` in `content.js`). If EZLYNX changes a route, the wrong dropdown set may be selected.

If a page mostly fills correctly but a few dropdowns are missed, click **Fill this page** a second time — it's idempotent and often catches stragglers on the second pass.

## Files

- `manifest.json` — MV3 manifest
- `content.js` — main filler (5400 lines, single file by design)
- `defaultSchema.js` — EZLYNX dropdown option lookup table
- `property-scraper.js` — Zillow / Redfin / GIS scraper for the property-intelligence flow
- `altech-bridge.js` — postMessage bridge between extension and `app.altechtoolkit.com`
- `background.js` — MV3 service worker
- `popup.html` / `popup.js` — toolbar popup UI

## Why V2 was archived

V2 (`chrome-extension-v2.archived/`) over-optimized field timing — locator timeout was cut to 400 ms and mat-select close poll to 200 ms — which left Angular Material no time to render. Failures also skipped silently with no user-visible signal. See `chrome-extension-v2.archived/WHY_ARCHIVED.md` once Phase 4 lands.

## Long-term direction

The **desktop Tauri + Playwright filler** (in progress) replaces both V1 and V2. Playwright handles Angular Material's CDK overlay lifecycle correctly, can stream per-field progress to the UI, and surfaces failures prominently. Until then, V1 here is the recommended option.
