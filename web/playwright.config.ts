import { defineConfig, devices } from "@playwright/test";

// End-to-end tests. They run against the dev server (started if it isn't already running) and use
// the installed Chrome, so no browser download is needed. Needs AUTH_DEV_LOGIN=true in .env.local.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"], channel: "chrome" } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
