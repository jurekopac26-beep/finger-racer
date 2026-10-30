// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    channel: 'msedge',
    headless: true,
    launchOptions: { args: ['--mute-audio'] },   // headless browsers still play game sound on Windows
  },
});
