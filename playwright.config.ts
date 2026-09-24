import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // Better Auth's rate limiter (max: 10/min against get-session in production)
    // gets exhausted by the suite's many logins/session checks, causing auth
    // bootstrap to fail and shells to bounce back to /login. Disable for e2e.
    env: {
      AUTH_RATE_LIMIT_DISABLED: "1",
    },
  },
})
