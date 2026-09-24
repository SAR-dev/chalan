export interface EntityDiff {
  [field: string]: { from: unknown; to: unknown }
}

function isEmptyDiffValue(value: unknown): boolean {
  return value === null || value === undefined || value === ""
}

function normalizeDiffValue(value: unknown): unknown {
  return value === undefined ? null : value
}

function diffValuesEqual(a: unknown, b: unknown): boolean {
  if (isEmptyDiffValue(a) && isEmptyDiffValue(b)) return true
  if (Object.is(a, b)) return true
  if (
    typeof a === "object" &&
    typeof b === "object" &&
    a !== null &&
    b !== null
  ) {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return false
}

export function diffEntity(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): EntityDiff | null {
  const diff: EntityDiff = {}
  for (const field of fields) {
    const from = before?.[field]
    const to = after?.[field]
    if (diffValuesEqual(from, to)) continue
    diff[field] = {
      from: normalizeDiffValue(from),
      to: normalizeDiffValue(to),
    }
  }
  return Object.keys(diff).length > 0 ? diff : null
}
