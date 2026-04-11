/**
 * Altech EZLynx V2 — Jest configuration
 *
 * Separate from the root jest.config.cjs so `npm test` (the 27-suite
 * Altech web-app suite) is unaffected. Run via `npm run test:ext`.
 */
const path = require('path');

module.exports = {
    displayName: 'altech-ext-v2',
    rootDir: path.resolve(__dirname, '..'),
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/test/unit/**/*.test.js'],
    setupFiles: ['<rootDir>/test/setup.js'],
    verbose: true,
    // We don't instrument coverage from the UMD-lite wrappers, since each
    // file has its own test-only require path.
    collectCoverage: false,
};
