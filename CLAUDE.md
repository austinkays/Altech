# Altech Toolkit — Claude Code Reference

## Project Overview

Altech is a static insurance agency toolkit built with vanilla HTML/CSS/JS. No build step, no bundler, no framework. Deployed on Vercel via GitHub push to `main`. Firebase (compat mode) handles auth and Firestore.

---

## File Structure

```
Altech/
├── index.html              # App shell — all plugins loaded here
├── css/
│   ├── variables.css       # :root CSS vars + body.dark-mode overrides ONLY
│   ├── base.css            # Reset, body, typography, global utilities
│   ├── layout.css          # Header, sidebar, app shell, plugin container, media queries
│   ├── components.css      # Buttons, inputs, modals, cards, forms, toasts, etc.
│   ├── landing.css         # .landing-page, bento grid, tool-row, landing header
│   ├── animations.css      # All @keyframes + global animation assignments
│   ├── main.css            # @import only — loads the 6 files above in order
│   ├── sidebar.css         # Sidebar plugin (standalone)
│   ├── dashboard.css       # Dashboard plugin
│   ├── compliance.css      # Compliance plugin
│   ├── reminders.css       # Reminders plugin
│   ├── auth.css            # Auth screens
│   ├── admin.css           # Admin panel
│   ├── onboarding.css      # Onboarding flow
│   ├── paywall.css         # Paywall screens
│   └── [plugin].css        # One file per plugin — do not modify from global refactors
├── js/
│   └── [module].js         # Plugin JS files
├── api/                    # Vercel serverless functions (Node.js)
└── vercel.json             # Vercel routing config
```

---

## CSS Architecture

### Load Order (index.html)
```html
<link rel="stylesheet" href="css/variables.css">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/landing.css">
<link rel="stylesheet" href="css/animations.css">
<!-- Plugin-specific CSS files follow -->
```

### File Responsibilities

| File | Contains |
|------|----------|
| `variables.css` | `:root { }` custom properties and `body.dark-mode { }` variable overrides **only** |
| `base.css` | `* { }` reset, `body { }`, `h2`, `h3`, `.section-subtitle`, `.hidden`, `.hint`, `.divider` |
| `layout.css` | Plugin header glassmorphism pill, step-title/progress, `main { }`, `footer { }` shell, `#breadcrumbBar`, `.plugin-container`, desktop layout `@media (min-width: 960px)` block |
| `components.css` | Cards, inputs, selects, textareas, buttons (all variants), modals, toasts, accordion, segmented control, iOS toggle, quote cards, driver/vehicle cards, export cards, scan components, Q&A assistant, skeleton loading, print styles, COI form |
| `landing.css` | `.landing-page`, `.landing-header`, `.tool-row` (3D tilt), `.bento-*`, tool badges, landing footer |
| `animations.css` | All `@keyframes`, global animation assignments, `@media (prefers-reduced-motion)` |

---

## Theme System

- **Light mode**: default (no class on body)
- **Dark mode**: `body.dark-mode` class — toggled by JS, **not** `prefers-color-scheme`
- All colors use CSS custom properties from `variables.css`
- Key layout vars: `--header-height: 56px`, `--sidebar-width: 240px`, `--sidebar-collapsed-width: 64px`
- Key easing vars: `--transition-spring`, `--transition-smooth`
- Primary brand color: `--apple-blue` (#007AFF light / #0A84FF dark)

### Dark Mode Rule Placement
- Variable overrides → `variables.css` (`body.dark-mode { --var: value; }`)
- Layout-scoped dark rules → `layout.css` (`body.dark-mode footer { }`)
- Component-scoped dark rules → `components.css` (`body.dark-mode .card { }`)
- Landing-scoped dark rules → `landing.css` (`body.dark-mode .tool-row { }`)

---

## Deploy Workflow

1. Edit files locally
2. `git add` + `git commit` + `git push origin main`
3. Vercel auto-deploys on push to `main`
4. No build step, no npm run build — files are served as-is

Serverless API functions live in `api/` and are deployed as Vercel functions automatically.

---

## Key Conventions

- **Vanilla JS only** — no React, Vue, or framework
- **Firebase compat mode** — use `firebase.auth()`, `firebase.firestore()` (not modular imports)
- **Plugin pattern** — each tool is a self-contained plugin with its own JS + CSS file; loaded conditionally
- **No CSS preprocessors** — plain CSS with custom properties
- **`@keyframes` always go in `animations.css`** — never define them in plugin CSS or other global files
- **Plugin CSS files are standalone** — they may define their own transitions/animations locally
- **CSS specificity** — prefer class selectors; avoid `!important` except for `.hidden` and reduced-motion
- **JS dark mode toggle** — adds/removes `body.dark-mode` class and persists to `localStorage`

---

## What NOT To Do

- **Do not add a build step** — this is intentionally a no-build static site
- **Do not use CSS `@import` inside plugin CSS files** — link them directly in index.html
- **Do not move `@keyframes` into component or layout files** — they all belong in `animations.css`
- **Do not edit `main.css`** — it contains only `@import` statements; add new global CSS to the appropriate split file
- **Do not modify plugin-specific CSS files** (`dashboard.css`, `compliance.css`, etc.) during global CSS refactors
- **Do not use `prefers-color-scheme`** for dark mode — the app uses `body.dark-mode` class toggled by user
- **Do not use ES modules (`import`/`export`)** in plugin JS files — they are plain scripts loaded via `<script>` tags
- **Do not push directly to `main` with broken CSS** — Vercel deploys immediately; test locally first
