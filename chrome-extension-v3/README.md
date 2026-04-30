# Altech EZLynx Filler v3

In-page Chrome extension that auto-fills EZLynx forms. Built from V1's proven JS-injection strategy + every priority element ID we captured across 7 Cowork rounds with the Python+Playwright filler.

**Why v3 exists:** the Python filler in `python_backend/ezlynx_filler.py` has been fighting Playwright + Angular Material's quirks for weeks (chevron-click hit tests, mdc-notched-outline z-order, CDK overlay zone state). v3 sidesteps all of it by running INSIDE EZLynx's page, in Angular's own JS context — synthetic clicks bubble through Material's listeners properly, no force=True needed.

## Sideload (5 minutes)

1. Open Chrome → `chrome://extensions/`
2. Toggle **Developer mode** ON (top right)
3. Click **Load unpacked**
4. Select this folder: `chrome-extension-v3/`
5. Pin to toolbar (puzzle icon → pin)

## Use

1. Open Altech in one tab. Fill out a client (or load a saved one).
2. Click **Send to Extension** in Altech (V1's existing button — works for both V1 and v3).
3. Open EZLynx in another tab. Navigate to whichever subpage you want to fill.
4. Click **Fill this page** on the floating dark toolbar at the top.

## What's in the toolbar

- **Fill this page** — runs the fill on the current EZLynx subpage
- **📋 Log** — toggle the log panel showing per-field success/failure
- **×** — remove the toolbar (refresh the EZLynx page to bring it back)

## Subpages auto-detected

- `applicant` — `/account/create/personal` or `/details`
- `auto-policy-info` — any `/rating/auto/...` not matching the more specific patterns below
- `auto-drivers` — `/rating/auto/.../drivers...`
- `auto-vehicles` — `/rating/auto/.../vehicles...`
- `auto-coverage` — `/rating/auto/.../coverage...`
- `home-policy-info`, `home-dwelling-info`, `home-coverage`

Each subpage has its own field allowlist + ~58 priority element IDs total. Fields not in the allowlist for the current subpage are skipped — no more "trying FirstName on the Auto Policy Info page" noise.

## Multi-driver / multi-vehicle

Phase 1 — single driver / single vehicle (driver-0, vehicle-0) only. Phase 2 will add iteration over `Drivers[1:]` and `Vehicles[]` with "Add Driver"/"Add Vehicle" button clicks. The Cowork rounds captured `driver-1-*` IDs already, ready when we tackle.

## Files

- `manifest.json` — MV3 manifest
- `content.js` — main filler (toolbar + dropdown/text fill logic)
- `field-maps.js` — all the priority IDs and label patterns from the Python filler
- `altech-bridge.js` — copy of V1's bridge (runs on `altech-app.vercel.app`, receives client data from the web app via postMessage, stores in `chrome.storage.local`)

## Why this is different from V1

V1 worked but had two weak spots:
1. **Driver/vehicle multi-entity logic was fragile.** Phase 2 of v3 will fix this with `driver-N-*` ID iteration based on captured inventories.
2. **Field map drifted from EZLynx's reality over time.** v3 ships with the freshest IDs from real fill runs (Cowork rounds 1–7).

## Why this is different from the Python filler

| Concern | Python (Playwright) | v3 (in-page) |
|---|---|---|
| Click strategy | 5-step ladder (arrow/trigger/bbox/force/JS) | Single `el.click()` |
| Hit-test problems | Yes — `mdc-notched-outline` z-order | No — runs inside Angular's zone |
| Visual page-shift thrash | Yes (PRs #53–#57 chased it) | No |
| Setup | Python + Playwright + Chromium download | Just sideload |
| Persistent login | Manages its own profile | Uses your normal Chrome session |
| Lines of code | 2266 | ~600 |

## Troubleshooting

- **"No client data" status:** open Altech in another tab, click the "Send to Extension" button, retry.
- **Toolbar disappeared after navigating:** v3 re-injects on SPA navigation within ~1.5s, but a hard refresh always brings it back.
- **Fields fail to fill:** open the Log panel, check which subpage was detected and which fields were attempted. Failures include the reason (`element-not-found`, `no-options-in-overlay`, `no-match`).
