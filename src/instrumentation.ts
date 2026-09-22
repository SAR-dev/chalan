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
  }
}
