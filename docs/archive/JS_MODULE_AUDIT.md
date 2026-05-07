# JS Module Audit — Exhaustive Documentation

> Auto-generated documentation for all 15 core JS files in `/js/`.
> Total: **13,137 lines** across 15 files.

---

## Table of Contents

1. [app-init.js (89 lines)](#1-app-initjs-89-lines)
2. [firebase-config.js (117 lines)](#2-firebase-configjs-117-lines)
3. [crypto-helper.js (150 lines)](#3-crypto-helperjs-150-lines)
4. [app-boot.js (286 lines)](#4-app-bootjs-286-lines)
5. [auth.js (587 lines)](#5-authjs-587-lines)
6. [ai-provider.js (599 lines)](#6-ai-providerjs-599-lines)
7. [cloud-sync.js (724 lines)](#7-cloud-syncjs-724-lines)
8. [app-quotes.js (756 lines)](#8-app-quotesjs-756-lines)
9. [dashboard-widgets.js (790 lines)](#9-dashboard-widgetsjs-790-lines)
10. [app-vehicles.js (843 lines)](#10-app-vehiclesjs-843-lines)
11. [app-export.js (973 lines)](#11-app-exportjs-973-lines)
12. [app-popups.js (1,447 lines)](#12-app-popupsjs-1447-lines)
13. [app-scan.js (1,715 lines)](#13-app-scanjs-1715-lines)
14. [app-property.js (1,728 lines)](#14-app-propertyjs-1728-lines)
15. [app-core.js (2,337 lines)](#15-app-corejs-2337-lines)

---

## 1. app-init.js (89 lines)

### Global Export
```js
window.App = App;   // const App = { ... }
```

### Public Properties
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `data` | `{}` | `{}` | Form field data (mirrors localStorage `altech_v6`) |
| `step` | `number` | `0` | Current wizard step index |
| `flow` | `string` | `'home'` | Active workflow (`home` / `auto` / `both`) |
| `storageKey` | `string` | `'altech_v6'` | Main form localStorage key |
| `quotesKey` | `string` | `'altech_v6_quotes'` | Saved quotes localStorage key |
| `docIntelKey` | `string` | `'altech_v6_docintel'` | Document intelligence localStorage key |
| `scanFiles` | `array` | `[]` | Files queued for policy scan |
| `extractedData` | `object` | `null` | Last scan extraction result |
| `encryptionEnabled` | `boolean` | `true` | Whether AES encryption is active |
| `drivers` | `array` | `[]` | Driver objects |
| `vehicles` | `array` | `[]` | Vehicle objects |
| `selectedQuoteIds` | `Set` | `new Set()` | Currently selected quote IDs for batch export |
| `mapPreviewCache` | `object` | `{}` | Cached map preview URLs |
| `saveTimeout` | `any` | `null` | Debounce timer for save() |
| `saveToken` | `number` | `0` | Concurrency guard for save/load |

### Static Data Structures
| Name | Description |
|------|-------------|
| `workflows` | `{ home: [0,1,2,3,5,6], auto: [0,1,2,4,5,6], both: [0,1,2,3,4,5,6] }` |
| `toolNames` | Legacy key→title map for all plugin tools |
| `toolConfig[]` | 14-entry config array: `key, icon, color, title, name, containerId, initModule, htmlFile, category, badge?, hidden?, section?` |
| `stepTitles` | Step index → display title (e.g. `0: 'Type'`, `1: 'Client'`, etc.) |

### localStorage Keys
None directly read/written — defines key *names* as properties only.

### Cross-File Dependencies
None — this is the foundation object.

### Event Listeners
None.

### Encryption Usage
None.

---

## 2. firebase-config.js (117 lines)

### Global Export
```js
const FirebaseConfig = (() => { ... })();   // IIFE, globally scoped
```

### Public Methods / Properties
| Method | Signature | Description |
|--------|-----------|-------------|
| `init()` | `async init()` | Fetches config from `/api/config?type=firebase`, loads Firebase SDK from CDN, initializes app/auth/firestore, enables offline persistence |
| `app` | getter | Firebase app instance |
| `auth` | getter | `firebase.auth()` instance |
| `db` | getter | `firebase.firestore()` instance |
| `isReady` | getter | `boolean` — SDK initialized and not errored |
| `sdkLoaded` | getter | `boolean` — Firebase SDK scripts loaded |

### localStorage Keys
None.

### Cross-File Dependencies
- Reads: None (standalone bootstrap)
- Used by: `auth.js`, `cloud-sync.js`, `app-boot.js`

### Event Listeners
None.

### Encryption Usage
None.

---

## 3. crypto-helper.js (150 lines)

### Global Exports
```js
const CryptoHelper = { ... };   // Global object
function safeSave(key, value) { ... }   // Global function
```

### CryptoHelper Public Methods
| Method | Signature | Description |
|--------|-----------|-------------|
| `getEncryptionKey()` | `async getEncryptionKey()` | Derives AES-256-GCM key via PBKDF2 (100K iterations) from a composite passphrase (userAgent + screen + timezone + hardcoded salt). Returns `CryptoKey`. |
| `getDeviceFingerprint()` | `getDeviceFingerprint()` | Returns SHA-256 hash of userAgent+screen+language+timezone+plugins |
| `generateUUID()` | `generateUUID()` | crypto.randomUUID() with fallback to manual v4 UUID |
| `encrypt(data)` | `async encrypt(data)` | AES-256-GCM encryption → returns `{iv, data, v}` JSON string. Passthrough if Web Crypto unavailable. |
| `decrypt(encryptedData)` | `async decrypt(encryptedData)` | Reverses `encrypt()`. Handles both encrypted JSON and plain text gracefully. |

### safeSave(key, value)
Wrapper around `localStorage.setItem()` that catches `QuotaExceededError`, calls `CloudSync.schedulePush()` on success, and shows `App.toast()` on failure.

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_encryption_salt` | READ + WRITE | Random salt for PBKDF2 derivation (generated once, persisted) |

### Cross-File Dependencies
- `CloudSync.schedulePush()` (called by `safeSave` on successful write)
- `App.toast()` (called by `safeSave` on quota error)

### Event Listeners
None.

### Encryption Usage
**This IS the encryption module.** AES-256-GCM via Web Crypto API. PBKDF2 key derivation with 100,000 iterations, random 12-byte IV per encryption. Version-tagged output (`v: 1`).

---

## 4. app-boot.js (286 lines)

### Global Exports
```js
window.loadPlacesAPI = async function() { ... }
window.initPlaces = function() { ... }
window.SecurityInfo = { show(), close() }
```

### Public Methods
| Method | Signature | Description |
|--------|-----------|-------------|
| `loadPlacesAPI()` | `async` | Loads Google Maps JS SDK with Places library, fetches key from `/api/config?type=maps` |
| `initPlaces()` | sync | Calls `App.initPlaces()` — Google Places Autocomplete setup |
| `SecurityInfo.show()` | sync | Shows security info modal |
| `SecurityInfo.close()` | sync | Closes security info modal |

### Boot Sequence (`window.onload`)
1. `App.loadDarkMode()`
2. `FirebaseConfig.init()`
3. `Auth.init()` → wait for `Auth.ready()`
4. `loadPlacesAPI()`
5. `App.renderLandingTools()`
6. `App.updateLandingGreeting()`
7. `App.updateCGLBadge()`
8. `Onboarding.init()`
9. `Reminders.init()` + `Reminders.checkAlerts()`
10. `DashboardWidgets.init()`
11. Hash router setup (reads `location.hash` → `App.navigateTo()` or `App.goHome()`)

### localStorage Keys
None directly.

### Cross-File Dependencies
- `App` (loadDarkMode, renderLandingTools, updateLandingGreeting, updateCGLBadge, initPlaces, navigateTo, goHome, init, toast)
- `FirebaseConfig` (init)
- `Auth` (init, ready)
- `DashboardWidgets` (init)
- `Onboarding` (init)
- `Reminders` (init, checkAlerts)

### Event Listeners
| Event | Target | Description |
|-------|--------|-------------|
| `unhandledrejection` | `window` | Swallows Firebase/auth errors silently |
| `error` | `window` | Logs global errors, shows toast for non-script errors |
| `onload` | `window` | Main boot sequence |
| `hashchange` | `window` | Client-side router — maps `#toolKey` to `App.navigateTo()`, `#home` to `App.goHome()` |
| `keydown` | `document` | Cmd+S (save), Escape (go home / close modals), Cmd+K (focus search), Enter (advance wizard) |
| `mousemove` | `document` | 3D tilt effect on card elements |
| `mouseleave` | `document` | Reset 3D tilt |
| `mouseout` | `document` | Reset 3D tilt |
| `touchmove` | `document` | 3D tilt for touch |
| `touchend` | `document` | Reset 3D tilt |

Also registers a **ServiceWorker** (`/sw.js`) for offline support.

### Encryption Usage
None directly.

---

## 5. auth.js (587 lines)

### Global Export
```js
const Auth = (() => { ... })();
window.Auth = Auth;
```

### Public Methods
| Method | Signature | Description |
|--------|-----------|-------------|
| `init()` | `async` | Sets up `onAuthStateChanged`, loads user profile from Firestore, handles admin/blocked status, triggers sync |
| `ready()` | `async` | Returns promise that resolves when auth state is first determined |
| `getIdToken()` | `async` | Returns Firebase ID token (for API calls) |
| `apiFetch(url, opts)` | `async` | Fetch wrapper that injects `Authorization: Bearer {idToken}` header |
| `onAuthChange(fn)` | sync | Registers auth state change callback |
| `showModal()` | sync | Opens auth modal (login/signup/password reset) |
| `closeModal()` | sync | Closes auth modal |
| `signup()` | `async` | Email/password signup → creates Firestore profile → auto-verif email |
| `login()` | `async` | Email/password login → loads profile → triggers CloudSync pullFromCloud |
| `resetPassword()` | `async` | Firebase `sendPasswordResetEmail` |
| `updateName()` | `async` | Updates `displayName` on Firebase user + Firestore profile |
| `logout()` | `async` | Signs out, clears state, pushes to cloud first, hides dashboard |
| `resendVerification()` | `async` | Resends email verification |
| `changePassword()` | `async` | Re-authenticates then updates password |

### Public Getters
| Getter | Returns |
|--------|---------|
| `user` | Firebase User object or null |
| `isSignedIn` | `boolean` |
| `uid` | User UID string or null |
| `email` | User email or null |
| `displayName` | Display name or null |
| `isEmailVerified` | `boolean` |
| `isAdmin` | `boolean` (from Firestore profile) |
| `isBlocked` | `boolean` (from Firestore profile) |

### localStorage Keys
None directly (uses Firestore for profile persistence, delegates to CloudSync for data sync).

### Firestore Paths
- READ/WRITE: `users/{uid}` (profile: displayName, email, role, blocked, plan, createdAt, lastLogin)

### Cross-File Dependencies
- `FirebaseConfig` (auth, db, isReady)
- `App` (toast, updateLandingGreeting, goHome)
- `CloudSync` (pushToCloud, pullFromCloud, schedulePush, fullSync)
- `Paywall` (checkAccess, optional)
- `Onboarding` (getUserName, optional)
- `DashboardWidgets` (renderHeader, hideDashboard)

### Event Listeners
| Event | Target | Description |
|-------|--------|-------------|
| `message` | `window` | Listens for `ALTECH_BRIDGE_READY` and `ALTECH_ADMIN_UPDATE` messages from Chrome extension bridge |

### Encryption Usage
None (delegates encrypted data handling to other modules).

---

## 6. ai-provider.js (599 lines)

### Global Export
```js
window.AIProvider = (() => { ... })();   // IIFE
```

### Public Methods
| Method | Signature | Description |
|--------|-----------|-------------|
| `getSettings()` | sync | Returns `{provider, model, apiKey}` from localStorage |
| `saveSettings(settings)` | sync | Saves AI settings to localStorage |
| `getProvider()` | sync | Returns current provider key (e.g. `'google'`) |
| `getModel()` | sync | Returns current model ID |
| `getApiKey()` | sync | Returns stored API key for current provider |
| `isConfigured()` | sync | `true` if an API key exists (any provider) |
| `isAvailable()` | sync | `true` if configured or server proxy is available |
| `resolveApiKey(provider)` | sync | Returns API key for specified provider (with legacy fallback) |
| `ask(prompt, opts)` | `async` | Single-turn AI request. Routes to Google/OpenRouter/OpenAI/Anthropic endpoints. Supports `{temperature, maxTokens, systemPrompt, responseSchema, tools}` |
| `chat(messages, opts)` | `async` | Multi-turn chat with same routing |
| `extractJSON(text)` | sync | Extracts JSON from markdown code fences or raw text |
| `testConnection()` | `async` | Sends "Reply with OK" test prompt, returns `{success, text?, error?}` |

### Public Constants
| Name | Description |
|------|-------------|
| `PROVIDERS` | Provider registry: `google`, `openrouter`, `openai`, `anthropic`. Each has: `name`, `models[]`, `defaultModel`, `keyPlaceholder`, `keyUrl`, `supportsVision`, `supportsTools`, `cors` |
| `TAG_LABELS` | Tag key→label map (e.g. `fast: '⚡ Fast'`, `vision: '👁️ Vision'`, `thinking: '🧠 Thinking'`) |

### Provider Models (Selection)
- **Google**: Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash
- **OpenRouter**: Claude Opus 4, Claude Sonnet 4, GPT-4.1, o3, DeepSeek V3/R1, Llama 4 Maverick/Scout, Qwen 3.5 235B, Gemini 2.5 Pro
- **OpenAI**: GPT-4.1, GPT-4.1 mini, o3, o4 mini
- **Anthropic**: Claude Opus 4, Claude Sonnet 4

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_ai_settings` | READ + WRITE | `{provider, model, apiKey}` |
| `gemini_api_key` | READ only | Legacy key fallback for Google provider |

### Cross-File Dependencies
- `Auth.apiFetch()` — used for Anthropic proxy route (`/api/anthropic-proxy.js`)

### Event Listeners
None.

### Encryption Usage
None.

---

## 7. cloud-sync.js (724 lines)

### Global Export
```js
const CloudSync = (() => { ... })();   // IIFE, globally scoped
```

### Public Methods
| Method | Signature | Description |
|--------|-----------|-------------|
| `schedulePush()` | sync | Debounced push (3s delay). Called by `safeSave()` after every localStorage write. |
| `pushToCloud()` | `async` | Pushes 7 data types + all quotes to Firestore. Encrypts `currentForm` and `quotes` before upload. |
| `pullFromCloud()` | `async` | Pulls all synced data from Firestore. Decrypts `currentForm` and `quotes`. Detects merge conflicts via timestamp comparison. |
| `fullSync()` | `async` | Pull then push. Shows sync status via toast. |
| `deleteCloudData()` | `async` | Deletes all synced documents from Firestore for current user. |
| `onSync(callback)` | sync | Registers a callback for sync completion events. |
| `getStatus()` | sync | Returns `{isSyncing, lastPush, lastPull, deviceId, errors[]}` |
| `_showConflictDialog(field, local, cloud)` | sync | Shows modal for manual merge conflict resolution |
| `_resolveConflict(field, choice)` | sync | Resolves a merge conflict by choosing local/cloud/merge |

### Public Getters
| Getter | Returns |
|--------|---------|
| `isSyncing` | `boolean` |
| `deviceId` | Device UUID (persisted in localStorage) |
| `isAvailable` | `boolean` (Auth signed in + Firestore ready) |

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_device_id` | READ + WRITE | Unique device identifier (UUID) |
| `altech_sync_meta` | READ + WRITE | `{lastPush, lastPull, deviceId}` sync metadata |
| `altech_v6` | READ + WRITE | Main form data (encrypted in transit) |
| `altech_v6_quotes` | READ + WRITE | Saved quotes (encrypted in transit) |
| `altech_cgl_state` | READ + WRITE | CGL compliance dashboard state |
| `altech_client_history` | READ + WRITE | Client history records |
| `altech_quickref_cards` | READ + WRITE | Quick reference cards |
| `altech_reminders` | READ + WRITE | Reminders data |
| `altech_dark_mode` | READ + WRITE | Dark mode preference (synced as part of `settings` doc) |

### Firestore Paths
- `users/{uid}/sync/settings` — dark mode, theme preferences
- `users/{uid}/sync/currentForm` — encrypted form data
- `users/{uid}/sync/cglState` — CGL compliance state
- `users/{uid}/sync/clientHistory` — client history
- `users/{uid}/sync/quickRefCards` — quick reference cards
- `users/{uid}/sync/reminders` — reminders
- `users/{uid}/quotes/{quoteId}` — individual saved quotes (encrypted)

### Cross-File Dependencies
- `Auth` (isSignedIn, uid, user)
- `FirebaseConfig` (db, isReady)
- `App` (data, drivers, vehicles, applyData, renderDrivers, renderVehicles, toast, updateUI, save, storageKey, quotesKey, load)
- `QuickRef.render()` (optional — refreshes QuickRef after pull)
- `Reminders.render()` (optional — refreshes after pull)
- `ComplianceDashboard.loadState()` (optional — refreshes after pull)
- `CryptoHelper` (encrypt, decrypt — via direct reference)

### Event Listeners
None directly. Triggered by `safeSave()` and explicit calls from `Auth.login()`, `Auth.logout()`.

### Encryption Usage
- `CryptoHelper.encrypt()` — encrypts `currentForm` and each quote before Firestore upload in `pushToCloud()`
- `CryptoHelper.decrypt()` — decrypts `currentForm` and quotes after Firestore download in `pullFromCloud()`

---

## 8. app-quotes.js (756 lines)

### Global Export
```js
Object.assign(App, { ... });   // Extends the App object
```

### Public Methods
| Method | Signature | Description |
|--------|-----------|-------------|
| `getQuotes()` | `async` | Reads `altech_v6_quotes` from localStorage, decrypts, returns array |
| `saveQuotes(quotes)` | `async` | Encrypts and saves quotes array to localStorage |
| `saveQuote()` | `async` | Saves current form state as a new or updated quote (with timestamp, snapshot, carrier info) |
| `loadQuote(id)` | `async` | Loads a saved quote into the active form |
| `deleteQuote(id)` | `async` | Deletes a quote by ID |
| `renderQuoteList()` | `async` | Renders the saved quotes panel with search, filter, sort, select-all |
| `_renderQuoteCard(q)` | sync | Returns HTML for a single quote card |
| `toggleQuoteSelection(id)` | sync | Toggles a quote in `selectedQuoteIds` set |
| `toggleAllQuotes()` | `async` | Selects/deselects all quotes |
| `exportSelectedZip()` | `async` | Exports selected quotes as a ZIP file (CMSMTF + PDF per quote) |
| `exportAllZip()` | `async` | Exports all quotes as a ZIP |
| `_buildZip(quotes)` | `async` | Creates ZIP blob using JSZip with CMSMTF + PDF per quote + manifest.json |
| `saveClientToHistory(data)` | sync | Saves client summary to `altech_client_history` |
| `loadClientFromHistory(entry)` | `async` | Loads a client history entry into the form |
| `getClientHistory()` | sync | Returns parsed client history array |
| `renderClientHistory()` | sync | Renders client history list with search |
| `clearClientHistory()` | sync | Clears all client history |
| `blobToBase64(blob)` | `async` | Converts Blob to base64 data URL |

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_v6_quotes` | READ + WRITE | Encrypted quotes array |
| `altech_v6` | READ + WRITE | Form data (via App.save/load) |
| `altech_client_history` | READ + WRITE | Client history array |
| `altech_drivers` | WRITE | Drivers JSON (during loadQuote restore) |
| `altech_vehicles` | WRITE | Vehicles JSON (during loadQuote restore) |

### Cross-File Dependencies
- `CryptoHelper` (encrypt, decrypt)
- `safeSave()` (for quota-safe writes)
- `CloudSync.schedulePush()` (after save operations)
- `App.save()`, `App.load()`, `App.applyData()`, `App.data`, `App.storageKey`, `App.quotesKey`
- `App.buildCMSMTF()`, `App.buildPDF()`, `App.buildText()` (for ZIP export)
- `App.toast()`, `App.downloadBlob()`
- `JSZip` (library — for batch ZIP creation)
- `Auth.isSignedIn`, `Auth.uid` (quote ownership tagging)

### Event Listeners
None directly registered (UI events are inline `onclick` handlers in rendered HTML).

### Encryption Usage
- `CryptoHelper.encrypt()` — in `saveQuotes()` and `saveClientToHistory()` and `saveDriversVehicles()` (delegated via loadQuote)
- `CryptoHelper.decrypt()` — in `getQuotes()`

---

## 9. dashboard-widgets.js (790 lines)

### Global Export
```js
window.DashboardWidgets = (() => { ... })();   // IIFE
```

### Public Methods
| Method | Signature | Description |
|--------|-----------|-------------|
| `init()` | sync | Renders header + sidebar + dashboard, starts 60s auto-refresh |
| `refreshAll()` | sync | Re-renders all dashboard widgets |
| `showDashboard()` | sync | Shows the command center dashboard |
| `hideDashboard()` | sync | Hides the dashboard |
| `toggleSidebar()` | sync | Collapses/expands sidebar (persists to localStorage) |
| `toggleMobileSidebar()` | sync | Opens/closes mobile sidebar overlay |
| `renderHeader()` | sync | Renders top nav bar with user avatar, sync status, search |
| `icon(name)` | sync | Returns SVG icon by name from `ICONS` map |
| `toolIcon(key)` | sync | Returns tool icon from `TOOL_ICONS` map |

### Public Constants
| Name | Description |
|------|-------------|
| `ICONS` | Map of named SVG icons (home, settings, sync, user, search, moon, sun, chevron, bell, logout, cloud, menu, arrow-left, book, plus) |
| `TOOL_ICONS` | Map of tool key → icon string (mirrors toolConfig icons) |

### Internal Widgets (private, called by `refreshAll()`)
- `_renderRecentQuotesWidget()` — shows 5 most recent quotes
- `_renderCoverageWidget()` — scan coverage % donut + field breakdown
- `_renderRemindersWidget()` — upcoming reminders (due today + next 3)
- `_renderQuickActionsWidget()` — shortcut buttons for common actions
- `_renderSyncStatusWidget()` — cloud sync status + last sync time

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_v6_quotes` | READ | For recent quotes widget |
| `altech_cgl_cache` | READ | For CGL summary in dashboard |
| `altech_cgl_state` | READ | For CGL badge counts |
| `altech_sidebar_collapsed` | READ + WRITE | Sidebar collapsed state |

### Cross-File Dependencies
- `App` (toolConfig, data, navigateTo, goHome, toggleDarkMode, renderQuoteList, openScanPicker, loadQuote, toast)
- `Auth` (isSignedIn, displayName, email, showModal, logout, user)
- `Reminders` (getAll — optional)
- `Onboarding` (getUserName — optional)
- `CloudSync` (getStatus — optional)
- `firebase.auth().currentUser` (avatar display)

### Event Listeners
- **60-second interval** — auto-refreshes all widgets via `setInterval`
- Inline `onclick` handlers in rendered HTML (sidebar nav, tool cards, etc.)

### Encryption Usage
None.

---

## 10. app-vehicles.js (843 lines)

### Global Export
```js
Object.assign(App, { ... });   // Extends the App object
```

### Public Methods — Drivers
| Method | Signature | Description |
|--------|-----------|-------------|
| `addDriver(prefill?)` | sync | Adds a driver object (with optional pre-filled data) |
| `removeDriver(id)` | sync | Removes a driver by ID |
| `updateDriver(id, field, value)` | sync | Updates a single field on a driver |
| `openDriverLicensePicker(driverId)` | sync | Opens file picker for DL scan |
| `handleDriverLicenseFile(driverId, file)` | `async` | Processes DL image (compress → vision API → extract fields) |
| `processDriverLicenseImage(driverId, base64)` | `async` | Sends DL image to `/api/vision-processor.js` for OCR extraction |
| `convertImageToJPEG(file, quality?)` | `async` | Compresses image to max 800×800 JPEG |
| `renderDrivers()` | sync | Renders all driver cards with form fields |

### Public Methods — Vehicles
| Method | Signature | Description |
|--------|-----------|-------------|
| `addVehicle()` | sync | Adds a new vehicle object |
| `removeVehicle(id)` | sync | Removes a vehicle by ID |
| `updateVehicle(id, field, value)` | sync | Updates a single field on a vehicle |
| `decodeVehicleVin(vehicleId)` | `async` | Calls NHTSA VIN decode API → auto-fills year/make/model |
| `renderVehicles()` | sync | Renders all vehicle cards with form fields |

### Public Methods — Persistence
| Method | Signature | Description |
|--------|-----------|-------------|
| `saveDriversVehicles()` | `async` | Encrypts and saves `App.drivers` + `App.vehicles` to `App.data`, then calls `App.save()` |
| `loadDriversVehicles()` | sync | Loads drivers/vehicles from `App.data` (populated by `App.load()`) |

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_v6` | WRITE (indirect) | Drivers/vehicles stored as JSON fields within form data |

### Cross-File Dependencies
- `App.data`, `App.save()`, `App.toast()`
- `CryptoHelper.encrypt()` (in `saveDriversVehicles`)
- `safeSave()` (in `saveDriversVehicles`)
- `CloudSync.schedulePush()`
- `Auth.apiFetch()` (for vision-processor API in DL scan)
- NHTSA API: `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{vin}?format=json`
- `/api/vision-processor.js` (for driver license OCR)

### Event Listeners
None directly (inline `onclick`/`onchange` in rendered HTML).

### Encryption Usage
- `CryptoHelper.encrypt()` — in `saveDriversVehicles()` to encrypt the drivers+vehicles JSON before saving to localStorage

---

## 11. app-export.js (973 lines)

### Global Export
```js
Object.assign(App, { ... });   // Extends the App object
```

### Public Methods — Export Formats
| Method | Signature | Description |
|--------|-----------|-------------|
| `exportPDF()` | `async` | Builds and downloads a multi-page PDF via jsPDF |
| `exportText()` | sync | Builds and downloads a plain text summary |
| `exportCSV()` | sync | Builds and downloads a CSV file |
| `exportCMSMTF()` | sync | Builds and downloads a HawkSoft `.cmsmtf` file |

### Public Methods — Build Functions
| Method | Signature | Description |
|--------|-----------|-------------|
| `buildPDF(data)` | `async` | Professional multi-page PDF: header with branding, street view/satellite images, all form sections, drivers, vehicles, coverage, notes, extraction log |
| `buildText()` | sync | Returns plaintext formatted summary |
| `buildCSV()` | sync | Returns CSV string of current form data |
| `buildCMSMTF()` | sync | Returns HawkSoft-format string with `[TAG]Value` pairs for all sections |
| `getCSVHeaders()` | sync | Returns ordered array of CSV column headers |

### Public Methods — Batch Import
| Method | Signature | Description |
|--------|-----------|-------------|
| `downloadCSVTemplate()` | sync | Downloads a blank CSV template with all headers |
| `openBatchImport()` | sync | Opens file picker for CSV batch import |
| `handleBatchImport(file)` | `async` | Parses CSV → creates quotes for each row |
| `parseCSV(csvContent)` | sync | Full CSV parser with proper quote handling |
| `mapCsvRowToData(row, headers)` | sync | Maps CSV columns to form field keys |

### Public Methods — AI Scan Support
| Method | Signature | Description |
|--------|-----------|-------------|
| `_escapeAttr(s)` | sync | Escapes HTML attributes |
| `_getScanSystemPrompt()` | sync | Returns massive insurance-underwriter system prompt for AI policy extraction |
| `_getScanSchema()` | sync | Returns comprehensive JSON schema for structured policy data extraction |

### localStorage Keys
None directly (uses `App.data` which is managed by `app-core.js`).

### Cross-File Dependencies
- `App.data`, `App.drivers`, `App.vehicles`, `App.flow`
- `App.getFullAddress()`, `App.getMapImages()`, `App.fetchImageDataUrl()` (from app-property.js)
- `App.getNamePronunciation()`, `App.getCountyFromCity()`, `App.resolveDriverName()` (from app-core.js)
- `App.logExport()`, `App.downloadBlob()`, `App.downloadFile()` (from app-core.js)
- `App.toast()`
- `window.jspdf` — jsPDF library for PDF generation

### Event Listeners
None.

### Encryption Usage
None.

---

## 12. app-popups.js (1,447 lines)

### Global Export
```js
Object.assign(App, { ... });   // Extends the App object
```

### Public Methods — Property Intelligence Popups
| Method | Signature | Description |
|--------|-----------|-------------|
| `calculateResidenceTime()` | sync | Computes years/months at current address from `purchaseDate` |
| `enrichFireStation()` | `async` | Fetches fire station data from `/api/property-intelligence?mode=firestation` |
| `showHazardDetectionPopup()` | `async` | Satellite/street view imagery analysis → detects pools, trampolines, decks, roof details, tree overhang |
| `closeHazardModal()` | sync | Closes hazard detection modal |
| `applyHazardDetections()` | sync | Maps detected hazards to form fields (roof type, pool, trampoline, etc.) |

### Public Methods — Vision Processing
| Method | Signature | Description |
|--------|-----------|-------------|
| `processVisionImage(file)` | `async` | Sends a property photo to `/api/vision-processor.js` for analysis |
| `processVisionPDF(file)` | `async` | Sends a PDF to `/api/vision-processor.js` for page-by-page extraction |
| `analyzeAerialImage(imageUrl)` | `async` | Analyzes satellite imagery for property features |
| `consolidateVisionData(results[])` | sync | Merges multiple vision analysis results into one dataset |
| `showVisionResultsPopup(data)` | sync | Shows popup with vision analysis results and apply buttons |
| `applyVisionData(data)` | sync | Applies vision-extracted data to form fields |

### Public Methods — Historical Analysis
| Method | Signature | Description |
|--------|-----------|-------------|
| `analyzePropertyHistory()` | `async` | Calls `/api/historical-analyzer.js` with `action: analyzeHistory` |
| `analyzeInsuranceTrends()` | `async` | Calls `/api/historical-analyzer.js` with `action: analyzeTrends` |
| `compareToMarket()` | `async` | Calls `/api/historical-analyzer.js` with `action: compareMarket` |
| `generatePropertyTimeline()` | `async` | Calls `/api/historical-analyzer.js` with `action: generateTimeline` |

### Public Methods — Popup Renderers
| Method | Signature | Description |
|--------|-----------|-------------|
| `showHistoryAnalysisPopup(data, address, city, state)` | sync | Modal: property value history table, appreciation rate, market trend |
| `showInsuranceAnalysisPopup(data, county, state)` | sync | Modal: insurance trends, rate prediction, mitigation tips |
| `showMarketComparisonPopup(data, city, state)` | sync | Modal: valuation assessment, neighborhood positioning |
| `showTimelinePopup(data, address, city, state)` | sync | Modal: chronological property timeline with value projections |

### Public Methods — Data Preview System
| Method | Signature | Description |
|--------|-----------|-------------|
| `showDataPreview(data, sources, conflicts, satelliteImage, address)` | sync | Generic data review modal with conflict resolution radio buttons |
| `renderSatelliteSection(satelliteImage, address)` | sync | Renders satellite thumbnail with Google Maps/Earth links |
| `viewSatelliteFullscreen(imageSrc)` | sync | Fullscreen image overlay modal |
| `renderDataItems(data, conflicts)` | sync | Renders editable field list with conflict badges and custom-value option |
| `closeDataPreview()` | sync | Closes data preview modal |
| `applyPreviewData()` | sync | Reads user selections from preview form → applies to form via `setFieldValue()` |

### localStorage Keys
None directly.

### Cross-File Dependencies
- `App.data`, `App.save()`, `App.toast()`, `App.markAutoFilled()`
- `App.setFieldValue()`, `App.updateScanCoverage()` (from app-core.js / app-scan.js)
- `App.getCountyFromCity()`, `App.getFullAddress()` (from app-property.js / app-core.js)
- `AIProvider.getSettings()` (passed to API calls)
- External APIs:
  - `/api/vision-processor.js`
  - `/api/historical-analyzer.js` (actions: `analyzeHistory`, `analyzeTrends`, `compareMarket`, `generateTimeline`)
  - `/api/property-intelligence?mode=firestation`

### Event Listeners
None (all UI event handlers are inline in generated HTML).

### Encryption Usage
None.

---

## 13. app-scan.js (1,715 lines)

### Global Export
```js
Object.assign(App, { ... });   // Extends the App object
```

### Public Methods — File Handling & Preview
| Method | Signature | Description |
|--------|-----------|-------------|
| `openScanPicker()` | sync | Opens file picker for policy document scan |
| `exportDemoPolicyDoc()` | sync | Downloads a sample policy text file for demo |
| `handleGISUpload(file)` | `async` | Processes GIS screenshot/PDF → AI extracts property data |
| `renderGISExtractionReview(data)` | sync | Renders GIS extraction results with apply buttons |
| `clearScan()` | sync | Resets scan state and clears preview |
| `handleScanFiles(files)` | `async` | Queues files for scan, renders preview thumbnails |
| `renderScanPreview(files)` | sync | Renders file thumbnails/names in scan preview area |
| `optimizeImage(file)` | `async` | Resizes to 1200×1200, applies contrast enhancement, JPEG 0.85 |
| `fileToInlineData(file)` | `async` | Converts file to `{mimeType, data}` for Gemini API |

### Public Methods — Driver License Scan
| Method | Signature | Description |
|--------|-----------|-------------|
| `handleInitialDriverLicenseFile(file)` | `async` | Scans DL at intake start → extracts name/DOB/address |
| `renderInitialDriverLicenseResults(data, imageUrl)` | sync | Shows DL extraction results with edit fields |
| `applyInitialDriverLicense()` | sync | Applies DL data to form (Step 1 client fields + adds driver) |

### Public Methods — Document Intelligence
| Method | Signature | Description |
|--------|-----------|-------------|
| `handleDocIntelFiles(files)` | `async` | Processes supporting documents (tax/deed/inspection) via AI |
| `renderDocIntelResults(results)` | sync | Renders document intelligence results with type tags |
| `applyDocIntelToForm(results)` | sync | Maps doc intel findings to form fields |
| `saveDocIntelResults(results)` | `async` | Encrypts and saves to `altech_v6_docintel` |
| `loadDocIntelResults()` | `async` | Decrypts and loads from `altech_v6_docintel` |

### Public Methods — Policy Scan Pipeline
| Method | Signature | Description |
|--------|-----------|-------------|
| `processScanFromText(text)` | `async` | Direct text-to-extraction (skips image processing) |
| `processScan()` | `async` | **3-tier AI fallback**: (1) AIProvider (if Google) → (2) Direct Gemini API → (3) Server `/api/policy-scan.js`. Uses structured JSON schema for extraction. |
| `updateScanCoverage()` | sync | Calculates and displays % of form fields populated |

### Public Methods — Extraction Review
| Method | Signature | Description |
|--------|-----------|-------------|
| `renderExtractionReview(data)` | sync | Full extraction review UI: merge-mode toggle, field-by-field comparison, conflict badges, confidence pills (high/medium/low), source tags, manual edit option |
| `applyExtractedData(data, mode)` | sync | Smart merge with extraction log. Parses `additionalVehicles` and `additionalDrivers` text blobs into structured driver/vehicle objects. Logs every field change. |

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_v6_docintel` | READ + WRITE | Encrypted document intelligence results |

### Cross-File Dependencies
- `App.data`, `App.save()`, `App.toast()`, `App.flow`
- `App._getGeminiKey()` (from app-core.js — centralized key retrieval)
- `App._getScanSystemPrompt()`, `App._getScanSchema()` (from app-export.js)
- `App.setFieldValue()`, `App.markAutoFilled()` (from app-core.js)
- `App.saveDriversVehicles()`, `App.renderDrivers()`, `App.renderVehicles()` (from app-vehicles.js)
- `App.addDriver()`, `App.addVehicle()` (from app-vehicles.js)
- `AIProvider` (isConfigured, getProvider, getApiKey, getModel, getSettings, ask, extractJSON)
- `CryptoHelper` (encrypt, decrypt)
- External APIs:
  - `/api/policy-scan.js` (server-side fallback)
  - Direct Gemini API: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

### Event Listeners
None directly (file inputs trigger via `onchange` set up in app-core.js `init()`).

### Encryption Usage
- `CryptoHelper.encrypt()` — in `saveDocIntelResults()` before localStorage write
- `CryptoHelper.decrypt()` — in `loadDocIntelResults()` after localStorage read

---

## 14. app-property.js (1,728 lines)

### Global Export
```js
Object.assign(App, { ... });   // Extends the App object
```

### Public Methods — Maps & Address
| Method | Signature | Description |
|--------|-----------|-------------|
| `getFullAddress()` | sync | Returns `"street, city, state zip"` from form data |
| `getMapUrls()` | sync | Returns `{streetView, satellite, map}` Google Static Maps URLs |
| `updateMapPreviews()` | `async` | Refreshes street view + satellite preview images in the form |
| `ensureMapApiKey()` | `async` | Fetches Google Maps API key from `/api/config?type=maps` |
| `scheduleMapPreviewUpdate()` | sync | Debounced (1s) trigger for `updateMapPreviews()` |
| `openGoogleMaps()` | sync | Opens Google Maps in new tab |
| `openGoogleEarth()` | sync | Opens Google Earth in new tab |
| `openStreetView()` | sync | Opens Google Street View in new tab |
| `fetchImageDataUrl(url)` | `async` | Fetches image URL → returns base64 data URL (for PDF embedding) |
| `getMapImages()` | `async` | Returns `{streetView, satellite}` as base64 data URLs |
| `copyAddress()` | sync | Copies full address to clipboard |

### Public Methods — Property Data Sources
| Method | Signature | Description |
|--------|-----------|-------------|
| `openZillow()` | sync | Opens Zillow search for current address |
| `importPropertyFromExtension()` | `async` | Reads clipboard JSON from Chrome extension bridge → applies property data |
| `openPropertyRecords()` | sync | Opens county GIS assessor link for current city (WA/OR/AZ mappings) |
| `openPropertyResearch()` | sync | Shows property research modal with action buttons |
| `smartAutoFill()` | `async` | **Parallel data fetch**: ArcGIS+RAG, Zillow, fire station → unified popup or satellite-only fallback |
| `fetchArcgisAndRag(address)` | `async` | Fetches ArcGIS parcel data + RAG interpretation from server |
| `fetchZillowData(address)` | `async` | Fetches Zillow property data from `/api/property-intelligence?mode=zillow` |
| `fetchFireStationData(address, city, state)` | `async` | Fetches fire station distance from `/api/property-intelligence?mode=firestation` |
| `fetchPropertyViaGemini(address)` | `async` | Calls Gemini with `google_search` tool for direct property lookup |

### Public Methods — Data Application Popups
| Method | Signature | Description |
|--------|-----------|-------------|
| `showParcelDataPopup(data, address)` | sync | Shows ArcGIS parcel data popup |
| `closeParcelModal()` | sync | Closes parcel data modal |
| `showUnifiedDataPopup(combined, address)` | sync | Merges ArcGIS + Zillow + fire station into a unified review popup with conflict detection |
| `applyZillowSelects(zillowData)` | sync | Applies Zillow-sourced field values to form |
| `applyFireStationData(fireData)` | sync | Applies fire station distance/protection class to form |
| `applyParcelData(parcelData)` | sync | Applies ArcGIS parcel data to form fields |
| `enrichWithZillow()` | `async` | Standalone Zillow enrichment (opens in new tab or applies) |

### Public Methods — County GIS
| Method | Signature | Description |
|--------|-----------|-------------|
| `getCountyFromCity(city, state)` | sync | Returns county name from city+state mapping (covers ~100+ cities across WA, OR, AZ) |
| `openGIS(city, state)` | sync | Opens county GIS assessor URL for the given city (parallel mapping to `openPropertyRecords`) |

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_v6` | WRITE (indirect) | County auto-fill in `smartAutoFill()` saves via `App.save()` |

### Cross-File Dependencies
- `App.data`, `App.save()`, `App.toast()`, `App.markAutoFilled()`, `App.setFieldValue()`
- `App.checkUpdates()` (from app-core.js — progressive disclosure)
- `Auth.apiFetch()` (for authenticated API routes)
- `AIProvider.getSettings()` (for Gemini direct search)
- External APIs:
  - `/api/config?type=maps` (Google Maps API key)
  - `/api/property-intelligence` (modes: `parcel`, `zillow`, `firestation`)
  - `/api/rag-interpreter.js` (parcel data interpretation)
  - Gemini API direct (with `google_search` tool)
  - Google Maps Static API (street view, satellite, map)

### Event Listeners
None directly (inline handlers in rendered HTML).

### Encryption Usage
None.

---

## 15. app-core.js (2,337 lines)

### Global Export
```js
Object.assign(App, { ... });   // Extends the App object (largest single extension)
```

### Public Methods — Initialization
| Method | Signature | Description |
|--------|-----------|-------------|
| `init()` | `async` | **Massive** init function: loads persisted data, sets up all event listeners (delegated), initializes places autocomplete, carrier autocomplete, segmented controls, iOS toggles, scan drop zones, Tauri desktop drag-drop, co-applicant sync, occupation dropdown |

### Public Methods — Wizard Navigation
| Method | Signature | Description |
|--------|-----------|-------------|
| `handleType()` | sync | Sets flow based on `qType` (home/auto/both), clears excluded step data, updates UI |
| `updateUI()` | sync | Renders current step, progress bar, breadcrumb |
| `next()` | sync | Advances wizard step (with validation) |
| `prev()` | sync | Goes to previous wizard step |

### Public Methods — Data Persistence
| Method | Signature | Description |
|--------|-----------|-------------|
| `save()` | `async` | Debounced 500ms. Encrypts `App.data` → `safeSave(storageKey)`. Uses concurrency token. |
| `load()` | `async` | Reads `localStorage[storageKey]` → `CryptoHelper.decrypt()` → sets `App.data` |
| `_migrateSchema(data)` | sync | Sequential schema migrations (currently v1 — handles prior carrier field renames) |
| `applyData(data)` | sync | Spreads data into form fields (inputs, selects, checkboxes, radios) |

### Public Methods — Google Places Autocomplete
| Method | Signature | Description |
|--------|-----------|-------------|
| `initPlaces()` | sync | Sets up Google Places Autocomplete on `addrStreet` input (session tokens, auto-fills address/city/state/zip/county) |

### Public Methods — Field Helpers
| Method | Signature | Description |
|--------|-----------|-------------|
| `setFieldValue(id, value)` | sync | Sets both DOM input value and `App.data[id]`, handles select/radio/checkbox |
| `markAutoFilled(fieldId)` | sync | Adds visual indicator (green dot) to auto-filled fields |
| `clearAutoFilledIndicator(fieldId)` | sync | Removes auto-filled indicator |
| `syncSegmentedControls()` | sync | Syncs segmented control UI state with `App.data` values |

### Public Methods — Insurance Logic
| Method | Signature | Description |
|--------|-----------|-------------|
| `initCarrierAutocomplete()` | sync | Sets up carrier name autocomplete for `homePriorCarrier` and `priorCarrier` fields (30+ common carriers) |
| `handleSameCarrier()` | sync | Copies home carrier data to auto carrier fields |
| `validatePriorYearsCoverage()` | sync | Validates prior years ≤ continuous years |
| `checkUpdates()` | sync | Progressive disclosure: shows additional fields for `yrBuilt < 2000` (plumbing/electrical/heating updates) |

### Public Methods — VIN Decode
| Method | Signature | Description |
|--------|-----------|-------------|
| `decodeVin()` | `async` | Calls NHTSA API for VIN field (Step 4 vehicles — distinct from per-vehicle decode in app-vehicles.js) |

### Public Methods — AI / Key Management
| Method | Signature | Description |
|--------|-----------|-------------|
| `_getGeminiKey()` | `async` | **Centralized Gemini key resolution**: (1) AIProvider settings → (2) cached `_geminiApiKey` → (3) `localStorage.gemini_api_key` → (4) `PolicyQA._geminiApiKey` → (5) server `/api/config?type=gemini` |
| `getNamePronunciation()` | sync | Returns cached pronunciation string |
| `updateNamePronunciationUI()` | sync | Updates pronunciation display element |
| `togglePronunciation()` | `async` | Shows/hides pronunciation, generates if missing |
| `generateNamePronunciation(firstName, lastName)` | `async` | **3-tier**: (1) server `/api/policy-scan.js` → (2) `AIProvider.ask()` → (3) direct Gemini API |

### Public Methods — AI Settings UI
| Method | Signature | Description |
|--------|-----------|-------------|
| `loadAISettings()` | sync | Populates AI settings form from `AIProvider.getSettings()` |
| `onAIProviderChange()` | sync | Handles provider dropdown change |
| `onAIModelChange()` | sync | Handles model dropdown change |
| `saveAISettings()` | sync | Saves AI settings via `AIProvider.saveSettings()` |
| `toggleAIKeyVisibility()` | sync | Password/text toggle for API key |
| `testAIConnection()` | `async` | Tests current AI config via `AIProvider.testConnection()` |
| `toggleCostEstimates()` | sync | Shows/hides cost estimate panel |
| `_populateAIModels(provider)` | sync | Populates model dropdown |
| `_updateCostEstimates(model)` | sync | Renders cost table for selected model |
| `_updateModelInfo(provider)` | sync | Shows model details + tags |
| `_updateAIProviderHint(provider)` | sync | Shows provider-specific hint text |

### Public Methods — Notes & Export Helpers
| Method | Signature | Description |
|--------|-----------|-------------|
| `getNotesForData(data)` | sync | Generates underwriter-focused notes from data (education, occupation, prior coverage, etc.) |
| `getNotes()` | sync | Calls `getNotesForData(App.data)` |
| `copyNotes()` | sync | Copies notes to clipboard |
| `formatDateDisplay(dateStr)` | sync | Formats `YYYY-MM-DD` → `M/D/YYYY` |
| `resolveDriverName(driverId)` | sync | Returns `"FirstName LastName"` for a driver ID |
| `fmtPhone(str)` | sync | Formats phone `3605551234` → `(360) 555-1234` |

### Public Methods — UI Utilities
| Method | Signature | Description |
|--------|-----------|-------------|
| `toast(msg, opts?)` | sync | Shows toast notification (type: success/error/warning, configurable duration) |
| `downloadFile(content, filename, mimeType)` | sync | Triggers file download from string content |
| `downloadBlob(blob, filename)` | sync | Triggers file download from Blob |
| `logExport(type, filename)` | sync | Records export to `altech_export_history` |
| `loadExportHistory()` | sync | Reads and renders export history log |

### Public Methods — Plugin Navigation
| Method | Signature | Description |
|--------|-----------|-------------|
| `navigateTo(toolName, opts?)` | `async` | Lazy-loads plugin HTML into container div, calls `window[initModule].init()`, manages hash routing, shows auth gate dialog for intake sessions |
| `openTool(toolName)` | sync | Alias for `navigateTo()` |
| `updateBackButtonVisibility()` | sync | Shows/hides back button based on active tool |
| `getActiveToolKey()` | sync | Returns currently active tool key |
| `updateBreadcrumb()` | sync | Updates breadcrumb bar with current tool title |
| `observePluginVisibility()` | sync | MutationObserver on plugin containers for visibility tracking |

### Public Methods — Landing Page
| Method | Signature | Description |
|--------|-----------|-------------|
| `renderLandingTools()` | sync | Renders config-driven tool grid grouped by category (bento layout) |
| `updateLandingGreeting()` | sync | Time-of-day greeting with user name / sign-in prompt |
| `updateCGLBadge()` | sync | Reads CGL cache/state → shows critical/warning badge count |
| `goHome()` | sync | Hides all plugins, shows dashboard, resets hash to `#home` |

### Public Methods — Demo & Occupation
| Method | Signature | Description |
|--------|-----------|-------------|
| `loadDemoClient()` | sync | Populates full demo data (Sarah & David Mitchell, 2 drivers, 2 vehicles, home+auto) |
| `_initOccupationDropdown()` | sync | Sets up industry→occupation dynamic dropdown |
| `_populateOccupation(industry, currentValue)` | sync | Populates occupation `<select>` from `_OCCUPATIONS_BY_INDUSTRY` lookup |

### Public Data Structures
| Name | Description |
|------|-------------|
| `_OCCUPATIONS_BY_INDUSTRY` | Object: 22 industry keys → arrays of occupation titles (EZLynx schema sourced) |
| `_toolTokenEstimates` | Array of 10 tool token/cost estimates (for AI settings cost calculator) |

### localStorage Keys
| Key | Access | Description |
|-----|--------|-------------|
| `altech_v6` | READ + WRITE | Main form data (encrypted via CryptoHelper) |
| `altech_dark_mode` | READ + WRITE | Dark mode toggle state |
| `gemini_api_key` | READ | Legacy Gemini API key (fallback in `_getGeminiKey`) |
| `altech_export_history` | READ + WRITE | Export log entries |
| `altech_drivers` | READ (+ DELETE) | Legacy driver storage (migrated on load, cleared in navigateTo new-session flow) |
| `altech_vehicles` | READ (+ DELETE) | Legacy vehicle storage (migrated on load, cleared in navigateTo new-session flow) |
| `altech_cgl_cache` | READ | CGL policy cache (for badge count in `updateCGLBadge`) |
| `altech_cgl_state` | READ | CGL state (for verified/dismissed in `updateCGLBadge`) |

### Cross-File Dependencies
- **Modules**: `CryptoHelper` (encrypt, decrypt), `safeSave()`, `CloudSync` (schedulePush), `Auth` (user, isSignedIn, apiFetch, showModal), `AIProvider` (getSettings, saveSettings, isConfigured, getProvider, getApiKey, getModel, ask, extractJSON, testConnection, PROVIDERS, TAG_LABELS), `DashboardWidgets` (hideDashboard, showDashboard), `Validation` (validateStep, showError, clearError), `PolicyQA` (_geminiApiKey — fallback), `Onboarding` (getUserName), `firebase.auth().currentUser`
- **External APIs**: NHTSA VIN decode, `/api/config?type=gemini`, `/api/config?type=maps`, `/api/policy-scan.js` (pronunciation)
- **Tauri**: `window.__TAURI__` (drag-drop file listener, window label, PolicyPilot branding)

### Event Listeners (Registered in `init()`)
| Event | Target | Phase | Description |
|-------|--------|-------|-------------|
| `input` + `change` | `document.body` | bubble (delegated) | Auto-saves `App.data` on any input/select/textarea change |
| `blur` | `document.body` | capture (delegated) | Field validation (email, phone, zip, state, date formats) |
| `click` | `document.body` | bubble (delegated) | Segmented control toggle |
| `change` | `document.body` | bubble (delegated) | iOS toggle sync, earthquake zone disclosure |
| `input` | Phone fields | direct | Live phone formatting |
| `input` + `change` | Address fields | direct | Debounced map preview update |
| `change` | `#secondaryHeating` | direct | Toggles secondary heating type field |
| `input` + `change` + `blur` | Co-applicant fields | direct | Syncs co-applicant data to driver list |
| `dragover` + `dragleave` + `drop` + `click` | `#scanDropZone` | direct | Scan drop zone file handling |
| `change` | `#policyScanInput` | direct | Policy scan file input |
| `change` | `#initialDlScanInput` | direct | Initial driver license scan |
| `change` | `#docIntelInput` | direct | Document intelligence file input |
| `change` | `#industry` | direct | Occupation dropdown repopulation |
| Tauri `drag-drop` | `window.__TAURI__` | async | Desktop file drop handling |

### Encryption Usage
- `CryptoHelper.encrypt()` — in `save()` to encrypt form data before localStorage write
- `CryptoHelper.decrypt()` — in `load()` to decrypt form data after localStorage read

---

## Summary Tables

### localStorage Keys — Complete Registry

| Key | Module(s) | Encrypted | Cloud Synced |
|-----|-----------|:---------:|:------------:|
| `altech_v6` | app-core, cloud-sync, app-quotes | ✅ | ✅ |
| `altech_v6_quotes` | app-quotes, cloud-sync, dashboard-widgets | ✅ | ✅ |
| `altech_v6_docintel` | app-scan | ✅ | ❌ |
| `altech_encryption_salt` | crypto-helper | ❌ | ❌ |
| `altech_device_id` | cloud-sync | ❌ | ❌ |
| `altech_sync_meta` | cloud-sync | ❌ | ❌ |
| `altech_dark_mode` | app-core, cloud-sync | ❌ | ✅ |
| `altech_client_history` | app-quotes, cloud-sync | ❌ | ✅ |
| `altech_cgl_state` | cloud-sync, dashboard-widgets, app-core | ❌ | ✅ |
| `altech_cgl_cache` | dashboard-widgets, app-core | ❌ | ❌ |
| `altech_quickref_cards` | cloud-sync | ❌ | ✅ |
| `altech_reminders` | cloud-sync | ❌ | ✅ |
| `altech_ai_settings` | ai-provider | ❌ | ❌ |
| `gemini_api_key` | ai-provider, app-core | ❌ | ❌ |
| `altech_sidebar_collapsed` | dashboard-widgets | ❌ | ❌ |
| `altech_export_history` | app-core | ❌ | ❌ |
| `altech_drivers` | app-quotes, app-core | ❌ | ❌ (legacy) |
| `altech_vehicles` | app-quotes, app-core | ❌ | ❌ (legacy) |

### CryptoHelper Usage Map

| File | encrypt() | decrypt() | Context |
|------|:---------:|:---------:|---------|
| app-core.js | ✅ | ✅ | `save()` / `load()` — main form data |
| app-quotes.js | ✅ | ✅ | `saveQuotes()` / `getQuotes()` — quote storage |
| app-vehicles.js | ✅ | ❌ | `saveDriversVehicles()` — driver/vehicle data |
| app-scan.js | ✅ | ✅ | `saveDocIntelResults()` / `loadDocIntelResults()` |
| cloud-sync.js | ✅ | ✅ | `pushToCloud()` / `pullFromCloud()` — Firestore transit |

### Cross-File Dependency Graph (Simplified)

```
app-init.js ──────────────────────── defines App {}
    │
    ├── app-core.js ─────────────── extends App (init, save, load, navigation, wizard)
    │       │
    │       ├── app-export.js ───── extends App (PDF, CSV, CMSMTF, scan schema/prompt)
    │       ├── app-scan.js ─────── extends App (policy scan, GIS, doc intel)
    │       ├── app-property.js ─── extends App (maps, ArcGIS, Zillow, fire station, GIS)
    │       ├── app-vehicles.js ─── extends App (drivers, vehicles, DL scan, VIN)
    │       ├── app-quotes.js ───── extends App (save/load quotes, ZIP export, history)
    │       └── app-popups.js ───── extends App (hazard, vision, history, market popups)
    │
    ├── firebase-config.js ──────── FirebaseConfig (standalone bootstrap)
    │       │
    │       ├── auth.js ─────────── Auth (login, signup, profile, apiFetch)
    │       └── cloud-sync.js ───── CloudSync (push/pull/sync with Firestore)
    │
    ├── crypto-helper.js ────────── CryptoHelper + safeSave() (AES-256-GCM)
    ├── ai-provider.js ──────────── AIProvider (multi-model AI abstraction)
    └── dashboard-widgets.js ────── DashboardWidgets (command center UI)
```

### Event Listener Registry (All Files)

| File | Count | Notable |
|------|:-----:|---------|
| app-boot.js | 10 | Global: onload, hashchange, keydown, error, unhandledrejection, mouse/touch tilt, SW registration |
| app-core.js | 15+ | Delegated: body input/change/blur/click, phone formatters, address fields, co-applicant sync, scan drop zone, Tauri drag-drop, file inputs, industry change |
| auth.js | 1 | `window.message` (Chrome extension bridge) |
| dashboard-widgets.js | 1 | 60s setInterval refresh |
| All others | 0 | Use inline HTML handlers or rely on delegated listeners |

---

*Generated from source code analysis of all 15 JS files (13,137 total lines).*
