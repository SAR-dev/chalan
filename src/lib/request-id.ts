// Request correlation id (ROADMAP P2.2).
//
// The edge proxy mints/forwards `x-request-id` for the routes it matches; every
// other API route mints one on demand here so a 500 can be tied to its log
// line. The id is echoed on the response so a client can quote it in a report.

export const REQUEST_ID_HEADER = "x-request-id"

// A conservative shape: opaque, URL/log-safe, bounded length. An inbound value
// that doesn't match is ignored (regenerated) so a client can't inject
// arbitrary text into logs.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && VALID_REQUEST_ID.test(value)
}

export function mintRequestId(): string {
  return crypto.randomUUID()
}

/** Reuse a valid inbound id, otherwise mint a fresh one. */
export function resolveRequestId(
  headerValue: string | null | undefined,
): string {
  return isValidRequestId(headerValue) ? headerValue : mintRequestId()
}

/** Read the correlation id from a request, minting one when absent/invalid. */
export function getRequestId(req: Request | undefined | null): string {
  return resolveRequestId(req?.headers.get(REQUEST_ID_HEADER))
}
