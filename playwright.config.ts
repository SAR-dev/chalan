import fs from "node:fs"
import { defineConfig, devices } from "@playwright/test"
import { config as loadEnv } from "dotenv"

// E2E can run against its own env file. If `.env.e2e` exists it is loaded here,
// into the Playwright runner process, so every child inherits it:
//   - the webServer command (db:seed:full && next start)
//   - the test workers (specs read DATABASE_URL, CRON_SECRET, … directly)
// Values already set in the shell win, and anything omitted from `.env.e2e`
// still falls back to `.env` (Next's loader and the specs' `dotenv/config`
// never overwrite already-set vars). Copy `.env.e2e.example` to `.env.e2e` to
// point the suite at a dedicated test database.
if (fs.existsSync(".env.e2e")) loadEnv({ path: ".env.e2e", quiet: true })

// With a dedicated `.env.e2e`, never reuse a server that's already on the port
// (e.g. a `pnpm dev` session) — it would be running against `.env`, not the
// e2e config. Without `.env.e2e`, keep the convenient local reuse.
const hasE2eEnv = fs.existsSync(".env.e2e")

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
    reuseExistingServer: !process.env.CI && !hasE2eEnv,
    timeout: 180_000,
    // Better Auth's rate limiter (max: 10/min against get-session in production)
    // gets exhausted by the suite's many logins/session checks, causing auth
    // bootstrap to fail and shells to bounce back to /login. Disable for e2e.
    env: {
      AUTH_RATE_LIMIT_DISABLED: "1",
      // One trusted proxy hop (see use.extraHTTPHeaders).
      TRUSTED_PROXY_HOPS: "1",
      // No SMTP in e2e, so nothing is actually delivered — the specs read the
      // activation/verification links out of `email_log` instead. Log the
      // (redacted) body too, so a failing run shows the mail in the server
      // console and you can follow a link by hand.
      LOG_EMAIL_BODY: "1",
      // Insert an (unreachable) active mail_config during the seed so routes
      // gated on hasActiveMailConfig() — resend-activation, verify-email — are
      // reachable. Sends still fail, so `email_log` FAILED rows keep the links.
      SEED_MAIL_CONFIG: "1",
    },
  },
})
