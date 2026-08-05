import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: process.env.E2E_PWA_BASE_URL ?? "http://pwa:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
