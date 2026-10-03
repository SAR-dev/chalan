import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// =============================================================================
// Migration ledger helpers
//
// The runner (`migrate.ts`) uses drizzle's own migrator, which records each
// migration by the SHA-256 of its file content. Older deployments were tracked
// by a hand-rolled runner that stored the *filename* instead, so those rows
// must be translated before drizzle can trust the ledger. The pure planning
// logic lives here so it can be unit-tested without a database.
// =============================================================================

export const MIGRATIONS_DIR = "./drizzle/postgres"
export const MIGRATIONS_SCHEMA = "public"
export const MIGRATIONS_TABLE = "__drizzle_migrations"

export interface JournalEntry {
  tag: string
  when: number
}

export interface LedgerRow {
  id: number
  hash: string
  created_at: number | null
}

export interface ReconcileUpdate {
  id: number
  hash: string
  createdAt: number
}

/** SHA-256 hex of the raw migration file — the digest drizzle stores. */
export function migrationHash(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

export function readJournal(dir = MIGRATIONS_DIR): JournalEntry[] {
  const raw = readFileSync(join(dir, "meta/_journal.json"), "utf-8")
  const parsed = JSON.parse(raw) as { entries: JournalEntry[] }
  return parsed.entries
}

/**
 * Decide which ledger rows predate the content-hash ledger. Rows written by
 * the old runner store the filename (`0000_init.sql`); drizzle stores the
 * file's SHA-256. `hashFor` reads the file content for a tag (null when the
 * file is missing).
 */
export function planLedgerReconciliation(
  rows: LedgerRow[],
  journal: JournalEntry[],
  hashFor: (tag: string) => string | null,
): { updates: ReconcileUpdate[]; unmatched: LedgerRow[] } {
  const byTag = new Map(journal.map((entry) => [entry.tag, entry]))
  const updates: ReconcileUpdate[] = []
  const unmatched: LedgerRow[] = []

  for (const row of rows) {
    if (!row.hash.endsWith(".sql")) continue // already a content hash
    const tag = row.hash.slice(0, -".sql".length)
    const entry = byTag.get(tag)
    const hash = entry ? hashFor(tag) : null
    if (!entry || !hash) {
      unmatched.push(row)
      continue
    }
    updates.push({ id: row.id, hash, createdAt: entry.when })
  }

  return { updates, unmatched }
}
