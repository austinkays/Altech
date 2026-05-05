---
name: altech-field-changes
description: Use when adding, renaming, or removing intake-form fields in the Altech project — anything that touches js/fields.js, plugins/quoting.html, App.data, or storage-key declarations. Covers the full chain a field has to survive: declaration → DOM → save → load → exporter → test. Skip for pure styling, copy edits, or non-field code.
---

# Field changes — Altech checklist

A new or renamed intake field in this codebase touches at least 7 files. Miss any one and the data either doesn't save, doesn't load, vanishes at export time, or breaks an existing client's saved record. This skill is the punch list.

## When to apply this

- Editing `js/fields.js` (the field registry)
- Adding a new `<input id="…">` / `<select id="…">` / `<textarea id="…">` to `plugins/quoting.html`
- Renaming an existing field id
- Renaming a `storageKey`
- Adding/removing `ezlynxRequired: true` on a field
- Touching `App.data` keys directly in `js/app-*.js`

## The chain

A field has to be wired end-to-end. Walk the chain in this order:

### 1. Declare in `js/fields.js`

Every form input needs an entry. Schema:

```js
{ id: 'newField', label: 'New Field', type: 'text', section: 'applicant', ezlynxRequired: true }
```

- `id` matches the HTML input's `id`. Don't drift.
- `storageKey` defaults to `id` — only set explicitly if renaming the DOM id while preserving saved-data compatibility (almost never).
- `section` is one of: `applicant | coapplicant | address | property | roof | systems | hazards | home-coverage | home-endorsements | auto-coverage | prior-insurance | notes`. The export picker's readiness modal uses this to map blank fields to the right step.
- `ezlynxRequired: true` means the field is required for EZLynx export. Triggers the ✦ marker in the form, the "needs review" badge after import, and forces wire-format coverage in `exportClientJsonForFiller`.

### 2. Render in `plugins/quoting.html`

Match the existing label markup style (the badge stamper parent-walks based on this):

```html
<div>
    <label class="label">New Field</label>
    <input type="text" id="newField" placeholder="…">
</div>
```

`for=` attributes are mostly absent — labels are visually associated by DOM nesting. The `_findFieldLabel` helper (js/app-scan.js) walks parents the same way `_stampEzlynxLabels` (js/app-navigation.js) does. If the new field uses an unusual wrapper (e.g. `.label-with-hint`, double-nested div), verify both helpers find the label.

The input must live inside `#quotingTool` so the body-level event delegation in `app-core.js` catches input/change events and calls `App.save()`.

### 3. Renames need a migration

If you rename a `storageKey`, add a migration in `js/app-core.js _migrateSchema()` that copies old → new and deletes the old key. Existing client saves don't auto-update otherwise — the field will appear blank on reload for any client saved before the rename.

```js
// in _migrateSchema()
if (data.oldName !== undefined) {
    data.newName = data.oldName;
    delete data.oldName;
}
```

### 4. Wire to exporters

If `ezlynxRequired: true`, the contract test (`tests/exporter-contract.test.js`) and coverage test (`tests/ezlynx-required-coverage.test.js`) will fail until the field reaches at least one downstream exporter:

- **`exportClientJsonForFiller`** (js/app-export.js) — the EZLynx desktop filler's wire format. Add a key here. Update `EZLYNX_REQUIRED_TO_FILLER_KEY` in `tests/ezlynx-required-coverage.test.js` to match.
- **`buildEZLynxXML`** / **`buildEZLynxHomeXML`** (js/app-export-acord-xml.js) — only if the V200 schema has a slot. If not, document in `NOT_IN_EZAUTO` / `NOT_IN_EZHOME` with a one-line reason.
- **`buildCMSMTF`** (js/app-export-cmsmtf.js) — HawkSoft tagged file. Wire as a direct tag if there's a HawkSoft variable, else pack into the misc-data section.
- **`buildPDF`** (js/app-export-pdf.js) — PDF summary.

### 5. Wire to importer (if EZLynx XML supports it)

If the field comes back from a HawkSoft EZLynx XML export, add a setter in `_applyEZLynxData` (js/app-scan.js). Round-trip test (`tests/ezlynx-roundtrip.test.js`) catches asymmetric wiring.

### 6. Run the tests

```bash
npx jest tests/ezlynx-required-coverage.test.js tests/exporter-contract.test.js tests/ezlynx-export-filler.test.js tests/ezlynx-roundtrip.test.js --no-coverage
```

Or the full suite:
```bash
npm test
```

The contract tests will tell you exactly which exporter is missing the field with a one-line failure.

### 7. CHANGELOG entry

Per `CLAUDE.md`: after any work session, add an entry to `CHANGELOG.md`. Field changes go under `### Added` / `### Changed`.

## Anti-patterns (don't do these)

- Hardcoding `'altech_*'` strings — always use `STORAGE_KEYS.X` (defined in `js/storage-keys.js`).
- Writing to `localStorage.setItem(STORAGE_KEYS.FORM, …)` directly — go through `App.save()`.
- Calling `CloudSync.xxx` directly in new code — use `window.Sync.xxx` (routes to Firebase or Supabase via the facade).
- Renaming a `storageKey` without a migration in `_migrateSchema`.
- Adding a field to `quoting.html` without a `fields.js` entry — the audit script and FIELD_BY_ID lookups won't find it.
- Adding an `ezlynxRequired: true` field without wiring it to at least one exporter — the contract test fails.
- Rolling your own `escapeHTML` — use `Utils.escapeHTML`.

## Driver / vehicle fields

Driver and vehicle objects live in `App.drivers` / `App.vehicles` (arrays), NOT `App.data`. Per-driver/per-vehicle fields don't go in `fields.js`. They're rendered dynamically by `App.renderDrivers()` / `App.renderVehicles()` in `js/app-vehicles.js`. Adding a per-driver field needs:

- The field key on the driver object shape (e.g. `relationship`, `dob`)
- Render template update in `app-vehicles.js`
- `_applyEZLynxData` setter for round-trip
- `exportClientJsonForFiller`'s `Drivers[]` array map

## Quick verification

Before committing, sanity-check by running both diff queries:

```bash
# Inputs in HTML but not declared in fields.js
grep -oE 'id="[a-zA-Z0-9_]+"' plugins/quoting.html | sort -u > /tmp/form.txt
grep -oE "id: '[a-zA-Z0-9_]+'" js/fields.js | sort -u > /tmp/decl.txt
comm -23 /tmp/form.txt /tmp/decl.txt
```

Orphans should be UI-only state (toggles, file pickers, phonetic spelling popups). Anything that holds saved client data needs a `fields.js` entry.
