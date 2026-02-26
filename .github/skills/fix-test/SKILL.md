---
name: fix-test
description: >
  Guide for debugging and fixing failing Jest tests in Altech Field Lead.
  Use this skill when any test is failing, when adding new tests, or when
  modifying code that has test coverage. Covers the JSDOM setup, mock patterns,
  common failure causes, and how to run tests efficiently.
---

# Fixing & Writing Tests in Altech Field Lead

## Test Setup Overview

- **Runner:** Jest + JSDOM (`"testEnvironment": "node"` via jest.config.cjs, but tests manually instantiate JSDOM)
- **Test directory:** `tests/`
- **18 suites, 1164+ tests** — all must pass before any deploy
- **Coverage sources:** `index.html`, `api/`, `lib/`

### How Tests Load the App

Tests load `index.html` into a JSDOM instance with scripts enabled:

```javascript
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost'
});
const { window } = dom;
```

This means all `window.Module` globals, DOM elements, and script tags in `index.html` are available in tests.

### Setup File: `tests/setup.js`

Runs before every suite. It:
- Mocks `fetch` globally
- Suppresses `console.error`/`console.warn` noise
- Suppresses expected `crypto.subtle` errors (crypto isn't available in test env)

---

## Running Tests

```bash
npm test                     # All 18 suites with coverage (slow)
npx jest --no-coverage       # Faster — skip coverage report
npx jest tests/app.test.js   # Single suite
npx jest --watch             # Watch mode
npx jest -t "test name"      # Run tests matching a name pattern
```

---

## Common Failure Causes & Fixes

### 1. `Cannot read properties of null` — Missing DOM element

**Cause:** Code tries to access a DOM element that doesn't exist in the test's JSDOM instance.

**Fix:** Add null checks in the source code:
```javascript
// Before
document.getElementById('myField').value = '';

// After
const el = document.getElementById('myField');
if (el) el.value = '';
```

Or mock the element in the test:
```javascript
dom.window.document.body.innerHTML += '<input id="myField">';
```

---

### 2. `crypto.subtle is not available`

**Cause:** Web Crypto API isn't available in Node/JSDOM test environment.

**Fix:** This is expected and suppressed in `tests/setup.js`. If a test is genuinely failing because of crypto, mock `CryptoHelper`:
```javascript
dom.window.CryptoHelper = {
    encrypt: jest.fn(data => Promise.resolve('encrypted:' + JSON.stringify(data))),
    decrypt: jest.fn(data => Promise.resolve(JSON.parse(data.replace('encrypted:', '')))),
    generateUUID: jest.fn(() => 'test-uuid-1234')
};
```

---

### 3. `fetch is not defined` or fetch mock not working

**Cause:** `fetch` mock from `tests/setup.js` not applied, or the module under test uses a different reference.

**Fix:** Mock fetch before the test runs:
```javascript
global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
    text: async () => 'OK'
});
```

---

### 4. Module not initialized (`window.App is undefined`)

**Cause:** `app-boot.js` initializes `App` via `Object.assign` across 9 files. If the JSDOM instance doesn't finish executing scripts, globals won't be set.

**Fix:** Wait for the DOM to be ready:
```javascript
await new Promise(resolve => dom.window.addEventListener('load', resolve));
// or
await new Promise(resolve => setTimeout(resolve, 100));
```

---

### 5. Test passes locally but fails in CI

**Cause:** Usually a timing issue or environment variable missing.

**Fix:** Check for hardcoded timeouts; increase if needed. Ensure no test relies on real API calls (all external calls must be mocked).

---

## Test Suite Map

| File | What it tests |
|------|--------------|
| `app.test.js` | Core App object, form handling, save/load |
| `ai-router.test.js` | Multi-provider AI routing logic |
| `api-security.test.js` | API auth middleware |
| `api-compliance.test.js` | HawkSoft CGL API |
| `api-property.test.js` | Property intelligence API |
| `api-prospect.test.js` | Prospect lookup API |
| `ezlynx-pipeline.test.js` | EZLynx export pipeline |
| `intake-assist.test.js` | Intake assist module |
| `integration.test.js` | Cross-module integration |
| `performance.test.js` | Performance benchmarks |
| `phase1-5.test.js` | Feature phase tests |
| `plugin-integration.test.js` | Plugin system integration |
| `prospect-client.test.js` | Prospect client-side module |
| `server.test.js` | Local dev server (server.js) |

---

## Writing a New Test

```javascript
const { JSDOM } = require('jsdom');
const fs = require('fs');

describe('YourModule', () => {
    let dom, window;

    beforeEach(async () => {
        const html = fs.readFileSync('index.html', 'utf8');
        dom = new JSDOM(html, {
            runScripts: 'dangerously',
            resources: 'usable',
            url: 'http://localhost'
        });
        window = dom.window;
        // Wait for scripts to execute
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    afterEach(() => {
        dom.window.close();
    });

    test('should initialize correctly', () => {
        expect(window.YourModule).toBeDefined();
    });

    test('should handle null container gracefully', () => {
        // Remove the container
        const el = window.document.getElementById('yourPluginTool');
        if (el) el.remove();

        // Should not throw
        expect(() => window.YourModule.render()).not.toThrow();
    });
});
```

---

## After Fixing Tests

- [ ] `npm test` → 18 suites, 1164+ tests, **0 failures**
- [ ] Update test count in `AGENTS.md` if you added new tests
- [ ] Run `npm run audit-docs`
- [ ] Commit and push
