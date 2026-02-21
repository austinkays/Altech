module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/Altech/'],
  collectCoverageFrom: [
    'index.html',
    'api/**/*.js',
    'lib/**/*.js',
    '!**/node_modules/**',
    '!**/Altech/**',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
