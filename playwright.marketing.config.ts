import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/marketing-e2e",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.KXRA_MARKETING_ORIGIN || "http://127.0.0.1:3220",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
