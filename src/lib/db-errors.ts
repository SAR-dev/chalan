/**
 * Postgres error classification.
 *
 * Unique indexes are the backstop for check-then-write flows: the route still
 * checks first so it can return a friendly message, but two concurrent
 * requests can both pass that check and the database is what actually decides.
 * These helpers let a route translate the resulting SQLSTATE into the right
 * HTTP response instead of a 500.
 */

/** 23505 — unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return sqlState(err) === "23505"
}

/** 23503 — foreign_key_violation. */
export function isForeignKeyViolation(err: unknown): boolean {
  return sqlState(err) === "23503"
}

/** 40001 — serialization_failure, 40P01 — deadlock_detected. */
export function isSerializationFailure(err: unknown): boolean {
  const state = sqlState(err)
  return state === "40001" || state === "40P01"
}

/** Name of the index that rejected the write, when the driver reports it. */
export function violatedConstraint(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null
  const value = (err as { constraint?: unknown }).constraint
  return typeof value === "string" ? value : null
}

function sqlState(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null
  const code = (err as { code?: unknown }).code
  return typeof code === "string" ? code : null
}
