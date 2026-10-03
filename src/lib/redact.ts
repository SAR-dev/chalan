// =============================================================================
// Secret redaction for anything that leaves the process as text.
//
// Password-reset links, activation links and 2FA codes are emailed as plain
// URLs. The mailer used to `console.log` the whole rendered body, so every live
// token ended up in container stdout, CI logs and any log aggregator — a
// read-only log viewer could take over an account. These helpers redact the
// secret parts while keeping the message readable for debugging.
// =============================================================================

/** Query parameters whose value is a credential. */
const SECRET_QUERY_KEYS =
  "token|code|key|secret|otp|hash|signature|password|pass|access_token|refresh_token|verify|reset|activation"

const SECRET_QUERY = new RegExp(
  `([?&](?:${SECRET_QUERY_KEYS})=)([^\\s"'<>&)]+)`,
  "gi",
)

// scheme://user:password@host
const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi

const BEARER = /(\bBearer\s+)([A-Za-z0-9._~+/-]{8,}=*)/gi

// Three base64url segments — JWTs (Better Auth verification links).
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g

export const REDACTED = "[redacted]"

/** Replace credentials in free text / HTML with `[redacted]`. */
export function redactSecrets(input: string): string {
  return input
    .replace(SECRET_QUERY, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(URL_USERINFO, (_m, scheme: string) => `${scheme}${REDACTED}@`)
    .replace(BEARER, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(JWT, REDACTED)
}

/**
 * Redact, then bound the length so one huge email cannot flood the log (or the
 * `email_log` row). Truncation is marked so it is obvious in the output.
 */
export function redactAndTruncate(input: string, maxLength = 2_000): string {
  const redacted = redactSecrets(input)
  if (redacted.length <= maxLength) return redacted
  return `${redacted.slice(0, maxLength)}\n… [truncated ${redacted.length - maxLength} chars]`
}
