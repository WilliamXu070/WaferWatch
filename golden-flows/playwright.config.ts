import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "workflow.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./global-setup.mjs",
  globalTeardown: "./global-teardown.mjs",
  outputDir: "./artifacts/results",
  reporter: [["line"], ["html", { outputFolder: "./artifacts/report", open: "never" }]],
  use: {
    baseURL: process.env.GOLDEN_BASE_URL || "http://127.0.0.1:3000",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [{ name: "golden-desktop", use: { viewport: { width: 1440, height: 1000 } } }]
});
