# Code Maintenance Guide

A recurring-audit playbook for the solo maintainer. This complements the existing agent docs:

- **`CLAUDE.md`** — cold-start guide for AI agents (architecture, load order, do/don't rules)
- **`AGENTS.md`** — 58 KB architecture deep dive (living document)
- **`QUICKREF.md`** — one-page cheat sheet
- **`CHANGELOG.md`** — mandatory session-by-session change log

Those docs tell you *how* the code works. **This guide tells you *when* to inspect *what***, and which existing tooling to use for each audit.

---

## Cadence at a glance

| When | Checks |
|------|--------|
| **Every session** | `npm run audit-docs`, CHANGELOG entry |
| **Weekly** | Tip 1 — modularization review |
| **Weekly** | Tip 2 — file formatting audit |
| **Monthly** | Tip 4 — full regression + manual QA |
| **Quarterly** | Tip 6 — whitehat security audit |

Skip any row and the next one gets harder. Weekly audits catch drift before it compounds; monthly catches anything that slipped through JSDOM; quarterly catches threat-model changes.

---

## Tip 1 — Modularization review (weekly)

**Goal:** catch responsibility bleed before it causes "I changed X and Y broke" bugs.

The `App.*` object is assembled via `Object.assign` across 11 files (`js/app-init.js` through `js/app-boot.js`). Each file owns a documented slice. When a slice silently grows past its remit, touching one slice breaks another.

### What to audit

1. **`App.*` slice size and ownership** — `js/app-*.js`.
   - Check line counts: `wc -l js/app-*.js`.
   - Reference `CLAUDE.md` → "App Assembly — Object.assign Pattern" table for each file's documented responsibilities.
   - Anything > ~2000 lines or holding responsibilities outside its documented slice is a candidate for extraction. At the time this guide was written: `app-property.js` (~2600), `app-scan.js` (~2350), `app-core.js` (~2200), `app-export.js` (~1620) are the largest slices.
2. **Plugin encapsulation** — `plugins/*.html` + their matching `js/*.js`.
   - Every plugin must use the IIFE pattern described in `CLAUDE.md` → "Plugin IIFE Pattern".
   - Flag any plugin that reaches into `App.*` internals when a public method exists, or that re-implements a `Utils.*` helper inline.
3. **CSS split-file discipline** — `css/variables.css`, `base.css`, `layout.css`, `components.css`, `animations.css`.
   - `@keyframes` may only live in `animations.css`. Search: `Grep "@keyframes" css/ --glob "!animations.css"`.
   - `css/main.css` is a dead `@import` aggregator and must never be edited.
   - `body.dark-mode` overrides live in `variables.css`, nowhere else.
4. **Utility duplication** — any inline definitions of `escapeHTML`, `escapeAttr`, `tryParseLS`, `debounce` outside `js/utils.js`. All callers must delegate to `window.Utils.*`.
5. **Storage-key hardcoding** — any `'altech_` string literal outside `js/storage-keys.js`. All storage reads/writes must go through the frozen `STORAGE_KEYS` global.

### Paste-ready prompt

> Review `js/app-*.js`, `plugins/`, and `css/` against the ownership tables in `CLAUDE.md`. For each finding, name the file, the bleed, and the documented slice it belongs to. Also list any inline `escapeHTML`/`escapeAttr`/`tryParseLS`/`debounce` outside `js/utils.js`, and any `'altech_` string literal outside `js/storage-keys.js`. Plan mode only — do not edit.

---

## Tip 2 — File formatting audit (weekly)

**Goal:** catch minified-by-accident files, load-order drift, and CRLF/LF mismatches before they produce silent "my change didn't apply" failures.

### What to audit

1. **Runtime-stringified HTML.** Long single-line HTML blobs break diff tooling and cause AI edits to silently no-op. The usual suspects:
   - `js/app-export.js` — `exportPDF()`, `exportCMSMTF()` build HTML strings.
   - `js/app-popups.js` — modal templates.
   - `plugins/*.html` — template injection targets.
   - Flag any source line > 500 characters. Quick check: `awk 'length > 500 { print FILENAME":"NR" ("length" chars)" }' js/*.js plugins/*.html`.
2. **Script load order drift.** `index.html` must match the 43-step order documented in `CLAUDE.md` → "Script Load Order". The rule that breaks things first when violated: **`app-boot.js` must be the last `<script>` tag.** Also verify: `storage-keys.js`, `utils.js`, and `fields.js` load *before* `app-init.js`; `firebase-config.js` loads before `auth.js`; `auth.js` loads before `cloud-sync.js`.
3. **CRLF/LF mismatches in HTML.** `CLAUDE.md` → "Editing HTML Files" warns regex replacements silently fail on line-ending mismatches. Spot-check `plugins/*.html` with `file plugins/*.html` or check `.gitattributes`. If you find mixed endings, normalize before the next session.
4. **`[data-tooltip]` bleed regressions.** `CLAUDE.md` → "`[data-tooltip]` Bleed — Full Property Matrix" lists the 6 properties that leak onto any element carrying a `data-tooltip` attribute. Any new element given `data-tooltip` must reset all 6 — especially the `::before opacity` trap that makes custom `::before` pseudo-elements invisible until hover. Grep for new additions: `Grep 'data-tooltip' plugins/ js/ --glob "!node_modules"`.
5. **`/* no var */` comment audit.** These markers track hardcoded colors still needing a design token. **Do not remove them.** Current locations:
   - `css/compliance.css` — 3× `#FF9500` warning/saving states
   - `css/components.css` — 1× low-opacity rgba background

    Verify with `Grep "/\* no var \*/" css/`. Count must stay ≥ 4.

### Paste-ready prompt

> Scan the repo for formatting problems: (a) any source line over 500 characters in `js/`, `plugins/`, or `css/`, (b) any drift from the 43-step script order in `CLAUDE.md` — especially `app-boot.js` not being last, (c) any new `data-tooltip` element that doesn't reset the 6 bleed properties from `CLAUDE.md`, (d) any `/* no var */` comment that has been removed from `css/compliance.css` or `css/components.css`. Plan mode only — report findings, don't fix.

---

## Tip 4 — Extensive testing (monthly)

**Goal:** catch regressions that JSDOM and type checks cannot see. The Jest suite is strong but there are known gaps — monthly manual QA fills them.

### Automated regression

```bash
npm test                          # full suite (see `npm run audit-docs` for live counts)
npx jest --no-coverage            # faster local loop
npx jest tests/app.test.js        # single suite
npm run audit-docs                # doc drift guard — must be green before commit
```

If `audit-docs` flags a "Last updated" date > 7 days stale on `AGENTS.md` or `.github/copilot-instructions.md`, refresh the date line — the audit will fail the build otherwise.

### Workflow matrix

The three workflows from `CLAUDE.md` → "Three Workflows" must all be exercised after any step-logic change:

| Workflow | Steps | Skips |
|----------|-------|-------|
| `home` | 0 → 1 → 2 → 3 → 5 → 6 | Step 4 (vehicles) |
| `auto` | 0 → 1 → 2 → 3 → 4 → 5 → 6 | — |
| `both` | 0 → 1 → 2 → 3 → 4 → 5 → 6 | — |

A green `npm test` with a broken `home` workflow is a real failure mode — hash routing and step-skip logic are not fully covered by Jest.

### JSDOM gap list

Jest cannot exercise these APIs; they need manual browser QA:

- `crypto.subtle` — AES-GCM encrypt/decrypt round-trips (`js/crypto-helper.js`)
- `ImageBitmap` — OCR preprocessing
- `showOpenFilePicker` — file upload flows
- `IntersectionObserver` — lazy-loaded plugin containers

### Manual QA checklist

Run `npm run dev` on :3000 and walk through:

- [ ] Dark mode toggle persists across reload (default = dark when no preference)
- [ ] All three workflows (`home`, `auto`, `both`) navigate cleanly with no hash-router glitches
- [ ] `App.save()` → reload → `App.load()` round-trip preserves encrypted form data
- [ ] Property intelligence pipeline (`api/property-intelligence.js`): `?mode=zillow`, `?mode=arcgis`, `?mode=listing-search`, `?mode=coverage-gap` each return in under 10s
- [ ] PDF export and CMS MTF export open in external viewers without errors
- [ ] Cloud sync push + pull across all 10 `SYNC_DOCS` types (`js/cloud-sync.js` ~line 27) — edit something, wait 3s for debounced push, reload, verify it came back
- [ ] Bug-report modal and data-backup modal open and function
- [ ] Keyboard shortcuts from `app-boot.js` still fire

### Bug tracker pattern

Keep a running plain-text notes file (not in the repo) for issues you spot between sessions. When tokens are available, paste the whole file into Claude Code in plan mode and ask for a batched fix plan. This mirrors the Reddit-tip advice: *"When you don't [have tokens], you cover every other role."*

### Paste-ready prompt

> Run `npm test` and `npm run audit-docs`. Report any failures or drift. Then walk through the three workflows (`home`, `auto`, `both`) against `CLAUDE.md` → "Three Workflows" and list any step that references a field, plugin, or condition that no longer exists in `js/fields.js` or `plugins/`. Plan mode only.

---

## Tip 6 — Whitehat security audit (quarterly)

**Goal:** catch secret leaks, auth boundary holes, XSS regressions, and API abuse windows before they reach production.

### Primary references — read before auditing

- `docs/technical/SECURITY_AND_DATA_SUMMARY.md` — Firestore auth model, encryption envelope, compliance posture
- `tests/api-security.test.js` — existing API security test coverage
- `CLAUDE.md` → "Storage Keys" — `STORAGE_KEYS.ENCRYPTION_SALT` must **never** sync to cloud
- `CLAUDE.md` → "Cloud Sync Pattern" — Firestore paths are `users/{uid}/sync/{docType}` and `users/{uid}/quotes/{id}`

Crypto surface to re-read each quarter: `js/crypto-helper.js` (AES-256-GCM in `CryptoHelper`) and `lib/security.js`.

### Four-round audit (plan mode each)

1. **Secrets & keys.**
   - Grep `api/`, `js/`, and `.github/workflows/` for hardcoded API keys, Firebase service account fragments, or raw salt values.
   - Verify `.env`, `.env.local`, and any service-account `.json` file are gitignored.
   - Verify no secret has been committed in a workflow file or example config.
   - Run `git log --all --source --remotes -S "sk-" -S "AIza"` or similar to spot historical leaks.
2. **Auth boundary.**
   - Re-read `js/auth.js`, `js/firebase-config.js`, and the Firestore security rules in `firebase.rules` / console.
   - Confirm every synced doc write is gated on the caller's `uid` — no path-level wildcards, no unauthenticated writes.
   - Verify the 10 `SYNC_DOCS` types in `js/cloud-sync.js` are each covered by a rule.
   - Verify the `users/{uid}/rentcastUsage` audit log is write-only from the client (or gated on a server-only claim).
3. **Input handling & XSS.**
   - Audit every `innerHTML`, `insertAdjacentHTML`, and template-literal HTML assignment for `Utils.escapeHTML` / `Utils.escapeAttr` usage.
   - Hot spots: `js/app-popups.js` (modal templates), `js/app-export.js` (PDF/export HTML builders), every plugin `render*()` function.
   - Any AI-returned string from Gemini must be escaped before insertion — especially coverage-gap analysis markdown and Zillow/Redfin listing fields (`js/app-property.js` → `applyZillowSelects()`).
4. **API surface** — all 12 serverless functions in `api/`.
   - Count: `ls api/ | grep -v '^_' | wc -l` must stay ≤ 12 (Vercel hobby limit — see `CLAUDE.md` → "Vercel API Limit").
   - For each function: input validation, rate-limit awareness, and prompt-injection defenses (reject adversarial URLs / pasted HTML in listing-search mode).
   - Verify the Rentcast usage counter in `js/app-property.js` is enforced server-side as well as client-side, so the overage modal can't be bypassed by a hand-crafted request.

### Paste-ready prompt

> Run a whitehat security audit of this repo in four rounds, plan mode each: (1) secrets & keys across `api/`, `js/`, and `.github/workflows/`; (2) Firebase auth boundary and Firestore rules for `users/{uid}/sync/{docType}` and the 10 `SYNC_DOCS` types; (3) input handling and XSS — every `innerHTML` and template-literal HTML assignment, with focus on `js/app-popups.js`, `js/app-export.js`, and plugin render functions; (4) the 12 `api/*.js` serverless functions for input validation, rate limiting, and Gemini prompt-injection defenses. Reference `docs/technical/SECURITY_AND_DATA_SUMMARY.md` first. Report findings only — do not fix.

---

## Existing tooling map

Reference table so you don't reinvent anything. Every audit above points back to one of these.

| Tool | Location | What it does |
|------|----------|--------------|
| `npm run audit-docs` | `scripts/audit-docs.js` | Doc drift check (AGENTS.md / QUICKREF.md / copilot-instructions.md line counts, test suite count, last-updated date) |
| `npm test` | Jest | Full regression (Jest suite) |
| `npx jest --no-coverage` | Jest | Faster local loop |
| `CLAUDE.md` | repo root | Cold-start — read first, every session |
| `AGENTS.md` | repo root | 58 KB architecture deep dive — read targeted sections |
| `QUICKREF.md` | repo root | One-page cheat sheet |
| `CHANGELOG.md` | repo root | Mandatory session-by-session log (Keep a Changelog format) |
| `docs/technical/SECURITY_AND_DATA_SUMMARY.md` | docs/technical/ | Primary reference for Tip 6 |
| `tests/api-security.test.js` | tests/ | Existing API security coverage |
| `js/crypto-helper.js`, `lib/security.js` | js/, lib/ | Crypto surface |
| `js/cloud-sync.js` `SYNC_DOCS` array (~line 27) | js/ | The 10 synced doc types |
| `js/storage-keys.js` | js/ | Frozen `STORAGE_KEYS` — single source of truth |
| `js/utils.js` | js/ | `window.Utils.*` shared helpers |

---

## Every-session minimum

Before you commit:

1. `npm run audit-docs` — must exit 0
2. Add a `CHANGELOG.md` entry under `## [Unreleased]` describing what you changed and why
3. If you touched a file whose line count is cited in `AGENTS.md`, update that count too (the audit will flag it otherwise)
4. If you added a synced Firestore doc type, add it to `SYNC_DOCS` in `js/cloud-sync.js`
5. If you added a new `localStorage` key, add it to `js/storage-keys.js` — never hardcode

That's it. Everything else in this guide is catching up on what the every-session checklist missed.
