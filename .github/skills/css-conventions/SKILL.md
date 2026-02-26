---
name: css-conventions
description: >
  CSS rules, variable names, dark mode patterns, and responsive breakpoints for Altech Field Lead.
  Use this skill before writing ANY CSS — when adding styles, fixing dark mode, adjusting layout,
  or debugging visual issues. Prevents invalid variable names, wrong dark mode selectors,
  and hardcoded colors that break theming.
---

# CSS Conventions — Altech Field Lead

The app uses a CSS variable design system defined in `css/main.css`. All styles must use these
variables. Using any other name will silently fall back to browser defaults and break theming.

---

## Valid CSS Variables

### Backgrounds

| Variable | Light Value | Dark Value | Use for |
|----------|-------------|------------|---------|
| `--bg` | `#FAF7F4` | `#000000` | Page background |
| `--bg-card` | `rgba(255,255,255,0.85)` | `#1C1C1E` | Cards, panels, containers |
| `--bg-input` | `#F5F0EC` | `#2C2C2E` | Form inputs, textareas |
| `--bg-sidebar` | `rgba(255,252,248,0.80)` | `#1C1C1E` | Sidebar background |
| `--bg-widget-hover` | `rgba(255,248,240,0.95)` | `#2C2C2E` | Widget hover state |

### Text

| Variable | Use for |
|----------|---------|
| `--text` | Primary text (headings, labels, values) |
| `--text-secondary` | Secondary/supporting text |
| `--text-tertiary` | Hints, placeholders, captions |

### Colors

| Variable | Use for |
|----------|---------|
| `--apple-blue` | Primary action, buttons, links, focus rings |
| `--apple-blue-hover` | Hover state for blue elements |
| `--apple-gray` | Muted UI chrome |
| `--success` | Success states, positive values |
| `--danger` | Errors, destructive actions, warnings |

### Borders & Shadows

| Variable | Use for |
|----------|---------|
| `--border` | Standard borders |
| `--border-subtle` | Dividers, very subtle separation |
| `--shadow` | Box shadows |

### Layout

| Variable | Value | Use for |
|----------|-------|---------|
| `--sidebar-width` | `240px` | Desktop sidebar width |
| `--sidebar-collapsed-width` | `64px` | Collapsed sidebar |
| `--header-height` | `56px` | App header height |

### Animation

| Variable | Value | Use for |
|----------|-------|---------|
| `--transition-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy/playful transitions |
| `--transition-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard smooth transitions |

### Brand

| Variable | Use for |
|----------|---------|
| `--accent-gradient` | Brand gradient backgrounds |
| `--accent-gradient-text` | Gradient text (use with `background-clip: text`) |
| `--sidebar-active` | Active sidebar item background |

---

## INVALID Variable Names — Never Use These

These DO NOT EXIST in the codebase. Using them will silently break styling:

| ❌ Never use | ✅ Use instead |
|-------------|--------------|
| `--card` | `--bg-card` |
| `--card-bg` | `--bg-card` |
| `--surface` | `--bg-card` |
| `--accent` | `--apple-blue` |
| `--muted` | `--text-secondary` |
| `--text-primary` | `--text` |
| `--input-bg` | `--bg-input` |
| `--border-color` | `--border` |
| `--border-light` | `--border` |
| `[data-theme="dark"]` | `body.dark-mode` (selector, not variable) |

---

## Dark Mode Pattern

**Always use `body.dark-mode .your-class`** — never `[data-theme="dark"]`, never `.dark-mode .your-class` without `body`.

```css
/* ✅ Correct */
body.dark-mode .your-container {
    background: #1C1C1E;
    border-color: #38383A;
}

/* ❌ Wrong */
[data-theme="dark"] .your-container { ... }
.dark-mode .your-container { ... }  /* missing body prefix */
```

**You usually don't need dark mode overrides** if you only use CSS variables. The variables auto-switch. Only add `body.dark-mode` overrides when you have unavoidable hardcoded values.

For dark mode backgrounds, prefer **solid colors over low-opacity rgba**:
```css
/* ✅ Prefer */
body.dark-mode .panel { background: #1C1C1E; }

/* ⚠️ Avoid in dark mode */
body.dark-mode .panel { background: rgba(255, 255, 255, 0.05); }
```

---

## Professional Theme

`body.theme-pro` overrides (defined in `css/theme-professional.css`) are a permanently dark OLED theme. If your component has visible issues in pro theme, add overrides there too.

---

## Responsive Breakpoints

Use these exact values — they match the rest of the app:

```css
@media (max-width: 380px)  { /* Very small phones */ }
@media (max-width: 480px)  { /* Small phones */ }
@media (max-width: 500px)  { /* Plugin compact */ }
@media (max-width: 520px)  { /* Wizard compact */ }
@media (max-width: 600px)  { /* Narrow tablet */ }
@media (max-width: 720px)  { /* Tablet */ }
@media (max-width: 767px)  { /* Mobile — sidebar collapses */ }
@media (min-width: 768px)  { /* Tablet+ */ }
@media (min-width: 960px)  { /* Narrow desktop */ }
@media (min-width: 1024px) { /* Desktop */ }
@media (min-width: 1280px) { /* Wide desktop */ }
```

---

## Off-System Palettes (Exceptions)

A few plugins intentionally use their own palettes — do NOT "fix" these:

- **`ezlynx.css`** — Standalone dark glassmorphism: `#64748b`, `#94a3b8`, `#38bdf8` (slate/sky)
- **`quickref.css`** — Teal accent: `#0d9488`, `#0f766e`
- **`email.css`** — Purple accent: `#7c3aed`, `#6d28d9`

For all other files, hardcoded colors are bugs.

---

## Quick Checklist Before Writing CSS

- [ ] Using only valid variable names from the list above?
- [ ] Dark mode selector is `body.dark-mode .class` (not `[data-theme]`)?
- [ ] No hardcoded hex colors (unless in an intentional off-system palette)?
- [ ] Focus states added? (`:focus-visible` with `outline` or `box-shadow`)
- [ ] Responsive breakpoints tested at 375px width?
- [ ] `body.dark-mode` covers any hardcoded values?
