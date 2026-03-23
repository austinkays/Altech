---
name: repo-hygiene
description: >
  End-of-session checklist, commit discipline, CHANGELOG format, and doc-drift prevention for Altech Field Lead.
  Use this skill at the end of ANY work session — after fixing a bug, adding a feature, or updating docs.
  Covers the mandatory 5-step close-out sequence, git commit message format, audit-docs script, and
  the pre-deploy quality gate. Prevents the most common agent mistakes: skipping CHANGELOG, forgetting to push,
  reading too many files, and re-fixing already-committed work.
---

# Repo Hygiene — Altech Field Lead

Every work session MUST end with this close-out sequence. Non-negotiable. In order.

---

## Mandatory Close-Out Sequence (5 Steps)

### Step 1 — Check if work was already done

```bash
git log --oneline -10
```

If the fix/feature you were asked to do is already in the log → **stop. Report it. Do not re-do it.**

---

### Step 2 — Run the test suite

```bash
npx jest --no-coverage
```

- **Target:** 26 suites, 1672 tests, 0 failures
- If tests fail → fix them before continuing. Do not commit broken tests.
- If test count drops → a test file was accidentally deleted or broken.

---

### Step 3 — Add a CHANGELOG entry

Open `CHANGELOG.md`. Under `## [Unreleased]` → `### Added` (or `### Fixed` / `### Changed`), add:

```markdown
- **type(scope): short description** (Month DD, YYYY):
  - Bullet 1 — file changed + what changed
  - Bullet 2 — file changed + what changed
```

**Types:** `feat` | `fix` | `refactor` | `docs` | `test` | `chore`

**Examples:**
```markdown
- **fix(hawksoft): correct channel codes for walk-in logs** (March 23, 2026):
  - `api/hawksoft-logger.js` — changed `action: 2` to `channel: 21` for Walk-In To Insured
  - `AGENTS.md §5.11` — updated channel code reference table

- **feat(plugin): add Returned Mail Tracker** (March 20, 2026):
  - Added `js/returned-mail.js`, `plugins/returned-mail.html`, `css/returned-mail.css`
  - Registered in `js/app-init.js` toolConfig[]
  - Added `STORAGE_KEYS.RETURNED_MAIL` to `js/storage-keys.js`
```

---

### Step 4 — Run `audit-docs`

```bash
npm run audit-docs
```

This checks for drift between the docs and actual file counts. Fix any warnings before committing.

---

### Step 5 — Stage, commit, and push

```bash
git add -A
git commit -m "type(scope): short description"
git push
```

**Commit message format:** `type(scope): description` — same type/scope as the CHANGELOG entry.

**Good examples:**
- `fix(compliance): correct CGL cache TTL`
- `feat(returned-mail): add Returned Mail Tracker plugin`
- `docs(agents): add SDL-MCP section`
- `chore(storage-keys): add RETURNED_MAIL key`

**Never:**
- `git push --force` (destructive, ask user first)
- `git reset --hard` (destructive, ask user first)
- Commit with message `fix` or `update` (too vague)

---

## Session Scope Rules (from AGENTS.md §8)

| Rule | Detail |
|------|--------|
| **One bug per session** | Fix the thing asked. Stop. Don't read unrelated files. |
| **Max 3 files to locate a problem** | If you need more than 3 files to find the issue, stop and report what's blocking you. |
| **No re-investigation** | If `git log` shows it was already fixed, report it and stop. Don't re-read, re-fix, or re-verify. |
| **No over-engineering** | Bug fix ≠ refactor opportunity. Feature request ≠ add configurability. |
| **Grep first, read second** | Always search for line numbers before opening a file. Read only the specific lines needed. |

---

## Pre-Deploy Quality Gate

Before any `npm run deploy:vercel`, verify all of these:

- [ ] `npx jest --no-coverage` → 0 failures
- [ ] `npm run audit-docs` → no drift warnings
- [ ] Serverless function count: `(Get-ChildItem api/ | Where-Object { $_.Name -notmatch '^_' }).Count` → must be ≤ 12
- [ ] No `var(--accent)`, `var(--muted)`, `var(--card)`, `var(--text-primary)` in any new CSS
- [ ] No hardcoded `'altech_*'` strings in JS modules (use `STORAGE_KEYS.*`)
- [ ] No inline `escapeHtml()` / `escapeAttr()` definitions (use `Utils.escapeHTML()` / `Utils.escapeAttr()`)
- [ ] `App.save()` used for all form data writes (never `localStorage.setItem(STORAGE_KEYS.FORM, ...)`)
- [ ] `CloudSync.schedulePush()` called after any write to a cloud-synced key
- [ ] CHANGELOG entry added
- [ ] All changes committed and pushed

---

## Vercel Function Count Check

```powershell
# PowerShell (Windows)
(Get-ChildItem api/ | Where-Object { $_.Name -notmatch '^_' }).Count
# Must return 12 or less
```

```bash
# bash (Linux/Mac)
ls api/ | grep -v '^_' | wc -l
# Must return 12 or less
```

**Current count: 12 (at the limit).** Any new `api/` file without a `_` prefix will break ALL deployments.
To add new API behavior: use `?mode=` or `?type=` routing inside an existing function.

---

## AGENTS.md & CLAUDE.md Updates

If your session changed the architecture, added a new pattern, fixed a landmine, or added a new key/module:

1. Update `AGENTS.md` in the relevant section (`§3`–`§9`)
2. Update `CLAUDE.md` in the matching section
3. Update `QUICKREF.md` if it's something agents look up frequently
4. Update `.github/copilot-instructions.md` if the Quick Start summary needs refreshing

These four files are the living state of the codebase. Keep them in sync.
