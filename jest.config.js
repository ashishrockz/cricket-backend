/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: [],
  globalSetup: './tests/globalSetup.js',
  globalTeardown: './tests/globalTeardown.js',
  // Run test files serially (important — tests share DB state)
  maxWorkers: 1,
  testTimeout: 30000,
  verbose: true,
  // Suppress console noise from the app during tests
  silent: false,
  collectCoverageFrom: ['src/**/*.js', '!src/docs/**', '!src/utils/seeder.js'],
  coverageReporters: ['text', 'lcov', 'html']
};
