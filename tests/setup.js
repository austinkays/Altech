/**
 * Jest Test Configuration Setup
 * 
 * This file sets up the testing environment for Altech
 */

// Set test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in test output
const originalError = console.error;
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Suppress known JSDOM crypto noise, keep real errors visible
  error: jest.fn((...args) => {
    const msg = args[0];
    if (typeof msg === 'string' && (msg.includes('Encryption failed') || msg.includes('Decryption failed'))) {
      return; // JSDOM lacks crypto.subtle — these are expected
    }
    originalError.apply(console, args);
  }),
};

// Mock fetch for API calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);
