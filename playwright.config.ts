import { defineConfig, devices } from "@playwright/test";

const remoteBaseUrl = process.env.E2E_BASE_URL;
const localPort = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,

  use: {
    baseURL: remoteBaseUrl ?? `http://localhost:${localPort}`,
    trace: "on-first-retry",
  },

  // Only spin up a local server when targeting localhost.
  webServer: remoteBaseUrl
    ? undefined
    : {
        command: `npx serve -s build -l ${localPort}`,
        url: `http://localhost:${localPort}`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
