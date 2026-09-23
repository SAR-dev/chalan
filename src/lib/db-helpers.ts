/**
 * Cast a `string[]` to the correct Drizzle enum type for use with `inArray`.
 * Drizzle columns typed with `text("col", { enum: [...] })` expect literal
 * union types, but runtime filter parsers return plain `string[]`. This helper
 * makes the intent explicit while avoiding raw `as any`.
 */
export function enumValues<T extends string>(values: string[]): T[] {
  return values as unknown as T[]
}
