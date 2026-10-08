/** Scopes a merchant API key may hold. Client-safe — no DB imports. */
export const API_KEY_SCOPES = [
  "orders:read",
  "orders:write",
  "webhooks:read",
  "webhooks:write",
] as const
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return (
    typeof value === "string" &&
    (API_KEY_SCOPES as readonly string[]).includes(value)
  )
}
