---
name: storage-keys
description: >
  Prevents hardcoded localStorage key drift in Altech Field Lead.
  Use this skill when adding a new plugin, adding a new localStorage key, reading/writing any localStorage,
  or when you see any 'altech_*' string hardcoded in a JS module.
  Covers the STORAGE_KEYS registry, how to add a new key, all existing keys with sync status,
  and the HTML escaping utilities (Utils.escapeHTML / Utils.escapeAttr).
---

# Storage Keys & Utils — Altech Field Lead

## The Single Rule

**Never hardcode `'altech_*'` strings in any JS module.** Always use `STORAGE_KEYS.KEY_NAME`.

```javascript
// ✅ Correct
const data = Utils.tryParseLS(STORAGE_KEYS.REMINDERS, []);
localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(updated));
CloudSync.schedulePush();

// ❌ Wrong — key drift risk
const data = JSON.parse(localStorage.getItem('altech_reminders') || '[]');
localStorage.setItem('altech_reminders', JSON.stringify(updated));
```

`window.STORAGE_KEYS` is defined in `js/storage-keys.js` and loaded before `window.App`.
It is a frozen object — you cannot add keys at runtime (intentional).

---

## How to Add a New Key

1. Open `js/storage-keys.js`
2. Add your constant to the correct category section inside `Object.freeze({...})`
3. Follow the naming convention: `SCREAMING_SNAKE_CASE`, prefix-free (no `ALTECH_`)

```javascript
// js/storage-keys.js — inside the Object.freeze({...}) block
// ── Your Plugin (📱 local-only) ──────────────────────
YOUR_PLUGIN:    'altech_your_plugin',
```

4. Use `STORAGE_KEYS.YOUR_PLUGIN` everywhere in your plugin module
5. If the key is cloud-synced, also add it to `SYNC_DOCS` in `js/cloud-sync.js` (see cloud-sync skill)
6. Add the key to the CHANGELOG

---

## Complete Key Registry

### Core App (cloud-synced ✅)

| Constant | Value | Notes |
|----------|-------|-------|
| `FORM` | `altech_v6` | `App.data` — encrypted. **NEVER write directly.** Use `App.save()`. |
| `QUOTES` | `altech_v6_quotes` | Saved drafts — encrypted. Use `App.saveAsQuote()`. |
| `DOC_INTEL` | `altech_v6_docintel` | Document intelligence scan results |
| `CLIENT_HISTORY` | `altech_client_history` | Auto-saved client lookup history |

### Plugin Data (cloud-synced ✅)

| Constant | Value | Module |
|----------|-------|--------|
| `CGL_STATE` | `altech_cgl_state` | ComplianceDashboard |
| `QUICKREF_CARDS` | `altech_quickref_cards` | QuickRef |
| `QUICKREF_NUMBERS` | `altech_quickref_numbers` | QuickRef |
| `REMINDERS` | `altech_reminders` | Reminders |
| `AGENCY_GLOSSARY` | `altech_agency_glossary` | CallLogger / Settings |
| `ACCT_VAULT` | `altech_acct_vault_v2` | AccountingExport (encrypted AES-256-GCM) |
| `ACCT_VAULT_META` | `altech_acct_vault_meta` | AccountingExport (PIN hash + salt) |

### Plugin Data (local-only ❌ not synced)

| Constant | Value | Module |
|----------|-------|--------|
| `CGL_CACHE` | `altech_cgl_cache` | ComplianceDashboard |
| `COI_DRAFT` | `altech_coi_draft` | COI |
| `EMAIL_DRAFTS` | `altech_email_drafts` | EmailComposer (encrypted) |
| `EMAIL_CUSTOM_PROMPT` | `altech_email_custom_prompt` | EmailComposer |
| `ACCT_HISTORY` | `altech_acct_history` | AccountingExport |
| `SAVED_PROSPECTS` | `altech_saved_prospects` | ProspectInvestigator |
| `VIN_HISTORY` | `altech_vin_history` | VinDecoder (max 20) |
| `QNA` | `altech_v6_qna` | PolicyQA |
| `QUOTE_COMPARISONS` | `altech_v6_quote_comparisons` | QuoteCompare (max 20) |
| `INTAKE_ASSIST` | `altech_intake_assist` | IntakeAssist |
| `HAWKSOFT_SETTINGS` | `altech_hawksoft_settings` | HawkSoftExport |
| `HAWKSOFT_HISTORY` | `altech_hawksoft_history` | HawkSoftExport |
| `EZLYNX_FORMDATA` | `altech_ezlynx_formdata` | EZLynxTool |
| `EZLYNX_INCIDENTS` | `altech_ezlynx_incidents` | EZLynxTool |

### Settings & Identity

| Constant | Value | Notes |
|----------|-------|-------|
| `DARK_MODE` | `altech_dark_mode` | Cloud-synced via settings doc |
| `ONBOARDED` | `altech_onboarded` | First-run flag |
| `USER_NAME` | `altech_user_name` | Set during onboarding |
| `AGENCY_PROFILE` | `altech_agency_profile` | Set during onboarding |
| `ENCRYPTION_SALT` | `altech_encryption_salt` | PBKDF2 salt — **NEVER sync to cloud** |
| `SYNC_META` | `altech_sync_meta` | CloudSync internal metadata |
| `GEMINI_KEY` | `gemini_api_key` | User's own Gemini API key |

---

## Utils — HTML Escaping (CRITICAL)

These functions live on `window.Utils` (`js/utils.js`). **Never define them inline in a plugin.**

| Function | When to use |
|----------|------------|
| `Utils.escapeHTML(str)` | Any user/AI text inserted into HTML content (`.innerHTML`, template literals with untrusted data) |
| `Utils.escapeAttr(str)` | Values in HTML attributes: `<div data-name="${Utils.escapeAttr(name)}">` |
| `Utils.tryParseLS(key, fallback)` | Reading any localStorage value that might be JSON |
| `Utils.debounce(fn, ms)` | Delaying saves, search inputs; returned fn has `.cancel()` |

```javascript
// ✅ Correct — escaping untrusted data in HTML
container.innerHTML = items.map(item => `
    <div class="card" data-id="${Utils.escapeAttr(item.id)}">
        <p>${Utils.escapeHTML(item.userNote)}</p>
    </div>
`).join('');

// ❌ Wrong — XSS risk, and duplicates Utils
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
```

---

## STORAGE_KEYS in Tests

JSDOM loads `js/storage-keys.js` as part of the full `index.html` load. In tests, access keys the same way:

```javascript
// In a test
const data = JSON.parse(localStorage.getItem(window.STORAGE_KEYS.REMINDERS) || '[]');
```

If a test helper creates a mini DOM (not loading index.html), inject `storage-keys.js` manually:

```javascript
const storageKeysSource = fs.readFileSync('js/storage-keys.js', 'utf8');
dom.window.eval(storageKeysSource);
```

---

## Cloud Sync Cross-Reference

After writing to any cloud-synced key, always call:

```javascript
CloudSync.schedulePush(); // debounced 3s — safe to call on every write
```

To make a new key cloud-synced, see the `cloud-sync` skill file.
The only change needed is adding one string to the `SYNC_DOCS` array in `js/cloud-sync.js`.
