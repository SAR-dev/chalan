// Next.js instrumentation hook — runs once when the server process starts,
// before any requests are handled. We use it to validate env vars so the app
// refuses to boot rather than failing mid-request.
//
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only run on the Node.js server, not in the Edge runtime or client bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env")
    validateEnv()

    // Demo mode (NEXT_PUBLIC_ENV=development): re-seed the database with the
    // basic dataset at 12:00 AM local time every day. Only ever under `next
    // dev` — `next start`/builds run with NODE_ENV=production and the seed
    // refuses to run there anyway.
    if (process.env.NODE_ENV !== "production") {
      const { isDevModeEnabled } = await import("@/lib/dev-mode")
      if (isDevModeEnabled()) {
        const { scheduleDemoReset } = await import("@/lib/demo-reset")
        scheduleDemoReset()
      }
    }
  }
}
