import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core"
import { merchant, order, rider, user } from "@/lib/db/schema"

// Storage hygiene (ROADMAP 5.6) — decides which stored uploads are orphans.
//
// A file is an orphan when NO image column references it AND it is older
// than the grace period. The grace period is mandatory: ImageUpload posts to
// /api/uploads on file select, so a freshly uploaded file is legitimately
// unreferenced until the form is submitted.
//
// This module is pure: no fs, no network, no db driver. The caller
// (app/api/cron/cleanup-uploads) injects the column queries and the storage
// listing, which keeps every decision unit-testable.

export type ImageColumnSource = { table: AnyPgTable; column: AnyPgColumn }

// Every schema column that stores an uploaded image reference. Add new image
// columns here and the sweep picks them up.
// Note: rider applications are rows in `rider` (status PENDING) — there is no
// separate rider_application table, so `rider.nid*` covers them.
export const IMAGE_URL_COLUMNS: readonly ImageColumnSource[] = [
  { table: user, column: user.image },
  { table: merchant, column: merchant.logoUrl },
  { table: merchant, column: merchant.nidFrontImage },
  { table: merchant, column: merchant.nidBackImage },
  { table: merchant, column: merchant.nidSelfieImage },
  { table: rider, column: rider.nidFrontImage },
  { table: rider, column: rider.nidBackImage },
  { table: rider, column: rider.nidSelfieImage },
  { table: order, column: order.deliveryProofRef },
  { table: order, column: order.pickupProofRefs },
]

export type SweepFile = { key: string; size: number; lastModified: Date }

export type SweepBases = readonly string[]

// Grace period before an unreferenced upload becomes deletable.
export const DEFAULT_MIN_AGE_HOURS = 48

// Public URL prefixes stored values may carry, so they can be stripped down
// to provider-relative keys: local files are stored as /uploads/... (see
// UPLOADS_URL_PREFIX in lib/storage/local.ts), R2 files as full public URLs.
export function readSweepBases(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const bases = ["/uploads"]
  for (const key of ["R2_PUBLIC_URL"]) {
    const value = env[key]?.trim()
    if (value) bases.push(value)
  }
  return bases
}

// Grace period in hours from UPLOAD_SWEEP_MIN_AGE_HOURS. Anything invalid
// (unset, empty, zero, negative, non-numeric) falls back to the default —
// the sweep must never run with a shorter grace period than intended.
export function readMinAgeHours(
  env: Record<string, string | undefined> = process.env,
): number {
  const parsed = Number(env.UPLOAD_SWEEP_MIN_AGE_HOURS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_AGE_HOURS
}

function stripKnownBase(value: string, bases: SweepBases): string | null {
  for (const base of bases) {
    const trimmed = base.replace(/\/+$/, "")
    if (trimmed === "") continue
    if (value === trimmed) return ""
    // Require a path boundary so https://pub.r2.dev can never swallow
    // https://pub.r2.dev.evil.com/... as a prefix match.
    if (value.startsWith(`${trimmed}/`)) return value.slice(trimmed.length + 1)
  }
  return null
}

/**
 * Normalizes a stored image reference (or a listing key) to a
 * provider-relative key: strips known public-URL bases, query strings,
 * percent-encoding, and leading slashes. Returns null for values that carry
 * no key (null/empty/non-string) so they never protect anything.
 *
 * Both sides of the comparison go through this function, so the comparison
 * is apples-to-apples regardless of how a value was written.
 */
export function normalizeStoredKey(
  raw: unknown,
  bases: SweepBases,
): string | null {
  if (typeof raw !== "string") return null

  let value = raw.trim().replace(/\\/g, "/")
  const suffixAt = value.search(/[?#]/)
  if (suffixAt !== -1) value = value.slice(0, suffixAt)
  if (value === "") return null

  const withoutBase = stripKnownBase(value, bases)
  if (withoutBase !== null) {
    value = withoutBase
  } else if (/^https?:\/\//i.test(value)) {
    // Absolute URL on an unknown host (external avatar, old provider,
    // next-to-localhost dev URL): keep its path so a file sitting at the
    // same location stays protected — false-keeps are safe, false-deletes
    // are not.
    try {
      const pathname = new URL(value).pathname
      value = stripKnownBase(pathname, bases) ?? pathname
    } catch {
      return null
    }
  }

  try {
    value = decodeURIComponent(value)
  } catch {
    // Malformed percent-encoding — compare the raw form instead.
  }

  value = value.replace(/^\/+/, "")
  return value === "" ? null : value
}

// Reads every IMAGE_URL_COLUMNS value (one query per column). Array columns
// such as order.pickupProofRefs come back as arrays and are flattened by
// collectReferencedKeys.
export type ImageValueReader = (source: ImageColumnSource) => Promise<unknown[]>

/**
 * Queries the referenced image columns and normalizes every value into the
 * set of provider-relative keys that must never be deleted.
 */
export async function collectReferencedKeys(
  read: ImageValueReader,
  bases: SweepBases,
): Promise<Set<string>> {
  const keys = new Set<string>()
  for (const source of IMAGE_URL_COLUMNS) {
    const values = await read(source)
    for (const value of values) {
      for (const item of Array.isArray(value) ? value : [value]) {
        const key = normalizeStoredKey(item, bases)
        if (key !== null) keys.add(key)
      }
    }
  }
  return keys
}

export type OrphanCheck = {
  key: string
  lastModified: Date
  referencedKeys: ReadonlySet<string>
  minAgeHours: number
  now: Date
  bases: SweepBases
}

/**
 * Orphan rule: not referenced AND at least `minAgeHours` old. Referenced or
 * fresh files are never orphans.
 */
export function isOrphan(check: OrphanCheck): boolean {
  const key = normalizeStoredKey(check.key, check.bases)
  if (key === null || check.referencedKeys.has(key)) return false

  const ageHours =
    (check.now.getTime() - check.lastModified.getTime()) / 3_600_000
  return ageHours >= check.minAgeHours
}

export type OrphanScan = Omit<OrphanCheck, "key" | "lastModified"> & {
  files: readonly SweepFile[]
}

/**
 * Filters a storage listing down to the orphaned files, in listing order.
 */
export function findOrphans(scan: OrphanScan): SweepFile[] {
  return scan.files.filter((file) =>
    isOrphan({
      key: file.key,
      lastModified: file.lastModified,
      referencedKeys: scan.referencedKeys,
      minAgeHours: scan.minAgeHours,
      now: scan.now,
      bases: scan.bases,
    }),
  )
}
