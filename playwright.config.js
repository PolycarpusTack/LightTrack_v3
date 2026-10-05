// Playwright config for the packaged-application harness (LT3-005).
// Run after packaging: npm run electron:build:win && npm run test:app
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/app',
  testMatch: '**/*.spec.js',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure'
  },
  outputDir: 'test-results/app'
});
