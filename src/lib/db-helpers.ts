/**
 * Cast a `string[]` to the correct Drizzle enum type for use with `inArray`.
 * Drizzle columns typed with `text("col", { enum: [...] })` expect literal
 * union types, but runtime filter parsers return plain `string[]`. This helper
 * makes the intent explicit while avoiding raw `as any`.
 */
export function enumValues<T extends string>(values: string[]): T[] {
  return values as unknown as T[]
}

/**
 * Validate a single query-param string against a Drizzle enum's value list and
 * narrow it to the literal union type. Returns `null` for any value that isn't
 * a member so an arbitrary `?taskType=` or `?role=` can never reach `eq()`.
 * This is the single-value counterpart to `enumValues()` and avoids `as any`.
 */
export function enumValue<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null {
  if (!value) return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}
