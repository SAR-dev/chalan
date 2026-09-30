import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/csrf"
import { logger } from "@/lib/logger"
import { getRequestId, REQUEST_ID_HEADER } from "@/lib/request-id"

/** Methods that never mutate state and are exempt from the origin check. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

function pathOf(req?: Request): string | undefined {
  if (!req) return undefined
  try {
    return new URL(req.url).pathname
  } catch {
    return undefined
  }
}

/**
 * Wrap a Next.js route handler so any thrown error (e.g. a SQL/FK violation
 * inside a transition) is logged with request context and converted into a
 * structured `{ error, requestId }` 500 — the shape the UI's toast pipeline
 * expects — instead of a bare HTML 500 (ROADMAP P2.2).
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
        return res
      }

      const res = await handler(...args)
      try {
        res.headers.set(REQUEST_ID_HEADER, requestId)
      } catch {
        // Some Response objects have immutable headers — not fatal.
      }
      return res
    } catch (err) {
      logger.error("Unhandled route error", {
        requestId,
        method: req?.method,
        path: pathOf(req),
        err,
      })
      const res = NextResponse.json(
        { error: "Internal server error", requestId },
        { status: 500 },
      )
      res.headers.set(REQUEST_ID_HEADER, requestId)
      return res
    }
  }
}
