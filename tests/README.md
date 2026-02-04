# Altech Testing Guide

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

- **`tests/app.test.js`** - Main unit tests for form logic, exports, validation
- **`tests/setup.js`** - Jest configuration and mocks
- **`jest.config.js`** - Jest settings

## What's Tested

### Data Validation
- Date normalization (ISO 8601 format)
- XML character escaping (`&`, `<`, `>`, `"`, `'`)
- Filename sanitization

### LocalStorage Operations
- Saving form data
- Loading form data
- Quote library management

### Export Formats
- CMSMTF field mapping
- XML structure and namespace
- Required field validation

### Address & Vehicle Parsing
- Street address separation (number vs name)
- Vehicle description parsing (year, make, model)

## Adding New Tests

Edit `tests/app.test.js` and add to the appropriate `describe` block:

```javascript
test('your test description', () => {
  // Arrange
  const input = 'test data';
  
  // Act
  const result = someFunction(input);
  
  // Assert
  expect(result).toBe('expected output');
});
```

## Coverage Goals

- **Target:** >80% coverage for critical functions
- **Priority:** Export generation, validation, data parsing
- **View report:** After running `npm run test:coverage`, open `coverage/lcov-report/index.html`

## Troubleshooting

**Error: "Cannot find module 'jsdom'"**
- Run: `npm install`

**Tests timeout**
- Increase timeout in `tests/setup.js`: `jest.setTimeout(20000)`

**DOM not available**
- Ensure `testEnvironment: 'node'` in `jest.config.js`
- JSDOM creates a virtual DOM for testing

---

*For CI/CD integration, see `.github/workflows/test.yml` (to be created)*
