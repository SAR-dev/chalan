import { serverError } from "@/lib/api-response"

/**
 * Wrap a Next.js route handler so any thrown error (e.g. a SQL/FK violation
 * inside a transition) is converted into a structured `{ error }` 500 — the
 * shape the UI's toast pipeline expects — instead of a bare HTML 500.
 */
export function withErrorHandler<
  Args extends unknown[],
  Result extends Response | Promise<Response>,
>(handler: (...args: Args) => Result): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (err) {
      console.error("[api] Unhandled route error:", err)
      return serverError()
    }
  }
}