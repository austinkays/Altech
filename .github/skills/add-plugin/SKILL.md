---
name: add-plugin
description: >
  Step-by-step guide for adding a new plugin/tool to Altech Field Lead.
  Use this skill whenever the user asks to add a new tool, plugin, module, or feature panel.
  Covers all 5 required steps: JS module, HTML template, CSS file, index.html registration,
  and optional cloud sync integration.
---

# Adding a New Plugin to Altech Field Lead

This app uses a plugin system where each tool is an IIFE module on `window.ModuleName`,
a dynamically loaded HTML template, a dedicated CSS file, and a registration entry in `toolConfig[]`.

---

## Step 1: Create the JS Module

File: `js/your-plugin.js`

Use the IIFE pattern — all plugin modules follow this exact structure:

```javascript
window.YourPlugin = (() => {
    'use strict';
    const STORAGE_KEY = 'altech_your_key';

    let state = {};

    function init() {
        _load();
        _wireEvents();
        render();
    }

    function render() {
        const container = document.getElementById('yourPluginTool');
        if (!container) return;
        container.innerHTML = `<!-- Your UI here -->`;
        _wireEvents();
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) { state = JSON.parse(raw); }
        } catch (e) { console.warn('YourPlugin: load failed', e); }
    }

    function _save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (typeof CloudSync !== 'undefined') CloudSync.schedulePush();
    }

    function _wireEvents() {
        // Wire up DOM event listeners here
    }

    return { init, render };
})();
```

**Rules:**
- Module name must be `window.ModuleName` (PascalCase)
- Always call `CloudSync.schedulePush()` after writing to localStorage (if data is user-facing)
- Never write directly to `altech_v6` — that's the core form store managed by `App.save()`
- Use `STORAGE_KEY` constant for your localStorage key (prefix `altech_`)
- Null-check your container element in `render()` before touching the DOM

---

## Step 2: Create the Plugin HTML Template

File: `plugins/your-plugin.html`

This file is loaded dynamically into `#yourPluginTool`. Keep it lean — no `<html>`, `<head>`, or `<body>` tags.

```html
<header class="plugin-header">
    <div class="plugin-header-left">
        <h2>Your Plugin</h2>
        <p class="plugin-subtitle">Short description</p>
    </div>
</header>
<div class="your-plugin-container">
    <!-- Your UI here -->
</div>
```

---

## Step 3: Create the CSS File

File: `css/your-plugin.css`

**CRITICAL: Use design system variables only. Never hardcode colors.**

```css
/* css/your-plugin.css */

.your-plugin-container {
    padding: 20px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text);
}

/* Only add body.dark-mode overrides for hardcoded colors you can't avoid */
body.dark-mode .your-plugin-container {
    /* Usually not needed if you use only CSS variables */
}
```

**Valid variable names** (see `css/main.css :root` for full list):

| Use this | Never use |
|----------|-----------|
| `--bg-card` | ~~`--card`~~, ~~`--surface`~~, ~~`--card-bg`~~ |
| `--text` | ~~`--text-primary`~~ |
| `--text-secondary` | ~~`--muted`~~ |
| `--apple-blue` | ~~`--accent`~~ |
| `--bg-input` | ~~`--input-bg`~~ |
| `--border` | ~~`--border-color`~~, ~~`--border-light`~~ |

Dark mode selector: `body.dark-mode .your-class` (not `[data-theme="dark"]`)

---

## Step 4: Register in `index.html`

Make 3 additions:

**1. In `<head>` — add stylesheet link** (keep alphabetical or logical order with other plugin CSS links):
```html
<link rel="stylesheet" href="css/your-plugin.css">
```

**2. In `<body>` — add the plugin container** inside `#pluginViewport`:
```html
<div id="yourPluginTool" class="plugin-container"></div>
```

**3. In `<body>` — add the script tag** before `app-boot.js`:
```html
<script src="js/your-plugin.js"></script>
```

---

## Step 5: Register in `toolConfig[]`

File: `js/app-init.js`

Add an entry to the `toolConfig` array:

```javascript
{
    key: 'yourplugin',          // Unique lowercase key, used in URL hash and localStorage
    icon: '🔧',                  // Emoji icon shown in sidebar
    color: 'icon-blue',          // Icon color class: icon-blue, icon-green, icon-orange, icon-red, icon-purple
    title: 'Your Plugin',        // Tab/page title
    name: 'Your Plugin',         // Sidebar display name
    containerId: 'yourPluginTool', // Must match the div id in index.html
    initModule: 'YourPlugin',    // Must match window.YourPlugin
    htmlFile: 'plugins/your-plugin.html', // Path to your HTML template
    category: 'ops'              // Category: 'intake', 'export', 'ops', 'tools'
}
```

---

## Step 6 (Optional): Add Cloud Sync

If your plugin stores user data that should sync across devices, update `js/cloud-sync.js` in 4 places:

**1. `_getLocalData()`** — add your data to the snapshot:
```javascript
yourData: tryParse('altech_your_key'),
```

**2. `pushToCloud()` → `Promise.all([...])`** — add a push call:
```javascript
_pushDoc('yourData', localData.yourData),
```

**3. `pullFromCloud()`** — add pull + UI refresh:
```javascript
const yourDoc = await _pullDoc('yourData');
if (yourDoc) {
    localStorage.setItem('altech_your_key', JSON.stringify(yourDoc));
    if (typeof YourPlugin !== 'undefined') YourPlugin.render();
}
```

**4. `deleteCloudData()` → `syncDocs` array** — add your doc type:
```javascript
'yourData',
```

---

## Post-Creation Checklist

- [ ] Module loads without console errors on page reload
- [ ] `npm test` passes (18 suites, 1164+ tests, 0 failures)
- [ ] Dark mode toggle looks correct
- [ ] Mobile at 375px width — no horizontal overflow
- [ ] Update `AGENTS.md` JS module count, line counts, and file structure table
- [ ] Update `.github/copilot-instructions.md` and `QUICKREF.md`
- [ ] Run `npm run audit-docs` to check for doc drift
- [ ] Commit and push all files
