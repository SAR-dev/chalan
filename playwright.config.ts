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
    // Stand in for the reverse proxy that production always has in front of
    // the app: with TRUSTED_PROXY_HOPS=1 (see webServer.env) the app reads the
    // client IP from the right-most x-forwarded-for entry, which is what the
    // rate limiter keys on. Without this header every request would resolve to
    // "no IP" and the IP-keyed limits would be skipped entirely.
    extraHTTPHeaders: { "x-forwarded-for": "203.0.113.10" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Reseed the DB (deterministic seed-content), then start the server —
    // each run begins from the same known data (see seed/index-full.ts).
    command: "pnpm db:seed:full && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Better Auth's rate limiter (max: 10/min against get-session in production)
    // gets exhausted by the suite's many logins/session checks, causing auth
    // bootstrap to fail and shells to bounce back to /login. Disable for e2e.
    env: {
      AUTH_RATE_LIMIT_DISABLED: "1",
      // One trusted proxy hop (see use.extraHTTPHeaders).
      TRUSTED_PROXY_HOPS: "1",
    },
  },
})
