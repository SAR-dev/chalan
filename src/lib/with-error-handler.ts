import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/csrf"
import { reportError } from "@/lib/error-report"
import { type Logger, logger } from "@/lib/logger"
import { getRequestId, REQUEST_ID_HEADER } from "@/lib/request-id"

/** Methods that never mutate state and are exempt from the origin check. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * A request at or above this is worth a line even when it succeeded.
 * Below it, success is `debug` - visible with `LOG_LEVEL=debug`, quiet
 * otherwise, because SWR polls and a default `info` would bury the signal in
 * traffic.
 */
const SLOW_REQUEST_MS = 1_000

function pathOf(req?: Request): string | undefined {
  if (!req) return undefined
  try {
    return new URL(req.url).pathname
  } catch {
    return undefined
  }
}

/**
 * The access log. There was none: only unhandled 500s produced a line, so
 * there was no 4xx record, no route latency, and no slow-request signal at all
 */
function logResponse(log: Logger, status: number, durationMs: number): void {
  if (status >= 500) log.error("request failed", { status, durationMs })
  else if (status >= 400) log.warn("request rejected", { status, durationMs })
  else if (durationMs >= SLOW_REQUEST_MS) {
    log.warn("slow request", { status, durationMs })
  } else log.debug("request", { status, durationMs })
}

/**
 * Wrap a Next.js route handler so any thrown error (e.g. a SQL/FK violation
 * inside a transition) is logged with request context and converted into a
 * structured `{ error, requestId }` 500 — the shape the UI's toast pipeline
 * Expects — instead of a bare HTML 500.
 *
 * Every response (success or failure) also carries the `x-request-id` header so
 * a client can quote the id when reporting a problem.
 *
 * State-changing requests are also origin-checked here. `parseBody` already
 * checks the origin, but a mutation with **no body** (approve, suspend,
 * activate, every DELETE) never reaches it and previously relied on the
 * SameSite cookie alone. Doing it centrally means no route can forget.
 */
export function withErrorHandler<
  Args extends unknown[],
  Result extends Response | Promise<Response>,
>(handler: (...args: Args) => Result): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    const req = args[0] as Request | undefined
    const requestId = getRequestId(req)
    const method = req?.method
    const path = pathOf(req)
    // One child logger per request: `logger.child` existed but
    // was called nowhere, so context had to be restated on every line.
    const log = logger.child({ requestId, method, path })
    const startedAt = Date.now()
    try {
      if (
        req?.method &&
        !SAFE_METHODS.has(req.method) &&
        !isAllowedOrigin(req)
      ) {
        const res = NextResponse.json(
          { error: "Invalid request origin" },
          { status: 403 },
        )
        res.headers.set(REQUEST_ID_HEADER, requestId)
        logResponse(log, 403, Date.now() - startedAt)
        return res
      }

      const res = await handler(...args)
      try {
        res.headers.set(REQUEST_ID_HEADER, requestId)
      } catch {
        // Some Response objects have immutable headers — not fatal.
      }
      logResponse(log, res.status, Date.now() - startedAt)
      return res
    } catch (err) {
      const durationMs = Date.now() - startedAt
      log.error("Unhandled route error", { err, durationMs })
      // The log line only helps if something is watching it. When a sink is
      // Configured this pushes the same redacted payload to it.
      reportError(err, { requestId, method, path, durationMs })
      const res = NextResponse.json(
        { error: "Internal server error", requestId },
        { status: 500 },
      )
      res.headers.set(REQUEST_ID_HEADER, requestId)
      return res
    }
  }
}
