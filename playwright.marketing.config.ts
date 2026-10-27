import { defineConfig, devices } from "@playwright/test";
import {
  ciBrowserArtifacts,
  ciPreserveOutput,
} from "./scripts/ci-output-policy.mjs";

export default defineConfig({
  testDir: "./tests/marketing-e2e",
  workers: 1,
  preserveOutput: ciPreserveOutput(),
  timeout: 30000,
  use: {
    baseURL: process.env.KXRA_MARKETING_ORIGIN || "http://127.0.0.1:3220",
    ...ciBrowserArtifacts(),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
