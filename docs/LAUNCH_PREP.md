# Altech — Launch Preparation Tracker

Pre-launch audit findings and fix log. Organized into three tiers:
- **(A) Safe to Delete** — dead code, orphaned files
- **(B) Should Be Cleaned** — bugs, duplication, fragile patterns
- **(C) Worth Watching** — deferred risks, things to monitor post-launch

---

## Status Key
- ⬜ Pending
- 🔄 In Progress
- ✅ Fixed
- ⏭ Deferred (intentionally skipped for now)

---

## (A) Safe to Delete

| # | File / Location | Issue | Status |
|---|----------------|-------|--------|
| A1 | `js/hawksoft-integration.js` | Orphaned `class HawkSoftIntegration`. Breaks the IIFE pattern used everywhere else. Zero instantiation calls in any HTML/JS — only referenced in `docs/`. Actual HawkSoft work lives in `api/hawksoft-logger.js` and `js/call-logger.js`. | ✅ Fixed |
| A2 | `js/app-init.js:34–46` — `App.toolNames` dict | Redundant partial subset of `toolConfig.name`. Only consumed in one place (`app-core.js:1622`) for breadcrumb text. Missing 5 tools added after initial build (`calllogger`, `endorsement`, `reminders`, `vindecoder`, `tasksheet`, `intake`), causing breadcrumbs to show raw key strings for those tools. | ✅ Fixed |
| A3 | `js/app-boot.js:29` — `window.__PLACES_API_KEY__` check | Dead no-op. Nothing in the codebase ever sets `window.__PLACES_API_KEY__`. Left over from an injection pattern that was never wired up. (Note: `__CACHED_MAP_API_KEY__` is different and IS actively used.) | ✅ Fixed |

---

## (B) Should Be Cleaned

| # | File / Location | Issue | Status |
|---|----------------|-------|--------|
| B1 | `api/hawksoft-logger.js:97–148 & 252–307` | ~50 lines of verbatim copy-paste. The HawkSoft API call (creds, auth header, fetch, response parse, logging) is duplicated between Step 1 (AI-format-then-push) and Step 2 (push-preformatted). Variables renamed `*2` suffix only. Extracted into `_pushToHawkSoft()` helper. | ✅ Fixed |
| B2 | `js/app-boot.js:79–89` — 5-second top-level safety timer | Double safety-net: a 5s `setTimeout` at module level AND a 2s `setTimeout` inside `window.onload` both check if the dashboard is empty and force-render. The outer 5s one is the older version. Removed it. | ✅ Fixed |
| B3 | `js/app-boot.js:134–138` — `renderLandingTools` / `updateLandingGreeting` called 2–3× per boot | Called explicitly in `app-boot.js` (with "legacy, for backwards compat" comment), then again inside `App.goHome()` at `app-core.js:1942`. Redundant work on every boot. Removed the explicit boot calls and rely on `goHome()` to call them. | ✅ Fixed |
| B4 | `js/auth.js:296` — `Auth.onAuthChange` listener accumulation | `_listeners` array grows forever. No deduplication, no `offAuthChange`. Any module that calls `Auth.onAuthChange(fn)` on re-init accumulates duplicate callbacks. Added WeakRef-style deduplication by function reference. | ✅ Fixed |
| B5 | `js/app-boot.js:239–244` — `Cmd/Ctrl+K` stub | Intercepts and swallows `Ctrl/Cmd+K`, then just calls `App.goHome()` with a "For now" comment. Permanently consumes a well-established browser shortcut (address bar focus / find-in-page on some browsers) without delivering the feature. Removed until command palette is actually built. | ✅ Fixed |
| B6 | All JS modules — no production log guard | Every module ships `console.log('[Module] ...')` calls unconditionally. Exposes detailed internal state (auth events, sync timestamps, AI key presence, Firestore results) to any user who opens DevTools. Added a `DEV` flag in `app-init.js` and a `log()` helper. | ✅ Fixed |
| B7 | `api/hawksoft-logger.js:193` — timezone hardcoded to Pacific | AI prompt always injects `America/Los_Angeles` regardless of user location. Agencies in other timezones get wrong timestamps in every formatted log. Accept `userTimezone` from client, fall back to `America/Los_Angeles`. | ⏭ Deferred — low priority for single-agency launch; revisit when multi-agency |

---

## (C) Worth Watching (Post-Launch)

| # | Location | Risk | Priority | Status |
|---|----------|------|----------|--------|
| C1 | `js/cloud-sync.js` — "Keep both" conflict strategy | `_conflict_<timestamp>` quote copies accumulate in localStorage + Firestore indefinitely. No TTL, no GC, no cleanup after resolution. Will silently grow over time for multi-device users. | Medium | ⬜ |
| C2 | `api/admin.js` — client-tier Firestore auth | Admin ops use raw Firestore REST with `FIREBASE_API_KEY` only — no service account, no Admin SDK. Security boundary is entirely Firestore rules. Misconfigured rules = all user profiles exposed. | High | ⬜ |
| C3 | `js/app-init.js:18` — `App.selectedQuoteIds` is a `Set` | `JSON.stringify` silently converts `Set` → `{}`. If any save path serializes `App`, selection state is lost without error. Either keep purely in-memory (never saved) with a clear comment, or convert to an array. | Medium | ⬜ |
| C4 | `plugins/quoting.html` (120 KB) + `plugins/ezlynx.html` (65 KB) | Loaded in a single fetch on first navigation — no internal lazy loading. All wizard steps rendered into DOM simultaneously. Will cause visible paint stall on slow connections. | Low | ⬜ |
| C5 | `js/auth.js:20` — `_authReady` 5-second hard timeout | `Auth.ready()` resolves with `null` after 5s if Firebase hasn't fired yet. On slow connections, code that awaits `Auth.ready()` then checks `Auth.isSignedIn` sees `false` — silently suppressing the initial `pullFromCloud()` and Places API key fetch for the session. | High | ⬜ |
| C6 | `sw.js` — manual cache version bump (`altech-v11`) | No automated version bump on deploy. If JS/CSS ships to Vercel without a SW version change, users on the old SW serve stale cached assets. `package.json` deploy script doesn't update this string. | Medium | ⬜ |
| C7 | `api/_rag-interpreter.js` + `api/historical-analyzer.js` | Endpoints exist in `vercel.json` with 60s max duration but no clear frontend callers found in the audit. May be stubs or experimental. Carry serverless compute cost when invoked. | Low | ⬜ |
| C8 | `js/crypto-helper.js` — device fingerprint key derivation | Key derived from device fingerprint. Browser update, private-browsing, or user-agent change silently changes the key. Previously encrypted localStorage data becomes unreadable with no clean error — just a broken JSON parse. No migration path. | High | ⬜ |
| C9 | `js/auth.js:505–508` — `Onboarding.isValidCode` as sole signup gate | If `Onboarding` is undefined at signup time (load order failure, script error), `codeValid` is always `false` and signup breaks with a misleading "Invalid invite code" message. | Low | ⬜ |

---

## Upcoming Changes (User Requested)

_Track new feature requests and changes here as they come in._

| # | Description | Status |
|---|-------------|--------|
| — | — | — |

---

## Notes

- All (A) and (B) fixes applied in the same commit batch (except B7 which is deferred).
- `toolNames` removal required updating `app-core.js` breadcrumb to use `toolConfig.find(t => t.key === toolKey)?.name`.
- `renderLandingTools()` is still called once in boot — it builds the tool grid DOM. `updateLandingGreeting()` and `updateCGLBadge()` were removed from explicit boot calls since `App.goHome()` already calls both.
- Production log suppression added in `app-init.js` via an IIFE that no-ops `console.log`/`console.info` on `altech.agency` and `*.vercel.app`. Debug mode re-enabled via `localStorage.setItem('altech_debug', 'true')`.
- Paywall dead branches (`PAYWALL_ENABLED = false` paths) intentionally left in place — they will be used when Stripe is configured.
- Desktop / Tauri code paths left in place — `src-tauri/` is an active side build.
