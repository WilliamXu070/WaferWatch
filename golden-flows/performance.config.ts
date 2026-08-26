import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "performance.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30 * 60_000,
  expect: { timeout: 20_000 },
  globalSetup: "./global-setup.mjs",
  globalTeardown: "./global-teardown.mjs",
  outputDir: "./artifacts/performance/results",
  reporter: [
    ["line"],
    ["json", { outputFile: "./artifacts/performance/report.json" }],
    ["html", { outputFolder: "./artifacts/performance/report", open: "never" }]
  ],
  use: {
    baseURL: process.env.GOLDEN_BASE_URL || "http://127.0.0.1:3000",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [{ name: "performance-chrome", use: { viewport: { width: 1440, height: 1000 } } }]
});
