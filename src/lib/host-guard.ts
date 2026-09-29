// Guards against server-side request forgery (SSRF).
//
// Some endpoints let an operator supply an outbound host — the SMTP test
// connection is the main one. Without a guard, that is a port-scanning and
// internal-service-probing primitive. A full defence needs DNS resolution plus
// an allowlist; blocking the well-known internal ranges and names is the
// proportionate, dependency-free layer for a SUPER_ADMIN-only tool.

const PRIVATE_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/,
  /^127\./, // IPv4 loopback
  /^0\./, // "this network"
  /^10\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918
  /^169\.254\./, // link-local
  /^::1$/, // IPv6 loopback
  /^f[cd][0-9a-f]{2}:/, // IPv6 unique-local
  /^fe80:/, // IPv6 link-local
  /\.local$/,
  /\.internal$/,
  /\.localhost$/,
]

/**
 * True when `host` is — or looks like — an internal address that an
 * operator-supplied outbound connection must not reach. An empty or blank host
 * is also treated as unsafe so a missing value can never mean "anywhere".
 */
export function isPrivateHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
  if (normalized === "") return true
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
}
