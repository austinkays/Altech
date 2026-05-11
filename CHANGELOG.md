# Changelog

All notable changes to Altech will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed
- **fix(robustness): LAUNCH_PREP §C5 + §C6 + §C8 — Auth.ready timeout, SW cache auto-bump, decryption-failure visibility** (May 11, 2026):
  - **C5 — `Auth.ready()` 5s timeout → 15s + `whenSignedIn()` helper** ([js/auth.js](js/auth.js)). The old 5-second safety timeout fired before Firebase responded on slow cellular networks; callers awaiting `ready()` saw `null` and silently skipped the initial `pullFromCloud()` and Places API key fetch for the whole session. Bumped to 15s (extracted as `READY_TIMEOUT_MS`), added `Auth.readyTimedOut` getter so callers can detect the degraded path, and added `Auth.whenSignedIn(timeoutMs = 30000)` — a separate promise that waits for an *actual* signed-in user (not just "status known"). Use this when the caller specifically needs a logged-in user, e.g. cloud-pull bootstrap.
  - **C6 — service-worker cache auto-bump** ([scripts/bump-sw-version.mjs](scripts/bump-sw-version.mjs) + [.githooks/pre-commit](.githooks/pre-commit)). The `CACHE_VERSION` string in `sw.js` was manually bumped, which means deploys that ship JS/CSS without remembering to update it leave users on the old service-worker serving stale cached assets until a hard refresh. New `bump-sw-version.mjs` reads + increments the version integer; the pre-commit hook auto-runs it whenever any cached source file (`js/`, `css/`, `plugins/`, `api/`, `index.html`, `manifest.json`) is staged AND the same commit doesn't already bump `CACHE_VERSION` manually. Idempotent: a `--dry-run` flag is available for sanity checks.
  - **C8 — decryption failures now surface via ActivityLog** ([js/app-core.js](js/app-core.js)). When `CryptoHelper.decrypt()` returns null (the v1 device-fingerprint path on a browser update / private-browsing change / UA change), `_parkCiphertextForRecovery` was already preserving the original ciphertext — but only a `console.warn` told the user. Now also emits an `ActivityLog.add({ type: 'error', area: 'crypto', ... })` so the new header status pill turns red and the slide-out panel shows the failure with a pointer at `App.getRecoveryBlobs()`. ActivityLog is feature-detected — fallback path is unchanged.
  - **Tests**: new [tests/robustness-pass.test.js](tests/robustness-pass.test.js) — 9 tests covering all three fixes (timeout constant, whenSignedIn detach-on-both-paths, bump script CLI + dry-run idempotence, pre-commit hook wiring, ActivityLog hook precedes only-if-available emit). **2232/2232 tests pass** across 53 suites (was 2198/49).

### Added
- **feat(palette + intake): Phonetic command in Cmd+K, fixed New-quote command, Start-fresh button in active-client badge** (May 11, 2026):
  - **Phonetic speller now globally accessible** ([js/command-palette.js](js/command-palette.js)) — new `action:phonetic` palette entry calls `PhoneticSpeller.open()`. Previously the popup was only reachable from the intake header (Step 0–6) and per-vehicle VIN inputs; now you can pop it open from any page via Cmd/Ctrl+K → type "phonetic".
  - **Fixed "New quote" palette command** ([js/command-palette.js](js/command-palette.js)) — the pre-existing implementation looked for `App.startNewIntake()` (which never existed) and fell back to a bare `navigateTo('quoting')`. Net effect: hitting "New quote" left the *previous* client's data on screen. Now navigates to intake AND calls the real `App.startNewClient()` after a 200 ms tick so the lazy-loaded plugin HTML is mounted before the form-clearing write.
  - **"Start fresh client" button in the active-client badge** ([plugins/quoting.html](plugins/quoting.html), [css/layout.css](css/layout.css)) — new `🧹 Start fresh` button next to History/Save inside `.acb-actions`. Wires `App.startNewClient()` directly. Hover uses `var(--warning)` (amber) instead of the default apple-blue to hint at the destructive intent. The action is safe: `_switchToClient(null)` flushes current edits to the active client's record first, then resets the form to step 0.
  - Tests: 5 new in [tests/command-palette.test.js](tests/command-palette.test.js) (phonetic command + phonetic no-op when module missing + new-quote navigate+clear) and [tests/audit-cleanup-fixes.test.js](tests/audit-cleanup-fixes.test.js) (button HTML wiring + destructive hover style). **2198/2198 tests pass** across 49 suites.

### Fixed
- **fix(audit): batch cleanup across CGL / reminders / exports** (May 11, 2026):
  - **CGL — XSS / quote-breakage in onclick attributes** ([js/compliance-dashboard.js](js/compliance-dashboard.js)): the pre-existing `policyNumber.replace(/'/g, "\\\\'")` was a buggy 4-backslash escape that produced `\\'` in the rendered HTML (not `\'`), so a policy number containing an apostrophe broke the inline JS. Replaced with a new `escJsAttr(s)` helper that does both layers — first backslash-escape the value for the JS string, then HTML-attr-encode the result — and rewired the master `pn` binding plus the two live-update sites (`renewedTo` badge in `updateRenewedBadge`, both onclick spans rendered in `renderTable`). Eliminates the syntax-error footgun and removes a small XSS surface for crafted policy numbers.
  - **CGL — silent localStorage quota** ([js/compliance-dashboard.js](js/compliance-dashboard.js)): added `_safeLSWrite(key, value)` helper that surfaces a one-time toast on `QuotaExceededError` (with `_quotaToastShown` latch) instead of letting the exception bubble up and skip the rest of `saveState`. Replaced four user-state setItem call sites: main save, merge-back-after-disk-load, file-handle open, and post-annotation-load promote. Cache-only sites still silent — losing the cache isn't data loss.
  - **Reminders — monthly recurrence overflow** ([js/reminders.js](js/reminders.js)): added `_addMonthsClamped(date, n)` helper. The prior `next.setMonth(next.getMonth() + 1)` silently rolled Jan 31 forward to Mar 3 instead of Feb 28/29. Both monthly-advance sites (`_autoAdvanceRecurring` + `_getNextDueDate`) now clamp the day to the target month's last day.
  - **Reminders — snooze timezone bug** ([js/reminders.js](js/reminders.js)): `snoozeUntilTonight` and `pushToTomorrow` now write a `untilDateStr` (PST `YYYY-MM-DD`) alongside the legacy `until` ISO instant. `_isSnoozeActive` prefers the string field — TZ-independent — so an EST/CST agent's snooze no longer expires 3 hours early. Old snoozes without `untilDateStr` continue to use the legacy path.
  - **Reminders — saveEdit dueDate validation** ([js/reminders.js](js/reminders.js)): rejects empty / malformed `YYYY-MM-DD` strings up-front so downstream helpers don't quietly misbehave on NaN compares.
  - **Exports — filename safety** ([js/app-export.js](js/app-export.js) + 4 callers): new `App._safeFileNamePart(s, fallback)` strips `<>:"|?*\/` and C0 control chars, collapses whitespace, trims trailing dots/spaces, caps at 80 chars. Wired into the text, CSV, PDF, CMSMTF, and EZLynx (auto + home) XML filename templates. `lastName = "Smith Jr."` or `"O'Brien"` no longer breaks the download.
  - **CMSMTF — CRLF + notes overflow** ([js/app-export-cmsmtf.js](js/app-export-cmsmtf.js)): switched the line-join from `\n` → `\r\n` to match HawkSoft's tagged-file format expectations, and capped `gen_sClientNotes` at 2048 chars (with `…` truncation marker) so a long session log can't overflow the import buffer.
  - **PDF — OOM guard** ([js/app-export-pdf.js](js/app-export-pdf.js)): wrapped `doc.output('blob')` in try/catch — surfaces a friendly "PDF too large to assemble" toast and rethrows, instead of crashing the session on a 50+ vehicle export.
  - **Docs** ([CLAUDE.md](CLAUDE.md)): updated the Phase D "Not yet wired" line — `MigrationBackup.snapshot()` / `isDryRun()` / `restore()` are already wired in [js/migration-ui.js](js/migration-ui.js) and covered by [tests/migration-ui-pipeline.test.js](tests/migration-ui-pipeline.test.js).
  - **Tests**: new [tests/audit-cleanup-fixes.test.js](tests/audit-cleanup-fixes.test.js) — 23 tests covering `_safeFileNamePart` edge cases, `_addMonthsClamped` (Jan 31 → Feb 28/29, leap year, Dec 31, etc.), CMSMTF CRLF + notes-cap source guards, PDF OOM-guard source guard, reminders snooze + saveEdit source guards, and compliance escJsAttr + _safeLSWrite source guards. **2193/2193 tests pass** across 49 suites (was 2170 / 48).
  - Tracks the spirit of draft PR #68 (which never merged); the line-numbers in that PR's body are stale relative to current main but the bugs it identified were still present here.

### Added
- **feat(mfa): passkey / WebAuthn enrollment alongside TOTP** (May 8, 2026):
  - Bumped `@supabase/supabase-js` CDN tag from `2.45.4` to `2.105.4` (no other SDK call sites changed; tests all green). Brings in [@supabase/auth-js@2.73 PR #1118](https://github.com/supabase/auth-js/pull/1118)'s `client.auth.mfa.webauthn.{register,authenticate}` namespace, which wraps `navigator.credentials.{create,get}` and the enroll → challenge → verify round-trip into a single call.
  - **`SupabaseAuth.enrollPasskey()`** ([js/supabase-auth.js](js/supabase-auth.js)) — fires the platform's native authenticator UI (Face ID / Touch ID / Windows Hello / hardware key). Friendly name auto-derived from UA (e.g., "Chrome on macOS"). Refreshes the factor cache on success so `mfaRequired()` flips immediately.
  - **`SupabaseAuth.authenticatePasskey(factorId)`** — step-up verify for return visits. (Currently no call site — the app doesn't do AAL2 gating on sign-in. Hook is ready for when we add it.)
  - **`SupabaseAuth.passkeySupported()`** — capability detector that checks both `window.PublicKeyCredential` AND that the SDK exposes the new `mfa.webauthn` namespace, so we never show the option in browsers that would fail on click.
  - **MFA enrollment overlay** ([index.html](index.html), [js/auth-mfa-ui.js](js/auth-mfa-ui.js)) — adds an "Enable passkey" card above the TOTP section. Hidden on unsupported browsers; layout collapses cleanly to TOTP-only. Cancellation paths (user dismissed prompt, timeout, double-enrollment) all surface as friendly messages without scaring the user.
  - Tests: 43/43 pass (supabase-auth, mfa-enforcement, auth-cloudsync, migration-ui-pipeline). WebAuthn itself can't run in JSDOM — manual browser test required for the actual ceremony.

### Fixed
- **fix(sync): post-migration reminders/quickref/cgl no longer silently disappear from local view** (May 8, 2026):
  - **Symptom**: User reported reminders missing after migrating to Supabase. Data was safe on the server (`user_blobs.reminders` = 17,823 bytes encrypted) but invisible locally.
  - **Root cause**: [js/auth.js](js/auth.js) calls `CloudSync.pullFromCloud()` directly on every Firebase auth-state change. Post-migration users still hold a Firebase session in IndexedDB (we don't sign them out of Firebase, just stop reading from it), so this fires AFTER the user is on the Supabase backend. Firebase still has the *pre-migration* version of each doc; the pull writes those stale (sometimes empty) values back to localStorage, overwriting whatever the migration restored. Phase 4 was supposed to migrate these direct call sites to the facade but hadn't shipped.
  - **Fix 1** ([js/auth.js](js/auth.js)): gate the pull on `SYNC_BACKEND !== 'supabase'`. Migrated users no longer get clobbered by stale Firebase data.
  - **Fix 2** ([js/supabase-sync.js](js/supabase-sync.js)): added `SupabaseSync.restoreFromCloud()` — pulls every plain-JSON blob, decrypts the v=2 AAD envelope, writes plaintext to localStorage. Skips `currentForm` (locally v1-encrypted, needs re-encrypt path), `vaultMeta` (canonical reader is `VaultMeta.load`), and quotes (per-row identity loop).
  - **Fix 3** ([js/sync-facade.js](js/sync-facade.js)): exposed it as `Sync.restoreFromCloud()`. From the console: `await Sync.restoreFromCloud()` returns `{ restored, skipped, failed }` and reloading the page shows the data.
  - Tests: 27/27 pass across auth-cloudsync, admin-only-sync, migration-ui-pipeline.

- **fix(mfa): TOTP enrollment QR now actually shows up** ([js/auth-mfa-ui.js](js/auth-mfa-ui.js), May 8, 2026):
  - The original code blindly passed Supabase's `qr_code` field into `<img src=...>`. supabase-js v2 returns **raw SVG XML** there, not a data URL, so the `<img>` rendered as a broken image and users only saw the manual entry code + 6-digit input. Now dispatches across three response shapes: raw SVG XML (rendered inline), data URL / http URL (rendered via `<img>`), and `otpauth://` URI only (rendered via lazy-loaded `qrcode@1.5.3` from jsdelivr CDN — already in CSP allowlist).
  - On every fallback path the user gets a usable affordance: tap-to-pair `otpauth://` link on phone, manual code, or both.

- **fix(migration): vault meta now mirrors to `user_crypto_meta` + auto-heal for affected users** (May 8, 2026):
  - **Bug**: Session 2 migration pipeline ran `_persistVaultMeta()` (step 5) BEFORE flipping `SYNC_BACKEND` to `'supabase'` (step 6). `VaultMeta.save()` consults `SYNC_BACKEND` to decide whether to write `public.user_crypto_meta` — so the Supabase mirror got skipped and migrated users ended up with 0 rows in that table. Their `vaultMeta` blob in `user_blobs` still let them unlock on the current device, but cross-device sign-in / agency-sharing keypair / KDF upgrades all live on `user_crypto_meta` and would have failed on a new device.
  - **Pipeline fix** ([js/migration-ui.js](js/migration-ui.js)): swapped step order so the backend flips before vault meta save. Future migrations populate the table correctly.
  - **Auto-heal** ([js/vault-meta.js](js/vault-meta.js)): `VaultMeta.load()` now actively mirrors local→server when SYNC_BACKEND is supabase, server returns null, and local has a complete record. Migrated users self-repair on next refresh — no console snippet needed.
- **fix(css): recovery key no longer wraps to single-character columns on narrow viewports** ([css/vault.css](css/vault.css)) — replaced `word-break: break-all` (which ignored hyphens and shredded each `XXXX-XXXX-XXXX-XXXX` group character-by-character) with `overflow-wrap: anywhere; word-break: normal` so hyphens are preferred break points. Added 480px font-size breakpoint.

### Added
- **feat(migration): MFA enrollment baked into the migration done step** (May 8, 2026):
  - Step 6 of `MigrationUI` now has a primary **"Enable two-factor auth"** button that closes the migration modal and opens `AuthMFAUI.openEnroll({ hard: true })` after one tick (avoids overlay flash). "Skip for now" is the secondary action. Wires the encryption story end-to-end: passphrase + Supabase password + TOTP, in one flow.
- **docs(crypto): ENCRYPTION_AND_MFA.md** ([docs/ENCRYPTION_AND_MFA.md](docs/ENCRYPTION_AND_MFA.md)) — 652-line deep dive on AES-GCM, KDF, vault lifecycle, TOTP, RLS, and migration. Cherry-picked from `claude/document-encryption-details-ptbHc` with a prominent header flagging it as a **pre-Phase-A snapshot** so future readers consult CLAUDE.md for the current Argon2id + HKDF + AAD-bound state. (The branch's other ~3,200 deletions — migration-ui.js, crypto-aad.js, the new test files, migrations 0004/0005/0006 — were stale-divergent and intentionally NOT pulled.)

### Added
- **feat(export): unified Export Files picker + cross-exporter contract test + round-trip test** (May 5, 2026):
  - Producers now have one "📦 Export Files…" button on step-6 instead of separate PDF / EZLynx XML buttons. Opens a modal that combines:
    - **Readiness check** — every blank `ezlynxRequired` field surfaces with a click-to-jump link (focuses the field after navigation), grouped by step (Personal & Co-Applicant / Property / Drivers & Vehicles / Prior Insurance) so producers see context. Green "Ready to export" banner when nothing's blank.
    - **Format checkboxes** — Client PDF / EZLynx XML / HawkSoft Tagged File / Text Summary. No zip; each checked format triggers its own download via the existing exporter so the file naming + audit log stay consistent. Last-selected formats persist to `localStorage[EXPORT_PICKER_LAST]`.
  - The plugin-launch buttons (EZLynx tool, EZLynx Auto-fill desktop, HawkSoft tool) stay as separate buttons since they don't produce direct file downloads.
  - **`tests/exporter-contract.test.js`** — companion to the filler-JSON wire-format test from earlier today. Parametrizes over every `ezlynxRequired` field and asserts each reaches at least one downstream exporter (EZAUTO XML, EZHOME XML, HawkSoft FSC, EZLynx desktop filler JSON). Per-format tests catalog known schema gaps in `NOT_IN_EZAUTO` / `NOT_IN_EZHOME` / `NOT_IN_FSC` dictionaries with one-line reasons (mostly "V200 schema doesn't have a slot — flows via filler JSON"). Adding a new `ezlynxRequired` field forces either wiring it in the relevant exporter or documenting the gap.
  - **`tests/ezlynx-roundtrip.test.js`** — populates a full client, exports to EZLynx XML, re-imports via `_applyEZLynxData`, and asserts key fields survived. Includes an idempotent test (re-exporting imported data produces byte-identical XML) — the strongest no-loss assertion. Catches lossy mappings the unidirectional tests miss (comma stripping in coverage values, date format gymnastics, enum normalization).
  - **Bug fix**: `buildEZLynxXML`'s `<PriorPolicyInfo>` block was suppressed when only `priorPolicyTerm` was set (the gate only checked carrier/years/exp). Surface the block on any prior-policy field. Also wired `purchaseDate` to the filler JSON — was the only `ezlynxRequired` field not flowing to any exporter.
  - Files: `js/app-export-picker.js` (new), `js/app-export-acord-xml.js` (gate fix), `js/app-export.js` (PurchaseDate), `js/storage-keys.js` (`EXPORT_PICKER_LAST`), `index.html` (script load), `plugins/quoting.html` (hero card), `css/components-modals.css` (picker styles), `tests/export-picker.test.js` (new — 14 tests), `tests/exporter-contract.test.js` (new), `tests/ezlynx-roundtrip.test.js` (new — 7 tests), `tests/ezlynx-required-coverage.test.js` (PurchaseDate added), `tests/ezlynx-export-filler.test.js` (key-set update).
  - **2041 tests pass** across 39 suites (up from 2011 / 36 — 30 new tests for picker + round-trip + cross-exporter contract).

- **feat(export): export-pipeline integrity audit + wire-format contract test** (May 5, 2026):
  - Follow-up to the import smart-merge work — focused on making sure the form data actually survives the trip to EZLynx instead of getting silently dropped at export time.
  - **`exportClientJsonForFiller` (js/app-export.js) was missing huge swaths of fields.** The Phase-1 contract only included the applicant + driver0 + a slice of auto coverage. Backfilled with: full co-applicant block (`CoFirstName`, `CoDOB`, `CoGender`, `CoRelationship`, `CoMaritalStatus`, `CoEmail`, `CoPhone`, `CoOccupation`, `CoIndustry`, `CoEducation`, `CoPrefix`, `CoSuffix`, `CoMiddleName`); full home/dwelling block (`YearBuilt`, `DwellingType`, `SquareFootage`, `ConstructionStyle`, `ProtectionClass`, `RoofType`/`Year`/`Shape`, `HeatingType`, `Cooling`, `Bedrooms`, `FullBaths`, `NumStories`, `DwellingCoverage`, `PersonalLiability`, `MedicalPayments`, `HomeDeductible`, `EarthquakeCoverage`, `HomePolicyType`, `HomePriorCarrier`/`Years`/`Exp`, `Mortgagee`); previously-skipped auto fields (`UM`, `UIM`, `Towing`, `RentalReimbursement`, `PriorAutoExpiration`, `PriorLiabilityLimits`, `ContinuousMonths`, `PriorMonths`); `QuoteType` + `MultiPolicy`; **full `Drivers[]` array** (not just driver0) and a new `Vehicles[]` array with VIN, use, miles, anti-theft, primary-driver assignment.
  - **`multiPolicy` declared in `js/fields.js`.** Was an undeclared hidden input read by 5 export pipelines (PDF, HawkSoft FSC, EZLynx desktop filler, EZLynx XML import, EZLynx tool) — now visible to `FIELD_BY_ID`, schema migrations, and any exporter that iterates `window.FIELDS`. Type `logic` (same as `qType`) since it's auto-set by `handleType()`, not user-edited.
  - **`_markEzlynxRequiredGaps` parent-walk fix.** The "needs review" badges I shipped in PR #62 were effectively dead — `quoting.html` only has `for=` on 3 of 166 labels, so `label[for="${id}"]` matched almost nothing. Refactored to mirror the parent-walking strategy already in `_stampEzlynxLabels` (js/app-navigation.js), via a shared `_findFieldLabel` helper. Badges now stamp on every blank `ezlynxRequired` field regardless of label markup style (plain `<label>` sibling, `.label-with-hint` wrapper, double-wrapped variants).
  - **Wire-format contract test (`tests/ezlynx-required-coverage.test.js`).** Parametrizes over every `ezlynxRequired: true` field in `fields.js` and asserts each one (a) has a destination key in `EZLYNX_REQUIRED_TO_FILLER_KEY`, and (b) produces a non-empty value at that key when `App.data` is set. Adding a new `ezlynxRequired` field without wiring it now fails the test. Catches the silent-drop class of bug that motivated this audit.
  - Files: `js/app-export.js` (filler JSON expansion), `js/fields.js` (`multiPolicy` declaration), `js/app-scan.js` (`_markEzlynxRequiredGaps` + new `_findFieldLabel` helper), `tests/ezlynx-export-filler.test.js` (updated key set, new home/co-app/Drivers[]/Vehicles[] assertions), `tests/ezlynx-required-coverage.test.js` (new file — contract test).
  - **2011 tests pass** across 36 suites (up from 1933 / 35 — the 78 new tests are the parametrized coverage assertions plus added home/co-app/multi-driver scenarios).

- **feat(ezlynx-import): smarter HawkSoft → Altech import + post-import review modal** (May 5, 2026):
  - HawkSoft's EZLynx XML export consistently leaves the `<CoApplicant>` block half-filled — usually only `FirstName`/`LastName`, with `DOB`/`Gender`/`MaritalStatus`/`Relation` blank — even though the same person's full data sits inside the `<Driver>` block. The old importer (`_applyEZLynxData` in `js/app-scan.js`) read each block in isolation, so spouse DOB and gender were dropped on the floor.
  - **Smart importer rewrite**: parses both `EZAUTO` and `EZHOME` schemas, detects `qType` from the root element (and merges to `'both'` if a different schema was already imported into the same client), and adds cross-block reconciliation: when a CoApplicant's first name matches a Driver, missing `coDob`/`coGender`/`coMaritalStatus` are backfilled from that driver and the driver is tagged `isCoApplicant: true`. Last-name mismatches (maiden vs. married) no longer break the merge.
  - **New data captured per import**: driver `<Violation>` and `<Accident>` blocks (structured `violationList`/`accidentList` + free-text summaries); per-vehicle `<AnnualMiles>` (replaces the hardcoded `12000` default when present), `<OneWayMiles>`, `<Anti-Theft>`, `<PassiveRestraints>`; `<PolicyInfo>` effective date + term; `<PriorPolicyInfo>` `<Expiration>` (was dropped); `<WA-PIP>`; `<Multicar>` → `multiPolicy`. EZHOME import now reads `<RatingInfo>` (year built, dwelling, construction, protection class, fire-hydrant range, sq ft, pool, stories, heating, roof), `<ReplacementCost>` (Coverage A/B/C + LOU with comma stripping), `<Endorsements>` (earthquake, increased replacement cost), and `<AltDwelling>` for the property address.
  - **"Complete the picture" review modal**: fires once after import when gaps remain. Sectioned, not a wizard — household roles (driver-relationship dropdowns, pre-suggested by name + age heuristics), marital sanity check (Applicant=Single + CoApp present → offer to flip both to Married), vehicle assignments (HawkSoft sends empty `<DriverAssignment/>`), annual mileage + use confirmation, and an informational checklist of remaining `ezlynxRequired` field gaps. Producer can apply or skip; nothing is auto-applied without confirmation.
  - **Inline "needs review" badges** (`.ez-needs-review-badge`) stamped on intake-form labels for any `ezlynxRequired` field left blank by import — small amber pill, dark-mode aware.
  - **Round-trip fix on the export side**: `buildEZLynxHomeXML` now emits a `<CoApplicant>` `<Applicant>` block (mirroring the auto exporter), so a complete client picture survives the Altech → EZLynx export hop. Previously the home XML had no co-applicant element at all.
  - Files: `js/app-scan.js` (`_applyEZLynxData`, `_buildImportGaps`, `_hasImportGaps`, `_suggestDriverRelationship`, `_showImportReviewModal`, `_closeImportReviewModal`, `_applyImportReviewModal`, `_markEzlynxRequiredGaps`), `js/app-export-acord-xml.js` (`buildEZLynxHomeXML` co-applicant emission), `css/components-modals.css` (review modal + badge styles).
  - All 1933 tests pass — backwards-compatible with the existing import contract (default 12000 miles when not specified, `Self`/`Spouse`/`Insured` relation mapping, GarageLocation address parsing).

### Fixed
- **fix(css): make <select> dropdown options readable in dark mode** (May 1, 2026):
  - Native `<option>` elements don't reliably inherit `background`/`color` from the parent `<select>`, so in dark mode the options popup was rendering with the browser's default light background. Where the parent select also matched `select:invalid` (e.g. a required dropdown still on its placeholder), the `rgba(255, 59, 48, 0.08)` red wash bled into the popup, leaving near-white option text on a pinkish-white background — effectively unreadable (visible on the Home Risk Factors → Swimming Pool dropdown in step 5).
  - Added a global `select option, select optgroup` rule in `css/components-inputs.css` that forces `background: var(--bg-card); color: var(--text)` in light mode and `#1C1C1E` / `#FFFFFF` under `body.dark-mode`. Disabled options fall back to `var(--text-tertiary)` so placeholder/help options remain visually distinct.
  - Effect: every `<select>` dropdown across the app — intake form, commercial quoter, plugins — now shows high-contrast options in both themes regardless of validation state.

### Changed
- **fix(compliance): silently auto-acknowledge bond renewals** (April 30, 2026):
  - When a bond's expiration date moved forward (i.e. renewed in HawkSoft), `checkForRenewals()` in `js/compliance-dashboard.js` was setting `needsStateUpdate = true` and wiping any prior `hawksoftUpdated` ack — pinning the bond to the top of the list with a "⚠️ Renewed" badge until the user clicked "🦅 HawkSoft Updated" again.
  - Bonds have no separate state-website step (unlike CGLs), and the renewal was detected only because HawkSoft was updated in the first place — so the loud follow-up was redundant.
  - Extracted helper `_applyRenewalMarkers(nd, policy)` inside `checkForRenewals()` that branches on `policy.policyType`. For bonds: sets `hawksoftUpdated = now`, `hawksoftUpdatedForExp = newExp`, `needsStateUpdate = false`. For all other types: existing CGL behavior (clears acks, sets `needsStateUpdate = true`).
  - Effect: bonds drop back into normal date-sorted position after a renewal and won't re-surface at the top until the new term is itself near expiration. The "Auto-cleared: policy renewed (exp X → Y)" log entry and the small "🔄 Renewed" date-column badge still render so there's a visible record.

- **refactor(commercial-quoter): tighten PDF export to 1 page** (April 29, 2026):
  - The commercial intake PDF was wasting space and spilling into a second page even for compact quotes. Reworked `exportPDF` in `js/commercial-quoter.js` so a typical intake (3–4 coverages, single owner, ~3-line description) renders on a single page.
  - Header: logo 18→13mm, title 11pt→10pt, subtitle 8pt→7.5pt, doc-ref 10pt→9pt, separator gap trimmed.
  - Business card: contact-line variant 28→17mm, name 14pt→12pt, post-card gap 6→3mm.
  - Section headers: vertical advance 7→5.5mm.
  - `kvTable` rows: default `cellH` 13→9.5mm; label 6.5pt→6.2pt; value 9.5pt→9pt; trailing gap 1→0.5mm.
  - Coverage details: switched from 2-col@13mm to 3-col@8.5mm — three short money/integer fields fit one row instead of two.
  - Coverage sub-header (`covRow`): 8.5→6.5mm height.
  - New `longBlock(label, value)` helper renders Business Operations as a full-width wrapped paragraph instead of cramming it into a 2-col cell where it would force two pages.

### Added
- **feat(commercial-quoter): always show background Y/N questions in PDF** (April 29, 2026):
  - Prior felony, bankruptcy, pending lawsuits, and subcontractor questions now always render in the Owner & Background section of the exported PDF — even when un-answered — so the agent can demonstrate the questions were asked during intake.
  - New `_fmtYN` helper maps stored `Y`/`N` → `Yes`/`No`, with `—` (em-dash) for un-answered. Un-answered values render in the muted color via the existing `isEmptyish` path so explicit Yes/No answers stand out.
  - Question labels updated for clarity in the PDF: "Prior Conviction" → "Prior Felony", "Bankruptcy" → "Bankruptcy (5 yr)", "Lawsuits" → "Pending Lawsuits".

### Added
- **feat(compliance): WA L&I / OR CCB reporting tracker** (April 28, 2026):
  - Adds a `clientCompliance` annotation dictionary keyed by HawkSoft `clientNumber` to `altech_cgl_state` — tracks classification (`wa-contractor` / `or-contractor` / `wa-or-contractor` / `exempt` / `unverified`), classification source (auto vs. manual), and per-state reported timestamps tied to the policy's current expiration date.
  - On policy load, the dashboard auto-verifies each unique client against the existing `/api/prospect-lookup?type=li` (WA L&I Socrata) and `?type=or-ccb` (OR CCB Socrata) endpoints in parallel, throttled to 3 concurrent. Found in either registry → contractor in that state; not found in either → exempt; transient error → left unverified for retry.
  - New inline badges in the Client cell of CGL/Pkg/BOP/Commercial rows: 🛠️ WA L&I (orange — needs report), ✅ WA L&I + date (green — reported for current expiration), and likewise for OR CCB. Click a badge to toggle reported/needs-report. Exempt clients show no badge.
  - Auto-reflag on renewal: marking "reported" stores the current `expirationDate` in `waReportedForExp` / `orReportedForExp`. When HawkSoft pulls a renewed policy with a new expiration, the badge automatically flips back to orange — mirrors the existing `stateUpdatedForExp` pattern.
  - New "🛠️ Needs L&I/CCB" stat card and matching filter option ("Needs L&I/CCB Update") for the daily reporting queue.
  - New 🏷️ L&I/CCB row inside the note editor — manual classification override (WA / OR / Both / Exempt) and 🔄 Re-verify button. Manual overrides are sticky; auto-verify won't overwrite them.
  - All annotations sync via the existing `cglState` cloud-sync doc and merge through the existing `_smartMergeDict` so multi-device usage is safe.
  - Files touched: `js/compliance-dashboard.js` (state model, helpers, rendering, filter/stat wiring), `plugins/compliance.html` (stat card, filter option, legend, info-modal section), `css/compliance-main.css` (badge + classification-row styles, dark-mode variants).

- **feat(branding): replace Tauri default icons with new Altech mountain logo** (April 28, 2026):
  - Regenerated every file in `src-tauri/icons/` from `icons/icon-512.png` so the Windows/macOS/Linux desktop builds no longer ship the default yellow-and-teal Tauri logo.
  - Replaced PNG sizes 30/32/44/50/71/89/107/128/142/150/256/284/310/512, plus `icon.ico` (multi-size 16-256) and `icon.icns` (multi-size 16-512).
- **feat(intake): phonetic speller popup** (April 27, 2026):
  - New `js/phonetic-speller.js` IIFE plugin exposing `PhoneticSpeller.open(seed?)` — small popup that converts any typed text (name, email, address, VIN, etc.) into the APCO phonetic alphabet (Adam, Boy, Charles…) so the agent can read it back over the phone. Live update on input, copy-to-clipboard, ESC to close.
  - New `css/phonetic-speller.css` — modal + header trigger button styles.
  - `plugins/quoting.html` — added a small "📞 Phonetic" trigger button next to the dark-mode toggle in the intake header (always available across all steps).
  - `js/app-vehicles.js` — added a "📞 Read phonetically" link beneath each VIN input that pre-fills the popup with the current VIN value.
  - Reuses the same APCO alphabet as the standalone VIN decoder for consistency.

### Fixed
- **fix(ezlynx-extension): kill the slow-fill / overlay-pileup nightmare** (April 24, 2026):
  - **Symptom**: contact page would visibly stack 3–4 mat-select panels open at once and crawl through ~48 fields one at a time, often timing out with most fields still empty.
  - **Root cause #1 — `dismissOverlay` always slept 300 ms** (`chrome-extension-v2/src/content/special-cases/dismiss-overlay.js`): called before every mat-select fill (~20× per page) regardless of whether an overlay was actually open. Rewrote with a `hasOpenOverlay()` fast-path early-exit, click-every-backdrop (not just first), Escape, and a force-detach `.cdk-overlay-pane` escape hatch for pages that intercept the backdrop click. Default delay between escalation steps cut 150 ms → 80 ms.
  - **Root cause #2 — retry storm** (`chrome-extension-v2/src/content/orchestrator/atom-executor.js`): `maxRetries=3` × `retryDelayMs=500` plus a 1500 ms `waitElement` fallback meant fields not on the page burned ~6 s each. Cut to `maxRetries=1`, `retryDelayMs=200`, `waitElement` timeout 400 ms.
  - **Root cause #3 — 2 s post-click overlay-close poll** (`chrome-extension-v2/src/content/primitives/mat-select.js`): replaced with a 200 ms poll on the picked option's `aria-selected` / `mdc-list-item--selected` marker. Next atom's `dismissOverlay` clears any straggler.
  - **Root cause #4 — fully serial execution** (`chrome-extension-v2/src/content/orchestrator/index.js`): added `collectParallelBatch` + `isParallelizable` so consecutive non-overlay atoms (text/phone/ssn/number/currency/date with no preconditions or postFill) run via `Promise.all`. Mat-selects/toggles/radios still run strictly serial — the constraint is "one CDK overlay at a time", not "one atom at a time".
  - **Tests**: 25 new unit tests across `dismiss-overlay.test.js` (fast-path elapsed-time guard, multi-backdrop click, force-detach escalation) and `orchestrator-parallel-batching.test.js` (type whitelist, precondition/postFill exclusions, end-to-end concurrency proof). 590/595 ext-suite tests pass — the 5 failures are pre-existing applicant-registry atom-count drift unrelated to this change.

### Added
- **feat(migration): Phase 4a scaffolding — Firebase → Supabase E2E migration modal (feature-flagged off)** (April 22, 2026):
  - New `js/migration-ui.js` (~260 lines): 7-step wizard (welcome → reauth → passphrase → recovery-key → running → done | error) with full step navigation, error surfacing, and busy-state handling. Matches the existing `VaultUI` modal pattern.
  - New modal HTML `#migrationModal` in `index.html` (~120 lines) with the 7 step panels, styled to match the existing auth/vault modals.
  - New flags: `STORAGE_KEYS.MIGRATION_ENABLED` ('1' = show the modal) and `STORAGE_KEYS.MIGRATION_STATE` (not-started | in-progress | complete | error — survives reload so a crashed migration can resume in Session 2).
  - **Session 1 scope (this push):** scaffolding only. Re-auth step actually verifies the Firebase password via `Auth.user.reauthenticateWithCredential` — proving the Firebase integration layer works. Passphrase step wires `CryptoHelper.createVault` + `generateRecoveryKey` + `wrapWithRecoveryKey` into a proper `cryptoMaterial` bundle with both passphrase-derived and recovery-key-derived wraps of the master key. Step 5 (running) is stubbed with a clear "Session 1 scaffold only — pipeline ships in Session 2" error; no Firebase, Supabase, or localStorage data is touched.
  - **Session 2 scope (next):** the actual data pipeline — pull Firebase plaintext, decrypt legacy v1 payloads, re-encrypt under the new passphrase-derived MK, create Supabase account, push ciphertext, flip `SYNC_BACKEND=supabase` + `E2E_CRYPTO_V2=1`, mark Firebase user `migrated=true`. Resume-on-crash via `MIGRATION_STATE`.
  - **Session 3 scope:** admin "Migrate Team" panel, automated tests against mock Firebase + mock Supabase, lift the admin-only sync policy.
  - **Zero production impact:** the modal is invisible unless `MIGRATION_ENABLED='1'` is set in localStorage (admin-only testing). `MigrationUI.open()` in the console is the only current trigger. All 1820 tests still pass.
  - **No URL hash trigger** — would conflict with the existing hash router (`App.navigateTo` routes on hash change). Admin button + hash trigger are future sessions.

### Security
- **security(sync): restrict cloud sync to admin accounts by agency policy** (April 22, 2026):
  - Until Path B Phase 4 ships end-to-end encryption (Supabase ciphertext-only backend + MFA-enforced writes), plaintext client NPI still lands in Firestore on push. Non-admin accounts are now gated from every write path so client data stays local-only on their devices — eliminating the E&O / FTC Safeguards Rule / NAIC Insurance Data Security Model Law exposure for everyone who isn't the agency admin.
  - **Gate layer 1** — `js/cloud-sync.js`: new `_policyBlocksSync()` helper, `Auth.isAdmin !== true` means the four sync entry points (`schedulePush`, `pushToCloud`, `fullSync`, `pullFromCloud`) no-op. Implemented by chaining the check into the existing `disabledByUser` getter so every historical gate site picks it up automatically. Fails closed when `Auth` isn't loaded yet (boot window).
  - **Gate layer 2** — `js/sync-facade.js`: new `policyBlocksSync()` + `writeBlocked()` helpers parallel the existing `mfaBlocksSync()`. Every Supabase and Firebase write method on `window.Sync` returns `{ ok: false, skipped: 'policy-blocked' }` for non-admins. Reads (`pullFromCloud`, `pullBlob`, `pullQuote`, `listQuotes`) stay open so a demoted admin can still inspect their own data.
  - **UI** — `js/auth.js` force-checks and disables the "Keep data on this device only" toggle for non-admins, swaps the label to "Cloud sync disabled by admin policy", and rewrites the description. `CloudSync._refreshSyncUI` now shows "Local-only (admin-restricted)" instead of the generic "Disabled — local-only".
  - **Admin bypass** — admins retain full sync for cross-device continuity. `isAdmin` is a server-managed claim on the Firestore user profile — clients cannot elevate themselves.
  - **Regression guard** — `tests/admin-only-sync.test.js` (11 new tests, source-level assertions): verifies the gate functions exist, fail closed on missing Auth, require `isAdmin !== true` (not just `== false`, so undefined also blocks), chain into `disabledByUser`, and gate every write method on the facade. If any layer is refactored away, CI fails loudly.
  - **Test migration**: `tests/mfa-enforcement.test.js` loadStack now injects `window.Auth = { isAdmin: true }` so MFA-focused tests don't double-gate. `tests/auth-cloudsync.test.js` debounce test overrides `Auth.isAdmin` via `Object.defineProperty` since its Firestore profile mock returns `{exists:false}`.
  - **Admin enrollment**: no UI path yet — admin status is set by manually writing `isAdmin: true` to `users/{uid}` in the Firestore console (per the existing bootstrap note in `js/auth.js:80`). Future admin panel can CRUD this.

### Fixed
- **fix(sync): carrier rule overrides are now cloud-synced** (April 22, 2026):
  - `STORAGE_KEYS.CARRIER_OVERRIDES` (used by the Broadform / Carrier Match tool for user-edited underwriting rules) was never registered in `SYNC_DOCS` or `_getLocalData()` in `js/cloud-sync.js`. The Broadform tool called `CloudSync.schedulePush()` after every rule save, but the push was a silent no-op — overrides lived only in browser localStorage.
  - Added `'carrierOverrides'` to `SYNC_DOCS`, emitted from `_getLocalData()`, and pulled via `_pullDoc('carrierOverrides', STORAGE_KEYS.CARRIER_OVERRIDES, 'carrierOverrides')`. On pull, `BroadformData.applyOverrides()` is re-called so the in-memory carrier definitions reflect synced state immediately — no reload required.
  - Added 3 regression-guard tests in `tests/broadform.test.js` that read `js/cloud-sync.js` source and assert the wiring stays intact. If future refactors drop the SYNC_DOCS entry or the `_getLocalData` field, tests fail loudly.
  - Storage durability is now layered: seed rules in git (`js/tools/broadform-data.js`) + user overrides in Firestore (`users/{uid}/sync/carrierOverrides`) + localStorage cache + Firebase-managed backups. Losing data requires multiple failures at once.

### Added
- **feat(intake): Carrier Fit card on Step 6** (April 22, 2026):
  - New card in `plugins/quoting.html` surfaces `BroadformEngine.evaluate()` output live on the Review & Export step. Reads the current quote's `qType` and `autoPolicyType` to pick which LOBs to evaluate (home / auto / broadform / nonowners).
  - Renderer in `js/app-export-carrier-fit.js` (new sibling to `app-export-coverage-gap.js`) groups carriers by verdict — eligible (green), pending with missing fields (blue), ineligible with reasons (red), refer-out (gray). Notes, missing-field hints, and disqualification reasons are inlined per row.
  - Hooked into `updateUI` on step-6 entry in `js/app-navigation.js`. "Edit rules →" button jumps to the existing Carrier Match tool (`plugins/tools/broadform.html`) where rules can be authored via natural language + AI.
  - Renders a "rules currently cover WA/OR/ID" hint when the client's state is outside the supported set instead of showing an empty card.
- **feat(intake): Non-Owners / Broadform toggle on Step 0** (April 22, 2026):
  - Added a "No vehicles on this policy (Non-Owners / Broadform)" checkbox below the three coverage-type cards in `plugins/quoting.html`. When checked, clicking **Auto** or **Home + Auto** pre-sets `autoPolicyType='NonOwners'` before Step 4 renders — so the user no longer has to navigate to Step 4, scroll past the Vehicles card, and then hide it via a dropdown. Home card ignores the toggle (home-only quotes already skip step 4).
  - `App.selectTypeAndStart(type, isNonOwner)` is now async and awaits `startFresh()` so the pre-set write to `data.autoPolicyType` is never raced by the async client-switch that clears data. Persists immediately via `safeSave` so the value survives any subsequent `App.load()` on Step 4 entry.
  - `handleAutoType()` simplified: non-owner/broadform now **keeps the Drivers card visible** (driver info is the entire point of a Broadform / named-non-owner policy) and only hides the Vehicles card. The Step 4 notice already stated "Only liability limits and driver info are needed" — the prior hide-drivers behavior contradicted it.
  - New `.coverage-nonowner-toggle` style in `css/components-acord.css` — neutral pill under the coverage cards, apple-blue accent on hover/check.
  - No change to EZLynx / HawkSoft / PDF exports — `autoPolicyType` was already in `fields.js` and round-tripping through all three.

### Changed
- **style(intake): fold Save button into the active-client badge row** (April 22, 2026):
  - In the app-shell viewport, the plugin's `.tool-header-brand` is hidden so the dashboard breadcrumb can own the tool title. That left `.header-right` (the Save button + "✓ Saved" indicator) stranded on its own empty row above the `EDITING:` badge.
  - Moved `#btnSaveClient` and `#saveIndicator` into a new `.acb-actions` group inside `#activeClientBadge`, right-aligned next to the existing History button. The empty `.header-top` row is auto-collapsed by the existing `:has(> :only-child)` rule.
  - Added compact sizing for `.btn-save-client` inside the badge (3px 10px padding, 12px font, 12×12 icon) so Save pairs visually with the History button instead of towering over it.

### Fixed
- **fix(reminders): one-time tasks no longer revert to overdue after completion** (April 22, 2026):
  - `_getStatus()` in `js/reminders.js` only treated a task as "completed" if the last completion was on or after today's PST date. For `frequency: 'once'` tasks, that meant the badge flipped back to **Overdue** the day after you checked it off — they looked like daily-repeating tasks from the user's perspective.
  - Once tasks now stay `'completed'` forever as long as `task.completions` has any entry. `uncompleteTask()` still works (pops the completion; if empty, status falls back through the normal overdue/due-today logic).
  - Recurring task cycle logic (daily/weekdays/weekly/biweekly/monthly) is unchanged — completion still only counts for the current cycle.
  - Cleaned up the now-dead `if (task.frequency !== 'once')` guard around the cycle check since once tasks return early one line above.

### Changed
- **fix(quoter): always show System Updates card** (April 22, 2026):
  - Removed the `yrBuilt < 2000` gate that hid the heating/plumbing/electrical/roofing update selects in `plugins/quoting.html`. Carriers ask about these on newer homes too, and a silent miss on a post-2000 home meant blank values flowed through to the quote.
  - Deleted the `App.checkUpdates()` progressive-disclosure helper in `js/app-core.js` and its call sites in `js/app-core.js` (load) and `js/app-scan.js` (post-GIS autofill). The `oninput="App.checkUpdates()"` on `#yrBuilt` was also removed.
  - Section subtitle changed from "When were these systems last updated? (Home built before 2000)" to "When were these systems last updated?".

### Added
- **feat(quoter): prior-carrier policy status as underwriting risk flag** (April 22, 2026):
  - New `priorPolicyStatus` and `homePriorPolicyStatus` selects added to Auto Insurance History and Home Insurance History cards in `plugins/quoting.html`. Options: `Active / Renewed`, `Non-Renewed by Carrier`, `Cancelled by Carrier`, `Cancelled — Non-Payment`, `Cancelled by Insured`.
  - Registered in `js/fields.js` so values persist via `App.save()` and cloud-sync.
  - Added to the Coverage Gap AI prompt (`js/app-export-coverage-gap.js`) with explicit guidance that non-renewal / carrier-initiated cancellation is a high-severity placement risk that narrows the carrier pool.
  - Added to the Policy & Prior Insurance table in the PDF export (`js/app-export-pdf.js`) as `Home Status` / `Auto Status` rows.
  - Not wired to EZLynx or HawkSoft FSC — those schemas don't have a prior-cancellation field; this is PDF + AI-analysis only.

### Changed
- **style(intake): align HTML display labels with fields.js canonical labels** (April 22, 2026):
  - 19 display labels in `plugins/quoting.html` normalized to match the `label` strings in `js/fields.js` (the canonical source used by the PDF builder and HawkSoft FSC export). Agents typing into a field and then seeing the same string on the PDF/export was the goal — mixed wording was making them look like different fields.
  - **Changes** (all in `plugins/quoting.html`, HTML display only — no impact on export paths):
    - "Email Address" → "Email", "Phone Number" → "Phone" (primary applicant row)
    - "Education Level" → "Education" (primary + co-applicant)
    - "Number of Stories" / "Number of Occupants" / "Number of Fireplaces" → "Stories" / "Occupants" / "Fireplaces"
    - "Full Bathrooms" / "Half Bathrooms" → "Full Baths" / "Half Baths"
    - "Construction Style" / "Foundation Type" / "Cooling System" → "Construction" / "Foundation" / "Cooling"
    - "Heating Update" / "Plumbing Update" / "Electrical Update" → "Heating Updated" / "Plumbing Updated" / "Electrical Updated"
    - "Year Roof Updated" → "Roof Year"
    - "Home Purchase Date" → "Purchase Date"
    - "Additional Insured Parties" → "Additional Insureds"
    - "Increased Mold Damage" / "Increased Credit Card Coverage" → "Mold Damage" / "Credit Card Coverage"
    - "Dogs / Pets" → "Dogs"
  - **Not changed** (where HTML has extra context users need and fields.js is terser):
    - "Bodily Injury Limits (BI)" (fields.js: "BI Limits") — agents benefit from the full term
    - "Dwelling Coverage (Coverage A)", "Personal Property (Cov C)", "Loss of Use (Cov D)" — coverage-letter context matters
    - "Distance to Fire Station (Miles)" (fields.js: "Fire Station (mi)") — full unit helps
    - "Jewelry / Watches / Furs Limit" (fields.js: "Jewelry Limit") — broader coverage explanation
    - Co-applicant section labels use bare "First Name" / "Last Name" / etc. while fields.js prefixes them "Co-App First Name" — HTML context (section header "Co-Applicant Information") makes the prefix redundant, while fields.js prefix disambiguates on the PDF where the section header is smaller.
  - **Export paths verified unaffected:**
    - EZLynx: `python_backend/ezlynx_filler.py` matches against EZLynx's form labels (their text), not ours.
    - HawkSoft FSC: uses `FIELD_BY_ID[id].label` from fields.js (untouched) for note lines; structured tags key by id.
    - PDF: uses fields.js labels (untouched).
  - Tests: 31 suites / 1806 tests pass. Pure display text change, no behavior change.

- **fix(intake-ui): badge + dropdown + accordion consistency pass** (April 22, 2026):
  - **Active client badge** — removed `margin-left: auto` on the History button. The button was floating at the far right of the badge with a big empty gap between "unsaved changes" and itself, making the two look unrelated. Now it sits naturally right after the status text with the standard 8px flex gap.
  - **Empty-option placeholders normalized** to `"Select..."` where they were just visual placeholders:
    - `"--"` × 2 (prefix, suffix) → `"Select..."`
    - `"—"` × 4 (addrState, primaryHomeState, previousAddrState, garageSpaces) → `"Select..."`
    - **Preserved** `"None"` × 10 (semantic: "Pool: None" means no pool), `"Default"` × 3 (semantic: blank = carrier default), `"Same as All Perils"` × 2 (semantic), `"Select carrier..."` × 2 (meaningful prompt).
    - Now only `"Select..."` appears as a generic placeholder across the form — five UX conventions collapsed into one.
  - **Systems & Utilities accordion** — upgraded from plain `<summary>Systems & Utilities</summary>` to the rich `<h2>` + `.section-subtitle` pattern used by its five sibling accordions (Construction & Roof, Safety & Location, Home Risk Factors, Home Coverage, Home Endorsements). One-of-six outlier resolved. Subtitle: "Heating, cooling, plumbing, electrical, water heater."
  - Also merged the now-redundant outer `<div class="card">` into the `<details>` element (Safety & Location and other accordions already do this — Systems & Utilities was the inconsistent one).
  - Tests: 31 suites / 1806 tests pass (no new tests — pure HTML/CSS polish, no behavior change).

### Added
- **feat(security): decryption-recovery bucket (Phase 5, session 3b)** (April 21, 2026):
  - When `CryptoHelper.decrypt` returns null (key mismatch / corrupted ciphertext / device-bound-key drift), the app now **parks the ciphertext** in a new `altech_decryption_recovery` bucket instead of silently proceeding with an empty data object — which would let the next save overwrite the un-decryptable blob permanently. Ciphertext preserved = the user's path back if they ever recover the key.
  - Applies to both encrypted storage keys: `altech_v6` (the live form, in `App.load`) and `altech_v6_quotes` (drafts library, in `getQuotes`). Client history isn't encrypted so it's not affected.
  - `App._parkCiphertextForRecovery(originalKey, ciphertext, reason)` — appends to the bucket with `{originalKey, ciphertext, failedAt, reason}`. `RECOVERY_CAP = 20` with FIFO eviction; identical blobs dedupe so a blob failing on every reload doesn't fill the bucket with duplicates.
  - `App.getRecoveryBlobs()` — read the bucket (for debug inspection / future recovery UI). Call from console.
  - `App.clearRecoveryBlobs()` — irreversible purge, confirm-gated. For when the user has recovered what they wanted or accepted the loss.
  - New storage key: `STORAGE_KEYS.DECRYPTION_RECOVERY = 'altech_decryption_recovery'`. **Local-only — never cloud-synced.** Syncing recovery blobs back to the cloud would defeat the purpose (the point is that we *couldn't* decrypt; shipping the ciphertext anywhere else doesn't help and risks leaking it).
  - The `App.load` toast message is updated from "⚠️ Could not decrypt saved data. It may need to be re-entered." to "⚠️ Could not decrypt saved data. Ciphertext preserved in recovery bucket." — so the user knows their data isn't gone.
  - Tests: 31 suites / 1806 tests pass. Three new tests cover: blob is stored with correct metadata, identical blobs dedupe, `RECOVERY_CAP` FIFO eviction (push 25 → length = 20, newest wins).

- **feat(intake): per-client undo/history (Phase 5, session 3a)** (April 21, 2026):
  - Each quote record now keeps a rolling 5-snapshot history (`record.history: [{snapshotAt, data}]`). Snapshots are captured in `_saveActiveRecordNow` *before* overwriting the record, so "restore" means "undo the save I just did."
  - `HISTORY_CAP = 5`, `HISTORY_DEDUP_MS = 60_000` — snapshots within 60s of the previous one (or identical to it) are skipped so rapid typing doesn't fill history with near-duplicates. Roughly one snapshot per minute of active editing; 5 snapshots cover ~5 minutes of checkpoints.
  - New methods: `App._addHistorySnapshot(record, {force?})` (pure; force=true bypasses dedup for restore-is-undoable), `App._restoreSnapshot(index)` (pushes current as undo point, overwrites record, routes through `_switchToClient` to re-apply).
  - UI: new "⏮ History" button on the active-client badge opens a modal with the 5 entries (timestamp + fields-captured count). "Restore" button on each row with a confirm before overwriting.
  - CSS: `.acb-history-btn` + `.history-list` / `.history-row` classes in `css/layout.css`.
  - Tests: 31 suites / 1803 tests pass. Two new tests cover the history cap (push 8 snapshots → length stays at 5, most recent wins) and the 60s dedup guard (rapid duplicate push → length stays 1).

- **feat(intake): active client badge + dirty-state confirmation (Phase 5, session 2)** (April 21, 2026):
  - **Active Client Badge** — persistent "Editing: [Client Name] · saved / unsaved changes" strip below the header in the personal quoting form. Hidden when no active record (blank form state). Status flips in real time on input / save. Visual cue so the agent always knows which record their keystrokes are landing on — kills the Phase-5-session-1 residual-risk of "I thought this was a blank form but I was actually editing Alice's record."
  - **Dirty-state confirmation modal** — when `activeClientId` is set and `_dirty` is true, clicking Load on a different record (or Restore from Client History) pops a modal: "Unsaved changes to [Client] — Keep & Switch / Discard & Switch / Cancel." Keep-and-switch is the default (just saves to the record first, as session 1 already did); Discard-and-switch reverts the active record to its last-saved state before switching. Cancel does nothing. Clean records (no dirty edits) switch silently with no modal.
  - **beforeunload warning** — if the form is dirty and an active client is loaded, the browser's native "Leave site?" prompt fires on tab close / refresh / navigation. Keeps existing `_saveClientHistoryNow` flush on unload (best-effort).
  - New state: `App._dirty` — set true in `save(e)` on user input, cleared in `_saveActiveRecordNow` after write, cleared in `_switchToClient` after the new record is loaded.
  - New method: `App._updateActiveClientBadge()` — wired into `save()`, `_saveActiveRecordNow`, `_switchToClient`, and `applyData` so the badge always reflects current state with zero latency.
  - New method: `App._confirmSwitch(record)` — wraps `_switchToClient` with the dirty-state modal; all load paths (`loadQuote`, `loadClientFromHistory`) now route through it. Cancel / Discard / Keep decisions all observable via `App.activeClientId` post-call.
  - CSS: `.active-client-badge` + `.acb-*` classes in `css/layout.css`. Left-bordered in `--apple-blue`; clean status in `--success` green, dirty status in `#FF9500` orange (flagged `/* no var */` for the eventual design-token pass).
  - Tests: 31 suites / 1801 tests pass (baseline preserved; no new regression tests — session 2 is UX polish on top of session 1's already-regression-tested identity layer, JSDOM can't meaningfully test modals).

### Fixed
- **fix(client-isolation): active client identity + clean DOM on load + save-back-to-record (Phase 5, session 1)** (April 21, 2026):
  - Three real data-loss bugs gone in one pass:
    1. **DOM carryover**: `App.applyData()` only iterated over keys in the incoming record, so loading Client B left Client A's residual input values in the DOM. Next keystroke write them back into Client B. Root fix: every load now routes through new `App._switchToClient(record)` which does a full DOM reset *before* calling `applyData`. No more contamination.
    2. **Lost edits on switch**: `loadQuote(B)` replaced `App.data` with B's content and wrote `altech_v6`, orphaning A's pending edits. Now `_switchToClient` calls `_saveActiveRecordNow()` first, flushing the live form back to A's quote record before B takes over. Pending debounced save waits out before DOM reset.
    3. **Name-keyed pick-one "merge"**: `autoSaveClient()` had a 50-line block that matched entries by full-name (case-insensitive), then kept whichever had more filled fields and discarded the other. Two different John Smiths silently collapsed. Entering partial data for an existing client silently kept the old fuller record and threw away the new edits. Completely rewritten to key by `_clientId` — 15 lines, no name matching, no pick-one.
  - New state: `App.activeClientId` — wrapper id of the record being edited. Single source of truth. Set by `applyData` from `data._clientId`; cleared on `startFresh` / `startNewClient`. `_switchPromise` serializes rapid load clicks so two switches can't interleave.
  - New schema v3 migration stamps `_clientId` onto existing `altech_v6` blobs with a `crypto.randomUUID()`. `getQuotes()` and `getClientHistory()` also stamp legacy entries (`data._clientId = wrapper.id`) on read, in-memory, so identity-based lookups work on pre-Phase-5 records. Nothing destructive; existing ids preserved.
  - Save-back-to-record wired into `_saveClientHistoryNow` — fires on navigation, beforeunload, and explicit save. Every "important moment" propagates live edits to the record the user loaded from, so edits never strand in `altech_v6` alone.
  - Existing IDs generated via `${Date.now()}_${random.slice(2,8)}` still work; new IDs use `crypto.randomUUID()`.
  - `saveQuote()` now updates in place when `activeClientId` matches an existing quote. No duplicate-address warning for updates. Save button during an edit never forks identity.
  - `duplicateQuote()` strips `_clientId` from the copied data and routes through `_switchToClient({id: null, data})` so the next save creates a new record rather than overwriting the source.
  - Cleanup #10 — deleted the 50-line name-keyed dedup block from `autoSaveClient` and the orphaned `_countFilledFields` helper.
  - Cleanup #11 — deleted `_showIntakeSessionDialog` (always returned `'continue'`) and `_saveCurrentAsDraft`, plus the 25-line dead `if/else` branch in `app-navigation.js:464-487` that dispatched on the dialog's unreachable return values. `navigateTo('quoting')` is now 3 lines.
  - Cleanup #12 — `startNewDraft()` no longer calls `location.reload()`. Uses `_switchToClient(null)` + targeted localStorage clear. In-place, no full page rebuild.
  - `startFresh()` and `startNewClient()` also route through `_switchToClient(null)`, gaining the prior-record-flush guarantee they didn't have before.
  - Tests: **31 suites / 1801 tests pass** (was 1797 — four new regression tests cover: `loadQuote` sets `activeClientId`, `loadQuote` stamps `_clientId` into data, `getQuotes` stamps legacy records on read, A→B→A round-trip preserves each client's edits independently with no cross-contamination).

### Changed
- **feat(pdf): uniform PDF template — every field renders regardless of data** (April 21, 2026):
  - Rewrote `kvRow` in `js/app-export-pdf.js` to stop filtering empty cells. Every field in a kvRow block now prints on the PDF, with blanks rendered as an em-dash (`—`) in MID grey + normal weight so they recede visually. Real values stay INK + bold so they stand out.
  - The PDF template is now uniform across the three workflows (home-only / auto-only / both) — same sections, same field order, same row count within each subsection. An agent can scan a sparse PDF and see exactly which fields weren't captured without hunting for gaps.
  - Section-level conditionals preserved: co-applicant still only renders when `hasCoApplicant === 'yes'`, previous-address row still only renders when `prevAddr` is set, `showHome` / `showAuto` branches still skip entire insurance sections when the client isn't buying that line. Those are "does this apply to this client" decisions, not "did we capture the data" decisions.
  - Risk Items block's `_riskDisplay` helper preserved — hazards still canonicalize to `'None'` rather than `—`, because an unanswered pool/trampoline/wood-stove question is a different semantic from an unanswered plumbing material.
  - Driver/vehicle cards untouched — per-entity cards are already uniform per-card and the filtered-by-driver behavior is what you want when one driver has SR-22 and another doesn't.
  - Tests: 31 suites / 1797 tests pass (baseline preserved).

### Added
- **feat(intake): plumbing material + electrical panel + water heater fields** (April 21, 2026):
  - Five new PDF-only fields in the Systems & Utilities section of the personal quoting form, filling gaps that matter for carrier risk decisions but aren't exposed by EZLynx's universal rater:
    - `plumbingMaterial` — Copper / PEX / CPVC / PVC / Galvanized Steel / Polybutylene / Cast Iron / Mixed / Unknown. Polybutylene is a carrier-decline flag; galvanized signals leak risk.
    - `electricalPanel` — Standard Breaker / Federal Pacific (FPE) / Zinsco / Pushmatic / Fuse Box / Other. FPE, Zinsco, and fuse boxes are common carrier declines, labeled accordingly in the dropdown.
    - `electricalAmps` — 60 / 100 / 150 / 200 / 400 / Unknown. 60A often flags.
    - `waterHeaterAge` — numeric input (years). 10+ yrs = leak risk.
    - `waterHeaterLocation` — Basement / Garage / Closet / Attic / Crawl Space / Utility Room / Other. Attic placement is a carrier concern, labeled.
  - All five added to `js/fields.js` (section `'systems'`, no `ezlynxRequired` flag since they're not in the universal rater), to the Systems & Utilities accordion in `plugins/quoting.html`, and to the Building Systems row of `js/app-export-pdf.js` so they print on the PDF summary.
  - Not wired to EZLynx XML fill (`js/ezlynx-tool.js`) or HawkSoft FSC export — the universal rater doesn't expose these fields, so they're reference data the agent uses when filling the carrier-specific portion of the quote.
  - Tests: 31 suites / 1797 tests pass (baseline preserved).

### Changed
- **refactor: monolith decomposition (Phase 4 — app-export)** (April 21, 2026):
  - `js/app-export.js` 1337 → 127 lines. The three remaining big concerns extracted into Object.assign siblings:
    - `js/app-export-pdf.js` 749 — `exportPDF()` + `buildPDF(data)` (the ~735-line toner-friendly PDF builder: header/footer, section labels, 2-col kvRow, driver/vehicle cards, street-view + satellite photos, risk flags).
    - `js/app-export-csv.js` 178 — `exportCSV`, `buildCSV`, `getCSVHeaders`, `downloadCSVTemplate`, `openBatchImport`, `handleBatchImport`, `parseCSV`, `mapCsvRowToData`.
    - `js/app-export-coverage-gap.js` 284 — `runCoverageGapAnalysis` (AI coverage-gap prompt builder, Anthropic-preferred with Gemini fallback) + `_renderCoverageGapResults`.
  - Residual `app-export.js`: `exportText`, `buildText`, `_getScanSystemPrompt`, `_getScanSchema`. The two scan helpers are called only by `app-scan.js`; left in place this pass to keep the scope tight — flagged as future move.
  - Removed dead `_escapeAttr(str)` method (old compat bridge; all real call sites use `Utils.escapeAttr()` directly since the March 2026 sweep).
  - `index.html`: registered the three new shards between `app-export.js` and `app-export-cmsmtf.js`. `app-boot.js` still loads last.
  - `sw.js`: added the three new shards to `APP_SHELL`, bumped `CACHE_VERSION` `altech-v13` → `altech-v14` so clients re-prime the precache.
  - Tests: 31 suites / 1797 tests pass (baseline preserved).

- **refactor: monolith decomposition (Phase 3)** (April 21, 2026):
  - `api/property-intelligence.js` 2402 → 77 lines (thin router). Extracted into 11 focused helpers: `_property-arcgis.js` (parcel + flood), `_property-flood.js`, `_property-mapping.js` (HEATING/COOLING/ROOF/FOUNDATION/CONSTRUCTION/EXTERIOR maps + mapZillowToAltech), `_property-rentcast.js`, `_property-apify.js`, `_property-zillow.js` (tiered Rentcast → Apify → Gemini), `_property-satellite.js`, `_property-firestation.js`, `_property-listing.js`, `_property-address-validate.js`, `_property-shared.js`.
  - `api/prospect-lookup.js` 1792 → 68 lines (thin router). Extracted into 7 per-source helpers: `_prospect-li.js` (WA L&I), `_prospect-or-ccb.js` (Oregon CCB), `_prospect-sos.js` (WA/OR/AZ SOS + WA DOR fallback + legacy HTML parsers), `_prospect-osha.js`, `_prospect-sam.js`, `_prospect-places.js` (Google Places + state/city extractors), `_prospect-ai-analysis.js` (AI dossier + buildDataContext).
  - `css/components.css` 2608 → 11 focused files: `components-cards.css`, `components-inputs.css`, `components-quote-library.css`, `components-buttons.css`, `components-forms.css`, `components-modals.css`, `components-toasts.css`, `components-loading.css`, `components-misc.css`, `components-acord.css`, `components-pwa.css`. Load order preserved in `index.html`.
  - `css/compliance.css` 1585 → 3 files: `compliance-main.css`, `compliance-print-dark.css`, `compliance-responsive.css`.
  - `css/intake-assist.css` 1534 → 4 files: `intake-assist-chat.css`, `intake-assist-sidebar.css`, `intake-assist-features.css`, `intake-assist-polish.css`.
  - `js/app-popups.js` 1452 → 861 + `app-popups-history.js` 597 (property history / market / insurance trends / timeline popups).
  - `js/app-export.js` 1634 → 1337 + `app-export-cmsmtf.js` 303 (HawkSoft CMSMTF tagged-file export).
  - `js/app-scan.js` 2152 → 1927 + `app-scan-doc-intel.js` 231 (document intelligence analyze/render/apply/persist).
  - `js/compliance-dashboard.js` 2929 → 2831 + `compliance-idb.js` 106 (IndexedDB wrapper moved to `window.CglIDB`).
  - `tests/helpers/css-loader.js` — new shared helper with `readComponentsCss()`, `readComplianceCss()`, `readIntakeAssistCss()` that aggregate the split shards for tests that grep CSS by logical group.
  - `tests/api-property.test.js`, `tests/api-prospect.test.js`, `tests/prospect-client.test.js`, `tests/ai-router.test.js`, `tests/plugin-integration.test.js`, `tests/layout-regressions.test.js`, `tests/intake-assist.test.js` — updated to read from the new file layout.
  - `@ast-grep/cli` added as a devDependency for future syntactically-aware splits.
  - Tests: 31 suites / 1797 tests pass (baseline preserved).
  - **Unchanged (future work):** `js/intake-assist.js` (3111), `js/app-property.js` (2620), `js/prospect.js` (2302), `js/app-core.js` (2209), `js/hawksoft-export.js` (1784), `js/dashboard-widgets.js` (1417) — these are IIFE-heavy or Object.assign closures where helper extraction requires call-site surgery; deferred so the editor-navigability win from the files above lands cleanly.

### Added
- **feat(security): Path B Phase 3 Supabase Auth + mandatory TOTP MFA** (April 18, 2026):
  - `js/supabase-auth.js` — `window.SupabaseAuth`, mirror of the slice of `js/auth.js` that downstream code depends on, but talking to Supabase Auth (email + password + TOTP MFA). Dormant unless `SYNC_BACKEND=supabase`. Public surface: `init()`, `signIn`, `signUp`, `sendPasswordReset`, `logout`, `uid` / `email` / `isSignedIn` / `isAdmin` / `isBlocked` getters, `apiFetch` (injects `Authorization: Bearer <access_token>`), `addAuthListener` / `removeAuthListener`, `enrollTOTP` / `verifyTOTP` / `unenrollTOTP`, `mfaRequired` / `mfaEnforcementLevel` / `recordMfaDismiss`. Admin + block flags read from `app_metadata` (service-role-managed), not `user_metadata` (client-writable via `auth.updateUser`). Verified-TOTP cache refreshes on every `onAuthStateChange`.
  - `js/auth-mfa-ui.js` — `window.AuthMFAUI`, driver for the new `#mfaEnrollOverlay` modal in `index.html`. Renders the SVG QR code returned by `enrollTOTP()`, handles the 6-digit verify form (runs `challenge → verify`), toasts success, and kicks `Sync.schedulePush` now that the MFA gate has cleared. Two modes: **soft** (shows "Set up later" button, bumps `user_metadata.mfa_dismiss_count` on dismiss, stamps `mfa_first_prompt_at` on first prompt), **hard** (close and dismiss buttons hidden). Hard flips on after 3 dismissals **or** 14 days since first prompt, whichever comes first.
  - `js/sync-facade.js` — adds a companion `window.AuthFacade` that routes `signIn` / `signUp` / `sendPasswordReset` / `logout` / `apiFetch` / `onAuthStateChange` / `uid` / `email` / `isSignedIn` / `isAdmin` / `isBlocked` based on `STORAGE_KEYS.SYNC_BACKEND`, plus an `mfaBlocksSync()` gate on every write method (`schedulePush`, `pushToCloud`, `fullSync`, `pushBlob`, `pushQuote`, `deleteBlob`, `deleteQuote`). Reads (`pullBlob`, `pullQuote`, `listQuotes`, `pullFromCloud`) are intentionally ungated — Phase 4's migration pull must still run for an MFA-unenrolled user. Gated methods short-circuit with `{ ok: false, skipped: 'mfa-required' }`; `schedulePush` returns `undefined`. Firebase backend is inert.
  - `js/auth.js` — `login` / `signup` / `resetPassword` / `logout` now delegate to `SupabaseAuth` when the flag is on; on successful auth, if `mfaRequired()` is true, opens `AuthMFAUI.openEnroll({ hard: mfaEnforcementLevel() === 'hard' })` so the user cannot close the login modal until a TOTP factor is verified. Friendly error mapping for the common Supabase failure modes (`Invalid login credentials`, `Email not confirmed`, `User already registered`, rate-limit, network). Firebase paths are untouched after the early-return.
  - `js/app-boot.js` — fires a non-blocking `SupabaseAuth.init()` alongside the existing Firebase `Auth.init()` so the flag-check at modal-submit time sees a wired-up Supabase client.
  - `js/admin-panel.js` — when `SYNC_BACKEND=supabase`, routes `/api/admin-supabase?action=list|update` with the Supabase access token instead of the Firebase ID token. `_renderUserCard` resolves "this is you" from the active auth backend. Legacy `/api/admin` + Firebase path is untouched.
  - `api/admin-supabase.js` — new serverless endpoint (mirrors `api/admin.js`). Uses two separate Supabase clients per request: an **anon-keyed client bound to the caller's access token** for identity verification (reads `app_metadata.is_admin` via RLS-respecting `getUser`), and a **service-role client** used ONLY after the caller is confirmed as an admin, ONLY to `auth.admin.listUsers` and `auth.admin.updateUserById`. `SUPABASE_SERVICE_ROLE_KEY` is a server-only secret; never returned to the browser. Whitelisted patch surface (`is_admin`, `is_blocked` only); blocks self-block / self-demote; merges into existing `app_metadata` rather than overwriting.
  - `index.html` — new `#mfaEnrollOverlay` modal markup (QR + secret + 6-digit input + verify/dismiss buttons) and five new `<script>` tags in correct load order: `supabase-config.js`, `supabase-sync.js`, `supabase-auth.js`, `auth-mfa-ui.js`, `sync-facade.js` (the facade must come after both auth backends so `AuthFacade.active` can resolve either).
  - `tests/supabase-auth.test.js` — 18 tests against an in-memory mock of `supabase.client` that implements the auth + MFA surface: `signUp` / `signInWithPassword` / `signOut` / `resetPasswordForEmail` / `getSession` / `getUser` / `updateUser` / `onAuthStateChange` / `mfa.enroll|challenge|verify|unenroll|listFactors`. Asserts signUp/signIn/logout round-trips flip `isSignedIn`, bad-password throws, session persists across listener fires, `apiFetch` injects the bearer and preserves caller headers, `mfaRequired` is false without a user / true for fresh cloud-sync users / false after `verifyTOTP` / still true for unverified factor, hard-enforcement trips after 3 dismissals, `CLOUD_SYNC_DISABLED=true` exempts the user, `isAdmin` / `isBlocked` read from `app_metadata` (service-role flips), and cross-user `pullBlob` from Phase 2 still returns null post-login.
  - `tests/mfa-enforcement.test.js` — 9 tests against the facade-level gate. Confirms `Sync.schedulePush` is a no-op when MFA is required (no rows written even after the 3 s debounce), every write method short-circuits with `{ skipped: 'mfa-required' }`, reads (`pullBlob`, `pullQuote`, `listQuotes`) are NOT gated, the write path flows through once `verifyTOTP` succeeds, opt-out users (`CLOUD_SYNC_DISABLED=true`) sweep as usual, and the Firebase backend is inert.
  - `tests/plugin-integration.test.js` — serverless function count assertion widened from the old Hobby limit (≤13) to a generous Pro budget (≤50). Project moved to Vercel Pro in April 2026 (ceiling ~1000); `api/admin-supabase.js` brings the current count to 14.
  - Tests: 31 suites / 1797 tests pass.
  - **Not yet wired:** no production user is on the Supabase auth path — `SYNC_BACKEND` stays `'firebase'` for everyone until Phase 4 ships the migration modal. DPAs are deferred until the weekend; MFA cannot be enforced for real users until that's signed.

- **feat(security): Path B Phase 2 Supabase sync client** (April 18, 2026):
  - `js/supabase-sync.js` — `window.SupabaseSync`, ciphertext-only mirror of the slice of `cloud-sync.js` that the `SYNC_BACKEND=supabase` flag activates. Never decrypts, never inspects payload structure; every blob is pushed and pulled as an opaque string. Public API: `pushBlob(docKey, ciphertext, updatedAt?)` / `pullBlob(docKey)` / `deleteBlob(docKey)` against `user_blobs`; `pushQuote(id?, ciphertext)` / `pullQuote(id)` / `listQuotes()` / `deleteQuote(id)` against `user_quotes`; `schedulePush()` (3-second debounce sweep of a frozen `DOC_LOCAL_KEYS` map that mirrors `cloud-sync.js`'s `_getLocalData()`). Every method is a no-op when the flag is not `'supabase'` — Firebase remains the default backend until the Phase 4 migration.
  - `js/sync-facade.js` — `window.Sync`, tiny router shim that forwards `schedulePush` / `pushToCloud` / `pullFromCloud` / `fullSync` / `refreshUI` / `deleteCloudData` to either `CloudSync` (default) or `SupabaseSync` based on `STORAGE_KEYS.SYNC_BACKEND`. Supabase-only methods (`pushBlob`, `pullBlob`, `pushQuote`, etc.) resolve to safe defaults when the Firebase backend is active. Ready for Phase 4 to migrate call sites off `CloudSync.xxx`; existing call sites continue to work unchanged.
  - `js/storage-keys.js` — adds `SYNC_BACKEND` (feature flag, default `'firebase'`) and `SYNC_META_SUPABASE` (reserved for per-doc lastPushedAt tracking).
  - `js/cloud-sync.js` — exposes `CloudSync.SYNC_DOCS` (frozen copy) so both backends sweep the same doc set. No other changes; Firebase path is identical.
  - `index.html` — adds the `@supabase/supabase-js@2.45.4` UMD tag after the Firebase CDN scripts, then `supabase-config.js` → `supabase-sync.js` → `sync-facade.js` after `cloud-sync.js` per the load-order matrix in `AGENTS.md §8.4`. `js/supabase-config.js` (dormant since Phase 0) now boots whenever `SYNC_BACKEND=supabase` is set.
  - `tests/supabase-sync.test.js` — 14 tests against an in-memory mock of `supabase.client` that enforces RLS by filtering every operation on the authenticated user id. Covers: round-trip ciphertext is byte-identical, cross-user pull returns `null` (not error), every method is a no-op under the default flag, quote CRUD upsert/list/delete, and `schedulePush()` sweep correctly pushes every seeded `DOC_LOCAL_KEYS` entry.
  - Tests: 29 suites / 1770 tests pass.
  - **Not yet wired:** no existing call site is migrated to `window.Sync`. The facade is ready; Phase 4 will migrate `App.save` / `App.load` / `saveAsQuote` / `Auth.pullFromCloud` once the Supabase migration modal flips the flag.

- **feat(security): Path B Phase 2 scaffolding** (April 18, 2026):
  - `db/migrations/0003_agency_sharing.sql` — future-proofs the Supabase schema for multi-user agency sharing before production rows exist:
    - Adds `public_key`, `wrapped_private_key`, `keypair_algorithm`, `keypair_created_at` columns to `user_crypto_meta` so each user can hold a long-term wrapping keypair (private half encrypted under their master key).
    - New tables: `agencies` (owner + `key_version` for rotation), `agency_members` (role-based, soft-delete via `revoked_at`), `agency_key_wraps` (per-member wrapped AGENCY_KEY, one row per key version), `agency_blobs` (shared ciphertext, mirrors `user_blobs` shape).
    - `is_agency_member()` / `is_agency_admin()` SECURITY DEFINER helpers to keep RLS policies out of recursion.
    - Full RLS: blobs visible to members, writable by members, deletable by admins only; members see other members of their agencies; key wraps readable only by their owner; no client-side INSERT on `agencies` (must go through server-side function in Phase 2.5).
    - Extends `audit_log.event_type` with `keypair_generated`, `agency_created`, `agency_member_invited|joined|revoked`, `agency_key_rotated`, `agency_role_changed`.
    - No application code ships against these tables yet — pure schema foresight so no second migration is needed after users exist.
  - `api/config.js` — new `GET /api/config?type=supabase-public` branch returns `{ url, anonKey }` from `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars with a 5-minute cache and a defense-in-depth check that rejects any value whose JWT payload claims `role: service_role`. Unlocks `js/supabase-config.js` (shipped Phase 0) to actually come online once the Vercel env vars are set.

### Changed
- **refactor(fields): decouple DOM ids from App.data storage keys** (April 18, 2026):
  - Adds optional `storageKey` to every entry in `js/fields.js`; defaults to `id`. Fields renamed in the DOM can now pin their `storageKey` to the original value instead of requiring a `_migrateSchema()` pass.
  - New `window.FIELD_BY_STORAGE_KEY` map and `window.FieldMap` helpers (`storageKeyForElement(el)`, `domIdForStorageKey(key)`) so no call site has to write `field.storageKey || field.id` itself.
  - `App.save()` and `App.applyData()` route through `FieldMap` instead of using `e.target.id` / `document.getElementById(k)` directly. Behavior is identical today (every field has `storageKey === id`); the machinery is in place for the first legitimate rename.
  - Tests: all 28 suites / 1756 tests pass.

- **chore(ux): pre-review cleanup pass** (April 18, 2026):
  - **Removed three hidden plugins entirely** — Policy Q&A (`qna`), COI Generator (`coi`), Blind Spot Brief (`blindspot`). All source, HTML, plugin containers, service worker cache entries, `storage-keys.js` entries, `dashboard-widgets.js` icon mappings, admin-button code, `data-backup.js` keyboard shortcuts, dead CSS (`css/components.css`, `css/layout.css`, `css/animations.css`), and test coverage in `plugin-integration.test.js` / `app.test.js` / `layout-regressions.test.js` deleted.
  - **De-AI'd user-facing copy** to functional, professional names. Code, file names (`ai-provider.js`, `_ai-router.js`), function names (`AIProvider`), element IDs, API env vars, and acronyms (NAIC, NAICS, AIC, etc.) untouched:
    - Intake Assist: header "AI Intake" → "Quote Bot"; drop-overlay copy rewritten; 🤖 → ✨.
    - Quoting: "AI Coverage Analysis" → "Coverage Gap Analysis"; "🧠 Analyze Coverage Gaps" → "Analyze Coverage Gaps"; "Search listing details via AI" tooltip → "Fetch listing details".
    - Prospect Intel: "AI-Powered Commercial Intelligence" → "Commercial Intelligence"; "AI Underwriting Analysis" → "Underwriting Analysis"; dynamic `${_aiLabel()}-powered…` subtitle collapsed to "Risk intelligence with web research"; removed the `🧠 Gemini AI` provider chip in favor of a neutral `📊 Analysis` chip; "AI analysis unavailable" → "Analysis unavailable"; SOS paste modal copy.
    - Commercial Quoter: "🧠 AI Recommended Coverages" → "Recommended Coverages".
    - Email Composer: "Customize AI Persona" → "Customize Tone & Style"; placeholder rewritten; "AI prompt saved"/"AI generation failed" toasts.
    - Call Logger: "Format with AI" → "Format Notes".
    - Property lookup: "AI Search" data source → "Web Search"; "Use AI only" → "Use Web Search only"; "Searching property records via AI…" → "Searching property records…".
    - Paywall, scan errors, endorsement-parser error messages, onboarding "Email Composer AI persona" hint, intake assistant welcome.
  - **Settings "🤖 AI Model" → "✨ Smart Features"** with the provider/model picker, cost estimates, and model-info card moved behind an "Advanced" disclosure so the default view just shows an API-key row.
  - **Removed hardcoded demo emails** (`sarah.mitchell@example.com`, `david.mitchell@example.com`, `jordan.reed@example.com`) from `js/app-core.js`, `js/app-scan.js`, `js/ezlynx-tool.js`. Sample data now reads "Sample Client" / "demo@example.com" so it's unmistakably fake.
  - **🧪 Load demo data button** is now gated behind `localStorage.altech_debug = 'true'`. Added a `body.debug-mode` class toggle in `js/app-init.js`; `.debug-only` CSS utility + `#demoClientRow` override in `css/components.css`.
  - **Navigation information-architecture refresh** in `js/app-init.js` + `js/dashboard-widgets.js`:
    - Categories renamed for clarity: `quoting` → `intake`, `docs` → `compliance`, `ops` → `workflow`, `tools` → `beta`.
    - Sidebar labels: "Intake & Quoting", "Export", "Compliance", "Workflow Tools", "In Development".
    - `returnedmail` promoted from `tools` → `compliance` (it's usable, not WIP).
    - Reconciled `title` vs `name` inconsistencies so each tool has one label: "Personal Intake", "Commercial Intake", "Prospect Intel", "CGL Compliance", "Reminders", "Carrier Match", "Returned Mail".
    - HawkSoft Logger icon changed from `📋` (duplicate of the now-removed COI icon) to `📞`.
  - **BETA pill** — new `beta: true` flag on `toolConfig` entries renders a sidebar pill (`.sidebar-beta-pill`) and dims the parent group. Currently applied to Quote Bot and Carrier Match. CSS in `css/sidebar.css`.
  - **Admin sidebar button removed** — the lock-icon shortcut only routed to the now-deleted Blind Spot Brief tool. `_updateAdminButton()` deleted from `js/dashboard-widgets.js`.
  - Tests: 28 suites / 1756 tests pass (was 1772 — drop reflects removed Q&A / COI / Blind-Spot test coverage).

- **feat(security): Path B Phase 1c — vault UI flows (dormant behind flag)** (April 17, 2026):
  - Four end-to-end encryption modals, all opt-in behind `E2E_CRYPTO_V2`. Zero user-facing change until a user flips the flag.
  - **Onboarding** — two-step modal: (1) set passphrase + confirm, (2) auto-generated recovery key shown in monospace + Download .txt + Copy + "I saved this" checkbox. Saves wrapped MK + recovery wrap to `VaultMeta` persistence.
  - **Unlock** — passphrase prompt; wrong pass shows error; "Forgot passphrase? Use recovery key →" link flips to recovery flow.
  - **Change passphrase** — requires current passphrase, re-wraps MK under new KEK. Data blobs untouched.
  - **Recovery** — two-step: (1) paste recovery key → unlock, (2) set new passphrase. Uses `rewrapWithPassphrase()` so we don't need the old passphrase to complete the reset.
  - **Auto-prompt on load** — `app-boot.js` calls `VaultUI.maybePromptUnlockOnLoad()`. When v2 is enabled, vault exists, and MK isn't in memory, the unlock modal fires before the user can touch encrypted data.
  - **Settings row** — new "End-to-end encryption" section in Account → Sync. State-aware: shows Enable / Unlock / Lock depending on current state, with Change / Recovery / Turn Off secondary buttons when on.
  - Files:
    - `js/vault-meta.js` (new, ~85 lines) — persistence abstraction (localStorage stub; Phase 2 will swap in Supabase).
    - `js/vault-ui.js` (new, ~340 lines) — modal controllers.
    - `css/vault.css` (new, ~100 lines) — reuses `.auth-modal-*` for sizing, adds vault-specific styles (recovery box, checkbox row, settings row).
    - `index.html` — 4 new `.auth-modal-overlay` blocks; script + stylesheet tags; E2E row inside the existing Account → Sync section.
    - `js/crypto-helper.js` — refined: MK now imported with `extractable=true` so rotations can re-wrap without re-entering the old passphrase; `changePassphrase` verifies then delegates to `rewrapWithPassphrase`; `wrapWithRecoveryKey` now requires an unlocked vault and uses in-memory MK directly.
    - `js/auth.js` — `Auth.showModal()` calls `VaultUI.refreshSettingsRow()` when the account view opens.
    - `js/app-boot.js` — adds `VaultUI.maybePromptUnlockOnLoad()` to the onload sequence.
    - `js/storage-keys.js` — adds `VAULT_LOCAL_META` key.
  - Verified end-to-end in the preview (26/26 assertions): modules load → onboarding step 1 → step 2 with recovery key visible → step 2 submit writes to VaultMeta + flips flag → v2 encrypt/decrypt round-trip → lock → unlock modal wrong-pass shows error → right-pass unlocks → old ciphertext still decrypts → change modal → old pass rejected / new pass works post-change → original data still decrypts (proving MK preserved) → recovery flow: paste key → unlock → new passphrase → lock → new post-recovery pass works → clean teardown.
  - Tests: 28 suites / 1772 tests pass.

- **feat(security): Path B Phase 1b — master-key + recovery key (dormant behind flag)** (April 17, 2026):
  - Refactors the v2 crypto path from "passphrase derives the data key directly" to a proper **master-key / wrapping** model. Changing a passphrase now re-wraps the master key (cheap, ~1 op) instead of re-encrypting every data blob. Enables recovery keys that work independently of the passphrase.
  - `db/migrations/0002_wrapped_master_keys.sql` (new) — adds `passphrase_wrapped_mk`, `recovery_salt`, `recovery_iterations`, `recovery_wrapped_mk` columns to `user_crypto_meta`. Check constraint enforces that recovery_salt and recovery_wrapped_mk exist as a pair.
  - `js/crypto-helper.js` — v2 API refactored:
    - Removed `setPassphrase`, `verifyPassphrase` (had no external callers yet).
    - New: `createVault(passphrase, iter)` — generates MK, wraps under passphrase KEK, returns server blobs, unlocks immediately.
    - New: `unlockVault(serverMeta, passphrase)` — unwraps MK, caches. Returns true/false.
    - New: `changePassphrase(currentServerMeta, currentPass, newPass, iter)` — re-wraps MK under new KEK. Data untouched.
    - New: `generateRecoveryKey()` — returns `{ display, bytes }`. 32 random bytes, hex-formatted as 4 groups of 16 (example: `A3F5E72D9C018B44-…-4DE28B1F95C063AA`, 67 chars).
    - New: `parseRecoveryKey(str)` / `formatRecoveryKey(bytes)` — tolerant of whitespace + case.
    - New: `wrapWithRecoveryKey(bytes, currentServerMeta, currentPass, iter)` — attaches a recovery key by re-unlocking then wrapping MK under the recovery KEK.
    - New: `unlockVaultWithRecoveryKey(serverMeta, recoveryKeyDisplay)` — recovery path; returns true on success.
    - `encrypt`/`decrypt`/`generateUUID` unchanged (public API stable).
  - End-to-end verification in the preview (20/20 assertions): v1 legacy round-trip still works; createVault → encrypt/decrypt → lock → wrong-pass rejected → right-pass unlocks → data still reads → changePassphrase → old pass rejected → new pass unlocks → **data blobs still decrypt (proving MK stayed put)** → recovery key generated (67 chars, 3 hyphens) → parse round-trip tolerant of case+whitespace → wrapWithRecoveryKey produces new server blob → lock → unlockVaultWithRecoveryKey works → wrong recovery key rejected → malformed key rejected gracefully → cleanup.
  - PBKDF2 benchmark: 50k iter → 19 ms. Production 600k iter projects to ~230 ms per unlock. Acceptable for once-per-session.
  - Tests: 28 suites / 1772 tests pass.

- **feat(security): Path B Phase 1a — passphrase-derived crypto (dormant behind flag)** (April 17, 2026):
  - Adds a second key-derivation path to `js/crypto-helper.js` that runs alongside the existing device-bound v1 path. v2 is OFF by default and every caller keeps working unchanged — this commit ships zero behavior change.
  - `js/storage-keys.js` — new `E2E_CRYPTO_V2` flag key and `PASSPHRASE_SALT` key. Both local-only.
  - `js/crypto-helper.js` rewritten as an IIFE returning a fuller API surface:
    - Public (unchanged): `encrypt`, `decrypt`, `generateUUID`.
    - New: `enableV2` / `disableV2`, `isV2Enabled` / `isV2Unlocked`, `createPassphraseSalt` / `setLocalSalt` / `getLocalSalt`, `setPassphrase`, `verifyPassphrase`, `lock`, `decryptWithV1`, `encryptWithV2`, and `_internals` (tests only).
  - v2 path uses PBKDF2-600k SHA-256 (OWASP 2023 recommendation, up from 100k on v1). Key caches in memory; cleared on `lock()` or `disableV2()`.
  - **Safety guarantee:** when v2 is enabled but locked, `encrypt()` throws `CRYPTO_LOCKED` instead of silently writing data the user can't read back after unlock. `decrypt()` still falls through to v1 so legacy records remain readable during the migration window.
  - Added v1 key caching (same derivation as before, but no longer re-running PBKDF2-100k on every save). Free perf win even without enabling v2.
  - Verified end-to-end in the preview: legacy round-trip works; v2 enable → salt → encrypt-locked throws → setPassphrase → encrypt-unlocked round-trip works → lock → encrypt throws again → verifyPassphrase(wrong) = false → verifyPassphrase(right) = true → clean teardown.
  - Tests: 28 suites / 1772 tests pass (no test-side changes; public API preserved).

- **feat(security): Path B Phase 0 — Supabase scaffolding + WISP + IR plan** (April 17, 2026):
  - Decisions locked: new dedicated Altech Supabase project, Supabase Auth (one-shot migration from Firebase), separate passphrase with mandatory recovery-key export, one-shot Saturday cutover, 5 users total.
  - `db/migrations/0001_initial_schema.sql` (new) — full schema for Path B: `user_blobs` (E2E-encrypted key-value), `user_quotes` (indexed quote list), `user_crypto_meta` (PBKDF2 salt + recovery-key hash), `audit_log` (append-only). RLS policies on every table. `updated_at` triggers. Size constraints on ciphertext.
  - `js/supabase-config.js` (new) — dormant client bootstrap. Exposes `window.Supabase.{ isReady, client, init() }`. No `<script>` tag in `index.html` yet — added in Phase 2 when the new sync path is ready. Safe to deploy; has no effect on current app behavior.
  - `docs/WISP.md` (new) — written information security program naming Austin Kays as the Qualified Individual. Covers all 12 FTC Safeguards Rule (2023) requirements with an appendix mapping each requirement to the controlling section. This is the document the boss will actually read.
  - `docs/incident-response.md` (new) — six-phase runbook: detect, contain, assess, notify, remediate, post-mortem. WA OIC 72-hour notification contact; WA AG and E&O carrier notification criteria. Annual tabletop exercise cadence.
  - `docs/PATH_B_IMPLEMENTATION.md` — Phase 0 tasks marked complete (code side) with remaining manual steps (create Supabase project, apply migration, set env vars, sign DPAs) called out as YOU-prefixed action items.
  - Tests: 28 suites / 1772 tests pass (no test changes needed — all new files).

- **feat(privacy): cloud-sync opt-out toggle + sign-in data-handling notice** (April 17, 2026):
  - Path A fallback while full end-to-end encryption (Path B on Supabase) is being built. Lets any user run the app as a local-only, encrypted-browser-storage tool when on a shared/untrusted machine.
  - `js/storage-keys.js` — new `CLOUD_SYNC_DISABLED` key (local-only; never synced — syncing an "I don't want to sync" flag to the cloud would be circular).
  - `js/cloud-sync.js` — new public `CloudSync.disabledByUser` getter, `setDisabled(bool)` setter, `refreshUI()` passthrough. Short-circuits `schedulePush`, `pushToCloud`, `pullFromCloud`, and `fullSync` when disabled. Intentionally does NOT gate `deleteCloudData` — a user opting out should still be able to scrub existing cloud residue. Re-enable is user-initiated (no auto full-sync) to avoid pull-then-push overwriting local edits made while disabled.
  - `_refreshSyncUI` — shows "Disabled — local-only" when opt-out is active.
  - `index.html` — (1) Added a "Keep data on this device only" checkbox in the existing Account → Sync section with explanatory microcopy. (2) Added a privacy notice banner at the top of the sign-in view: "⚠️ Handles client data. Sign in only on your own trusted computer…"
  - `js/auth.js` — `showModal()` populates the checkbox state from localStorage and calls `CloudSync.refreshUI()` so the status text is accurate on open.

### Changed
- **privacy(bug-report): strip user email from public GitHub Issues** (April 17, 2026):
  - `api/config.js` — Bug reports previously included `user.email` in the public GitHub issue body and in the server log. Replaced both with `user.uid` (opaque Firebase UID, ~28 chars). Still useful for correlating reports from the same user without exposing a reachable identifier to anyone scraping public issues.

### Removed
- **remove(privacy): driver's license image scanner** (April 17, 2026):
  - Rationale: DL images contain client NPI (name, DOB, DL#, address, photo). Sending them to a third-party vision API (Gemini) without a signed data-processing agreement fails the FTC Safeguards Rule (2023 revision) vendor-oversight requirement, and is the kind of "unapproved software" exposure that most E&O carriers explicitly exclude. Agents can still type the DL # and state manually — that was always the primary flow.
  - `plugins/quoting.html` — removed the "🪪 Upload Driver License" button, `#initialDlScanInput` file input, and the DL preview/status/results containers from the Smart Scan card on Step 0. Subtitle updated to "Upload a policy document to auto-fill the form".
  - `js/app-scan.js` — removed `openInitialDriverLicensePicker`, `handleInitialDriverLicenseFile`, `renderInitialDriverLicenseResults`, `applyInitialDriverLicense`, `clearInitialDriverLicenseScan`.
  - `js/app-vehicles.js` — removed per-driver "📸 Scan Driver's License" button from each driver card, plus `openDriverLicensePicker`, `handleDriverLicenseFile`, `processDriverLicenseImage`, and the now-orphaned `convertImageToJPEG`. Manual License # / State inputs are unchanged.
  - `js/app-core.js` — dropped the `#initialDlScanInput` change listener.
  - `js/app-init.js` — dropped the `initialDlScan` state field.
  - `api/vision-processor.js` — removed the `processDriverLicense` handler (~217 lines) and the `case 'scanDriverLicense'` in the router. The endpoint still serves `processImage`, `processPDF`, `analyzeAerial`, `consolidate`, and `documentIntel`.
  - Dormant `driver.dlScanPreview` / `dlScanConfidence` fields in any previously-saved driver objects are simply ignored on re-render; no migration needed.
  - Tests: 28 suites / 1772 tests pass.
  - Docs in `docs/ARCHITECTURE.md`, `docs/JS_MODULE_AUDIT.md`, and `docs/HEIC_FIX_IMPLEMENTATION.md` still reference the removed flow — flagged for cleanup in the broader security hardening pass.

### Added
- **feat(reminders): daily reminder sweep cron** (April 17, 2026):
  - `api/reminders-sweep.js` (new) — Vercel Cron handler (`0 13 * * *` = 06:00 PT). Iterates `users/` via service-account Firestore REST, reads each user's `sync/reminders`, filters tasks with `dueDate <= today` and no today-completion / active snooze, writes a digest to `sync/dailyDigest` with `{date, dueCount, tasks, generatedAt}`. Auth via `Authorization: Bearer ${CRON_SECRET}` (Vercel sets this automatically on scheduled invocations).
  - `vercel.json` — added `"crons"` array with the sweep entry, and `api/reminders-sweep.js` at 300s `maxDuration`. Requires new env var `CRON_SECRET` in Vercel project settings.
  - `lib/firestore.js` — added `firestoreGetAsAdmin()`, `firestoreListAsAdmin()`, and service-account token caching (1 h, valid for the lifetime of a cron invocation). Upgraded `parseFirestoreDoc()` + new `parseFirestoreValue()` to handle nested maps, arrays, and timestamps — previously primitive-only, which couldn't read CloudSync's `{data: {tasks: [...]}}` shape. Widened `toFirestoreFields()` / `toFirestoreValue()` to serialize arrays and nested objects too (needed to write the digest's `tasks` array).
  - `js/reminders.js` — added `_checkDailyDigest()`, called from `init()`. Reads `sync/dailyDigest` once per device per day (gated by `STORAGE_KEYS.REMINDERS_DIGEST_SHOWN`), shows a one-line toast ("📅 N reminders due today"). Silent if no digest exists yet or the date doesn't match today — so the client behaves identically pre-cron-rollout.
  - `js/storage-keys.js` — new key `REMINDERS_DIGEST_SHOWN` (local-only, per-device; suppresses duplicate toasts on same-day reloads).

### Changed
- **perf(vercel-pro): raise `maxDuration` ceilings & lazy-load PDF libs** (April 17, 2026):
  - `vercel.json` — Raised `maxDuration` from 60s → 300s on AI-heavy routes (`compliance.js`, `property-intelligence.js`, `prospect-lookup.js`, `vision-processor.js`, `historical-analyzer.js`). Now that the project is on Vercel Pro, the 60s tightrope on Gemini / HawkSoft batch calls is gone. `stripe.js` and `hawksoft-logger.js` kept at 30s — a timeout there is a bug, not a feature.
  - `js/pdf-lib-loader.js` (new) — Central `PDFLibs.ensure('jspdf' | 'jszip' | 'pdfjs' | 'pdflib' | [...])` lazy-loader. Idempotent, caches in-flight promises, sets `pdfjsLib.GlobalWorkerOptions.workerSrc` on load.
  - `index.html` — Removed four sync CDN `<script>` tags for `jszip`, `jspdf`, `pdf.js`, `pdf-lib` (~600 KB). Replaced with single `js/pdf-lib-loader.js` tag. App shell now loads without waiting on any PDF lib.
  - `js/app-export.js`, `js/app-quotes.js`, `js/app-scan.js` (×2), `js/commercial-quoter.js`, `js/policy-qa.js` — Updated the five callers that relied on sync-loaded libs to `await window.PDFLibs.ensure(...)` before first use. Ad-hoc lazy-loaders in `coi.js`, `prospect.js`, `quote-compare.js`, `compliance-dashboard.js`, `accounting-export.js` still work independently (DRY migration deferred).
  - `exportDemoPolicyDoc()` in `app-scan.js` became `async`; all callers are `onclick=` / fire-and-forget, so no consumer change needed.
  - Tests: 28 suites / 1772 tests pass.

### Fixed
- **fix(deposit-sheet): shorten receipt numbers & narrow Agent column** (April 14, 2026):
  - `js/accounting-export.js` — Added `_shortenRct()` helper that strips leading zeros from HawkSoft receipt numbers (e.g., `RCT000045170` → `RCT45170`). Applied to both HTML table and PDF export rendering. Narrowed AGENT column from 22mm → 14mm in PDF, giving the flex CLIENT column 8mm more space.

### Fixed
- **fix(extension-v2): fix applicant-details low fill rate (31% → ~65%)** (June 14, 2026):
  - `chrome-extension-v2/src/content/special-cases/entity-id-discovery.js` — Click the `additional-contact-is-co-applicant-0` mat-slide-toggle before searching for "Add contact" button; wait up to 2 s for co-app section to render. Unblocks all 16 co-applicant atoms.
  - `chrome-extension-v2/src/content/registries/applicant.js` — Added `relationship` atom (mat-select, `contact-relationships-0`) to PERSONAL group. Atom count 32 → 33.
  - `js/ezlynx-tool.js` — Added App.data fallbacks for Occupation and Education in `getFormData()` pass-through section, so values flow even when EZ form fields are empty.

### Added
- **feat(pwa): installable PWA with update banner** (June 14, 2026):
  - `manifest.json` — Web App Manifest: `display: standalone`, `theme_color: #007AFF`, 3 icon sizes (192, 512, maskable-512)
  - `icons/` — PWA icons generated from Tauri branded logo (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon-32.png` favicon)
  - `index.html` — Added `<link rel="manifest">`, `<meta name="theme-color">`, `<meta name="description">`, `<link rel="icon">` favicon, update banner HTML div
  - `css/components.css` — `.pwa-update-banner` glassmorphic top bar (z-index 10001, dark mode, mobile responsive) + `.pwa-install-btn` sidebar install button styles
  - `css/animations.css` — `@keyframes pwaSlideDown` for banner entrance
  - `js/app-boot.js` — Full SW update lifecycle: `updatefound` → `statechange` → show banner → user clicks "Update Now" → `SKIP_WAITING` message → `controllerchange` → reload. `beforeinstallprompt` capture + `_triggerPwaInstall()`. 30-min periodic `reg.update()`.
  - `js/app-ui-utils.js` — `loadDarkMode()` and `toggleDarkMode()` sync `<meta name="theme-color">` (#007AFF light / #000000 dark)
  - `sw.js` — Removed auto `skipWaiting()` from install handler, added `SKIP_WAITING` message listener for user-controlled updates. Bumped `CACHE_VERSION` to `altech-v12`. Rebuilt `APP_SHELL` with ~25 previously missing JS/CSS files. Added 6 missing plugin HTML files to `PLUGIN_FILES`.
  - `vercel.json` — Added `Cache-Control: no-cache` + `Service-Worker-Allowed` headers for `sw.js`, `Content-Type: application/manifest+json` for `manifest.json`
  - `tests/boot-loading.test.js` — Added `addEventListener` and `matchMedia` mocks to `navigator.serviceWorker` fixture for JSDOM compatibility

### Added
- **feat(extension-v2): auto policy-info + auto coverage registries, manifest fix** (April 12, 2026):
  - `chrome-extension-v2/src/content/registries/auto-policy-info.js` — New flat registry (12 atoms) for the EZLynx auto policy-info page (`/rating/auto/{id}/policy-info`). Covers policy type, term, effective date, prior carrier (with residenceIs cascade precondition), prior liability limits, years with continuous coverage, and credit check toggle. All atoms tagged `_needsRecon: true` — IDs are best-guess from EZLynx naming conventions and need live validation via Registry Audit.
  - `chrome-extension-v2/src/content/registries/auto-coverage.js` — New flat registry (10 atoms) for the EZLynx auto coverage page (`/rating/auto/{id}/coverage`). All mat-select type: bodily injury, property damage, medical payments, UM/UIM BI/PD, comprehensive/collision deductibles (with `currencyStrip.stripInt()` transform per §7.7), towing, rental. All atoms tagged `_needsRecon: true`.
  - `chrome-extension-v2/src/content/routes/route-definitions.js` — Added `auto-policy-info` route pattern (`/rating/auto/{id}/policy-info`).
  - `chrome-extension-v2/src/content/registries/index.js` — Wired `auto-policy-info` and `auto-coverage` cases to return their atom arrays (replacing the empty `[]` stub for auto-coverage).
  - `chrome-extension-v2/manifest.json` — Added missing Phase 5 files (`carrier-detection.js`, `carrier-extensions.js`) and the two new registry files to content_scripts.
  - **Tests (+45 in 2 new suites, total 36 suites / 570 passing):** `auto-policy-info-registry.test.js` (13) validates shape, _needsRecon tagging, precondition structure, type distribution, and registry integration. `auto-coverage-registry.test.js` (15) validates shape, all-mat-select typing, deductible transforms, source key coverage, _needsRecon tagging, and registry integration. Updated `registry-integrity.test.js` to include both new registries in cross-registry integrity checks. Updated `routes.test.js` to validate the new route and non-empty registries.

- **feat(extension-v2): Phase 4 polish — fill report drill-down, popup rebuild, SPA nav, Ctrl+Shift+A** (April 12, 2026):
  - `chrome-extension-v2/src/content/ui/fill-report-panel.js` — Rewrote the toolbar report renderer. LexisNexis banner at the top listing human-readable labels of every atom SKIPPED with `reason: 'lexis-nexis'`. Collapsible per-atom drill-down grouped by scope (Driver N / Vehicle N / Accident N / Violation N / Comp Loss N / Co-Applicant) or flat home route (Home Policy Info / Dwelling Info / Coverage). Each row shows a state badge (DONE/SKIPPED/FAILED/BLOCKED — distinct colors + icons), label, internal atom key, reason (translated from internal enum via REASON_LABEL), attempt count for FAILED, entity index for multi-entity atoms, and optional fill/verify error-text third line. Groups with any issue open by default; all-DONE groups stay collapsed.
  - `chrome-extension-v2/src/content/orchestrator/fill-trace.js` — Added `registerAtoms(atoms)` + `report.atomIndex` so the renderer can look up label/scope/index/idTemplate/type by atom key. Backwards compatible — older reports without `atomIndex` fall through to the key-prefix classifier.
  - `chrome-extension-v2/src/content/orchestrator/index.js` — Orchestrator calls `trace.registerAtoms(sorted)` after topological sort so every run embeds the metadata.
  - `chrome-extension-v2/src/content/ui/toolbar.js` — Added ~100 lines of shadow-DOM CSS for the new report panel: `.av2-lexis-banner` (orange gradient strip), `.av2-group` collapsibles with chevron animation, `.av2-atom` rows with per-state `border-left` accents and subtle background tints, `.av2-state-done/skip/fail/blk` badge colors.
  - `chrome-extension-v2/src/popup/popup.html` + `popup.css` + `popup.js` — Full rebuild. Client card surfaces applicant name + formatted address (Address · Unit · City · State · Zip) + field count. Three action buttons: primary "Fill this page", secondary "Open Recon Tool" (→ `ALTECH_V2_RECON_OPEN` service-worker relay), secondary "Export JSON" (→ downloads `altech-fill-report-{ts}.json` via Blob + `a[download]`). Last fill report panel shows counts pills + LexisNexis lock strip. Admin recon section is a `<details>` collapsible gated on EITHER `isAdmin` OR the new `altech_admin_recon` `chrome.storage` flag.
  - `chrome-extension-v2/src/content/spa/nav-detector.js` — Wired three-pronged detection: (1) history API monkey-patch (pushState/replaceState + popstate), (2) 500ms URL polling safety net, (3) MutationObserver on documentElement watching childList+subtree for Angular route-driven wrapper changes. All three channels debounced into a single 150ms callback that only fires when the URL actually differs from `lastUrl`. `install()` now returns an `uninstall()` teardown used by tests and for explicit re-install on SPA nav.
  - `chrome-extension-v2/manifest.json` — Added `commands.fill-page` with `Ctrl+Shift+A` (and `Command+Shift+A` on Mac) as the suggested shortcut. Using `chrome.commands` instead of a page-level `keydown` listener means the shortcut works even when focus is inside an Angular `mat-input` — the Material CDK can swallow plain page keydown events, but `chrome.commands` fires at the browser level.
  - `chrome-extension-v2/src/background/service-worker.js` — Added `chrome.commands.onCommand` listener that dispatches `ALTECH_V2_FILL` (with stored `clientData`) to the active EZLynx tab when the `fill-page` command fires. Added `ALTECH_V2_RECON_OPEN` message relay for the popup "Open Recon Tool" button → toggles the on-page shadow toolbar recon panel.
  - `chrome-extension-v2/src/content/content.js` — Removed the old Ctrl+Shift+A document `keydown` handler (reclaimed for Fill via `chrome.commands`). Added `ALTECH_V2_RECON_OPEN` message handler that calls `state.ui.toggleReconPanel()`.
  - **Tests (+43 in 4 new suites, total 31 suites / 462 passing):** `fill-report-panel.test.js` (25) feeds hand-crafted reports into `renderReport()` and asserts banner labels, state-specific CSS classes, FAILED attempt count, BLOCKED `Blocked by <atom>`, multi-entity grouping, `open` attribute on groups with issues, `classifyAtom` key-prefix fallback, `reasonText` enum translation. `spa-nav-detector.test.js` (8) verifies via Jest fake timers that all three channels funnel through the 150ms debounce and only fire on actual URL changes. `keyboard-shortcut.test.js` (5) drives `chrome.commands.onCommand('fill-page')` against a fake chrome global + real `service-worker.js` loaded under node `require` (polyfills `self` + `importScripts`), asserts `chrome.tabs.sendMessage` was called with `{ type: 'ALTECH_V2_FILL', trigger: 'keyboard-shortcut', clientData }`, plus negative cases for non-EZLynx tab and unrelated command names, plus a manifest shape test locking `Ctrl+Shift+A` / `Command+Shift+A`. `fill-trace-atom-index.test.js` (5) locks `registerAtoms` semantics and backwards-compatible report shape.

### Changed
- **refactor(quoting): clean up property search tools area** (April 10, 2026):
  - `plugins/quoting.html` — Consolidated Smart Scan button, listing URL search, and utility buttons (Redfin, Assessor, Import) into a single `.property-search-tools` wrapper with clear visual hierarchy: Smart Scan hero button at top, "or search by listing" divider with inline input, and collapsible "Research Tools" accordion for secondary actions. Removed all inline styles in favor of CSS classes.
  - `css/components.css` — Added new component styles: `.property-search-tools` wrapper, `.listing-search-divider` with decorative lines, `.listing-search-input` and `.btn-listing-search` for the URL search row, `.research-tools-accordion` collapsible with `.btn-research-tool` buttons. Includes dark mode overrides for focus rings and button backgrounds.

- **style(quoting): redesign wizard footer as floating island nav** (April 10, 2026):
  - `css/layout.css` — Footer changed from full-width fixed bar to a floating island with rounded corners, max-width constraint (720px base / 800px desktop), 12px bottom offset, glassmorphism backdrop blur, and subtle border. Dark mode uses `rgba(44, 44, 46, 0.88)` solid background. Desktop sidebar offsets updated to account for island margins. Main content bottom padding bumped to 110px for clearance.

### Fixed
- **fix(export): coverage gap analysis now sends correct field data to AI** (April 10, 2026):
  - `js/app-export.js` — `runCoverageGapAnalysis()` was using 10 wrong/legacy field names (e.g., `dwelling` → `dwellingCoverage`, `bodInjury` → `liabilityLimits`, `dogBreed` → `dogInfo`) causing the AI to see blank data for all coverage limits. Fixed all field references to match actual form field IDs. Also added ~30 missing fields: county, dwelling usage, occupancy, exterior walls, roof shape, cooling, garage, system update years, burglar alarm, smoke detector, protection class, co-applicant info, all home coverage sub-limits (other structures, personal property, loss of use, wind deductible), all auto coverage fields (UM/UIM split, UMPD, rental, towing, accidents, violations), and prior insurance details.

- **fix(compliance): stop renewed/handled policies from resurrecting after cloud sync** (April 10, 2026):
  - `js/compliance-dashboard.js` — `checkForRenewals()` now detects stale verified/dismissed markers resurrected by cloud sync and silently removes them without resetting user's note data (hawksoftUpdated, stateUpdated, needsStateUpdate). Added date-normalized guard (`_userAckedExp`) that handles format mismatches between stored and fresh expiration dates. Added `userAlreadyHandled` flag — if user already clicked "HawkSoft Updated" or "State Updated", stale markers are cleaned up without re-triggering the "⚠ Renewed" workflow.
  - `js/cloud-sync.js` — After pulling CGL state from Firestore, now re-runs `checkForRenewals()` + `filterPolicies()` to immediately clean up any stale markers brought in by cloud data, instead of waiting for next page load.

### Added
- **docs(guide): add Code Maintenance Guide for solo maintainer** (April 11, 2026):
  - `docs/guides/CODE_MAINTENANCE_GUIDE.md` — NEW. Recurring-audit playbook tying existing tooling (`npm run audit-docs`, `npm test`, `CLAUDE.md`, `AGENTS.md`, `docs/technical/SECURITY_AND_DATA_SUMMARY.md`) into a weekly / monthly / quarterly cadence. Covers 4 audits adapted to Altech specifics: modularization review (`App.*` slice bleed, plugin IIFE discipline, CSS split-file rules, `Utils.*` duplication, `STORAGE_KEYS` hardcoding), file formatting audit (long-line detection, script load order drift, CRLF/LF mismatches, `[data-tooltip]` bleed regressions, `/* no var */` preservation), extensive testing (Jest + three-workflow manual QA + JSDOM gap list + cloud-sync round-trip), and four-round whitehat security audit (secrets, Firebase auth boundary, XSS, 12-function `api/` surface). Every section includes a paste-ready Claude Code prompt.
- **feat(quoting): drag-and-drop XML import on Personal Lines page** (April 10, 2026):
  - `js/app-core.js` — Browser drop handler on `scanDropZone` now detects `.xml` files and routes to `_handleEZLynxXMLFile()` instead of OCR scan pipeline
  - `js/app-core.js` — Tauri native drop handler detects `.xml` files and reads via `fs.readFile()` → `_parseAndApplyXML()`
  - `plugins/quoting.html` — Updated drop zone hint text to mention XML files

- **feat(property): Apify web scraper integration for Redfin + Zillow fallback** (June 6, 2026):
  - `api/_apify-client.js` — NEW: Shared Apify HTTP client helper (Vercel `_` prefix = not counted as serverless fn); exposes `runActorSync()`, `runRedfinDetail()`, `runZillowSearch()`; 60s timeout with AbortController; token-safe logging
  - `api/property-intelligence.js` — Added 4-tier waterfall in `handleZillow()`: Rentcast → Apify Redfin Detail → Apify Zillow Search → Gemini; each tier fires only when ≥3 of 8 critical fields are still missing; composite source labels track which tiers contributed
  - `api/property-intelligence.js` — Added `mapRedfinDetailToAltech()` (~80 lines): flexible field path resolution via `pick()` helper, runs through `mapZillowToAltech()` for consistent normalization
  - `api/property-intelligence.js` — Added `mapZillowSearchToAltech()` (~90 lines): checks `resoFacts` structured data + regex-parses description text for heating/cooling/roof/foundation
  - `api/property-intelligence.js` — Added `fetchApifyRedfin()`, `fetchApifyZillow()` (fuzzy address matching), `mergeApifyResult()` (upstream-wins conflict resolution), `countMissingCritical()`
  - `api/property-intelligence.js` — Modified `handleListingSearch()`: detects Redfin/Zillow URLs and routes to Apify scrapers first; if Apify gets <3 missing critical fields returns directly, otherwise falls through to Gemini for gap-filling with Apify data merged (Apify wins on conflicts)
  - `js/app-property.js` — Updated source badge system: added 'Redfin Scrape' (red) and 'Zillow Scrape' (blue) badges; composite source strings split into individual badges; tab labels and descriptions updated for Apify sources
  - `js/app-property.js` — Updated Rentcast counter to use `.includes('Rentcast')` for composite source detection
  - `.env.example` — Documented `APIFY_API_KEY` env var in Optional API Keys section
- **feat(property): AI listing search via Gemini Search Grounding** (April 10, 2026):
  - `api/property-intelligence.js` — Added `handleListingSearch()` function (~180 lines) + `LISTING_FIELD_MAP` constant for `?mode=listing-search`; forces Gemini for search grounding (Google-exclusive); extracts 25+ property fields from any Redfin/Zillow URL or address; normalizes through `mapZillowToAltech()`; returns address fields separately for URL lookups
  - `js/app-property.js` — Added `lookupListingUrl(query)` method: detects URL vs address, calls listing-search API, fills address fields from URL lookups (only empty fields), applies property data via `applyZillowSelects()`, shows status feedback
  - `plugins/quoting.html` — Added listing URL input row + Lookup button after utility-buttons in Step 3; added `listingSearchStatus` feedback div
- **feat(export): AI Coverage Gap Analysis on review step** (April 10, 2026):
  - `js/app-export.js` — Added `runCoverageGapAnalysis()` (~180 lines): collects all form data (property, vehicles, drivers, coverage limits, liability exposures), sends to Anthropic via proxy (preferred) with Gemini/AIProvider fallback, renders severity-colored gap cards (high/medium/low) with recommendations
  - `js/app-export.js` — Added `_renderCoverageGapResults()`: renders gap cards with severity colors (red/orange/blue), plus strengths section
  - `plugins/quoting.html` — Added AI Coverage Gap Analysis card to step-6 between Quick Edit and Hero Export sections

### Changed
- **refactor(property): force Gemini for all property search** (April 10, 2026):
  - `api/property-intelligence.js` — Changed `handleZillow()` to force `createRouter({ provider: 'google' })` instead of user's global AI provider setting; Gemini search grounding is Google-exclusive

### Fixed
- **fix(property): listing search missing 6 form fields** (April 10, 2026):
  - `api/property-intelligence.js` — Enhanced AI prompt to request `dwellingType`, `halfBathrooms`, `yearRenovated`, `county`, `lotSizeAcres` with explicit instructions for bath splitting (3.5 → 3 full + 1 half), acres conversion, dwelling type mapping; expanded `LISTING_FIELD_MAP` with 4 new entries; rewrote `mapZillowToAltech()` bath logic to split fractional baths into fullBaths/halfBaths; added dwelling type normalization via DWELLING_MAP, yearRenovated, lotSizeAcres with sqft→acres auto-conversion, county with "County" suffix stripping; removed post-mapper lotSize override that could overwrite converted acres
  - `js/app-property.js` — Rewrote `applyZillowSelects()`: added `dwellingType` to selectFields; created `numericSelects` section for `numStories`/`fullBaths`/`halfBaths` with 3-stage string matching (exact→floor→round); added `lotSize`, `county`, `yearRenovated` to textFields
- **fix(css): correct invalid CSS variable in quoting.html** (April 10, 2026):
  - `plugins/quoting.html` — Changed `var(--card-bg)` to `var(--bg-card)` on `gisUploadStatus` div
- **fix(ai-router): improve extractJSON robustness** (April 10, 2026):
  - `api/_ai-router.js` — Added 2 new fallback stages to `extractJSON()`: stage 5 strips single-line `//` comments, stage 6 fixes single-quote → double-quote JSON

### Added
- **feat(import): add configurable EZLynx XML auto-import path** (April 9, 2026):
  - `js/storage-keys.js` — Added `EZLYNX_XML_PATH` key
  - `index.html` — Added "EZLynx XML Path" settings section (between Agency Glossary and Security) with text input, save button, and ontoggle loader
  - `server.js` — Added `/local/ezlynx-xml` POST endpoint that reads an XML file from a user-configured local path (localhost-only, .xml extension enforced)
  - `js/app-scan.js` — `importEZLynxXML()` now tries the configured path via local server first, falls back to file picker; extracted `_openEZLynxFilePicker()` helper
- **feat(import): persistent EZLynx XML file handle for production** (April 9, 2026):
  - `js/app-scan.js` — Rewrote `importEZLynxXML()` with 3-tier approach: (1) stored `FileSystemFileHandle` via IndexedDB (works on production without dev server), (2) local server path fallback, (3) `showOpenFilePicker()` that stores the handle for next time. Added `_parseAndApplyXML()`, `_getHandleDB()`, `_storeFileHandle()`, `_tryStoredFileHandle()` helpers. Firefox falls back to hidden `<input type="file">`.
  - `index.html` — Updated settings hint text to clarify local dev vs. production auto-load behavior

### Changed
- **feat(property): replace Zillow with Redfin in quote workflow + enhance extension scraper** (July 9, 2025):
  - `js/app-property.js` — Renamed `openZillow()` → `openRedfin()`, changed Google search URL from `site:zillow.com` to `site:redfin.com`, updated error toast text
  - `plugins/quoting.html` — Updated Step 3 button text/onclick/title from Zillow to Redfin, updated Import tooltip
  - `chrome-extension/popup.js` — Updated error message from "Try a Zillow listing" to "Try a Redfin listing"
  - `chrome-extension/property-scraper.js` — Rewrote `scrapeRedfin()` from 7 fields to 18+ fields: heating, cooling, roof, foundation, basement, exterior/siding, construction style, pool, fireplace, sewer, water source, flooring, parcel number, building area, wood stove, garage type, address

### Added
- **feat(import): add EZLynx XML import to Step 0 quoting wizard** (July 9, 2025):
  - `plugins/quoting.html` — Added "📥 Import EZLynx XML" button and hidden file input to Step 0 Smart Scan section
  - `js/app-scan.js` — Added 5 new methods (`importEZLynxXML`, `_handleEZLynxXMLFile`, `_ezTag`, `_ezAll`, `_applyEZLynxData`) for namespace-aware XML parsing; maps applicant, co-applicant, address, prior policy, coverages, drivers, and vehicles from EZLynx XML into App.data/drivers/vehicles
  - `js/app-core.js` — Wired `ezlynxXmlInput` change event listener in init()
  - `tests/ezlynx-import.test.js` — New test suite (59 tests) covering full XML import, minimal XML, edge cases, and helper functions
  - Total tests: 28 suites, 1772 tests (was 27 suites, 1688 tests)

### Fixed
- **fix(mobile-nav): fix broken 'More' sidebar, active state, and mobile UX polish** (April 8, 2026):
  - `css/sidebar.css` — Fixed critical bug where `.app-sidebar { display: none }` at <768px prevented "More" button from opening sidebar; added `.mobile-open` override with `display: flex`, `position: fixed`, GPU-accelerated `transform` slide-in, touch-friendly nav item sizes (48px min-height, 15px font), safe-area bottom padding, dark mode support
  - `css/sidebar.css` — Replaced sidebar overlay `display: none/block` toggle with smooth `opacity` + `pointer-events` CSS transition (fade in/out)
  - `css/sidebar.css` — Enlarged bottom nav bar from 56px to 64px height; increased touch targets to min 44×44px per Apple HIG; bumped icons to 24px and labels to 11px; added `:active` press feedback (`scale(0.92)`)
  - `css/sidebar.css` — Added `.header-back-btn` styles for iOS-style blue back chevron (44×44px touch target, press feedback)
  - `js/dashboard-widgets.js` — Fixed bottom nav active state: added `data-tool` attributes to all 5 buttons, created `_updateMobileNavActive(toolKey)` that highlights the correct tab (including "More" for non-pinned tools), called from `setActiveSidebarItem()`
  - `js/dashboard-widgets.js` — Fixed Quoting button icon from `icon('home')` to `icon('user')` matching `TOOL_ICONS.quoting`; changed Reminders label to "Tasks" for brevity
  - `js/dashboard-widgets.js` — Added iOS-style back arrow (`chevronLeft`) in header breadcrumb when inside any tool; blue color, 44×44px touch target, calls `App.goHome()`

### Added
- **feat(deposit-sheet): add coin/change counter to deposit sheet** (April 8, 2026):
  - `plugins/accounting.html` — added coin counter rows (25¢, 10¢, 5¢, 1¢) with input fields, print counts, and totals below the bill counter
  - `js/accounting-export.js` — updated `_dsUpdateBillCounter()` to sum bills + coins into one grand total; added coin counter to PDF export; updated `_dsReset()` to clear coin inputs; updated input event listener for `.ds-coin-input`
  - `css/accounting.css` — added `.ds-coin-separator`, `.ds-coin-row`, `.ds-coin-input` styles with dark mode and print support

### Fixed
- **fix(deposit-sheet): fit PDF export on one page** (April 8, 2026):
  - `js/accounting-export.js` — removed the "Bank Deposit Receipt" tape area from both PDF export and screen render; entire deposit sheet now fits on a single landscape page

### Fixed
- **fix(cloud-sync): decrypt before push / encrypt after pull for cross-device sync** (April 8, 2026):
  - `js/cloud-sync.js` — added `_decryptForSync()`, `_encryptForStorage()`, `_isOldEncryptedFormat()` helpers; rewrote `_getLocalData()` as async to decrypt 5 encrypted fields (currentForm, quotes, vaultData, commercialDraft, commercialQuotes) before push so Firestore stores plaintext JSON
  - `js/cloud-sync.js` — rewrote pull path for currentForm, commercialDraft, commercialQuotes, vaultData: detect old encrypted format, encrypt plaintext from Firestore before localStorage write, backwards-compatible with pre-fix encrypted blobs
  - `js/cloud-sync.js` — rewrote pull path for quotes: decrypt local quotes for merge comparison, encrypt merged result before localStorage write
  - `js/cloud-sync.js` — made `_resolveConflict()` async; encrypts remote data before localStorage write on conflict resolution

### Changed
- **chore(accounting): extend account info reveal timer to 60 seconds** (April 8, 2026):
  - `js/accounting-export.js` — changed `toggleFieldValue()` auto-mask timeout from 30s to 60s
- **feat(broadform): AI-powered rule editor panel** (March 28, 2026):
  - `js/tools/broadform-data.js` — added runtime override support: `_defaultCarriers` deep clone, `applyOverrides(obj)` patches carrier rules at runtime, `resetOverrides()` restores defaults, `getCarrierSummary()` returns structured carrier/LOB/rule array for AI context, auto-loads saved overrides from localStorage on init
  - `js/tools/broadform.js` — added collapsible rule editor (`<details>`) with: textarea for natural language rule changes, "Apply with AI" button (sends current rules + user instructions to AIProvider, parses JSON overrides, merges with existing), "View Current Rules" toggle (JSON preview), "Reset to Defaults" button, "Modified" badge when overrides exist; wired all 3 buttons into `_wireEvents()`
  - `js/storage-keys.js` — added `CARRIER_OVERRIDES: 'altech_carrier_overrides'`
  - `css/broadform.css` — added rule editor styles: `.bf-rule-editor`, `.bf-rule-editor-toggle`, `.bf-rule-editor-body`, `.bf-rule-badge`, `.bf-rule-preview`, `body.dark-mode` overrides
  - `tests/broadform.test.js` — 5 new tests: getCarrierSummary shape, applyOverrides patches rules/states/notes, resetOverrides restores defaults; injected STORAGE_KEYS into test JSDOM helper (30→35 tests, 27 suites, 1713 total)

- **feat(broadform): upgrade Broadform Filter → Carrier Recommendation Engine** (March 28, 2026):
  - `js/tools/broadform-data.js` — **rewritten**: 2 carriers/3 questions → 6 carriers (Progressive, Dairyland, Safeco, PEMCO, National General, Foremost) / 20+ underwriting variables / declarative rule operators (eq, neq, lt, lte, gt, gte, in, notIn, notInFuzzy) / AI system prompt / restricted dog breeds / backward-compat `evaluate()` wrapper
  - `js/tools/broadform-engine.js` — **new file**: matching engine IIFE (`BroadformEngine`): `evaluate(profile, lob)` returns `{eligible, pending, disqualified, referOut, missingFields}`; `buildProfileFromAppData()` reads App.data/drivers/vehicles; `mergeProfile()` fills nulls only
  - `js/tools/_tool-components.js` — **extended**: added `numberInput()`, `textInput()`, `selectDropdown()`, `enhancedCarrierCard()` factories; return statement updated
  - `js/tools/broadform.js` — **rewritten**: full dynamic UI with LOB pill bar, AI info dump textarea + "Parse with AI" / "Pull from Form" buttons, removable known-data chips, dynamic questionnaire (only asks missing fields), 4-status carrier result cards (eligible/pending/disqualified/referOut), delegated event handling, `Utils.debounce(400)` for inputs
  - `css/broadform.css` — **rewritten** (~520 lines): info dump zone, chip list, primary/secondary/ghost buttons, AI status badges (info/success/warning/error), new carrier card statuses (pending/refer), reasons/missing lists, spin animation, full `body.dark-mode` overrides, responsive breakpoints
  - `plugins/tools/broadform.html` — updated: icon 🎯, brand "Carrier Recommendation Engine", new subtitle
  - `js/app-init.js` — toolConfig updated: icon 🎯, title "Carrier Match", name "Carrier Recommendation Engine"
  - `index.html` — added `<script src="js/tools/broadform-engine.js">` between data and UI scripts
  - `tests/broadform.test.js` — **expanded**: 13 → 30 tests; added BroadformEngine suite (evaluate, referOut, disqualify, mergeProfile), carriers suite, operators suite; updated questions expectations for new variable count (4 broadform vars)
  - **Test count: 27 suites, 1708 tests (was 1688)**

### Added
- **feat(theme): add Aurora theme option to user settings** (April 7, 2026):
  - `css/aurora-theme.css` — new file: Aurora northern-lights theme with CSS variable overrides (`--bg: #141a26`, mint/cyan/violet accent palette), animated curtains (`html::before`), twinkling stars (`html::after`), glassmorphism cards, heading text glow, `prefers-reduced-motion` fallback
  - `css/animations.css` — added `@keyframes aurora-shimmer` (22s curtain drift) and `@keyframes aurora-stars` (6s twinkle)
  - `js/app-ui-utils.js` — added `setTheme(themeId)`, `loadTheme()`, `_VALID_THEMES` array; `toggleDarkMode()` now deactivates Aurora when switching to light mode
  - `js/storage-keys.js` — added `THEME: 'altech_theme'`
  - `js/cloud-sync.js` — theme preference syncs to cloud in settings doc (push + pull)
  - `js/auth.js` — theme dropdown populated on settings modal open
  - `js/app-boot.js` — `loadTheme()` called after `loadDarkMode()` in boot sequence
  - `index.html` — added `<link>` for `aurora-theme.css`, added Theme `<details>` section with `<select>` in settings modal

### Fixed
- **fix(theme): boost aurora effect visibility and reduce surface opacity** (April 7, 2026):
  - `css/aurora-theme.css` — curtain gradients boosted (opacity 0.14–0.28 → 0.22–0.45, blur 36→24px, added 5th gradient band, larger ellipses), stars brightened (opacity 0.85–0.95, tighter 60% spread), card/sidebar/header backgrounds made more translucent for glassmorphism (--bg-card 0.72→0.55, --bg-sidebar 0.92→0.78, --bg-input solid→0.65), new .bento-widget + header overrides with backdrop-filter, heading glow boosted, deeper base bg (#0a1018)

- **fix(theme): aurora background effects invisible + bottom nav always visible** (April 7, 2026):
  - `css/aurora-theme.css` — moved curtain/star layers from `body::before`/`body::after` to `html:has(body.theme-aurora)::before`/`::after` since `body` is `display:flex` (pseudo-elements become flex items, not positioned layers); removed overly broad `body > *` z-index rule
  - `css/sidebar.css` — removed duplicate `display: flex` that overrode `display: none` in `.mobile-bottom-nav` base rule, causing bottom nav to always show on desktop

- **fix(ezlynx-extension): repair driver/vehicle compact page fill in Chrome extension** (April 3, 2026):
  - `chrome-extension/content.js` — `splitColumnarFields()` changed from block-based split to stride-based (interleaved) split to match EZLynx's row-first DOM ordering (D1.F0 → D2.F0 → D1.F1 → D2.F1…). Block split mixed both drivers' fields causing wrong data in wrong fields.
  - `chrome-extension/content.js` — Added `normalizeDriver()` / `normalizeVehicle()` helpers in `fillPageSequential()` to remap sub-object keys (`LicenseStatus` → `DLStatus`, `Year` → `VehicleYear`, `Make` → `VehicleMake`, `Model` → `VehicleModel`, `Use` → `VehicleUse`, `Ownership` → `OwnershipType`, `SR22` → `SR22Required`, `FR44` → `FR44Required`) so they match FIELD_LABEL_MAP expectations when merged into fillData.
  - `chrome-extension/content.js` — Added 18 missing entries to `FIELD_LABEL_MAP`: `Relationship`, `Sub-Model`, `Current Odometer`, `Daytime Running Lights`, `Performance`, `Was the car new?`, `Car Pool`, `Telematics`, `Transportation Network Company`, `Defensive Driver Course Date`, `License Sus/Rev (Last 5 years)`, `FR-44 Required`, `Student > 100 miles away`, `Mature Driver`, `Driver Telematics/…/Right Track Discount`, `Extended Non Owned Coverage for Driver`, `Driver Training Date(MM/DD/YYYY)`.
  - `tests/ezlynx-extension-fill.test.js` — Updated `splitColumnarFields` test expectations to match stride-based split (even-indexed → slice[0], odd-indexed → slice[1]).

- **fix(quote-compare): include extraction prompt in AIProvider multimodal parts** (April 3, 2026):
  - `js/quote-compare.js` — prepend prompt text as a `{ text: prompt }` part in the `parts` array passed to `AIProvider.ask()`, matching the pattern used in `app-scan.js`. Previously the extraction instructions were only passed as `userMessage` which `_callGoogle()` drops when `opts.parts` is provided, causing PDF analysis to fail (model received PDF data but no extraction instructions).

### Added
- **feat(reminders): completion celebration animation** (April 3, 2026):
  - `css/animations.css` — added 5 @keyframes: `celebratePop`, `celebrateInner`, `celebrateOuter`, `celebrateFlash`, `celebrateMenuBurst`
  - `css/reminders.css` — added `.celebrate-container`, `.celebrate-particle`, `.celebrate-particle.outer`, `.celebrate-flash`, `.toast.celebrate`, `.rem-snooze-menu-burst` styles
  - `js/reminders.js` — added `_celebrate()` function with 4-color cycling (blue, purple, green, teal), 8 inner sparkle particles + 6 outer star particles + center flash bloom; `toggle()` triggers celebration on completion; `_celebrateFromMenu()` explodes the snooze popup when "I did it!" is pressed — menu scales up + brightens then fades, particles burst from menu center

- **feat(clients): search + view-all for client history** (April 3, 2026):
  - `js/app-quotes.js` — `renderStep0ClientHistory()` now shows search bar (when >5 clients), "View All / Show Less" toggle, total count; `renderClientHistory()` (step 6) now has always-visible search bar + scrollable list with count label
  - `js/dashboard-widgets.js` — `renderClientsWidget()` now shows search bar (when >5 clients), "View All / Show Less" toggle; added `_onClientSearch()` and `_toggleClientViewAll()` to public API
  - `css/components.css` — added `.ch-search-bar`, `.ch-search-input`, `.ch-view-all-btn`, `.ch-count-label`, `.ch-list-expanded`, `.ch-no-results` + dark mode overrides
  - `css/dashboard.css` — added `.client-search-input`, `.client-list-expanded` for dashboard widget search + scrollable list

### Fixed
- **fix(reminders): position snooze menu near mouse cursor** (April 1, 2026):
  - `js/reminders.js` — `showSnoozeMenu()` now accepts the click event and positions the popup at the cursor, clamped within viewport bounds
  - `css/reminders.css` — changed overlay from `align-items: flex-end` to `align-items: center` as fallback centering

- **fix(compliance): repair corrupted emoji bytes** (April 1, 2026):
  - 6 emoji characters had been corrupted to U+FFFD (replacement character) during prior edits
  - `plugins/compliance.html` — restored 🛡️ (Total Policies), 👁️ (Manual Check), 🛡️ (loading), 🏛️ (State Updated ×2)
  - `js/compliance-dashboard.js` — restored 🏛️ in `_noteIcon()` State Updated return
  - Root cause: variation selector U+FE0F combined with multi-byte emoji caused encoding corruption during PowerShell file writes

- **revert(compliance): restore emojis — revert ASCII text replacement** (April 1, 2026):
  - Reverted commit `6599026` which had replaced all emojis with ASCII text
  - All original emojis restored in `js/compliance-dashboard.js` and `plugins/compliance.html`
  - Tests: 27 suites, 1694 tests passing

- **fix(compliance): revert emojis + add note icon tooltips** (March 31, 2026):
  - `plugins/compliance.html` — reverted 4 emoji substitutions back to originals (🔵→🛡️, 🔍→👁️, 🏠→🏛️, 🔰→🦅); kept 💤 for snooze
  - `js/compliance-dashboard.js` — reverted 🏠→🏛️ in _noteIcon() and State Updated button, 🔰→🦅 in HawkSoft Updated button; added _noteLabel() and _noteIconHtml() methods for hover tooltips on note log emoji icons; renderNoteLog() now wraps icons in `<span class="cgl-note-icon" title="...">` for tooltip display
  - `css/compliance.css` — added `.cgl-note-icon { cursor: help }` rule for tooltip hover cursor

- **fix(compliance): remove progress bar, fix broken emojis, redesign button colors** (March 31, 2026):
  - `plugins/compliance.html` — removed decorative progress bar (leftover blank line), replaced 5 broken emojis with Windows-safe alternatives (🛡️→🔵, 👁️→🔍, 🏛️→🏠, 🦅→🔰, 🛏️→💤)
  - `js/compliance-dashboard.js` — replaced 3 emoji types across ~8 occurrences (🏛️→🏠, 🦅→🔰, 🛏️→💤), removed inline button styles in favor of CSS classes (.confirm, .state-done, .hs-done)
  - `css/compliance.css` — added 3 new button variant classes (.confirm green, .state-done green, .hs-done purple) with hover + dark mode; restyled .cgl-snooze-quick from yellow to indigo
  - `AGENTS.md` — updated compliance.css, compliance-dashboard.js, compliance.html descriptions

### Changed
- **fix(compliance): redesign help modal + hawk emoji** (March 31, 2026):
  - `plugins/compliance.html` — simplified help modal: cut 3 redundant sections (Deduplication, Print & Backup, Other Row Actions), consolidated Two-Step Workflow into callout+table, converted Renewal Cycle to visual step cards, fixed Status Badges (removed stale "auto-dismissed" text, added HawkSoft Updated badge)
  - `css/compliance.css` — added `.cgl-info-callout` (accent-bordered tip box), `.cgl-info-steps`/`.cgl-info-step` (numbered circle step cards), section h4 left-border accent, dark mode + mobile for new classes
  - `js/compliance-dashboard.js` — changed 📋 clipboard emoji to 🦅 eagle for HawkSoft Updated button
  - `plugins/compliance.html` — changed all 📋 → 🦅 for HawkSoft Updated references (5 occurrences)

### Changed
- **feat(compliance): two-step CGL/bond workflow — State Updated + HawkSoft Updated** (July 2, 2025):
  - `js/compliance-dashboard.js` — `markStateUpdated()` no longer auto-dismisses; policy stays visible with ✅ badge until user clicks Updated/Dismiss
  - `js/compliance-dashboard.js` — added `markHawksoftUpdated()` for bonds (sets hawksoftUpdated, hawksoftUpdatedForExp, clears needsStateUpdate)
  - `js/compliance-dashboard.js` — `togglePolicyVerified()` soft-warns if CGL missing State Updated or bond missing HawkSoft Updated (confirm dialog, overridable)
  - `js/compliance-dashboard.js` — `checkForRenewals()` clears hawksoftUpdated/hawksoftUpdatedForExp on renewal detection alongside existing fields
  - `js/compliance-dashboard.js` — `_needsStateUpdate()` now checks both stateUpdated and hawksoftUpdated
  - `js/compliance-dashboard.js` — `_refreshNoteUI()` shows correct badge text (HawkSoft Updated vs State Updated) based on policy type
  - `js/compliance-dashboard.js` — row render: added isHawksoftUpdated, isAnyUpdateDone, pType variables; badge shows type-specific text; notes panel shows conditional button per policy type
  - `plugins/compliance.html` — help modal rewritten: two-step workflow docs, HawkSoft Updated button docs, updated comparison table, corrected renewal cycle steps
  - `tests/plugin-integration.test.js` — added 7 source-pattern tests for two-step workflow (markStateUpdated no auto-dismiss, markHawksoftUpdated exists, _needsStateUpdate checks both, togglePolicyVerified soft warning, checkForRenewals clears hawksoft fields, notes panel bond button, isAnyUpdateDone usage)

- **fix(hawksoft-logger): move agent initials to front of RE: line** (March 31, 2026):
  - `api/hawksoft-logger.js` — initials now prepended (`RE: AJK — Summary…`) instead of appended (`RE: Summary… — AJK`) so they survive HawkSoft's truncated log list view
  - `api/hawksoft-logger.js` — updated SYSTEM_PROMPT FORMAT template to show `[Agent Initials — ]` placement; added strip-regex for AI-inserted initials at start of line
  - `api/hawksoft-logger.js` — added instruction telling AI not to include initials (post-processing handles it)
  - `css/call-logger.css` — enhanced `.cl-section-label` with blue left accent bar (`border-left: 3px solid var(--apple-blue)`), bumped font-size 10→11px, margin-bottom 10→12px
  - `tests/hawksoft-logger.test.js` — updated test expectations for new initials placement comment and stale FORMAT/Action Items assertions

### Added
- **CGL Dashboard: Info Modal.** ℹ️ Info button in toolbar opens a full-guide modal explaining the renewal detection cycle, status badges, note system, quick actions, deduplication, and print/backup features. Escape key + backdrop click to close. Modal opens near top of viewport (not centered). Includes dedicated "Actions Compared" section clarifying Updated toggle vs Dismiss vs 🏛️ State Updated behavior.
- **CGL Dashboard: At-a-Glance Note Icons.** Inline emoji icon strip (📞📧📱✅🏛️🔄💬) appears in each policy row, showing at a glance what actions were taken without opening notes.
- `plugins/compliance.html`: Added ℹ️ Info toolbar button + `#cglInfoOverlay` modal with 8 guide sections (incl. "Actions Compared")
- `css/compliance.css`: Added `.cgl-info-overlay` (top-aligned), `.cgl-info-modal`, `.cgl-info-header`, `.cgl-info-body`, `.cgl-info-section`, `.cgl-info-table`, `.cgl-info-close` styles with dark mode + mobile responsive
- `css/compliance.css`: Added `.cgl-note-icons` class for inline emoji icon strip
- `js/compliance-dashboard.js`: Added `showInfo()` / `closeInfo()` methods with Escape key listener
- `js/compliance-dashboard.js`: Added `noteIcons` computation using `_noteIcon()` + Set dedup per policy row

### Fixed
- **CGL Dashboard: Note Count Badge Squished.** Enlarged `.cgl-note-count` badge — min-width 14→16px, height 14→16px, font-size 9→10px, border-radius 7→8px, padding 0 3px→0 4px
- **CGL Dashboard: Renewal Safety Gap.** `markStateUpdated()` now auto-dismisses the policy by creating a `dismissedPolicies` entry with the current expiration date. This ensures next year's renewal detection has a baseline — previously, after "State Updated", no baseline existed and the policy could not be detected as renewed the following year.

### Added
- **Quick Reference: Editable Quick Emojis.** Users can now customize which emojis appear in the Quick Emoji grid (up to 12). Features: curated insurance-workflow picker (~54 emojis across 7 categories: Status, Communication, Documentation, Property & Auto, Finance, Time, People), inline label editing, add/remove individual emojis, reset-to-defaults button. Cloud-synced across devices.
- `js/storage-keys.js`: Added `QUICKREF_EMOJIS` key
- `js/cloud-sync.js`: Added `quickRefEmojis` to SYNC_DOCS + _getLocalData + pullFromCloud
- `js/quick-ref.js`: Added loadEmojis, saveEmojis, renderEmojis, openEmojiPicker, pickEmoji, editEmojiLabel, deleteEmoji, resetEmojisToDefault methods; QR_EMOJI_PICKER_OPTIONS constant (~54 emojis)
- `plugins/quickref.html`: Replaced 6 hardcoded emoji buttons with dynamic `#qrEmojiGrid` container + Add/Reset header buttons
- `css/quickref.css`: Added emoji picker popover, button wrapper with hover edit/delete actions, inline label input, category headers, dark mode overrides

### Changed

- **CGL Compliance dashboard: improved notes & renewed badge UX** (March 31, 2026):
  - `css/compliance.css` — Changed "Renewed" badge from orange to blue (light + dark mode); widened note preview to 400px with 2-line clamp; restructured action buttons into two rows (contact + state actions); added note count badge on 📝 button
  - `js/compliance-dashboard.js` — Added `_noteIcon()` helper mapping note types to emoji icons (📞📧📱✅🏛️🔄💬); updated `renderNoteLog()` with icon prefixes; added note count + icon in compact preview text; split quick-note buttons into contact row and state-actions row; added count badge overlay on notes toggle button

### Fixed

- **CGL Compliance dashboard widget card height** (March 31, 2026): Stat pills (Critical/Warning/Current/Total) were wrapping to a second row, causing the card to appear "1–2 lines short" vs its bento grid cell. Fixed by switching `.compliance-stat-pill` to `flex-direction: column` (count stacked above label) + `flex: 1; min-width: 0` so all 4 pills fit on one row with full labels. (`css/dashboard.css`)

- **Commercial Lines footer structural and layout bugs fixed** (March 31, 2026):
  - `plugins/commercial-quoter.html` — Moved `<footer class="cq-step-footer">` to be a sibling AFTER `</main>` (was incorrectly nested inside `<main id="cq-app">`). Removed `hidden` class from Back button (visibility now controlled via `disabled` attribute so the button stays in the flex layout on step 0, preventing the step counter and Next button from collapsing leftward).
  - `js/commercial-quoter.js` — Changed `prevBtn.classList.toggle('hidden', _step === 0)` → `prevBtn.disabled = (_step === 0)`. The `disabled` attribute keeps the button in layout (opacity 0.4) rather than removing it from the DOM, matching personal-lines behavior.
  - `css/commercial-quoter.css` — Added `#commercialQuoterTool footer .btn { max-width: none }` to override the global `layout.css` `footer .btn { max-width: 200px }` rule that was bleeding into the commercial footer at ≥ 960 px. Added `@media (min-width: 960px)` block to give the commercial footer matching desktop polish (`border-radius: 16px 16px 0 0`, wider padding).

- **Commercial Lines back/next buttons now match Personal Lines** (March 31, 2026):
  - `plugins/commercial-quoter.html` — Changed `<div class="cq-step-footer">` → `<footer class="cq-step-footer">` so the commercial wizard footer gets the same fixed-position glassmorphism treatment as the personal-lines wizard. Updated back button from `btn cq-nav-btn` (outlined with SVG icon, "Back") to `btn btn-step-back` (ghost text, "← Previous Step"). Updated next button from `btn btn-primary cq-nav-btn` ("Continue" + SVG) to `btn btn-primary` ("Next"). Added `footer-step-count` class to the step counter span.
  - `css/commercial-quoter.css` — Removed `.cq-nav-btn` block (no longer needed). Updated `.cq-step-footer` padding to use `env(safe-area-inset-bottom)` for mobile notch safety. Removed `.cq-nav-btn { padding: 9px 16px; }` from responsive rule.

- **Weather widget infinite loop & service worker TypeError** (March 31, 2026):
  - `js/dashboard-widgets.js` — Added `_weatherFetchPending` flag (with `.finally()` reset) to `renderWeatherWidget()` to prevent re-entrant fetches when `_fetchWeather()` fails and `_weatherCache` remains `null`, which previously caused an unbounded Promise recursion loop.
  - `sw.js` — Added `open-meteo.com` to the service worker fetch bypass list so weather API requests are not intercepted by the SW (they were being re-fetched inside the SW context, blocked by CSP, the `.catch()` returned `undefined`, and `event.respondWith(undefined)` threw `TypeError: Failed to convert value to 'Response'`). Also tightened all hostname checks from `includes()` to `=== / endsWith()` to fix a CodeQL `js/incomplete-url-substring-sanitization` vulnerability.

- **fix(commercial-quoter): fix duplicate spam in Recent Commercial Quotes** (March 31, 2026):
  - `js/commercial-quoter.js` — Added `_currentQuoteId` tracking; `saveQuote()` now upserts (updates existing quote if loaded/previously saved, creates new otherwise); `loadQuote()` sets active quote ID; `newQuote()` clears it. Added `deleteQuote(id)` function exposed on public API. Improved `_renderStep0()` with coverage pill badges, delete buttons, quote count indicator, and better card structure.
  - `css/commercial-quoter.css` — Replaced flat quote card styles with coverage pill badges (`.cq-cov-pill`), delete button (`.cq-delete-btn`), actions group (`.cq-recent-actions`), quote count hint, truncated business name. Added dark mode overrides for new elements.

- **fix(quoting): 11 bugs fixed across Personal Lines + Commercial Lines quoting tools** (April 2026):
  - `js/app-core.js`: Fixed `handleType()` using wrong DOM IDs (`driverCardList`→`driversList`, `vehicleCardList`→`vehiclesList`); extracted inline onclick into proper `App.clearExportHistory()` using `STORAGE_KEYS.EXPORT_HISTORY`
  - `js/storage-keys.js`: Added `DRIVERS: 'altech_drivers'` and `VEHICLES: 'altech_vehicles'`
  - `js/app-navigation.js`: Replaced 4 hardcoded `'altech_drivers'`/`'altech_vehicles'` strings with `STORAGE_KEYS.*` references
  - `js/app-init.js`: Removed dead `'step-2': 'Coverage Type'` from `stepTitles`
  - `plugins/commercial-quoter.html`: Added 5 missing `<datalist>` elements (GL Occ, GL Agg, PL Limit, BA BI, BA PD)
  - `js/commercial-quoter.js`: `bizName` validation guard in `next()`/`exportPDF()`/`exportCMSMTF()`; Places retry cap at 10; `onerror` handlers on map images; improved filename sanitization
  - `css/commercial-quoter.css`: Defined `--cq-purple` CSS variable with dark mode override; replaced all hardcoded `#A855F7`
  - `tests/app.test.js`: Updated stepTitles count assertion `>= 7` → `>= 6`

- **fix(prospect): increase PDF export vertical spacing** (March 31, 2026):
  - `js/prospect.js` — increased section label gaps (6→14pt before, 10→16pt after), sub-header gaps (6→10pt before, 10→14pt after), row heights (baseRowH 14→16, kvLineH 10→12), body text gaps, and document header spacing to match personal lines PDF density

- **docs: add commercial quoter to AGENTS.md, CLAUDE.md, copilot-instructions.md** (March 30, 2026):
  - Added `commercial-quoter.css`, `commercial-quoter.js`, `commercial-quoter.html` entries to AGENTS.md file structure
  - Added `altech_commercial_v1` and `altech_commercial_quotes` to AGENTS.md localStorage table
  - Added `commercial-quoter` to plugin load order in AGENTS.md and CLAUDE.md
  - Updated copilot-instructions.md plugin list: 22 → 23 plugins, added `commercial (Commercial Lines)`

- **fix(commercial-quoter): full export audit — add 16 missing fields to PDF + HawkSoft** (March 30, 2026):
  - `js/commercial-quoter.js` — `exportPDF()`: added `workDescription` ("Business Operations") to Locations & Property section
  - `js/commercial-quoter.js` — `exportCMSMTF()`: enriched `gen_sFSCNotes` with 15 previously-missing fields: `dateStarted`, `yrsIndustry`, `yrsMgtExp`, `annualReceiptsPrior`, `locAddress`, `countriesOperate`, `buildingValue`, `workDescription`, `numOwners`, `ownerNames`, `ownerDOB`, `ownerSSN` (masked), `ownerHomeAddress`, `reasonForQuote`; added `propYearBuilt` + `propSprinklers` to covProp detail string

- **refactor(audit): Comprehensive 10-phase codebase audit** (March 29, 2026):
  - **Phase 1A** — Removed dead validation code from `js/app-core.js` (validation hints now yellow-star only, no blocking)
  - **Phase 2 — XSS hardening** — Wrapped 5 unsafe `innerHTML` assignments with `Utils.escapeHTML()` in `js/app-popups.js`
  - **Phase 3 — Storage keys migration** — Added 16 new keys to `js/storage-keys.js`; migrated ~30 hardcoded `'altech_*'` strings across 15 plugin files and `js/cloud-sync.js` to use `STORAGE_KEYS.*`
  - **Phase 4 — Custom escapeHtml cleanup** — Removed 4 custom `escapeHtml()` definitions from `js/compliance-dashboard.js`, `js/email-composer.js`, `js/policy-qa.js`, `js/quick-ref.js`; all call sites now use `Utils.escapeHTML()`
  - **Phase 5 — CloudSync.schedulePush()** — Verified all synced data types already call `schedulePush()` after writes (no changes needed)
  - **Phase 6 — IIFE pattern standardization** — Wrapped 8 bare `const` modules in proper IIFE pattern: `js/coi.js`, `js/ezlynx-tool.js`, `js/accounting-export.js`, `js/quote-compare.js`, `js/compliance-dashboard.js`, `js/email-composer.js`, `js/policy-qa.js`, `js/quick-ref.js`
  - **Phase 7B — CSS `--warning` variable** — Added `--warning: #FF9500` (light) / `#FF9F0A` (dark) to `css/variables.css`; replaced 4 hardcoded `#FF9500` in `css/compliance.css` with `var(--warning)`
  - **Phase 7F — Responsive breakpoints** — Added `@media (max-width: 480px)` and `(max-width: 380px)` breakpoints to `css/security-info.css`
  - **Phase 8A — Accessibility aria-labels** — Added `aria-label` to 9 inputs missing accessible labels across `plugins/accounting.html` (5), `plugins/call-logger.html` (2), `plugins/email.html` (2)
  - **Phase 8C — COI hardcoded color** — Replaced `background: #003366` with `var(--apple-blue)` in `plugins/coi.html`
  - **Phase 8D — aria-live regions** — Added `role="status" aria-live="polite"` to dynamic status areas in `plugins/call-logger.html` (2) and `plugins/compliance.html` (2); added `role="alert" aria-live="assertive"` to `#cglError`
  - **Phase 9C — Chat history cap** — Added `MAX_CHAT_HISTORY = 100` constant and trim logic in `_saveHistory()` in `js/intake-assist.js` to prevent unbounded memory growth
  - **Phase 9D — AI request timeout** — Added `DEFAULT_TIMEOUT_MS = 45000` and `_withTimeout()` helper to `js/ai-provider.js`; both `ask()` and `chat()` now timeout after 45s (configurable via `opts.timeout`)
  - **Phase 9E — Geocode fetch timeout** — Added `AbortController` with 8s timeout to geocode fetch in `js/app-property.js`
  - **Phase 10B — Inline escaper removal** — Replaced inline `_escapeAttr` in `js/app-core.js` with `Utils.escapeAttr()` (prior session)

### Changed
- **Accounting: merged Deposit Sheet into PIN-protected Accounting area.** Single scroll view — collapsible Account Info (encrypted vault cards) at top, Deposit Sheet (CSV upload, receipt table, bill counter, print/PDF) below. Entire area gated by PIN. Removed Export Tools tab (HawkSoft automation, Trust Report, Deposit Calculator, Export History). Removed standalone Deposit Sheet sidebar entry. Removed 15-min auto-lock timer and visibility-change lock (manual Lock button instead). Deleted `plugins/deposit-sheet.html`, `js/deposit-sheet.js`, `css/deposit-sheet.css`. Removed `ACCT_HISTORY` storage key.
- js/hawksoft-export.js: Added SSN input to driver form grid (data-field="ssn" → drv_sSSNum{n} in CMSMTF); added hs_ownerSSN input, ownerSSN data field, and gen_sSSN CMSMTF output for commercial principal owner SSN export
- **Quick Reference: Quick Emojis now use explicit Edit mode.** Normal mode now shows only uniform-size emoji buttons (consistent tile height/width regardless of label length) and a single `Edit` control. Edit/delete actions are hidden unless edit mode is active. Entering edit mode reveals management controls (`+ Add Emoji`, reset) and keeps the in-grid Add tile available.

## 2026-03-29 — fix(sidebar): Remove blue hover bleed from [data-tooltip] on nav items
- **Bug:** Hovering over any sidebar nav item showed a blue square/border (apple-blue background and border-color from the global `[data-tooltip]:hover` rule in `css/components.css`), and a stray upward tooltip arrow from `[data-tooltip]::before` was visible above the item.
- **Root cause:** `[data-tooltip]:hover { background: var(--apple-blue); border-color: var(--apple-blue) }` in `components.css` (a rule intended for small help-icon badges) bled into all `.sidebar-nav-item` elements — which all carry `data-tooltip` attributes for collapsed-mode tooltips. Prior March-23 fix (commit `0926855`) addressed the BASE state only; hover state was untouched. Additionally, `[data-tooltip]::before` (tooltip arrow) had no sidebar-specific override (only `::after` was suppressed).
- **Fix 1 (css/sidebar.css):** Added `.sidebar-nav-item[data-tooltip]:hover` (specificity 0-3-0) with explicit transparent `border-color` and correct background for light/dark mode. Added `.sidebar-nav-item[data-tooltip]::before { display: none }` to suppress the stray arrow pseudo-element. Added `display: block` to `.sidebar-nav-item.active::before` to protect the active indicator bar.
- **Fix 2 (css/sidebar.css):** Added `.sidebar-nav-item.active[data-tooltip]:hover` (0-4-0) and `body.dark-mode .sidebar-nav-item.active[data-tooltip]:hover` (0-5-1) to preserve the active-item blue highlight on hover — Fix 1's broad dark-mode rule was inadvertently overriding the active background, making the active item fade to transparent on hover.
- **Fix 3 (css/sidebar.css):** Added `opacity: 1` and `border: none` to `.sidebar-nav-item.active::before` — the indicator bar inherited `opacity: 0` from `[data-tooltip]::before` (components.css) at rest, then `[data-tooltip]:hover::before { opacity: 1 }` made it pop into view as a blue box on the left on hover. Explicit `opacity: 1` keeps it always visible; added `.sidebar-nav-item.active[data-tooltip]:hover::before { opacity: 1 }` as a higher-specificity lock.
- Files changed: `css/sidebar.css`
- Tests: 1688/1688 pass

## 2026-03-25 — feat(commercial-quoter): Add SSN field to Owner & Background step
- **`plugins/commercial-quoter.html`:** Added `cq_ownerSSN` password input (Step 4, Owner & Background) in the 2-column grid alongside Primary Owner DOB; labeled with "(bonds & background checks)" hint; `autocomplete="off"`, `maxlength="11"`, `inputmode="numeric"`
- **`js/commercial-quoter.js`:** Added `Owner SSN` row to PDF export, masked as `***-**-XXXX` (last 4 digits only) for security
- **`css/commercial-quoter.css`:** Added `.cq-ssn-note` helper class for the subdued parenthetical label hint

## 2026-03-28 — fix(step-3): Property Step layout & styling fixes
- **`.prop-layout`:** Converted from CSS grid (`3fr 2fr`) to flexbox — when sidebar is hidden (auto/both workflows), `.prop-main` now expands to 100% width automatically
- **`.prop-main`:** Added `flex: 1 1 0; display: flex; flex-direction: column; gap: 16px` so cards stack with consistent spacing
- **`.prop-sidebar`:** Added `flex: 0 0 300px; width: 300px; position: sticky` at desktop for fixed-width sidebar
- **`.grid-addr-row2`:** Changed base column template from `0.8fr 90px 80px 1fr` → `2fr 80px 90px 1fr` so City gets more space than County at mid-viewports
- **Garaging checkbox:** Changed inline `style="display:flex;align-items:center..."` label to `class="checkbox-row"` — uses existing utility class that correctly overrides global `input { width:100% }` for checkboxes
- **Residence Details:** Removed `max-width:280px` from wrapper div so the `select { width:100% }` global rule applies
- Files changed: `css/components.css`, `plugins/quoting.html`
- Tests: 1688/1688 pass

## 2026-03-25 — fix(layout): Personal Lines full-width layout overhaul
- **Step 0:** `#step0ClientCard` (Begin Intake) now spans full width via `grid-column: 1/-1` — no longer half-width at desktop
- **Step 5:** Added 2-col CSS grid; Policy Details spans full-width, Home/Auto Insurance History display side-by-side at 960px+
- **Step 6:** Added `id="quickEditCard"` to Quick Edit card and set `grid-column: 1/-1` — no longer in col 1 with empty col 2
- **Footer:** Added `justify-content: space-between` + `align-items: center`; step counter span `#footerStepCount` shows "Step X of Y" between nav buttons; btn `max-width` reduced from 280px to 200px
- **`js/app-navigation.js`:** `updateUI()` now populates `#footerStepCount` text on every step change
- Files changed: `css/layout.css`, `plugins/quoting.html`, `js/app-navigation.js`
- Tests: 1688/1688 pass

## 2026-03-25 — fix(step3): improve Property step for auto/both workflows
- **fix(step3):** Step 3 (Property) was nearly empty for auto/both quotes — now looks intentional
  - Added `Residence Details` card to step 3 with `residenceIs` (own/rent/apartment) — shown for auto + both via new `qtype-auto-show` CSS class
  - Moved `residenceIs` out of step 4 Auto Coverage card (was duplicated/buried); `autoPolicyType` is now full-width there
  - Garaging checkbox (`garagingSameAsMailing`) now shows for both auto AND both workflows (was auto-only); label updated to "same as insured address"
  - Added `qtype-auto-show` visibility handling in `app-navigation.js` (shows when `showAuto` — auto or both)
  - Fixed PDF export to include garaging note for both workflow too
- **Files changed:** `plugins/quoting.html`, `js/app-navigation.js`, `js/app-export.js`
- **Tests:** 1688/1688 pass

## 2026-03-25 — feat(quoting): add circle step-flow nav to personal lines wizard
- **feat(quoting):** Personal lines intake wizard now shows the same numbered-circle step-flow nav as the Commercial Lines quoter
  - Added `<nav id="pq-step-nav" class="pq-step-nav">` inside the quoting plugin header (`plugins/quoting.html`) after the progress track
  - Added `.pq-step-nav`, `.pq-step-track`, `.pq-dot`, `.pq-dot-inner`, `.pq-dot-label` CSS classes in `css/layout.css` — active step gets blue circle + scale pop, completed steps show a checkmark + green tint, all using design-system variables
  - Added `App._renderStepNav()` in `js/app-navigation.js` — renders dots dynamically from `this.flow` (adapts to home/auto/both workflows), called from `updateUI()` on every step change
  - Tests: 180/180 app tests pass (`npm test --testPathPattern="app.test"`)

## 2026-03-25 — feat(commercial-quoter): align PDF export design to personal lines
- **feat(commercial-quoter):** Rewrote `exportPDF()` in `js/commercial-quoter.js` to match personal lines design language
  - **Format:** A4 → US Letter (jsPDF default)
  - **Palette:** Generic web-blue (`BLUE`, `BLUE_MID`, `ROW_ALT`, etc.) → brand navy `C` object (`C.navy [15,39,69]`, `C.body`, `C.label`, `C.muted`, `C.rule`, `C.footerTx`, etc.)
  - **Section headers:** Filled `BLUE_MID` rectangle → 7pt bold uppercase navy text + `C.light` (#bbb) rule line (personal lines pattern)
  - **Coverage sub-headers:** Blue-filled `covRow` → lighter `C.border` background + navy 2mm left accent bar
  - **Field rows:** 2-col right-aligned label + vertical divider + alternating `ROW_ALT` rows → `kvTable()` 2-col grid (6.5pt uppercase label, 9.5pt value, null de-emphasis via `isEmptyish`)
  - **Null handling:** Added `isEmptyish()` — de-emphasizes "None/N/A/No Coverage/Unknown" values with `C.muted` color
  - **Header:** Full-width blue banner → logo left (`App.fetchImageDataUrl`, async, defensive) + "Altech Insurance" 11pt bold navy + "COMMERCIAL INSURANCE INTAKE" subtitle + `CQ-YYYYMMDD-XXXX` doc ref right + timestamp
  - **Business card:** Navy-separator applicant-style card with business name (14pt bold navy) + contact/email sub-row
  - **Footer:** Inline `for` loop with "Altech Commercial Lines" → `drawFooter()` — `C.rule` (#ccc) 0.35px line, "Generated by Altech Insurance Tools" left, "Page N of N" right, matching personal lines exactly
  - **`exportPDF` is now `async`** — enables `await App.fetchImageDataUrl()`; safe for onclick handlers
  - All 1688 tests pass (27 suites)

## 2026-03-25 — fix(commercial-quoter): add missing .form-label CSS rule
- **fix(commercial-quoter):** Labels in the commercial quoter now render correctly in light and dark mode
  - `css/commercial-quoter.css` — added `.form-label` rule mirroring `.label` from `components.css` (11px, 700 weight, `var(--text-secondary)`, uppercase, 0.4px letter-spacing)

## 2026-03-25 — style(commercial-quoter): remove emoji from section title h2 headers
- **style(commercial-quoter):** Removed emoji prefixes from all 6 step-card `<h2>` section titles in `plugins/commercial-quoter.html` to match Personal Lines intake header style
  - Titles changed: "📋 Recent Commercial Quotes", "🏢 Business Information", "📋 Coverage Types", "📍 Locations & Operations", "👤 Owner & Background", "📄 Prior Insurance"
  - No CSS changes needed — `h2` already inherits `base.css` global style (`19px`, `700` weight, `var(--text)`) matching personal intake; `.section-subtitle` already styled as small muted gray (`12px`, `var(--text-secondary)`)

## 2026-03-28 — feat(commercial-quoter): Google Places autocomplete + map previews on Business Info step
- **feat(commercial-quoter):** Business Info step (Step 1) now mirrors Personal Lines address tooling
  - `plugins/commercial-quoter.html` — added `prop-layout` two-column grid wrapper; `prop-sidebar` with `map-preview-card` containing Street View and Satellite image previews (`#cq-biz-streetViewImg`, `#cq-biz-satelliteViewImg`); changed `#cq_bizStreet` `autocomplete` to `"off"` (required for Google Places)
  - `js/commercial-quoter.js` — added `_initCQPlaces()`: Google Places `Autocomplete` on `#cq_bizStreet`, fills city/state/zip, session token refresh; `_updateCQMapPreviews()`: static Maps + Street View images via `App.ensureMapApiKey()`; `_scheduleCQMapPreview()`: debounced 450 ms wrapper; `_openBizStreetView()` / `_openBizMaps()`: open Google Maps in new tab; wired `_initCQPlaces` to `_updateUI` when `_step === 1`; map preview schedule added to input debounce handler; `openBizStreetView` and `openBizMaps` exposed on public API
- No new CSS needed — all required classes (`prop-layout`, `prop-sidebar`, `map-preview-card`, etc.) already exist in `css/components.css`
- Tests: 1688 passed, 27 suites, 0 failures ✅

## 2026-03-28 — style(commercial): full UI overhaul — match Personal Lines design quality
- **style(commercial):** Complete visual redesign of Commercial Lines Quoter to match Personal Lines wizard quality
  - `plugins/commercial-quoter.html` — full rewrite (637 lines); progress header with step title + progress bar; `<nav class="cq-step-nav">` moved inside `#cq-app` (fixes JS dot-update bug); numbered pill dots with inner/label structure; coverage toggle rows with custom switch UI; Y/N pill buttons for Step 4; review card header; SVG export buttons; step counter in footer
  - `css/commercial-quoter.css` — full rewrite (544 lines); step track with connecting line pseudo-element; numbered dot active/completed states via `:has(~)`; coverage toggle animation; Y/N pill styling; welcome card; full dark mode block; responsive breakpoints at 600px and 380px
  - `js/commercial-quoter.js` — `_updateUI()` updated: step title + progress bar fill + step counter sync after dot loop
  - `plugins/quoting.html` — fixed `dwellingCoverage` wrapper: added `class="full-span"` to its parent div so it properly spans full width in the Home Coverage grid (fixes pre-existing test failure)
- Tests: 1688 passed, 27 suites, 0 failures ✅

## 2026-03-28 — feat(commercial): Commercial Lines Quoter plugin
- **feat(commercial):** New Commercial Lines Quoter plugin — 7-step wizard for CGL/BOP intake
  - `js/commercial-quoter.js` — full IIFE module (`window.CommercialQuoter`); steps 0–6; AES-256-GCM encrypt/decrypt draft + quotes; PDF export (jsPDF); CMSMTF/HawkSoft export; quote history (last 5)
  - `plugins/commercial-quoter.html` — 7-step HTML fragment; 45+ `cq_`-prefixed field IDs; coverage checkboxes with detail panels; subcontractor reveal; step nav dots; export footer
  - `css/commercial-quoter.css` — plugin-scoped styles using design system CSS vars; dark mode via `body.dark-mode`; responsive at 520px
  - `js/storage-keys.js` — added `COMMERCIAL_DRAFT` + `COMMERCIAL_QUOTES` entries
  - `js/cloud-sync.js` — added `commercialDraft` + `commercialQuotes` to `SYNC_DOCS`, `_getLocalData()`, and `pullFromCloud()`
  - `js/app-init.js` — registered `{ key: 'commercial', ... }` in `toolConfig[]` under quoting category
  - `index.html` — CSS link, container div, and script tag wired
- Tests: 1688 passed, 27 suites, 0 failures ✅

## 2026-03-28 — feat(quickref): add Quick Emojis clipboard section
- **feat(quickref):** Added Quick Emojis card above Quick Dial Numbers in the Quick Reference plugin
  - `plugins/quickref.html` — new `.card` block with 6 pill buttons (✅ Done, 📁 Logged, ⚠️ Pending, 🔄 Follow-up, ✉️ Emailed, 📞 Called)
  - `js/quick-ref.js` — added `copyEmoji(emoji, btn)` method; copies to clipboard, flips button text to `✓ Copied!` for 1200ms, fires `App.toast('📋 Emoji copied')`
  - `css/quickref.css` — added `.qr-emoji-grid` (flex-wrap) and `.qr-emoji-btn` (pill shape, teal accent `#0d9488`, dark-mode safe via CSS vars, `.copied` feedback state)
- Tests: 1687 passed, 1 pre-existing failure (plugin-integration `dwellingCoverage` full-span — unrelated), 1688 total

## 2026-03-28 — Phases 3–5: FSC Notes additions + EZLynx coApplicant maritalStatus fix
- **feat(hawksoft):** FSC Notes PROPERTY section — added `halfBaths` and `primaryHomeAddr` composite (addr, city, state, zip) to `_buildFscNotes()` in `js/hawksoft-export.js`
- **feat(hawksoft):** FSC Notes ENDORSEMENTS section — added `homePersonalProperty`, `homeLossOfUse`, `increasedReplacementCost` at the top of the endorsements block
- **feat(hawksoft):** FSC Notes CLIENT section (new) — added `coMaritalStatus` in a new dedicated CLIENT section between PROPERTY and ENDORSEMENTS
- **feat(hawksoft):** FSC Notes NOTES/risk section — added `creditCheckAuth` after `towingDeductible`
- **fix(ezlynx):** CoApplicant fallback block in `js/ezlynx-tool.js` now correctly uses `appData.coMaritalStatus` (was incorrectly reading primary applicant `appData.maritalStatus`)
- Tests: 256 passed, 256 total (3 suites: hawksoft-logger, ezlynx-extension-fill, ezlynx-pipeline)

## 2026-03-28 — Phase 2: HawkSoft CMSMTF structured block — wire 5 missing fields
- **feat(hawksoft):** Wired 5 previously-empty fields in `js/hawksoft-export.js` `_loadFromData()`:
  - `gen_cInitial` — now reads `d.middleName.charAt(0)` (was always `''`)
  - `gen_lCovC` — now reads `d.homePersonalProperty` (Personal Property coverage; was `''`)
  - `gen_lCovD` — now reads `d.homeLossOfUse` (Loss of Use coverage; was `''`)
  - `gen_bMultiPolicy` — now reads `d.multiPolicy === 'Yes' || true` (was hardcoded `false`)
  - `gen_sClientMiscData[7]` — now writes `c.maritalStatus` (primary applicant marital status; slot was `''`)
- **Note:** `middleName` has no form input yet (field defined in `fields.js`, no `<input>` in `quoting.html`) — mapping is correct but will always be empty until UI input is added in a future phase

## 2026-03-24 — Phase 1: Add coMaritalStatus to PDF export
- **feat(export):** Added `coMaritalStatus` ("Co-App Marital Status") row to the PDF co-applicant section in `js/app-export.js` — rendered immediately after the Co-Gender row using the existing `vo()` option-label helper
- **fix(quoting):** Added `btn-compact` class to the Scan Driver's License button in driver cards (`js/app-vehicles.js`) for better layout fit on Step 4

## 2026-03-24 — Remove blocking required-field validation on step 5
- **fix(quoting):** Removed blocking required-field validation from the Prior Insurance step — `validateStep()` in `js/app-core.js` now always returns an empty array so no fields block quote progression
- **plugins/quoting.html:** Removed all red `<span class="required-star">*</span>` asterisks from Prior Insurance label text (10 instances); yellow EZLynx `✦` stars remain as informational indicators
- **js/app-core.js:** Changed `validateStep()` to short-circuit with `return errors` unconditionally instead of blocking on step 5 fields

## 2026-03-28 — Roof Shape visual picker + Construction Style info panel
- **feat(quoting):** Added ⓘ info buttons next to **Roof Shape** and **Construction Style** labels in the Personal Intake form
- **Roof Shape** — opens a visual SVG picker modal (10 shapes: Gable, Hip, Flat, Gambrel, Mansard, Shed, Pyramid, Dormer, Turret, Other); clicking a cell sets `#roofShape` value, dispatches `change` event, and closes. Dormer description: "Add-on only — describes dormers on a base roof shape."
- **Construction Style** — opens a grouped chip picker (5 categories: One-Story, Two-Story, Split/Multi-Level, Attached/Multi-Unit, Other); clicking a chip sets `#constructionStyle` and closes
- **plugins/quoting.html:** Wrapped both labels in `.label-with-hint` + new `.info-modal-btn` buttons with `onclick` attributes
- **css/components.css:** Added `.info-modal-btn`, `.modal-close`, and all `.fi-*` scoped styles (`.fi-grid`, `.fi-cell`, `.fi-name`, `.fi-desc`, `.fi-note`, `.fi-group`, `.fi-group-label`, `.fi-chips`, `.fi-chip`) — CSS vars only, full dark mode support
- **js/quoting-info-panels.js:** New file; defines `window.showRoofShapeInfo()`, `window.showConstructionStyleInfo()`, `window.closeFieldInfoModal()` as global helpers (plugin HTML loads via `innerHTML` — inline scripts don't execute, so these must pre-load)
- **index.html:** Added `<script src="js/quoting-info-panels.js">` before `app-boot.js`
- Tests: 1688 tests, 27 suites, all pass

## 2026-03-24 — Other Structures calculated coverage field
- **feat(quoting):** Added `otherStructures` (Cov B) as a read-only calculated field in the Home Coverage card; auto-computes as 10% of dwelling coverage, updates live on `oninput`, and restores from saved data on load
- **plugins/quoting.html:** Added `oninput="App.computeOtherStructures()"` to `#dwellingCoverage`; inserted new `full-span` div with `#otherStructures` (readonly, tabindex=-1) and a `label-with-hint` + `ⓘ` tooltip matching the foundation/exterior-walls pattern
- **js/fields.js:** Added `{ id: 'otherStructures', label: 'Other Structures (Cov B)', type: 'text', section: 'home-coverage', ezlynxRequired: false }` after `dwellingCoverage` entry
- **js/app-core.js:** Added `computeOtherStructures()` method (strips non-numeric from `data.dwellingCoverage`, multiplies by 0.10, writes raw number string to DOM + `this.data.otherStructures`); called from `applyData()` so value restores on data load
- **js/app-export.js:** Added `otherStructures` row in the PDF Home Coverage `kvTable` (formatted via `formatCurrency()`) and in the scan schema
- **js/hawksoft-export.js:** Populated the previously stubbed `covB: ''` field with `d.otherStructures || ''`
- **EZLynx:** No change — EZLynx calculates Cov B internally; no mapping exists in the extension or tool
- Tests: 1672 tests, 26 suites, all pass

## 2026-03-24 — Previous address label cleanup and Google autocomplete
- **fix(quoting):** Removed redundant "Previous " prefix from the four field labels inside `#previousAddressBlock` — labels now read "Street Address", "City", "State", "ZIP"; the existing "Previous Address" section heading provides context
- **plugins/quoting.html:** Updated 4 label strings (Previous Street Address → Street Address, Previous City → City, Previous State → State, Previous ZIP → ZIP)
- **js/app-core.js:** Extended `initPlaces()` to also wire up a Google Places Autocomplete on `#previousAddrStreet`; on selection, auto-populates `previousAddrCity`, `previousAddrState`, `previousAddrZip` using the same session-token + `place_changed` pattern as the primary address

## 2026-03-23 — Previous address block (conditional on years at address)
- **feat(quoting):** When "Years at Address" is "Less than 1 year", "1", or "2", a Previous Address block appears inline below the field; hides when ≥ 3 years or empty; triggers on change and restores on draft load
- **plugins/quoting.html:** Added `onchange="App.togglePreviousAddress(this.value)"` to `#yearsAtAddress` select; inserted `#previousAddressBlock` div (hidden by default) with `previousAddrStreet`, `previousAddrCity`, `previousAddrState` (full 50-state select, no default), `previousAddrZip` — plain inputs, no autocomplete, no smart-fill buttons
- **js/fields.js:** Added 4 fields after `yearsAtAddress`: `previousAddrStreet`, `previousAddrCity`, `previousAddrState`, `previousAddrZip` — all `section: 'address'`, `ezlynxRequired: false`
- **js/app-popups.js:** Added `togglePreviousAddress(val)` to `Object.assign(App, {...})` — shows block when val is in `['Less than 1 year', '1', '2']`, hides otherwise
- **js/app-core.js:** `init()` calls `this.togglePreviousAddress(this.data.yearsAtAddress || '')` after `calculateResidenceTime()` to restore block state on draft load
- **js/hawksoft-export.js:** Previous address appended as "Previous Address: street, city, state, zip" in the PROPERTY section when `previousAddrStreet` is present
- **js/app-export.js:** Previous address fields appended as individual `kvTable` rows in the Property Address PDF section when `previousAddrStreet` is present
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-23 — Show insured name in quoting breadcrumb
- **feat(quoting):** Dashboard breadcrumb now shows `Dashboard > Personal Lines — Jane Smith` when firstName/lastName are filled in; updates live as user types; falls back to `Dashboard > Personal Lines` when both fields are empty
- **js/dashboard-widgets.js:** `updateBreadcrumb()` saves last params (`_crumbTool`/`_crumbTitle`), reads `firstName`/`lastName` from DOM when `toolName === 'quoting'`, appends ` — {name}` using `_escapeHTML()`; new `refreshBreadcrumb()` function re-invokes `updateBreadcrumb` with saved params; exported in public API
- **js/app-core.js:** Input event listener now calls `DashboardWidgets.refreshBreadcrumb()` when `e.target.id` is `firstName` or `lastName` (guarded with `typeof DashboardWidgets !== 'undefined'`)
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-28 — Auto Property Location: garaging address relabel + checkbox
- **fix(quoting):** When `qType === 'auto'`, Step 3 now shows "Garaging Address" heading and "Primary garaging address for the vehicle." subtext; utility-buttons row (Zillow/Assessor/Import) is hidden
- **plugins/quoting.html:** Added `qtype-home-only` to existing `<h2>`, `<p class="section-subtitle">`, and `utility-buttons` divs; added new `qtype-auto-only` equivalents with `style="display:none"`; added `#garagingSameAsMailing` checkbox block (auto-only)
- **js/app-navigation.js:** Added `querySelectorAll('#step-3 .qtype-auto-only')` forEach loop in `updateUI()` — shows when `qType === 'auto'` only (strict, not `'both'`)
- **js/app-export.js:** Property Address PDF section now conditionally uses "Garaging Address" header + appends "Same as Mailing: Yes" row when `garagingSameAsMailing` is checked
- **js/hawksoft-export.js:** `fscNotes` appends `\n\nGARAGING\nSame as mailing address` when `garagingSameAsMailing` is truthy
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-23 — Hide Smart Scan button and counter for auto-only qType
- **fix(quoting):** Smart Scan button (`#smartFillBtn`) and Rentcast usage counter (`#rentcastUsageDisplay`) now hidden when qType is `auto`, using the existing `qtype-home-only` class pattern
- **plugins/quoting.html:** Added `class="qtype-home-only"` to Smart Scan wrapper div and `qtype-home-only` to `#rentcastUsageDisplay` class list
- Google autocomplete and Street View remain functional for auto flow
- No JS or CSS changes — leverages existing `updateUI()` hide/show logic
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-28 — Collapse Safety & Location + broadform inline mode
- **feat(intake):** Safety & Location card in Step 3 now starts collapsed (`<details class="card section-accordion">` with no `open` attribute)
- **feat(intake):** Broadform / Non-Owners inline mode — selecting either from `#autoPolicyType` hides Vehicles and Drivers cards and shows a notice banner; restores on step-4 entry
- **js/app-navigation.js:** Added `handleAutoType(val)` method; called on step-4 entry to restore broadform state
- **plugins/quoting.html:** Safety & Location wrapped in `<details>` accordion; IDs added to Drivers/Vehicles cards; `#step4NonOwnersNotice` banner; `onchange` wired on `#autoPolicyType`
- **css/components.css:** `.non-owners-notice` banner styles added
- **Tests:** 27 suites, 1688 tests — all pass

## 2026-03-28 — EZLynx Required Field Indicators (✦)
- **feat(fields):** Added `ezlynxRequired: true` flag to ~55 fields across 10 sections in `js/fields.js`; updated header comment documenting the new optional property
- **feat(navigation):** Added `_stampEzlynxLabels(container)` DOM pass in `js/app-navigation.js`; called once after quoting plugin HTML first loads; stamps a gold ✦ (`color:#f5c842`) next to any `label.label` whose field has `ezlynxRequired: true`
- **feat(vehicles):** Inline ✦ spans added to 5 dynamic template labels in `js/app-vehicles.js`: Driver's License, VIN, Primary Use, Annual Mileage, Ownership Type
- **Tests:** 27 suites, 1688 tests — all pass (no regressions)
- **Files changed:** `js/fields.js`, `js/app-navigation.js`, `js/app-vehicles.js`

## 2026-03-23 — Carrier Eligibility tool — multi-policy expansion
- **feat(tools):** Expanded "Broadform Filter" into a multi-policy "Carrier Eligibility" tool
- **broadform-data.js:** Added `policyTypes` array (Broadform, Non-Owners); restructured `carriers` map with `policyRules.{type}.stateRules.{state}` (eligible/referOut/disqualifiers); added `questionsByType`, `disqualifierMessages`, kept `questions` alias for test backward-compat; `evaluate()` now accepts optional 4th `policyType` param (default `'broadform'`)
- **broadform.js:** Added `_selectedPolicyType` state; policy-type pill bar (Broadform / Non-Owners); Reset button; data-driven rendering with green (ready), amber (referOut), red-muted (ineligible) carrier cards; heading "Carrier Eligibility" rendered inside `#bfContainer`
- **Tests:** 16/16 broadform tests pass (was 16, unchanged); full suite 1688/1688 pass across 27 suites
- **Files changed:** `js/tools/broadform-data.js`, `js/tools/broadform.js`

## 2026-03-23 — Sidebar bubble-button fix
- **Bug:** All inactive `.sidebar-nav-item` elements displayed a filled `rgb(44,44,46)` background and `1px solid` border, making them appear as rounded "bubble" buttons
- **Root cause:** `[data-tooltip]` rule in `css/components.css` (intended for small circular help-icon tooltips) applied `background: var(--bg-input)`, `border: 1px solid var(--border)`, `height: 18px`, and `font-size: 11px` to any element with a `data-tooltip` attribute — including sidebar nav items. The `.sidebar-nav-item` rule didn't override these properties.
- **Fix:** Added `background: transparent`, `border: none`, `height: auto`, and `font-size: 14px` resets to the `.sidebar-nav-item` base rule in `css/sidebar.css` (commit `0926855`)
- **Files changed:** `css/sidebar.css`

### Fixed
- **fix(sidebar): nav items showing as icon-only buttons with no text labels** (March 2026):
  - Root cause: `.sidebar-nav-item` lacked an explicit `width` declaration, causing the flex containers to shrink to content-size (~26 px) instead of filling their 223 px parent.
  - Fix: added `width: 100%` and `box-sizing: border-box` to the `.sidebar-nav-item` base rule in `css/sidebar.css`.
  - All category groups (Quoting, Export, Documents, Operations, Agent Tools) now render with full-width items and visible text labels at all viewport widths ≥ 1280 px.

### Added
- **feat(tools): Agent Tools foundation + Broadform / Non-Owner Eligibility Filter** (March 2026):
  - New `js/tools/` subdirectory for all future Agent Tools plugin modules.
  - New `plugins/tools/` subdirectory for plugin HTML templates.
  - **`js/tools/_tool-components.js`** — `window.ToolComponents` shared UI factory: `yesNoToggle()`, `stateDropdown()`, `carrierCard()`, `hardStop()`. All output XSS-safe via `Utils.escapeHTML` / `Utils.escapeAttr`.
  - **`js/tools/broadform-data.js`** — `window.BroadformData` pure data + rule layer. `rules.evaluate(state, ownedAuto, regularAccess)` returns hard-stop, eligible carriers (WA: Progressive + Dairyland; OR: Progressive only), or null for incomplete answers.
  - **`js/tools/broadform.js`** — `window.Broadform` IIFE plugin. Stateless questionnaire — answers reset on each `init()`. Event-delegation for state dropdown and Yes/No toggles. Renders results in an `aria-live` region.
  - **`plugins/tools/broadform.html`** — Thin plugin HTML shell (header + container div).
  - **`css/broadform.css`** — Full CSS for `bf-` (plugin) and `tc-` (shared component) namespaces, with dark mode overrides and 520 px mobile breakpoint.
  - **`index.html`** — Added CSS link, `broadformTool` container div, and three Agent Tools script tags.
  - **`js/app-init.js`** — New `broadform` tool entry registered in `toolConfig[]` under `category: 'tools'`.
  - **`js/dashboard-widgets.js`** — Added `tools: 'Agent Tools'` to `categoryLabels`.
  - **`tests/broadform.test.js`** — 16 unit tests covering all branches of `rules.evaluate()`: hard-stop (owned auto / regular access), WA + OR eligible paths, and null/incomplete states. **27 suites, 1688 tests — all pass.**

- **feat(quoting): UX overhaul — coverage type merged into Step 0** (March 28, 2026):
  - **Coverage type migration (Phase 0):** The standalone "Coverage Type" step (old Step 2) has
    been removed from all workflow arrays. Three coverage-type cards (HOME / AUTO / HOME & AUTO)
    now live directly on Step 0 (Quick Start) and serve as the primary call-to-action. Clicking
    a card starts a fresh intake with the correct coverage type pre-selected. This shortens every
    workflow by one step and makes the entry experience immediate and intuitive.
  - **`App.selectTypeAndStart(type)`** — new method on `App` (in `app-navigation.js`) that sets
    the coverage radio to the chosen type, calls `startFresh()`, then re-applies the type so the
    correct workflow (home/auto/both) is active from the start.
  - **`App.jumpToStep(stepIdOrIndex)`** — new method accepting either a step ID string (e.g.
    `'step-1'`) or a 0-based flow index to jump directly to any step. Used by step-6 edit shortcuts.
  - **Step-6 Quick Edit shortcuts:** A "✏️ Quick Edit" card on the Review & Export page lets
    agents jump back to Personal Info, Property Details, Vehicles & Drivers, or Prior Insurance
    in one click without clicking "Back" repeatedly. The Vehicles button auto-hides on home-only quotes.
  - **Tooltip hints on 4 confusing fields:** Dwelling Type, Exterior Walls, Foundation Type, and
    Protection Class now have inline `ⓘ` icons with CSS-only hover popovers explaining each field.
  - **Soft (non-blocking) completion warnings:** Leaving Step 1 with no firstName/lastName,
    or leaving Step 3 with no address fields, now shows an informational toast reminder. Navigation
    is never blocked — the agent can proceed immediately.
  - **CSS additions to `components.css`:** `.coverage-type-cards` / `.coverage-card` responsive
    flex cards with hover/active states; `[data-tooltip]` CSS-only tooltip system; `.label-with-hint`
    helper; `.section-divider-label`; `.btn-edit-jump`; `.section-edit-row`; `.export-btn-sub`.
    All include `body.dark-mode` overrides and mobile breakpoints.

### Changed
  - `api/app-init.js` — All 3 workflow arrays no longer include `'step-2'` (step-2 DOM stays as
    dead HTML, eliminating any regression risk for old saved data).
  - `app-core.js` `handleType()` — Removed the `if (this.step === 2) { this.step++; }` auto-advance
    block that was only meaningful when step-2 was in the active flow.
  - `app-navigation.js` `updateUI()` — `initPlaces()` now fires on `step-3` (property/address step)
    instead of `step-2`.

### Fixed
- **feat: Rentcast usage sync — manual count correction** (March 23, 2026):
  - Fixed root cause: counter writes were hitting a Firestore rules catch-all deny. Moved
    storage from `users/{uid}/rentcast_usage/{monthKey}` (not in rules) to
    `users/{uid}/sync/rentcastUsage` (covered by existing `sync/{docType}` rules)
  - Replaced inline "sync" text link (too cluttered) with a ⚙ gear icon button that opens
    a clean modal with two fields:
    - **API requests used this period** — correct the count to match your Rentcast dashboard
    - **Billing resets on day of month (1–28)** — set your actual billing cycle day (e.g. 20)
  - Added `_rentcastPeriodStart()` / `_rentcastNextReset()` helpers that compute period dates
    from `periodDay` instead of always assuming the 1st of the month
  - `_incrementRentcastCounter` now detects new billing periods and resets to 1 instead of
    incrementing from a stale count
  - Auto-reset: `_getRentcastCounter` detects a new period and fire-and-forget resets the doc
  - All 26 suites, 1672 tests pass

### Fixed
- **fix(docs): update file counts + line counts for 3 new plugins** (March 28, 2026):
  - 3 plugins (blind-spot-brief, dec-import, deposit-sheet) were in the codebase but absent from all docs
  - Updated `AGENTS.md` overview table: CSS 24→32 files (~19,761 lines), JS 38→45 modules (~39,326 lines), Plugins 18→21 templates (~6,058 lines), Tests 25→26 suites / 1631→1672
  - Updated `AGENTS.md` §2 file tree: removed deleted `main.css`, added 6 missing core CSS files (variables, base, components, layout, animations, landing), added 3 new plugin CSS/JS/HTML entries
  - Fixed 16 stale individual file line counts in AGENTS.md §2 (app-boot, app-export, app-property, app-scan, app-quotes, dashboard-widgets, quote-compare, reminders, returned-mail, task-sheet + 6 CSS files)
  - Updated `.github/copilot-instructions.md`: stack counts, test count
  - Updated `QUICKREF.md`: test suite count 23→26
  - `npm run audit-docs` → exit 0, all 45 JS / 32 CSS / 21 plugin / 26 suites verified

### Added
- **feat(skills): add repo-hygiene and storage-keys Copilot skill files** (March 28, 2026):
  - Added `.github/skills/repo-hygiene/SKILL.md` — end-of-session close-out sequence (5 steps), commit/CHANGELOG format, session scope rules (one bug/session, max 3 files), pre-deploy quality gate, Vercel function count check
  - Added `.github/skills/storage-keys/SKILL.md` — STORAGE_KEYS registry reference, how to add a new key, full table of all 35 constants with sync status, Utils.escapeHTML/escapeAttr usage guide
  - Tests: 26 suites / 1672 tests — all green
- **feat(property-intelligence): FEMA flood zone lookup in property intelligence pipeline** (March 20, 2026):
  - Added `fetchFloodZone(lat, lng)` helper in `api/property-intelligence.js` — queries FEMA NFHL ArcGIS public REST API (MapServer/28), 5-second timeout, graceful null on error/miss
  - Clark County enrichment + flood zone now run in parallel via `Promise.allSettled([clarkPromise, floodPromise])` inside `handleArcgis()` — no sequential blocking
  - `floodData` (`floodZone`, `floodZoneSubtype`, `sfha`, `baseFloodElevation`) threaded through `fetchArcgisAndRag()` return paths and passed as 7th arg to `showUnifiedDataPopup()`
  - **Flood Zone card** in `showUnifiedDataPopup()`: SFHA risk chip — red `⚠️ High Risk` (sfha=true) or green `✓ Low/Moderate Risk` (sfha=false); 🌊 FEMA Flood source badge
  - No new Vercel serverless function — bundled in existing `?mode=arcgis` endpoint (stays at 12/12 limit)
  - Updated `docs/RENTCAST_API.md` with full FEMA Flood Zone section (endpoint, field mapping, zone designation table)
  - Tests: 26 suites / 1672 tests — all green

- **feat(app-property): Tabbed property modal with Rentcast/AI Search source detection** (March 20, 2026):
  - `showUnifiedDataPopup()` in `js/app-property.js` — replaced single merged grid with a 4-tab layout: **✦ Summary** / **🏛 County** / **📊 Rentcast** or **🏠 AI Search** / **🚒 Fire / PC** (tabs only appear when that source has data)
  - Fixed source label: `sources.push('Property Listings')` → detects `zillowData.source === 'Rentcast'` and pushes `'Rentcast'` or `'AI Search'` accordingly
  - Source badge colors: Rentcast = green `#0d7a4e` (📊), AI Search = purple `#6f42c1` (🏠)
  - County tab shows raw ArcGIS parcel dump; Listings tab shows raw Rentcast/Gemini fields with per-field `✓` attribution chips; Fire tab shows station name/distance/PC/station type (Career ✅ / Volunteer 🟡 / Review ⚠️)
  - Summary tab and "Use This Data" button behavior unchanged
  - Modal widened from `max-width: 520px` to `max-width: 600px`
  - Helper functions: `buildGrid()`, `rawToFields()` (camelCase key auto-labeling), `camelToLabel()`
  - Tests: 26 suites / 1672 tests — all green

- **feat(app-property): Rentcast usage counter + overage modal + Firestore audit log** (March 20, 2026):
  - `js/app-property.js`: tracks per-user Rentcast API call count in Firestore under `users/{uid}/rentcastUsage`
  - Overage modal fires when call count exceeds configured threshold — shows current count, limit, and "Contact Support" CTA
  - All Rentcast invocations write an audit entry `{ ts, address, source: 'rentcast' }` to the Firestore audit log
  - Tests: 26 suites / 1672 tests — all green

- **docs(property-intelligence): Add Rentcast API bible — `docs/RENTCAST_API.md`** (March 20, 2026):
  - Created `docs/RENTCAST_API.md` — authoritative reference for all Rentcast + FEMA NFHL usage in `api/property-intelligence.js`
  - Covers all 3 Rentcast endpoints, full `/v1/properties` schema with `features.*` field types and all enum values
  - Documents fields NOT available in Rentcast (use Gemini fallback): `flooring`, `numFireplaces`, `roofAge`, `heatingFuel`, etc.
  - FEMA Flood Zone section: endpoint spec, field mapping (`floodZone`, `floodZoneSubtype`, `sfha`, `baseFloodElevation`), zone designation table, integration notes
  - ⚠️ Known bugs section documents pre-fix state for historical reference (all 3 bugs fixed in commit 910b97b)
  - Tests: 26 suites / 1672 tests — all green

### Fixed
- **fix(app-property): Map all property API fields to intake form + fix stories merge priority** (March 28, 2026):
  - `applyParcelData()`: added 13 previously unmapped fields — `exteriorWalls`, `garageType`, `cooling`, `roofShape`, `flooring`, `sewer`, `waterSource`, `dwellingType`, `pool`, `woodStove`, `roofYr`, `numFireplaces`, `ownerName`, `parcelId`
  - Added `matchSelectOption()` fuzzy helper inside `applyParcelData` for case-insensitive option matching with partial fallback
  - Pool normalization: `"Yes"/"True"` → `"In Ground"`, `"No"/"None"/"False"` skipped, otherwise fuzzy-matched
  - Wood stove normalization: `"Yes"/"True"` → `"1"`, numeric pass-through for `"2"`/`"3"`, otherwise fuzzy-matched
  - Fireplace fallback: if `parcelData.fireplace === 'Yes'` but no count, sets `numFireplaces` to `"1"` when form is empty
  - `numStories` SELECT: changed from bare `field.value = parcelData.stories` (silent failure on non-matching values) to validate against actual `<option>` list, then fall back to rounded integer
  - Stories merge priority: Zillow now always preferred over ArcGIS when available — county assessors frequently mis-count split-levels and half-stories
  - `applyZillowSelects()`: added empty-guard (`if (el.value && el.value.trim()) continue`) so Zillow never overwrites parcel data already applied
  - Tests: 26 suites / 1672 tests — all green

- **fix(property-intelligence): treat garageType `'None'` same as `'Unknown'` in Rentcast merge** (March 20, 2026):
  - `js/app-property.js` — `showUnifiedDataPopup()` merge block: added `|| merged.garageType === 'None'` guard so Rentcast wins when ArcGIS returns the literal string `'None'` for garage type (was only checking for `'Unknown'`)
  - Tests: 26 suites / 1672 tests — all green

- **fix(dashboard): adjust margins, font sizes, and widget dimensions** (March 20, 2026):
  - `css/dashboard.css`: tightened widget padding, font sizes, and bento grid cell dimensions for a more consistent layout across desktop and tablet viewports
  - Tests: 26 suites / 1672 tests — all green

- **feat(property-intelligence): add diagnostic logging to `fetchRentcastData()` + response headers** (March 20, 2026):
  - `api/property-intelligence.js`: added `console.log('[Rentcast]')` trace lines to track hit/miss; logs `X-Ratelimit-Limit-Month` and `X-Ratelimit-Remaining-Month` response headers when present for API quota monitoring
  - Tests: 26 suites / 1672 tests — all green

### Changed
- **chore(sidebar): move Quick Reference to first position under Operations** (March 20, 2026):
  - `js/app-init.js` — reordered `toolConfig[]`: Quick Reference (`quickref`) entry moved to the top of the `ops` category, making it the first tool listed under Operations in the sidebar
  - Tests: 26 suites / 1672 tests — all green

### Added
- **feat(app-property): Phase 2 Rentcast merge fix — `showUnifiedDataPopup()` in `js/app-property.js`** (March 20, 2026):
  - Deleted unused `mergeZField` helper (was never called)
  - Fixed "Unknown" blocking: 7 merge conditions now use `(!merged[key] || merged[key] === 'Unknown')` so Rentcast wins when ArcGIS returns `"Unknown"` — `heatingType`, `cooling`, `roofType`, `foundationType`, `constructionStyle`, `exteriorWalls`, `garageType`
  - Added 5 new merge entries for Rentcast fields: `lotSizeAcres` (converted from `lotSize` ÷ 43560, 2 decimal places), `architectureType`, `fireplaceType`, `hoaFee`, `viewType`
  - Added 4 display cards in the data grid: Architecture, Fireplace Type, HOA Fee (`$X/mo`), View
  - Wired `labelToMergedKey` entries for all 4 new display cards
  - Tests: 26 suites / 1672 tests — all green

### Added
- **feat(property-intelligence): 4 new Rentcast field mappings in `fetchRentcastData()`** (March 20, 2026):
  - `api/property-intelligence.js` — `fetchRentcastData()` only; no other functions touched
  - `architectureType` — from `f.architectureType` (e.g. `"Ranch"`, `"Split Level"`, `"Colonial"`)
  - `hoaFee` — from `p.hoa?.fee` (monthly HOA amount — top-level object, not in features)
  - `fireplaceType` — from `f.fireplaceType` (string e.g. `"Masonry"`, `"Gas Log"`, `"Prefab"`)
  - `viewType` — from `f.viewType` (underwriting flags: `"Waterfront"`, `"Flood Plain"`, `"Flood Zone"`)
  - All 4 keys counted automatically by the dynamic `fieldsFound` array (no separate change needed)
  - Tests: 26 suites / 1672 tests — all green

### Fixed
- **fix(property-intelligence): Rentcast field mapping — 10 bugs corrected in `fetchRentcastData()`** (March 20, 2026):
  - `api/property-intelligence.js` — `fetchRentcastData()` only; no other functions touched
  - Bug 1: `p.stories` → `f.floorCount` (`stories` doesn't exist at Rentcast top-level; correct path is `features.floorCount`)
  - Bug 2: Removed `f.flooring` mapping entirely — field does not exist in Rentcast schema; Gemini fallback handles flooring
  - Bug 3: Removed `f.fireplaces` → `numFireplaces` mapping — Rentcast has `features.fireplace` (bool) and `features.fireplaceType` (string), not a numeric count
  - Bug 4: `f.heating` → `f.heatingType` (`features.heating` is a boolean presence flag; `features.heatingType` is the string value)
  - Bug 5: `f.cooling` → `f.coolingType` (same — boolean flag vs. string value)
  - Bug 6: `f.exteriorWalls` → `f.exteriorType` (Rentcast field is `features.exteriorType`, not `exteriorWalls`)
  - Bug 7: `f.foundation` → `f.foundationType` (Rentcast field is `features.foundationType`, not `foundation`)
  - Bug 8: `p.garageType` → `f.garageType` (`garageType` is in `features`, not at top-level)
  - Bug 9: `p.garageSpaces` → `f.garageSpaces` (`garageSpaces` is in `features`, not at top-level)
  - Bug 10: `p.roofType` → `f.roofType` (`roofType` is in `features`, not at top-level)
  - Tests: 26 suites / 1672 tests — all green

### Changed
- **feat(property): Rentcast/Gemini source attribution — Phase 3** (March 20, 2026):
  - `js/app-property.js` — `fetchZillowData()`: logs field-level source citations from `result.sources` and passes them through to callers (`sources` key on return object)
  - `js/app-property.js` — `fetchPropertyViaGemini()`: prompt updated to request `{value, source}` object format for every field + "Never infer, estimate, or use typical values" constraint added to IMPORTANT block
  - `js/app-property.js` — `fetchPropertyViaGemini()`: `flatRaw` flattening block added after `JSON.parse` — backward-compat with both new `{value,source}` objects and legacy plain strings; builds per-field `geminiSources` map; logs `[GeminiProperty source]` lines; returns `sources` alongside `data`
  - `js/app-property.js` — `showUnifiedDataPopup()`: tracks `fieldSources` from `zillowData.sources` during ArcGIS→Zillow gap-fill merge; field cards now show a purple `✓ <source name>` chip and `title` tooltip when explicit attribution is present

- **feat(property-intelligence): Rentcast API integration — Phase 1** (March 20, 2026):
  - `api/property-intelligence.js`: added `fetchRentcastData(address, city, state, zip)` helper that calls `https://api.rentcast.io/v1/properties` and maps top-level + `features.*` fields to Altech keys; returns null on 404/empty; throws on 5xx for upstream catch
  - `handleZillow()`: now tries Rentcast first before falling back to Gemini; logs `[Zillow] Rentcast hit` or `[Zillow] Rentcast miss` accordingly; Rentcast errors are swallowed with a warning so Gemini path still runs
  - Added `case 'rentcast':` to the mode switch router — direct endpoint for `?mode=rentcast` POST requests; returns 200+data, 404 on miss, 500 on error
  - Updated `default:` error message to include `rentcast` in the valid modes list
  - No new `api/` file created — stays within 12-function Vercel Hobby limit
  - `RENTCAST_API_KEY` env var required in Vercel dashboard (manual step)
  - Related files: `api/property-intelligence.js` only

- **feat(property-intelligence): Rentcast Phase 2 — Gemini source attribution** (March 20, 2026):
  - **Step 6** (`fetchViaGeminiSearch()` prompt): Changed JSON schema so every non-`notes` field returns `{"value": <extracted>, "source": "where found"} or null` instead of plain scalars; appended "Return null for ANY field you cannot find explicitly stated in the source data. Never infer, estimate, or use typical values for this property type or neighborhood." to IMPORTANT block
  - **Step 7** (`mapZillowToAltech()`): Added `extractVal(v)` and `extractSrc(v)` inner helpers to unpack `{value, source}` objects (backward-compat with plain scalars); replaced all `raw.fieldName` reads with `extractVal(rawPick)` pattern; built parallel `sources` object tracking the Gemini source string for every mapped field; return signature changed from `{ data, fieldsFound }` to `{ data, fieldsFound, sources }`
  - **Step 8** (`handleZillow()` response): Destructures `sources` from `mapZillowToAltech`; includes `sources` in the 200 JSON response so callers can log per-field provenance
  - Tests: 26 suites, 1672 tests, 0 failures
  - Related files: `api/property-intelligence.js` only
  - Test suite: 1671/1672 pass (1 pre-existing timeout in plugin-integration.test.js, unrelated)

- **feat(quote-compare): dual-line schema, auto/home tabs, referenceNumber fix** (March 28, 2026):
  - `js/quote-compare.js`: replaced home-only `quotes[]` schema with `autoQuotes[]`/`homeQuotes[]` dual-line extraction
  - `extractWithGemini`: new system prompt captures all 4 referenceNumber formats (CCF#, Quote Number, Policy Number, Reference Number); adds `premiumAmount`, `premiumTerm`, `isAlternate`, `hasCarrierError`, `carrierErrorMessage` fields
  - AIProvider validation guard accepts `parsed.autoQuotes || parsed.homeQuotes || parsed.quotes || parsed.applicant`
  - `buildQuoteContext()`: separate `=== AUTO QUOTES ===` / `=== HOME QUOTES ===` sections
  - `getRecommendation()`: auto/home split summaries; no dwelling property references
  - `renderResults()`: normalization block (legacy `quotes[]` → `homeQuotes[]`); tab bar injected when both lines present; delegates to `_renderLine(tab)`
  - New `_switchTab(tab)`: thin wrapper → `_renderLine(tab)`; called from HTML onclick as `QuoteCompare._switchTab('auto')`
  - New `_renderLine(tab)`: full line-specific render — 8-col auto coverage table (BI/PD/Comp/Coll/UM/PIP/Towing/Rental), home table with Deductible; endorsements hidden for auto; error cards sorted last, excluded from tables
  - `autoSave()`, `copyTable()`, `exportPDF()`: updated to merge `allQuotes` from both arrays; use `premiumAmount || premium12Month`
  - `reset()`: clears `_activeTab`
  - Legacy `quotes[]` auto-normalized to `homeQuotes[]` for backward compat with saved comparisons
  - `css/quote-compare.css`: appended tab bar, `.qc-card-ref`, `.qc-card.alt` (purple badge), `.qc-card.error` (muted/danger border), full dark mode overrides
  - 26 suites, 1672 tests — all passing

- **feat(intake-assist): smarter BASE_SYSTEM_PROMPT** (March 19, 2026):
  - `js/intake-assist.js`: replaced `BASE_SYSTEM_PROMPT` template literal with a more comprehensive, personality-driven prompt
  - New opening: "You are a sharp, experienced insurance intake assistant…" — replaces the generic "fast, friendly" version
  - Added `YOUR PERSONALITY` section: colleague tone, no filler affirmations, proactive fact-stating with confirmation
  - Added 3 new CRITICAL RULES (10–12): risk flag follow-up, driver list completion check, vehicle list completion check
  - Split "IMPORTANT — AFTER EVERY REPLY" header onto its own line (separated from "Use EXACTLY these keys:")
  - JSON schema: corrected `priorExp`/`priorLiabilityLimits` field order to match `_syncToAppData` DIRECT array; `medPayments` and `priorLiabilityLimits` confirmed present; `bedrooms` (not `numBedrooms`) kept to match form field ID
  - 25 suites, 1631 tests — all passing

### Refactor
- **refactor(escape-attr): remove App._escapeAttr compat bridge entirely** (March 18, 2026):
  - `js/app-vehicles.js`: replaced all 14 `this._escapeAttr()` call sites with `Utils.escapeAttr()` directly
  - `js/app-export.js`: removed the `_escapeAttr(str) { return Utils.escapeAttr(str); }` bridge definition
  - `js/app-core.js`: untouched — existing `typeof this._escapeAttr === 'function' ? ... : fallback` guard now always takes the fallback path (harmless)
  - Updated AGENTS.md §5.2 to mark compat bridge as fully removed
  - 26 suites, 1672 tests — all passing

### Tests
- **tests/utils.test.js: new suite — 41 tests for window.Utils** (March 18, 2026):
  - Covers all four `Utils` functions: `escapeHTML`, `escapeAttr`, `tryParseLS`, `debounce`
  - Hybrid eval approach: `js/utils.js` loaded via `fs.readFileSync` + `eval()` in Node.js context; `global.document` set to JSDOM document so `escapeHTML`'s `createElement` works; `setTimeout` in `debounce` uses Node.js global so `jest.useFakeTimers()` patches it reliably
  - `escapeHTML` quote tests named explicitly: "does not escape double/single quotes — text node safe, use escapeAttr for attributes"
  - `tryParseLS` tests verify `??` (not `||`) semantics — falsy stored values (`false`, `0`, `""`) are returned, not replaced by fallback
  - Full suite: 26 suites, 1672 tests, 0 failures

### Docs
- **AGENTS.md: sync to post-refactor architecture** (March 18, 2026):
  - Added `storage-keys.js`, `utils.js`, `fields.js`, `app-ui-utils.js`, `app-navigation.js` to file tree
  - Fixed `app-core.js` description (persistence-only; navigation/UI moved to new files)
  - Fixed CSS source-of-truth reference (`css/variables.css`, not `css/main.css`)
  - Added §3.7 CSS file responsibility table + `/* no var */` comment documentation
  - Updated §4.1 JS assembly block to 11 files with correct per-file method ownership
  - Fixed §4.2 plugin IIFE pattern to use `STORAGE_KEYS.*` not hardcoded strings
  - Added `Utils.*` helper rows to §4.4 cross-file deps table; fixed `App.toast()` source → `app-ui-utils.js`
  - Added §7.4 SYNC_DOCS one-string how-to for new cloud sync types
  - Updated §8 agent prompt rules 7 + 8 (11 files, 1631 tests); added rules 19 + 20 (STORAGE_KEYS.* and Utils.*)
  - Updated §9 checklist to 25 suites / 1631 tests; XSS check → `Utils.escapeHTML()` — never inline
  - Clarified §5.2 landmine: `App._escapeAttr()` old call still exists in `app-export.js` + `hawksoft-export.js`, NOT cleaned up

### Refactored
- **CSS Pass 2 — replace hardcoded colors with design system variables** (March 18, 2026):
  - `css/layout.css` (5 replacements): `.logo-icon` dark `#fff` → `var(--text)`, `.btn-save-client` dark bg/border/color → `var(--bg-input)`/`var(--border)`/`var(--apple-gray)`, `.btn-save-client:hover` dark `#0A84FF` → `var(--apple-blue)`, `.dark-mode-toggle` dark `#fff` → `var(--text)`, `#backToHome:hover` bg `#0051d5` → `var(--apple-blue-hover)`.
  - `css/compliance.css` (8 replacements + 3 `/* no var */` comments): stat-card `.critical`/`.updated` and `.cgl-save-dot.saved`/`.error` → `var(--danger)`/`var(--success)`, `.expired`/`.loading` `#8E8E93` → `var(--text-tertiary)`, `.cgl-button.secondary:hover` `#6e6e73` → `var(--apple-gray)`, toggle slider `#34C759` → `var(--success)`, `#FF9500` warning/saving states annotated `/* no var */`.
  - `css/components.css` (15 replacements + 1 `/* no var */` comment): `.toggle-switch` checked slider `#34c759` → `var(--success)`, three `rgba(0,0,0,0.12)` → `var(--shadow)`, `.btn-primary` gradient start `#007AFF` → `var(--apple-blue)`, `.btn-primary:active` `#0051D5` → `var(--apple-blue-hover)`, dark `.btn-primary` `#0A84FF` → `var(--apple-blue)`, `.hero-btn` gradient `#007AFF` → `var(--apple-blue)`, dark `.hero-export-option`/`.hero-secondary-btn` `#1C1C1E`/`#38383A`/`#98989D` → `var(--bg-card)`/`var(--border)`/`var(--apple-gray)`, `.file-status.error` text `#FF3B30` → `var(--danger)` (rgba bg annotated `/* no var */`), `.qna-file-remove:hover` `#FF3B30` → `var(--danger)`, dark `.pac-container`/`.pac-item` `#1C1C1E`/`#38383A` → `var(--bg-card)`/`var(--border)`, `.pac-matched` `#0A84FF` → `var(--apple-blue)`.
  - Tests: **25/25 suites, 1631/1631 passing** — no regression.

### Fixed
- **Test suite: layout-regressions + plugin-integration fully green** (March 18, 2026):
  - `tests/layout-regressions.test.js`: replaced `css/main.css` reads with correct split CSS files (`css/base.css`, `css/layout.css`, `css/components.css`) — suite was crashing at module load since `main.css` was removed as a browser-loaded file.
  - `tests/plugin-integration.test.js`: redirected all 8 `readFileSync('css/main.css')` calls to `css/components.css` — fixes 10 CSS presence tests (grid-12, toggle-grid-3, etc.).
  - Full suite result: **1631/1631 tests passing, 25/25 suites green**.

### Refactored
- **Utils: added `tryParseLS` + `debounce`; replaced all call sites** (March 28, 2026):
  - `js/utils.js`: Added `tryParseLS(key, fallback)` (safe JSON parse from localStorage) and `debounce(fn, ms)` (standard debounce with `.cancel()` method); both exported on `window.Utils`.
  - **Phase 1 — `tryParseLS` (17 replacements across 11 files):** `accounting-export.js` (`_hasPIN`, `_getMeta`, `getHistory`), `app-core.js` (history load, entries load, agency profile read), `cloud-sync.js` (`_getSyncMeta`, IIFE parse, quotes split), `onboarding.js` (`getAgencyProfile`), `quote-compare.js` (`getSaved`), `prospect.js` (`_getSavedProspects`), `task-sheet.js` (`_loadExcluded`), `app-quotes.js` (`getClientHistory`), `auth.js` (agency profile read), `email-composer.js` (`_getAgencyName`), `hawksoft-export.js` (`_addToExportHistory`).
  - **Phase 2 — `debounce` module-level patterns (3 files + 1 test fix):** `ezlynx-tool.js` (`_wireAutoSave` timer), `call-logger.js` (`_handleClientSearch` timer), `cloud-sync.js` (`schedulePush` lazy-init debounce). Fixed `tests/call-logger.test.js` source-check assertions to match new `Utils.debounce` pattern.
  - **Phase 3 — `debounce` `this`-context patterns (3 files):** `app-property.js` (`scheduleMapPreviewUpdate`), `app-vehicles.js` (`updateVehicle` save timer), `accounting-export.js` (`lockVault` cancel + `_resetAutoLock` lazy-init).
  - Tests: **27/27 suites passing, 0 failures** (targeted suites fully green).

### Refactored
- **CSS dark mode Pass 1 — add body.dark-mode blocks to 6 zero-coverage files** (March 18, 2026):
  - `css/vin-decoder.css`: 17 overrides — boost all low-opacity rgba backgrounds (blue/purple/green/amber/red segments, badges, tags, error state) that were invisible on `#000000`.
  - `css/quote-compare.css`: 11 overrides — boost low-opacity drop-zone/table-row/badge fills; align `#34c759` → `#32D74B` and `#ff3b30` → `#FF453A` for best-card, included/missing badges, discount border, delete button.
  - `css/onboarding.css`: 1 override — swap gradient purple stop `#5856D6` → `#5E5CE6` (system purple) on `.onboarding-logo` and `.team-invite-icon`; reduce shadow alpha.
  - `css/quickref.css`: 6 overrides — boost teal low-opacity card hover/copied/speller-item backgrounds; increase focus-ring shadow alpha from 0.15 → 0.28.
  - `css/email.css`: 5 overrides — lighten focus rings to `#a78bfa` (avoids near-black outline on dark bg); align hover/active chip and history-item to lighter purple; fix success badge `rgba(5,150,105,0.1)` → `rgba(52,211,153,0.18)` + `#34D399`.
  - `css/paywall.css`: comment block only — relies entirely on CSS variables; `rgba(0,0,0,0.5)` overlay and `#fff` text are correct in both modes.
  - All 6 files now have `body.dark-mode` coverage. Tests: **1631/1631 passing, 25/25 suites**.

### Refactored
- **Phase 3 — cloud-sync.js SYNC_DOCS consolidation** (March 18, 2026):
  - `js/cloud-sync.js`: Added `SYNC_DOCS` constant array — single source of truth for all 10 synced Firestore document types (`settings`, `currentForm`, `cglState`, `clientHistory`, `quickRefCards`, `quickRefNumbers`, `reminders`, `glossary`, `vaultData`, `vaultMeta`).
  - `pushToCloud()`: replaced 10 manual `_pushDoc(...)` calls with `...SYNC_DOCS.map(key => _pushDoc(key, local[key], key))` — saves 8 lines, adding a new sync type now auto-covers push.
  - `deleteCloudData()`: removed inline duplicate `syncDocs` array, now references `SYNC_DOCS` — eliminates the second copy of the doc-type list.
  - `tests/call-logger.test.js`: fixed pre-existing Session 1 regression — both `createMiniDOM()` and `createClientDOM()` now inject `js/utils.js` source before `call-logger.js` so `Utils` is defined; updated stale source-inspection test to expect `Utils.escapeHTML` delegation instead of inline `div.textContent` implementation.
  - Tests: **1631/1631 passing, 25/25 suites** (fully green).

### Refactored
- **Session 1 — Shared utilities & storage-key registry** (March 17, 2026):
  - `js/utils.js` created: `window.Utils = { escapeHTML, escapeAttr }` — canonical DOM-based HTML escape and regex-based attribute escape, loaded globally before all plugins.
  - `js/storage-keys.js` created: `window.STORAGE_KEYS` frozen constant map of all 37 `altech_*` localStorage keys — single source of truth replacing scattered string literals.
  - `index.html`: `<script>` tags for `storage-keys.js` and `utils.js` added immediately after `crypto-helper.js` (before `app-init.js`).
  - 10 duplicate escape function definitions removed across 9 files — all now delegate to `Utils.*`:
    `js/admin-panel.js` (`_escapeHtml`), `js/call-logger.js` (`_escapeHTML`), `js/reminders.js` (`_escapeHTML`), `js/bug-report.js` (`escapeHTML`), `js/task-sheet.js` (`_escapeHTML`), `js/dashboard-widgets.js` (`_escapeHTML`), `js/hawksoft-export.js` (`_escapeAttr`), `js/app-quotes.js` (`escapeHTML`), `js/endorsement-parser.js` (`_escapeHtml`), `js/app-export.js` (`_escapeAttr`).
  - Tests: 1599 passing (pre-existing failures in `layout-regressions` and `plugin-integration` suites unchanged).

### Fixed
- **Session 2 — Test hygiene: fix pre-existing CSS regression failures** (March 17, 2026):
  - `css/main.css` was deleted in a prior commit (`7e55123`) but 2 test files still referenced it — causing all 21 failures across those suites.
  - `tests/layout-regressions.test.js`: Replaced single top-level `read('css/main.css')` (ENOENT at module load = entire suite crash) with three targeted reads: `css/base.css` (`overflow-x: hidden`), `css/layout.css` (`#quotingTool.active` / `min-height: 100%`), `css/components.css` (QnA clamp height + scroll containment).
  - `tests/plugin-integration.test.js`: Replaced all 8 inline `readFileSync('css/main.css')` calls with `readFileSync('css/components.css')` — fixes 10 previously failing CSS presence tests: `.grid-12`, `.span-4/6/8`, responsive grid fallback, `.disclosure-hidden`, `.toggle-switch`, `.grid-2-full`, `.full-span`, `.toggle-grid-3`, `.toggle-card`, toggle-grid-3 mobile fallback.
  - Result: **212 tests passing across both suites, 0 failures.** Total suite now fully green.

### Fixed
- Smart Scan — `_getAltechRestorePrompt()` rewritten with exhaustive section/field mapping: now lists every exact uppercase label from the PDF (PROPERTY DETAILS, BUILDING SYSTEMS, RISK & PROTECTION, HOME COVERAGE, HOME ENDORSEMENTS, AUTO COVERAGE, PRIOR INSURANCE) mapped to the corresponding JSON field ID. Previously the prompt only vaguely described these sections, causing Year Built, Square Footage, Dwelling Type, Stories, Roof/Heating/Cooling systems, all risk/protection flags, coverage limits, and endorsements to be silently omitted from scan results. (`js/app-scan.js` commit `d2ecbd3`)

### Removed
- Dead home (`logo-icon-button`) and dark-mode-toggle buttons stripped from all 20 plugin HTML headers (`plugins/accounting.html`, `call-logger.html`, `coi.html`, `compliance.html`, `dec-import.html`, `deposit-sheet.html`, `email.html`, `endorsement.html`, `ezlynx.html`, `hawksoft.html`, `intake-assist.html`, `prospect.html`, `qna.html`, `quickref.html`, `quotecompare.html`, `reminders.html`, `returned-mail.html`, `task-sheet.html`, `vin-decoder.html`, `blind-spot-brief.html`). These ~40 buttons were permanently hidden by `sidebar.css` (`.app-shell .plugin-container header .tool-header-brand { display: none }`) — navigation is fully owned by the sidebar. `quoting.html` intentionally unchanged. (commit `04554a3`)
- `css/main.css` — dead `@import` aggregator file; never linked in `index.html`, never loaded by the browser (documented with warning comment in AGENTS.md §5.12). (commit `7e55123`)
- Stale git worktree `.claude/worktrees/magical-swirles` and `claude/magical-swirles` branch removed. (commit `7e55123`)
- Debug/test output files removed from git tracking: `calltest.txt`, `calltest2.txt`, `test_full_results.txt`, `test-failures.json`, `test-out2.json`, `BUGFIX_LOG_2026-02-12.md`. Added these patterns to `.gitignore`. (commit `7e55123`)
- Stale cache-busting query strings stripped from `index.html`: `deposit-sheet.css?v=3` → `deposit-sheet.css`, `compliance-dashboard.js?v=20260217j` → `compliance-dashboard.js`. (commit `7e55123`)

---

### Added
- `js/fields.js` — canonical field registry (`window.FIELDS` array + `window.FIELD_BY_ID` lookup map) covering all ~175 `App.data` intake form fields with `id`, `label`, `type`, `section` metadata
- `FIELDS` / `FIELD_BY_ID` entry added to JS Symbol Index table in `QUICKREF.md`

### Changed
- `js/app-export.js`: all hardcoded label strings in `buildPDF()` `kvTable()` calls replaced with `FIELD_BY_ID[id].label`
- `js/hawksoft-export.js`: all hardcoded label strings in `_buildFscNotes()` replaced with `FIELD_BY_ID[id].label` (Baths compound and Towing & Labor kept as intentional display labels; Prior Expiration kept as-is for formatted date display)
- `index.html`: added `<script src="js/fields.js"></script>` load order entry (before `app-init.js`)
- `QUICKREF.md` Data Object Shapes: corrected address field names (`address/city/state/zip` → `addrStreet/addrCity/addrState/addrZip`) and `dogBreed` → `dogInfo`

### Added
- CSS ownership map table to `QUICKREF.md`
- JS symbol-to-file index table to `QUICKREF.md`

### Changed
- `css/main.css`: stripped 3,547 lines of phantom CSS never loaded by browser (file now 19 lines — `@import` aggregator only)
- Migrated all March 2026 session notes from `copilot-instructions.md` and `QUICKREF.md` into `CHANGELOG.md` (this file)
- Removed §10 "Changelog of Known Issues & Fixes" from `AGENTS.md` (content now in CHANGELOG.md)
- Updated all living-doc notices in `AGENTS.md`, `QUICKREF.md`, `copilot-instructions.md` to point to CHANGELOG.md instead of asking agents to update multiple files

### Latest Session Notes (March 28, 2026)

- **Smarter Multi-Unit Detection in Returned Mail Validator:** `handleValidateAddress()` now computes `isMultiUnit` using `geocodeGranularity === 'PREMISE'` (building-level geocode), `dpvMatchCode === 'S'` (USPS secondary info required), `dpvFootnote.includes('S')` (USPS high-rise), and `!addressComplete` with valid street/number (missing unit). `isMultiUnit` checked first in reason chain — addresses like "11301 NE 7th St" (apartment complex without unit) now correctly return "Apartment complex or multi-unit building — add apartment or unit number" instead of "Could not determine." `_geocodingFallback()` also improved: adds `comps.some(c => c.types.includes('premise'))`, `data.results.length > 1`, and degrades DELIVERABLE to POSSIBLY_DELIVERABLE when `locationType` is RANGE_INTERPOLATED or APPROXIMATE.
- **Tests:** 25 suites, 1631 tests (unchanged).
- **1 file modified:** api/property-intelligence.js (1,433→1,460 lines).

### Previous Session Notes (March 27, 2026)

- **Street View + Satellite Imagery in Returned Mail Validator:** `handleValidateAddress()` and `_geocodingFallback()` in `api/property-intelligence.js` now build `streetViewUrl` (600×340, fov=80) and `satelliteUrl` (zoom=19, satellite) server-side using `getMapsApiKey()` and return them in the JSON response. `_renderValidationResult()` in `js/returned-mail.js` shows a side-by-side image pair between the unconfirmed-components warning and "Use this address" button. `onerror` hides individual images gracefully if unavailable (e.g., no Street View coverage).
- **Tests:** 25 suites, 1631 tests (unchanged).
- **3 files modified:** api/property-intelligence.js (1,460 lines), js/returned-mail.js (458 lines), css/returned-mail.css (681 lines).

### Previous Session Notes (March 26, 2026)

- **Returned Mail Tracker Plugin:** New plugin (`returnedmail`) with three sections: (1) Address Validator calls `POST /api/property-intelligence?mode=validate-address` and shows a deliverability badge (DELIVERABLE/POSSIBLY_DELIVERABLE/UNDELIVERABLE/UNKNOWN) plus likelyReturnReason. (2) Log Entry Form — client name, policy #, address, 10 return-reason options, date returned, status, notes; full add/edit/cancel. (3) Log Table — search, filter by status, sortable columns, Edit/Delete/Copy To HawkSoft actions, CSV export. `validate-address` mode added to existing `api/property-intelligence.js` — Vercel count stays at 12.
- **Tests:** 25 suites, 1631 tests (unchanged).
- **3 new files:** js/returned-mail.js (458 lines), plugins/returned-mail.html (127 lines), css/returned-mail.css (681 lines).
- **2 files modified:** api/property-intelligence.js (`validate-address` mode), index.html + js/app-init.js (registration).

### Previous Session Notes (March 25, 2026)

- **Task Sheet Plugin — HawkSoft CSV Task Viewer:** New plugin (`tasksheet`) for uploading HawkSoft "My Tasks" CSV exports and displaying a sortable, printable task table. Upload via drag-and-drop or file picker. CSV parsed client-side (RFC 4180, BOM-safe). Rows sorted: overdue first → priority (critical→high→medium→low) → due date ascending. 9-column table: Priority, Due Date, Assigned To, Client, Subject, Description, Status, Follow-Up, Notes (empty write-in column for print). Color-coded priority badges. Overdue rows highlighted red. Print layout via `window.print()` + `@media print` (landscape, expanded Notes column). Agency name header from `altech_agency_profile`.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **3 new files:** js/task-sheet.js (415 lines), plugins/task-sheet.html (50 lines), css/task-sheet.css (515 lines).
- **2 files modified:** index.html (665→742 lines), js/app-init.js (86→92 lines).

### Previous Session Notes (March 24, 2026)

- **Multi-File API URL .js Extension Bug Sweep:** Found that the `.js` extension bug (from prior session) was far more widespread than the 2 policy-qa.js fixes. Total of 13 broken API calls across 5 more files were silently 404-ing on Vercel:
  - `app-popups.js`: `/api/vision-processor.js` ×4, `/api/historical-analyzer.js` ×4 — all aerial/satellite/DL/historical calls broken
  - `app-vehicles.js`: `/api/vision-processor.js` ×1 — DL scan broken
  - `dashboard-widgets.js`: `/api/compliance.js` ×1 — compliance background fetch broken
  - `compliance-dashboard.js`: `/api/compliance.js` ×2 — main compliance fetch broken
  - `policy-qa.js`: `'api/config.json'` (missing leading `/`)
  - `email-composer.js`: `'api/config.json'` (missing leading `/`)
- **alert() → toast() in app-property.js:** Replaced 6 `alert()` calls with `this.toast()`.
- **Test fix:** `app.test.js` missing-address test updated to spy on `App.toast` instead of `window.alert`.
- **Vercel function count confirmed:** Exactly 12 non-`_` files in `api/` — at the limit, not over.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **Files changed:** js/app-popups.js, js/app-scan.js, js/app-vehicles.js, js/dashboard-widgets.js, js/compliance-dashboard.js, js/app-property.js, js/email-composer.js, js/policy-qa.js, tests/app.test.js

### Previous Session Notes (March 23, 2026)

- **AI Intake ↔ EZLynx/PDF Field Alignment — 7-Gap Fix:** Cross-referenced INTAKE_PHASES, `_syncToAppData`, `populateForm`, and both export engines. Fixed 8 gaps: `_hasFieldData()` compat aliases for dual key naming (`yearBuilt`/`yrBuilt` etc.); `hasProperty` check uses both key variants; INTAKE_PHASES wrapUp adds `coEmail`, `coPhone`, `coOccupation`, `coEducation`, `coIndustry`; autoCoverage adds `uimLimits`; priorInsurance adds `priorExp`; `_syncToAppData()` DIRECT list updated; `populateForm()` now triggers `hasCoApplicant` toggle + routes accidents/violations to `App.drivers[0]`; AI schema template updated.
- **Tests:** 23 suites, 1,515 tests (unchanged).
- **1 file changed:** js/intake-assist.js (3,058→3,423).

### Previous Session Notes (March 22, 2026)

- **EZLynx CoApplicant Missing for Home Policies — Fallback from App.data:** `getFormData()` CoApplicant was built exclusively from `App.drivers.find(d => d.IsCoApplicant)`. For home-only policies (`qType='home'`), `App.drivers` is empty (Step 4 skipped), so CoApplicant was never built. Added fallback block: `if (!data.CoApplicant && appData.coFirstName)` builds CoApplicant directly from App.data fields. Also added address field name dual fallback (`appData.address || appData.addrStreet`) in existing driver-based CoApplicant builder, and `renderDriverVehicleSummary()` co-applicant fallback from App.data.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **1 file changed:** js/ezlynx-tool.js (1,083→1,028).

### Previous Session Notes (March 21, 2026)

- **Stale Market Intel / Insurance Trends After clearChat — Async Race Condition Fix:** Added `_sessionId` counter incremented on every `clearChat()`. Each async fetch function (`_fetchPropertyIntel`, `_fetchMarketIntel`, `_fetchInsuranceTrends`, `_scanSatelliteHazards`) captures `const sid = _sessionId` at start and checks `if (sid !== _sessionId) return` after each `await`. Prevents stale API responses from overwriting cleared state or re-showing hidden DOM cards after chat reset. Root cause: async race — `clearChat()` nullifies state but cannot cancel in-flight `await`ed fetches; old responses wrote stale data back.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **1 file changed:** js/intake-assist.js (3,058).

### Previous Session Notes (March 20, 2026)

- **AI Intake Flow Engine — Deterministic Field Collection:** Added `INTAKE_PHASES` master config (~15 phases, ~80 EZLynx-critical fields) as the single source of truth for AI-guided field collection. New `_getNextFieldGroup()` deterministically selects the next unfilled group. New `_buildFlowInstruction()` generates precise AI instruction blocks with phase label, unfilled fields, context hints, and smart defaults. Rewrote `_buildSystemPrompt()` to use flow engine instructions instead of flat field lists. Rewrote `_checkCompletion()` to walk ALL applicable phases' required fields — was only checking 9 fields (name+DOB+address + home: yearBuilt/sqFt/roofType + auto: vehicles[0]/drivers[0]). Added `_hasFieldData()`, `_getApplicablePhases()`, `_checkPhaseTransition()` helpers. `FIELD_GROUPS` now derived dynamically from INTAKE_PHASES. All counter/section functions rewritten to derive from phases.
- **Suggestion Chip qType Filtering:** Added `appliesTo` property to 23 of 30 `RESPONSE_TRIGGERS` (16 home-only, 7 auto-only, 7 universal unchanged). `_computeSuggestionChips()` Stage 2 now skips triggers that don't match the current `qType`. Home-only chips (e.g., "Dwelling coverage: $200,000") no longer appear on auto-only quotes.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **1 file changed:** js/intake-assist.js (3,097→3,391).

### Previous Session Notes (March 19, 2026)

- **Auth Gate — CGL Compliance Widget Security Fix:** `renderComplianceWidget()`, `_backgroundComplianceFetch()`, and `updateBadges()` now check `Auth.isSignedIn` before rendering or fetching. Unauthenticated visitors see "Sign in to view compliance" empty state instead of real agency policy data. Root cause: `/api/compliance` has only `securityMiddleware` (no Firebase auth), so any visitor could populate `altech_cgl_cache` and see the full widget.
- **Places API Retry on Sign-In:** `_onAuthStateChanged` now calls `window.loadPlacesAPI()` when user signs in and `google.maps.places` isn't loaded yet. Also calls `DashboardWidgets.refreshAll()` after sign-in. Root cause: boot sequence called `loadPlacesAPI()` before user was authenticated, got 401 from `/api/config?type=keys`, and never retried.
- **Places API Idempotent Loader:** Added `_placesAPILoading` guard to prevent duplicate `<script>` loads when `loadPlacesAPI()` is called multiple times (boot + auth retry). Resets on failure so retry is possible.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/dashboard-widgets.js (904→911), js/auth.js (537→540), js/app-boot.js (295→279), tests/auth-cloudsync.test.js (210→213).

### Previous Session Notes (March 18, 2026)

- **Sidebar Badge Stat Mismatch Fix — Snoozed + Verified + Dismissed Exclusion:** `updateBadges()` had the same filtering gap as the widget — no snoozed check, no hiddenTypes filter. Now reads `snoozedPolicies` and `hiddenTypes` from `altech_cgl_state`, adds `_isSnoozeActive(pn)` and `_isHidden(pn)` helpers, and skips hidden-type + snoozed/verified/dismissed policies before counting critical for the sidebar badge. Badge count now matches CGL dashboard and home widget.
- **Dashboard Widget Stat Mismatch Fix — Snoozed + Verified + Dismissed Exclusion:** Widget's `renderComplianceWidget()` now reads `snoozedPolicies` from `altech_cgl_state`, adds `_isSnoozeActive(pn)` check (mirrors CGL dashboard logic), and combines into `_isHidden(pn)` that checks verified + dismissed + snoozed. `policies` array is now pre-filtered by BOTH `hiddenTypes` AND `_isHidden(pn)` before setting `totalPolicies = policies.length`, matching CGL dashboard's `visiblePolicies` counting exactly. Snoozed policies (e.g., Rosecity Garage Doors, It's a Viewpoint) no longer appear as critical in widget when snoozed in CGL. Removed redundant verified/dismissed guard from forEach since policies array is already filtered.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **1 file changed:** js/dashboard-widgets.js (889→904).

### Previous Session Notes (March 17, 2026)

- **Renewal Chip Resurrection Fix — `clearRenewed()` No Longer Deletes policyNote:** Root cause: when user clicked ✕ to clear a renewal chip, `clearRenewed()` deleted the entire `policyNotes[pn]` entry when the log was empty. On next page load, `_smartMergeDict` (additive-only merge) re-added the old note from stale IDB/KV/CloudSync sources, resurrecting the `renewedTo` value. Fix: `clearRenewed()` and `deleteNoteEntry()` now keep note objects even when empty (`{ log: [], renewedTo: null }`) so the key persists across all 6 storage layers and can't be resurrected by stale sources.
- **Dashboard Stat Mismatch Fix:** Widget's `renderComplianceWidget()` now loads `hiddenTypes` from `altech_cgl_state` and filters policies before counting. `totalPolicies` now matches CGL dashboard total. `okCount` ("Current") only counts policies in `notifyTypes`, not all remaining policies.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,513→2,509), js/dashboard-widgets.js (886→889).

### Previous Session Notes (March 16, 2026)

- **Email Composer — Dynamic AI Persona + Custom Prompt Override:** Replaced hardcoded "Altech Insurance Agency"/"Altech Insurance" in AI system prompt with dynamic `_getAgentName()` (Auth.displayName → localStorage `altech_user_name` → `'your agent'`) and `_getAgencyName()` (parsed from `altech_agency_profile` → `'our agency'`). New `buildDefaultPrompt()` constructs the persona dynamically. Added collapsible "Customize AI Persona" UI (≤ 2000 chars) with save/reset/char counter, stored in `altech_email_custom_prompt`. `compose()` uses custom prompt if set, otherwise `buildDefaultPrompt()`. Added onboarding hint under agency name field.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/email-composer.js (420→497), plugins/email.html (98→125), css/email.css (165→231), index.html (665).

### Previous Session Notes (March 15, 2026)

- **CGL State-Wipe Bugfix — checkForRenewals() No Longer Overwrites User Actions:** All 4 renewal detection blocks in `checkForRenewals()` were unconditionally clearing `stateUpdated`, `renewedTo`, and resetting `needsStateUpdate = true` on every policy fetch — even when the user had already clicked "State Updated" or dismissed the renewal chip. Fix: `markStateUpdated()` now records `stateUpdatedForExp` (the expiration date being acknowledged). All 4 clearing blocks check `existingNote?.stateUpdated && existingNote?.stateUpdatedForExp === policy.expirationDate` and skip re-flagging if the user already acknowledged this specific expiration. A genuinely new renewal (different expiration) will still trigger re-flagging.
- **Cloud Sync CGL Reload:** `pullFromCloud()` was writing cglState to localStorage but never reloading `ComplianceDashboard`'s in-memory state. Added `ComplianceDashboard.loadState()` call after successful pull.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,502→2,513), js/cloud-sync.js (672→676).

### Previous Session Notes (March 13, 2026)

- **8 UI/UX Improvements — Sidebar Logo, Icons, Snooze, QuickRef:** Replaced blue "AL" text logo with `<img>` tag loading `Resources/altech-logo.png`. Restyled `.sidebar-brand-logo` for image display (object-fit, border-radius). Changed Personal Lines icon from house (duplicate of Dashboard) to pencil/edit ✏️. Added `edit` SVG to `ICONS`, updated `TOOL_ICONS quoting→edit`. Removed errant `left: 0` from `#quotingTool footer` override (was hiding nav behind sidebar). Added `hidden: true` to `qna` entry in `toolConfig[]`. Rewrote `getCurrentPage()` with hash-based detection for bug reports. Changed browser title to "Altech Toolkit".
- **CGL Snooze/Sleep:** Full snooze system for CGL compliance notifications. `snoozePolicy(pn)` sets midnight-tonight expiry, logs note "🛏️ Snoozed until [date] (snooze #N)" with count tracking. `_isSnoozeActive(pn)` checks expiry, `_expireSnoozes()` called at top of `filterPolicies()` to auto-clear expired. `unsnoozePolicy(pn)` for manual wake. `isHidden()` now checks snoozed state. `clearAll()` includes `snoozedPolicies = {}`. UI: 🛏️ Sleep button next to Dismiss for active rows, amber "🛏️ Until [date]" badge + "Wake" button for snoozed rows in showHidden mode, "🛏️ Sleep Until Tomorrow" in quick-note row. CSS: `.cgl-snooze-btn`, `.cgl-snoozed-badge`, `.cgl-snooze-quick` with full dark mode.
- **QuickRef reorganized + editable numbers:** Reordered to ID Cards → Speller → Quick Dial Numbers → Phonetic Grid. Replaced hardcoded Common Numbers with editable CRUD system — `QR_NUMBERS_KEY`, `loadNumbers()`, `saveNumbers()`, `renderNumbers()`, `toggleNumberForm()`, `saveNumber()`, `editNumber()`, `deleteNumber()`. Defaults: NAIC Lookup, CLUE Report, MVR Check. Cloud synced as `quickRefNumbers` (11th doc type in 4 touchpoints).
- **Tests:** 23 suites, 1515 tests (unchanged).
- **12 files changed:** js/compliance-dashboard.js (2,448→2,502), css/compliance.css (1,234→1,275), js/quick-ref.js (293→346), css/quickref.css (233→261), plugins/quickref.html (79→78), js/cloud-sync.js (664→672), js/dashboard-widgets.js (976→886), css/sidebar.css (765→726), js/bug-report.js (260→232), css/main.css (3,486→3,366), js/app-init.js (85→86), index.html (665).

### Previous Session Notes (March 12, 2026)

- **Vault UI Polish — Clean Toolbar, Form, Empty State:** Replaced global `.btn .btn-primary` (heavy gradient+shimmer) with dedicated `.acct-toolbar-btn`/`.acct-toolbar-add`/`.acct-toolbar-lock` classes with inline SVG icons. Removed nested `<div class="card">` wrapper (caused double borders) — form itself is now the card with `.acct-form-grid` (3-column), `.acct-form-field` wrappers with proper labels, `.acct-color-wrapper` squircle around color picker. Custom Fields uses `.acct-fields-section`/`.acct-fields-header`. Balanced Save/Cancel buttons. Empty state now SVG credit card icon with title+subtitle. Full dark mode for all new elements.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **3 files changed:** js/accounting-export.js (765→856 lines), css/accounting.css (412→467 lines), plugins/accounting.html (288→329 lines).

### Previous Session Notes (March 12, 2026)

- **Encrypted Accounting Vault — PIN + AES-256-GCM + Multi-Account CRUD:** Tabbed layout: "🔐 Account Info" (vault tab) and "🛠 Export Tools" (export tab). PIN system: SHA-256 hashed, 3/6-try lockout escalation (60s/5min), Firebase re-auth recovery. AES-256-GCM encryption via CryptoHelper. Multi-account CRUD with name, type, color, dynamic custom fields. Toggle field visibility with 10s auto-re-mask, 30s clipboard auto-clear. Auto-lock: 15min inactivity + visibility change. V1 migration: old 7-field vault auto-converts to single "HawkSoft / Trust Account" on first PIN setup. Storage: `altech_acct_vault_v2` (encrypted), `altech_acct_vault_meta` (PIN hash+salt). Cloud sync: vaultData + vaultMeta pushed/pulled via Firestore (10 doc types total). Full dark mode for all new elements.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **4 files changed:** js/accounting-export.js (392→765 lines), css/accounting.css (225→412 lines), plugins/accounting.html (252→288 lines), js/cloud-sync.js (651→664 lines).

### Previous Session Notes (March 11, 2026)

- **Renewed Policies Stay Urgent — needsStateUpdate Flag:** All 4 renewal detection paths in `checkForRenewals()` now set `noteData.needsStateUpdate = true` when clearing verified/dismissed markers. Note dedup: skips adding "Auto-cleared" note if flag already set (prevents spam). `markStateUpdated()` clears the flag + calls `filterPolicies()` to re-sort immediately. New `_needsStateUpdate(pn)` helper. `sortPolicies()` overrides: policies with `needsStateUpdate && !stateUpdated` always sort first (above everything). `renderPolicies()` shows amber "⚠️ Renewed" badge with `.needs-state-update` class + row tint. Full dark mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,426→2,448 lines), css/compliance.css (1,223→1,234 lines).

### Previous Session Notes (March 10, 2026)

- **Renewal Dedup — CGL Compliance Dashboard:** Added `deduplicateRenewals()` method with two-phase logic. Phase 1: same-policyNumber dedup keeps only the latest expiration, marks survivor with `_renewedFrom`. Phase 2: cross-number renewal detection — same client + same policyType with one expired and one active auto-dismisses the expired entry as superseded. Integrated at all 3 policy assignment points (before `checkForRenewals()`). Blue "🔄 Renewed" / "🔄 Renewal confirmed" badge in dates column with dark mode support.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/compliance-dashboard.js (2,356→2,426 lines), css/compliance.css (1,211→1,223 lines).

### Previous Session Notes (March 10, 2026)

- **Employment & Education Consolidation — Inline in About You Card:** Removed standalone Employment & Education card from Step 1. Moved education/occupation/industry selects inline into the About You card between marital status and co-applicant toggle, with "→ Also on Drivers" badge. Added co-applicant Employment & Education (`#coEmploymentSection`) inside `#coApplicantSection` with `coEducation`, `coOccupation`, `coIndustry` selects. Industry `onchange` calls `_populateCoOccupation()`.
- **`_populateCoOccupation(industry, currentValue)`:** New method mirrors `_populateOccupation()` targeting `#coOccupation` using shared `_OCCUPATIONS_BY_INDUSTRY` map. Called from `applyData()`.
- **Demo client data:** Added `coEducation: 'Bachelors'`, `coOccupation: 'Software Engineer'`, `coIndustry: 'Information Technology'` to `loadDemoClient()`.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** plugins/quoting.html (2,019→2,091 lines), js/app-core.js (2,475→2,495 lines).

### Previous Session Notes (March 10, 2026)

- **Print-to-PDF — Commercial Policy Dashboard:** Added Print button in header, selection toolbar with Select All/Deselect All/count/Generate PDF/Cancel. Checkbox column injected into table in print mode (excludes verified/dismissed). Landscape A4 PDF via jsPDF with color-coded status, all note entries with timestamps, alternating row shading, page numbers. `refresh()` auto-exits print mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **3 files changed:** plugins/compliance.html (206→223 lines), css/compliance.css (1,046→1,211 lines), js/compliance-dashboard.js (2,147→2,356 lines).

### Previous Session Notes (March 9, 2026)

- **SOS Lookup Overhaul — Oregon Socrata + WA DOR Fallback + AZ Deep Link:** Fixed all 3 state SOS lookups that were returning null/failing.
- **Oregon SOS:** Replaced dead HTML scraper with real Oregon Socrata API (`data.oregon.gov/resource/tckn-sxa6.json`). SoQL queries, groups records by `registry_number`, extracts agents and principals.
- **WA SOS DOR fallback:** All 3 WA SOS error paths now try WA DOR API (`secure.dor.wa.gov/gteunauth/_/GetBusinesses`) before falling back to manual search. Returns `partialData: true` with UBI, trade name, entity type, status.
- **Arizona SOS deep link:** Replaced dead scraper with pre-filled deep link to eCorp search results. Returns `deepLinked: true` with `tip`.
- **Client-side display:** New status pills for partial data (blue) and deep link (orange). `_formatSOSData` shows partial data banner + source badge + details URL link. `_formatSOSError` rewritten with deep link support, state-specific messaging, and underwriting gap warning.
- **AI prompt update:** `buildDataContext()` now flags SOS unavailability and partial data. AI user prompt includes conditional SOS DATA GAP instruction.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** api/prospect-lookup.js (1,563→1,788 lines), js/prospect.js (1,859→1,917 lines).

### Previous Session Notes (March 8, 2026)

- **Aggressive Auto-Save — Client History Never Lost:** Fixed critical data loss bug where sessions never reached step-6 were never saved to `altech_client_history`. Root cause: `autoSaveClient()` was only called in `updateUI()` gated by `curId === 'step-6'`.
- **Auto-save on every step change:** Removed step-6 gate — `autoSaveClient()` now fires on every step transition.
- **Debounced client history save on form input:** New `_scheduleClientHistorySave()` (3s debounce) called from `save()` after every form data write.
- **Immediate save on navigation:** New `_saveClientHistoryNow()` (no debounce) called from `next()`, `prev()`, `goHome()`, `logExport()`, and `startFresh()`.
- **`beforeunload` safety net:** New handler in `app-boot.js` calls `_saveClientHistoryNow()` on page close/refresh/tab close.
- **Persistent "Save" button:** Added `btnSaveClient` with floppy disk SVG icon in quoting header, styled with hover/active states + dark mode.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **5 files changed:** js/app-core.js (2,219→2,475 lines), js/app-boot.js (287→295 lines), js/app-quotes.js (760→762 lines), plugins/quoting.html (2,016→2,019 lines), css/main.css (3,445→3,486 lines).

### Previous Session Notes (March 7, 2026)

- **Auto Intake — Primary Applicant Driver Sync:** New `syncPrimaryApplicantToDriver()` method auto-creates Driver 1 with `isPrimaryApplicant: true`, copying name/DOB/gender/marital/education/occupation/industry from App.data. Live-syncs via `restorePrimaryApplicantUI()` change/blur listeners on Step 1 fields. Primary applicant driver cannot be removed.
- **Per-Driver Driving History:** Removed global Driving History card from Step 4. Each driver card now has accidents textarea, violations textarea, and studentGPA input. Migration copies global→Driver 1 on first step-4 visit. PDF/CMSMTF exports aggregate per-driver data with "Driver N:" prefixes, falling back to global for backward compat.
- **Employment & Education moved to Step 1:** Demographics card relocated from Step 2 to Step 1 after co-applicant section. Renamed "Employment & Education".
- **Scan updates:** All 3 driver creation sites (DL scan, policy primary, policy additional) now include `isPrimaryApplicant`, `isCoApplicant`, `accidents`, `violations`, `studentGPA`.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **5 files changed:** plugins/quoting.html (1,926 lines), js/app-core.js (2,219 lines), js/app-vehicles.js (816 lines), js/app-export.js (963 lines), js/app-scan.js (1,585 lines).

- **PDF Export & Form Data — 7-Bug Fix:** (1) Client name blank on PDF — switched to `v()` helper with DOM fallback. (2) Dates off by one day — `formatDate()` now uses UTC getters. (3) Co-applicant section missing — three-part fix: `save(e)` guards `hasCoApplicant` checkbox, schema migration v1→v2 normalizes values, PDF/CMSMTF checks accept truthy variants. (4) Raw currency in auto coverage — wrapped 4 fields in `formatCurrency()`. (5) Satellite overlapping text — saved y position, advanced past block, enlarged thumbnail 30×24→45×36. (6) Legacy field names — added 7 migrations in v1→v2 schema. (7) Visual polish — logo 18→22, gap 16→18, satellite enlarged, "View on Maps" link replaced with plain text.
- **Schema version:** Bumped from 1 → 2 with full v1→v2 migration (hasCoApplicant normalization + 7 legacy field name renames).
- **Firestore load fix:** Added debounced `save()` at end of `applyData()` to persist cloud/history data.
- **Tests:** 23 suites, 1515 tests (unchanged).
- **2 files changed:** js/app-export.js (978→996 lines), js/app-core.js (2,342→2,376 lines).

### Previous Session Notes (March 5, 2026)

- **+ New Log Button:** Added reset button in HawkSoft Logger header — clears client, channel (→Inbound), activity, notes, preview/confirm panels. Keeps agent initials. SVG + icon.
- **Agency Glossary:** New textarea in Settings (500-char max) for custom shorthand terms (e.g., "MoE = Mutual of Enumclaw"). Stored in `altech_agency_glossary`, sent in formatOnly fetch, injected into AI userMessage, cloud-synced as 8th doc type.
- **CHANNEL_MAP LogAction Fix:** Walk-In 2→21, Email 3→33, Text 4→41. Were incorrectly using Phone sub-codes.
- **Tests:** 26 new tests. Total: 23 suites, 1515 tests.
- **9 files changed:** api/hawksoft-logger.js, plugins/call-logger.html, css/call-logger.css, js/call-logger.js, index.html, css/auth.css, js/cloud-sync.js, tests/call-logger.test.js, tests/hawksoft-logger.test.js

### Previous Session (March 4, 2026)

- **Call Logger Redesign:** Replaced `<select>` dropdown with 5 SVG-icon channel quick-tap buttons (Inbound/Outbound/Walk-In/Email/Text) + 8 activity-type pill buttons with note templates. Full HTML/CSS/JS rewrite. Added CHANNEL_MAP to hawksoft-logger.js.
- **Tests:** 26 new tests (source analysis + behavioral JSDOM). Total: 23 suites, 1489 tests.
- **6 files changed:** api/hawksoft-logger.js, plugins/call-logger.html, css/call-logger.css, js/call-logger.js, tests/call-logger.test.js, tests/hawksoft-logger.test.js
- **HawkSoft Logger Bug Fixes + Rename:** Fixed wrong method/direction/party in log push (expanded CHANNEL_MAP to objects). Fixed invisible agent initials (moved to RE: line + post-processing). Renamed Call Logger to HawkSoft Logger across 7 files with eagle icon. 5 new tests.
- **Hawk Icon + Activity Templates + activityType Pipeline:** Added hawk SVG to sidebar ICONS, updated TOOL_ICONS mapping. Updated 6 activity templates to completed-action language (Payment received, Policy change processed, etc.). Piped `activityType` through fetch body → API destructure → AI user message. Added SYSTEM_PROMPT rule 10 for activity-type voice guidance. 4 new tests.

### Previous Session (March 2, 2026)

- **Desktop Layout Overhaul**: Full-width redesign across all 15 plugins — every container widened from 1200px → 1400px, generic plugin constraint widened from 1100px → 1400px.
- **2-Column Layouts**: Q&A (380px | 1fr), Email (1fr | 1fr), VIN Decoder (1fr | 380px), Accounting (1fr | 1fr) — all with sticky right columns at 960px+ breakpoint.
- **HawkSoft Logger**: `:has()` CSS conditional grid — auto-switches from 1fr to 1fr|1fr when right column is visible.
- **Quoting Wizard**: Widened to 1400px; removed redundant 1280px override; removed step-6 hero grid/secondary row max-width caps.
- **CGL Compliance**: Stat card min-height 90px, wider search/filter inputs (280px min), larger buttons.
- **QuickRef**: 3-col phonetic grid at 960px+, 4-col at 1280px+.
- **Language**: All 12 "tap" → "click" replacements across 7 HTML/JS files for desktop-first language.
- **24 files changed**, 183 insertions, 90 deletions.
- Validation: `npx jest --no-coverage` → 23/23 suites passed, 1485/1485 tests.

*Last updated: March 25, 2026*

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
