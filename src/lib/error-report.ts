import { logger, serializeError } from "@/lib/logger"
import { redactSecrets } from "@/lib/redact"

// =============================================================================
// Error reporting (ROADMAP R3.1)
//
// Nothing reported errors anywhere: zero hits for `sentry|opentelemetry|
// prom-client|posthog|newrelic` across the repo, and `@vercel/analytics` is
// imported in `src/app/layout.tsx` while the app deploys to Docker — so it
// reports nothing at all. An unhandled 500 produced one line on stdout that
// nobody was watching.
//
// Deliberately NOT a vendor SDK. Picking Sentry (or anything else) is a
// procurement decision — an account, a plan, a DSN, and a dependency in the
// module graph of every API route. Instead this posts a JSON payload to
// whatever `ERROR_WEBHOOK_URL` points at, which works today with a Slack
// incoming webhook, a Grafana OnCall URL, a self-hosted Gruyère, or nothing at
// all. A vendor can be added *behind* `reportError` later without touching a
// single call site.
//
// Everything here is best-effort: a reporting failure must never be able to
// turn one error into two.
// =============================================================================

const TIMEOUT_MS = 3_000

export interface ErrorReportContext {
  requestId?: string
  method?: string
  path?: string
  [key: string]: unknown
}

function endpoint(): string | null {
  const url = process.env.ERROR_WEBHOOK_URL?.trim()
  return url && /^https?:\/\//.test(url) ? url : null
}

/** Whether a sink is configured — so callers can skip building a payload. */
export function isErrorReportingEnabled(): boolean {
  return endpoint() !== null
}

/**
 * Push one error to the configured sink. Never throws and never blocks the
 * caller: the response has already been decided by the time this runs.
 *
 * Redacted with the same helper as the logger — a webhook is another place a
 * reset link or 2FA code must not end up (ROADMAP P0.7).
 */
export function reportError(err: unknown, context: ErrorReportContext): void {
  const url = endpoint()
  if (!url) return

  const serialized = serializeError(err)
  const payload = JSON.stringify({
    level: "error",
    time: new Date().toISOString(),
    message: serialized.message,
    ...(serialized.stack ? { stack: serialized.stack } : {}),
    context: redactFields(context),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    signal: controller.signal,
  })
    .catch((reportErr: unknown) => {
      logger.debug("error report not delivered", { err: reportErr })
    })
    .finally(() => clearTimeout(timer))
}

function redactFields(context: ErrorReportContext): ErrorReportContext {
  const out: ErrorReportContext = {}
  for (const [key, value] of Object.entries(context)) {
    out[key] = typeof value === "string" ? redactSecrets(value) : value
  }
  return out
}
